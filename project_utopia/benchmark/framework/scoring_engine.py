"""Bayesian Beta-Binomial scoring engine (port of ``ScoringEngine.js``).

Replaces hand-rolled ``lnGamma`` / ``betaIncomplete`` / ``betaQuantile`` with
``scipy.stats.beta``. Numerical results agree with the JS implementation to
>= 4 decimal places on the standard fixtures (see ``test_bayesian_match.py``
and ``test_bayesian_score.py``).

The pure-Python helpers — :func:`sandwich_normalize`, :func:`geometric_mean`,
:func:`consistency_adjusted_score`, :func:`cohen_d`, :func:`bayes_factor`,
:func:`relative_score`, :func:`compare_groups`, :func:`compute_helm_mwr` — keep
the JS algorithms byte-for-byte. In particular :func:`compute_helm_mwr`
preserves the strict-``>`` tie rule, the per-pair joint-dim handling, and the
single-agent degenerate (0) return.
"""

from __future__ import annotations

import math
from typing import Any

from scipy import stats

__all__ = [
    "bayes_factor",
    "bayesian_score",
    "cohen_d",
    "compare_groups",
    "compute_helm_mwr",
    "consistency_adjusted_score",
    "geometric_mean",
    "relative_score",
    "sandwich_normalize",
]


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------


def _round(value: float, digits: int = 2) -> float:
    """Mirror the JS ``round(v, d)`` helper.

    NaN/Infinity pass through unchanged (matches JS ``Number.isFinite`` gate).
    """
    try:
        n = float(value)
    except (TypeError, ValueError):
        return value
    if not math.isfinite(n):
        return n
    return float(f"{n:.{digits}f}")


def _is_finite(x: Any) -> bool:
    try:
        return math.isfinite(float(x))
    except (TypeError, ValueError):
        return False


def _to_finite_float(x: Any) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return float("nan")
    return v


# ---------------------------------------------------------------------------
# Bayesian score
# ---------------------------------------------------------------------------


def bayesian_score(scores: list[float]) -> dict[str, Any]:
    """Compute Beta(2,2)-prior posterior statistics from a [0,1] score vector.

    Returns the same JSON shape as the JS version: ``mean``, ``std``,
    ``ci95``, ``median``, ``p5``, ``p95``, ``posterior {alpha, beta}``.
    All numeric outputs are rounded to 4 decimal places (alpha/beta to 2)
    matching the JS rounding so direct numeric comparison is meaningful.

    Parameters
    ----------
    scores
        Iterable of floats, each ideally in ``[0,1]``.

    Returns
    -------
    dict
        Posterior summary plus ``posterior = {alpha, beta}``.

    Notes
    -----
    Empty input returns the prior (Beta(2,2)) summary statistics — the same
    defaults as JS.
    """
    if not scores:
        return {
            "mean": 0.5,
            "std": 0.29,
            "ci95": [0.05, 0.95],
            "median": 0.5,
            "p5": 0.05,
            "p95": 0.95,
            "posterior": {"alpha": 2, "beta": 2},
        }
    sum_x = float(sum(float(s) for s in scores))
    n = len(scores)
    alpha = 2.0 + sum_x
    beta = 2.0 + n - sum_x
    # scipy.stats.beta provides analytic mean/var/ppf.
    posterior = stats.beta(alpha, beta)
    mean = float(posterior.mean())
    std = float(posterior.std())
    return {
        "mean": _round(mean, 4),
        "std": _round(std, 4),
        "ci95": [
            _round(float(posterior.ppf(0.025)), 4),
            _round(float(posterior.ppf(0.975)), 4),
        ],
        "median": _round(float(posterior.ppf(0.5)), 4),
        "p5": _round(float(posterior.ppf(0.05)), 4),
        "p95": _round(float(posterior.ppf(0.95)), 4),
        "posterior": {"alpha": _round(alpha, 2), "beta": _round(beta, 2)},
    }


# ---------------------------------------------------------------------------
# Relative / sandwich scoring
# ---------------------------------------------------------------------------


