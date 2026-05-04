---
reviewer_id: A6-ui-design
reviewer_tier: A
feedback_source: assignments/homework7/Final-Polish-Loop/Round1/Feedbacks/A6-ui-design.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~140
  new_tests: 1
  wall_clock: 30
conflicts_with:
  - A4-alignment-typography   # CSS / spacing / responsive overlap
  - A7-z-index-toast-hud      # z-index / topbar layering overlap
  - A3-first-impression       # placement-feedback / build-tool button feedback overlap
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

A6 R1 score 5.0 → 5.5 (YELLOW)。R0 修复了 Demolish 红色冲突 + 1366 hotkey-grid 截断；R1 暴露 **3 个新 P0** 层（不可被 A4/A7/A3 单独消化），其余 P1/P2 已在邻近 reviewer 的 R1 plan 中分担。归并后的根因：

1. **1366×768 顶部 progress chip 被截掉关键目标 (P0 #1)** — `index.html:294-297` `.hud-goal-list` 用 `flex-wrap: wrap` + `max-width: min(480px, 34vw)`，但父级 `#statusBar` (line 95-96) 是 `flex-wrap: nowrap; overflow: hidden`，导致 `.hud-goal-list` 在窄屏不能换行只能被裁。1366 下后 3 项（farms/lumber/wells）直接看不见。**根因：goal-list 的 wrap 被父 nowrap 的 overflow:hidden 切掉**；现有 1100px clamp (line 150-156) 把 list 锁死在 240px ellipsis，反而恶化丢失。
2. **1024×768 顶部 HUD 与右侧 sidebar z-index 重叠 (P0 #2)** — 1024 媒体查询块 `index.html:1720-1753` 把 `#sidebar` 改成 `position: fixed; bottom:0` 底部条；但同块没有清掉 sidebar 的 `z-index: 20`（line 763），而 `#statusBar` 是 `z-index: 15`（line 81）。当 sidebar 高度被 `max-height: 40vh` 撑开后，sidebar 顶边可能盖到顶 HUD 区域；同时 sidebar 旧的 `right: clamp(...)` 规则在该断点未被无效化，造成 HUD 右端 chip 被 sidebar 边框遮。**根因：1024 break 时 sidebar 从右侧移到底部，但 z-index 与 HUD 的 right-edge 偏移没同步重置**。
3. **全局 hover + Build Tools disabled 视觉系统性缺失 (P0 #3 / D4)** — `button:hover:not(:disabled)` (line 999) 只给了通用 button 的 hover；但 `.hud-chip` / `.sidebar-tab-btn` / `.hud-goal-chip` / playback button / Entity Focus filter chip / autopilot checkbox 6 类控件都没有显式 hover 反馈，玩家感知"未完成"。Build Tools 14 按钮 (`button[data-tool]`) 资源不足时仍亮（无 `disabled` 属性）— `BuildToolbar.js:1132-1134` 只做 active class 切换，从未根据 `state.resources` vs `BUILD_COST[tool]` 给按钮加 `disabled`。**根因：hover 在多面板未声明 + Build Tools 没有 cost-vs-stockpile derive 写回 DOM**。

## 2. Suggestions（可行方向）

### 方向 A：纯 CSS 三处微调 + BuildToolbar 一段 disabled-derive
- 思路：(1) 把 `#statusBar` 的 `overflow: hidden` 在 `< 1440` 媒体改为允许 `.hud-goal-list` 换行至第二行（topbar 高度同步从 32px 升到 auto/min-height 双行）；(2) 1024 媒体块给 `#sidebar` 显式 `z-index: 14 !important;`（让位 statusBar=15）+ `right: 0 !important; left: 0` 全宽固定；(3) 在内联 style 末尾追加全局 hover state library（`.hud-chip:hover` / `.sidebar-tab-btn:hover` 已存在，补 `.hud-goal-chip:hover` / `.hud-resource:hover` / `input[type="checkbox"]:hover` / `.tool-grid button:hover:not(:disabled)`）；(4) `BuildToolbar.js:sync()` 中按 `BUILD_COST[btn.dataset.tool]` 与 `state.resources` 派生 `btn.disabled = true/false`，CSS 已有 `button:disabled { opacity:0.4; cursor:not-allowed }`（line 1004）直接生效。
- 涉及文件：`index.html`（内联 `<style>`，3 处补丁约 80 LOC），`src/ui/tools/BuildToolbar.js:sync()`（约 30 LOC 新逻辑 + 顶部 import `BUILD_COST`），新增 `test/buildtoolbar-disabled.test.js` 单测约 40 LOC。
- scope：小-中（~140 LOC delta，2 个源文件 + 1 个新测试）
- 预期收益：3 个 P0 同时关闭；hover 在 6 个 panel 类型补齐；Build Tools 资源不足时灰色显示 + 鼠标 not-allowed，玩家不再"点了没反应"困惑。
- 主要风险：(a) topbar 在 1366 升至双行可能挤压下方 1px 的 alertStack `top:38px`（line 1730 已有处理，需检查 `--hud-height` 同步）；(b) BuildToolbar disabled 的 cost-derive 必须用与 `BuildAdvisor.applyTerrainCostModifiers` 不同的"乐观下界"（即仅按 base BUILD_COST 比对，不算 escalator/elevation surcharge），否则会误禁用首座建筑；(c) 1024 sidebar 改全宽后 `#wrap.sidebar-open #statusBar { right: 0 }` 已存在，但 `#aiAutopilotChip max-width` 公式 `calc(100vw - 720px)` 在 1024 会算成 304px，需在该断点放宽。
- freeze 检查：OK —— 纯 CSS + 单文件 JS 内派生（`disabled` 是已有 HTML 属性），零新增 tile/role/building/mood/audio/panel/mechanic。

### 方向 B：引入 4/8/12 spacing token + container-query 响应式重写
- 思路：在 `:root` 加 `--space-1..6 / --hover-bg / --disabled-opacity` token，全局替换散落像素；hud-goal-list 改 container query 自动折叠为图标 + tooltip；sidebar 在 1024 走整体折叠模式。
- 涉及文件：`index.html`（重写 ~300 LOC）+ `src/ui/hud/HUDController.js`（chip 折叠模式渲染）+ `src/ui/tools/BuildToolbar.js` + 可能波及 `src/ui/panels/*Panel.js` 的内联 style。
- scope：大（~600 LOC，触 5+ 文件）
- 预期收益：根治 D2 spacing token + D6 全分辨率 + 长尾 hover/disabled。
- 主要风险：30 分钟不可能完成；与 A4/A7 plan 高重叠；引入 container query 的浏览器兼容性需校验。freeze 检查 OK 但 scope 不现实。
- freeze 检查：OK 但 scope 不现实。

### 方向 C：1024×768 列为不支持，直接显示"请扩宽窗口"挡板
- 思路：扩展现有 `@media (max-width: 799px)` 挡板（`index.html:1980-1993`）到 `< 1280`。
- 涉及文件：`index.html` 单条规则。
- scope：极小（~5 LOC）
- 预期收益：消除 1024 P0 #2 + #3。
- 主要风险：A6 反馈明确将 1024 列为 RED 但仍要求修复而非屏蔽；屏蔽方案与 R0 已修的 1366 路径互斥（玩家在 1280-1366 仍受影响），且违反 v0.8.2 Round-6 既有"≥1024 视为可玩"契约（`index.html:1955-1956` 写明）。
- freeze 检查：OK；但策略性不可接受 —— 把"修不完"伪装成"产品决策"。

## 3. 选定方案

选 **方向 A**。理由：
- 3 个 P0 都在小 scope CSS + 一段 JS derive 内闭合；
- 与 A4/A7/A3 的潜在冲突是物理共享同一片 CSS 区段（topbar、tool-grid），不是逻辑冲突；orchestrator 处理 conflicts_with 列表时按 reviewer-id 顺序合并即可；
- 30 分钟 deadline 内可执行 + 可验证；
- 不触发 freeze；新增的"按 base cost 比对 stockpile"是已有 HTML `disabled` 语义的派生，未引入新 mechanic。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:80-97` (`#statusBar` rule) — `edit` — 把 `overflow: hidden` 改为 `overflow-x: hidden; overflow-y: visible`，并把 `height: 32px` 改为 `min-height: 32px`，同步在 `:root` 把 `--hud-height` 在 `< 1440` 媒体下从 `40px` 升至 `64px`（让出第二行空间给 goal-list 换行）。
- [ ] **Step 2**: `index.html:294-297` (`.hud-goal-list`) — `edit` — 加 `flex-shrink: 1; min-width: 0;` 并在新增 `@media (max-width: 1440px)` 中把 `max-width: none; flex-wrap: wrap;` 显式声明，移除 1100px 媒体查询里 `#statusScoreboard #statusScenario { max-width: 240px; overflow: hidden; text-overflow: ellipsis; }`（line 150-156）改为允许 wrap。
  - depends_on: Step 1
- [ ] **Step 3**: `index.html:1720-1753` (`@media (max-width: 1024px)`) — `edit` — 在该块内追加：`#sidebar { z-index: 14 !important; }`（让位 statusBar=15），`#statusBar { right: 0 !important; }`（撤销 right:36px 给底部 sidebar 让路），`#aiAutopilotChip { max-width: clamp(140px, 36vw, 320px); }`（覆盖 line 170-175 的 `calc(100vw - 720px)` 在 1024 失效问题），并把 `--hud-height` 在该块降回 `48px`（goal-list 换行+底部 sidebar 36px tab strip 不能再叠）。
  - depends_on: Step 2
- [ ] **Step 4**: `index.html:999-1009` (`button:hover:not(:disabled)` 区域之后) — `add` — 追加全局 hover state library 块：`.hud-chip:hover` / `.hud-goal-chip:hover` / `.hud-resource:hover` / `.tool-grid button:hover:not(:disabled)` / 已有 `.sidebar-tab-btn:hover` (line 814-817) 保留；为 `input[type="checkbox"]:hover` 与 playback `[data-playback]:hover` 补 `cursor: pointer; filter: brightness(1.1);`。约 30 LOC。
- [ ] **Step 5**: `src/ui/tools/BuildToolbar.js:13` — `edit` — `import { BALANCE } from "../../config/balance.js";` 之后追加 `import { BUILD_COST } from "../../config/balance.js";`（同模块导出，单 import 行扩展 named member）。
- [ ] **Step 6**: `src/ui/tools/BuildToolbar.js:sync()` — `edit` — 在 line 1134 之后（active class 切换之后）插入：遍历 `this.toolButtons`，对每个 `btn`：取 `tool = btn.dataset.tool`；`select`/`erase` 永不禁用；其余 `cost = BUILD_COST[tool] ?? null`；若 cost 存在，比 `state.resources.{wood,stone,herbs,food}`，任一短缺则 `btn.disabled = true; btn.setAttribute("data-cost-blocked", "1")` 否则 `btn.disabled = false; btn.removeAttribute("data-cost-blocked")`。约 25 LOC。CSS 已有 `button:disabled { opacity:0.4; cursor:not-allowed }`（line 1004）会自动生效。
  - depends_on: Step 5
- [ ] **Step 7**: `index.html:982-986` (`.tool-grid button[data-tool-destructive="1"]:disabled`) — `edit` — 紧接其后追加通用 `.tool-grid button:disabled { opacity:0.4; cursor:not-allowed; filter: grayscale(0.4); }`（覆盖所有 14 按钮，不仅 demolish），并加 `.tool-grid button[data-cost-blocked="1"]::after { content:"\26A0"; margin-left:3px; opacity:0.7; font-size:9px; }` 警示三角，约 8 LOC。
- [ ] **Step 8**: `test/buildtoolbar-disabled.test.js` — `add` — 新单测：mock `state.resources = { food:0, wood:0, stone:0, herbs:0 }` + DOM 14 个 `button[data-tool]`；构造 BuildToolbar 调 `sync()`；assert farm/lumber/warehouse 等 wood-cost 按钮 `.disabled === true` 且 `select`/`erase` 仍 `.disabled === false`；再把 `state.resources.wood = 100` 重 sync，assert farm/lumber 解锁。约 40 LOC。
  - depends_on: Step 6
- [ ] **Step 9**: 手动验证 — `none` — Vite dev server 拉起 → 1366×768 viewport：顶 statusBar 升至双行，6 个 goal chip 全显（routes/depots/warehouses/farms/lumber/wells）；1024×768：sidebar 在底部，topbar 占满全宽，右上 autopilot chip 不被截；Build Tools 在 wood=0 时全部灰、warning 三角显示；任意按钮 hover 后背景变亮。
  - depends_on: Step 8

## 5. Risks

- **R1**: topbar 升至双行后 alertStack `top:38px`（line 1730）可能与第二行 chip 行重叠。缓解：Step 1 同步把 `--hud-height` 在 `< 1440` 媒体提到 64px；alertStack 自身通过 `--hud-height` 偏移（如未读取则在 Step 1 同步 alertStack `top: var(--hud-height)`）。
- **R2**: BuildToolbar 用 base BUILD_COST 比对会忽略 escalator/elevation surcharge，导致玩家在第 N 个 warehouse 看似"可建"但实际点击仍被 BuildAdvisor 拒绝。缓解：保持 base-cost 作为"乐观可见性"门槛——按钮亮 = 至少符合面值；buildPreviewVal 已渲染真实 deficits 文案（line 1413-1426），Hover 时 tooltip 给精确原因。文档化 `data-cost-blocked` 仅表"基础门槛失败"。
- **R3**: 1024 sidebar `z-index: 14 !important` 可能与既有 `#alertStack` z-index 冲突（`alertStack` 默认无显式 z-index）。缓解：Step 3 中同步把 1024 媒体块内 `#alertStack { z-index: 16; }` 显式声明，确保 statusBar(15) < alertStack(16)。
- **R4**: `BUILD_COST` 在测试环境的 import 路径需相对 `test/` 目录正确解析；可能波及 `test/build*.test.js` 已有的 11 个建筑测试。
- 可能影响的现有测试：`test/build-toolbar*.test.js`（如存在），`test/hud-controller*.test.js`，`test/build-advisor*.test.js`，`test/balance.test.js`。预计影响 ≤3 个文件，非破坏性（disabled 属性是新增，不替换旧 API）。

## 6. 验证方式

- 新增测试：`test/buildtoolbar-disabled.test.js` 覆盖 "wood=0 时 14 工具按钮中 12 个被 disabled，select/erase 例外；wood=100 时全解锁"。
- 手动验证：`npx vite` → Playwright `browser_resize` 1366×768 → 顶部 6 个 chip 必须全可见且 routes/depots/warehouses/farms/lumber/wells label 不被裁；`browser_resize` 1024×768 → topbar 跨满全宽，sidebar 在底部 36px tab strip 可见，右上 autopilot chip 可读；`browser_evaluate` 检查 `document.querySelectorAll('button[data-tool]:disabled').length` 在 startup（wood=0）≥ 10。
- FPS 回归：`browser_evaluate` 5 秒平均 FPS ≥ 28（baseline ~32）。
- benchmark 回归：`scripts/long-horizon-bench.mjs --seed 42 --map temperate_plains` —— DevIndex 不得低于 R0 baseline - 5%（CSS-only + 单段 sync 派生不应触动 sim 路径）。
- prod build：`npx vite build` 无错；`vite preview` 3 分钟 smoke 无 console error。
- 全测试：`node --test test/*.test.js` 必须保持 1646 pass / 0 fail / 2 skip 基线（+1 新测试 → 1647 pass）。

## 7. 回滚锚点

- 当前 HEAD：`1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记

不适用。三处 P0 均为静态 CSS + DOM 状态问题，feedback 自带 03/04/02 三张截图佐证；本 plan 选定方案沿用 R0 同款"读 CSS / 读 sync()"路径，无需启动 dev server 即可定位修复点。Step 9 手动验证保留 Playwright 复现作为最终签收门。
