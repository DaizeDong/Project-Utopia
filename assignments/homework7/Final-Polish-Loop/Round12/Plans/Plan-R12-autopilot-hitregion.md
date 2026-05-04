---
reviewer_id: Plan-R12-autopilot-hitregion (A3-first-impression finding 3)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A3-first-impression.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P1
track: ui (CSS hit-region for the Autopilot toggle in bottom HUD)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 1
  loc_delta: ~20
  new_tests: 0
  wall_clock: 15
conflicts_with: []
---

# Plan-R12-autopilot-hitregion — Expand the Autopilot toggle's clickable surface so single clicks actually toggle

**Plan ID:** Plan-R12-autopilot-hitregion
**Source feedback:** A3-first-impression finding 3 ("The 'Autopilot' checkbox in the bottom HUD did not toggle on a single click")
**Track:** ui
**Priority:** **P1** — A3 quote: "For a panicking new player who sees the colony dying, this is the single worst possible UX failure: the rescue button appears not to work." A3 confirmed via JS evaluation that `cb.click()` DOES toggle the underlying state — so the bug is purely visual hit-region: the `<input type="checkbox">` itself accepts the click but the surrounding `<label class="speed-toggle">` does not properly forward clicks to the input. Combined with the fact that the rendered "Autopilot" label is the dominant visual element (the checkbox is a tiny 14×14 native input next to it), users naturally aim at the word, not the box.
**Freeze policy:** hard — pure CSS rule change in `index.html` (the `<style>` block at lines 1320-1329). No new mechanic, no new control, no JS handler change. Only expands the clickable surface so the existing native `<label>` click-forwarding does its job.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

The HTML is:
```html
<label class="speed-toggle" title="Toggle AI autopilot">
  <input id="aiToggleTop" type="checkbox" aria-label="Toggle AI autopilot" />
  Autopilot
</label>
```
A native `<label>` wrapping a `<input>` should forward clicks anywhere on the label to the input — that's the platform default. But the current CSS at lines 1320-1329:
```css
#speedControls .speed-toggle {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: 26px; padding: 0 7px;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: rgba(208,232,255,0.78);
  font-size: 11px; font-weight: 700; white-space: nowrap;
  pointer-events: auto;
}
#speedControls .speed-toggle input { margin: 0; }
```
…does not declare `cursor: pointer`, has only 26px min-height (small), has no explicit `user-select: none` (text selection traps clicks), and likely sits inside a parent that has `pointer-events: none` somewhere up the chain causing intermittent click-eating. A3 reports the visible label "Autopilot" appears to ignore single clicks. Fix: bump the hit region (taller, wider padding, `cursor: pointer`, `user-select: none`), confirm `pointer-events: auto` is applied to the label, and add visible `:hover` / `:focus-visible` / `:active` affordances so the user gets feedback that their click registered.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — beef up the `.speed-toggle` CSS

Replace the existing rules with:
```css
/* R12 Plan-R12-autopilot-hitregion (A3 #3): expand the clickable surface
   so single clicks reliably toggle the Autopilot checkbox. Previously the
   small native checkbox + 26px label height conspired to make the visible
   "Autopilot" word feel unresponsive. */
#speedControls .speed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;        /* bump from 26 — finger / cursor target ≥ 32px */
  padding: 4px 10px;       /* bump from 0 7 */
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: rgba(208,232,255,0.78);
  font-size: 12px;          /* bump from 11 */
  font-weight: 700;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;          /* explicit — was missing */
  user-select: none;        /* text-selection no longer traps the click */
  transition: background 0.12s ease, border-color 0.12s ease;
}
#speedControls .speed-toggle:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.18);
}
#speedControls .speed-toggle:focus-within {
  outline: 2px solid rgba(120,180,255,0.55);
  outline-offset: 1px;
}
#speedControls .speed-toggle:has(input:checked) {
  background: rgba(60,140,90,0.25);
  border-color: rgba(140,220,170,0.45);
  color: rgba(220,255,230,0.92);
}
#speedControls .speed-toggle input {
  margin: 0;
  width: 16px;             /* bump from native ~13 */
  height: 16px;
  cursor: pointer;
}
```
This (a) gives the label a 32px min-height clickable surface, (b) makes the cursor pointer (visual affordance the label IS clickable), (c) blocks text-selection from trapping clicks, (d) adds visible :hover and :focus-within states, (e) adds a checked-state visual flash via `:has(input:checked)` so the user immediately sees the toggle worked.

- Files: `index.html` only (CSS block at lines 1320-1329).
- Scope: ~20 LOC.
- Expected gain: closes A3 #3.
- Main risk: `:has()` selector requires modern browsers (Chrome 105+, Safari 15.4+, Firefox 121+). Vite dev / build target should support it; if not, fall back to a JS-toggled `.checked` class.

### Suggestion B (in-freeze, MINIMAL VARIANT) — just add cursor: pointer + min-height

Skip the :hover / :focus / :checked visual affordances:
```css
#speedControls .speed-toggle {
  cursor: pointer;
  user-select: none;
  min-height: 32px;
  padding: 4px 10px;
}
```
~5 LOC. Closes the literal hit-region bug but doesn't add the visible feedback A3 also requested ("when toggled ON, briefly flash the text green").
- Files: `index.html`
- Scope: ~5 LOC

### Suggestion C (in-freeze, COMBINED with banner sync) — also fix the stale "Autopilot OFF" banner

