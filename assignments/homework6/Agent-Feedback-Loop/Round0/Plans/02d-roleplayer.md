---
reviewer_id: 02d-roleplayer
feedback_source: Round0/Feedbacks/player-04-roleplayer.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~260
  new_tests: 2
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 是一位"叙事/角色扮演型"玩家，总评 3/10，抱怨"后端有戏，前端沉默"。
剥离表层症状（无音乐、无昼夜、无情绪 emote）后，**真正可在 HW06 feature-freeze 约束下修复的根本问题有三**：

1. **Identity gap（身份缺口）**：`EntityFactory.js:withLabel`
   只把 `displayName` 写成 `Worker-122` 这种纯数字 ID。底层已经有 `traits / skills / relationships / memory` 全套字段，
   但"工人的名字"在 UI 上永远是 `Worker-122`。玩家无法对任何一个小人产生情感投射。

2. **Narrative channel silence（叙事通道哑火）**：
   - Death events **已经** 通过 `MortalitySystem.recordDeath` 写入 `state.debug.eventTrace` 和 `state.events.log`，
     但这两个 channel 都没被玩家可见的 UI 订阅。
   - `objectiveLog` **只** 记录 recovery trigger，从不记录 death/sabotage/raid；玩家看到的"Objective Log"面板常年是空的。
   - `EventPanel.js` 渲染的 `#eventsPanel` DOM 只显示 `state.events.active`（active event queue），
     不显示 death / starvation / sabotage resolve。
   - UI 层根本没有把"XXX 死了"这条信息搬到玩家视野里。结果：3 个工人同秒饿死，屏幕无感。

3. **Focus panel shows debugger not character sheet（焦点面板像 debugger 而不是角色卡）**：
   `EntityFocusPanel.js:render` 展示 FSM state、policy exchange、raw model content，
   但对 `entity.traits / mood / morale / relationships / memory.recentEvents` 只字不提——
   数据都在 `EntityFactory.js:createWorker` 里构建好了，UI 只是没读。

这三个问题共享一个根因：**telemetry → narrative 的翻译层缺失**。
不需要加任何新 mechanic（feature freeze OK），只要把"已有的数据"讲给玩家听即可。

## 2. Suggestions（可行方向）

### 方向 A: Narrative surfacing bundle — 只改 UI 层，让现有数据"开口说话"

- 思路：在 `EntityFactory` 里把工人名字从 `Worker-122` 改成 `Name-LastName`（基于 deterministic RNG 从固定姓名池抽样）；
  在 `EntityFocusPanel` 增加一段"Character"区块（traits/mood/morale/relationships 前 3 条）；
  新增一个叫 `NarrativeLogPanel` 的只读面板，订阅 `state.debug.eventTrace` + `state.events.log` 的近期 death/sabotage/raid/milestone 事件，
  把 `[161.6s] Worker-218 died (starvation)` 翻译成 `"Kira Voss 在第 161s 饿死在 farm belt 上"`（使用工人的新名字 + 死亡 context 中的 targetTile）；
  在 `ProgressionSystem.maybeTriggerRecovery` 旁新增 `logObjectiveOnDeath`，让死亡直接追加到 `state.gameplay.objectiveLog`，
  那个"永远空着的"Objective Log 就会有内容。
- 涉及文件：
  - `src/entities/EntityFactory.js`（`withLabel` → 名字生成器）
  - `src/ui/panels/EntityFocusPanel.js`（render 函数末尾加 Character block）
  - `src/simulation/lifecycle/MortalitySystem.js`（recordDeath 里同时 push 到 objectiveLog）
  - `src/ui/panels/EventPanel.js` 或新建 `src/ui/panels/NarrativeLogPanel.js`（从 eventTrace 拉最近 12 条翻译成 narrative string）
  - `index.html`（新增一个 `<details data-panel-key="narrative">` 卡片承载 NarrativeLogPanel）
  - `src/app/GameApp.js`（注册新 panel 到 update loop；仅在该方案被选中时编辑）
- scope：中
- 预期收益：reviewer 的 3 个主诉（命名、事件叙事、情绪表达）都被部分缓解；
  按他自己写的"仅此一步就能从 3 分涨到 5 分"标准，有望直接 +2 分。
