---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round0/Feedbacks/player-01-rimworld-veteran.md
round: 0
date: 2026-04-22
build_commit: a8dd845
priority: P1
estimated_scope:
  files_touched: 4
  loc_delta: ~120
  new_tests: 1
  wall_clock: 60
conflicts_with: []
---

## 1. 核心问题

老赵给出 3.5/10，敬意主要落在 debug UI，失望集中在**"游戏不说话"**。把散落的十余条 finding 归并后只剩三个根本问题：

1. **叙事失声 (P1)** — "Objective / Event Log" dock 面板从头到尾显示
   `No event/diagnostic logs yet.`，而 `GameEventBus` (`state.events.log`) 其实
   在每次饿死 / 补给 / 火灾 / 交易 / 破坏 / 天气变化时都写入了结构化事件
   （`src/simulation/meta/GameEventBus.js`）。DeveloperPanel `#renderEventLog`
   (`src/ui/panels/DeveloperPanel.js:324-374`) **只读 `objectiveLog` / `debug.eventTrace` /
   `metrics.warnings`，完全没有订阅 `state.events.log`**。这是一次 "UI layer 没订阅 event bus"
   的 desync，症状就是玩家看到空日志。

2. **工人无人格 (P2)** — 每个工人 displayName 形如 `Worker-80`（`EntityFactory.js:32/111`
   的 `withLabel`）。老赵明确点名"起码给个名字 + 死亡通告"。GameEventBus 已经在发
   `WORKER_STARVED` 事件并带 `entityName`——只要上游 displayName 更人性化，下游
   日志立刻就有"Aldric 饿死了"效果。

3. **点击建造无前置反馈 (P2)** — `Insufficient resources` 是事后红字；没有 hover 预览显示
   "此地需要 5 wood / 你有 3"。需要的 plumbing 在 `evaluateBuildPreview` 里已经全有
   （reason="insufficientResource"），只是 UI 没在 hover 时消费它。

本 plan **主推问题 1** —— ROI 最高、动的代码最少、直接打到老赵最痛的
"Event log 空了三局"这一点。问题 2、3 在 Suggestions 里保留作为备选。

## 2. Suggestions（可行方向）

### 方向 A: 把 `state.events.log` 接到 Objective / Event Log dock 面板

- **思路**：`DeveloperPanel.#renderEventLog` 已经聚合了 objectiveLog / eventTrace /
  warnings，再加一段读取 `state.events.log` 最后 N 条，按类型格式化（饿死、建造、
  火灾、交易、破坏等），就能让老赵看到"Aldric-80 starved at 114s"这样的行。
- **涉及文件**：
  - `src/ui/panels/DeveloperPanel.js`（加一个 `formatLoggedEvent` 辅助函数，
    `#renderEventLog` 里拼接）
  - `src/simulation/meta/GameEventBus.js`（`EVENT_TYPES` 已齐备，不必改）
  - `test/event-log-rendering.test.js`（新增：验证 log 能渲染成人可读文本）
- **scope**：小（<120 LOC；纯 UI，不碰 sim tick）
- **预期收益**：
  - 老赵反馈 Top-5 的 #2（Event Log 必须填充）直接关闭
  - 间接缓解 #3（死亡无讣告）——因为 `WORKER_STARVED` 的 payload 已带 entityName
  - 不引入新机制，只"露出"既有数据，完全符合 feature freeze
- **主要风险**：
  - dock 面板在 `#isPanelInteracting` 窗口内（玩家正在滚动）不刷新，如果
    新增输出频率过高可能让滚动回弹看着不流畅。通过只截尾 12 条并附时间戳可缓解。
  - `state.events.log` 是 ring-buffer（MAX_EVENTS=200），UI 要处理空数组和
    undefined 兼容（`initEventBus` 可能还没在某些 init 路径里被调用——
    需要防御性 `?.`）。

### 方向 B: 给工人起真正的名字（Aldric the Woodcutter 式）

- **思路**：在 `createWorker` 时用 seeded RNG 从名字池抽 firstName；displayName
  改成 `${firstName} the ${ROLE_LABEL[role]}`；死亡 / 饥饿事件现有 payload
  里的 `entityName` 自动变得有温度。
