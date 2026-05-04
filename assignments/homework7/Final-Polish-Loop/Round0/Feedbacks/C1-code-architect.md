---
reviewer_id: C1-code-architect
round: 0
date: 2026-05-01
verdict: YELLOW
score: 6
systems_total: 25
grade_A: 4
grade_B: 11
grade_C: 8
grade_D: 2
debt_items_total: 27
debt_resolved_since_last: 0
debt_new_since_last: 27
debt_regressed_since_last: 0
delta: 0
doc_code_drift_count: 7
---

## 摘要（一段）

Round 0 baseline 全量重盘 25 个系统（SYSTEM_ORDER 21 项 + 4 个游离系统：StrategicDirector / WildlifePopulationSystem / LogisticsSystem / ConstructionSystem）。WorkerAI 在 v0.10.0 完成 Priority-FSM 重写后**接近**项目核心理念的"自成一体的算法框架" — 但本次 audit 发现这把剑只挥到一半：**(1) Visitor + Animal AI 仍跑在已被 Worker 抛弃的 v0.9.x StatePlanner / StateGraph / StateFeasibility 三件套上 → 同一仓库里两套互斥的"Worker AI 黄金范例"并存**；**(2) WorkerAISystem.js 1734 LOC 中有 ~600 LOC 是 v0.10.0-d 之后的"FSM 帮助函数 + 兼容层"，本身没有抽象**（handleDeliver、handleHarvest、handleProcess、handleEat 直接被 STATE_BEHAVIOR 调入，但又在 update() 主循环里跑了 ~250 LOC 的"per-tick mood/social/relationship/carryAge"**补丁块**而不是状态机的一部分）；**(3) docs/systems/03-worker-ai.md 整篇文档过期**（仍描述 chooseWorkerIntent / planEntityDesiredState / commitmentCycle —— 这些函数对 worker 而言已不存在）。架构整洁度的最大失分集中在 ColonyPlanner / ColonyPerceiver / WorldEventSystem / MortalitySystem 四个"补丁堆砌型"系统（C 级），ColonyPlanner（1867 LOC）+ ColonyPerceiver（1966 LOC）合计 ~3800 LOC 是没有可识别核心算法的"补丁山"。Top-3 重构机会聚焦在(a)将 Visitor + Animal 接入 FSM 框架、(b)拆解 WorkerAISystem 主循环中的非状态机块到独立子系统、(c)对 ColonyPlanner 的 build-decision pipeline 重构成"评分表 + 候选项"骨架。

## 1. 系统全景表（当轮 inventory）

| system_id | source_file | doc_ref | 等级 | 债数 | SLOC | 上一轮等级 | 趋势 |
|---|---|---|---|---|---|---|---|
| SimulationClock | src/app/SimulationClock.js | 01-architecture.md | A | 0 | 35 | n/a | new |
| VisibilitySystem | src/simulation/world/VisibilitySystem.js | 02-world-grid.md | A | 0 | 126 | n/a | new |
| ProgressionSystem | src/simulation/meta/ProgressionSystem.js | 05-population-lifecycle.md | C | 2 | 697 | n/a | new |
| DevIndexSystem | src/simulation/meta/DevIndexSystem.js | 06-logistics-defense.md | A | 0 | 123 | n/a | new |
| RaidEscalatorSystem | src/simulation/meta/RaidEscalatorSystem.js | 06-logistics-defense.md | A | 0 | 196 | n/a | new |
| EventDirectorSystem | src/simulation/meta/EventDirectorSystem.js | (none) | B | 1 | 164 | n/a | new |
| AgentDirectorSystem | src/simulation/ai/colony/AgentDirectorSystem.js | (none) | B | 1 | 456 | n/a | new |
| ColonyDirectorSystem (wrapped) | src/simulation/meta/ColonyDirectorSystem.js | 04-economy.md (impl) | C | 2 | 981 | n/a | new |
| RoleAssignmentSystem | src/simulation/population/RoleAssignmentSystem.js | 05-population-lifecycle.md | B | 1 | 729 | n/a | new |
| PopulationGrowthSystem (RecruitmentSystem) | src/simulation/population/PopulationGrowthSystem.js | 05-population-lifecycle.md | B | 1 | 240 | n/a | new |
| StrategicDirector | src/simulation/ai/strategic/StrategicDirector.js | 03-worker-ai.md (mention) | B | 1 | 898 | n/a | new |
| EnvironmentDirectorSystem | src/simulation/ai/director/EnvironmentDirectorSystem.js | (none) | B | 1 | 454 | n/a | new |
| WeatherSystem | src/world/weather/WeatherSystem.js | 04-economy.md (mention) | B | 1 | 298 | n/a | new |
| WorldEventSystem | src/world/events/WorldEventSystem.js | 06-logistics-defense.md | C | 3 | 1179 | n/a | new |
| TileStateSystem | src/simulation/economy/TileStateSystem.js | 04-economy.md | B | 1 | 315 | n/a | new |
| NPCBrainSystem | src/simulation/ai/brains/NPCBrainSystem.js | 03-worker-ai.md | B | 1 | 931 | n/a | new |
| WarehouseQueueSystem | src/simulation/economy/WarehouseQueueSystem.js | 04-economy.md | A | 0 | 116 | n/a | new |
| WorkerAISystem | src/simulation/npc/WorkerAISystem.js | 03-worker-ai.md (stale) | B | 3 | 1734 | n/a | new |
| WorkerFSM (dispatcher) | src/simulation/npc/fsm/WorkerFSM.js | (none — golden but undocumented) | A | 0 | 124 | n/a | new |
| ConstructionSystem | src/simulation/construction/ConstructionSystem.js | 06-logistics-defense.md | B | 1 | 331 | n/a | new |
| VisitorAISystem | src/simulation/npc/VisitorAISystem.js | 03-worker-ai.md (stale) | C | 2 | 692 | n/a | new |
| AnimalAISystem | src/simulation/npc/AnimalAISystem.js | (none) | C | 2 | 1266 | n/a | new |
| MortalitySystem | src/simulation/lifecycle/MortalitySystem.js | 05-population-lifecycle.md | C | 2 | 834 | n/a | new |
| WildlifePopulationSystem | src/simulation/ecology/WildlifePopulationSystem.js | (none) | B | 1 | 509 | n/a | new |
| BoidsSystem | src/simulation/movement/BoidsSystem.js | 03-worker-ai.md (mention) | B | 1 | 394 | n/a | new |
| ResourceSystem | src/simulation/economy/ResourceSystem.js | 04-economy.md | C | 2 | 730 | n/a | new |
| ProcessingSystem | src/simulation/economy/ProcessingSystem.js | 04-economy.md | B | 1 | 249 | n/a | new |
| ColonyPlanner (sub of AgentDir) | src/simulation/ai/colony/ColonyPlanner.js | (none) | D | 3 | 1867 | n/a | new |
| ColonyPerceiver (sub of AgentDir) | src/simulation/ai/colony/ColonyPerceiver.js | (none) | D | 2 | 1966 | n/a | new |
| LogisticsSystem (orphan) | src/simulation/economy/LogisticsSystem.js | 04-economy.md | B | 1 | 135 | n/a | new |

