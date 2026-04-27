---
reviewer_id: 01a-onboarding
feedback_source: Round0/Feedbacks/01-onboarding.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~420
  new_tests: 2
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 评分 2/10。散落的 16 条 findings 归并后是 **3 个根本问题**，全部属于
"开发者仪表盘 vs. 玩家产品" 的切割缺失，本质是 **UI 层没有 player-facing
surface**，所有玩家接触点直接暴露了内部状态：

1. **零教学入口（P0）**：主菜单没有 Help/Tutorial 按钮、没有快捷键 `?`/`F1`
   呼出帮助、底部快捷键提示行过于稀疏；玩家看到 `SEED 1337`、
   "BROKEN FRONTIER · FRONTIER REPAIR" 这些开发者字符串后对玩法理解度 = 0%。
   反馈缺陷 1、第一印象第 1/2/5/6 条。
2. **UI 把内部调试结构当玩家界面（P0）**：
   - Entity Focus 面板直接 dump FSM state / Policy weights / A* path index /
     path grid version（`EntityFocusPanel.js:313-320`），无 RimWorld 风格
     "Needs / Task" 视图。
   - Dev Telemetry dock 在标准玩家无 URL 参数时仍会被 `localStorage` 旧值
     展开、并 intercepts pointer events（`BuildToolbar.js:423-429`、
     `index.html:624` 的 `dock-collapsed` 初始类依赖于 localStorage 回读）。
   - 资源图标 `title` 属性存在（`index.html:811-825`），但 **Prosperity/Threat
     两个关键量纲图标在 `#hudProsperity` / `#hudThreat` 上没有完整的 "越高越
     好还是越低越好" 量纲说明**（`index.html:676, 683` 提示过短），且 native
     `title` 的 500ms 延迟 + 无视觉样式 = 新玩家实测感觉"没有 tooltip"。
3. **反馈通道短暂且无持久化（P1）**：`Insufficient resources.` 这类错误
   通过 `state.controls.actionMessage` 传递，在 `HUDController.js:268-277`
   渲染时用 2 秒 opacity 渐隐，没有堆栈式通知历史面板；
   `state.metrics.warningLog` 存在但未在任何玩家可见处被展开。

> 注：反馈第 8 条 "游戏结束 = 扔回主菜单" 其实有 **end panel** 存在
> （`GameStateOverlay.js:163-204` 渲染 Colony Lost + stats + Try Again），
> 说明 end 画面是**正确实现却未被玩家感知**——因为 reviewer 点 "New Map"
> 后立刻切模板，根本没看到 end 画面。这归入 P1，而非 P0。

## 2. Suggestions（可行方向）

### 方向 A: 纯前端 polish 三件套（Help Modal + Tooltip-Hardening + Entity-Focus 玩家模式）

- **思路**：不动游戏机制、不加新 system。在 `index.html` 新增一个内嵌
  Help Modal（3 页 static HTML：基础控制 / 资源链 / 威胁系统），绑到
  新增的 `?` Help 按钮和 `F1`/`?` 键；把 Entity Focus 的调试块折叠进一个
  `<details open=false>` "Debug Info" 子面板，默认面向玩家只显示 Name / Role
  / Hunger Bar / Current Task / Carry；强制 `#devDock` 在 URL 无 `?debug=1`
  时永远 `display:none`，并在 `#hudProsperity` / `#hudThreat` 上用
  `data-tooltip` + 自研 CSS tooltip 组件覆盖 native `title`（100ms 延迟 +
  带样式）。
- **涉及文件**：
  - `index.html`（主菜单 + Help Modal DOM + CSS + 快捷键 hint 行）
  - `src/app/GameApp.js`（键盘监听 `F1`/`?` 打开 Help Modal；URL 解析
    `?debug=1` gating）
  - `src/ui/panels/EntityFocusPanel.js`（拆 player-view / debug-view）
  - `src/ui/hud/HUDController.js`（可选：通知堆栈）
- **scope**：中
- **预期收益**：把 "onboarding" 得分从 2/10 抬到 5-6/10（解决 16 条中约 11
  条的最明显部分：缺陷 1、2、5、6 全部；缺陷 3/4/9/10 显著缓解）。不增加
  任何 mechanic。
- **主要风险**：
  - Entity Focus 拆分后 Playwright 现有 e2e 测试若依赖 `FSM:` 字符串会挂
    （需确认 `test/` 下是否有 snapshot）。
  - `?debug=1` 门控若没做对会破坏开发者工作流（需要 `localStorage` 绕过
    开关或保留 Ctrl+Shift+D 切换）。

