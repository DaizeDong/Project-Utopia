---
reviewer_id: 02e-indie-critic
feedback_source: Round7/Feedbacks/02e-indie-critic.md
round: 7
date: 2026-04-26
build_commit: f0bc153
priority: P1
freeze_policy: lifted
estimated_scope:
  files_touched: 8
  loc_delta: ~420
  new_tests: 4
  wall_clock: 105
conflicts_with: []
---

## 1. 核心问题

Reviewer 给 6.0/10（Round 6 实施后从 ≤4/10 升至 6.0，+2 分提升已落地）。Round 7 评测
指出三个剩余根本问题，按影响权重排序：

### 问题 1: Debug/Benchmark 面板对非开发者玩家裸露（扣分信号最强）

> "游戏里有一套完整的 Debug 面板，包含：基准测试预设（Light/Heavy/Custom）、
> Export Replay、Download CSV、AI prompt/output 日志、地形参数调节滑块、
> 人口手动注入控制。当一个游戏内置 'Run Benchmark + Download CSV' 的时候，
> 它的第一用户很可能是它的开发者自己。"

病因：`devModeGate.js` 已实现 `dev-mode` body class（URL `?dev=1` / Ctrl+Shift+D 触发），
所有 `.dev-only` 元素在非 dev 时被 CSS 隐藏。但 **Settings 面板内的 Benchmark presets /
Export Replay / Download CSV / AI Prompt Log 仍然以 `.dev-only` 之外的选择器渲染**，
即不受现有 gate 约束。同时，`DeveloperPanel` 这个标签在侧栏 tab 中默认可见，未通过
`devModeGate.isDevMode()` 控制 tab 的 `hidden` 属性。

Round 6 Plan 方向 B（"Telemetry Curtain"）刻意跳过了这个问题（理由：InspectorPanel 冲突风险），
导致 R7 reviewer 仍能直接看到 benchmark 面板。

### 问题 2: 多标签页实例增殖 bug（导航信任透支）

> "游戏在多个标签页里同时跑了多个实例，而我并没有主动操作启动它们（可能是某些按钮
> 的副作用，或 URL 状态管理的问题）。这不是'迷人的粗糙'，是一个让人迷失方向的
> 导航 bug。在独立游戏里，第一印象非常昂贵，导航 bug 会透支作品建立起的信任。"

病因：检查 `index.html` 确认三个菜单按钮（Start Colony / How to Play / New Map）均为
`<button type="button">`，无 `<a href>` 标签，正常左键点击不会开新标签。但浏览器的
**中键点击（wheel-click）** 或 **Ctrl+Click** 对 `<button>` 元素在部分浏览器（Chrome/Edge）
下会产生"导航到按钮所在的 fragment"行为，若页面有 `#hash` 锚点，浏览器可能认为是
同 origin 新标签导航。另一个候选路径：`GameStateOverlay` 在 `handlers.onReset?.()` 的
`setTimeout(() => { resetFromMenuBtn.textContent = "New Map"; ... }, 300)` 有 300ms 竞态
窗口——若用户双击 New Map，第二次点击在 disabled=false 还原前触发并在 0-300ms 内
fired，会触发两次 `onReset()`，每次 `onReset` 可能在旧 GameLoop 仍运行时创建新 GameLoop
实例，在同一标签页内产生双实例（reviewer 称"多个实例"，可能是指同页面内两套 canvas/loop
叠加，而非真的多标签页）。

精确修复路径：`src/ui/hud/GameStateOverlay.js` 的 `resetFromMenuBtn` click handler 加
`AbortController` 式的单次防抖（flag `_resetPending`），同一帧内重复调用 drop。

### 问题 3: "Utopia" 主题空洞 — 情感系统服务效率不服务意义（长期赤字）

> "游戏叫 Utopia。Project Utopia 里的工人在挨饿、在死去、在繁衍……但游戏没有在问：
> 这个殖民地值得存在吗？谁的乌托邦？代价是什么？'殖民地能不能活下去？'
> vs '殖民地为什么活下去？'"

