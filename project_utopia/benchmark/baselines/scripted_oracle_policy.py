"""ScriptedOraclePolicy — hand-tuned per-scenario ceiling baseline (W1 P0-6).

Python port of ``src/benchmark/baselines/ScriptedOraclePolicy.js``. Six
scenario blueprints map the four canonical channels (environment-director /
npc-policy / strategic-plan / colony-agent) to authored directives.

**Idempotency invariant**: every blueprint is pre-clamped through
:func:`guard_environment_directive` / :func:`guard_group_policies` so that

    guard(guard(x)) == guard(x)

holds on the first call (a second :func:`request` pass is a no-op). This is
enforced by ``tests/benchmark/baselines/test_scripted_oracle_idempotent.py``.

The six scenarios — ``temperate_plains``, ``fertile_riverlands``,
``rugged_highlands``, ``coastal_ocean``, ``archipelago_isles``,
``fortified_basin`` — are ported VERBATIM from the JS source.
"""

from __future__ import annotations

import time
import warnings
from collections.abc import Callable
from typing import Any

from ...config.ai_config import GROUP_IDS
from ...config.constants import EVENT_TYPE, WEATHER
from ...simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    CHANNELS,
    DecisionResponse,
    SCHEMA_VERSION,
    UsageStats,
)
from ...simulation.ai.llm.guardrails import (
    guard_environment_directive,
    guard_group_policies,
)


def _now_ms() -> float:
    return time.monotonic() * 1000.0


# ---------------------------------------------------------------------------
# Scenario blueprints (verbatim port of the JS SCENARIO_BLUEPRINTS table).
# ---------------------------------------------------------------------------


def _temperate_plains_env() -> dict[str, Any]:
    return {
        "weather": WEATHER["CLEAR"],
        "duration_sec": 60,
        "faction_tension": 0.2,
        "event_spawns": [],
        "focus": "stable harvest belt",
        "summary": "Maintain calm weather while the colony scales food and storage.",
        "steering_notes": [
            "No raid pressure during the food bootstrap.",
            "Prefer scenario-linked pressure over generic noise.",
        ],
    }


def _temperate_plains_policy() -> dict[str, Any]:
    return {
        "policies": [
            {
                "group_id": GROUP_IDS["WORKERS"],
                "intent_weights": {
                    "farm": 2.5,
                    "wood": 1.6,
                    "deliver": 2.0,
                    "eat": 1.4,
                    "wander": 0.2,
                    "quarry": 0.6,
                },
                "risk_tolerance": 0.4,
                "target_priorities": {
                    "warehouse": 1.7,
                    "farm": 1.4,
                    "lumber": 1.0,
                    "road": 1.05,
                    "depot": 1.3,
                    "frontier": 0.7,
                    "safety": 1.2,
                    "quarry": 0.7,
                    "bridge": 0.6,
                },
                "ttl_sec": 60,
                "focus": "food-first depot throughput",
                "summary": "Keep workers fed and harvest cargo flowing into warehouses before any cosmetic chores.",
                "steering_notes": [
                    "Protect food chain over wood expansion.",
                    "Avoid worker idle by routing to nearest unfilled depot.",
                ],
            },
        ],
        "state_targets": [],
    }


def _temperate_plains_strategic() -> dict[str, Any]:
    return {
        "directive": {
            "focus": "secure food supply, build 3 warehouses by day 5",
            "horizon_sec": 180,
            "priority_chain": ["food", "storage", "lumber", "stone"],
        },
        "summary": "Bootstrap the food economy first; do not overbuild military before warehouses exist.",
        "steering_notes": [
            "Secure food before any defensive build.",
            "Three warehouses minimum before military investment.",
        ],
    }


