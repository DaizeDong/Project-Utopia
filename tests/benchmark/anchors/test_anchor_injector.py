"""Tests for the AnchorInjector — seeding MemoryStore with anchor observations."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from project_utopia.benchmark.anchors.anchor_injector import Anchor, inject_anchors
from project_utopia.simulation.ai.memory.memory_store import MemoryStore


def _make_harness(memory_store: MemoryStore | None) -> SimpleNamespace:
    return SimpleNamespace(memory_store=memory_store, state={})


class TestInjectAnchors:
    def test_zero_anchors_zero_injected(self) -> None:
        mem = MemoryStore(capacity=10)
        harness = _make_harness(mem)
        result = inject_anchors(harness, [])
        assert result == {"injected": 0, "skipped": 0}
        assert mem.size == 0

    def test_paper_shape_five_anchors_inserted_anchored(self) -> None:
        mem = MemoryStore(capacity=10)
        harness = _make_harness(mem)
        anchors = [
            {
                "verbal_tokens": [f"warehouse at ({i},{i})"],
                "implicit_goals": [{"action": "deliver", "target": "warehouse"}],
            }
            for i in range(5)
        ]
        result = inject_anchors(harness, anchors, at_sec=0.0)
        assert result["injected"] == 5
        assert result["skipped"] == 0
        assert mem.size == 5
        # All entries must be anchored (immune to eviction).
        for entry in mem.entries:
            assert entry.anchor is True
            assert "anchor" in entry.tags
            assert entry.sim_sec == 0.0
            assert entry.importance == pytest.approx(1.0, abs=1e-9)

    def test_js_port_shape_token_field(self) -> None:
        mem = MemoryStore(capacity=10)
        harness = _make_harness(mem)
        anchors = [{"token": "ANCHOR-WAREHOUSE-12-8", "implicit_goals": ["deliver", "warehouse"]}]
        result = inject_anchors(harness, anchors)
        assert result["injected"] == 1
        entry = mem.entries[0]
        assert entry.content == "ANCHOR-WAREHOUSE-12-8"
        # implicit_goals get encoded as goal:* tags
        assert any(t.startswith("goal:deliver") for t in entry.tags)
        assert any(t.startswith("goal:warehouse") for t in entry.tags)

    def test_string_anchor_is_accepted(self) -> None:
        mem = MemoryStore(capacity=10)
        harness = _make_harness(mem)
        result = inject_anchors(harness, ["bare-anchor"])
        assert result["injected"] == 1
        assert mem.entries[0].content == "bare-anchor"

    def test_malformed_anchor_is_skipped(self) -> None:
        mem = MemoryStore(capacity=10)
        harness = _make_harness(mem)
        anchors = [None, {}, {"verbal_tokens": []}, "", "valid"]
        result = inject_anchors(harness, anchors)
        # Only "valid" survives.
        assert result["injected"] == 1
        assert result["skipped"] == 4

    def test_anchors_survive_routine_inserts_integration(self) -> None:
        """Integration with MemoryStore: anchors survive many routine inserts."""
        mem = MemoryStore(capacity=20)
        harness = _make_harness(mem)
        inject_anchors(harness, [
            Anchor(verbal_tokens=["anchor-A"], implicit_goals=[]),
            Anchor(verbal_tokens=["anchor-B"], implicit_goals=[]),
        ])
        # Now flood with routine entries.
        for i in range(1000):
            mem.insert(
                content=f"routine-{i}",
                importance=0.3,
                sim_sec=float(i),
                anchor=False,
            )
        # Both anchors still present.
        contents = [e.content for e in mem.entries if e.anchor]
        assert "anchor-A" in contents
        assert "anchor-B" in contents
        # Capacity NOT exceeded for non-anchor entries.
        non_anchor_count = sum(1 for e in mem.entries if not e.anchor)
        assert non_anchor_count <= mem.capacity

    def test_missing_memory_store_returns_skipped(self) -> None:
        harness = _make_harness(None)
        result = inject_anchors(harness, [{"verbal_tokens": ["x"]}, {"verbal_tokens": ["y"]}])
        assert result["injected"] == 0
        assert result["skipped"] >= 1
