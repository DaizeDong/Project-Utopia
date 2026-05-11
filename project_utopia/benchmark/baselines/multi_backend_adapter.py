"""MultiBackendAdapter — cross-vendor channel router.

Python port of ``src/benchmark/baselines/MultiBackendAdapter.js``.

Wraps a ``Mapping[Channel, AgentAdapter]`` so the SimHarness sees a single
:class:`AgentAdapter` while requests dispatch by channel string. Unknown
channels return a synthetic fallback :class:`DecisionResponse` and bump
``unknown_channel_count`` for diagnostics.

Every successful sub-adapter response is tagged in ``debug["multi_backend"]``
with the sub-adapter class name so downstream telemetry can attribute
behaviour to the underlying model.
"""

from __future__ import annotations

import time
from typing import Any

from ...simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    CHANNELS,
    DecisionResponse,
    UsageStats,
)


def _now_ms() -> float:
    return time.monotonic() * 1000.0


class MultiBackendAdapter(AgentAdapter):
    """Cross-vendor router."""

    def __init__(self, channel_to_adapter: Any) -> None:
        super().__init__()
        self._adapters: dict[str, AgentAdapter] = {}
        if channel_to_adapter is None:
            channel_to_adapter = {}
        if hasattr(channel_to_adapter, "items"):
            for k, v in channel_to_adapter.items():
                self._adapters[str(k)] = v
        else:
            # Best-effort: treat as iterable of (k, v) pairs.
            for pair in channel_to_adapter:
                k, v = pair
                self._adapters[str(k)] = v
        self.unknown_channel_count: int = 0
        self.dispatch_count: int = 0

    def channels(self) -> list[str]:
        """Inspect/test helper: list registered channel names (sorted)."""
        return sorted(self._adapters.keys())

    def _build_fallback(self, channel: str, error: str) -> DecisionResponse:
        return DecisionResponse(
            data=None,
            fallback=True,
            usage=UsageStats(prompt_tokens=0, completion_tokens=0, cached_tokens=0),
            latency_ms=0.0,
            model="multi-backend-fallback",
            error=str(error or "multi-backend fallback"),
            debug={"multi_backend": {"channel": channel, "reason": "fallback"}},
        )

    async def request(
        self,
        channel: str,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        if channel not in CHANNELS:
            self.unknown_channel_count += 1
            return self._build_fallback(channel, f"unknown channel: {channel}")
        target = self._adapters.get(channel)
        if target is None or not hasattr(target, "request") or not callable(target.request):
            self.unknown_channel_count += 1
            return self._build_fallback(channel, f"no adapter registered for channel: {channel}")
        self.dispatch_count += 1
        start_ms = _now_ms()
        try:
            out = await target.request(channel, payload, options)
        except Exception as err:  # noqa: BLE001 — translate to fallback envelope
            latency_ms = max(0.0, _now_ms() - start_ms)
            return DecisionResponse(
                data=None,
                fallback=True,
                usage=UsageStats(prompt_tokens=0, completion_tokens=0, cached_tokens=0),
                latency_ms=latency_ms,
                model="multi-backend-error",
                error=str(err) or "multi-backend exception",
                debug={
                    "multi_backend": {
                        "channel": channel,
                        "sub": type(target).__name__,
                        "caught": True,
                    }
                },
            )
        # Tag the debug field so downstream telemetry can see which sub-adapter
        # the response came from.
        if isinstance(out, DecisionResponse):
            debug = dict(out.debug or {})
            debug["multi_backend"] = {"channel": channel, "sub": type(target).__name__}
            out.debug = debug
        return out


__all__ = ["MultiBackendAdapter"]
