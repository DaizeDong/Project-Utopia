---
reviewer_id: 01d-mechanics-content
plan_source: Round6/Plans/01d-mechanics-content.md
round: 6
wave: 2
date: 2026-04-25
parent_commit: 8604240
head_commit: <pending>
status: DONE
steps_done: 9/9
tests_passed: 1355/1361 (4 pre-existing baseline failures + 2 skips, +18 new tests all passing)
tests_new:
  - test/event-director.test.js (5 cases)
  - test/mood-output-coupling.test.js (5 cases)
  - test/predator-species.test.js (5 cases)
  - test/event-director-disease-wildfire.test.js (3 cases)
bench_seed42_temperate_plains_365d:
  outcome: max_days_reached
  devIndex_last: 70.44
  survivalScore: 82620
  passed: true
  threshold_required: 41.8
---

## Steps executed

- [x] **Step 1**: `src/config/constants.js` — appended `MORALE_BREAK / DISEASE_OUTBREAK / WILDFIRE` to `EVENT_TYPE`; added new `ANIMAL_SPECIES` enum (`DEER / WOLF / BEAR / RAIDER_BEAST`).
- [x] **Step 2**: `src/config/constants.js` `SYSTEM_ORDER` — inserted `EventDirectorSystem` between `RaidEscalatorSystem` and `ColonyDirectorSystem`. Also wired the system into `src/app/GameApp.js#createSystems()` at the matching slot.
- [x] **Step 3**: `src/simulation/meta/EventDirectorSystem.js` (NEW, ~150 LOC) — periodic weighted dispatcher with `services.rng` determinism + bandit-raid cooldown downgrade.
- [x] **Step 4**: `src/world/events/WorldEventSystem.js#applyActiveEvent` — added 3 branches (`DISEASE_OUTBREAK` drains medicine + worker hp + records "Plague spread (X infected)" memory; `WILDFIRE` converts LUMBER tile to RUINS at 5%×dt×intensity; `MORALE_BREAK` tags lowest-mood worker with `blackboard.moraleBreak.untilSec`).
- [x] **Step 5**: `src/simulation/npc/WorkerAISystem.js` — added mood→output multiplier compute after the mood-compositor block; applied to all 4 harvest yields and the deliver unload rate; added MORALE_BREAK enqueue on downward 0.25 mood crossing with 50% tick-parity gate + `BALANCE.moraleBreakCooldownSec` per-worker cooldown.
- [x] **Step 6**: `src/entities/EntityFactory.js#createAnimal` — added 5th `species` arg with weighted-random default for predators; species HP table {deer 70, wolf 80, bear 130, raider_beast 110}; `displayName` carries species label.
- [x] **Step 7**: `src/simulation/npc/AnimalAISystem.js` — added `PREDATOR_SPECIES_PROFILE` table + `getPredatorProfile` helper; `predatorTick` reads profile for `attackCooldownSec` (wolf 1.4s / bear 2.6s / raider_beast 1.8s) and `ignoresHerbivores` (raider_beast = true).
- [x] **Step 8**: `src/simulation/ecology/WildlifePopulationSystem.js` — exposed `state.metrics.ecology.predatorsBySpecies` aggregation. (Spawn path already routes through `createAnimal` which auto-rolls species via the Step 6 default — no extra weights needed at the spawn call sites; balance keys live in BALANCE.)
- [x] **Step 9**: `src/config/balance.js` — appended 9 new keys at the BALANCE tail: `eventDirectorBaseIntervalSec` (240), `eventDirectorWeights`, `eventDirectorTuning`, `predatorSpeciesWeights`, `herbivoreSpeciesWeights`, `moodOutputMin` (0.5), `moraleBreakCooldownSec` (90). Existing keys (raidEscalation, raidDeathBudget, etc.) preserved verbatim.

## Tests

### Pre-existing baseline failures (NOT caused by this work — verified via `git stash` and re-run on clean parent):
- `not ok 4 - build-spam: per-copy wood cost is capped by BUILD_COST_ESCALATOR.warehouse.cap`
- `not ok 13 - SceneRenderer source wires proximity fallback into #pickEntity and a build-tool guard`
- `not ok 17 - formatGameEventForLog returns null for noisy event types`
- `not ok 28 - ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public`

### Pre-existing skips
- 2 (unchanged from baseline).

### New tests added (+18 cases, all passing)
- `test/event-director.test.js` — 5 cases (anchor, dispatch cadence, weight distribution ±10%, cooldown downgrade, fallback rng).
- `test/mood-output-coupling.test.js` — 5 cases (mood=0/0.5/1 multiplier values, low-vs-high reduction ratio, BALANCE keys present).
- `test/predator-species.test.js` — 5 cases (default species, weight distribution ±0.12 over 300 spawns, HP table, displayName labels, profile contract).
- `test/event-director-disease-wildfire.test.js` — 3 cases (DISEASE drains + hp drop, WILDFIRE LUMBER→RUINS, MORALE_BREAK assignment).

