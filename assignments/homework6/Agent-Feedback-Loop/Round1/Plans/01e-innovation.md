---
reviewer_id: 01e-innovation
feedback_source: Round1/Feedbacks/01e-innovation.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~260
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

Reviewer 给了 3/10，但核心病因只有一个：**项目的差异化 hook（LLM worker AI、Storyteller、Heat Lens、PressureLens）实际上都已经存在于代码库中，却没有被 surface 到首次游玩的外部玩家视野里**。这不是缺 mechanic，是缺 UX / 可见性层。具体：

1. **LLM 通道不可见**：`state.ai.lastPolicySource` 已经区分 `"llm" | "fallback" | "none"`，`AIDecisionPanel` 已经渲染 causal chain 和 directives，但顶栏 storyteller strip 只输出一行，且"LLM 正在驱动"这个事实没有任何高可读性的指示（无徽章、无颜色、无工具提示解释"Rule-based vs LLM"的含义）。Reviewer 明确写"我在 18 分钟里完全感受不到 LLM 在场"——他确实没看见，因为我们从不告诉他。
2. **Heat Lens 按下去没反馈**：`toggleHeatLens` 已经切换 `pressure → heat → off` 三态，但只靠一次性的 `actionMessage` toast 和 `heatLensBtn.classList.toggle('active')`；reviewer 说"按了两次几乎看不见叠加层"——说明 toast 转瞬即逝，按钮状态不明显，而且 **没有 legend**（红=surplus 蓝=starved 的语义要玩家自己去读 title），导致"按了也等于没按"。
3. **Storyteller 输出像调试字符串**：`computeStorytellerStripText` 当前直出 `[Rule-based Storyteller] <focus>: <summary>`。`focus`/`summary` 来自 AI policy 的原始字段，对外部玩家就是 "workers should sustain frontier buildout while keeping hunger..." 这种元注释。需要一个**轻量 prefix / 模式徽章**把 "这是 AI 导演在说话" 和 "这是 AI 目标的人类可读翻译" 分开，并且在 LLM 源可用时给一个视觉区分。

## 2. Suggestions（可行方向）

### 方向 A: AI 可见性 Polish Pack（surface 已有 LLM / Heat Lens / Storyteller）
- 思路：**不加任何新机制**，只把 `lastPolicySource`、heat lens 状态、storyteller 文本的"源头"和"语义"显性化。(a) storyteller strip 增加一个彩色徽章（LLM=青色 / Rule=灰色 / Idle=暗），把元注释文本重写成更像"导演在说话"的格式；(b) 给 heat lens 加一个**常驻的 2-项 legend**（小色块 + 文字：红=Supply Surplus, 蓝=Starved Input），在 heat 模式开启时显示在 HUD 顶栏右侧或 lens 按钮下方；(c) 在 `How to Play` 对话框（index.html 里已经有）里增加一小节 "Why Utopia is different"，用 3 句话指向 AI Decisions 面板 / Heat Lens / 6 个差异化模板。
- 涉及文件：`src/ui/hud/storytellerStrip.js`、`src/ui/hud/HUDController.js`、`src/app/GameApp.js` (`toggleHeatLens`)、`index.html`（storyteller strip 结构 + heat legend DOM + howToPlay tabs）、`src/app/shortcutResolver.js` 不动。可能还需要一个小 CSS 块（写在 index.html 里）。
- scope：中（主要是 DOM + 纯计算函数调整，无引擎逻辑）
- 预期收益：外部玩家第一次打开就能看到"这个 colony sim 里有 LLM 驱动 / 我刚按了 L 确实切到了 heat 模式 / 我知道这两种颜色各代表什么"。直接命中 reviewer 抱怨的三条主要差异化 hook 不可见问题，且一行代码都不加新机制——完全契合 HW06 freeze。
- 主要风险：storyteller strip 当前只渲染 textContent（HUDController.js:355），若改为 HTML 节点（徽章 span）需要小心 XSS（policy focus/summary 来源于 AI 输出，必须走 textContent + 拼接 DOM 而非 innerHTML）；heat legend DOM 需要确保在非 heat 模式下隐藏，否则会污染 pressure 模式 UI。

