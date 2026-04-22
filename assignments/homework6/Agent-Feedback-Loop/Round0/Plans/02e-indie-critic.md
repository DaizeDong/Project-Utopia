---
reviewer_id: 02e-indie-critic
feedback_source: Round0/Feedbacks/player-05-indie-critic.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~140
  new_tests: 1
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

Reviewer 给出 4.5/10，主要诊断是 **"作者的 voice 存在，但只活在 dev-facing 角落，player-facing UI 被 debug label 和 engineer 文体污染"**。
归并为 2 个根本问题（第 3 个列为 P2，不在本轮处理）：

1. **P1 · Player-facing UI 夹带 dev-facing 文本** — 同一块屏幕上出现两套 voice。具体：
   - `populationBreakdownVal` 直接把内部变量名 `Base W / Stress W / Total W / Entities` 印在 player 视图（`index.html:934`, `BuildToolbar.js:777`）。
   - Heat Lens 按钮叫 "Heat Lens (L)"，但 toggle toast 说 "Pressure lens hidden. / Pressure lens restored."（`GameApp.js:1369-1370`），命名不一致。
   - Dev Telemetry dock 的 6 个子栏在第一次展开时全是 `loading...` 占位符（`index.html:1161-1181`），第一印象崩坏。
2. **P1 · 场景 procedural 简报（作者最好的文字）从未在 play phase 稳定可见** — `scenario.title` / `scenario.summary`（见 `ScenarioFactory.js:189,338,473` 的 "Reopen the north timber gate…" / "Bridge two causeways…"）只在 `GameStateOverlay` 开始前/结束后显示，进入 simulation 后从 `statusBar` 消失，玩家必须点进 Entity Focus 才能看到 `Global Headline`。Reviewer 把这段称为"全游戏最好的文字"。

（P2，本轮不做：Terrain Tuning 的 11 个浮点数滑块直接暴露，属于架构级 UX；feature freeze 下应用 preset 而非重做控件——留给后续 plan。）

## 2. Suggestions（可行方向）

### 方向 A: Voice-polish pass — 重写 player-facing 漏出的 debug 文本 + 常驻 scenario headline

- 思路：在 HUD 层把 3 个 voice leak（Base W/Stress W、Pressure/Heat 命名、loading... 占位）改成 player-facing 文案；同时在 `#statusBar` 新增一个常驻的 scenario headline（`scenario.title` + 精简 `scenario.summary`），把作者最好的文字从 overlay 拉到 play 界面。
- 涉及文件：
  - `index.html`（statusBar 新增 slot + 修改 populationBreakdown 初始值 + 修改 dev dock 占位符）
  - `src/ui/tools/BuildToolbar.js`（重写 populationBreakdown 文案）
  - `src/app/GameApp.js`（统一 heat-lens toast 命名）
  - `src/ui/hud/HUDController.js`（新增 scenario headline 更新逻辑 / 或复用现有 controller）
  - 新增 test `test/ui-voice-consistency.test.js`
- scope：小
- 预期收益：直接回应 reviewer 的 "**只是粗糙**"/"**灾难**" 打分 —— 修好这几处能把 4.5 拉到 5.5+；且把 reviewer 盛赞的场景简报放到他所说的 "主 UI"。
- 主要风险：
  - Scenario summary 可能较长（~80-120 字符），在窄屏 statusBar 会截断——需要 CSS max-width + ellipsis。
  - 已有 `test/ui-layout.test.js` 检查 `populationBreakdownVal` 存在（见 `test/ui-layout.test.js:47`），改文案不影响 id，但若改格式字段分隔符需同步检查。

### 方向 B: 引入一个 "Narrator" 频道 —— 把 action toast、scenario headline、AI policy focus 统一封装

- 思路：新增 `src/ui/hud/NarratorChannel.js`，把分散在 `GameApp.js` / `ProgressionSystem.js` / `GameStateOverlay.js` 里各自生成的文案（`Simulation started.` / `Emergency relief stabilized…` / `Pressure lens hidden.`）统一走一个 voice-checked 函数，避免后续再出现 "commit-log 文体" 漏出。
- 涉及文件：新建 `NarratorChannel.js`、大改 `GameApp.js` / `ProgressionSystem.js` / `BuildToolbar.js`、可能触及 10+ 调用点。
- scope：大
- 预期收益：根治问题，未来新增文案自动被过滤。
- 主要风险：
  - 改动面太大，易与其他并行 plan 冲突。
  - 需要重写 ~3-5 个现有测试的断言字符串。
  - 不符合 reviewer 本轮给出的优先级（他要的是 polish，不是 refactor）。

