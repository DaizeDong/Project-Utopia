import { ROLE } from "../../../config/constants.js";

const HERBIVORE_FLEE_ENTER_DIST = 3.4;

function aliveList(list = []) {
  return list.filter((item) => item && item.alive !== false);
}

function nearestDistanceSq(entity, list = []) {
  let bestSq = Infinity;
  for (const other of list) {
    const dx = Number(other.x ?? 0) - Number(entity.x ?? 0);
    const dz = Number(other.z ?? 0) - Number(entity.z ?? 0);
    const dSq = dx * dx + dz * dz;
    if (dSq < bestSq) bestSq = dSq;
  }
  return bestSq;
}

export function buildFeasibilityContext(entity, groupId, state, context = {}) {
  const carryFood = Number(entity?.carry?.food ?? 0);
  const carryWood = Number(entity?.carry?.wood ?? 0);
  const carryStone = Number(entity?.carry?.stone ?? 0);
  const carryHerbs = Number(entity?.carry?.herbs ?? 0);
  const carryTotal = carryFood + carryWood + carryStone + carryHerbs;
  const warehouses = Number(state?.buildings?.warehouses ?? 0);
  const farms = Number(state?.buildings?.farms ?? 0);
  const lumbers = Number(state?.buildings?.lumbers ?? 0);
  const sabotageTargets = warehouses + farms + lumbers;
  const hasFoodStorage = Number(state?.resources?.food ?? 0) > 0 && warehouses > 0;
  const hasAnyFoodSource = carryFood > 0 || hasFoodStorage;

  const predators = aliveList(
    context.predators
      ?? state?.animals?.filter?.((animal) => animal?.groupId === "predators" || animal?.kind === "PREDATOR")
      ?? [],
  );
  const herbivores = aliveList(
    context.herbivores
      ?? state?.animals?.filter?.((animal) => animal?.groupId === "herbivores" || animal?.kind === "HERBIVORE")
      ?? [],
  );
  const nearestPredatorDistance = Math.sqrt(nearestDistanceSq(entity, predators));

  const workerRole = String(entity?.role ?? "");
  const quarries = Number(state?.buildings?.quarries ?? 0);
  const herbGardens = Number(state?.buildings?.herbGardens ?? 0);
  const kitchens = Number(state?.buildings?.kitchens ?? 0);
  const smithies = Number(state?.buildings?.smithies ?? 0);
  const clinics = Number(state?.buildings?.clinics ?? 0);
  const hasWorkerWorksite = workerRole === ROLE.FARM ? farms > 0
    : workerRole === ROLE.WOOD ? lumbers > 0
    : workerRole === ROLE.STONE ? quarries > 0
    : workerRole === ROLE.HERBS ? herbGardens > 0
    : workerRole === ROLE.COOK ? kitchens > 0
    : workerRole === ROLE.SMITH ? smithies > 0
    : workerRole === ROLE.HERBALIST ? clinics > 0
    : workerRole === ROLE.HAUL ? warehouses > 0
    : farms + lumbers > 0;

  return {
    groupId,
    carryFood,
    carryWood,
    carryTotal,
    warehouses,
    farms,
    lumbers,
    sabotageTargets,
    hasFoodStorage,
    hasAnyFoodSource,
    hasWorkerWorksite,
    herbivoreCount: herbivores.length,
    nearestPredatorDistance,
    fleeEnterDistance: Number(context.fleeEnterDistance ?? HERBIVORE_FLEE_ENTER_DIST),
  };
}

