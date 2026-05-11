"""Tests for :mod:`project_utopia.world.scenarios`."""

from __future__ import annotations

import pytest
from project_utopia.world.grid import Grid
from project_utopia.world.scenarios import SCENARIOS, ScenarioFactory, ScenarioState

# Expected (tier, initial_workers) per scenario, mirroring the JS source.
_EXPECTED: dict[str, tuple[str, int]] = {
    "temperate_plains": ("L1", 4),
    "fertile_riverlands": ("L2", 4),
    "rugged_highlands": ("L2", 4),
    "coastal_ocean": ("L3", 4),
    "archipelago_isles": ("L3", 4),
    "fortified_basin": ("L3", 4),
}


class TestScenarioRegistry:
    def test_all_six_scenarios_present(self) -> None:
        assert set(SCENARIOS.keys()) == set(_EXPECTED.keys())
        assert len(SCENARIOS) == 6

    @pytest.mark.parametrize("name,expected", list(_EXPECTED.items()))
    def test_scenario_tier_and_workers(self, name: str, expected: tuple[str, int]) -> None:
        tier, workers = expected
        s = SCENARIOS[name]
        assert s.tier == tier
        assert s.initial_workers == workers

    def test_registry_is_immutable(self) -> None:
        # Mutating the MappingProxyType view should raise TypeError.
        with pytest.raises(TypeError):
            SCENARIOS["new"] = SCENARIOS["temperate_plains"]  # type: ignore[index]

    def test_scenario_is_frozen_dataclass(self) -> None:
        s = SCENARIOS["temperate_plains"]
        with pytest.raises((AttributeError, Exception)):
            s.tier = "L3"  # type: ignore[misc]


class TestScenarioFactoryBuild:
    def test_returns_grid_and_state(self) -> None:
        grid, sstate = ScenarioFactory.build("temperate_plains", seed=0xC0FFEE)
        assert isinstance(grid, Grid)
        assert isinstance(sstate, ScenarioState)
        assert sstate.name == "temperate_plains"
        assert sstate.seed == 0xC0FFEE

    def test_reproducible_grid_hash(self) -> None:
        g1, _ = ScenarioFactory.build("temperate_plains", seed=0xC0FFEE)
        g2, _ = ScenarioFactory.build("temperate_plains", seed=0xC0FFEE)
        assert g1.serialize_first_n_chars(256) == g2.serialize_first_n_chars(256)

    @pytest.mark.parametrize("name", list(_EXPECTED.keys()))
    def test_all_scenarios_buildable(self, name: str) -> None:
        grid, sstate = ScenarioFactory.build(name, seed=2026)
        # Each scenario produces a grid with the configured dimensions.
        assert grid.width == SCENARIOS[name].width
        assert grid.height == SCENARIOS[name].height
        # And anchors include at least a core warehouse.
        assert "coreWarehouse" in sstate.anchors

    @pytest.mark.parametrize("name", list(_EXPECTED.keys()))
    def test_reproducible_across_scenarios(self, name: str) -> None:
        a, _ = ScenarioFactory.build(name, seed=42)
        b, _ = ScenarioFactory.build(name, seed=42)
        assert a.serialize_first_n_chars(128) == b.serialize_first_n_chars(128)

    def test_unknown_scenario_raises(self) -> None:
        with pytest.raises(KeyError):
            ScenarioFactory.build("nonexistent", seed=1)

    def test_distinct_seeds_diverge_when_carver_uses_rng(self) -> None:
        # `temperate_plains` uses the rng to scatter RUINS — two seeds
        # should yield distinct grids. The scatter happens mid-grid (z>=4)
        # so we fingerprint enough characters to cover the interior.
        a, _ = ScenarioFactory.build("temperate_plains", seed=1)
        b, _ = ScenarioFactory.build("temperate_plains", seed=2)
        # 96*72 = 6912 tiles → fingerprint a wide slice.
        n = 2 * 96 * 72  # 2 hex chars per tile, full coverage
        assert a.serialize_first_n_chars(n) != b.serialize_first_n_chars(n)

    def test_weather_and_event_seeds_offset(self) -> None:
        _, sstate = ScenarioFactory.build("fertile_riverlands", seed=100)
        scen = SCENARIOS["fertile_riverlands"]
        assert sstate.weather_seed == 100 + scen.weather_seed_offset
        assert sstate.event_seed == 100 + scen.event_seed_offset

    def test_initial_resources_match_blueprint(self) -> None:
        _, sstate = ScenarioFactory.build("archipelago_isles", seed=7)
        scen = SCENARIOS["archipelago_isles"]
        assert sstate.initial_resources["food"] == scen.starts_food
        assert sstate.initial_resources["wood"] == scen.starts_wood
        assert sstate.initial_resources["stone"] == 15

    def test_names_helper_sorted(self) -> None:
        names = ScenarioFactory.names()
        assert names == tuple(sorted(_EXPECTED.keys()))
