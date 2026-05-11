"""npc-policy channel — Python port of ``src/simulation/ai/brains``.

Exports the :class:`NpcPolicySystem` System. Drops the JS chronicle/UI
flavour (delta menu analytics, validation telemetry, debug aiTrace, infeasible
state-target warnings) per the RC3 audit; the Python port keeps only the four
operational concerns:

1. cadence-gated tick (default ``NPC_POLICY_INTERVAL_SEC`` = 8s),
2. observation envelope (world summary + threat context),
3. response validation + ``guard_group_policies`` clamp (with raid-posture
   override when threat ≥ 80),
4. fallback path on adapter exception / schema failure / disabled LLM.
"""

from __future__ import annotations

from .npc_policy_system import (
    DEFAULT_NPC_POLICY_INTERVAL_SEC,
    NpcPolicySystem,
    build_fallback_group_policies,
)

__all__ = [
    "DEFAULT_NPC_POLICY_INTERVAL_SEC",
    "NpcPolicySystem",
    "build_fallback_group_policies",
]