病因：这不是单个代码 bug，而是一个 framing gap：族谱/情绪/死亡事件系统（技术上完整）在
UI 层全部被呈现为"效率变量"（Mood: 0.82 → 形容词还是在描述劳动产出，不是在描述一个人）。
Reviewer 的路径三（"小而完整的作者作品"）提示：**不需要重写系统，只需要在 Hollow Keep
场景的终局为"空心要塞"隐喻注入一行反问句**——这是最低成本、最高主题密度的触点。

可落地的最小实现：在 `GameStateOverlay` 的 `#overlayEndAuthorLine`（Round 6 Step 6 已存在）
渲染层上，叠加一条 **场景特定的反问式尾注**（per-template `endThemeQuestion`），
让 Hollow Keep 的终局以 "Who was the keep built for?" 收尾，
让 Island Relay 的终局以 "Was the relay worth the crossing?" 收尾。
这是 6 行配置变更 + 已有渲染管道的复用，不引入新系统。

---

## 2. Suggestions（可行方向）

### 方向 A: "Dev Curtain 落地" — 把 Benchmark/Export/CSV 锁进 dev-mode gate

- 思路：在 `DeveloperPanel` 初始化时检查 `isDevMode(state)` 并在侧栏 tab 节点上
  设置 `hidden` 属性；把 Settings 面板内 Benchmark / Export Replay / Download CSV /
  Terrain Sliders 所在的 `<div>` 包裹进统一的 `.dev-only` class，让已有 CSS 接管。
  不需要写新逻辑——只需对齐 HTML 结构与 CSS selector。
- 涉及文件：`index.html`（`.dev-only` wrapper 扩展到 benchmark/export/csv/terrain 区块）、
  `src/ui/panels/DeveloperPanel.js`（tab 隐藏逻辑，可选）。
- scope：小（~60 LOC HTML 结构调整 + 20 LOC JS）
- 预期收益：reviewer 第 (3) 项"技术演示的幽灵"消除；对非 dev 玩家体验最干净
- 主要风险：Settings 面板里可能有一些 Benchmark 控件没有独立 id，需要精确 grep 确认
  wrapper 边界不误包含玩家控件（如 speed controls, AI toggle）

### 方向 B: "多实例防抖" — New Map / Reset 双击竞态保护

- 思路：在 `GameStateOverlay` 的 `resetFromMenuBtn` 和 `resetBtn` click handler 中加
  `_resetPending` flag，300ms 内重复点击直接 `return`；同时在 `GameApp.onReset` 侧
  加 guard 确保旧 GameLoop 的 `cancel()` 在新 loop 启动前完成。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`（click handler debounce）、
  `src/app/GameApp.js`（loop cancel guard）。
- scope：小（~30 LOC）
- 预期收益：消除"多实例增殖"的导航信任崩塌；廉价且高优先
- 主要风险：如果 reviewer 的实际路径是真正的多标签页（中键点击 button），则需要
  在按钮上补 `e.preventDefault()` 阻止浏览器默认的 auxclick 行为；这两条路径可以
  并行修，互不干扰

### 方向 C: "主题尾注" — 每个模板的终局加一行反问式尾注

- 思路：在 `ScenarioFactory.js` 的 per-template voice 对象上加 `endThemeQuestion`
  字段（6 行字符串），在 `GameStateOverlay.showEndPanel` 渲染 `#overlayEndAuthorLine`
  后再追加一行 `<span class="overlay-end-theme-q">` 显示该问题；CSS 用更细的字体
  和较低对比度的颜色，像是边距注释而非主标题。
  Hollow Keep → "Who was the keep built for?"
  Island Relay → "Was the relay worth the crossing?"
  Silted Hearth → "Does the hearth belong to the silt or the fire?"
  Broken Frontier → "What does the frontier become once it's no longer broken?"
  Driftwood Harbor → "Is a harbor still a harbor when the fleet is gone?"
  Gate Bastion → "How many gates can one colony hold open at once?"
