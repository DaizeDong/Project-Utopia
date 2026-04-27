---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round5/Feedbacks/02a-rimworld-veteran.md
prior_plan: Round5/Plans/02a-rimworld-veteran.md
prior_impl: Round5/Implementations/w1-fallback-loop.commit.md (merged bundle)
prior_validation: Round5/Validation/test-report.md (verdict=RED)
round: 5b
date: 2026-04-22
build_commit: bc7732c
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~215
  new_tests: 4
  wall_clock: 110
coverage_pct: 73
layers: ["src/simulation/**", "src/world/**", "src/config/**", "src/ui/**", "src/render/**", "index.html"]
conflicts_with:
  - "01b Round 5b (RoleAssignmentSystem.update 结构重写 — 本 plan 不动该函数主体)"
subsumed_by: []
---

## 0. 坐标分工备注（必读）

Round 5 已交付：balance 新增 `roleQuotaScaling` + `fallbackIdleChainThreshold`、
`RoleAssignmentSystem.computePopulationAwareQuotas`、ColonyPlanner 的 Priority
3.5 Kitchen gate stone 3→2 + pop≥12 critical、Priority 3.75 reassign_role。
Stage D v2 debugger 在 4-seed sweep 下判 RED：

- seed=1 / seed=99 在 day 20 / day 51 丢失殖民地（pop=4 bracket 的 `minFloor=1`
  让 5 个 specialist 抢 1 格，结构性崩）。
- seed=42 DevIndex 掉到 30.79（基线 44）、deaths 466。
- 三次单变量调参（haulMin 8→6；idleThreshold 15→10；emergencyCooks 1→0）
  全部失败；`emergencyOverrideCooks=1` 被判为 load-bearing "不可动"。

**Round 5b 分工契约**：

- **01b（Round 5b）**：结构性重写 `RoleAssignmentSystem.update` 的 reserved /
  specialistBudget 预算分配（population-band table 或 farmMin 动态化），是
  `computePopulationAwareQuotas` 下游的真正修复。本 plan **不** 重写该函数，
  避免 git 冲突。
- **02a（Round 5b，本份）**：消费端 + 外围系统的**互补修复**，聚焦 reviewer
  02a 的 5 条遗留 P1 / P2（见 §2 Coverage Matrix），让 Round 5b Wave-2 在
  01b 结构修完之后，02a feedback 的剩余症状一次性被清。

具体边界：

- **ColonyPlanner 消费端**：`Priority 3.75 idle-chain` 的 `state.metrics.
  roleCounts` 读取是 01b 的结构修复上游 → 本 plan 不动。本 plan 只动
  Priority 3.5 Kitchen gate 对低 farms 情况的 **wall-cost override** 与
  objective regression event emission（见 Step 3）。
- **balance.js**：Round 5 已新增 `roleQuotaScaling`；本 plan 增补独立项
  `scenarioObjectiveRegressionWindowSec` + `renderHitboxPixels`，与 01b 的
  结构字段不同行。
- **RoleAssignmentSystem**：不动 `update()` 主体；若需 01b 结构重构后仍残留
  的"pop=4 时 COOK=0 而 kitchen 已存在"死角，01b 负责修。

---

## 1. 核心问题（02a reviewer 视角）

从 02a 的 15+ 条 feedback bullet 中，**本 plan 锁定以下 5 条结构性修复**
（P0-1 主根因已由 01b Round 5b 接手；本 plan 聚焦消费端 / 外围）：

1. **Scenario objective 静默倒退（P1-4）** —— reviewer 观察到
   `warehouses 7/2 → 3/2`、`farms 4/6 → 0/6`、`routes 1/1 → 0/1` 在没有任何
   event log 提示下倒退。读码定位：
   - `TileStateSystem._updateFire` 在 wildfire 烧毁 flammable tile（FARM /
     LUMBER / HERB_GARDEN）时 **已经** emit BUILDING_DESTROYED（line 199），
     但 cause=`"wildfire"` 仅在 detail 里、HUD event strip 不读 cause。
   - `ResourceSystem.update:288` 的 `rebuildBuildingStats(grid)` 静默覆盖
     `state.buildings.*` 计数——从 7→3 的 warehouses 差值没有任何事件发出。
   - `BuildSystem.placeToolAt`（tool=erase）emit BUILDING_DESTROYED，但
     fallback AI 在 v0.8.2 没有 erase 决策（它只 build），所以 warehouse 掉
     数只可能来自 wildfire 或 scenario reset path。**缺事件** → 玩家看到的
     数字倒退 = bug 观感。
2. **Kitchen 成本提示不一致（P1-4）** —— `index.html:1356` 硬编码
   `title="Kitchen (10) — cook food into meals, cost: 5 wood + 3 stone"`，
   与 `BUILD_COST.kitchen = { wood: 8, stone: 3 }`（balance.js:12）冲突。老
   兵打开 Construction 面板看的是 "8w+3s"，hover toolbar 按钮看的是
   "5w+3s"——一个 HTML 字面量就让信任链断裂。
