"""AI runtime telemetry (port of ``src/app/aiRuntimeStats.js``).

The JS module owns ``state.metrics.aiRuntime`` — a tally of LLM channel
requests/responses, latency, fallback behaviour, and token usage. The
Python port preserves **every JS field name** at the wire format
(camelCase string keys), but exposes a snake_case ergonomic surface on
the pydantic model.

Storage convention
------------------
Per the Phase-1 conventions doc, the runtime stats live under
``state.metrics["ai_runtime"]`` (snake_case dict key) but the *inner*
fields stay camelCase so existing NDJSON consumers keep working without
schema migration. :func:`ensure_ai_runtime_stats` enforces both invariants
(presence and clamping) and is idempotent — repeated calls do not mutate
already-valid stats.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "AiRuntimeStatsModel",
    "AI_RUNTIME_FIELDS",
    "create_default_ai_runtime_stats",
    "ensure_ai_runtime_stats",
    "get_ai_coverage_target",
    "classify_ai_error_message",
    "reset_ai_runtime_stats",
]


# Ordered list of every JS field name. Kept as an immutable tuple so we can
# iterate when serializing / asserting completeness.
AI_RUNTIME_FIELDS: tuple[str, ...] = (
    "requestCount",
    "responseCount",
    "environmentRequests",
    "policyRequests",
    "environmentResponses",
    "policyResponses",
    "llmResponseCount",
    "fallbackResponseCount",
    "timeoutCount",
    "errorCount",
    "recoveryCount",
    "avgLatencyMs",
    "lastLatencyMs",
    "lastRequestSec",
    "lastResponseSec",
    "lastLiveSec",
    "lastFallbackSec",
    "maxUnrecoveredFallbackSec",
    "consecutiveFallbackResponses",
    "lastErrorKind",
    "lastErrorMessage",
    "lastResultSource",
    "coverageTarget",
    "liveCoverageSatisfied",
    # Token telemetry (S5).
    "promptTokens",
    "completionTokens",
    "cachedTokens",
    "firstTokenLatencyMs",
    "tokensPerSec",
    "kvCacheHits",
    "prefixHits",
)

# JS sentinel for "never observed". Kept as a module constant so callers
# can branch on it without magic numbers.
_NEVER_SEC: float = -999.0


def _clamp_non_negative(value: Any, fallback: float = 0.0) -> float:
    """Coerce ``value`` to a non-negative float, falling back on NaN/inf."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(n):
        return fallback
    return max(0.0, n)


