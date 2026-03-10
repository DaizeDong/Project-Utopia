import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
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
const DIST_ASSETS_DIR = path.resolve("dist/assets");
const REQUIRE_CLEAN = process.argv.includes("--require-clean");
const BUILD_INPUT_PATHS = [
  path.resolve("src"),
  path.resolve("index.html"),
  path.resolve("package.json"),
  path.resolve("vite.config.js"),
];

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
  const relativePath = path.relative(process.cwd(), filePath).replaceAll("\\", "/");
  return {
    path: filePath,
    relativePath,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
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

function getRecentCommits(limit = 8) {
  try {
    const output = execSync(`git log --pretty=format:%H%x09%h%x09%cI%x09%s -n ${Math.max(1, limit)}`, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return output
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, committedAt, subject] = line.split("\t");
        return {
          hash,
          shortHash,
          committedAt,
          subject,
        };
      });
  } catch {
    return [];
  }
}

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  } catch {
    return {};
  }
}

function runCommandCapture(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function collectToolchain(packageJson) {
  const devDependencies = packageJson.devDependencies ?? {};
  const dependencies = packageJson.dependencies ?? {};
  return {
    node: process.version,
    npm: runCommandCapture("npm --version"),
    vite: String(devDependencies.vite ?? dependencies.vite ?? ""),
  };
}

function collectCommandChain(packageJson) {
  const scripts = packageJson.scripts ?? {};
  return {
    verifyFull: String(scripts["verify:full"] ?? ""),
    releaseCheck: String(scripts["release:check"] ?? ""),
    releaseStrict: String(scripts["release:strict"] ?? ""),
    submitLocal: String(scripts["submit:local"] ?? ""),
    submitStrict: String(scripts["submit:strict"] ?? ""),
  };
}

function listFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out.sort();
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

function collectDistAssets(dirPath) {
  return listFilesRecursive(dirPath)
    .map((filePath) => {
      const stat = fileStatOrNull(filePath);
      if (!stat) return null;
      return {
        ...stat,
        relativePath: path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
      };
    })
    .filter(Boolean);
}

function listBuildInputFiles(inputPaths) {
  const files = [];
  for (const inputPath of inputPaths) {
    if (!fs.existsSync(inputPath)) continue;
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(inputPath));
    } else if (stat.isFile()) {
      files.push(inputPath);
    }
  }
  return Array.from(new Set(files)).sort();
}

function summarizeDistAssets(assets) {
  const summary = {
    assetCount: assets.length,
    totalSizeBytes: 0,
    jsCount: 0,
    jsSizeBytes: 0,
    rootJsChunks: [],
  };
  for (const asset of assets) {
    summary.totalSizeBytes += Number(asset.sizeBytes ?? 0);
    const relativePath = String(asset.relativePath ?? "");
    if (relativePath.endsWith(".js")) {
      summary.jsCount += 1;
      summary.jsSizeBytes += Number(asset.sizeBytes ?? 0);
      if (/^dist\/assets\/[^/]+\.js$/u.test(relativePath)) {
        summary.rootJsChunks.push({
          relativePath,
          sizeBytes: Number(asset.sizeBytes ?? 0),
        });
      }
    }
  }
  summary.rootJsChunks.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return summary;
}

function summarizeBuildFreshness(distIndexPath, inputPaths) {
  const distStat = fileStatOrNull(distIndexPath);
  const inputFiles = listBuildInputFiles(inputPaths);
  let latestInput = null;
  for (const filePath of inputFiles) {
    const stat = fileStatOrNull(filePath);
    if (!stat) continue;
    if (!latestInput || String(stat.modifiedAt) > String(latestInput.modifiedAt)) {
      latestInput = stat;
    }
  }
  const fresh = Boolean(distStat && latestInput)
    ? Date.parse(distStat.modifiedAt) >= Date.parse(latestInput.modifiedAt)
    : true;
  return {
    fresh,
    checkedInputs: inputFiles.length,
    checkedRoots: inputPaths.map((inputPath) => path.relative(process.cwd(), inputPath).replaceAll("\\", "/")),
    distIndex: distStat,
    latestInput,
  };
}

