---
reviewer_id: 01a-onboarding
feedback_source: Round1/Feedbacks/01a-onboarding.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P1
estimated_scope:
  files_touched: 4
  loc_delta: ~180
  new_tests: 1
  wall_clock: 35
conflicts_with: []
---

## 1. 核心问题

Feedback 提出 13 条场景问题，归并为 **三个根本问题**：

1. **术语黑洞 / 缩写无解释**（§2.6, §3 行 4）— `Dev 49/100`、`routes 1/1`、
   `wh 3/2`、`farms 4/4`、`lumbers 2/3`、`walls 7/4`、`HAUL/COOK/SMITH/
   HERBALIST`、`Prosperity`、`Threat`、`DevIndex` 等缩写在 HUD / 计分板 /
   Colony 面板直接渲染，**任何位置都没有鼠标悬停解释**。新玩家看不懂就
   只能去 Help 面板查——违反"信息在它出现的地方解释"原则。

2. **Heat Lens 打开后画面肉眼无变化**（§2.5, §3 行 10）— 只有顶部文字
   从 "pressure" 变为 "Heat lens ON — red = surplus, blue = starved"，
   但地图本身的色图对比度极低或被非 heat 区域的 base-tile 色彩淹没。
   "打开了功能但看不到效果"比没这个功能更糟——玩家会认为是 bug。

3. **Objectives 和 KPI 混在一行（`routes 1/1 · depots 1/1 · wh 3/2 …`）
   没有语义分层**（§2.2, §3 行 4）— 这行同时承担"当前任务目标"
   + "实时 KPI"两个角色，但用同一字号/同一颜色渲染，玩家读不出
   哪些是"我需要推进的事"、哪些是"自动统计"。

本 plan 只处理 **问题 1**（最低成本、最高回报、完全 polish 范围）。
问题 2、3 更适合留给其他 reviewer 的独立视角（01c-ui / 01b-playability）
以避免 10 份 plan 都挤在同一 DOM 节点上。

---

## 2. Suggestions（可行方向）

### 方向 A: 在渲染点为每个缩写加 `title` tooltip（glossary dictionary）

- 思路：抽一个 `GLOSSARY`（字符串 → 说明文案）映射放在一个新模块，在
  HUD / Scoreboard / Colony Panel 渲染缩写时调用
  `setAttribute("title", GLOSSARY[term])`。零新 DOM、零新 CSS、零新事件。
- 涉及文件：`src/ui/hud/glossary.js`（新建，纯数据 + 小 helper）、
  `src/ui/hud/HUDController.js`（在已有渲染点追加 `title=`）、
  `index.html`（为 `#statusObjective`/`#statusScenario` 等已存在节点确认
  `title` 可被 JS 覆写；无需结构改动）。
- scope：**小**（80-150 LOC，纯文案 + setAttribute）
- 预期收益：**高**。feedback §2.6 列出的 10 条缩写里每一条都会变成悬停
  即可读懂——Objectives 不拆出来也能变得"自解释"。
- 主要风险：低。只写 `title` 属性，不改文字本身，所以 snapshot / layout
  测试不受影响；也不影响 determinism（无 RNG 接触）。

### 方向 B: 改写 HUD 把缩写展开成全称（`wh 3/2` → `Warehouse 3/2`）

- 思路：在 `HUDController.render()` 和 `WorldExplain.getScenarioProgressCompact`
  里把缩写替换为全称。
- 涉及文件：`src/ui/hud/HUDController.js`、
  `src/ui/interpretation/WorldExplain.js`、可能还有 Colony 面板的渲染 JS。
- scope：**中**（需同步更新既有测试快照；WorldExplain 已被多个测试文件引用）
- 预期收益：中。解决了"展开"但可能把 HUD 撑宽，casual 玩家反而被
  "Warehouse 3/2 · Farm 4/4 · Lumber 2/3 · Wall 7/4" 这一长串挤爆视野，
  回退缩写的心智反而加重。
- 主要风险：**高**——(a) 打破现有 snapshot 测试；(b) layout 溢出 / 换行；
  (c) 02c-speedrunner 已在本代码路径多次 polish（02c Step 5）需协调。

