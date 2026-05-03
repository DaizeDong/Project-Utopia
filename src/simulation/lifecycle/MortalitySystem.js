import { ANIMAL_KIND, ENTITY_TYPE, TILE, VISITOR_KIND } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { pushWarning } from "../../app/warnings.js";
// v0.8.13 A2 — direct A* / Faction imports were removed alongside
// resolveReachability. The faction-aware probe lives in services.reachability.
import { worldToTile } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { recordResourceFlow } from "../economy/ResourceSystem.js";
import { audioSystem } from "../../audio/AudioSystem.js";

// v0.8.12 F3 — NEARBY_FARM_SUPPLY_MAX_PATH_LEN removed; the FARM probe in
// hasReachableNutritionSource was dropped because workers don't actually eat
// at farm tiles. See comment at hasReachableNutritionSource for rationale.
const WORKER_MEMORY_LIMIT = 6;
const WORKER_MEMORY_HISTORY_LIMIT = 24;
const WITNESS_NEARBY_DISTANCE = 12;
const NUTRITION_REACHABILITY_REFRESH_HUNGER = 0.22;

function deathThresholdFor(entity) {
  if (entity.type === ENTITY_TYPE.WORKER) return { hunger: 0.045, holdSec: 34 };
  if (entity.type === ENTITY_TYPE.VISITOR) return { hunger: 0.04, holdSec: 40 };
  if (entity.kind === ANIMAL_KIND.HERBIVORE) return { hunger: 0.035, holdSec: 20 };
  return { hunger: 0.03, holdSec: 28 };
}

function relationLabelForMemory(opinion) {
  const n = Number(opinion);
  if (!Number.isFinite(n)) return "Colleague";
  if (n >= 0.45) return "Close friend";
  if (n >= 0.15) return "Friend";
  if (n >= -0.15) return "Acquaintance";
  if (n > -0.45) return "Strained";
  return "Rival";
}

/**
 * v0.8.2 Round-5 Wave-1 (02d Step 2) — push a narrative line into a worker's
 * memory.recentEvents, with optional same-event dedup. `dedupKey` + `nowSec`
 * + `windowSec` form a (key, last-push-time, window) tuple stored in
 * `worker.memory.recentKeys` (Map lazily initialised — see 02d Step 3 Risk
 * note re: snapshot roundtrip). If the same key fired within `windowSec`,
 * the new label is dropped. Death events pass a large windowSec (9999) as
 * a defensive measure — a worker only dies once, but the dedup keeps stray
 * double-recording (e.g. re-enter loop from a snapshot replay) safe.
 * @param {object} worker
 * @param {string} label
 * @param {string|null} [dedupKey]
 * @param {number} [windowSec]
 * @param {number} [nowSec]
 */
function inferMemoryType(dedupKey) {
  const key = String(dedupKey ?? "");
  if (key.startsWith("death:")) return "death";
  if (key.startsWith("birth:")) return "birth";
  if (key.startsWith("friend:") || key.startsWith("rival:")) return "relationship";
  return "event";
}

function pushWorkerMemoryHistory(worker, label, dedupKey = null, nowSec = 0) {
  worker.memory ??= { recentEvents: [], dangerTiles: [] };
  if (!Array.isArray(worker.memory.history)) worker.memory.history = [];
  if (dedupKey && worker.memory.history.some((entry) => entry?.key === dedupKey)) return;
  worker.memory.history.unshift({
    simSec: Number(nowSec ?? 0),
    type: inferMemoryType(dedupKey),
    label: String(label ?? ""),
    key: dedupKey ? String(dedupKey) : null,
  });
  worker.memory.history = worker.memory.history.slice(0, WORKER_MEMORY_HISTORY_LIMIT);
}

function pushWorkerMemory(worker, label, dedupKey = null, windowSec = 30, nowSec = 0) {
  worker.memory ??= { recentEvents: [], dangerTiles: [] };
  if (!Array.isArray(worker.memory.recentEvents)) worker.memory.recentEvents = [];
  if (dedupKey) {
    // Lazy-init so snapshot reload (which shallow-clones `memory` and drops
    // Map instances) always recovers to a usable state without schema
    // migration.
    if (!(worker.memory.recentKeys instanceof Map)) worker.memory.recentKeys = new Map();
    const recentKeys = worker.memory.recentKeys;
    const last = Number(recentKeys.get(dedupKey) ?? -Infinity);
    if (Number.isFinite(last) && Number(nowSec) - last < Number(windowSec)) {
      return; // within window — skip push
    }
    recentKeys.set(dedupKey, Number(nowSec));
  }
  worker.memory.recentEvents.unshift(label);
  worker.memory.recentEvents = worker.memory.recentEvents.slice(0, WORKER_MEMORY_LIMIT);
  pushWorkerMemoryHistory(worker, label, dedupKey, nowSec);
}

function readRelationshipOpinion(deceased, witness) {
  const fromDeceased = Number(deceased.relationships?.[witness.id]);
  if (Number.isFinite(fromDeceased)) return fromDeceased;
  const fromWitness = Number(witness.relationships?.[deceased.id]);
  if (Number.isFinite(fromWitness)) return fromWitness;
  return NaN;
}

