## Benchmark System Overview

The benchmark system evaluates AI adaptability, colony performance, and system stability across a wide range of starting conditions. It operates headlessly — no browser or renderer required — by running the full simulation pipeline inside a `SimHarness` wrapper that mirrors the production `GameApp` update order exactly (24-system pipeline as of v0.10.1; see `SYSTEM_ORDER` in `src/config/constants.js`).

There are three main goals:

1. **Regression detection** — confirm that code changes do not degrade survival outcomes, DevIndex, or death counts relative to a tracked baseline.
2. **AI evaluation** — quantify how well the hierarchical AI (StrategicDirector → fallback planner) responds to crises, resource scarcity, population pressure, and infrastructure constraints.
3. **Scenario stress testing** — generate hundreds of randomized scenarios across five difficulty bins and measure T_composite and survival rate per bin.

The system is composed of these modules:

| Module | File | Role |
|--------|------|------|
| SimHarness | `src/benchmark/framework/SimHarness.js` | Headless simulation runner; builds systems in SYSTEM_ORDER |
| BenchmarkPresets | `src/benchmark/BenchmarkPresets.js` | 26 named scenario configurations applied to initial state |
| BenchmarkMetrics | `src/benchmark/BenchmarkMetrics.js` | Score computation (task, cost, decision quality, infrastructure) |
| ScenarioSampler | `src/benchmark/framework/ScenarioSampler.js` | Stratified random scenario generation across difficulty bins |
| ScoringEngine | `src/benchmark/framework/ScoringEngine.js` | Bayesian Beta posterior, consistency adjustment, group comparison |
| ProbeCollector | `src/benchmark/framework/ProbeCollector.js` | Six behavioral capability probes (RESOURCE_TRIAGE, ADAPTATION, etc.) |
| CrisisInjector | `src/benchmark/framework/CrisisInjector.js` | Runtime crisis injection with detection/recovery scoring |
| DecisionTracer | `src/benchmark/framework/DecisionTracer.js` | Causal attribution across Perceiver → Planner → Executor phases |
| DimensionPlugin | `src/benchmark/framework/DimensionPlugin.js` | Protocol definition for pluggable evaluation dimensions |

---

## All 26 Benchmark Presets

The `BENCHMARK_PRESETS` array in `src/benchmark/BenchmarkPresets.js` contains 26 named scenario configurations across five categories: **terrain**, **economy**, **pressure**, **stress**, and **infrastructure**.

### Terrain Category (3 presets)

| ID | Label | Template | Notes |
|----|-------|----------|-------|
| `temperate_default` | Temperate Plains (default) | `temperate_plains` | Baseline open terrain |
| `fortified_default` | Fortified Basin (default) | `fortified_basin` | Enclosed; favors defensive build orders |
| `archipelago_default` | Archipelago Isles (default) | `archipelago_isles` | Water-fragmented; tests bridge/connectivity decisions |

### Economy Category (7 presets)

| ID | Label | Template | Food | Wood | Stone | Herbs |
|----|-------|----------|------|------|-------|-------|
| `scarce_resources` | Scarce Resources | temperate_plains | 8 | 6 | — | — |
| `abundant_resources` | Abundant Resources | temperate_plains | 120 | 100 | — | — |
| `developed_colony` | Developed Colony | fortified_basin | 80 | 70 | 15 | 10 |
| `resource_chains_basic` | Basic Resource Chains | temperate_plains | 60 | 50 | 15 | 10 |
| `full_processing` | Full Processing Chain | fortified_basin | 80 | 60 | 25 | 15 |
| `scarce_advanced` | Scarce Advanced Resources | temperate_plains | 30 | 25 | 5 | 3 |
| `tooled_colony` | Tooled Colony | fortified_basin | 80 | 70 | 10 | 6 |

### Pressure Category (5 presets)

| ID | Label | Template | Notable Modifiers |
|----|-------|----------|-------------------|
| `high_threat` | High Threat | temperate_plains | Threat 65; +3 predators |
| `large_colony` | Large Colony (20 workers) | fortified_basin | +8 workers; food 80, wood 60 |
| `skeleton_crew` | Skeleton Crew (3 workers) | temperate_plains | −9 workers; food 25, wood 20 |
| `wildlife_heavy` | Wildlife Heavy | archipelago_isles | +6 herbivores, +3 predators |
| `storm_start` | Starting in Storm | temperate_plains | Weather=storm 30s at tick 0 |

### Stress Category (5 presets)