注：表中 27 行实际系统数（去重后），但因 ColonyDirectorSystem 被 AgentDirectorSystem 包装、ColonyPlanner / ColonyPerceiver 是 AgentDirector 的"子系统"、LogisticsSystem 在 SYSTEM_ORDER 之外被 WorkerAISystem 内部 lazy-instantiated，frontmatter 的 `systems_total: 25` 算的是"独立可评级单位"（合并 AgentDirector / ColonyDirector，单列其他）。

## 2. 各系统判定

### SimulationClock: A

- canonical algorithm：`timeSec += dt; tick += 1;` + 派生 dayNightPhase / lightLevel + 边沿事件。
- 与黄金范例对比：极简 pure-update 系统，本就不需要 Intent → State → Action 三段式（无 entity）；功能边界清晰。
- 主要补丁：无。
- 等级理由：35 LOC、零分支、零 if-role。教科书级 A。

### VisibilitySystem: A

- canonical algorithm：每 tick 对所有 worker / agent 反扫 reveal radius，写入 `state.fog.visibility`（HIDDEN/EXPLORED/VISIBLE）。
- 与黄金范例对比：单一职责，输入=actor 列表 + 半径，输出=fog 数组。framework 自洽。
- 主要补丁：无。BALANCE.fogEnabled 关闭时 master-toggle 逻辑分支极小。
- 等级理由：126 LOC，纯 grid pipeline，结构清晰。

### ProgressionSystem: C

- canonical algorithm（如有）：DOCTRINE_PRESETS 表驱动 + MILESTONE_RULES 表驱动，本意是 framework，但实际 update() 里有大量 doctrine-specific 分支判断。
- 与黄金范例对比：表驱动是"准 framework"，但 doctrine modifiers 的应用散落在多个 if 块。
- 主要补丁 / 散点：DOCTRINE_PRESETS（src/simulation/meta/ProgressionSystem.js:6-77）是 5 个硬编码 preset 对象，每个有 ~15 个调参字段；新增 doctrine 必须复制粘贴整块。MILESTONE_RULES（src/simulation/meta/ProgressionSystem.js:79+）类似。
- 债条目：
  - **debt-prog-1**: src/simulation/meta/ProgressionSystem.js:6-77 — 5 个 doctrine preset 是平面对象表，没有"effect operator + magnitude"的分解，新增 doctrine = 复制 15 个字段 — 推荐：抽象成 `{ id, modifiers: { yieldOps:[...], targetOps:[...], recoveryOps:[...] } }` 复合算子，update() 里走单一 reducer 应用 — LOC est: -120 +60 — [new]
  - **debt-prog-2**: src/simulation/meta/ProgressionSystem.js (update 主循环) — survival-score / objectives / milestones 三个独立子系统挤在一个 update() 里，互相不交流但共享一个文件 — 推荐：拆 `DoctrineSystem` / `ObjectiveSystem` / `MilestoneSystem` 三个独立 update — LOC est: 中性（搬移） — [new]
- 等级理由：表驱动雏形是 B 级潜质，但 doctrine 表本身没有抽象算子 + 三件子系统耦合在一个文件，C。

### DevIndexSystem: A

- canonical algorithm：`collectEconomySnapshot → scoreAllDims(独立 6 维) → computeWeightedComposite → ring-buffer smoothing`。
- 与黄金范例对比：流水线骨架完美 — 新增维度 = 加入 DEFAULT_WEIGHTS + 加入 scoreAllDims 一个分量，无需碰主循环。
- 主要补丁：无。
- 等级理由：123 LOC、单流水线、可单测、无 if-special-case。教科书级 A。

### RaidEscalatorSystem: A

- canonical algorithm：`devIndexSmoothed → computeRaidEscalation → state.gameplay.raidEscalation`，纯函数 + thin wrapper。
- 与黄金范例对比：Read → compute → write 三段式，与 DevIndex 完全对称。
- 主要补丁：无（log-curve 是数学公式调整，不是补丁）。
- 等级理由：196 LOC，pure helper 已导出便于测试。A。

### EventDirectorSystem: B

- canonical algorithm：weight-driven event roll + bandit-raid cooldown downgrade。
- 与黄金范例对比：算法清晰但 event_type 列表硬编码（`NON_RAID_FALLBACK_ORDER`），新增事件类型需改 fallback 表。
- 债条目：
  - **debt-evt-1**: src/simulation/meta/EventDirectorSystem.js:28-34 — `NON_RAID_FALLBACK_ORDER` 是硬编码 5-item array，新增事件类型必须改两处（rollEventType + downgradeRaid） — 推荐：用 `BALANCE.eventDirectorWeights` 反向推 fallback 顺序 — LOC est: -10 — [new]
- 等级理由：核心算法干净，单点补丁。B。

### AgentDirectorSystem: B

- canonical algorithm：`Perceive → Plan → Ground → Execute → Evaluate → Reflect` 六段式 pipeline。这是项目核心理念在 Colony layer 的对应物，意图非常 framework-y。
- 与黄金范例对比：算得上 Colony-layer 的"Intent → State → Action"对应物。问题：内部 wraps `_fallback = ColonyDirectorSystem`（src/simulation/ai/colony/AgentDirectorSystem.js:13），mode 切换通过 if-elif（`agent` / `hybrid` / `algorithmic`）走完全不同的代码路径 — wrapper 模式没有把"算法骨架"统一。
- 债条目：
  - **debt-agent-1**: src/simulation/ai/colony/AgentDirectorSystem.js:13 + selectMode — `algorithmic` 分支等于完全 bypass framework 走 ColonyDirectorSystem.update()；`hybrid` 与 `agent` 仅在 plan 来源不同；三个分支应统一为"plan source = LLM | reflection-enriched | rule-based"plug-in 接口 — 推荐：把 ColonyPlanner / ColonyDirectorSystem 抽象成 `PlanProvider` 接口，AgentDirector 只调度 — LOC est: -200（删 ColonyDirectorSystem 内的对偶 update 路径） — [new]