### 方向 C: 整行 KPI 改用 chip-样式小徽章并在每 chip 内放图标 + 数字

- 思路：给每个缩写做一个彩色 chip 组件，图标代替文字（例如仓库 emoji 🏠）。
- 涉及文件：index.html（结构重建）、CSS、HUDController、多个测试。
- scope：**大**
- 预期收益：视觉上最强，但风险溢出 freeze 边界（新增组件 ≈ 新 mechanic？）。
- 主要风险：**非常高**——违反 "HW06 不加新 mechanic / UI 新组件" 的精神，
  且会和 02b-casual 的"拖动位置 / 放大 HUD"类 polish 直接冲突。

---

## 3. 选定方案

选 **方向 A**，理由：

- **scope 最小**（单文件新增 + HUDController 小量补丁）→ 20 分钟 deadline 可完成。
- **与现有 Round-0 已落地的 tooltip 模式一致**（参见 `BuildToolbar.sync`
  对 `data-tooltip` 的使用、`HUDController.statusScoreBreak.setAttribute("title", text)`）——
  不引入新范式。
- **无新 mechanic / 无 DOM 结构改动**，严格在 freeze 边界内。
- **不破坏测试**：`title` attribute 很少被 snapshot；即便被测到，
  现有断言大多针对 textContent。
- **正交于其他 reviewer 的 polish 方向**——其他 plan 很可能改 textContent
  或加新 chip，本 plan 只加悬停元数据，冲突概率最低。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/hud/glossary.js:new` — `add` — 新建模块，导出
  `HUD_GLOSSARY`（frozen object）与 helper `explainTerm(key)`；字典键
  覆盖以下缩写（feedback §2.6 原文罗列）：`dev`、`devIndex`、`routes`、
  `depots`, `wh`, `farms`, `lumbers`, `walls`, `prosperity`, `threat`,
  `storyteller`, `haul`, `cook`, `smith`, `herbalist`, `heatLens`,
  `scenarioGap`, `survivedScore`, `perSec`, `perBirth`, `perDeath`。
  每条 value 是一行 ≤ 80 字的自然语言说明（例："Warehouse count vs.
  scenario target; colony-wide storage used by all haulers."）。
  模块纯数据 + 纯函数，无副作用，便于单元测试。

- [ ] **Step 2**: `src/ui/hud/HUDController.js:render` — `edit` —
  在渲染 `statusObjective`（~line 431）之后，新增一个 helper 调用：
  `this.#applyGlossaryTooltips()`，内部对已有 DOM 节点
  （`statusObjective`, `statusScenario`, `statusScoreBreak`,
  `prosperityVal`, `threatVal`, `cooksVal`, `smithsVal`, `haulersVal`,
  `herbalistsVal`, `storytellerStrip`）追加
  `node.setAttribute("title", explainTerm(key))`。
  不覆盖 Round-0 已设的 `title`（先读 `getAttribute("title")`，如果非空
  且已是 glossary 文案则跳过；否则写入 `已有title | glossary文案`）。
  - depends_on: Step 1

- [ ] **Step 3**: `src/ui/hud/HUDController.js:constructor` — `edit` —
  缓存新引入的 DOM 引用（`this.prosperityVal`/`this.threatVal` 等若不存在
  则 `document.getElementById(...)`；其余已有引用复用）。
  - depends_on: Step 2

- [ ] **Step 4**: `src/ui/tools/BuildToolbar.js:sync` — `edit` —
  Colony 面板相关 role label（`WOOD`, `STONE`, `COOK`, `SMITH`,
  `HERBALIST`, `HAUL`）的渲染节点追加 `title` 属性：使用
  `explainTerm("haul")` 等。如果这些 label 是纯文本节点，用 parent
  `<span>` 的 `title`。仅在已有节点上 setAttribute，不新建元素。
  - depends_on: Step 1

- [ ] **Step 5**: `test/ui/hud-glossary.test.js:new` — `add` —
  新增单元测试：(a) `HUD_GLOSSARY` 键集合必须包含 feedback §2.6 提到的
  10 条缩写；(b) 所有 value 必须是非空字符串且 ≤ 120 字符；
  (c) `explainTerm("unknown")` 应返回空串而非 throw；
  (d) snapshot lock：key 列表排序后哈希等于预设值（防止后人误删）。
  - depends_on: Step 1

