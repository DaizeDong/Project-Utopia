"""Tests for MultiBackendAdapter — cross-vendor channel router."""

from __future__ import annotations

from typing import Any

import pytest

from project_utopia.benchmark.baselines.multi_backend_adapter import MultiBackendAdapter
from project_utopia.simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    DecisionResponse,
    NoopAgentAdapter,
    UsageStats,
)


class _TaggingAdapter(AgentAdapter):
    """Adapter whose response data tags the channel it received."""

    def __init__(self, tag: str) -> None:
        super().__init__()
        self.tag = tag
        self.requests = 0

    async def request(self, channel: str, payload: Any, options: Any = None) -> DecisionResponse:
        self.requests += 1
        return DecisionResponse(
            data={"tag": self.tag, "channel": channel},
            fallback=False,
            usage=UsageStats(prompt_tokens=1, completion_tokens=1, cached_tokens=0),
            latency_ms=10.0,
            model=f"tagging-{self.tag}",
            error="",
            debug={},
        )


class _RaisingAdapter(AgentAdapter):
    async def request(self, channel: str, payload: Any, options: Any = None) -> DecisionResponse:
        raise RuntimeError("simulated transport failure")


class TestMultiBackendAdapter:
    @pytest.mark.asyncio
    async def test_routes_to_registered_adapter(self) -> None:
        sub = _TaggingAdapter("alpha")
        router = MultiBackendAdapter({"environment-director": sub})
        resp = await router.request("environment-director", {}, None)
        assert resp.data == {"tag": "alpha", "channel": "environment-director"}
        assert sub.requests == 1
        # Debug tagged with sub-adapter class name
        assert resp.debug["multi_backend"]["sub"] == "_TaggingAdapter"
        assert router.dispatch_count == 1
        assert router.unknown_channel_count == 0

    @pytest.mark.asyncio
    async def test_unregistered_channel_returns_fallback(self) -> None:
        router = MultiBackendAdapter({"environment-director": NoopAgentAdapter()})
        resp = await router.request("npc-policy", {}, None)
        assert resp.fallback is True
        assert resp.data is None
        assert router.unknown_channel_count == 1

    @pytest.mark.asyncio
    async def test_unknown_channel_bumps_counter(self) -> None:
        router = MultiBackendAdapter({"environment-director": NoopAgentAdapter()})
        resp = await router.request("not-a-channel", {}, None)
        assert resp.fallback is True
        assert "unknown channel" in resp.error
        assert router.unknown_channel_count == 1

    @pytest.mark.asyncio
    async def test_sub_adapter_exception_translates_to_fallback(self) -> None:
        router = MultiBackendAdapter({"strategic-plan": _RaisingAdapter()})
        resp = await router.request("strategic-plan", {}, None)
        assert resp.fallback is True
        assert "simulated transport failure" in resp.error
        assert resp.debug["multi_backend"]["caught"] is True

    @pytest.mark.asyncio
    async def test_channels_helper_returns_registered_names_sorted(self) -> None:
        router = MultiBackendAdapter({
            "strategic-plan": NoopAgentAdapter(),
            "environment-director": NoopAgentAdapter(),
        })
        assert router.channels() == ["environment-director", "strategic-plan"]
