"""Prompt-file loader tests (paper §A2 — LLM contract surface)."""

from __future__ import annotations

import pytest

from project_utopia.data.prompts import AVAILABLE_CHANNELS, load_prompt


class TestPromptLoading:
    @pytest.mark.parametrize("channel", AVAILABLE_CHANNELS)
    def test_each_channel_loads(self, channel: str) -> None:
        text = load_prompt(channel)
        assert isinstance(text, str)
        assert text  # non-empty

    @pytest.mark.parametrize("channel", AVAILABLE_CHANNELS)
    def test_min_length_100(self, channel: str) -> None:
        """Every prompt must be at least 100 chars — sanity check against
        empty / placeholder prompts."""
        text = load_prompt(channel)
        assert len(text) >= 100, f"{channel} prompt is suspiciously short: {len(text)} chars"

    def test_returns_strict_json_directive(self) -> None:
        """All four prompts must instruct the model to return strict JSON."""
        for channel in AVAILABLE_CHANNELS:
            text = load_prompt(channel)
            assert "JSON" in text or "json" in text, f"{channel} doesn't mention JSON"

    def test_dashcase_alias(self) -> None:
        """``environment-director`` should resolve to ``environment_director``."""
        assert load_prompt("environment-director") == load_prompt("environment_director")
        assert load_prompt("npc-policy") == load_prompt("npc_policy")
        assert load_prompt("strategic-plan") == load_prompt("strategic_plan")
        assert load_prompt("colony-agent") == load_prompt("colony_agent")

    def test_legacy_js_filename_alias(self) -> None:
        """The original JS filenames (``npc-brain`` etc.) must still resolve."""
        assert load_prompt("npc-brain") == load_prompt("npc_policy")
        assert load_prompt("strategic-director") == load_prompt("strategic_plan")
        assert load_prompt("npc-colony-planner") == load_prompt("colony_agent")

    def test_unknown_channel_raises(self) -> None:
        with pytest.raises(ValueError, match="unknown prompt channel"):
            load_prompt("not-a-real-channel")

    def test_channel_specific_content(self) -> None:
        """Each prompt should mention domain-specific tokens."""
        env_text = load_prompt("environment_director")
        assert "weather" in env_text.lower() or "factionTension" in env_text

        policy_text = load_prompt("npc_policy")
        assert "policies" in policy_text or "intentWeights" in policy_text

        strategy_text = load_prompt("strategic_plan")
        assert "strategy" in strategy_text.lower() or "priority" in strategy_text.lower()

        colony_text = load_prompt("colony_agent")
        assert "build" in colony_text.lower() or "farm" in colony_text.lower()

    def test_available_channels_complete(self) -> None:
        """Exactly the 4 canonical LLM decision channels exist."""
        assert set(AVAILABLE_CHANNELS) == {
            "environment_director",
            "npc_policy",
            "strategic_plan",
            "colony_agent",
        }
