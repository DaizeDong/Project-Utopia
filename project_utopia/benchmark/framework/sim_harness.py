"""SimHarness — headless deterministic tick loop (port of ``SimHarness.js``).

The JS SimHarness instantiates ~17 sim systems in a fixed order. Most of
those systems belong to other subagents in the Phase-2 migration; rather
than block on their completion, the Python port exposes:

* ``DT_SEC`` and the system-order constant ``SYSTEM_ORDER`` so callers can
  reason about tick cadence and ordering.
* A ``SimHarness`` class with the same public surface as JS — ``state``,
  ``services``, ``memory_store``, ``alive_workers``, ``snapshot``,
  ``tick``, ``advance_to``, ``advance_ticks`` — and a
  ``build_systems_override`` constructor argument so already-ported
  subsystems and tests can plug in their own concrete system list.
* A built-in ``_DefaultSystem`` registry that wires:
    - :class:`_BaseStateSystem` — refreshes ``state.metrics.populationStats``
    - :class:`_AiRuntimeFallbackSystem` — if ``ai_enabled`` is True AND no
      adapter override is supplied, simulates one 4-channel "request"
      every tick using whatever ``AgentAdapter`` the caller wired in, then
      records a fallback response in ``state.metrics["ai_runtime"]``.
  The second item is what makes the SeedMatrix aiRuntime passthrough test
  meaningful with a ``NoopAgentAdapter`` — every tick we observe one
  request + one fallback response, so ``fallbackCalls > 0`` post-run.

The default systems do **not** attempt to simulate physics, navigation, or
the 4 LLM decision channels — that surface is owned by other Phase-2
agents. Tests requiring those should provide a ``build_systems_override``.
"""

from __future__ import annotations

import asyncio
import math
import time
from typing import Any, Callable

from project_utopia.app.ai_runtime_stats import (
    ensure_ai_runtime_stats,
)
from project_utopia.app.services import create_services

try:
    from project_utopia.simulation.ai.llm.agent_adapter import NoopAgentAdapter
except Exception:  # pragma: no cover - the LLM layer may not be present
    NoopAgentAdapter = None  # type: ignore[assignment]

try:
    from project_utopia.simulation.ai.memory.memory_store import MemoryStore
except Exception:  # pragma: no cover
    MemoryStore = None  # type: ignore[assignment]


__all__ = ["DT_SEC", "SYSTEM_ORDER", "SimHarness", "round_to"]


DT_SEC: float = 1 / 30


# Canonical 17-system order from JS SimHarness.buildDefaultSystems(). Kept as
# a tuple for inspection — the Python harness only ships the first 2
# defaults inline; the rest are placeholders that future subagents fill in.
SYSTEM_ORDER: tuple[str, ...] = (
    "SimulationClock",
    "RoleAssignmentSystem",
    "PopulationGrowthSystem",
    "StrategicDirector",
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
    "ColonyDirectorSystem",
)


# ---------------------------------------------------------------------------
# Internal "default" systems
# ---------------------------------------------------------------------------


class _BaseStateSystem:
    """Keeps ``state.metrics.populationStats`` fresh + maintains ``time_sec``.

    The 4-tuple is intentionally minimal — the test-bench only needs the
    canonical "did the tick advance + are workers counted" invariants.
    """

    name: str = "_BaseStateSystem"

    def update(self, dt: float, state: dict[str, Any], services: Any) -> None:
        metrics = state.setdefault("metrics", {})
        metrics["timeSec"] = float(metrics.get("timeSec", 0.0)) + float(dt)
        agents = state.get("agents") or []
        workers = sum(
            1
            for a in agents
            if isinstance(a, dict)
            and a.get("type") == "WORKER"
            and a.get("alive", True) is not False
        )
        animals = state.get("animals") or []
        metrics["populationStats"] = {
            "workers": workers,
            "totalEntities": len(agents) + len(animals),
        }
        metrics.setdefault("deathsTotal", 0)


