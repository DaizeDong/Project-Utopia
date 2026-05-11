"""Tests for the Resource-Allocation Efficiency dimension plugin."""

from __future__ import annotations

import pytest

from project_utopia.benchmark.dimensions.resource_allocation_efficiency import (
    ResourceAllocationEfficiencyPlugin,
    crafter_geometric_mean,
)


class TestSelfScore:
    def test_empty_samples_returns_defaults(self) -> None:
        plugin = ResourceAllocationEfficiencyPlugin()
        result = plugin.self_score([])
        assert result == {
            "rae_composite": 0.0,
            "rae_sufficiency": 0.0,
            "rae_distribution_gini": 0.0,
            "rae_idle_capacity": 0.0,
            "rae_path_overhead": 1.0,
        }

    def test_fixture_sample_produces_expected_keys(self) -> None:
        plugin = ResourceAllocationEfficiencyPlugin()
        samples = [
            {
                "t": 100.0,
                "food": 8.0,     # 8 / (8*1.0) = 1.0
                "wood": 3.2,     # 3.2 / (8*0.4) = 1.0
                "stone": 1.0,    # 1.0 / max(1, 8*0.1=0.8) = 1.0
                "herbs": 1.0,    # 1.0 / max(1, 8*0.05=0.4) = 1.0
                "workers": 8,
                "idle_workers": 1,
                "prosperity": 0.5,
                "threat": 0.0,
            },
        ]
        result = plugin.self_score(samples)
        # All four sufficiencies = 1.0 → composite = 1.0, sufficiency = 1.0
        assert result["rae_composite"] == pytest.approx(1.0, abs=1e-4)
        assert result["rae_sufficiency"] == pytest.approx(1.0, abs=1e-4)
        # 1 idle / 8 workers = 0.125
        assert result["rae_idle_capacity"] == pytest.approx(0.125, abs=1e-4)
        assert result["rae_path_overhead"] == 1.0
        # All keys present
        for key in ResourceAllocationEfficiencyPlugin.score_dimensions:
            assert key in result

    def test_gini_zero_when_uniform(self) -> None:
        plugin = ResourceAllocationEfficiencyPlugin()
        samples = [
            {
                "t": 0.0,
                "food": 5.0,
                "wood": 5.0,
                "stone": 5.0,
                "herbs": 5.0,
                "workers": 5,
                "idle_workers": 0,
            }
        ]
        result = plugin.self_score(samples)
        assert result["rae_distribution_gini"] == pytest.approx(0.0, abs=1e-4)


class TestCrafterGeometricMean:
    def test_all_ones(self) -> None:
        assert crafter_geometric_mean([1.0, 1.0, 1.0, 1.0]) == pytest.approx(1.0, abs=1e-9)

    def test_all_zeros(self) -> None:
        assert crafter_geometric_mean([0.0, 0.0, 0.0, 0.0]) == pytest.approx(0.0, abs=1e-9)

    def test_empty(self) -> None:
        assert crafter_geometric_mean([]) == 0.0
