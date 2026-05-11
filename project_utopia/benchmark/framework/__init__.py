"""Benchmark framework — SimHarness, ScoringEngine, dimension protocol."""

from __future__ import annotations

from .crisis_injector import CRISIS_TYPES, CrisisInjector
from .decision_tracer import DecisionTracer
from .dimension_normalizer import (
    DIMENSION_NORMALIZERS,
    build_sandwich_triple,
    gather_dimension_across_cells,
    normalize_dimension,
    normalize_row,
)
from .dimension_plugin import DimensionPlugin
from .probe_collector import PROBES, run_probes
from .pvb import PVBTracker, fallback_value_estimate, run_with_pvb
from .scenario_sampler import (
    EDGE_CASES,
    SCENARIO_SPACE,
    compute_difficulty,
    generate_scenarios,
    scenario_to_preset,
)
from .scoring_engine import (
    bayes_factor,
    bayesian_score,
    cohen_d,
    compare_groups,
    compute_helm_mwr,
    consistency_adjusted_score,
    geometric_mean,
    relative_score,
    sandwich_normalize,
)
from .seed_matrix import (
    DEFAULT_DURATION_SEC,
    aggregate_per_seed_then_average,
    run_one_cell,
    run_seed_matrix,
    write_ndjson,
)
from .sim_harness import DT_SEC, SimHarness

__all__ = [
    "CRISIS_TYPES",
    "CrisisInjector",
    "DT_SEC",
    "DEFAULT_DURATION_SEC",
    "DIMENSION_NORMALIZERS",
    "DecisionTracer",
    "DimensionPlugin",
    "EDGE_CASES",
    "PROBES",
    "PVBTracker",
    "SCENARIO_SPACE",
    "SimHarness",
    "aggregate_per_seed_then_average",
    "bayes_factor",
    "bayesian_score",
    "build_sandwich_triple",
    "cohen_d",
    "compare_groups",
    "compute_difficulty",
    "compute_helm_mwr",
    "consistency_adjusted_score",
    "fallback_value_estimate",
    "gather_dimension_across_cells",
    "generate_scenarios",
    "geometric_mean",
    "normalize_dimension",
    "normalize_row",
    "relative_score",
    "run_one_cell",
    "run_probes",
    "run_seed_matrix",
    "run_with_pvb",
    "sandwich_normalize",
    "scenario_to_preset",
    "write_ndjson",
]
