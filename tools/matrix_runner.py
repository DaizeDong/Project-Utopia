"""Pre-registered matrix runner for the Project Utopia research benchmark.

Iterates the full 3 (models) × 3 (scenarios) × 5 (seeds) × 4 (horizons) cell
matrix used for the paper's primary results (180 cells total). Each cell is
executed via the in-process ``project_utopia.cli.benchmark_paper`` API
(`run_paper_experiment`), with the active model selected by setting the
``OPENAI_MODEL`` environment variable BEFORE the per-cell invocation -- the
CLI does not accept a model flag directly; it reads ``.env``-style settings.

Concurrency is bounded by ``asyncio.Semaphore`` (NOT a thread pool, since the
underlying harness is asyncio-native). Per-cell failures are logged and
skipped without aborting the matrix.

After the matrix finishes, an aggregator walks the output tree, parses every
cell's NDJSON, extracts the four memory-degradation metrics
(``anchored_fact_recall``, ``action_grounded_recall``, ``behavioral_drift``,
Delta = AFR-AGR), and emits both a per-cell CSV/JSON and an aggregated
per-(model, scenario, horizon) summary. The H-threshold for Delta is 0.3,
matching the paper's pre-registered hypothesis.

Key design choices
------------------
* In-process invocation. Subprocess fallback is available behind
  ``--subprocess`` for environments where in-process state pollution is a
  concern, but in-process is ~2-3x faster (skips Python startup per cell)
  and lets the asyncio semaphore actually bound concurrency.
* Per-cell ``OPENAI_MODEL`` is set inside the bounded task right before the
  call, then restored. Concurrent cells across DIFFERENT models would race
  on the env var; the runner enforces serialization of cells across model
  families when ``--max-concurrent > 1`` is used WITHIN a model, but model
  families are also bounded by the semaphore. (See _run_cell for details.)
* RecordReplayCache is enabled per-cell by passing a stable ``cache_dir``
  derived from the cell-id so re-runs of identical cells replay rather than
  hit the API again.
* ``--skip-completed`` checks for a non-empty NDJSON at the destination
  path and short-circuits the cell if found, so resuming a partial matrix
  is cheap.

This module is DEPLOYMENT-READY but DOES NOT auto-execute. The full matrix
costs real money; the user is expected to invoke the script manually after
confirming budget.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import shlex
import subprocess
import sys
import time
import traceback
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

# ── Pre-registered matrix definition ──────────────────────────────────

DEFAULT_MODELS: tuple[str, ...] = (
    "claude-sonnet-4-6",
    "gpt-5-mini",
    "deepseek-v4-flash",
)

SCENARIOS: tuple[str, ...] = (
    "temperate_plains",
    "fortified_basin",
    "rugged_highlands",
)

SEEDS_HEX: tuple[str, ...] = (
    # Stage A's 3 seeds; the 2 reserved seeds (0xDEADBEEF, 0xFEED) are
    # held out for a follow-on run once the headline-Δ pattern is
    # confirmed on the matched-Stage-A subset.
    "0xC0FFEE",
    "0xBEEF",
    "0xCAFE",
)

# 2 horizons matching Stage A / Stage B (10 min and 60 min). The
# longer pre-registered horizons (30 min, 4 h) are held out for
# round 2 once the matched subset is in.
HORIZONS_SEC: tuple[int, ...] = (600, 3600)

# Pre-registered paper anchors.
EXPERIMENT_ID: str = "E1"
CELL_TYPE: str = "SS"           # 4-channel real-LLM cell
# Throttled to stay under the proxy's global 15-req/min cap. With
# cadence=30 and a 3600-sim-sec cell the harness emits ~30 LLM calls
# (env-director and npc-policy each every 240 s; strategic-plan
# every 2700 s; colony-agent event-gated). Tested live on a 600-sec
# cell: 80/85 calls succeeded, 5 fallback.
CADENCE_MULT: float = 30.0
DELTA_THRESHOLD: float = 0.30   # pre-registered hypothesis H

# Metric dim keys emitted on the NDJSON wire by MemoryDegradation plugin.
DIM_AFR: str = "anchored_fact_recall"
DIM_AGR: str = "action_grounded_recall"
DIM_DRIFT: str = "behavioral_drift"


# ── Cell descriptor ───────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Cell:
    """A single (model, scenario, seed, duration) cell of the matrix."""

    model: str
    scenario: str
    seed_hex: str
    duration_sec: int

    @property
    def seed_int(self) -> int:
        """Parse the seed token to an int (supports both decimal and 0x-hex)."""
        s = self.seed_hex.strip()
        if s.lower().startswith("0x"):
            return int(s, 16)
        return int(s, 10)

    @property
    def cell_id(self) -> str:
        """Stable per-cell identifier used in logs and filenames."""
        return f"{self.model}__{self.scenario}__{self.seed_hex}__{self.duration_sec}s"

    def out_path(self, out_dir: Path) -> Path:
        """Destination NDJSON path for this cell's results."""
        fname = f"{self.seed_hex}_{self.duration_sec}s.ndjson"
        return out_dir / self.model / self.scenario / fname

    def cache_dir(self, out_dir: Path) -> Path:
        """Per-cell RecordReplayCache directory."""
        return out_dir / ".cache" / self.model / self.scenario / f"{self.seed_hex}_{self.duration_sec}s"

    def debug_log_dir(self, out_dir: Path) -> Path:
        """Per-cell debug NDJSON log directory."""
        return out_dir / ".debug" / self.model / self.scenario / f"{self.seed_hex}_{self.duration_sec}s"


