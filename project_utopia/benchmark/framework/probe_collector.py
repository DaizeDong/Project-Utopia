"""Behavioural-capability probes (port of ``ProbeCollector.js``).

The probes need a live SimHarness with the full sim-system stack to be
meaningful. The Python port therefore keeps the *probe registry* + the
public ``run_probes`` entry point so downstream code compiles, but the
sample-collection bodies require the system stack (still to be ported by
later subagents). Each probe stub returns a placeholder score with a
``details.error`` note so missing sim systems are visible rather than
silently zeroed.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, MutableMapping

__all__ = ["PROBES", "run_probes"]


def _clamp01(v: float) -> float:
    if v < 0:
        return 0.0
    if v > 1:
        return 1.0
    return v


async def _probe_unavailable(probe_id: str, opts: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": probe_id,
        "label": probe_id,
        "score": 0.0,
        "details": {
            "error": (
                "probe unavailable: SimHarness sim-system stack not yet "
                "ported (Phase 2/3)"
            )
        },
    }


async def _probe_resource_triage(opts: dict[str, Any]) -> dict[str, Any]:
    return await _probe_unavailable("RESOURCE_TRIAGE", opts)


async def _probe_threat_response(opts: dict[str, Any]) -> dict[str, Any]:
    return await _probe_unavailable("THREAT_RESPONSE", opts)


async def _probe_bottleneck_id(opts: dict[str, Any]) -> dict[str, Any]:
    return await _probe_unavailable("BOTTLENECK_ID", opts)


async def _probe_plan_coherence(opts: dict[str, Any]) -> dict[str, Any]:
    return await _probe_unavailable("PLAN_COHERENCE", opts)


async def _probe_adaptation(opts: dict[str, Any]) -> dict[str, Any]:
    return await _probe_unavailable("ADAPTATION", opts)


async def _probe_scaling(opts: dict[str, Any]) -> dict[str, Any]:
    return await _probe_unavailable("SCALING", opts)


PROBES: MutableMapping[str, Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]] = {
    "RESOURCE_TRIAGE": _probe_resource_triage,
    "THREAT_RESPONSE": _probe_threat_response,
    "BOTTLENECK_ID": _probe_bottleneck_id,
    "PLAN_COHERENCE": _probe_plan_coherence,
    "ADAPTATION": _probe_adaptation,
    "SCALING": _probe_scaling,
}


async def run_probes(opts: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Run all probes (or a subset via ``opts['probe_ids']``)."""
    opts = opts or {}
    ids = opts.get("probe_ids") or list(PROBES.keys())
    results: list[dict[str, Any]] = []
    for pid in ids:
        fn = PROBES.get(pid)
        if fn is None:
            continue
        try:
            r = await fn(opts)
        except Exception as exc:  # pragma: no cover
            r = {
                "id": pid,
                "label": pid,
                "score": 0.0,
                "details": {"error": str(exc)},
            }
        results.append(r)
    return results


# Helper kept public for future probe implementations.
clamp01 = _clamp01
