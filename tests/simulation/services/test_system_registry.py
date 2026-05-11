"""Tests for the deterministic system registry."""

from __future__ import annotations

from project_utopia.simulation.services.system_registry import (
    NotificationQueue,
    SystemRegistry,
)


class _CounterSystem:
    def __init__(self, name: str) -> None:
        self.name = name
        self.ticks = 0

    def update(self, dt: float, state: dict, services=None) -> None:
        self.ticks += 1
        state.setdefault("order", []).append(self.name)


class TestSystemRegistry:
    def test_registration_order_preserved(self) -> None:
        reg = SystemRegistry()
        for name in ("zz", "aa", "mm"):
            reg.register(_CounterSystem(name))
        state: dict = {}
        reg.tick(0.5, state)
        assert state["order"] == ["zz", "aa", "mm"]

    def test_get_by_name(self) -> None:
        reg = SystemRegistry([_CounterSystem("foo"), _CounterSystem("bar")])
        assert reg.get("foo") is not None
        assert reg.get("nope") is None

    def test_names(self) -> None:
        reg = SystemRegistry([_CounterSystem("a"), _CounterSystem("b")])
        assert reg.names() == ["a", "b"]


class TestNotificationQueue:
    def test_push_and_drain(self) -> None:
        q = NotificationQueue(max_size=4)
        q.push("foo", {"x": 1})
        q.push("bar", {"y": 2})
        assert len(q) == 2
        drained = q.drain()
        assert len(drained) == 2
        assert drained[0]["kind"] == "foo"
        assert len(q) == 0

    def test_ring_buffer_truncates(self) -> None:
        q = NotificationQueue(max_size=2)
        for i in range(5):
            q.push("kind", {"i": i})
        # Only last 2 survive.
        items = q.peek()
        assert len(items) == 2
        assert items[-1]["payload"]["i"] == 4
