"""Hierarchical Coordination dimension plugin — Python port (S6 / RC3 G3).

Mirrors ``src/benchmark/dimensions/HierarchicalCoordination.js`` including
the RC3 G3 ``plan_policy_alignment`` wiring (preserved EXACTLY).

Score families (mixed scales — DO NOT pipe directly into bayesian_score):

- ``plan_policy_alignment`` ∈ [0, 1] — Per-sample fraction of strategic-
  plan tokens (derived from ``state.ai.strategy.{priority, resource_focus,
  worker_focus, phase, defense_posture}``) that appear with positive weight
  in the workers group's directive
  (``intent_weights`` ∪ ``target_priorities`` ∪ focus). Averaged across
  samples that have both snapshots.
- ``env_threat_responsiveness`` ∈ [-1, 1] — Pearson correlation of
  ``faction_tension`` vs ``threat``.
- ``colony_cadence_health`` ∈ [0, ∞) — std-dev of decision intervals
  (lower is better).
"""

from __future__ import annotations

import math
import re
from typing import Any

from ..framework.dimension_plugin import DimensionPlugin

TICKS_PER_SEC = 30.0

_WHITESPACE_RE = re.compile(r"\s+")


def _state_get(state: Any, key: str, default: Any = None) -> Any:
    if isinstance(state, dict):
        return state.get(key, default)
    return getattr(state, key, default)


