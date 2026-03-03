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
  const carryTotal = carryFood + carryWood;
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
  const hasWorkerWorksite = workerRole === ROLE.FARM
    ? farms > 0
    : workerRole === ROLE.WOOD
      ? lumbers > 0
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
      return { ok: false, reason: "no reachable food source" };
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
    chosen = stateNode;
    chosenSource = candidate.source;
  }

  return {
    desiredState: chosen,
    source: chosenSource,
    rejects,
  };
}

