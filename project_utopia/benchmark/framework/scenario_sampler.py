"""Stratified scenario sampler (port of ``ScenarioSampler.js``).

Uses a self-contained ``mulberry32`` RNG that matches the JS source bit-for-bit,
so the *same masterSeed* yields the *same scenario stream* across both ports.
This is the one place we intentionally keep the legacy RNG instead of PCG64 —
it preserves cross-language fixture equivalence for scenario tables already
committed to the repo.
"""

from __future__ import annotations

import math
from types import MappingProxyType
from typing import Any, Callable

__all__ = [
    "EDGE_CASES",
    "SCENARIO_SPACE",
    "compute_difficulty",
    "generate_scenarios",
    "mulberry32",
    "scenario_to_preset",
]


SCENARIO_SPACE: MappingProxyType[str, dict[str, Any]] = MappingProxyType(
    {
        "templateId": {
            "type": "categorical",
            "values": (
                "temperate_plains",
                "rugged_highlands",
                "archipelago_isles",
                "coastal_ocean",
                "fertile_riverlands",
                "fortified_basin",
            ),
        },
        "seed": {"type": "uniform_int", "min": 1, "max": 2**31},
        "food": {"type": "log_uniform", "min": 5, "max": 200},
        "wood": {"type": "log_uniform", "min": 3, "max": 150},
        "stone": {"type": "uniform", "min": 0, "max": 40},
        "herbs": {"type": "uniform", "min": 0, "max": 25},
        "workerDelta": {"type": "uniform_int", "min": -8, "max": 10},
        "threat": {"type": "uniform", "min": 0, "max": 100},
        "predators": {"type": "uniform_int", "min": 0, "max": 6},
        "weather": {"type": "categorical", "values": ("clear", "storm", "drought")},
        "weatherDuration": {"type": "uniform_int", "min": 10, "max": 40},
    }
)


def mulberry32(seed: int) -> Callable[[], float]:
    """Port of the JS ``mulberry32`` PRNG (32-bit, bit-identical to JS)."""
    state = seed | 0

    def _rng() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = (state ^ (state >> 15)) * (1 | state) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t))) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return _rng


def _sample_param(spec: dict[str, Any], rng: Callable[[], float]) -> Any:
    t = spec.get("type")
    if t == "categorical":
        values = spec["values"]
        return values[math.floor(rng() * len(values))]
    if t == "uniform_int":
        return spec["min"] + math.floor(rng() * (spec["max"] - spec["min"] + 1))
    if t == "uniform":
        return spec["min"] + rng() * (spec["max"] - spec["min"])
    if t == "log_uniform":
        return math.exp(
            math.log(spec["min"]) + rng() * (math.log(spec["max"]) - math.log(spec["min"]))
        )
    return 0


def compute_difficulty(scenario: dict[str, Any]) -> float:
    """Difficulty heuristic — port of JS ``computeDifficulty``."""
    avg_resource = (scenario["food"] + scenario["wood"]) / 2
    scarcity = 1 - min(1, avg_resource / 80)
    threat_norm = float(scenario.get("threat", 0)) / 100
    worker_delta = scenario.get("workerDelta", 0)
    population_stress = min(1, -worker_delta / 8) if worker_delta < 0 else 0
    weather = scenario.get("weather", "clear")
    weather_penalty = 0.3 if weather == "storm" else 0.2 if weather == "drought" else 0
    return min(
        1.0,
        0.35 * scarcity
        + 0.25 * threat_norm
        + 0.2 * population_stress
        + 0.2 * weather_penalty,
    )


def scenario_to_preset(scenario: dict[str, Any]) -> dict[str, Any]:
    preset: dict[str, Any] = {
        "id": f"gen_{scenario['seed']}",
        "label": f"Generated (D={compute_difficulty(scenario):.2f})",
        "templateId": scenario["templateId"],
        "category": "generated",
        "resources": {
            "food": round(scenario["food"]),
            "wood": round(scenario["wood"]),
            "stone": round(scenario["stone"]),
            "herbs": round(scenario["herbs"]),
        },
    }
    if scenario.get("threat", 0) > 0:
        preset["threat"] = round(scenario["threat"])
    if scenario.get("predators", 0) > 0:
        preset["extraPredators"] = scenario["predators"]
    wd = scenario.get("workerDelta", 0)
    if wd > 0:
        preset["extraWorkers"] = wd
    if wd < 0:
        preset["removeWorkers"] = -wd
    if scenario.get("weather", "clear") != "clear":
        preset["weather"] = scenario["weather"]
        preset["weatherDuration"] = scenario["weatherDuration"]
    return preset


def generate_scenarios(count: int, master_seed: int = 12345) -> list[dict[str, Any]]:
    """Stratified-difficulty scenario generator."""
    bins = ("trivial", "easy", "medium", "hard", "extreme")
    bin_ranges = (
        (0.0, 0.15),
        (0.15, 0.3),
        (0.3, 0.45),
        (0.45, 0.65),
        (0.65, 1.01),
    )
    per_bin = math.ceil(count / len(bins))
    rng = mulberry32(master_seed)
    results: list[dict[str, Any]] = []
    for b_idx, (lo, hi) in enumerate(bin_ranges):
        found = 0
        attempts = 0
        while found < per_bin and attempts < per_bin * 500:
            attempts += 1
            scenario: dict[str, Any] = {}
            for key, spec in SCENARIO_SPACE.items():
                scenario[key] = _sample_param(dict(spec), rng)
            d = compute_difficulty(scenario)
            if lo <= d < hi:
                preset = scenario_to_preset(scenario)
                results.append(
                    {"scenario": scenario, "preset": preset, "difficulty": d, "bin": bins[b_idx]}
                )
                found += 1
    return results[:count]


EDGE_CASES: tuple[MappingProxyType[str, Any], ...] = tuple(
    MappingProxyType(d)  # type: ignore[arg-type]
    for d in (
        {
            "id": "edge_starvation",
            "templateId": "temperate_plains",
            "resources": {"food": 0, "wood": 10},
            "removeWorkers": 6,
            "category": "edge",
        },
        {
            "id": "edge_overpop",
            "templateId": "temperate_plains",
            "resources": {"food": 15, "wood": 10},
            "extraWorkers": 15,
            "category": "edge",
        },
        {
            "id": "edge_no_wood",
            "templateId": "archipelago_isles",
            "resources": {"food": 50, "wood": 0},
            "category": "edge",
        },
        {
            "id": "edge_max_threat",
            "templateId": "fortified_basin",
            "resources": {"food": 40, "wood": 30},
            "threat": 100,
            "extraPredators": 6,
            "category": "edge",
        },
        {
            "id": "edge_storm_scarce",
            "templateId": "rugged_highlands",
            "resources": {"food": 10, "wood": 8, "stone": 2},
            "weather": "storm",
            "weatherDuration": 40,
            "category": "edge",
        },
    )
)