def _finite_or(value: Any, fallback: float) -> float:
    """Return ``float(value)`` if finite, else ``fallback``."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(n):
        return fallback
    return n


class AiRuntimeStatsModel(BaseModel):
    """Pydantic v2 model mirroring ``state.metrics.aiRuntime``.

    The model uses ``populate_by_name=True`` with camelCase aliases so it
    can round-trip both JS-style payloads (``{"requestCount": 1}``) and
    snake_case Python access (``stats.request_count``).
    """

    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow",  # permit forward-compat fields without breaking parse
    )

    request_count: int = Field(default=0, alias="requestCount")
    response_count: int = Field(default=0, alias="responseCount")
    environment_requests: int = Field(default=0, alias="environmentRequests")
    policy_requests: int = Field(default=0, alias="policyRequests")
    environment_responses: int = Field(default=0, alias="environmentResponses")
    policy_responses: int = Field(default=0, alias="policyResponses")
    llm_response_count: int = Field(default=0, alias="llmResponseCount")
    fallback_response_count: int = Field(default=0, alias="fallbackResponseCount")
    timeout_count: int = Field(default=0, alias="timeoutCount")
    error_count: int = Field(default=0, alias="errorCount")
    recovery_count: int = Field(default=0, alias="recoveryCount")
    avg_latency_ms: float = Field(default=0.0, alias="avgLatencyMs")
    last_latency_ms: float = Field(default=0.0, alias="lastLatencyMs")
    last_request_sec: float = Field(default=_NEVER_SEC, alias="lastRequestSec")
    last_response_sec: float = Field(default=_NEVER_SEC, alias="lastResponseSec")
    last_live_sec: float = Field(default=_NEVER_SEC, alias="lastLiveSec")
    last_fallback_sec: float = Field(default=_NEVER_SEC, alias="lastFallbackSec")
    max_unrecovered_fallback_sec: float = Field(default=0.0, alias="maxUnrecoveredFallbackSec")
    consecutive_fallback_responses: int = Field(default=0, alias="consecutiveFallbackResponses")
    last_error_kind: str = Field(default="none", alias="lastErrorKind")
    last_error_message: str = Field(default="", alias="lastErrorMessage")
    last_result_source: str = Field(default="none", alias="lastResultSource")
    coverage_target: Literal["fallback", "llm"] = Field(default="fallback", alias="coverageTarget")
    live_coverage_satisfied: bool = Field(default=False, alias="liveCoverageSatisfied")
    # Token telemetry (S5).
    prompt_tokens: int = Field(default=0, alias="promptTokens")
    completion_tokens: int = Field(default=0, alias="completionTokens")
    cached_tokens: int = Field(default=0, alias="cachedTokens")
    first_token_latency_ms: float = Field(default=0.0, alias="firstTokenLatencyMs")
    tokens_per_sec: float = Field(default=0.0, alias="tokensPerSec")
    kv_cache_hits: int = Field(default=0, alias="kvCacheHits")
    prefix_hits: int = Field(default=0, alias="prefixHits")

    def to_wire(self) -> dict[str, Any]:
        """Serialize to the JS-compatible camelCase dict form."""
        return self.model_dump(by_alias=True)


def create_default_ai_runtime_stats() -> dict[str, Any]:
    """Return a fresh stats dict with all 31 fields at safe defaults.

    The returned dict uses **camelCase** keys, matching the JS wire format
    consumed by NDJSON readers and the in-browser HUD (now retired).
    """
    return AiRuntimeStatsModel().to_wire()


def get_ai_coverage_target(state: dict[str, Any] | None) -> Literal["fallback", "llm"]:
    """Read ``state.ai.coverageTarget`` and normalize to one of the two literals.

    Defaults to ``"fallback"`` when ``state`` is missing the field or the
    value isn't recognized — mirrors the JS lenient parse.
    """
    if not state:
        return "fallback"
    ai = state.get("ai") if isinstance(state, dict) else None
    if not isinstance(ai, dict):
        return "fallback"
    raw = str(ai.get("coverageTarget", "")).strip().lower()
    return "llm" if raw == "llm" else "fallback"


def ensure_ai_runtime_stats(state: dict[str, Any]) -> dict[str, Any]:
    """Ensure ``state.metrics["ai_runtime"]`` exists and is well-formed.

    The function is **idempotent**: calling it twice on the same state
    leaves the contents identical (modulo ``coverageTarget`` which is
    always re-read from ``state.ai``).

    Returns
    -------
    dict[str, Any]
        The same stats dict that lives at ``state["metrics"]["ai_runtime"]``,
        so callers can chain mutations like
        ``ensure_ai_runtime_stats(state)["requestCount"] += 1``.
    """
    metrics = state.setdefault("metrics", {})
    if not isinstance(metrics, dict):  # pragma: no cover - defensive
        metrics = {}
        state["metrics"] = metrics
    stats = metrics.get("ai_runtime")
    if not isinstance(stats, dict):
        stats = create_default_ai_runtime_stats()
        metrics["ai_runtime"] = stats

    # Non-negative integer/float counters.
    for key in (
        "requestCount",
        "responseCount",
        "environmentRequests",
        "policyRequests",
        "environmentResponses",
        "policyResponses",
        "llmResponseCount",
        "fallbackResponseCount",
        "timeoutCount",
        "errorCount",
        "recoveryCount",
        "avgLatencyMs",
        "lastLatencyMs",
        "maxUnrecoveredFallbackSec",
        "consecutiveFallbackResponses",
        "promptTokens",
        "completionTokens",
        "cachedTokens",
        "firstTokenLatencyMs",
        "tokensPerSec",
        "kvCacheHits",
        "prefixHits",
    ):
        stats[key] = _clamp_non_negative(stats.get(key, 0))

    # Free-floating timestamps (may be negative sentinel _NEVER_SEC).
    for key in ("lastRequestSec", "lastResponseSec", "lastLiveSec", "lastFallbackSec"):
        stats[key] = _finite_or(stats.get(key, _NEVER_SEC), _NEVER_SEC)

    # String fields.
    stats["lastErrorKind"] = str(stats.get("lastErrorKind") or "none")
    stats["lastErrorMessage"] = str(stats.get("lastErrorMessage") or "")
    stats["lastResultSource"] = str(stats.get("lastResultSource") or "none")

    # Coverage target reflects state.ai every tick.
    stats["coverageTarget"] = get_ai_coverage_target(state)
    stats["liveCoverageSatisfied"] = bool(stats.get("liveCoverageSatisfied", False))

    # Guarantee every canonical field is present (defensive against partial
    # loads from disk).
    defaults = create_default_ai_runtime_stats()
    for key in AI_RUNTIME_FIELDS:
        if key not in stats:
            stats[key] = defaults[key]

    return stats


def reset_ai_runtime_stats(state: dict[str, Any]) -> dict[str, Any]:
    """Replace ``state.metrics["ai_runtime"]`` with a fresh default block."""
    metrics = state.setdefault("metrics", {})
    fresh = create_default_ai_runtime_stats()
    fresh["coverageTarget"] = get_ai_coverage_target(state)
    metrics["ai_runtime"] = fresh
    return fresh


def classify_ai_error_message(error_text: str = "") -> str:
    """Bucket an error string into one of the JS ``lastErrorKind`` enums."""
    raw = str(error_text or "").strip().lower()
    if not raw:
        return "none"
    if "timeout" in raw or "aborted" in raw:
        return "timeout"
    if "openai_api_key" in raw or "api key" in raw:
        return "auth"
    if "http 4" in raw:
        return "http-4xx"
    if "http 5" in raw:
        return "http-5xx"
    if "schema" in raw:
        return "schema"
    if "proxy" in raw or "fetch" in raw or "network" in raw:
        return "proxy"
    return "other"
