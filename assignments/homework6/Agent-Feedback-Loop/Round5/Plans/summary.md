---
round: 5
date: 2026-04-24
plans_total: 10
plans_accepted: 10
plans_deferred: 0
waves: 3
essential_bias: true
---

## 1. Plans 一览

| plan | priority | scope(loc) | files_touched | focus 简述 | 锁定矛盾 |
|---|---|---|---|---|---|
| 01a-onboarding | P0 | ~90 | 5 | 默认 tool=select + 首次选中自动展开 EntityFocusOverlay | P0-2 观察闭环 |
| 01b-playability | P0 | ~180 | 4 | RoleAssignmentSystem 配额按人口缩放 + ColonyPlanner 新增 Priority 3.75 idle-chain + pendingRoleBoost 闭环 | P0-1 fallback 配额反馈 |
| 01c-ui | P1 | ~140 | 4 | ResourceSystem 补 food per-min flow metric + HUD Dev 弱维度徽章 + glossary tooltip | P1-2 HUD 因果断层 |
| 01d-mechanics-content | P0 | ~320 | 5 | EntityFocusPanel persistent worker list + Tab cycle + 拆 casual-gated intentWeights 区块 + ResourceSystem/MortalitySystem/ProcessingSystem 供 foodRateBreakdown | P0-2 + P1-2 |
| 01e-innovation | P0 | ~160 | 4 | PromptBuilder 去掉 "sustain <verb>" 双动词模板 + humaniseSummary 清规则 + autopilotStatus "LLM offline — DIRECTOR steering" 降级语义 | P0-3 DIRECTOR 透明化 |
| 02a-rimworld-veteran | P0 | ~110 | 4 | balance.js 新增 roleQuotaScaling + EntityFactory/BuildToolbar quotas 哨兵值 99 + Kitchen gate stone 3→2 + pop>=12 critical | P0-1 fallback 配额反馈 |
| 02b-casual | P0 | ~180 | 4 | getResourceChainStall 导出 + HUD 7 资源行 stall tooltip/data-stall + BuildToolbar 下单 deficit 解释 | P0-1 casual 视角派生 (P1-2) |
| 02c-speedrunner | P1 | ~85 | 4 | BUILD_COST_ESCALATOR + computeEscalatedBuildCost + ColonyPlanner 动态 cost 估算 | P0-1 派生 (build-spam cheese) |
| 02d-roleplayer | P1 | ~85 | 4 | MortalitySystem 见证者 nearby∪related 并集 + recentKeys dedup + RoleAssignmentSystem pickBestForRole(skillKey) | P0-2 backstory/memory 闭环 |
| 02e-indie-critic | P0 | ~220 | 4 | storytellerStrip AUTHOR_VOICE_PACK + badgeState 四态 (llm-live/llm-stale/fallback-degraded/fallback-healthy) + PromptBuilder 拆 summary | P0-3 DIRECTOR 透明化 |

---

## 2. 冲突矩阵（D1-D5）

### D1 REDUNDANT（同一根因/同一 file:func）

高相关对（必须合并落地）：

- **01b × 02a**（P0-1 配额 + Kitchen gate）
  - 都改 `RoleAssignmentSystem.js:62` 默认 roleQuotas + `ColonyPlanner.js` Priority 3.x Kitchen 分支。
  - 冲突点：01b 用 `{cookPerN, smithPerN, ...}` 表达为"每 N 人 1 个"；02a 用 `{cookPerWorker: 1/8}` 表达为比例。计算结果相同，但两份如果并行 commit 会 git merge 冲突同一行。
  - **合并建议**：合并为单 plan。选用 **02a 的 BALANCE 常量形状**（perWorker 比例 + softTarget + haulMinPopulation 8）+ **01b 的 fallback planner 闭环**（Priority 3.75 idle-chain + `state.ai.fallbackHints.pendingRoleBoost` + RoleAssignmentSystem 入口消费 hint）。02a 的 `roleQuotas: 99` 哨兵与 snapshot 迁移保留；01b 的 emergency-mode override（食物 < threshold 时 specialist 让路 FARM）保留。
  - **不 SUBSUMED 任何一方**——两份解决的是同一闭环的两半（02a 修"quota 死值"，01b 修"quota 无反馈"），各自独立落地都不完整。

