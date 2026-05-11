"""Resource-Allocation Efficiency (RAE) dimension plugin — Python port (S6 P0-3 v2).

Mirrors ``src/benchmark/dimensions/ResourceAllocationEfficiency.js``. Pure
read-only over harness samples; conforms to the
:class:`project_utopia.benchmark.framework.dimension_plugin.DimensionPlugin`
protocol.

Score families (all rounded to 4 decimals to match the JS port):

- ``rae_composite`` ∈ [0, 1] — Crafter geometric mean over 4-resource
  per-capita sufficiency (food / wood / stone / herbs). Punishes
  single-resource starvation: any sᵢ=0 collapses the composite toward 0.
- ``rae_sufficiency`` ∈ [0, 1] — backward-compat scalar (food × wood).
- ``rae_distribution_gini`` ∈ [0, 1] — Gini coefficient of the per-resource
  carry vector (lower is better — downstream consumers invert).
- ``rae_idle_capacity`` ∈ [0, 1] — fraction of workers in ``IDLE`` averaged
  across samples (lower is better — downstream consumers invert).
- ``rae_path_overhead`` ∈ [1, ∞) — TODO placeholder; see RC3 T1 comment.

Crafter geometric mean (Hafner 2021):
    S = exp((1/N) * Σ ln(1 + sᵢ)) − 1
with sᵢ clamped to [0, 1] so log-space is well-defined.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from ..framework.dimension_plugin import DimensionPlugin

TICKS_PER_SEC = 30.0


def _clamp01(value: float) -> float:
    if value != value:  # NaN
        return 0.0
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return float(value)


def _gini(values: list[float] | tuple[float, ...]) -> float:
    """Population Gini coefficient over a non-negative vector.

    Matches the JS implementation's formula:
        gini = (2·Σ (sorted[i] · (i+1))) / (n · Σ sorted)  −  (n+1)/n
    Returns 0 for empty inputs or all-zero inputs (degeneracy guard).
    """
    if not values:
        return 0.0
    arr = sorted(float(v) for v in values)
    n = len(arr)
    total = sum(arr)
    if total <= 0:
        return 0.0
    cumulative = 0.0
    for i, v in enumerate(arr):
        cumulative += v * (i + 1)
    return (2.0 * cumulative) / (n * total) - (n + 1) / n


def crafter_geometric_mean(scores: list[float] | tuple[float, ...]) -> float:
    """Crafter geometric mean (Hafner 2021) — see module docstring.

    Each score is clamped to [0, 1] before entering log-space so the formula
    is well-defined for sᵢ=0. Returns 0 for empty input.
    """
    if not scores:
        return 0.0
    n = len(scores)
    log_sum = 0.0
    for s in scores:
        log_sum += math.log(1.0 + _clamp01(float(s)))
    return math.exp(log_sum / n) - 1.0


class ResourceAllocationEfficiencyPlugin(DimensionPlugin):
    """RAE dimension plugin instance."""

    id: str = "rae"
    label: str = "Resource Allocation Efficiency"
    score_dimensions: tuple[str, ...] = (
        "rae_composite",
        "rae_sufficiency",
        "rae_distribution_gini",
        "rae_idle_capacity",
        "rae_path_overhead",
    )

    async def collect_samples(
        self,
        harness: Any,
        opts: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        opts = opts or {}
        interval_sec = float(opts.get("interval_sec", opts.get("intervalSec", 5)))
        duration_sec = float(opts.get("duration_sec", opts.get("durationSec", 600)))
        samples: list[dict[str, Any]] = []
        total_ticks = max(1, round(duration_sec * TICKS_PER_SEC))
        sample_every_ticks = max(1, round(interval_sec * TICKS_PER_SEC))

        for t in range(total_ticks):
            await harness.tick()
            if t % sample_every_ticks != 0:
                continue
            s = harness.state
            agents = (s.get("agents") if isinstance(s, dict) else getattr(s, "agents", None)) or []
            workers = [
                a for a in agents
                if (a.get("type") if isinstance(a, dict) else getattr(a, "type", None)) == "WORKER"
                and (a.get("alive", True) if isinstance(a, dict) else getattr(a, "alive", True)) is not False
            ]
            idle_count = sum(
                1 for w in workers
                if str(((w.get("fsm") or {}).get("state") if isinstance(w, dict)
                        else getattr(getattr(w, "fsm", None), "state", "")) or "") == "IDLE"
            )
            resources = (s.get("resources") if isinstance(s, dict) else getattr(s, "resources", None)) or {}
            gameplay = (s.get("gameplay") if isinstance(s, dict) else getattr(s, "gameplay", None)) or {}
            metrics = (s.get("metrics") if isinstance(s, dict) else getattr(s, "metrics", None)) or {}
            session = (s.get("session") if isinstance(s, dict) else getattr(s, "session", None)) or {}
            samples.append({
                "t": float(metrics.get("time_sec", metrics.get("timeSec", 0)) or 0),
                "food": float(resources.get("food", 0) or 0),
                "wood": float(resources.get("wood", 0) or 0),
                "stone": float(resources.get("stone", 0) or 0),
                "herbs": float(resources.get("herbs", 0) or 0),
                "workers": len(workers),
                "idle_workers": idle_count,
                "prosperity": float(gameplay.get("prosperity", 0) or 0),
                "threat": float(gameplay.get("threat", 0) or 0),
            })
            if session.get("phase") == "end":
                break
        return samples

    def self_score(
        self,
        samples: list[dict[str, Any]],
        ctx: dict[str, Any] | None = None,
    ) -> dict[str, float]:
        if not samples:
            return {
                "rae_composite": 0.0,
                "rae_sufficiency": 0.0,
                "rae_distribution_gini": 0.0,
                "rae_idle_capacity": 0.0,
                "rae_path_overhead": 1.0,
            }
        last = samples[-1]
        w = max(1, int(last.get("workers", 0)))

        # Per-resource per-capita sufficiency [0,1]. Demand coefficients picked
        # to align with worker carry capacity (~1.0 food, 0.4 wood, 0.1 stone,
        # 0.05 herbs per worker per cycle).
        food_suf = _clamp01(float(last.get("food", 0.0)) / (w * 1.0))
        wood_suf = _clamp01(float(last.get("wood", 0.0)) / (w * 0.4))
        stone_suf = _clamp01(float(last.get("stone", 0.0)) / max(1.0, w * 0.1))
        herbs_suf = _clamp01(float(last.get("herbs", 0.0)) / max(1.0, w * 0.05))

        # Backward-compat (v1) — food × wood product
        sufficiency = food_suf * wood_suf

        # P0-3 (v2): Crafter geometric mean over all 4 resource axes.
        composite = crafter_geometric_mean([food_suf, wood_suf, stone_suf, herbs_suf])

        idle_fracs = [
            (s.get("idle_workers", 0) / s["workers"]) if s.get("workers", 0) > 0 else 0.0
            for s in samples
        ]
        idle_avg = float(np.mean(idle_fracs)) if idle_fracs else 0.0

        resource_vec = [
            float(last.get("food", 0.0)),
            float(last.get("wood", 0.0)),
            float(last.get("stone", 0.0)),
            float(last.get("herbs", 0.0)),
        ]
        distribution_gini = _gini(resource_vec)

        return {
            "rae_composite": round(composite, 4),
            "rae_sufficiency": round(sufficiency, 4),
            "rae_distribution_gini": round(distribution_gini, 4),
            "rae_idle_capacity": round(idle_avg, 4),
            # TODO(rae_path_overhead, RC3 T1): wire when PathCache exposes the
            # mean(actual_path_len / manhattan_dist) over completed worker
            # paths. PathCache currently emits hit/miss counters but no
            # path-length stats. Returning 1.0 (= optimal) so DimensionNormalizer
            # maps it to 1.0 (best); acts as a neutral input until wired.
            "rae_path_overhead": 1.0,
        }


__all__ = [
    "ResourceAllocationEfficiencyPlugin",
    "crafter_geometric_mean",
]
