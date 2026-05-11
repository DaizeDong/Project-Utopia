"""Idempotency invariant for the ScriptedOraclePolicy blueprints.

For all 6 scenarios × {environment-director, npc-policy}, the blueprint
must satisfy ``guard(guard(x)) == guard(x)`` so a second guard pass on a
sandwich-normalised replay is a no-op (zero clamping needed). Strategic
and colony channels are free-form and have no guard, so they're skipped.
"""

from __future__ import annotations

import pytest

from project_utopia.benchmark.baselines.scripted_oracle_policy import (
    SCENARIO_BLUEPRINTS,
    SUPPORTED_SCENARIOS,
    ScriptedOraclePolicy,
)
from project_utopia.simulation.ai.llm.guardrails import (
    guard_environment_directive,
    guard_group_policies,
)

GUARDED_CHANNELS = ("environment-director", "npc-policy")


@pytest.mark.parametrize("scenario_id", list(SUPPORTED_SCENARIOS))
class TestIdempotent:
    def test_guard_environment_directive_is_fixed_point(self, scenario_id: str) -> None:
        blueprint = SCENARIO_BLUEPRINTS[scenario_id]["environment-director"]()
        once = guard_environment_directive(blueprint).model_dump(by_alias=False)
        twice = guard_environment_directive(once).model_dump(by_alias=False)
        assert once == twice, f"environment-director not idempotent for {scenario_id}"

    def test_guard_group_policies_is_fixed_point(self, scenario_id: str) -> None:
        blueprint = SCENARIO_BLUEPRINTS[scenario_id]["npc-policy"]()
        once = guard_group_policies(blueprint).model_dump(by_alias=False)
        twice = guard_group_policies(once).model_dump(by_alias=False)
        assert once == twice, f"npc-policy not idempotent for {scenario_id}"


class TestAdapterReplay:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("scenario_id", list(SUPPORTED_SCENARIOS))
    async def test_oracle_request_then_guard_no_drift(self, scenario_id: str) -> None:
        """Calling adapter.request() should already return guard-stable data.

        The blueprint output is pre-clamped inside `request()`. Re-running
        guardrails on the returned payload must produce byte-equal data.
        """
        oracle = ScriptedOraclePolicy(scenario_id)
        # environment-director channel
        env_resp = await oracle.request("environment-director", {}, None)
        assert env_resp.data is not None
        once = env_resp.data
        twice = guard_environment_directive(once).model_dump(by_alias=False)
        assert once == twice, f"env response drifted on second guard ({scenario_id})"

        # npc-policy channel
        pol_resp = await oracle.request("npc-policy", {}, None)
        assert pol_resp.data is not None
        once = pol_resp.data
        twice = guard_group_policies(once).model_dump(by_alias=False)
        assert once == twice, f"policy response drifted on second guard ({scenario_id})"


class TestAllSixScenariosPresent:
    def test_supported_scenarios_count(self) -> None:
        assert len(SUPPORTED_SCENARIOS) == 6

    def test_supported_scenarios_names(self) -> None:
        assert set(SUPPORTED_SCENARIOS) == {
            "temperate_plains",
            "fertile_riverlands",
            "rugged_highlands",
            "coastal_ocean",
            "archipelago_isles",
            "fortified_basin",
        }

    @pytest.mark.parametrize("scenario_id", list(SUPPORTED_SCENARIOS))
    def test_all_four_channels_have_builder(self, scenario_id: str) -> None:
        blueprint = SCENARIO_BLUEPRINTS[scenario_id]
        for ch in ("environment-director", "npc-policy", "strategic-plan", "colony-agent"):
            assert callable(blueprint[ch]), f"{scenario_id} missing channel {ch}"
