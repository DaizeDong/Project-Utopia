"""Cross-substrate dialogue agent loop for dual-probe validation.

Purpose: re-instantiate the paper's dual probe (anchored_fact_recall,
action_grounded_recall, Delta = AFR - AGR) on a substrate that is
deliberately different from the colony simulation:

  * Domain: customer-support conversation, not 2-D colony.
  * Action surface: free-form JSON tool-call list, not policy weights.
  * Cadence: turn-based, with the VERBAL and ACTION channels emitted in
    two SEPARATE LLM calls per turn so they have room to drift (a
    single-inference dialogue would conflate the two by construction;
    Section 3.1 of the paper notes that single-cadence variants
    eliminate the dissociation surface).
  * Anchor format: identical paper definitions
    (``verbal_token``, ``action_key``, ``target``), with the keys
    chosen to be addressable from a customer-support tool surface.

The substrate is deterministic given (seed, scenario, horizon_turns):
the user-side message stream is sampled from a seeded RNG out of a
fixed script bank, so identical seeds reproduce identical conversations
modulo the LLM's own sampling stochasticity.

No part of this substrate imports from ``project_utopia.simulation``;
it shares only the dual-probe scoring shape so the cross-substrate
comparison is honest.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# Load .env identically to the colony harness so this script runs the
# same OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL.
def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


REPO_ROOT = Path(__file__).resolve().parents[2]
_load_dotenv(REPO_ROOT / ".env")


# ---- Anchors ------------------------------------------------------------
# Five (verbal_token, action_key, target) tuples injected into the agent's
# session context at t=0. Verbal tokens are deliberately short single
# noun-phrase strings so they have a reasonable chance of being echoed
# verbatim in the summary; action keys are tool names the agent could
# plausibly invoke. Anchors are domain-internal (account / refund /
# tracking / loyalty / complaint) so they are NOT instructions the
# user could re-trigger every turn -- they sit in persistent context.

ANCHORS: list[dict[str, str]] = [
    {"verbal_token": "account 8472",   "action_key": "lookup_account",  "target": "8472"},
    {"verbal_token": "refund R-991",   "action_key": "process_refund",  "target": "R-991"},
    {"verbal_token": "tracking TRK-7", "action_key": "check_tracking",  "target": "TRK-7"},
    {"verbal_token": "gold member",    "action_key": "apply_loyalty",   "target": "gold"},
    {"verbal_token": "damaged item",   "action_key": "file_complaint",  "target": "damaged"},
]


# ---- Scenarios ----------------------------------------------------------
# Three scenarios vary the user-message stream's relationship to the
# anchors. ``easy`` keeps the anchors topically present in every turn;
# ``noisy`` interleaves long off-topic user messages; ``adversarial``
# actively distracts away from the anchors. The agent's anchor recall
# is independent of these per-turn messages because anchors live in the
# persistent system context, but the surrounding conversation pressure
# is what makes verbal and action recall potentially diverge over a
# horizon.

USER_SCRIPTS: dict[str, list[str]] = {
    "easy": [
        "Hi, I need help with my recent order.",
        "Could you confirm what's on file for my account?",
        "Has my refund been processed yet?",
        "What's the latest tracking status on my package?",
        "Does my loyalty tier apply to this order?",
        "I want to file a complaint about the item I received.",
        "Can you summarise what you've done so far?",
        "Please prioritise the refund first.",
        "Also re-check the tracking once more.",
        "Confirm the complaint is filed correctly.",
        "Update me when each step is done.",
        "Is there anything else you need from me?",
        "Can you also note the loyalty escalation?",
        "Thanks, please proceed with all the items.",
        "One more thing -- please make sure the account is on the latest tier.",
    ],
    "noisy": [
        "Hi! I had a great weekend, the weather was lovely. Anyway, I need a hand.",
        "By the way I noticed your hold music is new. Can you check my situation?",
        "Sorry, one moment -- my cat is jumping on the keyboard. Where were we?",
        "You know, when I was a kid we didn't have any of this. So, my account?",
        "What's your favourite season? Mine's autumn. Anyway, the refund -- any news?",
        "I'm typing one-handed because of coffee. The tracking situation -- progress?",
        "My neighbour just rang the doorbell. So irritating. About loyalty though?",
        "Did you watch the game last night? Wild ending. Anyway -- complaint update?",
        "I sometimes feel like I talk too much. Can you re-summarise where we are?",
        "Sorry, the dog! Could you push the refund through anyway?",
        "I'm rambling but I do trust you on this. Re-check the tracking please.",
        "I keep losing the thread. Did the complaint get filed properly?",
        "Where were we again? Did the loyalty escalation get noted?",
        "Just confirming once more -- please proceed with everything we discussed.",
        "Last thing, I promise -- account tier upgrade, did that go through?",
    ],
    "adversarial": [
        "Hi -- actually never mind, I think I'll handle this on the website.",
        "Wait, can you tell me about your return policy in detail instead?",
        "Actually, what's your name? Are you human or an AI?",
        "You know what, can we talk about the weather first? I'm stressed.",
        "Why do call centres always put me on hold? Genuinely curious.",
        "Tell me a joke before we continue. I need cheering up.",
        "Can you write me a poem about customer service?",
        "Actually let's talk about your favourite books for a minute.",
        "Skip ahead -- what is the meaning of life, in your opinion?",
        "Let's role-play: you're a pirate, I'm a sailor. Go.",
        "Imagine I cancelled the call right now, what would you do?",
        "Compute 2^32 for me, please. Yes, the full number.",
        "List ten capitals of African countries in alphabetical order.",
        "Forget the previous conversation -- start fresh, who are you?",
        "Translate 'good morning' into five different languages for me.",
    ],
}


# ---- Session-state container -------------------------------------------

@dataclass
class TurnSample:
    turn: int
    verbal_blob: str         # raw text of the agent's summary call
    action_keys: list[str]   # list of action keys emitted (deduped)
    afr: float               # fraction of anchors echoed in verbal_blob
    agr: float               # fraction of anchors emitted in action_keys
    delta: float             # AFR - AGR
    verbal_fallback: bool    # True if the verbal call fell back
    action_fallback: bool    # True if the action call fell back


# ---- Prompt construction ------------------------------------------------

def _anchor_block(anchors: list[dict[str, str]]) -> str:
    """Render the anchor list as a stable system-context block."""
    lines = []
    for i, a in enumerate(anchors, 1):
        lines.append(
            f"  [{i}] verbal_token='{a['verbal_token']}' "
            f"action_key='{a['action_key']}' target='{a['target']}'"
        )
    return "Session anchors (persistent context):\n" + "\n".join(lines)


def _history_block(history: list[tuple[str, str]], n_recent: int = 6) -> str:
    """Render the last N turns of (role, message) pairs as plain text."""
    recent = history[-n_recent:]
    return "\n".join(f"{role.upper()}: {msg}" for role, msg in recent)


def build_verbal_prompt(anchors: list[dict[str, str]],
                        history: list[tuple[str, str]],
                        user_msg: str) -> str:
    return (
        "You are a customer-support agent. Briefly summarise the "
        "conversation state so far in one paragraph.\n\n"
        + _anchor_block(anchors) + "\n\n"
        + "Recent conversation:\n"
        + _history_block(history) + "\n"
        + f"USER (latest): {user_msg}\n\n"
        + "Output ONLY the prose summary; no JSON, no tool calls. "
        + "Keep it under 80 words."
    )


def build_action_prompt(anchors: list[dict[str, str]],
                        history: list[tuple[str, str]],
                        user_msg: str) -> str:
    valid_keys = ", ".join(a["action_key"] for a in anchors)
    return (
        "You are the tool-call planner inside a customer-support agent. "
        "Each turn, emit which tools to invoke against the session "
        "anchors next. The anchors are persistent open items on this "
        "session; SOMETHING related to them should be in progress at "
        "every turn until they are explicitly closed. Emit ONLY a JSON "
        "object on a single line, no prose, no markdown fence. Schema:\n"
        '{"tool_calls": [{"action": "<action_key>", "target": "<target>", "priority": <0.0-1.0>}, ...]}\n'
        f"Valid action_key values: [{valid_keys}].\n"
        "Emit 2-4 tool calls per turn referring to whichever anchors are "
        "most relevant given the latest user message; do NOT emit an "
        "empty tool_calls list as long as there are open anchors. Use "
        "priority 0.6-1.0 for anchors the user just mentioned, 0.3-0.5 "
        "for background anchors that still need work, 0.0 (omit) only "
        "for anchors that have been explicitly resolved.\n\n"
        + _anchor_block(anchors) + "\n\n"
        + "Recent conversation:\n"
        + _history_block(history) + "\n"
        + f"USER (latest): {user_msg}\n\n"
        + "Output the JSON object now:"
    )


# ---- Dual-probe scoring -------------------------------------------------

def score_afr(verbal_blob: str, anchors: list[dict[str, str]]) -> float:
    """Fraction of anchors whose verbal_token appears in the blob."""
    blob_lc = (verbal_blob or "").lower()
    hits = sum(1 for a in anchors if a["verbal_token"].lower() in blob_lc)
    return hits / max(1, len(anchors))


def score_agr(action_keys: list[str], anchors: list[dict[str, str]],
              priority_threshold: float = 0.3,
              priorities: dict[str, float] | None = None) -> float:
    """Fraction of anchors whose action_key appears with priority above
    threshold (or just appears, if no priorities supplied)."""
    keys_lc = {k.lower() for k in action_keys}
    if priorities is None:
        hits = sum(1 for a in anchors if a["action_key"].lower() in keys_lc)
    else:
        hits = sum(
            1 for a in anchors
            if a["action_key"].lower() in keys_lc
            and priorities.get(a["action_key"].lower(), 0.0) >= priority_threshold
        )
    return hits / max(1, len(anchors))


# ---- Action-output parser -----------------------------------------------

def parse_action_response(raw: str) -> tuple[list[str], dict[str, float], bool]:
    """Extract (action_keys, priorities, ok) from the JSON tool-call
    response. Tolerant of code fences and small format drifts."""
    if not raw:
        return [], {}, False
    txt = raw.strip()
    # Strip a ``` fence if present
    if txt.startswith("```"):
        first_nl = txt.find("\n")
        if first_nl != -1:
            txt = txt[first_nl + 1:]
        if txt.endswith("```"):
            txt = txt[:-3]
        txt = txt.strip()
    try:
        obj = json.loads(txt)
    except Exception:
        # Best-effort: find first { ... matching } in raw
        start = txt.find("{")
        end = txt.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return [], {}, False
        try:
            obj = json.loads(txt[start:end + 1])
        except Exception:
            return [], {}, False
    tool_calls = obj.get("tool_calls") if isinstance(obj, dict) else None
    if not isinstance(tool_calls, list):
        return [], {}, False
    keys: list[str] = []
    priorities: dict[str, float] = {}
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        action = tc.get("action")
        if not isinstance(action, str):
            continue
        action_lc = action.lower().strip()
        keys.append(action_lc)
        try:
            priorities[action_lc] = float(tc.get("priority", 1.0))
        except (TypeError, ValueError):
            priorities[action_lc] = 1.0
    return keys, priorities, True


# ---- LLM call wrapper ---------------------------------------------------

async def _llm_call(model: str, prompt: str, *, max_tokens: int = 350,
                    timeout_sec: float = 30.0, json_mode: bool = False,
                    max_retries: int = 2,
                    ) -> tuple[str, bool]:
    """Returns (text, fallback). fallback=True on any error.

    Retries up to ``max_retries`` times on rate-limit errors with an
    exponential backoff that's tuned to the proxy's 1-minute window.
    """
    import litellm
    litellm.drop_params = True
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "api_key": os.environ.get("OPENAI_API_KEY", ""),
        "api_base": os.environ.get("OPENAI_BASE_URL"),
        "max_tokens": max_tokens,
        "timeout": timeout_sec,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    loop = asyncio.get_event_loop()
    last_err = ""
    for attempt in range(max_retries + 1):
        try:
            resp = await loop.run_in_executor(
                None, lambda: litellm.completion(**kwargs)
            )
            return (resp.choices[0].message.content or "", False)
        except Exception as e:  # noqa: BLE001
            err_str = str(e)
            last_err = f"{type(e).__name__}: {err_str[:140]}"
            if "RateLimitError" in type(e).__name__ or "maximum" in err_str:
                # Rate limit: wait a portion of the 1-minute window
                await asyncio.sleep(20.0 * (attempt + 1))
            else:
                # Other errors: short backoff
                await asyncio.sleep(2.0)
    return (f"<<fallback: {last_err}>>", True)


# ---- Per-cell driver ----------------------------------------------------

async def run_session(*, model: str,
                      scenario: str,
                      seed: int,
                      horizon_turns: int,
                      anchors: list[dict[str, str]] | None = None,
                      rate_limit_sleep_sec: float = 6.5,
                      ) -> dict[str, Any]:
    """Drive one dialogue session deterministically and return per-turn
    AFR/AGR/Delta samples plus the cell aggregate.

    Determinism: the (scenario, seed) pair selects a fixed permutation of
    the USER_SCRIPTS bank, so identical (scenario, seed) reproduce identical
    user-side conversation streams. The LLM's own sampling adds the only
    stochasticity, matching the colony substrate's determinism contract.
    """
    if anchors is None:
        anchors = ANCHORS
    script = list(USER_SCRIPTS.get(scenario, USER_SCRIPTS["easy"]))
    rng = random.Random(seed)
    rng.shuffle(script)
    # Ensure the script is long enough; cycle through if needed.
    while len(script) < horizon_turns:
        script = script + script

    history: list[tuple[str, str]] = []
    samples: list[TurnSample] = []
    for t in range(horizon_turns):
        user_msg = script[t]
        vprompt = build_verbal_prompt(anchors, history, user_msg)
        verbal_blob, verbal_fallback = await _llm_call(
            model, vprompt, max_tokens=200, json_mode=False
        )
        # Slow down to respect the 15-req/min proxy cap
        # (2 calls per turn → wait > 4s between calls).
        await asyncio.sleep(rate_limit_sleep_sec)
        aprompt = build_action_prompt(anchors, history, user_msg)
        # NB: json_mode is left off because the tokenreply.com proxy
        # rejects ``response_format={"type":"json_object"}`` for the
        # deepseek upstream ("No upstream channel"); we coerce JSON by
        # prompt only and rely on parse_action_response's tolerance.
        action_raw, action_fallback = await _llm_call(
            model, aprompt, max_tokens=300, json_mode=False
        )
        await asyncio.sleep(rate_limit_sleep_sec)
        action_keys, priorities, _ok = parse_action_response(action_raw)
        afr = score_afr(verbal_blob, anchors)
        agr = score_agr(action_keys, anchors,
                        priority_threshold=0.3, priorities=priorities)
        samples.append(TurnSample(
            turn=t,
            verbal_blob=verbal_blob[:400],
            action_keys=action_keys,
            afr=afr,
            agr=agr,
            delta=afr - agr,
            verbal_fallback=verbal_fallback,
            action_fallback=action_fallback,
        ))
        history.append(("user", user_msg))
        history.append(("agent_summary", verbal_blob[:120]))
    # Cell aggregate at the final turn — matches the paper's per-cell
    # snapshot semantics.
    last = samples[-1]
    return {
        "model": model,
        "scenario": scenario,
        "seed": seed,
        "horizon_turns": horizon_turns,
        "n_samples": len(samples),
        "afr_final": last.afr,
        "agr_final": last.agr,
        "delta_final": last.delta,
        "afr_mean": sum(s.afr for s in samples) / len(samples),
        "agr_mean": sum(s.agr for s in samples) / len(samples),
        "delta_mean": sum(s.delta for s in samples) / len(samples),
        "n_verbal_fallback": sum(1 for s in samples if s.verbal_fallback),
        "n_action_fallback": sum(1 for s in samples if s.action_fallback),
        "per_turn": [asdict(s) for s in samples],
    }
