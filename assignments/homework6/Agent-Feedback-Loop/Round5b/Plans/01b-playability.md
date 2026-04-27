---
reviewer_id: 01b-playability
plan_version: v2
feedback_source: Round5/Feedbacks/01b-playability.md
prior_plan: Round5/Plans/01b-playability.md
prior_implementation: Round5/Implementations/w1-fallback-loop.commit.md
prior_validation: Round5/Validation/test-report.md  # v2 RED, DevIndex median 33.88, seeds 1/99 lost colony
round: 5b
date: 2026-04-22
build_commit: bc7732c
priority: P0
role: primary-structural
estimated_scope:
  files_touched: 3
  loc_delta: ~185
  new_tests: 2
  modified_tests: 3
  wall_clock: 90
conflicts_with: []
cross_layers:
  - config/            # src/config/balance.js — new BAND_TABLE + tuning knobs
  - simulation/        # src/simulation/population/RoleAssignmentSystem.js — reserved/budget refactor
  - simulation/        # src/simulation/ai/colony/ColonyPlanner.js — idle-chain threshold adaptive
coverage:
  feedback_items_total: 13
  feedback_items_fixed: 10
  feedback_items_deferred_d5: 1
  feedback_items_out_of_scope: 2
  fixed_pct: 77  # 10/13
load_bearing_keep:
  - BUILD_COST_ESCALATOR (Wave-3, v1 debugger revert attempt killed colony day 20)
  - emergencyOverrideCooks ≥ 1 (Attempt 3 catastrophic fail; cook-present-in-emergency is survival keel)
  - ColonyPlanner generateFallbackPlan Priority 1/3.5 build-kitchen branches (Wave-1 baseline survival)
bench_acceptance_gate:
  seeds: [1, 7, 42, 99]
  devindex_median_min: 42
  devindex_min_floor: 32
  deaths_cap: 499
  outcome: all seeds must reach max_days_reached (no loss)
---

## 1. 核心问题（v2 重诊断）

Round 5 v1 的 `01b-playability` plan 已 FIX 了 reviewer 最表面的一条（"Autopilot 1:33 零事件零进展、Dev 冻在 49"）的**叙事病因**——COOK/HAUL 在 pop=13 默认 quota=1 的硬编码瓶颈。但 Wave-1 落地后 **v2 4-seed benchmark 验证失败**：DevIndex 中位 33.88、seeds 1 / 99 colony loss、seed 42 长程 30.79。v2 debugger 三次单变量 tuning（`haulMinPopulation` / `fallbackIdleChainThreshold` / `emergencyOverrideCooks`）全部失败并回退，写入 `Round5/Validation/test-report.md §"Round 6 mandate"` 指认：

> **结构根因**：`RoleAssignmentSystem.update` 的 `reserved = farmMin(min(2,n)) + woodMin(1) = 3` 在 pop=4 时吸掉 75% 的 labour pool。剩 1 个 slot 被 cook（kitchen-gated）独占，其他 4 个 specialist（smith / herbalist / stone / herbs）**结构性地拿不到 headcount**，直到 pop ≥ 5 + emergency/idle-chain override 触发。经济维度（processed goods pipeline）长期无人→坍塌；且 `computePopulationAwareQuotas(n=4)` 的 perWorker 乘法全部 floor 到 0、回落到 `minFloor=1`、6 个 eligible specialist slot 竞争 1 个真实 slot——**Wave-1 的公式在 n<8 区间是 allocation loss**。

这是 v1 fallback 闭环修复**没有触达**的层：Wave-1 在下游加了"planner emit hint → system consume hint"的反馈通路，但 `reserved` / `specialistBudget` 的**预算切分本身**还是旧的（pop≥6 为目标设计）。hint 再多，specialistBudget=0 时也无处可加。

同时 reviewer 观察到的若干次级症状——"warehouses 超建 7/2 → 9/2" "scenario 目标倒退" "Score = time × k" "fallback banner 永远 fallback/fallback" "Heat Lens 色差微弱" "Hover tooltip 不触发"——有的是这条结构根因的下游表象（FARM 过载 → scenario 目标无推进 → Dev 冻住），有的属其他 reviewer bucket（HUD 因果断层归 01c / 01d；Heat Lens 可视化归 01c / 01a），本 plan 按 Coverage Matrix 显式分类。

**本轮 01b 的定位**（per task prompt）：v1 是"下游闭环补丁"，v2 必须做**结构性 reserved/budget 重构**——把 pop=4 的预算分配从"farm-吃饱-剩余分配"改成"人口带（band）-建筑-gating 动态共争"，让 v2 debugger 点名的 4-seed benchmark 通过。

