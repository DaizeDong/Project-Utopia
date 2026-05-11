"""Per-tile fertility / wear ticking (port of ``TileStateSystem.js``).

After Round-1 simplification the system folds two things together:

1. Slow soil maintenance (fertility recovery on production tiles).
2. Wear accumulation on roads / walls (storm + traffic accelerants).

Drought wildfire ignition + spread has been removed alongside the
DROUGHT weather state and WILDFIRE event type.
"""

from __future__ import annotations

from typing import Any

from project_utopia.world.grid import TILE, Grid

__all__ = ["TileStateSystem", "drain_fertility", "get_tile_fertility"]


FERTILITY_RECOVERY_PER_SEC = 0.002
FERTILITY_HARVEST_DRAIN = 0.08
WEAR_INCREASE_PER_SEC = 0.0008
WEAR_STORM_MULTIPLIER = 2.5
UPDATE_INTERVAL_SEC = 2.0

_PRODUCTION_TILES: frozenset[int] = frozenset(
    {TILE["FARM"], TILE["LUMBER"]}
)
_WEAR_TILES: frozenset[int] = frozenset(
    {
        TILE["ROAD"],
        TILE["BRIDGE"],
        TILE["WALL"],
        TILE["QUARRY"],
    }
)


class TileStateSystem:
    """Fertility / wear tick.

    Sits between ``ResourceSystem`` and the construction layer in
    SYSTEM_ORDER; see ``project_utopia.config.constants``.
    """

    def __init__(self) -> None:
        self.name = "TileStateSystem"
        self._next_update_sec = 0.0

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del services  # no RNG needed after wildfire path was removed
        grid = state.get("grid")
        if not isinstance(grid, Grid):
            return
        if not hasattr(grid, "tile_state"):
            return

        metrics = state.get("metrics") or {}
        now_sec = float(metrics.get("timeSec", 0.0))
        if now_sec < self._next_update_sec:
            return
        self._next_update_sec = now_sec + UPDATE_INTERVAL_SEC
        elapsed = UPDATE_INTERVAL_SEC

        weather = state.get("weather") or {}
        is_storm = weather.get("current") == "storm"
        weather_mult = WEAR_STORM_MULTIPLIER if is_storm else 1.0

        # Sort indices for deterministic iteration.
        for idx in sorted(grid.tile_state.keys()):
            entry = grid.tile_state[idx]
            ix = idx % grid.width
            iz = idx // grid.width
            t = int(grid.get_tile(ix, iz))
            if t in _PRODUCTION_TILES:
                fert = float(entry.get("fertility", 0.85))
                entry["fertility"] = min(1.0, fert + FERTILITY_RECOVERY_PER_SEC * elapsed)
                entry["growthStage"] = min(3, int(entry["fertility"] * 4))
            elif t in _WEAR_TILES:
                wear = float(entry.get("wear", 0.0))
                entry["wear"] = min(1.0, wear + WEAR_INCREASE_PER_SEC * elapsed * weather_mult)

        del dt  # unused — gate is on UPDATE_INTERVAL_SEC


def drain_fertility(grid: Grid, ix: int, iz: int) -> None:
    """Harvest tick: reduce fertility on the given tile."""
    if not hasattr(grid, "tile_state"):
        return
    idx = iz * grid.width + ix
    entry = grid.tile_state.get(idx)
    if entry is None:
        return
    entry["fertility"] = max(0.0, float(entry.get("fertility", 0.85)) - FERTILITY_HARVEST_DRAIN)
    entry["exhaustion"] = min(5.0, float(entry.get("exhaustion", 0.0)) + 1.0)


def get_tile_fertility(grid: Grid, ix: int, iz: int) -> float:
    """Read the fertility scalar for a tile (defaults to 1.0)."""
    if not hasattr(grid, "tile_state"):
        return 1.0
    idx = iz * grid.width + ix
    entry = grid.tile_state.get(idx)
    if entry is None:
        return 1.0
    return float(entry.get("fertility", 1.0))
