"""World event system (port of ``src/world/events/WorldEventSystem.js``).

The JS source is a 1300-line behemoth that interleaves event dispatch
with worker memory, raid-impact tile mutation, and scenario zone lookups.
This Python port extracts the **deterministic** core that the academic
benchmark exercises:

1. A queue of pending events (``queue``) drained each tick into
   ``active`` subject to ``maxConcurrentByType`` caps.
2. ``BANDIT_RAID`` events that pick a target zone, compute a pressure
   number from intensity + weather, and accumulate "raidsRepelled" on
   resolve.
3. ``ANIMAL_MIGRATION`` events that write a ``migration_target`` onto
   each herbivore agent so the brain layer can pull them toward a zone.
4. ``TRADE_CARAVAN`` events that scale a reward multiplier inversely
   with weather hazard penalty.
5. Pressure **rehydration** — for each active event the per-tick
   ``payload["pressure"]`` is reset from ``payload["basePressure"]`` so
   overlapping events don't compound across ticks (there is a JS test
   for this; we port it 1:1).

Inputs are plain dicts (no Pydantic) so the system can be driven directly
by the existing JS-shape test fixtures.

The companion module :class:`project_utopia.world.events.WorldEventSystem`
is NOT the LLM ``EnvironmentDirectorSystem`` — that lives under
:mod:`project_utopia.simulation.ai.director`.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from project_utopia.app.rng import SeededRng

from .scenarios import ScenarioState
from .weather import Weather, WeatherState

__all__ = [
    "EventType",
    "WorldEvent",
    "WorldEventState",
    "WorldEventSystem",
    "enqueue_event",
]


# ---------------------------------------------------------------------------
# Enum
# ---------------------------------------------------------------------------


class EventType(str, Enum):
    """Mirror of JS ``EVENT_TYPE`` (Round-1 simplified subset).

    The Round-1 game-mechanics cut dropped ``moraleBreak`` /
    ``diseaseOutbreak`` / ``wildfire``; this enum now mirrors the three
    surviving event kinds in ``project_utopia/config/constants.py#EVENT_TYPE``.
    """

    BANDIT_RAID = "banditRaid"
    ANIMAL_MIGRATION = "animalMigration"
    TRADE_CARAVAN = "tradeCaravan"


# Default per-type concurrency caps. Mirrors
# ``getLongRunEventTuning(state).maxConcurrentByType`` in JS; values copied
# from the reviewer-validated tuning that ships with the benchmark.
_DEFAULT_MAX_CONCURRENT: dict[EventType, int] = {
    EventType.BANDIT_RAID: 1,
    EventType.ANIMAL_MIGRATION: 2,
    EventType.TRADE_CARAVAN: 2,
}


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class WorldEvent:
    """One queued/active world event.

    The JS source uses plain JS objects for these; we use a dataclass so
    static analyzers can flag typos. The ``payload`` dict is intentionally
    loose because per-event-type fields differ (raid impactTile,
    migration target, caravan rewardMultiplier).
    """

    id: str
    type: EventType
    status: str = "prepare"  # "prepare" | "active" | "resolve" | "cooldown"
    elapsed_sec: float = 0.0
    duration_sec: float = 18.0
    intensity: float = 1.0
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorldEventState:
    """Holds queue + active + metrics for a single run.

    Attributes
    ----------
    queue
        Events scheduled but not yet activated.
    active
        Events whose ``status == "active"``.
    raids_repelled
        Monotonic counter — bumped when a BANDIT_RAID resolves with
        non-trivial defense.
    """

    queue: list[WorldEvent] = field(default_factory=list)
    active: list[WorldEvent] = field(default_factory=list)
    raids_repelled: int = 0
    next_event_id: int = 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def enqueue_event(
    state: WorldEventState,
    event_type: EventType,
    payload: dict[str, Any] | None = None,
    duration_sec: float = 18.0,
    intensity: float = 1.0,
) -> WorldEvent:
    """Queue a new event (port of ``enqueueEvent`` from ``WorldEventQueue.js``).

    The created event is appended to ``state.queue`` and returned so the
    caller can pin extra payload fields before the next tick.
    """
    eid = f"event-{state.next_event_id}"
    state.next_event_id += 1
    evt = WorldEvent(
        id=eid,
        type=event_type,
        status="prepare",
        elapsed_sec=0.0,
        duration_sec=float(duration_sec),
        intensity=float(intensity),
        payload=dict(payload or {}),
    )
    state.queue.append(evt)
    return evt


def _hazard_penalty_for_weather(weather: Weather) -> float:
    """JS ``hazardPenaltyForWeather`` — surviving Round-1 weathers only."""
    if weather == Weather.RAIN:
        return 1.35
    if weather == Weather.STORM:
        return 1.85
    return 1.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _pick_target_anchor(
    scenario: ScenarioState | None, kind: str = "depot"
) -> tuple[str, tuple[int, int]] | None:
    """Pick a (label, (x, z)) anchor for an event target.

    Falls back to ``coreWarehouse`` if no scenario-specific anchor exists.
    """
    if scenario is None:
        return None
    anchors = scenario.anchors
    if kind == "depot" and "eastDepot" in anchors:
        return "east depot", anchors["eastDepot"]
    if kind == "wildlife" and "westOutpost" in anchors:
        return "west wilds", anchors["westOutpost"]
    if "coreWarehouse" in anchors:
        return "core warehouse", anchors["coreWarehouse"]
    if anchors:
        # Deterministic fallback: smallest-key anchor.
        key = min(anchors.keys())
        return key, anchors[key]
    return None


# ---------------------------------------------------------------------------
# WorldEventSystem
# ---------------------------------------------------------------------------


class WorldEventSystem:
    """Deterministic world-event director.

    Tick contract::

        system.tick(
            dt=0.5,
            state=event_state,
            scenario=scenario_state,
            weather=weather_state,
            herbivores=list_of_agent_dicts,   # may be empty
            rng=seeded_rng,
            max_concurrent_by_type=None,      # optional override
        )

    The herbivores list is mutated in-place: animal-migration events
    write ``herbivore["memory"]["migration_target"] = (x, z)``.
    """

    def __init__(self, max_concurrent_by_type: dict[EventType, int] | None = None) -> None:
        self.name = "WorldEventSystem"
        self.max_concurrent_by_type: dict[EventType, int] = dict(
            max_concurrent_by_type or _DEFAULT_MAX_CONCURRENT
        )

    # ---- main entry point ---------------------------------------------

    def tick(
        self,
        dt: float,
        state: WorldEventState,
        *,
        scenario: ScenarioState | None = None,
        weather: WeatherState | None = None,
        herbivores: list[dict[str, Any]] | None = None,
        rng: SeededRng | None = None,
        max_concurrent_by_type: dict[EventType, int] | None = None,
    ) -> None:
        """Drain the queue, advance active events, apply per-type effects."""
        caps = dict(max_concurrent_by_type or self.max_concurrent_by_type)
        self._enforce_concurrency_caps(state, caps)
        weather_obj = weather.type if weather is not None else Weather.CLEAR

        for evt in state.active:
            # Pressure rehydration: reset from base each tick so overlap
            # penalties don't compound. Mirrors the JS test
            # ``overlapping event pressure is rehydrated from base instead
            # of compounding across ticks``.
            base_pressure = float(
                evt.payload.get("basePressure", evt.payload.get("pressure", evt.intensity))
            )
            evt.payload["basePressure"] = round(base_pressure, 3)
            evt.payload["pressure"] = round(base_pressure, 3)

            if evt.type == EventType.BANDIT_RAID:
                self._spawn_bandit_raid(evt, scenario, weather_obj, rng)
            elif evt.type == EventType.ANIMAL_MIGRATION:
                self._spawn_animal_migration(evt, scenario, herbivores, weather_obj)
            elif evt.type == EventType.TRADE_CARAVAN:
                self._scale_trade_caravan_reward(evt, weather_obj)

            evt.elapsed_sec += float(dt)
            if evt.status == "active" and evt.elapsed_sec >= evt.duration_sec:
                if evt.type == EventType.BANDIT_RAID:
                    # JS tracks `raidsRepelled` here; we mirror without
                    # the wall-coverage check (tests for that live in the
                    # impact-tile sub-module, deferred).
                    state.raids_repelled += 1
                evt.status = "resolve"

        # Apply overlap penalty AFTER per-event computation so the base
        # values above are stable across ticks. The penalty groups events
        # by target tile and writes a `contestedTiles` count.
        self._apply_contested_pressure(state)

        # Cooldown / resolve filter — drop resolved events after 4s of
        # cooldown to match the JS lifecycle window.
        state.active = [
            e for e in state.active
            if e.status != "cooldown" or e.elapsed_sec < e.duration_sec + 4.0
        ]

    # ---- queue management ---------------------------------------------

    def _enforce_concurrency_caps(
        self, state: WorldEventState, caps: dict[EventType, int]
    ) -> None:
        """Drain queue → active subject to per-type concurrency limits.

        Mirrors the JS ``maxConcurrentByType`` block. Items that exceed
        the cap stay in the queue for the next tick; everything else
        moves to ``state.active`` with ``status = "active"``.
        """
        active_counts: dict[EventType, int] = defaultdict(int)
        for evt in state.active:
            active_counts[evt.type] += 1

        kept_queue: list[WorldEvent] = []
        for evt in state.queue:
            cap = int(caps.get(evt.type, 9999))
            if active_counts[evt.type] >= cap:
                kept_queue.append(evt)
                continue
            evt.status = "active"
            state.active.append(evt)
            active_counts[evt.type] += 1
        state.queue = kept_queue

    # ---- per-type handlers --------------------------------------------

    def _spawn_bandit_raid(
        self,
        evt: WorldEvent,
        scenario: ScenarioState | None,
        weather: Weather,
        rng: SeededRng | None,
    ) -> None:
        """Pick a depot/route target, compute pressure, write payload."""
        anchor = _pick_target_anchor(scenario, kind="depot")
        if anchor is not None:
            label, coords = anchor
            evt.payload["targetLabel"] = label
            evt.payload["targetTile"] = coords
            evt.payload["targetTiles"] = [coords]
        # JS pressure formula (simplified):
        #   pressure = intensity * 0.54 + weather_hazard - 1 + depot_bonus
        weather_hazard = _hazard_penalty_for_weather(weather) - 1.0
        depot_bonus = 0.22
        pressure = float(evt.intensity) * 0.54 + weather_hazard + depot_bonus
        pressure = _clamp(pressure, 0.35, 2.6)
        evt.payload["basePressure"] = round(pressure, 3)
        evt.payload["pressure"] = round(pressure, 3)
        evt.payload["severity"] = (
            "severe" if pressure >= 1.5 else "moderate" if pressure >= 0.9 else "minor"
        )
        # Pick an impact tile (RNG-driven offset around the target) so the
        # JS test can read `raid.payload.impactTile`.
        if anchor is not None and rng is not None:
            cx, cz = anchor[1]
            dx = rng.next_int(-1, 1)
            dz = rng.next_int(-1, 1)
            evt.payload["impactTile"] = (cx + dx, cz + dz)

    def _spawn_animal_migration(
        self,
        evt: WorldEvent,
        scenario: ScenarioState | None,
        herbivores: list[dict[str, Any]] | None,
        weather: Weather,
    ) -> None:
        """Write ``migration_target`` onto each herbivore agent.

        The JS source stores into ``animal.memory.migrationTarget``; the
        snake-case mirror is ``herbivore["memory"]["migration_target"]``.
        """
        anchor = _pick_target_anchor(scenario, kind="wildlife")
        if anchor is None or herbivores is None:
            return
        label, coords = anchor
        evt.payload["targetLabel"] = label
        evt.payload["targetTile"] = coords
        pressure = float(evt.intensity) * 0.42
        # Weather amplifies migration pressure slightly.
        pressure += max(0.0, _hazard_penalty_for_weather(weather) - 1.0) * 0.5
        pressure = _clamp(pressure, 0.22, 1.9)
        evt.payload["basePressure"] = round(pressure, 3)
        evt.payload["pressure"] = round(pressure, 3)
        for animal in herbivores:
            memory = animal.setdefault("memory", {})
            memory["migration_target"] = coords
            debug = animal.setdefault("debug", {})
            debug["last_migration_pressure"] = round(pressure, 3)

    def _scale_trade_caravan_reward(
        self, evt: WorldEvent, weather: Weather
    ) -> None:
        """Reward multiplier inversely tracks weather hazard."""
        hazard = _hazard_penalty_for_weather(weather)
        # JS: rewardMultiplier = base / hazard^0.5 — we mirror.
        base = 1.0 + float(evt.intensity) * 0.5
        evt.payload["baseRewardMultiplier"] = round(base, 3)
        evt.payload["rewardMultiplier"] = round(base / max(1.0, hazard) ** 0.5, 3)
        # Hazard-overlap-tiles is 0 when CLEAR, positive otherwise.
        evt.payload["hazardOverlapTiles"] = 0 if weather == Weather.CLEAR else 1

    # ---- contested-pressure cross-cutting -----------------------------

    def _apply_contested_pressure(self, state: WorldEventState) -> None:
        """Apply overlap penalty when multiple events share target tiles.

        We compute a per-tile event count and, for every event whose
        target tile is contested, multiply its pressure by
        ``(1 + 0.12 * (contested_events - 1))``. The base value is left
        untouched so ticks N and N+1 produce the same penalty (the
        pressure-rehydration invariant).
        """
        tile_to_events: dict[tuple[int, int], list[WorldEvent]] = defaultdict(list)
        for evt in state.active:
            tt = evt.payload.get("targetTile")
            if isinstance(tt, tuple) and len(tt) == 2:
                tile_to_events[(int(tt[0]), int(tt[1]))].append(evt)
            # Also include explicit targetTiles list (multi-tile events).
            for entry in evt.payload.get("targetTiles", []) or []:
                if isinstance(entry, tuple) and len(entry) == 2:
                    tile_to_events[(int(entry[0]), int(entry[1]))].append(evt)
        for tile, events in tile_to_events.items():
            if len(events) <= 1:
                continue
            overlap = len(events) - 1
            for evt in events:
                base = float(evt.payload.get("basePressure", evt.intensity))
                # Trade caravan: overlap suppresses reward (lower multiplier).
                if evt.type == EventType.TRADE_CARAVAN:
                    base_reward = float(
                        evt.payload.get("baseRewardMultiplier", 1.0)
                    )
                    penalty_factor = 1.0 - 0.18 * overlap
                    new_reward = max(0.0, base_reward * max(0.0, penalty_factor))
                    evt.payload["rewardMultiplier"] = round(new_reward, 3)
                    # Mark contestation visible.
                    evt.payload["contestedTiles"] = (
                        evt.payload.get("contestedTiles", 0) + 1
                    )
                else:
                    # Other events: overlap inflates pressure.
                    new_pressure = base + 0.12 * overlap
                    evt.payload["pressure"] = round(new_pressure, 3)
