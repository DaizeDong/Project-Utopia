---
reviewer_id: C1-code-architect
reviewer_tier: C
feedback_source: Round3/Feedbacks/C1-code-architect.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P1
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 6
  loc_delta: ~+450 / -550 = ~-100
  new_tests: 1
  wall_clock: 180
conflicts_with: []
rollback_anchor: 0344a4b
system_order_safe: true
wave: 3.5 of 4
---

## 1. 核心问题

1. **R2 wave-3 落地 VisitorFSM staging skeleton 但 7/9 STATE_BEHAVIOR.tick 是 noopTick + 8/9 STATE_TRANSITIONS 是空数组** — 必须在 R3 wave-3.5 填实 + 翻 USE_VISITOR_FSM 默认 ON + 删除 VisitorAISystem dual-path，否则 USE_VISITOR_FSM 成为永久 dead-flag（同 v0.10.0-d 的 USE_FSM 命运）。
2. **新增 staging-debt (debt-vis-3 + debt-vfsm-1) 净 +1 条，delta -1（首次负向）** — 这是有意中间态；wave-3.5 完成后会反弹 +2 LOC 改善（vis-1 完成 + vfsm-1 关闭 + vis-3 关闭 = -3 净改善）。
3. **doc-code drift +1**（第二 facade VisitorFSM 完全无文档） — wave-3.5 完成时同步更新 docs/systems/03-worker-ai.md。

## 2. Suggestions（可行方向）

### 方向 A: Visitor FSM Wave-3.5 完整周期（fill state body + trace-parity test + flag flip + dual-path 删除）

- 思路：按 reviewer 给的 7 步话术：(a) 把 `runEatBehavior / traderTick / saboteurTick / runWander` 4 大行为 body 搬进对应 STATE.tick；(b) 抽 `VisitorHelpers.js` 照搬 WorkerHelpers.js 模式；(c) 填 STATE_TRANSITIONS 8 个空数组的 priority-ordered when() callbacks；(d) 写 `test/visitor-fsm-trace-parity.test.js`（trader / saboteur 各 1 fixture，flag=false vs true 同 seed 200 tick fsm.state 序列断言）；(e) trace-parity 通过后翻 `_useVisitorFsm = true`；(f) 删除 VisitorAISystem.js dual-path + StatePlanner / StateGraph imports + USE_VISITOR_FSM flag；(g) 同步 docs/systems/03-worker-ai.md 加 visitor FSM 章节。
- 涉及文件：`src/simulation/npc/fsm/VisitorStates.js` (61→~280 LOC)、`src/simulation/npc/fsm/VisitorTransitions.js` (36→~80 LOC)、新建 `src/simulation/npc/fsm/VisitorHelpers.js` (~120 LOC)、`src/simulation/npc/VisitorAISystem.js` (708→~350 LOC)、`src/config/constants.js` (USE_VISITOR_FSM flag 翻 true 后删除)、新建 `test/visitor-fsm-trace-parity.test.js` (~120 LOC)、`docs/systems/03-worker-ai.md` (加 visitor FSM 章节)
- scope：中（净 LOC delta ~-100；budget 预算 ~+450 / -550 = -100，低于 400 LOC 上限）
- 预期收益：debt-vis-1 关闭 / debt-vis-3 关闭 / debt-vfsm-1 关闭 / VisitorAISystem C→B / VisitorFSM B→A / staging-debt -2 / delta R3→R4 +2-3
- 主要风险：trader / saboteur 行为有 scenario-specific tweaks（getSabotageGridChangeCooldownSec / findScenarioZoneLabel）；trace-parity test 必须覆盖这些；若 7 状态全填超 LOC budget，保底先填 EAT/SEEK_FOOD + SCOUT/SABOTAGE/EVADE 5 状态（reviewer 显式建议，TRADE/SEEK_TRADE 留 wave-4）。
- freeze 检查：OK（无新 mechanic / role / building / mood / UI panel；外部观察行为不变 — trace-parity test 是硬 gate）

