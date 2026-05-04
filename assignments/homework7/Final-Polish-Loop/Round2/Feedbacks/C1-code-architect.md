---
reviewer_id: C1-code-architect
round: 2
date: 2026-05-01
verdict: YELLOW
score: 7
systems_total: 25
grade_A: 5
grade_B: 11
grade_C: 7
grade_D: 2
debt_items_total: 26
debt_resolved_since_last: 2
debt_new_since_last: 0
debt_regressed_since_last: 0
delta: +2
doc_code_drift_count: 3
---

## 摘要（一段）

Round 2 全量重盘 25 个系统（SYSTEM_ORDER 21 项 + 4 个游离系统：StrategicDirector / WildlifePopulationSystem / ConstructionSystem / LogisticsSystem）。**Round 1 wave-2 (commit 439b120) 真正动了 src 层架构**：(1) 新建 `src/simulation/npc/PriorityFSM.js` (132 LOC) 把 WorkerFSM 的 dispatcher kernel 提取成 generic `PriorityFSM<StateName>` class，构造期注入 behavior / transitions / displayLabel / defaultState，是 Refactor-1 Wave-1 的完整落地；(2) `src/simulation/npc/fsm/WorkerFSM.js` 从 124 → 61 LOC 收缩为 thin facade，`tickWorker` / `getStats` 签名 100% 保留，调用站点零改动；(3) `__devForceSpawnWorkers` (90 LOC) 迁出到 `src/dev/forceSpawn.js`，原 `PopulationGrowthSystem.js` 留 1 行 re-export shim — Round 1 唯一新债 **debt-pop-2 resolved**。**WorkerFSM 升级 A → A++**（此前已是黄金范例，本轮成为可复用框架），新加入的 PriorityFSM 拿独立 A 评级（dispatcher 自成一体、generic、被独立 test/priority-fsm-generic.test.js 锁测）— 因此 grade_A 4 → 5。**Round 1 wave-2 直接关闭 2 条 debt**：debt-pop-2 (Round 1 唯一 new) 和 R1 提出的"generic dispatcher 抽取"前置工作。Round 1 其它 commits（A2 perf SceneRenderer + A5 balance + A3 first-impression + A6 ui + A7 rationality）**没有引入新架构债**：A2 的 5 个 instance-scope scratch buffers (`this._labelProjectedScratch` 等) 严格按"per-instance, length=0/clear() 复用"模式（PreToolUse 抽查 SceneRenderer.js:573-587），无 module-scope 全局；A5 加的 4 个 BALANCE 键（workerHungerDecayWhenFoodZero, warehouseWoodSpoilageRatePerSec, survivalScorePerProductiveBuildingSec, autopilotQuarryEarlyBoost）都是**配置驱动**而非分支补丁，每个使用点都是 `Number(BALANCE.x ?? 0)` 守卫 + 已存在子系统内的小段 if 块（ResourceSystem 392-403/421-441, ProgressionSystem 545-567, ColonyDirectorSystem 174-186），未拓宽 system 主循环结构。**核心残债面貌仍未变**：VisitorAISystem.js:8-9 + AnimalAISystem.js:8-9 仍 import StatePlanner / StateGraph (debt-vis-1 / debt-anim-1 — Refactor-1 Wave-3/4 待做)；WorkerAISystem.js 仍 1734 LOC 含 ~250 LOC mood/social 补丁块 (debt-worker-1)；ColonyPlanner (1867) + ColonyPerceiver (1966) 仍是 D 级。

## 1. 系统全景表（当轮 inventory）

