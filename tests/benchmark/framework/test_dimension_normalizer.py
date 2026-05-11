"""Per-dimension transform registry + reflective coverage."""

from __future__ import annotations

import math

import pytest

from project_utopia.benchmark.framework.dimension_normalizer import (
    DIMENSION_NORMALIZERS,
    build_sandwich_triple,
    gather_dimension_across_cells,
    normalize_dimension,
    normalize_row,
)


# All 19 dim keys the 5 plugins emit.
_REQUIRED_KEYS = {
    # RAE
    "rae_composite",
    "rae_sufficiency",
    "rae_distribution_gini",
    "rae_idle_capacity",
    "rae_path_overhead",
    # GroupDynamics
    "intent_entropy",
    "coalition_coupling",
    "state_target_obedience",
    "faction_responsiveness",
    # MemoryDegradation
    "anchored_fact_recall",
    "action_grounded_recall",
    "behavioral_drift",
    "performance_at_t",
    # DTE
    "dte_per_completion_token",
    "dte_per_decision",
    "first_token_latency_p50",
    # HierarchicalCoordination
    "plan_policy_alignment",
    "env_threat_responsiveness",
    "colony_cadence_health",
}


class TestRegistryCoverage:
    def test_every_required_key_is_registered(self) -> None:
        missing = _REQUIRED_KEYS - set(DIMENSION_NORMALIZERS.keys())
        assert not missing, f"DIMENSION_NORMALIZERS missing keys: {sorted(missing)}"

    def test_exactly_19_keys(self) -> None:
        # Strict equality so a future drift fails loudly.
        assert set(DIMENSION_NORMALIZERS.keys()) == _REQUIRED_KEYS

    def test_reflective_plugin_coverage(self) -> None:
        """If the dimension plugin module exists, every plugin's
        ``score_dimensions`` must be a subset of the registry.
        """
        try:
            from project_utopia.benchmark import dimensions as _dim_pkg  # noqa: F401
        except ImportError:
            pytest.skip(
                "project_utopia.benchmark.dimensions not yet ported (other Phase-2 agent)"
            )
        plugins = getattr(_dim_pkg, "ACADEMIC_BENCHMARK_DIMENSIONS", None)
        if not plugins:
            pytest.skip("No dimension plugins registered yet")
        for plugin in plugins:
            sd = set(getattr(plugin, "score_dimensions", ()) or ())
            unknown = sd - set(DIMENSION_NORMALIZERS.keys())
            assert not unknown, (
                f"Plugin {plugin!r} emits unknown dims: {sorted(unknown)}"
            )


class TestIdentityTransform:
    def test_value_in_range_passes_through(self) -> None:
        assert normalize_dimension("rae_composite", 0.42) == 0.42

    def test_clamps_below_zero(self) -> None:
        assert normalize_dimension("rae_composite", -0.5) == 0.0

    def test_clamps_above_one(self) -> None:
        assert normalize_dimension("rae_composite", 2.0) == 1.0


class TestInvertTransform:
    def test_inversion_arithmetic(self) -> None:
        assert math.isclose(normalize_dimension("behavioral_drift", 0.25), 0.75)

    def test_invert_clamps_negative_input(self) -> None:
        assert normalize_dimension("rae_idle_capacity", -1.0) == 1.0

    def test_invert_clamps_above_one_input(self) -> None:
        assert normalize_dimension("rae_idle_capacity", 2.0) == 0.0


class TestReciprocalTransform:
    def test_one_returns_one(self) -> None:
        assert normalize_dimension("rae_path_overhead", 1.0) == 1.0

    def test_two_returns_half(self) -> None:
        assert math.isclose(normalize_dimension("rae_path_overhead", 2.0), 0.5)

    def test_zero_returns_zero(self) -> None:
        assert normalize_dimension("rae_path_overhead", 0.0) == 0.0


class TestClipScaleTransform:
    def test_half_of_scale(self) -> None:
        # intent_entropy uses scale=4.32; 2.16 / 4.32 = 0.5
        assert math.isclose(normalize_dimension("intent_entropy", 2.16), 0.5, abs_tol=1e-6)

    def test_above_scale_clamps_to_one(self) -> None:
        assert normalize_dimension("intent_entropy", 100.0) == 1.0

    def test_negative_input_clamps_to_zero(self) -> None:
        assert normalize_dimension("intent_entropy", -1.0) == 0.0


class TestRescaleSymmetricTransform:
    def test_minus_one_maps_to_zero(self) -> None:
        assert normalize_dimension("coalition_coupling", -1.0) == 0.0

    def test_zero_maps_to_half(self) -> None:
        assert math.isclose(normalize_dimension("coalition_coupling", 0.0), 0.5)

    def test_one_maps_to_one(self) -> None:
        assert normalize_dimension("coalition_coupling", 1.0) == 1.0

    def test_out_of_range_clamps_to_endpoints(self) -> None:
        assert normalize_dimension("coalition_coupling", 5.0) == 1.0
        assert normalize_dimension("coalition_coupling", -5.0) == 0.0


