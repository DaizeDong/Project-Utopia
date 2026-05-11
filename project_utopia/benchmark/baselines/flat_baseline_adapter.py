"""FlatBaselineAdapter — E1 control adapter (single LLM, no hierarchy).

Python port of ``src/benchmark/baselines/FlatBaselineAdapter.js``.

Behaviour:

- Single fused prompt for all 4 channels per cache window
  (default 30 s TTL).
- Each ``request(channel, payload)`` returns the per-channel slice of the
  fused response with prompt/completion token budgets divided by 4 so
  hierarchical and flat baselines are compared on equal budgets.
- Per-channel schema gates run on ``environment-director`` and
  ``npc-policy``; ``strategic-plan`` and ``colony-agent`` pass through.
- Failure modes (transport error, JSON parse failure, schema reject, missing
  sub-channel) return a ``fallback=True`` :class:`DecisionResponse`.
"""

from __future__ import annotations

import json
import time
from typing import Any

from pydantic import ValidationError

from ...simulation.ai.llm.agent_adapter import (
    AgentAdapter,
    CHANNELS,
    DecisionResponse,
    SCHEMA_VERSION,
    UsageStats,
)
from ...simulation.ai.llm.guardrails import (
    guard_environment_directive,
    guard_group_policies,
)
from ...simulation.ai.llm.prompt_payload import (
    build_environment_prompt_user_content,
    build_policy_prompt_user_content,
)
from ...simulation.ai.llm.response_schema import EnvironmentDirective, NpcPolicyEnvelope

DEFAULT_CACHE_TTL_MS: float = 30_000.0
DEFAULT_TIMEOUT_MS: float = 30_000.0

CHANNEL_KEY: dict[str, str] = {
    "environment-director": "env",
    "npc-policy": "policy",
    "strategic-plan": "strategic",
    "colony-agent": "colony",
}


def _now_ms() -> float:
    return time.monotonic() * 1000.0


def _estimate_tokens(text: Any) -> int:
    """Crude ~4-chars-per-token heuristic (matches the JS port)."""
    if text is None:
        return 0
    s = str(text)
    if not s.strip():
        return 0
    return max(1, round(len(s) / 4))


def _build_fused_prompt(payload_by_channel: dict[str, Any]) -> str:
    env_prompt = (
        build_environment_prompt_user_content(payload_by_channel["environment-director"])
        if "environment-director" in payload_by_channel and payload_by_channel["environment-director"]
        else ""
    )
    policy_prompt = (
        build_policy_prompt_user_content(payload_by_channel["npc-policy"])
        if "npc-policy" in payload_by_channel and payload_by_channel["npc-policy"]
        else ""
    )
    strategic_summary = payload_by_channel.get("strategic-plan")
    colony_summary = payload_by_channel.get("colony-agent")

    header = "\n".join((
        "Make all 4 decisions at once: weather (env), policy (groups), strategic plan, colony build.",
        "Output JSON object {env: {...}, policy: {...}, strategic: {...}, colony: {...}}.",
        "Each sub-object must validate against its channel schema; do not emit prose outside JSON.",
    ))
    body = {
        "schemaVersion": SCHEMA_VERSION,
        "fused": True,
        "instructions": header,
        "channels": {
            "env": env_prompt or None,
            "policy": policy_prompt or None,
            "strategic": strategic_summary,
            "colony": colony_summary,
        },
    }
    return json.dumps(body, indent=2, sort_keys=True)


def _parse_fused_response(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, dict):
        # Accept either {env, policy, strategic, colony} directly, or {"data": {...}}.
        if any(k in raw for k in ("env", "policy", "strategic", "colony")):
            return raw
        if isinstance(raw.get("data"), dict):
            return raw["data"]
        return raw
    if not isinstance(raw, str):
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None


def _empty_directive_for_channel(channel: str, error: str | Exception | None) -> DecisionResponse:
    return DecisionResponse(
        data=None,
        fallback=True,
        usage=UsageStats(prompt_tokens=0, completion_tokens=0, cached_tokens=0),
        latency_ms=0.0,
        model="flat-baseline-fallback",
        error=str(error or "flat baseline fallback"),
        debug={"channel": channel, "reason": "fallback"},
    )


class _StubLLMResult(dict):
    """Container used internally for the stub LLM client return value."""


