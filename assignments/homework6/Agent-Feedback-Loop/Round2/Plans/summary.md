---
round: 2
date: 2026-04-22
plans_total: 10
plans_accepted: 10
plans_deferred: 0
waves: 3
---

## 1. Plans 一览

| plan | priority | scope(loc) | files_touched | focus 简述 |
|---|---|---|---|---|
| 01a-onboarding | P0 | ~210 | 5 + 2 tests | 场景 stamp 瘦身 + FogOverlay 实装 + milestone 事件发射 |
| 01b-playability | P0 | ~230 | 6 + 2 tests | Autopilot 默关 chip + 合法 tile 高亮 + Score/Dev 独立 tooltip |
| 01c-ui | P0 | ~240 | 4 + 2 tests | 死亡 toast 堆叠 + 目标 chip list + 1024-1200 mid-compact 断点 |
| 01d-mechanics-content | P0 | ~210 | 5 + 2 tests | Heat Lens 整瓦片色块 + placement-lens + InspectorPanel 扩展 |
| 01e-innovation | P0 | ~180 | 5 + 2 tests | Heat Lens 视觉强化 + DIRECTOR 坐标 + template ribbon |
| 02a-rimworld-veteran | P0 | ~160 | 5 + 2 tests | Select 工具 + Start 按钮调用 regenerateWorld + timeScale clamp 对齐 |
| 02b-casual | P0 | ~260 | 5 + 3 tests | 死亡红 toast + 资源 pill sublabel + 里程碑金色动画 |
| 02c-speedrunner | P0 | ~60 | 5 + 2 tests | 1-12 热键补全 + 4× clamp 对齐 + 顶栏 autopilot toggle 镜像 |
| 02d-roleplayer | P1 | ~140 | 4 + 2 tests | MemoryRecorder 接入 + Relationships 语义化 + fallback focus 改写 |
| 02e-indie-critic | P1 | ~120 | 5 + 1 test | storytellerStrip 截断修 + voice diffusion + `window.__utopia` devModeGate |

## 2. 冲突矩阵

按 D1-D5 规则穷举两两对，列出实际触碰/重叠：

### D1 REDUNDANT（同一行/同一视觉）
- **（无完全 REDUNDANT 对）** — 所有 plan 虽在同焦点协作，但文件:函数级触点均有差异或已在 plan 内 `conflicts_with` 里自行划界。

### D2 CONFLICT（同一处互斥修改）
- **01d × 01e（P0-2 Heat Lens 视觉）**：01d 要把 heat markers 重写成整瓦片不透明方形色块（新 mesh pool，`#updatePressureLens` heat 分支扩展）；01e 要把原有 disc/ring 的 `fillOpacity` 从 0.22 拉到 0.48、radius 从 0.95 拉到 1.35 + pulse 0.08→0.22。两者对 `PRESSURE_MARKER_STYLE` 与 `#updatePressureLens` heat 分支都是写路径，叠加会产生"既 0.48 opacity 的 disc 又 0.48 opacity 的 tile plane"双重渲染。**裁决**：选 01d（整瓦片色块）作为最终视觉，01e 的"调常数 + pulse"改写合并降级为"调 pulse 幅度、radius 由 01d 的 tile plane 决定、opacity 常数调整由 01d 的 tile plane overwrite"——**保留 01e Step 4/5（DIRECTOR actionable coord）与 Step 6-8（template ribbon）全部落地**；**01e Step 1-3（常数改写 + pulse 加大）降级到 01d 的 tile plane 方案内处理或跳过**。Coder 实现时先做 01d 的 tile plane，再在 01e 分支仅保留 pulse 幅度调大（0.08→0.22），不回改 opacity/radius 常数。