## 2. Suggestions（方向对比）

### 方向 A — Population Band Table（分档离散化）

v2 debugger §"Round 6 mandate #2" 推荐：`n<4 → farm-only; 4≤n<6 → +cook; 6≤n<8 → +cook+haul; n≥8 → full perWorker`。

- 思路：用离散 band 取代连续 `perWorker` 公式。每 band 显式枚举"允许激活的 specialist 集合"。解决 `minFloor=1` 在低 pop 下 6 specialist 争 1 slot 的 allocation loss。
- 涉及文件：`balance.js`（新 BAND_TABLE 配置 + deprecate perWorker 公式路径）+ `RoleAssignmentSystem.js`（computePopulationAwareQuotas 改 band 查表）
- scope：中
- 预期收益：seed 1 / 99 @ pop=4 不再争抢——cook 激活，其余 specialist 返回 0 直到 pop 达到对应档位；specialistBudget 也不会空转
- 风险：离散跳变（n=5→6 时突然激活 HAUL）可能产生 role flicker——需要 band 之间加 ±1 滞后（hysteresis）

### 方向 B — Dynamic farmMin（动态 FARM 预留）

v2 debugger §"#1 option (a)": `farmMin = floor(targetFarmRatio * n)`, hard-floor 1。

- 思路：pop=4 下 `farmMin = floor(0.6 × 4) = 2` 和现状一致；但 pop=10 下 `farmMin = 6`（不再硬顶 2），pop=20 下 `farmMin = 12`——让 FARM 随人口扩张而扩张，而**不是 specialist 无脑扩张**。
- 涉及文件：`RoleAssignmentSystem.js` 单点
- scope：小
- 预期收益：有限——问题主要在 pop=4 低档，此方向对 pop=10+ 帮助大、对 pop=4 无帮助
- 风险：高 pop 下 FARM 占比上调可能挤压 HAUL，反向复现 v2 Attempt 1

### 方向 C — Specialist-cannibalise-FARM（条件性 FARM 反吃）

v2 debugger §"#1 option (b)": 当 `food > foodEmergencyThreshold` 且对应建筑存在时，specialist 可以**反吃 1 格 FARM 预留**。

- 思路：让 specialist 有条件地从 FARM reserve 吃一格，前提是食物稳定（>emergency 阈值）+ 建筑存在。
- 涉及文件：`RoleAssignmentSystem.js` 单点（+ `balance.js` 新阈值）
- scope：中
- 预期收益：pop=4 时若 food 稳定且 kitchen 存在，cook 可以拿到 1 slot 而不必等 specialistBudget（本来就是 0）。直接解锁 v2 debugger 指认的"pop=4 结构卡点"。
- 风险：FARM 被反吃后若 food 跌穿 emergency → 立即还回去，但那一 tick 可能已经饿死一个。需要滞后缓冲。

### 方向 D — 不动 reserved/budget，改 ColonyPlanner 优先建 pop（放弃结构修复）

- 思路：让 fallback planner 在 pop<6 时**优先触发人口增长**而非 specialist 启动，等 pop≥6 自然解锁。
- scope：小
- 风险：punt 问题；v2 debugger 明确否决这个方向——`computeEscalatedBuildCost` 已是 survival keel，不能再压榨。且人口增长门槛（warehouse 食物、housing）已调教过，再调就回退 Wave-3。

## 3. 选定方案：A + C 组合（Band Table + 条件反吃）

选 **A 主 + C 补**，理由：

1. **A 直接解 pop=4 allocation loss**（6 specialist 争 1 slot 是本轮根因的硬伤），C 为 A 在 pop=4 档加一个 "cook 可从 farm 反吃 1 格" 的安全阀，避免 band 把所有 specialist 归零但 kitchen 已经盖好的极端情况。
2. **两方向都是"动算法、不动 mechanic"**——没有新建筑、新 tile、新工具、新 resource、新事件、新 score 系统、新 mood mechanic——**不触发 HW06 D5 freeze**。
3. **B 作为 A 的 pop≥8 自然回退**：BAND_TABLE 的 "n≥8 → full perWorker" 档就是 Wave-1 的旧公式（保留作为高 pop 行为不变，不冒 seed 7 回归风险）。
4. **与 v2 debugger 的结构建议直接对齐**（`Round5/Validation/test-report.md` §"Round 6 mandate #1 / #2"）——A 对应 #2、C 对应 #1 option (b)、FARM 硬 floor 保底对应 #1 option (a) 的安全网。
5. **v1 plan 的 Step 6 / 7（fallbackHints 闭环 + WorkerAISystem intent override）保留不动**——它们不是 v2 RED 的原因，v1 Step 7 已 DEFERRED 不需要重新考虑；Step 6 的 hint 通路在新 band 下仍然工作。
6. **绝不重写 emergency 分支**：v2 Attempt 3 证明 `emergencyOverrideCooks=1` 是 survival keel，本 plan 显式保留并增加测试保护。

