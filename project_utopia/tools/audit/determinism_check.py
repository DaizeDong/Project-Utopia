"""Determinism check — Python port of ``tools/audit/determinism-check.js``.

Runs :class:`~project_utopia.benchmark.framework.sim_harness.SimHarness`
twice with the same seed in fallback mode and verifies the resulting
slim state hash is bit-identical.

Per the migration conventions, cross-language hash equality is NOT a
goal — the PCG64 RNG produces a different trajectory than the JS
``mulberry32``. We commit to *intra-Python* determinism only ("Tier 1'
contract"), so the Python hash will differ from the JS ``e360b76…``
value documented in the JS audit, but is still expected to be stable
across Python invocations on the same architecture.

Tiers:

* Tier 1 (smoke)    — 60 ticks    (~2 s sim time; CI fast gate)
* Tier 2 (medium)   — 1800 ticks  (~60 s sim time; pre-merge gate)
* Tier 3 (long)     — 7200 ticks  (~4 min sim time; pre-camera-ready gate)

Usage::

    python -m project_utopia.tools.audit.determinism_check --tier 1
    project-utopia-determinism --tier 2 --seed 0xC0FFEE --out audit.json

Exit codes:

* ``0`` — hashes equal (PASS)
* ``1`` — hashes differ (FAIL)
* ``2`` — fatal error (boot / run exception)
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

__all__ = ["TIER_TICKS", "hash_state", "main", "run_once"]


TIER_TICKS: dict[int, int] = {1: 60, 2: 1800, 3: 7200}


def _round_fixed(value: Any, places: int = 6) -> str:
    """Format a float to a fixed decimal string (matches JS ``toFixed``)."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return ""
    return f"{f:.{places}f}"


def _grid_serialize_first_n_chars(state: dict[str, Any], limit: int = 256) -> str:
    """Mirror the JS ``Array.from(grid.tiles).join(',').slice(0, 256)`` snippet.

    Accepts a state bag carrying either a ``Grid`` instance under ``grid``
    or a raw numpy array under ``grid.tiles`` / ``gridTiles``. Falls back
    to an empty string when neither is present (Phase-2 SimHarness does
    not yet populate the grid by default).
    """
    grid = state.get("grid")
    tiles_iter: Any = None
    if grid is None:
        return ""
    # Grid class with ``.tiles`` ndarray attribute (preferred).
    tiles = getattr(grid, "tiles", None)
    if tiles is not None:
        tiles_iter = tiles
    elif isinstance(grid, dict):
        tiles_iter = grid.get("tiles")
    if tiles_iter is None:
        return ""
    try:
        # Flatten to ints, then comma-join. numpy arrays support .tolist().
        if hasattr(tiles_iter, "tolist"):
            flat = tiles_iter.tolist()
            # tolist() on a 2D ndarray gives list-of-lists; flatten.
            if flat and isinstance(flat[0], list):
                joined = ",".join(str(int(v)) for row in flat for v in row)
            else:
                joined = ",".join(str(int(v)) for v in flat)
        else:
            joined = ",".join(str(int(v)) for v in tiles_iter)
    except Exception:
        return ""
    return joined[:limit]


