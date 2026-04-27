---
reviewer_id: 02e-indie-critic
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round2/Feedbacks/02e-indie-critic.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P1
estimated_scope:
  files_touched: 5
  loc_delta: ~120
  new_tests: 1
  wall_clock: 55
conflicts_with:
  - 01c-ui   # 01c also targets P1-2 text truncation — we confine our edits to #storytellerStrip only; 01c owns other truncation sites (statusAction / build-tool summary). If 01c's plan also rewrites #storytellerStrip inline CSS, prefer 01c's version to avoid double-edit.
---

## 1. 核心问题

把三个 Stage A focus 折成一条叙述：**"Utopia 是工程师敞开盖子让玩家看的半成品 tech demo"** — 病灶不是缺功能，而是 shape 没收拢。具体三个根因：

1. **P1-2 文本截断未彻底修**：`#storytellerStrip` 被写死 inline 的 `flex:1 1 260px; min-width:180px; white-space:nowrap; text-overflow:ellipsis`，即便在 1920px 宽屏也会把 DRIFT 行截成 `DRIFT autopilot: colony holdin…`。Round1 只修了 `statusAction` 的 title mirror（`HUDController.js:711`），没碰 storyteller 本身的 flex basis，所以截断仍在第一屏。
2. **P0-6 Voice 是孤岛**：Round0 的 "drowning beside a full warehouse" 只写进了 `index.html:1604` 的 Help 长文。**没有一句** BuildAdvisor tooltip、HUD glossary、或 storyteller idle 回退文本沿用这种 "工业讽刺" 口吻。作者的 15% vibe 没有 diffusion 机制。
3. **P2-6 Debug 泄漏**：`window.__utopia = app` + `window.__utopiaLongRun = {…}` 在 `src/main.js:179-203` 无条件挂载；Help 面板 `index.html:1597` 把 "policy published each decision tick / WHISPER / DIRECTOR / DRIFT" 当卖点讲给大众玩家。`devModeGate.js` 已有 `?dev=1 | localStorage | Ctrl+Shift+D` 三档 gate，但 `window.__utopia` 没接进来。

三条都属 **HW06 freeze 允许的 polish / wiring fix**，无新 mechanic。

## 2. Suggestions（可行方向）

### 方向 A: 最小外科 — 三处独立小修（storytellerStrip CSS / 新增 3 条 voice tooltip / __utopia 接 devModeGate）

- 思路：把三个焦点各自当 polish 原子操作，不做任何跨文件重构。
- 涉及文件：`index.html`（CSS 一行 + 可能 1-2 处 Help 文本微调）、`src/simulation/construction/BuildAdvisor.js`（3 条 summary / rules 改写）、`src/ui/hud/glossary.js`（1-2 条 voice 化）、`src/main.js`（`window.__utopia` 挂载前读 devModeGate）、`src/ui/hud/storytellerStrip.js`（idle 文本保留但加 voice 备用）。
- scope：**小**（~80-120 LOC，5 个文件）
- 预期收益：
  - storyteller 行在 1920×1080 下完整显示（Playwright 快照可验）
  - 至少 5 处玩家第一屏能读到的 tooltip 带上 "drowning / starved / chokepoint" 同家族 voice → 把 15% 推到 ~25%
  - 普通玩家（无 `?dev=1`）的 console 里 `window.__utopia` undefined；power user 的行为零变化
- 主要风险：
  - `test/ui-voice-consistency.test.js` 已 pin 了 BuildToolbar / heat-lens / dock 文案，改 BuildAdvisor summary 需小心不要回收新 dev 词（"spec-sheet"）
  - `test/long-run-support` / `scripts/long-run-support.mjs` / `scripts/soak-browser-operator.mjs` 确实 grep `window.__utopia*` → 需要保留 `__utopiaLongRun`（自动化用），只 gate `window.__utopia`

### 方向 B: 承认 shape，把 Help 面板切掉架构语 + 给 storyteller strip 做自适应两行模式

