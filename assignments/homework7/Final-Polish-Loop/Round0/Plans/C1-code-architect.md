---
reviewer_id: C1-code-architect
reviewer_tier: C
feedback_source: Round0/Feedbacks/C1-code-architect.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P1
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~280
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: 3f87bf4
system_order_safe: true
wave: 1 of 4
---

## 1. 核心问题

C1 audit 标记 27 项架构债，归并为三个根因：

1. **Doc-Code Drift（最严重 / 最廉价修复）**：`docs/systems/03-worker-ai.md` 整篇文档围绕 v0.9.x `chooseWorkerIntent` / `StatePlanner` / `StateGraph` / `commitmentCycle` / `DEFAULT_STATE_HOLD_SEC` / 10-state graph 描述 worker AI；但 v0.10.0 已经把 worker 全部迁到 `WorkerFSM` priority-FSM dispatcher（12 个新命名 state，无 hold window，无 commitment cycle）。新人读这份文档会得到完全错误的架构心智模型。这是 4 项"严重"+1 项"中" drift 的集中点。
2. **两套 NPC AI framework 并存**：`VisitorAISystem` 和 `AnimalAISystem` 仍然 import `StatePlanner` / `StateGraph` / `StateFeasibility`（v0.9.x 决策骨架），与 v0.10.0 worker FSM 框架完全不一致。这是 C1 标记的 Top-1 重构机会（Refactor-1, 3-wave，需要先抽 generic `PriorityFSM<StateName>` dispatcher）。**本轮不动**，仅做 inventory 跟踪。
3. **WorkerAISystem 主类未瘦身（B 级，1734 LOC）**：`update()` 主循环里 `:1500-1680` 的 ~250 LOC mood/social/relationship/morale-break 补丁块不属于 FSM；handle\* helpers 仍 export 自 WorkerAISystem 而不是 `WorkerHelpers.js`；53 处 legacy `worker.debug.lastIntent` / `blackboard.fsm.state` 兼容字段未清理。**本轮不动**，仅做 inventory 跟踪。

C1 enhancer 话术明确指示：「本轮严禁动 ColonyPlanner / ColonyPerceiver / NPCBrainSystem 实现」「Refactor-1 Wave-1 是单文件 generic-dispatcher 抽取」。结合 enhancer spec 的 ≤400 LOC + hard freeze + Round 0 = 文档 wave 的导引，**本轮 plan 收敛为 docs-only**，把"两套 framework 并存"这件事写进系统文档作为 Round 1+ 的入口锚点。

## 2. Suggestions（可行方向）

### 方向 A: docs-only 同步 + 架构 inventory diff（wave-1 of 4）

- 思路：(a) 重写 `docs/systems/03-worker-ai.md` 让其反映 v0.10.0 PriorityFSM 实现（删 v0.9.x 描述，加 STATE 列表 + 优先级转移表 + `worker.fsm` 单一 source 字段说明）。(b) 在文档末尾追加"Known Architectural Debt"小节，列 C1 audit 的 27 项 debt id + 引用 path，作为 Round 1+ 重构的入口索引。(c) 新增 invariant 测试 `test/worker-fsm-doc-contract.test.js`，断言 `WorkerFSM` 暴露的 STATE 名集合与文档表格中列出的状态集合一致 —— 防止下次 silent drift。
- 涉及文件：
  - `docs/systems/03-worker-ai.md`（rewrite，~250 LOC delta：净 +0，结构性替换）
  - `test/worker-fsm-doc-contract.test.js`（新增，~40 LOC）
- scope：小
- 预期收益：清掉 4 项"严重" doc-code drift（C1 frontmatter 中 doc_code_drift_count=7 → 3），为 Wave-2 的 generic PriorityFSM 抽取提供文档基线，新增 lock-test 防回退
- 主要风险：rewrite 期间若误删现有正确段落（如 JobReservation 描述仍部分对齐）会引入新 drift；通过对照表（§9）逐节列出来缓解
- freeze 检查：OK（仅 docs + 1 个测试文件，无 tile/role/building/mood/audio/UI panel/mechanic 新增）

### 方向 B: 抽 generic `PriorityFSM<StateName>` dispatcher（Refactor-1 Wave-1, code track）

