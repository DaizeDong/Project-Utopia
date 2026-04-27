---
reviewer_id: 02d-roleplayer
feedback_source: Round1/Feedbacks/02d-roleplayer.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P1
estimated_scope:
  files_touched: 3
  loc_delta: ~110
  new_tests: 1
  wall_clock: 45
conflicts_with: []
---

## 1. 核心问题

1. **"隐形导演" 问题**：游戏有完整的 event trace（`state.debug.eventTrace`
   里已有 `[SABOTAGE]` / `[VISITOR]` / `[SHORTAGE]` / `Mose-26 died (starvation)`
   等具名、带时间戳、带因果的素材），但这些数据**只流到隐藏的 DeveloperPanel**
   (`devEventTraceVal`, 默认 `visible:false`)。屏幕顶部的 `#storytellerStrip`
   只读 `state.ai.groupPolicies.workers.data.focus/summary`——一条随模板缓慢变化、
   看起来像"开发者注释"的字符串。玩家的主观感受是"静态占位符"，实际是 event trace
   **没有任何通道暴露到第一视角 HUD**。
   这是 roleplayer 3/10 评分里占 -1.5 分的主因。

2. **Entity 点选反馈不明显**：SceneRenderer `#onPointerDown`（1927-1942 行）
   其实已经**优先**尝试 `#pickEntity(mouse)`——只有 miss 才落到 build 工具。
   但 reviewer 多次点击都没选中任何工人，症状吻合"instanced mesh 射线
   hit-box 太窄 + canvas 上 pointer 默认 cursor 是 build crosshair → 玩家
   不知道 'hover 工人会高亮'"。缺的是**点选前的视觉 affordance**（hover ring /
   cursor 切换）和**缩小 build-tool 夺焦**（按 Esc 回到"Inspect"空工具）。

（第 3 项关于"名字/传记/mood/墓志铭"属于 reviewer 许愿，但这是
**新 mechanic**——在 HW06 freeze 边界外，本 plan 不纳入。）

## 2. Suggestions（可行方向）

### 方向 A: 把 eventTrace 织入 storytellerStrip（Narrative Ticker）

- 思路：`computeStorytellerStripText` 已经是纯函数。把
  `state.debug.eventTrace` 最近 ≤ 15s / top-1 条 salient 行（SABOTAGE /
  STARVATION / VISITOR / WEATHER / FIRE 这几个 tag 优先）提取为
  `NARRATIVE` 片段，拼到现有的 `[Rule-based Storyteller] focus: summary`
  尾巴上，format 成 `[Rule-based Storyteller] focus · Last: Mose-26 starved (2s ago)`。
  纯函数改动、已有 `hud-storyteller.test.js` 只要补 trace 分支，不破坏现有 4 条断言。
- 涉及文件：`src/ui/hud/storytellerStrip.js`, `test/hud-storyteller.test.js`
- scope：小
- 预期收益：**直接解决核心问题 1**——把"导演"从幕后拽到台前。玩家每隔几秒
  就能看到 "visitor Ody-48 arrived"、"food shortage"、"Mose-26 died" 滚动过屏。
  roleplayer 描述的"Mose 和 Hale 接连倒下却零提示"瞬间消失。
- 主要风险：
  - eventTrace 每秒刷新可能让 strip 文字抖动 → 加 ≥ 2.5s dwell 节流。
  - HUDController 现在的 `textContent !== text` diff 就足以避免 DOM 抖动，不需要改宿主。
  - 需要确认 `state.debug` 在非-dev profile 下依然有 eventTrace（Grep 已确认
    `EntityFactory.js:679` 里默认就建 `eventTrace:[]`，不受 profile 控）。

### 方向 B: Entity Focus 点选可发现性（Hover Ring + Esc-to-Inspect）

- 思路：
  (1) SceneRenderer 在每帧已跑 `#onPointerMove`，再多跑一次 `#pickEntity(mouse)`
      把 hover 到的 entity id 写入 `state.controls.hoveredEntityId`，然后
      render 层在那个 entity 上画一个半透明 ring（复用已有的 selectedRing pipeline）。
      hover 命中时 canvas cursor 切成 `pointer`，miss 时继续显示 build crosshair。
  (2) 按 Esc 时把 `state.controls.tool` 切成一个新的 "inspect" 值（或者
      `null`，BuildSystem.placeToolAt 对未知 tool 会直接返回 ok=false），
      这样 roleplayer 的"按 Esc tool 没取消"投诉也解决。
- 涉及文件：`src/render/SceneRenderer.js`（hover pick, cursor）、
  `src/app/GameApp.js` 或 `src/app/shortcutResolver.js`（Esc 绑定）、
  `src/entities/EntityFactory.js`（`controls.hoveredEntityId` 字段）。
- scope：中
- 预期收益：解决核心问题 2。Entity 选中后本来就能看 backstory/traits/relationships
  （EntityFocusPanel 404-400 行已经在 Round 0 02d 实装了 Character block），
  只是 reviewer 点不中。打通最后一公里。
