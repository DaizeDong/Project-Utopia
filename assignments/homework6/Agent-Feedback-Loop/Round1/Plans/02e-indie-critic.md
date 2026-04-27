---
reviewer_id: 02e-indie-critic
feedback_source: Round1/Feedbacks/02e-indie-critic.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~180
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

Reviewer 给 **3.5/10**，Round0 polish pass 已经修掉了明显的 debug leak（Base W / Pressure lens / loading...），这轮他钻进更深的一层：**"作者的声音没有给玩家"**。归并为 2 个可在 HW06 feature-freeze 边界内处理的根本问题（第 3 个 P2 列在最后）：

1. **P1 · 模板 × 场景绑定错配 + 场景文案 template-agnostic** — `ScenarioFactory.js:5-12` 把 `fertile_riverlands` 和 `archipelago_isles` 都硬编到 `"frontier_repair"` 以外的另外两个 family，但 `temperate_plains` 和 `fertile_riverlands` 都被绑到 `frontier_repair`；于是 Fertile Riverlands 打开抽到的场景永远是 "**Broken Frontier** — Reconnect the west lumber line…"，河网地图根本没有自己的场景叙述。Reviewer 原话："Fertile Riverlands 里抽到的 scenario 居然又是 'Broken Frontier · frontier repair'，和 Temperate Plains 完全一样。" 这不是缺新 mechanic，而是**场景标题/简报缺 template-specific voice string**——6 个模板共用同一批 `title/summary/hintCopy`。
2. **P1 · 内部 debug 标签和 metric 裸奔** — 包括：
   - `storytellerStrip.js:22` 把 `"Rule-based Storyteller"` / `"LLM Storyteller"` 前缀硬挂在 HUD 第一行（"[Rule-based Storyteller] frontier buildout: ..."），reviewer 原话："[Rule-based Storyteller] 这个前缀尤其诚实——它告诉你：本游戏有一个'讲故事者'模块，而它是 rule-based 的 fallback ... 这种技术细节的泄漏在独立游戏语境下是**非常不专业的**"。
   - `WorldExplain.js:147-162` 的 `getScenarioProgressCompact` 把 `routes 1/1 · depots 1/1 · wh 7/2 · farms 4/4 · lumbers 3/3 · walls 7/4` 甩到 statusBar，reviewer 原话："直接把内部目标计数器原封不动甩在屏幕顶端"。
   - `ProgressionSystem.js:245` 的 Emergency relief toast 文案冷冰冰 ("Emergency relief stabilized the colony. Use the window to rebuild routes and depots.")，没有叙事感。
   - `#statusAction` 的 CSS ellipsis 导致 "Heat lens ON — red = surplus, blue = starved." 在 HUD 拥挤时被截断为 "...re..."（`index.html:103-105`，`max-width: 420px`，`white-space: nowrap`）。

（P2，本轮不做：没有音效/音乐——这要新资源管线，不在 polish/fix/UX scope；colonist detail panel 深度化——`EntityFocusPanel` 已存在，但把它变成 DF-style profile 是中等规模重构，Round0 01e-innovation 刚加过 workerName/traits/backstory，数据链路还未跑通到全局事件 log，留给 Round 2。）

## 2. Suggestions（可行方向）

### 方向 A: Template-Voice pass —— 给 6 个模板写专属场景文案 + 把 storyteller prefix / wh-counter ribbon 翻译成玩家语言

