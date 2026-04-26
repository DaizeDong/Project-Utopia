---
reviewer_id: 02b-casual
round: 7
build_commit: f0bc153
freeze_policy: lifted
---

# Round 7 Enhancement Plan — 02b-casual (Casual Player Onboarding)

## 1. Core Problems (休闲玩家视角)

### Problem 1: 零引导入场 — 游戏直接开跑，玩家完全不知道"我现在该干什么"
玩家打开游戏，没有标题画面，没有任何"点这里"的引导箭头，直接面对一堆跑动的小白点和密密麻麻的数字面板。Feedback 明确记录了 0-5 分钟内的心情是"困惑 / 焦虑 / 想关掉"。根本原因：菜单 overlay 上的 `overlayHelpBtn`（"How to Play"）已经正确接入 `openHelp()`（`index.html:2757`），但按钮视觉权重和排布没有把它推到玩家的第一注意力落点；同时 Help Modal 虽然内容完整，但打开后默认显示的是 "Resource Chain" 页面，缺乏一个"第一步做什么"的单句行动指引。

### Problem 2: "Help" / "How to Play" 按钮的行为让人迷失，地图莫名其妙切换
玩家点了游戏中的 `? Help` 按钮（`#helpBtn`，`BuildToolbar.js:2588`），弹出的是 Build Tools 面板而不是 Help Modal——这与按钮标签完全不符。玩家随后点了菜单上的 "How to Play" 按钮（`#overlayHelpBtn`），期望看到教程，结果游戏地图被切换了（实际上是误触了 "New Map"——两个按钮 `overlayHelpBtn` / `overlayResetFromMenuBtn` 在 `index.html:2018-2019` 中紧排，没有明显的视觉分隔）。地图连续切换 4 次极大地破坏了"我在哪里""我的进度去哪了"的空间感。

### Problem 3: 信息密度压制成就感——资源面板数字过多，危机信号被淹没
Feedback 第 3 大困惑点："数字太多，不知道哪个最紧急"。Food: -265/min 和 STABLE 标签并存时玩家不知道哪个可信。现有的 `getNextActionAdvice`（`src/ui/hud/nextActionAdvisor.js`）和 `runout-hint` 逻辑（`HUDController.js:1707-1723`）已经计算了 top 问题和预计清空时间，但这些信号藏在侧边栏或小字提示里，不在玩家视线第一落点。

---

## 2. 代码定位

| 问题 | 关键文件 | 关键行/区域 |
|---|---|---|
| Help Modal 内容与"第一步"行动指引 | `index.html` | L2640–2710（help-body 内容区）|
| "? Help" 按钮行为 (BuildToolbar sidebar) | `index.html` | L2588 `#helpBtn`；L2756 事件绑定 |
| "How to Play" vs "New Map" 按钮紧排 | `index.html` | L2017–2019 overlayMenuPanel 按钮组 |
| Next Action Advisor | `src/ui/hud/nextActionAdvisor.js` | `getNextActionAdvice()` 返回值 |
| HUD "runout" 倒计时 | `src/ui/hud/HUDController.js` | L1707–1723 |
| 菜单 overlay 按钮布局 | `index.html` | L2010–2025（overlayMenuPanel 操作区）|
| Autopilot 状态文案 | `src/ui/hud/autopilotStatus.js` | `getAutopilotStatus()` casualBaseText |
| Resource rate 标签 | `src/ui/hud/HUDController.js` | L708–725 |

---

## 3. 复现说明

> 开发服务器（`npx vite`）在本次分析运行时不可用，浏览器实例无法连接。以下复现基于 Feedback 原文记录 + 代码静态分析完成。

**已确认的行为（代码级）：**

1. **"? Help" 按钮开出 Build Tools 面板**：`index.html:2588` 中 `#helpBtn` 位于 `BuildToolbar` 区域内；其 `click` 监听（`index.html:2756`）调用 `openHelp()` 打开 Help Modal。Feedback 描述的"开出 Build Tools 面板"可能是因为玩家点击了侧边栏的 Build 标签切换（`BuildToolbar.js` 内的 panel-tab 点击逻辑），而非直接点了 `#helpBtn`。

