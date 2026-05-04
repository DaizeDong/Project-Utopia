---
reviewer_id: A3-first-impression
reviewer_tier: A
feedback_source: Round3/Feedbacks/A3-first-impression.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 4
  loc_delta: ~+50 / -25
  new_tests: 1
  wall_clock: 60
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **F1 (P0)：LMB-vs-tile-inspector 仍冲突** — R2 加了 ENTITY_PICK_GUARD ~14px（防止 entity-pick 误触发 inspect），但当玩家有工具选中时，第一次 LMB 在某些 grid 单元仍打开 tile inspector 而不是放置 — 根因可能是：(a) ENTITY_PICK_GUARD 仅档 entity-pick 路径，不档 tile-inspect 路径；(b) 工具被 BuildToolbar 选中后 `state.controls.activeTool` 没有同步到 click router；(c) 第二次点 Road 按钮 toggle 关闭工具又触发 inspect。
2. **F6 (P0)：F1 Help 与首屏 briefing 互相打架** — Help 写 "Open the **Build** panel (top-left) and place a **Farm** on green grass"；首屏 briefing 写 "First build: Build a road"。位置（top-left vs 实际右侧）+ 优先建 farm vs road 两套指引矛盾。
3. **F2 (P0)：Best Runs all-loss 主菜单首屏劝退** — 第一次启动有 10 条 placeholder loss 历史；玩家心理预期被打到地板。

## 2. Suggestions（可行方向）

### 方向 A: 三处定点修复（click router + Help 文案 + 空 Best Runs gate）

- 思路：
  1. 在 click handler 入口加 `if (state.controls.activeTool && activeTool !== "inspect") { route to placeTool; return; }` 短路逻辑，禁止 inspect 路径在 active tool != inspect 时被走到；
  2. 同步 Help 文案 (`src/ui/HelpPanel.js`) 的 Getting Started / Controls 第一条与首屏 scenario briefing 用同一字符串源（`scenario.briefing.firstBuild`），消除 Build panel 位置 + farm-vs-road 双重矛盾；
  3. 在 BestRuns 渲染入口 (`src/ui/BestRunsPanel.js`) 检查 localStorage 是否首次运行，是则替换为正向引导 "Your first run hasn't started yet" 而不是 10 条 loss placeholder。
- 涉及文件：`src/ui/InteractionRouter.js`（或 InputManager / GameApp click handler）、`src/ui/HelpPanel.js`、`src/ui/BestRunsPanel.js`、`src/scenario/scenarioBriefing.js`（briefing 字符串源）
- scope：中
- 预期收益：F1+F2+F6 同时关闭，首 60 秒玩家挫败感大降；YELLOW → GREEN 期望可达。
- 主要风险：click router 改动可能影响双击 inspect / RMB drag / 工具 toggle 三种手势；BestRuns gate 可能误判老玩家（有本地数据的）首启。Mitigation：BestRuns 用 `runs.length > 0` 判定，不依赖 firstRun flag。
- freeze 检查：OK（无新 tile/role/UI panel；Help 字符串编辑、BestRuns 渲染分支、click router 加 if 分支）

### 方向 B: 仅修 click router（最小爆炸面），Help/BestRuns 留给 R4

- 思路：仅 Step 1 落地。
- 涉及文件：1 个
- scope：小
- 预期收益：F1 关闭，F2/F6 仍开。
- 主要风险：Reviewer 列了 3 条 P0，只修 1 条达不到 verdict 升级条件。
- freeze 检查：OK

### 方向 C: 加 onboarding spotlight (FREEZE-VIOLATION)

- 思路：F3 改进建议直接说"加 spotlight / dim 其余 UI 蒙层"——这相当于新 UI panel。
- freeze 检查：**FREEZE-VIOLATION** — hard freeze 禁止新 UI panel；不选定。

## 3. 选定方案

