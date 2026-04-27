---
reviewer_id: 01a-onboarding
feedback_source: Round6/Feedbacks/01a-onboarding.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P0
estimated_scope:
  files_touched: 7
  loc_delta: ~360
  new_tests: 3
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 01a-onboarding 给了 3/10，把 9 条 findings 里的"症状"展开成长篇控诉。
归并后真正的根本问题只有两条：

1. **First-60s 信任崩塌（P0）** —— 标题屏幕上有"未完成 demo"级残渣：地图上飘的
   `halo` × 4 调试 label、"WHISPER / LLM never reached / AI proxy unreachable"
   错误条、`hp=100.0 / hunger=0.639 / world=(1.10, 2.37)` 之类的开发者
   telemetry，加上"按 0 选 kitchen 但 Help 写 0 reset camera"的 hotkey-help
   说谎。这些**不是教学缺失**，是已经写进游戏的副文本，玩家 30 秒内就能数出来。
   修复成本小（去 label / 改 help text / hide LLM toast / `Home` → 0），
   收益巨大（直接把"看起来像 sandbox"的第一印象消掉一半）。

2. **教学序列与目标系统缺位（P1）** —— 没有 step-by-step tutorial、没有任务进度、
   失败画面之外没有"安全失败 → 重启"循环、briefing 与 dropdown 之间存在
   `formatTemplatePressure` 实际是同步的（reviewer 看到 stale 文本是因为
   menu 显示时游戏没暂停模拟带来的 race）。这条工作量较大，本轮不全做，
   但先把 **menu phase 真的暂停渲染（or 至少屏蔽鼠标 input）** 和 **briefing
   change-event 立即重渲染**做掉，让 P1 的 follow-up 有一个干净的起点。

> 注：reviewer 关于 "Start Colony 不工作 / Build tab 跳 about:blank / 切 template
> 立刻覆盖存档" 的崩溃级断言**经代码读证 UNREPRODUCIBLE**：`overlayStartBtn` 的
> click handler 调用 `handlers.onStart` (`GameApp.startSession`)；
> `.sidebar-tab-btn` 没有 `<a href>` 也没有 `window.location` 操作；template
> dropdown 的 `change` 只触发 `#renderMenuCopy`，不会重置 world。这些写进 §7。

## 2. Suggestions（可行方向）

### 方向 A: First-60s 信任清理 + Help-Hotkey 同步（小 scope，P0）

- 思路：把 reviewer 列出的 8 条"游戏看起来像 demo"的具体 UI 残留全部消除。
  做最小、最确定能让 5 分钟玩家"愿意继续点下去"的改动。
- 涉及文件：
  - `src/render/PressureLens.js`（halo label 改成空串，让标签 pool 跳过空文本）
  - `src/render/SceneRenderer.js`（label `display:none` when text === ""）
  - `src/app/GameApp.js`（LLM 错误 `actionKind: "error"` → `"info"` 且不复述
    `error.message`）
  - `src/app/shortcutResolver.js`（追加 `Digit0` 在非 build 上下文 / Escape
    后触发 `resetCamera`，并修 Help 文案）
  - `index.html`（Help dialog `data-help-tab="controls"` 段："0 resets camera"
    改为 "Home resets camera"；并改 default open tab 为 `chain`；改建造按钮
    title 渲染时机以保证 hover 立刻可见——已是 native title，需要做的是验证
    一遍 z-index，不过这一项放到方向 B）
  - `src/ui/panels/EntityFocusPanel.js`（`Vitals` 行 hp/hunger 改为人话；保留
    `dev-only` 数字版）
- scope：小（<200 LOC，全是字符串 / 单分支）
- 预期收益：第一印象从 3/10 直接拉到 5/10。每一条都是 reviewer 文章里点名的
  具体噪音。
- 主要风险：动 `EntityFocusPanel` 的 Vitals 行可能让既有的 `entity-focus-panel`
  测试断言失败（断言里写过 `hp=100.0`）；需要更新测试。

### 方向 B: 加 step-by-step Tutorial Mode（大 scope，P1，本轮不推）

- 思路：复刻 ONI Tutorial Asteroid 风格——开局 7 步强制 pause-and-highlight
  序列，引导玩家点出 farm → lumber → warehouse → road → kitchen。
- 涉及文件：新增 `src/ui/tutorial/TutorialController.js`（~250 LOC）+ `index.html`
  spotlight 蒙版 + `src/app/GameApp.js` 嵌入 step 监听 + 6 段 copywriting。
- scope：大（500+ LOC，需要 spotlight / 强制 pause / step state machine /
  跳过按钮 / 自动检测前置条件）。
