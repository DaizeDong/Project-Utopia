"""``python -m project_utopia.tools.audit`` — dispatch to a named audit script.

Usage::

    python -m project_utopia.tools.audit determinism_check --tier 1
    python -m project_utopia.tools.audit rng_coverage_report

Without a sub-command, prints a short usage banner and exits with code 2.
"""

from __future__ import annotations

import sys

_SUBCOMMANDS = {"determinism_check", "rng_coverage_report"}


def _usage() -> str:
    return (
        "usage: python -m project_utopia.tools.audit <subcommand> [args...]\n"
        f"  subcommands: {sorted(_SUBCOMMANDS)!r}\n"
    )


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in {"-h", "--help"}:
        sys.stdout.write(_usage())
        return 0
    sub = args[0]
    if sub not in _SUBCOMMANDS:
        sys.stderr.write(f"error: unknown subcommand {sub!r}\n")
        sys.stderr.write(_usage())
        return 2

    rest = args[1:]
    if sub == "determinism_check":
        from . import determinism_check

        return int(determinism_check.main(rest) or 0)
    if sub == "rng_coverage_report":
        from . import rng_coverage_report

        return int(rng_coverage_report.main(rest) or 0)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