def relative_score(agent_score: float, baseline_score: float, ceiling_score: float) -> float:
    """``(agent - baseline) / (ceiling - baseline)``, clipped to [0, 1].

    Degenerate range collapses to a binary above-baseline check, matching JS.
    """
    rng = float(ceiling_score) - float(baseline_score)
    if rng <= 0:
        return 1.0 if float(agent_score) > float(baseline_score) else 0.0
    val = (float(agent_score) - float(baseline_score)) / rng
    return max(0.0, min(1.0, val))


def sandwich_normalize(
    agent_scores: list[float],
    fallback_scores: list[float],
    oracle_scores: list[float],
    opts: dict[str, Any] | None = None,
) -> list[float]:
    """MeltingPot / Agapiou et al. 2022 sandwich normalization.

    ``S = (S_LLM - S_fallback) / (S_oracle - S_fallback)``

    The upper bound is **not** clipped by default (``S > 1`` flags a
    superhuman run); pass ``opts={'clip_upper_bound': True}`` to clip at 1.
    NaN-safe: degenerate range collapses to a binary above-baseline check,
    matching JS exactly. ``oracle < fallback`` returns NaN (oracle bug).
    """
    n = len(agent_scores)
    if n == 0:
        return []
    if len(fallback_scores) != n or len(oracle_scores) != n:
        raise ValueError(
            f"sandwich_normalize: array length mismatch "
            f"(agent={n}, fb={len(fallback_scores)}, oracle={len(oracle_scores)})"
        )
    clip_upper = bool(opts and opts.get("clip_upper_bound") is True)
    out: list[float] = []
    for i in range(n):
        rng = float(oracle_scores[i]) - float(fallback_scores[i])
        if not math.isfinite(rng):
            out.append(float("nan"))
            continue
        if rng < 0:
            # Oracle worse than fallback — oracle blueprint bug; surface NaN.
            out.append(float("nan"))
            continue
        if rng == 0:
            s = 1.0 if float(agent_scores[i]) > float(fallback_scores[i]) else 0.0
        else:
            s = (float(agent_scores[i]) - float(fallback_scores[i])) / rng
            if s < 0:
                s = 0.0
            if clip_upper and s > 1:
                s = 1.0
        out.append(_round(s, 4) if math.isfinite(s) else s)
    return out


# ---------------------------------------------------------------------------
# Aggregators
# ---------------------------------------------------------------------------


def geometric_mean(scores: list[float]) -> float:
    """Crafter geometric mean: ``exp(mean(log(1+s))) - 1``.

    Pure Python so it matches the JS computation byte-for-byte. Each ``s`` is
    clipped to ``[0, 1]`` first (defensive — same as JS).
    """
    if not scores:
        return 0.0
    n = len(scores)
    log_sum = 0.0
    for s in scores:
        try:
            v = float(s)
        except (TypeError, ValueError):
            v = 0.0
        if not math.isfinite(v):
            v = 0.0
        if v < 0:
            v = 0.0
        if v > 1:
            v = 1.0
        log_sum += math.log(1 + v)
    return _round(math.exp(log_sum / n) - 1, 6)


def consistency_adjusted_score(scores: list[float], lam: float = 0.5) -> float:
    """``max(0, mean - lambda * std)`` — same as JS."""
    if not scores:
        return 0.0
    mean = sum(float(s) for s in scores) / len(scores)
    variance = sum((float(s) - mean) ** 2 for s in scores) / len(scores)
    return max(0.0, mean - lam * math.sqrt(variance))


def cohen_d(group_a: list[float], group_b: list[float]) -> float:
    """Effect size Cohen's d. Pure Python."""
    if not group_a or not group_b:
        return 0.0
    mean_a = sum(float(s) for s in group_a) / len(group_a)
    mean_b = sum(float(s) for s in group_b) / len(group_b)
    var_a = sum((float(s) - mean_a) ** 2 for s in group_a) / len(group_a)
    var_b = sum((float(s) - mean_b) ** 2 for s in group_b) / len(group_b)
    pooled_std = math.sqrt((var_a + var_b) / 2)
    if pooled_std == 0:
        return 0.0
    return (mean_a - mean_b) / pooled_std


