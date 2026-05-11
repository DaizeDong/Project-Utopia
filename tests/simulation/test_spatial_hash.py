"""Spatial-hash bucket + neighbour-query tests."""

from __future__ import annotations

from dataclasses import dataclass

from project_utopia.simulation.movement.spatial_hash import (
    SpatialHash,
    build_spatial_hash,
    query_neighbors,
)


@dataclass
class _Entity:
    id: str
    x: float
    z: float


def test_build_buckets_by_cell() -> None:
    """Entities at integer positions land in cells matching ``cell_size``."""
    ents = [_Entity("a", 0.0, 0.0), _Entity("b", 1.5, 0.5), _Entity("c", 4.0, 4.0)]
    h = build_spatial_hash(ents, cell_size=2.0)
    # (0,0), (0,0), (2,2) buckets respectively
    assert (0, 0) in h.buckets
    assert (2, 2) in h.buckets
    assert len(h.buckets[(0, 0)]) == 2


def test_query_neighbours_within_radius() -> None:
    """``query_neighbors`` returns every entity in the 3x3 cell ring."""
    ents = [
        _Entity("a", 0.0, 0.0),
        _Entity("b", 1.5, 1.5),   # same cell
        _Entity("c", 2.5, 2.5),   # neighbour cell (diagonally adjacent)
        _Entity("d", 8.0, 8.0),   # far cell — must not appear
    ]
    h = build_spatial_hash(ents, cell_size=2.0)
    neighbours = query_neighbors(h, ents[0])
    ids = {e.id for e in neighbours}
    # The query cell + 8 neighbour cells span x ∈ [-2, 4), z ∈ [-2, 4).
    # 'a' (in), 'b' (in), 'c' (in), 'd' (out).
    assert "a" in ids
    assert "b" in ids
    assert "c" in ids
    assert "d" not in ids


def test_radius_filter() -> None:
    """When ``radius`` is given, entities outside the circle are dropped."""
    ents = [
        _Entity("a", 0.0, 0.0),
        _Entity("near", 0.5, 0.5),
        _Entity("far_in_cell", 1.5, 1.5),
    ]
    h = build_spatial_hash(ents, cell_size=2.0)
    near = query_neighbors(h, ents[0], radius=1.0)
    ids = {e.id for e in near}
    assert "near" in ids
    assert "far_in_cell" not in ids
    assert "a" in ids


def test_max_out_caps_result() -> None:
    """``max_out`` limits the number of neighbours returned."""
    ents = [_Entity(f"e{i}", float(i) * 0.1, 0.0) for i in range(20)]
    h = build_spatial_hash(ents, cell_size=2.0)
    capped = query_neighbors(h, ents[0], max_out=5)
    assert len(capped) == 5


def test_deterministic_iteration() -> None:
    """Sorted iteration order is stable across runs."""
    ents = [_Entity("c", 0.0, 0.0), _Entity("a", 0.5, 0.5), _Entity("b", 1.0, 0.0)]
    h = build_spatial_hash(ents, cell_size=2.0)
    out1 = query_neighbors(h, ents[0])
    out2 = query_neighbors(h, ents[0])
    assert [e.id for e in out1] == [e.id for e in out2]
    # Sort by id confirms determinism.
    assert [e.id for e in out1] == sorted([e.id for e in out1])
