---
reviewer_id: 01c-ui
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round6/Feedbacks/01c-ui.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~360
  new_tests: 3
  wall_clock: 70
conflicts_with: []
---

## 1. 核心问题

Reviewer 给 3/10，列了 17 个具体缺陷。归并后是 **三条根本问题**：

1. **Dev/diagnostic 文本污染玩家视野**（feedback #2、#16、autopilot 字符串问题、左下 toast）
   "Why no WHISPER?: …", "AI proxy unreachable (timeout). Running fallback mode.",
   "Autopilot ON - rule-based - next policy in 9.8s | LLM offline — DIRECTOR steering",
   "Autopilot off. Manual contro…" 这一类字符串在非 dev 模式下对 casual 玩家完全无意义，
   且因为太长出现截断 / 视觉抢戏。这些字段应当只在 `body.dev-mode` 下出现，
   casual / full 默认 profile 下要么折叠成"⚠ AI"小图标 + 自定义 tooltip，要么完全静音。

2. **3D overlay 标签未做去重 / 屏幕空间合并**（feedback #3、#4、#27、#29 重叠截图）
   `SceneRenderer.js#updatePressureLensLabels` 把 PressureLens 的 24 个 marker 一一投影成
   `<div class="pressure-label">`，但完全没有：(a) 同 label 文本的 dedup、(b) 屏幕空间近邻
   merge / spider-out、(c) 半透明背景 anchor / 三角箭头。结果 "west lumber route" / "north
   timber gate" 在同一像素位置被叠出三四层；"halo / supply surplus / input starved"
   覆盖在场景中央把建筑遮住。

3. **关键 viewport 没有可用 layout**（feedback #6、#7、#8 + 响应式表）
   现有 `@media` 仅在 ≤1024 / ≤1280 / ≤1439 / ≤800 / ≤640 做局部收缩；
   - 800×600：Sidebar tab strip + transport pill 直接消失，UI 不可玩；
   - 1024×768：autopilot chip 因 max-width=180px 截断成 "Manual contro…" 没有可读
     ellipsis（黑底白字直接断），且没有 hover-展开 tooltip；
   - 2560×1440：根本没有 ≥1920 的高分屏 scaling，11–13px 字体在 27" 上极小。

P0 = 上述三条全是"商业感知层"硬伤，不动这三条用户无论玩什么都会先感知到。

## 2. Suggestions（可行方向）

### 方向 A: "Dev-string Quarantine + Label Dedup + UI Scale 三件套"（推荐）
- 思路：(1) 把所有 diagnostic 字符串 gate 到 `body.dev-mode` 下，casual 默认替换为
  silent ⚠ 图标 + 自定义 tooltip；(2) 在 `SceneRenderer#updatePressureLensLabels` 加
  屏幕空间 dedup（按 `label` 文本 + 30px buckets 合并），并给 `.pressure-label` 加
  cap 背景 + ▾ 三角；(3) 新增 `--ui-scale` CSS var + 高分屏 `@media (min-width: 2200px)`
  / 1024 / 800 三档完整 layout（800 直接 portrait splash 提示放大窗口）。
- 涉及文件：`index.html` (CSS + `#pressureLabelLayer` ▾ rule)、
  `src/render/SceneRenderer.js` (`#updatePressureLensLabels` dedup)、
  `src/ui/hud/HUDController.js` (Why no WHISPER + autopilot dev gating)、
  `src/app/GameApp.js` (AI proxy unreachable toast)、
  `src/ui/hud/autopilotStatus.js` (casual 简化文本)。
- scope：中
- 预期收益：直接关闭 feedback 中 #2 / #3 / #4 / #6 / #7 / #8 / #16 / #29 共 8 条 P0/P1
  视觉硬伤；3/10 → 5/10 视觉感知阶跃。
- 主要风险：HUD 测试断言可能匹配旧字符串（hud-autopilot-status-contract、
  hud-storyteller、hud-truncation-data-full）；改前需先扫断言文本。

### 方向 B: "全量 UI 重写为 shadcn-like component kit"
- 思路：用 `frontend-design` skill 引入一套 design-token 系统，重画 splash、
  topbar、sidebar、tooltip、toast。