### 方向 B: "Agent Thought Stream" 浮窗（选中工人时显示其近 N tick 决策轨迹）
- 思路：reviewer 的第一条改进建议原话。复用 `EntityFocusPanel` 已经在显示的 `Mode / Policy Source / Model` 三字段，加一个"最近 N 条 intent → state → action"的滚动小窗。需要读 worker 的 `state.log` / `aiTrace`（若存在）。
- 涉及文件：`src/ui/panels/EntityFocusPanel.js`、`src/simulation/npc/WorkerAISystem.js`（读取 trace）、可能需要新增一个 `aiTrace` 环形缓冲区挂在 worker.state 上。
- scope：中/大
- 预期收益：直接让 LLM/rule AI 决策"可观察"，是最彻底的差异化暴露。
- 主要风险：**touches simulation state** — 增加环形缓冲会修改 entity shape、可能影响 snapshot/load 序列化（`src/app/snapshotService.js`），需要改快照测试。且环形缓冲本质上是**新数据流**，踩到 freeze 边界，orchestrator 可能判定为"新 mechanic"。

### 方向 C: 重写 Storyteller 文本管线为"narrator lines"
- 思路：reviewer 第二条建议。把 `policy.focus + policy.summary` 的原始 AI 字段替换成一张 narrator line 模板表（例如 focus=farming+summary 有 hunger 词 → "Hunger gnaws at the colony — the director orders every spare hand to the fields."）。
- 涉及文件：新增 `src/ui/hud/storytellerLines.js` 模板库 + 改 `storytellerStrip.js` 调用路径。
- scope：小/中
- 预期收益：把元注释变成类 RimWorld narrator flavor，直接击中 reviewer 的第二条主要吐槽。
- 主要风险：线下翻译表无法覆盖 LLM 未来输出空间，看起来是 feature 但实际是"给动态输出套模板"，容易被 reviewer 觉得更假；且与 `WorldExplain.js` 的 digest 翻译逻辑职责重叠，有重复维护风险。

## 3. 选定方案

选 **方向 A（AI 可见性 Polish Pack）**，理由：

