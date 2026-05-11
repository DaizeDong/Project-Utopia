"""colony-agent channel — Python port of ``src/simulation/ai/colony``.

Exports the :class:`ColonyAgentSystem` System. Drops the JS chronicle/UI
flavour (perceiver formatting, plan evaluator scoring, learned skill
library, placement specialist sub-agent, build proposer cascade) per the
RC3 audit; the Python port keeps only the four operational concerns:

1. sim-time-gated tick (default 2s) + plan-stall replan trigger,
2. observation envelope (state slice + recent memory),
3. response validation against ``list[ColonyPlanStep]`` + plan-step
   sanitization,
4. fallback path on adapter exception / schema failure / disabled LLM.

The pydantic emitted type is ``list[ColonyPlanStep]`` (the active plan), which
the harness writes to ``state.ai["colony_plan"]``.
"""

from __future__ import annotations

from .colony_agent_system import (
    DEFAULT_COLONY_AGENT_INTERVAL_SEC,
    DEFAULT_COLONY_PLAN_STALL_SEC,
    ColonyAgentSystem,
    build_fallback_colony_plan,
)

__all__ = [
    "DEFAULT_COLONY_AGENT_INTERVAL_SEC",
    "DEFAULT_COLONY_PLAN_STALL_SEC",
    "ColonyAgentSystem",
    "build_fallback_colony_plan",
]