- 思路：
  1. 把 `ScenarioFactory.js` 里 3 个 `build*Scenario()` 函数的 **title/summary/hintCopy 参数化**，接受一个 `voice` 对象（从 templateId 查表）；为 6 个模板各写一份 `scenarioVoice`（12-18 行 copy / 每模板）。Family 仍然是 3 个（代码逻辑不变），但玩家看到的 title/summary 与 templateId 1:1 对齐。**不加新 scenario family、不改 anchor/route/depot 结构**——freeze-safe。
  2. 把 `storytellerStrip.js:22` 的 `[Rule-based Storyteller]` / `[LLM Storyteller]` 前缀改为 player-facing 语气："**The colony is thinking…**"（fallback）/ "**Your storyteller whispers…**"（LLM）。源头信息仍保留在 `title=` attr 里给 dev 看。
  3. 把 `WorldExplain.js:147-162` 的 compact ribbon 重写：`routes 1/1 · depots 1/1 · wh 7/2 · farms 4/4` → `West route open · East depot claimed · Warehouses 7 (+5 over plan) · Farms fully staffed`——绑 scenario anchor label，数字只在 over/under 时显示。
  4. 把 `ProgressionSystem.js:245` Emergency relief toast 改成叙事语气：`"A relief caravan crested the ridge as the last grain ran out — +${foodBoost} food, +${woodBoost} wood. Rebuild your routes before the next wave."`。
  5. 修 `#statusAction` 的 `max-width: 420px` 截断，把它改到 `min-width: 280px; max-width: min(560px, 45vw)`，并且在 compact 模式下保留 ellipsis（title attr 已经 mirror 完整文本，见 `HUDController.js:500`）。
- 涉及文件：
  - `src/world/scenarios/ScenarioFactory.js`（新增 `SCENARIO_VOICE_BY_TEMPLATE` 表 + 注入 voice；build*Scenario 只读 voice，不改结构）
  - `src/ui/hud/storytellerStrip.js`（前缀改写）
  - `src/ui/interpretation/WorldExplain.js:147-162`（ribbon 重写）
  - `src/simulation/meta/ProgressionSystem.js:244-245`（Emergency toast 文案）
  - `index.html:103-105`（`.hud-action` CSS）
  - 新增 test：`test/scenario-voice-by-template.test.js`、`test/storyteller-voice.test.js`
- scope：中
- 预期收益：直接命中 reviewer 4/6 条 "致命伤"——**模板 × scenario 错配**、**术语泄漏**、**事件叙述冷冰冰**、**Heat Lens 截断**。reviewer 暗示只要 "给每个模板写一句'这里曾经发生过什么'" 评分能翻倍，本方案按这个方向最小集 polish。
- 主要风险：
  - `test/world-explain-scoreboard.test.js` 当前断言 compact ribbon 文本格式，改写后需要同步更新 assertion（估计 1-2 行）。
  - `test/toast-title-sync.test.js` 可能锁 `"Emergency relief stabilized"` 原文；需 grep 预检。
  - 每模板 copy 需 freeze 前敲定 tone，避免未来 i18n 回头重写。

### 方向 B: 引入 `ColonistTicker` —— 让 worker displayName 在事件频道里出现

- 思路：Round0 01e-innovation 已给 worker 加了 `displayName`（`EntityFactory.js:191`，如 "Bjorn-42"）和 `backstory`，但 `MortalitySystem.js` 只记录 `deathReason` 数字，没触发任何 toast/log。新增一个 "ColonistTicker"：死亡、首次被雇佣、饥饿 60s 等事件，用 displayName 写一行 toast（`"Bjorn-42 starved near the west warehouse."`）到 `state.controls.actionMessage`。
- 涉及文件：新建 `src/ui/hud/ColonistTicker.js`、修改 `src/simulation/lifecycle/MortalitySystem.js`、`src/simulation/population/PopulationGrowthSystem.js`、`src/app/GameApp.js` 的系统注册。
- scope：中-大
- 预期收益：根治 reviewer 的 "没有 NPC personality" 投诉，比方向 A 更直指他最尖锐的痛点。
- 主要风险：
  - 触发频率没调好容易刷屏；需要 rate-limit 系统。
  - 改了 8+ 个 hot-path 文件，回归面大，可能和 Round 0 刚落地的 logObjective/toast 合流冲突。
  - **边缘 freeze**：新增 UI "ticker channel" 算不算新 mechanic？严格解释是 "UX"，但 orchestrator 可能判定越界。

### 方向 C: 只做最快的 1 条——把 `ScenarioFactory.js:5-12` 的 mapping 改成**template-1:1**，每个模板专属 scenario family

