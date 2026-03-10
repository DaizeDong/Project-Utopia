import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

const A4_PATH = path.resolve("assignments/homework4/a4.md");
const DIST_INDEX_PATH = path.resolve("dist/index.html");
const LIVE_PROOF_PATH = path.resolve("assignments/homework3/proof/live-ai-evidence.json");
const FALLBACK_PROOF_PATH = path.resolve("assignments/homework3/proof/live-ai-evidence-fallback.json");
const PERF_PROOF_PATH = path.resolve("assignments/homework3/metrics/perf-baseline.csv");
const LOCAL_SOAK_PATH = path.resolve("docs/assignment4/metrics/soak-report.json");
const LOCAL_PERF_PATH = path.resolve("docs/assignment4/metrics/perf-baseline.csv");
const MANIFEST_PATH = path.resolve("docs/assignment4/release-manifest.json");
const SCREENSHOT_DIR = path.resolve("output/playwright");

const REQUIRED_A4_SECTIONS = [
  "## Current Alpha Diagnosis",
  "## System-by-System Upgrade Plan",
  "## Weekly Development Plan",
  "## Release Notes Since HW03",
  "### Stage 13. Deployment / Submission Evidence / Buffer Freeze",
];

function fail(message) {
  throw new Error(message);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} missing: ${filePath}`);
  }
}

function fileStatOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function getHeadCommit() {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function collectReleaseScreenshots(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => /^release-.*\.(png|jpg|jpeg)$/iu.test(path.basename(filePath)))
    .sort()
    .map((filePath) => fileStatOrNull(filePath))
    .filter(Boolean);
}

function main() {
  requireFile(A4_PATH, "HW04 report");
  requireFile(DIST_INDEX_PATH, "production build");
  requireFile(LIVE_PROOF_PATH, "HW03 live AI proof");
  requireFile(FALLBACK_PROOF_PATH, "HW03 fallback proof");
  requireFile(PERF_PROOF_PATH, "HW03 performance proof");

  const a4 = fs.readFileSync(A4_PATH, "utf8");
  for (const marker of REQUIRED_A4_SECTIONS) {
    if (!a4.includes(marker)) {
      fail(`HW04 report missing required section: ${marker}`);
    }
  }

  const stageMatches = [...a4.matchAll(/^### Stage (\d+)\./gmu)].map((match) => Number(match[1]));
  if (stageMatches.length < 13 || stageMatches[0] !== 1 || stageMatches.at(-1) !== 13) {
    fail(`HW04 report stage coverage is incomplete: found [${stageMatches.join(", ")}]`);
  }

  const localArtifacts = {
    soakReport: fs.existsSync(LOCAL_SOAK_PATH),
    perfBaseline: fs.existsSync(LOCAL_PERF_PATH),
  };
  const screenshotArtifacts = collectReleaseScreenshots(SCREENSHOT_DIR);

  const manifest = {
    generatedAt: new Date().toISOString(),
    headCommit: getHeadCommit(),
    report: {
      path: A4_PATH,
      requiredSections: REQUIRED_A4_SECTIONS,
      stages: stageMatches,
    },
    build: {
      indexHtml: fileStatOrNull(DIST_INDEX_PATH),
    },
    proofs: {
      hw03Live: fileStatOrNull(LIVE_PROOF_PATH),
      hw03Fallback: fileStatOrNull(FALLBACK_PROOF_PATH),
      hw03Perf: fileStatOrNull(PERF_PROOF_PATH),
    },
    localArtifacts: {
      soakReport: fileStatOrNull(LOCAL_SOAK_PATH),
      perfBaseline: fileStatOrNull(LOCAL_PERF_PATH),
    },
    screenshotArtifacts,
  };

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`[release:check] dist ok: ${DIST_INDEX_PATH}`);
  console.log(`[release:check] HW03 proofs ok: live, fallback, perf`);
  console.log(`[release:check] HW04 sections ok: ${REQUIRED_A4_SECTIONS.length} required markers present`);
  console.log(`[release:check] HW04 stages ok: ${stageMatches.join(", ")}`);
  console.log(
    `[release:check] local artifacts: soak=${localArtifacts.soakReport ? "present" : "missing"}, perf=${localArtifacts.perfBaseline ? "present" : "missing"}`,
  );
  console.log(`[release:check] screenshots: ${screenshotArtifacts.length}`);
  console.log(`[release:check] manifest written: ${MANIFEST_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
