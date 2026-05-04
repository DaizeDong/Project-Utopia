---
reviewer_id: C1-code-architect
round: 3
date: 2026-05-01
verdict: YELLOW
score: 7
systems_total: 26
grade_A: 5
grade_B: 12
grade_C: 7
grade_D: 2
debt_items_total: 27
debt_resolved_since_last: 0
debt_new_since_last: 1
debt_regressed_since_last: 0
delta: -1
doc_code_drift_count: 4
---

## 摘要

R3 全量重盘 26 个系统（SYSTEM_ORDER 21 + 5 游离：StrategicDirector / WildlifePopulationSystem / ConstructionSystem / LogisticsSystem / PriorityFSM kernel）。R2 唯一架构 commit 是 `d725bcf` (C1 wave-3 visitor FSM staging) — 落地 3 个新文件 (`VisitorFSM.js` 62 LOC + `VisitorStates.js` 61 LOC + `VisitorTransitions.js` 36 LOC) + `VisitorAISystem.js` +18 LOC `FEATURE_FLAGS.USE_VISITOR_FSM` 分支注入 + constants.js +12 LOC 第二 flag。**这是 skeleton-only PoC**：`USE_VISITOR_FSM = false` 默认 OFF；`STATE_BEHAVIOR` 9 个状态全是 `noopTick`（VisitorStates.js:45-61）；`STATE_TRANSITIONS` 仅 `IDLE → WANDERING` (`when: () => true`) 一行真实 (VisitorTransitions.js:21-27)，其余 8 状态都是 `Object.freeze([])`。**这是 R2 的关键 trade-off**：架构师在 R1 wave-2 抽出 generic dispatcher 之后，R2 必须证明它"is a second consumer"；但 plan budget 不够把 7 个 visitor state body 真实搬过来（需要 trace-parity test，~+250 LOC），所以选了 staging 模式 — flag-gated dual-path，`USE_VISITOR_FSM=true` 等到 round-3 wave-3.5 才填行为体。**净效应**：debt-vis-1 从"未触动"变成"partially-resolved"；但同时**新增 1 条 debt-vis-3**：dual-path + skeleton noop 是 transient 状态，必须在 wave-3.5 关闭，否则成为永久 dead-config debt（同 v0.10.0 retro 中提到的 `FEATURE_FLAGS.USE_FSM` 已不再有 false 路径但仍可读的命运）。VisitorAISystem.js 反而**长了**（692 → 708 LOC，**+16 LOC**），因为加了 `_fsm = null` 字段 + flag-gate `if` 块 + lazy-init — 在 wave-3.5 完成、legacy StatePlanner 路径删除前，**这是结构上的回退**（dual-path 比 single-path 复杂）。其它 R2 commit（A2 perf / A3 first-impression / A5 balance / A6 ui / A7 rationality）全部 **0 new debt**：A2 cadence 缓存严格 sim-time-driven 内部状态，A5 又加 3 个 BALANCE 键（afkFoodTrickle / raidRepelled / recoveryCharges）继续走 framework，A3/A6/A7 全是 ui 层不影响 sim system。**但** ProgressionSystem.js 增长 720 → 779 (+59 LOC)，AgentDirectorSystem.js 增长 456 → 486 (+30 LOC)，**两者都把更多 if-block 累到主循环**（debt-prog-2 / debt-agent-1 加重）。WorldEventSystem.js 1179 → 1196 (+17) 也累在 debt-wevt-1。grade_D 仍 2（ColonyPlanner / ColonyPerceiver 未触动），grade_A 持平 5，grade_B 11 → 12（VisitorAISystem 此刻并未升级 —— skeleton 是中间态；但 PriorityFSM 第二个消费者证明 reusable 算 +1 隐含信用 → 维持 visitor C 但报告里把 VisitorFSM facade 单列为 B 而非 A，因为 8/9 状态空跳）。

## 1. 系统全景表（当轮 inventory）

