---
reviewer_id: 02b-casual
feedback_source: Round0/Feedbacks/player-02-casual.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~260
  new_tests: 2
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

基于 `player-02-casual.md`（Stardew Valley 型休闲玩家，综合分 3/10，15 分钟弃坑）的 findings，归并为三条根本问题：

1. **开发者面板在默认视图里"喧宾夺主"，导致休闲玩家第一屏就被淹没。** 顶部 10 个资源图标、右侧 Debug telemetry (`A* requests=894…`)、左侧 18 个地形 slider、点 NPC 出 FSM dump ——这些都是 v0.7 工程化调试期留下的默认开启面板。Casual reviewer 明确说："点 NPC 我得到一张脑机接口报告"、"Settings 里 18 个数字滑条"。**病因**：`index.html` 里多个 `<details open>` + Debug 面板 / 设置面板默认可见，而 Build 面板使用 `data-tool` title 里包含 `"cost: 5w"` 这种程序员缩写；且 `GameStateOverlay` 完全没有区分 "新手第一次打开" vs "老玩家" 的 UI profile。

2. **放置规则是"红字报错驱动"而非"可见预览驱动"，违反 Stardew/Animal Crossing 的休闲节奏。** Reviewer 两次核心卡点——"Insufficient resources"（以为 5w = 5 food）和 "No forest node on this tile"——都是**点下去之后才知道错**。**病因**：`BuildToolbar` 的 hover preview（`buildPreviewVal`）在 HTML 里虽然存在，但没有强预览态（不会在 canvas 上高亮合法 tile），且 tooltip 用 `w/s/f/h` 缩写。Forest/stone/herb node 在 canvas 上没有和普通 grass 做视觉区分，导致玩家"看着是草地，点下去才知道不是森林 node"。

3. **怀疑性 Bug：滚轮 / 点地图 / 按 L 会"退回主菜单"。** Reviewer 报告三次被扔回菜单。审源码：`shortcutResolver.js` 的 L → `toggleHeatLens` 不会切 phase；`resolveGlobalShortcut` 对 `Digit0` / `Home` / `"0"` 返回 `resetCamera`（无菜单切换）。**真正可能触发点**：(a) `overlayResetBtn` / `overlayResetFromMenuBtn` 在 end / menu 面板上，若 reviewer 在 end phase 误点到；(b) 菜单 overlay 的 pointer-events 是 `none`（`GameStateOverlay.js:104` 注释确认），但在 end phase `overlayEndPanel` 仍 block 点击，若 evaluate 进入 end phase，玩家"滚轮想放大地图"期间焦点在 `New Map` 按钮 + 空格会触发 click。P0，需 UNREPRODUCIBLE 标记 + 加防御性守卫。

---

## 2. Suggestions（可行方向）

### 方向 A: "Casual Mode" UI profile — 默认隐藏工程面板 + 把资源缩成 4 条主 + 给关键规则加 canvas 预览

- 思路：新增一个 URL/localStorage 驱动的 `uiProfile = "casual" | "full"`（默认 casual），在 casual 下：Debug 面板折叠且不默认展开、Settings 的 Advanced 折叠、右下 EntityFocus 只显示 "Role / HP / Hunger" 三行（隐藏 FSM / Path / Policy 区块）、顶部 HUD 只保留 Food/Wood/Stone/Workers 4 条主资源（Meals/Tools/Medicine/Herbs/Prosperity/Threat 折叠进 "Advanced Stats" 小 disclosure），Build 面板 hover 时在 canvas 上对合法 tile 画绿描边、非法 tile 画红描边（基于现有 `buildPreviewVal` 的规则复用）。
- 涉及文件：`index.html`（data-ui-profile 属性 + 默认折叠 `details`）、`src/ui/panels/EntityFocusPanel.js`（profile 判断）、`src/ui/panels/DeveloperPanel.js`（默认隐藏）、`src/ui/tools/BuildToolbar.js`（hover 高亮合法 tile，输出到 `state.controls.buildValidity`）、`src/render/SceneRenderer.js`（读 validity overlay 绘制描边）、`src/app/GameApp.js`（读 localStorage `pu.uiProfile` 并 apply）。
- scope：**中**
- 预期收益：直接命中 reviewer 前 3 条抱怨（面板花、NPC FSM、点击才知道错）。把"嘴角上扬"概率从 0 次拉到第一次看到绿描边 / 第一次农场收获弹窗。
- 主要风险：可能与 `03-ui` / `04-playability` 等其他 reviewer 的方案撞车（他们可能直接要求删掉 Debug 面板）；若合并时冲突，orchestrator 需要裁决。另：canvas 描边需要 `SceneRenderer` 增加一条半透明 overlay pass，对长横向基准可能掉 1-2 FPS。

