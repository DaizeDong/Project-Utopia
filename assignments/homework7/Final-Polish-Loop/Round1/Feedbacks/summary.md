---
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
total_reviewers: 10
verdict_distribution:
  GREEN: 2
  YELLOW: 4
  RED: 4
---

# Round 1 — Feedbacks Summary

## Verdict 概览

| reviewer | tier | verdict | score | Δ vs R0 | 关键发现一句话 |
|---|---|---|---|---|---|
| A1-stability-hunter | A | GREEN | 8/10 | =（R0=8） | 0 P0 / 0 P1 / 0 P2，5 sessions ~30 min；零 console.error 零 unhandledrejection 零网络 5xx；heap 长程 96→64 MB 稳；连续第 2 轮 0 P0 → 触发停止条件 1 |
| A2-performance-auditor | A | YELLOW | 4/10 | =（R0=4） | `__fps_observed`（R0 加的）让 FPS 可测了；P3 mid p50=54.6 / p5=43.5；P4 stress p50=55.2 / p5=43.1；P5 ≥ 30 全 PASS；**P50 全场景 54-56 < 60 target ~2ms over budget**；稳态非尖峰；建议 DevTools Performance trace |
| A3-first-impression | A | RED | 3/10 | -1（R0=4） | R0 修的 3 P0 已解，新 3 P0：起始 viewport 框得太窄（一条 sliver） / road+farm 放置无任何 feedback (toast 说"Road extends network"但 routes 0/1 不增) / 首次 LMB 在敌 bear 上选中而非放置 pre-selected Road tool（破坏"工具选 → 点 = 放"心智） |
| A4-polish-aesthetic | A | RED | 3/10 | =（R0=3） | 三大结构性缺口未变：完全无 audio pipeline（DOM 探针确认无 `<audio>` 无 Web Audio）/ 日夜光照不可见（R0 lighting tint 在视觉上无差别 — 实施 vs 感知差距）/ 静态 motion design；4 视觉 bug（1024×768 HUD clipping / 1366×768 shortcut wrap-stack / mountain checker 占位味 / worker stacking）|
| A5-balance-critic | A | RED | 3/10 | =（R0=3） | **R0 食物修复反向了**：Run-3 autopilot OFF 0 input 30 分钟仍 0 死亡 pop 稳 → "什么都不做也能赢"；score ±8% 几乎与策略无关（50+ buildings vs 0 buildings 同分）；wood 溢出 235+ 无 cap，stone/herbs 死链 0；Tier-5 raid 戏剧化（无墙时也写"墙顶住"）；HUD 双 score 互斥（top 03:01/211 frozen vs 底 1500+ ticking）；56 in-game min 0 storms/droughts/wildfires |
| A6-ui-design | A | YELLOW | 5.5/10 | +0.5（R0=5） | R0 修的 Demolish + 1366px keybinding 已落；新 P0 层：1366×768 顶部进度 chip 被截（farms 0/6 / lumber 0/3 / wells 0/8 看不到）/ 1024×768 顶部 HUD 与右 sidebar z-index 重叠 / 全局 hover/disabled 系统性缺失（6/6 panel 无 hover；build tool 资源不足时按钮仍亮）|
| A7-rationality-audit | A | RED | 4/10 | =（R0=4） | R0 4 P0 部分修了，新 5 P0：Logistics legend 颜色名错（"yellow ring" 实是 cyan-blue #71d9ff，"purple ring" 实是 #72b9ff，DOM 验证）/ `STABLE` + `0m41s until empty` 矛盾（R0 食物显示 derive 没全修）/ Bear-20 inspector 给"Build or reconnect a warehouse" worker 模板 / Top "Survived 03:13"（best run）vs HUD `6:00`（current）两个未标注时钟看似时间倒流 / Visitor/Saboteur 身份隐藏 — Ash-16 列为 worker 死后才标 saboteur |
| B1-action-items-auditor | B | GREEN | 9/10 | =（R0=9, partial 1 → closed; 新 partial 1） | AI-1 perf 通过 `__utopiaLongRun.devStressSpawn`（R0 加的）实测：508 entities @ 8x sustained 55.32 FPS，从 partial→closed；AI-6 现在是新 partial = perf telemetry 收集了但无 on-HUD FPS/frame summary 给非 dev 玩家（P2，不致 RED）；0 regressed |
| B2-submission-deliverables | B | YELLOW | 7/10 | **+4**（R0=3） | **大幅改善** 7/22 → 17/22 PASS；R0 加的 Post-Mortem 骨架/Demo-Video-Plan 占位/README pillars+anchors 全部落地；4 PENDING 是作者填空（pillar names placeholder / Post-Mortem 内容 / demo video / pillar summaries），TA §1.5 anti-LLM-polish 故意留人填；1 FAIL = submission 格式（zip vs hosted）未定 |
| C1-code-architect | C | YELLOW | 6/10 | -1 debt（27→28：+1 新 / 0 解 / -4 docs drift, +5 新 placement debt） | 25 系统：4A / 11B / 8C / 2D 不变；docs/systems/03 同步生效；新 debt-pop-2 = R0 B1 的 `__devForceSpawnWorkers` 把 dev-only helper 放到生产 `PopulationGrowthSystem.js` 应迁到 `src/dev/`；推荐 wave-1 启动 `PriorityFSM<StateName>` 抽取（Refactor-1）|

