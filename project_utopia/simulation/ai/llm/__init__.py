"""LLM channel adapters + schemas + guardrails (Phase 1 Python port)."""

from __future__ import annotations

from .agent_adapter import (
    AgentAdapter,
    CHANNELS,
    Channel,
    DecisionResponse,
    NoopAgentAdapter,
    SCHEMA_VERSION,
    UsageStats,
)
from .response_schema import (
    ColonyPlan,
    ColonyPlanStep,
    EnvironmentDirective,
    EventSpawn,
    GroupPolicy,
    NpcPolicyEnvelope,
    StateTarget,
    StrategicPlan,
)
from .guardrails import (
    guard_environment_directive,
    guard_group_policies,
    guard_group_policy,
    guard_strategic_plan,
)
from .prompt_payload import (
    PromptPayload,
    build_environment_prompt_user_content,
    build_policy_prompt_user_content,
    pick_highlights,
)

__all__ = [
    "AgentAdapter",
    "CHANNELS",
    "Channel",
    "ColonyPlan",
    "ColonyPlanStep",
    "DecisionResponse",
    "EnvironmentDirective",
    "EventSpawn",
    "GroupPolicy",
    "NoopAgentAdapter",
    "NpcPolicyEnvelope",
    "PromptPayload",
    "SCHEMA_VERSION",
    "StateTarget",
    "StrategicPlan",
    "UsageStats",
    "build_environment_prompt_user_content",
    "build_policy_prompt_user_content",
    "guard_environment_directive",
    "guard_group_policies",
    "guard_group_policy",
    "guard_strategic_plan",
    "pick_highlights",
]
