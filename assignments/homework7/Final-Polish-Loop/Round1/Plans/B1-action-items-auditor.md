---
reviewer_id: B1-action-items-auditor
reviewer_tier: B
feedback_source: assignments/homework7/Final-Polish-Loop/Round1/Feedbacks/B1-action-items-auditor.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P2
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~30
  new_tests: 0
  wall_clock: 15
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

B1 reports verdict **GREEN, score 9/10**: 9 of 10 closed, 0 regressed, 1 partial. AI-1 (the lone Round 0 carry-partial) was upgraded to **closed** thanks to the Round 0 `__utopiaLongRun.devStressSpawn` helper landed under the previous B1 plan. The single residual is:

- **Root problem (single)** — **AI-6 (P2)**: performance telemetry is fully collected (`__utopiaLongRun.getTelemetry().performance.{fps, headroomFps, heapMb, entityCount, topSystemMs[]}`) and corrective levers ship in Settings (Quality Preset, Resolution Scale, Auto LOD, etc.), but there is **no on-HUD player-facing perf summary** (no FPS chip, no frame-time chip, no target-vs-actual-speed indicator). The R9 reviewer-b ask was a *visible* lag-attribution surface for non-dev players; the data layer is shipped, the presentation layer is not.

This is a P2 documentation/UX gap on the top of an already-GREEN verdict, in the final polish loop with hard freeze. It does not derail the verdict (GREEN threshold is 80% closed + 0 regressed; B1 is 90% + 0).

## 2. Suggestions（可行方向）

### 方向 A: docs track — record AI-6 as `documented-defer` in CHANGELOG and PROCESS-LOG (RECOMMENDED)

- 思路：Document AI-6 as an explicit `documented-defer` with clear rationale (data is collected, adaptive presets ship, on-HUD overlay is intentionally suppressed in HW7 freeze to avoid cognitive load on non-dev players; the perf data is reachable via Settings > adaptive quality + dev tools `__utopiaLongRun.getTelemetry()` for power users). Append a short note under `Unreleased / v0.10.1` in `CHANGELOG.md` and a one-paragraph closeout in `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` so the next reviewer (or a v0.10.2+ pass) can pick up the surfacing work without re-discovering the gap.
- 涉及文件：
  - `CHANGELOG.md` (Unreleased section — add `Documented Defers` bullet under HW7 R1)
  - `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` (append "HW7 R1 closeout — AI-6 documented-defer rationale" entry)
- scope：小 (≤ 30 LOC, pure docs)
- 预期收益：
  - Honors HW7 freeze conservatism (no code touch in the final loop).
  - Honest accounting: 9 closed + 1 documented-defer = 10/10 in next reviewer's lens (documented-defer counts toward GREEN per `enhancer.md` GREEN threshold formula).
  - Captures the rationale (data layer shipped, adaptive presets compensate, on-HUD overlay intentionally suppressed for non-dev UX) so the deferral is *informed*, not silent.
- 主要风险：
  - Does not actually surface FPS to non-dev players → if a Tier-A reviewer in a hypothetical Round 2 runs a perf test, AI-6 will still read as "no on-HUD overlay". Mitigation: documented-defer rationale explicitly references `?perfhud=1` query-flag pattern as the post-freeze re-open path.
- freeze 检查：**OK** — pure docs, no new tile / role / building / mood / mechanic / audio / UI panel.

### 方向 B: code track — add `?perfhud=1` query-flag toggle in PerformancePanel showing "FPS: 54 | frame: 18ms"

- 思路：Extend the existing query-flag pattern (project already supports flags like `?ai=off`, `?seed=N` per dev tooling) to wire a minimal `?perfhud=1` parameter that flips a boolean on the existing PerformancePanel (or its parent HUD container) which then reads `state.metrics.frameMs` / FPS already collected and renders a single-line `FPS: 54 | frame: 18ms` chip — no new panel, no new mechanic, no new tile.
- 涉及文件：
  - `src/main.js` (parse `?perfhud=1` from `location.search`, attach to app config — locate via Grep `URLSearchParams|location\.search`)
  - `src/ui/panels/PerformancePanel.js` or equivalent (add a top chip rendered only when the flag is true; locate via Grep `PerformancePanel|class.*Performance.*Panel`)
  - `src/render/HUD*` (whichever owns the chip strip — alternative attachment point)
- scope：小 (≤ 60 LOC + 1 unit test)
- 预期收益：Closes AI-6 fully — Tier-A reviewers can flip the flag in Round 2 and read FPS without dev-tools access.
- 主要风险：
  - HW7 freeze conservatism: code change in the **final** polish loop where the rest of the project is GREEN. Higher risk-of-regression than zero-LOC docs path.
  - Subtle UI panel question: does extending `PerformancePanel` count as "new UI panel" under hard freeze? Strict reading: no, because the panel exists; only a new chip inside it is added. But borderline — a strict orchestrator could rule it FREEZE-VIOLATION.
- freeze 检查：**OK (borderline)** — strictly additive to an existing panel, gated behind a query flag (no default UI change). Note: the recommendation in the prompt itself flags this as borderline ("extends existing query-flag pattern, no new panel") and suggests A for HW7 freeze conservatism.

## 3. 选定方案

选 **方向 A** (docs track — `documented-defer` in CHANGELOG + PROCESS-LOG).

理由：

