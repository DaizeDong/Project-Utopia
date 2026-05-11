"""Tests for the pure-function economy telemetry helpers."""

from __future__ import annotations

from project_utopia.simulation.telemetry.economy_telemetry import (
    collect_economy_snapshot,
    score_all_dims,
    score_economy,
    score_population,
)
from project_utopia.world.grid import TILE, Grid


def _make_state() -> dict:
    grid = Grid(width=10, height=10)
    grid.set_tile(1, 1, TILE["FARM"])
    grid.set_tile(2, 1, TILE["FARM"])
    grid.set_tile(3, 1, TILE["WAREHOUSE"])
    grid.set_tile(4, 1, TILE["ROAD"])
    grid.set_tile(5, 1, TILE["WALL"])
    return {
        "grid": grid,
        "agents": [
            {"type": "WORKER", "alive": True, "hunger": 0.9, "rest": 0.8, "morale": 0.7},
            {"type": "WORKER", "alive": True, "hunger": 0.5, "rest": 0.5, "morale": 0.5, "role": "MILITIA"},
        ],
        "resources": {"food": 100.0, "wood": 30.0, "stone": 10.0},
    }


class TestSnapshot:
    def test_collect_snapshot_shape(self) -> None:
        snap = collect_economy_snapshot(_make_state())
        assert snap["agentCount"] == 2
        assert snap["militiaCount"] == 1
        assert snap["resources"]["food"] == 100.0
        assert snap["tileCounts"]["farm"] == 2
        assert snap["tileCounts"]["warehouse"] == 1
        assert snap["tileCounts"]["road"] == 1
        assert snap["tileCounts"]["wall"] == 1


class TestScoring:
    def test_population_scaling(self) -> None:
        snap = collect_economy_snapshot(_make_state())
        # 2 agents → 2/30 * 80 ≈ 5.33
        assert score_population(snap) < 10.0

    def test_economy_normalises(self) -> None:
        snap = collect_economy_snapshot(_make_state())
        score = score_economy(snap)
        assert 0.0 <= score <= 100.0

    def test_score_all_dims_six_keys(self) -> None:
        snap = collect_economy_snapshot(_make_state())
        dims = score_all_dims(snap)
        assert set(dims) == {
            "population",
            "economy",
            "infrastructure",
            "production",
            "defense",
            "resilience",
        }
        for v in dims.values():
            assert 0.0 <= v <= 200.0  # population dim caps at 200