- 思路：比 A 激进 —— 重写 `index.html` Help "What makes Utopia different" tab，把 "policy published each decision tick / ECS" 这些架构词替换成玩家口吻（"the colony remembers what broke last hour"）；同时 storyteller strip 去掉 nowrap，允许两行 height:auto。
- 涉及文件：`index.html`（~30 行 Help 重写 + 4 行 CSS）、`src/ui/hud/storytellerStrip.js`（beat 文本限长改为自适应）、`src/ui/hud/HUDController.js`（高度自适应容器）。
- scope：**中**（~150 LOC，3 文件，但改 Help 文本 + 高度 reflow 会波及 responsive 测试）
- 预期收益：更彻底地"对大众玩家藏拙"；Help 面板不再像研发 README。
- 主要风险：
  - `test/responsive-status-bar.test.js` / `test/hud-storyteller.test.js` 可能 pin 了 strip 高度 / nowrap 相关断言
  - Help 重写属于 **content rewrite**，边界接近 HW06 content freeze；而且会让 01e-innovation 同时抓的 "storyteller 文本 human-ify" 重叠
  - Voice 扩散效果比 A 弱（依然只改一个 Help panel，没 diffuse 到每日触达的 tooltip）

## 3. 选定方案

选 **方向 A（最小外科三处独立小修）**。理由：

- 优先级 P1，按 enhancer 规则应"中 scope / 根治"，但 P2-6 属 P2 + P1-2 属 P1 polish → 组合权重落在**小**；小 scope 能在一个 Coder turn 内收尾并通过现有 865 测试。
- 方向 B 的 Help 重写碰 content freeze 边界、还与 01e-innovation 的 "storyteller 人味化" 明确重叠（summary.md §5 已把 storyteller 文案划给 01e） → 让出领土。
- 方向 A 的三项每一项都能**单点验证**（Playwright screenshot / 字符串 grep / console.assert），回归面窄；也更尊重 reviewer "把 15% vibe 推到 25%" 的量级隐喻 —— 不是要重写，是要多写 **五条** voice 句。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:1000` — `edit` — 修 `#storytellerStrip` 的 inline style：去掉 `flex:1 1 260px` / `min-width:180px`，改为 `flex:1 1 auto; min-width:0; max-width:none`；保留 `white-space:nowrap; text-overflow:ellipsis` 作为容器真被挤压时的后备；在该 `<div>` 上把 `title="AI storyteller — current worker-group policy focus"` 升级为 JS 动态 mirror（见 Step 2），以便鼠标悬停可以看到完整 DRIFT 行。

- [ ] **Step 2**: `src/ui/hud/HUDController.js:renderStorytellerStrip`（紧跟现有 `#storytellerStrip` 渲染路径；如函数名不同请在该文件内 grep `storytellerStrip` 定位渲染点）— `edit` — 渲染时把拼接后的完整 `${prefix} ${focusText}${summaryText}${beatText ? ' · '+beatText : ''}` 写入容器 `title` 属性（与 `statusAction.setAttribute('title', …)` 同模式，参考 `HUDController.js:711-712` 的 01d pattern）。不改 textContent 逻辑，只加一行 title mirror。
  - depends_on: Step 1

- [ ] **Step 3**: `src/simulation/construction/BuildAdvisor.js:TOOL_INFO`（行 16-89）— `edit` — 把五条最平的 spec-sheet summary 改写为与 Heat-Lens "drowning beside a full warehouse" 同家族的具象 / 讽刺 voice：
  - `road.summary`（行 19）：`"Extends the logistics network and closes authored route gaps."` → `"Stitches the broken supply line — every tile of road a haul that never happens."`
  - `warehouse.summary`（行 37）：`"Creates a logistics anchor, unlocks depot reclaim objectives, and shortens worker delivery loops."` → `"Anchors the colony's stockpile — without this, grain rots in the field while the kitchen sits empty."`
  - `kitchen.summary`（行 61）：`"Processes raw food into meals, boosting food efficiency for the colony."` → `"Turns raw grain into meals — the difference between a stocked warehouse and workers starving beside it."`
  - `smithy.summary`（行 67）：`"Forges stone into tools and equipment, improving worker productivity."` → `"Hammers stone and wood into tools — one Smithy late and the lumber camp saws with its hands."`
  - `clinic.summary`（行 73）：`"Uses herbs to treat injuries and illness, reducing population loss."` → `"Brews herbs into medicine — the last room between a bitten hauler and a name on the obituary strip."`
  - 约束：每条 ≤ 140 chars（同 `storytellerStrip` NARRATIVE_BEAT_MAX_LEN 口径）；保留 `rules` 字段原文不动（硬规则归 01d/01a）。