function manhattanWorldDistance(a, b) {
  return Math.abs(Number(a.x ?? 0) - Number(b.x ?? 0))
    + Math.abs(Number(a.z ?? 0) - Number(b.z ?? 0));
}

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 5) — resolve a tile-coord into
// a scenario-anchor label like "west ridge wilds" / "east depot gate", so
// obituary lines read "died near the west lumber route" instead of the bare
// "(32,18)" coords. Walks scenario.routeLinks → depotZones → chokePoints →
// anchors and returns the closest match within `radiusTiles` (default 6).
// Falls back to "(ix,iz)" when no anchor is in range — same behaviour as
// before, just narratively richer when scenario data is available.
function resolveAnchorLabel(state, tile) {
  if (!tile || !Number.isFinite(tile.ix) || !Number.isFinite(tile.iz)) return "";
  const scenario = state?.gameplay?.scenario;
  if (!scenario) return `(${tile.ix},${tile.iz})`;
  const radiusTiles = 6;
  const anchors = scenario.anchors ?? {};
  const labelled = [];
  const pushIfAnchor = (anchorKey, label) => {
    const a = anchors[anchorKey];
    if (!a || !Number.isFinite(a.ix) || !Number.isFinite(a.iz)) return;
    const dist = Math.abs(a.ix - tile.ix) + Math.abs(a.iz - tile.iz);
    labelled.push({ label, dist });
  };
  for (const link of scenario.routeLinks ?? []) {
    pushIfAnchor(link.from, String(link.label ?? ""));
    pushIfAnchor(link.to, String(link.label ?? ""));
  }
  for (const zone of scenario.depotZones ?? []) {
    pushIfAnchor(zone.anchor, String(zone.label ?? ""));
  }
  for (const choke of scenario.chokePoints ?? []) {
    pushIfAnchor(choke.anchor, String(choke.label ?? ""));
  }
  for (const wild of scenario.wildlifeZones ?? []) {
    pushIfAnchor(wild.anchor, String(wild.label ?? ""));
  }
  labelled.sort((a, b) => a.dist - b.dist);
  const best = labelled.find((l) => l.label && l.dist <= radiusTiles);
  return best ? best.label : `(${tile.ix},${tile.iz})`;
}

function recordDeathIntoWitnessMemory(state, deceased, nowSec) {
  if (deceased.type !== ENTITY_TYPE.WORKER && deceased.type !== ENTITY_TYPE.VISITOR) return;
  const workers = (state.agents ?? [])
    .filter((agent) => agent.id !== deceased.id
      && agent.type === ENTITY_TYPE.WORKER
      && agent.alive !== false);
  if (workers.length === 0) return;

  // v0.8.2 Round-5 Wave-1 (02d Step 1) — union of `related` ∪ `nearby` rather
  // than the previous "related OR nearby" fallback. Previously any deceased
  // with at least one opinion≠0 relationship made the fallback branch dead
  // code, so near-field witnesses without a relationship never got the
  // memory. Now we always collect top-3 related (by |opinion|) AND top-3
  // nearby (distance <= WITNESS_NEARBY_DISTANCE), dedupe by agent id, and
  // label each witness by its strongest tag.
  const related = workers
    .map((worker) => ({ worker, opinion: readRelationshipOpinion(deceased, worker) }))
    .filter(({ opinion }) => Number.isFinite(opinion) && Math.abs(opinion) > 0)
    .sort((a, b) => Math.abs(b.opinion) - Math.abs(a.opinion))
    .slice(0, 3);

  const nearby = workers
    .map((worker) => ({ worker, opinion: NaN, distance: manhattanWorldDistance(worker, deceased) }))
    .filter(({ distance }) => distance <= WITNESS_NEARBY_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  // Combine using Set<agentId>: related wins the opinion tag (Friend/Close
  // friend/Strained/Rival), nearby-only witnesses are labelled "Colleague".
  const witnessesById = new Map();
  for (const entry of related) {
    witnessesById.set(entry.worker.id, entry);
  }
  for (const entry of nearby) {
    if (!witnessesById.has(entry.worker.id)) {
      witnessesById.set(entry.worker.id, entry);
    }
  }

  const reason = String(deceased.deathReason || "event");
  const deceasedName = deceased.displayName ?? deceased.id;
  const time = Math.max(0, Number(nowSec ?? 0)).toFixed(0);
  const deathKey = `death:${deceased.id}`;
  // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 5+6) — kinship & rivalry
  // variants. Family ties (lineage.parents/children) get an additional
  // "my father / my child died" memory beat. Rival witnesses (opinion ≤
  // -0.15) flip into the "felt grim relief" line and gain a small +0.05
  // morale bump (the "enemy's funeral" cliché — bounded so the long-horizon
  // bench's social CI doesn't collapse).
  const deceasedParentSet = new Set(Array.isArray(deceased.lineage?.parents) ? deceased.lineage.parents : []);
  const deceasedChildSet = new Set(Array.isArray(deceased.lineage?.children) ? deceased.lineage.children : []);
  for (const { worker, opinion } of witnessesById.values()) {
    const label = Number.isFinite(opinion) ? relationLabelForMemory(opinion) : "Colleague";
    pushWorkerMemory(
      worker,
      `[${time}s] ${label} ${deceasedName} died (${reason})`,
      deathKey,
      9999,
      Number(nowSec ?? 0),
    );
    // Family witness variant: only fires for workers wired into the
    // deceased's lineage tree (Step 3 in PopulationGrowthSystem populates
    // both directions). Stays orthogonal to the relationship-band label
    // above so the "Friend / Close friend" copy still surfaces.
    if (deceasedChildSet.has(worker.id)) {
      pushWorkerMemory(
        worker,
        `[${time}s] My parent ${deceasedName} died (${reason})`,
        `${deathKey}:family-parent`,
        9999,
        Number(nowSec ?? 0),
      );
    }
    if (deceasedParentSet.has(worker.id)) {
      pushWorkerMemory(
        worker,
        `[${time}s] My child ${deceasedName} died (${reason})`,
        `${deathKey}:family-child`,
        9999,
        Number(nowSec ?? 0),
      );
    }
    // Rivalry "grim relief" variant — only fires when the witness has a
    // clear-rival opinion of the deceased (≤ -0.15 Strained band onwards).
    if (Number.isFinite(opinion) && opinion <= -0.15) {
      pushWorkerMemory(
        worker,
        `[${time}s] Felt grim relief at ${deceasedName}'s death`,
        `${deathKey}:rival-relief`,
        9999,
        Number(nowSec ?? 0),
      );
      worker.morale = Math.max(0, Math.min(1, Number(worker.morale ?? 0.5) + 0.05));
    }
    // v0.8.2 Round-7 01d — grief mechanic: Close Friend witnesses (opinion ≥ 0.6)
    // receive a morale debuff and a blackboard grief timer (90s) so WorkerAISystem
    // can slow their efficiency. Bounded to not drop morale below 0.
    if (Number.isFinite(opinion) && opinion >= 0.6) {
      worker.blackboard ??= {};
      worker.blackboard.griefUntilSec = Number(nowSec ?? 0) + 90;
      worker.blackboard.griefFriendName = (deceasedName ?? "").split(" ")[0];
      worker.morale = Math.max(0, Number(worker.morale ?? 0.5) - 0.15);
    }
  }
}

function ensureLogicBucket(state) {
  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });
  return logic;
}

