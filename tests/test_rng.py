"""Tests for :mod:`project_utopia.app.rng`."""

from __future__ import annotations

from project_utopia.app.rng import SeededRng, deriveRngSeed, derive_rng_seed


class TestSeededRng:
    def test_same_seed_produces_same_first_1000_floats(self) -> None:
        a = SeededRng(seed=0xC0FFEE)
        b = SeededRng(seed=0xC0FFEE)
        seq_a = [a.next() for _ in range(1000)]
        seq_b = [b.next() for _ in range(1000)]
        assert seq_a == seq_b

    def test_next_returns_float_in_unit_interval(self) -> None:
        rng = SeededRng(seed=42)
        for _ in range(200):
            v = rng.next()
            assert isinstance(v, float)
            assert 0.0 <= v < 1.0

    def test_next_int_is_inclusive_uniform(self) -> None:
        rng = SeededRng(seed="utopia")
        seen: set[int] = set()
        for _ in range(500):
            v = rng.next_int(3, 7)
            assert 3 <= v <= 7
            seen.add(v)
        # In 500 draws over a 5-value range we should see every value.
        assert seen == {3, 4, 5, 6, 7}

    def test_next_int_degenerate_range_returns_lo(self) -> None:
        rng = SeededRng(seed=1)
        assert rng.next_int(5, 5) == 5
        assert rng.next_int(7, 3) == 7

    def test_pick_returns_element_of_sequence(self) -> None:
        rng = SeededRng(seed=99)
        items = ["a", "b", "c", "d"]
        for _ in range(50):
            choice = rng.pick(items)
            assert choice in items

    def test_pick_empty_sequence_raises(self) -> None:
        rng = SeededRng(seed=99)
        import pytest

        with pytest.raises(ValueError):
            rng.pick([])

    def test_derive_different_namespaces_yield_different_streams(self) -> None:
        root = SeededRng(seed=2026)
        foo = root.derive("foo")
        bar = root.derive("bar")
        seq_foo = [foo.next() for _ in range(20)]
        seq_bar = [bar.next() for _ in range(20)]
        assert seq_foo != seq_bar

    def test_derive_same_namespace_is_reproducible(self) -> None:
        root_a = SeededRng(seed=2026)
        root_b = SeededRng(seed=2026)
        foo_a = root_a.derive("foo")
        foo_b = root_b.derive("foo")
        seq_a = [foo_a.next() for _ in range(20)]
        seq_b = [foo_b.next() for _ in range(20)]
        assert seq_a == seq_b

    def test_state_property_is_serializable_snapshot(self) -> None:
        rng = SeededRng(seed=0xDEAD)
        for _ in range(7):
            rng.next()
        snapshot = rng.state
        assert snapshot["initial_seed"] == rng.initial_seed
        assert snapshot["calls"] == 7
        assert snapshot["bit_generator"] == "PCG64"
        assert isinstance(snapshot["state"], dict)

    def test_snapshot_restore_resumes_sequence(self) -> None:
        rng = SeededRng(seed=0xBEEF)
        for _ in range(5):
            rng.next()
        snap = rng.snapshot()
        future = [rng.next() for _ in range(10)]

        # Construct a fresh RNG and restore — it should reproduce ``future``.
        clone = SeededRng(seed=0xBEEF)
        clone.restore(snap)
        replay = [clone.next() for _ in range(10)]
        assert future == replay

    def test_chance_clamps_probability(self) -> None:
        rng = SeededRng(seed=1)
        # p=1 always true; p=0 always false.
        assert all(SeededRng(seed=i).chance(1.0) for i in range(10))
        assert not any(SeededRng(seed=i).chance(0.0) for i in range(10))
        # Out-of-range values get clamped.
        assert all(SeededRng(seed=i).chance(2.5) for i in range(10))
        assert not any(SeededRng(seed=i).chance(-1.5) for i in range(10))
        _ = rng  # touch to suppress unused warning


class TestDeriveRngSeed:
    def test_is_deterministic_within_process(self) -> None:
        a = deriveRngSeed(2026, "simulation")
        b = deriveRngSeed(2026, "simulation")
        assert a == b

    def test_distinguishes_namespaces(self) -> None:
        assert deriveRngSeed(2026, "simulation") != deriveRngSeed(2026, "ai")
        assert deriveRngSeed(2026, "simulation") != deriveRngSeed(2026, "weather")

    def test_distinguishes_base_seeds(self) -> None:
        assert deriveRngSeed(1, "x") != deriveRngSeed(2, "x")

    def test_returns_non_zero_64bit(self) -> None:
        for seed in [0, 1, "utopia", "benchmark-paper", 0xFFFFFFFF, 0xDEADBEEFCAFEBABE]:
            value = deriveRngSeed(seed, "test")
            assert isinstance(value, int)
            assert value > 0
            assert value < (1 << 64)

    def test_string_seed_normalizes(self) -> None:
        # Strings should hash deterministically.
        a = deriveRngSeed("utopia", "ns")
        b = deriveRngSeed("utopia", "ns")
        assert a == b
        c = deriveRngSeed("utopia2", "ns")
        assert a != c

    def test_snake_case_alias_matches_camel_case(self) -> None:
        assert derive_rng_seed(7, "alpha") == deriveRngSeed(7, "alpha")

    def test_stable_across_subprocess(self) -> None:
        """``deriveRngSeed`` must not depend on ``PYTHONHASHSEED``.

        We approximate this by re-executing the call inside a fresh Python
        subprocess with a randomized hash seed and comparing outputs.
        """
        import os
        import subprocess
        import sys

        snippet = (
            "from project_utopia.app.rng import deriveRngSeed; "
            "print(deriveRngSeed(2026, 'simulation'))"
        )
        env = dict(os.environ)
        env["PYTHONHASHSEED"] = "random"
        out1 = subprocess.check_output([sys.executable, "-c", snippet], env=env).decode().strip()
        env["PYTHONHASHSEED"] = "0"
        out2 = subprocess.check_output([sys.executable, "-c", snippet], env=env).decode().strip()
        assert out1 == out2
        assert int(out1) == deriveRngSeed(2026, "simulation")