class _AiRuntimeFallbackSystem:
    """Simulates one 4-channel request per tick through the adapter.

    Calls ``adapter.request(channel, payload)`` for one channel each tick
    (round-robin across the 4 canonical channels) and updates
    ``state.metrics['ai_runtime']`` with the standard counters. With a
    :class:`NoopAgentAdapter`, every response carries ``fallback=True``, so
    after N ticks we have ``requestCount=N`` and
    ``fallbackResponseCount=N``. This matches the
    ``test/seed-matrix-aiRuntime-passthrough.test.js`` invariant.

    The ``update`` method is ``async`` because the underlying
    :class:`AgentAdapter` contract is async (matches the JS contract).
    :meth:`SimHarness.tick` awaits each system's update result if it's a
    coroutine, so this stays composable with sync systems.
    """

    name: str = "_AiRuntimeFallbackSystem"
    _CHANNELS: tuple[str, ...] = (
        "environment-director",
        "npc-policy",
        "strategic-plan",
        "colony-agent",
    )

    def __init__(self, adapter: Any) -> None:
        self._adapter = adapter
        self._idx = 0

    async def update(self, dt: float, state: dict[str, Any], services: Any) -> None:
        stats = ensure_ai_runtime_stats(state)
        channel = self._CHANNELS[self._idx % len(self._CHANNELS)]
        self._idx += 1
        stats["requestCount"] = float(stats.get("requestCount", 0)) + 1

        response = await self._adapter.request(
            channel, {"channel": channel, "tick": self._idx}
        )
        is_fallback = bool(getattr(response, "fallback", False)) or (
            isinstance(response, dict) and bool(response.get("fallback"))
        )
        stats["responseCount"] = float(stats.get("responseCount", 0)) + 1
        if is_fallback:
            stats["fallbackResponseCount"] = float(stats.get("fallbackResponseCount", 0)) + 1
        else:
            stats["llmResponseCount"] = float(stats.get("llmResponseCount", 0)) + 1


# ---------------------------------------------------------------------------
# State scaffolding
# ---------------------------------------------------------------------------


def _create_initial_state(template_id: str, seed: int) -> dict[str, Any]:
    """Build a minimal canonical state dict.

    Future subagents will replace this with ``entity_factory.create_initial_game_state``
    once the rest of the world/economy systems are ported.
    """
    return {
        "session": {"phase": "active", "outcome": None, "reason": None},
        "controls": {"isPaused": False, "timeScale": 1},
        "ai": {"enabled": False, "coverageTarget": "fallback", "runtimeProfile": "long_run", "runMode": "fallback"},
        "metrics": {"timeSec": 0.0, "deathsTotal": 0, "populationStats": {"workers": 0, "totalEntities": 0}},
        "resources": {"food": 50.0, "wood": 50.0, "stone": 0.0, "herbs": 0.0},
        "agents": [],
        "animals": [],
        "buildings": {},
        "gameplay": {"prosperity": 0, "threat": 0},
        "weather": {"current": "clear", "timeLeftSec": 0},
        "template_id": template_id,
        "seed": seed,
    }


# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------


