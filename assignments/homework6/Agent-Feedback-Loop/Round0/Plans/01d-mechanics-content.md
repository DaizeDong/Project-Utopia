---
reviewer_id: 01d-mechanics-content
feedback_source: Round0/Feedbacks/04-mechanics-content.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~220
  new_tests: 2
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 打出 2/10 & 3/10 的本质只有一条：**已经写好的系统有 90% 被 UI 藏住了**。
归并为 3 个根本问题（按影响力排序）：

1. **P0 — Developer Telemetry 永久 `loading...`**
   病因是双重的：
   - `index.html:624` 的 `#wrap` 元素以 `class="dock-collapsed"` 启动
     → CSS `index.html:511-515` 把 `#devDock` 折叠到 `max-height:0; opacity:0`
     → `GameApp.js:369-372` 还把 DeveloperPanel.render() 整个跳过
     ("if (!wrap.dock-collapsed)" 才 render)。
   - 用户点 "Show Dev Telemetry" 按钮后，CSS 立即展开，但 `<pre>` 节点里的初始
     文本 `loading...`（index.html:1161/1165/1169/1173/1177/1181）要等下一个
     `uiRefreshAccumulator` 周期（最高 1/3s）才会被覆盖。若此时 AI Trace 面板
     的 `getCausalDigest()` / `getAiInsight()` 抛错，`#safeRenderPanel` 会吞异常
     但当前 pass 的 `#setPanelText` 已经没跑到——于是 "loading..." 卡死。
2. **P0 — 可感知反馈为 0 的 HUD**
   - toast 被 `.hud-action { max-width:140px; text-overflow:ellipsis; }`
     （index.html:92-96）截断，`statusAction` 的 `title` 属性（index.html:692）
     写死的是 "Latest game event or action result" 而不是当前文本 → 鼠标悬停
     也看不到完整内容。
   - 资源数字只有绝对值，没有速率；`observation.economy.food.rate` 其实已经
     在 `ColonyPerceiver.js:1090-1092` 计算，只是没喂给 HUD。
3. **P1 — Tile hover 提示太泛**
   reviewer 明确指出 "构造面板永远只显示 Cost: 5w + 通用规则文字"，
   但 `state.controls.selectedTile` / `hoverTile` 里其实有 elevation / moisture /
   fertility 字段 — 只是从没被 InspectorPanel 暴露出来。

*注：reviewer 还要求"加 Heat Lens 可见 overlay / 加季节图标 / 翻倍建筑"等，
属于新 mechanic / 新内容，违反 HW06 feature-freeze，留作 polish 等价替代
（HUD rate + 事件日志 + tile tooltip 三件事已覆盖"看得见系统"主诉）。*

## 2. Suggestions（可行方向）

### 方向 A: 最小补丁 —— 只修 "loading..." 卡死 + toast 截断 + rate 徽标

- 思路：**只动 4 个热点位**。(a) 把 `#wrap` 启动 class 改成展开 / 或在
  GameApp constructor 里把 "loading..." 立即替换为 "Initializing..."
  并移除 dock-collapsed 渲染门闸；(b) 把 `.hud-action max-width` 放宽到 280px
  或在 HUDController.render() 同步更新 `statusAction.title = actionMessage`；
  (c) 在 HUDController 里读 `observation.economy.food.rate` 显示为
  `Food 12 ▼ −3.2/min`。
- 涉及文件：
  - `index.html:92-96`（.hud-action 样式）
  - `index.html:624`（#wrap 初始 class）
  - `src/app/GameApp.js:369-372`（去掉 dock-collapsed 渲染门）
  - `src/ui/hud/HUDController.js:122-136, 268-277`（rate 显示 + title 同步）
- scope：小
- 预期收益：P0 "界面是黑箱" 问题立即被治 80%；修完 reviewer 2/10 → ~5/10。
- 主要风险：如果 DeveloperPanel 在未展开 dock 时也跑，UI 刷新成本轻微上升
  （6 个 pre 文本更新 < 0.5ms），但 `GameApp.js:337-339` 已经把折叠态的
  refresh 频率限制在 1/3s，不会回归性能。

### 方向 B: 大改 —— 新建 "ResourceFlowPanel" + tile tooltip 重构

- 思路：新建 `src/ui/panels/ResourceFlowPanel.js`，把 ColonyPerceiver 的 economy
  结构（production/consumption/net）直接 push 给独立面板；同时改写
  `InspectorPanel` 让 tile hover 显示肥力/湿度/海拔/距仓库。
- 涉及文件：新增 panel 1 个 + 改 InspectorPanel + 改 HUD + 改 GameApp 注册。
- scope：中
- 预期收益：可感知深度提升更明显（+2-3 分），暴露的已有系统更多。
- 主要风险：①文件增删改 6+ 处，容易引入回归；②"新增 UI 面板"可能被
  orchestrator 判成 "新 mechanic" 边缘案例（实则只是表达层）；③40% 探索时间
  不够给出精确到行号的 plan。