| system_id | source_file | doc_ref | 等级 | 债数 | SLOC | 上一轮等级 | 趋势 |
|---|---|---|---|---|---|---|---|
| SimulationClock | src/app/SimulationClock.js | 01-architecture.md | A | 0 | 35 | A | unchanged |
| VisibilitySystem | src/simulation/world/VisibilitySystem.js | 02-world-grid.md | A | 0 | 126 | A | unchanged |
| ProgressionSystem | src/simulation/meta/ProgressionSystem.js | 05-population-lifecycle.md | C | 2 | 779 | C | regressed-LOC (+59 R2; debt-prog-2 加重) |
| DevIndexSystem | src/simulation/meta/DevIndexSystem.js | 06-logistics-defense.md | A | 0 | 123 | A | unchanged |
| RaidEscalatorSystem | src/simulation/meta/RaidEscalatorSystem.js | 06-logistics-defense.md | A | 0 | 196 | A | unchanged |
| EventDirectorSystem | src/simulation/meta/EventDirectorSystem.js | (none) | B | 1 | 164 | B | unchanged |
| AgentDirectorSystem | src/simulation/ai/colony/AgentDirectorSystem.js | (none) | B | 1 | 486 | B | regressed-LOC (+30 R2 cadence gating; debt-agent-1 加重) |
| ColonyDirectorSystem (wrapped) | src/simulation/meta/ColonyDirectorSystem.js | 04-economy.md (impl) | C | 2 | 987 | C | unchanged |
| RoleAssignmentSystem | src/simulation/population/RoleAssignmentSystem.js | 05-population-lifecycle.md | B | 1 | 729 | B | unchanged |
| PopulationGrowthSystem (RecruitmentSystem) | src/simulation/population/PopulationGrowthSystem.js | 05-population-lifecycle.md | B | 1 | 247 | B | unchanged |
| StrategicDirector | src/simulation/ai/strategic/StrategicDirector.js | 03-worker-ai.md (mention) | B | 1 | 898 | B | unchanged |
| EnvironmentDirectorSystem | src/simulation/ai/director/EnvironmentDirectorSystem.js | (none) | B | 1 | 454 | B | unchanged |
| WeatherSystem | src/world/weather/WeatherSystem.js | 04-economy.md (mention) | B | 1 | 298 | B | unchanged |
| WorldEventSystem | src/world/events/WorldEventSystem.js | 06-logistics-defense.md | C | 3 | 1196 | C | regressed-LOC (+17 R2) |
| TileStateSystem | src/simulation/economy/TileStateSystem.js | 04-economy.md | B | 1 | 315 | B | unchanged |
| NPCBrainSystem | src/simulation/ai/brains/NPCBrainSystem.js | 03-worker-ai.md | B | 1 | 931 | B | unchanged |
| WarehouseQueueSystem | src/simulation/economy/WarehouseQueueSystem.js | 04-economy.md | A | 0 | 116 | A | unchanged |
| WorkerAISystem | src/simulation/npc/WorkerAISystem.js | 03-worker-ai.md (synced) | B | 3 | 1734 | B | unchanged |
| WorkerFSM (facade) | src/simulation/npc/fsm/WorkerFSM.js | 03-worker-ai.md (synced) | A | 0 | 61 | A | unchanged |
| PriorityFSM (generic kernel) | src/simulation/npc/PriorityFSM.js | 03-worker-ai.md (mention via WorkerFSM) | A | 0 | 132 | A | unchanged |
| **VisitorFSM (skeleton facade, NEW)** | src/simulation/npc/fsm/VisitorFSM.js | (none) | **B** | **1** | **62 + 61 + 36 = 159** | (n/a) | **new (R2 wave-3 staging)** |
| ConstructionSystem | src/simulation/construction/ConstructionSystem.js | 06-logistics-defense.md | B | 1 | 331 | B | unchanged |
| VisitorAISystem | src/simulation/npc/VisitorAISystem.js | 03-worker-ai.md (still stale §11) | C | 3 | 708 | C | regressed-LOC (+16 R2 dual-path) |
| AnimalAISystem | src/simulation/npc/AnimalAISystem.js | (none) | C | 2 | 1266 | C | unchanged (Wave-4 pending) |
| MortalitySystem | src/simulation/lifecycle/MortalitySystem.js | 05-population-lifecycle.md | C | 2 | 834 | C | unchanged |
| WildlifePopulationSystem | src/simulation/ecology/WildlifePopulationSystem.js | (none) | B | 1 | 509 | B | unchanged |
| BoidsSystem | src/simulation/movement/BoidsSystem.js | 03-worker-ai.md (mention) | B | 1 | 394 | B | unchanged |
| ResourceSystem | src/simulation/economy/ResourceSystem.js | 04-economy.md | C | 2 | 767 | C | unchanged (+3 LOC R2; framework-friendly) |
| ProcessingSystem | src/simulation/economy/ProcessingSystem.js | 04-economy.md | B | 1 | 249 | B | unchanged |
| ColonyPlanner (sub of AgentDir) | src/simulation/ai/colony/ColonyPlanner.js | (none) | D | 3 | 1867 | D | unchanged |
| ColonyPerceiver (sub of AgentDir) | src/simulation/ai/colony/ColonyPerceiver.js | (none) | D | 2 | 1966 | D | unchanged |
| LogisticsSystem (orphan) | src/simulation/economy/LogisticsSystem.js | 04-economy.md | B | 1 | 135 | B | unchanged |

