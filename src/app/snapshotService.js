const STORAGE_PREFIX = "utopia:snapshot:";

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
