"""RNG coverage audit tests — assert zero leaks in ``project_utopia/``."""

from __future__ import annotations

from pathlib import Path

from project_utopia.tools.audit import rng_coverage_report as rng_audit

_PKG_ROOT = Path(__file__).resolve().parents[2] / "project_utopia"


class TestZeroLeaks:
    def test_no_unmanaged_rng_in_project_utopia(self) -> None:
        leaks = rng_audit.audit_paths(_PKG_ROOT)
        if leaks:
            joined = "\n".join(f"  {p.as_posix()}:{ln}  {m}" for p, ln, m in leaks)
            assert not leaks, f"unmanaged RNG calls detected:\n{joined}"


class TestLeakDetection:
    def test_detects_random_random(self) -> None:
        leaks = rng_audit.find_leaks_in_text("import random\nrandom.random()\n")
        assert any("random.random" in m for _, m in leaks)

    def test_detects_np_random_rand(self) -> None:
        leaks = rng_audit.find_leaks_in_text("import numpy as np\nnp.random.rand(5)\n")
        assert any("np.random.rand" in m for _, m in leaks)

    def test_allows_generator_pcg64(self) -> None:
        text = (
            "import numpy as np\n"
            "rng = np.random.default_rng(42)\n"
            "g = np.random.Generator(np.random.PCG64(42))\n"
        )
        leaks = rng_audit.find_leaks_in_text(text)
        assert leaks == [], f"sanctioned constructors flagged: {leaks}"

    def test_line_numbers_correct(self) -> None:
        text = "line one\nline two\nrandom.choice([1,2])\nline four\n"
        leaks = rng_audit.find_leaks_in_text(text)
        assert leaks
        line, _ = leaks[0]
        assert line == 3


class TestCli:
    def test_main_returns_zero_on_clean(self, tmp_path: Path) -> None:
        # Empty dir → no leaks.
        rc = rng_audit.main(["--root", str(tmp_path)])
        assert rc == 0

    def test_main_returns_nonzero_on_leak(self, tmp_path: Path) -> None:
        (tmp_path / "leaky.py").write_text(
            "import random\nx = random.random()\n", encoding="utf-8"
        )
        rc = rng_audit.main(["--root", str(tmp_path)])
        assert rc == 1
