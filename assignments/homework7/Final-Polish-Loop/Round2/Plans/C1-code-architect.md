---
reviewer_id: C1-code-architect
reviewer_tier: C
feedback_source: Round2/Feedbacks/C1-code-architect.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P1
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 5
  loc_delta: ~+360
  new_tests: 2
  wall_clock: 35
conflicts_with: []
rollback_anchor: d242719
system_order_safe: true
wave: 3 of 4
---

## 1. 核心问题

1. **VisitorAISystem 仍跑 v0.9.x 三件套（StatePlanner / StateGraph）** — `src/simulation/npc/VisitorAISystem.js:8-9` 仍 import `mapStateToDisplayLabel, transitionEntityState, planEntityDesiredState`，与 Worker 已迁到 PriorityFSM 形成路径分裂。debt-vis-1 持续。
2. **Round 1 wave-2 已就绪 generic enabler，但 Visitor 端尚未承接** — `PriorityFSM` (132 LOC，构造接收 `{behavior, transitions, displayLabel, defaultState}`) + `WorkerFSM` (61 LOC facade) 提供了直接可复用的样板；只缺 `VisitorStates.js` + `VisitorTransitions.js` + facade 三个产物。
3. **风险/预算冲突** — 完整迁移（删除 StatePlanner visitor 路径 + Visitor 主循环重写）按 feedback §8 估计 +450/-550 ≈ -100 LOC，但实际 traders/saboteurs 双 groupId + 5 个分发 case (`seek_food/eat`, `seek_trade/trade`, `scout/sabotage/evade`, `wander`, `idle`) + 现有 692 LOC 中嵌入的 sabotage handler、trade handler、eat handler、wander helper 重新映射到 STATE.tick body 的工作量在 R2 单轮 40min 窗口内**很可能超 400 LOC budget 或破坏 trace parity**。

## 2. Suggestions（可行方向）

