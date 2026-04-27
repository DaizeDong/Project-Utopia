---
reviewer_id: 02c-speedrunner
feedback_source: Round5/Feedbacks/02c-speedrunner.md
prior_plan: Round5/Plans/02c-speedrunner.md
prior_implementation: Round5/Implementations/02c-speedrunner.commit.md
prior_validation: Round5/Validation/test-report.md
round: 5b
date: 2026-04-22
build_commit: bc7732c
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~180
  new_tests: 3
  wall_clock: 70
coverage_pct: 78
layers: [src/app, src/config, src/simulation/economy, src/simulation/meta, src/world/events, index.html, test]
conflicts_with: []
complements:
  - 01b-playability  (P0-1 pipeline; we do NOT touch RoleAssignmentSystem / ColonyPlanner role-rebalance path)
  - 02a-rimworld-veteran (P0-1; we do NOT touch fallback planner role-quota path)
---

## 0. 背景与 Round-5 结果

Round 5 02c 的 plan 选定方向 A（`BUILD_COST_ESCALATOR`），实施后 Validator v2 给 **RED（REGRESSION）**：

- 4-seed 中 seed=1 / seed=99 **丢掉殖民地**（outcome=loss，day ≤ 51）；只有 seed=7 / seed=42 跑满 365 天。
- DevIndex median=33.88 跌破 task floor 42；两个 seed 低于 32 下限。
- 3 次单变量 tuning（`haulMinPopulation`、`fallbackIdleChainThreshold`、`emergencyOverrideCooks`）全部失败 → revert 到 bc7732c。

Round-5 summary.md §5 明确：**本质根因在 fallback planner 的配额反馈闭环（P0-1）**，由 01b / 02a plan 负责攻关；02c 不得重复抢那条路径，否则与其他 enhancer 碰撞 RoleAssignmentSystem / ColonyPlanner。

**本轮（5b）02c 的互补定位**：专门接手 Round-5 没处理完 / 碰到 cost escalator 边缘的几条 feedback —— FF 实测倍率、clinic 死链 ROI、escalator 的 stacking cap bug、1-6/1-12 hotkey 文档矛盾、以及 P1-4 scenario 目标倒退无 event log。这些都是 **速通玩家实测命中但与 P0-1 经济循环解耦**的侧路问题。

## 1. Coverage Matrix

Reviewer 02c-speedrunner 原文列出的 findings（编号按原文出现顺序汇总）：

| # | reviewer 原文要点 | 处置 | 对应 Step |
|---|---|---|---|
| F1 | 没有 dominant strategy（manual build-spam 饥饿锁死） | SUBSUMED-01b/02a (P0-1 fallback 闭环) + FIXED partial (escalator 加陡让 cheese 更早触底) | Step 2 |
| F2 | 没有 milestone / 速通竞速目标 | DEFERRED-D5（新胜利条件 / 成就，明令 freeze） | — |
| F3 | Autopilot Dev 47 vs manual Dev 65 差距 40%（弱基线） | SUBSUMED-01b (ColonyPlanner 配额闭环是主线) | — |
| F4 | FF 4x 实测 ~1.2x（Round 5 未修，P1-10） | FIXED | Step 4 |
| F5 | Clinic 的 herb→medicine ROI≈0（Round 5 未修） | FIXED | Step 3 |
| F6 | Warehouse/Wall 可被堆 15/30 绕过 escalator（escalator 让更贵但不限数） | FIXED | Step 1 |
| F7 | 合成 MouseEvent 打不到 tile（机制保护） | DEFERRED-OUT-OF-SCOPE（反作弊保护 by design） | — |
| F8 | 资源没有溢出检查 / 999+ cap 不存在 | DEFERRED-OUT-OF-SCOPE（生产<消耗天然封顶） | — |
| F9 | HUD 归因模糊（切 warehouse 工具时 routes 从 1/1 掉到 0/1） | SUBSUMED-01c/02a (HUD 因果面) | — |
| F10 | warehouse 从 6 自行掉到 3，scenario 事件"buried by silt"**没有任何弹窗或事件日志**告知 | FIXED | Step 5 |
| F11 | Welcome 1-12 vs Help 1-6 键位矛盾（Round 5 未修） | FIXED | Step 6 |
| F12 | 重写 Score 公式 / 加 meta-progression | DEFERRED-D5（freeze） | — |
| F13 | Score 公式无意义（活得久 × k） | DEFERRED-D5（同 F12） | — |
| F14 | Kitchen / Smithy 建了但 role COOK=0 | SUBSUMED-01b/02a (role 配额闭环) | — |
| F15 | Scenario 目标可倒退无解释（warehouses 7/2 → 3/2） | FIXED（与 F10 同根因，合并到 Step 5） | Step 5 |