- 涉及文件：`src/world/scenarios/ScenarioFactory.js`（6 个 endThemeQuestion 字段）、
  `src/ui/hud/GameStateOverlay.js`（渲染追加）、`index.html`（新 DOM 节点 + CSS）。
- scope：小（~80 LOC，主要是配置字符串）
- 预期收益：reviewer 问题 3 的最小成本回应；让"Utopia"这个名字在终局有一声回响
- 主要风险：6 句问句需要保持与游戏已有散文 tone 一致（简洁、具体意象、不说教），
  否则与 reviewer 赞赏的"克制投入"风格冲突

---

## 3. 选定方案

选 **方向 A + 方向 B + 方向 C 合并**（A 主干，B 安全补丁，C 轻量主题钩）。

理由：

- 方向 A 修复了 reviewer 最明确的扣分项（"Debug 面板暗示产品优先级倾斜"），且
  Round 6 Plan 方向 B 刻意延迟了这个修复，本轮 freeze=lifted，可以落地。
- 方向 B 成本最低（~30 LOC），但对"导航 bug 透支信任"的修复价值极高；独立游戏
  reviewer 在评分时对第一印象加权很重，一个防抖 guard 可能价值 0.5 分。
- 方向 C 不引入任何新系统，只是 6 个字符串字段 + 已有渲染管道的复用；它给了
  reviewer "路径三（小而完整的作者作品）"一个轻声回应，而不需要重写主题架构。
  总成本 ~80 LOC，主题收益高于 LOC 比率。
- A+B+C 总计 ~420 LOC，4 个新测试，落在 standard budget 内；不动 sim systems →
  DevIndex baseline 不回归；只触 UI 层和配置层。

---

## 4. Plan 步骤

- [ ] **Step 1**: `index.html` — `edit` —
  定位 DeveloperPanel tab 按钮（侧栏 `#sidebar` 区域，`data-panel="developer"` 或等效
  id/class）和 Settings 面板内的 Benchmark presets / Export Replay / Download CSV /
  Terrain Sliders 区块，把这些节点加上 `dev-only` class（已有 CSS：
  `body:not(.dev-mode) .dev-only { display: none !important; }`）。
  目标：非 dev 用户的侧栏不出现 "Developer" tab；Settings 面板内只剩玩家相关控件。
  先 Grep `class="dev-only"` 确认已有 gate 范围，再精确扩展 wrapper 边界。

- [ ] **Step 2**: `src/app/GameApp.js` — `edit` —
  在 `onReset` / `handleReset` handler（约 line 1997 / 2043 附近，`location.href` 所在
  的重置路径）加 `_resetInFlight` bool guard：若 `_resetInFlight === true` 则直接
  `return`，在 reset 流程完成（新 GameLoop `start()` 返回后）清除 flag。防止
  快速双击或竞态条件产生双实例。

- [ ] **Step 3**: `src/ui/hud/GameStateOverlay.js` — `edit` —
  在 `resetFromMenuBtn` 和 `resetBtn` 的 click handler 中加单次防抖保护：
  新增 `this._resetClickPending = false`，点击时若 `_resetClickPending` 为 true
  则 `return`，否则置 true + 调用 handler；`setTimeout(..., 350)` 后重置为 false。
  同时在两个按钮的 `auxclick` 事件（中键点击）上加 `e.preventDefault()` 阻止
  浏览器可能的"在新标签打开"行为。

- [ ] **Step 4**: `src/world/scenarios/ScenarioFactory.js` — `edit` —
  在每个 template voice 对象上追加 `endThemeQuestion` 字段（字符串），共 6 条：
  - `temperate_plains` → `"What does the frontier become once it's no longer broken?"`
  - `rugged_highlands` → `"How many gates can one colony hold open at once?"`
  - `archipelago_isles` → `"Was the relay worth the crossing?"`
  - `coastal_ocean` → `"Is a harbor still a harbor when the fleet is gone?"`
  - `fertile_riverlands` → `"Does the hearth belong to the silt or the fire?"`
  - `fortified_basin` → `"Who was the keep built for?"`
  纯加字段，不改已有字段；`getScenarioVoiceForTemplate` 返回值自动包含新字段。