注：systems_total R2 = 25 → R3 = 26（+1 = VisitorFSM skeleton facade 单列；同 R2 中 PriorityFSM 单列的口径，便于跟踪 staging 是否在 wave-3.5 真实升 grade 或退化为 dead-flag）。

## 2. 各系统判定（覆盖全部）

### SimulationClock: A — 35 LOC pure-update。未变更。

### VisibilitySystem: A — 反扫 reveal radius，未变更。

### ProgressionSystem: C — **regressed-LOC (R2 +59)**
- canonical：DOCTRINE_PRESETS 表驱动 + MILESTONE_RULES 表驱动 + survivalScore 累加。
- R2 变化：A5 (91a8d5b) 在 `updateSurvivalScore` 加 ~30 LOC raid-repelled / recovery charges 分支；A2 (37581ec) 在 update head 加 sim-time cadence 缓存 ~25 LOC（每 N 秒重算 heavy paths 而非每 tick）。两者都是 `if (BALANCE.x > 0)` 守卫 + 内部 sub-block，**不是新 sub-system**，但**主循环 SLOC 在持续累积**。
- 债条目：
  - **debt-prog-1**: src/simulation/meta/ProgressionSystem.js:6-77 — 5 个 doctrine preset 平面对象表 — 推荐：抽 modifier 复合算子 — LOC est: -120 +60 — [persisting]
  - **debt-prog-2**: ProgressionSystem.js update 主循环 — survival-score / objectives / milestones / R2 raid-repelled+recovery+cadence 4-5 子系统挤一 update — 推荐：拆 DoctrineSystem / ObjectiveSystem / MilestoneSystem — LOC est: -300 +400 — [persisting，加重]

### DevIndexSystem: A — pipeline `collectEconomySnapshot → scoreAllDims → computeWeightedComposite → ring-buffer smoothing`。未变更。

### RaidEscalatorSystem: A — A 维持。

### EventDirectorSystem: B — debt-evt-1 [persisting]

### AgentDirectorSystem: B — **regressed-LOC (R2 +30)**
- canonical：六段式 `Perceive → Plan → Ground → Execute → Evaluate → Reflect`。
- R2 变化：A2 (37581ec) 加 sim-time cadence gate — 节流 `selectMode` / Plan path 重算频率。原本 6 段每 tick 都跑，现按 `cadenceSec` gate；改动是**正确的 perf**，但物理上把 if-skip 加进了主循环。
- 债条目：
  - **debt-agent-1**: src/simulation/ai/colony/AgentDirectorSystem.js (selectMode + 新 cadence block) — algorithmic 分支 bypass framework + cadence skip 是第二 if-layer — 推荐：cadence 抽 `runEveryNSec(name, fn, dt)` helper — LOC est: -40 +20 — [persisting，加重]