| ID | Label | Template | Notable Modifiers |
|----|-------|----------|-------------------|
| `crisis_compound` | Compound Crisis | temperate_plains | −8 workers, food 8, wood 6, storm 25s, +2 predators |
| `island_isolation` | Island Isolation | archipelago_isles | −6 workers, food 20, wood 15 |
| `population_boom` | Population Boom | temperate_plains | +8 workers, food 30, wood 20 |
| `late_game_siege` | Late Game Siege | fortified_basin | Full developed + threat 80, +4 predators, storm 20s |
| `no_director` | No Director (Manual) | temperate_plains | `disableDirector: true` |

### Infrastructure Category (6 presets)

| ID | Label | Template | Roads | Notable |
|----|-------|----------|-------|---------|
| `road_connected` | Road-Connected Colony | temperate_plains | 15 | Tests road speed bonus |
| `road_disconnected` | Disconnected Buildings | temperate_plains | 0 | Same as road_connected, no roads |
| `worker_crowded` | Worker Crowding (12 / 3 sites) | temperate_plains | — | Tests occupancy-aware scoring |
| `worker_spread` | Worker Spread (8 / 12 sites) | temperate_plains | — | Tests spreading |
| `logistics_bottleneck` | Logistics Bottleneck | fortified_basin | 2 | Rich resources, 1 warehouse |
| `mature_roads` | Mature Road Network | temperate_plains | 25 | Road wear test |

---

## Metrics Tracked

### Task Score (`computeTaskScore`)

| Metric | Formula | Weight in T_composite |
|--------|---------|----------------------|
| `T_surv` | `survivalSec / maxSurvivalSec` | 0.20 |
| `T_obj` | `completedObjectives / totalObjectives` (1.0 if no objectives) | 0.25 |
| `T_res` | `1 − (CV_food + CV_wood) / 2` | 0.15 |
| `T_pop` | `1 − deathsTotal / initialWorkers` | 0.15 |
| `T_pros` | `timeWeightedAverage(prosperity) / 100` | 0.15 |
| `T_threat` | `1 − timeWeightedAverage(threat) / 100` | 0.10 |
| `T_composite` | Weighted sum of the above | — |

### Cost Metrics (`computeCostMetrics`)

| Metric | Formula |
|--------|---------|
| `C_tok` | `totalTokens / llmDecisions` |
| `C_min` | `(totalTokens × costPerToken) / gameDurationMin` |
| `C_lat` | `avgLatencyMs / 20000` |
| `C_fb` | `fallbackDecisions / totalDecisions` |

### Decision Quality Metrics

| Metric | Formula |
|--------|---------|
| `D_hall` | `sum(clampedValues) / sum(totalValues)` |
| `D_adapt` | `crisisResponses / crisisEvents` (1.0 if no events) |

### Infrastructure Score

| Metric | Formula | Weight in I_composite |
|--------|---------|----------------------|
| `I_spread` | `mean(avgWorkerSpread)` | 0.30 |
| `I_road` | `mean(1 − (components−1) / max(1, roadTiles/4))` | 0.25 |
| `I_logis` | `mean(connected / (connected + isolated))` | 0.25 |
| `I_wear` | `mean(1 − avgRoadWear)` | 0.20 |

### DevIndex (live in-game metric)

`DevIndexSystem` runs every simulation tick (after `ProgressionSystem`) and aggregates six dimensions into a 0–100 composite, each weighted 1/6: population, economy, infrastructure, production, defense, resilience. `state.gameplay.devIndexSmoothed` is the 60-tick ring-buffer mean; `RaidEscalatorSystem` reads it to scale raid intensity.

---

## Always-On FPS & Perftrace (HW7 R1 A2)

Two new always-on diagnostic surfaces were added:

- **`window.__fps_observed`** — always-on FPS sampler (R1 A2). Required because the headless RAF cap (see caveat below) makes the previous render-loop fps inaccessible from the harness; this surface gives the test runner an actual cadence number.
- **`window.__perftrace.topSystems`** — sliding-window per-system avg / peak ms (R1 A2). The PerformancePanel reads this to display the top hot systems table; it's the **canonical perf signal under headless Playwright** (see methodology note).

```js
window.__fps_observed                  // float, last sampled FPS
window.__perftrace.topSystems          // [{ name, avgMs, peakMs }, ...]
window.__perftrace.frameMs             // float, render-loop wall-time per frame
window.__perftrace.systemTimingsMs     // per-system timing accumulator
```

---

## How to Run Benchmarks

### Entry Point

