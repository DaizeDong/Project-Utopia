"""Deterministic multi-step plan executor.

Drains a queue of ``(tool, ix, iz)`` build tuples one tick at a time
through :class:`BuildSystem`, honouring blocking dependencies declared
in each step's ``depends_on`` field.

A plan step has the shape::

    {
        "id": "step-1",                # unique identifier
        "tool": "warehouse",            # passed through to BuildSystem
        "ix": 12, "iz": 8,              # placement coordinates
        "owner": "autopilot",           # optional owner label
        "depends_on": ["step-0", ...],  # optional list of step ids
                                        # that must complete first
    }

The executor maintains a small finite-state machine per step::

    pending → submitted → complete | failed

A step transitions ``pending → submitted`` only after every dependency
has reached ``complete``. The transition itself is deterministic — we
iterate the plan in insertion order, never by hash.
"""

from __future__ import annotations

from typing import Any

from .build_system import BuildSystem

__all__ = ["PlanExecutor", "PlanStepStatus"]


PlanStepStatus = str  # "pending" | "submitted" | "complete" | "failed"


class PlanExecutor:
    """Drive a multi-step build plan through :class:`BuildSystem`."""

    def __init__(self, build_system: BuildSystem | None = None) -> None:
        self.name = "PlanExecutor"
        self.build_system = build_system or BuildSystem()
        self._plan: list[dict[str, Any]] = []
        self._status: dict[str, PlanStepStatus] = {}

    # ---- plan registration --------------------------------------------

    def load_plan(self, steps: list[dict[str, Any]]) -> None:
        """Replace any in-flight plan with ``steps``."""
        self._plan = []
        self._status = {}
        for step in steps:
            if not isinstance(step, dict):
                continue
            sid = str(step.get("id", f"step-{len(self._plan)}"))
            entry = {
                "id": sid,
                "tool": str(step.get("tool", "")),
                "ix": int(step.get("ix", 0)),
                "iz": int(step.get("iz", 0)),
                "owner": str(step.get("owner", "autopilot")),
                "reason": str(step.get("reason", "")),
                "depends_on": [str(d) for d in (step.get("depends_on") or [])],
            }
            self._plan.append(entry)
            self._status[sid] = "pending"

    # ---- per-tick drain -----------------------------------------------

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del dt
        if not self._plan:
            return
        # Refresh step status from the construction-site mirror first so
        # in-flight steps can flip to ``complete`` once their tile mutates.
        self._refresh_status(state)

        # Submit at most one new step per tick (deterministic ordering).
        for step in self._plan:
            sid = step["id"]
            status = self._status.get(sid, "pending")
            if status != "pending":
                continue
            if not self._dependencies_complete(step):
                continue
            result = self.build_system.place_tool_at(
                state,
                step["tool"],
                step["ix"],
                step["iz"],
                {
                    "owner": step["owner"],
                    "reason": step["reason"],
                    "services": services,
                },
            )
            if not result.get("ok"):
                self._status[sid] = "failed"
                continue
            phase = result.get("phase", "")
            if phase == "blueprint":
                self._status[sid] = "submitted"
            elif phase == "complete":
                self._status[sid] = "complete"
            else:
                # Defensive: unknown phase string — leave the step pending
                # so the next tick re-tries (matches JS behaviour when an
                # idempotent failure rolls back partially).
                continue
            # One submission per tick.
            return

    def _dependencies_complete(self, step: dict[str, Any]) -> bool:
        for dep in step.get("depends_on", []):
            if self._status.get(str(dep)) != "complete":
                return False
        return True

    def _refresh_status(self, state: dict[str, Any]) -> None:
        """Promote submitted steps to complete when their site is gone."""
        sites = state.get("constructionSites") or []
        active_keys: set[tuple[int, int]] = set()
        for s in sites:
            if isinstance(s, dict):
                active_keys.add((int(s.get("ix", 0)), int(s.get("iz", 0))))
        for step in self._plan:
            sid = step["id"]
            if self._status.get(sid) != "submitted":
                continue
            key = (int(step["ix"]), int(step["iz"]))
            if key not in active_keys:
                self._status[sid] = "complete"

    # ---- introspection ------------------------------------------------

    def status_of(self, step_id: str) -> PlanStepStatus:
        return self._status.get(step_id, "pending")

    def status_snapshot(self) -> dict[str, PlanStepStatus]:
        return dict(self._status)

    def is_complete(self) -> bool:
        if not self._plan:
            return True
        return all(self._status.get(s["id"]) == "complete" for s in self._plan)
