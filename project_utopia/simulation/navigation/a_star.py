"""Deterministic A* pathfinding (port of ``src/simulation/navigation/AStar.js``).

Uses ``heapq`` rather than a hand-rolled MinHeap. Ties are broken by a
monotonically-increasing ``insertion_counter`` so the same grid + same
``(start, goal)`` always produces the same path bytes (matching the
Tier 1' determinism contract in
``docs/ai-research/python-migration-conventions.md``).

Public API
----------
- ``a_star(grid, start, goal, *, weather_move_cost_multiplier=1.0,
  dynamic_costs=None, options=None) -> list[tuple[int, int]] | None``

Returns a list of ``(ix, iz)`` tuples from ``start`` to ``goal``
inclusive, or ``None`` if no path exists. ``start == goal`` is a degenerate
case that returns a single-tile path.
"""

from __future__ import annotations

import heapq
from typing import Any

from project_utopia.simulation.navigation.faction import (
    FACTION,
    is_tile_passable_for_faction,
)
from project_utopia.world.grid import (
    MOVE_DIRECTIONS_4,
    TILE_INFO,
    Grid,
    in_bounds,
    to_index,
)

__all__ = ["a_star"]

# Penalty applied to non-road tiles when ``grid.elevation`` is provided.
# Matches ``TERRAIN_MECHANICS.elevationMovePenalty`` from ``balance.js``.
_ELEVATION_MOVE_PENALTY = 0.4

# Default soft cap on expanded nodes — keeps pathological searches from
# locking the harness. Override via ``options={"max_nodes": N}``.
_DEFAULT_MAX_NODES = 100_000


def _heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
    """Manhattan distance (admissible for 4-connected grids)."""
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _reconstruct_path(
    came_from: dict[int, int],
    current_key: int,
    width: int,
) -> list[tuple[int, int]]:
    """Walk ``came_from`` back from goal to start, then reverse."""
    out: list[tuple[int, int]] = []
    cur: int | None = current_key
    while cur is not None and cur >= 0:
        ix = cur % width
        iz = cur // width
        out.append((ix, iz))
        cur = came_from.get(cur)
    out.reverse()
    return out


def _resolve_dynamic_costs(
    dynamic_costs: dict[str, Any] | None,
) -> tuple[set[str] | None, float, dict[str, float] | None, dict[str, float] | None]:
    """Extract the hazard/traffic sub-fields the inner loop needs.

    Mirrors the JS branch on lines 105–123 of ``AStar.js``. Accepts the
    legacy flat shape (``{tiles, penaltyMultiplier}``) as well as the new
    keyed shape (``{hazards: {...}, traffic: {...}}``).
    """
    if not dynamic_costs:
        return None, 1.0, None, None

    hazards = dynamic_costs.get("hazards") if isinstance(dynamic_costs, dict) else None
    traffic = dynamic_costs.get("traffic") if isinstance(dynamic_costs, dict) else None

    # tiles set — prefer the nested form, fall back to flat.
    hazard_tiles: set[str] | None = None
    if isinstance(hazards, dict) and isinstance(hazards.get("tiles"), (set, frozenset)):
        hazard_tiles = set(hazards["tiles"])
    elif isinstance(dynamic_costs.get("tiles"), (set, frozenset)):
        hazard_tiles = set(dynamic_costs["tiles"])

    # multiplier — clamp to ≥1 so penalties never speed travel up.
    if isinstance(hazards, dict) and hazards.get("penaltyMultiplier") is not None:
        hazard_mult = max(1.0, float(hazards.get("penaltyMultiplier", 1.0)))
    else:
        hazard_mult = max(1.0, float(dynamic_costs.get("penaltyMultiplier", 1.0)))

    hazard_by_key: dict[str, float] | None = None
    if isinstance(hazards, dict) and isinstance(hazards.get("penaltyByKey"), dict):
        hazard_by_key = hazards["penaltyByKey"]

    traffic_by_key: dict[str, float] | None = None
    if isinstance(traffic, dict) and isinstance(traffic.get("penaltyByKey"), dict):
        traffic_by_key = traffic["penaltyByKey"]

    return hazard_tiles, hazard_mult, hazard_by_key, traffic_by_key