| system_id | source_file | doc_ref | 等级 | 债数 | SLOC | 上一轮等级 | 趋势 |
|---|---|---|---|---|---|---|---|
| SimulationClock | src/app/SimulationClock.js | 01-architecture.md | A | 0 | 35 | A | unchanged |
| VisibilitySystem | src/simulation/world/VisibilitySystem.js | 02-world-grid.md | A | 0 | 126 | A | unchanged |
| ProgressionSystem | src/simulation/meta/ProgressionSystem.js | 05-population-lifecycle.md | C | 2 | 720 | C | unchanged (+23 LOC, A5 productive-building bonus, framework-friendly) |
| DevIndexSystem | src/simulation/meta/DevIndexSystem.js | 06-logistics-defense.md | A | 0 | 123 | A | unchanged |
| RaidEscalatorSystem | src/simulation/meta/RaidEscalatorSystem.js | 06-logistics-defense.md | A | 0 | 196 | A | unchanged |
| EventDirectorSystem | src/simulation/meta/EventDirectorSystem.js | (none) | B | 1 | 164 | B | unchanged |
| AgentDirectorSystem | src/simulation/ai/colony/AgentDirectorSystem.js | (none) | B | 1 | 456 | B | unchanged |
| ColonyDirectorSystem (wrapped) | src/simulation/meta/ColonyDirectorSystem.js | 04-economy.md (impl) | C | 2 | 987 | C | unchanged (+6 LOC, A5 P0-4 earlyBoost) |
| RoleAssignmentSystem | src/simulation/population/RoleAssignmentSystem.js | 05-population-lifecycle.md | B | 1 | 729 | B | unchanged |
| PopulationGrowthSystem (RecruitmentSystem) | src/simulation/population/PopulationGrowthSystem.js | 05-population-lifecycle.md | B | 1 | 247 | B | improved (debt-pop-2 resolved by 439b120; -85 LOC) |
| StrategicDirector | src/simulation/ai/strategic/StrategicDirector.js | 03-worker-ai.md (mention) | B | 1 | 898 | B | unchanged |
| EnvironmentDirectorSystem | src/simulation/ai/director/EnvironmentDirectorSystem.js | (none) | B | 1 | 454 | B | unchanged |
| WeatherSystem | src/world/weather/WeatherSystem.js | 04-economy.md (mention) | B | 1 | 298 | B | unchanged |
| WorldEventSystem | src/world/events/WorldEventSystem.js | 06-logistics-defense.md | C | 3 | 1179 | C | unchanged |
| TileStateSystem | src/simulation/economy/TileStateSystem.js | 04-economy.md | B | 1 | 315 | B | unchanged |
| NPCBrainSystem | src/simulation/ai/brains/NPCBrainSystem.js | 03-worker-ai.md | B | 1 | 931 | B | unchanged |
| WarehouseQueueSystem | src/simulation/economy/WarehouseQueueSystem.js | 04-economy.md | A | 0 | 116 | A | unchanged |
| WorkerAISystem | src/simulation/npc/WorkerAISystem.js | 03-worker-ai.md (synced ✓) | B | 3 | 1734 | B | unchanged |
| WorkerFSM (facade) | src/simulation/npc/fsm/WorkerFSM.js | 03-worker-ai.md (synced ✓) | A | 0 | 61 | A | improved (now thin facade over generic) |
| **PriorityFSM (generic, NEW)** | src/simulation/npc/PriorityFSM.js | 03-worker-ai.md (mention via WorkerFSM) | **A** | 0 | 132 | (n/a) | **new (R1 wave-2)** |
| ConstructionSystem | src/simulation/construction/ConstructionSystem.js | 06-logistics-defense.md | B | 1 | 331 | B | unchanged |
| VisitorAISystem | src/simulation/npc/VisitorAISystem.js | 03-worker-ai.md (still stale §11) | C | 2 | 692 | C | unchanged (Wave-3 pending) |
| AnimalAISystem | src/simulation/npc/AnimalAISystem.js | (none) | C | 2 | 1266 | C | unchanged (Wave-4 pending) |
| MortalitySystem | src/simulation/lifecycle/MortalitySystem.js | 05-population-lifecycle.md | C | 2 | 834 | C | unchanged |
| WildlifePopulationSystem | src/simulation/ecology/WildlifePopulationSystem.js | (none) | B | 1 | 509 | B | unchanged |
| BoidsSystem | src/simulation/movement/BoidsSystem.js | 03-worker-ai.md (mention) | B | 1 | 394 | B | unchanged |
| ResourceSystem | src/simulation/economy/ResourceSystem.js | 04-economy.md | C | 2 | 764 | C | unchanged (+34 LOC, A5 P0-1+P0-3 spoilage/hunger-decay; framework-friendly) |
| ProcessingSystem | src/simulation/economy/ProcessingSystem.js | 04-economy.md | B | 1 | 249 | B | unchanged |
| ColonyPlanner (sub of AgentDir) | src/simulation/ai/colony/ColonyPlanner.js | (none) | D | 3 | 1867 | D | unchanged |
| ColonyPerceiver (sub of AgentDir) | src/simulation/ai/colony/ColonyPerceiver.js | (none) | D | 2 | 1966 | D | unchanged |
| LogisticsSystem (orphan) | src/simulation/economy/LogisticsSystem.js | 04-economy.md | B | 1 | 135 | B | unchanged |

