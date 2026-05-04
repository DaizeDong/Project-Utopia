---
reviewer_id: A3-first-impression
reviewer_tier: A
feedback_source: assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/A3-first-impression.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~55
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: 3f87bf4
---

## 1. 核心问题

Reviewer A3 给出 4/10 (YELLOW) 并几乎在 01:10 关掉页面。三个 P0 onboarding 失败有一个共同根因：**onboarding-critical 信号已经存在于代码中，但被 CSS 隐藏 / 流程跳过 / 视觉副作用淹没**。具体：

1. **F1 — 信息洪水 / Help 不强制**：`overlayHelpBtn` 是次按钮，玩家点蓝色 Start Colony 直接被丢进 13 工具 + 5 资源 + 7 tab + 20 实体的画面。`localStorage 'utopia:helpSeen'` 标志已在 `index.html:3162/3227` 写入但**从未被读取以决定首次启动行为**——基础设施齐全，只缺一句 if。

2. **F2 — 目标清单藏在 AI Log 里**：`getFrontierStatus()` (WorldExplain.js:113) 返回 `"Broken Frontier: 0/1 routes online | warehouses 0/2 | farms 0/6 ..."`，HUDController 已把 chips 写入 `#statusScenario` (line 2175 of index.html)，但 `index.html:139` 一句 `#statusScoreboard #statusScenario { display: none !important; }` 在 slim 状态栏强制隐藏了它。**渲染管线完整，被一行 CSS 关掉**。

3. **F3 — 按 `2` 切到 Fertility Overlay**：`shortcutResolver.js:7-20` 的 TOOL_SHORTCUTS 正确把 `Digit2 → "farm"`，但 `GameApp.js:1884 #applyContextualOverlay("farm")` 经 `TOOL_OVERLAY_MAP` (line 84) 自动启用 `fertility` overlay。Farm 工具确实被选中了，但**绿/蓝色块铺满屏成为玩家唯一感知**。Reviewer 体验=「按键提示是骗人的」。需要把 selectTool 时的 actionMessage 提升为更显眼的工具确认 toast，并让首次自动 overlay 触发时显式说明因果。

## 2. Suggestions（可行方向）

