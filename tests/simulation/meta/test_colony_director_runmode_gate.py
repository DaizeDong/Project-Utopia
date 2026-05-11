"""Verifies the D5 ``run_mode`` gate.

Parallels JS ``test/run-mode-gate.test.js``: when
``state["ai"]["run_mode"] == "llm"`` the scripted ``ColonyDirectorSystem``
MUST early-return and not write into ``state["ai"]["colony_director"]``.
"""

from __future__ import annotations

from project_utopia.simulation.meta.colony_director_system import (
    DEFAULT_RUN_MODE,
    ColonyDirectorSystem,
    assess_colony_needs,
)


def _base_state(run_mode: str | None = DEFAULT_RUN_MODE) -> dict:
    return {
        "session": {"phase": "active"},
        "ai": {"run_mode": run_mode} if run_mode is not None else {},
        "metrics": {"timeSec": 100.0},
        "resources": {"food": 50.0, "wood": 30.0},
        "buildings": {"farms": 2, "lumbers": 1, "warehouses": 1},
    }


class TestRunModeGate:
    def test_llm_mode_short_circuits(self) -> None:
        state = _base_state(run_mode="llm")
        sys = ColonyDirectorSystem()
        sys.update(0.5, state)
        # The early-return must NOT have created the colony_director scratchpad.
        assert "colony_director" not in state["ai"]

    def test_fallback_mode_runs(self) -> None:
        state = _base_state(run_mode="fallback")
        sys = ColonyDirectorSystem()
        sys.update(0.5, state)
        assert "colony_director" in state["ai"]
        cd = state["ai"]["colony_director"]
        assert cd["phase"] == "bootstrap"
        # Bootstrap needs a warehouse (lifted to 70) and emergency-tier farm.
        types = {n["type"] for n in cd["needs"]}
        assert "farm" not in types or any(
            n["priority"] >= 70 for n in cd["needs"]
        )

    def test_default_run_mode_is_fallback(self) -> None:
        state = {"session": {"phase": "active"}, "metrics": {"timeSec": 100.0}, "buildings": {}}
        ColonyDirectorSystem().update(0.5, state)
        # The system itself defaults run_mode to "fallback".
        assert state["ai"]["run_mode"] == "fallback"

    def test_missing_ai_field_runs_legacy(self) -> None:
        state = _base_state(run_mode=None)
        ColonyDirectorSystem().update(0.5, state)
        assert "colony_director" in state["ai"]


class TestAssessColonyNeeds:
    def test_emergency_zero_farm_priority(self) -> None:
        state = {
            "buildings": {"farms": 0, "lumbers": 1, "warehouses": 1},
            "resources": {"food": 5.0, "wood": 30.0},
        }
        needs = assess_colony_needs(state)
        # Highest priority should be the zero-farm rail (99).
        assert needs[0]["type"] == "farm"
        assert needs[0]["priority"] == 99

    def test_recovery_mode_filters_to_essentials(self) -> None:
        state = {
            "buildings": {"farms": 1, "lumbers": 1, "warehouses": 1},
            "resources": {"food": 5.0, "wood": 5.0},
            "ai": {"recovery_mode": True},
        }
        needs = assess_colony_needs(state)
        # Only farm / lumber / warehouse / road may survive.
        assert all(
            n["type"] in {"farm", "lumber", "warehouse", "road"} for n in needs
        )

    def test_dedup_keeps_highest_priority(self) -> None:
        state = {
            "buildings": {"farms": 0, "warehouses": 0, "lumbers": 0},
            "resources": {"food": 5.0, "wood": 5.0},
        }
        needs = assess_colony_needs(state)
        seen = [n["type"] for n in needs]
        assert len(seen) == len(set(seen))
