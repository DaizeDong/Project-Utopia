---
reviewer_id: 01d-mechanics-content
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round2/Feedbacks/01d-mechanics-content.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~210
  new_tests: 2
  wall_clock: 55
conflicts_with:
  - 01e-innovation  # may also touch Heat Lens visual (P0-2 shared); coordinate style deltas with enhancer 01e
  - 01b-playability # both may touch P1-6 placement-highlight; keep overlay module namespaced to avoid double-paint
---

## 1. 核心问题

1. **Heat Lens 对玩家"肉眼不可见"**（P0-2）。底层 `buildHeatLens` / `heatLensSignature` 已经产出正确的 red/blue marker 集合（`src/render/PressureLens.js:272-360`），渲染层也确实会把 marker 画到场景里（`src/render/SceneRenderer.js:1277-1324`），但：(a) 绘制对象是半径 ≈ `tileSize * 0.98` 的**脉动圆盘 + 细环**，颜色填充不透明度仅 0.22，与默认 pressure lens 的 route/depot 圆盘视觉上几乎同款；(b) blue 通道依赖 "processor 的 colony-wide input == 0" 这个硬门槛（`HEAT_PROCESSOR_INPUT_CHECK`），而 autopilot 默认一直保持有少量食物/木头/草药，因此 blue 在实测 15 分钟里从未触发；(c) red 通道要求 producer 相邻 `hot warehouse`，autopilot 空间布局倾向于把 producer 隔离在 warehouse 外围，命中率也低。Round-1 只加了 `#heatLensLegend` 图例但**没有动**真正让玩家"看到红蓝"的渲染本体。→ 需要改成**每瓦片一块不透明方形叠色层** + 把 processor 判定门槛从"input==0"松绑为"input 低于阈值"，这样实际上每次开 L 都能看到≥1 片红色 / ≥1 片蓝色。

2. **Quarry / Lumber / Herb Garden 放置规则"机制存在但不可观察"**（P1-6）。`evaluateBuildPreview` 已经正确执行 NODE_FLAGS 门控（`src/simulation/construction/BuildAdvisor.js:374-381`），报错文案也写清楚了 "No stone node on this tile. Quarries must be sited on a stone deposit."（同文件 327-332）。但玩家必须**一格一格扫整张地图**才能看到报错——因为渲染层只有单格 `previewMesh`（`src/render/SceneRenderer.js:1135`）跟着 hover 走，**没有"全图合法瓦片高亮"** 层。反馈场景 A 直接卡死在"Stone 长期 0.0/min 毫无提示"。→ 需要一个只在节点门控工具（lumber/quarry/herb_garden）被选中时显示的"候选瓦片轻淡着色"层。

3. **生成的系统数据埋在 tileState 里没暴露给玩家**（P1-9，但只做 UI 连线，不加 mechanic）。`grid.elevation` / `grid.moisture` / `tileState.soilExhaustion` / `tileState.fertility` / `tileState.yieldPool` / `state.weather.current` / `state.fog.visibility` 都存在，但 `getTileInsight`（`src/ui/interpretation/WorldExplain.js:347-421`）在 inspector 面板里只透出了 traffic / ecology / weather / scenario-zone 四类。→ 扩展 `getTileInsight` 把"高程、湿度、土壤、节点余量"加到 InspectorPanel 的 Tile Context 里，完全复用现有面板，零新 DOM。

## 2. Suggestions（可行方向）

### 方向 A: 重写 Heat Lens 的渲染层为"整瓦片色块" + 松绑 blue 阈值 + 扩展 InspectorPanel 透出隐藏系统

