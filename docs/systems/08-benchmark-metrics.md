## Benchmark System Overview

The benchmark system evaluates AI adaptability, colony performance, and system stability across a wide range of starting conditions. It operates headlessly — no browser or renderer required — by running the full 21-system simulation pipeline inside a `SimHarness` wrapper that mirrors the production `GameApp` update order exactly.

There are three main goals:

1. **Regression detection** — confirm that code changes do not degrade survival outcomes, DevIndex, or death counts relative to a tracked baseline.
2. **AI evaluation** — quantify how well the hierarchical AI (StrategicDirector → fallback planner) responds to crises, resource scarcity, population pressure, and infrastructure constraints.
3. **Scenario stress testing** — generate hundreds of randomized scenarios across five difficulty bins and measure T_composite and survival rate per bin.

The system is composed of five modules:

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

The `BENCHMARK_PRESETS` array in `src/benchmark/BenchmarkPresets.js` contains 26 named scenario configurations. Each preset specifies a map template, optional resource overrides, building counts, worker population delta, predator counts, and weather. The `applyPreset` function applies these modifications to a freshly created `GameState` after initial world generation.

There are five categories: **terrain**, **economy**, **pressure**, **stress**, and **infrastructure**.

### Terrain Category (3 presets)

These use the default starting conditions for three distinct map templates. They test whether the AI adapts its strategy to fundamentally different terrain layouts.

| ID | Label | Template | Notes |
|----|-------|----------|-------|
| `temperate_default` | Temperate Plains (default) | `temperate_plains` | Baseline open terrain; most balanced resource distribution |
| `fortified_default` | Fortified Basin (default) | `fortified_basin` | Enclosed geography; favors defensive build orders |
| `archipelago_default` | Archipelago Isles (default) | `archipelago_isles` | Water-fragmented map; tests bridge/connectivity decisions |

### Economy Category (7 presets)

These modify starting resources and building counts to stress the resource chain economy. They test whether the AI can bootstrap a processing chain from different initial states.

| ID | Label | Template | Food | Wood | Stone | Herbs | Key Buildings |
|----|-------|----------|------|------|-------|-------|---------------|
| `scarce_resources` | Scarce Resources | `temperate_plains` | 8 | 6 | — | — | Default |
| `abundant_resources` | Abundant Resources | `temperate_plains` | 120 | 100 | — | — | Default |
| `developed_colony` | Developed Colony | `fortified_basin` | 80 | 70 | 15 | 10 | 3 warehouses, 8 farms, 4 lumbers, 20 walls, kitchen, smithy, clinic |
| `resource_chains_basic` | Basic Resource Chains | `temperate_plains` | 60 | 50 | 15 | 10 | 2 warehouses, 4 farms, 3 lumbers, 1 quarry, 1 herb garden, 1 kitchen |
| `full_processing` | Full Processing Chain | `fortified_basin` | 80 | 60 | 25 | 15 | Full chain: kitchen, smithy, clinic; also 5 meals, 2 medicine, 1 tool pre-seeded |
| `scarce_advanced` | Scarce Advanced Resources | `temperate_plains` | 30 | 25 | 5 | 3 | 1 warehouse, 2 farms, 2 lumbers, 1 quarry, 1 herb garden |
| `tooled_colony` | Tooled Colony | `fortified_basin` | 80 | 70 | 10 | 6 | 2 warehouses, 5 farms, 3 lumbers, 1 smithy, 3 tools pre-seeded |

### Pressure Category (5 presets)

These stress population size, threat level, or weather. They test the AI's ability to keep a colony alive under hostile or overcrowded conditions.

| ID | Label | Template | Notable Modifiers |
|----|-------|----------|-------------------|
| `high_threat` | High Threat | `temperate_plains` | Threat set to 65; +3 extra predators |
| `large_colony` | Large Colony (20 workers) | `fortified_basin` | +8 extra workers (≈20 total); food 80, wood 60 |
| `skeleton_crew` | Skeleton Crew (3 workers) | `temperate_plains` | −9 workers (minimum 2 enforced); food 25, wood 20 |
| `wildlife_heavy` | Wildlife Heavy | `archipelago_isles` | +6 herbivores, +3 predators; tests ecology pressure |
| `storm_start` | Starting in Storm | `temperate_plains` | Weather set to `storm` for 30 seconds at tick 0 |

