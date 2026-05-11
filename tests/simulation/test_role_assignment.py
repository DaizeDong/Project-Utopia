"""Role-assignment cooldown + quota tests."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from project_utopia.simulation.npc.role_assignment_system import (
    RoleAssignmentSystem,
    default_role_quota,
    set_worker_role,
)


@dataclass
class _W:
    id: str
    role: str = "FARM"
    alive: bool = True
    _role_changed_at_sec: float = float("-inf")


def test_set_worker_role_changes_role() -> None:
    """``set_worker_role`` flips the role and stamps the cooldown timer."""
    w = _W(id="w1", role="FARM")
    changed = set_worker_role(w, "WOOD", now_sec=10.0, cooldown_sec=4.0)
    assert changed is True
    assert w.role == "WOOD"
    assert w._role_changed_at_sec == 10.0


def test_set_worker_role_respects_cooldown() -> None:
    """Within cooldown, role-change is rejected."""
    w = _W(id="w1", role="FARM", _role_changed_at_sec=10.0)
    changed = set_worker_role(w, "WOOD", now_sec=12.0, cooldown_sec=4.0)
    assert changed is False
    assert w.role == "FARM"


def test_set_worker_role_force_bypasses_cooldown() -> None:
    """``force=True`` overrides the cooldown."""
    w = _W(id="w1", role="FARM", _role_changed_at_sec=10.0)
    changed = set_worker_role(w, "WOOD", now_sec=12.0, cooldown_sec=4.0, force=True)
    assert changed is True
    assert w.role == "WOOD"


def test_default_quota_distribution() -> None:
    """Default quota covers every role and sums to n."""
    quota = default_role_quota(10)
    assert sum(quota.values()) == 10
    for v in quota.values():
        assert v >= 0


def test_role_assignment_system_drives_population_toward_quota() -> None:
    """Driving 10 FARM workers toward a quota of 2 builders → 2 BUILDERs."""
    workers = [_W(id=f"w{i:02d}") for i in range(10)]
    system = RoleAssignmentSystem(cooldown_sec=0.0)
    system.update(workers, now_sec=0.0, quota_override={"FARM": 8, "BUILDER": 2})
    by_role: dict[str, int] = {}
    for w in workers:
        by_role[w.role] = by_role.get(w.role, 0) + 1
    assert by_role.get("BUILDER", 0) == 2
    assert by_role.get("FARM", 0) == 8