function incrementDeathCounters(state, entity, reason, reachableFood) {
  // v0.8.6 Tier 2 CB-H2 / CB-L3: distinguish hostile (predator / saboteur)
  // deaths from colonist deaths. Hostile deaths SHOULD NOT increment
  // deathsTotal — that metric drives survival score penalty, raid death
  // budget, and player-facing "deaths" count. Killing a saboteur or
  // raider_beast was the colony's WIN condition for the threat, so before
  // this fix it perversely penalized the player for successful defense.
  const isHostilePredator = entity.type === "ANIMAL" && entity.kind === "PREDATOR";
  const isHostileSaboteur = entity.type === "VISITOR" && entity.kind === "SABOTEUR";
  const isHostileSlain = (isHostilePredator || isHostileSaboteur) && reason === "killed-by-worker";

  if (isHostileSlain) {
    // Track hostiles slain separately (encourages defense, drives metrics).
    state.metrics.hostilesSlain = Number(state.metrics.hostilesSlain ?? 0) + 1;
    if (isHostilePredator) {
      const species = String(entity.species ?? "");
      const sub = species === "raider_beast" ? "raidersSlain" : "predatorsSlain";
      state.metrics[sub] = Number(state.metrics[sub] ?? 0) + 1;
    } else {
      state.metrics.saboteursSlain = Number(state.metrics.saboteursSlain ?? 0) + 1;
    }
    // Skip the deathsTotal/deathsByGroup/raid-budget cascades — those track
    // colonist mortality only.
    return;
  }

  state.metrics.deathsTotal = Number(state.metrics.deathsTotal ?? 0) + 1;
  state.metrics.deathsByReason ??= {};
  state.metrics.deathsByReason[reason] = Number(state.metrics.deathsByReason[reason] ?? 0) + 1;
  state.metrics.deathsByGroup ??= {};
  const groupId = String(entity.groupId ?? entity.kind ?? entity.type ?? "unknown");
  state.metrics.deathsByGroup[groupId] = Number(state.metrics.deathsByGroup[groupId] ?? 0) + 1;

  const reachabilityKey = `${reason}:${reachableFood ? "reachable" : "unreachable"}`;
  state.metrics.deathByReasonAndReachability ??= {};
  state.metrics.deathByReasonAndReachability[reachabilityKey] = Number(state.metrics.deathByReasonAndReachability[reachabilityKey] ?? 0) + 1;

  const logic = ensureLogicBucket(state);
  logic.deathByReasonAndReachability[reachabilityKey] = Number(logic.deathByReasonAndReachability[reachabilityKey] ?? 0) + 1;
}

function markDeath(entity, reason, nowSec, context = null) {
  entity.alive = false;
  // v0.8.6 Tier 0 LR-C4: guard against `killed-by-worker` mis-attribution to
  // a colonist (WORKER) or trader (VISITOR/TRADER). Only PREDATOR animals and
  // SABOTEUR visitors are valid recipients of that reason; any other entity
  // hitting this code path with that label is a stale-write bug — coerce it
  // back to a defensible cause.
  let safeReason = String(reason ?? "");
  if (safeReason === "killed-by-worker") {
    const isAnimalPredator = entity.type === "ANIMAL" && entity.kind === "PREDATOR";
    const isSaboteur = entity.type === "VISITOR" && entity.kind === "SABOTEUR";
    if (!isAnimalPredator && !isSaboteur) {
      // Worker / trader / herbivore mis-attributed: prefer starvation if it
      // was the active hunger fall-off, otherwise "unknown".
      safeReason = (Number(entity.starvationSec ?? 0) >= 0.5)
        ? "starvation"
        : "unknown";
    }
  }
  entity.deathReason = safeReason;
  entity.deathSec = nowSec;
  entity.deathContext = context ?? null;
}

