"""Top-level constants (port of ``src/config/constants.js``).

Frozen tables expose the simulation's enum-like surface (tile IDs, role
labels, weather names) plus the canonical ``SYSTEM_ORDER`` tick order
that :class:`~project_utopia.benchmark.framework.sim_harness.SimHarness`
reads to schedule subsystems.

All read-only mappings are wrapped in :class:`types.MappingProxyType`;
read-only sequences are tuples. ``Object.freeze`` (JS) has no exact
Python analog, but this combination is functionally equivalent for
downstream consumers — attempts to mutate raise ``TypeError``.

Phase 1 only exposed :data:`WEATHER` + :data:`EVENT_TYPE` here. Phase 2
extends the surface to cover the full enum set the dimension plugins,
audit tooling, and CLI driver need.
"""

from __future__ import annotations

from types import MappingProxyType

__all__ = [
    "ANIMAL_KIND",
    "ANIMAL_SPECIES",
    "DEFAULT_GRID",
    "ENTITY_TYPE",
    "EVENT_TYPE",
    "FEATURE_FLAGS",
    "FOG_STATE",
    "MOVE_DIRECTIONS_4",
    "NODE_FLAGS",
    "RESOURCE_TYPES",
    "ROLE",
    "SYSTEM_ORDER",
    "TILE",
    "TILE_INFO",
    "VISITOR_KIND",
    "WEATHER",
    "WORKER_DEFAULTS",
    "_test_set_feature_flag",
]


# ── Tile IDs ──────────────────────────────────────────────────────────

TILE: MappingProxyType[str, int] = MappingProxyType(
    {
        "GRASS": 0,
        "ROAD": 1,
        "FARM": 2,
        "LUMBER": 3,
        "WAREHOUSE": 4,
        "WALL": 5,
        "RUINS": 6,
        "WATER": 7,
        "QUARRY": 8,
        "HERB_GARDEN": 9,
        "KITCHEN": 10,
        "SMITHY": 11,
        "CLINIC": 12,
        "BRIDGE": 13,
        # v0.8.4 strategic walls + faction-aware gate. See
        # ``project_utopia.simulation.navigation.faction``.
        "GATE": 14,
    }
)


# ── Entity / role / weather enums ─────────────────────────────────────

ENTITY_TYPE: MappingProxyType[str, str] = MappingProxyType(
    {
        "WORKER": "WORKER",
        "VISITOR": "VISITOR",
        "ANIMAL": "ANIMAL",
    }
)

VISITOR_KIND: MappingProxyType[str, str] = MappingProxyType(
    {
        "TRADER": "TRADER",
        "SABOTEUR": "SABOTEUR",
    }
)

ANIMAL_KIND: MappingProxyType[str, str] = MappingProxyType(
    {
        "HERBIVORE": "HERBIVORE",
        "PREDATOR": "PREDATOR",
    }
)

ANIMAL_SPECIES: MappingProxyType[str, str] = MappingProxyType(
    {
        "DEER": "deer",
        "WOLF": "wolf",
        "BEAR": "bear",
        "RAIDER_BEAST": "raider_beast",
    }
)

ROLE: MappingProxyType[str, str] = MappingProxyType(
    {
        "FARM": "FARM",
        "WOOD": "WOOD",
        "HAUL": "HAUL",
        "STONE": "STONE",
        "HERBS": "HERBS",
        "COOK": "COOK",
        "SMITH": "SMITH",
        "HERBALIST": "HERBALIST",
        "GUARD": "GUARD",
        "BUILDER": "BUILDER",
    }
)

WEATHER: MappingProxyType[str, str] = MappingProxyType(
    {
        "CLEAR": "clear",
        "RAIN": "rain",
        "STORM": "storm",
        "DROUGHT": "drought",
        "WINTER": "winter",
    }
)

EVENT_TYPE: MappingProxyType[str, str] = MappingProxyType(
    {
        "ANIMAL_MIGRATION": "animalMigration",
        "BANDIT_RAID": "banditRaid",
        "TRADE_CARAVAN": "tradeCaravan",
        "MORALE_BREAK": "moraleBreak",
        "DISEASE_OUTBREAK": "diseaseOutbreak",
        "WILDFIRE": "wildfire",
    }
)


# ── Tile-state bitfields ──────────────────────────────────────────────

NODE_FLAGS: MappingProxyType[str, int] = MappingProxyType(
    {
        "NONE": 0,
        "FOREST": 1,
        "STONE": 2,
        "HERB": 4,
    }
)

FOG_STATE: MappingProxyType[str, int] = MappingProxyType(
    {
        "HIDDEN": 0,
        "EXPLORED": 1,
        "VISIBLE": 2,
    }
)


# ── Grid + tile-info defaults ────────────────────────────────────────

DEFAULT_GRID: MappingProxyType[str, int] = MappingProxyType(
    {
        "width": 96,
        "height": 72,
        "tileSize": 2,
    }
)


