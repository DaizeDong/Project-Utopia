"""Allow ``python -m project_utopia.cli`` to invoke the paper-run CLI."""

from __future__ import annotations

from .benchmark_paper import main

if __name__ == "__main__":
    raise SystemExit(main())
