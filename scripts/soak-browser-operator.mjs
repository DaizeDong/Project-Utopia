import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { LONG_RUN_PROFILE } from "../src/config/longRunProfile.js";
import { buildOperatorActionSchedule, drainDueOperatorActions } from "../src/longrun/operatorPlan.js";
import { evaluateLongRunSummary } from "../src/longrun/thresholdEvaluator.js";
import {
  METRICS_DIR,
  captureScreenshot,
  captureThresholdBaseline,
  closeHarnessPage,
  configureScenario,
  clickStartRun,
  ensureLiveLlmGate,
  ensureOutputDirs,
  getRunScreenshotPath,
  launchHarnessPage,
  parseArgs,
  performCameraSurveyStep,
  probeAndRecordLiveLlmGate,
  resolveAiMode,
  resolveHeadless,
  resolveThresholdBaseline,
  runSampledLoop,
  startPreviewSession,
  toNumber,
  writeJson,
} from "./long-run-support.mjs";

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

async function surveyPanZoom(page) {
  await performCameraSurveyStep(page, 0);
  await page.waitForTimeout(180);
  await performCameraSurveyStep(page, 1);
  await page.waitForTimeout(180);
  await performCameraSurveyStep(page, 2);
  await page.waitForTimeout(180);
  return page.evaluate(() => window.__utopiaLongRun.getTelemetry().view);
}

async function inspectWorker(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    const worker = window.__utopia.state.agents.find((entity) => entity.type === "WORKER");
    if (!worker) return null;
    api.focusEntity(worker.id, 1.5);
    api.selectEntity(worker.id);
    return worker.id;
  });
}

async function inspectFrontier(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    const scenario = window.__utopia.state.gameplay.scenario ?? {};
    const route = (scenario.routeLinks ?? [])[0];
    const gap = route?.gapTiles?.[0] ?? null;
    if (!gap) return null;
    api.focusTile(gap.ix, gap.iz, 1.55);
    api.selectTile(gap.ix, gap.iz);
    return gap;
  });
}

async function repairPrimaryRoute(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    const scenario = window.__utopia.state.gameplay.scenario ?? {};
    const route = (scenario.routeLinks ?? []).find((entry) => (entry.gapTiles ?? []).length > 0) ?? null;
    if (!route) return { repaired: 0, route: "" };
    let repaired = 0;
    for (const gap of route.gapTiles ?? []) {
      const result = api.placeToolAt("road", gap.ix, gap.iz);
      if (result?.ok) repaired += 1;
    }
    return { repaired, route: route.label ?? route.id ?? "" };
  });
}

async function supportDepotLane(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    const scenario = window.__utopia.state.gameplay.scenario ?? {};
    const anchors = scenario.anchors ?? {};
    const depot = (scenario.depotZones ?? [])[0] ?? null;
    if (!depot) return { ok: false, reason: "noDepot" };
    const anchor = anchors[depot.anchor];
    if (!anchor) return { ok: false, reason: "noAnchor" };
    const warehouse = api.placeFirstValidBuild("warehouse", anchor.ix, anchor.iz, Math.max(2, depot.radius ?? 3));
    if (warehouse?.ok) return { ok: true, action: "warehouse", candidate: warehouse.candidate ?? null };
    const road = api.placeFirstValidBuild("road", anchor.ix, anchor.iz, Math.max(3, (depot.radius ?? 3) + 1));
    return { ok: Boolean(road?.ok), action: "road", candidate: road?.candidate ?? null, reason: road?.reason ?? warehouse?.reason };
  });
}

async function addressShortage(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    const state = window.__utopia.state;
    const scenario = state.gameplay.scenario ?? {};
    const anchors = scenario.anchors ?? {};
    const route = (scenario.routeLinks ?? [])[0] ?? null;
    const anchorId = route?.from ?? Object.keys(anchors)[0];
    const anchor = anchors[anchorId];
    if (!anchor) return { ok: false, reason: "noAnchor" };
    const tool = Number(state.resources.food ?? 0) <= Number(state.resources.wood ?? 0) ? "farm" : "lumber";
    const result = api.placeFirstValidBuild(tool, anchor.ix, anchor.iz, 5);
    return {
      ok: Boolean(result?.ok),
      tool,
      candidate: result?.candidate ?? null,
      reason: result?.reason ?? "",
    };
  });
}

