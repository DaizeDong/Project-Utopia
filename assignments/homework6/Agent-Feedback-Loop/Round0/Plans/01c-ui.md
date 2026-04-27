---
reviewer_id: 01c-ui
feedback_source: Round0/Feedbacks/03-ui.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P0
estimated_scope:
  files_touched: 3
  loc_delta: ~260
  new_tests: 2
  wall_clock: 75
conflicts_with: []
---

## 1. 核心问题

Reviewer (3.5/10, "工程师调试台" 气质) 给出 10 条改进点。归并为 **3 条根本问题**：

1. **研发面板裸露给普通玩家** (P0) — 顶栏 `Settings` / `Debug` / `Dev Telemetry`
   按钮对新玩家默认可见，里面是 20+ 根地形 slider、AI fallback trace、
   `Grid Version: 74` 这种工程文本。病因：`index.html` 里 `#panelToggles`
   静态写死了 4 个按钮 + 1 个 `heatLensBtn`，没有 "developer mode" gate；
   `#toggleDevDockBtn` 也无条件出现。
2. **交互承诺不兑现** (P0) — Heat Lens 按钮点击后无图例、无颜色对照说明；
   资源条小且数字无警示配色；顶栏警报和"Simulation started"共用同一条
   `statusAction` 胶囊。病因：`HUDController.render()` 仅切换文本和透明度，
   没有 priority channel；`heatLensBtn` 的视觉反馈只是一个 `.active` 描边，
   map 上 pressure/heat 两种 lens 视觉差异也弱。
3. **响应式在 ≤1024×768 下崩溃** (P1) — 800×600 时顶栏右侧 Settings/Debug/Heat
   Lens 按钮**直接被切出视口**（reviewer 原话，截图 15）。病因：`#statusBar`
   使用 `flex-wrap: nowrap; overflow-x: auto` 且面板切换按钮跟在 `hud-spacer`
   后面，窄屏下它们被水平滚动但移动端玩家不会横向滚 24px 高的顶栏。

P2 的"开场美术替换 hero 插画"和"3D 投影阴影"属于**超出 HW06 freeze 边界的
新 mechanic**（feature-freeze policy, CLAUDE.md），本轮跳过。

---

## 2. Suggestions（可行方向）

### 方向 A: Developer Mode Gate + 响应式顶栏折叠（仅剥离，不重绘）

- 思路：给 `Settings/Debug/Dev Telemetry` 和其驱动面板加 `?dev=1` /
  `Ctrl+Shift+D` gate；默认状态下这些按钮隐藏 (`display:none`)。同时把顶栏
  在 ≤1024px 下改为面板切换按钮先行、资源条次之的垂直两行布局，防止 800×600
  切按钮。不改任何 JS 的事件逻辑，只改 HTML class 和 CSS + 极少的 GameApp
  初始化读 URL query。
- 涉及文件：`index.html`（新增 `.dev-only` class 和 media-query）、
  `src/app/GameApp.js`（`constructor` 里加 `readDevFlag()` 函数，
  toggle body class）、新测试 `test/dev-mode-gate.test.js`。
- scope：小
- 预期收益：直接解决 reviewer P0#1 和 P0#3 两条；LOC ~180；零新 mechanic。
- 主要风险：URL query 读取逻辑在已有的 `shortcutResolver.js` 中已有 key
  handler，要避免重复注册；但 `Ctrl+Shift+D` 当前未占用（确认见
  `src/app/shortcutResolver.js`）。

### 方向 B: 全面重构 HUD（资源条 28px icon + 数字 + 趋势箭头 + 告警通道分离）

- 思路：按 reviewer 的 10 条建议全部落地 — 放大图标、加涨跌趋势、把警报独
  立成右上 toast channel、Settings 只留 5 项、Heat Lens 加图例 overlay、
  字体 scale 统一、sprite 重绘。
- 涉及文件：`index.html`（CSS + statusBar DOM 全重构）、`HUDController.js`
  （添加 trend tracking、alert channel、tooltip registry）、
  `PressureLens.js`/`SceneRenderer.js`（加 legend overlay）、
  `BuildToolbar.js`（tooltip 合并）、`main.js`（新 alert toast）、
  `render/ProceduralTileTextures.js`（sprite 色分区）——估 8+ 文件。