### 方向 B: "First-Run Guided Pulse" — 只做首开引导 + node 可见化 + resource 图例 tooltip

- 思路：不动面板结构，只做 4 个最小改动：(1) 首次打开时（无 localStorage key `pu.seen`）在 `GameStateOverlay` 菜单面板顶部插入 3 张 swipeable "How to play" 静态卡片（Build → Place near resources → Watch Food）；(2) 在 `SceneRenderer` 里给 forest/stone/herb node tile 加一个**小图标 overlay**（现在只是 noise texture 的差异），让玩家肉眼看得出哪里能建 lumber；(3) Build tool button title 把 `5w` 改成 `5 wood`；(4) 把 "Cost: 5w" 在 `buildToolCostVal` 展开为 `Cost: 5 wood (you have 18)`，红字当不足。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`（首开卡片）、`src/render/SceneRenderer.js` + `src/render/ProceduralTextures` 相关（node icon overlay）、`index.html`（button titles）、`src/ui/tools/BuildToolbar.js`（cost 文本渲染）。
- scope：**小-中**
- 预期收益：命中"不知道森林在哪"、"5w 是什么"两个具体的放弃点；保持其他面板不变，方案冲突面最小。
- 主要风险：没解决 NPC FSM dump / Debug 面板默认开的问题（reviewer 评 UI 舒适度 2/10 的主因），只是减轻；可能被 summarizer 归类为"美化而非根治"。

### 方向 C: 只改 bug — 修复"滚轮回主菜单"类怀疑性回归 + 加防误点守卫

- 思路：纯 bug fix，不做 UX。加：`overlayResetBtn` / `overlayResetFromMenuBtn` 的 click 要求二次确认（弹一行"Create new map? (y)"）；菜单/end phase 下 `#onGlobalKeyDown` 不响应 `L` / `0` / 空格（避免用户以为自己在游戏中但其实在菜单）；`resetCamera` 不再绑 `Home` / `"0"` 双键（减少误触）。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`（确认对话框）、`src/app/shortcutResolver.js`（phase gating）、`src/app/GameApp.js`（确认流程）。
- scope：**小**
- 预期收益：消除 reviewer 的第 3 条怒点（"每 3 分钟扔回车库"），但对面板过载、教学缺失无帮助。
- 主要风险：L / 0 / Space 在 menu 里失效可能影响其他 reviewer（speedrunner 可能要在菜单里直接按 Space 快进）；二次确认在硬核玩家看来是"多此一举"。

---

## 3. 选定方案

选 **方向 A（Casual Mode UI profile）**，理由：

- Reviewer 是 P0 休闲玩家代表（综合 3/10），其痛点"10 个资源 / Debug 默认开 / 点 NPC 看 FSM / 不知道哪能建"全部被方向 A 覆盖；方向 B 只覆盖 2/4，方向 C 只覆盖怀疑性 bug。
- 方向 A 不引入新 mechanic，符合 HW06 feature freeze 约束（polish / UX only）。
- Casual profile 通过 URL `?ui=casual|full` + localStorage 切换，不破坏现有 `test/hud-controller.test.js` / `test/game-state-overlay.test.js`（它们在 jsdom 环境下无 localStorage 时走 full profile 默认路径即可）。
- 怀疑性 bug（方向 C 的核心）改成在本 plan 的 Step 7 用 **UNREPRODUCIBLE 标记 + 轻量守卫**处理，不单独拆方案。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/app/types.js:state.controls` — `add` — 在 `controls` 默认值里新增 `uiProfile: "casual"` 字段，并新增 `buildValidity: { hoverTile: null, legal: false, reason: "" }`。`state.controls` 初始化位置见 `createDefaultControls()` 或等价构造函数（目前 controls shape 在 `GameApp.#ensureDefaults` 周围）。
- [ ] **Step 2**: `src/app/GameApp.js:constructor` — `edit` — 在 constructor 末尾（UI wiring 之前）读取 `localStorage.getItem("pu.uiProfile") ?? new URLSearchParams(location.search).get("ui") ?? "casual"`，写入 `this.state.controls.uiProfile`，并在 `document.documentElement.setAttribute("data-ui-profile", profile)` 暴露给 CSS。
  - depends_on: Step 1
