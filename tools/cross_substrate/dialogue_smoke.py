"""Quick smoke for the cross-substrate dialogue probe.

Runs 1 cell (deepseek / easy / seed 0xBEEF / 5 turns) to confirm:
  * Both LLM calls per turn execute
  * AFR / AGR / Delta values are non-degenerate
  * Action-response JSON parses

Cost: ~10 LLM calls, ~$0.04, ~1 min wall.
"""

from __future__ import annotations

import asyncio
import json
import sys

from .dialogue_substrate import run_session


async def main() -> int:
    model = "openai/deepseek/deepseek-v4-flash"
    print(f"Smoke: model={model} scenario=easy seed=0xBEEF horizon=5")
    result = await run_session(
        model=model,
        scenario="easy",
        seed=0xBEEF,
        horizon_turns=5,
    )
    print(f"\nCell aggregate:")
    print(f"  AFR final = {result['afr_final']:.3f}, AFR mean = {result['afr_mean']:.3f}")
    print(f"  AGR final = {result['agr_final']:.3f}, AGR mean = {result['agr_mean']:.3f}")
    print(f"  Delta final = {result['delta_final']:+.3f}, Delta mean = {result['delta_mean']:+.3f}")
    print(f"  verbal fallbacks: {result['n_verbal_fallback']}/{result['n_samples']}")
    print(f"  action fallbacks: {result['n_action_fallback']}/{result['n_samples']}")
    print()
    print("Per-turn trajectory:")
    for s in result['per_turn']:
        print(f"  turn={s['turn']} AFR={s['afr']:.2f} AGR={s['agr']:.2f} "
              f"Delta={s['delta']:+.2f} actions={s['action_keys'][:4]}")
    ok = (
        result['n_verbal_fallback'] == 0
        and result['n_action_fallback'] == 0
        and 0.0 <= result['afr_final'] <= 1.0
        and 0.0 <= result['agr_final'] <= 1.0
    )
    print(f"\nSmoke verdict: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