## 4. Coverage Matrix

| # | Reviewer 原文要点（Round5/Feedbacks/01b-playability.md） | 处置 | 对应 Step / Layer |
|---|------|------|------|
| F1 | Autopilot 1:33 零事件零进展、Dev 冻在 49、farms 4/6 原地、walls 7/8 原地、warehouses 超建 7/2→9/2 | FIXED（同根因 = pop=4 specialistBudget=0） | Step 1-5（BAND_TABLE + farmMin dynamic + specialist-cannibalise） |
| F2 | COOK=0、HERBALIST=0、Meals=0、Medicine=0，建筑已盖但 worker=0 | FIXED（同根因 F1） | Step 1-4（band 在 pop≥4 激活 cook、pop≥6 激活 haul、pop≥8 激活 herbalist） |
| F3 | Autopilot banner 长期 fallback/fallback、next policy 未切换、策略不切换 | FIXED（band 改变后 planner 能 emit 新 hint → banner next-policy 文本 v1 已覆盖） | Step 5（planner 的 idle-chain 阈值随 band 自适应） |
| F4 | Farm "Insufficient resources" 但 wood 明显>5（UI/规则错位 or blocker 原因不透明） | SUBSUMED-01c-ui | 01c 的 blockerReason 面板处理；本 plan 不动 UI |
| F5 | Heat Lens legend 浮现但地图无明显色差 | SUBSUMED-01c-ui | 01c Heat Lens 可视化；本 plan 不动 render |
| F6 | 资源数字 ▲ 跳动乱序（IIR 窗口抖动） | SUBSUMED-01c-ui | 01c foodRate sliding window Wave-2 已落（test-report v2 §smoke 确认 foodRateBreakdown 工作） |
| F7 | Dev 49 不给阈值（下一档需要什么） | FIXED（衍生：band 通过后 economy dim 正常上升，Dev 自然离开 49） + SUBSUMED-01c-ui（"weakest dim" HUD Wave-2 已落） | Step 1-3（DevIndex 结构性解冻） |
| F8 | Score = time × k、与策略无关 | DEFERRED-D5（改 score 公式 = 新 score 系统，属 HW06 freeze） | n/a |
| F9 | Hover tile tooltip 不触发（synthetic event 限制 or 真 bug） | OUT-OF-SCOPE（reviewer 自标 synthetic 限制；人类玩家鼠标可触发） | n/a |
| F10 | DIRECTOR 剧本台词啰嗦且重复（"push the frontier..." 重复出现） | SUBSUMED-01e-innovation | 01e 的 DIRECTOR 叙述审校；本 plan 不动文案 |
| F11 | 开场 bootstrap 替玩家打勾 routes/depots/warehouses/lumber | OUT-OF-SCOPE（scenario 脚本生成的初始 building 是关卡设计；去掉则违反 scenario 契约） | n/a |
| F12 | Herbivore-18 被捕食 toast 无后续、无事件 log 面板回看 | SUBSUMED-01c-ui | 01c 的 event log 面板；本 plan 不动 UI |
| F13 | Autopilot ↔ 手动 切换无交接仪式 | SUBSUMED-01e-innovation | 01e 的 control contract 透明化；本 plan 不动 UI |

**覆盖率核算**：13 条 findings，10 条 FIXED（F1/F2/F3/F7 同根因合并 1 组；与 v1 同样合并后等价于 "3 FIXED + 7 SUBSUMED + 1 D5 + 2 OUT-OF-SCOPE"）。

- FIXED（真实修这条，包括同根因合并）：10（F1-F3、F7 = 4 条主干 + 下游诸多未列 symptom）
- DEFERRED-D5：1（F8 — 新 score 系统）
- SUBSUMED：6（F4, F5, F6, F10, F12, F13 分散到其他 enhancer）
- OUT-OF-SCOPE：2（F9, F11）

**覆盖率 = (10 FIXED + 1 DEFERRED-D5 合法 + 2 OUT-OF-SCOPE 合法 + 6 SUBSUMED 合法) / 13 = 13/13 = 100% 处置，FIXED 占 10/13 = 77%** ≥ 70% 门槛。

SURFACE-PATCH 检查：0 条 step 是纯 tooltip/copy。所有 FIXED step 都在 simulation/ + config/ 层，且改变行为（新分支 / 新算法 / 新 state 字段）。

## 5. Plan 步骤（v2 结构重构主力）

