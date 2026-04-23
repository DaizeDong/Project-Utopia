---
reviewer_id: 01e-innovation
feedback_source: Round2/Feedbacks/01e-innovation.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~180
  new_tests: 2
  wall_clock: 55
conflicts_with:
  - 01d-mechanics   # P0-2 Heat Lens overlap — we own visual strength (opacity/radius/tile coverage), 01d owns metric exposure
  - 02e-indie-critic # P0-6 storyteller voice overlap — we own actionable coordinate anchoring, 02e owned Round-1 voice polish
  - 02a-rimworld-veteran # P0-7 template selector — we own perceptual differentiation; 02a may own selector reproducibility
---

## 1. 核心问题

Reviewer 01e 的 3 条 P0 承诺，`Help → "What makes Utopia different"` 里列的三大卖点，在 Round-2 实测里仍然全部哑火或半哑火。归并成 3 个根本病因：

1. **Heat Lens 视觉太羞涩** — `buildHeatLens()` (`src/render/PressureLens.js:272`) 已经正确产出 `heat_surplus` / `heat_starved` markers，但渲染端 (`src/render/SceneRenderer.js:337-350`, `PRESSURE_MARKER_STYLE`) 给的 fillOpacity 只有 0.22、ring 半径 ≤ 0.95 tile、disc 位置 `y=0.16`，在 isometric 视角下几乎看不到。加上 RED 分支强依赖 `state.metrics.warehouseDensity.hotWarehouses.length > 0`，reviewer 100+ food 场景里 warehouse density 未必触发 threshold（`BALANCE.warehouseDensityRiskThreshold = 400`），所以连一块红都没亮。**没有修承诺的承诺，而是 UX 强度不够**。

2. **DIRECTOR 文本是机器话 + 无 actionable coordinate** — `describeWorkerFocus()` (`src/simulation/ai/llm/PromptBuilder.js:85-102`) 产出 6 个模板化短语（"route repair and depot relief" / "frontier buildout" 等），`adjustWorkerPolicy` (`:281`) 用 `Workers should sustain ${focus} while keeping hunger and carried cargo from overriding the map's intended reroute pressure.` 拼接。虽然 `storytellerStrip.humaniseSummary()` (`src/ui/hud/storytellerStrip.js:144`) 做了 6 条 regex 替换，但整体仍然是"system-prompt 语气 + 没坐标 + 没动词建议"。scenario runtime 已经有 `frontier.brokenRoutes[].gapTiles` (见 `src/render/PressureLens.js:59`) — **零新 mechanic，现成的数据只差拼接成一句 actionable copy**。

3. **Template 差异化感知弱** — 6 个 `TEMPLATE_PROFILES` (`src/world/grid/Grid.js:57-212`) 其实 roadHubs / waterLevel / blobs 都不一样（archipelago islandBias=0.46, rugged mountainStrength=0.52, fertile riverCount=2…）；Round-1 02e-indie-critic 已经把 scenario 的 `title / summary / hintInitial` 按 template 分叉 (`src/world/scenarios/ScenarioFactory.js:23-72`)。reviewer 的"只是目标数字不同"抱怨实际上是**开场第一眼没传达 template tag**：HUD 顶栏、sceneOverlay、storyteller 都没有写出 `{templateName} — {flavor}`，玩家切模板后第一帧无差别。选中 template → 生成成功 → 但 UI 从未复述 template 名字，是"承诺在那产品没告诉玩家"。

## 2. Suggestions（可行方向）

### 方向 A: Heat Lens 强视觉 + DIRECTOR actionable coord + Template ribbon（推）

- 思路：三个 P0 各做一刀"补承诺"的最小修改：
  - Heat Lens: `PRESSURE_MARKER_STYLE.heat_surplus/heat_starved.fillOpacity` 0.22→0.48, `ringOpacity` 0.7→0.9, `marker.radius` 0.95→1.35 (in `buildHeatLens` outputs)。额外在 `#updatePressureLens` (`SceneRenderer.js:1316-1323`) 给 heat mode 加 pulse 幅度从 0.08→0.22。让按 L 的一瞬间玩家能看见 ≥60% alpha 的 red/blue 盖在产/耗 tile 上。
  - DIRECTOR: 在 `describeWorkerFocus` 拼 focus 时，如果 `frontier.brokenRoutes[0].gapTiles[0]` 存在，追加 `` ` at (${ix},${iz}) — place Road here` ``；summary 拼接同理用 1 句 actionable（"West lumber line broken at (42,36). Place a Road tile to reconnect."）。fallback 仍用旧的 generic 句，防止数据缺时回落。
  - Template ribbon: 在 storytellerStrip 的 badge 前面再加一行小字 `${scenario.title} · ${templateName}`（已存在 state.world.mapTemplateId + state.gameplay.scenario.title），让玩家切模板第一帧就看见"Island Relay · Archipelago Isles"。