### 方向 C: 把 Dev Telemetry dock 默认"真·隐藏"而不是 "loading..."

- 思路：dev dock 默认其实已经 `dock-collapsed`（`index.html:624`），但 reviewer 点开 "Show Dev Telemetry" 就看到 6 个 loading 占位。改为：若 simulation 尚未 tick 过，dock 展开时显示一个 humanized "Telemetry will populate once the colony starts ticking." banner；tick 开始后各卡自然被 `DeveloperPanel` 覆盖为真实值。
- 涉及文件：`index.html`（6 处 `loading...` 改成统一 "Awaiting first tick…"），`src/ui/panels/DeveloperPanel.js`（首次 tick 判断）。
- scope：小
- 预期收益：消除 reviewer 列入 "**灾难**" 的一条。
- 主要风险：风险低；只修文案不改行为。

## 3. 选定方案

选 **方向 A（扩展形式，含方向 C 的修复）**。理由：

- 方向 A 直接击中 reviewer 三条最尖锐的 polish 投诉（Base W、Pressure/Heat、loading 占位），同时把他盛赞的"场景简报"放到他指名的 "主 UI"。
- Scope 最小（6 个文件、~140 LOC），符合 P1 + feature-freeze 约束（无新 mechanic、无新 system、无数据结构改动）。
- 现有 `test/ui-layout.test.js` 只检查 DOM id 存在性，不检查具体文本格式，回归风险低。
- 方向 B 虽然根治，但 scope 大、改动面广，违反 "HW06 只做 polish/fix/UX" 的硬约束精神（虽然技术上不加 mechanic，但 refactor 面过大易冲突其他 reviewer 的 plan）。
- 方向 C 单做收益太小，并入 A 一起做边际成本为零。

## 4. Plan 步骤

- [ ] Step 1: `index.html:934` — edit — 把 `<div class="small muted" id="populationBreakdownVal">Base W:0 | Stress W:0 | Total W:0 | Entities:0</div>` 的初始文本改为 `Base 0 · Stress 0 · Total 0 · Entities 0`（去掉 "W"），作为 DOM 初始值防止首帧闪烁。同时将外层 label 里可能的 "Base W / Stress W / Total W" 字眼（在紧邻的 `<div class="small">` 表头里）全部 rename 为 "Base workers / Stress workers / Total workers / Entities on map"。若紧邻行没有表头则仅改 populationBreakdownVal 本身。
- [ ] Step 2: `src/ui/tools/BuildToolbar.js:777` — edit — `updatePopulationBreakdown` 的模板串从 `` `Base W:${…} | Stress W:${…} | Total W:${…} | Entities:${…}` `` 改为 `` `Base ${base} · Stress ${stress} · Total ${total} · ${entities} entities` ``。保持变量绑定不变。
  - depends_on: Step 1
- [ ] Step 3: `src/app/GameApp.js:1366-1370` — edit — `toggleHeatLens` 三分支 toast 文案统一使用 "Heat Lens" 措辞：`"heat"→"Heat lens ON — red = surplus, blue = starved."`；`"off"→"Heat lens hidden."`；其它→`"Heat lens restored."`。保留表情符/箭头不变。
- [ ] Step 4: `index.html:1161-1181` — edit — 把 6 个 `<pre … class="dock-body">loading...</pre>` 的占位内容统一替换为 `Awaiting first simulation tick…`。保留 class / id 不变。
- [ ] Step 5: `index.html:691` — edit — 在 `<span id="statusObjective" …>-</span>` 前面新增一个 `<span id="statusScenarioHeadline" class="hud-scenario" title="Current scenario briefing"></span>`，并在相邻 CSS 块（`index.html:54-70` 的 `#statusBar` 规则附近）补 `.hud-scenario { font-style: italic; color: var(--text-muted); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 12px; }`。
- [ ] Step 6: `src/ui/hud/HUDController.js:145` 前后 — edit — 在每帧 `render()` 中读取 `state.gameplay?.scenario?.title` 与 `state.gameplay?.scenario?.summary`，写入 `document.getElementById('statusScenarioHeadline')`。格式：`` `${title} — ${summary}` ``，若任一为空则隐藏节点（`element.hidden = true`）。只在值变化时更新 DOM 避免抖动。
  - depends_on: Step 5
