---
reviewer_id: 01d-mechanics-content
feedback_source: Round5/Feedbacks/01d-mechanics-content.md
round: 5
date: 2026-04-24
build_commit: 61ddd8a
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~320
  new_tests: 2
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 01d 的两条表面诉求拆开后折叠回一个根本矛盾：

**"Debug 层过透明 / HUD 层因果断层"**——最贵的因果数据（`intentWeights`、`targetPriorities`、`steeringNotes`、
`entity.debug.policyTopIntent`、`entity.debug.policyApplied`、`entity.debug.policyTargetScore`、per-worker `carry/hunger/fsm`）**已经在
state 里被计算好**，但只在三处可见：(a) DeveloperPanel（默认折叠的 Debug）、(b) EntityFocusPanel 的 "casual-hidden dev-only"
gated 区（casual 玩家看不见）、(c) AIDecisionPanel / AIExchangePanel（开发者调试器）。玩家默认 HUD 只看到资源数字和
"Food -151.7/min" 这种净速率，**没有"为什么"的桥**。

具体断层症状：

1. **观察闭环的"选中"环节失效**：EntityFocusPanel 存在但 (i) 无 persistent worker list，玩家不能"列出→cycle→focus"
   任意工人；(ii) 只能靠 canvas 点击（`SceneRenderer.#pickEntity` 的 16px fallback），点不中时唯一反馈是
   "Click a bit closer"；(iii) 没有键盘 Tab/箭头切换 focused worker。P0-2 的观察闭环在 UI 层 0% 可用。

2. **因果断层的数据层已备好但没落地**：
   - HUDController.js:545-557 已经**读取** `state.metrics.foodProducedPerMin / foodConsumedPerMin / foodSpoiledPerMin`
     并写到 `#foodRateBreakdown`，但后端 ResourceSystem / MortalitySystem / ProcessingSystem **从不写**这三个
     metric（`Grep foodProducedPerMin src/simulation` 返回 0 结果）。这意味着 HUD 已经给因果拆分留了位置，
     但数据侧是 stub。因果拆分写上去的那一天代价极低。
   - `intentWeights` 在 EntityFocusPanel 里只以 "Top Intents: deliver:2.50 | eat:1.80 | wood:1.60" 一行文本
     存在，且被 `.casual-hidden .dev-only` 两个 class 双重封印——casual profile（默认）完全看不到。

3. **这不是"加内容"的事**：
   - 不是加建筑（D5 拒绝）。
   - 不是加 tile / 动物 / 季节动画（D5 拒绝）。
   - 是**搬运**——把 DeveloperPanel / gated EntityFocus 里已经存在的数据搬到 casual 玩家能看见的一级观察层 +
     补齐 ResourceSystem/MortalitySystem/ProcessingSystem 的三个 per-min metric 使 foodRateBreakdown 真的显示
     `(prod +X / cons -Y / spoil -Z)`。

**锁定本轮核心矛盾**：**P0-2（观察闭环）+ P1-2（HUD 因果）作为同一个搬运问题处理**——不做 P0-1 配额修复
（留给其他 enhancer），不做 P0-3 DIRECTOR 透明化（留给其他 enhancer）。本 plan 动的是 UI/数据暴露层。

---

## 2. Suggestions（可行方向）

### 方向 A: Persistent Worker List + Entity Focus 去 casual-gate + foodRateBreakdown 供给端补齐

- **思路**：
  1. 在 EntityFocusPanel 顶部加 "Workers (N)" 列表按钮（每个 button 写 displayName + role + state），点击或
     键盘 Tab/箭头切换 selectedEntityId——**彻底不依赖 canvas pick**。
  2. 把 EntityFocusPanel 里 "Top Intents / Top Targets / AI Agent Effect / Decision Context" 的 `.casual-hidden .dev-only`
     壳子拆掉，改成单一 `<details>` "Why is this worker doing this?" section，默认 open、casual 也能看见。
  3. 在 ResourceSystem / MortalitySystem / ProcessingSystem 各加一个 sliding-window counter 把
     `foodProducedPerMin / foodConsumedPerMin / foodSpoiledPerMin` 写到 state.metrics，供 HUDController.js:545
     已经就位的 `#foodRateBreakdown` 真实渲染出 `(prod +X / cons -Y / spoil -Z)`。
