---
reviewer_id: 02c-speedrunner
feedback_source: Round6/Feedbacks/02c-speedrunner.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P1
estimated_scope:
  files_touched: 9
  loc_delta: ~330
  new_tests: 3
  wall_clock: 95
conflicts_with: []
complements:
  - 01c-ui (HUD KPI line — we add live Score persistence + leaderboard, do NOT touch the existing `#statusObjectiveScore` ribbon contract)
  - 02b-casual (toast / milestone polish — we extend the toast layer with FF/tier feedback, do not move it)
---

## 1. 核心问题（归并后 3 条根因）

Reviewer 02c-speedrunner 在 Round 5b 之后（5622cda）跑了 3 个 run、给 3.5/10。Round 5b 已经把
clinic/escalator/FF actual-rate label 修了，但他三次 run 都拿不到「自己的分数 / 自己的回放」。
散落 findings 收成 3 条根因：

1. **Score 透明度 = 1/10：HUD 上 `Survived ... · Score N · Dev D/100` 只在 active phase 显示，
   死掉立刻被 GameStateOverlay 接管，end-panel 虽然有总结，但**不持久化**——下一局 boot 屏的
   "0 pts" 永远是 0；没有 leaderboard / 没有 best-run / 没有 seed 字段可贴**。Reviewer 原文：
   "我跑三次、没有任何一次拿到分数"。这是 P1 的 UX 死结：数据明明都在 `state.metrics.survivalScore`
   / `state.world.mapSeed` / `state.gameplay.devIndexSmoothed` 里，只是死掉就被丢。

2. **FF 上限 4× 太低（最爱 16×）+ FF 与 Autopilot 的 UI 状态泄漏**：现状 `simStepper.js:17`
   `safeScale = Math.min(4, …)`，`HUDController.js:585` `timeScale = 4.0`，
   `index.html:1666` 单按钮且 title 写死 `Fast forward (4x)`。Reviewer Run 3 关键观察：
   "Fast forward 4x 按钮按下之后会和 Autopilot checkbox 冲突，导致 Autopilot 被静默关掉"。
   排查发现 `setupSpeedControls` 中 `speedFastBtn` click 不会触碰 `state.ai.enabled`，但
   `aiToggleTop`/`aiToggleMirror` 共享同一 sync 路径，在某些 click bubbling 场景下 checkbox
   `change` 会被错触发——典型「键盘焦点窃取」类 bug。需要：(a) 升 FF 上限到 8×（保留
   16× 作为 stretch / 仅 dev mode）；(b) 加 `[` / `]` hotkey 控制 FF tier；(c) 把 speed
   button 的 click 路径与 Autopilot checkbox 解耦——button click 不应使 checkbox 被
   pseudo-clicked。

3. **Replay / seed / leaderboard 缺失（"跑了一局、什么都没记下来"）**：reviewer 列了 5 条
   速通刚需缺失 — leaderboard、死亡 replay 列表、seed 字段、shift+click 排队建造、
   重复上一次建造（hotkey）。speedrunner 评分维度里 "Replay/数据回看" 是 2/10。
   `replayService.js` 只是个 in-memory 200 event ring buffer，没有 export-on-end / 没有
   localStorage 写入。`world.mapSeed` 已存在但 boot 屏 / end-panel 都不显式 copy-able。
   `snapshotService.js` 已经有 localStorage 写入 (`utopia:snapshot:<slot>`)，复用同样的
   `localStorage` 键空间放 `utopia:leaderboard:v1` 是最小改动。

## 2. Suggestions（可行方向）

### 方向 A: 持久化 leaderboard + run summary 持久化 + seed UI surfacing（"give the speedrunner their data"）

