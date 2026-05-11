"""Tests for project_utopia.simulation.ai.brains.NpcPolicySystem."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from project_utopia.simulation.ai.brains import (
    DEFAULT_NPC_POLICY_INTERVAL_SEC,
    NpcPolicySystem,
    build_fallback_group_policies,
)
from project_utopia.simulation.ai.brains.npc_policy_system import (
    RAID_COMBAT_INTENTS,
    RAID_MIN_INTENT_WEIGHT,
    REQUIRED_GROUP_IDS,
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


def _state(time_sec: float = 0.0, threat: float = 10.0, **overrides: Any) -> dict[str, Any]:
    s: dict[str, Any] = {
        "metrics": {"timeSec": time_sec, "tick": 0},
        "ai": {"enabled": True, "coverageTarget": "llm"},
        "resources": {"food": 80, "wood": 50},
        "gameplay": {"threat": threat, "prosperity": 60},
        "buildings": {"farms": 4, "warehouses": 1},
    }
    s.update(overrides)
    return s


def _services(adapter: AgentAdapter | None = None) -> SimpleNamespace:
    return SimpleNamespace(agent_adapter=adapter, memory_store=None)


# ---------------------------------------------------------------------------
# (a) Cadence
# ---------------------------------------------------------------------------


class TestCadence:
    def test_first_tick_fires(self) -> None:
        system = NpcPolicySystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "policies": [
                        {
                            "groupId": "workers",
                            "intentWeights": {"deliver": 1.5, "eat": 1.2},
                            "riskTolerance": 0.4,
                            "targetPriorities": {"warehouse": 1.0},
                            "ttlSec": 24,
                        }
                    ],
                    "stateTargets": [],
                },
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert "workers" in state["ai"]["group_policies"]
        assert len(adapter.calls) == 1

    def test_cadence_window_blocks(self) -> None:
        system = NpcPolicySystem(interval_sec=10.0)
        adapter = _StaticAdapter(
            DecisionResponse(
                data={"policies": [], "stateTargets": []}, fallback=False, model="m"
            )
        )
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 2.0
        system.update(0.1, state, services)
        assert len(adapter.calls) == 1

    def test_default_interval_is_eight_seconds(self) -> None:
        assert DEFAULT_NPC_POLICY_INTERVAL_SEC == 8.0


# ---------------------------------------------------------------------------
# (b) Fallback on exception
# ---------------------------------------------------------------------------


class TestFallback:
    def test_adapter_raises_triggers_fallback(self) -> None:
        system = NpcPolicySystem()
        adapter = _StaticAdapter(raise_with=ConnectionError("network down"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastPolicySource"] == "fallback"
        # Every required group must have a policy after fallback.
        for gid in REQUIRED_GROUP_IDS:
            assert gid in state["ai"]["group_policies"]

    def test_no_adapter_uses_fallback(self) -> None:
        system = NpcPolicySystem()
        state = _state()
        state["ai"]["run_mode"] = "llm"
        system.update(0.1, state, _services(adapter=None))
        assert state["ai"]["lastPolicySource"] == "fallback"
        for gid in REQUIRED_GROUP_IDS:
            assert gid in state["ai"]["group_policies"]

    def test_disabled_ai_uses_fallback(self) -> None:
        system = NpcPolicySystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={"policies": [], "stateTargets": []}, fallback=False, model="m"
            )
        )
        state = _state()
        state["ai"]["enabled"] = False
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastPolicySource"] == "fallback"
        assert len(adapter.calls) == 0


# ---------------------------------------------------------------------------
# (c) Guardrail clamp
# ---------------------------------------------------------------------------


class TestGuardrailClamp:
    def test_clamps_out_of_range_weights(self) -> None:
        system = NpcPolicySystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "policies": [
                        {
                            "groupId": "workers",
                            "intentWeights": {"deliver": 99.0, "eat": -5.0},
                            "riskTolerance": 7.0,  # over 1.0
                            "targetPriorities": {"warehouse": 50.0},
                            "ttlSec": 999.0,  # over 120
                        }
                    ],
                    "stateTargets": [],
                },
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        worker = state["ai"]["group_policies"]["workers"]
        assert worker["risk_tolerance"] <= 1.0
        assert worker["ttl_sec"] <= 120.0
        for v in worker["intent_weights"].values():
            assert 0.0 <= v <= 3.0
        for v in worker["target_priorities"].values():
            assert 0.0 <= v <= 3.0

    def test_raid_posture_floor_applied_when_threat_high(self) -> None:
        """At threat >= 80, guardrails forcibly raise combat-relevant intents."""
        system = NpcPolicySystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "policies": [
                        {
                            "groupId": "workers",
                            "intentWeights": {"farm": 1.0},  # no combat intents
                            "riskTolerance": 0.5,
                            "targetPriorities": {"warehouse": 1.0},
                            "ttlSec": 24,
                        }
                    ],
                    "stateTargets": [],
                },
                fallback=False,
                model="m",
            )
        )
        state = _state(threat=85.0)
        system.update(0.1, state, _services(adapter))
        worker = state["ai"]["group_policies"]["workers"]
        for intent in RAID_COMBAT_INTENTS:
            assert worker["intent_weights"].get(intent, 0.0) >= RAID_MIN_INTENT_WEIGHT


# ---------------------------------------------------------------------------
# (d) Runtime counters
# ---------------------------------------------------------------------------


class TestRuntimeCounters:
    def test_policy_counters_increment(self) -> None:
        system = NpcPolicySystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "policies": [
                        {
                            "groupId": "workers",
                            "intentWeights": {"deliver": 1.5},
                            "riskTolerance": 0.4,
                            "targetPriorities": {"warehouse": 1.0},
                            "ttlSec": 24,
                        }
                    ],
                    "stateTargets": [],
                },
                fallback=False,
                model="m",
                latency_ms=15.0,
                usage=UsageStats(prompt_tokens=30, completion_tokens=10),
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["requestCount"] == 1
        assert runtime["policyRequests"] == 1
        assert runtime["policyResponses"] == 1
        assert runtime["lastResultSource"] == "llm"
        assert runtime["promptTokens"] == 30
        assert runtime["completionTokens"] == 10

    def test_fallback_increments_fallback_counter(self) -> None:
        system = NpcPolicySystem()
        adapter = _StaticAdapter(raise_with=RuntimeError("kaboom"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["fallbackResponseCount"] == 1
        assert runtime["llmResponseCount"] == 0


# ---------------------------------------------------------------------------
# Fallback determinism + group ordering
# ---------------------------------------------------------------------------


class TestFallbackPolicy:
    def test_required_groups_present_and_sorted(self) -> None:
        envelope = build_fallback_group_policies(_state())
        ids = [p["groupId"] for p in envelope["policies"]]
        assert ids == sorted(ids), "group_ids must be sorted for RNG determinism"
        assert set(ids) == set(REQUIRED_GROUP_IDS)
