"""Worker FSM definitions (port of ``src/simulation/npc/fsm/WorkerStates.js`` +
``WorkerTransitions.js``).

Phase 1 only ports the *definitions*: the state enum, the priority-ordered
transition table, the display labels, and the policy-intent → state map.
Per-state ``onEnter`` / ``tick`` / ``onExit`` *behaviours* live in
:mod:`project_utopia.simulation.npc.worker_ai_system`, where they call into
the navigation / construction substrates.

The benchmark harness uses
:func:`apply_group_policy` to translate channel directives
(``intent_weights``) into a concrete FSM state for each worker on every
group-policy refresh. The translation is deterministic: a fixed seed
produces a fixed state, because the weighted sample uses the seeded RNG
passed in.
"""

from __future__ import annotations

import enum
from types import MappingProxyType
from typing import Any, Callable

from project_utopia.app.rng import SeededRng

__all__ = [
    "WorkerState",
    "Trigger",
    "STATE_TRANSITIONS",
    "POLICY_INTENT_TO_STATE",
    "DISPLAY_LABEL",
    "GroupPolicy",
    "apply_group_policy",
    "TransitionEntry",
]


# ---- enums ------------------------------------------------------------------


class WorkerState(str, enum.Enum):
    """10-entry FSM (post-Round-1 simplification: dropped processing chain)."""

    IDLE = "IDLE"
    SEEKING_REST = "SEEKING_REST"
    RESTING = "RESTING"
    FIGHTING = "FIGHTING"
    SEEKING_HARVEST = "SEEKING_HARVEST"
    HARVESTING = "HARVESTING"
    DELIVERING = "DELIVERING"
    DEPOSITING = "DEPOSITING"
    SEEKING_BUILD = "SEEKING_BUILD"
    BUILDING = "BUILDING"


# A "trigger" is a stringly-typed predicate name (e.g. ``"carry_full"``).
# Behaviour bodies in :mod:`worker_ai_system` evaluate triggers against the
# live worker+state pair.
Trigger = str


# ---- display labels ---------------------------------------------------------

DISPLAY_LABEL: MappingProxyType[WorkerState, str] = MappingProxyType(
    {
        WorkerState.IDLE: "Wander",
        WorkerState.SEEKING_REST: "Seek Rest",
        WorkerState.RESTING: "Rest",
        WorkerState.FIGHTING: "Engage",
        WorkerState.SEEKING_HARVEST: "Seek Task",
        WorkerState.HARVESTING: "Harvest",
        WorkerState.DELIVERING: "Deliver",
        WorkerState.DEPOSITING: "Deliver",
        WorkerState.SEEKING_BUILD: "Seek Construct",
        WorkerState.BUILDING: "Construct",
    }
)


# ---- transition table -------------------------------------------------------


class TransitionEntry(tuple):
    """Lightweight ``(priority, trigger, to)`` transition record.

    Stored as tuples so the table is hashable / cheap to compare. Lower
    priority wins (dispatcher walks ascending).
    """

    __slots__ = ()

    def __new__(cls, priority: int, trigger: Trigger, to: WorkerState) -> "TransitionEntry":
        return tuple.__new__(cls, (int(priority), str(trigger), to))

    @property
    def priority(self) -> int:
        return int(self[0])

    @property
    def trigger(self) -> Trigger:
        return str(self[1])

    @property
    def to(self) -> WorkerState:
        return self[2]


