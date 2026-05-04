# PX — Work Assignment Binding (R9, BLIND)

User concern (verbatim): **工作场景与 worker 能够一一绑定** — workers
should be 1:1 with work scenarios so they neither cluster on the same
site nor leave sites idle while many workers stand around.

Method: `?dev=1` Playwright session, `__utopiaLongRun.devStressSpawn(30)`
to fast-fill workers, then `placeFirstValidBuild(...)` to drop ~19
blueprints (7 mixed buildings + 12 walls) around the colony origin.
Sampled `state` every 30 sim-sec for ~5 min of game time. Inspected
`state.constructionSites[i].builderId`, `state._jobReservation` map,
`worker.fsm.state / target / payload`, `state.warehouseQueues`, role
distribution, and per-tile claimant counts.

Sample budget: **8 snapshots @ 30 sim-sec stride** (t=107 … t=317).
Organic worker count = 12 (the 18 stress-spawned dev workers do **not**
hold an FSM and route to `handleStressWorkerPatrol` — they are excluded
from the binding analysis below; see Tangential Finding 2).

---

## Per-work-type binding status

| Work type | Binding | Evidence |
|-----------|---------|----------|
| **BUILD**  | **1:1 ENFORCED** (hard claim, see B1) | `findOrReserveBuilderSite` writes `site.builderId = worker.id` and rejects new claimants; samples show 0 race-sites and 0 orphan reservations across 8 snapshots. |
| **FARM**   | **NOT 1:1** (advisory only) | 4 organic workers in `HARVESTING` on tile (54,42) at t=137 while `_jobReservation.getOccupant(54,42) === "worker_6"` — none of the 4 actual harvesters is the lock-holder. Race recurs in every snapshot at the same tile. |
| **LUMBER** | **NOT 1:1** (advisory only) | Same primitive as FARM (HARVESTING shared); WOOD-role workers cluster at (42,26) at t=164 (workers 9, 10, 12 all SEEKING_HARVEST same tile). |
| **QUARRY** | **NOT 1:1** (same primitive) | Not stressed in this run (no QUARRY tiles spawned within the test radius), but the harvest path is identical — same `tryReserve` ignored. |
| **DELIVER**| **Queue-aware (acceptable)** | `WarehouseQueueSystem` enforces per-tick intake cap + 120-tick wait timeout that nulls `targetTile` on overflow. `chooseWorkerTarget` deliberately exempts WAREHOUSE from occupancy penalty (line 275) and `isReserved` (line 282). No queue overflow in the run (single warehouse, qLen=0 throughout). Scheme is sound for many-to-one delivery. |
| **PROCESS** (kitchen/smithy/clinic) | **NOT 1:1** (releases on entry) | `SEEKING_PROCESS.onExit` calls `releaseAll`; `PROCESSING.onEnter` does **not** re-`tryReserve`. Two workers can stack on a kitchen tile and both run the process tick. Not stressed in this run because food was scarce, but inspection of `WorkerStates.js:520-559` confirms no claim. |

---

## Race conditions found (in order of severity)

### B1. **HARVEST `tryReserve` is purely advisory — return value ignored.** (HIGH)

`src/simulation/npc/fsm/WorkerStates.js:301-303` (`SEEKING_HARVEST.onEnter`)
and `:344-346` (`HARVESTING.onEnter`) both call
`reservation.tryReserve(worker.id, t.ix, t.iz, "harvest", nowSec)` and
**discard the boolean**. `tryReserve` returns `false` when another
worker already holds the tile (JobReservation.js:60) but no caller
checks the result. The worker proceeds to seek and apply
`applyHarvestStep` regardless, producing the cluster-on-one-tile
behaviour the user reported.

Evidence: at t=137,
`_jobReservation._tiles = { "54,42" → worker_6, "38,25" → worker_10 }`
yet workers 3, 4, 9, 11 are all HARVESTING (54,42) and worker 8 is
HARVESTING (38,25). Lock holder is somewhere else entirely.

The doc-comment for `tryReserve` (JobReservation.js:46-48) literally
says "a `false` result means the worker lost the race and should
abandon to JobWander", but the FSM port does not honour the contract.

### B2. **`chooseWorkerTarget` reservation penalty is too soft.** (MEDIUM)

`WorkerAISystem.js:282-284` applies `score -= 2.0` if `reservation.isReserved`.
With multi-target scoring routinely >3.0 (frontier + depot + ecology
multipliers), a -2 penalty does not exclude a reserved tile when
alternatives are scarce. Combined with B1 it lets every worker pick
the same tile when only a few harvest tiles exist near the colony
core. The `else if (... tileType !== TILE.WAREHOUSE) score -= ...`
occupancy penalty (line 275) compounds this — the soft caps decay
with `1 + 0.3*(occupants-1)` so the 4th occupant pays only
`-0.45 * 4 / 1.9 ≈ -0.94`.

### B3. **Builder-role population cap leaves sites idle while harvesters cluster.** (HIGH)