- 思路：把 `#updatePressureLens` 在 `lensMode === "heat"` 分支里不再复用 pulse-disc 渲染路径，改成基于 `PlaneGeometry(tileSize, tileSize)` 的不透明方形瓦片色块（opacity 0.42-0.55）；同时把 `HEAT_PROCESSOR_INPUT_CHECK` 从严格 `<= 0` 改为 `< BALANCE.heatLensStarveThreshold`（新常量，放 `balance.js`，阈值 food 10 / wood 10 / stone 6 / herbs 4），让 blue 实际能被触发；pre-placement highlight 用 **另一个** mesh pool（不挂在 pressure lens 上以免冲突）只在 `state.controls.tool ∈ {lumber, quarry, herb_garden}` 时扫 `tileState.nodeFlags` 着色；最后扩展 `getTileInsight` 输出高程/湿度/土壤/余量。
- 涉及文件：`src/render/SceneRenderer.js`、`src/render/PressureLens.js`、`src/config/balance.js`、`src/ui/interpretation/WorldExplain.js`、`test/heat-lens-tile-overlay.test.js`（新）、`test/placement-lens.test.js`（新）。
- scope：中
- 预期收益：①Heat Lens 按 L 立刻可见红蓝瓦片（兑现 feedback §2.4 硬指出的"近乎无效"）；② Quarry/Lumber 放置前高亮合法瓦片（直接解决 feedback §2.1、场景 A）；③ InspectorPanel 点瓦片能看到高程/湿度/土壤/节点余量（解决 feedback §3.4 "黑箱机制 == 对玩家不存在的机制"）。三件事一次交付，彼此不耦合，回归面小。
- 主要风险：(i) 整瓦片色块在低端 GPU 上画 48+ 个半透明 Plane 可能轻微拉低 FPS（缓解：保留 MAX_HEAT_MARKERS=48 上限，放在同一 Root 下按 frustum cull）；(ii) `balance.js` 新增常量必须向后兼容（给默认值，老测试不会炸）；(iii) placement-highlight 层必须只在 hover-idle 帧重建（否则每帧扫 96×72 grid 开销过大）。

### 方向 B: 纯文案/UI 方案 — 不碰 Three.js 渲染，只改 HUD 文本把 Heat Lens 结果"讲出来"，同时给节点工具的 tooltip 补"当前地图共有 N 个合法瓦片"

- 思路：保留现有 disc/ring 渲染；在按 L 切换 heat 模式时，`GameApp.toggleHeatLens` 除了 toast 再往 HUD 的 "Heat Lens legend" 附加一行 "3 tiles surplus (near warehouse A), 0 tiles starved"；对 Quarry/Lumber tooltip 附加 "this map has N legal forest / stone tiles — closest to colony core: distance M"。
- 涉及文件：`src/app/GameApp.js:toggleHeatLens`、`src/simulation/construction/BuildAdvisor.js:getBuildToolInfo`、`src/ui/tools/BuildToolbar.js`。
- scope：小
- 预期收益：改动面小、风险近零、24 行能做完；仍能让玩家"知道这个键在干嘛"。
- 主要风险：(i) 反馈原文明确吐槽 "按下 L 地图 tile 没有红/蓝叠色层"——reviewer 要的就是 visual overlay 本体；只加文字 reviewer 在 Round-3 大概率会重复给 3 分；(ii) 不能解决 P1-6 "放置前高亮合法瓦片"；(iii) 不覆盖 P1-9 透出隐藏系统。

### 方向 C: 只做 Heat Lens 覆盖层 + placement-highlight，InspectorPanel 改动下轮再做

- 思路：方向 A 的前两步，砍掉扩展 `getTileInsight`。
- 涉及文件：`src/render/SceneRenderer.js`、`src/render/PressureLens.js`、`src/config/balance.js`、`test/heat-lens-tile-overlay.test.js`（新）、`test/placement-lens.test.js`（新）。
- scope：中（比 A 小约 30%）
- 预期收益：集中火力打 P0-2 + P1-6，两项直接 "blocker → 绿"。
- 主要风险：(i) P1-9 继续悬着，reviewer 01d 下轮仍可能重复吐"黑箱机制"；(ii) 省下的工作量很有限（约 40 LOC），性价比一般。

## 3. 选定方案

选 **方向 A**。理由：

