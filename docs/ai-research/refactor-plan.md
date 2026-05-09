# Project Utopia → Academic Benchmark Refactor Plan

**Status:** Draft v1 (2026-05-09)
**Companion to:** `docs/ai-research/benchmark_proposal.md`
**Codebase baseline:** v0.10.0 (commit on `main`, FSM rewrite完成)

> 本文档把"砍掉游戏性、保留科研内核"的全部决策、阶段、文件清单、风险和验收标准固化下来。任何协作者拿到这份文档都应该能在不读对话历史的情况下接手执行。

---

## 0. Context

仓库现状是一个 Three.js 殖民地模拟游戏，在 v0.8.0 "Living World" 之后堆积了大量为"游戏多样性 / 真实感 / 玩家体验"服务的内容。现在要把它改造成 LLM 长程规划 + 资源分配的学术基准（参见 `benchmark_proposal.md` 的研究论点），论文运行环境是 **headless SimHarness**，不需要：

- Three.js 渲染、HUD、Inspector、storyteller、PressureLens、纹理
- 浏览器引导、Vite 服务、replay/leaderboard/snapshot/devModeGate
- 多样化生态（多种 wildlife 种群、流浪商人、剧情场景、成就系统）
- 大量 BALANCE 调校项（spoilage 速率、招募冷却、wildlife leash 半径等）
- 1646 个测试中针对 UI / 平衡回归 / 修补热补丁的部分

但要保留：

- **4 个 LLM 通道**：environment-director / npc-policy / strategic-plan / colony-agent
- **决定性底层**：A* / Boids / 种子化 RNG / 网格 / 路径缓存
- **schema + guardrails 钳制**
- **DevIndex 6 维评估 + RAE / 群体动力学 / 记忆退化指标**
- **现有 `src/benchmark/` 框架**（DimensionPlugin、Bayesian ScoringEngine、SimHarness、ProbeCollector、ScenarioSampler、CrisisInjector、DecisionTracer）— 复用而非另起炉灶

## 1. Goals

| # | 目标 | 验收 |
|---|---|---|
| G1 | 整个仓库代码量从 ~133k LOC 砍到 ~36k（删除 ~67%） | 见 §2 LOC 表 |
| G2 | `node --test test/*.test.js` 测试基线从 1646/0/2 收敛到约 800/0/2 | 全部 KEEP 桶绿 |
| G3 | SimHarness 在所有保留场景下与未重构前 trace 一致（fallback 模式同种子哈希相同） | Phase 0 determinism audit 通过 |
| G4 | 4 通道 LLM action space 与 `ResponseSchema.js` 定义保持完全一致 | schema 测试不变 |
| G5 | 论文实验脚本 `scripts/benchmark-paper.mjs` 一键产出 LaTeX 表 | Phase S6 末尾交付 |

## 2. Top-line LOC accounting

| 层 | 现在 | 保留 | 简化 | 删除 | 删除占比 |
|---|---:|---:|---:|---:|---:|
| 浏览器外壳（render + ui + audio + dev + index.html + main.js + vite.config）| ~30,000 | 0 | 0 | **~30,000** | 100% |
| `src/app/` | ~6,400 | ~1,800 | ~600 | ~4,000 | 63% |
| `src/simulation/` | ~36,000 | ~26,000 | ~3,000 | **~7,000** | 19% |
| 测试 `test/` | ~48,800 | ~5,000 | ~3,000 | **~40,000** | 82% |
| 场景 + 平衡（Grid + ScenarioFactory + balance + constants）| ~7,040 | ~1,500 | ~500 | ~5,000 | 71% |
| 服务端 + Prompts + LLM 层 | ~2,920 | ~700 | ~400 | ~1,800 | 62% |
| `src/benchmark/` 框架 | ~2,250 | ~1,450 | ~600 | ~200 | 9% |
| **合计** | **~133k** | **~36k** | **~8k** | **~89k** | **~67%** |

> 数值来自三个并行审计 agent（详细分类见 Appendix A）。所有 LOC 为估计，单位精度 10。

---

## 3. What's cut — 整片删除（无副作用）

### 3.1 浏览器外壳（~30k LOC，100% CUT）

跨目录反向 import 已 sanity-check：仅 3 处需调整。

