"""Construction-site index helpers (port of ``ConstructionSites.js``).

Authoritative state for any in-progress build/demolish lives on the
tile's overlay (stored in :attr:`Grid.tile_state`). This module mirrors
that into ``state["constructionSites"]``, an indexed list used by the
build / construction systems to assign builders and tick completion.
"""

from __future__ import annotations

from typing import Any

from project_utopia.world.grid import TILE, Grid

__all__ = [
    "get_build_work_sec",
    "get_demolish_work_sec",
    "push_construction_site",
    "splice_construction_site",
    "find_construction_site",
    "rebuild_construction_sites",
    "get_construction_overlay",
    "set_construction_overlay",
    "clear_construction_overlay",
    "apply_construction_work",
    "find_or_reserve_builder_site",
    "release_builder_site",
]


_CONSTRUCTION_WORK_SEC: dict[str, float] = {
    "road": 1.5,
    "farm": 4.0,
    "lumber": 4.0,
    "warehouse": 6.0,
    "wall": 5.0,
    "quarry": 5.0,
    "bridge": 5.0,
    "default": 4.0,
}

_DEMOLISH_WORK_SEC: dict[str, float] = {
    "ruins": 1.5,
    "wall": 2.5,
    "default": 3.0,
}


def get_build_work_sec(tool: str) -> float:
    v = _CONSTRUCTION_WORK_SEC.get(str(tool))
    if v is None or v <= 0:
        return _CONSTRUCTION_WORK_SEC["default"]
    return float(v)


def get_demolish_work_sec(old_tile: int) -> float:
    if int(old_tile) == TILE["RUINS"]:
        return float(_DEMOLISH_WORK_SEC["ruins"])
    if int(old_tile) == TILE["WALL"]:
        return float(_DEMOLISH_WORK_SEC["wall"])
    return float(_DEMOLISH_WORK_SEC["default"])


def push_construction_site(state: dict[str, Any], entry: dict[str, Any]) -> None:
    state.setdefault("constructionSites", []).append(entry)


def splice_construction_site(
    state: dict[str, Any], ix: int, iz: int
) -> dict[str, Any] | None:
    arr = state.get("constructionSites")
    if not isinstance(arr, list):
        return None
    for i, s in enumerate(arr):
        if isinstance(s, dict) and int(s.get("ix", -1)) == ix and int(s.get("iz", -1)) == iz:
            return arr.pop(i)
    return None


def find_construction_site(
    state: dict[str, Any], ix: int, iz: int
) -> dict[str, Any] | None:
    for s in state.get("constructionSites") or []:
        if isinstance(s, dict) and int(s.get("ix", -1)) == ix and int(s.get("iz", -1)) == iz:
            return s
    return None


def get_construction_overlay(
    state: dict[str, Any], ix: int, iz: int
) -> dict[str, Any] | None:
    grid = state.get("grid")
    if not isinstance(grid, Grid):
        return None
    if not hasattr(grid, "tile_state"):
        return None
    idx = iz * grid.width + ix
    entry = grid.tile_state.get(idx)
    if not isinstance(entry, dict):
        return None
    overlay = entry.get("construction")
    return overlay if isinstance(overlay, dict) else None


def set_construction_overlay(
    state: dict[str, Any], ix: int, iz: int, overlay: dict[str, Any]
) -> None:
    grid = state.get("grid")
    if not isinstance(grid, Grid):
        return
    if not hasattr(grid, "tile_state"):
        return
    idx = iz * grid.width + ix
    entry = grid.tile_state.get(idx)
    if not isinstance(entry, dict):
        entry = {}
        grid.tile_state[idx] = entry
    entry["construction"] = overlay


def clear_construction_overlay(
    state: dict[str, Any], ix: int, iz: int
) -> None:
    grid = state.get("grid")
    if not isinstance(grid, Grid):
        return
    if not hasattr(grid, "tile_state"):
        return
    idx = iz * grid.width + ix
    entry = grid.tile_state.get(idx)
    if isinstance(entry, dict) and "construction" in entry:
        del entry["construction"]


