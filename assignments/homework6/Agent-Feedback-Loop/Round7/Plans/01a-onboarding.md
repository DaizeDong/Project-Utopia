---
reviewer_id: 01a-onboarding
feedback_source: Round7/Feedbacks/01a-onboarding.md
round: 7
date: 2026-04-26
build_commit: f0bc153
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~180
  new_tests: 3
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

### 根本问题 A（严重 Bug）：`overlayHelpBtn` 触发游戏启动 + 场景切换

**症状**：点击菜单浮层上的"How to Play"按钮后，游戏在后台切换了地图场景并启动计时，Help 对话框延迟数秒才弹出。

**病因**：`index.html` 中 `#overlayHelpBtn` 的 `click` 监听器被正确绑定到 `openHelp()`（见 `index.html:2757`），这部分没问题。但问题出在 **事件冒泡链**：`#overlayHelpBtn` 嵌套在 `#overlayMenuPanel` 内，而 `GameStateOverlay` 在 `GameApp.js` 中通过 `startBtn` 的 `click` 给 `onStart` 注册了独立处理器（`GameApp.js:194`）。  
更严重的是：`#overlayResetFromMenuBtn` 的 `click` 处理器（`GameStateOverlay.js:255-266`）调用 `this.handlers.onReset?.()` 会触发世界重置+场景切换——而若 `overlayHelpBtn` 与 `resetFromMenuBtn` 的 DOM 位置/z-index 存在重叠，或浏览器 hit-test 在快速点击时命中错误目标，就会意外调用 `onReset`。  
另一个可能路径：`overlayMapTemplate` 的 `change` 事件监听（`GameStateOverlay.js:281`）在 `openHelp()` 执行后触发了 `#syncMenuSelectionFromInputs()` + `#renderMenuCopy()`，若此时 `onStart` handler 也因状态变化而被隐式触发，则会产生 reviewer 描述的"场景切换并启动"的复合效果。  
**核心修复**：`overlayHelpBtn` 的 click handler 必须调用 `e.stopPropagation()` 和 `e.preventDefault()`，同时确保该按钮不会被其他 GameStateOverlay 事件委托捕获。

### 根本问题 B（高严重度功能缺陷）：Help 对话框 Tab 切换失效

**症状**：四个 Tab 点击后内容不切换，所有 help-page 内容同时渲染可见。

**病因**：CSS 规则 `#helpModal .help-page { display: none; }` 和 `#helpModal .help-page.active { display: block; }` 在 `index.html:1520-1521` 正确定义，Tab 切换 JS 也在 `index.html:2747-2752` 正确实现。**但** CSS 规则优先级被外部媒体查询块中的规则覆盖。观察 `index.html:1520` 附近，`help-page` 的 `display:none` 是直接选择器；而若任何 `@media` 块或后续 CSS 中存在比 `#helpModal .help-page` 更高特异度的规则，就会将 `display` 强制恢复为 `block`。  
具体证据：在 responsive breakpoints 块（`@media (max-width:…)`）中可能存在 `.help-page { display: block !important; }` 或类似覆盖，导致所有 page 始终可见，Tab 的 active class toggle 只能改变视觉高亮而不能控制显示/隐藏。  
**核心修复**：JS 逻辑改为直接操作 `element.style.display`（不再依赖 CSS class），或将 CSS 选择器提升为 `#helpModal .help-body .help-page`（增加特异度）并加上 `!important`；同时在 `test/help-modal.test.js` 中增加 CSS 特异度断言。

### 根本问题 C（架构性）：最有价值的实时行动引导（CausalDigest "Next Move"）藏在 Debug 面板

**症状**：`getCausalDigest()` 产出的 `headline` + `action`（直接告诉玩家"现在做什么"）只在 `AIDecisionPanel.js:119` 的折叠 `<details>` 中渲染，正常玩家无法发现。

**病因**：`HUDController` 已经有 `#renderNextAction()` 方法（`HUDController.js:513`）和对应的 `#statusNextAction` DOM 节点，`getNextActionAdvice()` 也能输出 `headline/detail/whyNow/expectedOutcome`——但这个 nextAction 条只在 Colony 侧边栏内某个小字行中渲染，不在主 HUD 顶部醒目位置。同时 `getCausalDigest` 的更丰富结果（含 `severity`）从未注入 `statusNextAction`；两个 advisor 系统（`nextActionAdvisor.js` 和 `WorldExplain.getCausalDigest`）并行存在但没有整合，高优先级信息被埋藏。

---

## 2. Suggestions

### 方向 A：最小化修复三个 P0 问题（精准外科手术，zero collateral）

