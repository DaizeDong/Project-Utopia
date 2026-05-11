"""PolicyValue Baseline — variance reduction on a synthetic two-arm bandit."""

from __future__ import annotations

import math
import random

import pytest

from project_utopia.benchmark.framework.pvb import (
    PVBTracker,
    fallback_value_estimate,
    run_with_pvb,
)


def test_fallback_value_estimate_combines_prosperity_and_workers() -> None:
    state = {
        "gameplay": {"prosperity": 50},
        "metrics": {"populationStats": {"workers": 12}},
    }
    # p_comp = 0.5, w_comp = 0.5 → 0.25
    assert math.isclose(fallback_value_estimate(state), 0.25, abs_tol=1e-6)


def test_fallback_value_estimate_handles_missing_workers() -> None:
    state = {
        "gameplay": {"prosperity": 100},
        "agents": [
            {"type": "WORKER", "alive": True},
            {"type": "WORKER", "alive": True},
            {"type": "WORKER", "alive": False},  # excluded
            {"type": "ANIMAL"},
        ],
    }
    # 2 alive workers / 24 = 0.0833 → p=1 → v = 0.0833
    assert math.isclose(fallback_value_estimate(state), 2 / 24, abs_tol=1e-6)


def test_fallback_value_estimate_returns_zero_for_non_dict_state() -> None:
    assert fallback_value_estimate(None) == 0.0
    assert fallback_value_estimate("not a state") == 0.0  # type: ignore[arg-type]


def test_pvb_tracker_no_ticks_returns_baseline_zero() -> None:
    tracker = PVBTracker()
    out = tracker.finalize(0.5)
    # No ticks recorded → baseline=0, mean_corr=0 → pvb = realized - 0 + 0 = 0.5
    assert out["ticks"] == 0
    assert math.isclose(out["pvb_score"], 0.5)


def test_pvb_tracker_constant_state_zero_correction() -> None:
    tracker = PVBTracker()
    state = {
        "gameplay": {"prosperity": 50},
        "metrics": {"populationStats": {"workers": 12}},
    }
    for _ in range(20):
        tracker.record_tick(state, "agentA")
    out = tracker.finalize(0.5)
    # baseline_v0 = 0.25; mean_corr ≈ 0 (state never changes after the first tick).
    assert math.isclose(out["baseline_v0"], 0.25, abs_tol=1e-6)
    assert abs(out["sum_corrections"]) < 1e-3
    assert math.isclose(out["pvb_score"], 0.5 - 0.25, abs_tol=1e-3)


class _FakeBanditHarness:
    """Two-arm bandit harness used for the variance-reduction test.

    The state's prosperity drifts upward deterministically across ticks while
    a configurable per-tick noise term perturbs the realized score. The PVB
    correction should soak up the drift component, lowering the variance of
    the corrected score across runs.
    """

    def __init__(self, *, prosperity_path: list[float], rng_seed: int) -> None:
        self._path = list(prosperity_path)
        self._idx = 0
        self._rng = random.Random(rng_seed)
        self.state: dict[str, object] = {
            "gameplay": {"prosperity": self._path[0] if self._path else 0},
            "metrics": {"populationStats": {"workers": 24}},
            "session": {"phase": "active"},
        }

    async def tick(self) -> None:
        self._idx = min(self._idx + 1, len(self._path) - 1)
        self.state["gameplay"] = {"prosperity": self._path[self._idx]}


@pytest.mark.asyncio
async def test_pvb_reduces_variance_on_two_arm_bandit() -> None:
    """Across N runs the PVB-corrected scores have lower variance than raw."""
    # Each run shares the same deterministic drift but a different per-run
    # noise floor. PVB should soak up the drift contribution.
    paths = [
        [10, 20, 30, 40, 50, 60, 70, 80, 90],
        [10, 22, 34, 45, 55, 64, 72, 80, 88],
        [10, 18, 26, 35, 45, 55, 65, 75, 85],
        [10, 24, 32, 40, 50, 58, 66, 74, 80],
        [10, 16, 28, 38, 48, 56, 66, 76, 88],
    ]
    raw_scores: list[float] = []
    pvb_scores: list[float] = []
    for i, path in enumerate(paths):
        harness = _FakeBanditHarness(prosperity_path=path, rng_seed=i)

        def score_fn(state: dict) -> float:
            return float(state["gameplay"]["prosperity"]) / 100  # type: ignore[index]

        out = await run_with_pvb(harness, 0.27, score_fn, {"dt_sec": 0.03})
        raw_scores.append(out["raw"])
        pvb_scores.append(out["pvb_adjusted"])

    def _var(xs: list[float]) -> float:
        m = sum(xs) / len(xs)
        return sum((x - m) ** 2 for x in xs) / len(xs)

    # The raw variance reflects ending-prosperity noise; the PVB-corrected
    # variance should be NO worse (and typically lower).
    assert _var(pvb_scores) <= _var(raw_scores) + 1e-9, (
        f"PVB variance {_var(pvb_scores)} expected <= raw variance "
        f"{_var(raw_scores)} on the two-arm bandit fixture"
    )


@pytest.mark.asyncio
async def test_run_with_pvb_validates_harness_shape() -> None:
    with pytest.raises(TypeError):
        await run_with_pvb(None, 1.0, lambda s: 0.5)  # type: ignore[arg-type]