- **涉及文件**：`src/ui/panels/EntityFocusPanel.js`、`index.html`（DOM 加 worker-list 容器）、
  `src/simulation/economy/ResourceSystem.js`、`src/simulation/lifecycle/MortalitySystem.js`、
  `src/simulation/economy/ProcessingSystem.js`、`src/app/GameApp.js`（键盘绑定 Tab/Shift+Tab cycle）。
- **scope**：中
- **预期收益**：
  - 玩家点击不中 worker 也能 100% 选中——观察闭环从 0% → 100% 可用。
  - casual profile 下 `intentWeights / policyTopIntent / Decision Context` 首次可见——因果密度 +2。
  - `Food -151.7/min` 真的展开为 `(prod +28 / cons -180)`——从 "数字" 变 "因果"。
  - reviewer 原话 "让玩家在 HUD 一眼看出赤字来自吃还是来自产量掉" 直接命中。
- **主要风险**：
  - 后端补 per-min counter 要小心**滑动窗口采样频率**——若每 tick 自增不重置，会爆涨；需要用 RATE_WINDOW_SEC=3
    的 snapshot 模式（HUDController 已有此样板，照搬）。
  - DOM 加 worker-list 要分页（>20 workers 时），否则长列表撑破 EntityFocusPanel 高度。

### 方向 B: PressureLens / Heat Lens 真实染色作为 "观察闭环的地图层"

- **思路**：将 `state.gameplay.pressureMap` / 工人 `intentWeights`.aggregate 染色到 `SceneRenderer` 的 tile overlay，
  让按 L 切换时地图上 warehouse / farm / kitchen 头顶真的浮一层半透明红蓝色块。reviewer 在 feedback 里明确指出
  "Heat Lens legend 浮现但 tile 本身无明显染色"。
- **涉及文件**：`src/render/SceneRenderer.js` (heatLens render path)、`src/ui/panels/EntityFocusPanel.js`（次要）。
- **scope**：中-大
- **预期收益**：
  - Heat Lens "承诺可视化" 真实兑现——机制呈现 +1.5。
  - 但这依赖 pressure map 已经被 PressureLens system 正确填充（不确定），有调试黑洞风险。
- **主要风险**：
  - Three.js overlay mesh 要同步更新，对 GPU/帧率敏感；已存在一套 render pipeline 入侵多。
  - 染色可视化不会解决"玩家点不中 worker"的 P0-2 核心，只修 P1-3 Heat Lens。
  - 多个 reviewer 已标 P1-3 Heat Lens，本 enhancer 独自去修有角色冲突风险。

---

## 3. 选定方案

**选方向 A**，理由：

1. **触达 summary 第 5 节 P0-2**：persistent worker list + intent casual 可见 = 把 Debug 层数据搬到 HUD 中间层的
   精确实现，不碰 `ColonyPlanner` / `WorkerAISystem` 的决策逻辑（那是 P0-1 的边界）。
2. **触达 P1-2**：foodRateBreakdown 的 DOM 已经写好、数据层 stub——只补三个 per-min counter 就让 reviewer 原话
   "从 -151.7/min → 为什么"的桥实装。
3. **scope 中**：5 文件、~320 LOC、2 新测试，单 Coder 90 分钟内可完成；不改现有测试契约（只新增）。
4. **不冲 freeze**：零新建筑、零新 tile、零新事件、零新生物；HW06 freeze 边界下的合法 UX/可见性修复。
5. **不冲突其他 reviewer plan**：P0-1 配额修复、P0-3 DIRECTOR 叙述是别的 enhancer 的范围；本 plan 只动 UI +
   read-only metrics 写入，数据流下游。
