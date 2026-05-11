"""Weather model (port of ``src/world/weather/WeatherSystem.js``).

The JS source carries a seasonal weighted-random weather director that also
writes a per-tile hazard penalty into ``state.weather.hazardPenaltyByKey``
(consumed by AStar's dynamic-cost path). The Python port keeps the seasonal
director and the move-cost multiplier table; the scenario-focus hazard
overlay is deferred to a later phase since it cross-cuts with
``ScenarioState.weather_focus`` which is intentionally minimal in the
Python port.

Weather enum
------------
* ``clear`` — baseline
* ``rain``    — mild slowdown
* ``storm``   — severe slowdown, raid-friendly
* ``fog``     — minor slowdown, scout penalty (new Python-only state)
* ``drought`` — farm penalty
* ``blizzard`` — winter analogue, severe slowdown + farm penalty

JS used 5 weathers (``CLEAR / RAIN / STORM / DROUGHT / WINTER``); the
spec for this port asks for 6 (`fog` / `blizzard`). We map ``winter`` →
``blizzard`` and add ``fog`` as a new value.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType

from project_utopia.app.rng import SeededRng

__all__ = [
    "WEATHER_MOVE_COST",
    "Weather",
    "WeatherState",
    "WeatherSystem",
    "weather_move_cost_multiplier",
]


class Weather(str, Enum):
    """The 6 weather types tracked by the Python port.

    The string values match the JS source where possible (``clear``,
    ``rain``, ``storm``, ``drought``) and rename ``winter`` →
    ``blizzard``. ``fog`` is new (no JS counterpart).
    """

    CLEAR = "clear"
    RAIN = "rain"
    STORM = "storm"
    FOG = "fog"
    DROUGHT = "drought"
    BLIZZARD = "blizzard"


# Per-weather move-cost multiplier. Mirrors the ``WEATHER_MODIFIERS`` table
# in JS ``src/config/balance.js`` (values copied verbatim where the weather
# enum overlaps; ``fog`` is new and uses ``1.05``).
WEATHER_MOVE_COST: MappingProxyType[Weather, float] = MappingProxyType(
    {
        Weather.CLEAR: 1.0,
        Weather.RAIN: 1.22,
        Weather.STORM: 1.52,
        Weather.FOG: 1.05,
        Weather.DROUGHT: 1.18,
        Weather.BLIZZARD: 1.38,
    }
)


def weather_move_cost_multiplier(weather: Weather) -> float:
    """Return the move-cost multiplier applied while ``weather`` is active.

    Used by :class:`project_utopia.simulation.navigation.a_star.AStar` to
    inflate per-tile traversal costs.
    """
    return float(WEATHER_MOVE_COST.get(weather, 1.0))


# Seasonal weights — order: spring, summer, autumn, winter.
# Each season is a frozen mapping of ``Weather -> int weight``. Numbers
# match the JS ``SEASONS`` table verbatim; ``winter`` weight is reassigned
# to ``Weather.BLIZZARD``.
_SEASONS: tuple[dict[str, int | dict[Weather, int]], ...] = (
    {
        "name": "spring",
        "duration_sec": 60,
        "weights": {
            Weather.CLEAR: 50,
            Weather.RAIN: 40,
            Weather.STORM: 10,
            Weather.FOG: 5,
            Weather.DROUGHT: 0,
            Weather.BLIZZARD: 0,
        },
    },
    {
        "name": "summer",
        "duration_sec": 60,
        "weights": {
            Weather.CLEAR: 40,
            Weather.RAIN: 0,
            Weather.STORM: 20,
            Weather.FOG: 0,
            Weather.DROUGHT: 40,
            Weather.BLIZZARD: 0,
        },
    },
    {
        "name": "autumn",
        "duration_sec": 50,
        "weights": {
            Weather.CLEAR: 50,
            Weather.RAIN: 30,
            Weather.STORM: 10,
            Weather.FOG: 10,
            Weather.DROUGHT: 0,
            Weather.BLIZZARD: 0,
        },
    },
    {
        "name": "winter",
        "duration_sec": 50,
        "weights": {
            Weather.CLEAR: 20,
            Weather.RAIN: 0,
            Weather.STORM: 20,
            Weather.FOG: 0,
            Weather.DROUGHT: 0,
            Weather.BLIZZARD: 60,
        },
    },
)


# Per-weather duration in seconds (uniform within ``[min_sec, max_sec]``).
_WEATHER_DURATION: dict[Weather, tuple[int, int]] = {
    Weather.CLEAR: (36, 70),
    Weather.RAIN: (24, 44),
    Weather.STORM: (16, 32),
    Weather.FOG: (20, 36),
    Weather.DROUGHT: (24, 40),
    Weather.BLIZZARD: (28, 48),
}


def _pick_weather_from_weights(
    rng: SeededRng, weights: dict[Weather, int]
) -> Weather:
    """Weighted-random pick over the season's table."""
    items = [(w, max(0, int(v))) for w, v in weights.items()]
    total = sum(v for _, v in items)
    if total <= 0:
        return Weather.CLEAR
    roll = rng.next() * total
    for w, v in items:
        roll -= v
        if roll <= 0:
            return w
    return items[-1][0]


