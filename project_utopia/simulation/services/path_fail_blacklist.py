"""Per-worker (ix, iz, tile_type) blacklist (port of ``PathFailBlacklist.js``).

When A* fails for a ``(worker, ix, iz, tile_type)`` tuple, the target
selector marks the tuple blacklisted for ``ttl_sec`` seconds of simulated
time. ``choose_worker_target`` skips blacklisted candidates so a worker
doesn't infinitely re-pick the same tile that just failed to path.
"""

from __future__ import annotations

from typing import Any

__all__ = ["PathFailBlacklist", "DEFAULT_TTL_SEC"]


DEFAULT_TTL_SEC = 5.0


def _make_key(ix: int, iz: int, tile_type: int) -> str:
    return f"{int(tile_type)}|{int(ix)},{int(iz)}"


class PathFailBlacklist:
    """Map ``worker_id → {key → expires_at_sec}``."""

    def __init__(self) -> None:
        self._by_worker: dict[str, dict[str, float]] = {}
        self._stats: dict[str, Any] = {
            "totalMarks": 0,
            "hitsThisTick": 0,
            "lastPurgedTick": -1,
            "activeEntries": 0,
        }

    def mark(
        self,
        worker_id: str | int | None,
        ix: int,
        iz: int,
        tile_type: int,
        now_sec: float,
        ttl_sec: float = DEFAULT_TTL_SEC,
    ) -> None:
        if worker_id is None:
            return
        wid = str(worker_id)
        inner = self._by_worker.setdefault(wid, {})
        key = _make_key(ix, iz, tile_type)
        inner[key] = float(now_sec) + float(ttl_sec)
        self._stats["totalMarks"] = int(self._stats["totalMarks"]) + 1

    def is_blacklisted(
        self,
        worker_id: str | int | None,
        ix: int,
        iz: int,
        tile_type: int,
        now_sec: float,
    ) -> bool:
        if worker_id is None:
            return False
        inner = self._by_worker.get(str(worker_id))
        if not inner:
            return False
        key = _make_key(ix, iz, tile_type)
        expires_at = inner.get(key)
        if expires_at is None:
            return False
        if float(now_sec) >= float(expires_at):
            # Lazy expiry on read.
            inner.pop(key, None)
            if not inner:
                self._by_worker.pop(str(worker_id), None)
            return False
        self._stats["hitsThisTick"] = int(self._stats["hitsThisTick"]) + 1
        return True

    def purge_expired(self, now_sec: float) -> None:
        cutoff = float(now_sec)
        # Iterate over a copy of items so we can delete during traversal.
        for worker_id, inner in list(self._by_worker.items()):
            expired = [k for k, exp in inner.items() if float(exp) <= cutoff]
            for k in expired:
                inner.pop(k, None)
            if not inner:
                self._by_worker.pop(worker_id, None)
        active = sum(len(inner) for inner in self._by_worker.values())
        self._stats["activeEntries"] = active
        self._stats["lastPurgedTick"] = int(self._stats["lastPurgedTick"]) + 1
        self._stats["hitsThisTick"] = 0

    def forget_worker(self, worker_id: str | int | None) -> None:
        if worker_id is None:
            return
        self._by_worker.pop(str(worker_id), None)

    def get_stats(self) -> dict[str, Any]:
        active = sum(len(inner) for inner in self._by_worker.values())
        return {
            "activeEntries": active,
            "totalMarks": int(self._stats["totalMarks"]),
            "hitsThisTick": int(self._stats["hitsThisTick"]),
            "workersTracked": len(self._by_worker),
        }
