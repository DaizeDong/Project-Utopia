"""Tests for the per-worker path-fail blacklist."""

from __future__ import annotations

from project_utopia.simulation.services.path_fail_blacklist import (
    DEFAULT_TTL_SEC,
    PathFailBlacklist,
)


class TestBlacklistMarkAndQuery:
    def test_mark_then_is_blacklisted_within_ttl(self) -> None:
        bl = PathFailBlacklist()
        bl.mark("w1", 3, 4, 2, now_sec=10.0, ttl_sec=DEFAULT_TTL_SEC)
        assert bl.is_blacklisted("w1", 3, 4, 2, now_sec=10.0 + 1.0) is True

    def test_expires_after_ttl(self) -> None:
        bl = PathFailBlacklist()
        bl.mark("w1", 3, 4, 2, now_sec=10.0, ttl_sec=DEFAULT_TTL_SEC)
        # 6s later, ttl=5s → expired.
        assert bl.is_blacklisted("w1", 3, 4, 2, now_sec=16.0) is False

    def test_forget_worker_clears_entries(self) -> None:
        bl = PathFailBlacklist()
        bl.mark("w1", 1, 1, 0, now_sec=0.0)
        bl.forget_worker("w1")
        assert bl.is_blacklisted("w1", 1, 1, 0, now_sec=0.0) is False

    def test_purge_expired_drops_old_entries(self) -> None:
        bl = PathFailBlacklist()
        bl.mark("w1", 1, 1, 0, now_sec=0.0, ttl_sec=2.0)
        bl.purge_expired(now_sec=10.0)
        assert bl.get_stats()["activeEntries"] == 0