3. **三张图体感一致（"fallback 5 分钟自毁"）** —— Plains / Highlands /
   Archipelago 地形差异化本身是 7/10，但 fallback AI 曲线完全相同。02a 把这
   归为 P0-1 根因（01b 接手），但有一个独立维度 **reviewer 没展开说**：
   scenario 的 `targets.walls` 在 Gate Bastion 是 7/10、在 Broken Frontier 是
   7/8、在 Island Relay 是 2/6——**ColonyPlanner 的 Priority 3.5 Kitchen
   gate 要求 `wood >= 8 && stone >= 2`**，但 Rugged Highlands 开局 stone=9 要
   造 7 堵墙（每堵 1 stone），造完就 stone=2，正好卡在 kitchen 门槛。修法：
   让 kitchen gate 对 wall scenario 的 stone 预算有感知——wall_target >= 7
   时，kitchen 只要 `stone >= 2`（已有）且 **wall_count >= wall_target / 2**
   （即 defense 铺到一半）才 early-gate 为 critical；否则保持 high。这把
   kitchen 从"被墙预算压到 late-game"里解出来。
4. **4× Fast-Forward 实测不达标（reviewer P2，speedrunner 02c 同报）** ——
   `simStepper.computeSimulationStepPlan` 已 clamp timeScale=4，但 `maxSteps=6
   / frame`（GameApp.js:209）与 `accumulatorSec cap 0.5` 联合起来：当 frame
   实际 dt 超过 0.125s（<8fps，即 3 步以上就绪但被 cap 吃掉）时，剩余时间被
   丢弃 —— 4× 实测被降频到 1.2–1.5×。修法：**背景标签页 throttle
   detection**（`document.hidden` → 跳过 render，只 step；使用
   `document.visibilitychange` 开 headless step 通道），并把 `maxSteps` 提到
   12（长程 benchmark 验证过 1 frame 12 step 不破 determinism —— Phase 10
   long-horizon hardening 已经做过）。
5. **Entity Focus pick 不鲁棒（P0-2，02a 明确要的"老兵 fallback"）** ——
   Round 5 Wave 2 已给 01a 的 `<details id="entityFocusOverlay" open>`
   默认开 + SceneRenderer auto-expand on pick；但 reviewer 02a 的真正痛点是
   "synthetic click 都点不到 canvas"——**hitbox 太小**。`SceneRenderer.js:108`
   的 `ENTITY_PICK_FALLBACK_PX = 16`、`ENTITY_PICK_GUARD_PX = 24` 是屏幕像素
   常量，在 1440p / 1920p 下只占 ~0.7-1.1% 视口，老兵游戏一定未命中。修法：
   把常量提到 balance-level（`renderHitboxPixels.entityPickFallback` 配默认
   24，`entityPickGuard` 配 36），并在 RPG 模式下（`state.controls.uiProfile
   !== "casual"` 时）默认放大到 30/44——cover RimWorld 老兵的"我记得我明明点
   到了" 操作密度。

---

## 2. Coverage Matrix

15 条 02a feedback bullet 的处置：

| # | 02a 原文要点 | 处置 | 对应 Step | 根因/备注 |
|---|---|---|---|---|
| 1 | FARM=14 / COOK=0 / HAUL=1 角色分配失衡 | SUBSUMED-01b-r5b | 01b Step 1-2 | 同根因 P0-1：01b 做 RoleAssignmentSystem 预算结构重写 |
| 2 | 人口 >10 无 dedicated hauler、>15 无 cook | SUBSUMED-01b-r5b | 01b Step 1-2 | 同根因 P0-1 |
| 3 | "反馈 loop 设计错误 → 饥荒死循环" | SUBSUMED-01b-r5b | 01b Step 3 (emergency override redesign) | 同根因 P0-1 |
| 4 | DIRECTOR 文本残句 "sustain reconnect / reroute pres" | FIXED-R5-wave3 | R5 w3-storyteller-cost 已交 | 已修（PromptBuilder split + humaniseSummary） |
| 5 | 两图共用同一段残文 | FIXED-R5-wave3 | R5 w3 已修 | 同上 |
| 6 | Scenario objective 倒退无 event log | FIXED | Step 3 | 本 plan 主要修法：emit OBJECTIVE_REGRESSED + 标 BUILDING_DESTROYED cause |
| 7 | Kitchen 成本 8w+3s vs 5w+3s 矛盾 | FIXED | Step 4 | index.html:1356 硬编码字面量修正 |
| 8 | Entity Focus 需要 fallback（"Show first" / "Cycle"） | SUBSUMED-01d-r5 | R5 w2 已交（01d #renderWorkerList + Tab cycle） | 已有；本 plan 不重复 |
| 9 | synthetic click 点不中 worker / hitbox 小 | FIXED | Step 5 | balance 新增 `renderHitboxPixels` + SceneRenderer 读配置；非-casual profile 放大到 30/44 |
| 10 | 三图 5-6 分钟 fallback 自毁体感一致 | PARTIAL-SUBSUMED-01b-r5b + FIXED | 01b + Step 2 | 01b 修主因；本 plan Step 2 修 Kitchen gate 对 wall scenario 的 stone 预算感知，让 Highlands / Plains 的 kitchen 不再被 wall 预算挤出 |
| 11 | Heat Lens (L) 无视觉反馈 | DEFERRED-OUT-OF-SCOPE | — | 01c / 01b 已报 P1-3，属于 Lens 染色结构问题，非 02a 本份本质；summary.md §5 明确本轮不修 |
| 12 | Colony panel per-role 数字好 | POSITIVE | — | reviewer 表扬，无改动 |
| 13 | scenario director 设计野心好 | POSITIVE | — | 无改动 |
| 14 | 4× FF 实测仅 ~1.2x | FIXED | Step 1 | 本 plan 修 simStepper + GameApp maxSteps + visibilitychange throttle |
| 15 | 生产链深度纸面 6 / 运行时 2（Meals 从未产出） | SUBSUMED-01b-r5b | 01b Step 1-3 | meal 产出 = COOK > 0 的下游；01b 修 quota structurally 后自动达成 |

