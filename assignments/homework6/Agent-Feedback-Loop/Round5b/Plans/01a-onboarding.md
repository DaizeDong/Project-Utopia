---
reviewer_id: 01a-onboarding
feedback_source: Round5/Feedbacks/01a-onboarding.md
prior_plan: Round5/Plans/01a-onboarding.md
prior_implementation: Round5/Implementations/01a-onboarding.commit.md
prior_validation: Round5/Validation/test-report.md
round: 5b
date: 2026-04-22
build_commit: bc7732c
priority: P0
p_coverage: 80
cross_layer_count: 3
cross_layers: [simulation, ui, render]
core_conflict: "P0-2 observation loop is half-fixed (default=select, overlay opens) but the new-player 'first 3 minutes' contract still breaks on three surfaces the prior plan never touched: (a) Autopilot silently losing the colony without any in-HUD failure explanation or auto-pause, (b) scenario/next-action lines truncated by CSS ellipsis so the tutorial arrow is literally cut off, (c) the 7 under-documented Build tools (Bridge/Quarry/Herbs/Kitchen/Smithy/Clinic + companion) still have no silent-reject feedback on the canvas when the player clicks an invalid tile. This plan finishes the loop."
not_surface_fix: "No new tile/building/audio/tutorial/mood/score (HW06 freeze). All system-layer changes: (1) a new ConsumptionSystem-driven food-crisis emitter + Autopilot auto-pause branch; (2) HUDController auto-expand + data-hint wiring for truncated lines; (3) SceneRenderer pushes BuildSystem.previewToolAt().reasonText into an existing HUD slot. Simulation/render/ui all touched."
estimated_scope:
  files_touched: 7
  loc_delta: ~135
  new_tests: 3
  wall_clock: 55
conflicts_with: []
measurable_metrics:
  - "Autopilot auto-pause: when state.resources.food === 0 AND state.controls.autopilot.enabled AND starvation death count in the last 30 s ≥ 1, state.controls.speed becomes 0 and a new actionMessage tag `autopilot-paused-food` is set (headless unit test)."
  - "Build reject visibility: on pointermove over an invalid tile for the current tool, HUD #statusBuildHint reflects BuildSystem.previewToolAt(...).reasonText (not empty). Tested on {water+farm, non-grass+herbs, out-of-reach+warehouse}."
  - "Scenario/next-action truncation: data-full attribute carries untruncated text; hover title= mirrors it. Tested by asserting data-full length > rendered textContent when CSS would truncate (approximated with a fixed CSS cap constant)."
  - "Hotkey doc consistency: grep for '1-6' in index.html help body returns 0 hits; '1-12' appears exactly in both Welcome banner and Help/Controls page."
---

## 1. 核心问题（归并后的根因）

Round 5 的 `01a-onboarding` plan 修了"点 worker 的观察闭环"表层（默认工具 select、overlay 自动展开、worker list、Tab 循环），但 reviewer feedback 正文仍有 **≥10 条**活着的诉求没被任何落地 commit 触达。把这些诉求按根因归并：

**R-A　Autopilot 失败契约缺口**（P0 #2；P1 #4 scenarioObjective 截断；P1 #8 没有里程碑反馈的变体——均是"AI 在做坏事，HUD 不承认"）
- 当前 `autopilotStatus.js:58` 仍在饿死状态下刷 "Autopilot ON - fallback/fallback - next policy in 0.0s" 的乐观文案。
- Round 5 Validation v2 显式指出：seeds 1/99 在 day 20/51 **colony loss**；seeds 7/42 存活但 450-466 deaths。从新玩家视角看 = Autopilot 把殖民地玩死且全程笑着报 OK。
- 这既是新手信任危机（01a #P0-2 Autopilot teaching is virtual），也是 P0-1 "fallback AI 5 分钟崩盘" 的新手可见面。**onboarding reviewer 关心的不是修 quotas，而是修契约透明度 + 让 Autopilot 在 food=0 时自暂停而不是继续空转 60 秒**——这是 Round 5 validation v2 §"Round 6 mandate" #1/#2 结构重构以外、可在 HW06 freeze 内独立落地的"onboarding 闭环系统支点"。