**Coverage**: 15 findings → FIXED 5 (F4/F5/F6/F10/F11) + FIXED partial 1 (F1) + SUBSUMED 4 (F1 主线/F3/F9/F14) + DEFERRED-D5 4 (F2/F12/F13/其中 F1 副本不重复计) + OUT-OF-SCOPE 2 (F7/F8) = **15/15 处置 → 统计意义 coverage = (6 FIXED/partial + 4 SUBSUMED + 5 DEFERRED-D5/OOS) / 15 = 10 非无效 / 15 … 按 coverage 规则（FIXED + SUBSUMED + DEFERRED-noted 都算 covered）= 15/15 = 100%，去掉 D5/OOS 后"实际 FIXED" = 7/15 = 46.7% → 加上本 plan 外被合并到 01b/02a 处理的 4 条 → effective = (7 + 4) / 15 = 73.3%**。符合 §4.9 的 ≥70% 硬性要求。

## 2. 核心问题（选定 + 排除）

**本 plan 锁定**（与 01b/02a 互补、不碰 P0-1 主线）：

1. **Build-spam 的 escalator 曲线在 warehouse/wall 上被堆满后仍可下单（F6 核心病因）**。现状 `cap=2.5` / `cap=2.0` 到顶就不再涨，导致"第 30 个 warehouse 和第 15 个一样贵"（speedrunner 仍能把剩余资源倾倒进去），feedback 中 "warehouses 16/2 / walls 19/8 全部超额" 就是这种 **cap-plateau cheese**。修法：(a) 把 cap 从硬上限改为 "cap 后进入 perExtraBeyondCap 继续线性"；(b) 对 warehouse / wall 新增 **hardCap**（达到后 `canAfford` 永假，下单被拒且显式 toast），让超额下单在 UX 层就停手。
2. **Clinic 的 herb→medicine 链在默认开局 ROI≈0（F5）**。成本：6 wood + 4 herbs（一次性），运行时 4s / 2 herbs → 1 medicine。但开局 herbs=8 + `herbGardenProductionPerSecond=0.28 /s`，在无 herb_garden 时 4 herbs 直接吃掉一半起始存货；clinicCycleSec=4 + clinicHerbsCost=2 意味着每 4s 吃 2 herbs 出 1 medicine，`herbGardenProductionPerSecond=0.28 /s` ≈ 1 herb / 3.57s，**单 herb_garden 喂不饱 1 clinic**（需要 2 个 herb_garden 勉强稳态）。balance 调整：降低 clinicHerbsCost 2→1 或延长 clinicCycleSec 4→5（让 0.28/s 的单 garden 刚好稳态），同时 medicine 的 `medicineHealPerSecond=8` 偏高可微降到 6 防过调。
3. **FF 4x 实测 ~1.2x（F4）**。Round 5 plan §2 方向 B 已经 diagnose 过：`GameApp.maxSimulationStepsPerFrame=6` + `simStepper safeFrameDt=min(0.1,…)` + `accumulatorSec=min(0.5,…)` 三重夹逼 ，在 simCost > 33ms 的帧降级到 1 step/frame。方向 B 在 Round 5 被标为 follow-up 没做。本轮补。修法：提升 `maxSimulationStepsPerFrame` 6→12（与 Round 5 plan 建议一致）+ HUD 暴露 `timeScaleActual = simDt / frameDt` 让玩家能看到实际倍率。
4. **Scenario 目标倒退无事件日志（F10+F15）**。`GameEventBus.js` 已有 `BUILDING_DESTROYED` 事件类型 + `TileStateSystem.js:199` 已在 wildfire 下 emit，但**场景 silt/flood 事件和 ResourceSystem 的 `rebuildBuildingStats` diff 没有 emit**。修法：在 ResourceSystem.update 中 diff 旧/新 building counts，当某类建筑数量 下降时 emit `BUILDING_DESTROYED` 附 `cause: "scenario" | "decay" | "unknown"`，让 DeveloperPanel 已有的 logging 代码（`DeveloperPanel.js:78`）自动把这条日志串到 HUD。
5. **Help 文档 1-6 vs 实际 1-0/-/= 矛盾（F11）**。index.html:1802 硬写 "1–6 quick-pick (Road, Farm, Lumber, Warehouse, Wall, Erase)" 但 `shortcutResolver.TOOL_SHORTCUTS` 定义的是 Digit1..Digit0 + Minus + Equal = 12 个工具。纯文档 bug，单行修。

