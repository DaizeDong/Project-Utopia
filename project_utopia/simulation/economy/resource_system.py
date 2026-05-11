"""Resource flow accounting (trim port of ``ResourceSystem.js``).

The JS source is 767 LOC of intermingled responsibilities:

* per-resource clamp + non-finite fix-up
* warehouse food spoilage
* worker food drain
* shortage / surplus emit
* logistics distance metrics
* food-crisis detector
* objective regression detector
* per-tile production telemetry
* per-3s flow accumulator + per-min projection

For the academic benchmark we keep the **invariants** (clamp + flow
accumulator + emit) and drop the player-facing logistics distance + crisis
detectors. Workers' food drain is preserved because it's load-bearing for
mortality.

Public API:

* :class:`ResourceSystem` — tick this every fixed step.
* :func:`record_resource_flow` — true-source emitter called by other systems
  (kitchen produced, mortality recovered, etc.).
"""

from __future__ import annotations

from typing import Any

from project_utopia.simulation.meta.game_event_bus import EVENT_TYPES, emit_event

__all__ = [
    "ResourceSystem",
    "RESOURCE_FLOW_WINDOW_SEC",
    "TRACKED_FLOW_RESOURCES",
    "record_resource_flow",
    "ensure_resource_flow_state",
]


RESOURCE_FLOW_WINDOW_SEC = 3.0
"""Per-min metrics are flushed every 3 seconds of simulated time."""

TRACKED_FLOW_RESOURCES: tuple[str, ...] = (
    "food",
    "wood",
    "stone",
    "herbs",
    "meals",
    "medicine",
    "tools",
)


# Tunables — mirrors a slim subset of ``BALANCE.*``. Module-level dict so
# tests can monkey-patch values without re-instantiating the system.
RESOURCE_BALANCE: dict[str, Any] = {
    "warehouse_food_spoilage_rate_per_sec": 0.0,
    "warehouse_wood_spoilage_rate_per_sec": 0.0,
    "worker_food_consumption_per_second": 0.030,
    "food_emergency_threshold": 14.0,
    "wood_emergency_threshold": 10.0,
}