### D3 SEQUENCE（无逻辑冲突但须串行）
- **02a → 02c（P1-10 timeScale clamp）**：02a 把 `setTimeScale` clamp 放到 4.0、`maxSimulationStepsPerFrame` 提升到 6；02c 在此之上改 `PerformancePanel` label clamp `Math.min(2,…)→Math.min(4,…)` + slider `max=200→400`。**Wave 顺序**：02a 先合（基础），02c 紧随其后。
- **01a → 02b（COLONY_MILESTONE 发射）**：01a Step 7 把 `ProgressionSystem.update` 加 `#detectMilestones`（first_farm / first_lumber / first_meal / first_tool）；02b Step 5 也在 `ProgressionSystem.update` 加 `checkMilestones`（firstFarm / firstLumber / firstWarehouse / firstKitchen / firstMeal）并同时写 `state.controls.actionMessage`。两个 detector 本质在同一 hook 点、同一事件 type（`COLONY_MILESTONE`）上写，不应同时发射。**裁决**：合并实现——接受 01a 的"事件发射器" + 02b 的"金色 toast 样式 + spawn hook"，去重成**单一 detector**（以 02b 的 key set 为准，01a 的 HUD flash 路径改为订阅同一事件）。**Wave 顺序**：01a 先合 detector 骨架，02b 紧随其后叠加 toast kind + spawn。
- **01a（FogOverlay）→ 01c（死亡 toast 渲染）→ 02b（死亡 spatial toast）**：三者都在 `SceneRenderer` 的 overlay 层加节点，且 01c Step 6 扩展 `#spawnFloatingToast` → `spawnDeathToast`（新 kind="death"），02b Step 3-4 也扩展同函数新增 kind="death" 并订阅 `WORKER_STARVED`。**裁决**：01c 拿走"public 接口 + 红色 toast CSS"，02b 拿走"订阅 event bus + 因果链文案 `foodEmptySec`"，两者在 SceneRenderer 同一处 edit 但**职责分离**：01c 定义 API，02b 调用 API。**Wave 顺序**：01c 先合（定义 spawnDeathToast + CSS），02b 紧随其后（订阅事件调用 spawnDeathToast + 扩展 payload）。
- **02a（Select 工具 / 默认工具）→ 01b（autopilot chip / legal tile overlay）**：02a 加 Select 按钮并把 `state.controls.tool` 默认设为 `"select"`；01b 的 legal-tile overlay 触发条件是 `state.controls.tool ∈ {lumber, quarry, herb_garden}`，非 node-gated 工具（包括新加的 select）下必须隐藏。**Wave 顺序**：02a 先合（加 Select 工具不影响 01b 的 visibility 判定），01b 紧随其后（overlay 实现时把 `"select"` 判入非高亮分支）。
- **01c（chip list / responsive CSS）→ 02b（resource pill sublabel）→ 02c（顶栏 autopilot toggle 镜像）**：三者都在 `index.html` 的 `#statusBar` 区块加 DOM + CSS。02b 的 sublabel 会让每个 hud-meter 高度 +12px，02c 的 `#aiToggleTop` 会占 statusBar 宽度 +~80px，都需要落在 01c 的新 mid-compact 断点之后。**Wave 顺序**：01c 先合（1024-1200 断点 + chip list 容器重构），02b 紧随其后（sublabel + compact `display:none` guard），02c 最后（autopilot mirror toggle，在已收紧的 layout 中塞入）。

### D4 INDEPENDENT（互不相关，同 Wave）
- 02d-roleplayer ↔ 其他 9 份：唯一触点在 `PromptBuilder.js:85-102` 的 focus 字符串替换 + `storytellerStrip.js:144-157` 的 `humaniseSummary` 表。01e 仅在 `PromptBuilder.describeWorkerFocus` **末尾 append** actionable suffix（`at (ix,iz) — place Road here`），02d 替换 **返回的字面量主体**——两者拼接不冲突（02d 的新短语会被 01e 的 suffix 继续拼接）。**Wave 顺序**：02d 先合字面量替换，01e 再合 suffix append。实际作为 **INDEPENDENT** 处理，只要同 Wave 内不并行 edit 同一行即可。
- 02e-indie-critic ↔ 其他 9 份：01c 也碰 `index.html` CSS 但目标是 `#statusScoreboard`/`.hud-objective`/`.hud-action`/mid-compact 断点；02e 改的是 `#storytellerStrip` inline style + BuildAdvisor summary 字面量 + `main.js` 全局挂载 gate，**不与 01c 同一 CSS 选择器或同一 inline 节点冲突**。02e 的 `humaniseSummary` 扩展仅补 1-2 条规则（与 02d 的 6 条新增互补，`test/ui-voice-consistency.test.js` 追加条带 voice 诊断）。

