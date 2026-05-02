# Benchmark Catalog

> **Version**: v0.10.1 (HW7 Final-Polish-Loop R3 + hotfix iter 1-6)
> **Last Updated**: 2026-05-01
> **Total**: 26 presets × 8 runners + 2 metric modules (4 metric groups) + 2 test files
> **Current baseline**: HW7 R3 — DevIndex day-90 = 49.41 / Deaths = 86 (see § 6 below)

---

## 1. Architecture Overview

```
┌─────────────────────────────────┐
│    Benchmark Runners (8)        │   scripts/*.mjs
│  benchmark-runner               │   ← 全系统 A/B 对比
│  perceiver-benchmark            │   ← Perceiver 观察质量
│  planner-benchmark              │   ← Planner 计划生成质量
│  executor-benchmark             │   ← Executor 执行质量
│  evaluator-benchmark            │   ← Evaluator 反思质量
│  director-benchmark             │   ← Director 编排质量
│  skills-benchmark               │   ← Skill Learning 质量
│  ablation-benchmark             │   ← 消融实验 (组件重要性)
├─────────────────────────────────┤
│    Presets (26)                  │   src/benchmark/BenchmarkPresets.js
│  terrain(3) economy(7)          │
│  pressure(5) stress(5)          │
│  infrastructure(6)              │
├─────────────────────────────────┤
│    Metrics                      │   src/benchmark/BenchmarkMetrics.js
│  Task: T_surv T_obj T_res       │
│        T_pop T_pros T_threat    │
│  Cost: C_tok C_min C_lat C_fb   │
│  Quality: D_hall D_adapt        │
│  Infra: I_spread I_road         │
│         I_logis I_wear          │
└─────────────────────────────────┘
```

---

## 2. Benchmark Presets

### 2.1 Terrain Category (3)

| ID | Label | Map Template | Purpose |
|----|-------|-------------|---------|
| `temperate_default` | Temperate Plains (default) | temperate_plains | Baseline flat terrain |
| `fortified_default` | Fortified Basin (default) | fortified_basin | High walls/elevation |
| `archipelago_default` | Archipelago Isles (default) | archipelago_isles | Water barriers, pathfinding stress |

**Agent-Centric?** 部分。这些 preset 仅设置地图模板，不直接测试 AI 行为，但作为 benchmark-runner 的输入时，会对比 AI 与 fallback 在不同地形下的表现差异。

### 2.2 Economy Category (7)

| ID | Label | Resources | Buildings | Purpose |
|----|-------|-----------|-----------|---------|
| `scarce_resources` | Scarce Resources | food:8, wood:6 | — | AI 在资源极度匮乏下的决策优先级 |
| `abundant_resources` | Abundant Resources | food:120, wood:100 | — | AI 在富裕环境下的扩张策略 |
| `developed_colony` | Developed Colony | 80/70/15/10 | 3WH, 8F, 4L, 20W, Q, K, S, HG, C | 已建成殖民地的优化/防御策略 |
| `resource_chains_basic` | Basic Resource Chains | 60/50/15/10 | 2WH, 4F, 3L, Q, HG, K | 基础加工链运行测试 |
| `full_processing` | Full Processing Chain | 80/60/25/15 + meals/med/tools | 全套建筑 | 完整 3 条加工链 |
| `scarce_advanced` | Scarce Advanced Resources | 30/25/5/3 | 1WH, 2F, 2L, Q, HG | 高级资源稀缺下的链建设 |
| `tooled_colony` | Tooled Colony | 80/70/10/6 + tools:3 | 2WH, 5F, 3L, Q, S, HG | 工具加成下的生产效率 |

**Agent-Centric?** **是**。Economy presets 直接影响 AI agent 的策略选择——匮乏环境迫使 AI 优先 bootstrap，丰裕环境测试 AI 是否能升级到 industrialize/process 阶段。

### 2.3 Pressure Category (5)

| ID | Label | Key Params | Purpose |
|----|-------|-----------|---------|
| `high_threat` | High Threat | threat:65, +3 predators | AI 在高威胁下的防御 vs 生产权衡 |
| `large_colony` | Large Colony (20 workers) | +8 workers | AI 管理大规模人口的角色分配 |
| `skeleton_crew` | Skeleton Crew (3 workers) | -9 workers | AI 在最小人力下的优先级排序 |
| `wildlife_heavy` | Wildlife Heavy | +6 herbivores, +3 predators | 生态系统压力下的 AI 适应 |
| `storm_start` | Starting in Storm | storm, 30s | AI 在恶劣天气下的应急策略 |

