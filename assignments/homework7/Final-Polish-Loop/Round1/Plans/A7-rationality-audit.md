---
reviewer_id: A7-rationality-audit
reviewer_tier: A
feedback_source: Round1/Feedbacks/A7-rationality-audit.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 4
  loc_delta: ~95
  new_tests: 2
  wall_clock: 30
conflicts_with:
  - A5  # also touches Survived header (#4) and STABLE/runway badge (#2)
  - A6  # also touches status display / inspector entity rows
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

A7 列出 5 条新 P0，全是**末端呈现层 label/状态文字与底层数据脱钩**的合理性破洞。归并为 3 个根本问题：

1. **DOM 写死的字面颜色名 vs 实际 inline color 不一致** —— Logistics Legend 7 行里 2 行说 "yellow ring / purple ring" 但 inline `border-color` 是 `#71d9ff` / `#72b9ff`（青蓝/淡蓝）。属于 R0 之后没人重新比对的一处脏字符串。
2. **状态分类只看单一信号 (Threat) 而忽略复合信号 (Food runway)** —— Colony Health Card 的 STABLE/THRIVING/STRUGGLING/CRISIS 只读 `state.gameplay.threat`，所以即便 `food` 还有 41 秒就耗尽（runway < 60s）badge 仍然显示 STABLE。同一 Card 内文字与同一 Card 内的 runway 数据互相打脸。
3. **"通用"模板未按实体类型分流** —— 三处共病：
   - `buildFoodDiagnosis` 不看 entity.type，结果给 Bear-20（PREDATOR animal）抛 "Build or reconnect a warehouse"。
   - Worker list row 把 visitor (尤其 saboteur) 与 worker 同样渲染 `name · "<group> / <role>"`，role 缺省 `"-"`，玩家直到死亡 toast 才知道身份。
   - 顶部 `Survived 03:13` 字段名只说"Survived"，没区分"current run"还是"best"，与底部其它时间字段视觉无差异——A7 误把它当 best-run history。实际它就是 current run，但**双时钟 + 无 label** 让 reviewer 直接得出"时间在倒退"。

不在本 plan 范围（属同 P0 但被 A5 接走）：HUD `6:00` 那一侧时钟的语义说明（A5 owns "HUD clock #4"），STABLE 状态 badge 文字本身（A5 owns "STABLE #2"）。

> 与 A5 / A6 协调：本 plan 只改 (1) `buildFoodDiagnosis` 入口分流、(2) Logistics Legend 字面颜色名、(3) Worker-list row 的 visitor 身份显式化、(4) Top header `Survived` 前缀加 `Run`。**不改** Colony Health Card 的 status tier 函数（避免与 A5 STABLE plan 冲突），**不改** worker-list 的 `<group>/<role>` 一般结构（避免与 A6 status-display plan 冲突）。Implementer 检测到 conflict 时按 plan 字段 `conflicts_with` 顺序合并：本 plan 先落，A5/A6 后落。

## 2. Suggestions（可行方向）

### 方向 A: 表层字符串补丁 + 入口分流（最小改动）

- 思路：哪里 label 错就改哪里的字面字符串；`buildFoodDiagnosis` 加 entity.type 分支早返回；worker-list role 字段对 visitor 注入身份后缀。不动 status tier 评估、不动 HUD 时钟结构。
- 涉及文件：
  - `index.html`（Logistics Legend 2 行）
  - `src/ui/panels/EntityFocusPanel.js`（`buildFoodDiagnosis` + `#renderWorkerList` 行 ~598）
  - `src/ui/hud/HUDController.js`（顶部 `Survived` 前缀，行 ~1588）
- scope：小（4 file edits, ~95 LOC）
- 预期收益：5 条 P0 中 4 条直接清零（legend、bear inspector、survived 前缀、visitor 身份），第 5 条（STABLE vs 41s）让给 A5。
- 主要风险：
  - `entity-focus-player-view.test.js` 等测试文件可能 pin 了"Build or reconnect a warehouse"或"Critical hunger"等字面 —— 必须先用 Grep 确认覆盖面。
  - Logistics Legend 的颜色字面名可能在 i18n / docs 文件里被引用（CHANGELOG 等历史文件），但本 plan 只改 index.html 唯一 source。
