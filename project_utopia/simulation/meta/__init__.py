"""Meta-system ports — colony director, event director, game event bus.

Skipped per RC3 audit:
* ``ProgressionSystem.js`` (920 LOC, dead) — only ``is_recovery_essential``
  ported to :mod:`progression_helper`.
* ``DevIndexSystem`` and ``RaidEscalatorSystem`` are present but compact.
"""

from __future__ import annotations