- scope：大
- 预期收益：直接把 UI 从 3.5 抬到 5.5+；但对单次 Round 来说过度激进。
- 主要风险：(1) 改 statusBar DOM 会破坏现有 `hud-controller.test.js` 里
  getElementById 查找；(2) 会接近"重绘"边界，有偏离 freeze policy 的风险；
  (3) sprite 重绘属于美术工作，Coder 单轮无法完成。

### 方向 C: 仅加 Heat Lens 图例 overlay + 资源条 tooltip 补全

- 思路：只专注 reviewer 最怒的两条 — Heat Lens 按钮点了"没变化"（截图 8-10）
  和资源条"无 tooltip"（第 2.1 节）。加一个随 lens mode 切换显示的 legend
  DOM（右下角），给每个 `.hud-resource` 加 `data-tip`（已有 tooltip 系统
  migrateTitles 会自动转换）。
- 涉及文件：`index.html`（加 `#lensLegend` + 资源条 title 属性）、
  `src/app/GameApp.js` (`toggleHeatLens` 方法同步 legend 显示)。
- scope：小
- 预期收益：解决 10 条改进里的 P1#4 和 P0#2（tooltip 部分）。不解决 P0#1
  和 P0#3（developer mode + 响应式）。
- 主要风险：仅覆盖表层，reviewer 核心不满（"研发面板裸露"）没解决。

---

## 3. 选定方案

选 **方向 A**。理由：

- **P0 优先**：方向 A 同时覆盖 P0#1（研发面板剥离）和 P0#3（响应式崩溃）
  这两个 reviewer 最高权重的诉求，且完全不触碰 feature-freeze 边界
  (只改 visibility class + CSS breakpoint + 一个 URL query reader)。
- **不破坏测试**：方向 A 保留所有现有 DOM id（仅加 class 切换），对
  `hud-controller.test.js` 零影响。方向 B 会改 DOM 结构，测试必挂。
- **单轮可落地**：~180 LOC，2 个新测试，Coder 单轮能交付。方向 B 是跨多轮
  工作量。
- **方向 C 太窄**：跳过了"研发面板裸露"这个 reviewer 3.5 分的核心扣分项。
- **Heat Lens tooltip 缺失**：方向 A 的 Step 7 会顺带把 lens 按钮 tooltip
  扩写到"按 L 循环 pressure/heat/off"，也覆盖了方向 C 的一部分。但完整的
  legend overlay 留给后续 Round 的 B 方向或专门的 "polish" PR。

---

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:624` — `edit` — 在 `<div id="wrap"
  class="dock-collapsed">` 上追加 class：`<div id="wrap"
  class="dock-collapsed player-mode">`。默认进入 "player mode"，dev-only
  元素通过 CSS 选择器 `body:not(.dev-mode) .dev-only { display:none; }`
  隐藏。

- [ ] **Step 2**: `index.html:560` — `add` — 紧接 `.legacy-hidden` CSS 规则
  后，追加 CSS 块：
  ```
  /* Dev mode gate (v0.8.1 Round0 01c-ui) */
  body:not(.dev-mode) .dev-only { display: none !important; }
  /* Responsive status bar wrap */
  @media (max-width: 1024px) {
    #statusBar { flex-wrap: wrap; height: auto; padding: 4px 6px; }
    #panelToggles { margin-left: auto; order: -1; width: 100%;
      justify-content: flex-end; padding-bottom: 4px;
      border-bottom: 1px solid var(--divider); margin-bottom: 4px; }
  }
  @media (max-width: 640px) {
    .hud-objective { display: none; }
    #statusBar .hud-resource { flex: 0 0 auto; }
  }
  ```
  depends_on: Step 1

- [ ] **Step 3**: `index.html:696-697` — `edit` — 给 Settings/Debug 两个
  `.panel-toggle` 按钮追加 class `dev-only`。 示例：
  `<button class="panel-toggle dev-only" data-panel-target="settingsFloatingPanel" ...>`
  `<button class="panel-toggle dev-only" data-panel-target="debugFloatingPanel" ...>`
  注意：**Heat Lens 按钮不加 dev-only**（它是玩家功能，不是调试工具）。
  depends_on: Step 1

- [ ] **Step 4**: `index.html:1143` — `edit` — 给 `#toggleDevDockBtn` 外层
  `<div style="margin-top:6px;">` 加 `dev-only` class。同时给 `#devDock`
  section（第 1149 行）外层 wrapper 或 section 本身加 `dev-only` class，
  避免 Debug 面板隐藏但底部 dock 仍可通过 L/快捷键被触发残留。
  depends_on: Step 1