function getWorktreeStatus() {
  try {
    const output = execSync("git status --porcelain", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    const entries = output
      .split(/\r?\n/u)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const status = line.slice(0, 2);
        const filePath = line.slice(3);
        return {
          status,
          path: filePath,
        };
      });
    return {
      dirty: entries.length > 0,
      entryCount: entries.length,
      entries,
    };
  } catch {
    return {
      dirty: false,
      entryCount: 0,
      entries: [],
    };
  }
}

function summarizeStrictBlockers(worktree, limit = 8) {
  const entries = Array.isArray(worktree?.entries) ? worktree.entries : [];
  const blockers = entries.map((entry) => ({
    status: String(entry.status ?? "").trim(),
    path: String(entry.path ?? ""),
  }));
  return {
    count: blockers.length,
    preview: blockers.slice(0, Math.max(1, limit)),
  };
}

function main() {
  requireFile(A4_PATH, "HW04 report");
  requireFile(DIST_INDEX_PATH, "production build");
  requireFile(LIVE_PROOF_PATH, "HW03 live AI proof");
  requireFile(FALLBACK_PROOF_PATH, "HW03 fallback proof");
  requireFile(PERF_PROOF_PATH, "HW03 performance proof");

  const a4 = fs.readFileSync(A4_PATH, "utf8");
  const packageJson = readPackageJson();
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
  const distAssets = collectDistAssets(DIST_ASSETS_DIR);
  const distSummary = summarizeDistAssets(distAssets);
  const buildFreshness = summarizeBuildFreshness(DIST_INDEX_PATH, BUILD_INPUT_PATHS);
  const worktree = getWorktreeStatus();
  const strictBlockers = summarizeStrictBlockers(worktree);
  const recentCommits = getRecentCommits();
  const toolchain = collectToolchain(packageJson);
  const commandChain = collectCommandChain(packageJson);
  if (REQUIRE_CLEAN && worktree.dirty) {
    fail(`worktree is not clean (${worktree.entryCount} entries)`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    headCommit: getHeadCommit(),
    recentCommits,
    releaseStatus: {
      strictReady: !worktree.dirty,
      requireClean: REQUIRE_CLEAN,
      strictBlockers,
      screenshotCount: screenshotArtifacts.length,
      distAssetCount: distSummary.assetCount,
    },
    toolchain,
    commandChain,
    report: {
      path: A4_PATH,
      requiredSections: REQUIRED_A4_SECTIONS,
      stages: stageMatches,
    },
    build: {
      indexHtml: fileStatOrNull(DIST_INDEX_PATH),
      freshness: buildFreshness,
      summary: distSummary,
      assets: distAssets,
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
    worktree,
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
  console.log(
    `[release:check] dist assets: ${distSummary.assetCount} total=${distSummary.totalSizeBytes}B js=${distSummary.jsCount}/${distSummary.jsSizeBytes}B`,
  );
  console.log(
    `[release:check] build freshness: ${buildFreshness.fresh ? "fresh" : "stale"} (${buildFreshness.checkedInputs} inputs, latest=${buildFreshness.latestInput?.relativePath ?? "n/a"})`,
  );
  console.log(`[release:check] screenshots: ${screenshotArtifacts.length}`);
  console.log(`[release:check] worktree dirty: ${worktree.dirty} (${worktree.entryCount} entries)`);
  if (strictBlockers.count > 0) {
    console.log(
      `[release:check] strict blockers: ${strictBlockers.preview.map((entry) => `${entry.status} ${entry.path}`).join("; ")}`,
    );
  }
  console.log(`[release:check] require clean: ${REQUIRE_CLEAN}`);
  console.log(`[release:check] recent commits: ${recentCommits.length}`);
  console.log(`[release:check] strict ready: ${!worktree.dirty}`);
  console.log(`[release:check] toolchain: node=${toolchain.node} npm=${toolchain.npm} vite=${toolchain.vite || "unknown"}`);
  console.log(`[release:check] manifest written: ${MANIFEST_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
