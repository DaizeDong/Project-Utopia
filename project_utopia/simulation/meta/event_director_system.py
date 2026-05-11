"""Deterministic event scheduler (port of ``EventDirectorSystem.js``).

This is the **scheduler** that pushes events into the world-event queue
on a fixed cadence — *not* the LLM ``EnvironmentDirector`` channel and
*not* :class:`project_utopia.world.events.WorldEventSystem` (which drains
the queue). The two systems intentionally live in different modules.
"""

from __future__ import annotations

from typing import Any

from project_utopia.app.rng import SeededRng
from project_utopia.world.events import EventType, WorldEventState, enqueue_event

from .game_event_bus import EVENT_TYPES, emit_event

__all__ = ["EventDirectorSystem", "EVENT_DIRECTOR_BALANCE"]


# Tunable knobs (mirrors ``BALANCE.eventDirector*`` in JS). Frozen dict so
# tests can monkey-patch a per-test override via ``dict(... | overrides)``
# without mutating module state.
EVENT_DIRECTOR_BALANCE: dict[str, Any] = {
    "base_interval_sec": 240.0,
    "weights": {
        EventType.BANDIT_RAID: 0.20,
        EventType.ANIMAL_MIGRATION: 0.25,
        EventType.TRADE_CARAVAN: 0.25,
        EventType.DISEASE_OUTBREAK: 0.10,
        EventType.WILDFIRE: 0.10,
    },
    "tuning": {
        EventType.BANDIT_RAID: {"duration_sec": 24.0, "intensity": 1.0},
        EventType.ANIMAL_MIGRATION: {"duration_sec": 24.0, "intensity": 1.0},
        EventType.TRADE_CARAVAN: {"duration_sec": 24.0, "intensity": 1.0},
        EventType.DISEASE_OUTBREAK: {"duration_sec": 24.0, "intensity": 1.0},
        EventType.WILDFIRE: {"duration_sec": 24.0, "intensity": 1.0},
    },
    "raid_interval_base_ticks": 3600,
    "history_cap": 32,
}

_NON_RAID_FALLBACK_ORDER: tuple[EventType, ...] = (
    EventType.ANIMAL_MIGRATION,
    EventType.TRADE_CARAVAN,
    EventType.DISEASE_OUTBREAK,
    EventType.WILDFIRE,
)


def _rng_next(rng: SeededRng | None) -> float:
    """RC3 B3-B7 nondeterminism fix: constant fallback, never ``random()``."""
    if rng is None:
        return 0.5
    return rng.next()


def _roll_event_type(rng: SeededRng | None, weights: dict[EventType, float]) -> EventType:
    """Weighted choice across ``weights`` using a single RNG draw."""
    entries = sorted(weights.items(), key=lambda kv: kv[0].value)
    total = sum(max(0.0, float(w)) for _, w in entries)
    if total <= 0.0:
        return EventType.ANIMAL_MIGRATION
    pick = _rng_next(rng) * total
    for evt_type, weight in entries:
        pick -= max(0.0, float(weight))
        if pick <= 0.0:
            return evt_type
    return entries[-1][0]


def _downgrade_raid(rng: SeededRng | None, weights: dict[EventType, float]) -> EventType:
    """Re-roll using non-raid weights when the bandit raid is on cooldown."""
    map_w = {t: weights.get(t, 0.0) for t in _NON_RAID_FALLBACK_ORDER}
    total = sum(max(0.0, float(w)) for w in map_w.values())
    if total <= 0.0:
        return EventType.ANIMAL_MIGRATION
    pick = _rng_next(rng) * total
    for evt_type in _NON_RAID_FALLBACK_ORDER:
        pick -= max(0.0, float(map_w.get(evt_type, 0.0)))
        if pick <= 0.0:
            return evt_type
    return EventType.ANIMAL_MIGRATION


def _ensure_director_state(state: dict[str, Any]) -> dict[str, Any]:
    gameplay = state.setdefault("gameplay", {})
    director = gameplay.get("event_director")
    if not isinstance(director, dict):
        director = {
            "last_dispatch_sec": float("-inf"),
            "day_budget": 0,
            "history": [],
        }
        gameplay["event_director"] = director
    return director


