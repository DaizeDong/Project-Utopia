"""environment-director channel — Python port of ``src/simulation/ai/director``.

Exports the :class:`EnvironmentDirectorSystem` System. Drops the JS
chronicle/UI flavour (toast warnings, post-rated menu, debug aiTrace) — those
were already cut in the RC3 audit. The Python port keeps only the four
operational concerns described in :mod:`project_utopia.simulation.ai`:

1. cadence-gated tick (default ``environment_decision_interval_sec`` = 8s),
2. observation envelope built from world summary,
3. response validation + idempotent guardrails clamp,
4. fallback path on adapter exception / schema failure / disabled LLM.
"""

from __future__ import annotations

from .environment_director_system import (
    DEFAULT_ENVIRONMENT_INTERVAL_SEC,
    EnvironmentDirectorSystem,
    build_fallback_environment_directive,
)

__all__ = [
    "DEFAULT_ENVIRONMENT_INTERVAL_SEC",
    "EnvironmentDirectorSystem",
    "build_fallback_environment_directive",
]
