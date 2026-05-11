"""Path cache LRU + invalidation tests."""

from __future__ import annotations

import pytest

from project_utopia.simulation.navigation.path_cache import PathCache


@pytest.fixture
def cache() -> PathCache:
    return PathCache(max_entries=4)


def _key(cache: PathCache, gv: int, sx: int, sz: int, gx: int, gz: int) -> tuple:
    return cache.make_key(gv, (sx, sz), (gx, gz), cost_version=0, faction="colony")


def test_miss_on_cold_lookup(cache: PathCache) -> None:
    """Lookup before any insertion → ``None`` and miss counter bumps."""
    assert cache.lookup(_key(cache, 1, 0, 0, 5, 5)) is None
    assert cache.misses == 1
    assert cache.hits == 0


def test_hit_after_insert(cache: PathCache) -> None:
    """A path stored under key X is returned by ``lookup(X)``."""
    k = _key(cache, 1, 0, 0, 3, 3)
    path = [(0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (3, 2), (3, 3)]
    cache.record_result(k, path)
    got = cache.lookup(k)
    assert got is path
    assert cache.hits == 1


def test_grid_version_bump_invalidates(cache: PathCache) -> None:
    """``invalidate_grid_version`` drops stale entries."""
    old = _key(cache, 1, 0, 0, 1, 1)
    cache.record_result(old, [(0, 0), (1, 1)])
    assert cache.lookup(old) is not None
    cache.invalidate_grid_version(2)
    assert cache.lookup(old) is None
    assert cache.evictions == 1


def test_lru_eviction(cache: PathCache) -> None:
    """When inserting beyond ``max_entries``, the oldest entry is evicted."""
    keys = [_key(cache, 1, 0, 0, i, 0) for i in range(6)]
    for k in keys:
        cache.record_result(k, [(0, 0), (1, 1)])
    # max_entries=4 → first two inserts must be evicted.
    assert cache.lookup(keys[0]) is None
    assert cache.lookup(keys[1]) is None
    assert cache.lookup(keys[-1]) is not None
    assert cache.evictions == 2


def test_lru_touch_reorders(cache: PathCache) -> None:
    """Looking up an entry should move it to MRU so eviction passes it over."""
    keys = [_key(cache, 1, 0, 0, i, 0) for i in range(4)]
    for k in keys:
        cache.record_result(k, [(0, 0), (1, 1)])
    # Touch keys[0] — it must now be MRU.
    cache.lookup(keys[0])
    # Insert a 5th key — the LRU (now keys[1]) must be evicted.
    cache.record_result(_key(cache, 1, 0, 0, 99, 0), [(0, 0)])
    assert cache.lookup(keys[0]) is not None
    assert cache.lookup(keys[1]) is None


def test_faction_distinguishes_keys(cache: PathCache) -> None:
    """Same (start, goal) but different faction → different cache entries."""
    colony = cache.make_key(1, (0, 0), (3, 3), 0, "colony")
    hostile = cache.make_key(1, (0, 0), (3, 3), 0, "hostile")
    cache.record_result(colony, [(0, 0)])
    assert cache.lookup(colony) is not None
    assert cache.lookup(hostile) is None


def test_metrics_snapshot(cache: PathCache) -> None:
    """``metrics()`` exposes hit_rate + size + counters for the paper E7 audit."""
    k = _key(cache, 1, 0, 0, 1, 1)
    cache.record_result(k, [(0, 0), (1, 1)])
    cache.lookup(k)
    cache.lookup(_key(cache, 1, 0, 0, 9, 9))  # miss
    m = cache.metrics()
    assert m["hits"] == 1
    assert m["misses"] == 1
    assert m["size"] == 1
    assert 0.4 < m["hit_rate"] < 0.6


def test_max_entries_zero_disables_cache() -> None:
    """``max_entries=0`` → every lookup is a miss."""
    c = PathCache(max_entries=0)
    k = c.make_key(1, (0, 0), (1, 1), 0, "colony")
    c.record_result(k, [(0, 0), (1, 1)])
    assert c.lookup(k) is None
