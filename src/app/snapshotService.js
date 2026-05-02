import { createDefaultEcologyMetrics, createDefaultWildlifeRuntime } from "../entities/EntityFactory.js";

const STORAGE_PREFIX = "utopia:snapshot:";
const GROUP_VISITORS = "visitors";
const GROUP_TRADERS = "traders";
const GROUP_SABOTEURS = "saboteurs";
const KIND_TRADER = "TRADER";

// A1-stability-hunter Round 3 P0:
// Recursively scrub values that `structuredClone` would otherwise reject
// with `DataCloneError` (functions, class instances with non-cloneable
// internals, accidental event-bus / NPC.deathListeners back-references).
//
// Scope is intentionally conservative — we only drop entries whose value is
// a `function`, leaving every plain primitive, array, plain object, Map,
// Set, and TypedArray untouched. This is enough to fix the observed
// regression (Save Snapshot → DataCloneError on a stray death-toast
// listener) without risk of over-stripping legitimate state.
//
// `seen` cycle-guard prevents infinite recursion on the inevitable
// world-graph back-references (e.g. agent → state → grid → agent).
function stripUncloneable(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "function") return undefined;
  if (t !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  // Preserve TypedArrays / DataView verbatim — structuredClone handles them.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (value instanceof Map) {
    const next = new Map();
    for (const [k, v] of value.entries()) {
      const cleaned = stripUncloneable(v, seen);
      if (typeof cleaned === "function") continue;
      next.set(k, cleaned);
    }
    return next;
  }
  if (value instanceof Set) {
    const next = new Set();
    for (const v of value.values()) {
      const cleaned = stripUncloneable(v, seen);
      if (typeof cleaned === "function") continue;
      next.add(cleaned);
    }
    return next;
  }
  if (Array.isArray(value)) {
    const next = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const cleaned = stripUncloneable(value[i], seen);
      next[i] = typeof cleaned === "function" ? null : cleaned;
    }
    return next;
  }
  // Plain object — drop function-valued keys, recurse on the rest.
  const next = {};
  for (const k of Object.keys(value)) {
    const cleaned = stripUncloneable(value[k], seen);
    if (cleaned === undefined && typeof value[k] === "function") continue;
    next[k] = cleaned;
  }
  return next;
}

function ensureStructuredClone(value) {
  // A1-stability-hunter Round 3 P0: strip function/listener leaks BEFORE
  // structuredClone so a stray `(event) => ...` reference can't take the
  // whole save path down with `DataCloneError`.
  const sanitized = stripUncloneable(value);
  if (typeof structuredClone === "function") return structuredClone(sanitized);
  return JSON.parse(JSON.stringify(sanitized));
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
    // v0.8.0 Phase 4 — "win" outcome retired; survival mode only persists "loss".
    outcome: outcome === "loss" ? outcome : "none",
    reason: typeof session.reason === "string" ? session.reason : "",
    endedAtSec: Number.isFinite(Number(session.endedAtSec)) ? Number(session.endedAtSec) : -1,
  };
}

function ensureAiRuntimeDefaults(snapshot) {
  snapshot.metrics.aiRuntime ??= {
    requestCount: 0,
    responseCount: 0,
    environmentRequests: 0,
    policyRequests: 0,
    environmentResponses: 0,
    policyResponses: 0,
    llmResponseCount: 0,
    fallbackResponseCount: 0,
    timeoutCount: 0,
    errorCount: 0,
    recoveryCount: 0,
    avgLatencyMs: 0,
    lastLatencyMs: 0,
    lastRequestSec: -999,
    lastResponseSec: -999,
    lastLiveSec: -999,
    lastFallbackSec: -999,
    maxUnrecoveredFallbackSec: 0,
    consecutiveFallbackResponses: 0,
    lastErrorKind: "none",
    lastErrorMessage: "",
    lastResultSource: "none",
    coverageTarget: "fallback",
    liveCoverageSatisfied: false,
  };
  snapshot.ai.coverageTarget ??= "fallback";
  snapshot.ai.runtimeProfile ??= "default";
  snapshot.ai.manualModeLocked ??= false;
}