- [ ] **Step 4**: `src/ui/hud/glossary.js:HUD_GLOSSARY`（行 14-47）— `edit` — 把两条最机械的 entry 改写为 voice 态，保留 ≤ 120 chars 长度约束（由 `test/ui/hud-glossary.test.js` 强制）：
  - `heatLens`（行 40）：`"Heat Lens: red = food surplus tiles, blue = starved tiles — shows where meals are needed."` → `"Heat Lens: red = producers drowning beside a full warehouse, blue = processors starved for input — bottleneck at a glance."`（与 `index.html:1604` 原句对齐 → voice 从 Help 散到 HUD）
  - `storyteller`（行 31）：`"AI Storyteller: adaptive director that shifts threat & events based on colony state."` → `"AI Storyteller: the voice that turns the colony's numbers into weather — every directive is a guess at what you need next."`
  - 其余 entry 不动；避免 churn。

- [ ] **Step 5**: `src/main.js:179`（`if (canvas) { … window.__utopia = app; … }` 块）— `edit` — 在 `window.__utopia = app;` 这一行（包括紧随其后的 `window.__utopiaLongRun = {…}` 声明）外面套 dev-mode gate：
  - 从 `./app/devModeGate.js` `import { readInitialDevMode }` 顶部（放在已有 import 之后）
  - 在 `window.__utopia = app;` 之前插入：
    ```
    const devOn = readInitialDevMode({
      locationHref: typeof window !== "undefined" ? window.location?.href : undefined,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    });
    if (devOn) {
      window.__utopia = app;
    }
    ```
  - `window.__utopiaLongRun` **保留无条件挂载** —— `scripts/long-run-support.mjs` / `scripts/soak-browser-operator.mjs` 依赖它跑自动化 soak，不能 gate。仅 `__utopia` 下的"整棵 ECS"是 reviewer 抱怨的泄漏点。
  - `window.__utopiaBootError` 行不动（错误诊断需始终可用）。
  - depends_on: —（与 Step 1-4 独立）

- [ ] **Step 6**: `test/ui-voice-consistency.test.js` — `add`（同一文件追加 2 个 test case）— 锁住新 voice + gate：
  - `test("ui voice: BuildAdvisor summaries carry voice-family diction")` — 读 `src/simulation/construction/BuildAdvisor.js`，断言 `road.summary` 含 `"broken"` 或 `"stitch"`（不点名具体字句，允许 Coder 小改）、`warehouse.summary` 含 `"anchor"` 或 `"rots"`、`kitchen.summary` 含 `"starving"` 或 `"beside"`。只防回退到 "Extends the logistics network" 这种 spec-sheet 默认态。
  - `test("ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public")` — 读 `src/main.js`，断言 `window.__utopia = app` 被 `if (devOn)` 或等价 dev 判定包裹（regex `if\s*\(\s*devOn\s*\)`）；`window.__utopiaLongRun` **仍** 在 `if (canvas)` 顶层无条件挂载。
  - depends_on: Step 3, Step 5

- [ ] **Step 7**: `CHANGELOG.md`（Unreleased 段）— `edit` — 按 CLAUDE.md "每次 commit 必须更新 CHANGELOG" 约束，追加一条：
  > `02e-indie-critic Round2: storyteller strip no longer truncates on 1920px (min-width:0), diffused Heat Lens voice into 5 BuildAdvisor tooltips + 2 glossary entries, gated window.__utopia behind devModeGate (?dev=1 / Ctrl+Shift+D) — __utopiaLongRun remains public for soak scripts.`
  - depends_on: Step 1-5 全部落地后再写

## 5. Risks