- 涉及文件：几乎整个 `src/ui/` + `index.html` + 新增 `src/ui/styles/tokens.css`。
- scope：大
- 预期收益：完全的 commercial polish，可能上 7/10。
- 主要风险：需要 1500+ LOC，4-seed bench 极易 regress（HUD 重新挂 DOM 影响
  rAF 时序）；远超本轮 enhancer 单 plan 体量；和其它并行 reviewers 的 plan
  冲突概率高。

### 方向 C: "只补 dev-string quarantine（最小创口）"
- 思路：仅做方向 A 的第 (1) 件——把 Why no WHISPER / AI proxy unreachable /
  autopilot 长文本全部 gate 到 dev-mode；其余视觉问题留待下一轮。
- 涉及文件：`HUDController.js`、`GameApp.js`、`autopilotStatus.js`。
- scope：小
- 预期收益：只解决 feedback #2 / #16 两条，3/10 → 4/10。
- 主要风险：低；测试只需更新 contract 字符串即可。

## 3. 选定方案

选 **方向 A**。理由：
- freeze_policy = `lifted`，本轮明确允许"UI 重写 / 新 mechanic"，方向 C 太保守。
- 方向 B 单 plan 1500+ LOC 会撞死 bench gate（4-seed DevIndex 抖动 ≥5%）且和
  其它 reviewer plan 冲突概率高。
- 方向 A 命中 17 条 feedback 中 8 条 P0/P1 硬伤、~360 LOC、覆盖 dev-string /
  label-overlap / 响应式三大根因，scope 与 bench 风险都在可控范围。

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/hud/HUDController.js:1031-1091`（`Why no WHISPER` block）
      — `edit` — 在写 `#storytellerWhyNoWhisper` 与 tooltip diagSuffix 之前判断
      `document.body.classList.contains("dev-mode")`：dev-mode 下保留原行为；
      非 dev-mode 下 (a) 把 `whySpan.textContent` 设为空字符串并 `hidden`，
      (b) 把 `tooltipText` 中的 `${diagSuffix}` 改为空串。然后在 storyteller
      strip 右侧用一个新 `<span id="storytellerWhisperBadge" class="hud-warn-badge" hidden>⚠</span>`
      显示一个 12×12 ⚠ 图标，鼠标 hover 时通过 `#customTooltip` 系统弹出
      "Storyteller fell back to rule-based director"（取 `model.diagnostic.whisperBlockedReason`
      的 humanised 版本）。

- [ ] **Step 2**: `index.html:1648-1650` — `edit` — 把 `#storytellerWhyNoWhisper`
      span 从默认 `display:block` 改为只在 `body.dev-mode` 下可见：
      新增 CSS rule `body:not(.dev-mode) #storytellerWhyNoWhisper { display:none !important; }`
      并紧邻新增 `<span id="storytellerWhisperBadge" class="hud-warn-badge" hidden
      data-tooltip="">⚠</span>`，对应 CSS `.hud-warn-badge { display:inline-block;
      width:14px; height:14px; line-height:14px; font-size:11px; color:#ffd166;
      background:rgba(255,209,102,0.12); border:1px solid rgba(255,209,102,0.4);
      border-radius:50%; text-align:center; cursor:help; margin-left:6px; }`。
      depends_on: Step 1

- [ ] **Step 3**: `src/app/GameApp.js:1364-1370` — `edit` — 把 `state.controls.actionMessage`
      从 `AI proxy unreachable (${err}). Running fallback mode.` 拆成两条：
      非 dev-mode 时只设 `state.controls.actionKind = "ai-down"` 与 short message
      `"AI offline · using rules"`；dev-mode 时仍然附带 `(${err.message})`。
      检测方式：`typeof document !== "undefined" && document.body?.classList.contains("dev-mode")`，
      headless / SSR fallback 走非 dev 分支。

