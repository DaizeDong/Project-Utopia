"""Constant-table immutability checks (port of JS ``test/config-constants.test.js``)."""

from __future__ import annotations

from types import MappingProxyType

import pytest

from project_utopia.config import constants as C


class TestSystemOrder:
    def test_is_tuple(self) -> None:
        assert isinstance(C.SYSTEM_ORDER, tuple)

    def test_immutable(self) -> None:
        # Tuples don't support item assignment.
        with pytest.raises(TypeError):
            C.SYSTEM_ORDER[0] = "Modified"  # type: ignore[index]

    def test_contains_expected_systems(self) -> None:
        expected = {
            "SimulationClock",
            "RoleAssignmentSystem",
            "WeatherSystem",
            "WorldEventSystem",
            "WorkerAISystem",
            "ConstructionSystem",
            "MortalitySystem",
            "BoidsSystem",
            "ResourceSystem",
        }
        assert expected.issubset(set(C.SYSTEM_ORDER))

    def test_no_removed_systems(self) -> None:
        """S3-removed systems must NOT appear in SYSTEM_ORDER."""
        removed = {
            "AnimalAISystem",
            "WildlifePopulationSystem",
            "ProcessingSystem",
            "ProgressionSystem",
        }
        intersection = set(C.SYSTEM_ORDER) & removed
        assert intersection == set(), f"removed systems still present: {intersection}"


class TestTileTable:
    def test_tile_is_mapping_proxy(self) -> None:
        assert isinstance(C.TILE, MappingProxyType)

    def test_tile_immutable(self) -> None:
        with pytest.raises(TypeError):
            C.TILE["GRASS"] = 99  # type: ignore[index]

    def test_known_ids(self) -> None:
        assert C.TILE["GRASS"] == 0
        assert C.TILE["GATE"] == 14
        # Tile IDs are contiguous from 0..14.
        assert set(C.TILE.values()) == set(range(15))

    def test_tile_info_covers_every_tile(self) -> None:
        assert set(C.TILE_INFO.keys()) == set(C.TILE.values())


class TestEnumTables:
    @pytest.mark.parametrize(
        "table",
        [
            "ENTITY_TYPE",
            "VISITOR_KIND",
            "ANIMAL_KIND",
            "ANIMAL_SPECIES",
            "ROLE",
            "WEATHER",
            "EVENT_TYPE",
            "NODE_FLAGS",
            "FOG_STATE",
            "DEFAULT_GRID",
            "TILE_INFO",
            "WORKER_DEFAULTS",
        ],
    )
    def test_is_mapping_proxy(self, table: str) -> None:
        attr = getattr(C, table)
        assert isinstance(attr, MappingProxyType)

    def test_resource_types_is_tuple(self) -> None:
        assert isinstance(C.RESOURCE_TYPES, tuple)
        assert C.RESOURCE_TYPES == ("food", "wood", "stone", "herbs")

    def test_move_directions_is_tuple(self) -> None:
        assert isinstance(C.MOVE_DIRECTIONS_4, tuple)
        assert len(C.MOVE_DIRECTIONS_4) == 4
        assert all(isinstance(d, tuple) and len(d) == 2 for d in C.MOVE_DIRECTIONS_4)


class TestFeatureFlags:
    def test_use_fsm_default_true(self) -> None:
        assert C.FEATURE_FLAGS.USE_FSM is True

    def test_feature_flags_frozen(self) -> None:
        with pytest.raises(AttributeError):
            C.FEATURE_FLAGS.USE_FSM = False  # type: ignore[misc]

    def test_test_setter_round_trip(self) -> None:
        C._test_set_feature_flag("USE_FSM", False)
        try:
            assert C.FEATURE_FLAGS.USE_FSM is False
        finally:
            # Restore to default so other tests are not affected.
            C._test_set_feature_flag("USE_FSM", True)
        assert C.FEATURE_FLAGS.USE_FSM is True


class TestBalance:
    def test_imports_cleanly(self) -> None:
        from project_utopia.config import balance as B

        assert isinstance(B.BALANCE, MappingProxyType)
        assert isinstance(B.BUILD_COST, MappingProxyType)
        assert isinstance(B.INITIAL_RESOURCES, MappingProxyType)
        # Load-bearing LLM clamp ranges.
        assert B.BALANCE["intentWeightMin"] == 0.0
        assert B.BALANCE["intentWeightMax"] == 3.0
        assert B.BALANCE["riskToleranceMin"] == 0.0
        assert B.BALANCE["riskToleranceMax"] == 1.0


class TestAiConfig:
    def test_imports_cleanly(self) -> None:
        from project_utopia.config import ai_config as AC

        assert isinstance(AC.AI_CONFIG, MappingProxyType)
        assert isinstance(AC.GROUP_IDS, MappingProxyType)
        assert AC.GROUP_IDS["WORKERS"] == "workers"

    def test_canonicalize_helper(self) -> None:
        from project_utopia.config.ai_config import canonicalize_ai_group_id

        assert canonicalize_ai_group_id("WORKER") == "workers"
        assert canonicalize_ai_group_id("merchants") == "traders"
        assert canonicalize_ai_group_id("raider") == "saboteurs"
        assert canonicalize_ai_group_id("") == ""

    def test_group_policy_contract_lookup(self) -> None:
        from project_utopia.config.ai_config import (
            get_group_policy_contract,
            list_allowed_policy_intents,
        )

        c = get_group_policy_contract("workers")
        assert c is not None
        assert "farm" in c["allowedIntents"]
        assert get_group_policy_contract("nonexistent_group") is None
        assert "farm" in list_allowed_policy_intents("workers")

    def test_default_group_policies_load(self) -> None:
        from project_utopia.config.ai_config import DEFAULT_GROUP_POLICIES

        assert "workers" in DEFAULT_GROUP_POLICIES
        wp = DEFAULT_GROUP_POLICIES["workers"]
        assert wp["groupId"] == "workers"
        assert "intentWeights" in wp


class TestLongRunProfile:
    def test_imports_cleanly(self) -> None:
        from project_utopia.config import long_run_profile as L

        assert isinstance(L.AI_LONG_RUN_TUNING, MappingProxyType)

    def test_runtime_profile_dispatch(self) -> None:
        from project_utopia.config.long_run_profile import get_long_run_ai_tuning

        long = get_long_run_ai_tuning("long_run")
        default = get_long_run_ai_tuning("default")
        # The values must differ — that's the whole point of the runtime gate.
        assert long is not default
        assert long["environmentDecisionIntervalSec"] != default["environmentDecisionIntervalSec"]

    def test_state_bag_lookup(self) -> None:
        from project_utopia.config.long_run_profile import get_long_run_ai_tuning

        state = {"ai": {"runtimeProfile": "long_run"}}
        assert get_long_run_ai_tuning(state)["environmentDecisionIntervalSec"] == 18.0
