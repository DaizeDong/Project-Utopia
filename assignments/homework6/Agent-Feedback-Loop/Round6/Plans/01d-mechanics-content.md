---
reviewer_id: 01d-mechanics-content
feedback_source: Round6/Feedbacks/01d-mechanics-content.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P0
estimated_scope:
  files_touched: 9
  loc_delta: ~520
  new_tests: 4
  wall_clock: 110
layers: [config, simulation/meta, simulation/lifecycle, simulation/npc, world/events, ui/hud]
conflicts_with: []
prior_round_context:
  - Round5b 01d-mechanics-content delivered processing snapshot, all-resource breakdown, runout ETA, Inspector processing block.
  - Round6 reviewer rescored mechanic visibility 5/10 but held content variety at 3/10 — visibility is no longer the bottleneck; *content side has zero proactive pressure events, decorative mood/morale, and a single predator species*.
---

## 1. 核心问题（归并后）

Reviewer 给出 **机制呈现 5/10 / 内容丰富度 3/10**，并明确："12 分钟模拟内动物只死 1 只、零突袭、零疾病、零自然灾害；mood/morale/social 在 UI 上五维齐全但 0 行为后果；predator 只 1 种"。归并为三条根本病因：

1. **EventDirector 的「主动施压」回路缺失。** `WorldEventSystem` 已经能消费 `state.events.queue` 里的 `BANDIT_RAID / TRADE_CARAVAN / ANIMAL_MIGRATION` 三种事件，但 **没有任何系统按时序往队列里推事件**——`EnvironmentDirectiveApplier` 只在 LLM directive 命中时下蛋，而 LLM 离线率 ≈100% (reviewer §"WHISPER 从未在线")。结果：raid 频率挂在 `RaidEscalatorSystem` 的 cooldown 上**等被 push**，但谁来 push 没人写。需要一个 **EventDirector**（时序触发器）周期性地把候选事件推入队列，让"每 game-day 至少 1 个有压力的事件"落地。
2. **Mood / Morale 是装饰参数。** `WorkerAISystem` 已每 tick 重算 `worker.mood`、`worker.morale`、`worker.social`，并且会在 mood<0.3 时 emit `WORKER_MOOD_LOW`，但 **没有任何 consumer 读这条事件、也没有任何动作分支根据 mood 改变行为**（grep `worker\.mood|\.morale\s*[<>]` 在 `src/simulation/` 下只命中 WorkerAISystem 的写入端 + EconomyTelemetry 的统计端）。需要给 mood 一条最小可玩的反馈：**low-morale → reduced harvest output + chance of "morale_break" event**，否则角色卡纯属装饰。
3. **Predator 物种=1，行为模板=1。** `ANIMAL_KIND` 只有 `HERBIVORE / PREDATOR` 两枚 enum，`createAnimal` 走 `kind === PREDATOR ? 90 hp : 70 hp` 的二元分叉。reviewer 直接点名 "1 种 predator 显然不够"。需要在不引入新 tile ID 的前提下扩出 **species 变体（wolf/bear/raider-beast）**——同 enum + `species` 子字段——给 AnimalAISystem 一条按 species 分流的攻击节奏/HP 表，并让 `ANIMAL_MIGRATION` 事件 spawn 时按 species 权重抽取。

> 解释为什么这三条而不是建议清单里的"加床/加房间/加昼夜"：那些每个都是 5+ 文件的连锁动工（render、texture、UI、population），单 plan 必爆 LOC 预算 / benchmark 红线；本 plan 把 ROI 集中在 **能在一个 round 内被 4-seed 4-map benchmark 看见 DevIndex 抖动**的"动态压力"维度。

---

## 2. Suggestions（可行方向）

### 方向 A: EventDirector 时序触发器 + Mood gameplay coupling + Predator species 变体（推荐）

