"""NpcPolicySystem — npc-policy channel (Python port).

The system mirrors :class:`EnvironmentDirectorSystem` but operates on the
``npc-policy`` channel: it emits a per-group policy bag (intent weights,
target priorities, risk tolerance, TTL) which the worker/animal AI consumes
on subsequent ticks.

The raid-posture override (:data:`guardrails.RAID_THREAT_THRESHOLD`) is
applied through :func:`guard_group_policies`, which clamps combat-relevant
intents into a safe floor when ``state.gameplay["threat"] >= 80``.

Per RC3 audit, the JS chronicle (delta-menu analytics, debug aiTrace, policy
history ring) is dropped — those are evaluation-side concerns, not
runtime-loop ones.
"""

from __future__ import annotations

import math
from typing import Any

from ...ai.llm.agent_adapter import AgentAdapter, DecisionResponse
from ...ai.llm.guardrails import (
    RAID_COMBAT_INTENTS,
    RAID_MIN_INTENT_WEIGHT,
    guard_group_policies,
)
from ...ai.llm.prompt_payload import PromptPayload
from ...ai.llm.response_schema import NpcPolicyEnvelope
from ....app.ai_runtime_stats import (
    classify_ai_error_message,
    ensure_ai_runtime_stats,
    get_ai_coverage_target,
)

DEFAULT_NPC_POLICY_INTERVAL_SEC: float = 8.0
"""Default cadence (seconds) between npc-policy decisions."""

_NEVER_SEC: float = -999.0

# Canonical group ordering — sorted alphabetically so RNG-driven sampling in
# downstream consumers stays deterministic per the migration conventions
# (no insertion-order reliance).
REQUIRED_GROUP_IDS: tuple[str, ...] = (
    "herbivores",
    "predators",
    "saboteurs",
    "traders",
    "workers",
)


# ---------------------------------------------------------------------------
# Fallback policy (deterministic)
# ---------------------------------------------------------------------------


def _baseline_policy(group_id: str, threat: float) -> dict[str, Any]:
    """Per-group baseline policy. Raid-posture override is applied by guardrails."""
    if group_id == "workers":
        return {
            "groupId": "workers",
            "intentWeights": {
                "deliver": 1.6,
                "eat": 1.4,
                "farm": 1.0,
                "safety": 0.8 if threat < 40 else 1.4,
                "wander": 0.2,
                "wood": 1.0,
            },
            "riskTolerance": 0.5 if threat < 40 else 0.3,
            "targetPriorities": {
                "warehouse": 1.4,
                "frontier": 0.8,
                "safety": 1.0 if threat < 40 else 1.5,
            },
            "ttlSec": 24.0,
            "focus": "deliver",
            "summary": "Baseline worker policy: keep cargo flowing, eat when hungry.",
            "steeringNotes": [],
        }
    if group_id == "traders":
        return {
            "groupId": "traders",
            "intentWeights": {"trade": 1.4, "eat": 0.8, "wander": 0.3},
            "riskTolerance": 0.4,
            "targetPriorities": {"warehouse": 1.2, "frontier": 0.6},
            "ttlSec": 28.0,
            "focus": "trade",
            "summary": "Baseline trader loop.",
            "steeringNotes": [],
        }
    if group_id == "saboteurs":
        return {
            "groupId": "saboteurs",
            "intentWeights": {"sabotage": 1.2, "evade": 1.0, "scout": 0.6},
            "riskTolerance": 0.7,
            "targetPriorities": {"frontier": 1.0, "warehouse": 0.4},
            "ttlSec": 18.0,
            "focus": "sabotage",
            "summary": "Baseline saboteur loop.",
            "steeringNotes": [],
        }
    if group_id == "herbivores":
        return {
            "groupId": "herbivores",
            "intentWeights": {"graze": 1.2, "flee": 1.0 if threat < 40 else 1.6, "wander": 0.3},
            "riskTolerance": 0.2,
            "targetPriorities": {"safety": 1.0, "farm": 0.3},
            "ttlSec": 18.0,
            "focus": "graze",
            "summary": "Baseline herbivore loop.",
            "steeringNotes": [],
        }
    if group_id == "predators":
        return {
            "groupId": "predators",
            "intentWeights": {"hunt": 1.4, "stalk": 1.0, "feed": 0.6, "rest": 0.2},
            "riskTolerance": 0.7,
            "targetPriorities": {"farm": 0.6, "safety": 0.4},
            "ttlSec": 20.0,
            "focus": "hunt",
            "summary": "Baseline predator loop.",
            "steeringNotes": [],
        }
    # Unknown group → empty placeholder; guardrails will reject if id is blank.
    return {"groupId": group_id, "intentWeights": {}, "riskTolerance": 0.5, "ttlSec": 12.0}


