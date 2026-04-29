// v0.8.13 — PathFailBlacklist service (audit A6).
//
// When A* fails for a (worker, ix, iz, tileType) tuple, mark the tuple
// blacklisted for `ttlSec` seconds of simulated time. `chooseWorkerTarget`
// skips blacklisted candidates so a worker doesn't infinitely re-pick the
// same tile that just failed to path.
//
// Architectural prep for v0.9.0 Job-layer rewrite (A1+A3): the Job-layer
// target-finder will consult the same blacklist before scoring candidates.

const DEFAULT_TTL_SEC = 5;

function makeKey(ix, iz, tileType) {
  return `${Number(tileType) | 0}|${ix},${iz}`;
}

/**
 * Per-worker (ix, iz, tileType) blacklist. Entries expire after `ttlSec`
 * seconds of simulated time.
 *
 * Storage: `Map<workerId, Map<key, expiresAtSec>>`. The outer Map is
 * lazily populated on first `mark`; `forgetWorker` removes a whole
 * worker's entries (call on death/despawn so a recycled id doesn't
 * inherit stale blacklists).
 */
export class PathFailBlacklist {
  constructor() {
    this._byWorker = new Map();
    this._stats = {
      totalMarks: 0,
      hitsThisTick: 0,
      lastPurgedTick: -1,
      activeEntries: 0,
    };
  }

  mark(workerId, ix, iz, tileType, nowSec, ttlSec = DEFAULT_TTL_SEC) {
    if (workerId == null) return;
    const id = String(workerId);
    let inner = this._byWorker.get(id);
    if (!inner) {
      inner = new Map();
      this._byWorker.set(id, inner);
    }
    const key = makeKey(ix, iz, tileType);
    inner.set(key, Number(nowSec ?? 0) + Number(ttlSec ?? DEFAULT_TTL_SEC));
    this._stats.totalMarks += 1;
  }

  isBlacklisted(workerId, ix, iz, tileType, nowSec) {
    if (workerId == null) return false;
    const inner = this._byWorker.get(String(workerId));
    if (!inner) return false;
    const key = makeKey(ix, iz, tileType);
    const expiresAt = inner.get(key);
    if (!Number.isFinite(expiresAt)) return false;
    if (Number(nowSec ?? 0) >= expiresAt) {
      // Lazy expiry on read so a stale entry never lingers when its tile is
      // re-scored. Avoids growing the inner Map indefinitely between
      // purgeExpired calls.
      inner.delete(key);
      if (inner.size === 0) this._byWorker.delete(String(workerId));
      return false;
    }
    this._stats.hitsThisTick += 1;
    return true;
  }

  /**
   * Sweep all expired entries. Call once per tick (top of WorkerAISystem.update).
   */
  purgeExpired(nowSec) {
    const cutoff = Number(nowSec ?? 0);
    let active = 0;
    for (const [workerId, inner] of this._byWorker) {
      for (const [key, expiresAt] of inner) {
        if (expiresAt <= cutoff) inner.delete(key);
      }
      if (inner.size === 0) {
        this._byWorker.delete(workerId);
      } else {
        active += inner.size;
      }
    }
    this._stats.activeEntries = active;
    this._stats.lastPurgedTick += 1;
    // Reset hit-count window after each purge so getStats reflects "since
    // last purge" rather than total lifetime.
    this._stats.hitsThisTick = 0;
  }

  forgetWorker(workerId) {
    if (workerId == null) return;
    this._byWorker.delete(String(workerId));
  }

  getStats() {
    let active = 0;
    for (const inner of this._byWorker.values()) active += inner.size;
    return {
      activeEntries: active,
      totalMarks: this._stats.totalMarks,
      hitsThisTick: this._stats.hitsThisTick,
      workersTracked: this._byWorker.size,
    };
  }
}