### Stress Category (5 presets)

These combine multiple adversarial conditions simultaneously. They represent the hardest class of scenarios: compound crises, isolation, population explosions, and siege states.

| ID | Label | Template | Notable Modifiers |
|----|-------|----------|-------------------|
| `crisis_compound` | Compound Crisis | `temperate_plains` | −8 workers, food 8, wood 6, storm 25s, +2 predators |
| `island_isolation` | Island Isolation | `archipelago_isles` | −6 workers, food 20, wood 15 |
| `population_boom` | Population Boom | `temperate_plains` | +8 workers with only food 30, wood 20 |
| `late_game_siege` | Late Game Siege | `fortified_basin` | Full developed colony + threat 80, +4 predators, storm 20s |
| `no_director` | No Director (Manual) | `temperate_plains` | `disableDirector: true`; tests baseline fallback planner only |

### Infrastructure Category (6 presets)

Added in v0.6.9. These test road network connectivity, worker distribution efficiency, and logistics coverage.

| ID | Label | Template | Roads | Notable |
|----|-------|----------|-------|---------|
| `road_connected` | Road-Connected Colony | `temperate_plains` | 15 | Well-connected; tests road speed bonus and throughput |
| `road_disconnected` | Disconnected Buildings | `temperate_plains` | 0 | Same resources/buildings as `road_connected` but no roads |
| `worker_crowded` | Worker Crowding (12 workers, 3 sites) | `temperate_plains` | — | +4 workers with only 3 building sites; tests occupancy-aware scoring |
| `worker_spread` | Worker Spread (8 workers, 12 sites) | `temperate_plains` | — | Many building sites for default worker count; tests spreading |
| `logistics_bottleneck` | Logistics Bottleneck | `fortified_basin` | 2 | Rich resources, many producers, only 1 warehouse and 2 roads |
| `mature_roads` | Mature Road Network | `temperate_plains` | 25 | Large road network with full processing chain; road wear test |

---

## Metrics Tracked

### Task Score (`computeTaskScore`)

Computed from a time-series of snapshots (food, wood, workers, prosperity, threat) and a config object. Returns six dimensions plus a composite.

| Metric | Formula | Weight in T_composite | Description |
|--------|---------|----------------------|-------------|
| `T_surv` | `survivalSec / maxSurvivalSec` | 0.20 | Fraction of target duration survived |
| `T_obj` | `completedObjectives / totalObjectives` (1.0 if no objectives) | 0.25 | Objective completion rate; scores 1.0 when the objective system is inactive (v0.8.0+) |
| `T_res` | `1 − (CV_food + CV_wood) / 2` | 0.15 | Resource stability; lower coefficient of variation = more stable |
| `T_pop` | `1 − deathsTotal / initialWorkers` | 0.15 | Population survival fraction |
| `T_pros` | `timeWeightedAverage(prosperity) / 100` | 0.15 | Time-weighted prosperity score |
| `T_threat` | `1 − timeWeightedAverage(threat) / 100` | 0.10 | Inverse of time-weighted threat |
| `T_composite` | Weighted sum of the above | — | `0.20·T_surv + 0.25·T_obj + 0.15·T_res + 0.15·T_pop + 0.15·T_pros + 0.10·T_threat` |

All metrics are clamped to [0, 1]. Time-weighted averages use trapezoidal integration over the sample time-series. `T_res` uses coefficient of variation so that a stable resource level near zero is not rewarded over a large but steady stock.

### Cost Metrics (`computeCostMetrics`)

Computed from a log of AI decisions, each tagged with `source` ("llm" or "fallback"), `tokens`, and `latencyMs`.

