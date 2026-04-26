---
reviewer_id: 01c-ui
round: 7
version: 2
date: 2026-04-26
priority: P1
covers_all_feedback: true
---

# Plan v2: 01c-ui — HUD 信息架构修复 + 响应式布局

## 1. 根本问题（顶层分析）

### 根因 A — HUD 二级指标（Meals/Tools/Medicine/Prosperity/Threat）无标签

**代码路径**：`index.html` → HUD DOM 结构

**缺陷**：这五个指标的 HTML 元素只有 `<span id="statusMeals">` 数字节点，无任何文字标签。根因是 HUD 左侧（Food/Wood 等）使用了完整的 `icon + label + value` 结构，而右侧二级指标在初期开发时省略了 label。不是设计失误而是完成度问题。

**修复方向**：在每个二级指标的父容器内加入 `<span class="hud-label-sm">` 文字标签，使信息可读。

### 根因 B — HUD 使用固定宽度布局，1280px 下右侧组溢出

**代码路径**：`index.html` CSS → `.status-bar` 布局规则

**缺陷**：status-bar 使用 `display: flex` 但未设置 `flex-wrap` 或优先级。当窗口 <1300px 时，右侧的 Survived 时间和 Autopilot 状态被挤出可视区。这些恰好是最关键的状态指示。

**修复方向**：让 Survived/Autopilot 组有 `flex-shrink: 0`（不压缩），让中间的场景名字组有 `flex-shrink: 1; overflow: hidden`（可压缩截断）。

### 根因 C — 侧边栏硬编码固定宽度，< 1024px 时整体消失

**代码路径**：`index.html` CSS → `.sidebar` 规则

**缺陷**：侧边栏是固定宽度的绝对定位浮层，小于 1024px 时被裁切而非自适应。

**修复方向**：< 1024px 时将侧边栏改为底部工具条（`position: fixed; bottom: 0; left: 0; width: 100%`），标签横排。

### 根因 D — 里程碑 toast 宽度无上限，占屏 40%

**代码路径**：`index.html` CSS → `.milestone-toast`（或相关 class）

**修复方向**：`max-width: 320px; right: 1rem; top: 4rem;`，改为右上角滑入式。

### 根因 E — Space 键绑定到全局 `document`，未检查游戏状态

**代码路径**：`index.html` → keydown event handler（搜索 `event.code === 'Space'`）

**修复方向**：在 Space 触发暂停/菜单之前，检查 `state.phase !== 'playing'` 则 return，防止游戏中误触菜单。

## 2. 完整 Feedback 覆盖

| 01c 反馈 | 覆盖 step |
|----------|-----------|
| Meals/Tools/Medicine/Prosperity/Threat 无标签 | Step 1 |
| 1280px HUD 右侧溢出 | Step 2 |
| 1024px 侧边栏消失 | Step 3 |
| 1920px 主菜单孤立漂浮 | Step 4 |
| 里程碑 toast 遮挡 40% | Step 5 |
| Space 键意外触发菜单返回 | Step 6 |
| Entity Focus 面板遮挡 25% 地图 | Step 7 |
| 侧边栏标签文字 90° 旋转难读 | Step 8 |
| Tooltip 无触发线索 | Step 9 |
| Threat 无颜色警示 | Step 10 |

## 3. 实施步骤

### Step 1 — `index.html`：HUD 二级指标补标签
在 Meals/Tools/Medicine/Prosperity/Threat 各自的父元素内，在数字 span 前加：
```html
<span class="hud-label-sm">Meals</span>
<span class="hud-label-sm">Tools</span>
<span class="hud-label-sm">Med</span>
<span class="hud-label-sm">Prosp</span>
<span class="hud-label-sm">Threat</span>
```
CSS：`.hud-label-sm { font-size: 9px; color: rgba(200,224,248,0.6); margin-right: 2px; }`

### Step 2 — `index.html` CSS：HUD overflow 修复
`.status-bar-right { flex-shrink: 0; }` （Survived + Autopilot 不被压缩）
`.status-bar-center { flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`

### Step 3 — `index.html` CSS：1024px 响应式
```css
@media (max-width: 1024px) {
  .sidebar { position: fixed; bottom: 0; left: 0; right: 0; height: auto;
    flex-direction: row; width: 100%; z-index: 200; }
  .sidebar-tabs { flex-direction: row; width: 100%; }
  .sidebar-tab { writing-mode: horizontal-tb; width: auto; padding: 6px 12px; }
  .main-canvas-area { padding-bottom: 50px; }
}
```

### Step 4 — `index.html` CSS：主菜单居中拉伸
`.overlay-menu-panel { width: min(90vw, 600px); margin: auto; }`

### Step 5 — `index.html` CSS：里程碑 toast 右上角小尺寸
搜索 milestone toast 相关 class（`milestone-toast` 或 `big-toast`），改为：
`max-width: 320px; position: fixed; top: 4rem; right: 1rem; left: auto; width: auto;`
保留动画效果，仅改位置和尺寸。

### Step 6 — `index.html` JS：Space 键添加游戏状态检查
找到 `document.addEventListener('keydown', ...)` 中处理 `Space` 的分支，添加：
```js
if (e.code === 'Space') {
  if (window.__gameState?.phase === 'playing') { togglePause(); e.preventDefault(); return; }
  // 仅在非 playing 状态才触发其他行为
}
```

### Step 7 — `index.html` CSS：Entity Focus 面板高度限制
`.entity-focus-panel { max-height: 35vh; overflow-y: auto; }` （当前可能更高）

### Step 8 — `index.html` CSS：侧边栏标签改为横排文字
```css
.sidebar-tab { writing-mode: horizontal-tb; transform: none; height: auto; padding: 8px 4px; font-size: 10px; }
```
若空间不足，显示图标+简写（"Build", "Colony", "Set", "Heat", "Terr", "Help"）。

### Step 9 — `index.html` CSS：Tooltip 触发线索
```css
[data-tip] { border-bottom: 1px dashed rgba(200,224,248,0.4); cursor: help; }
```
让有 tooltip 的元素有虚线下划线，告诉玩家可以悬停。

### Step 10 — `src/ui/hud/HUDController.js:render()`
读取 `state.metrics.threat`（或对应路径），当值 > 30 给 `#statusThreat` 加 `warn-soon` class，> 50 时加 `warn-critical` class。使用已有 CSS 样式。

## 4. 验证

- 在 1280px 宽度下，Survived 时间和 Autopilot 状态可见
- 在 1024px 宽度下，侧边栏底部可用
- Meals/Tools/Medicine/Prosperity/Threat 有文字标签
- 里程碑 toast 不超过 320px 宽
- Space 键在游戏中只暂停，不触发菜单
- `node --test test/*.test.js` 全通过