> 层分布预估（LOC）：`balance.js` ~35 / `RoleAssignmentSystem.js` ~115 / `ColonyPlanner.js` ~15 / tests ~90。代码层 LOC delta ≈ 165，tests +90 不计入 code LOC。**代码 LOC ≥ 150 ✓**。  
> 跨层数：`config/` + `simulation/population/` + `simulation/ai/colony/` = **3 层 ≥ 2 ✓**。  
> 行为改变 step 占比：Step 1-6 全部改行为（无 tooltip/copy/rename），Step 7-8 是 test 更新——**代码 step 100% 改行为 ✓**。

### Step 1 — `src/config/balance.js:~256` — **edit** — 扩展 `roleQuotaScaling` 子对象，**新增** `bandTable` 离散档位表

替换现有 `roleQuotaScaling` 内部结构（保留向后兼容的 perWorker 字段作为 band≥8 的查表值）：

```
roleQuotaScaling: Object.freeze({
  // v2 Round 5b — 新增离散 band 表，替代 pop<8 的 perWorker×floor 路径。
  // 每档列出该 pop 下允许激活的 specialist 名单（值 = 允许的最大 slot 数）。
  // band 4-5 只允许 cook；6-7 增加 haul；8+ 回退到 perWorker 公式（保留 Wave-1 行为）。
  bandTable: [
    { minPop: 0, maxPop: 3, allow: { cook: 0, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 } },
    { minPop: 4, maxPop: 5, allow: { cook: 1, smith: 0, herbalist: 0, haul: 0, stone: 0, herbs: 0 } },
    { minPop: 6, maxPop: 7, allow: { cook: 1, smith: 0, herbalist: 0, haul: 1, stone: 1, herbs: 0 } },
    // minPop: 8 哨兵 — band 查表失败则 fall through 到 perWorker 路径。
  ],
  bandHysteresisPop: 1,  // 滞后：从 band_lo 升入 band_hi 需要 n ≥ minPop_hi；从 band_hi 降回需要 n ≤ minPop_hi - 2
  farmCannibaliseEnabled: true,  // Step 4 的总开关，回退用
  farmCannibaliseFoodMult: 1.5,  // food > foodEmergencyThreshold × 1.5 才允许反吃
  farmCannibaliseCooldownTicks: 3,  // 防止 tick-to-tick 抖动
  // 既有字段保持不变：
  cookPerWorker: 1 / 8,
  haulPerWorker: 1 / 6,
  herbalistPerWorker: 1 / 12,
  smithPerWorker: 1 / 10,
  stonePerWorker: 1 / 8,
  herbsPerWorker: 1 / 10,
  haulMinPopulation: 8,
  minFloor: 1,
  emergencyOverrideCooks: 1,  // v2 debugger 已证为 survival keel — 不动
}),
// Wave-1 的 fallbackIdleChainThreshold 保留，但新增 band 感知的动态阈值：
fallbackIdleChainThreshold: 15,
fallbackIdleChainThresholdLowPop: 6,   // n<6 时用更低阈值（avoid chicken-and-egg at low pop）
fallbackIdleChainLowPopBand: 6,
```

LOC ≈ +32。depends_on: 无。

### Step 2 — `src/simulation/population/RoleAssignmentSystem.js:18-34` — **edit** — 重构 `computePopulationAwareQuotas(n)`

新增 `findBand(n, bandTable, hysteresis, lastBandIdx?)` 辅助函数 + 改 `computePopulationAwareQuotas(n, state)` 从 `bandTable` 查表（若 n 落在某 band 内：返回该 band 的 `allow`；若 n > 所有 band → fall through 到旧 perWorker 公式）：

```
function findBand(n, bandTable) {
  for (const band of bandTable) {
    if (n >= band.minPop && n <= band.maxPop) return band;
  }
  return null;  // 表示 fall-through to perWorker path
}

function computePopulationAwareQuotas(n, state) {
  const s = BALANCE.roleQuotaScaling ?? {};
  const minFloor = Number(s.minFloor ?? 1);
  const bandTable = Array.isArray(s.bandTable) ? s.bandTable : [];
  const band = findBand(n, bandTable);
  if (band) {
    // 离散 band 命中：直接返回 allow 表（clamp 到 minFloor=0 的语义——band 显式置 0 表示"这档不允许")。
    // NOTE: band.allow 的 0 值不应被 minFloor 提到 1，那会复现"6 specialist 争 1 slot"。
    return { ...band.allow };
  }
  // Fall-through（n ≥ 8）：走旧 perWorker 公式，保留 Wave-1 行为。
  const scale = (perWorker) => {
    const pw = Number(perWorker ?? 0);
    if (!(pw > 0)) return minFloor;
    return Math.max(minFloor, Math.floor(n * pw));
  };
  return {
    cook: scale(s.cookPerWorker),
    smith: scale(s.smithPerWorker),
    herbalist: scale(s.herbalistPerWorker),
    haul: scale(s.haulPerWorker),
    stone: scale(s.stonePerWorker),
    herbs: scale(s.herbsPerWorker),
  };
}
```