def _temperate_plains_colony() -> dict[str, Any]:
    return {
        "build_plan": [
            {"type": "farm", "priority": 3},
            {"type": "lumber", "priority": 2},
            {"type": "warehouse", "priority": 3},
        ],
        "summary": "Order: farm → lumber → warehouse; defer combat infra until food buffer exists.",
        "steering_notes": [
            "Scale farms first, then storage.",
        ],
    }


def _fortified_basin_env() -> dict[str, Any]:
    return {
        "weather": WEATHER["CLEAR"],
        "duration_sec": 45,
        "faction_tension": 0.6,
        "event_spawns": [
            {"type": EVENT_TYPE["BANDIT_RAID"], "intensity": 0.8, "duration_sec": 20},
        ],
        "focus": "chokepoint pressure ramp",
        "summary": "Telegraph a raid window so guards can fortify before contact.",
        "steering_notes": [
            "Pressure should be readable to defenders on the central chokepoint.",
            "Avoid scattering wildlife pressure during raid windows.",
        ],
    }


def _fortified_basin_policy() -> dict[str, Any]:
    return {
        "policies": [
            {
                "group_id": GROUP_IDS["WORKERS"],
                "intent_weights": {
                    "farm": 1.4,
                    "wood": 1.4,
                    "deliver": 1.6,
                    "eat": 1.2,
                    "wander": 0.2,
                    "quarry": 1.5,
                },
                "risk_tolerance": 0.3,
                "target_priorities": {
                    "warehouse": 1.5,
                    "farm": 0.9,
                    "lumber": 1.0,
                    "road": 1.0,
                    "depot": 1.2,
                    "frontier": 0.8,
                    "safety": 1.5,
                    "quarry": 1.4,
                    "bridge": 0.6,
                },
                "ttl_sec": 60,
                "focus": "fortify chokepoint",
                "summary": "Push stone into the chokepoint while keeping food intake steady.",
                "steering_notes": [
                    "Maintain four guards minimum on the central chokepoint.",
                    "Prioritize defensive infra over expansion during raid windows.",
                ],
            },
            {
                "group_id": GROUP_IDS["SABOTEURS"],
                "intent_weights": {"sabotage": 1.5, "scout": 1.0, "evade": 1.0, "wander": 0.2},
                "risk_tolerance": 0.7,
                "target_priorities": {
                    "warehouse": 1.3,
                    "farm": 1.0,
                    "lumber": 0.9,
                    "road": 0.8,
                    "frontier": 1.2,
                    "choke": 1.2,
                    "exit": 0.7,
                },
                "ttl_sec": 45,
                "focus": "frontier disruption",
                "summary": "Exploit raid window cover to hit warehouses; retreat through frontier.",
                "steering_notes": ["Soft targets only; avoid wall pushes."],
            },
        ],
        "state_targets": [],
    }


def _fortified_basin_strategic() -> dict[str, Any]:
    return {
        "directive": {
            "focus": "fortify chokepoint at center, maintain 4 guards minimum",
            "horizon_sec": 180,
            "priority_chain": ["wall", "stone", "warehouse"],
        },
        "summary": "Defense first; expansion second. Hold the center until raid pressure breaks.",
        "steering_notes": [
            "Wall before any new farm.",
            "Keep warehouse adjacent to barracks for fast supply.",
        ],
    }


def _fortified_basin_colony() -> dict[str, Any]:
    return {
        "build_plan": [
            {"type": "wall", "priority": 3},
            {"type": "warehouse", "priority": 2},
            {"type": "quarry", "priority": 2},
        ],
        "summary": "Order: wall → warehouse → quarry; defer expansion until defended.",
        "steering_notes": [
            "Lock the chokepoint before scaling farms.",
        ],
    }


def _rugged_highlands_env() -> dict[str, Any]:
    return {
        "weather": WEATHER["CLEAR"],
        "duration_sec": 60,
        "faction_tension": 0.3,
        "event_spawns": [
            {"type": EVENT_TYPE["ANIMAL_MIGRATION"], "intensity": 0.6, "duration_sec": 18},
        ],
        "focus": "stone-rich highland exploitation",
        "summary": "Clear skies favor mining throughput; occasional rockfall pressure on highland routes.",
        "steering_notes": [
            "Prefer scenario-linked pressure over generic noise.",
            "Telegraph rockfall along highland paths, not over depots.",
        ],
    }