```
src/render/             6 文件 / 6,649 LOC
  SceneRenderer.js          4,572   Three.js 场景、instanced mesh、toast
  PressureLens.js             842   热力图覆盖
  ProceduralTileTextures.js   727   tile canvas 纹理
  AtmosphereProfile.js        361   按天气调色
  FogOverlay.js               130   雾 mesh
  visualAssetDebug.js          17   debug stub

src/ui/                17 文件 / 11,116 LOC
  hud/HUDController.js       2,448
  hud/storytellerStrip.js      881
  hud/GameStateOverlay.js      739
  hud/{Minimap,glossary,nextActionAdvisor,autopilotStatus}.js  606
  interpretation/{WorldExplain,EntityVoice}.js                 831
  panels/EntityFocusPanel.js                                 1,211
  panels/InspectorPanel.js                                     576
  panels/DeveloperPanel.js                                     536
  panels/PerformancePanel.js                                   370
  panels/AI{Decision,Exchange,Automation,PolicyTimeline}Panel.js 901
  panels/EventPanel.js                                         137
  tools/BuildToolbar.js                                      1,810

src/audio/AudioSystem.js   86           Web Audio
src/dev/forceSpawn.js     108           控制台调试
index.html              4,062
src/main.js               284           浏览器引导
vite.config.js             45
```

**反向 import 修复（3 处）：**
- `src/simulation/lifecycle/MortalitySystem.js:9` — 删 audio import
- `src/simulation/population/PopulationGrowthSystem.js:339` — 删 dev re-export
- `src/entities/EntityFactory.js` — 4 个 `app/*` import 待替换（uiProfileState → 硬编码 `"full"`、performanceTelemetry/aiRuntimeStats → 保留或 stub、controlSanitizers display 半 → stub）

### 3.2 `src/app/` 的玩家服务层（~4k LOC CUT）

| 文件 | LOC | 处置 | 备注 |
|---|---:|---|---|
| `GameApp.js` | 2,910 | **CUT** | 仅 `test/food-rate-consistency.test.js` 引用，迁去 SimHarness 后整删 |
| `snapshotService.js` | 392 | **CUT** | save/load 是玩家功能；benchmark 用 manifest+seed 复现 |
| `leaderboardService.js` | 219 | **CUT** | localStorage 排行榜 |
| `devModeGate.js` | 189 | **CUT** | URL `?dev=1` / Ctrl-Shift-D |
| `shortcutResolver.js` | 144 | **CUT** | 键盘快捷键 |
| `replayService.js` | 21 | **CUT** | 玩家回放环形缓冲 |
| `perfCapHonest.js` | 30 | **CUT** | HUD only |
| `GameLoop.js` | 58 | **CUT** | rAF 包装；SimHarness 自驱 tick |
| `simStepper.js` | 49 | **CUT** | SimHarness 直调 systems |

**`src/app/` KEEP（~1,800 LOC）：**

| 文件 | LOC | 理由 |
|---|---:|---|
| `rng.js` | 74 | 种子化 RNG，论文复现性根基 |
| `SimulationClock.js` | 35 | 模拟时钟系统（SimHarness 依赖）|
| `runOutcome.js` | 109 | 胜负 / DevTier 评估 |
| `longRunTelemetry.js` | 292 | 长程采样汇总（直接对应 benchmark）|
| `aiRuntimeStats.js` | 172 | LLM 调用计数（§S5 扩 token 字段）|
| `warnings.js` | 91 | 6 个 simulation 文件 import |
| `math.js` | 27 | clamp/lerp/dist |
| `id.js` | 11 | id 序列 |
| `createServices.js` | 181 → ~120 | **SIMPLIFY**：删 replayService / leaderboardService 行 + `createServicesForFreshBoot`(URL/localStorage) |
| `controlSanitizers.js` | 176 → ~80 | **SIMPLIFY**：保留 `DEFAULT_BENCHMARK_CONFIG` + `state.controls`，删 `DEFAULT_DISPLAY_SETTINGS` 半 |
| `uiProfileState.js` | 12 | **CUT 文件** + EntityFactory 中硬编码 `"full"` |
| `performanceTelemetry.js` | 136 → ~50 | **SIMPLIFY** 为最小计数器；或 CUT 并删 `state.performance` 字段（benchmark 自带 perf）|
| `types.js` | 428 | KEEP（仅 JSDoc，零运行时成本）|

### 3.3 测试层 (~40k LOC / ~300 文件 CUT)

按 regex 分桶（first-match-wins，去重）：

