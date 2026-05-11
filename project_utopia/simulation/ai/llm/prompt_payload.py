"""PromptPayload — observation envelope passed to the LLM channels.

A dataclass + helpers mirroring the JS ``PromptPayload.js`` module. The
``pick_highlights`` helper extracts the operationally-loud signals from a
world summary (broken routes, food runway, soil crisis, defence gap …) so
each channel sees the same compact pressure brief.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Highlight extraction (port of pickHighlights in PromptPayload.js)
# ---------------------------------------------------------------------------


def _num(value: Any, default: float = 0.0) -> float:
    """Best-effort numeric coercion — non-finite / non-numeric → ``default``."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    return v


def pick_highlights(summary: dict[str, Any] | None, *, k: int = 8) -> list[str]:
    """Pick the top-``k`` operational highlights from a world summary.

    Mirrors ``PromptPayload.js::pickHighlights`` — exhaustive port of every
    crisis branch so the JS and Python channels see identical bullet lists.
    """
    if not isinstance(summary, dict):
        return ["World is currently stable; keep policies legible and avoid noisy steering."]

    world = summary.get("world") or summary or {}
    objective = world.get("objective") or {}
    gameplay = world.get("gameplay") or {}
    frontier = world.get("frontier") or {}
    logistics = world.get("logistics") or {}
    ecology = world.get("ecology") or {}
    events = world.get("events") if isinstance(world.get("events"), list) else []
    highlights: list[str] = []

    scenario = world.get("scenario") or {}
    if scenario.get("title"):
        sub = scenario.get("summary") or scenario.get("family") or "no summary"
        highlights.append(f"Scenario {scenario['title']}: {sub}")
    if objective.get("title"):
        progress = _num(objective.get("progress"), 0.0)
        hint = objective.get("hint") or objective.get("description") or "no hint"
        highlights.append(f"Objective {objective['title']} at {progress:.0f}%: {hint}")

    broken_routes = frontier.get("brokenRoutes") or []
    if isinstance(broken_routes, list) and len(broken_routes) > 0:
        highlights.append(f"Broken routes: {', '.join(str(r) for r in broken_routes)}")
    unready_depots = frontier.get("unreadyDepots") or []
    if isinstance(unready_depots, list) and len(unready_depots) > 0:
        highlights.append(f"Unready depots: {', '.join(str(d) for d in unready_depots)}")

    if _num(logistics.get("isolatedWorksites")) > 0 or _num(logistics.get("overloadedWarehouses")) > 0:
        highlights.append(
            "Logistics pressure: "
            f"isolated={int(_num(logistics.get('isolatedWorksites')))}, "
            f"overloaded={int(_num(logistics.get('overloadedWarehouses')))}, "
            f"stranded={int(_num(logistics.get('strandedCarryWorkers')))}"
        )
    if _num(ecology.get("pressuredFarms")) > 0 or _num(ecology.get("frontierPredators")) > 0:
        highlights.append(
            "Ecology pressure: "
            f"farms={int(_num(ecology.get('pressuredFarms')))}, "
            f"frontier predators={int(_num(ecology.get('frontierPredators')))}, "
            f"max pressure={_num(ecology.get('maxFarmPressure')):.2f}"
        )
    if events:
        lead = events[0] if isinstance(events[0], dict) else {}
        highlights.append(
            f"Active pressure: {lead.get('type','?')} on {lead.get('targetLabel') or 'frontier'} "
            f"severity={lead.get('severity','-')} pressure={_num(lead.get('pressure')):.2f}"
        )
    recovery = gameplay.get("recovery") or {}
    if _num(recovery.get("collapseRisk")) >= 40:
        highlights.append(
            f"Recovery risk {_num(recovery.get('collapseRisk')):.0f}% "
            f"with {int(_num(recovery.get('charges')))} charges left"
        )

    soil = world.get("soil") or {}
    if _num(soil.get("criticalSalinized")) > 0:
        highlights.append(
            f"SOIL CRISIS: {int(_num(soil.get('criticalSalinized')))} farm(s) critically salinized "
            "— need fallow immediately"
        )
    elif _num(soil.get("salinizedFarmCount")) > 0:
        highlights.append(
            f"Soil health: {int(_num(soil.get('salinizedFarmCount')))} farm(s) above 60% salinization"
        )
    nodes = world.get("nodes") or {}
    if _num(nodes.get("depletedForestCount")) > 0:
        highlights.append(
            f"LUMBER CRISIS: {int(_num(nodes.get('depletedForestCount')))} lumber mill(s) on depleted nodes"
        )
    if _num(nodes.get("atRiskNodeCount")) > 0:
        highlights.append(
            f"Resource nodes: {int(_num(nodes.get('atRiskNodeCount')))} node(s) below 60% yield capacity"
        )
    connectivity = world.get("connectivity") or {}
    if _num(connectivity.get("waterIsolatedResources")) > 0:
        coord = connectivity.get("bridgeCoord")
        loc = (
            f" at tile ({int(_num(coord.get('ix')))},{int(_num(coord.get('iz')))})"
            if isinstance(coord, dict)
            else ""
        )
        highlights.append(
            f"WATER BARRIER: {int(_num(connectivity.get('waterIsolatedResources')))} "
            f"resource tile(s) cut off by water — build bridge{loc}"
        )
    terrain = world.get("terrain") or {}
    if _num(terrain.get("lowMoistureRatio")) > 0.4:
        pct = round(_num(terrain.get("lowMoistureRatio")) * 100)
        highlights.append(
            f"Dry terrain: {pct}% of land is low-moisture — herb gardens and farms may underperform"
        )

    headroom = _num(world.get("population", {}).get("foodHeadroomSec"), default=math.inf)
    if math.isfinite(headroom) and headroom < 9999:
        if headroom < 30:
            highlights.append(
                f"FOOD RUNWAY CRITICAL: {headroom:.0f}s headroom — DO NOT recruit; "
                "queue farm/kitchen instead."
            )
        elif headroom < 60:
            highlights.append(
                f"Food runway low: {headroom:.0f}s headroom (recruit gate fires below 60s) "
                "— defer recruit until production catches up."
            )
        elif headroom < 180:
            highlights.append(
                f"Food runway: {headroom:.0f}s headroom — recruit OK but watch drain rate."
            )

    population = world.get("population") or {}
    buildings = world.get("buildings") or {}
    resources = world.get("resources") or {}
    worker_count = _num(population.get("workers"))
    extraction = (
        _num(buildings.get("farms"))
        + _num(buildings.get("lumbers"))
        + _num(buildings.get("quarries"))
    )
    processing = (
        _num(buildings.get("kitchens"))
        + _num(buildings.get("smithies"))
        + _num(buildings.get("clinics"))
    )
    food_flow = _num(resources.get("food")) >= 8
    wood_flow = _num(resources.get("wood")) >= 4
    stone_flow = _num(resources.get("stone")) >= 2
    wood_starved_treadmill = _num(resources.get("wood")) < 4 and extraction >= 5
    non_bootstrap = (food_flow and (wood_flow or stone_flow)) or wood_starved_treadmill or processing == 0
    if worker_count >= 10 and extraction >= 5 and non_bootstrap:
        ratio = extraction / max(1.0, extraction + processing)
        if ratio > 0.65 or processing == 0:
            highlights.append(
                f"Role distribution: extractor-saturated ({int(worker_count)} workers, "
                f"{int(extraction)} extraction vs {int(processing)} processing sites) "
                "— recruit/promote BUILDER, GUARD, COOK/SMITH instead of more farms/lumbers/quarries."
            )

    threat_level = _num(gameplay.get("threat"))
    wall_count = _num(buildings.get("walls"))
    if threat_level >= 55 and wall_count <= 2 and worker_count >= 8:
        highlights.append(
            f"Defense gap: threat={threat_level:.0f} with only {int(wall_count)} wall(s) "
            "— promote GUARDs and queue defense_line instead of more extraction."
        )

    if not highlights:
        highlights.append(
            "World is currently stable; keep policies legible and avoid noisy steering."
        )
    return highlights[:k]


