"""Off-thread A* worker pool (port of ``src/simulation/navigation/PathWorkerPool.js``).

The Python harness runs in **deterministic mode** by default — in that
configuration this pool degrades to a synchronous in-thread call to
:func:`a_star`. Non-deterministic mode (rare; only for ad-hoc profiling)
spins up a fixed-size ``ThreadPoolExecutor`` with **max_workers=4**.

Deterministic worker count: the JS source originally read
``navigator.hardwareConcurrency`` and the RC3 audit fixed this to a hard
constant so academic CI and laptops produce the same number of in-flight
jobs. The Python port mirrors that constant (see :data:`_DEFAULT_WORKERS`).
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from project_utopia.simulation.navigation.a_star import a_star
from project_utopia.world.grid import Grid

__all__ = [
    "PathWorkerPool",
    "build_path_worker_key",
]

# Fixed worker count for non-deterministic mode. Do NOT replace with
# ``os.cpu_count()`` — that's a determinism hazard the JS RC3 audit
# already fixed (see ``PathWorkerPool.js`` DETERMINISTIC_WORKER_COUNT).
_DEFAULT_WORKERS = 4


def build_path_worker_key(
    grid_version: int,
    start: tuple[int, int],
    goal: tuple[int, int],
    cost_version: int = 0,
    faction: str = "colony",
) -> str:
    """Build the cache/job key string used to look up worker-pool results.

    The format matches PathCache so a result produced off-thread can be
    handed back to the cache without re-keying.
    """
    return (
        f"{int(grid_version)}:{int(cost_version)}:"
        f"{int(start[0])},{int(start[1])}->"
        f"{int(goal[0])},{int(goal[1])}:{faction}"
    )


class PathWorkerPool:
    """Thread-pool wrapper around :func:`a_star`.

    Parameters
    ----------
    deterministic
        When ``True`` (the default), every :meth:`request` is executed
        synchronously in the calling thread so trace order is reproducible.
        Set to ``False`` only for profiling.
    max_workers
        Honoured only when ``deterministic=False``. Hard-capped at 4 — see
        :data:`_DEFAULT_WORKERS`.
    """

    __slots__ = (
        "_deterministic",
        "_executor",
        "_pending",
        "_results",
        "available",
        "stats",
    )

    def __init__(self, *, deterministic: bool = True, max_workers: int = _DEFAULT_WORKERS) -> None:
        self._deterministic: bool = bool(deterministic)
        self._executor: ThreadPoolExecutor | None = None
        self._pending: dict[str, Future] = {}
        self._results: dict[str, list[tuple[int, int]] | None] = {}
        self.available: bool = True  # always available — sync fallback is the path
        self.stats: dict[str, int] = {
            "requests": 0,
            "completed": 0,
            "failed": 0,
        }
        if not self._deterministic:
            self._executor = ThreadPoolExecutor(
                max_workers=min(4, max(1, int(max_workers))),
                thread_name_prefix="utopia-path",
            )

    # ---- core API ---------------------------------------------------------

    def request(
        self,
        *,
        key: str,
        grid: Grid,
        start: tuple[int, int],
        goal: tuple[int, int],
        weather_move_cost_multiplier: float = 1.0,
        dynamic_costs: dict[str, Any] | None = None,
        options: dict[str, Any] | None = None,
    ) -> bool:
        """Submit a path-finding job. Returns ``True`` once accepted."""
        self.stats["requests"] += 1
        if self._deterministic or self._executor is None:
            # Synchronous fallback — keeps trace order reproducible.
            path = a_star(
                grid,
                start,
                goal,
                weather_move_cost_multiplier=weather_move_cost_multiplier,
                dynamic_costs=dynamic_costs,
                options=options,
            )
            self._results[key] = path
            self.stats["completed"] += 1
            if path is None:
                self.stats["failed"] += 1
            return True
        # Async path — submit and stash the future.
        future = self._executor.submit(
            a_star,
            grid,
            start,
            goal,
            weather_move_cost_multiplier=weather_move_cost_multiplier,
            dynamic_costs=dynamic_costs,
            options=options,
        )
        self._pending[key] = future
        return True

    def has_pending(self, key: str) -> bool:
        """Return ``True`` if a job for ``key`` is in flight."""
        future = self._pending.get(key)
        return future is not None and not future.done()

    def take(self, key: str) -> list[tuple[int, int]] | None:
        """Return the result for ``key`` if ready (otherwise ``None``).

        Calling ``take`` consumes the result — a second call for the same
        key returns ``None``.
        """
        # Deterministic path stashed the result synchronously.
        if key in self._results:
            path = self._results.pop(key)
            return path
        future = self._pending.get(key)
        if future is None or not future.done():
            return None
        self._pending.pop(key, None)
        try:
            path = future.result()
        except Exception:  # pragma: no cover - defensive
            self.stats["failed"] += 1
            return None
        self.stats["completed"] += 1
        if path is None:
            self.stats["failed"] += 1
        return path

    def get_stats(self) -> dict[str, int]:
        """Return a snapshot of the pool's telemetry."""
        return dict(self.stats)

    def shutdown(self) -> None:
        """Tear down the worker pool. Idempotent."""
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)
            self._executor = None
        self._pending.clear()
        self._results.clear()

    def __del__(self) -> None:  # pragma: no cover
        try:
            self.shutdown()
        except Exception:
            pass
