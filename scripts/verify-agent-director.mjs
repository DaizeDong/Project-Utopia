#!/usr/bin/env node
/**
 * Phase C verification probe — confirms AgentDirectorSystem produces a
 * non-fallback (source === "llm") activePlan when Autopilot is ON.
 *
 * Boots `npm run preview:full` (Vite preview + ai-proxy together), launches a
 * Playwright Chromium page with `?dev=1` so `window.__utopia.state` is
 * available, configures the long-run scenario in `aiMode=llm`, starts the
 * run, and polls the live state for `state.ai.agentDirector.activePlan.source`.
 *
 * Exits 0 if the LLM plan was observed; non-zero on timeout or boot failure.
 *
 * Usage: `node scripts/verify-agent-director.mjs [--timeout=120000]`
 */

import process from "node:process";

import { chromium } from "playwright";

import {
  startPreviewSession,
  closeHarnessPage,
  configureScenario,
  clickStartRun,
  parseArgs,
  toNumber,
} from "./long-run-support.mjs";
import { loadEnvIntoProcess } from "./env-loader.mjs";

/**
 * Custom launcher that uses the full Chromium build (not headless-shell) and
 * forces software WebGL via SwiftShader so the app's Three.js renderer can
 * boot in this CI/sandbox environment. The default `launchHarnessPage` uses
 * the lightweight headless shell which lacks a working WebGL impl here.
 */