// v0.8.3 entity-death cleanup (Bug A + D) — releases the dead entity's
// JobReservation slot immediately and refunds any worker carry back to the
// colony stockpile. Called at the moment `alive` is flipped to false so
// neither resource leaks until the next tick. Visitor/animal carry is not
// refunded (visitors don't haul colony stockpile resources, animals don't
// have `carry`); JobReservation is only owned by workers but `releaseAll`
// is a no-op for unknown ids so it's safe to call uniformly.
function releaseDeathSideEffects(state, entity, services = null) {
  if (state?._jobReservation && typeof state._jobReservation.releaseAll === "function") {
    state._jobReservation.releaseAll(entity.id);
  }
  // v0.8.13 A6 — drop the worker's path-fail blacklist so a recycled id
  // doesn't inherit stale entries.
  if (entity?.type === ENTITY_TYPE.WORKER && services?.pathFailBlacklist?.forgetWorker) {
    services.pathFailBlacklist.forgetWorker(entity.id);
  }
  if (entity?.type !== ENTITY_TYPE.WORKER) return;
  const carry = entity.carry;
  if (!carry || typeof carry !== "object") return;
  const refundable = ["food", "wood", "stone", "herbs"];
  if (!state.resources) state.resources = {};
  for (const r of refundable) {
    const amount = Number(carry[r] ?? 0);
    if (!(amount > 0)) continue;
    state.resources[r] = Number(state.resources[r] ?? 0) + amount;
    recordResourceFlow(state, r, "recovered", amount);
    carry[r] = 0;
  }
}

// v0.10.1 R6 PK — throttle wrapper. The full `recomputeCombatMetrics` walks
// every agent + animal twice (once for actor counts + saboteur/worker arrays,
// once O(W*(P+S)) for nearestThreatDistance). At 80 workers + 0 hostiles
// that's still ~6.4 k iterations / tick — small individually but called from
// MortalitySystem's every-tick path it stacked into the dominant `topSystems`
// entry under 4× speed (R6-PK perf-cap repro). Fast-path: when the previous
// tick recorded zero active threats AND the entity-count signature hasn't
// changed, the cached `state.metrics.combat` is already correct — no walk
// needed. Live-threat ticks fall through to the full walk so GUARD draft
// reaction stays per-tick; signature mismatch (entity births/deaths) also
// forces a recompute. Net: ~95 % cache-hit on a peaceful 80-worker colony,
// 0 % on a raid, drop-in identical observable metrics.
let __combatMetricsLastSig = -1;
let __combatMetricsLastNoThreatTick = -1;

function recomputeCombatMetricsThrottled(state) {
  const prev = state.metrics?.combat;
  const animals = Array.isArray(state.animals) ? state.animals : [];
  const agents = Array.isArray(state.agents) ? state.agents : [];
  // Cheap signature: agent + animal lengths. Births/deaths/spawns all bump
  // at least one length, so a held signature == "no entities entered or left
  // since last walk".
  const sig = (agents.length << 16) | (animals.length & 0xffff);
  // `activeThreats` is the canonical "metrics populated" sentinel — the walk
  // always writes a numeric value (0 or higher). `undefined` means metrics
  // were never computed (or were externally reset to `{}`); we must walk to
  // re-populate or downstream consumers see an empty object forever.
  const populated = prev && typeof prev.activeThreats === "number";
  const prevHadThreats = populated && prev.activeThreats > 0;
  if (
    populated
    && !prevHadThreats
    && sig === __combatMetricsLastSig
    && __combatMetricsLastNoThreatTick >= 0
  ) {
    // Cache hit — peaceful tick, no entity churn. Skip the O(n) walk.
    return;
  }
  recomputeCombatMetrics(state);
  __combatMetricsLastSig = sig;
  __combatMetricsLastNoThreatTick = Number(state.metrics?.timeSec ?? 0);
}

// v0.8.3 entity-death cleanup (Bug C) — recompute combat metrics after a
// death pass so RoleAssignmentSystem on the next tick doesn't over-promote
// guards based on a raider that died this tick. Mirrors the AnimalAISystem
// emitter (line ~1004) but filters `alive !== false` strictly. Cheap O(n)
// and only runs when at least one entity died this tick.
function recomputeCombatMetrics(state) {
  if (!state.metrics) state.metrics = {};
  const animals = Array.isArray(state.animals) ? state.animals : [];
  const agents = Array.isArray(state.agents) ? state.agents : [];
  let activePredators = 0;
  let activeRaiders = 0;
  for (const a of animals) {
    if (!a || a.alive === false) continue;
    if (a.kind !== ANIMAL_KIND.PREDATOR) continue;
    activePredators += 1;
    if (String(a.species ?? "") === "raider_beast") activeRaiders += 1;
  }
  // v0.8.6 Tier 1 CB-C1 / CB-H6: count active SABOTEUR visitors (live VISITOR
  // entities with kind=SABOTEUR) and include their distance in
  // nearestThreatDistance.
  // v0.8.7 T2-1 (QA3-H1): pre-collect saboteurArr to avoid quadratic walks.
  // v0.8.8 A7 (QA1 L1): single-pass agent walk now also collects workerArr,
  // eliminating the second `for (const w of agents)` and dropping the
  // distance-scan from O(agents²) to O(workers × (predators + saboteurs)).
  let activeSaboteurs = 0;
  let guardCount = 0;
  let workerCount = 0;
  const saboteurArr = [];
  const workerArr = [];
  for (const w of agents) {
    if (!w || w.alive === false) continue;
    if (w.type === ENTITY_TYPE.VISITOR && w.kind === VISITOR_KIND.SABOTEUR) {
      activeSaboteurs += 1;
      saboteurArr.push(w);
      continue;
    }
    if (w.type !== ENTITY_TYPE.WORKER) continue;
    workerCount += 1;
    workerArr.push(w);
    if (w.role === "GUARD") guardCount += 1;
  }
  const activeThreats = activePredators + activeSaboteurs;
  let nearestSq = Infinity;
  if (activeThreats > 0 && workerCount > 0) {
    for (const w of workerArr) {
      for (const a of animals) {
        if (!a || a.alive === false || a.kind !== ANIMAL_KIND.PREDATOR) continue;
        const dx = a.x - w.x;
        const dz = a.z - w.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nearestSq) nearestSq = d2;
      }
      for (const v of saboteurArr) {
        const dx = v.x - w.x;
        const dz = v.z - w.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nearestSq) nearestSq = d2;
      }
    }
  }
  // Preserve existing combat fields (e.g. policyDelta* from NPCBrainSystem)
  // by merging into the existing object rather than replacing it.
  const existing = state.metrics.combat ?? {};
  state.metrics.combat = {
    ...existing,
    activeThreats,
    activeRaiders,
    activePredators,
    activeSaboteurs,
    guardCount,
    workerCount,
    nearestThreatDistance: nearestSq === Infinity ? -1 : Math.sqrt(nearestSq),
  };
}

