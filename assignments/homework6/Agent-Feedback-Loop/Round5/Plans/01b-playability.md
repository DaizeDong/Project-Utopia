---
reviewer_id: 01b-playability
feedback_source: Round5/Feedbacks/01b-playability.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~180
  new_tests: 2
  wall_clock: 75
conflicts_with: []
---

## 1. 核心问题

**锁定 P0-1: fallback AI 配额反馈闭环缺失，导致 Autopilot 下殖民地 1:33 内零事件零进展、DevIndex 冻在 49。**

Reviewer 的三个直接症状 ——（a）Autopilot banner 常年 `fallback/fallback - next policy in X.Xs` 但剧本目标静止、（b）Colony 面板 COOK=0 / HERBALIST=0 / Meals=0 / Medicine=0 纵使 Kitchen/Clinic/Smithy 按钮都可见、（c）warehouses 7/2 → 9/2（超建同一类）+ lumber 3/3 → 5/3（超建）—— 在系统层指向同一条链：

1. **root cause A (配额不随人口增长)**：`src/simulation/population/RoleAssignmentSystem.js:62` 把 `roleQuotas` 默认值硬编码为 `{cook:1, smith:1, herbalist:1, haul:1, stone:1, herbs:1}`。n=13 workers 时，FARM 吃掉 11 个槽位，COOK/HAUL 在 `cookSlots = Math.min(q("cook"), specialistBudget)` 下最多 1。人口扩到 20、25 时，比例不变——COOK 永远 1，HAUL 永远 1，整个 food→meal→warehouse→deposit 管道被单人管道卡死（summary.md 第 40-42 行自己标注的 bug 根）。
2. **root cause B (fallback planner 没有"挖空职位"的反压信号)**：`src/simulation/ai/colony/ColonyPlanner.js:480 generateFallbackPlan` 在 kitchen/clinic/smithy 已存在但 **无对应职业 worker** 时**不会**触发任何动作——它只看建筑数（`kitchens === 0`）。结果 Kitchen 盖起来就被"打勾"，但 Meals 产出永远 0。这和 reviewer "目标已经'自动完成'了一半"+"加工链完全不碰"的观察吻合。
3. **root cause C (demand-driven reassignment 不存在)**：没有任何系统在 "foodRate < 0 && kitchens > 0 && cookWorkers === 0" 时把一个 FARM worker 临时升级成 COOK。`RoleAssignmentSystem` 每 `managerIntervalSec`=1.2s 重算，但纯按 quota 表，对**实际产出缺口**不敏感。

这**不是**"加 tooltip / 加 toast / 加音效 / 加教程弹窗"能修的表面症状。Reviewer 明确写："系统内部 (per CHANGELOG-style 说辞) 可能在跑 yieldPool、fatigue、salinization 一堆东西，但没有一个 surface 给玩家"——本 plan 明确拒绝"给 surface"方向，而是修 **fallback AI 的 demand→role→production 闭环本身**，让加工链真的开工，这样 Meals/Medicine/Tools 自己会产出、Dev 指数自己会动、reviewer 第二次跑 Autopilot 1:33 就能看到变化。

## 2. Suggestions（可行方向）

### 方向 A: 人口按比例缩放默认 roleQuotas + fallback planner 新增 idle-chain 触发器

- 思路：在 `RoleAssignmentSystem` 把 quota 从"硬编码 1"改成"按 n 缩放的 population-aware formula"（e.g. cook=ceil(n/8), haul=ceil(n/10), herbalist=ceil(n/12)），并在 `ColonyPlanner.generateFallbackPlan` 插入新优先级 "idle processing chain" —— 当 kitchen 存在但 `cookWorkers < 1` 时生成一条"reassign_role"pseudo-step（不建筑，仅 tag 给下一轮 RoleAssignmentSystem 读），反向驱动 quota 上调。
- 涉及文件：`src/simulation/population/RoleAssignmentSystem.js`、`src/simulation/ai/colony/ColonyPlanner.js`、`src/config/balance.js`（新增 BALANCE.roleQuotaScaling 配置块）
- scope：中
- 预期收益：直接解锁 meals/medicine/tools 产出 → Dev 指数离开 49，Autopilot 1:33 内 farms 4/6 → 5-6/6（因为 COOK 真的在做饭，FARM 产出被消费成 meals，空出循环压力让 fallback planner 继续盖）
- 主要风险：quota 缩放公式调大可能挤压 FARM 数量 → 短期 food 产出下降。需要在 `effectiveRatio` 动态平衡里加保底（emergency 模式下 cook/smith 被强制回 1）。会触及 `role-assignment-quotas.test.js`、`role-assignment-system.test.js`、`phase1-resource-chains.test.js` 三个测试的快照值——需要更新预期 n=13 下的 {cook,haul,herbalist} 分配结果。

