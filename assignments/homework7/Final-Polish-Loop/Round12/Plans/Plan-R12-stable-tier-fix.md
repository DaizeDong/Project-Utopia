---
reviewer_id: Plan-R12-stable-tier-fix (A7-rationality-audit finding 1)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A7-rationality-audit.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P0
track: code (HUD/Director status tier coupling on real food metrics)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 2
  loc_delta: ~50
  new_tests: 1
  wall_clock: 30
conflicts_with:
  - Plan-R12-debug-leak-gate    # both modify src/ui/hud/HUDController.js (this plan touches lines 2293-2355, sibling touches line 1221)
---

# Plan-R12-stable-tier-fix — Couple `STABLE` colony-health tier to real food runway, not just threat

**Plan ID:** Plan-R12-stable-tier-fix
**Source feedback:** A7-rationality-audit Top issue #1 ("Director / HUD contradiction — P0 — Colony tab flags `STABLE` while the colony is 72 seconds from food collapse")
**Track:** code
**Priority:** **P0** — A7 calls this the highest-severity rationality defect of R12. Screenshot 13 captures the contradiction directly: `STABLE` (green pill) on Day 3 with `Food: -151/min`, `1m 12s until empty` (red urgency), `farms 0/6 | warehouses 0/2`, and the AI headline naming "rebuild the broken supply lane" while the actual T+72s failure path is **food**. A new player reading the Colony tab is told the colony is stable and the next move is a road, while the simulation will starve them out before they finish placing it. This is a direct rationality break — the HUD is lying about the run state.
**Freeze policy:** hard — no new mechanic, no new threshold knob (uses existing `state.metrics.foodConsumedPerMin` / `state.metrics.foodProducedPerMin` / `state.resources.food`). Only tightens the predicate that decides which of 4 existing tier labels (THRIVING / STABLE / STRUGGLING / CRISIS) renders.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

`HUDController.js#updateColonyHealthCard` (lines 2293-2355) determines the `status` tier ENTIRELY from `state.gameplay.threat`: `threat < 20 → thriving`, `threat < 50 → stable`, `threat < 70 → struggling`, else `crisis`. Food state — production rate, consumption rate, runway-until-empty — is computed and rendered ONE LINE BELOW the badge (the `foodRateText` and the runout-hint at line 2266) but is not consulted when picking the tier. Result: a colony with `Food: -151/min`, food < 60s runway, zero farms, and zero warehouses still earns the green `STABLE` pill as long as raid threat is < 50%. Fix: gate `STABLE` (and tighten `THRIVING`) on `foodRate >= -10/min AND foodHeadroomSec >= 30s AND (farms > 0 OR food >= 200)`. If those preconditions fail, demote to `STRUGGLING` (or `CRISIS` when runway < 30s). Sibling fix: when food crisis is the active failure mode, the storyteller / director headline should preempt the lumber narrative — but that's the lower-priority spillover; the HUD tier is the single hottest defect.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — multi-input tier predicate

Replace the threat-only tier dispatcher in `#updateColonyHealthCard` (lines 2308-2313):
```js
// CURRENT:
let status;
if (threat < 20) status = "thriving";
else if (threat < 50) status = "stable";
else if (threat < 70) status = "struggling";
else status = "crisis";

// AFTER:
const rates = this._lastComputedRates ?? {};
const foodRatePerMin = Number.isFinite(rates.food) ? rates.food : 0;
const foodStock = Number(state.resources?.food ?? 0);
const farms = Number(state.buildings?.farms ?? 0);
const warehouses = Number(state.buildings?.warehouses ?? 0);
// Headroom in seconds: how long until food hits 0 at the current net rate.
// Positive net rate => +Infinity (no headroom problem).
const headroomSec = foodRatePerMin >= -0.05
  ? Number.POSITIVE_INFINITY
  : Math.max(0, (foodStock / -foodRatePerMin) * 60);

let status;
// CRISIS preempts everything: < 30s food runway OR threat>=70.
if (headroomSec < 30 || threat >= 70) {
  status = "crisis";
} else if (
  // STABLE/THRIVING require minimum food stability AND production infrastructure.
  // R12 P0 (A7 #1): a colony with Food -151/min and 0 farms is NOT stable, even
  // at low threat — the green pill was lying to first-time players (screenshot 13).
  foodRatePerMin < -10 ||
  headroomSec < 90 ||
  farms === 0 ||
  warehouses === 0
) {
  status = "struggling";
} else if (threat < 20 && farms >= 1 && foodRatePerMin >= 0) {
  status = "thriving";
} else if (threat < 50) {
  status = "stable";
} else {
  status = "struggling";
}
```