In the 12-organic-worker sample, role distribution was
`{FARM:5, GUARD:4, BUILDER:1, SMITH:1, COOK:1}` while 9-12 build
sites sat with `builderId === null`. Only 1 site can be built at a
time because only 1 BUILDER exists. Symptom matches the user's
"sites idle while N workers cluster" complaint, even though
`findOrReserveBuilderSite` itself enforces 1:1 strictly (B1's twin
problem on the *other* side: too few claimants for too many sites).
Root cause is `RoleAssignmentSystem` quota, not the binding
primitive — but from the playability standpoint it manifests as
"my walls are red and nobody is building them."

### B4. **PROCESSING has no per-tile claim at all.** (LOW for current play, MEDIUM for future)

`WorkerStates.js:540-545` (`SEEKING_PROCESS.onExit`) `releaseAll`s
the harvest reservation, and `PROCESSING.onEnter / .tick` never call
`tryReserve` on the kitchen/smithy/clinic tile. ProcessingSystem
runs the consume+produce cycle independent of how many workers are
"on" the tile — so two CO̱OKs can both stand on one Kitchen and the
extra one is silently wasted. Not observable in this run because
food shortage kept role counts low; will become visible at higher
populations once kitchens scale.

### B5. **Stale lock holders still appear as reservation owners.** (LOW)

`worker_6` held the (54,42) lock at t=137 with `intent: "harvest"`,
but worker_6 was actually in `DELIVERING` state at the warehouse.
`HARVESTING.onExit` does call `releaseAll(worker.id)`, so the lock
should drop on transition out — yet the live snapshot showed 1
stale reservation per snapshot consistently. Probable cause:
`SEEKING_HARVEST` releases on `.onExit` but `HARVESTING.onEnter`
re-claims (which can succeed since the other workers never claimed
in the first place). The lock then stays bound to whoever last
ENTERED HARVESTING successfully; future entrants don't disturb it.
Combined with B1 this means the lock points at one worker while
others harvest, producing the "ghost reservation" shape.

### Tangential Finding 1 (out of scope): Worker movement crowding

5 organic workers in `HARVESTING` state on tile (54,42) implies
five Three.js sprites visually overlapping on a single tile (since
applyHarvestStep does not move them). Inspector tile labels won't
distinguish which is "the" harvester. Will read as a UX bug to the
player ("why are they all standing on top of each other?").

### Tangential Finding 2 (out of scope, but observed): `devStressSpawn` workers have no FSM

`src/dev/forceSpawn.js` calls `createWorker(...)` then sets
`worker.isStressWorker = true`. In `WorkerAISystem.js:1400-1403`
these workers short-circuit to `handleStressWorkerPatrol(...)` and
**never get `worker.fsm` initialised**. So in a stress run, 18 of
30 workers have `fsm === undefined`, do not contribute to
construction or harvest, and produce a misleading `stateBreakdown`
("NONE: 18"). This is not a binding bug — it's a dev-stress artefact
— but any other reviewer using `devStressSpawn` in a Playwright
session will hit the same confusion. Worth a one-line note in the
helper docstring: "stress workers patrol only; they are not real
work participants."

---

## Severity summary

| ID | Bug | Severity | User-visible symptom |
|----|-----|----------|----------------------|
| B1 | HARVEST `tryReserve` return ignored | **HIGH** | 4 workers cluster on 1 farm tile, 3 others sit idle |
| B3 | BUILDER role-quota leaves sites idle | **HIGH** | Red blueprints stay red while a dozen workers harvest |
| B2 | Soft -2.0 reservation penalty | MEDIUM | Reinforces B1 when harvest tiles are scarce |
| B4 | PROCESSING has no tile claim | MEDIUM | Future scale issue; today invisible |
| B5 | Stale ghost reservations | LOW | Telemetry confusion only |

---

## Top race condition (one-line)

**HARVEST FSM treats `JobReservation.tryReserve` as a side-effect
write rather than an atomic claim — the boolean return is discarded
in both `SEEKING_HARVEST.onEnter` and `HARVESTING.onEnter`, breaking
the documented "lost-race → abandon" contract and letting every
FARM/WOOD/QUARRY worker pile onto the highest-scoring harvest tile.**

Minimal fix: in `WorkerStates.js:301` and `:344`, branch on the
return — if `false`, set `worker.fsm.target = null` so the
dispatcher's `fsmTargetNull` transition kicks the worker back to
IDLE / re-pick. This restores the v0.9.3 contract verbatim.

---

## Sample artefacts

- 8 snapshots captured at t = 107, 137, 167, 197, 227, 257, 287, 317 sim-sec.
- Race-sites recurrence: tile **(54,42)** appears in **8 / 8** snapshots
  with 2-4 simultaneous claimants. Tile **(38,25)** appears in **5 / 8**
  with 2-3 claimants. No build-side races (0 / 8).
- `state._jobReservation.stats` consistently 0-2 active locks against
  5-8 simultaneous HARVESTING workers — proof the lock is bypassed.
- WarehouseQueue qLen stayed at 0 throughout (single warehouse not
  saturated), so DELIVER queue contract was not stressed; design
  inspection only.