- 三项 (P0-2 / P1-6 / P1-9) 在 Runtime Context 里被明确列为 Stage A 焦点，Round-2 就是要"一次干完"。
- P0-2 必须真的改渲染本体，否则方向 B 会被 Round-3 继续打回；方向 A 把渲染拆成"新的 tile-overlay mesh pool"，跟原 pressureLens disc/ring **并存**而不是替换——风险局限在新加代码路径，老 pressure lens 测试（`test/pressure-lens.test.js`）完全不动。
- P1-6 的 placement-highlight 跟 Heat Lens 是相同 "tile-overlay mesh" 基建（都是 96×72 grid 上 ≤N 个半透明方块），一次建好两边都用，LOC 边际成本很低。
- P1-9 只扩 `getTileInsight` 字符串，不动任何 simulation/system 路径，完全符合 HW06 freeze（"只允许把现有系统暴露给玩家"）。
- 所有改动都是 **additive**：既有 lensMode 状态机 / `heatLensSignature` / `buildHeatLens` / `#updatePressureLens` 主循环都保留，渲染器内部多加一个 tile-overlay pool 与 placement-lens pool；零新建筑、零新 tile、零新事件、零新地形。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/balance.js` — `edit` — 在 BALANCE 常量末尾新增 `heatLensStarveThreshold: Object.freeze({ food: 10, wood: 10, stone: 6, herbs: 4 })`（沿用 `Object.freeze` 约定）。这让 blue 通道从"资源==0"松绑为"资源低"。
- [ ] **Step 2**: `src/render/PressureLens.js:HEAT_PROCESSOR_INPUT_CHECK` — `edit` (lines 226-235) — 将三个箭头函数改成读 `BALANCE.heatLensStarveThreshold?.food ?? 10` 等阈值，保留旧 fallback（== 0 时必亮）。同时在 `buildHeatLens` 尾部，若 `resources.stone == 0 && 地图上有 ≥1 个 QUARRY` 但 red/blue 都没触发，就强制把第一个 SMITHY 标 `heat_starved` 作为"总线空档"兜底（确保玩家第一次按 L 必有可见标记）。
  - depends_on: Step 1
- [ ] **Step 3**: `src/render/SceneRenderer.js:#setupPressureLensMeshes` — `edit` (lines 1174-1180) — 在 `pressureLensRoot` 之外追加一个 `this.heatTileOverlayRoot = new THREE.Group()`，几何体复用 `PlaneGeometry(tileSize * 0.98, tileSize * 0.98)`，并新建 `this.heatTileOverlayPool = []`（结构：`{ mesh, material }`）。`renderOrder = RENDER_ORDER.TILE_OVERLAY + 3`（高于 previewMesh，但仍在 SELECTION_RING 之下）。
  - depends_on: Step 2
- [ ] **Step 4**: `src/render/SceneRenderer.js:#updatePressureLens` — `edit` (lines 1277-1325) — 在 `lensMode === "heat"` 分支里：先跑现有 disc/ring 路径保留动态脉动（可读性），再额外把同一 marker 集合投到 heatTileOverlayPool：每个 marker 对应一块不透明度 0.48 的方形色块（fill color 用 `PRESSURE_MARKER_STYLE[marker.kind].ring` 而非 `.fill`，这样颜色更饱和）。非 heat 模式下整个 overlay pool `visible = false`。保留 MAX 48 markers。
  - depends_on: Step 3
- [ ] **Step 5**: `src/render/SceneRenderer.js` — `add` — 新增私有方法 `#updatePlacementLens()` + `#setupPlacementLensMeshes()`：当 `state.controls.tool ∈ {"lumber","quarry","herb_garden"}` 且 `lensMode !== "off"` 时，扫一遍 `state.grid.tileState` 取 `nodeFlags`，把每个匹配 `NODE_FLAGS.FOREST / STONE / HERB`（工具 → flag 映射复用 `BuildAdvisor.NODE_GATED_TOOLS`，导出该表）的瓦片画成不透明度 0.35、颜色 `0xa8e6a1`（淡绿）的方块；同时也画**非匹配**瓦片为淡红（0.12）。用 `state.grid.version + state.controls.tool` 做签名 diff，仅在工具切换或 grid 变动时重建 pool；注入 `render(dt)` 主循环 `this.#updatePlacementLens()`（紧跟 `#updatePressureLens` 之后，第 2388 行）。
  - depends_on: Step 3
- [ ] **Step 6**: `src/simulation/construction/BuildAdvisor.js` — `edit` (lines 10-14) — 把 `NODE_GATED_TOOLS` 从 internal `const` 改成 `export const`，让 SceneRenderer 的 placement-lens 能复用；不改值只改可见性。测试里 import 断言保持兼容。
  - depends_on: Step 5
