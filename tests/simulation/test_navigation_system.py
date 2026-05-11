"""End-to-end navigation glue test."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from project_utopia.simulation.navigation.navigation_system import (
    clear_path,
    follow_path,
    has_active_path,
    set_target_and_path,
)
from project_utopia.simulation.navigation.path_cache import PathCache
from project_utopia.simulation.navigation.road_network import RoadNetwork
from project_utopia.world.grid import TILE, Grid


@dataclass
class _Walker:
    """Minimal entity exposing the navigation-system contract."""

    id: str = "w1"
    x: float = 0.0
    z: float = 0.0
    type: str = "WORKER"
    kind: str = ""
    path: Any = None
    path_index: int = 0
    path_grid_version: int = -1
    target_tile: Any = None
    desired_vel: dict[str, float] = field(default_factory=lambda: {"x": 0.0, "z": 0.0})


@pytest.fixture
def grid() -> Grid:
    return Grid(width=10, height=10, fill=TILE["GRASS"], tile_size=2.0)


def test_set_target_and_path_binds_path(grid: Grid) -> None:
    """A reachable target binds a path to the entity."""
    walker = _Walker(x=-9.0, z=-9.0)  # roughly tile (0, 0)
    cache = PathCache()
    ok = set_target_and_path(walker, (5, 5), grid, path_cache=cache)
    assert ok
    assert walker.path is not None
    assert walker.path[-1] == (5, 5)
    assert walker.path_grid_version == grid.version
    assert has_active_path(walker, grid)


def test_path_cache_hit_on_repeat(grid: Grid) -> None:
    """Calling ``set_target_and_path`` twice should produce a cache hit."""
    walker = _Walker(x=-9.0, z=-9.0)
    cache = PathCache()
    set_target_and_path(walker, (5, 5), grid, path_cache=cache)
    cache_misses_after_first = cache.misses

    walker.path = None
    walker.path_index = 0
    walker.target_tile = None
    set_target_and_path(walker, (5, 5), grid, path_cache=cache)
    # The second call must be served from cache → exactly one extra hit.
    assert cache.hits == 1
    assert cache.misses == cache_misses_after_first


def test_clear_path_resets_fields() -> None:
    """``clear_path`` zeroes every path-related field."""
    walker = _Walker()
    walker.path = [(0, 0), (1, 0)]
    walker.path_index = 1
    walker.path_grid_version = 99
    walker.target_tile = (1, 0)
    clear_path(walker)
    assert walker.path is None
    assert walker.path_index == 0
    assert walker.path_grid_version == -1
    assert walker.target_tile is None


def test_follow_path_advances(grid: Grid) -> None:
    """``follow_path`` returns a non-zero desired velocity when the path is fresh."""
    walker = _Walker(x=-9.0, z=-9.0)
    set_target_and_path(walker, (5, 5), grid, path_cache=PathCache())
    res = follow_path(walker, grid, dt=0.05)
    # Either still walking (desired != 0) or already at next waypoint.
    assert res["done"] is False or res["desired"]["x"] != 0


def test_road_network_rebuilds_after_grid_change() -> None:
    """RoadNetwork.stats updates when ``grid.version`` bumps."""
    g = Grid(width=5, height=5, fill=TILE["GRASS"])
    g.set_tile(1, 1, TILE["ROAD"])
    g.set_tile(2, 1, TILE["ROAD"])
    g.set_tile(3, 1, TILE["WAREHOUSE"])
    net = RoadNetwork()
    net.rebuild(g)
    assert net.stats["total_road_tiles"] == 3
    assert net.stats["warehouse_count"] == 1
    # All three tiles are part of the same connected component.
    assert net.are_connected(1, 1, 3, 1, g)
    # Adding another road segment should bump version + rebuild.
    g.set_tile(0, 1, TILE["ROAD"])
    net.rebuild(g)
    assert net.stats["total_road_tiles"] == 4
    assert net.are_connected(0, 1, 3, 1, g)
