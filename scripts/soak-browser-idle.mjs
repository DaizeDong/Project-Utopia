import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { LONG_RUN_PROFILE } from "../src/config/longRunProfile.js";
import { evaluateLongRunSummary } from "../src/longrun/thresholdEvaluator.js";
import {
  METRICS_DIR,
  captureThresholdBaseline,
  closeHarnessPage,
  configureScenario,
  clickStartRun,
  ensureLiveLlmGate,
  ensureOutputDirs,
  launchHarnessPage,
  parseArgs,
  probeAndRecordLiveLlmGate,
  resolveAiMode,
  resolveHeadless,
  resolveThresholdBaseline,
  runSampledLoop,
  startPreviewSession,
  toNumber,
  writeJson,
} from "./long-run-support.mjs";

const DEFAULT_SCENARIOS = ["temperate_plains", "fortified_basin", "archipelago_isles"];

function rangeFromSamples(samples, accessor) {
  const values = samples
    .map(accessor)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length <= 0) return { min: null, max: null };
  return {
    min: Number(Math.min(...values).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
  };
}

function resolveScenarioList(raw) {
  if (!raw) return DEFAULT_SCENARIOS;
  const requested = String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return requested.length > 0 ? requested : DEFAULT_SCENARIOS;
}

async function main() {
  const args = parseArgs();
  const aiMode = resolveAiMode(args["ai-mode"]);
  const durationSec = toNumber(args["duration-sec"], LONG_RUN_PROFILE.idle.durationSec);
  const sampleIntervalSec = toNumber(args["sample-interval-sec"], LONG_RUN_PROFILE.idle.sampleIntervalSec);
  const headless = resolveHeadless(args.headless);
  const scenariosToRun = resolveScenarioList(args.scenarios);
  const thresholdPath = path.resolve(args["thresholds-out"] ?? path.join(METRICS_DIR, "long-run-thresholds.json"));
  const outPath = path.resolve(
    args.out
      ?? path.join(METRICS_DIR, `long-run-idle-${aiMode}.json`)
  );

  ensureOutputDirs();
  let thresholdBaseline = resolveThresholdBaseline(thresholdPath);
  if (!fs.existsSync(thresholdPath) || args["refresh-thresholds"]) {
    const baselinePreviewSession = await startPreviewSession();
    try {
      if (aiMode === "llm") {
        await probeAndRecordLiveLlmGate({
          proxyUrl: baselinePreviewSession.proxyUrl,
          baseUrl: baselinePreviewSession.baseUrl,
          stage: "baseline-capture",
        });
      }
      thresholdBaseline = await captureThresholdBaseline({
        baseUrl: baselinePreviewSession.baseUrl,
        thresholdPath,
        headless,
      });
    } finally {
      await baselinePreviewSession.stop();
    }
  }

  const scenarios = [];
  let overallFailure = null;
  for (const templateId of scenariosToRun) {
    const previewSession = await startPreviewSession();
    try {
      if (aiMode === "llm") {
        await probeAndRecordLiveLlmGate({
          proxyUrl: previewSession.proxyUrl,
          baseUrl: previewSession.baseUrl,
          stage: `idle-${templateId}`,
        });
      }

      const browserSession = await launchHarnessPage(previewSession.baseUrl, { headless });
      try {
        await configureScenario(browserSession.page, {
          templateId,
          seed: 1337,
          runKind: "idle",
          aiMode,
          resetRuntimeStats: true,
        });
        await clickStartRun(browserSession.page);

        const runLabel = `long-run-idle-${aiMode}-${templateId}`;
        const result = await runSampledLoop({
          page: browserSession.page,
          runKind: "idle",
          durationSec,
          sampleIntervalSec,
          runLabel,
          thresholdBaseline,
        });

        const finalSample = result.samples.at(-1) ?? null;
        const summaryFailures = evaluateLongRunSummary(result.summary, thresholdBaseline);
        const scenarioFailure = result.failure ?? (summaryFailures[0]
          ? {
              kind: summaryFailures[0].kind,
              message: summaryFailures[0].message,
              atWallSec: durationSec,
            }
          : null);
        const scenarioPayload = {
          templateId,
          aiMode,
          pass: !scenarioFailure,
          failure: scenarioFailure,
          wallClockDurationSec: scenarioFailure?.atWallSec ?? durationSec,
          finalPhase: finalSample?.phase ?? "unknown",
          deaths: finalSample?.deaths ?? { total: 0, byReason: {} },
          prosperityRange: rangeFromSamples(result.samples, (sample) => sample.gameplay?.prosperity),
          threatRange: rangeFromSamples(result.samples, (sample) => sample.gameplay?.threat),
          warnings: {
            finalCount: Number(finalSample?.warnings?.count ?? 0),
            finalErrorCount: Number(finalSample?.warnings?.errorCount ?? 0),
          },
          ai: {
            timeoutCount: Number(finalSample?.ai?.timeoutCount ?? 0),
            requestCount: Number(finalSample?.ai?.requestCount ?? 0),
            fallbackCount: Number(finalSample?.ai?.fallbackCount ?? 0),
            avgLatencyMs: Number(finalSample?.ai?.avgLatencyMs ?? 0),
            liveCoverageSatisfied: Boolean(finalSample?.ai?.liveCoverageSatisfied ?? false),
          },
          performance: result.summary,
          screenshots: result.screenshots,
          samples: result.samples,
        };
        scenarios.push(scenarioPayload);
        if (scenarioFailure) {
          overallFailure = { templateId, ...scenarioFailure };
          break;
        }
      } finally {
        await closeHarnessPage(browserSession);
      }
    } finally {
      await previewSession.stop();
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    runKind: "idle",
    aiMode,
    durationSec,
    sampleIntervalSec,
    thresholdPath,
    pass: !overallFailure,
    failure: overallFailure,
    scenarios,
  };
  await writeJson(outPath, payload);
  console.log(`[long-run][idle][${aiMode}] wrote ${outPath}`);
  if (overallFailure) {
    throw new Error(`[long-run][idle][${aiMode}] failed in ${overallFailure.templateId}: ${overallFailure.message}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
