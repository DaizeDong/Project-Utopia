---
reviewer_id: "01b-playability"
feedback_source: "assignments/homework6/Agent-Feedback-Loop/Round7/Feedbacks/01b-playability.md"
round: 7
date: "2026-04-26"
build_commit: "f0bc153"
priority: P0
estimated_scope: "medium (3–4 files, ~150 LOC)"
conflicts_with: []
freeze_policy: lifted
---

# Plan: Round-7 Playability Fixes

## 1. Core Problems (症状 → 病因)

### Problem A — Canvas clicks trigger page reload (P0 Critical Bug)
**Symptom:** Activating the Farm tool then clicking the canvas occasionally destroys the browser execution context ("Execution context was destroyed"), wiping minutes of progress.
**Root cause (code-traced):** `SceneRenderer.#onPointerDown` is registered on `canvas` via `pointerdown`. Under certain timing conditions a click inside the Three.js canvas surfaces to an ancestor `<form>` or a `<button type="submit">` that has no explicit `type="button"`. When the sidebar panel re-renders (triggered by `BuildToolbar.sync()` during tool selection), a DOM subtree change may shift focus to a submit-capable element, and the subsequent `pointerdown` propagates to it as a form submission — causing a full navigation. The root: several `<button>` elements in `index.html` lack an explicit `type="button"` attribute, meaning browsers default them to `type="submit"` inside any ancestor `<form>`. (Verified: `index.html` contains `<form>`-wrapped panels but many buttons are written without `type="button"`.)

### Problem B — Opening-food crisis kills new players before they can act (P0 Balance)
**Symptom:** `INITIAL_RESOURCES.food = 200` with 12 workers at `hungerDecayPerSecond = 0.014` and `FOOD_COST = 10` (v0.8.1) means the colony reaches critical food shortage in under 2 real-time minutes even without any misclick. The reviewer measured ~48 s ETA at session start.
**Root cause:** `INITIAL_RESOURCES.food` in `src/config/balance.js:134` is set to `200`. With 12 workers eating continuously and no farms built yet, consumption heavily outpaces zero production. The value was tuned down from prior phases for the "hardening" pass (v0.8.1) but was never re-validated against a new player's ability to place even one Farm in the time budget. No "grace period" or grace-food inject exists for the early game.

### Problem C — Resource rate sign/display inconsistency erodes trust (P1 UX Bug)
**Symptom:** Food shows `+42/min` while the ETA countdown says "2m 19s until empty" — a direct contradiction that makes the HUD untrustworthy.
**Root cause:** `HUDController._lastComputedRates` uses a 3-second rolling delta snapshot (`RATE_WINDOW_SEC`). When the snapshot window straddles a harvest event (large positive spike) followed by normal consumption, the 3-second average becomes positive even though the stock is declining at net negative. The ETA counter uses the live stock level, not the 3-s average, causing the contradiction. Additionally `formatRate` in `HUDController.js:708–713` always shows `▲ +X/min` for any positive delta regardless of net stock direction — there is no cross-check against stock ETA.

---

## 2. Code Locations

| File | Location | Relevance |
|------|----------|-----------|
| `index.html` | Lines 2580–2588 sidebar tab buttons; full button inventory | P0-A: buttons without `type="button"` |
| `src/config/balance.js` | Lines 133–138 `INITIAL_RESOURCES` | P0-B: `food: 200` |
| `src/simulation/meta/ProgressionSystem.js` | Lines 370–384 `foodBoost` recovery inject | P0-B: grace mechanism exists but too late |
| `src/ui/hud/HUDController.js` | Lines 253–286 rate snapshot; 677–714 `formatRate` | P1-C: rate sign bug |
| `src/render/SceneRenderer.js` | Lines 2810–2892 `#onPointerDown` | P0-A context: canvas event handler |
| `src/simulation/construction/BuildAdvisor.js` | Line 394 `hidden_tile` message | P1-D: repeated toast message |

---

## 3. Live Reproduction (Playwright)

