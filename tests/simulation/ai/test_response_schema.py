"""Tests for project_utopia.simulation.ai.llm.response_schema."""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from project_utopia.simulation.ai.llm.response_schema import (
    ColonyPlanStep,
    EnvironmentDirective,
    EventSpawn,
    GroupPolicy,
    NpcPolicyEnvelope,
    StateTarget,
    StrategicPlan,
)


class TestEnvironmentDirective:
    def test_accepts_minimal_valid_directive(self) -> None:
        d = EnvironmentDirective(
            weather="clear",
            duration_sec=20,
            faction_tension=0.4,
        )
        assert d.weather == "clear"
        assert d.duration_sec == 20
        assert d.faction_tension == pytest.approx(0.4)
        assert d.event_spawns == []
        assert d.steering_notes == []

    def test_accepts_camelcase_aliases(self) -> None:
        # The wire format passes camelCase keys — must parse without snake_case names.
        d = EnvironmentDirective.model_validate(
            {
                "weather": "rain",
                "durationSec": 30,
                "factionTension": 0.7,
                "eventSpawns": [
                    {"type": "banditRaid", "intensity": 1.0, "durationSec": 12}
                ],
                "steeringNotes": ["keep pressure visible"],
            }
        )
        assert d.duration_sec == 30
        assert d.faction_tension == pytest.approx(0.7)
        assert len(d.event_spawns) == 1
        assert d.event_spawns[0].type == "banditRaid"

    def test_dumps_to_camelcase_for_wire_format(self) -> None:
        d = EnvironmentDirective(weather="clear", duration_sec=10, faction_tension=0.0)
        dump = d.model_dump(by_alias=True)
        assert "durationSec" in dump
        assert "factionTension" in dump
        assert "eventSpawns" in dump
        assert "steeringNotes" in dump

    def test_rejects_unknown_weather(self) -> None:
        with pytest.raises(ValidationError):
            EnvironmentDirective(weather="kaboom", duration_sec=10, faction_tension=0.5)

    def test_rejects_duration_below_min(self) -> None:
        with pytest.raises(ValidationError):
            EnvironmentDirective(weather="clear", duration_sec=4, faction_tension=0.5)

    def test_rejects_duration_above_max(self) -> None:
        with pytest.raises(ValidationError):
            EnvironmentDirective(weather="clear", duration_sec=999, faction_tension=0.5)

    def test_rejects_faction_tension_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            EnvironmentDirective(weather="clear", duration_sec=20, faction_tension=1.7)

    def test_rejects_nan_faction_tension(self) -> None:
        with pytest.raises(ValidationError):
            EnvironmentDirective(
                weather="clear", duration_sec=20, faction_tension=math.nan
            )

    def test_rejects_more_than_three_event_spawns(self) -> None:
        with pytest.raises(ValidationError):
            EnvironmentDirective(
                weather="clear",
                duration_sec=20,
                faction_tension=0.5,
                event_spawns=[
                    EventSpawn(type="banditRaid", intensity=1.0, duration_sec=10),
                    EventSpawn(type="tradeCaravan", intensity=1.0, duration_sec=10),
                    EventSpawn(type="moraleBreak", intensity=1.0, duration_sec=10),
                    EventSpawn(type="wildfire", intensity=1.0, duration_sec=10),
                ],
            )


class TestGroupPolicy:
    def test_accepts_camelcase_aliases(self) -> None:
        p = GroupPolicy.model_validate(
            {
                "groupId": "workers",
                "intentWeights": {"farm": 1.5, "eat": 1.0},
                "riskTolerance": 0.3,
                "targetPriorities": {"warehouse": 1.2},
                "ttlSec": 20.0,
            }
        )
        assert p.group_id == "workers"
        assert p.ttl_sec == pytest.approx(20.0)
        assert p.intent_weights["farm"] == pytest.approx(1.5)

    def test_rejects_nan_intent_weight(self) -> None:
        with pytest.raises(ValidationError):
            GroupPolicy(
                group_id="workers",
                intent_weights={"farm": math.nan},
                risk_tolerance=0.3,
                target_priorities={},
                ttl_sec=20.0,
            )

    def test_rejects_ttl_below_min(self) -> None:
        with pytest.raises(ValidationError):
            GroupPolicy(
                group_id="workers",
                intent_weights={"farm": 1.0},
                risk_tolerance=0.3,
                target_priorities={},
                ttl_sec=2.0,
            )

    def test_rejects_risk_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            GroupPolicy(
                group_id="workers",
                intent_weights={"farm": 1.0},
                risk_tolerance=1.5,
                target_priorities={},
                ttl_sec=20.0,
            )


class TestStrategicPlan:
    def test_accepts_camelcase_aliases(self) -> None:
        plan = StrategicPlan.model_validate(
            {
                "primaryGoal": "stabilize food output",
                "constraints": ["avoid raids"],
                "resourceBudget": {"food": 30.0, "wood": 10.0},
                "phase": "growth",
                "defensePosture": "defensive",
            }
        )
        assert plan.primary_goal == "stabilize food output"
        assert plan.defense_posture == "defensive"

    def test_rejects_invalid_defense_posture(self) -> None:
        with pytest.raises(ValidationError):
            StrategicPlan(
                primary_goal="g",
                constraints=[],
                resource_budget={},
                phase="x",
                defense_posture="cuddly",
            )


class TestColonyPlanStep:
    def test_accepts_minimal_step(self) -> None:
        step = ColonyPlanStep(action="build_farm", args={"tile": "A1"})
        assert step.action == "build_farm"
        assert step.depends_on == []

    def test_rejects_empty_action(self) -> None:
        with pytest.raises(ValidationError):
            ColonyPlanStep(action="", args={})


class TestNpcPolicyEnvelope:
    def test_round_trip_camelcase(self) -> None:
        env = NpcPolicyEnvelope.model_validate(
            {
                "policies": [
                    {
                        "groupId": "workers",
                        "intentWeights": {"farm": 1.0},
                        "riskTolerance": 0.4,
                        "targetPriorities": {"warehouse": 1.0},
                        "ttlSec": 20.0,
                    }
                ],
                "stateTargets": [
                    {
                        "groupId": "workers",
                        "targetState": "deliver",
                        "priority": 0.6,
                        "ttlSec": 12.0,
                    }
                ],
            }
        )
        assert len(env.policies) == 1
        assert env.policies[0].group_id == "workers"
        assert isinstance(env.state_targets[0], StateTarget)
        # Round-trip back to camelCase JSON must keep stateTargets.
        dump = env.model_dump(by_alias=True)
        assert "stateTargets" in dump
        assert dump["policies"][0]["groupId"] == "workers"
