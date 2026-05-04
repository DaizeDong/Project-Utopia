---
reviewer_id: A5-balance-critic
reviewer_tier: A
feedback_source: Round3/Feedbacks/A5-balance-critic.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 5
  loc_delta: ~+80 / -40
  new_tests: 2
  wall_clock: 90
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **autopilot 食物活锁** — "Recovery: food runway unsafe → expansion paused → farm 不放 → food 继续掉" 在 3 张地图、3 个 seed、3 局上 100% 复现。`maybeTriggerRecovery` 把 farm 当 "expansion" 而非 "recovery essential"，把 farm 放置一并禁了。修法：`expansion paused` 必须**白名单 farm/lumber/warehouse**（recovery essential）。
2. **食物速率 13× 偏差** — recovery toast 显示 `-509.5/min`，Resource panel 显示 `-39.7/min`，相差 13×。同一口径不一致 → 玩家恐慌。根因可能是 toast 用瞬时窗口 vs panel 用滑窗 5s 平均；统一到同一 sampler 即可。
3. **map 同质化** — Plains 与 Riverlands 的 scenario goals 完全相同 (routes 0/1, depots 0/1, warehouses 0/2, farms 0/6, lumber 0/3, walls 0/8)，违背模板命名。`ScenarioFactory` 应给 Riverlands 不同的 goal table（多 farm + 多 bridge + 少 wall）。

## 2. Suggestions（可行方向）

### 方向 A: 三处定点修复（recovery 白名单 + food rate 同源 + Riverlands goal 差异）

- 思路：
  1. ProgressionSystem `maybeTriggerRecovery` 把 "expansion paused" 加白名单：farm / lumber / warehouse / road 这 4 类不算 expansion，AgentDirector / fallback planner 仍可放置；
  2. HUDController 食物 rate 文案改读与 Resource panel 同一 sampler（搜 "food runway" 或 "net -" 字符串源），消除 13× 偏差；
  3. ScenarioFactory Riverlands 模板给独立 goal table（farms 0/8、bridge 0/2、warehouses 0/2、lumber 0/2、walls 0/4、routes 0/1）以体现湿地特色。
- 涉及文件：`src/simulation/meta/ProgressionSystem.js`、`src/ui/HUDController.js`、`src/world/scenario/ScenarioFactory.js`、`src/config/balance.js`（如 goal table 在此）
- scope：中
- 预期收益：autopilot 60s 内放第一座 farm；玩家不再看到 13× 假警报；Riverlands ≠ Plains。
- 主要风险：白名单可能让 director 在 food 危机时仍铺 wall（若 wall 也走 recovery）—— 必须严格只白名单 4 类；同源 sampler 若未来重构 ResourceSystem 可能错位。
- freeze 检查：OK（无新 mechanic / role / building；只调决策树 + 文案 + scenario goal table 数值）

### 方向 B: 仅修 P0-1 (food deadlock)

- 思路：仅 Step 1 落地。
- scope：小
- 预期收益：解 1/3 P0；其余仍未关。
- 主要风险：Reviewer 列 P0 4 条，不达 verdict 升级条件。
- freeze 检查：OK

### 方向 C: 修复 + 改 BALANCE.* (默认 COOK/HERBALIST/SMITH 角色权重 ≥1)

- 思路：在方向 A 基础上加 RoleAssignmentSystem 默认权重不为 0（A5 P0-4）。
- scope：中
- 预期收益：加工链有概率启动。
- 主要风险：RoleAssignment 权重改动可能与 v0.10.1-m balance overhaul 冲突；最近 commit 已经在调权重；本轮 freeze conservatism 倾向最小改动。
- freeze 检查：OK 但可能与 v0.10.1-m 决策冲突。

## 3. 选定方案

选 **方向 A**。理由：(a) Reviewer P0 列 4 条，方向 A 关 3 条（autopilot deadlock + 13× 假警报 + map 差异），P0-3 (t=0-60s 内必有 farm) 是 deadlock 修好后自然达成；(b) P0-4 (默认角色权重) 与 v0.10.1-m 已落改动相关，本轮不再继续动；(c) 方向 B 关 1/4 不够；(d) 方向 C 范围扩到 v0.10.1-m 的 RoleAssignmentSystem 风险高。

## 4. Plan 步骤

