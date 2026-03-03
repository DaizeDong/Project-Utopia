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

export function makeSerializableSnapshot(state, rngSnapshot = null) {
  const snapshot = ensureStructuredClone(state);
  snapshot.grid.tiles = Array.from(state.grid.tiles);
  snapshot.ai.groupPolicies = mapToEntries(state.ai.groupPolicies);
  snapshot.meta = {
    capturedAt: new Date().toISOString(),
    rng: rngSnapshot ?? null,
  };
  return snapshot;
}

export function restoreSnapshotState(serialized) {
  const snapshot = ensureStructuredClone(serialized);
  snapshot.grid.tiles = Uint8Array.from(snapshot.grid.tiles ?? []);
  snapshot.ai.groupPolicies = entriesToMap(snapshot.ai.groupPolicies);
  migrateLegacyVisitorGroups(snapshot);
  snapshot.metrics.warningLog ??= [];
  return snapshot;
}

export function createSnapshotService() {
  return {
    slotKey(slotId = "default") {
      const safe = String(slotId || "default").trim() || "default";
      return `${STORAGE_PREFIX}${safe}`;
    },

    saveToStorage(slotId, state, rngSnapshot = null) {
      const key = this.slotKey(slotId);
      const payload = makeSerializableSnapshot(state, rngSnapshot);
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

    exportJson(state, rngSnapshot = null) {
      const payload = makeSerializableSnapshot(state, rngSnapshot);
      return `${JSON.stringify(payload, null, 2)}\n`;
    },

    importJson(raw) {
      const parsed = JSON.parse(raw);
      return restoreSnapshotState(parsed);
    },
  };
}
