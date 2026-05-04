---
reviewer_id: A5-balance-critic
reviewer_tier: A
feedback_source: Round2/Feedbacks/A5-balance-critic.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 4
  loc_delta: ~55
  new_tests: 1
  wall_clock: 35
conflicts_with: []
rollback_anchor: d242719
---

## 1. 核心问题

R1 的 `entity.hunger` 重连**没有修好 do-nothing-wins**，因为新挂载的 hunger decay 只在 `state.resources.food <= 0` 时才生效（`ResourceSystem.js:430`）；R1 同时把 `INITIAL_RESOURCES.food` 抬到 320 + 全局 drain 降到 0.038/s/worker（12 workers ≈ 0.456/s），所以纯 AFK 要约 11 分钟才碰到 0。**期间**两个被动外源补足食物把池永远拉离 0：

1. **TRADE_CARAVAN 事件**（`WorldEventSystem.js:767`）`food += dt * 0.5 * intensity` —— 一个 20s 的 caravan 直接送约 10 food；EventDirector 的 `tradeCaravan` 权重默认 1（`longRunProfile.js:19`），所以 AFK 也定期被刷。
2. **ProgressionSystem 紧急救济**（`ProgressionSystem.js:503`）只要 food ≤ 12 且 charges>0 就 +12 food + 8 wood + 减 8 threat —— 默认 2 charges = 一次性救回 24 food。两条路径共同把 AFK 食物 18 → 313 完美对上 A5 R2 的实测曲线。

第二个 P0：`raidsRepelled` milestone（`WorldEventSystem.js:1149`）只看"raid 撑过 active 窗口"就 +1，**完全不读 `event.payload.defenseScore` / `effectiveWallCoverage`**，所以 0 墙 0 GUARD 也照样触发 "Tier-5 raid defended"。

第三个相关：A5 R1 的 `survivalScorePerProductiveBuildingSec=0.08` 拉开了 score 的差距（`ProgressionSystem.js:554-568`），但 score gating 已经接好，A5 的"score still feels decoupled"主要是因为底层 fail state 不发火 —— score 修了之后死亡数仍是 0/run，前面看到的"差距"被 +1 perSec 掩盖。先修 fail state，score 自然对齐。

## 2. Suggestions（可行方向）

### 方向 A: 直接调小被动外源 + 解锁非零 hunger 衰减

- 思路：把 TRADE_CARAVAN 食物率减半、ProgressionSystem 救济只在 collapse risk 阈值下触发（hard-gate `criticalResources` 路径）、hunger decay 不再要求 `food == 0` 而是 `food < lowFoodThreshold`。raid milestone 加 wallCoverage gate。
- 涉及文件：`src/config/balance.js`、`src/world/events/WorldEventSystem.js`、`src/simulation/economy/ResourceSystem.js`、`src/simulation/meta/ProgressionSystem.js`
- scope：小
- 预期收益：AFK 0 farms 0 walls run 在 ~7-10 min 出现首批死亡；Tier-5 raid 在 0 wall 下不再写 "defended"
- 主要风险：autopilot 经济 run 在低 food 时也会触发 hunger decay → 死人变多 → tier-A 经济需要重新 tune（但 A5 报告说"autopilot 也喂不饱 20 人"，所以让它真痛一次本来就是目标）
- freeze 检查：OK（仅调常量 + 阈值表达式 + 一行 if 条件，无新 mechanic / building / role）

### 方向 B: 把 fixed-rate worker drain 替换回基于 entity.hunger 的连锁

- 思路：移除 `workerFoodConsumptionPerSecond` 的全局食物 drain，改成 worker entity hunger 持续 decay → MortalitySystem 的 starvation 链就一直挂在风险中，不再依赖 `food==0` 触发条件。
- 涉及文件：`src/simulation/economy/ResourceSystem.js`、`src/simulation/npc/WorkerAISystem.js`、`src/simulation/lifecycle/MortalitySystem.js`、`src/config/balance.js`
- scope：中
- 预期收益：与 v0.10.1-l 之前的 hunger FSM 行为对齐；AFK 死人模型自洽
- 主要风险：触发 hard freeze（"NO new mortality mechanic" —— 这接近重写 mortality 路径）；并且会让 1646 测试 baseline 大量回归
- freeze 检查：FREEZE-VIOLATION（重写 mortality / 食物消耗循环属于"new mortality mechanic"边缘，不选）

## 3. 选定方案

选 **方向 A**，理由：