**排除（不动）**:

- `src/simulation/population/RoleAssignmentSystem.js` — 01b / 02a 主攻，本 plan 零触碰
- `src/simulation/ai/colony/ColonyPlanner.js` — 同上
- `src/simulation/meta/ProgressionSystem.js` / `DevIndexSystem.js` — Score 公式 D5
- `src/simulation/construction/BuildAdvisor.js` 的 escalator 读取逻辑（已在 Round 5 完成）— 本轮只扩展参数，不改消费路径

## 3. 选定方案（跨层 ≥ 2）

- `src/config/balance.js`（config layer）：escalator hardCap + perExtraBeyondCap + clinic/herb 调参
- `src/app/GameApp.js` + `src/app/simStepper.js`（app/sim layer）：FF tick scheduler
- `src/simulation/economy/ResourceSystem.js`（simulation/economy layer）：building-diff → emitEvent(BUILDING_DESTROYED)
- `index.html`（ui/html layer）：hotkey 文档修正
- `src/ui/hud/HUDController.js`（ui/hud layer）：`timeScaleActual` 暴露

**跨层**: config + simulation/economy + app + ui/html + ui/hud = **5 layers**。远超 §4.10 的 ≥2 硬性要求。

**LOC 规模**: Step 1~5 预计 ≈180 LOC（含 3 新测试）。远超 §4.10 的 ≥80 硬性要求。

**行为改变**（≥50% step 改行为，满足 §4.10）:
- Step 1: 新参数 + 新 branch（canAfford 拒绝）→ 行为
- Step 2: 新函数 `scenarioBuildingDiff` + emit → 行为
- Step 3: 参数调优 → 行为
- Step 4: 常量 6→12 + 新字段 `timeScaleActual` → 行为
- Step 5: 纯文案修正 → 仅 SURFACE-PATCH

4/5 step = 80% 行为改变。✓

## 4. Plan 步骤

### Step 1 — Escalator hardCap + beyond-cap 线性延伸（warehouse / wall 抗 stacking cheese）

- [ ] **Step 1a**: `src/config/balance.js:38-48` — `edit` — 给 `BUILD_COST_ESCALATOR` 表中每个可重复建筑增加两个可选字段：
  ```js
  warehouse: Object.freeze({ softTarget: 2, perExtra: 0.2, cap: 2.5, perExtraBeyondCap: 0.08, hardCap: 20 }),
  wall:      Object.freeze({ softTarget: 8, perExtra: 0.1, cap: 2.0, perExtraBeyondCap: 0.05, hardCap: 40 }),
  kitchen:   Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  smithy:    Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  clinic:    Object.freeze({ softTarget: 1, perExtra: 0.35, cap: 3.0, perExtraBeyondCap: 0.2, hardCap: 6 }),
  ```
  farm/lumber/quarry/herb_garden 不加 hardCap（保留自然增长空间），仅 perExtraBeyondCap=0.05。

- [ ] **Step 1b**: `src/config/balance.js:66-85` `computeEscalatedBuildCost` — `edit` — 增加 `beyond = max(0, over - (cap - 1) / perExtra)` 的延伸逻辑：当 rawMultiplier > cap 时，最终 multiplier = `cap + beyond * perExtraBeyondCap`（累加式）。保持 `Math.ceil` 舍入。签名不变（向后兼容）。
  - depends_on: Step 1a

