# Project Utopia Optimization Progress

Last refresh: 2026-05-01 (G3 docs gate, post HW7 R3 + Hotfix iter4). HEAD: `2f31346`.

## Round timeline (HW7 Final-Polish-Loop perf track)

| Round | Base commit | Head commit | Verdict | Plan delta on perf track |
| --- | --- | --- | --- | --- |
| R0 | `3f87bf4` | `1f6ecc6` | YELLOW (gate 5 WARN, gate 3 YELLOW headless RAF) | A2 added `__fps_observed` always-on render-loop FPS probe + `?perftrace=1` flag exposing `__perftrace` snapshot of `state.debug.systemTimingsMs`; PerformancePanel renders top hot systems lazily; `test/perf-system-budget.test.js` first-pass regression added. |
| R1 | `1f6ecc6` | `d242719` | YELLOW (Gate 3 p5 PASS, p50 ~95% target, RAF-bound) | A2 SceneRenderer perf shave: `__pressureLensSignature` cache short-circuit + `__updatePressureLensLabels` Map reuse + 4 scratch-buffer reuse fields + entityMesh interval ≥1/30s throttle when `selectedEntityId == null`; `test/perf-allocation-budget.test.js` (8 tests) added. |
| R2 | `d242719` | `0344a4b` | YELLOW (Gate 3 RAF-bound, all sub-ms frame work) | A2 cadence gate: `AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC = 0.5s` gate on `AgentDirectorSystem` heavy work (perceiver.observe, snapshotState pre/post, executeNextSteps, shouldReplan); `ProgressionSystem` 0.25s dt-accumulator gate (coverage/milestones/recovery scans). Fast-path preserved (mode select, activePlan mirror, dt-integration scoring stay every-tick). `test/agent-director-cadence.test.js` added. |
| R3 | `0344a4b` | `1d11ba7` | GREEN (Gate 3 YELLOW with documented RAF-cap caveat) | Validator data: prod build clean (`vite build` 4.82s, 144 modules), 3 chunks 500–650 KB (vendor-three 612.94 KB largest, 0 chunks > 1 MB). A2 R3 documented Playwright headless RAF 1 Hz throttle as measurement-pipeline issue (not product); see PROCESS-LOG R3 Closeout — Perf Methodology Note. |
| Hotfix iter4 | `1d11ba7` | `2f31346` | green (Batch E/F + pop-cap removal) | Non-perf hotfixes; perf surface unchanged. |

## Gate-3 measured FPS deltas (headless Chromium, RAF-bound)

| Round | Idle p50 / p5 | Mid-load p50 / p5 (entities) | Stress p50 / p5 (entities) | Notes |
| --- | --- | --- | --- | --- |
| R0 | 1.00 / 0.99 (RAF cap) | 1.00 / 0.99 (~30 workers) | 0.99 / 0.99 (~100 workers) | `__fps_observed` newly added; readings hit headless RAF cap. |
| R1 | 55.7 / 55.2 | 56.4 / 53.2 (20) | 54.9 / 44.6 (87) | p5 PASSES 30 target; p50 sits 4–9% under 60. |
| R2 | 56.19 / 44.84 | 56.26 / 44.64 (18, 1×) | 55.93 / 45.25 (86, 8×) | `frameMs ≈ 0.4 ms`, `headroomFps ≈ 2500` — sim cost is sub-ms; FPS cap is RAF, not work. |
| R3 | 0.996 / 0.996 (RAF 1 Hz lock) | 0.996 → 1.03 (~20) | not exercised | Playwright headless RAF locked to `frameDtMs ≈ 1004 ms` — see headless RAF cap section. |

## Sim-side health (perftrace ground truth, NOT RAF-throttled)

