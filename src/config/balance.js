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
export const BUILD_COST_ESCALATOR = Object.freeze({
  warehouse: Object.freeze({ softTarget: 2, perExtra: 0.2, cap: 2.5, perExtraBeyondCap: 0.08, hardCap: 20 }),
  wall: Object.freeze({ softTarget: 8, perExtra: 0.1, cap: 2.0, perExtraBeyondCap: 0.05, hardCap: 40 }),
  kitchen: Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  smithy: Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  clinic: Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  farm: Object.freeze({ softTarget: 6, perExtra: 0.1, cap: 1.8, perExtraBeyondCap: 0.05 }),
  lumber: Object.freeze({ softTarget: 4, perExtra: 0.1, cap: 1.8, perExtraBeyondCap: 0.05 }),
  quarry: Object.freeze({ softTarget: 3, perExtra: 0.15, cap: 1.8, perExtraBeyondCap: 0.05 }),
  herb_garden: Object.freeze({ softTarget: 2, perExtra: 0.15, cap: 2.0, perExtraBeyondCap: 0.05 }),
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
  workerHungerRecoverThreshold: 0.42,
  workerEatRecoveryTarget: 0.70,
  workerHungerEatRecoveryPerFoodUnit: 0.11,
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
    cookPerWorker: 1 / 8,
    haulPerWorker: 1 / 6,
    herbalistPerWorker: 1 / 12,
    smithPerWorker: 1 / 10,
    stonePerWorker: 1 / 8,
    herbsPerWorker: 1 / 10,
    haulMinPopulation: 8,
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
  // Phase 7.A § 14.2: 0.6 → 0.4. Slower decay keeps the colony committed to
  // its chosen objective longer, so long-range plans stop thrashing.
  objectiveHoldDecayPerSecond: 0.4,
  recoveryCooldownSec: 30,
  recoveryWindowSec: 16,
  recoveryChargeCap: 3,
  recoveryHintRiskThreshold: 55,
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
  environmentDecisionIntervalSec: 12,
  policyDecisionIntervalSec: 10,
  policyTtlDefaultSec: 24,
  doctrineMasteryRewardMultiplier: 1.08,
  maxEventIntensity: 3,
  wildlifeSpawnRadiusBonus: 3,
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
  banditRaidLossPerPressure: 0.28,
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
  kitchenCycleSec: 2.8,
  kitchenFoodCost: 2,
  kitchenMealOutput: 1,
  smithyCycleSec: 8,
  smithyStoneCost: 3,
  smithyWoodCost: 2,
  smithyToolOutput: 1,
  clinicCycleSec: 4,
  clinicHerbsCost: 1,
  clinicMedicineOutput: 1,
  mealHungerRecoveryMultiplier: 2.0,
  toolHarvestSpeedBonus: 0.15,
  toolMaxEffective: 3,
  medicineHealPerSecond: 6,
  // Phase 1: Weather modifiers for new tiles
  quarryWeatherModifiers: { clear: 1.0, rain: 0.85, storm: 0.7, drought: 1.0, winter: 0.9 },
  herbGardenWeatherModifiers: { clear: 1.0, rain: 1.15, storm: 0.9, drought: 0.4, winter: 0.3 },
  // Rest & morale system
  workerRestDecayPerSecond: 0.004,
  workerRestNightDecayMultiplier: 2.4,
  workerRestRecoveryPerSecond: 0.18,
  workerRestSeekThreshold: 0.2,
  workerRestRecoverThreshold: 0.5,
  workerNightRestThreshold: 0.65,
  workerMoraleDecayPerSecond: 0.001,
  workerMoraleRecoveryPerSecond: 0.02,
  workerNightProductivityMultiplier: 0.6,
  // Action duration constants
  workerHarvestDurationSec: 1.5,
  workerProcessDurationSec: 3.0,
  // --- Living World v0.8.0 — Phase 1 (M3 + M4), values per spec § 14.1 ---
  // M3 carry fatigue: rest decay multiplier while carrying anything (>0 carry.total).
  carryFatigueLoadedMultiplier: 1.5,
  // M3 in-transit spoilage: per-second decay of carried perishables while off-road.
  // Grace period halves the rate for the first spoilageGracePeriodTicks off-road ticks
  // since the worker last fully unloaded (see WorkerAISystem.handleDeliver).
  foodSpoilageRatePerSec: 0.005,
  herbSpoilageRatePerSec: 0.01,
  spoilageGracePeriodTicks: 500,
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
  // roadStep resets when the worker steps off a ROAD/BRIDGE tile. Max 1.6× at 20 steps.
  roadStackPerStep: 0.03,
  roadStackStepCap: 20,
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
  warehouseFireLossFraction: 0.2,
  warehouseFireLossCap: 30,
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
  farmYieldPoolInitial: 120,
  farmYieldPoolRegenPerTick: 0.1,
  farmYieldPoolMax: 180,
  // --- Living World v0.8.0 — Phase 3 (M1c demolition recycling), spec § 3 M1c + § 14.1 ---
  // Per-resource recovery fractions applied on demolish ("erase" tool) to the
  // ORIGINAL build cost table (BUILD_COST) — not the terrain-adjusted cost.
  // Stone is partially recoverable (blocks can be re-dressed); wood is partially
  // recoverable (beams re-cut). Food and herbs are biodegradable — zero recovery.
  // On success, BuildSystem emits DEMOLITION_RECYCLED with { ix, iz, refund }.
  demoStoneRecovery: 0.35,
  demoWoodRecovery: 0.25,
  demoFoodRecovery: 0.0,
  demoHerbsRecovery: 0.0,
  // --- Living World v0.8.0 — Phase 3 (M1b fog of war), spec § 3 M1b + § 14.1 ---
  // Manhattan reveal radius around every live actor per tick. Tiles within this
  // Chebyshev/Manhattan square become VISIBLE; HIDDEN tiles upgrade to VISIBLE.
  fogRevealRadius: 5,
  // Initial reveal radius centred on the colony spawn. 6 ⇒ 13×13 area (169 tiles).
  // v0.8.0 Phase 7.A tuning: 4 → 6. Previous 9×9 (81 tiles) forced the planner to
  // cram all early buildings into a tiny footprint, accelerating soil salinization
  // via co-located farm clusters. 6 keeps fog gameplay intact while giving the AI
  // enough initial buildable area to spread farms and depots across soil zones.
  fogInitialRevealRadius: 6,
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
  nodeYieldPoolForest: 80,
  nodeYieldPoolStone: 120,
  nodeYieldPoolHerb: 60,
  nodeRegenPerTickForest: 0.15,
  nodeRegenPerTickStone: 0.0,
  nodeRegenPerTickHerb: 0.08,
  // --- Living World v0.8.0 — Phase 4 (Survival Mode), spec §§ 5.1-5.6 ---
  // Endless survival mode replaces the 3-objective win path. ProgressionSystem
  // accrues a running score at `state.metrics.survivalScore` that rewards
  // longevity and births while penalising colonist deaths. The colony-wiped
  // condition (no remaining agents) remains the sole loss trigger.
  survivalScorePerSecond: 1,
  survivalScorePerBirth: 5,
  survivalScorePenaltyPerDeath: 10,
  // --- Living World v0.8.0 — Phase 4 (DevIndex), spec § 5.6 ---
  // DevIndexSystem ring-buffer window size (sim ticks). The smoothed score
  // published at state.gameplay.devIndexSmoothed is the arithmetic mean of
  // the last N per-tick composite samples.
  devIndexWindowTicks: 60,
  // Per-dimension weights for the composite (must normalise internally;
  // DevIndexSystem divides by the sum of active weights). Default = equal
  // 1/6 each. Tune during balance sweeps per spec § 16.
  devIndexWeights: Object.freeze({
    population: 1 / 6,
    economy: 1 / 6,
    infrastructure: 1 / 6,
    production: 1 / 6,
    defense: 1 / 6,
    resilience: 1 / 6,
  }),
  // Economy dim: resource stockpile targets. Reaching the target scores 80;
  // saturating at 100 requires ~25% over the target.
  devIndexResourceTargets: Object.freeze({ food: 200, wood: 150, stone: 100 }),
  // Population dim: agent count that scores 80 points.
  devIndexAgentTarget: 30,
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
  eventDirectorWeights: Object.freeze({
    banditRaid: 0.30,
    animalMigration: 0.25,
    tradeCaravan: 0.18,
    diseaseOutbreak: 0.10,
    wildfire: 0.10,
    moraleBreak: 0.07,
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
});

// v0.8.2 Round-5b (02b-casual Step 1) — Casual UX timing constants.
export const CASUAL_UX = Object.freeze({
  errToastMs: 3500,
  warnToastMs: 2600,
  successToastMs: 1400,
  struggleBannerGraceSec: 20,
  struggleFoodPctOfEmergency: 1.1,
  toolTierUnlockTimeSec: Object.freeze({ secondary: 180, advanced: 360 }),
  toolTierUnlockBuildings: Object.freeze({
    secondary: Object.freeze({ warehouses: 1 }),
    advanced: Object.freeze({ farms: 3, lumbers: 1 }),
  }),
});

// --- Terrain depth constants ---

export const RUIN_SALVAGE = Object.freeze({
  rolls: Object.freeze([
    { weight: 60, rewards: { wood: [2, 5], stone: [1, 3] } },
    { weight: 25, rewards: { food: [3, 8], herbs: [1, 3] } },
    { weight: 15, rewards: { tools: [1, 1], medicine: [0, 1] } },
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
