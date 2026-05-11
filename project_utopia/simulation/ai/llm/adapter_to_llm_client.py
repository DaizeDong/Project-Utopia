"""AdapterToLLMClient — LLMClient-style shim wrapping an AgentAdapter.

Mirrors the JS ``AdapterToLLMClient.js``. The benchmark framework can swap
any :class:`AgentAdapter` (FlatBaselineAdapter, ScriptedOraclePolicy,
HTTPAgentClient, LayerCastAdapter, NoopAgentAdapter, …) behind the same
LLMClient-style surface the sim systems already consume — each call is
forwarded to ``adapter.request(channel, payload, options)`` and the
:class:`DecisionResponse` is unwrapped into the per-channel envelope.
"""

from __future__ import annotations

import time
from typing import Any

from pydantic import ValidationError

from .agent_adapter import AgentAdapter, CHANNELS, Channel, DecisionResponse, SCHEMA_VERSION
from .guardrails import (
    guard_environment_directive,
    guard_group_policies,
    guard_strategic_plan,
)
from .response_schema import (
    EnvironmentDirective,
    NpcPolicyEnvelope,
    StrategicPlan,
)

DEFAULT_TIMEOUT_MS = 30_000.0


def _now_ms() -> float:
    return time.perf_counter() * 1000.0


def _build_options(extra: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "timeoutMs": DEFAULT_TIMEOUT_MS,
        **(extra or {}),
    }


