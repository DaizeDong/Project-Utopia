import { ANIMAL_KIND, ENTITY_TYPE, TILE } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { pushWarning } from "../../app/warnings.js";
import { aStar } from "../navigation/AStar.js";
import { findNearestTileOfTypes, worldToTile } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { recordResourceFlow } from "../economy/ResourceSystem.js";
import { audioSystem } from "../../audio/AudioSystem.js";

const NEARBY_FARM_SUPPLY_MAX_PATH_LEN = 16;
const WORKER_MEMORY_LIMIT = 6;
const WITNESS_NEARBY_DISTANCE = 12;

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
  entity.deathReason = reason;
  entity.deathSec = nowSec;
  entity.deathContext = context ?? null;
}

function resolveReachability(entity, state, services, fromTile, target, sourceType) {
  if (!target) return { reachable: false, sourceType: "none", pathLength: 0 };
  if (fromTile.ix === target.ix && fromTile.iz === target.iz) {
    return { reachable: true, sourceType, pathLength: 0 };
  }

  let path = services?.pathCache?.get?.(state.grid.version, fromTile, target) ?? null;
  if (!path) {
    path = aStar(state.grid, fromTile, target, state.weather.moveCostMultiplier, {
      tiles: state.weather?.hazardTileSet ?? null,
      penaltyMultiplier: state.weather?.hazardPenaltyMultiplier ?? 1,
    });
    if (path) {
      services?.pathCache?.set?.(state.grid.version, fromTile, target, path);
    }
  }

  const reachable = Array.isArray(path) && path.length > 0;
  return {
    reachable,
    sourceType: reachable ? sourceType : "none",
    pathLength: reachable ? Number(path.length ?? 0) : 0,
  };
}

function hasReachableNutritionSource(entity, state, services, nowSec) {
  if (Number(entity.carry?.food ?? 0) > 0) {
    return { reachable: true, sourceType: "carry", pathLength: 0 };
  }

  const bb = entity.blackboard ?? (entity.blackboard = {});
  const deathCtx = bb.deathContext ?? (bb.deathContext = {});
  const lastCheckSec = Number(deathCtx.lastFoodReachCheckSec ?? -Infinity);
  if (nowSec - lastCheckSec < 2.5 && typeof deathCtx.lastFoodReachable === "boolean") {
    return {
      reachable: deathCtx.lastFoodReachable,
      sourceType: String(deathCtx.lastFoodSourceType ?? "none"),
      pathLength: Number(deathCtx.lastFoodPathLength ?? 0),
    };
  }

  const fromTile = worldToTile(entity.x, entity.z, state.grid);

  if (Number(state.resources?.food ?? 0) > 0 && Number(state.buildings?.warehouses ?? 0) > 0) {
    const warehouse = findNearestTileOfTypes(state.grid, entity, [TILE.WAREHOUSE]);
    const resolved = resolveReachability(entity, state, services, fromTile, warehouse, "warehouse");
    if (resolved.reachable) {
      deathCtx.lastFoodReachable = true;
      deathCtx.lastFoodReachCheckSec = nowSec;
      deathCtx.lastFoodSourceTile = warehouse;
      deathCtx.lastFoodSourceType = resolved.sourceType;
      deathCtx.lastFoodPathLength = resolved.pathLength;
      return resolved;
    }
  }

  if (Number(state.buildings?.farms ?? 0) > 0) {
    const farm = findNearestTileOfTypes(state.grid, entity, [TILE.FARM]);
    const resolved = resolveReachability(entity, state, services, fromTile, farm, "nearby-farm");
    if (resolved.reachable && resolved.pathLength <= NEARBY_FARM_SUPPLY_MAX_PATH_LEN) {
      deathCtx.lastFoodReachable = true;
      deathCtx.lastFoodReachCheckSec = nowSec;
      deathCtx.lastFoodSourceTile = farm;
      deathCtx.lastFoodSourceType = resolved.sourceType;
      deathCtx.lastFoodPathLength = resolved.pathLength;
      return resolved;
    }
  }

  deathCtx.lastFoodReachable = false;
  deathCtx.lastFoodReachCheckSec = nowSec;
  deathCtx.lastFoodSourceType = "none";
  deathCtx.lastFoodPathLength = 0;
  return { reachable: false, sourceType: "none", pathLength: 0 };
}

function shouldStarve(entity, dt, state, services, nowSec) {
  const { hunger, holdSec } = deathThresholdFor(entity);
  const current = Number(entity.hunger ?? 1);

  if (entity.type === ENTITY_TYPE.WORKER || entity.type === ENTITY_TYPE.VISITOR) {
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
    const line = `[${nowSec.toFixed(1)}s] ${name} died (${reason})${tileSuffix}`;
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
          recordDeath(state, entity, Boolean(entity.debug?.reachableFood), String(entity.debug?.nutritionSourceType ?? "none"), deathEvents);
        }
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
        recordDeath(state, entity, reachableFood, nutritionSourceType, deathEvents);
      }
    }

    for (const animal of state.animals) {
      if (animal.alive === false) {
        deadIds.add(animal.id);
        if (!animal.deathRecorded) {
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

    if (deadIds.size === 0) return;

    state.agents = state.agents.filter((entity) => !deadIds.has(entity.id));
    state.animals = state.animals.filter((entity) => !deadIds.has(entity.id));

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
