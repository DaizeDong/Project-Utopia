"""RAE geometric collapse — single-axis starvation drives composite below arithmetic mean.

The Crafter geometric mean formula ``exp((1/N) Σ ln(1+sᵢ)) - 1`` punishes
single-resource starvation: with food=0 and other two resources at 1.0,
the composite is ~0.587 (=2^(2/3)-1), strictly less than the arithmetic
mean (0.667). Tests both the helper and the end-to-end ``self_score`` path.
"""

from __future__ import annotations

import pytest

from project_utopia.benchmark.dimensions.resource_allocation_efficiency import (
    ResourceAllocationEfficiencyPlugin,
    crafter_geometric_mean,
)


class TestGeometricCollapse:
    def test_food_zero_with_others_one_drops_below_arithmetic(self) -> None:
        composite = crafter_geometric_mean([0.0, 1.0, 1.0])
        arithmetic = sum([0.0, 1.0, 1.0]) / 3
        # 2^(2/3) - 1 = 0.5874010...
        assert composite == pytest.approx(2 ** (2 / 3) - 1, abs=1e-4)
        # Geometric form punishes single-axis failure: well below arithmetic.
        assert composite < arithmetic
        assert composite < 0.60

    def test_all_resources_zero_composite_is_zero(self) -> None:
        assert crafter_geometric_mean([0.0, 0.0, 0.0]) == pytest.approx(0.0, abs=1e-9)

    def test_two_zeros_collapses_further(self) -> None:
        # Two starved resources → composite drops further below arithmetic.
        composite_one = crafter_geometric_mean([0.0, 1.0, 1.0])
        composite_two = crafter_geometric_mean([0.0, 0.0, 1.0])
        assert composite_two < composite_one

    def test_self_score_food_zero_collapses_composite(self) -> None:
        plugin = ResourceAllocationEfficiencyPlugin()
        # workers=8; food=0 → food_suf=0; wood/stone at full → 1.0
        samples = [
            {
                "t": 0.0,
                "food": 0.0,
                "wood": 3.2,    # 3.2 / (8 * 0.4) = 1.0
                "stone": 1.0,   # 1.0 / max(1, 8*0.1=0.8) = 1.0 (clamped via max(1, ...))
                "workers": 8,
                "idle_workers": 0,
            }
        ]
        result = plugin.self_score(samples)
        # Composite collapses well below arithmetic-mean expectation of 0.667.
        assert result["rae_composite"] < result["rae_sufficiency"] + 1e-6 or result["rae_sufficiency"] == 0.0
        assert result["rae_composite"] < 0.60  # 3-resource port value ~0.5874
        # Sufficiency (v1, food×wood) is exactly 0 when food=0.
        assert result["rae_sufficiency"] == pytest.approx(0.0, abs=1e-9)