def _rugged_highlands_policy() -> dict[str, Any]:
    return {
        "policies": [
            {
                "group_id": GROUP_IDS["WORKERS"],
                "intent_weights": {
                    "farm": 1.4,
                    "wood": 1.5,
                    "deliver": 2.0,
                    "eat": 1.4,
                    "wander": 0.2,
                    "quarry": 2.5,
                },
                "risk_tolerance": 0.3,
                "target_priorities": {
                    "warehouse": 1.6,
                    "farm": 1.0,
                    "lumber": 1.2,
                    "road": 1.1,
                    "depot": 1.3,
                    "frontier": 0.8,
                    "safety": 1.3,
                    "quarry": 1.7,
                    "bridge": 0.7,
                },
                "ttl_sec": 60,
                "focus": "stone-rich highland exploitation",
                "summary": "Concentrate workers on quarry throughput while keeping food intake steady against rockfall risk.",
                "steering_notes": [
                    "Push stone into smithy and warehouse before any cosmetic chores.",
                    "Reinforce against rockfall before expanding farms.",
                ],
            },
        ],
        "state_targets": [],
    }


def _rugged_highlands_strategic() -> dict[str, Any]:
    return {
        "directive": {
            "focus": "stone-rich highland exploitation, reinforce against rockfall",
            "horizon_sec": 180,
            "priority_chain": ["stone", "wood", "food"],
        },
        "summary": "Lean into stone advantage; reinforce highland routes before food shortages compound.",
        "steering_notes": [
            "Quarry first, then storage, then food.",
        ],
    }


def _rugged_highlands_colony() -> dict[str, Any]:
    return {
        "build_plan": [
            {"type": "quarry", "priority": 3},
            {"type": "lumber", "priority": 2},
            {"type": "warehouse", "priority": 3},
        ],
        "summary": "Order: quarry → lumber → warehouse; food belt scales after stone is stockpiled.",
        "steering_notes": [
            "Lean into stone advantage; defer farms until stockpiles exist.",
        ],
    }


def _archipelago_isles_env() -> dict[str, Any]:
    return {
        "weather": WEATHER["CLEAR"],
        "duration_sec": 50,
        "faction_tension": 0.4,
        "event_spawns": [],
        "focus": "bridge network across isles",
        "summary": "Calm windows between storms; pressure rises on isolated isles cut off from the central hub.",
        "steering_notes": [
            "Pressure should be readable on cut-off isles, not generic noise.",
            "Avoid scattering wildlife pressure across distant water tiles.",
        ],
    }


def _archipelago_isles_policy() -> dict[str, Any]:
    return {
        "policies": [
            {
                "group_id": GROUP_IDS["WORKERS"],
                "intent_weights": {
                    "farm": 1.3,
                    "wood": 2.0,
                    "deliver": 2.0,
                    "eat": 1.3,
                    "wander": 1.0,
                    "quarry": 1.2,
                },
                "risk_tolerance": 0.5,
                "target_priorities": {
                    "warehouse": 1.6,
                    "farm": 1.0,
                    "lumber": 1.4,
                    "road": 1.2,
                    "depot": 1.3,
                    "frontier": 1.1,
                    "safety": 1.1,
                    "quarry": 0.9,
                    "bridge": 1.7,
                },
                "ttl_sec": 60,
                "focus": "bridge network across isles",
                "summary": "Push wood and bridges to connect isles before food belts stall on isolated tiles.",
                "steering_notes": [
                    "Bridge frontier isles before scaling farms there.",
                    "Keep central hub depot saturated to stage cargo.",
                ],
            },
        ],
        "state_targets": [],
    }


