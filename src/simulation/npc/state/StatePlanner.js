import { BALANCE } from "../../../config/balance.js";
import { ANIMAL_KIND, ROLE, TILE } from "../../../config/constants.js";
import { getTile, worldToTile } from "../../../world/grid/Grid.js";
import { listGroupStates } from "./StateGraph.js";
import {
  buildFeasibilityContext,
  isStateFeasible,
  normalizeDesiredStateWithFeasibility,
  recordFeasibilityReject,
} from "./StateFeasibility.js";

const POLICY_INTENT_TO_STATE = Object.freeze({
  workers: Object.freeze({
    eat: "seek_food",
    deliver: "deliver",
    rest: "seek_rest",
    farm: "seek_task",
    wood: "seek_task",
    quarry: "seek_task",
    gather_herbs: "seek_task",
    cook: "seek_task",
    smith: "seek_task",
    heal: "seek_task",
    haul: "seek_task",
    wander: "wander",
  }),
  traders: Object.freeze({
    trade: "seek_trade",
    eat: "seek_food",
    wander: "wander",
  }),
  saboteurs: Object.freeze({
    sabotage: "sabotage",
    scout: "scout",
    evade: "evade",
    eat: "seek_food",
    wander: "wander",
  }),
  herbivores: Object.freeze({
    flee: "flee",
    graze: "graze",
    migrate: "regroup",
    wander: "wander",
  }),
  predators: Object.freeze({
    hunt: "hunt",
    stalk: "stalk",
    feed: "feed",
    rest: "rest",
    wander: "roam",
  }),
});

function getWorkerHungerSeekThreshold(worker) {
  const base = Number(BALANCE.workerHungerSeekThreshold ?? 0.14);
  const override = Number(worker?.metabolism?.hungerSeekThreshold ?? base);
  return Math.min(0.8, Math.max(0.05, override));
}