- 主要风险：
  - 新名字可能破坏 `displayName` 的既有 assumption（若有测试 assert `"Worker-"` 前缀则会挂）。
  - `NarrativeLogPanel` 每帧翻译事件，需注意 dedupe 以免同一死亡被 push 多次。

### 方向 B: Audio bootstrap — 加一段 8-bit ambient loop + 死亡警报音

- 思路：按 reviewer 的第二条建议"加上一段 8-bit loop 的环境音"。用 Web Audio API 合成（无外部 asset 依赖），
  `AudioContext.createOscillator` 写一个 8 秒循环的 2-note drone，再给 death/sabotage 事件加 0.3s 的短警报音。
  在 index.html 加一个 "Audio On" 的 CTA 按钮（浏览器 autoplay policy 要求用户点击）。
- 涉及文件：
  - 新建 `src/ui/audio/AmbientAudio.js`（~120 LOC）
  - `index.html`（新增一个 audio toggle 按钮）
  - `src/app/GameApp.js`（接线）
  - `src/simulation/meta/GameEventBus.js`（可选：subscribe death/sabotage → play cue）
- scope：中偏大（需要处理 autoplay unlock / suspend / resume / 单测环境下 `AudioContext` 不存在）
- 预期收益：直接补足 reviewer 给的"环境音 0 分"项，按他写的可能 +2 分。
- 主要风险：
  - 单元测试环境（Node --test）没有 `AudioContext`，需要全程 window guard。
  - 程序合成音质差，可能被后续 reviewer 批为"刺耳"。
  - 改动会触及 `GameApp.js` 的生命周期，容易和其他 reviewer 的 plan 冲突。
  - 性能：长期运行的 OscillatorNode 在某些浏览器上有内存抖动。

### 方向 C: Settings-panel non-destructive fix — 让 Settings 调整不再重置世界

- 思路：reviewer 抱怨"Settings 面板一碰就重启世界，Vera 消失了"。查找 Settings 相关 `createInitialGameState` 调用点，
  把不影响 grid shape 的改动（doctrine、时间缩放、visual preset）改成 in-place mutation。
- 涉及文件：`src/ui/**`（需先定位 settings handler），`src/app/GameApp.js`
- scope：小-中（取决于现在 reset 是如何触发的）
- 预期收益：reviewer 抱怨"选 Worker-156 做替身"问题消除，但这只解一个次要痛点。
- 主要风险：如果 settings handler 的 reset 是 by-design（例如 terrain tuning 改了必须重建 grid），改动可能引入半破损状态。
  覆盖的主诉不如 A 广。

## 3. 选定方案

选 **方向 A（Narrative surfacing bundle）**，理由：

- **最切中 reviewer 的核心抱怨**："后端有数据，前端不讲给我听。"方向 A 正是补这一层翻译层。
- **scope 可控**：只改 UI 层 + 一处 MortalitySystem 的 log 写入，不触碰经济、ECS 顺序、AI pipeline。
- **对测试影响小**：现有 865 个测试里涉及 `displayName` 的只有一个文件（EntityFactory.js 自身），大部分 assert 的是 ID 前缀 `worker_`/`visitor_` 而不是 display name。
- **不违反 feature freeze**：没有新 mechanic，只是让已有的 telemetry 可见。
- **reviewer 自己给了量化预期**："仅此一步就能从 3 分涨到 5 分"——执行风险 vs 收益比最好。

方向 B 被放弃：autoplay policy、Node 测试环境 mock、跨浏览器兼容是 3 个独立的技术坑，和 feature freeze 原则下"polish only"的精神冲突（一段 synth loop 实际是新 subsystem）。
方向 C 被放弃：需要先复现 settings reset 的触发链，scope 不确定，主诉覆盖面窄。

## 4. Plan 步骤

- [ ] **Step 1**: `src/entities/EntityFactory.js:32` (`withLabel` function) — `edit` — 保留 `withLabel` 旧签名为后备，新增 `pickWorkerName(random)` / `pickVisitorName(random, kind)` / `pickAnimalName(random, kind)` 三个名字生成器。人名格式 `First Last`（两个固定池各 ~30 个条目，例如 first=["Kira","Halden","Vera","Bjorn","Aurora",...]，last=["Voss","Orrin","Thal","Brandt",...]），确定性基于传入 `random`。`displayName` 格式变成 `"Kira Voss #122"`（保留后缀 ID 便于 debug / 测试）。
  - 动物仍用 `Herbivore-123` 这种形式避免不必要的 diff。