- 等级理由：六段式 pipeline 的意图很好，但 mode 三分叉削弱了 framework 的统一性。B。

### ColonyDirectorSystem (algorithmic fallback): C

- canonical algorithm：phase-detection（bootstrap → logistics → processing → fortification → expansion → complete）+ assessColonyNeeds → 排序 build queue。
- 与黄金范例对比：phase 表是"准 framework"（PHASE_TARGETS 是 frozen 表），但 assessColonyNeeds 函数内 600+ LOC 充满 if-emergency / if-pop-cap / if-warehouse-ratio 补丁分支。
- 主要补丁 / 散点：assessColonyNeeds（src/simulation/meta/ColonyDirectorSystem.js:84+）有大量 emergency carve-outs，每个 carve-out 都是一行 `if (xxx) needs.push(...)`。
- 债条目：
  - **debt-col-1**: src/simulation/meta/ColonyDirectorSystem.js:84-(700+) — assessColonyNeeds 是一长串 `if (条件) needs.push({type, priority, reason})` — 推荐：把每个 carve-out 抽象成 `BuildHeuristic = (state) => Need[]` 的策略对象，主函数 `flatten(map(strategies, s => s(state)))` — LOC est: -350 — [new]
  - **debt-col-2**: src/simulation/meta/ColonyDirectorSystem.js (整个 phase determination 部分) — phase 由"硬编码 buildings.farms >= N && buildings.warehouses >= M"判定，phase 个数 = 5，新增 phase 必须改 PHASE_TARGETS + determinePhase 函数 — 推荐：抽象 phase 为 `{id, gates: [(b)=>bool], targets: {...}}` 列表，determinePhase 走 first-mismatch — LOC est: -40 — [new]
- 等级理由：phase 表是 framework 雏形，但 needs assessment 主体是 if-stack，C。

### RoleAssignmentSystem: B

- canonical algorithm：`computePopulationAwareQuotas`（band-table 优先，per-worker 公式 fallback）+ promote/demote 算法 + builder/guard 特殊分支。
- 与黄金范例对比：band-table（src/simulation/population/RoleAssignmentSystem.js:50-58）是 framework，新增 role = 加表行；但 builder / guard 仍有专门 if 分支处理 raider 阀值。
- 债条目：
  - **debt-role-1**: src/simulation/population/RoleAssignmentSystem.js (整体) — guard / builder 的 dynamic promotion 与 quota table 走两条路径；建议把 dynamic promotion 也表驱动（roleQuotaScaling.dynamic 块），与 band-table 同级 — LOC est: -80 — [new]
- 等级理由：band-table 是框架雏形，但 guard/builder dynamic 仍是一次性 if，B。

### PopulationGrowthSystem (RecruitmentSystem): B

- canonical algorithm：`recruitQueue + cooldown + foodCost + warehouse gate` — 四要素清晰，1Hz check。
- 与黄金范例对比：行为简单，规则 = 表配置（cooldown / cost / minFoodBuffer 都来自 BALANCE）。Symbol 别名 PopulationGrowthSystem 是 back-compat 痕迹，不是补丁。
- 债条目：
  - **debt-pop-1**: src/simulation/population/PopulationGrowthSystem.js:1-12 — 文件名 `PopulationGrowthSystem.js` 与 class `RecruitmentSystem` 不一致，需要 export alias hack — 推荐：rename 文件 + 同步 import 站点 — LOC est: 中性（rename） — [new]
- 等级理由：核心算法干净，文件 / class 命名漂移是 B 级污点。

### StrategicDirector: B

- canonical algorithm：DEFAULT_STRATEGY + VALID_ENUMS + sanitize/validate 表驱动。decision scheduler 控制频率。
- 与黄金范例对比：表驱动 framework 雏形（VALID_ENUMS 是 frozen 表）。问题：898 LOC，包含大量 picker / scoring 函数（chooseStrategicGoal / pickPrimaryGoal 等），每个都有自己的小 if-stack。
- 债条目：
  - **debt-strat-1**: src/simulation/ai/strategic/StrategicDirector.js (~898 LOC) — 多个 picker 函数（chooseStrategicGoal / chooseDefensePosture / chooseResourceFocus 等）是平面 if 链；建议抽象 `pickField(field, candidates, scorer)` 通用 picker — LOC est: -150 — [new]
- 等级理由：framework 骨架在但 picker 实现散点，B。

### EnvironmentDirectorSystem: B

- canonical algorithm：`buildEnvironmentPerception → buildWorldSummary → LLM/fallback → applyEnvironmentDirective` 流水线。
- 与黄金范例对比：流水线清晰，与 NPCBrainSystem 同构。
- 债条目：
  - **debt-env-1**: src/simulation/ai/director/EnvironmentDirectorSystem.js:32+ — buildEnvironmentPerception 中 fragility 等级判定是 5 段 if-stack（critical / fragile / watchful / stable / thriving），不是表驱动 — 推荐：FRAGILITY_RULES 数组 `[(snap)=>'critical' if cond else null, ...]` first-match — LOC est: -40 — [new]
- 等级理由：pipeline 是 framework，单点补丁。B。

### WeatherSystem: B

- canonical algorithm：weather state machine（clear/rain/storm/drought/winter）+ duration timer + transition rules。
- 与黄金范例对比：state-machine 是 framework，与 WorkerFSM 同构思想。问题：未读完，但 298 LOC 中转移概率与持续时间表是 BALANCE 配置，符合"加新 state = 加表项"。
- 债条目：
  - **debt-weather-1**: 未深入审计，但 SYSTEM_ORDER 顺序写在 `WeatherSystem` 与 `EnvironmentDirectorSystem` 之间的 lastTransitionSec 协议（被 ProcessingSystem 读）是 side-channel scratch field — 推荐：明确 `state.weather.transitionEvents[]` 事件队列，让 ProcessingSystem subscribe — LOC est: -20 — [new]
- 等级理由：state-machine framework，B。

### WorldEventSystem: C