def rebuild_construction_sites(state: dict[str, Any]) -> None:
    """Rebuild ``state["constructionSites"]`` from authoritative overlays."""
    grid = state.get("grid")
    out: list[dict[str, Any]] = []
    if isinstance(grid, Grid) and hasattr(grid, "tile_state"):
        for idx in sorted(grid.tile_state.keys()):
            entry = grid.tile_state[idx]
            if not isinstance(entry, dict):
                continue
            overlay = entry.get("construction")
            if not isinstance(overlay, dict):
                continue
            ix = idx % grid.width
            iz = idx // grid.width
            out.append(
                {
                    "ix": ix,
                    "iz": iz,
                    "kind": overlay.get("kind"),
                    "tool": overlay.get("tool"),
                    "builderId": overlay.get("builderId"),
                    "workAppliedSec": float(overlay.get("workAppliedSec", 0.0)),
                    "workTotalSec": float(overlay.get("workTotalSec", 0.0)),
                }
            )
    state["constructionSites"] = out


def apply_construction_work(
    state: dict[str, Any], ix: int, iz: int, dt: float
) -> dict[str, Any] | None:
    """Increment ``workAppliedSec`` on the overlay + index entry by ``dt``."""
    overlay = get_construction_overlay(state, ix, iz)
    if overlay is None:
        return None
    overlay["workAppliedSec"] = max(0.0, float(overlay.get("workAppliedSec", 0.0))) + max(
        0.0, float(dt)
    )
    arr = state.get("constructionSites")
    if isinstance(arr, list):
        for site in arr:
            if isinstance(site, dict) and int(site.get("ix", -1)) == ix and int(site.get("iz", -1)) == iz:
                site["workAppliedSec"] = float(overlay["workAppliedSec"])
                site["workTotalSec"] = float(overlay.get("workTotalSec", site.get("workTotalSec", 0.0)))
                break
    return overlay


def find_or_reserve_builder_site(
    state: dict[str, Any], worker: dict[str, Any]
) -> dict[str, Any] | None:
    arr = state.get("constructionSites")
    if not isinstance(arr, list) or not arr:
        return None
    wid = worker.get("id")
    # Prefer existing reservation by this worker.
    for site in arr:
        if not isinstance(site, dict):
            continue
        if site.get("builderId") == wid:
            overlay = get_construction_overlay(state, int(site["ix"]), int(site["iz"]))
            if overlay is not None:
                site["workAppliedSec"] = float(overlay.get("workAppliedSec", 0.0))
                site["workTotalSec"] = float(overlay.get("workTotalSec", 0.0))
            return site
    # Otherwise pick the nearest unassigned site.
    wx = float(worker.get("x", 0.0))
    wz = float(worker.get("z", 0.0))
    best: dict[str, Any] | None = None
    best_dist = float("inf")
    for site in arr:
        if not isinstance(site, dict):
            continue
        if site.get("builderId") and site.get("builderId") != wid:
            continue
        d = abs(int(site.get("ix", 0)) - wx) + abs(int(site.get("iz", 0)) - wz)
        if d < best_dist:
            best_dist = d
            best = site
    if best is None:
        return None
    best["builderId"] = wid
    overlay = get_construction_overlay(state, int(best["ix"]), int(best["iz"]))
    if overlay is not None:
        overlay["builderId"] = wid
    return best


def release_builder_site(state: dict[str, Any], worker: dict[str, Any]) -> None:
    arr = state.get("constructionSites")
    if not isinstance(arr, list):
        return
    wid = worker.get("id")
    for site in arr:
        if not isinstance(site, dict):
            continue
        if site.get("builderId") == wid:
            site["builderId"] = None
            overlay = get_construction_overlay(state, int(site["ix"]), int(site["iz"]))
            if overlay is not None:
                overlay["builderId"] = None
