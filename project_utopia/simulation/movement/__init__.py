"""Movement substrate — Boids steering + spatial hash."""

from project_utopia.simulation.movement.boids_system import BoidsSystem, build_traffic_metrics
from project_utopia.simulation.movement.spatial_hash import build_spatial_hash, query_neighbors

__all__ = [
    "BoidsSystem",
    "build_spatial_hash",
    "build_traffic_metrics",
    "query_neighbors",
]