export function isStateFeasible(entity, groupId, desiredState, state, context = {}) {
  const stateNode = String(desiredState ?? "");
  const fctx = context.feasibilityContext ?? buildFeasibilityContext(entity, groupId, state, context);

  if (groupId === "workers") {
    if (stateNode === "deliver") {
      if (!(fctx.carryTotal > 0 && fctx.warehouses > 0)) {
        return { ok: false, reason: "deliver requires carry>0 and warehouse>0" };
      }
    }
    if ((stateNode === "seek_task" || stateNode === "harvest") && !fctx.hasWorkerWorksite) {
      return { ok: false, reason: "worker role has no matching worksite" };
    }
    if ((stateNode === "seek_food" || stateNode === "eat") && !fctx.hasAnyFoodSource) {
      // v0.8.7 T0-2: also accept the carry-bypass case — no warehouse but
      // colony has food in state.resources. Workers must still be able to
      // reach `eat` so the WorkerAISystem.consumeEmergencyRation path fires
      // (LR-C1). Without this clause, a colony that has built food but never
      // a warehouse would have all its workers blocked from `eat`.
      const colonyFood = Number(state?.resources?.food ?? 0);
      if (!(colonyFood > 0 && fctx.warehouses === 0)) {
        return { ok: false, reason: "no reachable food source" };
      }
    }
    // v0.8.6 Tier 2 F3: also gate on `entity.debug.reachableFood`. Pre-fix
    // `hasAnyFoodSource` only checked stockpile + warehouse counts; a
    // walled-off worker with intact warehouses would loop seek_food → fail
    // → seek_food forever. With this gate, the feasibility check defers
    // those workers to wander/idle until the reachability probe succeeds.
    // v0.8.7 T0-2: Skip the reachability gate when no warehouse exists —
    // the carry-bypass eat path doesn't need a warehouse to be reachable
    // (it consumes from state.resources.food directly via consumeEmergencyRation).
    if ((stateNode === "seek_food" || stateNode === "eat")
        && entity?.debug && entity.debug.reachableFood === false
        && fctx.warehouses > 0) {
      return { ok: false, reason: "food not reachable from current position" };
    }
    // v0.8.4 building-construction (Agent A) — construction states require
    // at least one site in `state.constructionSites`. RoleAssignmentSystem
    // demotes BUILDERs when sites empty, but the feasibility gate stops a
    // newly-promoted BUILDER from picking the state on the same tick the
    // last site completes.
    if (stateNode === "construct" || stateNode === "seek_construct") {
      const sites = Array.isArray(state?.constructionSites) ? state.constructionSites : [];
      if (sites.length === 0) {
        return { ok: false, reason: "no construction sites" };
      }
    }
  }

  if (groupId === "traders" && (stateNode === "seek_trade" || stateNode === "trade")) {
    if (fctx.warehouses <= 0) return { ok: false, reason: "trade requires warehouse" };
  }

  if (groupId === "saboteurs" && stateNode === "sabotage") {
    if (fctx.sabotageTargets <= 0) return { ok: false, reason: "no sabotage targets" };
  }

  if (groupId === "predators" && (stateNode === "hunt" || stateNode === "feed")) {
    if (fctx.herbivoreCount <= 0) return { ok: false, reason: "no live herbivore prey" };
  }

  if (groupId === "herbivores" && stateNode === "flee") {
    if (!(fctx.nearestPredatorDistance <= fctx.fleeEnterDistance)) {
      return { ok: false, reason: "threat not within flee enter distance" };
    }
  }

  return { ok: true, reason: "" };
}

function bumpRejectMetrics(state, groupId) {
  state.metrics.feasibilityRejectCountByGroup ??= {};
  state.metrics.feasibilityRejectCountByGroup[groupId] =
    Number(state.metrics.feasibilityRejectCountByGroup[groupId] ?? 0) + 1;
}

export function recordFeasibilityReject(entity, state, groupId, source, requestedState, reason) {
  entity.debug ??= {};
  entity.debug.feasibilityReject = {
    source,
    requestedState,
    reason,
    simSec: Number(state?.metrics?.timeSec ?? 0),
  };
  entity.blackboard ??= {};
  entity.blackboard.lastFeasibilityReject = entity.debug.feasibilityReject;
  bumpRejectMetrics(state, groupId);
}

export function normalizeDesiredStateWithFeasibility(
  localDesired,
  policyDesired,
  aiDesired,
  strategy = "strict",
  options = {},
) {
  const check = typeof options.checkState === "function"
    ? options.checkState
    : () => ({ ok: true, reason: "" });
  const fallbackState = String(options.fallbackState ?? localDesired ?? "idle");
  const candidates = [
    { source: "local", state: localDesired },
    { source: "policy", state: policyDesired },
    { source: "ai", state: aiDesired },
  ];

  const rejects = [];
  let chosen = fallbackState;
  let chosenSource = "fallback";

  for (const candidate of candidates) {
    const stateNode = String(candidate.state ?? "");
    if (!stateNode) continue;
    const result = check(stateNode, candidate.source);
    if (!result.ok) {
      rejects.push({
        source: candidate.source,
        requestedState: stateNode,
        reason: String(result.reason ?? "not feasible"),
      });
      if (strategy === "strict") continue;
    }
    if (stateNode === chosen) {
      if (chosenSource === "fallback") chosenSource = candidate.source;
      continue;
    }
    chosen = stateNode;
    chosenSource = candidate.source;
  }

  return {
    desiredState: chosen,
    source: chosenSource,
    rejects,
  };
}
