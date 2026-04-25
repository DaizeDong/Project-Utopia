---
reviewer_id: 01d-mechanics-content
feedback_source: Round5/Feedbacks/01d-mechanics-content.md
round: 5b
date: 2026-04-24
build_commit: bc7732c
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~260
  new_tests: 3
  wall_clock: 90
layers: [simulation, ui/panels, ui/hud]
conflicts_with: []
supersedes: Round5/Plans/01d-mechanics-content.md
round5_delivered:
  - EntityFocus persistent worker list + Tab/Shift+Tab cycle (Round5 Steps 4-7)
  - "focus:why" casual-visible block (Top Intents / Top Targets / AI Impact / Decision Context) (Round5 Step 6)
  - foodProducedPerMin/foodConsumedPerMin/foodSpoiledPerMin emit chain + HUD foodRateBreakdown (Round5 Steps 1-3, 9)
---

## 1. 核心问题（Round 5b 再立题）

Round 5 merge judged 4/10（mechanics 5 + content 3）。Stage B summary §5 明令 content 侧 D5
（不许新建筑、tile、物种），但**mechanics-presentation 轴仍大量未兑现**。Round 5 的 01d plan
只拆了四个 casual-visible 块 + food 单一资源的 `(prod / cons / spoil)` breakdown。剩下的断层：

**断层 A — 建筑 "processing" 进度对玩家完全不可见**
- `ProcessingSystem` 为每个 Kitchen / Smithy / Clinic 维护 `buildingTimers.get(key) = { nextProcessSec }`，
  配合 `nowSec` 就能算 `progress01 = 1 - (nextProcessSec - nowSec)/effectiveCycle`。
- 这条信息从未暴露到 `state.metrics`，更没有 UI：玩家看不到 "Kitchen at (35,22) 65% → Meal in 1.1s"，
  也看不到 "Smithy at (41,18) 0% — no SMITH present → stalled"。
- 直接命中 reviewer 01d §1.3 "中间观察层缺失" 与 §4-机制-6 "DIRECTOR 透明化"：玩家看得到净速率
  `+Meals 4.5/min`，但看不到 **哪台 Kitchen 在产、哪台在空转**。

**断层 B — 非食物资源的 per-min 因果 breakdown 已在 state.metrics 里但 HUD 丢弃**
- Round 5 落地的 `ResourceSystem.js:371-376` 写了 `woodProducedPerMin / woodConsumedPerMin`、
  `stoneProducedPerMin / stoneConsumedPerMin` 等 6 个资源的 per-min metric。
- HUDController.js:552-568 只读 **food** 一个资源。wood / stone / herbs / meals / tools / medicine
  6 个资源行的 rate badge 永远只显示 `▲ +29.9/min` 孤零零数字，reviewer 01d §4 "资源箭头加来源拆分"
  的原话**在 food 行兑现，在其他 6 行没兑现**。

**断层 C — 资源耗尽预测 (runoutSec) 不存在**
- `state.resources.food` + `state.metrics.foodConsumedPerMin` + `state.metrics.foodProducedPerMin`
  三条数据都齐了，计算 `runoutSec = food / max(0.01, (consumed - produced)/60)` 是 O(1)。
- reviewer 01d §4 机制-5 "食物到 <50 时红框闪烁而不是只有目标文字" 直接指向 runoutSec 阈值告警。
- 目前 HUD 没有任何 ETA / 倒计时，玩家 `Food=2` 时仍然只看到目标文本 "Grow food supply"。

**断层 D — Inspector Panel 选中一个 Kitchen/Smithy/Clinic tile 显示空壳**
- InspectorPanel.js:77-109 `#renderTileSection()` 对 Kitchen 点击只显示
  `Type: KITCHEN / Passable: false / Move Cost: 0.00 / Height: 0.000`，没有 processing 进度、
  没有本台 building 的 WORKER 到位状态、没有 input stock / output flow。
- reviewer 01d §4 改进-7 "地块特性上 HUD" 原话命中。

**为什么这是 "搬运 + 薄数据层" 而不是新机制**：
- 零新建筑、零新 tile、零新事件、零新生物；所有数据已经存在于 `ProcessingSystem.buildingTimers`、
  `state.metrics.*PerMin`、`state.resources.*` 里。
- 只是把 `buildingTimers` 每个 tick 拍一张 snapshot 到 `state.metrics.processing`，然后两层 UI 读它。
- HW06 freeze 边界内的合法 UX/可观察性搬运。

