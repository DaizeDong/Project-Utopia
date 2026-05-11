"""Tests for project_utopia.simulation.ai.director.EnvironmentDirectorSystem.

Covers the four contract concerns called out in the migration plan:
    (a) ticks at cadence,
    (b) fallback fires on adapter exception,
    (c) guardrails clamp out-of-range output,
    (d) runtime counters bump.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from project_utopia.simulation.ai.director import (
    DEFAULT_ENVIRONMENT_INTERVAL_SEC,
    EnvironmentDirectorSystem,
    build_fallback_environment_directive,
)
from project_utopia.simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    DecisionResponse,
    UsageStats,
)


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class _StaticAdapter(AgentAdapter):
    """AgentAdapter that returns a canned response (or raises) for every call."""

    def __init__(self, response: DecisionResponse | None = None, *, raise_with: Exception | None = None) -> None:
        self.response = response
        self.raise_with = raise_with
        self.calls: list[tuple[str, Any]] = []

    async def request(self, channel, payload, options=None):  # type: ignore[override]
        self.calls.append((channel, payload))
        if self.raise_with is not None:
            raise self.raise_with
        assert self.response is not None
        return self.response


def _state(time_sec: float = 0.0, **overrides: Any) -> dict[str, Any]:
    s: dict[str, Any] = {
        "metrics": {"timeSec": time_sec, "tick": 0},
        "ai": {"enabled": True, "coverageTarget": "llm"},
        "resources": {"food": 100, "wood": 60},
        "gameplay": {"threat": 10, "prosperity": 60},
        "weather": {"current": "clear"},
        "events": [],
        "buildings": {"farms": 4, "warehouses": 1},
    }
    s.update(overrides)
    return s


def _services(adapter: AgentAdapter | None = None) -> SimpleNamespace:
    return SimpleNamespace(agent_adapter=adapter, memory_store=None)


# ---------------------------------------------------------------------------
# (a) Cadence
# ---------------------------------------------------------------------------


class TestCadence:
    def test_first_tick_fires_decision(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "weather": "rain",
                    "durationSec": 18,
                    "factionTension": 0.4,
                    "eventSpawns": [],
                },
                fallback=False,
                model="m",
                latency_ms=2.0,
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["environment_directive"] is not None
        assert state["ai"]["lastEnvironmentResultSec"] == pytest.approx(0.0)
        assert len(adapter.calls) == 1

    def test_skips_when_inside_cadence_window(self) -> None:
        system = EnvironmentDirectorSystem(interval_sec=10.0)
        adapter = _StaticAdapter(
            DecisionResponse(
                data={"weather": "clear", "durationSec": 18, "factionTension": 0.3, "eventSpawns": []},
                fallback=False,
                model="m",
            )
        )
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 1.0
        system.update(0.1, state, services)
        assert len(adapter.calls) == 1, "cadence should suppress the second tick"

    def test_fires_again_once_interval_elapses(self) -> None:
        system = EnvironmentDirectorSystem(interval_sec=5.0)
        adapter = _StaticAdapter(
            DecisionResponse(
                data={"weather": "clear", "durationSec": 18, "factionTension": 0.3, "eventSpawns": []},
                fallback=False,
                model="m",
            )
        )
        state = _state(time_sec=0.0)
        services = _services(adapter)
        system.update(0.1, state, services)
        state["metrics"]["timeSec"] = 5.5
        system.update(0.1, state, services)
        assert len(adapter.calls) == 2

    def test_default_interval_is_eight_seconds(self) -> None:
        assert DEFAULT_ENVIRONMENT_INTERVAL_SEC == 8.0


# ---------------------------------------------------------------------------
# (b) Fallback on adapter exception
# ---------------------------------------------------------------------------


class TestFallback:
    def test_adapter_raises_triggers_fallback(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(raise_with=RuntimeError("boom"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastEnvironmentSource"] == "fallback"
        assert state["ai"]["mode"] == "fallback"
        # Fallback always emits a valid directive.
        directive = state["ai"]["environment_directive"]
        assert directive["weather"] in ("clear", "rain", "storm", "drought", "winter")
        # Error was classified into the stats block.
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["lastErrorKind"] != "none"
        assert "boom" in runtime["lastErrorMessage"]

    def test_no_adapter_wired_uses_fallback(self) -> None:
        """D5 runMode gate: run_mode == 'llm' but no adapter → fallback."""
        system = EnvironmentDirectorSystem()
        state = _state()
        state["ai"]["run_mode"] = "llm"
        system.update(0.1, state, _services(adapter=None))
        assert state["ai"]["lastEnvironmentSource"] == "fallback"
        assert state["ai"]["environment_directive"] is not None

    def test_disabled_ai_uses_fallback(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={"weather": "clear", "durationSec": 18, "factionTension": 0.3, "eventSpawns": []},
                fallback=False,
                model="m",
            )
        )
        state = _state()
        state["ai"]["enabled"] = False
        system.update(0.1, state, _services(adapter))
        assert state["ai"]["lastEnvironmentSource"] == "fallback"
        assert len(adapter.calls) == 0  # adapter never invoked

    def test_fallback_directive_passes_guardrails(self) -> None:
        from project_utopia.simulation.ai.llm.guardrails import guard_environment_directive

        raw = build_fallback_environment_directive(_state(resources={"food": 5}))
        guarded = guard_environment_directive(raw)
        assert guarded.weather == "clear"
        assert 8 <= guarded.duration_sec <= 180


# ---------------------------------------------------------------------------
# (c) Guardrails clamp out-of-range output
# ---------------------------------------------------------------------------


class TestGuardrailClamp:
    def test_clamps_out_of_range_duration(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "weather": "rain",
                    "durationSec": 9999,  # over the 180 cap
                    "factionTension": 5.0,  # over the 1.0 cap
                    "eventSpawns": [],
                },
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        # Schema validation will catch out-of-range; the system falls into
        # the guardrail-recovery path and re-clamps.
        directive = state["ai"]["environment_directive"]
        assert directive["duration_sec"] <= 180
        assert 0.0 <= directive["faction_tension"] <= 1.0

    def test_drops_unknown_weather_to_clear(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={
                    "weather": "haunted_carnival",  # not in enum
                    "durationSec": 18,
                    "factionTension": 0.5,
                    "eventSpawns": [],
                },
                fallback=False,
                model="m",
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        directive = state["ai"]["environment_directive"]
        assert directive["weather"] == "clear"


# ---------------------------------------------------------------------------
# (d) Runtime counters
# ---------------------------------------------------------------------------


class TestRuntimeCounters:
    def test_request_and_response_counters_increment(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(
            DecisionResponse(
                data={"weather": "rain", "durationSec": 18, "factionTension": 0.4, "eventSpawns": []},
                fallback=False,
                model="m",
                latency_ms=10.0,
                usage=UsageStats(prompt_tokens=20, completion_tokens=5, cached_tokens=2),
            )
        )
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["requestCount"] == 1
        assert runtime["environmentRequests"] == 1
        assert runtime["responseCount"] == 1
        assert runtime["environmentResponses"] == 1
        assert runtime["llmResponseCount"] == 1
        assert runtime["fallbackResponseCount"] == 0
        assert runtime["lastResultSource"] == "llm"
        assert runtime["promptTokens"] == 20
        assert runtime["completionTokens"] == 5
        assert runtime["cachedTokens"] == 2
        assert runtime["lastLatencyMs"] == pytest.approx(10.0)

    def test_fallback_increments_fallback_counter(self) -> None:
        system = EnvironmentDirectorSystem()
        adapter = _StaticAdapter(raise_with=RuntimeError("request timeout exceeded"))
        state = _state()
        system.update(0.1, state, _services(adapter))
        runtime = state["metrics"]["ai_runtime"]
        assert runtime["fallbackResponseCount"] == 1
        assert runtime["consecutiveFallbackResponses"] == 1
        assert runtime["llmResponseCount"] == 0
        assert runtime["lastErrorKind"] == "timeout"
