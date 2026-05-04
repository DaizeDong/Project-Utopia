# PV — Sudden Death Cascade Investigation (R9)

**Severity:** P0 (player-facing reliability + UX trust)
**Reproduced:** YES (2 independent paths — dev-stress and pure-organic)
**Bug confirmed:** YES, but NOT in the suspect locations the brief listed. Root cause is a **starvation-driven mass-death window compressed into ~25-40 sim-sec** combined with **misleading HUD signalling that goes silent until the cascade is already underway**.
**# workers killed simultaneously:** **9 of 12 in a single 25-sec sample window** in organic repro; **30 → 0 in ~40 sim-sec** at end (≈5 wall-sec at 8× speed → matches the user's "前1s 一片大好然后全部饿死").

---

## 1 — Reproduction (deterministic via dev API)

### Setup

- URL: `http://localhost:19090/?dev=1`
- Click `Start Colony` (default scenario: Temperate Plains · seed 56786007)
- In console: `window.__utopia.state.controls.isPaused = true;`
- Then either path A (fast) or path B (organic):

### Path A — dev-stress (compressed reproduction in ~5min sim time)

```js
window.__utopiaLongRun.devStressSpawn(30); // jumps from 12 to 30 workers
const u = window.__utopia;
for (let i = 0; i < 6000; i++) u.stepSimulation(0.1);
```

### Path B — pure organic (no intervention, replays exactly what the user sees)

```js
const u = window.__utopia;
for (let i = 0; i < 4000; i++) u.stepSimulation(0.5);
```

Both paths converge on the same outcome: a slow food-decline window of ~10 sim-min during which the HUD looks fine, then a **compressed cascade where every remaining worker dies within ~25 sec sim time** because they all crossed the lethal-hunger threshold within the same yield-pool exhaustion window.

---

## 2 — Tick-by-tick state diff at flip point (Path B, organic, no spawn shim)

| sample | tSec   | workers | food   | deaths | avgHunger | observation                        |
| ------ | ------ | ------- | ------ | ------ | --------- | ---------------------------------- |
| step-1100 | 552.7  | 12      | 30.4   | 17     | 0.45      | healthy plateau                    |
| step-1150 | 576.7  | 12      | 18.3   | 17     | 0.39      | food drifting, **HUD silent**     |
| step-1200 | 601.7  | 12      | 6.6    | 17     | 0.33      | food critical, **still no warning** |
| step-1250 | 626.7  | 12      | **0.0** | 17     | 0.01      | food just hit zero — **0 deaths in this 25s window** |
| **step-1300** | **651.7** | **3** | 0.0 | **27** | 0.00 | **CASCADE: 9 workers dead in 25 sim-sec** |
| step-1330 | 666.7  | **0**   | 0.0    | 30     | 0.00      | last 3 dead 15 sec later           |

Wall-clock equivalent at default 8× sim speed: the entire 30s death cascade plays out in **3.75 wall-sec** with NO actionable warning between t≈602 and t≈652. At the higher speed slider (24×) it is **1.25 wall-sec**.

That is precisely what the user reported as "前 1s 一片大好，然后突然殖民地全部饿死" ("looked great 1 second ago then the whole colony suddenly starved").

---

## 3 — Why the cascade is so tight (root cause analysis)

### 3a — Hunger-to-death pipeline is per-worker independent but synchronised by shared food pool

`MortalitySystem.js:534` resets `entity.starvationSec = 0` whenever `current` (per-worker hunger) exceeds the reachability refresh threshold AND `starvationSec <= 0`. Because the global `state.resources.food` drains in lockstep, **every worker's `starvationSec` starts ticking from 0 at almost the exact same wall-second** — the moment the warehouse food bin empties. With identical hp regen, identical eat rate, identical fall-off, they all reach the lethal threshold within a small spread.

This is NOT a regression from R8 PS/PR/PT; it is a **structural consequence of synchronised colony-wide depletion** that R8 made visible by removing some of the soft-loss buffers.

### 3b — Stress-spawn workers have hp pre-drained to 52-54 (lethal range)

In Path A, snapshotting at t≈4.7s shows: 18 of 30 workers at `hunger=1.0`, all `hp=100` initially, all in role=WOOD. After 600 sim-sec they are still alive at `hp=52-54` (just above lethal) but they all sit at hunger=0.998 — meaning a single tick of the per-tick HP attrition (`hpDamagePerSecAtMaxHunger`) puts the entire batch under at once. Concrete: 18 workers, all at hp≈54, all losing hp at the same rate → **batch-kill in <2 sim-sec when food finally drains**. This is the dev-spawn-specific amplifier of the same root cause.

### 3c — HUD/chronicle is silent during the warning window

At step-1200 (t=601.7s, food=6.6, **headed for catastrophe in 30 sim-sec**) the HUD `actionMessage` still reads:

> "The colony breathes again. Rebuild your routes before the next wave."

This is a **stale Recovery-boost toast from many minutes ago**. The chronicle is empty. There is no per-resource "stalled" badge yet (food rate is positive while the buffer drains). Only at step-1250 (food=0) does the data-stall marker fire — and by then the cascade is locked in. The user sees: stale-reassurance toast → instantly the death cascade → "stalled" badge appears → "colony wiped" outcome.