| 桶 | 文件数 | 处置 | 注 |
|---|---:|---|---|
| ui-hud-render | 65 | **CUT 全部** | HUD/toast/lens/storyteller/voice/jargon |
| ai-llm | 67 | **保留 ~25 / CUT ~40** | KEEP: schema, guardrails, PromptPayload, LLMClient, decision-scheduler, brain-fallback。CUT: tone, automation/exchange-panel UI, story tone |
| worker-npc-combat | 59 | **保留 ~10 / CUT ~50** | KEEP minimal contract: eat-when-hungry / deposit-when-full / A*-avoid / idle-when-no-job / dies-without-food。CUT 30+ balance/regression/hotfix |
| building-economy 平衡 | 46 | **保留 ~3 / CUT ~43** | KEEP: map-generation, world-event-spatial, construction-completes |
| progression-score | 28 | **CUT 全部** | milestone, dev-index UI, survival-score, balance-*, exploit-regression, world-explain, leaderboard |
| 其它（perf/scenario/event-director/role/proxy/ui-layout/balance hotfix）| 43 | **保留 ~3 / CUT ~40** | KEEP: perf-budget, weather-spatial, scenario-objective-regression |
| benchmark + harness + long-run + rng-determ | 20 | **保留全部** | 已是 paper-grade |
| navigation | 14 | **保留 ~10 / CUT ~4** | KEEP: astar, navigation-repath, path-fail, reachab, spatial-hash, grid-cache, boids。CUT: road-*, gate-faction |
| wildlife / animal / ecology | 5 | **CUT 全部** | 与 §4.4 决策联动 |

**最终：**保留 35–45 个测试文件，约 5,000 LOC，1646 测试 → 约 800–900 测试。

### 3.4 服务端 + LLM 层瘦身

| 文件 | 现 LOC | 目标 LOC | 处置 |
|---|---:|---:|---|
| `server/ai-proxy.js` | 786 | ~150 | 去除 model-name normalization (`mimi→mini`)、3 段 retry/backoff、env-loader 复杂分支；保留 schema+guardrails 调用、单端点版本 |
| `src/simulation/ai/llm/LLMClient.js` | 482 | ~150 | 去 retry/fallback chain，保留 request/parse |
| `src/simulation/ai/llm/PromptBuilder.js` | 925 | ~450 | 删 fallback-policy 构造分支（论文要暴露 LLM-only failure modes，不应静默回退）|
| `src/simulation/ai/llm/PromptPayload.js` | 205 | 不变 | KEEP（payload 即基准 contract）|
| `src/simulation/ai/llm/ResponseSchema.js` | 123 | 不变 | KEEP |
| `src/simulation/ai/llm/Guardrails.js` | 177 | 不变 | KEEP |
| `src/data/prompts/*.md` | 4 文件 / 225 LOC | 不变 | KEEP 全部（4 个 prompt = action space 文档）|

---

## 4. Decision points（需要项目所有者拍板）

每个决策对应论文一个章节是否存在。**未拍板前各项默认按"建议"处理，但必须显式记录。**

### 4.1 Voyager 风技能学习
- **文件**：`ai/colony/SkillLibrary.js` (600) + `ai/colony/LearnedSkillLibrary.js` (400)
- **影响**：保留 → 论文有 Reflexion-类技能归纳维度；CUT → 主论点更聚焦
- **建议**：**CUT**。Voyager 类是另一篇论文。如保留，需在 paper §2 加一段对照。
- **回收**：在 `feature/skill-library-archive` git tag 上保留代码，不要硬删

### 4.2 多级处理链（meals / medicine / tools）
- **文件**：`economy/ProcessingSystem.js` (250) + `colony/proposers/ProcessingProposer.js` (90)
- **影响**：CUT → 资源空间塌缩为 4 元 (food/wood/stone/herbs)；保留 → RAE 多了"原料 vs 精制品"二级选择
- **建议**：**CUT**。RAE 在原始资源上信号已充分，多级链增加 prompt 长度但不增加评测维度

### 4.3 长程土壤动态
- **文件**：`economy/TileStateSystem.js` (320)
- **影响**：CUT → 农场不需要轮换；保留 → 24h harness 才有自然时间压力
- **建议**：**保留**。`benchmark_proposal.md §3.4` 的长程记忆 harness 强依赖此模块；否则 24h 跑出来是稳态

