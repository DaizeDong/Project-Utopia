---
reviewer_id: A6-ui-design
reviewer_tier: A
feedback_source: Round3/Feedbacks/A6-ui-design.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 4
  loc_delta: ~+90 / -10
  new_tests: 1
  wall_clock: 60
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **顶 HUD chip strip 在 ≤1366 width 截断（P0）** — R2 已加 1366 dedicated media + alertStack，但 "farms 0/6"、"lumber 0/3"、"walls 0/8" 仍消失。R2 修法是降低 chip 高度而非宽度优化；根因是 chip strip flex 容器没有 `flex-wrap: wrap` 或 `min-width: 0`，1366 内 6 个 chip × ~120px = 720px，加 sidebar 280px、margin 50px 已超 1080px 可视宽度。需要 (a) `flex-wrap: wrap` + 第二行；或 (b) 收纳到 "more" 折叠按钮；或 (c) chip 字体降到 11px + 缩短 label "warehouses" → "wh".
2. **Disabled build button 无 "why" tooltip（P1）** — Clinic disabled 但 hover 不告诉为什么（缺 herbs / 缺 wood / 无 floor 等）。需要 BuildToolbar 在 `tool.disabled` 状态下注入 tooltip text。
3. **Best Runs / Entity Focus / Colony 用原生 scrollbar（P1）** — 主题不一致；CSS 主题化 scrollbar (`::-webkit-scrollbar`) 即可。

## 2. Suggestions（可行方向）

### 方向 A: 三处定点修复（chip flex-wrap / disabled tooltip / themed scrollbar）

- 思路：
  1. HUD chip strip CSS 加 `flex-wrap: wrap; min-width: 0; gap: 4px;`，让超宽时换第二行；或用 CSS Grid `auto-fit, minmax(80px, 1fr)`；并把 chip label 简化（farms / lumber / walls 字号 11px）；
  2. BuildToolbar 在 `disabled` 状态读 `tool.disabledReason`（已存在 / 待补全 build-cost mismatch reason），用 `<button title="...">` 或 tooltip overlay；
  3. 全局 CSS 加 `::-webkit-scrollbar` 主题样式，覆盖 BestRuns / EntityFocus / Colony / Settings 4 个 scroll 容器。
- 涉及文件：`src/ui/HUDController.js` 或 `src/ui/styles.css` (HUD chip CSS)、`src/ui/tools/BuildToolbar.js`、`src/ui/styles.css`（scrollbar 主题）
- scope：中
- 预期收益：P0 关闭（1366 chip 全部可见）；P1 #2 #6 关闭。
- 主要风险：flex-wrap 让顶栏可能占 2 行，挤压地图视区；mitigation：chip 第二行 height < 24px，地图视区损失 < 2%；scrollbar 主题在 Firefox 用 `scrollbar-color`（不同语法），需双语法。
- freeze 检查：OK（无新 panel / role / mechanic）

### 方向 B: 仅 chip strip P0 修复

- scope：小；只关 P0；P1 全留。
- freeze 检查：OK

### 方向 C: 改 sidebar 收纳成 "minimize all" 按钮（FREEZE-VIOLATION 边缘）

- 思路：D8 reviewer 提及 Entity Focus 没有 minimise 控制；加一个 collapse-to-tab-strip 控件。
- 风险：这相当于新 UI control / panel state；且 reviewer 把它列为"自行扩展角度"非 P0/P1。
- freeze 检查：边缘 FREEZE-VIOLATION（新 UI affordance），不选定。

## 3. 选定方案

