"""LayerCastAdapter — hardware-independent deterministic-inference wrapper.

Python port of ``LayerCastAdapter.js``. Wraps an inner :class:`AgentAdapter`
(typically :class:`LLMClient`-backed) and injects LayerCast metadata into
every request:

- HTTP headers: ``X-LayerCast-Weights: bf16``, ``X-LayerCast-Compute: fp32``,
  ``X-LayerCast-Deterministic: true``.
- Body: ``inference_config: {"weights": "bf16", "compute": "fp32",
  "deterministic": true}``.

The probe-fallback mechanic mirrors the JS port:
  1. First request is attempted in passthrough mode.
  2. If the response acknowledges LayerCast (via
     ``inference_config_acknowledged`` flag, ``usage.deterministic``, or a
     model name containing "layercast"), the adapter records that
     deterministic mode is active and keeps passing through.
  3. If LayerCast is NOT acknowledged AND a :class:`RecordReplayCache` is
     attached, the adapter degrades to replay-only.

Fingerprint = ``model | temperature | top_p`` (the three knobs that change
deterministic output between runs even with identical prompts).
"""

from __future__ import annotations

import os
import re
import time
from types import MappingProxyType
from typing import Any

from pydantic import ValidationError

from .agent_adapter import (
    AgentAdapter,
    CHANNELS,
    Channel,
    DecisionResponse,
    SCHEMA_VERSION,
)
from .guardrails import guard_environment_directive, guard_group_policies
from .prompt_payload import (
    build_environment_prompt_user_content,
    build_policy_prompt_user_content,
)
from .record_replay_cache import RecordReplayCache, RecordReplayCacheMiss
from .response_schema import EnvironmentDirective, NpcPolicyEnvelope

LAYERCAST_HEADERS = MappingProxyType(
    {
        "X-LayerCast-Weights": "bf16",
        "X-LayerCast-Compute": "fp32",
        "X-LayerCast-Deterministic": "true",
    }
)
LAYERCAST_INFERENCE_CONFIG = MappingProxyType(
    {"weights": "bf16", "compute": "fp32", "deterministic": True}
)

_ENV_VAR_NAME = "LAYERCAST_DETERMINISTIC_MODE"
_LAYERCAST_RE = re.compile(r"layercast", re.IGNORECASE)


def _now_ms() -> float:
    return time.perf_counter() * 1000.0


def _build_prompt_for_channel(channel: Channel, payload: Any) -> str:
    if channel == "environment-director":
        return build_environment_prompt_user_content(payload or {})
    if channel == "npc-policy":
        return build_policy_prompt_user_content(payload or {})
    if isinstance(payload, str):
        return payload
    try:
        import json
        return json.dumps(payload, sort_keys=True)
    except (TypeError, ValueError):
        return str(payload)


def _infer_deterministic_mode(result: Any) -> bool:
    if result is None:
        return False
    debug: dict[str, Any] = {}
    usage: dict[str, Any] = {}
    model = ""
    if isinstance(result, DecisionResponse):
        debug = result.debug or {}
        usage = (result.usage.model_dump() if result.usage else {})
        model = result.model or ""
    elif isinstance(result, dict):
        debug = result.get("debug") or {}
        usage = result.get("usage") or {}
        model = str(result.get("model") or "")
        if result.get("inference_config_acknowledged") is True:
            return True
    if isinstance(debug, dict) and debug.get("inference_config_acknowledged") is True:
        return True
    if isinstance(usage, dict) and (
        usage.get("deterministic") is True or usage.get("layercast") is True
    ):
        return True
    if model and _LAYERCAST_RE.search(str(model)):
        return True
    return False


def _fingerprint(model: str, temperature: float | None, top_p: float | None) -> str:
    def _fmt(value: float | None) -> str:
        if value is None:
            return "default"
        try:
            return f"{float(value):.4f}"
        except (TypeError, ValueError):
            return "default"

    return f"model={model or 'unknown'}|temp={_fmt(temperature)}|top_p={_fmt(top_p)}"


def _empty_fallback(channel: Channel, error: str, latency_ms: float = 0.0,
                    model: str = "layercast-fallback") -> DecisionResponse:
    return DecisionResponse(
        data=None,
        fallback=True,
        latency_ms=latency_ms,
        model=model,
        error=str(error) or "layercast adapter fallback",
        debug={"channel": channel, "reason": "fallback"},
    )


