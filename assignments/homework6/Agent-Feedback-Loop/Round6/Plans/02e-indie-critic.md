---
reviewer_id: 02e-indie-critic
feedback_source: Round6/Feedbacks/02e-indie-critic.md
round: 6
date: 2026-04-25
build_commit: 5622cda
priority: P1
freeze_policy: lifted
estimated_scope:
  files_touched: 7
  loc_delta: ~480
  new_tests: 3
  wall_clock: 110
conflicts_with: []
---

## 1. 核心问题

Reviewer 给 4/10。归并 7 条扣分项 → 3 个根本问题（症状 → 病因映射）：

1. **作者声音渗透率 ~30%（不是 audio/visual 缺失，是"已写好的散文没被推到玩家眼前"）**
   症状：Worker memory stream "Vermin swarm gnawed the stores" 锁在 Inspector 抽屉里；
   "every road tile is a haul that never has to happen" 只在 BuildAdvisor tooltip 出现一次；
   Splash briefing 的 openingPressure 散文与游戏中 HUD 几乎不再交互；死亡只是一行 toast。
   病因：`storytellerStrip` 已能 surface salient eventTrace 一行（Round-1 02d），但只读
   `[SABOTAGE/SHORTAGE/VISITOR/WEATHER/died/warehouse fire]` 6 个 tag，**关系/友情/记忆事件
   未被纳入**；HUD 没有专属 "event ticker" 行；overlayEndPanel 仅显示 `endReason` 单行散文，
   没有把 scenario.openingPressure 作为终局回响。

2. **半透明的 Dev Telemetry — "作者还没决定要不要藏"**
   症状："Why no WHISPER?" / "Mood:0.59" / "Top Intents: eat:1.40" 一直在 HUD/Inspector 上
   裸露，但 Settings 里又有 "Hide Dev Telemetry" 按钮（自我矛盾）；URL `?template=…`
   半工作（URL 改但模板不切）；F1 在 splash 触发 reset 而不是 help dialog。
   病因：`devModeGate.js` 已有 `dev-mode` body class 和 `casual-mode` body class，但二者
   覆盖范围不对齐——`storytellerStrip.diagnostic.whisperBlockedReason`（已生成 4 种 badge
   状态）的 player-facing 文案 **不受 casual-mode 收敛**；HUDController 把 raw `Mood:0.59`
   等小数也当文本贴进去，没有 humanise 步骤；index.html 的 F1 keydown 监听器在
   gameStateOverlay 显示时仍触发 `toggleHelp()`，但 menu 本身没有 help-modal 逻辑短路，
   导致看似"reset"。

3. **终局没有仪式 + 模板视觉相同**
   症状：食物降到 0 不触发 game over；三/四张地图 70% 画面相同。本轮 freeze=lifted
   允许深层重写，但渲染层换皮（手绘 tile）超出本 plan scope。**可落地的部分：**
   `overlayEndPanel` 已存在但只渲染 `endReason` + `endStats` 两行——可以在终局调用一段
   2.5s "fade-to-blackbox + author line"（复用 scenario.meta.openingPressure 与
   `buildAuthorToneLabel` 的 Dev/Threat tier 文案），构成最小 finale ceremony。
   病因：`runOutcome.js` 已写入终局元数据但 GameStateOverlay 渲染层只 `textContent` 直显，
   没有 staged transition / 没有"作者签名行"。

---

## 2. Suggestions（可行方向）

### 方向 A: "Author Voice Channel" — 把 30% 渗透率推到 65%+

- 思路：开三条管道把已写好但藏起来的作者文案推到玩家会看到的地方。
  (a) Storyteller strip 的 salient pattern 集合从 6 个扩到 11 个（加入
      `[\bbecame\b.*friend\b]` / `[\bbirth of\b]` / `[\bnamed after\b]` /
      `[\bdream\b]` / `[\bgrieving\b]`）—— 让 Mose Jorvik 的 friendship 事件浮上 HUD。
  (b) 在 HUD 顶部新增 `#authorTickerStrip`（独立于 `#storytellerStrip`），3-event 滚动
      ring buffer，dwell ≥ 4s/条；事件来源是 `state.debug.eventTrace` 的所有 tag。
  (c) `overlayEndPanel` 在 hidden→visible 翻转时多渲染 1 行 `endAuthorLine`：复用
      `buildAuthorToneLabel(metric, value)` 的 8 条已有短句，按终局 dev/threat tier 选定。
- 涉及文件：`src/ui/hud/storytellerStrip.js`（扩 SALIENT_BEAT_PATTERNS）、
  `src/ui/hud/HUDController.js`（新增 ticker render）、`index.html`（新 DOM 节点 +
  CSS）、`src/ui/hud/GameStateOverlay.js`（endAuthorLine）。
