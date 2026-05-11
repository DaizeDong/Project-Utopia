"""ColonyAgentSystem — colony-agent channel (Python port).

The system emits a ``list[ColonyPlanStep]`` describing the next ~5-10 tactical
actions the colony director should attempt. Cadence is sim-time-gated
(default 2s) plus a plan-stall trigger: if the active plan made no progress
within :data:`DEFAULT_COLONY_PLAN_STALL_SEC` seconds, the channel re-fires
even before the next scheduled tick.

Drops (per RC3 audit):
    * Perceiver formatting and feature extraction.
    * Plan evaluator scoring and reflection generation.
    * LearnedSkillLibrary, PlacementSpecialist, BuildSystem proposers —
      these are evaluation/scoring side concerns, not runtime-loop ones.

The Perceive→Plan→Ground→Execute→Evaluate→Reflect pipeline collapses to:
    Observe (state slice) → Plan (LLM call) → Validate → Commit
"""

from __future__ import annotations

import math
from typing import Any

from pydantic import TypeAdapter, ValidationError

from ...ai.llm.agent_adapter import AgentAdapter, DecisionResponse
from ...ai.llm.prompt_payload import PromptPayload
from ...ai.llm.response_schema import ColonyPlanStep
from ....app.ai_runtime_stats import (
    classify_ai_error_message,
    ensure_ai_runtime_stats,
    get_ai_coverage_target,
)

DEFAULT_COLONY_AGENT_INTERVAL_SEC: float = 2.0
"""Minimum seconds between colony-agent ticks (default 2s)."""

DEFAULT_COLONY_PLAN_STALL_SEC: float = 18.0
"""Seconds an active plan may stall before forcing a replan (matches JS S5)."""

_NEVER_SEC: float = -999.0

_PLAN_STEPS_ADAPTER: TypeAdapter[list[ColonyPlanStep]] = TypeAdapter(list[ColonyPlanStep])


# ---------------------------------------------------------------------------
# Fallback plan (deterministic)
# ---------------------------------------------------------------------------


