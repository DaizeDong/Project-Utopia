"""WorldSummary — observation-envelope builder for the LLM channels.

Python port of ``WorldSummary.js``. The full JS implementation reads from
``ScenarioFactory``, ``PopulationGrowthSystem``, ``ColonyPerceiver`` and the
versioned ``Grid`` — none of which are in scope for this Phase 1 subagent.
We therefore expose a **structural** ``build_world_summary`` that produces
the same camelCase output shape but reads optional/nested fields defensively
from the passed-in state dict. Subagents porting the substrate (Phase 2) can
swap in the rich helpers when the dependencies land.

Field names are kept camelCase on the wire to stay drop-in compatible with
the JS NDJSON traces.
"""

from __future__ import annotations

import math
from typing import Any, Iterable

POLICY_GROUP_ORDER = ("workers", "traders", "saboteurs", "herbivores", "predators")
GROUP_DEFAULT_STATE = {
    "workers": "idle",
    "traders": "idle",
    "saboteurs": "scout",
    "herbivores": "graze",
    "predators": "stalk",
}


def _num(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    return v


def _round(value: Any, ndigits: int = 2, default: float = 0.0) -> float:
    return round(_num(value, default), ndigits)


def _list_of(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _resolve_dominant_state(state_counts: dict[str, Any], fallback: str) -> str:
    best_state = fallback
    best_count = -1
    for state_name, count in (state_counts or {}).items():
        safe = int(_num(count))
        if safe > best_count:
            best_count = safe
            best_state = state_name
    return best_state


def build_world_summary(state: dict[str, Any]) -> dict[str, Any]:
    """Build the deterministic world summary dict (camelCase keys on the wire)."""
    if not isinstance(state, dict):
        state = {}
    metrics = state.get("metrics") or {}
    resources = state.get("resources") or {}
    buildings = state.get("buildings") or {}
    gameplay = state.get("gameplay") or {}
    recovery = gameplay.get("recovery") or {}
    weather = state.get("weather") or {}
    events_state = state.get("events") or {}
    ai_state = state.get("ai") or {}

    agents: Iterable[dict[str, Any]] = _list_of(state.get("agents"))
    animals: Iterable[dict[str, Any]] = _list_of(state.get("animals"))
    workers = sum(1 for a in agents if a.get("type") == "WORKER")
    visitors = sum(1 for a in agents if a.get("type") == "VISITOR")
    herbivores = sum(1 for a in animals if a.get("kind") == "HERBIVORE")
    predators = sum(1 for a in animals if a.get("kind") == "PREDATOR")

    objective = None
    objectives = gameplay.get("objectives") or []
    obj_idx = int(_num(gameplay.get("objectiveIndex")))
    if isinstance(objectives, list) and 0 <= obj_idx < len(objectives):
        objective = objectives[obj_idx]

    summary = {
        "simTimeSec": int(_num(metrics.get("timeSec"))),
        "resources": {
            "food": _round(resources.get("food")),
            "wood": _round(resources.get("wood")),
            "stone": _round(resources.get("stone")),
            "herbs": _round(resources.get("herbs")),
            "meals": _round(resources.get("meals")),
            "medicine": _round(resources.get("medicine")),
            "tools": _round(resources.get("tools")),
        },
        "population": {
            "workers": workers,
            "visitors": visitors,
            "herbivores": herbivores,
            "predators": predators,
            "foodHeadroomSec": _round(
                (state.get("population") or {}).get("foodHeadroomSec", 9999), 1, 9999
            ),
        },
        "buildings": dict(buildings),
        "objective": (
            {
                "id": str(objective.get("id", "")),
                "title": str(objective.get("title", "")),
                "description": str(objective.get("description", "")),
                "progress": _round(objective.get("progress"), 1),
                "hint": str(gameplay.get("objectiveHint", "")),
            }
            if isinstance(objective, dict)
            else {
                "id": "",
                "title": "All objectives completed",
                "description": "",
                "progress": 100,
                "hint": str(gameplay.get("objectiveHint", "")),
            }
        ),
        "gameplay": {
            "doctrine": str(gameplay.get("doctrine", "balanced")),
            "prosperity": _round(gameplay.get("prosperity")),
            "threat": _round(gameplay.get("threat")),
            "doctrineMastery": _round(gameplay.get("doctrineMastery", 1.0), 3, 1.0),
            "recovery": {
                "charges": int(_num(recovery.get("charges"))),
                "activeBoostSec": _round(recovery.get("activeBoostSec"), 1),
                "collapseRisk": _round(recovery.get("collapseRisk"), 1),
                "lastReason": str(recovery.get("lastReason", "")),
            },
        },
        "weather": {
            "current": str(weather.get("current", "clear")),
            "timeLeftSec": _round(weather.get("timeLeftSec"), 1),
            "pressureScore": _round(weather.get("pressureScore"), 2),
            "hazardFronts": len(_list_of(weather.get("hazardFronts"))),
            "hazardFocusSummary": str(weather.get("hazardFocusSummary", "")),
        },
        "frontier": dict(state.get("frontier") or {}),
        "logistics": dict((metrics.get("logistics") or {})),
        "ecology": dict((metrics.get("ecology") or {})),
        "events": [
            {
                "type": e.get("type"),
                "status": e.get("status"),
                "intensity": _round(e.get("intensity"), 2),
                "targetLabel": str(((e.get("payload") or {}).get("targetLabel")) or ""),
                "severity": str(((e.get("payload") or {}).get("severity")) or ""),
                "pressure": _round((e.get("payload") or {}).get("pressure"), 2),
            }
            for e in _list_of(events_state.get("active"))
        ],
        "spatialPressure": {
            "weatherPressure": _round(
                (metrics.get("spatialPressure") or {}).get("weatherPressure"), 2
            ),
            "eventPressure": _round(
                (metrics.get("spatialPressure") or {}).get("eventPressure"), 2
            ),
            "contestedZones": int(
                _num((metrics.get("spatialPressure") or {}).get("contestedZones"))
            ),
            "activeEventCount": int(
                _num((metrics.get("spatialPressure") or {}).get("activeEventCount"))
            ),
        },
        "aiMode": (ai_state.get("mode") or "off"),
    }

    summary["operations"] = _build_operations_summary(summary)

    strategy = ai_state.get("strategy")
    if isinstance(strategy, dict):
        summary["_strategyContext"] = {
            "priority": strategy.get("priority"),
            "resourceFocus": strategy.get("resourceFocus"),
            "defensePosture": strategy.get("defensePosture"),
            "riskTolerance": strategy.get("riskTolerance"),
            "workerFocus": strategy.get("workerFocus"),
            "environmentPreference": strategy.get("environmentPreference"),
        }
    return summary


def _build_operations_summary(world: dict[str, Any]) -> dict[str, Any]:
    frontier = world.get("frontier") or {}
    logistics = world.get("logistics") or {}
    recovery = (world.get("gameplay") or {}).get("recovery") or {}
    ecology = world.get("ecology") or {}
    issues: list[str] = []
    broken = _list_of(frontier.get("brokenRoutes"))
    if broken:
        issues.append(f"repair {broken[0]}")
    unready = _list_of(frontier.get("unreadyDepots"))
    if unready:
        issues.append(f"reclaim {unready[0]}")
    if _num(logistics.get("overloadedWarehouses")) > 0:
        issues.append("relieve depot congestion")
    if _num(logistics.get("strandedCarryWorkers")) > 0:
        issues.append("unstick delivery paths")
    if _num(ecology.get("pressuredFarms")) > 0:
        issues.append("respond to farm pressure")
    if _num(recovery.get("collapseRisk")) >= 60:
        issues.append("preserve recovery window")
    return {
        "keyIssues": issues[:5],
        "focus": issues[0] if issues else "maintain stable frontier throughput",
    }


def build_policy_summary(state: dict[str, Any]) -> dict[str, Any]:
    """Build the per-group policy summary (groups + state-transition context)."""
    by_group: dict[str, dict[str, Any]] = {}
    for a in _list_of(state.get("agents")):
        fsm = a.get("fsm") or {}
        state_node = (
            (fsm.get("state") if isinstance(fsm, dict) else None)
            or ((a.get("blackboard") or {}).get("fsm") or {}).get("state")
            or a.get("stateLabel")
            or "idle"
        )
        state_node = str(state_node).lower()
        group = a.get("groupId") or "workers"
        bucket = by_group.setdefault(group, {"count": 0, "avgHunger": 0.0, "carrying": 0, "states": {}})
        bucket["count"] += 1
        bucket["avgHunger"] += float(a.get("hunger") or 0.0)
        carry = a.get("carry") or {}
        bucket["carrying"] += float(carry.get("food") or 0.0) + float(carry.get("wood") or 0.0)
        bucket["states"][state_node] = bucket["states"].get(state_node, 0) + 1

    for a in _list_of(state.get("animals")):
        fsm = a.get("fsm") or {}
        state_node = (
            (fsm.get("state") if isinstance(fsm, dict) else None)
            or ((a.get("blackboard") or {}).get("fsm") or {}).get("state")
            or a.get("stateLabel")
            or "idle"
        )
        state_node = str(state_node).lower()
        group = a.get("groupId") or "herbivores"
        bucket = by_group.setdefault(group, {"count": 0, "states": {}})
        bucket["count"] += 1
        bucket["states"][state_node] = bucket["states"].get(state_node, 0) + 1

    for bucket in by_group.values():
        count = bucket.get("count") or 0
        if count and "avgHunger" in bucket:
            bucket["avgHunger"] = round(bucket["avgHunger"] / count, 3)

    world = build_world_summary(state)
    transition_context: dict[str, Any] = {}
    for group_id in POLICY_GROUP_ORDER:
        stats = by_group.get(group_id) or {"count": 0, "avgHunger": 0.0, "carrying": 0, "states": {}}
        dominant = _resolve_dominant_state(stats.get("states") or {}, GROUP_DEFAULT_STATE.get(group_id, "idle"))
        transition_context[group_id] = {
            "count": int(stats.get("count") or 0),
            "avgHunger": float(stats.get("avgHunger") or 0.0),
            "carrying": float(stats.get("carrying") or 0.0),
            "states": dict(stats.get("states") or {}),
            "dominantState": dominant,
        }
    return {
        "world": world,
        "groups": by_group,
        "stateTransitions": {
            "groups": transition_context,
            "generatedAtSec": float(_num((state.get("metrics") or {}).get("timeSec"))),
        },
    }


__all__ = [
    "GROUP_DEFAULT_STATE",
    "POLICY_GROUP_ORDER",
    "build_policy_summary",
    "build_world_summary",
]
