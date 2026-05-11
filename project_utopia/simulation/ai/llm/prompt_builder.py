"""PromptBuilder — deterministic fallback directive builders.

Python port of ``PromptBuilder.js``. When the LLM channel is disabled or
degraded, these builders produce a sensible fallback directive that respects
the same schemas + guardrails as the live LLM output.

The full v0.8.2 colony-policy adjustment ladder is preserved in spirit but
deliberately condensed: the JS variant accumulates dozens of micro-rules
(soil crisis, water isolation, node depletion, …) that were tuned against
the game's UI and are out-of-scope for the headless benchmark fork. We keep
the high-leverage signals (food / wood scarcity, broken routes, threat) and
defer the rest to Phase 2 if benchmark dimensions need them.
"""

from __future__ import annotations

from typing import Any

from .guardrails import (
    MAX_WEIGHT_VALUE,
    MIN_WEIGHT_VALUE,
    guard_environment_directive,
    guard_group_policies,
)
from .response_schema import (
    EnvironmentDirective,
    GroupPolicy,
    NpcPolicyEnvelope,
)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if v != v:  # NaN
        return default
    return v


def _clamp(value: float, lo: float, hi: float) -> float:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def _world(summary: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(summary, dict):
        return {}
    return summary.get("world") or summary


# ---------------------------------------------------------------------------
# Environment fallback
# ---------------------------------------------------------------------------


def build_environment_fallback(summary: dict[str, Any] | None) -> EnvironmentDirective:
    """Build the deterministic environment-director fallback directive."""
    world = _world(summary)
    gameplay = world.get("gameplay") or {}
    recovery = gameplay.get("recovery") or {}
    resources = world.get("resources") or {}
    population = world.get("population") or {}

    low_food = _num(resources.get("food")) < 18
    collapse_risk = _num(recovery.get("collapseRisk"))
    prosperity = _num(gameplay.get("prosperity"), 50)
    threat = _num(gameplay.get("threat"), 25)
    predators = _num(population.get("predators"))

    if low_food or collapse_risk >= 65:
        return guard_environment_directive(
            {
                "weather": "clear",
                "durationSec": 25,
                "factionTension": 0.3,
                "eventSpawns": [{"type": "tradeCaravan", "intensity": 1.2, "durationSec": 16}],
                "focus": "recovery lane",
            }
        )
    if prosperity < 55 or threat > 60:
        return guard_environment_directive(
            {
                "weather": "clear",
                "durationSec": 22,
                "factionTension": 0.35,
                "eventSpawns": [],
                "focus": "let the colony breathe",
            }
        )
    if predators >= 3 and prosperity < 60:
        return guard_environment_directive(
            {
                "weather": "clear",
                "durationSec": 22,
                "factionTension": 0.3,
                "eventSpawns": [],
                "focus": "predator mitigation",
            }
        )
    if prosperity >= 70 and threat <= 25:
        return guard_environment_directive(
            {
                "weather": "rain",
                "durationSec": 16,
                "factionTension": 0.55,
                "eventSpawns": [
                    {"type": "animalMigration", "intensity": 0.5, "durationSec": 12}
                ],
                "focus": "light challenge",
            }
        )
    event_spawns: list[dict[str, Any]] = []
    if prosperity >= 55:
        event_spawns.append({"type": "tradeCaravan", "intensity": 0.8, "durationSec": 12})
    return guard_environment_directive(
        {
            "weather": "clear",
            "durationSec": 20,
            "factionTension": 0.4,
            "eventSpawns": event_spawns,
            "focus": "steady state",
        }
    )


# ---------------------------------------------------------------------------
# Default group policy table (mirror DEFAULT_GROUP_POLICIES in aiConfig.js).
# ---------------------------------------------------------------------------


DEFAULT_GROUP_POLICIES: dict[str, dict[str, Any]] = {
    "workers": {
        "groupId": "workers",
        "intentWeights": {
            "farm": 1.0,
            "wood": 1.0,
            "deliver": 1.2,
            "eat": 1.4,
            "wander": 0.2,
            "quarry": 0.8,
            "gather_herbs": 0.8,
            "cook": 0.8,
            "smith": 0.8,
            "heal": 0.8,
        },
        "riskTolerance": 0.35,
        "targetPriorities": {
            "warehouse": 1.5,
            "farm": 1.0,
            "lumber": 1.0,
            "road": 1.05,
            "depot": 1.2,
            "frontier": 0.9,
            "safety": 1.2,
            "quarry": 0.9,
            "herb_garden": 0.9,
            "kitchen": 0.9,
            "smithy": 0.9,
            "clinic": 0.9,
            "bridge": 0.7,
        },
        "ttlSec": 24,
        "focus": "depot throughput",
        "summary": "Keep workers fed, reconnect routes, and unload cargo before harvest loops stall.",
        "steeringNotes": [
            "Protect delivery chains before raw output.",
            "Avoid steering workers into hunger or cargo deadlocks.",
        ],
    },
    "traders": {
        "groupId": "traders",
        "intentWeights": {"trade": 1.6, "eat": 0.8, "wander": 0.35},
        "riskTolerance": 0.42,
        "targetPriorities": {
            "warehouse": 1.7,
            "road": 1.25,
            "depot": 1.35,
            "frontier": 0.95,
            "safety": 1.1,
            "farm": 0.7,
        },
        "ttlSec": 24,
        "focus": "defended depots",
        "summary": "Route traders through defended warehouses and reliable roads instead of idling on exposed lanes.",
        "steeringNotes": [
            "Trade should concentrate where route support and defenses are both present."
        ],
    },
    "saboteurs": {
        "groupId": "saboteurs",
        "intentWeights": {"sabotage": 1.5, "scout": 1.0, "evade": 0.9, "wander": 0.2},
        "riskTolerance": 0.74,
        "targetPriorities": {
            "warehouse": 1.4,
            "farm": 1.2,
            "lumber": 1.1,
            "road": 0.95,
            "frontier": 1.15,
            "choke": 1.05,
            "exit": 0.8,
        },
        "ttlSec": 24,
        "focus": "frontier disruption",
        "summary": "Hit lightly defended depots, fragile corridors, and productive tiles that keep the frontier supplied.",
        "steeringNotes": [
            "Prefer soft targets over protected walls.",
            "Exit value should rise after a successful strike.",
        ],
    },
    "herbivores": {
        "groupId": "herbivores",
        "intentWeights": {"graze": 1.0, "migrate": 0.8, "flee": 1.3},
        "riskTolerance": 0.25,
        "targetPriorities": {
            "grass": 1.3,
            "farm": 0.95,
            "wildlife": 1.15,
            "road": 0.7,
            "safety": 1.2,
        },
        "ttlSec": 24,
        "focus": "habitat grazing",
        "summary": "Keep herds near habitat anchors, spill onto farms when pressure builds, and preserve escape options.",
        "steeringNotes": [
            "Farm pressure should be visible but not constant.",
            "Predator pressure must still dominate flee decisions.",
        ],
    },
    "predators": {
        "groupId": "predators",
        "intentWeights": {"hunt": 1.0, "stalk": 0.9, "wander": 0.6},
        "riskTolerance": 0.8,
        "targetPriorities": {
            "herbivore": 1.4,
            "isolation": 1.0,
            "wildlife": 0.95,
            "farm": 0.8,
            "safety": 0.5,
        },
        "ttlSec": 24,
        "focus": "isolated prey",
        "summary": "Favor isolated prey and frontier hotspots before drifting toward safer or less consequential patrol paths.",
        "steeringNotes": [
            "Use farm hotspots as a secondary lure, not a replacement for live prey."
        ],
    },
}


def _clone_default_policies() -> list[dict[str, Any]]:
    import copy

    return [copy.deepcopy(p) for p in DEFAULT_GROUP_POLICIES.values()]


def _adjust_for_pressure(policy: dict[str, Any], world: dict[str, Any]) -> None:
    """Apply the high-leverage signals from the JS PromptBuilder.

    Concentrated subset — food + wood + threat + broken routes only. Other
    JS micro-rules (soil crisis, water isolation, …) are deferred to Phase 2
    when their dimensions are wired in.
    """
    resources = world.get("resources") or {}
    frontier = world.get("frontier") or {}
    gameplay = world.get("gameplay") or {}

    food = _num(resources.get("food"))
    wood = _num(resources.get("wood"))
    threat = _num(gameplay.get("threat"))

    intent = policy.setdefault("intentWeights", {})
    targets = policy.setdefault("targetPriorities", {})

    if policy["groupId"] == "workers":
        if food < 12:
            intent["eat"] = _clamp(intent.get("eat", 1.0) + 0.6, MIN_WEIGHT_VALUE, MAX_WEIGHT_VALUE)
            intent["farm"] = _clamp(intent.get("farm", 1.0) + 0.3, MIN_WEIGHT_VALUE, MAX_WEIGHT_VALUE)
        if wood < 6:
            intent["wood"] = _clamp(intent.get("wood", 1.0) + 0.4, MIN_WEIGHT_VALUE, MAX_WEIGHT_VALUE)
        if isinstance(frontier.get("brokenRoutes"), list) and frontier["brokenRoutes"]:
            intent["deliver"] = _clamp(intent.get("deliver", 1.0) + 0.4, MIN_WEIGHT_VALUE, MAX_WEIGHT_VALUE)
            targets["road"] = _clamp(targets.get("road", 1.0) + 0.3, MIN_WEIGHT_VALUE, MAX_WEIGHT_VALUE)
        if threat >= 55:
            targets["safety"] = _clamp(targets.get("safety", 1.0) + 0.3, MIN_WEIGHT_VALUE, MAX_WEIGHT_VALUE)
            policy["riskTolerance"] = _clamp(float(policy.get("riskTolerance", 0.5)) - 0.08, 0.0, 1.0)


def build_policy_fallback(summary: dict[str, Any] | None) -> NpcPolicyEnvelope:
    """Build the deterministic npc-policy fallback envelope."""
    world = _world(summary)
    policies = _clone_default_policies()
    for policy in policies:
        _adjust_for_pressure(policy, world)
    threat = _num((world.get("gameplay") or {}).get("threat"))
    return guard_group_policies({"policies": policies, "stateTargets": []}, threat=threat)


__all__ = [
    "DEFAULT_GROUP_POLICIES",
    "build_environment_fallback",
    "build_policy_fallback",
]