**Agent-Centric?** **是**。Pressure presets 考验 AI 的危机适应能力 (D_adapt 指标)，例如 skeleton_crew 测试 AI 是否能在 3 个 worker 下生存。

### 2.4 Stress Category (5)

| ID | Label | Key Params | Purpose |
|----|-------|-----------|---------|
| `crisis_compound` | Compound Crisis | -8 workers, food:8, storm, +2 pred | 多重危机叠加的 AI 应急 |
| `island_isolation` | Island Isolation | archipelago, -6 workers, 少资源 | 地形隔离 + 人口不足 |
| `population_boom` | Population Boom | +8 workers, food:30 | 人口过剩 vs 粮食不足 |
| `late_game_siege` | Late Game Siege | 发达殖民地, threat:80, storm, +4 pred | 终局围城考验 |
| `no_director` | No Director (Manual) | disableDirector:true | AI 禁用基线对照组 |

**Agent-Centric?** **是**。Stress presets 是最核心的 agent-centric 测试——它们设计了极端场景来验证 AI 的鲁棒性和降级能力。

### 2.6 Infrastructure Category (6)

| ID | Label | Key Params | Purpose |
|----|-------|-----------|---------|
| `road_connected` | Road-Connected Colony | 15 roads, 2WH, 5F, 3L, Q, HG | 道路连通殖民地的物流效率基线 |
| `road_disconnected` | Disconnected Buildings | 0 roads, 2WH, 5F, 3L, Q, HG | 无道路时建筑效率退化测量 |
| `worker_crowded` | Worker Crowding (12w, 3 sites) | +4 workers, 1WH, 2F, 1L | Worker 拥挤时的分配效率 |
| `worker_spread` | Worker Spread (8w, 12 sites) | 2WH, 4F, 3L, Q, HG, K | Worker 充足站点时的分散度 |
| `logistics_bottleneck` | Logistics Bottleneck | 1WH, 8F, 4L, 2Q, 2HG, K, S, C, 2 roads | 建筑多但仓库/道路不足的瓶颈 |
| `mature_roads` | Mature Road Network | 3WH, 6F, 3L, Q, HG, K, S, 25 roads | 成熟道路网络的长期维护压力 |

**Agent-Centric?** **是**。Infrastructure presets 直接测试 v0.6.9 新增的 JobReservation、RoadNetwork、LogisticsSystem 对 AI 决策的影响，量化道路连通性、Worker 分散度、物流效率等指标。

---

## 3. Benchmark Runners

### 3.1 benchmark-runner.mjs — 全系统 A/B 对比

**目的**: 对比 AI-enabled vs fallback-only 的整体模拟表现。

**方法**: 3 scenarios × 2 conditions × 10 seeds = 60 runs（或 `--presets` 模式 20 presets × 2 × 10 = 400 runs）。每次运行 300s 模拟。

**测量**:
- Task 指标: T_surv, T_obj, T_res, T_pop, T_pros, T_threat, T_composite
- Cost 指标: C_tok, C_min, C_lat, C_fb
- Decision 质量: D_hall, D_adapt

**Agent-Centric?** **是（核心 benchmark）**。直接对比 AI agent 与纯算法 fallback 的性能差异。

### 3.2 perceiver-benchmark.mjs — Perceiver 观察质量

**目的**: 评估 ColonyPerceiver 生成的结构化观察是否准确、完整、可操作。

**方法**: 运行模拟，定期采样 observation，用 LLM judge 评分。

**测量**: 观察完整性、信息密度、可操作性。

**Agent-Centric?** **是**。直接测试 AI agent 的感知层 (Phase 1)。

### 3.3 planner-benchmark.mjs — Planner 计划质量

**目的**: 评估 ColonyPlanner 的 prompt 构建、响应验证、fallback 计划质量。

**方法**: Prompt 构建效率、响应验证鲁棒性、trigger 逻辑、端到端 LLM 计划生成。

**测量**: 计划可行性、资源估算准确性、步骤合理性。

