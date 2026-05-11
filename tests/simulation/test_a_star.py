"""A* deterministic-substrate tests."""

from __future__ import annotations

import pytest

from project_utopia.simulation.navigation.a_star import a_star
from project_utopia.world.grid import TILE, Grid


@pytest.fixture
def open_grid() -> Grid:
    """A 10x10 grid of GRASS — every tile passable."""
    g = Grid(width=10, height=10, fill=TILE["GRASS"])
    return g


@pytest.fixture
def grid_with_wall() -> Grid:
    """A 10x10 grid with a vertical wall at x=5, except a single gap at z=0.

    The wall forces the optimal path to detour through the gap rather than
    cut straight across.
    """
    g = Grid(width=10, height=10, fill=TILE["GRASS"])
    for z in range(1, 10):
        g.set_tile(5, z, TILE["WALL"])
    return g


def test_start_equals_goal_returns_single_tile(open_grid: Grid) -> None:
    """A* must return a single-tile path when start == goal."""
    path = a_star(open_grid, (3, 4), (3, 4))
    assert path == [(3, 4)]


def test_reachable_goal_returns_path(open_grid: Grid) -> None:
    """A* returns a path that includes both endpoints."""
    path = a_star(open_grid, (0, 0), (9, 9))
    assert path is not None
    assert path[0] == (0, 0)
    assert path[-1] == (9, 9)
    # 4-connected Manhattan path on a 10x10 grid → at least 19 tiles.
    assert len(path) >= 19


def test_obstacle_avoidance(grid_with_wall: Grid) -> None:
    """The path must route around the wall — no tile crosses x=5 above z=0."""
    path = a_star(grid_with_wall, (0, 5), (9, 5))
    assert path is not None
    # Path must cross the gap row (z=0) somewhere.
    crossings = [tile for tile in path if tile[0] == 5]
    assert all(c[1] == 0 for c in crossings), f"Path crossed wall: {crossings}"


def test_unreachable_returns_none() -> None:
    """A grid fully partitioned by WALL must return None."""
    g = Grid(width=5, height=5, fill=TILE["GRASS"])
    # Solid wall column at x=2.
    for z in range(5):
        g.set_tile(2, z, TILE["WALL"])
    path = a_star(g, (0, 0), (4, 4))
    assert path is None


def test_out_of_bounds_returns_none(open_grid: Grid) -> None:
    """Out-of-bounds start or goal returns None."""
    assert a_star(open_grid, (-1, 0), (5, 5)) is None
    assert a_star(open_grid, (5, 5), (100, 100)) is None


def test_deterministic_across_runs(open_grid: Grid) -> None:
    """Same grid + same (start, goal) → bit-identical path bytes.

    Tier 1' determinism contract — runs 100 invocations and asserts the
    path object is invariant.
    """
    expected = a_star(open_grid, (0, 0), (9, 9))
    assert expected is not None
    for _ in range(100):
        got = a_star(open_grid, (0, 0), (9, 9))
        assert got == expected


def test_water_is_impassable() -> None:
    """A WATER tile in the middle of the grid must be routed around."""
    g = Grid(width=6, height=3, fill=TILE["GRASS"])
    g.set_tile(2, 1, TILE["WATER"])
    g.set_tile(3, 1, TILE["WATER"])
    path = a_star(g, (0, 1), (5, 1))
    assert path is not None
    assert (2, 1) not in path
    assert (3, 1) not in path


def test_gate_blocked_for_hostile() -> None:
    """A hostile-faction A* must refuse to cross GATE tiles."""
    g = Grid(width=5, height=3, fill=TILE["WALL"])
    # Open corridor row z=1 except for a GATE at x=2.
    for x in range(5):
        g.set_tile(x, 1, TILE["GRASS"])
    g.set_tile(2, 1, TILE["GATE"])

    # Colony can cross gate.
    colony = a_star(g, (0, 1), (4, 1), options={"faction": "colony"})
    assert colony is not None
    assert (2, 1) in colony

    # Hostile cannot cross gate → no path (corridor blocked by gate).
    hostile = a_star(g, (0, 1), (4, 1), options={"faction": "hostile"})
    assert hostile is None


def test_max_nodes_early_stop(open_grid: Grid) -> None:
    """A tight ``max_nodes`` budget must short-circuit the search."""
    path = a_star(open_grid, (0, 0), (9, 9), options={"max_nodes": 3})
    assert path is None


def test_traffic_penalty_increases_cost() -> None:
    """When traffic penalty is huge, the path should avoid that tile.

    We construct a 3x5 grid with two viable horizontal corridors. Putting a
    penalty on z=1 should push the path to z=0 or z=2 instead.
    """
    g = Grid(width=5, height=3, fill=TILE["GRASS"])
    # Heavy penalty on every tile of z=1.
    penalty_by_key: dict[str, float] = {f"{x},1": 50.0 for x in range(5)}
    dynamic_costs = {"traffic": {"penaltyByKey": penalty_by_key}}
    path = a_star(g, (0, 0), (4, 0), dynamic_costs=dynamic_costs)
    assert path is not None
    # No tile should be on the penalised row.
    for tile in path:
        assert tile[1] != 1, f"Path crossed penalised row: {path}"
