import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  LONG_RUN_PROFILE,
  createDefaultLongRunThresholdBaseline,
  getLongRunProfile,
} from "../src/config/longRunProfile.js";
import {
  createLongRunEvaluationState,
  evaluateLongRunSample,
  finalizeLongRunSamples,
} from "../src/longrun/thresholdEvaluator.js";
import { loadEnvIntoProcess } from "./env-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, "..");
export const METRICS_DIR = path.resolve(REPO_ROOT, "docs/assignment4/metrics");
export const PLAYWRIGHT_OUTPUT_DIR = path.resolve(REPO_ROOT, "output/playwright");
export const LLM_PROBE_PATH = path.resolve(METRICS_DIR, "long-run-llm-probe.json");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    if (eqIndex < 0) {
      args[token.slice(2)] = true;
      continue;
    }
    args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
  }
  return args;
}

export function toNumber(value, fallback) {
  const safe = Number(value);
  return Number.isFinite(safe) ? safe : fallback;
}

export function resolveAiMode(raw) {
  return String(raw ?? "").trim().toLowerCase() === "llm" ? "llm" : "fallback";
}

export function resolveHeadless(raw) {
  if (raw === undefined) return false;
  const token = String(raw).trim().toLowerCase();
  return !(token === "false" || token === "0" || token === "no" || token === "headed");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildExit(child, timeoutMs = 4000) {
  if (!child || child.exitCode != null) return true;
  return new Promise((resolve) => {
    const onDone = () => {
      clearTimeout(timer);
      child.off("exit", onDone);
      child.off("error", onDone);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onDone);
      child.off("error", onDone);
      resolve(false);
    }, timeoutMs);
    child.once("exit", onDone);
    child.once("error", onDone);
  });
}

async function terminateChildProcessTree(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        cwd: REPO_ROOT,
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    child.kill("SIGTERM");
    const exited = await waitForChildExit(child, 1500);
    if (!exited && child.exitCode == null) {
      child.kill("SIGKILL");
    }
  }
  await waitForChildExit(child, 4000);
  child.stdout?.destroy?.();
  child.stderr?.destroy?.();
}

async function waitForUrl(url, timeoutMs = 60000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return true;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = String(err?.message ?? err);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError || "unknown error"}`);
}

export async function fetchJson(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for ${url}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

export async function startPreviewSession() {
  loadEnvIntoProcess();
  const previewPort = Number(process.env.PREVIEW_PORT ?? 4173);
  const proxyPort = Number(process.env.AI_PROXY_PORT ?? 8787);
  const baseUrl = `http://127.0.0.1:${previewPort}`;
  const proxyUrl = `http://127.0.0.1:${proxyPort}/health`;
  const child = spawn(npmCmd, ["run", "preview:full"], {
    cwd: REPO_ROOT,
    env: process.env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });
  const logs = [];
  const pushLog = (prefix) => (chunk) => {
    const text = String(chunk ?? "").trim();
    if (!text) return;
    logs.push(`${prefix}${text}`);
    if (logs.length > 120) logs.shift();
  };
  child.stdout?.on("data", pushLog(""));
  child.stderr?.on("data", pushLog("ERR "));

  try {
    await waitForUrl(baseUrl, 90000);
    await waitForUrl(proxyUrl, 90000);
  } catch (err) {
    child.kill("SIGTERM");
    throw new Error(`${String(err?.message ?? err)}\n${logs.join("\n")}`);
  }

  return {
    child,
    baseUrl,
    proxyUrl,
    async stop() {
      await terminateChildProcessTree(child);
    },
  };
}

export async function ensureLiveLlmGate(proxyUrl) {
  const payload = await fetchJson(proxyUrl);
  if (!payload?.hasApiKey) {
    throw new Error("LLM gate unavailable: OPENAI_API_KEY missing or not loaded by ai-proxy.");
  }
  if (!Number.isFinite(Number(payload?.requestTimeoutMs))) {
    throw new Error("LLM gate unavailable: ai-proxy /health payload is missing requestTimeoutMs.");
  }
  return payload;
}