- [ ] **Step 2**: `src/entities/EntityFactory.js:104` (`createWorker`) — `edit` — 把 `baseAgent(..., withLabel(id, "Worker"), random)` 改成 `baseAgent(..., pickWorkerName(random), random)`；同理 `createVisitor:143`（只给 SABOTEUR / TRADER 用 `pickVisitorName`）。
  - depends_on: Step 1
- [ ] **Step 3**: `src/simulation/lifecycle/MortalitySystem.js:196` (`recordDeath` function, 紧跟现有 `deathEvents.push(...)` 那一行) — `edit` — 在 push 到 `deathEvents` 的同时，另写一条人类可读的 narrative 字符串到 `state.gameplay.objectiveLog`：格式 `"[${nowSec.toFixed(1)}s] ${entity.displayName} died (${reason})${tileSuffix}"`，其中 tileSuffix 来自 `entity.deathContext.targetTile` 翻译为 `" near (ix,iz)"`。用 `objectiveLog.unshift` + `slice(0,24)` 保持和 ProgressionSystem 的 `logObjective` 一致的容量策略。加 dedupe guard：同 entityId 只写一次（利用 entity.deathRecorded 已有的 flag，确保只在 `!entity.deathRecorded` 分支内追加）。
  - depends_on: 无（独立于 Step 1-2；即便名字仍是 Worker-122，事件也能浮出）
- [ ] **Step 4**: `src/ui/panels/EntityFocusPanel.js:309` (`render` 方法，位于 `<!-- AI Agent Effect -->` 的 `<hr>` 之前) — `edit` — 新增一段 "Character" 区块，渲染：
  - `entity.traits.join(", ")`
  - `entity.mood / morale / social / rest`（4 个进度条样式的 `fmtNum(v,2)`）
  - `entity.relationships`：取值最大的前 3 条，格式 `"Halden Voss #155: +0.55"`（如果能从 `state.agents` 里用 id 反查 displayName 就用，否则直接打 ID）
  - `entity.memory.recentEvents` 的最后 3 条（如果为空，显示 `"(no recent memories)"`）
  用 `<details data-focus-key="focus:character" open>` 包裹，保留现有的折叠状态恢复机制。
  - depends_on: Step 1（确保 relationships 反查能拿到新 displayName）
- [ ] **Step 5**: `src/ui/panels/EventPanel.js:40` (`render` 方法) — `edit` — 在现有 "active events" 列表之后追加一段 "Recent Colony Events"，
  从 `this.state.gameplay.objectiveLog` 取前 6 条，倒序显示。这样玩家打开右侧的 "Event Queue" 卡片就能看到死亡/恢复/里程碑事件。保留 `this.lastHtml` dedupe 机制避免每帧重排 DOM。
  - depends_on: Step 3（objectiveLog 得先有内容可读）
- [ ] **Step 6**: `index.html:1067` (现有 `<summary>Event Queue</summary>` 行) — `edit` — 把 summary 文本改成 `"Events & Colony Log"` 以提示玩家这里现在也展示 log（不改 `data-panel-key`，避免破坏已有的 settings persist / collapse state）。
  - depends_on: Step 5
- [ ] **Step 7**: `test/` — `add` — 新建 `test/entity-names.test.js`：
  - 断言 `createWorker(0,0,seededRng)` 的 `displayName` 匹配 `/^[A-Z][a-z]+ [A-Z][a-z]+ #\d+$/`。
  - 断言同一 seed 的两次调用产出同样的名字（deterministic）。
  - 断言 30 个 worker 中至少有 8 个 distinct 名字（名字池 >= 20 保证多样性）。
  - depends_on: Step 1, Step 2
- [ ] **Step 8**: `test/` — `add` — 新建 `test/death-narrative-log.test.js`：
  - 构造一个最小 state，手动把一个 agent 的 `hp` 置 0，跑一次 `MortalitySystem.update(0.1, state)`。
  - 断言 `state.gameplay.objectiveLog.length > 0` 且 `objectiveLog[0]` 包含该 agent 的 displayName 和 `"died"`。
  - 断言重复调用 update（entity 已 dead）不会重复 push（利用 deathRecorded 的 dedupe）。
  - depends_on: Step 3

## 5. Risks