- **涉及文件**：
  - `src/entities/EntityFactory.js:104` `createWorker`（替换 `withLabel` 调用）
  - `src/config/constants.js`（新增 `WORKER_NAME_POOL` 或专门一个 `names.js`）
  - `src/entities/EntityFactory.js:32` `withLabel`（保留兜底）
  - `test/worker-naming.test.js`
- **scope**：小（<80 LOC）
- **预期收益**：
  - 老赵 #3（工人个体化）直接关闭；EntityFocus 面板立刻变亲切
  - 死亡事件日志文本质量提升（配合方向 A 更佳）
- **主要风险**：
  - 现有 107+ 测试如果有硬编码 `displayName` 正则（如 `Worker-80`）会红；
    Grep `Worker-\d+` 在 test 里——预计少量，但须核对。
  - `nextId` 是全局递增的，名字分配必须也用 seeded RNG，否则 determinism
    测试（`test/rng-*.test.js`）可能回归。

### 方向 C: Hover 时在 BuildToolbar 预览面板展示"资源够不够"，insufficient 时禁用点击

- **思路**：`getBuildToolPanelState` 已经返回 cost，但没把"当前资源 vs cost"
  显示出来。在 `BuildToolbar.sync()` 里给 `buildToolCostVal` 加红色 data 属性，
  并把 `evaluateBuildPreview` 的 reason 透给 SceneRenderer 的 onPointerMove，
  让 hoverTile 上显示 cost diff。
- **涉及文件**：
  - `src/ui/tools/BuildToolbar.js`（`sync()` 末尾加 cost-vs-resource 高亮）
  - `src/simulation/construction/BuildAdvisor.js:getBuildToolPanelState`
    （返回 `affordable: boolean`）
  - `src/render/SceneRenderer.js:#onPointerDown`（insufficient 时静默 return，
    不改 actionMessage）
- **scope**：中
- **预期收益**：
  - 老赵 #4（Build 人体工学）部分关闭——"连点 5 次 Farm 没钱"问题消失
- **主要风险**：
  - SceneRenderer 的 hover 逻辑每帧跑，新增 evaluateBuildPreview 调用要
    rate-limit，否则性能回归
  - 改了点击行为的"reason → actionMessage"链路，`test/ui-layout.test.js`
    和任何断言 actionMessage 含 "Insufficient" 的测试会红（至少 build-system
    相关 test 要看一眼）

## 3. 选定方案

选 **方向 A**，理由：

1. **ROI 最高**：改 1-2 个函数、加 1 个测试文件，就直接消除老赵感知最强的
   "empty log" 槽点，并且顺带给问题 3（死亡无讣告）一半解决（因为
   `WORKER_STARVED` 已经带 entityName）。
2. **P1 的问题用小 scope 方案**（enhancer.md §6 选择标准）：B 和 C 要动
   EntityFactory / SceneRenderer 核心路径，回归面积大；A 只动 UI 面板
   `#renderEventLog` 一个方法和一个 ring-buffer 读取。
3. **零机制变更**：GameEventBus + 事件类型 + 触发点**都早就存在**，方向 A
   只"打开阀门"不"加新管道"，**完全符合 HW06 feature freeze**。
4. **对现有测试破坏最小**：`grep -r "No event/diagnostic logs yet"` 只在
   `DeveloperPanel.js` 本体出现，没有测试断言它；`state.events.log` 已经被
   `GameEventBus` 的单元测试覆盖，只是没人 render 它。
5. **为后续方向 B / C 铺路**：方向 A 落地后，如果后续 round 再选 B，工人改名
   立即在 log 面板展现效果；如果选 C，hover 预览里也可以复用同一段
   event-formatting 代码。

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/panels/DeveloperPanel.js:1` — `edit` —
  在文件顶部现有 `import ... WorldExplain` 下新增一行：
  `import { EVENT_TYPES } from "../../simulation/meta/GameEventBus.js";`
  （后续 Step 3 会用到 EVENT_TYPES 做类型分派）

- [ ] **Step 2**: `src/ui/panels/DeveloperPanel.js:#renderEventLog` — `add` —
  在该方法顶部（第 325 行 `if (!this.eventVal) return;` 之后）读取
  `const gameEventLog = this.state.events?.log ?? [];`，并且在 `lines` 数组
  组装阶段，在 `objectiveLog` 段之后、`Active Events:` 段之前，加一个
  `if (gameEventLog.length > 0) { lines.push("Colony Log:"); ... }` 块：
  取末尾 12 条，反序（新的在上），每条调用一个新的 private `#formatGameEvent(event)`
  格式化为一行文本，例：`[113.4s] ⚰ Aldric-80 starved (hp=0)`。
  - depends_on: Step 1

