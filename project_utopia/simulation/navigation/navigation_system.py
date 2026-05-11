"""Top-level navigation glue (lean port of ``src/simulation/navigation/Navigation.js``).

Phase 1 ports only the deterministic-substrate surface required by the
benchmark harness:

* :func:`set_target_and_path` — choose the best path (cached → worker
  pool → in-thread A*) and bind it to an entity.
* :func:`follow_path` — advance one tick along an existing path.
* :func:`clear_path` — wipe the path fields on an entity.

The ~600 LOC of UI / debug / blackboard / road-wear / retry-jitter logic
in the JS source is deliberately omitted; it served the player game and
has no academic-benchmark consumer. The remaining helpers ship as
small synchronous primitives the dimension plugins can compose.
"""

from __future__ import annotations

import math
from typing import Any

from project_utopia.simulation.navigation.a_star import a_star
from project_utopia.simulation.navigation.faction import get_entity_faction
from project_utopia.simulation.navigation.path_cache import PathCache
from project_utopia.world.grid import Grid, tile_to_world, world_to_tile

__all__ = [
    "clear_path",
    "follow_path",
    "has_active_path",
    "set_target_and_path",
]


def clear_path(entity: Any) -> None:
    """Reset the path fields on ``entity``."""
    entity.path = None
    entity.path_index = 0
    entity.path_grid_version = -1
    entity.target_tile = None


def has_active_path(entity: Any, grid: Grid) -> bool:
    """Return ``True`` if ``entity`` is still following a valid path."""
    path = getattr(entity, "path", None)
    idx = int(getattr(entity, "path_index", 0))
    return (
        path is not None
        and idx < len(path)
        and int(getattr(entity, "path_grid_version", -1)) == int(grid.version)
    )


def set_target_and_path(
    entity: Any,
    target_tile: tuple[int, int],
    grid: Grid,
    *,
    path_cache: PathCache | None = None,
    weather_move_cost_multiplier: float = 1.0,
    dynamic_costs: dict[str, Any] | None = None,
    cost_version: int = 0,
) -> bool:
    """Compute (or look up) a path from the entity to ``target_tile``.

    Returns
    -------
    bool
        ``True`` if a path was bound to the entity, ``False`` otherwise.

    Notes
    -----
    Faction is derived from ``entity`` via :func:`get_entity_faction` so
    the same routine handles workers (colony), saboteurs (hostile), and
    herbivores (neutral).
    """
    start_ix, start_iz = world_to_tile(float(entity.x), float(entity.z), grid)
    start = (int(start_ix), int(start_iz))
    goal = (int(target_tile[0]), int(target_tile[1]))
    if start == goal:
        entity.path = [start]
        entity.path_index = 0
        entity.path_grid_version = int(grid.version)
        entity.target_tile = goal
        return True

    faction = get_entity_faction(entity)

    # Cache lookup first — cheapest path to a hit.
    if path_cache is not None:
        cached = path_cache.get(grid.version, start, goal, cost_version, faction)
        if cached is not None:
            entity.path = cached
            entity.path_index = 0
            entity.path_grid_version = int(grid.version)
            entity.target_tile = goal
            return True

    path = a_star(
        grid,
        start,
        goal,
        weather_move_cost_multiplier=weather_move_cost_multiplier,
        dynamic_costs=dynamic_costs,
        options={"faction": faction},
    )
    if path is None:
        clear_path(entity)
        return False

    if path_cache is not None:
        path_cache.set(grid.version, start, goal, cost_version, faction, path)

    entity.path = path
    entity.path_index = 0
    entity.path_grid_version = int(grid.version)
    entity.target_tile = goal
    return True


def follow_path(entity: Any, grid: Grid, dt: float, *, speed: float = 2.5) -> dict[str, Any]:
    """Advance one tick along ``entity.path`` and return the desired velocity.

    The substrate is intentionally agnostic of role/species; pass ``speed``
    from the caller-side (e.g. ``BALANCE.worker_speed``).
    """
    path = getattr(entity, "path", None)
    idx = int(getattr(entity, "path_index", 0))
    if not path or idx >= len(path):
        return {"done": True, "desired": {"x": 0.0, "z": 0.0}}

    tile = path[idx]
    wp_x, wp_z = tile_to_world(int(tile[0]), int(tile[1]), grid)
    dx = wp_x - float(entity.x)
    dz = wp_z - float(entity.z)
    dist = math.hypot(dx, dz)

    if dist < 0.16:
        entity.path_index = idx + 1
        if entity.path_index >= len(path):
            return {"done": True, "desired": {"x": 0.0, "z": 0.0}}

    length = max(dist, 1e-6)
    return {
        "done": False,
        "desired": {
            "x": (dx / length) * speed,
            "z": (dz / length) * speed,
        },
    }