选 **方向 A**。理由：(a) reviewer P0 1 条 + P1 6 条，方向 A 关 P0 + 2 条 P1 (#2 disabled tooltip / #6 themed scrollbar)，剩余 P1 是布局微调（splash centring / z-order / sidebar contrast / leader line）属于第 2 优先级；(b) 方向 B 仅关 P0 不达升级条件；(c) 方向 C 越 freeze 边界。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/styles.css` 或 `src/ui/HUDController.js` 内联 style (Grep `chip-strip\|stat-bar\|skylane`) — edit — 在 chip strip 容器 selector 加 `flex-wrap: wrap; min-width: 0; gap: 4px;` 并把每个 chip 的 `min-width` 改为 `auto`；如果 chip strip 是 inline-style 就改 inline。同时为 ≤1366 媒体查询追加：`.chip-label { font-size: 11px; } .chip-icon { width: 12px; }`，缩短 chip 视觉宽度 ~15%。
- [ ] Step 2: `src/ui/styles.css` 或同源 — edit — 为 ≤1280 加额外媒体查询：把 chip label 整个隐藏只保留 icon + 数字（如 "🌾 0/6" 替代 "farms 0/6"），并加 `title=""` 属性提供 hover 全文。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/tools/BuildToolbar.js` (Grep `disabled\|disabledReason`) — edit — 在 button render 时读 `tool.disabledReason`（如不存在则计算："Need 5 wood (have 0)" / "Need 1 herbs (have 0)" / "Place near soil-rich tile"）并 set `button.title = disabledReason`；CSS 加 `[disabled]::after` 显示一个小 ⚠ icon 提示玩家可 hover。
- [ ] Step 4: `src/ui/styles.css` (全局末尾) — add — 追加主题化 scrollbar：
  ```css
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: #1a2230; }
  *::-webkit-scrollbar-thumb { background: #3aa0ff44; border-radius: 4px; }
  *::-webkit-scrollbar-thumb:hover { background: #3aa0ff88; }
  * { scrollbar-color: #3aa0ff44 #1a2230; scrollbar-width: thin; } /* Firefox */
  ```
- [ ] Step 5: `src/ui/styles.css` (z-index 微调) — edit — 把 toast container z-index 从默认 (~10) 提升到与 EntityFocus header (~12) 不冲突的 11，或把 toast 偏移 8px 避开 EntityFocus 标题（P1 #4 z-order clash）。
- [ ] Step 6: `test/hud-chip-responsive.test.js` (jsdom) — add — 测试：在 1366×768 viewport 下 render HUD，assert 6 个 chip element 全部 `getBoundingClientRect().right < 1366`（不出可视区）。如果 jsdom 不能 reliable 测 layout，fallback 用 snapshot test 锁住 chip strip 的 CSS class 包含 `flex-wrap`.
  - depends_on: Step 1

## 5. Risks

- flex-wrap 让顶栏 chip 在某些窗口尺寸下变 2 行，挤压地图；mitigation：chip 高度 ≤22px，2 行总高 44px < 当前 single-row 60px（含 border + padding）。
- `::-webkit-scrollbar` 在非 webkit 浏览器无效；用 Firefox `scrollbar-color` 双 fallback。
- BuildToolbar `disabledReason` 字段可能不存在；需先在 `BuildToolDescriptors.js` 或类似文件计算。
- 可能影响的现有测试：`test/HUDController.test.js`、`test/BuildToolbar.test.js`（如存在）。

## 6. 验证方式

- 新增测试：`test/hud-chip-responsive.test.js`。
- 手动验证：`npx vite` → 调浏览器窗口到 1366×768 → 期望 6 个 chip 全可见（要么 wrap 第二行，要么 label 缩短为 icon-only）；hover Clinic disabled button → 期望显示 "Need 5 wood" 类 tooltip；hover Best Runs 列表的 scroll → 期望主题色 scrollbar 而非灰色 native；toast 弹出 → 期望不覆盖 EntityFocus 标题。
- FPS 回归：纯 CSS / DOM 改动；FPS 不变。
- benchmark 回归：N/A。
- prod build：`npx vite build` 无错；1366 viewport smoke 3 分钟无 console error。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

可复现 — feedback 给了 1366×768 / 1024×768 / 1920×1080 截图，文件名 `06-1024x768.png` / `05-1366x768.png` 完整保留，CSS 改动直接看 layout 即可验证。
