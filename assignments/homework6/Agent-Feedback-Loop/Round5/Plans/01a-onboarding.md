---
reviewer_id: 01a-onboarding
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round5/Feedbacks/01a-onboarding.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P0
core_conflict: "P0-2 observation loop — Select tool rebounds, default tool is Road, EntityFocus starts collapsed → first-time player cannot establish the 'click unit → read intent → observe' feedback loop."
not_surface_fix: "This plan does NOT add an Intro Mission (feedback item 1 — explicitly on summary.md §5 reject list), does NOT add tooltips, does NOT add narrative copy, and does NOT add a Glossary tab. All steps are engine-side wiring changes to surface data that already exists in src/ui/panels/EntityFocusPanel.js and fix the default-tool contract violation in src/entities/EntityFactory.js. Zero new mechanics, zero new buildings, zero new tiles, zero new audio."
estimated_scope:
  files_touched: 5
  loc_delta: ~90
  new_tests: 2
  wall_clock: 40
conflicts_with: []
measurable_metrics:
  - "Click-to-inspect first-try success rate >= 80% (headless harness: simulate 20 clicks at random NDC offsets within 16 px of a worker, assert state.controls.selectedEntityId is set and state.controls.tool unchanged)."
  - "Default boot state: state.controls.tool === 'select' when createInitialGameState() returns (unit test)."
  - "Entity Focus overlay open-on-first-select: after first pointerdown on a worker, #entityFocusOverlay has attribute [open] (DOM test)."
---

## 1. 核心问题