- 主要风险：
  - hover pick 每 50ms 跑一次 raycast，CPU 成本非 0（但 `#onPointerMove`
    已有 `pointerSampleIntervalMs` 节流）。
  - cursor 切换可能和 camera-drag 模式冲突——需要和 `isCameraInteracting` 互斥。
  - Esc 绑定可能已被 Pause 或 modal-close 抢占，得先 Grep keydown。

### 方向 C: Heat Lens 圆圈标签（Label-on-Pulse）

- 思路：`PressureLens.js` 已经在每帧算出脉冲圆的 `(ix,iz,radius,kind,severity)`，
  只是**把 kind 文字丢了**。改成附带 `label` 字段（"sabotage @ warehouse"），
  SceneRenderer 在圆心上方画一个 HTML overlay 的小 label 或 CanvasTexture
  sprite。
- 涉及文件：`src/render/PressureLens.js`, `src/render/SceneRenderer.js`
- scope：中
- 预期收益：解决 reviewer "圆圈不知道是啥" 的抱怨。
- 主要风险：overlay 坐标跟随 camera pan/zoom 需要投影，和现有 toast 层类似
  但复杂度更高；且 Heat Lens 是 L-key 临时视图，改动价值比方向 A 小。

## 3. 选定方案

选 **方向 A（Narrative Ticker）**，理由：

- **最高 ROI**：roleplayer 给分最狠的扣分是 "静态占位符 storyteller"（-1.5），
  方向 A 一次性把 event trace 通道打通，直接命中痛点。
- **scope 最小**：纯函数 + 一个 HUD 调用层；已有 `storytellerStrip.js` 是
  Round 0 01e-innovation 新建的，刚经过测试 baseline，改起来风险可控。
- **不跨 freeze 边界**：严格属于 "把后台已有 event trace 暴露到 UI" 的 polish，
  符合 Runtime Context 里显式允许的范围。不添加新 mechanic（不加 mood/bio/
  墓碑面板），只把现有数据源 fan-out 到现有显示组件。
- **可测试**：`hud-storyteller.test.js` 已有纯函数测试套件；补充 fixture
  即可覆盖新分支。
- **不破坏现有测试**：当 `state.debug.eventTrace` 为空（现有 5 个 fixture 都这样），
  输出和现在完全一致。

方向 B 留到下一轮（点选可发现性是 P1，但 roleplayer 自述 "后台有故事、
舞台上没声音" 才是决定性感受；先打通信道，点选优化是放大器）。
方向 C 放弃（改动成本更高、受益面更窄）。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/hud/storytellerStrip.js:computeStorytellerStripText` —
  `edit` — 在函数顶部新增一个 helper `extractLatestNarrativeBeat(state, nowSec)`：
  从 `state?.debug?.eventTrace` 取数组第 0 项（最新），正则/前缀匹配
  `[SABOTAGE]` / `[SHORTAGE]` / `[VISITOR]` / `[WEATHER]` / `died (...)` /
  `Warehouse fire` 这 6 种 salient 模式，同时解析行首的 `[NN.Ns]` 时间戳，
  返回 `{ line, ageSec }` 或 null；若 `ageSec > 15` 视为过期返回 null。

- [ ] Step 2: `src/ui/hud/storytellerStrip.js:computeStorytellerStripText` —
  `edit` — 在原本 `return \`[${prefix}] ${focusText}: ${summaryText}\`` 之后
  扩展：若 Step 1 helper 返回非空 beat，追加 ` · Last: ${beat.line.replace(/^\[[\d.]+s\]\s*/, "")} (${Math.round(beat.ageSec)}s ago)`。
  单行长度上限 180 字符（超出则用 `…` 截断），避免 strip 溢出。
  - depends_on: Step 1

- [ ] Step 3: `src/ui/hud/storytellerStrip.js` top of file — `edit` — 为
  pure-function 保持可测试，`computeStorytellerStripText(state)` 签名**保持不变**。
  Step 1 helper 内部用 `state?.metrics?.timeSec ?? 0` 作 `nowSec`；如 timeSec
  缺失 fallback 到只展示 line 不展示 age。
  - depends_on: Step 1

- [ ] Step 4: `src/ui/hud/HUDController.js:348-359` — `edit` — 把 strip dwell
  节流加进来：用 `this._strip_lastText` / `this._strip_dwellUntilMs` 两个字段
  (参考已有的 `_obituaryUntilMs` 模式)，如果新文本和旧不同但距离上次更新
  < 2500ms，则延迟到 dwell 到期再写 DOM。避免 event trace 每 tick 变化
  抖动整行字幕。

