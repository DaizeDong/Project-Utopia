"""Boids steering + traffic metrics (port of ``src/simulation/movement/BoidsSystem.js``).

Three classic rules — separation, alignment, cohesion — plus a seek
force that follows ``entity.desired_vel``. Per-group profiles let the
caller weight workers differently from animals. Traffic density is
sampled into a per-tile penalty map (``penalty_by_key``) so A* can route
around hotspots.

Drops vs JS (~150 LOC of mostly-dead code):
- HUD / debug overlay writers (``state.debug.boids``)
- High-load LOD bypass (the deterministic harness never gates on entity
  count; we always run the full Boids step at the fixed tick rate)
- Edge-of-map damping (substrate clamps the position; reflection isn't
  needed for the benchmark)
"""

from __future__ import annotations

import math
from types import MappingProxyType
from typing import Any, Iterable

from project_utopia.app.math_utils import clamp
from project_utopia.simulation.movement.spatial_hash import (
    SpatialHash,
    build_spatial_hash,
    query_neighbors,
)
from project_utopia.world.grid import Grid, in_bounds, world_to_tile

__all__ = ["BoidsSystem", "build_traffic_metrics", "DEFAULT_BOIDS_PROFILE"]


# ---- group profiles ---------------------------------------------------------

# A boids profile encodes the per-group steering weights. ``MappingProxyType``
# keeps consumers from accidentally mutating shared state.
_DEFAULT_WEIGHTS = MappingProxyType(
    {
        "separation": 1.8,
        "alignment": 0.65,
        "cohesion": 0.45,
        "seek": 1.0,
    }
)

DEFAULT_BOIDS_PROFILE: MappingProxyType[str, Any] = MappingProxyType(
    {
        "neighbor_radius": 3.0,
        "separation_radius": 1.3,
        "weights": _DEFAULT_WEIGHTS,
    }
)


def _same_flock_group(a: Any, b: Any) -> bool:
    """Return ``True`` iff the two entities belong to the same boids flock."""
    if getattr(a, "type", None) != getattr(b, "type", None):
        return False
    ga = str(getattr(a, "group_id", "") or "")
    gb = str(getattr(b, "group_id", "") or "")
    if ga and gb:
        return ga == gb
    if getattr(a, "type", None) == "ANIMAL":
        return getattr(a, "kind", None) == getattr(b, "kind", None)
    return True


def _get_profile(entity: Any, profiles: dict[str, Any]) -> Any:
    """Return the boids profile for ``entity.group_id`` or the default."""
    group_id = str(getattr(entity, "group_id", "") or "")
    if group_id and group_id in profiles:
        return profiles[group_id]
    return DEFAULT_BOIDS_PROFILE


def _boids_steer(
    entity: Any,
    neighbors: list[Any],
    desired_x: float,
    desired_z: float,
    profile: Any,
    max_samples: int = 24,
) -> tuple[float, float]:
    """Compute steering acceleration ``(ax, az)`` for ``entity``."""
    sep_x = sep_z = ali_x = ali_z = coh_x = coh_z = 0.0
    count = 0
    neighbor_r = float(profile.get("neighbor_radius", 3.0))
    sep_r = float(profile.get("separation_radius", 1.3))
    weights = profile.get("weights", _DEFAULT_WEIGHTS)

    # Damp separation while pathing — workers in narrow corridors should
    # not fight the seek force. Mirrors v0.10.1 hotfix A2.
    has_path = bool(
        getattr(entity, "type", None) in ("WORKER", "VISITOR")
        and getattr(entity, "path", None)
        and int(getattr(entity, "path_index", 0)) < len(getattr(entity, "path", []) or [])
    )
    sep_damp = 0.35 if has_path else 1.0

    for other in neighbors:
        if other is entity:
            continue
        if not _same_flock_group(entity, other):
            continue
        dx = float(other.x) - float(entity.x)
        dz = float(other.z) - float(entity.z)
        d_sq = dx * dx + dz * dz
        if d_sq <= 1e-12:
            continue
        d = math.sqrt(d_sq)
        if d <= 1e-6 or d > neighbor_r:
            continue

        ali_x += float(other.vx)
        ali_z += float(other.vz)
        coh_x += float(other.x)
        coh_z += float(other.z)
        count += 1
        if count >= max_samples:
            break

        if d < sep_r:
            inv_d = 1.0 / (d + 0.001)
            sep_x += (-dx / d) * inv_d
            sep_z += (-dz / d) * inv_d

    if count > 0:
        ali_x /= count
        ali_z /= count
        coh_x = coh_x / count - float(entity.x)
        coh_z = coh_z / count - float(entity.z)

    w_sep = float(weights.get("separation", 1.8)) * sep_damp
    w_ali = float(weights.get("alignment", 0.65))
    w_coh = float(weights.get("cohesion", 0.45))
    w_seek = float(weights.get("seek", 1.0))

    ax = sep_x * w_sep + ali_x * w_ali + coh_x * w_coh + desired_x * w_seek
    az = sep_z * w_sep + ali_z * w_ali + coh_z * w_coh + desired_z * w_seek
    return ax, az