- [ ] Step 1: `src/simulation/meta/ProgressionSystem.js:maybeTriggerRecovery` (Grep 定位：`grep -n "maybeTriggerRecovery\|expansion paused\|food runway" src/simulation/meta`) — edit — 在 recovery 决策处把 "expansion paused" 文案后追加白名单：`const RECOVERY_ESSENTIAL = new Set(["farm", "lumber", "warehouse", "road"]);` 并在 fallback planner / autopilot Plan 入口检查 `if (RECOVERY_ESSENTIAL.has(buildType)) bypass expansion-pause gate;`，或导出 `state.recovery.essentialOnly = true` 让 ColonyPlanner 优先这 4 类。
- [ ] Step 2: `src/simulation/ai/colony/ColonyPlanner.js` (或 fallback planner 入口；Grep `expansion paused\|recovery`) — edit — 当 `state.recovery.essentialOnly === true`，过滤 build proposals 仅保留 farm/lumber/warehouse/road，**保证 farm 永远可放**（不把 farm 与 wall 一并 expansion-pause）。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/HUDController.js` (food rate 文案；Grep `net -\|food runway\|/min`) — edit — 把 "food runway" toast 与 Resource panel 共享同一 sampler；定位 `state.metrics.foodNetRate` 或类似字段，确保两处都读同一字段。如果一处用瞬时差分而另一处用滑窗 5s 均值，统一到滑窗 5s 均值。
- [ ] Step 4: `src/world/scenario/ScenarioFactory.js` (Riverlands 模板；Grep `riverland\|fertile`) — edit — 把 Riverlands `goals` 表改为独立：`farms 0/8`, `lumber 0/2`, `walls 0/4`, `bridges 0/2`, `warehouses 0/2`, `routes 0/1`（差异化 farms +33%、walls -50%）。
- [ ] Step 5: `test/recovery-essential-whitelist.test.js` — add — 测试：spawn 12 worker + 320 food + 0 farm，强制触发 recovery（设 food = 50），让 autopilot run 90 sim-sec，assert `state.buildings.filter(b => b.type === "farm").length >= 1`。
  - depends_on: Step 1, Step 2
- [ ] Step 6: `test/food-rate-consistency.test.js` — add — 测试：构造 state 让 food 在 5s 内净减 200 → toast 文案的 `/min` 与 Resource panel `/min` 应在 ±10% 内（不再 13×）。
  - depends_on: Step 3
- [ ] Step 7: `test/scenario-riverlands-goals.test.js` (或扩 existing scenario test) — edit — 锁住 Riverlands.goals.farms = 8、bridges = 2，与 Plains.goals.farms = 6 不同。
  - depends_on: Step 4

## 5. Risks

- ProgressionSystem.js R2 已 +59 LOC（C1 标 debt-prog-2 加重），再加白名单逻辑会持续累积 sub-system；Mitigation: 用 const Set 形式 + 1 个 helper `isRecoveryEssential(type)` 维持单一 if-block，控制 LOC 增量 < 25。
- ColonyPlanner 是 D 级 (1867 LOC)，触一处可能波及多个 path；Mitigation：仅在 essentialOnly 路径加分支。
- Riverlands goal table 改动可能让既存 long-horizon benchmark monotonicity 失败；Mitigation：scope test seed 固定，benchmark 跑前后对比 monotonicity_ratio 不低于 baseline -10%（Riverlands 不在默认 seed42 path）。
- 可能影响的现有测试：`test/long-horizon-bench-*.test.js`、`test/scenario-*.test.js`、`test/progression-*.test.js`。

## 6. 验证方式

- 新增测试：上述 3 个。
- 手动验证：`npx vite` → 新开 Plains autopilot → 等 90 sim-sec → 期望屏幕显示 ≥1 farm tile + recovery toast 不再阻 farm；按 Riverlands 模板新开 → 顶栏 chip 显示 `farms 0/8 bridges 0/2`（不同于 Plains）；触发 food crisis → toast 与 Resource panel 速率读数一致。
- FPS 回归：未触主循环 hot path；FPS 不应变化。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains DevIndex 不得低于 baseline -5%；30min 存活率应**显著提高**（Reviewer 期望 P50 ≥ 15min vs 当前 3:12）。
- prod build：`npx vite build` 无错；smoke 5 分钟 autopilot 无 console error。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

可复现 — Reviewer 给了 3 局 timestamp 完整数据（Plains t=1:12 -509/min、Riverlands t=0:37 -512/min、Highlands t=0:53 lumber-first）。
