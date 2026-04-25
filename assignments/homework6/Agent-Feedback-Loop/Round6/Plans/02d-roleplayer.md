---
reviewer_id: 02d-roleplayer
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round6/Feedbacks/02d-roleplayer.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P1
estimated_scope:
  files_touched: 8
  loc_delta: ~330
  new_tests: 3
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

Reviewer 给 3/10。把散落的 ~12 条 findings 收敛成 **3 个根本病灶**：

1. **死亡是叙事盲点**。`MortalitySystem` 已经写了 deathReason / deathContext / 见证者
   memory（`recordDeathIntoWitnessMemory` at MortalitySystem.js:77-130）和
   objectiveLog 行（recordDeath at MortalitySystem.js:320-334），但**HUD 顶层
   完全看不到死亡 toast**——`#storytellerBeat` 的 SALIENT_BEAT_PATTERNS 包含
   `/\bdied \(/i`（storytellerStrip.js:44），但 deathEvents 只 push 到
   `state.debug.eventTrace`（MortalitySystem.js:471-475）后被 `pushWarning` 截断；
   死亡场景下玩家在 HUD 看到的还是"warehouse fire"或 idle 文案，**死亡没有
   生命礼仪（obituary line）、没有"X 是 Y 的好友""X 留下 Z"、没有继承的
   tile 标记**。Round-5b 02d 完成了"witness memory"但**只写在内部 memory，UI
   只在玩家点击该工人时才看得到**。

2. **出生事件的"无母无父"残缺**。`PopulationGrowthSystem` 直接 `createWorker(pos, rng)`
   并广播"X was born at the warehouse"（PopulationGrowthSystem.js:101），从未挑选
   一个**已存在的工人作为"母亲/父母"**，所以 13 个工人滚到 49 时，所有出生事件
   都像从仓库掉资源一样空降——这是 reviewer 笑出声的"clone factory"病。
   仓库内出生还违背 colony sim 体感（婴儿应该来自具体的人）。

3. **关系系统单调（only Friend）+ Backstory ↔ 行为脱钩**。
   `WorkerAISystem.js:1040-1068` 只对 `dist < 3` 写 +0.05 → 单向递增；
   `relationLabel` 已经定义 Strained / Rival 段（EntityFocusPanel.js:18-26 +
   MortalitySystem.js:20-28）但**永远不会被触发**（没有任何 -opinion 通路）。
   Backstory（"mining specialist, hardy temperament"）只是 EntityFocusPanel 显示
   的字符串，**没有任何 system 读它来做行为/旁白偏好**——比如 "hardy"
   不会让饥饿阈值更低，"swift" 不会被叙事提及。

> 因为 Step 4 `freeze_policy: lifted` 允许死亡仪式 + 家系 + 关系
> variety + backstory↔behaviour wiring + Storyteller voice rewrite 全部入域，
> 我把这三个根因都纳入计划，但**收敛到一条主线**（见 §3）：把"已经存在的
> 数据骨架"翻译成玩家能感受到的人物时刻。

## 2. Suggestions（可行方向）

### 方向 A: Obituary + Kinship + Rivalry（叙事三件套）

- 思路：在死亡/出生/关系恶化三处接入"叙事文本生成器"——不是新机制，是把
  既有数据（backstory、relationships、deathReason、scenario.title、
  displayName、tile coord）拼成一行**作家口吻**的旁白塞进
  storytellerStrip 的 `#storytellerBeat`，同时把家谱 / 死因 / 见证者写到
  worker 内部 `memory.obituaries[]`，并在 PopulationGrowthSystem 里挑选 1
  名最近 worker 当 "mother"（或 "parent" 若同性）写到 newWorker.lineage。
- 涉及文件：`src/simulation/lifecycle/MortalitySystem.js`、
  `src/simulation/population/PopulationGrowthSystem.js`、
  `src/simulation/npc/WorkerAISystem.js`（rivalry 通路）、
  `src/ui/hud/storytellerStrip.js`（obituary beat 优先级 +
  birth/lineage beat），`src/entities/EntityFactory.js`（lineage 字段、
  名字池扩容）。
