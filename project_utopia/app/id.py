"""Monotonic ID minter (port of ``src/app/id.js``).

The JS module keeps a module-level integer counter that is read+bumped on
every ``nextId`` call. The Python port preserves that exact semantics with
a module-level ``int`` guarded by a single helper. We expose both the
JS-style camelCase name (``nextId``) and a snake_case alias so future
callers can pick whichever they prefer.
"""

from __future__ import annotations

__all__ = ["nextId", "next_id", "resetIdsForTest", "reset_ids_for_test"]


_seq: int = 1


def nextId(prefix: str = "id") -> str:
    """Return a new unique ID string formatted as ``"{prefix}_{n}"``.

    Counter is process-wide and not thread-safe. For multi-threaded use
    cases, switch to :func:`itertools.count` guarded by a lock — but the
    JS source is single-threaded and we preserve that invariant.
    """
    global _seq
    out = f"{prefix}_{_seq}"
    _seq += 1
    return out


def resetIdsForTest() -> None:
    """Reset the counter back to 1. Test-only utility."""
    global _seq
    _seq = 1


# Snake-case aliases for downstream callers preferring PEP-8 names.
next_id = nextId
reset_ids_for_test = resetIdsForTest