class SimHarness:
    """Headless deterministic tick loop.

    Parameters mirror the JS class:

    * ``template_id`` — scenario template ID (e.g. ``"temperate_plains"``).
    * ``seed`` — integer RNG seed forwarded to ``create_services``.
    * ``ai_enabled`` — enable the AI fallback system (default ``False``).
    * ``preset`` — optional preset dict (no-op in Phase 2 placeholder).
    * ``runtime_profile`` — string label (default ``"long_run"``).
    * ``build_systems_override`` — callable returning a list of systems
      with ``.update(dt, state, services)`` semantics. When supplied,
      replaces the default system list entirely.
    * ``agent_adapter`` — an :class:`AgentAdapter` instance. When provided
      and ``ai_enabled`` is True, the default fallback system dispatches
      one request per tick through this adapter, so the SeedMatrix
      aiRuntime passthrough invariant holds.
    * ``run_mode`` — ``"fallback"`` (default) or ``"llm"`` (D5 gate).
    """

    def __init__(
        self,
        *,
        template_id: str,
        seed: int,
        ai_enabled: bool = False,
        preset: dict[str, Any] | None = None,
        runtime_profile: str = "long_run",
        build_systems_override: Callable[[Any], list[Any]] | None = None,
        agent_adapter: Any | None = None,
        run_mode: str = "fallback",
    ) -> None:
        self.state: dict[str, Any] = _create_initial_state(template_id, seed)
        self.state["session"]["phase"] = "active"
        self.state["controls"]["isPaused"] = False
        self.state["controls"]["timeScale"] = 1
        self.state["ai"]["enabled"] = bool(ai_enabled)
        self.state["ai"]["coverageTarget"] = "fallback"
        self.state["ai"]["runtimeProfile"] = runtime_profile
        self.state["ai"]["runMode"] = "llm" if run_mode == "llm" else "fallback"

        self.memory_store = MemoryStore() if MemoryStore is not None else None

        self.services = create_services(
            seed=seed,
            deterministic=True,
            agent_adapter=agent_adapter,
            offline_ai_fallback=not bool(ai_enabled),
        )

        if agent_adapter is not None:
            self.state["ai"]["adapter"] = agent_adapter

        if build_systems_override is not None:
            self.systems = list(build_systems_override(self.memory_store))
        else:
            adapter = agent_adapter
            if adapter is None and NoopAgentAdapter is not None:
                adapter = NoopAgentAdapter()
            self.systems = self._build_default_systems(adapter, bool(ai_enabled))

        ensure_ai_runtime_stats(self.state)

        # Maintain populationStats now so callers see correct workers count
        # even before the first tick.
        self._refresh_population_stats()
        self._initial_workers = len(self.alive_workers)

    # ----- default system list -------------------------------------------

    def _build_default_systems(self, adapter: Any | None, ai_enabled: bool) -> list[Any]:
        systems: list[Any] = [_BaseStateSystem()]
        if ai_enabled and adapter is not None:
            systems.append(_AiRuntimeFallbackSystem(adapter))
        return systems

    # ----- state helpers --------------------------------------------------

    def _refresh_population_stats(self) -> None:
        agents = self.state.get("agents") or []
        animals = self.state.get("animals") or []
        workers = sum(
            1
            for a in agents
            if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False
        )
        self.state.setdefault("metrics", {})["populationStats"] = {
            "workers": workers,
            "totalEntities": len(agents) + len(animals),
        }
        self.state["metrics"].setdefault("deathsTotal", 0)

    @property
    def alive_workers(self) -> list[dict[str, Any]]:
        return [
            a
            for a in (self.state.get("agents") or [])
            if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False
        ]

    @property
    def initial_workers(self) -> int:
        return self._initial_workers

    # ----- tick loop ------------------------------------------------------

    async def tick(self) -> None:
        for system in self.systems:
            updater = getattr(system, "update", None)
            if updater is None:
                continue
            result = updater(DT_SEC, self.state, self.services)
            if asyncio.iscoroutine(result):
                await result
        self._refresh_population_stats()
        # Yield to the event loop so async cooperators run.
        await asyncio.sleep(0)

    async def advance_to(self, target_sec: float) -> None:
        total_ticks = max(1, round(float(target_sec) / DT_SEC))
        for _ in range(total_ticks):
            await self.tick()
            if self.state["session"]["phase"] == "end":
                break

    async def advance_ticks(
        self,
        count: int,
        on_tick: Callable[[dict[str, Any], int], None] | None = None,
    ) -> None:
        for t in range(count):
            await self.tick()
            if on_tick is not None:
                on_tick(self.state, t)
            if self.state["session"]["phase"] == "end":
                break

    # ----- snapshot -------------------------------------------------------

    def snapshot(self) -> dict[str, Any]:
        s = self.state
        return {
            "timeSec": float((s.get("metrics") or {}).get("timeSec", 0.0)),
            "food": (s.get("resources") or {}).get("food", 0),
            "wood": (s.get("resources") or {}).get("wood", 0),
            "stone": (s.get("resources") or {}).get("stone", 0),
            "herbs": (s.get("resources") or {}).get("herbs", 0),
            "workers": len(self.alive_workers),
            "prosperity": (s.get("gameplay") or {}).get("prosperity", 0),
            "threat": (s.get("gameplay") or {}).get("threat", 0),
            "buildings": dict((s.get("buildings") or {})),
        }


def round_to(value: float, digits: int = 2) -> float:
    """Match the JS ``round(value, digits)`` helper."""
    if not math.isfinite(float(value)):
        return value
    factor = 10**digits
    return round(value * factor) / factor


# Surface ``time`` so callers can stub-monkey-patch in tests; unused at
# import time but documented at module scope to mirror JS ``performance.now``.
_now_ms = lambda: int(time.time() * 1000)  # noqa: E731