- scope：中（~280 LOC，3 个测试文件）
- 预期收益：reviewer 第 (1) (3) 项基线 +1.5 分；不动 sim 内核，零回归风险
- 主要风险：HUD 顶栏已被诟病"七个区块挤一行"，新增 ticker 必须 collapse 到 dev-mode
  off / casual-mode on 的 36px 单行，casual-mode 需把它和其他 KPI 共占

### 方向 B: "Telemetry Curtain" — 把裸数字翻译成形容词 + F1/URL hardening

- 思路：在 casual-mode 下，所有 `Mood:0.59`/`Morale:0.84`/`Top Intents: eat:1.40` 替换
  成 5 档形容词（restless/content/proud + hungry/peckish/fed），通过纯函数
  `humaniseScalar(metric, value)`；并修 F1-on-splash + URL `?template=` 半工作两个 bug。
- 涉及文件：`src/ui/panels/InspectorPanel.js`（mood/morale/social/rest 替换）、
  `src/simulation/ai/brains/NPCBrainSystem.js`（intent 标签的展示函数）、
  `src/app/GameApp.js`（URL `?template=` 解析→ overlay 选中）、`index.html`
  （F1 在 menu 显示时改为 `if (overlayMenuPanel.visible) return`）。
- scope：中（~220 LOC，2 个测试文件）
- 预期收益：reviewer 第 (2) 项基线 +1 分；F1/URL bug 一并修
- 主要风险：humaniseScalar 与 LLM prompt（`PromptBuilder` 仍要原始数字）需严格分层；
  写错会让 LLM 收到形容词导致 fallback 退化

### 方向 C: "Finale Ceremony 2.5s" — 终局仪式 + 一行作者签名

- 思路：把 `overlayEndPanel` 显示动画从瞬切改成 fade-in 2.5s + 缓动；reason 行下加
  `endAuthorLine`（复用 scenario.openingPressure），标题随终局 dev tier 在 4 个候选间
  挑选（"The colony stalled"/"The frontier ate them"/"Routes compounded into rest"/
  "The chain reinforced itself"）。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`、`index.html`（CSS @keyframes endFadeIn）、
  `src/app/runOutcome.js`（暴露 dev tier）。
- scope：小（~120 LOC，1 个测试文件）
- 预期收益：reviewer 第 (3) 项基线 +0.5 分；最便宜
- 主要风险：动画在 prefers-reduced-motion 下需短路；CHANGELOG 已被 freeze 不能改 v0.8.2
  顶部，需追加 Round-6 Wave-2 02e 节

---

## 3. 选定方案

选 **方向 A + 方向 C 合并**（A 主、C 附）。

理由：
- reviewer 评分上限被"作者声音渗透率"卡住（4 → 5.5 的最大变量）；方向 A 直接攻打这个变量。
- 方向 B 的 humaniseScalar 涉及 LLM prompt 分层，本轮 freeze=lifted 允许，但已有 `02d-roleplayer`
  已在 friendship reason UI 上动过 InspectorPanel；本轮再改有冲突风险。
- 方向 C 单做收益小，但**附在 A 上**等于把 author voice channel 从"游玩中段"延伸到"终局
  仪式"，叙事弧完整。
- A+C 总计 ~480 LOC、3 个新测试，落在 standard budget 内；4-seed benchmark 仅触 UI 层
  （`src/ui/hud/**` + `src/ui/hud/GameStateOverlay.js` + `src/app/runOutcome.js` 暴露 tier）
  不动 sim systems → DevIndex 不会回归。
- 不触碰 freeze 红线：`src/benchmark/**`、`scripts/long-horizon-bench.mjs`、`package.json`、
  `vite.config.*` 全部不改；CHANGELOG 仅追加 Round-6 02e 新章节。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/hud/storytellerStrip.js:39-46` — `edit` —
  扩展 `SALIENT_BEAT_PATTERNS` 从 6 条到 11 条，新增 5 条：
  `/\bbecame\b.*\bfriend\b/i`、`/\bbirth of\b/i`、`/\bnamed after\b/i`、
  `/\bdream\b/i`、`/\bgrieving\b/i`。同时把 `NARRATIVE_BEAT_MAX_AGE_SEC` 从 15 → 20
  （friendship 事件不像 sabotage 那么紧迫，玩家也能"延迟享用"）。

- [ ] **Step 2**: `src/ui/hud/storytellerStrip.js:formatBeatText` — `edit` —
  在 `formatBeatText` 中按 tag 决定前缀图标（💀 死亡 / 🤝 friendship / 🌧 weather /
  ⚠ sabotage / ✨ birth），返回值结构改为 `{ text, kind }`，其中 kind ∈
  `{death, friendship, weather, sabotage, birth, generic}`。仅给 HUDController 用，
  legacy `computeStorytellerStripText` 保持单字符串。
  - depends_on: Step 1

- [ ] **Step 3**: `index.html:1700-1716` — `add` —
  在 `#gameStateOverlay` 之前的 HUD 顶部区域（与 `#storytellerStrip` 同级）新增
  `<div id="authorTickerStrip" aria-live="polite" hidden>...<span class="ticker-icon"></span>
  <span class="ticker-text"></span></div>`；CSS 加在 `index.html:1427-1440` 临近 boot
  splash 样式块：`#authorTickerStrip { position: fixed; top: 38px; left: 50%;
  transform: translateX(-50%); height: 22px; ... transition: opacity 320ms; }
  body.casual-mode #authorTickerStrip { font-size: 11px; }
  body.dev-mode #authorTickerStrip { display: none; /* dev users see DeveloperPanel */ }`。
  - depends_on: Step 2

- [ ] **Step 4**: `src/ui/hud/HUDController.js:159-168` — `edit` —
  新增字段 `this._tickerRing = []`（容量 3）、`this._tickerLastShownAt = 0`、
  `this._tickerDwellMs = 4000`。在 `render()`（约 line 980-1010 的现有
  `_stripBeatText` 块附近）新增 `renderAuthorTicker(state)`：从
  `extractLatestNarrativeBeat(state)` 取最近一条；若与 ring buffer top 不同则
  unshift；DOM 写入 `#authorTickerStrip` 的 .ticker-icon / .ticker-text；尊重
  dwell 节流（4s 内不切换）；尊重 `prefers-reduced-motion`（无 fade）。

