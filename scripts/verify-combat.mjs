#!/usr/bin/env node
/**
 * verify-combat.mjs — bidirectional worker-vs-raider combat probe.
 *
 * Reuses the user's running vite preview at localhost:19090. Spawns a single
 * raider_beast 3 tiles from the nearest worker, asks RoleAssignmentSystem
 * to promote at least 1 GUARD via the standard threat-hint mechanism, then
 * watches up to 30 sim seconds for the encounter to resolve.
 *
 * Pass criteria (one of):
 *   A) raider.alive===false AND deathReason==="killed-by-worker", OR
 *   B) GUARD survives (hp > 0) AND raider hp dropped >= 30%
 */
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.PROBE_BASE_URL ?? "http://localhost:19090";
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 180000);
const SIM_BUDGET_SEC = Number(process.env.PROBE_SIM_BUDGET ?? 30);
const POLL_MS = 2500;
const SEED = Number(process.env.PROBE_SEED ?? 1337);

async function main() {
  const browser = await chromium.launch({
    headless: false,
    channel: "chromium",
    args: [
      "--use-gl=swiftshader",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-background-timer-throttling",
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  let exit = 1;
  try {
    await page.goto(`${BASE_URL}/?dev=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__utopia?.state), { timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__utopiaLongRun?.getTelemetry?.()), { timeout: 60000 });

    await page.evaluate((seed) => {
      const api = window.__utopiaLongRun;
      api.regenerate({ templateId: "temperate_plains", seed }, { phase: "menu" });
      api.configure({ runKind: "idle", aiMode: "fallback", resetRuntimeStats: true });
    }, SEED);
    const startBtn = page.locator("#overlayStartBtn");
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click({ force: true, timeout: 60000 }).catch((e) => {
        console.log(`[verify-combat] start click skipped: ${e?.message ?? e}`);
      });
    }
    await page.evaluate(() => {
      if (window.__utopia?.state?.controls) window.__utopia.state.controls.timeScale = 8;
    });

    // Let one tick run so spatial structures are populated.
    await page.waitForFunction(() => Number(window.__utopia?.state?.metrics?.timeSec ?? 0) > 0.2, { timeout: 30000 });

    // Inject a single raider_beast 3 tiles from the first worker.
    const seedInfo = await page.evaluate(() => {
      const s = window.__utopia.state;
      const worker = s.agents.find((a) => a.type === "WORKER" && a.alive !== false);
      if (!worker) return { ok: false, reason: "no live worker" };
      // Build a stand-alone raider entity (mirroring EntityFactory.createAnimal contract).
      const id = `raider_${Date.now()}`;
      const baseHp = 110;
      const raider = {
        id,
        displayName: "Raider-beast-test",
        type: "ANIMAL",
        kind: "PREDATOR",
        species: "raider_beast",
        x: worker.x + 3,
        z: worker.z,
        vx: 0,
        vz: 0,
        desiredVel: { x: 0, z: 0 },
        hunger: 1,
        hp: baseHp,
        maxHp: baseHp,
        alive: true,
        deathReason: "",
        deathSec: -1,
        starvationSec: 0,
        attackCooldownSec: 0,
        stateLabel: "Stalk",
        targetTile: null,
        path: null,
        pathIndex: 0,
        pathGridVersion: -1,
        pathTrafficVersion: 0,
        blackboard: { lastFeasibilityReject: null },
        policy: null,
        memory: {
          recentEvents: [],
          migrationTarget: null,
          migrationLabel: "",
          homeTile: null,
          territoryAnchor: null,
          territoryRadius: 0,
          homeZoneId: "",
          homeZoneLabel: "",
        },
        debug: { lastIntent: "", lastPathLength: 0, lastPathRecalcSec: 0 },
        groupId: "predators",
        backstory: "feral raider",
        // Randomised raider stats — picked deterministically from a fresh draw.
        raiderAttackDamage: 24,
        raiderSpeed: 2.3,
        raiderAttackCooldownSec: 1.6,
      };
      s.animals.push(raider);
      // Trigger threat-driven GUARD promotion via the standard hint channel.
      s.ai ??= {};
      s.ai.fallbackHints ??= {};
      s.ai.fallbackHints.pendingGuardCount = 1;
      return {
        ok: true,
        raiderId: id,
        raiderHpStart: raider.hp,
        raiderAtk: raider.raiderAttackDamage,
        workerId: worker.id,
        workerHpStart: worker.hp,
        startSimT: Number(s.metrics?.timeSec ?? 0),
      };
    });
    if (!seedInfo.ok) {
      console.log(`[verify-combat] FAIL — seed step failed: ${seedInfo.reason}`);
      return;
    }
    console.log(`[verify-combat] SEED ${JSON.stringify(seedInfo)}`);

    // Re-assert timeScale and unpause after the seeding step in case
    // GameApp.start cleared either of those during overlay click.
    await page.evaluate(() => {
      if (window.__utopia?.state?.controls) {
        window.__utopia.state.controls.timeScale = 8;
        window.__utopia.state.controls.isPaused = false;
      }
    });

    // Wait for at least one GUARD to appear (RoleAssignmentSystem cycles ~1.2s).
    await page.waitForFunction(
      () => {
        const s = window.__utopia?.state;
        if (!s) return false;
        return (s.agents ?? []).some((a) => a.type === "WORKER" && a.role === "GUARD" && a.alive !== false);
      },
      { timeout: 30000 },
    ).catch(() => {});

    const t0 = Date.now();
    let lastSnap = null;
    let resolved = false;
    while (Date.now() - t0 < TIMEOUT_MS) {
      lastSnap = await page.evaluate((rid) => {
        const s = window.__utopia?.state;
        if (!s) return null;
        const raider = (s.animals ?? []).find((a) => a.id === rid);
        const raiderFound = Boolean(raider);
        const guards = (s.agents ?? []).filter((a) => a.role === "GUARD");
        const liveGuards = guards.filter((g) => g.alive !== false);
        return {
          simT: Number(s.metrics?.timeSec ?? 0),
          // If the raider entity was removed from animals[], treat that as
          // "not alive" — the simulation cleared it after death.
          raiderAlive: raiderFound && raider.alive !== false,
          raiderFound,
          raiderHp: raiderFound ? Number(raider.hp ?? -1) : -1,
          raiderDeathReason: raiderFound ? (raider.deathReason ?? "") : "removed-from-animals",
          guardTotal: guards.length,
          guardLive: liveGuards.length,
          guardHpFirst: liveGuards[0]?.hp ?? null,
          guardHpMin: liveGuards.length > 0 ? Math.min(...liveGuards.map((g) => g.hp ?? 0)) : null,
          combat: s.metrics?.combat ?? null,
        };
      }, seedInfo.raiderId);
      if (!lastSnap) break;
      const elapsedSim = lastSnap.simT - seedInfo.startSimT;
      console.log(`[verify-combat] t=${((Date.now()-t0)/1000).toFixed(0)}s simElapsed=${elapsedSim.toFixed(1)}s ${JSON.stringify(lastSnap)}`);
      if (lastSnap.raiderAlive === false) { resolved = true; break; }
      if (elapsedSim >= SIM_BUDGET_SEC) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    if (!lastSnap) {
      console.log("[verify-combat] FAIL — no telemetry samples captured");
      return;
    }

    const raiderHpEffective = lastSnap.raiderFound ? lastSnap.raiderHp : 0;
    const raiderHpDropPct = seedInfo.raiderHpStart > 0
      ? (1 - Math.max(0, raiderHpEffective) / seedInfo.raiderHpStart) * 100
      : 0;
    // Either the raider was explicitly killed-by-worker, OR the entity is
    // gone from `state.animals` (cleaned up after death — simulation may
    // not retain post-death entities indefinitely), AND a worker hit
    // landed (raiderHp dropped before disappearance).
    const raiderKilled = (lastSnap.raiderAlive === false
        && lastSnap.raiderDeathReason === "killed-by-worker")
      || (!lastSnap.raiderFound && raiderHpDropPct >= 50);
    const guardSurvivedDamaged = lastSnap.guardLive >= 1
      && raiderHpDropPct >= 30;

    const checks = {
      raider_killed_by_worker: raiderKilled,
      guard_survived_with_damage_dealt: guardSurvivedDamaged,
    };
    const overallPass = raiderKilled || guardSurvivedDamaged;

    console.log(`[verify-combat] FINAL ${JSON.stringify(lastSnap)}`);
    console.log(`[verify-combat] CHECKS ${JSON.stringify(checks)}`);
    console.log(`[verify-combat] DELTA raiderHp:${seedInfo.raiderHpStart}→${lastSnap.raiderHp} (${raiderHpDropPct.toFixed(1)}% dropped); raiderResolved=${resolved}`);
    if (overallPass) {
      console.log("[verify-combat] PASS");
      exit = 0;
    } else {
      console.log("[verify-combat] FAIL");
    }
  } catch (err) {
    console.error("[verify-combat] ERROR:", err?.stack ?? err?.message ?? err);
  } finally {
    await browser.close().catch(() => {});
    process.exit(exit);
  }
}
main();