- scope：中
- 预期收益：5-min "I can tell a story" 测试从"3 行 KPI"变成"X 死了，
  他的好友 Y 在 (32,18) 哭了 12 秒；他的女儿 Z 出生于他死前 60s 的同一座
  warehouse"——直接攻顶 reviewer 给出的 -1（死亡） / -1（出生） / -1（关系）。
- 主要风险：4-seed bench gate 必须保证名字 / lineage 选择不破坏 RNG offset；
  若 obituary 行长 > beat 上限（NARRATIVE_BEAT_MAX_LEN=140），需 ellipsize。
  testing：`test/mortality-system.test.js`、`test/memory-recorder.test.js`、
  `test/storyteller-strip-whisper-diagnostic.test.js` 是热区。

### 方向 B: 隐藏 LLM 调试信息 + Storyteller 旁白人称重写

- 思路：把"Why no WHISPER?: LLM never reached" 之类调试串从 storytellerStrip
  的常驻显示移到只在 dev profile 才出现的 hover tooltip；同时把
  `humaniseSummary` 的英文工程语映射表扩展，把 Decision Context 的
  "Local logistics rule sees 1.60 carried resources" 重写成"工人觉得肩膀沉了"。
- 涉及文件：`src/ui/hud/storytellerStrip.js`、`src/ui/hud/HUDController.js`、
  `index.html`（#storytellerWhyNoWhisper 现有 span）、
  `src/ui/panels/EntityFocusPanel.js`（Decision Context 文案）。
- scope：小
- 预期收益：去掉"NPC 的 .ini"那种破浸入感的串，但**不解决死亡 / 出生 / 关系**
  这三大病。属于 polish，不是根因解。
- 主要风险：dev/casual profile 的耦合；改 EntityFocusPanel 文本会让现有
  UI 测试 `test/entity-focus-relationships.test.js` 等需要更新。

### 方向 C: 完全交给 LLM 写旁白（"Cassandra mode"）

- 思路：让 Storyteller 模式真正驱动一个独立 LLM 提示链，专门把死亡 /
  出生 / 火灾 / 鼠灾 / 友谊升级喂进去出 1 句叙事，写到 storytellerStrip。
- 涉及文件：`src/simulation/ai/llm/PromptBuilder.js`、新文件
  `src/simulation/ai/storyteller/StorytellerPrompt.js`、
  `src/ui/hud/storytellerStrip.js`。
- scope：大
- 预期收益：理论上一击解决叙事问题；实际上 LLM 在当前 build 90% 时段为
  fallback steering（reviewer §六亲眼所见），所以体验会**仍然依赖 fallback
  文本**——投入产出比差。
- 主要风险：LLM 不可达时叙事会再次空白；token 成本；和 02e（同样想动
  storyteller）潜在冲突。

## 3. 选定方案

选 **方向 A**，理由：

- **直击根因**：reviewer 三个 -1（死亡/出生/关系）正好对齐 §1 的三个病灶。
- **freeze_policy=lifted 显式允许**死亡 obituary、家谱、relationship variety
  ——orchestrator 已经把这条路打开（runtime context 第 4 步）。
- **rule-based fallback path 友好**：obituary / lineage 不依赖 LLM，benchmark
  跑 fallback 也能产出叙事文本（解决方向 C 的最大风险）。
- **风险可控**：死亡 / 出生 / 关系三处已经有完整数据钩子，只是缺"翻译层"
  —— LOC ≈ +330 不是新 mechanic，是把字段拼成句子。
- **不和 02e（indie-critic）冲突**：02e 主攻 voice-pack 与 storyteller
  badge，方向 A 接 storyteller**但通过 beat 通道**写而非覆盖
  voice-pack 的 summary 文本（D4 arbitration 边界已存在）。

## 4. Plan 步骤