- Files: `src/ui/hud/HUDController.js` (`#updateColonyHealthCard`, ~30 LOC), 1 small unit test.
- Scope: ~50 LOC including test.
- Expected gain: closes A7 #1 P0. The screenshot-13 colony correctly reads `CRISIS` (1m 12s runway < 30s? — actually 72s ≥ 30s but `foodRate=-151 < -10` AND `farms=0` → demotes to `STRUGGLING`, which is semantically correct).
- Main risk: any pre-existing test asserting `status === "stable"` for a degenerate state will flip to "struggling" — test-update task in Step 1.

### Suggestion B (in-freeze, MINIMAL VARIANT) — only block STABLE on `farms === 0`

Skip the rate / headroom logic. Only add `&& farms > 0` to the STABLE branch:
```js
else if (threat < 50 && Number(state.buildings?.farms ?? 0) > 0) status = "stable";
```
~5 LOC. Catches the most egregious case (zero farms = no food production) but misses the `Food: -151/min` case where farms exist but consumption massively outpaces production.
- Files: `src/ui/hud/HUDController.js` (1 line)
- Scope: ~5 LOC
- Expected gain: ~50% of A7's request

### Suggestion C (in-freeze, COMBINED with director headline) — also re-prioritise the AI headline

A7 #1 has a paired finding: the storyteller fixates on "rebuild the broken supply lane" while food is the actual T+72s failure. Add a food-runway preempt in `getCausalDigest` (`src/ui/interpretation/WorldExplain.js` ~lines 295-315 — `foodCrisis` branch already exists; just verify it actually preempts the `missingRoute` branch in priority order):
```js
// VERIFY: foodCrisis already returns `severity = "error"` and headline =
// "Recover food now" BEFORE the `missingRoute` / `missingDepot` branches.
// If the screenshot shows lumber narrative under foodCrisis condition, the
// branch ordering is fine but storytellerStrip is consuming a different
// digest field. Trace `Live Causal Chain → Restore west lumber route` to
// the producer in storytellerStrip.js.
```
Likely no code change needed in WorldExplain (the `foodCrisis` branch IS first in the if/else chain at line 304); the issue is storytellerStrip consuming `state.ai.lastEnvironmentDirective.focus` (lumber) instead of the digest.headline (food). ~20 extra LOC if the storyteller really needs re-wiring.
- Files: `src/ui/hud/storytellerStrip.js` + verify `src/ui/interpretation/WorldExplain.js`
- Scope: ~20 extra LOC
- Expected gain: closes both halves of A7 #1; biggest rationality win of R12

### Suggestion D (FREEZE-VIOLATING, do not ship in R12) — redesign the entire colony health metric

Replace the 4-tier (THRIVING/STABLE/STRUGGLING/CRISIS) with a continuous 0-100 score that rolls up food-runway, threat, idle workers, building health, casualty rate. Bigger redesign, breaks tests, defer to v0.10.2.

## 3. Selected approach

**Suggestion A** (multi-input predicate). It directly fixes A7's primary defect using existing state.metrics fields (no new computation pipeline) and degrades gracefully when rates are unavailable. The director-headline coupling (Suggestion C) is left to a follow-up because the WorldExplain `foodCrisis` branch IS already first-priority — the storyteller may already be doing the right thing if the food rate is actually negative; the screenshot may have been caught at a frame where `state.metrics.foodConsumedPerMin` was still warming up. Including Step 5 as a verification-only audit.

## 4. Plan steps

- [ ] **Step 1 — Audit existing tests for STABLE/THRIVING/STRUGGLING/CRISIS assertions.**
  ```
  Grep -n "thriving\|stable\|struggling\|crisis" test/ -i
  Grep -n "colonyHealthBadge" test/
  Grep -n "updateColonyHealthCard" test/
  ```
  Document which tests will flip when the predicate tightens (any test that constructs a colony with `food < 200 && threat < 50` and asserts `status === "stable"` will need to either set `farms > 0` AND a stable rate, or update the assertion to `"struggling"`).
  - Type: read (no edit)

- [ ] **Step 2 — Replace the tier predicate in `src/ui/hud/HUDController.js#updateColonyHealthCard` (lines 2308-2313).**
  Apply the multi-input predicate from Suggestion A. Preserve the existing `_lastComputedRates` consumer pattern (line 2325). Add a single comment block citing the A7 R12 source.
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Update existing tests flagged in Step 1.**
  For each test that asserted `status === "stable"` on a degenerate colony, either (a) construct a non-degenerate colony (farms > 0, food rate ≥ -10/min, headroom ≥ 90s) and keep the assertion, or (b) update the assertion to `"struggling"` (the now-correct outcome). Comment each change with `// R12 stable-tier-fix: predicate now requires food infra + rate stability`.
  - Type: edit (existing tests)
  - depends_on: Step 2