def a_star(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    *,
    weather_move_cost_multiplier: float = 1.0,
    dynamic_costs: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
) -> list[tuple[int, int]] | None:
    """Run deterministic A* from ``start`` to ``goal``.

    Parameters
    ----------
    grid
        :class:`project_utopia.world.grid.Grid` (or any object exposing
        ``width``, ``height``, ``tiles``, optional ``elevation``).
    start, goal
        ``(ix, iz)`` integer tile tuples.
    weather_move_cost_multiplier
        Multiplier applied to non-road tile costs (rain / storm / etc.).
    dynamic_costs
        Optional ``{"hazards": {...}, "traffic": {...}}`` dict — see
        :func:`_resolve_dynamic_costs`.
    options
        Optional dict with:

        * ``faction`` — one of ``FACTION`` values; default ``"colony"``.
        * ``max_nodes`` — early-stop cap on expanded nodes.
        * ``tie_breaker`` — informational only; ties are always broken by
          insertion counter for determinism.
        * ``occupancy_aware`` — reserved for Phase 2.

    Returns
    -------
    list[tuple[int, int]] | None
        Path (inclusive of both endpoints) or ``None`` if unreachable.
    """
    options = options or {}
    faction = str(options.get("faction", FACTION["COLONY"]))
    max_nodes = int(options.get("max_nodes", _DEFAULT_MAX_NODES))

    width = grid.width
    height = grid.height
    if width <= 0 or height <= 0:
        return None

    start_ix, start_iz = int(start[0]), int(start[1])
    goal_ix, goal_iz = int(goal[0]), int(goal[1])
    if not in_bounds(start_ix, start_iz, grid) or not in_bounds(goal_ix, goal_iz, grid):
        return None

    start_key = to_index(start_ix, start_iz, width)
    goal_key = to_index(goal_ix, goal_iz, width)

    # Degenerate case — single-tile "path" so callers always get a list.
    if start_key == goal_key:
        return [(start_ix, start_iz)]

    hazard_tiles, hazard_mult, hazard_by_key, traffic_by_key = _resolve_dynamic_costs(
        dynamic_costs
    )
    has_hazard_tiles = bool(hazard_tiles)
    has_hazard_by_key = bool(hazard_by_key)
    has_traffic_by_key = bool(traffic_by_key)
    has_dynamic_tile_costs = has_hazard_tiles or has_hazard_by_key or has_traffic_by_key

    # ``grid.tiles`` is 2D ``(height, width)``; substrate code wants a flat
    # row-major view. The ``.tiles_flat`` property avoids a copy.
    tiles = grid.tiles_flat if hasattr(grid, "tiles_flat") else grid.tiles
    elevation = grid.elevation

    g_score: dict[int, float] = {start_key: 0.0}
    came_from: dict[int, int] = {}
    closed: set[int] = set()

    # heapq entries: (f_score, insertion_counter, key)
    # insertion_counter guarantees a total order under floating-point ties
    # so the same input always produces the same expansion order.
    open_heap: list[tuple[float, int, int]] = []
    counter = 0
    heapq.heappush(
        open_heap,
        (_heuristic((start_ix, start_iz), (goal_ix, goal_iz)), counter, start_key),
    )
    counter += 1

    expanded = 0
    while open_heap:
        _, _, current = heapq.heappop(open_heap)
        if current in closed:
            continue
        closed.add(current)
        expanded += 1
        if expanded > max_nodes:
            return None

        if current == goal_key:
            return _reconstruct_path(came_from, current, width)

        cx = current % width
        cz = current // width

        for dx, dz in MOVE_DIRECTIONS_4:
            nx = cx + dx
            nz = cz + dz
            if not in_bounds(nx, nz, grid):
                continue
            n_key = to_index(nx, nz, width)
            if n_key in closed:
                continue
            tile_type = int(tiles[n_key])
            tile_info = TILE_INFO.get(tile_type)
            if tile_info is None or not tile_info["passable"]:
                continue
            if not is_tile_passable_for_faction(tile_type, faction):
                continue

            step_cost = float(tile_info["base_cost"])
            if elevation is not None:
                # Elevation may be 1D (legacy) or 2D ``(height, width)``.
                if elevation.ndim == 2:
                    elev_val = float(elevation[nz, nx])
                else:
                    elev_val = float(elevation[n_key]) if n_key < elevation.size else 0.5
                step_cost += elev_val * _ELEVATION_MOVE_PENALTY
            # Roads ignore weather; non-road tiles slow down.
            if tile_type != 1:  # TILE.ROAD
                step_cost *= float(weather_move_cost_multiplier)

            if has_dynamic_tile_costs:
                key = f"{nx},{nz}"
                if has_hazard_tiles and hazard_tiles is not None and key in hazard_tiles:
                    per_key = (
                        float(hazard_by_key[key]) if hazard_by_key and key in hazard_by_key else hazard_mult
                    )
                    step_cost *= max(1.0, per_key)
                if has_traffic_by_key and traffic_by_key is not None and key in traffic_by_key:
                    step_cost *= max(1.0, float(traffic_by_key[key]))

            tentative = g_score[current] + step_cost
            prior = g_score.get(n_key)
            if prior is None or tentative < prior:
                came_from[n_key] = current
                g_score[n_key] = tentative
                f_score = tentative + abs(nx - goal_ix) + abs(nz - goal_iz)
                heapq.heappush(open_heap, (f_score, counter, n_key))
                counter += 1

    return None
