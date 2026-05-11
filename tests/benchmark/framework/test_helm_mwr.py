"""HELM Mean Win Rate — port of ``test/scoring-engine-helm-mwr.test.js``.

7 test cases mirror the JS suite exactly. Algorithm:

* For each pair (m, m'), m != m':
    joint_dims = scenarios × dims both have
    wins = count of joint dims where score(m, d) > score(m', d)
    pairwise_rate = wins / joint_dims if joint_dims > 0 else 0
* MWR(m) = mean(pairwise_rate over all m' != m).
"""

from __future__ import annotations

import math

from project_utopia.benchmark.framework.scoring_engine import compute_helm_mwr


def test_two_agent_symmetric_dominant_one_dominated_zero() -> None:
    scores = {
        "alpha": {"rae": 0.9, "mem": 0.8, "dte": 0.7},
        "beta": {"rae": 0.4, "mem": 0.3, "dte": 0.2},
    }
    mwr = compute_helm_mwr(scores)
    assert mwr["alpha"] == 1.0
    assert mwr["beta"] == 0.0


def test_three_agent_rock_paper_scissor_all_half() -> None:
    scores = {
        "A": {"d1": 1.0, "d2": 0.0, "d3": 1.0, "d4": 0.0, "d5": 0.0, "d6": 1.0},
        "B": {"d1": 0.0, "d2": 1.0, "d3": 0.0, "d4": 1.0, "d5": 1.0, "d6": 0.0},
        "C": {"d1": 0.5, "d2": 0.5, "d3": 0.5, "d4": 0.5, "d5": 0.5, "d6": 0.5},
    }
    mwr = compute_helm_mwr(scores)
    assert mwr["A"] == 0.5
    assert mwr["B"] == 0.5
    assert mwr["C"] == 0.5


def test_missing_dim_only_counted_for_shared_pairs() -> None:
    scores = {
        "alpha": {"rae": 0.9, "mem": 0.8, "dte": 0.5},
        "beta": {"rae": 0.4, "mem": 0.7},  # no dte
        "gamma": {"rae": 0.5},  # only rae
    }
    mwr = compute_helm_mwr(scores)
    # alpha vs beta: joint = {rae, mem}, alpha wins both → 2/2 = 1
    # alpha vs gamma: joint = {rae}, alpha wins → 1/1 = 1
    # alpha MWR = mean(1, 1) = 1.0
    assert mwr["alpha"] == 1.0
    # beta vs alpha: 0/2 = 0; beta vs gamma: beta(0.4) < gamma(0.5) → 0; mean = 0
    assert mwr["beta"] == 0.0
    # gamma vs alpha: 0; gamma vs beta: 1; mean = 0.5
    assert mwr["gamma"] == 0.5


def test_strict_greater_means_ties_do_not_count() -> None:
    scores = {
        "alpha": {"d1": 0.5, "d2": 0.5},
        "beta": {"d1": 0.5, "d2": 0.5},
    }
    mwr = compute_helm_mwr(scores)
    assert mwr["alpha"] == 0.0
    assert mwr["beta"] == 0.0


def test_single_agent_returns_zero() -> None:
    mwr = compute_helm_mwr({"alpha": {"rae": 0.9}})
    assert mwr == {"alpha": 0.0}


def test_empty_or_none_returns_empty_dict() -> None:
    assert compute_helm_mwr({}) == {}
    assert compute_helm_mwr(None) == {}


def test_pair_with_zero_shared_dims_contributes_zero() -> None:
    scores = {
        "alpha": {"d1": 0.9},
        "beta": {"d2": 0.9},
        "gamma": {"d1": 0.5, "d2": 0.5},
    }
    mwr = compute_helm_mwr(scores)
    # alpha vs beta: 0 shared → contributes 0
    # alpha vs gamma: shares d1; alpha(0.9) > gamma(0.5) → 1
    # alpha MWR = mean(0, 1) = 0.5
    assert mwr["alpha"] == 0.5
    # beta vs alpha: 0 shared → 0
    # beta vs gamma: shares d2; beta(0.9) > gamma(0.5) → 1
    # beta MWR = mean(0, 1) = 0.5
    assert mwr["beta"] == 0.5
    # gamma vs alpha: shares d1; gamma(0.5) < alpha(0.9) → 0
    # gamma vs beta: shares d2; gamma(0.5) < beta(0.9) → 0
    # gamma MWR = 0
    assert mwr["gamma"] == 0.0


def test_nan_scores_are_skipped() -> None:
    # A dim with NaN on one side is dropped for that pair.
    scores = {
        "alpha": {"d1": 0.9, "d2": float("nan")},
        "beta": {"d1": 0.4, "d2": 0.7},
    }
    mwr = compute_helm_mwr(scores)
    # Only d1 is joint (d2 has NaN on alpha → skipped).
    # alpha wins 1/1 = 1; beta wins 0/1 = 0.
    assert math.isclose(mwr["alpha"], 1.0)
    assert math.isclose(mwr["beta"], 0.0)
