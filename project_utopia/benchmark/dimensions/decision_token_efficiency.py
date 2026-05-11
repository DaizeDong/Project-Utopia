"""Decision Token Efficiency (DTE) dimension plugin — Python port (S6).

Mirrors ``src/benchmark/dimensions/DecisionTokenEfficiency.js``.

Score families (all unbounded — consumers normalise before bayesian_score):

- ``dte_per_completion_token`` ∈ ℝ — DevIndex gain per completion token.
  Higher is better (more task progress per token).
- ``dte_per_decision`` ∈ ℝ — DevIndex gain per LLM call. Higher is better.
- ``first_token_latency_p50`` ∈ [0, ∞) ms — median first-token latency
  across calls. Lower is better.

RC3 B1 fix path: read from ``state.metrics["ai_runtime"]`` (NOT
``state.ai.runtime``). JS dotted path ``state.metrics.aiRuntime`` maps to
this key under the migration's snake_case rename rules.
"""

from __future__ import annotations

import math
from typing import Any

from ..framework.dimension_plugin import DimensionPlugin

TICKS_PER_SEC = 30.0


def _state_get(state: Any, key: str, default: Any = None) -> Any:
    if isinstance(state, dict):
        return state.get(key, default)
    return getattr(state, key, default)


def _percentile_p50(values: list[float]) -> float:
    """Return the value at index ``floor(n/2)`` of the sorted positive list.

    Matches the JS implementation exactly (which uses
    ``sorted[Math.floor(len/2)]`` rather than a true interpolated median).
    """
    if not values:
        return 0.0
    arr = sorted(values)
    return arr[len(arr) // 2]


class DecisionTokenEfficiencyPlugin(DimensionPlugin):
    """DTE dimension plugin."""

    id: str = "dte"
    label: str = "Decision Token Efficiency"
    score_dimensions: tuple[str, ...] = (
        "dte_per_completion_token",
        "dte_per_decision",
        "first_token_latency_p50",
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

        for t in range(total_ticks):
            await harness.tick()
            if t % sample_every_ticks != 0:
                continue
            s = harness.state
            metrics = _state_get(s, "metrics", None) or {}
            # RC3 B1 fix: read from `state.metrics["ai_runtime"]` (dict key,
            # snake_case), NOT `state.ai.runtime` or `state.metrics.aiRuntime`.
            # Accept the camelCase fallback for back-compat with mock fixtures
            # that haven't been ported yet.
            ai = {}
            if isinstance(metrics, dict):
                ai = metrics.get("ai_runtime") or metrics.get("aiRuntime") or {}
            else:
                ai = getattr(metrics, "ai_runtime", None) or getattr(metrics, "aiRuntime", None) or {}

            agents = _state_get(s, "agents", None) or []
            workers = [
                a for a in agents
                if (a.get("type") if isinstance(a, dict) else getattr(a, "type", None)) == "WORKER"
                and (a.get("alive", True) if isinstance(a, dict) else getattr(a, "alive", True)) is not False
            ]
            resources = _state_get(s, "resources", None) or {}
            session = _state_get(s, "session", None) or {}

            samples.append({
                "t": float(metrics.get("time_sec", metrics.get("timeSec", 0)) if isinstance(metrics, dict) else 0),
                "prompt_tokens": float(ai.get("prompt_tokens", ai.get("promptTokens", 0)) or 0),
                "completion_tokens": float(ai.get("completion_tokens", ai.get("completionTokens", 0)) or 0),
                "first_token_latency_ms": float(ai.get("first_token_latency_ms", ai.get("firstTokenLatencyMs", 0)) or 0),
                "response_count": float(ai.get("response_count", ai.get("responseCount", 0)) or 0),
                "food": float(resources.get("food", 0) or 0),
                "workers": len(workers),
            })
            if session.get("phase") == "end":
                break
        return samples

    def self_score(
        self,
        samples: list[dict[str, Any]],
        ctx: dict[str, Any] | None = None,
    ) -> dict[str, float]:
        if len(samples) < 2:
            return {
                "dte_per_completion_token": 0.0,
                "dte_per_decision": 0.0,
                "first_token_latency_p50": 0.0,
            }
        first = samples[0]
        last = samples[-1]

        task_score_first = (1.0 if first.get("workers", 0) > 0 else 0.0) * math.log1p(float(first.get("food", 0.0)))
        task_score_last = (1.0 if last.get("workers", 0) > 0 else 0.0) * math.log1p(float(last.get("food", 0.0)))
        delta_score = task_score_last - task_score_first

        tokens = max(1.0, float(last.get("completion_tokens", 0)) - float(first.get("completion_tokens", 0)))
        decisions = max(1.0, float(last.get("response_count", 0)) - float(first.get("response_count", 0)))

        ftls = sorted(float(s.get("first_token_latency_ms", 0.0)) for s in samples
                      if float(s.get("first_token_latency_ms", 0.0)) > 0)
        p50 = _percentile_p50(ftls)

        return {
            "dte_per_completion_token": round(delta_score / tokens, 6),
            "dte_per_decision": round(delta_score / decisions, 4),
            "first_token_latency_p50": round(p50, 2),
        }


__all__ = ["DecisionTokenEfficiencyPlugin"]
