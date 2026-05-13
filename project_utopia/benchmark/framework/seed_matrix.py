"""Multi-seed × multi-scenario benchmark runner (port of ``SeedMatrix.js``).

Drives the ``seeds × scenarios`` grid through :class:`SimHarness`, applying
the 5 academic-benchmark dimension plugins to each cell, and aggregates per
Crafter ordering (per-seed average FIRST, then mean across seeds).

RC3 B1 fix preserved
--------------------
``aiRuntime`` is read from ``state.metrics['ai_runtime']`` (snake_case
storage key per the Python conventions doc), and the 7 S5 token telemetry
fields are passed through unchanged. The 3 legacy counters are remapped
so the public cell schema keeps the JS names — ``totalCalls``,
``fallbackCalls``, ``schemaErrors`` — for downstream NDJSON compatibility.
"""

from __future__ import annotations

import asyncio
import json
import math
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable

from .sim_harness import SimHarness

try:
    from project_utopia.simulation.ai.llm.agent_adapter import NoopAgentAdapter
except Exception:  # pragma: no cover
    NoopAgentAdapter = None  # type: ignore[assignment]


__all__ = [
    "DEFAULT_DURATION_SEC",
    "aggregate_per_seed_then_average",
    "run_one_cell",
    "run_seed_matrix",
    "write_ndjson",
]


DEFAULT_DURATION_SEC: int = 120


def _now_ms() -> float:
    return time.perf_counter() * 1000


def _build_adapter(agent_config: dict[str, Any] | None) -> Any:
    if not agent_config:
        if NoopAgentAdapter is None:
            raise RuntimeError(
                "NoopAgentAdapter is unavailable; pass agent_config explicitly."
            )
        return NoopAgentAdapter()
    cls = agent_config.get("adapter_class") or agent_config.get("adapterClass")
    opts = agent_config.get("adapter_opts") or agent_config.get("adapterOpts") or {}
    if cls is None:
        if NoopAgentAdapter is None:
            raise RuntimeError("Missing adapter_class in agent_config")
        return NoopAgentAdapter()
    if not callable(cls):
        if NoopAgentAdapter is None:
            raise RuntimeError("Provided adapter_class is not callable")
        return NoopAgentAdapter()
    return cls(**opts) if isinstance(opts, dict) else cls(opts)


def _adapter_id_of(adapter: Any) -> str:
    if adapter is None:
        return "noop"
    cls = getattr(adapter, "__class__", None)
    if cls is None:
        return "anonymous"
    name = getattr(cls, "__name__", None)
    return name or "anonymous"


def _read_ai_runtime(state: dict[str, Any]) -> dict[str, Any]:
    """RC3 B1: read from ``state.metrics['ai_runtime']`` (NOT ``state.ai.runtime``).

    Remap to the public SeedMatrix schema, preserving camelCase wire names
    so NDJSON consumers stay compatible with the JS port.
    """
    rt: dict[str, Any] = {}
    metrics = state.get("metrics") if isinstance(state, dict) else None
    if isinstance(metrics, dict):
        rt = metrics.get("ai_runtime") or {}
        if not isinstance(rt, dict):
            rt = {}
    return {
        "totalCalls": _safe_num(rt.get("requestCount", 0)),
        "fallbackCalls": _safe_num(rt.get("fallbackResponseCount", 0)),
        "schemaErrors": _safe_num(rt.get("errorCount", 0)),
        # S5 token telemetry passthrough — 7 keys.
        "promptTokens": _safe_num(rt.get("promptTokens", 0)),
        "completionTokens": _safe_num(rt.get("completionTokens", 0)),
        "cachedTokens": _safe_num(rt.get("cachedTokens", 0)),
        "kvCacheHits": _safe_num(rt.get("kvCacheHits", 0)),
        "prefixHits": _safe_num(rt.get("prefixHits", 0)),
        "firstTokenLatencyMs": _safe_num(rt.get("firstTokenLatencyMs", 0)),
        "tokensPerSec": _safe_num(rt.get("tokensPerSec", 0)),
    }


def _safe_num(v: Any) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(x):
        return 0.0
    return x


