---
reviewer_id: 02b-casual
feedback_source: Round5/Feedbacks/02b-casual.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~180
  new_tests: 2
  wall_clock: 75
conflicts_with: []
---

## 1. 核心问题

02b reviewer 的表面诉求（加音效 / BGM / 动画 / 剧情）整体落在 summary.md 第 5 节的 D5 拒绝清单里——"体验分但非结构性"。但同一份 feedback 里她给出了两条**非常精确的系统层症状**，开发者把答案写好了却从来没让她看到：

1. **（本 plan 锁定）产出链断点对玩家完全不透明（P0-1 的 casual 视角）。**
   Feedback 原文："要 8 wood + 3 stone，我只有 7 wood，红字 Insufficient resources。等了 30 秒木头也没涨，查了一下 Colony 面板：Wood 生产 **0.0/min**。啊？我不是建了 Lumber Mill 了吗？为啥不产木头？是因为没工人吗？是因为木头都拿去修路了吗？**没有任何 tooltip 告诉我为什么 0.0/min。**"

   系统层根因：`ColonyPerceiver.analyzeResourceChains(state)`（`src/simulation/ai/colony/ColonyPerceiver.js:435-492`）**已经**逐链算出 `bottleneck` 和 `nextAction` 文案（"no farms"、"no kitchen"、"only N farms (need 6 for kitchen)"），并把三条链的 `foodChain / toolChain / medChain` 对象返回给 LLM Prompt 构造器。也就是说"为什么 0.0/min"这一数据在引擎里已经是 first-class 字段，但这个函数**只有 PromptBuilder 消费**，HUD 层不订阅。这是一条"纸条锁在抽屉里"的典型系统断层（与 02d reviewer 的主旋律同构）。

   `ProcessingSystem.#processKitchens / #processSmithies / #processClinics`（`src/simulation/economy/ProcessingSystem.js:61-119`）的 `#tryProcess` 进一步有 4 个具体短路条件（无工人 / 冷却未到 / 输入不足 / 建筑数=0），但同样没有把 last-stall-reason 暴露出去。

2. **（ancillary）"修完所有 ○ 目标后不知道下一步干嘛"属于 P0-3 的 casual 影射**——但这一题和 P0-1 同源：Dev/Score 也是黑盒百分比，`nextAction` 文案已经在 perceiver 里生成却没上到 HUD。本 plan 顺带把 Construction 面板那一列 surface 出来，不新立 plan。

**本 plan 明确不是"加音频资产 / 加教程关卡 / 加动画特效 / 加成就解锁"。** 那些均在 HW06 freeze 边界内拒绝（CLAUDE.md + summary.md 第 6 节）。本 plan **只把已经存在于引擎但未曝光的诊断字段搬到 UI**——零新 mechanic、零新内容。

## 2. Suggestions（可行方向）

### 方向 A: Resource-row "stall tooltip"（把 perceiver 的 bottleneck 钉到 HUD）

- 思路：每帧 `HUDController.render()` 调用 `analyzeResourceChains(state)`，把 `foodChain.bottleneck / nextAction`、`toolChain.bottleneck / nextAction`、`medChain.bottleneck / nextAction` 作为 `title` tooltip 写到对应的 `#foodRateVal / #woodRateVal / #stoneRateVal / #herbsRateVal / #mealsRateVal / #toolsRateVal / #medicineRateVal` 节点上。当 `rate == "= 0.0/min"` 且存在 bottleneck 时，额外在节点上挂 `data-stall="1"` 让 CSS 上一个柔和红边。
- 涉及文件：`src/ui/hud/HUDController.js`、`src/simulation/ai/colony/ColonyPerceiver.js`（只增 export 无改动逻辑）
- scope：小
- 预期收益：02b 原文 "卡了大概 5 分钟" 那个场景里，hover 木头行可立刻看到 "no lumbers yet — build lumber (5w)" / "only 1 lumber — add more near a forest node" / "0 loggers assigned — raise quota in Management"。覆盖率 100% 的已知停产场景。
- 主要风险：Perceiver 每帧调用的成本（listTilesByType + 3 条链 if-else）；需要 throttle 到 RATE_WINDOW_SEC（3s）。

