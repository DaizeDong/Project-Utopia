"""Tests for :mod:`project_utopia.app.ai_runtime_stats`."""

from __future__ import annotations

import math

from project_utopia.app.ai_runtime_stats import (
    AI_RUNTIME_FIELDS,
    classify_ai_error_message,
    create_default_ai_runtime_stats,
    ensure_ai_runtime_stats,
    get_ai_coverage_target,
    reset_ai_runtime_stats,
)


class TestCreateDefault:
    def test_has_all_31_canonical_fields(self) -> None:
        stats = create_default_ai_runtime_stats()
        assert len(AI_RUNTIME_FIELDS) == 31
        for key in AI_RUNTIME_FIELDS:
            assert key in stats, f"missing field {key!r}"

    def test_numeric_defaults_are_finite_or_sentinel(self) -> None:
        stats = create_default_ai_runtime_stats()
        # All counters at zero.
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
            assert stats[key] == 0 or stats[key] == 0.0
            assert math.isfinite(stats[key])
        # Time sentinels are the JS -999.
        for key in ("lastRequestSec", "lastResponseSec", "lastLiveSec", "lastFallbackSec"):
            assert stats[key] == -999

    def test_string_and_bool_defaults(self) -> None:
        stats = create_default_ai_runtime_stats()
        assert stats["lastErrorKind"] == "none"
        assert stats["lastErrorMessage"] == ""
        assert stats["lastResultSource"] == "none"
        assert stats["coverageTarget"] == "fallback"
        assert stats["liveCoverageSatisfied"] is False


class TestEnsureIdempotent:
    def test_creates_stats_when_missing(self) -> None:
        state: dict = {"metrics": {}}
        stats = ensure_ai_runtime_stats(state)
        assert state["metrics"]["ai_runtime"] is stats
        for key in AI_RUNTIME_FIELDS:
            assert key in stats

    def test_creates_metrics_when_missing(self) -> None:
        state: dict = {}
        ensure_ai_runtime_stats(state)
        assert "metrics" in state
        assert "ai_runtime" in state["metrics"]

    def test_idempotent_on_repeat_call(self) -> None:
        state: dict = {"ai": {"coverageTarget": "fallback"}, "metrics": {}}
        first = ensure_ai_runtime_stats(state)
        # Mutate a value, then ensure again — only coverageTarget should
        # be re-derived; the rest of the dict identity is preserved.
        first["requestCount"] = 42
        second = ensure_ai_runtime_stats(state)
        assert first is second
        assert second["requestCount"] == 42

    def test_coverage_target_is_re_read_from_state_ai(self) -> None:
        state: dict = {"ai": {"coverageTarget": "fallback"}, "metrics": {}}
        ensure_ai_runtime_stats(state)
        assert state["metrics"]["ai_runtime"]["coverageTarget"] == "fallback"

        state["ai"]["coverageTarget"] = "llm"
        ensure_ai_runtime_stats(state)
        assert state["metrics"]["ai_runtime"]["coverageTarget"] == "llm"

    def test_clamps_negative_counters(self) -> None:
        state: dict = {
            "metrics": {
                "ai_runtime": {
                    "requestCount": -5,
                    "avgLatencyMs": float("nan"),
                    "lastErrorKind": None,
                }
            }
        }
        stats = ensure_ai_runtime_stats(state)
        assert stats["requestCount"] == 0
        assert stats["avgLatencyMs"] == 0
        assert stats["lastErrorKind"] == "none"

    def test_preserves_finite_negative_sentinels(self) -> None:
        state: dict = {
            "metrics": {
                "ai_runtime": {
                    "lastRequestSec": -123.5,
                }
            }
        }
        stats = ensure_ai_runtime_stats(state)
        assert stats["lastRequestSec"] == -123.5


class TestGetCoverageTarget:
    def test_returns_fallback_when_missing(self) -> None:
        assert get_ai_coverage_target({}) == "fallback"
        assert get_ai_coverage_target({"ai": {}}) == "fallback"
        assert get_ai_coverage_target(None) == "fallback"  # type: ignore[arg-type]

    def test_returns_llm_when_set(self) -> None:
        assert get_ai_coverage_target({"ai": {"coverageTarget": "llm"}}) == "llm"
        assert get_ai_coverage_target({"ai": {"coverageTarget": "LLM"}}) == "llm"

    def test_unknown_value_defaults_to_fallback(self) -> None:
        assert get_ai_coverage_target({"ai": {"coverageTarget": "auto"}}) == "fallback"


class TestReset:
    def test_replaces_stats_with_fresh_block(self) -> None:
        state: dict = {"metrics": {}}
        first = ensure_ai_runtime_stats(state)
        first["requestCount"] = 99
        second = reset_ai_runtime_stats(state)
        assert second["requestCount"] == 0
        assert state["metrics"]["ai_runtime"] is second


class TestClassify:
    def test_known_buckets(self) -> None:
        assert classify_ai_error_message("") == "none"
        assert classify_ai_error_message("Request timeout") == "timeout"
        assert classify_ai_error_message("OPENAI_API_KEY missing") == "auth"
        assert classify_ai_error_message("HTTP 429 too many requests") == "http-4xx"
        assert classify_ai_error_message("HTTP 503 backend overloaded") == "http-5xx"
        assert classify_ai_error_message("schema validation failed") == "schema"
        assert classify_ai_error_message("proxy unreachable") == "proxy"
        assert classify_ai_error_message("kernel panic") == "other"
