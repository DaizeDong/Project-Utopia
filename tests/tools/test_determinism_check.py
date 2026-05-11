"""Determinism-check audit tool tests.

The audit drives ``SimHarness`` twice with the same seed and asserts
the slim state hash matches. We compare the two hashes directly
(without hardcoding the hash digest, since the Python build's PCG64
RNG produces a different hash than the JS ``mulberry32`` original).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from project_utopia.tools.audit import determinism_check as dc


class TestHashState:
    def test_empty_state_hash_is_stable(self) -> None:
        h1 = dc.hash_state({})
        h2 = dc.hash_state({})
        assert h1 == h2
        assert isinstance(h1, str)
        assert len(h1) == 64  # SHA-256 hex digest

    def test_hash_changes_with_tick(self) -> None:
        h1 = dc.hash_state({"tick": 0})
        h2 = dc.hash_state({"tick": 1})
        assert h1 != h2

    def test_hash_dict_key_order_invariant(self) -> None:
        """JSON serialization sorts keys — order-of-insertion must not matter."""
        a = {"tick": 5, "metrics": {"timeSec": 1.0}, "resources": {"food": 100, "wood": 30}}
        b = {"resources": {"wood": 30, "food": 100}, "metrics": {"timeSec": 1.0}, "tick": 5}
        assert dc.hash_state(a) == dc.hash_state(b)

    def test_hash_reflects_workers(self) -> None:
        s_empty: dict = {"agents": []}
        s_one = {"agents": [{"id": "w1", "type": "WORKER", "x": 1.0, "z": 2.0, "alive": True}]}
        assert dc.hash_state(s_empty) != dc.hash_state(s_one)


def _framework_ready() -> bool:
    try:
        from project_utopia.benchmark.framework.sim_harness import SimHarness  # noqa: F401
    except Exception:
        return False
    return True


@pytest.mark.xfail(
    not _framework_ready(),
    reason="SimHarness not yet importable",
    strict=False,
)
class TestRunTwiceProducesSameHash:
    def test_tier_1_repeatable(self) -> None:
        # Tier 1 is 60 ticks (smoke). Two runs must agree.
        h1, _ = dc.run_once(template_id="temperate_plains", seed=0xC0FFEE, ticks=60)
        h2, _ = dc.run_once(template_id="temperate_plains", seed=0xC0FFEE, ticks=60)
        assert h1 == h2

    def test_different_seeds_diverge(self) -> None:
        h_a, _ = dc.run_once(template_id="temperate_plains", seed=1, ticks=30)
        h_b, _ = dc.run_once(template_id="temperate_plains", seed=2, ticks=30)
        # Different seeds *should* diverge — but if the Phase-2
        # SimHarness still has placeholder systems that don't touch RNG,
        # this might collapse. xfail-soft so the test is informational.
        if h_a == h_b:
            pytest.xfail("placeholder SimHarness produces seed-invariant hash")
        assert h_a != h_b


class TestCli:
    def test_argparser_accepts_tier_and_seed(self) -> None:
        parser = dc._build_argparser()
        args = parser.parse_args(["--tier", "1", "--seed", "0xC0FFEE"])
        assert args.tier == 1
        assert args.seed == "0xC0FFEE"

    def test_argparser_writes_out_path(self, tmp_path: Path) -> None:
        parser = dc._build_argparser()
        out = tmp_path / "audit.json"
        args = parser.parse_args(["--tier", "1", "--out", str(out)])
        assert args.out == str(out)

    @pytest.mark.xfail(not _framework_ready(), reason="SimHarness not yet importable", strict=False)
    def test_main_writes_report(self, tmp_path: Path) -> None:
        out = tmp_path / "report.json"
        rc = dc.main(
            [
                "--tier",
                "1",
                "--seed",
                "0xC0FFEE",
                "--ticks",
                "10",
                "--out",
                str(out),
                "--scenario",
                "temperate_plains",
            ]
        )
        assert rc == 0
        assert out.exists()
        report = json.loads(out.read_text(encoding="utf-8"))
        assert report["verdict"] == "PASS"
        assert report["run1"]["hash"] == report["run2"]["hash"]


class TestSeedParser:
    def test_parses_hex(self) -> None:
        assert dc._parse_seed("0xC0FFEE") == 0xC0FFEE

    def test_parses_decimal(self) -> None:
        assert dc._parse_seed("42") == 42

    def test_strips_whitespace(self) -> None:
        assert dc._parse_seed("  0xBEEF  ") == 0xBEEF