- **01e × 02e**（PromptBuilder 模板 + storytellerStrip）
  - 都改 `PromptBuilder.js:322-324` adjustWorkerPolicy 尾段 summary 模板 + `storytellerStrip.js:147 humaniseSummary` 规则链。
  - 冲突点：01e 改成"根据 actionable 后缀分叉"；02e 改成"Focus: X. + notes 第一条"。都在杀 "sustain <verb-phrase>" bug 但分叉形态不同。
  - **合并建议**：合并为单 plan。**选用 02e 的模板拆法**（Focus + notes）作为文本形态——更短、天然避开双动词陷阱；**保留 01e 的 autopilotStatus 降级语义**（text 末尾追加 "LLM offline — DIRECTOR steering"、把 `fallback/fallback` 合并为 `rule-based`）——02e 的 badgeState 四态与它正交。**保留 02e 的 AUTHOR_VOICE_PACK 反注入**（scenario/help/tooltip 里已存在的作者短句）——这是 02e 超出 01e 的增量价值。
  - 未 SUBSUMED。

- **01c × 01d**（foodRateBreakdown 数据通电）
  - 都动 `HUDController.js:545-557` 的 `#foodRateBreakdown` 已预留但未通电的 DOM hook + 后端 ResourceSystem/ProcessingSystem/MortalitySystem 补 per-min metric 字段。
  - 冲突点：两份 plan 都要在 ResourceSystem.update 加 3 秒窗口快照并写 `state.metrics.foodProducedPerMin/foodConsumedPerMin/foodSpoiledPerMin`。01d 额外要求 MortalitySystem/ProcessingSystem 侧 emit 真源头（production vs consumption vs spoilage 三分），01c 保守只做"净 delta 反推"（spoil 先留 0）。
  - **合并建议**：合并为单 plan。**选用 01d 的真源头 emit**（ProcessingSystem kitchen food→meals 入 consumed、Farm harvest 入 produced、spoilage 入 spoiled）——比 01c 的反推更准；**保留 01c 的 Dev 弱维度徽章**（`#statusObjectiveDev` 追加 `weakest: defense 18`）和 glossary tooltip 挂载——这是 01c 独有增量。
  - 未 SUBSUMED。

- **01a × 01d**（Entity Focus overlay / panel 入口）
  - 01a 改 `index.html:1269` 的 `<details id="entityFocusOverlay">` 加 `open` + SceneRenderer 首次 pick 展开。
  - 01d 在 `#entityFocusBody` **之上**新增 `<div id="entityFocusWorkerList">` 并重写 EntityFocusPanel.render 头部。
  - 冲突点：同一个 `<details>` 的展开态 + 内部 DOM 拼装。互补但共享 HTML 节点。
  - **合并建议**：合并为单 plan（Wave 2）。01a 的默认 tool=select + overlay 默认 open + SceneRenderer 展开逻辑保留；01d 的 worker-list + Tab cycle + 拆 casual-gated intentWeights 区块保留；HTML 上 `<details id="entityFocusOverlay" open>` 直接满足两份的初始态诉求。
  - 未 SUBSUMED。

- **02b × 02d**（"已有诊断字段未接 UI"双侧）
  - 02b 接 `ColonyPerceiver.analyzeResourceChains` → 7 资源行 stall tooltip。
  - 02d 接 `MortalitySystem` 见证者并集 + `RoleAssignmentSystem` skill 排序。
  - 冲突点：无——两份动完全不同的 file/func，共享"搬抽屉里的纸条"这一精神取向但实现面不重合。
  - **合并建议**：**不合并**。分别作为 Wave 2 的并行 commit 落地。

### D2 CONFLICT（对同一处互斥修改）

- 无硬互斥。所有重叠都可合并（见 D1）而非互斥。
- 02a Step 6 把 EntityFactory 默认 roleQuotas 改成 `{cook:99,...}` 哨兵，与 01b Step 1-6 的 BALANCE.roleQuotaScaling 闭环**语义互补**（哨兵 = "不限制"，scaled 公式主导；玩家 slider 压回 1-5 仍然生效）。合并后需要一致（见 Wave 1 合并契约）。

### D3 SEQUENCE（需要串行）

- **Wave 1 必须先于 Wave 2**：01b/02a 修完 `RoleAssignmentSystem` quota 与 `ColonyPlanner` Priority 3.75 后，01d 的 intentWeights 展示才能看到"真实分配结果"（否则 casual 玩家首次看到的还是 COOK=0 的旧画面）。
- **Wave 1 必须先于 Wave 3 的 02c**：02c 的建筑 cost escalator 在 `ColonyPlanner:493-523` 的 "Can't afford" 分支读取动态 cost——而 Wave 1 新增的 Priority 3.75 kitchen 强制分支也要读 cost。先合并 quota 再叠加 escalator，避免 ColonyPlanner 同一函数被两份改动同步 rebase。
- **01d Step 1-3 (foodRate per-min emit) 必须先于 01c Step 1-4 (HUD 展示与弱维度徽章)**——已合并进 Wave 2 同一 plan group，在单个 commit 内串行 Step。
- **01e 与 02e 合并后内部顺序**：先 `PromptBuilder.js` 拆 summary 模板（消除 sustain 双动词根因），再 `storytellerStrip.humaniseSummary` 清规则（避免二次重写残句），最后 `autopilotStatus` + `AUTHOR_VOICE_PACK` + `badgeState` 四态派生。