注：systems_total 仍为 25（Round 1 + 1 new PriorityFSM = 26 严格说，但 PriorityFSM 是 WorkerFSM 的依赖、不是 SYSTEM_ORDER 入口的独立系统，故合并计为"WorkerFSM facade + PriorityFSM kernel"一栏头算单系统但分两行展示 — frontmatter 计 25 与 R1 持平口径，避免单纯重命名造成 systems_total 漂移）。

## 2. 各系统判定（覆盖全部）

### SimulationClock: A — 35 LOC 极简 pure-update。未变更。

### VisibilitySystem: A — 反扫 reveal radius 写 fog 数组。未变更。

### ProgressionSystem: C
- canonical algorithm：DOCTRINE_PRESETS 表驱动 + MILESTONE_RULES 表驱动 + survivalScore 累加。
- Round 1 变化：A5 (f385318) 在 `updateSurvivalScore` 末加 23 LOC P0-2 (perBuilding × productive × ticks)，逻辑就是把额外 summand 累到同一个 metric 上 — **没有引入新分支补丁、没有新增 score sub-system**。属于 framework 内表达（按 BALANCE 配置启用）。
- 债条目：
  - **debt-prog-1**: src/simulation/meta/ProgressionSystem.js:6-77 — 5 个 doctrine preset 平面对象表 — 推荐：抽 modifier 复合算子 — LOC est: -120 +60 — [persisting]
  - **debt-prog-2**: src/simulation/meta/ProgressionSystem.js (update 主循环) — survival-score / objectives / milestones 三子系统挤一 update — 推荐：拆 DoctrineSystem / ObjectiveSystem / MilestoneSystem — [persisting]

### DevIndexSystem: A — pipeline `collectEconomySnapshot → scoreAllDims → computeWeightedComposite → ring-buffer smoothing` 教科书级 A。未变更。

### RaidEscalatorSystem: A — A 维持。

### EventDirectorSystem: B
- **debt-evt-1**: src/simulation/meta/EventDirectorSystem.js:28-34 — `NON_RAID_FALLBACK_ORDER` 硬编码 — [persisting]

### AgentDirectorSystem: B
- canonical algorithm：六段式 `Perceive → Plan → Ground → Execute → Evaluate → Reflect`。
- **debt-agent-1**: src/simulation/ai/colony/AgentDirectorSystem.js:13 + selectMode — algorithmic 分支 bypass framework — [persisting]

### ColonyDirectorSystem (algorithmic fallback): C
- Round 1 变化：A5 (f385318) 在 `assessColonyNeeds` 加 12 LOC `earlyBoost` for quarry / herb_garden（174-186）— 仅微调两 priority 数字，**没有引入新 if 类型**。
- **debt-col-1**: src/simulation/meta/ColonyDirectorSystem.js:84-(700+) — assessColonyNeeds 长串 if-needs.push — 推荐：BuildHeuristic 策略对象 — LOC est: -350 — [persisting]
- **debt-col-2**: phase 由硬编码 `farms >= N && warehouses >= M` 判定 — [persisting]

### RoleAssignmentSystem: B — debt-role-1 [persisting]

### PopulationGrowthSystem (RecruitmentSystem): B（**debt 数 2 → 1，pop-2 resolved**）
- Round 1 变化：commit 439b120 把 `__devForceSpawnWorkers` (90 LOC) 迁出到 `src/dev/forceSpawn.js`；原 file 留 1 行 re-export shim (`export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js"`)。**debt-pop-2 完全 resolved**：业务模块不再托管 dev-only helper。
- 残留债：
  - **debt-pop-1**: src/simulation/population/PopulationGrowthSystem.js:1-12 — 文件名 `PopulationGrowthSystem.js` 与 class `RecruitmentSystem` 不一致，需 export alias hack — [persisting]

### StrategicDirector: B — debt-strat-1 [persisting]

### EnvironmentDirectorSystem: B — debt-env-1 [persisting]

### WeatherSystem: B — debt-weather-1 [persisting]

### WorldEventSystem: C — debt-wevt-1 / debt-wevt-2 / debt-wevt-3 [persisting]

### TileStateSystem: B — debt-tile-1 [persisting]

