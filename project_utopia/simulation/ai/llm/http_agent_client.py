"""HTTPAgentClient — pluggable AgentAdapter that talks to ``agent-bridge``.

Python port of ``HTTPAgentClient.js``. Each request is POSTed to
``/api/agent/<agentId>/decision`` with the body shape::

    { "channel", "payload", "schemaVersion", "options": { "timeoutMs" } }

and the response is normalized into a :class:`DecisionResponse`. Per the
Phase-1 brief, deep agent-bridge integration is Phase 2; we ship the class
signature + transport so the bench framework can swap it in.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from urllib.parse import quote

from .agent_adapter import (
    AgentAdapter,
    CHANNELS,
    Channel,
    DecisionResponse,
    SCHEMA_VERSION,
    UsageStats,
)

DEFAULT_BRIDGE_URL = "http://localhost:8788"
DEFAULT_AGENT_ID = "default"
DEFAULT_TIMEOUT_MS = 30_000.0


def _compact_error(err: BaseException) -> str:
    raw = str(err) or err.__class__.__name__
    msg = " ".join(raw.split())
    low = msg.lower()
    if "timeout" in low or "timed out" in low:
        return "request timeout"
    if "connection" in low and ("refused" in low or "reset" in low):
        return "agent-bridge unreachable"
    return msg[:200]


def _now_ms() -> float:
    return time.perf_counter() * 1000.0


def _trim_url(url: str) -> str:
    return (url or "").rstrip("/")


def _fallback_response(channel: Channel, error: str, latency_ms: float = 0.0,
                       debug: dict[str, Any] | None = None) -> DecisionResponse:
    return DecisionResponse(
        data=None,
        fallback=True,
        latency_ms=latency_ms,
        model="fallback",
        error=str(error or ""),
        debug=debug or {"channel": channel, "source": "http-agent-client"},
    )


class HTTPAgentClient(AgentAdapter):
    """AgentAdapter that talks to a per-agent HTTP bridge.

    Args:
        agent_bridge_url: Root URL of the bridge server.
        agent_id: Identifier appended to ``/api/agent/<agentId>/...``.
        timeout_ms: Per-request timeout in milliseconds.
        headers: Extra request headers (merged with ``Content-Type``).
        http_client: Optional injected ``httpx.AsyncClient``-style client
            for tests; falls back to lazy ``httpx.AsyncClient`` construction.
    """

    def __init__(
        self,
        *,
        agent_bridge_url: str = DEFAULT_BRIDGE_URL,
        agent_id: str = DEFAULT_AGENT_ID,
        timeout_ms: float = DEFAULT_TIMEOUT_MS,
        headers: dict[str, str] | None = None,
        http_client: Any | None = None,
    ) -> None:
        self.agent_bridge_url = _trim_url(agent_bridge_url)
        self.agent_id = str(agent_id or DEFAULT_AGENT_ID)
        self.timeout_ms = max(500.0, float(timeout_ms))
        self.headers: dict[str, str] = dict(headers or {})
        self._http_client = http_client
        self.last_error: str = ""
        self.last_latency_ms: float = 0.0
        self.last_status: str = "unknown"

    def _get_client(self) -> Any:
        if self._http_client is not None:
            return self._http_client
        try:
            import httpx  # type: ignore[import-untyped]
        except ImportError as err:
            raise RuntimeError(
                "HTTPAgentClient requires httpx; install via `pip install httpx`."
            ) from err
        self._http_client = httpx.AsyncClient(timeout=self.timeout_ms / 1000.0)
        return self._http_client

    async def aclose(self) -> None:
        client = self._http_client
        if client is not None and hasattr(client, "aclose"):
            await client.aclose()

    async def request(
        self,
        channel: Channel,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        if channel not in CHANNELS:
            return _fallback_response(channel, f"unknown channel: {channel}")

        url = f"{self.agent_bridge_url}/api/agent/{quote(self.agent_id, safe='')}/decision"
        opts = options or {}
        timeout_ms = float(opts.get("timeoutMs") or self.timeout_ms)
        body = {
            "channel": channel,
            "payload": payload,
            "schemaVersion": opts.get("schemaVersion") or SCHEMA_VERSION,
            "options": {"timeoutMs": timeout_ms},
        }

        try:
            client = self._get_client()
        except RuntimeError as err:
            return _fallback_response(channel, _compact_error(err))

        started = _now_ms()
        try:
            response = await asyncio.wait_for(
                client.post(
                    url,
                    json=body,
                    headers={"Content-Type": "application/json", **self.headers},
                ),
                timeout=timeout_ms / 1000.0,
            )
        except asyncio.TimeoutError:
            latency = _now_ms() - started
            self.last_status = "down"
            self.last_error = "request timeout"
            self.last_latency_ms = latency
            return _fallback_response(channel, self.last_error, latency)
        except Exception as err:  # noqa: BLE001
            latency = _now_ms() - started
            self.last_status = "down"
            self.last_error = _compact_error(err)
            self.last_latency_ms = latency
            return _fallback_response(channel, self.last_error, latency)

        latency = _now_ms() - started
        self.last_latency_ms = latency

        if not getattr(response, "is_success", False) and getattr(response, "status_code", 200) >= 400:
            text = ""
            try:
                text = (response.text or "")[:140]
            except Exception:  # noqa: BLE001
                pass
            self.last_status = "down"
            status = getattr(response, "status_code", "?")
            self.last_error = f"HTTP {status}: {' '.join(text.split())}".strip()
            return _fallback_response(channel, self.last_error, latency)

        try:
            parsed = response.json()
        except Exception as err:  # noqa: BLE001
            self.last_status = "down"
            self.last_error = f"malformed JSON: {_compact_error(err)}"
            return _fallback_response(channel, self.last_error, latency)

        if not isinstance(parsed, dict) or (
            "data" not in parsed and "fallback" not in parsed
        ):
            self.last_status = "down"
            self.last_error = "malformed agent-bridge response (missing data/fallback)"
            return _fallback_response(channel, self.last_error, latency)

        self.last_status = "up"
        self.last_error = str(parsed.get("error") or "")

        usage_obj = parsed.get("usage")
        usage: UsageStats | None = None
        if isinstance(usage_obj, dict):
            try:
                usage = UsageStats.model_validate(usage_obj)
            except Exception:  # noqa: BLE001
                usage = None

        return DecisionResponse(
            data=parsed.get("data"),
            fallback=bool(parsed.get("fallback")),
            usage=usage,
            latency_ms=float(parsed.get("latencyMs") or latency),
            model=str(parsed.get("model") or ""),
            error=str(parsed.get("error") or ""),
            debug=parsed.get("debug") if isinstance(parsed.get("debug"), dict) else {},
        )

    async def health(self) -> dict[str, Any]:
        """Poll the agent-bridge for adapter-side health. Never raises."""
        url = f"{self.agent_bridge_url}/api/agent/{quote(self.agent_id, safe='')}/health"
        try:
            client = self._get_client()
        except RuntimeError as err:
            return {"healthy": False, "lastSeen": 0, "error": _compact_error(err)}
        try:
            response = await asyncio.wait_for(
                client.get(url, headers=dict(self.headers)),
                timeout=min(5.0, self.timeout_ms / 1000.0),
            )
        except Exception as err:  # noqa: BLE001
            return {"healthy": False, "lastSeen": 0, "error": _compact_error(err)}
        if getattr(response, "status_code", 200) >= 400:
            return {"healthy": False, "lastSeen": 0, "error": f"HTTP {response.status_code}"}
        try:
            data = response.json()
        except Exception:  # noqa: BLE001
            data = {}
        out: dict[str, Any] = {
            "healthy": bool(data.get("healthy") or data.get("ok") or False),
            "lastSeen": int(data.get("lastSeen") or 0),
        }
        if data.get("error"):
            out["error"] = str(data["error"])
        return out


__all__ = ["HTTPAgentClient", "DEFAULT_BRIDGE_URL", "DEFAULT_AGENT_ID"]