### 方向 B: 在 chooseWorkerIntent 里加 "opportunistic role switch" 临时角色

- 思路：不动 RoleAssignmentSystem，改在 `WorkerAISystem.chooseWorkerIntent` 里加一段：如果 `worker.role === ROLE.FARM && state.buildings.kitchens > 0 && state.resources.food > 20 && countWorkersByRole(state, ROLE.COOK) === 0`，返回 "cook" intent（worker 临时走到 kitchen，本次 tick 不改 role 字段）。类似逻辑覆盖 SMITH / HERBALIST / HAUL。
- 涉及文件：`src/simulation/npc/WorkerAISystem.js`、`src/simulation/npc/state/StatePlanner.js`（`deriveWorkerDesiredState` 需要镜像该 override）
- scope：中
- 预期收益：即时生效、不等 1.2s manager tick。Autopilot 打开后 FARM worker 看到 Kitchen 就自动来做一批饭。
- 主要风险：绕过 role field 会和 StatePlanner 的 `noWorkSite` 判断打架；intentWeights policy 机制也会介入（POLICY_INTENT_TO_STATE 只 map `cook`→`seek_task`），造成 intent-weights dashboard 和 reviewer 看到的"这个人到底在干嘛"再次不一致。更隐蔽也更脆弱。

## 3. 选定方案

选 **方向 A**，理由：