### NPCBrainSystem: B — debt-brain-1 (POLICY_INTENT_TO_STATE 双定义) [persisting]

### WarehouseQueueSystem: A — A 维持。

### WorkerAISystem: B — 1734 LOC 未触动。
- **debt-worker-1**: WorkerAISystem.js:1500-1680 mood/social/relationship ~250 LOC 非状态机块 — [persisting]
- **debt-worker-2**: helpers 仍 export 自 WorkerAISystem — [persisting]
- **debt-worker-3**: 28 个 grep hits for `worker.debug.lastIntent` / `blackboard.fsm` 横跨 ui/panels (EntityFocusPanel / InspectorPanel)、ai/brains/NPCBrainAnalytics、ai/memory/WorldSummary、npc/state/StateGraph、npc/AnimalAISystem、npc/VisitorAISystem、npc/WorkerAISystem、entities/EntityFactory、population/RoleAssignmentSystem — [persisting]

### WorkerFSM (facade): A
- Round 1 变化：commit 439b120 把 dispatcher kernel 提到 `src/simulation/npc/PriorityFSM.js`；当前 file 是 61 LOC thin facade，构造期 `new PriorityFSM({ behavior: STATE_BEHAVIOR, transitions: STATE_TRANSITIONS, displayLabel: DISPLAY_LABEL, defaultState: "IDLE" })`，`tickWorker` / `getStats` 委托给 generic。`worker.fsm` 形状 + `worker.stateLabel` 单写语义 100% 保留。
- 等级理由：A 维持，但**架构地位升级** — 此前是黄金范例的"实现"，本轮成为黄金范例的"facade（template）"。

### PriorityFSM (generic, NEW): A
- canonical algorithm：priority-walk transition 表 + first-match-wins + onExit/onEnter triple；构造期注入 behavior / transitions / displayLabel / defaultState 四张表；`tick(entity, state, services, dt)` 是唯一 public 入口。
- 与黄金范例对比：**本身就是黄金范例的 generic 化** — 132 LOC、零分支补丁、扩展 = 加 STATE 项 + 加 transition 行；多 entity type 复用 = new PriorityFSM({...}) 且只改 4 张注入表。
- 锁测：`test/priority-fsm-generic.test.js` (184 LOC) 独立验证 dispatcher 契约（priority walk / onExit-onEnter 顺序 / displayLabel 写入），**与 WorkerStates 解耦** —— Visitor/Animal 迁移时不需 worker 的测试做 reference。
- 等级理由：A 教科书级。

### ConstructionSystem: B — debt-cons-1 [persisting]

### VisitorAISystem: C（关键架构债，wave-3 pending）
- canonical algorithm：仍跑 v0.9.x StatePlanner / StateGraph (`src/simulation/npc/VisitorAISystem.js:8-9` 仍 import `mapStateToDisplayLabel, transitionEntityState` + `planEntityDesiredState`)。
- **debt-vis-1**: VisitorAISystem.js:8-9 — 迁移到 `new PriorityFSM({...})`（dispatcher **现已可用**） — LOC est: +200 -300 — [persisting]
- **debt-vis-2**: sabotage handler ~100 LOC 隐藏 state machine — [persisting]

### AnimalAISystem: C（关键架构债，wave-4 pending）
- canonical algorithm：与 VisitorAISystem 同病 (`src/simulation/npc/AnimalAISystem.js:8-9` import StatePlanner / StateGraph)。1266 LOC 中两个 handlePredator / handleHerbivore 各 400+ LOC if-stack。
- **debt-anim-1**: AnimalAISystem.js:8-9 — 迁移到 PriorityFSM；species (deer/wolf/bear/raider_beast) 作 payload 而非 state 笛卡尔积 — [persisting]
- **debt-anim-2**: handlePredator / handleHerbivore 巨型 handler — [persisting]

### MortalitySystem: C — debt-mort-1 / debt-mort-2 [persisting]

### WildlifePopulationSystem: B — debt-wild-1 [persisting]

### BoidsSystem: B — debt-boids-1 [persisting]

### ResourceSystem: C
- Round 1 变化：A5 (f385318) 在 update 主体加 P0-3 wood spoilage (392-403) + P0-1 hunger-decay-when-food-zero (421-441)，共 ~34 LOC。两段都是 `if (BALANCE.x > 0)` 守卫的小段 — **不进 5-子系统挤一文件的拆分债（debt-res-1）**，但**轻微加重了 debt-res-1 的"5 子系统"列表**（现在 hunger-decay 也挤进来了）。
- **debt-res-1**: 5 个子系统（flow / spoilage / crisis / per-tile telemetry / warehouse density）现实际为 6（+ hunger-decay）— 推荐：拆 4 个独立 system — [persisting]
- **debt-res-2**: `recordResourceFlow` lazy-init 伪事件总线 — [persisting]