### 4.4 野生动物 + 流浪商人
- **文件**：`ecology/WildlifePopulationSystem.js` (550) + `npc/AnimalAISystem.js` (1,230) + `npc/VisitorAISystem.js` (720) 中 trader 部分 + `fsm/Visitor*.js` (4 文件 / 350)
- **影响**：CUT → environment 通道剩 weather + raid 两类压力（充足）；保留 → 多压力源更接近真实
- **建议**：**CUT 野生动物 + trader，保留 raider**（作为唯一 hostile pressure，~800 LOC 留 raid 路径）。简化 ~2,500 LOC

### 4.5 算法兜底自驾 vs LLM Colony Agent
- **文件**：`meta/ColonyDirectorSystem.js` (1,000) + `population/RoleAssignmentSystem.js` (820)
- **建议**：**保留 + 加 runMode 闸门**。
  - LLM-on 模式 → muted（colony-agent 通道接管）
  - LLM-off 模式 → 作为 control arm baseline
  - 这是论文对照实验的天然 baseline，免费的

### 4.6 渐进建造 vs 原子建造
- **文件**：`construction/ConstructionSystem.js` (330) + `ConstructionSites.js` (320)
- **建议**：**保留**。原子建造让 LLM 错误零成本，会破坏 RAE 的"决策代价"维度

### 4.7 部分可观测 + 阵营寻路
- **文件**：`world/VisibilitySystem.js` (170) + `navigation/Faction.js` (80)
- **建议**：**保留 + 加 FOG / FACTION 开关**。`benchmark_proposal.md §2.3` 把 partial observability 列为遗留盲点；保留它就开了一个 ablation 维度

### 4.8 Progression / EventDirector / RaidEscalator
- **文件**：`meta/ProgressionSystem.js` (920) + `EventDirectorSystem.js` (190) + `RaidEscalatorSystem.js` (230)
- **建议**：
  - `Progression` **CUT**（成就 / 主义 / 里程碑是游戏化）
  - `EventDirector` **简化**（只留单一压力类型）
  - `RaidEscalator` **保留**（DevIndex tier→压力强度耦合就是"长程 + 自适应"信号）

### 4.9 地图模板：6 → 2（+1 可选）
- **保留**：`temperate_plains`（baseline）+ `fortified_basin`（防御 + 瓶颈推理）
- **可选保留**：`archipelago_isles`（如果想保留 bridge/water 推理；对应 `BridgeProposer`）
- **CUT**：`coastal_ocean` / `fertile_riverlands` / `rugged_highlands`（地形拓扑相同的造型变种）
- **省 ~700 LOC** in `Grid.js` + 大批 ScenarioFactory voice 文本

### 4.10 ScenarioFactory 剧情包装
- **文件**：`src/world/scenarios/ScenarioFactory.js` (1,583 LOC)
- **建议**：**CUT 剧情外壳，保留 ~80 LOC 的 grid-stamping helper**。新建 `src/benchmark/scenarios/StampHelpers.js` 收纳 `clearFootprint` / `stampCluster` / `stampRoad`，benchmark 直接用种子 + helper 构造初始状态

### 4.11 Decision matrix（拍板表）

| ID | 决策项 | 建议 | 拍板 |
|---|---|---|---|
| D1 | SkillLibrary | CUT + tag archive | _待定_ |
| D2 | ProcessingSystem | CUT | _待定_ |
| D3 | TileStateSystem | KEEP | _待定_ |
| D4 | Wildlife + Trader | CUT (raider stays) | _待定_ |
| D5 | Algorithmic baseline + runMode | KEEP+gate | _待定_ |
| D6 | Construction (progressive) | KEEP | _待定_ |
| D7 | Visibility + Faction | KEEP+toggle | _待定_ |
| D8 | Progression / EventDirector / RaidEscalator | CUT / SIMPLIFY / KEEP | _待定_ |
| D9 | 地图模板 | 保留 2 + 1 可选 | _待定_ |
| D10 | ScenarioFactory | CUT 剧情，保 80 LOC helper | _待定_ |

---

## 5. Execution phases

依赖关系：S0 → S1 → S2 → S3 → S4 → S5 → S6 → (S7 长程 harness 可后置)

### S0 — 基线快照与 determinism audit（半天 + 1 天）

**目标**：建立可对比的"重构前"基线 + 回答 `benchmark_proposal.md` Appendix B 4 问。

