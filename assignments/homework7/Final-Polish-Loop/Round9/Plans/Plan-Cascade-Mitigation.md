---
reviewer_id: Plan-Cascade-Mitigation
feedback_source: Round9/Feedbacks/PV-sudden-death-cascade.md
round: 9
date: 2026-05-01
build_commit: e7fb158
track: code
priority: P0
freeze_policy: hard
rollback_anchor: e7fb158
estimated_scope:
  files_touched: 4
  loc_delta: ~80
  new_tests: 1
  wall_clock: 60
conflicts_with: []   # PV touches HUD chip + MortalitySystem + GameApp; no overlap with the other R9 plans
---

## 1. 核心问题

PV's reproduction is rock-solid: the "前1s 一片大好然后全部饿死"
report is **not** a regression of R8 PS/PR/PT (all three were verified
NOT involved). The structural failure is a **synchronised
starvation pipeline + silent HUD warning window**, breaking down to:

1. **HUD silent through the warning window.** Between food=20 and
   food=0 (~50 sim-sec ≈ 6 wall-sec at 8× speed) the player has zero
   actionable signal. A stale "colony breathes again" recovery toast
   from `src/simulation/meta/ProgressionSystem.js:629` actively
   reassures the player while the cliff arms. PV §3c.
2. **Per-worker `starvationSec` synchronises.** Every worker hits
   `current > reachabilityRefreshThreshold` at almost the same
   wall-second when the global food pool empties, so
   `entity.starvationSec = 0` resets in lockstep
   (`src/simulation/lifecycle/MortalitySystem.js:534-535`); from
   that moment all N workers tick `starvationSec += dt` in unison
   (line 552) and cross `holdSec` together → 12 deaths in 25 sim-sec.
   PV §3a.
3. **Recovery toast fires AT the cascade.** `maybeTriggerRecovery`
   (`ProgressionSystem.js:586-630`) emits "The colony breathes
   again" when its charge gate trips, even when the very next tick
   is the death cascade. False reassurance moments before mass
   death is the worst possible UX. PV §3c.
4. **Post-mortem chronicle has no famine entry.** PV §5.3:
   `evaluateRunOutcome` produces "Run ended: the colony was wiped
   out" with no narrative explanation. Players don't learn why.

## 2. Suggestions

### 方向 A: Four-prong cliff softening (HUD chip + per-worker phase + toast suppression + chronicle) — **PICKED**
- 思路: Add an actionable food-runway HUD warning chip; phase-offset
  per-worker `starvationSec` by `id-hash mod ±10s` so the cliff
  stretches from 25 sim-sec to ~50 sim-sec; suppress the recovery
  "breathes again" toast when the colony is actually 20 sec from
  cascade; emit a `famine` chronicle entry from `evaluateRunOutcome`
  when wipe is starvation-driven.
- 涉及文件:
  `src/ui/hud/HUDController.js`,
  `src/simulation/lifecycle/MortalitySystem.js`,
  `src/simulation/meta/ProgressionSystem.js`,
  `src/app/GameApp.js`,
  new `test/r9-cascade-mitigation.test.js`.
- scope: 中 (~80 LOC across 4 files; pure delta to existing surfaces, no
  new HUD panel — extends the existing chip family per
  `HUDController.js:88-113`).
- 预期收益: Player sees the cliff coming with ≥30 s warning; cascade
  width doubles, restoring a meaningful save-window; chronicle
  records the actual cause.
- 主要风险: HUD chip lives in the existing `chips` array on
  `HUDController.js` (no new panel introduced — preserves freeze).
  Per-worker phase offset is a one-time write per worker on first
  lethal-hunger entry; deterministic via worker id hash. Recovery
  toast suppression is a single `if` guard on the existing emission
  path.

### 方向 B: HUD chip only (defer the cliff width fix and the chronicle entry)
- 思路: Just add the food-runway chip; don't touch MortalitySystem.
- 涉及文件: `src/ui/hud/HUDController.js` only.
- scope: 小
- 预期收益: Closes the "silent HUD" symptom. Player gets a warning
  but the cliff is still 25 sim-sec wide once it triggers.