def _num(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    return v


def build_fallback_colony_plan(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Build a deterministic colony plan when the LLM is unavailable.

    Branches mirror the JS ``generateFallbackPlan`` logic (compressed):

    - food crisis → build farm,
    - missing warehouse → build warehouse,
    - normal growth → build the next missing chain link (farm → lumber →
      quarry → smithy).

    Returns a list of raw step dicts (camelCase keys); the caller validates
    via :class:`ColonyPlanStep`.
    """
    resources = state.get("resources") or {}
    if not isinstance(resources, dict):
        resources = {}
    buildings = state.get("buildings") or {}
    if not isinstance(buildings, dict):
        buildings = {}
    gameplay = state.get("gameplay") or {}
    if not isinstance(gameplay, dict):
        gameplay = {}

    food = _num(resources.get("food", 100))
    threat = _num(gameplay.get("threat", 0))
    farms = _num(buildings.get("farms", 0))
    warehouses = _num(buildings.get("warehouses", 0))
    lumbers = _num(buildings.get("lumbers", 0))
    quarries = _num(buildings.get("quarries", 0))
    smithies = _num(buildings.get("smithies", 0))

    if food < 15:
        return [
            {"action": "build", "args": {"kind": "farm"}, "dependsOn": []},
            {"action": "build", "args": {"kind": "warehouse"}, "dependsOn": []},
        ]
    if warehouses < 1:
        return [{"action": "build", "args": {"kind": "warehouse"}, "dependsOn": []}]
    if threat > 75:
        return [{"action": "build", "args": {"kind": "wall"}, "dependsOn": []}]
    if farms < 4:
        return [{"action": "build", "args": {"kind": "farm"}, "dependsOn": []}]
    if lumbers < 1:
        return [{"action": "build", "args": {"kind": "lumber"}, "dependsOn": []}]
    if quarries < 1:
        return [{"action": "build", "args": {"kind": "quarry"}, "dependsOn": []}]
    if smithies < 1:
        return [{"action": "build", "args": {"kind": "smithy"}, "dependsOn": []}]
    return [{"action": "build", "args": {"kind": "farm"}, "dependsOn": []}]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_ai_slot(state: dict[str, Any]) -> dict[str, Any]:
    ai = state.get("ai")
    if not isinstance(ai, dict):
        ai = {}
        state["ai"] = ai
    ai.setdefault("enabled", True)
    ai.setdefault("coverageTarget", ai.get("coverageTarget") or "fallback")
    ai.setdefault("lastColonyAgentSec", _NEVER_SEC)
    ai.setdefault("colonyAgentDecisionCount", 0)
    ai.setdefault("colonyAgentLlmCount", 0)
    ai.setdefault("colony_plan", [])
    ai.setdefault("colonyAgentPlanStalledSinceSec", None)
    return ai


def _wants_llm(state: dict[str, Any]) -> bool:
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
    try:
        v = float(metrics.get("timeSec", 0))
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def _plan_stalled(ai: dict[str, Any], now: float, stall_sec: float) -> bool:
    """Return True iff the active plan has not progressed within ``stall_sec``."""
    plan = ai.get("colony_plan") or []
    if not isinstance(plan, list) or not plan:
        return False
    stalled_since = ai.get("colonyAgentPlanStalledSinceSec")
    if stalled_since is None:
        return False
    try:
        ts = float(stalled_since)
    except (TypeError, ValueError):
        return False
    return (now - ts) >= float(stall_sec)


def _summary_from_state(state: dict[str, Any]) -> dict[str, Any]:
    world: dict[str, Any] = {}
    for key in ("resources", "gameplay", "buildings", "weather", "population", "scenario"):
        value = state.get(key) if isinstance(state, dict) else None
        if value is not None:
            world[key] = value
    return {"world": world}


def _record_request(stats: dict[str, Any], now: float) -> None:
    stats["requestCount"] = int(stats.get("requestCount", 0)) + 1
    stats["lastRequestSec"] = float(now)


def _record_response(
    stats: dict[str, Any],
    *,
    response: DecisionResponse,
    now: float,
    fallback: bool,
    error: str,
) -> None:
    stats["responseCount"] = int(stats.get("responseCount", 0)) + 1
    latency = float(response.latency_ms or 0.0)
    stats["lastLatencyMs"] = latency
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


def _coerce_steps(raw: Any) -> list[Any]:
    """Accept either a bare list of steps or ``{"steps": [...]}``."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        steps = raw.get("steps")
        if isinstance(steps, list):
            return steps
    return []


def _sanitize_steps(raw: list[Any]) -> list[ColonyPlanStep]:
    """Drop malformed step dicts and return validated :class:`ColonyPlanStep` list.

    Bad entries are silently skipped (clamp-style behaviour matching the
    guardrails contract); a step with a non-string ``action`` is rejected.
    """
    out: list[ColonyPlanStep] = []
    for entry in raw[:32]:  # cap at 32 steps
        if not isinstance(entry, dict):
            continue
        try:
            step = ColonyPlanStep.model_validate(entry)
        except ValidationError:
            continue
        out.append(step)
    return out


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------


class ColonyAgentSystem:
    """colony-agent channel as a tick-driven System.

    Args:
        interval_sec: Minimum seconds between scheduled ticks (default 2s).
        plan_stall_sec: Seconds the active plan may stall before forcing a
            replan (default 18s).
    """

    name: str = "ColonyAgentSystem"

    def __init__(
        self,
        *,
        interval_sec: float = DEFAULT_COLONY_AGENT_INTERVAL_SEC,
        plan_stall_sec: float = DEFAULT_COLONY_PLAN_STALL_SEC,
    ) -> None:
        self.interval_sec = float(interval_sec)
        self.plan_stall_sec = float(plan_stall_sec)

    def mark_plan_stalled(self, state: dict[str, Any]) -> None:
        """Record that the active plan has not progressed.

        Called by the executor when a step blocks on ``waiting_resources``
        (or any other reason). The next :meth:`update` invocation will force
        a replan if the stall persists past :data:`DEFAULT_COLONY_PLAN_STALL_SEC`.
        """
        ai = _ensure_ai_slot(state)
        if ai.get("colonyAgentPlanStalledSinceSec") is None:
            ai["colonyAgentPlanStalledSinceSec"] = _time_sec(state)

    def clear_plan_stall(self, state: dict[str, Any]) -> None:
        """Reset the stall timer (call when a step completed)."""
        ai = _ensure_ai_slot(state)
        ai["colonyAgentPlanStalledSinceSec"] = None

    def update(self, dt: float, state: dict[str, Any], services: Any) -> None:
        del dt
        ai = _ensure_ai_slot(state)
        stats = ensure_ai_runtime_stats(state)
        now = _time_sec(state)

        last = float(ai.get("lastColonyAgentSec", _NEVER_SEC))
        elapsed_since_last = now - last if last > _NEVER_SEC else math.inf
        stalled = _plan_stalled(ai, now, self.plan_stall_sec)

        if not stalled and elapsed_since_last < self.interval_sec:
            return
        ai["lastColonyAgentSec"] = now
        if stalled:
            # Crisis replan — reset stall timer once we've actually re-fired.
            ai["colonyAgentPlanStalledSinceSec"] = None

        _record_request(stats, now)

        payload = PromptPayload(
            summary=_summary_from_state(state),
            operational_highlights=[],
            memory_snippets=_collect_memory_snippets(services, now),
            tick=int(state.get("metrics", {}).get("tick", 0) or 0),
            time_sec=now,
        )

        wants_llm = _wants_llm(state)
        adapter: AgentAdapter | None = getattr(services, "agent_adapter", None)

        if not wants_llm or adapter is None:
            self._apply_fallback(state, ai, stats, now, error="")
            return

        from ..director.environment_director_system import _run_adapter  # avoid cycle

        try:
            response = _run_adapter(adapter, "colony-agent", payload)
        except BaseException as err:  # noqa: BLE001
            self._apply_fallback(
                state, ai, stats, now, error=str(err) or err.__class__.__name__
            )
            return

        if response.fallback or response.data is None:
            self._apply_fallback(state, ai, stats, now, response=response)
            return

        raw_steps = _coerce_steps(response.data)
        try:
            steps = _PLAN_STEPS_ADAPTER.validate_python(raw_steps)
        except ValidationError as err:
            # Partial salvage: keep the valid entries, drop the malformed ones.
            steps = _sanitize_steps(raw_steps)
            if not steps:
                self._apply_fallback(
                    state, ai, stats, now, response=response, error=f"schema: {err}"
                )
                return
            self._commit_plan(ai, now, steps, fallback=False, source="guarded")
            _record_response(
                stats, response=response, now=now, fallback=True, error=f"schema: {err}"
            )
            return

        self._commit_plan(ai, now, steps, fallback=False, source="llm")
        _record_response(stats, response=response, now=now, fallback=False, error="")

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
        raw = build_fallback_colony_plan(state)
        steps = _sanitize_steps(raw)
        self._commit_plan(ai, now, steps, fallback=True, source="fallback")
        if response is None:
            stub = DecisionResponse(fallback=True, model="fallback", latency_ms=0.0, error=error)
            _record_response(stats, response=stub, now=now, fallback=True, error=error)
        else:
            _record_response(
                stats,
                response=response,
                now=now,
                fallback=True,
                error=error or response.error,
            )

    # -- write plan into state ----------------------------------------------

    def _commit_plan(
        self,
        ai: dict[str, Any],
        now: float,
        steps: list[ColonyPlanStep],
        *,
        fallback: bool,
        source: str,
    ) -> None:
        ai["colony_plan"] = [step.model_dump(by_alias=False) for step in steps]
        ai["lastColonyPlan"] = [step.model_dump(by_alias=True) for step in steps]
        ai["colonyAgentDecisionCount"] = int(ai.get("colonyAgentDecisionCount", 0)) + 1
        if not fallback:
            ai["colonyAgentLlmCount"] = int(ai.get("colonyAgentLlmCount", 0)) + 1
        ai["lastColonyAgentSource"] = source
        ai["mode"] = "fallback" if fallback else "llm"


def _collect_memory_snippets(services: Any, now: float) -> list[str]:
    store = getattr(services, "memory_store", None) if services is not None else None
    if store is None or not hasattr(store, "format_for_prompt"):
        return []
    try:
        text = store.format_for_prompt(limit=8, current_sim_sec=now)
    except TypeError:
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
    "ColonyAgentSystem",
    "DEFAULT_COLONY_AGENT_INTERVAL_SEC",
    "DEFAULT_COLONY_PLAN_STALL_SEC",
    "build_fallback_colony_plan",
]