- [ ] **Step 4**: `src/ui/hud/autopilotStatus.js:75-86` — `edit` — 在
      `getAutopilotStatus(state)` 接受可选 `{ devMode = false }` 第二参数；
      非 dev-mode 时把 `baseText` 中 `next policy in ${remainingSec.toFixed(1)}s`
      移除，截短为 `Autopilot ON · ${combinedModeLabel === "rule-based" ? "rules" : combinedModeLabel}`；
      `llmText` 的 ` | LLM offline — DIRECTOR steering` 仅 dev-mode 显示。把
      max-width=180px chip 在 1024×768 下改为允许 wrap 到第二行（CSS 改）。
      调用方在 `HUDController.js`（grep `getAutopilotStatus(`）传 `{ devMode: document.body?.classList?.contains("dev-mode") }`。

- [ ] **Step 5**: `src/render/SceneRenderer.js:1762-1816`（`#updatePressureLensLabels`）
      — `edit` — 在 `for` 循环之前先做 dedup：
      ```
      const seen = new Map(); // key = `${labelText}` → first { px, py, idx }
      const SCREEN_BUCKET_PX = 32;
      const NEAR_PX = 24;
      ```
      第一遍 project 所有 marker 得到 `{px, py, label, marker, visible}` 列表；
      第二遍：(a) 按 `label` 字符串 dedup（保留 priority 最高 weight），(b) 同
      label 不同位置之间若 `Math.hypot(dx, dy) < NEAR_PX` 则合并为 "labelText ×N"
      并放在 centroid。被合并的 pool entry `el.style.display = "none"`。
      额外给保留的 label el 加一个 ▾ 伪元素：`el.style.setProperty("--anchor-y", "100%")`
      （CSS 中用 `::after { content: '▾'; position:absolute; bottom:-9px; left:50%; }`）。

- [ ] **Step 6**: `index.html:448-467` — `edit` — `.pressure-label` 增加
      `box-shadow: 0 6px 18px rgba(0,0,0,0.55); backdrop-filter: blur(2px);`、
      `transform: translate(-50%, -160%);` 并新增 `::after` 三角 anchor；
      为 `.pressure-label[data-merged="1"]` 增加 ` count badge` 样式（`::before
      content: attr(data-count); …`）。

- [ ] **Step 7**: `index.html:1268-1460` — `edit` — 补全响应式 layout。
      新增三段 `@media`：
      - `@media (min-width: 2200px) { :root { --hud-height: 56px; } #statusBar { font-size: 14px; } .hud-resource .hud-label { font-size: 14px; } #sidebarTabBar .sidebar-tab-btn { font-size: 13px; } }`
      - `@media (max-width: 1024px) and (min-width: 801px)` 下确保
        `#aiAutopilotChip { max-width: none; white-space: normal; min-height: 32px; }`
        以避免 "Manual contro…" 截断。
      - `@media (max-width: 800px) { #wrap::before { content: 'Project Utopia is a desktop colony sim. Please widen the window to at least 1024px.'; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #0a1320; color: #c8e0f8; font-size: 16px; padding: 32px; text-align: center; z-index: 99999; } #ui, #viewport { display: none !important; } }` ——
        feedback 第 7 项明确建议 `800×600 直接降级为 portrait splash`。

- [ ] **Step 8**: `test/hud-storyteller.test.js` 或新增
      `test/hud-dev-string-quarantine.test.js` — `add` — 三个用例：
      (a) 非 dev-mode + `model.diagnostic.whisperBlockedReason = "LLM never reached"`
      时 `tooltipText` **不**包含 "Why no WHISPER"；`#storytellerWhisperBadge` 可见。
      (b) dev-mode 时仍然包含 "Why no WHISPER" 且 badge 隐藏。
      (c) `getAutopilotStatus(state, { devMode: false })` 不包含 `next policy in`
      与 `LLM offline — DIRECTOR`。
      depends_on: Step 1, Step 4

- [ ] **Step 9**: `test/pressure-lens-label-dedup.test.js` — `add` — 喂入 4 个
      label 都是 `"west lumber route"` 但 `(ix, iz)` 相邻的 marker，调用
      `#updatePressureLensLabels` 后断言 pressureLabelLayerEl 中
      `display:block` 的 `.pressure-label` 数 = 1，且 `dataset.count === "4"`。
      若需要可挂 jsdom 或直接调 dedup helper（建议把 dedup 抽成纯函数 export
      作为 testable surface）。
      depends_on: Step 5

