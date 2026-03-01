#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/5] unit tests"
npm test >/tmp/a3-test.log && tail -n 8 /tmp/a3-test.log

echo "[2/5] production build"
npm run build >/tmp/a3-build.log && tail -n 12 /tmp/a3-build.log

echo "[3/5] required docs"
required=(
  "docs/assignment3/demo-video-script.md"
  "docs/assignment3/A3-report-final.md"
  "docs/assignment3/A3-report-final.pdf"
  "docs/assignment3/submission-checklist.md"
)
for f in "${required[@]}"; do
  [[ -f "$f" ]] || { echo "MISSING: $f"; exit 1; }
  echo "OK: $f"
done

echo "[4/5] build artifact"
[[ -f build-dist.zip ]] || { echo "MISSING: build-dist.zip"; exit 1; }
ls -lh build-dist.zip

echo "[5/5] runtime endpoint quick check"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 http://152.53.133.32:4173/ || true)
echo "HTTP $code from http://152.53.133.32:4173/"

echo "A3 local verification completed."
