"""LLMClient — cross-vendor LLM proxy wrapper built on ``litellm``.

Replaces the JS ``LLMClient.js`` (which spoke OpenAI's HTTP API directly).
We delegate transport + auth to ``litellm.acompletion`` so the same code
talks to OpenAI, Anthropic, Azure, vLLM, Ollama, etc. without per-vendor
branches.

Telemetry: token + latency stats extracted from the litellm response are
propagated into :class:`DecisionResponse.usage` so :class:`SeedMatrix` can
pass them through unchanged (recall the RC3 B1 fix where the JS port lost
``cachedTokens`` on its way through the per-seed aggregator).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from .agent_adapter import DecisionResponse, UsageStats

logger = logging.getLogger(__name__)


def _compact_error(err: BaseException) -> str:
    raw = str(err) or err.__class__.__name__
    msg = " ".join(raw.split())
    low = msg.lower()
    if "timeout" in low or "timed out" in low or "aborted" in low:
        return "request timeout"
    if "api_key" in low or "apikey" in low:
        return "API key missing"
    return msg[:200]


def _extract_usage(raw_response: Any, *, first_token_latency_ms: float | None = None,
                   wall_latency_ms: float | None = None) -> UsageStats:
    """Pull token + cache stats out of a litellm response object."""
    usage_obj: Any = None
    if raw_response is None:
        usage_obj = {}
    elif isinstance(raw_response, dict):
        usage_obj = raw_response.get("usage") or {}
    else:
        usage_obj = getattr(raw_response, "usage", None) or {}

    def _read(name: str) -> int:
        if isinstance(usage_obj, dict):
            return int(usage_obj.get(name) or 0)
        return int(getattr(usage_obj, name, 0) or 0)

    prompt_tokens = _read("prompt_tokens")
    completion_tokens = _read("completion_tokens")
    cached_tokens = 0
    details = None
    if isinstance(usage_obj, dict):
        details = usage_obj.get("prompt_tokens_details") or usage_obj.get("cached_tokens")
    else:
        details = getattr(usage_obj, "prompt_tokens_details", None) or getattr(
            usage_obj, "cached_tokens", None
        )
    if isinstance(details, dict):
        cached_tokens = int(details.get("cached_tokens") or details.get("cached") or 0)
    elif isinstance(details, (int, float)):
        cached_tokens = int(details)

    tps: float | None = None
    if (
        wall_latency_ms is not None
        and wall_latency_ms > 0
        and completion_tokens > 0
    ):
        tps = completion_tokens / (wall_latency_ms / 1000.0)

    return UsageStats(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cached_tokens=cached_tokens,
        first_token_latency_ms=first_token_latency_ms,
        tokens_per_sec=tps,
    )


def _extract_content(raw_response: Any) -> str:
    """Pull the first choice's text content out of a litellm response."""
    if raw_response is None:
        return ""
    if isinstance(raw_response, dict):
        choices = raw_response.get("choices") or []
        if not choices:
            return ""
        msg = choices[0].get("message") or {}
        return str(msg.get("content") or "")
    choices = getattr(raw_response, "choices", None) or []
    if not choices:
        return ""
    first = choices[0]
    msg = getattr(first, "message", None)
    if msg is None:
        return ""
    return str(getattr(msg, "content", "") or "")


def _try_parse_json(text: str) -> dict[str, Any] | list[Any] | None:
    if not text:
        return None
    stripped = text.strip()
    # litellm responses occasionally come wrapped in ```json … ``` fences.
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.strip()
    try:
        return json.loads(stripped)
    except (ValueError, TypeError):
        return None


