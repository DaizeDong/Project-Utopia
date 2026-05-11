"""World subpackage (port of ``src/world/``).

Exports the four core building blocks of the world layer:

* :class:`project_utopia.world.grid.Grid` — versioned tile grid.
* :class:`project_utopia.world.scenarios.ScenarioFactory` — 6 scenario
  blueprints + factory.
* :class:`project_utopia.world.weather.WeatherSystem` — deterministic
  seasonal weather director.
* :class:`project_utopia.world.events.WorldEventSystem` — queue/active
  event director (NOT the LLM environment director; that lives under
  :mod:`project_utopia.simulation.ai.director`).
"""

from __future__ import annotations

from .events import (
    EventType,
    WorldEvent,
    WorldEventState,
    WorldEventSystem,
    enqueue_event,
)
from .grid import (
    DEFAULT_HEIGHT,
    DEFAULT_TILE_SIZE,
    DEFAULT_WIDTH,
    MOVE_DIRECTIONS_4,
    TILE,
    TILE_INFO,
    Grid,
    TilePoint,
    in_bounds,
    manhattan,
    tile_to_world,
    to_index,
    world_to_tile,
)
from .scenarios import SCENARIOS, Scenario, ScenarioFactory, ScenarioState, Tier
from .weather import (
    WEATHER_MOVE_COST,
    Weather,
    WeatherState,
    WeatherSystem,
    weather_move_cost_multiplier,
)

__all__ = [
    "DEFAULT_HEIGHT",
    "DEFAULT_TILE_SIZE",
    "DEFAULT_WIDTH",
    "MOVE_DIRECTIONS_4",
    "SCENARIOS",
    "TILE",
    "TILE_INFO",
    "WEATHER_MOVE_COST",
    "EventType",
    "Grid",
    "Scenario",
    "ScenarioFactory",
    "ScenarioState",
    "Tier",
    "TilePoint",
    "Weather",
    "WeatherState",
    "WeatherSystem",
    "WorldEvent",
    "WorldEventState",
    "WorldEventSystem",
    "enqueue_event",
    "in_bounds",
    "manhattan",
    "tile_to_world",
    "to_index",
    "weather_move_cost_multiplier",
    "world_to_tile",
]