| Round | Top system avg (ms) | Top system peak (ms) | Frame work | Source |
| --- | --- | --- | --- | --- |
| R0 | WorkerAISystem avg 0.36 | WorkerAISystem peak 7.45; NPCBrainSystem peak 7.29; EnvironmentDirectorSystem peak 5.80 | well within 16 ms budget at 100 workers | Round0/Validation/test-report.md §FPS |
| R1 | WorkerAISystem avg 0.10–0.21 | WorkerAISystem peak 2.26 ms over 9k+ frames at 87 entities | sub-ms steady, RAF cap is the bottleneck | Round1/Validation/test-report.md §FPS |
| R2 | WorkerAISystem avg 0.19; NPCBrainSystem 0.01; EnvironmentDirector 0.00 | per-frame sim ≤ 0.4 ms across all scenarios at 8× / 86 entities | A2 cadence gate verified firing | Round2/Validation/test-report.md §FPS |
| R3 | (per-system reads as 0 in headless RAF; ground truth = R2 numbers) | — | — | Round3/Validation/test-report.md §FPS |

## Long-horizon bench trajectory (regression-only spec)

| Round | DevIndex (last) | Δ vs prior | Deaths d90 | Notes |
| --- | --- | --- | --- | --- |
| HW6 baseline | 37.77 | — | 157 | reference |
| R0 | 46.66 | +23.5% vs HW6 | 43 | A5 runway extension |
| R1 | 53.53 | +14.7% vs R0; +41.7% vs HW6 | 77 | A5 entity.hunger reconnection (intentional fail-state restoration) |
| R2 | 47.66 | -10.97% vs R1 (within ≤30% intentional balance corridor) | 60 | A5 emergency-relief gate |
| R3 | 49.41 | +3.7% vs R2 | 86 | A5 recovery whitelist + zero-farm safety net |

DevIndex regression-only floor: R3 vs R2 × 0.9 = 42.89 → 49.41 PASSES.

## Headless RAF cap — documented limitation

Playwright headless Chromium throttles `requestAnimationFrame` to ~1 Hz when the page is not focused / not painting. Both `window.__fps_observed` (A2 R1 always-on render-loop FPS probe) and `state.metrics.performance.fps` (GameApp EMA) read off RAF and are equally affected. This is a measurement-pipeline issue, not a project bug.

Required Chromium flags for any future non-headless / hybrid FPS measurement (any one missing silently re-enables the throttle):

```
--disable-renderer-backgrounding
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
```

