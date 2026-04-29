/**
 * ConstructionSystem (v0.8.4) — checks construction-site completion and
 * applies the resulting tile mutation, refund, and emits the BUILDING_*
 * "phase: complete" events. Sits AFTER WorkerAISystem in SYSTEM_ORDER so
 * the per-worker workAppliedSec increments from this same tick are
 * already reflected on the overlay before we evaluate completion.
 *
 * The system never picks up "abandoned" overlays itself — the ColonyPlanner
 * and RoleAssignmentSystem ensure BUILDERs are dispatched. If no builder
 * exists, sites simply sit until one is assigned.
 *
 * On completion:
 *   - For build (kind: "build"): mutateTile to the targetTile, init
 *     wallHp on WALL/GATE, splice the index, clear the overlay, emit
 *     BUILDING_PLACED with phase "complete".
 *   - For demolish (kind: "demolish"): mutateTile to the targetTile
 *     (typically GRASS / WATER for bridge), grant the salvage refund,
 *     splice + clear, emit BUILDING_DESTROYED with phase "complete".
 */
import { BALANCE } from "../../config/balance.js";
import { ANIMAL_KIND, TILE, VISITOR_KIND } from "../../config/constants.js";
import { setTileField, worldToTile, tileToWorld, isPassable } from "../../world/grid/Grid.js";
import { mutateTile } from "../lifecycle/TileMutationHooks.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { refund as refundResources } from "./BuildAdvisor.js";
import {
  clearConstructionOverlay,
  getConstructionOverlay,
  rebuildConstructionSites,
} from "./ConstructionSites.js";

// v0.8.5 Tier 2 S2: walls regenerate HP toward maxHp after a safe window.
// Pure helper — iterates state.grid.tileState entries with a wallHp field
// and applies +regenPerSec*dt when the surrounding area is calm. Skip
// regen if any predator/saboteur is within `wallRegenHostileRadius` tiles
// or if the wall took damage in the last `wallRegenSafeWindowSec` seconds.
function regenerateWallHp(state, dt) {
  if (!state?.grid?.tileState?.forEach) return;
  const regenPerSec = Math.max(0, Number(BALANCE.wallHpRegenPerSec ?? 0.1));
  if (regenPerSec <= 0 || dt <= 0) return;
  const wallMaxHp = Math.max(1, Number(BALANCE.wallMaxHp ?? 50));
  const gateMaxHp = Math.max(1, Number(BALANCE.gateMaxHp ?? wallMaxHp));
  const safeWindowSec = Math.max(0, Number(BALANCE.wallRegenSafeWindowSec ?? 30));
  // Convert the safe window to ticks. SimulationClock advances tick by 1
  // per fixed step at the project's 30Hz fixed-time-step contract; if the
  // pacing ever changes, this conversion still keeps the safe window
  // proportional because lastWallDamageTick uses the same tick counter.
  const ticksPerSec = 30;
  const safeWindowTicks = safeWindowSec * ticksPerSec;
  const hostileR = Math.max(0, Number(BALANCE.wallRegenHostileRadius ?? 4));
  const tick = Number(state.metrics?.tick ?? 0);
  const grid = state.grid;
  const width = Number(grid.width ?? 0);

  // Pre-collect hostile positions (predators + active saboteurs) once per
  // pass so the inner-loop work is O(walls × hostiles) instead of touching
  // state.animals repeatedly. Most colonies have <3 hostiles at a time.
  const hostiles = [];
  for (const a of state.animals ?? []) {
    if (!a || a.alive === false) continue;
    if (a.kind !== ANIMAL_KIND.PREDATOR) continue;
    hostiles.push({ x: a.x, z: a.z });
  }
  for (const v of state.agents ?? []) {
    if (!v || v.alive === false) continue;
    if (v.type !== "VISITOR") continue;
    if (v.kind !== VISITOR_KIND.SABOTEUR) continue;
    hostiles.push({ x: v.x, z: v.z });
  }

  grid.tileState.forEach((entry, idx) => {
    if (!entry || entry.wallHp == null) return;
    const ix = idx % width;
    const iz = (idx - ix) / width;
    const tile = grid.tiles[idx];
    const max = tile === TILE.GATE ? gateMaxHp : wallMaxHp;
    if (entry.wallHp >= max) return;
    // Safe-window gate: skip regen if wall took damage recently.
    const lastDmgTick = Number(entry.lastWallDamageTick ?? -Infinity);
    if (Number.isFinite(lastDmgTick) && (tick - lastDmgTick) < safeWindowTicks) return;
    // Hostile-proximity gate: skip if any hostile within wallRegenHostileRadius tiles.
    let blocked = false;
    for (const h of hostiles) {
      const dx = h.x - ix;
      const dz = h.z - iz;
      // Manhattan distance approximation (cheap; world coords scale 1:1 with tiles).
      if (Math.abs(dx) + Math.abs(dz) <= hostileR) {
        blocked = true;
        break;
      }
    }
    if (blocked) return;
    entry.wallHp = Math.min(max, entry.wallHp + regenPerSec * dt);
  });
}