- 预期收益：直接对应 reviewer P1 第 1 条；能把 3/10 拉到 7/10。
- 主要风险：(1) tutorial 期间硬暂停模拟会撞到 `runLocked` / autopilot 状态机，
  改 `update()` 容易回归；(2) spotlight + 玩家主控会和 sidebar tab、template
  dropdown 互相打架；(3) 一轮 90 min 写不完且测不充分，可能让 1293 tests
  挂掉一批。本轮不上。

### 方向 C: 任务进度侧栏 + 失败诊断文案（中 scope，P1，本轮不推）

- 思路：把 scenario 的 "Reconnect the west lumber line / Reclaim the east depot"
  拆成可勾选 sub-task。+ 失败画面增加 "Food chain broke at Day X" 因果归因。
- 涉及文件：新增 `src/ui/panels/ObjectivePanel.js`、改
  `src/world/scenarios/ScenarioFactory.js`、改 `GameStateOverlay.js` end 卡。
- scope：中（300-400 LOC）。
- 预期收益：解决 P1 第 2 + 第 5 条。
- 主要风险：scenario.routeLinks/depotZones 的 progress 字段当前没有连续追踪
  channel，要新加 telemetry。也不是本轮 budget。

## 3. 选定方案

选 **方向 A（First-60s 信任清理 + Help-Hotkey 同步）**。

理由：
- reviewer 给 3/10 的扣分集中在 **可见噪音**（halo / LLM 错误 / hp=100.0 /
  Help 撒谎）而不是缺乏深度教学。把噪音消掉是最高 ROI 的一刀。
- 每一条 fix 都精确到 file:line，可以在 90 min wall-clock 完成，且不会触碰
  benchmark / scripts / package.json / vite.config 的 freeze 约束。
- 4-seed benchmark 风险接近 0：halo label 是 UI-only，不影响 sim；
  EntityFocusPanel 是 render-only；Help text 改纯字符串；hotkey 0 在 menu
  phase 已经被 swallowed，新增 Home/0 双绑也只在 active phase 起效。
- 方向 B/C 留给后续 round 推进——本轮先把"看起来像 demo"的盖子拿掉，下一轮
  再搭"教学 + 任务"的内核。

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/PressureLens.js:409` — `edit` —
  把 `label: "halo",` 改成 `label: "",`。同时在 `pushUniqueMarker` 调用上面
  加注释说明 halo 不再显示文字（光圈仍然渲染，仍然是 heat lens 的视觉补强）。

- [ ] **Step 2**: `src/render/SceneRenderer.js:1809-1814` — `edit` —
  在写 `el.textContent` 前后加分支：当 `marker.label` 为空字符串时
  `el.style.display = "none"`，然后 `continue`。保证 halo 即使没文字也不留
  空 div 残影。
  - depends_on: Step 1

- [ ] **Step 3**: `src/app/GameApp.js:1368` — `edit` —
  `AI proxy unreachable (${err.message}). Running fallback mode.` 改为
  `actionMessage: "Story AI is offline — fallback director is steering. (Game still works.)"`
  且 `actionKind` 从 `"error"` 改为 `"info"`。同步在 1353 行那条 `"AI proxy
  has no API key. Running fallback mode."` 也改为同语调（`Story AI offline —
  fallback director is steering.`）。原始 err.message 保留写到
  `console.warn` / `pushWarning(state, ..., "ai-health")` 不外抛 UI。

- [ ] **Step 4**: `src/app/shortcutResolver.js:1-14` — `edit` —
  在 `TOOL_SHORTCUTS` 之外新增 `function isBuildToolActive(context)` 由
  caller 传入；当 `context.tool === "select"` 或 `context.tool == null` 时，
  `Digit0` 仍 fallback 成 `{ type: "resetCamera" }`。换言之：玩家没主动选过
  建造工具时，0 按键依然语义为"reset camera"。如果不想改 context，最简洁的
  做法是让 `Home` 是规范键（已经是），但**新增 KeyR**（"R = reset camera"）
  作为玩家更熟悉的键，并在 SHORTCUT_HINT 里添加 `R reset camera`，同时把
  Help dialog 里的 "0 resets camera" 改成 "R or Home resets camera"。
  - 注意：动 Digit0 的语义需要改 `test/shortcut-resolver.test.js`；为了避免
    破坏既有测试，**首选第二条路径（新增 KeyR + 改 Help text，保留 Digit0
    = kitchen）**。

- [ ] **Step 5**: `index.html:2360` — `edit` —
  把 `<code>0</code> resets camera.` 改为 `<code>R</code> or <code>Home</code> resets camera (number keys 1-0/-/= are build tools).`，
  同步把 `data-help-tab` 的默认 `active` 从 `controls` 切到 `chain`
  (line 2348-2349 + 2355-2374，把第二个 `<section class="help-page active">`
  改在 `data-help-page="chain"` 上，老的 controls section 去掉 `active` 类)。
  - depends_on: Step 4

- [ ] **Step 6**: `src/ui/panels/EntityFocusPanel.js:538` — `edit` —
  把
  ```
  <b>Vitals:</b> hp=${fmtNum(hp,1)}/${fmtNum(maxHp,1)} | hunger=${fmtNum(entity.hunger,3)} | alive=${...}
  ```
  改为人话版（dual track，casual + dev）：
  ```
  <div class="small"><b>Health:</b> ${healthLabel} (${hpPct}%)${alive ? "" : " — deceased"}</div>
  <div class="small casual-hidden dev-only"><b>Vitals (dev):</b> hp=… hunger=… alive=…</div>
  ```
  其中 `healthLabel` = `Healthy` / `Wounded` / `Critical` / `Deceased`，
  `hpPct = Math.round(hp / maxHp * 100)`。把 538 那行的原始 `Vitals` 标签同步
  挂上 `casual-hidden dev-only` 类。
  - depends_on: 无

- [ ] **Step 7**: `src/ui/panels/EntityFocusPanel.js:532` — `edit` —
  把
  ```
  <b>Position:</b> world=${vecFmt(entity.x, entity.z)} tile=(${posTile.ix}, ${posTile.iz})
  ```
  整行加 `class="casual-hidden dev-only"`。Casual profile 玩家不需要看
  `world=(1.10, 2.37)`。
  - depends_on: 无

- [ ] **Step 8**: `src/render/PressureLens.js:168, 183, 322, 340, 362, 385` —
  `edit` —
  逐条审查 primary marker 的 label 字符串：`"traffic hotspot"` / `"wildlife
  pressure"` / `"supply surplus"` / `"input starved"` / `"warehouse idle"` /
  `"stone input empty"` 这些**保留**（reviewer 接受这种语义化标签）。
  仅 `"halo"`（Step 1 已处理）需要消掉。这一步是文档式审查，code 改动可能为
  零；如果发现还有 `"halo:..."` 形态的 ID-only marker 没 label 也会被
  SceneRenderer 渲染成空 div，Step 2 已经堵住。

