---
reviewer_id: 01a-onboarding
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round2/Feedbacks/01a-onboarding.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~210
  new_tests: 2
  wall_clock: 70
conflicts_with: []
---

## 1. 核心问题

1. **开局不是"开局"，是"已在崩塌中的殖民地"。** `buildFrontierRepairScenario` / `buildGateChokepointScenario` / `buildIslandRelayScenario` 在 Start Colony 瞬间就把 1 warehouse + 4 farms + 2 lumber + 7 walls + 多段 road 直接写进 `grid.tiles`，随后 `ColonyDirectorSystem` / `AgentDirectorSystem` 的 autopilot 继续铺建筑，导致外部玩家看到"7 warehouses / 14 farms / 3 lumber"（远超 goal 2/4/3），紧接着仓库被火灾/vermin 或玩家无操作下消耗，任务栏目标数字反倒退到 0/2。**根因在于"场景预铺"与"目标 target"两套数值是独立写死的，并未以"玩家要在目标下从 0 起点造出来"为设计前提**（src/world/scenarios/ScenarioFactory.js:237 的 WAREHOUSE 直接 stamp + Lines 239-249 的 FARM/LUMBER/WALL cluster）。

2. **迷雾机制可感知度 = 0。** 视线与 fog state 在 `VisibilitySystem` 里完整存在（state.fog.visibility），Minimap.js 也已画深色覆盖，但 3D 主场景的 `FogOverlay` 类（src/render/FogOverlay.js:22）仍是 Phase 7 的 stub —— `attach()` 和 `update()` 都 `TODO`，SceneRenderer 也没 `new FogOverlay()`。结果：建造工具会用 `BuildAdvisor.js:326` "Cannot build on unexplored terrain. Scout this area first." 直接报红，但玩家**根本看不见迷雾在哪**，也读不懂"Scout" 具体是什么动作。这是 feature-freeze 边界最紧的问题 —— 新增 Scout 工具禁止，但把"已有的 fog.visibility 画到 3D 地图上"属视觉 polish，合规。

3. **里程碑事件完全哑火。** `GameEventBus.js:21` 定义了 `COLONY_MILESTONE` event type，但全代码库没有任何系统 `emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, …)`（仅 `DeveloperPanel.js:74` 被动读）。新手造出第一个 farm / 第一个 meal / 第一个 tool 都没有任何庆祝、数字脉冲、storyteller strip 条目；再叠加核心问题 1 的"开局就有 4 farms"，新手连"我刚造了一个新农场"这件事都无从感知。

## 2. Suggestions（可行方向）

### 方向 A: 精简场景预铺 + 把 fog overlay 接到 3D 场景 + 发射 milestone 事件（主推）

- 思路：三件事一气呵成，分别对治上述三个根因。
  - **(i) 场景瘦身**：在 `ScenarioFactory.js` 的三个 `build*Scenario` 里，把 scenario stamp 降级为"起点警示组"——1 warehouse（保留，core spawn 需要）、1 farm、1 lumber、2-3 wall 残骸 + ruins 标记，**不再** pre-build 4 farms/多 wall cluster。把 goal 数字相应调低仍然保持 0→goal 的递进感（warehouses:2 可保持，farms 和 lumbers 的目标降到与新场景起点匹配）。
  - **(ii) fog overlay 上线**：把 `FogOverlay.js` 从 stub 升级为"基于 state.fog.visibility 的轻量 DataTexture/InstancedMesh 染色层"，加到 `SceneRenderer` 场景树，按 `fog.version` 做 needsUpdate。只渲染 HIDDEN 深色 + EXPLORED 中灰两档（VISIBLE 全透明）—— 不新增机制只新增可视化。
  - **(iii) milestone 发射**：在 `BuildSystem.js`（或 ProgressionSystem.js 的 applyBuild 后 hook）里，当一个 tile type 在本 run 里第一次达到阈值（first farm / first kitchen / first meal stockpiled / first tool crafted）时 `emitEvent(state, EVENT_TYPES.COLONY_MILESTONE, {…})`。再在 `HUDController.js` 里订阅并在 storyteller strip 上 flash 一条"First Farm raised — your colony eats tonight"（复用已有的 flash-action 动画）。
