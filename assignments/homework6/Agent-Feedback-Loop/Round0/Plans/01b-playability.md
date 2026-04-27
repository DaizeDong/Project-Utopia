---
reviewer_id: 01b-playability
feedback_source: Round0/Feedbacks/02-playability.md
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

Reviewer 打 **3/10**，根因归并为 **1 个 P0 + 1 个 P1**：

1. **P0 — 首次建造点击"静默失败"导致第一回合体验崩盘**。
   `SceneRenderer.#onPointerDown`（src/render/SceneRenderer.js:1854-1894）已经调用
   `buildSystem.placeToolAt` 并把 `buildResult.reasonText` 写入
   `state.controls.actionMessage`，HUD 的 `statusAction` 会把这段文字显示在屏幕底部
   （src/ui/hud/HUDController.js:268-277）——**但整条通道视觉上等于"静默"**：
   - `statusAction` 的提示位置离点击点很远（屏幕底部状态条）、字号小；
   - 没有在点击坐标附近弹出飘字、没有拒绝音效、光标圆环颜色不变；
   - 悬停预览（`previewMesh` 在 SceneRenderer.js:1924-1929）只用绿/红**无 reason 文本**，
     玩家在点击**之前**根本不知道为什么不能放；
   - 资源不足（`BuildAdvisor` 的 `costLabel`）只在侧边栏的一个折叠面板里出现。
   结果：玩家点一次没反应 → 点第二次 → 第三次 → **100% 会判"游戏坏了"**。
   这是 Feedback 里"最要紧"改进建议 #1，也是阻断所有后续体验的 P0。

2. **P1 — 主菜单叠加层下模拟不暂停的"视觉错觉"**。
   `GameApp.#setRunPhase("menu")` 会把 `controls.isPaused = true`
   （src/app/GameApp.js:1304-1307），`update()` 也确实不会推进 `simStepper`
   （src/app/GameApp.js:291-311 + src/app/simStepper.js:21）。所以**后端模拟实际上
   是暂停的**。但 HUD 仍在持续渲染 `state.metrics.timeSec` 与 `devIndexSmoothed`
   （src/ui/hud/HUDController.js:174-180, 252-267），而 `GameStateOverlay` 的蒙版
   **没有遮住顶部 `#statusBar` 和 `#statusObjective`**，玩家看到 "Survived 00:00:26
   · Dev 49/100" 在菜单后面闪，主观上认定"游戏在跑"。**症状是视觉，不是逻辑**。

其余点（L 键冲突、Settings 混装地图参数、Developer Telemetry 默认展开）属 P2 抛物线；
快速核查：`src/app/shortcutResolver.js:1-8` 的 TOOL_SHORTCUTS 只映射 Digit1..Digit6，
并没有把 `KeyL` 绑到 lumber，feedback 的"L 键冲突"是**误判**——不需要改代码，
但 plan 里会加一条 HUD 上的 tooltip 澄清。

## 2. Suggestions（可行方向）

### 方向 A：悬停即告知 + 点击飘字（Build-Feedback Layer）

- 思路：不新增机制，只把已有的 `buildResult.reason/reasonText` 提升到"触手可及"：
  (1) 在 `BuildToolbar.sync()` 里把 `state.controls.buildPreview.reasonText`
  渲染到 `#buildToolRulesVal` 旁的一个新 `#buildToolBlocker` 条目——**hover 时
  就告诉玩家"Need 3 more wood"**；(2) `SceneRenderer.#onPointerDown` 在失败
  分支追加一个 1.2s 淡出的 floating toast（CSS transform 动画，挂在
  `#viewport` 层，世界坐标转屏幕坐标）——**点击后立即在光标位置弹红字**。
- 涉及文件：
  - `src/render/SceneRenderer.js`（新增 `#spawnFloatingToast`）
  - `src/ui/tools/BuildToolbar.js`（sync 里读 `buildPreview.reasonText`）
  - `index.html`（新增 `#floatingToastLayer` + CSS 动画）
  - `src/ui/hud/HUDController.js`（`statusAction` 加入 pulse 关键帧，强化现有通道）
- scope：中（~180 LOC）
- 预期收益：直接击中 P0；**同一次改动同时修复 "点击没反馈" 与 "不知道为何不能放"**；
  不需要改 `BuildSystem`、不改测试骨架。
- 主要风险：Toast DOM 元素随点击频繁创建，需要节流 + 复用池（单元素 + 重置 CSS），
  否则 3x 速率下性能退化。

### 方向 B：彻底改造建造为"拖放确认流"（Drag-to-Place 模式）