### 方向 B: BuildAdvisor cost-tooltip "why you can't afford"（让 Construction 面板说人话）

- 思路：当 `evaluateBuildPreview` 返回 `reason === "insufficientResource"`（`src/simulation/construction/BuildAdvisor.js:440-442`）时，不要只写 "Insufficient resources."，而是逐资源列出 deficit：`"Need 1 more wood (have 7, need 8). Wood is stalled: no lumber mill yet."`。把 A 方向的 bottleneck 文案反向注入到 build-preview reason 里。
- 涉及文件：`src/simulation/construction/BuildAdvisor.js`、`src/ui/tools/BuildToolbar.js`
- scope：中
- 预期收益：02b 的 "Cost: 8 wood + 3 stone" 那一刻 hover 就知道为什么攒不起来。比 A 更接近 reviewer 原句 "没有任何 tooltip 告诉我为什么 0.0/min" 的 **下一问**——"那我该干嘛"。
- 主要风险：需要把 perceiver 和 advisor 耦合；evaluateBuildPreview 目前是纯函数，加状态依赖会影响其 16 处调用点的语义；修测试面大。

### 方向 C: NextActionAdvisor 接 resource-chain bottleneck（已有 food_crisis 分支，扩一档）

- 思路：`src/ui/hud/nextActionAdvisor.js:75-94` 已经有 `getFoodCrisisAdvice`，在此基础上新增 `getChainStallAdvice(state)`——当某条链 bottleneck !== null 且对应 rate ≈ 0 时，输出一条 "Fix wood supply now" 级别的 advice 到 #statusNextAction。
- 涉及文件：`src/ui/hud/nextActionAdvisor.js`、`src/simulation/ai/colony/ColonyPerceiver.js`
- scope：小
- 预期收益：顶部 "Next:" 一行自动指向真正的断点；但只能选一条最严重的，不如 A 方向 6 条资源同时覆盖。
- 主要风险：与现有 food_crisis / route advice 的优先级竞争，需要定义 precedence。

## 3. 选定方案

**选方向 A**（Resource-row stall tooltip）。理由：

