"""Long-run telemetry / tuning profile (port of ``src/config/longRunProfile.js``).

The JS module bundled FPS/freeze/render-stall thresholds for the
removed browser shell alongside AI cadence overrides. The academic
benchmark is headless, so only the AI-cadence + event-cap surfaces are
ported here. Threshold + screenshot tables stay archived in the JS
source.

Exports:

* :data:`AI_LONG_RUN_TUNING` — per-channel cadence override applied when
  ``state.ai.runtimeProfile == "long_run"``.
* :data:`EVENT_LONG_RUN_TUNING` — event queue concurrency caps.
* :data:`LONG_RUN_PROFILE` — top-level frozen view bundling the two.
* :func:`get_long_run_ai_tuning` — runtime-profile-aware lookup.
* :func:`get_long_run_event_tuning` — runtime-profile-aware lookup.
"""

from __future__ import annotations

import math
from types import MappingProxyType
from typing import Any

__all__ = [
    "AI_LONG_RUN_TUNING",
    "EVENT_LONG_RUN_TUNING",
    "LONG_RUN_PROFILE",
    "get_long_run_ai_tuning",
    "get_long_run_event_tuning",
]


AI_LONG_RUN_TUNING: MappingProxyType[str, float] = MappingProxyType(
    {
        "environmentDecisionIntervalSec": 18.0,
        "policyDecisionIntervalSec": 20.0,
        "policyTtlDefaultSec": 36.0,
        "maxDirectiveDurationSec": 150.0,
    }
)

_AI_DEFAULT_TUNING: MappingProxyType[str, float] = MappingProxyType(
    {
        "environmentDecisionIntervalSec": 12.0,
        "policyDecisionIntervalSec": 10.0,
        "policyTtlDefaultSec": 24.0,
        "maxDirectiveDurationSec": 120.0,
    }
)


EVENT_LONG_RUN_TUNING: MappingProxyType[str, Any] = MappingProxyType(
    {
        "maxConcurrentByType": MappingProxyType(
            {
                "banditRaid": 1,
                "tradeCaravan": 1,
                "animalMigration": 1,
                "diseaseOutbreak": 1,
                "wildfire": 1,
                "moraleBreak": 1,
                "sabotage": 1,
            }
        ),
        "maxBanditRaidPressure": 1.75,
        "maxEventPressurePerEvent": 1.9,
    }
)


_EVENT_DEFAULT_TUNING: MappingProxyType[str, Any] = MappingProxyType(
    {
        # Pre-v0.8.5, EventDirector + RaidEscalator could both enqueue
        # BANDIT_RAID independently in the same tick. Cap to 1 outside
        # long-run mode too.
        "maxConcurrentByType": MappingProxyType({"banditRaid": 1}),
        "maxBanditRaidPressure": math.inf,
        "maxEventPressurePerEvent": math.inf,
    }
)


LONG_RUN_PROFILE: MappingProxyType[str, Any] = MappingProxyType(
    {
        "ai": MappingProxyType({"tuning": AI_LONG_RUN_TUNING}),
        "events": MappingProxyType({"tuning": EVENT_LONG_RUN_TUNING}),
    }
)


def _resolve_runtime_profile(state_or_profile: object) -> str:
    """Mirror the JS helper that accepts either a profile string or a state bag."""
    if isinstance(state_or_profile, str):
        return state_or_profile
    if isinstance(state_or_profile, dict):
        ai = state_or_profile.get("ai") if isinstance(state_or_profile.get("ai"), dict) else None
        if ai is not None:
            return str(ai.get("runtimeProfile", "") or "")
    return ""


def get_long_run_ai_tuning(state_or_profile: object = None) -> MappingProxyType[str, float]:
    """Return the AI-cadence tuning for the given runtime profile."""
    if _resolve_runtime_profile(state_or_profile) == "long_run":
        return AI_LONG_RUN_TUNING
    return _AI_DEFAULT_TUNING


def get_long_run_event_tuning(state_or_profile: object = None) -> MappingProxyType[str, Any]:
    """Return the event-cap tuning for the given runtime profile."""
    if _resolve_runtime_profile(state_or_profile) == "long_run":
        return EVENT_LONG_RUN_TUNING
    return _EVENT_DEFAULT_TUNING