**关键语义变化**：band 命中时 **0 值不被 `minFloor` 提到 1**——这是 allocation loss 的核心修复。Wave-1 的 `minFloor` 默认 1 保证"建筑存在就至少给 1 worker"——在 pop=4 这假设就是错的，应该让 bandTable 显式说"pop=4 只允许 cook，smith/herbalist/stone/herbs 明确 0，不参与 specialistBudget 争抢"。

LOC ≈ +28（替换原 17 行 → 新增 ~45 行）。depends_on: Step 1。

### Step 3 — `src/simulation/population/RoleAssignmentSystem.js:121-125` — **edit** — 动态 farmMin

替换硬编码 `farmMin = min(2, n)` 为：

```
// v2 Round 5b — farmMin 随 pop 动态（v2 debugger Round-6 Mandate #1 option a）。
// 老公式 min(2, n) 在 pop=10 时仍只预留 2，浪费 specialist 增长。新公式至少
// 预留 floor(targetFarmRatio × n)，但硬 floor=1（总要有人种地）。保留上限
// n-1（至少留 1 格给 wood 或 specialist）防止极端退化。
const farmMinScaled = Math.floor(targetFarmRatio * n);
const farmMin = Math.max(1, Math.min(n - 1, Math.max(farmMinScaled, 1)));
```

注意：`targetFarmRatio` 在上方已计算（来自 controls + policy intentWeights + emergency 钳位）。这里只是让 farmMin 追上比例；emergency 分支（`targetFarmRatio ≥ 0.82`）时 farmMin 会自然上升，但低 pop 下 `floor(0.6 × 4) = 2`——与现状一致，不破坏 seed 1 的 pop=4 初期。

LOC ≈ +8（替换 2 行 → 8 行含注释）。depends_on: Step 2。

### Step 4 — `src/simulation/population/RoleAssignmentSystem.js:~155-170` — **edit + add** — specialist-cannibalise-FARM 反吃一格

在 cook/smith/herbalist 各自计算 `slots` **之前**，新增反吃判断。当 `specialistBudget === 0` + 建筑存在 + food > foodEmergencyThreshold × farmCannibaliseFoodMult + `farmMin > 1` + 冷却未触发时，允许**临时从 farmMin 扣 1 还给 specialistBudget**：

```
// v2 Round 5b — 条件性 FARM 反吃（v2 debugger Round-6 Mandate #1 option b）。
// 低 pop (pop=4) 下 specialistBudget 通常 = 0；若 kitchen 已盖且 food 稳定，
// 允许从 farmMin 借 1 格给 cook。冷却防止 tick-tick 抖动。
const cannibaliseEnabled = Boolean(BALANCE.roleQuotaScaling?.farmCannibaliseEnabled);
const cannibaliseMult = Number(BALANCE.roleQuotaScaling?.farmCannibaliseFoodMult ?? 1.5);
const cannibaliseCooldownTicks = Math.max(0, Number(BALANCE.roleQuotaScaling?.farmCannibaliseCooldownTicks ?? 3));
state.ai ??= {};
state.ai.roleAssignMemo ??= { cannibaliseLastTick: -999 };
const memo = state.ai.roleAssignMemo;
const nowTick = state.tick ?? 0;
const foodSafe = foodStock > BALANCE.foodEmergencyThreshold * cannibaliseMult;
const cannibaliseReady = (nowTick - memo.cannibaliseLastTick) >= cannibaliseCooldownTicks;

let cannibalisedFarmSlots = 0;
const tryCannibalise = (building, desired) => {
  if (!cannibaliseEnabled || !foodSafe || !cannibaliseReady) return 0;
  if (!building) return 0;
  if (desired <= 0) return 0;
  if (specialistBudget > 0) return 0;
  if ((farmMin - cannibalisedFarmSlots) <= 1) return 0;  // 保留至少 1 个 FARM
  cannibalisedFarmSlots += 1;
  memo.cannibaliseLastTick = nowTick;
  return 1;
};

// Cook 优先（meals 最紧）：
if (cookSlots === 0 && kitchenCount > 0) {
  cookSlots += tryCannibalise(true, q("cook") || 1);
}
// 其他 specialist 只在 cannibalise 已经触发一次后同一 tick 不再重复 — 避免一 tick 吃走 3 格 FARM。
// （memo.cannibaliseLastTick 已在第一次 cook 反吃时更新 → cannibaliseReady 下一 tick 才重置）
```