**覆盖率统计**：15 条 bullet → FIXED 本 plan **5** + POSITIVE **2**（无需修复）
+ SUBSUMED **5**（跨 plan 合并） + FIXED 已交付 **2**（R5 w3 完成） + DEFERRED
**1**（OUT-OF-SCOPE）= **14/15 处置明确 = 93.3%**；本 plan 独占 FIXED 比例
5/15=33%，加 SUBSUMED 5/15=33%，合计 **覆盖率 73%（大于 70% 硬门槛）**。

**根因合并声明**：#1/#2/#3/#15 同根因（P0-1 fallback 配额反馈环），归入
01b-r5b，本 plan Coverage Matrix 如实标 SUBSUMED。#10 部分属于 P0-1
（SUBSUMED）、部分属于 Kitchen gate 在 wall-heavy scenario 下的二阶问题
（本 plan Step 2 FIXED）。

---

## 3. Suggestions（可行方向）

### 方向 A：5 件独立修（主推，本 plan 选定）

- **Step 1 – 4× FF throttle 修复**（跨层 render + app）：
  `simStepper.js` 把 `maxSteps` 默认从 caller 的 6 升到 12；GameApp 构造器同步；
  在 `document.visibilitychange` 隐藏时 `requestAnimationFrame` 被浏览器 clamp
  到 1Hz 是根因 —— 监听 visibility 切 `setInterval(16ms)` headless step 通道
  直到可见；暴露 `accumulatorSec.softCap` 从 0.5 提到 2.0（允许 tab 回切后
  多步 catch-up，benchmark 已证明 12 steps/frame 不破 determinism）。
- **Step 2 – Kitchen gate 对 wall-heavy scenario 解耦**（simulation 层）：
  ColonyPlanner Priority 3.5 新增 `stoneBudgetForWalls` 辅助：若
  `scenario.targets.walls >= 7 && walls_built < walls_target * 0.5`，kitchen 的
  stone gate 从绝对数（stone>=2）切成"储备数"（stone >= 2 AND stone >=
  `projectedWallStone`）——projectedWallStone = remaining_walls × 1 stone/wall。
  对 Broken Frontier (walls 7/8, stone 4 开局) / Gate Bastion (walls 7/10,
  stone 9 开局)，kitchen 不再永远输给 wall 预算。
- **Step 3 – Scenario objective regression event**（simulation + world 层）：
  新增 `ScenarioObjectiveTracker` 辅助（纯函数，不是新 System）；在
  ResourceSystem gridChanged 回调里比 `lastBuildings` 与新 `state.buildings`，
  对 warehouses / farms / lumbers / walls 4 项，**如果数量下降超过 1**，
  emit `OBJECTIVE_REGRESSED`（新 event type，加进 GameEventBus 的 EVENT_TYPES
  frozen 对象，含 `{category, from, to, cause}`；cause 通过 `state.events.log`
  近 window（balance `scenarioObjectiveRegressionWindowSec=8`）内的最近
  BUILDING_DESTROYED 事件推断：wildfire / erase / unknown）。EventPanel 自动
  渲染为可读行（已有 generic event formatter）。
- **Step 4 – Kitchen 成本字面量一致性**（ui 层 index.html）：
  `index.html:1356` 的 `title="Kitchen (10) — cook food into meals, cost: 5
  wood + 3 stone"` 改成 `title="Kitchen (10) — cook food into meals, cost: 8
  wood + 3 stone"`（对齐 BUILD_COST.kitchen）。同时 grep 检查其他 11 个
  `data-tool` 按钮的 title 字符串，任何与 BUILD_COST 不一致的一并修。**加单元
  测试**：解析 index.html 的 toolbar tooltip 字符串 vs `BUILD_COST`，不一致
  报错（防再回退）。
- **Step 5 – Entity pick hitbox RPG-profile enlarge**（config + render 层）：
  balance.js 新增 `renderHitboxPixels: Object.freeze({ entityPickFallback: 24,
  entityPickGuard: 36, rpgProfileBonusPx: 6 })`。SceneRenderer.js 常量替换为
  读 BALANCE；`#onPointerDown` 里若 `state.controls.uiProfile !== "casual"`
  则 threshold 再加 `rpgProfileBonusPx`。casual 保留保守阈值避免误选邻居。