**Tasks**:
- [ ] `node --test test/*.test.js` → 记录 1646/0/2 + 用时
- [ ] 跑 5 个 benchmark preset 在 fallback 模式 × 2 次，记录 state hash 是否相同
- [ ] AST 扫 `Math.random()` 调用 → `tools/audit/rng-coverage-report.js`
- [ ] PathWorkerPool 与同步 A* 等价性测试 → `tools/audit/pathworker-equivalence.js`
- [ ] MemoryStore 截断策略文档化 → 如未截断需补 + 记入 `tools/audit/memory-truncation-spec.md`
- [ ] 输出 `docs/ai-research/determinism-report.md`

**Exit criteria**：
- 同种子 fallback 跑两次 trace 哈希相同
- 4 问全部书面回答（rng 覆盖、pathworker 等价、memory 截断、groupContracts 版本）
- 失败的话标记并在 S1+ 修

### S1 — 浏览器外壳整片下线（1 天）

**Tasks**:
- [ ] CUT `src/render/`（6 文件）
- [ ] CUT `src/ui/`（17 文件）
- [ ] CUT `src/audio/AudioSystem.js`
- [ ] CUT `src/dev/forceSpawn.js`
- [ ] CUT `index.html` / `src/main.js` / `vite.config.js`
- [ ] CUT `src/app/` 9 文件（GameApp/GameLoop/snapshot/leaderboard/devMode/shortcut/replay/perfCap/simStepper）
- [ ] 修 3 处反向 import：MortalitySystem、PopulationGrowthSystem、EntityFactory
- [ ] SIMPLIFY `createServices.js` (181 → ~120) 删 replay/leaderboard/snapshot 行
- [ ] SIMPLIFY `controlSanitizers.js` (176 → ~80) 删 display 半
- [ ] CUT `uiProfileState.js`（EntityFactory 硬编码 `"full"`）
- [ ] SIMPLIFY 或 CUT `performanceTelemetry.js`

**Exit criteria**:
- `npm run lint` / `node --check` 全绿
- 测试基线红的全在已规划 CUT 桶内（snapshot-* / leaderboard-service / dev-mode-gate / shortcut-resolver / casual-shortcut-resolver-f1 / ui-* / food-rate-consistency）
- benchmark + nav + ai-llm 桶全绿
- `git diff --stat` 删除 ~30k+ LOC

### S2 — 测试桶按表清理（1–2 天）

**Tasks**：按 §3.3 表分桶逐次删除 + 跑测试基线。

执行顺序（先确定无副作用的、再啃 worker-npc）：
1. ui-hud-render（65 文件，配合 S1 删）
2. progression-score（28 文件）
3. wildlife（5 文件，配合 §4.4 决策）
4. building-economy（CUT 43，留 3）
5. 其它桶（CUT 40，留 3）
6. ai-llm（CUT 40，留 27）
7. worker-npc-combat（**CUT 50，留 10 minimal contract**——最敏感，要小步提交）
8. navigation（CUT 4，留 10）

**Exit criteria**:
- 测试数 1646 → ~800–900
- 全部保留桶绿
- 每个桶单独提交 commit + CHANGELOG 条目

### S3 — Decision points 落地（2–3 天）

按 §4.11 拍板表逐项执行：

- [ ] D1 SkillLibrary archive + delete
- [ ] D2 ProcessingSystem + ProcessingProposer delete
- [ ] D4 Wildlife + Trader 整片 CUT；保留 raider 路径
- [ ] D8 Progression CUT，EventDirector simplify，RaidEscalator KEEP
- [ ] D9 地图模板瘦身（删 3 个，保留 2 + 1 可选）
- [ ] D10 ScenarioFactory CUT，新建 `src/benchmark/scenarios/StampHelpers.js`

**Exit criteria**:
- 每个 D 项单独 commit，CHANGELOG 注明
- benchmark 跑通 2 个保留模板，dev-index 收敛
- LLM-on 模式跑通保留通道（colony / strategic / env / policy）

### S4 — `balance.js` neutralize（1 天）

**Tasks**:
- [ ] 通读 `src/config/balance.js` 1,321 LOC
- [ ] 把游戏调校项的值置中性（spoilage = 0、recruitCooldown = 1、wildlifeZoneLeashRadius 删除项、roadStackPerStep = 1 等）
- [ ] **不要删除常量名**，避免 50+ 文件 null-deref
- [ ] 文件顶部加 `// NEUTRALIZED — values normalised for benchmark; gameplay tuning frozen.`
- [ ] dead-read 清理放第二轮（可选，不在 critical path）

**结构性必留键** (~120 LOC)：
- 网格尺寸、worker 携带容量
- group policy weight 钳制范围 (0–3 / 0–1 / 0–24h)
- decision cadence 默认值
- 基础资源成本