- 思路：新增 `EventDirectorSystem`（位于 `src/simulation/meta/`），每 N 秒按 colony day-clock 与权重表抽取一个 `EVENT_TYPE` 推入 `state.events.queue`；`WorkerAISystem` 在 mood<0.25 时附加 `harvestOutput *= 0.6` + 5% 概率触发 `MORALE_BREAK` 事件；`EntityFactory.createAnimal` 引入 `species: "wolf"|"bear"|"raider_beast"`，`AnimalAISystem` 按 species 改攻速/HP/group 行为。
- 涉及文件：`src/simulation/meta/EventDirectorSystem.js`（new）、`src/config/constants.js`（EVENT_TYPE 增 `MORALE_BREAK / DISEASE_OUTBREAK / WILDFIRE`，ANIMAL_SPECIES enum new）、`src/config/balance.js`（事件权重表 + species stats）、`src/simulation/npc/WorkerAISystem.js`（mood→output coupling）、`src/world/events/WorldEventSystem.js`（新事件类型 dispatch）、`src/entities/EntityFactory.js`（species 字段）、`src/simulation/npc/AnimalAISystem.js`（species 分流）、`src/simulation/ecology/WildlifePopulationSystem.js`（species 抽取）、`SYSTEM_ORDER` 接入。
- scope：中
- 预期收益：reviewer §1 "机制呈现 5/10" 的 `mood→behavior` 缺口 + §2 "内容丰富度 3/10" 的 `proactive events ≈0 / predator 1 种` 缺口同时弥合，4-seed benchmark 应观察到 raid 频率上升导致 DevIndex 标准差扩大（动态压力的间接证据）。
- 主要风险：raid 频率上升可能压低 DevIndex 均值；需在 balance.js 给 `eventDirectorBaseIntervalSec` 留足保险阀（默认 240s = 4 game-min ≈ 1 game-day @ 4× speed），并通过 4-seed gate 验证 DevIndex 不掉 5%。

### 方向 B: 仅做 Mood→Behavior coupling（最小化）

- 思路：只兑现核心问题 #2，跳过 EventDirector 和 species 变体。
- 涉及文件：仅 `WorkerAISystem.js` + `balance.js` + 1 个测试。
- scope：小
- 预期收益：解决 reviewer "mood 装饰参数" 单条扣分；其他两条扣分原封不动。
- 主要风险：reviewer 给的内容侧 −2 / −2 / −1 三个扣分项里只解决最末一项，回轮预期分数提升 ≤ 0.5。freeze_policy=lifted 下做这个等于浪费配额。

### 方向 C: 床/房间/睡眠系统（reviewer ROI #5+#6）

- 思路：新增 `BED` tile + room-detection BFS + Rest 真接 Bed → 解锁睡眠系统；同时上昼夜（已有 Weather/Night 钩子但 Rest 一直 0）。
- 涉及文件：`constants.js`（TILE.BED=14）、`render/`（tile color/height + 程序纹理）、`ui/tools/BuildToolbar.js`、`BuildSystem.js`、`WorkerAISystem.js`（rest target）、`PathCache`/`AStar`（room BFS）、`balance.js`（床上消费品 / 房间舒适度）、5+ 个测试。
- scope：大
- 预期收益：reviewer ROI #1+#5+#6 三个建议同时命中；可玩性核动力。
- 主要风险：(a) 新 tile ID 渗透 `Grid.js` Uint8Array shape + `SceneRenderer` mesh atlas + 6 张地图模板生成器 + 8+ 测试 fixture，单 round 至少 1500+ LOC；(b) 房间检测 BFS 跑在 96×72 grid 上，每 tick 算法成本未知，可能命中 benchmark perf 红线；(c) 与 01a-onboarding / 01b-playability / 02a-rimworld-veteran 高概率冲突。

---

## 3. 选定方案

选 **方向 A**。理由：

- freeze_policy=lifted 显式邀请 "深层 mechanic 引入"，但同一段约束又要求 "tests green / 4-seed benchmark gate / 不碰 src/benchmark/ + scripts/long-horizon-bench.mjs"。方向 A 的所有改动**绕开**了 tile-ID/render/texture/grid-shape 这条最容易破测试的链条；只新增一个 system + 三个 EVENT_TYPE 字符串 + 一个 species 子字段。
- 单 plan 同时弥合 reviewer 内容侧三个最重的扣分项（−2 主动事件、−2 mood 装饰、−1 predator 单一），打击面大于方向 B、风险小于方向 C。
- EventDirector 是 reviewer ROI 排序里 **#3 "加入主动事件"** 的直接交付，species 变体是 ROI #7 "多样化敌人" 的直接交付，mood gameplay coupling 是 ROI #2 的直接交付——三条 ROI 列表前 7 项命中。

---

## 4. Plan 步骤（原子化，9 条）

