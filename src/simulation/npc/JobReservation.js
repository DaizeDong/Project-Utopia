/**
 * Job Reservation registry — prevents multiple workers from targeting
 * the same tile by tracking per-tile reservations.
 *
 * Internal storage: Map<string, {workerId, intentKey, timestamp}>
 * where key is "ix,iz".
 */
export class JobReservation {
  constructor() {
    /** @type {Map<string, {workerId: string, intentKey: string, timestamp: number}>} */
    this._tiles = new Map();
    /** @type {Map<string, string>} workerId -> tileKey */
    this._workerToTile = new Map();
  }

  /**
   * Reserve a tile for the given worker. Automatically releases any
   * previous reservation held by this worker.
   * @param {string} workerId
   * @param {number} ix
   * @param {number} iz
   * @param {string} intentKey
   * @param {number} nowSec
   */
  reserve(workerId, ix, iz, intentKey, nowSec) {
    // Release previous reservation for this worker (if any)
    const prevKey = this._workerToTile.get(workerId);
    if (prevKey !== undefined) {
      const entry = this._tiles.get(prevKey);
      if (entry && entry.workerId === workerId) {
        this._tiles.delete(prevKey);
      }
    }

    const key = `${ix},${iz}`;
    this._tiles.set(key, { workerId, intentKey, timestamp: nowSec });
    this._workerToTile.set(workerId, key);
  }

  /**
   * Release the reservation for a specific worker on a specific tile.
   * @param {string} workerId
   * @param {number} ix
   * @param {number} iz
   */
  release(workerId, ix, iz) {
    const key = `${ix},${iz}`;
    const entry = this._tiles.get(key);
    if (entry && entry.workerId === workerId) {
      this._tiles.delete(key);
    }
    const workerKey = this._workerToTile.get(workerId);
    if (workerKey === key) {
      this._workerToTile.delete(workerId);
    }
  }

  /**
   * Release any reservation on this tile, regardless of worker. Used when
   * the underlying tile is destroyed (sabotage/demolition/wildfire) so the
   * reservation doesn't linger on a now-RUIN tile.
   * @param {number} ix
   * @param {number} iz
   */
  releaseTile(ix, iz) {
    const key = `${ix},${iz}`;
    const entry = this._tiles.get(key);
    if (!entry) return;
    this._tiles.delete(key);
    const workerKey = this._workerToTile.get(entry.workerId);
    if (workerKey === key) {
      this._workerToTile.delete(entry.workerId);
    }
  }

  /**
   * Release all reservations held by the given worker.
   * @param {string} workerId
   */
  releaseAll(workerId) {
    const tileKey = this._workerToTile.get(workerId);
    if (tileKey !== undefined) {
      const entry = this._tiles.get(tileKey);
      if (entry && entry.workerId === workerId) {
        this._tiles.delete(tileKey);
      }
      this._workerToTile.delete(workerId);
    }
  }

  /**
   * Check whether a tile is reserved by someone other than excludeWorkerId.
   * @param {number} ix
   * @param {number} iz
   * @param {string|null} [excludeWorkerId]
   * @returns {boolean}
   */
  isReserved(ix, iz, excludeWorkerId = null) {
    const key = `${ix},${iz}`;
    const entry = this._tiles.get(key);
    if (!entry) return false;
    if (excludeWorkerId !== null && entry.workerId === excludeWorkerId) return false;
    return true;
  }

  /**
   * Get the number of reservations on a tile. Since the current model
   * stores at most one reservation per tile key, this returns 0 or 1.
   * @param {number} ix
   * @param {number} iz
   * @returns {number}
   */
  getReservationCount(ix, iz) {
    const key = `${ix},${iz}`;
    return this._tiles.has(key) ? 1 : 0;
  }

  /**
   * Get the tile currently reserved by a worker, or null.
   * @param {string} workerId
   * @returns {{ix: number, iz: number}|null}
   */
  getWorkerReservation(workerId) {
    const key = this._workerToTile.get(workerId);
    if (key === undefined) return null;
    const entry = this._tiles.get(key);
    if (!entry || entry.workerId !== workerId) {
      // Stale reverse mapping — clean up
      this._workerToTile.delete(workerId);
      return null;
    }
    const [ixStr, izStr] = key.split(",");
    return { ix: Number(ixStr), iz: Number(izStr) };
  }

  /**
   * Remove reservations older than maxAgeSec.
   * @param {number} nowSec
   * @param {number} [maxAgeSec=30]
   */
  cleanupStale(nowSec, maxAgeSec = 30) {
    const cutoff = nowSec - maxAgeSec;
    for (const [key, entry] of this._tiles) {
      if (entry.timestamp < cutoff) {
        this._tiles.delete(key);
        const workerKey = this._workerToTile.get(entry.workerId);
        if (workerKey === key) {
          this._workerToTile.delete(entry.workerId);
        }
      }
    }
  }

  /**
   * Return summary stats.
   * @returns {{totalReservations: number, totalWorkers: number}}
   */
  get stats() {
    return {
      totalReservations: this._tiles.size,
      totalWorkers: this._workerToTile.size,
    };
  }
}