async def run_one_cell(
    seed: int,
    scenario: str,
    opts: dict[str, Any],
) -> dict[str, Any]:
    """Run a single (seed, scenario) cell through every dimension plugin.

    The plugin list comes from ``opts['dimensions']`` (defaulting to the 5
    registered academic-benchmark dimensions when discoverable). For Python
    consumers the plugins are responsible for owning their sample-collection
    loop on the harness.
    """
    duration_sec = float(opts.get("duration_sec", DEFAULT_DURATION_SEC))
    ai_enabled = bool(opts.get("ai_enabled", False))
    runtime_profile = str(opts.get("runtime_profile", "long_run"))
    dimension_opts = {"duration_sec": duration_sec, **(opts.get("dimension_opts") or {})}

    adapter = _build_adapter(opts.get("agent_config"))
    agent_id = _adapter_id_of(adapter)

    plugins: list[Any] = list(opts.get("dimensions") or _discover_default_dimensions())

    start_ms = _now_ms()
    per_dimension_scores: dict[str, float] = {}
    ai_runtime: dict[str, Any] = {
        "totalCalls": 0,
        "fallbackCalls": 0,
        "schemaErrors": 0,
        "promptTokens": 0,
        "completionTokens": 0,
        "cachedTokens": 0,
        "kvCacheHits": 0,
        "prefixHits": 0,
        "firstTokenLatencyMs": 0,
        "tokensPerSec": 0,
    }
    outcome: Any = None
    last_err: str = ""

    if not plugins:
        # No plugins registered yet — still drive one short harness so the
        # aiRuntime passthrough invariant is observable.
        harness = SimHarness(
            template_id=scenario,
            seed=seed,
            ai_enabled=ai_enabled,
            runtime_profile=runtime_profile,
            agent_adapter=adapter,
            attach_llm_channels=bool(opts.get("attach_llm_channels", False)),
            cadence_multiplier=float(opts.get("cadence_multiplier", 1.0)),
        )
        await harness.advance_to(duration_sec)
        ai_runtime = _read_ai_runtime(harness.state)

    for plugin in plugins:
        try:
            harness = SimHarness(
                template_id=scenario,
                seed=seed,
                ai_enabled=ai_enabled,
                runtime_profile=runtime_profile,
                agent_adapter=adapter,
            )
            samples = await plugin.collect_samples(harness, dimension_opts)
            score = plugin.self_score(
                samples or [], {"agent_id": agent_id, "seed": seed, "scenario": scenario}
            )
            for dim in plugin.score_dimensions:
                v = score.get(dim) if isinstance(score, dict) else None
                try:
                    fv = float(v)
                    if not math.isfinite(fv):
                        fv = 0.0
                except (TypeError, ValueError):
                    fv = 0.0
                per_dimension_scores[dim] = fv

            ai_runtime = _read_ai_runtime(harness.state)
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            for dim in getattr(plugin, "score_dimensions", ()) or ():
                per_dimension_scores[dim] = 0.0

    cell: dict[str, Any] = {
        "seed": seed,
        "scenario": scenario,
        "agent_id": agent_id,
        "per_dimension_scores": per_dimension_scores,
        "ai_runtime": ai_runtime,
        "outcome": outcome,
        "wallclock_ms": _now_ms() - start_ms,
    }
    if last_err:
        cell["error"] = last_err
    return cell


def _discover_default_dimensions() -> list[Any]:
    """Lazy-load the 5 dimension plugins, if their module is on the path.

    Returns ``[]`` when ``project_utopia.benchmark.dimensions`` is empty
    (other Phase-2 subagents own that surface).
    """
    try:
        from project_utopia.benchmark import dimensions as _dim_pkg  # noqa: F401
    except Exception:
        return []
    plugins = getattr(_dim_pkg, "ACADEMIC_BENCHMARK_DIMENSIONS", None)
    if plugins is None:
        return []
    return list(plugins)


