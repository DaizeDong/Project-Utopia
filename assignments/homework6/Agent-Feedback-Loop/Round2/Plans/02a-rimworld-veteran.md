---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round2/Feedbacks/02a-rimworld-veteran.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~160
  new_tests: 2
  wall_clock: 55
conflicts_with:
  - 01e-innovation   # also touches P0-7 (template differentiation); this plan only fixes the Start-button bug, not terrain profiles
  - 02c-speedrunner  # also touches P1-10 (4x sync); this plan fixes the HUDController path, coordinate with theirs
---

## 1. 核心问题

老兵三局试玩得出 "系统不可信" 的定性，本质是 **三个独立但同构的 trust-break bugs**：

1. **Entity Focus 点击不进 (P0-1)**。Round 1 已落地 16 px 屏幕空间 proximity fallback + 24 px build-guard，但现场仍零命中。根因在 *工具模态*：Farm / Road 等建造工具激活时 `#onPointerDown` 先执行 build flow，只有在 fallback 命中工人且 24 px 内才中断。一旦玩家切到 `erase`/Farm 工具，`select` / `inspect` 两个"中性模式"根本不存在，ESC 清选择后重新点击又走回建造分支——命中窗口实际被工具栏消耗掉了。

2. **Template 选择器不生效 (P0-7)**。`GameStateOverlay.js:56-61` 把 `MAP_TEMPLATES` 注入下拉框，但 "Start Colony" 按钮 (`overlayStartBtn`, index.html:1063) 的 handler 是 `GameApp.startSession()` (GameApp.js:1413-1418)——它**只切换 phase 为 active，不做 `regenerateWorld`**。Template 只有在玩家先点 "New Map" 后才生效。三次换下拉的老兵始终拿到默认 `temperate_plains`，确为 UI contract 级 bug。

3. **4× 实测 ≈ 2.7× (P1-10)**。`HUDController.setupSpeedControls` (line 214-222) 直接写 `state.controls.timeScale = 4.0`，但 `GameApp.setTimeScale` (line 697-703) 的 clamp 是 `[0.25, 2.0]`，公共 API 和直接写入不一致；即便直接写入生效，`simStepper.js:17` 的 clamp 是 `[0.1, 4]`，而 `maxSimulationStepsPerFrame = 5` (GameApp.js:209) 在 60fps 下允许 `4×`，但一旦帧率掉到 30fps（entityCount ≥ 700 时 UI refresh 被压到 1/3）每帧需要 `(1/30 × 4) / (1/30) = 4` 步刚好触顶，再加上 `accumulatorSec` 被 `min(0.5, …)` 截断，spill 直接丢失——这就是实测 2.7× 的来源。

## 2. Suggestions（可行方向）