### D5 OUT-OF-SCOPE
- **（无 DEFERRED plan）** — 10 份 plan 逐一审过：
  - 01a：场景 stamp 削减 + FogOverlay 实装 + milestone 用已定义 event type → polish/fix。
  - 01b：Autopilot 默关 + legal tile 复用 pressureMarkerPool + tooltip 拆分 → UX polish。
  - 01c：CSS + DOM chip list + 断点 → 纯 polish。
  - 01d：Heat Lens 渲染层 + placement-lens + InspectorPanel 字段扩展（读已有字段）→ 把现有系统暴露给玩家，允许。
  - 01e：常数 + 字符串拼坐标 + 已有 state field 拼 ribbon → polish。
  - 02a：Start 按钮 bug fix + clamp 对齐 + Select 工具按钮（复用 `"select"` 已存在的 tool 分支）→ bug fix / UX。
  - 02b：ResourceSystem 新增 `resourceEmptySec` 追踪字段（派生自已有资源值）+ 订阅已有 `WORKER_STARVED` 事件 + milestone 写入 → 归类为 UI 连线 + metrics 衍生字段，未引入新 mechanic。
  - 02c：1-12 热键补全（索引表扩充）+ clamp fix + toggle 镜像 → 纯 bug fix。
  - 02d：MemoryRecorder 写入 worker `memory.recentEvents`（字段已存在从未写入）+ opinion 语义 label + focus 字面量改写 → UI 连线 + 文案 polish。
  - 02e：CSS + tooltip 文案 + 全局挂载 gate → polish。

## 3. Wave 调度

三波切分，总原则：**基础 bug fix / API 定义 → 依赖 Wave 1 的 feature 实装 → Polish 收尾**。同 Wave 内允许并行 commit，Wave 间严格串行。

### Wave 1（基础 bug fix / API 定义 / 无依赖 / 优先级最高）

独立且被其他 plan 依赖的 blocker bug fix 与容器 API 定义：

- **02a-rimworld-veteran**：Select 工具（`controls.tool="select"` 分支已预留）+ Start 按钮 regenerateWorld + setTimeScale clamp 放开到 4.0 + maxSimulationStepsPerFrame 5→6。**三点纯 bug fix，被 02c / 01b 间接依赖**。
- **01c-ui**：死亡 toast API（`spawnDeathToast`）+ CSS 新 kind（`.hud-death-toast` + `.build-toast--death` keyframes）+ `#alertStack` DOM + chip list 容器 + 1024-1200 mid-compact 断点 + `@media (max-width:1024px)` 硬隐藏 `#statusScoreBreak`。**被 02b（死亡 spatial toast 订阅）与 02c（顶栏 toggle 布局）依赖**。
- **01a-onboarding（Step 1-6）**：ScenarioFactory stamp 削减（三个 build*Scenario）+ FogOverlay 实装并接入 SceneRenderer。**stamp 削减解除开局即顶点根因，FogOverlay 实装解除 "迷雾隐形" 根因；两者均不依赖其他 plan**。
- **01d-mechanics-content**：Heat Lens 整瓦片色块（新 heatTileOverlayRoot）+ placement-lens（`#updatePlacementLens`）+ InspectorPanel 扩展（getTileInsight 新增 4 行）+ BALANCE.heatLensStarveThreshold + `NODE_GATED_TOOLS` 改 export。**纯渲染/文本扩展，不依赖其他 plan；01b 的 legal-tile overlay 与本 plan 的 placement-lens 属于 `01b plan 声明的 conflicts_with` 一项，由本调度归并到同 Wave 并以 01d 的 `#updatePlacementLens` 作为底层 mesh pool 实现，01b 在 Wave 2 只做"工具切换时 visibility 开关"**。

### Wave 2（依赖 Wave 1 的基础设施）

