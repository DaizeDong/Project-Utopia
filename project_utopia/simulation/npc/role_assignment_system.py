"""Role assignment handoff (lean port of
``src/simulation/population/RoleAssignmentSystem.js``).

Phase 1 ports the **role-change primitive** (``set_worker_role``) plus a
tiny quota-driven assignment loop. The JS source's heavy logic — band
tables, BUILDER reservation cleanup, GUARD promotion under threat,
sticky-bonus hysteresis, raid-event preempt — is intentionally omitted;
the academic-benchmark scenarios pick roles up-front so the assignment
system only needs to honour the channel directive coming from
``strategic-plan`` (Phase 2 will wire that).
"""

from __future__ import annotations

from typing import Any, Iterable

__all__ = ["RoleAssignmentSystem", "set_worker_role", "default_role_quota"]


# Default role-quota distribution; matches the JS Wave-1 perWorker × floor
# formula at low population. Used when no LLM directive is supplied.
def default_role_quota(worker_count: int) -> dict[str, int]:
    """Return a rough ``{role: count}`` distribution for ``worker_count`` workers."""
    n = max(0, int(worker_count))
    if n == 0:
        return {"FARM": 0, "WOOD": 0, "HAUL": 0, "STONE": 0, "BUILDER": 0}
    farm = max(2, int(n * 0.35))
    wood = max(1, int(n * 0.20))
    haul = max(1, int(n * 0.20))
    stone = max(1, int(n * 0.10))
    builder = max(0, n - farm - wood - haul - stone)
    return {"FARM": farm, "WOOD": wood, "HAUL": haul, "STONE": stone, "BUILDER": builder}


def set_worker_role(
    worker: Any,
    new_role: str,
    *,
    now_sec: float = 0.0,
    cooldown_sec: float = 4.0,
    force: bool = False,
) -> bool:
    """Re-bind ``worker.role`` to ``new_role``.

    Honours a cooldown so a single worker can't flip roles every tick.
    Returns ``True`` iff the role actually changed.
    """
    current = getattr(worker, "role", None)
    if current == new_role:
        return False
    if not force and cooldown_sec > 0:
        last = float(getattr(worker, "_role_changed_at_sec", float("-inf")))
        if (now_sec - last) < float(cooldown_sec):
            return False
    setattr(worker, "role", new_role)
    setattr(worker, "_role_changed_at_sec", float(now_sec))
    return True


class RoleAssignmentSystem:
    """Tiny role-allocation driver."""

    __slots__ = ("name", "quota_fn", "cooldown_sec", "stats")

    def __init__(
        self,
        *,
        quota_fn=default_role_quota,
        cooldown_sec: float = 4.0,
    ) -> None:
        self.name = "RoleAssignmentSystem"
        self.quota_fn = quota_fn
        self.cooldown_sec = float(cooldown_sec)
        self.stats: dict[str, int] = {"role_changes": 0}

    def update(
        self,
        workers: list[Any],
        *,
        now_sec: float = 0.0,
        quota_override: dict[str, int] | None = None,
    ) -> None:
        """Re-assign worker roles toward ``quota_override`` (or default).

        Stable role assignment: workers are processed in id-sorted order so
        the same input list produces the same output regardless of how
        the caller built it.
        """
        alive = [w for w in workers if getattr(w, "alive", True) is not False]
        alive.sort(key=lambda w: str(getattr(w, "id", "")))
        if not alive:
            return

        quota = dict(quota_override or self.quota_fn(len(alive)))
        # Allocate roles greedily in a deterministic order.
        for role in sorted(quota.keys()):
            target = max(0, int(quota[role]))
            have = sum(1 for w in alive if getattr(w, "role", None) == role)
            need = target - have
            if need <= 0:
                continue
            # Promote workers that currently hold the "fullest" role.
            donors = sorted(
                [w for w in alive if getattr(w, "role", None) != role],
                key=lambda w: (
                    str(getattr(w, "role", "") or ""),
                    str(getattr(w, "id", "") or ""),
                ),
            )
            for donor in donors:
                if need <= 0:
                    break
                if set_worker_role(
                    donor, role, now_sec=now_sec, cooldown_sec=self.cooldown_sec
                ):
                    self.stats["role_changes"] += 1
                    need -= 1

    def workers_by_role(self, workers: Iterable[Any]) -> dict[str, list[Any]]:
        """Group ``workers`` by role for telemetry / diagnostics."""
        out: dict[str, list[Any]] = {}
        for w in workers:
            role = str(getattr(w, "role", "") or "")
            out.setdefault(role, []).append(w)
        return out