**Exit criteria**:
- 测试基线不变
- benchmark 跑出确定分数（同种子两次相同）
- 无 NaN / undefined 写入 `state.metrics`

### S5 — Server + AgentAdapter 抽象（2–3 天）

**Tasks**:
- [ ] 瘦身 `server/ai-proxy.js` (786 → ~150)：去 retry / model normalization / env-loader 复杂分支
- [ ] 瘦身 `LLMClient.js` (482 → ~150)：去 retry / fallback chain
- [ ] 瘦身 `PromptBuilder.js` (925 → ~450)：删 fallback-policy 构造分支
- [ ] 新建 `src/simulation/ai/llm/AgentAdapter.js`：4 通道接口
- [ ] 新建 `src/simulation/ai/llm/HTTPAgentClient.js`：implements AgentAdapter via `/api/agent/*`
- [ ] 新建 `server/agent-bridge.js`：`/api/agent/*` + `/api/benchmark/*` 路由
- [ ] 新建 `server/config/agent-routing.js`：channel → agentId 路由（支持 multi-LLM ablation）
- [ ] 扩 `aiRuntimeStats.js` token 字段（promptTokens / completionTokens / cachedTokens / firstTokenLatencyMs / tokensPerSec / kvCacheHits / prefixHits）

**Exit criteria**:
- AgentAdapter 4 通道契约测试覆盖 schema + guardrails 调用
- 与原 `/api/ai/*` 路径并存，不破坏现有调用
- multi-LLM 配置（环境用 model A，policy 用 model B）跑通至少一次端到端

### S6 — runMode 闸门 + 论文实验脚本（1–2 天）

**Tasks**:
- [ ] D5 落地：`runMode: "llm" | "algorithmic" | "hybrid"` 闸门
  - LLM-on → mute `meta/ColonyDirectorSystem` + `population/RoleAssignmentSystem`
  - LLM-off → mute `colony-agent` + `npc-policy` 通道
- [ ] 新增 5–10 个 control-arm 测试（algorithmic baseline 行为契约）
- [ ] 新建 `src/benchmark/dimensions/`：
  - `ResourceAllocationEfficiency.js`
  - `GroupDynamics.js`
  - `MemoryDegradation.js`
  - `DecisionTokenEfficiency.js`
  - `HierarchicalCoordination.js`
- [ ] 接入现有 `DimensionPlugin` 协议 + Bayesian `ScoringEngine`
- [ ] 新建 `scripts/benchmark-paper.mjs`：一键产 NDJSON + LaTeX 表

**Exit criteria**:
- runMode 切换不破坏 SimHarness 启动
- 5 个 dimension 接入 ScoringEngine，输出格式与 `BenchmarkMetrics.js` 兼容
- LaTeX 表能在 `docs/ai-research/paper/tables/` 生成

### S7 — Long-horizon memory harness（2–3 周，可后置）

**前提**：S0 determinism audit 通过。

**Tasks**:
- [ ] 新建 `src/benchmark/scenarios/long-horizon/{30m,2h,8h,24h}.js`
- [ ] 新建 `tools/analysis/memory-curves.py` → Recall(t) / Drift(t) / Performance(t)
- [ ] 新建 `tools/analysis/lost-in-middle-replay.py` → 复现已知现象作为 sanity check
- [ ] 渐进推进：30m → 2h × 5 seed × 3 repeat → 8h → 24h
- [ ] HW telemetry sidecar（`tools/hwtelemetry/`，平台分裂，可选）

**Exit criteria**:
- 至少 2h 跑稳（5 seed × 3 repeat 方差合理）
- "lost-in-the-middle" 现象在 harness 中可观测
- 24h 跑作为论文 final figure（不阻塞投稿）

---

