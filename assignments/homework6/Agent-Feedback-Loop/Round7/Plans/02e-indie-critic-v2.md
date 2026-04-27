---
reviewer_id: 02e-indie-critic
round: 7
version: 2
date: 2026-04-26
priority: P1
covers_all_feedback: true
---

# Plan v2: 02e-indie-critic — Debug 面板门控 + 导航 Bug + 游戏终章问题

## 1. 根本问题

### 根因 A — DeveloperPanel 在非开发模式仍完全可见

`DeveloperPanel.js` 渲染 Benchmark / Export CSV / AI Prompt 等开发者工具，没有读取 `isDevelopment()` 或任何生产环境门控。普通玩家看到这些工具，强烈暗示"这是一个实验室，不是一个游戏"。

**顶层修复**：在 DeveloperPanel 的渲染函数中，将 Benchmark、Export、AI Prompt 区域包裹在 `isDevelopment()` 条件内。非 dev 模式保留 AI Log / Causal Chain（这部分对玩家有价值），隐藏工程工具。

### 根因 B — "New Map" 按钮可以被意外点击，无确认

多位 reviewer 报告地图意外切换。`New Map` / 重置按钮直接触发场景切换，无确认对话框。

**顶层修复**：给 `#overlayNewMapBtn` 或等价按钮加 `confirm()` 或内联确认 UI，防止误触。

### 根因 C — 游戏结束无主题反思时刻

独立评论家指出：游戏叫"Utopia"但从未问玩家关于乌托邦的问题。Run End 是纯功能性的（重启/退出），缺少一个让玩家停下来思考的时刻。

**顶层修复**：在 Run End 画面添加一个简单的叙事问题（每个场景模板有独特问题），不需要玩家回答，只是留下思考：
- Broken Frontier: "Did the colony build what it set out to build?"
- Hollow Keep: "Who was the colony defending, in the end?"
- Island Relay: "Was isolation the enemy, or the shelter?"
- Driftwood Harbor: "What was worth saving from the wreck?"
- Silted Hearth: "Can a hearth outlast the flood?"
- Gate Bastion: "What kept the gates open longest?"

## 2. 完整 Feedback 覆盖

| 02e 反馈 | 覆盖 step |
|----------|-----------|
| Debug/Benchmark 面板对玩家可见 | Step 1 |
| 导航 bug（多实例自动增殖）| Step 2a（New Map 确认）|
| 游戏名"Utopia"无主题回应 | Step 3 |
| WHISPER 不可用 | → 01e-v2 Step 2 覆盖 |
| 游戏是"实验室"不是"游乐场" | Step 1（移除开发者工具可见性）|

## 3. 实施步骤

### Step 1 — `src/ui/panels/DeveloperPanel.js`（或 `index.html` Dev panel 渲染区）

找到 DeveloperPanel 的 `render()` 或 HTML 生成逻辑。将以下区域条件化：
- Benchmark Presets 区（含 Run Benchmark、Light/Heavy/Custom 按钮）
- Export Replay / Download CSV 按钮
- AI Prompt 显示区（LLM 输入输出的 JSON 原文）
- Telemetry 数字（FPS/frame time 等）

```js
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
// 或检查 URL 参数：const isDev = new URLSearchParams(location.search).has('dev');
```

保留（所有模式可见）：
- Live Causal Chain（工人决策摘要）
- AI Director 策略文本
- Colony Log（事件日志，对玩家有价值）

### Step 2a — `index.html`：New Map 确认

找到 `#overlayNewMapBtn`（或 "New Map" 按钮）的 click 处理器。在触发场景切换前加：
```js
if (!confirm('Start a new map? Current progress will be lost.')) return;
```
或用内联确认 UI（更美观但更复杂，优先用 `confirm()`）。

### Step 2b — `index.html`：防止游戏运行中的意外场景切换

检查是否有其他路径（除了 overlayHelpBtn，已在 Wave 1 修复）可以意外触发 `onReset`。审查 `GameStateOverlay.js` 中所有注册了 `onReset` 的位置。确保只有明确的用户操作能触发。

### Step 3 — `src/render/GameStateOverlay.js` 或 `index.html`：Run End 叙事问题

在 Run End 显示的 HTML 中，根据 `state.scenario?.id` 选择对应的叙事问题：
```js
const themeQuestions = {
  'alpha_broken_frontier': "Did the colony build what it set out to build?",
  'alpha_gate_bastion': "Who was the colony defending, in the end?",
  'alpha_island_relay': "Was isolation the enemy, or the shelter?",
  // ... 其他模板
};
const question = themeQuestions[state.scenario?.id] ?? "What was worth saving?";
```
渲染为一行斜体小字，出现在 Run End 画面底部：
```html
<p class="run-end-theme-question"><em>${question}</em></p>
```
CSS：`.run-end-theme-question { color: rgba(200,224,248,0.6); font-size: 12px; text-align: center; margin-top: 1rem; }`

## 4. 验证

- 非 dev 模式打开 DeveloperPanel → 看不到 Benchmark/Export/AI Prompt 区域
- 点击 "New Map" → 弹出确认对话框
- 殖民地崩溃 → Run End 显示场景专属叙事问题
- `node --test test/*.test.js` 全通过