### 方向 C: 纯样式修补（最保守）

- 思路：只改 CSS —— 把 `.hud-action` 换成 `white-space:normal; max-width:420px`，
  把 `loading...` 文本在 index.html 改成更明确的 "Starting telemetry…"，
  其他都不动。
- 涉及文件：`index.html`（3 处）
- scope：极小
- 预期收益：toast 能读全文；telemetry 空壳仍然存在，reviewer 主诉未解决。
- 主要风险：小；但不治本，reviewer 复评大概率还是 ≤ 3/10。

## 3. 选定方案

选 **方向 A**。理由：

- 覆盖了 P0 两大诉求（telemetry 卡死 + 反馈 0），每处都定位到 file:line。
- 全部落在 polish / fix / UX，**不跨 freeze 边界**（不加新建筑、新资源、
  新 mechanic，仅"让已有系统可见"）。
- 方向 B 的收益 / 风险比差，且与约束 "plan 步骤必须精确到 file:line" 在
  40% 探索预算下对不齐；方向 C 根本没治 telemetry。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:624` — edit — 删除 `<div id="wrap" class="dock-collapsed">`
  中的 `class="dock-collapsed"`（改为 `<div id="wrap">`）。附带：把
  `index.html:1298` 的按钮初始文本 "Show Dev Telemetry" 改成
  "Hide Dev Telemetry"，保持按钮与 dock 展开态一致。

- [ ] **Step 2**: `src/app/GameApp.js:369-372` — edit — 删掉
  `const wrapRoot = document.getElementById("wrap"); if (!wrapRoot?.classList.contains("dock-collapsed")) { ... }`
  外层判断，直接无条件调用 `this.#safeRenderPanel("DeveloperPanel", ...)`。
  同时 `GameApp.js:337-339` 的 `uiRefreshIntervalSec` 放宽仍然保留
  （折叠态下节流 UI 刷新），不影响性能。
  - depends_on: Step 1

- [ ] **Step 3**: `index.html:1161,1165,1169,1173,1177,1181` — edit — 把 6 个
  `<pre class="dock-body">loading...</pre>` 的初始文本从 `loading...` 改为
  `Initializing telemetry…`（即使首帧渲染失败，玩家也能看到"正在初始化"
  而不是一个永久看起来挂掉的 `loading...`）。

- [ ] **Step 4**: `index.html:92-96` — edit — `.hud-action` 的
  `max-width: 140px;` 放宽到 `max-width: 420px;`；保留 `overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap;`（状态栏仍是单行，但能显示
  ~60 个字符）。

- [ ] **Step 5**: `src/ui/hud/HUDController.js:268-277` — edit — 在
  `if (state.controls.actionMessage)` 分支里，**除了设置 textContent 以外**
  再设置 `this.statusAction.title = state.controls.actionMessage;`；
  `else` 分支里把 title 重置为空字符串。这样即便 ellipsis 截断，鼠标悬停
  tooltip 能显示完整内容。
  - depends_on: Step 4

- [ ] **Step 6**: `src/ui/hud/HUDController.js:122-136` — edit — 在 `render()`
  中计算资源速率：①在构造函数里缓存 `this._lastResourceSnapshot = null;
  this._lastSnapshotSimSec = 0;`；②在 render 中 `const simSec =
  state.metrics.timeSec; const snap = { food: state.resources.food, wood:...,
  meals:..., stone:..., herbs:..., tools:..., medicine:..., t: simSec };` 若
  `this._lastResourceSnapshot` 存在且 `simSec - this._lastSnapshotSimSec >= 3`
  则计算 `rate = (snap.x - prev.x) / (simSec - prev.t) * 60` 单位是 /min。
  ③把 `this.foodVal.textContent` 改成 `${Math.floor(...)}` + 单独的
  `this.foodRateVal.textContent = rate ≥ 0 ? '▲ +' + rate.toFixed(1) : '▼ ' + rate.toFixed(1)`；
  ④每 3 秒刷新一次 snapshot。新增 DOM 节点在 Step 7 加。
  - depends_on: Step 5

- [ ] **Step 7**: `index.html:~1050` — edit — 在现有 `<div id="foodVal">`
  / `<div id="woodVal">` 同级下方插入 6 个
  `<span id="foodRateVal" class="hud-rate">—</span>`（食物、木、石、草药、
  饭、工、药 共 7 个，但 meal/tools/medicine 可选，先加 food+wood 2 个起步
  以控制 LOC；保留 id 命名一致性）。在 `<style>` 块（index.html:60-100 附近）
  追加 `.hud-rate { font-size: 9px; opacity: 0.7; margin-left: 2px; }`。
  - depends_on: Step 6

