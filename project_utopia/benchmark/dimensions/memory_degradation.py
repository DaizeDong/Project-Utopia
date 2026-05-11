"""Memory Degradation dimension plugin — Python port (S6 / S7 P0-12+P0-13 v2).

Mirrors ``src/benchmark/dimensions/MemoryDegradation.js``. Three-axis joint
analysis of long-horizon context decay; see paper §2.5.

Score families:

- ``anchored_fact_recall`` ∈ [0, 1] — fraction of injected anchors whose
  verbal tokens still appear in ``world_summary`` or ``strategy.notes``
  (here read off ``strategic_plan.summary`` as in the JS port).
- ``action_grounded_recall`` ∈ [0, 1] — fraction of injected anchors whose
  ``implicit_goals`` are still served by current directives
  (``target_priorities ∪ intent_weights`` with positive weight).
- ``behavioral_drift`` ∈ [0, ∞) — Jaccard distance of action-token sets
  between t=0 and now (proxy for KL on discrete token supports).
- ``performance_at_t`` ∈ [0, 1] — task signal (resource sufficiency × alive).
"""

from __future__ import annotations

from typing import Any

from ..framework.dimension_plugin import DimensionPlugin

TICKS_PER_SEC = 30.0
DEFAULT_IMPLICIT_GOAL_KEYS: tuple[str, ...] = ("deliver", "build", "guard", "farm")


def _clamp01(value: float) -> float:
    if value != value:  # NaN
        return 0.0
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return float(value)


