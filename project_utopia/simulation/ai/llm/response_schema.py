"""Pydantic v2 response schemas for the 4 LLM decision channels.

Replaces the hand-rolled ``ResponseSchema.js`` validator. Pydantic raises
:class:`pydantic.ValidationError` on bad input; callers MUST catch and degrade
to fallback (this is how :mod:`guardrails` provides idempotent clamping).

Wire-format: every model uses ``populate_by_name=True`` plus ``Field(alias=...)``
so JSON keys stay camelCase (``durationSec``, ``factionTension`` etc.) — the
NDJSON traces, agent-bridge bodies, and existing fixtures keep working
unchanged across the JS/Py split.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ---------------------------------------------------------------------------
# Enums + constants (mirror JS src/config/constants.js + aiConfig.js).
# ---------------------------------------------------------------------------

WEATHER_VALUES = ("clear", "rain", "storm", "drought", "winter")
EVENT_TYPE_VALUES = (
    "animalMigration",
    "banditRaid",
    "tradeCaravan",
    "moraleBreak",
    "diseaseOutbreak",
    "wildfire",
)
DEFENSE_POSTURE_VALUES = ("defensive", "neutral", "offensive", "aggressive")

WeatherT = Literal["clear", "rain", "storm", "drought", "winter"]
EventTypeT = Literal[
    "animalMigration",
    "banditRaid",
    "tradeCaravan",
    "moraleBreak",
    "diseaseOutbreak",
    "wildfire",
]
DefensePostureT = Literal["defensive", "neutral", "offensive", "aggressive"]


# ---------------------------------------------------------------------------
# Channel 1 — environment-director
# ---------------------------------------------------------------------------


class EventSpawn(BaseModel):
    """A single weather/event spawn directive from the environment-director."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    type: EventTypeT
    intensity: float = Field(ge=0.0, le=10.0)
    duration_sec: float = Field(alias="durationSec", ge=0.0, le=600.0)


class EnvironmentDirective(BaseModel):
    """The environment-director's per-tick decision.

    Constraints follow ``ResponseSchema.js::validateEnvironmentDirective``.
    Numeric ranges are enforced at the pydantic boundary so the validator
    surfaces "out-of-range" rather than letting unsafe values reach the sim.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    weather: WeatherT
    duration_sec: int = Field(alias="durationSec", ge=8, le=180)
    faction_tension: float = Field(alias="factionTension", ge=0.0, le=1.0)
    event_spawns: list[EventSpawn] = Field(
        default_factory=list,
        alias="eventSpawns",
        max_length=3,
    )
    summary: str | None = None
    focus: str | None = None
    steering_notes: list[str] = Field(
        default_factory=list,
        alias="steeringNotes",
        max_length=8,
    )


# ---------------------------------------------------------------------------
# Channel 2 — npc-policy
# ---------------------------------------------------------------------------


class GroupPolicy(BaseModel):
    """A single group's intent + target policy directive."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    group_id: str = Field(alias="groupId", min_length=1)
    intent_weights: dict[str, float] = Field(default_factory=dict, alias="intentWeights")
    risk_tolerance: float = Field(alias="riskTolerance", ge=0.0, le=1.0)
    target_priorities: dict[str, float] = Field(
        default_factory=dict, alias="targetPriorities"
    )
    ttl_sec: float = Field(alias="ttlSec", ge=8.0, le=120.0)
    summary: str | None = None
    focus: str | None = None
    steering_notes: list[str] = Field(default_factory=list, alias="steeringNotes")

    @model_validator(mode="after")
    def _check_weights_finite(self) -> "GroupPolicy":
        for name, mapping in (
            ("intent_weights", self.intent_weights),
            ("target_priorities", self.target_priorities),
        ):
            for k, v in mapping.items():
                if not isinstance(k, str) or not k.strip():
                    raise ValueError(f"{name} key invalid: {k!r}")
                if v != v or v in (float("inf"), float("-inf")):
                    raise ValueError(f"{name}[{k}] not finite")
        return self


class StateTarget(BaseModel):
    """Optional npc-policy state-machine target directive."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    group_id: str = Field(alias="groupId", min_length=1)
    target_state: str = Field(alias="targetState", min_length=1)
    priority: float = Field(ge=0.0, le=1.0)
    ttl_sec: float = Field(alias="ttlSec", ge=0.0, le=120.0)
    reason: str | None = None


class NpcPolicyEnvelope(BaseModel):
    """Wrapper that the npc-policy channel returns: list of policies + targets."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    policies: list[GroupPolicy] = Field(default_factory=list)
    state_targets: list[StateTarget] = Field(default_factory=list, alias="stateTargets")


# ---------------------------------------------------------------------------
# Channel 3 — strategic-plan
# ---------------------------------------------------------------------------


class StrategicPlan(BaseModel):
    """High-level colony plan emitted by the strategic-plan channel."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    primary_goal: str = Field(alias="primaryGoal", min_length=1)
    constraints: list[str] = Field(default_factory=list)
    resource_budget: dict[str, float] = Field(
        default_factory=dict, alias="resourceBudget"
    )
    phase: str = "bootstrap"
    defense_posture: DefensePostureT = Field(default="neutral", alias="defensePosture")
    risk_tolerance: float | None = Field(
        default=None, alias="riskTolerance", ge=0.0, le=1.0
    )


# ---------------------------------------------------------------------------
# Channel 4 — colony-agent
# ---------------------------------------------------------------------------


class ColonyPlanStep(BaseModel):
    """One step of a colony-agent's grounded plan."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    action: str = Field(min_length=1)
    args: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list, alias="dependsOn")


class ColonyPlan(BaseModel):
    """A colony-agent plan: an ordered list of steps + per-plan metadata."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    steps: list[ColonyPlanStep] = Field(default_factory=list)
    rationale: str | None = None
    source: str | None = None


__all__ = [
    "ColonyPlan",
    "ColonyPlanStep",
    "DEFENSE_POSTURE_VALUES",
    "DefensePostureT",
    "EVENT_TYPE_VALUES",
    "EnvironmentDirective",
    "EventSpawn",
    "EventTypeT",
    "GroupPolicy",
    "NpcPolicyEnvelope",
    "StateTarget",
    "StrategicPlan",
    "WEATHER_VALUES",
    "WeatherT",
]