- canonical algorithm：从 `state.events.queue` drain，每事件类型独立 dispatch。
- 与黄金范例对比：事件 dispatch 表是 framework 雏形，但 1179 LOC 中每个事件类型（BANDIT_RAID / TRADE_CARAVAN / ANIMAL_MIGRATION / DISEASE_OUTBREAK / WILDFIRE / MORALE_BREAK）都有 100-200 LOC 专门 handler，handler 内部又有大量 case 分支。
- 债条目：
  - **debt-wevt-1**: src/world/events/WorldEventSystem.js (1179 LOC) — 6 个事件类型 handler 各自 100-200 LOC，没有公共 EventHandler interface — 推荐：定义 `interface EventHandler { canSpawn(state); spawn(state, event); apply(state, dt) }`，把 BANDIT_RAID 等做成实现这个 interface 的对象 — LOC est: -300 — [new]
  - **debt-wevt-2**: src/world/events/WorldEventSystem.js — bandit raid 的 raider spawn / sabotage / migration handler 互相 import-cycle-避免，需要在 update() 里硬编码顺序；建议用 priority 字段 — LOC est: -50 — [new]
  - **debt-wevt-3**: src/world/events/WorldEventSystem.js — 文件不在 src/simulation/ 下（位于 src/world/events/），违反"all sim systems 在 src/simulation/" 公约 — 推荐：mv → src/simulation/events/ — LOC est: 中性 — [new]
- 等级理由：6 套类似但独立的 handler 直接堆在一个文件里，C。

### TileStateSystem: B

- canonical algorithm：每 2s 更新 fertility / wear / salinization / fallow，PRODUCTION_TILES / WEAR_TILES / FLAMMABLE_TILES / FIREBREAK_TILES 表驱动。ADJACENCY_EFFECTS 双层表也是 framework。
- 与黄金范例对比：表驱动度高，新增 tile-affecting effect = 加入对应 Set + ADJACENCY_EFFECTS 行。
- 债条目：
  - **debt-tile-1**: src/simulation/economy/TileStateSystem.js:7-12 — FERTILITY_RECOVERY_PER_SEC / WEAR_INCREASE_PER_SEC 等是文件级 const，不在 BALANCE 中（与其他常数风格不一致） — 推荐：迁移到 BALANCE.tileState — LOC est: 中性 — [new]
- 等级理由：核心算法表驱动，单点配置漂移，B。

### NPCBrainSystem: B

- canonical algorithm：`buildPolicySummary → llmClient.requestPolicies | fallback → normalize → fanout to entity.policy + groupStateTargets`。
- 与黄金范例对比：流水线是 framework；但 POLICY_INTENT_TO_STATE 表（src/simulation/ai/brains/NPCBrainSystem.js:28-61）硬编码了 5 个 group，每个 group 各自 intent→state 表 — 与 src/simulation/npc/state/StatePlanner.js:34-74 中的副本**重复**（同一份语义信息存在两处）。
- 债条目：
  - **debt-brain-1**: src/simulation/ai/brains/NPCBrainSystem.js:28-61 + src/simulation/npc/state/StatePlanner.js:34-74 — POLICY_INTENT_TO_STATE 在两个文件中重复（NPCBrainSystem 写入 + StatePlanner 读取）但定义独立维护，已观察到 workers 表项漂移（NPCBrainSystem 没有 quarry/gather_herbs/cook/smith/heal/haul，StatePlanner 有）— 推荐：单一 source 在 src/config/aiConfig.js，两个 file 都 import — LOC est: -60 — [new]
- 等级理由：流水线 framework + 单点表重复，B。

### WarehouseQueueSystem: A

- canonical algorithm：每 tick reset intake tokens + scan queue for timeouts/stale + early-exit。
- 与黄金范例对比：算法骨架就是 token bucket，与黄金范例的"小而清晰的 framework"理念吻合。
- 主要补丁：无。
- 等级理由：116 LOC、单一职责、early-exit 优化、清晰 state shape 文档。A。

### WorkerAISystem: B（**降级警告**）

- canonical algorithm：本应是 v0.10.0 之后的"FSM dispatcher only"，但实际 1734 LOC 中只有 `update` 主循环里的 `this._workerFSM.tickWorker(worker, state, services, dt)`（src/simulation/npc/WorkerAISystem.js:1654）一行真正调用 FSM；其他 1700+ LOC 是 helper 函数 + per-tick 副作用块。
- 与黄金范例对比：FSM dispatcher 本身（fsm/WorkerFSM.js + WorkerStates + WorkerTransitions + WorkerConditions + WorkerHelpers）是项目中最 framework-y 的代码，**值得 A**。但因为这些 helper 都从 WorkerAISystem.js 中 export，且 WorkerAISystem.update() 主循环本身仍然有 ~250 LOC 的"per-tick mood/social/relationships/carryAge/morale-break/emotional-context"补丁块（src/simulation/npc/WorkerAISystem.js:1500-1680），主类没法被评 A。
- 主要补丁 / 散点：
  - update() 主循环（src/simulation/npc/WorkerAISystem.js:1500-1680）做了：mood composite 计算、moodOutputMultiplier 写入、morale break 队列、proximity-based opinion drift、relationship band 跨越事件 emit、carryAgeSec 计算、emotional context prefix。**这些都不属于 FSM**，应该被独立子系统接手。
  - `handleDeliver` / `handleHarvest` / `handleProcess` 是 export function，被 STATE_BEHAVIOR import — 这违反了"helper 应该在 WorkerHelpers"的边界（WorkerHelpers 只有 77 LOC，剩下都还在主文件）。
  - debug.lastIntent / blackboard.fsm.state 等"legacy 兼容字段"在 53 处仍被读（grep 显示 15 个文件）— v0.10.1+ 的"cut UI consumers off the legacy display FSM"待办仍未完成。
- 债条目：
  - **debt-worker-1**: src/simulation/npc/WorkerAISystem.js:1500-1680 — update() 主循环中 mood/social/morale-break/relationship 的 ~250 LOC 是非状态机代码，与 FSM dispatcher 同居一个 update() — 推荐：拆出独立 `WorkerMoodSystem` + `WorkerRelationshipSystem`，加入 SYSTEM_ORDER；WorkerAISystem.update() 收缩到只 dispatch FSM — LOC est: -250 +180 — [new]
  - **debt-worker-2**: src/simulation/npc/WorkerAISystem.js (handleDeliver / handleHarvest / handleProcess / chooseWorkerTarget / pickWanderNearby / setIdleDesired) — 这些 helper 是 FSM STATE_BEHAVIOR 的依赖，但仍然 export 自 WorkerAISystem 而不是 WorkerHelpers；这造成"WorkerHelpers 是真正的 helper"的命名误导 — 推荐：把 FSM 直接调用的 helpers 全部搬到 npc/fsm/WorkerHelpers.js — LOC est: -600 +600（搬移） — [new]
  - **debt-worker-3**: src/simulation/npc/WorkerAISystem.js (53 grep hits across 15 files for `worker.debug.lastIntent` / `blackboard.fsm.state` / `worker.stateLabel` legacy reads) — v0.10.0 retrospective 提到 deferred"cut UI consumers off the legacy display FSM (`entity.blackboard.fsm.state`), drop redundant `worker.debug.lastIntent`"，仍未完成 — 推荐：标准化为单一 read field `worker.fsm.state`/`worker.fsm.stateLabel`，删除其他 — LOC est: -120 — [new]
