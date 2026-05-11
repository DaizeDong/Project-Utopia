"""Per-tick population aggregate stats (port of population-side analytics).

Pulls a single roll-up dict into ``state["metrics"]["population"]`` every
tick. Cheap O(N) over agents.
"""

from __future__ import annotations

from typing import Any

__all__ = ["PopulationStatsSystem"]


class PopulationStatsSystem:
    """Compute alive / dead / role tallies once per tick."""

    def __init__(self) -> None:
        self.name = "PopulationStatsSystem"

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del dt, services
        if not isinstance(state, dict):
            return
        agents = state.get("agents") or []
        alive = 0
        dead = 0
        workers = 0
        visitors = 0
        hunger_sum = 0.0
        morale_sum = 0.0
        rest_sum = 0.0
        roles: dict[str, int] = {}

        for a in agents:
            if not isinstance(a, dict):
                continue
            if a.get("alive", True) is False:
                dead += 1
                continue
            alive += 1
            t = str(a.get("type", ""))
            if t == "WORKER":
                workers += 1
                hunger_sum += float(a.get("hunger", 1.0))
                morale_sum += float(a.get("morale", 0.5))
                rest_sum += float(a.get("rest", 1.0))
                role = str(a.get("role", "GENERAL"))
                roles[role] = roles.get(role, 0) + 1
            elif t == "VISITOR":
                visitors += 1

        metrics = state.setdefault("metrics", {})
        pop = metrics.setdefault("population", {})
        pop["aliveTotal"] = alive
        pop["deadTotal"] = dead
        pop["workers"] = workers
        pop["visitors"] = visitors
        pop["roles"] = dict(sorted(roles.items()))
        if workers > 0:
            pop["meanHunger"] = round(hunger_sum / workers, 4)
            pop["meanMorale"] = round(morale_sum / workers, 4)
            pop["meanRest"] = round(rest_sum / workers, 4)
        else:
            pop["meanHunger"] = 0.0
            pop["meanMorale"] = 0.0
            pop["meanRest"] = 0.0