export class ConstructionSystem {
  constructor() {
    this.name = "ConstructionSystem";
  }

  update(_dt, state) {
    if (!state) return;
    // v0.8.5 Tier 2 S2: wall HP regeneration. Runs even when the
    // construction-site index is empty, because walls can age outside
    // active build sessions.
    regenerateWallHp(state, Number(_dt) || 0);
    state.constructionSites ??= [];
    const sites = state.constructionSites;
    if (sites.length === 0) return;

    // Iterate over a snapshot — we splice during iteration when sites
    // complete. Walk in-place from end so splice doesn't shift indices.
    for (let i = sites.length - 1; i >= 0; i -= 1) {
      const site = sites[i];
      if (!site) {
        sites.splice(i, 1);
        continue;
      }
      const overlay = getConstructionOverlay(state, site.ix, site.iz);
      if (!overlay) {
        // Authoritative state lost (e.g. cancelBlueprint already removed it
        // but the index entry survived a partial update). Drop the mirror.
        sites.splice(i, 1);
        continue;
      }
      // Sync the per-tick mirror with the authoritative overlay so callers
      // (renderer, role assignment) see the same workAppliedSec.
      site.workAppliedSec = Number(overlay.workAppliedSec ?? 0);
      site.workTotalSec = Number(overlay.workTotalSec ?? site.workTotalSec ?? 0);
      site.builderId = overlay.builderId ?? null;

      // If the assigned builder has died, free the slot so another
      // builder can claim it next tick.
      if (overlay.builderId) {
        const stillAlive = (state.agents ?? []).some(
          (a) => a && a.id === overlay.builderId && a.alive !== false,
        );
        if (!stillAlive) {
          overlay.builderId = null;
          site.builderId = null;
        }
      }

      const total = Number(overlay.workTotalSec ?? 0);
      if (!(total > 0) || Number(overlay.workAppliedSec ?? 0) < total) {
        continue;
      }

      // --- Completion branch ------------------------------------------
      const ix = site.ix;
      const iz = site.iz;
      const owner = String(overlay.owner ?? "player");
      const isBuild = overlay.kind === "build";
      const isDemolish = overlay.kind === "demolish";
      const targetTile = Number(overlay.targetTile ?? TILE.GRASS) | 0;
      const originalTile = Number(overlay.originalTile ?? TILE.GRASS) | 0;
      const tool = String(overlay.tool ?? "");

      // Clear the overlay BEFORE mutateTile so onTileMutated cleanup
      // (rebuildBuildingStats / reservation release / path invalidation)
      // sees the post-construction layout.
      clearConstructionOverlay(state, ix, iz);
      sites.splice(i, 1);

      // v0.8.6 Tier 2 BH4: displace any agent physically standing on the
      // soon-to-be-blocking WALL/GATE tile. Without this the agent is
      // faction-blocked the moment the tile mutates → A* finds no path → the
      // worker is permanently wedged. We snap them to the nearest passable
      // adjacent tile (4-neighbor preferred, 8-neighbor fallback).
      // v0.8.7 T0-5 (QA1-H4): when all 8 immediate neighbors are blocked
      // (e.g., wall ring tightened around the agent) extend to a small BFS
      // search up to radius 3. If still nothing the agent is genuinely
      // entombed — mark them dead with deathReason="trapped" so MortalitySystem
      // can spectate-clean them next pass instead of leaving a wedged ghost.
      if (targetTile === TILE.WALL || targetTile === TILE.GATE) {
        const agents = Array.isArray(state.agents) ? state.agents : [];
        const grid = state.grid;
        const snapAgentTo = (agent, nx, nz) => {
          const w = tileToWorld(nx, nz, grid);
          agent.x = w.x;
          agent.z = w.z;
          agent.targetTile = null;
          agent.path = null;
          agent.pathIndex = 0;
          agent.pathGridVersion = -1;
          if (agent.desiredVel) {
            agent.desiredVel.x = 0;
            agent.desiredVel.z = 0;
          } else {
            agent.desiredVel = { x: 0, z: 0 };
          }
        };
        for (const agent of agents) {
          if (!agent || agent.alive === false) continue;
          const at = worldToTile(Number(agent.x ?? 0), Number(agent.z ?? 0), grid);
          if (at.ix !== ix || at.iz !== iz) continue;
          // Find nearest passable adjacent tile (4 + 8 neighbors).
          const offsets = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1],
          ];
          let placed = false;
          for (const [dx, dz] of offsets) {
            const nx = ix + dx;
            const nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
            if (!isPassable(grid, nx, nz)) continue;
            snapAgentTo(agent, nx, nz);
            placed = true;
            break;
          }
          if (placed) continue;
          // BFS to radius 3 — find the nearest passable tile when all
          // immediate neighbors are blocked. Visited set keeps us linear.
          const maxRadius = 3;
          const queue = [[ix, iz, 0]];
          const visited = new Set([`${ix},${iz}`]);
          let found = null;
          while (queue.length > 0) {
            const [cx, cz, dist] = queue.shift();
            if (dist >= maxRadius) continue;
            for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              const nx = cx + dx;
              const nz = cz + dz;
              if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
              const key = `${nx},${nz}`;
              if (visited.has(key)) continue;
              visited.add(key);
              if (isPassable(grid, nx, nz)) { found = [nx, nz]; break; }
              queue.push([nx, nz, dist + 1]);
            }
            if (found) break;
          }
          if (found) {
            snapAgentTo(agent, found[0], found[1]);
          } else {
            // Genuinely entombed — kill the agent so the colony state is
            // not left holding a wedged ghost forever.
            agent.alive = false;
            agent.deathReason = "trapped";
          }
        }
      }

      mutateTile(state, ix, iz, targetTile);

      if (isBuild) {
        // v0.8.4 strategic walls + gate (Agent C handoff): newly-placed
        // wall/gate tiles get a fresh HP pool so raider attacks have
        // something to whittle down.
        // v0.8.5 Tier 3: gates use gateMaxHp (75) so they earn their stone
        // cost; walls keep wallMaxHp (50).
        if (targetTile === TILE.WALL) {
          setTileField(state.grid, ix, iz, "wallHp", Number(BALANCE.wallMaxHp ?? 50));
        } else if (targetTile === TILE.GATE) {
          setTileField(state.grid, ix, iz, "wallHp", Number(BALANCE.gateMaxHp ?? BALANCE.wallMaxHp ?? 50));
        }
        emitEvent(state, EVENT_TYPES.BUILDING_PLACED, {
          tool,
          ix,
          iz,
          oldType: originalTile,
          newType: targetTile,
          owner,
          phase: "complete",
        });
        // v0.8.6 Tier 0 LR-C3: count true completions toward
        // ColonyDirector.buildsPlaced — the diagnostic metric only goes up
        // when a blueprint actually finishes and the tile mutates. Autopilot-
        // owned blueprints submitted by ColonyDirectorSystem are tracked
        // separately as `blueprintsSubmitted` at submission time.
        if (owner === "autopilot" && state.ai?.colonyDirector) {
          const cd = state.ai.colonyDirector;
          cd.buildsPlaced = Number(cd.buildsPlaced ?? 0) + 1;
        }
      } else if (isDemolish) {
        // Salvage refund applied on completion. M1c-compatible: also emit
        // DEMOLITION_RECYCLED when there's a positive refund payload so
        // the LLM/UI recovery analytics still tally salvage.
        const r = overlay.refund ?? {};
        const positive = (Number(r.food ?? 0) > 0)
          || (Number(r.wood ?? 0) > 0)
          || (Number(r.stone ?? 0) > 0)
          || (Number(r.herbs ?? 0) > 0);
        if (positive) {
          refundResources(state.resources, r);
          const refundPayload = {
            wood: Number(r.wood ?? 0),
            stone: Number(r.stone ?? 0),
          };
          if (Number(r.food ?? 0) > 0) refundPayload.food = Number(r.food);
          if (Number(r.herbs ?? 0) > 0) refundPayload.herbs = Number(r.herbs);
          emitEvent(state, EVENT_TYPES.DEMOLITION_RECYCLED, {
            ix,
            iz,
            refund: refundPayload,
            oldType: originalTile,
          });
        }
        emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED, {
          tool,
          ix,
          iz,
          oldType: originalTile,
          newType: targetTile,
          owner,
          phase: "complete",
        });
      }
    }

    // Defensive: if sites array drifts out of sync with overlays (e.g.
    // after snapshot restore where the mirror is empty but overlays
    // exist), rebuild from authoritative tileState every ~5s.
    const tick = Number(state.metrics?.tick ?? 0);
    if (tick > 0 && tick % 300 === 0) {
      // Only rebuild when the index is suspiciously empty but tileState
      // still has overlays. Cheap probe: look for any tileState entry
      // with .construction. If found and array is empty, rebuild.
      if (state.constructionSites.length === 0 && state.grid?.tileState?.forEach) {
        let anyOverlay = false;
        state.grid.tileState.forEach((entry) => {
          if (anyOverlay) return;
          if (entry?.construction) anyOverlay = true;
        });
        if (anyOverlay) rebuildConstructionSites(state);
      }
    }
  }
}
