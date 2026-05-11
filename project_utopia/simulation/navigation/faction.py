"""Faction-aware tile passability (port of ``src/simulation/navigation/Faction.js``).

Walls block everyone; gates are passable for the ``COLONY`` faction only.
All other faction filters delegate to ``TILE_INFO.passable`` (handled in
the A* neighbour loop).

Faction tags:
    COLONY   — workers, traders
    HOSTILE  — saboteurs, predators
    NEUTRAL  — herbivores
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any

from project_utopia.world.grid import TILE

__all__ = [
    "FACTION",
    "get_entity_faction",
    "is_tile_passable_for_faction",
]

# Frozen faction enum. ``MappingProxyType`` gives a read-only dict view,
# mirroring JS ``Object.freeze``.
FACTION: MappingProxyType[str, str] = MappingProxyType(
    {
        "COLONY": "colony",
        "HOSTILE": "hostile",
        "NEUTRAL": "neutral",
    }
)


def get_entity_faction(entity: Any) -> str:
    """Derive a faction tag from an entity-like object.

    Handles both dataclass-style attribute access (``entity.type``) and
    dict-style access (``entity["type"]``). Returns ``COLONY`` as the safe
    default for unknown shapes (matches the JS behaviour).

    Routing rules:
        WORKER (any role)                   → colony
        VISITOR/TRADER                      → colony
        VISITOR/SABOTEUR                    → hostile
        ANIMAL/HERBIVORE                    → neutral
        ANIMAL/PREDATOR (incl. raider)      → hostile
        anything else                       → colony (safe default)
    """
    if entity is None:
        return FACTION["COLONY"]

    entity_type = _get(entity, "type", "")
    if entity_type == "WORKER":
        return FACTION["COLONY"]
    if entity_type == "VISITOR":
        kind = _get(entity, "kind", "")
        return FACTION["HOSTILE"] if kind == "SABOTEUR" else FACTION["COLONY"]
    if entity_type == "ANIMAL":
        kind = _get(entity, "kind", "")
        return FACTION["HOSTILE"] if kind == "PREDATOR" else FACTION["NEUTRAL"]
    return FACTION["COLONY"]


def is_tile_passable_for_faction(tile_type: int, faction: str) -> bool:
    """Return ``True`` iff ``faction`` may cross ``tile_type``.

    Layered semantics: callers should consult ``TILE_INFO.passable`` first
    (which already blocks WATER, WALL for everyone). This helper only
    encodes the faction-specific delta — i.e. gates close to non-colony
    factions and walls are double-checked as a safety net.
    """
    if tile_type == TILE["WALL"]:
        return False
    if tile_type == TILE["GATE"]:
        return faction == FACTION["COLONY"]
    return True


def _get(entity: Any, key: str, default: Any = None) -> Any:
    """Read ``entity[key]`` whether ``entity`` is a dict or an object."""
    if isinstance(entity, dict):
        return entity.get(key, default)
    return getattr(entity, key, default)