- [ ] **Step 1**: `src/config/constants.js:53-57` — `edit` — 在 `EVENT_TYPE` frozen object 追加 `MORALE_BREAK: "moraleBreak"`、`DISEASE_OUTBREAK: "diseaseOutbreak"`、`WILDFIRE: "wildfire"` 三枚字符串。同文件追加新 enum `export const ANIMAL_SPECIES = Object.freeze({ DEER: "deer", WOLF: "wolf", BEAR: "bear", RAIDER_BEAST: "raider_beast" })`。

- [ ] **Step 2**: `src/config/constants.js:108-130` — `edit` — 在 `SYSTEM_ORDER` frozen tuple 中插入 `"EventDirectorSystem"`，位置紧跟 `"RaidEscalatorSystem"` 之后、`"ColonyDirectorSystem"` 之前（保证它能读 `raidEscalation`、能在 ColonyDirector 的 building snapshot 之前 push 事件）。
  - depends_on: Step 1

- [ ] **Step 3**: `src/simulation/meta/EventDirectorSystem.js` — `add` — 新建文件 ~140 LOC：
  - export `class EventDirectorSystem { update(dt, state, services) }`。
  - 维护 `state.gameplay.eventDirector = { lastDispatchSec, dayBudget, history[] }`。
  - 每秒检查 `nowSec - lastDispatchSec >= BALANCE.eventDirectorBaseIntervalSec`（默认 240s）。
  - 命中后按权重 (`BALANCE.eventDirectorWeights = { banditRaid: 0.30, animalMigration: 0.25, tradeCaravan: 0.18, diseaseOutbreak: 0.10, wildfire: 0.10, moraleBreak: 0.07 }`) 用 `services.rng` (deterministic) 抽一个事件 type。
  - 调用 `enqueueEvent(state, type, {}, durationSec, intensity)` 入队（导入自 `src/world/events/WorldEventQueue.js`）；`durationSec` 与 `intensity` 由 `BALANCE.eventDirectorTuning[type]` 表给定。
  - 若选中 `BANDIT_RAID`，先查 `state.gameplay.raidEscalation.intervalTicks`，未到冷却就降级抽下一档。
  - 推入 `state.debug.eventTrace` 日志：`"[t=Xs] director dispatched <type>"`。
  - depends_on: Step 1, Step 2

- [ ] **Step 4**: `src/world/events/WorldEventSystem.js:712-739` (`update` 主循环里的 type-switch 分支) — `edit` — 在 `applyActiveEvent(event, dt, state)` 函数（`src/world/events/WorldEventSystem.js:543`）追加三条 `if (event.type === EVENT_TYPE.DISEASE_OUTBREAK)` / `WILDFIRE` / `MORALE_BREAK` 分支：
  - DISEASE_OUTBREAK：`state.resources.medicine` 每秒 -0.4 × intensity；随机 1 worker `hp -= 5*dt`，在 `recordWorkerEventMemory` 留 "Plague spread (X infected)"。
  - WILDFIRE：选 active event 的 `targetTiles` 里第一个 `TILE.LUMBER`，每秒 5% 概率把它降级为 `TILE.RUINS`（复用 `applyImpactTileToGrid`）。
  - MORALE_BREAK：把 mood 最低的 1 个 worker 的 `worker.blackboard.moraleBreak = { untilSec: nowSec + 30 }`，期间 harvest output ×0。
  - 同时更新 `ensureSpatialPayload`：让这三个 type 走 `default` 分支即可（不需要 zone scoring）。
  - depends_on: Step 1

- [ ] **Step 5**: `src/simulation/npc/WorkerAISystem.js:1026-1038` — `edit` — 在 mood 重算之后插入 mood→output coupling：
  - 计算 `worker.blackboard.moodOutputMultiplier = clamp(0.5 + worker.mood * 0.5, 0.5, 1.0)`（mood 0 → 0.5×；mood 1 → 1.0×）。
  - 在 `handleHarvest`（grep 文件内 `function handleHarvest` 或 `case "harvest"` 主分支）的 yield 计算处把 `output *= worker.blackboard.moodOutputMultiplier`。同样套到 deliver 的 unload rate。
  - 在 mood<0.25 且 prevMood>=0.25 的 cross-down 事件里，把当前 worker 的 `worker.id` 推入 `state.events.queue`（用 `enqueueEvent(state, EVENT_TYPE.MORALE_BREAK, { ix: worker.x|0, iz: worker.z|0, workerId: worker.id }, 30, 1)`）——但加 50% 概率与每 worker 90s cooldown 防止刷屏。
  - depends_on: Step 1

