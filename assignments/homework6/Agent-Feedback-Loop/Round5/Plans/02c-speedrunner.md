---
reviewer_id: 02c-speedrunner
feedback_source: Round5/Feedbacks/02c-speedrunner.md
round: 5
date: 2026-04-24
build_commit: 61ddd8a
priority: P1
estimated_scope:
  files_touched: 4
  loc_delta: ~85
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

Feedback 的表层诉求（重写 Score 公式 / 加 milestone / 加成就）触到 HW06 freeze — **拒绝**。但其三个实证观察是真实且可修的系统缺陷，选定 P0-1 (a) 作为根本病因：

1. **建筑堆叠无边际惩罚（P0-1，选定攻关点）**。
   `BUILD_COST`（`src/config/balance.js:3-16`）对每栋建筑按 flat 成本收取（warehouse=10 wood，wall=2 wood，kitchen=8 wood+3 stone）。
   DevIndex 的 `scoreInfrastructure` / `scoreDefense` / `scoreProduction` 已经用 `(count/target)*80` clamp100 做了 score 侧边际递减（`src/simulation/telemetry/EconomyTelemetry.js:163-197`），**但成本侧没有任何递增**。
   结果：reviewer 在 run-1 放 warehouse×10、wall×19、kitchen×5 全部 legal 下单，短期拉升 Dev 49→65，long-term 被食物/木材净流出 -198/min -168/min 杀死。
   这是典型的 *系统默许 build-spam（score saturation 纯温和保护），却不给即时成本反馈*。Speedrunner 解读为 "没有 dominant strategy" —— 其实是有 cheese，只是 cheese 自动自毁。
   **修的是成本函数，不是 Score 公式**：给超目标栋数的同类建筑一条 soft-cost escalator，让过量下单立即消耗更多木/石，把 starvation 提前到下单瞬间，玩家要么主动撤单要么学到 stop-placing。既是风险反馈又是"为什么 15 个 warehouse 没用"的机制化提示。

2. **FF 4x 实测仅 ~1.2x（P1 次要）** — 病因在 `src/app/simStepper.js:10,27` 和 `src/app/GameLoop.js:35` 的双层 dt/accumulator clamp：
   - `GameLoop.frame` 把 elapsed 限到 `min(0.1, …)`；
   - `simStepper` 再 `min(0.1, frameDt)`；
   - `accumulatorSec = min(0.5, …)`；
   - `maxSteps = 6`（`GameApp.js:209`）。
   当每帧 sim cost >= 16ms 时真实 fps 掉到 30，60fps 假设失效，每帧能 pump 的 sim 上限 = 6×(1/30) = 0.2s。在 16.67ms 预算里这本来可以 4x，但当 simCost 超过 33ms 时只能做 1 step/frame，**实测 multiplier = (16.67ms * 4) / frameMs**。累计溢出被 `min(0.5, …)` 静默丢弃。这是 P1 次要但要记录。

3. **Autopilot 弱基线（P2 顺手）** — Dev 47 vs manual 65，feedback 认为是弱点。但这是 "玩家有存在感" 的设计意图，不修。仅在 Plan 里记 "不动"。

**本 Plan 仅落地问题 1 (建筑堆叠 soft-cost escalator)**。问题 2 作为 Suggestion B 列出备选。
**明确不是 Score 公式重构**：不动 `survivalScore` / `DevIndexSystem` / `scoreInfrastructure` / `scoreDefense` / `scoreProduction`。

## 2. Suggestions（可行方向）

### 方向 A: 建筑堆叠的 soft-cost escalator（同类栋数越多，新建越贵）

- 思路：在 `src/simulation/construction/` 的成本求值路径里对每种可重复建筑引入 `cost_n = base * (1 + k * max(0, n - softTarget))`，其中 `n` 是当前已建栋数，`softTarget` 来自 scenario objective（warehouses=2、walls=8）或 BALANCE 默认。第 1~softTarget 栋按原价；第 softTarget+1 栋起每多 1 栋，木材/石材 +20% 叠加（k=0.2）。
- 涉及文件：`src/config/balance.js`（新增 `BUILD_COST_ESCALATOR` 常量）、`src/simulation/construction/ConstructionSystem.js` 或建造结账代码路径（需 grep 定位）、可能 `src/ui/panels/BuildPanel.js` 或 hover 提示暴露当前动态价格。
- scope：中（~80 LOC，含新测试）
- 预期收益：
  - `warehouse ×15 的边际 Dev 贡献 ≤ 0`（已然）**+** 成本侧反馈：第 15 栋实际消耗 ≈ 10 × (1 + 0.2 × 13) = 36 wood，而不是 10。过量下单瞬间吞光 wood 储备，玩家立即感知 "不能再放了" 而非等 3 分钟饿死才明白。
  - 曲线化默许 build-spam → 有预算上限的建造决策；speedrunner 重新获得 "how much is too much" 的 micro-opt 维度。