### 方向 B: 仅退回 R1 baseline（删除 USE_VISITOR_FSM flag + 3 个 fsm/Visitor*.js + dual-path）— 保底兜底

- 思路：reviewer 显式说"如果 round-3 plan budget 实在不够 wave-3.5"则必须 rollback 到 R1 baseline。
- 涉及文件：删除 `src/simulation/npc/fsm/VisitorFSM.js` / `VisitorStates.js` / `VisitorTransitions.js` + VisitorAISystem dual-path + constants.js flag
- scope：小
- 预期收益：避免永久 dead-flag。
- 主要风险：debt-vis-1 仍 persisting；R2 wave-3 工作完全作废；下游 wave-4 (Animal) 失去 visitor reference implementation。
- freeze 检查：OK

### 方向 C: Animal Wave-4 + Visitor Wave-3.5 同时做（FREEZE-VIOLATION 边缘 + LOC budget 爆）

- 思路：reviewer 显式禁止 — "不要直接做 Wave-4 (Animal). Wave-3.5 trace-parity 通过 + flag 翻 + dual-path 删除 — 这套完整周期跑一遍才有 Animal Wave-4 的设计参照"。
- scope：大（>400 LOC budget）
- 预期收益：双系统升级。
- 主要风险：超 LOC budget 红线 + 无 visitor reference 设计 → wave-4 设计可能错。
- freeze 检查：超 C1 整理 plan ≤400 LOC 硬约束；不选定。

## 3. 选定方案

选 **方向 A**。理由：(a) reviewer 给出明确 7 步路线 + LOC budget 估算（净 -100 < 400 上限）；(b) round-3 必做条件已 hard-coded 在 reviewer 的 §8 给 enhancer 的话术；(c) 方向 B 是保底兜底（plan budget 不够时 fallback），不应作为首选；(d) 方向 C 超 budget + 缺 visitor reference 风险高。**保底**：实施过程中若 Step 4 trace-parity test 写 >150 LOC 仍不通过，按 reviewer 提示 partial-fill 5 状态（EAT/SEEK_FOOD/SCOUT/SABOTAGE/EVADE）剩 TRADE/SEEK_TRADE 留 wave-4；若 Step 5 trace-parity 完全卡死则切换方向 B 全 rollback。

## 4. Plan 步骤

- [ ] Step 1: `src/simulation/npc/fsm/VisitorHelpers.js` — add — 新建 helper 模块照搬 WorkerHelpers.js 模式：从 VisitorAISystem.js:683-693 抽 `runEatBehavior / traderTick / saboteurTick / runWander` 4 个 helper function 的核心 body 到此（让 VisitorStates.js 可 import 不循环依赖 VisitorAISystem）；签名：`runEatBehavior(visitor, state, dt)`、`traderTick(visitor, state, dt)`、`saboteurTick(visitor, state, dt)`、`runWanderStep(visitor, state, dt)`。预算 ~120 LOC.
- [ ] Step 2: `src/simulation/npc/fsm/VisitorStates.js:51-61` — edit — 把 9 个 `noopTick` 替换为真实 onEnter/tick/onExit。9 状态填法：`IDLE`(noop)、`WANDERING`(runWanderStep)、`SEEK_TRADE`(traderTick.findStall)、`TRADE`(traderTick.tradeAction)、`SCOUT`(saboteurTick.scout)、`SABOTAGE`(saboteurTick.sabotageAction)、`EVADE`(saboteurTick.evade)、`SEEK_FOOD`(runEatBehavior.findFood)、`EAT`(runEatBehavior.consume)。模板：`src/simulation/npc/fsm/WorkerStates.js`（515 LOC，9 状态 production）。预算 61→~280 LOC.
  - depends_on: Step 1
