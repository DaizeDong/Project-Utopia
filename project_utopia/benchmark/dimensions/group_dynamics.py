"""Group Dynamics dimension plugin — Python port (S6 / RC3 G3).

Mirrors ``src/benchmark/dimensions/GroupDynamics.js`` including the RC3 G3
wirings (preserved EXACTLY):

- ``intent_entropy`` — Shannon entropy over ``intent_weights`` per group,
  mean across groups across samples.
- ``coalition_coupling`` — Mean Pearson correlation across all unordered
  group pairs over their ``target_priorities`` weight vectors. Per pair we
  form the union of priority keys and align both vectors (zero-fill missing).
  Pairs with degenerate (constant) vectors contribute 0. Mean across pairs
  computed per sample, then averaged across samples. Range ∈ [-1, 1].
- ``state_target_obedience`` — Pooled
  ``Σ workers_in_target_state / Σ workers_in_any_state``. Joins per-tick
  ``state.ai.group_state_targets[gid].target_state`` against per-agent
  ``fsm.state`` counts. Range ∈ [0, 1].
- ``faction_responsiveness`` — Pearson correlation between sample-time
  ``faction_tension`` and active hostile-group agent count
  (``predators`` ∪ ``saboteurs``). Range ∈ [-1, 1]. Distinct from
  ``env_threat_responsiveness`` (which uses ``threat``).
"""

from __future__ import annotations

import math
from typing import Any

from ..framework.dimension_plugin import DimensionPlugin

TICKS_PER_SEC = 30.0
HOSTILE_GROUPS: frozenset[str] = frozenset({"predators", "saboteurs"})


def _entropy(weights: list[float] | tuple[float, ...]) -> float:
    """Shannon entropy in bits over a non-negative weight vector."""
    total = sum(max(0.0, float(w)) for w in weights)
    if total <= 0:
        return 0.0
    h = 0.0
    for w in weights:
        p = max(0.0, float(w)) / total
        if p > 0:
            h -= p * math.log2(p)
    return h


def _pearson(xs: list[float], ys: list[float]) -> float:
    """Pearson correlation over two equal-length lists; returns 0 on degeneracy."""
    n = min(len(xs), len(ys))
    if n < 2:
        return 0.0
    mx = sum(xs[i] for i in range(n)) / n
    my = sum(ys[i] for i in range(n)) / n
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


def _group_coupling_mean(group_policies: list[dict[str, Any]]) -> float:
    """Mean Pearson coupling of ``target_priorities`` across all unordered pairs.

    Per pair: form the union of priority keys (sorted for determinism), align
    both weight vectors (zero-fill missing keys), compute Pearson. Pairs with
    degenerate (constant) vectors contribute 0. Returns mean across pairs in
    [-1, 1] — never NaN.
    """
    groups = [g for g in (group_policies or []) if g and g.get("target_priorities") is not None]
    if len(groups) < 2:
        return 0.0
    total = 0.0
    count = 0
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            a_pri: dict[str, float] = groups[i].get("target_priorities") or {}
            b_pri: dict[str, float] = groups[j].get("target_priorities") or {}
            keys = sorted(set(a_pri.keys()) | set(b_pri.keys()))
            if len(keys) < 2:
                continue
            xs = [float(a_pri.get(k, 0.0) or 0.0) for k in keys]
            ys = [float(b_pri.get(k, 0.0) or 0.0) for k in keys]
            r = _pearson(xs, ys)
            if math.isfinite(r):
                total += r
                count += 1
    return (total / count) if count > 0 else 0.0


def _coerce_dict_or_map(raw: Any) -> dict[str, Any]:
    """Normalise a value that may be a dict, a Mapping, or a Python Mapping-like."""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    # Treat anything with .items() as map-like
    try:
        return dict(raw.items())
    except (AttributeError, TypeError):
        return {}