async function fortifyCorridor(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    const scenario = window.__utopia.state.gameplay.scenario ?? {};
    const anchors = scenario.anchors ?? {};
    const choke = (scenario.chokePoints ?? [])[0] ?? null;
    if (!choke) return { ok: false, reason: "noChoke" };
    const anchor = anchors[choke.anchor];
    if (!anchor) return { ok: false, reason: "noAnchor" };
    const wall = api.placeFirstValidBuild("wall", anchor.ix, anchor.iz, Math.max(2, choke.radius ?? 3));
    if (wall?.ok) return { ok: true, action: "wall", candidate: wall.candidate ?? null };
    const road = api.placeFirstValidBuild("road", anchor.ix, anchor.iz, Math.max(3, (choke.radius ?? 3) + 1));
    return { ok: Boolean(road?.ok), action: "road", candidate: road?.candidate ?? null, reason: road?.reason ?? wall?.reason };
  });
}

async function observePanels(page) {
  const aiPanel = page.locator("#aiDecisionPanelBody");
  const dock = page.locator("#devDock");
  if (await aiPanel.count()) await aiPanel.hover().catch(() => {});
  if (await dock.count()) await dock.hover().catch(() => {});
}

async function snapshotRoundtrip(page) {
  return page.evaluate(() => {
    const api = window.__utopiaLongRun;
    api.saveSnapshot("long-run-operator");
    api.loadSnapshot("long-run-operator");
    return api.getTelemetry();
  });
}

async function executeAction(page, action, aiMode) {
  if (action.type === "start_segment") {
    await configureScenario(page, {
      templateId: action.templateId,
      seed: 1337,
      runKind: "operator",
      aiMode,
      resetRuntimeStats: false,
    });
    await clickStartRun(page);
    return { type: action.type, templateId: action.templateId };
  }
  if (action.type === "survey_pan_zoom") return { type: action.type, view: await surveyPanZoom(page) };
  if (action.type === "inspect_worker") return { type: action.type, workerId: await inspectWorker(page) };
  if (action.type === "inspect_frontier") return { type: action.type, tile: await inspectFrontier(page) };
  if (action.type === "repair_primary_route") return { type: action.type, ...(await repairPrimaryRoute(page)) };
  if (action.type === "support_depot_lane") return { type: action.type, ...(await supportDepotLane(page)) };
  if (action.type === "address_shortage") return { type: action.type, ...(await addressShortage(page)) };
  if (action.type === "fortify_corridor") return { type: action.type, ...(await fortifyCorridor(page)) };
  if (action.type === "observe_ai_panels") {
    await observePanels(page);
    return { type: action.type };
  }
  if (action.type === "snapshot_roundtrip") return { type: action.type, ...(await snapshotRoundtrip(page)) };
  if (action.type === "final_segment_observe") {
    await page.waitForTimeout(500);
    return { type: action.type };
  }
  return { type: action.type, skipped: true };
}