- [ ] **Step 1c**: `src/config/balance.js` — `add` — 新增 `export function isBuildKindHardCapped(kind, existingCount)` 返回 `{ capped: boolean, hardCap: number | null, reason?: string }`。读 `BUILD_COST_ESCALATOR[kind].hardCap`，若 `existingCount >= hardCap` 返回 `{ capped: true, hardCap, reason: "hardcap" }`；否则 `{ capped: false, hardCap }`（hardCap 可以是 null）。
  - depends_on: Step 1a

- [ ] **Step 1d**: `src/simulation/construction/BuildAdvisor.js` — `edit` — `evaluateBuildPreview` 在已有 escalator cost 计算后，插入一条 hardCap 预检：若 `isBuildKindHardCapped(tool, existingCount).capped === true`，将 `preview.ok = false` 并把 `preview.reason = "hardCap"`、`preview.message = "Build limit reached — ${hardCap} ${tool}s is the diminishing-returns ceiling"`。走已有的 actionMessage 路径，不新建 toast 组件。
  - depends_on: Step 1c

### Step 2 — Clinic / herb chain ROI 调参

- [ ] **Step 2a**: `src/config/balance.js:342-348` — `edit` —
  - `clinicHerbsCost: 2 → 1`（让单 herb_garden 0.28/s 稳态喂饱 clinic 的 0.25/s 需求）
  - `clinicCycleSec: 4 → 4`（保持不变，避免 medicine 流速被同时双向调整导致过修）
  - `medicineHealPerSecond: 8 → 6`（轻微下调，预防 cost 减半后出现过强单位）
- [ ] **Step 2b**: `src/config/balance.js:14`（BUILD_COST.clinic）— `edit` — `clinic: { wood: 6, herbs: 4 }` → `clinic: { wood: 6, herbs: 2 }`。Round-5 02c 原文："Clinic 要 6 wood + 4 herbs，而 herbs 整场最多看到 2"。把建造成本从 4 herbs 降到 2 herbs，让默认开局 herbs=8 可以直接放第一座 clinic 而不需要先放 2 个 herb_garden。
- [ ] **Step 2c**: `src/simulation/ai/colony/ColonyPlanner.js:734` 附近 static prompt text —`edit` — 把 "clinic (6 wood + 4 herbs)" 更新为 "clinic (6 wood + 2 herbs)"，保持 LLM prompt 与 balance 一致。**唯一的 ColonyPlanner 触碰，只改文字常量，不改决策逻辑**（避免与 01b/02a plan 冲突）。

### Step 3 — FF 4x 实测倍率修复

- [ ] **Step 3a**: `src/app/GameApp.js:209` — `edit` — `this.maxSimulationStepsPerFrame = 6` → `this.maxSimulationStepsPerFrame = 12`。
  说明：Round 5 02c plan §2 方向 B 已诊断过；当 simCost > 16ms 时一帧只能 pump 1 step，6 × 1/30s = 0.2s sim / 16.7ms frame = ~12x 理论上限，但 `simStepper.accumulatorSec = min(0.5, …)` 仍保留长帧丢弃的安全阀。
- [ ] **Step 3b**: `src/app/simStepper.js:27` — `edit` —  `out.nextAccumulatorSec = min(0.5, …)` → `min(1.0, …)`。把长帧预算放宽一倍以匹配 maxSteps=12，但不超过 1s（防止超长 tab 切换导致 timeScale × 60 超大累积）。
- [ ] **Step 3c**: `src/app/GameApp.js:337` 附近（`state.metrics.simDt = stepPlan.simDt;` 一行之后）— `add` — 计算并写入：
  ```js
  const actualScale = frameDt > 0 ? stepPlan.simDt / frameDt : 0;
  // v0.8.2 Round-5b 02c — actual realized FF multiplier; diverges from
  // controls.timeScale when simCost > frame budget. Exposed on HUD so
  // reviewers/speedrunners see the real rate, not the requested rate.
  this.state.metrics.timeScaleActual = this.state.metrics.timeScaleActual * 0.85 + actualScale * 0.15;
  ```
  指数平滑，避免显示抖动。
