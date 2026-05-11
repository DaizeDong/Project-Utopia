"""LRU path cache (port of ``src/simulation/navigation/PathCache.js``).

Stores paths keyed by ``(grid_version, cost_version, start, goal, faction)``.
Eviction is least-recently-used via ``collections.OrderedDict``. Tracks
hit / miss counters under ``metrics["path_cache"]`` for the paper E7
benchmark.

Cross-language note: this cache is **not** persisted; it is rebuilt on
each harness run so determinism does not depend on its eviction order.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

__all__ = ["PathCache", "PathCacheKey"]


# A 5-tuple of (faction, grid_version, cost_version, start, goal) where
# start / goal are themselves ``(ix, iz)`` tuples. Frozen, hashable.
PathCacheKey = tuple[str, int, int, tuple[int, int], tuple[int, int]]

_DEFAULT_FACTION = "colony"


class PathCache:
    """LRU-bounded path cache with hit/miss telemetry.

    Parameters
    ----------
    max_entries
        Maximum number of cached paths. Defaults to 800 to match the JS
        ``PathCache`` capacity. Setting this to ``0`` disables caching
        entirely (every ``lookup`` returns ``None``).
    """

    __slots__ = ("max_entries", "_cache", "hits", "misses", "evictions")

    def __init__(self, max_entries: int = 800) -> None:
        self.max_entries: int = max(0, int(max_entries))
        self._cache: OrderedDict[PathCacheKey, list[tuple[int, int]]] = OrderedDict()
        self.hits: int = 0
        self.misses: int = 0
        self.evictions: int = 0

    # ---- key construction -------------------------------------------------

    @staticmethod
    def make_key(
        grid_version: int,
        start: tuple[int, int],
        goal: tuple[int, int],
        cost_version: int = 0,
        faction: str = _DEFAULT_FACTION,
    ) -> PathCacheKey:
        """Build a hashable cache key.

        The argument order matches the JS ``#key`` private method so the
        Python wire-format is stable across the two implementations.
        """
        return (str(faction), int(grid_version), int(cost_version), tuple(start), tuple(goal))

    # ---- core API ---------------------------------------------------------

    def lookup(self, key: PathCacheKey) -> list[tuple[int, int]] | None:
        """Return the cached path for ``key`` (LRU-touched) or ``None``."""
        if self.max_entries == 0:
            self.misses += 1
            return None
        path = self._cache.get(key)
        if path is None:
            self.misses += 1
            return None
        # Move to end → most-recently-used.
        self._cache.move_to_end(key)
        self.hits += 1
        return path

    def record_result(self, key: PathCacheKey, path: list[tuple[int, int]]) -> None:
        """Store ``path`` under ``key``, evicting the LRU entry if needed."""
        if self.max_entries == 0:
            return
        if key in self._cache:
            self._cache.move_to_end(key)
            self._cache[key] = path
            return
        self._cache[key] = path
        while len(self._cache) > self.max_entries:
            self._cache.popitem(last=False)
            self.evictions += 1

    # ---- legacy / convenience ---------------------------------------------

    def get(
        self,
        grid_version: int,
        start: tuple[int, int],
        goal: tuple[int, int],
        cost_version: int = 0,
        faction: str = _DEFAULT_FACTION,
    ) -> list[tuple[int, int]] | None:
        """Convenience wrapper that builds the key and calls :meth:`lookup`."""
        return self.lookup(self.make_key(grid_version, start, goal, cost_version, faction))

    def set(
        self,
        grid_version: int,
        start: tuple[int, int],
        goal: tuple[int, int],
        cost_version: int,
        faction: str,
        path: list[tuple[int, int]],
    ) -> None:
        """Convenience wrapper that builds the key and calls :meth:`record_result`."""
        self.record_result(
            self.make_key(grid_version, start, goal, cost_version, faction), path
        )

    def invalidate_grid_version(self, new_version: int) -> int:
        """Drop every entry whose ``grid_version`` is older than ``new_version``.

        Returns the number of entries dropped. Use this after a terrain
        mutation to make stale paths unreachable.
        """
        new_version = int(new_version)
        stale = [k for k in self._cache if k[1] < new_version]
        for k in stale:
            del self._cache[k]
            self.evictions += 1
        return len(stale)

    def clear(self) -> None:
        """Drop every cached entry (does not reset hit/miss counters)."""
        self._cache.clear()

    # ---- introspection ----------------------------------------------------

    @property
    def size(self) -> int:
        """Number of cached paths currently held."""
        return len(self._cache)

    def metrics(self) -> dict[str, Any]:
        """Return a snapshot of the cache telemetry."""
        total = self.hits + self.misses
        return {
            "hits": self.hits,
            "misses": self.misses,
            "evictions": self.evictions,
            "size": self.size,
            "max_entries": self.max_entries,
            "hit_rate": self.hits / total if total > 0 else 0.0,
        }

    def __contains__(self, key: PathCacheKey) -> bool:  # pragma: no cover
        return key in self._cache

    def __len__(self) -> int:  # pragma: no cover
        return len(self._cache)
