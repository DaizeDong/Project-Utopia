---
reviewer_id: 02c-speedrunner
feedback_source: Round0/Feedbacks/player-03-speedrunner.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P1
estimated_scope:
  files_touched: 5
  loc_delta: ~180
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

Speedrunner 打完 4 个 run 得出**"躺平优于干预"**结论（Run3 躺平 ~200 分 > Run1 轻度 ~150 > Run2 重度 ~140 > Run4 pop-pump -157），其症状是多点的（没 target、场景目标 invisible、DevIndex 只降、FF 太慢、tooltip 没收益），病因归并为下面 2 条根因：

1. **R1（P1 · UX 信息暴露）：玩家看不到游戏实际在用什么给他算分，也看不到自己离"做对的事"还差多少。**
   `state.gameplay.scenario.targets`（warehouses N/M、farms N/M、routes、depots）只在 Debug 面板里可见（Run4 里 speedrunner 是靠 Debug World State 行 "Island Relay: 0/2 routes …" 才发现负分来源）；`state.gameplay.devIndexDims`（population/economy/infrastructure/production/defense/resilience 六维）只发布在 state 上，**主 HUD 完全不露**；`BALANCE.survivalScorePerSecond / perBirth / survivalScorePenaltyPerDeath` 这些分数规则也没在 UI 任何角落说过。结果是：玩家做的动作和分数之间缺少一条可见的因果链，干脆不做。`getFrontierStatus()` 在 `src/ui/interpretation/WorldExplain.js:98-113` 已经算出漂亮的 scenario 进度字符串，只是没被 HUD 主渲染路径消费——**数据有，管道没通**。

2. **R2（P2 · Fast-Forward 吞吐）：⏩ 按钮把 `timeScale` 设到 2.0，但 `simStepper.js:12` clamp 上限是 3.0；speedrunner 实测体感 x1.5~x2 并要求 x4/x8。**
   这是一条很窄的吞吐缺口：UI 档位少，且 stepper 的硬 clamp（3.0）卡在"x4 开不出来"上。由于 v0.8.1 Phase 10 刚做完 long-horizon determinism hardening，不能盲目拉高 clamp（会触发 accumulator 上限 0.5s 的 spiral-of-death），所以必须同时放宽 clamp **和** 档位，并保留保险。

R1 是 plan 的主轴（信息暴露）；R2 作为小附赠（一条档位按钮 + 一处 clamp 放宽），两者合起来覆盖 speedrunner 反馈里最致命的那 2 条主线（"看不到目标、看不到分怎么来" + "FF 太慢"）。

## 2. Suggestions（可行方向）

### 方向 A: HUD Scoreboard + Objective Ribbon（信息暴露优先，主推）
- 思路：在 `#statusObjective` 已显示 `Survived HH:MM:SS Score N · Dev D/100` 的基础上，紧贴后面插入一条"scenario progress ribbon"（`warehouses 2/3 · farms 1/4 · routes 0/2 · depots 0/1`，直接消费现成的 `getFrontierStatus()`）；再加一条 Score-deltas tooltip，把 `BALANCE.survivalScorePerSecond / perBirth / perDeath` 写进去，玩家 hover `#statusObjective` 就能看到"活着+1/s，出生+5，死亡-10"。外加在 DevIndex 显示处再挂一个 hover tooltip 列出 6 维 devIndexDims，告诉玩家 Dev 由什么构成、哪一维拖后腿。
- 涉及文件：
  - `src/ui/hud/HUDController.js`（`render()` + `setupSpeedControls()` 周围）
  - `index.html`（`statusObjective` 周围的 HUD 结构，插 `statusScenario` span，不新增主面板）
  - `src/ui/interpretation/WorldExplain.js`（导出一个 `getSurvivalScoreBreakdown(state)` 纯函数，读 BALANCE 和当前 deltas）
- scope：中（~150 LOC 新增 + 1 个纯函数 + 1 个测试）
- 预期收益：**直接击中 Speedrunner 的 #2 建议（Scenario checklist 从 Debug 搬到 HUD）与 #3、#4 建议（Dev 涨跌可见、Score 归因可见）**。不改任何 mechanic，只把 state 已有的数字投影到 HUD。对普通玩家也有正向外部性。
- 主要风险：HUD 横幅已经拥挤，需要 responsive 折叠（窄屏藏进 tooltip）；`getFrontierStatus()` 在 survival 模式下 scenario anchors 可能为空（必须容错为 "endless"）。

