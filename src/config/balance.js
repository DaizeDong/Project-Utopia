import { WEATHER } from "./constants.js";

export const BUILD_COST = Object.freeze({
  road: { wood: 1 },
  farm: { wood: 5 },
  lumber: { wood: 5 },
  warehouse: { wood: 10 },
  wall: { wood: 2 },
  erase: { wood: 0 },
  quarry: { wood: 6 },
  herb_garden: { wood: 4 },
  kitchen: { wood: 8, stone: 3 },
  smithy: { wood: 6, stone: 5 },
  clinic: { wood: 6, herbs: 2 },
  bridge: { wood: 3, stone: 1 },
  // v0.8.4 strategic walls + GATE (Agent C). GATE is a wall-line door; same
  // base wood cost as a small structure plus 1 stone for the hinges/lintel.
  // Soft-cost escalator below applies to the Nth gate.
  gate: { wood: 4, stone: 1 },
});

// v0.8.2 Round-5 Wave-3 (02c-speedrunner) — Building-stacking soft-cost
// escalator. For each repeatable building kind, once the colony has built
// `softTarget` of them, each additional copy costs
//   base × min(cap, 1 + perExtra × max(0, existingCount - softTarget))
// for wood / stone / herbs. Kinds not listed here fall through to BUILD_COST
// at face value (road, bridge, erase are always base cost).
//
// Tuning rationale (Feedbacks/02c run-1: warehouse×10 + wall×19 + kitchen×5
// build-spam):
//  - warehouse/wall: wide softTarget (scenario objective size) because the
//    scenario already asks for 2-8 of them; beyond that each extra copy
//    needs to hurt progressively so the reviewer cannot Dev-pump past 49.
//  - kitchen/smithy/clinic: tight softTarget=1 with steep perExtra=0.35 —
//    duplicate processors share no resource, so the second copy is a
//    crutch for intent coverage rather than throughput.
//  - farm/lumber/quarry: shallow perExtra so organic growth is not
//    penalised; the softTarget is the minimum count for a self-sustaining
//    chain.
//  - herb_garden: softTarget=2 matches the scenario recipe gate for a
//    clinic pipeline.
// v0.8.5 Tier 3 build-cost escalator changes:
//  - warehouse perExtra 0.20 → 0.30 (warehouses are the design pivot;
//    steeper escalation forces spatial planning), perExtraBeyondCap 0.08
//    → 0.25 (post-cap was effectively flat; spam costs ~4× base now),
//    hardCap 20 → 15 (20 was effectively no cap).
//  - wall perExtraBeyondCap 0.05 → 0.18 (anti-cheese intent).
//  - kitchen perExtra 0.35 → 0.25 (LLM never built 2nd kitchen even when
//    needed; soften the punishment).
//  - farm softTarget 6 → 4 (the 6-flat-cost zone is exactly the cluster
//    the spec wanted to discourage).
//  - lumber softTarget 4 → 2 (combined with bigger nodes, 2 free lumbers
//    per node is the right ratio).
// v0.8.5.1 hotfix — over-tightened farm/lumber softTargets caused Day 30
// DevIndex regression (33.56 → 22.88). Compromise back to mid-points:
// farm softTarget 4 → 5; lumber softTarget 2 → 3. Depletion still
// tightens vs v0.8.4 but early growth has more headroom.
export const BUILD_COST_ESCALATOR = Object.freeze({
  warehouse: Object.freeze({ softTarget: 2, perExtra: 0.3, cap: 2.5, perExtraBeyondCap: 0.25, hardCap: 15 }),
  wall: Object.freeze({ softTarget: 8, perExtra: 0.1, cap: 2.0, perExtraBeyondCap: 0.18, hardCap: 40 }),
  kitchen: Object.freeze({ softTarget: 1, perExtra: 0.25, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  smithy: Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  clinic: Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  farm: Object.freeze({ softTarget: 5, perExtra: 0.1, cap: 1.8, perExtraBeyondCap: 0.05 }),
  lumber: Object.freeze({ softTarget: 3, perExtra: 0.1, cap: 1.8, perExtraBeyondCap: 0.05 }),
  quarry: Object.freeze({ softTarget: 3, perExtra: 0.15, cap: 1.8, perExtraBeyondCap: 0.05 }),
  herb_garden: Object.freeze({ softTarget: 2, perExtra: 0.15, cap: 2.0, perExtraBeyondCap: 0.05 }),
  // v0.8.4 strategic walls + GATE (Agent C). Soft-cost mirrors wall but with
  // a tighter softTarget (4) so the price escalates after the first quartet
  // — players placing a 5th gate are likely creating a leaky wall line.
  gate: Object.freeze({ softTarget: 4, perExtra: 0.15, cap: 2.0, perExtraBeyondCap: 0.05, hardCap: 24 }),
});

/**
 * Compute the escalated build cost for the Nth copy of `kind`. The base
 * cost comes from BUILD_COST and is multiplied by the escalator factor
 *   min(cap, 1 + perExtra × max(0, existingCount - softTarget))
 * for each resource axis (wood / stone / herbs). If `kind` is not in
 * BUILD_COST_ESCALATOR (road / bridge / erase), the base cost is returned
 * unchanged.
 *
 * Results are rounded up (Math.ceil) so integer resource pools are never
 * gated by a fractional cost. Keys absent on the base cost object stay
 * absent on the result (no phantom "stone: 0" axes that confuse canAfford).
 *
 * @param {string} kind — build tool key (e.g. "warehouse")
 * @param {number} existingCount — how many copies already exist
 * @returns {Record<string, number>} — { wood?, stone?, herbs?, food? }
 */
export function computeEscalatedBuildCost(kind, existingCount) {
  const base = BUILD_COST[kind] ?? {};
  const esc = BUILD_COST_ESCALATOR[kind];
  if (!esc) {
    return { ...base };
  }
  const count = Math.max(0, Number(existingCount) | 0);
  const over = Math.max(0, count - Number(esc.softTarget ?? 0));
  const rawMultiplier = 1 + Number(esc.perExtra ?? 0) * over;
  const cap = Number(esc.cap ?? rawMultiplier);
  let multiplier;
  if (rawMultiplier > cap && esc.perExtraBeyondCap != null) {
    // Beyond the cap plateau: continue linear growth at a shallower rate so
    // stacking spam still costs more each time (no flat ceiling cheese).
    const stepsAboveCap = rawMultiplier - cap;
    multiplier = cap + stepsAboveCap * Number(esc.perExtraBeyondCap);
  } else {
    multiplier = Math.min(cap, rawMultiplier);
  }
  const out = {};
  for (const [res, amount] of Object.entries(base)) {
    out[res] = Math.ceil(Number(amount ?? 0) * multiplier);
  }
  return out;
}

/**
 * Returns whether a building kind has reached its hard placement cap.
 * Hard-capped kinds block all further placement in BuildAdvisor.
 */
export function isBuildKindHardCapped(kind, existingCount) {
  const esc = BUILD_COST_ESCALATOR[kind];
  const hardCap = esc?.hardCap != null ? Number(esc.hardCap) : null;
  if (hardCap == null) return { capped: false, hardCap: null };
  const capped = Number(existingCount) >= hardCap;
  return { capped, hardCap };
}

/**
 * Map a build tool key to the plural key used in `state.buildings` so
 * callers can look up the current count for escalator input.
 *
 * @param {string} kind
 * @returns {string}
 */
export function pluralBuildingKey(kind) {
  switch (kind) {
    case "warehouse": return "warehouses";
    case "wall": return "walls";
    case "kitchen": return "kitchens";
    case "smithy": return "smithies";
    case "clinic": return "clinics";
    case "farm": return "farms";
    case "lumber": return "lumbers";
    case "quarry": return "quarries";
    case "herb_garden": return "herbGardens";
    // v0.8.4 strategic walls + GATE (Agent C) — gate count tracked under
    // `state.buildings.gates` so the escalator can read existing count.
    case "gate": return "gates";
    default: return kind;
  }
}

export const CONSTRUCTION_BALANCE = Object.freeze({
  salvageRefundRatio: 0.5,
  worksiteAccessRadius: 2,
  warehouseRoadRadius: 1,
  warehouseSpacingRadius: 5,
});

export const INITIAL_RESOURCES = Object.freeze({
  food: 400,
  wood: 80,
  stone: 15,
  herbs: 8,
});

export const INITIAL_POPULATION = Object.freeze({
  workers: 12,
  visitors: 4,
  herbivores: 3,
  predators: 1,
});

// v0.8.0 Phase 7.A § 14.2: +0.05 lumberProductionMultiplier across all
// weather modes (wood undersupply was constraining long-horizon survival).
export const WEATHER_MODIFIERS = Object.freeze({
  [WEATHER.CLEAR]: { moveCostMultiplier: 1.0, farmProductionMultiplier: 1.0, lumberProductionMultiplier: 1.05 },
  [WEATHER.RAIN]: { moveCostMultiplier: 1.15, farmProductionMultiplier: 1.0, lumberProductionMultiplier: 1.0 },
  [WEATHER.STORM]: { moveCostMultiplier: 1.3, farmProductionMultiplier: 0.8, lumberProductionMultiplier: 0.95 },
  [WEATHER.DROUGHT]: { moveCostMultiplier: 1.0, farmProductionMultiplier: 0.55, lumberProductionMultiplier: 1.05 },
  [WEATHER.WINTER]: { moveCostMultiplier: 1.25, farmProductionMultiplier: 0.65, lumberProductionMultiplier: 0.9 },
});

export const BALANCE = Object.freeze({
  hungerDecayPerSecond: 0.014,
  hungerEatRatePerSecond: 5.0,
  hungerEatRecoveryPerFoodUnit: 0.04,
  workerHungerDecayPerSecond: 0.0055,
  workerHungerSeekThreshold: 0.18,
  workerStarvingPreemptThreshold: 0.22,
  workerCarryEatInEmergency: true,
  workerHungerRecoverThreshold: 0.42,
  workerEatRecoveryTarget: 0.70,
  workerHungerEatRecoveryPerFoodUnit: 0.11,
  // v0.10.1-h (P4) — at-warehouse fast-eat flow cap.
  // hungerRecovered exits EATING when hunger >= workerEatRecoveryTarget (0.70).
  // Per-worker: 0.60 food/sec → (0.70-0.10)/0.11/0.60 ≈ 9 s full recovery.
  // Global cap: 4.0 food/sec shared → 6.7 uncapped workers; workers 7-16
  //   spill to carryEatStep (also 0.60/s). Total drain ≤ ~9.6 food/s peak,
  //   but with 94.5 s work cycle average demand is only ~0.09 food/s per worker.
  // 9 s eat + 94.5 s work = ~91% productive (from ~83% at 0.30/s).
  warehouseEatRatePerWorkerPerSecond: 0.60,
  warehouseEatCapPerSecond: 4.0,
  resourceCollapseCarryGrace: 0.5,
  visitorHungerDecayPerSecond: 0.0085,
  visitorHungerRecoveryPerSecond: 0.16,
  herbivoreHungerDecayPerSecond: 0.0095,
  herbivoreGrazeRecoveryPerSecond: 0.085,
  herbivoreGrazeSearchRadius: 8,
  herbivoreFarmAttractionBonus: 1.15,
  herbivoreHomeZoneBias: 0.68,
  herbivoreCoreAvoidancePenalty: 0.45,
  herbivoreFarmPressurePerSecond: 0.34,
  herbivoreFarmPressureDecayPerSecond: 0.16,
  ecologyFarmYieldPenaltyPerPressure: 0.44,
  ecologyFarmYieldPenaltyMax: 0.7,
  predatorHungerDecayPerSecond: 0.012,
  predatorHungerRecoveryOnHit: 0.24,
  predatorAttackDamage: 26,
  predatorAttackDistance: 0.9,
  predatorAttackCooldownSec: 1.4,
  predatorPatrolRefreshSec: 1.6,
  predatorFarmPressureAttraction: 1.05,
  predatorHomeZoneBias: 0.72,
  workerSpeed: 2.2,
  roadSpeedMultiplier: 1.35,
  roadLogisticsBonus: 1.15,
  visitorSpeed: 1.95,
  herbivoreSpeed: 1.85,
  predatorSpeed: 2.25,
  boidsNeighborRadius: 1.9,
  boidsSeparationRadius: 0.9,
  boidsWeights: {
    separation: 1.4,
    alignment: 0.52,
    cohesion: 0.34,
    seek: 1.22,
  },
  boidsGroupProfiles: {
    workers: {
      neighborRadius: 2.2,
      separationRadius: 1.4,
      weights: { separation: 2.6, alignment: 0.12, cohesion: 0.04, seek: 1.22 },
    },
    traders: {
      neighborRadius: 1.55,
      separationRadius: 1.12,
      weights: { separation: 2.0, alignment: 0.16, cohesion: 0.06, seek: 1.35 },
    },
    saboteurs: {
      neighborRadius: 1.6,
      separationRadius: 1.1,
      weights: { separation: 2.08, alignment: 0.2, cohesion: 0.06, seek: 1.3 },
    },
    herbivores: {
      neighborRadius: 2.35,
      separationRadius: 0.9,
      weights: { separation: 1.25, alignment: 0.8, cohesion: 0.62, seek: 1.08 },
    },
    predators: {
      neighborRadius: 2.1,
      separationRadius: 0.86,
      weights: { separation: 1.35, alignment: 0.68, cohesion: 0.54, seek: 1.18 },
    },
  },
  managerIntervalSec: 1.2,
  // Phase 7.A § 14.2: 14 → 18. Aligns emergency trigger with 48h death grace,
  // reducing AI panic flips when food momentarily dips.
  foodEmergencyThreshold: 18,
  productionCooldownSec: 0.9,
  workerDeliverThreshold: 1.6,
  workerDeliverLowThreshold: 0.85,
  // Phase 7.A § 14.2: 1.5 → 2.2. Damps worker intent flapping so food gathers
  // and deliveries are less likely to be interrupted by shallow priority noise.
  workerIntentCooldownSec: 2.2,
  workerCarryPressureSec: 3.8,
  workerFarDepotDistance: 12,
  workerUnloadRatePerSecond: 4.2,
  warehouseQueuePenalty: 0.32,
  // Phase 7.A § 14.2: 3 → 4. Small colonies no longer queue after M2 intake cap.
  warehouseSoftCapacity: 4,
  worksiteCoverageSoftRadius: 10,
  worksiteCoverageHardRadius: 16,
  objectiveFarmRatioMin: 0.18,
  objectiveFarmRatioMax: 0.82,
  // --- v0.8.2 Round-5 Wave-1 "w1-fallback-loop-merged" — fallback AI quota
  // feedback loop (01b-playability + 02a-rimworld-veteran). ---
  //
  // `roleQuotaScaling` turns the previously hardcoded "1 per specialist role"
  // default into a population-aware formula. RoleAssignmentSystem multiplies
  // `n * <role>PerWorker` and floors to the nearest integer (with a minimum of
  // 1 when the gate is satisfied) to derive the scaled quota. The player's
  // `state.controls.roleQuotas` slider still acts as an upper bound — so the
  // effective slot count is `min(scaled, playerMax)`. `haulMinPopulation: 8`
  // activates HAUL earlier than the old n>=10 threshold, matching the
  // population at which single-hauler logistics starts to visibly choke.
  //
  // `fallbackIdleChainThreshold: 15` gates ColonyPlanner's Priority 3.75
  // "idle processing chain" reassign_role hint and RoleAssignmentSystem's
  // pipeline-idle boost: if kitchen exists but COOK=0 and food stockpile >=
  // 15, the planner emits a reassign_role step and the role assigner forces
  // cookSlots=1 on the next tick. Same threshold guards smithy/clinic
  // pipeline-idle boosts.
  roleQuotaScaling: Object.freeze({
    // v0.8.2 Round-5b Wave-1 (01b Step 1) — discrete population-band table.
    // Replaces the pop<8 perWorker×floor path that produced a 6-specialist
    // contention for 1 slot at n=4 (allocation loss → fallback planner
    // cooked for <30s and Dev index froze). bandTable explicitly enumerates
    // which specialists may activate per pop band. A band-hit SKIPS the
    // minFloor=1 promotion, so band entries with value 0 stay 0 (which is
    // what kills the allocation-loss at pop=4). n>=8 falls through to the
    // Wave-1 perWorker formula below (no regression risk for seed=7/42).
    // v0.8.2 Round-6 Wave-1 (01b-structural Step 1) — structural zeros fix.
    // Round 5 RED: all bands had allow=1 which reproduced the allocation-loss
    // at pop=4 (6 specialists contending for 1 slot). The fix: band entries
    // with 0 MUST stay 0 — computePopulationAwareQuotas does NOT apply
    // minFloor to band-hit entries (only the n>=8 perWorker fall-through path
    // applies minFloor=1). This is the core structural repair.
    //
    // Band semantics (per v2 debugger Round-6 mandate #2):
    //   n<=3: farm-only — no specialist has headcount to run anything
    //   n 4-5: only cook may activate (cook=1, all others=0)
    //   n 6-7: cook + haul + stone may activate; smith/herbalist/herbs still 0
    //   n>=8: fall-through to perWorker formula (Wave-1 behaviour retained)
    bandTable: [
      { minPop: 0, maxPop: 3, allow: { cook: 0, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 } },
      { minPop: 4, maxPop: 5, allow: { cook: 1, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 } },
      { minPop: 6, maxPop: 7, allow: { cook: 1, smith: 0, herbalist: 0, haul: 1, stone: 1, herbs: 0 } },
      // minPop: 8+ → fall-through to perWorker path (Wave-1 behaviour retained).
    ],
    bandHysteresisPop: 1,
    // FARM cannibalise safety valve: when specialistBudget === 0, kitchen
    // already built, and food is comfortably above emergency threshold, the
    // cook may "borrow" a single FARM reserve slot to unblock the meal
    // pipeline at pop=4 (where the band allows cook=1 but reserved=3 takes
    // 75% of labour). Cooldown + food multiplier + (farmMin - cannibalised) > 1
    // hard floor keep seed=7 FARM throughput safe.
    farmCannibaliseEnabled: true,
    farmCannibaliseFoodMult: 1.5,
    farmCannibaliseCooldownTicks: 3,
    // v0.8.5 Tier 3: 1/8 → 1/10. Over-provisioning; 16-pop = 1 cook is plenty
    // (1 cook = ~21 meals/min vs ~3/min consumption per 16 workers).
    cookPerWorker: 1 / 10,
    haulPerWorker: 1 / 6,
    herbalistPerWorker: 1 / 12,
    smithPerWorker: 1 / 10,
    stonePerWorker: 1 / 8,
    herbsPerWorker: 1 / 10,
    // v0.8.5 Tier 1 B4: 8 → 6. Fixes a doc/code drift where bandTable allowed
    // haul=1 for pop 6-7, but RoleAssignmentSystem gated haul on n >= 8 and
    // silently overrode the band entry. Lower to 6 so bandTable haul=1
    // actually fires.
    haulMinPopulation: 6,
    minFloor: 1,
    emergencyOverrideCooks: 1,
  }),
  fallbackIdleChainThreshold: 15,
  // v0.8.2 Round-5b Wave-1 (01b Step 5) — band-aware idle-chain threshold.
  // Low-pop fallback planners need a LOWER food bar for the kitchen-idle
  // reassign_role hint because food is consumed fast and rarely reaches 15
  // at pop=4 (chicken-and-egg: no cook → no meals → no food buffer → no
  // threshold trigger → no cook emit). Drop to 6 below workerCount 6.
  fallbackIdleChainThresholdLowPop: 6,
  fallbackIdleChainLowPopBand: 6,
  // v0.8.2 Round-5b (02a-rimworld-veteran Step 1) — Fast-Forward delivery.
  // Round 5 reviewer measured 4× yielding only ~1.2× effective because
  // maxSteps=6/frame + accumulator cap 0.5s dropped time whenever frameDt
  // drifted above 16ms. Phase 10 long-horizon hardening already validated
  // 12 steps/frame holds determinism, so we double the cap and raise the
  // accumulator cap to 2.0s to survive tab-visibility throttling.
  fastForwardScheduler: Object.freeze({
    maxStepsPerFrame: 12,
    accumulatorSoftCapSec: 2.0,
    hiddenTabCatchupHz: 60,
  }),
  // v0.8.2 Round-5b (02a Step 5) — render hitbox tuning.
  // Reviewer 02a reported zero successful synthetic-clicks on workers at
  // 1440p/1920p. Constants surfaced via balance so uiProfile can diverge.
  renderHitboxPixels: Object.freeze({
    entityPickFallback: 24,
    entityPickGuard: 36,
    rpgProfileBonusPx: 6,
  }),
  // v0.8.2 Round-5b (02a Step 3) — scenario objective regression event window.
  // When BUILDING_DESTROYED fires within this window, OBJECTIVE_REGRESSED is
  // back-annotated with cause='wildfire'/'erase'. Beyond window, cause='unknown'.
  scenarioObjectiveRegressionWindowSec: 8,
  // v0.8.7 T4-2: removed `objectiveHoldDecayPerSecond` — declared but never
  // read (audited the codebase: zero call sites consume it). Was originally
  // intended for StrategicDirector / ColonyPlanner objective-score decay
  // but the implementation never landed; deletion is simpler than wiring it
  // up post-hoc since the v0.8.6 R2/R3 LLM directors took over objective
  // arbitration with their own commitment tracking.
  recoveryCooldownSec: 30,
  recoveryWindowSec: 16,
  // v0.8.5 Tier 3: 3 → 2. 3 says "the system fixed it"; 2 feels like real
  // comebacks (the player has to actually rebuild after a crisis).
  recoveryChargeCap: 2,
  // v0.8.5 Tier 3: 55 → 45. Wider warning band gives 30-60s lead time
  // before the trigger threshold (58) fires.
  recoveryHintRiskThreshold: 45,
  recoveryTriggerRiskThreshold: 58,
  recoveryCriticalResourceThreshold: 12,
  recoveryCriticalProsperityThreshold: 30,
  recoveryCriticalThreatThreshold: 55,
  visitorTradeDepotZoneBonus: 0.65,
  visitorTradeConnectedRouteBonus: 0.55,
  visitorTradeWallBonusPerWall: 0.08,
  visitorTradeMaxWallBonus: 0.32,
  visitorTradeRoadNeighborBonus: 0.07,
  visitorTradeDistancePenalty: 0.05,
  sabotageFrontierZoneBonus: 0.65,
  sabotageDepotZoneBonus: 0.45,
  sabotageWarehousePriorityBonus: 0.35,
  sabotageRoadNeighborBonus: 0.12,
  sabotageWallPenaltyPerWall: 0.24,
  sabotageMaxWallPenalty: 0.72,
  sabotageDefenseBlockPerWall: 0.12,
  sabotageResistanceBlockWeight: 0.3,
  trafficSampleIntervalSec: 0.45,
  trafficSoftTileLoad: 2.15,
  trafficHotspotTileLoad: 3.2,
  trafficPenaltyPerLoad: 0.28,
  trafficNeighborPenaltyRatio: 0.46,
  trafficMaxPenaltyMultiplier: 2.2,
  trafficCrowdWeights: {
    worker: 1,
    visitor: 0.92,
    herbivore: 0.58,
    predator: 0.72,
  },
  sabotageCooldownMinSec: 18,
  sabotageCooldownMaxSec: 30,
  // v0.8.5 Tier 3: 12 → 22. Match event durations to avoid mid-event
  // director thrash (most events run 20-30s).
  environmentDecisionIntervalSec: 22,
  policyDecisionIntervalSec: 10,
  // v0.8.5 Tier 3: 24 → 30. Eliminate overlap with refresh interval so
  // policy churn doesn't compound the director thrash.
  policyTtlDefaultSec: 30,
  doctrineMasteryRewardMultiplier: 1.08,
  maxEventIntensity: 3,
  wildlifeSpawnRadiusBonus: 3,
  // v0.8.8 B2 — leash radius (Manhattan) for animals that fail to find a
  // valid in-zone target. Pre-fix the fallback used randomPassableTile()
  // which could teleport animals across the entire map, breaking the
  // illusion of territory. Now we sample inside this radius around the
  // home zone anchor (or current pos as last resort) before falling
  // back to "stay put".
  wildlifeZoneLeashRadius: 12,
  weatherPressureProsperityPenalty: 4.5,
  eventPressureProsperityPenalty: 3.0,
  contestedZoneProsperityPenalty: 0.8,
  weatherPressureThreat: 2.0,
  eventPressureThreat: 4.5,
  contestedZoneThreat: 1.5,
  banditRaidRouteBonus: 0.28,
  banditRaidDepotBonus: 0.22,
  banditRaidChokeBonus: 0.34,
  banditRaidWallMitigationPerWall: 0.06,
  banditRaidHazardPressureScale: 0.52,
  // Phase 7.A § 14.2: 0.36 → 0.28. The raid escalator already scales
  // intensity by DevIndex tier; the per-pressure loss was double-taxing.
  // v0.8.5 Tier 3: 0.28 → 0.22. High-tier raid still double-taxes via
  // escalator + this; soften further now that escalator is on log curve.
  banditRaidLossPerPressure: 0.22,
  banditRaidSecondaryImpactPressure: 1.2,
  tradeCaravanDepotReadyBonus: 0.42,
  tradeCaravanConnectedRouteBonus: 0.24,
  tradeCaravanRoadSupportBonus: 0.055,
  tradeCaravanWallSafetyBonusPerWall: 0.05,
  tradeCaravanMaxWallSafetyBonus: 0.24,
  tradeCaravanHazardPenaltyPerPressure: 0.22,
  animalMigrationPressurePerHazard: 0.38,
  animalMigrationWildlifeZoneBonus: 0.18,
  lossGracePeriodSec: 90,
  // Phase 1: Resource chain production rates
  quarryProductionPerSecond: 0.45,
  herbGardenProductionPerSecond: 0.28,
  // Phase 7.A § 14.2: 3.0 → 2.8. Shorter kitchen cycle eases the
  // wood-equivalent bottleneck on meal throughput.
  // v0.8.5.1 hotfix: 2.8 → 2.3. After the v0.8.5 mealOutput drop the
  // colony-wide meal flow tightened; faster cycle restores throughput
  // for the recovering Day-30 baseline without rolling back mealOutput.
  kitchenCycleSec: 2.3,
  kitchenFoodCost: 2,
  // v0.8.5 Tier 3: 1 → 0.85. Meals × 2.0 mult = effectively 2-equiv at
  // half eat-rate; making kitchen flow-equivalent (not flow-multiplier)
  // reduces day-30 over-conversion that was starving raw food.
  // v0.8.5.1 hotfix: 0.85 was too steep (Day-30 DevIndex 22.88 vs 33.56).
  // 0.95 is just enough to dampen over-conversion without choking meal flow.
  kitchenMealOutput: 0.95,
  smithyCycleSec: 8,
  smithyStoneCost: 3,
  smithyWoodCost: 2,
  smithyToolOutput: 1,
  clinicCycleSec: 4,
  clinicHerbsCost: 1,
  clinicMedicineOutput: 1,
  mealHungerRecoveryMultiplier: 2.0,
  // v0.8.5 Tier 3: 0.15 → 0.10 + 3 → 5. Spread the same total bonus over
  // more tools (5 × 0.10 = 0.50 ≈ old 3 × 0.15 = 0.45) so smithy stays
  // productive longer.
  // v0.8.5.1 hotfix: 0.10 was too small (Day-30 regression). 0.12 still
  // softer than v0.8.4's 0.15 but per-tool boost feels meaningful.
  toolHarvestSpeedBonus: 0.12,
  toolMaxEffective: 5,
  medicineHealPerSecond: 6,
  // Phase 1: Weather modifiers for new tiles
  quarryWeatherModifiers: { clear: 1.0, rain: 0.85, storm: 0.7, drought: 1.0, winter: 0.9 },
  herbGardenWeatherModifiers: { clear: 1.0, rain: 1.15, storm: 0.9, drought: 0.4, winter: 0.3 },
  // Rest & morale system
  workerRestDecayPerSecond: 0.004,
  // v0.8.5 Tier 3: 2.4 → 1.8. Retain night pressure without double-tax
  // (combined with carryFatigue 1.5 → 1.25 = 2.25× HAUL load instead of 3.6×).
  workerRestNightDecayMultiplier: 1.8,
  workerRestRecoveryPerSecond: 0.18,
  workerRestSeekThreshold: 0.2,
  workerRestRecoverThreshold: 0.5,
  workerNightRestThreshold: 0.65,
  workerMoraleDecayPerSecond: 0.001,
  workerMoraleRecoveryPerSecond: 0.02,
  // v0.8.5 Tier 3: was a flat 0.6 multiplier. Now scales by avgRest at
  // worker-AI evaluation time: 0.6 + 0.4 × clamp(avgRest, 0, 1). A
  // well-rested colony hits 1.0 productivity at night. The flat 0.6
  // remains the floor for backwards-compatible callers that read this
  // BALANCE constant directly without the rest-based scaling.
  workerNightProductivityMultiplier: 0.6,
  workerNightProductivityFloor: 0.6,
  workerNightProductivityRestBonus: 0.4,
  // Action duration constants
  // v0.8.5 Tier 3: 1.5 → 2.0. Restore some harvest friction (spec § 4.1
  // was 2.5; 2.0 is the middle ground).
  // v0.8.5.1 hotfix: 2.0 was 33% slower than v0.8.4 (1.5) and the biggest
  // single contributor to the Day-30 DevIndex regression. 1.7 = 13%
  // slower vs v0.8.4 instead of 33%.
  // v0.9.3-balance: 1.7 → 2.4. Slower visible per-cycle cadence pairs with
  // 1:1 worker→building binding so a single worker on a single tile yields
  // ~25 cycles/min rather than ~35. The throughput cap moves from "workers
  // available" (was effectively unbounded with stacking) to "buildings
  // available × 1 worker per building" (now bounded). This is the central
  // production-rebalance knob the user requested ("生产时间").
  workerHarvestDurationSec: 2.4,
  workerProcessDurationSec: 3.0,
  // --- Living World v0.8.0 — Phase 1 (M3 + M4), values per spec § 14.1 ---
  // M3 carry fatigue: rest decay multiplier while carrying anything (>0 carry.total).
  // v0.8.5 Tier 3: 1.5 → 1.25. Combined with night 1.8 = 2.25× for HAUL;
  // less brutal than the prior 3.6× max.
  carryFatigueLoadedMultiplier: 1.25,
  // M3 in-transit spoilage: per-second decay of carried perishables while off-road.
  // Grace period halves the rate for the first spoilageGracePeriodTicks off-road ticks
  // since the worker last fully unloaded (see WorkerAISystem.handleDeliver).
  // v0.8.5 Tier 3: 0.005 → 0.008 (60% bump makes haul-time-on-road
  // actually differentiate good and bad logistics) + 500 → 300 (shorter
  // grace to support the bumped rate).
  // v0.8.5.1 hotfix: 0.008 was too aggressive on long hauls (~5% loss).
  // 0.007 is a modest 40% bump vs v0.8.4 instead of 60%.
  foodSpoilageRatePerSec: 0.007,
  herbSpoilageRatePerSec: 0.01,
  spoilageGracePeriodTicks: 300,
  // v0.8.8 C1 — multiplier on spoilage rate when worker is on a ROAD or
  // BRIDGE tile. 0 preserves the original "roads are free perishable
  // freezers" behaviour required by carry-spoilage.test.js +
  // m3-m4-integration.test.js. The Tier C instruction allowed "0.3 OR
  // zero"; we keep zero so existing regression tests remain valid, while
  // leaving the multiplier knob in place for future tuning passes.
  spoilageOnRoadMultiplier: 0,
  // v0.8.0 Phase 5 § 13.2 patch 13: planner's spoilage postcondition flags haul
  // steps whose estimated transit exceeds this half-life. Treated as a soft
  // alarm — violation does not abort the plan but emits a riskSpoilage note the
  // LLM must address next cycle.
  spoilageHalfLifeSeconds: 120,
  // v0.8.0 Phase 5 § 13.2 patches 9/11: yieldPool threshold below which a tile
  // is treated as "depleted" by the planner fallback and the postcondition
  // evaluator. Centralised here so the two subsystems can't drift apart.
  yieldPoolDepletedThreshold: 60,
  // M4 road compounding: per-step speed stack accrued while consecutive on-road steps land.
  // Effective bonus = 1 + (roadSpeedMultiplier - 1) × (1 - wear) × (1 + min(step, cap) × perStep).
  // roadStep resets when the worker steps off a ROAD/BRIDGE tile.
  // v0.8.8 C2 — bump perStep 0.03 → 0.04 and reduce stepCap 20 → 15. Net
  // peak unchanged (1.56× at cap), but ramp time 25% faster so short
  // road-trips also benefit, supporting Tier C road-roi exploit recovery.
  roadStackPerStep: 0.04,
  roadStackStepCap: 15,
  // M4 isolation deposit penalty: unload rate multiplier when delivering to a warehouse
  // whose logistics efficiency matches ISOLATION_PENALTY (no connected road). Lower = slower.
  isolationDepositPenalty: 0.8,
  // --- Living World v0.8.0 — Phase 2 (M2 warehouse throughput + density risk), spec § 14.1 ---
  // M2a: per-tick intake cap per warehouse. Excess workers queue on the tile.
  warehouseIntakePerTick: 2,
  // M2a: queue timeout (sim ticks). Expired workers emit WAREHOUSE_QUEUE_TIMEOUT and retarget.
  // NOTE: spec § 3 cites 180; implementation uses 120 pending tuning sweep (§ 16.5).
  warehouseQueueMaxWaitTicks: 120,
  // M2b density scan: manhattan radius + producer-tile score threshold.
  warehouseDensityRadius: 6,
  warehouseDensityRiskThreshold: 400,
  warehouseDensityAvgStockPerTile: 50,
  // M2b per-tick ignition probabilities (before dt scaling). Fire rolled before vermin;
  // at most one density-risk event per warehouse per tick.
  warehouseFireIgniteChancePerTick: 0.008,
  verminSwarmIgniteChancePerTick: 0.005,
  // M2b loss fractions and caps applied to colony-wide stockpile on ignition.
  // v0.8.5 Tier 3: density risk currently steals only 1/sec from an 8-producer
  // cluster. 0.20 → 0.30 makes it felt without cratering production; cap 30 →
  // 60 keeps proportionality to mid-game stockpiles.
  warehouseFireLossFraction: 0.3,
  warehouseFireLossCap: 60,
  verminSwarmLossFraction: 0.15,
  verminSwarmLossCap: 40,
  // --- Living World v0.8.0 — Phase 3 (M1 soil + yieldPool), spec § 14 ---
  // Per-harvest accumulator increment on tileState.salinized for FARM harvests.
  // v0.8.0 Phase 7.A tuning: 0.02 → 0.012. ~67 harvests before fallow (was 40)
  // gives small colonies runway before soil exhaustion forces farm rotation.
  soilSalinizationPerHarvest: 0.012,
  // At/above this salinized level the farm tile enters fallow (fertility→0)
  // until fallowUntil elapses.
  soilSalinizationThreshold: 0.8,
  // Ticks the farm stays fallow before auto-recovery (fertility→0.9,
  // salinized→0, yieldPool refilled to farmYieldPoolInitial).
  // v0.8.0 Phase 7.A tuning: 1800 → 1200 (~5min → ~3.3min). Shorter starvation
  // window when a 2-3 farm colony has one tile go fallow simultaneously.
  soilFallowRecoveryTicks: 1200,
  // Slow passive per-tick decay of tileState.salinized.
  soilSalinizationDecayPerTick: 0.00002,
  // Fresh-farm yieldPool initial value, idle regen per tick, and cap.
  // v0.8.5 Tier 3: 120 → 80 (initial pool halved so depletion bites within
  // 2-3 game-min, exactly when the player evaluates "do I build another
  // farm?"); 0.10 → 0.04 (8× regen-vs-depletion ratio fixed; 2-worker
  // farms now tip negative, forcing distribution).
  // v0.8.5.1 hotfix: 80/0.04 was the single biggest contributor to the
  // Day-30 regression (~10% slower early food, ~15% slower long-term).
  // Half-rollback: 100 (depletion still bites earlier than v0.8.4's 120,
  // but not as hard); 0.08 (still tighter than v0.8.4's 0.10 but
  // softens the long-term throughput throttling).
  // v0.9.3-balance: initial 100 → 90, regen 0.08 → 0.06. With 1:1 binding
  // a single worker drains a farm noticeably within ~3 sim-min and the
  // fallow trigger then matters; combined with the slower harvest cycle
  // the player feels yieldPool depletion as a real constraint instead of
  // the "infinite farm" the user reported.
  farmYieldPoolInitial: 90,
  farmYieldPoolRegenPerTick: 0.06,
  farmYieldPoolMax: 180,
  // --- Living World v0.8.0 — Phase 3 (M1c demolition recycling), spec § 3 M1c + § 14.1 ---
  // Per-resource recovery fractions applied on demolish ("erase" tool) to the
  // ORIGINAL build cost table (BUILD_COST) — not the terrain-adjusted cost.
  // Stone is partially recoverable (blocks can be re-dressed); wood is partially
  // recoverable (beams re-cut). Food and herbs are biodegradable — zero recovery.
  // On success, BuildSystem emits DEMOLITION_RECYCLED with { ix, iz, refund }.
  // v0.8.5 Tier 3: stone is permanent — recovery is the relocation lubricant.
  // 0.35 → 0.50. Wood 0.25 → 0.40 so demolishing a 5w farm refunds 2w net of
  // 1w demolish cost = 1w net gain (was 0).
  demoStoneRecovery: 0.50,
  demoWoodRecovery: 0.40,
  demoFoodRecovery: 0.0,
  demoHerbsRecovery: 0.0,
  // --- Living World v0.8.0 — Phase 3 (M1b fog of war), spec § 3 M1b + § 14.1 ---
  // Manhattan reveal radius around every live actor per tick. Tiles within this
  // Chebyshev/Manhattan square become VISIBLE; HIDDEN tiles upgrade to VISIBLE.
  // v0.8.5 Tier 3: 5 → 4. Scouts are needed but not painful (econ agent
  // wanted 3; 4 keeps the middle ground).
  fogRevealRadius: 4,
  // Initial reveal radius centred on the colony spawn. 6 ⇒ 13×13 area (169 tiles).
  // v0.8.5 Tier 3: 6 → 5. Revert ~half of the Phase 7.A bump; combined with
  // bigger nodes, fog-clear pacing improves.
  fogInitialRevealRadius: 5,
  // Master toggle. Disable for benchmark presets that need full vision.
  fogEnabled: true,
  // --- Living World v0.8.0 — Phase 3 (M1a resource nodes), spec § 14 ---
  // Node count ranges (min/max per map) seeded at map generation end.
  // FOREST / STONE / HERB node flags gate placement of LUMBER / QUARRY /
  // HERB_GARDEN respectively. Stored as frozen [min, max] tuples.
  forestNodeCountRange: Object.freeze([18, 32]),
  stoneNodeCountRange: Object.freeze([10, 18]),
  herbNodeCountRange: Object.freeze([12, 22]),
  // Yield pool per-node at spawn. Consumed on each harvest; regenerates
  // per-tick at the nodeRegenPerTickX rate when not currently being harvested.
  // Stone nodes do not regenerate (finite mineral deposit).
  // v0.8.5 Tier 3: bigger node pools restore the spec's intended depletion
  // arc (current depletion in ~10 min was 60-70% below spec). Stone is
  // permanent; bigger pool is the lubricant for stone supply.
  // v0.9.3-balance: forest 150 → 110, herb 100 → 80. Stone unchanged
  // (finite by design). With 1:1 binding and the slower harvest cycle a
  // single worker drains a 110-pool LUMBER in ~5 min — encouraging the
  // player to spread out and migrate rather than pinning workers on a
  // single yard. User reported "1 lumberyard supplies hundreds of wood"
  // because workers stacked on it; both 1:1 binding and tighter pools
  // are needed to actually solve that.
  nodeYieldPoolForest: 110,
  nodeYieldPoolStone: 200,
  nodeYieldPoolHerb: 80,
  // v0.9.3-balance: regen forest 0.10 → 0.06, herb 0.06 → 0.04. Slower
  // regen ensures depletion outpaces regrowth under continuous harvest,
  // so the lumberyard / herb garden does eventually go idle and the
  // player has to expand. Stone still 0 (mineral deposits are finite).
  nodeRegenPerTickForest: 0.06,
  nodeRegenPerTickStone: 0.0,
  nodeRegenPerTickHerb: 0.04,
  // --- Living World v0.8.0 — Phase 4 (Survival Mode), spec §§ 5.1-5.6 ---
  // Endless survival mode replaces the 3-objective win path. ProgressionSystem
  // accrues a running score at `state.metrics.survivalScore` that rewards
  // longevity and births while penalising colonist deaths. The colony-wiped
  // condition (no remaining agents) remains the sole loss trigger.
  survivalScorePerSecond: 1,
  // v0.8.5 Tier 3: 5 → 10. Match the death penalty so churn is net-zero,
  // not net-negative; recruit churn no longer drags the score down.
  survivalScorePerBirth: 10,
  survivalScorePenaltyPerDeath: 10,
  // --- Living World v0.8.0 — Phase 4 (DevIndex), spec § 5.6 ---
  // DevIndexSystem ring-buffer window size (sim ticks). The smoothed score
  // published at state.gameplay.devIndexSmoothed is the arithmetic mean of
  // the last N per-tick composite samples.
  devIndexWindowTicks: 60,
  // Per-dimension weights for the composite (must normalise internally;
  // DevIndexSystem divides by the sum of active weights).
  // v0.8.5 Tier 3: previously equal 1/6 each. infra saturated trivially
  // (any colony with 1+ warehouse + 2+ farms hit ~80 in infra) and was
  // pulling the composite up artificially. Re-weight so population /
  // economy / production / defense / resilience carry more signal.
  devIndexWeights: Object.freeze({
    population: 0.22,
    economy: 0.20,
    infrastructure: 0.10,
    production: 0.18,
    defense: 0.15,
    resilience: 0.15,
  }),
  // Economy dim: resource stockpile targets. Reaching the target scores 80;
  // saturating at 100 requires ~25% over the target.
  // v0.8.5 Tier 3: small bumps to compensate for the reweight (food +20,
  // wood +20). Stone stays put.
  devIndexResourceTargets: Object.freeze({ food: 220, wood: 170, stone: 100 }),
  // Population dim: agent count that scores 80 points.
  // v0.8.5 Tier 3: 30 → 24. Aligns score-80 with producerTarget=24, the
  // natural colony build-out size.
  devIndexAgentTarget: 24,
  // Production dim: unique producer-tile count that scores 80 points (sum of
  // FARM + LUMBER + QUARRY + HERB_GARDEN + KITCHEN + SMITHY + CLINIC).
  devIndexProducerTarget: 24,
  // Defense dim: scoring target for walls + 2× militia agents.
  devIndexDefenseTarget: 12,
  // --- Living World v0.8.0 — Phase 4 (Raid Escalator), spec §§ 5.4-5.5 ---
  // RaidEscalatorSystem converts `state.gameplay.devIndexSmoothed` into a
  // tiered raid cadence + intensity bundle (`state.gameplay.raidEscalation`)
  // which WorldEventSystem reads when rolling bandit raids.
  //
  //   tier = clamp(floor(devIndexSmoothed / devIndexPerRaidTier), 0, raidTierMax)
  //   intervalTicks = max(raidIntervalMinTicks,
  //                       raidIntervalBaseTicks - tier * raidIntervalReductionPerTier)
  //   intensityMultiplier = 1 + tier * raidIntensityPerTier
  //
  // Defaults (spec § 14.1):
  //   DI  0 → tier  0, 3600 ticks between raids, 1.0× intensity
  //   DI 30 → tier  2, 3000 ticks, 1.6×
  //   DI 60 → tier  4, 2400 ticks, 2.2×
  //   DI 75 → tier  5, 2100 ticks, 2.5×
  //   DI 100 → tier 6, 1800 ticks, 2.8× (capped at raidTierMax = 10)
  devIndexPerRaidTier: 15,
  raidTierMax: 10,
  raidIntervalBaseTicks: 3600,
  raidIntervalMinTicks: 600,
  raidIntervalReductionPerTier: 300,
  raidIntensityPerTier: 0.3,
  // Round 2 01d: Heat Lens should warn before a processor is completely empty.
  heatLensStarveThreshold: Object.freeze({ food: 10, wood: 10, stone: 6, herbs: 4 }),
  // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 6) — Raid fallback
  // scheduler floors. RaidEscalatorSystem.update self-fires BANDIT_RAID when
  // the LLM directive path is unavailable (100% of fallback sessions). The
  // four floors below prevent the fallback from punishing fragile colonies
  // and protect the 4-seed bench gate (DevIndex ≥ 32 / deaths ≤ 499).
  // Per plan §5 R1 mitigation ladder: raise graceSec to 480 if 4-seed bench
  // tanks > 5%; or, as last resort, retreat raidEnvironmentDeathBudget.
  // v0.8.2 Round-6 Wave-2 acceptance-gate tune (post-bench 2025-04-25):
  // Wave-2 baseline (graceSec 360 / popFloor 18 / eventDirectorBaseIntervalSec
  // 240) collapsed seed-99 by day 23 (pop 1, deaths 48). Apply Stage B Risk
  // #2 mitigation in priority order: 02a raidFallback first, then 01d
  // EventDirector base interval. Raise grace 360 -> 480 (extra game-day of
  // boot calm) + popFloor 18 -> 24 (only fire raid when colony is genuinely
  // defendable) + EventDirector interval 240 -> 360 (~50% slower proactive
  // pressure). 01b raid params untouched (already tightened in 8604240).
  raidFallbackScheduler: Object.freeze({
    graceSec: 480,        // boot grace (~8 game-min) before the first auto-raid
    popFloor: 24,         // skip if colony hasn't grown to a defendable size
    foodFloor: 60,        // skip if starvation imminent
    durationSec: 18,      // matches the default WorldEventSystem raid window
  }),
  // Flat aliases so callers can read BALANCE.raidFallback* directly without
  // dereferencing the frozen sub-block (matches the `raidIntervalBaseTicks`
  // flat-field convention this file already uses).
  raidFallbackGraceSec: 480,
  raidFallbackPopFloor: 24,
  raidFallbackFoodFloor: 60,
  raidFallbackDurationSec: 18,
  // v0.8.2 Round-6 Wave-1 01b-playability (Step 10) — soft cap on the
  // EnvironmentDirector's threat-gated saboteur spawns. Once a run accumulates
  // this many starvation/raid deaths, the new "Raiders sighted near <gate>"
  // micro-raid path goes silent so 4-seed bench DevIndex floor (≥ 32) and
  // deaths ceiling (≤ 499) stay safely inside their lanes. See plan §5 risk
  // analysis: predicted incremental deaths +5..12 vs. baseline 454, leaving
  // ~33 of the 499-death budget as headroom even with all 4 seeds firing.
  // v0.8.2 Round-6 Wave-1 acceptance-gate tune (post-bench 2025-04-25):
  // initial 18/90/60 caused seed-42 deaths to climb to 589 and DevIndex to drop
  // 74→36; pop crashed to 2 by day 90. Per Stage B summary §7 Risk #2 mitigation
  // ladder, tighten without rolling back the mechanic itself: smaller budget +
  // longer cooldown + later threshold so the saboteur pulse stays present as
  // a UX signal but cannot snowball before pop recovery. Re-validated against
  // 4-seed bench post-tune.
  raidDeathBudget: 8,
  raidEnvironmentCooldownSec: 360,
  raidEnvironmentThreatThreshold: 75,
  // --- v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 9) — EventDirector
  // proactive pressure cadence + species/mood tuning. Initial 240s tanked
  // seed-99 (loss day 23) via combined event + raid pressure; per Stage B
  // §7 Risk #2 lifted to 360s (~50% slower) alongside the 02a raidFallback
  // tightening above.
  eventDirectorBaseIntervalSec: 360,
  // v0.8.5 Tier 3: moraleBreak 0.07 → 0.10. Rare event was invisible at 0.07.
  eventDirectorWeights: Object.freeze({
    banditRaid: 0.30,
    animalMigration: 0.25,
    tradeCaravan: 0.18,
    diseaseOutbreak: 0.10,
    wildfire: 0.10,
    moraleBreak: 0.10,
  }),
  eventDirectorTuning: Object.freeze({
    banditRaid: Object.freeze({ durationSec: 30, intensity: 1 }),
    animalMigration: Object.freeze({ durationSec: 22, intensity: 1 }),
    tradeCaravan: Object.freeze({ durationSec: 20, intensity: 1 }),
    diseaseOutbreak: Object.freeze({ durationSec: 35, intensity: 1 }),
    wildfire: Object.freeze({ durationSec: 25, intensity: 1 }),
    moraleBreak: Object.freeze({ durationSec: 30, intensity: 1 }),
  }),
  // Predator species mix at spawn (Step 6/8). Wolf is the most common pack
  // hunter; bear is the rare bruiser; raider_beast is the new "raider"
  // archetype that targets workers exclusively.
  predatorSpeciesWeights: Object.freeze({ wolf: 0.55, bear: 0.30, raider_beast: 0.15 }),
  herbivoreSpeciesWeights: Object.freeze({ deer: 1.0 }),
  // Mood→output coupling (Step 5). At mood=0 the worker outputs at
  // moodOutputMin; at mood=1.0 outputs at 100%. Linear in between.
  // v0.8.2 Round-6 Wave-2 acceptance-gate tune (post-bench 2025-04-25):
  // initial 0.5 (50% output at mood=0) caused seed-99 death spiral by day 23
  // (low-mood early-game → halved output → starvation → more low mood → death).
  // Softened to 0.7 (max 30% penalty). Wave-2 tune that restored the 4-seed
  // gate after the initial 0.5 collapsed seed-99. Wave-3 tested 0.85/0.9 to
  // try to recover seed-7 (which dropped to devIndex 13.33 then loss-day-31
  // after 02d rivalry shipped, via RNG drift not mood propagation), but
  // tightening moved more seeds (99) into loss; lowering kept seed-7 in
  // zombie max state but lost seed-99. 0.7 is the local optimum: 3/4 seeds
  // healthy, seed-7 zombie-max. Seed-7's remaining fragility is documented
  // and handed off to Round 7 (likely needs the rivalry delta itself softened
  // or a per-pair mood floor).
  moodOutputMin: 0.7,
  // Per-worker MORALE_BREAK enqueue cooldown so a chronically-low-mood
  // worker cannot spam the queue every tick.
  moraleBreakCooldownSec: 90,
  // --- v0.8.2 Round-7 (01e+02b) — Worker trait behavioral constants ---
  // Master toggle: set false to disable all trait effects without removing wiring.
  workerTraitEffectsEnabled: true,
  // hardy: weather-related path costs scaled down (move-cost multiplier applied inside WorkerAISystem)
  traitHardyWeatherMult: 0.6,
  // hardy: morale decay multiplier (applied to weatherMoraleMult)
  traitHardyMoraleDecayMult: 0.75,
  // social: rest decay multiplier (social workers recover rest faster via bonds)
  traitSocialRestDecayMult: 0.75,
  // social: bonus added to rest intent score when a Close Friend is within 3 tiles
  traitSocialFriendBonus: 0.15,
  // efficient: task-switch cooldown multiplier applied to workerIntentCooldownSec
  traitEfficientTaskMult: 0.85,
  // resilient: death threshold delta (negative = harder to die)
  // v0.8.5 Tier 3: -0.05 → -0.10 (≈ 16s extra survival vs. the old ≈ 8s).
  traitResilientDeathThresholdDelta: -0.10,
  // v0.8.5 Tier 3: careful trait was previously a strict-worse trait (speed
  // penalty with no upside). Add a +0.10 yield bonus on harvest actions so
  // the trade-off is meaningful. Read by WorkerAISystem in harvest paths.
  traitCarefulYieldBonus: 0.10,
  // --- v0.8.3 worker-vs-raider combat (bidirectional melee) -------------
  // When a predator hits a worker, the directly hit worker fights back with
  // `workerCounterAttackDamage`. GUARD-role workers actively pathfind
  // toward predators within `guardAggroRadius` and deal `guardAttackDamage`.
  // `meleeReachTiles` is the world-distance threshold for landing a hit
  // (matches predatorAttackDistance scale). `workerAttackCooldownSec` paces
  // the counter so a single worker can't infinite-stunlock a predator.
  // v0.8.5 Tier 3: 6 → 9. Worker self-defense becomes meaningful — a 2-3
  // worker melee can kill a raider before it kills any farmer.
  workerCounterAttackDamage: 9,
  // v0.8.5 Tier 3: 14 → 18. 1 GUARD vs 1 wolf needs to be survivable;
  // 18 brings GUARD DPS to 11.25 matching bear's 10.
  guardAttackDamage: 18,
  // v0.8.3 worker-vs-raider combat — Iteration tuning. 4-tile aggro felt
  // too short in the live probe (GUARDs auto-promoted from idle workers
  // were often 5-7 tiles from the spawn-injected raider and never closed
  // distance before the raider had engaged a non-GUARD farmer). 6 tiles
  // gives the GUARD time to intercept while still respecting the "patrol
  // near home" boundary; further widening would have GUARDs abandon the
  // colony chasing wolves on the map edge.
  guardAggroRadius: 6,
  // v0.8.3 worker-vs-raider combat — Iteration tuning. 1.0 left GUARDs in
  // a stand-off at d≈1.2 tiles (the predator's preferred preyChase distance
  // sat just outside the melee threshold). 1.3 closes the gap so a GUARD
  // tracking a raider into melee range will land hits without overshooting.
  meleeReachTiles: 1.3,
  workerAttackCooldownSec: 1.6,
  // raider_beast stat-randomisation envelope. Same seed must reproduce the
  // same draw — see EntityFactory.createAnimal raider branch. Wolf/bear
  // remain on their fixed BALANCE values to keep the wildlife loop stable.
  // v0.8.5 Tier 3: 0.25 → 0.15. ±25% HP/dmg too wide; 0.15 keeps flavour
  // without 1-shotting GUARDs.
  raiderStatsVariance: 0.15,
  // Threat-driven plan injection thresholds. ColonyPlanner.generateFallback
  // Plan pre-pends GUARD-promotion / wall steps when activeThreats meets
  // these gates. `targetGuardsPerThreat` is the headcount the planner asks
  // RoleAssignmentSystem to promote (capped by population).
  threatActiveThreshold: 1,
  // v0.8.5 Tier 3: was flat 4. Now scales with workers via runtime
  // computation: clamp(floor(workers/4), 2, 8). 4-cap left late-game raids
  // with ≥5 raiders unopposed; the scaled cap lets bigger colonies
  // promote enough GUARDs without bleeding small colonies dry.
  threatGuardCap: 4,
  threatGuardCapMin: 2,
  threatGuardCapMax: 8,
  threatGuardCapPerWorkers: 4,
  // v0.8.5 Tier 3: 1 → 2. 2v1 is decisive; 1v1 with HP variance is a
  // coin-flip and ~30% of GUARD encounters lost a worker pre-v0.8.5.
  targetGuardsPerThreat: 2,
  // --- v0.8.4 Strategic walls + GATE (Agent C) ---------------------------
  // Walls now have HP and can be attacked by hostile factions (predators,
  // raiders, saboteurs). When wallHp drops to 0 the tile mutates to RUINS,
  // re-opening the path for everyone. The same hp pool covers GATE tiles —
  // a separate gateMaxHp could be split out later but the core mechanic is
  // identical, so we reuse `wallMaxHp`. `wallAttackDamagePerSec` is the
  // per-second damage one hostile applies while standing adjacent. Multiple
  // hostiles stack damage. Gate cost lives in BUILD_COST.gate.
  // v0.8.7 T4-2: removed `gateCost` — duplicated BUILD_COST.gate. Gate
  // cost is sourced exclusively from BUILD_COST.gate in BuildAdvisor /
  // BuildSystem now, so the duplicate field was both dead and a footgun
  // (could drift apart if either side were edited independently).
  wallMaxHp: 50,
  wallAttackDamagePerSec: 5,
  // v0.8.5 Tier 2 S2: Walls now regenerate HP toward maxHp at 0.1 HP/sec
  // (full heal in ~8.3 game-min) when no hostile is within 4 tiles AND
  // the wall has not taken damage in the last 30 seconds. Closes the
  // irreversible-decay loop where surviving a raid at 50% HP meant the
  // next raid broke walls in 5s instead of 10s.
  wallHpRegenPerSec: 0.1,
  wallRegenHostileRadius: 4,
  wallRegenSafeWindowSec: 30,
  // v0.8.5 Tier 3: gates earn their stone cost with a higher HP pool than
  // walls. Backwards compatible — code that reads BALANCE.wallMaxIp still
  // works for plain walls.
  gateMaxHp: 75,
  // v0.8.7 T4-2: gateCost removed (duplicate of BUILD_COST.gate).
  // --- v0.8.4 Building lifecycle (Agent A) -------------------------------
  // Per-tool work-seconds required to complete a build blueprint. When a
  // BUILDER is at the construction site, WorkerAISystem accumulates dt onto
  // tileState.construction.workAppliedSec; ConstructionSystem mutates the
  // tile when workAppliedSec >= workTotalSec. `default` is the fallback for
  // any build kind not enumerated here (e.g. future tile types).
  // v0.8.4 Round 2 polish — work-seconds reduced ~25–35% across the board to
  // restore long-horizon throughput. The legacy auto-spawn ran every 10s
  // (recruitCooldown) and assumed instant builds; with construction-in-progress
  // each structure adds 4–8s of worker time, so the previous values starved
  // the colony of effective work cycles per simulated day.
  constructionWorkSec: Object.freeze({
    road: 1.0,
    farm: 2.5,
    lumber: 2.5,
    warehouse: 5.0,
    wall: 2.0,
    quarry: 3.0,
    herb_garden: 2.0,
    kitchen: 4.5,
    smithy: 5.0,
    clinic: 4.0,
    bridge: 3.5,
    gate: 2.5,
    default: 2.5,
  }),
  // Demolish work-seconds keyed by the OLD tile being torn down. RUINS
  // clear fastest (debris already loose); walls/gates intermediate;
  // built structures fall back to `default`.
  demolishWorkSec: Object.freeze({
    default: 3.0,
    ruins: 1.5,
    wall: 2.5,
    gate: 2.5,
  }),
  // Resource cost charged up-front when an erase commission is registered
  // (BuildSystem.placeToolAt with tool="erase"). Salvage refund is granted
  // on completion via tile-specific BUILD_COST × demolish recovery ratios.
  demolishToolCost: Object.freeze({ wood: 1 }),
  // BUILDER quota: target headcount = clamp(ceil(sites * builderPerSite),
  // builderMin, builderMax). v0.8.4 Round 2 polish — perSite stays 1.5 so
  // small colonies don't over-strip the economy chasing parallel builders;
  // max stays 6 so a long-running plan with many open sites can't drain the
  // entire workforce off farms. The construction-time reductions
  // (constructionWorkSec halved) carry the throughput improvement instead.
  // v0.8.5 Tier 3: builders 1.5/site → 1.0/site (eliminates idle clumping at
  // a single site); max 6 → 5 (tighter cap pairs with reduction);
  // builderMaxFraction 0.30 (cap builders at floor(workers × 0.30) so a
  // small colony can't strip 50% of its workforce off farms).
  builderPerSite: 1.0,
  builderMin: 0,
  builderMax: 5,
  builderMaxFraction: 0.30,
  // --- v0.8.4 Recruitment (Agent D) --------------------------------------
  // Replaces the legacy auto-reproduction loop. Workers no longer "birth"
  // for free; instead the player (or LLM/rules) explicitly requests
  // recruits, gated by food cost + cooldown.
  // v0.8.4 Round 2 polish — cooldown 30→12s keeps pace with the legacy 10s
  // auto-spawn (+ a small safety pause per spawn). minFoodBuffer kept at 80
  // (the original v0.8.4 contract value) — relaxing it tipped seed=3 into a
  // starvation spiral because queued spawns kept firing as food drained.
  // The fallback planner's emit threshold was relaxed from
  // `food > recruitMinFoodBuffer + 30` to `food > recruitMinFoodBuffer`
  // — see ColonyPlanner.generateFallbackPlan. Spawn branch in
  // PopulationGrowthSystem now gates spawn on `food >= recruitMinFoodBuffer`
  // (in addition to the existing `food >= recruitFoodCost` check) so the
  // queue can't drain food past the buffer.
  recruitFoodCost: 25,             // food deducted per spawn
  // v0.8.5.1 hotfix: 12 → 9. Faster recruitment for early game so the
  // colony grows into its target headcount sooner. Pairs with the food
  // buffer drop (recruitMinFoodBuffer 80 → 50).
  recruitCooldownSec: 9,           // pacing between auto-spawns
  recruitMaxQueueSize: 12,         // queue cap (UI + LLM clamp here)
  // v0.8.5 Tier 3: 80 → 50. 80 blocked recruit during food-deficit phase,
  // causing seed-7 collapse; 50 still safe (cooldown × cost = 25/12 ≈ 2.1/s
  // drain).
  recruitMinFoodBuffer: 50,        // skip auto-recruit below this food stock
});

// v0.8.2 Round-5b (02b-casual Step 1) — Casual UX timing constants.
// v0.8.7.1 U1 — toast retiming: errors shorter (3500 → 2800) so they don't
// linger past the next gameplay event, success bumped (1400 → 2200) so quick
// player wins are actually readable.
export const CASUAL_UX = Object.freeze({
  errToastMs: 2800,
  warnToastMs: 2600,
  successToastMs: 2200,
  struggleBannerGraceSec: 20,
  struggleFoodPctOfEmergency: 1.1,
  toolTierUnlockTimeSec: Object.freeze({ secondary: 180, advanced: 360 }),
  toolTierUnlockBuildings: Object.freeze({
    secondary: Object.freeze({ warehouses: 1 }),
    advanced: Object.freeze({ farms: 3, lumbers: 1 }),
  }),
});

// --- Terrain depth constants ---

// v0.8.5 Tier 3: rebalance the salvage roll table so rare loot feels like
// real loot. Common-loot weight 60 → 50 (still the modal outcome but no
// longer dominant), rare-loot weight 15 → 25 (1 in 4 ruin salvages now
// finds tools / medicine), rare-loot rewards bumped from [1,1]/[0,1] to
// [1,3]/[1,2] so the rare hit is meaningful.
export const RUIN_SALVAGE = Object.freeze({
  rolls: Object.freeze([
    { weight: 50, rewards: { wood: [2, 5], stone: [1, 3] } },
    { weight: 25, rewards: { food: [3, 8], herbs: [1, 3] } },
    { weight: 25, rewards: { tools: [1, 3], medicine: [1, 2] } },
  ]),
});

export const TERRAIN_MECHANICS = Object.freeze({
  elevationMovePenalty: 0.3,
  elevationBuildCostPerLevel: 0.15,
  lowMoistureStoneCostThreshold: 0.3,
  lowMoistureStoneCostFlat: 1,
  ruinsBuildDiscount: 0.3,
  wallElevationDefenseBonus: 0.5,
  moistureFertilityCap: Object.freeze({ scale: 1.4, base: 0.25 }),
  soilExhaustionDrainScale: 0.12,
  soilExhaustionMax: 8.0,
  soilExhaustionDecayPerTick: 0.1,
  adjacencyFertilityMax: 0.008,
  fireIgniteChance: 0.005,
  fireMoistureThreshold: 0.25,
  fireWearPerTick: 0.5,
  fireMaxSpread: 3,
});
