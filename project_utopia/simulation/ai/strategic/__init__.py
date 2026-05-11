"""strategic-plan channel — Python port of ``src/simulation/ai/strategic``.

Exports the :class:`StrategicPlanSystem` System and its decision scheduler.
Drops the JS phase preamble, multi-candidate menu, observation memory write,
chronicle exchange, debug aiTrace per the RC3 audit — the Python port keeps
only the four operational concerns:

1. heartbeat + cadence + crisis-trigger gate (default 90s heartbeat),
2. observation envelope (state slice + budget context),
3. response validation against
   :class:`~project_utopia.simulation.ai.llm.response_schema.StrategicPlan`
   + ``guard_strategic_plan`` clamp,
4. fallback path on adapter exception / schema failure / disabled LLM.

The D5 runMode gate is enforced: when ``state.ai.run_mode == "llm"`` but no
adapter is wired, the channel emits a deterministic fallback instead of
calling :func:`asyncio.run` on a missing coroutine.
"""

from __future__ import annotations

from .decision_scheduler import DecisionScheduler
from .strategic_plan_system import (
    DEFAULT_STRATEGIC_HEARTBEAT_SEC,
    StrategicPlanSystem,
    build_fallback_strategic_plan,
)

__all__ = [
    "DEFAULT_STRATEGIC_HEARTBEAT_SEC",
    "DecisionScheduler",
    "StrategicPlanSystem",
    "build_fallback_strategic_plan",
]