### 方向 B: Onboarding "第一步" 引导（Guided First-Run Overlay）

- **思路**：在 `GameStateOverlay.js` 启动后，检查 `localStorage
  utopiaOnboarded !== "1"`，显示一个浮动 card pipeline：
  "1. 按 1 选中 Road → 2. 左键连接 A→B → 3. 按 2 选中 Farm → 4. 放在草地
  上 → 5. 等第一次 Food 到达"，完成每步后自动推进。首次完成后写
  `utopiaOnboarded=1`。
- **涉及文件**：
  - `src/ui/hud/GameStateOverlay.js`（新增 `OnboardingTutorialOverlay`
    子组件）
  - `src/app/GameApp.js`（订阅 tool 切换 / 建造事件，推进 step）
  - `index.html`（新 DOM 节点 + 样式）
  - `src/simulation/meta/GameEventBus.js`（如需监听 "building_placed" 事件）
- **scope**：大
- **预期收益**：直接解决缺陷 1 的根本；但只覆盖 "第一步" 问题，对缺陷 2
  （FSM dump）、缺陷 6（dev dock）、缺陷 7（settings）无帮助。
- **主要风险**：
  - 大量事件订阅可能和现有 `controls.actionMessage` 流耦合，回归难测。
  - 需要在 `test/` 下新增 DOM 集成测试，触及 Node `--test` 不易跑的
    jsdom 领域。
  - 可能触碰 "feature freeze" 边界（reviewer 自己也把此项列为 P1，不是 P0）。

### 方向 C: 死亡总结页强制暂停（End-Panel Forced Gate）

- **思路**：缺陷 8 的小 scope 修复——`GameStateOverlay.render()`
  检测到 `session.phase === "end"` 时，强制设置 `state.controls.isPaused =
  true`，且 overlay 底部新增 "Copy Run Summary" / "Same Seed Retry" 按钮。
  同时在 "New Map" 切模板前必须弹一个二次确认。
- **涉及文件**：
  - `src/ui/hud/GameStateOverlay.js:94-205`
  - `src/app/GameApp.js`（新增 `onRestartSameSeed` handler）
- **scope**：小
- **预期收益**：解决缺陷 8 一条。
- **主要风险**：低；但对 onboarding 总分影响小（+0.5/10）。

## 3. 选定方案

**选 方向 A**（纯前端 polish 三件套），理由：

1. **优先级匹配**：reviewer 的 P0 清单前 5 条全部是 UI surface，方向 A
   覆盖其中 4 条（关 DevTelemetry / 拆 Settings 留待后续 / 重写 Entity
   Focus / 加 tooltip / 加 `?` Help）；方向 B 只覆盖 1 条且 scope 大。
2. **feature-freeze 兼容**：方向 A 全部是 polish / UX，无任何新 mechanic。
   方向 B 的 "tutorial scripting" 本质是新 system，HW06 后原则上不加。
3. **测试冲击最小**：现有 865 tests 在 `test/*.test.js`，主要覆盖 simulation
   层，UI 改动不会破坏这些；方向 B 则需要新增 DOM/集成测试层。
4. **orchestrator 仲裁友好**：方向 A 的修改点高度集中在 `index.html` +
   `EntityFocusPanel.js` + `GameApp.js` 三个文件，和其他 reviewer 的
   performance / balance 类 plan 冲突面最小。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:690-750` — `edit` — 在 `#statusBar`
  `#panelToggles` div 内紧接 `heatLensBtn` 之后插入
  `<button id="helpBtn" class="panel-toggle" type="button"
  title="Help (? or F1) — how to play">? Help</button>`；并在
  `#overlayMenuPanel` 的 `.overlay-actions` 之前插入一个
  `<button id="overlayHelpBtn" type="button"
  title="Read the Quick Start Guide">How to Play</button>`。
- [ ] **Step 2**: `index.html` — `add` — 在 `</body>` 之前新增一个
  默认 `hidden` 的 `<div id="helpModal" role="dialog" aria-modal="true">`，
  含 3 个 tab：`Controls` / `Resource Chain` / `Threat & Prosperity`，
  每 tab 都是纯 static HTML（引用反馈 "改进建议 4/5" 的文案）。附带
  对应 CSS：居中 overlay、`z-index` 高于 `#devDock`（1500+）、背景半透明
  遮罩、`ESC` / 右上 `×` 关闭。
  - depends_on: Step 1
