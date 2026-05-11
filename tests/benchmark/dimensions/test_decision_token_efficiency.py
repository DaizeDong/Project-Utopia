"""Tests for the Decision Token Efficiency dimension plugin (RC3 B1 fix)."""

from __future__ import annotations

import pytest

from project_utopia.benchmark.dimensions.decision_token_efficiency import (
    DecisionTokenEfficiencyPlugin,
)


class TestSelfScore:
    def test_less_than_two_samples_returns_zero(self) -> None:
        plugin = DecisionTokenEfficiencyPlugin()
        result = plugin.self_score([])
        assert result == {
            "dte_per_completion_token": 0.0,
            "dte_per_decision": 0.0,
            "first_token_latency_p50": 0.0,
        }
        result_one = plugin.self_score([{"prompt_tokens": 0, "completion_tokens": 0, "response_count": 0}])
        assert result_one["dte_per_completion_token"] == 0.0

    def test_two_samples_compute_delta(self) -> None:
        plugin = DecisionTokenEfficiencyPlugin()
        samples = [
            {
                "t": 0.0,
                "prompt_tokens": 0, "completion_tokens": 100,
                "first_token_latency_ms": 200.0, "response_count": 1,
                "food": 0.0, "workers": 5,
            },
            {
                "t": 60.0,
                "prompt_tokens": 0, "completion_tokens": 200,
                "first_token_latency_ms": 250.0, "response_count": 2,
                "food": 10.0, "workers": 5,
            },
        ]
        result = plugin.self_score(samples)
        # task_score_first = 1 * ln(1+0) = 0
        # task_score_last = 1 * ln(1+10) ≈ 2.3979
        # tokens = 200 - 100 = 100; decisions = 2 - 1 = 1
        # per_token ≈ 2.3979/100 ≈ 0.0240; per_decision ≈ 2.3979
        assert result["dte_per_completion_token"] == pytest.approx(0.023979, abs=1e-4)
        assert result["dte_per_decision"] == pytest.approx(2.3979, abs=1e-3)
        # p50 of [200, 250] is sorted[1] (floor(2/2)=1) → 250
        assert result["first_token_latency_p50"] == pytest.approx(250.0, abs=1e-4)

    def test_score_dimensions_match_spec(self) -> None:
        assert DecisionTokenEfficiencyPlugin.score_dimensions == (
            "dte_per_completion_token",
            "dte_per_decision",
            "first_token_latency_p50",
        )