- **结构修复，不是 hack**：root cause 就在"quota 不随 n 缩放"这一行 hardcode 上——方向 A 直接动那行，而方向 B 是在下游打补丁绕开它。
- **与 `state.controls.roleQuotas` 的玩家 slider 接口一致**：当前 RoleAssignmentSystem.js:62-63 已经有"player-exposed sliders"的扩展位，方向 A 只是把**默认值**从"静态 1"换成"population-aware formula"，滑块仍然可以 override，不引入新 mechanic。
- **fallback planner 新增的 `reassign_role` 触发器不是新 mechanic**：它就是 ColonyPlanner 已有的 `steps.push({type: "skill", ...})` 模式的复用，只是输出的 "action" 被 RoleAssignmentSystem 读为"quota 临时上调一档"。不碰 LLM 路径、不破坏 validatePlanResponse、不改 SKILL_LIBRARY。
- **不违反 HW06 freeze**：只改现有 fallback planner 的配额逻辑 / 平衡参数 / state 转换——与任务要求"允许修现有 fallback planner 的配额逻辑 / 平衡参数 / state 转换"正字面对齐。
- **方向 B 会造成 StatePlanner 的 intent→state 映射二次漂移**：summary 第 137 行要求 enhancer 触达 `ColonyPlanner` / `StatePlanner` / `WorkerAISystem` ≥1 个；方向 A 触达 `ColonyPlanner` + `RoleAssignmentSystem`，更稳定。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/balance.js:~140` (在 `objectiveFarmRatioMax` 之后) — **add** — 新增 `roleQuotaScaling` 配置块：`roleQuotaScaling: Object.freeze({ cookPerN: 8, smithPerN: 12, herbalistPerN: 14, haulPerN: 10, stonePerN: 10, herbsPerN: 14, minFloor: 1, emergencyOverrideCooks: 1 })`。附带 JSDoc 注释说明"how many workers per specialist role"。同一块区域新增 `fallbackIdleChainThreshold: 15`（food 储量门槛，kitchen 存在时 fallback 生成 reassign 触发器）。
- [ ] **Step 2**: `src/simulation/population/RoleAssignmentSystem.js:62` — **edit** — 把 `state.controls?.roleQuotas ?? { cook: 1, smith: 1, ... }` 的 fallback 默认值替换为一个新辅助函数 `computePopulationAwareQuotas(n, state)` 的返回值。该函数位于同文件顶部（`import` 之后、`clamp` 之前）**add**：读取 BALANCE.roleQuotaScaling，按 `Math.max(minFloor, Math.ceil(n / cookPerN))` 等公式返回 `{cook, smith, herbalist, haul, stone, herbs}`。保留 `state.controls?.roleQuotas` 显式覆盖（玩家 slider）优先级，仅在缺省时走新公式。
  - depends_on: Step 1
- [ ] **Step 3**: `src/simulation/population/RoleAssignmentSystem.js:89` (`emergency` 分支附近) — **edit** — 当 `state.resources.food < BALANCE.foodEmergencyThreshold` 时，把 `cookSlots` / `smithSlots` / `herbalistSlots` 下调到 `BALANCE.roleQuotaScaling.emergencyOverrideCooks`（1）并把释放的 budget 全部倒回 FARM。当前代码的 emergency 分支只改 `effectiveRatio`，没收 specialist 槽位——这是短期饥饿时 Meals 流水线无意义占人的直接 bug。
  - depends_on: Step 2
- [ ] **Step 4**: `src/simulation/population/RoleAssignmentSystem.js:~100` (在 `totalFarm / totalWood` 计算后) — **add** — 新增 "pipeline-idle quota boost"：如果 `kitchens >= 1 && cookSlots === 0 && state.resources.food >= BALANCE.fallbackIdleChainThreshold && foodRate >= 0`，强制 `cookSlots = 1` 并从 FARM 分配中扣 1。同样逻辑对 smithy（需要 stone >= 5）和 clinic（需要 herbs >= 3）。这修 reviewer 观察到的"建筑有、worker 永远 0"症状。
  - depends_on: Step 3
- [ ] **Step 5**: `src/simulation/ai/colony/ColonyPlanner.js:generateFallbackPlan` — **edit** — 在 Priority 3.5（line 586, `kitchens === 0` 分支）**之后**、Priority 4 之前，新增 **Priority 3.75 "idle processing chain"**：如果 `kitchens >= 1 && (state.metrics?.roleCounts?.COOK ?? 0) === 0 && food >= BALANCE.fallbackIdleChainThreshold`，**push** 一条 `{type: "reassign_role", role: "COOK", priority: "high", thought: "Kitchen exists but no cook — pipeline idle"}`。对应在 `VALID_BUILD_TYPES` 构造位置（ColonyPlanner.js:168）把 `"reassign_role"` 加进白名单（或走独立 validator 分支）。注意：该 action type 不扣资源、不放建筑——PlanExecutor 读到时仅 tag `state.ai.fallbackHints.pendingRoleBoost = "COOK"`，RoleAssignmentSystem 下一 tick 读取后 cookSlots += 1。
  - depends_on: Step 4
- [ ] **Step 6**: `src/simulation/population/RoleAssignmentSystem.js:update` — **edit** — 在函数开头读取 `state.ai?.fallbackHints?.pendingRoleBoost`，若存在则按 hint 单次上调对应 slot 后清空。构成 ColonyPlanner → state.ai → RoleAssignmentSystem 的闭环反馈通路。
  - depends_on: Step 5
- [ ] **Step 7**: `src/simulation/npc/WorkerAISystem.js:chooseWorkerIntent` (line 249-256 role 分支附近) — **edit** — 把当前"worker.role === ROLE.FARM && 有 farms → 返回 farm" 硬编码加上一个 override：若 `(worker.role === ROLE.COOK || ROLE.SMITH || ROLE.HERBALIST) && noWorkSite === true`，**不要** 立即 fallthrough 到 wander/explore_fog；如果 `state.resources` 对应的 raw 资源 >= 0（食物/石头/草药），先 return "haul"（让该 worker 去搬运），避免 reviewer 说的"COOK=0 但有 3 个工人站那儿闲着"。保留现有 noWorkSite fallthrough 语义仅针对 FARM/WOOD。
  - depends_on: Step 6
- [ ] **Step 8**: `test/role-assignment-quotas.test.js` / `test/role-assignment-system.test.js` — **edit** — 更新 n=13 / n=20 下的 expected slot 计数（现在 cook 会是 2、haul 会是 2），并新增 case：当 `state.ai.fallbackHints.pendingRoleBoost = "COOK"` 时验证 cookSlots 被临时 +1 且 hint 被清空。同时**新增** `test/colony-planner-idle-chain.test.js` **(create)** 覆盖 "kitchen+0 cook+food≥15 → 生成 reassign_role step"。
  - depends_on: Step 7

## 5. Risks

- **Risk 1 — 测试快照大面积变色**：`role-assignment-quotas.test.js`、`role-assignment-system.test.js`、`phase1-resource-chains.test.js` 里 n=13 / n=20 预期值会全部偏移（cook 1→2, haul 1→2, herbalist 1→1 不变）。Coder 必须重新计算 expected 值，而不是压制测试——Step 8 显式要求更新，但测试作者意图需要 grep 检查 `// expected cooks: 1` 这类注释来确认不是在 assert 某个不变量。
- **Risk 2 — FARM 被稀释导致 Phase 10 long-horizon 回归**：当前 ColonyPlanner/RoleAssignmentSystem 是 balanced 到 day-365 survival 的；增加 cook/haul 挤压 FARM 可能让 `scripts/long-horizon-bench.mjs` seed 42 下的 day-90 DevIndex 回落。**验证必须跑 benchmark**；如果 DevIndex delta < -5%，回退 Step 4 的 threshold（`fallbackIdleChainThreshold: 15 → 25`）。
- **Risk 3 — `reassign_role` action 在 PlanExecutor 里无对应 handler**：Step 5 新增的 pseudo-action 需要 PlanExecutor（未读全）识别并跳过而不是报错。Coder 必须打开 `src/simulation/ai/colony/PlanExecutor.js`，把 "reassign_role" 加到 noop-but-hint 分支（如果 PlanExecutor 已有 `step.status = "skipped"` 分支，只需扩展白名单）。
- **Risk 4 — pendingRoleBoost 被覆盖式清空**：Step 6 在 RoleAssignmentSystem update 里清空 hint，但 ColonyPlanner 的 cooldown 是 20s、RoleAssignmentSystem 的 interval 是 1.2s——hint 会在 planner 还没下一轮时就被消费掉，可能导致"1 次 reassign 就 ok 了，实际一帧后 cook 又饿死再次跳回 FARM"。需要加 `pendingRoleBoostTtlSec` 或把 cookSlots 的上调做成 N-tick sticky。
- **Risk 5 — 可能影响的现有测试**：`test/role-assignment-quotas.test.js`, `test/role-assignment-system.test.js`, `test/phase1-resource-chains.test.js`, `test/colony-planner.test.js`, 以及任何 `test/long-fallback-*.test.js`（如存在）。Coder 跑 `node --test test/*.test.js` 先看全量红点再决定策略。

