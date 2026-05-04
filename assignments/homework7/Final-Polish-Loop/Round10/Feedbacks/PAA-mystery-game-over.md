# PAA — Mystery Game-Over: "Routes compounded into rest."

**Severity:** P0 (silent unexplained game-over — but root cause is **misleading copy on a successful-tier finale**, not an unexplained crash)
**Status:** Bug confirmed via static investigation. Source identified.
**User report:** "发展非常好,突然提示'Routes compounded into rest.'然后游戏结束了.很不爽,不知道为什么"
("Development was going very well, suddenly the message 'Routes compounded into rest.' appeared and the game ended. Very frustrating, don't know why.")

---

## TL;DR

The string "Routes compounded into rest." is **not an error message and not a game-over reason** — it is the **end-screen TITLE** chosen for **devTier === "high"** (DevIndex 50–74). It is intentionally poetic / "transport, not invent" finale copy authored in v0.8.2 Round-6 Wave-3.

The actual reason the run ended is rendered **below** the title, in `#overlayEndReason` from `session.reason` (e.g. `"Colony wiped — no surviving colonists."` or `"Both food and wood reached zero with no supply still in transit."` or `"Colony collapsed under low prosperity and extreme threat."`).

The user's confusion is therefore a **UX/copy bug**, not a logic bug:
- The title is **abstract metaphor** ("Routes compounded into rest.") — to a non-English-native player, "rest" parses as "rest = sleep / pause / death", not the intended "rest = denouement / completion of cycle".
- The title's hero-styling (red→orange gradient, large font in `endTitle`) makes it read as **the** game-over message, while the actual `#overlayEndReason` line is plain text and visually subordinate.
- Worse: the user said "developing nicely" → DevIndex was 50–74 → tier="high" → this title fires. The player parses it as "the game ended *because* my routes were good", which is nonsensical — actual cause is hidden in the smaller reason line.

---

## Source identification

**File:** `src/ui/hud/GameStateOverlay.js`
- **Line 19** — string definition:
  ```js
  const END_TITLE_BY_TIER = Object.freeze({
    low:   "The colony stalled.",
    mid:   "The frontier ate them.",
    high:  "Routes compounded into rest.",      // <-- THIS LINE
    elite: "The chain reinforced itself.",
  });
  ```
- **Lines 561–570** — render site:
  ```js
  const devTier = resolveDevTier(this.state, session);
  const finaleTitle = END_TITLE_BY_TIER[devTier] ?? "Colony Lost";
  if (this.endTitle) {
    this.endTitle.textContent = finaleTitle;
    this.endTitle.setAttribute?.("data-dev-tier", devTier);
    this.endTitle.style.background = "linear-gradient(135deg, #922b21, #e74c3c)"; // red gradient
    ...
  }
  ```
- **Lines 571–573** — actual reason text (visually subordinate, plain styling):
  ```js
  if (this.endReason) {
    this.endReason.textContent = session?.reason ?? "";
  }
  ```

**Tier resolver:** `src/app/runOutcome.js:17–24` — `deriveDevTier(devIndex)` buckets are `<25 low`, `<50 mid`, `<75 high`, `>=75 elite`.

**Loss producer:** `src/app/runOutcome.js:26–81` — `evaluateRunOutcomeState(state)` returns one of three reasons:
1. `"Colony wiped — no surviving colonists."` (workers <= 0)
2. `"Both food and wood reached zero with no supply still in transit."` (resource collapse)
3. `"Colony collapsed under low prosperity and extreme threat."` (prosperity ≤ 8 AND threat ≥ 92, after `lossGracePeriodSec`)

Plus `max_days_reached` (90/365-day cap) from `SimHarness.js:154` and the bench scripts — but in shipped UI play there is no day cap, so this code path doesn't fire for the user.

---

## Trigger condition (deterministic)

The string fires whenever **all** of the following are true at the same simulation tick:
1. `evaluateRunOutcomeState(state)` returns a non-null loss object (one of the 3 conditions above), which transitions `session.phase` from `"play"` → `"end"`.
2. `state.gameplay.devIndex` is in **`[50, 75)`** at the moment the loss is evaluated.
3. `GameStateOverlay.render({phase:"end", ...})` runs (i.e. the end panel becomes visible).