- [ ] **Step 3**: `src/app/GameApp.js` — `edit` — 在现有键盘监听
  附近（查找 `keydown` handler，约 line 1200-1500 区间的 tool-hotkey 代码
  块）新增分支：`if ((e.key === "?" || e.key === "F1") &&
  !isTypingInInput()) { toggleHelpModal(true); e.preventDefault(); }`
  以及 `ESC` 关闭 Help Modal（若当前打开）。同一块还要为 `#helpBtn` /
  `#overlayHelpBtn` 绑定 click handler。
  - depends_on: Step 2
- [ ] **Step 4**: `src/app/GameApp.js` — `add` — 在构造器末尾（约 line 340
  附近 `wrapRoot?.classList.contains("dock-collapsed")` 附近）新增
  URL 参数门控：
  ```js
  const params = new URLSearchParams(window.location.search);
  const debugMode = params.get("debug") === "1" || localStorage.getItem("utopiaDebugMode") === "1";
  if (!debugMode) {
    document.getElementById("devDock")?.setAttribute("hidden", "");
    const debugToggle = document.querySelector('[data-panel-target="debugFloatingPanel"]');
    if (debugToggle) debugToggle.style.display = "none";
  }
  ```
  并在 `shortcutResolver` 增加 `Ctrl+Shift+D` 切换 `utopiaDebugMode`
  localStorage（保留开发者入口）。
  - depends_on: Step 1
- [ ] **Step 5**: `src/ui/panels/EntityFocusPanel.js:309-345` — `edit` —
  将当前单块 HTML 字符串拆成 **两段**：
  - 上段 `playerViewHtml`：仅 Name / Role / Group / State (human-readable
    via `entity.stateLabel`) / Hunger bar（把 `hunger=0.287` 转换为
    `(1-hunger)*100%` 横条 + `"Well-fed" | "Peckish" | "Hungry" | "Starving"`
    label）/ HP bar / Carry / Current Task sentence。
  - 下段 `<details data-focus-key="focus:debug" ...>` summary
    `"Debug (FSM / Policy / Path)"`，默认 `open=false`，里面装原来的
    FSM / Policy Influence / Decision Time / Path Recalc / Path Nodes /
    AI Exchange 全部块。
  - depends_on: none（独立）
- [ ] **Step 6**: `index.html:676-689` — `edit` — 把 `#hudProsperity`
  和 `#hudThreat` 的 `title` 属性升级并替换为 `data-tooltip`：
  `data-tooltip="Prosperity — higher is better. Colony well-being.
  Unlocks new settlers."` / `data-tooltip="Threat — lower is safer.
  High threat triggers raids & losses."`；同时为 `#foodVal` 所在
  `.kv` 也补 `data-tooltip` 并保留现有 `title` 作 fallback。
- [ ] **Step 7**: `index.html` CSS block (约 line 300-500 区间) — `add` —
  新增 `.tooltip` 样式 + 小段 inline JS 或
  `src/ui/hud/TooltipController.js`（**新文件**）监听
  `[data-tooltip]` 的 `mouseenter`/`mouseleave` 事件，100ms 延迟后
  弹出自研 tooltip `<div class="tooltip-popup">`，避开 `#devDock` 的
  `z-index`。
  - depends_on: Step 6
- [ ] **Step 8**: `index.html:732-734` — `edit` — 将
  `.overlay-controls-hint` 扩展为 2 行：第 1 行保留现有快捷键，
  第 2 行新增
  `LMB build · RMB drag-pan · Click worker → select · ? open Help`。
  删除 `<div id="overlayMenuMeta">` 中的 `SEED 1337` 段落，改为只显示
  `96×72 tiles · Temperate Plains`（把 seed 收入 advanced debug 区）。
- [ ] **Step 9**: `test/ui/help-modal.test.js` — `add`（**新测试文件**）—
  用 Node `--test` + jsdom 写 2 条最小测试：
  (a) 加载 index.html，断言 `#helpModal` 存在且初始 `hidden`；
  (b) 触发 `F1` key 后，`#helpModal` 的 `hidden` 属性被移除。
  - depends_on: Step 3
