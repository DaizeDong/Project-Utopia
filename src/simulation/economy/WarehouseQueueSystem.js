import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

/**
 * WarehouseQueueSystem — Phase 2 / M2 warehouse throughput.
 *
 * Each warehouse accepts at most `BALANCE.warehouseIntakePerTick` deposits per
 * tick. Excess workers queue on the tile; a worker that waits longer than
 * `BALANCE.warehouseQueueMaxWaitTicks` is removed from the queue, emits a
 * `WAREHOUSE_QUEUE_TIMEOUT` event, and has its `targetTile` nulled so the
 * intent layer (WorkerAISystem) re-plans toward an alternative warehouse.
 *
 * Runs BEFORE WorkerAISystem so intake tokens are refreshed each tick before
 * any worker attempts to deposit.
 *
 * State shape:
 *   state.warehouseQueues: { [tileKey]: {
 *     intakeTokensUsed: number,
 *     queue: Array<workerId>,
 *     lastResetTick: number,
 *   }}
 */
export class WarehouseQueueSystem {
  constructor() {
    this.name = "WarehouseQueueSystem";
  }

  update(_dt, state, _services) {
    state.warehouseQueues ??= {};
    const queues = state.warehouseQueues;
    // v0.8.7.1 P8 — early-exit when no warehouses have active queues. Skips
    // the per-tick worker map build on the common no-deposit-pending path.
    const keys = Object.keys(queues);
    if (keys.length === 0) return;
    const tick = Number(state.metrics?.tick ?? 0);
    const maxWait = Number(BALANCE.warehouseQueueMaxWaitTicks ?? 120);
    const grid = state.grid;
    if (!grid) return;
    const width = Number(grid.width ?? 0);
    const height = Number(grid.height ?? 0);

    // Build a quick lookup of live workers by id for queue scanning.
    const workersById = new Map();
    for (const agent of state.agents ?? []) {
      if (agent?.type === "WORKER" && agent.alive !== false) {
        workersById.set(agent.id, agent);
      }
    }

    for (const key of keys) {
      const entry = queues[key];
      if (!entry) {
        delete queues[key];
        continue;
      }

      // Parse tile coords from key and verify warehouse still exists.
      const parts = key.split(",");
      const ix = Number(parts[0]);
      const iz = Number(parts[1]);
      const inBounds = Number.isFinite(ix) && Number.isFinite(iz)
        && ix >= 0 && iz >= 0 && ix < width && iz < height;
      const tileType = inBounds ? grid.tiles[ix + iz * width] : -1;
      if (!inBounds || tileType !== TILE.WAREHOUSE) {
        // Warehouse destroyed or invalid — drop any queued-timeout blackboard
        // entries that reference this key, but do not retarget (other systems
        // will reassign naturally when the worker re-plans).
        delete queues[key];
        continue;
      }

      // Reset intake tokens once per tick.
      if (Number(entry.lastResetTick ?? -1) !== tick) {
        entry.intakeTokensUsed = 0;
        entry.lastResetTick = tick;
      }
      entry.queue ??= [];

      // Scan queue for timeouts + stale entries. Iterate a copy because we mutate entry.queue.
      const snapshot = entry.queue.slice();
      for (const workerId of snapshot) {
        const worker = workersById.get(workerId);
        if (!worker) {
          // Worker vanished — drop from queue.
          const idx = entry.queue.indexOf(workerId);
          if (idx >= 0) entry.queue.splice(idx, 1);
          continue;
        }
        // Prune workers whose targetTile no longer points at this warehouse
        // (re-planned to a different depot / changed intent). Prevents queue leak.
        const tt = worker.targetTile;
        if (!tt || Number(tt.ix) !== ix || Number(tt.iz) !== iz) {
          const idx = entry.queue.indexOf(workerId);
          if (idx >= 0) entry.queue.splice(idx, 1);
          if (worker.blackboard) worker.blackboard.queueEnteredTick = null;
          continue;
        }
        worker.blackboard ??= {};
        const enteredTick = Number(worker.blackboard.queueEnteredTick ?? tick);
        if (tick - enteredTick > maxWait) {
          // Timeout: remove from queue and force re-plan.
          const idx = entry.queue.indexOf(workerId);
          if (idx >= 0) entry.queue.splice(idx, 1);
          worker.blackboard.queueTimeoutTick = tick;
          worker.blackboard.queueEnteredTick = null;
          worker.targetTile = null;
          emitEvent(state, EVENT_TYPES.WAREHOUSE_QUEUE_TIMEOUT, {
            entityId: worker.id,
            tileKey: key,
          });
        }
      }
    }
  }
}
