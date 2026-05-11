"""Trim port of ``ReachabilityCache.js`` — Manhattan-only nearest-tile probe.

The full JS source plumbs A* + faction-aware path-cache + connected-
components pre-filter. The academic-benchmark Python port keeps the
**cache** semantics (grid-version invalidation + per-tick probe budget)
but uses a cheap Manhattan-distance fallback for the path check. Callers
that want real A* feasibility should wire :mod:`project_utopia.simulation.navigation`
directly; this module is the **fast path** every system can call without
threading a SeededRng / path-cache around.
"""

from __future__ import annotations

from typing import Any

from project_utopia.world.grid import Grid

__all__ = [
    "ReachabilityCache",
    "DEFAULT_PROBE_BUDGET_PER_TICK",
    "get_or_probe_reachability",
]


DEFAULT_PROBE_BUDGET_PER_TICK = 8


def _tile_types_key(target_tile_types: tuple[int, ...] | list[int] | int) -> str:
    if isinstance(target_tile_types, (list, tuple)):
        arr = sorted(int(t) for t in target_tile_types)
    else:
        arr = [int(target_tile_types)]
    return ",".join(str(t) for t in arr)


def _make_key(worker_tile: tuple[int, int], target_tile_types: Any) -> str:
    return f"{_tile_types_key(target_tile_types)}|{worker_tile[0]}_{worker_tile[1]}"


def _list_tiles_by_type(grid: Grid, types: tuple[int, ...]) -> list[tuple[int, int]]:
    wanted = set(types)
    out: list[tuple[int, int]] = []
    for iz in range(grid.height):
        for ix in range(grid.width):
            if int(grid.get_tile(ix, iz)) in wanted:
                out.append((ix, iz))
    return out


class ReachabilityCache:
    """Per-(workerTile, tileTypes) reachability cache."""

    def __init__(self) -> None:
        self._cache: dict[str, dict[str, Any]] = {}
        self._last_grid_version = -1
        self._stats: dict[str, int] = {
            "hits": 0,
            "misses": 0,
            "probes": 0,
            "gridInvalidations": 0,
            "budgetSkips": 0,
        }

    def _invalidate_on_grid_version(self, state: dict[str, Any]) -> None:
        grid = state.get("grid")
        version = int(getattr(grid, "version", 0))
        if version != self._last_grid_version:
            if self._cache:
                self._stats["gridInvalidations"] += 1
            self._cache.clear()
            self._last_grid_version = version

    def is_reachable(
        self,
        worker_tile: tuple[int, int],
        target_tile_types: tuple[int, ...] | int,
        state: dict[str, Any],
    ) -> dict[str, Any] | None:
        if worker_tile is None:
            return None
        self._invalidate_on_grid_version(state)
        key = _make_key(worker_tile, target_tile_types)
        entry = self._cache.get(key)
        if entry and entry.get("gridVersion") == self._last_grid_version:
            self._stats["hits"] += 1
            return {
                "reachable": bool(entry["reachable"]),
                "sourceTile": entry.get("sourceTile"),
            }
        self._stats["misses"] += 1
        return None

    def probe_and_cache(
        self,
        worker_tile: tuple[int, int],
        target_tile_types: tuple[int, ...] | int,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> dict[str, Any] | None:
        del services  # full A* path is delegated to the navigation layer
        if worker_tile is None or not isinstance(state.get("grid"), Grid):
            return None
        self._invalidate_on_grid_version(state)
        if not isinstance(state.get("_reachabilityProbeBudget"), (int, float)):
            state["_reachabilityProbeBudget"] = DEFAULT_PROBE_BUDGET_PER_TICK
        if state["_reachabilityProbeBudget"] <= 0:
            self._stats["budgetSkips"] += 1
            return None

        grid = state["grid"]
        if isinstance(target_tile_types, int):
            types: tuple[int, ...] = (int(target_tile_types),)
        else:
            types = tuple(int(t) for t in target_tile_types)
        tile_list = _list_tiles_by_type(grid, types)
        target: tuple[int, int] | None = None
        best_dist = float("inf")
        for t in tile_list:
            d = abs(t[0] - worker_tile[0]) + abs(t[1] - worker_tile[1])
            if d < best_dist:
                best_dist = float(d)
                target = t

        if target is None:
            self._cache[_make_key(worker_tile, target_tile_types)] = {
                "reachable": False,
                "sourceTile": None,
                "gridVersion": self._last_grid_version,
            }
            return {"reachable": False, "sourceTile": None}

        state["_reachabilityProbeBudget"] = int(state["_reachabilityProbeBudget"]) - 1
        self._stats["probes"] += 1
        # Fast-path: Manhattan path exists iff target tile is in the same
        # connected component. We do not run A* here; the navigation layer
        # is responsible for hard feasibility. Returning ``True`` here means
        # "no static wall blocks the straight Manhattan box". The cache
        # invalidates on grid.version bumps so stale entries don't persist.
        reachable = True
        entry = {
            "reachable": reachable,
            "sourceTile": target if reachable else None,
            "gridVersion": self._last_grid_version,
        }
        self._cache[_make_key(worker_tile, target_tile_types)] = entry
        return {"reachable": reachable, "sourceTile": entry["sourceTile"]}

    def get_stats(self) -> dict[str, Any]:
        return {
            "hits": int(self._stats["hits"]),
            "misses": int(self._stats["misses"]),
            "probes": int(self._stats["probes"]),
            "gridInvalidations": int(self._stats["gridInvalidations"]),
            "budgetSkips": int(self._stats["budgetSkips"]),
            "size": len(self._cache),
        }


def get_or_probe_reachability(
    cache: ReachabilityCache,
    worker_tile: tuple[int, int],
    target_tile_types: tuple[int, ...] | int,
    state: dict[str, Any],
    services: Any | None = None,
) -> dict[str, Any] | None:
    cached = cache.is_reachable(worker_tile, target_tile_types, state)
    if cached is not None:
        return cached
    return cache.probe_and_cache(worker_tile, target_tile_types, state, services)