**Agent-Centric?** **是**。直接测试 AI agent 的规划层 (Phase 3)。

### 3.4 executor-benchmark.mjs — Executor 执行质量

**目的**: 评估 SkillLibrary + PlanExecutor 的计划落地能力。

**方法**: Skill 可行性评估、位置提示解析、terrain-aware 放置、端到端执行。

**测量**: Skill 前置条件检查准确性、放置成功率、地形适应性。

**Agent-Centric?** **是**。直接测试 AI agent 的执行层 (Phase 4)。

### 3.5 evaluator-benchmark.mjs — Evaluator 反思质量

**目的**: 评估 PlanEvaluator 的步骤评估、失败诊断、反思生成能力。

**方法**: 预测解析准确性、步骤评估 (buildSuccess×0.6 + predictionAccuracy×0.4)、失败诊断 (8 种原因)、反思生成与 memory 存储。

**测量**: 诊断准确性、反思可操作性、学习有效性。

**Agent-Centric?** **是**。直接测试 AI agent 的评估层 (Phase 5) + Reflexion 机制。

### 3.6 director-benchmark.mjs — Director 编排质量

**目的**: 评估 AgentDirectorSystem 的全流程编排能力。

**方法**: 模式选择测试 (agent/hybrid/algorithmic)、计划生命周期、A/B 对比 vs ColonyDirectorSystem、降级测试、memory 集成、多模板压力测试。

**测量**: 模式选择准确性、计划完成率、降级处理、multi-template 一致性。

**Agent-Centric?** **是**。直接测试 AI agent 的顶层编排。

### 3.7 skills-benchmark.mjs — Skill Learning 质量

**目的**: 评估 Phase 6 (Voyager-inspired skill learning) 的学习质量。

**方法**: Built-in skills 测试、学习管线测试、prompt tuning 验证、LearnedSkillLibrary 集成、端到端 skill learning。

**测量**: Skill 提取准确性、签名相似度、学习后复用率。

**Agent-Centric?** **是**。直接测试 AI agent 的学习层 (Phase 6)。

### 3.8 ablation-benchmark.mjs — 消融实验

**目的**: 量化每个 AI 组件的贡献度。

**方法**:
- Part 1: 端到端集成测试 (6 phase 均可达)
- Part 2: 消融实验 (禁用单组件，测量退化)
  - Baseline (ColonyDirectorSystem)
  - Full Agent (全 6 phase)
  - −Perceiver, −Planning, −Evaluation, −Memory, −SkillLearning
  - 组合消融 (−Eval−Memory−Learn)
- Part 3: 多模板×多种子统计分析

**测量**: 各组件对 T_composite 的贡献度、降级幅度。

**Agent-Centric?** **是（最彻底的 agent-centric benchmark）**。系统性地验证每个 AI 组件的不可替代性。

---

## 4. Metrics Schema

### 4.1 Task Performance (computeTaskScore)

| Metric | Formula | Weight in Composite | Description |
|--------|---------|---------------------|-------------|
| T_surv | survivalSec / maxSurvivalSec | 20% (10%+10%) | 存活时间比 |
| T_obj | completedObjectives / totalObjectives | 25% | 目标完成率 |
| T_res | 1 − avg(CV_food, CV_wood) | 10% | 资源稳定性 (变异系数) |
| T_pop | 1 − deathsTotal / initialWorkers | 10% | 人口保存率 |
| T_pros | timeWeightedAvg(prosperity) / 100 | 15% | 繁荣度 |
| T_threat | 1 − timeWeightedAvg(threat) / 100 | 10% | 威胁管理 |
| **T_composite** | **weighted sum** | **100%** | **综合得分** |

### 4.2 Cost Efficiency (computeCostMetrics)

| Metric | Formula | Description |
|--------|---------|-------------|
| C_tok | totalTokens / llmDecisions | 每次 LLM 决策的 token 消耗 |
| C_min | tokens × costPerToken / gameDurationMin | 每分钟游戏的 API 成本 |
| C_lat | avgLatency / 20000 | 延迟效率 (归一化) |
| C_fb | fallbackDecisions / totalDecisions | Fallback 比例 |

### 4.3 Decision Quality (computeDecisionQuality)