## Tier A 共识 P0（多个 A 级 reviewer 同时报）

### 共识 P0-1：游戏核心闭环失败（do-nothing wins）

- A5 RED：30 分钟 0 input → 0 死亡，pop 稳，score 跟策略 ±8%
- A3 RED：3 分钟内不知有没有放下 farm（"routes 0/1" 计数器不动）
- A7 RED：HUD 两个 score 读数不一致

A5 和 A7 同时指出"分数与现实脱节"是核心问题。R0 的食物修复（200→320, 0.05→0.038, 0.5→1.5）让游戏不再 3:11 崩盘，但这给了"什么都不做"足够的 buffer 让玩家什么都不做也能"赢"。这是反 fail-state 信号，需要把 score 系统重做：
- 让 score 增量与玩家可观察的 outcomes 挂钩（建筑数 / 抗 raid 次数 / dev tier 跨越）
- 让"无 input"的 baseline score 接近 0
- 让 fail state 重新出现（在 food=0 持续 N 分钟后开始死人）

### 共识 P0-2：UI 状态不可信（"显示与现实脱节"未尽）

- A7 RED：5 P0 全部是显示/现实矛盾
- A6 YELLOW：1366×768 进度 chip 被截 + z-index 重叠
- A3 RED：road 放置 toast vs 计数器不一致

R0 的 HUD reset / food rate derive / Inspector dev gate 修了一些，但还有一层。建议把 HUDController 加一个 invariant test set："任何显示给玩家的 status 必须有对应 underlying state；任何 underlying state 变化必须在 1 帧内反映到 status"。

### 共识 P0-3：onboarding 信任崩坏

- A3 RED：第一次 LMB 选中 bear 而非放置 pre-selected Road
- A6 YELLOW：build tool 资源不足时按钮仍亮（无 disabled state）

R0 修的 helpModal + statusScenario chip surfacing 是底层 UI 改进。这一层是"工具选定后点击行为"的核心交互问题。建议：当工具被选中时，LMB 在合法 tile 上必须放置而不是选中实体；非法 tile 显示原因。

### 共识 P0-4：结构性缺口（freeze 限制下不能修）

- A4 RED：audio / day-night 视觉 / motion — 全部 R0 已 defer
- A6 YELLOW：hover/disabled 系统缺失

这些是 HW7 freeze 限制下注定不能本轮修的。enhancer 应在 plan 中明确 documented-defer + Post-Mortem 中记录 trade-off 论证。

## Tier B 状态

- **B1 action items**: 9/10 closed (AI-1 partial→closed, AI-6 partial 新增；P2)，0 regressed —— **接近触发停止条件 4**（如 AI-6 算 documented-defer）
- **B2 deliverables**: 17/22 = 77.3%（R0=31.8%，**+45.5% absolute**）；4 是作者填空（不是 reviewer 失败）+ 1 真 FAIL（zip vs hosted submission format）

## Tier C 架构