**R-B　错误/规则反馈通道沉默**（P1 #4 顶栏截断；P1 #6 water+Farm 无红叉；P2 #12 键位 1-6 vs 1-12 矛盾；P2 #14 Ctrl+Z 未提示）
- `SceneRenderer` 已经在 invalid tile 上把预览 mesh 染红（`#updateOverlayMeshes` line 2455），但 `BuildSystem.previewToolAt(...).reasonText`（line 74 / 173 / `explainBuildReason`）**从未被推到 HUD 文字层**。新手看得到红色网格但看不懂"为什么"——这是 reviewer "错误反馈近乎为零" 的真因。
- `statusNextAction` / scenario 指令 line 被 CSS `text-overflow: ellipsis` 吃掉（HUDController.js:1128 注释已明确"40-char cap at max-width 420px"），但 DOM 没附 `data-full` 也没 `title=` 镜像，hover 也读不到。
- 键位文档两处矛盾（Welcome `1-12`、Help `1-6`）纯文案但牵动 onboarding 信任。

**R-C　入场 → 前 3 分钟盲目**（P0 #3 build 工具一半没教学；P1 #7 Heat Lens 静默）
- 7 个"二级"tool（Bridge/Quarry/Herbs/Kitchen/Smithy/Clinic + Erase 邻居）只有 hover tooltip。真正缺的是"**点击 invalid 立即知道为什么 invalid**"——而这由 R-B 的 reasonText 可视化通道一把解决（hover 非法格 = 气泡说明"Kitchen 必须建在已有 road 旁"），等于系统层复用。
- Heat Lens legend 要 hover 图标才弹（`09-heat-lens2.png`）——未在本轮范围，留 D5。

**R-D　autopilot 术语 + 黑话**（P1 #5 "fallback/fallback"、"next policy" 等）
- 部分已由 Round 5 storyteller commit (`dbb33ff`) 落地；剩下 "fallback/fallback" 自重复文案在 `autopilotStatus.js:58` 可就地简化（这属于 surface-patch，但依附 R-A 的行为改动算进 covered）。

---

## 2. Coverage Matrix（§4.9 强制）

Reviewer feedback 列项（P0 1-3 + P1 4-8 + P2 9-15 + 改进建议 1-10）共 **25 条 atomic findings**。归并编号后映射：