export function makeSerializableSnapshot(state, rngSnapshot = null) {
  const snapshot = ensureStructuredClone(state);
  snapshot.grid.tiles = Array.from(state.grid.tiles);
  // A1-stability-hunter Round 3 P0: persist `grid.tileState` (Map<int, entry>)
  // as entries pairs. Renderer (SceneRenderer.js:1978/2085/2222/2245/2904)
  // assumes `tileState.get(idx)` is `Map.get`; plain `structuredClone` of a
  // Map serialises fine but JSON.stringify (saveToStorage) downgrades it to
  // {} and crashes the first frame after Load. mapToEntries + entriesToMap
  // restores the contract symmetric with `ai.groupPolicies`.
  if (state.grid.tileState instanceof Map) {
    snapshot.grid.tileState = mapToEntries(state.grid.tileState);
  }
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
  // A1-stability-hunter Round 3 P0: rehydrate `grid.tileState` as a Map so
  // SceneRenderer.js + every consumer of `grid.tileState.get(idx)` keeps
  // working after Load. Mirrors the `ai.groupPolicies` round-trip.
  // Tolerate legacy snapshots (pre-fix) where the field is missing or was
  // accidentally serialised as a plain object — fall back to an empty Map
  // rather than crashing the renderer on the very next frame.
  if (snapshot.grid.tileState instanceof Map) {
    // structuredClone preserved Map identity (in-process roundtrip) — keep.
  } else if (Array.isArray(snapshot.grid.tileState)) {
    snapshot.grid.tileState = entriesToMap(snapshot.grid.tileState);
  } else {
    snapshot.grid.tileState = new Map();
  }
  snapshot.ai.groupPolicies = entriesToMap(snapshot.ai.groupPolicies);
  snapshot.ai.groupStateTargets = entriesToMap(snapshot.ai.groupStateTargets);
  snapshot.ai.lastStateTargetBatch ??= [];
  migrateLegacyVisitorGroups(snapshot);
  migrateLegacyPopulationTargets(snapshot);
  migrateLegacySessionState(snapshot);
  ensureAiRuntimeDefaults(snapshot);
  snapshot.metrics.warningLog ??= [];
  snapshot.metrics.resourceEmptySec ??= { food: 0, wood: 0 };
  snapshot.metrics.resourceEmptySec.food = Number(snapshot.metrics.resourceEmptySec.food ?? 0);
  snapshot.metrics.resourceEmptySec.wood = Number(snapshot.metrics.resourceEmptySec.wood ?? 0);
  snapshot.metrics.invalidTransitionCount ??= 0;
  snapshot.metrics.idleWithoutReasonSec ??= {};
  snapshot.metrics.pathRecalcPerEntityPerMin ??= 0;
  snapshot.metrics.goalFlipCount ??= 0;
  snapshot.metrics.avgGoalFlipPerEntity ??= 0;
  snapshot.metrics.deliverWithoutCarryCount ??= 0;
  snapshot.metrics.feasibilityRejectCountByGroup ??= {};
  snapshot.metrics.starvationRiskCount ??= 0;
  snapshot.metrics.deathByReasonAndReachability ??= {};
  snapshot.metrics.ecologyPendingDeaths ??= {
    predation: 0,
    starvation: 0,
    event: 0,
  };
  snapshot.metrics.ecology ??= createDefaultEcologyMetrics();
  snapshot.metrics.ecology.zoneStats ??= [];
  snapshot.metrics.ecology.events ??= {
    births: 0,
    breedingSpawns: 0,
    recoverySpawns: 0,
    predatorRecoverySpawns: 0,
    predatorRetreats: 0,
    predationDeaths: 0,
    starvationDeaths: 0,
  };
  snapshot.metrics.ecology.clusters ??= {
    maxSameSpeciesClusterSize: 0,
    stuckClusterCount: 0,
    longestClusterDurationSec: 0,
    byGroup: {},
  };
  snapshot.metrics.ecology.flags ??= {
    extinctionRisk: false,
    overgrowthRisk: false,
    clumpingRisk: false,
    predatorWithoutPrey: false,
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
  snapshot.gameplay.wildlifeRuntime ??= createDefaultWildlifeRuntime();
  snapshot.gameplay.milestonesSeen = Array.isArray(snapshot.gameplay.milestonesSeen)
    ? snapshot.gameplay.milestonesSeen
    : [];
  snapshot.gameplay.milestoneBaseline ??= {
    warehouses: Number(snapshot.buildings?.warehouses ?? 0),
    farms: Number(snapshot.buildings?.farms ?? 0),
    lumbers: Number(snapshot.buildings?.lumbers ?? 0),
    kitchens: Number(snapshot.buildings?.kitchens ?? 0),
    meals: Number(snapshot.resources?.meals ?? 0),
    tools: Number(snapshot.resources?.tools ?? 0),
  };
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
      // v0.8.8 A9 (QA1 L8) — stringify once. The pre-fix double-stringify
      // could double the snapshot serialization cost on large colonies
      // (which can exceed 1 MB JSON), and was redundant.
      const json = JSON.stringify(payload);
      localStorage.setItem(key, json);
      return { key, bytes: json.length };
    },

    loadFromStorage(slotId) {
      const key = this.slotKey(slotId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      // A1-stability-hunter P2: harden against corrupted localStorage
      // payloads. A bare `null` already means "no snapshot" downstream,
      // so callers don't need any signature change — they just see the
      // same `notFound` path they'd hit for an unknown slot.
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
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