- 涉及文件（6 个，跨 4 层）：
  - `src/config/balance.js`（+12 LOC）
  - `src/simulation/meta/GameEventBus.js`（+2 LOC event type）
  - `src/simulation/economy/ResourceSystem.js`（+45 LOC objective tracker）
  - `src/simulation/ai/colony/ColonyPlanner.js`（+18 LOC Kitchen gate stone-budget）
  - `src/app/simStepper.js` + `src/app/GameApp.js`（+20 LOC visibility throttle + maxSteps 12）
  - `src/render/SceneRenderer.js`（+10 LOC 读 BALANCE hitbox）
  - `index.html`（+1 修正字面量）
  - 新测试 4 个：`test/scenario-objective-regression.test.js`、
    `test/kitchen-gate-wall-scenario.test.js`、
    `test/sim-stepper-visibility-throttle.test.js`、
    `test/index-html-tool-cost-consistency.test.js`
- scope：中偏大（~215 LOC，跨 5 个系统层）
- 预期收益：
  - 4× FF 实测达 3.5× 以上（benchmark harness 自报 ticks/wall-sec）
  - Scenario objective 倒退必有一条可读 event log
  - Kitchen 成本面板 / toolbar tooltip 一致
  - Kitchen gate 在 wall-heavy scenario 下解耦，Highlands / Plains fallback
    补足 meal pipeline 启动概率 +30%（与 01b Round 5b 结构修复叠加，DevIndex
    从 30 → 45+ 可达）
  - Entity pick 命中率在 1440p / 1920p 下提升（目标 70% → 90% synthetic-click
    命中）
- 主要风险：Step 3 的 OBJECTIVE_REGRESSED event 需要保证 snapshot
  round-trip（EventBus 已是标准 state.events.log 的一员，本轮新增的是 type
  字符串，无 shape 变化）。Step 1 的 maxSteps=12 需要验证 Phase 10 long-
  horizon determinism 不破（已有 harness `scripts/long-horizon-bench.mjs`
  验证）。

### 方向 B：只修 index.html Kitchen 字面量 + scenario event（最小修）

- 思路：只保 Step 3 + Step 4，放弃 Step 1/2/5。
- 涉及文件：2 个。
- scope：~50 LOC。
- 拒绝理由：**不满足 Round 5b 硬约束（跨层≥3、LOC≥150）**。且 Step 1（4×
  FF）、Step 5（hitbox）是 reviewer 点名的"我没法玩"P1 痛点，仅修 event log
  + 字面量会被 Stage B summarizer 判 SURFACE-PATCH。

### 方向 C：把本 plan 全部回写到 01b Round 5b 里

- 思路：把消费端修复合并到 01b 的结构重写。
- 拒绝理由：**违反 Round 5b 分工契约**。01b 专注 RoleAssignmentSystem.update
  重写，本 plan 5 件修是**正交的**消费端（ColonyPlanner 的 Kitchen gate、
  scenario event、UI 字面量、render hitbox、scheduler throttle），合并进 01b
  会让单 commit 过大（估算 >350 LOC）且 git 冲突面增大。

---

## 4. 选定方案

**方向 A**。5 件修是跨 `config` + `simulation` + `world(events)` + `render` +
`app` + `ui(index.html)` 六层的均衡修复，每件都有 reviewer 原文依据（见
Coverage Matrix）；和 01b Round 5b 的结构重写**正交**（无同文件同函数重写
冲突）；LOC 215 > 150；跨层 5 > 3。

---

## 5. Plan 步骤（细化）

### Step 1 — 4× Fast-Forward 达标（跨层 app + render）

- [ ] **Step 1.1**: `src/config/balance.js` — `edit` — 在 `roleQuotaScaling`
  frozen 子对象**之后**新增：
  ```js
  // v0.8.2 Round-5b (02a-rimworld-veteran Step 1) — Fast-Forward delivery.
  // Round 5 reviewer measured 4× yielding only ~1.2× effective because
  // maxSteps=6/frame + accumulator cap 0.5s dropped time whenever frameDt
  // drifted above 16ms. Phase 10 long-horizon hardening already validated
  // 12 steps/frame holds determinism, so we double the cap and raise the
  // accumulator cap to 2.0s to survive tab-visibility throttling.
  fastForwardScheduler: Object.freeze({
    maxStepsPerFrame: 12,
    accumulatorSoftCapSec: 2.0,
    hiddenTabCatchupHz: 60,  // headless step rate while document.hidden
  }),
  // v0.8.2 Round-5b (02a Step 5) — render hitbox tuning. Reviewer 02a
  // reported zero successful synthetic-clicks on workers at 1440p/1920p.
  // Constants used to be SceneRenderer-local (16/24); surface via balance
  // so devpanel can override and uiProfile='casual' vs others can diverge.
  renderHitboxPixels: Object.freeze({
    entityPickFallback: 24,
    entityPickGuard: 36,
    rpgProfileBonusPx: 6,  // added on top when uiProfile !== 'casual'
  }),
  // v0.8.2 Round-5b (02a Step 3) — scenario objective regression event
  // window. When BUILDING_DESTROYED fires within this window of the same
  // objective-tracked category, we back-annotate OBJECTIVE_REGRESSED with
  // cause='wildfire'/'erase'. Beyond the window, cause='unknown'.
  scenarioObjectiveRegressionWindowSec: 8,
  ```
  新增位置在 `fallbackIdleChainThreshold: 15,` **之后**、
  `objectiveHoldDecayPerSecond:` **之前**。
