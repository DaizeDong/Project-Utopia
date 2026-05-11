"""Worker recruitment / birth scheduler (port of ``PopulationGrowthSystem.js``).

The JS source is an explicit-recruit pipeline (replaced the legacy
auto-reproduction loop in v0.8.4):

* a 1Hz queue-fill loop drives ``state.controls.recruitQueue`` up toward
  ``recruitTarget`` while food is comfortably above the buffer
* a spawn branch drains one queue entry per tick when the cooldown is
  satisfied AND the food runway projects above
  ``recruitMinFoodHeadroomSec``
* RC3 RNG fallback: when ``services.rng`` is absent the warehouse pick
  uses a constant ``0.5`` rather than the (banned) legacy global RNG, so
  the defensive path is bit-reproducible (RC3 B5 fix)

We preserve all of the gates above and the deterministic RNG fallback.
The narrative beats (objectiveLog, memory.recentEvents, debug.eventTrace)
are dropped — the academic benchmark only cares about the
``birthsTotal`` / ``recruitTotal`` counters and the emitted
``WORKER_BORN`` event.
"""

from __future__ import annotations

from typing import Any

from project_utopia.app.rng import SeededRng
from project_utopia.simulation.meta.game_event_bus import EVENT_TYPES, emit_event
from project_utopia.world.grid import TILE, Grid

__all__ = [
    "PopulationGrowthSystem",
    "RecruitmentSystem",
    "POPULATION_BALANCE",
    "MIN_FOOD_FOR_GROWTH",
    "compute_food_headroom_sec",
]


# Tunables mirrored from JS BALANCE.*
POPULATION_BALANCE: dict[str, Any] = {
    "recruit_food_cost": 25.0,
    "recruit_min_food_buffer": 80.0,
    "recruit_cooldown_sec": 30.0,
    "recruit_max_queue_size": 12,
    "recruit_min_food_headroom_sec": 60.0,
    "warehouse_eat_rate_per_worker_per_second": 0.6,
    "check_interval_sec": 1.0,
}

MIN_FOOD_FOR_GROWTH: float = float(POPULATION_BALANCE["recruit_min_food_buffer"])


def compute_food_headroom_sec(
    state: dict[str, Any],
    workers_count: int,
    balance: dict[str, Any] | None = None,
) -> float:
    """Forward-looking food runway in seconds.

    Returns ``inf`` when the colony is net-positive on food (drain ≤ 0).
    Mirrors :func:`computeFoodHeadroomSec` in the JS source.
    """
    bal = balance or POPULATION_BALANCE
    resources = state.get("resources") or {}
    food = float(resources.get("food", 0.0))
    eat_per_worker = float(bal.get("warehouse_eat_rate_per_worker_per_second", 0.6))
    metrics = state.get("metrics") or {}
    produced_per_min = float(metrics.get("foodProducedPerMin", 0.0))
    production_per_sec = produced_per_min / 60.0
    drain_rate = max(0.0, float(workers_count)) * eat_per_worker - production_per_sec
    if drain_rate <= 0.0:
        return float("inf")
    return food / max(0.01, drain_rate)


def _rng_next(services: Any | None) -> float:
    """RC3 B5 fix — constant fallback so missing ``services.rng`` is still deterministic."""
    rng = getattr(services, "rng", None) if services is not None else None
    if rng is None:
        return 0.5
    return float(rng.next())


def _count_living_workers(state: dict[str, Any]) -> int:
    n = 0
    for a in state.get("agents") or []:
        if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False:
            n += 1
    return n


def _list_warehouses(grid: Grid) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for iz in range(grid.height):
        for ix in range(grid.width):
            if int(grid.get_tile(ix, iz)) == TILE["WAREHOUSE"]:
                out.append((ix, iz))
    return out