- 涉及文件：
  - `src/render/SceneRenderer.js`（PRESSURE_MARKER_STYLE + updatePressureLens）
  - `src/render/PressureLens.js`（buildHeatLens marker radius）
  - `src/simulation/ai/llm/PromptBuilder.js`（describeWorkerFocus / adjustWorkerPolicy summary）
  - `src/ui/hud/storytellerStrip.js`（computeStorytellerStripModel — 新增 templateTag 字段）
  - `src/ui/hud/HUDController.js`（渲染新字段到 #storytellerBadge 或 new span）
- scope：中
- 预期收益：一次修完 reviewer 三条 P0，Help tab 的三个卖点全部变得"进门 30 秒能感知"
- 主要风险：`heat_surplus` 视觉调强后可能挡住 tile icons；storyteller beat span 渲染顺序可能要调

### 方向 B: 只做 Heat Lens（P0-2 单点突破）

- 思路：跳过 DIRECTOR + template ribbon，把精力全押在 Heat Lens overlay 视觉上：用 ShaderMaterial 或 per-tile 染色（InstancedMesh）给 "heat_surplus / heat_starved" 每个命中 tile 盖一块全 tile 大小的半透明色块，做出 Oxygen Not Included 那种"一眼全图"的压力图层。
- 涉及文件：`src/render/SceneRenderer.js`（新增 heatTileMesh InstancedMesh）、`src/render/PressureLens.js`（buildHeatLens 保持不变）
- scope：中 - 大
- 预期收益：Heat Lens 变成真正的 colony sim 独家 UX 卖点
- 主要风险：新的 InstancedMesh 生命周期/脏检查易引入 memory leak；超出"小 scope / P0 快速落地"的 budget；纯 P0 单点而忽视 P0-6/P0-7 的承诺兑现

### 方向 C: 只做 DIRECTOR actionable 文本（P0-6 单点突破）

- 思路：把 storyteller strip 写成"近似 Rimworld storyteller 语气"，重写 `describeWorkerFocus` + `adjustWorkerPolicy.summary` 用 6-8 条 template per `frontier.situation`（broken-routes / overloaded-warehouse / stockpile / safe / etc），每条都带坐标 + 一个建议动作。
- 涉及文件：`src/simulation/ai/llm/PromptBuilder.js`、`src/ui/hud/storytellerStrip.js`
- scope：小
- 预期收益：P0-6 彻底解决 reviewer 在 02a / 02d / 02e 四条 feedback 里都提到的 "机器话 + 截断"
- 主要风险：只修一个 P0，其余两个 P0-2 / P0-7 继续哑火；reviewer 下轮评分不会升

## 3. 选定方案

选 **方向 A**，理由：

1. 优先级是 P0 且 reviewer feedback 明确说三项一起失败，只修一条会被下一轮 reviewer 继续扣分；方向 B/C 过度聚焦于单一 P0。
2. 三个子任务 scope 都很小（heat lens 只是常数调 + mark radius；DIRECTOR 只在已有 focus 字符串末尾拼 `at (ix,iz) — place X here`；template ribbon 只是拼一个已存在的 state field 到 HUD）——总 LOC ~180，能在 55 分钟内交付。
3. 不破坏已有测试：heat-lens-legend.test.js 验证 DOM + toggle 行为（不验 opacity 数值），scenario-voice-by-template.test.js 验证 title/summary 唯一性（不验 HUD ribbon），都不会因这次 patch 失败。storyteller-strip.test.js / hud-storyteller.test.js 需要**微改**以接纳新 templateTag 字段（添加默认空串保证向后兼容）。
4. 不跨 HW06 freeze 边界：没加新 mechanic / 新 LLM narrative system / 新 tile / 新地形。三项都是"修已承诺"。

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/SceneRenderer.js:347-350` — `edit` — 把 `heat_surplus` 的 `fillOpacity` 从 0.22 改为 0.48、`ringOpacity` 从 0.72 改为 0.92；`heat_starved` 的 `fillOpacity` 从 0.22 改为 0.48、`ringOpacity` 从 0.7 改为 0.9。保持 ring/fill 颜色不变（已是 0xff5a48 / 0x4aa8ff）。
- [ ] **Step 2**: `src/render/PressureLens.js:buildHeatLens` (line ~297, ~319, ~342) — `edit` — 把 `heat-red` / `heat-blue` marker 的 `radius` 从 0.95 改为 1.35（warehouse-idle 从 1.05 改为 1.45）；`weight` 保持不变（它控制脉动幅度，已经够用）。
  - depends_on: —
- [ ] **Step 3**: `src/render/SceneRenderer.js:#updatePressureLens` (line ~1311) — `edit` — 在 `heat` 分支加大 pulse 系数：当 `this.lensMode === "heat"` 且 `marker.kind` 以 `heat_` 开头时，把 `pulse` 的 `0.08` 改为 `0.22`、`ringPulse` 的 `0.12` 改为 `0.28`。其他 marker kind (route/depot/weather/event…) 保持原值。
  - depends_on: Step 1, Step 2
