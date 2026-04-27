#!/usr/bin/env node
/**
 * Stall-fix verification: confirm plansCompleted >= 1 within 180s wallclock
 * (timeScale=8) against an already-running vite preview at localhost:19090.
 *
 * Pass:  state.ai.agentDirector.stats.plansCompleted >= 1
 * Fail:  plansFailed >= 8 with plansCompleted == 0, or 180s timeout.
 *
 * Reuses the user's running preview/proxy — does NOT spawn its own.
 */
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.PROBE_BASE_URL ?? "http://localhost:19090";
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 180000);
const POLL_MS = 5000;

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

    // Configure + start fresh run with aiMode=llm
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

    const t0 = Date.now();
    let lastSnap = null;
    while (Date.now() - t0 < TIMEOUT_MS) {
      lastSnap = await page.evaluate(() => {
        const s = window.__utopia?.state;
        const ad = s?.ai?.agentDirector;
        return {
          simT: s?.metrics?.timeSec ?? 0,
          mode: ad?.mode ?? null,
          activeSrc: ad?.activePlan?.source ?? null,
          stats: ad?.stats ? { ...ad.stats } : null,
          historyLen: Array.isArray(ad?.planHistory) ? ad.planHistory.length : 0,
          lastFailReason: Array.isArray(ad?.planHistory) && ad.planHistory.length
            ? ad.planHistory[ad.planHistory.length - 1].failReason ?? null
            : null,
          resources: s?.resources ? { ...s.resources } : null,
        };
      });
      const stats = lastSnap.stats ?? {};
      const completed = Number(stats.plansCompleted ?? 0);
      const failed = Number(stats.plansFailed ?? 0);
      console.log(`[stall-verify] t=${(Date.now() - t0) / 1000}s simT=${lastSnap.simT?.toFixed?.(1)} gen=${stats.plansGenerated ?? 0} done=${completed} failed=${failed} llmFail=${stats.llmFailures ?? 0} active=${lastSnap.activeSrc ?? "-"} lastFail=${lastSnap.lastFailReason ?? "-"}`);
      if (completed >= 1) {
        console.log("[stall-verify] PASS — plan completed");
        console.log(JSON.stringify(lastSnap, null, 2));
        exit = 0;
        return;
      }
      if (failed >= 8 && completed === 0) {
        console.log("[stall-verify] FAIL — 8+ failures, 0 completed (stall fix not effective)");
        console.log(JSON.stringify(lastSnap, null, 2));
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    console.log("[stall-verify] FAIL — timeout");
    console.log(JSON.stringify(lastSnap, null, 2));
  } catch (err) {
    console.error("[stall-verify] ERROR:", err?.stack ?? err?.message ?? err);
  } finally {
    await browser.close().catch(() => {});
    process.exit(exit);
  }
}
main();