- freeze 检查：OK（无新 tile/role/building/mechanic/audio/UI panel；纯 label/分流改动）。

### 方向 B: 引入"实体诊断 dispatcher"模块

- 思路：新建 `src/ui/panels/EntityDiagnosis.js`，暴露 `buildDiagnosis(entity, state)`，按 `entity.type` 分发到 `buildWorkerDiagnosis` / `buildPredatorDiagnosis` / `buildVisitorDiagnosis`。把 Logistics Legend 的颜色字面名也机器生成（从同一份 `LENS_LEGEND_ROWS` 常量驱动 DOM）。
- 涉及文件：
  - `src/ui/panels/EntityFocusPanel.js`（重构）
  - `src/ui/panels/EntityDiagnosis.js`（新增）
  - `src/config/lensLegend.js`（新增常量）
  - `index.html`（改为占位 + JS 注入）
- scope：中（5 files, ~280 LOC）
- 预期收益：根治分流问题 + 让 legend 不可能再字面/inline 错位（同源驱动）。
- 主要风险：deadline 35min 内做不完；与 A5 / A6 plan 冲突面更大；触发 A6 "Entity Focus 面板拆分" 提议。
- freeze 检查：OK 但 `src/config/lensLegend.js` 算"新模块"接近灰区。
- **不选定：scope 大于 P0 修复必需**。

### 方向 C: 完全不动代码，纯文档化"已知不一致"

- 思路：在 README / CHANGELOG 里加一节"Known label inconsistencies (v0.10.1+)"，把 5 条 P0 全部记下来。
- scope：极小
- 预期收益：实质为 0；A7 verdict=RED 不会因 docs 而翻绿。
- 主要风险：违背 R1 "P0 = 玩家会困惑到无法继续" 的处理标准。
- freeze 检查：OK（docs only）。
- **不选定：reviewer tier=A 的 P0 必须代码层修复。**

## 3. 选定方案

选 **方向 A（表层字符串补丁 + 入口分流）**。

理由：
- A7 的 5 条 P0 全部是 label-level / 模板分流问题，无需重构。
- 35min deadline 不允许 B 的中等 scope。
- C1 不在本轮，"保留外部行为不变" 不是硬约束，但 hard freeze 仍生效 → 方向 A 全部满足。
- 与 conflicts_with: A5/A6 协调最简单（只改它们不打算碰的那几行）。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:2593` — `edit` — 把 `<span>yellow ring = Depot not ready (depot)</span>` 改为 `<span>cyan ring = Depot not ready (depot)</span>`（与 inline `#71d9ff` 一致）。
- [ ] **Step 2**: `index.html:2594` — `edit` — 把 `<span>purple ring = Weather impact (weather)</span>` 改为 `<span>light-blue ring = Weather impact (weather)</span>`（与 inline `#72b9ff` 一致）。
  - depends_on: 无（与 Step 1 互不依赖，但同文件相邻行，建议同 PR 内一起改）。

- [ ] **Step 3**: `src/ui/panels/EntityFocusPanel.js:buildFoodDiagnosis` (函数起始 ~行 72) — `edit` — 在 `const debug = entity?.debug ?? {};` 之前插入早返回分流：
  - 若 `String(entity?.type ?? "").toUpperCase() === "ANIMAL"` 或 `entity?.kind === "PREDATOR"` 或 `entity?.kind === "HERBIVORE"`：返回 `{ severity: "ok", cause: "Wildlife (does not use colony food infrastructure).", next: "—", facts: \`type=${entity.type}, kind=${entity.kind ?? "—"}\`, reject: "" }`。
  - 若 `String(entity?.type ?? "").toUpperCase() === "VISITOR"`：返回类似 `{ severity: "ok", cause: \`Visitor (\${entity.kind ?? "—"}); not a colonist.\`, next: "—", facts: \`type=VISITOR, kind=${entity.kind ?? "—"}\`, reject: "" }`。
  - 这条分流彻底切断 Bear-20 / Ash-16 / 任何 non-WORKER 实体走"Build a warehouse"模板。
  - depends_on: 无。

