---
reviewer_id: 02d-roleplayer
round: 7
build_commit: f0bc153
freeze_policy: lifted
date: 2026-04-26
---

# Round 7 Plan — 02d-roleplayer (Narrative / Roleplay Player)

## 1. Core Problems (distilled from feedback)

Three root issues surface from the review:

**P1 — Death has no weight: the notification disappears too fast and leaves no persistent trace.**
The death toast fires for 3 500 ms (`#pushDeathAlert` timer) and the deathVal obituary flash lasts 8 000 ms. After those windows close, the death vanishes from every visible surface. `state.gameplay.deathLog` is populated by `MortalitySystem.recordDeath` (capped at 24 entries) but is never surfaced in any UI panel — it is completely invisible to the player.

**P2 — Personality tags (hardy / resilient / careful / social) have almost no behavioral expression.**
`EntityFactory.js` sets only `preferences.speedMultiplier` (swift ±15 %, careful -10 %) and `preferences.workDurationMultiplier` (efficient -20 %, careful +20 %). The `hardy` and `resilient` traits — the ones most narratively legible — have zero effect on starvation resistance or morale decay. The `social` trait does not reduce social-need decay. This means two workers with opposite temperaments behave identically in the scenarios the reviewer watched.

**P3 — Decision monologue is logistics language; emotional context from memory is never injected.**
The EntityFocusPanel "Decision Context" block reads from `worker.blackboard.lastIntentReason` (a terse debug string). Workers already carry grief / kinship memory entries (`[284s] Close friend Joran Pike died`), but these are never woven into the displayed reasoning. The gap between "what the system knows" and "what it says" makes the monologue feel robotic.

---

## 2. Code Locations

| Concern | File | Key symbol |
|---------|------|-----------|
| Death toast duration | `src/ui/hud/HUDController.js` | `OBITUARY_FLASH_MS = 8000`, `#pushDeathAlert` → timer 3500 |
| deathLog (unpublished) | `src/simulation/lifecycle/MortalitySystem.js` | `state.gameplay.deathLog.unshift(obituaryLine)` |
| deathLog (no panel) | `src/ui/panels/EventPanel.js` | reads only `objectiveLog`, not `deathLog` |
| Trait → behavior gap | `src/entities/EntityFactory.js` | `preferences` block lines 292–293 |
| Starvation holdSec | `src/simulation/lifecycle/MortalitySystem.js` | `deathThresholdFor()` returns flat `holdSec: 34` for all workers |
| Social/morale decay | `src/simulation/npc/WorkerAISystem.js` | `getWorkerHungerDecayPerSecond()` — no social-trait modifier anywhere |
| Monologue injection | `src/ui/panels/EntityFocusPanel.js` | Character block renders `recentMemories` only in the details section, not woven into Decision Context |

---

## 3. Reproduction Notes

Browser backend was unavailable during this session (Playwright context closed). The findings above are based on full source-code analysis:

- `MortalitySystem.recordDeath` at line 432–434 confirms `deathLog` is written but the search across `src/ui/` found zero references to `deathLog` — it is truly a dark data store.
- `EntityFactory.js` lines 292–293 exhaustively list all trait-to-preference mappings; `hardy`, `resilient`, and `social` are absent.
- `deathThresholdFor()` in `MortalitySystem.js` returns a flat `{ hunger: 0.045, holdSec: 34 }` for every `ENTITY_TYPE.WORKER` with no trait lookup.
- `HUDController.js` `#pushDeathAlert` schedules `setTimeout(..., 3500)` — 3.5 s — confirming the reviewer's "10 seconds and gone" observation.

---

## 4. Suggestions

### Suggestion A — Persist Deaths: "Memorial Roll" tab in EventPanel

**Idea:** Surface `state.gameplay.deathLog` (already written, already capped at 24) in the Events panel as a persistent "Memorial" subsection. Extend the death toast from 3 500 ms → 8 000 ms and the `deathVal` obituary flash from 8 000 ms → 14 000 ms. Optionally add a pulsing red dot to the Events tab button whenever a new death was recorded in the last 30 s so the player knows to look there.

**Why:** The data exists. The grief is in the system. Surfacing it requires no new simulation logic — just routing `deathLog` into a DOM section that already exists, with a CSS `mem-obituary` class the EntityFocusPanel already defines. This directly addresses the reviewer's core complaint ("10 seconds, then nothing").

