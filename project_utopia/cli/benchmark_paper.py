"""Paper-run entrypoint (Python port of ``scripts/benchmark-paper.mjs``).

Drives the academic-benchmark pipeline end-to-end for a given
experiment (E1 / E3 / E6) and emits NDJSON rows ready for figure /
table generation.

Each NDJSON row carries::

    {experiment, cellId, scenario, seed, dim, raw, normalized,
     sandwichNorm, bayesianMean, bayesianCi95, agentId}

(camelCase wire format preserved for parity with the JS NDJSON.)

Invocation::

    project-utopia run --experiment E1 \
        --scenarios temperate_plains,fortified_basin \
        --seeds 0xC0FFEE,0xBEEF \
        --duration-sec 30 \
        --out output/paper/E1.ndjson

The CLI is built on Typer (declared in ``pyproject.toml`` deps) and
exposes a single ``run`` sub-command plus a top-level ``app`` instance.
Logging goes through ``rich`` on stderr so it never lands in the
deterministic NDJSON output path.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import sys
import time
from pathlib import Path
from types import MappingProxyType
from typing import Any, Iterable

import typer
from rich.console import Console

from project_utopia.cli.agent_routing import (
    DEFAULT_AGENT_ROUTING,
    build_backends_for_cell,
)

__all__ = [
    "DEFAULT_DURATION_SEC",
    "DEFAULT_SCENARIOS",
    "DEFAULT_SEEDS_HEX",
    "PAPER_EXPERIMENTS",
    "app",
    "build_agent_config_for_cell",
    "main",
    "parse_driver_args",
    "parse_seed_token",
    "run_paper_experiment",
    "write_ndjson_rows",
]


# ── experiment definitions ────────────────────────────────────────────


PAPER_EXPERIMENTS: MappingProxyType[str, MappingProxyType[str, Any]] = MappingProxyType(
    {
        "E1": MappingProxyType(
            {
                "description": "hierarchical (4-channel) vs flat baseline",
                "defaultCells": ("SS", "FB"),
            }
        ),
        "E3": MappingProxyType(
            {
                "description": "9-cell cross-vendor matrix",
                "defaultCells": (
                    "FB",
                    "WW",
                    "SW",
                    "WS",
                    "SS",
                    "XV-OPUS-SONNET",
                    "XV-DIVERSE-LIGHT",
                    "XV-DIVERSE-STRONG",
                    "XV-OPENWEIGHT-ONLY",
                ),
            }
        ),
        "E6": MappingProxyType(
            {
                "description": "schema failure profile (simplified)",
                "defaultCells": ("FB", "WW", "SS"),
            }
        ),
    }
)

DEFAULT_SCENARIOS: tuple[str, ...] = ("temperate_plains", "fortified_basin")
DEFAULT_SEEDS_HEX: tuple[str, ...] = ("0xC0FFEE", "0xBEEF", "0xCAFE")
DEFAULT_DURATION_SEC: int = 120


# ── arg parsing helpers ──────────────────────────────────────────────


def _parse_csv(s: str | None) -> list[str]:
    """Comma-separated tokens with whitespace trimmed; drops empties."""
    if not s:
        return []
    return [tok.strip() for tok in str(s).split(",") if tok.strip()]


def parse_seed_token(tok: str) -> int:
    """Parse a single seed token, supporting decimal + ``0x``-hex (signed).

    Raises ``ValueError`` for unparseable input.
    """
    s = str(tok).strip()
    if not s:
        raise ValueError("empty seed token")
    sign = 1
    body = s
    if body.startswith("-"):
        sign = -1
        body = body[1:]
    if body.lower().startswith("0x"):
        return sign * int(body, 16)
    return sign * int(body, 10)


def parse_driver_args(
    *,
    experiment: str,
    scenarios: str | None = None,
    seeds: str | None = None,
    cells: str | None = None,
    duration_sec: int | None = None,
    out: str | None = None,
    concurrency: int | None = None,
) -> dict[str, Any]:
    """Normalize a parsed CLI argv into a config dict.

    Mirrors the JS ``parseDriverArgs`` API: defaults match, errors raise
    ``ValueError``. The Typer sub-command is a thin wrapper around this
    function so tests can drive arg parsing without spinning up the
    runtime.
    """
    exp = (experiment or "").upper()
    if not exp or exp not in PAPER_EXPERIMENTS:
        known = ", ".join(PAPER_EXPERIMENTS.keys())
        raise ValueError(f"--experiment is required and must be one of: {known}")

    scenario_tokens = _parse_csv(scenarios)
    cell_tokens = _parse_csv(cells)
    seed_tokens = _parse_csv(seeds)
    seed_values: list[int] = []
    for tok in seed_tokens:
        try:
            seed_values.append(parse_seed_token(tok))
        except ValueError:
            continue

    duration = int(duration_sec) if duration_sec is not None else DEFAULT_DURATION_SEC
    if not (isinstance(duration, int) and duration > 0):
        duration = DEFAULT_DURATION_SEC

    conc = max(1, int(concurrency or 1))

    filled_scenarios = scenario_tokens if scenario_tokens else list(DEFAULT_SCENARIOS)
    filled_cells = (
        cell_tokens if cell_tokens else list(PAPER_EXPERIMENTS[exp]["defaultCells"])
    )
    filled_seeds = (
        seed_values
        if seed_values
        else [parse_seed_token(t) for t in DEFAULT_SEEDS_HEX]
    )

    for c in filled_cells:
        if c not in DEFAULT_AGENT_ROUTING:
            known = ", ".join(DEFAULT_AGENT_ROUTING.keys())
            raise ValueError(f"unknown cell label: {c} (known: {known})")

    out_path = out if out else f"output/paper/{exp}.ndjson"

    return {
        "experiment": exp,
        "scenarios": filled_scenarios,
        "seeds": filled_seeds,
        "cells": filled_cells,
        "durationSec": duration,
        "out": out_path,
        "concurrency": conc,
    }


# ── adapter wiring ────────────────────────────────────────────────────


def _instantiate_backend(backend_cfg: dict[str, Any]) -> Any:
    """Materialise a backend config into a concrete AgentAdapter.

    ``{baseUrl: "fallback://..."}`` or ``{model: "fallback"}`` →
    :class:`NoopAgentAdapter`. Anything else → :class:`LLMClient` if
    importable, otherwise falls back to ``NoopAgentAdapter`` (so the
    CLI works in offline test environments).
    """
    from project_utopia.simulation.ai.llm.agent_adapter import NoopAgentAdapter

    base_url = str(backend_cfg.get("baseUrl") or "")
    model = str(backend_cfg.get("model") or "")
    kind = str(backend_cfg.get("kind") or "").lower()
    if kind == "fallback" or base_url.startswith("fallback://") or model == "fallback":
        return NoopAgentAdapter()
    try:
        from project_utopia.simulation.ai.llm.llm_client import LLMClient

        return LLMClient(base_url=base_url, model=model)
    except Exception:  # pragma: no cover — offline / missing optional dep
        return NoopAgentAdapter()


def build_agent_config_for_cell(cell_id: str) -> dict[str, Any]:
    """Produce the ``agent_config`` dict that ``run_seed_matrix`` expects.

    For ``FB`` (all-fallback) cells the channels collapse to a single
    :class:`NoopAgentAdapter` instance via
    :class:`MultiBackendAdapter`; cross-vendor cells receive a real
    per-channel adapter map.
    """
    from project_utopia.benchmark.baselines.multi_backend_adapter import (
        MultiBackendAdapter,
    )

    backends = build_backends_for_cell(cell_id)
    channel_map: dict[str, Any] = {ch: _instantiate_backend(cfg) for ch, cfg in backends.items()}

    def _factory() -> MultiBackendAdapter:
        return MultiBackendAdapter(channel_map)

    return {"adapter_class": _factory, "adapter_opts": {}}


# ── pipeline runners ─────────────────────────────────────────────────


async def _run_fallback(
    *, seeds: list[int], scenarios: list[str], duration_sec: int
) -> list[dict[str, Any]]:
    """Run the deterministic-fallback path (``R_random`` reference)."""
    from project_utopia.benchmark.framework.seed_matrix import run_seed_matrix
    from project_utopia.simulation.ai.llm.agent_adapter import NoopAgentAdapter

    result = await run_seed_matrix(
        {
            "seeds": seeds,
            "scenarios": scenarios,
            "duration_sec": duration_sec,
            "dimension_opts": {"duration_sec": duration_sec},
            "agent_config": {"adapter_class": NoopAgentAdapter, "adapter_opts": {}},
        }
    )
    return list(result["cells"])


async def _run_oracle_for_scenario(
    *, seeds: list[int], scenario: str, duration_sec: int
) -> list[dict[str, Any]]:
    """Run the oracle (``R_oracle`` upper-bound reference) for one scenario."""
    from project_utopia.benchmark.baselines.scripted_oracle_policy import (
        ScriptedOraclePolicy,
    )
    from project_utopia.benchmark.framework.seed_matrix import run_seed_matrix

    def _factory() -> ScriptedOraclePolicy:
        return ScriptedOraclePolicy(scenario)

    result = await run_seed_matrix(
        {
            "seeds": seeds,
            "scenarios": [scenario],
            "duration_sec": duration_sec,
            "dimension_opts": {"duration_sec": duration_sec},
            "agent_config": {"adapter_class": _factory, "adapter_opts": {}},
        }
    )
    return list(result["cells"])


async def _run_agent_cell(
    *, cell_id: str, seeds: list[int], scenarios: list[str], duration_sec: int, concurrency: int
) -> list[dict[str, Any]]:
    from project_utopia.benchmark.framework.seed_matrix import run_seed_matrix

    agent_config = build_agent_config_for_cell(cell_id)
    result = await run_seed_matrix(
        {
            "seeds": seeds,
            "scenarios": scenarios,
            "duration_sec": duration_sec,
            "concurrency": concurrency,
            "dimension_opts": {"duration_sec": duration_sec},
            "agent_config": agent_config,
        }
    )
    return list(result["cells"])


def _is_finite(x: Any) -> bool:
    try:
        return math.isfinite(float(x))
    except (TypeError, ValueError):
        return False


async def run_paper_experiment(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Run one experiment end-to-end and return NDJSON-ready rows.

    Each row is a dict with the public wire schema (camelCase keys).
    """
    from project_utopia.benchmark.framework.dimension_normalizer import (
        DIMENSION_NORMALIZERS,
        build_sandwich_triple,
        normalize_dimension,
    )
    from project_utopia.benchmark.framework.scoring_engine import (
        bayesian_score,
        sandwich_normalize,
    )

    experiment = cfg["experiment"]
    scenarios: list[str] = list(cfg["scenarios"])
    seeds: list[int] = list(cfg["seeds"])
    cells: list[str] = list(cfg["cells"])
    duration_sec: int = int(cfg["durationSec"])
    concurrency: int = int(cfg["concurrency"])

    # 1. Reference cells (shared across all agent cells).
    fallback_cells = await _run_fallback(
        seeds=seeds, scenarios=scenarios, duration_sec=duration_sec
    )
    oracle_by_scenario: dict[str, list[dict[str, Any]]] = {}
    for sc in scenarios:
        oracle_by_scenario[sc] = await _run_oracle_for_scenario(
            seeds=seeds, scenario=sc, duration_sec=duration_sec
        )
    all_oracle_cells: list[dict[str, Any]] = []
    for arr in oracle_by_scenario.values():
        all_oracle_cells.extend(arr)

    rows: list[dict[str, Any]] = []

    # 2. Per-cell agent run.
    for cell_id in cells:
        agent_cells = await _run_agent_cell(
            cell_id=cell_id,
            seeds=seeds,
            scenarios=scenarios,
            duration_sec=duration_sec,
            concurrency=concurrency,
        )

        # 3. For each registered dim, compute (raw, normalized, sandwichNorm).
        for dim_key in DIMENSION_NORMALIZERS.keys():
            try:
                triple = build_sandwich_triple(
                    agent_cells, fallback_cells, all_oracle_cells, dim_key
                )
            except ValueError as err:
                sys.stderr.write(
                    f"[benchmark-paper] dim={dim_key} sandwich alignment failed: {err}\n"
                )
                continue

            agent_norm = [normalize_dimension(dim_key, v) for v in triple["agent"]]
            fallback_norm = [normalize_dimension(dim_key, v) for v in triple["fallback"]]
            oracle_norm = [normalize_dimension(dim_key, v) for v in triple["oracle"]]
            sandwich_arr = sandwich_normalize(agent_norm, fallback_norm, oracle_norm)

            # Bayesian posterior across the full cell × dim sample.
            bayes = bayesian_score([v for v in agent_norm if _is_finite(v)])

            for i, key in enumerate(triple["keys"]):
                seed_val = key["seed"]
                scenario = key["scenario"]
                # Resolve the agent_id for this (seed, scenario) cell, if known.
                agent_id: str | None = None
                for c in agent_cells:
                    if c.get("seed") == seed_val and c.get("scenario") == scenario:
                        agent_id = c.get("agent_id") or c.get("agentId")
                        break
                rows.append(
                    {
                        "experiment": experiment,
                        "cellId": cell_id,
                        "scenario": scenario,
                        "seed": seed_val,
                        "dim": dim_key,
                        "raw": triple["agent"][i],
                        "normalized": agent_norm[i],
                        "sandwichNorm": sandwich_arr[i],
                        "bayesianMean": bayes.get("mean"),
                        "bayesianCi95": bayes.get("ci95"),
                        "agentId": agent_id,
                    }
                )

    return rows