# ---------------------------------------------------------------------------
# PromptPayload dataclass
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class PromptPayload:
    """Observation envelope passed to LLM channels.

    Attributes:
        summary: Full world summary (output of :func:`build_world_summary`).
        operational_highlights: Top-k pressure bullets (see :func:`pick_highlights`).
        memory_snippets: List of recent memory entries formatted for prompt
            injection (see :class:`MemoryStore.format_for_prompt`).
        tick: Current simulation tick index.
        time_sec: Current simulation time in seconds.
    """

    summary: dict[str, Any] = field(default_factory=dict)
    operational_highlights: list[dict[str, Any] | str] = field(default_factory=list)
    memory_snippets: list[dict[str, Any] | str] = field(default_factory=list)
    tick: int = 0
    time_sec: float = 0.0

    def pick_highlights(self, k: int = 8) -> list[str]:
        """Extract the top-``k`` operational highlights from ``self.summary``."""
        return pick_highlights(self.summary, k=k)

    def to_wire_dict(self) -> dict[str, Any]:
        """Return a JSON-safe dict using camelCase keys for NDJSON compat."""
        return {
            "summary": self.summary,
            "operationalHighlights": list(self.operational_highlights),
            "memorySnippets": list(self.memory_snippets),
            "tick": int(self.tick),
            "timeSec": float(self.time_sec),
        }

    def to_json(self) -> str:
        """Stable JSON serialization for cache-key hashing."""
        return json.dumps(self.to_wire_dict(), sort_keys=True, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Channel-specific prompt builders (port of buildEnvironmentPromptUserContent
# and buildPolicyPromptUserContent).
# ---------------------------------------------------------------------------


_POLICY_GROUP_ORDER = ("workers", "traders", "saboteurs", "herbivores", "predators")
_WEATHER_VALUES = ("clear", "rain", "storm", "drought", "winter")
_EVENT_TYPE_VALUES = (
    "animalMigration",
    "banditRaid",
    "tradeCaravan",
    "moraleBreak",
    "diseaseOutbreak",
    "wildfire",
)


def build_environment_prompt_user_content(summary: dict[str, Any]) -> str:
    """Build the environment-director user message body (port of JS variant)."""
    payload = {
        "channel": "environment-director",
        "summary": summary,
        "operationalHighlights": pick_highlights(summary),
        "allowedWeather": list(_WEATHER_VALUES),
        "allowedEvents": list(_EVENT_TYPE_VALUES),
        "explanationFields": ["summary", "focus", "steeringNotes"],
        "hardRules": [
            "Shape short-horizon pressure around the current scenario and objective instead of random global chaos.",
            "Prefer spatially legible weather and events that reinforce route gaps, depots, chokepoints, and wildlife zones already present in summary.world.frontier and scenario data.",
            "If resources or recovery are fragile, lower pressure rather than escalating.",
        ],
        "constraint": "Return strict JSON only. No markdown. No prose outside the JSON fields.",
    }
    if isinstance(summary, dict):
        if summary.get("_strategyContext"):
            payload["strategyContext"] = summary["_strategyContext"]
        if summary.get("_memoryContext"):
            payload["recentMemory"] = summary["_memoryContext"]
    return json.dumps(payload, indent=2)


def build_policy_prompt_user_content(summary: dict[str, Any]) -> str:
    """Build the npc-policy user message body (port of JS variant)."""
    payload = {
        "channel": "npc-policy",
        "summary": summary,
        "operationalHighlights": pick_highlights(summary),
        "groupOrder": list(_POLICY_GROUP_ORDER),
        "explanationFields": ["summary", "focus", "steeringNotes"],
        "hardRules": [
            "Use only the allowed intentWeights and targetPriorities keys listed for each group.",
            "Preserve local feasibility: workers must still deliver carried cargo, hunger-safe states outrank cosmetic steering, and wildlife safety should remain plausible.",
            "Prefer a small number of strong priorities over flat noisy weights.",
            "State targets should reinforce the current route/depot/objective pressure, not contradict it.",
        ],
        "constraint": "Return strict JSON only. No markdown. No prose outside the JSON fields.",
    }
    if isinstance(summary, dict):
        if summary.get("_strategyContext"):
            payload["strategyContext"] = summary["_strategyContext"]
        if summary.get("_memoryContext"):
            payload["recentMemory"] = summary["_memoryContext"]
    return json.dumps(payload, indent=2)


__all__ = [
    "PromptPayload",
    "build_environment_prompt_user_content",
    "build_policy_prompt_user_content",
    "pick_highlights",
]