2. **"How to Play" 误触 "New Map"**：`index.html:2018-2019` 两个按钮在同一行（`overlayHelpBtn` / `overlayResetFromMenuBtn`），后者调用 `onReset`，触发地图重新生成——与 Feedback 描述的"点 How to Play 然后地图换了"完全吻合。

3. **"sampling…" 字符串**：`HUDController.js:1692` 在 `_lastComputedRates` 尚未 ready（前 3 秒内）时显示 `(sampling…)`——这是纯技术调试用语，对新手毫无意义。

4. **资源面板 STABLE + 红色倒计时并存**：`STABLE` 来自 `session.phase`，而 `runout-hint` 来自 `metrics.resourceEmptySec`——两者不互相感知，导致信息矛盾。

---

## 4. Suggestions（≥2 条）

### Suggestion A：在 Help Modal 的 Controls 页面顶部加一段"第一步行动卡"（3 行最多）
**目标**：让点了 Help 的玩家立刻看到"我现在应该做 1 件事"的单句指令，而不是被快捷键列表淹没。

- 在 `index.html` Help Modal 的 `controls` 页面顶部（`L2657` 之前）插入一个 `<div class="help-quickstart-card">` 元素，内容三行：
  1. "1. Click Farm in the Build panel → left-click any green grass tile to place it."
  2. "2. Click Warehouse → place it near your farm."
  3. "3. Press Space to pause any time. Press F1 to reopen this guide."
- 保持为纯 HTML，无需改 JS。实现代价极小（<10 行 HTML + <5 行 CSS），对已有玩家无负面影响。

### Suggestion B：把菜单 overlay 的 "How to Play" 按钮与 "New Map" / "Start Colony" 视觉分离，消除误触
**目标**：让休闲玩家不会误触 "New Map" 导致地图换掉。

- 在 `index.html:2017-2019` 中，把 `overlayHelpBtn`（"How to Play"）移到按钮组的下方单独一行，或加一个 `<hr>` / 间距 `margin-top` 分隔，并把按钮样式从普通 secondary 改为 ghost/text-only（`class="text-link"`），让它在视觉上不与 "Start Colony" 并列为操作按钮，而是成为一个"了解更多"的安静链接。
- 同时把菜单 overlay 上的 `How to Play` 按钮文字改为 `? How to Play`，与 `? Help` 统一——减少品牌混乱。

### Suggestion C：把 "(sampling…)" 替换为用户友好的占位文案，消除技术噪音
**目标**：第一次看到 HUD 的玩家不会对 "sampling…" 感到困惑。

- `HUDController.js:1692`：把 `"(sampling…)"` 改为 `"…"` 或直接不显示（空字符串 `""`）。这是 1 行改动，零风险。

### Suggestion D（主选）：在 HUD 顶部 status bar 增加一个"当前最紧迫问题"单行 Banner，把 nextActionAdvice 从侧边栏提升到第一视线
**目标**：让休闲玩家在任何时刻都能看到"现在最重要的 1 件事"，解决 Feedback 核心抱怨"不知道当前最紧急的是什么"。

- `getNextActionAdvice`（`nextActionAdvisor.js`）已经计算好了优先级最高的一件事（critical → high → normal → done）。
- 在 `index.html` 的 `#statusBar` 内（或其正下方）增加一个 `#nextActionBanner` span，仅在 `priority === "critical"` 或 `"high"` 时显示，文本 = `advice.label + ": " + advice.detail`（已有字段），`priority === "done"` 时隐藏。
- `HUDController.js` 的 `render()` 末尾加一个 `#renderNextActionBanner()` 私有方法，逻辑约 15 行。
- CSS 样式：背景 `#fef3cd`（warn-yellow），文字 `#856404`，左侧 `3px solid #f0ad4e`，字号与 HUD chip 相同（12px）。`priority === "critical"` 时背景改 `#f8d7da` 红色。

---

## 5. 选定方案

**主线：Suggestion D + B + C 联合落地**

- **Suggestion D**（nextActionBanner）解决 Problem 3（核心：不知道该干什么）
- **Suggestion B**（按钮分离）解决 Problem 2（地图意外切换、Help 误触）
- **Suggestion C**（sampling 文案）是 1 行零风险改动，顺手做掉