---

## 2. Suggestions（可行方向）

### 方向 A: Processing snapshot + 全资源 breakdown + runout ETA（本 plan 选定）

- **思路**：
  1. `ProcessingSystem.update` 末尾把 `buildingTimers` 展开成
     `state.metrics.processing = [{ kind, ix, iz, progress01, etaSec, workerPresent, stalled, stallReason, inputOk }, ...]`。
     一次 tick O(Kitchens + Smithies + Clinics) = ≤10 次遍历，可忽略成本。
  2. HUDController 的 rate 行扩成 7 个 breakdown，不只 food 一个。抽一个 `#renderRateBreakdown(resource)`
     helper，消除现在 foodRateBreakdown 的单点特化。
  3. 在 HUDController 的 food 行后面追加一段 `<span id="foodRunoutHint">≈ 3.2 min until empty</span>`
     （默认隐藏，仅当 runoutSec < 180 且 foodConsumedPerMin > foodProducedPerMin 时显示红字）。
     其他 5 种消耗类资源（meals/herbs/medicine/tools/stone）同样 ETA，wood 不做 ETA（长期产出主轴）。
  4. InspectorPanel 在 `#renderTileSection` 看到 KITCHEN/SMITHY/CLINIC tile 时，查 processing snapshot
     并插一个 `<details open><summary>Processing</summary>...</details>` 块，显示：
     `Cycle: 65% · ETA 1.1s · SMITH present / SMITH missing — stalled · Input: stone 14 / wood 7 OK`。
  5. EntityFocusPanel 里保留已有 "Why is this worker doing this?" 块；**不再改 EntityFocus**（Round 5 已稳）。
- **涉及文件**：
  - `src/simulation/economy/ProcessingSystem.js`（+ per-tick snapshot emit）
  - `src/ui/hud/HUDController.js`（breakdown 泛化 + runout ETA row）
  - `src/ui/panels/InspectorPanel.js`（tile→processing block）
  - `index.html`（6 个 rateBreakdown span 节点 + runout hint span）
  - `test/processingSnapshot.test.js`（新）
  - `test/resourceRunoutEta.test.js`（新）
  - `test/inspectorProcessingBlock.test.js`（新）
- **scope**：中（~260 LOC，约 90 分钟）
- **预期收益**：
  - 机制呈现 **+1.5** 分：中间层 "玩家能读懂的因果" 真正出现——建筑在干啥、什么时候出货、为什么停摆。
  - reviewer §4-机制-2 "资源箭头加来源拆分" **从 food 单点覆盖到 7 资源全覆盖**。
  - reviewer §4-机制-5 "Food <50 红框闪烁" 由 `foodRunoutHint` + CSS 类 `warn-soon` 兑现。
  - reviewer §4-机制-7 "地块特性上 HUD" 由 Inspector Processing block 兑现。
  - 覆盖率 ~78% (见 §3 Coverage Matrix)。
- **主要风险**：
  - `ProcessingSystem.update` 每 tick 生成一个 Array —— 在极大地图（50 台 processor）单 tick O(50)
    属于完全可忽略的微操，但要确保 GC 不翻车：snapshot 用 in-place `this.snapshotBuffer.length = 0;
    this.snapshotBuffer.push(...)` 模式，不 new Array。
  - InspectorPanel 的 `#renderTileSection` 当前是 cache by HTML string diff（`lastHtml` dirty-check），
    processing block 每秒变化→每秒 rerender 是可接受的（已有 `.lastHtml` pattern）。
  - runout ETA 在 food 波动（刚吃完 meal 瞬时 +5 但 produced 为 0）会跳变。需要做简单的
    3 窗口 smoothing（复用 Round 5 的 RATE_WINDOW_SEC=3 已有节奏）。

### 方向 B: Heat Lens 真染色（方向 B 再次提出但再次推给 01c/01b）

- 与 Round 5 plan 同样理由退回：reviewer §2 P1-3 被 summary §5 明标"除非作为 P0-2 的一部分"，
  本轮 01d 已吃 P0-2 上半（worker list）+ P1-2（HUD 因果），Heat Lens 让 01c-ui / 01b-playability 处理。
- DEFERRED-SUBSUMED-01c/01b.

### 方向 C: 加 Intent History 时间轴 / AI 历史回放

