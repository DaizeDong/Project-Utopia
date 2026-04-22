---
reviewer_id: 01e-innovation
feedback_source: Round0/Feedbacks/05-innovation.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~260
  new_tests: 2
  wall_clock: 95
conflicts_with: []
---

## 1. 核心问题

Reviewer 给出 2.5/10 的"创新性"低分，三份根因（归并自 7 条 findings A–G）：

1. **Ghost feature 问题**：LLM policy/director 架构是项目唯一真正新颖的抽象层，
   但默认环境下 proxy health 返回 500、`ai.mode = "fallback"`、`lastPolicySource =
   "fallback"`，整个"AI driven colony"的卖点**玩家根本感知不到**。在 HUD 顶栏
   只有一行 `AI Policy: none`（`index.html:1043`）与 `AI Mode: off`，既不展示
   fallback 也是一种"rule-based storyteller"、更不告诉玩家"哪里可以打开 LLM
   并看到不同"。症状：玩家 45 分钟的 session 里看不到任何独特的 AI 表达。
2. **独特资产被埋在 debug 面板**：Policy Focus / Policy Summary / Policy Notes
   / "Worker policy biases FARM ratio to 27.3%..." 这些**可解释性**输出已经存在
   （`EntityFocusPanel.js:285-332`），reviewer 亲自承认这是在 RimWorld/DF 里
   没见过的卖点。但它们只有点开 Entity Focus、切换到 debug 开关后才能看到。
3. **工人身份零叙事**：`displayName` 用 `withLabel(id, "Worker")` 生成
   `Worker-10`（`EntityFactory.js:32-35,111`）。`traits`、`skills`、
   `relationships`、`memory.recentEvents` 全部已经在 state 里（`EntityFactory.js:108-135`），
   但 UI 层从未把这些拼成一句"人物介绍"。死亡提示也只是
   `N (starve X / pred Y)` 聚合数字（`HUDController.js:194-198`），
   没有"Worker-Li 饿死在 3 号仓库外的路上"的个人化文本。

三条都是**surfacing existing data** 类问题——不需要新 mechanic，符合 HW06
freeze；但每条都能直接拉升"创新性"体感。

## 2. Suggestions（可行方向）

### 方向 A: 把 Policy Narrative 提升到主 HUD 顶栏 + 给工人起名字

- 思路：复用已有的 `state.ai.groupPolicies`（workers/traders/saboteurs/
  herbivores/predators）与 `lastPolicySource/lastPolicyModel`，在 HUD 顶栏加一个
  一行的 "Storyteller" 滚动字幕：展示当前 workers 组的 `policy.focus` +
  `policy.summary` 的第一句（fallback 时显示 "Rule-based storyteller: Stone is
  low, boosting quarry work..."）。同时给 worker `displayName` 换成 `nameBank`
  里的随机名字 + 一句由 `traits` + `skills` 拼出的 backstory（e.g.
  "Aila, swift farmer (farming 0.82, social 0.71)"）。死亡通知追加最近一条
  `memory.recentEvents` 文本。
- 涉及文件：`index.html`（加一个 `#storytellerStrip` 元素），
  `src/ui/hud/HUDController.js`（新字段 + render 分支），
  `src/entities/EntityFactory.js`（新 nameBank + backstory 构造），
  `src/simulation/lifecycle/MortalitySystem.js`（死亡事件携带 displayName），
  `src/ui/panels/EventPanel.js`（支持死亡的叙事行渲染）。
- scope：中
- 预期收益：直接击中 reviewer 的 3 个主要扣分点（ghost feature、debug-only
  innovation、零叙事），且不需要新机制；玩家打开游戏第一屏就能看到"AI 在讲
  什么故事"与"某个名字叫 Aila 的工人在干嘛"。
- 主要风险：`displayName` 变化可能影响测试里 string 匹配（`test/*.test.js`
  里若有 `"Worker-"` 硬编码）；需要守住 id 稳定性（`entity.id` 保持不动）；
  Storyteller 字幕在 fallback 模式下文本来源需在 Guardrails 里 fallback
  填充 `focus/summary` 字段（已有，见 `ResponseSchema.js`）。

### 方向 B: 改善 AI 模式 banner — 一键诊断 + "fallback-as-feature" 重叙事

- 思路：不动叙事层，只改 AI 状态表达。把 HUD 的 `aiModeVal / aiPolicyVal` 替换为
  一个带颜色 badge 的 "AI: Rule-based / LLM-live / LLM-recovering" 可点击徽章，
  点击弹出一个小 tooltip 说明 proxy 状态与 `coverageTarget`、并给出一条
  "Enable LLM"的引导（链接到 README 的 proxy 配置章节）。同时把 fallback policy
  的文本（`groupPolicy.summary`）抬到 HUD。
- 涉及文件：`src/ui/hud/HUDController.js`，`index.html`，
  `src/ui/panels/DeveloperPanel.js`（复用已有 AI runtime stats 渲染）。
