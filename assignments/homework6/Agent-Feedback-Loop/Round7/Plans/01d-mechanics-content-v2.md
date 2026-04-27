---
reviewer_id: 01d-mechanics-content
round: 7
version: 2
date: 2026-04-26
priority: P1
covers_all_feedback: true
note: 内容丰富度（建筑/事件种类）受 freeze 限制，无法新增建筑；修复方向为提升现有系统的可见性
---

# Plan v2: 01d-mechanics-content — 天气可见化 + Run End 诊断 + 事件演出

## 1. 根本问题（顶层分析）

### 根因 A — 天气系统改变游戏参数但 SceneRenderer 无任何视觉响应

`WeatherSystem` 更新 `state.weather.type` 和路径成本乘数，但 `SceneRenderer` 从不读取 `state.weather` 来改变渲染。天气是完全隐形的后台数字。

**顶层修复**：在 SceneRenderer 的 `render()` 或 `updateTerrain()` 中，检查 `state.weather.type === 'rain'`，触发轻量雨效（粒子 + 地形色调变暗），让玩家在主地图感知天气。

### 根因 B — Run End 屏幕只显示"Run Ended"，无诊断

`GameStateOverlay.showRunEnd()` 目前只显示标题和重启按钮。`state.gameplay.deathLog`、`state.metrics` 均存有完整数据但未被展示。

**顶层修复**：扩展 `showRunEnd()` 读取 `deathLog`、`timeSec`、`devIndex`、`deaths` 等数据，生成死亡原因摘要。

### 根因 C — 动态事件（袭击、商队）只改数字，不在主地图显示

EventDirector 触发事件，但主地图没有任何图标或浮标。玩家只能在 Debug 面板看到。

**顶层修复**：在事件触发时，向 `state.gameplay.mapMarkers`（新建数组）推送一个临时标记对象，SceneRenderer 在该 tile 上方渲染浮动图标（简单 Three.js Sprite），8s 后自动移除。

### 根因 D — 土壤盐碱化无主动预警，需玩家主动按 T 检查

`SalinizationSystem` 更新 `state.grid.soilSalinization[][]` 但不向任何玩家可见系统推送警告。

**顶层修复**：当某个 Farm tile 的 salinization > 0.7 threshold 时，向 `state.gameplay.objectiveLog` 推送一条预警（和 02a 的 fire 警告同样机制），让玩家不需要按 T 就能发现。

## 2. 完整 Feedback 覆盖

| 01d 反馈 | 覆盖 step |
|----------|-----------|
| 天气无视觉效果，路径成本不可感知 | Step 1 |
| Run End 无死因分析 | Step 2 |
| 事件（袭击/商队）无地图图标/声音 | Step 3 |
| 土壤盐碱化无主动预警 | Step 4 |
| 供应链中断无主动告警 | Step 5（已有 "input starved" 标签，提升显著度）|
| Logistics Legend 8 色无解释 | Step 6 |
| 内容量（建筑/资源）偏少 | 受 freeze 限制，无法添加新建筑，记录为 Deferred |

## 3. 实施步骤

### Step 1 — `src/render/SceneRenderer.js`：雨效视觉

在 `render(state)` 或 `updateScene(state)` 中：
```js
const isRaining = state.weather?.type === 'rain';
if (isRaining !== this._wasRaining) {
  this._wasRaining = isRaining;
  this._setRainEffect(isRaining);
}
```

`_setRainEffect(on)` 的实现：
- 若 on：创建 `THREE.Points` 粒子系统（~200 个半透明蓝白点，向下运动），将地形 mesh 的 `material.color` 乘以 0.85（略微变暗）
- 若 off：移除粒子系统，恢复地形颜色

保持轻量：粒子数 < 300，几何体使用 `BufferGeometry`。

### Step 2 — `src/render/GameStateOverlay.js`（或 `index.html` run-end 区域）：Run End 摘要

在 `showRunEnd(state)` 或等价函数中，构建摘要文本：
```js
const topDeathCause = getMostCommonDeathCause(state.gameplay.deathLog);
const daysSurvived = Math.floor(state.metrics.timeSec / 60);
const born = state.metrics.totalBirths ?? 0;
const died = state.metrics.totalDeaths ?? 0;
const devIdx = Math.round(state.metrics.devIndex ?? 0);
```

渲染：
```html
<div class="run-end-summary">
  <h3>Colony Chronicle</h3>
  <p>Day ${daysSurvived} · ${born} born · ${died} fallen</p>
  <p>Dev Index: ${devIdx}/100</p>
  <p>Most workers died of: <strong>${topDeathCause}</strong></p>
  <p class="run-end-last-death">${lastDeathName} was the last to fall.</p>
</div>
```

### Step 3 — 事件地图标记系统

**Step 3a** — `src/world/events/WorldEventSystem.js` 或 `EventDirector.js`：
当 RAID、TRADE_CARAVAN、WAREHOUSE_FIRE 触发时，向 `state.gameplay.mapMarkers` 推送：
```js
if (!Array.isArray(state.gameplay.mapMarkers)) state.gameplay.mapMarkers = [];
state.gameplay.mapMarkers.push({ ix, iz, icon: '⚔️', expiresAt: nowSec + 8, type: 'raid' });
// 或 '🛒' for trade, '🔥' for fire
```

**Step 3b** — `src/render/SceneRenderer.js`：
在 `render(state)` 中，遍历 `state.gameplay.mapMarkers`，对每个未过期的 marker 在 `(ix, iz)` tile 上方用 `CSS2DObject` 或简单 `THREE.Sprite` 渲染图标。过期的移除。

### Step 4 — `src/simulation/terrain/SalinizationSystem.js`：盐碱化预警

在 salinization 更新逻辑中，当某 Farm tile 的 salinization > 0.7 时（且上次警告该 tile 距今 > 120s），向 `state.gameplay.objectiveLog` 推送：
`"[${nowSec.toFixed(0)}s] Farm at (${ix},${iz}) soil salinization critical — consider fallowing"`

使用和 Step 5/02a 相同的 dedup + unshift + slice(0,24) 模式。

### Step 5 — `index.html`（Heat Lens 按钮区域）：Logistics Legend 悬停解释

在 Heat Lens 按钮旁，或在 Heat Lens 激活时显示的图例 div 上，添加详细 tooltip：
```html
<span data-tip="🔴 input starved | 🔵 output blocked | 🟠 route broken | 🟡 low stock | 🟣 salinization | 🟢 healthy | ⬜ idle">?</span>
```

## 4. 验证

- 切换到有雨天气的场景（或 DevPanel 强制 rain）→ 地图有粒子雨效 + 略微变暗
- 等待殖民地崩溃 → Run End 显示日期/生死数/死因/最后死亡工人
- 触发 Raid 事件（或等待）→ 目标 tile 上方出现 ⚔️ 图标，8s 消失
- Farm tile salinization > 0.7 → objectiveLog 出现预警（EventPanel 可见）
- Heat Lens 悬停 → tooltip 解释 8 种颜色
- `node --test test/*.test.js` 全通过