async def run_seed_matrix(opts: dict[str, Any]) -> dict[str, Any]:
    """Drive the full ``seeds × scenarios`` matrix.

    Mirrors the JS API, but uses ``asyncio`` for concurrency (Python has no
    Promise.all). When ``concurrency > 1`` the runner schedules cells via
    ``asyncio.gather`` in batches; otherwise it runs serially.
    """
    if not opts or not isinstance(opts.get("seeds"), Iterable):
        raise ValueError("run_seed_matrix: opts['seeds'] must be a non-empty iterable")
    seeds = list(opts["seeds"])
    if not seeds:
        raise ValueError("run_seed_matrix: opts['seeds'] must be non-empty")
    if not isinstance(opts.get("scenarios"), Iterable):
        raise ValueError("run_seed_matrix: opts['scenarios'] must be a non-empty iterable")
    scenarios = list(opts["scenarios"])
    if not scenarios:
        raise ValueError("run_seed_matrix: opts['scenarios'] must be non-empty")
    concurrency = max(1, int(opts.get("concurrency", 1)))

    jobs: list[tuple[int, str]] = []
    for seed in seeds:
        for scenario in scenarios:
            jobs.append((seed, scenario))

    cells: list[dict[str, Any] | None] = [None] * len(jobs)

    if concurrency == 1:
        for idx, (seed, scenario) in enumerate(jobs):
            cells[idx] = await run_one_cell(seed, scenario, opts)
    else:
        sem = asyncio.Semaphore(concurrency)

        async def _bounded(idx: int, seed: int, scenario: str) -> None:
            async with sem:
                cells[idx] = await run_one_cell(seed, scenario, opts)

        await asyncio.gather(*(
            _bounded(i, s, sc) for i, (s, sc) in enumerate(jobs)
        ))

    materialized: list[dict[str, Any]] = [c for c in cells if c is not None]

    by_seed_map: dict[int, list[dict[str, Any]]] = {}
    for c in materialized:
        by_seed_map.setdefault(c["seed"], []).append(c)
    by_seed = [
        {"seed": seed, "scenarios": cells_for_seed}
        for seed, cells_for_seed in by_seed_map.items()
    ]

    wallclocks = [float(c.get("wallclock_ms", 0) or 0) for c in materialized]
    tot = sum(wallclocks)
    mean = tot / len(wallclocks) if wallclocks else 0.0
    variance = (
        sum((v - mean) ** 2 for v in wallclocks) / len(wallclocks)
        if wallclocks
        else 0.0
    )
    std = math.sqrt(variance)

    ndjson_path = opts.get("ndjson_path") or opts.get("ndjsonPath")
    if ndjson_path:
        write_ndjson(ndjson_path, materialized)

    return {
        "cells": materialized,
        "bySeed": by_seed,
        "summary": {"tot": tot, "mean": mean, "std": std},
    }


def aggregate_per_seed_then_average(
    cells: list[dict[str, Any]],
    score_key: str,
) -> dict[str, Any]:
    """Per-seed mean across scenarios first, then mean/std across seeds."""
    if not cells:
        return {"meanPerSeed": [], "grandMean": 0.0, "grandStd": 0.0}
    by_seed: dict[Any, list[float]] = {}
    for c in cells:
        arr = by_seed.setdefault(c.get("seed"), [])
        v = (c.get("per_dimension_scores") or {}).get(score_key)
        try:
            fv = float(v)
            if not math.isfinite(fv):
                fv = 0.0
        except (TypeError, ValueError):
            fv = 0.0
        arr.append(fv)
    mean_per_seed = [sum(arr) / len(arr) if arr else 0.0 for arr in by_seed.values()]
    grand_mean = sum(mean_per_seed) / len(mean_per_seed) if mean_per_seed else 0.0
    grand_var = (
        sum((v - grand_mean) ** 2 for v in mean_per_seed) / len(mean_per_seed)
        if mean_per_seed
        else 0.0
    )
    return {
        "meanPerSeed": mean_per_seed,
        "grandMean": grand_mean,
        "grandStd": math.sqrt(grand_var),
    }


def write_ndjson(path: str | Path, cells: list[dict[str, Any]]) -> None:
    """Write each cell as a one-line JSON record. NDJSON is intentionally
    serial — benchmark dumps are bounded and we're off the hot path.
    """
    p = Path(path)
    if p.parent and str(p.parent) not in ("", ".", "/"):
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
    lines = "\n".join(json.dumps(c) for c in cells)
    p.write_text(lines + ("\n" if lines else ""), encoding="utf-8")
