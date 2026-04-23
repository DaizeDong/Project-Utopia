---
reviewer_id: 02b-casual
feedback_source: Round2/Feedbacks/02b-casual.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~260
  new_tests: 3
  wall_clock: 70
conflicts_with: []
---

## 1. 核心问题

休闲玩家（02b）关的游戏的三个根本症结，全部属于"游戏已经在模拟，但玩家感知不到"：

1. **死亡事件 UI 无感**（P0-3 casual 分支）——工人饿死时，顶栏 `#deathVal` 已有 8s "obituary flash"（Round-0 01e 贡献）和 `#latestDeathVal` 行（Round-1 01d 贡献），但**两者都是同字号灰白文本混在 HUD 其他指标里**，休闲玩家把它当作正常 scoreboard 噪音而错过；而且文案只写 `Name died (starvation) near (x,y)`，**没有因果链**（比如"food 为 0 持续了 30s → 仓库空 → 死亡"）。reviewer 的原话："我不认识他，但我有点难过"——悲伤来自"zero feedback，下一秒又没了"。需要一个**独立的、红色背景的、地图上有位置闪烁的 toast**，而不是继续在 scoreboard 里塞文本。

2. **资源 pill 依赖图标识别**（P1-4）——顶栏 `.hud-resource` 元素仅有图标 + 数字（Apple 🍎 / Wood Log 🪵 / Rune Stone / Mushroom / Gear），tooltip 需要悬停才能看到 "Food — raw food from farms"。休闲玩家进游戏的**前 10 秒没有主动去 hover 任何东西的习惯**，直接错过资源身份。需要把"Food / Wood / Stone / Herbs / Workers"常驻为小字 label 紧贴在数字旁边。

3. **零正反馈循环**（P2-5）——造第一栋建筑、收第一份食物时，游戏只把计数器 +1，**没有任何视觉庆祝**，甚至 reviewer 25 分钟里从头到尾都没意识到"我造东西了"。仓库已有 `EVENT_TYPES.COLONY_MILESTONE`（src/simulation/meta/GameEventBus.js:21）但**从未被 emit**。需要在首次达成几个里程碑时触发 `#spawnFloatingToast`（SceneRenderer 已有的 DOM 池复用）+ 金色发光动画。

**共同病根**：游戏把玩家当作 dashboard 读者而非玩家。三条全部是 UX polish / HW06 允许。

## 2. Suggestions（可行方向）

### 方向 A: Scoreboard 里"把字调大/调红" — 最小改动
- 思路：只改 CSS，把 `#deathVal` 的 obituary 态 + `#latestDeathVal` 加 `data-severity="critical"` 样式（红色背景、更大字号、更高 z-index）。资源 pill 在 `.hud-label` 旁加一个 `.hud-sublabel`。里程碑用现有 `state.controls.actionMessage` 机制（已有 `flash-action` 动画）。
- 涉及文件：`index.html`（CSS + DOM 小改）、`src/ui/hud/HUDController.js`（data-attr 写入）
- scope：小（~60 LOC）
- 预期收益：60% — 视觉权重能把注意力抓回来，但**不解决"toast 需要位置闪烁 + 因果链"**（reviewer 原文明确要求"红色 toast"和"凭什么啊？"所需的可解释性），也不解决里程碑的"庆祝"质感（只是滚一条绿色 action chip，和普通信息冲突）。
- 主要风险：治标不治本；下一轮可能继续被点名"死亡仍无感"。