### D4 INDEPENDENT

- **01a 的默认 tool=select + SceneRenderer pick 展开**：与 Wave 2 其他改动互不依赖，可在 Wave 2 与 01d worker-list 合并包里并排落地。
- **02b 的 stall tooltip** 与 **02d 的 witness/specialty**：两两独立，Wave 2 并行。
- **02c 的 cost escalator**：与 Wave 3 的叙事修复（01e+02e）独立，Wave 3 内并行。

### D5 OUT-OF-SCOPE

- **无整份 DEFERRED 的 plan**。所有 10 份 plan 的 **主方案** 都严格落在 HW06 freeze 白名单内：
  - 零新 tile 类型 / 零新建筑 / 零新音频资产 / 零新教程关卡 / 零新 mood 系统 / 零 Score 公式重写。
  - 02c 明确拒绝 Score 公式重构，只动 cost 函数（balance polish，非 mechanic）。
  - 02d 明确拒绝"saw friend die" mood debuff（方向 C），只做 memory/specialty 接线。
  - 02e 明确拒绝新增作者原创叙述，AUTHOR_VOICE_PACK 全部复用 scenario.meta / help panel / building tooltip 已存在的文案。
  - 01a 明确拒绝 Intro Mission，只改默认 tool + overlay 展开。
- enhancer 已被强约束生效。

---

## 3. Wave 调度

### Wave 1：系统层根因（fallback AI 循环修复）

**合并包：`w1-fallback-loop-merged`**（包含 01b + 02a + 02d）

- 合并范围：
  - `src/config/balance.js` 新增 `BUILD_COST_ESCALATOR`（Wave 3 用）预留位置 + 本 wave 落地 `roleQuotaScaling`（`cookPerWorker:1/8, haulPerWorker:1/6, herbalistPerWorker:1/12, smithPerWorker:1/10, stonePerWorker:1/8, herbsPerWorker:1/10, haulMinPopulation:8`）+ `fallbackIdleChainThreshold:15`。
  - `src/simulation/population/RoleAssignmentSystem.js`：
    - 62 行默认 roleQuotas fallback 走 `computePopulationAwareQuotas(n)`，player slider 仍是硬上限。
    - 84 行 HAUL 门槛从 `n>=10` 改成 `n>=haulMinPopulation`。
    - 89 行 emergency 分支收紧 specialist 槽位让路 FARM。
    - 100 行新增 pipeline-idle boost（kitchen>=1 && cookSlots===0 && food>=15 → cookSlots=1）。
    - update 入口读 `state.ai?.fallbackHints?.pendingRoleBoost` 并单次上调对应 slot 后清空（hint 命中时保留 N-tick sticky，避免一帧反弹）。
    - **（02d）** 113-123 行分配循环前插入 `pickBestForRole(pool, skillKey, n)`：COOK→cooking / SMITH→crafting / HERBALIST→farming 代理 / STONE→mining / HERBS→farming / HAUL→idx 原序；FARM→farming、WOOD→woodcutting 稳排。
  - `src/simulation/ai/colony/ColonyPlanner.js`：
    - Priority 3.5 Kitchen 门槛 `stone>=3 → stone>=2`。
    - 新增 Priority 3.75 "idle processing chain"（kitchen>=1 && COOK=0 && food>=15 → push `{type:"reassign_role", role:"COOK"}`）；同构 SMITH/HERBALIST 条件。
    - 新增 pop>=12 强制 Kitchen critical 分支（02a Step 4）。
    - Priority 1 (food crisis) 若 `workerCount>=12 && kitchens===0 && wood>=8 && stone>=2` 跳过第二个 farm step 改插 kitchen（02a Step 5）。
    - VALID_BUILD_TYPES 加入 `"reassign_role"` 白名单；PlanExecutor 识别为 noop + set hint。
  - `src/entities/EntityFactory.js:791`、`src/ui/tools/BuildToolbar.js:327-330`：默认 roleQuotas 99（哨兵）+ snapshot migration（旧 1 改写为 99）。
  - `src/simulation/lifecycle/MortalitySystem.js`（02d）：
    - `recordDeathIntoWitnessMemory` nearby ∪ related 并集，Set 去重，标签差异化 (Friend/Close friend vs Colleague)。
    - `pushWorkerMemory(worker, label, dedupKey, windowSec)` + `worker.memory.recentKeys: Map` 懒初始化。
  - `src/world/events/WorldEventSystem.js`（02d）：`recordWorkerEventMemory` 接 dedupKey=`fire:${ix},${iz}` windowSec=30；动物 `recentEvents` 同步。
