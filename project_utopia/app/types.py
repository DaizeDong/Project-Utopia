"""Common state-shape ``TypedDict``s (port of ``src/app/types.js``).

The JS source uses JSDoc ``@typedef`` blocks as a documentation-only type
system. We translate the most-load-bearing shapes (those traversed by
hashing, telemetry, and the AI runtime) into ``TypedDict``s with snake_case
internal names. Additional shapes will be filled in by later subagents as
the surface area expands.

For wire-format (NDJSON / proxy I/O) compatibility, downstream pydantic
models live alongside their respective modules and use
``populate_by_name=True`` + ``Field(alias=...)`` to bridge JS camelCase ↔
Python snake_case.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

__all__ = [
    "TileCoord",
    "Vec2",
    "ResourceState",
    "AiRuntimeStatsTD",
    "MetricsState",
    "SessionState",
    "GameState",
]


class TileCoord(TypedDict):
    """Integer tile coordinate on the world grid."""

    ix: int
    iz: int


class Vec2(TypedDict):
    """Continuous 2D vector in the simulation's ``(x, z)`` plane."""

    x: float
    z: float


class ResourceState(TypedDict, total=False):
    """Stockpile resource counts.

    The JS source carries ``food`` + ``wood`` at minimum; the worker
    carry-tuple extends to ``{food, wood, stone, herbs}``. We declare all
    four as ``total=False`` so callers can populate incrementally.
    """

    food: float
    wood: float
    stone: float
    herbs: float


class AiRuntimeStatsTD(TypedDict, total=False):
    """``state.metrics.aiRuntime`` shape.

    A ``TypedDict`` mirror of :class:`AiRuntimeStatsModel` in
    :mod:`project_utopia.app.ai_runtime_stats`. The pydantic model is the
    authoritative validator; this ``TypedDict`` exists for callers that
    only need static typing (no runtime cost).
    """

    requestCount: int
    responseCount: int
    environmentRequests: int
    policyRequests: int
    environmentResponses: int
    policyResponses: int
    llmResponseCount: int
    fallbackResponseCount: int
    timeoutCount: int
    errorCount: int
    recoveryCount: int
    avgLatencyMs: float
    lastLatencyMs: float
    lastRequestSec: float
    lastResponseSec: float
    lastLiveSec: float
    lastFallbackSec: float
    maxUnrecoveredFallbackSec: float
    consecutiveFallbackResponses: int
    lastErrorKind: str
    lastErrorMessage: str
    lastResultSource: str
    coverageTarget: Literal["fallback", "llm"]
    liveCoverageSatisfied: bool
    # Token telemetry (S5).
    promptTokens: int
    completionTokens: int
    cachedTokens: int
    firstTokenLatencyMs: float
    tokensPerSec: float
    kvCacheHits: int
    prefixHits: int


class MetricsState(TypedDict, total=False):
    """Top-level ``state.metrics`` slice.

    Only the keys that the Phase-1 app/* modules touch are typed. Other
    subagents extend this as they port their slices.
    """

    timeSec: float
    tick: int
    frameMs: float
    frameCount: int
    warnings: list[str]
    warningLog: list[dict[str, Any]]
    ai_runtime: AiRuntimeStatsTD  # NOTE: stored under string key "ai_runtime"
    populationStats: dict[str, int]


class SessionState(TypedDict, total=False):
    """Run lifecycle state."""

    phase: Literal["menu", "active", "end"]
    outcome: Literal["none", "loss"]
    reason: str
    endedAtSec: float


class GameState(TypedDict, total=False):
    """Coarse-grained type for the top-level state bag.

    All slices are optional because Phase-1 doesn't yet ship every
    subsystem. Treat this as documentation; runtime validation lives in
    the per-slice pydantic models.
    """

    metrics: MetricsState
    session: SessionState
    resources: ResourceState
    ai: dict[str, Any]
    gameplay: dict[str, Any]
    controls: dict[str, Any]
    debug: dict[str, Any]
    agents: list[dict[str, Any]]
    animals: list[dict[str, Any]]
    environment: dict[str, Any]
    weather: dict[str, Any]
    world: dict[str, Any]
    grid: dict[str, Any]
    buildings: dict[str, int]
    events: dict[str, Any]
