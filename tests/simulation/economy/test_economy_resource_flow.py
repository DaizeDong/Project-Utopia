"""Tests for the economy resource flow accumulator + system invariants."""

from __future__ import annotations

from project_utopia.simulation.economy.resource_system import (
    RESOURCE_FLOW_WINDOW_SEC,
    ResourceSystem,
    record_resource_flow,
)


def _base_state(food: float = 100.0, wood: float = 50.0) -> dict:
    return {
        "resources": {
            "food": food,
            "wood": wood,
            "stone": 0.0,
            "herbs": 0.0,
            "meals": 0.0,
            "medicine": 0.0,
            "tools": 0.0,
        },
        "metrics": {"timeSec": 0.0},
        "agents": [],
    }


class TestResourceFlowAccumulator:
    def test_produced_amount_accumulates(self) -> None:
        state = _base_state()
        record_resource_flow(state, "food", "produced", 5.0)
        record_resource_flow(state, "food", "produced", 3.0)
        accum = state["_resourceFlowAccum"]
        assert accum["food"]["produced"] == 8.0

    def test_negative_amounts_clamped(self) -> None:
        state = _base_state()
        record_resource_flow(state, "food", "produced", -10.0)
        # Negative amounts short-circuit (no-op) so the accumulator is not
        # eagerly initialised. Adding a follow-up positive should land at +5
        # (the prior -10 was clamped to 0 and never recorded).
        record_resource_flow(state, "food", "produced", 5.0)
        assert state["_resourceFlowAccum"]["food"]["produced"] == 5.0

    def test_unknown_resource_ignored(self) -> None:
        state = _base_state()
        record_resource_flow(state, "diamond", "produced", 100.0)  # type: ignore[arg-type]
        # Unknown resource short-circuits before the accum is initialised.
        # A subsequent valid emit still works.
        record_resource_flow(state, "food", "produced", 2.0)
        assert "diamond" not in state["_resourceFlowAccum"]
        assert state["_resourceFlowAccum"]["food"]["produced"] == 2.0


class TestResourceSystem:
    def test_clamps_invalid_resources_to_zero(self) -> None:
        state = _base_state()
        state["resources"]["food"] = float("nan")
        state["resources"]["wood"] = -50.0
        ResourceSystem().update(0.5, state)
        assert state["resources"]["food"] == 0.0
        assert state["resources"]["wood"] == 0.0

    def test_worker_food_drain_invariant(self) -> None:
        """Harvest + drop should conserve global counts:

        produced flow + consumed flow == net delta from system pass.
        """
        state = _base_state(food=100.0)
        state["agents"] = [
            {"type": "WORKER", "alive": True, "hunger": 0.5}
            for _ in range(4)
        ]
        sys = ResourceSystem()
        sys.update(1.0, state)  # 1s of game time
        consumed = state["_resourceFlowAccum"]["food"]["consumed"]
        # 4 workers × 0.03 food/sec × 1s = 0.12
        assert consumed == 0.12
        assert abs(state["resources"]["food"] - (100.0 - 0.12)) < 1e-9

    def test_flow_window_flushes(self) -> None:
        state = _base_state()
        record_resource_flow(state, "food", "produced", 10.0)
        sys = ResourceSystem()
        # Tick three times totaling >= window.
        for _ in range(int(RESOURCE_FLOW_WINDOW_SEC) + 1):
            sys.update(1.0, state)
        # Per-min metric should be (10.0 * 60 / window_sec) >= 200/min
        assert state["metrics"].get("foodProducedPerMin", 0.0) > 0.0

    def test_food_shortage_emits_event(self) -> None:
        from project_utopia.simulation.meta.game_event_bus import get_event_log

        state = _base_state(food=5.0)
        sys = ResourceSystem()
        sys.update(0.5, state)
        types = [e["type"] for e in get_event_log(state)]
        assert "food_shortage" in types

    def test_record_flow_then_resource_system_preserves_accum(self) -> None:
        """recordResourceFlow before the system tick MUST persist through
        the per-tick guards (resource init must not clobber emitter writes)."""
        state = _base_state()
        record_resource_flow(state, "food", "produced", 7.0)
        # ResourceSystem now runs.
        ResourceSystem().update(0.1, state)
        # The 7.0 produced is still in the accumulator (window not flushed yet).
        assert state["_resourceFlowAccum"]["food"]["produced"] == 7.0