- **R1 (test churn)**: `test/ui-voice-consistency.test.js` 已 pin 了 BuildToolbar populationBreakdown / heat-lens toast / dock 文案 —— 新加的 2 个 test case 必须与旧 4 个不冲突，也要检查 `test/build-advisor.test.js` / `test/build-tool-preview.test.js` 是否 grep 原 summary 字面量（`"Extends the logistics network"`）；若有则需同步更新。
- **R2 (scripts regression)**: `scripts/soak-browser-operator.mjs` / `scripts/long-run-support.mjs` 同时 grep `window.__utopia` 和 `window.__utopiaLongRun`。Step 5 只 gate `__utopia`；必须手动 `grep -rn "window\.__utopia[^L]" scripts/ tests/` 确认没有 soak 脚本依赖 ungated `__utopia`（若有，应请 Coder 改脚本优先使用 `__utopiaLongRun`）。
- **R3 (storyteller strip 横向布局回归)**: 取消 `flex:1 1 260px` 后若 `#statusBar` 缺 `overflow:hidden`，长 summary 可能把右侧 `#panelToggles`（Build/Colony/Settings/Debug/Heat Lens）挤出视口。Step 1 需同步检查 `#statusBar` 是 flex 容器且 `panelToggles` `flex-shrink:0`（`index.html:1002` 附近已是），必要时给 `#storytellerStrip` 加 `overflow:hidden`。
- **R4 (i18n / a11y 未预演)**: 新 voice 句更长、更文学（"obituary strip"），对屏幕阅读器 / 未来本地化是轻负担 —— 本 plan 不涉及 i18n 提取，Coder 无需处理，但应在 commit message 里标注。
- **R5 (scope creep to 02d)**: 02d-roleplayer 的 plan 也可能碰 storyteller idle 文本 —— 本 plan **不动** `storytellerStrip.js` 的 "colony holding steady" 字面量（让给 02d / 01e）；只做容器宽度 + title mirror，避免双写。
- **可能影响的现有测试**: `test/ui-voice-consistency.test.js`, `test/ui/hud-glossary.test.js`, `test/hud-storyteller.test.js`, `test/storyteller-strip.test.js`, `test/responsive-status-bar.test.js`, `test/build-advisor.test.js`（若存在 summary 字面 assert）。

## 6. 验证方式

- **新增测试**: `test/ui-voice-consistency.test.js` 追加 2 个 case（见 Step 6）—— 覆盖"BuildAdvisor summary 不回退到 spec-sheet 态" + "__utopia 被 devModeGate 包裹，__utopiaLongRun 保持公开"两类回归。
- **手动验证 M1（截断修复）**: `npx vite` → 打开 `http://localhost:5173`（不要带 `?dev=1`）→ Start Colony → 等 DRIFT 行显示。浏览器 devtools resize 到 1920×1080 / 1366×768 / 1024×768 三档，确认 DRIFT 整行 `DRIFT autopilot: colony holding steady — awaiting the next directive` 完整可见（1024 下允许 ellipsis，但 hover 应看到完整 title tooltip）。
- **手动验证 M2（voice 扩散）**: HUD 左侧 BuildToolbar 依次 hover Road / Warehouse / Kitchen / Smithy / Clinic 按钮，右下 `#buildToolSummaryVal` 文本应含新 voice；F1 Help 里 Heat Lens 段 + HUD Heat Lens 按钮 title 的描述口吻一致（两处同提"drowning / starved"）。
- **手动验证 M3（debug 隐藏）**:
  - 无 query → `console.log(window.__utopia)` 期望 `undefined`；`console.log(window.__utopiaLongRun)` 期望 `{…}`（soak 脚本还能工作）
  - `?dev=1` → `window.__utopia` 重新可访问
  - `Ctrl+Shift+D` → `window.__utopia` 在下次刷新后可访问（localStorage 持久）
- **benchmark 回归**: `node scripts/long-horizon-bench.mjs --seed=42 --template=temperate_plains`，DevIndex 不得低于当前 v0.8.1 基线 44 的 95% → **≥ 41.8**。本 plan 零 simulation 改动，预期 DevIndex 完全无偏移；若出现，说明 Step 5 的 devModeGate import 路径或 `window.__utopiaLongRun` 保留未成功，应回滚 Step 5。

## 7. UNREPRODUCIBLE 标记

不适用。三处问题都通过静态代码阅读即可复现：
- P1-2 的截断由 `index.html:1000` 的 inline `flex:1 1 260px; min-width:180px; text-overflow:ellipsis` 直接保证会在宽屏以外触发；Playwright 复现仅为锦上添花。
- P0-6 的 voice 缺席通过 `grep "Extends the logistics network"` 定位到 `BuildAdvisor.js:19` 唯一写点；
- P2-6 的全局泄漏通过 `src/main.js:179-203` 直接肉眼可见。

现场复现工具（Playwright MCP）可在 Coder 阶段用于抓修前/修后截图对比；不作 plan 的阻塞依赖。
