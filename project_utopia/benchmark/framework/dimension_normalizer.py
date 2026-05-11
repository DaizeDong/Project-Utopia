"""Per-dimension transform layer (port of ``DimensionNormalizer.js``).

The 5 academic-benchmark dimension plugins emit raw scores on incompatible
scales — some [0,1] benefit-form, some cost-form, some symmetric in [-1,1],
some unbounded counts. ``ScoringEngine`` operations assume comparable [0,1]
benefit-form inputs; this module is the bridge.

Transforms (mirroring the JS source):

* ``identity``            — already in [0,1] benefit-form.
* ``invert``              — ``1 - x`` for [0,1] cost-form.
* ``reciprocal``          — ``1 / x`` for [1, +inf) cost-form.
* ``clipScale``           — ``clip01(x / scale)`` for unbounded benefit caps.
* ``rescaleSymmetric``    — ``(x + 1) / 2`` for [-1, 1] correlations.
* ``exponentialDecay``    — ``e^{-x/scale}`` (default), or
                            ``1 - e^{-x/scale}`` if ``from_zero=True``.

The registry (:data:`DIMENSION_NORMALIZERS`) MUST cover every dim key emitted
by the 5 plugins; the reflective coverage test enforces this at module
import time.
"""

from __future__ import annotations

import logging
import math
from types import MappingProxyType
from typing import Any

__all__ = [
    "DIMENSION_NORMALIZERS",
    "build_sandwich_triple",
    "gather_dimension_across_cells",
    "normalize_dimension",
    "normalize_row",
]

_log = logging.getLogger(__name__)


# Each registry entry is a frozen mapping. Use MappingProxyType so callers
# cannot mutate the canonical recipes by accident.
_RAW: dict[str, dict[str, Any]] = {
    # --- Identity (already [0,1] benefit-form) ------------------------------
    "rae_composite": {"transform": "identity"},
    "rae_sufficiency": {"transform": "identity"},
    "anchored_fact_recall": {"transform": "identity"},
    "action_grounded_recall": {"transform": "identity"},
    "performance_at_t": {"transform": "identity"},
    "state_target_obedience": {"transform": "identity"},
    "plan_policy_alignment": {"transform": "identity"},
    # --- [0,1] cost-form (higher = worse) ----------------------------------
    "rae_idle_capacity": {"transform": "invert", "domain": (0.0, 1.0)},
    "rae_distribution_gini": {"transform": "invert", "domain": (0.0, 1.0)},
    "behavioral_drift": {"transform": "invert", "domain": (0.0, 1.0)},
    # --- [1, +inf) cost-form (1 = best) ------------------------------------
    "rae_path_overhead": {"transform": "reciprocal", "domain": (1.0, math.inf)},
    # --- Unbounded benefit-form requiring scaling --------------------------
    "intent_entropy": {"transform": "clipScale", "scale": 4.32},
    # --- [-1, 1] symmetric correlations ------------------------------------
    "coalition_coupling": {"transform": "rescaleSymmetric", "domain": (-1.0, 1.0)},
    "faction_responsiveness": {"transform": "rescaleSymmetric", "domain": (-1.0, 1.0)},
    "env_threat_responsiveness": {"transform": "rescaleSymmetric", "domain": (-1.0, 1.0)},
    # --- Unbounded cost-form via e^{-x/scale} ------------------------------
    "colony_cadence_health": {"transform": "exponentialDecay", "scale": 30.0},
    "first_token_latency_p50": {"transform": "exponentialDecay", "scale": 1000.0},
    # --- Unbounded benefit-form via 1 - e^{-x/scale} -----------------------
    "dte_per_completion_token": {
        "transform": "exponentialDecay",
        "scale": 0.1,
        "from_zero": True,
    },
    "dte_per_decision": {"transform": "exponentialDecay", "scale": 1.0, "from_zero": True},
}

DIMENSION_NORMALIZERS: MappingProxyType[str, dict[str, Any]] = MappingProxyType(
    {k: MappingProxyType(dict(v)) for k, v in _RAW.items()}  # type: ignore[misc]
)


def _clamp01(v: float) -> float:
    if v < 0:
        return 0.0
    if v > 1:
        return 1.0
    return v


def _is_finite_num(v: Any) -> bool:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return False
    return math.isfinite(n)


def _apply_transform(recipe: dict[str, Any], value: float, dim_key: str) -> float:
    t = recipe.get("transform")
    if t == "identity":
        return _clamp01(value)
    if t == "invert":
        return _clamp01(1.0 - _clamp01(value))
    if t == "reciprocal":
        if value <= 0:
            return 0.0
        return _clamp01(1.0 / max(1.0, value))
    if t == "clipScale":
        scale = recipe.get("scale")
        if not _is_finite_num(scale) or float(scale) <= 0:
            _log.warning(
                "[DimensionNormalizer] %s: invalid scale=%s for clipScale; returning 0",
                dim_key,
                scale,
            )
            return 0.0
        return _clamp01(value / float(scale))
    if t == "rescaleSymmetric":
        clamped = max(-1.0, min(1.0, value))
        return _clamp01((clamped + 1.0) / 2.0)
    if t == "exponentialDecay":
        scale = recipe.get("scale")
        if not _is_finite_num(scale) or float(scale) <= 0:
            _log.warning(
                "[DimensionNormalizer] %s: invalid scale=%s for exponentialDecay; returning 0",
                dim_key,
                scale,
            )
            return 0.0
        from_zero = bool(recipe.get("from_zero") or recipe.get("fromZero"))
        x = max(0.0, value)
        decay = math.exp(-x / float(scale))
        return _clamp01(1.0 - decay) if from_zero else _clamp01(decay)
    _log.warning(
        "[DimensionNormalizer] %s: unknown transform '%s'; returning 0", dim_key, t
    )
    return 0.0