class LayerCastAdapter(AgentAdapter):
    """Wrap an inner :class:`AgentAdapter` with LayerCast determinism metadata.

    Args:
        inner: The underlying adapter to call. If ``None``, an
            :class:`LLMClient`-backed adapter is constructed lazily.
        base_url / model / temperature / top_p: Sampler knobs included in
            both the request body and the cache fingerprint.
        record_replay_cache: Optional :class:`RecordReplayCache` used as the
            fallback channel when LayerCast support is not advertised.
    """

    def __init__(
        self,
        *,
        inner: AgentAdapter | None = None,
        base_url: str | None = None,
        model: str = "",
        temperature: float = 0.0,
        top_p: float = 1.0,
        record_replay_cache: RecordReplayCache | None = None,
    ) -> None:
        self.base_url = base_url or ""
        self.model = model
        self.temperature = float(temperature) if temperature is not None else 0.0
        self.top_p = float(top_p) if top_p is not None else 1.0
        self.inner = inner
        self.record_replay_cache = record_replay_cache

        # Verified after first request:
        #   None  — not yet probed
        #   True  — proxy acknowledged LayerCast / deterministic mode
        #   False — proxy did NOT acknowledge; fallback to record-replay
        self._supported: bool | None = None
        self._last_fingerprint: str = ""
        self._captured_requests: list[dict[str, Any]] = []
        self._headers = dict(LAYERCAST_HEADERS)

        # Best-effort env flag for downstream bridges.
        try:
            os.environ[_ENV_VAR_NAME] = "true"
        except OSError:  # pragma: no cover - extremely unusual
            pass

    def is_deterministic_mode_active(self) -> bool:
        """True iff LayerCast is supported (probe complete + acknowledged)."""
        return self._supported is True

    def _capture(self, req: dict[str, Any]) -> None:
        self._captured_requests.append(req)
        if len(self._captured_requests) > 16:
            self._captured_requests.pop(0)

    def _get_inner(self) -> AgentAdapter:
        if self.inner is None:
            # Lazy LLMClient bridge — only constructed when we don't have a
            # caller-supplied inner adapter (keeps tests injecting their own).
            from .llm_client import LLMClient

            class _LLMClientBridge(AgentAdapter):
                def __init__(self, client: LLMClient) -> None:
                    self.client = client

                async def request(
                    self,
                    channel: Channel,
                    payload: Any,
                    options: dict[str, Any] | None = None,
                ) -> DecisionResponse:
                    prompt = _build_prompt_for_channel(channel, payload)
                    messages = [
                        {"role": "system", "content": f"Channel: {channel}"},
                        {"role": "user", "content": prompt},
                    ]
                    return await self.client.request_completion(
                        messages, channel=channel, options=options
                    )

            self.inner = _LLMClientBridge(LLMClient(base_url=self.base_url, model=self.model))
        return self.inner

    async def request(
        self,
        channel: Channel,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        if channel not in CHANNELS:
            return _empty_fallback(channel, f"unknown channel: {channel}")

        prompt_str = _build_prompt_for_channel(channel, payload)
        fingerprint = _fingerprint(self.model, self.temperature, self.top_p)
        self._last_fingerprint = fingerprint

        request_body = {
            "channel": channel,
            "schemaVersion": (options or {}).get("schemaVersion", SCHEMA_VERSION),
            "prompt": prompt_str,
            "model": self.model,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "inference_config": dict(LAYERCAST_INFERENCE_CONFIG),
            "headers": dict(self._headers),
            "fingerprint": fingerprint,
        }
        cache_req = {
            "channel": channel,
            "model": self.model,
            "prompt": prompt_str,
            "temperature": self.temperature,
            "top_p": self.top_p,
        }

        # Already know LayerCast is unsupported and we have a cache → straight to replay.
        if self._supported is False and self.record_replay_cache is not None:
            try:
                cached = await self.record_replay_cache.get(cache_req)
            except RecordReplayCacheMiss:
                cached = None
            if cached:
                return self._normalize_cached(cached, channel, fingerprint)
            return _empty_fallback(
                channel,
                "layercast unsupported and no replay entry",
                model=self.model or "layercast-replay-miss",
            )

        self._capture(request_body)

        merged_options = dict(options or {})
        merged_options.setdefault("model", self.model)
        merged_options.setdefault("temperature", self.temperature)
        merged_options.setdefault("top_p", self.top_p)
        merged_options.setdefault("headers", dict(self._headers))
        merged_options.setdefault("inference_config", dict(LAYERCAST_INFERENCE_CONFIG))

        started = _now_ms()
        try:
            result = await self._get_inner().request(channel, payload, merged_options)
        except Exception as err:  # noqa: BLE001
            latency = _now_ms() - started
            self._supported = False
            if self.record_replay_cache is not None:
                try:
                    cached = await self.record_replay_cache.get(cache_req)
                except RecordReplayCacheMiss:
                    cached = None
                if cached:
                    return self._normalize_cached(cached, channel, fingerprint)
            return _empty_fallback(
                channel,
                str(err) or "layercast error",
                latency_ms=latency,
                model=self.model or "layercast-error",
            )

        supported = _infer_deterministic_mode(result)
        if self._supported is None:
            self._supported = bool(supported)

        if self._supported is False and self.record_replay_cache is not None:
            try:
                cached = await self.record_replay_cache.get(cache_req)
            except RecordReplayCacheMiss:
                cached = None
            if cached:
                return self._normalize_cached(cached, channel, fingerprint)
            try:
                await self.record_replay_cache.put(
                    cache_req, self._wrap_response(channel, result, fingerprint).model_dump(by_alias=True)
                )
            except Exception:  # noqa: BLE001
                pass

        return self._wrap_response(channel, result, fingerprint)

    def _normalize_cached(
        self, cached: dict[str, Any], channel: Channel, fingerprint: str
    ) -> DecisionResponse:
        try:
            resp = DecisionResponse.model_validate(cached)
        except ValidationError:
            return _empty_fallback(channel, "malformed cassette entry")
        debug = dict(resp.debug or {})
        debug.update({"source": "record-replay", "fingerprint": fingerprint})
        return resp.model_copy(update={"debug": debug})

    def _wrap_response(
        self, channel: Channel, result: Any, fingerprint: str
    ) -> DecisionResponse:
        if isinstance(result, DecisionResponse):
            fallback = bool(result.fallback)
            data = result.data
            error = result.error or ""
            usage = result.usage
            latency = result.latency_ms
            model = result.model or self.model or "layercast"
            orig_debug = result.debug
        elif isinstance(result, dict):
            fallback = bool(result.get("fallback"))
            data = result.get("data")
            error = str(result.get("error") or "")
            usage = result.get("usage")
            latency = float(result.get("latencyMs") or result.get("latency_ms") or 0.0)
            model = str(result.get("model") or self.model or "layercast")
            orig_debug = result.get("debug")
        else:
            fallback, data, error = True, None, "unexpected inner response type"
            usage = None
            latency = 0.0
            model = self.model or "layercast"
            orig_debug = None

        if not fallback and data is not None:
            if channel == "environment-director":
                try:
                    validated = EnvironmentDirective.model_validate(data)
                    data = guard_environment_directive(
                        validated.model_dump(by_alias=False)
                    ).model_dump(by_alias=False)
                except ValidationError as err:
                    error = f"schema: {err}"[:200]
                    data = None
            elif channel == "npc-policy":
                candidate = {"policies": data} if isinstance(data, list) else data
                try:
                    validated = NpcPolicyEnvelope.model_validate(candidate)
                    data = guard_group_policies(
                        validated.model_dump(by_alias=False)
                    ).model_dump(by_alias=False)
                except ValidationError as err:
                    error = f"schema: {err}"[:200]
                    data = None

        return DecisionResponse(
            data=data,
            fallback=fallback or data is None,
            usage=usage if not isinstance(usage, dict) else None,
            latency_ms=latency,
            model=model,
            error=error,
            debug={
                "channel": channel,
                "fingerprint": fingerprint,
                "layercastSupported": self._supported,
                "source": "layercast-passthrough",
                "original": orig_debug,
            },
        )


__all__ = [
    "LAYERCAST_HEADERS",
    "LAYERCAST_INFERENCE_CONFIG",
    "LayerCastAdapter",
]