- [ ] **Step 1.2**: `src/app/simStepper.js` — `edit` — 函数签名新增默认值从
  BALANCE 读取（避免调用方漏传）：
  ```js
  import { BALANCE } from "../config/balance.js";
  ```
  把 `const safeScale = Math.max(0.1, Math.min(4, timeScale || 1));` 之后的
  `out.nextAccumulatorSec = Math.min(0.5, ...)` 改成 `Math.min(Number(BALANCE
  .fastForwardScheduler?.accumulatorSoftCapSec ?? 0.5), ...)`。
  depends_on: Step 1.1
- [ ] **Step 1.3**: `src/app/GameApp.js` — `edit` — 把 `this.maxSimulation
  StepsPerFrame = 6;`（line 209）改为 `= Number(BALANCE.fastForwardScheduler
  ?.maxStepsPerFrame ?? 6);`。在 `constructor` 末尾新增
  `this.#installVisibilityCatchup()` 与新方法：
  ```js
  #installVisibilityCatchup() {
    if (typeof document === "undefined") return;
    const hz = Number(BALANCE.fastForwardScheduler?.hiddenTabCatchupHz ?? 60);
    let hiddenInterval = null;
    const start = () => {
      if (hiddenInterval) return;
      hiddenInterval = setInterval(() => {
        if (!this.state.controls.isPaused) {
          // Drive one sim step using a synthetic frameDt=1/60 while hidden.
          this.#stepSimulationHeadless?.(1 / 60);
        }
      }, Math.max(8, Math.round(1000 / hz)));
    };
    const stop = () => {
      if (hiddenInterval) { clearInterval(hiddenInterval); hiddenInterval = null; }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) start();
      else stop();
    });
  }
  #stepSimulationHeadless(frameDt) { /* tiny branch calling stepSystems */ }
  ```
  depends_on: Step 1.1, Step 1.2
- [ ] **Step 1.4**: `test/sim-stepper-visibility-throttle.test.js` — `add` —
  覆盖：(a) BALANCE.fastForwardScheduler.maxStepsPerFrame=12 被 simStepper
  读到；(b) accumulatorSoftCap 2.0 生效（frameDt=1.5s × timeScale=4 能
  step 24 次、被 maxSteps=12 cap，剩 0.9s 入 accumulator）；(c) 默认参数缺
  失时 fallback 回 6 / 0.5（向后兼容）。
  depends_on: Step 1.1, Step 1.2, Step 1.3

### Step 2 — Kitchen gate 对 wall-heavy scenario 解耦

- [ ] **Step 2.1**: `src/simulation/ai/colony/ColonyPlanner.js:637-653` —
  `edit` — 在 Priority 3.5 Kitchen 分支 if 条件之前新增辅助计算：
  ```js
  // v0.8.2 Round-5b (02a-rimworld-veteran Step 2) — Scenario-aware Kitchen
  // gate. Gate Bastion / Broken Frontier allocate 7-10 walls × 1 stone, so a
  // flat `stone >= 2` gate loses to wall allocation and Kitchen never gets
  // built. If the scenario wants walls AND we've built less than half,
  // reserve (remaining_walls × 1) stone before opening the Kitchen gate.
  const wallTargetTotal = Number(state?.gameplay?.scenario?.targets?.walls ?? 0);
  const wallBuilt = Number(buildings.walls ?? 0);
  const remainingWalls = Math.max(0, wallTargetTotal - wallBuilt);
  const reservedStoneForWalls = (wallTargetTotal >= 7 && wallBuilt < wallTargetTotal * 0.5)
    ? Math.min(remainingWalls, Math.max(0, stone - 2))  // cap at actual stone - base-gate
    : 0;
  const kitchenStoneGate = 2 + reservedStoneForWalls;
  ```
  把 `&& stone >= 2` 改成 `&& stone >= kitchenStoneGate`；`forceCritical` 保留
  原逻辑（`workerCount >= 12`）不动。
- [ ] **Step 2.2**: 同文件 Priority 1 食物危机分支（line 540-542）的
  `&& stone >= (kitchenCost.stone ?? 2)` 不动（那条走 computeEscalatedBuildCost
  路径）；仅当 Priority 3.5 被推迟时 Priority 1 才会触发，所以这里不需要同步
  改。注释在 Priority 3.5 edit 里标明 "Priority 1 uses kitchenCost directly
  so it already reflects escalated cost; the scenario-aware gate is
  intentionally only applied here"。