- 主要风险：
  - 已有测试里可能假设固定成本（`test/*construction*`、`test/*budget*`、`test/*scenario*`），需要 flag 化（feature toggle 默认 ON，测试 new-path）。
  - Autopilot (`ColonyPlanner`) fallback 可能对超目标下单的动态成本未校对，可能报 ghost "insufficient wood" 循环。需在 ColonyPlanner 读 BUILD_COST 的位置同步使用 escalated cost。

### 方向 B: FF 4x 实测修复（GameLoop/simStepper 催化 + 视觉脱钩）

- 思路：
  - 提升 `maxSimulationStepsPerFrame` 上限从 6 → 12（`src/app/GameApp.js:209`），使得在 30 fps 真帧率下仍可 pump 12 × 0.033 = 0.4s sim / frame = 12x 理论峰值。
  - 把 `simStepper.js:10` 的 `Math.min(0.1, frameDt)` 放宽到 `Math.min(0.25, frameDt)`（和 `safeFixed` 的上限对齐），且 `accumulatorSec` 上限 0.5 → 1.0。
  - 新增 HUD `timeScaleActual = simDt / frameDt` 直接暴露给 reviewer，下次不会再拿 "4x 变 1.2x" 当论据。
- 涉及文件：`src/app/simStepper.js`、`src/app/GameApp.js`、`src/ui/hud/HUDController.js` 或 `PerformancePanel.js`。
- scope：小（~30 LOC）
- 预期收益：`FF 4x 实测 ≥ 3.5x`（在 sim cost < 40ms/frame 时）
- 主要风险：
  - 长帧（200ms+）下 determinism / benchmark 长跑脚本可能失准；已有 `test/simStepper*` / `test/longRunDeterminism*` 可能回归。
  - 帧 spike 下渲染/动画和 sim 时间戳脱钩，视觉跳帧更明显（可接受 trade）。

> **选 A**：speedrunner 的第一槽是 "找 dominant strategy"，修 build-spam 的成本侧就是直接给他一个新的 min-max 维度（"在 softTarget 之内点满产能"），同时抑制 cheese。方向 B 更薄但 speedrunner 自己有自知之明（"对人类玩家无关痛痒"），且长帧 clamp 放宽有 determinism 风险，不如作为 follow-up。

## 3. 选定方案

选 **方向 A — 建筑堆叠的 soft-cost escalator**。理由：

1. **直击 P0-1 根因**（成本/收益不对称），而非 feedback 的表层诉求（新 Score 公式 / 成就）。
2. **不跨 HW06 freeze**：不加新 mechanic / 新 UI screen / 新胜利条件；只把已有 flat-cost 参数化成曲线，属于 balance polish。
3. **可度量**：
   - `warehouse ×15 的边际 Dev 贡献 ≤ 0`（telemetry 已经保证，仅作 assertion 再验证一次）
   - `warehouse 第 N 栋木材消耗 = 10 × (1 + 0.2 × max(0, N - 2))`（新单元测试）
   - long-horizon benchmark seed 42 / temperate_plains 的 DevIndex 不得低于 baseline - 5%（确保调参不误伤 Autopilot 基线）。
4. scope 中等，风险明确可控：ColonyPlanner 对建造成本的读取点需同步（已知单一接入点 `BUILD_COST`）。
5. **明确不是 Score 公式重构**：`src/simulation/telemetry/EconomyTelemetry.js`、`src/simulation/meta/ProgressionSystem.js:354`（`updateSurvivalScore`）、`src/simulation/meta/DevIndexSystem.js` **不动**。

## 4. Plan 步骤

- [ ] **Step 1**: `src/config/balance.js:16` 之后 — `add` — 新增 frozen 常量 `BUILD_COST_ESCALATOR = Object.freeze({ warehouse: { softTarget: 2, perExtra: 0.2, cap: 2.5 }, wall: { softTarget: 8, perExtra: 0.1, cap: 2.0 }, kitchen: { softTarget: 1, perExtra: 0.35, cap: 3.0 }, smithy: { softTarget: 1, perExtra: 0.35, cap: 3.0 }, clinic: { softTarget: 1, perExtra: 0.35, cap: 3.0 }, farm: { softTarget: 6, perExtra: 0.1, cap: 1.8 }, lumber: { softTarget: 4, perExtra: 0.1, cap: 1.8 }, quarry: { softTarget: 3, perExtra: 0.1, cap: 1.8 }, herb_garden: { softTarget: 2, perExtra: 0.15, cap: 2.0 } })`。road / bridge / erase 不在表内（按原价）。

