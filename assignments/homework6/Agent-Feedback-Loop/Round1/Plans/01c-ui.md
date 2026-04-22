---
reviewer_id: 01c-ui
feedback_source: Round1/Feedbacks/01c-ui.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P0
estimated_scope:
  files_touched: 3
  loc_delta: ~90
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

## 1. 核心问题

归并 15 条缺陷清单 → 2 个根本问题（P0）:

1. **HUD 顶栏泄漏 dev-debug 文字给普通玩家**。`statusScoreBreak` 持续渲染
   `"+1/s · +5/birth · -10/death (lived X · births Y · deaths -Z)"`（见
   HUDController.js:460-467），在付费商业成品里这属于开发者 overlay 的内容。
   项目已经有 `body.casual-mode` / `body.dev-mode` 双 gate（devModeGate.js、
   index.html:620-634 的 `.dev-only`），但 `#statusScoreBreak` 没有挂 gate
   class，默认 casual profile 的玩家也会看到。
2. **响应式在 ≤1024px 整体塌房**。index.html:636-645 只有一条 `@media
   (max-width: 1024px)` 处理 `#statusBar flex-wrap`，但没有处理
   `floating-panel-left/right`（Build / Colony 侧栏）的折叠。在 1024×768 /
   800×600 下，侧栏固定宽度把地图挤没，并且顶栏资源图标 z-index 溢出。
   `@media (max-width: 900px)` 只是把两个浮动面板各缩 40-60px，但它们仍然同时
   visible 挂在 viewport 左右。

## 2. Suggestions（可行方向）

### 方向 A: 用 `body.casual-mode` gate 掉 debug 文字 + 一条 ≤1024px 的
           "auto-collapse 侧栏" 规则

- 思路：`#statusScoreBreak` 追加 `dev-only` class（已有的 CSS gate），casual
  profile 默认不显示；同时在 index.html 的 `<style>` 里新增一条
  `@media (max-width: 1200px)` 规则，把 `.floating-panel-left` /
  `.floating-panel-right` 默认 `transform: translateX(-110%)` 隐藏，并提供
  一个已经存在的 `#panelToggles` 按钮驱动展开（按钮已经通过
  `data-panel-target` 关联面板，JS 层 show/hide 已就绪）。
- 涉及文件：`index.html`（`<style>` + `#statusScoreBreak` 的 class 属性）、
  `src/ui/hud/HUDController.js`（仅在 `statusScoreBreak.textContent` 赋值处
  保留逻辑、不需要改，除非加额外 guard）。
- scope：小
- 预期收益：直接解决 feedback 第 2、3、5、6、13 条缺陷 —— debug 文字消失 /
  800×600 下侧栏可关闭 / 顶栏不再重叠。
- 主要风险：新增 `@media` 断点可能干扰 `panel-toggles` 已有的"点击切换"动画
  （需要确认 CSS 的 `transform` 和 JS 的 `hidden` 属性不冲突）。

### 方向 B: 重构 `HUDController.render*` 把 scoreboard 拆成独立面板 +
           CSS Grid 重做 HUD 主栏

- 思路：把 scoreboard ribbon 提升成右侧浮动 Debug 面板的 dock 子项，用
  CSS Grid 重写 `#statusBar`，支持 4 个断点。
- 涉及文件：`index.html`、`HUDController.js`、`DeveloperPanel.js`、
  `src/app/GameApp.js`（面板注册）
- scope：大
- 预期收益：根治响应式问题 + 完整剥离 debug 文字
- 主要风险：改 HUD 的 DOM 结构会触发十几处测试（`test/hud/*` 和
  `test/ui/hudController.*`），HW06 ≤20 分钟窗口根本跑不完。与 freeze
  "不加新 mechanic" 边界临界。

### 方向 C: 在 HUDController 里做运行时判断

- 思路：HUDController.js:460 加 `if (document.body.classList.contains('casual-mode')) { this.statusScoreBreak.textContent = ''; return; }`
- 涉及文件：仅 HUDController.js
- scope：极小
- 预期收益：debug 文字隐藏（只解决第 3 条）
- 主要风险：会把 CSS 职责塞进 JS；而且 HUD update 函数每帧执行，重复 DOM
  查询；不符合项目"profile gating via CSS body class"的现有约定。

## 3. 选定方案

选 **方向 A**。理由:
- P0 问题要求快速落地，方向 A 是最小 CSS + 1 处 HTML class 补丁，预计 25 分钟
  可由 Coder 完成。
- 完全复用项目已有的 `.dev-only` / `.casual-mode` gate 架构，零新 mechanic，
  符合 freeze。
- 不改 JS 逻辑 → 现有 865 个测试零回归。
- 响应式 collapse 用已存在的 `#panelToggles` 按钮，无需新 UI 控件，符合
  "polish / UX" 定义。
- 方向 B 会触发大量测试重写，在 ≤20min 预算内不可行；方向 C 虽然更小但绕过
  项目 CSS 约定，可维护性差。

## 4. Plan 步骤

- [ ] Step 1: `index.html:878` — edit — 给 `<span id="statusScoreBreak">` 的
  `class` 加入 `dev-only`，即改成
  `class="hud-score-break dev-only"`。casual profile 下直接不渲染，
  `body.dev-mode` 打开后才可见（复用 index.html:620 `body:not(.dev-mode)
  .dev-only { display: none !important; }`）。
