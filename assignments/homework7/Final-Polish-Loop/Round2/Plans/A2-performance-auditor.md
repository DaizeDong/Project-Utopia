---
reviewer_id: A2-performance-auditor
reviewer_tier: A
feedback_source: Round2/Feedbacks/A2-performance-auditor.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~120
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: d242719
---

## 1. 核心问题

1. **Per-sim-step fixed-cost amplification at 4x/8x speed.** `GameApp.update()` runs the entire `SYSTEM_ORDER` chain inside a `for (i < stepPlan.steps)` loop (`src/app/GameApp.js:653`). At 4x→12 steps/frame, `simStepPlan.steps` reaches 4–12, multiplying every system's per-tick fixed cost (perceiver scans, snapshots, fallback throttling, milestone scans). Engine self-throttles `running ×0.4 / target ×4.0` because frameMs grows ~6× while sim density grew 4×. Headroom collapses 232 fps (1x) → 40 fps (4x) → 42 fps (8x).
2. **AgentDirectorSystem decision tick is not cadence-gated.** `AgentDirectorSystem.update()` (`src/simulation/ai/colony/AgentDirectorSystem.js:160`) executes `executeNextSteps`, `snapshotState` (pre+post), `perceiver.observe`, `shouldReplan`, and a fallback throttle counter every single sim step. The internal `PLAN_INTERVAL_SEC = 2` only gates the LLM request — the heavy `observe`/`snapshotState`/`executeNextSteps` work fires every fixed step regardless. At 8x×12 steps, 12 perceiver scans per render frame instead of one. Telemetry already pegs this as the top system (1.0–1.5ms avg, 10–13ms peaks).
3. **ProgressionSystem milestone/scoring also re-runs every step.** `ProgressionSystem.update()` (`src/simulation/meta/ProgressionSystem.js:689`) calls `computeProsperity`, `computeThreat`, `buildCoverageStatus`, `detectMilestones`, `updateSurvivalScore`, `detectScenarioObjectiveMilestones` every step. These are economy/coverage scans whose state only meaningfully changes at sim-second granularity — running 12× per frame at 8x is pure waste.

## 2. Suggestions（可行方向）

### 方向 A: 内部 throttle — sim-time cadence on AgentDirector + Progression heavy paths

- 思路：在 AgentDirectorSystem.update / ProgressionSystem.update 内部，沿用 `state.metrics.timeSec` 做 sim-time gate，把"每 sim-tick 都跑一次"的扫描类工作（perceiver.observe、snapshotState pre/post、coverage/milestones 扫描）压到固定的 sim-second 间隔（e.g. 0.5s for AgentDirector, 0.25s for Progression）。fast-path（dt 累加、score smoothing、`_fallbackThrottle` 计数）保持每 step 跑。
- 涉及文件：
  - `src/simulation/ai/colony/AgentDirectorSystem.js` (update 顶部加 `_lastTickAtSec` gate)
  - `src/simulation/meta/ProgressionSystem.js` (update 顶部加 `_lastScanAtSec` gate)
  - `test/agent-director-cadence.test.js` (新增)
- scope：小 (~120 LOC)
- 预期收益：4x → headroom_p50 ≥ 60；8x → headroom_p50 ≥ 45。`AgentDirectorSystem` avg 从 1.27ms 降到 ≤0.4ms（重活只在 1/4–1/8 step 跑）。`simStepsThisFrame` 实际从 capped 0.4 提到 ≥0.8。无渲染回归。
- 主要风险：
  - `_fallbackThrottle` 是 per-tick 计数器，throttle 后触发频率减小 → 可能延迟 fallback build placement。缓解：`_fallbackThrottle` 计数留在 fast-path（每 step），只把 plan-execution heavy work 放慢。
  - LLM plan execution latency 翻倍（每 0.5 sim-sec 而不是每 step） — 可接受，PLAN_INTERVAL_SEC=2 已经主导。
  - 单测断言 `agentState.stats.plansGenerated` 每 tick 推进的（如有）— grep 检查。
- freeze 检查：OK（不新增 tile/role/building/UI panel/mood/audio；纯内部 cadence 调整）

### 方向 B: 外层调度 — SYSTEM_ORDER 内打分类分组,low-frequency systems 在 sim-step loop 外只跑一次/frame

- 思路：在 `GameApp.update()` 把 systems 切成两组：`hotSystems`（每 step 必须跑：SimulationClock/WorkerAI/AnimalAI/Boids/Resource）+ `coldSystems`（每 frame 跑一次，dt 用 `stepPlan.simDt`：AgentDirector/Progression/DevIndex/RaidEscalator/EventDirector/StrategicDirector/Wildlife）。`stepSimulation(simDt)` 只跑 hot；冷系统在 sim-step 循环结束后用累计 simDt 调用一次。
- 涉及文件：
  - `src/app/GameApp.js` (createSystems 分组 + update sim-step loop 重写)
  - `src/config/constants.js` (新增 `HOT_PER_STEP_SYSTEMS` / `COLD_PER_FRAME_SYSTEMS` 列表)
  - 多个 system 单测 (cadence 假设变化)