| Metric | Formula | Description |
|--------|---------|-------------|
| D_hall | clampedValues / totalValues | 幻觉率 (guardrail clamp 频率) |
| D_adapt | crisisResponses / crisisEvents | 危机适应率 |

### 4.4 Infrastructure (computeInfrastructureScore)

| Metric | Formula | Weight in Composite | Description |
|--------|---------|---------------------|-------------|
| I_spread | mean(uniqueTargets / aliveWorkers) | 30% | Worker 分散度 (越高 = 分配越均匀) |
| I_road | 1 − (components−1) / max(1, roadTiles/4) | 25% | 道路连通性 (单连通分量 = 1.0) |
| I_logis | connected / (connected + isolated) | 25% | 物流覆盖率 (生产建筑连接比) |
| I_wear | 1 − avgRoadWear | 20% | 道路健康度 (0=损毁, 1=完好) |
| **I_composite** | **weighted sum** | **100%** | **基础设施综合得分** |

---

## 5. Agent-Centric 分析

### 5.1 总体判断

**整个 benchmark 系统是高度 agent-centric 的。** 8 个 runner 中有 7 个直接测试 AI agent 的各层能力，1 个 (benchmark-runner) 做全系统 A/B 对比。20 个 preset 中 17 个用于为 AI agent 构造不同决策场景，仅 3 个 terrain preset 可视为中性基线。

### 5.2 Agent Pipeline 覆盖矩阵

| AI Phase | 对应 Runner | 覆盖深度 |
|----------|-----------|---------|
| Phase 1: Perceiver | perceiver-benchmark | ★★★ 直接测试观察质量 |
| Phase 2: SkillLibrary | executor-benchmark, skills-benchmark | ★★★ |
| Phase 3: Planner | planner-benchmark | ★★★ |
| Phase 4: Executor | executor-benchmark | ★★★ |
| Phase 5: Evaluator | evaluator-benchmark | ★★★ |
| Phase 6: SkillLearning | skills-benchmark | ★★★ |
| Director (编排) | director-benchmark | ★★★ |
| 全系统 | benchmark-runner, ablation-benchmark | ★★★ |

### 5.3 覆盖状态 (v0.6.9 更新)

v0.6.9 新增系统现已被 infrastructure category presets + `computeInfrastructureScore` 指标覆盖：

| 系统 | 覆盖方式 | 对应 Preset | 对应指标 |
|------|---------|------------|---------|
| **JobReservation** (A1) | 采样 reservationCount | worker_crowded, worker_spread | I_spread |
| **RoadNetwork** (B1) | 采样 roadTiles/roadComponents | road_connected, road_disconnected | I_road |
| **RoadPlanner** (B3) | 间接 (通过道路 preset 对比) | road_connected vs road_disconnected | I_road |
| **LogisticsSystem** (B4) | 采样 logisticsConnected/Isolated | logistics_bottleneck, mature_roads | I_logis |
| **Occupancy-Aware Scoring** (A2) | 采样 avgWorkerSpread | worker_crowded, worker_spread | I_spread |
| **Road Wear Mechanics** (B5) | 采样 avgRoadWear | mature_roads | I_wear |

---

## 6. 文件索引

| File | Lines | Purpose |
|------|-------|---------|
| `src/benchmark/BenchmarkPresets.js` | ~420 | 26 preset 定义 + applyPreset |
| `src/benchmark/BenchmarkMetrics.js` | ~214 | 4 组指标计算函数 (Task/Cost/Quality/Infrastructure) |
| `scripts/benchmark-runner.mjs` | ~470 | AI vs fallback A/B 对比 |
| `scripts/perceiver-benchmark.mjs` | ~400 | Perceiver 质量评估 |
| `scripts/planner-benchmark.mjs` | ~554 | Planner 质量评估 |
| `scripts/executor-benchmark.mjs` | ~500 | Executor 质量评估 |
| `scripts/evaluator-benchmark.mjs` | ~718 | Evaluator 质量评估 |
| `scripts/director-benchmark.mjs` | ~560 | Director 编排评估 |
| `scripts/skills-benchmark.mjs` | ~450 | Skill Learning 评估 |
| `scripts/ablation-benchmark.mjs` | ~636 | 消融实验 |
| `test/benchmark-presets.test.js` | ~103 | Preset 验证测试 |
| `test/benchmark-metrics.test.js` | ~168 | Metrics 验证测试 |