### 方向 B: 复用已有 `#spawnFloatingToast` + `emitEvent` 管线 — 中等 scope，根治 ⭐
- 思路：
  - **死亡红色 toast**：MortalitySystem 已 `emitEvent(WORKER_STARVED/WORKER_DIED)`（MortalitySystem.js:221-227）。在 `SceneRenderer` 构造时 `onEvent(state, EVENT_TYPES.WORKER_STARVED, …)` 订阅，拿 `detail.tile`（需要把 `entity.deathContext.targetTile` 加进 payload）→ 转 world 坐标 → 复用 `#spawnFloatingToast`，新增 `"death"` kind（红色、持续 4s、附带 2 次 1Hz 地图 ping）；文案改为 **"{Name} starved — food was empty for {Ns}"**（因果链使用 `state.metrics.resourceEmptySec.food` 追踪，在 ResourceSystem 末尾累加）。
  - **资源 pill label**：在 `index.html` 的 `.hud-resource` 里每个 `.hud-meter` 追加一个 `<span class="hud-sublabel">Food</span>` 子元素；添加 CSS `.hud-sublabel { font-size: 9px; opacity: 0.62; letter-spacing: 0.3px; }`。
  - **里程碑小动画**：在 `ProgressionSystem.update()` 追加 `checkMilestones(state)`，比较 `state.buildings.farms / lumbers / warehouses / quarries / kitchens` 首次达到 1（用 state.gameplay.milestonesSeen Set 去重），在 `state.resources.meals/food` 跨阈值（第一次收获 5 food、第一次炒出 meal）时 emit `COLONY_MILESTONE` + `state.controls.actionMessage = "First Farm built!"` + `actionKind = "milestone"`，并让 SceneRenderer 的 BUILDING_PLACED hook 在首次里程碑上用 `"milestone"` kind（金色 + sparkle 放大动画）spawn 一个居中的 toast。
- 涉及文件：`src/simulation/lifecycle/MortalitySystem.js`（payload 扩）、`src/simulation/economy/ResourceSystem.js`（resourceEmptySec 追踪）、`src/render/SceneRenderer.js`（订阅 + 新 kind）、`src/simulation/meta/ProgressionSystem.js`（milestone detector，不属于新 mechanic——只是把已经发生的 state 变化镜像到 event bus）、`index.html`（sublabel DOM + milestone CSS）
- scope：中（~260 LOC）
- 预期收益：90% — 三个子 P0-3 / P1-4 / P2-5 一起打掉，都用已有基础设施（floatingToast 池 + event bus + actionMessage），没有引入新机制。
- 主要风险：
  - 需要在 `deathContext.targetTile` 未定义（Phase 9 fallback 场景）时降级到 `entity.x/z`；
  - `resourceEmptySec` 需要 reset（从 0 恢复的 tick）逻辑以免误报；
  - Obituary flash 和新的 spatial toast 可能同时出现重复信息——需在 HUDController.render() obituary 分支里加 `state.ui.deathToastShownUntil` guard，避免双写。

### 方向 C: 全量接入新 "ObjectiveToast" UI 层 — 大 scope
- 思路：新建 `src/ui/hud/ObjectiveToastSystem.js` 作为独立的 toast 队列，统一接 milestone / death / warning，维护自己的 DOM 容器，带 "stacking" 队列动画。
- 涉及文件：新文件 + HUDController + CSS
- scope：大（~500 LOC）
- 预期收益：95% —— 架构最干净，给未来 round 留余地。
- 主要风险：对单轮 1-reviewer plan 超额；破坏现有 flash-action / obituary 路径的既有测试（hud-controller.test.js、hud-latest-death-surface.test.js、toast-title-sync.test.js）；与 01c-ui 的已知 plan 概率冲突（UI layer 重构属 01c 领地）。

## 3. 选定方案

选 **方向 B**，理由：