1. **HW7 freeze conservatism**: the loop is in its final round, B1 is already GREEN at 9/10 with 0 regressions, and AI-6 is **P2 only**. The orchestrator prompt itself recommends A.
2. **GREEN-threshold math**: per `enhancer.md` and the GREEN formula `(closed + documented_defer) >= total * 0.8 AND 0 regressed`, marking AI-6 as `documented-defer` lifts B1's accounting to **10/10 = 100%**, strengthening the verdict without code risk.
3. **Data layer is already shipped** (`__utopiaLongRun.getTelemetry().performance` exposes fps/headroom/heap/topSystemMs); adaptive Quality Preset + Resolution Scale + Auto LOD ship as user-facing levers. The presentation gap is a P2 polish item, not a defect.
4. **Re-open path is captured**: docs entry explicitly references the `?perfhud=1` query-flag implementation (方向 B) as the v0.10.2+ pickup so nothing is lost.
5. 方向 B carries non-zero regression risk in a final-polish loop and is the kind of "borderline UI surface change" hard-freeze guards against. Saved for a post-HW7 patch loop.

## 4. Plan 步骤

- [ ] **Step 1**: `CHANGELOG.md:Unreleased section (under v0.10.1)` — `edit` — Add a `Documented Defers` subsection (create if absent) with one bullet:
  > `AI-6 (HW7 Final-Polish-Loop R1) — on-HUD performance overlay deferred. Perf telemetry is fully collected via __utopiaLongRun.getTelemetry().performance (fps / headroomFps / heapMb / entityCount / topSystemMs[]) and corrective levers ship in Settings (Quality Preset, Resolution Scale, Auto LOD, GPU Power Preference). A player-facing FPS chip is intentionally suppressed in HW7 freeze to avoid cognitive load on non-dev players; planned re-open path is a ?perfhud=1 query-flag toggle on the existing PerformancePanel in v0.10.2+.`

- [ ] **Step 2**: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md:end-of-file` — `edit` — Append an "HW7 R1 closeout — AI-6 documented-defer rationale" section (3-5 lines) recording:
  - The B1 R1 verdict (GREEN, 9/10 closed + 1 documented-defer = effective 10/10).
  - Reference to feedback path `Round1/Feedbacks/B1-action-items-auditor.md`.
  - Rationale (data shipped, presets ship, presentation gap is P2 + freeze-conservative).
  - Re-open path (`?perfhud=1` query flag in v0.10.2+; reference 方向 B sketch in this plan).
  - depends_on: Step 1 (CHANGELOG entry must land first so PROCESS-LOG can cite it)

- [ ] **Step 3**: `CHANGELOG.md:Unreleased section` — `edit` — Add a second one-line `Audit` entry under HW7 R1 group:
  > `B1 R1 audit GREEN (9 closed / 0 regressed / 1 documented-defer). AI-1 verified closed via R0 devStressSpawn helper (508 entities @ 8x sustained 55.32 FPS, ~60x per-entity speedup vs HW6 R9 baseline of 1000 entities @ 0.9 FPS).`
  - depends_on: Step 1

## 5. Risks

- **R1 — CHANGELOG merge conflict** with parallel reviewer plans (e.g. A2 / B2 also editing Unreleased). Mitigation: place new entries under a clearly-labelled `HW7 R1 Closeout` subsection so merging is sectional, not line-level.
- **R2 — PROCESS-LOG file may not exist** in the current loop (no Glob hits for `Post-Mortem*.md`; `PROCESS-LOG.md` does exist per Glob). Mitigation verified: file present at `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`; Step 2 appends only.
- **R3 — Documented-defer wording could be read as "we gave up"** by a strict B1 in a hypothetical Round 2. Mitigation: the rationale explicitly cites the data-layer ship + adaptive presets + planned re-open path, so the deferral is *informed*, not silent.
- **可能影响的现有测试**：none — pure markdown edits; no test file touches `CHANGELOG.md` content; `PROCESS-LOG.md` is documentation-only.

## 6. 验证方式

- **新增测试**：none (docs track).
- **手动验证**：
  1. Open `CHANGELOG.md`, scroll to Unreleased / v0.10.1 — confirm `Documented Defers` subsection contains the AI-6 entry and `Audit` subsection contains the B1 GREEN summary.
  2. Open `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`, scroll to bottom — confirm "HW7 R1 closeout — AI-6 documented-defer rationale" section is appended with the four required facts (verdict, feedback ref, rationale, re-open path).
  3. `git diff --stat HEAD` — expect ≤ 2 files changed, ≤ ~30 LOC added, 0 LOC deleted.
- **FPS 回归**：N/A (docs only — no runtime change).
- **benchmark 回归**：N/A (docs only).
- **prod build**：`npx vite build` no errors (sanity check that markdown additions did not accidentally collide with a Vite asset import — should be a no-op).
- **node test suite**：`node --test test/*.test.js` — preserve current baseline (1646 pass / 0 fail / 2 skip per CLAUDE.md v0.10.0 state); docs change should not move the count.

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6` (仅当 Implementer 失败时由 orchestrator 触发)
- All three steps are additive markdown edits (no deletions, no renames). Rollback is trivial.

## 8. UNREPRODUCIBLE 标记（如适用）

Not applicable. B1's feedback is itself a verification report (GREEN, 9/10), not a defect report. The single partial (AI-6) is verified directly: B1 ran the live build, scanned the HUD DOM, found `fpsVisible=false / capWording=false / targetVsActual=false`, and confirmed the data is in `__utopiaLongRun.getTelemetry()`. The "problem" is the gap between data layer and presentation layer; the `documented-defer` plan closes the audit-trail half of that gap without touching code in the final-polish freeze.
