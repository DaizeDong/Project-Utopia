"""Tests for the single-function progression helper."""

from __future__ import annotations

from project_utopia.simulation.meta.progression_helper import (
    RECOVERY_ESSENTIAL_TYPES,
    is_recovery_essential,
)


class TestRecoveryEssential:
    def test_essential_types(self) -> None:
        for t in ("farm", "lumber", "warehouse", "road"):
            assert is_recovery_essential(t) is True

    def test_non_essential_types(self) -> None:
        for t in ("wall", "kitchen", "smithy", "clinic", "bridge", "gate"):
            assert is_recovery_essential(t) is False

    def test_unknown_string(self) -> None:
        assert is_recovery_essential("zzz") is False

    def test_set_is_frozen(self) -> None:
        assert isinstance(RECOVERY_ESSENTIAL_TYPES, frozenset)