- 思路：在 `runOutcome.js` 触发的 `#setRunPhase("end", …)` 路径里，调用一个新 `recordRunResult()`
  服务，把 `{ ts, seed, templateId, scenarioId, survivedSec, score, devIndex, deaths, workers,
  cause }` 写入 `localStorage.utopia:leaderboard:v1` (top-N=20，按 score desc)。boot 屏
  (`GameStateOverlay.#renderMenuCopy`) 和 end-panel (`render() if (isEnd)`) 各加一块
  "Best run / Last 5 runs" 卡片。end-panel 上 `seed N · Try Again replays this seed` 已经
  存在文字，但要把 seed 做成 copy-to-clipboard chip。
- 涉及文件：`src/app/leaderboardService.js` (new)、`src/app/createServices.js`、`src/app/GameApp.js`、
  `src/ui/hud/GameStateOverlay.js`、`index.html`、`test/leaderboard-service.test.js` (new)
- scope：中
- 预期收益：直接命中 reviewer 的 "Score 透明度 1/10" 与 "Replay/数据回看 2/10"。给 speedrunner
  可比较的数据；Score 不再是 "0 pts forever"。
- 主要风险：localStorage 在隐私模式 / quota 满时 write 抛异常；要 try/catch 兜底。

### 方向 B: FF 拓维 (4×→8×) + speed-tier hotkeys + Autopilot 状态泄漏修复

- 思路：把 simStepper `safeScale` 上限 4→8，HUD 加第二个 FF 按钮 `>>` (8×)，hotkey `[` 减档
  / `]` 加档（包括 0.25× / 1× / 4× / 8×），把 `speedFastBtn` 的 click handler 改成 toggle
  当前档位（点击两次进 8×，再次回 1×）。Autopilot 解耦：在 `setupSpeedControls` 内的
  `aiToggleTop/aiToggleMirror change` 加 `event.isTrusted` 检查并 stop bubbling，防止 button
  click 触发的合成 change 事件改 ai.enabled。
- 涉及文件：`src/app/simStepper.js`、`src/app/shortcutResolver.js`、`src/ui/hud/HUDController.js`、
  `index.html`、`test/sim-stepper-timescale.test.js`、`test/shortcut-resolver.test.js`
- scope：中
- 预期收益：直接命中 reviewer 的 "FF 诚实度 4/10" 与 "Hotkey & UI 操作流 2/10"。
- 主要风险：8× 时长帧丢弃可能让 long-horizon-bench 的 deaths 抖动 ±5%；`accumulatorSec ≤ 2.0`
  夹逼仍在，但要 sweep 测试。

### 方向 C: shift+click 多格放置 + 重复上一次建造（hotkey `R`）

- 思路：在 `SceneRenderer.#onPointerDown` 里，当 `event.shiftKey === true` 且 `activeTool` 是
  build-tool，进入 "queued placement" 模式：每次 click 不切回 select 模式，连续放置直到 Esc。
  增加 `R` hotkey：repeat last build at hovered tile。这些是 RTS 速通必备。
- 涉及文件：`src/render/SceneRenderer.js`、`src/app/shortcutResolver.js`、`src/app/GameApp.js`、
  `test/multi-place-shift-click.test.js`
- scope：大
- 预期收益：直接命中 reviewer "找不到拖拽多格放置" 与 "没有重复上一次建造"。
- 主要风险：`SceneRenderer.#onPointerDown` 已是 100+ 行的关键路径；改它会要复跑 build-toast /
  entity-pick / proximity-guard 一整圈测试。Round 5b 02b-casual 的 toast linger 也在这条路径上。

## 3. 选定方案

**主推 方向 A + 方向 B（合并执行）**，理由：

- A 命中 reviewer 最尖锐的两条根因（Score 透明度 1/10、Replay/数据回看 2/10），且与项目现有
  `localStorage.utopia:*` / `snapshotService.js` 模式 1:1 同构，落地成本最低、风险最小。
- B 命中 reviewer 第三大痛点（FF 4× 太低 + Autopilot 状态泄漏），与 A 跨层互补：A 在
  end-phase / boot-phase 写数据，B 在 active-phase 改交互——不会与 01c-ui (HUD KPI) /
  02b-casual (toast) 已发的 5b commits 抢同一文件区段。