- 思路：把当前"1-click 立即放"改成"1-click 进入 preview-attached-to-cursor，
  再 1-click 确认/Esc 取消"，仿 Cities: Skylines。preview 常驻 + 资源足/不足
  用 UI 条显示。
- 涉及文件：
  - `src/render/SceneRenderer.js`（大改 pointerdown/pointermove）
  - `src/simulation/construction/BuildSystem.js`（新增 commit-on-confirm 的中间态）
  - 新增 `src/ui/tools/BuildCursor.js`
  - `test/build-system.test.js` + 多个回归测试
- scope：大（~500 LOC，涉及 BuildSystem 状态机重构）
- 预期收益：UX 最干净，但改动大；与 feedback 提的"要有真正决策点"略有重合。
- 主要风险：
  - 与 v0.8.x "feature freeze" 冲突——这算引入新交互机制；
  - 会让已有的 7 个 exploit regression tests（deliverWithoutCarry 等）需要重跑验证；
  - 破坏 benchmark 工具里直接 placeBuildingsOnGrid 的假设（src/benchmark/BenchmarkPresets.js:289）。

### 方向 C：全面教学化（Tutorial Card + Cost Highlight + Resource Tint）

- 思路：按 Feedback 建议 #2 做 3 张开场引导卡片，加资源不足时资源图标变红脉动，
  + "L 键 = Heat Lens 而非 Lumber" 的 tooltip 澄清。
- 涉及文件：
  - `index.html`（新增 overlay 子节点、CSS 脉动 keyframes）
  - `src/ui/hud/GameStateOverlay.js`（tutorial 步骤状态机）
  - `src/ui/hud/HUDController.js`（资源不足时加 class="pulse-low"）
  - `src/app/shortcutResolver.js:10` 的 SHORTCUT_HINT（加澄清 "L = heat lens, not lumber"）
- scope：中（~250 LOC，但主要是 HTML/CSS）
- 预期收益：命中 feedback 建议 #2 + #6 + L 键误会；新玩家上手曲线明显缩短。
- 主要风险：教学流可能被 tester 当作新 mechanic（feature freeze 边界模糊）；
  3 张卡片交互需要新测试；比 A 慢但覆盖广。

## 3. 选定方案

**选方向 A（Build-Feedback Layer）**。理由：

1. 这是 **P0 问题**，按 enhancer.md 硬约束要"小 scope / 快速落地"；A 最小；
2. 不引入新 mechanic，只把**已经存在**的 `buildResult.reasonText` / `buildPreview`
   字段提升到玩家视野——完全落在 "polish / UX" 的 freeze 内侧；