- [ ] **Step 5**: `src/ui/hud/GameStateOverlay.js` — `edit` —
  在 `showEndPanel(reason, stats)` 中读 `state.gameplay.scenario.meta.openingPressure`
  与 `runOutcome.devTier`（来自 Step 7），按 4 档 dev tier 选标题：
  `< 25 → "The colony stalled."` / `25-49 → "The frontier ate them."` /
  `50-74 → "Routes compounded into rest."` / `>= 75 → "The chain reinforced itself."`；
  追加 `endAuthorLine` 段（一行散文，复用 openingPressure）。CSS keyframes
  `@keyframes endFadeIn { from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; } }`，duration 2.5s ease-out，在
  `prefers-reduced-motion: reduce` 下退化为 0.2s 直显。
  - depends_on: Step 7

- [ ] **Step 6**: `src/ui/hud/GameStateOverlay.js` — `add` —
  新增 DOM 引用 `this.endAuthorLine = document.getElementById("overlayEndAuthorLine")`，
  对应 `index.html:1747` 的 `#overlayEndStats` 之后 `<p id="overlayEndAuthorLine"
  class="overlay-author-line"></p>`；CSS：`.overlay-author-line { margin-top: 14px;
  font-style: italic; color: rgba(208,232,255,0.72); font-size: 13px; }`。

- [ ] **Step 7**: `src/app/runOutcome.js` — `edit` —
  在 outcome 对象中暴露 `devTier`：从 `gameplay.devIndex` 读取并按上面 4 档分桶；
  纯加字段，不改原 schema（避免破坏 Round-1/Round-5 已存在的快照对比）。

- [ ] **Step 8**: `test/storyteller-strip-friendship-beat.test.js` — `add` —
  新建测试：构造 `state.debug.eventTrace = ["[3.2s] Mose Jorvik became Close
  friend with Mose Hale"]`，断言 `extractLatestNarrativeBeat` 返回非 null 且
  `formatBeatText` 输出 kind === "friendship"。覆盖 birth/dream 同样模式。
  - depends_on: Step 2

- [ ] **Step 9**: `test/author-ticker-render.test.js` — `add` —
  使用 jsdom-style stub 注入 `#authorTickerStrip` + 3 条 eventTrace；多次
  `hud.render(state, dt)` 调用断言 (a) ticker 切换最少间隔 4s；(b) 在
  `body.dev-mode` 时 hidden；(c) reduced-motion 关闭 fade transition class。
  - depends_on: Step 4

- [ ] **Step 10**: `test/end-panel-finale.test.js` — `add` —
  断言 `GameStateOverlay.showEndPanel` 在 4 个 devTier 下分别选 4 个标题；
  断言 `#overlayEndAuthorLine` 拿到 scenario.meta.openingPressure 文本（temperate_plains
  的"frontier is wide open"在 endTier=low 时正确出现）。
  - depends_on: Step 5