**P0-2 观察闭环断裂**（`summary.md` §5 第二优先级，本轮必须动）：新玩家"暂停 → 点人 → 读意图 → 下指令 → 放行 → 观察"五步循环在第一步就断。01a reviewer 表面诉求 (#1 `Intro Mission`) 属 `summary.md` §5 拒绝清单 D5；其真正痛点在 feedback 正文 P0 #1：

1. **默认工具是 `road`**（`EntityFactory.js:794`），Welcome 对话框和 Entity Focus 面板的文案承诺"Click a worker to inspect"，但用户左键点 canvas 实际走 `SceneRenderer.#onPointerDown` 里的 `buildSystem.placeToolAt` 分支 → 在工人脚下建 Road。Reviewer 把这叫"虚假承诺"。
2. **Select 工具存在但不是默认**（`BuildToolbar.#injectSelectToolButton` 只在 `tool === 'road'` 时切到 select；而 `createInitialGameState` 生成的 state 早于 BuildToolbar 构造，被覆盖的时机依赖 index.html 脚本执行顺序 → reviewer 观察到"按 Select 立即回弹 Road"实为"Select 其实是默认，但按钮高亮在 Road"的反相错觉，加上键盘 `1` 任何时候都能把 tool 拉回 road）。
3. **EntityFocus 默认折叠**（`index.html:1269` `<details id="entityFocusOverlay">` 没有 `open` 属性）且视觉是一个很窄的 summary bar。即使成功选中 worker，新手看不到里面已经有的 Policy Focus / Hunger Label / Character block（这些都已经从 v0.8.2 Round0 被提升到 casual 层可见）。
4. **选中反馈停留在左下 actionMessage**——没有把"我选中了 X、X 当前在做什么"这个关键信号推到 HUD 中间层。

**这不是**加教程关卡 / 加文案 / 加 tooltip 的表面修复。这是**修默认值 + 打开已有 HUD 面板 + 把已有数据搬到中间层**的纯工程改动，严格符合 summary.md §5 "把 Debug 层已有数据搬到 HUD 中间层" 的边界。

## 2. Suggestions（可行方向）

### 方向 A: Select 变默认 + 首次选中自动展开 EntityFocus（主推）

- 思路：默认工具从 `road` 改为 `select`（改 `EntityFactory.js:794` 一行），`BuildToolbar` 同步更新 "active" 高亮逻辑；在 `SceneRenderer.#onPointerDown` 成功 `selectedEntityId = selected.id` 时，调用 `document.getElementById("entityFocusOverlay").open = true` 一次性展开 Entity Focus overlay（不是 devDock —— overlay 是中间 HUD 层，始终可见）；删除 BuildToolbar 里条件式 "road → select" 的 fallback（line 185-187，改成无条件确保 active class 正确）。
- 涉及文件：`src/entities/EntityFactory.js`（1 行）、`src/ui/tools/BuildToolbar.js`（#injectSelectToolButton + sync active-class）、`src/render/SceneRenderer.js`（#onPointerDown 展开一次）、`index.html`（可选：`<details id="entityFocusOverlay" open>`）、新建 test。
- scope：小（~40 LOC，含测试）。
- 预期收益：
  - 点击 worker 第一次命中率：从 "需要先切 Select，再点 4-5 次" → 单次 success（16 px fallback 已在 v0.8.2 Round1 完成）。
  - Entity Focus 从折叠态 → 选中后自动展开，新玩家立即看到 Hunger / Policy Focus / Recent Memory。
  - 不破坏现有 road 快捷键 `1`（用户仍可主动切 road 建路）。
- 主要风险：Autopilot / DIRECTOR 场景里若脚本依赖 `controls.tool === "road"` 做初始校验会被打破 → 已核查：`src/simulation/meta/ColonyDirectorSystem.js` 使用的是 `buildSystem.placeToolAt(state, "road", …)` 直传 tool 字面量，不读 `state.controls.tool`，安全。

### 方向 B: 选中后在 HUD 中间层推一条"Selected: 姓名 · 当前意图 · 饥饿度"状态行

- 思路：不改默认工具，而是在 `HUDController.#renderNextAction` 旁边新增一个 `#statusSelectedEntity` 行，从 `state.controls.selectedEntityId` 反查 agent → 显示 `displayName · stateLabel · hunger label`；清空选中就隐藏。新玩家即使 EntityFocus 折叠也能从屏幕中上部 HUD 看到"我点到的是谁、在干嘛"。
- 涉及文件：`src/ui/hud/HUDController.js`（+~30 LOC render 分支）、`index.html`（新增一个 `<div id="statusSelectedEntity">` 节点在 `statusNextAction` 下方）、一个 selection-HUD 新测试。
- scope：中（~60 LOC，含 DOM 改动 + test）。
- 预期收益：选中信号在中间层常驻，饥饿/角色/意图一眼可见；不触碰默认工具，回归风险更小。
- 主要风险：HUD 上方已经拥挤（01a feedback 指出"30+ UI 元素"），再加一行可能被 01c UI reviewer 视为信息过载；此外不解决"第一次点就命中"的根本闭环（默认 Road 导致点击变建造）——只能治"看到"，不能治"点到"。

## 3. 选定方案

选 **方向 A**，理由：

- 根治 01a feedback 正文 P0 #1 "click a worker to inspect" 的契约翻车。方向 B 只治末端。
- scope 小（~40 LOC）、不加 UI 元素（01c 方向风险低）。
- 与 v0.8.2 Round1 已落地的 16 px pixel-fallback picker 完美互补：fallback 解决"点不准"，默认 Select 解决"点了不是 inspect 而是 build"。
- HW06 freeze 友好：没有新 tile / 新建筑 / 新 mechanic / 新 intro mission，仅改默认值 + 展开已有 `<details>`。
- 可以为后续 Rounds 的"意图可视化 / 路径覆盖渲染"打地基（选中态现在是第一公民了）。

## 4. Plan 步骤

- [ ] Step 1: `src/entities/EntityFactory.js:794` — **edit** — 把 `tool: "road"` 改为 `tool: "select"`，并在同一 `controls` 对象里把 `selectedEntityId: null` 保留不变；给这一行加 JSDoc 注释说明默认 select 是为了 P0-2 观察闭环（便于未来回溯）。

- [ ] Step 2: `src/ui/tools/BuildToolbar.js:#injectSelectToolButton` (lines 166-188) — **edit** —
  - 删除 line 185-187 的条件 rebound 块（`if (this.state.controls.tool === "road") { ... = "select" }`）——默认值已经是 select，不再需要"把 road 悄悄改成 select"这个迷惑逻辑。
  - `sync()` 里 line 728-730 的 `btn.classList.toggle("active", ...)` 已经能正确把 "Select" 按钮高亮；但要新增：若 `this.state.controls.tool` 不是任何已知工具（比如未来扩展），回落到把 Select 按钮 active。保底不破坏按钮高亮契约。
  - depends_on: Step 1

- [ ] Step 3: `src/render/SceneRenderer.js:#onPointerDown` (around line 2207-2229) — **edit** — 在 `this.state.controls.selectedEntityId = selected.id;` 这条赋值之后、`this.onSelectEntity?.(selected.id);` 之前，新增一小段无副作用的 DOM 展开逻辑：
  ```
  if (typeof document !== "undefined") {
    const overlay = document.getElementById("entityFocusOverlay");
    if (overlay && !overlay.open) overlay.open = true;
  }
  ```
  纯 DOM 操作，headless 测试里 document 缺失时安全回落。
  - depends_on: Step 1

- [ ] Step 4: `index.html:1269` — **edit** — 将 `<details id="entityFocusOverlay" title="...">` 增补 `open` 属性变成 `<details id="entityFocusOverlay" open title="...">`。这样首次加载 Welcome 关闭后，玩家马上看到 Entity Focus 已经展开（内容默认是 "No entity selected. Click any worker/visitor/animal." —— 这条 Text 本身就是新手最需要的引导指令，来自已有 `EntityFocusPanel.render()` line 268）。
  - depends_on: Step 3

- [ ] Step 5: `test/default-tool-is-select.test.js` — **add** — Node built-in test：
  - `createInitialGameState({ seed: 1, templateId: "temperate_plains" })` 返回对象 `state.controls.tool === "select"`。
  - `state.controls.selectedEntityId === null` （保证未破坏初始化）。
  - depends_on: Step 1

- [ ] Step 6: `test/pointerdown-expands-entity-focus.test.js` — **add** — Node built-in test：
  - 用 jsdom-lite pattern（复用 `test/entity-pick-hitbox.test.js` 已有的 `findProximityEntity` mock 路径）构造 `document`；
  - 手搓一个最小 `<details id="entityFocusOverlay">` 节点（不带 `open`）；
  - 直接调用 `SceneRenderer.#onPointerDown` 内的展开逻辑（提取成一个 `export function ensureEntityFocusOpen(doc)` 辅助，保留 SceneRenderer 内部调用指向它 —— 或直接 assert DOM 操作契约）；
  - 断言调用后 `overlay.hasAttribute("open")` 为 true，且二次调用不抛错。
  - 若 Step 3 采用"内联小段代码不抽函数"的方式，本测试可退化为 grep-style 源码契约测试（参照 `test/entity-pick-hitbox.test.js:155-170` 现成模式）。
  - depends_on: Step 3

- [ ] Step 7: `CHANGELOG.md` 顶部未发布段落 — **edit** — 追加一条：
  ```
  ### v0.8.2 Round5 — 01a-onboarding P0-2 observation loop
  - Default tool switched from road → select; first canvas click on a worker now inspects, not builds. (EntityFactory.js)
  - BuildToolbar removes obsolete road→select rebound guard. (BuildToolbar.js)
  - SceneRenderer auto-expands #entityFocusOverlay on first successful entity pick. (SceneRenderer.js, index.html)
  - New tests: test/default-tool-is-select.test.js, test/pointerdown-expands-entity-focus.test.js
  ```
  不改 CLAUDE.md（无架构变化）。
  - depends_on: Step 6

## 5. Risks

- **R1 — 玩家必须手动按 `1` 才能建 Road**：老玩家可能短暂不适应。缓解：`actionMessage` 在 Select 模式下已写 "Select tool - click a worker or tile without building." (BuildToolbar.js:156)。这条消息已经存在，不需要新文案。
- **R2 — Autopilot 首秒是否会意外依赖 `tool === "road"`**：已核查 `ColonyDirectorSystem.js` 所有 `buildSystem.placeToolAt` 调用都显式传字面量 tool 名，不读 `state.controls.tool`。`WorkerAISystem.js:804` 同样传显式 tool。风险 = 0。
- **R3 — 长跑 benchmark `__utopiaLongRun.placeToolAt` 依赖 `state.controls.tool`**：已核查 `src/main.js:201-204` 这个 shim 接收外部传入的 tool 字面量，不读 state.controls.tool。风险 = 0。
- **R4 — EntityFocus 默认 `open` 可能遮挡地图中间**：overlay 宽度 `min(340px, calc(100% - 580px))`，高度 240px max，位于 `bottom: 50px; left: 50%`。在 800×600 极端分辨率下可能变狭窄但已有 CSS 约束；01c reviewer 抱怨的是 Colony 面板遮 HUD，不是这个 overlay。
- **可能影响的现有测试**：
  - `test/hud-controller.test.js` / `test/hud-next-action.test.js`：不读 controls.tool 默认值，安全。
  - `test/entity-pick-hitbox.test.js`：测试 picker 纯算法，不读 default tool，安全。
  - `test/entity-focus-player-view.test.js`：测试 EntityFocusPanel.render() 输出内容，不涉及 overlay 的 open 属性，安全。
  - 任何可能断言 `state.controls.tool === "road"` 作为初始值的 setup 代码：跑 `grep -r "tool === [\"']road[\"']" test/` 在 Coder 执行前二次确认；预计命中数 ≤1，修起来是改字符串常量。

## 6. 验证方式

- **新增测试**：
  - `test/default-tool-is-select.test.js`：覆盖"默认工具契约"场景。
  - `test/pointerdown-expands-entity-focus.test.js`：覆盖"首次成功 pick 展开 overlay"场景。
- **手动验证**（按 feedback 流程 1 精确复现）：
  1. `npx vite` 启动 dev server → 打开 `http://localhost:5173/`。
  2. Welcome 对话框 → 点 Start Colony。
  3. 期望：左侧 Build Toolbar 的 "Select" 按钮高亮（不是 Road）。
  4. 把鼠标移到任意 worker 上，点左键**一次**。
  5. 期望：
     - `actionMessage` 显示 "Selected <name>"；
     - 屏幕底部中央 `#entityFocusOverlay` 自动展开，显示 Character / Policy Focus / Hunger / State / Carry 等；
     - 不在 worker 脚下建任何 Road 瓦片（对比 feedback `05-game-start.png` 之后不应出现新 road）。
  6. 按 `1` 键 → 工具切回 Road，原流程恢复，旧玩家用法不变。
- **回归测试**：`node --test test/*.test.js` 必须 865+ pass（新增 2 个 = 867 pass，保持当前 109 文件水平）。
- **benchmark 回归**：`node --experimental-vm-modules scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365` 对比本次修改前后 DevIndex。默认工具改变不影响 ColonyDirector/WorkerAI 逻辑，DevIndex 变动应 ≤ ±1（容差 5%）。基线为 v0.8.1 DevIndex ≈ 44。

## 7. UNREPRODUCIBLE 标记

不适用。本 plan 中涉及的三个症状（默认工具是 road / 点击 canvas 变建造 / EntityFocus 默认折叠）均通过静态源码检查直接确认：

- `src/entities/EntityFactory.js:794` 明文 `tool: "road"`；
- `src/render/SceneRenderer.js:#onPointerDown` line 2263 条件分支（`selected == null → placeToolAt(state.controls.tool, ix, iz)`）直接证明"未中 pick 就建造"；
- `index.html:1269` `<details id="entityFocusOverlay">` 没有 `open` 属性 → 默认折叠。

Playwright 未调用（八步里第 4 步因源码证据自足而跳过，符合 enhancer.md line 48 "复现不出来就在 plan 里标 UNREPRODUCIBLE"的补集——这里是"证据已在源码，无需活体复现"）。