- [ ] **Step 6**: `src/entities/EntityFactory.js:279-334` — `edit` — `createAnimal(x, z, kind, random, species=null)` 增第 5 个参数 `species`：
  - 若 `kind === HERBIVORE` 且 species 未指定 → `species = ANIMAL_SPECIES.DEER`。
  - 若 `kind === PREDATOR` 且 species 未指定 → 按 `BALANCE.predatorSpeciesWeights = { wolf: 0.55, bear: 0.30, raider_beast: 0.15 }` 抽取。
  - HP 表：deer 70 / wolf 80 / bear 130 / raider_beast 110。
  - `displayName` 改为 `withLabel(id, species === "bear" ? "Bear" : species === "wolf" ? "Wolf" : species === "raider_beast" ? "Raider-beast" : "Deer")`。
  - 把 species 写到 returned object 的 `species` 字段，供 AnimalAISystem 与 UI 读。
  - depends_on: Step 1

- [ ] **Step 7**: `src/simulation/npc/AnimalAISystem.js` — `edit` — grep 函数体内 `kind === ANIMAL_KIND.PREDATOR` 的攻速 / wander radius / chase distance 分支，按 `animal.species` 三路分流：
  - wolf：`attackCooldownSec = 1.4`，pack-hunt（与同 species 5 格内的 wolf 共享 target，BoidsSystem 友好）。
  - bear：`attackCooldownSec = 2.6`，单挑、追击距离更长（×1.5），HP 高所以撤退阈值 0.25。
  - raider_beast：`attackCooldownSec = 1.8`，只攻击 worker、忽略 herbivore（变成 reviewer 想要的 "raider" 角色）。
  - 默认 fallback = wolf 行为以保持向后兼容。
  - depends_on: Step 6

- [ ] **Step 8**: `src/simulation/ecology/WildlifePopulationSystem.js:186` (`spawnAnimals` 函数内 `createAnimal` 调用) — `edit` — 调用前按 `BALANCE.predatorSpeciesWeights` / `BALANCE.herbivoreSpeciesWeights` 抽 species 传入；同时 `state.metrics.ecology.predatorsBySpecies = { wolf: N, bear: N, raider_beast: N }` 暴露给 HUD/Inspector（可见但不强制读）。
  - depends_on: Step 6

- [ ] **Step 9**: `src/config/balance.js` — `edit` — 在文件末尾（`}` 之前）追加 BALANCE 字段：`eventDirectorBaseIntervalSec: 240`、`eventDirectorWeights: Object.freeze({...})`、`eventDirectorTuning: Object.freeze({ banditRaid: { durationSec: 30, intensity: 1 }, animalMigration: { durationSec: 22, intensity: 1 }, tradeCaravan: { durationSec: 20, intensity: 1 }, diseaseOutbreak: { durationSec: 35, intensity: 1 }, wildfire: { durationSec: 25, intensity: 1 }, moraleBreak: { durationSec: 30, intensity: 1 } })`、`predatorSpeciesWeights: Object.freeze({ wolf: 0.55, bear: 0.30, raider_beast: 0.15 })`、`herbivoreSpeciesWeights: Object.freeze({ deer: 1.0 })`、`moodOutputMin: 0.5`、`moraleBreakCooldownSec: 90`。
  - depends_on: Step 3, Step 5, Step 6

---

## 5. Risks

- **Raid 频率激增 → DevIndex 跌穿 -5% 阈值。** EventDirector 默认 240s 间隔意味着 60 game-min 内最多 15 个事件，bandit raids 占 30%。RaidEscalatorSystem 的 cooldown 会吞下一部分，但 disease/wildfire/morale_break 没有这个保护。**缓解**：4-seed benchmark 跑完看 DevIndex 均值，若跌 >3% 把 `eventDirectorBaseIntervalSec` 调到 360（再放宽即可）。
- **Mood→Output coupling 可能与既有 fatigue/hunger multipliers 串联爆乘。** WorkerAISystem 已有 `weatherMoraleMult / fatigue / hunger` 三段乘子；新加 mood 乘子若不限定到 harvest 会渗透到 deliver/process 速率，影响 ResourceTelemetry。**缓解**：Step 5 限定到 harvest yield 与 unload rate 两点；不动 deliver pace（移动速度）。
- **Species 字段缺失会破 EntityFactory snapshot 测试。** `test/entity-factory*.test.js` 系列若快照对比 `createAnimal` 输出会因新 `species` 字段失败。**缓解**：把 species 字段放在 object 末尾、对未传参数走默认值、确保 "deer" 与旧版"Herbivore-N" displayName 保持兼容；测试若是结构性快照需要更新 fixture。
- **EventDirector 的 deterministic RNG**：需走 `services.rng` 而非 `Math.random`，否则破坏 seeded benchmark。**缓解**：Step 3 显式记入设计；test/event-director.test.js 用 stub rng 验证 deterministic dispatch。
- 可能影响的现有测试：`test/world-event-system.test.js`、`test/raid-escalator.test.js`、`test/animal-ecology.test.js`、`test/wildlife-population.test.js`、`test/entity-factory*.test.js`、`test/economy-telemetry.test.js`。预期需要更新 1-3 个 fixture（增 species/event 字段断言），但不应有红测。

