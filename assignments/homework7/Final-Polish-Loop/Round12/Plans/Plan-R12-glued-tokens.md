---
reviewer_id: Plan-R12-glued-tokens (A7-rationality-audit finding 2)
feedback_source: assignments/homework7/Final-Polish-Loop/Round12/Feedbacks/A7-rationality-audit.md
round: 12
date: 2026-05-01
build_commit: fa6cda1
priority: P0
track: code (narrative templater missing space separator)
freeze_policy: hard
rollback_anchor: fa6cda1
estimated_scope:
  files_touched: 1
  loc_delta: ~20
  new_tests: 1
  wall_clock: 15
conflicts_with: []
---

# Plan-R12-glued-tokens — Insert space separator in `${groupId}:${focus}` so "saboteurs:strike" stops rendering as "saboteursstrike"

**Plan ID:** Plan-R12-glued-tokens
**Source feedback:** A7-rationality-audit Top issue #2 ("AI Decisions block emits glued-token narrative strings that read as a build regression")
**Track:** code
**Priority:** **P0** — A7 calls this "the highest-confidence dead-text defect in the run because it is the AI's primary storytelling surface and the prose breaks rationality on first glance." The string `AI: env=let the colony breathe | saboteursstrike a soft frontier corridor | workersrebuild the broken supply lane | tradersshug the warehouse lanes` renders verbatim in three places per tick (Live Causal Chain in AI Log, AI Decisions in Debug → System Narrative → AI, Director timeline tooltip). Reads like a literal `String.replace`-bug regression to any external reviewer.
**Freeze policy:** hard — a one-character separator change in a single template (`${entry.groupId}:${entry.focus}` → `${entry.groupId}: ${entry.focus}`) plus regression test.
**Rollback anchor:** `fa6cda1`

---

## 1. Core problem (one paragraph)

`src/ui/interpretation/WorldExplain.js:261` builds the AI summary line as:
```js
? groups.map((entry) => `${entry.groupId}:${entry.focus}`).join(" | ")
```
The intent is `"saboteurs: strike a soft frontier corridor | workers: rebuild the broken supply lane | traders: hug the warehouse lanes"`. But the existing code emits no space after the colon (`${entry.groupId}:${entry.focus}`), so the rendered string is `"saboteurs:strike ..."`. In the screenshots A7 captured (15-ai-log.png, 16-debug.png), the colon is either rendered very tightly OR (more likely) consumed by font-rendering / Markdown / DOM-text-content stripping somewhere downstream. A7's exact transcription is `saboteursstrike a soft frontier corridor` — no colon, no space. The fix is to make the separator visually unambiguous (space after colon) AND to add a defence-in-depth assertion that the colon is preserved through the rendering path. Note that the existing `policy.focus` strings (`"strike a soft frontier corridor"`, `"rebuild the broken supply lane"`, `"hug the warehouse lanes"`) come from `humaniseSummary` rewrite rules in `storytellerStrip.js` lines 287-306 and start with a verb, so the absence of a space after the groupId glues the noun + verb directly.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — change `:` to `: ` (colon + space) in the template

```js
// CURRENT (src/ui/interpretation/WorldExplain.js:261):
? groups.map((entry) => `${entry.groupId}:${entry.focus}`).join(" | ")

// AFTER:
// R12 Plan-R12-glued-tokens (A7 #2): insert a space after the colon so
// the rendered string reads "saboteurs: strike a soft frontier corridor"
// rather than "saboteurs:strike ...". Three downstream surfaces consume
// this template (Live Causal Chain, AI Decisions, Director timeline);
// all three benefit.
? groups.map((entry) => `${entry.groupId}: ${entry.focus}`).join(" | ")
```

- Files: `src/ui/interpretation/WorldExplain.js` (1 line + comment), 1 small test.
- Scope: ~20 LOC including test.
- Expected gain: closes A7 #2 P0.
- Main risk: any test asserting the exact `"saboteurs:strike"` substring (no space) will flip — Step 1 audits.

### Suggestion B (in-freeze, MORE DEFENSIVE) — also use a friendlier separator

Use `" — "` (em-dash) instead of `: ` because the colon-space combination still reads as engineering jargon (`groupId: focus` is a debug pattern):
```js
? groups.map((entry) => `${entry.groupId} — ${entry.focus}`).join(" | ")
```
Renders as `"saboteurs — strike a soft frontier corridor | workers — rebuild ..."`. Reads more narrative. ~5 extra LOC.
- Files: same
- Scope: ~5 extra LOC
- Expected gain: closes A7 #2 + nudges narrative tone

### Suggestion C (in-freeze, COMBINED with capitalisation) — also Title-Case the groupId

`saboteurs` → `Saboteurs`, `workers` → `Workers`, `traders` → `Traders`:
```js
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
? groups.map((entry) => `${titleCase(entry.groupId)}: ${entry.focus}`).join(" | ")
```
Renders as `"Saboteurs: strike a soft frontier corridor | Workers: rebuild ... | Traders: hug ..."`. ~3 extra LOC. Cleanly separates the role-label from the verb so even tight-rendered colons stay readable.
- Files: same
- Scope: ~3 extra LOC
- Expected gain: closes A7 #2 + matches the visual capitalisation pattern of HUD pills (`Workers`, `Traders` already capitalised in role chips per A7 secondary defects)

### Suggestion D (FREEZE-VIOLATING, do not ship) — re-architect the AI summary as a structured object rendered by JSX

Build the summary as `{role, action, target}` objects and let the consumer choose presentation. Bigger refactor; defer.

## 3. Selected approach

