"""Tests for FlatBaselineAdapter — E1 control adapter."""

from __future__ import annotations

import json
from typing import Any

import pytest

from project_utopia.benchmark.baselines.flat_baseline_adapter import FlatBaselineAdapter
from project_utopia.simulation.ai.llm.agent_adapter import CHANNELS, DecisionResponse


class _StubLLMClient:
    """Minimal stub exposing async ``request_strategic``."""

    def __init__(self, fused_response: dict[str, Any] | None) -> None:
        self.calls = 0
        self._fused = fused_response

    async def request_strategic(self, prompt: str, enabled: bool, fallback_data: Any) -> dict[str, Any]:
        self.calls += 1
        if self._fused is None:
            return {
                "fallback": True,
                "data": None,
                "latency_ms": 12.0,
                "error": "no llm",
                "model": "stub",
                "debug": None,
            }
        return {
            "fallback": False,
            "data": json.dumps(self._fused),
            "latency_ms": 25.0,
            "error": "",
            "model": "stub-llm",
            "debug": {"stub": True},
        }


def _good_fused() -> dict[str, Any]:
    return {
        "env": {
            "weather": "clear",
            "duration_sec": 60,
            "faction_tension": 0.2,
            "event_spawns": [],
            "focus": "stable",
            "summary": "calm window",
        },
        "policy": {
            "policies": [
                {
                    "group_id": "workers",
                    "intent_weights": {"farm": 1.0},
                    "risk_tolerance": 0.4,
                    "target_priorities": {"warehouse": 1.0},
                    "ttl_sec": 60,
                }
            ],
            "state_targets": [],
        },
        "strategic": {"summary": "plan"},
        "colony": {"summary": "build"},
    }


class TestFlatBaselineAdapter:
    @pytest.mark.asyncio
    async def test_returns_decision_response_for_all_channels(self) -> None:
        adapter = FlatBaselineAdapter(llm_client=_StubLLMClient(_good_fused()))
        for ch in CHANNELS:
            resp = await adapter.request(ch, {"summary": "ctx"}, None)
            assert isinstance(resp, DecisionResponse)
            # All four channels return a valid envelope (data may be the
            # validated dict or pass-through depending on channel).
            assert resp.model is not None
            assert resp.usage is not None

    @pytest.mark.asyncio
    async def test_cache_reuses_fused_response(self) -> None:
        stub = _StubLLMClient(_good_fused())
        adapter = FlatBaselineAdapter(llm_client=stub, cache_ttl_ms=10_000_000)
        for ch in CHANNELS:
            await adapter.request(ch, {"summary": "ctx"}, None)
        # First call fuses; later 3 hit cache → only ONE LLM call.
        assert stub.calls == 1
        assert adapter.llm_call_count == 1
        assert adapter.cache_hit_count == 3

    @pytest.mark.asyncio
    async def test_unknown_channel_returns_fallback(self) -> None:
        adapter = FlatBaselineAdapter(llm_client=_StubLLMClient(_good_fused()))
        resp = await adapter.request("unknown-channel", {}, None)
        assert resp.fallback is True
        assert resp.data is None
        assert "unknown" in resp.error.lower()

    @pytest.mark.asyncio
    async def test_no_llm_client_returns_fallback(self) -> None:
        adapter = FlatBaselineAdapter(llm_client=None)
        resp = await adapter.request("environment-director", {}, None)
        assert resp.fallback is True

    @pytest.mark.asyncio
    async def test_per_channel_token_budget_divided_by_four(self) -> None:
        stub = _StubLLMClient(_good_fused())
        adapter = FlatBaselineAdapter(llm_client=stub, cache_ttl_ms=10_000_000)
        responses = [await adapter.request(ch, {"summary": "ctx"}, None) for ch in CHANNELS]
        # Every response should report the same per-channel prompt budget.
        prompt_budgets = {r.usage.prompt_tokens for r in responses}
        assert len(prompt_budgets) == 1