- reviewer §4-机制-4 "时间轴 / 事件流 Toast"。但 Round 5 04-w1-fallback-loop 已经写了 narrative/log
  改造；本 plan 再做会与 w1 冲突。DEFERRED-SUBSUMED-w1-fallback-loop。

---

## 3. 选定方案 + Coverage Matrix

**选方向 A**。

### Round-5b Coverage Matrix（reviewer 原文 findings 对照）

| Finding ID | Reviewer 原文要点 | 处置 | 对应 Step |
|:-:|:--|:--|:--|
| §1.1 HUD 数值可见性 | Colony 面板资源速率、职业分布 | `PREVIOUSLY-FIXED-Round5`（已做，不重做） | - |
| §1.2 工人级因果链 | 玩家点不中 worker | `PREVIOUSLY-FIXED-Round5` (worker list + Tab cycle) | - |
| §1.2 经济层因果链 | Food -151.7/min 没有"为什么"的桥 | `PREVIOUSLY-FIXED-Round5-partial` (food 单资源)；本轮**扩到 7 资源** | Step 2, 3 |
| §1.2 事件层因果链 | objective log 埋在 Debug | `SUBSUMED-w1-fallback-loop`（narrative 改造在 w1） | - |
| §1.2 Heat Lens 不染色 | 只看到 legend | `DEFERRED-SUBSUMED-01c/01b` | - |
| §1.3 工人级因果链对玩家不可达 | 点不中 worker | `PREVIOUSLY-FIXED-Round5` | - |
| §1.3 "最有价值信息全在 Debug" | Debug 层过透明 HUD 断层 | `FIXED`（build processing 搬到 HUD + Inspector） | Step 1, 4, 5 |
| §1.3 DIRECTOR/WHISPER badge 黑话 | 新手看不懂 | `DEFERRED-SUBSUMED-w1-fallback-loop` | - |
| §2.1 11 建筑太少 | 内容丰富度 | `DEFERRED-D5-NEW-BUILDING`（freeze 禁止）| - |
| §2.2 7 资源太少 | 内容丰富度 | `DEFERRED-D5-NEW-RESOURCE` | - |
| §2.3 8 职业全是采造 | 内容丰富度 | `DEFERRED-D5-NEW-ROLE` | - |
| §2.3 生物多样性为零 | 内容丰富度 | `DEFERRED-D5-NEW-SPECIES` | - |
| §2.4 事件只有 5-7 种 | 内容丰富度 | `DEFERRED-D5-NEW-EVENT` | - |
| §2.5 天气只见 clear | 内容丰富度 | `DEFERRED-D5-NEW-WEATHER-ANIM` | - |
| §2.5 地块特性在引擎里但 Inspector 空话 | Inspector 显示 elevation/moisture/soil/processing | `FIXED`（Inspector Processing block）| Step 5 |
| §4-机制-1 intentWeights 搬上 HUD | worker 点选后因果链 | `PREVIOUSLY-FIXED-Round5`（focus:why 块）| - |
| §4-机制-2 资源箭头加来源拆分 | `(consume -180 / harvest +28.3)` | `FIXED-EXTENDED`（food 已做；本轮扩到 7 资源）| Step 2, 3 |
| §4-机制-3 Heat Lens 真可见化 | warehouse 头顶数字/色块 | `DEFERRED-SUBSUMED-01c/01b` | - |
| §4-机制-4 时间轴 / 事件流 Toast | 持续事件通知 | `DEFERRED-SUBSUMED-w1-fallback-loop` | - |
| §4-机制-5 Food <50 红框闪烁 | runout 警告 | `FIXED`（`foodRunoutHint` + `.warn-soon` CSS）| Step 3, 6 |
| §4-机制-6 DIRECTOR badge 新手解释 | badge 含义 | `DEFERRED-SUBSUMED-w1-fallback-loop` | - |
| §4-内容-1~6 | 建筑 / 物种 / 事件 / 武器 / 研究 / 天气 扩容 | `DEFERRED-D5-FREEZE` ×6 | - |
| §4-内容-7 地块特性上 HUD | Inspector "Selected Tile" 空话 | `FIXED`（Step 5）| Step 5 |

**覆盖率统计**：
- 可 FIX 的非 D5 / 非 SUBSUMED 的 reviewer findings：9 条
  （§1.3 Debug 断层 / §2.5 Inspector 空话 / §4-2 breakdown / §4-5 runout / §4-7 tile HUD ×1
  + §1.2 经济因果 / §1.3 "Debug 最贵信息" / §4-2 "箭头来源拆分" 同根因合并 3 条 / §4-7）
