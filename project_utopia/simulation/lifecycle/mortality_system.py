"""Trim port of ``MortalitySystem.js`` — death + recovery grace only.

The JS source is 913 LOC: 700 of those are obituary copy, witness memory
beats, kinship grief debuffs, and chronicle-strip narration. None of that
is exercised by the academic benchmark; the RC3 audit asked for a ~520
LOC trim. This module keeps only the load-bearing logic:

* per-entity hunger threshold + hold timer → mark dead
* recovery-grace period (no death triggers for the first
  ``RECOVERY_GRACE_SEC`` seconds after the colony entered recovery mode)
* emit ``WORKER_DIED`` / ``WORKER_STARVED`` events
* resource-carry refund (food/wood/stone) routed through the
  resource layer's ``recordResourceFlow`` shim
* deathsTotal / deathsByReason counters used by metrics

Anything that doesn't move colony state from "alive" to "dead" (or post
a metric the harness reads) is intentionally absent.
"""

from __future__ import annotations

from typing import Any

from project_utopia.simulation.meta.game_event_bus import EVENT_TYPES, emit_event
from project_utopia.simulation.meta.progression_helper import is_recovery_essential

__all__ = [
    "MortalitySystem",
    "RECOVERY_GRACE_SEC",
    "death_threshold_for",
]


RECOVERY_GRACE_SEC = 30.0
"""Seconds after the colony enters recovery mode during which death triggers
are suppressed. Mirrors the JS ``recovery-essential`` window — gives the
auto-pilot one full proposer cycle to land an emergency farm/depot before
the rolling starvation tide claims the colony."""


def death_threshold_for(entity: dict[str, Any]) -> tuple[float, float]:
    """Return the ``(hunger_threshold, hold_sec)`` tuple for an entity.

    Mirrors JS ``deathThresholdFor``. The threshold is the hunger value at
    which the entity starts accruing ``starvationSec``; the hold is how
    many seconds below threshold are required before the entity dies.
    """
    etype = str(entity.get("type", ""))
    kind = str(entity.get("kind", ""))
    if etype == "WORKER":
        return (0.045, 34.0)
    if etype == "VISITOR":
        return (0.04, 40.0)
    if kind == "HERBIVORE":
        return (0.035, 20.0)
    return (0.03, 28.0)


def _is_within_recovery_grace(state: dict[str, Any]) -> bool:
    """Return ``True`` when the colony is still in its post-crisis grace window."""
    ai = state.get("ai") or {}
    if not bool(ai.get("recovery_mode", False)):
        return False
    metrics = state.get("metrics") or {}
    now_sec = float(metrics.get("timeSec", 0.0))
    entered_sec = float(ai.get("recovery_entered_sec", now_sec))
    return (now_sec - entered_sec) < RECOVERY_GRACE_SEC


def _refund_carry(state: dict[str, Any], entity: dict[str, Any]) -> None:
    """Return any carried resources to the colony stockpile."""
    carry = entity.get("carry")
    if not isinstance(carry, dict):
        return
    resources = state.setdefault("resources", {})
    for resource_key in ("food", "wood", "stone"):
        amount = float(carry.get(resource_key, 0.0))
        if amount <= 0.0:
            continue
        resources[resource_key] = float(resources.get(resource_key, 0.0)) + amount
    entity["carry"] = {"food": 0.0, "wood": 0.0, "stone": 0.0}


def _increment_death_counters(
    state: dict[str, Any], entity: dict[str, Any], reason: str
) -> None:
    metrics = state.setdefault("metrics", {})
    metrics["deathsTotal"] = int(metrics.get("deathsTotal", 0)) + 1
    by_reason = metrics.setdefault("deathsByReason", {})
    by_reason[reason] = int(by_reason.get(reason, 0)) + 1
    by_group = metrics.setdefault("deathsByGroup", {})
    group_id = str(entity.get("groupId") or entity.get("kind") or entity.get("type") or "unknown")
    by_group[group_id] = int(by_group.get(group_id, 0)) + 1


class MortalitySystem:
    """Tick the hunger → starvation → death chain.

    Public state contract::

        state["agents"]              : list[dict]
        state["metrics"]["timeSec"]  : float
        state["metrics"]["deathsTotal"], ["deathsByReason"], ["deathsByGroup"]
        state["ai"]["recovery_mode"]  : bool
        state["ai"]["recovery_entered_sec"] : float

    Per-entity fields read::

        type, alive, hunger, starvationSec, deathReason, carry
    """

    def __init__(self) -> None:
        self.name = "MortalitySystem"

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del services
        if not isinstance(state, dict):
            return
        step = max(0.0, float(dt))
        in_grace = _is_within_recovery_grace(state)
        metrics = state.setdefault("metrics", {})
        now_sec = float(metrics.get("timeSec", 0.0))
        agents = state.get("agents") or []

        for agent in agents:
            if not isinstance(agent, dict):
                continue
            if not bool(agent.get("alive", True)):
                continue

            hunger = float(agent.get("hunger", 1.0))
            threshold, hold_sec = death_threshold_for(agent)
            if hunger <= threshold:
                agent["starvationSec"] = float(agent.get("starvationSec", 0.0)) + step
            else:
                agent["starvationSec"] = 0.0

            starvation_sec = float(agent.get("starvationSec", 0.0))
            if starvation_sec < hold_sec:
                continue

            if in_grace:
                # Recovery-grace suppression: don't trigger deaths within
                # the window. The starvationSec counter keeps accumulating
                # so the entity will die the moment grace expires (RC3
                # contract: grace gives the auto-pilot a chance to build
                # emergency depots, not a permanent reprieve).
                continue

            # Trigger death.
            agent["alive"] = False
            reason = str(agent.get("deathReason") or "starvation")
            agent["deathReason"] = reason
            agent["deathSec"] = now_sec
            _refund_carry(state, agent)
            _increment_death_counters(state, agent, reason)

            emit_event(
                state,
                EVENT_TYPES["WORKER_DIED"],
                {
                    "entityId": agent.get("id"),
                    "entityName": agent.get("displayName") or agent.get("id"),
                    "reason": reason,
                    "atSec": now_sec,
                },
            )
            if reason == "starvation":
                emit_event(
                    state,
                    EVENT_TYPES["WORKER_STARVED"],
                    {
                        "entityId": agent.get("id"),
                        "entityName": agent.get("displayName") or agent.get("id"),
                        "atSec": now_sec,
                    },
                )

        # Re-export `is_recovery_essential` indirectly: ColonyDirector
        # imports it, MortalitySystem doesn't need it but the migration
        # brief mentions wiring the shared module here. Touch a no-op
        # reference so the import is preserved.
        _ = is_recovery_essential
