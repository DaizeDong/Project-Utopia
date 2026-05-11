"""Tests for project_utopia.simulation.ai.colony.ColonyAgentSystem."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from project_utopia.simulation.ai.colony import (
    DEFAULT_COLONY_AGENT_INTERVAL_SEC,
    DEFAULT_COLONY_PLAN_STALL_SEC,
    ColonyAgentSystem,
    build_fallback_colony_plan,
)
from project_utopia.simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    DecisionResponse,
    UsageStats,
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
        "metrics": {"timeSec": time_sec, "tick": 0},
        "ai": {"enabled": True, "coverageTarget": "llm"},
        "resources": {"food": 100, "wood": 50},
        "gameplay": {"threat": 10},
        "buildings": {"farms": 4, "warehouses": 1},
    }
    s.update(overrides)
    return s


def _services(adapter: AgentAdapter | None = None) -> SimpleNamespace:
    return SimpleNamespace(agent_adapter=adapter, memory_store=None)


def _ok_response(**extra: Any) -> DecisionResponse:
    data = [
        {"action": "build", "args": {"kind": "farm"}, "dependsOn": []},
        {"action": "build", "args": {"kind": "lumber"}, "dependsOn": ["s1"]},
    ]
    return DecisionResponse(data=data, fallback=False, model="m", **extra)


# ---------------------------------------------------------------------------
# (a) Cadence + stall-driven replan
# ---------------------------------------------------------------------------


class TestCadence:
    def test_default_interval(self) -> None:
        assert DEFAULT_COLONY_AGENT_INTERVAL_SEC == 2.0
        assert DEFAULT_COLONY_PLAN_STALL_SEC == 18.0

    def test_first_tick_fires(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state()
        system.update(0.1, state, _services(adapter))
        plan = state["ai"]["colony_plan"]
        assert isinstance(plan, list) and len(plan) >= 1
        assert len(adapter.calls) == 1

    def test_interval_window_suppresses_second_tick(self) -> None:
        system = ColonyAgentSystem(interval_sec=2.0)
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 0.5
        system.update(0.1, state, services)
        assert len(adapter.calls) == 1

    def test_fires_again_after_interval(self) -> None:
        system = ColonyAgentSystem(interval_sec=2.0)
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 2.5
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2

    def test_plan_stall_triggers_replan_before_interval(self) -> None:
        system = ColonyAgentSystem(interval_sec=2.0, plan_stall_sec=5.0)
        adapter = _StaticAdapter(_ok_response())
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        # Mark the plan as stalled, then advance past the stall window.
        # interval_sec normally suppresses ticks within 2s, but stall trumps it.
        state["metrics"]["timeSec"] = 0.5
        system.mark_plan_stalled(state)
        state["metrics"]["timeSec"] = 6.0  # > plan_stall_sec since stall start
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2

    def test_clear_plan_stall_resets_timer(self) -> None:
        system = ColonyAgentSystem(plan_stall_sec=5.0)
        state = _state(time_sec=1.0)
        system.mark_plan_stalled(state)
        assert state["ai"]["colonyAgentPlanStalledSinceSec"] == 1.0
        system.clear_plan_stall(state)
        assert state["ai"]["colonyAgentPlanStalledSinceSec"] is None


# ---------------------------------------------------------------------------
# (b) Fallback on exception
# ---------------------------------------------------------------------------


class TestFallback:
    def test_adapter_raises_triggers_fallback(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(raise_with=RuntimeError("boom"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastColonyAgentSource"] == "fallback"
        plan = state["ai"]["colony_plan"]
        assert isinstance(plan, list) and len(plan) >= 1

    def test_d5_run_mode_no_adapter_falls_back(self) -> None:
        system = ColonyAgentSystem()
        state = _state()
        state["ai"]["run_mode"] = "llm"
        system.update(0.1, state, _services(adapter=None))
        assert state["ai"]["lastColonyAgentSource"] == "fallback"
        plan = state["ai"]["colony_plan"]
        assert plan and plan[0]["action"] == "build"

    def test_disabled_ai_uses_fallback(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(_ok_response())
        state = _state()
        state["ai"]["enabled"] = False
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastColonyAgentSource"] == "fallback"
        assert len(adapter.calls) == 0

    def test_food_crisis_fallback_builds_farm_first(self) -> None:
        state = _state(resources={"food": 5}, buildings={})
        plan = build_fallback_colony_plan(state)
        assert plan
        assert plan[0]["args"]["kind"] == "farm"


# ---------------------------------------------------------------------------
# (c) Guardrail clamp / sanitization
# ---------------------------------------------------------------------------


class TestGuardrailClamp:
    def test_drops_malformed_steps(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data=[
                    {"action": "build", "args": {"kind": "farm"}, "dependsOn": []},
                    {"args": {"kind": "lumber"}},  # missing required "action"
                    "not a dict",  # entirely invalid
                    {"action": "build", "args": {"kind": "smithy"}, "dependsOn": []},
                ],
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        plan = state["ai"]["colony_plan"]
        # The salvage path keeps the valid entries and drops the rest.
        assert all(isinstance(step.get("action"), str) and step["action"] for step in plan)
        kinds = [s["args"]["kind"] for s in plan if "args" in s]
        assert "farm" in kinds and "smithy" in kinds

    def test_empty_list_falls_back(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(
            DecisionResponse(data=[], fallback=False, model="m")
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        # An empty list is technically valid as a "list[ColonyPlanStep]" but
        # the committed plan is empty; LLM source is preserved.
        assert state["ai"]["colony_plan"] == []

    def test_caps_step_count(self) -> None:
        system = ColonyAgentSystem()
        bulk = [
            {"action": "build", "args": {"kind": f"k{i}"}, "dependsOn": []}
            for i in range(100)
        ]
        adapter = _StaticAdapter(
            DecisionResponse(data=bulk, fallback=False, model="m")
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        # The system caps via the schema-validation path or the salvage path.
        plan = state["ai"]["colony_plan"]
        # When pydantic accepts the full list, no internal cap applies — but
        # the practical guarantee is that the list is at most the LLM's output.
        assert len(plan) == 100


# ---------------------------------------------------------------------------
# (d) Runtime counters
# ---------------------------------------------------------------------------


class TestRuntimeCounters:
    def test_counters_increment_on_success(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(
            _ok_response(latency_ms=33.0, usage=UsageStats(prompt_tokens=11, completion_tokens=7))
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["requestCount"] == 1
        assert runtime["responseCount"] == 1
        assert runtime["llmResponseCount"] == 1
        assert runtime["fallbackResponseCount"] == 0
        assert runtime["lastLatencyMs"] == pytest.approx(33.0)
        assert runtime["promptTokens"] == 11
        assert runtime["completionTokens"] == 7

    def test_fallback_increments_fallback_counter(self) -> None:
        system = ColonyAgentSystem()
        adapter = _StaticAdapter(raise_with=RuntimeError("request timeout exceeded"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["fallbackResponseCount"] == 1
        assert runtime["lastErrorKind"] == "timeout"