- [ ] Step 3: `src/simulation/npc/fsm/VisitorTransitions.js:28-35` — edit — 把 8 个 `Object.freeze([])` 替换为 priority-ordered transition 行；条件从 `src/simulation/npc/state/StatePlanner.js#planEntityDesiredState` 抽（每个 desiredState case 对应 1 行 `{ priority: N, when: (v, s) => ..., to: "STATE_NAME" }`）。每状态 1-3 transition。预算 36→~80 LOC.
  - depends_on: Step 2
- [ ] Step 4: `test/visitor-fsm-trace-parity.test.js` — add — 新建测试：2 fixture（trader / saboteur 各 1）；setup deterministic seed + minimal world；`_testSetFeatureFlag("USE_VISITOR_FSM", false)` 跑 200 sim-tick 记录每帧 `visitor.fsm.state` 序列；`_testSetFeatureFlag("USE_VISITOR_FSM", true)` 重跑相同 seed；`assert.deepStrictEqual(seqA, seqB)`。**这是 wave-3.5 的硬 gate** — 不通过禁止 Step 5 翻 flag。预算 ~120 LOC.
  - depends_on: Step 3
- [ ] Step 5: `src/config/constants.js:215` (`let _useVisitorFsm = false`) — edit — 改为 `let _useVisitorFsm = true`。**仅在 Step 4 trace-parity 全过后**。
  - depends_on: Step 4
- [ ] Step 6: `src/simulation/npc/VisitorAISystem.js` — edit — 删除：line 8-9 `import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js"; import { planEntityDesiredState } from "./state/StatePlanner.js";`；删除 line 618-672 dual-path（保留 `this._fsm` lazy-init 但移除 `if (FEATURE_FLAGS.USE_VISITOR_FSM)` 分支与 legacy 分支）；update() 主体收缩为 `for visitor: this._fsm.tickVisitor(visitor, state, dt)` + LOD/stride 外壳。VisitorAISystem.js 应从 708 → < 350 LOC.
  - depends_on: Step 5
- [ ] Step 7: `src/config/constants.js:215-219` + `_testSetFeatureFlag` — edit — 删除 `_useVisitorFsm` 变量、FEATURE_FLAGS.USE_VISITOR_FSM getter、`_testSetFeatureFlag("USE_VISITOR_FSM", ...)` 处理 case；保留 `USE_FSM` 不动（worker FSM flag 同样 dead 但 v0.10.0-d 已决定一轮一起清）。
  - depends_on: Step 6
- [ ] Step 8: `docs/systems/03-worker-ai.md` — edit — 增补 "PriorityFSM is generic; current consumers: WorkerFSM (production, v0.10.0) + VisitorFSM (production, v0.10.2)" 章节；更新 § visitor 状态表 + 删除 StatePlanner / StateGraph 引用；闭合 doc-code drift +1。
  - depends_on: Step 6
- [ ] Step 9: `CHANGELOG.md` `[Unreleased]` — add — 追加 `### Refactor — C1 wave-3.5 (Visitor FSM)` 子节，记录 net delta -100 LOC + debt closures (vis-1 / vis-3 / vfsm-1) + delta R3→R4 +3.

## 5. Risks

- trace-parity test 可能因 trader / saboteur 的 scenario-specific tweaks 失败（getSabotageGridChangeCooldownSec / findScenarioZoneLabel etc.）；mitigation：fixture 使用最小 scenario，避免触发 sabotage/zone 边缘 case；若全填 9 状态 trace-parity 卡死则 partial-fill 5 状态（EAT/SEEK_FOOD/SCOUT/SABOTAGE/EVADE），TRADE/SEEK_TRADE 留 wave-4。
- 若 Step 4 完全卡死，按方向 B rollback 全部（删 fsm/Visitor*.js + flag + dual-path），保 R1 baseline，避免永久 dead-flag。
- VisitorAISystem.js 改造可能影响 sabotage handler ~100 LOC 隐藏 state machine（debt-vis-2）；本 wave-3.5 不触 debt-vis-2，仅迁 4 helper；sabotage handler 留原位。
- 可能影响的现有测试：`test/visitor-fsm-skeleton.test.js` (R2 加)、`test/visitor-fsm-invariants.test.js` (R2 加)、`test/visitor-ai-system.test.js`、`test/scenario-saboteur.test.js`（如存在），全部 1646 baseline 测试需保持 pass。