- 思路：按 C1 enhancer 话术执行 Refactor-1 Wave-1：把 `src/simulation/npc/fsm/WorkerFSM.js:32-115` 改成 generic class（构造时注入 `STATE_BEHAVIOR` / `STATE_TRANSITIONS` / `DISPLAY_LABEL`），rename `tickWorker` → `tick`；新增 `src/simulation/npc/PriorityFSM.js`（generic dispatcher，~140 LOC）；保留 `WorkerFSM.js` 作为 thin wrapper 注入 worker-specific tables；调用站点 `WorkerAISystem.js:1653-1654` 改成 `new PriorityFSM(WORKER_BEHAVIOR, WORKER_TRANSITIONS, WORKER_DISPLAY_LABELS)`。
- 涉及文件：`src/simulation/npc/PriorityFSM.js`（新增）、`src/simulation/npc/fsm/WorkerFSM.js`、`src/simulation/npc/fsm/WorkerStates.js`、`src/simulation/npc/WorkerAISystem.js`、`test/worker-fsm.test.js`、新增 `test/priority-fsm.test.js`
- scope：中（实际 LOC delta 约 +180/-100 = ~+80，但触及 hot path 调用站点 + 需要 trace parity 验证 1646 个 baseline 测试）
- 预期收益：为 Wave-2/3（Visitor/Animal 迁移）建好底座，"机械填表"即可 retire `npc/state/*` 三件套（~1167 LOC）
- 主要风险：碰核心 update loop 调用站点（`SYSTEM_ORDER` 中 WorkerAISystem 是 hot path）；需要 trace parity 测试保证 1646 baseline；rename `tickWorker` → `tick` 是 breaking API；超出"Round 0 docs-first"的 enhancer 推荐
- freeze 检查：OK（仅重构，不新增 tile/role/building/mood/audio/UI panel/mechanic）

### 方向 C: 拆 WorkerAISystem 的 mood/social 块到独立 sim 子系统（Refactor-2 Wave-1, code track）

- 思路：把 `WorkerAISystem.js:1500-1680` 的 ~250 LOC mood/social/relationship/morale-break 补丁块抽到新 `WorkerMoodSystem.js` + `WorkerSocialSystem.js`，列入 `SYSTEM_ORDER`（在 WorkerAISystem 之前，因为 `moodOutputMultiplier` 被 worker FSM 读）。
- 涉及文件：`src/simulation/npc/WorkerAISystem.js`、新增 `src/simulation/npc/WorkerMoodSystem.js` + `WorkerSocialSystem.js`、`src/config/constants.js`（SYSTEM_ORDER）、新增对应 test
- scope：中（约 -250 / +330，且 `system_order_safe: false` —— 调整 SYSTEM_ORDER）
- 预期收益：WorkerAISystem 收缩到 ~1480 LOC，FSM dispatch 成为唯一 update 职责
- 主要风险：调整 SYSTEM_ORDER；mood→worker 的 read/write 顺序若错位会改变 harvest/deliver 速率（`moodOutputMultiplier`）；需要 long-horizon benchmark 验证 DevIndex 不退化；WorkerSocialSystem 边界（哪些字段属于 social vs mood）需要设计判断
- freeze 检查：OK 但是 borderline ——「新增 sim 系统」不在 hard freeze 列表（freeze 列的是 tile/role/building/mood asset/audio asset/UI panel/mechanic），但"WorkerMoodSystem"听起来近似"mood mechanic"。**保守判断仍 OK**：mood 字段已经存在，本质是搬移，不是新引入的玩家可见行为

## 3. 选定方案

选 **方向 A（docs-only 同步 + inventory diff，wave-1 of 4）**，理由：

1. **enhancer 提示明确指示**：Runtime Context note 说"For Round 0, propose: wave-1 of M (M = total waves needed across rounds): docs sync + inventory diff for tracking; Defer the actual refactor work to Round 1+"。
2. **风险/收益最优**：方向 B/C 都触及 hot path，需要 trace parity + benchmark 验证；30 min deadline + 单 plan ≤400 LOC budget 不够。Round 0 baseline 应该先把"项目当前架构是什么"在文档里钉死，再开整改。
3. **C1 enhancer 话术二顺位**直接说"完成 Wave-1 后，紧接着删除 docs/systems/03-worker-ai.md 中所有提到 chooseWorkerIntent / planEntityDesiredState / commitmentCycle / DEFAULT_STATE_HOLD_SEC 的段落，重写 'Pipeline Overview' 为 PriorityFSM 描述（10-15 行就够）。这条 doc-code drift 是项目当前最严重的、最容易让新人误解架构的单点 — 修复成本极低。"本 plan 直接执行这个二顺位，把它升级为本轮 wave-1。
4. **lock-test 防回退**：新增的 `worker-fsm-doc-contract.test.js` 在 STATE 集合发生变化但文档没同步时立刻 fail，把"docs sync"从一次性事件变成持续不变量。
5. **wave-2/3/4 已经在 plan 中标记**（见 §9 备注），后续 round 顺序明确：Wave-2 = 抽 generic `PriorityFSM`（方向 B）；Wave-3 = Visitor 迁移；Wave-4 = Animal 迁移。Refactor-2 / Refactor-3 进入 Round 2+ 队列。