| Metric | Formula | Description |
|--------|---------|-------------|
| `C_tok` | `totalTokens / llmDecisions` | Average tokens per LLM call |
| `C_min` | `(totalTokens × costPerToken) / gameDurationMin` | Token cost per game-minute |
| `C_lat` | `avgLatencyMs / 20000` | Normalized latency (20 s = 1.0) |
| `C_fb` | `fallbackDecisions / totalDecisions` | Fallback rate (lower = more LLM coverage) |

### Decision Quality Metrics (`computeDecisionQuality`)

| Metric | Formula | Description |
|--------|---------|-------------|
| `D_hall` | `sum(clampedValues) / sum(totalValues)` | Hallucination rate — fraction of AI output values that required guardrail clamping |
| `D_adapt` | `crisisResponses / crisisEvents` (1.0 if no events) | Crisis adaptation rate |

### Infrastructure Score (`computeInfrastructureScore`)

Computed from time-series samples that include road and logistics telemetry fields.

| Metric | Formula | Weight in I_composite | Description |
|--------|---------|----------------------|-------------|
| `I_spread` | `mean(avgWorkerSpread)` | 0.30 | Average ratio of unique-targeted-tiles to alive-workers |
| `I_road` | `mean(1 − (components−1) / max(1, roadTiles/4))` | 0.25 | Road connectivity; single connected component = 1.0 |
| `I_logis` | `mean(connected / (connected + isolated))` | 0.25 | Fraction of production buildings reachable from a warehouse |
| `I_wear` | `mean(1 − avgRoadWear)` | 0.20 | Road health; 0 wear = 1.0 |
| `I_composite` | `0.30·I_spread + 0.25·I_road + 0.25·I_logis + 0.20·I_wear` | — | Weighted infrastructure composite |

### DevIndex (`DevIndexSystem`)

DevIndex is a live in-game metric distinct from the post-hoc benchmark scores above. It runs every simulation tick via `DevIndexSystem` (positioned after `ProgressionSystem` in `SYSTEM_ORDER`) and aggregates six colony dimensions into a 0–100 composite.

| Dimension | Measures | Weight |
|-----------|----------|--------|
| `population` | Alive agents vs `devIndexAgentTarget` (30) | 1/6 |
| `economy` | Weighted food/wood/stone vs `devIndexResourceTargets` | 1/6 |
| `infrastructure` | Road count and connectivity | 1/6 |
| `production` | Active producer buildings vs `devIndexProducerTarget` (24) | 1/6 |
| `defense` | Wall count + 2× militia vs `devIndexDefenseTarget` (12) | 1/6 |
| `resilience` | Inverse of mean worker hunger/fatigue | 1/6 |

`state.gameplay.devIndex` holds the instantaneous value; `state.gameplay.devIndexSmoothed` holds a ring-buffered arithmetic mean over the last `devIndexWindowTicks` (default 60) ticks. `RaidEscalatorSystem` reads `devIndexSmoothed` to scale raid intensity — raids escalate as DevIndex rises.

The day-365 DevIndex on the canonical `seed=42 / temperate_plains` run is the primary long-horizon benchmark gate.

---

## How to Run Benchmarks

### Entry Point

```
node src/benchmark/run.js [flags]
```

The script runs three sections in order unless `--only` is specified.

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

# Only capability probes, 5 seeds per probe, on fortified_basin
node src/benchmark/run.js --only=probes --seeds=5 --template=fortified_basin

# Stress test: 20 scenarios, 180 s each
node src/benchmark/run.js --only=scenarios --scenarios=20 --duration=180

# Run specific probes
node src/benchmark/run.js --only=probes --probes=RESOURCE_TRIAGE,ADAPTATION

# Crisis adaptation only
node src/benchmark/run.js --only=crisis --crisis-duration=600
```

### Unit Tests

```bash
# All benchmark tests (≈50 tests across 3 files)
node --test test/benchmark-metrics.test.js test/benchmark-presets.test.js test/benchmark-framework.test.js