## 6. Risk register

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `balance.js` 直接删常量导致 50+ 文件 null-deref | 高 | 高 | S4 用 neutralize 而非 delete；dead-read 清理放第二轮 |
| FSM 行为契约测试一并删干净后 worker 静默回归 | 中 | 高 | 强制保留 ~10 个 minimal contract（eat / deposit / A*-avoid / die-of-hunger / idle）|
| LLM 4 通道里 colony 通道删过头（SkillLibrary 等） | 低 | 中 | git tag `feature/skill-library-archive` 保留可回收 |
| ScenarioFactory CUT 后 SimHarness `applyPreset` 链失效 | 中 | 中 | 新建 `src/benchmark/scenarios/StampHelpers.js` 独立保留 80 LOC helper |
| 6 模板 → 2 模板，论文 reviewer 质疑覆盖度 | 中 | 中 | 在 reproducibility 附录附被删模板的种子哈希 + Grid.js 残留代码生成方式（不增加 paper 主线代码量）|
| 24h harness 复现性 | 中 | 高 | 强制 S0 determinism audit 通过；从 2h 起步 |
| determinism audit 发现 PathWorkerPool 不等价 | 中 | 中 | benchmark 模式下禁用 worker pool，回退同步 A* |
| LLM 提供商 token 计数差异（OpenAI vs vLLM vs llama.cpp）| 高 | 低 | aiRuntimeStats 字段命名遵循 OpenAI usage block；其它后端转换层 |
| paper reviewer 质疑"first widely-available" 等过度论断 | 中 | 中 | 在 paper §2 措辞收窄到 "first low-rank schema-validated vector directive at three nested cadences" |
| commit 颗粒太大 review 不动 | 中 | 低 | 每个桶 / 每个 D 项 / 每阶段单独 commit |

---

## 7. Reproducibility addendum

每个 benchmark 跑生成的 manifest（`/api/benchmark/run` 响应）：

```json
{
  "runId": "...",
  "seed": "0xC0FFEE",
  "scenarioId": "temperate_plains-v1",
  "durationSec": 14400,
  "agents": {
    "environment-director": "claude-opus-4-7",
    "npc-policy":            "hermes-7b",
    "strategic-plan":        "claude-opus-4-7",
    "colony-agent":          "gpt-5-mini"
  },
  "budget": {
    "maxTokens": 2000000,
    "maxRequests": 5000,
    "wallclockSec": 4500
  },
  "simulator": {
    "sha": "<git-sha>",
    "tuning": {},
    "neutralizedBalance": true
  },
  "results": "metrics.ndjson"
}
```

**复现命令**（论文附录）：

```bash
docker run --rm -v $(pwd)/runs:/runs project-utopia-bench \
  --seed 0xC0FFEE \
  --scenario temperate_plains-v1 \
  --duration 14400 \
  --agents agents.yaml \
  --output /runs/run-0001.ndjson
```

---

## 8. Open questions（拍板前必须回答）

来自 `benchmark_proposal.md` Appendix B + 本计划：

| # | 问题 | 答复 | 来源 |
|---|---|---|---|
| Q1 | `rng.js` 是否覆盖所有随机调用？| _S0 输出_ | proposal Appendix B Q1 |
| Q2 | `PathWorkerPool` 与同步 A* 是否产出相同路径？| _S0 输出_ | proposal Q2 |
| Q3 | `memoryStore.formatForPrompt` 截断策略？| _S0 输出_ | proposal Q3 |
| Q4 | `groupContracts` 版本化？| _S0 输出_ | proposal Q4 |
| Q5 | §4 的 D1–D10 决策项 | _项目所有者拍板_ | 本计划 |
| Q6 | 论文 v1 是否含长程 harness（S7）？| _项目所有者_ | 本计划 |
| Q7 | 论文 v1 是否含 multi-LLM ablation？| _项目所有者_ | 本计划 |

---

## Appendix A — `src/simulation/` 文件级清单（CORE / RICHNESS / AMBIGUOUS）

### KEEP wholesale (CORE backbone)
```
ai/llm/        (1,912 LOC)  全部 CORE
ai/memory/       (540 LOC)  全部 CORE
ai/strategic/  (1,610 LOC)  全部 CORE
ai/brains/     (1,520 LOC)  全部 CORE
navigation/    (1,430 LOC)  全部 CORE（Faction.js AMBIGUOUS — 由 D7 决定）
movement/        (470 LOC)  全部 CORE
services/        (460 LOC)  全部 CORE
telemetry/       (290 LOC)  CORE
lifecycle/     (1,120 LOC)  全部 CORE
```