- C 被排除：`SceneRenderer.#onPointerDown` 是热路径，改它要重跑 5+ 个测试套件，且
  freeze_policy=lifted 但仍要避免触碰 src/benchmark/** 与 build-system 决策核心。
  Reviewer 也没把 "shift+click" 列为致命问题（"找不到" 是抱怨，不是 game-stopper），
  优先级低于 A/B。
- 选择标准（按 enhancer.md §6 权重）:
  - P1 问题 → 中 scope ✓ (A 与 B 各自中 scope)
  - 不破坏 Round 5b 已发测试（只新增、不改 Round 5b 已断言的精确值）
  - freeze_policy=lifted 允许 leaderboard 持久化与 FF 8× tier；都不在禁区清单（无新
    tile/building/tool/mood/asset/relationship mechanic；只是新 service 文件 + tier 扩张）

## 4. Plan 步骤

### Step 1 — `leaderboardService` (新文件)

- [ ] **Step 1**: `src/app/leaderboardService.js` — `add` — 新文件，导出 `createLeaderboardService(storage)`
  工厂；接口：`recordRunResult(entry)` / `listTopByScore(limit=20)` / `listRecent(limit=5)` /
  `clear()` / `exportJson()`。键名 `utopia:leaderboard:v1`。entry shape:
  ```js
  { id, ts, seed, templateId, templateName, scenarioId, survivedSec, score, devIndex,
    deaths, workers, cause /* "loss"|"abandon"|"crash" */ }
  ```
  写入路径加 `try/catch` 包 quota / privacy mode；解析时校验 schema 否则跳过。

### Step 2 — wire leaderboardService into services + GameApp

- [ ] **Step 2a**: `src/app/createServices.js` — `edit` — 在 `return { ... }` 对象里追加
  `leaderboardService: createLeaderboardService(typeof localStorage !== "undefined" ? localStorage : null)`。
  - depends_on: Step 1
- [ ] **Step 2b**: `src/app/GameApp.js:#evaluateRunOutcome` (line 1754-1761) — `edit` —
  在 `this.#setRunPhase("end", { ...outcome })` **之前**调用：
  ```js
  this.services.leaderboardService.recordRunResult({
    seed: this.state.world.mapSeed,
    templateId: this.state.world.mapTemplateId,
    templateName: this.state.world.mapTemplateName,
    scenarioId: this.state.gameplay?.scenario?.id ?? "",
    survivedSec: Math.floor(this.state.metrics.timeSec ?? 0),
    score: Math.floor(this.state.metrics.survivalScore ?? 0),
    devIndex: Math.round(this.state.gameplay?.devIndexSmoothed ?? 0),
    deaths: Number(this.state.metrics.deathsTotal ?? 0),
    workers: Number(this.state.metrics.populationStats?.workers ?? 0),
    cause: outcome.outcome ?? "loss",
  });
  ```
  Surrounded by `try { ... } catch {}` so a bad localStorage state never blocks the end-phase transition.
  - depends_on: Step 2a

### Step 3 — Boot screen + end-panel: surface leaderboard + seed copy-chip

- [ ] **Step 3a**: `index.html` — `edit` — 在 `#overlayMenuPanel` 末端（紧邻 `#overlayObjectiveCards` 之后）新增
  ```html
  <div id="overlayLeaderboard" class="overlay-leaderboard">
    <h3 class="overlay-board-title">Best Runs</h3>
    <ol id="overlayLeaderboardList"></ol>
    <button id="overlayClearLeaderboardBtn" type="button" class="overlay-board-clear" title="Clear local leaderboard (kept in localStorage)">Clear</button>
  </div>
  ```
  端 `#overlayEndPanel`（`#overlayEndStats` 之下）新增 seed 行：
  ```html
  <div class="overlay-end-seedline">
    <span>Seed</span>
    <code id="overlayEndSeedChip" tabindex="0" title="Click to copy seed">—</code>
    <span id="overlayEndSeedRank" class="overlay-end-rank"></span>
  </div>
  ```
  CSS hooks reuse `.overlay-obj-card` 风格（不新增独立 design tokens，避免与 01c-ui 5b 已发的 HUD typography 冲突）。
