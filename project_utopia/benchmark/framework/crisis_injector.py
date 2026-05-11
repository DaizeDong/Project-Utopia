"""CrisisInjector (port of ``CrisisInjector.js``).

Injects dynamic crises into a running simulation to test AI adaptability.
Tracks detection lag, recovery curve, and minimum-health depth per
injection. Pure logic + duck-typed state dict; no sim system dependencies.
"""

from __future__ import annotations

import json
import math
from typing import Any, Callable

__all__ = ["CRISIS_TYPES", "CrisisInjector"]


def _apply_drought(state: dict[str, Any]) -> None:
    weather = state.setdefault("weather", {})
    weather["current"] = "drought"
    weather["timeLeftSec"] = 60


def _detect_drought(out: Any) -> bool:
    if not isinstance(out, dict):
        return False
    env = out.get("environment") or {}
    return env.get("weather") == "drought" or env.get("weatherType") == "drought"


def _apply_predator_surge(state: dict[str, Any]) -> None:
    animals = state.setdefault("animals", [])
    template = next((a for a in animals if isinstance(a, dict) and a.get("kind") == "PREDATOR"), None)
    if template is None:
        return
    agents = state.get("agents") or []
    workers = [a for a in agents if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False]
    target = workers[0] if workers else template
    for i in range(3):
        angle = (i / 3) * 2 * math.pi
        animals.append(
            {
                **template,
                "id": f"crisis-pred-{i}",
                "x": float(target.get("x", 0)) + math.cos(angle) * 3,
                "z": float(target.get("z", 0)) + math.sin(angle) * 3,
                "vx": 0,
                "vz": 0,
                "path": None,
                "pathIndex": 0,
                "targetTile": None,
            }
        )


def _detect_predator_surge(out: Any) -> bool:
    if not isinstance(out, dict):
        return False
    defense = out.get("defense") or {}
    return (defense.get("predatorCount", 0) > 2) or (defense.get("activeSaboteurs", 0) > 0)


def _apply_resource_crash(state: dict[str, Any]) -> None:
    resources = state.setdefault("resources", {})
    resources["food"] = max(0.0, float(resources.get("food", 0)) * 0.1)
    resources["wood"] = max(0.0, float(resources.get("wood", 0)) * 0.1)


def _detect_resource_crash(out: Any) -> bool:
    if not isinstance(out, dict):
        return False
    food = (out.get("economy") or {}).get("food") or {}
    return (food.get("stock", 100) < 10) or (food.get("projectedZeroSec") is not None)


def _apply_epidemic(state: dict[str, Any]) -> None:
    state.setdefault("resources", {})["herbs"] = 0
    for agent in state.get("agents") or []:
        if isinstance(agent, dict) and agent.get("type") == "WORKER" and agent.get("alive", True) is not False:
            agent["hunger"] = max(0.0, float(agent.get("hunger", 0.8)) - 0.3)


def _detect_epidemic(out: Any) -> bool:
    if not isinstance(out, dict):
        return False
    herbs = (out.get("economy") or {}).get("herbs") or {}
    if herbs.get("stock", 10) < 2:
        return True
    blockers = (out.get("workforce") or {}).get("growthBlockers") or []
    return any(("herb" in b or "hunger" in b) for b in blockers if isinstance(b, str))


CRISIS_TYPES: dict[str, dict[str, Any]] = {
    "drought": {"label": "Drought", "apply": _apply_drought, "detect": _detect_drought},
    "predator_surge": {
        "label": "Predator Surge",
        "apply": _apply_predator_surge,
        "detect": _detect_predator_surge,
    },
    "resource_crash": {
        "label": "Resource Crash",
        "apply": _apply_resource_crash,
        "detect": _detect_resource_crash,
    },
    "epidemic": {
        "label": "Epidemic (herbs drain)",
        "apply": _apply_epidemic,
        "detect": _detect_epidemic,
    },
}


