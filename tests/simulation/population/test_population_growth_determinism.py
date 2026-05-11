"""Same seed → same warehouse pick + same births."""

from __future__ import annotations

from project_utopia.app.rng import SeededRng
from project_utopia.simulation.population.population_growth_system import (
    RecruitmentSystem,
    compute_food_headroom_sec,
)
from project_utopia.world.grid import TILE, Grid


class _FakeServices:
    def __init__(self, seed: int) -> None:
        self.rng = SeededRng(seed=seed)


def _make_state(food: float = 500.0) -> dict:
    grid = Grid(width=12, height=12)
    # Drop three warehouses so the deterministic pick has options.
    grid.set_tile(2, 2, TILE["WAREHOUSE"])
    grid.set_tile(5, 5, TILE["WAREHOUSE"])
    grid.set_tile(8, 8, TILE["WAREHOUSE"])
    return {
        "grid": grid,
        "resources": {"food": food, "wood": 50.0, "stone": 10.0, "herbs": 0.0},
        "agents": [],
        "metrics": {"timeSec": 0.0, "foodProducedPerMin": 60.0},
        "controls": {
            "recruitQueue": 1,
            "recruitTarget": 12,
            "autoRecruit": True,
            "recruitCooldownSec": 0.0,
        },
        "buildings": {"warehouses": 3},
    }


class TestSeedDeterminism:
    def test_same_seed_same_births(self) -> None:
        state_a = _make_state()
        state_b = _make_state()
        sys = RecruitmentSystem()
        sa, sb = _FakeServices(seed=2026), _FakeServices(seed=2026)
        sys.update(1.0, state_a, sa)
        sys.update(1.0, state_b, sb)
        agents_a = state_a["agents"]
        agents_b = state_b["agents"]
        assert len(agents_a) == len(agents_b) == 1
        assert (agents_a[0]["x"], agents_a[0]["z"]) == (agents_b[0]["x"], agents_b[0]["z"])

    def test_different_seed_different_pick(self) -> None:
        state_a = _make_state()
        state_b = _make_state()
        sys = RecruitmentSystem()
        # With distinct seeds the deterministic warehouse pick should differ
        # at least for *some* seed combinations. Find one that proves
        # the system is using the rng (not constant-0.5).
        seeds = [(2026, 7777), (1, 999), (42, 4096)]
        positions = []
        for sa_seed, sb_seed in seeds:
            sa, sb = _FakeServices(seed=sa_seed), _FakeServices(seed=sb_seed)
            sa_state = _make_state()
            sb_state = _make_state()
            sys.update(1.0, sa_state, sa)
            sys.update(1.0, sb_state, sb)
            positions.append(((sa_state["agents"][0]["x"], sa_state["agents"][0]["z"]),
                              (sb_state["agents"][0]["x"], sb_state["agents"][0]["z"])))
        # At least one pair should differ.
        assert any(a != b for a, b in positions)
        del state_a, state_b  # unused but referenced for clarity


class TestRC3RNGFallback:
    def test_constant_fallback_when_no_services(self) -> None:
        """RC3 B5 fix: services=None must use constant 0.5, not random()."""
        state_a = _make_state()
        state_b = _make_state()
        RecruitmentSystem().update(1.0, state_a, services=None)
        RecruitmentSystem().update(1.0, state_b, services=None)
        # Both runs hit the same (deterministic) warehouse.
        assert state_a["agents"][0]["x"] == state_b["agents"][0]["x"]
        assert state_a["agents"][0]["z"] == state_b["agents"][0]["z"]


class TestFoodHeadroom:
    def test_net_positive_returns_inf(self) -> None:
        state = {
            "resources": {"food": 200.0},
            "metrics": {"foodProducedPerMin": 600.0},  # 10 food/sec, very surplus
        }
        # 5 workers × 0.6/s = 3 food/sec drain. Production 10/sec. Net +7 → inf.
        assert compute_food_headroom_sec(state, 5) == float("inf")

    def test_drain_returns_finite_runway(self) -> None:
        state = {
            "resources": {"food": 100.0},
            "metrics": {"foodProducedPerMin": 0.0},
        }
        # 10 workers × 0.6 = 6 food/sec drain → 100/6 ≈ 16.7s
        runway = compute_food_headroom_sec(state, 10)
        assert 16.0 < runway < 17.0