选 **方向 A**。理由：(a) Reviewer 报 3 条 P0 都需要关闭以达 verdict 升级；(b) 三处改动彼此独立可并行落地，scope 中而非大；(c) 方向 C 越界 freeze 直接 reject；(d) 方向 B 留 2 条 P0 不达成本轮 P0 修复目标。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/InteractionRouter.js` (或 GameApp.js click dispatcher，搜 `inspect tile` / `openTileInspector`) — edit — 在 LMB click 入口最前面加保护：`const tool = state.controls?.activeTool; if (tool && tool !== "inspect" && tool !== null) { return this.placeWithTool(tool, tilePos); }`，确保有 active tool 时绝不走 inspect 路径。先 Grep 定位文件：`grep -rn "openTileInspector\|inspectTile\|activeTool" src/ui src/app | head`。
- [ ] Step 2: `src/ui/InteractionRouter.js` — edit — 第二次点同一 build button 切 toggle 工具时，明确 set `state.controls.activeTool = null`（而不是切到 inspect overlay）；toggle 关闭工具应让 LMB 回到 inspect 默认而非进入 overlay 模式。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/HelpPanel.js` (Getting Started / Controls 第一条) — edit — 把 "Open the Build panel (top-left) and place a Farm on green grass" 改为读 `scenario.briefing.firstBuild` 字段（与首屏 briefing 同源），并把 "top-left" 改为 "right sidebar (Build tab)"。如果 scenario.briefing.firstBuild 不存在则 fallback 为 "Press 1 (Road) and click a green tile near a worker".
- [ ] Step 4: `src/scenario/*.js` (定位首屏 briefing 字符串源，搜 `west forest is overgrown` 或 `briefing`) — edit — 把 briefing 文案与 Help Getting Started 第一条对齐：统一使用 "Press 1 to select Road, then LMB on a green tile to lay it."；移除 "first build a road" vs "place a Farm" 的矛盾。
  - depends_on: Step 3
- [ ] Step 5: `src/ui/BestRunsPanel.js` (或 SplashMenuPanel.js / MainMenu) — edit — 在 BestRuns 渲染入口加：`if (!Array.isArray(runs) || runs.length === 0) return renderEmptyState("Your first run hasn't started yet — press Start Colony to begin."); else if (runs.every(r => r.outcome === "loss")) prependBanner("Survival mode — every run ends; aim for higher score.");`。移除 placeholder all-loss 数据源（搜 `placeholderRuns` / `defaultBestRuns`）。
- [ ] Step 6: `src/ui/TileInspectorPopup.js` (或 TileInfoPopup) — edit — 移除 hint 行 "B = build · R = road · T = fertility"（这与全局 keymap 矛盾，A7 也单独提到）— 整段删除或替换为 "Press 1-12 to select a build tool".
- [ ] Step 7: `test/click-router-tool-priority.test.js` — add — 测试：set `activeTool = "road"`，dispatch LMB click on grass tile → assert `placeTool` 被调用、`openTileInspector` 未被调用；set `activeTool = null`，dispatch LMB → assert `openTileInspector` 被调用。
  - depends_on: Step 1, Step 2

## 5. Risks

- click router 入口可能被 multiple consumer 共用（worker drag / camera pan / RMB context），改 LMB 短路可能影响其它路径。Mitigation：仅在 LMB 路径加，且只在 `activeTool != null && != "inspect"` 时短路。
- BestRuns empty-state 可能与既存 localStorage runs 冲突（老用户测试机器有 placeholder data），需用 `runs.length === 0` 而不是 `firstRun` flag 判定。
- 可能影响的现有测试：`test/InteractionRouter.test.js` (如存在)、`test/HelpPanel.test.js`（如存在）、`test/BestRuns.test.js`（如存在）。

## 6. 验证方式

- 新增测试：`test/click-router-tool-priority.test.js` 锁住 active-tool 优先于 tile-inspect。
- 手动验证：`npx vite` → 进游戏 → 按 1 (Road) → LMB 在草地 → 期望 toast "Road at (x,y): 1 segment placed" 且无 tile inspector 弹窗 → 第二次按 1 关闭工具 → LMB → 期望 tile inspector 出现；按 F1 → 期望 Getting Started 第一条与首屏 briefing 同句；首启浏览器（清 localStorage）→ 期望 BestRuns 显示 "Your first run hasn't started yet" 而非 10 条 loss。
- FPS 回归：未触及主循环；FPS 不应变化。
- benchmark 回归：N/A（UI 路径）。
- prod build：`npx vite build` 无错；smoke 3 分钟无 console error。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

部分可复现：F1 click 路径需要在 dev server 上手动确认（feedback 给了清晰复现路径）；F6 文案矛盾通过文件级 grep 即可证实。
