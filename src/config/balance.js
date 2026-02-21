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
  workers: 72,
  visitors: 20,
  herbivores: 24,
  predators: 4,
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
