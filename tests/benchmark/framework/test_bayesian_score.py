"""Bayesian Beta-Binomial scoring (scipy port).

Mirrors ``test/scoring-engine.test.js`` for the ``bayesianScore`` function
and adds edge cases for empty input, all-1.0, all-0.0, and single-N.
"""

from __future__ import annotations

import math

import pytest

from project_utopia.benchmark.framework.scoring_engine import bayesian_score


class TestBayesianScore:
    def test_empty_returns_prior(self) -> None:
        r = bayesian_score([])
        assert r["mean"] == 0.5
        assert r["median"] == 0.5
        assert r["ci95"] == [0.05, 0.95]
        assert r["posterior"]["alpha"] == 2
        assert r["posterior"]["beta"] == 2

    def test_single_observation_skews_posterior(self) -> None:
        r = bayesian_score([0.8])
        # alpha = 2 + 0.8 = 2.8; beta = 2 + 1 - 0.8 = 2.2; mean ≈ 0.56
        assert abs(r["mean"] - 0.56) < 1e-3
        # CI95 covers the prior mean.
        assert r["ci95"][0] < 0.5 < r["ci95"][1]

    def test_all_ones_pushes_mean_up(self) -> None:
        r = bayesian_score([1.0, 1.0, 1.0, 1.0, 1.0])
        # alpha = 7, beta = 2; mean = 7/9 ≈ 0.778
        assert abs(r["mean"] - 0.7778) < 1e-3
        assert r["ci95"][0] < r["mean"] < r["ci95"][1]

    def test_all_zeros_pulls_mean_down(self) -> None:
        r = bayesian_score([0.0, 0.0, 0.0, 0.0, 0.0])
        # alpha = 2, beta = 7; mean = 2/9 ≈ 0.222
        assert abs(r["mean"] - 0.2222) < 1e-3

    def test_credible_interval_orderings(self) -> None:
        r = bayesian_score([0.5, 0.5, 0.5, 0.5])
        lo, hi = r["ci95"]
        assert 0 <= lo < r["median"] < hi <= 1
        assert lo < r["p5"] or math.isclose(lo, r["p5"], abs_tol=1e-4)
        assert r["p95"] < hi or math.isclose(r["p95"], hi, abs_tol=1e-4)


# Numerical-match fixtures vs. JS implementation. JS values were captured
# from ``node -e "console.log(JSON.stringify(bayesianScore([...])))"``.
# Tolerance: 4 decimal places (matches the JS round(_, 4) precision).
_JS_FIXTURES = (
    {
        "name": "all_1",
        "scores": [1, 1, 1, 1, 1],
        "expected": {
            "mean": 0.7778,
            "std": 0.1315,
            "ci95": [0.4735, 0.9682],
            "median": 0.7989,
            "p5": 0.5293,
            "p95": 0.9536,
            "alpha": 7,
            "beta": 2,
        },
    },
    {
        "name": "all_0",
        "scores": [0, 0, 0, 0, 0],
        "expected": {
            "mean": 0.2222,
            "std": 0.1315,
            "ci95": [0.0319, 0.5266],
            "median": 0.2011,
            "p5": 0.0464,
            "p95": 0.4707,
            "alpha": 2,
            "beta": 7,
        },
    },
    {
        "name": "half",
        "scores": [0.5, 0.5, 0.5, 0.5, 0.5],
        "expected": {
            "mean": 0.5,
            "std": 0.1581,
            "ci95": [0.199, 0.8011],
            "median": 0.5,
            "p5": 0.2393,
            "p95": 0.7607,
            "alpha": 4.5,
            "beta": 4.5,
        },
    },
    {
        "name": "mix",
        "scores": [0.1, 0.9, 0.3, 0.7, 0.5],
        "expected": {
            "mean": 0.5,
            "std": 0.1581,
            "ci95": [0.199, 0.8011],
            "median": 0.5,
            "p5": 0.2393,
            "p95": 0.7607,
            "alpha": 4.5,
            "beta": 4.5,
        },
    },
    {
        "name": "single",
        "scores": [0.8],
        "expected": {
            "mean": 0.56,
            "std": 0.2026,
            "ci95": [0.1636, 0.9123],
            "median": 0.5686,
            "p5": 0.2133,
            "p95": 0.8772,
            "alpha": 2.8,
            "beta": 2.2,
        },
    },
    {
        "name": "two",
        "scores": [0.2, 0.4],
        "expected": {
            "mean": 0.4333,
            "std": 0.1873,
            "ci95": [0.104, 0.804],
            "median": 0.4255,
            "p5": 0.1393,
            "p95": 0.7545,
            "alpha": 2.6,
            "beta": 3.4,
        },
    },
)


class TestBayesianMatch:
    """Numerical agreement with the JS implementation to >= 4 decimals."""

    @pytest.mark.parametrize("fixture", _JS_FIXTURES, ids=[f["name"] for f in _JS_FIXTURES])
    def test_matches_js_reference(self, fixture: dict) -> None:
        r = bayesian_score(fixture["scores"])
        e = fixture["expected"]
        # The JS posterior.alpha/beta carry 2-decimal precision (round(_, 2));
        # the bisection-based JS quantile may differ from scipy's analytic
        # ppf by ~1e-4 — well within the 4dp tolerance required.
        tol = 5e-4
        assert math.isclose(r["mean"], e["mean"], abs_tol=tol), (
            f"mean mismatch: py={r['mean']} vs js={e['mean']}"
        )
        assert math.isclose(r["std"], e["std"], abs_tol=tol)
        assert math.isclose(r["median"], e["median"], abs_tol=tol)
        assert math.isclose(r["p5"], e["p5"], abs_tol=tol)
        assert math.isclose(r["p95"], e["p95"], abs_tol=tol)
        assert math.isclose(r["ci95"][0], e["ci95"][0], abs_tol=tol)
        assert math.isclose(r["ci95"][1], e["ci95"][1], abs_tol=tol)
        assert math.isclose(r["posterior"]["alpha"], e["alpha"], abs_tol=tol)
        assert math.isclose(r["posterior"]["beta"], e["beta"], abs_tol=tol)