- [ ] **Step 5**: `index.html:856-897` — `edit` — 在 Settings 面板
  `#settingsFloatingPanel` 里把所有**地形/性能调参 slider**（Advanced
  Runtime subpanel 第 876-896、Terrain Tuning 整个 card 第 900-929、
  Population Control 整个 card 第 931-1012）包在一个共享 wrapper 上加
  `dev-only` class。保留 "Map Template / Seed / Doctrine / Farmer Ratio"
  这 4 项作为玩家能看的设置。
  说明：wrapper 做法避免改动每个 details 的 class。
  depends_on: Step 1

- [ ] **Step 6**: `src/app/GameApp.js:constructor` (约第 90-170 行) —
  `add` — 在 `this.heatLensBtn = document.getElementById(...)` 之前或
  `constructor` 开头加一小段：
  ```
  // v0.8.1 Round0 01c-ui: Dev mode gate.
  // Enable via ?dev=1 URL query or Ctrl+Shift+D chord.
  this.#initDevModeGate();
  ```
  并新增私有方法 `#initDevModeGate()`（可追加在类尾，约第 1500 行附近）：
  - 读 `new URL(location.href).searchParams.get("dev")`，若 `=="1"` 则
    `document.body.classList.add("dev-mode")`。
  - 也读 `localStorage.getItem("utopia:devMode") === "1"` 做持久化。
  - 注册 `keydown` 监听器：`Ctrl+Shift+D` 切换 `dev-mode` class 并
    `localStorage.setItem("utopia:devMode", ...)`。
  - 切换时通过 `this.state.controls.actionMessage` 推"Developer mode
    ON/OFF"提示（使用现有 actionMessage channel）。
  depends_on: Step 1

- [ ] **Step 7**: `index.html:699` — `edit` — 把 Heat Lens 按钮的
  `title`（会被 migrateTitles 自动转成 tooltip）改得更明确：
  `"Supply-Chain Heat Lens (L) — click/press L to cycle: pressure (default, supply-chain pressure markers) → heat (red = producer overflow, blue = processor starved) → off"`.
  同时给 `statusAction` 的 `title`（第 692 行）保持，但为 `#warningVal`
  （index.html 第 1055 行，在 Debug 面板里）加 `title="Latest critical
  warning. Red = error, amber = info"`。
  depends_on: none（但推荐在 Step 1-6 之后统一提交）

- [ ] **Step 8**: `test/dev-mode-gate.test.js` — `add` — 新测试文件，验证：
  - URL 带 `?dev=1` 时 `GameApp` 构造后 `document.body.classList.contains('dev-mode')` 为 true。
  - 默认无 query 时，`dev-mode` 未添加。
  - `localStorage.setItem("utopia:devMode","1")` 模拟后再构造 GameApp，
    `dev-mode` 被加上。
  使用 Node test runner + JSDOM stub（见 `hud-controller.test.js` 里已有
  的 DOM setup pattern）。
  depends_on: Step 6

- [ ] **Step 9**: `test/responsive-status-bar.test.js` — `add` —
  验证在 `window.innerWidth = 800` 时：
  - 解析 CSS：可以走 `getComputedStyle(document.getElementById("panelToggles"))` 在 JSDOM 里断言 `order` / `width`（JSDOM 对 `@media` 支持有限，本测试改为 **静态断言 index.html 里存在 `@media (max-width: 1024px)` 块**的字符串匹配 + 对 `.dev-only` 类存在的 DOM 结构断言，避免 JSDOM media-query 坑）。
  - 断言 `querySelectorAll('.dev-only').length >= 3`（Settings toggle、
    Debug toggle、Dev Dock toggle）。
  depends_on: Step 2, Step 3, Step 4

- [ ] **Step 10**: `CHANGELOG.md` — `edit` — 在当前 unreleased v0.8.2 或
  新建 v0.8.2 段落下追加 `### UX / Polish` 子节：
  ```
  - Developer Mode gate: Settings terrain sliders, Debug panel, and Dev
    Telemetry dock now hidden for first-time players. Enable with ?dev=1
    URL query or Ctrl+Shift+D. (01c-ui feedback, Round0)
  - Responsive status bar: panel-toggle buttons now wrap to their own row
    on viewports ≤1024px, fixing the 800×600 button-clipping regression.
  - Heat Lens button tooltip expanded to explain pressure/heat/off cycle.
  ```
  depends_on: Step 1-7