**Cost:** Low. ~30–60 LOC in `EventPanel.js` + `HUDController.js`. No simulation changes. No new state fields. Zero test risk.

---

### Suggestion B — Trait Behavioral Expression: hardy starvation resistance + social morale buffer

**Idea:** In `MortalitySystem.deathThresholdFor()`, read `entity.traits` and extend `holdSec` by +10 s for workers with `hardy` or `resilient` (making them meaningfully harder to starve before the system gives up). In `WorkerAISystem.getWorkerHungerDecayPerSecond()` / wherever morale decay is applied, apply a −15 % morale decay rate for `social` workers when `worker.social > 0.6`. This is a small, localised change — no new systems, no new state fields, just a trait lookup inside two existing helper functions.

**Why:** The reviewer's benchmark for "personality affects gameplay" is RimWorld's `Brave` trait preventing retreat. The delta here is proportional: `hardy` workers are slightly harder to starve, which means a player watching two workers die in the same crisis will notice that the `hardy` one held on a few seconds longer. That's enough "narrative drag" to feel intentional. The data (`entity.traits`) is already on every worker; the function that needs it (`deathThresholdFor`) is a pure helper with no coupling surface.

**Cost:** Minimal. ~15 LOC in `MortalitySystem.js` + ~10 LOC in `WorkerAISystem.js`. One new regression test for the holdSec override. Risk: test `deathThresholdFor` is a private function — wrap in a named export or test via the public `MortalitySystem.update` integration path.

---

### Suggestion C — Emotional Monologue: inject grief/kinship prefix into Decision Context

**Idea:** In `EntityFocusPanel.js`, before writing the `lastIntentReason` string into the Decision Context block, check `worker.memory.recentEvents` for any `mem-obituary` or `mem-birth` class entries (using the same `classifyMemoryLine` helper already defined at line 527). If a grief entry is within the last 60 s (`parseFloat` the `[Xs]` prefix), prepend a short in-world emotional clause: `"Trying not to think about [name]. "` followed by the logistics reason. This is a UI-layer transform — no simulation impact.

**Why:** The reviewer explicitly said "it lacks emotional anchors." The memory data is already there. The gap is purely presentational: the EntityFocusPanel reads `memory.recentEvents` for the "Recent Memory" section but never touches it when building the Decision Context. A 5-line prefix injection closes that gap with no simulation cost.

**Cost:** Low. ~20 LOC in `EntityFocusPanel.js`. No new state fields. No simulation changes. Tests: one new snapshot test for the grief-prefix path in the entity-focus test file.

---

## 5. Selected Approach

Implement **all three suggestions** as a single coherent narrative pass:

- Suggestion A targets the reviewer's highest-priority pain ("death has no persistence") at near-zero risk.
- Suggestion B provides the behavior-expression fix that is the structural gap between the reviewer's 4.5/10 and a "personality matters" experience.
- Suggestion C closes the monologue gap with purely UI-layer work.

Together they address all three root problems (P1, P2, P3) without any architectural change, new systems, or simulation balance risk. The changes are additive and independently testable.

---

## 6. Implementation Steps

**Step 1 — Extend death notification persistence (HUDController.js)**
- Change `OBITUARY_FLASH_MS` constant from `8000` to `14000`.
- Change the `setTimeout` timer in `#pushDeathAlert` from `3500` to `8000`.
- No other changes to this file.

**Step 2 — Surface deathLog in EventPanel as "Memorial" block (EventPanel.js)**
- Add a "Memorial" `<details>` section below the existing event list in the `render()` method.
- Read `this.state.gameplay?.deathLog ?? []`, take the first 8 entries, render each with the `mem-obituary` CSS class using the existing escapeHtml pattern.
- Show "(no deaths yet)" when the array is empty.
- Add a red `data-new-death` attribute to the EventPanel tab button when `deathLog[0]` changed since last render, to give the player a visual cue. Clear the attribute on next render.

