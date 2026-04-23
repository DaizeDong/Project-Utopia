---
reviewer_id: 01c-ui
feedback_source: Round2/Feedbacks/01c-ui.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~240
  new_tests: 2
  wall_clock: 90
conflicts_with: []
# Stage A focus assigned by orchestrator:
#   P0-3 (death red toast + location highlight + cause)
#   P1-1 (objective bar layering / grouping)
#   P1-2 (text truncation fix — "Heat ens ON", "route repair and dep...")
#   P1-3 (1024×768 responsive)
# Freeze-safe: pure polish / fix / UX — no new mechanic.
---

## 1. 核心问题

归并 reviewer 的 12 条 findings + orchestrator 指派的 Stage A 焦点，根因收敛到 **2 条**：

1. **HUD 缺少"警报层级"** — 所有文本使用同一套"深蓝底白字、10–11 px、无色编码"的
   设计语言：死亡事件（P0-3）、目标清单（P1-1）、scenario headline / actionMessage
   （P1-2）全被挤进 `#statusBar` 的同一条 flex-row 里，彼此用 `max-width:240/420/520px`
   + `-webkit-line-clamp:2` 争抢剩余空间 → "Heat ens ON"、"route repair and dep..."、
   "DRIFT autopilot: colony holdin..." 在 1920×1080 也会被截断；死亡事件则沦为
   `#deathVal`/`#latestDeathVal` 里的灰白 11 px 小字，没有 toast、没有闪烁、没有位置
   反馈。→ 需要独立的"警报通道"（右侧 toast 堆叠 + 世界坐标 pulse）+ 目标栏
   结构化（chip list）而不是继续在一条 flex row 上加 CSS 补丁。

2. **响应式断点没对齐主要笔记本分辨率** — `index.html` 现有断点是
   1200 / 1024 / 900 / 640 / 600 px，但 1024×768 这台**主流学生机分辨率**恰好
   落在 "≤1200 && ≥601" 区间，触发的是 `floating-panel` translateX 抽屉动画，
   `#statusBar` 只换了 `flex-wrap: wrap` 但**没收窄 `.hud-scenario`/`.hud-objective`
   的 max-width、也没隐藏 `#statusScoreBreak` 的长字串**，结果资源 pill + 目标
   文本 + 叙事 headline 在 1024 宽下同时渲染 → "9 行换行" + "按钮文字 Heat Lens (L)
   再换行"。需要补一个 **1024–1200 区间的 mid-compact 样式**，而不是直接走 ≤600 的
   overlay 模式。

## 2. Suggestions（可行方向）

### 方向 A: 在现有 `#floatingToastLayer` / `#statusBar` 之上，最小增量加"警报 toast 堆叠" + "目标 chip list" + "mid-compact 断点"

- 思路：复用既有设施（`SceneRenderer.#spawnFloatingToast` 已能把世界坐标
  投影到屏幕坐标、`MortalitySystem` 已经把死亡写进 `state.gameplay.objectiveLog`
  带 `near (ix,iz)` 后缀），在 `HUDController.render()` 里检测 `deathsTotal`
  单调递增 → 经由 renderer 的 toast API 打红色 toast + 位置 pulse；同时把
  `#statusScoreboard` 从 "一条 flex row of text spans" 重构成 "chip list of
  progress items"（带 ✓ 勾 + 完成态 / 进行态配色）；最后给 `@media (min-width:1024px)
  and (max-width:1200px)` 补一段样式收窄 `.hud-scenario/max-width:260px` 和隐藏
  `#statusScoreBreak`。
- 涉及文件：`index.html`（`<style>` 块 + `#statusScoreboard` DOM）、
  `src/ui/hud/HUDController.js`（死亡 toast 钩子 + chip list 更新）、
  `src/render/SceneRenderer.js`（暴露一个 `spawnDeathToast(worldX,worldZ,text)`
  public 方法，内部调现有 `#spawnFloatingToast` 带新 kind="death"）。
- scope：**中**（~240 LOC，3-4 个文件）
- 预期收益：一次性解决 P0-3 + P1-1 + P1-2 + P1-3 四项 Stage A 指派；不引入
  新 DOM 层 / 新状态字段 / 新 mechanic。
- 主要风险：CSS 断点叠加可能影响 `hud-controller.test.js`；toast 堆叠若不限量
  会在高死亡率时段造成 DOM 膨胀。

### 方向 B: 引入全新"alert panel"独立 DOM 层 + 重写 `#statusBar` 为 CSS Grid