- scope：中-大 (~250-400 LOC + 测试调整)
- 预期收益：≥1.5× 提升于方向 A，因为也覆盖 DevIndex/RaidEscalator/EventDirector。
- 主要风险：
  - **可能违反 SYSTEM_ORDER 的依赖时序契约**（`assertSystemOrder` 锁了 DevIndex→RaidEscalator→WorldEvent triplet on Phase 4 H3 contract）。冷热分裂会破坏 same-tick read-after-write 关系。
  - 大量单测假设系统每 tick 都跑（`detectMilestones`、`updateSurvivalScore`、coverage gating 都依赖 dt 单调）→ 大批 baseline 漂移。
  - 触发架构级改动，需要 C1 driven plan 流程（对照表 + system_order_safe 字段 + LOC ≤400）。本轮是 A2 driven，A2 plan 不该跨入 C1 territory。
- freeze 检查：OK（不新增 mechanic），但 scope 越界 + 时序证据负担过重 → 不选定。

### 方向 C: 提高 `effectiveMaxSteps` 与降低 fixedStepSec 上限以"摊薄"per-step cost

- 思路：在 GameApp.update 处把 `fixedStepSec` 从 1/30 抬到 1/20 (降到 1/15)，让 4x 只需要 1.5 step 而不是 4。
- 涉及文件：`src/app/GameApp.js:632-638` (fixedStepSec 边界)
- scope：小 (~5 LOC)
- 预期收益：直接降低 stepsPerFrame，但牺牲 sim 精度 + 改变 BALANCE 调优基线（farmYield、spoilage 都按 dt 累加，30Hz→20Hz 等价于 ×1.5 加速 dt scaling）。
- 主要风险：**会破坏长期 BALANCE 调优基线**，引入 1500+ 测试漂移。Phase 10 长horizon hardening contract 显式声明 12 steps/frame 在 30Hz 下保 determinism。
- freeze 检查：OK（不新增 mechanic），但破坏既有 hardening contract 与 BALANCE 基线 → 不选定。

## 3. 选定方案

选 **方向 A — 内部 sim-time cadence gate**，理由：

- P0 级问题 → 选小 scope / 快速落地（spec line 67）。
- 不触及 `SYSTEM_ORDER` / `assertSystemOrder` 契约，不破坏 DevIndex→RaidEscalator→WorldEvent 三元组。
- 不改 fixedStepSec / dt scaling，BALANCE 基线无漂移。
- 完全本地化在两个 system 内部，可逐个 system 独立验证、独立回滚。
- 收益对齐 A2 P0：把 `AgentDirectorSystem 1.0-1.5ms × N steps` 压成 `× 1-2 logical ticks`。

## 4. Plan 步骤

- [ ] Step 1: `src/simulation/ai/colony/AgentDirectorSystem.js:124-152` — edit — 在 constructor 末尾追加 `this._lastHeavyTickSec = -Infinity;` 和 `this._heavyTickIntervalSec = 0.5;`（导出常量便于测试覆盖）。同时在文件顶部导出常量 `export const AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC = 0.5;` 给单测引用。

- [ ] Step 2: `src/simulation/ai/colony/AgentDirectorSystem.js:160` (`update` body) — edit — 在 `const nowSec = ...` 之后新增 fast-path / heavy-path 分流：
  - `const heavyDue = nowSec - this._lastHeavyTickSec >= this._heavyTickIntervalSec;`
  - 把现有 Step 1 (executeNextSteps + snapshotState pre/post + evaluateStep) 与 Step 2 (perceiver.observe + shouldReplan + planner.requestPlan branch) 包在 `if (heavyDue) { ... this._lastHeavyTickSec = nowSec; }` 内。
  - 保持 fast-path 跑：mode 选择、`agentState.activePlan` 镜像、algorithmic-mode 直通 `_fallback.update`、Step 3 末尾的 `_fallbackThrottle` 计数 + 按 `===0` 触发的 `_fallback.update`。
  - 当 LLM Promise resolve 中的 grounding/onCompletion 路径不需变更（异步触发，与 cadence gate 解耦）。
  - depends_on: Step 1

- [ ] Step 3: `src/simulation/meta/ProgressionSystem.js:689-715` (class `update`) — edit — 在 `applyDoctrine` 之后新增 `state.gameplay._progressionLastScanSec ??= -Infinity;` 与 `const scanIntervalSec = 0.25;`，把 `buildCoverageStatus` / `detectScenarioObjectiveMilestones` / `maybeTriggerRecovery` / `detectMilestones` 包在 `if (nowSec - state.gameplay._progressionLastScanSec >= scanIntervalSec)` 内并更新 `_progressionLastScanSec`。
  - 保持 fast-path 跑：`computeProsperity` / `computeThreat` 平滑（依赖每 tick smoothing alpha）、`updateSurvivalScore` (积分 dt → 必须每 tick)。
  - `nowSec = state.metrics?.timeSec ?? 0`。