async function main() {
  const args = parseArgs();
  const aiMode = resolveAiMode(args["ai-mode"]);
  const durationSec = toNumber(args["duration-sec"], LONG_RUN_PROFILE.operator.durationSec);
  const sampleIntervalSec = toNumber(args["sample-interval-sec"], LONG_RUN_PROFILE.operator.sampleIntervalSec);
  const segmentDurationSec = toNumber(args["segment-duration-sec"], LONG_RUN_PROFILE.operator.segmentDurationSec);
  const headless = resolveHeadless(args.headless);
  const thresholdPath = path.resolve(args["thresholds-out"] ?? path.join(METRICS_DIR, "long-run-thresholds.json"));
  const outPath = path.resolve(
    args.out
      ?? path.join(METRICS_DIR, `long-run-operator-${aiMode}.json`)
  );

  ensureOutputDirs();
  const previewSession = await startPreviewSession();
  try {
    if (aiMode === "llm") {
      await probeAndRecordLiveLlmGate({
        proxyUrl: previewSession.proxyUrl,
        baseUrl: previewSession.baseUrl,
        stage: "operator-suite",
      });
    }

    let thresholdBaseline = resolveThresholdBaseline(thresholdPath);
    if (!fs.existsSync(thresholdPath) || args["refresh-thresholds"]) {
      thresholdBaseline = await captureThresholdBaseline({
        baseUrl: previewSession.baseUrl,
        thresholdPath,
        headless,
      });
    }

    const browserSession = await launchHarnessPage(previewSession.baseUrl, { headless });
    try {
      const activeSegments = LONG_RUN_PROFILE.operator.segments.filter(
        (_segment, segmentIndex) => segmentIndex * segmentDurationSec < durationSec
      );
      await configureScenario(browserSession.page, {
        templateId: activeSegments[0]?.templateId ?? LONG_RUN_PROFILE.operator.segments[0].templateId,
        seed: 1337,
        runKind: "operator",
        aiMode,
        resetRuntimeStats: true,
      });
      await clickStartRun(browserSession.page);

      const schedule = buildOperatorActionSchedule({
        ...LONG_RUN_PROFILE.operator,
        segments: activeSegments,
        durationSec,
        segmentDurationSec,
      });
      let actionCursor = 1;
      const actionLog = [];
      const segmentFinals = {};

      const result = await runSampledLoop({
        page: browserSession.page,
        runKind: "operator",
        durationSec,
        sampleIntervalSec,
        runLabel: `long-run-operator-${aiMode}`,
        thresholdBaseline,
        onTick: async ({ elapsedWallSec }) => {
          const due = drainDueOperatorActions(schedule, elapsedWallSec, actionCursor);
          actionCursor = due.nextCursor;
          for (const action of due.due) {
            const outcome = await executeAction(browserSession.page, action, aiMode);
            actionLog.push({
              atSec: Number(elapsedWallSec.toFixed(2)),
              templateId: action.templateId,
              ...outcome,
            });
          }

          for (let segmentIndex = 0; segmentIndex < activeSegments.length; segmentIndex += 1) {
            const finalMark = (segmentIndex + 1) * segmentDurationSec - 2;
            const key = `segment-${segmentIndex + 1}-final`;
            if (elapsedWallSec >= finalMark && !segmentFinals[key]) {
              const target = getRunScreenshotPath(`long-run-operator-${aiMode}`, key);
              segmentFinals[key] = await captureScreenshot(browserSession.page, target);
            }
          }
        },
      });

      const segments = activeSegments.map((segment, index) => {
        const startSec = index * segmentDurationSec;
        const endSec = startSec + segmentDurationSec;
        const samples = result.samples.filter((sample) => (
          String(sample.world?.templateId ?? "") === segment.templateId
          && Number(sample.wallClockSec ?? 0) >= startSec
          && Number(sample.wallClockSec ?? 0) <= endSec + sampleIntervalSec
        ));
        const finalSample = samples.at(-1) ?? null;
        return {
          templateId: segment.templateId,
          startSec,
          endSec,
          sampleCount: samples.length,
          finalPhase: finalSample?.phase ?? "unknown",
          prosperityRange: rangeFromSamples(samples, (sample) => sample.gameplay?.prosperity),
          threatRange: rangeFromSamples(samples, (sample) => sample.gameplay?.threat),
          finalFrameScreenshot: segmentFinals[`segment-${index + 1}-final`] ?? null,
        };
      });

      const finalSample = result.samples.at(-1) ?? null;
      const summaryFailures = evaluateLongRunSummary(result.summary, thresholdBaseline);
      const operatorFailure = result.failure ?? (summaryFailures[0]
        ? {
            kind: summaryFailures[0].kind,
            message: summaryFailures[0].message,
            atWallSec: durationSec,
          }
        : null);
      const payload = {
        generatedAt: new Date().toISOString(),
        runKind: "operator",
        aiMode,
        durationSec,
        segmentDurationSec,
        sampleIntervalSec,
        thresholdPath,
        pass: !operatorFailure,
        failure: operatorFailure,
        finalPhase: finalSample?.phase ?? "unknown",
        finalWarnings: finalSample?.warnings ?? { count: 0, errorCount: 0 },
        finalDeaths: finalSample?.deaths ?? { total: 0, byReason: {} },
        performance: result.summary,
        segments,
        actionLog,
        screenshots: {
          ...result.screenshots,
          ...segmentFinals,
        },
        samples: result.samples,
      };
      await writeJson(outPath, payload);
      console.log(`[long-run][operator][${aiMode}] wrote ${outPath}`);
      if (operatorFailure) {
        throw new Error(`[long-run][operator][${aiMode}] failed: ${operatorFailure.message}`);
      }
    } finally {
      await closeHarnessPage(browserSession);
    }
  } finally {
    await previewSession.stop();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