class LLMClient:
    """Thin async wrapper over ``litellm.acompletion``.

    Args:
        base_url: Optional proxy base URL passed through to litellm.
        model: Default model string (e.g. ``"openai/gpt-4o-mini"``).
        api_key: Optional API key; defaults to env-var-based auth via litellm.
        options: Extra default options merged into every call (temperature,
            top_p, response_format, headers …).
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        model: str = "openai/gpt-4o-mini",
        api_key: str | None = None,
        options: dict[str, Any] | None = None,
        timeout_s: float = 60.0,
        max_retries: int = 3,
        retry_backoff_s: tuple[float, ...] = (1.0, 2.0, 4.0),
    ) -> None:
        self.base_url = base_url
        self.model = model
        self.api_key = api_key
        self.default_options: dict[str, Any] = dict(options or {})
        self.timeout_s = float(timeout_s)
        self.max_retries = int(max_retries)
        self.retry_backoff_s = tuple(retry_backoff_s)
        self.last_error: str = ""
        self.last_latency_ms: float = 0.0
        self.last_status: str = "unknown"
        self.last_model: str = ""
        self.retry_total: int = 0  # cumulative retries this client has done

    async def request_completion(
        self,
        messages: list[dict[str, Any]],
        *,
        channel: str = "",
        model: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        """Send ``messages`` to the model and return a parsed :class:`DecisionResponse`.

        ``options`` is merged on top of ``self.default_options`` (call-level
        wins). LayerCast wiring threads its headers + inference_config
        through here via the ``extra_headers`` / ``extra_body`` keys.
        """
        merged: dict[str, Any] = {**self.default_options, **(options or {})}
        target_model = model or merged.pop("model", None) or self.model
        if self.base_url:
            merged.setdefault("base_url", self.base_url)
        if self.api_key:
            merged.setdefault("api_key", self.api_key)

        # Hoist LayerCast-style aliases into the shapes litellm expects.
        headers_extra = merged.pop("headers", None)
        if isinstance(headers_extra, dict):
            existing = merged.get("extra_headers") or {}
            merged["extra_headers"] = {**existing, **headers_extra}
        inference_cfg = merged.pop("inference_config", None)
        if isinstance(inference_cfg, dict):
            existing_body = merged.get("extra_body") or {}
            merged["extra_body"] = {**existing_body, "inference_config": inference_cfg}

        # Lazy import — litellm's import-time side effects are heavy; keep
        # them out of the test path when only Noop adapters are exercised.
        try:
            from litellm import acompletion  # type: ignore[import-not-found]
        except ImportError as err:  # pragma: no cover - dep declared in pyproject
            self.last_error = f"litellm not installed: {err}"
            self.last_status = "down"
            return DecisionResponse(
                data=None,
                fallback=True,
                usage=None,
                latency_ms=0.0,
                model=target_model,
                error=self.last_error,
                debug={"channel": channel, "source": "import-error"},
            )

        # Retry loop with exponential backoff. Patches 1+2 (route-α Phase 2):
        # robust against transient proxy failures + per-call timeout enforced.
        started = time.perf_counter()
        attempts = 0
        last_err: BaseException | None = None
        raw: Any = None
        while attempts <= self.max_retries:
            attempt_started = time.perf_counter()
            try:
                raw = await asyncio.wait_for(
                    acompletion(model=target_model, messages=messages, **merged),
                    timeout=self.timeout_s,
                )
                last_err = None
                break  # success
            except asyncio.CancelledError:
                raise
            except (asyncio.TimeoutError, Exception) as err:
                last_err = err
                self.retry_total += 1
                attempts += 1
                if attempts > self.max_retries:
                    break
                # Exponential backoff. Index clamped to backoff tuple length.
                sleep_idx = min(attempts - 1, len(self.retry_backoff_s) - 1)
                backoff = self.retry_backoff_s[sleep_idx]
                attempt_ms = (time.perf_counter() - attempt_started) * 1000.0
                logger.warning(
                    "LLM call retry %d/%d on channel=%s model=%s "
                    "(attempt %.0fms err=%s); sleeping %.1fs",
                    attempts, self.max_retries, channel, target_model, attempt_ms,
                    _compact_error(err), backoff,
                )
                await asyncio.sleep(backoff)
        if last_err is not None:
            latency_ms = (time.perf_counter() - started) * 1000.0
            self.last_error = _compact_error(last_err)
            self.last_status = "down"
            self.last_latency_ms = latency_ms
            return DecisionResponse(
                data=None,
                fallback=True,
                usage=None,
                latency_ms=latency_ms,
                model=target_model,
                error=self.last_error,
                debug={
                    "channel": channel,
                    "source": "litellm-error-after-retries",
                    "retries": attempts,
                },
            )

        latency_ms = (time.perf_counter() - started) * 1000.0
        content = _extract_content(raw)
        parsed = _try_parse_json(content)
        usage = _extract_usage(raw, wall_latency_ms=latency_ms)

        self.last_latency_ms = latency_ms
        self.last_status = "up"
        self.last_model = target_model
        self.last_error = ""

        if parsed is None:
            return DecisionResponse(
                data=None,
                fallback=True,
                usage=usage,
                latency_ms=latency_ms,
                model=target_model,
                error="response not JSON-parseable",
                debug={"channel": channel, "rawContent": content[:2000]},
            )

        return DecisionResponse(
            data=parsed if isinstance(parsed, (dict, list)) else None,
            fallback=False,
            usage=usage,
            latency_ms=latency_ms,
            model=target_model,
            error="",
            debug={"channel": channel, "rawContent": content[:2000]},
        )


__all__ = ["LLMClient"]
