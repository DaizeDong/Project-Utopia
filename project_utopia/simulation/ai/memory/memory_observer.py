"""MemoryObserver — bridges the simulation tick stream into MemoryStore.

Python port of ``MemoryObserver.js``. The observer keeps last-seen state for
the handful of "loud" signals (deaths, food-critical, objective completion,
weather change) and emits a single :class:`MemoryStore` entry per
state-transition rather than every tick. This keeps memory usage bounded and
the prompt-injection feed signal-heavy.
"""

from __future__ import annotations

from typing import Any

from .memory_store import MemoryStore


class MemoryObserver:
    """Observe simulation state and emit memory entries on state transitions."""

    def __init__(self, memory_store: MemoryStore) -> None:
        self.store = memory_store
        self.initialized = False
        self.last_deaths: int = 0
        self.last_food_critical: bool = False
        self.last_obj_idx: int = 0
        self.last_weather: str = "clear"

    def reset(self) -> None:
        self.initialized = False
        self.last_deaths = 0
        self.last_food_critical = False
        self.last_obj_idx = 0
        self.last_weather = "clear"

    def observe(self, state: dict[str, Any]) -> None:
        """Inspect the live game state and emit any new memory entries."""
        session = state.get("session") or {}
        if session.get("phase") and session.get("phase") != "active":
            return

        metrics = state.get("metrics") or {}
        gameplay = state.get("gameplay") or {}
        resources = state.get("resources") or {}
        weather_state = state.get("weather") or {}

        t = float(metrics.get("timeSec") or 0.0)
        deaths = int(metrics.get("deathsTotal") or 0)
        food = float(resources.get("food") or 0.0)
        obj_idx = int(gameplay.get("objectiveIndex") or 0)
        weather = str(weather_state.get("current") or "clear")

        if not self.initialized:
            self.last_deaths = deaths
            self.last_food_critical = food < 15
            self.last_obj_idx = obj_idx
            self.last_weather = weather
            self.initialized = True
            return

        if deaths > self.last_deaths:
            diff = deaths - self.last_deaths
            reasons = metrics.get("deathsByReason") or {}
            detail = ", ".join(f"{k}:{v}" for k, v in reasons.items() if v) or "unknown"
            self.store.insert(
                f"{diff} death(s) ({detail})",
                importance=3,
                sim_sec=t,
                tags=["death"],
            )
            self.last_deaths = deaths

        if food < 15 and not self.last_food_critical:
            self.store.insert(
                f"Food critically low: {int(food)}",
                importance=2,
                sim_sec=t,
                tags=["resource_critical"],
            )
            self.last_food_critical = True
        elif food >= 15:
            self.last_food_critical = False

        if obj_idx > self.last_obj_idx:
            objectives = gameplay.get("objectives") or []
            try:
                title = str(objectives[self.last_obj_idx].get("title", f"objective-{self.last_obj_idx}"))
            except (IndexError, AttributeError, TypeError):
                title = f"objective-{self.last_obj_idx}"
            self.store.insert(
                f"Completed objective: {title}",
                importance=3,
                sim_sec=t,
                tags=["objective"],
                anchor=True,  # Objective completions are anchors (E5).
            )
            self.last_obj_idx = obj_idx

        if weather != "clear" and weather != self.last_weather:
            self.store.insert(
                f"Weather changed to {weather}",
                importance=1,
                sim_sec=t,
                tags=["weather"],
            )
            self.last_weather = weather
        elif weather == "clear":
            self.last_weather = "clear"


__all__ = ["MemoryObserver"]