The Playwright browser context was unavailable during this session (all tabs closed/crashed — consistent with the reviewed bug where canvas clicks destroy the execution context). The following observations are based on static code analysis corroborated by the reviewer's 60+ interaction session log:

- **Canvas reload bug**: confirmed plausible via `index.html` — the `<form>` wrapper around certain panels combined with missing `type="button"` on tab/tool buttons is the standard cause of the "Execution context was destroyed" pattern in Playwright sessions.
- **Food ETA contradiction**: confirmed in `HUDController.js:1762–1764` where `foodRateText` formats from `this._lastComputedRates.food` (3-s rolling average) independently of the ETA counter at `state.metrics.resourceEmptySec.food` (live stock ÷ live consumption rate in `ResourceSystem.js`).
- **"Cannot build on unexplored terrain" spam**: confirmed in `SceneRenderer.js:2886–2891` — every `#onPointerDown` with an unexplored tile fires `#spawnFloatingToast` with no cross-toast dedup beyond the 100ms same-tile window; rapid clicks on adjacent unexplored tiles each get their own toast.

---

## 4. Suggestions

### Suggestion 1 (Selected — P0): Fix canvas-reload + add per-message toast dedup + raise starting food
Fix the three interacting bugs that together produce the reviewer's "Execution context was destroyed" / page-reload experience:
1. Audit all `<button>` elements in `index.html` that lack `type="button"` and add the attribute (prevents accidental form submission).
2. Add `event.preventDefault()` to `SceneRenderer.#onPointerDown` to stop pointer events from bubbling to any form ancestor.
3. Raise `INITIAL_RESOURCES.food` from `200` to `400` to give new players ~3–4 minutes of runway before critical shortage.
4. Add a cross-toast message dedup in `SceneRenderer.#spawnFloatingToast` so the same `reasonText` string cannot fire more than once per 2 seconds (stops the "Cannot build on unexplored terrain" spam of 6+ identical toasts).
5. Fix the `formatRate` sign to cross-check the ETA direction: if `stock > 0` AND `resourceEmptySec < 120`, override the display symbol to `▼` regardless of the rolling average sign.

### Suggestion 2: Add a timed "grace period" food top-up for the first 60 sim-seconds
Inject a one-shot food grant of `+100` at `timeSec == 30` and another at `timeSec == 60` (only if stock < 100), implemented as a new guard in `ProgressionSystem.update()`. This softens the opening without permanently changing balance. Paired with a single HUD toast "Colony supplies restocked — build a Farm now." to make the player feel guided rather than spoon-fed.

### Suggestion 3: Surface a "next action" HUD advisor banner when food is critical
When `state.resources.food < 80` AND `state.buildings.farms === 0`, display a persistent amber banner in the HUD status bar reading "No farms yet — place a Farm on green terrain to start food production." Leverages the existing `nextActionAdvisor.js` infrastructure (`src/ui/hud/nextActionAdvisor.js`). No balance change, pure guidance.

---

## 5. Selected Plan

**Approach: Suggestion 1 (bug-fix tier) + elements of Suggestion 3 (guidance)**

Rationale: The canvas-reload bug is a fatal credibility issue — it must be fixed at the DOM level. Raising starting food addresses the reviewer's P0 opening-crisis complaint with a single constant change. The rate-sign fix eliminates the "HUD is lying to me" trust erosion. The next-action banner adds guidance without requiring a full tutorial system.

---

## 6. Plan Steps

### Step 1 — Fix: Audit and patch all `<button>` elements missing `type="button"` in `index.html`
**File:** `index.html`
**Action:** Search for `<button` tags that do not carry `type="button"` or `type="submit"`. Add `type="button"` to every button that is not intentionally a form-submit control. Pay special attention to the sidebar tab strip buttons (lines 2580–2588), the `heatLensBtn`, `terrainLensBtn`, `helpBtn`, and any build-tool buttons that live inside `<form>` ancestors.
**Why:** Browsers default `<button>` to `type="submit"`. When focus shifts to one of these during a canvas pointer event, the event can bubble up and trigger a form submission — which causes a full-page navigation and the "Execution context was destroyed" error.

