"""SeedMatrix aiRuntime passthrough — port of ``test/seed-matrix-aiRuntime-passthrough.test.js``.

Asserts the RC3 B1 fix: SeedMatrix reads from ``state.metrics['ai_runtime']``
(snake_case dict key per Python conventions), remaps the 3 legacy counters,
and passes through the 7 S5 token-telemetry fields verbatim.
"""

from __future__ import annotations

import math

import pytest

from project_utopia.benchmark.framework.seed_matrix import (
    aggregate_per_seed_then_average,
    run_seed_matrix,
)
from project_utopia.simulation.ai.llm.agent_adapter import NoopAgentAdapter

_TOKEN_KEYS = (
    "promptTokens",
    "completionTokens",
    "cachedTokens",
    "kvCacheHits",
    "prefixHits",
    "firstTokenLatencyMs",
    "tokensPerSec",
)


@pytest.mark.asyncio
async def test_ai_runtime_passthrough_noop_adapter_produces_fallback_calls() -> None:
    """With NoopAgentAdapter every request falls back → fallbackCalls > 0."""
    result = await run_seed_matrix(
        {
            "seeds": [42],
            "scenarios": ["temperate_plains"],
            "ai_enabled": True,
            "agent_config": {"adapter_class": NoopAgentAdapter, "adapter_opts": {}},
            "duration_sec": 4,
            "dimension_opts": {"interval_sec": 2, "duration_sec": 4},
        }
    )
    assert len(result["cells"]) == 1
    cell = result["cells"][0]

    rt = cell["ai_runtime"]
    assert math.isfinite(float(rt["totalCalls"]))
    assert math.isfinite(float(rt["fallbackCalls"]))
    assert math.isfinite(float(rt["schemaErrors"]))

    # Core regression: Noop always falls back → fallbackCalls > 0.
    assert rt["fallbackCalls"] > 0, (
        f"expected fallbackCalls > 0 with NoopAgentAdapter, got {rt['fallbackCalls']}. "
        "If 0, SeedMatrix is reading aiRuntime from the wrong path again."
    )

    # All 7 S5 token-telemetry keys present and finite.
    for key in _TOKEN_KEYS:
        assert key in rt, f"ai_runtime missing token-telemetry key '{key}'"
        assert math.isfinite(float(rt[key])), (
            f"ai_runtime.{key} must be finite, got {rt[key]}"
        )


@pytest.mark.asyncio
async def test_cell_shape_contract() -> None:
    """The cell return shape matches the contract documented in the conventions."""
    result = await run_seed_matrix(
        {
            "seeds": [1],
            "scenarios": ["temperate_plains"],
            "ai_enabled": True,
            "agent_config": {"adapter_class": NoopAgentAdapter},
            "duration_sec": 2,
        }
    )
    assert len(result["cells"]) == 1
    cell = result["cells"][0]
    for key in ("seed", "scenario", "agent_id", "per_dimension_scores", "ai_runtime", "outcome", "wallclock_ms"):
        assert key in cell, f"cell missing key '{key}'"
    assert cell["agent_id"] == "NoopAgentAdapter"


@pytest.mark.asyncio
async def test_aggregate_per_seed_then_average_empty() -> None:
    out = aggregate_per_seed_then_average([], "rae_composite")
    assert out["meanPerSeed"] == []
    assert out["grandMean"] == 0.0
    assert out["grandStd"] == 0.0


@pytest.mark.asyncio
async def test_aggregate_per_seed_then_average_per_seed_first() -> None:
    cells = [
        {"seed": 1, "scenario": "a", "per_dimension_scores": {"rae_composite": 0.6}},
        {"seed": 1, "scenario": "b", "per_dimension_scores": {"rae_composite": 0.8}},
        {"seed": 2, "scenario": "a", "per_dimension_scores": {"rae_composite": 0.4}},
        {"seed": 2, "scenario": "b", "per_dimension_scores": {"rae_composite": 0.4}},
    ]
    out = aggregate_per_seed_then_average(cells, "rae_composite")
    # seed 1 mean = 0.7; seed 2 mean = 0.4; grand = 0.55
    assert math.isclose(sorted(out["meanPerSeed"])[1], 0.7, abs_tol=1e-9)
    assert math.isclose(sorted(out["meanPerSeed"])[0], 0.4, abs_tol=1e-9)
    assert math.isclose(out["grandMean"], 0.55, abs_tol=1e-9)


@pytest.mark.asyncio
async def test_missing_seeds_raises() -> None:
    with pytest.raises(ValueError):
        await run_seed_matrix({"scenarios": ["temperate_plains"]})


@pytest.mark.asyncio
async def test_missing_scenarios_raises() -> None:
    with pytest.raises(ValueError):
        await run_seed_matrix({"seeds": [1]})