### 方向 A: 一次性完整迁移 VisitorAISystem 到 PriorityFSM（feedback §8 推荐路径）
- 思路：复制 WorkerFSM 61 LOC facade 模式，新建 `VisitorStates.js` + `VisitorTransitions.js`（每 state 一个 `tick()`，把现有 `runEatBehavior` / `traderTick` / `saboteurTick` / `runWander` 内联进去），VisitorAISystem.update() 收缩到 `for (const v of state.agents) if (v.type === "VISITOR") this._fsm.tick(v, state, services, dt);`，删除 StatePlanner.js / StateGraph.js 的 visitor 分支。
- 涉及文件：`VisitorAISystem.js` (-450), `VisitorStates.js` (+250), `VisitorTransitions.js` (+150), `VisitorFSM.js` facade (+60), `state/StatePlanner.js` (-90 visitor 分支), `state/StateGraph.js` (-50 visitor labels)，新测 +200。净 LOC delta 估计 ~+70 / -640 = ~ -570 — 但在迁移过程中 add+delete 双向都要计入；保守估算 **新增/重写代码 ≈ +720 LOC**，超 400 LOC plan budget。
- scope：大
- 预期收益：debt-vis-1 + debt-vis-2 双双 resolved，VisitorAISystem 从 C → A，npc/state/* 三件套向退役更进一步。
- 主要风险：（1）saboteur 三态（scout/sabotage/evade）共享 sabotageCooldown 状态；transition `when()` 里读 cooldown 容易写错首-match 顺序；（2）trader 的 `seek_trade → trade` 取决于"是否在 warehouse 上"，与 Worker 的 at-target 判断有相同模式但 visitor 没有 carry，需独立 helper；（3）现有 `visitor.blackboard.intent = stateNode` 兼容字段是 28 处 `worker.debug.lastIntent` / `blackboard.fsm` 兼容残留之一（debt-worker-3）— 若一次性切换会让 `EntityFocusPanel` / `InspectorPanel` 显示崩；（4）40min 窗口内 trace-parity 测试很难写完整。
- freeze 检查：OK（不新增 tile/role/building/audio/UI panel）

### 方向 B: 阶段化迁移（**主推**） — wave-3 仅 stage 新路径，flag 默认 OFF，wave-3.5/round-3 flip default
- 思路：新建 `VisitorStates.js` + `VisitorTransitions.js` + `VisitorFSM.js` facade（与 Worker 同模式），但**不删** StatePlanner/StateGraph 的 visitor 路径；在 VisitorAISystem.update() 顶部加 `if (FEATURE_FLAGS.USE_VISITOR_FSM) { ...new path... } else { ...old path... }`，flag 默认 `false`。round-3 wave-3.5 验证 trace-parity 通过后翻 flag default + 删除旧路径。
- 涉及文件：
  - **新建** `src/simulation/npc/fsm/VisitorStates.js` (~+220 LOC: STATE_BEHAVIOR for IDLE/WANDER/SEEK_TRADE/TRADE/SEEK_FOOD/EAT/SCOUT/SABOTAGE/EVADE + DISPLAY_LABEL — onEnter/tick/onExit 三件式，把现有 helpers 的 logic call 进去而非重写)
  - **新建** `src/simulation/npc/fsm/VisitorTransitions.js` (~+90 LOC: priority-ordered when() 表，9 个 STATE 各 1-3 行)
  - **新建** `src/simulation/npc/fsm/VisitorFSM.js` (~+60 LOC: 与 WorkerFSM.js 同模式 thin facade)
  - **edit** `src/simulation/npc/VisitorAISystem.js` (~+15 LOC: lazy-init `this._fsm = new VisitorFSM()`; `if (FEATURE_FLAGS.USE_VISITOR_FSM) this._fsm.tickVisitor(visitor, state, services, logicDt); else { ...existing 658-679 unchanged... }`)
  - **edit** `src/config/constants.js:FEATURE_FLAGS` (+1 LOC: `USE_VISITOR_FSM: false`)
  - **新增测试** `test/visitor-fsm-trace-parity.test.js` (~+90 LOC: 同 seed 跑两路径 5s，断言 stateLabel 序列一致)
  - **新增测试** `test/visitor-fsm-invariants.test.js` (~+60 LOC: 单写 stateLabel、selfTransition no-op、defaultState IDLE)
- 涉及总 LOC delta：+220 + 90 + 60 + 15 + 1 + 90 + 60 = **~+536 LOC** 新增；旧路径**零删除** → 净 ~+536。**超 400 LOC budget**。

### 方向 C: 阶段化迁移 — **shim 极简版**（**最终主推**，按 enhancer 提示"OR alternative scope: tighter"路径）
- 思路：与 B 相同的"feature-flag 双路径"骨架，但本轮**只 stage skeleton + 1 个 state 端到端通路**作为概念验证（PoC），其余 8 个 state 留空 STATE_BEHAVIOR.tick 占位（fallback 到旧路径）。具体：
  - `VisitorStates.js` 仅实现 `IDLE` + `WANDERING`（其余 7 state 仅 DISPLAY_LABEL 条目，behavior tick 空委托回 wanderingTick — 即 wander 是兜底）
  - `VisitorTransitions.js` 仅 IDLE→WANDERING 1 行；其余 STATE 转换表 `{}` 空对象
  - 完整 9-state 的 trade / sabotage / eat 行为**留在 VisitorAISystem 老路径**，由 flag=false 默认走旧 StatePlanner
  - flag=true 仅供测试 + round-3 wave-3.5 渐进填充
- 涉及文件：
  - **新建** `src/simulation/npc/fsm/VisitorStates.js` (~+90 LOC: 9 个 DISPLAY_LABEL + 2 个 STATE_BEHAVIOR 完整 tick + 7 个 stub)
  - **新建** `src/simulation/npc/fsm/VisitorTransitions.js` (~+30 LOC: 9 STATE 表头 + IDLE→WANDERING 1 转换)
  - **新建** `src/simulation/npc/fsm/VisitorFSM.js` (~+60 LOC: 与 WorkerFSM 同模式 thin facade)
  - **edit** `src/simulation/npc/VisitorAISystem.js` (~+18 LOC: lazy-init + flag-gated branch 包裹 658-680 段)
  - **edit** `src/config/constants.js:FEATURE_FLAGS` (+1 LOC: `USE_VISITOR_FSM: false`)
  - **新增测试** `test/visitor-fsm-skeleton.test.js` (~+80 LOC: facade 可构造、tick 调用 dispatcher、空 transitions 表不崩、defaultState IDLE、stateLabel 单写、flag=false 时旧路径完全不动)
  - **新增测试** `test/visitor-fsm-invariants.test.js` (~+60 LOC: 与 priority-fsm-generic 同模式但锁 visitor 端 — selfTransition no-op、onEnter 在 init 触发、displayLabel 写入)
- 涉及总 LOC delta：90 + 30 + 60 + 18 + 1 + 80 + 60 = **~+339 LOC**。**低于 400 LOC budget，留 ~60 LOC margin** 给意外。
- scope：中
- 预期收益：（a）debt-vis-1 标记 "in-progress wave-3"（部分 resolved — skeleton + flag 落地，behavior 待 round-3）；（b）generic PriorityFSM 在第二种 entity type 上证明可复用（构造 = `new PriorityFSM({...})`，零 dispatcher 改动）；（c）零外部观察行为变化（flag=false 默认，旧路径 byte-for-byte 不动）；（d）wave-4 (Animal) 的实施模板就绪。
- 主要风险：（1）skeleton-only 不完整 — round-3 必须接力填充 7 个 STATE.tick body，否则 flag 永远翻不上去（但这是分轮规划的标准代价）；（2）VisitorFSM facade 引入新路径若 `services` 注入接口与 Worker 略不同（visitor 用 `state.agents` 而非 `state.workers`）需在 facade 内 abstract，避免 dispatcher 知道 entity type — **缓解**：dispatcher 已是 generic（参数名 `entity`），facade 命名 `tickVisitor` 即可。
- freeze 检查：OK（不新增 tile/role/building/audio/UI panel/mechanic — `USE_VISITOR_FSM` 是配置 flag 不是 mechanic；新建 fsm/Visitor*.js 是已存在 fsm/ 目录的同构扩展不是新 panel）

### 方向 D: 仅做 docs sync（不动 src）
- 思路：在 `docs/systems/03-worker-ai.md` 加一段说明 PriorityFSM 已 generic + 列 wave-3/4 status。
- scope：小
- 预期收益：低 — debt-vis-1 完全不动；feedback §8 明确希望 src 层动作。
- 主要风险：错失 R1 wave-2 已铺好的 enabler。
- freeze 检查：OK
- **不选**：feedback §8 显式要求"如果你只能改 1 件事，先做 Refactor-1 Wave-3"，docs-only 不达预期。

## 3. 选定方案

选 **方向 C（阶段化 + skeleton-only PoC + flag-default-OFF）**，理由：

1. **预算贴合**：~+339 LOC < 400 LOC hard budget，留 ~60 LOC margin。方向 A (~+720) / B (~+536) 直接超预算。
2. **零行为风险**：`USE_VISITOR_FSM=false` 默认值意味着 R2 完成后 production code path **byte-for-byte 等同 d242719**；既有 `visitor-eating.test.js` (79 LOC) + `visitor-pressure.test.js` (246 LOC) 100% 保留绿。
3. **杠杆最大化**：复用 PriorityFSM 在第二种 entity type 上，证明 R1 wave-2 的"generic 抽取"投资有效；wave-4 (Animal) 在 round-3+ 接力时复制本轮模板即可。
4. **可观察性**：新增 `visitor-fsm-skeleton.test.js` + `visitor-fsm-invariants.test.js` lock skeleton 契约，round-3 wave-3.5 填充 STATE.tick body 时不需重写测试。
5. **enhancer 显式提示**：本任务 prompt 给出 "OR alternative scope: tighter. Just stage VisitorAISystem conversion to use PriorityFSM but keep StatePlanner shim for now (less risky); full migration later." — 方向 C 即为该路径。
6. **system_order_safe: true**：VisitorAISystem 仍是 SYSTEM_ORDER 中同一 slot；flag-gated 内部分支不改前后系统读写顺序；新建 fsm/Visitor*.js 是 npc/ 子目录文件不进 SYSTEM_ORDER。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/constants.js:FEATURE_FLAGS` — `add` — 在 `FEATURE_FLAGS` 对象内追加 1 行：`USE_VISITOR_FSM: false,`，紧接 `USE_FSM` 后；保持 `Object.freeze` 不变。
- [ ] **Step 2**: `src/simulation/npc/fsm/VisitorStates.js` — `add`（新文件）— 定义 `STATE_BEHAVIOR` (9 entries: IDLE / WANDERING / SEEK_TRADE / TRADE / SEEK_FOOD / EAT / SCOUT / SABOTAGE / EVADE) + `DISPLAY_LABEL` 9-row map。`STATE_BEHAVIOR.IDLE` 含 `onEnter` 设 `setIdleDesired(visitor)` 等价行为；`STATE_BEHAVIOR.WANDERING.tick` 调用 wander helper（暂不内联，仅 import 现有 `runWander`-shape stub 或委托空壳，flag=false 路径下绝不进入此 tick）；其余 7 STATE 仅 `tick: () => {}` 占位 + DISPLAY_LABEL 条目。**不**搬移现有 helpers 实体（保留在 VisitorAISystem.js 老路径所有权，下一轮再搬），避免本轮触发 +700 LOC 双向计入。
  - depends_on: 无
- [ ] **Step 3**: `src/simulation/npc/fsm/VisitorTransitions.js` — `add`（新文件）— `STATE_TRANSITIONS` 对象 9 个 key（每 state 1 行表头）；唯一启用的转换：`IDLE → WANDERING when (visitor) => true` (priority 1)；其余 8 个 STATE 转换数组为 `[]`（flag=true 时 visitor 进入这些 STATE 后停留 — round-3 填充）。
  - depends_on: Step 2
- [ ] **Step 4**: `src/simulation/npc/fsm/VisitorFSM.js` — `add`（新文件）— 照搬 `src/simulation/npc/fsm/WorkerFSM.js` 1-61 LOC 模式：`import { PriorityFSM } from "../PriorityFSM.js"`、`import { DISPLAY_LABEL, STATE_BEHAVIOR } from "./VisitorStates.js"`、`import { STATE_TRANSITIONS } from "./VisitorTransitions.js"`；class `VisitorFSM` 构造期 `new PriorityFSM({behavior, transitions, displayLabel, defaultState: "IDLE"})`；public method `tickVisitor(visitor, state, services, dt) { this._fsm.tick(...) }` + `getStats()` 委托。
  - depends_on: Step 2, Step 3
- [ ] **Step 5**: `src/simulation/npc/VisitorAISystem.js:1-12` — `edit` — 在现有 import 块追加 `import { FEATURE_FLAGS } from "../../config/constants.js";` + `import { VisitorFSM } from "./fsm/VisitorFSM.js";`。**不删** line 8-9 的 StatePlanner / StateGraph imports。
  - depends_on: Step 4
- [ ] **Step 6**: `src/simulation/npc/VisitorAISystem.js:617-621 (constructor)` — `edit` — 在 constructor 添加 `this._fsm = null;` 初始化；保留 `this.name = "VisitorAISystem"`。
  - depends_on: Step 5
- [ ] **Step 7**: `src/simulation/npc/VisitorAISystem.js:654-680 (update inner loop)` — `edit` — 在 `processed += 1;` 后 `const groupId = ...` 行**之前**插入 flag-gate：
  ```
  if (FEATURE_FLAGS.USE_VISITOR_FSM) {
    if (!this._fsm) this._fsm = new VisitorFSM();
    this._fsm.tickVisitor(visitor, state, services, logicDt);
    continue;
  }
  ```
  保留 656-679 现有逻辑完全不变（flag=false 路径走老 StatePlanner，byte-for-byte 与 d242719 等同）。
  - depends_on: Step 6
- [ ] **Step 8**: `test/visitor-fsm-skeleton.test.js` — `add`（新文件）— 测：(a) `new VisitorFSM()` 不抛；(b) `tickVisitor` 在 fresh visitor 上 init `visitor.fsm = { state: "IDLE", ... }`；(c) flag=false 时 VisitorAISystem.update() 不构造 `this._fsm`；(d) flag=true 时第二 tick 后 visitor.fsm.state === "WANDERING"（IDLE→WANDERING 转换触发）；(e) `visitor.stateLabel === DISPLAY_LABEL.WANDERING` 单写。覆盖 5 个 assertion。
  - depends_on: Step 4, Step 7
- [ ] **Step 9**: `test/visitor-fsm-invariants.test.js` — `add`（新文件）— 与 `test/priority-fsm-generic.test.js` 同模式但 VisitorFSM 端：(a) selfTransition (`when` 返回当前 state 名) 是 no-op + 不 bump transitionCount；(b) `getStats()` 返回 fresh 对象（mutate 不影响内部）；(c) 多次 tick 累计 tickCount；(d) `entity.fsm.target` / `payload` 在 transition 时被重置。
  - depends_on: Step 4

## 5. Risks

- **R1（低）**：FEATURE_FLAGS 是 `Object.freeze` — 需确认在 freeze 之前追加 `USE_VISITOR_FSM`。已在 constants.js 中验证 freeze 模式（参见 `USE_FSM` 同位置）。
- **R2（低）**：VisitorAISystem stride/phase 跳采样逻辑（623-650）发生在 flag-gate **之前** — flag=true 时 stride 跳采样仍生效，FSM tick 频率与老路径一致，不影响 trace parity。
- **R3（中）**：新建 `fsm/VisitorStates.js` 中的 `setIdleDesired` 调用需要 import 自 VisitorAISystem 或新做 helper；为 skeleton 简洁起见，选择 `VisitorStates.js` 不 import VisitorAISystem（避免循环依赖），IDLE.onEnter 留空 — flag=true 在 round-3 接力时再补行为。skeleton 仅锁 dispatcher 契约。
- **R4（低）**：`worker-fsm-doc-contract.test.js` (72 LOC) 锁 worker 端 doc 契约 — 本 plan 不动 WorkerFSM，无影响。
- **R5（低）**：`visitor-eating.test.js` / `visitor-pressure.test.js` — flag=false 默认意味着这两个测试走老 StatePlanner 路径，不动。
- 可能影响的现有测试：**0**（flag=false 默认，老路径不变）。

## 6. 验证方式

- **新增测试**：
  - `test/visitor-fsm-skeleton.test.js` 覆盖 facade 构造 + flag-gated dispatch + IDLE→WANDERING 转换 + stateLabel 单写
  - `test/visitor-fsm-invariants.test.js` 覆盖 selfTransition no-op + getStats 隔离 + tick 累计 + target/payload 重置
- **回归测试**：`node --test test/visitor-eating.test.js test/visitor-pressure.test.js test/priority-fsm-generic.test.js test/worker-fsm-doc-contract.test.js` 必须 100% 绿（flag 默认 false，老路径不动）。
- **全量测试**：`node --test test/*.test.js` 全量；baseline 1646 pass / 0 fail / 2 skip → 期望 1648 pass（+2 新测试套件，假设各含若干 it case，实际数会更高） / 0 fail / 2 skip。
- **手动验证**：开启 dev server `npx vite` → 加载 `http://localhost:5173`，跑 5 分钟 fertile_riverlands seed=42，观察 EntityFocusPanel 上 visitor `stateLabel` 与 d242719 baseline 一致（flag=false 默认）。
- **flag-on 抽查**（可选 Implementer 自验）：临时把 constants.js 改 `USE_VISITOR_FSM: true`，跑 dev server 30s，确认 visitor 可正常 IDLE→WANDERING 切换且不崩；改回 false 提交。
- **FPS 回归**：`browser_evaluate` 5 秒平均 ≥ 50（flag=false 与 baseline 等同；flag=true 引入 PriorityFSM kernel 走两次空 STATE.tick，单 tick 开销 < 10μs/visitor 可忽略）。
- **prod build**：`npx vite build` 无错；`vite preview` 3 分钟 smoke 无 console error。

## 7. 回滚锚点

- 当前 HEAD: `d242719`
- 起点 R0: `1f6ecc6 → d242719`（R0/R1 提交链）
- 一键回滚：`git reset --hard d242719`（仅当 Implementer 失败时由 orchestrator 触发）
- 最坏情况渐进回滚：仅删除 4 个新文件 + revert constants.js / VisitorAISystem.js 的 4 行 edit，可手动逐步回退而无需 hard reset。

## 8. UNREPRODUCIBLE 标记

不适用（C1 driven plan 跳过现场复现，feedback 由架构静态分析驱动）。

## 9. C1 对照表

| 旧（StatePlanner / StateGraph 路径） | 新（PriorityFSM 路径，wave-3 stage） | 备注 |
|---|---|---|
| `VisitorAISystem.js:8` `import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js"` | （保留 — flag=false 默认走老路径） | round-3 wave-3.5 填充完 STATE.tick body 后才 deprecate |
| `VisitorAISystem.js:9` `import { planEntityDesiredState } from "./state/StatePlanner.js"` | （保留） | 同上 |
| `planEntityDesiredState(visitor, state)` 返回 `{ desiredState, reason }` | `STATE_TRANSITIONS[currentState]` 数组 + `when()` callback | 计算"下个状态"从命令式表达式 → 数据表查表 |
| `transitionEntityState(visitor, groupId, plan.desiredState, ...)` 含 BFS 最短路 | `PriorityFSM._enterState`（直接 onExit→onEnter） | 删除 group-state-graph 路径搜索；priority-walk 直接转 |
| `mapStateToDisplayLabel(groupId, stateNode)` per-group lookup | `entity.stateLabel = DISPLAY_LABEL[fsm.state]` 单写 | dispatcher 内 single source of truth |
| `visitor.blackboard.intent = stateNode` 兼容字段 | `visitor.fsm.state` 直读 | UI/panels 兼容字段（debt-worker-3 28 hits）round-3 清理 |
| `visitor.debug.lastIntent = stateNode` | `visitor.fsm.state` 直读 | 同上 |
| 双 groupId（traders / saboteurs）独立 STATE_GRAPH | 单一 PriorityFSM 9 STATE 平面 | trader/saboteur 区分通过 `kind === VISITOR_KIND.TRADER` 在 transition `when()` 中读取 visitor.kind 实现，**不**做笛卡尔积 |
| `VisitorAISystem.update()` 658-679 5-way `if/else if` 分发 (`runEatBehavior` / `traderTick` / `saboteurTick` / `runWander` / `setIdleDesired`) | `STATE_BEHAVIOR[state].tick` 三件式 onEnter/tick/onExit | flag=true 路径下 — wave-3 stage 仅 IDLE/WANDERING；round-3 填充剩余 7 STATE |
| `groupId === "traders"` 路径 `seek_trade/trade` | `STATE.SEEK_TRADE` + `STATE.TRADE`（transition `when (v) => v.kind === VISITOR_KIND.TRADER && ...`） | round-3 填充 |
| `groupId === "saboteurs"` 路径 `scout/sabotage/evade` + `sabotageCooldown` | `STATE.SCOUT` + `STATE.SABOTAGE` + `STATE.EVADE`（transitions 读 `visitor.sabotageCooldown`） | round-3 填充 |

### system_order_safe 证据

- VisitorAISystem 在 `SYSTEM_ORDER`（src/config/constants.js）中位置不变。
- 新建 `fsm/VisitorFSM.js` / `fsm/VisitorStates.js` / `fsm/VisitorTransitions.js` 是 `VisitorAISystem` 内部依赖，**不进** SYSTEM_ORDER。
- VisitorAISystem 读 `state.agents` / `state.metrics.timeSec` / `state.controls.timeScale` / `state.grid` / `state.buildings` 等输入与 d242719 相同（flag=false 路径完全不动；flag=true 路径 dispatcher 仅多读 `state.metrics.timeSec` 一项，与 WorkerFSM 一致）。
- VisitorAISystem 写 `visitor.fsm` / `visitor.stateLabel` / `visitor.desiredVel` 等输出与 d242719 相同（`visitor.fsm` 是新写但 PriorityFSM 在 init 时设置，与 worker 模式相同；`visitor.stateLabel` 仍是单写但写入点从 `transitionEntityState→mapStateToDisplayLabel` 移到 dispatcher post-tick — flag=false 时仍走老路径不变）。
- 前后系统（VisibilitySystem 之后、AnimalAISystem 之前）的 read/write 关系不动。
- **结论**：`system_order_safe: true`。

### 预算审计

| 文件 | 类型 | LOC delta |
|---|---|---|
| `src/config/constants.js` | edit | +1 |
| `src/simulation/npc/fsm/VisitorStates.js` | add | +90 |
| `src/simulation/npc/fsm/VisitorTransitions.js` | add | +30 |
| `src/simulation/npc/fsm/VisitorFSM.js` | add | +60 |
| `src/simulation/npc/VisitorAISystem.js` | edit | +18 |
| `test/visitor-fsm-skeleton.test.js` | add | +80 |
| `test/visitor-fsm-invariants.test.js` | add | +60 |
| **总计** | — | **+339** |

339 < 400 hard budget。Margin = 61 LOC for unforeseen overhead.
