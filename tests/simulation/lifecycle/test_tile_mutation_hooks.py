"""Tests for the tile-mutation cascade hooks."""

from __future__ import annotations

import pytest

from project_utopia.simulation.lifecycle.tile_mutation_hooks import (
    BLOCKING_TILES,
    apply_world_event_impact,
    clear_mutation_hooks,
    mutate_tile,
    on_tile_mutated,
    register_mutation_hook,
)
from project_utopia.world.grid import TILE, Grid


def _make_state() -> dict:
    grid = Grid(width=8, height=8)
    return {
        "grid": grid,
        "agents": [],
        "buildings": {},
    }


class TestCascade:
    def setup_method(self) -> None:
        clear_mutation_hooks()

    def test_no_op_when_same_tile(self) -> None:
        state = _make_state()
        # Capture pre-state and call with old == new.
        before = state.get("buildings", {})
        on_tile_mutated(state, 2, 2, TILE["GRASS"], TILE["GRASS"])
        # No-op → buildings dict not mutated.
        assert state.get("buildings", {}) == before

    def test_path_invalidated_when_new_tile_blocks(self) -> None:
        state = _make_state()
        agent = {
            "id": "w1",
            "alive": True,
            "targetTile": {"ix": 3, "iz": 3},
            "path": [{"ix": 3, "iz": 3}],
            "pathIndex": 0,
        }
        state["agents"] = [agent]
        # GRASS → RUINS (blocking).
        on_tile_mutated(state, 3, 3, TILE["GRASS"], TILE["RUINS"])
        assert agent["targetTile"] is None
        assert agent["path"] is None

    def test_path_not_invalidated_when_unrelated_to_tile(self) -> None:
        state = _make_state()
        agent = {
            "id": "w1",
            "alive": True,
            "targetTile": {"ix": 7, "iz": 7},  # NOT the mutated tile
            "path": [{"ix": 7, "iz": 7}],
        }
        state["agents"] = [agent]
        # GRASS → ROAD at (5,5). Agent's target is (7,7) — untouched.
        on_tile_mutated(state, 5, 5, TILE["GRASS"], TILE["ROAD"])
        assert agent["targetTile"] == {"ix": 7, "iz": 7}
        assert agent["path"] == [{"ix": 7, "iz": 7}]

    def test_wall_hp_seeded_on_wall_placement(self) -> None:
        state = _make_state()
        grid: Grid = state["grid"]
        grid.set_tile(4, 4, TILE["WALL"])
        on_tile_mutated(state, 4, 4, TILE["GRASS"], TILE["WALL"])
        idx = 4 * grid.width + 4
        assert grid.tile_state[idx]["wallHp"] == 50.0

    def test_wall_hp_seeded_for_gate(self) -> None:
        state = _make_state()
        grid: Grid = state["grid"]
        grid.set_tile(1, 1, TILE["GATE"])
        on_tile_mutated(state, 1, 1, TILE["GRASS"], TILE["GATE"])
        idx = 1 * grid.width + 1
        assert grid.tile_state[idx]["wallHp"] == 75.0


class TestHookRegistration:
    def setup_method(self) -> None:
        clear_mutation_hooks()

    def test_hook_fires_on_mutation(self) -> None:
        captured: list[tuple[int, int, int, int]] = []

        def hook(_state: dict, ix: int, iz: int, old: int, new: int) -> None:
            captured.append((ix, iz, old, new))

        register_mutation_hook(hook)
        state = _make_state()
        mutate_tile(state, 2, 2, TILE["FARM"])
        assert captured == [(2, 2, TILE["GRASS"], TILE["FARM"])]

    def test_unsubscribe(self) -> None:
        captured: list = []
        unsub = register_mutation_hook(lambda *a: captured.append(a))
        unsub()
        state = _make_state()
        mutate_tile(state, 2, 2, TILE["FARM"])
        assert captured == []


class TestWorldEventImpact:
    def setup_method(self) -> None:
        clear_mutation_hooks()

    def test_bandit_raid_turns_tile_to_ruins(self) -> None:
        state = _make_state()
        state["grid"].set_tile(2, 2, TILE["FARM"])
        apply_world_event_impact(state, "banditRaid", (2, 2))
        assert int(state["grid"].get_tile(2, 2)) == TILE["RUINS"]

    def test_wildfire_turns_to_grass(self) -> None:
        state = _make_state()
        state["grid"].set_tile(3, 3, TILE["FARM"])
        apply_world_event_impact(state, "wildfire", (3, 3))
        assert int(state["grid"].get_tile(3, 3)) == TILE["GRASS"]


class TestBlockingTilesContract:
    def test_blocking_set_membership(self) -> None:
        assert TILE["WALL"] in BLOCKING_TILES
        assert TILE["WATER"] in BLOCKING_TILES
        assert TILE["RUINS"] in BLOCKING_TILES
        assert TILE["ROAD"] not in BLOCKING_TILES
        assert TILE["GRASS"] not in BLOCKING_TILES
