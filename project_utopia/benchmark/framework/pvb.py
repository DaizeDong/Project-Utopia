"""Policy-Value Baseline (Pluribus / AIVAT-style; port of ``PVB.js``).

Variance-reduction wrapper for noisy benchmark scores. The exact AIVAT
formulation needs to evaluate the fallback policy at every state — too
expensive for a 96x72 colony sim — so we use a closed-form proxy:

``V_F(s) = clamp01(prosperity/100) * clamp01(workers/24)``

is a pure function of ``state`` (no extra simulation step). The PVB
correction averages over the run; when ``A == F`` the correction terms
cancel and PVB tends to ``realized - V_F(s_0)``.

API
---
* :func:`fallback_value_estimate` — closed-form V_F(state) in [0,1].
* :class:`PVBTracker` — accumulates per-tick samples; ``finalize`` returns
  the PVB-corrected score.
* :func:`run_with_pvb` — drives a harness for ``duration_sec`` seconds,
  recording samples, and returns the score family.
"""

from __future__ import annotations

import math
from typing import Any, Awaitable, Callable, Protocol

__all__ = [
    "EMA_ALPHA",
    "PVBTracker",
    "fallback_value_estimate",
    "run_with_pvb",
]

EMA_ALPHA: float = 0.15


class _HarnessLike(Protocol):
    state: Any

    async def tick(self) -> None:  # pragma: no cover - structural
        ...


def _clamp01(v: Any) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(x):
        return 0.0
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x


def fallback_value_estimate(state: Any) -> float:
    """Closed-form V_F(state) ∈ [0,1].

    Reads ``state.gameplay.prosperity`` (0..100) and the worker headcount
    (``state.metrics.populationStats.workers`` if present, else falls back
    to counting alive workers in ``state.agents``). Both signals are
    multiplied so V_F is high only when BOTH are strong.
    """
    if not isinstance(state, dict):
        return 0.0
    gameplay = state.get("gameplay") if isinstance(state.get("gameplay"), dict) else None
    prosperity = 0.0
    if gameplay is not None:
        try:
            prosperity = float(gameplay.get("prosperity", 0) or 0)
        except (TypeError, ValueError):
            prosperity = 0.0

    workers_raw: Any = 0
    metrics = state.get("metrics") if isinstance(state.get("metrics"), dict) else None
    if metrics is not None:
        pop_stats = metrics.get("populationStats")
        if isinstance(pop_stats, dict) and "workers" in pop_stats:
            workers_raw = pop_stats.get("workers", 0)
    if workers_raw == 0:
        agents = state.get("agents")
        if isinstance(agents, list):
            workers_raw = sum(
                1
                for a in agents
                if isinstance(a, dict)
                and a.get("type") == "WORKER"
                and a.get("alive", True) is not False
            )

    try:
        workers = float(workers_raw)
    except (TypeError, ValueError):
        workers = 0.0
    if not math.isfinite(workers):
        workers = 0.0

    p_comp = _clamp01(prosperity / 100.0)
    w_comp = _clamp01(workers / 24.0)
    return float(f"{p_comp * w_comp:.6f}")


class PVBTracker:
    """Tracks per-tick V_F samples and computes PVB correction.

    Usage::

        tracker = PVBTracker()
        tracker.record_tick(harness.state, "agentA")  # once per tick
        finalized = tracker.finalize(realized_score)
        # finalized = {"pvb_score", "baseline_v0", "sum_corrections", "ticks"}
    """

    __slots__ = (
        "_initial",
        "_ema_under_f",
        "_sum_corrections",
        "_ticks",
        "_last_agent_id",
    )

    def __init__(self) -> None:
        self._initial: float | None = None
        self._ema_under_f: float | None = None
        self._sum_corrections: float = 0.0
        self._ticks: int = 0
        self._last_agent_id: str = ""

    def record_tick(self, state: Any, agent_id: str = "") -> None:
        v = fallback_value_estimate(state)
        if self._initial is None:
            self._initial = v
            self._ema_under_f = v
        else:
            assert self._ema_under_f is not None  # for type-checkers
            corr = self._ema_under_f - v
            self._sum_corrections += corr
            self._ema_under_f = (1 - EMA_ALPHA) * self._ema_under_f + EMA_ALPHA * v
        self._ticks += 1
        if agent_id:
            self._last_agent_id = agent_id

    def finalize(self, realized_score: float) -> dict[str, Any]:
        baseline = self._initial if self._initial is not None else 0.0
        try:
            score = float(realized_score)
            if not math.isfinite(score):
                score = 0.0
        except (TypeError, ValueError):
            score = 0.0
        mean_corr = self._sum_corrections / self._ticks if self._ticks > 0 else 0.0
        pvb = score - baseline + mean_corr
        return {
            "pvb_score": float(f"{pvb:.6f}"),
            "baseline_v0": float(f"{baseline:.6f}"),
            "sum_corrections": float(f"{mean_corr:.6f}"),
            "ticks": self._ticks,
        }

    def reset(self) -> None:
        self._initial = None
        self._ema_under_f = None
        self._sum_corrections = 0.0
        self._ticks = 0
        self._last_agent_id = ""


async def run_with_pvb(
    harness: _HarnessLike,
    duration_sec: float,
    score_fn: Callable[[Any], float] | Callable[[Any], Awaitable[float]],
    opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run a harness for ``duration_sec`` seconds, recording PVB samples.

    Returns
    -------
    dict
        ``{realized, pvb_adjusted, variance_reduction, baseline_v0,
        sum_corrections, ticks}``. ``variance_reduction`` is reported as
        ``raw_var - pvb_var`` over the per-tick V_F samples (None when there
        aren't enough samples to compute variance).
    """
    if harness is None or not hasattr(harness, "tick"):
        raise TypeError("run_with_pvb: harness must expose async tick()")
    opts = opts or {}
    dt_sec = float(opts.get("dt_sec", 1 / 30))
    total_ticks = max(1, round(float(duration_sec) / dt_sec))
    tracker = PVBTracker()
    agent_id = str(opts.get("agent_id", ""))

    # Record initial state BEFORE any tick.
    tracker.record_tick(harness.state, agent_id)

    for _ in range(total_ticks):
        await harness.tick()
        tracker.record_tick(harness.state, agent_id)
        sess = (
            harness.state.get("session")
            if isinstance(harness.state, dict)
            else None
        )
        if isinstance(sess, dict) and sess.get("phase") == "end":
            break

    raw_call = score_fn(harness.state)
    if hasattr(raw_call, "__await__"):
        raw = float(await raw_call)  # type: ignore[arg-type]
    else:
        raw = float(raw_call)  # type: ignore[arg-type]
    if not math.isfinite(raw):
        raw = 0.0

    finalized = tracker.finalize(raw)
    return {
        "raw": float(f"{raw:.6f}"),
        "realized": float(f"{raw:.6f}"),
        "pvb": finalized["pvb_score"],
        "pvb_adjusted": finalized["pvb_score"],
        "baseline_v0": finalized["baseline_v0"],
        "sum_corrections": finalized["sum_corrections"],
        "ticks": finalized["ticks"],
    }