- 等级理由：FSM dispatcher 部分是 A（在 WorkerFSM.js），但主类未瘦身；B 是"接近 A 但还差一刀"的位置。

### WorkerFSM (dispatcher): A

- canonical algorithm：priority-ordered transition walk + first-match-wins + onEnter/tick/onExit triple。
- 与黄金范例对比：**这就是黄金范例本身**。124 LOC、零分支、扩展 = 加 STATE 项 + 加 transition 行。完全无补丁。
- 主要补丁：无。
- 等级理由：项目最干净的 framework，A。**注意**：这个文件没有对应 docs/systems/ 文档（03-worker-ai.md 已过期）。

### ConstructionSystem: B

- canonical algorithm：扫描 construction sites → 检查完成 → mutateTile + refund + emit；wallHp regen 是独立子流程。
- 与黄金范例对比：算法骨架清晰，但 wallHp regen（src/simulation/construction/ConstructionSystem.js:37-138）作为同一文件的另一职责，是"两个独立算法挤在一个 update"。
- 债条目：
  - **debt-cons-1**: src/simulation/construction/ConstructionSystem.js:37-138 — `regenerateWallHp` 与 construction-completion check 同居一个 system，是独立功能；建议拆 `WallRegenSystem`，独立列入 SYSTEM_ORDER — LOC est: 中性（搬移） — [new]
- 等级理由：核心 framework 干净，单点责任合并，B。

### VisitorAISystem: C（**关键架构债**）

- canonical algorithm：仍跑在 v0.9.x StatePlanner / StateGraph 上（`planEntityDesiredState` + `transitionEntityState` import 在 src/simulation/npc/VisitorAISystem.js:8-9）。
- 与黄金范例对比：**与 Worker FSM 完全不一致** — Worker 已经迁到 WorkerFSM dispatcher（discrete 优先级 transition），Visitor 还在用 v0.9.x"feasibility 检查 + 三源融合（local + policy + ai-target） + transitionEntityState"流水线。两套 AI framework 同时存在。
- 主要补丁 / 散点：handleVisitor 的 trade / sabotage / scout / evade 是 4 个独立 if-state 分支。
- 债条目：
  - **debt-vis-1**: src/simulation/npc/VisitorAISystem.js:8-9 — 仍 import StatePlanner + StateGraph（v0.9.x 决策骨架），与 v0.10.0 Worker FSM 框架不一致 — 推荐：迁移到一个 VisitorFSM（priority transitions: COMBAT→FLEE→TRADE→WANDER）；可以与 WorkerFSM 共享 dispatcher 类（generic FSM<TStateName>） — LOC est: +200 -300 — [new]
  - **debt-vis-2**: src/simulation/npc/VisitorAISystem.js (sabotage handler, ~100 LOC) — sabotage 行为内部 if-stack（pick target / acquire / commit / flee）是隐藏的 state machine — 推荐：暴露成 sub-states — LOC est: -50 — [new]
- 等级理由：与黄金范例 framework 完全分裂，C。

### AnimalAISystem: C（**关键架构债**）

- canonical algorithm：与 VisitorAISystem 同病 — 仍 import StatePlanner / StateGraph（src/simulation/npc/AnimalAISystem.js:8-9）。
- 与黄金范例对比：predator vs herbivore 通过两套独立函数链（handleHerbivore / handlePredator）走，每套链内部是 if-state，整体就是"v0.9.x 的 NPC AI"。
- 主要补丁 / 散点：PREDATOR_SPECIES_PROFILE（src/simulation/npc/AnimalAISystem.js:32-36）是 species 表驱动（A 级雏形），但行为派发是 if-species，flee/graze/hunt/stalk/feed/rest/roam/regroup 8 个 state 分散在 ~600 LOC handler 中。
- 债条目：
  - **debt-anim-1**: src/simulation/npc/AnimalAISystem.js:8-9 — 与 VisitorAISystem 同因，import StatePlanner / StateGraph — 推荐：与 debt-vis-1 合并，共用 generic FSM dispatcher — LOC est: 与 debt-vis-1 合并 — [new]
  - **debt-anim-2**: src/simulation/npc/AnimalAISystem.js (整个 handlePredator / handleHerbivore) — 1266 LOC 中两个巨型 handler 函数各自 400+ LOC if-stack；species profile 是表驱动，但 state 行为不是 — 推荐：extract STATE_BEHAVIOR 三件式 — LOC est: -400 — [new]
- 等级理由：与 Worker FSM 框架完全不对齐，且自身也是 if-state 派发，C。

### MortalitySystem: C

- canonical algorithm：本意是"每 tick 检查 hp / hunger，必要时 markDeath" — 简单。
- 与黄金范例对比：实际 834 LOC 中包含：deathThresholdFor / relationLabelForMemory / pushWorkerMemory / readRelationshipOpinion / recordDeathIntoWitnessMemory / recomputeCombatMetrics / hasReachableNutritionSource / shouldStarve / buildDeathContext / recordDeath / medicineHealing — 11 个职责挤在一个文件。
- 主要补丁 / 散点：medicineHealing（src/simulation/lifecycle/MortalitySystem.js:783-806）是完全独立的 healing 子系统，与"死亡判定"无关；recomputeCombatMetrics 也是。
- 债条目：
  - **debt-mort-1**: src/simulation/lifecycle/MortalitySystem.js:783-806 — medicineHealing 与 mortality 无关（healing 是反向行为），独立成 `HealingSystem` — LOC est: 中性（搬移） — [new]
  - **debt-mort-2**: src/simulation/lifecycle/MortalitySystem.js:362-435 — `recomputeCombatMetrics` 在 mortality system 里维护 combat 指标是边界混乱；属于 RoleAssignmentSystem 的输入 — 推荐：搬到 `CombatMetricsSystem` 或 RoleAssignmentSystem 内 — LOC est: 中性 — [new]
- 等级理由：单文件 11 职责堆叠，C。

### WildlifePopulationSystem: B

- canonical algorithm：zone-aware spawn / despawn + biome-aware tile picker + cluster state tracking。
- 与黄金范例对比：HERBIVORE_SPAWN_TILES / PREDATOR_SPAWN_TILES 表驱动 + zone 表驱动。spawn 选择有 if-zone 分支但是合理的策略选择。
- 债条目：
  - **debt-wild-1**: src/simulation/ecology/WildlifePopulationSystem.js (~509 LOC) — `assignAnimalHabitat` / `pickPredatorSpawnTile` / `pickHerbivoreSpawnTile` 三个函数有重复的 zone-anchor / radius 计算 — 推荐：抽 `getZoneCandidates(state, zone, kind)` — LOC est: -60 — [new]