- 思路：把 6 模板从"3 family 共用"拆成"6 family 各一份"，复制 3 个现有 build*Scenario() + 改 title/summary/hintCopy 为模板专属文案。
- 涉及文件：仅 `ScenarioFactory.js`（+200 LOC 重复代码）。
- scope：中
- 预期收益：能解决 "Fertile Riverlands 抽到 Broken Frontier" 的具体抱怨。
- 主要风险：**300 LOC 重复代码**污染，违反 DRY；且只动 scenario voice、不解决另外 3 条致命伤；性价比低于方向 A。

## 3. 选定方案

选 **方向 A（Template-Voice pass）**。理由：

- 方向 A 是**最大覆盖 × 最小越界**：一次 polish 同时命中 reviewer 6 条致命伤里的 4 条（模板错配 / 术语泄漏 / 事件叙述 / Heat 截断）。
- Scope 中等（~180 LOC / 6 files），全部是 **string + CSS** 层的修改，没触碰 simulation / AI pipeline，严格遵守 freeze。
- 方向 B 有越界风险（新增 ticker channel），而且 reviewer 本轮没有把 "加 colonist toast" 列为最优先——他先抱怨的是 "[Rule-based Storyteller]" 和 "Broken Frontier" 错配，方向 A 正好命中。
- 方向 C 代码重复太脏，而且只解决 1/6 投诉。
- 现有 865 tests 里涉及的断言很少触及这些 string（见 Risks 预检），回归面可控。

## 4. Plan 步骤

- [ ] Step 1: `src/world/scenarios/ScenarioFactory.js:1-13` — `add` — 在 `SCENARIO_FAMILY_BY_TEMPLATE` 下方新增 `SCENARIO_VOICE_BY_TEMPLATE`，一个 `Object.freeze` 映射，6 个 key = templateId，value = `{ title, summary, hintInitial, hintAfterLogistics, hintAfterStockpile, hintCompleted }`。为每个模板写 template-specific copy，例如：
  - `temperate_plains`: `{ title: "Broken Frontier", summary: "Reconnect the west lumber line, reclaim the east depot, then scale the colony.", ... }`（保留现有文案作默认）
  - `fertile_riverlands`: `{ title: "Silted Hearth", summary: "Last year's flood buried the west road under silt — rebuild the lumber line before the river runs dry.", ... }`
  - `rugged_highlands`: `{ title: "Gate Bastion", summary: "Reopen the north timber gate, reclaim the south granary, and stabilize two chokepoints.", ... }`
  - `fortified_basin`: `{ title: "Hollow Keep", summary: "The old keep's gates hang open — hold north and south before raiders find the breach.", ... }`
  - `archipelago_isles`: `{ title: "Island Relay", summary: "Bridge two causeways, claim the relay depot, and connect the harbor to the outer fields.", ... }`
  - `coastal_ocean`: `{ title: "Driftwood Harbor", summary: "A gale scattered the fleet — rebuild the harbor causeways before the autumn caravan arrives.", ... }`
