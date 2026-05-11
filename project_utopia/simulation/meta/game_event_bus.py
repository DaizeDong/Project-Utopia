"""Pure-Python pub/sub event bus (port of ``src/simulation/meta/GameEventBus.js``).

Subscribers are stored in registration order so iteration is deterministic.
Unlike a generic pub/sub we deliberately do **not** sort by callable identity
(see migration brief): the order in which handlers were registered IS the
delivery order, and that order is reproducible from a same-seed test run as
long as the test does its ``on_event`` calls in the same order.

The event log is a bounded ring buffer (``MAX_EVENTS`` = 200) to mirror the
JS contract. Listeners are kept in a ``dict[str, list[Callable]]`` exactly as
the migration brief asks.
"""

from __future__ import annotations

from collections.abc import Callable
from types import MappingProxyType
from typing import Any

__all__ = [
    "EVENT_TYPES",
    "MAX_EVENTS",
    "init_event_bus",
    "emit_event",
    "on_event",
    "get_event_log",
]

MAX_EVENTS = 200

# Mirror of ``EVENT_TYPES`` in the JS source. Frozen mapping so callers cannot
# mutate the contract from underneath the simulation. The JS source uses
# ``Object.freeze``; ``MappingProxyType`` is the closest Python equivalent.
EVENT_TYPES: MappingProxyType[str, str] = MappingProxyType(
    {
        "WORKER_DIED": "worker_died",
        "WORKER_STARVED": "worker_starved",
        "WORKER_RESTING": "worker_resting",
        "BUILDING_PLACED": "building_placed",
        "BUILDING_DESTROYED": "building_destroyed",
        "RESOURCE_DEPLETED": "resource_depleted",
        "RESOURCE_SURPLUS": "resource_surplus",
        "WEATHER_CHANGED": "weather_changed",
        "PREDATOR_ATTACK": "predator_attack",
        "HERBIVORE_FLED": "herbivore_fled",
        "TRADE_COMPLETED": "trade_completed",
        "SABOTAGE_OCCURRED": "sabotage_occurred",
        "FOOD_SHORTAGE": "food_shortage",
        "VISITOR_ARRIVED": "visitor_arrived",
        "NIGHT_BEGAN": "night_began",
        "DAY_BEGAN": "day_began",
        "WORKER_MOOD_LOW": "worker_mood_low",
        "COLONY_MILESTONE": "colony_milestone",
        "ANIMAL_MIGRATION": "animal_migration",
        "WORKER_SOCIALIZED": "worker_socialized",
        "WAREHOUSE_FIRE": "warehouse_fire",
        "VERMIN_SWARM": "vermin_swarm",
        "WAREHOUSE_QUEUE_TIMEOUT": "warehouse_queue_timeout",
        "DEMOLITION_RECYCLED": "demolition_recycled",
        "FOOD_PRECRISIS_DETECTED": "food_precrisis_detected",
        "FOOD_CRISIS_DETECTED": "food_crisis_detected",
        "OBJECTIVE_REGRESSED": "objective_regressed",
        "WORKER_BORN": "worker_born",
        "WORKER_RIVALRY": "worker_rivalry",
        "EVENT_STARTED": "event_started",
    }
)


def init_event_bus(state: dict[str, Any]) -> None:
    """Ensure ``state["events"]`` has a place for the log + listeners.

    The bus log lives on ``state["events_bus"]`` (a plain dict) so we
    coexist with ``project_utopia.world.events.WorldEventState`` (a
    dataclass) when both are mounted on the same state.
    """
    events_bus = state.get("events_bus")
    if not isinstance(events_bus, dict):
        events_bus = {}
        state["events_bus"] = events_bus
    events_bus.setdefault("log", [])
    events_bus.setdefault("listeners", {})
    # Back-compat: if ``state["events"]`` is also a plain dict (legacy JS
    # shape used by some tests), keep them in sync.
    legacy = state.get("events")
    if isinstance(legacy, dict):
        legacy.setdefault("log", events_bus["log"])
        legacy.setdefault("listeners", events_bus["listeners"])


def emit_event(
    state: dict[str, Any],
    event_type: str,
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append an event to the log and invoke listeners.

    Returns the constructed event dict so callers can inspect it (mirrors
    JS behaviour where ``emitEvent`` returns ``undefined`` but the appended
    log entry can be read back via ``state.events.log[-1]``).
    """
    init_event_bus(state)
    payload = dict(detail or {})
    metrics = state.get("metrics") or {}
    event: dict[str, Any] = {
        "type": event_type,
        "t": float(metrics.get("timeSec", 0.0)),
        "entityId": payload.get("entityId"),
        "entityName": payload.get("entityName"),
        "detail": payload,
    }
    log = state["events_bus"]["log"]
    log.append(event)
    if len(log) > MAX_EVENTS:
        del log[: len(log) - MAX_EVENTS]
    listeners = state["events_bus"]["listeners"]
    handlers = listeners.get(event_type)
    if handlers:
        # Iterate over a copy so handlers that unsubscribe mid-dispatch
        # don't corrupt the live list. Deterministic order = registration
        # order (preserved by the list).
        for fn in list(handlers):
            fn(event)
    return event


def on_event(
    state: dict[str, Any],
    event_type: str,
    handler: Callable[[dict[str, Any]], None],
) -> Callable[[], None]:
    """Subscribe ``handler`` to ``event_type``.

    Idempotent: registering the same handler twice does NOT duplicate the
    subscription (mirrors JS T1-3 fix). Returns an ``unsubscribe`` callable.
    """
    init_event_bus(state)
    listeners = state["events_bus"]["listeners"]
    handlers = listeners.setdefault(event_type, [])

    def unsubscribe() -> None:
        try:
            handlers.remove(handler)
        except ValueError:
            pass

    if handler in handlers:
        return unsubscribe
    handlers.append(handler)
    return unsubscribe


def get_event_log(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the live event log list (mirrors JS ``getEventLog``)."""
    bus = state.get("events_bus")
    if isinstance(bus, dict):
        log = bus.get("log")
        if isinstance(log, list):
            return log
    # Legacy shape — ``state["events"]`` as a plain dict.
    events = state.get("events")
    if isinstance(events, dict):
        log = events.get("log")
        return log if isinstance(log, list) else []
    return []
