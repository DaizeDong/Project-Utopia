"""Scenario factory + 6 scenario blueprints (port of ``src/world/scenarios/ScenarioFactory.js``).

The JS source carries a ~1600 LOC procedural generator that produces six
named map templates (``temperate_plains``, ``fertile_riverlands``,
``rugged_highlands``, ``coastal_ocean``, ``archipelago_isles``,
``fortified_basin``). The Python port preserves the **identity** of each
blueprint — its tier, starting workers, starting resources, stressor flags,
and tile palette — but replaces the rich Perlin terrain generator with a
seeded-but-simpler procedural carver. This matches the academic-benchmark
contract: scenarios are reproducible from a single integer seed, not
bit-equivalent to the JS output (Tier-1' determinism, per
``docs/ai-research/python-migration-conventions.md``).

The :func:`ScenarioFactory.build` entry point returns a ``(Grid, ScenarioState)``
tuple so callers can plug both into the simulation harness without an
intermediate adapter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Literal

from project_utopia.app.rng import SeededRng

from .grid import (
    DEFAULT_HEIGHT,
    DEFAULT_TILE_SIZE,
    DEFAULT_WIDTH,
    TILE,
    Grid,
)

__all__ = [
    "SCENARIOS",
    "Scenario",
    "ScenarioFactory",
    "ScenarioState",
    "Tier",
]


Tier = Literal["L1", "L2", "L3"]

# ---------------------------------------------------------------------------
# Scenario blueprints (frozen).
# ---------------------------------------------------------------------------

# Tile palette per scenario — defines which terrain features the carver
# is allowed to write. The values are tile ids from :data:`TILE`.
_GRASS_PALETTE: tuple[int, ...] = (TILE["GRASS"],)
_RIVER_PALETTE: tuple[int, ...] = (
    TILE["GRASS"],
    TILE["WATER"],
    TILE["BRIDGE"],
)
_HIGHLAND_PALETTE: tuple[int, ...] = (
    TILE["GRASS"],
    TILE["WALL"],
    TILE["RUINS"],
)
_COAST_PALETTE: tuple[int, ...] = (
    TILE["GRASS"],
    TILE["WATER"],
    TILE["BRIDGE"],
    TILE["RUINS"],
)
_ISLAND_PALETTE: tuple[int, ...] = (
    TILE["GRASS"],
    TILE["WATER"],
    TILE["BRIDGE"],
)
_BASIN_PALETTE: tuple[int, ...] = (
    TILE["GRASS"],
    TILE["WALL"],
    TILE["GATE"],
    TILE["RUINS"],
)


@dataclass(frozen=True, slots=True)
class Scenario:
    """Immutable scenario blueprint.

    Attributes
    ----------
    name
        Stable identifier (e.g. ``"temperate_plains"``) — used as the
        primary key in :data:`SCENARIOS`.
    tier
        Difficulty band: ``"L1"`` for tutorial-style frontier maps,
        ``"L2"`` for mid-difficulty (rivers, highlands), ``"L3"`` for
        hardest (coastal, archipelago, fortified).
    initial_workers
        Number of workers seeded at colony start (mirrors the JS
        ``INITIAL_WORKERS`` constants under ``EntityFactory.js``).
    width, height
        Grid dimensions in tiles. All six scenarios use
        ``(DEFAULT_WIDTH, DEFAULT_HEIGHT)`` = 96 × 72.
    tile_palette
        Tuple of tile ids that the carver is allowed to emit. Acts as a
        soft contract for the determinism audit (``rugged_highlands`` may
        emit ``WALL``; ``temperate_plains`` may not).
    weather_seed_offset, event_seed_offset
        Additive offsets applied to the run seed before constructing
        weather / event sub-streams. Lets two scenarios share the run
        seed without sharing their stochastic noise.
    starts_food, starts_wood
        Initial resource stockpiles. Mirror ``STARTING_FOOD_BY_TEMPLATE``
        / ``STARTING_WOOD_BY_TEMPLATE`` from the JS source.
    stressors
        Per-scenario flag dict — keys may include ``"raids"``,
        ``"storms"``, ``"floods"``, ``"chokepoints"``. The values are
        booleans (True if that stressor is enabled).
    """

    name: str
    tier: Tier
    initial_workers: int
    width: int
    height: int
    tile_palette: tuple[int, ...]
    weather_seed_offset: int
    event_seed_offset: int
    starts_food: int
    starts_wood: int
    stressors: MappingProxyType[str, bool]


def _f(d: dict[str, bool]) -> MappingProxyType[str, bool]:
    return MappingProxyType(dict(d))


# The 6 immutable scenario blueprints. Order matches the JS
# ``MAP_TEMPLATES`` array.
_SCENARIO_LIST: tuple[Scenario, ...] = (
    Scenario(
        name="temperate_plains",
        tier="L1",
        initial_workers=4,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        tile_palette=_GRASS_PALETTE,
        weather_seed_offset=0,
        event_seed_offset=0,
        starts_food=320,
        starts_wood=35,
        stressors=_f({"raids": True, "storms": False, "chokepoints": False}),
    ),
    Scenario(
        name="fertile_riverlands",
        tier="L2",
        initial_workers=4,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        tile_palette=_RIVER_PALETTE,
        weather_seed_offset=997,
        event_seed_offset=1009,
        starts_food=380,
        starts_wood=48,
        stressors=_f(
            {"raids": True, "storms": True, "floods": True, "chokepoints": False}
        ),
    ),
    Scenario(
        name="rugged_highlands",
        tier="L2",
        initial_workers=4,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        tile_palette=_HIGHLAND_PALETTE,
        weather_seed_offset=1471,
        event_seed_offset=1483,
        starts_food=320,
        starts_wood=48,
        stressors=_f({"raids": True, "storms": False, "chokepoints": True}),
    ),
    Scenario(
        name="coastal_ocean",
        tier="L3",
        initial_workers=4,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        tile_palette=_COAST_PALETTE,
        weather_seed_offset=2039,
        event_seed_offset=2053,
        starts_food=380,
        starts_wood=34,
        stressors=_f(
            {"raids": True, "storms": True, "chokepoints": True}
        ),
    ),
    Scenario(
        name="archipelago_isles",
        tier="L3",
        initial_workers=4,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        tile_palette=_ISLAND_PALETTE,
        weather_seed_offset=2543,
        event_seed_offset=2551,
        starts_food=360,
        starts_wood=34,
        stressors=_f(
            {"raids": True, "storms": True, "chokepoints": True}
        ),
    ),
    Scenario(
        name="fortified_basin",
        tier="L3",
        initial_workers=4,
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
        tile_palette=_BASIN_PALETTE,
        weather_seed_offset=3001,
        event_seed_offset=3019,
        starts_food=360,
        starts_wood=48,
        stressors=_f({"raids": True, "storms": False, "chokepoints": True}),
    ),
)

# Immutable lookup. ``MappingProxyType`` so user code cannot mutate the
# scenario registry at runtime.
SCENARIOS: MappingProxyType[str, Scenario] = MappingProxyType(
    {s.name: s for s in _SCENARIO_LIST}
)


# ---------------------------------------------------------------------------
# Mutable per-run state for the scenario layer.
# ---------------------------------------------------------------------------


@dataclass
class ScenarioState:
    """Mutable runtime state attached to a scenario.

    The JS source spreads this across ``state.gameplay.scenario`` (anchor
    coords, route links, depot zones, weather focus, event focus). We
    consolidate into one object so the simulation harness can swap
    scenarios without poking at the global state tree.

    Attributes
    ----------
    name
        Source scenario name.
    seed
        The run seed that produced this scenario's grid.
    anchors
        Dict of ``{ name: (x, z) }`` — for example ``"coreWarehouse"``,
        ``"eastDepot"``. Populated by the per-family carver.
    weather_seed
        Effective seed for the WeatherSystem (``seed + scenario.weather_seed_offset``).
    event_seed
        Effective seed for the WorldEventSystem.
    initial_resources
        ``{"food": int, "wood": int, "stone": int}`` — seeded from
        scenario blueprint plus a default ``stone=15``.
    """

    name: str
    seed: int
    anchors: dict[str, tuple[int, int]] = field(default_factory=dict)
    weather_seed: int = 0
    event_seed: int = 0
    initial_resources: dict[str, int] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# ScenarioFactory
# ---------------------------------------------------------------------------


def _carve_water_band(
    grid: Grid, rng: SeededRng, *, vertical: bool = True, width_frac: float = 0.05
) -> None:
    """Carve a thin water band (river / inlet) across the grid.

    Deterministic when fed a seeded RNG. The band width is ``max(1,
    width_frac * min(w, h))`` and the position oscillates around the
    grid centre by ±20% of the perpendicular dimension.
    """
    band_w = max(1, int(width_frac * min(grid.width, grid.height)))
    if vertical:
        centre_x = grid.width // 2 + rng.next_int(-grid.width // 5, grid.width // 5)
        for z in range(grid.height):
            wiggle = rng.next_int(-1, 1)
            x_start = max(0, min(grid.width - 1, centre_x + wiggle))
            for offset in range(band_w):
                x = x_start + offset
                if x < grid.width:
                    grid.tiles[z, x] = TILE["WATER"]
    else:
        centre_z = grid.height // 2 + rng.next_int(-grid.height // 5, grid.height // 5)
        for x in range(grid.width):
            wiggle = rng.next_int(-1, 1)
            z_start = max(0, min(grid.height - 1, centre_z + wiggle))
            for offset in range(band_w):
                z = z_start + offset
                if z < grid.height:
                    grid.tiles[z, x] = TILE["WATER"]
    grid.bump_version()


def _carve_island_water(grid: Grid, rng: SeededRng, *, coverage: float = 0.35) -> None:
    """Carve scattered water cells to produce an island/archipelago feel.

    Uses a seeded ``rng.next()`` per cell so the resulting grid is fully
    reproducible without reaching into private bit-generator state.
    """
    edge_norm = max(1, min(grid.width, grid.height) // 3)
    for z in range(grid.height):
        for x in range(grid.width):
            if not rng.chance(coverage):
                continue
            # Distance to nearest edge (normalized [0..1]).
            edge_dist = min(x, grid.width - 1 - x, z, grid.height - 1 - z)
            edge_prob = 1.0 - (edge_dist / edge_norm)
            if edge_prob <= 0:
                continue
            if rng.chance(edge_prob):
                grid.tiles[z, x] = TILE["WATER"]
    grid.bump_version()


def _carve_highland_walls(grid: Grid, rng: SeededRng, *, density: float = 0.04) -> None:
    """Drop short wall ridges to simulate highland chokepoints.

    Deterministic under a seeded RNG: we sample ``ceil(density * n)``
    cells and grow a 2-cell ridge from each.
    """
    n_ridges = max(1, int(density * grid.width * grid.height / 10))
    for _ in range(n_ridges):
        cx = rng.next_int(2, grid.width - 3)
        cz = rng.next_int(2, grid.height - 3)
        # Pick a horizontal or vertical ridge direction.
        horizontal = rng.chance(0.5)
        length = rng.next_int(2, 4)
        for step in range(length):
            if horizontal:
                x = min(grid.width - 1, cx + step)
                grid.tiles[cz, x] = TILE["WALL"]
            else:
                z = min(grid.height - 1, cz + step)
                grid.tiles[z, cx] = TILE["WALL"]
    grid.bump_version()


def _carve_basin_walls(grid: Grid, rng: SeededRng) -> None:
    """Stamp a fortified perimeter with two gates."""
    margin = 4
    # Top and bottom walls
    for x in range(margin, grid.width - margin):
        grid.tiles[margin, x] = TILE["WALL"]
        grid.tiles[grid.height - margin - 1, x] = TILE["WALL"]
    # Left and right walls
    for z in range(margin, grid.height - margin):
        grid.tiles[z, margin] = TILE["WALL"]
        grid.tiles[z, grid.width - margin - 1] = TILE["WALL"]
    # Two gates (north and south)
    north_gate_x = grid.width // 2 + rng.next_int(-2, 2)
    south_gate_x = grid.width // 2 + rng.next_int(-2, 2)
    grid.tiles[margin, north_gate_x] = TILE["GATE"]
    grid.tiles[grid.height - margin - 1, south_gate_x] = TILE["GATE"]
    grid.bump_version()


def _stamp_anchors(
    grid: Grid, scenario: Scenario, rng: SeededRng
) -> dict[str, tuple[int, int]]:
    """Stamp anchor tiles (core warehouse + 1-2 depot/outpost markers).

    The returned dict matches the JS ``scenario.anchors`` schema used by
    the event director (e.g. for animal-migration and bandit-raid target
    selection).
    """
    cx = grid.width // 2
    cz = grid.height // 2
    # Find a passable centre near the geometric centre.
    for delta in range(grid.width + grid.height):
        for dx in range(-delta, delta + 1):
            for dz in range(-delta, delta + 1):
                if abs(dx) != delta and abs(dz) != delta:
                    continue
                nx = cx + dx
                nz = cz + dz
                if (
                    0 <= nx < grid.width
                    and 0 <= nz < grid.height
                    and grid.is_passable(nx, nz)
                ):
                    cx, cz = nx, nz
                    break
            else:
                continue
            break
        else:
            continue
        break
    grid.set_tile(cx, cz, TILE["WAREHOUSE"])
    # East depot anchor (used by trade-caravan reward scaling test).
    ex = min(grid.width - 4, cx + 8)
    ez = cz + rng.next_int(-2, 2)
    ez = max(2, min(grid.height - 3, ez))
    # West outpost.
    wx = max(3, cx - 8)
    wz = cz + rng.next_int(-2, 2)
    wz = max(2, min(grid.height - 3, wz))
    return {
        "coreWarehouse": (cx, cz),
        "eastDepot": (ex, ez),
        "westOutpost": (wx, wz),
    }


class ScenarioFactory:
    """Factory for instantiating one of the 6 scenario blueprints.

    Use as a stateless callable:

    >>> grid, sstate = ScenarioFactory.build("temperate_plains", seed=0xC0FFEE)
    >>> grid.width, grid.height
    (96, 72)
    >>> sstate.name
    'temperate_plains'
    """

    @staticmethod
    def build(
        name: str,
        seed: int,
        *,
        deterministic: bool = True,
    ) -> tuple[Grid, ScenarioState]:
        """Construct a :class:`Grid` + :class:`ScenarioState` pair.

        Parameters
        ----------
        name
            Scenario blueprint name (see :data:`SCENARIOS`).
        seed
            Run seed. Same seed × same scenario reproduces an identical
            ``Grid.serialize_first_n_chars()`` fingerprint.
        deterministic
            When ``True`` (default), no wall-clock / random sources may
            sneak into the build. This is the academic-benchmark contract.

        Raises
        ------
        KeyError
            If ``name`` is not in :data:`SCENARIOS`.
        """
        if name not in SCENARIOS:
            raise KeyError(
                f"unknown scenario {name!r}; valid names: {sorted(SCENARIOS)}"
            )
        scenario = SCENARIOS[name]
        # We deliberately re-seed off the scenario name so distinct
        # scenarios with the same `seed` produce visibly distinct maps.
        rng = SeededRng(seed=seed).derive(f"scenario:{name}")
        grid = Grid(
            width=scenario.width,
            height=scenario.height,
            seed=seed,
            tile_size=DEFAULT_TILE_SIZE,
            fill=TILE["GRASS"],
            template_id=name,
        )

        # Per-scenario terrain stamping.
        if name == "temperate_plains":
            # Pure grass, no extra carving. Deterministic placeholder
            # variance: scatter ~12 RUINS tiles from the seeded rng so
            # distinct seeds produce visibly distinct grids.
            for _ in range(12):
                rx = rng.next_int(4, grid.width - 5)
                rz = rng.next_int(4, grid.height - 5)
                grid.set_tile(rx, rz, TILE["RUINS"])
        elif name == "fertile_riverlands":
            _carve_water_band(grid, rng, vertical=True, width_frac=0.04)
        elif name == "rugged_highlands":
            _carve_highland_walls(grid, rng, density=0.05)
        elif name == "coastal_ocean":
            # An east-side ocean band.
            band_w = max(3, grid.width // 4)
            for z in range(grid.height):
                for offset in range(band_w):
                    x = grid.width - 1 - offset
                    if x >= 0:
                        grid.tiles[z, x] = TILE["WATER"]
            grid.bump_version()
        elif name == "archipelago_isles":
            _carve_island_water(grid, rng, coverage=0.30)
        elif name == "fortified_basin":
            _carve_basin_walls(grid, rng)
        else:  # pragma: no cover - guarded by KeyError above
            raise AssertionError(f"unreachable scenario branch: {name}")

        anchors = _stamp_anchors(grid, scenario, rng)

        sstate = ScenarioState(
            name=name,
            seed=int(seed),
            anchors=anchors,
            weather_seed=int(seed) + scenario.weather_seed_offset,
            event_seed=int(seed) + scenario.event_seed_offset,
            initial_resources={
                "food": scenario.starts_food,
                "wood": scenario.starts_wood,
                "stone": 15,
            },
        )
        _ = deterministic  # reserved for future non-deterministic branches
        return grid, sstate

    @staticmethod
    def names() -> tuple[str, ...]:
        """Return the sorted tuple of scenario names."""
        return tuple(sorted(SCENARIOS.keys()))


def _validate_scenario_registry() -> None:
    """Sanity check: 6 scenarios, no duplicate names, all tiers in {L1,L2,L3}."""
    assert len(SCENARIOS) == 6, f"expected 6 scenarios, got {len(SCENARIOS)}"
    names = list(SCENARIOS.keys())
    assert len(set(names)) == 6, f"duplicate scenario name(s): {names}"
    for s in SCENARIOS.values():
        assert s.tier in ("L1", "L2", "L3"), f"invalid tier on {s.name}: {s.tier}"


_validate_scenario_registry()