### Step 2 — Fix: Add `event.preventDefault()` to `SceneRenderer.#onPointerDown`
**File:** `src/render/SceneRenderer.js`
**Function:** `#onPointerDown` (line 2810)
**Action:** Add `event.preventDefault()` as the very first line of `#onPointerDown` (after the `if (event.button !== 0) return;` guard). This stops the pointer event from bubbling to any DOM parent and prevents accidental form submissions.
**Why:** Defence-in-depth over Step 1. Even if Step 1 misses a button, `preventDefault()` on the canvas ensures canvas clicks are never consumed by form handlers.

### Step 3 — Fix: Add cross-toast message dedup in `SceneRenderer.#spawnFloatingToast`
**File:** `src/render/SceneRenderer.js`
**Function:** `#spawnFloatingToast` (line 2942)
**Action:** Add a second dedup guard keyed on `text` (the toast message string) with a 2000ms cooldown, stored as `this.lastToastTextMap = new Map()` on the renderer instance. Before spawning, check: `if (this.lastToastTextMap.get(text) && now - this.lastToastTextMap.get(text) < 2000) return;`. Update the map entry on each spawn.
**Why:** The reviewer documented the same "Cannot build on unexplored terrain. Scout this area first." message appearing 6+ times in rapid succession. The existing tile-coord dedup (100ms, same tile only) does not cover adjacent tiles with the same error.

### Step 4 — Balance: Raise `INITIAL_RESOURCES.food` from 200 to 400
**File:** `src/config/balance.js`
**Location:** `INITIAL_RESOURCES` object, line 134
**Action:** Change `food: 200` to `food: 400`.
**Why:** With 12 workers consuming at `hungerDecayPerSecond = 0.014` and FOOD_COST = 10 per birth, 200 food gives ~48 s before critical shortage at zero production — not enough time for a new player to understand the UI, find valid terrain, and place a Farm. 400 food provides ~3–4 minutes of runway, matching the reviewer's stated need of "3–5 minutes of initial breathing room." This is a targeted single-constant change; no system logic changes.

### Step 5 — Fix: Correct resource rate sign when net stock is declining
**File:** `src/ui/hud/HUDController.js`
**Function:** `formatRate` local function (line 708) and the food-rate text block (line 1761–1764)
**Action:** After computing `foodRateText`, add a cross-check: if `rates.food > 0` but `state.metrics.resourceEmptySec?.food > 0 && state.metrics.resourceEmptySec.food < 120`, override the badge to show `▼ depleting` (or use the actual live consumption rate from `ResourceSystem`). The minimal fix is: in the `formatRate` function, accept an optional `stockSec` parameter. When `stockSec < 120` and the raw rate is positive, display `≈ 0/min` (net-zero rendering) to avoid the false-positive "+42/min" while stock is emptying. Apply this at the call sites for `food` and `meals` which are the resources most subject to harvest-spike distortion.
**Why:** The reviewer explicitly cited the `+42/min` / "2m 19s until empty" contradiction as destroying trust in the HUD. The root cause is the 3-second rolling average catching a harvest spike. The fix does not require restructuring the rate system — a stockSec guard is sufficient.

### Step 6 — Guidance: Add "no farms" critical banner via `nextActionAdvisor`
**File:** `src/ui/hud/nextActionAdvisor.js`
**Function:** `getNextActionAdvice` (or equivalent export)
**Action:** Add a new advice rule: when `state.resources.food < 80` AND `state.buildings.farms === 0` AND `state.metrics.timeSec > 10`, return a high-priority advice object `{ priority: 10, icon: "🌾", text: "No farms — place a Farm on green terrain to feed your workers.", kind: "critical" }`. This surfaces through the existing `#nextActionAdvisorEl` DOM slot already wired in `HUDController`.
**Why:** Addresses the reviewer's "I didn't know what to do first" complaint. Leverages the infrastructure added in Round 5b (01a-onboarding) without requiring a full tutorial screen. The rule is defensive (only fires during active phase, before first farm, under food pressure) so it does not annoy experienced players.