- [ ] Step 5: `test/hud-storyteller.test.js` — `edit` — 新增 3 条
  `test(...)`：
  (a) `eventTrace` 有 `[120.5s] [SABOTAGE] visitor_16 sabotaged colony`
      + `state.metrics.timeSec = 121.2` → 输出以 ` · Last: [SABOTAGE] visitor_16 sabotaged colony (1s ago)` 结尾。
  (b) `eventTrace` 有一条 `[50.0s] weather steady`（**非** salient 前缀）
      + `timeSec = 50.5` → 输出不包含 `Last:` 分段（miss filter）。
  (c) `eventTrace` 最新条 ageSec = 40（> 15） → 过期，不拼接 `Last:`。

- [ ] Step 6: 手动冒烟 — `edit`(无改代码) — 启动 `npx vite`，打开
  http://127.0.0.1:5173，Start Run → 按 `]` 加速至 4× → 等待 60-120s
  出现 SABOTAGE / shortage / death 事件 → 肉眼观察 `#storytellerStrip`
  是否会附加 ` · Last: ...` 片段；确认 dwell 节流未让字幕每秒闪烁。
  - depends_on: Step 5

- [ ] Step 7: `CHANGELOG.md` (Unreleased · v0.8.2 段) — `edit` —
  新增一条 "New Features" / "UI Polish"：
  `HUD storyteller strip now surfaces the latest salient event-trace beat
  (sabotage / shortage / visitor / weather / death / fire) alongside the
  worker-policy focus, closing the "silent director" gap reported in
  Round 1 02d-roleplayer playtest.`
  - depends_on: Step 4

## 5. Risks

- **测试 brittleness**：`hud-storyteller.test.js` 现在有 5 条 test，新 fixture
  若未 populate `state.debug.eventTrace: []` 会从 undefined → 可选链已保护，
  但还是显式在所有 fixture 里 set `debug: { eventTrace: [] }` 以防未来回归。
- **字幕抖动**：多事件同一 tick 爆发（例如 winter 第一天同时死 3 人）会让
  strip 在 dwell 窗口内换来换去——dwell=2500ms + textContent diff 能压住 90%；
  如果真出现严重抖动，把 dwell 调到 3500ms。
- **i18n**：当前 strip 文本是英文硬编码，和 `Rule-based Storyteller` 保持
  一致；不引入新语言风险。
- **ageSec 解析**：如果某条 trace 未以 `[NN.Ns]` 起头（例如
  `Warehouse fire at (52,38) — stored goods damaged`）就无时间戳——
  此时 Step 1 回落成 `ageSec = 0`，用 `Last: <line> (just now)`。
- 可能影响的现有测试：
  - `test/hud-storyteller.test.js`（需新增 3 条，不改旧 5 条的断言，确认旧 fixture 不 populate eventTrace 即可通过）
  - `test/ui-layout.test.js`（只检查 DOM id 是否存在，不受字符串内容影响）
  - 无 snapshot 测试覆盖 HUD 文本，安全。

## 6. 验证方式

- **新增测试**：`test/hud-storyteller.test.js` 新增 3 条用例覆盖：salient 匹配、
  非 salient 过滤、age 过期过滤。运行：`node --test test/hud-storyteller.test.js`。
- **回归**：全测跑一遍——`node --test test/*.test.js`。865 通过基线不得降低；
  特别留意 `test/event-log-rendering.test.js` 和 `test/death-narrative-log.test.js`
  （Round 0 02d 新加的）是否还通过。
- **手动验证**：
  1. `npx vite` 启动，打开 http://127.0.0.1:5173。
  2. 选 `Broken Frontier`，Start Run，按 `]` 调速到 4×。
  3. 等 ≥ 60s，观察顶部 `#storytellerStrip` 文本变化，应从
     `[Rule-based Storyteller] route repair and depot relief: ...` 演化为
     `[Rule-based Storyteller] ... · Last: [SHORTAGE] food low (8s ago)` 之类。
  4. 暂停 (Space)，打开 DeveloperPanel 的 `devEventTraceVal` 对照，确认
     strip 引用的确是 eventTrace 的第 0 条。
  5. 按 `[` 减速回 1×，dwell 节流下 strip 不应在一秒内刷超过 1 次。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs`（若 scripts 目录下
  脚本已就绪；否则跳过），seed 42 / temperate_plains，DevIndex 不得低于 44-2=42
  （v0.8.1 基线 44 的 -5%）。本 plan 只改 UI 字符串，理论上对 DevIndex 零影响，
  但作为安全带跑一次。

## 7. UNREPRODUCIBLE 标记

不适用——feedback 自带两张模板（Broken Frontier + Archipelago Isles）的 10 余张
截图与完整 devEventTraceVal 日志粘贴；复现路径（打开 hidden DeveloperPanel →
读 eventTrace → 对比 storytellerStrip textContent）已在代码里 Grep 确认成立：
- `src/ui/hud/storytellerStrip.js:47` 确实只产出与 eventTrace 无关的文本；
- `src/world/events/WorldEventSystem.js:695-739` 确实在写入 eventTrace；
- `src/ui/panels/DeveloperPanel.js:415-461` 确实只在 dev panel 渲染 eventTrace。

症状与代码读一致，不需要 Playwright 端到端验证。