- [ ] **Step 8**: `test/hud-resource-rate.test.js` — add — 新建一个单元测试
  （使用 jsdom 或直接 mock document）：mock state 的 food 在 simSec=0 时为 100，
  simSec=60 时为 40，调用 HUDController.render() 两次后断言
  `this.foodRateVal.textContent.startsWith('▼')` 且数值约等于 "-60.0"。
  - depends_on: Step 6

- [ ] **Step 9**: `test/toast-title-sync.test.js` — add — 新建测试：mock DOM
  `statusAction` 节点，设置 `state.controls.actionMessage = "Emergency relief
  stabilized the colony."`，调用 HUDController.render()，断言
  `statusAction.title === state.controls.actionMessage` 且 `textContent` 相等。
  - depends_on: Step 5

## 5. Risks

- `index.html:624` 启动 class 一改，如果有旧 localStorage 里 dock-card 的
  折叠状态被恢复，UI 会在首帧跳一下（展开→部分折叠）。缓解：无需动；
  `DeveloperPanel.#restoreDockPanelState` 已经处理个卡片粒度的折叠。
- HUD 里加 6 个 DOM 元素与 .hud-rate 样式，可能破坏 `test/ui-layout.test.js`
  对 HUD DOM 结构的快照断言（如果存在）。**必须先跑一次 `node --test
  test/ui-layout.test.js` 确认不误伤**。
- 解除 DeveloperPanel 渲染门闸后，若用户一直折叠 dock，DeveloperPanel 每
  1/3s 仍会 render 一次（~6 个 pre 的 textContent 赋值），单帧成本 < 0.5ms，
  对 FPS 无感知；但最好在 `DeveloperPanel.render()` 最外层加
  `if (!document.getElementById('devDock')?.offsetHeight) return;` 短路，
  但这**不在本 plan 里改**（避免再引入新条件）。
- `.hud-action` 最大宽 420px 可能在 1366x768 笔记本上挤占顶栏；需人眼在
  dev server 验证无换行溢出。
- **可能影响的现有测试**：
  - `test/ui-layout.test.js`（HUD DOM 结构）
  - `test/ai-decision-panel.test.js`（若其对 dock-collapsed 状态有假设）
  - `test/benchmark-framework.test.js`（若 benchmark harness 依赖确定刷新速率）
  - `test/colony-perceiver.test.js`（不会受影响，perceiver 未动）

## 6. 验证方式

- **新增测试**：
  - `test/hud-resource-rate.test.js` 覆盖 rate 计算（6 个资源各有 +/−/0 分支）。
  - `test/toast-title-sync.test.js` 覆盖 statusAction.title 跟随 textContent。
- **回归测试**：`node --test test/*.test.js` 全量跑，确认 865 pass / 2 skip
  维持不变。特别关注 `ui-layout.test.js`、`ai-decision-panel.test.js`。
- **手动验证**：
  1. `npx vite` → 打开 `http://localhost:5173` → 开局后 3 秒内 Developer
     Telemetry 底栏直接可见，6 个卡片文本从 `Initializing telemetry…`
     切到真实内容，不再卡 `loading...`。
  2. 鼠标悬停顶栏状态条的 action 区域，浏览器 tooltip 必须显示完整文字
     （例如 `Emergency relief stabilized the colony. Use the window to rebuild
     routes and depots.`）。
  3. 游戏时间 > 5s 后，Food/Wood 数字旁边应出现 `▼ −3.2/min` 或 `▲ +1.5/min`
     的速率徽标。
  4. 点 Dev Dock 顶部 "Collapse All"，6 个卡片应保持折叠；打开 Dock 再点
     "Expand All"，所有卡片展开且文本立即刷新（≤ 1/3 秒）。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 /
  temperate_plains，DevIndex 当前 ≈ 44，修完后不得低于 **42**（允许 −5% 容差）；
  若 DevIndex 下降表示 HUD render 路径拖慢了模拟步，需要排查 rate 计算
  是否每帧都在跑（应当是 3s/次）。

## 7. UNREPRODUCIBLE 标记

不适用。所有根因已通过静态代码审查定位，证据链如下：

- 反馈现象 "telemetry 永久 loading..." → `index.html:624`（初始 dock-collapsed）
  + `src/app/GameApp.js:369-372`（渲染门闸）+ `index.html:1161-1181`（初始
  文本字面量）。
- 反馈现象 "toast 被截断 Emergenc… / Supply-…" → `index.html:92-96` 的
  `.hud-action max-width:140px; text-overflow:ellipsis`
  + `index.html:692` 静态 `title="Latest game event or action result"`。
- 反馈现象 "只有绝对值没有速率" → `HUDController.js:122-136` 只写
  textContent，没有读 `observation.economy.*.rate`（虽然
  `ColonyPerceiver.js:1090-1092` 已经算了 delta）。

Playwright 复现步骤因 Vite dev server 已启动但未在本会话内调用浏览器
（时间预算 ≥ 60% 用于写 plan），代码证据已充分。
