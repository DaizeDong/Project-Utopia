"""Cross-substrate dialogue matrix runner.

Mirrors the shape of tools/matrix_runner.py (colony substrate) but
on the customer-support dialogue loop in dialogue_substrate.py.
Default matrix: 3 scenarios × 3 seeds × 2 horizons × 1 model = 18
cells, matching the colony pilot's per-cell count so the
substrate-comparison table in paper §4.6 is symmetric.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

from .dialogue_substrate import run_session


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "output" / "cross-substrate"

SCENARIOS = ("easy", "noisy", "adversarial")
SEEDS = (0xBEEF, 0xC0FFEE, 0xCAFE)
HORIZONS = (5, 15)  # short, long — analogous to 10-min / 60-min cells
DEFAULT_MODEL = "openai/deepseek/deepseek-v4-flash"
DELTA_THRESHOLD = 0.30


@dataclass
class Cell:
    model: str
    scenario: str
    seed: int
    horizon: int

    @property
    def cell_id(self) -> str:
        return f"{self.model.replace('/', '__')}__{self.scenario}__{self.seed:#x}__{self.horizon}t"

    def out_path(self, out_dir: Path) -> Path:
        sub = self.model.replace("/", "_")
        return out_dir / sub / self.scenario / f"{self.seed:#x}_{self.horizon}t.json"


def enumerate_cells(model: str) -> list[Cell]:
    return [
        Cell(model=model, scenario=sc, seed=seed, horizon=h)
        for sc in SCENARIOS
        for seed in SEEDS
        for h in HORIZONS
    ]


async def run_cell(cell: Cell, out_dir: Path,
                   skip_completed: bool = True) -> dict:
    out_path = cell.out_path(out_dir)
    if skip_completed and out_path.exists() and out_path.stat().st_size > 0:
        try:
            return json.loads(out_path.read_text(encoding="utf-8"))
        except Exception:
            pass  # fall through to re-run
    out_path.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    result = await run_session(
        model=cell.model,
        scenario=cell.scenario,
        seed=cell.seed,
        horizon_turns=cell.horizon,
    )
    result["wallclock_sec"] = round(time.time() - t0, 1)
    result["cell_id"] = cell.cell_id
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def aggregate(results: list[dict]) -> list[dict]:
    """Aggregate per (scenario, horizon) condition (n=3 seeds each)."""
    from collections import defaultdict
    by_cond: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for r in results:
        by_cond[(r["scenario"], r["horizon_turns"])].append(r)
    rows = []
    for (sc, hzn), cells in sorted(by_cond.items()):
        deltas = [c["delta_final"] for c in cells]
        afrs = [c["afr_final"] for c in cells]
        agrs = [c["agr_final"] for c in cells]
        n = len(cells)
        mean_d = sum(deltas) / n
        var_d = sum((d - mean_d) ** 2 for d in deltas) / max(1, n - 1)
        std_d = var_d ** 0.5
        crossings = sum(1 for d in deltas if abs(d) > DELTA_THRESHOLD)
        rows.append({
            "scenario": sc,
            "horizon_turns": hzn,
            "n_cells": n,
            "mean_delta_final": round(mean_d, 4),
            "std_delta_final": round(std_d, 4),
            "abs_mean_delta_final": round(abs(mean_d), 4),
            "threshold_crossings": crossings,
            "delta_threshold": DELTA_THRESHOLD,
            "mean_afr": round(sum(afrs) / n, 4),
            "mean_agr": round(sum(agrs) / n, 4),
        })
    return rows


def write_summaries(out_dir: Path, results: list[dict]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    # matrix_summary.csv: one row per cell
    csv_path = out_dir / "matrix_summary.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "model", "scenario", "seed", "horizon_turns",
            "afr_final", "agr_final", "delta_final",
            "afr_mean", "agr_mean", "delta_mean",
            "n_verbal_fallback", "n_action_fallback",
            "wallclock_sec",
        ])
        for r in results:
            writer.writerow([
                r["model"], r["scenario"], f"{r['seed']:#x}", r["horizon_turns"],
                f"{r['afr_final']:.4f}", f"{r['agr_final']:.4f}", f"{r['delta_final']:+.4f}",
                f"{r['afr_mean']:.4f}", f"{r['agr_mean']:.4f}", f"{r['delta_mean']:+.4f}",
                r["n_verbal_fallback"], r["n_action_fallback"],
                r.get("wallclock_sec", ""),
            ])
    print(f"wrote {csv_path}")
    # per_condition_summary.csv
    agg = aggregate(results)
    agg_path = out_dir / "per_condition_summary.csv"
    with agg_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "scenario", "horizon_turns", "n_cells",
            "mean_delta_final", "std_delta_final", "abs_mean_delta_final",
            "threshold_crossings", "delta_threshold",
            "mean_afr", "mean_agr",
        ])
        for row in agg:
            writer.writerow([row[k] for k in [
                "scenario", "horizon_turns", "n_cells",
                "mean_delta_final", "std_delta_final", "abs_mean_delta_final",
                "threshold_crossings", "delta_threshold",
                "mean_afr", "mean_agr",
            ]])
    print(f"wrote {agg_path}")
    json_path = out_dir / "matrix_summary.json"
    json_path.write_text(json.dumps({"cells": results, "per_condition": agg}, indent=2),
                         encoding="utf-8")
    print(f"wrote {json_path}")


async def amain(model: str, out_dir: Path, skip_completed: bool, dry_run: bool,
                limit: int | None = None) -> None:
    cells = enumerate_cells(model)
    if limit is not None and limit > 0:
        cells = cells[:limit]
    print(f"cross-substrate matrix: {len(cells)} cells "
          f"({len(SCENARIOS)} scenarios × {len(SEEDS)} seeds × "
          f"{len(HORIZONS)} horizons × 1 model)")
    if dry_run:
        for c in cells:
            print(f"  [dry] {c.cell_id}")
        return
    results: list[dict] = []
    t0 = time.time()
    for i, c in enumerate(cells, 1):
        print(f"[{i:>2}/{len(cells)}] {c.cell_id} ...", flush=True)
        try:
            r = await run_cell(c, out_dir, skip_completed=skip_completed)
            results.append(r)
            print(f"           AFR={r['afr_final']:.3f} AGR={r['agr_final']:.3f} "
                  f"Δ={r['delta_final']:+.3f} fb_v={r['n_verbal_fallback']} "
                  f"fb_a={r['n_action_fallback']} wall={r.get('wallclock_sec', '?')}s")
        except Exception as e:  # noqa: BLE001
            print(f"           FAILED: {type(e).__name__}: {str(e)[:120]}")
    print(f"\ntotal wall: {time.time() - t0:.0f}s")
    write_summaries(out_dir, results)
    # Final report
    print("\n=== cross-substrate final report ===")
    print(f"cells: {len(results)} ok")
    crossings = sum(1 for r in results if abs(r["delta_final"]) > DELTA_THRESHOLD)
    print(f"|Delta|>{DELTA_THRESHOLD} crossings: {crossings}/{len(results)}")
    print("\nper-condition aggregate:")
    for row in aggregate(results):
        print(f"  {row['scenario']:>14s} h={row['horizon_turns']:>2}t  "
              f"Δ̄={row['mean_delta_final']:+.3f}±{row['std_delta_final']:.3f}  "
              f"|Δ̄|={row['abs_mean_delta_final']:.3f}  thr={row['threshold_crossings']}/{row['n_cells']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT))
    parser.add_argument("--no-skip-completed", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None,
                        help="If set, only run first N cells")
    args = parser.parse_args()
    asyncio.run(amain(
        model=args.model,
        out_dir=Path(args.out_dir),
        skip_completed=not args.no_skip_completed,
        dry_run=args.dry_run,
        limit=args.limit,
    ))


if __name__ == "__main__":
    main()
