# Plan-PAA-game-over-copy — Disambiguate End-Screen Tier Titles + Promote `session.reason`

**Plan ID:** Plan-PAA-game-over-copy
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round10/Feedbacks/PAA-mystery-game-over.md`
**Track:** UX (copy + visual hierarchy)
**Priority:** P0 (player-trust damage; game-over reads as "you won, now rest")
**Freeze policy:** hard
**Rollback anchor:** `d2a83b5`
**Estimated scope:** ~30 LOC across 2 files (1 prod, 1 test)

---

## Problem statement (one paragraph)

When `evaluateRunOutcomeState(state)` fires a loss while `devIndex ∈ [50,75)` (tier="high") or `>=75` (tier="elite"), `GameStateOverlay.js` renders a poetic finale **title** ("Routes compounded into rest." / "The chain reinforced itself.") in red-gradient hero text while the actual `session.reason` ("Colony wiped — no surviving colonists.", etc.) sits below in plain body text. EN-as-second-language players parse "rest" / "reinforced" as positive outcomes; the title reads as the cause of game-over and contradicts the (unread) reason line. Confirmed by the user's Chinese-language report: a thriving high-tier colony died, screen showed a "good news" headline, player has no idea why the run ended.

## Hard-freeze posture

NO new tile / role / building / mood / mechanic / audio / UI panel. Touch only:
- Four string literals in an existing frozen const map.
- Two existing DOM elements (`#overlayEndTitle`, `#overlayEndReason`) — only their textContent / `style` ordering, no new elements created.
- One existing test file (string assertions only).

No new BALANCE knobs, no new Three.js objects, no new HUD panels. The `data-dev-tier` attribute already exists on `#overlayEndTitle` (line 565) — we reuse it, we do not add it.

---

## Atomic steps

### Step 1 — Rewrite the four `END_TITLE_BY_TIER` strings to be unambiguous about loss

**File:** `src/ui/hud/GameStateOverlay.js:16-21`

**Before:**
```js
const END_TITLE_BY_TIER = Object.freeze({
  low:   "The colony stalled.",
  mid:   "The frontier ate them.",
  high:  "Routes compounded into rest.",
  elite: "The chain reinforced itself.",
});
```

**After:**
```js
const END_TITLE_BY_TIER = Object.freeze({
  low:   "The colony stalled.",
  mid:   "The frontier ate them.",
  high:  "The routes outlived the colony.",
  elite: "Even the chain could not hold.",
});
```

Rationale: keeps tier-aware tone (high = "you built routes that compounded; they outlasted you", elite = "the self-reinforcing chain finally broke") while every string contains an unambiguous past-tense loss verb (`stalled`, `ate`, `outlived`, `could not hold`). No "rest" / "reinforced" / "compounded" survives — those were the words that defaulted-positive in EN-as-L2 reading.

### Step 2 — Promote `session.reason` to hero, demote tier title to subhead

**File:** `src/ui/hud/GameStateOverlay.js:561-573`

**Before** (paraphrased — title is hero-styled, reason is plain):
```js
const devTier = resolveDevTier(this.state, session);
const finaleTitle = END_TITLE_BY_TIER[devTier] ?? "Colony Lost";
if (this.endTitle) {
  this.endTitle.textContent = finaleTitle;
  this.endTitle.setAttribute?.("data-dev-tier", devTier);
  this.endTitle.style.background = "linear-gradient(135deg, #922b21, #e74c3c)";
  // ...other hero styling
}
if (this.endReason) {
  this.endReason.textContent = session?.reason ?? "";
}
```

**After** (swap roles — reason is hero, title is subhead):
```js
const devTier = resolveDevTier(this.state, session);
const finaleTitle = END_TITLE_BY_TIER[devTier] ?? "Colony Lost";
const reasonText = session?.reason ?? "Run ended.";
if (this.endTitle) {
  // HERO: the cause-of-death sentence the player needs to read
  this.endTitle.textContent = reasonText;
  this.endTitle.setAttribute?.("data-dev-tier", devTier);
  this.endTitle.style.background = "linear-gradient(135deg, #922b21, #e74c3c)";
  // ...other hero styling unchanged
}
if (this.endReason) {
  // SUBHEAD: tier-flavoured epilogue, smaller, prefixed with explicit tier label
  const tierLabel = devTier.charAt(0).toUpperCase() + devTier.slice(1);
  this.endReason.textContent = `${tierLabel}-tier finale · "${finaleTitle}"`;
}
```