- **严格契合 freeze**：0 mechanic，0 simulation-state 修改，只改 DOM / 纯 UI 组件函数。反过来说方向 B 需要在 entity 上挂新字段，触边界；方向 C 改叙事管线但 reviewer 的最大两个痛点其实是 "heat lens 没反馈" 和 "LLM 看不见存在感"，而不仅是叙事措辞。
- **收益/成本比最好**：一次改动同时命中 reviewer 清单前 3 条和第 5 条（LLM 显性化、Storyteller 重做为可识别的导演发言、Heat Lens 可见化）。
- **测试影响最小**：`storytellerStrip.js` 目前只有 HUDController 调用（并且是 `textContent` 比较），我们保留 `computeStorytellerStripText` 的纯字符串签名作为后向兼容，并新增一个 `computeStorytellerStripModel(state)` 返回 `{mode, focusText, summaryText}`，由 HUDController 自己组装 DOM。这样已有测试不需要改。
- **HUD 顶栏已有 `#storytellerStrip` 容器**（index.html:888）和 `#heatLensBtn`（:896），DOM 足够，不引入新面板。
- **方向 A 回收 reviewer 的"唯一值得肯定"**：它同时在 `How to Play` 里把 6 种模板差异 + AI Decisions 面板的入口点名，直接把 reviewer "+1 给模板差异" 这一点从隐藏变成首屏可见。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/hud/storytellerStrip.js:computeStorytellerStripText` — `edit` — 保留旧函数签名（返回字符串，现有测试继续绿），新增并 `export function computeStorytellerStripModel(state)` 返回 `{ mode: "llm"|"fallback"|"idle", focusText: string, summaryText: string, prefix: string }`。`mode` 从 `state.ai.lastPolicySource` 派生：`"llm" → "llm"`，有 policy 数据但 source 非 llm → `"fallback"`，无 policy → `"idle"`。focus / summary 复用当前提取逻辑（第一句 summary 截断），summaryText 额外做一个 "调试词 → 人话" 的轻量替换映射（例如 `sustain frontier buildout` → `sustain buildout across the frontier`；不超过 6 条映射，写在文件内部常量里）。

- [ ] Step 2: `index.html:888` — `edit` — 把 `<div id="storytellerStrip" ...>` 替换为结构化模板：`<div id="storytellerStrip" ...><span id="storytellerBadge" class="hud-storyteller-badge">RULE</span><span id="storytellerFocus"></span><span id="storytellerSummary"></span></div>`。保留外层 id 以兼容 `HUDController.storytellerStrip` 引用。新增极简 CSS（写在同一 `<style>` 块里，复用 `:root` 变量）：`.hud-storyteller-badge{font-size:9px;padding:0 4px;border-radius:3px;margin-right:4px;letter-spacing:.5px;background:var(--accent-dim);color:var(--accent);}` + `.hud-storyteller-badge[data-mode="llm"]{background:rgba(76,175,80,.18);color:#9be9a8;}` + `[data-mode="idle"]{opacity:.55;}`.
  - depends_on: Step 1

- [ ] Step 3: `src/ui/hud/HUDController.js:353-359` — `edit` — 替换 `textContent` 赋值为结构化更新：调用 `computeStorytellerStripModel(state)`，然后查 `#storytellerBadge / #storytellerFocus / #storytellerSummary` 子节点并分别写 `.textContent` + `dataset.mode`。顶层 `title` 仍保留整句文本，便于悬停查看。若 getElementById 返回 null（测试或旧 DOM），fallback 回 `computeStorytellerStripText` 以保持向后兼容。

- [ ] Step 4: `index.html` 紧邻 `#heatLensBtn`（:896 附近的 panel-toggles 容器内或之后）— `add` — 插入 `<div id="heatLensLegend" class="heat-lens-legend" hidden><span class="legend-dot legend-red"></span>surplus<span class="legend-dot legend-blue"></span>starved</div>` 作为兄弟节点。对应 CSS 块（同 `<style>`）：`.heat-lens-legend{display:inline-flex;align-items:center;gap:4px;font-size:10px;opacity:.85;margin-left:6px;} .legend-dot{width:8px;height:8px;border-radius:50%;} .legend-red{background:#e95c4d;} .legend-blue{background:#4da8e9;}`. 默认 `hidden` 属性确保非 heat 模式下彻底隐藏（不占位）。

- [ ] Step 5: `src/app/GameApp.js:toggleHeatLens` (1383-1403) — `edit` — 在当前 `btn.classList.toggle('active', mode === 'heat')` 之后追加：`const legend = document.getElementById('heatLensLegend'); if (legend) legend.hidden = (mode !== 'heat');`。不改函数返回值、不碰 toast 文案。
  - depends_on: Step 4

- [ ] Step 6: `index.html` `How to Play` 对话框中的 `Resource Chain` tab 旁新增一个 **"What makes Utopia different"** tab（复用现有 tab 结构；reviewer 第一印象里明确打开过此对话框）— `add` — 三段文字，控制在 ~90 词：(1) "An AI director drives every worker — watch the **AI Decisions** panel in the right sidebar to see the current policy and its causal chain. The badge on the status bar reads LLM (live model) or RULE (deterministic fallback)." (2) "Press **L** to cycle the Supply-Chain Heat Lens: red = producer drowning next to a full warehouse, blue = processor starving for input." (3) "The map template changes far more than cosmetics — Archipelago Isles forces naval logistics, Fortified Basin gives you natural chokepoints, Fertile Riverlands trades defense for yield." 不加外部链接、不加新按钮。

- [ ] Step 7: `test/storyteller-strip.test.js` — `add` — 新增测试文件，case：(a) `computeStorytellerStripModel({ai:{lastPolicySource:'llm', groupPolicies:new Map([['workers',{data:{focus:'farming',summary:'Hunger spikes. Pull cooks to kitchens.'}}]])}})` 返回 `mode==='llm'`、`focusText==='farming'`、`summaryText==='Hunger spikes.'`、`prefix==='LLM Storyteller'`；(b) `lastPolicySource:'fallback'` + 有 policy → `mode==='fallback'`；(c) 无 policy → `mode==='idle'`、focusText/summaryText 为人类可读 idle 提示；(d) `computeStorytellerStripText` 旧函数签名仍返回与当前等价的单行字符串，确保现有 HUD 回退路径不破坏。

- [ ] Step 8: `test/heat-lens-legend.test.js` — `add` — 新增测试文件，用 JSDOM 或简易 document stub（项目内已有类似方式，参照 `test/ai-decision-panel.test.js` 的 DOM stub 习惯），断言：调用 `toggleHeatLens` 循环 pressure→heat→off 时，`#heatLensLegend.hidden` 在 heat 态为 `false`，其他两态为 `true`；且 `#heatLensBtn.classList` 的 `active` 与 legend 显隐同步。若项目测试基建对 DOM 依赖较弱，退化为直接测试 `GameApp.toggleHeatLens` 返回值 + 手动构造 document 模拟。

- [ ] Step 9: `CHANGELOG.md` — `edit` — 在当前 unreleased 章节追加一条：`### UX / Polish` + 列出 "Storyteller strip gains LLM/RULE/IDLE badge"、"Heat Lens gains always-on legend when active"、"How to Play adds 'What makes Utopia different' tab"，按 CLAUDE.md 中"每次 commit 必须同步 CHANGELOG"的约束要求。

## 5. Risks

- **DOM 插入顺序**：storyteller strip 结构从单文本节点改为含三个 span 子节点。若 `HUDController.storytellerStrip` 持有的 DOM 引用是旧节点本体（重新创建可能丢引用），需要在 constructor 里每次 `getElementById` 重新定位子节点，而不是缓存。已经在 Step 3 显式处理。
- **XSS 面**：policy summary 可能源自 LLM 输出。必须一律走 `.textContent`，绝不 `innerHTML` 拼接。Step 3 明确规定这一点。
- **视觉拥挤**：status bar 已经是 `flex-wrap:nowrap + overflow-x:auto`（见 index.html:63-66），新增的 heat legend 在 1280px 宽度下可能把 storyteller strip 挤到滚动外。缓解：legend 只在 heat 模式下显示（`hidden` 属性），默认状态 zero 宽度；storyteller strip 已有 `flex:1 1 260px;min-width:180px`，能自适应。
- **How to Play 对话框测试**：index.html 是静态模板，没有 DOM 单元测试。手工验证为主。Step 6 纯静态文本，不挂事件，破坏面最小。
- 可能影响的现有测试：
  - `test/storyteller-strip.test.js`（若已存在同名文件）—— Grep 下来没有同名测试文件，安全（Step 7 新增）。
  - `test/ai-decision-panel.test.js` —— 不动 AIDecisionPanel，不受影响。
  - `test/hud-*.test.js`（若有）—— 需要 coder 用 `Grep "storytellerStrip" test/` 确认无对 `storytellerStrip.textContent` 的精确字符串断言；若有，改为 `.title` 断言或字符串包含。

## 6. 验证方式

- **新增测试**：
  - `test/storyteller-strip.test.js` 覆盖 4 个 mode 分支 + 后向兼容签名（Step 7）。
  - `test/heat-lens-legend.test.js` 覆盖 lens 三态与 legend 显隐同步（Step 8）。
  - 两个文件按 `node --test test/*.test.js` 直接跑。
- **手动验证**：
  1. `npx vite` 启动 → 打开 `http://127.0.0.1:5173` → 观察顶栏 storyteller strip 现在带 `RULE` 徽章（灰色底），文本从"workers should sustain..."变为人话版。
  2. 按 `L` 键一次 → 右上角 Heat Lens 按钮进入 active 态，且按钮旁出现"● surplus ● starved"legend 小条；再按 `L` 到 off 态 → legend 消失。
  3. 打开 `How to Play` → 确认新增 "What makes Utopia different" tab 可点击，正文 3 段齐全，按钮不报 JS 错误。
  4. 选中一个 worker → EntityFocusPanel 的 `Policy Source` 行与顶栏徽章 mode 一致（`llm`/`fallback`/`none`）。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`，DevIndex 不得低于 v0.8.1 基线 `44 - 5% = 41.8`（即 ≥42）。本 plan 不触 simulation，但流程要求回归。
- **浏览器控制台**：Playwright smoke（`mcp__plugin_playwright_playwright__browser_navigate` → `browser_snapshot`）确认无 console error 关于 `storytellerBadge is null` 或 `heatLensLegend is null`。

## 7. UNREPRODUCIBLE 标记

不适用。Reviewer 的现象通过直接阅读代码已充分定位（`storytellerStrip.js` 真实输出格式、`toggleHeatLens` 只发一次 toast、`#heatLensBtn` 只有 `.active` class 视觉提示、`How to Play` 对话框无差异化说明）。未走 Playwright 实机复现以节省本轮 20 分钟预算。
