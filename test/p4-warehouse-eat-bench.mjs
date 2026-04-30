// P4 — at-warehouse fast-eat benchmark.
// Measures colony health across 4 map templates after v0.10.1-h (P4) fix.
// Run: node test/p4-warehouse-eat-bench.mjs
//
// Reports per scenario for 30 sim-days:
//   deaths | alive | avgFood | minFood | avgHunger | eat%state | prod%state

import { SimHarness, DT_SEC } from "../src/benchmark/framework/SimHarness.js";
import { BALANCE } from "../src/config/balance.js";

const DAY_SEC = 90;
const SIM_DAYS = 30;
const TARGET_SEC = SIM_DAYS * DAY_SEC;

const PRODUCTIVE = new Set([
  "HARVESTING", "DELIVERING", "DEPOSITING", "SEEKING_HARVEST",
  "BUILDING", "SEEKING_BUILD", "PROCESSING", "SEEKING_PROCESS",
]);
const EATING_STATES = new Set(["EATING", "SEEKING_FOOD"]);

async function run(label, opts) {
  const h = new SimHarness({ ...opts, aiEnabled: false });
  const initialDeaths = Number(h.state.metrics?.deathsTotal ?? 0);

  let foodSamples = [];
  let hungerSum = 0, hungerCount = 0;
  let eatTicks = 0, prodTicks = 0, totalTicks = 0;
  let sampleCount = 0;

  // Sample every 10 s of sim time
  const SAMPLE_INTERVAL = Math.round(10 / DT_SEC);

  await h.advanceTicks(Math.round(TARGET_SEC / DT_SEC), (state, t) => {
    if (t % SAMPLE_INTERVAL === 0) {
      foodSamples.push(Number(state.resources?.food ?? 0));
      sampleCount++;
    }
    const ws = state.agents.filter(a => a.type === "WORKER" && a.alive !== false);
    for (const w of ws) {
      const s = w.fsm?.state ?? "IDLE";
      totalTicks++;
      if (EATING_STATES.has(s)) eatTicks++;
      if (PRODUCTIVE.has(s)) prodTicks++;
      hungerSum += Number(w.hunger ?? 0);
      hungerCount++;
    }
  });

  const deaths = Number(h.state.metrics?.deathsTotal ?? 0) - initialDeaths;
  const alive = h.aliveWorkers.length;
  const avgFood = foodSamples.length > 0
    ? (foodSamples.reduce((a, b) => a + b, 0) / foodSamples.length).toFixed(1) : "?";
  const minFood = foodSamples.length > 0 ? Math.min(...foodSamples).toFixed(1) : "?";
  const avgHunger = hungerCount > 0 ? (hungerSum / hungerCount).toFixed(3) : "?";
  const eatPct = totalTicks > 0 ? ((eatTicks / totalTicks) * 100).toFixed(1) : "?";
  const prodPct = totalTicks > 0 ? ((prodTicks / totalTicks) * 100).toFixed(1) : "?";

  return { label, deaths, alive, avgFood, minFood, avgHunger, eatPct, prodPct };
}

const SCENARIOS = [
  { label: "temperate    ", opts: { templateId: "temperate_plains", seed: 1337 } },
  { label: "highlands    ", opts: { templateId: "rugged_highlands", seed: 42 } },
  { label: "archipelago  ", opts: { templateId: "archipelago_isles", seed: 777 } },
  { label: "riverlands   ", opts: { templateId: "fertile_riverlands", seed: 2024 } },
  { label: "coastal      ", opts: { templateId: "coastal_ocean", seed: 999 } },
  { label: "fortified    ", opts: { templateId: "fortified_basin", seed: 2025 } },
];

const eatRate = Number(BALANCE?.warehouseEatRatePerWorkerPerSecond ?? 0.60);
console.log(`P4 warehouse-eat benchmark  [${SIM_DAYS}-day runs, cap=4 food/s, rate=${eatRate}/worker/s]`);
console.log("─".repeat(90));
console.log(
  "scenario       " +
  "deaths  alive  " +
  "avgFood  minFood  " +
  "avgHngr  " +
  "eat%   prod%"
);
console.log("─".repeat(90));

for (const s of SCENARIOS) {
  try {
    const r = await run(s.label, s.opts);
    console.log(
      r.label +
      String(r.deaths).padEnd(8) +
      String(r.alive).padEnd(7) +
      r.avgFood.padEnd(9) +
      r.minFood.padEnd(9) +
      r.avgHunger.padEnd(9) +
      r.eatPct.padEnd(7) +
      r.prodPct
    );
  } catch (e) {
    console.error(`${s.label}  ERROR: ${e.message}`);
    console.error(e.stack?.split("\n").slice(0, 3).join("\n"));
  }
}
console.log("─".repeat(90));
console.log("Criteria: deaths≤2/scenario, prod%≥55, eatPct≤25, avgFood stable");