# ---------------------------------------------------------------------------
# State container
# ---------------------------------------------------------------------------


@dataclass
class WeatherState:
    """Mutable per-run weather state (mirrors ``state.weather`` in JS).

    Attributes
    ----------
    type
        Current weather. Defaults to ``CLEAR``.
    intensity
        ``[0, 1]`` magnitude — currently always 1.0 when active, 0.0 when
        ``CLEAR``. Reserved for future ramping.
    transition_progress
        ``[0, 1]`` ratio of how far the current weather phase has elapsed.
    time_left_sec
        Seconds remaining before the next pick.
    season
        Season name string (``"spring" | "summer" | "autumn" | "winter"``).
    season_progress
        ``[0, 1]`` ratio within the current season.
    move_cost_multiplier
        Cached value of ``weather_move_cost_multiplier(state.type)``.
    """

    type: Weather = Weather.CLEAR
    intensity: float = 0.0
    transition_progress: float = 0.0
    time_left_sec: float = 0.0
    season: str = "spring"
    season_progress: float = 0.0
    move_cost_multiplier: float = 1.0
    # Internal bookkeeping
    _season_index: int = 0
    _season_start_sec: float = field(default=-1.0, repr=False)
    _next_weather_at_sec: float = field(default=-1.0, repr=False)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------


class WeatherSystem:
    """Deterministic seasonal weather director.

    Constructed once per run. Drive via :meth:`tick`, supplying a
    :class:`SeededRng` and the simulation's current time-in-seconds.

    Examples
    --------
    >>> rng = SeededRng(seed=42).derive("weather")
    >>> ws = WeatherSystem()
    >>> state = WeatherState()
    >>> ws.tick(dt=0.5, rng=rng, state=state, now_sec=0.0)
    >>> isinstance(state.type, Weather)
    True
    """

    def __init__(self) -> None:
        self.name = "WeatherSystem"

    def tick(
        self,
        dt: float,
        rng: SeededRng,
        state: WeatherState,
        now_sec: float = 0.0,
    ) -> None:
        """Advance the weather state by ``dt`` seconds."""
        state.time_left_sec = max(0.0, state.time_left_sec - float(dt))

        # Initialise season on first tick
        if state._season_start_sec < 0:
            state._season_start_sec = float(now_sec)
            state._next_weather_at_sec = float(now_sec)
            season = _SEASONS[0]
            state.season = str(season["name"])
            state.season_progress = 0.0

        # Advance season
        season = _SEASONS[state._season_index]
        duration = float(season["duration_sec"])  # type: ignore[arg-type]
        elapsed = float(now_sec) - state._season_start_sec
        state.season_progress = min(1.0, elapsed / duration) if duration > 0 else 0.0
        if elapsed >= duration:
            state._season_index = (state._season_index + 1) % len(_SEASONS)
            state._season_start_sec = float(now_sec)
            state.season = str(_SEASONS[state._season_index]["name"])
            state.season_progress = 0.0

        if float(now_sec) < state._next_weather_at_sec:
            # Update transition_progress within the current weather phase.
            phase_total = max(0.001, float(now_sec) + state.time_left_sec
                              - (state._next_weather_at_sec - state.time_left_sec))
            state.transition_progress = max(
                0.0, min(1.0, 1.0 - state.time_left_sec / phase_total)
            )
            return

        # Time to roll a new weather
        current_season = _SEASONS[state._season_index]
        weights = current_season["weights"]  # type: ignore[assignment]
        weather = _pick_weather_from_weights(rng, weights)  # type: ignore[arg-type]
        lo, hi = _WEATHER_DURATION[weather]
        dur = float(lo) + rng.next() * float(hi - lo)
        state.type = weather
        state.intensity = 0.0 if weather == Weather.CLEAR else 1.0
        state.time_left_sec = dur
        state.transition_progress = 0.0
        state.move_cost_multiplier = weather_move_cost_multiplier(weather)
        state._next_weather_at_sec = float(now_sec) + dur
