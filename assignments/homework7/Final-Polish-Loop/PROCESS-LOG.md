# Final-Polish-Loop — Round 历史日志

> 每一轮迭代结束后，orchestrator / 人类在此追加一条记录。
>
> 用于跨轮回顾：哪些问题在持续？哪些 plan 推进受阻？停止条件离触达还有多远？

---

## 模板

```markdown
## Round N — yyyy-mm-dd

**HEAD**: `<short-sha>` → `<short-sha>`
**触发**: 自动 / 人工 gate
**Verdict**: GREEN / YELLOW / RED

### Reviewer 输出概览
- A1 stability: <P0 数> P0 / <P1 数> P1
- A2 performance: P50=<value> / P5=<value>（target P50=<>, P5=<>）
- A3 first-impression: <一句话>
- A4 polish-aesthetic: <一句话>
- A5 balance-critic: <一句话>
- A6 ui-design: <一句话>
- A7 rationality-audit: <一句话>
- B1 action-items: <closed>/<total>
- B2 submission-deliverables: <green>/<total>
- C1 code-architect: <A 级>/<B>/<C>/<D> 系统数；架构债 Δ vs Round N-1 = <±数字>

### 本轮通过的 plan
| reviewer_id | track | scope | commit |
|-------------|-------|-------|--------|

### Defer / Reject
| reviewer_id | 原因 |
|-------------|------|

### Validator gate
- node --test: <pass>/<total>
- prod build: OK / FAIL
- FPS gate: PASS / FAIL
- freeze-diff: PASS / FAIL
- bundle size: PASS / WARN / FAIL

### 停止条件离触达
（列每条停止条件的当前状态）

### 下一轮重点
（一句话）
```

---

<!-- 在此往下追加 Round 0, 1, 2 ... -->

## Round 0 — 2026-05-01

**HEAD**: `3f87bf4` → `1f6ecc6`（Stage C 10 commits + Stage D 1 fix-up commit）
**触发**: 自动 / "Round 0 go"
**Verdict**: YELLOW

### Reviewer 输出概览

- A1 stability: 0 P0 / 0 P1 / 2 P2（GREEN 8/10；零崩溃零 unhandled rejection；P2=saveSnapshot/loadSnapshot API 不一致 + ResizeObserver 良性 warning）
- A2 performance: P50/P5 unmeasurable in headless（RAF 1Hz cap）；真实瓶颈 sim tick capped at ×0.3 of target ×8 + drawcall 随 infra 线性增长（51→137→203）→ YELLOW 4/10
- A3 first-impression: YELLOW 4/10；3 P0 onboarding（信息过载 / 目标 checklist 埋三层下 / 键盘 `2` 切肥力 lens 而非 Farm）
- A4 polish-aesthetic: RED 3/10；无音频 / 无日夜循环+静态光照 / tile checkerboard seams + 无 walk animation；4 视觉 bug
- A5 balance-critic: RED 3/10；硬编码 3:11 饿死崩盘所有地图；Score 在 food=0 冻结；地图模板纯换皮；processing chain 死内容；Weather/Bandit/Trader 30 分钟从未触发
- A6 ui-design: YELLOW 5/10；19 UI bugs（2 P0 / 9 P1 / 8 P2）；Demolish 红色误用 + 响应式断点缺失 + z-index 冲突
- A7 rationality-audit: RED 4/10；4 P0（顶栏显示上一局 / 食物速率 14× 不一致 / `L` 键 toast 文案错 / 70+ LLM debug panels 暴露玩家）
- B1 action-items: GREEN 9/10 closed + 1 partial（AI-1 perf 验证工具 gap）；0 regressed
- B2 submission-deliverables: RED 3/10（7/22 PASS）；P0 缺失：Post-Mortem.md / README pillars / demo video / submission format
- C1 code-architect: YELLOW；25 系统：4A / 11B / 8C / 2D（ColonyPlanner 1867 LOC + ColonyPerceiver 1966 LOC）；Round 0 baseline，无 delta；top-3 债：Visitor/Animal AI 仍跑 v0.9.x StatePlanner / WorkerAISystem 250 LOC mood/social 补丁不在 FSM 内 / docs/systems/03 完全过期

