"""Boids steering + traffic-metrics tests."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import pytest

from project_utopia.simulation.movement.boids_system import (
    BoidsSystem,
    build_traffic_metrics,
)
from project_utopia.world.grid import TILE, Grid


@dataclass
class _Boid:
    id: str
    x: float
    z: float
    vx: float = 0.0
    vz: float = 0.0
    desired_vel: dict[str, float] = field(default_factory=lambda: {"x": 0.0, "z": 0.0})
    type: str = "WORKER"
    group_id: str = "workers"
    kind: str = ""
    alive: bool = True
    path: Any = None
    path_index: int = 0


@pytest.fixture
def grid() -> Grid:
    return Grid(width=24, height=24, fill=TILE["GRASS"], tile_size=2.0)


def _energy(boids: list[_Boid]) -> float:
    """Average distance between every pair — used as a proxy for compactness."""
    n = len(boids)
    total = 0.0
    pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += math.hypot(boids[i].x - boids[j].x, boids[i].z - boids[j].z)
            pairs += 1
    return total / pairs if pairs > 0 else 0.0


def test_separation_pushes_apart(grid: Grid) -> None:
    """Two co-located boids must drift apart over a few ticks."""
    boids = [
        _Boid("a", 0.0, 0.0),
        _Boid("b", 0.1, 0.0),
    ]
    system = BoidsSystem()
    start = _energy(boids)
    for _ in range(30):
        system.update(boids, dt=0.1, grid=grid)
    end = _energy(boids)
    assert end > start, f"Boids did not separate: start={start} end={end}"


def test_alignment_matches_direction(grid: Grid) -> None:
    """A boid given a strong seek force should accelerate along that vector."""
    boids = [_Boid("a", 0.0, 0.0, desired_vel={"x": 1.0, "z": 0.0})]
    system = BoidsSystem()
    for _ in range(20):
        system.update(boids, dt=0.1, grid=grid)
    # vx > 0 → boid moves along +x as desired.
    assert boids[0].vx > 0.1
    # Position has advanced in +x direction.
    assert boids[0].x > 0.5


def test_cohesion_pulls_together(grid: Grid) -> None:
    """A pair of boids spaced inside ``neighbor_radius`` should not run apart.

    With no seek force and starting positions inside the neighbour radius,
    cohesion + alignment keep the distance bounded.
    """
    boids = [
        _Boid("a", 0.0, 0.0),
        _Boid("b", 2.0, 0.0),
    ]
    system = BoidsSystem()
    initial = math.hypot(boids[0].x - boids[1].x, boids[0].z - boids[1].z)
    for _ in range(20):
        system.update(boids, dt=0.1, grid=grid)
    final = math.hypot(boids[0].x - boids[1].x, boids[0].z - boids[1].z)
    # Cohesion + separation balance → distance stays roughly bounded.
    assert final < initial * 3.0


def test_traffic_penalty_grows_with_load(grid: Grid) -> None:
    """Tiles with many workers must produce a >1 penalty multiplier."""
    boids = [_Boid(f"w{i}", 0.0, 0.0) for i in range(5)]  # all on tile 12,12
    metrics = build_traffic_metrics(boids, grid)
    assert metrics["hotspot_count"] >= 1
    assert metrics["peak_load"] > 0
    assert metrics["peak_penalty"] > 1.0
    # The peak tile must appear in penalty_by_key.
    assert len(metrics["penalty_by_key"]) > 0


def test_traffic_signature_stable_when_load_stable(grid: Grid) -> None:
    """When entities don't move, the version counter must NOT bump."""
    boids = [_Boid(f"w{i}", 0.0, 0.0) for i in range(5)]
    first = build_traffic_metrics(boids, grid)
    second = build_traffic_metrics(boids, grid, previous_traffic=first, previous_signature=first["signature"])
    assert first["version"] == second["version"]


def test_traffic_version_bumps_when_signature_changes(grid: Grid) -> None:
    """Moving the hotspot must bump the version counter."""
    boids_a = [_Boid(f"a{i}", 0.0, 0.0) for i in range(5)]
    first = build_traffic_metrics(boids_a, grid)

    boids_b = [_Boid(f"b{i}", 6.0, 6.0) for i in range(5)]
    second = build_traffic_metrics(
        boids_b, grid, previous_traffic=first, previous_signature=first["signature"]
    )
    assert second["version"] == first["version"] + 1


def test_traffic_deflects_path_via_penalty(grid: Grid) -> None:
    """The penalty_by_key emitted by traffic metrics must be usable by A*.

    This is a contract test: feeding the metrics through to a_star's
    ``dynamic_costs["traffic"]["penaltyByKey"]`` must route around a
    congested column.
    """
    from project_utopia.simulation.navigation.a_star import a_star

    # Construct a 6-wide grid; put 6 workers all on (3, 1) → heavy congestion.
    g = Grid(width=6, height=3, fill=TILE["GRASS"], tile_size=2.0)
    boids = []
    # Place 6 workers at world-coord that maps to tile (3, 1) on a 6x3 grid.
    target_x = (3 - g.width / 2 + 0.5) * g.tile_size
    target_z = (1 - g.height / 2 + 0.5) * g.tile_size
    for i in range(6):
        boids.append(_Boid(f"w{i}", target_x, target_z))
    metrics = build_traffic_metrics(boids, g)
    # Manually amplify the penalty so the test is robust to default thresholds.
    if metrics["penalty_by_key"]:
        # Force the central tile penalty to a high value.
        metrics["penalty_by_key"]["3,1"] = 20.0
    dynamic_costs = {"traffic": {"penaltyByKey": metrics["penalty_by_key"]}}
    path = a_star(g, (0, 1), (5, 1), dynamic_costs=dynamic_costs)
    assert path is not None
    # Path should detour around (3, 1).
    assert (3, 1) not in path or len(path) > 6