- 思路：新增 `#alertStack` 右上固定层 + `#objectiveGrid` 中央顶栏，抛弃现有 flex
  布局，用 3×N CSS Grid 重绘 HUD；死亡 / 饥荒 / 袭击都进 alert panel；objective
  全部改成卡片。
- 涉及文件：`index.html`（大规模 HTML+CSS 重写）、`HUDController.js`（全量重写
  render 管线）、`CHANGELOG.md`。
- scope：**大**（~800 LOC，HUD 架构层面改动）
- 预期收益：层级彻底清晰，未来扩展（袭击/瘟疫/火灾 alert）成本低。
- 主要风险：破坏 hud-controller / hud-latest-death-surface / hud-menu-phase /
  hud-resource-rate / hud-storyteller 5 个测试套件；与 feature freeze 的
  "polish only" 边界非常接近；耗时会超出单个 HW06 Round 的预算。

### 方向 C: 纯 CSS 补丁（只改 `.hud-scenario` max-width + 加一条红色 `.hud-action[data-kind="death"]` 规则）

- 思路：不写 JS，直接给 `#deathVal` / `#latestDeathVal` 加 `data-severity="critical"`
  CSS 着色 + 1024 断点收窄 max-width；不做 toast、不做位置 pulse。
- 涉及文件：`index.html` `<style>` 块。
- scope：**小**（~40 LOC，1 个文件）
- 预期收益：最低风险，一次性 fix 截断 + 红字死亡。
- 主要风险：**没兑现 P0-3**（orchestrator 明确要求 "红色 toast 堆叠 + 位置高亮
  + 死因链说明"，纯 CSS 做不到位置高亮和 toast 动画）；P1-1 "像 debug 日志"
  的结构性问题没解决。

## 3. 选定方案

选 **方向 A**。理由：

- **P0-3 orchestrator 明文要求 "红色 toast 堆叠 + 位置高亮 + 死因链说明"**，方向 C
  做不到位置高亮 / toast；方向 B 做得到但会把 HW06 单轮预算爆掉。
- 方向 A **复用既有设施**：`#floatingToastLayer` + `SceneRenderer.#spawnFloatingToast`
  已经能把 `(worldX, worldZ)` 投影到 CSS 像素，`MortalitySystem.recordDeath` 已经
  把带 `targetTile.ix/iz` 的死亡行写进 `state.gameplay.objectiveLog`，
  `HUDController` 里 `_lastDeathsSeen` 已经在跟踪死亡计数单调递增 → 所需数据全
  就位，只差"render 时触发 toast"这一根线。
- 方向 A 所有改动限定在 HUD 渲染 + CSS 层，**不改 mechanic、不改 ECS 系统、不动
  `BALANCE`/`SYSTEM_ORDER`** → 完全符合 HW06 feature-freeze 约束。
- 现有 5 个 hud-* 测试都只断言 DOM 写入 / text 内容，方向 A 只**追加**新写入点、
  不改既有 text → 破坏风险低。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:≈148-162` — edit — 在 `.heat-lens-legend` 规则之后新增
      CSS：`.hud-death-toast { position:absolute; pointer-events:none; font-weight:800;
      font-size:13px; color:#ff6b6b; text-shadow:0 1px 2px rgba(0,0,0,0.7);
      background:rgba(40,8,8,0.9); border:1px solid rgba(255,107,107,0.5);
      border-radius:6px; padding:4px 10px; }` + 一条 `@keyframes deathFlash` 动画
      （1.8 s pulse，先 scale 1.15 + opacity 1，再滑到 opacity 0）。

- [ ] **Step 2**: `index.html:≈900-991` — edit — 在 `#statusScoreboard` 下新增一个
      `<div id="alertStack" aria-live="assertive" style="position:absolute; top:44px;
      right:12px; display:flex; flex-direction:column; gap:4px; z-index:40;
      pointer-events:none; max-width:320px;"></div>`，用于死亡 toast 堆叠容器（
      与 `#floatingToastLayer` 分开：后者是世界坐标 pulse，前者是右上固定堆叠）。

- [ ] **Step 3**: `index.html:≈53-104` — edit — 把 `.hud-objective` 改成
      结构化 chip list 容器（`display:flex; flex-wrap:wrap; gap:4px;`，
      去掉 `-webkit-line-clamp:2` + `max-width:240px`），并新增
      `.hud-goal-chip` / `.hud-goal-chip--done` / `.hud-goal-chip--pending` 规则
      （完成态 `background:rgba(76,175,80,0.18)` + `✓` before 伪元素；进行态
      `background:rgba(255,193,7,0.12)`），为 Step 7 做铺垫。
      depends_on: Step 1

