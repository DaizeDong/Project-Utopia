"""Verifies the event director respects cadence + raid-cooldown gates."""

from __future__ import annotations

from project_utopia.app.rng import SeededRng
from project_utopia.simulation.meta.event_director_system import EventDirectorSystem
from project_utopia.world.events import EventType, WorldEventState


class _FakeServices:
    def __init__(self, seed: int = 42) -> None:
        self.rng = SeededRng(seed=seed)


def _make_state(time_sec: float = 0.0, tick: int = 0) -> dict:
    return {
        "metrics": {"timeSec": time_sec, "tick": tick},
        "events": WorldEventState(),
        "gameplay": {},
        "buildings": {"farms": 5},  # past the bootstrap window
    }


class TestEventDispatchCadence:
    def test_first_tick_anchors_dispatch(self) -> None:
        state = _make_state(time_sec=0.0)
        sys = EventDirectorSystem()
        sys.update(0.5, state, _FakeServices())
        # First call only anchors `last_dispatch_sec`; no event dispatched yet.
        director = state["gameplay"]["event_director"]
        assert director["day_budget"] == 0
        assert len(state["events"].queue) == 0

    def test_dispatch_after_interval(self) -> None:
        state = _make_state(time_sec=0.0)
        sys = EventDirectorSystem()
        services = _FakeServices()
        sys.update(0.5, state, services)
        # Advance past the (post-anchor) interval.
        state["metrics"]["timeSec"] = 200.0
        sys.update(0.5, state, services)
        assert state["gameplay"]["event_director"]["day_budget"] == 1
        assert len(state["events"].queue) == 1

    def test_raid_cooldown_downgrade(self) -> None:
        """When the bandit-raid weight dominates AND raid cooldown is active,
        the director should pick a non-raid event."""
        state = _make_state(time_sec=0.0, tick=500)
        # Force raid cooldown ON by claiming we just raided.
        state["gameplay"]["last_raid_tick"] = 500
        state["gameplay"]["raid_escalation"] = {"interval_ticks": 3600}
        sys = EventDirectorSystem(
            balance={
                **EventDirectorSystem().balance,
                "weights": {
                    EventType.BANDIT_RAID: 1.0,
                    EventType.ANIMAL_MIGRATION: 0.01,
                    EventType.TRADE_CARAVAN: 0.0,
                    EventType.DISEASE_OUTBREAK: 0.0,
                    EventType.WILDFIRE: 0.0,
                },
            }
        )
        services = _FakeServices()
        sys.update(0.5, state, services)
        state["metrics"]["timeSec"] = 200.0
        sys.update(0.5, state, services)
        assert len(state["events"].queue) == 1
        chosen = state["events"].queue[0].type
        # Either the raid was downgraded, or the test setup didn't trigger.
        # Cooldown is active (current_tick - last_raid_tick = 0 < 3600).
        assert chosen != EventType.BANDIT_RAID

    def test_deterministic_with_same_seed(self) -> None:
        state_a = _make_state(time_sec=0.0)
        state_b = _make_state(time_sec=0.0)
        sys = EventDirectorSystem()
        sa, sb = _FakeServices(seed=2026), _FakeServices(seed=2026)
        sys.update(0.5, state_a, sa)
        sys.update(0.5, state_b, sb)
        state_a["metrics"]["timeSec"] = 200.0
        state_b["metrics"]["timeSec"] = 200.0
        sys.update(0.5, state_a, sa)
        sys.update(0.5, state_b, sb)
        assert state_a["events"].queue[0].type == state_b["events"].queue[0].type