- [ ] **Step 3**: `index.html` — `edit` — (a) 给 `#debugFloatingPanel` / `#settingsFloatingPanel` 加 `hidden` 默认属性；(b) 给 `.floating-panel` 添加 CSS 规则 `html[data-ui-profile="casual"] #debugFloatingPanel, html[data-ui-profile="casual"] #settingsFloatingPanel { display: none !important; }`（用户点顶部 Debug/Settings toggle 按钮可恢复，toggle 自身在 casual 下保留但样式弱化）；(c) 把 12 个 `data-tool` button 的 title 里 `5w` / `3w` / `2s` 全部展开为 `5 wood` / `3 wood` / `2 stone` 等显式词；(d) 在 `#statusBar` 的 top resources 上加 `data-resource-tier="primary|secondary"`，用 CSS `html[data-ui-profile="casual"] [data-resource-tier="secondary"] { display:none; }` 把 Meals / Tools / Medicine / Herbs / Prosperity / Threat 6 条隐入 "Advanced" 小 disclosure（同文件新增 `<details id="advancedStats" class="hud-advanced">`）。
  - depends_on: Step 2
- [ ] **Step 4**: `src/ui/panels/EntityFocusPanel.js:render` 或等价函数 — `edit` — 读 `this.state.controls.uiProfile`，当 `"casual"` 时只渲染 `Role / HP / Hunger / 当前在做什么` 四行，把 FSM / Path / Policy Influence / Decision Time / Velocity / Path Recall 等区块包裹在 `if (profile === "full")` 分支里。同时保留原字段的 DOM id 不删（`test/entity-focus-panel` 如有则继续引用）。
  - depends_on: Step 2
- [ ] **Step 5**: `src/ui/tools/BuildToolbar.js:onHover`（或 hover 相关处理，搜索 `buildPreviewVal`）— `edit` — hover 每 tick 把 `{ x, y, legal, reason, tool }` 写入 `state.controls.buildValidity`。Legal 判定复用现有规则（例如 lumber 合法当 tile 有 forest node + 邻近 road / warehouse），`reason` 直接用现有的错误文案 ("No forest node on this tile.") 以保证和 click 后的红字一致。
  - depends_on: Step 1
- [ ] **Step 6**: `src/render/SceneRenderer.js` — `add` — 新增 `#renderBuildValidityOverlay()`，每帧读 `state.controls.buildValidity.hoverTile`，在 canvas 上对该 tile 画 2px 描边（`legal ? "#4ade80" : "#ef4444"`）+ tooltip `reason`。在主 render loop 里（搜索 `this.drawPressureLens` 或类似 overlay 调用附近）调用此方法。Casual profile 下启用；`full` profile 下可保留（老玩家也受益）。
  - depends_on: Step 5
- [ ] **Step 7**: `src/app/shortcutResolver.js:resolveGlobalShortcut` — `edit` — 在 `phase !== "active"` 时，除了 `Space / Escape` 之外，将 `L / 0 / Home / Digit1-6` 一并 gate 掉（返回 null）。这是对 reviewer 第 3 条"按 L 回主菜单"的怀疑性 bug 的防御性修复 —— 即便不是 bug，在菜单 / end phase 阶段也不应该悄悄触发 toggleHeatLens（菜单期间按钮和 renderer 对此没准备，可能抛异常）。
  - depends_on: Step 2
- [ ] **Step 8**: `test/ui-profile.test.js` — `add` — 新增测试：(a) 当 `document.documentElement[data-ui-profile="casual"]` 时，`GameStateOverlay` 渲染只有 `primary` tier 资源可见；(b) `EntityFocusPanel.render` 在 casual profile 下 DOM 中不包含 "FSM:" / "Policy Influence:" 文案；(c) `resolveGlobalShortcut({ key:"l" }, { phase: "menu" })` 返回 `null`。
  - depends_on: Step 4, Step 7
- [ ] **Step 9**: `test/build-validity-overlay.test.js` — `add` — 新增测试：mock `state.controls.buildValidity = { hoverTile:{x:5,y:5}, legal:false, reason:"No forest node on this tile." }`，调用 `SceneRenderer.#renderBuildValidityOverlay` 或其公共代理，断言 canvas 上对应 tile 接到了红色描边 draw call（通过 mock CanvasRenderingContext2D 统计 strokeRect 调用）。
  - depends_on: Step 6

---

## 5. Risks