- [ ] **Step 4**: `index.html:≈163-170` + `≈91` — edit — 修 P1-2 截断：把
      `.hud-action { max-width:520px }` 改为 `max-width:min(520px, 40vw)` 并把
      `.hud-scenario { max-width:420px }` 改为 `max-width:min(420px, 32vw)`；
      同时在 `.hud-objective` 上去掉 `max-width:240px`（现在是 chip list）。
      避免 "Heat ens ON" / "route repair and dep..." 在中等宽度下被软截断。

- [ ] **Step 5**: `index.html:≈709-725` — edit — 补 1024–1200 mid-compact 断点：
      新增 `@media (min-width:1025px) and (max-width:1200px) { .hud-scenario { max-width:220px; }
      #statusScoreBreak { display:none; } #panelToggles .panel-toggle { padding:3px 6px; font-size:10px; } }`，
      同时把现有 `@media (max-width:1024px)` 块里的 `#statusScenario` / `#statusScoreBreak`
      加 `display:none`，并给 `#latestDeathVal` 的父 `#latestDeathRow` 加
      `flex-basis:100%`（在 1024 下强制独占一行避免 9 行换行）。

- [ ] **Step 6**: `src/render/SceneRenderer.js:≈2124 (#spawnFloatingToast)` — add —
      新增一个 **public** 方法 `spawnDeathToast(worldX, worldZ, name, reason, tileIx, tileIz)`
      (around line 2176 after the `#spawnFloatingToast` definition)，内部调用
      现有 `#spawnFloatingToast(worldX, worldZ, \`† ${name} (${reason})\`, "error", tileIx, tileIz)`
      + 额外触发 2 s 的 tile ring pulse (可用现有 highlight mesh，如无则在
      `this.toastLayer` 中 append 一个 class=`hud-death-toast` 的 div + `deathFlash` 动画)。
      depends_on: Step 1

- [ ] **Step 7**: `src/ui/hud/HUDController.js:≈385-451 (deathVal / latestDeathVal block)`
      — edit — 在既有 "deathsTotal > _lastDeathsSeen" 分支内（line 400）新增：
      (a) 把 `latestDead.x / latestDead.z` 转成 world coords（通过 `services.renderer`
      或 `window.__utopia.renderer`，保留 optional chaining），调
      `renderer.spawnDeathToast(worldX, worldZ, name, reason, tx, tz)`；
      (b) 往 `#alertStack` DOM (Step 2 新加的) append 一个 `<div class="hud-death-toast">`
      文案 `"† ${name} died — ${reason} at (${tx},${tz})"`，3.5 s 后 remove；
      (c) 给 `#deathVal` 加 `style.color = "#ff8a80"` + `setAttribute("data-severity","critical")`
      持续 OBITUARY_FLASH_MS，到期恢复。保持现有 `_obituaryText` / `_obituaryUntilMs`
      语义不变。
      depends_on: Step 2, Step 6

- [ ] **Step 8**: `src/ui/hud/HUDController.js:≈605-680 (statusObjective + statusScenario block)`
      — edit — 解决 P1-1：把 `this.statusScenario.textContent = ...` 改成
      "build chip list into `#statusScenario.innerHTML`"；每个 token（supply routes /
      depots / warehouses / farms / lumbers / walls）生成一个
      `<span class="hud-goal-chip hud-goal-chip--${done ? "done" : "pending"}">…</span>`，
      其中 `done = current >= target`。保留 dev-profile 的旧 terse 文本（测试依赖）
      → 仅在 `uiProfile === "casual"` 分支走 chip list；dev profile 继续走
      `getScenarioProgressCompact()`。
      depends_on: Step 3

- [ ] **Step 9**: `test/hud-death-alert.test.js` — **add** — 新增测试覆盖：
      (a) 模拟 `state.agents` 新增一个 `alive:false, deathReason:"starvation",
      displayName:"Ko-7", x:10, z:12, deathSec:42` 的 entity 并把 `deathsTotal`
      从 0 → 1，调 `hud.render()`，断言 `document.getElementById("alertStack")`
      有 1 个 `.hud-death-toast` 子节点且 textContent 含 `"Ko-7"` + `"starvation"`
      + `"(10,12)"`；(b) 第二次 render（`deathsTotal` 不变）断言 toast 数量不变。
      depends_on: Step 7

