const STORAGE_PREFIX = "utopia:snapshot:";
const GROUP_VISITORS = "visitors";
const GROUP_TRADERS = "traders";
const GROUP_SABOTEURS = "saboteurs";
const KIND_TRADER = "TRADER";

function ensureStructuredClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function mapToEntries(value) {
  if (!(value instanceof Map)) return value;
  return Array.from(value.entries()).map(([k, v]) => [k, ensureStructuredClone(v)]);
}

function entriesToMap(value) {
  if (!Array.isArray(value)) return new Map();
  return new Map(value);
}

function mapVisitorGroupByKind(entity) {
  if (!entity || entity.type !== "VISITOR") return;
  if (entity.groupId && entity.groupId !== GROUP_VISITORS) return;
  const kind = String(entity.kind ?? "");
  entity.groupId = kind === KIND_TRADER ? GROUP_TRADERS : GROUP_SABOTEURS;
}

function migrateLegacyVisitorGroups(snapshot) {
  for (const agent of snapshot.agents ?? []) {
    mapVisitorGroupByKind(agent);
  }

  const map = snapshot.ai?.groupPolicies;
  if (!(map instanceof Map)) return;
  if (!map.has(GROUP_VISITORS)) return;

  const legacy = map.get(GROUP_VISITORS);
  map.delete(GROUP_VISITORS);
  if (!map.has(GROUP_TRADERS)) map.set(GROUP_TRADERS, ensureStructuredClone(legacy));
  if (!map.has(GROUP_SABOTEURS)) map.set(GROUP_SABOTEURS, ensureStructuredClone(legacy));

  const byGroup = snapshot.ai.lastPolicyExchangeByGroup;
  if (byGroup && typeof byGroup === "object" && byGroup[GROUP_VISITORS]) {
    byGroup[GROUP_TRADERS] ??= ensureStructuredClone(byGroup[GROUP_VISITORS]);
    byGroup[GROUP_SABOTEURS] ??= ensureStructuredClone(byGroup[GROUP_VISITORS]);
    delete byGroup[GROUP_VISITORS];
  }

  if (Array.isArray(snapshot.ai.lastPolicyBatch)) {
    const migrated = [];
    for (const policy of snapshot.ai.lastPolicyBatch) {
      if (policy?.groupId === GROUP_VISITORS) {
        migrated.push({ ...policy, groupId: GROUP_TRADERS });
        migrated.push({ ...policy, groupId: GROUP_SABOTEURS });
      } else {
        migrated.push(policy);
      }
    }
    snapshot.ai.lastPolicyBatch = migrated;
  }
}

function migrateLegacyPopulationTargets(snapshot) {
  const targets = snapshot?.controls?.populationTargets;
  if (!targets || typeof targets !== "object") return;
  const hasTraders = Number.isFinite(Number(targets.traders));
  const hasSaboteurs = Number.isFinite(Number(targets.saboteurs));
  if (hasTraders && hasSaboteurs) {
    targets.visitors = (Number(targets.traders) | 0) + (Number(targets.saboteurs) | 0);
    return;
  }

  const legacyVisitors = Number.isFinite(Number(targets.visitors))
    ? Math.max(0, Math.round(Number(targets.visitors)))
    : 0;
  const traders = hasTraders ? Math.max(0, Math.round(Number(targets.traders))) : Math.round(legacyVisitors * 0.2);
  const saboteurs = hasSaboteurs
    ? Math.max(0, Math.round(Number(targets.saboteurs)))
    : Math.max(0, legacyVisitors - traders);

  targets.traders = traders;
  targets.saboteurs = saboteurs;
  targets.visitors = traders + saboteurs;
}

function migrateLegacySessionState(snapshot) {
  const session = snapshot?.session;
  if (!session || typeof session !== "object") {
    snapshot.session = {
      phase: "menu",
      outcome: "none",
      reason: "",
      endedAtSec: -1,
    };
    return;
  }

  const phase = String(session.phase ?? "menu");
  const outcome = String(session.outcome ?? "none");
  snapshot.session = {
    phase: phase === "active" || phase === "end" ? phase : "menu",
    outcome: outcome === "win" || outcome === "loss" ? outcome : "none",
    reason: typeof session.reason === "string" ? session.reason : "",
    endedAtSec: Number.isFinite(Number(session.endedAtSec)) ? Number(session.endedAtSec) : -1,
  };
}

export function makeSerializableSnapshot(state, rngSnapshot = null) {
  const snapshot = ensureStructuredClone(state);
  snapshot.grid.tiles = Array.from(state.grid.tiles);
  snapshot.ai.groupPolicies = mapToEntries(state.ai.groupPolicies);
  snapshot.ai.groupStateTargets = mapToEntries(state.ai.groupStateTargets);
  snapshot.meta = {
    capturedAt: new Date().toISOString(),
    rng: rngSnapshot ?? null,
  };
  return snapshot;
}