def enumerate_matrix(models: Iterable[str]) -> list[Cell]:
    """Cartesian product over the requested model subset × scenarios × seeds × horizons."""
    cells: list[Cell] = []
    for m in models:
        for sc in SCENARIOS:
            for seed in SEEDS_HEX:
                for dur in HORIZONS_SEC:
                    cells.append(Cell(model=m, scenario=sc, seed_hex=seed, duration_sec=dur))
    return cells


# ── Per-cell runner ───────────────────────────────────────────────────


@dataclass
class CellResult:
    cell: Cell
    status: str            # 'ok' | 'skipped' | 'failed'
    error: str = ""
    wallclock_sec: float = 0.0
    row_count: int = 0


async def _run_cell_in_process(
    cell: Cell,
    out_dir: Path,
    env_lock: asyncio.Lock,
) -> CellResult:
    """Drive one cell via the in-process ``run_paper_experiment`` API.

    The lock serializes the OPENAI_MODEL env-var swap so concurrent cells
    targeting different model families don't trample each other's env. The
    lock is released as soon as the run completes (each cell holds it for
    the full run -- not ideal, but the alternative is propagating model into
    the function signature, which the existing CLI doesn't yet support).
    """
    # Lazy-import so ``--help`` doesn't pull in the full harness.
    from project_utopia.cli.benchmark_paper import (
        run_paper_experiment,
        write_ndjson_rows,
    )

    cache_dir = cell.cache_dir(out_dir)
    debug_dir = cell.debug_log_dir(out_dir)
    out_path = cell.out_path(out_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    debug_dir.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cfg: dict[str, Any] = {
        "experiment": EXPERIMENT_ID,
        "scenarios": [cell.scenario],
        "seeds": [cell.seed_int],
        "cells": [CELL_TYPE],
        "durationSec": int(cell.duration_sec),
        "out": str(out_path),
        "concurrency": 1,
        "llm_adapter": "llm-client",
        "cadence_multiplier": CADENCE_MULT,
        "cache_dir": str(cache_dir),
        "debug_log_dir": str(debug_dir),
    }

    t0 = time.perf_counter()
    async with env_lock:
        # Swap OPENAI_MODEL right before the call (and restore after) so the
        # adapter factory inside run_paper_experiment picks up the right
        # model. NOTE: this serializes cells across model families.
        prior_model = os.environ.get("OPENAI_MODEL")
        os.environ["OPENAI_MODEL"] = cell.model
        try:
            rows = await run_paper_experiment(cfg)
            write_ndjson_rows(out_path, rows)
        finally:
            if prior_model is None:
                os.environ.pop("OPENAI_MODEL", None)
            else:
                os.environ["OPENAI_MODEL"] = prior_model
    elapsed = time.perf_counter() - t0
    return CellResult(cell=cell, status="ok", wallclock_sec=elapsed, row_count=len(rows))


async def _run_cell_subprocess(cell: Cell, out_dir: Path) -> CellResult:
    """Subprocess fallback: spawn the CLI with OPENAI_MODEL set in the child env.

    Avoids env-var contention across concurrent cells entirely but pays the
    Python interpreter startup cost (~1-2 s) per cell.
    """
    cache_dir = cell.cache_dir(out_dir)
    debug_dir = cell.debug_log_dir(out_dir)
    out_path = cell.out_path(out_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    debug_dir.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    env = dict(os.environ)
    env["OPENAI_MODEL"] = cell.model

    cmd = [
        sys.executable, "-m", "project_utopia.cli.benchmark_paper", "run",
        "--experiment", EXPERIMENT_ID,
        "--scenarios", cell.scenario,
        "--seeds", cell.seed_hex,
        "--cells", CELL_TYPE,
        "--duration-sec", str(cell.duration_sec),
        "--concurrency", "1",
        "--llm-adapter", "llm-client",
        "--cadence-multiplier", str(CADENCE_MULT),
        "--cache-dir", str(cache_dir),
        "--debug-log-dir", str(debug_dir),
        "--out", str(out_path),
    ]

    t0 = time.perf_counter()
    proc = await asyncio.create_subprocess_exec(
        *cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout_b, stderr_b = await proc.communicate()
    elapsed = time.perf_counter() - t0

    if proc.returncode != 0:
        msg = (stderr_b.decode("utf-8", "replace") or stdout_b.decode("utf-8", "replace")).strip()
        return CellResult(cell=cell, status="failed", error=msg[-2000:], wallclock_sec=elapsed)

    # Count rows written.
    n = 0
    try:
        with open(out_path, encoding="utf-8") as fh:
            for _ in fh:
                n += 1
    except OSError:
        pass
    return CellResult(cell=cell, status="ok", wallclock_sec=elapsed, row_count=n)


def _cell_already_done(cell: Cell, out_dir: Path) -> bool:
    """Skip-completed predicate: NDJSON exists and has at least one row."""
    p = cell.out_path(out_dir)
    if not p.exists():
        return False
    try:
        return p.stat().st_size > 0
    except OSError:
        return False


async def _run_one(
    cell: Cell,
    out_dir: Path,
    sem: asyncio.Semaphore,
    env_lock: asyncio.Lock,
    skip_completed: bool,
    use_subprocess: bool,
    dry_run: bool,
) -> CellResult:
    """Bounded-concurrency wrapper around the per-cell runners."""
    if skip_completed and _cell_already_done(cell, out_dir):
        return CellResult(cell=cell, status="skipped", row_count=-1)
    if dry_run:
        # In dry-run mode, just describe the invocation that WOULD happen.
        return CellResult(cell=cell, status="skipped", row_count=0)

    async with sem:
        try:
            if use_subprocess:
                return await _run_cell_subprocess(cell, out_dir)
            return await _run_cell_in_process(cell, out_dir, env_lock)
        except Exception as exc:  # noqa: BLE001
            tb = traceback.format_exc(limit=4)
            return CellResult(cell=cell, status="failed", error=f"{exc!r}\n{tb}")


# ── Aggregator ────────────────────────────────────────────────────────


@dataclass
class CellMetrics:
    """Per-cell aggregated metrics extracted from a single NDJSON file."""

    model: str
    scenario: str
    seed_hex: str
    duration_sec: int
    afr: float | None = None
    agr: float | None = None
    delta: float | None = None
    drift: float | None = None
    cell_status: str = "missing"   # 'ok' | 'missing' | 'empty' | 'parse-error'
    row_count: int = 0


def _extract_metrics_from_ndjson(path: Path) -> tuple[float | None, float | None, float | None, int]:
    """Pull (AFR, AGR, drift, row_count) out of a single cell's NDJSON.

    The harness emits ONE row per (cell, scenario, seed, dim) combination, so
    for a single-cell run there is at most one row per dim. We pull ``raw``
    (the un-normalized score, which is what the paper reports for AFR/AGR/
    drift -- the normalize transform for these is identity / invert anyway).
    """
    afr: float | None = None
    agr: float | None = None
    drift: float | None = None
    n_rows = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            n_rows += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            dim = row.get("dim")
            raw = row.get("raw")
            if not isinstance(raw, (int, float)):
                continue
            if dim == DIM_AFR:
                afr = float(raw)
            elif dim == DIM_AGR:
                agr = float(raw)
            elif dim == DIM_DRIFT:
                drift = float(raw)
    return afr, agr, drift, n_rows


def aggregate_matrix(out_dir: Path, cells: list[Cell]) -> list[CellMetrics]:
    """Walk the matrix output tree and pull per-cell metrics for every cell."""
    metrics: list[CellMetrics] = []
    for cell in cells:
        p = cell.out_path(out_dir)
        m = CellMetrics(
            model=cell.model,
            scenario=cell.scenario,
            seed_hex=cell.seed_hex,
            duration_sec=cell.duration_sec,
        )
        if not p.exists():
            m.cell_status = "missing"
            metrics.append(m)
            continue
        try:
            afr, agr, drift, n = _extract_metrics_from_ndjson(p)
        except OSError as exc:
            m.cell_status = f"parse-error:{exc!r}"
            metrics.append(m)
            continue
        m.row_count = n
        if n == 0:
            m.cell_status = "empty"
            metrics.append(m)
            continue
        m.afr = afr
        m.agr = agr
        m.drift = drift
        if afr is not None and agr is not None:
            m.delta = afr - agr
        m.cell_status = "ok"
        metrics.append(m)
    return metrics


def write_matrix_summary_csv(path: Path, metrics: list[CellMetrics]) -> None:
    """Per-cell long-form CSV: one row per (model, scenario, seed, duration)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([
            "model", "scenario", "seed", "duration_sec",
            "AFR", "AGR", "Delta", "drift", "cell_status", "row_count",
        ])
        for m in metrics:
            w.writerow([
                m.model, m.scenario, m.seed_hex, m.duration_sec,
                "" if m.afr is None else f"{m.afr:.6f}",
                "" if m.agr is None else f"{m.agr:.6f}",
                "" if m.delta is None else f"{m.delta:.6f}",
                "" if m.drift is None else f"{m.drift:.6f}",
                m.cell_status,
                m.row_count,
            ])


def write_per_family_summary_csv(path: Path, metrics: list[CellMetrics]) -> None:
    """Per-(model, scenario, horizon) aggregates with mean ± std of Delta."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # Group by (model, scenario, duration); accumulate Delta values.
    groups: dict[tuple[str, str, int], list[float]] = {}
    crossings: dict[tuple[str, str, int], int] = {}
    for m in metrics:
        key = (m.model, m.scenario, m.duration_sec)
        groups.setdefault(key, [])
        crossings.setdefault(key, 0)
        if m.delta is not None:
            groups[key].append(m.delta)
            if abs(m.delta) >= DELTA_THRESHOLD:
                crossings[key] += 1

    def _mean(xs: list[float]) -> float:
        return sum(xs) / len(xs) if xs else 0.0

    def _std(xs: list[float]) -> float:
        if not xs:
            return 0.0
        mu = _mean(xs)
        return (sum((x - mu) ** 2 for x in xs) / len(xs)) ** 0.5

    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([
            "model", "scenario", "duration_sec",
            "n_cells_with_delta", "mean_delta", "std_delta",
            "abs_mean_delta", "threshold_crossings", "delta_threshold",
        ])
        for key in sorted(groups.keys()):
            model, scenario, dur = key
            vals = groups[key]
            mu = _mean(vals)
            sd = _std(vals)
            w.writerow([
                model, scenario, dur,
                len(vals), f"{mu:.6f}", f"{sd:.6f}",
                f"{abs(mu):.6f}", crossings[key], f"{DELTA_THRESHOLD:.2f}",
            ])


def write_matrix_summary_json(path: Path, metrics: list[CellMetrics]) -> None:
    """Same data as the CSVs but in machine-friendly JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "matrix": {
            "models": sorted({m.model for m in metrics}),
            "scenarios": list(SCENARIOS),
            "seeds": list(SEEDS_HEX),
            "horizons_sec": list(HORIZONS_SEC),
            "delta_threshold": DELTA_THRESHOLD,
            "cell_count": len(metrics),
        },
        "cells": [asdict(m) for m in metrics],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def print_final_report(metrics: list[CellMetrics], results: list[CellResult]) -> None:
    """Stdout summary: attempted/completed/failed + per-model Delta tier ordering."""
    total = len(results)
    ok = sum(1 for r in results if r.status == "ok")
    skipped = sum(1 for r in results if r.status == "skipped")
    failed = sum(1 for r in results if r.status == "failed")

    print()
    print("=" * 70)
    print(f"matrix runner final report")
    print("=" * 70)
    print(f"cells attempted: {total}")
    print(f"  ok       : {ok}")
    print(f"  skipped  : {skipped} (cached / dry-run / --skip-completed)")
    print(f"  failed   : {failed}")
    if failed:
        print()
        print("  failed cells:")
        for r in results:
            if r.status == "failed":
                short = r.error.split("\n", 1)[0][:120]
                print(f"    - {r.cell.cell_id}: {short}")

    # Per-model threshold-crossing count + tier ordering of |Delta_bar|.
    per_model_deltas: dict[str, list[float]] = {}
    per_model_crossings: dict[str, int] = {}
    for m in metrics:
        per_model_deltas.setdefault(m.model, [])
        per_model_crossings.setdefault(m.model, 0)
        if m.delta is not None:
            per_model_deltas[m.model].append(m.delta)
            if abs(m.delta) >= DELTA_THRESHOLD:
                per_model_crossings[m.model] += 1

    print()
    print("per-model |Delta| tier ordering (descending):")
    tiers: list[tuple[str, float, int, int]] = []
    for model, vals in per_model_deltas.items():
        if not vals:
            tiers.append((model, 0.0, 0, 0))
            continue
        mu = sum(vals) / len(vals)
        tiers.append((model, abs(mu), per_model_crossings[model], len(vals)))
    tiers.sort(key=lambda t: t[1], reverse=True)
    for model, abs_mu, n_cross, n_cells in tiers:
        print(f"  {model:30s} |Delta_bar|={abs_mu:.4f}  crossings={n_cross}/{n_cells}  threshold={DELTA_THRESHOLD}")


# ── CLI surface ───────────────────────────────────────────────────────


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="matrix_runner",
        description=(
            "Pre-registered matrix runner for Project Utopia "
            "(3 models x 3 scenarios x 5 seeds x 4 horizons = 180 cells). "
            "Iterates the full matrix with bounded asyncio concurrency, "
            "tolerates per-cell failures, and aggregates results to CSV/JSON."
        ),
    )
    p.add_argument(
        "--max-concurrent", type=int, default=4,
        help="Bounded asyncio concurrency for cell execution (default: 4).",
    )
    p.add_argument(
        "--models", type=str, default=",".join(DEFAULT_MODELS),
        help=f"CSV of model identifiers (default: {','.join(DEFAULT_MODELS)}).",
    )
    p.add_argument(
        "--out-dir", type=str, default="output/matrix-results",
        help="Output root directory for cell NDJSONs and summaries.",
    )
    p.add_argument(
        "--skip-completed", action="store_true", default=True,
        help="Re-use existing non-empty cell NDJSONs from prior runs (default: on).",
    )
    p.add_argument(
        "--no-skip-completed", dest="skip_completed", action="store_false",
        help="Disable skip-completed; re-runs every cell from scratch.",
    )
    p.add_argument(
        "--subprocess", action="store_true",
        help="Use subprocess fallback instead of in-process API.",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Print every cell that WOULD run but do not invoke the harness.",
    )
    p.add_argument(
        "--aggregate-only", action="store_true",
        help="Skip running cells; just walk --out-dir and emit summaries.",
    )
    p.add_argument(
        "--limit", type=int, default=0,
        help="If >0, only run the first N cells (useful for smoke tests).",
    )
    return p.parse_args(argv)


async def _drive_matrix(
    cells: list[Cell],
    out_dir: Path,
    max_concurrent: int,
    skip_completed: bool,
    use_subprocess: bool,
    dry_run: bool,
) -> list[CellResult]:
    """Schedule every cell through a bounded asyncio.Semaphore."""
    sem = asyncio.Semaphore(max(1, max_concurrent))
    env_lock = asyncio.Lock()
    tasks = [
        _run_one(c, out_dir, sem, env_lock, skip_completed, use_subprocess, dry_run)
        for c in cells
    ]
    results: list[CellResult] = []
    for fut in asyncio.as_completed(tasks):
        r = await fut
        results.append(r)
        status_tag = {
            "ok": "[ok]",
            "skipped": "[skip]",
            "failed": "[FAIL]",
        }.get(r.status, "[?]")
        extra = ""
        if r.status == "ok":
            extra = f" ({r.wallclock_sec:.1f}s, {r.row_count} rows)"
        elif r.status == "failed":
            extra = f"  {r.error.splitlines()[0][:120] if r.error else ''}"
        print(f"  {status_tag} {r.cell.cell_id}{extra}", flush=True)
    return results


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    unknown = [m for m in models if m not in DEFAULT_MODELS]
    if unknown:
        # The pre-registered matrix is closed over a known model set; warn but
        # do not abort -- users may opt in to ad-hoc models for exploration.
        print(f"warn: model(s) not in pre-registered set: {unknown}", file=sys.stderr)

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    cells = enumerate_matrix(models)
    if args.limit and args.limit > 0:
        cells = cells[: args.limit]

    print(f"matrix: {len(cells)} cells "
          f"({len(models)} models x {len(SCENARIOS)} scenarios x "
          f"{len(SEEDS_HEX)} seeds x {len(HORIZONS_SEC)} horizons)")
    print(f"out_dir       : {out_dir}")
    print(f"max_concurrent: {args.max_concurrent}")
    print(f"skip_completed: {args.skip_completed}")
    print(f"mode          : {'subprocess' if args.subprocess else 'in-process'}")
    print(f"dry_run       : {args.dry_run}")
    print(f"delta thresh  : {DELTA_THRESHOLD}")

    if args.dry_run:
        # Print the equivalent CLI invocation for the first 5 cells so the
        # caller can sanity-check the cell-id construction + arg wiring.
        print()
        print("dry-run: first 5 invocations that WOULD be issued:")
        for c in cells[:5]:
            cache_dir = c.cache_dir(out_dir)
            debug_dir = c.debug_log_dir(out_dir)
            out_path = c.out_path(out_dir)
            cmd = [
                "OPENAI_MODEL=" + c.model,
                sys.executable, "-m", "project_utopia.cli.benchmark_paper", "run",
                "--experiment", EXPERIMENT_ID,
                "--scenarios", c.scenario,
                "--seeds", c.seed_hex,
                "--cells", CELL_TYPE,
                "--duration-sec", str(c.duration_sec),
                "--concurrency", "1",
                "--llm-adapter", "llm-client",
                "--cadence-multiplier", str(CADENCE_MULT),
                "--cache-dir", str(cache_dir),
                "--debug-log-dir", str(debug_dir),
                "--out", str(out_path),
            ]
            print(f"  cell_id: {c.cell_id}")
            print(f"  cmd:     {' '.join(shlex.quote(p) for p in cmd)}")
            print()

    results: list[CellResult]
    if args.aggregate_only:
        results = []
        print("aggregate-only mode: skipping cell execution.")
    else:
        t0 = time.perf_counter()
        results = asyncio.run(_drive_matrix(
            cells=cells,
            out_dir=out_dir,
            max_concurrent=args.max_concurrent,
            skip_completed=args.skip_completed,
            use_subprocess=args.subprocess,
            dry_run=args.dry_run,
        ))
        wallclock = time.perf_counter() - t0
        print(f"\nmatrix wallclock: {wallclock:.1f}s")

    # Aggregate regardless of mode -- works even when nothing was run, so a
    # caller can re-aggregate by re-running with --aggregate-only.
    metrics = aggregate_matrix(out_dir, cells)
    write_matrix_summary_csv(out_dir / "matrix_summary.csv", metrics)
    write_per_family_summary_csv(out_dir / "per_family_summary.csv", metrics)
    write_matrix_summary_json(out_dir / "matrix_summary.json", metrics)

    print()
    print(f"wrote: {out_dir / 'matrix_summary.csv'}")
    print(f"wrote: {out_dir / 'per_family_summary.csv'}")
    print(f"wrote: {out_dir / 'matrix_summary.json'}")

    print_final_report(metrics, results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