- 合并文件白名单（并集，不重叠到 Wave 2/3）：
  - `src/config/balance.js`
  - `src/simulation/population/RoleAssignmentSystem.js`
  - `src/simulation/ai/colony/ColonyPlanner.js`（Priority 3.5 / 3.75 / Priority 1 调整；其他函数不动）
  - `src/simulation/ai/colony/PlanExecutor.js`（reassign_role noop 识别）
  - `src/simulation/lifecycle/MortalitySystem.js`
  - `src/world/events/WorldEventSystem.js`
  - `src/entities/EntityFactory.js`（791 行 roleQuotas 默认值一处）
  - `src/ui/tools/BuildToolbar.js`（327-330 行 quotas 初值一处，与 Wave 2 UI 改动 `render()` 路径不冲突）
- 新增测试（合并自三份 plan）：
  - `test/role-assignment-population-scaling.test.js`（n=10/n=20/n=5）
  - `test/colony-planner-idle-chain.test.js`（kitchen+0 cook+food≥15→reassign_role；pop>=12 critical kitchen）
  - `test/role-assignment-quotas.test.js` 与 `test/role-assignment-system.test.js` 的硬编码断言同步更新（cook 1→2, haul 1→2）
  - `test/role-assignment-specialty.test.js`（02d）
  - `test/memory-recorder.test.js` 扩展（nearby witness 触达 + 同坐标事件 30s dedup）
- 新 plan id：`w1-fallback-loop-merged`

### Wave 2：观察闭环（HUD 数据通电 + Entity 选中改造）

**合并包 A：`w2-entity-focus-merged`**（01a + 01d）
- 合并范围：
  - `src/entities/EntityFactory.js:794`：默认 tool `road` → `select`（01a Step 1）。
  - `src/ui/tools/BuildToolbar.js`：删除 line 185-187 条件 rebound 块（01a Step 2）；sync() 保底 active 高亮。
  - `src/render/SceneRenderer.js`：`#onPointerDown` 成功 pick 后展开 `#entityFocusOverlay`（01a Step 3）。
  - `index.html:1269`：`<details id="entityFocusOverlay" open>`（01a Step 4）+ 新增 `<div id="entityFocusWorkerList">`（01d Step 4）。
  - `src/ui/panels/EntityFocusPanel.js`（01d Step 5-6）：
    - `#renderWorkerList()` —— agents.filter(WORKER) → button(data-entity-id)；选中 `.selected` class；>20 分页。
    - 拆掉 350-352 行 `.casual-hidden .dev-only` 对 "Top Intents / Top Targets / AI Agent Effect / Decision Context" 四区块的双 class gate；提升到 character block 之后用 `<details open data-focus-key="focus:why">` 包裹，summary "Why is this worker doing this?"。FSM/Policy Influence/Decision Time/Velocity/Path/AI Exchange panel 保持 dev-only。
  - `src/app/GameApp.js`（01d Step 7）：Tab/Shift+Tab cycle selectedEntityId（只在 phase==='active' 且焦点非 input/textarea）；Escape 清除（沿用已有 path）。
- 合并文件白名单：EntityFactory.js、BuildToolbar.js、SceneRenderer.js、index.html、EntityFocusPanel.js、GameApp.js。与 Wave 1 EntityFactory/BuildToolbar 同文件但不同行，需在同一 commit 内二次编辑即可。
- 新增测试：
  - `test/default-tool-is-select.test.js`
  - `test/pointerdown-expands-entity-focus.test.js`
  - `test/entityFocusWorkerList.test.js`