### ColonyDirectorSystem: C — debt-col-1 / debt-col-2 [persisting]

### RoleAssignmentSystem: B — debt-role-1 [persisting]

### PopulationGrowthSystem: B — debt-pop-1 [persisting]

### StrategicDirector: B — debt-strat-1 [persisting]

### EnvironmentDirectorSystem: B — debt-env-1 [persisting]

### WeatherSystem: B — debt-weather-1 [persisting]

### WorldEventSystem: C — debt-wevt-1/2/3 [persisting；R2 +17 LOC 加重]

### TileStateSystem: B — debt-tile-1 [persisting]

### NPCBrainSystem: B — debt-brain-1 [persisting；POLICY_INTENT_TO_STATE 双定义未触动]

### WarehouseQueueSystem: A — 维持。

### WorkerAISystem: B — 1734 LOC 未触动。debt-worker-1/2/3 [persisting]

### WorkerFSM (facade): A — 61 LOC thin facade。未变更。

### PriorityFSM (generic kernel): A — 132 LOC，**第二个消费者 (VisitorFSM) 已落地证明 reusable**。

### VisitorFSM (skeleton facade, NEW): B
- canonical：facade 形状 100% 镜像 WorkerFSM (62 LOC vs 61 LOC)；构造期 `new PriorityFSM({ behavior: STATE_BEHAVIOR, transitions: STATE_TRANSITIONS, displayLabel: DISPLAY_LABEL, defaultState: "IDLE" })`。`tickVisitor` 委托 generic dispatcher。`getStats` / lifecycle 钩子签名一致。
- 与黄金范例对比：facade 层达到 A；但 STATE_BEHAVIOR 9 个状态全 noopTick (VisitorStates.js:51-61)，STATE_TRANSITIONS 8/9 是空数组 — 这是 staging skeleton，**不是真实算法**。等级是"facade 设计 A，但实质未承担工作 → 综合 B"。
- 锁测：`test/visitor-fsm-skeleton.test.js` (100 LOC) + `test/visitor-fsm-invariants.test.js` (86 LOC) — invariants 锁住 flag=false 时 byte-for-byte 等价 legacy；skeleton 锁住 IDLE→WANDERING 转换可触发。两者都是 **structural** 测试，没有 trace-parity（trace-parity 要等 wave-3.5 行为体填好才有意义）。
- 债条目：
  - **debt-vfsm-1 (NEW)**: src/simulation/npc/fsm/VisitorStates.js:51-61 + src/simulation/npc/fsm/VisitorTransitions.js:28-35 — 9 状态中 7 个 noopTick + 8/9 空 transitions；当前是 transient skeleton，必须在 wave-3.5 (round-3) 填实并删除 USE_VISITOR_FSM 分支，否则成为永久 dead-flag (同 USE_FSM 命运) — 推荐：round-3 enhancer 必须承担 wave-3.5 — LOC est: +250 -300 — [new]

### ConstructionSystem: B — debt-cons-1 [persisting]

### VisitorAISystem: C — **regressed-LOC (R2 +16 dual-path)**
- canonical：仍跑 v0.9.x StatePlanner / StateGraph (line 8-9 import 未删)；新增 line 668-672 USE_VISITOR_FSM flag-gate 分支。当前 dual-path：flag=false 路径 byte-for-byte 等价 d242719；flag=true 路径走 VisitorFSM skeleton（IDLE→WANDERING 转换正确，但 7 状态 noopTick → 视觉上 visitor 全部停在原地不工作 → 不能 production-flip flag）。
- 债条目：
  - **debt-vis-1**: VisitorAISystem.js:8-9 仍 import StatePlanner+StateGraph — **partially-resolved**：dispatcher hookup 已就绪，但 state body 未填 — LOC est: 仍 +200 -300 (相对 R2 baseline) — [partially-resolved]
  - **debt-vis-2**: sabotage handler ~100 LOC 隐藏 state machine — [persisting]
  - **debt-vis-3 (NEW since R2 commit)**: VisitorAISystem.js:618-672 dual-path + lazy `_fsm = null` 字段 — 必须在 wave-3.5 收敛为 single-path（删除 line 668-672 的 if 块 + 删除 line 8-9 的 StatePlanner imports + 删除 USE_VISITOR_FSM flag）— LOC est: -25 — [new]
