"""Tests for the Memory Degradation dimension plugin."""

from __future__ import annotations

import pytest

from project_utopia.benchmark.dimensions.memory_degradation import (
    MemoryDegradationPlugin,
)


class TestSelfScore:
    def test_empty_samples_returns_zero_defaults(self) -> None:
        plugin = MemoryDegradationPlugin()
        result = plugin.self_score([])
        assert result == {
            "anchored_fact_recall": 0.0,
            "action_grounded_recall": 0.0,
            "behavioral_drift": 0.0,
            "performance_at_t": 0.0,
        }

    def test_verbal_recall_token_hit(self) -> None:
        plugin = MemoryDegradationPlugin()
        samples = [
            {
                "t": 0.0,
                "memory_length": 100,
                "strategic_summary": "build a warehouse at (12,8) to stage cargo",
                "action_tokens": ["deliver", "warehouse"],
                "baseline_action_tokens": ["deliver", "warehouse"],
                "food": 5.0,
                "wood": 2.0,
                "workers": 5,
                "prosperity": 0.0,
                "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples, {"anchors": [{"token": "warehouse at (12,8)", "implicit_goals": ["deliver"]}]})
        assert result["anchored_fact_recall"] == pytest.approx(1.0, abs=1e-4)
        assert result["action_grounded_recall"] == pytest.approx(1.0, abs=1e-4)

    def test_action_recall_paper_anchor_shape(self) -> None:
        """Implicit goals as list-of-dicts (paper anchor shape)."""
        plugin = MemoryDegradationPlugin()
        samples = [
            {
                "t": 0.0,
                "memory_length": 0,
                "strategic_summary": "",
                "action_tokens": ["deliver"],
                "baseline_action_tokens": ["deliver"],
                "food": 0.0,
                "wood": 0.0,
                "workers": 1,
                "prosperity": 0.0,
                "threat": 0.0,
            }
        ]
        anchors = [
            {
                "verbal_tokens": ["warehouse at (12,8)"],
                "implicit_goals": [{"action": "deliver", "target": "warehouse"}],
            }
        ]
        result = plugin.self_score(samples, {"anchors": anchors})
        # "deliver" is in action_tokens → hit
        assert result["action_grounded_recall"] == pytest.approx(1.0, abs=1e-4)

    def test_behavioral_drift_full_overlap(self) -> None:
        plugin = MemoryDegradationPlugin()
        samples = [
            {
                "t": 0.0, "memory_length": 0, "strategic_summary": "",
                "action_tokens": ["deliver", "farm"],
                "baseline_action_tokens": ["deliver", "farm"],
                "food": 0.0, "wood": 0.0, "workers": 1, "prosperity": 0.0, "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples)
        # Jaccard = 1.0 → drift = 0
        assert result["behavioral_drift"] == pytest.approx(0.0, abs=1e-4)

    def test_behavioral_drift_no_overlap(self) -> None:
        plugin = MemoryDegradationPlugin()
        samples = [
            {
                "t": 0.0, "memory_length": 0, "strategic_summary": "",
                "action_tokens": ["smith", "guard"],
                "baseline_action_tokens": ["deliver", "farm"],
                "food": 0.0, "wood": 0.0, "workers": 1, "prosperity": 0.0, "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples)
        # Disjoint sets → Jaccard = 0 → drift = 1
        assert result["behavioral_drift"] == pytest.approx(1.0, abs=1e-4)

    def test_performance_at_t(self) -> None:
        plugin = MemoryDegradationPlugin()
        samples = [
            {
                "t": 0.0, "memory_length": 0, "strategic_summary": "",
                "action_tokens": [], "baseline_action_tokens": [],
                "food": 5.0, "wood": 0.0, "workers": 5, "prosperity": 0.0, "threat": 0.0,
            }
        ]
        result = plugin.self_score(samples)
        # food/workers = 1.0 (clamped), workers > 0 → performance = 1.0
        assert result["performance_at_t"] == pytest.approx(1.0, abs=1e-4)