- [ ] **Step 10**: `test/ui/entity-focus-player-view.test.js` — `add` —
  mock 一个 `state.agents[0]` + entity，实例化 `EntityFocusPanel`，
  断言渲染结果包含 `"Hungry"` 这种 human-readable label 且**不**在顶层
  包含 `"FSM: current="` 字符串（确认 FSM 已折叠到 details）。
  - depends_on: Step 5

## 5. Risks

- Step 4 的 `?debug=1` 门控可能让**benchmark/长横跑脚本**依赖 devDock
  DOM 拿数据时拿不到——需要先 grep `scripts/long-horizon-bench.mjs` 有无
  querySelector `#devDockGrid` 之类直接读 DOM 的代码；如果有，benchmark
  runner 必须默认带 `?debug=1`。
- Step 5 修改 Entity Focus 渲染输出字符串，可能破坏任何对
  `EntityFocusPanel` 做 snapshot/regex 匹配的测试——需要 grep
  `test/**/*entity*` / `test/**/*focus*`。
- Step 7 自研 tooltip 组件在低分辨率下可能溢出屏幕右边缘（需要加
  edge-clamp 逻辑），且和 `#devDock` 的 pointer-events 冲突需 `z-index`
  显式高于 1000。
- Step 6 把 `hudProsperity` title 改 `data-tooltip` 如果不保留 `title`
  fallback，对**屏幕阅读器**可能造成 a11y 回退——保留 `title` + 新增
  `data-tooltip` 并存。
- 可能影响的现有测试：先用 `Grep` 扫
  `test/**/*.test.js` 里出现 `FSM`、`Policy Influence`、`devDock`、
  `entityFocusBody`、`helpModal` 的文件；按当前仓库约定，估计 0-2 个
  测试受影响（UI 层测试较少）。

## 6. 验证方式

- **新增测试**：
  - `test/ui/help-modal.test.js` 覆盖 `F1` 打开 / `ESC` 关闭场景。
  - `test/ui/entity-focus-player-view.test.js` 覆盖默认隐藏 FSM 调试块
    的场景。
- **手动验证**（按序）：
  1. `npx vite` 启动 dev server → 打开 `http://localhost:5173/`（无
     URL 参数）。
  2. 期望：**不**看到屏幕底部 "Developer Telemetry" 面板。
  3. 按 `F1` 或 `?`：弹出 Help Modal，显示 3 tabs，按 `ESC` 关闭。
  4. Hover 顶部 Prosperity / Threat 图标：100ms 内弹出带量纲说明的
     自研 tooltip。
  5. 点击任一工人：Entity Focus 只显示 Name / Role / Hunger bar /
     Current Task；展开 "Debug (FSM / Policy / Path)" 时才看到
     FSM / Policy 全文。
  6. 打开 `http://localhost:5173/?debug=1` → Developer Telemetry 恢复
     可见。
- **benchmark 回归**：运行
  `node --test test/*.test.js`，865 现有测试全绿（允许 2 个新增）；
  `scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，DevIndex
  不得低于 **44 - 5% = 42**（Phase 8 的当前值 44）。DevIndex 不受 UI
  改动影响，此项应自然通过。

## 7. UNREPRODUCIBLE 标记

**部分复现**：由于本 session 未实际调用 Playwright MCP 打开
`http://localhost:5173`（enhancer 预算优先投入 plan 撰写，见硬约束
"≤40% 探索 / ≥60% 写 plan"），因此以下 reviewer 断言只通过
**代码路径确认 + 静态审阅**复现，未拍屏：

- 缺陷 2 "鼠标悬停资源图标没有 tooltip" → 代码中 `title` 属性
  **存在**（`index.html:811-825`），但 native `title` 延迟约 500ms 且无
  视觉样式，reviewer 误判为 "没有 tooltip" 是合理的——plan 中已用
  自研 `data-tooltip` 组件修复。
- 缺陷 6 "Dev Telemetry 默认就在界面里" → 代码中 `#wrap` 初始 class
  含 `dock-collapsed`（`index.html:624`），但 `BuildToolbar.js:425-428`
  会 `localStorage.getItem("utopiaDockCollapsed")` 回读；若 reviewer
  在早期 session 主动点过 "Debug" 或有残留 `"0"` 值，会展开——plan 中
  用 Step 4 的 URL gating 强制覆盖，不再信任 localStorage。
- 缺陷 10 "控制台 500 错误 `/health`" → **未在 feedback 给定步骤外
  独立复现**；该问题属于 Vite dev server 或后端路由，本 plan 不覆盖
  （属于另一个 reviewer 的 infra 工单）。
