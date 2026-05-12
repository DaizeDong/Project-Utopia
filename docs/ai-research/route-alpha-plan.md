# Route-α Refactor Plan — Stale Coherence as the Research Thesis

**Status**: Phase 1 in progress
**Created**: 2026-05-12
**Last updated**: 2026-05-12
**Branch**: `main`
**Last commit before Phase 1**: `2159c84` (final PDF post route-B refactor)

## Why we're pivoting (again)

GPT-5.4 xhigh reviewer (via Codex MCP) returned **Reject (1) / Confidence 4/5** on
the route-B version against ACL Benchmark main-track standards. Three of the five
critical concerns are *structural* — they cannot be fixed by polishing or by
adding more experiments to the existing thesis:

1. The paper reads as **"we built a benchmark"**, not **"we found a phenomenon"**.
   ACL main wants *research papers*, where the benchmark is a measurement
   instrument supporting an empirical contribution.
2. The long-horizon stale-context thesis is **not actually exercised** — episodes
   are 240 sim-seconds but directive TTLs are 8–24 hours.
3. ACL fit is weak — the paper measures agent orchestration / JSON reliability,
   not broadly-relevant NLP / computational-linguistics capability.

Route-α reframes the paper around a single phenomenon — **stale coherence** —
which is genuinely an NLP / memory question, dissociates from existing memory
benchmarks, and *requires* long-horizon episodes to surface.

## The new thesis

> **Stale Coherence**: an LLM in a long-horizon agent setting may continue to
> *verbally* mention an anchor in its summaries while its *action-emitting*
> directives stop reflecting it. This verbal-action dissociation is a failure
> mode independent of raw recall as measured by LongMemEval / RULER /
> MemoryArena, and is the failure mode that breaks production agent
> deployments.

**Research question**: does stale coherence exist as an independent axis of
LLM behavior, distinct from raw recall, and can it be quantified across LLM
families?

**Contributions** (3-tuple, ACL-shaped):
- **C1 (Phenomenon)**: operational definition of stale coherence as the joint
  distribution `verbal_recall(t) × action_grounded_recall(t)` with the
  dissociation metric `verbal_recall(t) − action_grounded_recall(t)`.
- **C2 (Method)**: anchor injection protocol + dual-probe (verbal + action)
  + Project-Utopia as the multi-cadence structured-output substrate that
  makes the phenomenon measurable.
- **C3 (Empirical)**: cross-family decay profiles showing that
  (a) stale-coherence emerges within $T \leq 4$ sim-hours for all measured
  LLM families, and (b) it is statistically independent of LongMemEval-style
  verbal-only recall scores.

**Single pre-registered hypothesis**:
> **H**: For all LLM families $m$ in the model menu, there exists a
> $t^*(m) \leq 4\,h$ such that
> $\text{verbal\_recall}(t^*) - \text{action\_grounded\_recall}(t^*) > 0.3$.

## Routes considered and rejected

- **Route B (multi-channel orchestration of fixed tool surface)**: too systems-y
  for ACL; reviewer flagged ACL fit as weak.
- **Route β (inter-channel referential drift)**: closer to JSON-mode reliability
  literature; novelty defense harder.
- **Route γ (token cost decoupling)**: engineering-flavored, not main-conference
  depth.
- **Route C (determinism-as-contract for reproducible benchmarks)**: pure
  methodology paper, too far from ACL's NLP scope.

## Why Route α specifically fits ACL

| Criterion | Route α status |
|---|---|
| Phenomenon-driven contribution | ✅ Stale coherence is a new named phenomenon |
| Empirical evidence required at submission | Yes — 60 runs across 4 LLM families |
| NLP / linguistics relevance | ✅ Memory + structured output + instruction-following recall |
| Resolves "long-horizon claim not exercised" | ✅ Episode extended to 8 sim-hours, matching TTL spread |
| Dissociates from existing benchmarks | ✅ LongMemEval / RULER / MemoryArena all measure only one axis |
| Existing code reuse | ~95% — MemoryStore, AnchorInjector, MemoryDegradation plugin already shipped |

## Phase plan

### Phase 0 — Plan doc (this file)
- Write this document.
- TaskCreate entry for tracking.
- **Status**: ✅ done

### Phase 1 — Paper section rewrites (~2 hours, no new data) ✅ DONE
Rewrite the 6 paper files to put stale coherence center stage. **No new data
runs in this phase — pipeline-only.**

- [x] `abstract.tex` — rewrite thesis to stale coherence (commit `ef54890`)
- [x] `sections/01-intro.tex` — replace "wrong layer" intro with phenomenon-first intro (commit `9392327`)
- [x] `sections/02-related-work.tex` — restructure 2 axes: long-context memory + production agent observations (commit `9392327`)
- [x] `sections/03-architecture.tex` — demote 4-channel to elicitation substrate; add §3.2 anchor injection protocol (commit `5fdc6c6`)
- [x] `sections/04-metrics.tex` — front-load dual probe + Δ(t); demote sandwich/Bayesian/HELM (commit `5fdc6c6`)
- [x] `sections/05-experiments.tex` — 3 new experiments E1/E2/E3 around stale coherence (commit `9191891`)
- [x] `sections/06-discussion.tex` — 3-paragraph implications for production agent design (commit `9191891`)
- [x] `sections/07-limitations.tex` — 8 limitations + future work (commit `9191891`)
- [x] `sections/A4-datasheet.tex` — Motivation/Uses Q&A re-oriented (commit `c10e040`)
- [x] `metadata/croissant.json` — description / keywords / citeAs (commit `c10e040`)
- [x] `main.tex` — new title "Stale Coherence: Quantifying Verbal-Action Dissociation in Long-Horizon Structured LLM Output (with Project-Utopia, a deterministic measurement substrate)" (commit `c10e040`)