def _archipelago_isles_strategic() -> dict[str, Any]:
    return {
        "directive": {
            "focus": "establish bridge network across isles, secure central hub",
            "horizon_sec": 180,
            "priority_chain": ["wood", "bridge", "storage", "food"],
        },
        "summary": "Connect isles first; the central hub feeds and stores until bridges relieve isolation.",
        "steering_notes": [
            "Wood and bridges before any frontier farm.",
            "Hub warehouse must stay above 50 percent to stage cargo.",
        ],
    }


def _archipelago_isles_colony() -> dict[str, Any]:
    return {
        "build_plan": [
            {"type": "bridge", "priority": 3},
            {"type": "warehouse", "priority": 3},
            {"type": "lumber", "priority": 2},
        ],
        "summary": "Order: bridge → warehouse → lumber; food network depends on connection first.",
        "steering_notes": [
            "Bridge before farm; isolated farms starve carriers.",
        ],
    }


def _coastal_ocean_env() -> dict[str, Any]:
    return {
        "weather": WEATHER["CLEAR"],
        "duration_sec": 55,
        "faction_tension": 0.2,
        "event_spawns": [],
        "focus": "coastal supply line",
        "summary": "Calm coastline favors farm expansion inland while the supply line holds along the shore.",
        "steering_notes": [
            "Prefer scenario-linked pressure over generic noise.",
            "Keep weather pressure off the inland farm belt.",
        ],
    }


def _coastal_ocean_policy() -> dict[str, Any]:
    return {
        "policies": [
            {
                "group_id": GROUP_IDS["WORKERS"],
                "intent_weights": {
                    "farm": 2.0,
                    "wood": 1.6,
                    "deliver": 2.0,
                    "eat": 1.4,
                    "wander": 0.3,
                    "quarry": 0.8,
                },
                "risk_tolerance": 0.4,
                "target_priorities": {
                    "warehouse": 1.6,
                    "farm": 1.5,
                    "lumber": 1.1,
                    "road": 1.1,
                    "depot": 1.3,
                    "frontier": 0.9,
                    "safety": 1.2,
                    "quarry": 0.8,
                    "bridge": 0.9,
                },
                "ttl_sec": 60,
                "focus": "coastal supply line",
                "summary": "Anchor farms inland and keep the coastal depot chain above the cargo waterline.",
                "steering_notes": [
                    "Protect the coastal supply line over inland expansion.",
                    "Avoid worker idle by routing to nearest unfilled depot.",
                ],
            },
        ],
        "state_targets": [],
    }


def _coastal_ocean_strategic() -> dict[str, Any]:
    return {
        "directive": {
            "focus": "secure coastal supply line, expand inland farms",
            "horizon_sec": 180,
            "priority_chain": ["food", "storage", "wood"],
        },
        "summary": "Secure the coastal lane first; once warehouses are saturated, push farms inland.",
        "steering_notes": [
            "Coast before frontier; do not abandon supply for expansion.",
            "Keep one warehouse adjacent to the coast for cargo staging.",
        ],
    }


def _coastal_ocean_colony() -> dict[str, Any]:
    return {
        "build_plan": [
            {"type": "farm", "priority": 3},
            {"type": "lumber", "priority": 2},
            {"type": "warehouse", "priority": 3},
        ],
        "summary": "Order: farm → lumber → warehouse; coastal storage before any combat infra.",
        "steering_notes": [
            "Anchor farms inland; depot adjacent to coast.",
        ],
    }


def _fertile_riverlands_env() -> dict[str, Any]:
    return {
        "weather": WEATHER["CLEAR"],
        "duration_sec": 90,
        "faction_tension": 0.15,
        "event_spawns": [],
        "focus": "fertile river plain harvest",
        "summary": "Long calm window favors farm scale-up across the fertile river plain.",
        "steering_notes": [
            "No raid pressure during the food bootstrap.",
            "Prefer scenario-linked pressure over generic noise.",
        ],
    }