### 3d — Suspect bugs the brief listed: NOT confirmed

| Suspect                      | Verdict       | Evidence                                                                                          |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| PS R8 zombie-world end-gate misfiring | **NOT confirmed** | Path B trace shows `zombieSince=-1` throughout; phase only flipped to `end` via the normal `evaluateRunOutcomeState` ("Run ended: the colony was wiped out"), NOT via the zombie-gate path. |
| PR R8 drain budget cap inverted clamp | **NOT confirmed** | `WorldEventSystem.js:754-758` uses `Math.max(0, foodBudget - foodSpent)`. Both clamps are correct (no inversion). No active events ran in the repro window. |
| PT R8 raid pressure cascade  | **NOT confirmed** | `raidEsc.tier=4` throughout the cascade window; `pendingEvents=0`, `activeEvents=0`, `bandits=0`, `saboteurs=0`. Death cause is pure starvation, not combat. |
| Recovery-boost expiry → drain spike | **PARTIAL** | The recovery-boost TOAST is the actively misleading element (3c). Its mechanical expiry doesn't drain food — but its lingering toast text creates false reassurance. |

---

## 4 — Hypothesised root cause(s)

**Primary (P0 — UX trust):** The **starvation cliff is a single-decision-point failure**: between food=20 and food=0 (which spans only ~50 sim-sec ≈ 6 wall-sec at 8× speed) the player has no actionable signal. Stale recovery toast actively says "you're fine." Then 12 workers die in 25 sim-sec. From the player's POV this IS a sudden-death bug.

**Secondary (P1 — readability):** `populationStats.workers` updates AFTER `MortalitySystem`, so the HUD worker counter does not visibly tick down per-death — players see 12, 12, 12, 12, then 3. Need a per-tick "starving" indicator that fires while `food < populationStats.workers * eatRate * 30` (i.e. <30s runway), not when food is already 0.

**Tertiary (P2 — dev-only amplifier):** `__devForceSpawnWorkers` spawns workers with default hunger=0 but the colony food buffer is finite — within ~5 sim-min the spawn-batch's hp uniformly hits the lethal band, producing a "12 workers dead in 1 second" snapshot in dev-stress runs. Not user-visible in shipping but it is what makes A1/PV reviewer reproductions look more dramatic than the organic case.

---

## 5 — Suggested fix loci (ranked by impact / cost)

1. **`src/ui/hud/HUDController.js`** — add a "food runway" early-warning chip: when `state.resources.food / (workers * eatRate) < 60s` AND there is no positive food rate, emit a persistent `actionKind:"warning"` toast. Replaces the stale "colony breathes again" reassurance. **Lowest-risk, highest-impact.**
2. **`src/simulation/lifecycle/MortalitySystem.js:530-560`** — desynchronise starvation onset by adding a small per-worker phase offset (e.g. `entity.starvationSec = -rng() * 5` on first lethal-hunger entry). Stretches the death cliff from 25 sim-sec to ~60-80 sim-sec, restoring a meaningful save-window.
3. **`src/app/GameApp.js:#evaluateRunOutcome`** — when entering the cascade window (food=0 AND avgHunger>0.9 AND workers>2), inject a chronicle entry "Famine — every colonist hungry, no reserves" so the player sees explicit narrative mid-cascade, not just the silent HUD.
4. **`src/dev/forceSpawn.js`** — initialise spawned workers with `hunger=0.2`, `hp=85` rather than the current `hunger=undefined → 0` (looks fine) but `hp=100` that gets pre-drained without telemetry. Eliminates the dev-stress amplifier without touching production gameplay.
5. **`src/config/balance.js`** — consider a minimum-runway BALANCE knob: `colonistDeathBufferSec = 30` so MortalitySystem treats `starvationSec` as "lethal hunger time accumulator" with a floor below which death is suppressed (RimWorld-style "starving but not dying for 30s after food=0"). Direct Tier-A balance pass; needs benchmark validation.

**Do NOT touch:** PS zombie-gate, PR drain-budget clamp, PT raid-pressure — all behaved correctly in repro. Touching them would risk regressing R8 wins without addressing the actual bug.

---

## 6 — Open questions for follow-up

- Does the same cascade replicate on `archipelago_isles` or `fortified_basin` (templates with naturally tighter food)? Brief test says yes but worth a 4-seed bench.
- Does enabling `recruitFoodCost` change the cascade shape? (Pop_30 milestone path is theoretically immune to this kind of synchronised batch-death because workers are added at t-staggered intervals.)
- The HUD "data-stall=1" badge fires AFTER food=0; is there a meaningful "food rate trending negative" pre-signal that ColonyPerceiver could surface ~30s earlier?

---

**Bottom line:** confirmed P0 bug. Not in the R8 suspect surface. Cause is structural (synchronised hunger pipeline + silent HUD warning window + stale recovery toast). Fix surface is small (HUD warning chip + per-worker starvationSec phase offset). Estimated effort: 2-4h for the HUD chip; 1h for the desync; both can ship behind a feature flag for benchmark gating.