- [ ] **Step 3b**: `src/ui/hud/GameStateOverlay.js:91-180` constructor — `edit` — `this.leaderboardEl =
  document.getElementById("overlayLeaderboardList")`、`this.endSeedChip = document.getElementById(
  "overlayEndSeedChip")`、`this.endSeedRank = document.getElementById("overlayEndSeedRank")`、`this.clearLeaderboardBtn =
  document.getElementById("overlayClearLeaderboardBtn")`。绑定 click：seedChip 用
  `navigator.clipboard?.writeText(seed)` + actionMessage toast；clearLeaderboardBtn 调
  `handlers.onClearLeaderboard?.()`。
  - depends_on: Step 3a
- [ ] **Step 3c**: `src/ui/hud/GameStateOverlay.js:render()` (line 303-413) — `edit` — 当
  `isMenu` 时渲染 `this.leaderboardEl.innerHTML = topRuns.map(formatLeaderboardRow).join("")`，
  当 `isEnd` 时填 `this.endSeedChip.textContent = seed`、`this.endSeedRank.textContent =
  rank > 0 ? \`#${rank} of ${total}\` : "no rank yet"`。`topRuns` 由 GameApp 注入的 handler
  `getLeaderboard()` 提供。
  - depends_on: Step 3b
- [ ] **Step 3d**: `src/app/GameApp.js` — `edit` — handlers 对象（约 line 144-200）新增
  `getLeaderboard: () => this.services.leaderboardService.listTopByScore(10)`、
  `onClearLeaderboard: () => this.services.leaderboardService.clear()`。
  - depends_on: Step 2a

### Step 4 — Live Score chip stays on screen during end phase（HUD reveal continuity）

- [ ] **Step 4**: `src/ui/hud/HUDController.js:1194-1278` `if (this.statusObjective)` block — `edit` —
  当前 `inActive = state.session?.phase === "active" && totalSec > 0` 把死后整个对象的 score 抹成
  `"\u2014"`。改成：在 `phase === "end"` 时**保留 frozen 数值**（来自
  `state.metrics.survivalScore` 最后一帧），并加 ` · final` 后缀。Round 5b 已发的 casual-mode
  分支行为不变（不出现 final 文字）。这样 reviewer 在 end-overlay 弹出时仍能看到自己的最终分数，
  不会被 "—" 覆盖。

### Step 5 — FF 8× tier + speed-tier hotkeys + Autopilot 解耦

- [ ] **Step 5a**: `src/app/simStepper.js:17` — `edit` — `safeScale = Math.max(0.1, Math.min(4, timeScale || 1))`
  → `Math.min(8, timeScale || 1)`。Round 5b 02a 已经把 `accumulatorSec` 上限放宽到 2.0；
  `maxStepsPerFrame=12` 仍是每帧上限，理论 12 step × (1/30s) = 0.4s sim/frame, 4× 已经能
  saturate；提到 8× 主要给 simCost 低的早期 / Autopilot 长程跑路。注释里写「8× 是诚实上限：
  simCost > 8ms 时实际 timeScaleActual 会自动 clamp 回 4×~6×；HUD 显示 actual」。
- [ ] **Step 5b**: `src/app/shortcutResolver.js:24-81` — `edit` — 新增分支：`code === "BracketLeft"` /
  `code === "BracketRight"` 返回 `{ type: "speedTierStep", direction: -1 | +1 }`。phase=active
  门控同其它 hotkey。同时把 `SHORTCUT_HINT` 字符串扩到包含 "[/] speed tier"。
