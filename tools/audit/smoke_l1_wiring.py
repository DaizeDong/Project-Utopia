"""L1 wiring smoke test — verifies that with ``attach_llm_channels=True`` and
a ScriptedOraclePolicy adapter, the LLM-emitted ``intent_weights`` and
``target_priorities`` actually drive worker FSM transitions + position
changes.

Success criteria (printed to stdout, no assertions):

1. Workers are NOT all at jitter-distance from initial spawn (so FSM
   movement is happening, not just rng.jitter).
2. ``state.ai.group_policies`` has at least one group with non-empty
   ``intent_weights`` after a few channel firings.
3. At least one worker has a non-IDLE FSM state.
4. At least one worker has ``blackboard.arrived_at_target = True`` (or
   was within 1 tile of its target at some point).
5. Determinism: re-running with same seed produces identical worker
   positions at t=60s.
"""

from __future__ import annotations

import asyncio
import math
import sys
from typing import Any

from project_utopia.benchmark.baselines.scripted_oracle_policy import ScriptedOraclePolicy
from project_utopia.benchmark.framework.sim_harness import DT_SEC, SimHarness


def _run_one(seed: int = 0xBEEF, duration_sec: float = 60.0) -> dict[str, Any]:
    adapter = ScriptedOraclePolicy("temperate_plains")
    harness = SimHarness(
        template_id="temperate_plains",
        seed=seed,
        ai_enabled=True,
        agent_adapter=adapter,
        attach_llm_channels=True,
        cadence_multiplier=2.0,  # fire channels often within 60s
    )
    initial_positions = {
        a["id"]: (float(a["x"]), float(a["z"]))
        for a in harness.alive_workers
    }
    scenario_anchors = (
        dict(getattr(harness.state.get("scenario"), "anchors", {}) or {})
    )

    arrived_anywhere = False
    fsm_state_counts: dict[str, int] = {}

    async def run() -> None:
        nonlocal arrived_anywhere
        ticks = int(duration_sec / DT_SEC)
        for _ in range(ticks):
            await harness.tick()
            for a in harness.alive_workers:
                bb = a.get("blackboard") or {}
                if bb.get("arrived_at_target"):
                    arrived_anywhere = True
                fsm = a.get("fsm") or {}
                st = fsm.get("state")
                key = getattr(st, "value", str(st)) if st is not None else "NONE"
                fsm_state_counts[key] = fsm_state_counts.get(key, 0) + 1

    asyncio.run(run())

    final_positions = {
        a["id"]: (float(a["x"]), float(a["z"]))
        for a in harness.alive_workers
    }
    distances = []
    for wid, (x0, z0) in initial_positions.items():
        x1, z1 = final_positions.get(wid, (x0, z0))
        distances.append(math.hypot(x1 - x0, z1 - z0))
    group_policies = (harness.state.get("ai") or {}).get("group_policies") or {}
    workers_policy = group_policies.get("workers") or {}
    final_resources = dict(harness.state.get("resources") or {})
    return {
        "seed": hex(seed),
        "initial_positions": initial_positions,
        "final_positions": final_positions,
        "distance_max": max(distances) if distances else 0.0,
        "distance_mean": (sum(distances) / len(distances)) if distances else 0.0,
        "scenario_anchors": scenario_anchors,
        "group_policies_present": bool(group_policies),
        "workers_intent_weights": (workers_policy.get("intent_weights") or {}),
        "workers_target_priorities": (workers_policy.get("target_priorities") or {}),
        "fsm_state_counts": fsm_state_counts,
        "arrived_anywhere": arrived_anywhere,
        "n_workers": len(final_positions),
        "final_resources": final_resources,
    }


def main() -> int:
    print("=== L1 wiring smoke test (ScriptedOraclePolicy, attach_llm_channels=True) ===")
    r1 = _run_one(seed=0xBEEF, duration_sec=60.0)
    print(f"\n[run 1] seed=0xBEEF, 60 sim-sec")
    print(f"  n_workers={r1['n_workers']}")
    print(f"  scenario_anchors={r1['scenario_anchors']}")
    print(f"  group_policies_present={r1['group_policies_present']}")
    print(f"  workers.intent_weights={dict(list(r1['workers_intent_weights'].items())[:6])}")
    print(f"  workers.target_priorities={dict(list(r1['workers_target_priorities'].items())[:6])}")
    print(f"  worker movement distance: max={r1['distance_max']:.2f} tiles, mean={r1['distance_mean']:.2f} tiles")
    print(f"  fsm_state_counts={r1['fsm_state_counts']}")
    print(f"  arrived_at_target (any worker, any tick)={r1['arrived_anywhere']}")
    print(f"  final resources={r1['final_resources']}")

    # Determinism check
    r2 = _run_one(seed=0xBEEF, duration_sec=60.0)
    pos_match = r1["final_positions"] == r2["final_positions"]
    print(f"\n[determinism] re-run same seed → final positions match: {pos_match}")

    # Verdict
    ok_distance = r1["distance_max"] > 2.0  # rng.jitter would top out around 1.5 over 60s
    ok_policy = r1["group_policies_present"] and bool(r1["workers_intent_weights"])
    ok_fsm = any(k not in ("IDLE", "NONE") for k in r1["fsm_state_counts"])
    print(f"\n[verdict]")
    print(f"  (1) workers moved beyond jitter range:        {ok_distance}")
    print(f"  (2) group_policies populated with intents:    {ok_policy}")
    print(f"  (3) at least one worker in non-IDLE FSM state: {ok_fsm}")
    print(f"  (4) determinism preserved:                     {pos_match}")
    all_ok = ok_distance and ok_policy and ok_fsm and pos_match
    print(f"\n  OVERALL: {'PASS — L1 wiring active' if all_ok else 'FAIL — wiring incomplete'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
