"""Cell-label routing table (Python port of ``server/config/agent-routing.js``).

The CLI driver validates ``--cells`` against the keys of
:data:`DEFAULT_AGENT_ROUTING` so unknown cell labels fail-fast at
argument parsing. The actual cross-vendor LLM wiring is deferred to
the framework subagent (HTTPAgentClient + MultiBackendAdapter); here
we only carry the table and the small lookup helpers the CLI needs.
"""

from __future__ import annotations

import os
from types import MappingProxyType
from typing import Any

__all__ = [
    "CHANNELS",
    "DEFAULT_AGENT_ROUTING",
    "MODEL",
    "build_backends_for_cell",
    "list_cell_labels",
]


# Snapshot-pinned model strings. Changing one requires a benchmark
# cell-id bump so traces remain comparable across runs.
MODEL: MappingProxyType[str, str] = MappingProxyType(
    {
        "CLAUDE_SONNET": "claude-sonnet-4-6",
        "CLAUDE_OPUS": "claude-opus-4-7",
        "GPT5_MINI": "gpt-5-mini",
        "GPT5_FULL": "gpt-5",
        "HERMES_7B": "hermes-3-7b",
        "HERMES_70B": "hermes-3-70b",
        "LLAMA_8B": "llama-3.1-8b-instruct",
        "LLAMA_70B": "llama-3.1-70b-instruct",
        "QWEN_72B": "qwen-2.5-72b-instruct",
        "MISTRAL_LARGE": "mistral-large-2",
        "FALLBACK": "fallback",
    }
)


CHANNELS: tuple[str, ...] = (
    "environment-director",
    "npc-policy",
    "strategic-plan",
    "colony-agent",
)


# Base URLs resolved at import time from the environment, matching the
# JS module. ``fallback://noop`` is the sentinel that downstream
# adapter factories turn into a Noop adapter.
_CLAUDE_BASE_URL = os.environ.get("CLAUDE_BASE_URL", "https://api.anthropic.com/v1")
_OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
_HERMES_BASE_URL = os.environ.get("HERMES_BASE_URL", "http://localhost:8001/v1")
_LLAMA_BASE_URL = os.environ.get("LLAMA_BASE_URL", "http://localhost:8002/v1")
_QWEN_BASE_URL = os.environ.get("QWEN_BASE_URL", "http://localhost:8003/v1")
_MISTRAL_BASE_URL = os.environ.get("MISTRAL_BASE_URL", "http://localhost:8004/v1")
_FALLBACK_URL = "fallback://noop"


def _cell_all_same(base_url: str, model: str) -> MappingProxyType[str, MappingProxyType[str, str]]:
    return MappingProxyType(
        {
            channel: MappingProxyType({"baseUrl": base_url, "model": model})
            for channel in CHANNELS
        }
    )


DEFAULT_AGENT_ROUTING: MappingProxyType[str, MappingProxyType[str, MappingProxyType[str, str]]] = (
    MappingProxyType(
        {
            "FB": _cell_all_same(_FALLBACK_URL, MODEL["FALLBACK"]),
            "WW": _cell_all_same(_HERMES_BASE_URL, MODEL["HERMES_7B"]),
            "SS": _cell_all_same(_CLAUDE_BASE_URL, MODEL["CLAUDE_SONNET"]),
            "SW": MappingProxyType(
                {
                    "environment-director": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_SONNET"]}
                    ),
                    "npc-policy": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                    "strategic-plan": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                    "colony-agent": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                }
            ),
            "WS": MappingProxyType(
                {
                    "environment-director": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                    "npc-policy": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_SONNET"]}
                    ),
                    "strategic-plan": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                    "colony-agent": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                }
            ),
            "XV-OPUS-SONNET": MappingProxyType(
                {
                    "environment-director": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_OPUS"]}
                    ),
                    "npc-policy": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_SONNET"]}
                    ),
                    "strategic-plan": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_OPUS"]}
                    ),
                    "colony-agent": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_SONNET"]}
                    ),
                }
            ),
            "XV-DIVERSE-LIGHT": MappingProxyType(
                {
                    "environment-director": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_SONNET"]}
                    ),
                    "npc-policy": MappingProxyType(
                        {"baseUrl": _OPENAI_BASE_URL, "model": MODEL["GPT5_MINI"]}
                    ),
                    "strategic-plan": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_7B"]}
                    ),
                    "colony-agent": MappingProxyType(
                        {"baseUrl": _LLAMA_BASE_URL, "model": MODEL["LLAMA_8B"]}
                    ),
                }
            ),
            "XV-DIVERSE-STRONG": MappingProxyType(
                {
                    "environment-director": MappingProxyType(
                        {"baseUrl": _CLAUDE_BASE_URL, "model": MODEL["CLAUDE_OPUS"]}
                    ),
                    "npc-policy": MappingProxyType(
                        {"baseUrl": _OPENAI_BASE_URL, "model": MODEL["GPT5_FULL"]}
                    ),
                    "strategic-plan": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_70B"]}
                    ),
                    "colony-agent": MappingProxyType(
                        {"baseUrl": _LLAMA_BASE_URL, "model": MODEL["LLAMA_70B"]}
                    ),
                }
            ),
            "XV-OPENWEIGHT-ONLY": MappingProxyType(
                {
                    "environment-director": MappingProxyType(
                        {"baseUrl": _HERMES_BASE_URL, "model": MODEL["HERMES_70B"]}
                    ),
                    "npc-policy": MappingProxyType(
                        {"baseUrl": _LLAMA_BASE_URL, "model": MODEL["LLAMA_70B"]}
                    ),
                    "strategic-plan": MappingProxyType(
                        {"baseUrl": _QWEN_BASE_URL, "model": MODEL["QWEN_72B"]}
                    ),
                    "colony-agent": MappingProxyType(
                        {"baseUrl": _MISTRAL_BASE_URL, "model": MODEL["MISTRAL_LARGE"]}
                    ),
                }
            ),
        }
    )
)


def list_cell_labels() -> tuple[str, ...]:
    """Return the tuple of known cell labels (for CLI validation / help)."""
    return tuple(DEFAULT_AGENT_ROUTING.keys())


def build_backends_for_cell(cell_id: str) -> dict[str, dict[str, Any]]:
    """Resolve a cell label to a ``{channel: backend}`` plain dict.

    Raises ``ValueError`` if ``cell_id`` is not in the routing table or
    if it is missing any of the four canonical channels.
    """
    cell = DEFAULT_AGENT_ROUTING.get(cell_id)
    if cell is None:
        known = ", ".join(DEFAULT_AGENT_ROUTING.keys())
        raise ValueError(f"unknown cell label: {cell_id} (known: {known})")
    out: dict[str, dict[str, Any]] = {}
    for channel in CHANNELS:
        cfg = cell.get(channel)
        if cfg is None:
            raise ValueError(f"cell {cell_id} missing backend for channel {channel}")
        out[channel] = dict(cfg)
    return out
