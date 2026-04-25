---
reviewer_id: 02d-roleplayer
feedback_source: Round5/Feedbacks/02d-roleplayer.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P1
estimated_scope:
  files_touched: 4
  loc_delta: ~85
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

02d 的评测反复点到一句话：**"系统给了所有叙事原料，但原料没有接入主循环"**。把 3-10 条表面控诉收敛后，有两条根本病：

1. **死亡 → 记忆**的链路只半通。`MortalitySystem.recordDeathIntoWitnessMemory`
   （`src/simulation/lifecycle/MortalitySystem.js:49-78`）优先挑"有关系 opinion ≠ 0"的
   3 名工人写入；**只有在 related.length === 0 时**才退化到"按地理距离取 3 名"的
   witness 名单（line 63-69）。结果：Luka-38 只要生前结交了哪怕 1 个朋友，全殖民地就
   只有那 1-3 个朋友收到"Luka died"——02d 点开不相关的 Vela-8，memory 为空，完全
   符合"Luka 的死在每个工人内心世界都没发生过"的描述。同时 `WorldEventSystem.recordWorkerEventMemory`
   （`src/world/events/WorldEventSystem.js:69-75`）把同一串 `Warehouse fire at (52,38)`
   无去重地反复 unshift 进每个工人的 `recentEvents`，6 格容量被同坐标吃满，这就是
   02d 看到"12 秒内 Vela 记得同一场火四次"的直接原因。
2. **backstory.specialty → 角色分配**完全没连线。`buildWorkerBackstory`
   （`src/entities/EntityFactory.js:100-114`）根据 `skills` 里最大项生成 "cooking
   specialist" 之类字符串，但 `RoleAssignmentSystem.update`
   （`src/simulation/population/RoleAssignmentSystem.js:113-123`）把工人按 `state.agents.filter(type===WORKER)`
   的**数组下标顺序**赋 ROLE.FARM / WOOD / COOK…… workers[idx++] 谁是"烹饪专员"
   系统根本没看。02d 看到的 "Dax-7 cooking specialist → 在仓库旁砍木头" 是纯粹的
   索引巧合，不是 bug 也不是 feature——是这个字段**从未参与过分配决策**。

这两条都不是"缺新 mechanic"——是**已存在的 field（memory.recentEvents / skills.cooking / relationships）没接上已存在的主循环**，严格落在 HW06 freeze 之内。

## 2. Suggestions（可行方向）

### 方向 A：Witness 近场回退 + 事件去重（记忆闭环）
- 思路：把 `MortalitySystem.recordDeathIntoWitnessMemory` 的 witness 选择从"either
  related-only or nearby-only"改成"**并集**"——总是至少包含近场 3 人，再叠加 top-3
  关系人（去重）；同时在 `WorldEventSystem.pushWorkerMemory` 和
  `MortalitySystem.pushWorkerMemory` 里加 **同 key 去重**（用 `(eventType, tileKey,
  windowSec=30s)` 作为 dedup key），同坐标事件在 30s 窗口内合并成一条。
- 涉及文件：`src/simulation/lifecycle/MortalitySystem.js`,
  `src/world/events/WorldEventSystem.js`
- scope：小
- 预期收益：死亡/火灾 100% 触达附近工人的 memory；6 格记忆不再被重复坐标吃满；
  EntityFocusPanel 里 "Recent Memory" 栏终于有差异化内容，02d 抱怨的"记忆只是一条
  坐标日志"立即缓解。
- 主要风险：`memory-recorder.test.js` 现有断言检查"related witness 必有记录"——
  改成并集仍满足；但如果断言写死了 recentEvents 长度 === 1 可能需要放宽。近场
  回退要共用 `WITNESS_NEARBY_DISTANCE = 12`（已有常量）。