def build_fallback_group_policies(state: dict[str, Any]) -> dict[str, Any]:
    """Build a deterministic policy envelope when the LLM is unavailable.

    Iterates groups in :data:`REQUIRED_GROUP_IDS` (sorted) so the resulting
    envelope is reproducible across runs.
    """
    gameplay = state.get("gameplay") if isinstance(state, dict) else {}
    if not isinstance(gameplay, dict):
        gameplay = {}
    try:
        threat = float(gameplay.get("threat", 0) or 0)
    except (TypeError, ValueError):
        threat = 0.0
    policies = [_baseline_policy(gid, threat) for gid in REQUIRED_GROUP_IDS]
    return {"policies": policies, "stateTargets": []}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_ai_slot(state: dict[str, Any]) -> dict[str, Any]:
    ai = state.get("ai")
    if not isinstance(ai, dict):
        ai = {}
        state["ai"] = ai
    ai.setdefault("enabled", True)
    ai.setdefault("coverageTarget", ai.get("coverageTarget") or "fallback")
    ai.setdefault("lastPolicyDecisionSec", _NEVER_SEC)
    ai.setdefault("policyDecisionCount", 0)
    ai.setdefault("policyLlmCount", 0)
    ai.setdefault("group_policies", {})
    return ai


def _wants_llm(state: dict[str, Any]) -> bool:
    ai = state.get("ai") if isinstance(state, dict) else {}
    if not isinstance(ai, dict):
        return False
    if ai.get("enabled") is False:
        return False
    run_mode = ai.get("run_mode")
    if isinstance(run_mode, str):
        return run_mode.strip().lower() == "llm"
    return get_ai_coverage_target(state) == "llm"


def _time_sec(state: dict[str, Any]) -> float:
    metrics = state.get("metrics") if isinstance(state, dict) else {}
    if not isinstance(metrics, dict):
        return 0.0
    try:
        v = float(metrics.get("timeSec", 0))
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def _threat(state: dict[str, Any]) -> float:
    gp = state.get("gameplay") if isinstance(state, dict) else {}
    if not isinstance(gp, dict):
        return 0.0
    try:
        v = float(gp.get("threat", 0) or 0)
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def _summary_from_state(state: dict[str, Any]) -> dict[str, Any]:
    world: dict[str, Any] = {}
    for key in ("resources", "gameplay", "weather", "events", "buildings", "population"):
        value = state.get(key) if isinstance(state, dict) else None
        if value is not None:
            world[key] = value
    return {"world": world}


# ---------------------------------------------------------------------------
# Telemetry plumbing (mirrors EnvironmentDirectorSystem)
# ---------------------------------------------------------------------------


def _record_request(state: dict[str, Any], stats: dict[str, Any], now: float) -> None:
    stats["requestCount"] = int(stats.get("requestCount", 0)) + 1
    stats["policyRequests"] = int(stats.get("policyRequests", 0)) + 1
    stats["lastRequestSec"] = float(now)


def _record_response(
    state: dict[str, Any],
    stats: dict[str, Any],
    *,
    response: DecisionResponse,
    now: float,
    fallback: bool,
    error: str,
) -> None:
    stats["responseCount"] = int(stats.get("responseCount", 0)) + 1
    stats["policyResponses"] = int(stats.get("policyResponses", 0)) + 1
    latency = float(response.latency_ms or 0.0)
    stats["lastLatencyMs"] = latency
    prior_avg = float(stats.get("avgLatencyMs", 0.0) or 0.0)
    count = int(stats.get("responseCount", 1)) or 1
    stats["avgLatencyMs"] = prior_avg + (latency - prior_avg) / max(1, count)
    stats["lastResponseSec"] = float(now)
    if fallback:
        stats["fallbackResponseCount"] = int(stats.get("fallbackResponseCount", 0)) + 1
        stats["lastFallbackSec"] = float(now)
        stats["consecutiveFallbackResponses"] = (
            int(stats.get("consecutiveFallbackResponses", 0)) + 1
        )
        stats["lastResultSource"] = "fallback"
    else:
        stats["llmResponseCount"] = int(stats.get("llmResponseCount", 0)) + 1
        stats["lastLiveSec"] = float(now)
        stats["consecutiveFallbackResponses"] = 0
        stats["lastResultSource"] = "llm"
    if error:
        stats["errorCount"] = int(stats.get("errorCount", 0)) + 1
        stats["lastErrorKind"] = classify_ai_error_message(error)
        stats["lastErrorMessage"] = str(error)[:200]
    if response.usage is not None:
        usage = response.usage
        stats["promptTokens"] = int(stats.get("promptTokens", 0)) + int(
            getattr(usage, "prompt_tokens", 0) or 0
        )
        stats["completionTokens"] = int(stats.get("completionTokens", 0)) + int(
            getattr(usage, "completion_tokens", 0) or 0
        )
        stats["cachedTokens"] = int(stats.get("cachedTokens", 0)) + int(
            getattr(usage, "cached_tokens", 0) or 0
        )


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------