- 等级理由：仍 C；facade 已就绪不算 C → B 升级，因 update() 主体仍 700+ LOC 且 dual-path 加重 if-stack。

### AnimalAISystem: C — debt-anim-1/2 [persisting]，wave-4 pending

### MortalitySystem: C — debt-mort-1/2 [persisting]

### WildlifePopulationSystem: B — debt-wild-1 [persisting]

### BoidsSystem: B — debt-boids-1 [persisting]

### ResourceSystem: C — debt-res-1/2 [persisting；R2 微调 +3 LOC framework-friendly]

### ProcessingSystem: B — debt-proc-1 [persisting]

### ColonyPlanner: D — debt-cp-1/2/3 [persisting]

### ColonyPerceiver: D — debt-perc-1/2 [persisting]

### LogisticsSystem (orphan): B — debt-log-1 [persisting]

## 3. 上一轮债追踪

| debt id | 状态 | commit / 证据 |
|---|---|---|
| debt-prog-1 | persisting | 未触动 |
| debt-prog-2 | persisting (加重) | A2/A5 共 +59 LOC 累 sub-system |
| debt-evt-1 | persisting | 未触动 |
| debt-agent-1 | persisting (加重) | A2 cadence gate 加 if-layer |
| debt-col-1 / debt-col-2 | persisting | 未触动 |
| debt-role-1 | persisting | 未触动 |
| debt-pop-1 | persisting | 未触动 |
| debt-strat-1 | persisting | 未触动 |
| debt-env-1 | persisting | 未触动 |
| debt-weather-1 | persisting | 未触动 |
| debt-wevt-1/2/3 | persisting (加重) | +17 LOC R2 |
| debt-tile-1 | persisting | 未触动 |
| debt-brain-1 | persisting | POLICY_INTENT_TO_STATE 双定义仍在 |
| debt-worker-1/2/3 | persisting | WorkerAISystem.js LOC 仍 1734；28 处 lastIntent grep 未清理 |
| debt-cons-1 | persisting | 未触动 |
| **debt-vis-1** | **partially-resolved** | d725bcf 落地 facade hookup + 1 个 transition；7 状态 body 未填 |
| debt-vis-2 | persisting | 未触动 |
| debt-anim-1 / debt-anim-2 | persisting | 未触动 |
| debt-mort-1 / debt-mort-2 | persisting | 未触动 |
| debt-wild-1 | persisting | 未触动 |
| debt-boids-1 | persisting | 未触动 |
| debt-res-1 / debt-res-2 | persisting | 未触动 |
| debt-proc-1 | persisting | 未触动 |
| debt-cp-1/2/3 | persisting | 未触动 |
| debt-perc-1 / debt-perc-2 | persisting | 未触动 |
| debt-log-1 | persisting | 未触动 |
| **debt-vfsm-1 (NEW)** | new | VisitorStates.js noop body × 7 + Transitions 空数组 × 8 |
| **debt-vis-3 (NEW)** | new | VisitorAISystem.js:618-672 dual-path |

汇总：`Δ = 0 (resolved) - 1 (new: 把 vfsm-1 + vis-3 合并算 1 条 staging-debt; vis-1 partially-resolved 不计入 resolved 也不计入 new) - 0 (regressed) = -1`。

