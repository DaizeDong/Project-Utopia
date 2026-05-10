# RC3 Pipeline Smoke Run — 2026-05-10

First end-to-end paper experiment run after the RC3 design audit
fixes (B1 SeedMatrix bug, G1 D5 runMode gate, G2 HELM MWR, G3
dimension wiring, B2-B8 nondeterminism).

## What was run

| Experiment | Cells | Scenarios | Seeds | Sim sec | Rows | Wallclock | Output |
|---|---|---|---|---|---|---|---|
| E1 | SS, FB | temperate_plains, fortified_basin | C0FFEE, BEEF | 30 | 152 | 17.5 m | `output/paper/E1.ndjson` |
| E6 | FB, WW, SS | temperate_plains, fortified_basin | C0FFEE, BEEF | 30 | 228 | 22.0 m | `output/paper/E6.ndjson` |
| E1-smoke | SS, FB | temperate_plains | C0FFEE | 10 | 38 | 1.5 m | `output/paper/E1-smoke.ndjson` |

`output/` is `.gitignore`'d — the NDJSON files live on the run host
only. Re-run any cell with:

```bash
node scripts/benchmark-paper.mjs --experiment E1 \
  --scenarios temperate_plains,fortified_basin \
  --seeds 0xC0FFEE,0xBEEF --duration-sec 30 \
  --out output/paper/E1.ndjson
```

## Pipeline integration verified

1. **End-to-end pipeline** — fallback ref → 2 oracle refs → N agent
   cells → 4-layer scoring stack → NDJSON. No errors across 418
   total rows.
2. **All 19 dimension keys emit values** including the 4 newly
   wired in G3 (`coalition_coupling`, `state_target_obedience`,
   `faction_responsiveness`, `plan_policy_alignment`).
   `rae_path_overhead` reports 1.0 placeholder (T1 deferred).
3. **DTE rows non-zero** — confirms B1 fix is live. Pre-RC3 every
   DTE row would have been 0 due to the wrong `state.ai.runtime`
   read path. Sample post-RC3 values:
   `dte_per_completion_token = -0.025…-0.035`,
   `dte_per_decision = -0.008…-0.012`.
4. **Bayesian posterior + sandwich norm + HELM MWR** all execute
   without error on the fallback path; output schema matches
   `parseDriverArgs` contract.

## Limitations of this run (paper-relevant)

This is a **fallback-only** run — no LLM proxy is reachable in the
test environment. Implications:

- **SS / WW / FB cells collapse to identical NoopAgentAdapter
  trajectories.** Every cell reports
  `bayesianMean_avg ≈ 0.527` and `SS - FB ≡ 0` across all 19 dims.
- **`sandwichNorm = 0` everywhere.** Oracle and fallback refs
  produce nearly identical traces when no LLM is in the loop, so
  the (agent - fallback) / (oracle - fallback) ratio collapses.
- **Headline E1 / E6 figures cannot be drawn from this data.**
  The pipeline checks pass, but the empirical signal is muted.

This is itself **paper-relevant data**: it's a §8 limitation
quantification ("without an LLM proxy, the benchmark surface is
identity-degenerate; the fallback path saturates all four channels
with the same heuristics").

## Next steps to populate Figures 4-10 with real signal

1. **Stand up an LLM proxy.** Either `npm run ai-proxy` with a
   real model behind it, or plug `LayerCastAdapter` against a
   local LayerCast endpoint.
2. **Re-run E1 / E6 / E3** with the same `--cells` selectors.
   Cross-vendor (E3) needs >1 distinct backend reachable.
3. **Increase `--seeds` to 4-6** for tighter Bayesian CI95.
4. **Increase `--duration-sec` to 60-90** to push past Tier-1
   startup transients (current 30s leaves R13 readiness gate
   ramp-up in-frame).
5. **Add E2, E4, E5, E7-E9 drivers** to `benchmark-paper.mjs`
   (currently only E1 / E3 / E6 have presets).

## Cross-checks

- `npm run audit:determinism` — Tier 1 `e360b76…` PASS
  (bit-identical pre/post RC3 fixes).
- `node --test test/*.test.js` — 815 pass / 0 fail / 1 skipped
  (no regressions).
- `npm run audit:rng` — OK, no `Math.random()` outside `rng.js`.