def bayes_factor(group_a: list[float], group_b: list[float]) -> float:
    """BF10 approximation via BIC. Pure Python."""
    n_a = len(group_a)
    n_b = len(group_b)
    if n_a < 2 or n_b < 2:
        return 1.0
    n = n_a + n_b
    all_vals = [float(x) for x in [*group_a, *group_b]]
    grand_mean = sum(all_vals) / n
    sse0 = sum((x - grand_mean) ** 2 for x in all_vals)
    mean_a = sum(float(s) for s in group_a) / n_a
    mean_b = sum(float(s) for s in group_b) / n_b
    sse1 = sum((float(s) - mean_a) ** 2 for s in group_a) + sum(
        (float(s) - mean_b) ** 2 for s in group_b
    )
    bic0 = n * math.log(max(1e-10, sse0 / n)) + 1 * math.log(n)
    bic1 = n * math.log(max(1e-10, sse1 / n)) + 2 * math.log(n)
    return math.exp((bic0 - bic1) / 2)


def compare_groups(treatment: list[float], control: list[float]) -> dict[str, Any]:
    """Generate a comparison verdict from two groups of scores (JS port)."""
    mean_t = sum(float(s) for s in treatment) / len(treatment) if treatment else 0.0
    mean_c = sum(float(s) for s in control) / len(control) if control else 0.0
    d = cohen_d(treatment, control)
    bf = bayes_factor(treatment, control)
    if bf > 10 and abs(d) > 0.5:
        verdict = "CONFIRMED_IMPROVEMENT"
    elif bf > 3 and abs(d) > 0.3:
        verdict = "LIKELY_IMPROVEMENT"
    elif bf < 1 / 3:
        verdict = "NO_EFFECT"
    else:
        verdict = "AMBIGUOUS"
    return {
        "deltaMean": _round(mean_t - mean_c, 4),
        "cohenD": _round(d, 3),
        "bayesFactor": _round(bf, 2),
        "verdict": verdict,
    }


# ---------------------------------------------------------------------------
# HELM Mean Win Rate (Layer 4b)
# ---------------------------------------------------------------------------


def compute_helm_mwr(
    per_agent_dimension_scores: dict[str, dict[str, float]] | None,
) -> dict[str, float]:
    """HELM Mean Win Rate (Liang et al. 2022 / TMLR 2023, §F.4).

    For each pair ``(m, m')`` where ``m != m'``:
      - ``joint_dims`` = dims where both agents have a finite score.
      - ``wins`` = count of joint dims where ``score(m, d) > score(m', d)``.
      - ``pairwise_rate`` = ``wins / joint_dims`` if joint_dims > 0 else 0.
    ``MWR(m)`` = mean of pairwise_rate over all opponents.

    Tie handling: strict ``>``; ties contribute 0 to neither side. Missing
    dims are joint-only. Single-agent input returns 0 for that agent. Empty /
    None input returns ``{}``.
    """
    if per_agent_dimension_scores is None:
        return {}
    scores_map = per_agent_dimension_scores
    if not isinstance(scores_map, dict):
        return {}
    agent_ids = list(scores_map.keys())
    out: dict[str, float] = {}
    if not agent_ids:
        return out
    if len(agent_ids) == 1:
        out[agent_ids[0]] = 0.0
        return out

    for i in agent_ids:
        scores_i = scores_map.get(i) or {}
        pair_winrate_sum = 0.0
        pair_count = 0
        for j in agent_ids:
            if j == i:
                continue
            scores_j = scores_map.get(j) or {}
            dims: set[str] = set(scores_i.keys()) | set(scores_j.keys())
            wins = 0
            joint = 0
            for d in dims:
                a = _to_finite_float(scores_i.get(d))
                b = _to_finite_float(scores_j.get(d))
                if not math.isfinite(a) or not math.isfinite(b):
                    continue
                joint += 1
                if a > b:
                    wins += 1
            if joint == 0:
                pair_winrate_sum += 0.0
            else:
                pair_winrate_sum += wins / joint
            pair_count += 1
        out[i] = _round(pair_winrate_sum / pair_count, 4) if pair_count > 0 else 0.0
    return out
