import { WEATHER } from "./constants.js";

export const BUILD_COST = Object.freeze({
  road: { wood: 1 },
  farm: { wood: 5 },
  lumber: { wood: 5 },
  warehouse: { wood: 10 },
  wall: { wood: 2 },
  erase: { wood: 0 },
});

export const INITIAL_RESOURCES = Object.freeze({
  food: 55,
  wood: 70,
});

export const INITIAL_POPULATION = Object.freeze({
  workers: 18,
  visitors: 6,
  herbivores: 5,
  predators: 1,
});

export const WEATHER_MODIFIERS = Object.freeze({
  [WEATHER.CLEAR]: { moveCostMultiplier: 1.0, farmProductionMultiplier: 1.0, lumberProductionMultiplier: 1.0 },
  [WEATHER.RAIN]: { moveCostMultiplier: 1.15, farmProductionMultiplier: 1.0, lumberProductionMultiplier: 0.95 },
  [WEATHER.STORM]: { moveCostMultiplier: 1.3, farmProductionMultiplier: 0.8, lumberProductionMultiplier: 0.9 },
  [WEATHER.DROUGHT]: { moveCostMultiplier: 1.0, farmProductionMultiplier: 0.55, lumberProductionMultiplier: 1.0 },
  [WEATHER.WINTER]: { moveCostMultiplier: 1.25, farmProductionMultiplier: 0.65, lumberProductionMultiplier: 0.85 },
});

export const BALANCE = Object.freeze({
  hungerDecayPerSecond: 0.014,
  hungerEatRatePerSecond: 5.0,
  hungerEatRecoveryPerFoodUnit: 0.04,
  visitorHungerDecayPerSecond: 0.0085,
  visitorHungerRecoveryPerSecond: 0.16,
  herbivoreHungerDecayPerSecond: 0.0095,
  herbivoreGrazeRecoveryPerSecond: 0.085,
  predatorHungerDecayPerSecond: 0.012,
  predatorHungerRecoveryOnHit: 0.24,
  predatorAttackDamage: 26,
  predatorAttackDistance: 0.9,
  predatorAttackCooldownSec: 1.4,
  workerSpeed: 2.2,
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
      neighborRadius: 1.65,
      separationRadius: 1.05,
      weights: { separation: 1.9, alignment: 0.18, cohesion: 0.08, seek: 1.28 },
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
  foodEmergencyThreshold: 14,
  productionCooldownSec: 0.9,
  sabotageCooldownMinSec: 7,
  sabotageCooldownMaxSec: 13,
  environmentDecisionIntervalSec: 12,
  policyDecisionIntervalSec: 10,
  policyTtlDefaultSec: 24,
  maxEventIntensity: 3,
});