- [ ] Step 4: `test/agent-director-cadence.test.js` — add — 新测试覆盖：
  - (a) 在 1 frame 内连续调用 `update(1/30)` 12 次（模拟 8x），断言 `_perceiver.observe` 调用次数 ≤ 2（用 spy 替换 `_perceiver.observe`）；
  - (b) 当 `state.metrics.timeSec` 跨过 `_heavyTickIntervalSec` 时，`executeNextSteps` 至少被调用一次；
  - (c) `agentState.activePlan` 镜像每 tick 仍被刷新（fast-path 行为不变）。
  - depends_on: Step 2

- [ ] Step 5: `CHANGELOG.md` (current unreleased section) — edit — 新增条目 under "Performance"：`AgentDirectorSystem + ProgressionSystem heavy-path now sim-time gated (0.5s / 0.25s) — 4x speed headroom_p50 40→≥60 fps, 8x → ≥45 fps. fast-path (smoothing/score integration/fallback throttle) preserved every-tick.`

- [ ] Step 6: 手动 sanity — 运行 `node --test test/*.test.js`，目标 `1646 pass / 0 fail / 2 skip` 守住或新增 1 pass（步骤 4 test）。
  - depends_on: Step 4

## 5. Risks

- **R1**: ProgressionSystem 的 `detectMilestones` 漏抓窗口 ≤0.25 sim-sec — 影响 `pop_30` / `dev_year_1` 等里程碑触发延迟。缓解：里程碑全是单调阈值（"已达成"），最坏延迟 0.25s 落地，长 horizon 测试容忍。
- **R2**: AgentDirector `_planStalledSinceSec` 时钟在 heavy-path 内计算，cadence 减小后 stall grace 窗口仍按 `nowSec` 计算（基于 sim time 而非 tick 数），所以 `PLAN_STALL_GRACE_SEC=18` 语义不变。✅ 验证。
- **R3**: 异步 LLM resolve 路径里 `groundPlan`/`snapshotState` 的调用与 cadence gate 解耦（在 `.then` 里）。需保证 resolve 时 `this._activePlan` 写入仍然每 tick 都能被 fast-path 镜像到 agentState — Step 2 已保留该镜像在 fast-path。
- **R4**: 受影响测试候选：`test/agent-director-system.test.js`、`test/progression-system.test.js`、`test/long-horizon-*.test.js`、`test/colony-director-*.test.js`、`test/coverage-status.test.js`。这些文件多数构造 `state.metrics.timeSec` 推进 ≥1s，cadence 0.25/0.5 都会在窗口内触发，理论上 baseline 守得住。
- **R5**: HUD 依赖 `agentState.activePlan` 镜像在 fast-path — Step 2 显式保留，不会出现 plan 显示卡 0.5s 的问题。

可能影响的现有测试：`test/agent-director-system.test.js`、`test/progression-system.test.js`、`test/long-horizon-survival.test.js`、`test/long-horizon-balance.test.js`、`test/coverage-status.test.js`、`test/colony-director-fallback.test.js`。

## 6. 验证方式

- **新增测试**：`test/agent-director-cadence.test.js` — 覆盖 perceiver 调用计数 + heavy-tick interval 跨越行为 + activePlan 镜像每 tick 刷新。
- **回归套件**：`node --test test/*.test.js` 目标 `≥1646 pass / 0 fail / 2 skip`。
- **手动验证（关键）**：
  1. `npx vite` 启动；浏览器开 `http://localhost:5173` → Start Colony → autopilot ON。
  2. 1x 速度跑 30s，控制台读 `__utopiaLongRun.getTelemetry().performance.headroomFps` p50 ≥ 200（不能比 baseline 232 跌超 5%）。
  3. 切 4x → 60s → headroom p50 应 ≥ 60（baseline 40），p5 ≥ 30。
  4. 切 8x → 60s → headroom p50 应 ≥ 45（baseline 42），p5 ≥ 22；底部 HUD `simStepsThisFrame` 应能跑到 ≥ 8（之前 capped at 4-5）。
  5. 检查 `state.debug.systemTimingsMs.AgentDirectorSystem.avg` 应从 1.27ms 降到 ≤0.4ms。
- **FPS 回归**：`browser_evaluate` 5 秒平均 headroomFps p50 ≥ 60（在 4x），≥ 45（在 8x）。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --duration 600`，DevIndex 不得低于 baseline - 5%（cadence 调整不影响经济产出，DevIndex 应持平）。
- **prod build**：`npx vite build` 无错误；`vite preview` 3 分钟 smoke run 控制台 0 console error，autopilot 推进可见（活跃 plan 持续刷新）。

## 7. 回滚锚点

- 当前 HEAD: `d242719`
- 一键回滚：`git reset --hard d242719`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记（如适用）

不适用。A2 R2 feedback 提供完整复现路径（speedFastBtn / speedUltraBtn 切档 + `__utopiaLongRun.getTelemetry().performance` 读 headroomFps），且与游戏内 HUD `running ×0.4 / target ×4.0 (capped)` 直接吻合。Implementer 落地后即可对照同一路径验证。
