const DEFAULT_MAX_QUEUE = 4096;
const DEFAULT_MAX_RESULTS = 4096;

function canCreateWorkers() {
  return typeof Worker !== "undefined" && typeof URL !== "undefined";
}

function resolveWorkerCount(options = {}) {
  const requested = Number(options.workerCount);
  if (Number.isFinite(requested) && requested > 0) return Math.max(1, Math.min(32, Math.floor(requested)));
  const cores = Number(globalThis.navigator?.hardwareConcurrency ?? 4);
  return Math.max(2, Math.min(32, Number.isFinite(cores) ? Math.floor(cores) : 4));
}

function cloneTiles(tiles = []) {
  if (ArrayBuffer.isView(tiles)) return new Uint8Array(tiles);
  return Uint8Array.from(tiles);
}

function cloneElevation(elevation = null) {
  if (!elevation) return null;
  if (ArrayBuffer.isView(elevation)) return new Float32Array(elevation);
  return Float32Array.from(elevation);
}

function clonePlainObject(value) {
  if (!value || typeof value !== "object") return null;
  return { ...value };
}

// v0.8.4 strategic walls + GATE (Agent C). Faction-aware key — must match
// the PathCache key shape so a worker-pool result can be looked up under
// the same key the cache uses. Default "colony" preserves pre-v0.8.4
// behaviour for callers that don't pass a faction.
export function buildPathWorkerKey(gridVersion, start, goal, costVersion = 0, faction = "colony") {
  return `${gridVersion}:${costVersion}:${start.ix},${start.iz}->${goal.ix},${goal.iz}:${faction}`;
}

export function snapshotGridForPathWorker(grid, gridVersion) {
  return {
    version: Number(gridVersion ?? grid?.version ?? 0),
    width: Number(grid?.width ?? 0),
    height: Number(grid?.height ?? 0),
    tiles: cloneTiles(grid?.tiles ?? []),
    elevation: cloneElevation(grid?.elevation ?? null),
  };
}

export function snapshotDynamicCostsForPathWorker(state) {
  const hazardTileSet = state.weather?.hazardTileSet;
  return {
    hazards: {
      tileKeys: hazardTileSet instanceof Set ? Array.from(hazardTileSet) : null,
      penaltyMultiplier: Number(state.weather?.hazardPenaltyMultiplier ?? 1),
      penaltyByKey: clonePlainObject(state.weather?.hazardPenaltyByKey),
    },
    traffic: {
      penaltyByKey: clonePlainObject(state.metrics?.traffic?.penaltyByKey),
    },
  };
}

export class PathWorkerPool {
  constructor(options = {}) {
    this.available = false;
    this.maxQueue = Math.max(128, Number(options.maxQueue ?? DEFAULT_MAX_QUEUE));
    this.maxResults = Math.max(128, Number(options.maxResults ?? DEFAULT_MAX_RESULTS));
    this.queue = [];
    this.pendingKeys = new Set();
    this.results = new Map();
    this.nextId = 1;
    this.workers = [];
    this.stats = {
      workerCount: 0,
      requests: 0,
      queued: 0,
      dropped: 0,
      completed: 0,
      failed: 0,
      applied: 0,
      pending: 0,
      inFlight: 0,
      queueLength: 0,
      lastDurationMs: 0,
      avgDurationMs: 0,
      lastError: "",
    };

    if (!canCreateWorkers()) return;
    const workerCount = resolveWorkerCount(options);
    for (let i = 0; i < workerCount; i += 1) {
      this.workers.push(this.#createWorkerState(i));
    }
    this.available = this.workers.length > 0;
    this.stats.workerCount = this.workers.length;
  }

  #createWorkerState(index) {
    const worker = new Worker(new URL("./pathWorker.js", import.meta.url), { type: "module" });
    const state = {
      index,
      worker,
      busy: false,
      gridVersion: null,
      currentKey: "",
    };
    worker.onmessage = (event) => this.#handleMessage(state, event.data ?? {});
    worker.onerror = (event) => {
      this.stats.failed += 1;
      this.stats.lastError = String(event?.message ?? "path worker error");
      state.busy = false;
      if (state.currentKey) this.pendingKeys.delete(state.currentKey);
      state.currentKey = "";
      this.#syncStats();
      this.#pump();
    };
    return state;
  }

  #handleMessage(workerState, message) {
    workerState.busy = false;
    workerState.currentKey = "";
    const key = String(message.key ?? "");
    if (key) {
      this.pendingKeys.delete(key);
      this.results.set(key, {
        path: Array.isArray(message.path) ? message.path : null,
        error: String(message.error ?? ""),
        durationMs: Number(message.durationMs ?? 0),
      });
      while (this.results.size > this.maxResults) {
        const firstKey = this.results.keys().next().value;
        if (!firstKey) break;
        this.results.delete(firstKey);
      }
    }
    const durationMs = Number(message.durationMs ?? 0);
    this.stats.completed += 1;
    if (!Array.isArray(message.path)) this.stats.failed += 1;
    this.stats.lastDurationMs = durationMs;
    this.stats.avgDurationMs = this.stats.avgDurationMs * 0.92 + durationMs * 0.08;
    if (message.error) this.stats.lastError = String(message.error);
    this.#syncStats();
    this.#pump();
  }

  #syncStats() {
    this.stats.pending = this.pendingKeys.size;
    this.stats.inFlight = this.workers.filter((entry) => entry.busy).length;
    this.stats.queueLength = this.queue.length;
  }

  #pump() {
    if (!this.available) return;
    for (const workerState of this.workers) {
      if (workerState.busy) continue;
      const job = this.queue.shift();
      if (!job) break;
      workerState.busy = true;
      workerState.currentKey = job.key;
      const includeGrid = workerState.gridVersion !== job.gridVersion;
      if (includeGrid) workerState.gridVersion = job.gridVersion;
      workerState.worker.postMessage({
        type: "path",
        job: {
          id: job.id,
          key: job.key,
          gridVersion: job.gridVersion,
          costVersion: job.costVersion,
          start: job.start,
          goal: job.goal,
          weatherMoveCostMultiplier: job.weatherMoveCostMultiplier,
          dynamicCosts: job.dynamicCosts,
          grid: includeGrid ? job.grid : null,
          // v0.8.4 strategic walls + GATE (Agent C). Forward the faction to
          // the worker-side aStar call so off-thread searches respect gate
          // permissions identically to main-thread searches.
          faction: String(job.faction ?? "colony"),
        },
      });
    }
    this.#syncStats();
  }

  request(job = {}) {
    if (!this.available || !job.key) return false;
    if (this.pendingKeys.has(job.key) || this.results.has(job.key)) return true;
    this.stats.requests += 1;
    if (this.queue.length >= this.maxQueue) {
      this.stats.dropped += 1;
      this.#syncStats();
      return false;
    }
    this.pendingKeys.add(job.key);
    this.queue.push({
      ...job,
      id: this.nextId++,
    });
    this.stats.queued += 1;
    this.#syncStats();
    this.#pump();
    return true;
  }

  take(key) {
    if (!key || !this.results.has(key)) return null;
    const result = this.results.get(key);
    this.results.delete(key);
    this.stats.applied += 1;
    this.#syncStats();
    return result;
  }

  hasPending(key) {
    return this.pendingKeys.has(key);
  }

  getStats() {
    this.#syncStats();
    return { ...this.stats };
  }

  dispose() {
    for (const entry of this.workers) {
      entry.worker.terminate();
    }
    this.workers = [];
    this.queue = [];
    this.pendingKeys.clear();
    this.results.clear();
    this.available = false;
    this.#syncStats();
  }
}