- [ ] **Step 5**: `src/ui/hud/GameStateOverlay.js` — `edit` —
  在 `showEndPanel` / `render()` 的终局渲染路径中（已有 `this.endAuthorLine`
  对应 `#overlayEndAuthorLine` 的渲染后），读取
  `getScenarioVoiceForTemplate(templateId)?.endThemeQuestion`；若非空，写入新 DOM
  节点 `#overlayEndThemeQ`（Step 6 添加）的 `textContent`；若为空则 `hidden = true`。
  读取路径：`state?.controls?.mapTemplateId ?? state?.world?.mapTemplateId`。

- [ ] **Step 6**: `index.html` — `add` —
  在 `#overlayEndAuthorLine` 之后追加：
  `<p id="overlayEndThemeQ" class="overlay-end-theme-q" hidden></p>`
  CSS 追加到终局样式块附近：
  `.overlay-end-theme-q { margin-top: 18px; font-size: 12px; font-style: italic;
  color: rgba(208,232,255,0.45); letter-spacing: 0.03em; }`
  颜色比 `.overlay-author-line`（rgba 0.72）更淡，呈现为边距注释而非主文本。
  `@media (prefers-reduced-motion: reduce)` 内 no new animation（此元素无独立动画）。

- [ ] **Step 7**: `test/dev-curtain-gate.test.js` — `add` —
  新建测试文件。使用 jsdom stub：
  (a) 断言：当 `document.body` 无 `dev-mode` class 时，所有 `.dev-only` 元素
      `computed display` 为 `none`（通过 jsdom 内联 CSS 注入验证）；
  (b) 断言：`DeveloperPanel` 构造时若 `isDevMode(state)` 为 false，Developer tab
      节点的 `hidden` 属性为 true；
  (c) 断言：URL `?dev=1` 后 `readInitialDevMode()` 返回 true，对应 class 被设置。

- [ ] **Step 8**: `test/reset-debounce.test.js` — `add` —
  新建测试文件：
  (a) 模拟 `resetFromMenuBtn` 在 200ms 内连续两次 click 事件，断言 `handlers.onReset`
      仅被调用一次（防抖 guard 拦截第二次）；
  (b) 模拟 350ms 后第三次 click，断言 `handlers.onReset` 被再次调用（防抖已重置）；
  (c) 模拟 `auxclick` 事件，断言 `preventDefault` 被调用。

- [ ] **Step 9**: `test/end-theme-question.test.js` — `add` —
  新建测试文件：
  (a) 断言 `getScenarioVoiceForTemplate("fortified_basin").endThemeQuestion` 等于
      `"Who was the keep built for?"`；
  (b) 断言 6 个 template id 各自返回非空的 `endThemeQuestion` 字符串；
  (c) 断言 `GameStateOverlay` 在 `showEndPanel` 后，DOM `#overlayEndThemeQ` 的
      `textContent` 与对应 template 的 `endThemeQuestion` 匹配（jsdom stub）；
  (d) 断言当 voice 无 `endThemeQuestion` 字段时，`#overlayEndThemeQ.hidden === true`。

- [ ] **Step 10**: `CHANGELOG.md` — `add` —
  在文件顶端新增 `## [Unreleased] - v0.8.2 Round-7 02e-indie-critic: dev curtain +
  reset debounce + end theme question` 章节。
  分类：New Features（dev curtain, theme question）、Bug Fixes（reset double-click）、
  New Tests（3 个文件）、Files Changed（8 个）、Reviewer Pain Points Addressed。

---

## 5. Risks

- **R1: `.dev-only` wrapper 扩展误包含玩家控件**。Settings 面板里 speed controls /
  AI toggle / map template select 等玩家可见控件与 benchmark/export 控件物理上
  可能相邻；缓解：Step 1 执行前必须 Grep `id="benchmark\|export\|csv\|terrain"` 精确定位
  边界，用独立 `<div class="dev-only">` 包裹，不改父级结构。