- [ ] **Step 9**: `test/entity-focus-panel.test.js` 与 `test/pressure-lens.test.js` —
  `edit` —
  更新断言：
  - `entity-focus-panel`：原本 assert `Vitals: hp=` 的测试改为 assert
    `Health: ` 出现且 `hp=` 隐藏在 `.dev-only` span。
  - `pressure-lens`：halo marker 的 label 现在是 `""`，断言改 `marker.label === ""`。
  - depends_on: Step 1, Step 6

- [ ] **Step 10**: `test/onboarding-noise-reduction.test.js` — `add` —
  新增一个集成测试，覆盖三条核心承诺：
  1. `formatTemplatePressure` + `formatTemplatePriority`（GameStateOverlay）
     在 menu phase 切 templateId 时立即返回不同字符串（reviewer 误以为
     briefing 不刷新——其实是 race，但加测试锁定语义）。
  2. PressureLens 输出的 markers 中 `kind` 含 `heat_*` 但 `label === ""` 的项
     不再出现非空字符串（防回归）。
  3. AI proxy unreachable / no-api-key 路径产生的 `actionMessage` 不再包含
     `"WHISPER"` `"LLM"` `"proxy"` 这三个开发者术语。
  - depends_on: Step 1, Step 3

## 5. Risks

- **Risk 1 — entity-focus-panel 测试回归**：现行 test 大概率断言 `Vitals: hp=`
  字面文本。Step 9 会更新，但如果 Step 6 重写后 selector 路径也变了，可能要
  再跑一遍 test/entity-focus-panel*.test.js 全套。已在 Step 9 兜底。
- **Risk 2 — PressureLens 数量变化**：halo label 改空串可能导致一些 pressure
  lens 测试断言 `marker.label.length > 0`。Step 9 已涉及，但需要全文 grep
  `pressure-lens` 测试，确保没有其他文件也断言 label 内容。
- **Risk 3 — Help dialog default tab 切换**：如果有 `e2e` / Playwright 测试假定
  打开 Help 第一个看到 "Controls"，会失败。检查 `test/help-modal*.test.js` 和
  `test/getting-started*.test.js` 即可。本仓 `test/` 目录下未发现 help-modal
  专项测试，风险低。
- **Risk 4 — LLM 错误隐藏 vs. dev mode**：把"AI proxy unreachable"打到
  `console.warn` 而不是 UI 后，dev 模式下需要保证 DeveloperPanel 仍然能看到
  proxyHealth=down 的状态。当前 `state.metrics.proxyHealth` 已经写入，无需额外
  改动；但 manual QA 时要确认 dev dock proxy badge 仍显示红色。
