"""Worker FSM driver (lean port of ``src/simulation/npc/WorkerAISystem.js``).

Only the **FSM core driver** is ported. The JS source carries ~400 LOC of
player-game flavor (chronicle events, intent-mismatch logging,
biome-specific harvest helpers, worker-vs-raider combat reward
bookkeeping, etc.) that the RC3 audit flagged as removable. None of
those paths exercise the substrate algorithms the academic benchmark
cares about; we drop them.

What stays:
- Priority-FSM dispatcher (one tick per worker per harness step).
- Group-policy → FSM-state translation via
  :func:`apply_group_policy` (re-exported here for the harness).
- Trigger evaluation against a worker's blackboard / inventory.
"""

from __future__ import annotations

from typing import Any, Callable

from project_utopia.app.rng import SeededRng
from project_utopia.simulation.npc.worker_states import (
    DISPLAY_LABEL,
    POLICY_INTENT_TO_STATE,
    STATE_TRANSITIONS,
    GroupPolicy,
    TransitionEntry,
    WorkerState,
    apply_group_policy,
)

__all__ = ["WorkerAISystem", "evaluate_trigger", "default_triggers"]


# ---- trigger predicates -----------------------------------------------------


def _carry_full(worker: Any, _state: Any) -> bool:
    threshold = 2.5  # JS BALANCE.workerDeliverThreshold default
    carry = getattr(worker, "carry", None) or {}
    if isinstance(carry, dict):
        total = sum(float(v) for v in carry.values())
    else:
        total = (
            float(getattr(carry, "food", 0))
            + float(getattr(carry, "wood", 0))
            + float(getattr(carry, "stone", 0))
        )
    return total >= threshold * 2.0


def _carry_empty(worker: Any, _state: Any) -> bool:
    carry = getattr(worker, "carry", None) or {}
    if isinstance(carry, dict):
        return all(float(v) <= 0 for v in carry.values())
    return (
        float(getattr(carry, "food", 0)) <= 0
        and float(getattr(carry, "wood", 0)) <= 0
        and float(getattr(carry, "stone", 0)) <= 0
    )


def _should_deliver_carry(worker: Any, _state: Any) -> bool:
    carry = getattr(worker, "carry", None) or {}
    threshold = 2.5
    if isinstance(carry, dict):
        total = sum(float(v) for v in carry.values())
    else:
        total = (
            float(getattr(carry, "food", 0))
            + float(getattr(carry, "wood", 0))
            + float(getattr(carry, "stone", 0))
        )
    return total >= threshold


def _too_tired(worker: Any, _state: Any) -> bool:
    return float(getattr(worker, "rest", 1.0)) < 0.18


def _rest_recovered(worker: Any, _state: Any) -> bool:
    return float(getattr(worker, "rest", 0.0)) >= 0.85


def _fsm_target_null(worker: Any, _state: Any) -> bool:
    fsm = getattr(worker, "fsm", None) or {}
    if isinstance(fsm, dict):
        return fsm.get("target") is None
    return getattr(fsm, "target", None) is None


def _arrived_at_fsm_target(worker: Any, _state: Any) -> bool:
    blackboard = getattr(worker, "blackboard", None) or {}
    if isinstance(blackboard, dict):
        return bool(blackboard.get("arrived_at_target", False))
    return bool(getattr(blackboard, "arrived_at_target", False))


def _hostile_in_aggro_radius(worker: Any, state: Any) -> bool:
    """Read a flag the caller sets when a hostile is within aggro range."""
    blackboard = getattr(worker, "blackboard", None) or {}
    if isinstance(blackboard, dict):
        return bool(blackboard.get("hostile_in_aggro", False))
    return False


def _no_hostile_in_range(worker: Any, state: Any) -> bool:
    return not _hostile_in_aggro_radius(worker, state)


def _path_failed_recently(worker: Any, _state: Any) -> bool:
    blackboard = getattr(worker, "blackboard", None) or {}
    if isinstance(blackboard, dict):
        return bool(blackboard.get("path_failed_recently", False))
    return False


def _build_available_for_role(worker: Any, state: Any) -> bool:
    if getattr(worker, "role", None) != "BUILDER":
        return False
    sites = getattr(state, "construction_sites", None) if state is not None else None
    if sites is None and isinstance(state, dict):
        sites = state.get("construction_sites")
    return bool(sites)


def _harvest_available_for_role(worker: Any, _state: Any) -> bool:
    role = getattr(worker, "role", "")
    return role in ("FARM", "WOOD", "STONE", "HAUL")


def _always_false(_worker: Any, _state: Any) -> bool:
    return False


# Default trigger registry — the FSM driver looks up triggers by name.
def default_triggers() -> dict[str, Callable[[Any, Any], bool]]:
    """Return the default predicate registry used by :class:`WorkerAISystem`."""
    return {
        "hostile_in_aggro_radius": _hostile_in_aggro_radius,
        "no_hostile_in_range": _no_hostile_in_range,
        "too_tired": _too_tired,
        "rest_recovered": _rest_recovered,
        "should_deliver_carry": _should_deliver_carry,
        "carry_full": _carry_full,
        "carry_empty": _carry_empty,
        "arrived_at_fsm_target": _arrived_at_fsm_target,
        "fsm_target_null": _fsm_target_null,
        "fsm_target_gone": _fsm_target_null,
        "yield_pool_dried_up": _always_false,
        "yield_pool_empty_carry_empty": _carry_empty,
        "partial_carry_stuck_at_dried_yield": _always_false,
        "path_failed_recently": _path_failed_recently,
        "build_available_for_role": _build_available_for_role,
        "harvest_available_for_role": _harvest_available_for_role,
    }