class TestExponentialDecayTransform:
    def test_zero_input_returns_one_for_cost_form(self) -> None:
        # exponentialDecay with from_zero=False at x=0 → e^0 = 1
        assert math.isclose(normalize_dimension("colony_cadence_health", 0.0), 1.0)

    def test_large_input_decays_toward_zero(self) -> None:
        assert normalize_dimension("colony_cadence_health", 1000.0) < 1e-10

    def test_from_zero_benefit_form_starts_at_zero(self) -> None:
        # dte_per_decision uses from_zero=True; at x=0 → 1 - e^0 = 0
        assert math.isclose(normalize_dimension("dte_per_decision", 0.0), 0.0)

    def test_from_zero_saturates_above_scale(self) -> None:
        # dte_per_decision scale=1.0; at x=10 → 1 - e^{-10} ≈ 1
        assert normalize_dimension("dte_per_decision", 10.0) > 0.9999

    def test_negative_input_treated_as_zero(self) -> None:
        # The transform clamps x at 0 internally.
        assert math.isclose(normalize_dimension("colony_cadence_health", -5.0), 1.0)


class TestNonFiniteHandling:
    def test_nan_input_returns_zero(self) -> None:
        assert normalize_dimension("rae_composite", float("nan")) == 0.0

    def test_inf_input_returns_zero(self) -> None:
        assert normalize_dimension("rae_composite", float("inf")) == 0.0

    def test_string_input_returns_zero(self) -> None:
        assert normalize_dimension("rae_composite", "not_a_number") == 0.0  # type: ignore[arg-type]


class TestUnknownKey:
    def test_unknown_key_returns_nan(self) -> None:
        assert math.isnan(normalize_dimension("unknown_dim_key", 0.5))


class TestNormalizeRow:
    def test_known_keys_normalized_unknown_keys_preserved(self) -> None:
        row = {"rae_composite": 0.7, "future_dim": 99.0, "rae_idle_capacity": 0.3}
        out = normalize_row(row)
        assert out["rae_composite"] == 0.7
        assert math.isclose(out["rae_idle_capacity"], 0.7)
        assert out["future_dim"] == 99.0

    def test_none_input_returns_empty_dict(self) -> None:
        assert normalize_row(None) == {}


class TestGatherDimension:
    def test_basic_pluck(self) -> None:
        cells = [
            {"seed": 1, "scenario": "s1", "per_dimension_scores": {"rae_composite": 0.6}},
            {"seed": 2, "scenario": "s1", "per_dimension_scores": {"rae_composite": 0.4}},
        ]
        out = gather_dimension_across_cells(cells, "rae_composite")
        assert out == [
            {"seed": 1, "scenario": "s1", "value": 0.6},
            {"seed": 2, "scenario": "s1", "value": 0.4},
        ]

    def test_missing_value_surfaces_nan(self) -> None:
        cells = [{"seed": 1, "scenario": "s1", "per_dimension_scores": {}}]
        out = gather_dimension_across_cells(cells, "rae_composite")
        assert math.isnan(out[0]["value"])


class TestBuildSandwichTriple:
    def _cells(self, prefix: str, base: float) -> list[dict]:
        return [
            {
                "seed": s,
                "scenario": sc,
                "per_dimension_scores": {"rae_composite": base + 0.05 * s},
            }
            for s in (1, 2)
            for sc in ("s1", "s2")
        ]

    def test_alignment_succeeds(self) -> None:
        agent = self._cells("a", 0.4)
        fb = self._cells("f", 0.0)
        oracle = self._cells("o", 0.8)
        triple = build_sandwich_triple(agent, fb, oracle, "rae_composite")
        # 4 cells, sorted by (seed, scenario)
        assert len(triple["agent"]) == 4
        assert len(triple["fallback"]) == 4
        assert len(triple["oracle"]) == 4
        assert triple["keys"][0]["seed"] == 1
        assert triple["keys"][0]["scenario"] == "s1"

    def test_size_mismatch_raises(self) -> None:
        agent = self._cells("a", 0.4)
        fb = self._cells("f", 0.0)[:2]
        oracle = self._cells("o", 0.8)
        with pytest.raises(ValueError, match="size mismatch"):
            build_sandwich_triple(agent, fb, oracle, "rae_composite")

    def test_missing_key_raises(self) -> None:
        agent = [
            {"seed": 1, "scenario": "s1", "per_dimension_scores": {"rae_composite": 0.5}}
        ]
        fb = [
            {"seed": 1, "scenario": "s2", "per_dimension_scores": {"rae_composite": 0.0}}
        ]
        oracle = [
            {"seed": 1, "scenario": "s1", "per_dimension_scores": {"rae_composite": 0.9}}
        ]
        with pytest.raises(ValueError, match="missing matched"):
            build_sandwich_triple(agent, fb, oracle, "rae_composite")