def _tile_info_entry(
    passable: bool, base_cost: float, height: float, color: int
) -> MappingProxyType[str, object]:
    return MappingProxyType(
        {
            "passable": passable,
            "baseCost": base_cost,
            "height": height,
            "color": color,
        }
    )


TILE_INFO: MappingProxyType[int, MappingProxyType[str, object]] = MappingProxyType(
    {
        TILE["GRASS"]: _tile_info_entry(True, 1.0, 0.04, 0x84C86A),
        TILE["ROAD"]: _tile_info_entry(True, 0.65, 0.025, 0xC8B39A),
        TILE["FARM"]: _tile_info_entry(True, 1.0, 0.09, 0xD9C86F),
        TILE["LUMBER"]: _tile_info_entry(True, 1.0, 0.11, 0x6EA85A),
        TILE["WAREHOUSE"]: _tile_info_entry(True, 1.0, 0.2, 0xCE9468),
        TILE["WALL"]: _tile_info_entry(False, 1000.0, 0.58, 0x9BA9B7),
        TILE["RUINS"]: _tile_info_entry(True, 1.6, 0.07, 0xB98B73),
        TILE["WATER"]: _tile_info_entry(False, 1000.0, 0.018, 0x69B4EA),
        TILE["QUARRY"]: _tile_info_entry(True, 1.2, 0.13, 0xA0896E),
        TILE["HERB_GARDEN"]: _tile_info_entry(True, 1.0, 0.08, 0x7BB86A),
        TILE["KITCHEN"]: _tile_info_entry(True, 1.0, 0.22, 0xD4A65A),
        TILE["SMITHY"]: _tile_info_entry(True, 1.0, 0.25, 0x8C7A6B),
        TILE["CLINIC"]: _tile_info_entry(True, 1.0, 0.22, 0xC4D8C0),
        TILE["BRIDGE"]: _tile_info_entry(True, 0.65, 0.04, 0x8B7D6B),
        TILE["GATE"]: _tile_info_entry(True, 0.85, 0.45, 0x8B6F47),
    }
)


# ── Movement direction lookup table (4-neighborhood) ─────────────────
# A tuple-of-tuples instead of a list-of-dicts so it stays immutable.

MOVE_DIRECTIONS_4: tuple[tuple[int, int], ...] = (
    (1, 0),
    (-1, 0),
    (0, 1),
    (0, -1),
)


# ── Canonical tick order (academic-benchmark frontier) ───────────────
# Animal / Wildlife / Processing / Progression systems were removed in
# S3 (D2 / D4 / D8) and are not present here.

SYSTEM_ORDER: tuple[str, ...] = (
    "SimulationClock",
    "VisibilitySystem",
    "DevIndexSystem",
    "RaidEscalatorSystem",
    "EventDirectorSystem",
    "AgentDirectorSystem",
    "RoleAssignmentSystem",
    "PopulationGrowthSystem",
    "EnvironmentDirectorSystem",
    "WeatherSystem",
    "WorldEventSystem",
    "TileStateSystem",
    "NPCBrainSystem",
    "WarehouseQueueSystem",
    "WorkerAISystem",
    "ConstructionSystem",
    "VisitorAISystem",
    "MortalitySystem",
    "BoidsSystem",
    "ResourceSystem",
)


# ── Feature flags (test-only setter retained for parity) ─────────────
# JS exposes ``FEATURE_FLAGS.USE_FSM`` via a getter so tests can flip
# the underlying state. We mirror that with a small frozen view that
# reads the module-private mutable cell.

_USE_FSM: bool = True


class _FeatureFlagsView:
    """Read-only namespace exposing the live ``USE_FSM`` flag."""

    __slots__ = ()

    @property
    def USE_FSM(self) -> bool:  # noqa: N802 — JS-compat name
        return _USE_FSM

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError(
            f"FEATURE_FLAGS is frozen; use _test_set_feature_flag({name!r}) in tests"
        )


FEATURE_FLAGS = _FeatureFlagsView()


def _test_set_feature_flag(name: str, value: bool) -> None:
    """Test-only setter; do not call from production paths."""

    global _USE_FSM
    if name == "USE_FSM":
        _USE_FSM = bool(value)


# ── Resource axis tuple (worker carry slots) ─────────────────────────
# JS treats the 4-tuple ``{food, wood, stone, herbs}`` as a convention
# without a single canonical constant; we expose it explicitly so the
# Python port has one source of truth.

RESOURCE_TYPES: tuple[str, ...] = ("food", "wood", "stone", "herbs")


WORKER_DEFAULTS: MappingProxyType[str, object] = MappingProxyType(
    {
        "carryCapacity": 8,
        "moveSpeed": 1.0,
        "hungerStart": 1.0,
        "maxHp": 100,
    }
)
