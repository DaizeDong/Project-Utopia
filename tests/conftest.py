"""Shared pytest fixtures for the Phase 1 ai/llm + ai/memory tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the repo root is on sys.path when pytest is invoked without an
# editable install (`pip install -e .` from pyproject is the canonical path,
# but the migration may run before that's wired).
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