- 精准打中 reviewer 02b 三个焦点（P0-3 死亡红 toast + 因果 / P1-4 pill label / P2-5 第一栋建筑 milestone），scope 可控；
- 100% 复用已有 `#spawnFloatingToast`、`emitEvent/onEvent`、`state.controls.actionMessage+flash-action`、`COLONY_MILESTONE` 四个现成管线——**没有任何新机制**（严格符合 HW06 freeze）；
- 方向 A 不会让 reviewer 下一轮改观，方向 C 与 01c-ui 可能冲突且超 scope；
- 现有测试影响小：仅 `hud-latest-death-surface.test.js` 可能因为 obituary 延迟/guard 需要同步 stub，其余 test（hud-resource-rate, toast-title-sync）只读它们自己关心的节点，不会被 sublabel 触碰。

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/economy/ResourceSystem.js:170` — edit — 在 `food = max(0, food)` 这行后追加 `state.metrics.resourceEmptySec ??= { food: 0, wood: 0 };` 以及 `state.metrics.resourceEmptySec.food = state.resources.food <= 0 ? (state.metrics.resourceEmptySec.food + dt) : 0;` 同理处理 wood。追踪"连续空仓秒数"，死 toast 用作因果链。

- [ ] **Step 2**: `src/simulation/lifecycle/MortalitySystem.js:221-227` (`recordDeath` 内部 emitEvent 位置) — edit — 把 `emitEvent` 的 detail 扩展：加入 `tile: entity.deathContext?.targetTile ?? { ix: Math.floor(entity.x), iz: Math.floor(entity.z) }`、`worldX: entity.x`、`worldZ: entity.z`、`foodEmptySec: state.metrics.resourceEmptySec?.food ?? 0`、`displayName` 已有保留；保证订阅端有足够数据定位并讲因果。
  - depends_on: Step 1

- [ ] **Step 3**: `src/render/SceneRenderer.js:2124` (`#spawnFloatingToast` 内部 `node.className = …`) — edit — 扩展 `kind` 判断：`success → --ok`，`error → --err`，**新增 `death → --death`（红底 4s 持续 + `animation: toastDeath 4s`），新增 `milestone → --milestone`（金色 3.2s + sparkle scale up）**。动画关键帧加到 `index.html` CSS。

- [ ] **Step 4**: `src/render/SceneRenderer.js` (构造函数体内，`toastLayer = document.getElementById("floatingToastLayer")` 的同一个初始化 block，约第 534 行附近) — edit — 订阅 `EVENT_TYPES.WORKER_STARVED` 和 `EVENT_TYPES.WORKER_DIED`：`onEvent(state, type, (evt) => { const t = evt.detail; const secTxt = t.foodEmptySec >= 5 ? ` — food empty ${Math.floor(t.foodEmptySec)}s` : ""; this.#spawnFloatingToast(t.worldX, t.worldZ, \`${t.entityName} starved${secTxt}\`, "death", t.tile?.ix ?? -1, t.tile?.iz ?? -1); })`。同样订阅 `COLONY_MILESTONE` 用 `"milestone"` kind。
  - depends_on: Step 2, Step 3

- [ ] **Step 5**: `src/simulation/meta/ProgressionSystem.js:397` (`ProgressionSystem.update` 方法末尾，`updateSurvivalScore(state, dt)` 后) — add — 新增模块级 `checkMilestones(state)` helper + 调用。逻辑：
  ```
  state.gameplay.milestonesSeen ??= new Set();
  const seen = state.gameplay.milestonesSeen;
  const tryMilestone = (key, label) => { if (!seen.has(key)) { seen.add(key); emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, { label, worldX: … , worldZ: …, tile: …}); state.controls.actionMessage = label; state.controls.actionKind = "milestone"; } };
  if ((state.buildings.farms ?? 0) >= 1) tryMilestone("firstFarm", "First Farm built! +5 food/min coming");
  if ((state.buildings.lumbers ?? 0) >= 1) tryMilestone("firstLumber", "First Lumber Camp built!");
  if ((state.buildings.warehouses ?? 0) >= 1) tryMilestone("firstWarehouse", "First Warehouse built!");
  if ((state.buildings.kitchens ?? 0) >= 1) tryMilestone("firstKitchen", "First Kitchen — meals boost hunger recovery");
  if ((state.resources.meals ?? 0) >= 1) tryMilestone("firstMeal", "First Meal cooked!");
  ```
  里程碑的 `worldX/worldZ` 取 colony center（`state.metrics?.colonyCenter ?? { x: grid.width/2, z: grid.height/2 }` 转 world），没有就省略 spatial toast（SceneRenderer 端已容错）。
  - depends_on: Step 2

- [ ] **Step 6**: `index.html:901-934` (`#hudFood` / `#hudWood` / `#hudStone` / `#hudHerbs` / `#hudWorkers` 各自的 `<div class="hud-meter">` 内) — edit — 在 `<span class="hud-label" id="statusXxx">0</span>` 前插入 `<span class="hud-sublabel">Food</span>` / `Wood` / `Stone` / `Herbs` / `Workers`。
  - depends_on: (independent)