export async function writeLlmProbeArtifact(payload) {
  ensureOutputDirs();
  await writeJson(LLM_PROBE_PATH, {
    generatedAt: new Date().toISOString(),
    ...payload,
  });
  return LLM_PROBE_PATH;
}

export async function probeLiveLlmCoverage(baseUrl) {
  const probeSummary = {
    world: {
      weather: { current: "clear" },
      events: [],
    },
    groups: {
      workers: {
        count: 3,
        hungerAvg: 0.15,
        carryingAvg: 0.1,
      },
    },
    gameplay: {
      threat: 28,
      prosperity: 22,
    },
  };
  const [environmentPayload, policyPayload] = await Promise.all([
    postJson(`${baseUrl}/api/ai/environment`, { summary: probeSummary }),
    postJson(`${baseUrl}/api/ai/policy`, { summary: probeSummary }),
  ]);
  const failures = [];
  if (environmentPayload?.fallback) {
    failures.push(`environment probe fell back${environmentPayload?.error ? `: ${environmentPayload.error}` : ""}`);
  }
  if (policyPayload?.fallback) {
    failures.push(`policy probe fell back${policyPayload?.error ? `: ${policyPayload.error}` : ""}`);
  }
  if (failures.length > 0) {
    throw new Error(`LLM gate unavailable: ${failures.join("; ")}`);
  }
  return {
    environmentPayload,
    policyPayload,
  };
}

export async function assertLiveLlmGateAvailable() {
  loadEnvIntoProcess();
  if (!String(process.env.OPENAI_API_KEY ?? "").trim()) {
    await writeLlmProbeArtifact({
      status: "failed",
      stage: "env-check",
      error: "LLM gate unavailable: OPENAI_API_KEY missing.",
    });
    throw new Error("LLM gate unavailable: OPENAI_API_KEY missing.");
  }
  const previewSession = await startPreviewSession();
  try {
    const healthPayload = await ensureLiveLlmGate(previewSession.proxyUrl);
    const probePayload = await probeLiveLlmCoverage(previewSession.baseUrl);
    await writeLlmProbeArtifact({
      status: "ok",
      stage: "preflight",
      health: healthPayload,
      probe: {
        environmentModel: String(probePayload.environmentPayload?.model ?? ""),
        policyModel: String(probePayload.policyPayload?.model ?? ""),
        environmentFallback: Boolean(probePayload.environmentPayload?.fallback),
        policyFallback: Boolean(probePayload.policyPayload?.fallback),
      },
    });
    return healthPayload;
  } catch (err) {
    await writeLlmProbeArtifact({
      status: "failed",
      stage: "preflight",
      error: String(err?.message ?? err),
    });
    throw err;
  } finally {
    await previewSession.stop();
  }
}

export async function probeAndRecordLiveLlmGate({ proxyUrl, baseUrl, stage = "soak-preflight" }) {
  try {
    const healthPayload = await ensureLiveLlmGate(proxyUrl);
    const probePayload = await probeLiveLlmCoverage(baseUrl);
    await writeLlmProbeArtifact({
      status: "ok",
      stage,
      health: healthPayload,
      probe: {
        environmentModel: String(probePayload.environmentPayload?.model ?? ""),
        policyModel: String(probePayload.policyPayload?.model ?? ""),
        environmentFallback: Boolean(probePayload.environmentPayload?.fallback),
        policyFallback: Boolean(probePayload.policyPayload?.fallback),
      },
    });
    return { healthPayload, probePayload };
  } catch (err) {
    await writeLlmProbeArtifact({
      status: "failed",
      stage,
      error: String(err?.message ?? err),
    });
    throw err;
  }
}