**合并包 B：`w2-foodrate-devweak-merged`**（01c + 01d 数据端）
- 合并范围：
  - `src/simulation/economy/ResourceSystem.js`：3 秒窗口 snapshot pattern；food 从"delta 反推"升级到"真源头 emit"（01d Step 1）；wood/stone/herbs/meals 同步 trackResourceFlow 辅助（01c Step 2 作为预埋 hook，本 wave 只保证 food 三通道完整）。
  - `src/simulation/lifecycle/MortalitySystem.js`：worker 吃 food 时累加 accum.consumed（01d Step 2）。**与 Wave 1 02d 的见证 nearby∪related 改动同文件不同函数**——需按顺序落地（Wave 1 先落，Wave 2 在 consumption path 再编辑）。
  - `src/simulation/economy/ProcessingSystem.js`：Kitchen food→meals 写 consumed；Farm harvest 写 produced；spoilage 写 spoiledPerMin（01d Step 3）。
  - `src/ui/hud/HUDController.js`：
    - `#foodRateBreakdown` 空数据分支显式 `(sampling…)`（01c Step 3）。
    - `statusObjectiveDev` 追加 `weakest: <dimKey> <value>`（当最低维 < devScore - 8；casual-mode 仍回退纯 `Dev N/100`）（01c Step 4）。
    - `#applyGlossaryTooltips` 追加 foodRateBreakdown glossary 条目（01c Step 7）。
  - `src/ui/hud/glossary.js`：新增 foodRateBreakdown 条目。
- 合并文件白名单：ResourceSystem.js、MortalitySystem.js（第二次编辑，consumption path）、ProcessingSystem.js、HUDController.js、glossary.js。
- 新增测试：
  - `test/food-rate-breakdown.test.js`（01c+01d 三通道）
  - `test/hud-dev-weakest.test.js`（01c Step 6）

**独立包 C：`w2-stall-tooltip`**（02b 单独落地）
- `src/simulation/ai/colony/ColonyPerceiver.js`：新增命名导出 `getResourceChainStall(state)`（~30 行）。
- `src/ui/hud/HUDController.js`：在 Wave 2 合并包 B 同一文件**相邻区段** 7 资源行 tooltip + data-stall 挂载（02b Step 3）+ 合并包 B 的 foodRateBreakdown 共存（两者改不同节点不冲突）。
- `src/ui/tools/BuildToolbar.js:896`：insufficientResource deficit 文案（02b Step 4），与 Wave 1 BuildToolbar 第 327-330 行默认 quotas 改动不同行。
- CSS：`[data-stall="1"]` 柔和橙色左 border（无动画）。
- 新增测试：`test/resource-chain-stall.test.js`、`test/hud-stall-tooltip.test.js`
- 合并策略：HUDController.js 在 Wave 2 内部有两次改动（包 B 的 dev-weakest + 包 C 的 stall tooltip）——同一 commit 或相邻 commit 落地，grep `foodRateBreakdown` / `woodRateVal` 节点并行不冲突。

### Wave 3：叙事 + 边际收益

**合并包：`w3-storyteller-cost-merged`**（01e + 02e + 02c）
- 合并范围：
  - **（01e + 02e 合并）** `src/simulation/ai/llm/PromptBuilder.js:322-324`：拆模板为 "Focus: <focus>." + notes 第一条（02e Step 6 形态）；trader/saboteur 对应行同步（02e Step 6 二级）；去除"sustain <verb-phrase>"语法陷阱（01e Step 1 附加 actionable 检测作为备份）。
  - **（01e + 02e 合并）** `src/ui/hud/storytellerStrip.js`：
    - `humaniseSummary` 删除 "push the frontier outward while keeping the rear supplied" 规则（02e Step 1） + "rebuild → reconnect" 同义改写（01e Step 2）；入口前哨吞掉 "(the colony should )?sustain " 残留。
    - 新增 `AUTHOR_VOICE_PACK`（frozen）；按 `(mapTemplateId, focusTag)` 索引，全部文案来自 scenario.meta/help/tooltip（02e Step 2-3）。
    - `computeStorytellerStripModel` voice-pack lookup（未命中走 humaniseSummary 兜底）+ `badgeState` 四态（llm-live / llm-stale / fallback-degraded / fallback-healthy / idle）（02e Step 3-4）；WHISPER 只在 llm-live 亮起。
    - mode==='fallback' 分支 focusText 前缀 "DIRECTOR picks" （01e Step 3），与 02e badgeState 正交共存。
  - **（01e）** `src/ui/hud/autopilotStatus.js:33-57`：合并 `fallback/fallback → rule-based`；`state.ai.lastPolicySource === "fallback"` 且 `lastError` 非空时追加 " | LLM offline — DIRECTOR steering"（01e Step 4）。
  - **（02e）** `src/ui/hud/HUDController.js:722-842`：storyteller render 块写入 `badgeEl.dataset.state`；fallback-degraded 时 tooltip 前缀 "[LLM offline — rule director in charge]"；voicePackHit 时 `aria-label="author-voice"`。
  - **（02c）** `src/config/balance.js`（Wave 1 已预留位置）：`BUILD_COST_ESCALATOR`（warehouse softTarget=2/perExtra=0.2/cap=2.5, wall softTarget=8/perExtra=0.1/cap=2.0, kitchen/smithy/clinic softTarget=1/perExtra=0.35/cap=3.0, farm/lumber/quarry softTarget=各/perExtra=0.1-0.15/cap=1.8-2.0）+ `computeEscalatedBuildCost(kind, existingCount)` 导出函数。
  - **（02c）** grep 定位 BUILD_COST 消费点（~4 处）：ConstructionSystem.js 下单/结账、BuildPanel.js 价签、ColonyPlanner.js:177-182 提示文本 + :493-523 "Can't afford" 分支。改用 `computeEscalatedBuildCost(kind, state.buildings[pluralKey(kind)] ?? 0)`。**与 Wave 1 对 ColonyPlanner 的 Priority 3.5/3.75/1 分支改动不同行，可顺序落地**。
  - **（02c）** `src/ui/panels/BuildPanel.js`：价签附加 `×N.NN` 倍率文字（若无锚点则用 `actionMessage` pattern）。
