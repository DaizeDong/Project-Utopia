#!/usr/bin/env node
/**
 * verify-roads.mjs — pathfinding-driven road planning probe.
 *
 * Reuses the user's running vite preview at localhost:19090. Drives a fresh
 * sim run at timeScale=8 for ~240s wallclock (~32 sim minutes) and samples
 * logistics + plan telemetry every 10s. Reports a JSON line per sample plus
 * a final pass/fail verdict.
 *
 * Pass criteria (all must hold):
 *   1. final.isolatedWorksites <= initial.isolatedWorksites && final.isolatedWorksites <= 1
 *   2. final.roads > initial.roads
 *   3. final.plansCompleted >= 1
 *   4. At least one entry in agentDirector.planHistory whose goal mentions
 *      road/connect/logistics OR whose plan steps included `type: "road"`
 *      (we cannot directly inspect step-list post-completion in history; the
 *      goal-string is the proxy).
 */
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.PROBE_BASE_URL ?? "http://localhost:19090";
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 240000);
const POLL_MS = 10000;

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

    await page.evaluate(() => {
      const api = window.__utopiaLongRun;
      api.regenerate({ templateId: "temperate_plains", seed: 1337 }, { phase: "menu" });
      api.configure({ runKind: "idle", aiMode: "llm", resetRuntimeStats: true });
    });
    const startBtn = page.locator("#overlayStartBtn");
    if (await startBtn.isVisible().catch(() => false)) await startBtn.click();
    await page.evaluate(() => {
      if (window.__utopia?.state?.controls) window.__utopia.state.controls.timeScale = 8;
    });

    // Snapshot initial values once the sim has produced a logistics block.
    await page.waitForFunction(
      () => Boolean(window.__utopia?.state?.metrics?.logistics),
      { timeout: 60000 },
    );
    const initial = await page.evaluate(() => {
      const s = window.__utopia.state;
      const ad = s.ai?.agentDirector;
      return {
        simT: s.metrics?.timeSec ?? 0,
        isolatedWorksites: s.metrics?.logistics?.isolatedWorksites ?? 0,
        strandedCarryWorkers: s.metrics?.logistics?.strandedCarryWorkers ?? 0,
        roads: s.buildings?.roads ?? 0,
        plansCompleted: ad?.stats?.plansCompleted ?? 0,
      };
    });
    console.log(`[verify-roads] INITIAL ${JSON.stringify(initial)}`);

    const t0 = Date.now();
    let lastSnap = null;
    while (Date.now() - t0 < TIMEOUT_MS) {
      lastSnap = await page.evaluate(() => {
        const s = window.__utopia?.state;
        const ad = s?.ai?.agentDirector;
        const history = Array.isArray(ad?.planHistory) ? ad.planHistory : [];
        const roadyHistory = history.filter((h) =>
          typeof h.goal === "string" && /road|connect|logistic|isolated/i.test(h.goal)
        );
        return {
          simT: s?.metrics?.timeSec ?? 0,
          isolatedWorksites: s?.metrics?.logistics?.isolatedWorksites ?? 0,
          strandedCarryWorkers: s?.metrics?.logistics?.strandedCarryWorkers ?? 0,
          stretchedWorksites: s?.metrics?.logistics?.stretchedWorksites ?? 0,
          roads: s?.buildings?.roads ?? 0,
          farms: s?.buildings?.farms ?? 0,
          warehouses: s?.buildings?.warehouses ?? 0,
          plansGenerated: ad?.stats?.plansGenerated ?? 0,
          plansCompleted: ad?.stats?.plansCompleted ?? 0,
          plansFailed: ad?.stats?.plansFailed ?? 0,
          historyLen: history.length,
          roadyHistory: roadyHistory.map((h) => ({ goal: h.goal, success: h.success })),
          activeGoal: ad?.activePlan?.goal ?? null,
        };
      });
      console.log(`[verify-roads] t=${((Date.now()-t0)/1000).toFixed(0)}s ${JSON.stringify(lastSnap)}`);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    if (!lastSnap) {
      console.log("[verify-roads] FAIL — no telemetry samples captured");
      return;
    }

    const checks = {
      isolated_decreased_or_low:
        lastSnap.isolatedWorksites <= initial.isolatedWorksites && lastSnap.isolatedWorksites <= 1,
      roads_increased: lastSnap.roads > initial.roads,
      plans_completed: lastSnap.plansCompleted >= 1,
      logistics_plan_in_history: lastSnap.roadyHistory.length >= 1,
    };
    const allOk = Object.values(checks).every(Boolean);
    console.log(`[verify-roads] FINAL ${JSON.stringify(lastSnap)}`);
    console.log(`[verify-roads] CHECKS ${JSON.stringify(checks)}`);
    console.log(`[verify-roads] INITIAL→FINAL isolated:${initial.isolatedWorksites}→${lastSnap.isolatedWorksites} stranded:${initial.strandedCarryWorkers}→${lastSnap.strandedCarryWorkers} roads:${initial.roads}→${lastSnap.roads} plansCompleted:${initial.plansCompleted}→${lastSnap.plansCompleted}`);
    if (allOk) {
      console.log("[verify-roads] PASS");
      exit = 0;
    } else {
      console.log("[verify-roads] FAIL");
    }
  } catch (err) {
    console.error("[verify-roads] ERROR:", err?.stack ?? err?.message ?? err);
  } finally {
    await browser.close().catch(() => {});
    process.exit(exit);
  }
}
main();