- **R1（低）**：显示名里有空格（"Kira Voss #122"），如果有 test 用 `displayName.split("_")` 做解析会挂。
  缓解：全仓 Grep `displayName.*split`；我目前没找到这样的代码。
- **R2（中）**：`relationships` 反查 displayName 要求该 worker 还活着，死者的 id 可能已从 `state.agents` 过滤。
  缓解：在 Step 4 里 fallback 到 `"<unknown>"` 或保留 id 直接打印。
- **R3（低）**：`objectiveLog` 从"永远空着"变成"每次死亡都写一条"，原本依赖"log 为空时显示 hint"的 UI 路径若存在可能误触。
  缓解：Grep `objectiveLog.length === 0` 检查（DeveloperPanel 里有类似 pattern，需确认行为不变）。
- **R4（中）**：`EventPanel.render` 现在读 `state.gameplay.objectiveLog`，需要确认 state 初始化路径上该字段不会是 `undefined`（EntityFactory.js:637 已经初始化为 `[]`，OK）。但新玩家打开 menu 阶段 state.gameplay 可能被跳过 → 加 `?? []` guard。
- **R5（低）**：`pickWorkerName` 如果姓名池 < 40 条，小样本里难免碰撞。重名不是 bug 但会降低叙事清晰度，合理控制池大小。
- **可能影响的现有测试**：
  - `test/death-condition.test.js`（任何 assert displayName 的分支）
  - `test/npcBrain` 类测试（可能 log-match displayName）
  - `test/mortality*.test.js`（如果存在）
  - `scripts/comprehensive-eval.mjs`（搜索 "Worker-" 看有没有硬编码 assert）
  上线前必须跑 `node --test test/*.test.js` 全量回归。

## 6. 验证方式

- **新增测试**：
  - `test/entity-names.test.js` 覆盖确定性命名 + 多样性。
  - `test/death-narrative-log.test.js` 覆盖死亡→objectiveLog pipeline + dedupe。
- **手动验证**：
  - 开启 `npx vite` → 打开 `http://localhost:5173` →
    1. 选 Broken Frontier → 看右下角 Entity Focus 面板顶部应显示 `"Kira Voss #122"` 而非 `"Worker-122"`。
    2. 打开 Entity Focus → 应看到新增的 "Character" 区块（traits/mood/relationships）。
    3. 等 60-120s（或加 stress workers 让饥荒加速）→ 右侧 "Events & Colony Log" 卡片应出现若干 `"Kira Voss died (starvation) near (45,33)"` 样式的 log，
       且顺序为最新在上。
    4. 反复打开关闭面板，确认 objectiveLog 条目不重复追加（dedupe）。
- **benchmark 回归**：
  `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365`
  DevIndex 不得低于当前基线的 95%（目前 v0.8.1 Phase 8 基线 DevIndex ≈ 44，底线 ≥ 41.8）。
  这个 plan 只改 UI 与 log 写入，理论上不影响 sim；跌出阈值意味着 Step 3 引入了意外副作用（比如 unshift 数组无界增长）——必须排查。

## 7. UNREPRODUCIBLE 标记（如适用）

未使用 Playwright 复现；reviewer 的 finding 完全可通过阅读源码确证：

- `EntityFactory.js:32 withLabel` 直接写死 `${fallback}-${seq}`，reviewer 的 "Worker-122" 观察 100% 真实。
- `EventPanel.js:43` 只枚举 `state.events.active`，对死亡事件完全盲视，reviewer 的 "No event/diagnostic logs yet" 感受吻合。
- `MortalitySystem.js:196` 把死亡写到 `state.debug.eventTrace`，但该 trace 只在 DeveloperPanel 里被读（reviewer 明确说"我是点进 Debug > World State 里发现 Deaths 3 这个数字变了，才知道发生了什么"）——与代码行为一致。
- `ProgressionSystem.js:199 logObjective` 仅被 `maybeTriggerRecovery` 调用，所以 `objectiveLog` 只有 recovery 一条——解释了为什么 "Objective / Event Log 面板常年只有 'Emergency relief arrived'"。
- 音频缺失已被 reviewer 亲自验证（`document.querySelectorAll('audio').length === 0`），本 plan 未选此方向，不在此复现。

因此所有核心 findings 均 REPRODUCIBLE（通过静态分析），无需标记 UNREPRODUCIBLE。
