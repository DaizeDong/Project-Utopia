---
reviewer_id: 02d-roleplayer
feedback_source: Round2/Feedbacks/02d-roleplayer.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P1
estimated_scope:
  files_touched: 4
  loc_delta: ~140
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

Round-1 把 event-trace 接到了顶栏 `#storytellerBeat`（narrative ticker），Round-0 把
Character block 接进了 Entity Focus。骨架都在，但 roleplayer 这一轮仍然给 3/10，
症结收敛到 3 条：

1. **Recent Memory 永远是空的**（P1-7 主症）：`entity.memory.recentEvents` 在 worker
   身上**没有任何写入点**——Grep 全仓库，只有 `AnimalAISystem.js:702` 和
   `WorldEventSystem.js:540`（分别写入 prey / HERBIVORE），colonist 的 memory 数组
   从创建到死亡都保持空数组。于是 EntityFocusPanel 里的"(no recent memories)"成了
   roleplayer 口中"整个叙事层的致命伤"。**关键是系统已经知道"Ren-5 死了"、
   知道"Tam-9 和 Ren-5 关系 +0.15"，但从不把这两点连起来。**

2. **Relationships 是裸数字**（P1-7 副症）：EntityFocusPanel 第 378-384 行把
   `-1..1` 的 opinion 直接格式化成 `+0.25`。"+0.25 是什么？朋友？师徒？爱人？
   不知道。" 这是一行 `if` 能解决的语义化问题。

3. **Fallback 文本仍是策略术语**（P0-6）：`PromptBuilder.describeWorkerFocus` 仍
   硬编码返回 `"route repair and depot relief"` / `"frontier buildout"` /
   `"stabilization"` 等 8 个短语，Round-1 的 `humaniseSummary` 只有 6 条规则
   且没覆盖 focus 字符串——roleplayer 抱怨"DIRECTOR 说的永远是 'route repair
   and depot relief' 这类术语，不是故事语言"。这些 focus 会流向 storytellerStrip、
   EntityFocusPanel 的 "Policy Focus" 行、AI Trace Narrative，是玩家最高频看到
   的"导演嗓音"。

P1-7 与 P0-6 同根：**游戏有"素材"却没有"讲述"**——数据模型齐全，UI 连线/文本渲染
一步之差。HW06 freeze 边界明确只允许用现有字段做 UI 连线 + 文本改写，不允许加
mood modifier / grief 事件 / trait-driven 绰号生成。本 plan 严格落在此边界内。

## 2. Suggestions（可行方向）

### 方向 A: Memory 收录器（passive listener）+ Relationships 语义化 + fallback focus 改写

- 思路：三项 polish 合成一个原子 plan：
  (A1) 新增 `src/simulation/lifecycle/MemoryRecorder.js` 里一个 helper
      `pushWorkerMemory(worker, label, nowSec)`，在 `MortalitySystem.recordDeath`
      里对所有**活着的 worker**（即 `state.agents` 过滤 alive + type==WORKER + id !== 死者）
      筛 Top-3 relationship 对象 OR 同屏幕范围内 (曼哈顿 ≤ 12) 的同伴，写入 label
      `"Friend <name> died (starvation)"`。同理在 `WorldEventSystem` 的
      `WAREHOUSE_FIRE` / `VERMIN_SWARM` 两处为所有 alive worker 写入 `"Warehouse
      fire nearby"` / `"Vermin swarm hit the storeroom"` 各一条。capacity = last 6
      条（与 animal memory 一致）。
  (A2) `src/ui/panels/EntityFocusPanel.js:378-384` — 把 opinion 数值映射成
      `"Close friend"` (≥ 0.45) / `"Friend"` (0.15..0.45) / `"Acquaintance"`
      (−0.15..0.15) / `"Strained"` (−0.45..−0.15) / `"Rival"` (≤ −0.45)，
      显示格式改为 `"${displayName}: Friend (+0.25)"`，保留数字做 power-user
      reference 但把语义前置。
  (A3) `src/simulation/ai/llm/PromptBuilder.js:85-102` — 把
      `describeWorkerFocus` / `describeTraderFocus` / `describeSaboteurFocus` 的
      返回字面量换成更"故事语气"的短语（例如 `"rebuild the broken lumber lane"`
      替 `"route repair and depot relief"`，`"push the frontier outward"` 替
      `"frontier buildout"`）；`storytellerStrip.js:144-157` 的 `humaniseSummary`
      规则表扩到 ~12 条，覆盖新增 focus + 现有 `stockpile throughput` 等 8 个短语。