1. **匹配 reviewer 原句诉求最紧**："没有任何 tooltip 告诉我为什么 0.0/min" → 直接在 rate 行挂 tooltip，hover 即解。
2. **scope 最小**：只新增 1 个 export（`getResourceChainStall`），HUD 侧只加 7 个 `setAttribute('title', ...)`。可在一次 Coder 执行内完成。
3. **不破坏现有纯函数边界**：`analyzeResourceChains` 已经是纯函数，只要在 `ColonyPerceiver.js` 加命名导出即可；现有的 PromptBuilder 消费者零影响。
4. **不踩 feature-freeze**：不引入新 mechanic / 新资源 / 新事件，是 polish/fix/UX。CLAUDE.md "HW06 后不加新 mechanic" 边界合规。
5. **可度量**：bottleneck 覆盖率可直接断言——对给定 `buildings` 字典，每条 0.0/min 的资源是否都能从 perceiver 拿到非空 bottleneck。
6. **方向 B 更深但风险大**（修 evaluateBuildPreview 会影响 Undo/Redo 快照、AI PlacementSpecialist 等多个调用点）；方向 C 只能 surface 一条线索，信息密度不如 A。

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/ai/colony/ColonyPerceiver.js:435` — `add` — 新增命名导出函数 `getResourceChainStall(state)`（≈30 行），内部调用现有 `analyzeResourceChains(state)`，再融合 `state.metrics.populationStats`（cooks/smiths/herbalists/loggers/farmers/haulers）与 `state.buildings`，返回 shape：
  ```
  { food: { bottleneck: string|null, nextAction: string|null, severity: "stalled"|"slow"|"ok" },
    wood: { ... }, stone: { ... }, herbs: { ... },
    meals: { ... }, tools: { ... }, medicine: { ... } }
  ```
  对 wood/stone/herbs 三条**原料链**（在 `analyzeResourceChains` 之外的），就地算：若 `buildings.lumbers === 0` → "no lumber mill — build lumber (5w)"；若 `lumbers > 0 && populationStats.loggers === 0` → "no loggers assigned — raise wood quota in Management"；若 `lumbers > 0 && loggers > 0 && rate ≈ 0` → "wood hauled to warehouse; check storage capacity"。同构 stone (quarries / stoneMiners) 和 herbs (herbGardens / herbGatherers)。food 链直接复用 `analyzeResourceChains` 的 foodChain 对象。

- [ ] **Step 2**: `src/ui/hud/HUDController.js:499` — `edit` — 在 "Resource rate badges (/min)" 区块（现有 `this._lastComputedRates` 计算之后）调用 `getResourceChainStall(state)`，throttle 到同一个 `RATE_WINDOW_SEC === 3` 窗口（用 `this._lastChainStall` 缓存）。
  - depends_on: Step 1

- [ ] **Step 3**: `src/ui/hud/HUDController.js:558` — `edit` — 在每一行 `this.foodRateVal.textContent = formatRate(...)` 之后，若 `stall[key].bottleneck` 非空且对应 rate 绝对值 < 0.05，给节点挂 `node.setAttribute('title', ${bottleneck} — ${nextAction})` 和 `node.setAttribute('data-stall', '1')`；否则清空 `data-stall=""` 并把 `title` 回退为 "`${resource}: ${formatRate(rate)} over last 3s`"。覆盖 7 个节点：foodRateVal / woodRateVal / stoneRateVal / herbsRateVal / mealsRateVal / toolsRateVal / medicineRateVal。
  - depends_on: Step 2

- [ ] **Step 4**: `src/ui/tools/BuildToolbar.js:896` — `edit` — 在现有 `this.buildToolCostVal.textContent = Cost: ${costLabelDisplay}` 行之后追加：如果 `state.controls.buildPreview?.reason === "insufficientResource"`，从 `getResourceChainStall(state)` 拿对应 deficit 资源的 `bottleneck`，append 到 `this.buildPreviewVal` 的 `data-tooltip` / `title` 上。轻量级 fallback：让 casual profile 的 "Kitchen 攒不起 wood" 场景也能一眼看到原因，而不必去 hover HUD 行。
  - depends_on: Step 1

- [ ] **Step 5**: `src/ui/hud/HUDController.js` 末尾（style 注入或已有 `<style>` 块）— `edit` 或 `add` — 为 `[data-stall="1"]` 加一条 CSS：柔和的 1px 橙色左 border，无动画，纯静态（保持 HW06 "不加动画反馈"约束）。如果项目样式已在 CSS 文件中管理，改对应 stylesheet。
  - depends_on: Step 3

- [ ] **Step 6**: `test/resource-chain-stall.test.js` — `add` — 新增单元测试覆盖 `getResourceChainStall`：
  - case A: 空殖民地（buildings.farms=0） → food.bottleneck === "no farms"
  - case B: farms=1, lumbers=0 → wood.bottleneck 包含 "no lumber"
  - case C: lumbers=2, populationStats.loggers=0 → wood.bottleneck 包含 "no loggers assigned"
  - case D: farms=6, kitchens=0 → meals.bottleneck === "no kitchen"
  - case E: farms=6, kitchens=1, populationStats.cooks=0 → meals.bottleneck 包含 "no cooks"
  - depends_on: Step 1

- [ ] **Step 7**: `test/hud-stall-tooltip.test.js` — `add` — jsdom 单测：构造一个 state where `buildings.lumbers=0`，跑一次 `HUDController.render()`，断言 `document.getElementById("woodRateVal").getAttribute("title")` 包含 "no lumber" 并 `getAttribute("data-stall") === "1"`。再 flip state `buildings.lumbers=2, loggers=3, wood += 6/sec` 等两个 RATE_WINDOW_SEC，断言 tooltip 回退、`data-stall` 消失。
  - depends_on: Step 3

- [ ] **Step 8**: `CHANGELOG.md` — `edit` — 在当前 unreleased section 下新增 "Resource-chain stall tooltips" 条目（UX category），一句话说明"Hover resource rate badges to see why production stalled (e.g. 'Wood 0.0/min — no lumber mill yet')"。CLAUDE.md conventions 要求每次 commit 更新 CHANGELOG。
  - depends_on: Step 3

## 5. Risks

- **Perceiver 每帧成本**：`analyzeResourceChains` 本身是 O(1)，但 Step 1 新增的 per-role branch 如需重新枚举 `listTilesByType`，在 96×72 grid 上每 3s 扫一次可接受；如果后续想把 rate-window 缩到 1s 需重新评估。mitigation：Step 2 的 `_lastChainStall` cache 保证每 RATE_WINDOW_SEC 只算一次。
- **populationStats 不总存在**：代码里 `this.workersVal.textContent = String(stats.workers)` 用 `??` 兜底构造过一次（`HUDController.js:574-582`），Step 1 必须同样 guard 为 0。
- **tooltip 覆盖 existing title**：HUDController 已经在 `#applyGlossaryTooltips` 里给 `foodRateVal` 等周边节点附加 glossary；Step 3 操作的是 `#foodRateVal` 本身（currently no title），但要核对 7 个节点**没有**在 glossary table 里，否则需走 "existing title + ' | ' + gloss" 的 composite 模式（见 `HUDController.js:261-274`）。
- **Build preview tooltip 可能和 Round-0 02b 已加的 ✗ 前缀冲突**：见 `BuildToolbar.js:905`，现在已经在 `data-tooltip` 属性上挂 reasonText。Step 4 只应在 `reason === "insufficientResource"` 且 current tooltip 不含新 deficit 文字时才 append，避免重复。
- **可能影响的现有测试**：
  - `test/hud-controller.test.js`（若存在，grep 确认）——断言可能假设 title 为空
  - `test/colony-perceiver.test.js`（若存在）——新增 export 不破坏既有测试，但需检查是否 freeze 了模块导出列表
  - `test/prompt-builder.test.js`——PromptBuilder 仍消费 `analyzeResourceChains`，未动其签名，应不受影响

