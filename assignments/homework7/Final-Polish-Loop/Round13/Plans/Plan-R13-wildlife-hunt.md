---
reviewer_id: Plan-R13-wildlife-hunt (R13 user issue #8)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P1
track: code (wildlife — spawn freq + species variety + hunt food reward)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 3
  loc_delta: ~60
  new_tests: 1
  wall_clock: 40
conflicts_with: []
---

# Plan-R13-wildlife-hunt — Increase wildlife spawn freq + variety; worker hunt drops food reward

**Plan ID:** Plan-R13-wildlife-hunt
**Source feedback:** R13 user directive issue #8 — "(a) Increase wildlife spawn frequency (wildlifeSpawnIntervalSec halved or similar). (b) Add 1-2 more wildlife species variety (use existing animal types — DON'T add new role/mechanic; just spawn more variety from existing pool). (c) Worker hunts predator/wildlife → add reward (food drop on wildlife death; recordResourceFlow food/produced; existing carry already has food)."
**Track:** code
**Priority:** **P1** — wildlife is currently passive scenery; halving spawn interval + 1 extra species + food reward on hunt closes the loop and gives worker combat actions positive economic feedback.
**Freeze policy:** hard — uses existing wildlife pool ({wolf, bear, raider_beast} per `WildlifePopulationSystem.js:490`). No new species code, no new role; just enables existing species to spawn more often / at lower thresholds.
**Rollback anchor:** `527f460`

---

## 1. Core problem (one paragraph)

`WildlifePopulationSystem.js` populates `predatorsBySpecies = { wolf: 0, bear: 0, raider_beast: 0 }` (line 490) but spawn rotation in practice biases heavily toward `wolf`. The spawn interval (likely `BALANCE.wildlifeSpawnIntervalSec` or per-zone) is too long for the player to feel an active ecosystem. And when a worker kills a predator (existing combat code path), no food drop occurs — the kill is purely a defensive action with no economic upside, so workers rarely hunt opportunistically. Per directive: (a) halve spawn interval; (b) round-robin species to ensure bear and raider_beast also appear; (c) drop ~3-5 food on wildlife death, attribute via `recordResourceFlow`.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — three-part patch

(a) Halve `BALANCE.wildlifeSpawnIntervalSec` (or whichever interval governs spawn cadence — audit). Add `BALANCE.wildlifeSpawnIntervalMult = 0.5` for a knob, or just edit the base constant.

(b) In `spawnAnimals` (line 186), when picking species, round-robin across `["wolf", "bear", "raider_beast"]` weighted by an inverse-frequency table (the species with the smallest live count gets first pick). Optionally also add deer/rabbit if those are in any existing pool — audit but don't add NEW species.

(c) In the death handler (search "predationDeaths" / `recordKill`), when `agent.alive = false` AND `agent.species` is a wildlife species, deposit `BALANCE.wildlifeHuntFoodReward = 4` food into the colony stockpile (or onto the killer's carry up to capacity, then overflow to nearest warehouse). Call `recordResourceFlow(state, 'food', 'produced', 'wildlife-hunt', amount)`.

- Files: `src/config/balance.js` (3 constants), `src/simulation/ecology/WildlifePopulationSystem.js` (spawn rotation), wherever wildlife death is handled (likely `WildlifeBehaviorSystem` or `CombatSystem` — audit during Step 1).
- Scope: ~60 LOC + 1 test ~25 LOC.
- Expected gain: closes all three sub-issues of user directive #8.
- Main risk: faster spawn could overwhelm new colonies; mitigated by existing zone leash radius and species cap.

### Suggestion B (in-freeze, MINIMAL) — only food drop on hunt

Doesn't address spawn frequency / species variety. Skip.

### Suggestion C (FREEZE-VIOLATING) — add fishing pond / new prey species

User directive explicitly says no new species. Out of bounds.

## 3. Selected approach

**Suggestion A** — three small patches mirror the three sub-issues.

## 4. Plan steps

- [ ] **Step 1 — Audit existing wildlife code paths.**
  Grep `wildlifeSpawnInterval`, `predationDeaths`, `recordKill`, `attackedBy`, `wildlife.*alive`. Document the spawn cadence constant and the death handler call site.
  - Type: read

- [ ] **Step 2 — Add 3 BALANCE constants.**
  ```js
  wildlifeSpawnIntervalMult: 0.5,        // multiply existing spawn interval (0.5 = 2× faster)
  wildlifeSpeciesRoundRobin: true,       // enable inverse-frequency species pick
  wildlifeHuntFoodReward: 4,             // food units dropped per kill
  ```
  - Type: edit

- [ ] **Step 3 — Apply spawn interval multiplier in `WildlifePopulationSystem.js`.**
  Where the spawn interval is read (audit Step 1 — likely a `nextSpawnSec - currentSec` check), wrap:
  ```js
  const interval = baseSpawnIntervalSec * Number(BALANCE.wildlifeSpawnIntervalMult ?? 1);
  ```
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Implement species round-robin in `spawnAnimals`.**
  Replace existing species pick with:
  ```js
  if (BALANCE.wildlifeSpeciesRoundRobin) {
    const candidates = ["wolf", "bear", "raider_beast"];
    candidates.sort((a, b) => (predatorsBySpecies[a] ?? 0) - (predatorsBySpecies[b] ?? 0));
    species = candidates[0]; // pick least-represented
  }
  ```
  Refresh `predatorsBySpecies` once per tick (already computed at line 487).
  - Type: edit
  - depends_on: Step 3

- [ ] **Step 5 — Hook food drop into wildlife death handler.**
  At the death handler (audit Step 1; e.g. `WildlifeBehaviorSystem.handleDeath` or `CombatSystem.applyKill`), when killed entity is wildlife AND killed by a worker (not natural starvation):
  ```js
  if (deadAgent.kind === "wildlife" && killer && killer.kind === "worker") {
    const reward = Number(BALANCE.wildlifeHuntFoodReward ?? 4);
    const carryCap = killer.carryCap ?? 10;
    const carryFood = killer.carry?.food ?? 0;
    const intoCarry = Math.min(reward, carryCap - carryFood);
    const overflow = reward - intoCarry;
    if (intoCarry > 0) killer.carry.food = (killer.carry.food ?? 0) + intoCarry;
    if (overflow > 0) state.resources.food = (state.resources.food ?? 0) + overflow;
    recordResourceFlow(state, "food", "produced", "wildlife-hunt", reward);
  }
  ```
  - Type: edit
  - depends_on: Step 4

- [ ] **Step 6 — Unit test `test/wildlife-hunt-reward.test.js` (~30 LOC).**
  Test cases:
  1. Spawn interval mult halves the wait between spawns vs baseline.
  2. After 5 spawns with round-robin enabled, all 3 species appear at least once.
  3. Worker kills a wolf → carry.food += 4 (or stockpile += 4 if carry full); recordResourceFlow called with ('food', 'produced', 'wildlife-hunt', 4).
  4. Predator killed by another predator (no worker) → no food drop.
  - Type: add
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry.**
  *"R13 #8 Plan-R13-wildlife-hunt (P1): wildlife spawn interval halved (BALANCE.wildlifeSpawnIntervalMult=0.5); species pick now round-robins across wolf/bear/raider_beast inverse-frequency (BALANCE.wildlifeSpeciesRoundRobin=true); worker hunt drops 4 food (BALANCE.wildlifeHuntFoodReward=4) recorded as 'food / produced / wildlife-hunt'."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Faster spawn could overwhelm fragile early colonies.** Mitigated by existing zone leash radius + species cap. If long-horizon DevIndex regresses >5%, pull the mult to 0.7.
- **Round-robin may starve `raider_beast`** if its existing spawn condition (e.g. raid escalator tier ≥3) gates it independently. Verify in Step 4.
- **Food drop could exploit-loop** if workers spawn-camp wildlife zones. Audit existing wildlife respawn cooldown — should already cap.
- **Possible affected tests:** `test/wildlife-population*.test.js`, `test/wildlife-behavior*.test.js`, `test/exploit-regression*.test.js`.

## 6. Verification

- **New unit test:** `test/wildlife-hunt-reward.test.js` (Step 6).
- **Manual:** dev server, observe wildlife in HUD species count — bear and raider_beast appear within 5-10 minutes of play. Worker auto-engages predator → food appears in stockpile after kill.
- **Bench:** long-horizon DevIndex must not regress >5%; expect slight gain from extra food source.

## 7. UNREPRODUCIBLE marker

N/A — design directive.

---

## Acceptance criteria

1. Wildlife spawn cadence visibly faster (≈2× per BALANCE.wildlifeSpawnIntervalMult).
2. All 3 existing species appear in normal play (round-robin pick verifiable in HUD species counter).
3. Worker hunt deposits BALANCE.wildlifeHuntFoodReward food into carry/stockpile + recordResourceFlow.
4. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
5. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/config/balance.js src/simulation/ecology/WildlifePopulationSystem.js src/simulation/ecology/WildlifeBehaviorSystem.js src/simulation/combat/ && rm test/wildlife-hunt-reward.test.js
```