### KEEP majority, prune flair
```
ai/colony/    (10,300 LOC)
  CUT: SkillLibrary.js (600), LearnedSkillLibrary.js (400),
       proposers/ScoutRoadProposer.js (130),
       proposers/ProcessingProposer.js (90),
       proposers/BridgeProposer.js (200, 仅当无 archipelago map)
ai/director/   (1,080 LOC)
  SIMPLIFY: EnvironmentAnalytics.js (610) — 删 weather/event-flair 聚合
economy/       (1,580 LOC)
  CUT: ProcessingSystem.js (250)（D2）
  KEEP+决策: TileStateSystem.js (320)（D3 → KEEP）
construction/  (1,930 LOC)
  KEEP（D6）
npc/           (5,460 LOC)
  CUT: AnimalAISystem.js (1,230)（D4）
  CUT: state/StatePlanner.js (670) + StateGraph.js (260)（v0.10.0 telemetry-only retro）
  REDUCE: VisitorAISystem.js (720) → raider only ~400
  REDUCE: fsm/Visitor*.js (350) → raider only ~150
population/      (1,160 LOC)
  KEEP+gate: RoleAssignmentSystem.js (820)（D5）
meta/          (2,580 LOC)
  CUT: ProgressionSystem.js (920)（D8）
  SIMPLIFY: EventDirectorSystem.js (190)（D8）
  KEEP+gate: ColonyDirectorSystem.js (1,000)（D5）
  KEEP: DevIndexSystem.js (140), GameEventBus.js (110), RaidEscalatorSystem.js (230)
ecology/         (550 LOC)
  CUT 整片（D4）
world/           (170 LOC)
  KEEP+toggle: VisibilitySystem.js (170)（D7）
```

预期 `src/simulation/` 净减：**~7,000–9,000 LOC**

## Appendix B — 测试桶映射表

| 桶 | 正则匹配（first-match-wins）| 文件估 |
|---|---|---:|
| ui-hud-render | `^test/(ui-|hud-|toast|lens|story|voice|jargon|asset)` | 65 |
| ai-llm | `^test/(llm-|prompt|policy|perceiver|planner|evaluator|fallback|schema|guardrails|decision|brain|memory)` | 67 |
| worker-npc-combat | `^test/(worker-|visitor-|fsm|role-assign|mortality|death|recruit|raid|sabot|wall|deliver|warehouse|carry|hotfix)` | 59 |
| building-economy | `^test/(build-|construction|demolish|processing|food-rate|resource-chain|escalator|tool-tier|terrain|map-gen|world-event|inspector)` | 46 |
| progression-score | `^test/(milestone|dev-index|survival-score|run-outcome|balance|exploit|world-explain|leaderboard|alpha)` | 28 |
| wildlife | `^test/(wildlife|animal-|ecology|predator|atmosphere)` | 5 |
| benchmark | `^test/(benchmark-|long-horizon|long-run|soak|monoton|sim-stepper|rng-determ|snapshot|harness)` | 20 |
| navigation | `^test/(astar|navigation-repath|path-fail|reachab|spatial-hash|grid-cache|boids|gate-faction|road-)` | 14 |
| 其它 | （兜底）| 43 |
| **合计** | — | **347** |

---

## Appendix C — 现有 `src/benchmark/` 框架清单

| 文件 | LOC | 处置 |
|---|---:|---|
| `framework/SimHarness.js` | 189 | KEEP — paper-grade |
| `framework/ScoringEngine.js` | 186 | KEEP — Beta-Binomial Bayesian |
| `framework/ProbeCollector.js` | 297 | KEEP |
| `framework/DimensionPlugin.js` | 42 | KEEP — 插件协议 |
| `framework/ScenarioSampler.js` | 174 | KEEP |
| `framework/CrisisInjector.js` | 242 | SIMPLIFY — 保留注入机制，删游戏味 crisis recipes |
| `framework/DecisionTracer.js` | 163 | KEEP |
| `framework/cli.js` | 72 | KEEP / 轻简化 |
| `BenchmarkPresets.js` | 424 (22 presets) | CUT-MOST — 留 4–6 个挑战轴 preset |
| `BenchmarkMetrics.js` | 219 | KEEP |
| `run.js` | 240 | SIMPLIFY |

---

## Appendix D — 命令速查

```bash
# 基线
node --test test/*.test.js

# 单桶跑（举例）
node --test test/benchmark-*.test.js

# determinism check（S0 输出）
node tools/audit/determinism-check.js --seed 0xC0FFEE --runs 2

# benchmark
node scripts/benchmark-paper.mjs --scenario temperate_plains-v1 --seed 0xC0FFEE

# LOC 统计
git ls-files 'src/render/**' 'src/ui/**' 'src/audio/**' 'src/dev/**' \
  'index.html' 'src/main.js' 'vite.config.js' \
  | xargs wc -l | tail -1
```

---

**End of plan.** Decision matrix §4.11 待项目所有者勾选后启动 S0。