function normalizeIntentKey(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function defaultFallbackState(groupId) {
  if (groupId === "workers") return "seek_task";
  if (groupId === "traders") return "seek_trade";
  if (groupId === "saboteurs") return "scout";
  if (groupId === "herbivores") return "graze";
  if (groupId === "predators") return "stalk";
  return "idle";
}

function hasActivePath(entity, state) {
  return Boolean(
    entity.path &&
      entity.pathIndex < entity.path.length &&
      entity.pathGridVersion === state.grid.version,
  );
}

function isAtTargetTile(entity, state) {
  if (!entity.targetTile) return false;
  const current = worldToTile(entity.x, entity.z, state.grid);
  return current.ix === entity.targetTile.ix && current.iz === entity.targetTile.iz;
}

function isTargetTileType(entity, state, targetTileTypes) {
  if (!entity.targetTile) return false;
  const tile = getTile(state.grid, entity.targetTile.ix, entity.targetTile.iz);
  return targetTileTypes.includes(tile);
}

function deriveWorkerDesiredState(worker, state) {
  const currentFsmState = worker.blackboard?.fsm?.state;
  const hunger = worker.hunger ?? 1;

  // Eat hysteresis: if already eating/seeking food, stay until hunger recovers past recover threshold
  if ((currentFsmState === "eat" || currentFsmState === "seek_food")
    && hunger < Number(BALANCE.workerHungerRecoverThreshold ?? 0.35)
    && state.resources.food > 0 && state.buildings.warehouses > 0) {
    return {
      desiredState: isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger-hysteresis",
    };
  }

  if (hunger < getWorkerHungerSeekThreshold(worker) && state.resources.food > 0 && state.buildings.warehouses > 0) {
    return {
      desiredState: isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger",
    };
  }

  // Rest need: seek rest when rest is critically low
  const restLevel = Number(worker.rest ?? 1);
  const restThreshold = Number(BALANCE.workerRestSeekThreshold ?? 0.2);
  const restRecoverThreshold = Number(BALANCE.workerRestRecoverThreshold ?? 0.6);
  // Rest hysteresis: if already resting, stay until recovered past threshold
  if ((currentFsmState === "rest" || currentFsmState === "seek_rest") && restLevel < restRecoverThreshold) {
    return { desiredState: currentFsmState === "rest" ? "rest" : "seek_rest", reason: "rule:rest-hysteresis" };
  }
  if (restLevel < restThreshold) {
    return { desiredState: "seek_rest", reason: "rule:rest-low" };
  }

  // Night behavior: prefer rest/wander during night when no urgent needs
  const isNight = Boolean(state.environment?.isNight);
  if (isNight && restLevel < Number(BALANCE.workerNightRestThreshold ?? 0.5)) {
    return { desiredState: "seek_rest", reason: "rule:night-rest" };
  }

  const hasWarehouse = state.buildings.warehouses > 0;
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0)
    + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
  const noWorkSite = (worker.role === ROLE.FARM && state.buildings.farms <= 0)
    || (worker.role === ROLE.WOOD && state.buildings.lumbers <= 0)
    || (worker.role === ROLE.STONE && Number(state.buildings?.quarries ?? 0) <= 0)
    || (worker.role === ROLE.HERBS && Number(state.buildings?.herbGardens ?? 0) <= 0)
    || (worker.role === ROLE.COOK && Number(state.buildings?.kitchens ?? 0) <= 0)
    || (worker.role === ROLE.SMITH && Number(state.buildings?.smithies ?? 0) <= 0)
    || (worker.role === ROLE.HERBALIST && Number(state.buildings?.clinics ?? 0) <= 0)
    || (worker.role === ROLE.HAUL && Number(state.buildings?.warehouses ?? 0) <= 0);
  // Deliver hysteresis: use lower threshold when already in deliver state.
  // HAUL workers deliver sooner (lower threshold) to maximize logistics throughput.
  // carryTotal > 0 gate is intentional: workers with empty carry should exit deliver even with hysteresis.
  const isHauler = worker.role === ROLE.HAUL;
  const deliverEntryThreshold = currentFsmState === "deliver"
    ? Number(BALANCE.workerDeliverLowThreshold ?? 1.2)
    : isHauler ? Number(BALANCE.workerDeliverLowThreshold ?? 1.2)
    : Number(BALANCE.workerDeliverThreshold ?? 2.4);
  if (hasWarehouse && carryTotal > 0 && (carryTotal >= deliverEntryThreshold || noWorkSite)) {
    return { desiredState: "deliver", reason: "rule:deliver" };
  }

  if (worker.role === ROLE.FARM && state.buildings.farms > 0) {
    const atFarm = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.FARM]);
    return { desiredState: atFarm ? "harvest" : "seek_task", reason: "rule:farm" };
  }

  if (worker.role === ROLE.WOOD && state.buildings.lumbers > 0) {
    const atLumber = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.LUMBER]);
    return { desiredState: atLumber ? "harvest" : "seek_task", reason: "rule:lumber" };
  }

  if (worker.role === ROLE.STONE && Number(state.buildings?.quarries ?? 0) > 0) {
    const atQuarry = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.QUARRY]);
    return { desiredState: atQuarry ? "harvest" : "seek_task", reason: "rule:quarry" };
  }

  if (worker.role === ROLE.HERBS && Number(state.buildings?.herbGardens ?? 0) > 0) {
    const atHerbGarden = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.HERB_GARDEN]);
    return { desiredState: atHerbGarden ? "harvest" : "seek_task", reason: "rule:herbs" };
  }

  if (worker.role === ROLE.COOK && Number(state.buildings?.kitchens ?? 0) > 0) {
    const atKitchen = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.KITCHEN]);
    return { desiredState: atKitchen ? "process" : "seek_task", reason: "rule:cook" };
  }

  if (worker.role === ROLE.SMITH && Number(state.buildings?.smithies ?? 0) > 0) {
    const atSmithy = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.SMITHY]);
    return { desiredState: atSmithy ? "process" : "seek_task", reason: "rule:smith" };
  }

  if (worker.role === ROLE.HERBALIST && Number(state.buildings?.clinics ?? 0) > 0) {
    const atClinic = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.CLINIC]);
    return { desiredState: atClinic ? "process" : "seek_task", reason: "rule:herbalist" };
  }

  if (worker.role === ROLE.HAUL && Number(state.buildings?.warehouses ?? 0) > 0) {
    // Haulers harvest from any available worksite, with lower deliver threshold
    const anyWorksite = state.buildings.farms > 0 || state.buildings.lumbers > 0
      || Number(state.buildings?.quarries ?? 0) > 0 || Number(state.buildings?.herbGardens ?? 0) > 0;
    if (anyWorksite) {
      const haulTargetTypes = [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN];
      const atWorksite = isAtTargetTile(worker, state) && isTargetTileType(worker, state, haulTargetTypes);
      return { desiredState: atWorksite ? "harvest" : "seek_task", reason: "rule:haul" };
    }
  }

  if (noWorkSite) return { desiredState: "wander", reason: "rule:no-worksite" };
  return { desiredState: "idle", reason: "rule:idle" };
}