class FlatBaselineAdapter(AgentAdapter):
    """Fused 4-channel adapter (E1 control)."""

    def __init__(
        self,
        *,
        base_url: str = "",
        model: str = "",
        timeout_ms: float = DEFAULT_TIMEOUT_MS,
        cache_ttl_ms: float = DEFAULT_CACHE_TTL_MS,
        llm_client: Any = None,
    ) -> None:
        super().__init__()
        self.base_url = base_url
        self.model = model
        self.timeout_ms = float(timeout_ms) if float(timeout_ms) > 0 else DEFAULT_TIMEOUT_MS
        self.cache_ttl_ms = float(cache_ttl_ms) if float(cache_ttl_ms) > 0 else DEFAULT_CACHE_TTL_MS
        self.llm_client = llm_client  # Must expose async `request_strategic(prompt, enabled, fallback_data)`.

        self._cache: dict[str, Any] | None = None
        self._pending_payloads: dict[str, Any] = {}
        self.llm_call_count: int = 0
        self.cache_hit_count: int = 0

    def _is_cache_fresh(self) -> bool:
        return self._cache is not None and float(self._cache["expires_at_ms"]) > _now_ms()

    def _invalidate_cache(self) -> None:
        self._cache = None

    async def _fuse_and_call(self) -> dict[str, Any]:
        payload_by_channel: dict[str, Any] = {}
        for ch in CHANNELS:
            if ch in self._pending_payloads:
                payload_by_channel[ch] = self._pending_payloads[ch]
        fused_prompt = _build_fused_prompt(payload_by_channel)
        fused_prompt_tokens = _estimate_tokens(fused_prompt)

        if self.llm_client is None or not hasattr(self.llm_client, "request_strategic"):
            result = {
                "fallback": True,
                "data": None,
                "latency_ms": 0.0,
                "error": "no llm client",
                "model": self.model or "flat-baseline-error",
                "debug": None,
            }
        else:
            try:
                result = await self.llm_client.request_strategic(fused_prompt, True, None)
            except Exception as err:  # noqa: BLE001 — translate to fallback envelope
                result = {
                    "fallback": True,
                    "data": None,
                    "latency_ms": 0.0,
                    "error": str(err) or "llm error",
                    "model": self.model or "flat-baseline-error",
                    "debug": None,
                }
        self.llm_call_count += 1

        parsed = _parse_fused_response(result.get("data") if isinstance(result, dict) else None)
        raw_data = result.get("data") if isinstance(result, dict) else None
        completion_text = raw_data if isinstance(raw_data, str) else json.dumps(raw_data or "")
        completion_tokens = _estimate_tokens(completion_text)

        self._cache = {
            "expires_at_ms": _now_ms() + self.cache_ttl_ms,
            "parsed": parsed if isinstance(parsed, dict) else None,
            "model": str(result.get("model") if isinstance(result, dict) else (self.model or "flat-baseline")),
            "fused_prompt_tokens": int(fused_prompt_tokens),
            "completion_tokens": int(completion_tokens),
            "latency_ms": float(result.get("latency_ms", 0) if isinstance(result, dict) else 0) or 0.0,
            "fallback": bool(result.get("fallback") if isinstance(result, dict) else True) or parsed is None,
            "error": str(result.get("error", "") if isinstance(result, dict) else ""),
            "debug": result.get("debug") if isinstance(result, dict) else None,
        }
        return self._cache

    async def request(
        self,
        channel: str,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        if channel not in CHANNELS:
            return _empty_directive_for_channel(channel, f"unknown channel: {channel}")
        self._pending_payloads[channel] = payload

        cache = self._cache
        if not self._is_cache_fresh():
            cache = await self._fuse_and_call()
        else:
            self.cache_hit_count += 1
        if not cache:
            return _empty_directive_for_channel(channel, "fused-call returned no cache")

        key = CHANNEL_KEY[channel]
        sub_payload = cache["parsed"].get(key) if isinstance(cache["parsed"], dict) else None

        validated_data: Any = sub_payload
        fallback = bool(cache["fallback"]) or sub_payload is None
        error = cache["error"]

        if not fallback:
            if channel == "environment-director":
                try:
                    validated = EnvironmentDirective.model_validate(sub_payload)
                    validated_data = guard_environment_directive(validated).model_dump(by_alias=False)
                except (ValidationError, ValueError) as ve:
                    fallback = True
                    error = f"schema: {ve}"
                    validated_data = None
            elif channel == "npc-policy":
                candidate = sub_payload if isinstance(sub_payload, dict) and "policies" in sub_payload else {"policies": sub_payload}
                try:
                    validated = NpcPolicyEnvelope.model_validate(candidate)
                    validated_data = guard_group_policies(validated).model_dump(by_alias=False)
                except (ValidationError, ValueError) as ve:
                    fallback = True
                    error = f"schema: {ve}"
                    validated_data = None

        per_channel_prompt = max(0, round(cache["fused_prompt_tokens"] / 4))
        per_channel_completion = max(0, round(cache["completion_tokens"] / 4))

        if fallback and validated_data is None:
            empty = _empty_directive_for_channel(channel, error or "fused parse failed")
            return DecisionResponse(
                data=None,
                fallback=True,
                usage=UsageStats(
                    prompt_tokens=per_channel_prompt,
                    completion_tokens=per_channel_completion,
                    cached_tokens=0,
                ),
                latency_ms=float(cache["latency_ms"]),
                model=str(cache["model"]),
                error=empty.error,
                debug={"channel": channel, "reason": "fallback"},
            )

        return DecisionResponse(
            data=validated_data,
            fallback=fallback,
            usage=UsageStats(
                prompt_tokens=per_channel_prompt,
                completion_tokens=per_channel_completion,
                cached_tokens=0,
            ),
            latency_ms=float(cache["latency_ms"]),
            model=str(cache["model"]),
            error=error,
            debug={
                "channel": channel,
                "fused": True,
                "cache_age_ms": max(0.0, self.cache_ttl_ms - (float(cache["expires_at_ms"]) - _now_ms())),
                "llm_call_count": self.llm_call_count,
                "cache_hit_count": self.cache_hit_count,
            },
        )


__all__ = ["FlatBaselineAdapter"]
