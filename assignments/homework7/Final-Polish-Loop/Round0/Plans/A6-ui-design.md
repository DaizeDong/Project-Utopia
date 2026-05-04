---
reviewer_id: A6-ui-design
reviewer_tier: A
feedback_source: assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/A6-ui-design.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 1
  loc_delta: ~55
  new_tests: 0
  wall_clock: 25
conflicts_with:
  - A7-z-index-toast-hud   # toast/HUD layering & alert overlap (D7, P1 #10)
  - A4-alignment-typography  # font-size, spacing tokens, alignment (D2, D5 P2)
rollback_anchor: 3f87bf4
---

## 1. 核心问题

A6 reports 19 UI bugs (2 P0 + 9 P1 + 8 P2). Reduced to **2 root issues** for this Round-0 plan; remaining P1/P2 bundled to neighbouring reviewers (A7/A4) per `conflicts_with`.

1. **Demolish 默认态颜色冲突 (P0 #1)** — `.tool-grid button[data-tool-destructive="1"]` 在 `index.html:940-943` 给 default 态用了红色边框 (`rgba(220,96,86,0.55)`) + 红色文字 (`#e07d72`)。这与 active 态 (白边 + 浅蓝底, `index.html:971-975`) 抢视觉权重，且违反 "红 = 危险/active/disabled" 的色义一致性。Demolish 默认应是中性色，仅在 hover/active 时才升级为红警示。
2. **快捷键卡 keybinding 截断 (P0 #2 + P1 #3)** — `.hotkey-grid` 在 `index.html:361-372` 用 `grid-template-columns: 1fr 1fr` 强制 2 列，每行 `.hk-row` (line 373-376) 是 `flex` 但 `.hk-desc` (line 385-387) 没有 `min-width: 0`、没有换行允许，也没有 ≤1366 / ≤1280 / ≤1024 三档断点回退到 1 列布局。结果："supply-chain heat lens" / "cancel / deselect" / "redo build" / "inspect tile" 在 1024-1440 全部截断成 "supply-chai he…"。

附带修复（不出 Build Tools 范围、零新增 panel/mechanic）：
- D4 P1: Demolish 缺 `:disabled` 态 (B-tool 资源不够时按钮不变灰) — 同文件同选择器加一行 `:disabled` 规则。

## 2. Suggestions（可行方向）

### 方向 A: 仅 CSS 收紧 (Demolish neutral default + hotkey-grid 1-col 断点)
- 思路: 改 `index.html` 内联 `<style>` 中两处选择器：(1) Demolish default 态恢复中性色（继承 `.tool-grid button` 的 `var(--btn-bg)`/`var(--btn-border)`），保留 hover/active 红色升级；(2) `.hotkey-grid` 在 `@media (max-width: 1366px)` 下 fallback 到 `grid-template-columns: 1fr` 单列 + `.hk-desc` 加 `white-space: normal; word-break: break-word; min-width: 0;` 允许换行。
- 涉及文件: `index.html` (内联 `<style>`，line 937-952 + line 360-392 + 在 `@media` 区块 line 1692 之后插入 1 个新断点)
- scope: 小 (~50 LOC delta，单文件)
- 预期收益: 两个 P0 同时关闭；keybinding 卡在 1024/1280/1366 不再截断；Demolish 不再误读为 "active/危险"；额外捎带 `:disabled` 态完善 D4 缺口。
- 主要风险: 1080p 下 hotkey-grid 在 1366 触发的 1 列布局会让面板更高，可能挤压下方 Construction card；需在 dev server 视觉验证。
- freeze 检查: OK — 纯 CSS，零新增 tile/role/building/mood/audio/panel。

### 方向 B: 全局 color-token 系统化 + 响应式重构 (D5 #11 + D6 全档)
- 思路: 在 `:root` 引入 `--color-success / --color-warn / --color-error / --color-info / --color-neutral`，全局替换 `#f87` / `#e07d72` / `rgba(180,60,50,…)` 散落色；同时把 `.hotkey-grid` / Build Tools 网格 / 资源条 / chip filter 全部迁移到 container-query 响应式系统。
- 涉及文件: `index.html` (内联 style 大段重写)、可能波及 `src/ui/tools/BuildToolbar.js` / `src/ui/panels/EntityFocusPanel.js` 中内联 `style="color:..."` 的散点
- scope: 大 (~400+ LOC，触及 5+ 文件)
- 预期收益: 根治 D5 #11 + D6 1024-2560 全部断点；为 A4/A7 后续工作铺路。
- 主要风险: HW7 30 分钟 deadline 不可能完成；改动面太大易引入回归；与 A4/A7 plan 高度冲突需 orchestrator 仲裁。
- freeze 检查: OK 但 scope 不现实。

### 方向 C: 删 hotkey-grid 卡，改用 Help modal (F1) 单一 source-of-truth
- 思路: 删除 Build panel 内的 `.hotkey-grid`（`index.html:2412-2427`），玩家按 F1 进 Help modal 看完整快捷键表。
- 涉及文件: `index.html` (删除 ~16 行)
- scope: 小
- 预期收益: 截断问题消失（卡片不存在了）。
- 主要风险: **降低可发现性** — sidebar 内常驻提示是 v0.8.7.1 U3 的 UX 决策，删除等于 regress；评审 A6 D7 明确表扬 "有快捷键提示" 是核心强项之一。
- freeze 检查: OK 但等同删除已建立的 UI 模式，和 freeze 精神（"保持外部可观察行为不变"）相悖。

## 3. 选定方案

选 **方向 A**。理由：(1) P0 优先级 + 30 分钟 deadline → 必须小 scope 快速落地；(2) 单文件、纯 CSS，回归面最小、回滚成本接近零；(3) 不触发 hard freeze；(4) 方向 B 留给后续 round（color-token 体系化属架构整理，需独立 wave plan）；(5) 方向 C 牺牲 v0.8.7.1 U3 已建立的 UX 不可取。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:940-943` — `edit` — 把 `.tool-grid button[data-tool-destructive="1"]` 的 `border-color` / `color` 删除，让其继承 `.tool-grid button` 默认样式 (var(--btn-bg) + var(--btn-border) + var(--text))。整个选择器块可整体移除（保留 hover + active 块），或保留并注释 "default 中性，仅 hover/active 用警示色"。
- [ ] **Step 2**: `index.html:944-947` — `edit` — `.tool-grid button[data-tool-destructive="1"]:hover:not(:disabled)` 保留不变（hover 升级为红警示是正确的）。
- [ ] **Step 3**: `index.html:948-952` — `edit` — `.tool-grid button[data-tool-destructive="1"].active` 保留不变（active 用深红高亮是正确的）。
  - depends_on: Step 1
- [ ] **Step 4**: `index.html:940` 之后 — `add` — 新增 `.tool-grid button[data-tool-destructive="1"]:disabled { opacity: 0.4; cursor: not-allowed; color: rgba(200,96,86,0.45); }` 补全 D4 缺失的 disabled 态（资源不够时变灰）。
- [ ] **Step 5**: `index.html:385-387` — `edit` — `.hotkey-grid .hk-desc` 添加 `min-width: 0; white-space: normal; word-break: break-word; line-height: 1.25;` 允许换行而非截断。
- [ ] **Step 6**: `index.html:373-376` — `edit` — `.hotkey-grid .hk-row` 把 `align-items: baseline` 改为 `align-items: flex-start` 配合换行；保留其他属性。
  - depends_on: Step 5
- [ ] **Step 7**: `index.html:1691` 之前 (在 `@media (max-width: 1024px)` 结束 `}` 之后、`@media (min-width: 1025px)…` 之前) — `add` — 新增 `@media (max-width: 1366px) { .hotkey-grid { grid-template-columns: 1fr; gap: 4px 0; } }`，1366 及以下回退单列。
  - depends_on: Step 5

## 5. Risks

- **Demolish 中性色后辨识度可能下降** — 玩家可能误把 Demolish 当普通工具，缺少"破坏性"警示。缓解：保留 hover 红色升级 + 已有的 `title` tooltip + `Hammer.png` 图标。
- **hotkey-grid 1 列布局让 Build panel 在 1366 下变更高** — 可能挤压下方 Construction card 的可见区域；用户需多滚一下。缓解：Build panel 已是 `details` 可折叠，且 `#sidebarPanelArea` 已有 `overflow-y: auto`。
- **1366 断点和 v0.9.2-ui (F1) 设计目标冲突** — F1 注释把 1080p 设为目标分辨率；本次断点把 1366 也归入"窄屏"，需在 changelog 标明新断点定义。
- **可能影响测试**: 无 — 纯 CSS 修改，没有 unit test 直接覆盖 `index.html` 内联 style；现有 `test/` 目录全部是 simulation/balance Node 测试。Playwright snapshot 测试若存在像素对比可能 flake，但当前仓未启用。
- **CSS 优先级**: `.tool-grid button[data-tool-destructive="1"].active` (Step 3 保留) 仍要在 `.tool-grid button.active` (line 971) 之后定义以胜出 — Step 1-3 不调整顺序故 OK。

## 6. 验证方式

- **新增测试**: 无（纯 CSS 变更，无逻辑可单测）。
- **手动验证**:
  1. `npx vite` → 打开 `http://127.0.0.1:5173`
  2. 点 Start Colony → 进入游戏 → 观察 Build Tools panel 中 Demolish 按钮：default 态应为中性灰（与 Farm/Road default 同色），hover 时浮现红警示，点选后变深红 active 态。
  3. 浏览器 DevTools 切换设备工具栏，分别用 1024×768 / 1280×800 / 1366×768 / 1440×900 / 1920×1080 五档分辨率打开 → 检查 Build Tools 底部 hotkey 卡：1366 及以下应为单列、文字完整换行无截断；1920 保持 2 列原貌。
  4. 触发资源不足场景（Wood = 0），点 Demolish → 按钮应变灰 + cursor not-allowed (D4 disabled 缺口闭合)。
- **FPS 回归**: `browser_evaluate` 5 秒 FPS 平均 ≥ 50 (CSS layout 改动几乎不影响 GPU)。
- **benchmark 回归**: 不需要（纯 UI CSS，simulation 行为不变）。
- **prod build**: `npx vite build` 无错；`vite preview` 加载首屏无 console error；Help modal (F1) 仍正常打开。

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚: `git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发；CSS-only 改动几乎不可能需要硬回滚，单文件 `git checkout 3f87bf4 -- index.html` 即可）

## 8. UNREPRODUCIBLE 标记

不适用 — A6 feedback 提供了 02-15 的截图编号且复现路径明确（DevTools 设备工具栏切分辨率），无需现场 Playwright 复现即可定位 CSS 根因。

## 9. C1 对照表

不适用（本 plan 非 C1 driven 整理 plan）。
