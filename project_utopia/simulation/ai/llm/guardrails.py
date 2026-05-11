"""Guardrails — idempotent clamping + sanitisation for LLM directives.

This module is the *clamping* layer (NOT validation — validation lives in
:mod:`response_schema` and raises on bad input). Guardrails NEVER throw: they
drop unknown enum keys, clamp numbers into [min, max], truncate over-long
lists, and resurrect missing required fields from sensible fallbacks. Every
guard function is a **fixed point**::

    guard(guard(x)) == guard(x)

The raid-posture override (npc-policy channel) forcibly raises combat-relevant
intent weights when ``threat >= 80`` so the colony retains a baseline defence
behaviour even if the LLM hallucinates a peaceful directive in a high-threat
scenario.
"""

from __future__ import annotations

import math
from typing import Any, Iterable

from .response_schema import (
    DEFENSE_POSTURE_VALUES,
    EVENT_TYPE_VALUES,
    WEATHER_VALUES,
    EnvironmentDirective,
    EventSpawn,
    GroupPolicy,
    NpcPolicyEnvelope,
    StateTarget,
    StrategicPlan,
)

# ---------------------------------------------------------------------------
# Clamp constants (mirror src/config/aiConfig.js + src/config/balance.js).
# ---------------------------------------------------------------------------

MAX_DIRECTIVE_DURATION_SEC: int = 180
MIN_DIRECTIVE_DURATION_SEC: int = 8
MIN_POLICY_TTL_SEC: float = 8.0
MAX_POLICY_TTL_SEC: float = 120.0
MAX_EVENT_INTENSITY: float = 3.0
MIN_EVENT_INTENSITY: float = 0.4
MIN_EVENT_DURATION_SEC: float = 6.0
MAX_EVENT_DURATION_SEC: float = 60.0
MAX_WEIGHT_VALUE: float = 3.0
MIN_WEIGHT_VALUE: float = 0.0
MAX_EVENT_SPAWNS: int = 3
MAX_STEERING_NOTES: int = 4
MAX_SUMMARY_LEN: int = 140
MAX_FOCUS_LEN: int = 72
MAX_NOTE_LEN: int = 120