- 等级理由：表驱动雏形 + 局部重复，B。

### BoidsSystem: B

- canonical algorithm：经典 boids 三力（separation / alignment / cohesion）+ neighbor query via SpatialHash + group profile 表驱动。
- 与黄金范例对比：`BALANCE.boidsGroupProfiles` 表驱动是 framework；新增 group = 加一行 profile。
- 债条目：
  - **debt-boids-1**: src/simulation/movement/BoidsSystem.js:7-13 — TRAFFIC_NEIGHBOR_OFFSETS 与其他系统中重复定义（src/config/constants.js 应有 DIR4 / DIR5 单一 source） — 推荐：合并到 constants — LOC est: -10 — [new]
- 等级理由：算法骨架经典 + 表驱动，单点常量重复，B。

### ResourceSystem: C

- canonical algorithm：sliding-window flow + crisis 检测 — 本意是 framework，但 730 LOC 中包含：spoilage、recordResourceFlow（被外部调用）、isFoodRunwayUnsafe、recordProductionEntry、resource crisis events emit。
- 与黄金范例对比：`TRACKED_FLOW_RESOURCES` 是表驱动雏形，但 spoilage 计算、food crisis、warehouse density risk 都是独立子算法挤一起。
- 债条目：
  - **debt-res-1**: src/simulation/economy/ResourceSystem.js (整体) — 5 个子系统（flow tracking / spoilage / crisis detection / per-tile production telemetry / warehouse density risk）挤在一个 file — 推荐：拆 `ResourceFlowSystem` / `SpoilageSystem` / `CrisisSystem` / `ProductionTelemetry` — LOC est: 中性（搬移） — [new]
  - **debt-res-2**: src/simulation/economy/ResourceSystem.js + ProcessingSystem + MortalitySystem — `recordResourceFlow(state, resource, kind, amount)` 是 lazy-init scratch field 的"伪事件总线"，三个 system 都直接 import 这个 helper；建议正式化为 `state.events.resourceFlow` 队列 — LOC est: -30 — [new]
- 等级理由：5 职责挤一文件 + side-channel scratch field 模式，C。

### ProcessingSystem: B