- 主要风险: PV §4 explicitly identifies the synchronised-cliff
  mechanic as the **secondary** failure that makes the cliff
  inhumane even with warning. 方向 B leaves the cliff at 25 sim-sec
  even with foreknowledge — player gets warning but still loses 12
  workers. Insufficient on its own.

### 方向 C: BALANCE-only — `colonistDeathBufferSec=30` (RimWorld-style)
- 思路: Per PV §5.5 — make `MortalitySystem.shouldStarve` treat
  `starvationSec` as accumulator with a buffer below which death is
  suppressed.
- 涉及文件: `src/config/balance.js`,
  `src/simulation/lifecycle/MortalitySystem.js:559`.
- scope: 小-中
- 预期收益: Direct cliff suppression via numeric tuning.
- 主要风险: Globally widens the death window — likely regresses the
  `mortality-system-*` test family; requires benchmark validation per
  PV §5. Heavier risk surface than 方向 A's per-worker phase offset.
  Hold for v0.10.3 once the cliff window data is in.

## 3. 选定方案

**方向 A.** All four sub-fixes are independent and testable; together
they close PV §3a + §3c + §5 with the smallest blast radius. The
HUD chip explicitly extends the existing `chips` array — NOT a new
HUD panel — preserving HW7 hard freeze. Per-worker phase offset is
a deterministic id-hash, no new RNG path. Toast suppression is a
single `if` guard. Famine chronicle reuses the existing
`reason` string field on the outcome object.

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/hud/HUDController.js` — `edit` near the
      existing `chips` builder around `:88-113` — add a new entry
      in the chip array:
      ```
      const foodHeadroom = Number(state?.metrics?.foodHeadroomSec ?? Infinity);
      const workersAlive = Number(state?.populationStats?.workers ?? 0);
      if (Number.isFinite(foodHeadroom) && workersAlive >= 1) {
        if (foodHeadroom < 15) {
          chips.push({ key: "foodRunway", icon: "⚠", text: `${foodHeadroom.toFixed(0)}s`, severity: "error", title: `Food runway critical (<15s)` });
        } else if (foodHeadroom < 30) {
          chips.push({ key: "foodRunway", icon: "⚠", text: `${foodHeadroom.toFixed(0)}s`, severity: "warning", title: `Food runway low (<30s)` });
        }
      }
      ```
      No new chip component — uses the existing chip render path.
      depends_on: none.

- [ ] **Step 2**: `src/simulation/lifecycle/MortalitySystem.js:534-535` — `edit` —
      replace `entity.starvationSec = 0;` (line 535) with a
      phase-offset assignment:
      ```
      // PV R9 — desync the starvation cliff. Hash worker.id to a
      // ±10s phase offset so 12 workers don't all cross holdSec in
      // the same 25 sim-sec window. id-hash is deterministic; no
      // RNG state mutation.
      const idHash = (() => {
        const id = String(entity.id ?? "");
        let h = 0;
        for (let i = 0; i < id.length; i += 1) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
        return h;
      })();
      const phaseOffset = ((idHash % 21) - 10);  // -10 .. +10 sim-sec
      entity.starvationSec = phaseOffset;
      ```
      depends_on: none.

- [ ] **Step 3**: `src/simulation/meta/ProgressionSystem.js:586-630` — `edit` —
      before `state.controls.actionMessage = "The colony breathes again..."`
      (line 629), guard:
      ```
      const headroomNow = Number(state.metrics?.foodHeadroomSec ?? Infinity);
      const cascadeArming = Number.isFinite(headroomNow) && headroomNow < 20;
      if (!cascadeArming) {
        state.controls.actionMessage = "The colony breathes again. Rebuild your routes before the next wave.";
        state.controls.actionKind = "success";
      } else {
        // PV R9 §3c — suppress the false reassurance toast when the
        // cliff is already armed. logObjective still records the
        // mechanical relief above.
      }
      ```
      Note: leave `logObjective(state, …)` (line 628) intact — the
      objective log entry is fine; only the top-of-HUD reassurance
      toast is suppressed. depends_on: none.

- [ ] **Step 4**: `src/app/GameApp.js:#evaluateRunOutcome` (around
      `:2543-2570`) — `edit` —
      after the existing wipe-detection branch
      (the line containing `Colony wiped — no surviving colonists`),
      detect starvation-driven wipe and prepend a famine chronicle entry.
      Concretely: read `state.metrics.deathsByReason?.starvation ?? 0`
      and `state.metrics.deathsTotal`; if `starvationDeaths >=
      0.5 * deathsTotal` AND `deathsTotal >= 1`, push
      `"Famine — every colonist hungry, no reserves."` into
      `state.gameplay.objectiveLog` via the same pattern used by
      `logObjective` (`ProgressionSystem.js:543-547`).
      depends_on: none.