def _fertile_riverlands_policy() -> dict[str, Any]:
    return {
        "policies": [
            {
                "group_id": GROUP_IDS["WORKERS"],
                "intent_weights": {
                    "farm": 3.0,
                    "wood": 2.0,
                    "deliver": 2.2,
                    "eat": 1.4,
                    "wander": 0.2,
                    "quarry": 0.8,
                },
                "risk_tolerance": 0.5,
                "target_priorities": {
                    "warehouse": 1.7,
                    "farm": 1.6,
                    "lumber": 1.2,
                    "road": 1.1,
                    "depot": 1.3,
                    "frontier": 0.8,
                    "safety": 1.0,
                    "quarry": 0.7,
                    "bridge": 0.8,
                },
                "ttl_sec": 60,
                "focus": "fertile river plain harvest",
                "summary": "Run farms at maximum cadence; warehouses absorb harvest before any combat infra.",
                "steering_notes": [
                    "Farms first, then storage.",
                    "Avoid worker idle by routing to nearest unfilled depot.",
                ],
            },
        ],
        "state_targets": [],
    }


def _fertile_riverlands_strategic() -> dict[str, Any]:
    return {
        "directive": {
            "focus": "exploit fertile river plains, scale food production",
            "horizon_sec": 180,
            "priority_chain": ["food", "storage", "wood"],
        },
        "summary": "River plains let farms outscale storage; build warehouses ahead of the harvest cliff.",
        "steering_notes": [
            "Stay ahead of the harvest cliff with warehouse builds.",
        ],
    }


def _fertile_riverlands_colony() -> dict[str, Any]:
    return {
        "build_plan": [
            {"type": "farm", "priority": 3},
            {"type": "farm", "priority": 3},
            {"type": "warehouse", "priority": 3},
            {"type": "lumber", "priority": 2},
        ],
        "summary": "Order: farm → farm → warehouse → lumber; double farms before any combat infra.",
        "steering_notes": [
            "Double farms before any combat infra.",
        ],
    }


# Mapping: scenario_id -> { channel -> builder callable }
SCENARIO_BLUEPRINTS: dict[str, dict[str, Callable[[], dict[str, Any]]]] = {
    "temperate_plains": {
        "environment-director": _temperate_plains_env,
        "npc-policy": _temperate_plains_policy,
        "strategic-plan": _temperate_plains_strategic,
        "colony-agent": _temperate_plains_colony,
    },
    "fortified_basin": {
        "environment-director": _fortified_basin_env,
        "npc-policy": _fortified_basin_policy,
        "strategic-plan": _fortified_basin_strategic,
        "colony-agent": _fortified_basin_colony,
    },
    "rugged_highlands": {
        "environment-director": _rugged_highlands_env,
        "npc-policy": _rugged_highlands_policy,
        "strategic-plan": _rugged_highlands_strategic,
        "colony-agent": _rugged_highlands_colony,
    },
    "archipelago_isles": {
        "environment-director": _archipelago_isles_env,
        "npc-policy": _archipelago_isles_policy,
        "strategic-plan": _archipelago_isles_strategic,
        "colony-agent": _archipelago_isles_colony,
    },
    "coastal_ocean": {
        "environment-director": _coastal_ocean_env,
        "npc-policy": _coastal_ocean_policy,
        "strategic-plan": _coastal_ocean_strategic,
        "colony-agent": _coastal_ocean_colony,
    },
    "fertile_riverlands": {
        "environment-director": _fertile_riverlands_env,
        "npc-policy": _fertile_riverlands_policy,
        "strategic-plan": _fertile_riverlands_strategic,
        "colony-agent": _fertile_riverlands_colony,
    },
}

SUPPORTED_SCENARIOS: tuple[str, ...] = tuple(sorted(SCENARIO_BLUEPRINTS.keys()))


