"""Long-run telemetry builder (port of ``src/app/longRunTelemetry.js``).

Produces a single JSON-shaped sample summarizing a long-horizon simulation
run — world template, scenario, gameplay metrics, AI runtime stats, etc.
The output is consumed by NDJSON post-processors and the future paper
runner ``scripts/benchmark-paper.mjs`` (and its Python sibling).

Dependencies on :mod:`project_utopia.world.scenarios` are imported lazily
because that subagent hasn't landed yet; we fall back to reading
``state.gameplay.scenario`` directly when the runtime helper is absent.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from .ai_runtime_stats import ensure_ai_runtime_stats

__all__ = ["build_long_run_telemetry"]


def _round(value: Any, digits: int = 2) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(n):
        return n
    return round(n, digits)


def _get_scenario_runtime(state: dict[str, Any]) -> dict[str, Any]:
    """Read scenario runtime info, falling back to ``gameplay.scenario``.

    The JS source uses ``getScenarioRuntime(state)`` which lives in
    :mod:`world.scenarios.ScenarioFactory`. That module is ported by a
    different subagent; until it lands we synthesize a minimal runtime
    block from the state directly.
    """
    try:
        from project_utopia.world.scenarios import get_scenario_runtime  # type: ignore[import-not-found]
    except (ImportError, ModuleNotFoundError):
        gameplay = state.get("gameplay") or {}
        scenario = gameplay.get("scenario") or {}
        return {
            "scenario": scenario,
            "counts": {},
            "routes": [],
            "depots": [],
            "connectedRoutes": 0,
            "readyDepots": 0,
        }
    return get_scenario_runtime(state)


def _collect_error_warnings(state: dict[str, Any]) -> list[dict[str, Any]]:
    metrics = state.get("metrics") or {}
    warning_log = metrics.get("warningLog") or []
    out: list[dict[str, Any]] = []
    for entry in warning_log:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("level", "")).lower() != "error":
            continue
        message = str(entry.get("message", "")).strip()
        if not message:
            continue
        out.append(
            {
                "sec": _round(entry.get("sec", 0), 1),
                "source": str(entry.get("source", "")),
                "message": message,
            }
        )
    return out


def _summarize_weather(state: dict[str, Any]) -> dict[str, Any]:
    weather = state.get("weather") or {}
    fronts = weather.get("hazardFronts") if isinstance(weather.get("hazardFronts"), list) else []
    current = str(weather.get("current", "clear"))
    return {
        "current": current,
        "timeLeftSec": _round(weather.get("timeLeftSec", 0), 1),
        "pressureScore": _round(weather.get("pressureScore", 0), 2),
        "hazardFrontCount": len(fronts),
        "hazardFocusSummary": str(weather.get("hazardFocusSummary", "")),
        "summary": (
            f"Weather: {current}, {len(fronts)} hazard fronts, "
            f"focus {weather.get('hazardFocusSummary') or 'n/a'}"
            if fronts
            else f"Weather: {current}"
        ),
    }


def _collect_non_finite_metrics(sample: dict[str, Any]) -> list[str]:
    candidates: list[tuple[str, Any]] = [
        ("tick", sample.get("tick")),
        ("simTimeSec", sample.get("simTimeSec")),
        ("resources.food", sample.get("resources", {}).get("food")),
        ("resources.wood", sample.get("resources", {}).get("wood")),
        ("gameplay.prosperity", sample.get("gameplay", {}).get("prosperity")),
        ("gameplay.threat", sample.get("gameplay", {}).get("threat")),
        ("performance.fps", sample.get("performance", {}).get("fps")),
        ("performance.frameMs", sample.get("performance", {}).get("frameMs")),
        ("performance.heapMb", sample.get("performance", {}).get("heapMb")),
        ("ai.avgLatencyMs", sample.get("ai", {}).get("avgLatencyMs")),
    ]
    bad: list[str] = []
    for key, value in candidates:
        try:
            n = float(value)
        except (TypeError, ValueError):
            bad.append(key)
            continue
        if not math.isfinite(n):
            bad.append(key)
    return bad


def _build_top_system_ms(state: dict[str, Any], limit: int = 3) -> list[dict[str, Any]]:
    debug = state.get("debug") or {}
    timings = debug.get("systemTimingsMs")
    if not isinstance(timings, dict):
        return []
    entries: list[dict[str, Any]] = []
    for name, stat in timings.items():
        if not isinstance(stat, dict):
            continue
        entries.append(
            {
                "name": str(name),
                "last": _round(stat.get("last", 0), 2),
                "avg": _round(stat.get("avg", 0), 2),
                "peak": _round(stat.get("peak", 0), 2),
            }
        )
    entries.sort(key=lambda e: (-float(e["peak"]), -float(e["avg"])))
    return entries[:limit]


def _build_population_by_group(state: dict[str, Any]) -> dict[str, int]:
    agents = state.get("agents") or []
    animals = state.get("animals") or []
    live_agents = [a for a in agents if isinstance(a, dict) and a.get("alive") is not False]
    live_animals = [a for a in animals if isinstance(a, dict) and a.get("alive") is not False]
    return {
        "workers": sum(1 for a in live_agents if a.get("type") == "WORKER"),
        "traders": sum(
            1
            for a in live_agents
            if a.get("type") == "VISITOR" and str(a.get("kind", "")) == "TRADER"
        ),
        "saboteurs": sum(
            1
            for a in live_agents
            if a.get("type") == "VISITOR" and str(a.get("kind", "")) != "TRADER"
        ),
        "herbivores": sum(1 for a in live_animals if a.get("kind") == "HERBIVORE"),
        "predators": sum(1 for a in live_animals if a.get("kind") == "PREDATOR"),
    }


def build_long_run_telemetry(
    state: dict[str, Any],
    view_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a single long-run telemetry sample.

    Parameters
    ----------
    state
        Current full game state.
    view_state
        Optional camera state ``{targetX, targetZ, zoom}``. Phase-1
        callers may omit this — the harness has no camera.

    Returns
    -------
    dict[str, Any]
        JSON-serializable dict with the same shape as the JS source.
    """
    runtime = _get_scenario_runtime(state)
    gameplay = state.get("gameplay") or {}
    objectives = gameplay.get("objectives") or []
    obj_index = int(gameplay.get("objectiveIndex", 0) or 0)
    objective = objectives[obj_index] if 0 <= obj_index < len(objectives) else None

    ai_runtime = ensure_ai_runtime_stats(state)
    error_warnings = _collect_error_warnings(state)
    population_by_group = _build_population_by_group(state)

    metrics = state.get("metrics") or {}
    spatial = metrics.get("spatialPressure") or {}
    logistics = metrics.get("logistics") or {}
    ecology = metrics.get("ecology") or {}
    deaths = metrics.get("deathsByReason") or {}

    telemetry: dict[str, Any] = {
        "capturedAtIso": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "phase": str((state.get("session") or {}).get("phase", "menu")),
        "tick": int(metrics.get("tick", 0) or 0),
        "simTimeSec": _round(metrics.get("timeSec", 0), 2),
        "world": {
            "templateId": str((state.get("world") or {}).get("mapTemplateId", "")),
            "templateName": str((state.get("world") or {}).get("mapTemplateName", "")),
            "scenarioId": str((runtime.get("scenario") or {}).get("id", "")),
            "scenarioTitle": str((runtime.get("scenario") or {}).get("title", "")),
            "scenarioFamily": str((runtime.get("scenario") or {}).get("family", "")),
            "buildings": dict(runtime.get("counts", {}) or {}),
            "frontier": {
                "connectedRoutes": int(runtime.get("connectedRoutes", 0) or 0),
                "totalRoutes": len(runtime.get("routes") or []),
                "readyDepots": int(runtime.get("readyDepots", 0) or 0),
                "totalDepots": len(runtime.get("depots") or []),
                "brokenRoutes": [
                    str(r.get("label", ""))
                    for r in (runtime.get("routes") or [])
                    if isinstance(r, dict) and not r.get("connected")
                ][:3],
                "unreadyDepots": [
                    str(d.get("label", ""))
                    for d in (runtime.get("depots") or [])
                    if isinstance(d, dict) and not d.get("ready")
                ][:3],
            },
            "weather": _summarize_weather(state),
            "events": [
                {
                    "type": str(ev.get("type", "")),
                    "status": str(ev.get("status", "")),
                    "intensity": _round(ev.get("intensity", 0), 2),
                    "targetLabel": str((ev.get("payload") or {}).get("targetLabel", "")),
                    "pressure": _round(
                        (ev.get("payload") or {}).get("pressure", ev.get("intensity", 0)), 2
                    ),
                    "contestedTiles": int((ev.get("payload") or {}).get("contestedTiles", 0) or 0),
                }
                for ev in ((state.get("events") or {}).get("active") or [])
                if isinstance(ev, dict)
            ],
            "spatialPressure": {
                "weatherPressure": _round(spatial.get("weatherPressure", 0), 2),
                "eventPressure": _round(spatial.get("eventPressure", 0), 2),
                "contestedZones": int(spatial.get("contestedZones", 0) or 0),
                "contestedTiles": int(spatial.get("contestedTiles", 0) or 0),
                "activeEventCount": int(spatial.get("activeEventCount", 0) or 0),
                "peakEventSeverity": _round(spatial.get("peakEventSeverity", 0), 2),
                "summary": str(spatial.get("summary", "Spatial pressure: idle")),
            },
        },
        "objective": {
            "index": obj_index,
            "id": str((objective or {}).get("id", "")) if objective else "",
            "title": str((objective or {}).get("title", "")) if objective else "",
            "progress": _round((objective or {}).get("progress", 100), 1) if objective else 100,
            "hint": str(gameplay.get("objectiveHint", "")),
        },
        "gameplay": {
            "prosperity": _round(gameplay.get("prosperity", 0), 2),
            "threat": _round(gameplay.get("threat", 0), 2),
            "recovery": {
                "charges": int((gameplay.get("recovery") or {}).get("charges", 0) or 0),
                "activeBoostSec": _round(
                    (gameplay.get("recovery") or {}).get("activeBoostSec", 0), 1
                ),
                "collapseRisk": _round(
                    (gameplay.get("recovery") or {}).get("collapseRisk", 0), 1
                ),
                "lastReason": str((gameplay.get("recovery") or {}).get("lastReason", "")),
            },
        },
        "resources": {
            "food": _round((state.get("resources") or {}).get("food", 0), 2),
            "wood": _round((state.get("resources") or {}).get("wood", 0), 2),
        },
        "population": {"byGroup": population_by_group},
        "deaths": {
            "total": int(metrics.get("deathsTotal", 0) or 0),
            "byReason": dict(deaths),
        },
        "logistics": {
            "carryingWorkers": int(logistics.get("carryingWorkers", 0) or 0),
            "totalCarryInTransit": _round(logistics.get("totalCarryInTransit", 0), 2),
            "avgDepotDistance": _round(logistics.get("avgDepotDistance", 0), 2),
            "strandedCarryWorkers": int(logistics.get("strandedCarryWorkers", 0) or 0),
            "overloadedWarehouses": int(logistics.get("overloadedWarehouses", 0) or 0),
            "busiestWarehouseLoad": int(logistics.get("busiestWarehouseLoad", 0) or 0),
            "stretchedWorksites": int(logistics.get("stretchedWorksites", 0) or 0),
            "isolatedWorksites": int(logistics.get("isolatedWorksites", 0) or 0),
            "warehouseLoadByKey": dict(logistics.get("warehouseLoadByKey") or {}),
            "summary": str(logistics.get("summary", "Logistics: idle")),
        },
        "ecology": {
            "activeGrazers": int(ecology.get("activeGrazers", 0) or 0),
            "pressuredFarms": int(ecology.get("pressuredFarms", 0) or 0),
            "maxFarmPressure": _round(ecology.get("maxFarmPressure", 0), 2),
            "frontierPredators": int(ecology.get("frontierPredators", 0) or 0),
            "migrationHerds": int(ecology.get("migrationHerds", 0) or 0),
            "hotspotFarms": list(ecology.get("hotspotFarms") or []),
            "summary": str(ecology.get("summary", "Ecology: idle")),
            "activePressure": _round(
                max(
                    float(ecology.get("maxFarmPressure", 0) or 0),
                    float(spatial.get("eventPressure", 0) or 0),
                    float(spatial.get("weatherPressure", 0) or 0),
                ),
                2,
            ),
        },
        "warnings": {
            "count": len(metrics.get("warningLog") or []),
            "errorCount": len(error_warnings),
            "errorWarnings": error_warnings,
        },
        "performance": {
            "fps": _round(metrics.get("averageFps", 0), 2),
            "frameMs": _round(metrics.get("frameMs", 0), 2),
            "heapMb": _round(metrics.get("memoryMb", 0), 2),
            "renderMode": str((state.get("debug") or {}).get("renderMode", "unknown")),
            "entityCount": int(
                (metrics.get("populationStats") or {}).get(
                    "totalEntities",
                    len(state.get("agents") or []) + len(state.get("animals") or []),
                )
                or 0
            ),
            "renderFrameCount": int(metrics.get("renderFrameCount", 0) or 0),
            "simStepsThisFrame": int(metrics.get("simStepsThisFrame", 0) or 0),
            "topSystemMs": _build_top_system_ms(state, 3),
            "uiCpuMs": _round(metrics.get("uiCpuMs", 0), 2),
            "renderCpuMs": _round(metrics.get("renderCpuMs", 0), 2),
        },
        "ai": {
            "enabled": bool((state.get("ai") or {}).get("enabled")),
            "coverageTarget": str((state.get("ai") or {}).get("coverageTarget", "fallback")),
            "mode": str((state.get("ai") or {}).get("mode", "fallback")),
            "runtimeProfile": str((state.get("ai") or {}).get("runtimeProfile", "default")),
            "latencyMs": _round(metrics.get("aiLatencyMs", 0), 2),
            "fallbackActive": str((state.get("ai") or {}).get("mode", "fallback")) != "llm",
            "requestCount": int(ai_runtime.get("requestCount", 0) or 0),
            "timeoutCount": int(ai_runtime.get("timeoutCount", 0) or 0),
            "fallbackCount": int(ai_runtime.get("fallbackResponseCount", 0) or 0),
            "llmCount": int(ai_runtime.get("llmResponseCount", 0) or 0),
            "avgLatencyMs": _round(ai_runtime.get("avgLatencyMs", 0), 2),
            "consecutiveFallbackResponses": int(
                ai_runtime.get("consecutiveFallbackResponses", 0) or 0
            ),
            "maxUnrecoveredFallbackSec": _round(
                ai_runtime.get("maxUnrecoveredFallbackSec", 0), 2
            ),
            "recoveryCount": int(ai_runtime.get("recoveryCount", 0) or 0),
            "lastErrorKind": str(ai_runtime.get("lastErrorKind", "none")),
            "liveCoverageSatisfied": bool(ai_runtime.get("liveCoverageSatisfied", False)),
        },
        "view": {
            "targetX": _round((view_state or {}).get("targetX", 0), 2),
            "targetZ": _round((view_state or {}).get("targetZ", 0), 2),
            "zoom": _round((view_state or {}).get("zoom", 0), 3),
        },
        "actionMessage": str((state.get("controls") or {}).get("actionMessage", "")),
    }
    telemetry["nonFiniteMetrics"] = _collect_non_finite_metrics(telemetry)
    return telemetry