- **01a-onboarding（Step 7-10）**：`COLONY_MILESTONE` detector in `ProgressionSystem.update` + HUDController storyteller strip 订阅渲染 + 测试。**依赖**：自身 Step 1-6 已在 Wave 1；本批次紧随 Wave 1 结束后。
- **02b-casual**：死亡红 toast 订阅（调用 01c 在 Wave 1 定义的 `spawnDeathToast`）+ 资源 pill sublabel + milestone 金色 toast（与 01a 合并 detector 去重，02b 拿 toast 样式 / spawn hook 那一半）+ `resourceEmptySec` 追踪。**依赖**：01c（API + CSS 已就位）、01a（detector 已就位需去重合并）。
- **01b-playability**：Autopilot 默关（GameApp 写入 `proxyHealth` 元数据不再翻转 `state.ai.enabled`）+ autopilot chip HUD + legal tile visibility（复用 01d 的 `#updatePlacementLens` mesh pool，仅增加 "lumber/quarry/herb_garden 工具时 setVisible=true，其他工具包括 select 时 setVisible=false"）+ Score/Dev tooltip 拆分 + glossary 新增 2 key。**依赖**：01d（placement-lens 已就位）、02a（Select 工具已就位）。
- **02c-speedrunner**：1-12 热键扩充（TOOL_SHORTCUTS 表）+ PerformancePanel label clamp → 4 + slider max 400 + `#aiToggleTop` 顶栏镜像 + shortcut hint 更新。**依赖**：02a（setTimeScale clamp 已放开到 4.0）、01c（1024-1200 断点 + compact layout 已就位）。

### Wave 3（收尾 / polish / 独立文案 / 最少风险）

- **02d-roleplayer**：MemoryRecorder（MortalitySystem + WorldEventSystem 写入 witness memory）+ Relationships 语义化（EntityFocusPanel relationLabel）+ PromptBuilder focus 字面量替换（8 条）+ storytellerStrip humaniseSummary 扩展至 12 条。**依赖**：无硬依赖；放 Wave 3 是因为字面量替换需要避免与 01e suffix append 撞同一行，02d 替换主体 + 01e append 末尾，先 02d 再 01e。
- **01e-innovation（Step 4-10）**：DIRECTOR actionable coord suffix append（在 02d 改完的新短语后追加坐标）+ template ribbon DOM + Heat Lens pulse 幅度调大（01e 原 Step 1-3 的 opacity/radius 常数改写已被 01d 的整瓦片色块方案吸收，仅保留 pulse）+ 测试。**依赖**：01d（Heat Lens 渲染已重写）、02d（focus 字面量已替换为新短语）。
- **02e-indie-critic**：storytellerStrip `flex:1 1 260px` 解除 + title mirror + BuildAdvisor summary 5 条 voice 改写 + glossary heatLens / storyteller voice 化 + `window.__utopia` 加 devModeGate（保留 `__utopiaLongRun`）+ ui-voice-consistency.test.js 追加 2 case。**依赖**：01c（`#storytellerStrip` 容器 CSS 已调整过）、01e（template ribbon DOM 已加）。Wave 3 最后合，因为主要是文案 polish，debugger 可在此 Wave 结束后做全量回归。

## 4. DEFERRED plans（不在本轮落地）

无 DEFERRED。10 份 plan 全部通过 D5 判定，允许落地。

## 5. Implementer 输入契约

### Wave 顺序
Wave 1 → Wave 2 → Wave 3。**Wave 1 必须全部合入并通过测试后才能进入 Wave 2**。Wave 内允许同一 implementer 连续 commit，也允许并行（不同 plan 的不同文件）。

### 每个 accepted plan 的 plan_path + 白名单

#### Wave 1

**02a-rimworld-veteran**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/02a-rimworld-veteran.md`
- 文件白名单：
  - `src/ui/tools/BuildToolbar.js`（Select 按钮 + 高亮同步）
  - `src/app/GameApp.js`（startSession regenerateWorld + setTimeScale clamp + maxSimulationStepsPerFrame）
  - `src/ui/hud/GameStateOverlay.js`（overlayStartBtn 推 mapTemplateId）
  - `src/ui/hud/HUDController.js`（仅 Select 工具相关的 toolbar mirror，不改其他区块）
  - `CHANGELOG.md`
  - `test/start-button-applies-template.test.js`（新）
  - `test/time-scale-fast-forward.test.js`（新）

**01c-ui**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/01c-ui.md`
- 文件白名单：
  - `index.html`（`#alertStack` DOM + `.hud-death-toast` / `.build-toast--death` CSS + `@keyframes toastDeath / deathFlash` + 1024-1200 mid-compact 断点 + 1024 及以下 `#statusScoreBreak display:none` + `.hud-objective` chip list CSS）
  - `src/render/SceneRenderer.js`（`spawnDeathToast` public 方法，仅此一个新 API；不订阅 event bus — 订阅交给 02b）
  - `src/ui/hud/HUDController.js`（casual profile 的 chip list 渲染；dev profile 保持现有 textContent）
  - `test/hud-death-alert.test.js`（新；stub spawnDeathToast 不订阅）
  - `test/hud-goal-chips.test.js`（新）

