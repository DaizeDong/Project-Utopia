"""DimensionPlugin — abstract base class for the 5 benchmark dimensions.

Minimal stub created by the dimensions agent so its imports compile when the
framework agent has not yet landed the full implementation. The framework
agent owns the canonical version; this file MUST keep the same surface
(``collect_samples`` + ``self_score`` + ``id`` + ``label`` + ``score_dimensions``)
so a subsequent rebase is a no-op.

Each concrete plugin (Resource-Allocation Efficiency, Group Dynamics, Memory
Degradation, Decision Token Efficiency, Hierarchical Coordination) exposes a
class instance with these class-level attributes set and an awaitable
``collect_samples`` plus a sync ``self_score`` method.
"""

from __future__ import annotations

import abc
from typing import Any


class DimensionPlugin(abc.ABC):
    """Abstract dimension plugin contract.

    Subclasses MUST set ``id``, ``label``, and ``score_dimensions`` as
    class-level attributes (or ``__init__`` instance attributes).
    """

    id: str = ""
    label: str = ""
    score_dimensions: tuple[str, ...] = ()

    @abc.abstractmethod
    async def collect_samples(
        self,
        harness: Any,
        opts: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Drive ``harness`` for the configured duration, returning sample dicts.

        Each sample is a dict carrying everything ``self_score`` needs to
        produce the score family — sampling decisions live entirely inside the
        plugin so the SimHarness loop stays uniform.
        """
        raise NotImplementedError

    @abc.abstractmethod
    def self_score(
        self,
        samples: list[dict[str, Any]],
        ctx: dict[str, Any] | None = None,
    ) -> dict[str, float]:
        """Score the samples produced by :meth:`collect_samples`.

        Must be deterministic and side-effect free. Empty samples MUST return
        a dict with all ``score_dimensions`` keys present at sensible defaults
        (0 or NaN-safe) so ScoringEngine never sees a missing key.
        """
        raise NotImplementedError


__all__ = ["DimensionPlugin"]