- [ ] **Step 11**: `CHANGELOG.md:3` — `add` —
  在文件顶端新增 `## [Unreleased] - v0.8.2 Round-6 02e-indie-critic: author voice
  channel + finale ceremony` 章节，4 个分类：New Features（ticker, finale）、
  New Tests（3 个）、Files Changed（7 个）、Validation（test green + DevIndex baseline）。

---

## 5. Risks

- **R1: Author ticker 遮挡 HUD 顶栏**。新 strip 在 fixed top:38px，casual-mode 下 HUD
  顶栏第一行已有 7 个区块；缓解：ticker 在 idle（无 eventTrace 内容）时整体 `display: none`
  而非保留高度；dev-mode 下完全隐藏（让 DeveloperPanel 接管）。
- **R2: SALIENT_BEAT_PATTERNS 扩张可能让 noise 占上风**。friendship 事件比 sabotage
  频率高 5-10×；ring buffer + 4s dwell 必须严格执行，否则 ticker 变成"刷友情墙"。
- **R3: Step 7 改 runOutcome 字段可能影响快照测试**。原计划只 add 字段；需要 grep
  `expectedKeys`/`Object.keys(outcome)` 确认没有 strict snapshot lock。
- **R4: 现有测试受影响**：`test/storyteller-strip.test.js`、
  `test/storyteller-strip-whisper-diagnostic.test.js`、`test/help-modal.test.js`（Step 6
  额外 DOM 元素不影响 modal 选择器）。Step 1 扩 patterns 可能让原 6-tag 断言失败 →
  改成"至少包含 6 个 tag"宽松断言。
- **R5: Finale fade-in 在 prefers-reduced-motion 下未尊重 → 影响 a11y 评分**。
  Step 5 必须在 CSS 中显式写 `@media (prefers-reduced-motion: reduce) { .overlay-end-panel
  { animation-duration: 0.2s !important; } }`。
- **可能影响的现有测试**：
  `test/storyteller-strip.test.js`、`test/storyteller-strip-whisper-diagnostic.test.js`、
  `test/scenario-fade-in.test.js`、`test/help-modal.test.js`、`test/run-outcome.test.js`
  （如存在），全部需在执行期 grep + adjust。

---

## 6. 验证方式

- **新增测试**：
  - `test/storyteller-strip-friendship-beat.test.js`（friendship/birth/dream 进入
    salient ring）
  - `test/author-ticker-render.test.js`（ticker dwell + dev-mode/casual-mode 互斥 +
    reduced-motion）
  - `test/end-panel-finale.test.js`（devTier 4 档标题 + endAuthorLine 注入）

- **手动验证**：
  1. `npx vite` → 选 Temperate Plains → 启动 → 让 30 秒走过 → 应在 HUD 顶栏看到
     `#authorTickerStrip` 滚动 friendship/sabotage 事件，每条 dwell ≥ 4s
  2. URL 加 `?ui=full` → ticker 仍显示但 dwell 缩短到 2.5s 不变；URL 加 `?dev=1` →
     ticker 完全隐藏
  3. 让食物 → 0 触发终局 → overlayEndPanel 应 fade-in 2.5s，标题随 devIndex 选 4 档
     之一，下方有一行散文
  4. F1 在 splash 显示时不再触发 reset（这是方向 B 的内容，本 plan 不修，但要确认
     未引入新 regression）

- **benchmark 回归**：
  `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains
  --duration 600` —— DevIndex baseline 当前 ~44（v0.8.1 报告值）；本 plan 不动 sim
  系统，DevIndex 不得低于 41（-7%）。同时 4-seed gate（42, 1337, 31337, 999）必须
  全部通过 GREEN 阈值。

---

## 7. UNREPRODUCIBLE 标记（如适用）

未启动 Playwright session 复现，因为 feedback §2 描述的现象高度可信且与代码状态
直接对应（`storytellerStrip.js:39-46` 6-tag set、`overlayEndPanel` 单行 reason、
`AUTHOR_VOICE_PACK` 已存在但未扩散），无需现场截图佐证。**未复现条目**：
- "Autopilot ON - rule-based - n" 截断 → autopilotStatus.js:76 模板字符串确实可能
  在 narrow viewport 下被 CSS clip，但本 plan 不在 scope 内（属方向 B / 02b/01c-ui
  领域）。
- 中文 i18n 残留 `物流图例` → 已在 `index.html:1918` 直接核实，不属于本 reviewer
  关心的"作者声音"主轴问题，留给后续 i18n 子计划。