# ---- traffic metrics --------------------------------------------------------

_TRAFFIC_NEIGHBOR_OFFSETS = ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1))


def _tile_key(ix: int, iz: int) -> str:
    return f"{ix},{iz}"


def _traffic_weight(entity: Any, weights: dict[str, float]) -> float:
    """Per-entity traffic weight (workers contribute more than herbivores)."""
    etype = getattr(entity, "type", None)
    if etype == "WORKER":
        return max(0.0, float(weights.get("worker", 1.0)))
    if etype == "VISITOR":
        return max(0.0, float(weights.get("visitor", 0.92)))
    if getattr(entity, "kind", None) == "PREDATOR":
        return max(0.0, float(weights.get("predator", 0.72)))
    return max(0.0, float(weights.get("herbivore", 0.58)))


def build_traffic_metrics(
    entities: Iterable[Any],
    grid: Grid,
    previous_traffic: dict[str, Any] | None = None,
    previous_signature: str = "",
    *,
    soft_load: float = 2.15,
    hotspot_load: float = 3.2,
    penalty_per_load: float = 0.28,
    neighbor_ratio: float = 0.46,
    max_penalty: float = 2.2,
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Compute per-tile traffic load + penalty multipliers.

    Returns a dict suitable for handing to A* as ``dynamic_costs["traffic"]``.
    The ``version`` field bumps iff the hotspot signature changes — so A*
    caches keyed on ``cost_version`` only invalidate when the topology of
    congestion actually moves.
    """
    weights = weights or {"worker": 1.0, "visitor": 0.92, "predator": 0.72, "herbivore": 0.58}
    load_by_key_raw: dict[str, float] = {}
    total_load = 0.0
    for e in entities:
        if getattr(e, "alive", True) is False:
            continue
        ix, iz = world_to_tile(float(e.x), float(e.z), grid)
        if not in_bounds(ix, iz, grid):
            continue
        w = _traffic_weight(e, weights)
        if w <= 0:
            continue
        key = _tile_key(ix, iz)
        load_by_key_raw[key] = load_by_key_raw.get(key, 0.0) + w
        total_load += w

    soft = max(1.0, float(soft_load))
    hot = max(soft + 0.1, float(hotspot_load))
    per_load = max(0.05, float(penalty_per_load))
    neighbor = clamp(float(neighbor_ratio), 0.0, 1.0)
    max_pen = max(1.05, float(max_penalty))

    load_by_key: dict[str, float] = {}
    pressure_tiles: list[dict[str, Any]] = []
    # Sort raw keys so penalty assignment is order-stable across runs.
    for key in sorted(load_by_key_raw):
        raw_load = load_by_key_raw[key]
        ix, iz = map(int, key.split(","))
        load = round(raw_load, 2)
        load_by_key[key] = load
        overflow = max(0.0, load - soft)
        penalty = min(max_pen, 1.0 + overflow * per_load) if overflow > 0 else 1.0
        if penalty > 1:
            pressure_tiles.append({"key": key, "ix": ix, "iz": iz, "load": load, "penalty": round(penalty, 2)})

    # Highest-load tile first (descending), with key as secondary tiebreak.
    pressure_tiles.sort(key=lambda t: (-t["load"], -t["penalty"], t["key"]))
    hotspot_tiles = [t for t in pressure_tiles if t["load"] >= hot]

    penalty_by_key: dict[str, float] = {}

    def _set_peak(key: str, penalty: float) -> None:
        if not key or penalty <= 1:
            return
        next_val = max(penalty_by_key.get(key, 1.0), penalty)
        penalty_by_key[key] = round(next_val, 2)

    for tile in pressure_tiles:
        _set_peak(tile["key"], tile["penalty"])
        spill = 1.0 + (tile["penalty"] - 1.0) * neighbor
        for dx, dz in _TRAFFIC_NEIGHBOR_OFFSETS:
            nx = tile["ix"] + dx
            nz = tile["iz"] + dz
            if not in_bounds(nx, nz, grid):
                continue
            _set_peak(_tile_key(nx, nz), min(max_pen, spill))

    peak_load = float(pressure_tiles[0]["load"]) if pressure_tiles else 0.0
    peak_penalty = round(max(penalty_by_key.values()), 2) if penalty_by_key else 1.0
    occupied = max(0, len(load_by_key))
    avg_load = round(total_load / occupied, 2) if occupied > 0 else 0.0

    signature = "|".join(t["key"] for t in hotspot_tiles[:6])
    prev_version = int((previous_traffic or {}).get("version", 0))
    version = prev_version if signature == previous_signature else prev_version + 1

    return {
        "version": version,
        "active_lane_count": len(pressure_tiles),
        "hotspot_count": len(hotspot_tiles),
        "peak_load": peak_load,
        "avg_load": avg_load,
        "peak_penalty": peak_penalty,
        "load_by_key": load_by_key,
        "penalty_by_key": penalty_by_key,
        "hotspot_tiles": (hotspot_tiles or pressure_tiles)[:6],
        "signature": signature,
    }


# ---- BoidsSystem ------------------------------------------------------------


class BoidsSystem:
    """Per-tick boids integrator.

    Holds the persistent spatial hash so we don't reallocate dict buckets
    every tick. Designed to be instantiated once per harness run.

    Parameters
    ----------
    profiles
        Map ``{group_id: profile}`` where each profile mirrors
        :data:`DEFAULT_BOIDS_PROFILE`. Missing groups fall back to the
        default.
    cell_size
        Spatial-hash bucket edge length in world units. Defaults to
        ``2.0`` (= one tile at the JS default tile size).
    """

    __slots__ = ("name", "profiles", "_hash", "_last_traffic_signature")

    def __init__(
        self,
        *,
        profiles: dict[str, Any] | None = None,
        cell_size: float = 2.0,
    ) -> None:
        self.name = "BoidsSystem"
        self.profiles: dict[str, Any] = profiles or {}
        self._hash: SpatialHash = SpatialHash(cell_size=cell_size)
        self._last_traffic_signature: str = ""

    def update(
        self,
        entities: list[Any],
        dt: float,
        grid: Grid,
        *,
        max_speed: dict[str, float] | None = None,
    ) -> None:
        """Run one boids tick over ``entities``.

        Each entity must expose mutable ``x, z, vx, vz`` floats and
        optional ``desired_vel`` dict ``{x, z}``. Position is clamped to
        ``grid`` bounds; impassable tiles cause a revert (matching JS).
        """
        if not entities:
            return

        max_speed = max_speed or {
            "WORKER": 2.8,
            "VISITOR": 2.5,
            "PREDATOR": 2.6,
            "HERBIVORE": 2.0,
        }

        bounds_x = (grid.width * grid.tile_size) / 2.0 - 0.5
        bounds_z = (grid.height * grid.tile_size) / 2.0 - 0.5

        self._hash = build_spatial_hash(entities, self._hash.cell_size, self._hash)

        for e in entities:
            if getattr(e, "alive", True) is False:
                continue
            desired = getattr(e, "desired_vel", None)
            desired_x = float(desired["x"]) if desired else 0.0
            desired_z = float(desired["z"]) if desired else 0.0

            profile = _get_profile(e, self.profiles)
            neighbors = query_neighbors(self._hash, e, max_out=72, deterministic=True)
            ax, az = _boids_steer(e, neighbors, desired_x, desired_z, profile)

            # Smooth blend toward steering target — same coefficient as JS.
            e.vx = float(e.vx) + (ax - float(e.vx)) * 0.12
            e.vz = float(e.vz) + (az - float(e.vz)) * 0.12

            # Cap to per-type max speed.
            etype = getattr(e, "type", "")
            kind = getattr(e, "kind", "")
            mv_key = etype if etype != "ANIMAL" else kind
            mv = float(max_speed.get(mv_key, 2.5))
            speed = math.hypot(e.vx, e.vz)
            if speed > mv:
                s = mv / (speed + 1e-6)
                e.vx *= s
                e.vz *= s

            prev_x = float(e.x)
            prev_z = float(e.z)
            new_x = clamp(prev_x + e.vx * dt, -bounds_x, bounds_x)
            new_z = clamp(prev_z + e.vz * dt, -bounds_z, bounds_z)

            # Revert if the destination tile is impassable.
            ix, iz = world_to_tile(new_x, new_z, grid)
            if in_bounds(ix, iz, grid):
                tile_type = grid.get_tile(ix, iz)
                from project_utopia.world.grid import TILE_INFO
                info = TILE_INFO.get(tile_type)
                if info is not None and not info["passable"]:
                    new_x, new_z = prev_x, prev_z
                    e.vx *= 0.1
                    e.vz *= 0.1

            e.x = new_x
            e.z = new_z

    # ---- helpers --------------------------------------------------------

    def build_traffic(
        self,
        entities: Iterable[Any],
        grid: Grid,
        previous_traffic: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Compute the next traffic-metrics dict and update the signature cache."""
        metrics = build_traffic_metrics(
            entities,
            grid,
            previous_traffic,
            self._last_traffic_signature,
        )
        self._last_traffic_signature = metrics["signature"]
        return metrics