---

## 6. HW7 Final-Polish-Loop bench results (R0 → R3 + hotfix iter 1-6)

Source: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` Round 0/1/2/3
closeout entries + hotfix iter 1-6 commits (3f87bf4 .. 2f31346).

### 6.1 DevIndex / Deaths trajectory (regression-only bench, day-90)

| Round | DevIndex | Δ vs HW6 (37.77) | Deaths | Δ vs HW6 (157) | Tests pass/total | Notes |
|------:|---------:|-----------------:|-------:|---------------:|------------------|-------|
| HW6 R9 | 37.77 | baseline | 157 | baseline | — | HW6 closing baseline |
| **HW7 R0** | **46.66** | **+23.5%** | **43** | **−72.6%** | 1665 / 1673 | A5 BALANCE pass moved 3:11 starvation crash to ~6:30+ runway |
| **HW7 R1** | **53.53** | **+41.7%** | **77** | −51% | 1701 / 1708 | A5 reconnected `entity.hunger` → fail-state restored intentionally (per A5 plan §5) |
| **HW7 R2** | **47.66** | +26.2% | **60** | −62% | 1723 / 1732 | DevIndex −10.97% vs R1, inside the A5 ≤30% corridor; emergency-relief no longer unconditional |
| **HW7 R3** | **49.41** | **+30.8%** | **86** | −45% | 1766 / 1776 | A5 zero-farm safety net + recovery essential whitelist trigger fail-state reliably (intentional, R4 backlog) |
| Hotfix iter 1-6 | (no separate bench) | — | — | — | **1782 / 1784** | Batch A boids regression-defense + iter5 prompt-payload tests; pre-existing failures unchanged |

Test count delta R0 → R3: **+101 new tests over 4 rounds** (1665 → 1766).
Hotfix iter 1-6 added the boids regression-defense battery and iter-5 prompt-payload
tests, landing at 1782 / 1784.

### 6.2 Pre-existing test failures (unchanged across all rounds)

These five failures persist throughout HW7 R0 → hotfix iter 6 and are **not**
caused by the polish-loop or hotfix work. They are tracked as known-pre-existing
in the Validator gate; do not budget polish-loop rounds against them.

- `food-rate-breakdown` (regression test, sampler boundary)
- `RoleAssignment STONE worker` (assignment ordering)
- `raid-escalator log curve` (BALANCE shape)
- `RaidFallbackScheduler popFloor` (fallback floor)
- `scenario E walled-warehouse` (scenario-specific)

### 6.3 R3 perf knobs (NEW)

Two cadence gates landed in R2/R3 to address A2 perf YELLOW without breaking
the headless RAF measurement caveat (see § 6.4):

- **AgentDirector heavy-work gate** — 0.5 s sim-time gate around heavy
  director re-evaluation; preserves a fast-path so emergencies still fire
  immediately. Commit `37581ec`.
- **ProgressionSystem scan gate** — 0.25 s dt-accumulator gate around the
  achievement / milestone scan that previously walked the whole entity list
  every tick. Commit `37581ec`.

Combined effect: `__perftrace.frameMs ≈ 0.4 ms` after the gates land
(measured under headless harness; topSystems peaks <6 ms).

### 6.4 Headless RAF cap — measurement caveat (NOT a project bug)

Playwright headless Chromium with default flags backgrounds the offscreen
renderer and clamps `requestAnimationFrame` to ~1 Hz. This is why R0 → R3
P50 readings (54.5 / 55 / 56) cluster around the throttle and do not reflect
the project's actual frame budget. The R3 closeout (PROCESS-LOG line 514+)
formalises the methodology rule: any future FPS measurement **must** either

- launch Playwright Chromium with **all three** of
  `--disable-renderer-backgrounding`, `--disable-background-timer-throttling`,
  `--disable-backgrounding-occluded-windows`, **or**
- cite `window.__perftrace.topSystems` / `__perftrace.frameMs` as the
  ground-truth perf signal.

Citing a raw fps number from a default-flag headless run is grounds for
that report being marked UNRELIABLE-MEASUREMENT in the Validator gate.

See `docs/benchmark-methodology-review.md` § 7 for the full caveat and
`assignments/homework7/Post-Mortem.md` § 4.5 for the canonical R3 cross-link.