# Each list MUST be sorted by ascending priority; the dispatcher honours
# array order and returns the first matching transition.
STATE_TRANSITIONS: MappingProxyType[WorkerState, tuple[TransitionEntry, ...]] = MappingProxyType(
    {
        WorkerState.IDLE: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(2, "too_tired", WorkerState.SEEKING_REST),
            TransitionEntry(3, "should_deliver_carry", WorkerState.DELIVERING),
            TransitionEntry(4, "build_available_for_role", WorkerState.SEEKING_BUILD),
            TransitionEntry(5, "harvest_available_for_role", WorkerState.SEEKING_HARVEST),
        ),
        WorkerState.SEEKING_REST: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(3, "arrived_at_fsm_target", WorkerState.RESTING),
        ),
        WorkerState.RESTING: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(2, "rest_recovered", WorkerState.IDLE),
        ),
        WorkerState.FIGHTING: (
            TransitionEntry(0, "no_hostile_in_range", WorkerState.IDLE),
        ),
        WorkerState.SEEKING_HARVEST: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(2, "too_tired", WorkerState.SEEKING_REST),
            TransitionEntry(3, "arrived_at_fsm_target", WorkerState.HARVESTING),
            TransitionEntry(7, "fsm_target_null", WorkerState.IDLE),
            TransitionEntry(8, "yield_pool_dried_up", WorkerState.IDLE),
            TransitionEntry(9, "path_failed_recently", WorkerState.IDLE),
        ),
        WorkerState.HARVESTING: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(2, "too_tired", WorkerState.SEEKING_REST),
            TransitionEntry(5, "carry_full", WorkerState.DELIVERING),
            TransitionEntry(6, "partial_carry_stuck_at_dried_yield", WorkerState.DELIVERING),
            TransitionEntry(8, "yield_pool_empty_carry_empty", WorkerState.IDLE),
        ),
        WorkerState.DELIVERING: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(3, "arrived_at_fsm_target", WorkerState.DEPOSITING),
            TransitionEntry(7, "fsm_target_null", WorkerState.IDLE),
            TransitionEntry(9, "path_failed_recently", WorkerState.IDLE),
        ),
        WorkerState.DEPOSITING: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(1, "carry_empty", WorkerState.IDLE),
        ),
        WorkerState.SEEKING_BUILD: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(2, "too_tired", WorkerState.SEEKING_REST),
            TransitionEntry(3, "arrived_at_fsm_target", WorkerState.BUILDING),
            TransitionEntry(7, "fsm_target_null", WorkerState.IDLE),
            TransitionEntry(8, "fsm_target_gone", WorkerState.IDLE),
            TransitionEntry(9, "path_failed_recently", WorkerState.IDLE),
        ),
        WorkerState.BUILDING: (
            TransitionEntry(0, "hostile_in_aggro_radius", WorkerState.FIGHTING),
            TransitionEntry(5, "fsm_target_gone", WorkerState.IDLE),
        ),
    }
)


# ---- intent → state ---------------------------------------------------------

# Channel directives carry an ``intent_weights`` dict like
# ``{"harvest": 0.7, "rest": 0.3}``. This table maps each intent string
# to the FSM seeking-state it implies.
POLICY_INTENT_TO_STATE: MappingProxyType[str, WorkerState] = MappingProxyType(
    {
        "wander": WorkerState.IDLE,
        "rest": WorkerState.SEEKING_REST,
        "fight": WorkerState.FIGHTING,
        "harvest": WorkerState.SEEKING_HARVEST,
        "deliver": WorkerState.DELIVERING,
        "build": WorkerState.SEEKING_BUILD,
    }
)


# ---- group policy → state sampler ------------------------------------------


class GroupPolicy:
    """Lightweight container for ``intent_weights`` + ``risk_tolerance``.

    Mirrors the shape produced by the ``npc-policy`` channel. Only the
    fields we consume in :func:`apply_group_policy` are stored.
    """

    __slots__ = ("intent_weights", "target_priorities", "risk_tolerance", "ttl_sec")

    def __init__(
        self,
        *,
        intent_weights: dict[str, float] | None = None,
        target_priorities: dict[str, float] | None = None,
        risk_tolerance: float = 0.5,
        ttl_sec: float = 0.0,
    ) -> None:
        self.intent_weights: dict[str, float] = dict(intent_weights or {})
        self.target_priorities: dict[str, float] = dict(target_priorities or {})
        self.risk_tolerance: float = float(risk_tolerance)
        self.ttl_sec: float = float(ttl_sec)


def apply_group_policy(
    worker: Any,
    group_policy: GroupPolicy,
    rng: SeededRng,
    *,
    fallback: WorkerState = WorkerState.IDLE,
) -> WorkerState:
    """Pick the next FSM state by weighted sample of ``intent_weights``.

    Determinism contract: same ``rng`` state + same ``group_policy`` →
    same returned ``WorkerState``. The worker argument is currently used
    only to record the chosen intent on its blackboard (a Phase 2 hook
    consumed by the colony-agent prompt-payload builder).
    """
    weights = group_policy.intent_weights
    if not weights:
        if worker is not None:
            _record_intent(worker, fallback.value.lower())
        return fallback

    # Deterministic key order — sorting prevents dict-insertion-order
    # drift across runs / versions.
    keys = sorted(weights.keys())
    total = sum(max(0.0, float(weights[k])) for k in keys)
    if total <= 0.0:
        if worker is not None:
            _record_intent(worker, fallback.value.lower())
        return fallback

    pick = rng.next() * total
    cumulative = 0.0
    chosen_key = keys[-1]
    for k in keys:
        cumulative += max(0.0, float(weights[k]))
        if pick <= cumulative:
            chosen_key = k
            break

    chosen_state = POLICY_INTENT_TO_STATE.get(chosen_key, fallback)
    if worker is not None:
        _record_intent(worker, chosen_key)
    return chosen_state


def _record_intent(worker: Any, intent: str) -> None:
    """Stash the chosen intent on the worker for downstream telemetry."""
    blackboard = getattr(worker, "blackboard", None)
    if blackboard is None:
        blackboard = {}
        try:
            setattr(worker, "blackboard", blackboard)
        except AttributeError:
            return
    if isinstance(blackboard, dict):
        blackboard["intent"] = intent
