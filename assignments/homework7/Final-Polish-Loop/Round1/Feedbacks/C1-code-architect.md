---
reviewer_id: C1-code-architect
round: 1
date: 2026-05-01
verdict: YELLOW
score: 6
systems_total: 25
grade_A: 4
grade_B: 11
grade_C: 8
grade_D: 2
debt_items_total: 28
debt_resolved_since_last: 0
debt_new_since_last: 1
debt_regressed_since_last: 0
delta: -1
doc_code_drift_count: 3
---

## 摘要（一段）

Round 1 全量重盘 25 个系统（SYSTEM_ORDER 21 项 + 4 个游离系统：StrategicDirector / WildlifePopulationSystem / ConstructionSystem / LogisticsSystem），grade 分布与 Round 0 完全一致（4A/11B/8C/2D，60% A+B 比例），等级零变动。本轮 Round 0 commits 落地的 11 项 plans 中**只有一项触及到 src/simulation/**（B1 在 PopulationGrowthSystem 末尾追加 `__devForceSpawnWorkers` 90-LOC dev helper；其余 10 项 plan 修改集中在 src/app / src/render / src/ui / docs / test）。**核心架构债面貌未变**：(1) VisitorAISystem.js:8-9 + AnimalAISystem.js:8-9 仍 import v0.9.x StatePlanner / StateGraph 三件套，与 v0.10.0 WorkerFSM 黄金范例分裂；(2) WorkerAISystem.js 1734 LOC 中 update() 主循环里 ~250 LOC mood/social/relationship 补丁块仍未拆出；(3) ColonyPlanner (1867) + ColonyPerceiver (1966) 合计 ~3800 LOC 仍是 D 级补丁山。Round 0 真实进展集中在**doc-code drift**：78b346e 同步 docs/systems/03-worker-ai.md 到 v0.10.0 PriorityFSM 描述并新增 `worker-fsm-doc-contract.test.js` 锁测，drift 计数从 7 降到 3（4 条与 worker AI 相关的 drift 全部 resolved）。新增 1 条 debt（**debt-pop-2**: PopulationGrowthSystem.js 现在混着"业务系统 update()"+"dev-only 强力 spawn helper"，违反单一职责，应迁到 src/dev/）。Top-3 重构机会与 Round 0 一致（Refactor-1 generic PriorityFSM 仍是头等机会），但本轮 enhancer 应继续 Refactor-1 Wave-2（迁 Visitor）—— Wave-1（生成 generic dispatcher）实际上 Round 0 没做，仅做了文档侧 wave，所以 enhancer 入口仍然是抽 PriorityFSM<TStateName>。

## 1. 系统全景表（当轮 inventory）

| system_id | source_file | doc_ref | 等级 | 债数 | SLOC | 上一轮等级 | 趋势 |
|---|---|---|---|---|---|---|---|
| SimulationClock | src/app/SimulationClock.js | 01-architecture.md | A | 0 | 35 | A | unchanged |
| VisibilitySystem | src/simulation/world/VisibilitySystem.js | 02-world-grid.md | A | 0 | 126 | A | unchanged |
| ProgressionSystem | src/simulation/meta/ProgressionSystem.js | 05-population-lifecycle.md | C | 2 | 697 | C | unchanged |
| DevIndexSystem | src/simulation/meta/DevIndexSystem.js | 06-logistics-defense.md | A | 0 | 123 | A | unchanged |
| RaidEscalatorSystem | src/simulation/meta/RaidEscalatorSystem.js | 06-logistics-defense.md | A | 0 | 196 | A | unchanged |
| EventDirectorSystem | src/simulation/meta/EventDirectorSystem.js | (none) | B | 1 | 164 | B | unchanged |
| AgentDirectorSystem | src/simulation/ai/colony/AgentDirectorSystem.js | (none) | B | 1 | 456 | B | unchanged |
| ColonyDirectorSystem (wrapped) | src/simulation/meta/ColonyDirectorSystem.js | 04-economy.md (impl) | C | 2 | 981 | C | unchanged |
| RoleAssignmentSystem | src/simulation/population/RoleAssignmentSystem.js | 05-population-lifecycle.md | B | 1 | 729 | B | unchanged |
| PopulationGrowthSystem (RecruitmentSystem) | src/simulation/population/PopulationGrowthSystem.js | 05-population-lifecycle.md | B | 2 | 332 | B | regressed (debt+1) |
| StrategicDirector | src/simulation/ai/strategic/StrategicDirector.js | 03-worker-ai.md (mention) | B | 1 | 898 | B | unchanged |
| EnvironmentDirectorSystem | src/simulation/ai/director/EnvironmentDirectorSystem.js | (none) | B | 1 | 454 | B | unchanged |
| WeatherSystem | src/world/weather/WeatherSystem.js | 04-economy.md (mention) | B | 1 | 298 | B | unchanged |
| WorldEventSystem | src/world/events/WorldEventSystem.js | 06-logistics-defense.md | C | 3 | 1179 | C | unchanged |
| TileStateSystem | src/simulation/economy/TileStateSystem.js | 04-economy.md | B | 1 | 315 | B | unchanged |
| NPCBrainSystem | src/simulation/ai/brains/NPCBrainSystem.js | 03-worker-ai.md | B | 1 | 931 | B | unchanged |
| WarehouseQueueSystem | src/simulation/economy/WarehouseQueueSystem.js | 04-economy.md | A | 0 | 116 | A | unchanged |
| WorkerAISystem | src/simulation/npc/WorkerAISystem.js | 03-worker-ai.md (synced ✓) | B | 3 | 1734 | B | unchanged |
| WorkerFSM (dispatcher) | src/simulation/npc/fsm/WorkerFSM.js | 03-worker-ai.md (synced ✓) | A | 0 | 124 | A | unchanged (now documented) |
| ConstructionSystem | src/simulation/construction/ConstructionSystem.js | 06-logistics-defense.md | B | 1 | 331 | B | unchanged |
| VisitorAISystem | src/simulation/npc/VisitorAISystem.js | 03-worker-ai.md (still stale §11 references planEntityDesiredState) | C | 2 | 692 | C | unchanged |
| AnimalAISystem | src/simulation/npc/AnimalAISystem.js | (none) | C | 2 | 1266 | C | unchanged |
| MortalitySystem | src/simulation/lifecycle/MortalitySystem.js | 05-population-lifecycle.md | C | 2 | 834 | C | unchanged |
| WildlifePopulationSystem | src/simulation/ecology/WildlifePopulationSystem.js | (none) | B | 1 | 509 | B | unchanged |
| BoidsSystem | src/simulation/movement/BoidsSystem.js | 03-worker-ai.md (mention) | B | 1 | 394 | B | unchanged |
| ResourceSystem | src/simulation/economy/ResourceSystem.js | 04-economy.md | C | 2 | 730 | C | unchanged |
| ProcessingSystem | src/simulation/economy/ProcessingSystem.js | 04-economy.md | B | 1 | 249 | B | unchanged |
| ColonyPlanner (sub of AgentDir) | src/simulation/ai/colony/ColonyPlanner.js | (none) | D | 3 | 1867 | D | unchanged |
| ColonyPerceiver (sub of AgentDir) | src/simulation/ai/colony/ColonyPerceiver.js | (none) | D | 2 | 1966 | D | unchanged |
| LogisticsSystem (orphan) | src/simulation/economy/LogisticsSystem.js | 04-economy.md | B | 1 | 135 | B | unchanged |

注：合并 ColonyPlanner / ColonyPerceiver / ColonyDirectorSystem 为 AgentDirector 子系统，frontmatter 的 `systems_total: 25` 同 Round 0 计算口径。

## 2. 各系统判定

### SimulationClock: A

- canonical algorithm：`timeSec += dt; tick += 1;` + 派生 dayNightPhase / lightLevel + 边沿事件。
- 与黄金范例对比：极简 pure-update 系统，本就不需要三段式（无 entity）；功能边界清晰。
- 主要补丁：无。
- 等级理由：35 LOC、零分支。Round 0 之后未变更。

### VisibilitySystem: A

- canonical algorithm：每 tick 对所有 worker / agent 反扫 reveal radius，写入 `state.fog.visibility`。
- 与黄金范例对比：单一职责，输入=actor 列表 + 半径，输出=fog 数组。framework 自洽。
- 等级理由：126 LOC，纯 grid pipeline。Round 0 之后未变更。

### ProgressionSystem: C

- canonical algorithm：DOCTRINE_PRESETS 表驱动 + MILESTONE_RULES 表驱动，但 update() 里 doctrine modifiers 应用散落在多个 if 块。
- 与黄金范例对比：表驱动是"准 framework"，doctrine modifiers 应用未抽象。
- 债条目：
  - **debt-prog-1**: src/simulation/meta/ProgressionSystem.js:6-77 — 5 个 doctrine preset 平面对象表，新增 doctrine = 复制 15 字段 — 推荐：抽象成 `{ id, modifiers: { yieldOps:[...], targetOps:[...], recoveryOps:[...] } }` 复合算子 — LOC est: -120 +60 — [persisting]
  - **debt-prog-2**: src/simulation/meta/ProgressionSystem.js (update 主循环) — survival-score / objectives / milestones 三子系统挤一个 update() — 推荐：拆 DoctrineSystem / ObjectiveSystem / MilestoneSystem — LOC est: 中性 — [persisting]
- 等级理由：未触动，C 维持。

### DevIndexSystem: A

- canonical algorithm：`collectEconomySnapshot → scoreAllDims → computeWeightedComposite → ring-buffer smoothing`。
- 与黄金范例对比：流水线骨架完美。
- 等级理由：教科书级 A，未变更。

### RaidEscalatorSystem: A

- canonical algorithm：`devIndexSmoothed → computeRaidEscalation → state.gameplay.raidEscalation`。
- 等级理由：A，未变更。

### EventDirectorSystem: B

- canonical algorithm：weight-driven event roll + bandit-raid cooldown downgrade。
- 债条目：
  - **debt-evt-1**: src/simulation/meta/EventDirectorSystem.js:28-34 — `NON_RAID_FALLBACK_ORDER` 硬编码 5-item array — 推荐：用 `BALANCE.eventDirectorWeights` 反向推 fallback 顺序 — LOC est: -10 — [persisting]
- 等级理由：B，未变更。

### AgentDirectorSystem: B

- canonical algorithm：`Perceive → Plan → Ground → Execute → Evaluate → Reflect` 六段式 pipeline。
- 与黄金范例对比：Colony-layer 的"Intent → State → Action"对应物。问题：mode 三分叉（agent / hybrid / algorithmic）削弱 framework 统一性。
- 债条目：
  - **debt-agent-1**: src/simulation/ai/colony/AgentDirectorSystem.js:13 + selectMode — `algorithmic` 分支完全 bypass framework 走 ColonyDirectorSystem.update() — 推荐：把 ColonyPlanner / ColonyDirectorSystem 抽象成 `PlanProvider` 接口 — LOC est: -200 — [persisting]
- 等级理由：B 维持。

### ColonyDirectorSystem (algorithmic fallback): C

- canonical algorithm：phase-detection（bootstrap → logistics → processing → fortification → expansion → complete）+ assessColonyNeeds → 排序 build queue。
- 主要补丁：assessColonyNeeds 600+ LOC 充满 if-emergency / if-pop-cap / if-warehouse-ratio 补丁分支。
- 债条目：
  - **debt-col-1**: src/simulation/meta/ColonyDirectorSystem.js:84-(700+) — assessColonyNeeds 长串 `if (条件) needs.push({type, priority, reason})` — 推荐：每 carve-out 抽象成 `BuildHeuristic = (state) => Need[]` 策略对象，主函数 `flatten(map(strategies, s => s(state)))` — LOC est: -350 — [persisting]
  - **debt-col-2**: src/simulation/meta/ColonyDirectorSystem.js (phase determination) — phase 由硬编码 `buildings.farms >= N && buildings.warehouses >= M` 判定 — 推荐：抽象 phase 为 `{id, gates: [(b)=>bool], targets: {...}}` 列表 — LOC est: -40 — [persisting]
- 等级理由：C 维持。

### RoleAssignmentSystem: B

- canonical algorithm：`computePopulationAwareQuotas`（band-table 优先，per-worker 公式 fallback）+ promote/demote 算法 + builder/guard 特殊分支。
- 债条目：
  - **debt-role-1**: src/simulation/population/RoleAssignmentSystem.js (整体) — guard / builder dynamic promotion 与 quota table 走两条路径 — 推荐：把 dynamic promotion 也表驱动 — LOC est: -80 — [persisting]
- 等级理由：B 维持。

### PopulationGrowthSystem (RecruitmentSystem): B（**新增 1 条债**）

- canonical algorithm：`recruitQueue + cooldown + foodCost + warehouse gate` — 1Hz check 流水线。
- Round 0 变化：**1f1eea5 commit 在文件末尾追加 `__devForceSpawnWorkers` (~90 LOC) — 一个 dev-only 强力 spawn helper（绕过 food cost / cooldown / queue gates，仅 honour infraCap）**。代码本身写得规整（含 JSDoc warning），但**职责越界**：业务 system file 不应同时托管 dev/debug surface。
- 债条目：
  - **debt-pop-1**: src/simulation/population/PopulationGrowthSystem.js:1-12 — 文件名 `PopulationGrowthSystem.js` 与 class `RecruitmentSystem` 不一致，需 export alias hack — 推荐：rename 文件 + 同步 import 站点 — LOC est: 中性 — [persisting]
  - **debt-pop-2**: src/simulation/population/PopulationGrowthSystem.js:243-332 — Round 0 1f1eea5 引入 `__devForceSpawnWorkers` dev-only helper，与业务系统 class 同居一个 file，违反"src/simulation/ 是纯生产代码"公约；helper 通过 `__utopiaLongRun.devStressSpawn` 在浏览器全局暴露，但定义在业务 module 里 — 推荐：迁 helper 到 src/dev/forceSpawn.js（或 src/app/longRunDevTools.js，与 longRunTelemetry.js 同居）；保持 import 但把"业务 module 不 export 调试 helper"的边界明确 — LOC est: 中性（搬移） — [new]
- 等级理由：核心算法干净，文件 / class 命名漂移 + 新加 dev helper 越界，B（不掉级，但债 +1）。

### StrategicDirector: B

- canonical algorithm：DEFAULT_STRATEGY + VALID_ENUMS + sanitize/validate 表驱动。
- 债条目：
  - **debt-strat-1**: src/simulation/ai/strategic/StrategicDirector.js (~898 LOC) — 多个 picker 函数（chooseStrategicGoal / chooseDefensePosture / chooseResourceFocus 等）平面 if 链 — 推荐：抽象 `pickField(field, candidates, scorer)` 通用 picker — LOC est: -150 — [persisting]
- 等级理由：B 维持。

### EnvironmentDirectorSystem: B

- canonical algorithm：`buildEnvironmentPerception → buildWorldSummary → LLM/fallback → applyEnvironmentDirective` 流水线。
- 债条目：
  - **debt-env-1**: src/simulation/ai/director/EnvironmentDirectorSystem.js:32+ — fragility 等级判定是 5 段 if-stack — 推荐：FRAGILITY_RULES 数组 first-match — LOC est: -40 — [persisting]
- 等级理由：B 维持。

### WeatherSystem: B

- canonical algorithm：weather state machine + duration timer + transition rules。
- 债条目：
  - **debt-weather-1**: src/world/weather/WeatherSystem.js — `lastTransitionSec` 协议（被 ProcessingSystem 读）是 side-channel scratch field — 推荐：明确 `state.weather.transitionEvents[]` 事件队列 — LOC est: -20 — [persisting]
- 等级理由：B 维持。

### WorldEventSystem: C

- canonical algorithm：从 `state.events.queue` drain，每事件类型独立 dispatch。
- 债条目：
  - **debt-wevt-1**: src/world/events/WorldEventSystem.js (1179 LOC) — 6 个事件类型 handler 各自 100-200 LOC，无公共 EventHandler interface — 推荐：定义 `interface EventHandler { canSpawn / spawn / apply }` — LOC est: -300 — [persisting]
  - **debt-wevt-2**: src/world/events/WorldEventSystem.js — bandit raid 的 raider spawn / sabotage / migration handler 互相 import-cycle-避免，硬编码顺序 — 推荐：用 priority 字段 — LOC est: -50 — [persisting]
  - **debt-wevt-3**: src/world/events/WorldEventSystem.js — 文件不在 src/simulation/ 下（位于 src/world/events/），违反公约 — 推荐：mv → src/simulation/events/ — LOC est: 中性 — [persisting]
- 等级理由：C 维持。

### TileStateSystem: B

- canonical algorithm：每 2s 更新 fertility / wear / salinization / fallow，多张 frozen Set + ADJACENCY_EFFECTS 双层表驱动。
- 债条目：
  - **debt-tile-1**: src/simulation/economy/TileStateSystem.js:7-12 — FERTILITY_RECOVERY_PER_SEC / WEAR_INCREASE_PER_SEC 是文件级 const 而非 BALANCE 字段 — 推荐：迁 BALANCE.tileState — LOC est: 中性 — [persisting]
- 等级理由：B 维持。

### NPCBrainSystem: B

- canonical algorithm：`buildPolicySummary → llmClient.requestPolicies | fallback → normalize → fanout to entity.policy + groupStateTargets`。
- 债条目：
  - **debt-brain-1**: src/simulation/ai/brains/NPCBrainSystem.js:28-61 + src/simulation/npc/state/StatePlanner.js:34-74 — POLICY_INTENT_TO_STATE 在两个 file 中重复（NPCBrainSystem 写入 + StatePlanner 读取）但定义独立维护，已观察到 workers 表项漂移 — 推荐：单一 source 在 src/config/aiConfig.js — LOC est: -60 — [persisting]
- 等级理由：B 维持。

### WarehouseQueueSystem: A

- canonical algorithm：每 tick reset intake tokens + scan queue for timeouts/stale + early-exit。
- 等级理由：A，未变更。

### WorkerAISystem: B

- canonical algorithm：本应是 v0.10.0 之后的"FSM dispatcher only"，但 1734 LOC 主类 update() 仍包含 ~250 LOC 非状态机块。
- Round 0 变化：78b346e 的 doc 同步**没有**改 src — WorkerAISystem 行数 LOC 与 Round 0 完全一致（1734 LOC）。
- 债条目：
  - **debt-worker-1**: src/simulation/npc/WorkerAISystem.js:1500-1680 — update() 主循环中 mood / social / morale-break / relationship 的 ~250 LOC 是非状态机代码 — 推荐：拆 `WorkerMoodSystem` + `WorkerRelationshipSystem`，加入 SYSTEM_ORDER；WorkerAISystem.update() 收缩到只 dispatch FSM — LOC est: -250 +180 — [persisting]
  - **debt-worker-2**: src/simulation/npc/WorkerAISystem.js (handleDeliver / handleHarvest / handleProcess / chooseWorkerTarget / pickWanderNearby / setIdleDesired) — FSM STATE_BEHAVIOR 调用的 helper 仍 export 自 WorkerAISystem 而不是 WorkerHelpers — 推荐：搬到 npc/fsm/WorkerHelpers.js — LOC est: -600 +600（搬移） — [persisting]
  - **debt-worker-3**: src/simulation/npc/WorkerAISystem.js (53 grep hits across 15 files for `worker.debug.lastIntent` / `blackboard.fsm.state` legacy reads) — v0.10.0 retrospective 提到 deferred"cut UI consumers off the legacy display FSM"，仍未完成 — 推荐：标准化为 `worker.fsm.state` / `worker.fsm.stateLabel`，删其他 — LOC est: -120 — [persisting]
- 等级理由：B 维持（未触动）。

### WorkerFSM (dispatcher): A

- canonical algorithm：priority-ordered transition walk + first-match-wins + onEnter/tick/onExit triple。
- 与黄金范例对比：**这就是黄金范例本身**。124 LOC、零分支、扩展 = 加 STATE 项 + 加 transition 行。
- Round 0 变化：78b346e 给 03-worker-ai.md 同步描述并新增 `test/worker-fsm-doc-contract.test.js` 锁测 — **现在文档对得上代码，且锁测保证未来不再漂移**。
- 等级理由：A 维持，且文档资产从"undocumented golden"升级为"locked golden"。

### ConstructionSystem: B

- canonical algorithm：扫描 construction sites → 检查完成 → mutateTile + refund + emit；wallHp regen 是独立子流程。
- 债条目：
  - **debt-cons-1**: src/simulation/construction/ConstructionSystem.js:37-138 — `regenerateWallHp` 与 construction-completion check 同居一 system — 推荐：拆 `WallRegenSystem`，独立列入 SYSTEM_ORDER — LOC est: 中性 — [persisting]
- 等级理由：B 维持。

### VisitorAISystem: C（**关键架构债，未动**）

- canonical algorithm：仍跑在 v0.9.x StatePlanner / StateGraph 上（src/simulation/npc/VisitorAISystem.js:8-9 验证仍然 import）。
- 与黄金范例对比：**两套 NPC AI framework 同时存在**。
- 债条目：
  - **debt-vis-1**: src/simulation/npc/VisitorAISystem.js:8-9 — 仍 import StatePlanner + StateGraph — 推荐：迁移到 VisitorFSM；可与 WorkerFSM 共享 dispatcher 类（generic FSM<TStateName>） — LOC est: +200 -300 — [persisting]
  - **debt-vis-2**: src/simulation/npc/VisitorAISystem.js (sabotage handler ~100 LOC) — sabotage 行为内部 if-stack 是隐藏的 state machine — 推荐：暴露成 sub-states — LOC est: -50 — [persisting]
- 等级理由：C 维持。

### AnimalAISystem: C（**关键架构债，未动**）

- canonical algorithm：与 VisitorAISystem 同病 — 仍 import StatePlanner / StateGraph（src/simulation/npc/AnimalAISystem.js:8-9）。
- 债条目：
  - **debt-anim-1**: src/simulation/npc/AnimalAISystem.js:8-9 — 与 debt-vis-1 合并，共用 generic FSM dispatcher — [persisting]
  - **debt-anim-2**: src/simulation/npc/AnimalAISystem.js (handlePredator / handleHerbivore) — 1266 LOC 中两个巨型 handler 各自 400+ LOC if-stack — 推荐：extract STATE_BEHAVIOR 三件式 — LOC est: -400 — [persisting]
- 等级理由：C 维持。

### MortalitySystem: C

- canonical algorithm：本意是"每 tick 检查 hp / hunger，必要时 markDeath"。
- 主要补丁：834 LOC 中 11 个职责挤一文件。
- 债条目：
  - **debt-mort-1**: src/simulation/lifecycle/MortalitySystem.js:783-806 — medicineHealing 与 mortality 无关 — 推荐：独立成 `HealingSystem` — LOC est: 中性 — [persisting]
  - **debt-mort-2**: src/simulation/lifecycle/MortalitySystem.js:362-435 — `recomputeCombatMetrics` 在 mortality system 维护 combat 指标边界混乱 — 推荐：搬到 RoleAssignmentSystem 或 `CombatMetricsSystem` — LOC est: 中性 — [persisting]
- 等级理由：C 维持。

### WildlifePopulationSystem: B

- canonical algorithm：zone-aware spawn / despawn + biome-aware tile picker + cluster state tracking。
- 债条目：
  - **debt-wild-1**: src/simulation/ecology/WildlifePopulationSystem.js (~509 LOC) — zone-anchor / radius 计算重复 — 推荐：抽 `getZoneCandidates` — LOC est: -60 — [persisting]
- 等级理由：B 维持。

### BoidsSystem: B

- canonical algorithm：经典 boids 三力 + neighbor query via SpatialHash + group profile 表驱动。
- 债条目：
  - **debt-boids-1**: src/simulation/movement/BoidsSystem.js:7-13 — TRAFFIC_NEIGHBOR_OFFSETS 与其他系统重复定义 — 推荐：合并到 constants — LOC est: -10 — [persisting]
- 等级理由：B 维持。

### ResourceSystem: C

- canonical algorithm：sliding-window flow + crisis 检测，但 730 LOC 中 5 子系统挤一文件。
- 债条目：
  - **debt-res-1**: src/simulation/economy/ResourceSystem.js — 5 个子系统（flow tracking / spoilage / crisis detection / per-tile production telemetry / warehouse density risk）挤一 file — 推荐：拆 4 个独立 system — LOC est: 中性 — [persisting]
  - **debt-res-2**: src/simulation/economy/ResourceSystem.js + ProcessingSystem + MortalitySystem — `recordResourceFlow` 是 lazy-init scratch field 的"伪事件总线" — 推荐：正式化为 `state.events.resourceFlow` 队列 — LOC est: -30 — [persisting]
- 等级理由：C 维持。

### ProcessingSystem: B

- canonical algorithm：per-building cooldown timers + weather-aware effective cycle + 3 个 process handler。
- 债条目：
  - **debt-proc-1**: src/simulation/economy/ProcessingSystem.js (#processKitchens / #processSmithies / #processClinics) — 3 个几乎结构相同的 method — 推荐：表驱动 `PROCESSING_RECIPES = [...]` — LOC est: -100 — [persisting]
- 等级理由：B 维持。

### ColonyPlanner (sub of AgentDirector): D

- canonical algorithm：**没有可识别的核心算法**。1867 LOC，LLM-driven build planner + fallback rule-based planner + plan grounding + plan history + replan triggers + skill library lookup 全堆一起。
- 债条目：
  - **debt-cp-1**: src/simulation/ai/colony/ColonyPlanner.js (1867 LOC) — 没有 PlanProvider interface — 推荐：定义 `PlanProvider { proposePlan(state, hints) → Plan }` — LOC est: -800 — [persisting]
  - **debt-cp-2**: src/simulation/ai/colony/ColonyPlanner.js — `shouldReplan` 巨型 OR-of-conditions ~150 LOC — 推荐：`REPLAN_TRIGGERS = [(state) => bool | reason]` 表 — LOC est: -100 — [persisting]
  - **debt-cp-3**: src/simulation/ai/colony/ColonyPlanner.js + src/simulation/meta/ColonyDirectorSystem.js — 两 file phase 判定 / emergency carve-out / warehouse ratio check 大量重复 — 推荐：抽公共 `ColonyAssessment` module — LOC est: -300 — [persisting]
- 等级理由：D 维持。

### ColonyPerceiver (sub of AgentDirector): D

- canonical algorithm：**没有可识别的核心算法**。1966 LOC（项目最大单文件）。
- 债条目：
  - **debt-perc-1**: src/simulation/ai/colony/ColonyPerceiver.js (1966 LOC) — 没有 FieldContributor interface — 推荐：`PERCEIVER_FIELDS = [{ key, compute, importance }]` — LOC est: -1000 — [persisting]
  - **debt-perc-2**: src/simulation/ai/colony/ColonyPerceiver.js + src/simulation/ai/memory/WorldSummary.js — 两 file 大量逻辑重复 — 推荐：合并为 `ColonySnapshotBuilder` — LOC est: -500 — [persisting]
- 等级理由：D 维持。

### LogisticsSystem (orphan, lazy-instantiated): B

- canonical algorithm：grid-version-gated rebuild + 3-tier efficiency 表 + road wear degradation。
- 债条目：
  - **debt-log-1**: src/simulation/economy/LogisticsSystem.js + src/simulation/npc/WorkerAISystem.js:1327 — LogisticsSystem 在 SYSTEM_ORDER 之外被 lazy-init — 推荐：列入 SYSTEM_ORDER — LOC est: -10 — [persisting]
- 等级理由：B 维持。

## 3. 上一轮债追踪

| debt id | 状态 | commit / 证据 |
|---|---|---|
| debt-prog-1 | persisting | 未触动 |
| debt-prog-2 | persisting | 未触动 |
| debt-evt-1 | persisting | 未触动 |
| debt-agent-1 | persisting | 未触动 |
| debt-col-1 | persisting | 未触动 |
| debt-col-2 | persisting | 未触动 |
| debt-role-1 | persisting | 未触动 |
| debt-pop-1 | persisting | 未触动（文件名 vs class 不一致仍在） |
| debt-strat-1 | persisting | 未触动 |
| debt-env-1 | persisting | 未触动 |
| debt-weather-1 | persisting | 未触动 |
| debt-wevt-1 | persisting | 未触动 |
| debt-wevt-2 | persisting | 未触动 |
| debt-wevt-3 | persisting | 未触动 |
| debt-tile-1 | persisting | 未触动 |
| debt-brain-1 | persisting | 未触动 |
| debt-worker-1 | persisting | WorkerAISystem.js LOC 仍 1734（无 src 改动），mood/social 块未拆 |
| debt-worker-2 | persisting | helpers 仍 export 自 WorkerAISystem |
| debt-worker-3 | persisting | grep `worker.debug.lastIntent` 仍 hit 多处 |
| debt-cons-1 | persisting | 未触动 |
| debt-vis-1 | persisting | VisitorAISystem.js:8-9 仍 import StatePlanner + StateGraph |
| debt-vis-2 | persisting | 未触动 |
| debt-anim-1 | persisting | AnimalAISystem.js:8-9 仍 import StatePlanner + StateGraph |
| debt-anim-2 | persisting | 未触动 |
| debt-mort-1 | persisting | 未触动 |
| debt-mort-2 | persisting | 未触动 |
| debt-wild-1 | persisting | 未触动 |
| debt-boids-1 | persisting | 未触动 |
| debt-res-1 | persisting | 未触动 |
| debt-res-2 | persisting | 未触动 |
| debt-proc-1 | persisting | 未触动 |
| debt-cp-1 / debt-cp-2 / debt-cp-3 | persisting | 未触动 |
| debt-perc-1 / debt-perc-2 | persisting | 未触动 |
| debt-log-1 | persisting | 未触动 |
| **debt-pop-2** | **new** | Round 0 1f1eea5 在 PopulationGrowthSystem.js:243-332 引入 dev-only `__devForceSpawnWorkers` |

汇总：`Δ = +0 (resolved) - 1 (new) - 0 (regressed) = -1`。本轮净恶化 1 条（pop-2 新增），但 doc-code drift 改善（4 条 worker AI drift resolved，见 §4），所以**架构整洁度本轮整体持平偏改善（doc 侧）+ 微恶化（src 侧）**。

## 4. Doc-Code Drift

| doc 文件 | claim | 实际代码 | 严重度 |
|---|---|---|---|
| docs/systems/03-worker-ai.md (§11/skill-library 副段) | "VisitorAISystem 仍 reference planEntityDesiredState" — 03 doc 主体已重写为 v0.10.0，但其他 docs/systems/*.md 文件仍**间接** reference 旧 worker AI 概念（例如 03-worker-ai.md §11 末段提到 visitor 也用 StatePlanner） | VisitorAISystem.js / AnimalAISystem.js 仍跑 StatePlanner/StateGraph，所以 03 doc 这段对 visitor/animal 仍**正确**——但读者会误以为整个 npc/state/* 三件套已退役 | 中（doc 应明确标注"worker 端已退役、visitor/animal 端仍在用"） |
| docs/systems/01-architecture.md | SYSTEM_ORDER 列出 21 个 system，含 ColonyDirectorSystem 在 slot 6 | 实际 createSystems() 返回 25 个 instance（含 StrategicDirector / WildlifePopulationSystem / ConstructionSystem 等"游离"项），且 ColonyDirectorSystem 已被 AgentDirectorSystem 替代 | 中 |
| docs/systems/04-economy.md | "WAREHOUSE 间距≥5 tile" | 实际 BuildAdvisor 中 warehouseSpacingTiles 是 BALANCE 配置 | 低 |

**Round 0 已 resolved（不再列出）**：
- ~~docs/systems/03-worker-ai.md "Pipeline: chooseWorkerIntent → StatePlanner / StateGraph → WorkerAISystem"~~ → resolved by 78b346e（重写为 PriorityFSM 描述）
- ~~docs/systems/03-worker-ai.md "WorkerStateGraph 状态：idle/seek_food/eat/seek_task/harvest/deliver/process/wander/seek_rest/rest" 10 个 state~~ → resolved by 78b346e（更新为 12-state inventory，且 worker-fsm-doc-contract.test.js 锁测保护）
- ~~docs/systems/03-worker-ai.md "DEFAULT_STATE_HOLD_SEC (0.8 s) 防止 oscillation"~~ → resolved by 78b346e（明确说 "no hold window, no commitment latch, no hysteresis"）
- ~~docs/systems/03-worker-ai.md "commitmentCycle 锁"~~ → resolved by 78b346e（v0.10.0 状态映射表显式列出已删除）

drift 计数 7 → 3（-4）。这是 Round 0 唯一一项**显著架构改善**。

## 5. 顶层重构机会 (Top-3)

### Refactor-1: 把 Visitor + Animal AI 接入 generic PriorityFSM（与 WorkerFSM 同源）

- 影响：VisitorAISystem (C→B), AnimalAISystem (C→B), npc/state/* 三件套（StatePlanner/StateGraph/StateFeasibility）整体退役（~1167 LOC 删除）
- 思路：WorkerFSM.js 124 LOC 是项目里最 framework-y 的单文件 — 把 dispatcher 抽象成 generic `PriorityFSM<StateName>` class（接收 STATE_BEHAVIOR + STATE_TRANSITIONS map）。然后定义 `VisitorStates`（TRADING / SCOUTING / SABOTAGING / FLEEING / EATING / WANDERING）和 `AnimalStates`（按 species 分两套：HerbivoreFSM = GRAZING / FLEEING / REGROUPING / WANDERING，PredatorFSM = HUNTING / STALKING / FEEDING / PATROLLING / RESTING）。每个 entity type 的 system update() 收缩为"loop entities → fsm.tick(entity, state, services, dt)"。**Round 0 docs synced 为这一步铺好了路 — doc 现在描述 PriorityFSM 抽象，下一步就是把它 generic 化。**
- wave：本轮 enhancer 做 Wave-1（generic dispatcher 抽出），≤200 LOC plan budget；Wave-2 迁 Visitor (Round 2)；Wave-3 迁 Animal (Round 3)。
- 风险：Visitor sabotage / trade / scout 行为有 scenario-specific tweaks，需保证 trace parity；Animal species×state 笛卡尔积需 species-as-payload 设计避免 state 数爆炸。

### Refactor-2: WorkerAISystem.update() 拆分（mood/social/relationship → 独立 sim 子系统）

- 影响：WorkerAISystem (B→A), 新增 WorkerMoodSystem / WorkerSocialSystem 列入 SYSTEM_ORDER
- 思路：src/simulation/npc/WorkerAISystem.js:1500-1680 的 ~250 LOC 与 worker 决策无关 — 是每 tick 的 mood composite / morale break / proximity opinion drift / friendship band crossing。把这块抽成 WorkerMoodSystem（hunger/rest/morale/mood + moodOutputMultiplier）和 WorkerSocialSystem（relationships / proximity / band crossings）独立 update。WorkerAISystem 收缩到 < 1000 LOC，FSM dispatch 成为唯一职责。同时把 export 的 helper（handleDeliver / chooseWorkerTarget / pickWanderNearby 等）迁到 npc/fsm/WorkerHelpers.js。
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
| 文件未列入 SYSTEM_ORDER | src/simulation/economy/LogisticsSystem.js | grep `new LogisticsSystem` 仅在 src/simulation/npc/WorkerAISystem.js:1327 lazy-init，SYSTEM_ORDER 未列 |
| 兼容字段 | src/simulation/npc/WorkerAISystem.js (`worker.debug.lastIntent`) | v0.10.0 retrospective 明确 deferred 删除；grep 显示 ui/panels/EntityFocusPanel.js + ui/panels/InspectorPanel.js 仍读 |
| 兼容字段 | worker.blackboard.fsm | NPCBrainAnalytics.js / WorldSummary.js 仍读 — 仅部分迁移 |
| 配置常量 | src/config/constants.js (FEATURE_FLAGS.USE_FSM) | v0.10.0-d 注释说 "no production code path depends on `false` any more"，但 flag + `_testSetFeatureFlag` 仍 export — 仅测试用 |
| 文件命名漂移 | src/simulation/population/PopulationGrowthSystem.js (class RecruitmentSystem) | 第 1-12 行注释明确 alias for back-compat |
| 重复表 | src/simulation/ai/brains/NPCBrainSystem.js:28-61 vs src/simulation/npc/state/StatePlanner.js:34-74 | POLICY_INTENT_TO_STATE 在两处独立定义，已观察到漂移 |
| **职责越界 (Round 0 新增)** | src/simulation/population/PopulationGrowthSystem.js:243-332 | 1f1eea5 给业务 system file 追加 dev-only `__devForceSpawnWorkers` helper；helper 通过 `__utopiaLongRun` 浏览器全局暴露，但定义在 sim module 里 |

## 7. Verdict

判定：**YELLOW**

理由：
- grade_A + grade_B = 4 + 11 = 15 / 25 = **60%**，达到 YELLOW 门槛（≥50%）但未达 GREEN（≥70%）— 与 Round 0 完全一致。
- grade_D = 2（ColonyPlanner / ColonyPerceiver），超过 GREEN 阈值（必须 = 0），低于 RED 阈值（≥3 才 RED）。
- delta = -1（debt-pop-2 new；无 resolved；无 regressed）— 微恶化但远未触发 RED。
- doc-code drift 改善 7 → 3（4 条 resolved by 78b346e），且 worker-fsm-doc-contract.test.js 锁测确保未来 worker AI doc 不再漂移 — **Round 0 唯一显著架构改善**。
- src 侧两条头号架构债（debt-vis-1 + debt-anim-1，两套 NPC AI framework 并存）和 WorkerAISystem 主类瘦身（debt-worker-1）**完全未触动** — Refactor-1 Wave-1（generic PriorityFSM 抽出）尚未开始，需要 Round 1 enhancer 优先承担。

## 8. 给 enhancer 的具体话术

**如果你只能改 1 件事，先改 Refactor-1 Wave-1：抽出 generic `PriorityFSM<StateName>` dispatcher class。**

理由：Round 0 已经把 docs/systems/03-worker-ai.md 同步到 v0.10.0 PriorityFSM 描述并新增 worker-fsm-doc-contract.test.js 锁测 — **doc 侧 Wave-1 完成，src 侧 Wave-1 现在是关键瓶颈**。WorkerFSM.js 124 LOC 是项目里最 framework-y 的单文件，但锁死在 worker 子文件夹里。把它升格成 `src/simulation/npc/PriorityFSM.js`（generic over state name + behavior map + transition table），是**用最小改动证明 framework 可复用**的关键步骤 — 这一步做完，Visitor 和 Animal 的 FSM 迁移变成"机械填表"。

**关键 file:line 入口**：

1. `src/simulation/npc/fsm/WorkerFSM.js:32-115` — class 改成 generic：构造时不再默认 STATE_BEHAVIOR / STATE_TRANSITIONS，而是要求显式注入。新文件路径建议 `src/simulation/npc/PriorityFSM.js`（脱出 fsm/ 子目录因为 fsm/ 隐含 worker 专属）；保留 fsm/WorkerFSM.js 作为 thin facade，只做 `new PriorityFSM(WORKER_STATE_BEHAVIOR, WORKER_STATE_TRANSITIONS, WORKER_DISPLAY_LABEL)`。
2. `src/simulation/npc/fsm/WorkerStates.js:99-114` — DISPLAY_LABEL 提取成构造 option，让 generic dispatcher 也能 set `entity.stateLabel`（worker / visitor / animal 都用同样字段）。
3. `src/simulation/npc/fsm/WorkerFSM.js:56-91` — `tickWorker` rename → `tick(entity, state, services, dt)`，参数命名 entity 而非 worker，因为现在不只是 worker。
4. `src/simulation/npc/WorkerAISystem.js:1654` — 调用站点从 `this._workerFSM.tickWorker(worker, ...)` 改成 `this._workerFSM.tick(worker, ...)`（保持向后兼容可以临时给 PriorityFSM 加 `tickWorker = this.tick` 别名，下个 wave 删）。
5. **新增** `test/priority-fsm-generic.test.js` — 覆盖 generic dispatcher 的 priority walk / onExit-onEnter ordering / display-label assignment，独立于 WorkerStates 实例化。

**二顺位（如果 Wave-1 plan 还有 budget）**：清理 debt-pop-2 — 把 `__devForceSpawnWorkers` 从 src/simulation/population/PopulationGrowthSystem.js:243-332 搬到 src/dev/forceSpawn.js 或合并进 src/app/longRunDevTools.js（与 longRunTelemetry.js 同居），保持 import 名不变。这是 Round 0 引入的唯一新债，约 90 LOC 搬移成本极低。

**禁区**：
- 不要碰 ColonyPlanner / ColonyPerceiver。Refactor-3 是 4-wave 大整理，不是 single-plan 范围，本轮严禁动它们的实现，否则 plan 会爆 400 LOC budget。
- 不要碰 NPCBrainSystem 的 LLM 流水线。debt-brain-1 (POLICY_INTENT_TO_STATE 重复表) 看起来诱人但跨 LLM/local 两条决策路径，需要单独 wave。
- 不要直接迁 Visitor / Animal 到 generic FSM —— 那是 Wave-2 / Wave-3，本轮只做 generic dispatcher 抽出 + 给 Worker 自己用一遍证明 backward-compatible。Trace parity (同 v0.10.0-c 的 5 hard gates × 7 scenarios A-G) 应该被 plan 显式列入验收标准。
