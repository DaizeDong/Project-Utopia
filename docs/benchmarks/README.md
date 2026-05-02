# Benchmark Reports

This directory holds **committed** benchmark baselines and the harness
documentation. **Generated** per-run artefacts land under
`output/benchmark-runs/long-horizon/` (gitignored via the existing `output/`
entry). Do not hand-edit any of the JSON/MD files here.

## Harness inventory

| Harness | Script | Intent | Output dir |
|---|---|---|---|
| **Long-horizon** | `scripts/long-horizon-bench.mjs` | 30/90/180/365/548/730-day DevIndex curves, monotonicity rule | `output/benchmark-runs/long-horizon/` |
| Soak | `scripts/soak-sim.mjs` | Steady-state colony metrics over fixed wall-time | `output/benchmark-runs/` |
| Ablation | `scripts/ablation-benchmark.mjs` | A/B param-toggle comparisons | `output/benchmark-runs/` |
| Unified eval | `src/benchmark/run.js` (+ `npm run bench:perf`, `bench:logic`) | Bayesian scoring across presets | `output/benchmark-runs/` |

## Long-Horizon Benchmark (`bench:long`)

Headless multi-day simulation harness defined in
[`docs/superpowers/specs/2026-04-21-living-world-balance-design.md`](../superpowers/specs/2026-04-21-living-world-balance-design.md)
section 16. The matrix runs 10 seeds × 3 presets
(`temperate_plains`, `rugged_highlands`, `fertile_riverlands`) = 30 runs,
sampling DevIndex / population / resources / raid state at day boundaries
`{30, 90, 180, 365, 548, 730}` plus the terminal tick. Validation applies the
spec § 16.2 thresholds, the data-integrity rules (non-finite checkpoint,
post-terminal checkpoint, simulation crash), and the 15% DevIndex
monotonicity rule.

### Known limitations (v0.8.0 Phase 6 landing)

The harness is intentionally landed with a few stubbed fields. Phase 7 will
wire these before enabling full hard-validation in CI:

- **`nodes.{forest,stone,herb}.{known,depleted}`** — marker `_stub: true`,
  values are all 0. Phase 7 wires these from the real resource-node inventory.
- **`raidsRepelled`** — reads `state.metrics.raidsRepelled` (monotonic
  counter) once Phase 7 instruments raid-outcome events; until then the scan
  of `state.events.log` returns 0. Day-365 `raidsRepelled ≥ 10` threshold is
  effectively inert until that wiring lands.
- **`saturationIndicator`** — proxy (`min(dim)/100`) until the real
  `usedTiles / revealedUsableTiles` field ships. Returns `NaN` when dims are
  structurally absent, which surfaces as a `non_finite_in_checkpoint`
  violation rather than a silent zero.
- **Spec § 16.2 Day-90 "avg food reserves ≥ 60"** — not yet enforced; Phase 7
  tuning will add it after the target curve is validated against real data.
- **Smoke soft floors (30 / 30)** — Phase 6 lands the harness with relaxed
  thresholds (spec targets 40 / 55). Phase 7 tuning raises these.

### Commands

- `npm run bench:long -- --seed 42 --max-days 365` — single run.
- `npm run bench:long:smoke` — soft-validated 90-day smoke for CI PR gate.
  Uses `--soft-validation true`; hard violations (monotonicity, data
  integrity, crash, loss-before-day-180) still block.
- `npm run bench:long:matrix` — the nightly 30-run matrix.

### Flag contract

Known flags: `--seed`, `--max-days`, `--preset`, `--tick-rate`,
`--stop-on-death`, `--stop-on-saturation`, `--soft-validation`, `--out-dir`.
`parseArgs` rejects unknown flags and rejects malformed boolean values so CI
typos fail fast.

## Baseline v0.7.0

`baseline-v0.7.0.{json,md}` — the frozen reference snapshot used when
comparing Phase-level DevIndex deltas. Do not overwrite without updating the
CHANGELOG and the living-world design spec's tuning log.

> **Current bench-relevant baseline (2026-05-01)**: HW7 Final-Polish-Loop R3
> — DevIndex day-90 = **49.41** / Deaths = **86** (vs HW6 baseline DevIndex
> 37.77 / Deaths 157, Δ +30.8% / −45%). See `baseline-v0.7.0.md` historical
> note + `tuning-log.md` HW7 R0 → R3 + hotfix entries + `benchmark-catalog.md`
> § 6 for the full trajectory.

## Script invocation reference (refreshed 2026-05-01)

These are the canonical bench harnesses currently in `scripts/`:

| Script | npm alias | Intent | Notes |
|---|---|---|---|
| `scripts/long-horizon-bench.mjs` | `npm run bench:long` | Single-run multi-day DevIndex curve | Flags: `--seed N`, `--max-days D`, `--preset NAME`, `--tick-rate R`, `--stop-on-death BOOL`, `--stop-on-saturation BOOL`, `--soft-validation BOOL`, `--out-dir PATH`. Unknown / malformed flags rejected. |
| `scripts/long-horizon-matrix.mjs` | `npm run bench:long:matrix` | Nightly 10-seed × 3-preset matrix (30 runs) | Outputs to `output/benchmark-runs/long-horizon/` |
| `scripts/long-horizon-bench.mjs --soft-validation true --max-days 90` | `npm run bench:long:smoke` | CI PR-gate smoke (90-day, soft validation) | Hard violations (monotonicity, data integrity, crash, loss-before-day-180) still block |
| `scripts/bench-perf.mjs` | `npm run bench:perf` | Per-preset perf wall-time (grid-gen, A*, render) | Used as Phase tuning sanity-check |
| `scripts/logic-baseline.mjs` | `npm run bench:logic` | Goal-flip / invariant / deliverWithoutCarry counts | Ships per-version logic invariant baseline |
| `scripts/soak-sim.mjs` | — | Steady-state colony metrics, fixed wall-time | Outputs to `output/benchmark-runs/` |
| `scripts/ablation-benchmark.mjs` | — | A/B param-toggle comparison | Phase-component contribution attribution |
| `scripts/comprehensive-eval.mjs` | — | 22-scenario / 3-tier evaluation report | Source for `docs/evaluation/eval-report.md` |
| `src/benchmark/run.js` | (entry) | Bayesian scoring across presets | Per `docs/benchmark-improvement-proposal.md` § 3.3 |

For the 8 component / runner benches (perceiver, planner, executor,
evaluator, director, skills, ablation, benchmark-runner), see
`docs/benchmark-catalog.md` § 3.

### HW7 perf-measurement caveat (NEW)

When running any of these harnesses under Playwright headless Chromium,
the renderer is throttled to ~1 Hz unless launched with
`--disable-renderer-backgrounding` + `--disable-background-timer-throttling` +
`--disable-backgrounding-occluded-windows`. Use
`window.__perftrace.topSystems` / `__perftrace.frameMs` as the
ground-truth perf signal under headless mode. See
`docs/benchmark-methodology-review.md` § 7 for the full caveat.