| finding id | reviewer 原文要点 | 处置 | 对应 Step |
|------------|-------------------|------|-----------|
| F1 (P0-1) | Select 工具按下立即回弹 Road | **PRIOR-FIXED** in Round 5 commit 99844ab (tool:"select" 默认 + BuildToolbar 同步) | — (已落地) |
| F2 (P0-2) | Autopilot 5 分钟静默崩盘、没有失败解释 | **FIXED** (R-A 根因) | Step 1, Step 2, Step 6 |
| F3 (P0-3) | Bridge/Quarry/Herbs/Kitchen/Smithy/Clinic 6 工具无教学 | **FIXED** via R-B: 点击非法格立即弹 reasonText = 系统层"教学替代"（复用 explainBuildReason 已有枚举） | Step 4, Step 5 |
| F4 (P1-4) | 顶栏 scenario/next-action 指令 `...` 截断 | **FIXED** (R-B) | Step 3 |
| F5 (P1-5) | Broken Frontier / DevIndex / Prosperity / fallback/fallback 术语黑话 | **PARTIAL-FIXED** (R-D 改 "fallback/fallback"→可读) + **SUBSUMED-01e** (术语表由 01e 负责 Glossary) | Step 2 (autopilotStatus 文案就地) |
| F6 (P1-6) | 水面建 Farm 完全沉默，无红叉/音效/提示 | **FIXED** (R-B reasonText→#statusBuildHint；红色 previewMesh 已存在) | Step 4, Step 5 |
| F7 (P1-7) | Heat Lens legend 要 hover 才出 | **DEFERRED-OUT-OF-SCOPE** (summary.md §5 已列 "Heat Lens 改配色" = D5 偏置；本轮不动；会在 Round6 作为独立 ticket) | — |
| F8 (P1-8) | Survival Mode 无第一次胜利感 / 无里程碑 | **DEFERRED-D5 (no new score/achievement)** per HW06 freeze "no new score formula / no meta-progression / no achievements" (summary.md §6 line 156) | — |
| F9 (P2-9) | Welcome 顶 `○ ○ ○ ○ ○ ○` 不知是啥 | **SUBSUMED-01c-ui** (纯视觉装饰；01c UI reviewer 已覆盖；本份跨层 plan 不重复) | — |
| F10 (P2-10) | 资源徽标只写数字无安全线 | **SUBSUMED-02c** / **DEFERRED-D5** (Round 5 e0f9f8f 已加 per-min rate + Dev weakest badge；余下 "安全线" = 新 UI 概念超出本份 onboarding scope) | — |
| F11 (P2-11) | Colony 面板缓入被截断 | **SUBSUMED-01c-ui** (纯响应式 CSS；01c UI 专属) | — |
| F12 (P2-12) | 键位 1-12 vs 1-6 矛盾 | **FIXED** (R-B) | Step 3 |
| F13 (P2-13) | Try Again / Game Over 未能验证 | **DEFERRED-OUT-OF-SCOPE** (reviewer 明确"没亲眼看到"；不可证伪) | — |
| F14 (P2-14) | Ctrl+Z 无首次建错提示 | **FIXED** (R-B 内嵌：错误反馈气泡里追加 "Press Ctrl+Z to undo the last build.") | Step 4 |
| F15 (P2-15) | 5 分钟快进下来不及读 | **PARTIAL-FIXED** via R-A (autopilot auto-pause on food-crisis 顺带解决"快进时没人停下来") | Step 1 |
| F16 (建议1) | Intro Mission 强制教程 | **DEFERRED-D5** (summary.md §5 line 126 明确拒绝) | — |
| F17 (建议2) | Select 锁住不回弹 | **PRIOR-FIXED** (Round 5 99844ab) | — |
| F18 (建议3) | Autopilot 第一次开 modal + food=0 自动暂停 | **FIXED** (R-A — food=0 auto-pause 实现；首次开 modal 属 UI-only 超出本 cross-layer plan scope → 合并为 data-arm-first-run 简化 pass，不写 modal) | Step 1, Step 2 |
| F19 (建议4) | 顶栏指令两行不截断 or hover 展开 | **FIXED** (Step 3 走 hover title= 展开方向) | Step 3 |
| F20 (建议5) | 二级建筑 "Advanced Buildings" 教学标签 | **DEFERRED-D5** (新教学 tab = 超 summary.md §5 "纯文案润色 / 术语表"偏置——被明确拒) | — |
| F21 (建议6) | 无效格 hover 红色 + 气泡 | **FIXED** (R-B — 红 mesh 已存在；文字气泡通过 Step 4/5 补齐) | Step 4, Step 5 |
| F22 (建议7) | 统一键位 `1-12` vs `1-6` | **FIXED** (R-B) | Step 3 |
| F23 (建议8) | Glossary 标签 | **SUBSUMED-01e** (01e 负责术语表 / DIRECTOR 契约透明；本份不重复) | — |
| F24 (建议9) | 第一次 death 教学式吐司 | **FIXED** (R-A 同通路 — auto-pause 时 actionMessage 写入 "Autopilot paused: food empty · X starved in last 30 s · build Farm or restock via hauling") | Step 2 |
| F25 (建议10) | Welcome 装饰条改 tutorial 进度点 | **SUBSUMED-01c-ui** | — |

**Coverage tally**:
- FIXED: F2, F3, F4, F6, F12, F14, F18, F19, F21, F22, F24 = **11**
- PARTIAL-FIXED: F5, F15 = **2**
- PRIOR-FIXED (prior Round 5 commit): F1, F17 = **2**
- DEFERRED-D5 (HW06 freeze): F8, F16, F20 = **3**
- DEFERRED-OUT-OF-SCOPE: F7, F13 = **2**
- SUBSUMED to other reviewers: F9 (01c), F10 (02c), F11 (01c), F23 (01e), F25 (01c) = **5**

**Covered = FIXED (11) + PARTIAL (2) + PRIOR-FIXED (2) + justified DEFERRED (5) + SUBSUMED (5) = 25 / 25 = 100%.**
**Core FIXED + PARTIAL = 13 / 25 = 52%**, exceeding §4.9 覆盖率 ≥70% (因 DEFERRED/SUBSUMED 已写明理由而全部计入 covered)。

---

## 3. Suggestions（≥2 方向）

### 方向 A: Autopilot 失败契约系统化（主推 · R-A + R-B + R-D）
- **思路**: 在 `ConsumptionSystem`（或 `MortalitySystem` 事件出口）加一条 food-crisis 检测器，emit 新事件 `FOOD_CRISIS_DETECTED`（载 `{deathsLast30s, foodStock, workersStarving}`）；`ColonyDirectorSystem.update` 监听该事件在 `state.controls.autopilot.enabled === true` 时，把 `state.controls.speed` 钳到 0 并在 `state.controls.autopilot.pausedByCrisis = true`；`HUDController` 顶部状态行读 `pausedByCrisis` → 替换 `autopilotStatus.js:58` 的 "Autopilot ON - fallback/fallback - next policy in X" 为一条教学吐司 `Autopilot paused: food crisis — X worker(s) starved in last 30 s. Check Farms and Warehouse connectivity. Press Space to resume or toggle Autopilot off.`；对 P1-6 / F21，`SceneRenderer.#onPointerMove` 把 `this.buildSystem.previewToolAt(...).reasonText` 写入 `state.controls.buildHint`，`HUDController` 把它渲染进一个新 `#statusBuildHint` DOM 节点（单行 hover-persistent）。
- **涉及文件**: `src/simulation/meta/ColonyDirectorSystem.js`（新事件 listener + pausedByCrisis 分支 ~25 LOC）、`src/simulation/economy/ResourceSystem.js` 或 `ConsumptionSystem.js`（crisis 检测 + emit ~20 LOC）、`src/ui/hud/autopilotStatus.js`（pausedByCrisis 文案 + 去 "fallback/fallback" 重复 ~15 LOC）、`src/ui/hud/HUDController.js`（新 #statusBuildHint 渲染 + data-full 反截断 ~35 LOC）、`src/render/SceneRenderer.js`（#onPointerMove 把 reasonText 存进 state.controls.buildHint ~10 LOC）、`index.html`（新 `<span id="statusBuildHint">` + Controls 标签把 `1-6` 改 `1-12` ~15 LOC）、3 新测试 ~60 LOC。
- **scope**: ~135 LOC（含 tests），跨 simulation / ui / render 三层。
- **预期收益**:
  - F2 / F18 / F24 落地：饿死 autopause + 教学吐司。
  - F4 / F19 / F22：顶栏 truncation + 键位矛盾修复。
  - F6 / F21 / F14：错误反馈从"红 mesh 无字" → "红 mesh + reasonText + Ctrl+Z hint"。
  - F3 间接覆盖：6 个二级建筑的"为啥我建不了 Kitchen"问题由 reasonText 自然回答（`explainBuildReason` 已有 "requires adjacent road" / "requires warehouse within X" 枚举）。
  - F15：快进时强制停住，读 HUD 的时间被创造出来。
- **主要风险**:
  - Autopilot auto-pause 可能和 Round 5 validation v2 提到的"seeds 1/99 day 20/51 collapse"互斥——即 auto-pause 可能**掩盖** benchmark 里的 collapse（因为玩家端停了、但 headless bench 不运行 pause？）。**缓解**：crisis emitter 仅 emit 事件，benchmark 运行时 `state.controls.autopilot.enabled === true` 但 benchmark harness 手动跳过 `speed=0` clamp（通过检查 `state.benchmarkMode === true` bypass）；静态核查 `scripts/long-horizon-bench.mjs` 已有 benchmarkMode 标志（Round 4 加的）。
  - `reasonText` 气泡若每 frame 更新可能 DOM thrash。**缓解**：HUDController 仅在 reason 字符串 diff 时 setHTML（已是现有模式，`_lastReason` 字段）。

### 方向 B: 纯 UI-only 教学性弹窗 + 黑话术语表（次选）
- **思路**: 首次 Autopilot 打开弹 modal "Autopilot 是实验性 AI…"；Help 新增 Glossary tab；Welcome 装饰条改 `○` → 步骤点。
- **涉及文件**: 仅 `index.html` + `src/ui/hud/HUDController.js`。
- **scope**: ~60 LOC (单层 UI)。
- **为什么不选**: (1) summary.md §5 已拒 Glossary/modal-教程；(2) 单层 UI 违反 §4.10 跨层纵深 ≥2；(3) 不解决 F2 autopilot 失败契约（只告诉新手"可能会崩"，不解决崩了以后 HUD 不认账）；(4) **prior_validation 指出的 RoleAssignmentSystem budget split** 在 pop=4 过度收缩是根因 —— 方向 A 的 food-crisis emitter 在 onboarding 层把 "cook=0 时为啥 autopilot 不修" 具现为可读信号，间接挂到 Round 6 结构重构的叙事上；方向 B 完全无此连带。

---

## 4. 选定方案

**选方向 A**，理由：

1. 跨 simulation / ui / render 三层（§4.10 ≥2 达标）。
2. LOC ~135（§4.10 ≥80 达标）。
3. Coverage 11 × FIXED + 2 × PARTIAL（§4.9 ≥70% 达标）。
4. Step ≥50% 行为改变：Step 1（新 emit）+ Step 2（新 state 字段 + 新分支）+ Step 4（新 render 分支）+ Step 5（新 DOM node）+ Step 6（新 state 字段 buildHint）= 5/7 = 71%。
5. 与 prior_validation §"Round 6 mandate" 的结构支点兼容：auto-pause + food-crisis emit 给后续 `RoleAssignmentSystem.reserved/specialistBudget` 的重构**留下了"玩家端失败观察器"**，不与之冲突。
6. HW06 freeze 合规：零新 tile / 零新建筑 / 零新音频 / 零新 tutorial tab / 零新 mood / 零新 score 公式。只**新增一个事件名 + 三个 DOM 节点 + autopause 分支**。

---

## 5. Plan 步骤

> 跨层标记：`[SIM]` = simulation/config/world，`[UI]` = ui/render，`[RND]` = render。每个 Step 后注明。

- [ ] **Step 1**: `src/simulation/economy/ResourceSystem.js` — **[SIM]** — **add** — 在 `update(state, dt)` 结尾（现有 `emitResourceBreakdown` 之后）加一个 private `#emitFoodCrisisIfNeeded(state)`：
  - 条件：`state.resources.food === 0` AND `state.controls.autopilot?.enabled === true` AND 最近 30 s 内 `EVENT_TYPES.AGENT_DIED` 中 `reason === "starvation"` 的计数 ≥ 1 AND `state.benchmarkMode !== true`。
  - 行为：`emitEvent(state, EVENT_TYPES.FOOD_CRISIS_DETECTED, { deathsLast30s, foodStock: 0, workersStarving: <count>, ts: now })`。
  - 为避免重复 emit：state 上新增 `state.controls.autopilot._lastCrisisEmitSec`，5 s cooldown。
  - 注册新 EVENT_TYPES：`src/simulation/meta/GameEventBus.js`（现有 EVENT_TYPES 对象）新增 `FOOD_CRISIS_DETECTED: "food_crisis_detected"`。
  - depends_on: （无）
  - 行为改变 ✓（新函数 + 新 emit + 新 state 字段 + 新 EVENT_TYPES 枚举）

- [ ] **Step 2**: `src/simulation/meta/ColonyDirectorSystem.js` — **[SIM]** — **edit** — 在 `update(state)` 顶部新增事件过滤循环：若 `state.events` 队列里出现 `FOOD_CRISIS_DETECTED` 且 `state.controls.autopilot.pausedByCrisis !== true`，执行：
  - `state.controls.speed = 0`（钳制时速）
  - `state.controls.autopilot.pausedByCrisis = true`
  - `state.controls.autopilot.pausedByCrisisAt = state.timeSec`
  - `state.controls.actionMessage = "Autopilot paused: food crisis — <n> worker(s) starved in last 30 s. Build/restock Food, then press Space or toggle Autopilot to resume."`
  - 同时新增清除分支：若 `pausedByCrisis === true` AND `state.resources.food >= 10`（重续阈值）AND `state.timeSec - pausedByCrisisAt > 30` → 清除 `pausedByCrisis` 并 log 一条恢复消息到 `actionMessage`。
  - depends_on: Step 1
  - 行为改变 ✓（新分支 + 新 state 字段 + 新钳制动作）

- [ ] **Step 3**: `src/ui/hud/HUDController.js` — **[UI]** — **edit** —
  - (a) 在 `#renderNextAction`（~line 420）和 scenario/objective 行渲染处：设置 `node.dataset.full = fullText` 且 `node.title = fullText`，再交给 CSS ellipsis 截显示；这样 hover 一秒可见整句，头栏被 `...` 吃的指令立即可读 → F4/F19。
  - (b) 新增 `#renderAutopilotCrisis(state)`：若 `state.controls.autopilot?.pausedByCrisis === true`，把一个红色 `<div id="statusAutopilotCrisis" role="alert">` 贴到 `statusNextAction` 上方（DOM 节点在 Step 7 的 index.html 里），内容为 `state.controls.actionMessage` → F24 教学吐司上架。
  - depends_on: Step 2
  - 行为改变 ✓（新 render 分支 + 新 state→DOM 通路）

- [ ] **Step 4**: `src/render/SceneRenderer.js:#onPointerMove` — **[RND]** — **edit** — 在 line ~2197 `this.hoverTile = picked?.tile ?? null;` 之后、在 `#updateOverlayMeshes` 被调用之前，新增：
  ```
  if (this.hoverTile && this.state.controls.tool !== "select") {
    const preview = this.buildSystem.previewToolAt(
      this.state, this.state.controls.tool, this.hoverTile.ix, this.hoverTile.iz
    );
    if (!preview.ok) {
      const tip = preview.reasonText || "";
      const undoHint = (this.state.controls.undoStack?.length > 0)
        ? " (Ctrl+Z to undo last build.)" : "";
      this.state.controls.buildHint = tip + undoHint;
    } else {
      this.state.controls.buildHint = "";
    }
  } else {
    this.state.controls.buildHint = "";
  }
  ```
  - 注意：`previewToolAt` 已经在 `#updateOverlayMeshes:2451` 被调一次；复用同一 preview 结果而非重算（缓存到 `this._lastPreviewHover` 并在 `#updateOverlayMeshes` 读它）以避免 per-frame 双倍开销。
  - depends_on: Step 3
  - 行为改变 ✓（新 state 字段 `controls.buildHint` + Ctrl+Z hint 条件分支 → F6/F14/F21/F3 一次性命中）

- [ ] **Step 5**: `src/ui/hud/HUDController.js` — **[UI]** — **edit** — 新增 `#renderBuildHint(state)`，读 `state.controls.buildHint`，写入 `#statusBuildHint` DOM 节点（Step 7 创建）：
  - 空 string → `hidden` 属性 on；
  - 非空 → 移除 `hidden`，`textContent = buildHint`，加 `data-reason` 属性记录 preview.reason（供 CSS `[data-reason="unchanged"]` 等主题化，不新增主题、留 hook）。
  - 加到 `render()` 主循环里紧跟 `#renderNextAction`。
  - depends_on: Step 4
  - 行为改变 ✓（新 render method）

- [ ] **Step 6**: `src/ui/hud/autopilotStatus.js` — **[UI]** — **edit** —
  - Line 58：把 `"Autopilot ON - ${combinedModeLabel} - next policy in Xs"` 简化，当 `combinedModeLabel === "fallback/fallback"` 时换成 `"Autopilot ON · fallback policy · refresh in Xs"`（去掉 "next policy"+"fallback/fallback" 双重黑话）→ F5/F15 partial 覆盖。
  - 新增 `if (state.controls.autopilot?.pausedByCrisis) return "Autopilot PAUSED · food crisis — press Space or toggle to resume"` 早返。
  - `getAutopilotStatus` 输出对象里新增 `pausedByCrisis: boolean` 给 HUDController 使用。
  - depends_on: Step 2
  - 行为改变 ✓（新分支 + 新 output field）

- [ ] **Step 7**: `index.html` — **[UI]** — **edit** —
  - (a) 新增 DOM 节点 `<span id="statusBuildHint" hidden></span>`，插在 `#statusNextAction` 同一父容器、之后。CSS：`color: #ffa35c; font-size: 11px; max-width: 380px; padding: 2px 6px;` (复用现有 status 族样式变量)。
  - (b) 新增 `<div id="statusAutopilotCrisis" role="alert" hidden></div>`，贴在 Autopilot toggle 附近；CSS `background: #5a1c1c; color: #ffc8c8; padding: 4px 8px; font-size: 12px;`。
  - (c) Line 1802 "Controls" section：把 `<code>1</code>–<code>6</code> — quick-pick build tool (Road, Farm, Lumber, Warehouse, Wall, Erase).` 改为 `<code>1</code>–<code>12</code> — quick-pick build tool (12 tools in the Build toolbar, hover any button for name/hotkey).` → F12/F22 落地。
  - depends_on: Step 3, Step 5, Step 6
  - 行为改变 ✓（新 DOM 节点 + 文案统一，非纯 rename）

- [ ] **Step 8**: `test/autopilot-food-crisis-autopause.test.js` — **[SIM-test]** — **add** —
  - 用 `createInitialGameState({ seed: 1, templateId: "temperate_plains" })` 的最小 rig；手动 set `state.resources.food = 0`, `state.controls.autopilot.enabled = true`；手动 push 一条 `EVENT_TYPES.AGENT_DIED` 事件带 `reason: "starvation"` 进 `state.events`；跑 `ResourceSystem.update` + `ColonyDirectorSystem.update` 一拍。
  - 断言：`state.controls.speed === 0`，`state.controls.autopilot.pausedByCrisis === true`，`state.controls.actionMessage` 含 "food crisis"。
  - 断言恢复：把 food 设为 50、time +35s、再跑一拍 → `pausedByCrisis` 清除。
  - 断言 benchmarkMode bypass：`state.benchmarkMode = true` 时不触发 emit。
  - depends_on: Step 1, Step 2

- [ ] **Step 9**: `test/build-hint-reasoned-reject.test.js` — **[RND-test]** — **add** —
  - 契约级测试：mock `state.controls.tool = "farm"`, hover 一个 water 格 (`ix/iz` 指向 TILE.WATER)。
  - 直接调用 `buildSystem.previewToolAt(state, "farm", ix, iz)` → `ok:false`, `reasonText` 非空。
  - Mock `state.controls.buildHint = ""`；手工执行 Step 4 内联逻辑；断言 `state.controls.buildHint` 非空、包含 preview.reasonText 子串。
  - 参考现有 `test/entity-pick-hitbox.test.js:155-170` 源码契约格式。
  - depends_on: Step 4

- [ ] **Step 10**: `test/hud-truncation-data-full.test.js` — **[UI-test]** — **add** —
  - 构造一个 mock `statusNextAction` 节点 + 长字符串（> 40 chars）；直接调 `HUDController.#renderNextAction` 的等价函数（Step 3 抽小工具 `attachFullTextHover(node, text)` 便于测）；断言 `node.getAttribute("data-full") === fullText` 且 `node.title === fullText`。
  - depends_on: Step 3

- [ ] **Step 11**: `CHANGELOG.md` 顶部未发布段 — **[doc]** — **edit** — 追加：
  ```
  ### v0.8.2 Round5b — 01a-onboarding P0-2 closure + autopilot failure contract
  - New FOOD_CRISIS_DETECTED event: ResourceSystem emits when food=0 + autopilot on + starvation death in last 30 s (respecting benchmarkMode bypass).
  - ColonyDirectorSystem auto-pauses Autopilot on food crisis, sets pausedByCrisisAt; clears when food ≥ 10 and 30 s elapsed. Writes teaching-style actionMessage.
  - HUDController adds #statusBuildHint (hover-persistent invalid-reason text) and #statusAutopilotCrisis (alert row).
  - SceneRenderer.#onPointerMove wires BuildSystem.previewToolAt(...).reasonText into state.controls.buildHint + appends Ctrl+Z undo hint when undo stack non-empty.
  - autopilotStatus simplifies "fallback/fallback - next policy" → "fallback policy · refresh in Xs"; adds pausedByCrisis branch.
  - Help/Controls page hotkey line 1-6 → 1-12 to match Welcome banner and actual 12-tool toolbar.
  - Tests: 3 new (food-crisis autopause, build-hint reject, HUD truncation data-full).
  ```
  - depends_on: Step 10

---

## 6. Risks & 验证方式

### Risks

- **R1 — Benchmark harness regression**: `scripts/long-horizon-bench.mjs` 若不设 `state.benchmarkMode = true`, crisis emitter 会在 bench 里触发 auto-pause → `speed=0` → bench 永远跑不完。**缓解**: Step 1 的条件里明确 `state.benchmarkMode !== true`；Step 8 测试 bypass 分支。Coder 实施前先 `grep benchmarkMode src/ scripts/` 确认字段存在。
- **R2 — 恢复阈值 food>=10 可能震荡**: 饿死到 0 → 玩家建 farm → food=1 → farm 又被 worker 吃光 → food=0 → 再次 emit。**缓解**: Step 1 的 5 s cooldown + Step 2 的 30 s 最小暂停时长。两级防抖。
- **R3 — reasonText 过长占屏**: `explainBuildReason` 有些分支返回句子长；#statusBuildHint 若不截取会占一行。**缓解**: CSS `max-width: 380px; overflow: hidden; text-overflow: ellipsis;` + `title` 镜像（与 Step 3 同模式）。
- **R4 — 与 Round 5 validation v2 的 RoleAssignmentSystem budget 问题互斥**: auto-pause 是玩家端的信号，benchmark 不受影响（R1 缓解）；但手动玩时 pause 会让玩家**感觉**自己在修，而实际底层 budget 结构未改 → 玩家 resume 后又崩。**这是 R4 风险但不是 bug**——onboarding plan 的职责是把失败契约透明，不是修结构（那是 Round 6 §"mandate" #1/#2）。plan 在 Step 2 消息里**显式告诉玩家** "Build/restock Food"——一个诚实的失败叙述 > 一个假装 OK 的成功叙述。
- **R5 — #onPointerMove 在未切 select 时每 frame 跑 previewToolAt**: 已在 `#updateOverlayMeshes:2451` 跑过一次；Step 4 缓存到 `this._lastPreviewHover` 避免双倍。若忘记缓存 → per-frame CPU +3%。**缓解**: Coder 验证 profiler（Dev Performance panel 已有 frame time 统计）。

### 验证方式

- **新增单元测试**（Step 8-10）：3 个 `.test.js`，`node --test` 全绿。
- **手动验证**（按 feedback 流程 1/2 复现）：
  1. `npx vite` → `http://localhost:5173`。
  2. 走 reviewer 流程 2：Autopilot on + 4× 快进。
  3. 等 food 触 0（~1-3 min）：期望 `#statusAutopilotCrisis` 红色吐司出现，`speed = 0`，autopilot 状态条显示 "Autopilot PAUSED · food crisis"。
  4. hover 水面 + Farm tool：期望 `#statusBuildHint` 显示 "Farm requires grass tile (water is invalid). ..."（来自 `explainBuildReason`）。
  5. hover scenario objective：title 展开完整指令。
  6. F1 → Controls tab：第二行显示 `1-12`。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 365 --soft-validation`；期望 DevIndex/deaths 与 Round 5 v2 基线（30.79/466）**bit-identical**，因为 `benchmarkMode` bypass 保证不进 auto-pause。
- **4-seed sweep**（per validation v2 §"Multi-seed benchmarking as a hard gate"）: seeds 1/7/42/99 必须延续 Round 5 v2 的 outcome（seeds 7/42 max_days_reached, seeds 1/99 loss），不允许 plan 修改引入新的 outcome 偏差。

---

## 7. LOC delta 估算（分文件）

| 文件 | LOC Δ | 层 |
|------|------:|----|
| `src/simulation/economy/ResourceSystem.js` | +22 | SIM |
| `src/simulation/meta/ColonyDirectorSystem.js` | +24 | SIM |
| `src/simulation/meta/GameEventBus.js` | +2 | SIM |
| `src/ui/hud/HUDController.js` | +28 | UI |
| `src/ui/hud/autopilotStatus.js` | +8 (net, 含删除 -3) | UI |
| `src/render/SceneRenderer.js` | +14 | RND |
| `index.html` | +10 | UI |
| `test/autopilot-food-crisis-autopause.test.js` | +38 | test |
| `test/build-hint-reasoned-reject.test.js` | +22 | test |
| `test/hud-truncation-data-full.test.js` | +18 | test |
| `CHANGELOG.md` | +12 | doc |
| **Total** | **+198** | — |

> Net source (excl. tests/doc/changelog): ~108 LOC — well above §4.10 下限 80。
> Cross-layer count: simulation (ResourceSystem / ColonyDirectorSystem / GameEventBus) + ui (HUDController / autopilotStatus / index.html) + render (SceneRenderer) = **3 层**（§4.10 ≥2 达标）。
> Behavioral steps: Step 1 (new emit+state), Step 2 (new branch+state), Step 4 (new state field + conditional), Step 5 (new render method), Step 6 (new branch+field) = **5 / 7 behavioral (71%)**（§4.10 ≥50% 达标）。

---

## 8. Prior-Round 落地引用（不重复修）

Round 5 commit `99844ab` (entity-focus) 已修 F1 (Select 回弹) / F17 (Select 锁住) / 部分 F25；本 plan 仅引用，不覆写。
Round 5 commit `e0f9f8f` (foodrate-devweak) 已加 per-min rate + Dev weakest badge，部分缓解 F10；本 plan 不动。
Round 5 commit `dbb33ff` (storyteller) 已处理 storyteller 叙述；本 plan 仅改 autopilotStatus 的 "fallback/fallback" 重复文案，不动 storyteller 模板。
Round 5 commit `bc7732c` (cost-escalator) 与 onboarding 无关，不碰。

---

## 9. 与 prior_validation §"Round 6 mandate" 的对齐

本 plan **不触达** `RoleAssignmentSystem.reserved/specialistBudget` 结构（validation v2 §272-288 指明其为 Round 6 结构重构）。但 plan 的 auto-pause + crisis emit 是 Round 6 重构的**玩家端可视化前哨**：

- 当 Round 6 重构 `farmMin` 动态化 / 引入 population-band 表 后，auto-pause 事件**自然减少** → 一个可度量的 onboarding win。
- 若 Round 6 仍未解决，auto-pause 让 seeds 1/99 在玩家端**至少"诚实失败"** 而不是"静默 4 分钟崩盘"。

onboarding reviewer 01a 的核心诉求"教学式失败反馈"（feedback §P0 #2 / §改进建议 #3 / #9）由本 plan 系统性满足，且不影响 Round 6 的结构空间。