### 方向 B：Specialty-aware role assignment（身世→行为闭环）
- 思路：在 `RoleAssignmentSystem.update` 分配前，按 role→skill 映射表
  （FARM→farming, WOOD→woodcutting, STONE→mining, COOK→cooking, SMITH→crafting,
  HERBS/HERBALIST→farming fallback）对 workers 做**稳定排序**：先把总名单按
  `skills[cooking]` 降序取 cookSlots 人标 COOK，按 `skills[woodcutting]` 降序
  取 WOOD 剩余人，依此类推；最后 FARM 吃底。新增函数 `pickSpecialistsForRole(pool, skillKey, n)`
  不改既有 quota / gate / ratio 逻辑。
- 涉及文件：`src/simulation/population/RoleAssignmentSystem.js`（唯一文件）
- scope：小
- 预期收益：backstory 说"cooking specialist"的 Dax-7 在有 kitchen 时被分去 COOK
  的概率 ≥ 80%（随机种子下）；02d 点开 Colony 面板 COOK=0 但殖民地有 kitchen 的
  怪事消失；EntityFocusPanel 的 backstory 和 role 读起来终于自洽。
- 主要风险：`role-assignment-system.test.js`（46 行）和
  `role-assignment-quotas.test.js`（104 行）只断言 role **counts**，不断言身份，
  skill-sort 不会破坏这些断言。但要小心：测试里 `createWorker` 用同种子生成一批
  skills 大致相近的工人，排序可能改变 `workers[idx]` 的身份 → 若下游有"firstWorker
  must be FARM" 断言会碎（grep 没发现这种断言，低概率）。

### 方向 C（讨论，不选）：加 mood debuff "saw friend die"
- 思路：witness 加 -0.15 mood 持续 N 天，像 RimWorld 那样。
- 为什么不选：**直接违反 HW06 freeze**（新 mechanic / 新 mood modifier），本轮 prompt
  明确禁止"加新 mood 系统"。此方向仅为后续 phase 记录，不列入本 plan。

## 3. 选定方案

选 **方向 A + 方向 B 组合**，理由：

- 02d 三条核心诉求里（死亡入记忆 / backstory 影响分配 / 环境 loop），后者（环境
  loop）属于 asset/audio 新内容，远超 Coder 单轮预算且偏 mechanic；前两条是"接线"
  型修复，合起来也只有 4 文件 ~85 LoC，**一轮 Coder 内能全做完**。
- 两个方向相互独立（Memory vs Role），修改区零 overlap，可以在同一 plan 串行执行
  也可并行 review。
- 都是"已有字段接入已有主循环"，满足本轮 prompt 的硬性要求（"不加新 mood / 关系 /
  社交系统；允许把已有 memory / specialty / relationship 字段接入现有主循环"）。
- 指标可度量：**两个量化门槛**（死亡记忆触达率、specialty 命中率）Coder 完成后可
  直接由新增测试断言，不依赖主观感觉。

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/lifecycle/MortalitySystem.js:49-78 (recordDeathIntoWitnessMemory)`
      — edit — 把"related OR nearby"的二选一改成**并集**：先按
      `WITNESS_NEARBY_DISTANCE = 12` 收集 `nearbyWitnesses`（up to 3 by distance），
      再收集 `relatedWitnesses`（top-3 by |opinion|），用 `Set<agentId>` 合并去重，
      最终遍历 union 写 memory。保留既有的 `relationLabelForMemory` 分支：union
      里若某 witness 同时在 related 表里，用 Friend/Close friend 标签；仅 nearby
      的 witness 用 "Colleague"。

- [ ] **Step 2**: `src/simulation/lifecycle/MortalitySystem.js:29-34 (pushWorkerMemory)`
      — edit — 加同事件去重。签名改为
      `pushWorkerMemory(worker, label, dedupKey = null, windowSec = 30)`。实现：
      在 `worker.memory` 下维护新字段 `recentKeys: Map<dedupKey, lastPushSec>`；
      若 `dedupKey && nowSec - lastPushSec < windowSec` 则 skip；否则 unshift label
      并更新 `recentKeys`。调用点（line 76）把 `dedupKey = `death:${deceased.id}`、
      `windowSec = 9999` 传入（死亡天然只发生 1 次，但防御性去重仍有用）。
      - depends_on: Step 1

