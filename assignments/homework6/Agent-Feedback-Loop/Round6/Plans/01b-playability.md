---
reviewer_id: 01b-playability
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round6/Feedbacks/01b-playability.md
round: 6
date: 2026-04-25
build_commit: 5622cda
priority: P0
freeze_policy: lifted
estimated_scope:
  files_touched: 6
  loc_delta: ~280
  new_tests: 3
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 给出 3/10，根因可归并为三条：

1. **HUD / 输入层信号噪声盖过反馈** — Heat Lens 默认强制刷出 4× 数量的 "halo"
   文字标签（每个主标记触发 4 个邻格 halo，4 个主标记即 16 个），叠在地图上
   完全遮挡建筑；同屏还混有 storytellerStrip 的 "Why no WHISPER? / LLM
   errored / LLM never reached" 这类后台诊断字符串直接面向玩家暴露。前者是
   "信息过载 = 没有信息"，后者是产品层面的 dev-string 泄漏。
2. **Player agency 在前 5 分钟为零，没有死亡威胁** — 永续生存模式只显示
   `Survive as long as you can`，但分数永远 0、无 milestone celebration、无
   game-over 画面、Threat 长期挂在 42% 却从来没真正打到家。生存游戏没有
   "我会死"的紧迫感 → 中后期玩家无事可做，开 ×4 都觉得在等。
3. **HUD/计数不一致 + 易触发的导航/键位副作用** — 顶栏 Workers `13` vs
   Population 面板 Workers `0` 同屏对不齐（BuildToolbar 用
   `!isStressWorker`，HUDController 用全部 WORKER）；还有零散键位/按钮副作
   用（Space 在非-active phase 落到默认工具、L 同时触发 fertility 自动叠加，
   AI Log 跳 URL）。这些是付费产品门槛 bug。

## 2. Suggestions（可行方向）

### 方向 A: HUD 信号降噪 + Survival Hook（综合 polish 包）
- 思路：(i) Heat Lens halo 标签静默化（去除文字、保留视觉脉冲），并把
  "halo / supply surplus / input starved / warehouse idle" 4 种 label 收敛成
  legend 条 + 颜色，主标记每建筑只允许 1 个；(ii) storyteller 把 LLM 后台
  诊断从 visible tooltip 改成 `data-*` attr，仅 dev mode 下显示；(iii) HUD
  workers 计数与 Population 面板同源；(iv) 引入 `survivalScore` —— 每存活
  10 simSec +1 分、每个 First-X milestone +50、每个 starvation death -25，
  在 HUD 侧栏滚动显示，给 endless 模式一个上行曲线；(v) 接通已有的 raid
  pipeline，让 `Threat ≥ 60%` 时随机投放 1-2 个 saboteur 到 north/south gate
  附近，并用 toast `Raiders sighted near <gate>` 提醒玩家。
- 涉及文件：`src/render/PressureLens.js`、`src/render/SceneRenderer.js`、
  `src/ui/hud/HUDController.js`、`src/ui/hud/storytellerStrip.js`、
  `src/ui/tools/BuildToolbar.js`、`src/simulation/meta/SurvivalScoreSystem.js`
  (新增)、`src/simulation/ai/director/EnvironmentDirectorSystem.js`、
  `index.html` (legend DOM)。
- scope：中-大
- 预期收益：直接对应 reviewer 的 #1 / #2 / #3 / #4 / #5 / #6 改进建议；
  解开 "Heat Lens 不可用 → 玩家不开 → 调度系统作业白做" 的恶性循环。
- 主要风险：raid 触发可能拉低 4-seed benchmark deaths 上限；分数系统若
  写到 `state.metrics` 需要避免污染 benchmark KPI。

### 方向 B: 仅修核心 bug + 后台诊断隐藏（最小 polish）
- 思路：只做 Heat Lens halo 去文字化、storyteller LLM 诊断隐藏、HUD workers
  计数同源、Space/L 在 menu phase 完整 swallow。不引入任何新机制。
- 涉及文件：`src/render/PressureLens.js`、`src/ui/hud/HUDController.js`、
  `src/ui/hud/storytellerStrip.js`、`src/ui/tools/BuildToolbar.js`、
  `src/app/shortcutResolver.js`。
- scope：小-中
- 预期收益：能解决 reviewer 第 #1/#2/#3/#6 项 polish 抱怨，分数能拿回 1-1.5
  分（reviewer 说去掉 Heat Lens 噪音 + 修热键 + 隐藏 LLM 错误能到 5/10）。
- 主要风险：完全没有解决"没有死亡威胁/没有 milestone"的结构性问题，分数上
  限被卡在 5/10，与 freeze_policy=lifted 提供的 budget 不匹配。

### 方向 C: 引入完整 tech tree / Tier 解锁
- 思路：在 BuildToolbar 上加 "Tier 1/2/3" 解锁门槛，KITCHEN/SMITHY/CLINIC
  分别需要 5/15/30 工人解锁，外加新建筑 RESEARCH_TENT。