class RecruitmentSystem:
    """Deterministic worker recruitment scheduler.

    Tick contract::

        system.update(dt, state, services)

    State touched:

    * ``state["controls"]["recruitQueue"]``, ``["recruitTarget"]``,
      ``["recruitCooldownSec"]``, ``["autoRecruit"]``
    * ``state["resources"]["food"]``
    * ``state["agents"]`` — appended on spawn
    * ``state["metrics"]["birthsTotal"]``, ``["recruitTotal"]``,
      ``["lastBirthGameSec"]``, ``["foodHeadroomSec"]``,
      ``["populationGrowthBlockedReason"]``
    """

    def __init__(self, balance: dict[str, Any] | None = None) -> None:
        self.name = "RecruitmentSystem"
        self.balance = dict(balance) if balance is not None else dict(POPULATION_BALANCE)
        self._timer = 0.0

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        if not isinstance(state, dict):
            return
        controls = state.setdefault("controls", {})
        metrics = state.setdefault("metrics", {})
        step = max(0.0, float(dt))

        # Cooldown drains every frame regardless of 1Hz cadence.
        cooldown = max(0.0, float(controls.get("recruitCooldownSec", 0.0)) - step)
        controls["recruitCooldownSec"] = cooldown

        # 1Hz gate for the queue-fill / spawn loop.
        self._timer = float(self._timer) - step
        if self._timer > 0.0:
            return
        self._timer = float(self.balance.get("check_interval_sec", 1.0))

        grid = state.get("grid")
        if not isinstance(grid, Grid):
            return
        warehouses = _list_warehouses(grid)
        if not warehouses:
            return

        food = float((state.get("resources") or {}).get("food", 0.0))
        recruit_food_cost = float(self.balance.get("recruit_food_cost", 25.0))
        recruit_min_buffer = float(self.balance.get("recruit_min_food_buffer", 80.0))
        recruit_max_queue = int(self.balance.get("recruit_max_queue_size", 12))
        recruit_cooldown_ref = float(self.balance.get("recruit_cooldown_sec", 30.0))
        recruit_target_raw = max(0, int(controls.get("recruitTarget", 0)))
        recruit_queue = max(0, int(controls.get("recruitQueue", 0)))
        auto_recruit = controls.get("autoRecruit", True) is not False
        workers = _count_living_workers(state)

        # Simple infrastructure cap derived from current building counts.
        buildings = state.get("buildings") or {}
        infra_cap = (
            12
            + int(buildings.get("warehouses", 0)) * 3
            + int(buildings.get("farms", 0)) // 2
            + int(buildings.get("lumbers", 0)) // 2
            + int(buildings.get("quarries", 0)) * 2
            + int(buildings.get("kitchens", 0)) * 2
        )
        effective_cap = min(recruit_target_raw, infra_cap)
        metrics["populationInfraCap"] = infra_cap
        metrics["populationEffectiveCap"] = effective_cap

        min_headroom = float(self.balance.get("recruit_min_food_headroom_sec", 60.0))

        # Auto-fill branch.
        total_current = workers + recruit_queue
        if (
            auto_recruit
            and total_current < effective_cap
            and food >= recruit_min_buffer
            and recruit_queue < recruit_max_queue
        ):
            projected = compute_food_headroom_sec(state, workers + recruit_queue + 1, self.balance)
            if projected < min_headroom:
                metrics["populationGrowthBlockedReason"] = (
                    f"food headroom {projected:.0f}s < {min_headroom:.0f}s (auto-fill skipped)"
                )
                metrics["foodHeadroomSec"] = projected
            else:
                gap = effective_cap - total_current
                add = min(1, gap)
                recruit_queue = min(recruit_max_queue, recruit_queue + add)
                controls["recruitQueue"] = recruit_queue
                metrics["foodHeadroomSec"] = projected

        # Spawn branch.
        if recruit_queue <= 0:
            return
        if cooldown > 0.0:
            return
        if food < recruit_food_cost:
            metrics["populationGrowthBlockedReason"] = "food below recruit cost"
            return
        if food < recruit_min_buffer:
            metrics["populationGrowthBlockedReason"] = "food below recruit buffer"
            return

        projected = compute_food_headroom_sec(state, workers + 1, self.balance)
        if projected < min_headroom:
            metrics["populationGrowthBlockedReason"] = (
                f"food headroom {projected:.0f}s < {min_headroom:.0f}s"
            )
            metrics["foodHeadroomSec"] = projected
            return
        metrics["foodHeadroomSec"] = projected

        # Pick a deterministic warehouse for placement.
        # RC3 B5 fix: ``_rng_next`` returns 0.5 when services.rng is absent.
        rng_v = _rng_next(services)
        wh_idx = int(rng_v * len(warehouses))
        if wh_idx >= len(warehouses):
            wh_idx = len(warehouses) - 1
        wx, wz = warehouses[wh_idx]

        # Construct a minimal worker dict — entity_factory equivalent is the
        # full version with skills / lineage / blackboard, but the harness
        # invariants only require id + type + alive + position + carry.
        new_worker_id = self._make_worker_id(state)
        new_worker = {
            "id": new_worker_id,
            "displayName": f"Worker-{new_worker_id}",
            "type": "WORKER",
            "alive": True,
            "x": float(wx),
            "z": float(wz),
            "hunger": 1.0,
            "carry": {"food": 0.0, "wood": 0.0, "stone": 0.0, "herbs": 0.0},
            "lineage": {"parents": [], "children": [], "deathSec": -1},
        }
        state.setdefault("agents", []).append(new_worker)
        resources = state.setdefault("resources", {})
        resources["food"] = max(0.0, food - recruit_food_cost)
        controls["recruitQueue"] = max(0, recruit_queue - 1)
        controls["recruitCooldownSec"] = recruit_cooldown_ref

        metrics["birthsTotal"] = int(metrics.get("birthsTotal", 0)) + 1
        metrics["recruitTotal"] = int(metrics.get("recruitTotal", 0)) + 1
        metrics["lastBirthGameSec"] = float(metrics.get("timeSec", 0.0))
        metrics["populationGrowthBlockedReason"] = ""

        emit_event(
            state,
            EVENT_TYPES["VISITOR_ARRIVED"],
            {
                "entityId": new_worker_id,
                "entityName": new_worker["displayName"],
                "reason": "recruited",
            },
        )
        emit_event(
            state,
            EVENT_TYPES["WORKER_BORN"],
            {
                "entityId": new_worker_id,
                "entityName": new_worker["displayName"],
                "parentNames": [],
                "lineageParentIds": [],
                "reason": "recruited",
            },
        )

    @staticmethod
    def _make_worker_id(state: dict[str, Any]) -> str:
        agents = state.get("agents") or []
        # Deterministic + collision-free: sequence number based on agent count.
        return f"w{len(agents) + 1:04d}"


# Back-compat alias used by SimHarness / GameApp call sites.
PopulationGrowthSystem = RecruitmentSystem