- 合并文件白名单：PromptBuilder.js、storytellerStrip.js、autopilotStatus.js、HUDController.js（第三次编辑，不同节点）、balance.js（第二次编辑）、ConstructionSystem.js、BuildPanel.js、ColonyPlanner.js（第二次编辑，cost 计算行）。
- 新增测试：
  - `test/prompt-builder-summary-sanity.test.js`（01e Step 5）
  - `test/autopilot-status-degraded.test.js`（01e Step 6）
  - `test/storyteller-strip.test.js` 扩展（02e Step 7：voice pack 命中 / WHISPER 降级 / sustain+reconnect 禁止）
  - `test/buildCostEscalator.test.js`（02c Step 6）
  - `test/buildSpamRegression.test.js`（02c Step 7）
  - `test/hud-storyteller.test.js`、`test/prompt-payload.test.js` golden 字符串更新

---

## 4. DEFERRED plans（本轮不落地）

无。

---

## 5. Implementer 输入契约

### Wave 1 — `w1-fallback-loop-merged`

- **合并 plan_paths**：
  - `assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01b-playability.md`
  - `assignments/homework6/Agent-Feedback-Loop/Round5/Plans/02a-rimworld-veteran.md`
  - `assignments/homework6/Agent-Feedback-Loop/Round5/Plans/02d-roleplayer.md`
- **合并文件白名单**：
  - `src/config/balance.js`（新增 roleQuotaScaling + fallbackIdleChainThreshold；**预留**但本 wave 不写入 BUILD_COST_ESCALATOR）
  - `src/simulation/population/RoleAssignmentSystem.js`
  - `src/simulation/ai/colony/ColonyPlanner.js`
  - `src/simulation/ai/colony/PlanExecutor.js`
  - `src/simulation/lifecycle/MortalitySystem.js`（见证者 nearby∪related + pushWorkerMemory dedup + recentKeys 懒初始化）
  - `src/world/events/WorldEventSystem.js`
  - `src/entities/EntityFactory.js`（791 行一处）
  - `src/ui/tools/BuildToolbar.js`（327-330 行一处，quotas 初值 99）
- **禁止触碰路径（全局硬红线）**：
  - 不加新 tile / 新建筑类型 / 新音频资产 / 新 mood / 新 Score 公式。
  - 不动 `src/simulation/telemetry/EconomyTelemetry.js` 的 score* 函数体。
  - 不动 `src/simulation/meta/DevIndexSystem.js` 的 dims 计算。
  - 不动 `src/simulation/meta/ProgressionSystem.js:354 updateSurvivalScore`。
- **可度量指标**：
  - fallback AI 10 分钟 Meals/min > 0（基线 0；目标 ≥ 0.3）
  - COOK 角色数 >= floor(pop/8)（基线恒 1；目标随人口线性）
  - HAUL 角色数 >= floor(pop/6) 当 n>=8（基线 1；目标线性）
  - benchmark DevIndex seed=42 / temperate_plains / 365 天 >= 44（基线持平；目标 >= 50）
  - Deaths 总数 <= 454（基线 454）
  - 死亡触达率：近场 witness (distance<=12, 无关系) 命中 recentEvents 概率 = 100%
  - Specialty 命中率：skills 某项 >= 0.9 且群体其他 <= 0.5 时命中 target role = 100%
  - 同坐标事件 30s 窗口去重命中

### Wave 2 — `w2-entity-focus-merged` + `w2-foodrate-devweak-merged` + `w2-stall-tooltip`

- **合并 plan_paths**：
  - 包 A：`01a-onboarding.md` + `01d-mechanics-content.md`（EntityFocusPanel/worker-list 部分）
  - 包 B：`01c-ui.md` + `01d-mechanics-content.md`（ResourceSystem/MortalitySystem/ProcessingSystem 部分）
  - 包 C：`02b-casual.md`