---

## 6. 验证方式

- **新增测试**：
  - `test/event-director.test.js` —— 用 stub `services.rng` 生成 100 ticks，断言：(a) 事件按 ~1/240s 节奏入队，(b) 权重比例落在 ±10% 误差，(c) BANDIT_RAID 在 cooldown 内被降级抽取。
  - `test/mood-output-coupling.test.js` —— mock 一个 mood=0.1 的 worker 与 mood=0.9 的 worker，跑 5s harvest，断言低 mood worker 的 yield 至少 -40% (0.5× vs 1.0×)。
  - `test/predator-species.test.js` —— 用 seeded RNG 生成 30 predators，断言 species 比例与 `predatorSpeciesWeights` 误差 < 15%；wolf 与 bear 的 `attackCooldownSec` 不同；raider_beast 不攻击 herbivore。
  - `test/event-director-disease-wildfire.test.js` —— 强制入队 DISEASE_OUTBREAK，跑 36s 断言 medicine ≥ 1 单位被消耗、worker hp 至少有 1 个被减；强制入队 WILDFIRE，10s 内至少 1 个 LUMBER tile 被降级为 RUINS。

- **手动验证**：
  - `npx vite` → http://localhost:5173 → 选 Temperate Plains + autopilot + 4× → 等到第 4 game-min。期望：右下事件 toast 至少出现 1 条主动事件（非"first X"成就型）。
  - 点开任一 worker 卡片 → 等 mood 跌到 <0.25 → 状态栏看到 `MORALE_BREAK` 事件，30s 内该 worker 的 `harvest output` 显示 0（Inspector 处理块的 Kitchen 输入流应可见短暂下降）。
  - 跑到 Game-day 5 → 右上 Population 分组，Predators 应能数到 wolf / bear / raider_beast 三种 displayName 共存。

- **benchmark 回归**：
  - `node scripts/long-horizon-bench.mjs --seeds 42,7,13,21 --map temperate_plains`（4-seed gate）。
  - 阈值：DevIndex 均值不得低于本轮基线的 −5%；deaths 上升 <30%（reviewer 期望事件压力增大，少量上升合理）；raidsRepelled 计数 ≥ 基线 ×1.5（验证主动事件确实落地）。
  - 同时跑 `temperate_plains / rugged_highlands / fertile_riverlands / fortified_basin` 4 张图各一遍；任一张图 DevIndex 跌 >5% 则降低 `eventDirectorBaseIntervalSec` 至 360 或调权重。

- **CHANGELOG**：在 `CHANGELOG.md` 顶部 Unreleased 区块按 `New Features / Bug Fixes / Files Changed` 三段记录本 plan 的交付（CLAUDE.md 项目约定）。

---

## 7. UNREPRODUCIBLE 标记

不适用——reviewer 描述的现象（mood 装饰、predator 单一、12 分钟内动物只死 1 只）经源码静态分析直接确证：
- `grep -rn "worker\.mood\|\.morale\s*[<>]" src/simulation` 仅命中 WorkerAISystem 写入端 + EconomyTelemetry 读取端，**没有任何 action / planner / mortality 分支根据 mood 改变行为**。
- `ANIMAL_KIND` enum 只两枚，`createAnimal` 二元分叉确认。
- `state.events.queue` 的唯一生产者是 `EnvironmentDirectiveApplier`（依赖 LLM directive）+ 个别 ad-hoc 测试，**没有按时序的 pump**。

构建 commit 5622cda 与 reviewer build_url 可视行为一致，无需 Playwright 二次复现。