Suggestion A（Help Modal 快捷卡）作为可选附加步骤（Step 8），如果前三条改动后仍然在 Help 引导上有不足，单独追加。

**不做的**：为休闲玩家增加"强制新手教程 overlay"（引导走步骤的箭头 overlay），这属于范围过大的架构改动，不在本计划范围内。

---

## 6. Plan 步骤（6 步）

### Step 1：修复 "How to Play" / "New Map" 按钮视觉分离

**文件**：`index.html`，约 L2015-2025（`overlayMenuPanel` 操作区）

**修改**：
1. 把 `#overlayHelpBtn`（`How to Play`）从主按钮行中移出，单独放在按钮行下方的一个 `<p class="overlay-help-link">` 元素内。
2. 将按钮文字从 `"How to Play"` 改为 `"? How to Play"` 与侧边栏 `? Help` 统一。
3. 在 `overlay-menu-actions` 区域的 CSS 中（`index.html` inline style 或 `.overlay-panel` CSS block）为 `.overlay-help-link` 添加 `margin-top: 8px; text-align: center;`，按钮改为 `background: none; border: none; color: var(--muted); text-decoration: underline; cursor: pointer; font-size: 12px;`。

**验证**：菜单画面中 "Start Colony" 和 "New Map" 两个主按钮独立一行；"? How to Play" 安静地显示在其下方，误触概率极低。

---

### Step 2：把 "(sampling…)" 替换为安静占位符

**文件**：`src/ui/hud/HUDController.js`，L1692

**修改**：
```js
// Before:
node.textContent = parts.length > 0 ? `(${parts.join(" / ")})` : "(sampling…)";
// After:
node.textContent = parts.length > 0 ? `(${parts.join(" / ")})` : "";
```

**验证**：`node --test test/*.test.js` 全通过（此处仅改显示文案，无逻辑变更）。

---

### Step 3：在 `index.html` `#statusBar` 内增加 `#nextActionBanner` DOM 节点

**文件**：`index.html`，在 `#statusBar` 关闭标签（`</div>`）前插入：

```html
<!-- Round-7 02b-casual: next-action banner for casual onboarding -->
<div id="nextActionBanner" hidden
     style="width:100%;padding:2px 8px;font-size:12px;border-left:3px solid #f0ad4e;background:#fef3cd;color:#856404;display:none;"
     aria-live="polite">
</div>
```

CSS（同文件 inline style 块内追加）：
```css
#nextActionBanner[data-priority="critical"] {
  background: #f8d7da;
  border-left-color: #dc3545;
  color: #721c24;
}
#nextActionBanner:not([hidden]) { display: block !important; }
```

---

### Step 4：在 `HUDController.js` 中增加 `#renderNextActionBanner()` 方法并在 `render()` 末尾调用

**文件**：`src/ui/hud/HUDController.js`

**构造函数**（`constructor` 内已有的 DOM refs 区域末尾）追加：
```js
this.nextActionBanner = document.getElementById("nextActionBanner");
```

**新增私有方法**（`render()` 之前）：
```js
#renderNextActionBanner(state) {
  const el = this.nextActionBanner;
  if (!el) return;
  const advice = getNextActionAdvice(state);
  const show = advice.priority === "critical" || advice.priority === "high";
  if (!show) {
    el.hidden = true;
    el.style.display = "none";
    return;
  }
  const text = advice.label + (advice.detail ? ": " + advice.detail : "");
  if (el.textContent !== text) el.textContent = text;
  el.setAttribute("data-priority", advice.priority);
  el.hidden = false;
  el.style.display = "block";
}
```

**在 `render()` 末尾**（现有 `renderStorytellerStrip` 调用之后）追加：
```js
this.#renderNextActionBanner(state);
```

---

### Step 5：调整 STABLE 标签与 runout-hint 的共存逻辑（避免信息矛盾）

**文件**：`src/ui/hud/HUDController.js`，查找 `runout-hint` 相关渲染逻辑（L1707-1723 附近）