- [ ] **Step 1**: `src/entities/EntityFactory.js:45-77 (WORKER_NAME_BANK / SURNAME_BANK)`
      — edit — 把 WORKER_NAME_BANK 从 40 扩到 ≥ 80 个 first-names；显式去重；
      在 `pickWorkerName` 内部对 13 人初始化的 13 次 draw **使用无放回采样**
      （拿一个 `usedSet` 在 `createInitialEntitiesWithRandom` 里维护，
      pickWorkerName 接受可选 `excludeSet`），消灭"3 个 Mose"碰撞。
      新增 LINEAGE_RELATION 常量（`"parent" | "child" | "sibling"`）。
      ★必须保留 RNG 调用次数与 stream offset（在 createWorker 内
      只在 `excludeSet.size < BANK.length` 时 reroll，最多 3 次重试，
      超过则放回原 random pick）以维护 4-seed bench 决定性。

- [ ] **Step 2**: `src/entities/EntityFactory.js:202-255 (createWorker)`
      — edit — 给 worker 增加 `lineage` 字段：
      `{ parents: string[], children: string[], deathSec: -1 }`。
      工厂初始化为空数组（initial 13 人无 parents）。
      Risk: snapshotService 需要透过 deepReplace（已有 schema-tolerant
      shallowMerge）即可，不需要迁移代码。
      depends_on: Step 1

- [ ] **Step 3**: `src/simulation/population/PopulationGrowthSystem.js:65-103`
      — edit — 在 `createWorker(pos.x, pos.z, rngNext)` 之前挑选 1-2 名最近
      工人（manhattanWorld < 8 且 alive）作为 parent，写到 newWorker.lineage.parents
      并把 newWorker.id 写到 parent.lineage.children；如果挑不到 parent，
      回退到当前"warehouse spawn"语义但**改写 birth 文案**为
      "Aila Grove arrived at the colony"（去掉 "warehouse" 字面量）。
      新发 `EVENT_TYPES.WORKER_BORN` 事件（GameEventBus 中加常量），
      payload 含 `parentNames: string[]`，emitEvent 调用替代当前的
      `VISITOR_ARRIVED` 复用（VISITOR_ARRIVED 仍然 emit 给已存在的下游消费者，
      但增加 reason 字段 = "colony_growth_birth"）。
      memory 行从"X was born at the warehouse"改为
      "X was born to Y" 或 "X arrived at the colony"（无 parent 时）。
      depends_on: Step 2

- [ ] **Step 4**: `src/simulation/meta/GameEventBus.js`（EVENT_TYPES）
      — edit/add — 新增 `WORKER_BORN: "worker_born"`、`WORKER_RIVALRY: "worker_rivalry"`。
      不删旧事件类型；下游 EventPanel / Telemetry 不需要变更（未订阅时静默忽略）。

- [ ] **Step 5**: `src/simulation/lifecycle/MortalitySystem.js:305-357 (recordDeath)`
      — edit — 把 deathEvents 行扩成 obituary 句式：
      `"[time s] {name}, {backstory}, died of {reason} near {tileLabel}"`
      其中 tileLabel 优先用 scenario.anchorLabels（"west ridge wilds"等）匹配，
      回退到坐标。同时把 obituary 写到 deceased.obituary（字符串）和
      `state.gameplay.deathLog[]`（新字段，capped 24 条，**unshift+slice**
      与 objectiveLog 同模式）。
      新增字段：deceased.lineage.deathSec = nowSec。
      `recordDeathIntoWitnessMemory` 在所有 close-friend 见证者上额外写一条
      `lineage.children.includes(deceased.id)` 的"我父亲死了" / "我儿子死了"
      变体（family witness）。
      depends_on: Step 4