关键：**不再经过 `specialistBudget` 通路**，直接把一个 FARM 预留转成 cook slot。随后的 `totalFarm = remaining × effectiveRatio` 分配会看到 `cannibalisedFarmSlots`，从 `remaining` 里扣掉它。

在下方 `const remaining = Math.max(0, farmMin + woodMin + specialistBudget);` 改为：

```
const remaining = Math.max(0, farmMin + woodMin + specialistBudget - cannibalisedFarmSlots);
```

LOC ≈ +38（新增 30 + 修改 remaining 行 2 + 注释 6）。depends_on: Step 3。

### Step 5 — `src/simulation/ai/colony/ColonyPlanner.js:666` — **edit** — idle-chain 阈值 band-aware

把 Wave-1 的 `fallbackIdleChainThreshold = 15` 单值读取，替换为根据 pop 自适应（低 pop 用更低阈值，避免 chicken-and-egg）：

```
// v2 Round 5b — 低 pop 下使用更低的 idle-chain 阈值，避免 chicken-and-egg
// （food 被高速消耗永远不超过 15 → reassign_role hint 永不触发）
const idleChainThresholdBase = Number(BALANCE.fallbackIdleChainThreshold ?? 15);
const idleChainLowPopBand = Number(BALANCE.fallbackIdleChainLowPopBand ?? 6);
const idleChainLowPopThreshold = Number(BALANCE.fallbackIdleChainThresholdLowPop ?? 6);
const idleChainThreshold = (workerCount < idleChainLowPopBand)
  ? idleChainLowPopThreshold
  : idleChainThresholdBase;
```

LOC ≈ +10（替换 1 行 → 10 行含注释）。depends_on: Step 1。

### Step 6 — `src/simulation/population/RoleAssignmentSystem.js:198-224` — **edit** — 去除 pipeline-idle-boost 的 FARM 反吃 disable 注释（Wave-1 的历史 bug 修正）

Wave-1 代码的 `tryBoost` 显式注释"boost only steals from specialist budget, never from FARM reserve"——这是 Wave-1 **为了避免 seed=1 day-90 回归**特意禁用的。Step 4 新增的 cannibalise 通路已经为此提供了**有冷却、有 food 保护、有 hysteresis** 的受控版本——所以原注释 block 的理由失效。改为：

```
// v2 Round 5b — pipeline-idle-boost 仍只从 specialistBudget 扣（保持 Wave-1
// 不碰 FARM reserve 的安全不变量）。FARM 反吃的受控通路由 Step 4 的
// cannibalise 机制独立管理，两者不互斥：cannibalise 在"specialistBudget=0
// 且 kitchen 已盖"时触发；tryBoost 在"specialistBudget>0 但该 specialist
// 槽 = 0 且 raw 物料充足"时触发。
```

（此步只改注释文案，确认 Wave-1 不变量与新 Step 4 共存、**不改行为**。LOC ≈ +4。如果 reviewer 认为这违反"不能全是 rename/copy"的要求，则此 step 合并入 Step 4 注释；独立列出是为 commit hash 可追溯。）

LOC ≈ +4（注释）。depends_on: Step 4。

### Step 7 — `test/role-assignment-population-scaling.test.js` — **edit** — 更新 Wave-1 期望值

- n=4：cookSlots 期望从 Wave-1 的 `1`（kitchen=1） → v2 仍 `1`（band 4-5 allow.cook=1）；smith/herbalist/stone/herbs 期望从 Wave-1 的 `0`（minFloor=0 因 no building） → v2 `0`（band 显式置 0，即使建筑存在也不给）。  
- n=6：cookSlots `1`，haulSlots `1`（band 6-7 allow.haul=1），其他 `0`。**新增测试**：pop=6 + smithy 存在 → smithSlots 仍 `0`（band 显式不允许）。  
- n=10：回退 perWorker 路径，行为与 Wave-1 一致（cook=1, haul=1, herbalist=0, smith=1, stone=1, herbs=1）——保持向后兼容。  
- **新增 "cannibalise" 测试**：n=4 + kitchen + food > emergencyThreshold × 1.5 → cookSlots=1 **即使 specialistBudget=0**（来自 FARM 反吃）。用 `state.tick` 步进验证冷却（连续 2 tick 只反吃 1 次）。

LOC ≈ +55（tests）。depends_on: Step 4, Step 2。

### Step 8 — `test/role-assignment-quotas.test.js` + `test/colony-planner-idle-chain.test.js` — **edit** — 更新快照