6. 方向 B（Heat Lens）留给 01c-ui 或 01b-playability，那边 P1-3 更高权重。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/economy/ResourceSystem.js:update` — edit — 在每次 `state.resources.food += delta`
  累加点**之前**维护一个 `_foodProdAccum` / `_foodConsAccum` tick-accumulator，然后在 RATE_WINDOW_SEC=3 窗口
  到期时刷出 `state.metrics.foodProducedPerMin = accum.produced / windowSec * 60`、
  `state.metrics.foodConsumedPerMin = accum.consumed / windowSec * 60`，重置窗口。采样逻辑 mirror
  HUDController.js:512-529 的 `_lastResourceSnapshot` pattern，以保持一致。

- [ ] **Step 2**: `src/simulation/lifecycle/MortalitySystem.js` — edit — consumption path（worker 从 warehouse
  或 carry 吃 food 减掉 state.resources.food 或 agent.carry.food 时）把被吃的 food 量加到 Step 1 的 accum.consumed
  即可。不改吃饭逻辑，只加 side-channel counter。若吃来自 warehouse → state.metrics.foodConsumedPerMin（已在 Step 1），
  若吃来自 carry → 同样算消费（玩家看到的还是净消费）。
  - depends_on: Step 1

- [ ] **Step 3**: `src/simulation/economy/ProcessingSystem.js` — edit — Kitchen 把 food→meals 的消费侧写到
  `accum.consumed`，Farm harvest 的 food 产出写到 `accum.produced`。Spoilage（food 过期腐败）写到
  `state.metrics.foodSpoiledPerMin`（同样的窗口 pattern）。
  - depends_on: Step 1

- [ ] **Step 4**: `index.html` — edit — 在 `#entityFocusBody` 之上新增 `<div id="entityFocusWorkerList"
  class="entity-worker-list"></div>`。CSS 里加 `.entity-worker-list { max-height: 140px; overflow-y: auto; ... }`
  和每个 row 的 `.entity-worker-row` 样式（role badge、state label、hunger 指示器三段式）。
  保留现有 `#entityFocusBody`，只在其上方插。

- [ ] **Step 5**: `src/ui/panels/EntityFocusPanel.js:render` — edit — 在 render() 开头增加
  `this.#renderWorkerList()` 方法：读 `state.agents.filter(a => a.type === 'WORKER')`，映射为
  `<button data-entity-id="...">{name} · {role} · {state} · hunger-badge</button>` 列表，click handler
  `this.state.controls.selectedEntityId = btn.dataset.entityId`。列表里当前 selected 的 row 加
  `.selected` class。分页：>20 workers 时只渲染前 20 + "+N more" 文本。

- [ ] **Step 6**: `src/ui/panels/EntityFocusPanel.js:render` — edit — 拆掉 line 350-352 的
  `engBlockOpen = <span class="casual-hidden dev-only">` 包壳的这 4 个区块之一：把 "Top Intents / Top Targets /
  AI Agent Effect / Decision Context" 四行从 gated 区**提升**到 character block 之后、engineering block 之前，
  用一个新 `<details open>` wrapper 包住（data-focus-key="focus:why"），summary 文案 "Why is this worker doing this?"。
  FSM / Policy Influence / Decision Time / Velocity / Path / AI Exchange panel 保持在 dev-only gated 区不动。
  - depends_on: Step 5

- [ ] **Step 7**: `src/app/GameApp.js` — edit — 在现有键盘 handler 附近（Grep `document.addEventListener`
  找到 keydown 注册处）加 Tab / Shift+Tab 绑定：`state.controls.selectedEntityId` 在
  `state.agents.filter(type==='WORKER')` 数组里 cycle（null → first, next → wrap）。绑定只在
  `state.session.phase === 'active'` 且 焦点不在 `<input>`/`<textarea>` 时生效。按 Escape 清除选中
  （GameApp.js:1308 already does this on other path；只需确保键绑定联动）。
  - depends_on: Step 5

- [ ] **Step 8**: `test/entityFocusWorkerList.test.js` — add — 构造 stub state（3 workers with role/state/hunger），
  mock DOM（或复用 existing jsdom harness），render EntityFocusPanel，断言：(a) 3 个 button 出现；
  (b) 点击第 2 个 button 后 `state.controls.selectedEntityId === agents[1].id`；(c) 选中项带 `.selected` class；
  (d) casual-mode body class 下 "Why is this worker doing this?" details 可见（非 display:none，且
  textContent 包含 "Top Intents"）。

