"""End-to-end smoke test for ``project-utopia run``.

Drives one ``E1`` cell (``FB``) for the smallest possible matrix
(1 seed × 1 scenario × 5 sec duration) and asserts the NDJSON output
file has the expected schema. The test is marked ``xfail`` while the
framework or dimensions package is incomplete — once both are wired
the test should turn green automatically (no need to drop the marker).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest


def _framework_available() -> bool:
    try:
        from project_utopia.benchmark.framework.seed_matrix import run_seed_matrix  # noqa: F401
        from project_utopia.benchmark.framework.dimension_normalizer import (  # noqa: F401
            DIMENSION_NORMALIZERS,
        )
        from project_utopia.benchmark.framework.scoring_engine import (  # noqa: F401
            bayesian_score,
            sandwich_normalize,
        )
        from project_utopia.benchmark.baselines.scripted_oracle_policy import (  # noqa: F401
            ScriptedOraclePolicy,
        )
    except Exception:
        return False
    return True


_REQUIRED_KEYS = {
    "experiment",
    "cellId",
    "scenario",
    "seed",
    "dim",
    "raw",
    "normalized",
    "sandwichNorm",
    "bayesianMean",
    "bayesianCi95",
    "agentId",
}


@pytest.mark.xfail(
    not _framework_available(),
    reason="framework / baselines / dimensions not yet available; pipeline cannot run",
    strict=False,
)
def test_e1_smoke_fb_only(tmp_path: Path) -> None:
    from project_utopia.cli.benchmark_paper import (
        parse_driver_args,
        run_paper_experiment,
        write_ndjson_rows,
    )

    out_path = tmp_path / "smoke.ndjson"
    cfg = parse_driver_args(
        experiment="E1",
        scenarios="temperate_plains",
        seeds="0xC0FFEE",
        cells="FB",
        duration_sec=5,
        out=str(out_path),
    )
    rows = asyncio.run(run_paper_experiment(cfg))
    write_ndjson_rows(out_path, rows)

    assert out_path.exists()
    text = out_path.read_text(encoding="utf-8")
    assert text  # at least one row should land
    lines = [ln for ln in text.splitlines() if ln.strip()]
    assert len(lines) == len(rows)

    parsed = [json.loads(ln) for ln in lines]
    for row in parsed:
        missing = _REQUIRED_KEYS - set(row.keys())
        assert not missing, f"row missing fields: {missing}"
        assert row["experiment"] == "E1"
        assert row["cellId"] == "FB"
        assert row["scenario"] == "temperate_plains"
        assert row["seed"] == 0xC0FFEE
        assert isinstance(row["dim"], str) and row["dim"]


def test_write_ndjson_rows_empty(tmp_path: Path) -> None:
    """Empty input → empty file (no trailing newline)."""
    from project_utopia.cli.benchmark_paper import write_ndjson_rows

    p = tmp_path / "empty.ndjson"
    write_ndjson_rows(p, [])
    assert p.exists()
    assert p.read_text(encoding="utf-8") == ""


def test_write_ndjson_rows_compact_form(tmp_path: Path) -> None:
    """Each record is one compact JSON line ending in \\n."""
    from project_utopia.cli.benchmark_paper import write_ndjson_rows

    p = tmp_path / "out.ndjson"
    write_ndjson_rows(
        p,
        [
            {"a": 1, "b": "x"},
            {"a": 2, "b": "y"},
        ],
    )
    text = p.read_text(encoding="utf-8")
    lines = text.split("\n")
    # Two records + one trailing empty line from the final ``\n``.
    assert lines[-1] == ""
    assert len(lines) == 3
    # No spaces around separators (compact form).
    assert lines[0] == '{"a":1,"b":"x"}'
    assert lines[1] == '{"a":2,"b":"y"}'


def test_write_ndjson_rows_creates_parent_dir(tmp_path: Path) -> None:
    from project_utopia.cli.benchmark_paper import write_ndjson_rows

    nested = tmp_path / "nested" / "output" / "paper.ndjson"
    write_ndjson_rows(nested, [{"k": 1}])
    assert nested.exists()
    assert nested.read_text(encoding="utf-8") == '{"k":1}\n'