- Round5 已做：3 条（§1.2 worker point, §4-1 intentWeights casual, §4-2 food-only）
- 本轮新增 FIXED：5 条（§1.3 Debug→HUD 搬运 = Step 1+4+5, §2.5 Inspector = Step 5, §4-2 全资源扩展 = Step 2+3,
  §4-5 runout = Step 3+6, §4-7 tile HUD = Step 5）
- SUBSUMED / DEFERRED-SUBSUMED：6 条（Heat Lens / narrative×3 / Director badge×2）
- D5 DEFERRED（freeze-blocked content）：11 条（建筑/资源/物种/事件/天气/等）

**覆盖率 = (FIXED + PREVIOUSLY-FIXED + SUBSUMED + D5-LEGIT) / Total**
= (5 + 3 + 6 + 11) / 26 = **25/26 ≈ 96.2%**

对 reviewer 原文 §4 改进建议章节单独统计（"如果作者想把分从 4 提到 6" 的 13 条）：
- 机制改进 1,2,5,7 = FIXED (4)，3,4,6 = SUBSUMED/DEFERRED (3) → 机制侧 7/7 全处置。
- 内容改进 1-6 全 D5，7 FIXED → 内容侧 7/7 全处置（6 条 D5 freeze-compliant + 1 FIXED）。

覆盖率 ≥ 70% 要求 **通过**。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/economy/ProcessingSystem.js` — edit — 在 `constructor` 加
  `this.snapshotBuffer = [];`；在 `update(dt, state)` 末尾调用 `this.#emitSnapshot(state, nowSec)`，
  `#emitSnapshot` 遍历 `buildingTimers` 每个 entry，查 (a) 对应 tileKey 在 grid 中的 tile type →
  推断 kind (`"kitchen"|"smithy"|"clinic"`)、(b) `effectiveCycle`（重算 tool/night/weather
  multiplier，复用 `#tryProcess` 的计算逻辑抽成 `#computeEffectiveCycle(state, kind)` 共享 helper）、
  (c) `progress01 = clamp01(1 - (nextProcessSec - nowSec)/effectiveCycle)`、(d) `etaSec =
  max(0, nextProcessSec - nowSec)`、(e) `workerPresent = #hasWorkerAtTile(state, ix, iz, ROLE_FOR_KIND)`、
  (f) `inputOk = inputCheck(state.resources)`（按 kind 重跑 kitchenFoodCost / smithyStoneCost+WoodCost /
  clinicHerbsCost 的 check）、(g) `stalled = !workerPresent || !inputOk`、
  (h) `stallReason = !workerPresent ? "no cook" / "no smith" / "no herbalist" : !inputOk ? "input shortage" : null`。
  写入 `state.metrics.processing = this.snapshotBuffer`（**不 new Array**：`this.snapshotBuffer.length = 0;
  this.snapshotBuffer.push(...)`）。
  - estimated: +55 LOC (包含 helper)。
  - 测试：`test/processingSnapshot.test.js` 新建。

- [ ] **Step 2**: `src/ui/hud/HUDController.js` — edit — 把现有 food-only breakdown 抽成 generic
  `#renderRateBreakdown(resource)`：读 `state.metrics[`${resource}ProducedPerMin`]` /
  `${resource}ConsumedPerMin` / `${resource}SpoiledPerMin`（spoil 只 food 有），按相同阈值 0.05
  拼 `(prod +X / cons -Y / spoil -Z)` 文本，写到 `this[`${resource}RateBreakdown`]`。在
  constructor `this.foodRateBreakdown = el("foodRateBreakdown")` 之后增加 6 个
  `this.woodRateBreakdown` / `stoneRateBreakdown` / `herbsRateBreakdown` / `mealsRateBreakdown` /
  `toolsRateBreakdown` / `medicineRateBreakdown` 句柄。tick 末尾统一调用
  `for (const r of ["food","wood","stone","herbs","meals","tools","medicine"]) this.#renderRateBreakdown(r)`。
  - estimated: +35 LOC.
  - depends_on: -（Step 2 纯 UI）。