- 涉及文件：`src/simulation/lifecycle/MortalitySystem.js`、
  `src/world/events/WorldEventSystem.js`、`src/ui/panels/EntityFocusPanel.js`、
  `src/simulation/ai/llm/PromptBuilder.js`、`src/ui/hud/storytellerStrip.js`、
  `test/memory-recorder.test.js`（新增）、`test/entity-focus-relationships.test.js`（新增）。
- scope：中
- 预期收益：三项合击正中 roleplayer 两个明确优先级（P1-7 + P0-6）。点开任一工人
  在 Ren-5 死后 ≤ 2s 就能看到 "Friend Ren-5 died (starvation)" 出现在 Recent Memory；
  Relationships 读作 "Ren-5: Friend (+0.15)" 而非 "+0.15"；DIRECTOR 条不再吐
  `"route repair and depot relief"`。
- 主要风险：
  - MemoryRecorder 对所有 alive worker 循环写入——worst-case pop=40 且同 tick 3 人
    死，单 tick 写 120 次 unshift + slice。profile 上 negligible（远小于
    AnimalAISystem 的 per-pair 循环）。
  - 若 Top-3 relationship 全是已死者，保底用"邻近同事"规则避免空输出。
  - PromptBuilder focus 字符串被 `test/world-explain.test.js` 和
    `test/ai-prompt-builder.*.test.js` 等多个测试 literal 匹配——修改前必须 Grep
    全部引用并同步 update 测试 fixture。

### 方向 B: 只做 Relationships 语义化 + fallback 文本（最小 scope）

- 思路：放弃 Memory 写入（认为"数据流层改动风险太大"），只做 A2 + A3。
- 涉及文件：`src/ui/panels/EntityFocusPanel.js`、`src/simulation/ai/llm/PromptBuilder.js`、
  `src/ui/hud/storytellerStrip.js`。
- scope：小
- 预期收益：命中 P0-6 + P1-7 语义半块；但 Recent Memory 仍然永远空——roleplayer
  原文 "这是整个游戏叙事层的致命伤" 原话未解。
- 主要风险：方案看起来"摸鱼"——3/10 扣分最大的那条没处理，Round-3 roleplayer
  还会给同分。

### 方向 C: 只写 Memory（不动 fallback 文本 / 关系语义）

- 思路：最窄切片，只改 MortalitySystem + WorldEventSystem + 新测试。
- 涉及文件：`src/simulation/lifecycle/MortalitySystem.js`、
  `src/world/events/WorldEventSystem.js`、`test/memory-recorder.test.js`。
- scope：小
- 预期收益：Recent Memory 填起来了，但 DIRECTOR 继续说 "route repair and depot
  relief"（P0-6 是 7 人提及的高频痛点，没处理会很扣分），关系仍是 "+0.25"。
- 主要风险：跟 02b-casual / 01e-innovation 可能的 "humanize fallback text" plan
  产生冲突（他们大概率会改 `humaniseSummary`）；我们放弃这一块等于放弃 P0-6。

## 3. 选定方案

选 **方向 A（三项合击）**，理由：

- **命中 Runtime Context 显式焦点**：`Stage A 焦点：P1-7（Recent Memory 把已有
  死亡/出生/灾害事件写进去；Relationships 数值语义化展示）+ P0-6（fallback 文本
  human-ify，不改架构）`——prompt 里两项并列，方向 B/C 各砍一半不合规。
- **scope 仍可控**：4 个文件 + 2 个新测试 = ~140 LOC，比 Round-1 同份 plan
  （方向 A 的 storyteller narrative ticker）大一点但同数量级。
- **不跨 freeze 边界**：
  - 只读/只写已有字段 `entity.memory.recentEvents` 和 `entity.relationships`，
    **不新增** mood modifier / grief event / trait-driven 绰号。
  - 不改 Score 公式、不改胜利条件、不新增建筑/地形。
  - fallback focus 是纯字符串替换，架构不动。
- **现有测试可控**：memory 数组目前是 "created but never written"，现有断言全部
  是"长度 ≥ 0" 或"元素存在性"——新增 unshift 不会破坏任何既有 assertion（grep 了
  `memory.recentEvents` 下所有 test：5 个文件均为读取 animal.memory，worker
  memory 只在 EntityFactory 测试里检查初始值 `[]`，我们不改 EntityFactory）。
- **可冲突 plan 隔离**：02e-indie-critic 可能扩 `humaniseSummary` 规则表
  （D4 arbitration），本 plan 只改 focus **字面量源头**（PromptBuilder）+ 扩
  `humaniseSummary` 一张小表。如 02e 已改同一张表则 coder 合并一次 commit 即可，
  无需互锁（conflicts_with 留空）。