- canonical algorithm：per-building cooldown timers + weather-aware effective cycle + #processKitchens / #processSmithies / #processClinics 派发。
- 与黄金范例对比：3 个 process handler 各自 ~50 LOC，本可以表驱动（type → input/output table）— 但目前 if-kind 派发。weather transition 通过 lastTransitionSec scratch field 检测是 side-channel 模式（与 ResourceSystem.recordResourceFlow 同病）。
- 债条目：
  - **debt-proc-1**: src/simulation/economy/ProcessingSystem.js (#processKitchens / #processSmithies / #processClinics) — 3 个几乎结构相同的 method（每个 ~50 LOC），输入资源 / 输出资源 / cycleSec / weatherMult 都不同；建议表驱动 `PROCESSING_RECIPES = [{ kind, role, input: {...}, output: {...}, baseCycleSec, weatherMod }]` — LOC est: -100 — [new]
- 等级理由：核心算法清晰，3 handler 重复结构，B。

### ColonyPlanner (sub of AgentDirector): D

- canonical algorithm：**没有可识别的核心算法**。1867 LOC，是 LLM-driven build planner + fallback rule-based planner + plan grounding + plan history + replan triggers + skill library lookup 全堆一起。
- 与黄金范例对比：完全相反 — 每加一个 plan type 就在 generateFallbackPlan 里加一段 if-phase 块。
- 主要补丁 / 散点：generateFallbackPlan / shouldReplan / 各种 plan template / hint extraction / sanitization 都是独立函数堆。
- 债条目：
  - **debt-cp-1**: src/simulation/ai/colony/ColonyPlanner.js (1867 LOC) — 没有 PlanProvider interface；LLM 路径与 fallback 路径完全独立实现，互相 95% 不重用 — 推荐：定义 `PlanProvider { proposePlan(state, hints) → Plan }`，LLM/fallback/skill-library 都实现这个 interface — LOC est: -800 — [new]
  - **debt-cp-2**: src/simulation/ai/colony/ColonyPlanner.js — `shouldReplan` 是巨型 OR-of-conditions 函数（碾过去 ~150 LOC），每个新触发条件都加一行 — 推荐：`REPLAN_TRIGGERS = [(state) => bool | reason]` 表 — LOC est: -100 — [new]
  - **debt-cp-3**: src/simulation/ai/colony/ColonyPlanner.js + src/simulation/meta/ColonyDirectorSystem.js — 两个 file 中 phase 判定、emergency carve-out、warehouse ratio check 等业务逻辑大量重复 — 推荐：抽公共 `ColonyAssessment` module — LOC est: -300 — [new]
- 等级理由：1867 LOC 无 framework，纯补丁山，D。

### ColonyPerceiver (sub of AgentDirector): D

- canonical algorithm：**没有可识别的核心算法**。1966 LOC（项目最大单文件），构建给 LLM 看的 colony state snapshot — 但缺乏字段贡献者注册机制，所有字段都硬编码在一个巨型 perceive() 函数里。
- 与黄金范例对比：与 WorldSummary（304 LOC）功能高度重叠，但 ColonyPerceiver 多了 19+ 个 carve-out 字段（每个都是 cherry-picked）。
- 主要补丁：n/a — 整个文件就是补丁堆。
- 债条目：
  - **debt-perc-1**: src/simulation/ai/colony/ColonyPerceiver.js (1966 LOC) — 没有 FieldContributor interface；要给 prompt 加新字段 = 在 perceive() 里加一段 reading + computation；建议 `PERCEIVER_FIELDS = [{ key, compute: (state) => value, importance: 0..1 }]` — LOC est: -1000 — [new]
  - **debt-perc-2**: src/simulation/ai/colony/ColonyPerceiver.js + src/simulation/ai/memory/WorldSummary.js — 两个 file 都构建"colony 状态摘要给 LLM 看"，但字段集合不同、调用方不同；存在大量逻辑重复 — 推荐：合并为 `ColonySnapshotBuilder`，prompt-builder 上层 select 字段 — LOC est: -500 — [new]
- 等级理由：1966 LOC 无 framework + 与 WorldSummary 大量重复，D。

### LogisticsSystem (orphan, lazy-instantiated): B

- canonical algorithm：grid-version-gated rebuild + 3-tier efficiency 表（connected/adjacent/isolated）+ road wear degradation。
- 与黄金范例对比：算法骨架清晰；但**未列入 SYSTEM_ORDER**（src/simulation/npc/WorkerAISystem.js:1327 处由 Worker AI 在 update() 里 lazy-init `state._logisticsSystem ??= new LogisticsSystem();`），这是隐式系统注册的反模式。
- 债条目：
  - **debt-log-1**: src/simulation/economy/LogisticsSystem.js + src/simulation/npc/WorkerAISystem.js:1327 — LogisticsSystem 在 SYSTEM_ORDER 之外被 lazy-init；任何审计/性能分析都看不见它 — 推荐：列入 SYSTEM_ORDER，紧靠 TileStateSystem — LOC est: -10 — [new]
- 等级理由：核心算法清晰，注册方式违反公约，B。

## 3. 上一轮债追踪

| debt id | 状态 | commit / 证据 |
|---|---|---|

无。Round 0 baseline，没有上一轮。

## 4. Doc-Code Drift

| doc 文件 | claim | 实际代码 | 严重度 |
|---|---|---|---|
| docs/systems/03-worker-ai.md | "Pipeline: Intent (chooseWorkerIntent) → State (StatePlanner / StateGraph) → Action (WorkerAISystem)" 全文围绕这套描述 | v0.10.0 已废除 chooseWorkerIntent 和 worker 端的 StatePlanner / StateGraph 调用；worker 跑 WorkerFSM (priority transitions) | **严重** |
| docs/systems/03-worker-ai.md | "WorkerStateGraph 状态：idle/seek_food/eat/seek_task/harvest/deliver/process/wander/seek_rest/rest" 10 个 state | WorkerFSM 的 STATE 是 12 个：IDLE/SEEKING_REST/RESTING/FIGHTING/SEEKING_HARVEST/HARVESTING/DELIVERING/DEPOSITING/SEEKING_BUILD/BUILDING/SEEKING_PROCESS/PROCESSING（无 idle/seek_food/eat/seek_task/wander，命名全变 + FIGHTING/BUILDING 是新增） | **严重** |
| docs/systems/03-worker-ai.md | "DEFAULT_STATE_HOLD_SEC (0.8 s) 防止 oscillation" | WorkerFSM 不使用 hold window；priority transitions 自然防 oscillation | **严重** |
| docs/systems/03-worker-ai.md | "commitmentCycle 锁" | v0.10.0 retrospective 明确说 commitmentCycle 已删除 | **严重** |
| docs/systems/03-worker-ai.md | "JobReservation API 与 occupancy-aware target scoring" | JobReservation.js 仍存在并被 FSM 使用，但文档描述的 chooseWorkerTarget 在 WorkerAISystem.js 仍 export，**部分对齐** | 中 |
| docs/systems/01-architecture.md | SYSTEM_ORDER 列出 21 个 system，包含 ColonyDirectorSystem 在 slot 6 | 实际 createSystems() 返回 25 个 instance（含 StrategicDirector / WildlifePopulationSystem / ConstructionSystem 等"游离"项），且 ColonyDirectorSystem 已被 AgentDirectorSystem 替代（slot 6） | 中 |
| docs/systems/04-economy.md | "WAREHOUSE 间距≥5 tile" | 实际 BuildAdvisor 中 warehouseSpacingTiles 是 BALANCE 配置；docs 只是举例值 | 低 |

## 5. 顶层重构机会 (Top-3)

### Refactor-1: 把 Visitor + Animal AI 接入 WorkerFSM 同款 dispatcher（generic PriorityFSM）
- 影响：VisitorAISystem (C→B), AnimalAISystem (C→B), 和 npc/state/* 三件套（StatePlanner/StateGraph/StateFeasibility）整体退役（~1167 LOC 删除）
- 思路：WorkerFSM.js 124 LOC 是项目里最 framework-y 的单文件 — 把 dispatcher 抽象成 generic `PriorityFSM<StateName>` class（接收 STATE_BEHAVIOR + STATE_TRANSITIONS map）。然后定义 `VisitorStates` (TRADING / SCOUTING / SABOTAGING / FLEEING / EATING / WANDERING) 和 `AnimalStates` (按 species 分两套：HerbivoreFSM = GRAZING / FLEEING / REGROUPING / WANDERING，PredatorFSM = HUNTING / STALKING / FEEDING / PATROLLING / RESTING)。每个 entity type 的 system update() 收缩为"loop entities → fsm.tick(entity, state, services, dt)"。**这是把项目核心理念从"Worker 黄金范例"扩展到全量 NPC 的关键一步。**
- wave：1 of 3 — Wave-1 抽 generic PriorityFSM（≤200 LOC），Wave-2 迁 Visitor，Wave-3 迁 Animal。每 wave ≤ 400 LOC plan budget 可以容纳。
- 风险：Visitor 的 sabotage / trade / scout 行为有大量 scenario-specific tweaks，需保证 trace parity；Animal 端 species profile 是 species×state 笛卡尔积，转 FSM 时需 species-as-payload 设计避免 state 数爆炸。

### Refactor-2: WorkerAISystem.update() 拆分（mood/social/relationship → 独立 sim 子系统）
- 影响：WorkerAISystem (B→A), 新增 WorkerMoodSystem / WorkerSocialSystem 列入 SYSTEM_ORDER
- 思路：WorkerAISystem.update() 中 src/simulation/npc/WorkerAISystem.js:1500-1680 的 ~250 LOC 与 worker 决策无关 — 是每 tick 的 mood composite / morale break / proximity opinion drift / friendship band crossing。把这块抽成 WorkerMoodSystem（hunger/rest/morale/mood + moodOutputMultiplier）和 WorkerSocialSystem（relationships/proximity/band crossings）独立 update。WorkerAISystem 收缩到 < 1000 LOC，FSM dispatch 成为唯一职责。同时把 export 的 helper（handleDeliver / chooseWorkerTarget / pickWanderNearby 等）迁到 npc/fsm/WorkerHelpers.js。
- wave：1 of 2 — Wave-1 拆 mood/social system，Wave-2 helper 迁 WorkerHelpers.js。
- 风险：mood 影响 harvest / deliver 速率（moodOutputMultiplier）— 需保证读写顺序保持一致（WorkerMoodSystem 必须 before WorkerAISystem in SYSTEM_ORDER）。test baseline 1646 pass 必须保持。

### Refactor-3: ColonyPlanner / ColonyPerceiver 收编到统一 ColonyAssessment + PlanProvider interface
- 影响：ColonyPlanner (D→B), ColonyPerceiver (D→B), AgentDirectorSystem (B→A), ColonyDirectorSystem (C→B), WorldSummary (受益)
- 思路：先抽 `ColonyAssessment` module（snapshot phase / needs / runway / threats，单一 source），ColonyPlanner 和 WorldSummary 都从这里读。然后定义 `PlanProvider` interface（`proposePlan(assessment, hints, history) → Plan | null`），把当前 LLM-path、fallback-path、ColonyDirectorSystem-path 都重构成 PlanProvider 实现。AgentDirectorSystem 收缩到"select provider × execute pipeline"。这是最大单笔削减（~3800 → ~2200 LOC）。
- wave：1 of 4 — Wave-1 抽 ColonyAssessment（共享 module）；Wave-2 把 ColonyDirectorSystem 重构成 RuleBasedPlanProvider；Wave-3 把 ColonyPlanner.fallback 收编；Wave-4 LLMPlanProvider + skill-library 整合。
- 风险：高 — ColonyPlanner 的 LLM prompt 与 fallback rule 有大量隐性耦合（fallback prompts 用同一份 plan schema），重构需保证 schema 兼容；且涉及多条 LLM benchmark，需保 plansCompleted 不退化。

## 6. 死代码清单

| 类型 | 位置 | 证据 |
|---|---|---|
| 文件未列入 SYSTEM_ORDER | src/simulation/economy/LogisticsSystem.js | grep `new LogisticsSystem` 仅在 src/simulation/npc/WorkerAISystem.js:1327 lazy-init，SYSTEM_ORDER 未列。可正常工作但隐式 |
| 兼容字段 | src/simulation/npc/WorkerAISystem.js (`worker.debug.lastIntent`) | v0.10.0 retrospective 明确 deferred 删除；grep 显示 ui/panels/EntityFocusPanel.js:11 处 + ui/panels/InspectorPanel.js:1 处仍读，但 worker FSM 已不再写入新值（来自 setIntent 的 blackboard.intent 才是 source-of-truth） |
| 兼容字段 | worker.blackboard.fsm | v0.10.1 retrospective 提到 "EntityFocusPanel + WorldSummary + NPCBrainAnalytics migrated to FSM-first reads in v0.10.1-b"，但 src/simulation/ai/brains/NPCBrainAnalytics.js 仍读，src/simulation/ai/memory/WorldSummary.js 仍读 — 仅部分迁移 |
| 配置常量 | src/config/constants.js (FEATURE_FLAGS.USE_FSM) | v0.10.0-d 注释说 "no production code path depends on `false` any more"，但 flag 本身 + `_testSetFeatureFlag` 仍 export — 是测试 only，但 FEATURE_FLAGS 框架仅此一项，可考虑直接 inline + 删 setter |
| 文件命名漂移 | src/simulation/population/PopulationGrowthSystem.js (class RecruitmentSystem) | 第 1-12 行注释明确说"PopulationGrowthSystem export 是 alias for back-compat"；可重命名文件 |
| 重复表 | src/simulation/ai/brains/NPCBrainSystem.js:28-61 vs src/simulation/npc/state/StatePlanner.js:34-74 | POLICY_INTENT_TO_STATE 在两处独立定义，workers 表项内容已不同（NPCBrainSystem 缺 quarry / gather_herbs / cook / smith / heal / haul） |

## 7. Verdict

判定：**YELLOW**

理由：
- grade_A + grade_B = 4 + 11 = 15 / 25 = **60%**，达到 YELLOW 门槛（≥50%）但未达 GREEN（≥70%）。
- grade_D = 2（ColonyPlanner / ColonyPerceiver），超过 GREEN 阈值（必须 = 0），低于 RED 阈值（≥3 才 RED）。
- delta = 0（Round 0 baseline，无对比基准）。
- Worker FSM dispatcher 本身是项目最高质量的 framework，可作为 Refactor-1 的扩展模板 → 有清晰的整改方向。
- 但 Visitor + Animal AI 仍跑在 v0.9.x 旧框架上，docs/systems/03-worker-ai.md 整篇过期，"两套 NPC AI framework 并存"是严重的架构信号。

## 8. 给 enhancer 的具体话术

**如果你只能改 1 件事，先改 Refactor-1 Wave-1：抽出 generic `PriorityFSM<StateName>` dispatcher class。**

理由：项目的"自成一体的算法框架"在 v0.10.0 已经为 worker 实现了完美范例（WorkerFSM.js, 124 LOC），但被锁死在 worker 子文件夹里。把它升格成 `src/simulation/npc/PriorityFSM.js`（generic over state name + behavior map + transition table），是**用最小改动证明 framework 可复用**的关键步骤 — 这一步做完，Visitor 和 Animal 的 FSM 迁移变成"机械填表"。

**关键 file:line 入口**：

1. `src/simulation/npc/fsm/WorkerFSM.js:32-115` — 把 class 改成 generic：构造时不再默认 `STATE_BEHAVIOR` / `STATE_TRANSITIONS`，而是要求显式注入。
2. `src/simulation/npc/fsm/WorkerStates.js:99-114` — DISPLAY_LABEL 提取成构造 option，让 generic dispatcher 也能 set `entity.stateLabel`（worker / visitor / animal 都用同样字段）。
3. `src/simulation/npc/fsm/WorkerFSM.js:56-91` — `tickWorker` rename → `tick(entity, state, services, dt)`，因为现在不只是 worker。
4. `src/simulation/npc/WorkerAISystem.js:1653-1654` — 调用站点从 `new WorkerFSM()` 改成 `new PriorityFSM(WORKER_BEHAVIOR, WORKER_TRANSITIONS, WORKER_DISPLAY_LABELS)`。

**二顺位**：完成 Wave-1 后，紧接着删除 docs/systems/03-worker-ai.md 中所有提到 chooseWorkerIntent / planEntityDesiredState / commitmentCycle / DEFAULT_STATE_HOLD_SEC 的段落，重写"Pipeline Overview"为 PriorityFSM 描述（10-15 行就够，参考 WorkerFSM.js 头部 docstring）。这条 doc-code drift 是项目当前最严重的、最容易让新人误解架构的单点 — 修复成本极低。

**禁区**：
- 不要碰 ColonyPlanner / ColonyPerceiver。Refactor-3 是 4-wave 大整理，不是 single-plan 范围，本轮严禁动它们的实现，否则 plan 会爆 400 LOC budget。
- 不要碰 NPCBrainSystem 的 LLM 流水线。debt-brain-1 (POLICY_INTENT_TO_STATE 重复表) 看起来诱人但跨 LLM/local 两条决策路径，需要单独 wave。