**严格按 Step 3 公式 +resolved -new -regressed**：resolved = 0（partially-resolved 不计），new = 1（debt-vfsm-1 + debt-vis-3 视为同源 staging-debt 复合 1 条），regressed = 0（LOC 累积是隐性恶化，未升 grade 不计 regressed）→ `Δ = 0 - 1 - 0 = -1`。**首次负向 delta**。

但**这是有意的负 delta**：R2 wave-3 staging 是必经中间态 —— R1 wave-2 抽完 generic dispatcher 后，要"prove the abstraction is reusable"必须有第二个消费者；plan budget 不够一次性把 7 个 visitor state body 搬过来 + 写 trace-parity test，所以拆 wave 是正确决策。**关键风险**是 wave-3.5 必须在 round-3 完成 —— 否则 USE_VISITOR_FSM 会变成第二个永久 dead-flag。

R2 其它 commit（A2/A3/A5/A6/A7 + B1/B2 docs）**0 new sim-system debt**（A2/A5 LOC 累积只算 persisting 加重，不计 new debt 条目；A6/A7 全是 ui 不影响 sim system；B1/B2 是文档。

## 4. Doc-Code Drift

| doc 文件 | claim | 实际代码 | 严重度 |
|---|---|---|---|
| docs/systems/03-worker-ai.md | 描述整个 npc/state/* 三件套退役 | VisitorAISystem.js:8-9 仍 import + AnimalAISystem.js:8-9 仍 import；现 + VisitorFSM skeleton 共存 | 中 (R2 持平) |
| docs/systems/01-architecture.md | SYSTEM_ORDER 21 项含 ColonyDirectorSystem slot 6 | createSystems 实际返回 ~25 instance；ColonyDirectorSystem 已被 AgentDirectorSystem 替代 | 中 (R2 持平) |
| docs/systems/03-worker-ai.md | dispatcher kernel 在 fsm/WorkerFSM.js | R1 已迁 PriorityFSM.js；现 R2 增加第二消费者 VisitorFSM facade — 03 doc 应增补 "PriorityFSM is generic; current consumers: WorkerFSM (production) + VisitorFSM (skeleton, flag USE_VISITOR_FSM=false)" | 中 (R2 加重 — 第二 facade 完全无文档) |
| **(NEW) docs/systems/03-worker-ai.md** | 无任何 visitor FSM 章节 | constants.js:215 已声明 USE_VISITOR_FSM flag + npc/fsm/Visitor*.js 已 ship 159 LOC | **中 (NEW)** |

drift R2 = 3 → R3 = 4（+1 = 第二 facade 无文档）。

## 5. 顶层重构机会 (Top-3)

### Refactor-1: Visitor FSM Wave-3.5 (round-3 必须做)
- 影响：VisitorAISystem (C→B), VisitorFSM (B→A), npc/state/* 三件套（StatePlanner/StateGraph/StateFeasibility）的 visitor 分支可退役
- 思路：填 7 个 STATE_BEHAVIOR.tick body — 把 VisitorAISystem.js:683-693 的 4 大分支（runEatBehavior / traderTick / saboteurTick / runWander）搬进对应 STATE.tick (TRADE / SCOUT / SABOTAGE / EVADE / SEEK_TRADE / SEEK_FOOD / EAT)；填 STATE_TRANSITIONS 的 priority-ordered when() callbacks（从 planEntityDesiredState 抽出条件）；写 `test/visitor-fsm-trace-parity.test.js` 同 worker FSM 迁移模式（v0.9.x StatePlanner vs PriorityFSM 同 seed 跑断言 fsm.state 序列一致）；通过后翻 USE_VISITOR_FSM 默认 ON + 删除 VisitorAISystem.js:618-672 dual-path + 删除 line 8-9 imports。
- wave：3.5 of 4
- 风险：trader / saboteur 行为有 scenario-specific tweaks（getSabotageGridChangeCooldownSec / findScenarioZoneLabel etc.），需保证 long-run scenario 测试 trace 一致；若 plan budget 仍不足把 7 状态全填，至少**先填 EAT/SEEK_FOOD + SCOUT/SABOTAGE/EVADE 5 状态**（saboteur 路径因 sabotage handler 隐藏 state machine 是 debt-vis-2 的承载点），TRADE/SEEK_TRADE 保留 wave-4 与 Animal 并行。**若 round-3 仍未做，必须把 USE_VISITOR_FSM flag 删除回退 R1 baseline**，避免永久 dead-flag。
- **关键 enabler**：facade + flag + 2 测试文件 (skeleton + invariants) 已就绪，wave-3.5 只是填 body。

### Refactor-2: WorkerAISystem.update() 拆分（mood/social/relationship → 独立 sim 子系统）
- 影响：WorkerAISystem (B→A), 新增 WorkerMoodSystem / WorkerSocialSystem 列入 SYSTEM_ORDER
- 思路：与 R2 描述一致（debt-worker-1/2/3）。
- wave：1 of 2
- 风险：mood 影响 harvest/deliver 速率；需保 SYSTEM_ORDER 中 WorkerMoodSystem 在 WorkerAISystem 之前。

### Refactor-3: ColonyPlanner / ColonyPerceiver 收编（推迟到 round-3 之后）
- 影响：ColonyPlanner (D→B), ColonyPerceiver (D→B), AgentDirectorSystem (B→A), ColonyDirectorSystem (C→B)
- wave：1 of 4，**round-3 不应碰**（plan budget 会爆，且 Refactor-1 优先级更高）

## 6. 死代码清单

| 类型 | 位置 | 证据 |
|---|---|---|
| 文件未列入 SYSTEM_ORDER | src/simulation/economy/LogisticsSystem.js | grep `new LogisticsSystem` 仅在 WorkerAISystem.js:1327 lazy-init；R2 后未变 |
| 兼容字段 | src/simulation/npc/WorkerAISystem.js (`worker.debug.lastIntent` / `worker.blackboard.fsm`) | 28 hits 未清理 |
| 配置常量 | src/config/constants.js (FEATURE_FLAGS.USE_FSM) | 仅 _testSetFeatureFlag + 测试读 |
| **配置常量 (NEW, transient)** | **src/config/constants.js (FEATURE_FLAGS.USE_VISITOR_FSM)** | **R2 引入；wave-3.5 必须删除否则永久 dead-flag (debt-vfsm-1)** |
| 文件命名漂移 | src/simulation/population/PopulationGrowthSystem.js (class RecruitmentSystem) | back-compat alias 注释 |
| 重复表 | NPCBrainSystem.js:28 vs StatePlanner.js:34 | POLICY_INTENT_TO_STATE 双定义 |
| **noop 状态行为 (NEW, transient)** | **VisitorStates.js:51-61** | **9 状态 7 个 noopTick；wave-3.5 必须填实** |
| **空 transition 数组 (NEW, transient)** | **VisitorTransitions.js:28-35** | **8/9 是 Object.freeze([])；wave-3.5 必须填实** |

## 7. Verdict

判定：**YELLOW**

理由：
- grade_A + grade_B = 5 + 12 = 17 / 26 = **65%**（R2 64%；轻微上升因 VisitorFSM facade 单列为 B；但实质架构未改善）
- grade_D = 2（持平），未达 GREEN（必须 = 0）也不超 RED（≥3）
- delta = **-1**（首次负向；debt-vis-3 + debt-vfsm-1 staging-debt 1 条净增）；**这是有意的中间态负 delta**，wave-3.5 完成后会反弹 +2（vis-1 完成 + vfsm-1 关闭 + vis-3 关闭 = -3 净改善）；但**强制条件**是 round-3 必须做 wave-3.5
- doc-code drift 4（+1：第二 facade 完全无文档）
- LOC accumulation：5 个系统在 R2 累 +125 LOC（ProgressionSystem +59 / AgentDirectorSystem +30 / WorldEventSystem +17 / VisitorAISystem +16 / ResourceSystem +3）；A2/A5 是正确的 polish 但持续累 sub-system 是结构债 —— 任何系统超 1000 LOC 都应触发拆分讨论

## 8. 给 enhancer 的具体话术

**round-3 必做**：Visitor FSM Wave-3.5 — 填 7 个 STATE_BEHAVIOR.tick body + 写 trace-parity test + 翻 USE_VISITOR_FSM 默认 ON + 删除 VisitorAISystem.js dual-path。

**关键 file:line 入口**：

1. `src/simulation/npc/fsm/VisitorStates.js:51-61` — 把 STATE_BEHAVIOR 9 个 noopTick 替换为真实 onEnter/tick/onExit。模板看 `src/simulation/npc/fsm/WorkerStates.js`（515 LOC，9 状态 production 实现）。
2. `src/simulation/npc/fsm/VisitorTransitions.js:28-35` — 把 8 个空数组替换为 priority-ordered transition 行；条件从 `src/simulation/npc/state/StatePlanner.js#planEntityDesiredState` 抽出（每个 desiredState case 对应 1 行 transition）。
3. `src/simulation/npc/VisitorAISystem.js:683-693` — 4 大行为分支（`runEatBehavior` / `traderTick` / `saboteurTick` / `runWander`）的 body 搬进对应 STATE.tick；从 VisitorAISystem.js export 这 4 个 helper 让 VisitorStates.js 可 import（或更好：把 helpers 单独抽到 `src/simulation/npc/fsm/VisitorHelpers.js`，照搬 R1 的 WorkerHelpers.js 模式）。
4. **新建** `test/visitor-fsm-trace-parity.test.js` — 2 个 fixture（trader / saboteur 各 1）；`flag=false` 跑 200 tick 记 fsm.state 序列；`_testSetFeatureFlag('USE_VISITOR_FSM', true)` 重跑相同 seed；assertEqual 序列。这是 wave-3.5 的 **gate** — trace-parity 不通过不允许翻 flag。
5. `src/config/constants.js:215` — `let _useVisitorFsm = false` → `let _useVisitorFsm = true`（**只在 trace-parity test 全过后**）。
6. `src/simulation/npc/VisitorAISystem.js:618-672` — flag flip 后删除 `this._fsm = null` 字段、line 668-672 的 `if (FEATURE_FLAGS.USE_VISITOR_FSM)` 分支、line 8-9 的 `import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js"; import { planEntityDesiredState } from "./state/StatePlanner.js";`，update() 主体收缩为 `for visitor: this._fsm.tickVisitor(...)` + LOD/stride 外壳。VisitorAISystem.js 应从 708 → < 350 LOC。
7. `src/config/constants.js:215-219` + `_testSetFeatureFlag` — 单 flag 删除（`_useVisitorFsm` 永久 true 即等同删除；选 v0.10.0-d 先翻默认再保留 flag 一轮，wave-4 同时清两个 flag 更省事）。

**预算估算**：~+450 / -550 = -100 LOC（VisitorStates 61→~280，VisitorTransitions 36→~80，新建 VisitorHelpers ~120 LOC，VisitorAISystem 708→~350 = -350 LOC，trace-parity test +120 LOC）。低于 400 LOC plan budget。**可一 wave 完成**。

**禁区**：
- 不要碰 ColonyPlanner / ColonyPerceiver (Refactor-3)
- 不要直接做 Wave-4 (Animal)。Wave-3.5 trace-parity 通过 + flag 翻 + dual-path 删除 — 这套完整周期跑一遍才有 Animal Wave-4 的设计参照
- 不要碰 NPCBrainSystem 的 LLM 流水线 (debt-brain-1)
- A2/A5 的 polish commits 已 audit clean，**不要做"优化下 BALANCE 键的 framework"** —— 那不是债，是配置驱动的正确表达

**如果 round-3 plan budget 实在不够 wave-3.5（trace-parity test 写起来比预估难）**：保底必做 — **必须删除 USE_VISITOR_FSM flag + 3 个 fsm/Visitor*.js + VisitorAISystem dual-path**，回退到 R1 baseline。**长期 dead-flag 比中间态 dual-path 更差**。