// v0.8.13 A2 — `resolveReachability` removed. All reachability probes now
// flow through `services.reachability` (ReachabilityCache). The cache runs
// a faction-aware A* internally, so MortalitySystem no longer needs a
// direct aStar import.

function hasReachableNutritionSource(entity, state, services, nowSec) {
  // Carry-fallback semantics preserved: a worker with carry food is treated
  // as having an immediate nutrition source regardless of grid topology. This
  // is not a path probe — it's a fast-path that beats every cache.
  if (Number(entity.carry?.food ?? 0) > 0) {
    return { reachable: true, sourceType: "carry", pathLength: 0 };
  }

  // v0.8.13 A2 — reachability is now a `services.reachability` query.
  // Cache is keyed on (workerTile, tileTypes, gridVersion) so AI consumers
  // (StatePlanner, StateFeasibility, consumeEmergencyRation) see the same
  // fresh result this tick. The previous 2.5 s `lastFoodReachCheckSec` TTL
  // is gone — staleness was 50-67 % in scenarios D/E/F per the audit trace.
  if (Number(state.resources?.food ?? 0) > 0 && Number(state.buildings?.warehouses ?? 0) > 0) {
    const fromTile = worldToTile(entity.x, entity.z, state.grid);
    const cache = services?.reachability;
    let result = cache?.isReachable?.(fromTile, [TILE.WAREHOUSE], state, services) ?? null;
    if (!result) {
      result = cache?.probeAndCache?.(fromTile, [TILE.WAREHOUSE], state, services, entity) ?? null;
    }
    // When the probe budget is exhausted (`result == null`) the cache
    // declined to answer this tick. Fall back to the previous tick's
    // mortality snapshot (`entity.debug.reachableFood`) rather than
    // falsely declaring "unreachable" — that would race with the AI's
    // own next-tick probe and cause spurious deaths under high load.
    if (!result) {
      const snapshot = entity.debug?.reachableFood;
      if (typeof snapshot === "boolean") {
        return {
          reachable: snapshot,
          sourceType: snapshot ? String(entity.debug?.nutritionSourceType ?? "warehouse") : "none",
          pathLength: 0,
        };
      }
      // No snapshot yet (first tick of life). Be conservative: assume
      // reachable so the worker doesn't die before the cache populates.
      return { reachable: true, sourceType: "warehouse", pathLength: 0 };
    }
    if (result.reachable) {
      return { reachable: true, sourceType: "warehouse", pathLength: 0 };
    }
  }

  // v0.8.12 F3 — FARM probe removed; sourceType is exactly one of
  // "carry" | "warehouse" | "none". See archived comment in v0.8.12.
  return { reachable: false, sourceType: "none", pathLength: 0 };
}

function shouldStarve(entity, dt, state, services, nowSec) {
  const { hunger, holdSec } = deathThresholdFor(entity);
  const current = Number(entity.hunger ?? 1);

  if (entity.type === ENTITY_TYPE.WORKER || entity.type === ENTITY_TYPE.VISITOR) {
    const reachabilityRefreshThreshold = Math.max(hunger, NUTRITION_REACHABILITY_REFRESH_HUNGER);
    if (current > reachabilityRefreshThreshold && Number(entity.starvationSec ?? 0) <= 0) {
      entity.starvationSec = 0;
      return {
        shouldDie: false,
        reachableFood: Boolean(entity.debug?.reachableFood),
        nutritionSourceType: String(entity.debug?.nutritionSourceType ?? "none"),
        isStarvationRisk: false,
      };
    }

    const nutrition = hasReachableNutritionSource(entity, state, services, nowSec);
    entity.debug ??= {};
    entity.debug.reachableFood = nutrition.reachable;
    entity.debug.nutritionSourceType = nutrition.sourceType;
    if (current <= hunger) {
      if (nutrition.reachable) {
        entity.starvationSec = Math.max(0, Number(entity.starvationSec ?? 0) - dt * 1.2);
      } else {
        entity.starvationSec = Number(entity.starvationSec ?? 0) + dt;
      }
    } else {
      entity.starvationSec = 0;
    }

    return {
      shouldDie: Number(entity.starvationSec ?? 0) >= holdSec && !nutrition.reachable,
      reachableFood: nutrition.reachable,
      nutritionSourceType: nutrition.sourceType,
      isStarvationRisk: current <= hunger && !nutrition.reachable,
    };
  }

  if (current <= hunger) {
    entity.starvationSec = Number(entity.starvationSec ?? 0) + dt;
  } else {
    entity.starvationSec = 0;
  }
  return {
    shouldDie: Number(entity.starvationSec ?? 0) >= holdSec,
    reachableFood: false,
    nutritionSourceType: "none",
    isStarvationRisk: current <= hunger,
  };
}