- **Risk 5 — 4-seed benchmark**：halo / Help / Vitals / errorMessage 全是
  UI-only 改动，不进 sim，预期 DevIndex / deaths 完全不变。**唯一 risk
  vector** 是 Step 4 如果误改了 `Digit0` 的 active-phase 行为，会让 benchmark
  脚本里如果有"按 0 选 kitchen"的 keyboard probe 失效——已查 `scripts/`，
  没有键盘 driver。安全。
- 可能影响的现有测试：`test/entity-focus-panel*.test.js`、
  `test/pressure-lens*.test.js`、`test/heat-lens*.test.js`、
  `test/storyteller-strip*.test.js`（仅当 storytellerStrip 也读
  `actionMessage`，需检查）。

## 6. 验证方式

- **新增测试**：`test/onboarding-noise-reduction.test.js`（见 Step 10），
  覆盖：(a) briefing 同步、(b) halo label 空串、(c) AI 错误文案不含
  `WHISPER/LLM/proxy`。
- **手动验证**：
  1. `npx vite` → `http://localhost:5173/` → 不点任何按钮观察 30 s。
     **期望**：地图上不再出现 `halo` 文字；title 上方不出现 `west lumber
     route` × 4（这个是 menu 时 PressureLens 不应跑——已经被 `runLocked` 关
     了，但 SceneRenderer 还在 render 现有 marker pool，要看一眼是否需要
     额外清空）。
  2. 在 menu 切 template dropdown → Plains → Highlands → Riverlands。
     **期望**：briefing 4 行（pressure / priority / lens / size hint）每次切
     template 立即变化。
  3. 进入游戏后按 `R` → **期望** action message 显示 "Camera reset to
     default framing." 按 `0` → **期望** 选中 kitchen 工具（保持原行为）。
  4. 点击任一 worker → 看 EntityFocusPanel。**期望**：第一行写 "Health:
     Healthy (100%)" 而不是 "Vitals: hp=100.0/100.0 | hunger=0.639"。
     展开 "Why is this worker doing this?" 仍能看到 Top Intents/Top Targets。
  5. 启动 dev server 时 AI proxy 一定 down（本地无 key）。**期望**：HUD 底部
     status 不再是红色 "AI proxy unreachable (timeout)"；改成中性灰色
     "Story AI is offline — fallback director is steering."
- **benchmark 回归**：
  ```
  node scripts/long-horizon-bench.mjs --seeds 42,7,9001,123 --template temperate_plains
  ```
  4-seed 中位 DevIndex ≥ 42、min ≥ 32、deaths ≤ 499、4/4 max_days_reached。
  本 plan 全部为 UI-only 改动，预期与 baseline 无差。

## 7. UNREPRODUCIBLE 标记

以下 reviewer 断言**经代码静态阅读判定 UNREPRODUCIBLE**，本 plan 不为它们
分配修复步骤，但留档以供 orchestrator 仲裁：

1. **"Start Colony 按钮无效，需要刷新页面"** —— `index.html:1738`
   `overlayStartBtn` 在 `GameStateOverlay.js:144-147` 注册 click handler 调
   `handlers.onStart()`。`GameApp.js` 注入的 `onStart` 走
   `startSession() → #setRunPhase("active") → resetSessionWorld({autoStart:true})`，
   逻辑闭环，没有任何会跳 about:blank 的代码路径。怀疑是 reviewer 自己
   double-click 引起的二次触发或浏览器扩展问题；本轮不修。

2. **"Build sidebar tab 引发 about:blank"** —— `index.html:2286-2290`
   sidebar-tab-btn 是普通 `<button>`，handler 在 2619-2635 仅调用
   `setSidebarOpen` / `showSidebarPanel`，**没有任何 navigation 代码**，
   也没有 `<a href>`。无法从代码侧复现。

3. **"切换 Template dropdown 立刻无确认地启动新 run"** ——
   `GameStateOverlay.js:175` 的 `change` listener 只调
   `#syncMenuSelectionFromInputs() + #renderMenuCopy()`，**不调用
   `handlers.onReset` / `handlers.onStart`**。reviewer 看到的应是 menu
   背景下 sim 仍在 idle render，并非真的 reset。本 plan Step 2/Step 1
   清空 halo + Step 3 隐藏 LLM toast 后，"看起来在跑"的视觉欺骗会大幅
   下降，间接缓解此误解。

4. **"build 按钮 hover 没有 tooltip"** —— `index.html:1798-1809` 每个
   button 都有 `title="..."`，浏览器原生 tooltip 一定会显示。reviewer
   可能用 Playwright snapshot 没等浏览器原生 hover 渲染就截图了。本轮
   不为此投开发资源；如果后续 reviewer 仍坚持，再做 custom HTML
   tooltip（属于方向 B 范畴）。