```
node src/benchmark/run.js [flags]
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--probes=ID1,ID2` | all 6 probes | Run only the listed capability probes |
| `--scenarios=N` | 10 | Number of randomly generated scenarios for stress test |
| `--seeds=N` | 3 | Number of seed repetitions for each probe |
| `--seed=N` | 42 | Master seed for probe runs |
| `--template=ID` | `temperate_plains` | Map template for single-template runs |
| `--duration=N` | 120 | Scenario run duration in seconds |
| `--master-seed=N` | 12345 | Seed for the stratified scenario generator |
| `--crisis-duration=N` | 300 | Duration of the crisis adaptation test in seconds |
| `--only=probes,scenarios,crisis` | all three | Run only the listed sections |

### Examples

```bash
# Full benchmark run
node src/benchmark/run.js

# Capability probes only, 5 seeds
node src/benchmark/run.js --only=probes --seeds=5 --template=fortified_basin

# Stress test: 20 scenarios, 180 s each
node src/benchmark/run.js --only=scenarios --scenarios=20 --duration=180

# Crisis adaptation only
node src/benchmark/run.js --only=crisis --crisis-duration=600
```

### Unit Tests

```bash
# All benchmark tests
node --test test/benchmark-metrics.test.js test/benchmark-presets.test.js test/benchmark-framework.test.js

# Full test suite
node --test test/*.test.js
```

### Output

Results are written to `results/benchmark-<timestamp>.json`. Console output during a stress test:

```
  ✓ temperate_default       D=0.12 T=0.847
  ✗ crisis_compound         D=0.89 T=0.213
```

`✓` = colony survived (session phase never reached "end"/loss); `✗` = eliminated. `D` = scenario difficulty, `T` = `T_composite`.

---

## Scoring

### Pass/Fail

Pass/fail for a named preset run is determined by:

1. `session.phase !== "end"` OR `session.outcome !== "loss"` — colony reached target duration without elimination.
2. Optionally: `T_composite ≥ threshold` for automated gate checks.

The canonical long-horizon gate uses Day-365 DevIndex ≥ 70 (aspirational target).

### Bayesian Scoring

`bayesianScore(scores)` places a Beta(2, 2) weakly informative prior over [0, 1] and returns mean / std / ci95 / median / p5 / p95.

### Consistency Adjustment

`consistencyAdjustedScore(scores, lambda=0.5)` applies `finalScore = mean − 0.5 × std` so a strategy that scores 0.80 consistently ranks higher than one alternating 0.95 / 0.65.

### Relative Scoring

`relativeScore(agentScore, baselineScore, ceilingScore) = clamp((agent − baseline) / (ceiling − baseline), 0, 1)`

### Group Comparison

`compareGroups(treatment, control)` computes Cohen's d + BIC-approximated BF10:

| Verdict | Condition |
|---------|-----------|
| `CONFIRMED_IMPROVEMENT` | BF10 > 10 and \|d\| > 0.5 |
| `LIKELY_IMPROVEMENT` | BF10 > 3 and \|d\| > 0.3 |
| `NO_EFFECT` | BF10 < 1/3 |
| `AMBIGUOUS` | all other cases |

### Difficulty Bins

| Bin | Difficulty Range | Weights |
|-----|-----------------|---------|
| trivial | [0.00, 0.15) | scarcity 35%, threat 25%, pop stress 20%, weather 20% |
| easy | [0.15, 0.30) | — |
| medium | [0.30, 0.45) | — |
| hard | [0.45, 0.65) | — |
| extreme | [0.65, 1.00] | — |

`difficulty = 0.35 × scarcity + 0.25 × threatNorm + 0.20 × populationStress + 0.20 × weatherPenalty`

---

## Capability Probes

| Probe ID | Tests | Score Formula |
|----------|-------|---------------|
| `RESOURCE_TRIAGE` | When food=3, ≥50% workers in food roles within 30 s? | `min(1, foodWorkerRatio / 0.5)` |
| `THREAT_RESPONSE` | After 3 predators at t=60s, walls within 60 s? | `1 − latencySec / 60` |
| `BOTTLENECK_ID` | 8 farms 0 warehouses, build warehouse within 60 s? | Binary |
| `PLAN_COHERENCE` | Same goal across 5 samples at 20s intervals? | `1 − switchRate` |
| `ADAPTATION` | Resource crash + storm at t=60s, recover to 80% in 120 s? | `1 − recoverySec / 120` |
| `SCALING` | Resource-per-worker at 25 stays ≥50% of at 5? | `min(1, eff25 / eff5 / 0.5)` |