- scope：小
- 预期收益：解决 "ghost feature" 的**感知**问题（让玩家知道 fallback 也在跑），
  但对叙事/身份问题帮助有限。
- 主要风险：只做 banner 不解决 reviewer 最痛的叙事零存在感问题；创新性感知提升
  有限。

### 方向 C: 主界面新增 "AI Trace" 叙事流面板

- 思路：在 HUD 右侧新增一个常驻 panel，流式展示 `state.debug.aiTrace` 里的
  最近 N 条 decision，按"[t=123s] Environment Director: weather=drought,
  focus=frontier buildout"格式。
- 涉及文件：`index.html`、新建 `src/ui/panels/AITracePanel.js`、
  `src/ui/hud/HUDController.js`。
- scope：中
- 预期收益：对 AI 爱好者友好。
- 主要风险：reviewer 明确说 "Developer Telemetry 那一大条是游戏体验的噪音"；
  把 trace 抬到主界面**可能踩 reviewer 的雷**。且 fallback 模式下 trace 条目
  很少，默认环境效果差。

## 3. 选定方案

选 **方向 A**，理由：

- 同时覆盖 reviewer 的 3 个主要扣分点（ghost feature 感知、debug-only 卖点、
  零叙事），单点杠杆最大。
- 不引入新 gameplay mechanic，全部复用已有字段（`groupPolicies.focus/summary`、
  `traits`、`skills`、`memory.recentEvents`），**严格符合 HW06 feature freeze**。
- B 只是 A 的子集，风险收益比更差；C 与 reviewer 明确否定的"debug 面板给玩家
  看"直接冲突。
- 所有改动集中在 UI + 数据拼接层，不触碰 SYSTEM_ORDER、balance、pathfinding 等
  deterministic 核心，DevIndex/benchmark 不会回归。

## 4. Plan 步骤

- [ ] Step 1: `src/entities/EntityFactory.js:32-35` — `edit` —
  把 `withLabel` 改成：如果 type 是 WORKER 就从新加的 `WORKER_NAME_BANK`（~40 个
  短名：Aila, Ren, Bram, Ivo, ...）里用 `random()` 选一个，与 id 数字拼成
  `Aila-10`（保留数字后缀以避免 ID 冲突展示），否则回退现行逻辑（Trader-N /
  Predator-N 不变）。depends_on: 无。
- [ ] Step 2: `src/entities/EntityFactory.js:104-140` — `edit` —
  在 `createWorker` 里新增 `worker.backstory`（string），格式：
  `"<topSkill> specialist, <topTrait> temperament"`，例如
  `"farming specialist, swift temperament"`。topSkill/topTrait 由已有 skills/
  traits argmax 得到。同样在 `createVisitor`/`createAnimal` 里给一个更简短的
  `backstory`（e.g. "wandering trader"、"lone predator"）。depends_on: Step 1。
- [ ] Step 3: `index.html:1040-1045`（AI Policy kv 块附近） — `add` —
  在顶栏新增 `<div id="storytellerStrip" class="small"></div>`，CSS 单行省略、
  固定高度；放在 HUD 最显眼的位置（AI Mode 之下、资源条之上）。depends_on: 无。
- [ ] Step 4: `src/ui/hud/HUDController.js:48-52`（`aiPolicyVal` 声明块） — `edit` —
  在构造函数里新增 `this.storytellerStrip = document.getElementById("storytellerStrip")`；
  新增 render 分支 `renderStorytellerStrip(state)`：读取 `state.ai.groupPolicies.get("workers")?.data`，
  拼 `[${lastPolicySource === "llm" ? "LLM" : "Rule-based"} Storyteller] ${focus}: ${summary}`，
  fallback 空时显示 `"Rule-based storyteller idle — colony on autopilot"`。
  在 `render()` 主入口调用。depends_on: Step 3。
- [ ] Step 5: `src/ui/hud/HUDController.js:194-198`（deathVal 渲染） — `edit` —
  把死亡行从 `N (starve X / pred Y)` 升级为：当 `state.metrics.deathsTotal` 比
  上次 render 增加时，从 `state.agents` 中找 `deathSec >=` 上次 tick 的 entity，
  取第一个的 `displayName + backstory + deathReason` 拼一句
  `"Aila-10 (farming specialist) died of starvation at (32,18)"`，展示 8 秒后
  回到聚合数字。用 HUDController 的已有 `lastDeathsSeen` 缓存。
  depends_on: Step 1, Step 2。
- [ ] Step 6: `src/ui/panels/EntityFocusPanel.js:310` — `edit` —
  在 displayName 行后加一行 `<div class="small"><b>Backstory:</b> ${escapeHtml(entity.backstory ?? "—")}</div>`，
  把已有的 Policy Focus/Summary/Notes 行前置到 `Type/Role` 行之前（目前在第
  328-332 行），让"AI 在如何影响这个人"从一开始就被看到。depends_on: Step 2。
