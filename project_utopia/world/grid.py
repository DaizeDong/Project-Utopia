"""Versioned tile grid (port of ``src/world/grid/Grid.js``).

The JavaScript source stores tiles as a flat ``Uint8Array`` and treats the
``grid`` object as a struct read/written by free functions. The Python port
collapses that into a single :class:`Grid` class so the public API is
``grid.set_tile(x, z, tile_id)`` rather than ``setTile(grid, x, z, t)``,
while keeping free-function helpers (``to_index``, ``in_bounds``,
``world_to_tile``, ``tile_to_world``) for the navigation substrate.

Design choices versus the JS source
-----------------------------------
* Tiles live in a ``numpy.ndarray(dtype=uint8, shape=(height, width))``
  rather than a Python list, both for determinism (numpy ops are bit-stable
  on a single architecture) and for speed.
* The ``version`` integer is incremented on every successful
  :meth:`set_tile` call. Path-cache invalidation is expressed as a
  callback hook (``invalidate_cb``) which any subsystem may register at
  construction.
* The ``cost_overlay`` 2D ``float32`` array lets A* read per-tile move-cost
  multipliers without consulting :data:`TILE_INFO` on every query (weather
  systems write into this overlay).
* No procedural map generator is included here — the rich Perlin-style
  generator from ``Grid.js`` is left to :mod:`project_utopia.world.scenarios`
  (and is intentionally simplified, since the academic benchmark uses six
  scenario blueprints rather than freely generated maps).

Tile coordinates follow the JS convention ``(x, z)`` (NumPy storage shape
is ``(height, width)`` so ``tiles[z, x]`` matches ``tiles[ix + iz*width]``
indexing 1:1).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterator
from types import MappingProxyType
from typing import Any, NamedTuple

import numpy as np

__all__ = [
    "DEFAULT_HEIGHT",
    "DEFAULT_TILE_SIZE",
    "DEFAULT_WIDTH",
    "MOVE_DIRECTIONS_4",
    "TILE",
    "TILE_INFO",
    "Grid",
    "TilePoint",
    "in_bounds",
    "manhattan",
    "tile_to_world",
    "to_index",
    "world_to_tile",
]

# ---- tile-id namespace ------------------------------------------------------

# Mirror of ``src/config/constants.js#TILE`` — kept here rather than in
# ``project_utopia/config/constants.py`` to keep the world subpackage
# importable without pulling the (yet-to-be-ported) constants module.
#
# Round-1 simplification: dropped HERB_GARDEN / KITCHEN / SMITHY / CLINIC /
# GATE. BRIDGE renumbered 13 → 9. Numbering kept in sync with
# ``project_utopia/config/constants.py#TILE``.
TILE: MappingProxyType[str, int] = MappingProxyType(
    {
        "GRASS": 0,
        "ROAD": 1,
        "FARM": 2,
        "LUMBER": 3,
        "WAREHOUSE": 4,
        "WALL": 5,
        "RUINS": 6,
        "WATER": 7,
        "QUARRY": 8,
        "BRIDGE": 9,
    }
)


# Per-tile movement metadata. ``passable=False`` shorts the A* neighbour
# loop; ``base_cost`` becomes the multiplier on the A* step.
TILE_INFO: MappingProxyType[int, MappingProxyType[str, Any]] = MappingProxyType(
    {
        TILE["GRASS"]: MappingProxyType({"passable": True, "base_cost": 1.0}),
        TILE["ROAD"]: MappingProxyType({"passable": True, "base_cost": 0.65}),
        TILE["FARM"]: MappingProxyType({"passable": True, "base_cost": 1.0}),
        TILE["LUMBER"]: MappingProxyType({"passable": True, "base_cost": 1.0}),
        TILE["WAREHOUSE"]: MappingProxyType({"passable": True, "base_cost": 1.0}),
        TILE["WALL"]: MappingProxyType({"passable": False, "base_cost": 1000.0}),
        TILE["RUINS"]: MappingProxyType({"passable": True, "base_cost": 1.6}),
        TILE["WATER"]: MappingProxyType({"passable": False, "base_cost": 1000.0}),
        TILE["QUARRY"]: MappingProxyType({"passable": True, "base_cost": 1.2}),
        TILE["BRIDGE"]: MappingProxyType({"passable": True, "base_cost": 0.65}),
    }
)

# 4-connected Manhattan neighbourhood. Tuples of ``(dx, dz)``.
MOVE_DIRECTIONS_4: tuple[tuple[int, int], ...] = (
    (1, 0),
    (-1, 0),
    (0, 1),
    (0, -1),
)

# Default grid dimensions matching ``src/config/constants.js#DEFAULT_GRID``.
DEFAULT_WIDTH = 96
DEFAULT_HEIGHT = 72
DEFAULT_TILE_SIZE = 2.0


class TilePoint(NamedTuple):
    """Integer tile coordinate in the grid's (x, z) plane."""

    x: int
    z: int