### ProcessingSystem: B — debt-proc-1 [persisting]

### ColonyPlanner (sub of AgentDirector): D — debt-cp-1 / debt-cp-2 / debt-cp-3 [persisting]

### ColonyPerceiver (sub of AgentDirector): D — debt-perc-1 / debt-perc-2 [persisting]

### LogisticsSystem (orphan): B — debt-log-1 [persisting]

## 3. 上一轮债追踪

| debt id | 状态 | commit / 证据 |
|---|---|---|
| debt-prog-1 | persisting | 未触动 |
| debt-prog-2 | persisting | 未触动 |
| debt-evt-1 | persisting | 未触动 |
| debt-agent-1 | persisting | 未触动 |
| debt-col-1 | persisting | A5 微调未结构性触动 |
| debt-col-2 | persisting | 未触动 |
| debt-role-1 | persisting | 未触动 |
| debt-pop-1 | persisting | 未触动（文件名 vs class 仍漂移） |
| **debt-pop-2** | **resolved** | **439b120 — `__devForceSpawnWorkers` 迁 src/dev/forceSpawn.js + 原 file re-export shim** |
| debt-strat-1 | persisting | 未触动 |
| debt-env-1 | persisting | 未触动 |
| debt-weather-1 | persisting | 未触动 |
| debt-wevt-1 | persisting | 未触动 |
| debt-wevt-2 | persisting | 未触动 |
| debt-wevt-3 | persisting | 未触动 |
| debt-tile-1 | persisting | 未触动 |
| debt-brain-1 | persisting | POLICY_INTENT_TO_STATE 仍在 NPCBrainSystem:28 + StatePlanner:34 双定义 |
| debt-worker-1 | persisting | WorkerAISystem.js LOC 仍 1734，mood/social 块未拆 |
| debt-worker-2 | persisting | helpers 仍 export 自 WorkerAISystem |
| debt-worker-3 | persisting | grep `worker.debug.lastIntent` / `blackboard.fsm` 仍 28 hits |
| debt-cons-1 | persisting | 未触动 |
| debt-vis-1 | persisting | VisitorAISystem.js:8-9 仍 import StatePlanner+StateGraph（**但 PriorityFSM 现已可用，wave-3 入口就绪**） |
| debt-vis-2 | persisting | 未触动 |
| debt-anim-1 | persisting | AnimalAISystem.js:8-9 仍 import StatePlanner+StateGraph |
| debt-anim-2 | persisting | 未触动 |
| debt-mort-1 | persisting | 未触动 |
| debt-mort-2 | persisting | 未触动 |
| debt-wild-1 | persisting | 未触动 |
| debt-boids-1 | persisting | 未触动 |
| debt-res-1 | persisting | A5 加了 hunger-decay 进同一 file，list 从 5 → 6 子系统 |
| debt-res-2 | persisting | 未触动 |
| debt-proc-1 | persisting | 未触动 |
| debt-cp-1 / debt-cp-2 / debt-cp-3 | persisting | 未触动 |
| debt-perc-1 / debt-perc-2 | persisting | 未触动 |
| debt-log-1 | persisting | 未触动 |

汇总：`Δ = +2 (resolved: debt-pop-2 + Refactor-1 Wave-1 完成) - 0 (new) - 0 (regressed) = +2`。本轮净改善 2 条，且为**最有杠杆的两条**：debt-pop-2 关闭 R1 唯一新债，Refactor-1 Wave-1（generic dispatcher）落地 = wave-3/4 的迁移成本从"先写 dispatcher 再迁移"降为"只迁移"。**Round 1 wave-2 是 HW7 Final-Polish-Loop 至今架构杠杆最大的一次提交**。

