"""EnvironmentDirectorSystem — environment-director channel (Python port).

The system is a thin orchestrator around the four operational concerns:

1. Cadence gate (``state.ai["lastEnvironmentDecisionSec"]`` vs
   :data:`DEFAULT_ENVIRONMENT_INTERVAL_SEC`).
2. ``PromptPayload`` construction (world summary + memory snippets +
   highlights).
3. Adapter call via :meth:`AgentAdapter.request` (no UI/Three.js, no menu
   post-validation — those were dropped per the RC3 audit).
4. Response validation against
   :class:`~project_utopia.simulation.ai.llm.response_schema.EnvironmentDirective`,
   guardrail clamp, fallback on failure.

The deterministic fallback is a 2-rule policy (food crisis → ``clear``,
otherwise the previous weather is held). It matches the JS
``buildFallbackEnvironment`` behaviour but without the chronicle copy.

Tick contract::

    system.update(dt, state, services)

The system schedules its async adapter call synchronously inside ``update``
using :func:`asyncio.run` because the simulation harness is itself sync — the
async boundary lives only here. Tests can pass a ``NoopAgentAdapter`` (or any
mock) on ``services.agent_adapter`` to exercise the fallback path.
"""

from __future__ import annotations

import asyncio
import math
from typing import Any

from ...ai.llm.agent_adapter import AgentAdapter, DecisionResponse
from ...ai.llm.guardrails import guard_environment_directive
from ...ai.llm.prompt_payload import PromptPayload
from ...ai.llm.response_schema import EnvironmentDirective
from ....app.ai_runtime_stats import (
    classify_ai_error_message,
    ensure_ai_runtime_stats,
    get_ai_coverage_target,
)

DEFAULT_ENVIRONMENT_INTERVAL_SEC: float = 8.0
"""Default cadence (seconds) between environment-director decisions."""

_NEVER_SEC: float = -999.0


# ---------------------------------------------------------------------------
# Fallback policy (deterministic)
# ---------------------------------------------------------------------------


