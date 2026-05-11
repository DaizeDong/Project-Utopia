"""Tests for :mod:`project_utopia.world.grid`."""

from __future__ import annotations

import numpy as np
import pytest
from project_utopia.world.grid import (
    DEFAULT_HEIGHT,
    DEFAULT_WIDTH,
    TILE,
    Grid,
    TilePoint,
    in_bounds,
    manhattan,
    tile_to_world,
    to_index,
    world_to_tile,
)


class TestGridConstruction:
    def test_default_dimensions(self) -> None:
        g = Grid()
        assert g.width == DEFAULT_WIDTH
        assert g.height == DEFAULT_HEIGHT
        assert g.tiles.shape == (DEFAULT_HEIGHT, DEFAULT_WIDTH)
        assert g.tiles.dtype == np.uint8

    def test_seed_is_metadata_only(self) -> None:
        a = Grid(width=10, height=8, seed=0xC0FFEE)
        b = Grid(width=10, height=8, seed=0xC0FFEE)
        # Same dims + same seed + same fill → identical tile arrays.
        assert np.array_equal(a.tiles, b.tiles)
        assert a.seed == b.seed == 0xC0FFEE

    def test_reproducible_construction(self) -> None:
        a = Grid(width=96, height=72, seed=0xC0FFEE)
        b = Grid(width=96, height=72, seed=0xC0FFEE)
        assert np.array_equal(a.tiles, b.tiles)
        # Doubled-check via the canonical fingerprint:
        assert a.serialize_first_n_chars(64) == b.serialize_first_n_chars(64)

    def test_invalid_dims_raises(self) -> None:
        with pytest.raises(ValueError):
            Grid(width=0, height=10)
        with pytest.raises(ValueError):
            Grid(width=10, height=-1)


class TestSetTileVersionBump:
    def test_set_tile_bumps_version(self) -> None:
        g = Grid(width=8, height=6)
        v0 = g.version
        assert g.set_tile(3, 2, TILE["ROAD"]) is True
        assert g.version == v0 + 1

    def test_set_tile_idempotent(self) -> None:
        g = Grid(width=8, height=6, fill=TILE["GRASS"])
        v0 = g.version
        # Writing the same value should NOT bump.
        assert g.set_tile(3, 2, TILE["GRASS"]) is False
        assert g.version == v0

    def test_set_tile_out_of_bounds(self) -> None:
        g = Grid(width=4, height=4)
        v0 = g.version
        assert g.set_tile(-1, 0, TILE["ROAD"]) is False
        assert g.set_tile(0, 100, TILE["ROAD"]) is False
        assert g.version == v0

    def test_set_tile_invokes_callback(self) -> None:
        calls: list[tuple[int, int]] = []

        def cb(_grid: Grid, x: int, z: int) -> None:
            calls.append((x, z))

        g = Grid(width=4, height=4, invalidate_cb=cb)
        g.set_tile(1, 2, TILE["ROAD"])
        g.set_tile(0, 0, TILE["FARM"])
        assert calls == [(1, 2), (0, 0)]


class TestPassability:
    def test_grass_is_passable(self) -> None:
        g = Grid(width=4, height=4, fill=TILE["GRASS"])
        assert g.is_passable(0, 0) is True
        assert g.is_passable(2, 3) is True

    def test_wall_and_water_blocked(self) -> None:
        g = Grid(width=4, height=4)
        g.set_tile(1, 1, TILE["WALL"])
        g.set_tile(2, 2, TILE["WATER"])
        assert g.is_passable(1, 1) is False
        assert g.is_passable(2, 2) is False

    def test_out_of_bounds_blocked(self) -> None:
        g = Grid(width=4, height=4)
        assert g.is_passable(-1, 0) is False
        assert g.is_passable(0, 9) is False


class TestManhattanAndNeighbors:
    def test_manhattan_tuple_inputs(self) -> None:
        assert manhattan((0, 0), (3, 4)) == 7
        assert manhattan((1, 2), (1, 2)) == 0

    def test_manhattan_tilepoint_inputs(self) -> None:
        a = TilePoint(2, 5)
        b = TilePoint(4, 1)
        assert manhattan(a, b) == 6

    def test_neighbors_corner(self) -> None:
        g = Grid(width=4, height=3)
        ns = sorted(g.neighbors(0, 0))
        assert ns == [TilePoint(x=0, z=1), TilePoint(x=1, z=0)]

    def test_neighbors_interior(self) -> None:
        g = Grid(width=5, height=5)
        ns = set(g.neighbors(2, 2))
        assert ns == {
            TilePoint(3, 2),
            TilePoint(1, 2),
            TilePoint(2, 3),
            TilePoint(2, 1),
        }


class TestSerializeFirstNChars:
    def test_all_zeros(self) -> None:
        g = Grid(width=4, height=3, fill=0)
        assert g.serialize_first_n_chars(8) == "00000000"

    def test_deterministic(self) -> None:
        g1 = Grid(width=10, height=8, seed=0xC0FFEE)
        g2 = Grid(width=10, height=8, seed=0xC0FFEE)
        # Stamp a few tiles deterministically.
        for (x, z, t) in [(1, 1, 5), (3, 0, 7), (5, 2, 1)]:
            g1.set_tile(x, z, t)
            g2.set_tile(x, z, t)
        assert g1.serialize_first_n_chars(64) == g2.serialize_first_n_chars(64)

    def test_changes_on_mutation(self) -> None:
        g = Grid(width=4, height=3)
        before = g.serialize_first_n_chars(16)
        g.set_tile(0, 0, TILE["WALL"])
        after = g.serialize_first_n_chars(16)
        assert before != after


class TestFreeFunctionInterop:
    def test_in_bounds_helper(self) -> None:
        g = Grid(width=4, height=4)
        assert in_bounds(0, 0, g) is True
        assert in_bounds(3, 3, g) is True
        assert in_bounds(4, 0, g) is False
        assert in_bounds(0, -1, g) is False

    def test_to_index_helper(self) -> None:
        assert to_index(0, 0, 4) == 0
        assert to_index(1, 0, 4) == 1
        assert to_index(0, 1, 4) == 4
        assert to_index(3, 2, 4) == 11

    def test_world_to_tile_roundtrip(self) -> None:
        g = Grid(width=10, height=10, tile_size=2.0)
        ix, iz = world_to_tile(0.0, 0.0, g)
        assert (ix, iz) == (5, 5)
        wx, wz = tile_to_world(5, 5, g)
        # Tile (5,5) on a 10x10 grid centred at origin maps to (1, 1).
        assert wx == pytest.approx(1.0)
        assert wz == pytest.approx(1.0)


class TestBulkQueries:
    def test_count_tiles_of(self) -> None:
        g = Grid(width=4, height=4, fill=TILE["GRASS"])
        g.set_tile(0, 0, TILE["WALL"])
        g.set_tile(1, 1, TILE["WALL"])
        g.set_tile(2, 2, TILE["WATER"])
        assert g.count_tiles_of(TILE["WALL"]) == 2
        assert g.count_tiles_of(TILE["WATER"]) == 1
        assert g.count_tiles_of(TILE["WALL"], TILE["WATER"]) == 3
        assert g.count_tiles_of() == 0

    def test_find_tiles_of(self) -> None:
        g = Grid(width=4, height=3, fill=TILE["GRASS"])
        g.set_tile(2, 1, TILE["ROAD"])
        g.set_tile(0, 2, TILE["ROAD"])
        tiles = g.find_tiles_of(TILE["ROAD"])
        assert TilePoint(2, 1) in tiles
        assert TilePoint(0, 2) in tiles
        assert len(tiles) == 2