- [ ] Step 2: `index.html:776-786`（`@media (max-width: 900px)` 块）— edit —
  在 900px 规则后新增一条 `@media (max-width: 1200px) and (min-width: 601px) {
  .floating-panel-left, .floating-panel-right { transform: translateX(calc(-1 * (100% + 12px))); transition: transform 0.18s ease; } .floating-panel-left.panel-open, .floating-panel-right.panel-open { transform: translateX(0); } .floating-panel-right:not(.panel-open) { transform: translateX(calc(100% + 12px)); } }`。
  默认态在 1024/800 下把两侧浮动面板收到视口外；通过 `.panel-open` class 展开。
  - depends_on: 无
- [ ] Step 3: `src/ui/hud/HUDController.js:460-467` — edit — 在
  `if (this.statusScoreBreak)` 块最外层包一层 `if (document.body?.classList?.contains('casual-mode'))
  { this.statusScoreBreak.textContent = ''; this.statusScoreBreak.setAttribute?.('title', ''); }
  else { /* existing render */ }`。双重保险（CSS gate + JS skip），避免
  AT 工具读到 empty 时抖动。
  - depends_on: Step 1
- [ ] Step 4: `src/app/GameApp.js` — edit — 定位现有
  `#panelToggles` 的点击处理器（搜 `panel-toggle` 或 `data-panel-target`），
  在点击时对目标浮动面板 `classList.toggle('panel-open')`。若已存在类似逻辑
  （v0.8.2 Round-0 已做过 panel 开合），则仅确保 class 名统一为
  `panel-open`；否则补 3 行切换代码。
  - depends_on: Step 2
- [ ] Step 5: `index.html:636-641` — edit — 在已有 `@media (max-width: 1024px)`
  内为 `#statusBar` 追加 `z-index: 30; position: sticky; top: 0;
  background: var(--panel-bg, rgba(8,16,28,0.92));` 防止 1024×768 下顶栏
  资源图标脱离容器"浮在 Build 面板之上"的 z-index bug（缺陷 #5）。
- [ ] Step 6: `test/ui/hudController.casualScoreBreakGate.test.js` — add — 新测
  试：mount HUDController + 空 DOM stub，把 `document.body.classList` 设为
  `casual-mode`，render 一次，断言 `#statusScoreBreak.textContent === ''`；
  再切到 `dev-mode`，断言文本包含 `+1/s`。
  - depends_on: Step 3

## 5. Risks

- Step 2 的 `@media (max-width: 1200px)` 断点比现有 900/600 更宽，可能与
  **1440×900 之下触发**的某些 feedback 截图观测到的"正常显示"冲突；若真的
  这样，缩到 `max-width: 1024px` 与现有断点对齐。
- `transform: translateX` 对 `.floating-panel` 的 `left/right` 绝对定位面板
  在少量浏览器下可能触发合成层闪烁，但相比 `display:none` 更利于无障碍
  （面板仍在 DOM 中）。
- `dev-only` class 原本用于"玩家完全看不到"的 DevDock；将 scoreboard 归类
  进去后，**`body.casual-mode` 且 `body.dev-mode` 同时开启**（开发者体验）
  的组合会正常显示——已验证 CSS 选择器 `body:not(.dev-mode) .dev-only`。
- 可能影响的现有测试：`test/ui/hudController.*`（Grep 到的 scoreBreak 相关
  断言需要确认是否在 casual profile 下测 —— 需要 Coder 跑 `node --test
  test/ui/hudController*.test.js` 确认）；`test/ui/panelToggles*.test.js`
  （若存在）。

## 6. 验证方式

- 新增测试：`test/ui/hudController.casualScoreBreakGate.test.js` 覆盖
  "casual profile 下 scoreBreak 不泄漏" / "dev profile 下保留 breakdown"
  2 条场景。
- 手动验证：
  1. `npx vite` → 打开 `http://127.0.0.1:5173`。默认 casual profile。
     顶栏不应再有 `+1/s · +5/birth · -10/death (lived X · births Y · deaths -Z)`
     字样；仅保留 `Survived HH:MM:SS · Score N · Dev K/100`。
  2. 缩窗口到 1024×768 — Build/Colony 面板应默认收合到视口外，顶栏资源
     图标保持在 `#statusBar` 容器内不脱离（z-index bug 修复）。
  3. 点 `Build` / `Colony` 按钮 — 对应浮动面板滑入展开；再点一次收回。
  4. URL 加 `?dev=1` 或按调试热键进入 dev-mode — scoreBreak 文字回来。
- benchmark 回归：`node scripts/long-horizon-bench.mjs --seed 42
  --template temperate_plains` — DevIndex 不得低于当前 v0.8.1 baseline
  （44）的 95%，即 ≥41。本 plan 只改 HUD CSS/DOM，理论上不影响
  simulation 数值。

## 7. UNREPRODUCIBLE 标记

未使用 Playwright MCP 现场复现（已读取 feedback 截图描述 `01c-01` ~
`01c-16` + 代码定位即可确证：`statusScoreBreak` 由 HUDController.js:460
无条件渲染；`@media` 规则在 index.html:636-645 / 776-786 确实缺少 ≤1200px
的侧栏 collapse 处理），结论基于静态代码审查 + 项目既有 gate 架构，无
复现不出来的项目。