- 涉及文件：`src/world/scenarios/ScenarioFactory.js`、`src/render/FogOverlay.js`、`src/render/SceneRenderer.js`、`src/simulation/construction/BuildSystem.js`（或 `ProgressionSystem.js`）、`src/ui/hud/HUDController.js`、以及 2 个新测试。
- scope：中
- 预期收益：第一次接触游戏的玩家 60 秒内能"看见"自己从 1 个 warehouse 起点做到了 2 个 warehouse；迷雾直接可见；造 first-farm 有反馈 flash。覆盖 feedback 列出的"严重缺陷 1, 7, 10"三条的症状端。
- 主要风险：
  - 场景预铺削减会让现有 benchmark（long-horizon-bench / SimHarness）首日指标下滑，需要 snapshot compare；
  - FogOverlay stub→实现可能与 `scenarioFocus` marker 的 z-fighting，需要 renderOrder 调节；
  - milestone 过于频繁或门槛写错会 spam strip。

### 方向 B: 只做 UI-layer 的 Quickstart Coach 卡片（小 scope）

- 思路：不动 scenario stamp、不动 FogOverlay、不动 event bus；仅在 `GameStateOverlay` / `HUDController` 层塞一个"第一局引导"卡片层：
  - 进入 `session.phase === "active"` 的前 60 秒，显示一条大字 action hint："Your starter warehouse is at the center. Build 1 more Farm west of it to feed your workers."
  - 触发 build farm 后，自动切到下一 hint：Build 1 Lumber Camp on the yellow forest-node marker.
  - 触发 build lumber 后：Walk a Worker west — the gray area is fog, unexplored tiles reveal as they approach.
- 涉及文件：`src/ui/hud/HUDController.js`、可能新增 `src/ui/hud/FirstRunCoach.js`、index.html 里加一个 hidden 卡片 slot。
- scope：小
- 预期收益：最低成本命中"没有教学"的根症状（feedback 缺陷 1），但没有修"开局数值不合理"和"fog 不可见"的结构问题。
- 主要风险：仍然会被"goal 已超过开局"的错觉抵消，玩家看到卡片让他造 farm 但屏幕上已经有 4 个 farm，反而更困惑；相当于在坏示意上贴告示。

### 方向 C: 纯"场景预铺 + 目标 target 对齐"最小修

- 思路：只改 `ScenarioFactory.js` 一个文件：确保场景 stamp 的 warehouse/farm/lumber/wall 数全部严格 **低于** `scenario.targets.logistics` 中的对应值（例如 logistics.warehouses:2，则只 stamp 1；farms:4 则只 stamp 1；lumbers:3 则只 stamp 1；walls:4 则只 stamp 0，全部留给玩家）。保留 ruins / road skeleton 作为 scenic 引导。
- 涉及文件：`src/world/scenarios/ScenarioFactory.js`（三个 build*Scenario 函数）。
- scope：小
- 预期收益：直接解决"开局即完成"的错觉，也解决"目标倒退"的观感 —— 因为开局数字是低于 target 的，玩家操作就是朝 target 靠近。
- 主要风险：没碰 fog 和 milestone，feedback 里"迷雾隐形"和"无里程碑"两条仍然开放；可能需要在下一轮再开工。

## 3. 选定方案

选 **方向 A**，理由：

- 本 reviewer 被分配的焦点是 P0-5 + P1-5 + P2-5 三件事，方向 A 是唯一**一次覆盖三者**的方案，方向 B 只补教学文案、方向 C 只修开局数值，都会留坑进下一轮。
- Priority 是 P0（P0-5 被 6 个 reviewer 独立提出），但每一块实际改动 LOC 都可控（FogOverlay 已有 stub 骨架，milestone 事件总线已有 type），中等 scope 即可落地。
- 风险主要集中在 benchmark 指标漂移，可通过先做方向 C 的那部分、跑 `scripts/long-horizon-bench.mjs` 基线对比再继续 —— 纳入"验证方式"即可。
- HW06 freeze 检查：场景 stamp 削减 = balance 参数调整（允许）；FogOverlay 从 stub 到实现 = polish/fix（允许）；milestone 事件发射 = 用已定义 type，不加新 mechanic（允许）。三项均不越线。

## 4. Plan 步骤