function buildDeathContext(entity, state, reason, reachableFood, nutritionSourceType = "none") {
  const fsm = entity.blackboard?.fsm ?? null;
  return {
    reason,
    simSec: Number(state.metrics.timeSec ?? 0),
    reachableFood: Boolean(reachableFood),
    nutritionReachable: Boolean(reachableFood),
    nutritionSourceType,
    starvationSecAtDeath: Number(entity.starvationSec ?? 0),
    hunger: Number(entity.hunger ?? 0),
    hp: Number(entity.hp ?? 0),
    state: fsm?.state ?? entity.stateLabel ?? "-",
    targetTile: entity.targetTile ? { ix: entity.targetTile.ix, iz: entity.targetTile.iz } : null,
    pathIndex: Number(entity.pathIndex ?? 0),
    pathLength: Number(entity.path?.length ?? 0),
    pathGridVersion: Number(entity.pathGridVersion ?? -1),
    aiTarget: entity.blackboard?.aiTargetState ?? null,
    lastFeasibilityReject: entity.blackboard?.lastFeasibilityReject ?? null,
  };
}

function recordDeath(state, entity, reachableFood, nutritionSourceType, deathEvents) {
  // v0.8.6 Tier 0 LR-C4: re-coerce a mis-attributed "killed-by-worker" on a
  // colonist before any downstream metric / log captures it. (Idempotent
  // with markDeath; cheap and defensive.)
  if (entity.deathReason === "killed-by-worker") {
    const isAnimalPredator = entity.type === "ANIMAL" && entity.kind === "PREDATOR";
    const isSaboteur = entity.type === "VISITOR" && entity.kind === "SABOTEUR";
    if (!isAnimalPredator && !isSaboteur) {
      entity.deathReason = (Number(entity.starvationSec ?? 0) >= 0.5)
        ? "starvation"
        : "unknown";
    }
  }
  incrementDeathCounters(state, entity, entity.deathReason || "event", reachableFood);
  if (entity.kind === ANIMAL_KIND.HERBIVORE || entity.kind === ANIMAL_KIND.PREDATOR) {
    const reason = String(entity.deathReason || "event");
    state.metrics.ecologyPendingDeaths[reason] = Number(state.metrics.ecologyPendingDeaths[reason] ?? 0) + 1;
  }
  deathEvents.push(`${entity.displayName ?? entity.id} died (${entity.deathReason || "event"}).`);

  // v0.8.2 Round-0 02d-roleplayer (Step 3) — surface deaths to the player-
  // visible Colony Log. Only colonists (workers/visitors) get a narrative
  // line; animal deaths stay in state.debug.eventTrace to avoid drowning the
  // log in herbivore/predator churn. Dedupe is guaranteed by the caller's
  // `!entity.deathRecorded` guard plus the fact that we append BEFORE setting
  // the flag in this function. objectiveLog uses unshift+slice(0,24) to
  // match ProgressionSystem.logObjective's capacity policy.
  if (entity.type === ENTITY_TYPE.WORKER || entity.type === ENTITY_TYPE.VISITOR) {
    const reason = entity.deathReason || "event";
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const tile = entity.deathContext?.targetTile
      ?? (entity.targetTile ? { ix: entity.targetTile.ix, iz: entity.targetTile.iz } : null);
    const tileSuffix = tile ? ` near (${tile.ix},${tile.iz})` : "";
    const name = entity.displayName ?? entity.id;
    // v0.8.7.1 P12 — hostile entities (SABOTEUR visitors and PREDATOR animals)
    // get a "Hostile slain:" prefix in the objective log so the player
    // doesn't conflate enemy deaths with colonist losses.
    const isHostile = (entity.type === ENTITY_TYPE.VISITOR && entity.kind === VISITOR_KIND.SABOTEUR)
      || (entity.type === ENTITY_TYPE.ANIMAL && entity.kind === ANIMAL_KIND.PREDATOR);
    const line = isHostile
      ? `[${nowSec.toFixed(1)}s] Hostile slain: ${name} (${reason})${tileSuffix}`
      : `[${nowSec.toFixed(1)}s] ${name} died (${reason})${tileSuffix}`;
    if (state.gameplay) {
      if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
      state.gameplay.objectiveLog.unshift(line);
      state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
    }
    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 5) — obituary line: a
    // richer "writer's voice" version of the bare death line. Includes the
    // worker's backstory ("farming specialist, swift temperament") and the
    // closest scenario-anchor label ("near the west lumber route") so the
    // Storyteller strip and EntityFocusPanel obituary section can render a
    // proper send-off rather than a coordinate dump. Stored on
    // `entity.obituary` and unshifted into `state.gameplay.deathLog` (capped
    // to 24, same policy as objectiveLog). The plain `line` above is kept
    // unchanged for backward-compatible regression tests.
    const backstory = String(entity.backstory ?? "").trim();
    const anchorLabel = resolveAnchorLabel(state, tile);
    const backstoryFrag = backstory ? `, ${backstory},` : "";
    const locFrag = anchorLabel ? ` near ${anchorLabel}` : "";
    const obituaryLine = `[${nowSec.toFixed(1)}s] ${name}${backstoryFrag} died of ${reason}${locFrag}`;
    entity.obituary = obituaryLine;
    if (entity.lineage && typeof entity.lineage === "object") {
      entity.lineage.deathSec = nowSec;
    }
    if (state.gameplay) {
      if (!Array.isArray(state.gameplay.deathLog)) state.gameplay.deathLog = [];
      state.gameplay.deathLog.unshift(obituaryLine);
      state.gameplay.deathLog = state.gameplay.deathLog.slice(0, 24);
      // v0.8.2 Round-7 01d — structured death log for Chronicles panel.
      // Stores rich per-death objects so EventPanel can render a formatted
      // obituary without parsing the obituaryLine string.
      if (!Array.isArray(state.gameplay.deathLogStructured)) state.gameplay.deathLogStructured = [];
      state.gameplay.deathLogStructured.unshift({
        name: name,
        role: String(entity.role ?? entity.kind ?? "colonist"),
        trait: entity.traits?.[0] ?? entity.trait ?? null,
        cause: entity.deathReason || "event",
        location: anchorLabel || (tile ? `(${tile.ix},${tile.iz})` : "the colony"),
        timeSec: nowSec,
      });
      state.gameplay.deathLogStructured = state.gameplay.deathLogStructured.slice(0, 24);
    }
    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 5+7) — surface the
    // obituary line into state.debug.eventTrace so storytellerStrip's
    // SALIENT pattern (Step 7 expanded `^\[.+\] .+, .+, died of/i`) can
    // lift it into #storytellerBeat. Trace stays newest-first via unshift,
    // capped at the same 36-entry bound the system uses elsewhere.
    if (state.debug) {
      if (!Array.isArray(state.debug.eventTrace)) state.debug.eventTrace = [];
      state.debug.eventTrace.unshift(obituaryLine);
      state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
    }
    recordDeathIntoWitnessMemory(state, entity, nowSec);
  }

  entity.deathRecorded = true;
  if (!entity.deathContext) {
    entity.deathContext = buildDeathContext(entity, state, entity.deathReason || "event", reachableFood, nutritionSourceType);
  }
  // Audio: play death tone for colonist deaths only (not animals — too frequent).
  if (entity.type === ENTITY_TYPE.WORKER || entity.type === ENTITY_TYPE.VISITOR) {
    audioSystem.onWorkerDeath();
  }
  const eventType = entity.deathReason === "starvation" ? EVENT_TYPES.WORKER_STARVED : EVENT_TYPES.WORKER_DIED;
  const fallbackTile = worldToTile(Number(entity.x ?? 0), Number(entity.z ?? 0), state.grid);
  const tile = entity.deathContext?.targetTile
    ?? { ix: fallbackTile.ix, iz: fallbackTile.iz };
  emitEvent(state, eventType, {
    entityId: entity.id,
    entityName: entity.displayName ?? entity.id,
    displayName: entity.displayName ?? entity.id,
    reason: entity.deathReason || "event",
    groupId: entity.groupId ?? entity.kind ?? "unknown",
    tile,
    worldX: Number(entity.x ?? 0),
    worldZ: Number(entity.z ?? 0),
    foodEmptySec: Number(state.metrics.resourceEmptySec?.food ?? 0),
  });
  state.metrics.deathTimestamps ??= [];
  state.metrics.deathTimestamps.push(Number(state.metrics.timeSec ?? 0));
  // v0.8.7 T1-1 (QA3-C1): cap death-timestamp history at 256. Pre-fix this
  // array grew unbounded over a long-horizon run (10k+ entries on a 7-day
  // benchmark) since nothing ever pruned it; downstream consumers (ColonyEvalSystem,
  // PerformancePanel) only need the recent tail for rate calculations.
  if (state.metrics.deathTimestamps.length > 256) {
    state.metrics.deathTimestamps.splice(0, state.metrics.deathTimestamps.length - 256);
  }
}

