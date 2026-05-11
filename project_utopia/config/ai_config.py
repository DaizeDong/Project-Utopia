"""AI channel cadence / timeout / fallback config (port of ``src/config/aiConfig.js``).

Frozen mappings exposing the LLM-channel tuning surface:

* :data:`AI_CONFIG` — request timeouts, decision cadences, hard rate-limits.
* :data:`GROUP_IDS` — canonical group keys.
* :data:`GROUP_POLICY_CONTRACTS` — per-group allowed intents / targets.
* :data:`STRATEGY_CONFIG` — strategic-plan channel cadence + memory caps.
* :data:`DEFAULT_GROUP_POLICIES` — fallback policy values returned by
  :class:`~project_utopia.simulation.ai.llm.agent_adapter.NoopAgentAdapter`.

Plus helper functions ported VERBATIM (test parity):

* :func:`normalize_ai_token` — lowercase + space/dash → underscore.
* :func:`canonicalize_ai_group_id` — fuzzy match → canonical group ID.
* :func:`get_group_policy_contract`, :func:`list_allowed_policy_intents`,
  :func:`list_allowed_target_priorities` — contract lookup helpers.
"""

from __future__ import annotations

import re
from types import MappingProxyType

__all__ = [
    "AI_CONFIG",
    "DEFAULT_GROUP_POLICIES",
    "GROUP_IDS",
    "GROUP_POLICY_CONTRACTS",
    "POLICY_TEXT_LIMITS",
    "STRATEGY_CONFIG",
    "canonicalize_ai_group_id",
    "get_group_policy_contract",
    "list_allowed_policy_intents",
    "list_allowed_target_priorities",
    "normalize_ai_token",
]


AI_CONFIG: MappingProxyType[str, object] = MappingProxyType(
    {
        "environmentEndpoint": "/api/ai/environment",
        "policyEndpoint": "/api/ai/policy",
        "planEndpoint": "/api/ai/plan",
        # v0.8.5 Tier 3: 30s LLM timeout — 120s ties up the request slot
        # past any reasonable "do useful work" window.
        "requestTimeoutMs": 30000,
        "maxDirectiveDurationSec": 180,
        "maxPolicyTtlSec": 120,
        "minDecisionIntervalSec": 8,
        "enableByDefault": False,
        "retryAfterFailureSec": 8,
        # v0.8.5 Tier 3: cap LLM calls per hour at 240 so a runaway loop
        # cannot burn budget.
        "maxLLMCallsPerHour": 240,
    }
)


GROUP_IDS: MappingProxyType[str, str] = MappingProxyType(
    {
        "WORKERS": "workers",
        "TRADERS": "traders",
        "SABOTEURS": "saboteurs",
        "HERBIVORES": "herbivores",
        "PREDATORS": "predators",
    }
)

POLICY_TEXT_LIMITS: MappingProxyType[str, int] = MappingProxyType(
    {
        "summary": 140,
        "focus": 72,
        "note": 120,
        "maxNotes": 4,
    }
)


# ── Token helpers (verbatim port of normalizeAiToken / canonicalizeAiGroupId) ─

_SPACE_OR_DASH = re.compile(r"[\s\-]+")


def normalize_ai_token(raw: object) -> str:
    """Lowercase + collapse whitespace/dashes to underscores."""
    if raw is None:
        return ""
    return _SPACE_OR_DASH.sub("_", str(raw).strip().lower())


def canonicalize_ai_group_id(raw: object) -> str:
    """Map a fuzzy group-id token (singular/plural/synonyms) to its canonical form."""
    token = normalize_ai_token(raw)
    if not token:
        return ""
    if token in {"workers", "worker", "labor", "labour"}:
        return GROUP_IDS["WORKERS"]
    if token in {"traders", "trader", "merchant", "merchants"}:
        return GROUP_IDS["TRADERS"]
    if token in {"saboteurs", "saboteur", "raider", "raiders"}:
        return GROUP_IDS["SABOTEURS"]
    if token in {"herbivores", "herbivore", "prey"}:
        return GROUP_IDS["HERBIVORES"]
    if token in {"predators", "predator", "hunter", "hunters"}:
        return GROUP_IDS["PREDATORS"]
    return token


# ── Group policy contracts ───────────────────────────────────────────


def _contract(
    intents: tuple[str, ...], targets: tuple[str, ...], focus_hint: str
) -> MappingProxyType[str, object]:
    return MappingProxyType(
        {
            "allowedIntents": intents,
            "allowedTargets": targets,
            "focusHint": focus_hint,
        }
    )


