"""Per-tile fertility / wear / wildfire ticking (port of ``TileStateSystem.js``).

The JS source folds three things together:

1. Slow soil maintenance (fertility recovery, exhaustion decay, fallow expiry).
2. Wear accumulation on roads / walls (storm + traffic accelerants).
3. Drought wildfire ignition + spread.

We keep the deterministic core and drop the salinization warning toast.

The wildfire ignition probability uses ``services.rng`` if available;
otherwise it falls back to a constant ``0.5`` (RC3 B3 fix) so the
defensive path is bit-reproducible.
"""

from __future__ import annotations

from typing import Any

from project_utopia.simulation.lifecycle.tile_mutation_hooks import on_tile_mutated
from project_utopia.simulation.meta.game_event_bus import EVENT_TYPES, emit_event
from project_utopia.world.grid import TILE, Grid

__all__ = ["TileStateSystem", "drain_fertility", "get_tile_fertility"]


FERTILITY_RECOVERY_PER_SEC = 0.002
FERTILITY_HARVEST_DRAIN = 0.08
WEAR_INCREASE_PER_SEC = 0.0008
WEAR_STORM_MULTIPLIER = 2.5
UPDATE_INTERVAL_SEC = 2.0

_PRODUCTION_TILES: frozenset[int] = frozenset(
    {TILE["FARM"], TILE["HERB_GARDEN"], TILE["LUMBER"]}
)
_WEAR_TILES: frozenset[int] = frozenset(
    {
        TILE["ROAD"],
        TILE["BRIDGE"],
        TILE["WALL"],
        TILE["QUARRY"],
        TILE["KITCHEN"],
        TILE["SMITHY"],
        TILE["CLINIC"],
    }
)
_FLAMMABLE_TILES: frozenset[int] = frozenset(
    {TILE["FARM"], TILE["LUMBER"], TILE["HERB_GARDEN"]}
)
_FIREBREAK_TILES: frozenset[int] = frozenset(
    {TILE["ROAD"], TILE["BRIDGE"], TILE["WATER"], TILE["WALL"]}
)


def _rng_next(services: Any | None) -> float:
    rng = getattr(services, "rng", None) if services is not None else None
    if rng is None:
        return 0.5
    return float(rng.next())


class TileStateSystem:
    """Fertility / wear / wildfire tick.

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

        is_drought = weather.get("current") == "drought"
        if is_drought:
            self._update_fire(state, grid, services)
        del dt  # unused — gate is on UPDATE_INTERVAL_SEC

    # ----- wildfire ----------------------------------------------------

    def _update_fire(
        self,
        state: dict[str, Any],
        grid: Grid,
        services: Any | None,
    ) -> None:
        ignite_chance = 0.001
        max_spread = 3
        new_fires: list[tuple[int, int]] = []

        for idx in sorted(grid.tile_state.keys()):
            entry = grid.tile_state[idx]
            ix = idx % grid.width
            iz = idx // grid.width
            t = int(grid.get_tile(ix, iz))
            if entry.get("onFire"):
                entry["wear"] = min(1.0, float(entry.get("wear", 0.0)) + 0.05)
                if entry["wear"] >= 1.0:
                    old_tile = t
                    grid.set_tile(ix, iz, TILE["GRASS"])
                    on_tile_mutated(state, ix, iz, old_tile, TILE["GRASS"])
                    emit_event(
                        state,
                        EVENT_TYPES["BUILDING_DESTROYED"],
                        {"ix": ix, "iz": iz, "cause": "wildfire"},
                    )
                    continue
                if int(entry.get("fireAge", 0)) < max_spread:
                    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, nz = ix + dx, iz + dz
                        if nx < 0 or nz < 0 or nx >= grid.width or nz >= grid.height:
                            continue
                        nt = int(grid.get_tile(nx, nz))
                        if nt in _FIREBREAK_TILES or nt not in _FLAMMABLE_TILES:
                            continue
                        if _rng_next(services) < ignite_chance * 2:
                            new_fires.append((nx, nz))
                continue

            if t not in _FLAMMABLE_TILES:
                continue
            if _rng_next(services) < ignite_chance:
                entry["onFire"] = True
                entry["fireAge"] = 0

        # Apply spread.
        for nx, nz in new_fires:
            idx2 = nz * grid.width + nx
            e = grid.tile_state.get(idx2)
            if e is None:
                e = {"fertility": 0.85, "wear": 0.0, "growthStage": 0}
                grid.tile_state[idx2] = e
            if not e.get("onFire"):
                e["onFire"] = True
                e["fireAge"] = int(e.get("fireAge", 0)) + 1


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