---

## Crisis Injection

`CrisisInjector` waits for steady state, injects crises, measures:

| Score | Formula |
|-------|---------|
| `detectionScore` | `max(0, 1 − detectionLag / 100)` |
| `recoveryScore` | `max(0, 1 − recoveryTicks / 300)` |
| `resilienceScore` | `max(0, 1 − dropRatio)` |
| `composite` | `0.30·detection + 0.30·recovery + 0.40·resilience` |

Four crisis types: `drought`, `predator_surge`, `resource_crash`, `epidemic`.

---

## Headless Playwright RAF Cap — Methodology Caveat (HW7 R3 A2)

When Chromium runs headless under Playwright with no `--disable-renderer-backgrounding` family of flags, the compositor backgrounds the (offscreen) renderer and clamps `requestAnimationFrame` to ~1 Hz. Observed signal: `dt ≈ 1004 ms` per game tick, fps ≈ 0.996, `__perftrace.frameMs ≈ 0.4 ms` (the render loop itself finishes in <1 ms per frame, but the browser only fires it once per second). FPS measurements off the headless harness measure the throttle, not the project. R0 → R2 P50 numbers (54.5 / 55 / 56) were noise inside the throttle, not project drift.

**Ground-truth path**: `window.__perftrace.topSystems` records sim-system wall-time independent of the RAF schedule. R3 A2 numbers (avg < 2 ms, peak < 6 ms, mem +11.52 % over 30 min) were collected via this path.

**Required Chromium flags for any RAF-driven FPS measurement**:

```
--disable-renderer-backgrounding
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
```

All three are required together (missing any one silently re-enables 1 Hz throttle on at least one Chromium version family).

**Mandatory R4+ rule**: any future Reviewer / Validator that records an FPS number must either (a) launch Playwright with the three flags above and cite which flags were used, OR (b) cite `window.__perftrace.topSystems` / `__perftrace.frameMs` as ground truth. Citing a raw fps number from a default-flag headless run is grounds for that report being marked `UNRELIABLE-MEASUREMENT` in the Validator gate.

---

## Version History of Benchmark Results

All results use the canonical run: `seed=42 / temperate_plains / day-365` (long-horizon) or `day-90` (HW7 short-horizon iteration gate).

### Long-Horizon (day-365)

| Version | DevIndex (day 365) | Deaths | Notes |
|---------|--------------------|--------|-------|
| v0.8.0 Phase 7 baseline | 39.03 | 512 | Pre-Phase 8; food=0 at day 365 |
| v0.8.1 (Phase 8 hardening) | 43.69 | 454 | yieldPool fix, kitchen fallback tier, salinization 0.012, fog 6, FOOD_COST 10 |
| Target | 70 | — | Day-365 survival hardening goal |

### HW7 Short-Horizon (day-90, iteration gate)

| Round | HEAD | DevIndex | Deaths | Tests | Notes |
|-------|------|----------|--------|-------|-------|
| HW6 baseline | — | 37.77 | — | — | Pre-HW7 reference |
| HW7 R0 | 1f6ecc6 | **46.66** | 43 | 1665 / 1673 | Stage C 10 commits + fix-up; A5 food fix reversed (do-nothing wins) |
| HW7 R1 | d242719 | **53.53** | 77 | 1701 / 1708 | A5 entity.hunger reconnect; **fail-state restored** (deaths +79% intentional) |
| HW7 R2 | 0344a4b | **47.66** | 60 | 1723 / 1732 | A5 r2: TRADE_CARAVAN halved, recovery needs deaths>0, raid gate; DevIndex −10.97% within ≤30% corridor |
| HW7 R3 | 2f31346 | **49.41** | 86 | ~1778 (1766+) | A2 cadence gates, A6 chip-wrap fixes, A7 heat-lens label, hotfix iters 1-5 |

R0 → R3 trajectory:
- DevIndex: 46.66 → 53.53 → 47.66 → 49.41 (vs HW6 baseline 37.77 = **+30.8%** at R3)
- Deaths: 43 → 77 → 60 → 86 (intentional fail-state restoration at R1; subsequent waves balance recovery vs lethality)
- Test count: 1665 → 1701 → 1723 → 1766 → ~1778

Long-horizon test duration is 730 simulated days (~2 years at the game's time scale); the 365-day checkpoint is the primary regression gate. A 548-day exemption clause waives the DevIndex monotonicity rule when the run enters a "DevIndex OR plateau" state.
