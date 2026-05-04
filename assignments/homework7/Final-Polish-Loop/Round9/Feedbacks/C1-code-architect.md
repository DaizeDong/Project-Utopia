# C1 — Code Architect — Round 9 (light static, NO browser)

Persona: Code Architect. R8 base 5be7536, head e7fb158. 4 commits, +995/-22 LOC across 18 files.

## Grade distribution Δ vs R8

R8 baseline: 7A / 13B / 5C / 2D, 0 delta carries.
R9 standing: **7A / 14B / 4C / 2D** (net 1C → 1B; D unchanged).

- PS RoleAssignment force-bypass: **C → B**. Cooldown bypass is a clean predicate (`sitesUnclaimed = sitesArr.some(s => s && !s.builderId)`), passed through existing `setWorkerRole(..., { force })` API rather than a new patch path. No new state on the system; the gate is single-line and self-explanatory.
- PR drain budget: **B (new)**. `ensureDrainBudget` / `consumeDrainBudget` is a clean per-tick reset on `state._eventDrainBudgetTick = { tick, foodSpent, woodSpent }`, called identically from all 3 drain sites. No scattered logic — three call sites, two helpers, one tick-reset guard.
- PT `#maybeSpawnTierSaboteurs`: **B**. Private method, single responsibility, parametrised on 2 BALANCE knobs, early-returns on missing rng (matches `EnvironmentDirectorSystem` precedent). Clean reuse of `createVisitor` + `tileToWorld` — no mechanic invention.
- PU HUD honesty: **B**. `data-recovery="active"` attribute toggled symmetrically (set/remove), companion comment block explicitly documents why the freeze gate must NOT be extended. Banner text concatenation is plain string interpolation — no template proliferation.

## Top-3 debt

1. **`state._eventDrainBudgetTick` is an undocumented hidden field on `state`** (PR). Underscore prefix is the only contract; not declared in any state-shape doc, not persisted/reset on scenario reload. Low risk now, but if save/load ever round-trips raw `state` it'll leak. Recommend either move under `state.metrics.eventDrainBudget` or document in `src/world/state.js` shape comment.
2. **`state.gameplay._zombieSinceSec` ditto** (PS). Same pattern, same risk class. Two new underscored hidden fields in one round = drift.
3. **`builderTargetCount` / `constructionSitesCount` written in two places** (PS). RoleAssignmentSystem.js:453-454 (early-return branch) and :790-791 (main path) — duplicated 4-line block. Tiny, but the comment is also duplicated verbatim. Extract to `#writeBuilderTelemetry(state, targetBuilders, sitesCount)` in next pass.

## New debt from R8 commits

- Two new hidden underscore fields on `state` (items 1+2 above).
- 1 duplicated telemetry write block (item 3).
- `survivalScore` worker-clamp fallback uses `state.agents?.filter?.(...)` per-tick when `populationStats.workers` is missing — O(agents) scan inside a per-tick scoring path. Cheap today (<200 agents), but it's the kind of "fallback got promoted to hot path" trap. Low priority.
- PT saboteur spawn silently no-ops when `services.rng` is absent — matches existing precedent but means tier-6 raids in headless/CI scenarios produce zero saboteurs without warning. Acceptable; flagged for awareness.

No regressions to existing debt; no new global mutables; no new BALANCE knob proliferation beyond the 4 documented (`zombieWorldGraceSec`, `eventDrainBudgetFood/WoodPerSec`, `raidEscalatorTierSaboteurThreshold/Max`).

## D-tier status

**2D unchanged.** R8 added zero D-tier items. The four R8 commits all hit B-tier on first review — no architecture-class smells (no new globals, no new circular imports, no new direct DOM access in simulation, no new `eval`/dynamic-import). The `ensureDrainBudget` helper pair is the strongest piece of the round; the underscore-state-field pattern is the weakest but is contained.

Recommend R9 implementer touch only item 3 (extract `#writeBuilderTelemetry`) — items 1+2 are state-shape conversations better held with B1 / state-doc owner.