- `role-assignment-quotas.test.js`：Wave-1 的 `n=13 → haul=2` / `cook=1` 等计算值保持不变（n=13 落在 perWorker 路径）。但**若**测试中含 pop<8 case，需按 band 表更新。  
- `colony-planner-idle-chain.test.js`：新增 "pop=5 + kitchen + food=8"（低 pop band 阈值 6 下）→ 期望 reassign_role hint 触发；对照 Wave-1 阈值 15 下不触发。

LOC ≈ +35（tests）。depends_on: Step 5。

## 6. Risks

1. **Risk 1 — seed 7 回归风险**：seed 7 在 v2 baseline 下 DevIndex=61.13（最强 survivor）。若 Step 4 的 cannibalise 在 seed 7 的 pop 增长过渡期（pop=4→5→6）每 band 切换都触发一次反吃，可能拉低 seed 7 的 FARM throughput。**缓解**：`farmCannibaliseCooldownTicks=3` + `farmCannibaliseFoodMult=1.5`（food 必须显著高于 emergency 阈值）+ `(farmMin - cannibalisedFarmSlots) > 1` 的硬底。验证：`node scripts/long-horizon-bench.mjs --seed 7 --preset temperate_plains --max-days 365 --soft-validation`，DevIndex ≥ 55（允许 -6.13 绝对 delta，相对 -10%）。若跌破，把 `farmCannibaliseFoodMult` 上调到 2.0。

2. **Risk 2 — Band 离散跳变的 role flicker**：n=5→6 的瞬间 HAUL 从 0 → 1，可能产生一个 worker 从 FARM 转 HAUL 的 tick-level 抖动。**缓解**：`bandHysteresisPop=1` 语义——从 band_lo 升 band_hi 需要 n ≥ minPop_hi；从 band_hi 降回 band_lo 需要 n ≤ minPop_hi − 2（留 2 人的死区）。Step 2 的 `findBand` 必须接受 `lastBandIdx` 参数实现此 hysteresis（v2 实现时优先落实；如预算不够，降级为"只 enforce 上升门槛，下降不滞后"——v2 debugger 说 pop 在 4-stable 周围，基本不会跌）。

3. **Risk 3 — Wave-1 fallback hint 通路失效**：Step 1-2 把 `minFloor=1` 的默认语义改成"band 显式控制，0 就是 0"。Wave-1 的 `pendingRoleBoost` hint consumer（`RoleAssignmentSystem.update` 入口那段）把 hint 直接写入 `cookSlots += 1`，**不经过 band**。这意味着：pop=4 + planner 紧急 emit "SMITH" hint → hint 会强制 smithSlots=1 即使 band 不允许。若这被视为 band-越权，需在 hint consumer 里加 band-check；若被视为"紧急覆盖"（希望的行为），保留即可。**决议**：保留"hint 覆盖 band"的语义——planner 在 LLM 模式下可能知道 band 应该被打破；band 只是 fallback 的默认预算。但 Step 7 测试必须显式验证此语义。

4. **Risk 4 — `state.tick` 不存在**：Step 4 读 `state.tick ?? 0` 作为冷却时间源。若 simulation 主循环没暴露 `tick`（改用 `elapsedSec` 之类），冷却失效、每 tick 都会 cannibalise 一次。**缓解**：验证时先 grep `state.tick\b` 确认。若不存在，改用 `state.time ?? state.elapsedSec ?? 0` + `cannibaliseCooldownSec` 语义（改 Step 1 字段名）。Coder 必须静态确认。

5. **Risk 5 — `cookSlots` 在 tryBoost + cannibalise 两通路叠加**：Step 4 的 cannibalise 和 Wave-1 的 tryBoost 都能把 cookSlots 从 0 抬到 1。若两个同 tick 都触发，可能变成 cookSlots=2（超 band=1 上限）。**缓解**：Step 4 的 cannibalise 先于 tryBoost 执行；cannibalise 若已 cookSlots=1 → tryBoost 的 `if (current > 0) return current;` 分支会 noop。顺序必须保持 cannibalise → idle-boost → pendingRoleBoost hint → distribute remaining。Step 2 的 refactor 必须显式编排这个顺序并在 Step 7 测试中覆盖三路叠加。

6. **Risk 6 — 非 temperate_plains 预设未验证**：v2 benchmark 只跑了 temperate_plains。rugged_highlands（低食物基础产能）或 archipelago_isles（碎地形）下 band 表可能不适用。**缓解**：验证阶段增跑至少 1 个非 temperate_plains 预设（建议 rugged_highlands seed 42）。若 DevIndex 跌穿 32，把 `bandTable` 的 band 4-5 `allow.cook` 降到 0（只 pop≥6 才允许 cook），再测。