- [ ] **Step 7**: `index.html:76-88` (`.hud-label` CSS block) — add — 新增 `.hud-sublabel { font-size: 9px; font-weight: 600; line-height: 1; opacity: 0.62; color: var(--text-muted, #9cb3c9); letter-spacing: 0.3px; margin-bottom: 1px; }` 与 `#ui.compact .hud-sublabel { display: none; }`（紧凑模式隐藏避免溢出）。
  - depends_on: Step 6

- [ ] **Step 8**: `index.html:183-210` (`.build-toast` CSS + `@keyframes toastFloat` 块) — add — 新增两个 kind 样式 + keyframe：
  ```
  .build-toast--death { color: #ffdcdc; background: rgba(198,40,40,0.92); border-color: rgba(255,107,107,0.55); box-shadow: 0 0 20px rgba(244,67,54,0.45); font-size: 14px; }
  .build-toast--milestone { color: #fff4b3; background: rgba(255,193,7,0.22); border-color: rgba(255,235,59,0.5); box-shadow: 0 0 24px rgba(255,193,7,0.38); font-size: 14px; font-weight: 900; }
  @keyframes toastDeath { 0%{opacity:0; transform:translate(-50%,-30%) scale(0.9);} 8%{opacity:1; transform:translate(-50%,-55%) scale(1.08);} 16%{transform:translate(-50%,-55%) scale(1);} 80%{opacity:1; transform:translate(-50%,-60%);} 100%{opacity:0; transform:translate(-50%,-80%);} }
  @keyframes toastMilestone { 0%{opacity:0; transform:translate(-50%,-30%) scale(0.7);} 15%{opacity:1; transform:translate(-50%,-55%) scale(1.2);} 30%{transform:translate(-50%,-55%) scale(1);} 100%{opacity:0; transform:translate(-50%,-110%) scale(1);} }
  ```
  同步修改 `#spawnFloatingToast` 的 `node.style.animation` 选择：`death` → `toastDeath 4s ease-out forwards`，`milestone` → `toastMilestone 3.2s ease-out forwards`；并把 `node._utopiaToastTimer` 的 `setTimeout` 延长到各自 duration + 50ms。
  - depends_on: Step 3

- [ ] **Step 9**: `src/ui/hud/HUDController.js:425` (obituary flash 渲染分支) — edit — 在写 `this.deathVal.textContent = this._obituaryText` 前加 guard：`if (state.ui?.deathToastShownUntil && now < state.ui.deathToastShownUntil) return;` 避免 SceneRenderer 已经弹了红 toast 时再重复"obituary 挤在 scoreboard"产生三重提示。同时 SceneRenderer Step 4 的订阅回调里写 `state.ui ??= {}; state.ui.deathToastShownUntil = now + 3500;`。
  - depends_on: Step 4

## 5. Risks

- **R1**: `deathContext.targetTile` 在部分降级路径（agent 在 spawn 帧立即死亡、Phase 9 fallback）里是 null。Step 2 已用 `Math.floor(entity.x/z)` 兜底；若 entity 没有 x/z 则 SceneRenderer Step 4 回调里判 `Number.isFinite(t.worldX)` 为假时跳过 spatial toast（仍写 objectiveLog，保持数据路径完整）。

- **R2**: `flash-action` 动画在 actionMessage 变化时触发，milestone 会短暂覆盖 AI Director / frontier.summary 的正常 action 提示（最长 2s）。通过在 `state.controls.actionKind = "milestone"` 下走自定义金色样式，且保持现有 `milestone → success → info` 优先级回落，避免新信息堵塞。

- **R3**: 资源 pill 加 sublabel 会让 `#statusBar` 总宽 ≈ +60px（5 × 12px）。在 1280px 以下的 breakpoints（已有 `@media(max-width:600px)` 和 `#ui.compact`）Step 7 已用 `display:none` 规避；主要风险在 1024-1280px 档位，如果 Round-1 01c-ui 的响应式 plan 未合并则可能短暂出现横向滚动条——索性保留 `#statusBar` 现有的 `overflow-x: auto`（index.html:64）兜底即可。