- [ ] **Step 3**: `src/ui/panels/DeveloperPanel.js` — `add` — 在
  `#renderLogicConsistency` 方法后（约第 414 行）新增 private 方法
  `#formatGameEvent(event)`。实现 switch（或 lookup map）覆盖至少：
  `WORKER_STARVED` → `"⚰ ${name} starved"`；
  `WORKER_DIED` → `"✝ ${name} died"`；
  `PREDATOR_ATTACK` → `"🐺 ${attackerName} attacked ${targetName} for ${damage} dmg"`；
  `WAREHOUSE_FIRE` → `"🔥 Warehouse fire at (${ix},${iz}) — food=-${foodLoss}"`;
  `VERMIN_SWARM` → `"🐀 Vermin swarm at (${ix},${iz}) — food=-${foodLoss}"`;
  `TRADE_COMPLETED` → `"🤝 Trade completed (+${goods})"`;
  `WEATHER_CHANGED` → `"☁ ${from} → ${to} (${duration}s)"`;
  `BUILDING_PLACED` / `BUILDING_DESTROYED` → 静默（太嘈杂，跳过 return null）；
  其余类型 fallback `"• ${type}"`. 统一前缀时间戳：
  `` `[${Number(event.t ?? 0).toFixed(1)}s] ${...}` ``.
  注意：返回 null 的条目在 Step 2 的 map 里过滤掉。
  **约束**：禁止 emoji（项目 CLAUDE.md 规定只在用户明确要求时用 emoji）；
  改用 ASCII 记号 `[DEATH]` `[HUNGER]` `[RAID]` `[FIRE]` `[VERMIN]` `[TRADE]`
  `[WEATHER]` 等。
  - depends_on: Step 2

- [ ] **Step 4**: `src/ui/panels/DeveloperPanel.js:#renderEventLog` — `edit` —
  把现有结尾条件
  `lines.length > 0 ? lines.join("\n") : "No event/diagnostic logs yet."`
  的兜底文案改为
  `"Colony log is quiet. Events appear here when workers die, fires break out, traders arrive, or weather shifts."`。
  这样空状态也在**告诉玩家这个面板是用来看什么的**，解决老赵"一条都没有"的困惑。
  - depends_on: Step 3

- [ ] **Step 5**: `test/event-log-rendering.test.js` — `add` —
  新增单元测试（Node built-in runner）。构造最小 state：
  `{ events: { log: [...] }, gameplay: { objectiveLog: [] }, debug: { eventTrace: [], presetComparison: [] }, metrics: { warnings: [] } }`，
  手动 push 3 条事件（WORKER_STARVED、WAREHOUSE_FIRE、TRADE_COMPLETED），
  用 jsdom-free 方式直接 import `#formatGameEvent` 的行为（需要把它导出或用
  `__test__` 导出）。断言：输出文本包含 `[HUNGER]` + entityName，不包含
  `"No event/diagnostic logs yet."`。若发现 class private 方法不好测，
  改为 export 一个 `formatGameEventForLog(event)` pure function 并让
  `#formatGameEvent` 内部委托。
  - depends_on: Step 3

- [ ] **Step 6**: `src/ui/panels/DeveloperPanel.js` — `edit` —
  若 Step 5 发现 private 方法难测，把 `#formatGameEvent` 抽成模块顶层
  `export function formatGameEventForLog(event)`，DeveloperPanel 里调用它。
  这样也避免把 EVENT_TYPES import 放进 class 里（class static 引用繁琐）。
  - depends_on: Step 5

- [ ] **Step 7**: `src/ui/panels/DeveloperPanel.js:#renderEventLog` — `edit` —
  在新增的 "Colony Log" 段顶部加一行 summary：
  `lines.push(\`Colony Log (${gameEventLog.length} total, showing last ${shown}):\`);`
  让老赵一眼看到"哦这是 9 条里最后 6 条"。
  - depends_on: Step 2