### 方向 A: 双 bug + 倍速 clamp 三点合并修 (narrow scope)
- 思路：只解决 3 个明确 bug：加 `select` 中性工具 + Start 按钮在启动前调用 `regenerateWorld` + 修 `setTimeScale` clamp / `maxSimulationStepsPerFrame` 上限。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`, `src/app/GameApp.js`, `src/ui/hud/HUDController.js`, `src/ui/tools/BuildToolbar.js`（加 Select 按钮）
- scope：小
- 预期收益：三项 P0/P1 血槽条当场止血；老兵"系统不可信"定性可升一档。
- 主要风险：`regenerateWorld` 在 `startSession` 里同步执行会重置 `services.rng`，若 Round1 已有测试快照依赖 "Start 后种子不变"会破；`maxSimulationStepsPerFrame` 提到 8 触发 Phase 10 长期 determinism 回归。

### 方向 B: 统一"工具模态"重构 + 方案 A
- 思路：把现有 build tools 拆成 `select` / `build:<kind>` / `erase` 三类，canvas 点击路由根据 modality 派发，顺便修好 P0-1、P2-1（1-12 热键）、P0-4 局部（切到 `select` 即 autopilot 不被玩家点击打断）。
- 涉及文件：同上 + `src/ui/interaction/*`（可能新增 `ToolModality.js`）+ `src/config/constants.js` + 所有 `state.controls.tool` 读点 (~14 处 grep 命中)。
- scope：大
- 预期收益：根治模态混乱，后续 enhancer 01a/02c 计划的热键、autopilot 中性模式都能复用。
- 主要风险：HW06 freeze 边界——引入 "ToolModality" 看起来像新 mechanic；修改面广，很容易破坏 `test/ui-layout.test.js`、`test/entity-pick-hitbox.test.js`；与 01c / 02c enhancer plan 会大面积冲突。

### 方向 C: 仅修 Start 按钮 + 倍速 clamp，P0-1 靠 "hover 高亮 + double-click" 替代 select 模式
- 思路：保留现有 build-tool 主导的点击，给工人加 hover ring + double-click 强制 override（即使建造工具激活）。
- 涉及文件：`src/render/SceneRenderer.js`, `src/ui/hud/GameStateOverlay.js`, `src/app/GameApp.js`, `src/ui/hud/HUDController.js`
- scope：小～中
- 预期收益：不引入新工具 slot，迭代风险最低。
- 主要风险：double-click 与 build 冲突（玩家双击 = 放两个建筑），需要 debounce；hover ring 在 InstancedMesh 上实现要 shader 改动，测试成本高。

## 3. 选定方案

选 **方向 A**。理由：

- P0 问题优先选小 scope / 快速落地（enhancer.md §6）。
- 方向 B 越过 HW06 freeze 边界（工具模态重构等于引入新交互系统），被 orchestrator 拒收概率高。
- 方向 C 的 double-click 在 build tool 激活下语义冲突严重，hover-ring 涉及 shader/instanced mesh 改动风险不可控。
- 方向 A 三个独立修改点互不耦合，可以拆 PR，单个回归可独立发现；且每个修改都有明确的单测目标（新增 2 个测试文件覆盖 Start-button template propagation + timeScale 4× actual-rate），benchmark 回归面窄。

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/tools/BuildToolbar.js:constructor` — add — 在建造工具栏最前面插入一个 "Select / Inspect (Esc)" 按钮（value `select`），设 `state.controls.tool = "select"` 作为默认工具，并在点击时清除 `controls.buildPreview`。按钮 tooltip `Neutral mode — click a worker / tile without building`。
  - 目的：给 P0-1 一个真正的中性模式；`#onPointerDown` 的现有代码 (SceneRenderer.js:2077) 已经对 `"select" / "inspect"` 短路，只要工具值合法就能直接走 entity-pick 主路径而不是 build flow。

- [ ] **Step 2**: `src/ui/tools/BuildToolbar.js:syncToolbarHighlight` — edit — 把 "select" 按钮加入 `data-tool` 映射，并在 `state.controls.tool === "select"` 时给该按钮 `.active` 样式（复用既有 CSS）。
  - depends_on: Step 1

- [ ] **Step 3**: `src/app/GameApp.js:startSession` (line 1413-1418) — edit — 在进入 `"active"` phase 之前，**如果 `state.controls.mapTemplateId` 存在且与 `state.world.mapTemplateId` 不一致**，调用 `this.regenerateWorld({ templateId, seed: state.world.mapSeed, terrainTuning: state.controls.terrainTuning }, { phase: "menu" })`；然后继续调用 `#setRunPhase("active", ...)`。
  - 注意：必须保留 seed（用当前 `mapSeed`），不能随机换；老兵抱怨 "切 template 还一样" 的核心是 template 没换、不是 seed 问题，random seed 会引入额外漂移并破坏 replay。
  - 目的：修 P0-7 UI contract bug。

- [ ] **Step 4**: `src/ui/hud/GameStateOverlay.js:constructor` (line 82) — edit — `overlayStartBtn` 的 click handler 改为：读取 `mapTemplateSelect.value` 和 size input，把 `state.controls.mapTemplateId = templateId` 先写入 state，**再**调用 `this.handlers.onStart?.()`。
  - depends_on: Step 3
  - 目的：和 Step 3 构成闭环——UI 把选中的 templateId 推到 state，startSession 侧读 state 决定是否重算世界。

- [ ] **Step 5**: `src/app/GameApp.js:setTimeScale` (line 697-703) — edit — 把 clamp 从 `Math.max(0.25, Math.min(2.0, ...))` 放宽到 `Math.max(0.25, Math.min(4.0, ...))`，与 `simStepper.js:17` 的 `[0.1, 4]` clamp + HUDController 直接写 4.0 的实际使用保持一致。
  - 目的：P1-10 公共 API 与内部 clamp 对齐。

- [ ] **Step 6**: `src/app/GameApp.js:209` — edit — `this.maxSimulationStepsPerFrame = 5` 改为 `6`。在 30 fps × 4× 下需要 4 steps/frame（原 5 步 cap 有 1 步 headroom，但 accumulator spill + scheduler 抖动会吞掉它），6 步给到 ~50% 安全裕度。**不要** 改到 8——Phase 10 long-horizon determinism 硬化对 `capSteps` 有上界敏感性（见 commit a8dd845）。
  - depends_on: Step 5

- [ ] **Step 7**: `test/start-button-applies-template.test.js` — add — 新测试：stub 一个 minimal state 含 `world.mapTemplateId = "temperate_plains"`, `controls.mapTemplateId = "rugged_highlands"`；构造 fake GameApp with `regenerateWorld` spy；调用 `startSession` 模拟；断言 spy 被以 `templateId: "rugged_highlands"` 调用一次。对 no-op 情形（两者相同）断言 spy 未被调用。

- [ ] **Step 8**: `test/time-scale-fast-forward.test.js` — add — 用 `computeSimulationStepPlan` 直接驱动：模拟 60 帧 @ 60fps × timeScale=4 × fixedStepSec=1/30，累加 `simDt`，断言最终 `simDt` ≥ 3.9s（允许 2.5% 抖动）。再模拟 30 帧 @ 30fps × timeScale=4，断言 `simDt` ≥ 1.95s。当前 cap=5 时低 fps 路径会退化到 ~2.7×，这个测试正是回归保护。

- [ ] **Step 9**: `CHANGELOG.md` — edit — 在 "Unreleased" 区块追加条目：
  - Bug Fixes: "Start Colony now applies the selected map template (was silently ignored unless New Map was clicked first)"
  - Bug Fixes: "4× fast-forward now reaches actual 4× under light frame load (previously capped at ~2.7× due to stepPlan cap mismatch)"
  - New Features: "Added neutral Select tool so clicking a worker opens Entity Focus without a build tool active"
  - Files Changed: list

## 5. Risks

- **Step 3 副作用**：首次 Start 时如果 `state.controls.mapTemplateId` 未初始化（Round1 默认应已写入），会读到 `undefined`→short-circuit 不 regenerate，安全。需要加防御 guard。
- **Step 6 副作用**：`maxSteps` 从 5 → 6 会让 `scripts/long-horizon-bench.mjs` 在重负载下多跑 20% 步数，CPU 预算 (`cpuBudgetMs`) 小幅上涨；但因为 `safeFrameDt` clamp 仍是 0.1s，`accumulatorSec` clamp 仍是 0.5s，**确定性 invariant 不变**（每 step 量子化消费 accumulator）。
- **Step 1 副作用**：默认工具改为 `select` 意味着老用户第一次点 canvas 不再直接放 Farm。这属于预期行为——老兵明确抱怨 "没有一个 select / deselect tool 的中性模式"；但 Round1 已有测试 `test/ui-layout.test.js` 可能假设了默认工具名，需核对。
- **Step 4 副作用**：`overlayStartBtn` 现在会 mutate `state.controls.mapTemplateId`，如果 handler 被绑定两次（dev HMR）可能触发 double-regenerate，需 idempotent guard。
- **与 01e-innovation plan 冲突**：对方也处理 P0-7。本 plan 只修 *Start-button 不调用 regenerateWorld* 这个纯 bug；01e 可能会改 terrain profile / 模板视觉差异。**合并顺序**：先合 02a（bug fix），再合 01e（视觉强化）。
- **与 02c-speedrunner plan 冲突**：对方也处理 P1-10。本 plan 只改 clamp 和 maxSteps；02c 可能会加 1×/2×/3× 档位和 pause-on-event。**合并顺序**：先合 02a 的 clamp fix（基础），再让 02c 在其之上加档位。
- **可能影响的现有测试**：
  - `test/entity-pick-hitbox.test.js` — 不直接受影响（仍测 SceneRenderer 内部函数），但默认工具切 `select` 后 `#onPointerDown` 的 build-guard 分支覆盖率会降低，测试本身仍通过。
  - `test/ui-layout.test.js` — 若有对默认工具 = "farm" 的断言，需同步。
  - `test/build-toolbar.test.js`（如存在）— 新增 Select 按钮需要在 DOM snapshot 里对齐。
  - 长期 benchmark `scripts/long-horizon-bench.mjs`（seed 42）— maxSteps 6 后 DevIndex 可能±2 漂移，需复测确认不低于当前基线 −5%。

## 6. 验证方式

- **新增测试**：
  - `test/start-button-applies-template.test.js` 覆盖 *Start Colony 切换 template 后 regenerateWorld 被调用* 的契约（Step 7）。
  - `test/time-scale-fast-forward.test.js` 覆盖 *4× timeScale 在 60fps / 30fps 下都能真的逼近 4×* 的契约（Step 8）。
- **手动验证**（dev server）：
  1. `npx vite` 打开 `http://localhost:5173`。
  2. 在菜单选 "Rugged Highlands" → Start Colony → 观察地图 tile 分布是否切换（quarry 密集、fewer farms）；地图明显不同于 temperate_plains baseline。
  3. 回菜单选 "Archipelago Isles" → Start Colony → 观察大片水面 + 桥接地形。
  4. 开 4× 速度，打开 DeveloperPanel 观察 `simDt/frameDt` 比例，期望 ≥ 3.8（老兵实测 2.7 应消失）。
  5. 选 "Select" 工具（或 Esc 清工具）→ 点击 canvas 任意工人 → Entity Focus 面板立刻显示 Alice-12 详情（Hunger / Role / Policy Focus）。此前 build tool 激活时点击会被吞掉，现在 Select 模式下单击直通。
- **Benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed=42 --template=temperate_plains --days=365`（如 script 支持），DevIndex 应 ≥ 42（= 当前 44 − 5%）；deaths 应 ≤ 480（= 当前 454 + 5% 反向容错）。
- **测试跑通**：`node --test test/*.test.js` 全绿，867 测试数上涨到 869（+2 new，-0 regress）。

## 7. UNREPRODUCIBLE 标记

不适用——所有三个问题都在代码层面直接验证：
- P0-7 Start-button bug：`startSession()` (GameApp.js:1413-1418) 源码确认只调 `#setRunPhase`，不调 `regenerateWorld`。
- P1-10 clamp 不一致：`setTimeScale` clamp [0.25, 2.0] vs `simStepper` clamp [0.1, 4] vs `HUDController` 直接写 4.0 源码三方对比确认。
- P0-1 Entity Focus 无中性模式：源码确认没有 `controls.tool === "select"` 写入点（`Grep controls.tool = "select"` 无命中），但 `SceneRenderer.js:2077` 已为 select/inspect 短路预留分支——本 plan 正是补齐前端按钮。