GROUP_POLICY_CONTRACTS: MappingProxyType[str, MappingProxyType[str, object]] = MappingProxyType(
    {
        GROUP_IDS["WORKERS"]: _contract(
            (
                "farm",
                "wood",
                "deliver",
                "eat",
                "wander",
                "quarry",
            ),
            (
                "warehouse",
                "farm",
                "lumber",
                "road",
                "depot",
                "frontier",
                "safety",
                "quarry",
                "bridge",
            ),
            (
                "keep depots connected, push delivery before cargo stalls, "
                "and protect hunger-safe throughput"
            ),
        ),
        GROUP_IDS["TRADERS"]: _contract(
            ("trade", "eat", "wander"),
            ("warehouse", "road", "depot", "frontier", "safety", "farm"),
            (
                "favor defended depots and road-supported trade lanes while "
                "avoiding exposed corridors"
            ),
        ),
        GROUP_IDS["SABOTEURS"]: _contract(
            ("sabotage", "scout", "evade", "wander", "eat"),
            ("warehouse", "farm", "lumber", "road", "frontier", "choke", "exit"),
            (
                "pressure weak frontier corridors, exposed depots, and "
                "lightly defended chokepoints"
            ),
        ),
        GROUP_IDS["HERBIVORES"]: _contract(
            ("graze", "migrate", "flee"),
            ("grass", "farm", "wildlife", "road", "safety"),
            (
                "graze around habitat anchors, pressure farms only when "
                "hunger justifies it, and preserve escape routes"
            ),
        ),
        GROUP_IDS["PREDATORS"]: _contract(
            ("hunt", "stalk", "wander", "feed", "rest"),
            ("herbivore", "isolation", "wildlife", "farm", "safety"),
            (
                "hunt isolated prey, patrol frontier habitats, and only drift "
                "toward farms when prey pressure accumulates there"
            ),
        ),
    }
)


def get_group_policy_contract(group_id: object) -> MappingProxyType[str, object] | None:
    """Return the frozen contract for a fuzzy group-id, or ``None`` if unknown."""
    canonical = canonicalize_ai_group_id(group_id)
    return GROUP_POLICY_CONTRACTS.get(canonical)


def list_allowed_policy_intents(group_id: object) -> list[str]:
    """Return a mutable list of allowed intent strings for a group."""
    c = get_group_policy_contract(group_id)
    if c is None:
        return []
    intents = c["allowedIntents"]
    return list(intents)  # type: ignore[arg-type]


def list_allowed_target_priorities(group_id: object) -> list[str]:
    """Return a mutable list of allowed target priority strings for a group."""
    c = get_group_policy_contract(group_id)
    if c is None:
        return []
    targets = c["allowedTargets"]
    return list(targets)  # type: ignore[arg-type]


# ── Strategy + default group policy fallbacks ───────────────────────

STRATEGY_CONFIG: MappingProxyType[str, int] = MappingProxyType(
    {
        "heartbeatSec": 90,
        "cooldownSec": 15,
        "maxObservations": 50,
        "maxReflections": 20,
    }
)


def _freeze_policy(p: dict[str, object]) -> MappingProxyType[str, object]:
    """Wrap nested intent/target dicts in MappingProxyType, tuple steeringNotes."""
    out: dict[str, object] = {}
    for k, v in p.items():
        if isinstance(v, dict):
            out[k] = MappingProxyType(dict(v))
        elif isinstance(v, list):
            out[k] = tuple(v)
        else:
            out[k] = v
    return MappingProxyType(out)


DEFAULT_GROUP_POLICIES: MappingProxyType[str, MappingProxyType[str, object]] = MappingProxyType(
    {
        GROUP_IDS["WORKERS"]: _freeze_policy(
            {
                "groupId": GROUP_IDS["WORKERS"],
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
                "summary": (
                    "Keep workers fed, reconnect routes, and unload cargo "
                    "before harvest loops stall."
                ),
                "steeringNotes": [
                    "Protect delivery chains before raw output.",
                    "Avoid steering workers into hunger or cargo deadlocks.",
                ],
            }
        ),
        GROUP_IDS["TRADERS"]: _freeze_policy(
            {
                "groupId": GROUP_IDS["TRADERS"],
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
                "summary": (
                    "Route traders through defended warehouses and reliable "
                    "roads instead of idling on exposed lanes."
                ),
                "steeringNotes": [
                    "Trade should concentrate where route support and defenses are both present."
                ],
            }
        ),
        GROUP_IDS["SABOTEURS"]: _freeze_policy(
            {
                "groupId": GROUP_IDS["SABOTEURS"],
                "intentWeights": {
                    "sabotage": 1.5,
                    "scout": 1.0,
                    "evade": 0.9,
                    "wander": 0.2,
                },
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
                "summary": (
                    "Hit lightly defended depots, fragile corridors, and "
                    "productive tiles that keep the frontier supplied."
                ),
                "steeringNotes": [
                    "Prefer soft targets over protected walls.",
                    "Exit value should rise after a successful strike.",
                ],
            }
        ),
        GROUP_IDS["HERBIVORES"]: _freeze_policy(
            {
                "groupId": GROUP_IDS["HERBIVORES"],
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
                "summary": (
                    "Keep herds near habitat anchors, spill onto farms when "
                    "pressure builds, and preserve escape options."
                ),
                "steeringNotes": [
                    "Farm pressure should be visible but not constant.",
                    "Predator pressure must still dominate flee decisions.",
                ],
            }
        ),
        GROUP_IDS["PREDATORS"]: _freeze_policy(
            {
                "groupId": GROUP_IDS["PREDATORS"],
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
                "summary": (
                    "Favor isolated prey and frontier hotspots before "
                    "drifting toward safer or less consequential patrol paths."
                ),
                "steeringNotes": [
                    "Use farm hotspots as a secondary lure, not a replacement for live prey."
                ],
            }
        ),
    }
)