def manhattan(
    a: tuple[int, int] | TilePoint, b: tuple[int, int] | TilePoint
) -> int:
    """Return the L1 (Manhattan) distance between two tile coords.

    Examples
    --------
    >>> manhattan((0, 0), (3, 4))
    7
    """
    ax, az = a
    bx, bz = b
    return abs(int(ax) - int(bx)) + abs(int(az) - int(bz))


# ----------------------------------------------------------------------------
# Free functions kept compatible with substrate code (navigation, boids).
# ----------------------------------------------------------------------------

def in_bounds(ix: int, iz: int, grid: Grid) -> bool:
    """Return ``True`` if ``(ix, iz)`` lies inside ``grid``."""
    return 0 <= int(ix) < grid.width and 0 <= int(iz) < grid.height


def to_index(ix: int, iz: int, width: int) -> int:
    """Flatten a 2D tile coordinate to a 1D row-major array index."""
    return int(ix) + int(iz) * int(width)


def world_to_tile(x: float, z: float, grid: Grid) -> tuple[int, int]:
    """Convert a world ``(x, z)`` to integer tile coordinates ``(ix, iz)``.

    The world origin sits at the grid centre, so a 96x72 grid with
    ``tile_size=2`` spans ``[-96, 96]`` × ``[-72, 72]``.
    """
    ts = grid.tile_size
    ix = math.floor(x / ts + grid.width / 2)
    iz = math.floor(z / ts + grid.height / 2)
    return ix, iz


def tile_to_world(ix: int, iz: int, grid: Grid) -> tuple[float, float]:
    """Inverse of :func:`world_to_tile`: tile centre in world coords."""
    ts = grid.tile_size
    x = (int(ix) - grid.width / 2 + 0.5) * ts
    z = (int(iz) - grid.height / 2 + 0.5) * ts
    return x, z


# ----------------------------------------------------------------------------
# Grid class
# ----------------------------------------------------------------------------

InvalidateCallback = Callable[["Grid", int, int], None]


