"""Tests for :mod:`project_utopia.app.services`."""

from __future__ import annotations

import math

from project_utopia.app.rng import SeededRng
from project_utopia.app.services import Services, create_services
from project_utopia.app.sim_clock import SimulationClock


class TestCreateServices:
    def test_returns_services_dataclass(self) -> None:
        services = create_services(seed=42, deterministic=True)
        assert isinstance(services, Services)
        assert isinstance(services.rng, SeededRng)
        assert isinstance(services.clock, SimulationClock)

    def test_deterministic_default_is_true(self) -> None:
        services = create_services(seed=42)
        assert services.deterministic is True
        assert services.path_budget["maxMs"] == math.inf

    def test_non_deterministic_sets_path_budget(self) -> None:
        services = create_services(seed=42, deterministic=False)
        assert services.deterministic is False
        assert services.path_budget["maxMs"] == 3.0

    def test_same_seed_produces_identical_rng_stream(self) -> None:
        a = create_services(seed=42).rng
        b = create_services(seed=42).rng
        seq_a = [a.next() for _ in range(50)]
        seq_b = [b.next() for _ in range(50)]
        assert seq_a == seq_b

    def test_different_seeds_diverge(self) -> None:
        a = create_services(seed=42).rng
        b = create_services(seed=43).rng
        seq_a = [a.next() for _ in range(50)]
        seq_b = [b.next() for _ in range(50)]
        assert seq_a != seq_b

    def test_dispose_is_safe_with_no_resources(self) -> None:
        services = create_services(seed=1)
        # No path_worker_pool installed; dispose must not raise.
        services.dispose()

    def test_clock_can_advance_state(self) -> None:
        services = create_services(seed=1)
        state: dict = {}
        services.clock.update(0.5, state)
        assert state["metrics"]["tick"] == 1
        assert state["metrics"]["timeSec"] == 0.5
        assert "environment" in state
        assert 0.0 <= state["environment"]["dayNightPhase"] < 1.0