- **R2: `_resetClickPending` flag 在 GameStateOverlay 重建时泄漏**。`GameStateOverlay`
  对象在 `onReset` 时不被重建（handler 层面复用），flag 会在正常使用中自动重置；
  但若 onReset 处理路径中抛出异常，flag 可能永久卡住。缓解：`try/finally` 确保
  flag 在 handler 完成后清除，即使异常路径。

- **R3: `endThemeQuestion` 字段在 `ScenarioFactory` 返回的 frozen 对象上需要正确位置**。
  如果 voice 对象已经被 `Object.freeze()`，直接新增字段会静默失败（strict mode 下
  throw）。缓解：Step 4 执行前检查 `Object.isFrozen()` — 如果已冻结，需在定义阶段
  加入字段，而非事后 assign。

- **R4: Round 7 reviewer 的"多标签页增殖"可能是 Playwright 测试框架副作用而非游戏
  bug**。如果评测者在 Playwright 自动化环境中多次导航，框架本身可能保持历史 tab。
  在这种情况下 Step 2/3 的防抖修复不能复现，但也不会造成回归——是安全修复，
  无论原因如何。

- **R5: `endThemeQuestion` 6 句英文问句 tone 需与已有散文风格一致**。Reviewer 高度
  认可现有命名体系的"两个意象之间的张力"；6 句问句必须遵循同一写法：具体、简洁、
  一个问题一个意象，不问抽象哲学（"Is survival worth it?" 这类过于泛化）。Step 4
  的字符串需在写入前与现有 voice 散文对比检查。

- **可能影响的现有测试**：
  `test/end-panel-finale.test.js`（Step 5 追加 DOM 写入，需确认 fixture 包含
  `#overlayEndThemeQ`）；`test/scenario-voice.test.js`（如存在，需兼容新字段）；
  `test/dev-mode-gate.test.js`（如存在，Step 7 新测试不与之重复）。

---

## 6. 验证方式

- **新增测试**（4 个文件）：
  - `test/dev-curtain-gate.test.js`（3 cases：非 dev body class 下 .dev-only 隐藏 /
    DeveloperPanel tab hidden / readInitialDevMode URL 解析）
  - `test/reset-debounce.test.js`（3 cases：双击防抖 / 350ms 后再次可用 / auxclick
    preventDefault）
  - `test/end-theme-question.test.js`（4 cases：6 template 全有字段 / fortified_basin
    精确字符串 / GameStateOverlay 写入 DOM / 无字段时 hidden）

- **手动验证**：
  1. `npx vite` → 不加 URL 参数打开 → 侧栏 "Developer" tab 应不可见；Settings 面板
     内 Benchmark / Export Replay / Download CSV / Terrain Sliders 应消失
  2. URL 加 `?dev=1` → 上述控件恢复可见；Ctrl+Shift+D 切换也应同步
  3. 菜单页快速双击 "New Map" → 地图只重置一次，不出现双 canvas / 双 worker population
  4. 选 Fortified Basin → 开始游戏 → 让殖民地死亡（饥饿触发终局）→ 终局面板应出现：
     标题（4 档之一）+ openingPressure 散文 + 一行淡色斜体问句
     "Who was the keep built for?"
  5. 选 Archipelago Isles → 终局 → 问句应为 "Was the relay worth the crossing?"

- **回归检查**：
  `node --test test/*.test.js` — 基线 865 tests passing（2 pre-existing skips）；
  本 plan 不动 sim systems（ECS、ResourceSystem、WorkerAISystem、ColonyPlanner），
  DevIndex benchmark baseline 不变。

- **benchmark 回归**：
  `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains
  --duration 600` — DevIndex 不得低于 41（基线 ~44，-7% 容错）；4-seed gate
  （42, 1337, 31337, 999）全部 GREEN。