Atomic edit guarantee: only the two `textContent` assignments swap meaning; the two DOM nodes themselves and all other styling stay identical, so no CSS/layout regression risk.

### Step 3 — Update test assertions to match the new contract

**File:** `test/end-panel-finale.test.js:123,144,167` (existing tier-branch coverage)

For each tier-branch test, swap:
- The assertion that `endTitle.textContent === END_TITLE_BY_TIER[tier]` → assert `endTitle.textContent === session.reason`.
- The assertion (if any) on `endReason.textContent === session.reason` → assert `endReason.textContent.includes(END_TITLE_BY_TIER[tier])` AND `endReason.textContent.startsWith(<TierLabel>+"-tier finale")`.

For the `high` and `elite` branches specifically, also assert the new strings literally (`"The routes outlived the colony."` and `"Even the chain could not hold."`) so future copy edits are caught.

### Step 4 — Run test suite and confirm green

`node --test test/end-panel-finale.test.js` — must pass all four tier branches. Then `node --test test/*.test.js` baseline confirms no other end-panel consumer regressed.

---

## Suggestions (≥2, ≥1 not freeze-violating)

### Suggestion A (in-freeze, recommended) — Apply Steps 1–4 as written

Pure copy + DOM-text-content swap. Zero new mechanics. No new HUD panel. No new BALANCE knobs. The only risk surface is the test file rewrites; the prod-code surface is 4 string literals + 2 textContent assignments + 1 template literal.

### Suggestion B (in-freeze, defensive belt-and-braces) — Step 1 only, defer Step 2 to v0.10.2

If the visual hierarchy swap is judged too risky for hard-freeze (it changes which DOM node carries which content, which **could** break a downstream Playwright selector or a screenshot-diff test), ship just Step 1 (4 string swaps) plus the Step 3 test updates that match. The four-string swap alone defuses the "rest = sleep/death" misread without touching any node ordering. Step 2 is then a separate ticket for v0.10.2 polish.

This is the lower-risk variant that still kills the user-reported confusion (the misleading title becomes "outlived"/"could not hold", which contains the loss verb explicitly). Defer Step 2 only if hard-freeze interpretation forbids re-ranking DOM-text-roles.

### Suggestion C (FREEZE-VIOLATING — flagged, do not ship in R10) — Add a `data-dev-tier` visible badge

The feedback's Option C proposed adding a visible "High Tier — DevIndex 67/100" badge to the end panel as i18n insurance. That requires a **new DOM element** (a `<span class="endTierBadge">`) inside the existing overlay, which counts as a new UI affordance under hard-freeze. Tagged as a follow-up plan candidate for v0.10.2 — explicitly **not** part of this R10 plan.

---

## Acceptance criteria

1. `node --test test/end-panel-finale.test.js` passes all four tier branches with the new assertions.
2. Manual repro per feedback's "Reproduction steps": end the game with `devIndex ∈ [50,75)` and a `loss.reason = "Colony collapsed under low prosperity and extreme threat."` — the **hero** text now reads `"Colony collapsed under low prosperity and extreme threat."` and the **subhead** reads `"High-tier finale · \"The routes outlived the colony.\""`. Player no longer perceives "you did well, now you rest" as the cause of game-over.
3. `node --test test/*.test.js` full baseline preserved (1646 pass / 0 fail / 2 skip from CLAUDE.md v0.10.0 line).
4. No new files created, no new `BALANCE.*` keys, no new DOM elements, no new event listeners, no new CSS rules.

## Rollback procedure

`git checkout d2a83b5 -- src/ui/hud/GameStateOverlay.js test/end-panel-finale.test.js` reverts the entire plan in one command.
