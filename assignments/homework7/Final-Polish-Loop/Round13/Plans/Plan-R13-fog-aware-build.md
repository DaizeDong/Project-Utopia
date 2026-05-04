---
reviewer_id: Plan-R13-fog-aware-build (R13 user issues #5 + #7)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P0
track: code (AI/autopilot fog-respect + worker explore intent — combines two user issues)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 4
  loc_delta: ~80
  new_tests: 2
  wall_clock: 75
conflicts_with: [Plan-R13-autopilot-wait-llm]
---

# Plan-R13-fog-aware-build — AI/autopilot only places on explored tiles + workers wander fog edges to scout

**Plan ID:** Plan-R13-fog-aware-build
**Source feedback:** R13 user directive issues #5 + #7 (consolidated) — "(a) AI/autopilot can ONLY place buildings on explored (visible/non-fog) tiles. When all proposers' candidate tiles are fogged → emit 'scout-needed' intent. (b) Add WORKER_EXPLORE work intent — workers wander fog edges to reveal terrain. Extend IDLE behavior, NOT a new role."
**Track:** code
**Priority:** **P0** — Player reports the AI placing buildings on tiles it cannot see is breaking the world's spatial logic. Fog-of-war should constrain AI knowledge the same way it constrains the player. Pairing this with worker-driven exploration closes the loop: when AI is scout-blocked, idle workers automatically reveal the next zone.
**Freeze policy:** hard — no new role, no new FSM state. Extends existing IDLE state body with a fog-edge biased target. Adds a `state.ai.scoutNeeded` boolean that proposers and BuildAdvisor honor.
**Rollback anchor:** `527f460`
**Conflicts with:** `Plan-R13-autopilot-wait-llm` — both touch BuildAdvisor's evaluate path; coder must merge edits sequentially (this plan's fog-gate goes inside BuildAdvisor.evaluate; autopilot-wait-llm's gate goes ABOVE BuildAdvisor entry — they layer cleanly if applied in sequence).

---

## 1. Core problem (one paragraph)

`BuildAdvisor.js` and the proposer chain (`src/simulation/ai/colony/proposers/*.js`) iterate the entire `state.grid` to score candidate tiles, ignoring `state.fog.visibility[idx]` (which carries `FOG_STATE.HIDDEN | EXPLORED | VISIBLE` per tile). The AI thus places farms, lumber camps, quarries on tiles it has no business knowing about — visually breaking the fog-of-war contract from the player's perspective. Symmetrically, IDLE workers wander on a uniform-random target rather than biasing toward fog edges, so colony-edge fog rarely lifts. Both halves close one loop: gate proposers on visibility; when no candidate is visible, set `state.ai.scoutNeeded = true`; idle workers preferentially path to fog-edge tiles (unrevealed neighbours of revealed tiles).

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — fog gate in proposer.evaluate + IDLE fog-edge bias

(a) Add a small helper `isTileExplored(state, ix, iz)` that reads `state.fog.visibility` and returns true iff the tile is `EXPLORED` or `VISIBLE`. Wire it into each proposer's tile-scoring loop (early-continue if `!isTileExplored`). After all proposers run, if zero candidates emerged AND the colony has unexplored area, set `state.ai.scoutNeeded = true` (and a toast "Send a worker to scout — no buildable visible terrain").

(b) Extend the IDLE state body in the worker FSM (`src/simulation/npc/WorkerFSM.js` or wherever STATE_TRANSITIONS lives — search `IDLE` state body) to bias the wander target toward the nearest fog-edge tile when `state.ai.scoutNeeded === true` (or always with low weight). Algorithm: pick a random EXPLORED tile near the worker, find a HIDDEN neighbour, set as target. Falls back to current uniform-random wander if no fog edge in radius.

- Files: `src/simulation/construction/BuildAdvisor.js`, all `src/simulation/ai/colony/proposers/*.js` (~5 files), `src/simulation/npc/WorkerAISystem.js` (or wherever IDLE state body lives), `src/config/balance.js` (1 constant).
- Scope: ~80 LOC + 2 tests ~50 LOC.
- Expected gain: closes both halves of user issues #5 + #7 in one coordinated patch.
- Main risk: combinatorial — proposer fog gate might starve the AI of candidates on fresh maps where most tiles are HIDDEN. Mitigated by IDLE explore bias automatically lifting fog as workers wander.

### Suggestion B (in-freeze, half-fix) — only the proposer fog gate

Doesn't add explore behaviour; AI just freezes when fog covers all build sites. Bad UX.

### Suggestion C (FREEZE-VIOLATING) — add a dedicated SCOUT role

User directive explicitly says "NOT a new role". Out of bounds.

## 3. Selected approach

**Suggestion A** — both halves in one patch as the user directive scopes them together. Hard freeze respected (no new role, no new FSM state — IDLE body extended).

## 4. Plan steps

- [ ] **Step 1 — Add `isTileExplored(state, ix, iz)` helper.**
  Location: `src/simulation/world/VisibilitySystem.js` (export alongside the existing `worldToTile` consumer logic) OR a new tiny `src/simulation/world/visibility-helpers.js`. Returns:
  ```js
  export function isTileExplored(state, ix, iz) {
    const fog = state?.fog;
    if (!fog?.visibility) return true; // fog disabled → everything is "explored"
    const w = state.grid?.width ?? 0;
    const idx = ix + iz * w;
    if (idx < 0 || idx >= fog.visibility.length) return false;
    const v = fog.visibility[idx];
    return v === FOG_STATE.EXPLORED || v === FOG_STATE.VISIBLE;
  }
  ```
  - Type: add

- [ ] **Step 2 — Wire the gate into `BuildAdvisor.evaluate` and each proposer.**
  In each proposer file (`src/simulation/ai/colony/proposers/*.js`), at the top of the per-tile scoring loop, add:
  ```js
  if (!isTileExplored(state, ix, iz)) continue;
  ```
  At end of `BuildAdvisor.evaluate` (or wherever proposer results are aggregated), if `aggregatedCandidates.length === 0` AND any HIDDEN tile exists in the grid, set `state.ai.scoutNeeded = true` and `state.ai.scoutNeededReason = "no-buildable-visible-terrain"`. Otherwise clear the flag.
  - Type: edit (multiple files)
  - depends_on: Step 1

- [ ] **Step 3 — Add `BALANCE.workerExploreFogEdgeBiasWeight = 0.6`.**
  Controls how strongly IDLE workers prefer fog-edge tiles vs uniform-random wander.
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Extend IDLE state body to bias toward fog edges.**
  Locate IDLE state body in `src/simulation/npc/WorkerAISystem.js` (or the FSM dispatcher for IDLE). When picking a wander target:
  ```js
  // R13 #5+#7 fog-edge explore bias
  const wantExplore = state.ai?.scoutNeeded === true || rng() < (BALANCE.workerExploreFogEdgeBiasWeight ?? 0.6);
  let target;
  if (wantExplore) {
    target = pickFogEdgeTileNear(state, worker, services.rng);
  }
  if (!target) {
    target = pickRandomWanderTile(state, worker, services.rng); // existing fallback
  }
  ```
  Implement `pickFogEdgeTileNear(state, worker, rng)`: scan a Manhattan radius (e.g. 12) around the worker, collect EXPLORED tiles that have ≥1 HIDDEN 4-neighbour, pick one randomly. Returns null if none.
  - Type: edit
  - depends_on: Step 3

- [ ] **Step 5 — Emit a one-shot toast "Send a worker to scout" when `scoutNeeded` first goes true.**
  In `BuildAdvisor.evaluate` after Step 2's flag set:
  ```js
  if (newScoutNeeded && !state.__lastScoutNeededWarn) {
    state.__lastScoutNeededWarn = state.metrics.timeSec;
    pushToast(state, "Send a worker to scout — no buildable visible terrain", "warning", { dedupKey: "scout-needed" });
  }
  ```
  Auto-clear `__lastScoutNeededWarn` 60s after `scoutNeeded` clears.
  - Type: edit
  - depends_on: Step 4

- [ ] **Step 6 — Add unit test `test/build-advisor-fog-gate.test.js` (~30 LOC).**
  Test cases:
  1. With fog disabled (BALANCE.fogEnabled=false) → proposer behaves as before, no flag set.
  2. With fog enabled + colony spawn at center + grid edges all HIDDEN → proposer skips edge tiles; `scoutNeeded` true if no buildable visible.
  3. After visibility expands to cover a viable farm tile → `scoutNeeded` flips to false, proposer returns the candidate.
  - Type: add
  - depends_on: Step 5

- [ ] **Step 7 — Add unit test `test/worker-idle-fog-edge.test.js` (~25 LOC).**
  Test cases:
  1. Worker in fully-revealed area → `pickFogEdgeTileNear` returns null → falls back to uniform wander.
  2. Worker near fog edge → `pickFogEdgeTileNear` returns one of the EXPLORED-with-HIDDEN-neighbour tiles.
  3. With `scoutNeeded=true`, IDLE always tries fog edge first.
  - Type: add
  - depends_on: Step 6

- [ ] **Step 8 — CHANGELOG.md entry.**
  *"R13 #5+#7 Plan-R13-fog-aware-build (P0): AI/autopilot proposers now skip fogged candidate tiles (`isTileExplored` gate). When no buildable visible terrain exists, sets `state.ai.scoutNeeded` + emits one-shot toast. IDLE workers extend behavior to bias toward fog-edge tiles (BALANCE.workerExploreFogEdgeBiasWeight=0.6) to lift fog organically. No new role, no new FSM state."*
  - Type: edit
  - depends_on: Step 7

## 5. Risks

- **Conflicts with `Plan-R13-autopilot-wait-llm`** — both edit BuildAdvisor's entry/evaluate path. Merge order: apply autopilot-wait-llm's "wait for first plan" gate ABOVE BuildAdvisor entry, then apply this plan's fog gate INSIDE evaluate per-candidate. They compose cleanly.
- **Fresh-map starvation** — colony spawn area must be large enough that at least 1 farm + 1 lumber tile is visible at boot (`fogInitialRevealRadius=4` gives ~81 visible tiles). If smaller maps fail, bump initial radius via existing BALANCE tunable.
- **IDLE explore bias may pull workers away from urgent jobs** — IDLE state only fires when no priority-1..4 transition matches, so this is by design (idle = no work). Verify in Step 7.
- **Possible affected tests:** `test/build-advisor*.test.js`, `test/proposer*.test.js`, `test/worker-fsm*.test.js`, `test/idle*.test.js`, long-horizon DevIndex bench.

## 6. Verification

- **New unit tests:** `test/build-advisor-fog-gate.test.js`, `test/worker-idle-fog-edge.test.js` (Steps 6,7).
- **Manual:** dev server, fresh map, pause AI, scroll to map edge → confirm fog covers most tiles. Resume AI → no buildings appear in fogged areas. After ~2 minutes of worker IDLE wandering, observe fog has lifted around colony perimeter.
- **Bench:** long-horizon DevIndex must not regress >5%. Earlier exploration may slightly improve it.

## 7. UNREPRODUCIBLE marker

N/A — design directive (visible misbehaviour in current build per user feedback).

---

## Acceptance criteria

1. No proposer ever returns a candidate tile that is `FOG_STATE.HIDDEN`.
2. `state.ai.scoutNeeded` flips true within 1 tick of zero-visible-candidates and false within 1 tick of any visible candidate appearing.
3. IDLE workers visibly bias toward fog edges (observable in 2-min playthrough).
4. Toast "Send a worker to scout" emits exactly once per scoutNeeded cycle (deduped).
5. Test baseline 1646 / 0 fail / 2 skip preserved + 2 new tests pass.
6. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/simulation/construction/BuildAdvisor.js src/simulation/ai/colony/proposers/ src/simulation/npc/WorkerAISystem.js src/simulation/world/VisibilitySystem.js src/config/balance.js && rm test/build-advisor-fog-gate.test.js test/worker-idle-fog-edge.test.js
```