## 4. Plan 步骤

- [ ] **Step 1**: `docs/systems/03-worker-ai.md` — `edit` — 删除整个"Pipeline (Intent → State → Action)"章节（描述 `chooseWorkerIntent` + `StatePlanner` + `StateGraph` + `transitionEntityState` 的所有段落）；保留 file header / scope 段落
- [ ] **Step 2**: `docs/systems/03-worker-ai.md` — `add` — 在 file header 后插入新章节"## Pipeline Overview (v0.10.0+: PriorityFSM)"，内容 10-15 行：(a) `worker.fsm = { state, enteredAtSec, target, payload }` 是单一 source；(b) 每 tick `WorkerFSM.tickWorker` 走 `STATE_TRANSITIONS[currentState]` 数组按顺序，第一个 `when()` 返回 true 的 transition 触发 onExit/onEnter；(c) 没有 hold window，没有 commitment latch，没有 hysteresis（参考 `src/simulation/npc/fsm/WorkerFSM.js:32-115` 头部 docstring）
  - depends_on: Step 1
- [ ] **Step 3**: `docs/systems/03-worker-ai.md` — `add` — 加章节"## State Inventory (12 states)"，列表所有 `WorkerFSM` STATE 名（IDLE / SEEKING_REST / RESTING / FIGHTING / SEEKING_HARVEST / HARVESTING / DELIVERING / DEPOSITING / SEEKING_BUILD / BUILDING / SEEKING_PROCESS / PROCESSING），每个 state 一行：用途 + 主要 transition 触发条件 + DISPLAY_LABEL（来源：`src/simulation/npc/fsm/WorkerStates.js:99-114`）
  - depends_on: Step 2
- [ ] **Step 4**: `docs/systems/03-worker-ai.md` — `edit` — 将"WorkerStateGraph 状态：idle/seek_food/eat/seek_task/harvest/deliver/process/wander/seek_rest/rest"段落替换为对照备注："v0.9.x WorkerStateGraph (10 states) was retired in v0.10.0. The current 12-state PriorityFSM is documented above. Old → new mapping is in §9 of the plan that introduced this rewrite (Round0/Plans/C1-code-architect.md)."
  - depends_on: Step 3
- [ ] **Step 5**: `docs/systems/03-worker-ai.md` — `edit` — 删除 `DEFAULT_STATE_HOLD_SEC` / `commitmentCycle` / `hysteresis` 三处提及；JobReservation 章节保留但加注"used by FSM HARVESTING/BUILDING onEnter; see WorkerHelpers.acquireJobReservation"
  - depends_on: Step 4
- [ ] **Step 6**: `docs/systems/03-worker-ai.md` — `add` — 文档末尾追加"## Known Architectural Debt (C1 Round 0 inventory)"小节：列出 27 项 debt id（debt-prog-1..debt-log-1）并对应一行简介 + source file path。引用 `assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/C1-code-architect.md` 作为详细 source。明确标记 Refactor-1 (Visitor/Animal → generic PriorityFSM) 为 Round 1+ next step
  - depends_on: Step 5
- [ ] **Step 7**: `test/worker-fsm-doc-contract.test.js` — `add` — 新增 invariant 测试：(a) 解析 `docs/systems/03-worker-ai.md` 的"## State Inventory"章节抽取所有 STATE 名（regex match `^- \`([A-Z_]+)\``）；(b) import `WORKER_STATES` from `src/simulation/npc/fsm/WorkerStates.js`；(c) `assert.deepEqual` 两个集合；fail message 提示"docs/systems/03-worker-ai.md State Inventory 与 WorkerStates.js 不同步，请同步"。约 40 LOC
  - depends_on: Step 3
- [ ] **Step 8**: 运行 `node --test test/worker-fsm-doc-contract.test.js` 确认 lock-test 通过；运行 `node --test test/*.test.js` 确认 1646 baseline 不退化
  - depends_on: Step 7