- [ ] **Step 4**: `src/ui/panels/EntityFocusPanel.js:#renderWorkerList` (行 598 `const role = ...`) — `edit` — 把 role 拼接改为：
  ```js
  let roleSuffix = String(w.role ?? "-");
  if ((w.role === undefined || w.role === null || w.role === "" || w.role === "-")
      && String(w.type ?? "").toUpperCase() === "VISITOR") {
    const kind = String(w.kind ?? "VISITOR").toLowerCase();
    roleSuffix = `(${kind})`;  // → "(saboteur)" / "(trader)" / "(visitor)"
  } else if ((w.role === undefined || w.role === null || w.role === "" || w.role === "-")
      && String(w.type ?? "").toUpperCase() === "ANIMAL") {
    const kind = String(w.kind ?? "ANIMAL").toLowerCase();
    roleSuffix = `(${kind})`;  // → "(predator)" / "(herbivore)"
  }
  const role = `${entityFocusGroupMeta(row.groupId).shortLabel} / ${roleSuffix}`;
  ```
  这样 Ash-16 在 list 里就显示 `Hungry / (saboteur)` 而非 `Hungry / -`。Bear-20 显示 `Other / (predator)`。
  - depends_on: 无（与 Step 3 共改同文件但不同函数，可一次 read+edit）。

- [ ] **Step 5**: `src/ui/hud/HUDController.js:1588` — `edit` — 把 `this.statusObjectiveTime.textContent = \`Survived ${timeText}\`;` 改为 `this.statusObjectiveTime.textContent = \`Run ${timeText}\`;`（删 "Survived" 名词，把它改成与底部 timeVal 同维度的 "Run time"，避免 "Survived 03:13 vs 6:00" 看起来像两套时间）。同步在第 2241 行 placeholder `Survived --:--:--` → `Run --:--:--`。
  - 注意：需要同时检查 `index.html:2240-2241` 的 placeholder 字符串以及 `test/ui-voice-consistency.test.js` 是否 pin 了 "Survived" 字面，若有则必须同步改测试。
  - depends_on: 无。

- [ ] **Step 6**: `index.html:2241` — `edit` — placeholder `Survived --:--:--` → `Run --:--:--`（与 Step 5 字面同步）。同时 `index.html:2240` 的 `title="Survival time and running score (Phase 4 endless mode)"` 保留不变（hover tooltip 可继续讲 "Survival"，但可见 chip 用 "Run"）。
  - depends_on: Step 5。

- [ ] **Step 7**: `test/` — `add` — 新建 `test/ui/foodDiagnosis-non-worker.test.js`，覆盖：
  1. `entity = { type: "ANIMAL", kind: "PREDATOR", id: "bear-20" }` → `buildFoodDiagnosis(entity, {}).cause` 不包含 "warehouse" 字样。
  2. `entity = { type: "VISITOR", kind: "SABOTEUR", id: "ash-16" }` → 同上。
  3. `entity = { type: "WORKER", role: "FARM" }` 走原有 worker 模板（regression lock：仍能走到 "Stored food is 0..." 等老分支）。
  - depends_on: Step 3。

- [ ] **Step 8**: `test/ui/` — `add` — 新建 `test/ui/entityFocusList-visitor-role.test.js` 或扩展现有 entity-focus-player-view 测试：
  - 验证：visitor.kind=SABOTEUR 且 role=null 时，`#renderWorkerList` 输出的 row text 包含 `(saboteur)` 而非孤立的 `-`。
  - 验证：worker.role="FARM" 时不被改写（regression lock）。
  - depends_on: Step 4。