- [ ] **Step 3**: `src/ui/hud/HUDController.js` — edit — 新增 `#renderRunoutHints(state)`：读
  `state.resources.*` 和 `state.metrics.*ConsumedPerMin` / `*ProducedPerMin`，对
  `["food","meals","herbs","medicine","tools","stone"]` 六种消耗类资源计算
  `netPerSec = (produced - consumed) / 60`；若 netPerSec < -0.02 且 stock > 0 则
  `runoutSec = stock / -netPerSec`。当 `runoutSec < 180` 渲染 `≈ <Xm Ys> until empty`，
  向对应 `#<res>RunoutHint` span 写文字并加 `class="warn-soon"`（runoutSec<60 时加
  `class="warn-critical"` 红闪，CSS 由 index.html 承载）。不写 wood（wood 是长期轴，rate 波动）。
  - estimated: +40 LOC.
  - depends_on: Step 2 DOM span.

- [ ] **Step 4**: `src/ui/hud/HUDController.js` — edit — 测试用例 `test/resourceRunoutEta.test.js`：
  stub state 里 foo food=60, foodConsumedPerMin=60, foodProducedPerMin=30 → netPerSec=-0.5 → runoutSec=120 →
  HUD 显示 "≈ 2m 0s until empty"，且 `foodRunoutHint.classList.contains("warn-soon")===true`。
  foodConsumedPerMin=60, foodProducedPerMin=65 → runoutSec=∞ → hint empty string + no class。
  - estimated: +30 LOC test.
  - depends_on: Step 3.

- [ ] **Step 5**: `src/ui/panels/InspectorPanel.js` — edit — 在 `#renderTileSection` 确定
  `currentType` 之后，如果 `currentType ∈ [TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]` 则从
  `state.metrics.processing` 找到匹配 `(ix,iz)` 的 entry，追加一个 `<details open><summary>Processing</summary>`
  块显示：
  `<div>Cycle: <N%> (ETA <Xs>)</div>`、`<div>Worker: <kind> present/absent</div>`、
  `<div>Inputs: <kind-specific> OK/short</div>`、`<div>Status: running / stalled (<reason>)</div>`。
  additionally，对 **所有** production tile（farm/lumber/quarry/herbgarden/warehouse）显示
  `state.metrics.logistics.buildingEfficiency[`${ix},${iz}`]` 已在 Round 0 落地的 logistics
  efficiency 数值（currently nowhere surfaced in InspectorPanel）——行文: `Logistics: connected
  ×1.15 | adjacent ×1.00 | isolated ×0.85`。这一条是 bonus 搬运不额外要新 state。
  - estimated: +55 LOC.
  - depends_on: Step 1 (snapshot existence).

- [ ] **Step 6**: `index.html` — edit — (a) 在 Food row 原有
  `<span id="foodRateBreakdown">` 之后追加 `<span id="foodRunoutHint" class="runout-hint"></span>`；
  (b) 在 wood/stone/herbs/meals/tools/medicine 6 行每行模仿 food 行加 `<span id="<res>RateBreakdown"
  class="small muted">—</span>`（位置紧跟 rate badge）；(c) meals/herbs/medicine/tools/stone 5 行
  追加 `<span id="<res>RunoutHint" class="runout-hint"></span>`；(d) CSS 追加
  `.runout-hint { font-size:10px; margin-left:4px; }`、`.runout-hint.warn-soon { color:#c18; }`、
  `.runout-hint.warn-critical { color:#f33; animation: flashWarn 1s infinite; }`、
  `@keyframes flashWarn { 50% { opacity: 0.4; } }`。
  - estimated: +45 LOC (12 span + CSS).

- [ ] **Step 7**: `test/processingSnapshot.test.js` — add — stub grid 里布 1 个 Kitchen、1 个 Smithy、
  驱动 `ProcessingSystem.update`。assertion：
  (a) `state.metrics.processing.length === 2`；
  (b) Kitchen entry `{ kind: "kitchen", progress01 ≥ 0 && ≤ 1, workerPresent: true, stalled: false, inputOk: true }`
      当 COOK 工人在 tile 相邻 + state.resources.food >= kitchenFoodCost；
  (c) Smithy entry `stalled: true, stallReason: "no smith"` 当 SMITH 缺席；
  (d) 两次连续 `update(0.5, state)` 之后同一 Kitchen entry 的 `progress01` **单调不减**（除非窗口复位）。
  - estimated: +65 LOC test.

