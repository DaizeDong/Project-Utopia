"""Typer CLI argument parsing tests.

Covers ``parse_driver_args`` (the JS ``parseDriverArgs`` parity surface)
plus ``parse_seed_token``. Real CLI invocation is exercised by
``test_cli_smoke.py``; here we drive the pure-function layer directly so
the tests stay fast.
"""

from __future__ import annotations

import pytest

from project_utopia.cli.benchmark_paper import (
    DEFAULT_DURATION_SEC,
    DEFAULT_SCENARIOS,
    DEFAULT_SEEDS_HEX,
    PAPER_EXPERIMENTS,
    parse_driver_args,
    parse_seed_token,
)


class TestParseSeedToken:
    def test_decimal(self) -> None:
        assert parse_seed_token("42") == 42
        assert parse_seed_token("0") == 0
        assert parse_seed_token("-7") == -7

    def test_hex(self) -> None:
        assert parse_seed_token("0xC0FFEE") == 0xC0FFEE
        assert parse_seed_token("0xc0ffee") == 0xC0FFEE
        assert parse_seed_token("0xBEEF") == 0xBEEF

    def test_negative_hex(self) -> None:
        assert parse_seed_token("-0xCAFE") == -0xCAFE

    def test_empty_raises(self) -> None:
        with pytest.raises(ValueError):
            parse_seed_token("")
        with pytest.raises(ValueError):
            parse_seed_token("   ")


class TestParseDriverArgs:
    def test_e1_defaults(self) -> None:
        cfg = parse_driver_args(experiment="E1")
        assert cfg["experiment"] == "E1"
        assert cfg["cells"] == list(PAPER_EXPERIMENTS["E1"]["defaultCells"])
        assert cfg["scenarios"] == list(DEFAULT_SCENARIOS)
        assert cfg["seeds"] == [parse_seed_token(t) for t in DEFAULT_SEEDS_HEX]
        assert cfg["durationSec"] == DEFAULT_DURATION_SEC
        assert cfg["out"].endswith("E1.ndjson")
        assert cfg["concurrency"] == 1

    def test_e3_default_cells(self) -> None:
        cfg = parse_driver_args(experiment="E3")
        # 9-cell cross-vendor matrix.
        assert len(cfg["cells"]) == 9
        assert "XV-OPENWEIGHT-ONLY" in cfg["cells"]
        assert "FB" in cfg["cells"]
        assert "SS" in cfg["cells"]

    def test_e6_default_cells(self) -> None:
        cfg = parse_driver_args(experiment="E6")
        assert cfg["cells"] == ["FB", "WW", "SS"]

    def test_lowercase_experiment_accepted(self) -> None:
        # The JS port normalizes via toUpperCase().
        cfg = parse_driver_args(experiment="e1")
        assert cfg["experiment"] == "E1"

    def test_unknown_experiment_raises(self) -> None:
        with pytest.raises(ValueError, match="--experiment is required"):
            parse_driver_args(experiment="E99")
        with pytest.raises(ValueError, match="--experiment is required"):
            parse_driver_args(experiment="")

    def test_csv_scenarios_and_seeds(self) -> None:
        cfg = parse_driver_args(
            experiment="E1",
            scenarios="temperate_plains,fortified_basin",
            seeds="0xC0FFEE,0xBEEF",
            duration_sec=30,
            out="custom.ndjson",
        )
        assert cfg["scenarios"] == ["temperate_plains", "fortified_basin"]
        assert cfg["seeds"] == [0xC0FFEE, 0xBEEF]
        assert cfg["durationSec"] == 30
        assert cfg["out"] == "custom.ndjson"

    def test_decimal_seeds_accepted(self) -> None:
        cfg = parse_driver_args(experiment="E1", seeds="1,2,3")
        assert cfg["seeds"] == [1, 2, 3]

    def test_mixed_decimal_and_hex_seeds(self) -> None:
        cfg = parse_driver_args(experiment="E1", seeds="0xC0FFEE,42,0xBEEF")
        assert cfg["seeds"] == [0xC0FFEE, 42, 0xBEEF]

    def test_unknown_cell_raises(self) -> None:
        with pytest.raises(ValueError, match="unknown cell label"):
            parse_driver_args(experiment="E1", cells="FB,DOES_NOT_EXIST")

    def test_known_cells_accepted(self) -> None:
        cfg = parse_driver_args(experiment="E1", cells="FB,SS")
        assert cfg["cells"] == ["FB", "SS"]

    def test_empty_scenarios_falls_back_to_defaults(self) -> None:
        cfg = parse_driver_args(experiment="E1", scenarios="")
        assert cfg["scenarios"] == list(DEFAULT_SCENARIOS)

    def test_invalid_duration_falls_back(self) -> None:
        cfg = parse_driver_args(experiment="E1", duration_sec=0)
        assert cfg["durationSec"] == DEFAULT_DURATION_SEC
        cfg2 = parse_driver_args(experiment="E1", duration_sec=-5)
        assert cfg2["durationSec"] == DEFAULT_DURATION_SEC

    def test_concurrency_min_one(self) -> None:
        cfg = parse_driver_args(experiment="E1", concurrency=0)
        assert cfg["concurrency"] == 1
        cfg2 = parse_driver_args(experiment="E1", concurrency=4)
        assert cfg2["concurrency"] == 4


class TestTyperApp:
    def test_app_is_callable(self) -> None:
        """The exported ``app`` object is the Typer instance referenced from pyproject."""
        from project_utopia.cli.benchmark_paper import app

        # Typer instances are callable.
        assert callable(app)
        # Sub-command ``run`` is registered.
        names = [cmd.name for cmd in app.registered_commands]
        assert "run" in names