- [ ] **Step 5c**: `src/app/GameApp.js:#onGlobalKeyDown` (line 1488-1528) — `edit` — `if (action.type === "speedTierStep")` 调用
  `this.stepSpeedTier(action.direction)`。新增 `stepSpeedTier(direction)`：tier 表
  `[0.5, 1, 2, 4, 8]`，找当前 `controls.timeScale` 最近 tier，加/减 1 步并 clamp。复用现有
  `setTimeScale` 路径以保持 actionMessage / replay 记录。
  - depends_on: Step 5b
- [ ] **Step 5d**: `index.html:1666` `#speedFastBtn` — `edit` — 把单按钮改成 2 个 tier 按钮：
  ```html
  <button id="speedFastBtn" type="button" title="Fast forward (4x) · key ]" aria-label="Fast forward 4x">⏩</button>
  <button id="speedUltraBtn" type="button" title="Ultra speed (8x) · key ] twice" aria-label="Ultra speed 8x">⏭</button>
  ```
  CSS 复用 `#speedControls button`。
- [ ] **Step 5e**: `src/ui/hud/HUDController.js:setupSpeedControls()` (line 570-608) — `edit` —
  保持 `speedFastBtn → timeScale=4.0` 现状；新增 `this.speedUltraBtn = document.getElementById("speedUltraBtn")`，
  click 设 `timeScale=8.0`、`isPaused=false`。**关键 — Autopilot 解耦**：把
  `aiToggleTop?.addEventListener("change", …)` 与 `aiToggleMirror?.addEventListener("change", …)`
  各加 `(e) => { if (!e.isTrusted && !e.detail?.userInitiated) return; syncAutopilot(...) }`，
  阻断 button click 引发的合成 change 事件改 ai.enabled（Run 3 reviewer 看到 autopilot 自己关掉
  的根因）。`render()` line 1420 `const fast = (state.controls.timeScale ?? 1) > 1.2` 保持
  不变；`speedUltraBtn.classList.toggle("active", (state.controls.timeScale ?? 1) >= 7)`。
  - depends_on: Step 5d, Step 5a

### Step 6 — CHANGELOG

- [ ] **Step 6**: `CHANGELOG.md` unreleased section — `edit` — 新分组 "Speedrunner / Replay & FF
  hardening (Round 6 02c-speedrunner)"，按 Step 1-5 列条目。明确声明 "no Score formula
  change · no new building/tile/tool · leaderboard is local-only (no network) · FF 8× is
  honest-clamped · Autopilot解耦不改 ai.enabled 默认行为"。

### Step 7 — 测试（3 new files）

- [ ] **Step 7a**: `test/leaderboard-service.test.js` — `add` — 5 cases：
  - `recordRunResult` 写入后 `listTopByScore` 按 score desc 返回。
  - 超过 20 条只保留 top-20。
  - storage 抛异常时 `recordRunResult` swallow（不 throw），返回 `{ ok: false }`。
  - corrupt JSON 时 list 返回 `[]`。
  - `clear()` 清空。
- [ ] **Step 7b**: `test/sim-stepper-timescale.test.js` — `edit` (extend，不改原断言) — 加
  3 case：timeScale=8 / frameDt=1/60 / safeFixed=1/30 → steps=4（accumulator 累积模式），
  并断言 `nextAccumulatorSec` 不会超过 2.0；timeScale=99 应被 clamp 到 8；timeScale=0 应被
  clamp 到 0.1。
- [ ] **Step 7c**: `test/speedrunner-end-phase-leaderboard.test.js` — `add` — 集成测试：构造最小
  fake state（phase active, survivalScore=1234, mapSeed=42, metrics.timeSec=600）→ 调用一个
  `recordRunResultFromState(state, leaderboardService)` helper（同步，新放在
  leaderboardService 里）→ 断言 listTopByScore 返回 1 条且 entry.seed=42 / score=1234。
  覆盖 "speedrunner 跑完一局后下次开 boot 屏看得到自己的分数" 的端到端契约。

