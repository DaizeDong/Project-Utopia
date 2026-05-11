"""Tests for :mod:`project_utopia.world.events`.

Ported from the JS test ``test/world-event-spatial.test.js`` (the file
matched by ``grep -l "WorldEventSystem\\|bandit raid\\|animal migration"
test/``) plus an additional concurrency-cap test that exercises the
``maxConcurrentByType`` branch.

We DO NOT port the wall-impact / RUINS-mutation assertions because tile
mutation crosses into ``simulation.lifecycle.TileMutationHooks`` (subagent
D's territory). The remaining four assertions — bandit-raid target,
animal-migration herbivore stamping, trade-caravan reward scaling,
pressure rehydration — are all preserved 1:1.
"""

from __future__ import annotations

from project_utopia.app.rng import SeededRng
from project_utopia.world.events import (
    EventType,
    WorldEvent,
    WorldEventState,
    WorldEventSystem,
    enqueue_event,
)
from project_utopia.world.scenarios import ScenarioFactory
from project_utopia.world.weather import Weather, WeatherState


def _make_state_for(name: str = "temperate_plains", seed: int = 1337):
    _grid, sstate = ScenarioFactory.build(name, seed=seed)
    return sstate


class TestConcurrencyCaps:
    def test_caps_limit_active_count(self) -> None:
        sstate = _make_state_for()
        ws = WorldEventState()
        # BANDIT_RAID cap defaults to 1 — queue three, only one activates.
        for _ in range(3):
            enqueue_event(ws, EventType.BANDIT_RAID, intensity=1.0)
        sys = WorldEventSystem()
        sys.tick(dt=0.5, state=ws, scenario=sstate, weather=WeatherState())
        active_raids = [e for e in ws.active if e.type == EventType.BANDIT_RAID]
        assert len(active_raids) == 1
        # Two stayed queued.
        queued_raids = [e for e in ws.queue if e.type == EventType.BANDIT_RAID]
        assert len(queued_raids) == 2

    def test_caps_per_type_independent(self) -> None:
        sstate = _make_state_for()
        ws = WorldEventState()
        enqueue_event(ws, EventType.BANDIT_RAID)
        enqueue_event(ws, EventType.TRADE_CARAVAN)
        enqueue_event(ws, EventType.ANIMAL_MIGRATION)
        sys = WorldEventSystem()
        sys.tick(dt=0.5, state=ws, scenario=sstate, weather=WeatherState())
        types_active = {e.type for e in ws.active}
        assert EventType.BANDIT_RAID in types_active
        assert EventType.TRADE_CARAVAN in types_active
        assert EventType.ANIMAL_MIGRATION in types_active


class TestBanditRaid:
    def test_raid_targets_scenario_zone(self) -> None:
        # Mirrors JS "bandit raid targets scenario-specific zones".
        for name in ("temperate_plains", "fortified_basin", "archipelago_isles"):
            sstate = _make_state_for(name, seed=1337)
            ws = WorldEventState()
            enqueue_event(ws, EventType.BANDIT_RAID, intensity=1.0)
            sys = WorldEventSystem()
            sys.tick(
                dt=0.5,
                state=ws,
                scenario=sstate,
                weather=WeatherState(type=Weather.STORM),
                rng=SeededRng(seed=1337).derive("events"),
            )
            raids = [e for e in ws.active if e.type == EventType.BANDIT_RAID]
            assert len(raids) == 1, f"expected one active raid on {name}"
            raid = raids[0]
            assert raid.status == "active"
            assert isinstance(raid.payload.get("targetLabel"), str)
            assert raid.payload.get("targetTile") is not None
            assert float(raid.payload.get("pressure", 0)) > 0.4
            assert isinstance(raid.payload.get("severity"), str)
            assert raid.payload.get("impactTile") is not None

    def test_storm_raises_pressure(self) -> None:
        sstate = _make_state_for()
        ws_clear = WorldEventState()
        ws_storm = WorldEventState()
        enqueue_event(ws_clear, EventType.BANDIT_RAID, intensity=1.0)
        enqueue_event(ws_storm, EventType.BANDIT_RAID, intensity=1.0)
        sys = WorldEventSystem()
        sys.tick(
            dt=0.5,
            state=ws_clear,
            scenario=sstate,
            weather=WeatherState(type=Weather.CLEAR),
            rng=SeededRng(seed=1).derive("events"),
        )
        sys.tick(
            dt=0.5,
            state=ws_storm,
            scenario=sstate,
            weather=WeatherState(type=Weather.STORM),
            rng=SeededRng(seed=1).derive("events"),
        )
        p_clear = float(ws_clear.active[0].payload["pressure"])
        p_storm = float(ws_storm.active[0].payload["pressure"])
        assert p_storm > p_clear


