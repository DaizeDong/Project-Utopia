---
reviewer_id: 01e-innovation
feedback_source: Round5/Feedbacks/01e-innovation.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~160
  new_tests: 2
  wall_clock: 90
conflicts_with:
  - 02a-rimworld-veteran   # may also touch PromptBuilder.js focus/summary text
  - 02d-roleplayer         # may also touch storytellerStrip.js
  - 02e-indie-critic       # may also touch storyteller copy / badge semantics
---

## 1. 核心问题

锁定 **P0-3 DIRECTOR / WHISPER / LLM 三态徽章 control contract 对玩家透明化**
（summary §5 第 3 条）。拆成三个病因，全部是 **既有代码的文字/语义 bug**，
不是新增叙事系统：

1. **Prompt 残句泄漏**（feedback §3 #1）：DIRECTOR 文本出现
   "the colony should sustain reconnect the broken supply lane while keeping
   empty bellies and full backpacks from overriding the map's intended reroute
   pres..."——这是 `PromptBuilder.adjustWorkerPolicy` 把 `describeWorkerFocus`
   返回的短动词短语（"rebuild the broken supply lane at (x,y) - place Road
   here"）直接插进一个 **以 "Workers should sustain …" 为骨架**的英文句子
   （PromptBuilder.js:321-324）。语法上就是 `sustain rebuild …`，再被
   `storytellerStrip.humaniseSummary` 的正则链（storytellerStrip.js:150-171）
   链式替换成 `the colony should sustain reconnect the broken supply lane …`，
   尾部被 HUD `summaryWithSeparator` 截断成残句（HUDController.js:210 单行
   sentence-boundary 切分 + CSS 宽度裁剪）。这是双重 bug，不是 LLM 残文。
2. **LLM 不可用时 WHISPER 徽章降级语义缺失**：LLM HTTP 503 回退时
   `state.ai.lastPolicySource = "fallback"`（NPCBrainSystem.js:307），徽章
   正确地显示 DIRECTOR，但玩家从 HUD 看不到 "为什么 WHISPER 没亮"。
   `autopilotStatus.js:41` 在两侧默认值都是 "fallback" 时输出 `fallback/fallback
   - next policy in 0.0s` 这种黑话。没有一个玩家可读的 **"LLM offline,
   DIRECTOR (rule-based) in charge"** 降级说明。
3. **Fallback 路径下 DIRECTOR 文本既不像人话也不点名**：即使没有残句，
   `Workers should sustain push the frontier outward while keeping hunger and
   carried cargo from overriding the map's intended reroute pressure.` 这段
   （PromptBuilder.js:322-324）是 engineer-tone 模板文字，玩家读不到"谁在
   决策 / 下一步是什么"。

**明确不是表面修复：** 不是加 tooltip / 不是加 Glossary / 不是加新叙事系统。
而是修 PromptBuilder 的英文句模板 bug + humaniseSummary 的正则误伤 +
autopilotStatus 的降级语义文本。所有动作都在**既有的 storyteller / autopilot
contract 面上**，让作者自己推销的 "WHISPER · DIRECTOR · DRIFT 三态" 在
fallback 路径下首次真的把"谁在决策、下一步是什么"说清楚。

---

## 2. Suggestions（可行方向）

### 方向 A: 修 PromptBuilder 句模板 + 收紧 humaniseSummary 正则 + 补 DIRECTOR 降级语义（主推）

- **思路**：
  - (a) 在 `PromptBuilder.js` 里把 `policy.summary` 从 "Workers should sustain
    <focus> while …" 这个会产生 `sustain rebuild`/`sustain reconnect` 语法碰撞
    的骨架，改成**根据 focus 是否带 actionable 后缀分叉的两个独立句**——
    actionable 时直接 "Crew attention needed: <focus>. Rest of the colony keeps
    hunger and carry in check."（已经有这条分支，bug 在非 actionable 路径）；
    非 actionable 时改成 "Crew pushes <focus>; rest keeps hunger and carry in
    check." 彻底避开 `sustain <verb-phrase>` 这个语法陷阱。
  - (b) 在 `storytellerStrip.humaniseSummary` 的替换链里**去掉**
    `[/rebuild the broken supply lane/gi, "reconnect the broken supply lane"]`
    这条双替换（行 151）——它是 Round-0 引入的同义词微调，但会把 PromptBuilder
    原文里早已出现的 `rebuild …` 重写成 `reconnect …`，放大残句泄漏观感；
    `describeWorkerFocus` 已经直接输出 `rebuild the broken supply lane`，保留
    一种说法就够。
  - (c) 在 `autopilotStatus.js:41,44` 把 `fallback/fallback` 合并成
    `rule-based`；并在 LLM 失败最近一次的情况下（`state.ai.lastError` 非空
    或 `state.ai.lastPolicySource === "fallback"`）在 autopilot banner 末尾
    追加 "LLM offline - DIRECTOR steering" 而不是空洞的 "next policy in 0.0s"。
  - (d) 在 `storytellerStrip.computeStorytellerStripModel` 的 mode === "fallback"
    分支，把 `focusText` 前增加一个 1-词的**决策主体**短语（例如
    `"DIRECTOR picks: <focus>"` 或在现有 focusText 里确保不吃 "autopilot"
    fallback 时带 focus 的路径），让玩家一眼答得出"谁在做决策"。纯 humanise
    文本改动，不改 mode / prefix 轮子。