- 涉及文件：`src/config/balance.js`、`src/world/grid/TileTypes.js`、
  `src/ui/tools/BuildToolbar.js`、`src/simulation/construction/`。
- scope：大
- 预期收益：能解决 reviewer 第 #8 项 (tech tree)。
- 主要风险：要新增 tile type / 改 14 类 → 15 类 ID 矩阵，会破坏 ~25 个测试；
  benchmark gate 需要重新调，1 个 round 不够；与 reviewer 高优先级
  (#1-#6) 的 polish 错位。

## 3. 选定方案

选 **方向 A**。理由：

- `freeze_policy: lifted` 明确允许新机制 / building / score / mood，方向 B
  浪费 budget，方向 C 风险过高且偏离玩家最痛点。
- 方向 A 命中 reviewer 改进列表的前 6 条（占总评分 -3.5 分中的 -2.5 分），
  且有结构性收益（survivalScore + raid 触发 = endless 模式有了上行曲线和
  下行威胁，正是反馈循环表里 "长期反馈 / 失败反馈" 两栏 "缺位 / 严重缺位"
  的解药）。
- 不引入新 tile ID（survivalScore 走 `state.metrics`、raid 复用既有
  saboteur），不动 14 类 tile 矩阵，对现有 865 测试影响面可控。
- 4-seed benchmark gate（median ≥42, min ≥32, deaths ≤499）能保住，因为
  raid 的触发被门控在 `Threat ≥ 60%` 且每场最多 2 个 saboteur，对 deaths
  影响可量化（预估 +5~12 deaths，仍在余量内）。

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/PressureLens.js:401-410` — `edit` —
  去掉 halo marker 的 `label: "halo"` 字段（改为 `label: ""`），同时把
  halo 数量从 `MAX_HEAT_MARKERS_HALO=160` 降到 `64`；让 halo 仅靠
  `kind` 渲染脉冲，不再印任何字。
- [ ] **Step 2**: `src/render/SceneRenderer.js:1809-1814` — `edit` — 在
  label DOM 写入前判断 `if (!marker.label) { el.style.display = "none";
  continue; }`，确保空 label 不渲染（halo 完全 silent）。
  - depends_on: Step 1
- [ ] **Step 3**: `src/render/PressureLens.js:284-368` — `edit` — 主标记
  pass 加去重：每个建筑 key 在 `seen` 里只允许 1 个 marker（已经有
  pushUniqueMarker，但当前 `id` 包含 kind 前缀使同一格 RED+BLUE 同时打
  上）。改为以 `tileKey(ix,iz)` 为 dedup key，优先级 RED > BLUE >
  warehouse-idle。
- [ ] **Step 4**: `src/ui/hud/storytellerStrip.js:472-500` — `edit` —
  把 `whisperBlockedReason` 从面向玩家文案改成 in-fiction：`fallback-degraded`
  → `"Story Director: relying on rule-set"`，`fallback-healthy + 0 LLM`
  → `"Story Director: pondering"`，`fallback-healthy + LLM quiet` →
  `"Story Director: settling in"`。原始诊断字符串保留到 `diagnostic.devReason`
  字段，仅 dev mode 暴露。
- [ ] **Step 5**: `src/ui/hud/HUDController.js:1031-1059` — `edit` — tooltip
  里 `Why no WHISPER?:` 前缀改为只在 `state.controls.devMode === true` 时
  追加；`#storytellerWhyNoWhisper` span 也加同样的 dev-mode 门控。
  - depends_on: Step 4
- [ ] **Step 6**: `src/ui/tools/BuildToolbar.js:735-748` — `edit` — Population
  面板 workers 统计从 `!isStressWorker` 改为 `agent.type === "WORKER"`
  全量计数，与 HUDController.js:735 对齐；保留 base/stress 分桶给
  developer-only Population Breakdown。
- [ ] **Step 7**: `src/app/shortcutResolver.js:70-72` — `edit` — Space 键
  在 `phase !== "active"` 时显式 `return null` 而不是 `return null` 的
  fallthrough（防御 future tool-shortcut Digit7→erase 落入 default 分支）；
  并在 `KeyL` 路径上加注释说明 L 不联动 toggleTerrainLens（fertility 叠加
  实为 `#applyContextualOverlay` 的 tool-side 副作用，已有逻辑独立）。
- [ ] **Step 8**: `src/simulation/meta/SurvivalScoreSystem.js` — `add` (新建)
  — 新系统：每 sim-tick 累加 `state.metrics.survivalScore += dt * 0.1`；订
  阅 `EVENT_TYPES.MILESTONE_REACHED` +50、`EVENT_TYPES.WORKER_DIED` -25；写
  `state.metrics.survivalScoreLastDelta` 供 HUD 拉。注册到 `SYSTEM_ORDER`
  紧跟 `MetaSystem` 之后。
- [ ] **Step 9**: `src/ui/hud/HUDController.js:#updateHud` — `edit` —
  在 KPI 区域加一个 `pts: <score>` 显示，从 `state.metrics.survivalScore`
  读；当 `survivalScoreLastDelta > 0` 时给 +N 飘字 1.2 sec。
  - depends_on: Step 8
- [ ] **Step 10**: `src/simulation/ai/director/EnvironmentDirectorSystem.js`
  raid trigger — `edit` — 当 `state.metrics.threatLevel >= 0.6` 且距上一次
  raid > 90 simSec 时，spawn 1-2 个 saboteur VISITOR 在地图边缘并 push toast
  `Raiders sighted near <north|south> gate.`；尊重 4-seed benchmark 上限：
  spawn 前检查 `state.metrics.workerDeathsThisRun < BALANCE.raidDeathBudget
  ?? 18` 时才允许。

## 5. Risks

- 步骤 8/10 改动会影响 4-seed benchmark：survivalScore 单纯写
  `state.metrics`，对 DevIndex 计算无副作用（DevIndex 不读这个字段）；但
  raid spawn 会增加 deaths，需要给 `BALANCE.raidDeathBudget` 留余量并跑
  benchmark 验证 median ≥42 / min ≥32 / deaths ≤499 仍达标。
- 步骤 4 修改 whisperBlockedReason 字符串可能破坏 `test/hud-storyteller.test.js`
  里对 "LLM never reached" 的字符串断言。需要同步更新测试或新增
  `dev-mode` 测试。
- 步骤 6 改 Population 计数可能影响 `test/role-assignment-cannibalise.test.js`
  / `test/hud-truncation-data-full.test.js` 之类依赖 baseW/stressW 字段的
  测试，需要确认 `populationBreakdown.baseWorkers` 字段保留。
- 步骤 1 + 2 改 halo 标签可能破坏 `test/heat-lens-coverage.test.js` /
  `heat-lens-legend.test.js` 里假设 `marker.label === "halo"` 的断言。
- 可能影响的现有测试：`test/shortcut-resolver.test.js`,
  `test/heat-lens-coverage.test.js`, `test/heat-lens-legend.test.js`,
  `test/hud-storyteller.test.js`, `test/hud-truncation-data-full.test.js`,
  `test/role-assignment-cannibalise.test.js`,
  `test/pressure-lens.test.js`。

## 6. 验证方式

- 新增测试：
  - `test/heat-lens-halo-silent.test.js` — buildHeatLens 输出的 halo
    marker `label === ""`，主 marker 每 tile-key 只出现一次。
  - `test/storyteller-llm-diagnostic-hidden.test.js` — devMode=false 时
    tooltip 不含 `LLM`/`WHISPER`/`errored` 字串；devMode=true 时仍含。
  - `test/survival-score-system.test.js` — 跑 60 simSec：score 单调递增；
    模拟 MILESTONE_REACHED 事件 → +50；模拟 WORKER_DIED → -25；deaths 不
    使 score 变负。
- 手动验证：
  1. `npx vite` 起 dev → New Map (Temperate Plains) → 按 L → 期望地图上
     无 "halo" 文字标签，4 种主 label 仍可见且每建筑只 1 个。
  2. 等到 `Threat ≥ 60%` → 期望 toast `Raiders sighted near north gate`
     且最多 2 个 saboteur 出现。
  3. Hover storyteller strip → tooltip 不出现 `LLM` / `WHISPER` /
     `errored` 字面（in-fiction 文案）。在 URL 加 `?dev=1` 后再 hover →
     tooltip 末尾追加 `[dev: LLM ...]`。
  4. 顶栏 Workers 数 与 Population 面板 Workers 数完全一致。
  5. HUD 侧栏出现 `pts: 17` 之类的分数；每过 10 simSec +1 飘字。
- benchmark 回归：
  `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains`
  + 4-seed harness。门槛：DevIndex median ≥42、min ≥32、deaths ≤499。
  当前 v0.8.2 baseline 假设 ~44+ → 不得跌破 42。

## 7. UNREPRODUCIBLE 标记

- Bug #3 (AI Log 触发 navigation, URL 跳 `?template=fertile_riverlands`)：
  代码层 `Grep` 未找到 `template=` query 参数写入逻辑。怀疑 reviewer 误把
  右上角 "New Map" rerolls 当作 "AI Log" 点击 — 两者在 v0.8.2 round-5b
  01c-ui 的 HUD 重排后位置接近。本 plan 不直接修复这条；如果 Round6
  执行时还能复现，单独开 P1 ticket。
- Bug #2 (按 L 同时弹 Overlay: Fertility)：根因是
  `#applyContextualOverlay` 在 selectTool 副作用里推 fertility overlay；
  shortcutResolver L 路径并不触发 fertility。Step 7 已加注释说明，主
  fix 不在本轮范围（属于 tool-selection 副作用，需要 reviewer 01c-ui 视
  角的 polish）。