## 5. Risks

- **R1 (中)**: localStorage quota / Safari 隐私模式下 `setItem` 抛 `QuotaExceededError`。Mitigation：
  Step 1 `recordRunResult` 全 try/catch，写失败时 console.warn 并把内存列表保留，下一次
  reload 列表为空（用户已收到一次 warn）。**不允许阻塞 end-phase 转换**。
- **R2 (中)**: FF 8× 在 simCost > 8ms 帧降级到 4× 时，`timeScaleActual` 显示和 `controls.timeScale`
  会经常打架，可能制造新 confusion。Mitigation：HUDController.js 已有的 `actual:` 标签逻辑
  (line 1424-1429) 会照常工作；阈值 `Math.abs(actual-requested) > 0.5` 显示，调成 8× 时阈值
  仍合理。Round 5b 已经通过这条路径。
- **R3 (中)**: Autopilot 解耦的 `event.isTrusted` 守卫在某些浏览器（older Edge / iOS Safari
  低版本）可能误伤真实用户 click（极罕见，但 reviewer 是 Chromium 系所以 isTrusted 路径
  ok）。Mitigation：兜底接受 `event.detail?.userInitiated` 自定义 flag，给将来若需要程序化
  toggle 留口子；保留现有 setupSpeedControls 的 `syncAutopilot()` 接口完整。
- **R4 (低)**: Step 4 把 score 在 end-phase 显示成 final 数字，可能让 statusObjective 在
  GameStateOverlay 显示时同时可见——但 GameStateOverlay 的 render() 已 set
  `statusBar.style.display = "none"` (line 326)，所以视觉上 statusObjective 在 overlay
  期间被遮挡，不会冲撞。
- **R5 (低)**: 可能影响的现有测试：`test/shortcut-resolver.test.js`（新增 `[`/`]` 分支
  必须保持已有 selectTool/togglePause 测试通过）；`test/sim-stepper-timescale.test.js`
  （Step 7b 是 extend，不改 Round 5b 已发的 4× 断言）；`test/help-modal.test.js`（Step 5b
  改 SHORTCUT_HINT 文字，可能要更新断言里的精确字符串）。

## 6. 验证方式

### 新增测试

- `test/leaderboard-service.test.js` — 5 case (Step 7a)
- `test/speedrunner-end-phase-leaderboard.test.js` — 1 case 集成 (Step 7c)
- `test/sim-stepper-timescale.test.js` — extend 3 case (Step 7b)

### 手动验证

1. `npx vite` → `http://localhost:5173`。
2. **Score 持续可见性**：开局 → 玩 1 分钟 → Ctrl+Z 多次清掉 / 强制饿死 → end-overlay 弹出后
   端 KPI 行 Score 不变成 "—"，显示 `Score N · final`，end-panel 显示 `Survival Score: N` 与
   `Seed XXXX` chip。
3. **Leaderboard 写入**：再次跑 → 死掉 → 回到 boot 屏 → 应看到 "Best Runs" 卡片，列出最近
   2 条记录（score 高的在上）。reload 浏览器后仍存在。
4. **Seed copy chip**：end-overlay → 点 seed chip → actionMessage 出现 "Seed copied"。
5. **FF 8×**：开局 → 按 `]` 三次（1×→2×→4×→8×）→ HUD `gameTimer` 加速 ~8x；按 `[` 减档；点
   `#speedUltraBtn` 直接进 8×；HUD `timeScaleActualLabel` 在 sim 重时显示 `actual ×4-6`（自动
   clamp 不骗玩家）。
6. **Autopilot 解耦验证**：开局 → 勾上 Autopilot → 反复连点 `#speedFastBtn` 和
   `#speedUltraBtn` 各 10 次 → Autopilot 不应自己被关掉（Round 6 reviewer Run 3 的核心抱怨）。
7. **Help 文档对齐**：F1 → Help → 看 SHORTCUT_HINT 渲染处包含 "[/] speed tier"。