总计 LOC delta 估算：docs/systems/03-worker-ai.md 约 +250 / -200（净 +50），test 新增约 +40，plan 总 LOC delta ≈ +290（≤ 400 budget OK）。

## 5. Risks

- **R1**: 文档章节 rewrite 时若漏掉现有"还正确"的段落（如 JobReservation 部分对齐、SYSTEM_ORDER 中 WorkerAISystem 位置说明），会让原本部分正确的段落消失。**缓解**：§9 对照表逐段标记保留/删除/重写。
- **R2**: 新增的 lock-test 用 regex 解析 markdown，markdown 表格语法变化会让 regex miss。**缓解**：测试文件用最简单的 `^- \`([A-Z_]+)\`` 列表项格式（不依赖表格），并在 Step 3 中显式用列表语法而不是表格。
- **R3**: `worker-fsm-doc-contract.test.js` 若未来 Wave-2 把 STATE 名 rename（e.g. `HARVESTING` → `WORK_HARVEST`），lock-test 会 fail —— **这正是设计意图**（强制文档同步），不是 bug。Implementer 文档需明确告知未来 maintainer。
- **R4**: 文档"Known Architectural Debt"小节列 27 项 debt id 形成长清单，可能让读者误以为项目处于 RED state（实际 C1 verdict 是 YELLOW / 60% A+B）。**缓解**：小节开头一行说明"这是 C1 Round 0 baseline；项目整体 YELLOW，Top-3 重构机会列在 Refactors 段"。
- **可能影响的现有测试**：纯 docs + 1 个新测试，不动任何 sim 代码 → 1646 baseline 全部应保持。`worker-fsm-doc-contract.test.js` 是新增不影响存量。

## 6. 验证方式

- **新增测试**：`test/worker-fsm-doc-contract.test.js` 覆盖"docs/systems/03-worker-ai.md 中列出的 worker FSM state 名集合 == WorkerStates.js 中 export 的 WORKER_STATES 集合"
- **手动验证**：
  1. `node --test test/worker-fsm-doc-contract.test.js` —— 期望：1 pass
  2. `node --test test/*.test.js` —— 期望：1647 pass（1646 baseline + 1 new）/ 0 fail / 2 skip
  3. 浏览 `docs/systems/03-worker-ai.md` —— 期望：(a) 不再出现 "chooseWorkerIntent" / "StatePlanner" / "commitmentCycle" / "DEFAULT_STATE_HOLD_SEC" 字符串；(b) 出现 "PriorityFSM" / "WorkerFSM" / "STATE_TRANSITIONS" / 12 个 STATE 名；(c) 末尾有"Known Architectural Debt"小节列 27 项 id
  4. `grep -E "chooseWorkerIntent|StatePlanner|commitmentCycle" docs/systems/03-worker-ai.md` —— 期望：零匹配（除"v0.9.x ... was retired"对照备注外，但该备注用的是 backtick code，不影响 grep 结果）
