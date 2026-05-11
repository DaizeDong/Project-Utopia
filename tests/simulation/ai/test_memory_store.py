"""Tests for project_utopia.simulation.ai.memory.memory_store."""

from __future__ import annotations

import pytest

from project_utopia.simulation.ai.memory.memory_store import (
    DEFAULT_CAPACITY,
    MemoryEntry,
    MemoryStore,
)


class TestRingBuffer:
    def test_size_grows_until_capacity(self) -> None:
        store = MemoryStore(capacity=5)
        for i in range(5):
            store.insert(f"entry {i}", importance=0.5, sim_sec=float(i))
        assert store.size == 5

    def test_eviction_caps_size_to_capacity(self) -> None:
        store = MemoryStore(capacity=5)
        for i in range(20):
            store.insert(f"entry {i}", importance=0.5, sim_sec=float(i))
        # All 20 inserts are non-anchor → cap at 5.
        assert store.size == 5


class TestImportanceAwareEviction:
    def test_low_importance_evicted_before_high(self) -> None:
        store = MemoryStore(capacity=3)
        store.insert("low-1", importance=0.1, sim_sec=10.0)
        store.insert("high", importance=0.95, sim_sec=11.0)
        store.insert("low-2", importance=0.1, sim_sec=12.0)
        # Insert one more — a low-importance entry should be evicted.
        store.insert("low-3", importance=0.1, sim_sec=13.0)
        contents = {e.content for e in store.entries}
        assert "high" in contents
        assert store.size == 3

    def test_age_decay_favours_recent_entries(self) -> None:
        store = MemoryStore(capacity=2, age_decay=0.01)
        store.insert("old-but-important", importance=0.6, sim_sec=0.0)
        store.insert("recent", importance=0.5, sim_sec=1000.0)
        # Insert a third entry: the old one's effective score after decay
        # (0.6 - 0.01 * 1000 = -9.4) is far worse than the recent's 0.5.
        store.insert("new", importance=0.4, sim_sec=1001.0)
        contents = {e.content for e in store.entries}
        assert "old-but-important" not in contents


class TestAnchorImmunity:
    def test_anchor_survives_routine_inserts(self) -> None:
        store = MemoryStore(capacity=50)
        store.insert(
            "long-horizon-anchor", importance=0.9, sim_sec=0.0, anchor=True
        )
        for i in range(1000):
            store.insert(f"noise {i}", importance=0.1, sim_sec=float(i + 1))
        anchors = [e for e in store.entries if e.anchor]
        assert len(anchors) == 1
        assert anchors[0].content == "long-horizon-anchor"

    def test_multiple_anchors_immune(self) -> None:
        store = MemoryStore(capacity=10)
        for i in range(3):
            store.insert(f"anchor-{i}", importance=0.8, sim_sec=float(i), anchor=True)
        for i in range(500):
            store.insert(f"noise-{i}", importance=0.2, sim_sec=float(100 + i))
        anchors = [e for e in store.entries if e.anchor]
        assert len(anchors) == 3
        non_anchor = [e for e in store.entries if not e.anchor]
        assert len(non_anchor) <= store.capacity


class TestFormatForPrompt:
    def test_returns_empty_string_when_no_entries(self) -> None:
        store = MemoryStore()
        assert store.format_for_prompt() == ""

    def test_sorts_by_recency_times_importance(self) -> None:
        store = MemoryStore(capacity=10)
        store.insert("old-important", importance=0.9, sim_sec=0.0)
        store.insert("new-low", importance=0.3, sim_sec=1000.0)
        # current_sim_sec=1000 → "new-low" should win on recency
        formatted = store.format_for_prompt(limit=1, current_sim_sec=1000.0)
        assert "new-low" in formatted
        assert "old-important" not in formatted

    def test_limit_bounds_output(self) -> None:
        store = MemoryStore(capacity=20)
        for i in range(10):
            store.insert(f"entry-{i}", importance=0.5, sim_sec=float(i))
        formatted = store.format_for_prompt(limit=3, current_sim_sec=10.0)
        assert formatted.count("\n") == 2  # 3 lines → 2 newlines

    def test_includes_anchor_marker(self) -> None:
        store = MemoryStore(capacity=10)
        store.insert("anchor-1", importance=0.5, sim_sec=0.0, anchor=True)
        formatted = store.format_for_prompt(limit=1, current_sim_sec=1.0)
        assert "anchor" in formatted


class TestSerialization:
    def test_round_trip_to_dict_and_back(self) -> None:
        store = MemoryStore(capacity=8)
        store.insert("a", importance=0.5, sim_sec=1.0)
        store.insert("b", importance=0.7, sim_sec=2.0, anchor=True, tags=["objective"])
        dumped = store.to_dict()
        rebuilt = MemoryStore.from_dict(dumped)
        assert rebuilt.size == 2
        assert rebuilt.capacity == 8
        assert any(e.anchor for e in rebuilt.entries)

    def test_default_capacity_constant(self) -> None:
        assert DEFAULT_CAPACITY == 200

    def test_memory_entry_to_dict_uses_camelcase_keys(self) -> None:
        entry = MemoryEntry(content="x", importance=0.4, sim_sec=3.0, anchor=False)
        d = entry.to_dict()
        assert "simSec" in d
        assert "importanceRaw" in d


class TestJSImportanceScale:
    def test_int_5_treated_as_max_importance(self) -> None:
        store = MemoryStore(capacity=2)
        e = store.insert("critical", importance=5, sim_sec=1.0)
        assert e.importance == pytest.approx(1.0)
        assert e.importance_raw == 5

    def test_int_1_treated_as_low_importance(self) -> None:
        store = MemoryStore(capacity=2)
        e = store.insert("trivial", importance=1, sim_sec=1.0)
        assert e.importance == pytest.approx(0.2)
        assert e.importance_raw == 1