- [ ] **Step 4 — Add a new unit test `test/colony-health-tier-predicate.test.js` (~40 LOC).**
  Test cases:
  1. `STABLE` requires `threat < 50 && farms > 0 && foodRate >= -10/min && headroom >= 90s` → returns "stable".
  2. `Food: -151/min` + `0 farms` + `threat=33` → returns "struggling" (the A7 screenshot-13 case).
  3. `headroom < 30s` → returns "crisis" regardless of threat.
  4. `threat=80` → returns "crisis" regardless of food.
  5. `threat=15 && farms=2 && foodRate=+5/min` → returns "thriving".
  6. `_lastComputedRates` undefined (first frame, rates not yet warmed up) → does NOT crash; falls back to a safe non-thriving tier.
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — Verify `getCausalDigest` foodCrisis preempt is actually consumed by storytellerStrip.**
  Read `src/ui/hud/storytellerStrip.js` and trace which field of `digest` is being rendered as the headline. Confirm via Playwright: trigger the same screenshot-13 condition (Food < 18 + foodEmptySec > 0 + starvationRisk > 0) and read `document.getElementById('storytellerSummary').textContent`. If it says "Recover food now" — closed. If it still says "rebuild the broken supply lane" — file a follow-up plan; do NOT fix in this PR (scope creep).
  - Type: verify (no edit)
  - depends_on: Step 4

- [ ] **Step 6 — Run the suite + manual Playwright re-verification.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved + 1 new test passes + any flipped tests updated.
  Manual: open the build, trigger food crisis (set autopilot off + watch food drain or `state.resources.food = 50; state.metrics.foodConsumedPerMin = 151`), confirm the Colony tab badge reads `STRUGGLING` or `CRISIS` (not `STABLE`).
  - Type: verify
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-stable-tier-fix (A7 P0 #1): colony-health badge tier (`THRIVING/STABLE/STRUGGLING/CRISIS`) now consults food rate, food runway, and farm/warehouse count, not just threat. The screenshot-13 case (Food -151/min, 0 farms, 1m 12s runway) correctly demotes from STABLE to STRUGGLING."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Pre-existing tests asserting `status === "stable"` on degenerate colonies will flip.** Step 1 audits; Step 3 updates. Likely affects 2-5 tests.
- **`_lastComputedRates` may be undefined on first frame.** Step 2 includes a `?? {}` fallback + `Number.isFinite` guard; Step 4 adds a regression test for the cold-start case.
- **STRUGGLING-spam on early game.** The new predicate flags `farms === 0` as STRUGGLING immediately — and the colony bootstrap has `farms = 0` for the first ~30-60 sim seconds while autopilot places the first farm. This is arguably correct (the colony IS struggling at boot — it has 12 workers and zero food production). But if it surfaces a new "STRUGGLING for 60s then jumps to STABLE" yo-yo, smooth via the existing `_lastRunoutSmoothed[resource]` 70/30 EMA pattern (lines 2258-2260) on the headroom calc.
- **Conflict with Plan-R12-debug-leak-gate** — both touch `src/ui/hud/HUDController.js`. This plan edits lines 2293-2355 (`#updateColonyHealthCard`); the sibling edits line 1221 (`aiModeVal`). Distinct scopes, mergeable. Implementer should serialize: Plan-R12-debug-leak-gate FIRST (P0, smaller, lower risk), then this plan rebased.
- **Possible affected tests:** `test/hud-controller.test.js`, `test/colony-health-card.test.js` (if exists), `test/integration-screen-overlay.test.js`. Audit in Step 1.

## 6. Verification

- **New unit test:** `test/colony-health-tier-predicate.test.js` (Step 4) — pins the multi-input predicate.
- **Manual Playwright:** Step 6's repro — force food crisis, confirm badge demotes.
- **No bench regression expected** — UI predicate change only. Optionally confirm `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex unchanged.

## 7. UNREPRODUCIBLE marker

N/A — A7 captured the contradiction in screenshot 13 with timestamps and exact numbers (Day 3, Food: -151/min, 1m 12s until empty, farms 0/6, warehouses 0/2, STABLE green pill). Reliable repro on default boot.

---

## Acceptance criteria

1. Colony with `Food: -151/min`, `farms=0`, `headroom=72s`, `threat=33` renders status badge as `STRUGGLING` or `CRISIS`, NOT `STABLE`.
2. Colony with `Food: +5/min`, `farms=2`, `threat=15` renders `THRIVING`.
3. Colony with `headroom < 30s` always renders `CRISIS` regardless of threat.
4. Colony with `threat >= 70` always renders `CRISIS` regardless of food (preserves prior raid-driven crisis behaviour).
5. New unit test `test/colony-health-tier-predicate.test.js` passes.
6. Test baseline 1646 / 0 fail / 2 skip preserved (+1 new pass; pre-existing tests updated for the new predicate semantics).

## Rollback procedure

```
git checkout fa6cda1 -- src/ui/hud/HUDController.js && rm test/colony-health-tier-predicate.test.js
```