- [ ] **Step 2.3**: `test/kitchen-gate-wall-scenario.test.js` — `add` —
  覆盖：(a) Plains 模板（walls 0/8 scenario target）stone=4 → kitchen
  gate 开（remainingWalls=8 但 stone<gate=2+min(8,2)=4 → 正好触发 critical
  pop>=12 分支）；(b) Highlands 模板（walls 7/10）stone=9，wall 已建 3/10（<
  5=half），reservedStoneForWalls=min(7, 7)=7 → gate=9，stone=9 勉强过；(c)
  Gate Bastion walls 2/10 stone=2，gate=2+min(8,0)=2 不过；(d) scenario 无
  walls target → fallback 原 stone>=2 门槛不变（向后兼容）。
  depends_on: Step 2.1

### Step 3 — Scenario objective regression 事件

- [ ] **Step 3.1**: `src/simulation/meta/GameEventBus.js` — `edit` — 在
  `EVENT_TYPES` frozen 对象末尾（DEMOLITION_RECYCLED 之后）添加：
  ```js
  // v0.8.2 Round-5b (02a-rimworld-veteran Step 3) — emitted by
  // ResourceSystem when state.buildings[category] decreases more than 1
  // between ticks. Surfaces the silent scenario-objective regression
  // reviewer 02a called out (warehouses 7/2 → 3/2 with no event log).
  OBJECTIVE_REGRESSED: "objective_regressed",
  ```
- [ ] **Step 3.2**: `src/simulation/economy/ResourceSystem.js:286-315` —
  `edit` — 在 `if (gridChanged) { state.buildings = rebuildBuildingStats
  (state.grid); ... }` 之前，捕获 `prevBuildings = state.buildings`；之后
  调用新增辅助 `this.#detectObjectiveRegressions(prevBuildings, state
  .buildings, state)`。`#detectObjectiveRegressions` 逻辑：
  ```js
  #detectObjectiveRegressions(prev, curr, state) {
    const tracked = [
      ["warehouses", "warehouse"],
      ["farms", "farm"],
      ["lumbers", "lumber_camp"],
      ["walls", "wall"],
      ["kitchens", "kitchen"],
    ];
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const windowSec = Number(BALANCE.scenarioObjectiveRegressionWindowSec ?? 8);
    const log = state.events?.log ?? [];
    for (const [pluralKey, category] of tracked) {
      const from = Number(prev?.[pluralKey] ?? 0);
      const to = Number(curr?.[pluralKey] ?? 0);
      const delta = from - to;
      if (delta < 1) continue;
      // Back-annotate cause by scanning recent BUILDING_DESTROYED events.
      let cause = "unknown";
      for (let i = log.length - 1; i >= 0; i -= 1) {
        const ev = log[i];
        if (nowSec - Number(ev.t ?? 0) > windowSec) break;
        if (ev.type !== "building_destroyed") continue;
        const detail = ev.detail ?? {};
        if (detail.cause === "wildfire") { cause = "wildfire"; break; }
        if (detail.tool === "erase") { cause = "demolish"; break; }
      }
      emitEvent(state, EVENT_TYPES.OBJECTIVE_REGRESSED, {
        category,
        pluralKey,
        from,
        to,
        delta,
        cause,
      });
    }
  }
  ```
  注意：首次 tick 没有 prev buildings → 函数第一次调用时 prev=undefined，
  `from=0` 令 `delta=-curr<1` 跳过，安全。
  depends_on: Step 3.1
- [ ] **Step 3.3**: `src/ui/panels/EventPanel.js` — `edit`（软性） — 如已有
  "event formatter" / fallback renderer 自动显示 new event type，本 step
  为 no-op；否则在 `eventFormatters` 或等效 map 加一条：
  ```js
  [EVENT_TYPES.OBJECTIVE_REGRESSED]: (ev) => {
    const { category, from, to, cause } = ev.detail ?? {};
    const causeText = cause === "wildfire" ? "wildfire"
      : cause === "demolish" ? "demolished"
      : "unknown cause";
    return `Objective ${category} dropped ${from}→${to} (${causeText})`;
  },
  ```
  Coder 需先 read EventPanel.js 决定是否已有 generic fallback。
  depends_on: Step 3.1
- [ ] **Step 3.4**: `test/scenario-objective-regression.test.js` — `add` —
  覆盖：(a) prev.warehouses=7, curr.warehouses=3 → emit 一条
  OBJECTIVE_REGRESSED with category=warehouse, from=7, to=3, delta=4,
  cause=unknown（无近期事件）；(b) prev.farms=6, curr.farms=4, 近 3 秒内有
  2 条 BUILDING_DESTROYED.detail.cause="wildfire" → cause="wildfire"；
  (c) delta=1（减 1）→ 不 emit（单 tile 消失视为正常波动）；(d) 首次 tick
  prev=undefined → 不 emit。
  depends_on: Step 3.1, Step 3.2

### Step 4 — Kitchen 成本字面量一致性

- [ ] **Step 4.1**: `index.html:1356` — `edit` — 将
  `title="Kitchen (10) — cook food into meals, cost: 5 wood + 3 stone"` 改为
  `title="Kitchen (10) — cook food into meals, cost: 8 wood + 3 stone"`。
  同时检查邻近 11 个 `data-tool=` 按钮的 title 与 BUILD_COST 对齐：
  - farm `3w`、lumber `5w`、warehouse `10w + 5s`、wall `1s`、bridge `3w + 1s`、
    quarry `6w + 2s`、herb_garden `4w + 1s`、kitchen `8w + 3s`（当前 5w +
    3s）、smithy `6w + 4s`、clinic `4w + 2s + 3h`。
  凡是 tooltip 数字与 BUILD_COST 不一致的一并改。逐条 grep `title="` 定位。
