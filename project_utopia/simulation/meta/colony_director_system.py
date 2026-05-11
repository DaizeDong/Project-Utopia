"""Scripted auto-pilot (port of ``ColonyDirectorSystem.js``).

The JS source is ~1000 LOC of phase-aware proposers; the academic
benchmark only needs:

1. The D5 ``run_mode`` gate — when ``state["ai"]["run_mode"] == "llm"`` the
   scripted director MUST early-return so the LLM colony-agent owns the
   decision surface. (RC3 fix.)
2. A simple priority surface for tests / fallback runs that lets the
   harness verify the gate without instantiating the entire proposer
   pipeline.

The phase-builder / proposer fan-out from the JS source is intentionally
omitted — they reference deleted player-facing systems (HUDController,
EnvironmentDirectiveApplier) and aren't load-bearing for the academic
paper. A future revision can re-introduce them once the AI brain layer
lands.
"""

from __future__ import annotations

from typing import Any

from .progression_helper import is_recovery_essential

__all__ = [
    "ColonyDirectorSystem",
    "assess_colony_needs",
    "EVAL_INTERVAL_SEC",
    "DEFAULT_RUN_MODE",
]


EVAL_INTERVAL_SEC = 2.0
"""Cadence at which the scripted auto-pilot re-evaluates colony needs."""

DEFAULT_RUN_MODE = "fallback"
"""Default value of ``state.ai.run_mode``. The RC3 fix says only
``"llm"`` triggers the early-return gate; ``"fallback"``, ``None``, or
absent fields all keep the legacy behaviour."""


def _ensure_director_state(state: dict[str, Any]) -> dict[str, Any]:
    ai = state.setdefault("ai", {})
    ai.setdefault("run_mode", DEFAULT_RUN_MODE)
    cd = ai.get("colony_director")
    if not isinstance(cd, dict):
        cd = {
            "last_eval_sec": float("-inf"),
            "phase": "bootstrap",
            "builds_placed": 0,
            "blueprints_submitted": 0,
            "skipped_by_wall_rate": 0,
            "needs": [],
        }
        ai["colony_director"] = cd
    return cd


def _determine_phase(buildings: dict[str, int]) -> str:
    """Compact mirror of JS ``determinePhase``. Returns a single label."""
    b = buildings or {}

    def get(k: str) -> int:
        return int(b.get(k, 0))

    if get("farms") < 3 or get("lumbers") < 2 or get("warehouses") < 3:
        return "bootstrap"
    if get("warehouses") < 4 or get("farms") < 6 or get("lumbers") < 5:
        return "logistics"
    if get("quarries") < 2:
        return "extraction"
    if get("walls") < 12:
        return "fortification"
    if get("farms") < 12 or get("warehouses") < 6:
        return "expansion"
    return "complete"


def assess_colony_needs(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Return a deterministic, descending-priority list of build needs.

    The list is dedup'd by ``type`` (highest priority wins) and, when the
    colony is in recovery mode, filtered against
    :func:`progression_helper.is_recovery_essential`.
    """
    buildings = state.get("buildings") or {}
    resources = state.get("resources") or {}
    food = float(resources.get("food", 0.0))
    wood = float(resources.get("wood", 0.0))

    needs: list[dict[str, Any]] = []

    # Emergency rails
    if int(buildings.get("farms", 0)) < 1:
        needs.append({"type": "farm", "priority": 99, "reason": "zero farms"})
    if int(buildings.get("lumbers", 0)) < 1:
        needs.append({"type": "lumber", "priority": 95, "reason": "zero lumber"})
    if int(buildings.get("warehouses", 0)) < 1:
        needs.append({"type": "warehouse", "priority": 93, "reason": "zero warehouse"})

    # Resource shortage rails
    if food < 20.0:
        needs.append({"type": "farm", "priority": 85, "reason": "food shortage"})
    if wood < 10.0:
        needs.append({"type": "lumber", "priority": 80, "reason": "wood shortage"})

    # Phase-driven recommendations
    phase = _determine_phase(buildings)
    if phase == "bootstrap":
        needs.append({"type": "warehouse", "priority": 70, "reason": "bootstrap depots"})
        needs.append({"type": "road", "priority": 50, "reason": "bootstrap roads"})
    elif phase == "logistics":
        needs.append({"type": "warehouse", "priority": 65, "reason": "logistics coverage"})
        needs.append({"type": "road", "priority": 45, "reason": "logistics roads"})
    elif phase == "extraction":
        needs.append({"type": "quarry", "priority": 55, "reason": "extraction"})

    # Recovery-mode filter: only essential types survive when the colony is
    # in a runway crisis. The flag is set externally by the resource layer.
    ai = state.get("ai") or {}
    if bool(ai.get("recovery_mode", False)):
        needs = [n for n in needs if is_recovery_essential(str(n.get("type", "")))]

    # Descending sort, dedup by type (keep highest priority).
    needs.sort(key=lambda n: (-int(n.get("priority", 0)), str(n.get("type", ""))))
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for n in needs:
        t = str(n.get("type", ""))
        if t in seen:
            continue
        seen.add(t)
        out.append(n)
    return out


class ColonyDirectorSystem:
    """Scripted colony auto-pilot, gated by D5 ``run_mode``."""

    def __init__(self) -> None:
        self.name = "ColonyDirectorSystem"

    def update(
        self,
        dt: float,
        state: dict[str, Any],
        services: Any | None = None,
    ) -> None:
        del dt, services  # unused in the trimmed academic-benchmark surface
        if not isinstance(state, dict):
            return

        # ---- D5 run_mode gate (RC3 fix) --------------------------------
        # The scripted auto-pilot MUST early-return when the LLM is in
        # the driving seat so it doesn't pollute the colony state with
        # rule-based overrides. Any other value (``"fallback"``, ``None``,
        # absent) keeps the legacy behaviour.
        ai = state.get("ai") or {}
        if ai.get("run_mode") == "llm":
            return

        # ---- Session-phase gate (parity with JS) ------------------------
        session = state.get("session") or {}
        if session.get("phase", "active") != "active":
            return

        cd = _ensure_director_state(state)
        metrics = state.get("metrics") or {}
        now_sec = float(metrics.get("timeSec", 0.0))
        if now_sec - float(cd.get("last_eval_sec", float("-inf"))) < EVAL_INTERVAL_SEC:
            return
        cd["last_eval_sec"] = now_sec

        # Phase tracking
        cd["phase"] = _determine_phase(state.get("buildings") or {})
        # Stash the most recent need list so harness telemetry can read it
        # without re-running the assessment (and so tests can introspect).
        cd["needs"] = assess_colony_needs(state)