**01a-onboarding（Step 1-6 仅 Wave 1 部分）**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/01a-onboarding.md`
- 文件白名单：
  - `src/world/scenarios/ScenarioFactory.js`（三个 build*Scenario stamp 削减）
  - `src/render/FogOverlay.js`（stub → 实装，DataTexture + ShaderMaterial）
  - `src/render/SceneRenderer.js`（constructor 里 `new FogOverlay()` + attach + update + dispose 接入）
  - `test/scenario-footprint.test.js`（新）

**01d-mechanics-content**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/01d-mechanics-content.md`
- 文件白名单：
  - `src/config/balance.js`（新增 `heatLensStarveThreshold`）
  - `src/render/PressureLens.js`（阈值松绑 + `classifyPlacementTiles` 纯函数导出 + buildHeatLens 兜底标记）
  - `src/render/SceneRenderer.js`（`heatTileOverlayRoot` + `#updatePlacementLens` + `#setupPlacementLensMeshes`；**不改 01c 的 spawnDeathToast 区块**）
  - `src/simulation/construction/BuildAdvisor.js`（`NODE_GATED_TOOLS` 改 export）
  - `src/ui/interpretation/WorldExplain.js`（getTileInsight 新增 4 行）
  - `src/ui/hud/glossary.js`（heatLens 文案 polish — 如果与 02e 在 Wave 3 重写相同 key，02e 以 02e 为准）
  - `test/heat-lens-tile-overlay.test.js`（新）
  - `test/placement-lens.test.js`（新）

#### Wave 2

**01a-onboarding（Step 7-10 收尾）**
- 文件白名单：
  - `src/simulation/meta/ProgressionSystem.js`（`#detectMilestones`——与 02b 合并为单一 detector；key set 以 02b 的 5 个 key 为准；emit `COLONY_MILESTONE`）
  - `src/ui/hud/HUDController.js`（storyteller strip 订阅 milestone flash）
  - `test/milestone-emission.test.js`（新）

**02b-casual**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/02b-casual.md`
- 文件白名单：
  - `src/simulation/economy/ResourceSystem.js`（`resourceEmptySec` 累加）
  - `src/simulation/lifecycle/MortalitySystem.js`（emitEvent payload 扩展）
  - `src/render/SceneRenderer.js`（订阅 WORKER_STARVED / COLONY_MILESTONE → 调用 01c 定义的 `spawnDeathToast` + 新增 `"milestone"` kind 调用现有 `#spawnFloatingToast`）
  - `src/simulation/meta/ProgressionSystem.js`（与 01a 合并 — 02b 负责 key set + actionMessage，01a 负责事件发射；coder 合为单 PR）
  - `index.html`（资源 pill sublabel DOM + `.hud-sublabel` CSS + `.build-toast--milestone` CSS + `@keyframes toastMilestone`；**不改 01c 的 `#alertStack` / chip list 区块**）
  - `src/ui/hud/HUDController.js`（obituary deathToastShownUntil guard）
  - `test/hud-death-toast-event.test.js`（新）
  - `test/hud-resource-sublabel.test.js`（新）
  - `test/progression-milestone.test.js`（新）

**01b-playability**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/01b-playability.md`
- 文件白名单：
  - `src/app/GameApp.js`（aiHealthMonitor 不翻转 ai.enabled；Step 1）
  - `src/app/types.js`（JSDoc only）
  - `src/ui/hud/HUDController.js`（autopilot chip render + Score/Dev tooltip 拆分；**不改 01c 的 chip list / spawnDeathToast 区块，不改 02b 的 sublabel**）
  - `src/ui/tools/BuildToolbar.js`（label 文案；**不改 02a 的 Select 按钮**）
  - `src/render/SceneRenderer.js`（**不**新建 mesh pool；仅在 `#updatePlacementLens`（由 01d 在 Wave 1 建立）上加 visibility 开关的工具过滤逻辑——如果 01d 已经内置工具过滤则此步跳过）
  - `src/ui/hud/glossary.js`（新增 autopilotOff / autopilotOn 2 key）
  - `index.html`（`#aiAutopilotChip` DOM + `#statusObjective` 拆子 span + aiToggle label 文案；**不改 02b sublabel 与 01c alertStack 区块**）
  - `test/ui/hud-autopilot-chip.test.js`（新）
  - `test/ui/hud-score-dev-tooltip.test.js`（新）