- [ ] **Step 6**: `CHANGELOG.md:Unreleased` — `edit` —
  按 CLAUDE.md 约定追加条目：
  `- v0.8.2 Round-1 01a-onboarding: HUD glossary tooltips for 10+
  abbreviated terms (Dev, wh, routes, HAUL, COOK…) — hover any token
  to see a one-line explanation.`
  - depends_on: Step 2, Step 4

---

## 5. Risks

- **风险 1**：`title` 属性在移动端 / 触屏完全没有 hover 交互 →
  tooltip 在这些设备上不可见。缓解：本项目是 desktop-first Vite 应用，
  mobile 不在 HW06 评分范围；且本 plan 不会让 mobile 变得更糟（只是不变好）。
- **风险 2**：与 Round-0 已有 `title` 冲突（如
  `statusObjective.title = "Dev breakdown: …"`）。缓解：Step 2 明确要求
  **先读后写**，保留原有 title 作为前缀，用 `" | "` 拼接 glossary 文案。
- **风险 3**：`setAttribute("title", …)` 在每帧 render 都调用可能触发
  DOM 写；缓解：用 `_lastGlossaryAppliedMs` 或一次性 flag，render 的
  glossary helper 只跑一次（元素生命周期内 title 不变）。
- **风险 4**：新增 `src/ui/hud/glossary.js` 模块的 import 路径若拼错可能
  触发 Vite HMR 失败。缓解：Step 5 的单元测试会 fail-fast 捕获。
- **可能影响的现有测试**：`test/ui/` 下涉及 HUD snapshot 的文件
  （若存在；Grep 结果显示目前无纯 HUD snapshot 测试，低风险）。
  `test/scoreboard-*.test.js`（如存在）若断言 textContent 不受影响，
  但若断言 `title` 需同步更新——Step 2 的"前缀保留"策略缓解此风险。

---

## 6. 验证方式

- **新增测试**：`test/ui/hud-glossary.test.js` 覆盖字典完整性 + helper
  防御性行为（见 Step 5）。
- **手动验证**：
  1. `npx vite` 启动 dev server，打开 `http://localhost:5173`；
  2. 点 **Start Colony** 进入游戏；
  3. 鼠标悬停 `#statusObjective`（顶部"Survived 00:00:03 Score 3"）
     → 预期 tooltip 包含 "Dev Index" 或 "Survival score" 说明；
  4. 悬停 `#statusScenario`（"routes 1/1 · depots 1/1 · wh 3/2 …"）
     → 预期 tooltip 解释 "routes = scenario route completion"；
  5. 悬停 Colony 面板的 `COOK` label → 预期 tooltip "Cook: staffs
     Kitchen to turn Food into Meals"；
  6. **回归验证**：Heat Lens 打开后 `#storytellerStrip` 悬停依旧工作，
     原有 Round-0 tooltip 未被覆盖（显示拼接的复合文案）。
- **benchmark 回归**：运行 `scripts/long-horizon-bench.mjs` seed 42 /
  temperate_plains，DevIndex 不得低于 **当前值 - 5%**（本 plan 不触碰
  任何 simulation 系统，DevIndex 应保持不变；任何 drift 说明 render
  路径有意外副作用）。
- **测试命令**：`node --test test/ui/hud-glossary.test.js`
  （865 → 866 testing files，全部通过）。

---

## 7. UNREPRODUCIBLE 标记（如适用）

N/A — feedback 中的 "术语黑洞" 不需要复现操作步骤，它是 HUD 静态文案
结构层面的 UX debt，通过阅读 `src/ui/hud/HUDController.js` 和
`index.html` 即可确认：当前所有缩写节点（如 `#statusScenario`、
`#statusObjective` 之外的 KPI span）要么没有 `title`，要么 `title`
是面向开发者的诊断文本而非面向玩家的术语解释。Plan 的 Step 2
会系统性地补上这层解释。