export async function launchHarnessPage(baseUrl, options = {}) {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,BackForwardCache",
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

export async function closeHarnessPage(session) {
  await session?.browser?.close?.();
}

export async function getTelemetry(page) {
  return page.evaluate(() => window.__utopiaLongRun.getTelemetry());
}

export async function configureScenario(page, { templateId, seed = 1337, runKind = "idle", aiMode = "fallback", resetRuntimeStats = true }) {
  await page.evaluate((payload) => {
    const api = window.__utopiaLongRun;
    api.regenerate({ templateId: payload.templateId, seed: payload.seed }, { phase: "menu" });
    api.configure({
      runKind: payload.runKind,
      aiMode: payload.aiMode,
      resetRuntimeStats: payload.resetRuntimeStats,
    });
  }, { templateId, seed, runKind, aiMode, resetRuntimeStats });
}

export async function clickStartRun(page) {
  const startButton = page.locator("#overlayStartBtn");
  const visible = await startButton.isVisible().catch(() => false);
  if (visible) {
    await startButton.click();
  } else {
    await page.evaluate(() => window.__utopiaLongRun.startRun());
  }
  await page.waitForFunction(() => window.__utopiaLongRun.getTelemetry().phase === "active", undefined, {
    timeout: 10000,
  });
}

export function ensureOutputDirs() {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  fs.mkdirSync(PLAYWRIGHT_OUTPUT_DIR, { recursive: true });
}

export function resolveThresholdBaseline(filePath) {
  if (!fs.existsSync(filePath)) {
    return createDefaultLongRunThresholdBaseline();
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export async function writeJson(filePath, payload) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function captureScreenshot(page, filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

export async function performCameraSurveyStep(page, stepIndex = 0) {
  return page.evaluate((safeStepIndex) => {
    const api = window.__utopiaLongRun;
    const state = window.__utopia?.state;
    const scenario = state?.gameplay?.scenario ?? {};
    const anchors = scenario.anchors ?? {};
    const firstWorker = state?.agents?.find((entity) => entity.type === "WORKER") ?? null;
    const firstGap = (scenario.routeLinks ?? [])
      .flatMap((route) => route.gapTiles ?? [])
      .find(Boolean) ?? null;
    const firstDepotAnchor = (() => {
      const depot = (scenario.depotZones ?? [])[0] ?? null;
      return depot ? anchors[depot.anchor] ?? null : null;
    })();
    const firstChokeAnchor = (() => {
      const choke = (scenario.chokePoints ?? [])[0] ?? null;
      return choke ? anchors[choke.anchor] ?? null : null;
    })();

    const steps = [
      () => firstWorker ? api.focusEntity(firstWorker.id, 1.42) : api.focusTile(0, 0, 1.1),
      () => firstGap ? api.focusTile(firstGap.ix, firstGap.iz, 1.58) : api.focusTile(0, 0, 1.18),
      () => firstDepotAnchor ? api.focusTile(firstDepotAnchor.ix, firstDepotAnchor.iz, 1.22) : api.focusTile(0, 0, 1.2),
      () => firstChokeAnchor ? api.focusTile(firstChokeAnchor.ix, firstChokeAnchor.iz, 1.48) : api.focusTile(0, 0, 1.08),
    ];
    const action = steps[Math.max(0, Math.min(steps.length - 1, Number(safeStepIndex) || 0))];
    action?.();
    return api.getTelemetry()?.view ?? null;
  }, stepIndex);
}

export function getRunScreenshotPath(runLabel, checkpointLabel) {
  return path.resolve(PLAYWRIGHT_OUTPUT_DIR, `${runLabel}-${checkpointLabel}.png`);
}

export async function captureThresholdBaseline({ baseUrl, thresholdPath, headless = true }) {
  const browserSession = await launchHarnessPage(baseUrl, { headless });
  try {
    await configureScenario(browserSession.page, {
      templateId: "temperate_plains",
      seed: 1337,
      runKind: "idle",
      aiMode: "fallback",
      resetRuntimeStats: true,
    });
    await clickStartRun(browserSession.page);
    const samples = [];
    const durationSec = LONG_RUN_PROFILE.baseline.durationSec;
    const sampleIntervalSec = LONG_RUN_PROFILE.baseline.sampleIntervalSec;
    const startedAt = Date.now();
    let nextSampleSec = 0;
    let surveyStep = 0;
    while ((Date.now() - startedAt) / 1000 <= durationSec) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      if (surveyStep < 4 && elapsedSec >= 18 + surveyStep * 2) {
        await performCameraSurveyStep(browserSession.page, surveyStep);
        surveyStep += 1;
      }
      if (elapsedSec >= nextSampleSec) {
        await browserSession.page.bringToFront().catch(() => {});
        samples.push(await getTelemetry(browserSession.page));
        nextSampleSec += sampleIntervalSec;
      }
      await sleep(250);
    }
    const summary = finalizeLongRunSamples(samples);
    const thresholdPayload = {
      ...createDefaultLongRunThresholdBaseline(),
      generatedAt: new Date().toISOString(),
      machine: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        cpuModel: os.cpus()?.[0]?.model ?? "unknown",
      },
      avgFps: summary.avgFps,
      p5Fps: summary.p5Fps,
      minFps: summary.minFps,
      avgFrameMs: summary.avgFrameMs,
    };
    await writeJson(thresholdPath, thresholdPayload);
    return thresholdPayload;
  } finally {
    await closeHarnessPage(browserSession);
  }
}

export async function runSampledLoop({
  page,
  runKind,
  durationSec,
  sampleIntervalSec,
  runLabel,
  thresholdBaseline,
  onTick = async () => {},
}) {
  const profile = getLongRunProfile(runKind);
  const evaluationState = createLongRunEvaluationState();
  let tracker = evaluationState;
  let previousSample = null;
  let failure = null;
  const samples = [];
  const screenshots = {};
  const startedAt = Date.now();
  const capture = async (label) => {
    if (screenshots[label]) return screenshots[label];
    const target = getRunScreenshotPath(runLabel, label);
    screenshots[label] = await captureScreenshot(page, target);
    return screenshots[label];
  };

  const fiveMinuteMarkSec = Math.min(durationSec, 5 * 60);
  const midpointSec = durationSec / 2;
  await capture("startup");
  let nextSampleSec = 0;
  while ((Date.now() - startedAt) / 1000 <= durationSec) {
    const elapsedWallSec = (Date.now() - startedAt) / 1000;
    await onTick({ elapsedWallSec, startedAt });
    if (elapsedWallSec >= nextSampleSec) {
      await page.bringToFront().catch(() => {});
      const sample = await getTelemetry(page);
      sample.wallClockSec = round(elapsedWallSec, 2);
      if (previousSample) {
        const deltaRenderFrames = Number(sample.performance?.renderFrameCount ?? 0)
          - Number(previousSample.performance?.renderFrameCount ?? 0);
        const deltaWallSec = Math.max(0.001, Number(sample.wallClockSec ?? 0) - Number(previousSample.wallClockSec ?? 0));
        sample.performance.browserFps = round(Math.max(0, deltaRenderFrames) / deltaWallSec, 2);
      } else {
        sample.performance.browserFps = Number(sample.performance?.fps ?? 0);
      }
      sample.performance.observedFps = round(
        Math.max(
          Number(sample.performance?.fps ?? 0),
          Number(sample.performance?.browserFps ?? 0),
        ),
        2,
      );
      samples.push(sample);
      const evaluation = evaluateLongRunSample({
        currentSample: sample,
        previousSample,
        evaluationState: tracker,
        elapsedWallSec,
        runKind,
        thresholdBaseline,
      });
      tracker = evaluation.evaluationState;
      previousSample = sample;

      if (elapsedWallSec >= fiveMinuteMarkSec) await capture("5m");
      if (elapsedWallSec >= midpointSec) {
        await capture("midpoint");
        await capture("economy-mid");
      }
      if (!screenshots["route-repair"] && tracker.firstRouteRepairAtSec != null) {
        await capture("route-repair");
      }
      if (!screenshots["event-weather-overlap"] && tracker.firstWeatherEventOverlapAtSec != null) {
        await capture("event-weather-overlap");
      }

      if (evaluation.failures.length > 0 && !failure) {
        failure = {
          kind: evaluation.failures[0].kind,
          message: evaluation.failures[0].message,
          atWallSec: round(elapsedWallSec, 2),
        };
        await capture("failure");
        break;
      }
      nextSampleSec += sampleIntervalSec;
    }
    await sleep(250);
  }
  await capture("final");

  return {
    profile,
    samples,
    summary: finalizeLongRunSamples(samples, thresholdBaseline),
    failure,
    screenshots,
  };
}

function round(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return safe;
  return Number(safe.toFixed(digits));
}