**Suggestion A combined with Suggestion C** — change to `${titleCase(entry.groupId)}: ${entry.focus}`. ~5 LOC for a maximal readability win. Both are within freeze (only changes the template string format) and align with the existing capitalisation pattern in HUD role chips. The em-dash variant (B) is rejected because the `" | "` separator already gives visual breaks; adding an em-dash compounds it.

## 4. Plan steps

- [ ] **Step 1 — Audit existing tests for `"groupId:focus"` substring assertions.**
  ```
  Grep -n "saboteurs:" test/ -r
  Grep -n "workers:" test/ -r
  Grep -n "traders:" test/ -r
  Grep -n "getAiInsight" test/ -r
  Grep -n "topPolicyFocus\|pickTopFocusGroups" test/ -r
  ```
  Document tests that pin the no-space format. Likely 1-3 hits.
  - Type: read (no edit)

- [ ] **Step 2 — Add `titleCase` helper + edit template at `src/ui/interpretation/WorldExplain.js:261`.**
  Add a private helper near the top of the file (after the existing `summarizeEvent` helper):
  ```js
  // R12 Plan-R12-glued-tokens (A7 #2): Title-Case helper for groupId labels
  // in the AI summary line. Keeps the rendered prose from glueing role-noun
  // + action-verb (e.g. "saboteursstrike a soft frontier corridor") and
  // matches the existing capitalisation in HUD role pills.
  function titleCaseGroup(groupId) {
    const s = String(groupId ?? "").trim();
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
  }
  ```
  Then change line 261:
  ```js
  // CURRENT:
  ? groups.map((entry) => `${entry.groupId}:${entry.focus}`).join(" | ")
  // AFTER:
  ? groups.map((entry) => `${titleCaseGroup(entry.groupId)}: ${entry.focus}`).join(" | ")
  ```
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Update existing tests flagged in Step 1.**
  Each affected test: replace `"saboteurs:strike"` → `"Saboteurs: strike"` (or similar). Comment with `// R12 glued-tokens: separator + Title-Case`.
  - Type: edit (existing tests)
  - depends_on: Step 2

- [ ] **Step 4 — Add a regression test `test/world-explain-ai-summary.test.js` (~30 LOC).**
  Test cases:
  1. `getAiInsight({ai: {groupPolicies: <Map with workers focus="rebuild ...">}})` — `summary` includes `"Workers: rebuild ..."` (Title-Case + colon-space).
  2. Multiple groups: summary contains `" | "` between role entries.
  3. No groups: summary === `"AI: no active directive"` (preserved).
  4. groupId is empty string: titleCase returns empty; defensive (no crash).
  5. Negative regression: summary does NOT contain `"saboteursstrike"` or `"workersrebuild"` substrings.
  - Type: add
  - depends_on: Step 3

- [ ] **Step 5 — Run the suite + manual Playwright re-verification.**
  `node --test test/*.test.js` — baseline 1646 / 0 fail / 2 skip preserved + 1 new test passes + Step 3 updates pass.
  Manual: open the build, open AI Log panel, confirm the Live Causal Chain renders `"Workers: rebuild the broken supply lane"` (or current focus) instead of `"workersrebuild ..."`. Same in Debug → System Narrative → AI.
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"R12 Plan-R12-glued-tokens (A7 P0 #2): AI Decisions / Live Causal Chain / Director timeline now render `Workers: rebuild ...` (Title-Case + colon-space) instead of the glued `workersrebuild ...` template defect that A7 R12 flagged across three surfaces."*
  - Type: edit
  - depends_on: Step 5

## 5. Risks

- **Tests asserting the exact `"groupId:focus"` substring will flip.** Step 1 audits; Step 3 updates. Likely 1-3 tests.
- **Other consumers of `groupId` substring.** The AI summary is consumed by `getCausalDigest` (WorldExplain.js:282) and downstream by `HUDController.js#renderAuthorTicker` and `storytellerStrip`. None of those re-parse the substring; they pass it through verbatim.
- **Snapshot tests / Playwright fixtures.** If any Playwright test asserts on the AI summary text by exact match, it'll need an update. `Grep "saboteurs:" assignments/` to find HW6/HW7 fixtures.
- **Possible affected tests:** `test/world-explain*.test.js`, `test/hud-controller*.test.js`, `test/ai-decision-panel*.test.js`. Audit in Step 1.

## 6. Verification

- **New unit test:** `test/world-explain-ai-summary.test.js` (Step 4).
- **Manual Playwright:** Step 5's check — open the live build, read the AI Decisions block.
- **No bench regression expected** — pure UI string change.

## 7. UNREPRODUCIBLE marker

N/A — A7 captured the glued tokens in screenshots 15 and 16 with the exact transcription `AI: env=let the colony breathe | saboteursstrike a soft frontier corridor | workersrebuild the broken supply lane | tradersshug the warehouse lanes`. Reliable repro on default boot once any group policy fires.

---

## Acceptance criteria

1. AI Log → Live Causal Chain renders `"Workers: rebuild the broken supply lane"` (with Title-Case + colon-space), not `"workersrebuild ..."`.
2. AI Decisions block in Debug renders the same Title-Case + colon-space format.
3. Director timeline tooltip renders the same format.
4. New unit test `test/world-explain-ai-summary.test.js` passes.
5. Test baseline 1646 / 0 fail / 2 skip preserved (+1 new pass; pre-existing tests updated as needed).
6. The substring `"saboteursstrike"` does not appear anywhere in the rendered HUD.

## Rollback procedure

```
git checkout fa6cda1 -- src/ui/interpretation/WorldExplain.js && rm test/world-explain-ai-summary.test.js
```