class TestAnimalMigration:
    def test_migration_writes_target_on_herbivores(self) -> None:
        # Mirrors JS "animal migration writes a spatial migration target
        # for herbivores".
        sstate = _make_state_for()
        ws = WorldEventState()
        enqueue_event(ws, EventType.ANIMAL_MIGRATION, intensity=1.0)
        herbivores: list[dict] = [
            {"id": "h1", "kind": "HERBIVORE"},
            {"id": "h2", "kind": "HERBIVORE"},
        ]
        sys = WorldEventSystem()
        sys.tick(
            dt=0.5,
            state=ws,
            scenario=sstate,
            weather=WeatherState(),
            herbivores=herbivores,
            rng=SeededRng(seed=1).derive("events"),
        )
        for h in herbivores:
            assert "memory" in h
            target = h["memory"]["migration_target"]
            assert isinstance(target, tuple)
            assert len(target) == 2
            assert h["debug"]["last_migration_pressure"] > 0


class TestTradeCaravan:
    def test_reward_drops_under_storm(self) -> None:
        # Mirrors JS "trade caravan reward drops when depot lane is
        # weather-contested".
        sstate = _make_state_for()
        sys = WorldEventSystem()

        ws_clear = WorldEventState()
        enqueue_event(ws_clear, EventType.TRADE_CARAVAN, intensity=1.0)
        sys.tick(
            dt=0.5,
            state=ws_clear,
            scenario=sstate,
            weather=WeatherState(type=Weather.CLEAR),
        )
        clear_reward = float(ws_clear.active[0].payload["rewardMultiplier"])

        ws_storm = WorldEventState()
        enqueue_event(ws_storm, EventType.TRADE_CARAVAN, intensity=1.0)
        sys.tick(
            dt=0.5,
            state=ws_storm,
            scenario=sstate,
            weather=WeatherState(type=Weather.STORM),
        )
        storm_reward = float(ws_storm.active[0].payload["rewardMultiplier"])
        storm_overlap = int(ws_storm.active[0].payload.get("hazardOverlapTiles", 0))

        assert clear_reward > storm_reward
        assert storm_overlap > 0


class TestPressureRehydration:
    def test_overlap_pressure_does_not_compound(self) -> None:
        # Mirrors JS "overlapping event pressure is rehydrated from base
        # instead of compounding across ticks".
        sstate = _make_state_for()
        # Construct two events that already share a target tile, both
        # already active so the per-tick rehydration is the only thing
        # under test.
        target = sstate.anchors["eastDepot"]
        evt_a = WorldEvent(
            id="event-a",
            type=EventType.TRADE_CARAVAN,
            status="active",
            elapsed_sec=1.0,
            duration_sec=20.0,
            intensity=1.0,
            payload={
                "targetTile": target,
                "targetTiles": [target],
                "targetKind": "depot",
                "targetRefId": "east-depot",
            },
        )
        evt_b = WorldEvent(
            id="event-b",
            type=EventType.TRADE_CARAVAN,
            status="active",
            elapsed_sec=1.0,
            duration_sec=20.0,
            intensity=1.0,
            payload={
                "targetTile": target,
                "targetTiles": [target],
                "targetKind": "depot",
                "targetRefId": "east-depot",
            },
        )
        ws = WorldEventState(active=[evt_a, evt_b])
        sys = WorldEventSystem()
        sys.tick(
            dt=0.1, state=ws, scenario=sstate, weather=WeatherState()
        )
        first_reward = float(evt_a.payload["rewardMultiplier"])
        first_base = float(evt_a.payload["baseRewardMultiplier"])

        sys.tick(
            dt=0.1, state=ws, scenario=sstate, weather=WeatherState()
        )
        second_reward = float(evt_a.payload["rewardMultiplier"])
        second_base = float(evt_a.payload["baseRewardMultiplier"])

        # Overlap penalty applied → reward < base.
        assert first_reward < first_base
        # Base reward stable across ticks (no compounding).
        assert second_base == first_base
        # And the effective reward must also stay stable (no compounding).
        assert second_reward == first_reward


class TestEnqueueHelper:
    def test_enqueue_appends_and_returns_event(self) -> None:
        ws = WorldEventState()
        evt = enqueue_event(ws, EventType.BANDIT_RAID, intensity=2.0)
        assert evt.id == "event-1"
        assert evt.type == EventType.BANDIT_RAID
        assert evt.intensity == 2.0
        assert ws.queue == [evt]

    def test_enqueue_assigns_unique_ids(self) -> None:
        ws = WorldEventState()
        a = enqueue_event(ws, EventType.BANDIT_RAID)
        b = enqueue_event(ws, EventType.BANDIT_RAID)
        assert a.id != b.id
