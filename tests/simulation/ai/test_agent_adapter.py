"""Tests for project_utopia.simulation.ai.llm.agent_adapter."""

from __future__ import annotations

import asyncio
import inspect

import pytest

from project_utopia.simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    CHANNELS,
    DecisionResponse,
    NoopAgentAdapter,
    SCHEMA_VERSION,
    UsageStats,
)


class TestChannels:
    def test_channel_names_match_js_exactly(self) -> None:
        assert CHANNELS == (
            "environment-director",
            "npc-policy",
            "strategic-plan",
            "colony-agent",
        )

    def test_schema_version_string(self) -> None:
        assert SCHEMA_VERSION == "1.0"


class TestNoopAdapter:
    @pytest.mark.asyncio
    async def test_returns_fallback_for_all_channels(self) -> None:
        adapter = NoopAgentAdapter()
        for channel in CHANNELS:
            response = await adapter.request(channel, {"summary": "..."}, None)
            assert isinstance(response, DecisionResponse)
            assert response.fallback is True
            assert response.data is None
            assert response.model == "noop"

    @pytest.mark.asyncio
    async def test_request_is_awaitable(self) -> None:
        adapter = NoopAgentAdapter()
        coro = adapter.request("environment-director", {})
        assert inspect.iscoroutine(coro)
        await coro

    @pytest.mark.asyncio
    async def test_usage_is_none_for_noop(self) -> None:
        adapter = NoopAgentAdapter()
        response = await adapter.request("colony-agent", {})
        assert response.usage is None


class TestDecisionResponseAliases:
    def test_dumps_to_camelcase(self) -> None:
        resp = DecisionResponse(
            fallback=False,
            latency_ms=123.4,
            model="model-x",
            usage=UsageStats(prompt_tokens=10, completion_tokens=20, cached_tokens=2),
        )
        dump = resp.model_dump(by_alias=True)
        assert "latencyMs" in dump
        assert dump["latencyMs"] == pytest.approx(123.4)
        assert dump["usage"]["promptTokens"] == 10
        assert dump["usage"]["completionTokens"] == 20
        assert dump["usage"]["cachedTokens"] == 2

    def test_camelcase_aliases_accepted_on_input(self) -> None:
        resp = DecisionResponse.model_validate(
            {
                "fallback": False,
                "latencyMs": 99.0,
                "model": "abc",
                "usage": {
                    "promptTokens": 5,
                    "completionTokens": 7,
                    "cachedTokens": 1,
                    "firstTokenLatencyMs": 12.5,
                },
            }
        )
        assert resp.latency_ms == pytest.approx(99.0)
        assert resp.usage is not None
        assert resp.usage.first_token_latency_ms == pytest.approx(12.5)


class TestAbstractContract:
    def test_cannot_instantiate_base(self) -> None:
        with pytest.raises(TypeError):
            AgentAdapter()  # type: ignore[abstract]

    @pytest.mark.asyncio
    async def test_concrete_subclass_must_implement_request(self) -> None:
        class MyAdapter(AgentAdapter):
            async def request(self, channel, payload, options=None):
                return DecisionResponse(model="mine", latency_ms=1.0)

        a = MyAdapter()
        r = await a.request("environment-director", {})
        assert r.model == "mine"
