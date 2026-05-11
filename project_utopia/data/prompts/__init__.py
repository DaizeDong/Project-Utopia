"""LLM channel prompt files (paper §A2 — verbatim port from ``src/data/prompts/``).

The four prompt files (one per LLM decision channel) form the LLM
contract surface used by the academic benchmark. They are:

* ``environment_director.txt`` — weather / events / faction tension
* ``npc_policy.txt`` — group intent weights + target priorities
* ``strategic_plan.txt`` — colony long-horizon goals
* ``colony_agent.txt`` — Perceive→Plan→Ground→Execute→Evaluate→Reflect

The :func:`load_prompt` helper reads a prompt by channel name. Channel
names use the canonical ``snake_case`` form (matching the Python
filenames); for convenience the ``dash-case`` JS form is also accepted
(``environment-director`` → ``environment_director``).
"""

from __future__ import annotations

from importlib import resources
from typing import Final

__all__ = ["AVAILABLE_CHANNELS", "load_prompt"]


_CHANNEL_ALIASES: Final[dict[str, str]] = {
    "environment_director": "environment_director",
    "environment-director": "environment_director",
    "environmentDirector": "environment_director",
    "npc_policy": "npc_policy",
    "npc-policy": "npc_policy",
    "npcPolicy": "npc_policy",
    "npc-brain": "npc_policy",
    "npc_brain": "npc_policy",
    "strategic_plan": "strategic_plan",
    "strategic-plan": "strategic_plan",
    "strategicPlan": "strategic_plan",
    "strategic-director": "strategic_plan",
    "strategic_director": "strategic_plan",
    "colony_agent": "colony_agent",
    "colony-agent": "colony_agent",
    "colonyAgent": "colony_agent",
    "npc-colony-planner": "colony_agent",
    "npc_colony_planner": "colony_agent",
}


AVAILABLE_CHANNELS: Final[tuple[str, ...]] = (
    "environment_director",
    "npc_policy",
    "strategic_plan",
    "colony_agent",
)


def load_prompt(channel: str) -> str:
    """Return the prompt text for a channel.

    Parameters
    ----------
    channel
        One of the four canonical channel names (``environment_director``,
        ``npc_policy``, ``strategic_plan``, ``colony_agent``). Common
        synonyms (dash-case, camelCase, JS filenames) are accepted.

    Returns
    -------
    str
        The prompt body as UTF-8 text, with trailing whitespace stripped
        but internal whitespace preserved exactly.

    Raises
    ------
    ValueError
        If ``channel`` is not a recognised LLM decision channel.
    """
    key = _CHANNEL_ALIASES.get(channel)
    if key is None:
        raise ValueError(
            f"unknown prompt channel: {channel!r} (known: {sorted(AVAILABLE_CHANNELS)!r})"
        )
    text = resources.files(__name__).joinpath(f"{key}.txt").read_text(encoding="utf-8")
    return text.rstrip()