## 4. Plan 步骤

- [ ] Step 1: `src/simulation/lifecycle/MortalitySystem.js:190-220` (`recordDeath`) —
  `edit` — 在函数末尾（`entity.deathRecorded = true;` 之前）为 WORKER/VISITOR
  类型的死者调用新 helper `recordDeathIntoWitnessMemory(state, entity, nowSec)`。
  该 helper 选出最多 3 个 "witness" worker：优先 `entity.relationships` 里
  opinion 绝对值 Top-3 且对象仍 alive 的 worker；若关系表为空或全已死，退化为
  曼哈顿距离 ≤ 12 且 alive 的 ≤ 3 个 worker。为每个 witness `unshift` 一条
  label（见 Step 3），再 `slice(0, 6)` 保持容量。

- [ ] Step 2: `src/simulation/lifecycle/MortalitySystem.js` (top of file) —
  `add` — 新增内部 helper `recordDeathIntoWitnessMemory(state, deceased, nowSec)`
  实现 Step 1 的选人 + 写入逻辑。复用已有 `Math.abs(a.x - b.x) + Math.abs(a.z - b.z)`
  距离公式（或直接用 `worldToTile` 后曼哈顿）。Label 格式：
  `"[${nowSec.toFixed(0)}s] ${relLabel} ${deceased.displayName} died (${reason})"`
  其中 `relLabel` 由 opinion 值通过 Step 4 的同一张语义表映射（Close friend /
  Friend / Acquaintance / Strained / Rival）；若 witness 没有 opinion 记录则
  用 `"Colleague"`。
  - depends_on: Step 1

- [ ] Step 3: `src/world/events/WorldEventSystem.js:622-646`
  （`applyWarehouseDensityRisk` 的 FIRE / VERMIN emitEvent 分支） — `edit` —
  在 `emitEvent(state, EVENT_TYPES.WAREHOUSE_FIRE, ...)` 紧随其后，加一段
  `for (const a of state.agents)` 循环：只要 `a.alive !== false && a.type === ENTITY_TYPE.WORKER && a.memory`，
  `a.memory.recentEvents.unshift("[${nowSec}s] Warehouse fire at (ix,iz)")`
  并 `.slice(0, 6)`。VERMIN_SWARM 同理，label 改成 "Vermin swarm gnawed the stores"。
  引入 `ENTITY_TYPE` / `nowSec` = `state.metrics.timeSec` 已在当前作用域可见。

- [ ] Step 4: `src/ui/panels/EntityFocusPanel.js:378-396` — `edit` — 在
  `topRelations` 构造处替换 map 函数：把 `v.toFixed(2)` 改成
  `${relationLabel(v)} (${v >= 0 ? "+" : ""}${fmtNum(v, 2)})` 的组合；
  `relationLabel` 是本文件顶部新增的纯函数（Step 5）。显示行改为
  `"${displayName}: ${label} (${sign}${num})"`。保留原 fmtNum 引用以复用精度。
  - depends_on: Step 5

- [ ] Step 5: `src/ui/panels/EntityFocusPanel.js` (top, after `vecFmt`) —
  `add` — 新增纯函数 `function relationLabel(opinion)`，阈值按注释档位：
  `≥ 0.45 → "Close friend"`；`≥ 0.15 → "Friend"`；`> −0.15 → "Acquaintance"`；
  `> −0.45 → "Strained"`；`≤ −0.45 → "Rival"`。函数导出到模块外部（`export`），
  这样 MortalitySystem Step 2 的 helper 可 import 复用——注意：reviewer prompt
  禁止加新 system，但导入一个 pure helper 不属于新架构，属于 DRY。若 coder 嫌
  跨 layer import 不干净，允许在 MortalitySystem 里内联同一张阈值表（保持阈值
  字面量与 EntityFocusPanel 完全一致）。

- [ ] Step 6: `src/simulation/ai/llm/PromptBuilder.js:85-116`
  （`describeWorkerFocus` / `describeTraderFocus` / `describeSaboteurFocus`） —
  `edit` — 替换返回字面量：
  - `"route repair and depot relief"` → `"rebuild the broken supply lane"`
  - `"cargo relief"` → `"clear the stalled cargo"`
  - `"stockpile throughput"` → `"keep the larder filling"`
  - `"safe frontier throughput"` → `"work the safe edge of the frontier"`
  - `"frontier buildout"` → `"push the frontier outward"`
  - `"forward depot trade"` → `"run trade to the forward depot"`
  - `"defended warehouse lanes"` → `"hug the warehouse lanes"`
  - `"warehouse circulation"` → `"keep goods moving between warehouses"`
  - `"soft frontier corridor hits"` → `"strike a soft frontier corridor"`
  - `"depot disruption"` → `"disrupt a frontier depot"`
  - `"economic harassment"` → `"harass the supply chain"`
  Line 618 `"stabilization"` → `"let the colony breathe"`。
  所有改动是 **字符串层面** 替换，返回类型不变。