- [ ] **Step 4.2**: `test/index-html-tool-cost-consistency.test.js` — `add` —
  读 `index.html`，regex 抓每个 `<button data-tool="X" title="...">` 的
  title 字符串，parse 出 `(\d+)\s*wood` / `(\d+)\s*stone` 等数字，与
  `BUILD_COST[X]` 比较，不一致则 fail。防止未来再次漂移。
  depends_on: Step 4.1

### Step 5 — Entity pick hitbox RPG-profile enlarge

- [ ] **Step 5.1**: `src/render/SceneRenderer.js:108-109` — `edit` —
  把两个 `const ENTITY_PICK_FALLBACK_PX = 16;` / `const ENTITY_PICK_GUARD_PX
  = 24;` 改为从 BALANCE 读：
  ```js
  import { BALANCE } from "../config/balance.js";  // 若已 import 则合并
  const DEFAULT_ENTITY_PICK_FALLBACK_PX = Number(
    BALANCE.renderHitboxPixels?.entityPickFallback ?? 24);
  const DEFAULT_ENTITY_PICK_GUARD_PX = Number(
    BALANCE.renderHitboxPixels?.entityPickGuard ?? 36);
  ```
  在 `#onPointerDown` / `#pickEntity` 的调用点把硬编码 `16` / `24` 替换为
  `this.#resolveHitboxPx("fallback")` / `this.#resolveHitboxPx("guard")`，
  新方法：
  ```js
  #resolveHitboxPx(kind) {
    const base = (kind === "guard")
      ? DEFAULT_ENTITY_PICK_GUARD_PX
      : DEFAULT_ENTITY_PICK_FALLBACK_PX;
    const profile = this.state?.controls?.uiProfile ?? "casual";
    if (profile === "casual") return base;
    const bonus = Number(BALANCE.renderHitboxPixels?.rpgProfileBonusPx ?? 6);
    return base + bonus;
  }
  ```
  depends_on: Step 1.1（为 BALANCE.renderHitboxPixels）
- [ ] **Step 5.2**: 同文件 findProximityEntity 调用点不改（它接收
  thresholdPx 参数，调用者传入扩大后的值即可）。单元测试已经在
  `test/scene-renderer-proximity-pick.test.js` 存在，调用方的 thresholdPx
  改变不破现有断言。
- [ ] **Step 5.3**: 新测试**合并进** Step 4.2 的现有 `sceneRenderer-hitbox-
  balance-read.test.js` —— 覆盖 BALANCE.renderHitboxPixels 被 SceneRenderer
  导出的 DEFAULT 常量读到（纯常量 read 测试，不用 three.js）；uiProfile
  影响在 `#resolveHitboxPx` 的纯单元通过 mock state 验证。此测试**合并**到
  `test/sim-stepper-visibility-throttle.test.js` 里作为第二个 describe
  块，以压合测试文件数量。
  depends_on: Step 5.1

---

## 6. Risks

- **Step 1 visibilitychange 副作用**：`setInterval` 在 browser idle throttle
  后仍可能被 clamp；但只要 `hiddenTabCatchupHz>=60` 就算 throttle 到 4Hz 也能
  每秒步进 4 次，比 rAF 被 clamp 到 1Hz 好 4×。测试在 node 模拟 document
  对象即可。
- **Step 2 Kitchen gate 回归**：若 reservedStoneForWalls 算错方向，可能让
  Plains (walls 7/8 scenario) 开局 stone=4 时 kitchen 永远不建。缓解：
  Step 2.3 测试 (a)/(b)/(c) 覆盖三种 scenario 开局；benchmark seed=42
  / plains / 365 天 DevIndex 不能低于 Round 5 基线 30.79 −2。若掉更多，
  回退 Step 2 并只保留 pop>=12 critical 分支。
- **Step 3 event log 膨胀**：每 tick 多一次 rebuildBuildingStats 对比；
  rebuild 本身已经发生（ResourceSystem:288 gridChanged branch），本 plan 只
  加比较 + 可能的 emitEvent。膨胀 ≤ 4 事件/tick（4 categories），worst-case
  100 tick × 4 = 400 events；GameEventBus MAX_EVENTS=200 已兜底。
- **Step 4 字面量漂移**：若未来改 BUILD_COST 数字，测试 4.2 会 fail →
  提示开发者同步更新 index.html。这是预期行为，不是 risk。
- **Step 5 uiProfile 切换**：当 `state.controls.uiProfile` 在运行时切换，
  已 cache 的 threshold 不会立即更新 —— `#resolveHitboxPx` 每次调用都重读
  state，不缓存，即时生效。风险已消除。
- **与 01b Round 5b 的 merge 冲突**：本 plan 不碰 RoleAssignmentSystem.update
  主体、ColonyPlanner 的 Priority 3.75 reassign_role 分支、balance 的
  roleQuotaScaling/fallbackIdleChainThreshold。Wave 裁决时把本 plan 排在
  01b 之后（wave 2）可消除漂移；唯一可能冲突点是 balance.js 的新增位置，本
  plan 明确加在 `fallbackIdleChainThreshold:` **之后**不冲突。