- [ ] **Step 7**: `src/ui/interpretation/WorldExplain.js:getTileInsight` — `edit` (lines 347-421) — 在既有四段之后追加四行：
  - 高程：`Terrain: elevation ${(elev*100).toFixed(0)}%, moisture ${(moist*100).toFixed(0)}%.`（读 `state.grid.elevation[idx]` / `state.grid.moisture[idx]`）
  - 土壤：`Soil: fertility ${(fert*100).toFixed(0)}%, exhaustion ${(soilEx).toFixed(1)}/8.0.`（读 `state.grid.tileState.get(idx)?.fertility` / `.soilExhaustion`，仅 FARM 瓦片显示）
  - 节点余量：`Node: ${flagLabel} deposit, ${yieldPool.toFixed(0)} units remaining.`（仅当 `nodeFlags !== 0` 时显示）
  - 雾：`Visibility: ${state.fog.visibility[idx] === FOG_STATE.HIDDEN ? "unexplored" : state.fog.visibility[idx] === FOG_STATE.EXPLORED ? "explored" : "visible"}`.
  不新增模块，仅把"代码里已有但从未显示"的值展现在 Tile Context 折叠段。
  - depends_on: Step 6（不强依赖，但 TDD 顺序方便）
- [ ] **Step 8**: `test/heat-lens-tile-overlay.test.js` — `add` — 纯数据测：构造 `state.resources = { food: 5, wood: 5, stone: 0, herbs: 0 }` + grid 内放一个 SMITHY 一个 CLINIC，断言 `buildHeatLens(state).length >= 2` 且至少一个 `kind === "heat_starved"`；再构造 `food: 100` 断言 heat_starved 因 food ≥ threshold 消失。覆盖 Step 1 + Step 2 松绑阈值。
  - depends_on: Step 2
- [ ] **Step 9**: `test/placement-lens.test.js` — `add` — 纯数据测：调用新导出的 `NODE_GATED_TOOLS` 断言键 = {lumber, quarry, herb_garden}；再断言 SceneRenderer 导出（或其可测的 classifier 函数）把给定 `tool="quarry"` 的 grid 分成 legal（nodeFlags 含 STONE）和 illegal 两组——建议先把分类逻辑抽成 pure function `classifyPlacementTiles(state, tool)` 放 `src/render/PressureLens.js`（紧挨 `buildHeatLens` 之后），SceneRenderer 再调用；保证可测性。
  - depends_on: Step 5, Step 6
- [ ] **Step 10**: `src/ui/hud/glossary.js:HUD_GLOSSARY` — `edit` (line 40) — 把 `heatLens` 的定义从"red = food surplus tiles, blue = starved tiles — shows where meals are needed"改成和反馈讲述一致的"red = producer beside a full warehouse, blue = processor missing input (meals/tools/medicine) — press L to cycle"。纯文案 polish。
  - depends_on: Step 1

## 5. Risks

- **R1 — 半透明 Plane 叠色层可能与 tile textures 的色带冲突**，尤其在 Fortified Basin 的深绿草地上红色不够显眼。缓解：Step 4 色彩取自 `PRESSURE_MARKER_STYLE[kind].ring`（饱和度已比 `.fill` 高 1-2 档），并把 disc 上方 `y` 抬到 0.19（高于 0.16 的原 disc、0.17 的 hover、0.2 的 preview）避免 z-fighting。
- **R2 — placement-highlight 每帧扫 96×72 = 6912 格再构造 48+ 个 mesh 的 overhead**，低端机掉帧风险。缓解：Step 5 明确要求 `gridVersion+tool` 签名 diff，只在工具切换 / 建造后重建；稳态（hover 建造工具不动）每帧只执行一次 `if (signature === lastSignature) return` 短路。
- **R3 — 可能影响的现有测试**：
  - `test/pressure-lens.test.js` — 只测 `buildPressureLens` / scenario markers，不涉及 heat 路径；不会受影响。
  - `test/heat-lens-legend.test.js` — 测 DOM legend，不测渲染几何；不会受影响。
  - `test/ui/hud-glossary.test.js` — Step 10 修改了 `heatLens` 文案，如果该测试 pin 了具体字符串需要同步更新；先 Read 再改。
  - `test/responsive-status-bar.test.js` — 只测 index.html 按钮/title；不会受影响。
