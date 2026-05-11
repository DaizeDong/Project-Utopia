"""AnchorInjector — seed ``harness.memory_store`` with anchor observations.

Python port of ``src/benchmark/anchors/AnchorInjector.js``.

Used by the MemoryDegradation dimension (paper §2.5 / E5) to write a small
set of "facts the LLM is supposed to remember" into the memory ring buffer
at t=0 (or scenario-relative time). Subsequent strategic-plan calls then
include these anchors in their prompt context, and the dimension probes:

1. **anchored_fact_recall** — whether the anchor's verbal tokens appear in
   the model's ``world_summary`` / ``strategy.notes``.
2. **action_grounded_recall** — whether the anchor's ``implicit_goals`` are
   still served by the directive distribution.

Anchor shape (matches MemoryDegradation):

.. code-block:: python

   {
       "verbal_tokens": ["warehouse at (12,8)", ...],
       "implicit_goals": [{"action": "deliver", "target": "warehouse"}, ...],
   }

For backward compat with the JS-port shape we also accept ``{"token": str,
"implicit_goals": list[str]}``. The injector writes one MemoryStore entry
per anchor token with ``anchor=True`` (immune to eviction) and
``importance=1.0``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Anchor:
    """One injected anchor.

    Attributes:
        verbal_tokens: Free-form recall tokens; each becomes one memory entry.
        implicit_goals: Action / target tuples preserved on the anchor entries'
            ``tags`` so dimension plugins can read them without re-parsing the
            opts envelope.
    """

    verbal_tokens: list[str]
    implicit_goals: list[Any] = field(default_factory=list)


def _coerce_anchor(raw: Any) -> Anchor | None:
    """Accept a few anchor shapes and produce a uniform :class:`Anchor`.

    Supported inputs:

    * ``Anchor`` instance → returned verbatim.
    * ``{"verbal_tokens": [...], "implicit_goals": [...]}`` (paper shape).
    * ``{"token": str, "implicit_goals": [...]}`` (JS-port shape).
    * Bare string → single verbal token, no implicit goals.
    * ``None`` / empty / malformed → ``None`` (caller skips).
    """
    if raw is None:
        return None
    if isinstance(raw, Anchor):
        return raw
    if isinstance(raw, str):
        token = raw.strip()
        if not token:
            return None
        return Anchor(verbal_tokens=[token], implicit_goals=[])
    if isinstance(raw, dict):
        verbal_raw = raw.get("verbal_tokens") or raw.get("verbalTokens")
        if not verbal_raw:
            single_token = raw.get("token")
            verbal_raw = [single_token] if single_token else []
        verbal_tokens = [str(t) for t in verbal_raw if t]
        if not verbal_tokens:
            return None
        implicit_goals = list(raw.get("implicit_goals") or raw.get("implicitGoals") or [])
        return Anchor(verbal_tokens=verbal_tokens, implicit_goals=implicit_goals)
    return None


def inject_anchors(
    harness: Any,
    anchors: list[Any],
    *,
    at_sec: float = 0.0,
    category: str = "anchor",
    importance: float = 1.0,
) -> dict[str, int]:
    """Inject N anchors into a SimHarness's memory_store.

    Args:
        harness: SimHarness or shape-compatible carrier exposing
            ``memory_store`` (or ``memoryStore`` — accepted for JS-port
            compat).
        anchors: List of :class:`Anchor` instances OR dicts/strings that
            :func:`_coerce_anchor` can normalise.
        at_sec: Sim-second timestamp recorded on each entry. Defaults to 0
            (scenario start).
        category: Tag bucket — defaults to ``"anchor"``. Stored as a tag so
            consumers can filter via ``memory_store.recent_by_tag``.
        importance: Float in ``[0, 1]``; defaults to 1.0 so anchors sit at
            the top of recall order until naturally surpassed. Anchors are
            also flagged ``anchor=True`` which makes them immune to
            eviction regardless of importance.

    Returns:
        ``{"injected": int, "skipped": int}`` — one ``injected`` count per
        ``verbal_token`` actually written; ``skipped`` counts malformed
        anchors.
    """
    if not isinstance(anchors, list):
        anchors = []
    mem = getattr(harness, "memory_store", None) or getattr(harness, "memoryStore", None)
    if mem is None or not hasattr(mem, "insert"):
        # Hard-fail soft: every anchor is skipped, caller decides what to do.
        total_tokens = 0
        for a in anchors:
            coerced = _coerce_anchor(a)
            if coerced is not None:
                total_tokens += len(coerced.verbal_tokens)
        return {"injected": 0, "skipped": total_tokens or len(anchors)}

    injected = 0
    skipped = 0
    for raw in anchors:
        coerced = _coerce_anchor(raw)
        if coerced is None:
            skipped += 1
            continue
        # Encode implicit_goals into the entry tags as JSON-safe strings so
        # the data survives a round-trip through MemoryStore.to_dict().
        implicit_tags: list[str] = []
        for goal in coerced.implicit_goals:
            if isinstance(goal, str):
                implicit_tags.append(f"goal:{goal.lower()}")
            elif isinstance(goal, dict):
                for v in goal.values():
                    if isinstance(v, str):
                        implicit_tags.append(f"goal:{v.lower()}")
        for token in coerced.verbal_tokens:
            tags = [category, *implicit_tags]
            mem.insert(
                content=str(token),
                importance=float(importance),
                sim_sec=float(at_sec),
                tags=tags,
                anchor=True,
            )
            injected += 1
    return {"injected": injected, "skipped": skipped}


__all__ = ["Anchor", "inject_anchors"]