- P0 紧迫，方向 A 是 "改 4 个常量 + 2 处 if 条件"，30 分钟内 implementer 能完成。
- 严格守 hard freeze：没有新增 building / role / mechanic / score system / mortality path，只是**调小已存在的食物外源 + 让已存在的 hunger decay 提早生效 + 给已存在的 milestone 加一个 gate**。
- 直接对症：A5 R2 三个 P0 finding（AFK 不死、food 自我恢复、Tier-5 raid 假"defended"）都能 1:1 对应到改动点。
- 回滚成本低：4 个文件的精准小改，rollback_anchor 一键回退。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/balance.js:217` — edit — 把 `workerHungerDecayWhenFoodZero: 0.020` 改名为 `workerHungerDecayWhenFoodLow: 0.020`；同时新增 `workerHungerDecayLowFoodThreshold: 8`（"food < 8 时开始 entity.hunger decay"，避免要求严格 food==0）。注释指向 R2 A5 finding。
- [ ] **Step 2**: `src/simulation/economy/ResourceSystem.js:430` — edit — 把 `if (state.resources.food <= 0 && Array.isArray(state.agents))` 改成 `if (state.resources.food < (BALANCE.workerHungerDecayLowFoodThreshold ?? 8) && Array.isArray(state.agents))`；下面读 `BALANCE.workerHungerDecayWhenFoodLow ?? 0`（`hungerDecayRate` 那一行）。注释里说明 "low-food 触发让 TRADE_CARAVAN 的 +0.5/s 不能完全抵消 entity.hunger 的 0.020/s decay"。
  - depends_on: Step 1
- [ ] **Step 3**: `src/world/events/WorldEventSystem.js:767-768` — edit — TRADE_CARAVAN food 收益 `dt * 0.5 * intensity * yieldMultiplier` 减半为 `dt * 0.22 * intensity * yieldMultiplier`；wood `0.34 → 0.18`。注释引用 A5 R2 "AFK food 18 → 313 root cause"。
- [ ] **Step 4**: `src/simulation/meta/ProgressionSystem.js:481-482` — edit — `criticalResources` 阈值用 `BALANCE.recoveryCriticalResourceThreshold` 已经是 12，不动；但在 491 行的 early-return 加一个**硬条件**：要求 `state.metrics.deathsTotal > 0 || severePressure` 才允许 charges 消费（即"必须真有人死或处于严重崩溃才补给"），把 AFK 软 trickle 路径堵死。说明 NO new score / mechanic，只是给 charges 收紧触发条件。
- [ ] **Step 5**: `src/simulation/meta/ProgressionSystem.js:213-223` — edit — `defended_tier_5` milestone 的 `current(state)` 加一个 wall/guard gate：必须有 `state.combat?.guards >= 1 || state.combat?.activeWalls >= 4` 才返回 1。引用现有字段，无新 schema。如果这两个字段不可用，fall back 到 `state.buildings?.walls >= 4` —— 用 git grep 确认前先二选一。
  - depends_on: 无
- [ ] **Step 6**: `src/world/events/WorldEventSystem.js:1147-1149` — edit — `raidsRepelled` 增量加门槛：`event.payload?.defenseScore >= 1 || event.payload?.blockedByWalls === true`；否则不计 repel（A5 P0：0 墙不能"defended"）。注释引用 R2 A5。
- [ ] **Step 7**: `test/balance-afk-fail-state-r2.test.js` — add — 新建测试：`createInitialGameState` + 删空 buildings → 跑 600s sim ticks → 期望 `state.metrics.deathsTotal >= 1`（AFK 必须有死亡）。第二用例：跑 BANDIT_RAID resolve cycle with `wallCoverage=0` → 期望 `metrics.raidsRepelled === 0`。
  - depends_on: Step 1-6

## 5. Risks

- **回归风险**：autopilot 经济 run 在 food 低时 entity.hunger 会同时被 R1 全局 drain 与新 low-food decay 双重消耗 —— 测试可能从 1646 pass 掉到 1640 左右；要求 implementer 跑全测试看具体哪些 case 被 0.020 decay 打到（多半是 long-horizon-bench 的 DevIndex baseline）。
- **TRADE_CARAVAN 削减后**，trader 实体（`VisitorAISystem.js:427`）的 `food += 1.5 * dt * tradeYield * tradeBonus` 仍是另一个外源 —— 留作 R3 处理（不在本 plan 范围）。
- **recovery early-return 收紧**会让"几乎要死但还没死"的中等危机不再触发救济，符合"AFK 必须真痛"目标，但可能破坏 v0.8.5 Tier 3 的 charges=2 设计意图。文档化在 plan 里，不退回。
- **可能影响的现有测试**：
  - `test/progression-recovery*.test.js`（如有）—— recovery charges 触发条件改了
  - `test/event-trade-caravan*.test.js`（如有）—— TRADE_CARAVAN 食物率减半
  - `test/long-horizon-helpers*.test.js` —— `raidsRepelled` 计数语义变更
  - `test/progression-milestones*.test.js` —— `defended_tier_5` 增加 wall/guard gate

## 6. 验证方式

- 新增测试：`test/balance-afk-fail-state-r2.test.js`，覆盖 (1) AFK 600s ≥1 death (2) 0-wall raid resolve 不 +1 raidsRepelled
- 手动验证：开 dev server `npx vite` → 加载 endless 模式 → 不开 autopilot 不操作 → 期望 t=10:00 之前看到至少 1 名 worker death（HUD 数字 -1 / death toast）→ 对照 R2 实测 23min 仅 -2 改善至 ≥3
- 手动验证 raid：dev console 强制 inject `BANDIT_RAID` event with `wallCoverage=0` → 等 active 窗口结束 → 期望 `state.metrics.raidsRepelled` **不**+1，且 milestone "Tier-5 raid defended" 不被点亮
- FPS 回归：`browser_evaluate` 5 秒平均 ≥ 55fps（与 R1 baseline 同）
- benchmark 回归：`node --test test/*.test.js` 全 pass / fail 报告须由 implementer 写入 `Round2/Validation/test-report.md`；接受 long-horizon DevIndex 下降 ≤ 8%（比常规 5% 宽松，因为本轮目标就是收紧 fail state）
- prod build：`npx vite build` 无 error；`vite preview` 3 分钟 smoke 无 console error

## 7. 回滚锚点

- 当前 HEAD: `d242719`
- 一键回滚：`git reset --hard d242719`（仅当 implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记

不适用 —— A5 R2 提供了 3 个完整 30-min run 的资源曲线和具体的代码层 root cause（food 被动外源），实测数据足以驱动定向修复，无需 Playwright 重现。