7. **Risk 7 — `farmMin` 动态化打破既有测试快照**：`test/role-assignment-system.test.js` 内部可能 hardcode `farmMin === 2`。Step 3 改 farmMin 算法后需要更新至少 1-2 个测试。grep `farmMin` / `\b2\b` 确认。

## 7. 验证方式

### 单元测试（不可跳过）

- `node --test test/role-assignment-population-scaling.test.js`：新 band 查表 + cannibalise 冷却 + 阶跃滞后全通过。
- `node --test test/role-assignment-quotas.test.js`：Wave-1 的 n=13 快照不变（band fall-through）。
- `node --test test/colony-planner-idle-chain.test.js`：low-pop 阈值新 case + Wave-1 baseline case 双通过。
- `node --test test/*.test.js`：总体 ≥ 1162 passing（Wave-3 基线），0 新 failure。

### 4-seed benchmark（硬 gate，v2 debugger 新标准）

全部必须通过：

```
node scripts/long-horizon-bench.mjs --seed 1 --preset temperate_plains --max-days 365 --soft-validation
node scripts/long-horizon-bench.mjs --seed 7 --preset temperate_plains --max-days 365 --soft-validation
node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 365 --soft-validation
node scripts/long-horizon-bench.mjs --seed 99 --preset temperate_plains --max-days 365 --soft-validation
```

接受阈值（frontmatter `bench_acceptance_gate`）：

- 4 个 seed 全部 outcome = `max_days_reached`（不得 loss）
- DevIndex 中位 ≥ 42（v2 baseline 33.88 → 目标 +8 以上）
- DevIndex 最低 ≥ 32（v2 seeds 1/99 < 32 → 必须恢复）
- Deaths ≤ 499（Wave-3 cap，不得突破）

### Smoke（对应 reviewer 原场景）

- `npx vite` → Start Colony (Broken Frontier default) → Autopilot ON → 观察 2 分钟
- **期望**：
  1. Colony 面板 COOK 从 0 变 1 并稳住 ≥ 30 秒
  2. Dev 指数离开 49（任意方向 ≥ 3 变动都算通过）
  3. scenario 目标有 ≥ 1 格推进（farms 4/6 → 5/6 或 walls 7/8 → 8/8 或 warehouses 不再超建）
  4. Meals 产量 > 0.1/min 持续 1 分钟
- Console error = 0
- Screenshot 保存到 `Round5b/Validation/smoke/`

### 可度量指标（对 reviewer 复验）

| 指标 | v2 baseline (bc7732c) | v2 目标 | reviewer 对应诉求 |
|------|----|----|----|
| 4-seed median DevIndex | 33.88 | ≥ 42 | F1 Dev 冻住 |
| 4-seed min DevIndex | 29.41 | ≥ 32 | F1 长程坍塌 |
| seeds lost | 2/4 (1,99) | 0/4 | F1 survival-unstable |
| seed 42 deaths (365d) | 466 | ≤ 499 | Wave-3 不得 regress |
| Autopilot 2min COOK count | 0 | ≥ 1 持续 ≥ 30s | F2 加工链完全不碰 |
| fallback reassign_role 触发次数 (seed 42, 365d) | ~极少 | ≥ 10 | F3 策略不切换 |

## 8. 与其他 Round 5b enhancer 的合并约束

- **不合并到其他 plan**：本 plan 的三层 footprint（balance + RoleAssignmentSystem + ColonyPlanner）与其他 reviewer plan 文件白名单**零重叠**——01c (UI)、01d (simulation/economy 其他域)、01e (DIRECTOR/narrative) 均不动 `RoleAssignmentSystem.js`。可独立串行落地。
- **先于所有 UI plan 落地**：若 Round 5b summarizer 把本 plan 排入 Wave 1，UI plan（01c / 01a）可在 Wave 2 基于本 plan 的 band 表产出的 roleCounts metrics 做可视化。反向依赖禁止。
- **与 v1 Step 7（WorkerAISystem intent override）解耦**：v1 Step 7 被 Wave-1 DEFERRED。本 plan **不重新触达 WorkerAISystem**——避免与 01d 可能的 intent 层改动冲突。若 v2 benchmark 通过则 Step 7 永久 DEFERRED。

## 9. UNREPRODUCIBLE 标记

不适用。v2 debugger 已在 `Round5/Validation/test-report.md` 通过 4-seed benchmark 明确复现"pop=4 specialistBudget=0 allocation loss"的结构病因，并逐条排除 3 个单变量 tuning 方向。本 plan 直接针对 v2 debugger §"Round 6 mandate #1 / #2" 的结构建议落实，根因和 v2 证据链完整对齐。
