"""Blueprint completion ticker (port of ``ConstructionSystem.js``).

Walks the construction-site index every tick; when a site's
``workAppliedSec`` crosses ``workTotalSec`` the system:

1. Clears the overlay BEFORE mutating the tile (so ``on_tile_mutated``
   sees the post-construction layout).
2. Mutates the tile via :func:`mutate_tile` (which fans out the
   cascade-cleanup hooks).
3. Emits ``BUILDING_PLACED`` (build) or ``BUILDING_DESTROYED`` +
   ``DEMOLITION_RECYCLED`` (demolish) with phase ``"complete"``.

The wall HP regeneration sub-routine is preserved (compact form).
"""

from __future__ import annotations

from typing import Any

from project_utopia.simulation.lifecycle.tile_mutation_hooks import mutate_tile
from project_utopia.simulation.meta.game_event_bus import EVENT_TYPES, emit_event
from project_utopia.world.grid import TILE, Grid

from .build_advisor import refund as refund_resources
from .construction_sites import (
    clear_construction_overlay,
    get_construction_overlay,
    rebuild_construction_sites,
)

__all__ = ["ConstructionSystem"]


class ConstructionSystem:
    def __init__(self) -> None:
        self.name = "ConstructionSystem"

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del services
        if not isinstance(state, dict):
            return
        # Wall HP regen — compact pass.
        self._regenerate_wall_hp(state, max(0.0, float(dt)))

        sites = state.setdefault("constructionSites", [])
        if not sites:
            return

        # Iterate in reverse so splices don't shift indices.
        for i in range(len(sites) - 1, -1, -1):
            site = sites[i]
            if not isinstance(site, dict):
                sites.pop(i)
                continue
            ix = int(site.get("ix", 0))
            iz = int(site.get("iz", 0))
            overlay = get_construction_overlay(state, ix, iz)
            if overlay is None:
                sites.pop(i)
                continue
            # Sync per-tick mirror.
            site["workAppliedSec"] = float(overlay.get("workAppliedSec", 0.0))
            site["workTotalSec"] = float(overlay.get("workTotalSec", site.get("workTotalSec", 0.0)))
            site["builderId"] = overlay.get("builderId")

            # Free reservation if the builder died.
            if overlay.get("builderId"):
                builder_alive = False
                for a in state.get("agents") or []:
                    if isinstance(a, dict) and a.get("id") == overlay["builderId"] and a.get("alive", True) is not False:
                        builder_alive = True
                        break
                if not builder_alive:
                    overlay["builderId"] = None
                    site["builderId"] = None

            total = float(overlay.get("workTotalSec", 0.0))
            applied = float(overlay.get("workAppliedSec", 0.0))
            if total <= 0.0 or applied < total:
                continue

            owner = str(overlay.get("owner", "player"))
            is_build = overlay.get("kind") == "build"
            is_demolish = overlay.get("kind") == "demolish"
            target_tile = int(overlay.get("targetTile", TILE["GRASS"]))
            original_tile = int(overlay.get("originalTile", TILE["GRASS"]))
            tool = str(overlay.get("tool", ""))

            clear_construction_overlay(state, ix, iz)
            sites.pop(i)

            mutate_tile(state, ix, iz, target_tile)

            if is_build:
                emit_event(
                    state,
                    EVENT_TYPES["BUILDING_PLACED"],
                    {
                        "tool": tool,
                        "ix": ix,
                        "iz": iz,
                        "oldType": original_tile,
                        "newType": target_tile,
                        "owner": owner,
                        "phase": "complete",
                    },
                )
            elif is_demolish:
                r = overlay.get("refund") or {}
                positive = any(float(r.get(k, 0.0)) > 0 for k in ("food", "wood", "stone"))
                if positive:
                    refund_resources(state.setdefault("resources", {}), r)
                    emit_event(
                        state,
                        EVENT_TYPES["DEMOLITION_RECYCLED"],
                        {
                            "ix": ix,
                            "iz": iz,
                            "refund": {k: float(r.get(k, 0.0)) for k in ("wood", "stone", "food") if float(r.get(k, 0.0)) > 0},
                            "oldType": original_tile,
                        },
                    )
                emit_event(
                    state,
                    EVENT_TYPES["BUILDING_DESTROYED"],
                    {
                        "tool": tool,
                        "ix": ix,
                        "iz": iz,
                        "oldType": original_tile,
                        "newType": target_tile,
                        "owner": owner,
                        "phase": "complete",
                    },
                )

        # Defensive periodic rebuild if mirror drifts.
        tick = int((state.get("metrics") or {}).get("tick", 0))
        if tick > 0 and tick % 300 == 0 and not state.get("constructionSites"):
            grid = state.get("grid")
            if isinstance(grid, Grid) and any(
                isinstance(e, dict) and "construction" in e
                for e in grid.tile_state.values()
            ):
                rebuild_construction_sites(state)

    # ---- wall HP regeneration -----------------------------------------

    def _regenerate_wall_hp(self, state: dict[str, Any], dt: float) -> None:
        grid = state.get("grid")
        if not isinstance(grid, Grid):
            return
        regen_per_sec = 0.1
        wall_max = 50.0
        if dt <= 0:
            return
        for idx in sorted(grid.tile_state.keys()):
            entry = grid.tile_state[idx]
            if not isinstance(entry, dict):
                continue
            hp = entry.get("wallHp")
            if hp is None:
                continue
            if float(hp) >= wall_max:
                continue
            entry["wallHp"] = min(wall_max, float(hp) + regen_per_sec * dt)