**02c-speedrunner**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/02c-speedrunner.md`
- 文件白名单：
  - `src/app/shortcutResolver.js`（TOOL_SHORTCUTS 表扩 + SHORTCUT_HINT 文案）
  - `src/app/GameApp.js`（**只读**；clamp 已在 Wave 1 的 02a 改完；本 plan 不再二次修改）
  - `src/ui/panels/PerformancePanel.js`（`#syncTimeScaleLabel` clamp 2→4）
  - `src/ui/hud/HUDController.js`（setupSpeedControls 末尾 aiToggleTop 同步；**不改 01b 的 chip / 01c 的 chip list / 02b 的 sublabel 区块**）
  - `index.html`（`#timeScale` slider max="400" + `#aiToggleTop` 顶栏 DOM）
  - `test/shortcut-resolver.test.js`（扩展）
  - `test/hud-autopilot-toggle.test.js`（新）

#### Wave 3

**02d-roleplayer**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/02d-roleplayer.md`
- 文件白名单：
  - `src/simulation/lifecycle/MortalitySystem.js`（recordDeathIntoWitnessMemory helper；**不改 02b 的 emitEvent payload 行 — 02b 已加 tile/worldX/worldZ；02d 只在函数尾部 append helper 调用**）
  - `src/world/events/WorldEventSystem.js`（FIRE / VERMIN 订阅循环 unshift memory）
  - `src/ui/panels/EntityFocusPanel.js`（relationLabel + 渲染串）
  - `src/simulation/ai/llm/PromptBuilder.js`（11 条 focus 字面量替换；**必须保留 01e Step 4 在 Wave 3 紧随其后 append 的 actionable suffix 结构 — 02d 只改短语主体，不动 describeWorkerFocus 的函数签名与返回语句结构**）
  - `src/ui/hud/storytellerStrip.js`（humaniseSummary 扩到 12 条）
  - `CHANGELOG.md`
  - `test/memory-recorder.test.js`（新）
  - `test/entity-focus-relationships.test.js`（新）
  - `test/world-explain.test.js`（若有 fixture 字面量 sweep 更新）

**01e-innovation（Wave 3 仅 Step 4-10）**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/01e-innovation.md`
- 文件白名单：
  - `src/simulation/ai/llm/PromptBuilder.js`（describeWorkerFocus 末尾 `buildActionableFocusSuffix` append；adjustWorkerPolicy summary 模板替换 — **建立在 02d 已替换的新短语之上**）
  - `src/ui/hud/storytellerStrip.js`（computeStorytellerStripModel 增 `templateTag` 字段；**不重写 humaniseSummary — 02d 已扩到 12 条**）
  - `src/ui/hud/HUDController.js`（`storytellerTemplateTag` DOM 写入）
  - `index.html`（`#storytellerTemplateTag` span）
  - `src/render/SceneRenderer.js`（**仅**调 pulse 幅度 0.08→0.22；opacity/radius 常数不动，已由 01d 的整瓦片方案吸收）
  - `test/heat-lens-visual-strength.test.js`（新 — 断言阈值按最终方案调整；pulse 幅度而非 opacity 常数）
  - `test/director-actionable-coordinates.test.js`（新）

**02e-indie-critic**
- plan_path: `assignments/homework6/Agent-Feedback-Loop/Round2/Plans/02e-indie-critic.md`
- 文件白名单：
  - `index.html`（`#storytellerStrip` inline style `flex:1 1 auto; min-width:0; max-width:none`；**不动 01c 的 `#statusScoreboard` / `.hud-objective` / alertStack / mid-compact 断点、02b 的 sublabel、02c 的 `#aiToggleTop` / slider**）
  - `src/ui/hud/HUDController.js`（storytellerStrip 容器 title 镜像；**不改 01b chip / 02c toggle mirror**）
  - `src/simulation/construction/BuildAdvisor.js`（TOOL_INFO 5 条 summary voice 改写）
  - `src/ui/hud/glossary.js`（heatLens / storyteller 2 key voice 化；以 02e 为准覆盖 01d 的 heatLens 文案 polish）
  - `src/main.js`（`window.__utopia` 包 `if (devOn)`；`window.__utopiaLongRun` 保持无条件挂载；`window.__utopiaBootError` 不动）
  - `test/ui-voice-consistency.test.js`（追加 2 case）
  - `CHANGELOG.md`