class NpcPolicySystem:
    """npc-policy channel as a tick-driven System.

    Args:
        interval_sec: Cadence between decisions (default 8s).
    """

    name: str = "NpcPolicySystem"

    def __init__(self, *, interval_sec: float = DEFAULT_NPC_POLICY_INTERVAL_SEC) -> None:
        self.interval_sec = float(interval_sec)

    def update(self, dt: float, state: dict[str, Any], services: Any) -> None:
        del dt
        ai = _ensure_ai_slot(state)
        stats = ensure_ai_runtime_stats(state)
        now = _time_sec(state)
        threat = _threat(state)

        last = float(ai.get("lastPolicyDecisionSec", _NEVER_SEC))
        if last > _NEVER_SEC and (now - last) < self.interval_sec:
            return
        ai["lastPolicyDecisionSec"] = now
        _record_request(state, stats, now)

        summary = _summary_from_state(state)
        payload = PromptPayload(
            summary=summary,
            operational_highlights=[],
            memory_snippets=_collect_memory_snippets(services, now),
            tick=int(state.get("metrics", {}).get("tick", 0) or 0),
            time_sec=now,
        )

        wants_llm = _wants_llm(state)
        adapter: AgentAdapter | None = getattr(services, "agent_adapter", None)

        if not wants_llm or adapter is None:
            self._apply_fallback(state, ai, stats, now, threat=threat, error="")
            return

        from ..director.environment_director_system import _run_adapter  # avoid cycle

        try:
            response = _run_adapter(adapter, "npc-policy", payload)
        except BaseException as err:  # noqa: BLE001
            self._apply_fallback(
                state, ai, stats, now, threat=threat,
                error=str(err) or err.__class__.__name__,
            )
            return

        if response.fallback or response.data is None:
            self._apply_fallback(state, ai, stats, now, threat=threat, response=response)
            return

        from pydantic import ValidationError

        # Accept either a bare list of policies or the wrapped envelope.
        candidate = (
            {"policies": response.data} if isinstance(response.data, list) else response.data
        )
        try:
            validated = NpcPolicyEnvelope.model_validate(candidate)
        except ValidationError as err:
            guarded = guard_group_policies(candidate, threat=threat)
            self._commit_envelope(ai, stats, now, guarded, fallback=False, source="guarded")
            _record_response(
                state, stats, response=response, now=now, fallback=True, error=f"schema: {err}"
            )
            return

        guarded = guard_group_policies(validated.model_dump(by_alias=False), threat=threat)
        self._commit_envelope(ai, stats, now, guarded, fallback=False, source="llm")
        _record_response(state, stats, response=response, now=now, fallback=False, error="")

    # -- fallback / commit ---------------------------------------------------

    def _apply_fallback(
        self,
        state: dict[str, Any],
        ai: dict[str, Any],
        stats: dict[str, Any],
        now: float,
        *,
        threat: float,
        error: str = "",
        response: DecisionResponse | None = None,
    ) -> None:
        raw = build_fallback_group_policies(state)
        guarded = guard_group_policies(raw, threat=threat)
        self._commit_envelope(ai, stats, now, guarded, fallback=True, source="fallback")
        if response is None:
            stub = DecisionResponse(fallback=True, model="fallback", latency_ms=0.0, error=error)
            _record_response(state, stats, response=stub, now=now, fallback=True, error=error)
        else:
            _record_response(
                state,
                stats,
                response=response,
                now=now,
                fallback=True,
                error=error or response.error,
            )

    def _commit_envelope(
        self,
        ai: dict[str, Any],
        stats: dict[str, Any],
        now: float,
        envelope: NpcPolicyEnvelope,
        *,
        fallback: bool,
        source: str,
    ) -> None:
        dumped = envelope.model_dump(by_alias=False)
        # Index by group_id for fast O(1) consumer lookup.
        policies = dumped.get("policies", [])
        group_map: dict[str, dict[str, Any]] = {}
        for policy in policies:
            gid = policy.get("group_id") or policy.get("groupId")
            if isinstance(gid, str) and gid:
                group_map[gid] = policy
        ai["group_policies"] = group_map
        ai["lastPolicyEnvelope"] = envelope.model_dump(by_alias=True)
        ai["policyDecisionCount"] = int(ai.get("policyDecisionCount", 0)) + 1
        if not fallback:
            ai["policyLlmCount"] = int(ai.get("policyLlmCount", 0)) + 1
        ai["lastPolicySource"] = source
        ai["lastPolicyResultSec"] = float(now)
        ai["mode"] = "fallback" if fallback else "llm"
        del stats


def _collect_memory_snippets(services: Any, now: float) -> list[str]:
    store = getattr(services, "memory_store", None) if services is not None else None
    if store is None or not hasattr(store, "format_for_prompt"):
        return []
    try:
        text = store.format_for_prompt(limit=8, current_sim_sec=now)
    except TypeError:
        try:
            text = store.format_for_prompt(8)
        except Exception:  # noqa: BLE001
            return []
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(text, str) or not text.strip():
        return []
    return [line for line in text.splitlines() if line.strip()][:8]


__all__ = [
    "DEFAULT_NPC_POLICY_INTERVAL_SEC",
    "NpcPolicySystem",
    "REQUIRED_GROUP_IDS",
    "build_fallback_group_policies",
    "RAID_COMBAT_INTENTS",
    "RAID_MIN_INTENT_WEIGHT",
]
