"""Run-outcome evaluator (port of ``src/app/runOutcome.js``).

Survival-mode runs end on one of:

* Colony wipe (no surviving ``WORKER`` agents).
* Both staple resources exhausted with no carry-in-transit grace.
* Low prosperity + extreme threat after the loss-grace period.

The JS module imports balance constants from ``src/config/balance.js``.
That config will be ported by a different subagent — until then, this
module reads from a tiny inline fallback dict so the port works
standalone. The fallback values mirror the JS defaults exactly.
"""

from __future__ import annotations

import math
from typing import Any

__all__ = [
    "derive_dev_tier",
    "evaluate_run_outcome_state",
    "maybe_record_famine_chronicle",
]


# Inline mirror of the two balance.js keys this module touches. Replace with
# ``from project_utopia.config.balance import BALANCE`` once that subagent
# lands.
_BALANCE_DEFAULTS: dict[str, float] = {
    "resourceCollapseCarryGrace": 0.5,
    "lossGracePeriodSec": 90.0,
}


def _balance(key: str) -> float:
    """Read a balance constant from the (future) config module with fallback."""
    try:
        from project_utopia.config.balance import BALANCE  # type: ignore[import-not-found]
    except (ImportError, ModuleNotFoundError):
        return _BALANCE_DEFAULTS[key]
    value = BALANCE.get(key, _BALANCE_DEFAULTS.get(key))
    return float(value if value is not None else _BALANCE_DEFAULTS[key])


def derive_dev_tier(dev_index: Any) -> str:
    """Bucket a numeric dev-index into one of ``low|mid|high|elite``."""
    try:
        v = float(dev_index)
    except (TypeError, ValueError):
        return "low"
    if not math.isfinite(v):
        return "low"
    if v < 25:
        return "low"
    if v < 50:
        return "mid"
    if v < 75:
        return "high"
    return "elite"


def _safe_number(value: Any, fallback: float = 0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    return n if math.isfinite(n) else fallback


def _count_surviving_workers(state: dict[str, Any]) -> int:
    metrics = state.get("metrics") or {}
    pop = metrics.get("populationStats") or {}
    if "workers" in pop:
        return int(_safe_number(pop["workers"], 0))
    agents = state.get("agents") or []
    return sum(
        1
        for a in agents
        if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive") is not False
    )


def evaluate_run_outcome_state(state: dict[str, Any]) -> dict[str, Any] | None:
    """Return a loss-outcome dict if the run has ended, else ``None``.

    Outcomes are one of ``{ "outcome": "loss", ... } | None``. Callers
    treat ``None`` as "in progress" → ``session.outcome == "none"``.
    """
    workers = _count_surviving_workers(state)
    gameplay = state.get("gameplay") or {}

    if workers <= 0:
        return {
            "outcome": "loss",
            "reason": "Colony wiped — no surviving colonists.",
            "actionMessage": "Run ended: the colony was wiped out.",
            "actionKind": "error",
            "devTier": derive_dev_tier(gameplay.get("devIndex")),
        }

    resources = state.get("resources") or {}
    metrics = state.get("metrics") or {}
    logistics = metrics.get("logistics") or {}

    food = _safe_number(resources.get("food"))
    wood = _safe_number(resources.get("wood"))
    prosperity = _safe_number(gameplay.get("prosperity"))
    threat = _safe_number(gameplay.get("threat"))
    carry_in_transit = _safe_number(logistics.get("totalCarryInTransit"))
    carrying_workers = _safe_number(logistics.get("carryingWorkers"))
    sim_time = _safe_number(metrics.get("simTimeSec"))

    reason = ""
    if (
        food <= 0
        and wood <= 0
        and carrying_workers <= 0
        and carry_in_transit <= _balance("resourceCollapseCarryGrace")
    ):
        reason = "Both food and wood reached zero with no supply still in transit."
    elif sim_time >= _balance("lossGracePeriodSec") and prosperity <= 8 and threat >= 92:
        reason = "Colony collapsed under low prosperity and extreme threat."

    if not reason:
        return None

    return {
        "outcome": "loss",
        "reason": reason,
        "actionMessage": f"Run ended: {reason}",
        "actionKind": "error",
        "devTier": derive_dev_tier(gameplay.get("devIndex")),
    }


def maybe_record_famine_chronicle(state: dict[str, Any]) -> bool:
    """Prepend a famine chronicle entry when starvation dominates the deaths.

    Idempotent via the ``"Famine —"`` head-prefix check; repeated calls do
    not multiply the entry. Returns ``True`` when an entry was added.
    """
    try:
        metrics = state.get("metrics") or {}
        reasons = metrics.get("deathsByReason") or {}
        starvation_deaths = _safe_number(reasons.get("starvation"))
        total_deaths = _safe_number(metrics.get("deathsTotal"))
        if total_deaths < 1 or starvation_deaths < 0.5 * total_deaths:
            return False
        gameplay = state.setdefault("gameplay", {})
        log = gameplay.get("objectiveLog")
        if not isinstance(log, list):
            log = []
            gameplay["objectiveLog"] = log
        head = str(log[0]) if log else ""
        if "Famine —" in head:
            return False
        t = f"{_safe_number(metrics.get('timeSec')):.1f}"
        log.insert(
            0,
            (
                f"[{t}s] Famine — every colonist hungry, no reserves "
                f"({int(starvation_deaths)}/{int(total_deaths)} deaths from starvation)."
            ),
        )
        gameplay["objectiveLog"] = log[:24]
        return True
    except Exception:  # pragma: no cover - defensive, matches JS try/catch
        return False
