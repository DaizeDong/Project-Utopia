"""System registry & notification queue glue.

The JS source spreads system bootstrap across ``createSystems()`` in
``GameApp`` and ``SimHarness``; the Python equivalent collects the same
plumbing here so harness / test callers can register systems in a single
place and tick them in registration order.

Determinism: systems run in the order they were registered (not by name
hash or class identity), matching the migration brief's contract.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Protocol

__all__ = ["System", "SystemRegistry", "NotificationQueue"]


class System(Protocol):
    """Minimal duck-typed system surface."""

    name: str

    def update(self, dt: float, state: dict[str, Any], services: Any | None = None) -> None:
        ...


class SystemRegistry:
    """Ordered list of simulation systems.

    Iteration is deterministic — registration order = tick order, mirroring
    the JS ``SYSTEM_ORDER`` array.
    """

    def __init__(self, systems: Iterable[System] | None = None) -> None:
        self._systems: list[System] = []
        if systems is not None:
            for s in systems:
                self.register(s)

    def register(self, system: System) -> None:
        self._systems.append(system)

    def get(self, name: str) -> System | None:
        for s in self._systems:
            if getattr(s, "name", None) == name:
                return s
        return None

    def tick(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        """Tick every registered system in order. Per-system exceptions
        propagate — the caller is expected to wrap with a try/except when
        running in benchmark/headless mode."""
        for s in self._systems:
            s.update(dt, state, services)

    def names(self) -> list[str]:
        return [getattr(s, "name", s.__class__.__name__) for s in self._systems]

    def __len__(self) -> int:
        return len(self._systems)

    def __iter__(self):
        return iter(self._systems)


class NotificationQueue:
    """Append-only ring buffer for player / HUD notifications.

    The academic benchmark does not surface notifications to a UI, but
    some systems (``Construction``, ``Mortality``) still post into the
    queue and downstream telemetry reads it for analytics.
    """

    def __init__(self, max_size: int = 64) -> None:
        self.max_size = int(max_size)
        self._items: list[dict[str, Any]] = []

    def push(self, kind: str, payload: dict[str, Any] | None = None) -> None:
        entry = {
            "kind": str(kind),
            "payload": dict(payload or {}),
        }
        self._items.append(entry)
        if len(self._items) > self.max_size:
            del self._items[: len(self._items) - self.max_size]

    def drain(self) -> list[dict[str, Any]]:
        out = list(self._items)
        self._items.clear()
        return out

    def peek(self) -> list[dict[str, Any]]:
        return list(self._items)

    def __len__(self) -> int:
        return len(self._items)
