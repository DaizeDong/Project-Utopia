"""Tests for :mod:`project_utopia.world.weather`."""

from __future__ import annotations

import pytest
from project_utopia.app.rng import SeededRng
from project_utopia.world.weather import (
    WEATHER_MOVE_COST,
    Weather,
    WeatherState,
    WeatherSystem,
    weather_move_cost_multiplier,
)


class TestWeatherEnum:
    def test_three_weather_types(self) -> None:
        # Round-1 simplification collapsed the weather model to 3 states.
        names = {w.value for w in Weather}
        assert names == {"clear", "rain", "storm"}

    def test_move_cost_table_covers_all_weathers(self) -> None:
        for w in Weather:
            assert w in WEATHER_MOVE_COST
            assert WEATHER_MOVE_COST[w] >= 1.0

    def test_move_cost_helper(self) -> None:
        assert weather_move_cost_multiplier(Weather.CLEAR) == 1.0
        assert weather_move_cost_multiplier(Weather.RAIN) == pytest.approx(1.22)
        assert weather_move_cost_multiplier(Weather.STORM) == pytest.approx(1.52)


class TestWeatherSystemDeterminism:
    def test_same_seed_reproduces_trajectory(self) -> None:
        # Two independent runs with the same seed must yield the same
        # weather sequence after 20 ticks.
        seqs: list[list[Weather]] = []
        for _ in range(2):
            rng = SeededRng(seed=2026).derive("weather")
            ws = WeatherSystem()
            state = WeatherState()
            picks: list[Weather] = []
            now = 0.0
            for _ in range(80):
                ws.tick(dt=0.5, rng=rng, state=state, now_sec=now)
                picks.append(state.type)
                now += 0.5
            seqs.append(picks)
        assert seqs[0] == seqs[1]

    def test_different_seed_diverges(self) -> None:
        seqs: list[list[Weather]] = []
        for seed in (1, 9999):
            rng = SeededRng(seed=seed).derive("weather")
            ws = WeatherSystem()
            state = WeatherState()
            picks: list[Weather] = []
            now = 0.0
            for _ in range(80):
                ws.tick(dt=0.5, rng=rng, state=state, now_sec=now)
                picks.append(state.type)
                now += 0.5
            seqs.append(picks)
        # Some divergence is expected over 40s of simulation.
        assert seqs[0] != seqs[1]

    def test_time_left_decrements(self) -> None:
        rng = SeededRng(seed=7).derive("weather")
        ws = WeatherSystem()
        state = WeatherState()
        # First tick anchors and rolls a weather; time_left_sec becomes the
        # duration of the chosen weather.
        ws.tick(dt=0.1, rng=rng, state=state, now_sec=0.0)
        t_after_first = state.time_left_sec
        assert t_after_first > 0
        ws.tick(dt=2.0, rng=rng, state=state, now_sec=2.0)
        assert state.time_left_sec < t_after_first

    def test_season_progresses_through_year(self) -> None:
        rng = SeededRng(seed=11).derive("weather")
        ws = WeatherSystem()
        state = WeatherState()
        seasons_seen: set[str] = set()
        now = 0.0
        # 4 seasons × 60s ≈ 240s. Simulate 300s in 1-second ticks.
        for _ in range(300):
            ws.tick(dt=1.0, rng=rng, state=state, now_sec=now)
            seasons_seen.add(state.season)
            now += 1.0
        assert "spring" in seasons_seen
        assert "summer" in seasons_seen
        assert "winter" in seasons_seen
