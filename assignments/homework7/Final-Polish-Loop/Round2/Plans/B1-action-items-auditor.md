---
reviewer_id: B1-action-items-auditor
reviewer_tier: B
feedback_source: Round2/Feedbacks/B1-action-items-auditor.md
round: 2
date: 2026-05-01
build_commit: d242719
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

B1 R2 verdict = **GREEN** (score 9/10, 8 closed / 1 partial / 0 regressed). The single non-closed item is **AI-8** (ultra-speed / high-entity perf collapse), called out by HW6 R9 reviewer-b at 1000 entities ≈ 0.9 FPS.

Root issue: **the current HW7 build's natural population ceiling is ~20** (gated by recruit cost + food economy after v0.10.1 balance overhaul), so the 1000-entity pathological pressure point is **structurally unreachable** under normal play. B1 R2 observed 200–240 FPS with p95 ≈ 4–8 ms in the actually-reachable 12–19 entity regime. The "fix" path of multi-seed perf benchmark + 1000-entity stress is not blocked by code defects — it is blocked by the absence of a population that gets that big.

This mirrors the precedent set in **B1 R1** which already deferred AI-6 (durable per-character memory in 1k-entity stress) under the same rationale. AI-8 is therefore the **2nd documented-defer** in B1's audit history.

The required action is purely **process discipline**: explicitly mark AI-8 as `documented-defer` in CHANGELOG and PROCESS-LOG so future graders / reviewers see the justification rather than a silent "partial" hanging in the audit table.

## 2. Suggestions（可行方向）

### 方向 A: Add documented-defer entries for AI-8 in CHANGELOG + PROCESS-LOG (docs only)
- 思路：Add two short blocks. (1) `CHANGELOG.md` `[Unreleased]` HW7 R2 docs subsection: 1-2 lines stating "AI-8 (ultra-speed perf at 1000 entities) is documented-defer for HW7: natural population ceiling under v0.10.1 balance is ~20; observable 12–19 entity regime measured at 200–240 FPS in B1 R2; pathological pressure point structurally unreachable in standard play; perf overlay/cap UI deferred to post-HW7." (2) `assignments/homework7/PROCESS-LOG.md` R2 closeout: parallel entry recording B1 R2 audit verdict GREEN 8/9 closed + AI-8 defer rationale + cross-reference to B1 R1 AI-6 defer precedent.
- 涉及文件：`CHANGELOG.md`, `assignments/homework7/PROCESS-LOG.md`
- scope：小
- 预期收益：closes B1 audit cleanly (closed 8 + documented-defer 1 = 9/9 = 100%); preserves anti-LLM-polish discipline (no code generated); records the 2-defer precedent (AI-6 R1, AI-8 R2) so future rounds know perf work is parked
- 主要风险：none material; both files are docs-track and explicitly listed in CLAUDE.md "every commit must include CHANGELOG update"
- freeze 检查：OK (zero new tile/role/building/mood/mechanic/audio/UI panel; pure docs)

### 方向 B: Build a 1000-entity stress harness via spawn-cheat to reach AI-8's pressure point and bench
- 思路：Add a debug spawn-multiplier knob that lets a tester spawn 1000 wildlife entities + 200 workers, run a 5-min bench, capture FPS / p95 / heap, and then close AI-8 as "tested at scale, FPS holds at X".
- 涉及文件：`src/simulation/population/`, `src/benchmark/presets/`, `src/ui/DevTools.js` (new), `scripts/long-horizon-bench.mjs`
- scope：大
- 预期收益：truly closes AI-8 with measurable evidence
- 主要风险：(a) **FREEZE-VIOLATION** — adding a debug spawn-multiplier UI is a new UI panel/control surface during hard freeze; (b) requires non-trivial code work and could destabilize population/balance code that was just rewritten in v0.10.1; (c) misaligned with R2 docs-track scope
- freeze 检查：**FREEZE-VIOLATION** (new debug UI control + new perf cap UI implied)

### 方向 C: Skip CHANGELOG / PROCESS-LOG entirely; rely on B1 audit verdict alone
- 思路：B1 already wrote the rationale into the feedback file; no further docs work needed.
- 涉及文件：none
- scope：小
- 预期收益：minimal effort
- 主要风险：CLAUDE.md project rule says "every commit must include CHANGELOG update describing what changed and why"; future reviewers see "partial" without context; B2 grep gates won't notice but the audit trail is weaker
- freeze 检查：OK but violates CLAUDE.md changelog discipline

## 3. 选定方案

选 **方向 A** (documented-defer entries in CHANGELOG + PROCESS-LOG).