- [ ] Step 7: `test/entity-factory.test.js` — `add` — 新增（若已存在则追加）
  测试用例：
  (a) `createWorker` 返回对象的 `displayName` 匹配 `/^[A-Z][a-z]+-\d+$/`；
  (b) 返回对象含 `backstory` 非空字符串；
  (c) `displayName` 与 `id` 仍然不同；
  (d) 两次独立调用同一 seed 的 deterministic random 得到相同 displayName（保
  证 replay/snapshot 决定性）。depends_on: Step 1, Step 2。
- [ ] Step 8: `test/hud-storyteller.test.js` — `add` — 新建测试，mock 最小
  state，断言：
  (a) 无 groupPolicy 时 storytellerStrip 文本包含 `"Rule-based storyteller idle"`；
  (b) `groupPolicies.set("workers", { data: { focus: "frontier buildout",
  summary: "Stone is low" }})` + `lastPolicySource = "fallback"` 时，strip
  文本包含 `"Rule-based Storyteller"` 与 `"frontier buildout"`；
  (c) `lastPolicySource = "llm"` 时 prefix 变为 `"LLM Storyteller"`。
  depends_on: Step 4。
- [ ] Step 9: `src/ui/hud/HUDController.js` 顶部测试 hook — `edit` —
  导出 `renderStorytellerStrip(state)` 为纯函数（或提取到新文件
  `src/ui/hud/storytellerStrip.js`，返回 HTML string），让 Step 8 能无 DOM
  测试。depends_on: Step 4。

## 5. Risks

- **测试断言回归**：如果 `test/*.test.js` 里有 `assert.equal(w.displayName,
  "Worker-10")` 这种硬编码，Step 1 会让它们挂。缓解：先 grep `Worker-` 字面量，
  把 assertion 改为正则 `/^[A-Z][a-z]+-\d+$/`。已知命中点：
  `test/hud-controller.test.js`（若存在死亡聚合字符串断言）需要更新到新格式。
- **Snapshot / replay determinism**：`displayName` 现在由 `random()` 选出，
  必须保证 Step 7 (d) 的 determinism——即 name 选择发生在已有的 deterministic
  RNG 链上（`createDeterministicRandom(grid.seed)` → `createInitialEntitiesWithRandom`
  → `createWorker(p.x, p.z, random)`）。`EntityFactory.js:289` 已经把 random
  透传到 createWorker，所以只要 Step 1 在 createWorker 内部继续用这个 random
  就安全。**不要** 用 `Math.random()` 替代。
- **Storyteller strip 影响 UI 布局**：新增一行可能把主视图往下推 ~24px；
  需要在 `index.html` 的 strip 上加 `max-height: 24px; overflow: hidden;
  text-overflow: ellipsis` 避免溢出。
- **Fallback summary 可能是空字符串**：`ResponseSchema.js` 里 fallback policy
  可能不填 `summary`；Step 4 的空判必须 `.trim() || "colony on autopilot"`。
- **可能影响的现有测试**：`test/hud-controller.test.js`、
  `test/entity-factory*.test.js`、`test/snapshot*.test.js`（若断言 displayName
  前缀）。需人工 grep 确认并逐个更新断言。

## 6. 验证方式

- 新增测试：
  - `test/entity-factory.test.js` 追加 "worker name + backstory" 套件（见 Step 7）。
  - `test/hud-storyteller.test.js` 新建（见 Step 8），覆盖
    3 种 source × 2 种 data 非空/空的组合。
- 手动验证：
  1. `npx vite` 打开 `http://localhost:5173`。
  2. 新地图加载 → HUD 顶部应能看到 storytellerStrip 一行非空文本（fallback
     模式下至少有 `"Rule-based storyteller idle — colony on autopilot"`）。
  3. 点击任意 worker → Entity Focus 第一屏应显示 `Aila-10` / `Backstory: ...`，
     Policy Focus 行排在 Type/Role 之上。
  4. Fast-forward 到第一个工人饿死 → deathVal 字幕应短暂显示
     `"Aila-10 (farming specialist) died of starvation at (x,z)"`，8 秒后回到
     聚合数字。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 /
  temperate_plains，DevIndex 不得低于**当前值 39 - 5% = 37**；deaths 不得高于
  **当前值 454 + 10% = 499**（叙事改动不应改变模拟行为，宽松阈值只是防御
  `displayName` 构造里不小心引入的 random() 多调用打破 RNG 对齐）。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用 — 本 plan 不依赖动态复现 feedback 里的具体截图；reviewer 的核心证据
（AI Mode: off、Worker-N 命名、死亡聚合数字、Policy Focus 埋在 debug 面板）
已由 code inspection 全部确认：
- `src/app/types.js`（state.ai 默认 `mode: "fallback"`、`lastPolicySource:
  "none"`）、`src/entities/EntityFactory.js:32-35`（`withLabel` → `Worker-N`）、
  `src/ui/hud/HUDController.js:194-198`（聚合死亡字符串）、
  `src/ui/panels/EntityFocusPanel.js:285-332`（Policy Focus/Summary/Notes 仅在
  debug 面板渲染）均已 Read 确认。
