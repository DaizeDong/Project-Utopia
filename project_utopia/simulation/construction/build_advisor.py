"""Slim build-advisor (port of ``BuildAdvisor.js``).

The JS source is 743 LOC covering node-flag gates, escalator costs,
demolition salvage rolls, anchor-radius placement, infrastructure tests,
and a full preview/eval surface. For the academic benchmark we only need
the resource-economy primitives + a minimal preview check:

* :data:`BUILD_COST` — per-tool resource cost (food/wood/stone/herbs).
* :func:`can_afford` / :func:`spend` / :func:`refund` — pure resource ops.
* :func:`tool_to_tile` — mapping from tool name to ``TILE`` constant.
* :func:`evaluate_build_preview` — minimal placement validity check
  (allowed old tile + can-afford).
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any

from project_utopia.world.grid import TILE, Grid

__all__ = [
    "BUILD_COST",
    "TOOL_TO_TILE",
    "tool_to_tile",
    "can_afford",
    "spend",
    "refund",
    "evaluate_build_preview",
    "explain_build_reason",
]


_RESOURCE_KEYS: tuple[str, ...] = ("food", "wood", "stone", "herbs")


BUILD_COST: MappingProxyType[str, MappingProxyType[str, float]] = MappingProxyType(
    {
        "road": MappingProxyType({"wood": 1.0}),
        "farm": MappingProxyType({"wood": 3.0}),
        "lumber": MappingProxyType({"wood": 2.0}),
        "warehouse": MappingProxyType({"wood": 6.0, "stone": 2.0}),
        "wall": MappingProxyType({"wood": 2.0, "stone": 1.0}),
        "quarry": MappingProxyType({"wood": 3.0, "stone": 1.0}),
        "herb_garden": MappingProxyType({"wood": 2.0}),
        "kitchen": MappingProxyType({"wood": 5.0, "stone": 1.0}),
        "smithy": MappingProxyType({"wood": 4.0, "stone": 3.0}),
        "clinic": MappingProxyType({"wood": 4.0, "stone": 1.0, "herbs": 2.0}),
        "bridge": MappingProxyType({"wood": 4.0, "stone": 2.0}),
        "gate": MappingProxyType({"wood": 4.0, "stone": 1.0}),
    }
)


TOOL_TO_TILE: MappingProxyType[str, int] = MappingProxyType(
    {
        "road": TILE["ROAD"],
        "farm": TILE["FARM"],
        "lumber": TILE["LUMBER"],
        "warehouse": TILE["WAREHOUSE"],
        "wall": TILE["WALL"],
        "quarry": TILE["QUARRY"],
        "herb_garden": TILE["HERB_GARDEN"],
        "kitchen": TILE["KITCHEN"],
        "smithy": TILE["SMITHY"],
        "clinic": TILE["CLINIC"],
        "bridge": TILE["BRIDGE"],
        "gate": TILE["GATE"],
    }
)


_ALLOWED_OLD_TILES: dict[str, frozenset[int]] = {
    "road": frozenset({TILE["GRASS"], TILE["RUINS"]}),
    "farm": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "lumber": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "warehouse": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "wall": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "quarry": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "herb_garden": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "kitchen": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "smithy": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "clinic": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
    "bridge": frozenset({TILE["WATER"]}),
    "gate": frozenset({TILE["GRASS"], TILE["ROAD"], TILE["RUINS"]}),
}


def tool_to_tile(tool: str) -> int | None:
    return TOOL_TO_TILE.get(str(tool))


def can_afford(resources: dict[str, Any], cost: dict[str, float]) -> bool:
    for k in _RESOURCE_KEYS:
        need = float(cost.get(k, 0.0))
        if need <= 0:
            continue
        have = float(resources.get(k, 0.0))
        if have < need:
            return False
    return True


def spend(resources: dict[str, Any], cost: dict[str, float]) -> None:
    for k in _RESOURCE_KEYS:
        need = float(cost.get(k, 0.0))
        if need <= 0:
            continue
        resources[k] = max(0.0, float(resources.get(k, 0.0)) - need)


def refund(resources: dict[str, Any], payload: dict[str, float]) -> None:
    for k in _RESOURCE_KEYS:
        amt = float(payload.get(k, 0.0))
        if amt <= 0:
            continue
        resources[k] = float(resources.get(k, 0.0)) + amt


def explain_build_reason(reason: str) -> str:
    table = {
        "unchanged": "Tile is already that type.",
        "out_of_bounds": "Tile is outside the map.",
        "not_demolishable": "Only built structures or ruins can be demolished.",
        "wrong_terrain": "Tile cannot host this structure.",
        "insufficientResource": "Not enough resources to build this.",
        "unknown_tool": "Unknown build tool.",
        "no_blueprint": "No construction blueprint at that tile.",
        "blueprint_locked": "This blueprint cannot be canceled.",
        "already_under_construction": "Tile already has a construction in progress.",
    }
    return table.get(str(reason), str(reason))


def evaluate_build_preview(
    state: dict[str, Any],
    tool: str,
    ix: int,
    iz: int,
    services: Any | None = None,
) -> dict[str, Any]:
    """Return ``{ok, reason, oldType, newType, cost, refund}``.

    Minimal placement validity check: tool maps to a tile, the tile lies
    in bounds, the old tile is on the allowed list, and the colony can
    afford the cost. Demolish (``tool == "erase"``) is allowed on any
    built structure or RUINS and returns a partial wood refund.
    """
    del services
    grid = state.get("grid")
    if not isinstance(grid, Grid):
        return {
            "ok": False,
            "reason": "no_grid",
            "reasonText": "No grid attached to state.",
            "oldType": None,
            "newType": None,
            "cost": {},
            "refund": {},
        }
    if ix < 0 or iz < 0 or ix >= grid.width or iz >= grid.height:
        return {
            "ok": False,
            "reason": "out_of_bounds",
            "reasonText": explain_build_reason("out_of_bounds"),
            "oldType": None,
            "newType": None,
            "cost": {},
            "refund": {},
        }
    old_tile = int(grid.get_tile(ix, iz))

    if tool == "erase":
        new_tile = TILE["WATER"] if old_tile == TILE["BRIDGE"] else TILE["GRASS"]
        # Partial salvage: half the build cost when we know what it was.
        refund_payload: dict[str, float] = {}
        for tool_name, tile_id in TOOL_TO_TILE.items():
            if tile_id == old_tile:
                base_cost = BUILD_COST.get(tool_name, {})
                refund_payload = {
                    k: float(base_cost.get(k, 0.0)) * 0.5 for k in _RESOURCE_KEYS
                }
                break
        return {
            "ok": True,
            "reason": "",
            "reasonText": "",
            "oldType": old_tile,
            "newType": new_tile,
            "cost": {"wood": 1.0},
            "refund": refund_payload,
        }

    new_tile = tool_to_tile(tool)
    if new_tile is None:
        return {
            "ok": False,
            "reason": "unknown_tool",
            "reasonText": explain_build_reason("unknown_tool"),
            "oldType": old_tile,
            "newType": None,
            "cost": {},
            "refund": {},
        }

    allowed = _ALLOWED_OLD_TILES.get(str(tool), frozenset())
    if old_tile not in allowed:
        return {
            "ok": False,
            "reason": "wrong_terrain",
            "reasonText": explain_build_reason("wrong_terrain"),
            "oldType": old_tile,
            "newType": new_tile,
            "cost": dict(BUILD_COST.get(str(tool), {})),
            "refund": {},
        }

    cost = dict(BUILD_COST.get(str(tool), {}))
    resources = state.get("resources") or {}
    if not can_afford(resources, cost):
        return {
            "ok": False,
            "reason": "insufficientResource",
            "reasonText": explain_build_reason("insufficientResource"),
            "oldType": old_tile,
            "newType": new_tile,
            "cost": cost,
            "refund": {},
        }

    return {
        "ok": True,
        "reason": "",
        "reasonText": "",
        "oldType": old_tile,
        "newType": new_tile,
        "cost": cost,
        "refund": {},
    }