- [ ] **Step 8**: `test/inspectorProcessingBlock.test.js` — add — 构造 stub state（1 Kitchen + snapshot），
  选中该 tile 并触发 `InspectorPanel.render()`，assert：
  (a) `document.getElementById("inspect").innerHTML` 包含 `"Processing"`；
  (b) 包含 `"Cycle: "` + `"%"`；
  (c) 包含 `"ETA "` + `"s"`；
  (d) 当 `workerPresent: false` 时文字包含 `"stalled"` + `"no cook"`。
  - estimated: +50 LOC test.
  - depends_on: Step 5.

- [ ] **Step 9**: `test/resourceRunoutEta.test.js` — add — 已在 Step 4 声明；此步落盘。覆盖
  food / meals / stone 三通道（producer > consumer → hint empty；consumer > producer 且 stock/Δ < 180s
  → warn-soon；stock/Δ < 60s → warn-critical）。wood 即使 netPerSec<0 也不应显示 hint（按 Step 3 规则）。
  - estimated: +40 LOC test.
  - depends_on: Step 3.

---

## 5. Risks

- **snapshot 每 tick 重建的 GC 压力**：15-50 个 processor × 每帧 1 次 = 3000/min。必须用
  `this.snapshotBuffer.length = 0; this.snapshotBuffer.push({...})`；不要 `state.metrics.processing = []`。
  Step 1 已注明，在代码注释里再强调一次。
- **nearest-worker check 的 O(N_agents × N_processors)**：已有
  `#hasWorkerAtTile` 遍历所有 agents。50 workers × 10 processors = 500/tick，在当前 60fps 可接受。
  若 Round 6 扩到 200 工人需考虑 spatial index，本轮不做。
- **InspectorPanel.lastHtml diff**：processing progress01 每帧变 → Inspector 每帧 innerHTML 替换。
  已有 `.lastHtml` dirty-check，但 progress 连续变动会 bypass 它（每个字符都不同）。缓解方案：
  progress 显示到整数百分比 (`Math.floor(progress01 * 100)`)，ETA 显示整数秒，变动频率
  降到 1Hz，diff-check 可过滤大部分 rerender。
- **runoutSec 抖动**：foodProducedPerMin 的 3s window 翻页时可能瞬变。缓解：在 HUDController
  加 `this._lastRunoutSmoothed = {}` 做 EMA 平滑（`α=0.3`），避免闪烁。Step 3 代码里加入。
- **CSS `.warn-critical` 闪烁可能被 reduce-motion 用户投诉**：加 `@media (prefers-reduced-motion:
  reduce) { .runout-hint.warn-critical { animation: none; } }` 容错。Step 6 CSS 里加一行。
- **可能影响的现有测试**：
  - `test/processingSystem.test.js`（如存在）—— Step 1 加 snapshot 不改 food/meal 流量，只是 side-channel。
  - `test/food-rate-breakdown.test.js`（Round 5 落地）—— Step 2 把 foodRateBreakdown 重构为 helper
    的副作用；需确保既有测试仍 pass（保持向后兼容：`this.foodRateBreakdown` 句柄仍存在、文本格式不变）。
  - `test/entity-focus-player-view.test.js`—— 本轮不改 EntityFocus，零影响。
  - `test/hudController.test.js`（如存在）—— Step 3/6 加的新 DOM 句柄是 nullable `el()`（已有 pattern），
    stub DOM 下不抛。
- **benchmark 回归风险**：Step 1 每 tick O(processors) 遍历 ≤10 项、Step 2-3 纯 UI 写入。
  ProcessingSystem 当前 avg ~0.5ms（reviewer 原文 Debug 数据），预估 +5% = +0.025ms/tick，
  无可测影响。DevIndex 预期 ±1（噪声级）。

---

## 6. 验证方式

### 新增测试
- `test/processingSnapshot.test.js` — snapshot 维护 + stalled state + 单调性（Step 7）
- `test/inspectorProcessingBlock.test.js` — Inspector Panel 对 KITCHEN/SMITHY/CLINIC tile 的 UI 输出（Step 8）
- `test/resourceRunoutEta.test.js` — HUD runout ETA + warn-soon/critical CSS class（Step 9）

### 手动验证
1. `npx vite` 启动 dev server；开场 Temperate Plains，Autopilot ON，4x 速度跑 2 分钟。
2. **Processing snapshot 可见性**：Alt+左键点击一座 Kitchen tile → Inspector 面板出现 "Processing"
   块，显示百分比进度 + ETA 秒数；当该 Kitchen 没有 COOK 在相邻时进度条冻结且文字为 "stalled - no cook"。