class AdapterToLLMClient:
    """Wrap an :class:`AgentAdapter` to expose an LLMClient-style API.

    Surface compatible with the JS shim — each request method validates the
    adapter's payload against the matching pydantic schema, applies the
    idempotent guardrail clamp, and returns either the guarded directive or
    a fallback envelope when the adapter degraded.
    """

    def __init__(self, agent_adapter: AgentAdapter) -> None:
        if not isinstance(agent_adapter, AgentAdapter):
            raise TypeError(
                "AdapterToLLMClient: agent_adapter must subclass AgentAdapter"
            )
        self.agent_adapter = agent_adapter
        self.last_status: str = "idle"
        self.last_model: str = ""
        self.last_latency_ms: float = 0.0
        self.last_error: str = ""

    def _record_status(self, response: DecisionResponse) -> None:
        self.last_model = response.model or self.last_model
        self.last_latency_ms = float(response.latency_ms or 0.0)
        self.last_error = str(response.error or "")
        if response.error:
            self.last_status = "error"
        elif response.fallback:
            self.last_status = "fallback"
        else:
            self.last_status = "ok"

    async def _safe_request(
        self,
        channel: Channel,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        if channel not in CHANNELS:
            return DecisionResponse(
                data=None,
                fallback=True,
                latency_ms=0.0,
                model="fallback",
                error=f"unknown channel: {channel}",
                debug={"channel": channel, "source": "adapter-to-llm"},
            )
        started = _now_ms()
        try:
            r = await self.agent_adapter.request(channel, payload, _build_options(options))
        except BaseException as err:  # noqa: BLE001 — adapter contract is "never throw"
            latency = _now_ms() - started
            return DecisionResponse(
                data=None,
                fallback=True,
                latency_ms=latency,
                model="fallback",
                error=str(err) or err.__class__.__name__,
                debug={"channel": channel, "source": "adapter-to-llm"},
            )
        if not isinstance(r, DecisionResponse):
            # Coerce — adapters in the wild may return a dict.
            try:
                r = DecisionResponse.model_validate(r)
            except ValidationError as err:
                return DecisionResponse(
                    data=None,
                    fallback=True,
                    latency_ms=_now_ms() - started,
                    model="fallback",
                    error=f"adapter returned malformed envelope: {err}"[:200],
                    debug={"channel": channel, "source": "adapter-to-llm"},
                )
        return r

    # ── LLMClient-style methods ────────────────────────────────────────────

    async def request_environment(
        self, summary: Any, enabled: bool = True
    ) -> dict[str, Any]:
        response = await self._safe_request("environment-director", summary)
        self._record_status(response)

        if response.fallback or response.data is None:
            guarded = guard_environment_directive({})
            return {
                "fallback": True,
                "data": guarded.model_dump(by_alias=False),
                "latencyMs": response.latency_ms,
                "error": response.error,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        try:
            validated = EnvironmentDirective.model_validate(response.data)
        except ValidationError as err:
            guarded = guard_environment_directive(response.data)
            self.last_status = "fallback"
            self.last_error = f"schema: {err}"[:200]
            return {
                "fallback": True,
                "data": guarded.model_dump(by_alias=False),
                "latencyMs": response.latency_ms,
                "error": self.last_error,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        guarded = guard_environment_directive(validated.model_dump(by_alias=False))
        return {
            "fallback": False,
            "data": guarded.model_dump(by_alias=False),
            "latencyMs": response.latency_ms,
            "error": response.error,
            "model": response.model,
            "debug": response.debug or None,
        }

    async def request_policies(
        self, summary: Any, enabled: bool = True, *, threat: float = 0.0
    ) -> dict[str, Any]:
        response = await self._safe_request("npc-policy", summary)
        self._record_status(response)

        if response.fallback or response.data is None:
            guarded = guard_group_policies({}, threat=threat)
            return {
                "fallback": True,
                "data": guarded.model_dump(by_alias=False),
                "latencyMs": response.latency_ms,
                "error": response.error,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        candidate = (
            {"policies": response.data} if isinstance(response.data, list) else response.data
        )
        try:
            validated = NpcPolicyEnvelope.model_validate(candidate)
        except ValidationError as err:
            guarded = guard_group_policies(candidate, threat=threat)
            self.last_status = "fallback"
            self.last_error = f"schema: {err}"[:200]
            return {
                "fallback": True,
                "data": guarded.model_dump(by_alias=False),
                "latencyMs": response.latency_ms,
                "error": self.last_error,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        guarded = guard_group_policies(validated.model_dump(by_alias=False), threat=threat)
        return {
            "fallback": False,
            "data": guarded.model_dump(by_alias=False),
            "latencyMs": response.latency_ms,
            "error": response.error,
            "model": response.model,
            "debug": response.debug or None,
        }

    async def request_strategic(
        self,
        prompt_content: Any,
        enabled: bool = True,
        fallback_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = await self._safe_request("strategic-plan", prompt_content)
        self._record_status(response)

        if response.fallback or response.data is None:
            return {
                "fallback": True,
                "data": fallback_data,
                "latencyMs": response.latency_ms,
                "error": response.error,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        try:
            validated = StrategicPlan.model_validate(response.data)
        except ValidationError as err:
            guarded = guard_strategic_plan(response.data)
            self.last_status = "fallback"
            self.last_error = f"schema: {err}"[:200]
            return {
                "fallback": True,
                "data": guarded.model_dump(by_alias=False),
                "latencyMs": response.latency_ms,
                "error": self.last_error,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        guarded = guard_strategic_plan(validated.model_dump(by_alias=False))
        return {
            "fallback": False,
            "data": guarded.model_dump(by_alias=False),
            "latencyMs": response.latency_ms,
            "error": response.error,
            "model": response.model,
            "debug": response.debug or None,
        }

    async def request_plan(
        self,
        system_prompt: str,
        user_prompt: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "systemPrompt": system_prompt,
            "userPrompt": user_prompt,
            **(options or {}),
        }
        response = await self._safe_request("colony-agent", payload)
        self._record_status(response)

        if response.fallback or response.data is None:
            return {
                "ok": False,
                "plan": None,
                "source": "proxy-fallback",
                "error": response.error or "fallback",
                "latencyMs": response.latency_ms,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        # No schema enforcement here — ColonyPlanner validates server-side.
        plan_data = response.data
        if isinstance(plan_data, dict) and "plan" in plan_data:
            plan = plan_data.get("plan")
        else:
            plan = plan_data
        if not isinstance(plan, dict):
            return {
                "ok": False,
                "plan": None,
                "source": "client-error",
                "error": "schema: plan must be an object",
                "latencyMs": response.latency_ms,
                "model": response.model or "fallback",
                "debug": response.debug or None,
            }
        return {
            "ok": True,
            "plan": {**plan, "source": "llm"},
            "source": "llm",
            "error": response.error,
            "latencyMs": response.latency_ms,
            "model": response.model,
            "debug": response.debug or None,
        }


__all__ = ["AdapterToLLMClient"]
