import { getScenarioRuntime } from "../world/scenarios/ScenarioFactory.js";
import { ensureAiRuntimeStats } from "./aiRuntimeStats.js";

function round(value, digits = 2) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return safe;
  return Number(safe.toFixed(digits));
}

function collectErrorWarnings(state) {
  return (state.metrics.warningLog ?? [])
    .filter((entry) => String(entry.level ?? "").toLowerCase() === "error")
    .map((entry) => ({
      sec: round(entry.sec ?? 0, 1),
      source: String(entry.source ?? ""),
      message: String(entry.message ?? "").trim(),
    }))
    .filter((entry) => entry.message);
}

function summarizeWeather(state) {
  const fronts = Array.isArray(state.weather.hazardFronts) ? state.weather.hazardFronts : [];
  return {
    current: String(state.weather.current ?? "clear"),
    timeLeftSec: round(state.weather.timeLeftSec ?? 0, 1),
    pressureScore: round(state.weather.pressureScore ?? 0, 2),
    hazardFrontCount: fronts.length,
    hazardFocusSummary: String(state.weather.hazardFocusSummary ?? ""),
    summary: fronts.length > 0
      ? `Weather: ${state.weather.current}, ${fronts.length} hazard fronts, focus ${state.weather.hazardFocusSummary || "n/a"}`
      : `Weather: ${state.weather.current}`,
  };
}

function collectNonFiniteMetrics(sample) {
  const candidates = [
    ["tick", sample.tick],
    ["simTimeSec", sample.simTimeSec],
    ["resources.food", sample.resources.food],
    ["resources.wood", sample.resources.wood],
    ["gameplay.prosperity", sample.gameplay.prosperity],
    ["gameplay.threat", sample.gameplay.threat],
    ["performance.fps", sample.performance.fps],
    ["performance.frameMs", sample.performance.frameMs],
    ["performance.heapMb", sample.performance.heapMb],
    ["ai.avgLatencyMs", sample.ai.avgLatencyMs],
  ];
  return candidates
    .filter(([, value]) => !Number.isFinite(Number(value)))
    .map(([key]) => key);
}

function buildPopulationByGroup(state) {
  const agents = Array.isArray(state.agents) ? state.agents.filter((entity) => entity?.alive !== false) : [];
  const animals = Array.isArray(state.animals) ? state.animals.filter((entity) => entity?.alive !== false) : [];
  return {
    workers: agents.filter((entity) => entity.type === "WORKER").length,
    traders: agents.filter((entity) => entity.type === "VISITOR" && String(entity.kind ?? "") === "TRADER").length,
    saboteurs: agents.filter((entity) => entity.type === "VISITOR" && String(entity.kind ?? "") !== "TRADER").length,
    herbivores: animals.filter((entity) => entity.kind === "HERBIVORE").length,
    predators: animals.filter((entity) => entity.kind === "PREDATOR").length,
  };
}

function buildEcologyZoneStats(state) {
  const scenario = state.gameplay?.scenario ?? {};
  const ecology = state.metrics?.ecology ?? {};
  const explicit = Array.isArray(ecology.zoneStats) ? ecology.zoneStats : [];
  if (explicit.length > 0) {
    return explicit.map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.label ?? ""),
      herbivoreCount: Number(entry.herbivoreCount ?? 0),
      predatorCount: Number(entry.predatorCount ?? 0),
      herbivoreCapacity: { ...(entry.herbivoreCapacity ?? {}) },
      predatorCapacity: { ...(entry.predatorCapacity ?? {}) },
      recoveryCooldownSec: round(entry.recoveryCooldownSec ?? 0, 2),
      breedingCooldownSec: round(entry.breedingCooldownSec ?? 0, 2),
      predatorRecoveryCooldownSec: round(entry.predatorRecoveryCooldownSec ?? 0, 2),
      herbivoreLowSec: round(entry.herbivoreLowSec ?? 0, 2),
      predatorAbsentSec: round(entry.predatorAbsentSec ?? 0, 2),
      stableSec: round(entry.stableSec ?? 0, 2),
      extinctionSec: round(entry.extinctionSec ?? 0, 2),
      crowdScore: round(entry.crowdScore ?? 0, 2),
    }));
  }
  return (scenario.wildlifeZones ?? []).map((zone) => ({
    id: String(zone.id ?? ""),
    label: String(zone.label ?? ""),
    herbivoreCount: Number(ecology.herbivoresByZone?.[zone.id] ?? 0),
    predatorCount: Number(ecology.predatorsByZone?.[zone.id] ?? 0),
    herbivoreCapacity: {},
    predatorCapacity: {},
    recoveryCooldownSec: 0,
    breedingCooldownSec: 0,
    predatorRecoveryCooldownSec: 0,
    herbivoreLowSec: 0,
    predatorAbsentSec: 0,
    stableSec: 0,
    extinctionSec: 0,
    crowdScore: 0,
  }));
}