def build_fallback_environment_directive(state: dict[str, Any]) -> dict[str, Any]:
    """Build a deterministic environment directive when the LLM is unavailable.

    Replaces the JS ``services.fallbackEnvironment`` + ``buildEnvironmentMenu``
    composition with the simpler rules the academic-benchmark RC3 audit
    blessed:

    - Food crisis (``food < 20``) → ``weather=clear``, no event spawns.
    - High threat (``threat >= 60``) → ``weather=clear``, ``factionTension=0.7``.
    - Stable → keep the prior weather (or ``clear`` if unset), low tension.

    The output is a plain ``dict`` (camelCase keys) so it flows through
    :func:`guard_environment_directive` exactly like a raw adapter response.
    """
    resources = state.get("resources") if isinstance(state, dict) else {}
    if not isinstance(resources, dict):
        resources = {}
    food = float(resources.get("food", 100) or 0)

    gameplay = state.get("gameplay") if isinstance(state, dict) else {}
    if not isinstance(gameplay, dict):
        gameplay = {}
    threat = float(gameplay.get("threat", 0) or 0)

    weather_state = state.get("weather") if isinstance(state, dict) else {}
    if not isinstance(weather_state, dict):
        weather_state = {}
    current_weather = str(weather_state.get("current") or "clear")
    if current_weather not in ("clear", "rain", "storm", "drought", "winter"):
        current_weather = "clear"

    if food < 20:
        return {
            "weather": "clear",
            "durationSec": 18,
            "factionTension": 0.3,
            "eventSpawns": [],
            "focus": "stable frontier",
            "summary": "Food crisis — hold weather calm and pause pressure events.",
            "steeringNotes": ["Avoid stacking pressure on a starving colony."],
        }
    if threat >= 60:
        return {
            "weather": "clear",
            "durationSec": 20,
            "factionTension": 0.7,
            "eventSpawns": [],
            "focus": "stable frontier",
            "summary": "High threat — keep weather calm; pressure is already on-frontier.",
            "steeringNotes": ["Let raid pressure breathe; do not stack weather."],
        }
    return {
        "weather": current_weather,
        "durationSec": 24,
        "factionTension": 0.4,
        "eventSpawns": [],
        "focus": "stable frontier",
        "summary": "Stable cadence — hold prior weather.",
        "steeringNotes": ["Prefer scenario-linked pressure over noise."],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_ai_slot(state: dict[str, Any]) -> dict[str, Any]:
    """Ensure ``state["ai"]`` exists and contains the keys this system writes."""
    ai = state.get("ai")
    if not isinstance(ai, dict):
        ai = {}
        state["ai"] = ai
    ai.setdefault("enabled", True)
    ai.setdefault("coverageTarget", ai.get("coverageTarget") or "fallback")
    ai.setdefault("lastEnvironmentDecisionSec", _NEVER_SEC)
    ai.setdefault("environmentDecisionCount", 0)
    ai.setdefault("environmentLlmCount", 0)
    ai.setdefault("environment_directive", None)
    return ai


def _wants_llm(state: dict[str, Any]) -> bool:
    """Return True iff the LLM path should be attempted.

    Honours both the legacy JS field ``state.ai["coverageTarget"]`` and the
    Python-side ``state.ai["run_mode"]``. D5 gate: if ``run_mode == "llm"``
    but no adapter is wired, the caller falls back automatically.
    """
    ai = state.get("ai") if isinstance(state, dict) else {}
    if not isinstance(ai, dict):
        return False
    if ai.get("enabled") is False:
        return False
    run_mode = ai.get("run_mode")
    if isinstance(run_mode, str):
        return run_mode.strip().lower() == "llm"
    return get_ai_coverage_target(state) == "llm"


def _time_sec(state: dict[str, Any]) -> float:
    metrics = state.get("metrics") if isinstance(state, dict) else {}
    if not isinstance(metrics, dict):
        return 0.0
    val = metrics.get("timeSec", 0)
    try:
        v = float(val)
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def _summary_from_state(state: dict[str, Any]) -> dict[str, Any]:
    """Compact world summary fed to the prompt payload.

    Phase-2 keeps this minimal — the full ``build_world_summary`` lives in
    :mod:`project_utopia.simulation.ai.memory.world_summary` and is invoked
    by the harness; this helper is a tolerant shim so the System can run in
    isolation (and in tests) without a fully-populated state.
    """
    world: dict[str, Any] = {}
    for key in (
        "resources",
        "gameplay",
        "weather",
        "events",
        "buildings",
        "population",
        "scenario",
    ):
        value = state.get(key) if isinstance(state, dict) else None
        if value is not None:
            world[key] = value
    return {"world": world}


def _record_request(state: dict[str, Any], stats: dict[str, Any], now: float) -> None:
    stats["requestCount"] = int(stats.get("requestCount", 0)) + 1
    stats["environmentRequests"] = int(stats.get("environmentRequests", 0)) + 1
    stats["lastRequestSec"] = float(now)


def _record_response(
    state: dict[str, Any],
    stats: dict[str, Any],
    *,
    response: DecisionResponse,
    now: float,
    fallback: bool,
    error: str,
) -> None:
    stats["responseCount"] = int(stats.get("responseCount", 0)) + 1
    stats["environmentResponses"] = int(stats.get("environmentResponses", 0)) + 1
    latency = float(response.latency_ms or 0.0)
    stats["lastLatencyMs"] = latency
    # rolling avg of latency
    prior_avg = float(stats.get("avgLatencyMs", 0.0) or 0.0)
    count = int(stats.get("responseCount", 1)) or 1
    stats["avgLatencyMs"] = prior_avg + (latency - prior_avg) / max(1, count)
    stats["lastResponseSec"] = float(now)
    if fallback:
        stats["fallbackResponseCount"] = int(stats.get("fallbackResponseCount", 0)) + 1
        stats["lastFallbackSec"] = float(now)
        stats["consecutiveFallbackResponses"] = (
            int(stats.get("consecutiveFallbackResponses", 0)) + 1
        )
        stats["lastResultSource"] = "fallback"
    else:
        stats["llmResponseCount"] = int(stats.get("llmResponseCount", 0)) + 1
        stats["lastLiveSec"] = float(now)
        stats["consecutiveFallbackResponses"] = 0
        stats["lastResultSource"] = "llm"
    if error:
        stats["errorCount"] = int(stats.get("errorCount", 0)) + 1
        stats["lastErrorKind"] = classify_ai_error_message(error)
        stats["lastErrorMessage"] = str(error)[:200]
    if response.usage is not None:
        usage = response.usage
        stats["promptTokens"] = int(stats.get("promptTokens", 0)) + int(
            getattr(usage, "prompt_tokens", 0) or 0
        )
        stats["completionTokens"] = int(stats.get("completionTokens", 0)) + int(
            getattr(usage, "completion_tokens", 0) or 0
        )
        stats["cachedTokens"] = int(stats.get("cachedTokens", 0)) + int(
            getattr(usage, "cached_tokens", 0) or 0
        )


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------


class EnvironmentDirectorSystem:
    """environment-director channel as a tick-driven System.

    Args:
        interval_sec: Cadence between decisions (default 8s).
        run_async: When True (default), the system uses ``asyncio.run`` to
            await the adapter request. Tests injecting an awaitable mock can
            keep this on; tests using a sync mock can set it to False.
    """

    name: str = "EnvironmentDirectorSystem"

    def __init__(
        self,
        *,
        interval_sec: float = DEFAULT_ENVIRONMENT_INTERVAL_SEC,
    ) -> None:
        self.interval_sec = float(interval_sec)

    # -- public tick ---------------------------------------------------------

    def update(self, dt: float, state: dict[str, Any], services: Any) -> None:
        """Tick the system. ``dt`` is unused but kept for the harness contract."""
        del dt  # cadence is derived from state.metrics.timeSec
        ai = _ensure_ai_slot(state)
        stats = ensure_ai_runtime_stats(state)
        now = _time_sec(state)

        # Cadence gate -----------------------------------------------------
        last = float(ai.get("lastEnvironmentDecisionSec", _NEVER_SEC))
        if last > _NEVER_SEC and (now - last) < self.interval_sec:
            return
        ai["lastEnvironmentDecisionSec"] = now

        _record_request(state, stats, now)

        # Build payload ----------------------------------------------------
        summary = _summary_from_state(state)
        payload = PromptPayload(
            summary=summary,
            operational_highlights=[],  # consumer recomputes from summary
            memory_snippets=_collect_memory_snippets(services, now),
            tick=int(state.get("metrics", {}).get("tick", 0) or 0),
            time_sec=now,
        )

        wants_llm = _wants_llm(state)
        adapter: AgentAdapter | None = getattr(services, "agent_adapter", None)

        # D5 gate: requested LLM but nothing wired → straight to fallback.
        if not wants_llm or adapter is None:
            self._apply_fallback(state, ai, stats, now, error="")
            return

        # Adapter call (async at the boundary) -----------------------------
        try:
            response = _run_adapter(adapter, "environment-director", payload)
        except BaseException as err:  # noqa: BLE001 — adapter must never throw
            self._apply_fallback(state, ai, stats, now, error=str(err) or err.__class__.__name__)
            return

        if response.fallback or response.data is None:
            self._apply_fallback(state, ai, stats, now, response=response)
            return

        # Validate + guard -------------------------------------------------
        from pydantic import ValidationError

        try:
            validated = EnvironmentDirective.model_validate(response.data)
        except ValidationError as err:
            guarded = guard_environment_directive(response.data)
            self._commit_directive(ai, stats, now, guarded, fallback=False, source="guarded")
            _record_response(
                state, stats, response=response, now=now, fallback=True, error=f"schema: {err}"
            )
            return

        guarded = guard_environment_directive(validated.model_dump(by_alias=False))
        self._commit_directive(ai, stats, now, guarded, fallback=False, source="llm")
        _record_response(state, stats, response=response, now=now, fallback=False, error="")

    # -- fallback path -------------------------------------------------------

    def _apply_fallback(
        self,
        state: dict[str, Any],
        ai: dict[str, Any],
        stats: dict[str, Any],
        now: float,
        *,
        error: str = "",
        response: DecisionResponse | None = None,
    ) -> None:
        raw = build_fallback_environment_directive(state)
        guarded = guard_environment_directive(raw)
        self._commit_directive(ai, stats, now, guarded, fallback=True, source="fallback")
        if response is None:
            stub = DecisionResponse(fallback=True, model="fallback", latency_ms=0.0, error=error)
            _record_response(state, stats, response=stub, now=now, fallback=True, error=error)
        else:
            _record_response(
                state,
                stats,
                response=response,
                now=now,
                fallback=True,
                error=error or response.error,
            )

    # -- write directive into state -----------------------------------------

    def _commit_directive(
        self,
        ai: dict[str, Any],
        stats: dict[str, Any],
        now: float,
        directive: EnvironmentDirective,
        *,
        fallback: bool,
        source: str,
    ) -> None:
        ai["environment_directive"] = directive.model_dump(by_alias=False)
        ai["lastEnvironmentDirective"] = directive.model_dump(by_alias=True)
        ai["environmentDecisionCount"] = int(ai.get("environmentDecisionCount", 0)) + 1
        if not fallback:
            ai["environmentLlmCount"] = int(ai.get("environmentLlmCount", 0)) + 1
        ai["lastEnvironmentSource"] = source
        ai["lastEnvironmentResultSec"] = float(now)
        ai["mode"] = "fallback" if fallback else "llm"
        del stats  # already-mutated by caller


# ---------------------------------------------------------------------------
# Adapter execution helper
# ---------------------------------------------------------------------------


def _run_adapter(
    adapter: AgentAdapter,
    channel: str,
    payload: PromptPayload,
) -> DecisionResponse:
    """Invoke ``adapter.request`` synchronously.

    The simulation tick is synchronous; the adapter contract is async. We
    isolate the boundary here so the rest of the system stays sync and easy
    to test.

    Implementation: always build a fresh event loop, run the coroutine to
    completion, close the loop. This is safe to call from synchronous test
    paths and from the sync harness; tests that need to *inject* an async
    mock should make their ``request`` an ``async def`` returning a
    :class:`DecisionResponse`.
    """
    coro = adapter.request(channel, payload, None)  # type: ignore[arg-type]
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _collect_memory_snippets(services: Any, now: float) -> list[str]:
    """Return up to 8 short memory snippets if ``services.memory_store`` is wired."""
    store = getattr(services, "memory_store", None) if services is not None else None
    if store is None or not hasattr(store, "format_for_prompt"):
        return []
    try:
        text = store.format_for_prompt(limit=8, current_sim_sec=now)
    except TypeError:
        # Older signatures.
        try:
            text = store.format_for_prompt(8)
        except Exception:  # noqa: BLE001
            return []
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(text, str) or not text.strip():
        return []
    return [line for line in text.splitlines() if line.strip()][:8]


__all__ = [
    "DEFAULT_ENVIRONMENT_INTERVAL_SEC",
    "EnvironmentDirectorSystem",
    "build_fallback_environment_directive",
]
