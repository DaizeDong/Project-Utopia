"""Tests for the Group Dynamics dimension plugin (RC3 G3 wirings)."""

from __future__ import annotations

import math

import pytest

from project_utopia.benchmark.dimensions.group_dynamics import (
    GroupDynamicsPlugin,
)


class TestSelfScore:
    def test_empty_samples_returns_zero_defaults(self) -> None:
        plugin = GroupDynamicsPlugin()
        result = plugin.self_score([])
        assert result == {
            "intent_entropy": 0.0,
            "coalition_coupling": 0.0,
            "state_target_obedience": 0.0,
            "faction_responsiveness": 0.0,
        }

    def test_intent_entropy_uniform_two_intents(self) -> None:
        plugin = GroupDynamicsPlugin()
        samples = [
            {
                "t": 0.0,
                "group_policies": [
                    {
                        "group_id": "workers",
                        "intent_weights": {"farm": 1.0, "deliver": 1.0},
                        "target_priorities": {},
                    }
                ],
                "group_state_targets": {},
                "fsm_counts": {},
                "hostile_count": 0,
                "faction_tension": 0.0,
                "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples)
        # H(p=0.5, p=0.5) = 1 bit
        assert result["intent_entropy"] == pytest.approx(1.0, abs=1e-4)

    def test_coalition_coupling_identical_targets_is_one(self) -> None:
        plugin = GroupDynamicsPlugin()
        targets = {"warehouse": 1.0, "farm": 2.0, "lumber": 0.5}
        samples = [
            {
                "t": 0.0,
                "group_policies": [
                    {"group_id": "workers", "intent_weights": {}, "target_priorities": dict(targets)},
                    {"group_id": "traders", "intent_weights": {}, "target_priorities": dict(targets)},
                ],
                "group_state_targets": {},
                "fsm_counts": {},
                "hostile_count": 0,
                "faction_tension": 0.0,
                "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples)
        # Two identical vectors → Pearson correlation = 1.0
        assert result["coalition_coupling"] == pytest.approx(1.0, abs=1e-4)

    def test_state_target_obedience_pooled(self) -> None:
        plugin = GroupDynamicsPlugin()
        # workers: 3 in PATROL, 1 in IDLE, target=PATROL → 3/4 obedience
        # saboteurs: 2 in SABOTAGE, target=SABOTAGE → 2/2
        # pooled: 5/6 ≈ 0.8333
        samples = [
            {
                "t": 0.0,
                "group_policies": [],
                "group_state_targets": {"workers": "PATROL", "saboteurs": "SABOTAGE"},
                "fsm_counts": {
                    "workers": {"PATROL": 3, "IDLE": 1},
                    "saboteurs": {"SABOTAGE": 2},
                },
                "hostile_count": 0,
                "faction_tension": 0.0,
                "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples)
        assert result["state_target_obedience"] == pytest.approx(5.0 / 6.0, abs=1e-4)

    def test_faction_responsiveness_positive_correlation(self) -> None:
        plugin = GroupDynamicsPlugin()
        # tension and hostile count vary together → strong positive Pearson
        samples = []
        for i in range(5):
            samples.append({
                "t": float(i),
                "group_policies": [],
                "group_state_targets": {},
                "fsm_counts": {},
                "hostile_count": i,            # 0, 1, 2, 3, 4
                "faction_tension": 0.1 * i,    # 0, 0.1, 0.2, 0.3, 0.4
                "threat": 0.0,
            })
        result = plugin.self_score(samples)
        assert result["faction_responsiveness"] == pytest.approx(1.0, abs=1e-4)

    def test_score_dimensions_match_spec(self) -> None:
        assert GroupDynamicsPlugin.score_dimensions == (
            "intent_entropy",
            "coalition_coupling",
            "state_target_obedience",
            "faction_responsiveness",
        )