- [ ] **Step 9**: `CHANGELOG.md:<unreleased v0.10.1+>` — `edit` — 添加条目：
  ```
  ### Bug Fixes (v0.10.1-n: A7-rationality-audit R1)
  - Logistics Legend label/color mismatch: "yellow ring" → "cyan ring" and "purple ring" → "light-blue ring" (index.html:2593-2594), matching the inline `#71d9ff` / `#72b9ff` border-colors.
  - Predator/visitor inspector no longer shows the worker-only "Build or reconnect a warehouse" food-diagnosis template (`buildFoodDiagnosis` early-returns for ANIMAL / VISITOR types).
  - Worker list rows now render `(saboteur)` / `(trader)` / `(predator)` / `(herbivore)` when role is missing, so hostile/visitor identity is visible before the death toast.
  - Top status bar `Survived HH:MM:SS` → `Run HH:MM:SS` to disambiguate from other on-screen clocks (this chip is the current run, not a historical best).
  ```
  - depends_on: Steps 1-6。

## 5. Risks

- **R1 — `entity-focus-player-view.test.js` 可能 pin 了 "Build or reconnect a warehouse" 字面**：Step 7 必须先 Grep 全测试套确认；如有命中需要同步更新。预期需要 < 5min。
- **R2 — `test/ui-voice-consistency.test.js` 可能 pin 了 "Survived"**（前面 Grep 显示 `scenario headline` 测试在该文件里）：Step 5 改 chip 文本前必须验证。
- **R3 — `index.html:2240` 的 hover title 仍说 "Survival time"** 与 Step 5 把 chip 改成 "Run" 在用户视觉上是 OK 的（hover 解释更长，chip 简短），但 a11y 测试若读 title 会出现"chip text 与 title 不严格一致"。建议保留 title 不动，让 hover 仍解释这是"survival time / running score"。
- **R4 — visitor.kind 可能在某些 spawn 路径上没填**：Step 4 做了 `?? "VISITOR"` 兜底，但若有 saboteur 因 EntityFactory 分支走漏没设 kind，会显示 `(visitor)` 而非 `(saboteur)`。这是 regression-safe 的 fallback。
- **可能影响的现有测试**：
  - `test/entity-focus-player-view.test.js`
  - `test/ui-voice-consistency.test.js`
  - `test/ui/statBar.reset.test.js`（统计了 "Survived" 字面？需 Grep）
  - 任何 pin 了 "Build or reconnect a warehouse" 的 fixture/snapshot

## 6. 验证方式

- **新增测试**：
  - `test/ui/foodDiagnosis-non-worker.test.js`（Step 7）
  - `test/ui/entityFocusList-visitor-role.test.js`（Step 8）
- **手动验证**（dev server `npx vite`）：
  1. 打开 `http://localhost:5173`，启动 colony，按 `H` 打开 Logistics Legend → 第 4 行显示 "cyan ring = Depot not ready"，第 5 行显示 "light-blue ring = Weather impact"；颜色与文字自洽。
  2. 等到一只 bear 出现（或 console 召唤），左键点击 → Inspector "Food Diagnosis" 行 cause 里**不**出现 "warehouse" 字样，应是 "Wildlife (does not use colony food infrastructure)."。
  3. 等到 saboteur visitor 出现 → worker list row 显示 `<name> · Hungry / (saboteur) · <state> · <hunger>` 而非 `Hungry / -`。
  4. 顶部状态条左侧显示 `Run 00:03:13 ...` 而非 `Survived 00:03:13 ...`。
- **回归测试**：`node --test test/*.test.js` 全绿（baseline 1646 pass / 0 fail / 2 skip 必须保留）。
- **FPS 回归**：纯 string/template 修改，无运行时开销 → `browser_evaluate` 5 秒平均 ≥ 50fps。
- **prod build**：`npx vite build` 无错；`vite preview` 3 分钟 smoke 无 console error。

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记

不适用。所有 5 条 P0 都已通过源码定位证实：
- Legend 错位：`index.html:2593-2594` inline color vs label 字面直接对照。
- STABLE / 41s：`HUDController.js:2017-2031` 仅读 `state.gameplay.threat`，runway 在 `#renderRunoutHints` 行 1969 独立计算，两者无交叉 → 直接矛盾必现。**本 plan 不修，由 A5 接管。**
- Bear inspector："warehouse" 文案在 `EntityFocusPanel.js:130` 唯一字面，函数入口无 entity.type 分支 → 必现。
- Survived 双时钟：`HUDController.js:1588` chip 字面是 "Survived"，与底部 `timeVal` (`HUDController.js:1429`，`${timeSec.toFixed(1)}s`) 视觉无 label 关联。
- Visitor 身份隐藏：`EntityFocusPanel.js:598` role 拼接缺省 `"-"`，无 visitor.kind 注入 → 必现。

无需 Playwright runtime 复现。
