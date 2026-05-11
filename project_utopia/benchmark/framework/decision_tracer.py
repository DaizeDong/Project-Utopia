"""Decision Trace Graph (port of ``DecisionTracer.js``).

Tracks Perceiver -> Planner -> Executor -> Evaluator causal chains and
performs backward attribution for negative events. Pure logic; no sim
dependencies.
"""

from __future__ import annotations

import time
from typing import Any

__all__ = ["DecisionTracer", "PHASES"]


PHASES: tuple[str, ...] = ("perceiver", "planner", "executor", "evaluator", "director")


class DecisionTracer:
    """Trace per-phase IO + attribute negative events."""

    __slots__ = ("_traces", "_fault_counts", "_negative_events")

    def __init__(self) -> None:
        self._traces: list[dict[str, Any]] = []
        self._fault_counts: dict[str, int] = {p: 0 for p in PHASES}
        self._negative_events: list[dict[str, Any]] = []

    def record(
        self,
        tick: int,
        phase: str,
        input_payload: Any,
        output_payload: Any,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self._traces.append(
            {
                "tick": tick,
                "phase": phase,
                "input": input_payload,
                "output": output_payload,
                "metadata": metadata or {},
                "timestamp": int(time.time() * 1000),
            }
        )

    def record_negative_event(self, tick: int, event_type: str, details: Any) -> None:
        self._negative_events.append({"tick": tick, "type": event_type, "details": details})

    def attribute_event(self, event: dict[str, Any]) -> dict[str, Any]:
        prior = [
            t
            for t in self._traces
            if t["tick"] <= event["tick"] and t["tick"] >= event["tick"] - 150
        ]
        latest: dict[str, dict[str, Any]] = {}
        for t in prior:
            if t["phase"] not in latest or t["tick"] > latest[t["phase"]]["tick"]:
                latest[t["phase"]] = t

        executor_trace = latest.get("executor")
        planner_trace = latest.get("planner")
        perceiver_trace = latest.get("perceiver")

        if executor_trace and planner_trace:
            plan_steps = len((planner_trace["output"] or {}).get("steps", []))
            executed = (executor_trace["output"] or {}).get("executedSteps", 0)
            if plan_steps > 0 and executed == 0:
                self._fault_counts["executor"] += 1
                return {
                    "attributedPhase": "executor",
                    "confidence": 0.8,
                    "reasoning": "Plan existed but executor completed 0 steps",
                }

        if planner_trace and perceiver_trace:
            has_crisis = self._detect_crisis_signal(
                perceiver_trace["output"], event["type"]
            )
            plan_addresses = self._plan_addresses_crisis(
                planner_trace["output"], event["type"]
            )
            if has_crisis and not plan_addresses:
                self._fault_counts["planner"] += 1
                return {
                    "attributedPhase": "planner",
                    "confidence": 0.7,
                    "reasoning": "Perceiver detected crisis but planner did not address it",
                }

        if perceiver_trace:
            has_crisis = self._detect_crisis_signal(
                perceiver_trace["output"], event["type"]
            )
            if not has_crisis:
                self._fault_counts["perceiver"] += 1
                return {
                    "attributedPhase": "perceiver",
                    "confidence": 0.6,
                    "reasoning": "Crisis signal not present in perceiver output",
                }

        self._fault_counts["director"] += 1
        return {
            "attributedPhase": "director",
            "confidence": 0.4,
            "reasoning": "No specific phase fault identified; director failed to orchestrate",
        }

    @staticmethod
    def _detect_crisis_signal(perceiver_output: Any, event_type: str) -> bool:
        if not isinstance(perceiver_output, dict):
            return False
        if event_type == "resource_depletion":
            economy = perceiver_output.get("economy") or {}
            food = (economy.get("food") or {}) if isinstance(economy, dict) else {}
            wood = (economy.get("wood") or {}) if isinstance(economy, dict) else {}
            return (
                food.get("projectedZeroSec") is not None
                or (food.get("stock") is not None and float(food.get("stock", 100)) < 15)
                or (wood.get("stock") is not None and float(wood.get("stock", 100)) < 10)
            )
        if event_type == "population_decline":
            workforce = perceiver_output.get("workforce") or {}
            defense = perceiver_output.get("defense") or {}
            blockers = workforce.get("growthBlockers") if isinstance(workforce, dict) else None
            sabs = defense.get("activeSaboteurs", 0) if isinstance(defense, dict) else 0
            return bool(blockers) or (sabs and sabs > 0)
        if event_type == "objective_failure":
            objective = perceiver_output.get("objective") or {}
            if not isinstance(objective, dict):
                return False
            pct = objective.get("progressPct")
            return pct is not None and float(pct) < 30
        return False

    @staticmethod
    def _plan_addresses_crisis(planner_output: Any, event_type: str) -> bool:
        if not isinstance(planner_output, dict) or not planner_output.get("steps"):
            return False
        step_types = [
            (s.get("type", "") or "").lower()
            for s in planner_output["steps"]
            if isinstance(s, dict)
        ]
        if event_type == "resource_depletion":
            return any("farm" in t or "lumber" in t or "food" in t for t in step_types)
        if event_type == "population_decline":
            return any("wall" in t or "defense" in t or "clinic" in t for t in step_types)
        if event_type == "objective_failure":
            return any("warehouse" in t or "objective" in t for t in step_types)
        return False

    def analyze_all(self) -> dict[str, Any]:
        # Reset counts to avoid double-counting on repeated calls.
        for p in PHASES:
            self._fault_counts[p] = 0
        attributions = [
            {"event": e, "attribution": self.attribute_event(e)}
            for e in self._negative_events
        ]
        total = max(1, sum(self._fault_counts.values()))
        fault_distribution = {
            p: round(self._fault_counts[p] / total * 100) for p in PHASES
        }
        return {
            "faultDistribution": fault_distribution,
            "attributions": attributions,
            "totalEvents": len(self._negative_events),
        }

    def reset(self) -> None:
        self._traces.clear()
        self._negative_events.clear()
        for p in PHASES:
            self._fault_counts[p] = 0
