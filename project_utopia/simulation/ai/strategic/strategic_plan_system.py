"""StrategicPlanSystem — strategic-plan channel (Python port).

The system emits a pydantic :class:`StrategicPlan` describing the colony's
long-horizon goals: ``primary_goal``, ``constraints``, ``resource_budget``,
``phase``, ``defense_posture``, ``risk_tolerance``. The colony-agent channel
consumes this on subsequent ticks when grounding plan steps.

Cadence:
    * heartbeat = 90s (default), cooldown = 15s,
    * crisis triggers (workers==0, food/wood≤5, threat≥85) fire past
      cooldown.

D5 runMode gate:
    * If ``state.ai["run_mode"] == "llm"`` (or legacy ``coverageTarget``)
      and no adapter is wired on ``services.agent_adapter``, the channel
      emits a deterministic fallback rather than blocking on a missing
      coroutine.
"""

from __future__ import annotations

import math
from typing import Any

from ...ai.llm.agent_adapter import AgentAdapter, DecisionResponse
from ...ai.llm.guardrails import guard_strategic_plan
from ...ai.llm.prompt_payload import PromptPayload
from ...ai.llm.response_schema import StrategicPlan
from ....app.ai_runtime_stats import (
    classify_ai_error_message,
    ensure_ai_runtime_stats,
    get_ai_coverage_target,
)
from .decision_scheduler import DEFAULT_HEARTBEAT_SEC, DecisionScheduler

DEFAULT_STRATEGIC_HEARTBEAT_SEC: float = DEFAULT_HEARTBEAT_SEC


# ---------------------------------------------------------------------------
# Fallback strategic plan (deterministic)
# ---------------------------------------------------------------------------


