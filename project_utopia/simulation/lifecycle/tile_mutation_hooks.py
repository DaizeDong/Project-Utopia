"""Tile-mutation cascade cleanup (port of ``TileMutationHooks.js``).

Whenever a tile changes type mid-simulation we must:

1. Refresh the building-count summary (``state["buildings"]``).
2. Release any worker reservation on the tile.
3. Invalidate worker paths / targets that touched the tile (only when the
   *new* tile blocks pathfinding — non-blocking transitions like
   ``GRASS → ROAD`` keep the path valid).
4. Mark the tile key dirty for downstream caches.
5. Optionally seed / clear wall HP when the tile becomes / ceases to be a
   ``WALL`` or ``GATE``.

The Python port also exposes a hook registry so :mod:`world.events` can
wire ``raid → RUINS`` mutations without touching this module directly.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from project_utopia.world.grid import TILE, Grid

__all__ = [
    "BLOCKING_TILES",
    "on_tile_mutated",
    "mutate_tile",
    "register_mutation_hook",
    "clear_mutation_hooks",
    "apply_world_event_impact",
]


BLOCKING_TILES: frozenset[int] = frozenset(
    {TILE["RUINS"], TILE["WALL"], TILE["WATER"]}
)
"""Tiles that block pathfinding. Mutating *to* one of these requires
path invalidation; mutating from one is non-blocking (path stays valid)."""


# Pluggable hook registry. Subscribers receive
# ``(state, ix, iz, old_tile, new_tile)`` after the canonical cascade has
# run. Stored as a list to preserve registration order — see migration
# brief: deterministic = sort by registration order, not callable identity.
_MUTATION_HOOKS: list[Callable[[dict[str, Any], int, int, int, int], None]] = []


def register_mutation_hook(
    hook: Callable[[dict[str, Any], int, int, int, int], None],
) -> Callable[[], None]:
    """Register a post-cascade tile-mutation hook.

    Returns an ``unsubscribe`` callable for symmetry with ``on_event``.
    """
    if hook not in _MUTATION_HOOKS:
        _MUTATION_HOOKS.append(hook)

    def unsubscribe() -> None:
        try:
            _MUTATION_HOOKS.remove(hook)
        except ValueError:
            pass

    return unsubscribe


def clear_mutation_hooks() -> None:
    """Drop all registered hooks. Test-only helper."""
    _MUTATION_HOOKS.clear()


def _rebuild_building_stats(grid: Grid) -> dict[str, int]:
    """Cheap pass over the tile array — same shape as JS ``rebuildBuildingStats``."""
    counts = {
        "warehouses": 0,
        "farms": 0,
        "lumbers": 0,
        "walls": 0,
        "roads": 0,
        "quarries": 0,
        "herbGardens": 0,
        "kitchens": 0,
        "smithies": 0,
        "clinics": 0,
        "bridges": 0,
        "gates": 0,
        "ruins": 0,
    }
    # ``grid.tiles`` is a numpy array (z, x). Flatten with .ravel() so
    # iteration is contiguous and deterministic.
    tiles = grid.tiles.ravel()
    for v in tiles.tolist():
        if v == TILE["WAREHOUSE"]:
            counts["warehouses"] += 1
        elif v == TILE["FARM"]:
            counts["farms"] += 1
        elif v == TILE["LUMBER"]:
            counts["lumbers"] += 1
        elif v == TILE["WALL"]:
            counts["walls"] += 1
        elif v == TILE["ROAD"]:
            counts["roads"] += 1
        elif v == TILE["QUARRY"]:
            counts["quarries"] += 1
        elif v == TILE["HERB_GARDEN"]:
            counts["herbGardens"] += 1
        elif v == TILE["KITCHEN"]:
            counts["kitchens"] += 1
        elif v == TILE["SMITHY"]:
            counts["smithies"] += 1
        elif v == TILE["CLINIC"]:
            counts["clinics"] += 1
        elif v == TILE["BRIDGE"]:
            counts["bridges"] += 1
        elif v == TILE["GATE"]:
            counts["gates"] += 1
        elif v == TILE["RUINS"]:
            counts["ruins"] += 1
    return counts


def _release_tile_reservation(state: dict[str, Any], ix: int, iz: int) -> None:
    reservation = state.get("_jobReservation")
    if reservation is None:
        return
    release_fn = getattr(reservation, "release_tile", None) or getattr(
        reservation, "releaseTile", None
    )
    if callable(release_fn):
        release_fn(ix, iz)


def _invalidate_agent_paths(
    state: dict[str, Any], ix: int, iz: int, new_blocks: bool
) -> None:
    agents = state.get("agents") or []
    for agent in agents:
        if not isinstance(agent, dict):
            continue
        if not bool(agent.get("alive", True)):
            continue
        target = agent.get("targetTile")
        target_matches = (
            isinstance(target, dict)
            and int(target.get("ix", -1)) == ix
            and int(target.get("iz", -1)) == iz
        )
        path_blocked_here = False
        if new_blocks:
            path = agent.get("path")
            if isinstance(path, list):
                for step in path:
                    if (
                        isinstance(step, dict)
                        and int(step.get("ix", -1)) == ix
                        and int(step.get("iz", -1)) == iz
                    ):
                        path_blocked_here = True
                        break
        if not (target_matches or path_blocked_here):
            continue
        if target_matches:
            agent["targetTile"] = None
        agent["path"] = None
        agent["pathIndex"] = 0
        agent["pathGridVersion"] = -1
        desired = agent.get("desiredVel")
        if isinstance(desired, dict):
            desired["x"] = 0.0
            desired["z"] = 0.0
        else:
            agent["desiredVel"] = {"x": 0.0, "z": 0.0}
        bb = agent.get("blackboard")
        if isinstance(bb, dict):
            bb["pendingPathWorkerKey"] = ""
            bb["pendingPathTargetTile"] = None


def on_tile_mutated(
    state: dict[str, Any],
    ix: int,
    iz: int,
    old_tile: int,
    new_tile: int,
) -> None:
    """Run the cascade-cleanup pass after a tile changes type.

    Idempotent — safe to call when ``old_tile == new_tile`` (will early-return).
    """
    if old_tile == new_tile:
        return
    grid = state.get("grid")
    if grid is None:
        return

    # 1. Rebuild building counts so any system that runs later in the same
    # tick sees a fresh layout.
    if isinstance(grid, Grid):
        state["buildings"] = _rebuild_building_stats(grid)

    # 2. Release reservations.
    _release_tile_reservation(state, ix, iz)

    # 3. Invalidate paths / targets when needed.
    new_blocks = int(new_tile) in BLOCKING_TILES
    _invalidate_agent_paths(state, ix, iz, new_blocks)

    # 4. Dirty-key marker for downstream caches (ProcessingSystem, etc.).
    dirty = state.get("_tileMutationDirtyKeys")
    if not isinstance(dirty, set):
        dirty = set()
        state["_tileMutationDirtyKeys"] = dirty
    dirty.add(f"{ix},{iz}")

    # 5. Wall / gate HP lifecycle.
    if isinstance(grid, Grid):
        tile_state = getattr(grid, "tile_state", None)
        if tile_state is not None:
            idx = iz * grid.width + ix
            if new_tile in (TILE["WALL"], TILE["GATE"]):
                entry = tile_state.get(idx)
                if entry is None:
                    entry = {
                        "fertility": 0.0,
                        "wear": 0.0,
                        "growthStage": 0,
                        "salinized": 0.0,
                        "fallowUntil": 0,
                        "yieldPool": 0.0,
                        "nodeFlags": 0,
                        "lastHarvestTick": -1,
                    }
                    tile_state[idx] = entry
                entry["wallHp"] = (
                    75.0 if new_tile == TILE["GATE"] else 50.0
                )
            elif old_tile in (TILE["WALL"], TILE["GATE"]):
                entry = tile_state.get(idx)
                if isinstance(entry, dict):
                    entry.pop("wallHp", None)
                    entry.pop("lastWallDamageTick", None)

    # Fan out to externally-registered hooks (e.g. world.events).
    for hook in list(_MUTATION_HOOKS):
        try:
            hook(state, ix, iz, old_tile, new_tile)
        except Exception:  # pragma: no cover — defensive
            # Hooks are observers, not transactional. A bad hook should
            # never poison the simulation tick.
            continue


def mutate_tile(state: dict[str, Any], ix: int, iz: int, new_tile: int) -> bool:
    """Mutate a tile + run the cleanup cascade. Returns ``True`` on change."""
    grid = state.get("grid")
    if not isinstance(grid, Grid):
        return False
    old_tile = int(grid.get_tile(ix, iz))
    if old_tile == new_tile:
        return False
    grid.set_tile(ix, iz, new_tile)
    on_tile_mutated(state, ix, iz, old_tile, int(new_tile))
    return True


def apply_world_event_impact(
    state: dict[str, Any],
    event_type: str,
    impact_tile: tuple[int, int] | None,
) -> None:
    """Apply tile-mutation side effects from a ``WorldEventSystem`` event.

    This is the hook signature the migration brief asks for: when a raid
    resolves with an ``impactTile`` payload field, mutate the tile to
    ``RUINS`` and fan-out via :func:`on_tile_mutated`.

    Callers (typically :mod:`project_utopia.world.events`) invoke this
    after their per-event lifecycle handler returns.
    """
    if impact_tile is None:
        return
    ix, iz = int(impact_tile[0]), int(impact_tile[1])
    if event_type in ("banditRaid", "bandit_raid"):
        mutate_tile(state, ix, iz, TILE["RUINS"])
    elif event_type == "wildfire":
        # Wildfire burns flammable production tiles down to GRASS.
        mutate_tile(state, ix, iz, TILE["GRASS"])
