#!/usr/bin/env bash
#
# build-submission.sh — package Project Utopia HW7 submission as zip
#
# Purpose: produce a single, reproducible `dist-submission/project-utopia-hw7-<stamp>.zip`
# that a grader can `unzip && npm ci && npx vite preview` cleanly. Excludes
# node_modules, .git, .env*, output/, dist-submission/, .playwright-cli/, and
# *.log noise; INCLUDES `dist/` so grader does not have to re-build.
#
# Dependencies: bash 4+, npm, zip, git
# Platform: tested on git-bash (Windows), POSIX bash, WSL. Pure cmd.exe / PowerShell
# without a bash shim will not work — invoke via `npm run submission:zip` or call
# `bash assignments/homework7/build-submission.sh` from a bash-capable shell.
#
# Invoked by: `npm run submission:zip`
#
# Owner: assignments/homework7 — Final Polish Loop Round 1 (B2-submission-deliverables)

set -euo pipefail

# 1. cd to repo root (script may be invoked from anywhere)
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 2. echo build identity
BUILD_SHA="$(git rev-parse --short HEAD)"
HW7_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 'unknown')"
echo "=== Project Utopia HW7 submission build ==="
echo "  build commit : $BUILD_SHA"
echo "  package ver  : $HW7_VERSION"
echo "  repo root    : $ROOT"
echo ""

# 3. install deps (prefer offline / lockfile)
echo "--- npm ci (offline-preferred) ---"
npm ci --prefer-offline --no-audit

# 4. build production bundle
echo ""
echo "--- npm run build ---"
npm run build

# 5. validate dist artifact
if [ ! -f "dist/index.html" ]; then
  echo "ERROR: dist/index.html missing after build — aborting." >&2
  exit 2
fi

# 6. prepare output dir
mkdir -p dist-submission

# 7. compose timestamped output path
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="dist-submission/project-utopia-hw7-${STAMP}.zip"

# 8. zip the repo root excluding noise; include dist/
echo ""
echo "--- zipping to $OUT ---"
zip -r "$OUT" . \
  -x 'node_modules/*' \
  -x '.git/*' \
  -x '.env' \
  -x '.env.*' \
  -x 'output/*' \
  -x 'dist-submission/*' \
  -x '.playwright-cli/*' \
  -x 'pw-help.txt' \
  -x 'desktop-dist/*' \
  -x '*.log'

# 9. report artifact
echo ""
echo "=== submission artifact ready ==="
echo "  path : $OUT"
echo "  size : $(du -h "$OUT" | awk '{print $1}')"
echo ""
echo "Upload $OUT to Canvas, OR push current branch to GitHub and submit URL instead."
echo "Pick ONE — do not submit both (avoid grader ambiguity over which copy is authoritative)."
echo ""

# 10. AUTHOR ACTION REQUIRED reminder block
cat <<'AUTHOR_REMINDER'
=== AUTHOR ACTION REQUIRED — verify before submit ===

1. Pillar names + summaries
   - README.md "Highlights — Two Pillars" lines ~5-23 + Post-Mortem.md §1
   - Copy EXACT pillar titles from assignments/homework2/a2.md (do not LLM-rename)
   - Each pillar: 2-3 sentence technical summary (your own words, cite >=1 src/ path)
   - GATE: grep -c "<copy exact pillar name from A2>" README.md assignments/homework7/Post-Mortem.md  →  must be 0

2. Post-Mortem §1-§5 substantive content
   - §1 (Project Overview): 4-8 sentences first-person, cite >=1 src/ path + 2-3 commit shas
   - §2 (HW6 Findings): pull real findings from PROCESS-LOG; each Action / Evidence / Status
   - §3 (Pillar Deep-Dive): narrative + 1 evidence line per sub-section; §3.1 worker AI 3x rewrite story is in CLAUDE.md (-2530 LOC FSM)
   - §4 (HW7 Plan vs Actual): 3 questions answered as "planned X / shipped Y / cut Z"
   - §5 (AI Tool Evaluation): MUST be hand-written, MUST include 1 concrete LLM failure story (v0.9.0 utility scoring -> v0.10.0 -2530 LOC delete is natural material). TA HW7 §1.5 anti-LLM-polish: do NOT have an LLM write this section.
   - GATE: grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md  →  must be 0

3. Demo video URL backfill
   - Record 3-min video per Demo-Video-Plan.md §1-§4 (7-shot table)
   - Upload YouTube/Vimeo (NOT unlisted-only — TA must be able to view)
   - Sync URL to: README.md ~line 92 / Post-Mortem.md "Demo Video" / CHANGELOG.md [Unreleased]
   - GATE: grep -c "pending — see Demo-Video-Plan" README.md  →  must be 0

4. Decide submission format (ONE of two)
   - A) Use the zip produced above ($OUT) — upload to Canvas
   - B) Push main to GitHub — submit repo URL with commit sha anchor
   - Do NOT submit both (one canonical copy avoids grader confusion)

VALIDATOR SIGN-OFF GATE (all must be clean):
  grep -rn "<copy exact pillar name from A2>" README.md assignments/homework7/
  grep -rn "AUTHOR:" assignments/homework7/Post-Mortem.md
  grep -n "pending — see Demo-Video-Plan" README.md
  test -f dist-submission/project-utopia-hw7-*.zip || git rev-parse origin/main

Any non-empty grep hit (rows 1-3) OR neither zip-exists nor origin/main reachable (row 4)
→ NOT READY. Do not submit.
AUTHOR_REMINDER