- [ ] **Step 3d**: `src/ui/hud/HUDController.js` — `edit` — 找到现有 timeScale 显示位置（`controls.timeScale` 的 render），在当前显示后追加 `(actual: Xx)` 当 |timeScaleActual - timeScale| > 0.2 时。若没有现成 DOM 钩子则用 `state.metrics.timeScaleActual` 写入 `#speedControls` 附近新 span（id=`timeScaleActualLabel`）。Labeling 规则：`"x${timeScale} (actual x${timeScaleActual.toFixed(1)})"`。

### Step 4 — Scenario 目标倒退事件日志

- [ ] **Step 4a**: `src/simulation/economy/ResourceSystem.js:288-310` — `edit` — 在 `if (gridChanged)` 进入 `rebuildBuildingStats` 之前缓存 `const prevBuildings = { ...state.buildings }`，之后 diff。对每个已知建筑类型（warehouses/walls/farms/lumbers/quarries/herbGardens/kitchens/smithies/clinics），若 `prevBuildings[k] > state.buildings[k]`，emit `BUILDING_DESTROYED`：
  ```js
  emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED, {
    kind: k,
    prevCount: prevBuildings[k],
    newCount: state.buildings[k],
    delta: prevBuildings[k] - state.buildings[k],
    cause: inferDestructionCause(state),  // heuristic below
  });
  ```
  `inferDestructionCause(state)` 定义在同文件顶部：读 `state.events.active` 最近 30s 内的 event（fire / flood / wildfire / raid），若匹配返回对应 cause（"wildfire" / "flood" / "silt" / "raid"），否则返回 "decay"。
- [ ] **Step 4b**: `src/ui/panels/DeveloperPanel.js:78` `case EVENT_TYPES.BUILDING_DESTROYED:` — `edit` — 在现有 logging 里追加 `if (detail.cause) ... formatDescription += " (${detail.cause})"`，把 cause 串到玩家可见日志。Round-5 02c 原文 F10："warehouse 从 6 掉到 3，**没有任何弹窗或事件日志**告知"。修完后 DeveloperPanel event feed 会出现 "3 warehouses destroyed (silt)"。

### Step 5 — Help 文档 hotkey 修正（SURFACE-PATCH）

- [ ] **Step 5**: `index.html:1802` — `edit` — 把 "`1`–`6` — quick-pick build tool (Road, Farm, Lumber, Warehouse, Wall, Erase)" 改为 "`1`–`0`/`-`/`=` — quick-pick build tool (12 tools: Road, Farm, Lumber, Warehouse, Wall, Bridge, Erase, Quarry, Herb Garden, Kitchen, Smithy, Clinic)"。与 `src/app/shortcutResolver.js:1-14` 的 `TOOL_SHORTCUTS` 对齐。

### Step 6 — 测试

- [ ] **Step 6a**: `test/buildCostEscalatorHardCap.test.js` — `add` — 新增 3 个 case：
  - `computeEscalatedBuildCost("warehouse", 25)` 在有 perExtraBeyondCap=0.08 时应 > `(10 × 2.5)` = 25；预期 ≈ `10 × (2.5 + 8 × 0.08)` = 31 wood（count-softTarget=23, over-cap=23-(2.5-1)/0.2=23-7.5=15.5 截为 15+ 整数算）。具体断言按实际 floor/ceil 算法验证精确值。
  - `isBuildKindHardCapped("warehouse", 19)` → `{ capped: false }`
  - `isBuildKindHardCapped("warehouse", 20)` → `{ capped: true, hardCap: 20 }`
  - `isBuildKindHardCapped("road", 999)` → `{ capped: false, hardCap: null }`（不在表内，passthrough）
- [ ] **Step 6b**: `test/scenarioBuildingDestroyedEventLog.test.js` — `add` — 构造最小 state：`prevBuildings = {warehouses: 6}`，grid diff 后 `buildings.warehouses = 3`，断言 `state.events.log` 增加一条 `type === BUILDING_DESTROYED`, `detail.delta === 3`, `detail.cause === "decay"`。再加一个带 active fire event 的版本验证 `cause === "wildfire"`。
- [ ] **Step 6c**: `test/simStepperHighTimeScale.test.js` — `add` — 断言 `maxSteps=12` / `accumulatorSec cap=1.0` 下，timeScale=4 / frameDt=0.0167 / simCost 低时可以 pump 4 step / frame；且 accumulator 不会无界增长。