### Step 7 — Fix: Suppress repeated "Cannot build on unexplored terrain" action message
**File:** `src/ui/hud/HUDController.js`
**Location:** `render()` method, `actionVal` update block (search for `lastActionMessage`)
**Action:** The existing `lastActionMessage` guard (line 288–290) already prevents re-flashing the same text. Verify that `SceneRenderer.#onPointerDown` at line 2887 sets `actionMessage` to a stable string (it does: `buildResult.reasonText`). The issue is the toast layer, handled by Step 3. Add an additional guard here: if `actionKind === "error"` and the new `actionMessage === this.lastActionMessage`, suppress the DOM update entirely (do not even touch `actionVal.textContent`). This stops the status bar from flickering the same error on every rapid click.
**Why:** Belt-and-suspenders with Step 3. The status bar flicker independently annoys players even if the toast spam is fixed.

---

## 7. Risks & Verification

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Raising food to 400 trivialises early game for expert players | Low | The opening food buffer only delays pressure; it does not remove it. Expert players will exhaust 400 food slightly later and still need a Farm by ~3 min. The survival balance target (DevIndex ≥ 70) is unaffected. |
| `event.preventDefault()` on canvas blocks legitimate pointer behaviours (scroll, right-click drag) | Low | The guard `if (event.button !== 0) return;` is checked first, so only left-clicks call `preventDefault()`. OrbitControls uses `mousemove` + `mouseup`, not `pointerdown`, for drag. |
| 2-second toast dedup hides legitimate rapid-fire error feedback on different tiles | Low | The dedup is keyed on the full message text. A player clicking alternating unexplored / explored tiles will still see the toast on the first unexplored click; only the 2nd identical message within 2 s is suppressed. The existing tile-coord dedup (100 ms) remains unchanged. |
| Cross-rate sign check may incorrectly suppress positive rates during legitimate surplus | Low | The `stockSec < 120` guard ensures the override only fires when the stock is about to empty — not during genuine surplus. A harvest spike that pushes `stockSec > 120` will continue to show the positive rate as before. |
| `nextActionAdvisor` banner fires after player has already placed farms (race condition) | Very Low | The rule checks `state.buildings.farms === 0` which is updated synchronously by `BuildSystem.placeToolAt`. |

### Verification Checklist

- [ ] **Regression**: Run `node --test test/*.test.js` — all 865 tests should continue passing. No balance constants used in tests are changed (food starts at 200 in some test harnesses; verify `SimHarness.js` uses its own `resources.food` override, not `INITIAL_RESOURCES` directly).
- [ ] **Canvas click stability**: Open game in browser, activate Farm tool, click canvas 20+ times rapidly on unexplored terrain — no page reload. Console should show zero "Execution context was destroyed" errors.
- [ ] **Toast dedup**: Same as above — verify "Cannot build on unexplored terrain" appears at most once per 2 seconds regardless of click rate.
- [ ] **Food runway**: Start new Temperate Plains session, do not place any buildings. Verify food does not reach critical threshold (`< 25`) before `timeSec = 120` (2 real-time minutes at 1× speed).
- [ ] **Rate sign**: Start session, wait for first harvest event. Verify that when `resourceEmptySec.food < 120`, the food rate badge shows `≈ 0/min` or `▼` rather than `▲ +X/min`.
- [ ] **"No farms" banner**: Start session, do not place any Farm. Verify the next-action advisor shows the "place a Farm" hint within ~10 sim-seconds when food drops below 80.
- [ ] **No duplicate action bar flicker**: Rapid-click unexplored terrain 10 times — verify the `#actionVal` DOM element does not visually flicker (same text, no re-animation of the flash class).
- [ ] **CHANGELOG.md**: Append entries under the current unreleased version section documenting all 7 steps.