- **合并文件白名单**（三包并集，内部按顺序落地）：
  - `src/entities/EntityFactory.js`（794 行 tool='select' —— 与 Wave 1 791 行不同）
  - `src/ui/tools/BuildToolbar.js`（删除 185-187 rebound + 896 deficit 文案 —— 与 Wave 1 327-330 不同行）
  - `src/render/SceneRenderer.js`
  - `index.html`（1269 行 open + 新增 entityFocusWorkerList）
  - `src/ui/panels/EntityFocusPanel.js`
  - `src/app/GameApp.js`（Tab cycle）
  - `src/simulation/economy/ResourceSystem.js`
  - `src/simulation/lifecycle/MortalitySystem.js`（第二次编辑，consumption path —— 与 Wave 1 见证者改动不同函数）
  - `src/simulation/economy/ProcessingSystem.js`
  - `src/ui/hud/HUDController.js`（多次编辑：foodRateBreakdown sampling 分支 + 弱维度徽章 + 7 资源行 stall tooltip）
  - `src/ui/hud/glossary.js`
  - `src/simulation/ai/colony/ColonyPerceiver.js`（新增 getResourceChainStall export）
- **禁止触碰路径**：
  - 不改 `src/simulation/npc/WorkerAISystem.js`、不改 `src/simulation/npc/state/StatePlanner.js`——worker intent/state 决策逻辑 Wave 1 包办。
  - 不动 PressureLens / Heat Lens 染色覆盖率（P1-3 本轮未列入）。
  - 不改美术贴图 / CSS 动画 / 音频。
- **可度量指标**：
  - 默认 tool === 'select'（单元测试）
  - 首次 pointerdown 成功 pick → overlay 有 open 属性（DOM 测试）
  - EntityFocusPanel worker-list 3 agents → 3 button 出现；点击选中；Tab 循环成功
  - casual-mode body class 下 "Why is this worker doing this?" details 可见
  - `#foodRateBreakdown` 非空且非 `(sampling…)` 的帧占比 >= 80%（10 分钟采样）
  - `#statusObjectiveDev` 在 Dev < 50 帧中显示 weakest 后缀比例 >= 70%
  - 7 资源 × 4 stall 原因 (28 case) tooltip 文案命中率 >= 90%
  - 2 分钟新手 "Wood 0.0/min 为什么" 的困惑消散时间 < 30s（对比 reviewer 5 分钟基线）

### Wave 3 — `w3-storyteller-cost-merged`

- **合并 plan_paths**：
  - `01e-innovation.md` + `02e-indie-critic.md` + `02c-speedrunner.md`
- **合并文件白名单**：
  - `src/simulation/ai/llm/PromptBuilder.js`
  - `src/ui/hud/storytellerStrip.js`
  - `src/ui/hud/autopilotStatus.js`
  - `src/ui/hud/HUDController.js`（第三次编辑：storyteller render 块 badgeState dataset —— 与 Wave 2 的 foodRateBreakdown/stall tooltip 不同区段）
  - `src/config/balance.js`（第二次编辑：BUILD_COST_ESCALATOR + computeEscalatedBuildCost —— 与 Wave 1 roleQuotaScaling 不同区段）
  - `src/simulation/construction/ConstructionSystem.js`
  - `src/ui/panels/BuildPanel.js`
  - `src/simulation/ai/colony/ColonyPlanner.js`（第二次编辑：cost 计算行 177-182 + 493-523 "Can't afford" —— 与 Wave 1 Priority 3.5/3.75/1 不同位置）
- **禁止触碰路径**：
  - 不重写 `updateSurvivalScore` / `DevIndexSystem` / `scoreInfrastructure/Defense/Production`（02c 自述明确不动）。
  - 不新增作者原创叙述短句——AUTHOR_VOICE_PACK 全部复用 scenario.meta / help panel / building tooltip 已存在文案。
  - 不改 LLM pipeline / 不引入新 mood / 不加新成就。
- **可度量指标**：
  - storyteller strip 残句率 = 0（`/sustain (reconnect|rebuild|push|hug|clear|disrupt|harass|run|work)/` 50 shape 枚举零命中）
  - 重复词率 <= 1%
  - voice-pack-hit 文本占比 >= 60%（4 张图 × 3 分钟 autopilot 采样）
  - WHISPER 徽章只在 `badgeState==='llm-live'` 亮起（测试断言）
  - fallback-degraded 时 autopilot banner 含 "LLM offline"
  - `computeEscalatedBuildCost("warehouse", 5).wood === 16`（+60%）；cap 25（×2.5）
  - warehouse ×15 spam 下 ColonyPlanner 无 ghost "insufficient wood" 连报 (< 3/tick)
  - benchmark DevIndex >= 42（下限，允许 -5%）

