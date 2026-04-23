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
  clinic: { wood: 6, herbs: 4 },
  bridge: { wood: 3, stone: 1 },
});

export const CONSTRUCTION_BALANCE = Object.freeze({
  salvageRefundRatio: 0.5,
  worksiteAccessRadius: 2,
  warehouseRoadRadius: 1,
  warehouseSpacingRadius: 5,
});

export const INITIAL_RESOURCES = Object.freeze({
  food: 100,
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
  clinicHerbsCost: 2,
  clinicMedicineOutput: 1,
  mealHungerRecoveryMultiplier: 2.0,
  toolHarvestSpeedBonus: 0.15,
  toolMaxEffective: 3,
  medicineHealPerSecond: 8,
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
  workerHarvestDurationSec: 2.5,
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
  nodeRegenPerTickForest: 0.05,
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
