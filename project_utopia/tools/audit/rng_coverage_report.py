"""RNG coverage audit — Python port of ``tools/audit/rng-coverage-report.js``.

Scans ``project_utopia/`` for raw RNG calls that bypass the seeded
:class:`~project_utopia.app.rng.SeededRng`. Any hit outside the
``project_utopia.app.rng`` module is a determinism leak — the audit
exits non-zero with a ``file:line`` list so CI can fail the build.

Specifically we flag:

* ``random.random()`` and friends from the stdlib ``random`` module.
* ``np.random.<fn>`` / ``numpy.random.<fn>`` legacy global-state calls
  (``np.random.rand``, ``np.random.seed``, …) outside ``rng.py``.
  ``numpy.random.Generator`` / ``np.random.PCG64`` / ``default_rng`` are
  the sanctioned constructors used by ``SeededRng``.

We expect ZERO leaks for Phase 1's footprint.

Usage::

    python -m project_utopia.tools.audit.rng_coverage_report
    project-utopia-rng-audit

Exit codes:

* ``0`` — no leaks
* ``1`` — leaks found
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import tokenize
from pathlib import Path
from typing import Iterator

__all__ = ["audit_paths", "find_leaks_in_text", "main"]


_PKG_ROOT = Path(__file__).resolve().parents[3] / "project_utopia"
_ALLOWLIST_RELATIVE = {
    Path("app") / "rng.py",
    Path("tools") / "audit" / "rng_coverage_report.py",  # this file (mentions the patterns)
}

# Patterns that constitute an unmanaged RNG use.
# - ``random.random()`` and other ``random.<fn>(`` calls. The negative
#   lookbehind rejects ``np.random.`` / ``numpy.random.`` since those
#   are NumPy-namespace calls handled by ``_PATTERN_NUMPY``.
# - ``np.random.<fn>(`` legacy-API calls (excluding ``Generator`` /
#   ``PCG64`` / ``default_rng`` which are the sanctioned constructors).
_PATTERN_STDLIB = re.compile(
    r"(?<![A-Za-z0-9_.])random\.(?P<fn>[A-Za-z_][A-Za-z0-9_]*)\s*\("
)
_PATTERN_NUMPY = re.compile(
    r"\b(?:np|numpy)\.random\.(?P<fn>[A-Za-z_][A-Za-z0-9_]*)\s*\("
)

_NUMPY_ALLOWED = {"Generator", "PCG64", "default_rng", "SeedSequence", "BitGenerator"}

# Stdlib helpers that may legitimately appear (e.g. ``random.Random`` for
# explicit independent generators). The audit is strict about
# ``random.random()`` / ``random.choice()`` / etc. — anything that reads
# from the module-global RNG.
_STDLIB_ALLOWED: set[str] = set()


def _is_python_source(path: Path) -> bool:
    return path.suffix == ".py" and "__pycache__" not in path.parts


def _iter_sources(root: Path) -> Iterator[Path]:
    for p in sorted(root.rglob("*.py")):
        if _is_python_source(p):
            yield p


def _strip_comments_and_strings(text: str) -> str:
    """Blank out comments + string literals while preserving line layout.

    Uses :mod:`tokenize` so docstrings, triple-quoted strings, and ``#``
    comments are all replaced with whitespace of the same shape. This
    means our regex sweep cannot accidentally match patterns that
    appear inside doc text (e.g. "RC3 fallback uses 0.5 instead of
    ``random.random()``" should NOT count as a leak).
    """
    try:
        tokens = list(tokenize.tokenize(io.BytesIO(text.encode("utf-8")).readline))
    except (tokenize.TokenizeError, IndentationError, SyntaxError):
        return text

    lines = text.splitlines(keepends=True)
    out_lines = [list(ln) for ln in lines]

    def _blank(start: tuple[int, int], end: tuple[int, int]) -> None:
        sr, sc = start
        er, ec = end
        for row in range(sr, er + 1):
            if row < 1 or row > len(out_lines):
                continue
            line = out_lines[row - 1]
            col_lo = sc if row == sr else 0
            col_hi = ec if row == er else len(line)
            for i in range(col_lo, min(col_hi, len(line))):
                if line[i] != "\n":
                    line[i] = " "

    for tok in tokens:
        if tok.type in (tokenize.COMMENT, tokenize.STRING):
            _blank(tok.start, tok.end)
    return "".join("".join(row) for row in out_lines)


def find_leaks_in_text(text: str) -> list[tuple[int, str]]:
    """Return ``(line_number, match_str)`` tuples for unmanaged RNG calls.

    Comments and string literals (including docstrings) are stripped
    before pattern matching so prose mentions of ``random.random()`` in
    docstrings do not register as leaks.
    """
    scrubbed = _strip_comments_and_strings(text)
    leaks: list[tuple[int, str]] = []
    for m in _PATTERN_STDLIB.finditer(scrubbed):
        fn = m.group("fn")
        if fn in _STDLIB_ALLOWED:
            continue
        line = scrubbed.count("\n", 0, m.start()) + 1
        leaks.append((line, f"random.{fn}("))
    for m in _PATTERN_NUMPY.finditer(scrubbed):
        fn = m.group("fn")
        if fn in _NUMPY_ALLOWED:
            continue
        line = scrubbed.count("\n", 0, m.start()) + 1
        leaks.append((line, f"np.random.{fn}("))
    return leaks


def audit_paths(root: Path) -> list[tuple[Path, int, str]]:
    """Return ``(relative_path, line, match)`` leaks under ``root``."""
    leaks: list[tuple[Path, int, str]] = []
    for src in _iter_sources(root):
        rel = src.relative_to(root)
        if rel in _ALLOWLIST_RELATIVE:
            continue
        try:
            text = src.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for line, match in find_leaks_in_text(text):
            leaks.append((rel, line, match))
    return leaks


def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="project-utopia-rng-audit",
        description="Scan project_utopia/ for unmanaged RNG calls (determinism leaks).",
    )
    p.add_argument(
        "--root",
        type=str,
        default=str(_PKG_ROOT),
        help="package root to scan (default: project_utopia/)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_argparser().parse_args(argv)
    root = Path(args.root).resolve()
    if not root.exists():
        sys.stderr.write(f"[rng-coverage] root not found: {root}\n")
        return 2
    leaks = audit_paths(root)
    if not leaks:
        sys.stdout.write("[rng-coverage] OK — no unmanaged RNG calls outside rng.py\n")
        return 0
    sys.stdout.write(f"[rng-coverage] FOUND {len(leaks)} leak(s):\n")
    for rel, line, match in leaks:
        sys.stdout.write(f"  {rel.as_posix()}:{line}  {match}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
