"""Performance telemetry buffers (port of ``src/app/performanceTelemetry.js``).

Tracks a rolling window of frame/sim/UI/render durations and exposes a
P95/P99 percentile read alongside a heuristic "bottleneck" classifier.
Phase 1 keeps the same field names and ring-buffer semantics as the JS
source so any HUD/inspector consumer remains wire-compatible.
"""

from __future__ import annotations

import math
from typing import Any

__all__ = [
    "DEFAULT_LIMIT",
    "create_performance_telemetry",
    "ensure_performance_telemetry",
    "infer_performance_bottleneck",
    "percentile",
    "record_performance_sample",
]


DEFAULT_LIMIT: int = 300


def _finite(value: Any, fallback: float = 0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    return n if math.isfinite(n) else fallback


def _push_sample(samples: list[float], value: Any, limit: int = DEFAULT_LIMIT) -> None:
    if not isinstance(samples, list):
        return
    n = _finite(value, math.nan)
    if not math.isfinite(n):
        return
    samples.append(n)
    if len(samples) > limit:
        del samples[: len(samples) - limit]


def percentile(samples: list[float] | None = None, p: float = 95) -> float:
    """Return the ``p``-th percentile of ``samples`` using nearest-rank.

    Mirrors the JS implementation exactly so HUD readings agree to the
    sample-index level (nearest-rank, not linear interpolation).
    """
    if not isinstance(samples, list) or len(samples) == 0:
        return 0.0
    finite_samples = sorted(_finite(v, math.nan) for v in samples)
    finite_samples = [v for v in finite_samples if math.isfinite(v)]
    if not finite_samples:
        return 0.0
    clamped = max(0.0, min(100.0, _finite(p, 95)))
    idx = min(
        len(finite_samples) - 1,
        max(0, math.ceil((clamped / 100.0) * len(finite_samples)) - 1),
    )
    return finite_samples[idx]


def create_performance_telemetry() -> dict[str, Any]:
    """Return a fresh telemetry block with empty sample buffers."""
    return {
        "frameSamplesMs": [],
        "workFrameSamplesMs": [],
        "simSamplesMs": [],
        "simLastStepSamplesMs": [],
        "uiSamplesMs": [],
        "renderSamplesMs": [],
        "sampleCount": 0,
        "longFrameCount": 0,
        "rawFrameMs": 0.0,
        "frameP95Ms": 0.0,
        "frameP99Ms": 0.0,
        "workFrameP95Ms": 0.0,
        "workFrameP99Ms": 0.0,
        "simP95Ms": 0.0,
        "simLastStepP95Ms": 0.0,
        "uiP95Ms": 0.0,
        "renderP95Ms": 0.0,
        "targetScale": 1.0,
        "actualScale": 1.0,
        "entityCount": 0,
        "capActive": False,
        "capReason": "",
        "effectiveMaxSteps": 0,
        "bottleneck": "sampling",
        "summary": "Performance: sampling.",
    }


def ensure_performance_telemetry(metrics: dict[str, Any] | None = None) -> dict[str, Any]:
    """Idempotently install a performance block on ``metrics`` and return it."""
    if metrics is None:
        metrics = {}
    perf = metrics.get("performance")
    if not isinstance(perf, dict):
        perf = create_performance_telemetry()
        metrics["performance"] = perf
    for key in (
        "frameSamplesMs",
        "workFrameSamplesMs",
        "simSamplesMs",
        "simLastStepSamplesMs",
        "uiSamplesMs",
        "renderSamplesMs",
    ):
        if not isinstance(perf.get(key), list):
            perf[key] = []
    perf["sampleCount"] = int(_finite(perf.get("sampleCount"), 0))
    perf["longFrameCount"] = int(_finite(perf.get("longFrameCount"), 0))
    return perf


def infer_performance_bottleneck(sample: dict[str, Any] | None = None) -> str:
    """Classify the current bottleneck from a single sample."""
    if sample is None:
        sample = {}
    if sample.get("capActive"):
        return "step cap"
    sim_ms = _finite(sample.get("simMs"))
    ui_ms = _finite(sample.get("uiMs"))
    render_ms = _finite(sample.get("renderMs"))
    frame_p95_ms = _finite(sample.get("frameP95Ms"))
    actual_scale = _finite(sample.get("actualScale"), 1.0)
    target_scale = max(0.1, _finite(sample.get("targetScale"), 1.0))
    scale_lost = target_scale >= 4 and actual_scale < target_scale * 0.85

    if sim_ms >= max(ui_ms, render_ms) and (sim_ms > 10 or scale_lost):
        return "simulation"
    if render_ms >= max(sim_ms, ui_ms) and render_ms > 8:
        return "render"
    if ui_ms >= max(sim_ms, render_ms) and ui_ms > 6:
        return "ui"
    if frame_p95_ms > 45:
        return "frame pacing"
    return "balanced"


def record_performance_sample(
    metrics: dict[str, Any] | None = None,
    sample: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append ``sample`` to the rolling buffers and update derived stats."""
    if metrics is None:
        metrics = {}
    if sample is None:
        sample = {}
    perf = ensure_performance_telemetry(metrics)
    limit = int(max(60, min(900, _finite(sample.get("limit"), DEFAULT_LIMIT))))
    raw_frame_ms = _finite(sample.get("rawFrameMs"))
    sim_ms = _finite(sample.get("simMs"))
    sim_last_step_ms = _finite(sample.get("simLastStepMs"), sim_ms)
    work_frame_ms = _finite(sample.get("workFrameMs"), raw_frame_ms)
    ui_ms = _finite(sample.get("uiMs"))
    render_ms = _finite(sample.get("renderMs"))

    _push_sample(perf["frameSamplesMs"], raw_frame_ms, limit)
    _push_sample(perf["workFrameSamplesMs"], work_frame_ms, limit)
    _push_sample(perf["simSamplesMs"], sim_ms, limit)
    _push_sample(perf["simLastStepSamplesMs"], sim_last_step_ms, limit)
    _push_sample(perf["uiSamplesMs"], ui_ms, limit)
    _push_sample(perf["renderSamplesMs"], render_ms, limit)

    perf["sampleCount"] = int(perf["sampleCount"]) + 1
    if raw_frame_ms > 50:
        perf["longFrameCount"] = int(perf["longFrameCount"]) + 1
    perf["rawFrameMs"] = raw_frame_ms
    perf["workFrameMs"] = work_frame_ms
    perf["frameP95Ms"] = percentile(perf["frameSamplesMs"], 95)
    perf["frameP99Ms"] = percentile(perf["frameSamplesMs"], 99)
    perf["workFrameP95Ms"] = percentile(perf["workFrameSamplesMs"], 95)
    perf["workFrameP99Ms"] = percentile(perf["workFrameSamplesMs"], 99)
    perf["simP95Ms"] = percentile(perf["simSamplesMs"], 95)
    perf["simLastStepP95Ms"] = percentile(perf["simLastStepSamplesMs"], 95)
    perf["uiP95Ms"] = percentile(perf["uiSamplesMs"], 95)
    perf["renderP95Ms"] = percentile(perf["renderSamplesMs"], 95)
    perf["targetScale"] = max(0.1, _finite(sample.get("targetScale"), perf.get("targetScale", 1.0)))
    perf["actualScale"] = _finite(sample.get("actualScale"), perf.get("actualScale", 1.0))
    perf["entityCount"] = max(0, int(_finite(sample.get("entityCount"), perf.get("entityCount", 0))))
    perf["capActive"] = bool(sample.get("capActive"))
    perf["capReason"] = str(sample.get("capReason") or "")
    perf["effectiveMaxSteps"] = max(
        0,
        int(_finite(sample.get("effectiveMaxSteps"), perf.get("effectiveMaxSteps", 0))),
    )
    perf["bottleneck"] = infer_performance_bottleneck(
        {
            "simMs": sim_ms,
            "uiMs": ui_ms,
            "renderMs": render_ms,
            "frameP95Ms": perf["workFrameP95Ms"],
            "targetScale": perf["targetScale"],
            "actualScale": perf["actualScale"],
            "capActive": perf["capActive"],
        }
    )
    fps = 1000.0 / max(1.0, raw_frame_ms)
    cap_note = f" ({perf['capReason']})" if perf["capActive"] else ""
    perf["summary"] = (
        f"Performance: {perf['entityCount']} entities, "
        f"fps {fps:.1f}, "
        f"work p95 {perf['workFrameP95Ms']:.1f}ms, "
        f"raw p95 {perf['frameP95Ms']:.1f}ms, "
        f"{perf['bottleneck']}{cap_note}."
    )
    return perf