3. 不改 `BuildSystem` 公共 API，现有 109 个测试文件**零改动**；
4. 方向 B 违反 feature freeze；方向 C 收益更广但慢，可留给后续 reviewer
   的 plan 或 HW07。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:~700`（在 `#viewport` 节点内，紧挨 canvas 下方）
  —— **add** —— 新增 `<div id="floatingToastLayer" aria-live="polite"></div>`
  容器；CSS 区新增 `.build-toast` 类（绝对定位 + `transform: translate(-50%, -50%)`
  + `@keyframes toastFloat { 0% { opacity: 0; transform: translate(-50%, -40%); }
  20% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -120%); } }`，
  持续 1.2s ease-out）；两个子类 `.build-toast--ok` (绿 #6eeb83) 与
  `.build-toast--err` (红 #ff6b6b)。

- [ ] **Step 2**: `src/render/SceneRenderer.js:~410`（构造函数，`this.boundOnPointerDown`
  赋值附近）—— **add** —— 增加 `this.toastLayer = document.getElementById("floatingToastLayer")`
  与 `this.toastPool = []`（预分配 6 个 div 做复用池）。

- [ ] **Step 3**: `src/render/SceneRenderer.js:#spawnFloatingToast`（新方法，放在
  `#onPointerDown` 下方 1896 行之前）—— **add** —— 签名
  `#spawnFloatingToast(worldX, worldZ, text, kind)`：
  1. 用 `this.camera` + `THREE.Vector3.project()` 把世界坐标投到 NDC，再乘 rect 得到屏幕 (px, py)；
  2. 从 `toastPool` 取空闲 div（没有就 `document.createElement("div")` 并 push）；
  3. 设置 `div.className = \`build-toast build-toast--${kind === "success" ? "ok" : "err"}\``，
     `div.textContent = text`，`div.style.left = px+"px"; div.style.top = py+"px"`；
  4. 重置动画：`div.style.animation = "none"; void div.offsetWidth; div.style.animation = "toastFloat 1.2s ease-out"`；
  5. `setTimeout(() => { div.remove-from-layer via display='none' }, 1250)`（保留在池中复用）。
  - depends_on: Step 1, Step 2

- [ ] **Step 4**: `src/render/SceneRenderer.js:1884-1893`（`#onPointerDown` 的
  buildResult 分支）—— **edit** —— 在 `this.state.controls.actionMessage =
  ...` 两行（success + error）**之后**分别追加一行
  `this.#spawnFloatingToast(picked.worldX ?? tileToWorld(tile.ix,tile.iz,this.state.grid).x,
  picked.worldZ ?? tileToWorld(...).z,
  buildResult.ok ? "+built" : (buildResult.reasonText ?? "blocked"),
  buildResult.ok ? "success" : "error")`。
  对 success 分支用 `buildResult.cost` 字段生成字符串如 `"-5 wood"`（从
  `buildResult.cost` 对象遍历非零值）。
  - depends_on: Step 3

- [ ] **Step 5**: `src/ui/tools/BuildToolbar.js:sync`（方法末尾约 785 行，
  在 `this.buildPreviewVal.textContent = buildPanel.previewSummary` 之后）—— **edit**
  —— 新增逻辑：若 `this.state.controls.buildPreview?.ok === false` 且
  `buildPreview.reasonText` 非空，则把 `this.buildPreviewVal` 的
  `data-kind="error"` 设置为 error，并在文本前面拼 `"✗ "` 前缀；反之（ok 或无 preview）
  `data-kind=""`。
  同时在 `index.html` 的 `#buildPreviewVal` 样式里加
  `[data-kind="error"] { color: #ff8a80; }`、`[data-kind="warn"] { color: #ffca80; }`
  以便 hover 预览即显眼。
  - depends_on: Step 1（共用 CSS 变量）

- [ ] **Step 6**: `src/ui/hud/HUDController.js:268-277`（`this.statusAction` 的
  if 分支）—— **edit** —— 把原 `this.statusAction.style.background = ...`
  / `.color = ...` 的静态赋值改成：给 `statusAction` 添加一个
  `"flash-action"` class，在 CSS 里定义
  `@keyframes flashAction { 0% { transform: scale(1.08); } 100% { transform: scale(1); } }`，
  class 在每次 `actionMessage` 变化时通过 `this.lastActionMessage !==
  state.controls.actionMessage` 判断触发（类似 `void el.offsetWidth` 强制重流）。
  新增实例字段 `this.lastActionMessage = ""`（在 constructor 初始化）。
  让底部状态条的提示**有脉冲动画**，玩家眼角余光就能捕捉到。
  - depends_on: Step 1

- [ ] **Step 7**: `src/ui/hud/HUDController.js:175-180 + 252-267`（两处渲染
  Survival 文本处）—— **edit** —— 在赋值 `objectiveVal.textContent` / `statusObjective.textContent`
  之前加 guard：
  ```
  const inMenu = state.session?.phase !== "active";
  const formatted = inMenu ? "--:--:--" : `${hh}:${mm}:${ss}`;
  const score = inMenu ? "—" : Math.floor(...);
  ```
  修复 "菜单后面计时器在跳" 的视觉错觉（P1）。不改 simulation 逻辑，只改显示。
  - depends_on: 无（独立 guard）

- [ ] **Step 8**: `test/build-toast-feedback.test.js`（新文件）—— **add** —— 两条用例：
  (a) mock DOM，调用 SceneRenderer 的 `#spawnFloatingToast`（通过 export 一个
  纯函数版 `formatToastText(buildResult)`），断言资源不足时返回 `"Need 3 more wood"`
  格式；(b) 断言 `formatToastText({ok:true, cost:{wood:5}})` 返回 `"-5 wood"`。
  - depends_on: Step 3, Step 4（需要先暴露 `formatToastText`）

- [ ] **Step 9**: `test/hud-menu-phase.test.js`（新文件）—— **add** —— 断言当
  `state.session.phase = "menu"` 时，HUDController.render 让
  `statusObjective.textContent` 以 `"--:--:--"` 开头；当 phase="active" 时恢复
  数字。用现有 `test/hud-controller.test.js` 的 mock DOM 工厂复用。
  - depends_on: Step 7

## 5. Risks

- **Risk 1：Toast 每秒 30+ 帧时性能退化**。FastForward 2x 下玩家可能同时触发多个
  点击；mitigation 是 Step 2 的 pool（复用 6 个 DOM 节点），并在 `#spawnFloatingToast`
  里做 100ms 节流（同一 tile 重复点击不重复动画）。
- **Risk 2：`buildResult.cost` 字段格式不稳定**。Step 4 要求读取 `buildResult.cost`，
  但 `BuildSystem.placeToolAt` 可能只在 success 路径挂该字段。Coder 在 Step 4 实施
  时必须先 grep `placeToolAt` 确认返回 shape，必要时 fallback 到
  `state.controls.tool` 名字而非 cost。
- **Risk 3：Step 6 的 flashAction class 可能与 compact 模式冲突**。`#ui.compact` 下
  `statusAction` 可能被隐藏或缩放，新动画需要在 compact CSS 下禁用（加
  `#ui.compact .flash-action { animation: none; }`）。
- **Risk 4：Step 7 的 guard 可能打穿**。若 `state.session` 未初始化（某些旧 snapshot），
  则 `inMenu=true`，显示 `--:--:--`；但刚开始 load 时过渡到 active 的动画会跳变。
  Mitigation：在 Step 7 里也判 `state.metrics.timeSec > 0`，更稳。
- **可能影响的现有测试**：
  - `test/hud-controller.test.js`（会跟 Step 7 的新文本交互——必须检查现有断言是否
    直接对比 `"Survived 00:00:00"` 字符串；若是，需更新）；
  - `test/game-state-overlay.test.js`（Step 1 新增了 #floatingToastLayer，但该文件
    应该不 depends on 它）；
  - `test/snapshot-service.test.js`（session.phase 的处理链路——Step 7 的 menu guard
    只影响 HUD，不触发 snapshot，但最好跑一遍）。

## 6. 验证方式

- **新增测试**：
  - `test/build-toast-feedback.test.js` 覆盖 `formatToastText` 纯函数（成功/失败两种
    branch + 多资源不足场景如 `{wood:3, stone:2}` → `"Need 3 more wood, 2 more stone"`）。
  - `test/hud-menu-phase.test.js` 覆盖 HUD 在 menu/active 两种 phase 下的 Survival
    字段渲染。
- **手动验证**（按顺序）：
  1. `npx vite` 启动 → 打开 http://localhost:5173；
  2. **不点 Start Colony**，观察 `#statusObjective` 应显示 `Survived --:--:-- Score —`
     而不是在跳（覆盖 P1）；
  3. 点 Start Colony；
  4. 选 Farm 工具（wood 8 木头不够 Farm 5w 可能足够，改成选 Warehouse 或 Wall 确保不足）；
  5. 光标圆环悬停在空地上，`#buildPreviewVal` 应显示红色 `✗ Need N more wood`（覆盖预览侧通道）；
  6. 左键点击，光标位置应弹红字 `Need N more wood` 并向上飘 1.2s 消失（覆盖点击侧通道）；
  7. 资源够时（点 Road 1w，wood=8）左键点击，光标位置弹绿字 `-1 wood`；
  8. 底部 `#statusAction` 每次变化应有脉冲（≈200ms）。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains`，
  **DevIndex 不得低于当前 v0.8.1 值 44 的 -5%**（即 ≥41.8），deaths ≤ 500。
  因为本 plan 只改 UI 层与一个纯展示 guard，benchmark 数值应**基本不变**；若变化
  >2%，说明 HUD 渲染路径误写入了 state（必须回退）。
- **回归 test 套件**：`node --test test/*.test.js`，865 条预期全部通过（+2 新增）。

## 7. UNREPRODUCIBLE 标记

未触发 UNREPRODUCIBLE。Feedback 描述的现象已通过**静态代码路径分析**完整复核：

- "点击无反馈" → 复核 `SceneRenderer.js:1854-1894` + `HUDController.js:268-277`，
  确认反馈通道**存在但视觉隐蔽**（底部小字、无动画）；
- "菜单下计时器在跳" → 复核 `GameApp.js:1304-1307` 确认 sim 已暂停，但
  `HUDController.js:175-180` 无 phase guard，**错觉为真**；
- "L 键冲突 Lumber" → 复核 `shortcutResolver.js:1-8`，TOOL_SHORTCUTS 只含 Digit1-6，
  **reviewer 误判**，plan 未纳入（可在 Round1 feedback 回执中澄清）；
- "Dev Telemetry 默认展开" → 复核 `index.html:624` 的 `<div id="wrap" class="dock-collapsed">`
  与 `BuildToolbar.js:425-426` 的 `localStorage` 默认 `true`，**首次访问应该是折叠**；
  reviewer 可能是在 HW06 前跑过一次留下了 `"0"` 值，属 edge case，P2，本 plan 未纳入。

Playwright MCP 未真实拉起浏览器——本次工具预算权衡下，**静态路径分析已足以
定位精确 file:line**，MCP 交互留给 Coder 在 Step 6-7 实施时做手动验证。
