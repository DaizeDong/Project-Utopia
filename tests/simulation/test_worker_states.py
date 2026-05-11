"""Worker FSM transitions + group-policy sampler tests."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from project_utopia.app.rng import SeededRng
from project_utopia.simulation.npc.worker_ai_system import (
    WorkerAISystem,
    default_triggers,
)
from project_utopia.simulation.npc.worker_states import (
    DISPLAY_LABEL,
    GroupPolicy,
    STATE_TRANSITIONS,
    WorkerState,
    apply_group_policy,
)


@dataclass
class _Worker:
    """Bare-minimum worker shape for FSM-driver tests."""

    id: str = "w1"
    role: str = "FARM"
    alive: bool = True
    rest: float = 1.0
    carry: dict[str, float] = field(
        default_factory=lambda: {"food": 0.0, "wood": 0.0, "stone": 0.0, "herbs": 0.0}
    )
    blackboard: dict[str, Any] = field(default_factory=dict)
    fsm: dict[str, Any] = field(default_factory=dict)
    state_label: str = ""


def test_state_transition_table_well_formed() -> None:
    """Every transition list is sorted ascending by priority."""
    for state, entries in STATE_TRANSITIONS.items():
        priorities = [e.priority for e in entries]
        assert priorities == sorted(priorities), (
            f"State {state} transitions are not priority-sorted: {priorities}"
        )


def test_display_label_covers_every_state() -> None:
    """Each ``WorkerState`` value must have a display label."""
    for state in WorkerState:
        assert state in DISPLAY_LABEL


def test_apply_group_policy_deterministic_for_seed() -> None:
    """Same seed + same policy → same state across runs."""
    policy = GroupPolicy(
        intent_weights={"harvest": 0.7, "rest": 0.2, "deliver": 0.1},
    )
    rng1 = SeededRng(seed=42)
    rng2 = SeededRng(seed=42)
    s1 = apply_group_policy(_Worker(), policy, rng1)
    s2 = apply_group_policy(_Worker(), policy, rng2)
    assert s1 == s2


def test_apply_group_policy_picks_highest_weight_dominant() -> None:
    """A near-pointmass distribution lands on the dominant intent."""
    policy = GroupPolicy(intent_weights={"harvest": 100.0, "rest": 0.001})
    rng = SeededRng(seed=7)
    for _ in range(10):
        chosen = apply_group_policy(_Worker(), policy, rng)
        assert chosen == WorkerState.SEEKING_HARVEST


def test_apply_group_policy_records_intent_on_blackboard() -> None:
    """Selected intent is stashed on ``worker.blackboard.intent``."""
    worker = _Worker()
    policy = GroupPolicy(intent_weights={"harvest": 1.0})
    apply_group_policy(worker, policy, SeededRng(seed=1))
    assert worker.blackboard.get("intent") == "harvest"


def test_apply_group_policy_falls_back_on_empty_weights() -> None:
    """Empty weight dict → fallback state (IDLE)."""
    policy = GroupPolicy(intent_weights={})
    assert apply_group_policy(_Worker(), policy, SeededRng(seed=1)) == WorkerState.IDLE


def test_carry_full_triggers_delivering() -> None:
    """A HARVESTING worker with full carry transitions to DELIVERING."""
    worker = _Worker(role="FARM")
    worker.fsm = {
        "state": WorkerState.HARVESTING,
        "entered_at_sec": 0.0,
        "target": (1, 1),
        "payload": None,
    }
    # Above 2 × 2.5 = 5 → carry_full triggers.
    worker.carry = {"food": 6.0, "wood": 0.0, "stone": 0.0, "herbs": 0.0}

    system = WorkerAISystem(SeededRng(seed=1))
    next_state = system.tick_worker(worker, state=None)
    assert next_state == WorkerState.DELIVERING


def test_rest_recovered_returns_to_idle() -> None:
    """A RESTING worker whose rest >= 0.85 transitions to IDLE."""
    worker = _Worker(rest=0.9)
    worker.fsm = {
        "state": WorkerState.RESTING,
        "entered_at_sec": 0.0,
        "target": None,
        "payload": None,
    }
    system = WorkerAISystem(SeededRng(seed=1))
    next_state = system.tick_worker(worker, state=None)
    assert next_state == WorkerState.IDLE


def test_too_tired_in_idle_seeks_rest() -> None:
    """An IDLE worker with rest < 0.18 transitions to SEEKING_REST."""
    worker = _Worker(rest=0.1)
    system = WorkerAISystem(SeededRng(seed=1))
    next_state = system.tick_worker(worker, state=None)
    # IDLE → SEEKING_REST (too_tired wins over harvest_available_for_role)
    assert next_state == WorkerState.SEEKING_REST


def test_hostile_in_aggro_radius_preempts() -> None:
    """Hostile flag preempts every other transition."""
    worker = _Worker(rest=1.0)
    worker.blackboard["hostile_in_aggro"] = True
    system = WorkerAISystem(SeededRng(seed=1))
    next_state = system.tick_worker(worker, state=None)
    assert next_state == WorkerState.FIGHTING


def test_default_triggers_returns_full_registry() -> None:
    """The default trigger registry includes every name used by STATE_TRANSITIONS."""
    triggers = default_triggers()
    referenced = {entry.trigger for entries in STATE_TRANSITIONS.values() for entry in entries}
    missing = referenced - set(triggers)
    assert not missing, f"Triggers missing from default registry: {missing}"