### 本轮通过的 plan（10/10 都 accepted，0 SKIPPED）

| reviewer_id | track | scope | commit |
|---|---|---|---|
| A5-balance-critic | code | 3 BALANCE keys：food 200→320 / consumption 0.05→0.038 / grace 0.5→1.5 + 1 invariant test | 98e18c2 |
| B2-submission-deliverables | docs | Post-Mortem.md (190 LOC) + Demo-Video-Plan.md (62 LOC) + README +55 LOC | d747aae |
| C1-code-architect | docs+1test | docs/systems/03-worker-ai.md +309/-301 + worker-fsm-doc-contract.test.js | 78b346e |
| A1-stability-hunter | code | snapshot 契约 + ResizeObserver filter + 5 new tests | 7b4526b |
| B1-action-items-auditor | code | __utopiaLongRun.devStressSpawn + 5 tests | 1f1eea5 |
| A3-first-impression | code | CSS hide-rule 删除 + helpModal localStorage gate + toast rewrite + 5 tests | f0ca44d |
| A7-rationality-audit | code | HUDController.resetTransientCaches + 食物速率 derive + Inspector dev gate + 5 tests | 501f52b |
| A6-ui-design | code (CSS) | Demolish 中性化 + :disabled + @media 1366px 单列 fallback | ff75e2e |
| A4-polish-aesthetic | both | lumber camp 文案 + 1366 hint anchor + route marker collapse + day-night lighting tint via existing lights + CHANGELOG + 8 tests | 0ff7287 |
| A2-performance-auditor | code | __fps_observed + ?perftrace=1 systemTimingsMs + PerformancePanel hot-systems + 1 regression test | 6dd1088 |
| (validator fix) | code | B1's `__devForceSpawnWorkers` missing `randomPassableTile` import | 1f6ecc6 |

### Defer / Reject

| reviewer_id | 原因 |
|---|---|
| (none) | 0 plan deferred / 0 rejected — 10/10 通过 freeze + track 自检 |

### Validator gate

- node --test: **1665/1673 pass**（4 pre-existing failures unchanged，4 pre-existing skips）— PASS
- prod build: `npx vite build` 2.34s 0 errors → PASS
- preview smoke: 0 console errors / 0 unhandled rejections / 0 5xx 在 :4173 → PASS
- FPS gate: YELLOW（headless RAF 1Hz 节流是 measurement methodology 限制，非 project bug；perftrace 显示所有 system <8ms 远低于 16ms budget）
- freeze-diff: PASS（0 violations: 13 modified files, 0 new TILE/role/audio asset/UI panel/sim 子目录）
- bundle size: WARN（3 chunks 500KB-1MB；total ~1.95MB raw / ~0.55MB gzip；无 chunk >1MB）

### Bench (regression-only)

- DevIndex day-90 = **46.66**（vs HW6 baseline 37.77, **Δ +23.5%**）→ PASS
- Deaths day-90 = **43**（vs HW6 baseline 157, **Δ -72.6%**）→ PASS
- A5 的 BALANCE 调整产生了显著正向效益，远高于 monotonicity floor（HW8 也回看到 baseline × 0.9 = 33.99 警戒线之上）

### 停止条件离触达

| 条件 | 状态 | 距触达 |
|---|---|---|
| A1 stability 连续 2 轮 0 P0 | ✅ Round 0 = 0 P0 | 还需 1 轮（Round 1 也要 0 P0） |
| A2 performance 连续 2 轮 P50/P5 达标 | ⚠️ Round 0 = unmeasurable（headless caveat） | 需要在 Round 1+ 用真实 Chrome 测；A2 已加 `__fps_observed` infra 让下轮 validator 有数据 |
| A3-A7 共识问题单调下降 / 两轮无新增 | ❌ Round 0 baseline | Round 1 才能算 trend |
| B1 全 closed/documented-defer | ⚠️ 9/10 closed + 1 partial（AI-1 perf）| B1 已在 plan 中扩展 devStressSpawn 让 Round 1 reviewer 能复现 75-worker stress |
| B2 全 green | ❌ 7/22 → 应在 Round 1 重测；本轮已建 Post-Mortem 骨架 + Demo-Video-Plan 占位 + README pillars/anchors | Round 1 B2 重审估计 ~18-22/22 |
| C1 架构债非递增 + 0 D 级 | ❌ Round 0 baseline 2 D级（ColonyPlanner / ColonyPerceiver）| C1 wave roadmap 4 wave；Round 0 完成 wave-1（docs sync）；wave-2（PriorityFSM 抽取）需 Round 1+ |
| Validator 连续 2 轮 GREEN | ⚠️ Round 0 = YELLOW | 需要 Round 1 = GREEN + Round 2 = GREEN |
| 人类试玩确认无 reviewer 过拟合 | n/a | 需用户介入 |