A3 quote: "When toggled ON, briefly flash the text green and update the top 'Autopilot OFF' banner immediately rather than waiting on the next sim tick." A5's secondary note ("Autopilot OFF — manual; builders/director idle." stale banner regression) confirms the banner is mis-bound. Add a JS handler on `#aiToggleTop` change event that immediately rewrites the banner text without waiting for the next simulation tick:
```js
document.getElementById('aiToggleTop')?.addEventListener('change', (e) => {
  const banner = document.getElementById('headerStatus') || document.getElementById('autopilotStatusBanner');
  if (banner) {
    banner.textContent = e.target.checked
      ? 'Autopilot ON — director steering'
      : 'Autopilot OFF — manual';
  }
});
```
~10 extra LOC. Closes A3 #3's bonus + A5's secondary note. Recommend folding in.
- Files: `index.html` (inline `<script>` block)
- Scope: ~10 extra LOC

### Suggestion D (FREEZE-VIOLATING, do not ship) — replace the checkbox with a dedicated toggle-switch component

Build a real toggle-switch with animated thumb. Bigger redesign; defer.

## 3. Selected approach

**Suggestion A combined with Suggestion C** — bump CSS hit region + add :hover/:focus/:checked affordances + sync the banner immediately on change. ~30 LOC total. Closes A3 #3 fully + closes A5's secondary stale-banner note.

## 4. Plan steps

- [ ] **Step 1 — Audit current Autopilot click behaviour and `:has()` browser support.**
  Open the build at `http://localhost:5173`. Use Playwright `browser_evaluate` to:
  ```js
  ({
    labelExists: !!document.querySelector('label.speed-toggle'),
    labelComputed: getComputedStyle(document.querySelector('label.speed-toggle')),
    inputComputed: getComputedStyle(document.getElementById('aiToggleTop')),
    pointerEventsLabel: getComputedStyle(document.querySelector('label.speed-toggle')).pointerEvents,
    cursorLabel: getComputedStyle(document.querySelector('label.speed-toggle')).cursor,
    minHeightLabel: getComputedStyle(document.querySelector('label.speed-toggle')).minHeight,
    bodyClasses: document.body.className,
  })
  ```
  Then click the LABEL (not the checkbox) directly via `browser_click`. Observe whether the checkbox state flips. Document.
  Confirm `:has()` is supported in the project's Vite build target — likely yes (`build.target: 'esnext'` or modern), but verify in `vite.config.js`.
  - Type: read (no edit)

- [ ] **Step 2 — Apply the CSS hit-region expansion + :hover/:focus/:checked rules in `index.html` (lines 1320-1329).**
  Replace the existing 9-line rule block with the ~25-line block from Suggestion A. Preserve the pointer-events:auto declaration. Add a comment block citing A3 R12 #3.
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Add the immediate banner-sync JS handler.**
  Find the existing inline `<script>` block in `index.html` that wires up `#aiToggleTop` (search for `aiToggleTop`). Add:
  ```js
  // R12 Plan-R12-autopilot-hitregion (A3 #3 + A5 secondary stale-banner):
  // Update the Autopilot status banner IMMEDIATELY on change so the user
  // gets feedback that the toggle worked, instead of waiting for the next
  // sim tick.
  document.getElementById('aiToggleTop')?.addEventListener('change', (e) => {
    const banner = document.getElementById('headerStatus');
    if (banner) {
      banner.textContent = e.target.checked
        ? 'Autopilot ON — director steering'
        : 'Autopilot OFF — manual';
    }
  });
  ```
  - Type: add
  - depends_on: Step 2

- [ ] **Step 4 — Manual Playwright verification.**
  Open the build. Click anywhere on the visible "Autopilot" label text (not the checkbox). Confirm: checkbox toggles, banner text updates immediately, hover state shows visible background tint, checked state shows green tint. Repeat with keyboard: Tab to the toggle, Space to activate; confirm focus ring is visible.
  - Type: verify
  - depends_on: Step 3

- [ ] **Step 5 — Run the suite.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved. No new tests required (CSS-only change is hard to unit-test; manual + Playwright is sufficient).
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-autopilot-hitregion (A3 P1 #3): Autopilot toggle in bottom HUD now has 32px min-height + 10px padding + cursor:pointer + visible hover/focus/checked states; clicks anywhere on the 'Autopilot' label reliably toggle the checkbox. Bonus (A5 secondary): the status banner updates immediately on change rather than waiting for the next sim tick."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **`:has()` selector browser support.** Step 1 audits. If unsupported in the project's build target, replace with a `body.dev-mode .speed-toggle.checked` JS-driven class (~10 extra LOC).
- **Color choice for :checked state.** The proposed `rgba(60,140,90,0.25)` green may clash with other HUD greens. Step 4 visual review.
- **Banner text mismatch.** The exact banner copy ("Autopilot ON — director steering" vs the existing wording) needs to match the in-app phrasing the player sees on the next tick. Step 3 should verify by reading the current next-tick text and reusing it.
- **Possible affected tests:** none anticipated (CSS + handler only). If any Playwright test relied on the small hit-region behaviour, it'll need updating.

## 6. Verification

- **No new unit test** (CSS rule + DOM event handler).
- **Manual Playwright:** Step 4 — click label, click checkbox, keyboard Tab+Space, confirm all paths toggle and update banner immediately.
- **No bench regression expected** — UI-only.

## 7. UNREPRODUCIBLE marker

N/A — A3 reproduced via screenshot 11 + JS evaluation (`cb.click()` toggled but normal click did not). Reliable repro on default boot when clicking the visible "Autopilot" word.

---

## Acceptance criteria

1. Clicking anywhere on the visible "Autopilot" label text toggles the checkbox state on the first click.
2. The status banner updates immediately on toggle (no wait for next sim tick).
3. Hover over the toggle shows a visible background tint.
4. Keyboard focus on the toggle shows a visible outline ring.
5. Checked state shows a green-tinted background as a "ON" affordance.
6. Test baseline 1646 / 0 fail / 2 skip preserved.

## Rollback procedure

```
git checkout fa6cda1 -- index.html
```