- [ ] **Step 3**: `src/world/events/WorldEventSystem.js:62-75 (pushWorkerMemory / recordWorkerEventMemory)`
      — edit — 改用和 MortalitySystem 相同语义的去重。`recordWorkerEventMemory`
      签名加 `dedupKey` 参数；line 645 的调用位点传
      `dedupKey = `fire:${loc.ix},${loc.iz}`、`windowSec = 30`。同文件
      line 555-556 的 animal `memory.recentEvents` unshift 也顺带加 `windowSec=30`
      +坐标 key 的去重（避免鹿群围着同一灌木被 predator 骚扰时记忆刷屏）。**注意**：
      Step 2 里的 `worker.memory.recentKeys` Map 字段必须在 `pushWorkerMemory` 入口
      做 `worker.memory.recentKeys ??= new Map()` 的懒初始化，不能依赖 EntityFactory
      修改（避免破坏 snapshot 兼容）。
      - depends_on: Step 2

- [ ] **Step 4**: `src/simulation/population/RoleAssignmentSystem.js:113-123 (assignment loop)`
      — edit — 在"Assign roles in order"之前插入 specialist-first 排序段：
      新增私有函数 `function pickBestForRole(pool, skillKey, n)`：从 `pool` 里按
      `(agent.skills?.[skillKey] ?? 0)` 降序拿 `n` 个，返回 `{ picked, remaining }`。
      把 line 113-123 的 for 循环改写为**两阶段**：(a) 先对 COOK/SMITH/HERBALIST/
      STONE/HERBS/HAUL 这些 specialist 坡度用 pickBestForRole 从 `workers` 里抠出
      最高 skill 的 N 人标 role；(b) 剩余 pool 再按原 FARM/WOOD 顺序分。role→skill
      映射：`COOK→cooking, SMITH→crafting, HERBALIST→farming (治病偏耐心，用 farming
      作代理), STONE→mining, HERBS→farming, HAUL→<no skill, 原 idx 序>`。FARM 用
      `farming`、WOOD 用 `woodcutting` 最后稳排。

- [ ] **Step 5**: `test/memory-recorder.test.js` — add — 新增 2 个断言：
      (a) "nearby witness without relationship gets death memory" — 造 deceased
      + witness（`relationships = {}`, 距离 ≤ 12）+ 其他距离 > 12 的 bystander，
      跑 MortalitySystem，断言 witness.memory.recentEvents[0] 含 "died
      (starvation)"，bystander.memory.recentEvents 为空。
      (b) "repeated fire at same tile dedups within window" — 模拟两次
      `recordWorkerEventMemory(state, "Warehouse fire at (52,38)", ...)` 间隔
      5s，断言目标 worker.memory.recentEvents.length === 1。
      - depends_on: Step 3

- [ ] **Step 6**: `test/role-assignment-specialty.test.js` — add (new file) — 新建
      测试：用 `createInitialGameState({ seed: 902 })` 拉一批 n=12 workers，手动
      把 `workers[5].skills.cooking = 0.95` 其余 cooking 全部 <= 0.5，
      `state.buildings.kitchens = 1`，`state.controls.roleQuotas.cook = 1`，跑
      `RoleAssignmentSystem`，断言 `workers[5].role === ROLE.COOK`。加第二个 case：
      skills.woodcutting 最高者拿 ROLE.WOOD（验证 specialty 在 FARM/WOOD 两大
      基础 role 上也生效）。
      - depends_on: Step 4

## 5. Risks

- **Snapshot/determinism**：Step 4 改变 workers 被赋 role 的顺序会改变
  `worker.role` 的具体身份（counts 不变）。下游凡"按 role 遍历"的系统都 OK；但凡
  "按 workers[0] 是 FARM"的硬编码假设会碎。Grep 未发现此类硬编码，但 Coder 应该
  跑 `node --test test/role-assignment-*.test.js test/population-*.test.js` 双检。
- **Memory map 兼容**：Step 2 新增 `worker.memory.recentKeys: Map`。loadSnapshot/
  序列化路径（`src/simulation/meta/SnapshotSystem.js` 如存在）若 shallow-clone
  `memory` 会丢 Map 实例。必须懒初始化（见 Step 3 的 "??="）而不是在 EntityFactory
  预填，避免 snapshot roundtrip 后 Map 变成 `{}` 报错。
- **Role gate 失效**：Step 4 如果把 cookSlots=0 场景误走 pickBestForRole 会破坏
  "gate on kitchenCount === 0" 的 invariant。必须保证 pickBestForRole 仅在
  `cookSlots > 0` 时调用——即沿用 line 66 的 `(kitchenCount > 0) ? …` 已有 gate。
- **动物记忆波及**：Step 3 同步改 AnimalAISystem line 702-703 的 predator-hit 去重
  可能延迟食草动物逃离学习（目前是每次被咬都刷一次记忆，加 30s 去重后第二次被咬
  不再加强记忆）。对策：这条**本 plan 不改**，只改 worker/WorldEventSystem 内的
  memory，animal 留给 02b/02c 的 ecology 议题。
- 可能影响的现有测试：`test/memory-recorder.test.js`（已有的 related-witness 断言
  应仍通过——我们是加回退不是移除 related 路径）、`test/role-assignment-system.test.js`
  `test/role-assignment-quotas.test.js`（只断 counts，不断身份，应仍通过）、
  `test/death-narrative-log.test.js`（检查 objectiveLog——不动该路径）。

## 6. 验证方式

- 新增测试：
  - `test/memory-recorder.test.js`（扩展）— 覆盖 nearby-witness 触达 + 同坐标事件
    30s 窗口去重两个场景。
  - `test/role-assignment-specialty.test.js`（新建）— 覆盖 cooking/woodcutting
    specialty 命中。
- 手动验证：`npx vite` 启 dev server → 打开 http://localhost:5173 → 建一个
  kitchen → 打开 Colony 面板，确认 COOK 计数 ≥ 1（而不是 0，02d 最刺眼的那一条）
  → 点开被派为 COOK 的工人，确认 `Backstory: cooking specialist`（或此 worker
  skills.cooking 在群体里是 top-quintile）→ 让游戏 fast-forward 到出现第一个
  starvation 死亡 → 在死亡附近 12 tile 内点任一工人，确认 Recent Memory 含
  "Colleague <Name> died (starvation)"。
- 量化门槛（必须通过）：
  1. **死亡触达率**：在新 memory-recorder 测试里，近场 witness（distance ≤ 12，
     无关系）命中 recentEvents 概率 = 100%。
  2. **Specialty 命中率**：在新 role-assignment-specialty 测试里，skills 某项 ≥
     0.9、其他工人同项 ≤ 0.5 的 case，命中 target role 概率 = 100%（即必中）。
- benchmark 回归：`scripts/long-horizon-bench.mjs seed=42 template=temperate_plains`
  跑 365 天。Step 1-3 不改经济学、Step 4 只改 role 身份不改 role counts，预期
  DevIndex 变化 < ±3%。门槛：DevIndex 不得低于 **41.7**（= 当前 v0.8.1 公布的 44 - 5%）。
  若跑出 DevIndex ≥ 44 甚至更高（specialty matching 理论上小幅提升 cook/smith 产出），
  视为 bonus。

## 7. UNREPRODUCIBLE 标记

不适用。两条核心问题都在静态代码里直接可证：
- 死亡记忆只写给"related 优先、全无 related 才回退 nearby"——
  `src/simulation/lifecycle/MortalitySystem.js:56-69` 的 filter + fallback 结构
  即为证据。
- role 分配按数组 idx 顺序——`src/simulation/population/RoleAssignmentSystem.js:113-123`
  的 `workers[idx++].role = ROLE.X` 即为证据；全文无任何 skill 排序调用。

两条问题不需要 Playwright 复现即可从代码锁定。02d 给出的"COOK: 0 / WOOD: 14" +
"Dax-7 cooking specialist 砍木头"是该代码结构的必然产物。
