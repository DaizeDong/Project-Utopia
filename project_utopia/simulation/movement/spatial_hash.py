"""Tile-bucket spatial hash (port of ``src/simulation/movement/SpatialHash.js``).

Each entity is bucketed by ``(int(x / cell_size), int(z / cell_size))``.
:func:`query_neighbors` returns every entity in the 3×3 ring of cells
around the query — i.e. anything within roughly ``cell_size`` units.

Determinism
-----------
The underlying dict ordering is insertion-order from Python 3.7+, which
is stable but not reproducible across builds that vary entity insertion
order. :func:`query_neighbors` sorts the returned list by ``(id, x, z)``
when ``deterministic=True`` to guarantee a stable iteration order in the
boids step.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable

__all__ = [
    "SpatialHash",
    "build_spatial_hash",
    "query_neighbors",
]


@dataclass
class SpatialHash:
    """Dictionary-backed spatial bucket grid."""

    cell_size: float = 2.0
    buckets: dict[tuple[int, int], list[Any]] = field(default_factory=dict)

    def clear(self) -> None:
        """Drop every entity bucket."""
        self.buckets.clear()


def build_spatial_hash(
    entities: Iterable[Any],
    cell_size: float = 2.0,
    reuse_hash: SpatialHash | None = None,
) -> SpatialHash:
    """Build (or refill) a spatial hash from a flat entity iterable.

    Parameters
    ----------
    entities
        Iterable yielding objects with ``x`` and ``z`` numeric attributes.
    cell_size
        Bucket edge length in world units.
    reuse_hash
        Optional existing :class:`SpatialHash` whose buckets are cleared
        and refilled (avoids reallocating dicts every tick).
    """
    h = reuse_hash if reuse_hash is not None else SpatialHash(cell_size=cell_size)
    h.cell_size = float(cell_size)
    h.buckets.clear()

    for entity in entities:
        cx = math.floor(float(entity.x) / h.cell_size)
        cz = math.floor(float(entity.z) / h.cell_size)
        bucket = h.buckets.get((cx, cz))
        if bucket is None:
            bucket = []
            h.buckets[(cx, cz)] = bucket
        bucket.append(entity)

    return h


def query_neighbors(
    hash_: SpatialHash,
    entity: Any,
    *,
    radius: float | None = None,
    max_out: int | None = None,
    deterministic: bool = True,
) -> list[Any]:
    """Return every entity within ``radius`` of ``entity``.

    When ``radius`` is ``None`` the search returns every entity in the
    3×3 ring around the query cell (matching the JS behaviour). When
    ``deterministic=True`` (the default), the result is sorted by
    ``(id, x, z)`` so bucket-dict-order changes never leak into Boids
    steering.
    """
    out: list[Any] = []
    cx = math.floor(float(entity.x) / hash_.cell_size)
    cz = math.floor(float(entity.z) / hash_.cell_size)
    r_sq = (float(radius) ** 2) if radius is not None else None

    # Sorted cell iteration for determinism — the 3×3 ring is small so the
    # sort is effectively free.
    cell_keys = [(cx + dx, cz + dz) for dx in (-1, 0, 1) for dz in (-1, 0, 1)]
    for key in cell_keys:
        bucket = hash_.buckets.get(key)
        if bucket is None:
            continue
        for other in bucket:
            if r_sq is not None:
                dx = float(other.x) - float(entity.x)
                dz = float(other.z) - float(entity.z)
                if dx * dx + dz * dz > r_sq:
                    continue
            out.append(other)
            if max_out is not None and len(out) >= max_out:
                if deterministic:
                    out.sort(key=_sort_key)
                return out

    if deterministic:
        out.sort(key=_sort_key)
    return out


def _sort_key(entity: Any) -> tuple[str, float, float]:
    """Sort key for deterministic iteration: ``(id, x, z)``."""
    return (
        str(getattr(entity, "id", "")),
        float(getattr(entity, "x", 0.0)),
        float(getattr(entity, "z", 0.0)),
    )