---

## 6. 已知风险 / 潜在回归

- **benchmark DevIndex**（Round 4 基线 37.8；Round 5 v0.8.1 基线 44）：
  - Wave 1 目标上移到 >= 50；下限 42（-5% 缓冲）。
  - Wave 2 纯 UI + side-channel，理论 DevIndex 持平。
  - Wave 3 cost escalator 可能让 Autopilot infrastructure score 略降（估计 -2 分以内），允许。
- **死亡 / 饥饿**：Wave 1 如果配额调太狠（FARM 被稀释过多）可能短期内新增饿死。02a 的 emergency override（food < threshold 时 specialist 让路 FARM）是主要缓解；01b 的 `fallbackIdleChainThreshold=15` 保底 —— 若 benchmark 死亡 >= 470（基线 454 + 3.5% 阈值），降到 threshold=25 再试。
- **snapshot / determinism**：
  - RoleAssignmentSystem 新增 `state.ai.fallbackHints` 字段需 round-trip（SnapshotSystem 已默认序列化 `state.ai`）。
  - `worker.memory.recentKeys: Map` 在 snapshot shallow-clone 下丢 Map 实例 —— Wave 1 02d Step 3 已规定入口 `??= new Map()` 懒初始化，不在 EntityFactory 预填。
  - roleQuotas 99 哨兵值：Wave 1 需要 snapshot migration（旧存档 cook=1 → 99 自动写入）避免用户 "以前能跑现在 COOK 只剩 1"。
  - Wave 3 skill 排序改变 workers[idx] 具体身份：grep 未发现 "workers[0] must be FARM" 硬编码，但仍需 `node --test test/role-assignment-*.test.js` 双检。
- **测试套件字面量依赖**：
  - Wave 1：`test/role-assignment-quotas.test.js`、`test/role-assignment-system.test.js`、`test/phase1-resource-chains.test.js` 里 n=13/n=20 期望值偏移。
  - Wave 2：`test/entity-focus-player-view.test.js`、`test/hud-controller.test.js`、`test/entityFocusPanel.test.js`（若存在）的 HTML 结构断言。
  - Wave 3：`test/hud-storyteller.test.js`、`test/storyteller-strip.test.js`、`test/prompt-payload.test.js` 约 ~5 个 test file 的 golden 字符串更新。
  - Coder 必须区分"因行为修正而更新期望值" vs "旧 assertion 抓到了不变量"——后者要回滚。
- **HUDController.js 多次编辑冲突**：Wave 2（foodRateBreakdown sampling + 弱维度徽章 + stall tooltip）与 Wave 3（storyteller render badgeState dataset）分三次编辑同一文件——需要每次编辑前 Read 一次最新内容避免 git 冲突；行号会在 Wave 2 内部漂移。
- **ColonyPlanner.js 多次编辑冲突**：Wave 1（Priority 3.5/3.75/1）与 Wave 3（cost 计算行）改动位置不重叠，但都在 `generateFallbackPlan`。Wave 间建议用单独 commit + rebase 而非同一 commit。
- **MortalitySystem.js 多次编辑**：Wave 1（见证者 nearby∪related + pushWorkerMemory dedup）和 Wave 2（consumption accum）改动不同函数，无冲突但要连续落地。

---

## 7. 下一步

交给 Stage C Implementer 按 Wave 顺序串行执行：

1. **Wave 1 (`w1-fallback-loop-merged`)** 单 commit 或拆 3-4 个 commit（balance→RoleAssign→ColonyPlanner→Mortality/WorldEvents），所有测试 green 后 benchmark 验证 DevIndex >= 44 且死亡 <= 470。
2. **Wave 2**（三个合并包并行 commit，或拆成 Entity Focus 包 → FoodRate 包 → Stall Tooltip 包三 commit），HUDController/MortalitySystem 二次编辑时 re-Read 最新文件。
3. **Wave 3 (`w3-storyteller-cost-merged`)** 单 commit 或拆 2（storyteller narrative + cost escalator），golden 字符串更新集中进行。
4. 每 Wave 末尾跑完整 `node --test test/*.test.js` + `scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`，记录 DevIndex / Deaths / Meals-per-min 三线基线。
5. CHANGELOG.md 每 Wave 独立更新（3 段 unreleased entry，按类别：Fallback AI / Observation Loop / Storyteller + Cost Balance）。