# Full test suite
node --test test/*.test.js
```

### Output

Results are written to `results/benchmark-<timestamp>.json`. Console output uses the following format during a scenario stress test:

```
  ✓ temperate_default       D=0.12 T=0.847
  ✗ crisis_compound         D=0.89 T=0.213
```

Each symbol means: `✓` = colony survived (session phase never reached "end"/loss), `✗` = colony was eliminated. `D` is the computed difficulty score of the scenario and `T` is `T_composite`.

A summary by difficulty bin is printed after all scenarios complete:

```
  By difficulty bin:
    trivial    mean=0.821 CI=[0.712, 0.903] n=2
    easy       mean=0.764 CI=[0.641, 0.871] n=2
    medium     mean=0.703 CI=[0.582, 0.812] n=2
    hard       mean=0.611 CI=[0.488, 0.727] n=2
    extreme    mean=0.402 CI=[0.281, 0.532] n=2
```

---

## Scoring

### Pass/Fail Determination

Pass/fail for a named preset run is determined by two conditions:

1. `session.phase !== "end"` OR `session.outcome !== "loss"` — the colony reached the target duration without being eliminated.
2. Optionally: `T_composite ≥ threshold` for automated gate checks.

There is no single global pass threshold. Individual test contexts use the thresholds appropriate for their scenario difficulty. The canonical long-horizon gate uses:

- Day-365 DevIndex ≥ 70 (aspirational target, not yet reached)
- Current best-effort ceiling on `seed=42 / temperate_plains`: DevIndex ≈ 44 (v0.8.1)

### Bayesian Scoring

When running multiple seeds, `bayesianScore(scores)` is used instead of a simple average. It places a Beta(2, 2) weakly informative prior over the [0, 1] score distribution and returns:

- `mean` — posterior mean
- `std` — posterior standard deviation
- `ci95` — 95% credible interval [p2.5, p97.5]
- `median`, `p5`, `p95`

This prevents small sample sizes from producing overconfident pass/fail conclusions.

### Consistency Adjustment

For a set of scores across multiple scenarios, `consistencyAdjustedScore(scores, lambda=0.5)` applies a variance penalty:

```
finalScore = mean − 0.5 × std
```

A strategy that scores 0.80 consistently ranks higher than one that alternates between 0.95 and 0.65 (same mean but penalized for variance).

### Relative Scoring

`relativeScore(agentScore, baselineScore, ceilingScore)` normalizes an agent's score between a baseline (random/fallback-only policy) and a ceiling (greedy oracle):

```
relativeScore = clamp((agent − baseline) / (ceiling − baseline), 0, 1)
```

### Group Comparison

`compareGroups(treatment, control)` computes Cohen's d effect size and a BIC-approximated Bayes Factor (BF10) to classify the comparison:

| Verdict | Condition |
|---------|-----------|
| `CONFIRMED_IMPROVEMENT` | BF10 > 10 and |d| > 0.5 |
| `LIKELY_IMPROVEMENT` | BF10 > 3 and |d| > 0.3 |
| `NO_EFFECT` | BF10 < 1/3 |
| `AMBIGUOUS` | all other cases |

### Difficulty Bins

Randomized scenarios in the stress test are stratified into five bins:

| Bin | Difficulty Range | Weights |
|-----|-----------------|---------|
| trivial | [0.00, 0.15) | scarcity 35%, threat 25%, pop stress 20%, weather 20% |
| easy | [0.15, 0.30) | — |
| medium | [0.30, 0.45) | — |
| hard | [0.45, 0.65) | — |
| extreme | [0.65, 1.00] | — |

Difficulty is computed by `computeDifficulty(scenario)`:

```
difficulty = 0.35 × scarcity + 0.25 × threatNorm + 0.20 × populationStress + 0.20 × weatherPenalty
```

Where `scarcity = 1 − min(1, avgResources / 80)` and `weatherPenalty` is 0.3 for storm, 0.2 for drought, 0.0 for clear.

---

## Capability Probes

Six behavioral probes in `ProbeCollector.js` each test a single irreducible AI capability. Probes use `SimHarness` with `aiEnabled: true` and return a continuous [0, 1] score.

| Probe ID | Tests | Score Formula |
|----------|-------|---------------|
| `RESOURCE_TRIAGE` | When food is critically low (food=3), does AI assign ≥50% of workers to food roles within 30 s? | `min(1, foodWorkerRatio / 0.5)` |
| `THREAT_RESPONSE` | After 3 predators are injected at t=60s, does AI start building walls within 60 s? | `1 − latencySec / 60` |
| `BOTTLENECK_ID` | With 8 farms and 0 warehouses, does AI build a warehouse within 60 s? | Binary: 1 if warehouse built, 0 otherwise |
| `PLAN_COHERENCE` | Does AI maintain the same strategic goal across 5 samples at 20-second intervals? | `1 − switchRate` |
| `ADAPTATION` | After a combined resource crash (20% food) + storm at t=60s, does AI recover to 80% of baseline food+wood within 120 s? | `1 − recoverySec / 120` |
| `SCALING` | Does resource-per-worker at 25 workers stay ≥50% of efficiency at 5 workers? | `min(1, eff25 / eff5 / 0.5)` |

---

## Crisis Injection

The `CrisisInjector` waits for the AI to reach a steady state (defined as N ticks without a role-assignment change), then injects crises one at a time and measures three scores:

| Score | Formula | Description |
|-------|---------|-------------|
| `detectionScore` | `max(0, 1 − detectionLag / 100)` | Ticks until perceiver reflects the threat; 0–3 ticks = 1.0 |
| `recoveryScore` | `max(0, 1 − recoveryTicks / 300)` | Ticks until colony health recovers to 80% of baseline |
| `resilienceScore` | `max(0, 1 − dropRatio)` | How much health dropped; smaller drop = better |
| `composite` | `0.30·detection + 0.30·recovery + 0.40·resilience` | Weighted crisis response score |

Four crisis types are available:

| Type | What it does |
|------|-------------|
| `drought` | Sets weather to `drought` for 60 s |
| `predator_surge` | Adds 3 predators near workers; raises threat by 30 |
| `resource_crash` | Reduces food and wood to 10% of current levels |
| `epidemic` | Sets herbs to 0; reduces all worker hunger by 0.3 |

---

## Version History of Benchmark Results

All results use the canonical run: `seed=42 / temperate_plains / day-365`.

| Version | DevIndex (day 365) | Deaths | Notes |
|---------|--------------------|--------|-------|
| v0.8.0 Phase 7 baseline | 39.03 | 512 | Pre-Phase 8; food=0, wood=0.67 at day 365 |
| v0.8.1 (Phase 8 hardening) | 43.69 (+4.66, +12%) | 454 (−58, −11%) | yieldPool lazy-init fix, kitchen tier in fallback planner, salinization 0.02→0.012, fog radius 4→6, FOOD_COST 6→10 |
| Target | 70 | — | Day-365 survival hardening goal; gap traced to carry/deposit policy (workers eat from carry, bypassing warehouse) |

The v0.8.0 day-365 run prior to Phase 7 param tuning showed DevIndex 36.27; Phase 7 parameter tuning brought it to 39.03. The current best-effort ceiling of ~44 is set by Phase 8. Closing the remaining gap to 70 requires structural changes to the carry/deposit policy, punted to Phase 9.

Long-horizon test duration is 730 simulated days (≈ 2 years at the game's time scale). The 365-day checkpoint is the primary regression gate. A 548-day exemption clause in the threshold gates waives the DevIndex monotonicity rule when the run enters a "DevIndex OR plateau" state.

Earlier benchmark baselines from v0.8.0 iterative runs (Rounds 1–4 of the Phase 7 param sweep) consistently returned DevIndex in the 37.7–37.8 band with deaths around 157 at the 90-day mark, confirming stability of the parameterization in the short-horizon window.
