"""Road network connectivity (port of ``src/simulation/navigation/RoadNetwork.js``).

Builds a union-find over road / bridge / warehouse tiles. The network is
lazily rebuilt whenever ``grid.version`` changes so callers can cheaply
ask "are these two warehouses on the same network?" or "is this tile
connected to any warehouse?" without re-running BFS each tick.
"""

from __future__ import annotations

from typing import Iterable

from project_utopia.world.grid import TILE, Grid, in_bounds, to_index

__all__ = ["RoadNetwork", "ROAD_TILES"]

# Tiles considered "carriers" for the road network. Bridges sit on top of
# water but count as roads for connectivity; warehouses act as terminals.
ROAD_TILES: frozenset[int] = frozenset({TILE["ROAD"], TILE["BRIDGE"], TILE["WAREHOUSE"]})

_DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


class _UnionFind:
    """Compact union-find with path compression + union by rank."""

    __slots__ = ("parent", "rank", "size")

    def __init__(self, n: int) -> None:
        self.parent: list[int] = list(range(n))
        self.rank: list[int] = [0] * n
        self.size: list[int] = [1] * n

    def find(self, x: int) -> int:
        # Two-pass path compression matching the JS implementation.
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:
            nxt = self.parent[x]
            self.parent[x] = root
            x = nxt
        return root

    def union(self, a: int, b: int) -> bool:
        ra = self.find(a)
        rb = self.find(b)
        if ra == rb:
            return False
        if self.rank[ra] < self.rank[rb]:
            self.parent[ra] = rb
            self.size[rb] += self.size[ra]
        elif self.rank[ra] > self.rank[rb]:
            self.parent[rb] = ra
            self.size[ra] += self.size[rb]
        else:
            self.parent[rb] = ra
            self.size[ra] += self.size[rb]
            self.rank[ra] += 1
        return True

    def connected(self, a: int, b: int) -> bool:
        return self.find(a) == self.find(b)

    def component_size(self, x: int) -> int:
        return self.size[self.find(x)]


class RoadNetwork:
    """Disjoint-set view of the road / bridge / warehouse graph."""

    __slots__ = (
        "_uf",
        "_grid_version",
        "_road_set",
        "_warehouse_indices",
        "_component_count",
        "_total_road_tiles",
    )

    def __init__(self) -> None:
        self._uf: _UnionFind | None = None
        self._grid_version: int = -1
        self._road_set: set[int] = set()
        self._warehouse_indices: list[int] = []
        self._component_count: int = 0
        self._total_road_tiles: int = 0

    def rebuild(self, grid: Grid) -> None:
        """Recompute the union-find if ``grid.version`` has changed."""
        if self._grid_version == grid.version:
            return
        self._grid_version = grid.version
        width = grid.width
        height = grid.height
        n = width * height
        uf = _UnionFind(n)
        road_set: set[int] = set()
        warehouse_indices: list[int] = []

        tiles_flat = grid.tiles_flat if hasattr(grid, "tiles_flat") else grid.tiles
        for iz in range(height):
            for ix in range(width):
                idx = to_index(ix, iz, width)
                t = int(tiles_flat[idx])
                if t not in ROAD_TILES:
                    continue
                road_set.add(idx)
                if t == TILE["WAREHOUSE"]:
                    warehouse_indices.append(idx)
                for dx, dz in _DIRS:
                    nx, nz = ix + dx, iz + dz
                    if not in_bounds(nx, nz, grid):
                        continue
                    n_idx = to_index(nx, nz, width)
                    if n_idx in road_set:
                        uf.union(idx, n_idx)

        # Sorted iteration → deterministic component count under
        # set-order changes between Python versions.
        roots = {uf.find(idx) for idx in road_set}
        self._uf = uf
        self._road_set = road_set
        self._warehouse_indices = warehouse_indices
        self._component_count = len(roots)
        self._total_road_tiles = len(road_set)

    # ---- queries ----------------------------------------------------------

    def are_connected(
        self,
        ix1: int,
        iz1: int,
        ix2: int,
        iz2: int,
        grid: Grid,
    ) -> bool:
        """Return ``True`` iff both tiles are road-network tiles in the same component."""
        self.rebuild(grid)
        idx1 = to_index(ix1, iz1, grid.width)
        idx2 = to_index(ix2, iz2, grid.width)
        if idx1 not in self._road_set or idx2 not in self._road_set:
            return False
        return self._uf is not None and self._uf.connected(idx1, idx2)

    def connected_warehouse(self, ix: int, iz: int, grid: Grid) -> int:
        """Return the index of any reachable warehouse, or ``-1``."""
        self.rebuild(grid)
        idx = to_index(ix, iz, grid.width)
        if idx not in self._road_set or self._uf is None:
            return -1
        # Sorted for determinism.
        for w_idx in sorted(self._warehouse_indices):
            if self._uf.connected(idx, w_idx):
                return w_idx
        return -1

    def is_adjacent_to_connected_road(self, ix: int, iz: int, grid: Grid) -> bool:
        """Return ``True`` iff a 4-neighbour tile is on a warehouse-reachable road."""
        self.rebuild(grid)
        if self._uf is None:
            return False
        for dx, dz in _DIRS:
            nx, nz = ix + dx, iz + dz
            if not in_bounds(nx, nz, grid):
                continue
            n_idx = to_index(nx, nz, grid.width)
            if n_idx not in self._road_set:
                continue
            for w_idx in self._warehouse_indices:
                if self._uf.connected(n_idx, w_idx):
                    return True
        return False

    def get_component_size(self, ix: int, iz: int, grid: Grid) -> int:
        """Return the size of the road component containing ``(ix, iz)``, or 0."""
        self.rebuild(grid)
        idx = to_index(ix, iz, grid.width)
        if idx not in self._road_set or self._uf is None:
            return 0
        return self._uf.component_size(idx)

    def is_road_tile(self, idx: int) -> bool:
        """Return ``True`` iff the flat index ``idx`` is a road tile."""
        return idx in self._road_set

    @property
    def stats(self) -> dict[str, int]:
        """Diagnostics: total road tiles, component count, warehouse count, version."""
        return {
            "total_road_tiles": self._total_road_tiles,
            "component_count": self._component_count,
            "warehouse_count": len(self._warehouse_indices),
            "grid_version": self._grid_version,
        }

    # ---- iteration helpers -----------------------------------------------

    def warehouses(self) -> Iterable[int]:
        """Yield warehouse flat indices in sorted order (deterministic)."""
        return iter(sorted(self._warehouse_indices))