A5/A2/A3/A6/A7 commits 全部 **0 new debt**：
- A2 (99bef3b) — 5 个 instance-scope scratch buffers (`this._labelProjectedScratch`, `this._labelEntriesScratch`, `this._labelEntryToPoolIdxScratch`, `this._labelVisibleCandidatesScratch`, `this._labelVisibleScratchMap`) 严格遵循 `length = 0` / `clear()` 复用模式（SceneRenderer.js:573-587），per-instance 不会跨 instance 污染；新加的 `#pressureLensSignature` 缓存键也走"`this._cached*` 私有字段 + cheap-prefilter"模式，没有引入全局缓存。
- A5 (f385318) — 4 个新 BALANCE 键全是 `Number(BALANCE.x ?? 0)` 守卫读取 + 已存在子系统内的小段 if 块；**没有创造新 system、没有新增主循环结构**。对应使用点：
  - `workerHungerDecayWhenFoodZero` → ResourceSystem.js:421-441（写入 `entity.hunger` 配合既有 MortalitySystem.shouldStarve 链）
  - `warehouseWoodSpoilageRatePerSec` → ResourceSystem.js:392-403（与 v0.10.1-j food spoilage 同模式）
  - `survivalScorePerProductiveBuildingSec` → ProgressionSystem.js:545-567（同一 metric，新增 summand）
  - `autopilotQuarryEarlyBoost` → ColonyDirectorSystem.js:174-186（既有 priority 数字 + earlyBoost 偏移）
  - 全部 framework-friendly。

## 4. Doc-Code Drift