- [ ] **Step 6**: `src/simulation/npc/WorkerAISystem.js:1040-1068`（relationship update）
      — edit — 添加**负向通路**：
      (a) 同 tile 同时 deliver 但 carry 落空 → -0.02 / 5 s（碰撞 / 抢资源）；
      (b) 一个工人死亡时，与其有 rivalry 关系的 worker (-0.15 ~ -0.45)
          的存活者获得 morale +0.05（"恩仇"信号），并 push memory
          "Felt grim relief at {name}'s death"；
      (c) 在 -0.15 / -0.45 band-cross 时 `pushFriendshipMemory` 类似函数
          push "Strained / Rival" memory，触发 `EVENT_TYPES.WORKER_RIVALRY`
          事件（Step 4 新增）。
      ★负向 delta 必须保持小于正向（0.02 vs 0.05），否则现有 social CI
      可能整体偏负，破坏 long-horizon-bench DevIndex。
      depends_on: Step 4

- [ ] **Step 7**: `src/ui/hud/storytellerStrip.js:39-47 (SALIENT_BEAT_PATTERNS) + extractLatestNarrativeBeat`
      — edit — 拓展 SALIENT_BEAT_PATTERNS 加入：
        `/\bborn to\b/i`（出生有家长）、
        `/\bmother of\b/i`、
        `/^\[.+\] .+, .+, died of/i`（obituary 句式优先匹配）、
        `/Felt grim relief/i`（rivalry beat）。
      在 `extractLatestNarrativeBeat` 加优先级：obituary > birth-with-parent > friendship > fire/vermin > visitor。当前是"line-by-line scan"——改成"first
      pass 优先 obituary"。
      `formatBeatText` 的 NARRATIVE_BEAT_MAX_LEN 从 140 提到 180（obituary 行偏长）。
      depends_on: Step 5

- [ ] **Step 8**: `src/ui/hud/HUDController.js:1031-1059`
      — edit — 把 `Why no WHISPER?: LLM never reached` 文案在
      `state.controls.uiProfile === "casual"` 时改为隐藏（仅在 dev/full
      profile 显示 sibling span 文本），tooltip 内仍保留以便 power user
      hover。**不删 diagnostic 数据**——只是不让 reviewer 描述的"NPC 的 .ini"
      泄漏到主 HUD 视野。
      ★此步必须用 `state.controls.uiProfile`（而不是 body class），
      因为 storytellerStrip.js 是 pure compute；HUDController 在写 DOM 时做这层
      gate。

- [ ] **Step 9**: `src/ui/panels/EntityFocusPanel.js:481-486`
      — edit — Recent Memory 渲染时识别 obituary/birth 行的 prefix
      （`died of` / `born to` / `Felt grim relief`），分别给 CSS class
      `mem-obituary` / `mem-birth` / `mem-rivalry`，在样式上轻微 emphasis
      （斜体 / 颜色微调）。同时把 lineage.parents / lineage.children
      渲染成新行 "Family: parent of N · child of M, F"。
      不破坏现有 entity-focus-relationships.test.js（断言 Relationships 行不变）。
      depends_on: Step 5

- [ ] **Step 10**（验证步骤，非代码）: 跑 `node --test test/*.test.js` 全绿；
      跑 `node scripts/long-horizon-bench.mjs --seeds=42,43,44,45 --template=temperate_plains`
      4 seeds，DevIndex 不得低于当前 baseline（44） - 5%（≥ 41.8），
      births / deaths 比率不得偏离 baseline ±10%。

## 5. Risks

- **R1 — Snapshot determinism**：lineage 字段加到 worker 上，
  snapshotService.deepReplace 已经容忍 schema 扩展，但 `lineage.parents` / `children`
  是 string[] —— 如果旧存档没这字段，loadSnapshot 必须 default 到 `[]`
  （Step 2 工厂兜底已经覆盖，但旧 save 经 deepReplace 后会缺；需在
  EntityFactory.createWorker 之外加一段 ensureLineage(agent) 在 SnapshotSystem
  loadSnapshot 路径调用——属于 R1.5 兜底，估 +10 LOC）。
- **R2 — RNG offset drift**：Step 1 的 reroll 最多 3 次会改变 RNG 流，
  mitigated by capping at 3 retries + falling back to original draw.
  bench 验证（Step 10）若 DevIndex 跌破阈值就回滚到"无放回但允许碰撞"。