class Grid:
    """Versioned tile grid backed by NumPy.

    Parameters
    ----------
    width, height
        Tile dimensions. Both must be ``>= 1``.
    seed
        Deterministic seed used for any future procedural generation
        (currently retained as metadata so two ``Grid(...)`` constructions
        with the same seed compare equal in snapshot tests). The JS
        ``pickBootSeed`` URL/localStorage injection pattern is intentionally
        absent — the academic harness always passes an explicit integer.
    fill
        Initial tile id (defaults to ``TILE["GRASS"]``).
    invalidate_cb
        Optional callback ``fn(grid, x, z)`` invoked after each tile
        mutation. PathCache (subagent A) registers via this hook so version
        bumps and invalidations are co-located.
    tile_size
        World-units per tile, used by :func:`world_to_tile`.

    Notes
    -----
    The 2D ``tiles`` array uses ``shape=(height, width)`` so ``tiles[z, x]``
    matches the JS row-major ``tiles[ix + iz*width]`` indexing 1:1. A flat
    1D view is exposed as :attr:`tiles_flat` for substrate code that
    expects a single-axis array.
    """

    __slots__ = (
        "_invalidate_cbs",
        "_version",
        "cost_overlay",
        "elevation",
        "height",
        "moisture",
        "seed",
        "template_id",
        "tile_size",
        "tile_state",
        "tiles",
        "width",
    )

    def __init__(
        self,
        width: int = DEFAULT_WIDTH,
        height: int = DEFAULT_HEIGHT,
        *,
        seed: int = 1337,
        fill: int = 0,
        invalidate_cb: InvalidateCallback | None = None,
        tile_size: float = DEFAULT_TILE_SIZE,
        template_id: str | None = None,
    ) -> None:
        if width < 1 or height < 1:
            raise ValueError(
                f"Grid dims must be >= 1, got width={width} height={height}"
            )

        self.width: int = int(width)
        self.height: int = int(height)
        self.seed: int = int(seed)
        self.tile_size: float = float(tile_size)
        # ``shape=(height, width)`` so ``tiles[z, x]`` matches the JS
        # row-major ``tiles[ix + iz * width]`` indexing.
        self.tiles: np.ndarray = np.full(
            (self.height, self.width), int(fill) & 0xFF, dtype=np.uint8
        )
        self.cost_overlay: np.ndarray = np.ones(
            (self.height, self.width), dtype=np.float32
        )
        self.tile_state: dict[int, dict[str, float]] = {}
        self.elevation: np.ndarray | None = None
        self.moisture: np.ndarray | None = None
        self.template_id: str | None = template_id
        self._version: int = 1
        self._invalidate_cbs: list[InvalidateCallback] = []
        if invalidate_cb is not None:
            self._invalidate_cbs.append(invalidate_cb)

    # ---- versioning ----------------------------------------------------

    @property
    def version(self) -> int:
        """Monotonic version counter — bumped on every tile mutation."""
        return self._version

    def bump_version(self) -> int:
        """Manually bump the version (for bulk edits that bypass set_tile).

        Returns the new version. Use sparingly — the canonical path is
        :meth:`set_tile`.
        """
        self._version += 1
        return self._version

    def register_invalidate_callback(self, cb: InvalidateCallback) -> None:
        """Register a callback fired after every tile mutation.

        Subsystems use this to invalidate caches (e.g. PathCache) without
        polling the version counter.
        """
        self._invalidate_cbs.append(cb)

    def _notify(self, x: int, z: int) -> None:
        for cb in self._invalidate_cbs:
            cb(self, x, z)

    # ---- basic queries ------------------------------------------------

    def in_bounds(self, x: int, z: int) -> bool:
        """Return ``True`` if ``(x, z)`` is inside the grid."""
        return 0 <= int(x) < self.width and 0 <= int(z) < self.height

    def get_tile(self, x: int, z: int) -> int:
        """Return the tile id at ``(x, z)``.

        Out-of-bounds reads return ``TILE["WALL"]`` (impassable sentinel)
        to mirror the JS behaviour.
        """
        ix = int(x)
        iz = int(z)
        if not (0 <= ix < self.width and 0 <= iz < self.height):
            return TILE["WALL"]
        return int(self.tiles[iz, ix])

    def set_tile(self, x: int, z: int, tile_id: int) -> bool:
        """Write ``tile_id`` at ``(x, z)``.

        Returns
        -------
        bool
            ``True`` if the tile actually changed (in which case the
            version counter is incremented and callbacks fire).
        """
        ix = int(x)
        iz = int(z)
        new_id = int(tile_id) & 0xFF
        if not (0 <= ix < self.width and 0 <= iz < self.height):
            return False
        if int(self.tiles[iz, ix]) == new_id:
            return False
        self.tiles[iz, ix] = new_id
        self._version += 1
        self._notify(ix, iz)
        return True

    def is_passable(self, x: int, z: int, faction: str | None = None) -> bool:
        """Return ``True`` if a unit may stand on ``(x, z)``.

        Parameters
        ----------
        faction
            Reserved for future faction-aware passability rules; not
            consulted in the current tile palette (Round-1 simplification
            removed the only faction-gated tile, ``GATE``).
        """
        tile_id = self.get_tile(x, z)
        info = TILE_INFO.get(tile_id)
        if info is None:
            return False
        _ = faction
        return bool(info["passable"])

    # ---- geometry helpers ---------------------------------------------

    @property
    def tiles_flat(self) -> np.ndarray:
        """Flat 1D view of :attr:`tiles` (row-major), suitable for AStar."""
        return self.tiles.reshape(-1)

    def index(self, x: int, z: int) -> int:
        """Flatten a 2D tile coord to a 1D row-major index."""
        return int(x) + int(z) * self.width

    @staticmethod
    def manhattan(
        a: tuple[int, int] | TilePoint, b: tuple[int, int] | TilePoint
    ) -> int:
        """Return the L1 distance between two tile coords."""
        return manhattan(a, b)

    def neighbors(self, x: int, z: int) -> Iterator[TilePoint]:
        """Yield the up-to-4 in-bounds 4-connected neighbours of ``(x, z)``.

        Examples
        --------
        >>> g = Grid(width=4, height=3)
        >>> sorted(g.neighbors(0, 0))
        [TilePoint(x=0, z=1), TilePoint(x=1, z=0)]
        """
        ix = int(x)
        iz = int(z)
        for dx, dz in MOVE_DIRECTIONS_4:
            nx = ix + dx
            nz = iz + dz
            if 0 <= nx < self.width and 0 <= nz < self.height:
                yield TilePoint(nx, nz)

    def world_to_tile(self, wx: float, wz: float) -> TilePoint:
        """Map a world-space coordinate to integer tile indices."""
        ix, iz = world_to_tile(wx, wz, self)
        return TilePoint(ix, iz)

    def tile_to_world(self, x: int, z: int) -> tuple[float, float]:
        """Map tile indices to the centre of the corresponding world tile."""
        return tile_to_world(int(x), int(z), self)

    # ---- bulk queries -------------------------------------------------

    def count_tiles_of(self, *tile_ids: int) -> int:
        """Return how many cells match any of the given tile ids."""
        if not tile_ids:
            return 0
        mask = np.zeros_like(self.tiles, dtype=bool)
        for tid in tile_ids:
            mask |= self.tiles == (int(tid) & 0xFF)
        return int(np.count_nonzero(mask))

    def find_tiles_of(self, *tile_ids: int) -> list[TilePoint]:
        """Return every (x, z) tile matching any of the given ids.

        Returned in row-major (z then x) order for stable iteration.
        """
        if not tile_ids:
            return []
        mask = np.zeros_like(self.tiles, dtype=bool)
        for tid in tile_ids:
            mask |= self.tiles == (int(tid) & 0xFF)
        zs, xs = np.where(mask)
        return [
            TilePoint(int(x), int(z)) for z, x in zip(zs.tolist(), xs.tolist())
        ]

    # ---- determinism / hashing ----------------------------------------

    def serialize_first_n_chars(self, n: int = 256) -> str:
        """Return a deterministic string of the first ``n`` chars of tile ids.

        Used by the determinism audit to fingerprint a grid in one line.
        The output is up to ``n`` characters of ``"%02x"``-encoded tile ids
        in row-major order.

        Examples
        --------
        >>> g = Grid(width=4, height=3, fill=0)
        >>> g.serialize_first_n_chars(8)
        '00000000'
        """
        flat = self.tiles.reshape(-1)
        total = int(flat.shape[0])
        max_chars = max(0, min(int(n), total * 2))
        if max_chars == 0:
            return ""
        tiles_needed = (max_chars + 1) // 2
        tiles_needed = min(tiles_needed, total)
        hex_str = bytes(flat[:tiles_needed].tolist()).hex()
        return hex_str[:max_chars]

    # ---- diagnostics --------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return (
            f"Grid(width={self.width}, height={self.height}, "
            f"seed={self.seed}, version={self._version})"
        )