### 方向 B: 改 DevIndex 让"干预有正收益"（治 ROI 负的根因）
- 思路：Run2 里玩家放 4 个 farm+2 个 warehouse Dev 从 55 掉到 37，因为 DevIndex 的 infrastructure/production 两维对 "短时间 wood 消耗 + 建筑未进入稳态" 惩罚过重。调 `src/config/balance.js` 的 `devIndexResourceTargets` / `devIndexProducerTarget` 与 `DevIndexSystem.update()` 的 smoothing 窗口（现在 60 tick，建 3 秒），让积极建设在 5~10 秒内转正。
- 涉及文件：
  - `src/config/balance.js`（devIndex 相关常量）
  - `src/simulation/meta/DevIndexSystem.js`（smoothing 可能需要"事件型"正反馈）
  - `src/simulation/telemetry/EconomyTelemetry.js`（scoreAllDims 各维的归一化）
- scope：大（触及 DevIndex 的 6 维 scoring 函数，可能级联影响 RaidEscalatorSystem 的 raid tier，要回跑 long-horizon-bench）
- 预期收益：能真正扭转"干预=负收益"。
- 主要风险：**跨越 feature-freeze 边界**——CLAUDE.md 明确 HW06 后"不加新 mechanic，只做 polish / fix / UX"。调 DevIndex 权重属于改平衡，不属于 UX polish，且 Phase 10 刚做完 determinism hardening，改权重极可能让 long-horizon-bench 回归；再者 Phase 8 Survival Hardening 日志里明说"结构性 carry/deposit policy 推到 Phase 9"，这里再动 DevIndex 容易把两个 phase 的边界搅浑。Orchestrator 的 Hard-Constraint-5 会拒收。

### 方向 C: FF 档位扩到 x4（狭义吞吐修复）
- 思路：`HUDController.setupSpeedControls()` 里把 `speedFastBtn` 目标 `timeScale` 从 2.0 提到 4.0，并在 HTML 新增 `speedUltraBtn`（x8）；同时把 `simStepper.js:12` 的 `Math.min(3, timeScale || 1)` 放宽到 8，但保留 `maxSteps` 和 `accumulatorSec ≤ 0.5` 这两个吞吐保险，避免 spiral-of-death。
- 涉及文件：
  - `src/ui/hud/HUDController.js`（speed 按钮 handler）
  - `src/app/simStepper.js`（clamp 上限）
  - `index.html`（新增 `#speedUltraBtn`）
- scope：小（~20 LOC）
- 预期收益：直接击中 Speedrunner 的 #5 建议（FF 做到 x4 / x8）。
- 主要风险：高 timeScale + 大地图可能让单帧 sim 步数被 `maxSteps` clip，导致"推不满"的假象；需要 determinism 回归（`test/sim-stepper.test.js` 类）。

## 3. 选定方案

选 **方向 A（HUD Scoreboard + Objective Ribbon）为主推**，**附带方向 C 的最小变更**（仅加一个 x4 档位按钮 + 把 clamp 从 3 放到 4，不做 x8，保守）。