- **Risk 1 — profile 切换破坏 HUD 布局**：隐藏 6 条 secondary 资源后顶栏长度变短，可能让 `#statusAction` 滚动 banner 位置漂移。对策：在 Step 3 的 CSS 里用 `flex: 1 1 auto` 保持行结构。
- **Risk 2 — EntityFocusPanel 测试失败**：`test/entity-focus-panel.test.js`（如存在）可能断言 FSM 字段存在。对策：Step 4 不删 DOM 节点，只加 `hidden` 属性；测试可继续 query 到元素但需要调整 visibility 断言。
- **Risk 3 — BuildToolbar hover 热路径**：每帧写 `state.controls.buildValidity` 可能触发不必要的 rerender。对策：在 Step 5 里 dedupe（只在 tile 或 legal 变化时写），避免 per-frame allocation。
- **Risk 4 — Shortcut gating 影响 speedrunner**：Step 7 在 menu phase 阻断 L / 0 可能和 03-speedrunner（若存在类似诉求）冲突。对策：保留 `Space` 在 menu 的能力（目前 resolver 也确实已经 gate 了 space in non-active，参见 shortcutResolver.js:50）。
- **可能影响的现有测试**：
  - `test/game-state-overlay.test.js` — 新增 data-ui-profile 属性可能影响 DOM 快照。需要小改。
  - `test/hud-controller.test.js` — 顶栏资源 visibility 逻辑变化。
  - `test/shortcut-resolver.test.js` — 新增 phase gating 需追加 case。
  - `test/entity-focus-panel.test.js`（如有） — FSM 区块隐藏条件。
  - `test/ui-layout.test.js` — `overlay*` id 集合不变，应该 pass；但 advancedStats 新增 id 需加白名单。

## 6. 验证方式

- **新增测试**：
  - `test/ui-profile.test.js` 覆盖 casual vs full profile 下的 HUD 可见性、EntityFocus 精简、shortcut gating。
  - `test/build-validity-overlay.test.js` 覆盖 hover 描边 draw call。
- **手动验证**（Vite dev server `http://localhost:5173`）：
  1. 清空 localStorage 后打开 `/?ui=casual`（默认）。期望：Debug 面板隐藏、Settings 面板隐藏、顶栏只看到 Food/Wood/Stone/Workers 4 条。
  2. 选 Lumber 工具 hover 草地 → canvas 出红描边 + tooltip "No forest node on this tile."；hover 明显森林 tile → 绿描边 + "Build lumber camp (3 wood)"。
  3. 菜单界面按 L / 0 / 1-6 → 无反应（不会切 phase、不会进 heatLens）；按 Space 仍可切 phase 无效 OK；Start Colony → 进入游戏后 L 正常 toggle heat lens。
  4. 点一个 worker → Entity Focus 只显示 Role / HP / Hunger / 当前任务 四行，不出现 FSM / Policy / Path。
  5. 打开 `/?ui=full` → 全部面板回到当前 v0.8.1 行为，老玩家回归路径无损。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，DevIndex 不得低于 **42**（当前 v0.8.1 = 44，容忍 ±5%）；由于本 plan 不动 simulation 系统，DevIndex 预期基本持平。另外检查 FPS：主 canvas `SceneRenderer` 新增 overlay pass 对 30 秒基准帧率影响 < 2 FPS。

## 7. UNREPRODUCIBLE 标记

Reviewer 报告的 "滚轮 → 主菜单 / 点地图 → 主菜单 / 按 L → 主菜单" 三个症状，在当前代码审阅下**无法直接复现**：

- `shortcutResolver.js:45-47` L → `toggleHeatLens`，不触发 phase 切换。
- `GameApp.js:1412-1432` `#setRunPhase("menu", …)` 只被 `#evaluateRunOutcome` 在特定"loss"条件下调用，且中间会先切 `"end"`。
- `gameStateOverlay` 的背景 `pointer-events:none`（注释见 `GameStateOverlay.js:104`），正常点击 canvas 不会穿到 overlay 按钮。

**尝试但未复现**：未启动 Playwright MCP 做 live 复现（时间预算已到，优先保证 plan 可写）。可能的真实触发路径：
1. Reviewer 的 colony 死掉进入 end phase 时，恰好滚轮 / 点击落在 overlay `New Map` 按钮上（end panel 此时可见 & 接收点击）。
2. Reviewer 的浏览器扩展（广告拦截 / 暗色模式）注入了 reload 行为。
3. `overlayResetFromMenuBtn` 的按键激活（例如焦点 + 空格 = click）被误解为 "L 回主菜单"。

本 plan **Step 7** 的 shortcut gating 是对上述路径的防御性修复（即使源头不是 shortcut，gating menu phase 下的全局按键也能减少误触面）。如 Coder 执行本 plan 后仍能复现，请在下一 round 的 feedback 里提供具体可复现步骤（点击序列 + console log），届时升级到 P0 的独立 bug fix plan。
