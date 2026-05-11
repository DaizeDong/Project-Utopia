"""Tests for the mortality death trigger + recovery grace window."""

from __future__ import annotations

from project_utopia.simulation.lifecycle.mortality_system import (
    RECOVERY_GRACE_SEC,
    MortalitySystem,
    death_threshold_for,
)


def _make_worker(
    hunger: float = 0.0,
    starvation_sec: float = 0.0,
    alive: bool = True,
    name: str = "w1",
) -> dict:
    return {
        "id": name,
        "displayName": name,
        "type": "WORKER",
        "alive": alive,
        "hunger": hunger,
        "starvationSec": starvation_sec,
        "carry": {"food": 0.0, "wood": 0.0, "stone": 0.0, "herbs": 0.0},
    }


def _base_state(time_sec: float = 0.0) -> dict:
    return {
        "agents": [],
        "metrics": {"timeSec": time_sec, "deathsTotal": 0, "deathsByReason": {}, "deathsByGroup": {}},
        "resources": {"food": 0.0, "wood": 0.0, "stone": 0.0, "herbs": 0.0},
    }


class TestDeathTrigger:
    def test_worker_dies_when_hunger_held_below_threshold(self) -> None:
        state = _base_state()
        w = _make_worker(hunger=0.01, starvation_sec=34.0)
        state["agents"] = [w]
        MortalitySystem().update(0.5, state)
        assert w["alive"] is False
        assert state["metrics"]["deathsTotal"] == 1
        assert state["metrics"]["deathsByReason"]["starvation"] == 1

    def test_worker_stays_alive_above_threshold(self) -> None:
        state = _base_state()
        w = _make_worker(hunger=0.5)
        state["agents"] = [w]
        MortalitySystem().update(0.5, state)
        assert w["alive"] is True
        assert state["metrics"]["deathsTotal"] == 0

    def test_carry_refunded_on_death(self) -> None:
        state = _base_state()
        w = _make_worker(hunger=0.0, starvation_sec=40.0)
        w["carry"] = {"food": 3.0, "wood": 2.0, "stone": 1.0, "herbs": 0.0}
        state["agents"] = [w]
        state["resources"] = {"food": 10.0, "wood": 5.0, "stone": 0.0, "herbs": 0.0}
        MortalitySystem().update(0.5, state)
        assert state["resources"]["food"] == 13.0
        assert state["resources"]["wood"] == 7.0
        assert state["resources"]["stone"] == 1.0


class TestRecoveryGrace:
    def test_grace_suppresses_death_within_window(self) -> None:
        state = _base_state(time_sec=100.0)
        state["ai"] = {
            "recovery_mode": True,
            "recovery_entered_sec": 100.0 - RECOVERY_GRACE_SEC + 5.0,
        }
        w = _make_worker(hunger=0.0, starvation_sec=40.0)
        state["agents"] = [w]
        MortalitySystem().update(0.5, state)
        # Within grace window — worker stays alive.
        assert w["alive"] is True
        assert state["metrics"]["deathsTotal"] == 0

    def test_grace_expires_and_death_fires(self) -> None:
        state = _base_state(time_sec=200.0)
        # Recovery was entered 200s ago — grace (30s) has long since expired.
        state["ai"] = {
            "recovery_mode": True,
            "recovery_entered_sec": 0.0,
        }
        w = _make_worker(hunger=0.0, starvation_sec=40.0)
        state["agents"] = [w]
        MortalitySystem().update(0.5, state)
        assert w["alive"] is False

    def test_no_grace_when_recovery_mode_off(self) -> None:
        state = _base_state(time_sec=100.0)
        # recovery_mode missing/False → no grace.
        w = _make_worker(hunger=0.0, starvation_sec=40.0)
        state["agents"] = [w]
        MortalitySystem().update(0.5, state)
        assert w["alive"] is False


class TestDeathThreshold:
    def test_worker_threshold(self) -> None:
        h, hold = death_threshold_for({"type": "WORKER"})
        assert h == 0.045
        assert hold == 34.0

    def test_visitor_threshold(self) -> None:
        h, _ = death_threshold_for({"type": "VISITOR"})
        assert h == 0.04

    def test_herbivore_threshold(self) -> None:
        h, _ = death_threshold_for({"type": "ANIMAL", "kind": "HERBIVORE"})
        assert h == 0.035

    def test_default_threshold(self) -> None:
        h, _ = death_threshold_for({"type": "UNKNOWN"})
        assert h == 0.03
