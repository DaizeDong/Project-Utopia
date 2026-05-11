"""Tests for the trim reachability cache."""

from __future__ import annotations

from project_utopia.simulation.services.reachability_cache import (
    ReachabilityCache,
    get_or_probe_reachability,
)
from project_utopia.world.grid import TILE, Grid


def _make_state(grid_size: int = 8) -> dict:
    grid = Grid(width=grid_size, height=grid_size)
    grid.set_tile(2, 2, TILE["WAREHOUSE"])
    return {"grid": grid, "_reachabilityProbeBudget": 8}


class TestCacheBasics:
    def test_probe_caches_result(self) -> None:
        cache = ReachabilityCache()
        state = _make_state()
        result = cache.probe_and_cache((0, 0), (TILE["WAREHOUSE"],), state)
        assert result is not None
        assert result["reachable"] is True
        assert result["sourceTile"] == (2, 2)

    def test_grid_version_bump_invalidates(self) -> None:
        cache = ReachabilityCache()
        state = _make_state()
        cache.probe_and_cache((0, 0), (TILE["WAREHOUSE"],), state)
        # Mutate grid to bump version.
        state["grid"].set_tile(5, 5, TILE["FARM"])
        # Reset budget so the cache probes again.
        state["_reachabilityProbeBudget"] = 8
        cache.probe_and_cache((0, 0), (TILE["WAREHOUSE"],), state)
        stats = cache.get_stats()
        assert stats["gridInvalidations"] >= 1

    def test_probe_budget_exhaustion(self) -> None:
        cache = ReachabilityCache()
        state = _make_state()
        state["_reachabilityProbeBudget"] = 0
        result = cache.probe_and_cache((0, 0), (TILE["WAREHOUSE"],), state)
        assert result is None
        assert cache.get_stats()["budgetSkips"] >= 1

    def test_get_or_probe_helper(self) -> None:
        cache = ReachabilityCache()
        state = _make_state()
        first = get_or_probe_reachability(cache, (1, 1), (TILE["WAREHOUSE"],), state)
        second = get_or_probe_reachability(cache, (1, 1), (TILE["WAREHOUSE"],), state)
        assert first == second
        # Second call should hit the cache (hits stat ≥ 1).
        assert cache.get_stats()["hits"] >= 1