class GroupDynamicsPlugin(DimensionPlugin):
    """Group Dynamics plugin — preserves RC3 G3 wirings exactly."""

    id: str = "group_dynamics"
    label: str = "Group Dynamics"
    score_dimensions: tuple[str, ...] = (
        "intent_entropy",
        "coalition_coupling",
        "state_target_obedience",
        "faction_responsiveness",
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
        sample_every_ticks = max(1, round(5 * TICKS_PER_SEC))

        for t in range(total_ticks):
            await harness.tick()
            if t % sample_every_ticks != 0:
                continue
            s = harness.state
            if not isinstance(s, dict):
                s = {
                    k: getattr(s, k, None)
                    for k in ("ai", "agents", "metrics", "gameplay", "session", "resources")
                }
            ai = s.get("ai") or {}
            # group_policies (JS: groupPolicies) may be a dict OR list of (id, wrap)
            policies_raw = _coerce_dict_or_map(
                ai.get("group_policies") if isinstance(ai, dict) else None
            )
            group_policies: list[dict[str, Any]] = []
            for gid in sorted(policies_raw.keys()):
                wrap = policies_raw[gid]
                pol = wrap.get("data") if isinstance(wrap, dict) and "data" in wrap else wrap
                if not isinstance(pol, dict):
                    pol = {}
                group_policies.append({
                    "group_id": str(gid),
                    "intent_weights": dict(pol.get("intent_weights", pol.get("intentWeights")) or {}),
                    "target_priorities": dict(pol.get("target_priorities", pol.get("targetPriorities")) or {}),
                })

            env = ai.get("environment_directive", ai.get("environmentDirective")) or {}

            targets_raw = _coerce_dict_or_map(
                ai.get("group_state_targets", ai.get("groupStateTargets")) if isinstance(ai, dict) else None
            )
            group_state_targets: dict[str, str] = {}
            for gid in sorted(targets_raw.keys()):
                entry = targets_raw[gid]
                if isinstance(entry, dict):
                    target_state = entry.get("target_state", entry.get("targetState", ""))
                else:
                    target_state = ""
                group_state_targets[str(gid)] = str(target_state or "")

            # Per-NPC fsm.state counts per group
            fsm_counts: dict[str, dict[str, int]] = {}
            hostile_count = 0
            for a in s.get("agents") or []:
                if isinstance(a, dict):
                    if a.get("alive", True) is False:
                        continue
                    gid = str(a.get("group_id", a.get("groupId", "")) or "")
                    fsm_state = str((a.get("fsm") or {}).get("state", "") or "")
                else:
                    if getattr(a, "alive", True) is False:
                        continue
                    gid = str(getattr(a, "group_id", getattr(a, "groupId", "")) or "")
                    fsm = getattr(a, "fsm", None)
                    fsm_state = str(getattr(fsm, "state", "") or "")
                if not gid:
                    continue
                if gid in HOSTILE_GROUPS:
                    hostile_count += 1
                if not fsm_state:
                    continue
                fsm_counts.setdefault(gid, {})
                fsm_counts[gid][fsm_state] = fsm_counts[gid].get(fsm_state, 0) + 1

            metrics = s.get("metrics") or {}
            gameplay = s.get("gameplay") or {}
            session = s.get("session") or {}

            samples.append({
                "t": float(metrics.get("time_sec", metrics.get("timeSec", 0)) or 0),
                "group_policies": group_policies,
                "group_state_targets": group_state_targets,
                "fsm_counts": fsm_counts,
                "hostile_count": int(hostile_count),
                "faction_tension": float(env.get("faction_tension", env.get("factionTension", 0)) or 0),
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
                "intent_entropy": 0.0,
                "coalition_coupling": 0.0,
                "state_target_obedience": 0.0,
                "faction_responsiveness": 0.0,
            }
        ent_sum = 0.0
        ent_count = 0
        coupling_sum = 0.0
        coupling_count = 0
        obey_hits = 0
        obey_checks = 0
        tension_series: list[float] = []
        hostile_series: list[float] = []

        for s in samples:
            for g in s.get("group_policies") or []:
                weights = list((g.get("intent_weights") or {}).values())
                if weights:
                    ent_sum += _entropy(weights)
                    ent_count += 1

            # Coalition coupling: mean Pearson over target_priorities pairs.
            r = _group_coupling_mean(s.get("group_policies") or [])
            if math.isfinite(r):
                coupling_sum += r
                coupling_count += 1

            # State-target obedience: realised fsm.state vs declared target_state.
            targets = s.get("group_state_targets") or {}
            fsm_counts = s.get("fsm_counts") or {}
            for gid in sorted(targets.keys()):
                target_state = targets[gid]
                if not target_state:
                    continue
                counts = fsm_counts.get(gid) or {}
                group_total = sum(int(c) for c in counts.values() if c)
                if group_total == 0:
                    continue
                obey_checks += group_total
                obey_hits += int(counts.get(target_state, 0) or 0)

            tension_series.append(float(s.get("faction_tension", 0.0) or 0.0))
            hostile_series.append(float(s.get("hostile_count", 0) or 0))

        mean_entropy = (ent_sum / ent_count) if ent_count > 0 else 0.0
        mean_coupling = (coupling_sum / coupling_count) if coupling_count > 0 else 0.0
        obedience = (obey_hits / obey_checks) if obey_checks > 0 else 0.0
        faction_resp = _pearson(tension_series, hostile_series)

        return {
            "intent_entropy": round(mean_entropy, 4),
            "coalition_coupling": round(mean_coupling, 4),
            "state_target_obedience": round(obedience, 4),
            "faction_responsiveness": round(faction_resp, 4),
        }


__all__ = ["GroupDynamicsPlugin"]
