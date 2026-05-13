# Route-α Phase 2 Pre-Flight Readiness

**Status**: ready to launch pilot. Full E1 scale-up needs explicit user go-ahead.
**Created**: 2026-05-12 (post Phase 1)
**Provider**: `https://api.tokenreply.com/v1` (OpenAI-compatible proxy)

## 1. API access verified

`.env` has working credentials. Proxy supports 80+ models. Tested 4:

| Model | Latency (single-token reply) | Use |
|---|---|---|
| `deepseek-v4-flash` | 4.0 s | **Pilot / bulk** |
| `gpt-5-mini` | 8.0 s | Mid-tier cross-check |
| `qwen/qwen3.5-397b-a17b` | 19.7 s | Open-weight comparison |
| `claude-sonnet-4-6` | 25.5 s | Frontier upper bound |

All 4 return valid responses. Default model in `.env` is `deepseek-v4-flash`.

## 2. Simulation isolation from LLM latency — VERIFIED

| Check | Status |
|---|---|
| `SimHarness.tick()` awaits LLM via `_run_adapter` (asyncio loop block) | ✅ |
| `path_budget.max_ms = +inf` in `deterministic=True` mode | ✅ |
| No wall-clock leakage into hashed state (RC3 audit) | ✅ |
| `dt = 1/30 s` fixed per tick regardless of real time | ✅ |
| `time.time()` only feeds `wallclock_ms` telemetry (not hashed) | ✅ |
| Tier 1 hash `be19781c...` reproducible (verified post-Phase-1) | ✅ |

**Conclusion**: LLM may block 30 seconds of real time; sim still advances 1 tick of sim time. Determinism contract holds.

## 3. Cost / time scaling estimates (uncached, untuned)

Per 8-sim-hour episode:

| Channel | Cadence | calls/episode |
|---|---|---|
| environment-director | 5-15 s | 2,880 |
| npc-policy | 5-15 s + threat-gate | 1,920 |
| strategic-plan | 90 s + crisis | 320 |
| colony-agent | event-gated | ~400 |
| **Total per episode** | | **~5,520** |

Real-time per episode by model (no parallelism):
- `deepseek-v4-flash` (4 s): ~6 hr
- `gpt-5-mini` (8 s): ~12 hr
- `claude-sonnet-4-6` (25 s): ~38 hr

**Not feasible at this scale**. Must throttle + cache + parallelize.

## 4. Cost-saving levers

| Lever | Reduction |
|---|---|
| RecordReplayCache (already implemented) | 30-50% steady-state cache hits |
| Cadence throttling (5s → 30s for env/npc channels) | ~6x fewer calls |
| Episode 8h → 4h | 2x fewer calls (H asks ≤ 4h anyway) |
| Seed 5→3 for frontier model | 40% fewer frontier runs |
| asyncio parallel multi-seed | 3-5x wall-clock |

**Post-mitigation budget**: ~$60-180 for full E1.

## 5. Required Phase 2 pre-launch patches

Before any real-LLM run:

1. **Retry layer** in `LLMClient.request_completion`:
   - 3 retries with exponential backoff (1s, 2s, 4s)
   - On final failure → graceful fallback DecisionResponse
   - Track retry count in telemetry

2. **Per-call timeout** (currently unbounded): 60 s

3. **`--cadence-multiplier` CLI flag**: multiplies all channel cadences (default 1.0; pilot use 6.0)

4. **`--llm-adapter llm-client` CLI flag**: switch from `NoopAgentAdapter` (current default) to real `LLMClient` using `.env` credentials

5. **RecordReplayCache wired by default** for `llm-client` adapter (mode: `replay-or-record`)

6. **Per-call NDJSON debug log**: emit `{tick, channel, model, prompt_hash, latency_ms, prompt_tokens, completion_tokens}` per call to `output/llm-debug/`

## 6. Pilot plan (Step 1, before scale-up)

1 model × 1 sim-hour × 2 seed × 1 scenario = **2 runs, ~$1, ~30 min real-time**:
- model: `deepseek-v4-flash`
- scenario: `temperate_plains`
- seeds: `0xC0FFEE, 0xBEEF`
- duration: 1 sim-hour
- cadence: throttle 6× (env-director every 30 s)

**Pilot success criteria**:
- (a) Both runs complete without crash
- (b) NDJSON outputs contain non-zero `anchored_fact_recall`, `action_grounded_recall`, `behavioral_drift`
- (c) Dual probe `Δ(t)` shows variation
- (d) RecordReplayCache hit rate > 0%
- (e) Per-call cost matches expectation

**If pilot succeeds** → scale up to full E1: 3 models × 3 scenarios × 3 seeds × 4 sim-hour = 27 runs.
**If pilot fails** → diagnose & re-pilot.

## 7. Framework vs conference-benchmark norms

Compared against three relevant memory benchmark papers:

| Axis | MemoryArena (2602.16313) | MemoryAgentBench (2507.05257) | LongMemEval (Wu2025) | **Project-Utopia (α)** |
|---|---|---|---|---|
| Time granularity | session-discrete | session-discrete | session-discrete | **tick-continuous** |
| Horizon | minutes-hours per task | minutes-hours per task | hours of chat | **configurable up to 8 sim-hours** |
| Memory axes | action-grounded (1) | 4 axes incl. forgetting | verbal (1) | **verbal × action joint** |
| Reproducibility | weak | weak | weak | **3-tier hashes** |
| Structured output | yes | yes | no | **4-channel schema-validated** |
| Anchor protocol | yes | yes | no | **paired verbal + implicit-goal** |

Project-Utopia's tick-continuous + dual-probe + reproducibility hashes are the three novelty axes. Domain (colony simulation) is acceptable per Diplomacy / Minecraft precedent.

## 8. Topic focus check

```
1 phenomenon:    stale coherence
1 hypothesis H:  ∃ t*(m) ≤ 4h s.t. Δ(t*) > 0.3
1 independence:  Spearman ρ(Δ, anchored_fact_recall) ∈ [-0.5, 0.5]
3 experiments:   E1 decay / E2 independence / E3 ablation
2 main metrics:  verbal_recall + action_grounded_recall
1 supporting:    behavioral_drift (disentangles "moved on" from "stopped acting")
```

PDF density check: stale-coherence keyphrase 52 hits in 24 pages = 2.2 hits/page.

## 9. Model differentiation strategy

Each cell uses **ONE model across all 4 channels** (NOT mixed). Otherwise per-model stale-coherence signal is polluted.

| Tier | Model | Expected Δ profile | Per-call cost (est) |
|---|---|---|---|
| Frontier | `claude-sonnet-4-6` | Lowest Δ (best coherence) | ~$0.02 |
| Mid-tier | `gpt-5-mini` | Moderate Δ | ~$0.005 |
| Open-weight | `deepseek-v4-flash` | Highest Δ (worst coherence) | ~$0.0001 |

This is the genuine test of H. If all 3 produce similar Δ, the phenomenon is universal; if they differ, we get cross-family decay profiles.

## 10. Update log

- 2026-05-12 21:xx: Phase 1 complete. Phase 2 readiness doc created.
- Next: implement 6 patches → run pilot → if pass, scale to E1.
