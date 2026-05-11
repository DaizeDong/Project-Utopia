"""Simulation clock + day/night cycle (port of ``src/app/SimulationClock.js``).

The clock advances ``state.metrics.timeSec`` / ``tick`` / ``frameCount`` on
every harness step and derives a continuous day/night phase. Day/night
transition emission is currently a no-op stub — the JS ``GameEventBus`` is
not yet ported (see Phase-2 backlog). Once that subagent lands, swap the
:meth:`SimulationClock._emit` helper for a real event dispatch.
"""

from __future__ import annotations

import math
from typing import Any

__all__ = ["SimulationClock", "DAY_CYCLE_PERIOD_SEC"]


# Matches the JS constant (v0.8.5 Tier 3 — 90s cycle = 45s day + 45s night).
DAY_CYCLE_PERIOD_SEC: float = 90.0


class SimulationClock:
    """Advance ``state.metrics`` time + derive day/night fields.

    Attributes
    ----------
    name : str
        Used by the SimHarness timing tap to label this system in
        ``state.debug.systemTimingsMs``.
    """

    __slots__ = ("name", "_prev_is_night")

    def __init__(self) -> None:
        self.name: str = "SimulationClock"
        self._prev_is_night: bool = False

    def update(self, dt: float, state: dict[str, Any]) -> None:
        """Step the clock forward by ``dt`` seconds, mutating ``state``.

        Parameters
        ----------
        dt
            Tick duration in seconds. Negative or non-finite values are
            treated as zero — matches the JS guard in callers.
        state
            The mutable game state bag.
        """
        if not math.isfinite(dt) or dt < 0:
            dt = 0.0

        metrics = state.setdefault("metrics", {})
        metrics["timeSec"] = float(metrics.get("timeSec", 0.0)) + dt
        metrics["tick"] = int(metrics.get("tick", 0)) + 1
        metrics["frameCount"] = int(metrics.get("frameCount", 0)) + 1

        # Day/night cycle: 0-1, where 0.0-0.5 is day and 0.5-1.0 is night.
        time_sec = float(metrics["timeSec"])
        cycle_pos = (time_sec % DAY_CYCLE_PERIOD_SEC) / DAY_CYCLE_PERIOD_SEC

        env = state.setdefault("environment", {})
        env["dayNightPhase"] = cycle_pos
        env["isNight"] = cycle_pos >= 0.5
        # Sine wave: peaks at 0.25 (noon → 1.0), troughs at 0.75 (midnight → 0.0).
        env["lightLevel"] = 0.5 + 0.5 * math.cos((cycle_pos - 0.25) * math.pi * 2.0)

        # Day/night transition hooks. The JS bus is not yet ported — the
        # private ``_emit`` helper is a placeholder so callers and tests can
        # still observe transitions via ``self._prev_is_night``.
        is_night = bool(env["isNight"])
        if is_night and not self._prev_is_night:
            self._emit(state, "NIGHT_BEGAN", {"phase": cycle_pos})
        elif not is_night and self._prev_is_night:
            self._emit(state, "DAY_BEGAN", {"phase": cycle_pos})
        self._prev_is_night = is_night

    def _emit(self, state: dict[str, Any], event_type: str, payload: dict[str, Any]) -> None:
        """Placeholder hook for day/night transition events.

        Once :mod:`project_utopia.simulation.meta.game_event_bus` lands,
        replace this body with an ``emit_event`` call. Until then the
        method is a no-op so callers don't crash.
        """
        # Intentionally a no-op for Phase 1 — the GameEventBus port is
        # owned by a different subagent.
        return None