- [ ] **Step 10**: `CHANGELOG.md` (Unreleased v0.8.2) — `edit` — 加一行
      `### UI / Polish (Round 6 — 01c-ui)`，列出 dev-string quarantine、
      pressure-label dedup、≥2200 / 1024–801 / ≤800 三个新 breakpoint。

## 5. Risks

- **HUD contract 测试**：`test/hud-autopilot-status-contract.test.js`、
  `test/hud-storyteller.test.js`、`test/hud-truncation-data-full.test.js`
  都断言 `Autopilot ON - rule-based - next policy in …`、`Why no WHISPER?: …`
  这类字符串。Step 1 / Step 4 必须先 `Grep` 这些 assertion，把对应断言切到
  dev-mode 分支或更新预期，否则 `node --test` 直接红。
- **PressureLens 视觉回归**：`test/pressure-lens.test.js` / `test/pressure-lens-anchor.test.js`
  可能依赖 marker 数 = label 数；dedup 之后 marker 仍 24 个但显示 div < 24，需
  在 jsdom 测试中明确选择 visible 子集。
- **800×600 portrait splash 太激进**：把 `#viewport` `display:none` 会让任何
  Playwright fixture 在窗口不够大时整个页面无 canvas，可能让 e2e 录像 / smoke
  在小屏 CI 失败。Mitigation：仅 ≤799px 触发，且 e2e 强制 1280+ viewport。
- **`document.body.classList` 在 SSR / headless 不存在**：所有 dev-mode 检测
  必须 `?.` 链 + `try/catch`，否则 storyteller / GameApp 测试在 node 下 NPE。
- **bench DevIndex**：4-seed bench gate 主要受 worker AI 影响，本 plan 不动
  `src/simulation`，预期 DevIndex 抖动 < 0.5。

## 6. 验证方式

- **新增测试**：
  - `test/hud-dev-string-quarantine.test.js` 覆盖 dev-mode on/off 下 Why no
    WHISPER + Autopilot 文本；
  - `test/pressure-lens-label-dedup.test.js` 覆盖屏幕空间 + 文本 dedup；
  - 现有 `hud-autopilot-status-contract.test.js` / `hud-storyteller.test.js`
    若断言改字符串，更新 expected value 或加 dev-mode 分支。
- **手动验证**：
  1. `npx vite` 后 `http://localhost:5173`（默认 casual 模式）→ topbar 右上不应
     再出现 `Why no WHISPER?: …`；hover 黄色 ⚠ 应弹自定义 tooltip。
  2. 浏览器 console 跑 `localStorage.setItem("utopia:devMode","1"); location.reload()`
     → Why no WHISPER 字段恢复显示。
  3. 模拟 LLM 不可达：DevTools Network 阻断 `*proxy*` 请求 → 左下 toast 应为
     `AI offline · using rules`，无 `(timeout)`/`(error: …)`；dev-mode 下恢复完整
     err message。
  4. 开 Heat Lens (L)，连续点几次直到地图上同区域出现 ≥3 个 "supply surplus"
     marker → 应当只看到一个 label 写作 "supply surplus ×3"，下方有 ▾ 三角。
  5. 浏览器拉到 800×600 → 出现 portrait splash 提示扩窗；放大到 1024×768 →
     autopilot chip wrap 到第二行不再截断；2560×1440 → topbar 字号 ≥14px 可读。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains
  跑 600s，DevIndex 不得低于当前基线（~44）的 95% = 41.8。本 plan 仅改 UI /
  渲染层，预期 DevIndex 不下滑。
- **测试套**：`node --test test/*.test.js` 必须 0 失败（当前 865 passing）。

## 7. UNREPRODUCIBLE 标记

不适用——所有现象都已通过：(a) `Grep` 在源码中定位到原始字符串
（HUDController.js:1052 "Why no WHISPER?:"、GameApp.js:1368 "AI proxy
unreachable"、autopilotStatus.js:76 "next policy in"），(b) PressureLens
DOM-label 路径在 `SceneRenderer.js:1762-1815` 没有任何 dedup 代码，
(c) 现有 `index.html` 中 `@media (min-width: 2200px)` 不存在、800px 仅做
flex-wrap 不做 portrait splash。三条根因均已代码定位，无需 Playwright 复现。
