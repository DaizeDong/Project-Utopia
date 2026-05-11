"""Per-tick economy snapshot helpers (port of ``EconomyTelemetry.js``).

Pure-function emitters consumed by :mod:`project_utopia.simulation.meta`
dev-index, the benchmark scoring engine, and the LLM observation payload
builder. All exports are side-effect free.
"""

from __future__ import annotations

from typing import Any

from project_utopia.world.grid import TILE, Grid

__all__ = [
    "collect_economy_snapshot",
    "score_all_dims",
    "score_population",
    "score_economy",
    "score_infrastructure",
    "score_production",
    "score_defense",
    "score_resilience",
    "DEFAULT_RESOURCE_TARGETS",
]


DEFAULT_RESOURCE_TARGETS = {"food": 200.0, "wood": 150.0, "stone": 100.0}


_ECON_WANTED_TILES: tuple[int, ...] = (
    TILE["ROAD"],
    TILE["WAREHOUSE"],
    TILE["WALL"],
    TILE["FARM"],
    TILE["LUMBER"],
    TILE["QUARRY"],
)


def _clamp_0_100(v: float) -> float:
    if v != v:  # NaN
        return 0.0
    return max(0.0, min(100.0, float(v)))


def _safe_num(v: Any, default: float = 0.0) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f:
        return default
    return f


def _tally_tiles(grid: Grid) -> dict[int, int]:
    """Count tiles by id (cheap O(W*H) pass)."""
    counts: dict[int, int] = {t: 0 for t in _ECON_WANTED_TILES}
    if not isinstance(grid, Grid):
        return counts
    flat = grid.tiles.ravel().tolist()
    for v in flat:
        if v in counts:
            counts[v] += 1
    return counts


def collect_economy_snapshot(state: dict[str, Any]) -> dict[str, Any]:
    """Collect the per-tick economy snapshot. Pure: reads only from ``state``."""
    agents = state.get("agents") or []
    grid = state.get("grid")
    map_tile_area = int(grid.width * grid.height) if isinstance(grid, Grid) else 0

    agent_count = 0
    militia_count = 0
    worker_count = 0
    hunger_sum = 0.0
    rest_sum = 0.0
    morale_sum = 0.0
    for a in agents:
        if not isinstance(a, dict) or a.get("alive") is False:
            continue
        t = a.get("type")
        if t not in ("WORKER", "VISITOR"):
            continue
        agent_count += 1
        role = str(a.get("role", "")).upper()
        if role == "MILITIA":
            militia_count += 1
        if t == "WORKER":
            worker_count += 1
            hunger_sum += _safe_num(a.get("hunger"), 1.0)
            rest_sum += _safe_num(a.get("rest"), 1.0)
            morale_sum += _safe_num(a.get("morale"), 1.0)

    if worker_count > 0:
        distress = {
            "hunger": max(0.0, 1.0 - hunger_sum / worker_count),
            "fatigue": max(0.0, 1.0 - rest_sum / worker_count),
            "morale": max(0.0, 1.0 - morale_sum / worker_count),
        }
    else:
        distress = {"hunger": 0.0, "fatigue": 0.0, "morale": 0.0}

    r = state.get("resources") or {}
    resources = {
        "food": _safe_num(r.get("food"), 0.0),
        "wood": _safe_num(r.get("wood"), 0.0),
        "stone": _safe_num(r.get("stone"), 0.0),
    }

    tally = _tally_tiles(grid) if isinstance(grid, Grid) else {}
    tile_counts = {
        "road": tally.get(TILE["ROAD"], 0),
        "warehouse": tally.get(TILE["WAREHOUSE"], 0),
        "wall": tally.get(TILE["WALL"], 0),
        "farm": tally.get(TILE["FARM"], 0),
        "lumber": tally.get(TILE["LUMBER"], 0),
        "quarry": tally.get(TILE["QUARRY"], 0),
    }

    return {
        "agentCount": agent_count,
        "militiaCount": militia_count,
        "resources": resources,
        "tileCounts": tile_counts,
        "mapTileArea": map_tile_area,
        "distress": distress,
    }


def score_population(snapshot: dict[str, Any], target: float = 30.0) -> float:
    if target <= 0:
        return 0.0
    ratio = float(snapshot.get("agentCount", 0)) / target
    score = ratio * 80.0
    return max(0.0, min(200.0, score))


def score_economy(
    snapshot: dict[str, Any],
    targets: dict[str, float] | None = None,
) -> float:
    tgts = targets or DEFAULT_RESOURCE_TARGETS
    keys = ("food", "wood", "stone")
    sum_ = 0.0
    weight = 0
    resources = snapshot.get("resources") or {}
    for k in keys:
        tgt = float(tgts.get(k, DEFAULT_RESOURCE_TARGETS[k]))
        if tgt <= 0:
            continue
        have = float(resources.get(k, 0.0))
        score = min(100.0, (have / tgt) * 80.0)
        sum_ += max(0.0, score)
        weight += 1
    if weight == 0:
        return 0.0
    return _clamp_0_100(sum_ / weight)


def score_infrastructure(snapshot: dict[str, Any]) -> float:
    tc = snapshot.get("tileCounts") or {}
    area = int(snapshot.get("mapTileArea", 0))
    if area <= 0:
        return 0.0
    roads = int(tc.get("road", 0))
    warehouses = int(tc.get("warehouse", 0))
    coverage = (roads + warehouses) / area
    return _clamp_0_100((coverage / 0.06) * 80.0)


def score_production(snapshot: dict[str, Any], target: float = 24.0) -> float:
    if target <= 0:
        return 0.0
    tc = snapshot.get("tileCounts") or {}
    producers = (
        int(tc.get("farm", 0))
        + int(tc.get("lumber", 0))
        + int(tc.get("quarry", 0))
    )
    return _clamp_0_100((producers / target) * 80.0)


def score_defense(snapshot: dict[str, Any], target: float = 12.0) -> float:
    if target <= 0:
        return 0.0
    walls = int((snapshot.get("tileCounts") or {}).get("wall", 0))
    militia = int(snapshot.get("militiaCount", 0))
    defense_points = walls + militia * 2
    return _clamp_0_100((defense_points / target) * 80.0)


def score_resilience(snapshot: dict[str, Any]) -> float:
    d = snapshot.get("distress") or {"hunger": 0.0, "fatigue": 0.0, "morale": 0.0}
    mean_distress = (
        max(0.0, min(1.0, float(d.get("hunger", 0.0))))
        + max(0.0, min(1.0, float(d.get("fatigue", 0.0))))
        + max(0.0, min(1.0, float(d.get("morale", 0.0))))
    ) / 3.0
    return _clamp_0_100((1.0 - mean_distress) * 100.0)


def score_all_dims(snapshot: dict[str, Any]) -> dict[str, float]:
    return {
        "population": score_population(snapshot),
        "economy": score_economy(snapshot),
        "infrastructure": score_infrastructure(snapshot),
        "production": score_production(snapshot),
        "defense": score_defense(snapshot),
        "resilience": score_resilience(snapshot),
    }