- [ ] Step 7: `test/ui-voice-consistency.test.js` — add — 新增 Node test runner 测试：(a) 解析 `BuildToolbar.js` 的 `populationBreakdownVal` 模板，断言不含 `Base W` / `Stress W` / `Total W` / `Entities:` 这些 debug 片段；(b) 解析 `GameApp.js::toggleHeatLens` 源码，断言 3 个 toast 分支字符串都包含 "Heat" 且都不包含 "Pressure"；(c) 解析 `index.html`，断言 6 个 dev dock 占位符都等于 `Awaiting first simulation tick…`。
  - depends_on: Step 2, Step 3, Step 4
- [ ] Step 8: `CHANGELOG.md:<unreleased section>` — edit — 按 CLAUDE.md 强制的 changelog 规约追加一条：Category "UX Polish (v0.8.x iter)" — "Unify player-facing voice: rename populationBreakdown labels from dev-variable form, unify Heat Lens toggle toast naming, replace Dev Telemetry 'loading...' placeholders, surface scenario headline in statusBar during play. Addresses indie-critic feedback round 0."

## 5. Risks

- **Ellipsis on narrow viewports**：scenario summary 若超过 320px，CSS ellipsis 会裁字，用户看不到后半句。缓解：tooltip 仍保留完整 title。
- **Scenario headline 在 `Quick Start Guide`（无 scenario）场景下会显示空白**：Step 6 的 `hidden` 判断必须覆盖 title 为空的情况，否则会出现孤零零的分隔符。
- **Localization-adjacent**：当前代码全英文 hard-coded，本次改动沿用这一现状；若未来接入 i18n 需再走一次文案审计。
- **已有测试可能命中的断言**：
  - `test/ui-layout.test.js:47` — 检查 `populationBreakdownVal` id 存在，不检查文本，**不受影响**。
  - `test/ui-smoke*.test.js`（如有）若对 toast 文本做 substring 断言，可能需要把 "Pressure lens" 同步改为 "Heat lens"。grep 预检：`grep -n "Pressure lens" test/` 应返回 0 行，否则追加一步修改。
  - `test/e2e-*.spec`（Playwright 侧）不在 HW06 scope。

## 6. 验证方式

- **新增测试**：`test/ui-voice-consistency.test.js` 覆盖 3 个场景见 Step 7。运行 `node --test test/ui-voice-consistency.test.js` 全部通过。
- **回归测试**：`node --test test/*.test.js` 期望 865+ 全通过（允许原有 2 个 skip）。
- **手动验证**：
  1. `npx vite` 启动 `http://localhost:5173` → 点 Start Colony → 观察左下角 Colony 面板 populationBreakdown 一行不再出现 `Base W` / `Stress W`，形如 `Base 12 · Stress 0 · Total 12 · 22 entities`。
  2. 按 `L` 键 3 次（pressure → heat → off → pressure），toast 应连续显示 `Heat lens ON …` / `Heat lens hidden.` / `Heat lens restored.`，不再出现 "Pressure"。
  3. 点 "Show Dev Telemetry" 展开 dock，6 个卡片初始内容为 `Awaiting first simulation tick…`，而非 `loading...`；暂停状态下保持该占位，unpause 后被真实 telemetry 覆盖。
  4. 在 statusBar 顶部（resource 行 vs speedControls 之间）可见一行 italic 灰字 scenario headline，形如 `Island Relay — Bridge two causeways, claim the relay depot…`；切换模板生成新场景后文本随之更新。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`，DevIndex 不得低于当前值（baseline≈44）- 5% = 41.8。纯 UI 文案修改理论上对 sim 无影响，基线应 1:1 保留。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。所有 4 处 voice-leak 都在仓库代码/HTML 里直接可定位（`index.html:934` / `BuildToolbar.js:777` / `GameApp.js:1369-1370` / `index.html:1161-1181`），scenario headline 的 "不可见" 问题也通过阅读 `GameStateOverlay.js`（只在 `isInteractive` phase 显示）和 `statusBar` HTML（无 scenario 节点）交叉验证。未启动 Playwright，因现象已从源码可证实，无需浏览器复现。