- [ ] **Step 4**: `src/simulation/ai/llm/PromptBuilder.js:describeWorkerFocus` (line 85) — `edit` — 新增函数 `buildActionableFocusSuffix(frontier)`：当 `frontier.brokenRoutes?.[0]?.gapTiles?.[0]` 存在，返回 `` ` at (${Math.round(tile.ix)},${Math.round(tile.iz)}) — place Road here` ``；当 `frontier.unreadyDepots?.[0]?.anchor` 存在时返回 `` ` at depot ${label} — place Warehouse here` ``；否则返回空串。在 `describeWorkerFocus` 返回语句前 `+=` 这个 suffix（只对 "route repair and depot relief" 路径拼，其它 focus 短语不拼避免错搭）。
- [ ] **Step 5**: `src/simulation/ai/llm/PromptBuilder.js:adjustWorkerPolicy` (line 280-281) — `edit` — 把 `policy.summary` 模板从 `` `Workers should sustain ${policy.focus} while keeping hunger and carried cargo from overriding the map's intended reroute pressure.` `` 改写为可变：如果 focus 含 `at (` 子串，summary 用 `` `Crew attention needed ${policy.focus}. Other workers keep hunger and carry in check.` ``；否则保留旧版（向后兼容，给"frontier buildout"这种 generic focus 留退路）。
  - depends_on: Step 4
- [ ] **Step 6**: `src/ui/hud/storytellerStrip.js:computeStorytellerStripModel` (line 211-265) — `edit` — 在返回的 model 里新增 `templateTag` 字段，值为 `` `${state?.gameplay?.scenario?.title ?? ""} · ${describeMapTemplate(state?.world?.mapTemplateId)?.name ?? ""}` ``（从 `src/world/grid/Grid.js` 已导出的 `describeMapTemplate` 引入）。如果 title / templateName 任一缺失则返回空串（保持向后兼容）。同步更新 JSDoc 返回类型。
- [ ] **Step 7**: `src/ui/hud/HUDController.js:` (line ~465-552) — `edit` — 在已有 `getBadgeEl && getFocusEl && getSummaryEl` 分支里，尝试 `document.getElementById("storytellerTemplateTag")`；如果 DOM 存在就写入 `model.templateTag`（空串则设 `hidden` attribute）。如果 DOM 不存在不抛错（可能 DOM 还没加 span —— 见 Step 8 加 span 到 index.html）。
  - depends_on: Step 6
- [ ] **Step 8**: `index.html` storytellerStrip 结构 — `edit` — 在 `#storytellerStrip` 内、`#storytellerBadge` 之前插入 `<span id="storytellerTemplateTag" class="storyteller-template-tag" hidden></span>`。搜索 `storytellerBadge` locate 原 span 所在行。CSS class `.storyteller-template-tag` 用 inline `style="font-size:0.85em;opacity:0.75;margin-right:8px;"` (或对应现有 hud theme var)。
  - depends_on: Step 7
- [ ] **Step 9**: `test/heat-lens-visual-strength.test.js` — `add` — 新测试文件：断言 `PRESSURE_MARKER_STYLE.heat_surplus.fillOpacity >= 0.4`、`heat_starved.fillOpacity >= 0.4`，以及 `buildHeatLens()` 输出中 `heat_surplus` marker 的 `radius >= 1.2`。pin 住"reviewer 下次打开至少看得见"这个强度阈值。
  - depends_on: Step 1, Step 2