- [ ] Step 7: `src/ui/hud/storytellerStrip.js:144-157`
  （`humaniseSummary` 规则表） — `edit` — 把现有 6 条扩到 ~12 条以覆盖 Step 6
  新增短语 + 现有 PromptBuilder 短语。新增规则示例：
  - `[/rebuild the broken supply lane/gi, "reconnect the broken supply lane so haulers can reach the east depot again"]`
  - `[/push the frontier outward/gi, "push the frontier outward while keeping the rear supplied"]`
  - `[/let the colony breathe/gi, "let the colony breathe while routes settle"]`
  - `[/hunger and carried cargo/gi, "empty bellies and full backpacks"]`
  保持"未匹配直通"语义，避免 i18n bit-rot。
  - depends_on: Step 6

- [ ] Step 8: `test/memory-recorder.test.js` — `add` — 新建测试文件，3 条用例：
  (a) 构造 2 个 worker（A 与 B），`A.relationships[B.id] = 0.3`，B.alive=true；
      调用 MortalitySystem 的 update 让 A 因 hunger 饿死；断言
      `B.memory.recentEvents[0]` 包含 `"Friend"` 和 `A.displayName` 和 `"died"`。
  (b) 构造 3 个 worker（无任何关系）靠得近（曼哈顿 5）；A 死亡后 B、C 的
      memory 长度都 ≥ 1 且 label 含 `"Colleague"`。
  (c) 触发 WAREHOUSE_FIRE（直接 emitEvent + 走 applyWarehouseDensityRisk 或
      mock path），断言每个 alive worker 的 `memory.recentEvents[0]` 含
      `"Warehouse fire"`；验证 capacity 上限——连续触发 7 次后 `length === 6`。

- [ ] Step 9: `test/entity-focus-relationships.test.js` — `add` — 2 条用例：
  (a) opinion=0.5 → label "Close friend"；opinion=0.2 → "Friend"；
      opinion=0.0 → "Acquaintance"；opinion=-0.2 → "Strained"；opinion=-0.6 → "Rival"。
  (b) 渲染结果含 `displayName + ": Friend (+0.25)"` 完整串（直接调用 import 的
      `relationLabel` + 组装字符串；无需 DOM）。

- [ ] Step 10: `test/hud-storyteller.test.js` + `test/storyteller-strip.test.js` —
  `edit` — 现有断言里硬编码的 `"frontier buildout"` / `"stabilization"` /
  `"route repair and depot relief"` 字面量若仍出现在 fixture 中（它们模拟 data
  而非 PromptBuilder 产出，一般不受 Step 6 影响），保持不变即可；但需要 sweep
  `test/world-explain.test.js` 看是否 assert PromptBuilder 的返回字面量——若有
  则 update 到新短语。
  - depends_on: Step 6

- [ ] Step 11: `CHANGELOG.md` (Unreleased · v0.8.2 段, New Features / UI Polish) —
  `edit` — 新增一条：
  `Round 2 02d-roleplayer — Recent Memory now records Friend-of-X death, warehouse
  fire, and vermin swarm events into every living worker's memory; EntityFocusPanel
  labels relationship opinions as Close friend / Friend / Acquaintance / Strained /
  Rival (numeric value shown in parentheses); PromptBuilder fallback focus copy
  rewritten from strategy-jargon to narrative voice ("push the frontier outward"
  replaces "frontier buildout", etc.), closing the "silent director" gap from
  Round 1 playtest.`
  - depends_on: Step 8, Step 9

## 5. Risks

- **Memory 写入性能**：worst-case pop=40、同 tick 3 人死 → 3 × (Top-3 select +
  unshift+slice) = 9 次；Warehouse fire 一 tick 最多触发 hotWarehouses.length
  个事件（通常 ≤ 3），每次对 ~40 workers 写一条 = 120 unshift。与 AnimalAISystem
  的 per-pair 循环同数量级，profile 可忽略。
- **快照反序列化**：`EntityFactory.js:150` 的 `memory: { recentEvents: [], dangerTiles: [] }`
  已经是 worker 默认字段，写入 string label 不会破坏 `snapshot-service.test.js`
  的 round-trip（它只断言 shape 不断言内容）。若 coder 选择加 `tag` / `simSec`
  等结构化字段，要同步改 snapshot normalize 列表。