- **涉及文件**：
  - `src/simulation/ai/llm/PromptBuilder.js`（函数 `adjustWorkerPolicy` 尾段）
  - `src/ui/hud/storytellerStrip.js`（`humaniseSummary` + `computeStorytellerStripModel`）
  - `src/ui/hud/autopilotStatus.js`（`getAutopilotStatus`）
  - 新测试 `test/prompt-builder-summary-sanity.test.js`、
    `test/autopilot-status-degraded.test.js`
- **scope**：小-中（≤160 LOC delta，4 文件）
- **预期收益**：残句 bug 彻底消失；fallback 下玩家能从 HUD 读出"谁在决策 /
  下一步是啥"；不动 LLM pipeline / 不加新系统，HW06 freeze 合规。
- **主要风险**：
  - humaniseSummary 正则去掉"rebuild→reconnect"可能让现有
    `test/hud-storyteller.test.js` / `test/storyteller-strip.test.js` 里
    硬编码 "reconnect the broken supply lane" 的 assertion 失败；需要
    配套更新 2 个测试里的期望字符串。
  - autopilot banner 追加 "LLM offline - DIRECTOR steering" 会改变
    既有 `autopilot*.test.js`（如有）里的 text assertion；要先 `grep autopilot ON`
    找到 pin 死文案的测试并同步更新。

### 方向 B: 在 HUD 新增 "AI Status" side-panel 专门解释当前决策主体（备选，不采纳）

- **思路**：在 storyteller 旁边新加一块"AI Status"，展示最近一次
  LLMClient.lastStatus、HTTP 错误码、上次 WHISPER 点亮的时间戳、当前
  policy 来源分布柱状图。
- **涉及文件**：`src/ui/hud/HUDController.js`、`index.html`、
  `src/ui/hud/glossary.js`、新组件文件。
- **scope**：中-大
- **预期收益**：玩家对"谁在决策"零误解。
- **主要风险**：
  - 属于**新 UI 系统 / 新内容**，违反 HW06 freeze（summary §6 明确列出
    "重写 LLM pipeline 让 WHISPER 真的持续点亮（01e, 02d）——可以做
    '降级语义透明化'但不能承诺真上线 LLM"，新 panel 落在灰色地带，
    更贴近"加内容"）。
  - 需要新 HTML hooks 与 CSS，01c 反馈已经抱怨信息过载；新增面板加剧。
  - 治标幅度反而更小：残句 bug 不在这块 panel 里也还是会在
    storytellerStrip 主条上泄漏，不治本。

---

## 3. 选定方案

选 **方向 A**，理由：

- **精确对位 feedback 的三条实证**：截图里的 "reconnect the broken supply
  lane … reconnect the broken supply lane … keeping empty bellies and full
  backpacks from overriding the map's intended reroute pres..." 逐字可追溯
  到 PromptBuilder.js:321-324 + storytellerStrip.js:150-171 的两处 bug 合流。
  修掉这两处就能直接消除玩家看到的残句。
- **严格不越 freeze 边界**：不上线 LLM、不新增 AI system、不新增 UI
  面板、不新增新叙事机制；所有改动都在 **"修 fallback 叙述生成 + 修
  prompt 残句 bug + 调徽章降级语义"** 三项明确允许清单内。
- **可度量**：可用 `computeStorytellerStripModel` 对若干已知 summary shape
  做快照测试，验证 `summaryText` 不再出现 "sustain reconnect" /
  "sustain rebuild" / "sustain <verb-phrase>" 的语法错位，且重复词汇率
  （同一 content word 在 focusText + summaryText 合起来出现 ≥3 次）≤ 1%。