Reasoning:
- B1's own feedback notes "if caller indeed means AI-8 is documented-defer, then closed+defer=9/9=100%, still GREEN" — i.e. the reviewer **explicitly licensed** this exact disposition
- B1 R1 already deferred AI-6 (per the user's brief); AI-8 R2 is a structurally identical defer (population ceiling makes the pressure point unreachable, not a code defect being ignored)
- Zero code change, zero freeze pressure, ~30 LOC of docs (well under any threshold)
- Aligns with anti-LLM-polish discipline (TA HW7 §1.5) — recording an honest "we cannot reach the pressure point under current balance" rather than fabricating a benchmark

## 4. Plan 步骤

- [ ] Step 1: `CHANGELOG.md`:`[Unreleased]` block (after the existing "Docs (HW7 Round 0 → Round 1 — submission deliverables trajectory)" subsection, before any version-tag block) — `add` — append a new `### Docs (HW7 Round 1 → Round 2 — action-items audit closeout)` subsection containing 3 bullets: (a) "B1 action-items audit Round 2 verdict: GREEN 8 closed / 1 documented-defer / 0 regressed (= 100% effective coverage)"; (b) "AI-8 (ultra-speed perf at 1000 entities) marked documented-defer: under v0.10.1 balance, natural population ceiling is ~20 (recruit-cost + food economy gate); observable regime FPS 200–240 with p95 4–8 ms; 1000-entity pathological point is structurally unreachable in standard play; perf overlay/cap UI deferred to post-HW7"; (c) "This is the 2nd documented-defer in B1 audit history (1st: AI-6 durable character memory, R1) — pattern reflects post-v0.10.0 FSM rewrite shifting perf surface to a smaller, more bounded entity count"
- [ ] Step 2: `assignments/homework7/PROCESS-LOG.md`:end-of-file — `add` — append a Round 2 entry section `## Round 2 (2026-05-01)` (or append to existing R2 entry if Implementer finds one) with: (a) one-line summary "B1 R2 audit: 8 closed + 1 documented-defer (AI-8) + 0 regressed = GREEN"; (b) AI-8 defer rationale block (3-4 lines, mirroring CHANGELOG bullet b); (c) cross-reference line "AI-6 R1 defer precedent + AI-8 R2 defer = 2/9 documented-defer; both root-cause are post-rewrite scope reductions, not unaddressed defects"
  - depends_on: Step 1 (so the same wording is shared between CHANGELOG and PROCESS-LOG)
- [ ] Step 3: (no further steps; do NOT touch source code, do NOT add a perf overlay, do NOT add a benchmark script)

## 5. Risks

- Wording mismatch between CHANGELOG and PROCESS-LOG → mitigation: Step 2 depends_on Step 1, share copy
- Future reviewer reads only CHANGELOG and misses PROCESS-LOG cross-reference → low risk; both are first-class submission artifacts
- TA HW7 §1.5 anti-polish trip: defer wording must read as factual / first-person / engineer-voice, not LLM-pretty marketing copy → keep bullets terse, numbers-anchored ("FPS 200–240, p95 4–8 ms, ceiling ~20"), no superlatives
- 可能影响的现有测试：none — these are docs files, not picked up by `node --test test/*.test.js`

## 6. 验证方式

- 新增测试：none
- 手动验证：
  1. `git diff CHANGELOG.md` shows the new `### Docs (HW7 Round 1 → Round 2 — action-items audit closeout)` subsection
  2. `git diff assignments/homework7/PROCESS-LOG.md` shows the Round 2 audit closeout entry
  3. Grep `AI-8` against both files → both must hit
  4. Grep `documented-defer` against both files → both must hit at least once
  5. Grep `1000 entit` against both files → both must hit (anchors the pressure-point-unreachable rationale)
- FPS 回归：N/A (no code change)
- benchmark 回归：N/A (no code change)
- prod build：N/A (no code change), but optional sanity: `npx vite build` still passes (should be unaffected by markdown edits)

## 7. 回滚锚点

- 当前 HEAD (R2 build): `d242719`
- 回滚锚点 (R1 baseline before this plan): `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6` (only if Implementer's docs edits accidentally clobber unrelated CHANGELOG/PROCESS-LOG content)

## 8. UNREPRODUCIBLE 标记

N/A — B1 R2 reproduced AI-1 through AI-9 against the live build at `127.0.0.1:5173/` with screenshot evidence (`screenshots/B1/01-initial-hud.png` through `04-ai-log.png`); only AI-8's pathological 1000-entity scenario was unreachable, which is itself the rationale for the defer disposition.