- [ ] **Step 2**: `src/config/balance.js` 顶部 — `add` — `export function computeEscalatedBuildCost(kind, existingCount)`：读 `BUILD_COST[kind]` + `BUILD_COST_ESCALATOR[kind]`，返回 `{ wood, stone, herbs }` 乘以 `min(cap, 1 + perExtra * max(0, existingCount - softTarget))`。若 `BUILD_COST_ESCALATOR[kind]` 未配置则退回 `BUILD_COST[kind]` 原值（road / bridge 安全路径）。
  - depends_on: Step 1

- [ ] **Step 3**: Grep 定位 BUILD_COST 的所有消费点（估计 ≤ 4 处，主要在 `src/simulation/construction/ConstructionSystem.js` 的下单/结账函数、`src/ui/panels/BuildPanel.js` 的价签显示、`src/simulation/ai/colony/ColonyPlanner.js:177-182` 的提示文本）。`edit` 每个消费点：从 `BUILD_COST[kind]` 改为 `computeEscalatedBuildCost(kind, state.buildings[pluralKey(kind)] ?? 0)`。`pluralKey` 映射：warehouse→warehouses、wall→walls、kitchen→kitchens、smithy→smithies、clinic→clinics、farm→farms、lumber→lumbers、quarry→quarries、herb_garden→herbGardens。
  - depends_on: Step 2

- [ ] **Step 4**: `src/ui/panels/BuildPanel.js:<price-label-render-func>` — `edit` — 价签（或 tooltip）显示动态成本：当 `existingCount > softTarget` 时附加 `×N.NN` 倍率文字，让速通玩家在点之前看到 "warehouse: 36 wood (×3.6)"。若 Build panel 没有现成 tooltip 锚点，则用 `actionMessage`（见 `GameApp.js:680-681` 现有 pattern）在鼠标悬停/尝试下单瞬间打印 `"Warehouse #15 costs 36 wood (escalated ×3.6 — diminishing returns above target=2)"`。
  - depends_on: Step 3

- [ ] **Step 5**: `src/simulation/ai/colony/ColonyPlanner.js:493-523` — `edit` — `buildings.warehouses / farms / lumbers` 等计数在该函数已读取，在"Can't afford" 分支（`:513`）里把 cost 比较改用 `computeEscalatedBuildCost(kind, existingCount)`。防止 Autopilot fallback 陷入 "我要放第 10 个 warehouse 但用 10 wood 估算，实际 26 wood 不够，触发 ghost loop"。
  - depends_on: Step 2

- [ ] **Step 6**: `test/` — `add` — 新增 `test/buildCostEscalator.test.js` 覆盖：
  - `computeEscalatedBuildCost("warehouse", 0) → { wood: 10 }` (base)
  - `computeEscalatedBuildCost("warehouse", 2) → { wood: 10 }` (at soft target, no escalation)
  - `computeEscalatedBuildCost("warehouse", 5) → { wood: 16 }` (3 extra × 0.2 = +60%)
  - `computeEscalatedBuildCost("warehouse", 20) → { wood: 25 }` (cap at 2.5×)
  - `computeEscalatedBuildCost("road", 100) → BUILD_COST.road` (not in table, passthrough)
  - `computeEscalatedBuildCost("kitchen", 3) → wood≈13, stone≈5` (both axes scale)

- [ ] **Step 7**: `test/` — `add` — 新增 `test/buildSpamRegression.test.js` 端到端：脚本化下单 warehouse ×15 + wall ×20（模拟 reviewer run-1），在 BALANCE escalator 启用条件下断言：
  - 总 wood 消耗 ≥ `10*(1+0.2*13)` × n-累加 显著超过 flat `10*15`
  - scenario 达标时（warehouses=2）累计 wood 消耗仍然接近 base（前 softTarget 栋无 penalty）
  - DevIndex 在 warehouse 数 > 4 后边际增量 ≤ 0.5/栋（此处仅断言现有 telemetry 行为未被破坏，而非新增 Score 公式）