def _coerce_dict_or_map(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return dict(raw.items())
    except (AttributeError, TypeError):
        return {}


def _plan_tokens(strategy: dict[str, Any] | None) -> list[str]:
    """Map strategic-plan field values to directive-token vocabulary.

    One-direction match: each plan field contributes one or more tokens;
    alignment is the fraction of plan tokens present in the workers
    directive. Preserves order and dedupes (matches JS port's
    ``Array.from(new Set(...))`` semantics).
    """
    if not strategy or not isinstance(strategy, dict):
        return []
    tokens: list[str] = []
    # resource_focus directly maps to canonical intent / target keys.
    rf = str(strategy.get("resource_focus", strategy.get("resourceFocus", "")) or "").lower()
    if rf == "food":
        tokens.append("farm")
    elif rf == "wood":
        tokens.extend(("wood", "lumber"))
    elif rf == "stone":
        tokens.extend(("quarry", "stone"))
    # worker_focus is already in the intent vocabulary.
    wf = str(strategy.get("worker_focus", strategy.get("workerFocus", "")) or "").lower()
    if wf and wf != "balanced":
        tokens.append(wf)
    # priority maps to high-level objective.
    pri = str(strategy.get("priority", "") or "").lower()
    if pri == "defend":
        tokens.append("safety")
    elif pri == "survive":
        tokens.extend(("eat", "safety"))
    elif pri == "complete_objective":
        tokens.append("deliver")
    # phase
    phase = str(strategy.get("phase", "") or "").lower()
    if phase == "industrialize":
        tokens.append("quarry")
    elif phase == "fortify":
        tokens.append("safety")
    elif phase == "optimize":
        tokens.append("deliver")
    # defense_posture
    dp = str(strategy.get("defense_posture", strategy.get("defensePosture", "")) or "").lower()
    if dp in ("defensive", "aggressive"):
        tokens.append("safety")
    # Dedup, keep order.
    seen: set[str] = set()
    out: list[str] = []
    for tok in tokens:
        if tok and tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def _directive_token_set(policy: dict[str, Any] | None) -> set[str]:
    """Extract directive-token set with positive weight from one group policy."""
    out: set[str] = set()
    if not policy or not isinstance(policy, dict):
        return out
    iw = policy.get("intent_weights", policy.get("intentWeights")) or {}
    tp = policy.get("target_priorities", policy.get("targetPriorities")) or {}
    for k, w in iw.items():
        try:
            if float(w) > 0:
                out.add(str(k).lower())
        except (TypeError, ValueError):
            continue
    for k, w in tp.items():
        try:
            if float(w) > 0:
                out.add(str(k).lower())
        except (TypeError, ValueError):
            continue
    focus = str(policy.get("focus", "") or "").lower()
    for tok in _WHITESPACE_RE.split(focus):
        if tok:
            out.add(tok)
    return out


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = min(len(xs), len(ys))
    if n < 2:
        return 0.0
    mx = sum(xs[:n]) / n
    my = sum(ys[:n]) / n
    num = 0.0
    dx2 = 0.0
    dy2 = 0.0
    for i in range(n):
        dx = xs[i] - mx
        dy = ys[i] - my
        num += dx * dy
        dx2 += dx * dx
        dy2 += dy * dy
    if dx2 == 0 or dy2 == 0:
        return 0.0
    return num / math.sqrt(dx2 * dy2)


class HierarchicalCoordinationPlugin(DimensionPlugin):
    """Hierarchical Coordination plugin — RC3 G3 ``plan_policy_alignment`` wired."""

    id: str = "hierarchical"
    label: str = "Hierarchical Coordination"
    score_dimensions: tuple[str, ...] = (
        "plan_policy_alignment",
        "env_threat_responsiveness",
        "colony_cadence_health",
    )

    async def collect_samples(
        self,
        harness: Any,
        opts: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        opts = opts or {}
        duration_sec = float(opts.get("duration_sec", opts.get("durationSec", 600)))
        samples: list[dict[str, Any]] = []
        total_ticks = max(1, round(duration_sec * TICKS_PER_SEC))
        sample_every_ticks = max(1, round(10 * TICKS_PER_SEC))

        last_colony_decision_at = 0.0
        colony_intervals: list[float] = []

        for t in range(total_ticks):
            await harness.tick()
            if t % sample_every_ticks != 0:
                continue
            s = harness.state
            ai = _state_get(s, "ai", None) or {}
            colony_agent = (ai.get("colony_agent", ai.get("colonyAgent")) or {})
            colony_decision_at = float(colony_agent.get("last_decision_sec", colony_agent.get("lastDecisionSec", 0)) or 0)
            if colony_decision_at > last_colony_decision_at:
                colony_intervals.append(colony_decision_at - last_colony_decision_at)
                last_colony_decision_at = colony_decision_at

            strategy = ai.get("strategy") or None
            policies_raw = _coerce_dict_or_map(ai.get("group_policies", ai.get("groupPolicies")))
            worker_policy = None
            if "workers" in policies_raw:
                wrap = policies_raw["workers"]
                worker_policy = wrap.get("data") if isinstance(wrap, dict) and "data" in wrap else wrap

            metrics = _state_get(s, "metrics", None) or {}
            env = ai.get("environment_directive", ai.get("environmentDirective")) or {}
            gameplay = _state_get(s, "gameplay", None) or {}
            session = _state_get(s, "session", None) or {}

            strategy_snapshot: dict[str, Any] | None = None
            if strategy:
                strategy_snapshot = {
                    "priority": strategy.get("priority"),
                    "resource_focus": strategy.get("resource_focus", strategy.get("resourceFocus")),
                    "worker_focus": strategy.get("worker_focus", strategy.get("workerFocus")),
                    "phase": strategy.get("phase"),
                    "defense_posture": strategy.get("defense_posture", strategy.get("defensePosture")),
                }
            worker_policy_snapshot: dict[str, Any] | None = None
            if worker_policy and isinstance(worker_policy, dict):
                worker_policy_snapshot = {
                    "intent_weights": dict(worker_policy.get("intent_weights", worker_policy.get("intentWeights")) or {}),
                    "target_priorities": dict(worker_policy.get("target_priorities", worker_policy.get("targetPriorities")) or {}),
                    "focus": worker_policy.get("focus", "") or "",
                }

            samples.append({
                "t": float(metrics.get("time_sec", metrics.get("timeSec", 0)) or 0),
                "faction_tension": float(env.get("faction_tension", env.get("factionTension", 0)) or 0),
                "threat": float(gameplay.get("threat", 0) or 0),
                "prosperity": float(gameplay.get("prosperity", 0) or 0),
                "strategy_snapshot": strategy_snapshot,
                "worker_policy_snapshot": worker_policy_snapshot,
            })
            if session.get("phase") == "end":
                break

        # Attach intervals — Python lists allow attributes via wrapping; we
        # return a plain list and store the intervals on a sentinel key in
        # the last sample so callers can pull them out without surprises.
        # The JS port set `samples._colonyIntervals` on the Array; here we
        # use a dict envelope through ctx in self_score, or attach via a
        # dedicated key. Because samples is iterated by index downstream we
        # cannot stash on the list — instead append a hidden sentinel sample.
        # Simpler: store as a class attr on self for the duration of one
        # collect+score cycle (single-threaded plugin contract).
        self._last_colony_intervals = list(colony_intervals)
        return samples

    def self_score(
        self,
        samples: list[dict[str, Any]],
        ctx: dict[str, Any] | None = None,
    ) -> dict[str, float]:
        if not samples:
            return {
                "plan_policy_alignment": 0.0,
                "env_threat_responsiveness": 0.0,
                "colony_cadence_health": 0.0,
            }
        faction_series = [float(s.get("faction_tension", 0.0)) for s in samples]
        threat_series = [float(s.get("threat", 0.0)) for s in samples]
        corr = _pearson(faction_series, threat_series)

        intervals = getattr(self, "_last_colony_intervals", None)
        if ctx and "colony_intervals" in ctx:
            intervals = list(ctx["colony_intervals"])
        intervals = intervals or []
        std_dev = 0.0
        if len(intervals) > 1:
            m = sum(intervals) / len(intervals)
            variance = sum((x - m) ** 2 for x in intervals) / len(intervals)
            std_dev = math.sqrt(variance)

        # plan_policy_alignment: per-sample fraction of plan tokens that
        # appear with positive weight in the workers directive. Averaged
        # across samples that have BOTH a strategy snapshot AND a workers
        # directive (skipping samples where either is None). Returns 0 if
        # no sample has both — never NaN.
        align_sum = 0.0
        align_count = 0
        for s in samples:
            strategy = s.get("strategy_snapshot")
            policy = s.get("worker_policy_snapshot")
            if not strategy or not policy:
                continue
            tokens = _plan_tokens(strategy)
            if not tokens:
                continue
            directive_tokens = _directive_token_set(policy)
            hits = sum(1 for tok in tokens if tok in directive_tokens)
            align_sum += hits / len(tokens)
            align_count += 1
        alignment = (align_sum / align_count) if align_count > 0 else 0.0

        return {
            "plan_policy_alignment": round(alignment, 4),
            "env_threat_responsiveness": round(corr, 4),
            "colony_cadence_health": round(std_dev, 2),
        }


__all__ = ["HierarchicalCoordinationPlugin"]