class CrisisInjector:
    __slots__ = (
        "_threshold",
        "_types",
        "_injections",
        "_current_injection",
        "_steady_count",
        "_last_strategy_hash",
        "_injection_index",
    )

    def __init__(self, opts: dict[str, Any] | None = None) -> None:
        opts = opts or {}
        self._threshold = int(opts.get("steady_state_threshold", 30))
        self._types = list(opts.get("crisis_types", list(CRISIS_TYPES.keys())))
        self._injections: list[dict[str, Any]] = []
        self._current_injection: dict[str, Any] | None = None
        self._steady_count = 0
        self._last_strategy_hash: str | None = None
        self._injection_index = 0

    def update(
        self,
        state: dict[str, Any],
        tick: int,
        perceiver_output: Any | None = None,
    ) -> None:
        h = self._compute_strategy_hash(state)
        if h == self._last_strategy_hash:
            self._steady_count += 1
        else:
            self._steady_count = 0
            self._last_strategy_hash = h
        if self._current_injection is not None:
            self._track_injection(state, tick, perceiver_output)
            return
        if (
            self._steady_count >= self._threshold
            and self._injection_index < len(self._types)
        ):
            self._inject(state, tick)

    @staticmethod
    def _compute_strategy_hash(state: dict[str, Any]) -> str:
        roles: dict[str, int] = {}
        for a in state.get("agents") or []:
            if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False:
                role = a.get("role", "idle")
                roles[role] = roles.get(role, 0) + 1
        # Use sorted keys for deterministic hashes (no Py dict-order reliance).
        return json.dumps(roles, sort_keys=True)

    def _inject(self, state: dict[str, Any], tick: int) -> None:
        type_name = self._types[self._injection_index]
        crisis = CRISIS_TYPES.get(type_name)
        if crisis is None:
            return
        baseline = self._capture_health(state)
        crisis["apply"](state)
        self._current_injection = {
            "type": type_name,
            "injectedAtTick": tick,
            "baseline": baseline,
            "detected": False,
            "detectionLag": None,
            "recoveryTicks": None,
            "minHealth": baseline["composite"],
            "responseActions": 0,
        }
        self._injection_index += 1
        self._steady_count = 0

    def _track_injection(
        self,
        state: dict[str, Any],
        tick: int,
        perceiver_output: Any | None,
    ) -> None:
        inj = self._current_injection
        assert inj is not None
        crisis = CRISIS_TYPES[inj["type"]]
        elapsed = tick - inj["injectedAtTick"]
        if not inj["detected"] and perceiver_output is not None and crisis["detect"](perceiver_output):
            inj["detected"] = True
            inj["detectionLag"] = elapsed
        health = self._capture_health(state)
        if health["composite"] < inj["minHealth"]:
            inj["minHealth"] = health["composite"]
        if (
            inj["recoveryTicks"] is None
            and health["composite"] >= inj["baseline"]["composite"] * 0.8
            and elapsed > 10
        ):
            inj["recoveryTicks"] = elapsed
        if elapsed >= 300:
            if inj["recoveryTicks"] is None:
                inj["recoveryTicks"] = 300
            self._injections.append({**inj})
            self._current_injection = None

    @staticmethod
    def _capture_health(state: dict[str, Any]) -> dict[str, Any]:
        resources = state.get("resources") or {}
        food = float(resources.get("food", 0) or 0)
        wood = float(resources.get("wood", 0) or 0)
        agents = state.get("agents") or []
        workers = sum(
            1
            for a in agents
            if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False
        )
        gameplay = state.get("gameplay") or {}
        prosperity = float(gameplay.get("prosperity", 0) or 0)
        threat = float(gameplay.get("threat", 0) or 0)
        composite = (food / 100 + wood / 100 + workers / 15 + prosperity / 100 + (1 - threat / 100)) / 5
        composite = max(0.0, min(1.0, composite))
        return {
            "food": food,
            "wood": wood,
            "workers": workers,
            "prosperity": prosperity,
            "threat": threat,
            "composite": composite,
        }

    def score_injection(self, injection: dict[str, Any]) -> dict[str, Any]:
        det_lag = injection.get("detectionLag") if injection.get("detectionLag") is not None else 300
        detection_score = max(0.0, 1 - float(det_lag) / 100)
        recovery_score = max(0.0, 1 - float(injection.get("recoveryTicks") or 300) / 300)
        baseline_comp = injection["baseline"]["composite"]
        drop_ratio = (
            (baseline_comp - injection["minHealth"]) / baseline_comp
            if baseline_comp > 0
            else 0.0
        )
        resilience_score = max(0.0, 1 - drop_ratio)
        composite = 0.3 * detection_score + 0.3 * recovery_score + 0.4 * resilience_score
        return {
            "detectionScore": round(detection_score * 1000) / 1000,
            "recoveryScore": round(recovery_score * 1000) / 1000,
            "resilienceScore": round(resilience_score * 1000) / 1000,
            "composite": round(composite * 1000) / 1000,
        }

    def get_results(self) -> list[dict[str, Any]]:
        return [{**inj, "scores": self.score_injection(inj)} for inj in self._injections]

    def get_adaptation_score(self) -> float:
        results = self.get_results()
        if not results:
            return 0.0
        return sum(r["scores"]["composite"] for r in results) / len(results)