理由：
- 方向 A 覆盖 speedrunner 反馈里密度最高的 3 条"看不见"问题（scenario 目标、Dev 归因、Score 规则），每一条都只是把 state 里已有字段投影到 DOM，不触碰任何 balance 常量，**不跨越 feature-freeze 边界**。
- 方向 B 被 Hard-Constraint-5 明确排除（改 DevIndex 权重是 balance tuning 而非 UX polish；Phase 9 已经点名要在 carry/deposit policy 层面治这个病，ench 不应抢跑）。
- 方向 C 主体会动 determinism 相关的 simStepper，完整改动要额外一套 bench 回归；但**只加 x4 档位**（不加 x8）是小变更，风险极低，作为"附赠"并入方向 A 的 plan，总 scope 仍可控。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/interpretation/WorldExplain.js:113` — add — 新增导出函数 `getSurvivalScoreBreakdown(state)`，返回 `{ perSec, perBirth, perDeath, livedSec, births, deaths, subtotalSec, subtotalBirths, subtotalDeaths }`。数据来源：`BALANCE.survivalScorePerSecond/perBirth/survivalScorePenaltyPerDeath`、`state.metrics.timeSec`、`state.metrics.birthsTotal`、`state.metrics.deathsTotal`。纯函数，零副作用。
- [ ] Step 2: `src/ui/interpretation/WorldExplain.js` — add — 在 `getFrontierStatus()` 下方新增 `getScenarioProgressCompact(state)`，返回单行字符串形如 `"routes 0/2 · depots 0/1 · wh 2/3 · farms 1/4 · lumbers 0/2"`，survival-mode / 无 scenario anchors 时返回 `"endless · no active objectives"`。内部复用 `getScenarioRuntime(state)`，不重复遍历 grid。
  - depends_on: —
- [ ] Step 3: `index.html:691` — edit — 把当前单行 `<span id="statusObjective">` 拆成父容器 `<div id="statusScoreboard">`，内部依次放 `<span id="statusObjective">`（保留原 Score/Dev 输出）、`<span id="statusScenario">`（Step 2 的紧凑进度行）、`<span id="statusScoreBreak" title="...">`（Step 1 breakdown 作为 tooltip title + 隐藏 span 内容，窄屏可折叠）。父 div 加 `display:flex;gap:8px;flex-wrap:wrap;`。不新增 `<link>` 或外部 CSS 资产。
  - depends_on: Step 1, Step 2
- [ ] Step 4: `src/ui/hud/HUDController.js:11-92` — edit — 在 constructor 的 DOM-cache 段补 `this.statusScenario = document.getElementById("statusScenario")` 与 `this.statusScoreBreak = document.getElementById("statusScoreBreak")` 两个 ref（与 Step 3 的 id 对齐）。
  - depends_on: Step 3
- [ ] Step 5: `src/ui/hud/HUDController.js:render()` — edit — 在 `statusObjective` 渲染分支之后（约现有第 252-267 行），追加：读取 Step 2 的 `getScenarioProgressCompact(state)` 写入 `this.statusScenario.textContent`；读取 Step 1 的 `getSurvivalScoreBreakdown(state)` 拼成 `"+${perSec}/s · +${perBirth}/birth · -${perDeath}/death (lived ${subtotalSec} · births ${subtotalBirths} · deaths -${subtotalDeaths})"` 写入 `this.statusScoreBreak.title` **与** `textContent`（小字）。
  - depends_on: Step 1, Step 2, Step 4
- [ ] Step 6: `src/ui/hud/HUDController.js:render()` — edit — 在 DevIndex 显示分支（约 263-266 行）之后，构造 `const devTooltip = Object.entries(state.gameplay.devIndexDims ?? {}).map(([k, v]) => \`${k} ${Math.round(v)}\`).join(" · ")`; 写入 `this.statusObjective.title = devTooltip`。这样玩家 hover 总分条就能看到 6 维 Dev 归因。不新增 DOM 元素。
  - depends_on: Step 4
- [ ] Step 7: `src/ui/hud/HUDController.js:setupSpeedControls()` (lines 94-106) — edit — 把 `this.speedFastBtn` 的 handler 目标 `timeScale` 从 `2.0` 改到 `4.0`；新增 `this.speedUltraBtn = document.getElementById("speedUltraBtn")` 的 ref + handler，目标 `timeScale = 4.0`（保守，不做 x8）。现有 `speedFastBtn` 改名 title 为 "Fast forward (4x)"。`render()` 末尾的 `const fast = (state.controls.timeScale ?? 1) > 1.2` 判定保持不变。
  - depends_on: —
- [ ] Step 8: `src/app/simStepper.js:12` — edit — 把 `const safeScale = Math.max(0.1, Math.min(3, timeScale || 1));` 改为 `Math.min(4, timeScale || 1)`。保留 `accumulatorSec` 的 `Math.min(0.5, ...)` clamp 与 `capSteps` 保险；不动 `fixedStepSec` 上下限。
  - depends_on: Step 7
- [ ] Step 9: `index.html:706-707` — edit — 把 `#speedFastBtn` 的 `title` 更新为 `"Fast forward (4x)"`、`aria-label="Fast forward 4x"`；无需新增 `#speedUltraBtn`（Step 7 已把 4x 归并到 FastBtn）。如果选择保留 2x 按钮作为"温和 FF"，在 `#speedPlayBtn` 与 `#speedFastBtn` 之间插入一个 `<button id="speedMediumBtn" title="Fast forward (2x)">` 即可（可选子步骤，不阻塞验收）。
  - depends_on: Step 8

## 5. Risks

- **R-1 HUD 拥挤**：窄屏（<1280px）下 `#statusScoreboard` 可能换行到第二行遮挡 canvas 顶。缓解：Step 3 里父 div 加 `flex-wrap:wrap;font-size:11px;`，并给 `#statusScoreBreak` 加 `@media (max-width: 1280px) { display:none; }` 把 breakdown 文本藏到 title（tooltip 仍可 hover）。
- **R-2 Scenario 目标为空**：survival mode 下 `state.gameplay.scenario.anchors` 可能是空对象，`getScenarioRuntime()` 会返回 `routes:[], depots:[]`。Step 2 必须显式返回 `"endless · no active objectives"`，否则 HUD 会出现孤单的 `" · wh 2/3 · ..."`。
- **R-3 determinism 回归**：Step 8 把 clamp 从 3 放到 4，现有 `test/sim-stepper.test.js` / `test/app-*.test.js` 如果用 3.0 做边界断言会挂（grep 验证：当前 codebase 未发现 `timeScale:3` 的硬编码测试断言，但 Coder 执行时务必先跑全量 `node --test test/*.test.js`）。
- **R-4 tooltip 覆盖**：Step 6 写 `this.statusObjective.title` 会覆盖现有 title `"Survival time and running score (Phase 4 endless mode)"`。缓解：用 `\`Dev breakdown: ${devTooltip}\`` 前缀保留语义。
- **R-5 long-horizon bench**：方向 C 只加了 1 档位 + 把 clamp 放 1 格，不改 fixedStepSec，理论上对 day-365 bench 结果零影响，但必须回归 `scripts/long-horizon-bench.mjs seed 42 temperate_plains`，确认 DevIndex 不低于当前 44 * 0.95 = 41.8。
- 可能影响的现有测试：
  - `test/ui-layout.test.js`（Run 过 `doctrineSelect` 等 id 存在性检查；**需追加 `statusScenario` / `statusScoreBreak` 到白名单**）
  - `test/hud-controller.test.js`（如果存在，会对新 DOM ref 为 null 做容错；Step 4 的 `document.getElementById(...) ?? null` 已遵守）
  - `test/sim-stepper.test.js`（Step 8 的 clamp 变更）
  - `test/world-explain.test.js`（Step 1、Step 2 新增导出函数的覆盖）

## 6. 验证方式

- **新增测试**：
  - `test/world-explain-scoreboard.test.js` — 覆盖 `getSurvivalScoreBreakdown()` 对 zero-state / birth-spike / death-spike / missing-metrics 的返回一致性；覆盖 `getScenarioProgressCompact()` 在 survival-mode（anchors 空）与 scenario-mode（完整 anchors）两种路径。
  - `test/sim-stepper-timescale.test.js` — 给 `computeSimulationStepPlan` 喂 `timeScale=4` 和 `timeScale=99`，断言分别 clamp 到 4 和 4；喂 `timeScale=2` 断言仍按 2 执行；确保 `accumulatorSec` 仍 ≤0.5。
- **手动验证**（dev server 已在 `http://localhost:5173` running）：
  1. 开新 run（Fertile Riverlands / seed 1337）→ HUD 顶部应看到 `Survived 00:00:05 Score 6 · Dev XX/100` 后面紧跟 `routes 0/2 · depots 0/1 · wh 0/2 · farms 0/4 · lumbers 0/2`（或 endless 占位）。
  2. Hover `#statusObjective` → 看到 `Dev breakdown: population 42 · economy 55 · infrastructure 18 · production 22 · defense 0 · resilience 30`。
  3. Hover / 查看 `#statusScoreBreak` → 看到 `+1/s · +5/birth · -10/death`。
  4. 点 ⏩ 按钮 → `#gameTimer` 每秒前进应约 4s（Speedrunner 之前 x1.5~x2 的体感应该翻倍）。
  5. 切 `doctrineSelect` → 顶部 Dev 归因 tooltip 的 6 维该在若干秒后重权。
- **benchmark 回归**：
  - `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`。
  - DevIndex 不得低于 **41.8**（当前 v0.8.1 基线 44 * 0.95）；deaths_total 不得高于 **477**（当前 454 * 1.05）。理论上本 plan 不碰平衡参数，回归应为 0 差，差异来自 clamp 放宽后 FF 档位的 accumulator 行为。
- **回归套件**：`node --test test/*.test.js` 全绿（867 项，现 2 项 pre-existing skip 可忽略）。

## 7. UNREPRODUCIBLE 标记（如适用）

未启用 Playwright 复现。Speedrunner 的观察在源码侧已经逐条定位到具体 state 字段（`state.gameplay.scenario.targets`、`state.gameplay.devIndexDims`、`BALANCE.survivalScorePerSecond`、`state.controls.timeScale` clamp 值），属于**"信息存在但不暴露 / 档位太少"** 类型的 UX gap，不是动态复现类 bug，所以跳过 browser 复现以控制本次 plan 时长预算。如果 Coder 阶段想做运行时截图证据，可用 `mcp__plugin_playwright_playwright__browser_navigate` 打开 `http://localhost:5173` → 开 Debug 面板 → 读 World State 行验证 `"0/2 routes online"` 这类字段确实只在 Debug 里可见，以作为"数据有、管道没通"证据。