def _is_raid_on_cooldown(state: dict[str, Any], balance: dict[str, Any]) -> bool:
    gameplay = state.get("gameplay") or {}
    esc = gameplay.get("raid_escalation") or {}
    interval_ticks = float(
        esc.get("interval_ticks", balance.get("raid_interval_base_ticks", 3600))
    )
    metrics = state.get("metrics") or {}
    current_tick = float(metrics.get("tick", 0))
    last_raid_tick = float(gameplay.get("last_raid_tick", -9999))
    return (current_tick - last_raid_tick) < interval_ticks


class EventDirectorSystem:
    """Deterministic event scheduler.

    Pushes one event into ``state.events.queue`` (a
    :class:`WorldEventState`) every ``base_interval_sec`` of simulated
    time. Determinism is anchored on ``services.rng`` — if that isn't
    threaded through, we fall back to a constant ``0.5`` (RC3 B3 fix).
    """

    def __init__(self, balance: dict[str, Any] | None = None) -> None:
        self.name = "EventDirectorSystem"
        self.balance = dict(balance) if balance is not None else dict(EVENT_DIRECTOR_BALANCE)

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del dt  # unused; cadence is keyed off state.metrics.timeSec
        events_obj = state.get("events")
        # Accept either dict (test fixtures) or WorldEventState dataclass.
        if events_obj is None:
            return
        director = _ensure_director_state(state)
        metrics = state.get("metrics") or {}
        now_sec = float(metrics.get("timeSec", 0.0))
        base_interval = float(self.balance.get("base_interval_sec", 240.0))
        bootstrap_window = (
            int((state.get("buildings") or {}).get("farms", 0)) == 0
            and now_sec < 180.0
        )
        effective_interval = base_interval * 2.5 if bootstrap_window else base_interval
        last_dispatch = float(director.get("last_dispatch_sec", float("-inf")))

        # First-tick anchor: align so the first dispatch lands at half-interval.
        if last_dispatch == float("-inf"):
            director["last_dispatch_sec"] = now_sec - effective_interval * 0.5
            return
        if (now_sec - last_dispatch) < effective_interval:
            return

        rng = getattr(services, "rng", None)
        weights = self.balance.get("weights", EVENT_DIRECTOR_BALANCE["weights"])
        chosen = _roll_event_type(rng, weights)
        if chosen == EventType.BANDIT_RAID and _is_raid_on_cooldown(state, self.balance):
            chosen = _downgrade_raid(rng, weights)
        tuning = self.balance.get("tuning", {}).get(chosen, {})
        duration_sec = float(tuning.get("duration_sec", 24.0))
        intensity = float(tuning.get("intensity", 1.0))

        # WorldEventState integration: prefer dataclass API when present,
        # else fall back to dict-of-lists for harness fixtures.
        if isinstance(events_obj, WorldEventState):
            enqueue_event(events_obj, chosen, {}, duration_sec, intensity)
        else:
            queue = events_obj.setdefault("queue", [])
            queue.append(
                {
                    "type": chosen.value if isinstance(chosen, EventType) else chosen,
                    "payload": {},
                    "duration_sec": duration_sec,
                    "intensity": intensity,
                }
            )

        emit_event(
            state,
            EVENT_TYPES["EVENT_STARTED"],
            {
                "kind": "event_started",
                "eventType": chosen.value if isinstance(chosen, EventType) else chosen,
                "intensity": intensity,
                "durationSec": duration_sec,
            },
        )

        director["last_dispatch_sec"] = now_sec
        director["day_budget"] = int(director.get("day_budget", 0)) + 1
        history = director.setdefault("history", [])
        history.insert(
            0,
            {
                "sec": round(now_sec, 1),
                "type": chosen.value if isinstance(chosen, EventType) else chosen,
            },
        )
        history_cap = int(self.balance.get("history_cap", 32))
        if len(history) > history_cap:
            del history[history_cap:]