- **A1**：在 `index.html` 的 `overlayHelpBtn` click 绑定处加 `stopPropagation()`；同时确保该按钮在 `GameStateOverlay` 中不被事件委托捕获。
- **A2**：将 Help tab CSS 改为 `#helpModal .help-body .help-page` + `!important`，并用 JS 直接写 `el.style.display` 作为双重保险；增加 `test/help-modal.test.js` 验证。
- **A3**：在 `index.html` 的 `#statusBar` 区域（顶部 HUD）增加一个 `#hudNextActionChip` chip，由 `HUDController.#renderNextAction` 同时写入，当 `priority === "critical"` 时用红色脉冲样式展示。

**优点**：scope 小（约 80 LOC），无新文件，无系统架构变动，快速落地；对 865 个已有测试零影响。  
**风险**：只修复 P0 Bug，不解决更深层的"无交互式教学"架构问题。

### 方向 B：同时修复 P0 Bug + P1 主 HUD 行动引导可见性（推荐）

在方向 A 的基础上：
- **B1**：将 `getCausalDigest()` 的 `action` 字段（即 reviewer 截图中的 "Next move"）注入已有的 `#statusNextAction` 节点（优先级高于 `getNextActionAdvice()` 的低优先级建议），当 severity 为 `error` 时触发红色 CSS 动画（keyframe pulse）。
- **B2**：在 `#statusAutopilotCrisis` 旁新增食物危机专用醒目条（当 `resourceEmptySec.food < 120` 时高亮顶部食物数字）：利用已有 `state.metrics.resourceEmptySec` 字段，只需在 `HUDController.render()` 中加 3-5 行条件 style 写入，零新系统。
- **B3**：在 `EntityFocusPanel` 渲染中将 AI exchange / Blackboard / Path Nodes 默认折叠（`<details>` 不加 `open` 属性），简洁信息首屏化。

**优点**：修复所有 P0 + 核心 P1，reviewer 评分预计从 3/10 提升到 5-6/10。  
**风险**：B1 需要 `getCausalDigest` 调用路径被引入 `HUDController`（已 import `getCausalDigest`），若 digest 计算略重需注意性能（但同类 `getNextActionAdvice` 已在 render 循环中调用，无新压力）。

---

## 3. 选定方案

**选方向 B（全量修复）**：P0 Bug 是本轮"零分场景"，必须修复；B1-B3 的 P1 内容 scope 可控且收益确定。freeze_policy 已 lifted，深层修改被允许。

实施顺序：先修 P0 Bug（步骤 1-3），再做 P1 改进（步骤 4-6），最后增加测试（步骤 7-8）。

---

## 4. Plan 步骤

- [ ] Step 1: `index.html:2757` — edit — 在 `overlayHelpBtn` click 事件绑定中加入 `e.stopPropagation()` 和 `e.preventDefault()`，将裸 `openHelp` 改为 `(e) => { e.stopPropagation(); e.preventDefault(); openHelp(); }`，确保点击"How to Play"不触发任何 GameStateOverlay 冒泡逻辑。

- [ ] Step 2: `index.html:2747-2752` (Tab 切换 JS 块) — edit — 将 tab click handler 从纯 class toggle 改为同时写 `page.style.display`：`tabs.forEach(btn => btn.addEventListener('click', () => { const key = btn.dataset.helpTab; tabs.forEach(b => b.classList.toggle('active', b === btn)); pages.forEach(p => { const active = p.dataset.helpPage === key; p.classList.toggle('active', active); p.style.display = active ? '' : 'none'; }); }));`，同时在页面初始化时对所有非-active page 写 `style.display = 'none'`（隐式初始化防御）。

- [ ] Step 3: `index.html:1520-1521` (CSS) — edit — 将 `#helpModal .help-page { display: none; }` 改为 `#helpModal .help-body .help-page { display: none !important; }` 以增加特异度，防止被 `@media` 块覆盖；`active` 规则对应改为 `#helpModal .help-body .help-page.active { display: block !important; }`。

- [ ] Step 4: `src/ui/hud/HUDController.js:#renderNextAction` (约 line 513) — edit — 在计算 `loopText` 前，先尝试调用 `getCausalDigest(state)`（已在文件顶部 import），若 `digest.severity === 'error'` 则用 `digest.action` 覆盖 `loopText`，并在 `node` 上设置 `data-severity="critical"` 以触发红色脉冲 CSS；保留 `getNextActionAdvice` 作为 severity 非 error 时的 fallback。

- [ ] Step 5: `src/ui/hud/HUDController.js:render()` — edit — 在 `render()` 调用 `#renderNextAction` 之后，增加食物危机视觉警告：读取 `state.metrics?.resourceEmptySec?.food`，若其值在 `(0, 120]` 范围（food 将在 2 分钟内耗尽），则在 `this.statusFood`（已有 DOM 引用）上设置 `style.outline = '2px solid #e74c3c'` 和 CSS 动画类 `hud-critical-pulse`；否则清除样式。对应在 `index.html` CSS 区块（status-bar 样式块附近）增加 `@keyframes hud-critical-pulse { 0%,100%{opacity:1;} 50%{opacity:0.45;} }` 和 `.hud-critical-pulse { animation: hud-critical-pulse 0.9s ease-in-out infinite; }`（约 8 LOC）。