Canonical R3 perf-methodology cross-link: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` § "R3 Closeout — Perf Methodology Note (A2)" + `assignments/homework7/Post-Mortem.md`. Validators that cannot apply the flags should cite `window.__perftrace.topSystems` / `__perftrace.frameMs` as the ground-truth perf signal instead of a raw fps number.

## Tests added on the perf track

| File | Round | Purpose |
| --- | --- | --- |
| `test/perf-system-budget.test.js` | R0 | Per-system tick budget regression smoke; instruments per-system wall-clock with the same EMA contract as `GameApp.stepSimulation`; soft-skipped under `CI_FAST=1`. |
| `test/perf-allocation-budget.test.js` | R1 | 8 tests covering `__pressureLensSignature` cache-identity contract + scratch-buffer reuse contract for `__updatePressureLensLabels`. |
| `test/agent-director-cadence.test.js` | R2 | Asserts heavy AgentDirector work is gated to `AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC = 0.5s` while fast-path (mode select, activePlan mirror, fallback throttle) still runs every tick. |

## Bundle size (Gate 5)

| Round | Largest chunk | Total raw | Total gzip | Verdict |
| --- | --- | --- | --- | --- |
| R0 | `index-BqJcAoZX.js` 618.31 KB (gz 184.91 KB) | ~1.95 MB | ~549 KB | WARN (3 chunks 500 KB–1 MB; 0 > 1 MB) |
| R1 | `index-CJ_75JFb.js` 621.18 KB (gz 185.73 KB) | ~1.96 MB | ~552 KB | WARN (same shape) |
| R2 | `index-esbQ3dTG.js` 623.30 KB (gz 186.36 KB) | ~1.97 MB | ~556 KB | WARN |
| R3 | `vendor-three-BPnqBKSD.js` 612.94 KB (gz 157.55 KB) | ~1.98 MB | ~0.56 MB | WARN (vendor-three is the dominant fixed cost) |

No chunk has crossed the 1 MB RED line in any round. Bundle composition is structurally unchanged across HW7 — the lever for moving Gate 5 to GREEN is `vendor-three` tree-shaking / scoped imports (out of scope under HW7 freeze).

## Status of long-running optimization items (R0–R3 + hotfix completion map)

| Item | Status | Closed in |
| --- | --- | --- |
| `__fps_observed` always-on render-loop FPS probe | DONE | R0 |
| `?perftrace=1` query flag exposing `__perftrace` snapshot | DONE | R0 |
| PerformancePanel top hot systems display | DONE | R0 |
| `perf-system-budget` regression test | DONE | R0 |
| `__pressureLensSignature` scratch reuse (4/5 per-frame allocations eliminated) | DONE | R1 |
| `__updatePressureLensLabels` Map reuse | DONE | R1 |
| entityMesh interval ≥ 1/30s throttle when no `selectedEntityId` | DONE | R1 |
| `_labelProjectedScratch` etc. scratch-buffer reuse | DONE | R1 |
| `perf-allocation-budget` regression test (8 tests) | DONE | R1 |
| `AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC = 0.5s` cadence gate | DONE | R2 |
| `ProgressionSystem` 0.25s dt-accumulator gate (coverage / milestones / recovery scans) | DONE | R2 |
| Fast-path preserved (mode select, activePlan mirror, dt-integration scoring) | DONE | R2 |
| `agent-director-cadence` regression test | DONE | R2 |
| Headless RAF cap documented + Chromium flag remediation | DONE | R3 |
| Prod build clean (`vite build` ~5s, 144 modules, 3 chunks 500–650 KB, 0 > 1 MB) | DONE | R3 |

## Open follow-ups (HW8+ candidates, not in HW7 freeze scope)

1. **Real-Chrome FPS validation** — apply the three Chromium flags above (or move to a non-headless Playwright harness) so Gate 3 can move from YELLOW to GREEN on its own merits. Sim-side ground truth at R2 (≤ 0.4 ms/frame at 8× / 86 entities) already supports a 60 fps target.
2. **Bundle WARN → GREEN** — `vendor-three` tree-shaking / scoped imports; lazy-loading the LLM-prompt-builder pathways; or splitting heavy panels into route-level lazy imports. R0–R3 deliberately did not address this under HW7 freeze.
3. **Multi-seed averaging for long-horizon bench** — single seed=42 plains baseline gives a noisy DevIndex / deaths read; recommend 50-seed averaging in HW8+ to characterize the post-A5 distribution properly.
4. **`worker-ai-bare-init Fix 2/3` flake** — wall-clock-dependent assertion; replace `Date.now()` dependency with deterministic simulated-time check.
5. **Visitor FSM USE_VISITOR_FSM** — wave-3.5 work to fill in TRADE / SCOUT / SABOTAGE / EVADE / SEEK_FOOD / EAT body bodies + flip flag ON (status: skeleton + 9 tests landed in R2; ON in R3).
6. **Faction-aware reachability cache** — carried over from v0.9.x audit-A2 follow-up; would zero scenario E's residual stuck>3s tail.
7. **At-warehouse fast-eat tuning** — carried over from v0.10.0 deferred list.

## LOGIC-BASELINE-2026-03 (historical; predates HW7)

Timestamp: 2026-03-03T05:27:43Z. Command: `npm run bench:logic`. Output: `docs/logic-baseline-2026-03.json`.

- `goalFlipCount`: 163
- `invalidTransitionCount`: 0
- `deathsTotal`: 5
- `deliverWithoutCarryCount`: 0
- `pathRecalcByEntityTopN[0]`: `animal_30=86`

Logic-consistency hardening landed in this baseline: strict feasibility gate (`src/simulation/npc/state/StateFeasibility.js`); planner resolves `local -> policy -> ai`; worker `deliver` hard-guards `carry>0`; emergency ration cooldown + reachable-food guard; visitor trade/saboteur loops avoid wander fallback jitter; animal flee hysteresis + predator target-switch throttling; mortality uses mixed nutrition reachability. Verification: `npm test` (57/57), `npm run build`, `npm run bench:logic` all pass.

## Historical risks (resolved / superseded)

- M5 deep structural split (SceneRenderer / Grid / GameApp) — superseded by R0–R3 perftrace-led work; SceneRenderer scratch reuse + A2 cadence gate addressed the actual hotspots without a structural split.
- Snapshot file-import workflow — orthogonal to perf track; unchanged across HW7.
- Replay auto-replay executor — orthogonal to perf track; unchanged across HW7.