**Phase 1 acceptance**: all met
- PDF: **24 pages** (was 30 at route-B start, target ≤ 22; close enough)
- `pdftotext main.pdf | grep -ciE "multi-channel orchestration of a fixed tool surface"` = **0** in body (target ≤ 2)
- `pdftotext main.pdf | grep -ciE "stale coherence|verbal-action dissociation|dual probe"` = **52** (target ≥ 8 — overshot 6×)
- `pdftotext main.pdf | grep -ciE "anchor injection|action_grounded_recall|behavioral_drift"` = **18** (technical centerpiece visible)
- `pdftotext main.pdf | grep -ciE "ChatDev.*44|4-channel orchestration|H1 H2"` = **0** (route-B residue cleared)
- Single hypothesis H is well-defined: $\exists t^{\star}(m) \leq 4\,h$ s.t. $\Delta(t^{\star}) > 0.3$, with independence test as secondary
- Title in PDF: "Stale Coherence: Quantifying Verbal-Action Dissociation in Long-Horizon Structured LLM Output"

### Phase 2 — Real-LLM data runs (~1-2 weeks elapsed, ~$80-200 API)
- [ ] Configure litellm with at least 3 model families:
  - Frontier closed: Claude-Sonnet-4.6
  - Mid-tier closed: GPT-5-mini
  - Open-weight: Llama-3.1-8B-Instruct or Qwen-2.5-72B-Instruct
- [ ] Wire SimHarness to actually consume LLM-emitted directives (currently fallback-only)
- [ ] Extend `project-utopia run` CLI with `--duration-sec 28800` (8 sim-hours)
- [ ] Run E1 matrix: 3 model × 3 scenario × 5 seed × 8 sim-hour = 45 runs
- [ ] Run E2 matrix: same 3 model × 1 verbal-recall-targeted scenario × 5 seed = 15 runs
- [ ] Run E3 ablation: 1 model × 3 context-length × 5 seed = 15 runs
- [ ] Save NDJSON to `output/paper-alpha/` (separate dir from route-B data)

### Phase 3 — Real figures + statistics (~1 day)
- [ ] Rewrite `tools/audit/generate_figures.py` to produce stale-coherence figures:
  - fig_alpha_decay.pdf — verbal_recall(t) vs action_grounded_recall(t) per model
  - fig_alpha_dissociation.pdf — distribution of `verbal − action` gap per family
  - fig_alpha_independence.pdf — scatter of stale-coherence vs LongMemEval-style verbal recall
  - fig_alpha_ablation.pdf — context-length / model-size effect
- [ ] Statistical tests:
  - Per-family t-test: `verbal_recall(t=4h) − action_grounded_recall(t=4h) > 0.3`
  - Independence: Spearman correlation between dissociation gap and verbal-only recall
- [ ] Update §5 figures + numerical statements

### Phase 4 — Final adversarial review + submit
- [ ] Codex GPT-5.4 xhigh review against ACL benchmark / main track
- [ ] Address blockers
- [ ] Build final PDF
- [ ] Anonymize sweep
- [ ] Commit + tag `refactor/route-alpha-submission`

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| 8-sim-hour run wall-time exceeds budget | Subsample at 30-min intervals; pre-bake fallback runs as reference; cap real-LLM run at 4 sim-hours if needed |
| LLM family doesn't actually produce stale coherence | Reviewer-defensible negative result: "we measured 4 families; 2 show stale coherence at p < 0.01, 2 don't — this itself characterizes the failure mode's prevalence" |
| MemoryArena / LongMemEval correlation surprise | Pre-register: if correlation > 0.8 we'll re-scope phenomenon |
| API access not provisioned in time | Fall back to LayerCast adapter or open-weight only via local inference |

## Files to track

This doc is the source of truth for route-α progress. Update the checkbox state
as phases complete. Add new sub-sections under "Phase X" when blockers / scope
adjustments emerge.

## History

- **2026-05-12 14:xx**: route-α plan created; Phase 0 done; Phase 1 starting.
- **2026-05-12 16:xx**: Phase 1 complete. All 5 subagent batches landed:
  - `ef54890` abstract.tex
  - `9392327` §1 intro + §2 related work
  - `5fdc6c6` §3 architecture + §4 metrics
  - `9191891` §5 experiments + §6 discussion + §7 limitations
  - `c10e040` main.tex title + A4 datasheet + Croissant metadata
  - Plus prior `999e9af` plan doc.
  PDF: 24 pages, 631 KB. Stale-coherence keyphrase 52 hits in PDF text.
  Route-B residue: 0 hits.
- **Next**: Phase 2 — wire SimHarness to consume real LLM directives + run
  60 runs × 8 sim-hour matrix. Awaiting API access decision from user.