## 6. 验证方式

- 新增测试：`test/visitor-fsm-trace-parity.test.js`。R2 已有的 skeleton + invariants 测试需保持 pass。
- 手动验证：`npx vite` → 进游戏 → 等 trader / saboteur spawn → 期望 trader 走向 stall 完成 trade、saboteur 走 SCOUT → SABOTAGE → EVADE 序列；对比 R2 baseline 行为应**视觉等价**（worker 不再 "全部停在原地不工作"）。
- 测试 baseline：1646 pass / 0 fail / 2 skip 必须保持。
- FPS 回归：删 dual-path + 移除 import 应**降低**主循环开销；FPS 不应下降。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains DevIndex 不得低于 baseline -5%。
- prod build：`npx vite build` 无错；smoke 5 分钟 trader + saboteur 行为正确。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`（仅当 Implementer 失败时由 orchestrator 触发）
- **partial-fail fallback**：若 Step 4 trace-parity 5+ 状态 fix 不通，方向 B（删 fsm/Visitor*.js + flag + dual-path）回 R1 baseline。

## 8. UNREPRODUCIBLE 标记（如适用）

C1 driven plan 跳过本节（reviewer 已基于代码静态扫给出完整 inventory）。

## 9. C1 对照表

| 旧 | 新 | 备注 |
|----|----|------|
| `src/simulation/npc/state/StatePlanner.js#planEntityDesiredState` (visitor 分支) | `src/simulation/npc/fsm/VisitorTransitions.js` priority-ordered when() | visitor desiredState case → 1 transition row |
| `src/simulation/npc/state/StateGraph.js` `mapStateToDisplayLabel` / `transitionEntityState` (visitor 路径) | `src/simulation/npc/fsm/VisitorStates.js` `DISPLAY_LABEL` + PriorityFSM dispatcher | facade 镜像 WorkerFSM |
| `src/simulation/npc/VisitorAISystem.js#runEatBehavior` (line 683-693) | `src/simulation/npc/fsm/VisitorHelpers.js#runEatBehavior` + `VisitorStates.js EAT.tick / SEEK_FOOD.tick` | helper 抽出避免循环 import |
| `VisitorAISystem.js#traderTick` | `VisitorHelpers.js#traderTick` + `VisitorStates.js TRADE.tick / SEEK_TRADE.tick` | 同上 |
| `VisitorAISystem.js#saboteurTick` | `VisitorHelpers.js#saboteurTick` + `VisitorStates.js SCOUT.tick / SABOTAGE.tick / EVADE.tick` | 同上 |
| `VisitorAISystem.js#runWander` | `VisitorHelpers.js#runWanderStep` + `VisitorStates.js WANDERING.tick` | 同上 |
| `FEATURE_FLAGS.USE_VISITOR_FSM` getter + `_useVisitorFsm` let | (deleted) | wave-3.5 关闭后 flag 永久消失 |
| `VisitorAISystem.js:618-672` dual-path if-block | `VisitorAISystem.js` single `for visitor: this._fsm.tickVisitor(visitor, state, dt)` | 收缩 ~58 LOC |

`system_order_safe: true` 证据：

- VisitorAISystem 在 `src/config/constants.js` `SYSTEM_ORDER` 的位置不变；只是 update() 主体内部委派给 PriorityFSM dispatcher。
- 读 / 写关系不变：read `state.entities.visitors`、`state.scenario`、`state.grid`；write `visitor.fsm.state`、`visitor.position`、`visitor.carry`（与 R2 dual-path 等价）。
- 时序无变化 — VisitorAISystem 仍在 SYSTEM_ORDER 中 NPCBrainSystem 之后、AnimalAISystem 之前；trace-parity test 即是时序等价的硬证明。