### 禁止触碰的路径（全局守则，违反立即回滚）

对所有 Wave 的 implementer 强制如下红线：

1. **不得新建 tile 类型**（不得扩展 `TILE` 常量）。
2. **不得新增建筑工具**（不得扩 BUILDING_TYPES / TOOL_INFO 键集合，仅允许修改 summary/rules 文本）。
3. **不得扩 BALANCE 中的新 mechanic 常量**（本轮仅允许 01d 新增的 `heatLensStarveThreshold`；其他常量只读或调参）。
4. **不得扩 SYSTEM_ORDER 或新增 System**（MemoryRecorder 必须以 helper 形式内联在 MortalitySystem，不新建 System）。
5. **不得新增 Score / DevIndex / 胜利条件公式**（01b Score tooltip 拆分与 01a DevIndex 显示仅允许"暴露已有 breakdown"）。
6. **不得新增 ScoreModifier / MoodModifier / Grief 事件**（02d 硬红线）。
7. **不得新建音频资产 / 接入 BGM**（P1-8 feedback 项本轮整体不落地，10 份 plan 中无音频 plan 是一致的）。
8. **不得在 `__utopiaLongRun` 上加 devModeGate**（02e 强调保留以支持 scripts/soak-browser-operator.mjs）。
9. **不得改变 `state.controls.tool` 已存在的语义分支**（02a 的 "select" 已在 SceneRenderer:2077 预留短路分支，不得再加第四种模态）。
10. **不得重写 HUD 架构**（01c 方向 A 已裁决；任何 CSS Grid 重构 / ObjectiveToastSystem 新文件均越线）。

如 implementer 的 diff 包含以上任一路径越线，**debugger 在 Wave 末回归时须立即回滚该 commit**。

## 6. 已知风险 / 潜在回归（debugger 重点关注）

**R-1（benchmark / long-horizon DevIndex 漂移）**：
- 01a 削减场景 stamp（4 farms→1, 7 walls→2）→ DevIndex 预期 -3 到 -5。
- 02a `maxSimulationStepsPerFrame` 5→6 + setTimeScale clamp 2→4 → 4× 档位下 per-frame CPU 预算上浮；benchmark 自身跑 timeScale=1 不受影响，但 Phase 10 determinism snapshot 若对 step count 敏感需复核。
- 01b autopilot 默关 → 长局 DevIndex 自然下降（玩家不操作时），**benchmark 脚本走 `setAiEnabled(true, {manualOverride:true})` 不受影响**，手动验证需 Enable autopilot 再跑。
- **总体验收线**：`node scripts/long-horizon-bench.mjs --seed=42 --template=temperate_plains --days=365` DevIndex ≥ 41.8（= 44 × 0.95）；deaths ≤ 499（= 454 × 1.10）。若越线：优先回退 01a 的 stamp 削减量；次优回退 02a 的 maxSteps 6→5。

**R-2（renderer 性能 / GPU 负载）**：
- 01a FogOverlay + 01d heatTileOverlay + 01d placementLens + 02c/02b 多组 toast 都在 SceneRenderer 加半透明层，低端 GPU 可能 FPS 掉 5-10。
- `renderOrder` 冲突：FogOverlay（3） vs Heat Lens tile plane（TILE_OVERLAY+3） vs placement-lens（TILE_OVERLAY+1） vs selection ring（高） vs PressureLens disc/ring（pressure_lens=34）。**debugger 需实机在 1920×1080 切 Heat Lens + 选 Quarry 工具 + worker 移动中同时存在 4 个 overlay 层时录 FPS**。
- 缓解已在各自 plan 的 Risk 节点内提出（signature diff cache、max 48 markers、frustum cull）。

**R-3（测试套件字面量依赖）**：
- 02d 的 PromptBuilder 短语替换影响 `test/world-explain.test.js`, `test/hud-storyteller.test.js`, `test/storyteller-strip.test.js`, `test/ai-prompt-builder.*.test.js`，任何 pin 了旧字面量（如 "frontier buildout" / "route repair and depot relief" / "stabilization"）的 assertion 必须同步。
- 02e 的 BuildAdvisor summary 替换影响 `test/build-advisor.test.js`, `test/ui-voice-consistency.test.js`, `test/build-tool-preview.test.js`。
- 01d 的 NODE_GATED_TOOLS 改 export 需 `Grep "NODE_GATED_TOOLS"` 全仓检查 import 路径。
- 01a 的 stamp 削减破坏任何 `test/scenario-*.test.js` 对 "初始 farms = 4" 的硬编码，新 `test/scenario-footprint.test.js` 仅防回归。