def hash_state(state: dict[str, Any]) -> str:
    """Compute the SHA-256 of a canonical slim view of ``state``.

    Slim view mirrors the JS audit. Worker positions are rounded to 6
    decimal places via ``f"{v:.6f}"``. The grid tiles array is truncated
    to the first 256 characters of its comma-joined integer
    representation — this is enough fingerprint to detect tile-level
    drift without exploding the hash payload.

    Notes
    -----
    JSON keys are sorted (``sort_keys=True``) so dict iteration order
    cannot drift across Python builds.
    """
    metrics = state.get("metrics") or {}
    ai_runtime = (metrics.get("ai_runtime") or metrics.get("aiRuntime") or {})
    workers_in: list[Any] = state.get("workers") or []
    if not workers_in:
        # Phase-2 SimHarness stores entities under ``state.agents``.
        workers_in = [
            a
            for a in (state.get("agents") or [])
            if isinstance(a, dict) and a.get("type") == "WORKER"
        ]

    workers_out: list[dict[str, Any]] = []
    for w in workers_in:
        if not isinstance(w, dict):
            continue
        workers_out.append(
            {
                "id": w.get("id"),
                "x": w.get("x"),
                "z": w.get("z"),
                "vx": w.get("vx"),
                "vz": w.get("vz"),
                "hunger": _round_fixed(w.get("hunger"), 6) if w.get("hunger") is not None else None,
                "role": w.get("role"),
                "fsm_state": (w.get("fsm") or {}).get("state") if isinstance(w.get("fsm"), dict) else None,
            }
        )

    slim = {
        "tick": int(state.get("tick", 0) or 0),
        "time_sec": float(metrics.get("timeSec", 0.0) or 0.0),
        "workers": workers_out,
        "resources": dict(state.get("resources") or {}),
        "ai_runtime": {
            "requestCount": int(ai_runtime.get("requestCount", 0) or 0),
            "responseCount": int(ai_runtime.get("responseCount", 0) or 0),
            "timeoutCount": int(ai_runtime.get("timeoutCount", 0) or 0),
            "errorCount": int(ai_runtime.get("errorCount", 0) or 0),
        },
        "grid_snapshot": _grid_serialize_first_n_chars(state, limit=256),
    }
    payload = json.dumps(slim, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def _run_once(
    *, template_id: str, seed: int, ticks: int, ai_enabled: bool
) -> tuple[str, float]:
    """Drive a SimHarness for ``ticks`` ticks and return ``(hash, wallclock_ms)``."""
    from project_utopia.benchmark.framework.sim_harness import SimHarness

    import time

    t0 = time.perf_counter()
    harness = SimHarness(template_id=template_id, seed=seed, ai_enabled=ai_enabled)
    for _ in range(ticks):
        await harness.tick()
    hash_hex = hash_state(harness.state)
    wallclock_ms = (time.perf_counter() - t0) * 1000.0
    return hash_hex, wallclock_ms


def run_once(*, template_id: str, seed: int, ticks: int, ai_enabled: bool = False) -> tuple[str, float]:
    """Synchronous wrapper around the async tick loop."""
    return asyncio.run(_run_once(template_id=template_id, seed=seed, ticks=ticks, ai_enabled=ai_enabled))


def _parse_seed(token: str) -> int:
    s = token.strip()
    if s.lower().startswith("0x"):
        return int(s, 16)
    return int(s)


def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="project-utopia-determinism",
        description="Run SimHarness twice with the same seed; assert identical state hash.",
    )
    p.add_argument("--tier", type=int, choices=(1, 2, 3), default=1, help="determinism tier")
    p.add_argument("--seed", type=str, default="0xC0FFEE", help="seed (decimal or 0x-hex)")
    p.add_argument(
        "--ticks",
        type=int,
        default=None,
        help="explicit tick count (overrides --tier default)",
    )
    p.add_argument(
        "--scenario",
        type=str,
        default="temperate_plains",
        help="scenario template id",
    )
    p.add_argument(
        "--out",
        type=str,
        default="",
        help="optional path to write the JSON audit report",
    )
    p.add_argument(
        "--ai-enabled",
        action="store_true",
        help="enable the fallback AI runtime system (default off)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_argparser().parse_args(argv)
    seed = _parse_seed(args.seed)
    tier = int(args.tier)
    ticks = int(args.ticks) if args.ticks is not None else TIER_TICKS[tier]
    scenario = str(args.scenario)

    cfg = {
        "tier": tier,
        "seed": f"0x{seed:X}",
        "ticks": ticks,
        "scenario": scenario,
        "simSec": round(ticks * (1 / 30), 1),
    }
    sys.stdout.write(f"[determinism-check] {json.dumps(cfg, sort_keys=True)}\n")
    sys.stdout.flush()

    try:
        h1, ms1 = run_once(template_id=scenario, seed=seed, ticks=ticks, ai_enabled=args.ai_enabled)
        h2, ms2 = run_once(template_id=scenario, seed=seed, ticks=ticks, ai_enabled=args.ai_enabled)
    except Exception as err:  # pragma: no cover — surfaced via exit code
        sys.stderr.write(f"[determinism-check] FATAL: {err}\n")
        return 2

    equal = h1 == h2
    result = {
        **cfg,
        "run1": {"hash": h1, "wallclockMs": round(ms1, 2)},
        "run2": {"hash": h2, "wallclockMs": round(ms2, 2)},
        "equal": equal,
        "verdict": "PASS" if equal else "FAIL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    sys.stdout.write(f"run1: {h1} ({ms1:.1f}ms)\n")
    sys.stdout.write(f"run2: {h2} ({ms2:.1f}ms)\n")
    sys.stdout.write(f"verdict: {result['verdict']}\n")
    sys.stdout.flush()

    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        sys.stdout.write(f"written: {out_path}\n")

    return 0 if equal else 1


if __name__ == "__main__":
    raise SystemExit(main())