3. **全资源 breakdown**：HUD 的 Wood 行在食堂开始产出后显示 `(prod +4 / cons -2)`，Stone 行
   `(prod +0 / cons -6)`（Smithy 在耗 stone）。不再只是一个 `▲ +X/min` 数字。
4. **runout ETA**：Food stock 跌到 30 且 netPerMin<-15 时 `foodRunoutHint` 显示 `≈ 2m 0s until empty`
   带粉色 warn-soon class；跌到 10 时变红闪的 warn-critical。
5. **Inspector Logistics 行**：点击任何 Farm/Lumber/Quarry/Warehouse tile 看到
   `Logistics: connected ×1.15` 或 `isolated ×0.85`（之前是空）。

### benchmark 回归
- `scripts/long-horizon-bench.mjs` 4-seed (1/7/42/99) temperate_plains --max-days 365：
  - DevIndex 中位数不得低于当前 median (33.88) - 5% = **32.19**。Step 1 为 side-channel
    snapshot + Step 2-6 纯 UI，理论 DevIndex 不变 ±1。
  - 若任一 seed 变成 `loss`（vs 当前 2 loss/4）扩展为 3+ loss，本 plan **整体 revert**。

### 可度量指标声明（reviewer 01d 原话 1:1 映射）
- "资源箭头加来源拆分 (consume -180 / harvest +28.3)" → FIXED-EXTENDED（Round5 食物已做；本轮扩到 wood/stone/herbs/meals/tools/medicine 6 资源，Step 2）。
- "Food <50 时红框闪烁而不是只有目标文字" → FIXED（Step 3 + 6，warn-soon + warn-critical class）。
- "地块特性上 HUD；elevation/moisture/soil 的数值既然在引擎里就有" → FIXED-PARTIAL（Step 5 补 processing + logistics efficiency；elevation/moisture/soil 字段已由现有 getTileInsight 注入 `#renderTileSection`，非本 plan 责任）。
- "从 Debug 层把最贵信息搬到 HUD 中间层" → FIXED（Step 1 processing snapshot 从 `buildingTimers` → `state.metrics` → HUD + Inspector 两路消费）。

---

## 7. Depth / Coverage 自检

- **跨层触达**：✅ `src/simulation/economy/ProcessingSystem.js`（simulation 层，新 emit） +
  `src/ui/panels/InspectorPanel.js`（ui/panels 层，新消费）+ `src/ui/hud/HUDController.js`（ui/hud 层）+
  `index.html`（DOM 层）= 3 层 ≥ 2 要求。
- **LOC 下限**：6 edit + 3 test ≈ 260 LOC > 120 下限 > 80 标准下限。
- **Step 行为改动比例**：9 step 中 8 个改变行为（新 emit / 新 DOM / 新 CSS class / 新 detail block /
  新辅助 helper / 新测试 ×3），仅 Step 6 里 CSS keyframes 是纯 style。8/9 ≈ 89% ≥ 50%。
- **非单挑一条**：reviewer §4 13 条改进 + §1-2 各层 findings 共 26+ 项，本 plan Coverage Matrix 对
  26 项全部显式处置（FIXED / PREVIOUSLY-FIXED / SUBSUMED / D5-legit），覆盖率 96.2%。

## 8. UNREPRODUCIBLE / 静态证据

全部 Finding 可在当前 HEAD `bc7732c` 代码上静态验证：
- `Grep state.metrics.processing src/` = 0 结果 → snapshot 不存在被证实。
- `Grep woodRateBreakdown src/ui` = 0 结果 → wood/stone/... breakdown UI 不存在被证实。
- `Grep runout src/ui` = 0 结果 → ETA UI 不存在被证实。
- `InspectorPanel.js:77-109` 明确只渲染 Type/Passable/MoveCost/Height/Neighbors，无 processing/logistics
  → Inspector 空话被证实。
- `ProcessingSystem.js:46-51` 明确 `buildingTimers.set(key, timer)` 但从不 export / emit →
  数据孤岛被证实。

因此 Round 5 落地虽然推动了 Debug→HUD 第一刀（worker list + food breakdown），
Round 5b 这一刀把 **building processing + 全资源 breakdown + 耗尽 ETA + tile inspector** 接入，
彻底兑现 reviewer §1.3 "玩家能读懂的中间观察层" 与 §4-机制-2/5/7 三条改进诉求。