def _coerce_dict_or_map(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return dict(raw.items())
    except (AttributeError, TypeError):
        return {}


def _extract_action_tokens(state: Any) -> set[str]:
    """Union of weighted intent/target tokens across all group policies.

    Handles both shapes:

    1. ``state.ai.group_policies`` as ``Mapping<group_id, {expires_at_sec, data: <policy>}>``
       (NPCBrainSystem runtime shape).
    2. ``state.ai.group_policies`` as ``Mapping<group_id, <policy>>``
       (test fixture / older snapshot shape).
    """
    tokens: set[str] = set()
    ai = state.get("ai") if isinstance(state, dict) else getattr(state, "ai", None)
    if not ai:
        return tokens
    policies_raw = _coerce_dict_or_map(
        (ai.get("group_policies") if isinstance(ai, dict) else None)
        or (ai.get("groupPolicies") if isinstance(ai, dict) else None)
    )
    for gid in sorted(policies_raw.keys()):
        wrap = policies_raw[gid]
        pol = wrap.get("data") if isinstance(wrap, dict) and "data" in wrap else wrap
        if not isinstance(pol, dict):
            continue
        iw = pol.get("intent_weights", pol.get("intentWeights")) or {}
        tp = pol.get("target_priorities", pol.get("targetPriorities")) or {}
        for intent, w in iw.items():
            try:
                if float(w) > 0:
                    tokens.add(str(intent).lower())
            except (TypeError, ValueError):
                continue
        for target, w in tp.items():
            try:
                if float(w) > 0:
                    tokens.add(str(target).lower())
            except (TypeError, ValueError):
                continue
    return tokens


class MemoryDegradationPlugin(DimensionPlugin):
    """Memory Degradation plugin."""

    id: str = "memory_degradation"
    label: str = "Memory Degradation"
    score_dimensions: tuple[str, ...] = (
        "anchored_fact_recall",
        "action_grounded_recall",
        "behavioral_drift",
        "performance_at_t",
    )

    async def collect_samples(
        self,
        harness: Any,
        opts: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        opts = opts or {}
        duration_sec = float(opts.get("duration_sec", opts.get("durationSec", 600)))
        sample_every_sec = float(opts.get("sample_every_sec", opts.get("sampleEverySec", 30)))
        session_discrete = bool(opts.get("session_discrete_mode", opts.get("sessionDiscreteMode", False)))
        session_reset_sec = float(opts.get("session_reset_sec", opts.get("sessionResetSec", 1800)))
        anchors = opts.get("anchors") or []

        samples: list[dict[str, Any]] = []
        total_ticks = max(1, round(duration_sec * TICKS_PER_SEC))
        sample_every_ticks = max(1, round(sample_every_sec * TICKS_PER_SEC))
        session_reset_ticks = max(1, round(session_reset_sec * TICKS_PER_SEC))
        last_session_reset_tick = 0
        baseline_action_tokens: set[str] | None = None

        for t in range(total_ticks):
            # P0-13: session-discrete ablation — periodically clear memory_store
            # and force a fresh strategic-plan call.
            if session_discrete and t > 0 and (t - last_session_reset_tick) >= session_reset_ticks:
                mem = getattr(harness, "memory_store", None) or getattr(harness, "memoryStore", None)
                if mem is not None and hasattr(mem, "clear") and callable(mem.clear):
                    mem.clear()
                last_session_reset_tick = t

            await harness.tick()
            if t % sample_every_ticks != 0:
                continue

            s = harness.state
            state_dict = s if isinstance(s, dict) else {
                k: getattr(s, k, None)
                for k in ("ai", "agents", "metrics", "gameplay", "session", "resources")
            }
            mem = getattr(harness, "memory_store", None) or getattr(harness, "memoryStore", None)
            memory_entries = ""
            if mem is not None and hasattr(mem, "format_for_prompt"):
                memory_entries = str(mem.format_for_prompt() or "")
            ai = state_dict.get("ai") or {}
            sp = ai.get("strategic_plan", ai.get("strategicPlan")) or {}
            summary = str(sp.get("summary", "") or "")
            action_tokens = _extract_action_tokens(state_dict)

            if baseline_action_tokens is None:
                baseline_action_tokens = set(action_tokens)

            agents = state_dict.get("agents") or []
            workers = [
                a for a in agents
                if (a.get("type") if isinstance(a, dict) else getattr(a, "type", None)) == "WORKER"
                and (a.get("alive", True) if isinstance(a, dict) else getattr(a, "alive", True)) is not False
            ]
            resources = state_dict.get("resources") or {}
            metrics = state_dict.get("metrics") or {}
            gameplay = state_dict.get("gameplay") or {}
            session = state_dict.get("session") or {}

            samples.append({
                "t": float(metrics.get("time_sec", metrics.get("timeSec", 0)) or 0),
                "memory_length": len(memory_entries),
                "strategic_summary": summary,
                "action_tokens": sorted(action_tokens),
                "baseline_action_tokens": sorted(baseline_action_tokens),
                "food": float(resources.get("food", 0) or 0),
                "wood": float(resources.get("wood", 0) or 0),
                "workers": len(workers),
                "prosperity": float(gameplay.get("prosperity", 0) or 0),
                "threat": float(gameplay.get("threat", 0) or 0),
            })
            if session.get("phase") == "end":
                break
        return samples

    def self_score(
        self,
        samples: list[dict[str, Any]],
        ctx: dict[str, Any] | None = None,
    ) -> dict[str, float]:
        if not samples:
            return {
                "anchored_fact_recall": 0.0,
                "action_grounded_recall": 0.0,
                "behavioral_drift": 0.0,
                "performance_at_t": 0.0,
            }
        ctx = ctx or {}
        raw_anchors = ctx.get("anchors") or []
        anchors: list[dict[str, Any]] = []
        for a in raw_anchors:
            if isinstance(a, dict):
                token = str(a.get("token", a.get("verbal_tokens", [None])[0] if a.get("verbal_tokens") else "") or "")
                goals_raw = a.get("implicit_goals", a.get("implicitGoals")) or list(DEFAULT_IMPLICIT_GOAL_KEYS)
                # implicit_goals may be a list of strings (JS shape) or a list of
                # {"action": ..., "target": ...} dicts (paper anchor shape) —
                # accept both, flattening dicts to their string values.
                goals: list[str] = []
                for g in goals_raw:
                    if isinstance(g, str):
                        goals.append(g.lower())
                    elif isinstance(g, dict):
                        for v in g.values():
                            if isinstance(v, str):
                                goals.append(v.lower())
            else:
                token = str(a)
                goals = [k.lower() for k in DEFAULT_IMPLICIT_GOAL_KEYS]
            anchors.append({"token": token, "implicit_goals": goals})

        # Verbal recall: anchor token in strategic summary
        verbal_hits = 0
        verbal_checks = 0
        if anchors:
            for sample in samples:
                for a in anchors:
                    verbal_checks += 1
                    if a["token"] and a["token"] in sample.get("strategic_summary", ""):
                        verbal_hits += 1
        verbal_recall = (verbal_hits / verbal_checks) if verbal_checks > 0 else 0.0

        # Action-grounded recall
        action_hits = 0
        action_checks = 0
        if anchors:
            for sample in samples:
                token_set = set(sample.get("action_tokens") or [])
                for a in anchors:
                    action_checks += 1
                    if any(goal in token_set for goal in a["implicit_goals"]):
                        action_hits += 1
        action_recall = (action_hits / action_checks) if action_checks > 0 else 0.0

        # Behavioral drift — Jaccard distance between current and baseline action-token sets.
        last = samples[-1]
        baseline = set(last.get("baseline_action_tokens") or [])
        current = set(last.get("action_tokens") or [])
        union = baseline | current
        intersection = baseline & current
        jaccard = (len(intersection) / len(union)) if len(union) > 0 else 1.0
        drift = 1.0 - jaccard

        # Performance at t — workers alive × food sufficiency
        w = max(1, int(last.get("workers", 0)))
        food_suf = _clamp01(float(last.get("food", 0.0)) / w)
        performance = (1.0 if last.get("workers", 0) > 0 else 0.0) * food_suf

        return {
            "anchored_fact_recall": round(verbal_recall, 4),
            "action_grounded_recall": round(action_recall, 4),
            "behavioral_drift": round(drift, 4),
            "performance_at_t": round(performance, 4),
        }


__all__ = ["MemoryDegradationPlugin"]