function deriveTraderDesiredState(visitor, state) {
  if ((visitor.hunger ?? 1) < 0.22 && state.resources.food > 0) {
    return {
      desiredState: isAtTargetTile(visitor, state) && isTargetTileType(visitor, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger",
    };
  }
  if (state.buildings.warehouses <= 0) return { desiredState: "wander", reason: "rule:no-warehouse" };
  if (isAtTargetTile(visitor, state) && isTargetTileType(visitor, state, [TILE.WAREHOUSE])) {
    return { desiredState: "trade", reason: "rule:at-warehouse" };
  }
  return { desiredState: "seek_trade", reason: "rule:trade" };
}

function deriveSaboteurDesiredState(visitor, state) {
  if ((visitor.hunger ?? 1) < 0.2 && state.resources.food > 0) {
    return {
      desiredState: isAtTargetTile(visitor, state) && isTargetTileType(visitor, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger",
    };
  }
  if ((visitor.sabotageCooldown ?? 0) <= 0) return { desiredState: "sabotage", reason: "rule:ready" };
  if (hasActivePath(visitor, state)) return { desiredState: "scout", reason: "rule:path-active" };
  if ((visitor.sabotageCooldown ?? 0) > Number(BALANCE.sabotageCooldownMinSec ?? 7) * 0.5) {
    return { desiredState: "evade", reason: "rule:cooldown" };
  }
  return { desiredState: "scout", reason: "rule:scout" };
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function nearestPredator(herbivore, predators) {
  let best = null;
  let bestSq = Infinity;
  for (const predator of predators ?? []) {
    if (!predator || predator.alive === false) continue;
    const dSq = distanceSq(herbivore, predator);
    if (dSq < bestSq) {
      bestSq = dSq;
      best = predator;
    }
  }
  return { predator: best, distance: Math.sqrt(bestSq) };
}

function nearestHerbivore(predator, herbivores) {
  let best = null;
  let bestSq = Infinity;
  for (const prey of herbivores ?? []) {
    if (!prey || prey.alive === false) continue;
    const dSq = distanceSq(predator, prey);
    if (dSq < bestSq) {
      bestSq = dSq;
      best = prey;
    }
  }
  return { prey: best, distance: Math.sqrt(bestSq) };
}

function countNearbyKind(entity, list, radius = 3.2) {
  const r2 = radius * radius;
  let count = 0;
  for (const other of list ?? []) {
    if (!other || other.id === entity.id || other.alive === false) continue;
    const dx = other.x - entity.x;
    const dz = other.z - entity.z;
    if (dx * dx + dz * dz <= r2) count += 1;
  }
  return count;
}

function deriveHerbivoreDesiredState(animal, context) {
  const { predators = [], herbivores = [] } = context ?? {};
  const { predator, distance } = nearestPredator(animal, predators);
  const fleeLatch = Boolean(animal.blackboard?.fleeLatch);
  if (predator && (distance < 3.4 || (fleeLatch && distance < 4.8))) {
    return { desiredState: "flee", reason: "rule:predator-near" };
  }
  if ((animal.hunger ?? 1) < 0.55) return { desiredState: "graze", reason: "rule:hunger" };
  if (countNearbyKind(animal, herbivores, 3.4) >= 2) return { desiredState: "regroup", reason: "rule:herd" };
  return { desiredState: "wander", reason: "rule:wander" };
}

function derivePredatorDesiredState(animal, context) {
  const { herbivores = [] } = context ?? {};
  const { prey, distance } = nearestHerbivore(animal, herbivores);
  if (!prey) {
    return (animal.hunger ?? 1) > 0.86
      ? { desiredState: "rest", reason: "rule:no-prey-rest" }
      : { desiredState: "roam", reason: "rule:no-prey-roam" };
  }
  if (distance < Number(BALANCE.predatorAttackDistance ?? 0.9) * 1.1) {
    return { desiredState: "feed", reason: "rule:attack-range" };
  }
  if (distance < 5.2) return { desiredState: "hunt", reason: "rule:hunt" };
  return { desiredState: "stalk", reason: "rule:stalk" };
}

function isCriticalLocalState(groupId, localState) {
  if (groupId === "workers" || groupId === "traders" || groupId === "saboteurs") {
    return localState === "seek_food" || localState === "eat";
  }
  if (groupId === "herbivores") return localState === "flee";
  if (groupId === "predators") return localState === "feed";
  return false;
}

function isProtectedLocalState(groupId, localState) {
  if (groupId === "workers" && localState === "deliver") return true;
  return isCriticalLocalState(groupId, localState);
}

function applyPolicyIntentPreference(groupId, localDesired, localReason, entity, state) {
  const policy = entity.policy ?? state.ai.groupPolicies?.get?.(groupId)?.data ?? null;
  if (!policy || typeof policy !== "object") {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }

  const intentMap = POLICY_INTENT_TO_STATE[groupId] ?? null;
  if (!intentMap) {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }

  const intents = Object.entries(policy.intentWeights ?? {})
    .map(([intent, value]) => ({ key: normalizeIntentKey(intent), value: Number(value) || 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  if (intents.length === 0) {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }

  const top = intents[0];
  const second = intents[1]?.value ?? 0;
  const mappedState = intentMap[top.key] ?? null;
  if (!mappedState || !listGroupStates(groupId).includes(mappedState)) {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }
  if (groupId === "workers" && localDesired === "deliver" && mappedState !== localDesired) {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }

  const dominance = top.value - second;
  const strongSignal = top.value >= 0.95 && dominance >= 0.25;
  const veryStrongSignal = top.value >= 1.35 && dominance >= 0.45;
  const mapsToSurvivalState = mappedState === "seek_food" || mappedState === "eat";

  if (mapsToSurvivalState && !isCriticalLocalState(groupId, localDesired)) {
    return {
      desiredState: localDesired,
      reason: localReason,
      policyApplied: false,
      topIntent: top.key,
      topWeight: top.value,
    };
  }

  if (mappedState !== localDesired && !strongSignal) {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }

  if (isProtectedLocalState(groupId, localDesired) && mappedState !== localDesired && !veryStrongSignal) {
    return { desiredState: localDesired, reason: localReason, policyApplied: false };
  }

  const reason = mappedState === localDesired
    ? `${localReason}|policy-align:${top.key}`
    : `policy-intent:${top.key}`;

  return {
    desiredState: mappedState,
    reason,
    policyApplied: mappedState !== localDesired,
    topIntent: top.key,
    topWeight: top.value,
  };
}

function applyGroupTargetOverride(groupId, localDesired, localReason, entity, state, nowSec) {
  const entry = state.ai.groupStateTargets?.get?.(groupId);
  if (!entry) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  if (Number(entry.expiresAtSec ?? -1) <= nowSec) {
    state.ai.groupStateTargets.delete(groupId);
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  const allowed = listGroupStates(groupId);
  const targetState = String(entry.targetState ?? "");
  if (!allowed.includes(targetState)) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }
  if (groupId === "workers" && localDesired === "deliver" && targetState !== localDesired) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  const priority = Number(entry.priority ?? 0);
  if (priority < 0.35) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  if (isProtectedLocalState(groupId, localDesired) && priority < 0.75) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  if (targetState === localDesired) {
    return { desiredState: localDesired, reason: `${localReason}|ai-align`, aiApplied: false };
  }

  return {
    desiredState: targetState,
    reason: `ai-target:${targetState}(${String(entry.source ?? "llm")})`,
    aiApplied: true,
  };
}

export { deriveWorkerDesiredState as deriveWorkerDesiredStateExported };

export function recordDesiredGoal(entity, desiredState, state, nowSec) {
  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    prevPrevGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });

  const key = String(entity.id ?? "");
  const prev = logic.lastGoalsByEntity[key];
  const prevPrev = (logic.prevPrevGoalsByEntity ??= {})[key];
  const lastGoalSec = Number(entity.debug?.lastGoalSetSec ?? -Infinity);

  // Only count A→B→A oscillation within 1.5s window.
  // Exclude normal behavioral cycles: any transition within the standard work loop
  // (harvest, deliver, seek_task, process, idle, wander) or survival interrupts (eat, seek_food).
  const WORK_CYCLE_STATES = new Set(["harvest", "deliver", "seek_task", "process", "idle", "wander", "seek_rest", "rest"]);
  const SURVIVAL_STATES = new Set(["seek_food", "eat"]);
  const isNormalCycle =
    // Any transition between work-cycle states is a normal work loop
    (WORK_CYCLE_STATES.has(prevPrev) && WORK_CYCLE_STATES.has(prev))
    // Any transition involving survival states is a normal interruption
    || SURVIVAL_STATES.has(prev) || SURVIVAL_STATES.has(prevPrev);
  if (
    prev && prev !== desiredState
    && prevPrev === desiredState
    && !isNormalCycle
    && Number.isFinite(lastGoalSec) && nowSec - lastGoalSec <= 1.5
  ) {
    logic.goalFlipCount = Number(logic.goalFlipCount ?? 0) + 1;
    state.metrics.goalFlipCount = Number(state.metrics.goalFlipCount ?? 0) + 1;
  }

  // Update history only on actual state change
  if (prev !== desiredState) {
    logic.prevPrevGoalsByEntity[key] = prev;
    logic.lastGoalsByEntity[key] = desiredState;
  }
  entity.debug ??= {};
  entity.debug.lastGoalSetSec = nowSec;
}

export function planEntityDesiredState(entity, state, context = {}) {
  const nowSec = Number(state.metrics.timeSec ?? 0);
  const groupId = String(entity.groupId ?? "");

  let local = { desiredState: "idle", reason: "rule:idle" };
  if (groupId === "workers") {
    local = deriveWorkerDesiredState(entity, state);
  } else if (groupId === "traders") {
    local = deriveTraderDesiredState(entity, state);
  } else if (groupId === "saboteurs") {
    local = deriveSaboteurDesiredState(entity, state);
  } else if (groupId === "herbivores") {
    local = deriveHerbivoreDesiredState(entity, context);
  } else if (groupId === "predators") {
    local = derivePredatorDesiredState(entity, context);
  }

  const feasibilityContext = buildFeasibilityContext(entity, groupId, state, context);
  const checkState = (stateNode) =>
    isStateFeasible(entity, groupId, stateNode, state, { ...context, feasibilityContext });
  const fallbackState = defaultFallbackState(groupId);

  const policyMerged = applyPolicyIntentPreference(groupId, local.desiredState, local.reason, entity, state);
  const aiMerged = applyGroupTargetOverride(groupId, policyMerged.desiredState, policyMerged.reason, entity, state, nowSec);
  const resolved = normalizeDesiredStateWithFeasibility(
    local.desiredState,
    policyMerged.desiredState,
    aiMerged.desiredState,
    "strict",
    {
      checkState,
      fallbackState,
    },
  );

  const localReject = resolved.rejects.find((item) => item.source === "local") ?? null;
  const policyReject = resolved.rejects.find((item) => item.source === "policy") ?? null;
  const aiReject = resolved.rejects.find((item) => item.source === "ai") ?? null;
  if (policyReject) {
    recordFeasibilityReject(
      entity,
      state,
      groupId,
      "policy",
      policyReject.requestedState,
      policyReject.reason,
    );
  }
  if (aiReject) {
    recordFeasibilityReject(
      entity,
      state,
      groupId,
      "ai",
      aiReject.requestedState,
      aiReject.reason,
    );
  }

  const finalReason = resolved.source === "ai"
    ? aiMerged.reason
    : resolved.source === "policy"
      ? policyMerged.reason
      : resolved.source === "local"
        ? local.reason
        : `fallback:${fallbackState}${localReject ? `(${localReject.reason})` : ""}`;

  recordDesiredGoal(entity, resolved.desiredState, state, nowSec);

  entity.debug ??= {};
  entity.debug.localDesiredState = local.desiredState;
  entity.debug.policyDesiredState = policyMerged.desiredState;
  entity.debug.aiDesiredState = aiMerged.desiredState;
  entity.debug.finalDesiredState = resolved.desiredState;
  entity.debug.policyApplied = resolved.source === "policy" && policyMerged.desiredState !== local.desiredState;
  entity.debug.policyTopIntent = policyMerged.topIntent ?? "";
  entity.debug.policyTopWeight = Number(policyMerged.topWeight ?? 0);
  entity.debug.policyRejectedReason = policyReject?.reason ?? "";
  entity.debug.aiRejectedReason = aiReject?.reason ?? "";
  entity.debug.desiredStateNode = resolved.desiredState;
  entity.debug.aiTargetApplied = resolved.source === "ai";
  entity.debug.aiTargetReason = resolved.source === "ai" ? aiMerged.reason : "";

  return {
    groupId,
    desiredState: resolved.desiredState,
    reason: finalReason,
    localDesiredState: local.desiredState,
    aiApplied: resolved.source === "ai",
  };
}