- [ ] **Step 8**: `CHANGELOG.md` — `edit` —
  在当前 unreleased 节下 "UI / UX" 类别追加一条：
  `- Expose GameEventBus log in Objective / Event Log dock panel (v0.8.1 post-release polish, addresses "empty event log" feedback from P01 rimworld-veteran playtest).`
  这是项目 CLAUDE.md 明确要求的 commit 协议。
  - depends_on: Step 7

## 5. Risks

- **UI 刷新频率**：`#setPanelText` 里有 `#isPanelInteracting` 防抖，但新增 log 行
  每几秒都在变，可能让 pre text 频繁 diff。影响：若用户在滚 panel 滚到底但有
  new line 到来，scrollTop 校正可能让视图瞬跳。缓解：只展示最后 12 条；该
  类型固定行数 → `scrollHeight` 稳定。
- **ring-buffer 截断边界**：GameEventBus MAX_EVENTS=200；长局游戏老事件会被
  截断。该面板显示"(x total, showing last n)"即可，不会有错觉。
- **子 API 漏初始化**：某些测试环境走最简 state，不一定有 `state.events.log`。
  Step 2 用 `?.` + `?? []` 兼容。
- **静默跳过 BUILDING_PLACED / BUILDING_DESTROYED**：这俩每建造一次就一行，
  会洗掉真正的死亡/战斗信息。已选择隐藏；若未来需要可开 advanced toggle。
- **可能影响的现有测试**：
  - `test/ui-layout.test.js`（断言 `devEventTraceVal` 存在——不影响，只扩内容）
  - `test/progression-system.test.js` / `test/demo-recycling.test.js`（提到
    events.log——需要 run 一遍确认 mock state 不因 panel-level 新读路径而
    间接破坏，但 panel 是纯 UI，sim 不 touch，概率低）
  - 无测试断言字符串 "No event/diagnostic logs yet."（已 grep 确认仅出现在
    `DeveloperPanel.js:372` 本体，Step 4 替换不回归任何测试）

## 6. 验证方式

- **新增测试**：`test/event-log-rendering.test.js` 覆盖三个场景：
  1) 空 log → 文本等于新的兜底文案（不含 "No event/diagnostic"）
  2) 混合类型 log（HUNGER + FIRE + TRADE）→ 文本含 3 行格式化输出且
     `[HUNGER]` 出现在第一条（最新在上）
  3) 超长 log（30 条）→ 仅渲染 12 条 + 含 "30 total, showing last 12" 标题
- **手动验证**：
  1. `npx vite`，浏览器打开 `http://localhost:5173`
  2. 不动任何按钮，等 90 秒
  3. 打开底部 dock 面板 "Objective / Event Log"
  4. **期望看到**：至少若干条形如 `[123.4s] [HUNGER] Worker-80 starved`
     或 `[WEATHER] clear -> storm (85s)` 的行；**不应再看到** "No event/diagnostic logs yet."
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42
  --template temperate_plains` —— **DevIndex 不得低于 41.8**（当前 v0.8.1
  在 44，阈值留 -5% 约 41.8）。这是纯 UI 改动，理论上 sim 不动；若 DevIndex
  变了说明 panel render 不经意地碰了 sim state（regression）。
- **全量测试**：`node --test test/*.test.js` —— 867/865 通过数不回退
  （2 个 pre-existing skip 保持）。

## 7. UNREPRODUCIBLE 标记

不适用。**Feedback 里的 "Objective / Event Log: No event/diagnostic logs yet."**
通过静态代码核对直接证实：`src/ui/panels/DeveloperPanel.js:#renderEventLog`
（第 324-374 行）的 lines 数组组装里**完全没有读取 `state.events.log`**，
仅读 `state.gameplay.objectiveLog` / `state.debug.eventTrace` / `state.metrics.warnings`
/ `state.debug.presetComparison`。三者在 early-game 都是空或接近空（
`objectiveLog: []` 见 `EntityFactory.js:637`；`eventTrace` 只在
`state.debug.eventTrace` flag 打开时才被 WorldEventSystem 填充），
所以老赵必然看到空面板。**无需 Playwright 复现**——纯代码层面 bug，
grep + 读文件足以证实。
