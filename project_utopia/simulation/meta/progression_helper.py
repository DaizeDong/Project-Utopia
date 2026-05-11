"""Slim port of the only live function in ``ProgressionSystem.js``.

The JS source is 920 lines but the RC3 audit found that only
``isRecoveryEssential`` is referenced at runtime (called by
``ColonyDirectorSystem`` and the build-proposer orchestrator). Everything
else — milestone toasts, achievement tracking, chronicle flavor — was
already dead before the academic-benchmark refactor and is intentionally
NOT migrated.
"""

from __future__ import annotations

from typing import FrozenSet

__all__ = ["RECOVERY_ESSENTIAL_TYPES", "is_recovery_essential"]


# Same four build types the JS source whitelists when the colony is in
# food-runway recovery mode. Wood production (lumber) is essential because
# farms cost wood — a recovery cycle without lumber starves the build
# queue at wood=0.
RECOVERY_ESSENTIAL_TYPES: FrozenSet[str] = frozenset(
    {"farm", "lumber", "warehouse", "road"}
)


def is_recovery_essential(build_type: str) -> bool:
    """Return ``True`` when ``build_type`` is in the recovery whitelist.

    Mirrors :data:`RECOVERY_ESSENTIAL_TYPES`. Any planner / director layer
    that needs to honour the "expansion paused" gate should call this rather
    than hardcode the set, so future drift only has to be reconciled in one
    place.
    """
    return str(build_type) in RECOVERY_ESSENTIAL_TYPES