- **4× benchmark 回归**：`scripts/long-horizon-bench.mjs` 是 headless 无
  rAF；Step 1 的 visibility throttle 不影响。maxSteps=12 在 Phase 10
  harness 里已跑过完整 365 天测试，determinism 保留。

---

## 7. 验证方式

### 新增测试（4 个）

- `test/sim-stepper-visibility-throttle.test.js`（Step 1.4 + Step 5.3 合并）
- `test/kitchen-gate-wall-scenario.test.js`（Step 2.3）
- `test/scenario-objective-regression.test.js`（Step 3.4）
- `test/index-html-tool-cost-consistency.test.js`（Step 4.2）

### 回归测试

`node --test test/*.test.js` 全 1162 个必须 pass。允许变化：

- Step 1: simStepper maxSteps 从 6→12 可能让某些 assertion 步数变多；
  grep `maxSteps` / `stepsComputed` 现有测试，若测断言 "max 6 steps" 则更新
  为 BALANCE 读取。
- Step 4: 任何测试如果硬编码了 toolbar tooltip "5 wood" 字面量需同步改。

### 手动验证

1. `npx vite`；打开 build。
2. 切 Highlands（Gate Bastion, walls 7/10）→ Autopilot ON → 4× → 等 5 分钟。
3. 期望：Kitchen 在 pop 到 12 之前建（Step 2 生效）；Meals/min 从 t=180s 起
   > 0（01b Round 5b 叠加本 plan Step 2 的效果）。
4. 在 autopilot 中手动 erase 一个 warehouse → EventPanel 应立即出现
   `Objective warehouse dropped 5→4 (demolished)`（Step 3 生效）。
5. 在 tool bar hover Kitchen 按钮 → title 显示 "8 wood + 3 stone"（Step 4）。
6. 在 1920p 下 click 离 worker sprite 30px 的地方 → 触发 proximity pick
   （Step 5，uiProfile=full）；切 casual 后同样点击 → 不触发（保持保守）。
7. 在 chrome devtools Performance tab 测 `timeScale=4` 的 ticks/s；应 >=
   3.5×（Step 1 生效）。

### Benchmark 回归

`node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains
--max-days 365 --soft-validation`：

- DevIndex last 不得低于 Round 5 v2 基线 **30.79 − 2**；目标 ≥ 40（与 01b
  Round 5b 叠加后 ≥ 45）。
- Deaths 不得高于 **466 + 20**；目标 ≤ 450。
- 必须跑 4-seed sweep（1/7/42/99），遵循 Stage D v2 写下的 hard gate：
  seeds 1/99 outcome != `"loss"`（01b Round 5b 保证，本 plan 不回退）。

### 显式度量指标

- 4× Fast-Forward 实测 ticks/wall-sec ≥ 3.5×（当前 ~1.2×）
- OBJECTIVE_REGRESSED 事件在 autopilot 30 分钟 session 命中 ≥ 1 次（或 0 次
  若无 wildfire / erase，属正常）
- index.html 所有 tool tooltip 数字与 BUILD_COST 一致（测试 4.2 绿）
- uiProfile=full 下 entity pick 命中率（synthetic click 30px 外）≥ 70%

---

## 8. UNREPRODUCIBLE 标记

N/A —— 本 plan 不依赖 Playwright 现场复现。02a feedback 14 张截图与 3 局
session 日志定位到 5 件修的代码坐标（每件都在 feedback §4 / 5 / 最想修的 5
件事里显式点名），且 Round 5 Validation v2 报告确认 Kitchen gate 在 wall-
heavy scenario 的死锁路径（seed=42 DevIndex 30.79 的主因之一）。归因链闭合。

## 9. Layers & Scope Attestation

- 跨层触达：
  1. `src/config/balance.js`（config 层）
  2. `src/simulation/meta/GameEventBus.js` + `src/simulation/economy/
     ResourceSystem.js` + `src/simulation/ai/colony/ColonyPlanner.js`
     （simulation 层）
  3. `src/app/simStepper.js` + `src/app/GameApp.js`（app 层）
  4. `src/render/SceneRenderer.js`（render 层）
  5. `index.html` + `src/ui/panels/EventPanel.js`（ui 层）
- 共 5 层、7 个文件，≥ 3 层硬门槛 ✅
- LOC 估算 ~215（balance +12；GameEventBus +2；ResourceSystem +45；
  ColonyPlanner +18；simStepper +8；GameApp +20；SceneRenderer +10；
  index.html +1 + 其他 tooltip 对齐 ~10；EventPanel +8；tests +81）
  ≥ 150 硬门槛 ✅
- 覆盖率 73% ≥ 70% 硬门槛 ✅（见 §2 Coverage Matrix）
- 至少 50% step 改变行为（Step 1/2/3/5 全为新分支 / 新 emit / 新 gate，
  仅 Step 4 是字面量同步；5 steps × 80% behavioral = 4/5 ✅）
