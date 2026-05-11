"""RecordReplayCache — VCR-cassette LLM cache for the academic benchmark.

Python port of ``RecordReplayCache.js``. Three modes:

- ``record`` — every ``get()`` returns ``None``; the caller runs the real
  adapter and then ``await cache.put(req, response)`` records it. ``flush()``
  writes the cassette as NDJSON.
- ``replay`` — every ``get()`` looks the request up in the cassette and
  returns the cached response, OR raises :class:`RecordReplayCacheMiss` on
  miss. ``put()`` is a no-op.
- ``auto`` — replay first; on miss, falls back to record-on-put. Useful for
  dev runs that want to top up the cassette without nuking it.

Key canonicalisation: ``sha256(JSON.stringify({channel, model, prompt,
temperature, top_p}))`` with hand-built JSON for stable key ordering across
languages.

The default on-disk layout is ``.cache/llm-cassettes/{hash}.json`` per the
Phase 1 design brief, but the constructor accepts an explicit cassette path
to remain a drop-in match for the JS module.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .agent_adapter import AgentAdapter, Channel, DecisionResponse
from .prompt_payload import (
    build_environment_prompt_user_content,
    build_policy_prompt_user_content,
)

VALID_MODES = ("record", "replay", "auto")


class RecordReplayCacheMiss(Exception):
    """Raised by :class:`RecordReplayCache.get` in ``replay`` mode on miss."""

    def __init__(self, key: str, summary: dict[str, Any]) -> None:
        super().__init__(f"record-replay miss: key={key}")
        self.key = key
        self.summary = summary


def _canonicalize_request(req: dict[str, Any]) -> dict[str, Any]:
    prompt = req.get("prompt")
    if not isinstance(prompt, str):
        try:
            prompt = json.dumps(prompt, sort_keys=True, separators=(",", ":"))
        except (TypeError, ValueError):
            prompt = str(prompt)
    temperature = req.get("temperature")
    top_p = req.get("top_p")
    try:
        temperature = float(temperature) if temperature is not None else None
    except (TypeError, ValueError):
        temperature = None
    try:
        top_p = float(top_p) if top_p is not None else None
    except (TypeError, ValueError):
        top_p = None
    return {
        "channel": str(req.get("channel") or ""),
        "model": str(req.get("model") or ""),
        "prompt": prompt,
        "temperature": temperature,
        "top_p": top_p,
    }


def _canonical_key_json(req: dict[str, Any]) -> str:
    c = _canonicalize_request(req)
    # Hand-built JSON to lock field order across languages.
    return (
        "{"
        f'"channel":{json.dumps(c["channel"])},'
        f'"model":{json.dumps(c["model"])},'
        f'"prompt":{json.dumps(c["prompt"])},'
        f'"temperature":{json.dumps(c["temperature"])},'
        f'"top_p":{json.dumps(c["top_p"])}'
        "}"
    )


def _summarize_request(req: dict[str, Any]) -> dict[str, Any]:
    c = _canonicalize_request(req)
    return {
        "channel": c["channel"],
        "model": c["model"],
        "promptLength": len(c["prompt"]),
        "temperature": c["temperature"],
        "top_p": c["top_p"],
    }


class RecordReplayCache:
    """Hash-keyed VCR cassette over an NDJSON file.

    Args:
        cassette_path: Path to the cassette file. Parent directories are
            created on flush.
        mode: One of ``"record"``, ``"replay"``, ``"auto"``.
    """

    def __init__(self, cassette_path: str | os.PathLike[str], mode: str = "replay") -> None:
        if not cassette_path:
            raise ValueError("RecordReplayCache: cassette_path required")
        if mode not in VALID_MODES:
            raise ValueError(
                f"RecordReplayCache: invalid mode {mode!r}; expected one of {VALID_MODES}"
            )
        self.cassette_path = Path(cassette_path)
        self.mode = mode
        self._entries: dict[str, dict[str, Any]] = {}
        self._loaded = False
        self._dirty = False
        self._stats = {"hits": 0, "misses": 0, "total": 0}
        self._lock = asyncio.Lock()

    def compute_key(self, req: dict[str, Any]) -> str:
        return hashlib.sha256(_canonical_key_json(req).encode("utf-8")).hexdigest()

    async def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            text = self.cassette_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(entry, dict):
                continue
            key = entry.get("key")
            if not isinstance(key, str) or "response" not in entry:
                continue
            self._entries[key] = {
                "request_summary": entry.get("request_summary"),
                "response": entry["response"],
                "timestamp": entry.get("timestamp", ""),
            }

    async def get(self, req: dict[str, Any]) -> dict[str, Any] | None:
        async with self._lock:
            await self._ensure_loaded()
            key = self.compute_key(req)
            self._stats["total"] += 1
            entry = self._entries.get(key)

            if self.mode == "record":
                self._stats["misses"] += 1
                return None
            if entry:
                self._stats["hits"] += 1
                return json.loads(json.dumps(entry["response"]))  # defensive copy
            self._stats["misses"] += 1
            if self.mode == "replay":
                raise RecordReplayCacheMiss(key, _summarize_request(req))
            return None

    async def put(self, req: dict[str, Any], response: Any) -> None:
        if self.mode == "replay":
            return
        async with self._lock:
            await self._ensure_loaded()
            key = self.compute_key(req)
            self._entries[key] = {
                "request_summary": _summarize_request(req),
                "response": json.loads(json.dumps(response if response is not None else None)),
                "timestamp": _iso_now(),
            }
            self._dirty = True

    async def flush(self) -> None:
        if self.mode == "replay":
            return
        async with self._lock:
            self.cassette_path.parent.mkdir(parents=True, exist_ok=True)
            if not self._dirty and not self._entries:
                # Touch an empty cassette so downstream replay can find it.
                self.cassette_path.write_text("", encoding="utf-8")
                return
            lines: list[str] = []
            for key, entry in self._entries.items():
                lines.append(
                    json.dumps(
                        {
                            "key": key,
                            "request_summary": entry["request_summary"],
                            "response": entry["response"],
                            "timestamp": entry["timestamp"],
                        }
                    )
                )
            payload = "\n".join(lines) + ("\n" if lines else "")
            self.cassette_path.write_text(payload, encoding="utf-8")
            self._dirty = False

    def stats(self) -> dict[str, Any]:
        hits = self._stats["hits"]
        misses = self._stats["misses"]
        total = self._stats["total"]
        return {
            "hits": hits,
            "misses": misses,
            "total": total,
            "hitRate": (hits / total) if total else 0.0,
        }


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


# ---------------------------------------------------------------------------
# Adapter wrapper
# ---------------------------------------------------------------------------


def _infer_request_key(channel: Channel, payload: Any, options: dict[str, Any] | None) -> dict[str, Any]:
    if channel == "environment-director":
        prompt_str = build_environment_prompt_user_content(payload or {})
    elif channel == "npc-policy":
        prompt_str = build_policy_prompt_user_content(payload or {})
    elif isinstance(payload, str):
        prompt_str = payload
    else:
        try:
            prompt_str = json.dumps(payload, sort_keys=True)
        except (TypeError, ValueError):
            prompt_str = str(payload)
    opts = options or {}
    return {
        "channel": channel,
        "model": str(opts.get("model") or ""),
        "prompt": prompt_str,
        "temperature": opts.get("temperature"),
        "top_p": opts.get("top_p"),
    }


class _CachedAdapter(AgentAdapter):
    def __init__(self, adapter: AgentAdapter, cache: RecordReplayCache) -> None:
        self._adapter = adapter
        self._cache = cache

    async def request(
        self,
        channel: Channel,
        payload: Any,
        options: dict[str, Any] | None = None,
    ) -> DecisionResponse:
        cache_req = _infer_request_key(channel, payload, options)
        cached: dict[str, Any] | None = None
        try:
            cached = await self._cache.get(cache_req)
        except RecordReplayCacheMiss as err:
            return DecisionResponse(
                data=None,
                fallback=True,
                latency_ms=0.0,
                model="record-replay-miss",
                error=f"record-replay miss: {err}",
                debug={"channel": channel, "cacheKey": self._cache.compute_key(cache_req)},
            )
        except Exception as err:  # noqa: BLE001
            return DecisionResponse(
                data=None,
                fallback=True,
                latency_ms=0.0,
                model="record-replay-error",
                error=f"record-replay error: {err}",
                debug={"channel": channel},
            )
        if cached is not None:
            try:
                return DecisionResponse.model_validate(cached)
            except Exception:  # noqa: BLE001
                return DecisionResponse(
                    data=cached.get("data") if isinstance(cached, dict) else None,
                    fallback=bool(cached.get("fallback")) if isinstance(cached, dict) else True,
                    latency_ms=float(cached.get("latencyMs") or 0.0) if isinstance(cached, dict) else 0.0,
                    model=str(cached.get("model") or "") if isinstance(cached, dict) else "",
                    error=str(cached.get("error") or "") if isinstance(cached, dict) else "",
                    debug=cached.get("debug") or {},
                )

        response = await self._adapter.request(channel, payload, options)
        try:
            await self._cache.put(cache_req, response.model_dump(by_alias=True))
        except Exception:  # noqa: BLE001 - best-effort record
            pass
        return response


def wrap_adapter_with_cache(adapter: AgentAdapter, cache: RecordReplayCache) -> AgentAdapter:
    """Return an :class:`AgentAdapter` that consults ``cache`` before delegating."""
    if not isinstance(adapter, AgentAdapter):
        raise TypeError("wrap_adapter_with_cache: adapter must subclass AgentAdapter")
    if not isinstance(cache, RecordReplayCache):
        raise TypeError("wrap_adapter_with_cache: cache must be a RecordReplayCache")
    return _CachedAdapter(adapter, cache)


__all__ = [
    "RecordReplayCache",
    "RecordReplayCacheMiss",
    "VALID_MODES",
    "wrap_adapter_with_cache",
]
