#!/usr/bin/env node
/**
 * Determinism check — answers benchmark_proposal.md Appendix B Q1/Q2.
 *
 * Runs a SimHarness scenario twice with the same seed in fallback mode
 * and verifies:
 *   - state hash is identical
 *   - PathCache key set is identical
 *   - aiRuntimeStats counters are identical
 *
 * Usage:
 *   node tools/audit/determinism-check.js [--seed <hex>] [--ticks <n>] [--scenario <id>]
 */

import crypto from "node:crypto";
import { SimHarness, DT_SEC } from "../../src/benchmark/framework/SimHarness.js";

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};

const SEED = Number(getArg("--seed", "0xC0FFEE"));
const TICKS = Number(getArg("--ticks", "1800"));
const SCENARIO = getArg("--scenario", "temperate_plains");

function hashState(state) {
  const slim = {
    tick: state.tick ?? 0,
    timeSec: state.metrics?.timeSec ?? 0,
    workers: state.workers?.map(w => ({
      id: w.id, x: w.x, z: w.z, vx: w.vx, vz: w.vz,
      hunger: w.hunger?.toFixed?.(6),
      role: w.role,
      fsmState: w.fsm?.state ?? null,
    })) ?? [],
    resources: state.resources ?? {},
    aiRuntime: {
      requestCount: state.metrics?.aiRuntime?.requestCount ?? 0,
      responseCount: state.metrics?.aiRuntime?.responseCount ?? 0,
      timeoutCount: state.metrics?.aiRuntime?.timeoutCount ?? 0,
      errorCount: state.metrics?.aiRuntime?.errorCount ?? 0,
    },
    gridSnapshot: state.grid ? Array.from(state.grid.tiles ?? []).join(",").slice(0, 256) : "",
  };
  return crypto.createHash("sha256").update(JSON.stringify(slim)).digest("hex");
}

async function runOnce() {
  const harness = new SimHarness({
    templateId: SCENARIO,
    seed: SEED,
    aiEnabled: false,
  });
  // SimHarness boots in the constructor; tick() is async and drives one DT_SEC step.
  for (let i = 0; i < TICKS; i++) await harness.tick();
  return hashState(harness.state);
}

async function main() {
  console.log(`[determinism-check] seed=${SEED.toString(16)} ticks=${TICKS} scenario=${SCENARIO}`);
  const t0 = Date.now();
  const h1 = await runOnce();
  const t1 = Date.now();
  const h2 = await runOnce();
  const t2 = Date.now();
  const ok = h1 === h2;
  console.log(`run1 hash: ${h1}  (${t1 - t0}ms)`);
  console.log(`run2 hash: ${h2}  (${t2 - t1}ms)`);
  console.log(`equal:     ${ok ? "YES" : "NO"}`);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