### 方向 A: 三处单点修复 — 一行 CSS / 一段 if / 一个 toast 文案
- 思路：F1=读取已存在的 `utopia:helpSeen` 在首次进入 active phase 时调用 `__utopiaHelp.open('overview')`；F2=去掉 `index.html:139` 的 `#statusScenario` display:none，让已存在的 goal chips 显示在状态栏；F3=`#applyContextualOverlay()` 在 selectTool 路径上把 actionMessage 改写为 `"Tool: Farm (key 2) · auto-overlay: Fertility"`，让"键选了什么 + 副作用是什么"一并出现在左下 toast。
- 涉及文件：`index.html` (行 139 CSS + 行 3196/3227 helpSeen gate)、`src/app/GameApp.js` (#applyContextualOverlay 中的 actionMessage 文案)
- scope：小
- 预期收益：修 3 个 P0；不动新功能；用现有渲染路径
- 主要风险：状态栏 chip 区域可能在窄宽度挤压（已有 max-width clamp + flex-wrap 兜底），需手动 sanity check
- freeze 检查：OK（无新 tile/role/building/mood/audio/UI panel；只调既有 chip 的可见性 + 复用 helpModal + 改 toast 文案）

### 方向 B: 重写 onboarding overlay — 强制 3 屏教程 + 任务面板
- 思路：在 menu 阶段后插一个 3 步 onboarding wizard（What is this game / Build → Farm / Autopilot 三档），并把 Broken Frontier 进度做成右上角独立面板
- 涉及文件：`index.html` 新增 `<div id="onboardingWizard">`、`src/ui/hud/` 新增 `OnboardingWizard.js`、`src/app/GameApp.js` phase 管理
- scope：大
- 预期收益：从根本解决信息洪水；但是 enhancer spec 明确 "新 panel 不允许"
- 主要风险：**FREEZE-VIOLATION** — 新 UI panel + 新 phase
- freeze 检查：FREEZE-VIOLATION（onboarding wizard 是新 UI panel；reviewer 提示 "adjusting existing panel content is allowed; new panel is NOT"）

### 方向 C: 仅修 F2（goal 上 HUD），F1/F3 留 docs 备注
- 思路：只去掉 `#statusScenario display:none`，F1/F3 通过 CHANGELOG / README known-issues 处理
- 涉及文件：`index.html` 单行 CSS
- scope：小
- 预期收益：只修 1/3 P0；A3 评分难以提升
- 主要风险：F1/F3 是 P0 中"差点关掉页面"的源头，跳过它们会让下一个 reviewer 复现同样的 4 分 verdict
- freeze 检查：OK

## 3. 选定方案

选 **方向 A**。理由：

- 三个 P0 的根因都是「基础设施已存在但被遮蔽」，单点修复即可，scope 小、wall-clock 25 分钟内可落
- 方向 B 直接 FREEZE-VIOLATION（新 panel + 新 phase），淘汰
- 方向 C 只盖 1/3 P0，无法挽回 A3 的 YELLOW 评分
- 方向 A 与 reviewer 在 hard rules 里明示的"surfacing the goal checklist into a more visible HUD slot is allowed"完全对齐

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:139` — `edit` — 把 `#statusScoreboard #statusScenario,` 这一行从 `display: none !important` 列表中删除（保留同一规则块里的 `#statusNextAction` `#statusBuildHint` `#latestDeathRow` `#statusScoreBreak`）。让 HUDController 已经 render 的 goal chips（routes/depots/warehouses/farms/lumber/walls，绿√/黄○）在顶栏可见。

- [ ] **Step 2**: `index.html:139` 上方紧邻位置 — `add` — 新增 CSS 规则把 `#statusScenario` 在 narrow 视口下 (`@media (max-width: 1100px)`) 设 `max-width: 240px; overflow: hidden; text-overflow: ellipsis;`，避免 6 个 chip 挤压 `#aiAutopilotChip`。复用既有 `.hud-goal-list` 的 `flex-wrap: wrap` 行为兜底。
  - depends_on: Step 1

- [ ] **Step 3**: `index.html:3196` — `edit` — 在 `overlayHelpBtn` 的 click 监听之后追加一段 IIFE：`if (!localStorage.getItem('utopia:helpSeen')) { /* defer to after Start Colony */ }`。具体落地点是 `#overlayStartBtn` 的 click handler 路径——在 menu→active phase 切换的瞬间，如果 `utopia:helpSeen` 为 falsy 则调用 `window.__utopiaHelp.open('controls')`（已有方法）并 setItem 标志。**不要在 menu 加载时弹**，那会再一次让 Start Colony 不可点；要在 Start Colony 之后立刻弹，这样玩家先看到地图 + 弹窗叠加，关闭后是干净的游戏视图。
  - depends_on: 无

- [ ] **Step 4**: `index.html:2321` — `edit` — `overlayHelpBtn` 的 `title` 属性追加一句 "(opens automatically on first launch)"，配合 Step 3 让玩家理解为什么自动弹了一次。**只改 title，不改按钮文本**（避免 i18n 测试漂移）。
  - depends_on: Step 3

- [ ] **Step 5**: `src/app/GameApp.js:#applyContextualOverlay` (line 2029-2051) — `edit` — 在 `if (mode !== null ...)` 分支内，把 actionMessage 改写为同时显示工具名 + overlay 因果："Tool: <toolLabel> · auto-overlay: <ModeLabel>"。使用现有的 `MODE_LABELS` map + 在 GameApp 顶部既有的 tool→label 映射（如无则就地用 `tool.charAt(0).toUpperCase() + tool.slice(1)`）。这样按 `2` 时左下 toast 显示 "Tool: Farm · auto-overlay: Fertility"，玩家立刻知道按键真的选了 Farm。
  - depends_on: 无

- [ ] **Step 6**: `test/A3-onboarding-surfaces.test.js` — `add` — 新建测试断言：(a) `index.html` 不再包含 `#statusScoreboard #statusScenario { display: none` 规则；(b) `index.html` 包含 `localStorage.getItem('utopia:helpSeen')` 在 Start Colony 路径附近的引用；(c) `GameApp.js` `#applyContextualOverlay` 中包含字符串 `"Tool:"`。三条 grep-style 断言 + 1 条 happy-path（mock localStorage 验证 helpSeen 写入）。
  - depends_on: Step 1, Step 3, Step 5

## 5. Risks

- **顶栏拥挤**：F2 让 6 个 goal chip 出现在 `#statusScoreboard`，可能挤压 `#aiAutopilotChip` 或 `#statusObjective`。Step 2 的 narrow-viewport clamp 兜底；如仍有溢出，`.hud-goal-list { flex-wrap: wrap }` (index.html:275) 会自动换行——但顶栏 max-height:28px (line 115) 会裁切第二行。需要 manual viewport 测试 1280×720 / 1920×1080 / 1024×768 三档。
- **首次自动弹 Help 干扰 demo 录制 / e2e 测试**：所有 `verify-*.mjs` (verify-roads/verify-combat/verify-stall-fix) 走 #overlayStartBtn 流程；如果它们在新 storage 状态启动会被 helpModal 挡住。**缓解**：测试脚本可在 `page.goto` 后立即 `page.evaluate(() => localStorage.setItem('utopia:helpSeen', '1'))`，但 plan 不修测试脚本——交给 Implementer 验证 + 给出 1-line 缓解 patch 选项。
- **Step 5 actionMessage 文案变化**：可能影响任何断言精确文本 `"Auto-overlay: Overlay: Fertility"` 的旧测试。可能影响：`test/world-explain*.test.js` / `test/help-modal.test.js`。需先 grep `Auto-overlay` 字面量。
- 可能影响的现有测试：`test/help-modal.test.js`、`test/game-state-overlay.test.js`、可能 `test/scenario-objective-regression.test.js`（如果它解析 statusScenario textContent）

## 6. 验证方式

- 新增测试：`test/A3-onboarding-surfaces.test.js` — 4 个断言（CSS rule 移除 / helpSeen gate 存在 / actionMessage 包含 Tool / mock localStorage happy path）
- 手动验证：
  1. `npx vite` → 打开 `http://127.0.0.1:5173`
  2. 清 localStorage：`localStorage.clear()`，刷新
  3. 点 Start Colony → 期望 helpModal 自动弹出（Controls tab）
  4. 关闭 helpModal → 期望 `#statusScenario` 在顶栏可见，显示 "○ routes 0/1  ○ warehouses 0/2  ..." chip 列表
  5. 按 `2` → 期望左下 toast 显示 "Tool: Farm · auto-overlay: Fertility"，且 BuildToolbar Farm 按钮 active
  6. 第二次刷新（不清 localStorage）→ helpModal 不再自动弹
- FPS 回归：`browser_evaluate` 5 秒平均 ≥ 50 FPS（CSS 改动极轻量）
- benchmark 回归：N/A（纯 UI 改动，不影响 sim）
- prod build：`npx vite build` 无错；`vite preview` 3 分钟 smoke 无 console error

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚：`git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记

不适用。所有 3 个 P0 的根因均通过静态代码定位完成验证：
- F1: `index.html:3162` 写 `utopia:helpSeen`，`index.html:3227` 仅读但不分发——确认基础设施未被消费
- F2: `index.html:139` 显式 `#statusScoreboard #statusScenario { display: none !important }` 与 HUDController.js:1604-1620 渲染 goal chips 的代码路径直接冲突——CSS 胜出
- F3: `src/app/GameApp.js:1879-1885` selectTool 路径正常调用 `this.toolbar?.sync?.()` + actionMessage="Selected tool: farm (shortcut)"，但紧接 line 1884 的 `#applyContextualOverlay("farm")` 经 `TOOL_OVERLAY_MAP` (line 83-92) 把 actionMessage 覆盖为 "Auto-overlay: Overlay: Fertility"——确认 toast 被覆盖、Farm 工具确实被选中

足够静态证据，无需 Playwright 复现。