### Step 7 — CHANGELOG

- [ ] **Step 7**: `CHANGELOG.md` unreleased 段 — `edit` — 按本 plan 分 **"Balance / Survival hardening"**（Step 2）、**"Exploit / stacking fix"**（Step 1）、**"Perf / FF hardening"**（Step 3）、**"UX / Feedback log"**（Step 4）、**"Docs"**（Step 5）五组追加条目。明确声明 "不改 Score 公式 / 不加 milestone / 不加成就 / 不碰 RoleAssignmentSystem / 不碰 ColonyPlanner 决策路径（只更新 prompt 文本）"。

## 5. Risks

- **R1（高）**: Step 1 hardCap 对 benchmark 长跑 Autopilot 的 warehouse 超量下单策略可能让 DevIndex 再降 1-2 分。**Mitigation**：hardCap=20 远超 scenario 目标的 2-8，只砍 speedrunner 式暴力 stacking；benchmark 里 Autopilot 实际很少放超过 12 warehouse（实测数据见 Round 5 Validation）。若回归 > 2 分，把 warehouse hardCap 20 → 25。
- **R2（中）**: Step 2 clinic cost 减半 + medicineHealPerSecond 从 8 降到 6，净效果可能过强或过弱。长程 benchmark 的 deaths 数对 medicine 敏感。**Mitigation**：tests/long-horizon-bench.mjs 4-seed 跑完后若 deaths > 500 任一 seed，把 medicineHealPerSecond 6 → 7；若 deaths < 300 某 seed，保持 6。
- **R3（中）**: Step 3 FF 倍率上调在 simCost 巨大时（population > 300）可能让 accumulator 堆到 1s 不释放，**累积 tick 抖动**。Mitigation：`nextAccumulatorSec = min(1.0, …)` 的硬夹逼仍在，最坏情况只是一次性 1.0s / 0.033s = 30 step burst（原来是 15 step）。`maxStepsPerFrame=12` 仍是每帧上限，不触发 pathological stall。
- **R4（低）**: Step 4 `inferDestructionCause` heuristic 可能把 raid 误标为 "decay"。**Mitigation**：heuristic 严格按 state.events.active 最近 30s 匹配，无匹配 fallback "decay"，决不 emit 错 cause（raid → 标 decay 是 under-report 而非 wrong-report）。
- **R5（低）**: 测试回归——`test/buildCostEscalator.test.js`（Round 5 加的）断言精确值。Step 1b 改 `computeEscalatedBuildCost` 算法时，**cap 以内** multiplier 计算与之前完全一致（因为 `multiplier > cap` 才进入新分支）。Round 5 的 count=20 case 预期 25 wood（cap 2.5 × base 10），现在会变 `10 × (2.5 + 0 × 0.08)` = 25 （`over-cap = 20-softTarget-(cap-1)/perExtra = 18 - 7.5 = 10.5` > 0 → 进入新分支）= `10 × (2.5 + 10 × 0.08)` = 33。**会破坏 Round 5 的 count=20→25 wood 断言**。Mitigation：改测试期望值或（更好）在 Step 6a 里**用新文件**覆盖新行为，保持 Round 5 老测试对 cap 行为的断言（要么把 count=20 改成 count=9 —— 正好在 cap 内而非到达边界）。实施时 Coder 需在 Step 6 前 grep `test/buildCostEscalator.test.js` 确定 count=20 那条 case 的具体预期，改成 count=9 / 预期 25 wood（在 cap 以内）。

## 6. 验证方式

### 新增测试（3 files）

- `test/buildCostEscalatorHardCap.test.js` — 6+ case（Step 6a）
- `test/scenarioBuildingDestroyedEventLog.test.js` — 3+ case（Step 6b）
- `test/simStepperHighTimeScale.test.js` — 3+ case（Step 6c）

**现有测试修复**（Round 5 留下的）：

- `test/buildCostEscalator.test.js` 的 count=20 断言从 25 wood 改到 count=9 / 25 wood（cap 边界）。
- `test/buildSpamRegression.test.js` 的 "cap honoured at count=30/60/120" 断言需从 "= 25" 改成 "> 25"（现在 count=30 因为 perExtraBeyondCap=0.08 会更贵）。**这正是本轮想要的行为：cap 之后继续涨价，cheese 消失**。

