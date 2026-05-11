"""Tests for the Hierarchical Coordination dimension plugin (RC3 G3 wiring)."""

from __future__ import annotations

import pytest

from project_utopia.benchmark.dimensions.hierarchical_coordination import (
    HierarchicalCoordinationPlugin,
    _plan_tokens,
)


class TestPlanTokens:
    def test_priority_defend_emits_safety(self) -> None:
        toks = _plan_tokens({"priority": "defend"})
        assert "safety" in toks

    def test_resource_focus_food_emits_farm(self) -> None:
        toks = _plan_tokens({"resource_focus": "food"})
        assert "farm" in toks

    def test_resource_focus_wood_emits_wood_and_lumber(self) -> None:
        toks = _plan_tokens({"resource_focus": "wood"})
        assert "wood" in toks
        assert "lumber" in toks

    def test_phase_industrialize_emits_quarry_and_smith(self) -> None:
        toks = _plan_tokens({"phase": "industrialize"})
        assert "quarry" in toks
        assert "smith" in toks

    def test_dedup_preserves_order(self) -> None:
        # priority=defend AND defense_posture=defensive both add 'safety'.
        toks = _plan_tokens({"priority": "defend", "defense_posture": "defensive"})
        assert toks.count("safety") == 1

    def test_empty_strategy_returns_empty_list(self) -> None:
        assert _plan_tokens(None) == []
        assert _plan_tokens({}) == []


class TestSelfScore:
    def test_empty_samples_returns_zero_defaults(self) -> None:
        plugin = HierarchicalCoordinationPlugin()
        result = plugin.self_score([])
        assert result == {
            "plan_policy_alignment": 0.0,
            "env_threat_responsiveness": 0.0,
            "colony_cadence_health": 0.0,
        }

    def test_plan_policy_alignment_full_match(self) -> None:
        plugin = HierarchicalCoordinationPlugin()
        # strategy: resource_focus=food → plan_tokens=["farm"]
        # worker_policy: target_priorities={"farm": 1.0} → directive contains "farm"
        # alignment = 1/1 = 1.0
        samples = [
            {
                "t": 0.0,
                "faction_tension": 0.0, "threat": 0.0, "prosperity": 0.0,
                "strategy_snapshot": {"resource_focus": "food"},
                "worker_policy_snapshot": {
                    "intent_weights": {},
                    "target_priorities": {"farm": 1.0},
                    "focus": "",
                },
            },
        ]
        result = plugin.self_score(samples)
        assert result["plan_policy_alignment"] == pytest.approx(1.0, abs=1e-4)

    def test_plan_policy_alignment_partial_match(self) -> None:
        plugin = HierarchicalCoordinationPlugin()
        # plan_tokens = ["wood", "lumber"] but directive only has "wood".
        samples = [
            {
                "t": 0.0,
                "faction_tension": 0.0, "threat": 0.0, "prosperity": 0.0,
                "strategy_snapshot": {"resource_focus": "wood"},
                "worker_policy_snapshot": {
                    "intent_weights": {"wood": 1.0},
                    "target_priorities": {},
                    "focus": "",
                },
            }
        ]
        result = plugin.self_score(samples)
        # 1 of 2 plan tokens present.
        assert result["plan_policy_alignment"] == pytest.approx(0.5, abs=1e-4)

    def test_env_threat_responsiveness_pearson(self) -> None:
        plugin = HierarchicalCoordinationPlugin()
        samples = []
        for i in range(5):
            samples.append({
                "t": float(i),
                "faction_tension": 0.1 * i,
                "threat": 5.0 * i,
                "prosperity": 0.0,
                "strategy_snapshot": None,
                "worker_policy_snapshot": None,
            })
        result = plugin.self_score(samples)
        # Perfect positive correlation
        assert result["env_threat_responsiveness"] == pytest.approx(1.0, abs=1e-4)

    def test_score_dimensions_match_spec(self) -> None:
        assert HierarchicalCoordinationPlugin.score_dimensions == (
            "plan_policy_alignment",
            "env_threat_responsiveness",
            "colony_cadence_health",
        )