export class MortalitySystem {
  constructor() {
    this.name = "MortalitySystem";
  }

  update(dt, state, services) {
    const nowSec = Number(state.metrics.timeSec ?? 0);
    const deadIds = new Set();
    const deathEvents = [];
    let starvationRiskCount = 0;
    state.metrics.ecologyPendingDeaths ??= {
      predation: 0,
      starvation: 0,
      event: 0,
    };

    for (const entity of state.agents) {
      if (entity.alive === false) {
        deadIds.add(entity.id);
        if (!entity.deathRecorded) {
          // v0.8.3 entity-death cleanup (Bug A+D) — release reservation +
          // refund carry the moment we observe `alive===false`. Idempotent
          // via the `deathRecorded` guard so re-entrant ticks don't double-
          // refund.
          releaseDeathSideEffects(state, entity, services);
          recordDeath(state, entity, Boolean(entity.debug?.reachableFood), String(entity.debug?.nutritionSourceType ?? "none"), deathEvents);
        }
        continue;
      }

      if (entity.isStressWorker) {
        entity.hunger = 1;
        entity.rest = 1;
        entity.morale = 1;
        entity.mood = 1;
        entity.starvationSec = 0;
        continue;
      }

      let reachableFood = Boolean(entity.debug?.reachableFood);
      let nutritionSourceType = String(entity.debug?.nutritionSourceType ?? "none");
      if (Number(entity.hp ?? 1) <= 0) {
        const reason = entity.deathReason || "event";
        markDeath(entity, reason, nowSec, buildDeathContext(entity, state, reason, reachableFood, nutritionSourceType));
      } else {
        const starve = shouldStarve(entity, dt, state, services, nowSec);
        reachableFood = starve.reachableFood;
        nutritionSourceType = starve.nutritionSourceType;
        if (starve.isStarvationRisk) starvationRiskCount += 1;
        if (starve.shouldDie) {
          markDeath(entity, "starvation", nowSec, buildDeathContext(entity, state, "starvation", reachableFood, nutritionSourceType));
        }
      }

      if (entity.alive === false) {
        deadIds.add(entity.id);
        // v0.8.3 entity-death cleanup (Bug A+D) — same cleanup as the
        // already-dead branch above, fired on the tick where alive flips.
        releaseDeathSideEffects(state, entity, services);
        recordDeath(state, entity, reachableFood, nutritionSourceType, deathEvents);
      }
    }

    for (const animal of state.animals) {
      if (animal.alive === false) {
        deadIds.add(animal.id);
        if (!animal.deathRecorded) {
          // Animals don't hold reservations or carry, but call the helper
          // for consistency — releaseAll on a non-worker id is a no-op.
          releaseDeathSideEffects(state, animal, services);
          recordDeath(state, animal, false, "none", deathEvents);
        }
        continue;
      }

      const reachableFood = false;
      if (Number(animal.hp ?? 1) <= 0) {
        const reason = animal.deathReason || "predation";
        markDeath(animal, reason, nowSec, buildDeathContext(animal, state, reason, reachableFood, "none"));
      } else {
        const starve = shouldStarve(animal, dt, state, services, nowSec);
        if (starve.isStarvationRisk) starvationRiskCount += 1;
        if (starve.shouldDie) {
          markDeath(animal, "starvation", nowSec, buildDeathContext(animal, state, "starvation", reachableFood, "none"));
        }
      }

      if (animal.alive === false) {
        deadIds.add(animal.id);
        releaseDeathSideEffects(state, animal, services);
        recordDeath(state, animal, reachableFood, "none", deathEvents);
      }
    }

    state.metrics.starvationRiskCount = starvationRiskCount;

    // Medicine healing: heal the most injured worker each tick
    if (Number(state.resources?.medicine ?? 0) > 0) {
      let mostInjured = null;
      for (const agent of state.agents) {
        if (agent.type !== "WORKER" || agent.alive === false) continue;
        if ((agent.hp ?? agent.maxHp) >= agent.maxHp) continue;
        if (!mostInjured || (agent.hp ?? agent.maxHp) < (mostInjured.hp ?? mostInjured.maxHp)) {
          mostInjured = agent;
        }
      }
      if (mostInjured) {
        const healRate = Number(BALANCE.medicineHealPerSecond ?? 8);
        mostInjured.hp = Math.min(mostInjured.maxHp, (mostInjured.hp ?? mostInjured.maxHp) + healRate * dt);
        const medicineUsed = 0.1 * dt;
        state.resources.medicine -= medicineUsed;
        state.resources.medicine = Math.max(0, state.resources.medicine);
        // v0.8.2 Round-5 Wave-2 (01d Step 2): MortalitySystem consumption
        // path — medicine-heal is a true-source consumer. Worker food eating
        // lives in WorkerAISystem (freeze-locked) and is picked up by the
        // ResourceSystem net-delta fallback; here we add the one consumer
        // MortalitySystem directly owns.
        recordResourceFlow(state, "medicine", "consumed", medicineUsed);
      }
    }

    // R5 PB-combat-plumbing Step 1 — hoist `recomputeCombatMetrics(state)`
    // out of the `deadIds.size === 0` early-return so combat metrics refresh
    // every tick, not just on death-ticks. Without this, live raiders /
    // saboteurs / predators stayed invisible in `state.metrics.combat` until
    // somebody died, and downstream defense pipelines (RoleAssignmentSystem
    // GUARD draft, ProgressionSystem milestone, ColonyPlanner threat read)
    // all read stale data — the user-reported "worker 不主动攻击" repro
    // (P0-1 in PB-combat-engagement feedback). The pre-collected single-walk
    // optimisation from v0.8.7 keeps this < 0.5 ms / tick at 80 workers ×
    // 8 hostiles. The death-tick path below still benefits from the same
    // call (now via this hoist) — both branches re-emit consistent metrics.
    // v0.10.1 R6 PK — wrap with `recomputeCombatMetricsThrottled` so peaceful
    // ticks (no live threats + no entity churn) skip the full walk. Live-
    // threat ticks still walk every tick — GUARD reaction is unchanged.
    recomputeCombatMetricsThrottled(state);

    if (deadIds.size === 0) return;

    state.agents = state.agents.filter((entity) => !deadIds.has(entity.id));
    state.animals = state.animals.filter((entity) => !deadIds.has(entity.id));

    // v0.8.3 entity-death cleanup (Bug C) — after filtering dead entities out
    // of state.agents / state.animals, re-emit combat metrics so the metrics
    // reflect the post-filter list (the hoisted call above ran with the
    // pre-filter list; the difference matters for raiders/saboteurs that
    // died this tick — they should not be counted in nextTick's activeRaiders).
    recomputeCombatMetrics(state);

    if (state.controls.selectedEntityId && deadIds.has(state.controls.selectedEntityId)) {
      state.controls.selectedEntityId = null;
      state.controls.actionMessage = "Selected entity died and was removed.";
      state.controls.actionKind = "info";
    }

    state.debug.eventTrace ??= [];
    for (const msg of deathEvents) {
      state.debug.eventTrace.unshift(`[${nowSec.toFixed(1)}s] ${msg}`);
      pushWarning(state, msg, "warn", "MortalitySystem");
    }
    state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
  }
}