- **scope 小**：4 文件、≤160 LOC、2 新测试文件，Coder 一轮能落完。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/ai/llm/PromptBuilder.js` :
      `adjustWorkerPolicy` 尾段（当前第 321-324 行的
      `policy.focus = …` / `policy.summary = …` 块） — `edit` —
      把 `policy.summary` 赋值改为：若 `describeWorkerFocus` 返回包含
      actionable 标记（" at (" / " at depot " / "place Road here" /
      "place Warehouse here"）则保留现有 `Crew attention needed: <focus>.`
      路径；否则改成
      `Crew pushes ${policy.focus}; rest keeps hunger and carry in check.`
      （避开 `sustain <verb-phrase>` 语法陷阱）。同时把 focus 赋值前
      增加一个去重保护：若 `policy.focus` 起始词是 "rebuild"/"reconnect"
      且 summary 中也会出现该动词，不再把 focus 再次拼进 summary。
- [ ] **Step 2**: `src/ui/hud/storytellerStrip.js` :
      `humaniseSummary` 的 `rules` 数组（当前第 149-171 行） — `edit` —
      删除第 151 行 `[/rebuild the broken supply lane/gi, "reconnect the
      broken supply lane"]` 这一条同义重写（消除 "rebuild → reconnect"
      双跳导致的观感冗余）；保留其他 rimworld-lite 文案润色条。
      - depends_on: Step 1（先确认 PromptBuilder 不再吐 "sustain <verb>"）
- [ ] **Step 3**: `src/ui/hud/storytellerStrip.js` :
      `computeStorytellerStripModel`（当前第 237-292 行） — `edit` —
      在 `mode === "fallback"` 分支中，把 `focusText` 前缀加一个轻量的
      决策主体短语：当 focusText 非 "autopilot" 且不以 "DIRECTOR " 起头时，
      拼成 `DIRECTOR picks ${focusText}`（仅 fallback 分支；idle / llm
      分支不动）。这样玩家从 HUD 一眼看到 "谁在决策"。
      - depends_on: Step 2
- [ ] **Step 4**: `src/ui/hud/autopilotStatus.js` :
      `getAutopilotStatus`（当前第 33-57 行） — `edit` —
      (a) 把 `aiMode === "fallback" && coverageTarget === "fallback"` 合并
      显示为 `rule-based`，避免 `fallback/fallback` 黑话；
      (b) 当 `state.ai.lastPolicySource === "fallback"` 且
      `state.ai.lastError` 非空或 `state.metrics.proxyHealth` 指示
      错误时，在 `text` 末尾追加 `" | LLM offline — DIRECTOR steering"`，
      在 `title` 末尾追加
      `" — LLM unavailable, rule-based DIRECTOR in charge."`。
      - depends_on: Step 3
- [ ] **Step 5**: `test/prompt-builder-summary-sanity.test.js` — `add` —
      对 `buildPolicyFallback(summary)` 用 3 个已知 summary shape
      （route-gap shape / depot-anchor shape / steady-state shape）
      断言返回的 workers policy `.summary` 字段：
      - 不包含子串 `"sustain reconnect"`、`"sustain rebuild"`、
        `"sustain push"`、`"sustain hug"`、`"sustain clear"`；
      - 同一 content word（忽略停用词）不在 focus + summary 连起来
        的文本里出现 ≥3 次（重复词率硬阈值）；
      - summary 长度 ≤ 160 characters（避免被 HUD 单行裁剪成残句）。
      - depends_on: Step 1
- [ ] **Step 6**: `test/autopilot-status-degraded.test.js` — `add` —
      对 `getAutopilotStatus(state)` 构造 3 个 shape（LLM OK / LLM offline
      fallback / autopilot off）断言：
      - LLM offline shape 下 `text` 包含 "LLM offline"，不再包含
        `"fallback/fallback"`；
      - LLM OK shape 下 `text` 不包含 "LLM offline"；
      - autopilot off shape 不受改动影响（保留原文案）。
      - depends_on: Step 4
- [ ] **Step 7**: `test/hud-storyteller.test.js` 与
      `test/storyteller-strip.test.js` — `edit` —
      找出任何硬编码 `"reconnect the broken supply lane"` 的
      assertion（Step 2 改动后这条文案来源减少一条），同步替换为
      `"rebuild the broken supply lane"`（来自 PromptBuilder 原文），
      或使用更弱的子串断言（e.g. `/broken supply lane/`）。
      同样处理任何硬编码 `"Workers should sustain"` / `"the colony should
      sustain"` 的测试断言。
      - depends_on: Step 1, Step 2

---

## 5. Risks

- **R1 — 现有 storyteller 测试回归**：`test/hud-storyteller.test.js` 与
  `test/storyteller-strip.test.js` 极有可能 pin 死了 "reconnect the broken
  supply lane" / "Workers should sustain …" 的字面文本。Step 7 已经预留了
  同步更新，但 Coder 需要完整跑 `node --test test/*.test.js` 确认通过。
- **R2 — Autopilot 文案测试回归**：现有测试集若有
  `/Autopilot ON - fallback\/fallback/` 之类的正则，会被 Step 4 改动打破。
  需要 grep `autopilot ON` 与 `fallback/fallback` 统一更新。
- **R3 — 保留的 humaniseSummary 正则顺序**：Step 2 只删一条，其余
  rewriting rules 的 ordering 不能改，否则会出现其他文案二次改写偏差
  （如 "workers should " → "the colony should " 必须在更具体的 rule
  之后）。
- **R4 — WHISPER 路径误伤**：Step 3 只在 `mode === "fallback"` 分支加
  "DIRECTOR picks" 前缀，**不能误加到 mode === "llm"**；否则 WHISPER
  徽章亮起时文本会出现 "WHISPER + DIRECTOR picks" 的语义自相矛盾。
  Coder 需要显式单元测试覆盖 llm 分支不受影响。
- **R5 — Benchmark DevIndex 稳定性**：本 plan 不触碰 simulation 数值；
  `scripts/long-horizon-bench.mjs` 的 DevIndex 结果不应发生变化；
  若发生变化，说明改动误伤 simulation（回滚）。
- 可能影响的现有测试：`test/hud-storyteller.test.js`、
  `test/storyteller-strip.test.js`、若存在的 autopilot status 测试
  （需 grep `autopilotStatus` 或 `Autopilot ON` 确定）。

## 6. 验证方式

- **新增测试**：
  - `test/prompt-builder-summary-sanity.test.js` — 覆盖
    "PromptBuilder 不再生成 sustain <verb-phrase> 残句 / 重复词率 ≤1% /
    summary ≤160 字符" 三个硬阈值。
  - `test/autopilot-status-degraded.test.js` — 覆盖
    "LLM offline 时 HUD banner 显式降级文案、不再出现 fallback/fallback"。
- **可度量指标**：
  - **(A) 残句率 = 0**：对 `buildPolicyFallback` 在 50 个 diverse summary
    shape 下运行的输出做枚举断言，`/sustain (reconnect|rebuild|push|hug|clear|disrupt|harass|run|work)/` 零命中。
  - **(B) 重复词率 ≤ 1%**：同一 content word 在 focus + summary
    联合文本出现 ≥3 次的 summary shape 数 / 总 shape 数 ≤ 1%。
  - **(C) HUD 可答性**：打开 dev server 开局 30 秒后，读取
    `#storytellerBadge` + `#storytellerFocus` + `#storytellerSummary` +
    autopilot banner 的 text 拼接，**人类评审能答出两个问题**：
    "现在谁在做决策？"（答案：WHISPER / DIRECTOR / DRIFT 三者之一）、
    "下一步聚焦点是什么？"（答案：focusText 应形成可读短语，如
    "rebuild the broken supply lane" / "keep the larder filling"）。
  - **(D) fallback banner 显式降级**：LLM HTTP 503 注入后，
    `getAutopilotStatus(state).text` 必须包含子串 "LLM offline"。
- **手动验证**：
  - 启动 `npx vite` → 打开 `http://127.0.0.1:5173/` → 默认模板开局；
  - 本地不配置 LLM proxy（走 fallback 路径，复现 feedback 场景）；
  - 观察 30 秒内 `#storytellerStrip`：预期徽章稳定 `DIRECTOR`，focusText
    像 "DIRECTOR picks rebuild the broken supply lane at (x,z) — place Road
    here"，summary 是一条完整的英文句，**不出现** `sustain reconnect`、
    `sustain rebuild` 或截断省略号后的 "reroute pres…"；
  - 打开 autopilot → HUD banner 预期形如
    `Autopilot ON - rule-based - next policy in 7.2s | LLM offline — DIRECTOR steering`。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 /
  `temperate_plains`，DevIndex 不得低于当前值 - 5%（本 plan 不动
  simulation 逻辑，预期波动 ≤0）。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。残句泄漏路径已通过 **静态代码审查**（grep + 读
PromptBuilder.js:321-324 的英文句模板 + storytellerStrip.js:149-171 的
humaniseSummary 规则链）确认：

1. `describeWorkerFocus` → 返回 `"rebuild the broken supply lane at
   (x,z) - place Road here"` 或 `"push the frontier outward"`。
2. `adjustWorkerPolicy` 尾段第 324 行 `Workers should sustain ${focus}
   while keeping hunger and carried cargo from overriding the map's
   intended reroute pressure.` 组成 `Workers should sustain rebuild the
   broken supply lane …` 的语法错位串。
3. `humaniseSummary` 规则链按顺序：`rebuild → reconnect`（行 151）、
   `workers should → the colony should`（行 168）、`hunger and carried
   cargo → empty bellies and full backpacks`（行 165），最终拼出
   feedback 截图里的 `the colony should sustain reconnect the broken
   supply lane while keeping empty bellies and full backpacks from
   overriding the map's intended reroute pres…`。尾部 `pres…` 是 HUD
   `summaryWithSeparator` 与 CSS 单行裁剪共同作用的结果。

这 1-2-3 链**完全由仓库代码可追踪复现**；无需 Playwright 二次启动。