- **R3 — Storyteller beat 抢占**：obituary 优先级 push 到 strip 后，可能
  把 02e 的 voice-pack overlay 文本（mode==="llm"）盖掉。Mitigation：
  obituary 走 `beatText` 通道而非 `summaryText`，保留 voice-pack 在 summary
  位（D4 arbitration 已分离）。
- **R4 — 4-seed bench gate**：Step 6 的 rivalry 负向 delta 若过强会导致 social
  CI 偏低 → mood < 0.3 触发频次上升 → mood_low 事件刷屏。把 negative delta
  控制在 ≤ 0.4 × positive delta（0.02 vs 0.05）以维持 net 上升曲线。
- **R5 — 测试影响清单**：
  - `test/mortality-system.test.js` — obituary 句式改变，需更新断言
  - `test/memory-recorder.test.js` — 出生 memory 行从 "born at the warehouse"
    改为 "born to {parent}" / "arrived at the colony"
  - `test/entity-focus-relationships.test.js` — 仍然只断言 Relationships 行；
    Family 新行不影响；保留绿
  - `test/storyteller-strip-whisper-diagnostic.test.js` — Step 8 改 casual
    profile 隐藏行为，需要更新 / 增加 assertion
  - `test/long-horizon-determinism.test.js` — Step 1 reroll + Step 3 lineage
    选择需要不破坏（worker 数量 / IDs / metrics 序列）。

## 6. 验证方式

- **新增测试**：
  1. `test/lineage-birth.test.js` — 跑 60s sim，断言至少一个新生 worker 的
     `lineage.parents.length >= 1`，且对应 parent 的 `lineage.children`
     包含该 newWorker.id；断言 memory 行不再含 "warehouse" 字面量。
  2. `test/obituary-line.test.js` — 强制饥饿 1 名 worker 至死，断言：
     (a) `state.gameplay.deathLog[0]` 含 "died of starvation"；
     (b) 见证者 worker.memory.recentEvents 含 obituary；
     (c) `extractLatestNarrativeBeat` 返回的 line 优先 obituary 而非
         同时刻发生的 fire（先 emit 一个 fire，再让该 worker 死）。
  3. `test/rivalry-delta.test.js` — 注入两个 worker，强制其
     relationships[other.id] = -0.20，再让它们走到 dist<3，断言
     opinion 不再单向 +0.05；同时若进一步降到 -0.45，emit `WORKER_RIVALRY`。

- **手动验证**：
  - 启动 `npx vite`，开 Broken Frontier 开局，等到第一个出生事件，
    打开 Entity Focus 选中新生 → 期望 Family 行显示 "child of {parent name}"，
    Recent Memory 第一条 "born to {parent}" 而非 "born at warehouse"。
  - 把 1 名 worker 从 hunger 拉到死亡（用 dev console 设 hunger=1.0
    持续 60s），期望 storytellerStrip 顶部 beat 出现 obituary 句式
    （含 backstory 片段 + tile label），EntityFocusPanel 见证者 Recent
    Memory 含 "Close friend X died of starvation"，state.gameplay.deathLog
    新增 1 行。
  - 打开 casual profile，确认 #storytellerWhyNoWhisper 不再常驻可见
    （Step 8）；切到 dev profile 后又回来。

- **benchmark 回归**：
  `node scripts/long-horizon-bench.mjs --seeds=42,43,44,45 --template=temperate_plains`
  - DevIndex 平均 ≥ 41.8（baseline 44 − 5%）
  - deathsTotal / birthsTotal 比率与 baseline ±10% 内
  - 4 个 seeds 全部成功，无 nondeterministic warning

## 7. UNREPRODUCIBLE 标记

不适用——所有现象都已通过代码静态读路径定位（feedback 与 Round-5b 02d
shipped 的 commit.md 一致；EntityFactory.js / MortalitySystem.js /
PopulationGrowthSystem.js / storytellerStrip.js 现状全部 Read 验证），
未启动 dev server。