- [ ] **Step 8**: `CHANGELOG.md` 当前 unreleased 段 — `edit` — 追加 "Balance / Polish → Building stacking soft-cost escalator" 条目，明确 scope 并声明 "不改 Score 公式 / 不加 meta-progression / 不加成就（HW06 freeze 遵守）"。
  - depends_on: Step 3

## 5. Risks

- **Autopilot ColonyPlanner 已知依赖 BUILD_COST 原值**：若 Step 5 漏改任一 call site，fallback 策略会预算失配，表现为"看起来能放但放不下"的 ghost retry。Mitigation：Step 3 的 grep 清单必须穷尽；验证脚手架在 Step 7 断言 ColonyPlanner 无 ghost 循环（日志中 "insufficient wood" 不得在某 tick 连发 > 3 次）。
- **benchmark 长跑 DevIndex 轻微下跌**：escalator 抑制了 Autopilot 的 "超 target 刷 warehouse" 盲投行为，可能让 infrastructure score 略低（估计 ≤ 2 点）。接受 DevIndex -5% 以内。
- **UI 价签显示错位**：若 BuildPanel 已有紧凑布局，附加 "×N.NN" 可能溢出。Mitigation：Step 4 优先用 `actionMessage`（已有 pattern），尽量避免 DOM 重排。
- **测试回归风险**：
  - `test/economyScenario*.test.js`（若存在）：scenario 目标 + 建造流程的集成测试可能硬编码 "放 N 栋 warehouse 总花 M wood"。若存在需改常量或加 feature toggle。
  - `test/colonyPlanner*.test.js`：ColonyPlanner 的 budget 决策断言。
  - `test/constructionSystem*.test.js`：建造结账 API 签名测试。
- **可能破坏的现有测试列表**（需 grep 确认）：`test/constructionSystem.test.js`、`test/colonyPlanner.test.js`、`test/economyScenario.test.js`、`test/budgetPlanner*.test.js`。

## 6. 验证方式

- **新增测试**：
  - `test/buildCostEscalator.test.js` — 单元测试纯函数 `computeEscalatedBuildCost`（6 个 case，见 Step 6）。
  - `test/buildSpamRegression.test.js` — 端到端模拟 reviewer run-1 的 spam 序列，断言 cost 曲线 + no-ghost-loop + DevIndex 边际单调性（见 Step 7）。

- **手动验证**：
  1. `npx vite`（dev server 已起则跳过）。
  2. 打开 `http://localhost:5173`，Temperate Plains 默认剧本，关 Autopilot，FF 1x。
  3. Build panel 选 Warehouse，hover 画布：看价签（或 actionMessage）显示 "10 wood"。
  4. 连放 2 栋（scenario 目标），第 2 栋仍 10 wood。
  5. 放第 3 栋 → 价签变 "12 wood (×1.2)"；第 5 栋 "16 wood (×1.6)"；第 15+ 栋稳定在 "25 wood (×2.5 cap)"。
  6. Wood 储备耗空时尝试下单，`actionMessage` 报 "Insufficient wood (need 25, have X)"。
  7. 切 Autopilot on，FF 4x 跑 3 分钟：观察无 ghost "insufficient wood" 连报（事件日志 < 3/tick）。
  8. **度量**：`warehouse ×15 的边际 Dev 贡献 ≤ 0` 通过 HUD 的 DevIndex dims/infrastructure 面板确认保持 100 平台不再上涨。

- **benchmark 回归**：
  `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --days 90`
  DevIndex 最终值不低于 build_commit=61ddd8a baseline 的 -5%（当前 ~44，允许降到 41.8）。
  deaths/starvation 指标：允许 ±10% 波动。
  若 benchmark 失败则调 `perExtra` 从 0.2 降到 0.15 再试。

## 7. UNREPRODUCIBLE 标记

不适用。Feedback 的 3 条 run 日志（Run 1 manual build-spam / Run 2 Autopilot / Run 3 wall-spam）与当前 build（61ddd8a）代码一致可追溯：
- `BUILD_COST`（`balance.js:3-16`）确为 flat；
- `scoreInfrastructure / scoreDefense / scoreProduction` 的 clamp-to-100 行为（`EconomyTelemetry.js:163-197`）确实解释 "over-build 不加分"；
- `accumulatorSec = min(0.5, …)` + `maxSteps = 6`（`simStepper.js:27` / `GameApp.js:209`）配合 `Math.min(0.1, …)` 双层 clamp 确实会在 sim-heavy 帧降级 FF 实际倍率。

所以 reviewer 观察属实，本 Plan 聚焦于方向 A 的成本侧 escalator 作为 P0-1 修复点，**不触 Score 公式 / meta-progression / 成就**。