- [ ] **Step 1**: `src/world/scenarios/ScenarioFactory.js:239` — `edit` — `buildFrontierRepairScenario`: 把 `stampCluster(grid, center, [{ x: 1, z: 2 }, { x: 2, z: 2 }, { x: -1, z: 2 }, { x: -2, z: 2 }], TILE.FARM)` 从 4 个 FARM 削减为 1 个（保留 `{ x: 1, z: 2 }` 即可）；把 Line 240 的 2 个 LUMBER cluster 削减为 1 个（仅保留 `center, [{ x: 3, z: -1 }]`）；把 Line 248-249 的 7 walls 削减为 2-3 walls（保留 eastDepot 的 `[{ x: 0, z: -1 }, { x: 0, z: 1 }]`，删除 center 四角 walls）。ruins 保留不动。

- [ ] **Step 2**: `src/world/scenarios/ScenarioFactory.js:378` — `edit` — `buildGateChokepointScenario`: 同样把 `southGranary` 的 2 FARM 削减为 1；把 northGate / southGate 各 6 walls 的两组 stampCluster 削减为每组 2 walls（保留 `{ x: -1, z: 0 }, { x: 1, z: 0 }`）；中央 center 的 9 walls cluster（Lines 382-386）削减为 3 walls（保留南墙 `{ x: -1, z: 3 }, { x: 0, z: 3 }, { x: 1, z: 3 }`）。

- [ ] **Step 3**: `src/world/scenarios/ScenarioFactory.js:527` — `edit` — `buildIslandRelayScenario`: 把 eastFields 的 2 FARM 削减为 1；relayDepot 的 2 walls 保留（已经少）。

- [ ] **Step 4**: `src/world/scenarios/ScenarioFactory.js:317` / `:457` / `:606` — `edit` — 三个 scenario 的 `targets.logistics` 数字保持现值（warehouses:2, farms:4, lumbers:3, walls:4/10/6），**不改 target**，让 stamp 低于 target 的差值变成"玩家可见的 0→N 进度"。

- [ ] **Step 5**: `src/render/FogOverlay.js:22` — `edit` — 替换 `FogOverlay` 类：
  - `attach(scene)`: 创建 `PlaneGeometry(grid.width * tileSize, grid.height * tileSize)` + `ShaderMaterial` with transparent + depthWrite:false；material uniforms 包含 `tVisibility`（`THREE.DataTexture`, R channel, width × height）。fragment shader 采样 `tVisibility` 读出 FOG_STATE，映射到 alpha: VISIBLE→0.0，EXPLORED→0.35，HIDDEN→0.75；color 恒为深灰 `#0b141c`。renderOrder = 3（在 tileBorderLines 之上、selection ring 之下）。
  - `update(state)`: 当 `fog.version !== lastFogVersion` 或 `visibility.length` 变化时，把 `fog.visibility` 字节复制进 DataTexture 并 `needsUpdate=true`。
  - `dispose()`: `mesh.geometry.dispose() / material.dispose() / texture.dispose()`。
  - depends_on: —

- [ ] **Step 6**: `src/render/SceneRenderer.js:494` — `edit` — 在 constructor 的 `this.scene.add(this.tileModelRoot, …)` 之后实例化 `this.fogOverlay = new FogOverlay(this.state.grid)` 并调用 `this.fogOverlay.attach(this.scene)`。在 `updateFrame()`（或现有 per-frame 更新钩子）里调用 `this.fogOverlay.update(this.state)`。在 `dispose()` 中调用 `this.fogOverlay.dispose()`。import 路径 `"./FogOverlay.js"`。
  - depends_on: Step 5

- [ ] **Step 7**: `src/simulation/meta/ProgressionSystem.js:update` — `edit` — 在既有的 tile-count 扫描或 applyBuild hook 点加 `#detectMilestones(state)`：跟踪 session-local `state.progression.milestonesFired` Set；当 `counts.farms` 从 0 变 ≥1 → 发射 `COLONY_MILESTONE` with `{ kind: "first_farm", label: "First Farm raised" }`；类似地 first_lumber, first_warehouse_player_built（要减去场景 stamp 的 1 个 baseline）、first_meal (`resources.meals >= 1` 的跃迁)、first_tool (`resources.tools >= 1`)。每个 kind 只触发一次。若 ProgressionSystem 不合适，选 `src/simulation/construction/BuildSystem.js:applyBuild` 的成功返回后 hook。
  - depends_on: —

- [ ] **Step 8**: `src/ui/hud/HUDController.js:~760` — `edit` — 在 render() 里新增 `#renderMilestoneFlash(state)`：扫描 `state.events.log` 最新 ~3 秒内的 `COLONY_MILESTONE` 事件，把最新一条塞进 `this.storytellerStrip`（与现有 `_obituaryText` 同一通道复用，dwell 2500 ms），并通过已有 `flash-action` class 触发一次 pulse。文案取事件 `detail.label`。
  - depends_on: Step 7

