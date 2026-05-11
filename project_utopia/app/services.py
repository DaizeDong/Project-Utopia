"""Service factory (port of ``src/app/createServices.js``).

The JS factory wires together: pathfinding cache, path worker pool, LLM
client, fallback adapters, RNG. Phase 1 only ships the *deterministic*
core (RNG + simulation clock) plus typed placeholders for everything
else. Subsequent subagents will fill in :class:`Services` fields as their
modules land.

Wall-clock budgets and async worker pools are gated by
``deterministic=True`` exactly like the JS source: a deterministic run
disables them so the benchmark harness is bit-reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .rng import SeededRng, deriveRngSeed
from .sim_clock import SimulationClock

__all__ = ["Services", "create_services"]


@dataclass(slots=True)
class Services:
    """Container of cross-cutting singletons threaded through SimHarness.

    The Phase-1 scope only populates ``rng``, ``deterministic``, and
    ``clock``. Every other field is a placeholder that a later subagent
    will replace with the real instance (path cache, LLM client, etc.).
    Each placeholder is typed ``Any | None`` so type-checking stays loose
    until the concrete classes exist.

    Attributes
    ----------
    rng : SeededRng
        Seeded PCG64 random number generator. Always non-null.
    deterministic : bool
        When ``True``, wall-clock budgets and worker pools are disabled.
    clock : SimulationClock
        Day/night clock instance.
    path_cache, path_worker_pool, path_budget, reachability,
    path_fail_blacklist, llm_client, fallback_environment,
    fallback_policies :
        Placeholders. Populated by future subagents.
    """

    rng: SeededRng
    deterministic: bool
    clock: SimulationClock

    # --- placeholders wired by later subagents -----------------------------
    path_cache: Any | None = None
    path_worker_pool: Any | None = None
    path_budget: dict[str, Any] = field(
        default_factory=lambda: {"tick": -1, "usedMs": 0.0, "skipped": 0, "maxMs": float("inf")}
    )
    reachability: Any | None = None
    path_fail_blacklist: Any | None = None
    llm_client: Any | None = None
    fallback_environment: Any | None = None
    fallback_policies: Any | None = None

    def dispose(self) -> None:
        """Release any held resources (worker pools, sockets…).

        Phase 1 has nothing to release. Subagents that add worker pools
        should override this to call ``self.path_worker_pool.dispose()``.
        """
        pool = self.path_worker_pool
        if pool is not None and hasattr(pool, "dispose"):
            pool.dispose()


def create_services(
    seed: int | str = 1337,
    *,
    deterministic: bool = True,
    agent_adapter: Any | None = None,
    base_url: str = "",
    offline_ai_fallback: bool = False,
    enable_path_workers: bool = False,
) -> Services:
    """Build a :class:`Services` instance from a seed + flags.

    Parameters
    ----------
    seed
        Root simulation seed. Forwarded through
        :func:`~project_utopia.app.rng.deriveRngSeed` with the
        ``"simulation"`` namespace, exactly like the JS factory.
    deterministic
        If ``True`` (the default — academic-benchmark mode), wall-clock
        path budgets are disabled (``maxMs = +inf``) and the async path
        worker pool is not constructed.
    agent_adapter, base_url, offline_ai_fallback, enable_path_workers
        Accepted for Phase-2 compatibility. Currently unused; will be
        wired once :mod:`project_utopia.simulation.ai.llm` lands.

    Returns
    -------
    Services
        A populated dataclass ready for the simulation harness.

    Examples
    --------
    >>> services = create_services(seed=42)
    >>> services.deterministic
    True
    >>> services.rng.next() == create_services(seed=42).rng.next()
    True
    """
    rng = SeededRng(seed=deriveRngSeed(seed, "simulation"))
    clock = SimulationClock()
    path_budget_max_ms = float("inf") if deterministic else 3.0

    services = Services(
        rng=rng,
        deterministic=deterministic,
        clock=clock,
    )
    services.path_budget = {
        "tick": -1,
        "usedMs": 0.0,
        "skipped": 0,
        "maxMs": path_budget_max_ms,
    }

    # The agent_adapter / offline_ai_fallback / enable_path_workers flags
    # are intentionally accepted but unused — Phase-1 scope. The mere
    # presence of the parameters lets the harness subagent call
    # ``create_services(seed, agent_adapter=...)`` without raising TypeError
    # before the LLM layer is ported.
    _ = (agent_adapter, base_url, offline_ai_fallback, enable_path_workers)

    return services
