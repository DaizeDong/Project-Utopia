"""Game-state warning log (port of ``src/app/warnings.js``).

The simulation pushes human-readable warnings onto ``state.metrics``: a
plain-text ring buffer (``warnings``) plus a structured event log
(``warningLog``). :func:`push_toast_with_cooldown` dedups by key so
recurring conditions don't spam the HUD/inspector.

This module lives at ``project_utopia.app.warnings`` — note this **does
not** collide with the stdlib ``warnings`` module because we always
import it via the package-qualified path.
"""

from __future__ import annotations

import math
from typing import Any

__all__ = [
    "MAX_WARNING_MESSAGES",
    "MAX_WARNING_EVENTS",
    "TOAST_COOLDOWN_LRU_CAP",
    "push_warning",
    "get_latest_warning",
    "clear_warnings",
    "push_toast_with_cooldown",
]


MAX_WARNING_MESSAGES: int = 20
MAX_WARNING_EVENTS: int = 120
TOAST_COOLDOWN_LRU_CAP: int = 64

# Module-level monotonic counter used to disambiguate same-tick warnings.
_warning_seq: int = 0


def _normalize_message(message: Any) -> str:
    if isinstance(message, str):
        return message
    if message is None:
        return ""
    return str(message)


def push_warning(
    state: dict[str, Any],
    message: Any,
    level: str = "warn",
    source: str = "runtime",
) -> None:
    """Append a warning to ``state.metrics.warnings`` and ``warningLog``.

    Parameters
    ----------
    state
        Game state bag. Must have a ``metrics`` dict.
    message
        Free-form text. Empty/whitespace strings are silently dropped.
    level
        One of ``"info" | "warn" | "error"`` (no validation — caller picks).
    source
        Subsystem identifier — e.g. ``"event-mitigation"``.
    """
    global _warning_seq
    if not isinstance(state, dict):
        return
    metrics = state.get("metrics")
    if not isinstance(metrics, dict):
        return

    text = _normalize_message(message).strip()
    if not text:
        return

    now = float(metrics.get("timeSec", 0.0) or 0.0)
    _warning_seq += 1
    event = {
        "id": f"{source}:{int(now * 1000)}:{_warning_seq}",
        "sec": now,
        "level": level,
        "source": source,
        "message": text,
    }

    warning_log = metrics.get("warningLog")
    if not isinstance(warning_log, list):
        warning_log = []
        metrics["warningLog"] = warning_log
    warning_log.append(event)
    if len(warning_log) > MAX_WARNING_EVENTS:
        del warning_log[: len(warning_log) - MAX_WARNING_EVENTS]

    warnings_list = metrics.get("warnings")
    if not isinstance(warnings_list, list):
        warnings_list = []
        metrics["warnings"] = warnings_list
    warnings_list.append(text)
    if len(warnings_list) > MAX_WARNING_MESSAGES:
        del warnings_list[: len(warnings_list) - MAX_WARNING_MESSAGES]


def get_latest_warning(state: dict[str, Any]) -> str:
    """Return the most recently pushed warning text, or ``""``."""
    metrics = (state or {}).get("metrics") or {}
    warnings_list = metrics.get("warnings")
    if not isinstance(warnings_list, list) or not warnings_list:
        return ""
    return str(warnings_list[-1] or "")


def clear_warnings(state: dict[str, Any]) -> None:
    """Reset both the message + event warning buffers."""
    metrics = (state or {}).get("metrics")
    if not isinstance(metrics, dict):
        return
    metrics["warnings"] = []
    metrics["warningLog"] = []


def push_toast_with_cooldown(
    state: dict[str, Any],
    message: Any,
    level: str = "warn",
    *,
    dedup_key: str | None = None,
    source: str = "runtime",
    cooldown_sec: float = 30.0,
) -> None:
    """Push a warning, suppressing re-emits within ``cooldown_sec``.

    Cooldown state lives at ``state["__toast_cooldowns"]`` as an
    insertion-ordered dict (LRU-eviction at :data:`TOAST_COOLDOWN_LRU_CAP`).
    """
    if not isinstance(state, dict):
        return
    metrics = state.get("metrics")
    if not isinstance(metrics, dict):
        return

    if not dedup_key:
        push_warning(state, message, level, source)
        return

    if not math.isfinite(cooldown_sec):
        cooldown_sec = 30.0

    cooldowns = state.get("__toast_cooldowns")
    if not isinstance(cooldowns, dict):
        cooldowns = {}
        state["__toast_cooldowns"] = cooldowns

    now = float(metrics.get("timeSec", 0.0) or 0.0)
    last = cooldowns.get(dedup_key)
    if last is not None and now - float(last) < cooldown_sec:
        return  # still in cooldown — suppress

    # Evict oldest entry if at cap (dicts are insertion-ordered in 3.7+).
    if len(cooldowns) >= TOAST_COOLDOWN_LRU_CAP and dedup_key not in cooldowns:
        oldest_key = next(iter(cooldowns))
        cooldowns.pop(oldest_key, None)

    # Move-to-end on refresh: delete + reinsert so the key bumps to MRU.
    cooldowns.pop(dedup_key, None)
    cooldowns[dedup_key] = now
    push_warning(state, message, level, source)