**Step 3 — Trait-aware starvation holdSec in MortalitySystem.js**
- In `deathThresholdFor(entity)`, after the existing `ENTITY_TYPE.WORKER` branch, add a traits lookup:
  - `hardy` or `resilient` in `entity.traits` → `holdSec += 10` (34 → 44).
  - `careful` in `entity.traits` → `holdSec -= 4` (34 → 30, careful workers are more fragile, fitting the trait's cautious-but-less-enduring character).
- Return the modified `holdSec`.
- This is a pure-function change; no state mutations.

**Step 4 — Social trait morale buffer in WorkerAISystem.js (or wherever morale decay runs)**
- Locate the morale decay application site (search `morale` writes in `WorkerAISystem.js` and `PopulationGrowthSystem.js`).
- For workers with `social` in `entity.traits` AND `entity.social > 0.6`, apply a `0.85` multiplier to the morale decay rate (15 % slower decay when socially fulfilled).
- Cap the multiplier so it never inverts the decay direction.

**Step 5 — Emotional prefix in EntityFocusPanel Decision Context (EntityFocusPanel.js)**
- In the function that renders the "Decision Context" block, after reading `worker.blackboard.lastIntentReason`, call `classifyMemoryLine` on each of the top-3 `memory.recentEvents`.
- If any entry classifies as `"mem-obituary"` AND its timestamp is within 120 sim-seconds of current time, prepend a grief clause to the displayed reason: `"Trying not to think about {name}. "` where `{name}` is extracted from the obituary line via a simple regex on the "died" pattern.
- Fall through silently (no prefix) if no recent grief is found, so the change is invisible for non-grieving workers.

**Step 6 — Tests**
- Add one test to `test/mortality-system.test.js` (or equivalent): verify `deathThresholdFor` returns `holdSec = 44` for a worker with `traits: ["hardy"]` and `holdSec = 30` for `traits: ["careful"]`.
- Add one test to `test/entity-focus-panel.test.js` (or equivalent): verify that a worker with a `mem-obituary` memory entry within 120 s gets a grief prefix in their Decision Context render output, and a worker with no grief memory gets no prefix.

---

## 7. Risks and Verification

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Extending `OBITUARY_FLASH_MS` to 14 000 ms may overlap with a second death, overwriting the first obituary text before the player reads it | Low | The existing logic at HUDController line 858 only advances the obituary when `deathsTotal > this._lastDeathsSeen` — it will not overwrite mid-display because `_lastDeathsSeen` is not incremented until the *next* render cycle. Verify with a multi-death benchmark run (Archipelago Isles, Island Relay). |
| `deathThresholdFor` is a private function with no direct test coverage | Medium | Test via `MortalitySystem.update()` integration path: create a mock worker with `traits: ["hardy"]`, drive hunger to threshold, confirm it survives 10 extra simulated seconds compared to a worker with no traits. This is the same pattern used in `test/role-assignment-cannibalise.test.js`. |
| Grief prefix in EntityFocusPanel may show stale memories if sim time is not accessible | Low | The `[Xs]` timestamp prefix is already on every memory entry (MortalitySystem line 170 writes `\`[\${time}s]\``). Read `state.metrics.timeSec` (already available in `EntityFocusPanel.render(this.state)`) and compute `age = timeSec - parseFloat(entry)`. The 120 s window is generous enough to survive any HUD lag. |
| Memorial block in EventPanel may show duplicate lines if `deathLog` and `objectiveLog` both contain the same death (they do — MortalitySystem writes both) | Low | The `deathLog` entries use the richer obituary format (`"Vail Thorn, crafting specialist, hardy temperament, died of starvation near harbor relay causeway"`) while `objectiveLog` uses the terse format. Deduplicate at render time by checking the first 20 chars of each string, or simply only render `deathLog` in the Memorial section and keep `objectiveLog` for the event list. |
| Social morale buffer may interfere with long-horizon benchmark CI thresholds | Low | The modifier is ≤15 % and only fires when `social > 0.6`. Benchmark presets do not specify exact morale trajectories — only DevIndex and death counts. Monitor `deathsTotal` in a temperate_plains 365-day run before committing Step 4. |

**Verification checklist for the Coder:**
1. Run `node --test test/*.test.js` — all 865 existing tests must pass.
2. New trait-holdSec tests added in Step 6 must pass.
3. New grief-prefix EntityFocusPanel test added in Step 6 must pass.
4. Manual smoke test: start Archipelago Isles / Island Relay, let 2–3 workers die of starvation; confirm (a) the toast persists ~8 s, (b) EventPanel Memorial shows the deceased names with backstory, (c) a surviving Close Friend of the deceased shows a grief prefix in their Decision Context within 120 s.