def normalize_dimension(dim_key: str, value: Any) -> float:
    """Normalize a single dim score to [0,1] benefit-form.

    Unknown key → ``NaN`` (with logger.warning). Non-finite value → ``0``
    (with logger.warning) — never NaN, to avoid silently contaminating a
    batch downstream.
    """
    recipe = DIMENSION_NORMALIZERS.get(dim_key)
    if recipe is None:
        _log.warning("[DimensionNormalizer] unknown dim key '%s'; returning NaN", dim_key)
        return float("nan")
    if not _is_finite_num(value):
        _log.warning(
            "[DimensionNormalizer] %s: non-finite input %s; returning 0", dim_key, value
        )
        return 0.0
    return _apply_transform(dict(recipe), float(value), dim_key)


def normalize_row(scores: dict[str, Any] | None) -> dict[str, float]:
    """Bulk-normalize a ``{dim_key: number}`` row.

    Unknown keys are preserved verbatim (matching JS) — caller may log a
    warning. Known keys go through :func:`normalize_dimension`.
    """
    if not isinstance(scores, dict):
        return {}
    out: dict[str, float] = {}
    for k, v in scores.items():
        if k in DIMENSION_NORMALIZERS:
            out[k] = normalize_dimension(k, v)
        else:
            out[k] = v  # type: ignore[assignment]
    return out


def gather_dimension_across_cells(
    cells: list[dict[str, Any]] | None, dim_key: str
) -> list[dict[str, Any]]:
    """Pluck ``cell.per_dimension_scores[dim_key]`` across cells.

    Cells use the SeedMatrix flat-row layout; per-dim scores live at
    ``cell['per_dimension_scores']`` (snake_case Python field name).
    """
    if not isinstance(cells, list):
        return []
    out: list[dict[str, Any]] = []
    for cell in cells:
        scores = (cell or {}).get("per_dimension_scores") or {}
        raw = scores.get(dim_key)
        out.append(
            {
                "seed": (cell or {}).get("seed"),
                "scenario": (cell or {}).get("scenario"),
                "value": float(raw) if _is_finite_num(raw) else float("nan"),
            }
        )
    return out


def _index_cells_by_seed_scenario(
    cells: list[dict[str, Any]] | None, dim_key: str
) -> dict[str, float]:
    m: dict[str, float] = {}
    if not isinstance(cells, list):
        return m
    for cell in cells:
        if not isinstance(cell, dict):
            continue
        seed = cell.get("seed")
        scenario = cell.get("scenario")
        if seed is None or scenario is None:
            continue
        v_raw = (cell.get("per_dimension_scores") or {}).get(dim_key)
        m[f"{seed}|{scenario}"] = float(v_raw) if _is_finite_num(v_raw) else float("nan")
    return m


def build_sandwich_triple(
    agent_cells: list[dict[str, Any]],
    fallback_cells: list[dict[str, Any]],
    oracle_cells: list[dict[str, Any]],
    dim_key: str,
) -> dict[str, Any]:
    """Build paired ``(agent, fallback, oracle)`` arrays for sandwich_normalize.

    The three cell sets MUST cover the same ``(seed, scenario)`` keys; missing
    coverage raises ``ValueError`` so the caller can detect pipeline
    misalignment rather than producing silently-wrong sandwich norms.
    """
    a_map = _index_cells_by_seed_scenario(agent_cells, dim_key)
    f_map = _index_cells_by_seed_scenario(fallback_cells, dim_key)
    o_map = _index_cells_by_seed_scenario(oracle_cells, dim_key)
    a_keys = set(a_map.keys())
    f_keys = set(f_map.keys())
    o_keys = set(o_map.keys())
    if len(a_keys) != len(f_keys) or len(a_keys) != len(o_keys):
        raise ValueError(
            f"build_sandwich_triple[{dim_key}]: cell-set size mismatch "
            f"(agent={len(a_keys)}, fallback={len(f_keys)}, oracle={len(o_keys)})"
        )
    for k in a_keys:
        if k not in f_keys or k not in o_keys:
            raise ValueError(
                f"build_sandwich_triple[{dim_key}]: missing matched "
                f"(seed,scenario)='{k}' in fallback or oracle cells"
            )

    def _sort_key(k: str) -> tuple[float, str]:
        seed_str, scenario = k.split("|", 1)
        try:
            return (float(seed_str), scenario)
        except ValueError:
            return (math.inf, scenario)

    sorted_keys = sorted(a_keys, key=_sort_key)
    agent: list[float] = []
    fallback: list[float] = []
    oracle: list[float] = []
    keys: list[dict[str, Any]] = []
    for k in sorted_keys:
        agent.append(a_map[k])
        fallback.append(f_map[k])
        oracle.append(o_map[k])
        seed_str, scenario = k.split("|", 1)
        try:
            seed_val: Any = int(seed_str)
        except ValueError:
            seed_val = seed_str
        keys.append({"seed": seed_val, "scenario": scenario})
    return {"agent": agent, "fallback": fallback, "oracle": oracle, "keys": keys}