**R-4（事件总线双订阅 / 竞态）**：
- 01a detector + 02b detector 已裁决合并为单一 hook，但需 debugger 验证 `milestonesSeen` Set 在 `createInitialGameState` 里预留并在 snapshot 序列化里正确 round-trip。
- 02b 的 WORKER_STARVED 订阅在 SceneRenderer 构造时绑定；若 SceneRenderer 在多 session 间复用（切模板重启），须确保 unsubscribe，避免 handler 泄漏。
- 01c 定义的 `spawnDeathToast` API 被 02b 调用；Wave 2 合入 02b 前 debugger 必须确认 Wave 1 的 01c 已 expose 该 public 方法。

**R-5（HUD 布局叠加 overflow）**：
- 01c 新加 `#alertStack`（top:44px right:12px max-width:320px fixed）+ 02b 新加 `#hudFood .hud-sublabel` 等 5 个 + 02c 新加 `#aiToggleTop` + 01b 新加 `#aiAutopilotChip` + 01e 新加 `#storytellerTemplateTag` → statusBar 总宽度在 1024-1200 区间需复验**不超过 100vw**、1024 以下 compact mode 下正确隐藏。
- 01c 的 mid-compact 断点是关键防线，debugger 需在 1024 / 1280 / 1366 / 1920 四档 resize 手测。

**R-6（snapshot / determinism）**：
- 02b 的 `state.metrics.resourceEmptySec` 新字段与 01a 的 `state.progression.milestonesFired`（与 02b 的 `state.gameplay.milestonesSeen` 合并）+ 02d 的 `entity.memory.recentEvents` 写入 → 都需在 `snapshot-service.test.js` round-trip 下保持 shape 稳定。
- `createInitialGameState` 必须预注册 `resourceEmptySec: { food: 0, wood: 0 }` 和 `milestonesSeen: new Set()`，debugger 在 Wave 1 末与 Wave 2 末各跑一次 `node --test test/snapshot-*.test.js` 确认不炸。

**R-7（autopilot 默关带来的新手体验回退风险）**：
- 01b 默关 autopilot + 01a milestone + 02b sublabel / toast 共同构成"新手 60 秒看懂"的承诺；若任一 plan 部分合入失败（例如 milestone detector 没触发 first_farm），新手会陷入"默关且无 AI + 无反馈"比原先还糟。**debugger 必须实机 Start Colony seed=42 temperate_plains，在不开 autopilot 前提下等 60s，确认至少收到 1 条 "First Farm raised" flash**。

**R-8（文案长度 / 截断回归）**：
- 02e 修了 `#storytellerStrip` 的 nowrap；02d 的 humaniseSummary 让句子更长；01e 的 actionable suffix 再拼坐标 `at (42,36) — place Road here`。三叠加可能让 storyteller strip 在 1024px 下重新溢出。02e 的 `title` 镜像 + `overflow:hidden` 是 safety net。
- `NARRATIVE_BEAT_MAX_LEN = 140` 字符截断策略需在 Wave 3 末核查是否仍然生效。

## 7. 下一步

把本 summary.md 交给 **Coder Implementer** 开始 **Wave 1**：

1. 按第 5 节的"Wave 1 四份 plan"并行 commit（不同文件白名单无交集，可多个 implementer 分线）。
2. Wave 1 全部 commit 合入后，跑 `node --test test/*.test.js`（865+ 新 4 个）+ `node scripts/long-horizon-bench.mjs --seed=42 --template=temperate_plains`，确认 DevIndex ≥ 41.8。
3. 若 Wave 1 绿灯，进入 Wave 2；Wave 2 末同样跑回归 + DevIndex。
4. 若 Wave 2 绿灯，进入 Wave 3；Wave 3 末做最终全量手动验证（5 项：death toast / heat lens / legal tile / score-dev tooltip / template ribbon）。
5. 任一 Wave 违反第 5 节"禁止触碰的路径"→ debugger 立即回滚该 commit 并要求 implementer 重做该 plan 的分支。