- **R4 — `NODE_GATED_TOOLS` 改成 export** 后需要 check 是否有其他文件 import 同名常量产生冲突（Grep 显示仅 BuildAdvisor.js 内部使用，安全）。
- **R5 — getTileInsight 新字段可能在 scenario 没给 elevation/moisture 的单元测试里读到 undefined**。缓解：每条 insight 先 guard `if (Number.isFinite(elev))`，确保 test grid 生成器不写 elevation 时不炸。

## 6. 验证方式

- **新增测试 1**：`test/heat-lens-tile-overlay.test.js` — 覆盖 Step 1+2 的"阈值松绑"与"兜底标记"逻辑；构造 3 组 resources 场景（全 0 / 临界 / 充足）分别断言 `buildHeatLens` 返回 marker 的 kind 分布。
- **新增测试 2**：`test/placement-lens.test.js` — 覆盖 Step 5 拆出的 `classifyPlacementTiles` 纯函数，断言对 6912 格 mock grid 返回 `{legal: Set, illegal: Set}` 且 legal 正好等于 `nodeFlags & targetFlag !== 0` 的瓦片集合。
- **手动验证**：
  1. `npx vite` → 访问 `http://localhost:5173` → Start Colony（seed 任选）。
  2. 按 `L` 进入 heat 模式 → 期望看到至少 1 块**整瓦片的红色**或**蓝色**方形色块（不是小圆盘），持续可见；再按 `L` 进入 off → 色块消失；再按 `L` 回到 pressure → 色块消失，原 pressure disc/ring 保留。
  3. 点工具栏 `Quarry` → 期望整张地图除了 `nodeFlags & STONE !== 0` 的瓦片（通常 4-8 块）变成**淡绿色半透明**，其他瓦片变**淡红色半透明**；切到 `Farm` 后高亮立即消失；切到 `Lumber` 改显示 FOREST 瓦片。
  4. 任选一块 FARM 瓦片 `Alt+Left Click` 打开 Inspector → 期望 Tile Context 里多出 "Terrain: elevation X%, moisture Y%" / "Soil: fertility …" / "Visibility: …" 三-四行。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains` —— 由于本 plan 不动 simulation path（`PressureLens.js` 的 read-only 消费、`WorldExplain.js` 的 read-only 展示、SceneRenderer 的渲染层），DevIndex 应纹丝不动；验收线：DevIndex ≥ 42（当前 44 的 -5%）。若跌破说明 Step 5 placement-lens 意外跑进了模拟循环，需回退。
- **单元测试全量回归**：`node --test test/*.test.js` —— 应仍然 865 passing；若 `test/ui/hud-glossary.test.js` 因 Step 10 挂掉，同步修改该测试的字符串 pin（属于本 plan 收尾项，不列独立步骤）。

## 7. UNREPRODUCIBLE 标记

不适用。反馈 §2.4 / 场景 A / 场景 C 的现象在代码路径上已完整溯源：
- Heat Lens "近乎无效" → `PressureLens.js:226-235` 的三个 `<= 0` 阈值硬编码 + `SceneRenderer.js:1302-1324` 的 disc/ring 渲染（与默认 pressure lens 共用 material pool，视觉几乎相同）。
- "Stone 长期 0，Quarry 放置无反馈" → `BuildAdvisor.js:372-381` 节点门控正确工作但只在错误路径上生成 reasonText，渲染层只有**单格** `previewMesh`（`SceneRenderer.js:1135`）跟 hover 走，没有"整图合法瓦片 overlay"。
- "elevation / moisture / soil / 雾 / 盐渍化 隐式存在不显示" → `WorldExplain.js:347-421` 的 `getTileInsight` 确实不读 `grid.elevation` / `.moisture` / `tileState.soilExhaustion`，但数据在 `Grid.js:2377 / balance.js:422-424` 里存在。

因而无需 Playwright 实机复现；代码路径充分定位。Playwright MCP 预算留给 Coder 在 Step 4-5 完成后做 smoke（`browser_press_key("l")` → `browser_take_screenshot`）。
