"""DecisionScheduler — heartbeat + crisis-trigger gate for the strategic channel.

Port of ``src/simulation/ai/strategic/DecisionScheduler.js``. Critical-event
triggers (``workers==0``, ``food<=5``, ``wood<=5``, ``threat>=85``) bypass the
cooldown so the LLM gets a chance to re-plan the moment the colony tips into
a survival crisis.
"""

from __future__ import annotations

import math
from typing import Any

DEFAULT_HEARTBEAT_SEC: float = 90.0
DEFAULT_COOLDOWN_SEC: float = 15.0


def _num(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    return v


class DecisionScheduler:
    """Heartbeat + crisis-trigger scheduler.

    Args:
        heartbeat_sec: Maximum seconds between scheduled decisions (default 90).
        cooldown_sec: Minimum seconds between decisions (default 15). Critical
            events fire even inside the cooldown.
    """

    __slots__ = (
        "heartbeat_sec",
        "cooldown_sec",
        "initialized",
        "last_decision_sec",
        "last_death_count",
        "last_objective_index",
        "last_prosperity",
        "last_threat",
    )

    def __init__(
        self,
        *,
        heartbeat_sec: float = DEFAULT_HEARTBEAT_SEC,
        cooldown_sec: float = DEFAULT_COOLDOWN_SEC,
    ) -> None:
        self.heartbeat_sec = float(heartbeat_sec)
        self.cooldown_sec = float(cooldown_sec)
        self.initialized: bool = False
        self.last_decision_sec: float = 0.0
        self.last_death_count: float = 0.0
        self.last_objective_index: float = 0.0
        self.last_prosperity: float = 0.0
        self.last_threat: float = 0.0

    def should_trigger(self, state: dict[str, Any]) -> bool:
        """Return True iff the strategic channel should fire this tick."""
        session = state.get("session") if isinstance(state, dict) else {}
        if not isinstance(session, dict):
            session = {}
        if session.get("phase", "active") != "active":
            return False

        if not self.initialized:
            return True

        metrics = state.get("metrics") if isinstance(state, dict) else {}
        if not isinstance(metrics, dict):
            metrics = {}
        now = _num(metrics.get("timeSec", 0))
        elapsed = now - self.last_decision_sec

        if elapsed >= self.heartbeat_sec:
            return True
        if elapsed < self.cooldown_sec:
            return False

        # Crisis triggers (past cooldown).
        pop_stats = metrics.get("populationStats") if isinstance(metrics, dict) else {}
        if not isinstance(pop_stats, dict):
            pop_stats = {}
        workers = _num(pop_stats.get("workers", 0))
        resources = state.get("resources") if isinstance(state, dict) else {}
        if not isinstance(resources, dict):
            resources = {}
        food = _num(resources.get("food", 100))
        wood = _num(resources.get("wood", 100))
        gameplay = state.get("gameplay") if isinstance(state, dict) else {}
        if not isinstance(gameplay, dict):
            gameplay = {}
        threat = _num(gameplay.get("threat", 0))

        if workers <= 0:
            return True
        if food <= 5:
            return True
        if wood <= 5:
            return True
        if threat >= 85:
            return True

        # Significant events (past cooldown).
        deaths = _num(metrics.get("deathsTotal", 0))
        if deaths > self.last_death_count:
            return True
        obj_idx = _num(gameplay.get("objectiveIndex", 0))
        if obj_idx != self.last_objective_index:
            return True
        prosperity = _num(gameplay.get("prosperity", 50))
        if abs(prosperity - self.last_prosperity) > 15:
            return True
        return False

    def record_decision(self, state: dict[str, Any]) -> None:
        """Snapshot state so the next :meth:`should_trigger` can detect changes."""
        metrics = state.get("metrics") if isinstance(state, dict) else {}
        if not isinstance(metrics, dict):
            metrics = {}
        gameplay = state.get("gameplay") if isinstance(state, dict) else {}
        if not isinstance(gameplay, dict):
            gameplay = {}
        self.last_decision_sec = _num(metrics.get("timeSec", 0))
        self.last_death_count = _num(metrics.get("deathsTotal", 0))
        self.last_objective_index = _num(gameplay.get("objectiveIndex", 0))
        self.last_prosperity = _num(gameplay.get("prosperity", 50))
        self.last_threat = _num(gameplay.get("threat", 0))
        self.initialized = True


__all__ = ["DecisionScheduler", "DEFAULT_HEARTBEAT_SEC", "DEFAULT_COOLDOWN_SEC"]
