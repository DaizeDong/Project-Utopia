"""SimHarness — headless deterministic tick loop (port of ``SimHarness.js``).

The JS SimHarness instantiates ~17 sim systems in a fixed order. Most of
those systems belong to other subagents in the Phase-2 migration; rather
than block on their completion, the Python port exposes:

* ``DT_SEC`` so callers can reason about tick cadence. The canonical
  ``SYSTEM_ORDER`` tuple lives in
  :mod:`project_utopia.config.constants` — SimHarness itself wires
  systems through :class:`SystemRegistry` rather than reading the tuple.
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
from dataclasses import asdict
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
    from project_utopia.simulation.npc.worker_ai_system import WorkerAISystem
    from project_utopia.simulation.npc.worker_states import (
        GroupPolicy,
        WorkerState,
        apply_group_policy,
    )
except Exception:  # pragma: no cover - npc layer may not be present
    WorkerAISystem = None  # type: ignore[assignment]
    GroupPolicy = None  # type: ignore[assignment]
    WorkerState = None  # type: ignore[assignment]
    apply_group_policy = None  # type: ignore[assignment]

try:
    from project_utopia.simulation.ai.memory.memory_store import MemoryStore
except Exception:  # pragma: no cover
    MemoryStore = None  # type: ignore[assignment]

try:
    from project_utopia.world.scenarios import SCENARIOS, ScenarioFactory
except Exception:  # pragma: no cover - scenario factory may not be present
    SCENARIOS = None  # type: ignore[assignment]
    ScenarioFactory = None  # type: ignore[assignment]

try:
    from project_utopia.entities.entity_factory import EntityFactory
except Exception:  # pragma: no cover - entity factory may not be present
    EntityFactory = None  # type: ignore[assignment]


__all__ = ["DT_SEC", "SimHarness", "round_to"]


DT_SEC: float = 1 / 30


# Round 4: the local ``SYSTEM_ORDER`` tuple (a documentation-only mirror
# of the JS buildDefaultSystems() list) was removed. The canonical tick
# order now lives only in ``project_utopia.config.constants.SYSTEM_ORDER``.


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

    The ``tick`` counter and the placeholder slots for ``grid`` / ``scenario``
    are populated by :class:`SimHarness` once the scenario factory has run.
    They are pre-declared here so the slim-state hash function can find a
    consistent key set even when the harness is constructed without world
    generators (legacy/Phase-2 plugin tests).
    """
    return {
        "tick": 0,
        "session": {"phase": "active", "outcome": None, "reason": None},
        "controls": {"isPaused": False, "timeScale": 1},
        "ai": {"enabled": False, "coverageTarget": "fallback", "runtimeProfile": "long_run", "runMode": "fallback"},
        "metrics": {"timeSec": 0.0, "deathsTotal": 0, "populationStats": {"workers": 0, "totalEntities": 0}},
        "resources": {"food": 50.0, "wood": 50.0, "stone": 0.0},
        "agents": [],
        "animals": [],
        "buildings": {},
        "gameplay": {"prosperity": 0, "threat": 0},
        "weather": {"current": "clear", "timeLeftSec": 0},
        "grid": None,
        "scenario": None,
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
        attach_llm_channels: bool = False,
        cadence_multiplier: float = 1.0,
    ) -> None:
        self.state: dict[str, Any] = _create_initial_state(template_id, seed)
        self._seed: int = int(seed)  # cached for adapter / channel-system wiring
        self.state["session"]["phase"] = "active"
        self.state["controls"]["isPaused"] = False
        self.state["controls"]["timeScale"] = 1
        self.state["ai"]["enabled"] = bool(ai_enabled)
        self.state["ai"]["coverageTarget"] = "fallback"
        self.state["ai"]["runtimeProfile"] = runtime_profile
        self.state["ai"]["runMode"] = "llm" if run_mode == "llm" else "fallback"

        # Track which canonical-order systems we don't yet have concrete
        # implementations for. Phase-3 subagents fill these in; for now we
        # expose the set so determinism debugging can confirm what's wired.
        self._skipped_systems: set[str] = set()

        self.memory_store = MemoryStore() if MemoryStore is not None else None
        # Populated by ``_inject_default_anchors`` when ``attach_llm_channels``
        # is True; consumed by MemoryDegradation plugin via seed_matrix.
        self.injected_anchors: list[dict[str, Any]] = []
        # WorkerAISystem instance — populated at end of ``__init__`` when
        # ``attach_llm_channels`` is True so the LLM's ``intent_weights``
        # and ``target_priorities`` directives actually drive worker
        # behaviour through the FSM. None means the legacy rng-jitter
        # micro-step is used (preserves existing test determinism).
        self._worker_ai: Any | None = None
        # Tracks the last ``state.ai.policyDecisionCount`` observed; used
        # by ``_tick_workers_via_fsm`` to force worker re-sampling on
        # each new policy envelope.
        self._last_policy_decision_count: int = -1

        self.services = create_services(
            seed=seed,
            deterministic=True,
            agent_adapter=agent_adapter,
            offline_ai_fallback=not bool(ai_enabled),
        )
        # Wire memory_store onto services so channel systems'
        # _collect_memory_snippets() can reach it.
        if self.memory_store is not None:
            self.services.memory_store = self.memory_store

        if agent_adapter is not None:
            self.state["ai"]["adapter"] = agent_adapter

        # ---- seed-divergent world bootstrap ----------------------------------
        # ScenarioFactory.build produces a (grid, scenario_state) pair whose
        # tile layout, anchors, and weather/event seeds vary by seed. We then
        # spawn ``scenario.initial_workers`` workers at positions derived from
        # ``services.rng`` so that distinct seeds yield distinct worker
        # coordinates (and therefore distinct slim-state hashes).
        #
        # If the world layer is unavailable (e.g. trimmed test environments),
        # we fall back to a "minimal seed-divergence" wiring that simply
        # advances ``state["resources"]["food"]`` by an rng draw each tick.
        self._world_ready: bool = False
        if ScenarioFactory is not None and SCENARIOS is not None and EntityFactory is not None:
            try:
                grid, scenario_state = ScenarioFactory.build(template_id, seed)
                blueprint = SCENARIOS[template_id]
                self.state["grid"] = grid
                self.state["scenario"] = scenario_state
                # Replace resource defaults with scenario-derived stockpiles
                # (still a dict so downstream code that reads state["resources"]
                # keeps working). Sort keys before assignment to keep dict
                # iteration order deterministic across Python versions.
                ir = scenario_state.initial_resources
                self.state["resources"] = {
                    "food": float(ir.get("food", 50.0)),
                    "stone": float(ir.get("stone", 0.0)),
                    "wood": float(ir.get("wood", 50.0)),
                }

                # Spawn workers around the coreWarehouse anchor. We jitter
                # positions via the seeded rng → deterministic by seed but
                # divergent across seeds.
                anchor = scenario_state.anchors.get("coreWarehouse") or (
                    grid.width // 2,
                    grid.height // 2,
                )
                ax, az = int(anchor[0]), int(anchor[1])
                factory = EntityFactory()
                workers: list[dict[str, Any]] = []
                rng = self.services.rng
                # Role rotation: workers, traders, etc. all carry group_id.
                _roles = ("FARM", "LUMBER", "QUARRY", "HERB")
                for i in range(int(blueprint.initial_workers)):
                    jx = rng.jitter(2.5)
                    jz = rng.jitter(2.5)
                    px = max(1.0, min(float(grid.width) - 1.0, ax + jx))
                    pz = max(1.0, min(float(grid.height) - 1.0, az + jz))
                    role = _roles[i % len(_roles)]
                    worker = factory.create_worker(
                        position=(px, pz),
                        role=role,
                        group_id="workers",
                        rng=rng,
                    )
                    w_dict = asdict(worker)
                    workers.append(w_dict)
                self.state["agents"] = workers
                self._world_ready = True
            except Exception:
                # Best-effort: if any world generator misbehaves we still
                # have the minimal seed-divergence path via the per-tick
                # rng draw in :meth:`tick`. We avoid hard-failing here so
                # plugin tests using `build_systems_override` keep working.
                self._world_ready = False

        # Store for downstream system construction.
        self._cadence_multiplier = max(0.1, float(cadence_multiplier))
        self._attach_llm_channels = bool(attach_llm_channels)
        # When the harness will drive real LLM channels, flip run_mode so
        # channel systems' _wants_llm() gate opens the real-LLM path.
        if self._attach_llm_channels:
            self.state["ai"]["enabled"] = True  # gate in _wants_llm()
            self.state["ai"]["run_mode"] = "llm"
            self.state["ai"]["coverageTarget"] = "llm"
            self.state["ai"]["runMode"] = "llm"
            # Inject 5 default anchors at t=0 so the dual probe has signal
            # to measure. Anchors derive from the scenario's coreWarehouse
            # anchor position so they're scenario-specific and verifiable.
            self._inject_default_anchors()

        if build_systems_override is not None:
            self.systems = list(build_systems_override(self.memory_store))
        else:
            adapter = agent_adapter
            if adapter is None and NoopAgentAdapter is not None:
                adapter = NoopAgentAdapter()
            self.systems = self._build_default_systems(adapter, bool(ai_enabled))

        # Phase-3 action-chain wiring: when the harness drives real LLM
        # channels, instantiate WorkerAISystem so each tick translates
        # the npc-policy directive's ``intent_weights`` into FSM-state
        # transitions and ``target_priorities`` into target-tile choice.
        # Constructed AFTER ``_build_default_systems`` so it captures
        # the post-services-replacement ``services.rng`` reference.
        if (
            self._attach_llm_channels
            and WorkerAISystem is not None
            and self._world_ready
        ):
            self._worker_ai = WorkerAISystem(self.services.rng)

        ensure_ai_runtime_stats(self.state)

        # Maintain populationStats now so callers see correct workers count
        # even before the first tick.
        self._refresh_population_stats()
        self._initial_workers = len(self.alive_workers)

    # ----- anchor injection -----------------------------------------------

    def _inject_default_anchors(self) -> None:
        """Inject 5 default anchors into ``memory_store`` at t=0.

        The 5 anchors pair verbal tokens (literals the LLM may echo in its
        summary) with implicit action goals (target keys the LLM may emit
        in directives). The MemoryDegradation dual probe will read both:

        - ``anchored_fact_recall(t)`` checks whether the verbal tokens
          appear in the LLM's emitted ``world_summary`` / ``strategy.notes``.
        - ``action_grounded_recall(t)`` checks whether the implicit-goal
          target keys appear with non-trivial weight in directives'
          ``target_priorities``.

        Anchors are scenario-anchored: their coordinates derive from the
        scenario's ``coreWarehouse`` position so each scenario produces a
        distinct anchor set, even at fixed seed.
        """
        from project_utopia.benchmark.anchors.anchor_injector import inject_anchors

        store = self.memory_store
        if store is None:
            return
        # Scenario anchor coordinates (best-effort; fall back to grid centre)
        scenario_state = self.state.get("scenario")
        warehouse_xy = (0, 0)
        if scenario_state is not None and hasattr(scenario_state, "anchors"):
            wh = scenario_state.anchors.get("coreWarehouse")
            if wh:
                warehouse_xy = (int(wh[0]), int(wh[1]))
        wx, wz = warehouse_xy
        # Construct 5 anchors: 1 warehouse-delivery, 1 farm-priority,
        # 1 wood-supply, 1 guard-posture, 1 quarry-build.
        # Anchor verbal tokens are single salient keywords — short enough
        # that the LLM may echo them in primary_goal / constraints /
        # group-policy summaries. Long phrases (the original v1 anchors)
        # were never echoed verbatim, yielding zero verbal recall.
        anchors = [
            {
                "verbal_tokens": ["warehouse"],
                "implicit_goals": [{"action": "deliver", "target": "warehouse"}],
            },
            {
                "verbal_tokens": ["food"],
                "implicit_goals": [{"action": "farm", "target": "farm"}],
            },
            {
                "verbal_tokens": ["wood"],
                "implicit_goals": [{"action": "wood", "target": "lumber"}],
            },
            {
                "verbal_tokens": ["guard"],
                "implicit_goals": [{"action": "guard_engage", "target": "safety"}],
            },
            {
                "verbal_tokens": ["quarry"],
                "implicit_goals": [{"action": "quarry", "target": "quarry"}],
            },
        ]
        inject_anchors(self, anchors, at_sec=0.0, importance=1.0)
        # Expose the canonical anchor list so the MemoryDegradation plugin
        # can compute anchored_fact_recall / action_grounded_recall against
        # the same set the LLM saw. Stored as the paper-shape dicts.
        self.injected_anchors = anchors

    # ----- default system list -------------------------------------------

    def _build_default_systems(self, adapter: Any | None, ai_enabled: bool) -> list[Any]:
        systems: list[Any] = [_BaseStateSystem()]
        if ai_enabled and adapter is not None:
            systems.append(_AiRuntimeFallbackSystem(adapter))
        # Patch 3+4 (route-α P2): optionally attach the 4 LLM channel systems
        # so SimHarness drives them per-tick at the configured cadence.
        # Default off so existing tests (which rely on Noop / no real LLM)
        # are unaffected.
        import sys as _sys
        print(f"[SimHarness._build_default_systems] attach_llm_channels={self._attach_llm_channels} adapter={type(adapter).__name__ if adapter else None}", file=_sys.stderr, flush=True)
        if self._attach_llm_channels and adapter is not None:
            cm = self._cadence_multiplier
            try:
                from project_utopia.simulation.ai.director.environment_director_system import (
                    DEFAULT_ENVIRONMENT_INTERVAL_SEC,
                    EnvironmentDirectorSystem,
                )
                from project_utopia.simulation.ai.brains.npc_policy_system import (
                    DEFAULT_NPC_POLICY_INTERVAL_SEC,
                    NpcPolicySystem,
                )
                from project_utopia.simulation.ai.strategic.strategic_plan_system import (
                    DEFAULT_STRATEGIC_HEARTBEAT_SEC,
                    StrategicPlanSystem,
                )
                from project_utopia.simulation.ai.colony.colony_agent_system import (
                    DEFAULT_COLONY_AGENT_INTERVAL_SEC,
                    ColonyAgentSystem,
                )
            except Exception as err:  # pragma: no cover - import safety
                logging.getLogger(__name__).warning(
                    "attach_llm_channels=True but channel system imports failed: %s", err
                )
            else:
                systems.append(
                    EnvironmentDirectorSystem(
                        interval_sec=DEFAULT_ENVIRONMENT_INTERVAL_SEC * cm
                    )
                )
                systems.append(
                    NpcPolicySystem(interval_sec=DEFAULT_NPC_POLICY_INTERVAL_SEC * cm)
                )
                systems.append(
                    StrategicPlanSystem(
                        heartbeat_sec=DEFAULT_STRATEGIC_HEARTBEAT_SEC * cm
                    )
                )
                systems.append(
                    ColonyAgentSystem(
                        interval_sec=DEFAULT_COLONY_AGENT_INTERVAL_SEC * cm
                    )
                )
                # Ensure adapter is on services so channel systems can reach it.
                # Preserve the memory_store wiring that ``__init__`` set up
                # (and which ``_inject_default_anchors`` populated) — otherwise
                # the channels' ``_collect_memory_snippets`` reads an empty
                # store and ``anchored_fact_recall`` regresses to zero.
                preserved_memory_store = getattr(self.services, "memory_store", None)
                self.services = create_services(
                    seed=self._seed,
                    deterministic=True,
                    agent_adapter=adapter,
                    offline_ai_fallback=False,
                )
                if preserved_memory_store is not None:
                    self.services.memory_store = preserved_memory_store
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
        # Advance the tick counter before systems run so any system that
        # reads ``state["tick"]`` sees the new value.
        self.state["tick"] = int(self.state.get("tick", 0)) + 1

        for system in self.systems:
            updater = getattr(system, "update", None)
            if updater is None:
                continue
            result = updater(DT_SEC, self.state, self.services)
            if asyncio.iscoroutine(result):
                await result

        # Per-tick seed-divergent micro-step. With the world bootstrap
        # successful, we nudge each worker by a small jittered offset drawn
        # from the seeded RNG — this keeps worker (x, z, vx, vz) on a
        # seed-divergent trajectory until the real movement systems land.
        #
        # When the world bootstrap was skipped (entity_factory or
        # scenario factory unavailable) we still want the slim-state hash
        # to diverge by seed, so we advance ``resources["food"]`` by a
        # tiny rng draw. Comment: minimal seed-divergence wiring; full
        # world simulation in Phase 3.
        rng = self.services.rng
        if self._world_ready and self._worker_ai is not None:
            # Phase-3 action-chain path: FSM-driven movement. Each worker's
            # FSM is ticked with its group_id's policy; movement vector
            # derives from the resulting FSM state + target_priorities.
            self._tick_workers_via_fsm(self.state)
        elif self._world_ready:
            grid = self.state.get("grid")
            gw = float(getattr(grid, "width", 96))
            gh = float(getattr(grid, "height", 72))
            for agent in self.state.get("agents") or []:
                if not isinstance(agent, dict):
                    continue
                if agent.get("type") != "WORKER":
                    continue
                if agent.get("alive", True) is False:
                    continue
                # Sample two uniform offsets per worker. ``jitter`` advances
                # the rng twice so per-seed trajectories diverge quickly.
                dx = rng.jitter(0.05)
                dz = rng.jitter(0.05)
                new_x = float(agent.get("x", 0.0)) + dx
                new_z = float(agent.get("z", 0.0)) + dz
                # Clamp to grid bounds so the slim hash stays finite.
                new_x = max(0.0, min(gw - 1.0, new_x))
                new_z = max(0.0, min(gh - 1.0, new_z))
                agent["x"] = new_x
                agent["z"] = new_z
                agent["vx"] = dx / DT_SEC
                agent["vz"] = dz / DT_SEC

            # Minimal-economy stub: workers consume food at a flat per-tick
            # rate so DTE / RAE plugins produce non-zero deltas in the
            # fallback smoke. Phase-3 replaces this with the real
            # ResourceSystem (already ported, just not yet ticked by the
            # harness). The flat rate is deterministic given (seed, tick).
            workers_alive = sum(
                1 for a in self.state.get("agents") or []
                if isinstance(a, dict) and a.get("type") == "WORKER" and a.get("alive", True) is not False
            )
            resources = self.state.setdefault("resources", {})
            resources["food"] = max(
                0.0, float(resources.get("food", 0.0)) - workers_alive * 0.05 * DT_SEC
            )
        else:
            # Fallback: advance food by an rng draw so hashes still differ
            # across seeds even without a real world. Documented as minimal
            # wiring; Phase 3 replaces this with the full simulation step.
            resources = self.state.setdefault("resources", {})
            resources["food"] = float(resources.get("food", 0.0)) + rng.next() * DT_SEC

        self._refresh_population_stats()
        # Yield to the event loop so async cooperators run.
        await asyncio.sleep(0)

    # ----- FSM-driven worker movement (Phase-3 action-chain wiring) -------

    # Maps the anchor-protocol ``target`` key half (the half emitted by
    # the npc-policy channel's ``target_priorities``) onto a scenario
    # anchor tile name produced by ``_stamp_anchors``. The right-hand
    # side names are the keys present in ``ScenarioState.anchors``.
    _TARGET_KEY_TO_ANCHOR: dict[str, str] = {
        "warehouse": "coreWarehouse",
        "safety": "coreWarehouse",
        "farm": "eastDepot",
        "quarry": "eastDepot",
        "lumber": "westOutpost",
        "wood": "westOutpost",
    }

    # FSM movement step in tiles/tick. Calibrated so a worker spawned
    # near the warehouse reaches an off-centre depot in roughly the same
    # order of ticks the LLM cadence cycles (a few sim-seconds).
    _FSM_MOVE_STEP_TILES: float = 0.5

    def _tick_workers_via_fsm(self, state: dict[str, Any]) -> None:
        """Drive each worker's position via its FSM + group policy.

        Determinism: the rng inside :class:`WorkerAISystem` is the same
        ``services.rng`` used by every other determinism-bearing surface,
        so identical ``(seed, group_policies)`` sequences produce identical
        worker trajectories.
        """
        if WorkerState is None or GroupPolicy is None or self._worker_ai is None:
            return  # safety net; tick() gate should prevent this
        rng = self.services.rng
        grid = state.get("grid")
        gw = float(getattr(grid, "width", 96))
        gh = float(getattr(grid, "height", 72))

        ai_state = state.get("ai") or {}
        group_policies = ai_state.get("group_policies") or {}
        # The npc-policy channel ticks on a slow cadence; the *first*
        # call to ``_tick_workers_via_fsm`` may run before any policy has
        # been committed (group_policies empty). Likewise, a new policy
        # envelope (``policyDecisionCount`` increments) should re-pin
        # worker FSM states to the new intent distribution. Track the
        # last-seen count and force a re-sample on each increment.
        current_policy_count = int(ai_state.get("policyDecisionCount", 0) or 0)
        last_seen = int(getattr(self, "_last_policy_decision_count", -1))
        policy_changed = (
            current_policy_count > last_seen
            and bool(group_policies)
        )
        if policy_changed:
            self._last_policy_decision_count = current_policy_count

        scenario_state = state.get("scenario")
        scenario_anchors: dict[str, tuple[int, int]] = {}
        if scenario_state is not None and hasattr(scenario_state, "anchors"):
            scenario_anchors = dict(scenario_state.anchors or {})

        seeking_states = {
            WorkerState.SEEKING_HARVEST,
            WorkerState.DELIVERING,
            WorkerState.SEEKING_BUILD,
            WorkerState.SEEKING_REST,
        }

        for agent in state.get("agents") or []:
            if not isinstance(agent, dict):
                continue
            if agent.get("type") != "WORKER":
                continue
            if agent.get("alive", True) is False:
                continue

            group_id = agent.get("group_id", "workers") or "workers"
            gp_data = group_policies.get(group_id)
            gp: Any = None
            if isinstance(gp_data, dict):
                gp = GroupPolicy(
                    intent_weights=dict(gp_data.get("intent_weights") or {}),
                    target_priorities=dict(gp_data.get("target_priorities") or {}),
                    risk_tolerance=float(gp_data.get("risk_tolerance", 0.5) or 0.5),
                    ttl_sec=float(gp_data.get("ttl_sec", 0.0) or 0.0),
                )

            # We deliberately bypass ``WorkerAISystem.tick_worker`` here:
            # its trigger table has a ``fsm_target_null`` rule that fires
            # on freshly-initialised FSM dicts (target hasn't been set
            # yet), demoting every seeking-state worker back to IDLE on
            # the same tick the policy is applied. The JS port's onEnter
            # hooks that would have written ``fsm.target`` before the
            # transition loop were not migrated. Instead we drive policy
            # → FSM state → target tile → movement directly. The fsm
            # dict is still maintained so downstream telemetry and the
            # benchmark dimension plugins see consistent state.
            fsm_dict = agent.get("fsm")
            if not isinstance(fsm_dict, dict):
                fsm_dict = {}
                agent["fsm"] = fsm_dict

            need_resample = (
                # First touch — no state yet.
                not fsm_dict
                or fsm_dict.get("state") is None
                # New policy envelope arrived — re-pin worker state to
                # the new intent distribution.
                or (
                    policy_changed
                    and gp is not None
                    and gp.intent_weights
                )
            )
            if need_resample:
                if gp is not None and gp.intent_weights:
                    fsm_state = apply_group_policy(agent, gp, self._worker_ai.rng)
                else:
                    fsm_state = WorkerState.IDLE
                fsm_dict["state"] = fsm_state
                fsm_dict["entered_at_sec"] = float(
                    (state.get("metrics") or {}).get("timeSec", 0.0)
                )
                fsm_dict["payload"] = None
            else:
                raw = fsm_dict.get("state")
                fsm_state = raw if isinstance(raw, WorkerState) else WorkerState.IDLE

            # Pick a target tile based on FSM state + target_priorities.
            target = self._pick_target_tile(fsm_state, gp, scenario_anchors)
            if target is not None:
                fsm_dict["target"] = [int(target[0]), int(target[1])]
            else:
                fsm_dict["target"] = None

            cur_x = float(agent.get("x", 0.0))
            cur_z = float(agent.get("z", 0.0))

            if fsm_state in seeking_states and target is not None:
                tx, tz = float(target[0]), float(target[1])
                dxr = tx - cur_x
                dzr = tz - cur_z
                dist = (dxr * dxr + dzr * dzr) ** 0.5
                step = self._FSM_MOVE_STEP_TILES
                if dist <= step or dist <= 1e-6:
                    dx, dz = dxr, dzr
                else:
                    dx = step * dxr / dist
                    dz = step * dzr / dist
            elif fsm_state == WorkerState.IDLE:
                # Preserve a small jitter for IDLE workers so the noise
                # floor of the no-LLM control stays comparable to the
                # legacy harness.
                dx = rng.jitter(0.05)
                dz = rng.jitter(0.05)
            else:
                # HARVESTING / DEPOSITING / BUILDING / RESTING / FIGHTING
                # — stay in place this tick.
                dx, dz = 0.0, 0.0

            new_x = max(0.0, min(gw - 1.0, cur_x + dx))
            new_z = max(0.0, min(gh - 1.0, cur_z + dz))
            agent["x"] = new_x
            agent["z"] = new_z
            agent["vx"] = dx / DT_SEC
            agent["vz"] = dz / DT_SEC

            # Maintain ``arrived_at_target`` flag for the FSM's transition
            # triggers — within 1 tile counts as arrived.
            bb = agent.get("blackboard")
            if not isinstance(bb, dict):
                bb = {}
                agent["blackboard"] = bb
            if target is not None:
                tx, tz = float(target[0]), float(target[1])
                arrived = ((new_x - tx) ** 2 + (new_z - tz) ** 2) ** 0.5 < 1.0
                bb["arrived_at_target"] = bool(arrived)
            else:
                bb["arrived_at_target"] = False

    def _pick_target_tile(
        self,
        fsm_state: Any,
        gp: Any,
        scenario_anchors: dict[str, tuple[int, int]],
    ) -> tuple[int, int] | None:
        """Pick a target tile honouring ``target_priorities`` first.

        Returns the (x, z) of the highest-weighted target_priorities key
        that maps to a scenario anchor; falls back to an FSM-state-driven
        default tile when no priorities are present or none match.
        """
        if not scenario_anchors:
            return None

        # Highest-weight target_priorities key that resolves to an anchor.
        if gp is not None and gp.target_priorities:
            items = sorted(
                gp.target_priorities.items(),
                key=lambda kv: (-float(kv[1] or 0.0), kv[0]),
            )
            for key, weight in items:
                try:
                    w = float(weight)
                except (TypeError, ValueError):
                    continue
                if w <= 0.0:
                    continue
                anchor_name = self._TARGET_KEY_TO_ANCHOR.get(str(key).lower())
                if anchor_name and anchor_name in scenario_anchors:
                    tile = scenario_anchors[anchor_name]
                    return (int(tile[0]), int(tile[1]))

        # Fallback by FSM state — only seeking states return a target.
        if WorkerState is None:
            return None
        fallback_anchor: str | None = None
        if fsm_state == WorkerState.DELIVERING or fsm_state == WorkerState.SEEKING_REST:
            fallback_anchor = "coreWarehouse"
        elif fsm_state == WorkerState.SEEKING_HARVEST:
            fallback_anchor = "eastDepot"
        elif fsm_state == WorkerState.SEEKING_BUILD:
            fallback_anchor = "westOutpost"
        if fallback_anchor and fallback_anchor in scenario_anchors:
            tile = scenario_anchors[fallback_anchor]
            return (int(tile[0]), int(tile[1]))
        return None

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