- [ ] Step 2: `src/world/scenarios/ScenarioFactory.js:139-269 (buildFrontierRepairScenario)`, `271-408 (buildGateChokepointScenario)`, `410-556 (buildIslandRelayScenario)` — `edit` — 每个函数顶部读取 `const voice = SCENARIO_VOICE_BY_TEMPLATE[grid.templateId] ?? DEFAULT_VOICE_FOR_<family>;`，然后把返回对象里 `title`, `summary`, `hintCopy.initial/afterLogistics/afterStockpile/completed` 四处改为 `voice.title / voice.summary / voice.hintInitial / voice.hintAfterLogistics / ...`。**不改 anchors / routeLinks / depotZones / chokePoints / wildlifeZones / weatherFocus / eventFocus / targets / objectiveCopy** —— 只改 player-facing strings。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/storytellerStrip.js:18-51` — `edit` — 把 `prefix = source === "llm" ? "LLM Storyteller" : "Rule-based Storyteller"` 替换为 player-voice 版本：`const prefix = source === "llm" ? "Your storyteller whispers" : "The colony is thinking"`（LLM 分支保留 "storyteller" 一词因为 reviewer 觉得它有诗意，但去掉 "LLM" / "Rule-based" 工程前缀）。同时把 idle fallback `"Rule-based storyteller idle — colony on autopilot"` 改为 `"The colony drifts, waiting for orders."`。**不改 `source` 字段读取逻辑**，只改输出 string。保留 existing tests 里对 "storyteller" 子串的断言（`test/hud-storyteller.test.js` 若有），同步调整。
- [ ] Step 4: `src/ui/interpretation/WorldExplain.js:147-162` — `edit` — 重写 `getScenarioProgressCompact`：拿到 `runtime.routes` 的 `connected` 布尔数组后，渲染为 `route.label` + 状态 token（例如 `"west lumber route open"` vs `"west lumber route broken"`）；depots 同理用 `depot.label`；`wh/farms/lumbers/walls` 四项改为只在 `count < target` 时显示 `"${target - count} more warehouses needed"`，在 count >= target 时合并为一句 `"Logistics on plan."`。总字符数控制在 ~160 以内。Fallback 文案 `"endless · no active objectives"` 改为 `"Endless survival — no active briefings."`。
- [ ] Step 5: `src/simulation/meta/ProgressionSystem.js:244-246` — `edit` — 把 `logObjective(state, \`Emergency relief arrived: +${foodBoost} food, +${woodBoost} wood, threat -${threatRelief.toFixed(0)}.\`);` 和 `state.controls.actionMessage = "Emergency relief stabilized..."` 两行改为叙事语气：`logObjective(state, \`A relief caravan crested the ridge as the last grain ran out — +${foodBoost} food, +${woodBoost} wood, threat eased by ${threatRelief.toFixed(0)}.\`); state.controls.actionMessage = "The colony breathes again. Rebuild your routes before the next wave.";`。保留 `actionKind = "success"`。
- [ ] Step 6: `index.html:103-105` — `edit` — 把 `.hud-action { padding: 2px 6px; border-radius: 6px; font-size: 10px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ... }` 的 `max-width: 420px` 改为 `min-width: 260px; max-width: min(560px, 45vw);`，其他字段不动。这样在 1280px+ 屏幕上 Heat lens 文案完全可见，在 compact/窄屏仍走 ellipsis + title tooltip。
- [ ] Step 7: `test/scenario-voice-by-template.test.js` — `add` — 新增 Node test runner 测试：(a) import `buildScenarioBundle`，mock 6 个 templateId 的 grid，断言每个返回的 `scenario.title` / `scenario.summary` 两两不同；(b) 具体断言 `fertile_riverlands` 的 title !== `"Broken Frontier"`（回应 reviewer 原话）；(c) 断言 6 个 scenario 的 `hintCopy.initial` 长度 >= 30 字符（防止有空 voice entry）。
  - depends_on: Step 2
- [ ] Step 8: `test/storyteller-voice.test.js` — `add` — 新增测试：(a) 对 `computeStorytellerStripText` 各种 `ai.lastPolicySource` 输入 ("llm" / "fallback" / "none" / "" / null)，断言输出**不含**子串 `"Rule-based Storyteller"` 和 `"LLM Storyteller"` 和 `"[LLM"` 和 `"[Rule-based"`；(b) 断言 idle fallback 的输出**不含** `"idle"`、`"autopilot"`、`"Rule-based"` 等 dev term；(c) 断言 输出中仍包含 `"storyteller"` 或 `"colony"`（保留作者的诗意）。
  - depends_on: Step 3
- [ ] Step 9: `CHANGELOG.md` (current unreleased section) — `edit` — 按 CLAUDE.md 强制的 changelog 规约追加一条 UX Polish 子条目："v0.8.x iter (Round 1 indie-critic) — Template-specific scenario voice (6 templates now have unique title/summary/hint copy, fixing Fertile Riverlands → 'Broken Frontier' mismatch); storyteller strip prefix rewritten in player voice; scenario progress ribbon humanized (routes/depots/wh/farms now use scenario anchor labels, over-plan folded into single line); Emergency relief toast narrativized; `.hud-action` widened so Heat Lens toast no longer truncates on standard desktop."

## 5. Risks

- **`test/world-explain-scoreboard.test.js` 断言更新**：当前 Round0 速度跑测试很可能对 `routes X/Y · depots X/Y` 格式做 substring 断言。**缓解**：Step 4 后先 grep `"routes "` / `"depots "` / `"wh "` 出现位置，同步更新 assertion。
- **`test/toast-title-sync.test.js` 锁 Emergency relief 原文**：Step 5 改 actionMessage 前先 grep `"Emergency relief stabilized"`，若命中则在同一 PR 更新 test 预期值。
- **Scenario voice 的 tone 一致性**：6 份新 copy 在同一 PR 内敲定；若第一轮 tone 不合 reviewer 胃口，留 header comment 标记 voice authorship，便于后续迭代。
- **CSS 改动的视觉回归**：`.hud-action` max-width 改成 min/max/vw 组合可能让旁边 `#storytellerStrip` 在某些断点布局挤压；**缓解**：本步只放宽上限，不动下限；compact 模式 CSS（`#ui.compact .hud-action.flash-action`，`index.html:149`）不受影响。
- **可能影响的现有测试**（grep 预检清单，Coder 执行前跑一遍）：
  - `test/world-explain-scoreboard.test.js`（ribbon 格式）
  - `test/toast-title-sync.test.js`（Emergency toast）
  - `test/hud-storyteller.test.js`（storyteller prefix）
  - `test/ui-voice-consistency.test.js`（Round0 新增，断言 Heat/Pressure 命名，不会命中）
  - `test/game-state-overlay.test.js`（scenario summary 子串，需 cross-check）

## 6. 验证方式

- **新增测试**：`test/scenario-voice-by-template.test.js`（Step 7） + `test/storyteller-voice.test.js`（Step 8）。运行 `node --test test/scenario-voice-by-template.test.js test/storyteller-voice.test.js` 全部通过。
- **回归测试**：`node --test test/*.test.js` 期望 867+ 全通过（当前 865 + 2 新增，允许 2 个 pre-existing skip）。若 `world-explain-scoreboard` / `toast-title-sync` / `hud-storyteller` 命中，同 PR 更新断言（纯字符串 diff）。
- **手动验证**：
  1. `npx vite` 启动 `http://127.0.0.1:5173` → 依次选 6 个模板开局，statusBar 的 `#statusScenarioHeadline`（Round0 已引入）在 6 个模板上显示 6 个不同 title + summary；**Fertile Riverlands** 不再显示 "Broken Frontier"。
  2. HUD 第一行 storyteller strip 不再以 "[Rule-based Storyteller]" 或 "[LLM Storyteller]" 开头，而是形如 "The colony is thinking · frontier buildout: Workers should..."。
  3. HUD 中部 scenario ribbon 不再显示 `wh 7/2 · farms 4/4`，而是 "West lumber route open · East depot claimed · Logistics on plan." 或 "Need 2 more warehouses" 这种 label-first 语气。
  4. 触发 Emergency relief（开快速消耗脚本或等 starvation），toast 文案为 "The colony breathes again. Rebuild your routes before the next wave."
  5. 按 `L` 键切到 Heat Lens，`#statusAction` 在 1440px 桌面完整显示 "Heat lens ON — red = surplus, blue = starved." 不再被截断为 "re..."。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`，DevIndex 不得低于 baseline（≈44）- 5% = 41.8。纯 UI string + CSS 修改对 sim tick 无影响，期望 1:1 baseline；若 `ScenarioFactory` voice 注入误入 hot path（不应）则立即 revert。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。4 个 voice leak 与 template × scenario 错配都在源码内直接可证实：

- Fertile Riverlands → frontier_repair 硬编码：`src/world/scenarios/ScenarioFactory.js:7`（`fertile_riverlands: "frontier_repair"`）
- "[Rule-based Storyteller]" 前缀：`src/ui/hud/storytellerStrip.js:22`
- `wh 7/2 · farms 4/4` 原文：`src/ui/interpretation/WorldExplain.js:154-159`
- "Emergency relief stabilized the colony..." 原文：`src/simulation/meta/ProgressionSystem.js:245`
- `.hud-action` `max-width: 420px` 截断源：`index.html:103-105`

未启动 Playwright，因现象完全可从源码证实。