## 6. 验证方式

- **新增测试 1**: `test/role-assignment-population-scaling.test.js` 覆盖 "n=10 默认 cookSlots=1, n=20 默认 cookSlots=2 (ceil(20/8)=3 但受 specialistBudget 限制回落), n=5 默认 cookSlots=1 但 kitchen=0 时 cookSlots=0"。
- **新增测试 2**: `test/colony-planner-idle-chain.test.js` 覆盖 "kitchen=1 + cookWorkers=0 + food=20 → fallback plan 含 reassign_role step"，以及 "kitchen=1 + cookWorkers=1 → 不生成 reassign_role" 的反向 case。
- **手动验证**（对应 reviewer 原场景）：`npx vite` 启动 → Start Colony（default scenario "Broken Frontier"）→ 打开 Autopilot → 等 1:33 → 期望看到：(a) Colony 面板 COOK 从 0 变 1-2，(b) Meals 产出 > 0.1/min，(c) Dev 指数从 49 **离开**（任意方向变动 ≥ 3 都算通过），(d) scenario 目标 farms 和 walls **至少一项** 有进展（4/6 → 5+/6，或 7/8 → 8/8）。
- **benchmark 回归**: `node scripts/long-horizon-bench.mjs --seed 42 --scenario temperate_plains --days 90`，DevIndex 不得低于当前基线 `(约 44) - 5% = 41.8`；若加了此 plan 后 DevIndex 上升到 ≥ 50 则达成 summary.md 第 138 行"DevIndex 离开 37.8 至 X"的可度量目标。
- **可度量指标**：
  1. **fallback AI 10 分钟 Meal 产量 ≥ 5**（基线 0）。
  2. **fallback AI 10 分钟 COOK worker 分配数最大值 ≥ 1 持续 > 60 秒**（基线长期 0）。
  3. **DevIndex 90 天 ≥ 50**（基线 44）。
  4. **Autopilot 1:33 内 scenario 目标推进 ≥ 1 格**（基线 0，reviewer 亲测）。

## 7. UNREPRODUCIBLE 标记

不适用。Reviewer 的核心观察（Autopilot ON → 1:33 → farms 4/6 原地、COOK=0、Dev=49）**可通过纯静态读码复现**：在 `RoleAssignmentSystem.js:62` 读到 `cook:1` 默认值 + 没有任何 demand 反馈 + ColonyPlanner kitchen 触发器只看 `kitchens === 0` 三处代码直接推得"kitchen 盖起来就停止介入、cookSlots 永远上限 1、meal 管道永久单人瓶颈"，本轮不需要 Playwright 二次采证。