def _num(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    return v


def build_fallback_strategic_plan(state: dict[str, Any]) -> dict[str, Any]:
    """Build a deterministic strategic plan when the LLM is unavailable.

    Branches mirror the JS ``StrategicDirector.buildFallbackStrategy``:

    - survive — food<15 OR workers<=3,
    - defend — threat>75,
    - bootstrap — farms<4 OR warehouses<1,
    - growth — otherwise.
    """
    resources = state.get("resources") or {}
    if not isinstance(resources, dict):
        resources = {}
    metrics = state.get("metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}
    pop_stats = metrics.get("populationStats") or {}
    if not isinstance(pop_stats, dict):
        pop_stats = {}
    gameplay = state.get("gameplay") or {}
    if not isinstance(gameplay, dict):
        gameplay = {}
    buildings = state.get("buildings") or {}
    if not isinstance(buildings, dict):
        buildings = {}

    food = _num(resources.get("food", 100))
    wood = _num(resources.get("wood", 100))
    workers = _num(pop_stats.get("workers", 0))
    threat = _num(gameplay.get("threat", 0))
    farms = _num(buildings.get("farms", 0))
    warehouses = _num(buildings.get("warehouses", 0))

    if food < 15 or workers <= 3:
        return {
            "primaryGoal": "Stabilize food production and prevent colony collapse",
            "constraints": [
                "do not build non-food buildings",
                "prioritize farms near warehouses",
            ],
            "resourceBudget": {"reserveWood": 5.0, "reserveFood": 0.0},
            "phase": "bootstrap",
            "defensePosture": "defensive",
            "riskTolerance": 0.2,
        }
    if threat > 75:
        return {
            "primaryGoal": "Build walls and reduce threat before expanding",
            "constraints": [
                "build walls on high elevation for defense bonus",
                "do not expand to new clusters",
            ],
            "resourceBudget": {"reserveWood": 10.0, "reserveFood": 20.0},
            "phase": "fortify",
            "defensePosture": "defensive",
            "riskTolerance": 0.2,
        }
    if farms < 4 or warehouses < 1:
        return {
            "primaryGoal": "Establish basic food production with 4+ farms and warehouse coverage",
            "constraints": ["build farms first, then lumber for wood income"],
            "resourceBudget": {"reserveWood": 5.0, "reserveFood": 15.0},
            "phase": "bootstrap",
            "defensePosture": "neutral",
            "riskTolerance": 0.5,
        }
    return {
        "primaryGoal": "Expand colony with balanced production and new clusters",
        "constraints": ["maintain warehouse coverage for new buildings"],
        "resourceBudget": {"reserveWood": 10.0, "reserveFood": 20.0},
        "phase": "growth",
        "defensePosture": "neutral",
        "riskTolerance": 0.5,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_NEVER_SEC: float = -999.0


def _ensure_ai_slot(state: dict[str, Any]) -> dict[str, Any]:
    ai = state.get("ai")
    if not isinstance(ai, dict):
        ai = {}
        state["ai"] = ai
    ai.setdefault("enabled", True)
    ai.setdefault("coverageTarget", ai.get("coverageTarget") or "fallback")
    ai.setdefault("strategyDecisionCount", 0)
    ai.setdefault("strategyLlmCount", 0)
    ai.setdefault("strategic_plan", None)
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


def _summary_from_state(state: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in (
        "resources",
        "gameplay",
        "buildings",
        "weather",
        "population",
        "scenario",
        "metrics",
    ):
        value = state.get(key) if isinstance(state, dict) else None
        if value is not None:
            out[key] = value
    return {"world": out}


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


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------


class StrategicPlanSystem:
    """strategic-plan channel as a tick-driven System.

    The cadence is delegated to :class:`DecisionScheduler` so crisis triggers
    (workers==0 / food≤5 / wood≤5 / threat≥85) bypass the heartbeat.

    Emits a pydantic :class:`StrategicPlan` on ``state.ai["strategic_plan"]``.
    """

    name: str = "StrategicPlanSystem"

    def __init__(self, *, heartbeat_sec: float = DEFAULT_STRATEGIC_HEARTBEAT_SEC) -> None:
        self.scheduler = DecisionScheduler(heartbeat_sec=heartbeat_sec)

    def update(self, dt: float, state: dict[str, Any], services: Any) -> None:
        del dt
        ai = _ensure_ai_slot(state)
        stats = ensure_ai_runtime_stats(state)
        now = _time_sec(state)

        if not self.scheduler.should_trigger(state):
            return
        _record_request(stats, now)

        summary = _summary_from_state(state)
        payload = PromptPayload(
            summary=summary,
            operational_highlights=[],
            memory_snippets=_collect_memory_snippets(services, now),
            tick=int(state.get("metrics", {}).get("tick", 0) or 0),
            time_sec=now,
        )

        wants_llm = _wants_llm(state)
        adapter: AgentAdapter | None = getattr(services, "agent_adapter", None)

        # D5 gate: wants LLM but no adapter wired → deterministic fallback.
        if not wants_llm or adapter is None:
            self._apply_fallback(state, ai, stats, now, error="")
            self.scheduler.record_decision(state)
            return

        from ..director.environment_director_system import _run_adapter  # avoid cycle

        try:
            response = _run_adapter(adapter, "strategic-plan", payload)
        except BaseException as err:  # noqa: BLE001
            self._apply_fallback(
                state, ai, stats, now, error=str(err) or err.__class__.__name__
            )
            self.scheduler.record_decision(state)
            return

        if response.fallback or response.data is None:
            self._apply_fallback(state, ai, stats, now, response=response)
            self.scheduler.record_decision(state)
            return

        from pydantic import ValidationError

        try:
            validated = StrategicPlan.model_validate(response.data)
        except ValidationError as err:
            guarded = guard_strategic_plan(response.data)
            self._commit_plan(ai, now, guarded, fallback=False, source="guarded")
            _record_response(
                stats, response=response, now=now, fallback=True, error=f"schema: {err}"
            )
            self.scheduler.record_decision(state)
            return

        guarded = guard_strategic_plan(validated.model_dump(by_alias=False))
        self._commit_plan(ai, now, guarded, fallback=False, source="llm")
        _record_response(stats, response=response, now=now, fallback=False, error="")
        self.scheduler.record_decision(state)

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
        raw = build_fallback_strategic_plan(state)
        guarded = guard_strategic_plan(raw)
        self._commit_plan(ai, now, guarded, fallback=True, source="fallback")
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

    def _commit_plan(
        self,
        ai: dict[str, Any],
        now: float,
        plan: StrategicPlan,
        *,
        fallback: bool,
        source: str,
    ) -> None:
        ai["strategic_plan"] = plan.model_dump(by_alias=False)
        ai["lastStrategicPlan"] = plan.model_dump(by_alias=True)
        ai["strategyDecisionCount"] = int(ai.get("strategyDecisionCount", 0)) + 1
        if not fallback:
            ai["strategyLlmCount"] = int(ai.get("strategyLlmCount", 0)) + 1
        ai["lastStrategySource"] = source
        ai["lastStrategySec"] = float(now)
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
    "DEFAULT_STRATEGIC_HEARTBEAT_SEC",
    "StrategicPlanSystem",
    "build_fallback_strategic_plan",
]
