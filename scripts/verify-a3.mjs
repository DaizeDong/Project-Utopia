import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LIVE_PROOF_PATH = path.resolve("assignments/homework3/proof/live-ai-evidence.json");
const FALLBACK_PROOF_PATH = path.resolve("assignments/homework3/proof/live-ai-evidence-fallback.json");
const PERF_BASELINE_PATHS = [
  path.resolve("docs/assignment4/metrics/perf-baseline.csv"),
  path.resolve("docs/assignment3/metrics/perf-baseline.csv"),
  path.resolve("assignments/homework3/metrics/perf-baseline.csv"),
];
const OPTIONAL_DOCS_LIVE_PATH = path.resolve("docs/assignment3/live-ai-evidence.json");
const REPORT_PATH = path.resolve("docs/assignment3/verification-summary.json");

function fail(message) {
  throw new Error(message);
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} is missing: ${filePath}`);
  }
}

function findExistingFile(paths, label) {
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  fail(`${label} is missing: ${paths.join(" | ")}`);
}

function readJson(filePath, label) {
  ensureFile(filePath, label);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${filePath} (${error.message})`);
  }
}

function validateLiveProof(payload, label) {
  const envHits = Number(payload?.environment?.llmHits ?? 0);
  const policyHits = Number(payload?.policy?.llmHits ?? 0);
  const envVerdict = Boolean(payload?.verdict?.environmentHasLlmHit);
  const policyVerdict = Boolean(payload?.verdict?.policyHasLlmHit);
  if (envHits < 1 || policyHits < 1 || !envVerdict || !policyVerdict) {
    fail(
      `${label} does not prove live LLM hits (environment=${envHits}, policy=${policyHits}, verdict=${envVerdict}/${policyVerdict})`,
    );
  }
  return {
    generatedAt: String(payload.generatedAt ?? ""),
    environmentHits: envHits,
    policyHits: policyHits,
  };
}

function validateFallbackProof(payload) {
  const envHits = Number(payload?.environment?.llmHits ?? 0);
  const policyHits = Number(payload?.policy?.llmHits ?? 0);
  const envVerdict = Boolean(payload?.verdict?.environmentHasLlmHit);
  const policyVerdict = Boolean(payload?.verdict?.policyHasLlmHit);
  const envAttempts = Number(payload?.environment?.totalAttempts ?? 0);
  const policyAttempts = Number(payload?.policy?.totalAttempts ?? 0);
  if (envAttempts < 1 || policyAttempts < 1) {
    fail(`fallback proof has no attempts recorded`);
  }
  if (envHits !== 0 || policyHits !== 0 || envVerdict || policyVerdict) {
    fail(
      `fallback proof is inconsistent (environment=${envHits}, policy=${policyHits}, verdict=${envVerdict}/${policyVerdict})`,
    );
  }
  return {
    generatedAt: String(payload.generatedAt ?? ""),
    environmentAttempts: envAttempts,
    policyAttempts: policyAttempts,
  };
}

function validatePerfBaseline(csvText, sourcePath) {
  const lines = csvText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    fail(`perf baseline is empty: ${PERF_BASELINE_PATH}`);
  }
  const header = lines[0].split(",");
  const expectedHeader = ["template", "seed", "grid_ms", "astar_ms", "path_len", "width", "height"];
  if (header.join(",") !== expectedHeader.join(",")) {
    fail(`perf baseline header mismatch: expected ${expectedHeader.join(",")} got ${header.join(",")}`);
  }
  const templates = new Set();
  let maxAstarMs = 0;
  let maxGridMs = 0;
  for (const line of lines.slice(1)) {
    const [template, seed, gridMs, astarMs] = line.split(",");
    if (!template || !seed) {
      fail(`perf baseline row is malformed: ${line}`);
    }
    templates.add(template);
    maxGridMs = Math.max(maxGridMs, Number(gridMs ?? 0));
    maxAstarMs = Math.max(maxAstarMs, Number(astarMs ?? 0));
  }
  if (templates.size < 6) {
    fail(`perf baseline covers only ${templates.size} templates; expected all 6 terrain templates`);
  }
  return {
    sourcePath,
    rowCount: lines.length - 1,
    templateCount: templates.size,
    maxGridMs: Number(maxGridMs.toFixed(3)),
    maxAstarMs: Number(maxAstarMs.toFixed(3)),
  };
}

function main() {
  const liveProof = validateLiveProof(readJson(LIVE_PROOF_PATH, "live AI proof"), "live AI proof");
  const fallbackProof = validateFallbackProof(readJson(FALLBACK_PROOF_PATH, "fallback proof"));
  const perfBaselinePath = findExistingFile(PERF_BASELINE_PATHS, "performance baseline");
  const perfBaseline = validatePerfBaseline(fs.readFileSync(perfBaselinePath, "utf8"), perfBaselinePath);

  let docsLiveProof = null;
  if (fs.existsSync(OPTIONAL_DOCS_LIVE_PATH)) {
    docsLiveProof = validateLiveProof(readJson(OPTIONAL_DOCS_LIVE_PATH, "docs live AI proof"), "docs live AI proof");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checks: {
      liveProof,
      fallbackProof,
      perfBaseline,
      docsLiveProof,
    },
    notes: [
      "Stored HW03 proof artifacts verified.",
      "Live AI capture refresh is intentionally not required for offline verify:full runs.",
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[verify:a3] live proof ok (${liveProof.environmentHits}/${liveProof.policyHits} llm hits)`);
  console.log(
    `[verify:a3] fallback proof ok (${fallbackProof.environmentAttempts}/${fallbackProof.policyAttempts} attempts, all fallback)`,
  );
  console.log(
    `[verify:a3] perf baseline ok (${perfBaseline.rowCount} rows, ${perfBaseline.templateCount} templates, max grid ${perfBaseline.maxGridMs} ms, max A* ${perfBaseline.maxAstarMs} ms)`,
  );
  console.log(`[verify:a3] perf source: ${perfBaseline.sourcePath}`);
  if (docsLiveProof) {
    console.log(`[verify:a3] docs live proof ok (${docsLiveProof.environmentHits}/${docsLiveProof.policyHits} llm hits)`);
  } else {
    console.log("[verify:a3] docs live proof not present; skipped (non-blocking)");
  }
  console.log(`[verify:a3] summary written: ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
