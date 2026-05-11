"""Tests for project_utopia.simulation.ai.strategic.StrategicPlanSystem.

Covers cadence (heartbeat + crisis triggers + cooldown), fallback path
on adapter exception, guardrail clamp on out-of-range output, and runtime
counters bumping. Also exercises the D5 runMode gate (run_mode == 'llm' with
no adapter wired → deterministic fallback).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from project_utopia.simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    DecisionResponse,
    UsageStats,
)
from project_utopia.simulation.ai.strategic import (
    DEFAULT_STRATEGIC_HEARTBEAT_SEC,
    DecisionScheduler,
    StrategicPlanSystem,
    build_fallback_strategic_plan,
)


class _StaticAdapter(AgentAdapter):
    def __init__(self, response: DecisionResponse | None = None, *, raise_with: Exception | None = None) -> None:
        self.response = response
        self.raise_with = raise_with
        self.calls: list[tuple[str, Any]] = []

    async def request(self, channel, payload, options=None):  # type: ignore[override]
        self.calls.append((channel, payload))
        if self.raise_with is not None:
            raise self.raise_with
        assert self.response is not None
        return self.response


def _state(time_sec: float = 0.0, **overrides: Any) -> dict[str, Any]:
    s: dict[str, Any] = {
        "metrics": {
            "timeSec": time_sec,
            "tick": 0,
            "deathsTotal": 0,
            "populationStats": {"workers": 10},
        },
        "session": {"phase": "active"},
        "ai": {"enabled": True, "coverageTarget": "llm"},
        "resources": {"food": 100, "wood": 50},
        "gameplay": {"threat": 10, "prosperity": 50, "objectiveIndex": 0},
        "buildings": {"farms": 4, "warehouses": 1},
    }
    s.update(overrides)
    return s


def _services(adapter: AgentAdapter | None = None) -> SimpleNamespace:
    return SimpleNamespace(agent_adapter=adapter, memory_store=None)


def _ok_response(**extra: Any) -> DecisionResponse:
    data = {
        "primaryGoal": "Grow",
        "constraints": ["k"],
        "resourceBudget": {"reserveWood": 8.0, "reserveFood": 20.0},
        "phase": "growth",
        "defensePosture": "neutral",
        "riskTolerance": 0.5,
    }
    return DecisionResponse(data=data, fallback=False, model="m", **extra)


# ---------------------------------------------------------------------------
# (a) Cadence + crisis triggers
# ---------------------------------------------------------------------------


class TestCadence:
    def test_default_heartbeat_is_ninety_seconds(self) -> None:
        assert DEFAULT_STRATEGIC_HEARTBEAT_SEC == 90.0

    def test_first_tick_fires(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["strategic_plan"] is not None
        assert len(adapter.calls) == 1

    def test_cooldown_suppresses_immediate_second_tick(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 5.0  # inside cooldown
        system.update(0.1, state, services)
        assert len(adapter.calls) == 1

    def test_heartbeat_fires_after_ninety_seconds(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 91.0
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2

    def test_crisis_workers_zero_bypasses_cooldown(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        # Inside cooldown, but workers crash to zero → must trigger.
        state["metrics"]["timeSec"] = 18.0
        state["metrics"]["populationStats"]["workers"] = 0
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2

    def test_crisis_food_low_bypasses_cooldown(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 18.0
        state["resources"]["food"] = 4
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2

    def test_crisis_threat_high_bypasses_cooldown(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 18.0
        state["gameplay"]["threat"] = 90
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2


# ---------------------------------------------------------------------------
# (b) Fallback path
# ---------------------------------------------------------------------------


class TestFallback:
    def test_adapter_raises_uses_fallback(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(raise_with=RuntimeError("boom"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastStrategySource"] == "fallback"
        assert state["ai"]["strategic_plan"] is not None

    def test_d5_run_mode_gate_no_adapter_falls_back(self) -> None:
        """D5: run_mode == 'llm' but no adapter wired → deterministic fallback."""
        system = StrategicPlanSystem()
        state = _state()
        state["ai"]["run_mode"] = "llm"
        system.update(0.1, state, _services(adapter=None))
        assert state["ai"]["lastStrategySource"] == "fallback"
        plan = state["ai"]["strategic_plan"]
        assert plan["primary_goal"]

    def test_inactive_session_skips(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state()
        state["session"]["phase"] = "end"
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["strategic_plan"] is None
        assert len(adapter.calls) == 0

    def test_fallback_plan_passes_guardrails(self) -> None:
        from project_utopia.simulation.ai.llm.guardrails import guard_strategic_plan

        raw = build_fallback_strategic_plan(_state(resources={"food": 5}))
        guarded = guard_strategic_plan(raw)
        assert guarded.primary_goal
        assert guarded.phase in (
            "bootstrap",
            "growth",
            "industrialize",
            "process",
            "fortify",
            "optimize",
        )


# ---------------------------------------------------------------------------
# (c) Guardrail clamp
# ---------------------------------------------------------------------------


class TestGuardrailClamp:
    def test_clamps_out_of_range_risk_tolerance(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "primaryGoal": "Grow",
                    "constraints": [],
                    "resourceBudget": {"reserveWood": 5.0, "reserveFood": 15.0},
                    "phase": "growth",
                    "defensePosture": "neutral",
                    "riskTolerance": 9.0,  # over 1.0
                },
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        plan = state["ai"]["strategic_plan"]
        assert plan["risk_tolerance"] is None or 0.0 <= plan["risk_tolerance"] <= 1.0

    def test_drops_unknown_defense_posture(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "primaryGoal": "Grow",
                    "constraints": [],
                    "resourceBudget": {},
                    "phase": "growth",
                    "defensePosture": "warmongering",  # not in enum
                    "riskTolerance": 0.5,
                },
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        plan = state["ai"]["strategic_plan"]
        assert plan["defense_posture"] in ("defensive", "neutral", "offensive", "aggressive")


# ---------------------------------------------------------------------------
# (d) Runtime counters
# ---------------------------------------------------------------------------


class TestRuntimeCounters:
    def test_request_and_response_counters_increment(self) -> None:
        system = StrategicPlanSystem()
        adapter = _StaticAdapter(
            _ok_response(latency_ms=22.5, usage=UsageStats(prompt_tokens=12, completion_tokens=8))
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["requestCount"] == 1
        assert runtime["responseCount"] == 1
        assert runtime["llmResponseCount"] == 1
        assert runtime["lastResultSource"] == "llm"
        assert runtime["lastLatencyMs"] == pytest.approx(22.5)


class TestDecisionScheduler:
    def test_first_call_triggers(self) -> None:
        sched = DecisionScheduler()
        assert sched.should_trigger(_state()) is True

    def test_record_then_inside_cooldown_does_not_trigger(self) -> None:
        sched = DecisionScheduler()
        state = _state(time_sec=0.0)
        sched.record_decision(state)
        state["metrics"]["timeSec"] = 5.0
        assert sched.should_trigger(state) is False

    def test_wood_crisis_bypasses_cooldown(self) -> None:
        sched = DecisionScheduler()
        state = _state(time_sec=0.0)
        sched.record_decision(state)
        state["metrics"]["timeSec"] = 17.0
        state["resources"]["wood"] = 3
        assert sched.should_trigger(state) is True