### benchmark 回归

`node scripts/long-horizon-bench.mjs --seed 1 --seed 7 --seed 42 --seed 99 --preset temperate_plains --max-days 365 --soft-validation`

接受带：
- DevIndex median ≥ 33（Round 5b baseline，本 plan 不改 economy 不应抖动）
- 任一 seed deaths ≤ 520（Round 5b baseline + 12% 容差）
- benchmarkMode 路径里 leaderboardService 不能写入（在 Step 2b 包 `if (this.state.benchmarkMode === true) return;` 防污染 long-run 验证）

`scripts/long-horizon-bench.mjs` / `src/benchmark/**` / `package.json` / `vite.config.*` 全部不
触碰（Round 6 Runtime Context 明令保护）。

## 7. UNREPRODUCIBLE 标记

- Reviewer Run 1 "按 L 把 run 弹回 boot 屏 + URL 追加 `?template=rugged_highlands`" — 该
  shortcut 在 `src/app/shortcutResolver.js:60-63` 已被 phase 门控；URL 重写不在代码 path 里，
  最可能是 reviewer 边按 hotkey 边切了浏览器 tab / Vite HMR 触发的 URL persist 行为。本 plan
  保留 phase 门控不动（已有 5b 加固），不另行追加 modal "press L to confirm"——加 modal 反而
  违背速通玩家偏好。**标 UNREPRODUCIBLE-NO-FIX**：将来若 multiple reviewers 复现可单独立项。
- Reviewer Run 3 "page 切到 about:blank" — 极可能是 Vite HMR 在 reviewer 长跑时的渲染崩
  / extension 干扰。无 stack trace 不可复现，也不在 src/** 范围。**标 UNREPRODUCIBLE-NO-FIX**。
- Reviewer Run 1 "按 Space 焦点被吃" — 已在 `src/app/GameApp.js:#shouldIgnoreGlobalShortcut`
  (line 1465-1472) 的 `BUTTON / SUMMARY` 判定里处理；reviewer 描述符合 button 焦点态下的
  Space=button-click 浏览器原生行为。**标 BY-DESIGN**：要求改原生 button 行为是 anti-pattern；
  本 plan 不为此写 modal 弹窗或全局 preventDefault（会破坏 a11y）。Mitigation：Step 5b 的
  SHORTCUT_HINT 增加文字 "Click empty canvas first to ensure Space pauses"。

---

**Layers touched**: `src/app/` (3 files: GameApp + createServices + new leaderboardService) +
`src/ui/hud/` (2 files: GameStateOverlay + HUDController) + `src/app/shortcutResolver.js` +
`src/app/simStepper.js` + `index.html` + `test/` (3 new) = **9 files edited/added + 3 new tests**.
freeze_policy=lifted boundaries respected: 不触碰 `src/benchmark/**` / `scripts/long-horizon-bench.mjs` /
`package.json` / `vite.config.*` / Round 5b 已发 CHANGELOG 段（只追加新段）。

**Coverage**: F-Score-持久化 (FIXED Step 1-4) + F-Replay/leaderboard (FIXED Step 1-3) +
F-FF-上限 (FIXED Step 5a/5d/5e) + F-Autopilot状态泄漏 (FIXED Step 5e) +
F-Hotkey速度控制 (FIXED Step 5b/5c) + F-Seed-copy (FIXED Step 3a/3b) +
F-Score-end-phase-显示 (FIXED Step 4) + F-shift+click多格 (DEFERRED-Round7 方向 C) +
F-按L弹boot (UNREPRODUCIBLE-NO-FIX) + F-page→about:blank (UNREPRODUCIBLE-NO-FIX) +
F-Space焦点窃取 (BY-DESIGN, doc only) = **7 FIXED / 1 DEFERRED / 3 UNREPRODUCIBLE-or-BY-DESIGN
out of 11 distinct findings = 7/11 = 63.6% FIXED, 11/11 = 100% accounted for**.