async function launchHarnessPageWithWebGL(baseUrl) {
  // Use the full Chromium build (channel: "chromium") in headed mode so a
  // real WebGL/ANGLE pipeline is available. Callers should run this script
  // under xvfb-run so an X display exists. Falls back gracefully if DISPLAY
  // is already set (e.g. when run from a desktop session).
  const browser = await chromium.launch({
    headless: false,
    channel: "chromium",
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,BackForwardCache",
      "--use-gl=swiftshader",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.bringToFront().catch(() => {});
  await page.waitForFunction(() => Boolean(window.__utopiaLongRun || window.__utopiaBootError), undefined, {
    timeout: 60000,
  });
  const bootError = await page.evaluate(() => String(window.__utopiaBootError ?? ""));
  if (bootError) {
    await browser.close();
    throw new Error(`App boot failed: ${bootError}`);
  }
  await page.waitForFunction(() => Boolean(window.__utopiaLongRun?.getTelemetry?.()), undefined, {
    timeout: 60000,
  });
  return { browser, context, page };
}

const args = parseArgs(process.argv.slice(2));
const PLAN_TIMEOUT_MS = toNumber(args.timeout, 60000);
const TEMPLATE = String(args.templateId ?? "temperate_plains");
const SEED = toNumber(args.seed, 1337);

async function probeAgentDirector(page, timeoutMs) {
  // Two acceptance paths:
  //   (a) state.ai.agentDirector.activePlan.source === "llm" (live), OR
  //   (b) state.ai.colonyDirector.lastBuildSource === "llm" (a step from an
  //       LLM-sourced plan has executed, even if the plan has since cleared).
  // Both prove the LLM path is live and producing real plans, not just
  // algorithmic fallback.
  const handle = await page.waitForFunction(
    () => {
      const state = window.__utopia?.state;
      if (!state) return false;
      const ad = state.ai?.agentDirector;
      const livePlanSource = ad?.activePlan?.source ?? null;
      const lastBuildSource = state.ai?.colonyDirector?.lastBuildSource ?? null;
      if (livePlanSource === "llm" || lastBuildSource === "llm") {
        return { livePlanSource, lastBuildSource };
      }
      return false;
    },
    undefined,
    { timeout: timeoutMs, polling: 500 }
  );
  await handle.dispose();
}

async function snapshotState(page) {
  return page.evaluate(() => {
    const state = window.__utopia?.state ?? null;
    if (!state) return { available: false };
    const ad = state.ai?.agentDirector ?? null;
    return {
      available: true,
      simTimeSec: state.metrics?.timeSec ?? 0,
      tick: state.metrics?.tick ?? 0,
      coverageTarget: state.ai?.coverageTarget ?? null,
      aiEnabled: Boolean(state.ai?.enabled),
      agentDirector: ad
        ? {
            mode: ad.mode,
            activePlan: ad.activePlan ? { ...ad.activePlan } : null,
            stats: ad.stats ? { ...ad.stats } : null,
            planHistoryLen: Array.isArray(ad.planHistory) ? ad.planHistory.length : 0,
          }
        : null,
      colonyDirectorLastBuildSource: state.ai?.colonyDirector?.lastBuildSource ?? null,
    };
  });
}

async function main() {
  loadEnvIntoProcess();
  if (!String(process.env.OPENAI_API_KEY ?? "").trim()) {
    console.error("[verify:agent-director] FAIL — OPENAI_API_KEY missing in environment.");
    process.exit(1);
  }

  console.log("[verify:agent-director] starting preview:full (proxy + vite preview)…");
  const session = await startPreviewSession();
  let harness = null;
  let exitCode = 1;

  try {
    const baseUrl = `${session.baseUrl}/?dev=1`;
    console.log(`[verify:agent-director] launching harness page ${baseUrl}`);
    harness = await launchHarnessPageWithWebGL(baseUrl);

    // Forward page console errors/warnings so an LLM proxy or planner failure
    // surfaces in the script log instead of being swallowed.
    harness.page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error" || t === "warning") {
        console.log(`[page:${t}] ${msg.text()}`);
      }
    });
    harness.page.on("pageerror", (err) => {
      console.log(`[page:pageerror] ${String(err?.message ?? err)}`);
    });

    console.log(`[verify:agent-director] configuring scenario template=${TEMPLATE} seed=${SEED} aiMode=llm`);
    await configureScenario(harness.page, {
      templateId: TEMPLATE,
      seed: SEED,
      runKind: "idle",
      aiMode: "llm",
      resetRuntimeStats: true,
    });

    console.log("[verify:agent-director] clicking Start Run…");
    await clickStartRun(harness.page);

    // Bump the in-game time scale so we don't have to wait wallclock-real-time
    // for the perceiver/planner cadence (PLAN_INTERVAL_SEC=2 simulated).
    await harness.page.evaluate(() => {
      const app = window.__utopia;
      if (app && typeof app.setTimeScale === "function") {
        app.setTimeScale(8);
      } else if (window.__utopia?.state?.controls) {
        window.__utopia.state.controls.timeScale = 8;
      }
    });

    const startedAt = Date.now();
    console.log(`[verify:agent-director] waiting ≤${PLAN_TIMEOUT_MS}ms for state.ai.agentDirector.activePlan.source === "llm"`);
    try {
      await probeAgentDirector(harness.page, PLAN_TIMEOUT_MS);
    } catch (err) {
      const snap = await snapshotState(harness.page).catch(() => null);
      console.error("[verify:agent-director] FAIL — timeout waiting for LLM plan");
      console.error(`[verify:agent-director] elapsed=${Date.now() - startedAt}ms err=${String(err?.message ?? err)}`);
      console.error("[verify:agent-director] snapshot:", JSON.stringify(snap, null, 2));
      exitCode = 1;
      return;
    }
    const elapsed = Date.now() - startedAt;
    const snap = await snapshotState(harness.page);
    console.log(`[verify:agent-director] PASS — observed activePlan.source === "llm" after ${elapsed}ms`);
    console.log("[verify:agent-director] telemetry snapshot:");
    console.log(JSON.stringify(snap, null, 2));

    const stats = snap.agentDirector?.stats ?? {};
    if ((stats.llmFailures ?? 0) >= 3) {
      console.error(`[verify:agent-director] WARN — llmFailures=${stats.llmFailures} (>= 3 indicates degraded LLM gate)`);
    }
    exitCode = 0;
  } catch (err) {
    console.error("[verify:agent-director] FAIL — unexpected error");
    console.error(String(err?.stack ?? err?.message ?? err));
    exitCode = 1;
  } finally {
    if (harness) {
      await closeHarnessPage(harness).catch(() => {});
    }
    await session.stop().catch(() => {});
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error("[verify:agent-director] FAIL — top-level rejection");
  console.error(String(err?.stack ?? err?.message ?? err));
  process.exit(1);
});