def _scrub_non_finite(obj: Any) -> Any:
    """Recursively replace NaN / +/-inf with ``None`` so the NDJSON is valid JSON.

    Standard JSON does not admit ``NaN`` / ``Infinity`` literals (RFC
    8259 §6), even though Python's ``json`` emits them by default. NDJSON
    consumers (pandas, jq, BigQuery, …) routinely choke on those tokens,
    so we coerce to ``null`` which IS valid.
    """
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, list):
        return [_scrub_non_finite(v) for v in obj]
    if isinstance(obj, tuple):
        return [_scrub_non_finite(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _scrub_non_finite(v) for k, v in obj.items()}
    return obj


def write_ndjson_rows(out_path: str | Path, rows: Iterable[dict[str, Any]]) -> None:
    """Write rows to NDJSON, one record per line, compact JSON encoding.

    Mirrors the JS ``writeNDJSONRows``: creates the parent directory if
    needed, no trailing whitespace inside records, exactly one trailing
    ``\\n`` after the last line when there is at least one row. NaN /
    Infinity floats are replaced with ``null`` so the output is strict
    JSON parseable by downstream consumers.
    """
    path = Path(out_path)
    if path.parent and str(path.parent) not in {".", ""}:
        path.parent.mkdir(parents=True, exist_ok=True)
    materialized = list(rows)
    if not materialized:
        path.write_text("", encoding="utf-8")
        return
    lines = [
        json.dumps(
            _scrub_non_finite(r),
            separators=(",", ":"),
            default=_json_default,
            allow_nan=False,
        )
        for r in materialized
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _json_default(obj: Any) -> Any:
    """Fallback serializer for objects that ``json`` doesn't know about."""
    if hasattr(obj, "tolist"):
        return obj.tolist()
    if isinstance(obj, (set, frozenset)):
        return sorted(obj)
    if isinstance(obj, MappingProxyType):
        return dict(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


# ── Typer CLI surface ────────────────────────────────────────────────


app = typer.Typer(
    name="project-utopia",
    help="Academic benchmark — paper run entrypoint.",
    add_completion=False,
    no_args_is_help=True,
)

_console = Console(stderr=True)


@app.callback()
def _root() -> None:
    """Top-level callback so Typer keeps ``run`` as an explicit sub-command.

    Without this, Typer collapses single-command apps and accepts options
    at the top level. The spec calls for ``project-utopia run --experiment
    E1`` style invocation; the callback forces sub-command dispatch.
    """
    # Intentionally empty — only purpose is to register the callback.
    return


@app.command("run")
def run_command(
    experiment: str = typer.Option(
        ...,
        "--experiment",
        "-e",
        help=f"one of {', '.join(PAPER_EXPERIMENTS.keys())}",
    ),
    scenarios: str = typer.Option(
        "",
        "--scenarios",
        "-s",
        help=f"CSV scenario list (default: {','.join(DEFAULT_SCENARIOS)})",
    ),
    seeds: str = typer.Option(
        "",
        "--seeds",
        help=f"CSV seed list (decimal or 0x-hex, default: {','.join(DEFAULT_SEEDS_HEX)})",
    ),
    cells: str = typer.Option(
        "",
        "--cells",
        help="CSV cell-id list (default: experiment-specific)",
    ),
    duration_sec: int = typer.Option(
        DEFAULT_DURATION_SEC,
        "--duration-sec",
        "-d",
        help="per-cell simulation duration in seconds",
    ),
    out: str = typer.Option(
        "",
        "--out",
        "-o",
        help="NDJSON output path (default: output/paper/<EXPERIMENT>.ndjson)",
    ),
    concurrency: int = typer.Option(
        1,
        "--concurrency",
        "-j",
        help="seed × scenario concurrency (Python asyncio.gather)",
    ),
) -> None:
    """Run one experiment end-to-end and stream NDJSON to ``--out``."""
    try:
        cfg = parse_driver_args(
            experiment=experiment,
            scenarios=scenarios or None,
            seeds=seeds or None,
            cells=cells or None,
            duration_sec=duration_sec,
            out=out or None,
            concurrency=concurrency,
        )
    except ValueError as err:
        _console.print(f"[red]arg error:[/red] {err}")
        raise typer.Exit(code=2) from err

    _seed_repr = ",".join(
        f"0x{s:X}" if isinstance(s, int) and s >= 0 else str(s) for s in cfg["seeds"]
    )
    _console.print(
        f"[cyan]benchmark-paper[/cyan] experiment={cfg['experiment']} "
        f"cells=[{','.join(cfg['cells'])}] scenarios=[{','.join(cfg['scenarios'])}] "
        f"seeds=[{_seed_repr}] durationSec={cfg['durationSec']} "
        f"concurrency={cfg['concurrency']}"
    )

    t0 = time.perf_counter()
    rows = asyncio.run(run_paper_experiment(cfg))
    write_ndjson_rows(cfg["out"], rows)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    _console.print(
        f"[green]wrote[/green] {len(rows)} rows to {cfg['out']} in {elapsed_ms} ms"
    )

    # Optional pandas summary on stderr — not in hashed/NDJSON path.
    if rows:
        try:
            import pandas as pd

            df = pd.DataFrame(rows)
            summary = (
                df.groupby(["cellId", "dim"])["sandwichNorm"].mean().unstack(fill_value=float("nan"))
            )
            _console.print(summary.to_string())
        except Exception:  # pragma: no cover — pandas optional at runtime
            pass


def main(argv: list[str] | None = None) -> int:
    """Entry point usable by ``python -m project_utopia.cli.benchmark_paper``."""
    try:
        # Typer raises SystemExit; wrap to keep the contract of returning an int.
        if argv is not None:
            sys.argv = ["project-utopia", *argv]
        app(standalone_mode=False)
        return 0
    except SystemExit as exc:
        return int(exc.code or 0)
    except typer.Exit as exc:  # noqa: PERF203
        return int(exc.exit_code or 0)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
