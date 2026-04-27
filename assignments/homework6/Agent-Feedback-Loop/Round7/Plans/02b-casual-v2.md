---
reviewer_id: 02b-casual
round: 7
version: 2
date: 2026-04-26
priority: P1
covers_all_feedback: true
---

# Plan v2: 02b-casual — 手动 Advisory 模式 + 优先级指引 + 场景切换防护

## 1. 根本问题（顶层分析）

### 根因 A — 手动模式没有接入 ColonyPlanner 的战略知识

**现状**：Autopilot ON 时，`ColonyPlanner.generatePlan()` 实时计算最优角色分配，工人按计划工作。Autopilot OFF 时，`ColonyPlanner` 完全不运行，玩家只有数字和直觉。

**顶层修复**：Autopilot OFF 时，`ColonyPlanner` 仍在**只读模式**下运行（不改变工人行为，只计算建议），将其 top-1 建议推送到 HUD 的 `#nextActionAdvisor` 显示位置。这让玩家获得与 Autopilot 相同的战略洞察，但保留手动控制权。这是**暴露已有逻辑**，不是新建逻辑。

### 根因 B — HUD 显示 7-8 个同等权重的数字，无优先级层次

玩家看到 Food: -265/min / Wood: +2/min / Meals: +17/min... 等并列显示，没有任何一个数字被标为"当前最紧急"。

**顶层修复**：增加 "MOST URGENT" 单行指示器，只显示当前最严重的单个问题（从 ColonyPlanner advisory 读取，或从 resourceEmptySec 中取最小值对应的资源）。这是信息优先级重组，不是新增信息。

### 根因 C — "New Map" / 场景切换无确认，导致新手迷失

Casual reviewer 明确描述地图切换了 4 次，但"不知道是因为我按错了什么"。这是 Wave 1 和 02e plan 部分处理的问题，但 casual 视角需要额外的保护：**游戏中无法意外进入 New Map 流程**。

## 2. 完整 Feedback 覆盖

| 02b 反馈 | 覆盖 step |
|----------|-----------|
| 不知道该做什么（核心诉求）| Step 1 + Step 2 |
| 地图意外切换多次 | Step 3（同 02e Step 2）|
| 数字太多不知哪个最紧急 | Step 2 |
| 无音效 | → audio plan 覆盖 |
| How to Play 触发场景切换 | ✅ Wave 1 已修复 |
| Help 按钮打开工具面板不是教程 | Step 4 |
| 建造成功/失败反馈不明确 | Step 5 |
| Autopilot 让玩家变观众 | Step 1（advisory 模式让手动有价值）|
| 工人数据藏得太深 | → 01c 面板可见性改进覆盖 |

## 3. 实施步骤

### Step 1 — `src/ui/hud/HUDController.js` + `src/simulation/meta/ColonyPlanner.js`：Advisory 模式

在 `HUDController.render(state)` 中，当 `!state.autopilot?.enabled`（手动模式）时，调用 ColonyPlanner 的建议生成：
```js
if (!state.autopilot?.enabled) {
  const advice = ColonyPlanner.getAdvisoryRecommendation(state);
  // advice = { text: "Assign 1+ COOK — Kitchen idle", urgency: 'high' }
  this.#renderAdvisoryChip(advice);
}
```

在 `ColonyPlanner.js` 新增 `getAdvisoryRecommendation(state)` 静态函数（只读，不修改 state）：
- 若 Kitchen > 0 AND COOK = 0 → `{ text: "Add a Cook worker (Colony → role assignments)", urgency: 'critical' }`
- 若 food ETA < 90s AND farms = 0 → `{ text: "Build a Farm on green terrain immediately", urgency: 'critical' }`
- 若 DevIndex < 20 AND foodNet > 0 → `{ text: "Frontier route incomplete — check red tiles on Heat Lens", urgency: 'medium' }`
- 否则 → `{ text: "Colony is stable — expand carefully", urgency: 'low' }`

Advisory chip 已有 DOM 位置（`#statusNextAction` 或 `#nextActionAdvisor`），复用即可。

### Step 2 — `index.html` 或 `src/ui/hud/HUDController.js`：MOST URGENT 单行指示器

在 HUD 顶部状态栏加一行（在 storyteller strip 上方或内部）：
```js
// 找出 resourceEmptySec 中最快耗尽的资源
const eta = state.metrics?.resourceEmptySec ?? {};
const urgentResource = Object.entries(eta)
  .filter(([,v]) => v > 0 && v < 120)
  .sort(([,a],[,b]) => a - b)[0];
if (urgentResource) {
  urgentEl.textContent = `⚠ ${urgentResource[0]} runs out in ${Math.round(urgentResource[1])}s`;
  urgentEl.style.display = '';
} else {
  urgentEl.style.display = 'none';
}
```
DOM：在 status-bar 或 storyteller strip 中加 `<span id="hudMostUrgent" class="hud-urgent-indicator"></span>`
CSS：`.hud-urgent-indicator { color: #e74c3c; font-weight: bold; font-size: 12px; }`

### Step 3 — `index.html`：New Map 确认（与 02e Step 2 相同）

已在 02e-v2 Step 2a 覆盖，此处引用：给 New Map 按钮加 `confirm()` 对话框。

### Step 4 — `index.html`：Help 按钮行为修正

"? Help" 按钮（非 "How to Play"）目前打开 Build 面板。改为打开 Help Modal（即"How to Play"对话框）：
找到 `#helpBtn` 的 click handler，将其改为 `openHelp()` 而非 `openBuildPanel()`。注意不影响快捷键（F1）。

### Step 5 — `src/render/SceneRenderer.js` 或 `src/simulation/construction/BuildSystem.js`：建造成功反馈增强

建筑放置成功后，在该 tile 上方短暂显示绿色 "✓" 图标（类似 mapMarker 机制，2s），配合 audio plan 的 `onBuildingPlaced()` 音效。若放置失败（已有红字错误），错误 toast 停留时间从 1.5s 延长到 3s。

## 4. 验证

- 手动模式下，HUD 的 Advisory chip 显示具体建议（如 "Add a Cook worker"）
- 若 food ETA < 60s，"MOST URGENT" 指示器显示倒计时
- 点击 "New Map" → 确认对话框
- "? Help" 按钮打开 Help Modal（非 Build 面板）
- 建筑放置成功 → 地图上有绿色 ✓ 图标 + 提示音
- `node --test test/*.test.js` 全通过