def evaluate_trigger(
    triggers: dict[str, Callable[[Any, Any], bool]],
    name: str,
    worker: Any,
    state: Any,
) -> bool:
    """Look up ``name`` in ``triggers`` and evaluate; missing → ``False``."""
    fn = triggers.get(name)
    if fn is None:
        return False
    try:
        return bool(fn(worker, state))
    except Exception:  # pragma: no cover - defensive
        return False


# ---- driver -----------------------------------------------------------------


class WorkerAISystem:
    """Per-tick worker FSM dispatcher.

    Parameters
    ----------
    rng
        Seeded RNG used to sample group-policy intents. The same rng
        passed across ticks produces a reproducible state trajectory.
    triggers
        Optional override for the trigger predicate registry. Defaults
        to :func:`default_triggers`.
    """

    __slots__ = ("name", "rng", "triggers", "stats")

    def __init__(
        self,
        rng: SeededRng,
        *,
        triggers: dict[str, Callable[[Any, Any], bool]] | None = None,
    ) -> None:
        self.name = "WorkerAISystem"
        self.rng = rng
        self.triggers = triggers or default_triggers()
        self.stats: dict[str, int] = {
            "ticks": 0,
            "transitions": 0,
            "policy_applies": 0,
        }

    # ---- core tick ------------------------------------------------------

    def tick_worker(
        self,
        worker: Any,
        state: Any,
        *,
        group_policy: GroupPolicy | None = None,
    ) -> WorkerState:
        """Run one FSM dispatcher pass for ``worker``.

        Returns the worker's current state after the pass. The driver:

        1. If the worker has no FSM, picks an initial state via
           :func:`apply_group_policy` (or IDLE when no policy is given).
        2. Walks the priority-sorted transitions for the current state,
           firing the first whose trigger evaluates to ``True``.
        3. Writes ``worker.state_label`` for downstream telemetry.
        """
        self.stats["ticks"] += 1

        # Workers may be either dataclass objects (slotted) or dict
        # snapshots (the SimHarness path stores ``asdict(Worker)`` in
        # ``state["agents"]``). Both shapes are supported by reading
        # via ``getattr`` (slotted) or ``__getitem__`` (dict) and
        # writing via the same paths.
        is_dict = isinstance(worker, dict)
        if is_dict:
            fsm = worker.get("fsm")
        else:
            fsm = getattr(worker, "fsm", None)
        if fsm is None or (isinstance(fsm, dict) and not fsm):
            initial = (
                apply_group_policy(worker, group_policy, self.rng)
                if group_policy is not None
                else WorkerState.IDLE
            )
            fsm = {"state": initial, "entered_at_sec": 0.0, "target": None, "payload": None}
            if is_dict:
                worker["fsm"] = fsm
            else:
                setattr(worker, "fsm", fsm)
            if group_policy is not None:
                self.stats["policy_applies"] += 1

        current = _get_fsm_state(fsm)
        transitions: tuple[TransitionEntry, ...] = STATE_TRANSITIONS.get(current, ())
        for entry in transitions:
            if evaluate_trigger(self.triggers, entry.trigger, worker, state):
                next_state = entry.to
                if next_state != current:
                    _set_fsm_state(fsm, next_state)
                    self.stats["transitions"] += 1
                break

        # Single-write of the display label.
        label = DISPLAY_LABEL.get(_get_fsm_state(fsm))
        if label is not None:
            if is_dict:
                worker["state_label"] = label
            else:
                try:
                    setattr(worker, "state_label", label)
                except AttributeError:
                    pass

        return _get_fsm_state(fsm)

    def update(
        self,
        workers: list[Any],
        state: Any,
        *,
        group_policy: GroupPolicy | None = None,
    ) -> None:
        """Tick every alive worker. Convenience wrapper around
        :meth:`tick_worker`."""
        for worker in workers:
            if getattr(worker, "alive", True) is False:
                continue
            self.tick_worker(worker, state, group_policy=group_policy)


# ---- FSM struct accessors --------------------------------------------------


def _get_fsm_state(fsm: Any) -> WorkerState:
    if isinstance(fsm, dict):
        value = fsm.get("state")
    else:
        value = getattr(fsm, "state", None)
    if isinstance(value, WorkerState):
        return value
    if isinstance(value, str):
        try:
            return WorkerState(value)
        except ValueError:
            return WorkerState.IDLE
    return WorkerState.IDLE


def _set_fsm_state(fsm: Any, new_state: WorkerState) -> None:
    if isinstance(fsm, dict):
        fsm["state"] = new_state
        fsm["target"] = None
        fsm["payload"] = None
    else:
        setattr(fsm, "state", new_state)
        setattr(fsm, "target", None)
        setattr(fsm, "payload", None)