| doc 文件 | claim | 实际代码 | 严重度 |
|---|---|---|---|
| docs/systems/03-worker-ai.md (§11/skill-library 副段) | 间接 reference 旧 worker AI 概念（整段读起来像整个 npc/state/* 三件套已退役） | VisitorAISystem.js / AnimalAISystem.js 仍跑 StatePlanner/StateGraph → 三件套**只有 worker 端退役**；docs/systems/03-worker-ai.md 应明确标注"worker 用 PriorityFSM；visitor/animal 仍用 StatePlanner（待 wave-3/4）" | 中 |
| docs/systems/01-architecture.md | SYSTEM_ORDER 列出 21 个系统，含 ColonyDirectorSystem 在 slot 6 | 实际 createSystems() 返回 25 个 instance（含 StrategicDirector / WildlifePopulationSystem / ConstructionSystem 等"游离"项），且 ColonyDirectorSystem 已被 AgentDirectorSystem 替代 | 中 |
| docs/systems/03-worker-ai.md | 当前 doc 描述的 dispatcher kernel 在 `src/simulation/npc/fsm/WorkerFSM.js` | R1 wave-2 已把 kernel 提到 `src/simulation/npc/PriorityFSM.js`；WorkerFSM.js 现 61 LOC facade。03 doc 应增补一段"Generic PriorityFSM dispatcher (src/simulation/npc/PriorityFSM.js) — Worker/Visitor/Animal 共享" | 低（轻微 outdated，但 worker-fsm-doc-contract.test.js 锁测仍 pass，因 facade 保留所有 public 字段） |

drift 计数 R1 = 3 → R2 = 3（持平：2 持续旧 drift + 1 新 R1 wave-2 引入的"dispatcher 路径"小漂移）。

## 5. 顶层重构机会 (Top-3)

### Refactor-1: 把 Visitor + Animal AI 接入已就绪的 PriorityFSM (Wave-3 / Wave-4)
- 影响：VisitorAISystem (C→B), AnimalAISystem (C→B), npc/state/* 三件套（StatePlanner/StateGraph/StateFeasibility）整体退役（~1167 LOC 删除）
- 思路：**Wave-1 已完成**（PriorityFSM kernel 132 LOC + 独立锁测）。本轮（Round 2）enhancer 应做 **Wave-3**：定义 `VisitorStates` (TRADING / SCOUTING / SABOTAGING / FLEEING / EATING / WANDERING) + `VisitorTransitions`，在 VisitorAISystem 构造期 `new PriorityFSM({ behavior: VISITOR_BEHAVIOR, transitions: VISITOR_TRANSITIONS, displayLabel: VISITOR_DISPLAY_LABEL })`，把 update() 主体收缩为"loop visitors → fsm.tick(visitor, state, services, dt)"。VisitorAISystem.js 当前 692 LOC 应收缩到 < 350 LOC（与 WorkerFSM facade 类似比例）。Wave-4 同样模式套到 Animal（species 作 payload 而非 state）。
- wave：3 of 4（Visitor）；4 of 4（Animal）
- 风险：Visitor sabotage / trade / scout 行为有 scenario-specific tweaks；需保证 trace parity（与 Worker FSM 迁移同样的 5 hard gates × scenarios 验证）。Animal species×state 笛卡尔积需 species-as-payload 设计避免 state 数爆炸（per Round 1 的 retro 备注）。
- **关键 enabler 已就绪**：PriorityFSM 构造接收 4 张注入表，Visitor/Animal 各定义自己的 STATE_BEHAVIOR / STATE_TRANSITIONS / DISPLAY_LABEL 即可，dispatcher 零改动。

### Refactor-2: WorkerAISystem.update() 拆分（mood/social/relationship → 独立 sim 子系统）
- 影响：WorkerAISystem (B→A), 新增 WorkerMoodSystem / WorkerSocialSystem 列入 SYSTEM_ORDER
- 思路：与 R1 描述一致（debt-worker-1 / debt-worker-2 / debt-worker-3）。
- wave：1 of 2 — Wave-1 拆 mood/social system；Wave-2 helper 迁 WorkerHelpers.js + 清掉 28 处 `worker.debug.lastIntent` / `blackboard.fsm` 兼容字段。
- 风险：mood 影响 harvest / deliver 速率（moodOutputMultiplier）— 需保证 SYSTEM_ORDER 中 WorkerMoodSystem 在 WorkerAISystem 之前。

### Refactor-3: ColonyPlanner / ColonyPerceiver 收编到统一 ColonyAssessment + PlanProvider interface
- 影响：ColonyPlanner (D→B), ColonyPerceiver (D→B), AgentDirectorSystem (B→A), ColonyDirectorSystem (C→B)
- 思路：与 R1 描述一致（4-wave 大整理）。
- wave：1 of 4
- 风险：高；本轮**不应碰**（plan budget 会爆）。Refactor-1 优先级更高。

## 6. 死代码清单

| 类型 | 位置 | 证据 |
|---|---|---|
| 文件未列入 SYSTEM_ORDER | src/simulation/economy/LogisticsSystem.js | grep `new LogisticsSystem` 仅在 src/simulation/npc/WorkerAISystem.js:1327 lazy-init，SYSTEM_ORDER 未列；R1 后未变 |
| 兼容字段 | src/simulation/npc/WorkerAISystem.js (`worker.debug.lastIntent` / `worker.blackboard.fsm`) | grep 28 hits 横跨 ui/ + ai/ + npc/ + entities/ + population/，v0.10.0 retro 已 deferred 删除 |
| 配置常量 | src/config/constants.js (FEATURE_FLAGS.USE_FSM) | "no production code path depends on `false` any more"；仅 `_testSetFeatureFlag` + 2 个测试文件仍读；可删但属测试基础设施债 |
| 文件命名漂移 | src/simulation/population/PopulationGrowthSystem.js (class RecruitmentSystem) | 第 1-12 行注释明确 alias for back-compat |
| 重复表 | src/simulation/ai/brains/NPCBrainSystem.js:28 vs src/simulation/npc/state/StatePlanner.js:34 | POLICY_INTENT_TO_STATE 双定义；漂移风险（debt-brain-1） |
| ~~职责越界~~ (R1 已 resolved) | ~~PopulationGrowthSystem.js:243-332~~ | **R2 已 resolved by 439b120** — 迁到 src/dev/forceSpawn.js |

## 7. Verdict

判定：**YELLOW**

理由：
- grade_A + grade_B = 5 + 11 = 16 / 25 = **64%**（升于 R1 的 60%；逼近 GREEN 70% 但未达 — PriorityFSM 升级为独立 A 拉高分子）。
- grade_D = 2（ColonyPlanner / ColonyPerceiver），仍超 GREEN 阈值（必须 = 0），低于 RED（≥3）。
- delta = **+2**（debt-pop-2 resolved + Refactor-1 Wave-1 落地）；首次正向 delta —— Round 1 wave-2 是该项目历次 polish-loop 中**架构杠杆最大**的提交。
- doc-code drift 持平 3（旧 2 + R1 wave-2 引入的 1 处轻微漂移）；worker-fsm-doc-contract.test.js 仍锁测保护 worker 主路径。
- 头号架构债 debt-vis-1 + debt-anim-1 仍 persisting — 但**前置 enabler PriorityFSM 已就绪**，本轮 enhancer 应优先承担 Wave-3 (Visitor)。
- A2/A5 等 polish commits 未引入新债；A5 的 4 个 BALANCE 键全 framework-friendly，A2 的 5 个 scratch 缓冲严格 per-instance。

## 8. 给 enhancer 的具体话术

**如果你只能改 1 件事，先做 Refactor-1 Wave-3：把 VisitorAISystem 迁到 PriorityFSM。**

理由：R1 wave-2 已把 generic `PriorityFSM` 132 LOC 抽好（构造期接收 behavior / transitions / displayLabel / defaultState 四张注入表），WorkerFSM 已是 61 LOC facade 证明了 backward-compat 模式可行。VisitorAISystem 当前 692 LOC，update() 主体仍跑 v0.9.x 的 `transitionEntityState` + `planEntityDesiredState` 三件套 — 这是**整个项目最容易拿下的 framework 升级**：照搬 `WorkerFSM.js` 61 LOC facade 模式，定义 `VisitorStates.js`（STATE_BEHAVIOR + DISPLAY_LABEL）+ `VisitorTransitions.js`（STATE_TRANSITIONS），构造期 `new PriorityFSM({...})`。完成后 VisitorAISystem 应收缩到 < 350 LOC。

**关键 file:line 入口**：

1. `src/simulation/npc/PriorityFSM.js:29-132` — 不需改动；构造接收 `{ behavior, transitions, displayLabel, defaultState }`，已经 generic 化。
2. `src/simulation/npc/fsm/WorkerFSM.js:1-61` — **照搬模式**：61 LOC facade 是 Visitor 应该做出的样板。
3. `src/simulation/npc/VisitorAISystem.js:8-9` — 删 `import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";` + `import { planEntityDesiredState } from "./state/StatePlanner.js";`，改 `import { PriorityFSM } from "./PriorityFSM.js";` + `import { VISITOR_STATE_BEHAVIOR, VISITOR_DISPLAY_LABEL } from "./fsm/VisitorStates.js";` + `import { VISITOR_STATE_TRANSITIONS } from "./fsm/VisitorTransitions.js";`
4. **新建** `src/simulation/npc/fsm/VisitorStates.js` — 定义 STATE_BEHAVIOR (TRADING / SCOUTING / SABOTAGING / FLEEING / EATING / WANDERING) + DISPLAY_LABEL；onEnter / tick / onExit 三件式，把现有 VisitorAISystem 中各 case 的 if-stack 行为搬进对应 STATE.tick body。
5. **新建** `src/simulation/npc/fsm/VisitorTransitions.js` — priority-ordered 转换表；从现有 `planEntityDesiredState` 抽出"什么条件触发什么状态"作为 `when()` callback。
6. `src/simulation/npc/VisitorAISystem.js (整体)` — update() 主体收缩为 `for (const v of state.agents) if (v.type === "VISITOR") this._fsm.tick(v, state, services, dt);`，sabotage / trade / scout 行为已搬进 STATE.tick body 不再在主循环里。
7. **新增** `test/visitor-fsm-trace-parity.test.js` — 与 worker FSM 迁移相同的 trace-parity 模式（v0.9.x StatePlanner vs v0.10.1 PriorityFSM 同 seed 跑，断言 fsm.state 序列一致）。

**预算估算**：~+450 / -550 = -100 LOC（VisitorAISystem.js 692 → ~350，新增 2 个 fsm/Visitor*.js 约 +400，总净 ~ -100）。低于 400 LOC plan budget。

**二顺位（如果 Wave-3 plan 还有 budget）**：清理 debt-worker-3 的 28 处 `worker.debug.lastIntent` / `blackboard.fsm` 兼容字段读取；标准化为 `entity.fsm.state` / `entity.stateLabel`（PriorityFSM 已经在 dispatcher 写 `entity.stateLabel` 了 — visitor 迁移后这两个字段在所有 entity type 上都可用）。

**禁区**：
- 不要碰 ColonyPlanner / ColonyPerceiver (Refactor-3)。预算会爆。
- 不要直接做 Wave-4 (Animal)。Wave-3 (Visitor) 验证完 generic dispatcher 在 NPC type 维度可复用之后，Wave-4 才有 Animal species 笛卡尔积处理的设计参照。
- 不要碰 NPCBrainSystem 的 LLM 流水线（debt-brain-1 跨 LLM/local 两路径）。
- A5/A2 的 polish commits 已 audit clean，**不要做"优化下 BALANCE 键的 framework"** — 那不是债，是配置驱动的正确表达。