export function buildLongRunTelemetry(state, viewState = null) {
  const runtime = getScenarioRuntime(state);
  const objective = state.gameplay?.objectives?.[state.gameplay?.objectiveIndex ?? 0] ?? null;
  const aiRuntime = ensureAiRuntimeStats(state);
  const errorWarnings = collectErrorWarnings(state);
  const populationByGroup = buildPopulationByGroup(state);
  const ecologyZoneStats = buildEcologyZoneStats(state);
  const telemetry = {
    capturedAtIso: new Date().toISOString(),
    phase: String(state.session?.phase ?? "menu"),
    tick: Number(state.metrics?.tick ?? 0),
    simTimeSec: round(state.metrics?.timeSec ?? 0, 2),
    world: {
      templateId: String(state.world?.mapTemplateId ?? ""),
      templateName: String(state.world?.mapTemplateName ?? ""),
      scenarioId: String(runtime.scenario?.id ?? ""),
      scenarioTitle: String(runtime.scenario?.title ?? ""),
      scenarioFamily: String(runtime.scenario?.family ?? ""),
      buildings: { ...runtime.counts },
      frontier: {
        connectedRoutes: Number(runtime.connectedRoutes ?? 0),
        totalRoutes: Number(runtime.routes?.length ?? 0),
        readyDepots: Number(runtime.readyDepots ?? 0),
        totalDepots: Number(runtime.depots?.length ?? 0),
        brokenRoutes: (runtime.routes ?? []).filter((route) => !route.connected).map((route) => route.label).slice(0, 3),
        unreadyDepots: (runtime.depots ?? []).filter((depot) => !depot.ready).map((depot) => depot.label).slice(0, 3),
      },
      weather: summarizeWeather(state),
      events: (state.events?.active ?? []).map((event) => ({
        type: String(event.type ?? ""),
        status: String(event.status ?? ""),
        intensity: round(event.intensity ?? 0, 2),
        targetLabel: String(event.payload?.targetLabel ?? ""),
        pressure: round(event.payload?.pressure ?? event.intensity ?? 0, 2),
        contestedTiles: Number(event.payload?.contestedTiles ?? 0),
      })),
      spatialPressure: {
        weatherPressure: round(state.metrics?.spatialPressure?.weatherPressure ?? 0, 2),
        eventPressure: round(state.metrics?.spatialPressure?.eventPressure ?? 0, 2),
        contestedZones: Number(state.metrics?.spatialPressure?.contestedZones ?? 0),
        contestedTiles: Number(state.metrics?.spatialPressure?.contestedTiles ?? 0),
        activeEventCount: Number(state.metrics?.spatialPressure?.activeEventCount ?? 0),
        peakEventSeverity: round(state.metrics?.spatialPressure?.peakEventSeverity ?? 0, 2),
        summary: String(state.metrics?.spatialPressure?.summary ?? "Spatial pressure: idle"),
      },
    },
    objective: {
      index: Number(state.gameplay?.objectiveIndex ?? 0),
      id: String(objective?.id ?? ""),
      title: String(objective?.title ?? ""),
      progress: round(objective?.progress ?? 100, 1),
      hint: String(state.gameplay?.objectiveHint ?? ""),
    },
    gameplay: {
      prosperity: round(state.gameplay?.prosperity ?? 0, 2),
      threat: round(state.gameplay?.threat ?? 0, 2),
      recovery: {
        charges: Number(state.gameplay?.recovery?.charges ?? 0),
        activeBoostSec: round(state.gameplay?.recovery?.activeBoostSec ?? 0, 1),
        collapseRisk: round(state.gameplay?.recovery?.collapseRisk ?? 0, 1),
        lastReason: String(state.gameplay?.recovery?.lastReason ?? ""),
      },
    },
    resources: {
      food: round(state.resources?.food ?? 0, 2),
      wood: round(state.resources?.wood ?? 0, 2),
    },
    population: {
      byGroup: populationByGroup,
    },
    deaths: {
      total: Number(state.metrics?.deathsTotal ?? 0),
      byReason: { ...(state.metrics?.deathsByReason ?? {}) },
    },
    logistics: {
      carryingWorkers: Number(state.metrics?.logistics?.carryingWorkers ?? 0),
      totalCarryInTransit: round(state.metrics?.logistics?.totalCarryInTransit ?? 0, 2),
      avgDepotDistance: round(state.metrics?.logistics?.avgDepotDistance ?? 0, 2),
      strandedCarryWorkers: Number(state.metrics?.logistics?.strandedCarryWorkers ?? 0),
      overloadedWarehouses: Number(state.metrics?.logistics?.overloadedWarehouses ?? 0),
      busiestWarehouseLoad: Number(state.metrics?.logistics?.busiestWarehouseLoad ?? 0),
      stretchedWorksites: Number(state.metrics?.logistics?.stretchedWorksites ?? 0),
      isolatedWorksites: Number(state.metrics?.logistics?.isolatedWorksites ?? 0),
      warehouseLoadByKey: { ...(state.metrics?.logistics?.warehouseLoadByKey ?? {}) },
      summary: String(state.metrics?.logistics?.summary ?? "Logistics: idle"),
    },
    ecology: {
      activeGrazers: Number(state.metrics?.ecology?.activeGrazers ?? 0),
      pressuredFarms: Number(state.metrics?.ecology?.pressuredFarms ?? 0),
      maxFarmPressure: round(state.metrics?.ecology?.maxFarmPressure ?? 0, 2),
      frontierPredators: Number(state.metrics?.ecology?.frontierPredators ?? 0),
      migrationHerds: Number(state.metrics?.ecology?.migrationHerds ?? 0),
      hotspotFarms: [...(state.metrics?.ecology?.hotspotFarms ?? [])],
      zoneStats: ecologyZoneStats,
      events: {
        ...(state.metrics?.ecology?.events ?? {}),
      },
      clusters: {
        ...(state.metrics?.ecology?.clusters ?? {}),
      },
      flags: {
        ...(state.metrics?.ecology?.flags ?? {}),
      },
      summary: String(state.metrics?.ecology?.summary ?? "Ecology: idle"),
      activePressure: round(
        Math.max(
          Number(state.metrics?.ecology?.maxFarmPressure ?? 0),
          Number(state.metrics?.spatialPressure?.eventPressure ?? 0),
          Number(state.metrics?.spatialPressure?.weatherPressure ?? 0),
        ),
        2,
      ),
    },
    warnings: {
      count: Number((state.metrics?.warningLog ?? []).length),
      errorCount: errorWarnings.length,
      errorWarnings,
    },
    performance: {
      fps: round(state.metrics?.averageFps ?? 0, 2),
      frameMs: round(state.metrics?.frameMs ?? 0, 2),
      headroomFps: round(
        Number(state.metrics?.frameMs ?? 0) > 0
          ? 1000 / Math.max(0.0001, Number(state.metrics.frameMs))
          : 0,
        2,
      ),
      heapMb: round(state.metrics?.memoryMb ?? 0, 2),
      renderMode: String(state.debug?.renderMode ?? "unknown"),
      entityCount: Number(state.metrics?.populationStats?.totalEntities ?? (state.agents.length + state.animals.length)),
      renderFrameCount: Number(state.metrics?.renderFrameCount ?? 0),
      simStepsThisFrame: Number(state.metrics?.simStepsThisFrame ?? 0),
      uiCpuMs: round(state.metrics?.uiCpuMs ?? 0, 2),
      renderCpuMs: round(state.metrics?.renderCpuMs ?? 0, 2),
    },
    ai: {
      enabled: Boolean(state.ai?.enabled),
      coverageTarget: String(state.ai?.coverageTarget ?? "fallback"),
      mode: String(state.ai?.mode ?? "fallback"),
      runtimeProfile: String(state.ai?.runtimeProfile ?? "default"),
      model: String(state.ai?.lastPolicyModel || state.ai?.lastEnvironmentModel || state.metrics?.proxyModel || ""),
      latencyMs: round(state.metrics?.aiLatencyMs ?? 0, 2),
      error: String(state.ai?.lastError || state.ai?.lastPolicyError || state.ai?.lastEnvironmentError || ""),
      proxyHealth: String(state.metrics?.proxyHealth ?? "unknown"),
      fallbackActive: String(state.ai?.mode ?? "fallback") !== "llm",
      requestCount: Number(aiRuntime.requestCount ?? 0),
      timeoutCount: Number(aiRuntime.timeoutCount ?? 0),
      fallbackCount: Number(aiRuntime.fallbackResponseCount ?? 0),
      llmCount: Number(aiRuntime.llmResponseCount ?? 0),
      avgLatencyMs: round(aiRuntime.avgLatencyMs ?? 0, 2),
      consecutiveFallbackResponses: Number(aiRuntime.consecutiveFallbackResponses ?? 0),
      maxUnrecoveredFallbackSec: round(aiRuntime.maxUnrecoveredFallbackSec ?? 0, 2),
      recoveryCount: Number(aiRuntime.recoveryCount ?? 0),
      lastErrorKind: String(aiRuntime.lastErrorKind ?? "none"),
      liveCoverageSatisfied: Boolean(aiRuntime.liveCoverageSatisfied),
    },
    view: {
      targetX: round(viewState?.targetX ?? 0, 2),
      targetZ: round(viewState?.targetZ ?? 0, 2),
      zoom: round(viewState?.zoom ?? 0, 3),
    },
    actionMessage: String(state.controls?.actionMessage ?? ""),
  };
  telemetry.nonFiniteMetrics = collectNonFiniteMetrics(telemetry);
  return telemetry;
}