function mergeSnapshotMeta(snapshot, extraMeta = null) {
  if (!extraMeta || typeof extraMeta !== "object") return snapshot;
  snapshot.meta = {
    ...(snapshot.meta ?? {}),
    ...ensureStructuredClone(extraMeta),
  };
  return snapshot;
}

export function restoreSnapshotState(serialized) {
  const snapshot = ensureStructuredClone(serialized);
  snapshot.grid.tiles = Uint8Array.from(snapshot.grid.tiles ?? []);
  snapshot.ai.groupPolicies = entriesToMap(snapshot.ai.groupPolicies);
  snapshot.ai.groupStateTargets = entriesToMap(snapshot.ai.groupStateTargets);
  snapshot.ai.lastStateTargetBatch ??= [];
  migrateLegacyVisitorGroups(snapshot);
  migrateLegacyPopulationTargets(snapshot);
  migrateLegacySessionState(snapshot);
  snapshot.metrics.warningLog ??= [];
  snapshot.metrics.invalidTransitionCount ??= 0;
  snapshot.metrics.idleWithoutReasonSec ??= {};
  snapshot.metrics.pathRecalcPerEntityPerMin ??= 0;
  snapshot.metrics.goalFlipCount ??= 0;
  snapshot.metrics.avgGoalFlipPerEntity ??= 0;
  snapshot.metrics.deliverWithoutCarryCount ??= 0;
  snapshot.metrics.feasibilityRejectCountByGroup ??= {};
  snapshot.metrics.starvationRiskCount ??= 0;
  snapshot.metrics.deathByReasonAndReachability ??= {};
  snapshot.metrics.ecology ??= {
    activeGrazers: 0,
    pressuredFarms: 0,
    maxFarmPressure: 0,
    frontierPredators: 0,
    migrationHerds: 0,
    farmPressureByKey: {},
    hotspotFarms: [],
    herbivoresByZone: {},
    predatorsByZone: {},
    summary: "Ecology: idle",
  };
  snapshot.metrics.spatialPressure ??= {
    weatherPressure: 0,
    eventPressure: 0,
    contestedZones: 0,
    contestedTiles: 0,
    activeEventCount: 0,
    peakEventSeverity: 0,
    summary: "Spatial pressure: idle",
  };
  snapshot.metrics.spatialPressure.weatherPressure ??= 0;
  snapshot.metrics.spatialPressure.eventPressure ??= 0;
  snapshot.metrics.spatialPressure.contestedZones ??= 0;
  snapshot.metrics.spatialPressure.contestedTiles ??= 0;
  snapshot.metrics.spatialPressure.activeEventCount ??= 0;
  snapshot.metrics.spatialPressure.peakEventSeverity ??= 0;
  snapshot.metrics.spatialPressure.summary ??= "Spatial pressure: idle";
  snapshot.weather.hazardTiles ??= [];
  snapshot.weather.hazardTileSet = new Set((snapshot.weather.hazardTiles ?? []).map((tile) => `${tile.ix},${tile.iz}`));
  snapshot.weather.hazardPenaltyByKey ??= {};
  snapshot.weather.hazardLabelByKey ??= {};
  snapshot.weather.hazardFronts ??= [];
  snapshot.weather.hazardFocusSummary ??= "";
  snapshot.weather.pressureScore ??= 0;
  snapshot.debug.logic ??= {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  };
  return snapshot;
}

export function createSnapshotService() {
  return {
    slotKey(slotId = "default") {
      const safe = String(slotId || "default").trim() || "default";
      return `${STORAGE_PREFIX}${safe}`;
    },

    saveToStorage(slotId, state, rngSnapshot = null, extraMeta = null) {
      const key = this.slotKey(slotId);
      const payload = mergeSnapshotMeta(makeSerializableSnapshot(state, rngSnapshot), extraMeta);
      localStorage.setItem(key, JSON.stringify(payload));
      return { key, bytes: JSON.stringify(payload).length };
    },

    loadFromStorage(slotId) {
      const key = this.slotKey(slotId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return restoreSnapshotState(parsed);
    },

    exportJson(state, rngSnapshot = null, extraMeta = null) {
      const payload = mergeSnapshotMeta(makeSerializableSnapshot(state, rngSnapshot), extraMeta);
      return `${JSON.stringify(payload, null, 2)}\n`;
    },

    importJson(raw) {
      const parsed = JSON.parse(raw);
      return restoreSnapshotState(parsed);
    },
  };
}