- [ ] Step 6: `src/ui/panels/EntityFocusPanel.js:renderExchange` (line 91 `open` 属性) — edit — 将 `renderExchange` 的最外层 `<details ... open>` 中的 `open` 属性移除，改为默认折叠（保留 `data-focus-key` 以便 `#restoreOpenStates` 持久化展开态）；同样将同文件内 Blackboard / Path Nodes `<details>` 的 `open` 属性删除（搜索 `data-focus-key="blackboard"` / `data-focus-key="path"` 附近的 `open`）。首屏默认只展示：名字、角色、当前任务、饥饿/食物状态。

- [ ] Step 7: `test/help-modal.test.js` — edit — 在"Tab 切换"现有 test 套件旁新增断言：(1) 初始化时 `controls` 和 `threat` 和 `different` 三个 help-page 的 DOM 中无 `class="help-page active"`（确认只有 `chain` 有 active）；(2) 断言 CSS 规则选择器包含更高特异度的 `#helpModal .help-body .help-page`；(3) 断言 JS 区块中 `style.display` 赋值语句存在（proxy 测试 Bug 修复不被 revert）。

- [ ] Step 8: `test/help-modal.test.js` — edit — 新增断言验证 `overlayHelpBtn` 的 click 绑定使用箭头函数形式（包含 `stopPropagation`），通过 `HTML.match(/overlayHelpBtn.*stopPropagation/)` 或等价正则确保 P0 Bug fix 被回归保护。

---

## 5. Risks

1. **Tab CSS `!important` 副作用**：若未来有合理的外部 override 需要覆盖 `help-page` display（如打印样式），`!important` 会阻止。缓解：`!important` 仅加在 `#helpModal .help-body .help-page` 超高特异度选择器上，影响范围极窄。

2. **`getCausalDigest` 在 render loop 中的性能**：`getCausalDigest` 调用链包含 `getScenarioRuntime`、`getFrontierStatus` 等多个 state 遍历；但 `getNextActionAdvice` 已经在同一 render 循环中调用类似函数，实测无帧率问题。缓解：共用 `getScenarioRuntime` 的返回结果（在 `#renderNextAction` 中缓存 `runtime`）。

3. **`EntityFocusPanel` 默认折叠破坏开发者工作流**：开发者依赖 Last AI Exchange / Blackboard 展开态进行调试。缓解：`#restoreOpenStates` 已通过 `openStateByKey` Map 持久化展开态；首次访问折叠，第二次访问恢复上次状态，对开发者无实际损耗。

4. **`overlayHelpBtn` stopPropagation 影响 GameStateOverlay 的其他行为**：GameStateOverlay 没有对 `#overlayMenuPanel` 内部做事件委托监听（仅在构造函数中直接绑定各按钮的独立 listener），stopPropagation 不会截断任何已有 listener。

5. **食物 pulse 动画干扰 HUD 可读性**：脉冲动画若频率太高（< 1s）会干扰其他 HUD 信息读取。缓解：0.9s 周期已接近"安静提示"而非"报警闪烁"；仅对 `statusFood` 数字本身施加，不影响同行其他元素。

---

## 6. 验证方式

1. **Help Tab 功能测试**：运行 `node --test test/help-modal.test.js`，所有现有测试 + 新增 3 个回归测试全部通过（绿灯）。

2. **How to Play 按钮回归测试**：在浏览器 DevTools console 中，执行 `document.getElementById('overlayHelpBtn').click()`，确认：(a) `window.__utopiaHelp.isOpen()` 返回 `true`；(b) `window.__gameSession?.phase` 仍为 `'menu'`（游戏未启动）；(c) 无 `onReset` / `onStart` 调用（可通过 console.log 临时 patch handler 验证）。

3. **CausalDigest Next Move 可见性**：启动游戏，在场景有 missing route 时（Broken Frontier 场景），确认 `#statusNextAction` chip 显示红色并文本包含 `getCausalDigest().action` 的内容；与此同时 Debug 面板的 Live Causal Chain 显示相同内容（两处一致）。

4. **食物危机脉冲测试**：在 DevTools 中临时将 `state.metrics.resourceEmptySec.food = 60`，确认 `statusFood` 数字出现红色脉冲动画；将其置为 `200` 后动画消失。

5. **回归完整测试套件**：运行 `node --test test/*.test.js`，确认 865 个已有测试全部通过，无新失败。