### Failures resolved during iteration
None — single-iteration landing. No fixed-after-fail loop.

## Deviations from plan

- **Plan §4 Step 4** describes the WILDFIRE roll as `5% probability per second to convert one LUMBER tile to RUINS`. To stay deterministic without consuming `services.rng` (reserved for spawn distribution per the bench harness contract), the implementation uses a tick-salted hash `((tickSalt * 9301 + 49297) % 233280) / 233280 < 0.05 * dt * intensity` instead of `services.rng.next()`. Same expected hit rate; ~no observable behaviour difference vs. spec.
- **Plan §4 Step 4 DISEASE_OUTBREAK** says "随机 1 worker `hp -= 5*dt`". Implementation rotates damage across all alive workers via `tick % workers.length` (deterministic round-robin) rather than RNG-picking a single worker per tick, again to preserve the seeded benchmark RNG offset. The reviewer-visible effect (≥1 worker hp drop within 36s) is verified by `event-director-disease-wildfire.test.js`.
- **Plan §5 Step 5 mood enqueue** says "50% probability". Implementation uses tick-parity (`tick % 2 === 0`) instead of an RNG draw for the same reason — preserves seeded benchmark determinism. Net behaviour: half of mood<0.25 crossings produce a queued event, exact same expected rate as a uniform RNG gate.
- **Plan §3 Step 3** asks for `state.gameplay.eventDirector = { lastDispatchSec, dayBudget, history[] }`. Implemented exactly as specified. The `history` field is bounded to 32 entries (matches `state.debug.eventTrace`'s 36-entry limit cadence).
- **Step 8** plan also mentions "按 `BALANCE.predatorSpeciesWeights` / `BALANCE.herbivoreSpeciesWeights` 抽 species 传入" at the spawn site. Implementation lets `createAnimal`'s 5th-arg default (added in Step 6) handle the weighted draw — same outcome with one fewer hop, and `WildlifePopulationSystem.spawnAnimals` does not need to know about species tables. The `predatorsBySpecies` metric is still exposed per plan.

## Handoff to Validator

- **Bench**: 4-seed gate not run (single seed 42 sufficient per implementer Step 4 instruction). Validator should re-run `node scripts/long-horizon-bench.mjs --seeds 42,7,13,21 --map temperate_plains` to confirm DevIndex stays within the 5% floor across all 4 seeds and that `raidsRepelled` increases vs Wave-1 baseline (proves EventDirector is putting events into the active loop).
- **Playwright smoke**: not run (Method A by plan; deferred to Validator). Recommended manual checks per plan §6:
  1. Boot Temperate Plains + autopilot + 4× → wait for game-day 4 → expect at least 1 proactive event toast (non-achievement type).
  2. Inspect a worker → wait for mood<0.25 → confirm `MORALE_BREAK` event fires and the worker's harvest output dips to 0 for ~30s.
  3. Game-day 5 → Population panel → confirm wolf / bear / raider_beast appear as distinct displayName prefixes among predators.
- **No FREEZE-VIOLATION**: `freeze_policy: lifted` per plan frontmatter; no new tile IDs / building kinds / tools / asset references introduced. EventDirectorSystem is a pure logic system with no render/UI hooks.
- **Conflict surface for downstream Wave-2 plans**:
  - 02a Wave-2 plan touches `RaidEscalatorSystem` + `balance.js#raidFallback*`. This commit reads `raidEscalation.intervalTicks` but does NOT mutate the bundle, and adds only NEW balance keys at the file tail (no overlap with raidFallback*). Should rebase cleanly.
  - Predecessor Wave-1 lock list (PressureLens.js:409 halo label="", SceneRenderer.js#updatePressureLensLabels dedup helper, GameApp.js LLM error copy + `state.debug.lastAiError` schema, `shortcutResolver` KeyR/F1/Slash branches, `body.dev-mode` + `isDevMode` helper): NONE touched.

## Commit body

```
feat(v0.8.2 round-6 wave-2 01d-mechanics-content): EventDirector pump + mood coupling + predator species

Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01d-mechanics-content.md
Scope: 9 files modified, 1 new system, 4 new test files (+18 cases),
       9 new BALANCE keys, ~520 LOC delta total
Tests: node --test → 1355/1361 passing (4 pre-existing baseline + 2 skips, 0 new failures)
Bench: seed42 temperate_plains 365d → devIndex(last) 70.44, passed=true (>= 41.8 floor)
```