RAID_THREAT_THRESHOLD: float = 80.0
RAID_COMBAT_INTENTS: tuple[str, ...] = ("evade", "flee", "deliver", "safety")
RAID_MIN_INTENT_WEIGHT: float = 1.5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clamp(value: Any, lo: float, hi: float, default: float = 0.0) -> float:
    """Clamp ``value`` into ``[lo, hi]`` — non-finite or non-numeric → ``default``."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return float(default)
    if not math.isfinite(v):
        return float(default)
    if v < lo:
        return float(lo)
    if v > hi:
        return float(hi)
    return float(v)


def _clamp_int(value: Any, lo: int, hi: int, default: int) -> int:
    """Integer variant of :func:`_clamp` — returns ``int``."""
    return int(_clamp(value, lo, hi, default))


def _sanitize_text(value: Any, limit: int) -> str:
    """Whitespace-collapse, strip, and truncate to ``limit`` chars."""
    raw = "" if value is None else str(value)
    collapsed = " ".join(raw.split())
    return collapsed[:limit]


def _sanitize_notes(notes: Any, fallback: Iterable[str] | None = None) -> list[str]:
    """Sanitise + de-duplicate a list of steering notes, capped at MAX_STEERING_NOTES."""
    candidates: list[Any] = []
    if isinstance(notes, list) and len(notes) > 0:
        candidates = list(notes)
    elif fallback is not None:
        candidates = list(fallback)
    out: list[str] = []
    for note in candidates[: MAX_STEERING_NOTES * 2]:
        clean = _sanitize_text(note, MAX_NOTE_LEN)
        if not clean or clean in out:
            continue
        out.append(clean)
        if len(out) >= MAX_STEERING_NOTES:
            break
    return out


def _clamp_weights(
    raw: Any,
    *,
    allowed: Iterable[str] | None = None,
    lo: float = MIN_WEIGHT_VALUE,
    hi: float = MAX_WEIGHT_VALUE,
) -> dict[str, float]:
    """Clamp every value in a weight dict to ``[lo, hi]``.

    If ``allowed`` is non-None, keys outside the allowlist are dropped (this is
    how guardrails removes hallucinated enum keys like ``intent_weights={"yeet": 9}``).
    Non-string keys and non-finite values are silently dropped.
    """
    if not isinstance(raw, dict):
        return {}
    allowed_set = set(allowed) if allowed is not None else None
    out: dict[str, float] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or not key.strip():
            continue
        if allowed_set is not None and key not in allowed_set:
            continue
        try:
            v = float(value)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(v):
            continue
        out[key] = _clamp(v, lo, hi, 0.0)
    return out


# ---------------------------------------------------------------------------
# environment-director
# ---------------------------------------------------------------------------


def _focus_for_weather(weather: str) -> str:
    if weather == "rain":
        return "contested logistics lane"
    if weather == "storm":
        return "storm front pressure"
    if weather == "drought":
        return "farm stress belt"
    if weather == "winter":
        return "winter route drag"
    return "stable frontier"


def guard_environment_directive(directive: Any) -> EnvironmentDirective:
    """Idempotent clamp+sanitise → validated :class:`EnvironmentDirective`.

    Never raises. Drops unknown weather/event enums, clamps every numeric to
    spec range, and truncates ``event_spawns`` to :data:`MAX_EVENT_SPAWNS`.
    """
    if isinstance(directive, EnvironmentDirective):
        # Already a model — round-trip through dump for the fixed-point guarantee.
        directive = directive.model_dump(by_alias=False)
    if not isinstance(directive, dict):
        directive = {}

    weather = directive.get("weather") or directive.get("weatherType")
    if weather not in WEATHER_VALUES:
        weather = "clear"

    duration_sec = _clamp_int(
        directive.get("duration_sec", directive.get("durationSec", 18)),
        MIN_DIRECTIVE_DURATION_SEC,
        MAX_DIRECTIVE_DURATION_SEC,
        default=18,
    )
    faction_tension = _clamp(
        directive.get("faction_tension", directive.get("factionTension", 0.5)),
        0.0,
        1.0,
        default=0.5,
    )

    raw_spawns = directive.get("event_spawns") or directive.get("eventSpawns") or []
    if not isinstance(raw_spawns, list):
        raw_spawns = []
    event_spawns: list[EventSpawn] = []
    for spawn in raw_spawns[:MAX_EVENT_SPAWNS]:
        if not isinstance(spawn, dict):
            continue
        stype = spawn.get("type")
        if stype not in EVENT_TYPE_VALUES:
            continue
        intensity = _clamp(
            spawn.get("intensity", 1.0),
            MIN_EVENT_INTENSITY,
            MAX_EVENT_INTENSITY,
            default=1.0,
        )
        dur = _clamp(
            spawn.get("duration_sec", spawn.get("durationSec", 14)),
            MIN_EVENT_DURATION_SEC,
            MAX_EVENT_DURATION_SEC,
            default=14.0,
        )
        event_spawns.append(EventSpawn(type=stype, intensity=intensity, duration_sec=dur))

    fallback_focus = _focus_for_weather(weather)
    focus = _sanitize_text(directive.get("focus"), MAX_FOCUS_LEN) or fallback_focus
    summary = _sanitize_text(directive.get("summary"), MAX_SUMMARY_LEN)
    if not summary:
        summary = (
            f"Maintain {focus} for {duration_sec}s without obscuring the map's main pressure."
        )

    steering_notes = _sanitize_notes(
        directive.get("steering_notes") or directive.get("steeringNotes")
    )
    if not steering_notes:
        if weather in ("rain", "storm"):
            steering_notes = ["Keep route pressure spatial and readable."]
        else:
            steering_notes = ["Prefer scenario-linked pressure over generic noise."]

    return EnvironmentDirective(
        weather=weather,
        duration_sec=duration_sec,
        faction_tension=faction_tension,
        event_spawns=event_spawns,
        focus=focus,
        summary=summary,
        steering_notes=steering_notes,
    )


# ---------------------------------------------------------------------------
# npc-policy
# ---------------------------------------------------------------------------


def _apply_raid_posture(intent_weights: dict[str, float], threat: float) -> dict[str, float]:
    """If ``threat >= RAID_THREAT_THRESHOLD``, forcibly raise combat-relevant intents.

    This is the "guardrails never let combat-defence weights drop below
    :data:`RAID_MIN_INTENT_WEIGHT` while under raid" rule from the JS port,
    extracted into one place so callers can reason about when it fires.
    """
    if threat < RAID_THREAT_THRESHOLD:
        return intent_weights
    boosted = dict(intent_weights)
    for intent in RAID_COMBAT_INTENTS:
        cur = boosted.get(intent, 0.0)
        if cur < RAID_MIN_INTENT_WEIGHT:
            boosted[intent] = RAID_MIN_INTENT_WEIGHT
    return boosted


def guard_group_policy(
    policy: Any,
    *,
    threat: float = 0.0,
    allowed_intents: Iterable[str] | None = None,
    allowed_targets: Iterable[str] | None = None,
) -> GroupPolicy | None:
    """Clamp + sanitise a single :class:`GroupPolicy`. Returns ``None`` if
    ``group_id`` is missing/empty (caller drops the entry)."""
    if isinstance(policy, GroupPolicy):
        policy = policy.model_dump(by_alias=False)
    if not isinstance(policy, dict):
        return None

    group_id = str(policy.get("group_id") or policy.get("groupId") or "").strip()
    if not group_id:
        return None

    intent_weights = _clamp_weights(
        policy.get("intent_weights") or policy.get("intentWeights"),
        allowed=allowed_intents,
    )
    target_priorities = _clamp_weights(
        policy.get("target_priorities") or policy.get("targetPriorities"),
        allowed=allowed_targets,
    )
    intent_weights = _apply_raid_posture(intent_weights, threat)

    risk_tolerance = _clamp(
        policy.get("risk_tolerance", policy.get("riskTolerance", 0.5)),
        0.0,
        1.0,
        default=0.5,
    )
    ttl_sec = _clamp(
        policy.get("ttl_sec", policy.get("ttlSec", 24)),
        MIN_POLICY_TTL_SEC,
        MAX_POLICY_TTL_SEC,
        default=24.0,
    )

    summary = _sanitize_text(policy.get("summary"), MAX_SUMMARY_LEN) or None
    focus = _sanitize_text(policy.get("focus"), MAX_FOCUS_LEN) or None
    steering_notes = _sanitize_notes(
        policy.get("steering_notes") or policy.get("steeringNotes")
    )

    return GroupPolicy(
        group_id=group_id,
        intent_weights=intent_weights,
        risk_tolerance=risk_tolerance,
        target_priorities=target_priorities,
        ttl_sec=ttl_sec,
        summary=summary,
        focus=focus,
        steering_notes=steering_notes,
    )


def guard_group_policies(payload: Any, *, threat: float = 0.0) -> NpcPolicyEnvelope:
    """Clamp + sanitise an :class:`NpcPolicyEnvelope` (list of policies + state targets).

    Drops:
      - policies with empty ``group_id``
      - duplicate group IDs (first wins)
      - state targets pointing at unknown groups
      - state targets with empty ``target_state``
    """
    if isinstance(payload, NpcPolicyEnvelope):
        payload = payload.model_dump(by_alias=False)
    if not isinstance(payload, dict):
        payload = {}

    raw_policies = payload.get("policies") or []
    if not isinstance(raw_policies, list):
        raw_policies = []
    seen: set[str] = set()
    policies: list[GroupPolicy] = []
    for candidate in raw_policies:
        guarded = guard_group_policy(candidate, threat=threat)
        if guarded is None:
            continue
        if guarded.group_id in seen:
            continue
        seen.add(guarded.group_id)
        policies.append(guarded)

    valid_groups = {p.group_id for p in policies}
    raw_targets = payload.get("state_targets") or payload.get("stateTargets") or []
    if not isinstance(raw_targets, list):
        raw_targets = []
    state_targets: list[StateTarget] = []
    seen_pairs: set[tuple[str, str]] = set()
    for target in raw_targets:
        if not isinstance(target, dict):
            continue
        group_id = str(target.get("group_id") or target.get("groupId") or "").strip()
        target_state = str(
            target.get("target_state") or target.get("targetState") or ""
        ).strip()
        if not group_id or not target_state:
            continue
        if group_id not in valid_groups:
            continue
        key = (group_id, target_state)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        priority = _clamp(target.get("priority", 0.5), 0.0, 1.0, default=0.5)
        ttl_sec = _clamp(
            target.get("ttl_sec", target.get("ttlSec", 12)),
            0.0,
            MAX_POLICY_TTL_SEC,
            default=12.0,
        )
        reason = _sanitize_text(target.get("reason"), 160) or None
        state_targets.append(
            StateTarget(
                group_id=group_id,
                target_state=target_state,
                priority=priority,
                ttl_sec=ttl_sec,
                reason=reason,
            )
        )

    return NpcPolicyEnvelope(policies=policies, state_targets=state_targets)


# ---------------------------------------------------------------------------
# strategic-plan
# ---------------------------------------------------------------------------


def guard_strategic_plan(plan: Any) -> StrategicPlan:
    """Clamp + sanitise a :class:`StrategicPlan`. Always returns a valid plan."""
    if isinstance(plan, StrategicPlan):
        plan = plan.model_dump(by_alias=False)
    if not isinstance(plan, dict):
        plan = {}

    primary_goal = _sanitize_text(
        plan.get("primary_goal") or plan.get("primaryGoal") or "survive", 160
    )
    if not primary_goal:
        primary_goal = "survive"

    raw_constraints = plan.get("constraints") or []
    if not isinstance(raw_constraints, list):
        raw_constraints = []
    constraints: list[str] = []
    for c in raw_constraints[:8]:
        s = _sanitize_text(c, 200)
        if s:
            constraints.append(s)

    resource_budget = _clamp_weights(
        plan.get("resource_budget") or plan.get("resourceBudget"),
        lo=0.0,
        hi=1000.0,
    )

    phase = _sanitize_text(plan.get("phase"), 32) or "bootstrap"
    defense_posture = plan.get("defense_posture") or plan.get("defensePosture") or "neutral"
    if defense_posture not in DEFENSE_POSTURE_VALUES:
        defense_posture = "neutral"

    risk_tolerance = plan.get("risk_tolerance", plan.get("riskTolerance"))
    if risk_tolerance is not None:
        risk_tolerance = _clamp(risk_tolerance, 0.0, 1.0, default=0.5)

    return StrategicPlan(
        primary_goal=primary_goal,
        constraints=constraints,
        resource_budget=resource_budget,
        phase=phase,
        defense_posture=defense_posture,
        risk_tolerance=risk_tolerance,
    )


__all__ = [
    "MAX_DIRECTIVE_DURATION_SEC",
    "MAX_EVENT_SPAWNS",
    "MAX_POLICY_TTL_SEC",
    "MAX_WEIGHT_VALUE",
    "MIN_POLICY_TTL_SEC",
    "RAID_COMBAT_INTENTS",
    "RAID_MIN_INTENT_WEIGHT",
    "RAID_THREAT_THRESHOLD",
    "guard_environment_directive",
    "guard_group_policies",
    "guard_group_policy",
    "guard_strategic_plan",
]
