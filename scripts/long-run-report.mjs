import fs from "node:fs";
import path from "node:path";

import { METRICS_DIR } from "./long-run-support.mjs";

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatRange(range) {
  if (!range || range.min == null || range.max == null) return "-";
  return `${range.min} - ${range.max}`;
}

function buildRows(payload, runKind) {
  if (!payload) return [];
  if (runKind === "idle") {
    return (payload.scenarios ?? []).map((scenario) => ({
      scenario: scenario.templateId,
      aiMode: payload.aiMode,
      runKind,
      wallClockDuration: scenario.wallClockDurationSec,
      finalPhase: scenario.finalPhase,
      deaths: scenario.deaths?.total ?? 0,
      prosperityRange: formatRange(scenario.prosperityRange),
      threatRange: formatRange(scenario.threatRange),
      warnings: scenario.warnings?.finalErrorCount ?? 0,
      aiTimeoutCount: scenario.ai?.timeoutCount ?? 0,
      avgFps: scenario.performance?.avgFps ?? "-",
      p5Fps: scenario.performance?.p5Fps ?? "-",
      pass: scenario.pass ? "pass" : "fail",
      notes: scenario.failure?.message ?? "",
    }));
  }
  return (payload.segments ?? [])
    .filter((segment) => Number(segment.sampleCount ?? 0) > 0)
    .map((segment) => ({
      scenario: segment.templateId,
      aiMode: payload.aiMode,
      runKind,
    wallClockDuration: Math.max(0, Number(segment.endSec ?? 0) - Number(segment.startSec ?? 0)),
    finalPhase: segment.finalPhase,
    deaths: payload.finalDeaths?.total ?? 0,
    prosperityRange: formatRange(segment.prosperityRange),
    threatRange: formatRange(segment.threatRange),
    warnings: payload.finalWarnings?.errorCount ?? 0,
    aiTimeoutCount: payload.performance?.timeoutCount ?? 0,
    avgFps: payload.performance?.avgFps ?? "-",
    p5Fps: payload.performance?.p5Fps ?? "-",
    pass: payload.pass ? "pass" : "fail",
      notes: payload.failure?.message ?? "",
    }));
}

export function writeLongRunSummary() {
  const thresholdPath = path.join(METRICS_DIR, "long-run-thresholds.json");
  const idleFallback = readJsonIfExists(path.join(METRICS_DIR, "long-run-idle-fallback.json"));
  const idleLlm = readJsonIfExists(path.join(METRICS_DIR, "long-run-idle-llm.json"));
  const operatorFallback = readJsonIfExists(path.join(METRICS_DIR, "long-run-operator-fallback.json"));
  const operatorLlm = readJsonIfExists(path.join(METRICS_DIR, "long-run-operator-llm.json"));
  const thresholds = readJsonIfExists(thresholdPath);
  const rows = [
    ...buildRows(idleFallback, "idle"),
    ...buildRows(idleLlm, "idle"),
    ...buildRows(operatorFallback, "operator"),
    ...buildRows(operatorLlm, "operator"),
  ];

  const lines = [
    "# Long-Run Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Threshold baseline: ${thresholds ? `${thresholdPath}` : "missing"}`,
    thresholds
      ? `Baseline fps: avg=${thresholds.avgFps ?? "-"}, p5=${thresholds.p5Fps ?? "-"}, min=${thresholds.minFps ?? "-"}`
      : "Baseline fps: unavailable",
    "",
    "| scenario | ai mode | run | wall-clock s | final phase | deaths | prosperity range | threat range | warnings | ai timeout count | avg fps | p5 fps | pass/fail | notes |",
    "| --- | --- | --- | ---: | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...rows.map((row) => [
      row.scenario,
      row.aiMode,
      row.runKind,
      row.wallClockDuration ?? "-",
      row.finalPhase ?? "-",
      row.deaths ?? "-",
      row.prosperityRange,
      row.threatRange,
      row.warnings ?? "-",
      row.aiTimeoutCount ?? "-",
      row.avgFps ?? "-",
      row.p5Fps ?? "-",
      row.pass,
      row.notes || "",
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
  ];

  const outPath = path.join(METRICS_DIR, "long-run-summary.md");
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  return outPath;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const outPath = writeLongRunSummary();
  console.log(`[long-run] wrote ${outPath}`);
}