**结论：7 条停止条件中 0 条达成，需进入 Round 1。**

### 下一轮重点

1. **A5 的 3:11 → ~6:30 食物 runway 是否真的解决崩盘**（A5 数学算 702s 纯燃烧到 0；实际游玩可能因 worker 行为不同有偏差）
2. **B2 重审**（Post-Mortem 骨架已建，author 是否充实内容；demo video 计划是否落地）
3. **A2 用真实 Chrome 测 FPS**（headless 不可行，validator 应外部 Chrome 测试或 Round 1 reviewer 用 non-headless 模式）
4. **C1 wave-2** 是否启动 PriorityFSM 抽取（取决于人类对 4-wave roadmap 的接受度；建议先看 invariant test 是否 stable）
5. **Round 0 引入的 25 个新测试 vs 4 pre-existing failures**：那 4 个 pre-existing failures 是否真该在 polish loop 中接受？或者是 Round 1 应优先解决的"underfeed"

---

## HW7 R1 closeout — AI-6 documented-defer rationale

- **B1 R1 verdict**: GREEN, 9/10 closed + 0 regressed + 1 documented-defer
  (effective 10/10 under the `enhancer.md` GREEN-threshold formula
  `(closed + documented_defer) >= total * 0.8 AND 0 regressed`).
- **Feedback source**: `assignments/homework7/Final-Polish-Loop/Round1/Feedbacks/B1-action-items-auditor.md`
  (Tier-B audit; build commit `1f6ecc6`).
- **Rationale (data shipped, presets ship, presentation gap is P2 +
  freeze-conservative)**: performance telemetry is fully collected
  (`__utopiaLongRun.getTelemetry().performance.{fps, headroomFps, heapMb,
  entityCount, topSystemMs[]}`) and corrective levers ship in Settings
  (Quality Preset, Resolution Scale, Auto LOD, GPU Power Preference). The
  remaining gap is purely *presentation* — there is no on-HUD player-
  facing FPS chip / frame-time chip / target-vs-actual-speed indicator.
  In the final round of HW7 with hard freeze active, surfacing a new HUD
  chip is a borderline UI surface change that the freeze guards against;
  the deferral is informed (data layer + adaptive presets compensate),
  not silent.
- **Re-open path**: `?perfhud=1` query-flag toggle on the existing
  PerformancePanel in v0.10.2+ (方向 B sketch in
  `Round1/Plans/B1-action-items-auditor.md` § 2). Wires
  `URLSearchParams` parsing in `src/main.js` to flip a boolean on the
  existing PerformancePanel that reads `state.metrics.frameMs` / FPS
  already collected and renders a single-line `FPS: 54 | frame: 18ms`
  chip — no new panel, no new mechanic, no new tile. Deferred from R1
  to honor HW7 freeze conservatism on a P2 polish item over an already
  GREEN verdict.
- **Implementer**: B1-action-items-auditor wave-0 plan 2/5 (docs track,
  pure markdown additions to `CHANGELOG.md` + this file).

## 2026-05-01 — Round 1 closeout (B2-submission-deliverables enhancer plan)

R0 baseline RED 7/22 → R1 enhancer YELLOW 17/22 (+10 PASS). Of the remaining
5 sub-items, **4 are author-fill (PENDING)** that the LLM is forbidden from
writing per TA HW7 §1.5 anti-LLM-polish, and **1 is a process gap (FAIL)**
that R1 closes here by adding `assignments/homework7/build-submission.sh`
+ `npm run submission:zip` (decision-collapser: zip vs hosted URL → one
command, one artifact). Trajectory ref: build commit `1f6ecc6`.