def ensure_resource_flow_state(state: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Initialise (or fetch) the per-window flow accumulator on ``state``."""
    metrics = state.setdefault("metrics", {})
    accum = state.get("_resourceFlowAccum")
    if not isinstance(accum, dict):
        accum = {
            r: {"produced": 0.0, "consumed": 0.0, "spoiled": 0.0, "recovered": 0.0}
            for r in TRACKED_FLOW_RESOURCES
        }
        state["_resourceFlowAccum"] = accum
    state.setdefault("_resourceFlowWindowSec", 0.0)
    if not isinstance(state.get("_resourceFlowLastSnapshot"), dict):
        resources = state.get("resources") or {}
        state["_resourceFlowLastSnapshot"] = {
            r: float(resources.get(r, 0.0)) for r in TRACKED_FLOW_RESOURCES
        }
    _ = metrics  # silence linter — metrics is initialised lazily here
    return accum


def record_resource_flow(
    state: dict[str, Any],
    resource: str,
    kind: str,
    amount: float,
) -> None:
    """True-source flow emitter (mirrors JS ``recordResourceFlow``).

    Called by farms / kitchens / mortality / spoilage paths so the
    accumulator builds a complete per-window breakdown. Silently no-ops
    on bad inputs.
    """
    qty = max(0.0, float(amount))
    if qty <= 0.0:
        return
    if resource not in TRACKED_FLOW_RESOURCES:
        return
    if kind not in ("produced", "consumed", "spoiled", "recovered"):
        return
    accum = ensure_resource_flow_state(state)
    accum[resource][kind] = float(accum[resource].get(kind, 0.0)) + qty


def _count_living_workers(state: dict[str, Any]) -> int:
    n = 0
    for a in state.get("agents") or []:
        if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False:
            n += 1
    return n


class ResourceSystem:
    """Per-tick resource accounting.

    State contract (read+write):

    * ``state["resources"]`` — dict of ``{food, wood, stone, herbs, meals,
      medicine, tools}`` floats.
    * ``state["metrics"]["timeSec"]`` — seconds of simulated time.
    * ``state["_resourceFlowAccum"]`` — per-resource per-kind float dict,
      flushed every ``RESOURCE_FLOW_WINDOW_SEC``.
    * Emits ``FOOD_SHORTAGE`` / ``RESOURCE_SURPLUS`` / ``RESOURCE_DEPLETED``.
    """

    def __init__(self, balance: dict[str, Any] | None = None) -> None:
        self.name = "ResourceSystem"
        self.balance = dict(balance) if balance is not None else dict(RESOURCE_BALANCE)

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del services
        if not isinstance(state, dict):
            return
        ensure_resource_flow_state(state)
        resources = state.setdefault("resources", {})

        # ---- clamp + fixup ---------------------------------------------
        for key in TRACKED_FLOW_RESOURCES:
            val = resources.get(key, 0.0)
            try:
                fval = float(val)
            except (TypeError, ValueError):
                fval = 0.0
            if fval != fval or fval == float("inf") or fval == float("-inf"):
                fval = 0.0
            resources[key] = max(0.0, fval)

        step = max(0.0, float(dt))

        # ---- proportional spoilage (food + wood) ------------------------
        food_spoil_rate = float(self.balance.get("warehouse_food_spoilage_rate_per_sec", 0.0))
        if food_spoil_rate > 0.0 and resources["food"] > 0.0:
            spoiled = resources["food"] * food_spoil_rate * step
            resources["food"] = max(0.0, resources["food"] - spoiled)
            if spoiled > 0.0:
                record_resource_flow(state, "food", "spoiled", spoiled)

        wood_spoil_rate = float(self.balance.get("warehouse_wood_spoilage_rate_per_sec", 0.0))
        if wood_spoil_rate > 0.0 and resources["wood"] > 0.0:
            spoiled = resources["wood"] * wood_spoil_rate * step
            resources["wood"] = max(0.0, resources["wood"] - spoiled)
            if spoiled > 0.0:
                record_resource_flow(state, "wood", "spoiled", spoiled)

        # ---- worker food drain -----------------------------------------
        consume_rate = float(self.balance.get("worker_food_consumption_per_second", 0.030))
        if consume_rate > 0.0 and resources["food"] > 0.0:
            alive = _count_living_workers(state)
            if alive > 0:
                wanted = alive * consume_rate * step
                actual = min(wanted, resources["food"])
                resources["food"] = max(0.0, resources["food"] - actual)
                if actual > 0.0:
                    record_resource_flow(state, "food", "consumed", actual)

        # ---- shortage / surplus emits ----------------------------------
        food_threshold = float(self.balance.get("food_emergency_threshold", 14.0))
        prev_food_short = bool(state.get("_foodShortage", False))
        state["_foodShortage"] = resources["food"] < food_threshold
        if state["_foodShortage"] and not prev_food_short:
            emit_event(
                state,
                EVENT_TYPES["FOOD_SHORTAGE"],
                {
                    "resource": "food",
                    "food": resources["food"],
                    "threshold": food_threshold,
                },
            )
        if (
            not state["_foodShortage"]
            and prev_food_short
            and resources["food"] > food_threshold * 3
        ):
            emit_event(
                state,
                EVENT_TYPES["RESOURCE_SURPLUS"],
                {"resource": "food", "amount": resources["food"]},
            )

        wood_threshold = float(self.balance.get("wood_emergency_threshold", 10.0))
        prev_wood_short = bool(state.get("_woodShortage", False))
        state["_woodShortage"] = resources["wood"] < wood_threshold
        if state["_woodShortage"] and not prev_wood_short:
            emit_event(
                state,
                EVENT_TYPES["FOOD_SHORTAGE"],
                {
                    "resource": "wood",
                    "wood": resources["wood"],
                    "threshold": wood_threshold,
                },
            )
        if (
            not state["_woodShortage"]
            and prev_wood_short
            and resources["wood"] > wood_threshold * 3
        ):
            emit_event(
                state,
                EVENT_TYPES["RESOURCE_SURPLUS"],
                {"resource": "wood", "amount": resources["wood"]},
            )

        for res in ("food", "wood", "stone", "herbs"):
            key = f"_{res}Depleted"
            val = resources.get(res, 0.0)
            if val <= 0.0 and not state.get(key, False):
                state[key] = True
                emit_event(
                    state,
                    EVENT_TYPES["RESOURCE_DEPLETED"],
                    {"resource": res},
                )
            elif val > 5.0:
                state[key] = False

        # ---- flow accumulator flush ------------------------------------
        state["_resourceFlowWindowSec"] = float(state.get("_resourceFlowWindowSec", 0.0)) + step
        window_sec = float(state["_resourceFlowWindowSec"])
        if window_sec >= RESOURCE_FLOW_WINDOW_SEC:
            metrics = state.setdefault("metrics", {})
            accum = state["_resourceFlowAccum"]
            scale = 60.0 / window_sec if window_sec > 0 else 0.0
            metrics["foodProducedPerMin"] = round(accum["food"].get("produced", 0.0) * scale, 2)
            metrics["foodConsumedPerMin"] = round(accum["food"].get("consumed", 0.0) * scale, 2)
            metrics["foodSpoiledPerMin"] = round(accum["food"].get("spoiled", 0.0) * scale, 2)
            for r in ("wood", "stone", "herbs", "meals", "medicine", "tools"):
                bucket = accum.get(r, {})
                metrics[f"{r}ProducedPerMin"] = round(float(bucket.get("produced", 0.0)) * scale, 2)
                metrics[f"{r}ConsumedPerMin"] = round(float(bucket.get("consumed", 0.0)) * scale, 2)
            # Reset
            for r in TRACKED_FLOW_RESOURCES:
                accum[r]["produced"] = 0.0
                accum[r]["consumed"] = 0.0
                accum[r]["spoiled"] = 0.0
                accum[r]["recovered"] = 0.0
            state["_resourceFlowLastSnapshot"] = {
                r: float(resources.get(r, 0.0)) for r in TRACKED_FLOW_RESOURCES
            }
            state["_resourceFlowWindowSec"] = 0.0
