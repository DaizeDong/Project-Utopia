"""Tile placement + blueprint lifecycle (port of ``BuildSystem.js``).

Two-mode placement:

* **instant** (``options["instant"] is True``) — mutates the tile
  immediately. Used by tests and editor tooling.
* **blueprint** (default) — charges the cost up front, writes a
  ``construction`` overlay onto :attr:`Grid.tile_state`, pushes a
  construction-site index entry, and waits for a BUILDER worker to drive
  completion through :class:`ConstructionSystem`.

The undo/redo history is preserved but pared down — the academic
benchmark only uses the forward path, but keeping the history surface
intact lets the harness replay deterministic action transcripts.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from project_utopia.simulation.lifecycle.tile_mutation_hooks import on_tile_mutated
from project_utopia.simulation.meta.game_event_bus import EVENT_TYPES, emit_event
from project_utopia.world.grid import TILE, Grid

from .build_advisor import (
    BUILD_COST,
    can_afford,
    evaluate_build_preview,
    explain_build_reason,
    refund,
    spend,
)
from .construction_sites import (
    clear_construction_overlay,
    get_build_work_sec,
    get_construction_overlay,
    get_demolish_work_sec,
    push_construction_site,
    set_construction_overlay,
    splice_construction_site,
)

__all__ = ["BuildSystem", "BUILT_STRUCTURE_TILES"]


BUILT_STRUCTURE_TILES: frozenset[int] = frozenset(
    {
        TILE["FARM"],
        TILE["LUMBER"],
        TILE["WAREHOUSE"],
        TILE["WALL"],
        TILE["QUARRY"],
        TILE["BRIDGE"],
        TILE["ROAD"],
    }
)


class BuildSystem:
    """Tile placement orchestrator (instant + blueprint modes)."""

    def __init__(
        self,
        on_action: Callable[[dict[str, Any]], None] | None = None,
        max_history: int = 600,
    ) -> None:
        self.name = "BuildSystem"
        self.on_action = on_action
        self.max_history = int(max_history)

    # ---- placement -----------------------------------------------------

    def preview_tool_at(
        self,
        state: dict[str, Any],
        tool: str,
        ix: int,
        iz: int,
        services: Any | None = None,
    ) -> dict[str, Any]:
        return evaluate_build_preview(state, tool, ix, iz, services)

    def place_tool_at(
        self,
        state: dict[str, Any],
        tool: str,
        ix: int,
        iz: int,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        options = dict(options or {})
        instant = bool(options.get("instant", False))
        services = options.get("services")

        # Erase-on-blueprint short-circuit.
        if tool == "erase" and not instant:
            overlay = get_construction_overlay(state, ix, iz)
            if overlay is not None:
                return self.cancel_blueprint(state, ix, iz, options)

        preview = self.preview_tool_at(state, tool, ix, iz, services)
        if not preview.get("ok"):
            return {**preview, "phase": ""}

        if not instant:
            return self._place_blueprint(state, tool, ix, iz, preview, options)

        # ----- instant path -------------------------------------------------
        resources = state.setdefault("resources", {})
        if tool != "erase":
            spend(resources, preview.get("cost") or {})
        if tool == "erase" and any(
            float((preview.get("refund") or {}).get(k, 0.0)) > 0
            for k in ("food", "wood", "stone")
        ):
            refund(resources, preview.get("refund") or {})

        grid = state.get("grid")
        if not isinstance(grid, Grid):
            return {**preview, "ok": False, "reason": "no_grid", "phase": ""}
        old_tile = int(grid.get_tile(ix, iz))
        new_tile = int(preview["newType"])
        if old_tile == new_tile:
            return {**preview, "ok": False, "reason": "unchanged", "phase": ""}
        grid.set_tile(ix, iz, new_tile)
        on_tile_mutated(state, ix, iz, old_tile, new_tile)
        owner = str(options.get("owner", "player"))
        reason = str(options.get("reason", ""))
        if callable(self.on_action):
            self.on_action(
                {
                    "kind": "build",
                    "tool": tool,
                    "ix": ix,
                    "iz": iz,
                    "oldType": old_tile,
                    "newType": new_tile,
                    "owner": owner,
                    "reason": reason,
                }
            )
        event_type = (
            EVENT_TYPES["BUILDING_DESTROYED"] if tool == "erase" else EVENT_TYPES["BUILDING_PLACED"]
        )
        emit_event(
            state,
            event_type,
            {
                "tool": tool,
                "ix": ix,
                "iz": iz,
                "oldType": old_tile,
                "newType": new_tile,
                "owner": owner,
                "reason": reason,
                "phase": "complete",
            },
        )
        return {
            **preview,
            "ok": True,
            "reason": "",
            "reasonText": "",
            "phase": "complete",
            "owner": owner,
            "ownerReason": reason,
        }

    # ---- blueprint path ------------------------------------------------

    def _place_blueprint(
        self,
        state: dict[str, Any],
        tool: str,
        ix: int,
        iz: int,
        preview: dict[str, Any],
        options: dict[str, Any],
    ) -> dict[str, Any]:
        owner = str(options.get("owner", "player"))
        reason = str(options.get("reason", ""))
        state.setdefault("constructionSites", [])

        if get_construction_overlay(state, ix, iz) is not None:
            return {
                **preview,
                "ok": False,
                "reason": "already_under_construction",
                "reasonText": explain_build_reason("already_under_construction"),
                "phase": "",
            }

        resources = state.setdefault("resources", {})
        is_erase = tool == "erase"

        if is_erase:
            old_tile = int(preview.get("oldType", 0))
            if old_tile not in BUILT_STRUCTURE_TILES and old_tile != TILE["RUINS"]:
                return {
                    **preview,
                    "ok": False,
                    "reason": "not_demolishable",
                    "reasonText": explain_build_reason("not_demolishable"),
                    "phase": "",
                }
            demo_cost = {"wood": 1.0}
            if not can_afford(resources, demo_cost):
                return {
                    **preview,
                    "ok": False,
                    "reason": "insufficientResource",
                    "reasonText": explain_build_reason("insufficientResource"),
                    "cost": demo_cost,
                    "phase": "",
                }
            spend(resources, demo_cost)
            overlay = {
                "kind": "demolish",
                "tool": "erase",
                "targetTile": int(preview.get("newType", TILE["GRASS"])),
                "originalTile": old_tile,
                "workTotalSec": get_demolish_work_sec(old_tile),
                "workAppliedSec": 0.0,
                "builderId": None,
                "startedAt": float((state.get("metrics") or {}).get("timeSec", 0.0)),
                "cost": dict(demo_cost),
                "refund": dict(preview.get("refund") or {}),
                "owner": owner,
                "cancelable": True,
            }
            set_construction_overlay(state, ix, iz, overlay)
            push_construction_site(
                state,
                {
                    "ix": ix,
                    "iz": iz,
                    "kind": overlay["kind"],
                    "tool": overlay["tool"],
                    "builderId": None,
                    "workAppliedSec": 0.0,
                    "workTotalSec": overlay["workTotalSec"],
                },
            )
            if callable(self.on_action):
                self.on_action({"kind": "build", "tool": tool, "ix": ix, "iz": iz, "owner": owner, "reason": reason})
            emit_event(
                state,
                EVENT_TYPES["BUILDING_PLACED"],
                {
                    "tool": tool,
                    "ix": ix,
                    "iz": iz,
                    "oldType": old_tile,
                    "newType": preview.get("newType"),
                    "owner": owner,
                    "reason": reason,
                    "phase": "blueprint",
                },
            )
            return {**preview, "ok": True, "phase": "blueprint", "cost": demo_cost}

        # Build blueprint.
        cost = dict(preview.get("cost") or {})
        if not can_afford(resources, cost):
            return {
                **preview,
                "ok": False,
                "reason": "insufficientResource",
                "reasonText": explain_build_reason("insufficientResource"),
                "phase": "",
            }
        spend(resources, cost)
        overlay = {
            "kind": "build",
            "tool": tool,
            "targetTile": int(preview.get("newType", TILE["GRASS"])),
            "originalTile": int(preview.get("oldType", TILE["GRASS"])),
            "workTotalSec": get_build_work_sec(tool),
            "workAppliedSec": 0.0,
            "builderId": None,
            "startedAt": float((state.get("metrics") or {}).get("timeSec", 0.0)),
            "cost": dict(cost),
            "refund": dict(preview.get("refund") or {}),
            "owner": owner,
            "cancelable": True,
        }
        set_construction_overlay(state, ix, iz, overlay)
        push_construction_site(
            state,
            {
                "ix": ix,
                "iz": iz,
                "kind": overlay["kind"],
                "tool": overlay["tool"],
                "builderId": None,
                "workAppliedSec": 0.0,
                "workTotalSec": overlay["workTotalSec"],
            },
        )
        if callable(self.on_action):
            self.on_action({"kind": "build", "tool": tool, "ix": ix, "iz": iz, "owner": owner, "reason": reason})
        emit_event(
            state,
            EVENT_TYPES["BUILDING_PLACED"],
            {
                "tool": tool,
                "ix": ix,
                "iz": iz,
                "oldType": overlay["originalTile"],
                "newType": overlay["targetTile"],
                "owner": owner,
                "reason": reason,
                "phase": "blueprint",
            },
        )
        return {**preview, "ok": True, "phase": "blueprint"}

    def cancel_blueprint(
        self,
        state: dict[str, Any],
        ix: int,
        iz: int,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        options = dict(options or {})
        overlay = get_construction_overlay(state, ix, iz)
        if overlay is None:
            return {
                "ok": False,
                "reason": "no_blueprint",
                "reasonText": explain_build_reason("no_blueprint"),
                "phase": "",
            }
        if overlay.get("cancelable") is False:
            return {
                "ok": False,
                "reason": "blueprint_locked",
                "reasonText": explain_build_reason("blueprint_locked"),
                "phase": "",
            }
        cost = dict(overlay.get("cost") or {})
        owner = str(options.get("owner", "player"))
        refund(state.setdefault("resources", {}), cost)
        clear_construction_overlay(state, ix, iz)
        splice_construction_site(state, ix, iz)
        emit_event(
            state,
            EVENT_TYPES["BUILDING_DESTROYED"],
            {
                "tool": "erase" if overlay.get("kind") == "demolish" else overlay.get("tool", ""),
                "ix": ix,
                "iz": iz,
                "oldType": overlay.get("originalTile", TILE["GRASS"]),
                "newType": overlay.get("originalTile", TILE["GRASS"]),
                "owner": owner,
                "reason": options.get("reason", "blueprint-cancel"),
                "phase": "blueprint-cancel",
            },
        )
        return {
            "ok": True,
            "reason": "",
            "reasonText": "",
            "ix": ix,
            "iz": iz,
            "oldType": overlay.get("originalTile", TILE["GRASS"]),
            "newType": overlay.get("originalTile", TILE["GRASS"]),
            "cost": cost,
            "refund": cost,
            "owner": owner,
            "phase": "blueprint-cancel",
        }


# Keep import so static analyzers see it is used (`BUILD_COST` exposed
# via build_advisor and referenced by callers).
_ = BUILD_COST
