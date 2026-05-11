"""Determinism + RNG audit scripts (port of ``tools/audit/``).

Each script is invokable as ``python -m project_utopia.tools.audit.<name>``
or via the corresponding console-script entry point in ``pyproject.toml``.

Modules:

* :mod:`project_utopia.tools.audit.determinism_check` — runs SimHarness
  twice with the same seed and asserts a slim state hash matches.
* :mod:`project_utopia.tools.audit.rng_coverage_report` — scans the
  package for legacy/global RNG calls outside ``project_utopia.app.rng``.
"""

from __future__ import annotations

__all__: list[str] = []
