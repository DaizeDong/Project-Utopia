"""MemoryStore — importance-aware ring buffer for the colony agent's memory.

Python port of ``MemoryStore.js`` with the RC3 W2 round-2 fix baked in:

- Ring buffer with a default capacity of 200 entries.
- Each entry carries ``content``, ``importance`` in ``[0, 1]``, ``sim_sec``,
  ``tags``, and an ``anchor`` flag.
- **Importance-aware eviction**: when full, scan only the non-anchor slots
  and evict the one with the smallest ``importance - age_decay * (now -
  sim_sec)``. Anchor entries are immune — surviving 1000 routine inserts is
  a tested invariant (see ``tests/simulation/ai/test_memory_store.py``).
- ``format_for_prompt(limit=30)`` returns a token-bounded multi-line string
  ordered by ``recency × importance``.

The JS module historically split entries into ``observations`` and
``reflections`` ring buffers. We unify them under ``anchor`` (reflection ≅
anchor=True; observation = anchor=False) and preserve the JS importance
scale of ``1..5`` via the optional ``importance_raw`` field on each entry.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from typing import Any

DEFAULT_CAPACITY = 200
DEFAULT_AGE_DECAY = 1.0 / 600.0  # importance shrinks by 1 over 10 minutes of sim time
DEFAULT_RECENCY_HALF_LIFE = 120.0  # seconds


@dataclass(slots=True)
class MemoryEntry:
    """One entry in the memory ring buffer.

    Attributes:
        content: Free-form text describing the event.
        importance: Float in ``[0, 1]``. Higher → less likely to be evicted.
        sim_sec: Simulation time at which the entry was recorded.
        tags: Optional list of categorical labels (e.g. ``["death",
            "resource_critical"]``).
        anchor: When True the entry is immune to eviction. Used for
            long-horizon reflections + injected anchors (E5).
        importance_raw: Optional JS-style integer importance (1..5) kept for
            cross-language NDJSON compat. Derived from ``importance`` when not
            supplied at construction.
    """

    content: str
    importance: float
    sim_sec: float
    tags: list[str] = field(default_factory=list)
    anchor: bool = False
    importance_raw: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "importance": float(self.importance),
            "simSec": float(self.sim_sec),
            "tags": list(self.tags),
            "anchor": bool(self.anchor),
            "importanceRaw": self.importance_raw,
        }


def _clamp01(value: float) -> float:
    if value != value:  # NaN
        return 0.0
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def _importance_to_raw(importance: float) -> int:
    return max(1, min(5, int(round(importance * 5))))


def _raw_to_importance(raw: int) -> float:
    return _clamp01(float(raw) / 5.0)


class MemoryStore:
    """Importance-aware ring buffer used by the colony-agent channel.

    Args:
        capacity: Maximum number of non-anchor entries kept simultaneously.
        age_decay: Per-second penalty applied to importance during eviction
            scoring. Larger → older entries are dropped sooner.
    """

    def __init__(
        self,
        *,
        capacity: int = DEFAULT_CAPACITY,
        age_decay: float = DEFAULT_AGE_DECAY,
    ) -> None:
        if capacity <= 0:
            raise ValueError("MemoryStore capacity must be positive")
        self._capacity = int(capacity)
        self._age_decay = float(age_decay)
        self._entries: list[MemoryEntry] = []
        self._latest_sim_sec: float = 0.0

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def size(self) -> int:
        return len(self._entries)

    @property
    def entries(self) -> list[MemoryEntry]:
        """Return a defensive copy of the current entries (insertion order)."""
        return list(self._entries)

    # -- write side ---------------------------------------------------------

    def insert(
        self,
        content: str,
        *,
        importance: float | int,
        sim_sec: float,
        tags: list[str] | None = None,
        anchor: bool = False,
        importance_raw: int | None = None,
    ) -> MemoryEntry:
        """Insert a new entry, evicting the lowest-scored non-anchor if full."""
        if (
            isinstance(importance, int)
            and not isinstance(importance, bool)
            and importance >= 1
            and importance <= 5
        ):
            # Accept the JS 1..5 integer scale transparently. Anything else
            # is treated as a float in [0, 1].
            importance_raw = importance_raw if importance_raw is not None else int(importance)
            imp = _raw_to_importance(int(importance))
        else:
            imp = _clamp01(float(importance))
            if importance_raw is None:
                importance_raw = _importance_to_raw(imp)
        entry = MemoryEntry(
            content=str(content),
            importance=imp,
            sim_sec=float(sim_sec),
            tags=list(tags or []),
            anchor=bool(anchor),
            importance_raw=int(importance_raw),
        )
        self._latest_sim_sec = max(self._latest_sim_sec, entry.sim_sec)

        # Eviction: only count NON-anchor entries against the capacity so that
        # anchor entries survive arbitrarily many routine inserts.
        non_anchor_count = sum(1 for e in self._entries if not e.anchor)
        if not entry.anchor and non_anchor_count >= self._capacity:
            self._evict_lowest_non_anchor()

        self._entries.append(entry)
        return entry

    def _evict_lowest_non_anchor(self) -> None:
        """Drop the lowest-scoring non-anchor entry (importance - age_decay*age)."""
        if not self._entries:
            return
        now = self._latest_sim_sec
        worst_idx: int = -1
        worst_score: float = math.inf
        for i, e in enumerate(self._entries):
            if e.anchor:
                continue
            age = max(0.0, now - e.sim_sec)
            score = e.importance - self._age_decay * age
            if score < worst_score:
                worst_score = score
                worst_idx = i
        if worst_idx >= 0:
            self._entries.pop(worst_idx)

    # -- read side ----------------------------------------------------------

    def format_for_prompt(
        self,
        limit: int = 30,
        *,
        current_sim_sec: float | None = None,
        half_life_sec: float = DEFAULT_RECENCY_HALF_LIFE,
    ) -> str:
        """Return a multi-line string of the top-``limit`` entries.

        Ordering: by ``recency × importance``, where recency uses an
        exponential half-life decay with ``half_life_sec`` (default 120s,
        matching the JS port). Anchor entries are not preferred or demoted —
        they share the same score formula as routine entries.
        """
        if not self._entries:
            return ""
        now = float(current_sim_sec if current_sim_sec is not None else self._latest_sim_sec)
        ln2 = math.log(2.0)
        scored: list[tuple[float, MemoryEntry]] = []
        for entry in self._entries:
            age = max(0.0, now - entry.sim_sec)
            recency = math.exp(-(age * ln2) / max(1e-6, half_life_sec))
            score = recency * (entry.importance + 0.01)
            scored.append((score, entry))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        chosen = [entry for _, entry in scored[: max(0, int(limit))]]
        if not chosen:
            return ""
        return "\n".join(
            f"[T={entry.sim_sec:.0f}s, imp={entry.importance:.2f}{', anchor' if entry.anchor else ''}] "
            f"{entry.content}"
            for entry in chosen
        )

    def recent_by_tag(self, tag: str, *, limit: int = 5) -> list[MemoryEntry]:
        """Return up to ``limit`` most-recent entries tagged with ``tag``."""
        out: list[MemoryEntry] = []
        for entry in reversed(self._entries):
            if tag in entry.tags:
                out.append(entry)
                if len(out) >= limit:
                    break
        return out

    def clear(self) -> None:
        """Drop every entry, anchor or not."""
        self._entries.clear()

    def to_dict(self) -> dict[str, Any]:
        """Serialisable snapshot of the store."""
        return {
            "capacity": self._capacity,
            "ageDecay": self._age_decay,
            "latestSimSec": float(self._latest_sim_sec),
            "entries": [e.to_dict() for e in self._entries],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MemoryStore":
        capacity = int(data.get("capacity", DEFAULT_CAPACITY))
        store = cls(capacity=capacity, age_decay=float(data.get("ageDecay", DEFAULT_AGE_DECAY)))
        store._latest_sim_sec = float(data.get("latestSimSec", 0.0))
        for raw in data.get("entries") or []:
            store._entries.append(
                MemoryEntry(
                    content=str(raw.get("content", "")),
                    importance=_clamp01(float(raw.get("importance", 0.0))),
                    sim_sec=float(raw.get("simSec", 0.0)),
                    tags=list(raw.get("tags") or []),
                    anchor=bool(raw.get("anchor", False)),
                    importance_raw=raw.get("importanceRaw"),
                )
            )
        return store


__all__ = [
    "DEFAULT_AGE_DECAY",
    "DEFAULT_CAPACITY",
    "DEFAULT_RECENCY_HALF_LIFE",
    "MemoryEntry",
    "MemoryStore",
]