- [ ] **Step 9**: `test/scenario-footprint.test.js` — `add` — 新测试：import `buildScenarioBundle` + `createInitialGameState`，断言三个 family 的 **初始 `counts.warehouses ≤ targets.warehouses - 1` 且 `counts.farms ≤ targets.farms - 2` 且 `counts.lumbers ≤ targets.lumbers - 1`**。防止后续回归把 stamp 数值再调回来。
  - depends_on: Step 1-4

- [ ] **Step 10**: `test/milestone-emission.test.js` — `add` — 新测试：构造最小 state，手动 `applyBuild` 第一个 farm 后断言 `state.events.log` 含 `COLONY_MILESTONE` with `kind: "first_farm"`；再触发第二个 farm 后断言**不再重复**发射。
  - depends_on: Step 7

## 5. Risks

- **Benchmark DevIndex 漂移**：削减 4→1 farm、2→1 lumber、7→2 walls 会降低 SimHarness 首日产出，long-horizon-bench seed 42/temperate_plains 的 DevIndex 可能从 44 降到 ~38-40。需纳入 long-run bench 结果比对，若跌幅 >5% 需同步微调 `scenario.targets.logistics` 或 initial resources。
- **FogOverlay 与 Heat Lens 透明层干涉**：PressureLens root 已存在于 scene（SceneRenderer.js:1179），两者都是 renderOrder-敏感的半透明层；fog plane 的 z 要低于 Heat Lens 的 tile tint，避免热力区在迷雾下消失。
- **Milestone spam**：如果逻辑把 "tile 数 ≥ 1" 当条件，场景 stamp 完成那一帧会误发 first_farm。Step 7 必须用"counts 从 0 跃迁到 ≥1"而非"counts ≥ 1"判定，且要跳过 scenario bootstrap 那一帧（`state.metrics.timeSec >= 0.5` 门槛或 initial flag 置位后再监听）。
- **可能影响的现有测试**：
  - `test/scenario-*.test.js`（任何对 initial farm/warehouse/wall 计数硬编码的断言）
  - `test/long-horizon-bench.test.js`（如果存在）
  - `test/visibility-*.test.js`（新增 FogOverlay 不应改 VisibilitySystem 语义；仅渲染层）
  - `test/progression-*.test.js`（新增 milestone 发射可能与既有 progression 状态 shape 冲突）

## 6. 验证方式

- **新增测试**：
  - `test/scenario-footprint.test.js` —— 覆盖"三种 scenario 初始 counts 严格低于 targets" 场景。
  - `test/milestone-emission.test.js` —— 覆盖"first farm 事件发射且只发一次" 场景。
- **手动验证**：
  1. `npx vite` 起 dev server，浏览器打开 `http://127.0.0.1:5173`。
  2. 依次切三个模板（temperate_plains / rugged_highlands / archipelago_isles）按 Start Colony，检查初始 HUD 目标条：warehouses 应显示 `1 of 2 · farms 1/4 · lumbers 1/3 · walls 2-3 / 4`（而非 feedback 中 "4 farms built (goal 4) 7 walls placed (goal 4)"）。
  3. 地图 3D 视图应能看到**中央周边以外都是深灰遮罩**；按方向键移动 worker / 自动漫游后深灰逐层褪到中灰，再到透明。
  4. 让 worker 自动造第二个 farm，观察 storyteller strip 是否 flash "First Farm raised" 类文本 2-3 秒。
  5. 试点一个远处未探索 tile 放 road，依然看到 "Cannot build on unexplored terrain"，但此时玩家能**视觉定位迷雾边界**。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`，DevIndex 不得低于当前值 44 的 95%（即 >= 41.8）；死亡数不得比当前 454 上浮超过 10%（<= 499）。若越线，回退至方向 C 的最小修并重新评估 Step 1-4 的削减量。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。Playwright 复现被 Runtime Context 标为"可选"（build_url 127.0.0.1:5173 未确认在跑），但仓库代码层面 P0-5 / P1-5 / P2-5 三点均可在 file:line 级定位（ScenarioFactory.js 场景 stamp 实锤、FogOverlay.js 为 stub 实锤、GameEventBus.js COLONY_MILESTONE 无 emitter 实锤），无须浏览器复现即可生成 plan。