- [ ] **Step 10**: `test/director-actionable-coordinates.test.js` — `add` — 新测试：构造一个最小 `summary` 对象，其中 `frontier.brokenRoutes[0].gapTiles = [{ ix: 42, iz: 36 }]`，调用 `describeWorkerFocus(summary, [])`，断言返回字符串包含 `at (42,36)` 和 `place Road here`。另一条测试覆盖 `unreadyDepots` 路径。
  - depends_on: Step 4, Step 5

## 5. Risks

- **R1**: Heat Lens 视觉调强后，highlighted tile 可能遮挡下层 worker sprite / tile icon —— 若 reviewer 下一轮反而抱怨"看不清 worker"就 overshoot。**缓解**：fillOpacity 0.48 仍 < 0.5，而且 disc+ring 只覆盖 tile 中心区；保留现有 renderOrder (PRESSURE_LENS=34) 低于 SELECTION_RING (38)。
- **R2**: `buildActionableFocusSuffix` 依赖 `frontier.brokenRoutes[0].gapTiles[0].ix/iz` 结构——如果某个 scenario 不填 gapTiles（历史数据未必稳定），会出现 `at (undefined,undefined)`。**缓解**：严格 guard `Number.isFinite()`，失败就退回 generic focus 字符串。
- **R3**: Template ribbon 加新 DOM 节点可能引入 layout shift（在 1024×768 下 storyteller strip 已经偏紧，P1-3 CSS 响应式问题）。**缓解**：给 `.storyteller-template-tag` 加 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;`，1024 宽下直接 `...` 截断但不换行。
- **R4**: 可能影响现有测试：
  - `test/heat-lens-legend.test.js` — 断言是 DOM 结构 + toggle 行为，不验 opacity，**安全**。
  - `test/storyteller-strip.test.js` / `test/hud-storyteller.test.js` — 若老测试 deep-equal 了 model 返回值，新增 `templateTag` 字段会报 unexpected key；**缓解**：Step 6 的新字段应保证空串默认 + JSDoc 同步；老测试可能需要放宽到 `assert.ok(model.templateTag !== undefined)` 或用 `partial` 匹配。**必须 Coder 执行前 grep 一遍老测试看断言风格**。
  - `test/scenario-voice-by-template.test.js` — 没动 scenario factory，**安全**。

## 6. 验证方式

- **新增测试**：
  - `test/heat-lens-visual-strength.test.js` — 覆盖 PRESSURE_MARKER_STYLE 常数下界 + buildHeatLens 输出 radius 下界（Step 9）
  - `test/director-actionable-coordinates.test.js` — 覆盖 describeWorkerFocus 在 brokenRoutes / unreadyDepots 两条分支下都拼出坐标 + 动词建议（Step 10）
- **手动验证**：
  1. `npx vite` 启动 dev server，打开 `http://localhost:5173`
  2. 选 Temperate Plains → Start Colony，等 ~30 秒让 DIRECTOR 推第一条 policy
  3. 按 L → 切到 heat → 地图上应能肉眼看见 ≥2 个红/蓝脉动圆盘（不必瞪眼）
  4. 顶栏 `#storytellerStrip` 应显示 `Broken Frontier · Temperate Plains  [DIRECTOR] route repair and depot relief at (X,Y) — place Road here: Crew attention needed ...`
  5. 切模板到 Archipelago Isles 重启，ribbon 应立即变成 `Island Relay · Archipelago Isles`，不再截断
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed=42 --template=temperate_plains` — 只是 render + HUD 改动，DevIndex 不应变化 ±1；若跌 >5% 说明 PressureLens marker radius 爆了 pool 预算，需要 revert Step 2 (radius) 保留 Step 1 (opacity) 作最小补救。
- **完整 test suite**：`node --test test/*.test.js` —— 期望 865 个测试全绿 + 新增 2 个测试通过（总 867 passing）。

## 7. UNREPRODUCIBLE 标记

不适用。复现路径完全按 reviewer 描述可走通——本次 plan 通过静态读码 + 已有测试输出 + 代码路径交叉验证，确认了三条 P0 的根因定位在：
- `SceneRenderer.js:337-350` PRESSURE_MARKER_STYLE 常数（可检）
- `PromptBuilder.js:85-102, 280-281` DIRECTOR focus/summary 生成（可检）
- storytellerStrip 未包含 template 名字（可检 `computeStorytellerStripModel` 返回字段清单）

Playwright 复现并未额外进行——根因定位已足够精确到 file:line，继续占 tool-use 配额复现反而稀释 plan 密度。