- **PromptBuilder literal 替换影响面**：Grep 确认仅有 `storytellerStrip.js`
  解析 focus 文本（humaniseSummary 用正则 match）+ 测试文件硬编码。没有游戏逻辑
  基于 focus === "frontier buildout" 做分支判断（已确认 `ColonyDirectorSystem`
  / `AgentDirectorSystem` 读取 `policy.intentWeights`，不读 focus 字符串）。
- **DIRECTOR 文本抖动**：新短语更长，`#storytellerStripSummary` 可能在窄屏
  （< 1280px）溢出。若发生，复用 Round-1 加的 `NARRATIVE_BEAT_MAX_LEN = 140`
  字符截断策略即可。
- **可能影响的现有测试**：
  - `test/world-explain.test.js`（grep 确认引用 "frontier buildout" / "route repair"）—
    Step 10 已列入更新范围。
  - `test/hud-storyteller.test.js` + `test/storyteller-strip.test.js` — fixture
    里的 focus 是手写 mock，与 PromptBuilder 字面量无依赖。
  - `test/entity-factory.test.js` — 不涉及 memory.recentEvents 的内容断言。
  - `test/mortality-system.test.js` — 需要新增一条 "memory written" 断言或
    保持纯死亡计数断言不变（Step 8 用新文件独立覆盖，避免污染现有 brittle 测试）。

## 6. 验证方式

- **新增测试**：
  - `test/memory-recorder.test.js` 覆盖 (a) 关系图 Top-3 选人、(b) 邻近退化、
    (c) 灾害事件写入 + capacity 上限；运行 `node --test test/memory-recorder.test.js`。
  - `test/entity-focus-relationships.test.js` 覆盖 relationLabel 的 5 档阈值 +
    渲染串拼接；运行 `node --test test/entity-focus-relationships.test.js`。
- **全量回归**：`node --test test/*.test.js`；865 条基线不得降低。重点确认
  `test/world-explain.test.js` / `test/mortality-system.test.js` /
  `test/snapshot-service.test.js` 全绿。
- **手动验证**：
  1. `npx vite` 启动，打开 http://127.0.0.1:5173。
  2. 选 Temperate Plains，Start Colony。
  3. 按 `]` 加速到 4×，等到顶栏出现 `Last: Ren-N died (starvation)` beat。
  4. 点击任意存活 worker 打开 Entity Focus，确认：
     a. "Relationships" 行从 `+0.25` 变成 `"Luka-N: Friend (+0.25) | ..."`。
     b. "Recent Memory" 列表不再是 `(no recent memories)`，而是含一行
        `"Friend Ren-N died (starvation)"` 或 `"Colleague Ren-N died (...)"`。
  5. 观察顶栏 `#storytellerStripSummary`，DIRECTOR 产出的 focus 不再是
     `"route repair and depot relief"`，而是 `"reconnect the broken supply
     lane..."`（若 LLM 503 继续，fallback 句子完整套进新文案）。
  6. 等待 ≥ 5 分钟触发一次 Warehouse fire（DevIndex ≥ 30 时 hotWarehouses 概率
     升高），检查 Entity Focus 里的 worker Recent Memory 多出
     `"Warehouse fire at (ix,iz)"` 条目。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs` seed 42 /
  temperate_plains；DevIndex 不得低于 44 − 5% ≈ 42。本 plan 只加写入（memory 数组）
  + 替换字符串，不改建造/消费/路径逻辑，理论上对 DevIndex 零影响；作为安全带
  跑一次。

## 7. UNREPRODUCIBLE 标记

不适用。复现路径已全部通过 Grep + 代码精读验证：

- Worker memory 从不被写入：全仓 Grep `memory.recentEvents.unshift` 仅命中
  `src/simulation/npc/AnimalAISystem.js:702` 和 `src/world/events/WorldEventSystem.js:540`，
  两处都是 animal-only；`src/entities/EntityFactory.js:150` 确实把数组创出来就
  再未被触碰。
- Relationships 数值没有语义：`src/ui/panels/EntityFocusPanel.js:383` 确实
  `${fmtNum(v, 2)}` 渲染裸数字。
- Fallback focus 是术语：`src/simulation/ai/llm/PromptBuilder.js:90/101/618` 确实
  返回 `"route repair and depot relief"` / `"frontier buildout"` / `"stabilization"`
  等字面量，`src/ui/hud/storytellerStrip.js:144-157` 的 humaniseSummary 规则
  表只有 6 条且不覆盖这些短语。

feedback 自带完整截图与日志，症状与代码读一致，不需要 Playwright 端到端。