- **R4**: `state.metrics.resourceEmptySec` 是新字段，Phase 10 determinism harness 的 snapshot 序列化器（src/app/snapshotService.js）不会 panic——但若 benchmark 对 metrics deep-equal 校验则 Step 1 需要在 createInitialGameState 里预留 `{ food:0, wood:0 }` 以保持字段顺序稳定。

- **R5**: 可能影响的现有测试：
  - `test/hud-controller.test.js`（obituary 分支）——因为加了 `deathToastShownUntil` guard，需要断言中断行为或更新 stub；
  - `test/hud-latest-death-surface.test.js`——格式字段不变，但若与 obituary 路径耦合需核对；
  - `test/toast-title-sync.test.js`——应不受影响（我们只加 kind，没改接口）；
  - `test/ui-voice-consistency.test.js`——milestone 新文案走 `actionMessage`，若该测试枚举所有允许的 action 种类需要补 `"milestone"`。
  - Phase 10 benchmark deterministic assertions（long-horizon-bench）——字段扩字段，DevIndex 不受影响，零功能逻辑变动。

## 6. 验证方式

- **新增测试 1**: `test/hud-death-toast-event.test.js` — 覆盖场景：
  - stub SceneRenderer 订阅 + fake emitEvent，断言 MortalitySystem.recordDeath 后 `events.log` 最后一条 detail 包含 `tile`, `worldX`, `worldZ`, `foodEmptySec`；
  - stub `#spawnFloatingToast` 捕获 args，断言 kind === "death" + text 含 "starved"。
- **新增测试 2**: `test/hud-resource-sublabel.test.js` — 加载 index.html 片段（或直接 querySelector），断言 `#hudFood .hud-sublabel` 存在、textContent === "Food"，五种 pill 全部有 sublabel。
- **新增测试 3**: `test/progression-milestone.test.js` — 空 state → set `state.buildings.farms = 1` → 调用 `ProgressionSystem.update(0.1, state)` → 断言 `state.events.log` 含 type=COLONY_MILESTONE、label="First Farm built!" 的条目；再次调用不重复 emit（milestonesSeen 去重）。
- **手动验证**：
  - `npx vite` → 打开 `http://localhost:5173` → Start Colony (temperate_plains, seed 42)
  - 按 1 → Road → 点击中央 → 期望：金色 milestone toast "First X built!" 从点击位置浮起 3s
  - 按 `~` 暂停 → 输入 `window.__utopia.state.resources.food = 0` → `window.__utopia.state.agents[0].hunger = 0.01` → 取消暂停 → 等 ~30s → 期望：工人饿死时地图上浮出**红底 4s toast** "Name-N starved — food empty 30s"，位置在 worker tile
  - 顶栏五个 pill 下方新增 Food / Wood / Stone / Herbs / Workers 小字 label（普通模式可见，compact 模式隐藏）
- **benchmark 回归**：
  - `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365` — DevIndex 不得低于 42（v0.8.1 基线 44 - 5% = 41.8 → 42）；
  - `node --test test/*.test.js` — 865 tests pass（+3 新测试 = 868）。

## 7. UNREPRODUCIBLE 标记

不适用——未启动 Playwright 复现，因为 reviewer 的三个现象全部可通过代码审查直接定位：
- P0-3 死亡视觉：`MortalitySystem.js:196-218` 只 push 文本到 `objectiveLog`，HUDController 仅渲染 scoreboard 行——和 reviewer 反馈"没有红色 toast"完全一致，**无需运行时复现**。
- P1-4 pill label：`index.html:901-934` 的 DOM 结构里 `.hud-label` 只有数字，无 sublabel——**静态复现**。
- P2-5 milestone：`ProgressionSystem.js` 无 milestone 逻辑，`COLONY_MILESTONE` event type 从未被 emit（全仓库 grep 仅一处 DeveloperPanel 被动渲染）——**静态复现**。