- **等级分布**：A=4, B=11, C=8, D=2（同 R0）
- **Δ vs R0**：debt 27→28（+1 新 = debt-pop-2 R0 introduce 的 dev placement 错误；-4 docs drift 解决；net +1 placement debt = +1 net）
- **Top-3 重构机会**：
  1. Visitor/Animal AI 仍跑 v0.9.x StatePlanner（不变）
  2. WorkerAISystem 1500-1680 行 ~250 LOC mood/social 补丁不在 FSM 内（不变）
  3. ColonyPlanner 1867 LOC + ColonyPerceiver 1966 LOC（不变）
- **D 级系统**：仍 2（ColonyPlanner / ColonyPerceiver），停止条件 6 未达

## 给 enhancer 阶段的提示

### 优先级建议

| Plan | 推荐 priority | 推荐 wave | 推荐 track | 备注 |
|---|---|---|---|---|
| A1-stability | n/a | n/a | n/a | 0 finding，无 plan 可写。enhancer 应写 minimal plan 标 N/A |
| A2-performance | P1 | wave-0 | code | 用 Chrome DevTools profiler 找 ~2ms over budget；可能：Three.js 每帧 allocations / HUD DOM reflow / 22-system tick chain；先观察后调整 |
| A3-first-impression | P0 | wave-0 | code | 3 新 P0：camera initial framing / placement feedback / first-click priority |
| A4-polish-aesthetic | P1 | wave-0 | docs | freeze 警戒：audio / 真实日夜 lighting / walk cycle 全 freeze 禁；只能 documented-defer 入 Post-Mortem，加 R0 lighting tint 实际不可见的 followup（增大幅度或加 fog/atmosphere 强度） |
| A5-balance-critic | P0 | wave-0 | code | **核心问题**：score 系统脱钩 + 无 fail state；fix 方向：让 score 增量与 outcomes 挂钩 / 让 0 input 时 score=0 / 让 food=0 持续 N 分钟后开始死人 |
| A6-ui-design | P1 | wave-0/1 | code | 3 新 P0：1366 进度 chip 截断（CSS @media）+ 1024 z-index 重叠（z-index 排序）+ hover/disabled 全局补 |
| A7-rationality-audit | P0 | wave-0 | code | 5 新 P0：logistics legend 颜色名校对 / STABLE+empty 矛盾根因解决 / Bear inspector 模板分支 / Top vs HUD 时钟二分 / Saboteur 身份显示 |
| B1-action-items | P2 | wave-0 | docs | 仅 AI-6 partial（perf HUD 给玩家），可 documented-defer 入 Post-Mortem |
| B2-submission | P0 | wave-0 | docs | 4 PENDING 全是作者填空（pillar names / Post-Mortem 内容 / demo video / pillar summaries）；1 FAIL = submission 格式（zip vs hosted）未定。**注意**：作者填空部分 enhancer 应在 plan 中提示用户介入，不能自动填假内容（TA anti-LLM-polish）|
| C1-arch (refactor) | P1 | wave-1+ | code | wave-1 of 4-wave roadmap：抽 `PriorityFSM<StateName>` 通用 dispatcher；这是 Round 1 实质重构启动；同时把 R0 引入的 `__devForceSpawnWorkers` 移到 `src/dev/` |

### 已知冲突警示

- **A3 / A5 / A7 共识 P0-1**（score / fail state / 显示）合并优先级很高，落地于 src/simulation/economy/ 与 src/ui/hud/
- **A6 / A7 共识 P0-2**（z-index / 显示一致性）合并落地于 index.html CSS + InspectorPanel/HUDController
- **C1 wave-1 refactor**（PriorityFSM 抽取）独占 src/simulation/npc/，不与其他 plan 冲突，但需要专注的一整个 wave

### Freeze 红线

- 0 plan 在 R0 触发，预期 R1 也 0 violation；Visitor/Animal AI 迁移属"重构既有系统"freeze 内
- 注意 score 系统重做：调整既有 score 计算公式 OK；新 score 系统/新 score 类别属 freeze
- 注意 fail state 恢复：调整既有 BALANCE.* 数值 OK；新 mortality mechanic 属 freeze
