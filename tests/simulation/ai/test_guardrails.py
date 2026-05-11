"""Tests for project_utopia.simulation.ai.llm.guardrails."""

from __future__ import annotations

import math

import pytest

from project_utopia.simulation.ai.llm.guardrails import (
    MAX_EVENT_SPAWNS,
    MAX_WEIGHT_VALUE,
    RAID_COMBAT_INTENTS,
    RAID_MIN_INTENT_WEIGHT,
    RAID_THREAT_THRESHOLD,
    guard_environment_directive,
    guard_group_policies,
    guard_strategic_plan,
)


def _dump(model):
    return model.model_dump(by_alias=False)


class TestEnvironmentGuard:
    def test_idempotent_fixed_point(self) -> None:
        guarded_once = guard_environment_directive(
            {
                "weather": "rain",
                "durationSec": 25,
                "factionTension": 0.5,
                "eventSpawns": [{"type": "banditRaid", "intensity": 1.0, "durationSec": 12}],
            }
        )
        guarded_twice = guard_environment_directive(_dump(guarded_once))
        assert _dump(guarded_once) == _dump(guarded_twice)

    def test_drops_unknown_weather_to_clear(self) -> None:
        g = guard_environment_directive({"weather": "kaboom"})
        assert g.weather == "clear"

    def test_clamps_out_of_range_duration(self) -> None:
        g = guard_environment_directive({"weather": "clear", "durationSec": 9999})
        assert g.duration_sec <= 180
        g_lo = guard_environment_directive({"weather": "clear", "durationSec": -5})
        assert g_lo.duration_sec >= 8

    def test_clamps_nan_faction_tension_to_default(self) -> None:
        g = guard_environment_directive({"weather": "clear", "factionTension": math.nan})
        assert 0.0 <= g.faction_tension <= 1.0

    def test_truncates_event_spawns_to_three(self) -> None:
        g = guard_environment_directive(
            {
                "weather": "clear",
                "eventSpawns": [
                    {"type": "banditRaid", "intensity": 1.0, "durationSec": 10}
                    for _ in range(7)
                ],
            }
        )
        assert len(g.event_spawns) <= MAX_EVENT_SPAWNS

    def test_drops_unknown_event_type(self) -> None:
        g = guard_environment_directive(
            {
                "weather": "clear",
                "eventSpawns": [{"type": "haunted_carnival", "intensity": 1.0, "durationSec": 10}],
            }
        )
        assert g.event_spawns == []


class TestGroupPoliciesGuard:
    def test_idempotent_fixed_point(self) -> None:
        once = guard_group_policies(
            {
                "policies": [
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 9.0, "eat": -2.0},
                        "riskTolerance": 0.4,
                        "targetPriorities": {"warehouse": 1.0},
                        "ttlSec": 15.0,
                    }
                ],
                "stateTargets": [],
            }
        )
        twice = guard_group_policies(_dump(once))
        assert _dump(once) == _dump(twice)

    def test_clamps_intent_weights_to_zero_three(self) -> None:
        g = guard_group_policies(
            {
                "policies": [
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 99.0, "eat": -5.0},
                        "riskTolerance": 0.5,
                        "targetPriorities": {},
                        "ttlSec": 15.0,
                    }
                ]
            }
        )
        weights = g.policies[0].intent_weights
        assert weights["farm"] == MAX_WEIGHT_VALUE
        assert weights["eat"] == 0.0

    def test_drops_empty_group_id(self) -> None:
        g = guard_group_policies(
            {
                "policies": [
                    {
                        "groupId": "",
                        "intentWeights": {"farm": 1.0},
                        "riskTolerance": 0.5,
                        "targetPriorities": {},
                        "ttlSec": 15.0,
                    }
                ]
            }
        )
        assert g.policies == []

    def test_drops_duplicate_group_id(self) -> None:
        g = guard_group_policies(
            {
                "policies": [
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 1.0},
                        "riskTolerance": 0.5,
                        "targetPriorities": {},
                        "ttlSec": 15.0,
                    },
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 2.0},
                        "riskTolerance": 0.5,
                        "targetPriorities": {},
                        "ttlSec": 15.0,
                    },
                ]
            }
        )
        assert len(g.policies) == 1
        assert g.policies[0].intent_weights["farm"] == 1.0

    def test_raid_posture_fires_at_threshold(self) -> None:
        g = guard_group_policies(
            {
                "policies": [
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 1.0, "evade": 0.1, "flee": 0.1, "deliver": 0.1, "safety": 0.1},
                        "riskTolerance": 0.5,
                        "targetPriorities": {},
                        "ttlSec": 15.0,
                    }
                ]
            },
            threat=RAID_THREAT_THRESHOLD,
        )
        weights = g.policies[0].intent_weights
        for combat_intent in RAID_COMBAT_INTENTS:
            assert weights[combat_intent] >= RAID_MIN_INTENT_WEIGHT

    def test_raid_posture_does_not_fire_below_threshold(self) -> None:
        g = guard_group_policies(
            {
                "policies": [
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 1.0, "evade": 0.1},
                        "riskTolerance": 0.5,
                        "targetPriorities": {},
                        "ttlSec": 15.0,
                    }
                ]
            },
            threat=RAID_THREAT_THRESHOLD - 1.0,
        )
        assert g.policies[0].intent_weights["evade"] == pytest.approx(0.1)


class TestStrategicGuard:
    def test_idempotent_fixed_point(self) -> None:
        once = guard_strategic_plan(
            {
                "primaryGoal": "stabilize",
                "constraints": ["avoid raids"],
                "resourceBudget": {"food": 9999, "wood": -5},
                "phase": "growth",
                "defensePosture": "feral",
            }
        )
        twice = guard_strategic_plan(_dump(once))
        assert _dump(once) == _dump(twice)

    def test_drops_unknown_defense_posture(self) -> None:
        g = guard_strategic_plan({"primaryGoal": "x", "defensePosture": "feral"})
        assert g.defense_posture == "neutral"

    def test_clamps_resource_budget_to_range(self) -> None:
        g = guard_strategic_plan({"primaryGoal": "x", "resourceBudget": {"food": -50.0}})
        assert g.resource_budget["food"] == 0.0
