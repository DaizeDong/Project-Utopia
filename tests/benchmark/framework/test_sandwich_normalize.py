"""sandwich_normalize — paired-by-(seed,scenario) ratio."""

from __future__ import annotations

import math

import pytest

from project_utopia.benchmark.framework.scoring_engine import sandwich_normalize


def test_basic_ratio() -> None:
    # range = 1 - 0 = 1; S = (0.5 - 0) / 1 = 0.5
    out = sandwich_normalize([0.5, 0.75], [0.0, 0.0], [1.0, 1.0])
    assert out == [0.5, 0.75]


def test_oracle_equals_fallback_above_baseline_returns_1() -> None:
    # range == 0 and agent > fallback → 1
    out = sandwich_normalize([0.6], [0.5], [0.5])
    assert out == [1.0]


def test_oracle_equals_fallback_below_baseline_returns_0() -> None:
    out = sandwich_normalize([0.4], [0.5], [0.5])
    assert out == [0.0]


def test_agent_above_oracle_score_above_1() -> None:
    # No upper-bound clipping by default → S > 1 signals "superhuman".
    out = sandwich_normalize([1.2], [0.0], [1.0])
    assert out == [1.2]


def test_agent_above_oracle_clipped_when_opt_in() -> None:
    out = sandwich_normalize([1.2], [0.0], [1.0], {"clip_upper_bound": True})
    assert out == [1.0]


def test_agent_below_fallback_floored_at_zero() -> None:
    # S < 0 always clamps to 0 (matches JS).
    out = sandwich_normalize([-0.5], [0.0], [1.0])
    assert out == [0.0]


def test_oracle_worse_than_fallback_returns_nan() -> None:
    # Oracle < fallback is an oracle blueprint bug; surface NaN.
    out = sandwich_normalize([0.5], [0.8], [0.4])
    assert math.isnan(out[0])


def test_length_mismatch_raises() -> None:
    with pytest.raises(ValueError, match="length mismatch"):
        sandwich_normalize([0.5], [0.0, 0.0], [1.0])


def test_empty_input_returns_empty_list() -> None:
    assert sandwich_normalize([], [], []) == []


def test_nan_oracle_propagates() -> None:
    out = sandwich_normalize([0.5], [0.0], [float("nan")])
    assert math.isnan(out[0])