def _is_supported(scenario_id: str) -> bool:
    return scenario_id in SCENARIO_BLUEPRINTS


def _apply_guardrails(channel: str, data: dict[str, Any]) -> dict[str, Any]:
    """Pre-clamp blueprint output so guard(guard(x)) == guard(x)."""
    if channel == "environment-director":
        return guard_environment_directive(data).model_dump(by_alias=False)
    if channel == "npc-policy":
        return guard_group_policies(data).model_dump(by_alias=False)
    return data


class ScriptedOraclePolicy(AgentAdapter):
    """Per-scenario hand-tuned ceiling baseline (all 6 scenarios supported)."""

    _warned: set[str] = set()

    def __init__(self, scenario_id: str, opts: dict[str, Any] | None = None) -> None:
        super().__init__()
        self.scenario_id = str(scenario_id or "")
        self.opts = opts or {}
        self.fallback_scenario_id = "temperate_plains"

        if not _is_supported(self.scenario_id):
            if self.scenario_id not in ScriptedOraclePolicy._warned:
                ScriptedOraclePolicy._warned.add(self.scenario_id)
                warnings.warn(
                    f"[ScriptedOraclePolicy] no blueprint for scenario "
                    f"{self.scenario_id!r} — falling back to {self.fallback_scenario_id}",
                    stacklevel=2,
                )

    async def request(
        self,
        channel: str,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        start_ms = _now_ms()
        if channel not in CHANNELS:
            return self._build_error_response(channel, payload, f"unsupported channel: {channel}", start_ms)
        scenario_key = self.scenario_id if _is_supported(self.scenario_id) else self.fallback_scenario_id
        blueprint = SCENARIO_BLUEPRINTS.get(scenario_key)
        builder = blueprint.get(channel) if blueprint else None
        if not callable(builder):
            return self._build_error_response(channel, payload, f"no blueprint for channel: {channel}", start_ms)

        try:
            data = builder()
        except Exception as err:  # noqa: BLE001
            return self._build_error_response(channel, payload, str(err) or "builder error", start_ms)

        # Reviewer Round-1 O-1 P1 fix — pre-clamp through Guardrails so the
        # returned data is already idempotent.
        try:
            data = _apply_guardrails(channel, data)
        except Exception as err:  # noqa: BLE001
            return self._build_error_response(channel, payload, f"guardrail: {err}", start_ms)

        latency_ms = max(0.0, _now_ms() - start_ms)
        return DecisionResponse(
            data=data,
            fallback=False,
            usage=UsageStats(prompt_tokens=0, completion_tokens=0, cached_tokens=0),
            latency_ms=latency_ms,
            model=f"scripted-oracle:{scenario_key}",
            error="",
            debug={
                "channel": channel,
                "scenario": scenario_key,
                "schema_version": SCHEMA_VERSION,
            },
        )

    def _build_error_response(
        self,
        channel: str,
        payload: Any,
        error: str,
        start_ms: float,
    ) -> DecisionResponse:
        latency_ms = max(0.0, _now_ms() - start_ms)
        return DecisionResponse(
            data=None,
            fallback=True,
            usage=UsageStats(prompt_tokens=0, completion_tokens=0, cached_tokens=0),
            latency_ms=latency_ms,
            model="scripted-oracle:error",
            error=error,
            debug={"channel": channel, "scenario": self.scenario_id, "payload_echo": payload},
        )

    @classmethod
    def supported_scenarios(cls) -> tuple[str, ...]:
        return SUPPORTED_SCENARIOS


def build_oracle_policy(scenario_id: str) -> ScriptedOraclePolicy:
    """Convenience factory mirroring ``buildOraclePolicy`` from JS."""
    return ScriptedOraclePolicy(scenario_id)


__all__ = [
    "SCENARIO_BLUEPRINTS",
    "SUPPORTED_SCENARIOS",
    "ScriptedOraclePolicy",
    "build_oracle_policy",
]
