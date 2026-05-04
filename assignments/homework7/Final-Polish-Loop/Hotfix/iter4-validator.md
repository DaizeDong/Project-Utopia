---
iter: 4
parent: 4814af5
head: f1ba30d
verdict: GREEN
issues_fixed: 3
issues_partial: []
issues_failed: []
new_regressions: []
tests: 1776/1784 (5 pre-existing fail, 3 skip — identical to parent baseline)
---

| # | Description | Status | Evidence |
|---|---|---|---|
| 8 | Worker allocation prompt-only steering | PASS | `pickHighlights()` (PromptPayload.js:94-106) emits `extractor-saturated` highlight when `workers>=14 AND food/wood/stone OK AND ratio>0.65 OR processing===0`; `defense-gap` mirrored. PromptBuilder.js:334+848+860 handles `workerFocus="build"|"guard"` and damps farm/wood/quarry weights. Strategic-director.md enum extended to include build/guard. Live LLM payload (`state.ai.lastPolicyExchange.promptUser`) confirmed `operationalHighlights` array reaches model with 8 entries. Live run also showed BUILDER=3 in roleCounts after autopilot (mechanism alive). |
| 9 | Pop cap + sidebar recruit | PASS | `controls.recruitTarget = 500` confirmed live (was 16). `EntityFactory.js:1191` default 500. Sidebar Colony tab renders `+1 Worker (25 food)` button + Auto checkbox + status (`Queue: N · Cooldown: Ns · Food: N/25`). Click test: queue 0→1, "Recruit queued (1)" toast, food drained over time, workers grew 16→20 during autopilot. Screenshot: `output/hotfix-iter4/05-recruit-button-1440.png`. |
| 10 | Bottom debug panel hidden | PASS | `index.html:1790-1792` `#devDock { display: none !important; }`. Verified in both prod (`/`) and dev (`/?dev=1`): `getComputedStyle(devDock).display === "none"`, `boundingRect.height === 0`. Screenshots: `output/hotfix-iter4/01-prod-no-dev.png`, `output/hotfix-iter4/02-dev-mode.png`, `output/hotfix-iter4/05-recruit-button-1440.png` (all show clean bottom edge). |

## What's left for iter 5

- **Saturation highlight is gated on wood>=15 + stone>=8 + food>=30 + workers>=14** — in-game wood-starved scenarios will never hit it. If the user reports late-game extractor-pile-on with sub-threshold wood, consider relaxing the resource floor or adding a separate "no processing buildings" highlight at lower thresholds (already partially handled by `processingSiteCount===0` short-circuit, but resource gate still blocks).
- **Right sidebar at 1060px viewport overflows** (Colony panel sits at x=1059..1304 with viewport=1060). Not a regression — pre-existing layout sizing. At 1280+ viewport it renders cleanly.
- **`workerFocus` enum extension** is live in PromptBuilder fallback path; LLM-side npc-brain.md / strategic-director.md instructions added but require LLM cooperation. Verified prompt edits land in `promptSystem`; runtime LLM picked `workerFocus="deliver"` and `"farm"` during the test run — never picked `build`/`guard`, but that requires triggering exact threat=55 + pending blueprints at exact moment, hard to deterministically reproduce in 60 seconds of smoke. Code-path correctness verified.
- All 5 pre-existing failures still fail (carry-over, not regressions); 3 skips unchanged. **No new regressions introduced.**
- Tasks queued: iter 5 gap fixes (#30) and iter 6 final polish (#27) remain pending.

## Tests baseline
```
# tests 1784
# pass 1776
# fail 5     ← all pre-existing on parent 4814af5
# skipped 3
```

## Build
`npx vite build` → `built in 2.38s`, 144 modules, no warnings.