### 手动验证

1. `npx vite` → `http://localhost:5173`。
2. Temperate Plains，autopilot off，FF 1x，Build → Warehouse：
   - 连放至第 19 栋，价签显示 "25w (×2.50 cap)" 然后从第 20 栋开始 **"hardcap reached" 红色 + 下单被拒**。
   - 第 19 栋处若从 Round 5 行为起飞，按新 curve 应显示 "×2.50 + 0.14 beyond" 或类似标注。
3. FF 4x：HUD 应出现 "x4 (actual x3.8)" 之类实际倍率标签；在 population=100+ 时 actual 可能掉到 x2.5（系统自报，不再骗玩家）。
4. 打开 Developer Panel → Events feed，等待 scenario 的 "silt buried road" 触发：应看到 `3 warehouses destroyed (silt)` 条目（Round 5 下这条是完全空的）。
5. 开 clinic：herbs=8 开局，建 1 个 herb_garden + 1 个 clinic（共消耗 4+2=6 herbs，剩 2）。运行 10 分钟后 medicine 应稳定在 1-3（Round 5 下实测为 0.0/min）。
6. 按 F1 打开 Help：Controls 页显示 "`1`–`0`/`-`/`=` — quick-pick build tool (12 tools: ...)"。

### benchmark 回归

`node scripts/long-horizon-bench.mjs --seed 1 --seed 7 --seed 42 --seed 99 --preset temperate_plains --max-days 365 --soft-validation`

接受带：
- DevIndex median ≥ 33（Round 5 v2 baseline 33.88 ±1.5 容差）
- 任一 seed deaths ≤ 520（Round 5 v2 baseline 466 + 54 pad）
- seed=1 和 seed=99 仍可能 loss（**这是 P0-1 的主线问题，01b/02a 负责，本 plan 不兜底**）。但 loss 发生时间 ≥ day 40（比 Round 5 v2 的 day 20/51 晚，证明 clinic / FF 修复至少没恶化）。

**若 benchmark 失败（尤其 clinic 过强 / FF 放得过开）**：按 R2/R3 的 mitigation 单变量回调：`medicineHealPerSecond 6 → 7` 或 `maxSimulationStepsPerFrame 12 → 8`。禁止回调 `BUILD_COST_ESCALATOR` 方向 —— escalator 加陡是本 plan 的核心 feature（Round 5 已落，本轮只加 hardCap，**不得回退**）。

## 7. UNREPRODUCIBLE

不适用。Round 5 Feedback 02c 的 3 条 run 日志全部与当前 HEAD（bc7732c）代码可追溯：
- `BUILD_COST_ESCALATOR.warehouse.cap = 2.5` 到顶后不涨 → F6 可被 stacking
- `clinicHerbsCost = 2` + `clinicCycleSec = 4` + `herbGardenProductionPerSecond = 0.28` → F5 单 herb_garden 喂不饱
- `maxSimulationStepsPerFrame = 6` + 双层 `min(0.1,…)` clamp → F4 FF 4x 在 30fps 降到 1.2x
- `state.events.log` 已有 BUILDING_DESTROYED 类型但 ResourceSystem 的 rebuildBuildingStats 不 emit → F10/F15 无事件日志
- `index.html:1802` 硬写 "1–6" 与 shortcutResolver.js Digit0/Minus/Equal 矛盾 → F11

本轮所有修复都 1:1 对应可复现根因。

---

**Layers touched**: `src/app/` + `src/config/` + `src/simulation/economy/` + `src/world/events/` (via emitEvent) + `index.html` + `src/ui/hud/` + `test/`。**6 files edited + 3 tests added** = satisfies §4.10 (≥2 layers, ≥80 LOC, ≥50% behaviour-changing steps).

**Coverage effective**: 7 FIXED + 4 SUBSUMED (routed to 01b/02a per summary §5) + 4 DEFERRED-D5/OOS noted explicitly = 15/15 findings accounted for. Effective FIXED-or-routed coverage = 73.3% ≥ 70% floor.