- [ ] **Step 9**: `test/foodRateBreakdown.test.js` — add — 构造 stub state，驱动 3 秒 sim ticks：(a) Farm
  harvest 产出 20 food → metrics.foodProducedPerMin > 0；(b) 工人吃掉 15 food → metrics.foodConsumedPerMin > 0；
  (c) spoilage 损失 2 food → metrics.foodSpoiledPerMin > 0。断言 HUDController 的 foodRateBreakdown DOM 文本
  包含 `prod +` / `cons -` / `spoil -` 三段。

---

## 5. Risks

- **滑动窗口 edge case**：窗口刚刚翻页时，counter 会"跳变"一次，UI 视觉可能出现一瞬间的 0。已有
  HUDController.js `_lastComputedRates` 缓存 pattern 可避免（持续显示上一窗口值直到下一窗口算出）。
- **worker-list O(N) render**：如果人口到 50+，每帧重建 50 个 button 会掉帧。缓解：只在
  `state.agents.length` 变化或 `selectedEntityId` 变化时重建，用 `this.lastWorkerListSignature` 做脏检查。
- **casual-mode CSS 冲突**：Step 6 把四行从 gated 区搬出来，要确认 DeveloperPanel 不依赖这四行仍然 gated
  （Grep 过 DeveloperPanel.js 不碰 intentWeights，风险低）。
- **tab 键与 build tool 键位冲突**：当前 Tab 可能被浏览器原生接管切 focus。需要 preventDefault + 只在
  canvas focus/phase active 时生效。
- **可能影响的现有测试**：
  - `test/entityFocusPanel.test.js`（如存在）——Step 6 改变了 render HTML 结构；需 update snapshot。
  - `test/hudController.test.js`（如存在）——Step 1-3 新增 state.metrics 字段不破坏已有断言。
  - `test/resourceSystem.test.js`——Step 1 加的 accum 不改变 food 增减量，只是 side-channel。

## 6. 验证方式

- **新增测试**：
  - `test/entityFocusWorkerList.test.js` 覆盖 worker list 渲染 + 点击选中 + casual-mode "Why" 可见。
  - `test/foodRateBreakdown.test.js` 覆盖 per-min counter 三通道 + HUD 文本拼装。
- **手动验证**：
  1. `npx vite` 启动 dev server → 开场 Temperate Plains。
  2. Autopilot ON，4x 速度跑 2 分钟。
  3. **观察闭环度量**：在 EntityFocus 面板顶部点任意 worker-list row → 右侧 detail 立即切换到该 worker
     （成功率 100%，不再需要 canvas 点击）；按 Tab → 下一个 worker；Shift+Tab → 上一个。
  4. **因果密度度量**：在默认 casual profile 下（不按 Ctrl+Shift+D），选中一个 worker 后能看到
     "Why is this worker doing this?" 区块，内含 Top Intents、Top Targets、Decision Context、AI Agent
     Effect 四行。
  5. **HUD 因果度量**：顶栏 Food 行 `-151.7/min` 旁的小字 `(prod +28 / cons -180)` 必须非空且 prod+cons 约等于
     绝对值。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，DevIndex 不得低于当前
  值 (44) - 5% = **41.8**。因 Step 1-3 只加 side-channel counter，不改 food 流量，理论上 DevIndex 不变。
- **可度量指标声明（reviewer 01d 原话的 1:1 映射）**：
  - "把 intentWeights 搬上 HUD" → 完成（Step 6，casual profile 可见）。
  - "资源箭头加来源拆分 (consume -180 / harvest +28.3)" → 完成（Step 1-3 + HUDController.js:545 已就位）。
  - "玩家点工人看他在想什么" → 完成（Step 4-7 worker-list + Tab cycle，不依赖 canvas pick 命中）。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。Feedback 里的所有关键症状都可在代码层静态验证：
- `Grep foodProducedPerMin src/simulation` = 0 结果 → HUD 行 545 的 stub 被证实。
- `EntityFocusPanel.js:350-352` 明确用 `.casual-hidden .dev-only` 双 class 隐藏 intentWeights → casual 不可见被证实。
- `SceneRenderer.js:2244` 的 "Click a bit closer to the worker (hitbox is small)" 直接是 reviewer feedback 02b
  引用的那条提示 → canvas pick 脆弱性被证实。
- 无 `workerList` / `cycleNextWorker` 等 Grep 命中 → persistent list 不存在被证实。