For the user's report ("developing nicely"), condition (2) is the smoking gun: a colony with DevIndex 50–74 was thriving by the game's own metric, then died from a **late** food/wood collapse or a sudden raid (prosperity ≤ 8 + threat ≥ 92 spike). The high tier title fires while the reason line — the *actual* explanation — sits below in unstyled body text.

---

## Reproduction steps (deterministic, static-only)

Repro requires only the file inspection above; no Playwright run is needed because the string is a static literal in a frozen const map. To reproduce visually:

1. Start any scenario, play to DevIndex ≥ 50 (any "going well" run).
2. Trigger any of the 3 loss conditions — easiest: spawn-cheat a max-strength bandit raid via `state.events.banditRaid` + drain `state.resources.food` to 0 in `browser_evaluate`, OR play long enough for the natural late-game raid escalator to fire.
3. End screen displays "Routes compounded into rest." in red gradient hero text.
4. The actual reason ("Colony collapsed under…", etc.) sits below in plain text.

(Test fixture confirming render path: `test/end-panel-finale.test.js:123,144,167` already covers all four tier branches.)

---

## Severity assessment

- **Not silent**: the reason is in the DOM, but the player misses it because the title dominates visually.
- **Not unexplained**: the explanation exists but is mis-ranked in the visual hierarchy.
- **High player-trust damage**: the title essentially says "you did well, now you rest" while the colony just died of starvation/raid — this reads as the game lying to the player or as a non-sequitur.

P0 because: **first-impression negative experience** + **player has no way to learn from the run** (the title implies a positive outcome, the reason text gets ignored).

---

## Suggested fix

### Option A — Minimal copy fix (lowest risk, recommended for hotfix)

In `src/ui/hud/GameStateOverlay.js:16-21`, rewrite the four titles to be **unambiguous about loss while preserving tier-distinction tone**:

```js
const END_TITLE_BY_TIER = Object.freeze({
  low:   "The colony stalled.",
  mid:   "The frontier ate them.",
  high:  "The routes outlived the colony.",   // tier-flavoured but says "ended"
  elite: "Even the chain could not hold.",     // tier-flavoured but says "ended"
});
```

Both replacements keep the tier-aware tone (high = "you built routes that compounded; they outlasted you", elite = "the self-reinforcing chain finally broke") while making it unambiguous in any language that the run **ended**. "Rest" / "reinforced" both default-parse as positive in English and EN-as-second-language; "outlived" and "could not hold" do not.

### Option B — Restructure visual hierarchy (defence in depth, recommended for v0.10.2)

In `GameStateOverlay.js:563-573`, swap the visual ranking:
- Render `session.reason` as the **hero element** (large, gradient) — this is the *cause* of game-over.
- Render the tier title as the **subheading** beneath, prefixed with the explicit tier label, e.g.:
  ```
  Both food and wood reached zero with no supply still in transit.   <-- HERO
  High-tier finale · "The routes outlived the colony."               <-- subhead
  ```
- This guarantees the player reads the cause first, regardless of tier-title wording.

### Option C — Add tier badge + i18n consideration

The user's report is in Chinese. The end panel has zero localisation. Even with Option A's clearer English copy, "rest"/"outlived"/"hold" all rely on idiomatic English. A `data-dev-tier="high"` attribute already exists on `#overlayEndTitle` (line 565) — exposing this as a **visible badge** ("High Tier — DevIndex 67/100") gives the player an unambiguous signal independent of the poetic copy, and is i18n-safe (the badge is structured data, not prose).

### Top fix (single-line)

Apply **Option A** as a hotfix in v0.10.1 (one-line change to four strings, zero structural risk, existing `test/end-panel-finale.test.js` will need updated string assertions but no new test logic). Track Option B for v0.10.2 polish pass.

---

## Investigation method note

This was a **static investigation** (Grep on the literal string fragment). No Playwright reproduction was needed because:
1. The string is a frozen-const literal at one site (zero ambiguity about source).
2. The render path is fully deterministic on `session.phase === "end"` + `deriveDevTier(devIndex)`.
3. Existing test `test/end-panel-finale.test.js` already exercises all four branches and confirms the render contract.

Cross-referenced the design intent in `assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02e-indie-critic.md:90,156` — the plan's stated philosophy ("transport, not invent") chose poetic re-use of existing scenario voice copy. The unintended consequence: the resulting titles are too poetic for a finale **header** role and read as positive outcomes. The plan author did not test the high/elite titles against a non-English-native reader.