- [ ] **Step 10**: `test/hud-goal-chips.test.js` — **add** — 新增测试覆盖 Step 8：
      设 `state.controls.uiProfile = "casual"`，mock `getScenarioProgressCompactCasual`
      输入返回 3 routes / 5 walls 目标，调 `hud.render()`，断言
      `#statusScenario` 下有 N 个 `.hud-goal-chip` 节点；对于 `current >= target`
      的 chip 带 `.hud-goal-chip--done` class。dev profile 分支下仍然是 plain text
      （不破坏既有 hud-controller.test.js）。
      depends_on: Step 8

## 5. Risks

- **R1**: Step 7 的 toast DOM append 若每帧触发（60 fps）会瞬间堆爆 `#alertStack`。
  缓解：用 `_lastDeathsSeen` 门控（已在 HUDController 内） + `alertStack` 子节点
  上限 5，超出则删最旧。
- **R2**: Step 6 的 `renderer.spawnDeathToast` 在无头测试（jsdom）里 `this.camera`
  是 `null` → 当前 `#spawnFloatingToast` 会 early return，死亡只在 `#alertStack`
  出现不在世界坐标 pulse。可接受：无头测试只验证 alertStack 路径。
- **R3**: Step 5 的 mid-compact 断点可能和现有 `@media (max-width:1200px)` 
  floating-panel translateX 抽屉冲突（1024 宽会同时命中两个 media）。
  缓解：用 `min-width:1025px` 起点，1024 及以下走既有 `max-width:1024px` 块。
- **R4**: Step 8 改用 innerHTML 渲染 chip list 会产生 XSS 通道
  （若 scenario targets 里混入外部文本）。缓解：所有数字用 `String(Number(x))`
  强转，不插文字字段；chip label 用静态英文常量（"routes" / "warehouses"）。
- **R5**: 可能影响的现有测试：`test/hud-controller.test.js`（断言 `#statusScenario.textContent`）
  / `test/hud-latest-death-surface.test.js`（断言 `#latestDeathVal.textContent`）
  / `test/hud-storyteller.test.js`。方向 A 只在 casual profile 新路径生成 chip list，
  dev profile 分支（测试默认）保持 `textContent = getScenarioProgressCompact(state)`
  → 测试不破。

## 6. 验证方式

- **新增测试**：
  - `test/hud-death-alert.test.js` 覆盖 Step 9（toast 堆叠 + 不重复触发）
  - `test/hud-goal-chips.test.js` 覆盖 Step 10（chip list 完成/进行状态）
- **手动验证**：
  1. `npx vite` → `http://localhost:5173` → Start Colony（seed 42 / temperate_plains）；
     等 90 s → 第一个 `starvation` 死亡时应看到：右上红色 toast
     `"† <Name> died — starvation at (ix,iz)"`、世界坐标处一个红色 1.8 s pulse、
     `#deathVal` 文字短暂转 `#ff8a80`。
  2. Resize 浏览器到 1024×768 → `#statusScoreBreak` 隐藏、`#latestDeathVal` 独占一行、
     目标文字不换行 9 行、`Heat Lens (L)` 按钮文字不换行。
  3. 按 `L` 切换 Heat Lens → `statusAction` 文本完整显示
     `"Heat lens ON — red = surplus, blue = starved."`（不截断为 "Heat ens ON"）。
  4. 切到 scenario=archipelago_isles → scenario headline 在 1920×1080 完整显示
     （不截断为 "route repair and dep..."）。
- **单元测试回归**：`node --test test/hud-*.test.js` 全绿（方向 A 新增 2 个、
  既有 5 个不破）。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains`
  DevIndex ≥ 39（当前 v0.8.1 基线 44，容忍 -5 即 ≥ 39）；本方案纯 UI，不改模拟
  逻辑，预期指标不变。

## 7. UNREPRODUCIBLE 标记

不适用：feedback 中的截断问题（"Heat ens ON"、"route repair and dep..."）可在
`index.html` CSS 第 91/99/165 行 `max-width:240/420/520px` + `-webkit-line-clamp:2`
直接验证成因；死亡无反馈问题可在 `HUDController.render()` 第 385-451 行确认 —
当前只写 `#deathVal.textContent` / `#latestDeathVal.textContent`，没有任何 toast /
位置 pulse / 颜色升级代码路径，属于**设计缺失**而非时序 bug，无需 Playwright 复现。