**分析**：`runout-hint` 显示"≈ 1m 2s until empty"，但 `STABLE` 状态标签来自 session.phase。两者并存导致玩家困惑。

**修改**：在渲染 `runout-hint warn-critical`（`smoothed < 60`，即不到 1 分钟）时，如果 `statusObjective` 或 `statusScenarioHeadline` 节点存在，额外检查 `state.session?.phase`。若 phase 为 `"active"` 且 `emptySec.food < 90`（1.5 分钟内），把状态文本从 "STABLE" 改为 "FOOD LOW"：

在 `HUDController.js` 的 `#renderColonyStatus` 或等效方法中（通过 `grep -n "STABLE" src/ui/hud/HUDController.js` 定位具体行号），找到渲染 "STABLE" 的条件分支，增加一个优先判断：

```js
// 在已有的 STABLE 渲染分支之前插入：
const foodEmptySec = Number(state.metrics?.resourceEmptySec?.food ?? 0);
if (foodEmptySec > 0 && foodEmptySec < 90) {
  // Override STABLE with FOOD LOW so casual players see one consistent signal
  colonyStatusLabel = "FOOD LOW";
  colonyStatusClass = "status-warn";
}
```

---

### Step 6：在 Help Modal 的 "Controls" 页面顶部插入 3 行快捷起步卡

**文件**：`index.html`，L2657 之前（Controls `<section>` 内，`<h3>Basic Controls</h3>` 之前）

**插入 HTML**：
```html
<div class="help-quickstart-card" style="background:#e8f5e9;border-left:3px solid #4caf50;padding:8px 12px;margin-bottom:12px;border-radius:3px;">
  <strong>First 3 things to do:</strong>
  <ol style="margin:4px 0 0 16px;padding:0;">
    <li>Select <b>Farm</b> in the Build panel &rarr; left-click any green grass tile to place it.</li>
    <li>Select <b>Warehouse</b> &rarr; place it near your farm to store food.</li>
    <li>Press <b>Space</b> to pause at any time &middot; <b>F1</b> to reopen this guide.</li>
  </ol>
</div>
```

---

## 7. Risks & 验证

### Risks

| 风险 | 概率 | 严重性 | 缓解措施 |
|---|---|---|---|
| `#nextActionBanner` 在 `statusBar` 宽度不足时折行，挤压其他 KPI chip | 中 | 低 | 给 `#nextActionBanner` 加 `flex-basis: 100%`，使其在 flex-wrap 布局中独占一行；或用 `position: absolute; bottom: -24px` 悬挂在 statusBar 下方 |
| `getNextActionAdvice` 在 `scenario phase != active` 时返回 `priority: "idle"`，banner 正确隐藏（已有保护逻辑） | 低 | 无 | — |
| Step 5（STABLE → FOOD LOW 覆盖）与 sessionPhase 渲染调用时序冲突 | 低 | 低 | 只在 `state.session?.phase === "active"` 下激活；菜单/end phase 不受影响 |
| "? How to Play" 按钮移位后，现有快照测试对 overlay DOM 结构有断言 | 低 | 低 | grep 检查 `test/` 中是否有断言 `overlayHelpBtn` 位置的测试；若有，更新 fixture |
| `HUDController` 新增方法后单测 require 额外 mock | 低 | 无 | `document.getElementById` 返回 null 时方法立即 return，无 DOM 依赖 |

### 验证 Checklist

1. `node --test test/*.test.js` — 全部 865 tests 通过，0 新失败。
2. 菜单画面手动测试：点 "? How to Play" 开 Help Modal，不触发地图重置。
3. 游戏进行中：食物 < 90s 时 `#nextActionBanner` 出现并显示 "Recover food now: ..." 文本。
4. 食物充足时 `#nextActionBanner` 隐藏（`hidden` 属性存在）。
5. `(sampling…)` 字符串不再出现在资源面板（游戏开始后 3 秒内检查）。
6. Help Modal 打开时 Controls 页面顶部显示绿色起步卡，内容 3 条。
7. 食物紧缺（emptySec < 90）时，status bar 显示 "FOOD LOW" 而非 "STABLE"。
8. 不引入新的 `eslint` 警告（`src/ui/` 文件夹）。
