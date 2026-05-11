"""AgentAdapter — 4-channel adapter interface (Python port of JS AgentAdapter.js).

The seam between the simulation's per-channel decision sites and any agent
framework (litellm proxy, vLLM, HTTPAgentClient, deterministic fallback).

Channels are stable strings; they MUST match the JS port exactly so wire
formats (NDJSON traces, agent-bridge requests) stay interoperable across the
two implementations during the migration:

    "environment-director", "npc-policy", "strategic-plan", "colony-agent"
"""

from __future__ import annotations

import abc
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "1.0"

Channel = Literal[
    "environment-director",
    "npc-policy",
    "strategic-plan",
    "colony-agent",
]

CHANNELS: tuple[Channel, ...] = (
    "environment-director",
    "npc-policy",
    "strategic-plan",
    "colony-agent",
)


class UsageStats(BaseModel):
    """Token + latency telemetry returned alongside every DecisionResponse.

    Internal snake_case fields are mirrored to camelCase wire aliases so NDJSON
    consumers built around the JS implementation keep working unchanged.
    """

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    prompt_tokens: int = Field(default=0, alias="promptTokens", ge=0)
    completion_tokens: int = Field(default=0, alias="completionTokens", ge=0)
    cached_tokens: int = Field(default=0, alias="cachedTokens", ge=0)
    first_token_latency_ms: float | None = Field(default=None, alias="firstTokenLatencyMs")
    tokens_per_sec: float | None = Field(default=None, alias="tokensPerSec")
    kv_cache_hits: int | None = Field(default=None, alias="kvCacheHits")
    prefix_hits: int | None = Field(default=None, alias="prefixHits")


class DecisionResponse(BaseModel):
    """Envelope returned by every AgentAdapter.request() call.

    Mirrors the JS DecisionResponse exactly. `data` is the channel-specific
    directive (may be a pydantic model dump, may be None when `fallback`).
    `latency_ms` / `usage` / `model` carry telemetry; `error` is a compact
    one-line string when the adapter failed; `debug` is an open dict the
    caller may use for tracing.

    Wire-format note: ``model_dump(by_alias=True)`` emits camelCase keys
    (``latencyMs``, ``firstTokenLatencyMs`` etc.) so NDJSON traces stay
    drop-in compatible with the JS port.
    """

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    data: dict[str, Any] | list[Any] | None = None
    fallback: bool = False
    usage: UsageStats | None = None
    latency_ms: float = Field(default=0.0, alias="latencyMs", ge=0.0)
    model: str | None = None
    error: str = ""
    debug: dict[str, Any] = Field(default_factory=dict)


class AgentAdapter(abc.ABC):
    """Abstract base class for the 4-channel adapter contract.

    Concrete subclasses MUST implement ``async request(channel, payload,
    options=None)`` and:

    - Return a :class:`DecisionResponse` even on failure (``fallback=True``).
    - Tolerate ``schema_version`` mismatch by returning a fallback rather than
      raising — callers degrade to the deterministic policy.
    - Never mutate ``payload``.
    """

    schema_version: ClassVar[str] = SCHEMA_VERSION

    @abc.abstractmethod
    async def request(
        self,
        channel: Channel,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:  # pragma: no cover - abstract
        raise NotImplementedError(
            f"AgentAdapter.request not implemented for channel={channel}; "
            "subclass must override (see llm_client.py / http_agent_client.py)."
        )


class NoopAgentAdapter(AgentAdapter):
    """Empty adapter — returns a fallback DecisionResponse for every request.

    Useful as the default during tests and as the upper bound when the
    benchmark runs in "AI disabled" mode.
    """

    async def request(
        self,
        channel: Channel,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        return DecisionResponse(
            data=None,
            fallback=True,
            usage=None,
            latency_ms=0.0,
            model="noop",
            error="",
            debug={"channel": channel, "payloadEcho": payload},
        )


__all__ = [
    "AgentAdapter",
    "CHANNELS",
    "Channel",
    "DecisionResponse",
    "NoopAgentAdapter",
    "SCHEMA_VERSION",
    "UsageStats",
]