- [ ] **Step 5**: `test/r9-cascade-mitigation.test.js` — `add` —
      invariants:
      1. HUD chip path: state with `foodHeadroomSec=12, workers=5`
         → chips array contains `{ key: "foodRunway", severity: "error" }`.
      2. HUD chip path: `foodHeadroomSec=25, workers=5` → chips
         contains `severity: "warning"` chip.
      3. HUD chip path: `foodHeadroomSec=120, workers=5` → no chip.
      4. MortalitySystem: 12 workers w/ deterministic id "w_01".."w_12"
         all hit lethal hunger same tick → spread of `starvationSec`
         after `shouldStarve` ≥ 18 sim-sec across the population.
      5. Recovery toast: `maybeTriggerRecovery` with
         `foodHeadroomSec=10` → does NOT overwrite
         `state.controls.actionMessage` to "breathes again" but
         still consumes the recovery charge + logs objective.
      6. Outcome: `evaluateRunOutcomeState` invocation with
         `deathsByReason.starvation=8, deathsTotal=10` → new famine
         entry appears in `state.gameplay.objectiveLog`.
      depends_on: Steps 1, 2, 3, 4.

- [ ] **Step 6**: `CHANGELOG.md` — `add` — `[Unreleased] — v0.10.2-r9-cascade-mitigation`
      block citing PV with per-step changelog.
      depends_on: all source steps.

## 5. Risks

- **R1 (chip overflow)**: existing R7-hotfix priority-overflow chip
  hider (`HUDController.js:315`) hides chips in priority order
  when bar overflows. Add `foodRunway` ABOVE all decorative chips in
  the priority list so it survives overflow at narrow widths.
- **R2 (id-hash determinism)**: deterministic per worker.id. Tests
  using fixed ids (`w_01`...`w_12`) will see the spread; tests using
  random ids may need a seed pin. Use `String(entity.id)` so undef
  → "" → hash 0 → no phase shift, preserving baseline behaviour for
  no-id entities (visitors).
- **R3 (toast suppression hides recovery effect)**: only the
  top-bar `actionMessage` is suppressed; `logObjective` still
  records the +food, +wood, threat-relief deltas. Player still
  sees the resources tick up — just doesn't see the misleading
  "breathes again" reassurance.
- **R4 (famine entry double-fire)**: `evaluateRunOutcome` runs
  per-tick during phase=end. Use `state.gameplay.objectiveLog[0]`
  prefix check (`startsWith("[…s] Famine")`) to dedupe so the
  entry doesn't multiply.
- **可能影响的现有测试**:
  `test/mortality-system-*.test.js` (Step 2 starvationSec init);
  `test/progression-system-*.test.js` (Step 3 toast text);
  `test/run-outcome-*.test.js` (Step 4 chronicle).
  Re-run before commit.

## 6. 验证方式

- 新增测试: `test/r9-cascade-mitigation.test.js` — 6 invariants per
  Step 5.
- 手动验证: `npx vite` → start Temperate Plains seed 56786007 →
  follow PV's Path B (4000 × stepSimulation(0.5)) → observe HUD
  chip flips amber at t≈601 (food=6.6) → observe death cliff
  spreads from t=651..t=695 instead of t=651..t=666; observe
  no "breathes again" toast at the cliff arming moment.
- benchmark 回归: 1936/1933 pass baseline must stay ≥1933 pass /
  0 fail.
- Freeze gate: `git diff --stat e7fb158..HEAD` must show exactly 4
  source files + 1 test + 1 changelog. No new HUD panel (chip is
  added to an existing array — verify by reading
  `HUDController.js:88-113` for the existing chips builder).

## 7. UNREPRODUCIBLE 标记

不适用. PV provides deterministic Path A (devStressSpawn) and Path B
(pure organic) reproductions. Both converge on the same outcome.