---

## 5. Risks

- **Risk 1 — 老用户习惯**：现有 dev（包括 benchmark CI 脚本）可能依赖
  `Settings` 按钮默认可见。缓解：`?dev=1` 是显式 opt-in，benchmark runners
  本就在 headless / 无 UI 下跑；但要在 PROCESS.md 里记录（本 plan 不涉及
  PROCESS 文档，放 Coder note）。
- **Risk 2 — localStorage 在隐私模式下抛异常**：GameApp 构造期间若在
  Safari 隐私模式 `localStorage.setItem` 抛 QuotaExceeded，会阻断
  constructor。缓解：`#initDevModeGate` 内部 try/catch 包裹 localStorage
  调用。
- **Risk 3 — Ctrl+Shift+D 冲突**：该组合是 Chrome devtools 默认快捷键
  （在某些平台打开书签栏）。浏览器会优先消费，我们只是备用。缓解：主路径
  是 URL query `?dev=1`；快捷键是次选。在 tooltip 里不强调。
- **Risk 4 — CSS `@media (max-width:1024px)` 影响现有 `@media (max-width:
  900px)`**（index.html:605 已存在）：两个媒体查询会叠加。缓解：新加的
  1024px 规则只改 `#statusBar` 的 flex-wrap 和 `#panelToggles` 的
  order/width，不影响 900px 规则里的 `.floating-panel-left` width。
- **可能影响的现有测试**：
  - `test/hud-controller.test.js` — 不受影响（保留所有 DOM id，只加 class）。
  - `test/benchmark/*.test.js` — 不使用浏览器 UI，完全独立。
  - 若 `test/app/game-app-*.test.js`（若存在）检测 `document.body.className`
    需新加断言：存在性而非等值。

## 6. 验证方式

- **新增测试**：
  - `test/dev-mode-gate.test.js` — 覆盖 URL query / localStorage / keydown
    三条 dev-mode 开启路径，以及默认关闭态。
  - `test/responsive-status-bar.test.js` — 覆盖 `.dev-only` class 数量和
    CSS 字符串存在（JSDOM 限制下的静态验证）。
- **手动验证**：
  1. 打开 dev server `http://localhost:5173`（已 running），不加 query —
     预期：顶栏仅 `Build / Colony / Heat Lens (L)` 3 按钮；Debug / Settings
     / Show Dev Telemetry 按钮不可见；Settings 打开后只显示 "Farmer Ratio +
     Map Template + Seed + Doctrine + AI"。
  2. 访问 `http://localhost:5173/?dev=1` — 预期：所有原按钮重新出现。
  3. 无 query 下按 `Ctrl+Shift+D` — 预期：dev 按钮出现，再按一次消失；
     statusAction 胶囊显示 "Developer mode ON" / "OFF"；刷新页面保留状态。
  4. 窗口尺寸调 800×600 — 预期：panel-toggle 按钮换行到第二行，完全可见；
     资源条仍水平可滚；无按钮被切出视口。
  5. 点击 Heat Lens 按钮 3 次 — 预期：tooltip 在 hover 显示完整 cycle
    说明（pressure → heat → off）。
- **Benchmark 回归**：
  - `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains`
    — DevIndex 不得低于当前 v0.8.1 reported 值 44 减 5%，即 ≥41.8。本 plan
    只改 UI DOM/CSS，对 sim 层零触碰，DevIndex 应完全不变（可做为 sanity
    check，而非真正回归风险源）。

## 7. UNREPRODUCIBLE 标记

无。feedback 附带 19 张截图 + reviewer 亲手跑的 1920/1024/800/600 四档
分辨率观察；涉及 DOM 层可达性与 CSS flex 行为，无需 Playwright 额外
复现。选定方案所有诊断均基于 `index.html` / `src/app/GameApp.js` 源码
验证：
- `#panelToggles`（第 693-700 行）里 Settings/Debug 按钮默认可见 —— 已确认。
- `#statusBar` (第 54-67 行) `flex-wrap: nowrap` —— 已确认为 800×600 按钮
  被截的根因。
- `#toggleDevDockBtn`（第 1143 行）在 Debug 面板底部无 gate —— 已确认。
- `heatLensBtn` `title` 目前仅 "Supply-Chain Heat Lens (L) — red =
  producer piling up..."（第 699 行）—— 已确认不提 pressure/off 两档。