## 6. 验证方式

- **新增测试**：
  - `test/resource-chain-stall.test.js` 覆盖 5 个 bottleneck case（Step 6）
  - `test/hud-stall-tooltip.test.js` 覆盖 DOM tooltip 挂载 + 回退（Step 7）
- **手动验证**：
  - `npx vite` → 启动后 Temperate Plains + seed 42
  - 开局立即 hover 顶部 Wood 行的 `/min` badge，期望 tooltip 出现 "no lumber mill yet — build lumber (5w)"
  - 按 3 (Lumber 工具) 放一个 lumber，等 3s，hover 期望 tooltip 变为 "no loggers assigned" 或 "wood: +X.X/min over last 3s"（取决于 quota）
  - 把 Wood quota 拉 0，等 3s，hover 期望 tooltip 回到 "no loggers assigned — raise wood quota in Management"
  - 02b 复现场景：手动不开 Autopilot 按 reviewer 30 分钟路径走到 "Kitchen 需要 8w + 3s 我只有 7w" 时，hover Construction 面板的 Cost 行（Step 4），期望看到 "Need 1 more wood; wood is stalled: no loggers assigned"
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，DevIndex 不得低于当前 ~44 的 95% → 下限 41.8。本 plan 不动 simulation 系统，只加 UI 查询层，DevIndex 理论上应完全不变。
- **可度量指标（plan-level KPI）**：
  - 覆盖率：对 7 种资源 × 4 种常见 stall 原因（= 28 case），Tooltip 能给出非空且与原因对应的文案的比例 ≥ 90%
  - 2 分钟新手实验（如可执行）：casual 玩家在看到 "Wood 0.0/min" 后，从困惑到知道下一步动作的时间从 reviewer 的 **5 分钟**降到 **< 30 秒**

## 7. UNREPRODUCIBLE 标记

不适用——本 plan 基于 reviewer 原文精确段落 + 源码 grep，`ColonyPerceiver.analyzeResourceChains` 的 bottleneck 字段在仓库里直接可读（`src/simulation/ai/colony/ColonyPerceiver.js:449, 452-454, 467-472, 484-488`）。未打开 Playwright dev server 复现（build commit 61ddd8a 的 UI 行为由源码静态分析确定）。