### AUTHOR ACTION REQUIRED — 4 items (must complete before final submit)

1. **Pillar names + summaries** — `README.md` "Highlights — Two Pillars"
   lines ~5-23 + `assignments/homework7/Post-Mortem.md` §1.
   - Prompt: open `assignments/homework2/a2.md`, copy the EXACT pillar titles
     verbatim (do not LLM-rename or paraphrase). For each pillar write a 2-3
     sentence technical summary in your own words, citing ≥1 `src/` path.
   - Grep gate: `grep -c "<copy exact pillar name from A2>" README.md
     assignments/homework7/Post-Mortem.md` → must return **0**.

2. **Post-Mortem §1-§5 substantive content** — author prose, all sections.
   - §1 (Project Overview): 4-8 sentences first-person, cite ≥1 `src/` path
     + 2-3 commit SHAs.
   - §2 (HW6 Findings): pull real findings from this PROCESS-LOG + HW6
     user-study; each entry has Action / Evidence / Status (DONE / PARTIAL
     / WON'T FIX / DEFERRED).
   - §3 (Pillar Deep-Dive): narrative + 1 evidence line per sub-section.
     §3.1 worker AI three-time rewrite story is right there in CLAUDE.md
     (the −2530 LOC v0.10.0 FSM rewrite vs the v0.9.0 utility-scoring layer
     it deleted — natural material).
   - §4 (HW7 Plan vs Actual): answer all 3 questions as "I planned X /
     shipped Y / cut Z".
   - §5 (AI Tool Evaluation): **MOST DANGEROUS** — TA HW7 §1.5 explicitly
     bans LLM-polish here. Hand-write this section yourself; include at
     least one concrete LLM failure story (the v0.9.0 → v0.10.0 −2530 LOC
     deletion is honest material; so is any spec-drift / phantom-feature
     incident from PROCESS-LOG).
   - Grep gate: `grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md`
     → must return **0**.

3. **Demo video URL backfill** — record + upload + sync 3 places.
   - Record 3-minute video per `assignments/homework7/Demo-Video-Plan.md`
     §1-§4 (the 7-shot table is already written).
   - Upload to YouTube or Vimeo. **Do not** use unlisted-private — the TA
     must be able to view it. Public unlisted is acceptable.
   - Sync the real URL to:
     - `README.md` (~line 92, `## Demo Video & Post-Mortem` section)
     - `assignments/homework7/Post-Mortem.md` ("Demo Video" header at top)
     - `CHANGELOG.md` `[Unreleased]` block
   - Grep gate: `grep -c "pending — see Demo-Video-Plan" README.md` →
     must return **0**.

4. **Decide submission format** — zip OR GitHub URL (pick one, not both).
   - **Option A (zip)**: run `npm run submission:zip` → produces
     `dist-submission/project-utopia-hw7-<stamp>.zip` → upload to Canvas.
   - **Option B (hosted)**: push `main` to GitHub origin → submit the repo
     URL with the commit sha as anchor (`...?at=<sha>` or include the sha
     in the Canvas comment).
   - Submit **exactly one** of the two — do not submit both, since the
     grader will not know which copy is authoritative.
   - Grep gate (option B): `git rev-parse origin/main` returns the sha
     that matches `git rev-parse HEAD`.

### VALIDATOR SIGN-OFF GATE — run before final submit, all must pass

```bash
# All four lines must be clean (rows 1-3 = empty output; row 4 = at least one branch true)
grep -rn "<copy exact pillar name from A2>" README.md assignments/homework7/
grep -rn "AUTHOR:" assignments/homework7/Post-Mortem.md
grep -n "pending — see Demo-Video-Plan" README.md
test -f dist-submission/project-utopia-hw7-*.zip || git rev-parse origin/main
```

Any non-empty match in rows 1-3, or both branches of row 4 failing → **NOT
READY**. Do not submit. The build script `assignments/homework7/build-submission.sh`
prints this same reminder block at end-of-run so the author cannot miss it.

- **Design intent**: R0 deliberately left author-fill skeletons (TA HW7 §1.5
  anti-LLM-polish posture); R1 does **not** auto-fill them. R1's role is
  to focus the process / decision boundaries — close the FAIL on
  submission-format ambiguity, lock the 4 PENDING items into a checklist
  with grep-verifiable gates, and ensure the author cannot accidentally
  submit with placeholders still in tree.
- **Implementer**: B2-submission-deliverables wave-0 plan 5/5 (docs track,
  bash + json + markdown only; no `src/` or `test/`).

---

## Round 1 — 2026-05-01 (orchestrator closeout)

**HEAD**: `1f6ecc6` → `d242719`（Stage C 9 commits + 1 no-op = 10 plans accepted）
**触发**: 自动 / "继续 Round 1+2"
**Verdict**: YELLOW

### Reviewer 输出概览

- A1 stability: GREEN 8/10；0 P0 / 0 P1 / 0 P2，5 sessions ~30 min；**连续第 2 轮 0 P0 → 触发停止条件 1 ✅**
- A2 performance: YELLOW 4/10；R0 加的 `__fps_observed` 让 FPS 可测；P3 mid p50=54.6 / p5=43.5，P4 stress p50=55.2 / p5=43.1；P5 ≥ 30 全 PASS；P50 ~95% target
- A3 first-impression: RED 3/10；R0 修的 3 P0 已解，新 3 P0（viewport 框窄 / 放置无反馈 / 首次 LMB 选 bear）→ R1 plan 已修
- A4 polish-aesthetic: RED 3/10；三大结构性缺口未变；R0 lighting tint 实施 vs 感知差距 → R1 振幅放大 colorBlend 0.35→0.62
- A5 balance-critic: RED 3/10；R0 食物修复反向 → "do nothing wins"；**R1 找到 root cause = v0.10.1-l food drain 没接到 entity.hunger**
- A6 ui-design: YELLOW 5.5/10（R0 5→5.5）；新 P0 层 → R1 plan 已修
- A7 rationality-audit: RED 4/10；R0 4 P0 部分修，新 5 P0；R1 plan 修 4/5
- B1 action-items: GREEN 9/10 closed + AI-6 documented-defer → **effective 10/10 → 触发停止条件 4 ✅**
- B2 submission-deliverables: YELLOW 7/10（R0 3 → R1 7）；17/22 PASS；4 PENDING 是作者填空 + 1 FAIL = submission format
- C1 code-architect: YELLOW 6/10；25 系统 4A/11B/8C/2D 不变；debt 27→28（+1 R0 dev placement 错；解 -4 docs drift）；R1 wave-2 完成 PriorityFSM 抽取

### 本轮通过的 plan

| reviewer_id | track | scope | commit |
|---|---|---|---|
| A1-stability-hunter | docs (no-op) | GREEN streak documented | (no commit) |
| B1-action-items-auditor | docs | AI-6 documented-defer + PROCESS-LOG | 1d5ff80 |
| A5-balance-critic | code | **关键根因修复** entity.hunger 重连 + 4 BALANCE keys + score derive | f385318 |
| C1-code-architect | code (refactor) | wave-2/4 PriorityFSM 抽取 + WorkerFSM facade + debt-pop-2 修 | 439b120 |
| B2-submission-deliverables | docs | build-submission.sh + npm script + PROCESS-LOG 4 AUTHOR ACTION | 9b77339 |
| A2-performance-auditor | code | SceneRenderer perf shave + 8 budget tests | 99bef3b |
| A3-first-impression | code | orthoSize/zoom + #onPointerDown + honest road toast + getRouteEndpointStatus | 5d0bc5f |
| A6-ui-design | code | statusBar wrap + 1024 z-index + hover library + BuildToolbar.sync() disabled | 34da583 |
| A7-rationality-audit | code | legend 颜色 + buildFoodDiagnosis + worker list (kind) + Survived→Run | 2b96618 |
| A4-polish-aesthetic | both | lighting amplify + texture halving + entityStackJitter + 1024/1366 + Post-Mortem §4.5 + CHANGELOG | d242719 |

### Validator gate

- node --test: **1701/1708 pass**（4 pre-existing failures unchanged，3 skip）— PASS
- prod build: 4.6s 0 errors → PASS
- preview smoke (10 min): 0 console errors / 0 5xx → PASS
- FPS gate: YELLOW（idle 55.7 / mid 56.4 / stress 54.9 p50 ~95% of 60 target；p5 PASS 44.6-55.2 vs 30）
- freeze-diff: PASS（17 src files；2 new = expected PriorityFSM+forceSpawn；4 new BALANCE = expected A5 tunables；0 新 TILE/role/audio/panel）
- bundle: WARN（3 chunks 500KB-1MB；同 R0 pattern；无 chunk >1MB）

### Bench

- DevIndex day-90 = **53.53**（R0 46.66 Δ +14.7%；HW6 baseline 37.77 Δ **+41.7%**）→ PASS
- Deaths day-90 = **77**（R0 43 Δ +79%）— **intentional**：A5 entity.hunger 重连让 fail-state 重新可达；零死亡 bug 未回归
- A5 修复让 game **重新有 fail state** 且 score derivation 让 do-nothing 不再得分

### 停止条件离触达

| 条件 | 状态 |
|---|---|
| A1 stability 连续 2 轮 0 P0 | ✅ **MET** (R0+R1) |
| A2 performance 连续 2 轮 P50/P5 达标 | ⚠️ R1 P5 ✅ but P50 ~95%；R2 待测 |
| A3-A7 共识问题单调下降 | ⚠️ R1 vs R0 持平或微增；R2 是 trend 判断关键 |
| B1 全 closed/documented-defer | ✅ **MET** (effective 10/10) |
| B2 全 green | ❌ R1=17/22+4 PENDING+1 FAIL；需作者介入 |
| C1 架构债非递增 + 0 D 级 | ❌ debt 27→28；2 D 级仍存；R2/R3 wave-3/4 |
| Validator 连续 2 轮 GREEN | ⚠️ R0+R1 都 YELLOW；需 R2+R3 GREEN |

**结论：7 条停止条件中 2 条达成（A1 + B1）；继续 Round 2。**

### 下一轮重点

1. A5 entity.hunger 重连后 fail state 是否真到（A5 R2 reviewer 实测 30 分钟）
2. A2 perf shave 实测 P50 是否上到 60
3. A3 onboarding 三件 R2 验证
4. A6 disabled state 验证 + hover library 6 panel
5. A7 legend colors + visitor identity 验证
6. C1 wave-3 启动 VisitorAI → PriorityFSM 迁移
7. B2 PENDING 4 项作者必须介入填（pillar names / Post-Mortem 内容 / demo URL / submission format）

---

## Round 2 (2026-05-01) — B1 action-items audit closeout

- **Summary**: B1 R2 audit verdict = GREEN — 8 closed + 1 documented-defer
  (AI-8) + 0 regressed = effective 9/9 = 100% under the
  `(closed + documented_defer) >= total * 0.8 AND 0 regressed` formula.
  Build commit: `d242719`. Reviewer feedback:
  `assignments/homework7/Final-Polish-Loop/Round2/Feedbacks/B1-action-items-auditor.md`.
- **AI-8 (ultra-speed perf at 1000 entities) — documented-defer rationale**:
  - Under v0.10.1 balance (recruit cost + tightened food economy), the
    natural colony population ceiling is ~20; B1 R2 reproduction observed
    12–19 entities at 200–240 FPS with p95 ≈ 4–8 ms — well inside the
    p5 ≥ 30 / p50 ≥ 55 budgets.
  - The HW6 R9 reviewer-b "1000 entities @ 0.9 FPS" pressure point is
    structurally unreachable from standard play; reaching it would
    require a debug spawn-multiplier UI control surface, which violates
    the HW7 hard freeze (new UI panel / control surface).
  - Re-open path is post-HW7: `?perfhud=1` query-flag toggle on the
    existing `PerformancePanel` plus a debug spawn-multiplier knob in a
    DevTools build, neither of which is permissible during freeze.
- **Cross-reference — 2 documented-defer pattern**: AI-6 R1 (durable
  per-character memory in 1k-entity stress, deferred under same
  freeze-+-population-ceiling rationale) + AI-8 R2 (ultra-speed perf at
  1000 entities) = 2/9 documented-defer across the B1 audit history.
  Both root causes are post-rewrite scope reductions (v0.10.0 Worker-FSM
  −2530 LOC rewrite for AI-6, v0.10.1 balance overhaul for AI-8), not
  unaddressed code defects. The pattern is informational for future
  reviewers — perf work targeting >100-entity scale is parked behind a
  natural-population gate that v0.10.1 lowered, not a coverage gap.
- **Implementer**: B1-action-items-auditor wave-0 plan 2/7 (docs track,
  pure markdown additions to `CHANGELOG.md` + this file; no `src/` or
  `test/` touched).

---

## Round 2 (2026-05-01) — Submission Closeout Gates

These 4 gates are the residual PENDING items from B2 R2 (verdict:
**YELLOW 18/22**, distance to GREEN = 4 author-fills). All four are
TA HW7 §1.5 anti-LLM-polish protected — must be filled by author hand,
not LLM. Trajectory: R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22
(cumulative +11). Build commit at R2: `d242719`. Reviewer feedback:
`assignments/homework7/Final-Polish-Loop/Round2/Feedbacks/B2-submission-deliverables.md`.

```
AUTHOR-FILL GATE 1: README pillar names
  grep -c "<copy exact pillar name from A2>" README.md   # must be 0
  Source for fill: assignments/homework2/a2.md
  Note: live README has the placeholder as backslash-escaped
  `\<copy exact pillar name from A2\>` on lines 12 and 18; both
  occurrences must be replaced with the canonical A2 wording.

AUTHOR-FILL GATE 2: Post-Mortem §1-§5 substantive content
  grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md  # must be 0
  Sections owned by author: §1 / §2 / §3 / §4 / §5 (§4.5 already complete in R1)
  Note: 4 `AUTHOR:` HTML-comment guard blocks remain (§1 pillar names,
  §2 playtest table source, §3 commit-link evidence, §5 AI evaluation
  voice). Each comment marks an author-voice section that must be
  written in the first person — not auto-filled.

AUTHOR-FILL GATE 3: Demo video URL
  grep -c "pending — see \[Demo-Video-Plan" README.md     # must be 0
  Sync targets: README line 92 + Post-Mortem "Demo Video" + CHANGELOG [Unreleased]
  Note: README currently uses the markdown-link form
  `pending — see [Demo-Video-Plan.md](...)`; the bare-text form
  `pending — see Demo-Video-Plan` returns 0 hits today, but the
  link-form gate above is the authoritative one and currently hits 1.

AUTHOR-FILL GATE 4: Submission format (choose ONE)
  Option A: npm run submission:zip → upload Canvas zip
  Option B: push main + submit GitHub URL with commit-sha anchor
  Record choice in this PROCESS-LOG entry as: "submission_format: zip"
  OR "submission_format: github"
```

Cross-reference: `assignments/homework7/build-submission.sh` heredoc
already runs the same grep gates at zip-time so the author sees
identical pass/fail signal at both log-review time (here) and at
build-zip time (when invoking `npm run submission:zip`). Wording
for gates 1 / 3 mirrors the R1 closeout entry above; gate 2 collapses
to the single-pattern `AUTHOR:` grep that catches every remaining
HTML-comment author guard in `Post-Mortem.md`.

- **R2 build observation**: B2 R2 reviewer reproduced all 22 checklist
  items against the live build at `127.0.0.1:5173/` with
  `screenshots/B2/01-initial-load.png` and `02-game-loop.png` as
  evidence. The 4 PENDING items are observable as literal placeholder
  strings in the repo (verified by grep counts above), not flaky
  reproduction failures.
- **Implementer**: B2-submission-deliverables wave-0 plan 4/7 (docs
  track, pure markdown additions to `CHANGELOG.md` + this file; no
  `src/` or `test/` touched). Plan explicitly forbids auto-filling any
  of the 4 author-fill items per TA HW7 §1.5; implementer wrote the
  gates only.