- **FPS 回归**：N/A（纯 docs，无 runtime 影响）
- **benchmark 回归**：N/A（纯 docs）
- **prod build**：`npx vite build` —— 期望：无错（docs/ 不参与 vite bundle，本来也不会受影响）；快速 sanity 而已

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚：`git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发）
- 涉及文件少（2 个），实际 implementer 也可以 `git checkout 3f87bf4 -- docs/systems/03-worker-ai.md test/worker-fsm-doc-contract.test.js` 局部回滚

## 8. UNREPRODUCIBLE 标记

N/A —— C1 driven plan 跳过 Playwright 现场复现（按 enhancer spec §5 规则）。C1 audit 的"过期文档"是静态文件审计，无需 runtime 复现；read `docs/systems/03-worker-ai.md` + grep `src/simulation/npc/fsm/` 即可完整确认 drift。

## 9. C1 对照表

### 9.1 旧文档章节 → 新文档章节（docs/systems/03-worker-ai.md）

| 旧 | 新 | 备注 |
|----|----|------|
| "Pipeline: Intent (chooseWorkerIntent) → State (StatePlanner / StateGraph) → Action (WorkerAISystem)" 章节 | "## Pipeline Overview (v0.10.0+: PriorityFSM)" | 完全 rewrite。新章节描述 fsm.state 单一 source + STATE_TRANSITIONS 优先级数组 walk |
| "WorkerStateGraph 状态：idle / seek_food / eat / seek_task / harvest / deliver / process / wander / seek_rest / rest" (10 states) | "## State Inventory (12 states)" | 12 个新名：IDLE / SEEKING_REST / RESTING / FIGHTING / SEEKING_HARVEST / HARVESTING / DELIVERING / DEPOSITING / SEEKING_BUILD / BUILDING / SEEKING_PROCESS / PROCESSING |
| "DEFAULT_STATE_HOLD_SEC (0.8 s) 防止 oscillation" | (删除) | priority FSM 的离散 transition 天然防 oscillation，无需 hold window |
| "commitmentCycle 锁" | (删除) | v0.10.0 retrospective 明确 commitmentCycle 已删除 |
| "JobReservation API 与 occupancy-aware target scoring" (chooseWorkerTarget 描述) | "JobReservation (used by HARVESTING/BUILDING onEnter; see WorkerHelpers.acquireJobReservation)" | 部分保留，重新指向 FSM 调用站点 |
| (无) | "## Known Architectural Debt (C1 Round 0 inventory)" | 新增。列 27 项 debt id 入口索引，引用 C1 feedback file 作为详细 source |

### 9.2 旧函数名 → 新函数名 / 当前 source（C1 audit 关键引用）

| 旧（v0.9.x）| 新（v0.10.0+） | source |
|----|----|----|
| `chooseWorkerIntent(worker, state)` | (废除，无对应) | retired in v0.10.0-d |
| `planEntityDesiredState(entity, ...)` | `worker.fsm.target` 由 onEnter set；entity 端无统一 planner | `src/simulation/npc/fsm/WorkerStates.js` (per-state onEnter) |
| `transitionEntityState(entity, ...)` | `WorkerFSM.tickWorker` 内部 walk `STATE_TRANSITIONS[currentState]`，第一个 `when()` 返回 true 触发 | `src/simulation/npc/fsm/WorkerFSM.js:56-91` |
| `WorkerStateGraph` (10-state graph) | `WORKER_STATES` (12-state flat enum) + `STATE_TRANSITIONS` (priority-ordered) | `src/simulation/npc/fsm/WorkerStates.js`, `src/simulation/npc/fsm/WorkerTransitions.js` |
| `commitmentCycle` (v0.9.x latch) | (废除) | priority FSM 用 transition `priority` 字段表达抢占，无 latch |
| `STICKY_BONUS_FRESH` / `STICKY_DECAY_SEC` (v0.9.x hysteresis) | (废除) | 离散 transition 无需 hysteresis |
| `JobScheduler.tickWorker` (v0.9.x utility scoring) | `WorkerFSM.tickWorker` (v0.10.0 priority dispatch) | `src/simulation/npc/fsm/WorkerFSM.js:56` |
| `worker.currentJob` (v0.9.x source of truth) | `worker.fsm = { state, enteredAtSec, target, payload }` | `src/simulation/npc/fsm/WorkerFSM.js:32+` |

### 9.3 Wave 路线图（Round 0 写入文档作为后续轮次锚点）

| Wave | Round | Scope | LOC budget | system_order_safe |
|------|-------|-------|------------|-------------------|
| **1 of 4** (本轮) | Round 0 | docs sync + invariant lock-test | ~290 | true |
| 2 of 4 | Round 1 | 抽 generic `PriorityFSM<StateName>` dispatcher（C1 Refactor-1 Wave-1）| ~300 | true（worker 调用站点不动 SYSTEM_ORDER 顺序）|
| 3 of 4 | Round 2 | VisitorAISystem 迁移到 PriorityFSM；retire StatePlanner/StateGraph/StateFeasibility 中 Visitor 相关引用 | ~400 | true |
| 4 of 4 | Round 3 | AnimalAISystem 迁移；完全 retire `npc/state/*` 三件套（~1167 LOC 删除） | ~400 | true |

后续 Refactor-2（WorkerAISystem mood/social 拆分）和 Refactor-3（ColonyPlanner/Perceiver 收编）独立轮次队列，本轮不开。

### 9.4 system_order_safe 证据

`system_order_safe: true` —— 本 plan 仅 docs + 1 个新测试文件，**完全不触及** `src/config/constants.js` 的 `SYSTEM_ORDER` 数组。15 个 sim system 的 update 顺序、读写依赖、tick 频率全部不变。WorkerAISystem 在 SYSTEM_ORDER 中的位置不变；WorkerFSM 仍然由 WorkerAISystem.update() 内部调用，无独立 system slot 申请。

新增测试 `test/worker-fsm-doc-contract.test.js` 是离线静态断言（解析 markdown + 对比 import 出来的 STATE 集合），不在游戏 update loop 中运行，不影响任何 system 时序。

