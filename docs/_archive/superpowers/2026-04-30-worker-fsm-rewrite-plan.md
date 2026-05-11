# Worker AI 重构规划：从效用打分到优先级 FSM

**Author:** Claude (planning round, 2026-04-30)
**Status:** Approved — 按 phase 0.10.0-a → e 顺序实施
**Replaces:** v0.9.0–v0.9.4 Job-utility scheduler

## 1. 当前架构（post-v0.9.4）的诚实诊断

| 层 | 问题 |
|---|---|
| **JobScheduler 双轨打分** | 13 个 Job 各自 `canTake → findTarget → score`（3 步过滤），叠加 hysteresis sticky bonus，叠加 survival bypass 把 bonus 归零 — 三套独立机制做"该不该切" |
| **survival bypass 是补丁** | v0.9.4 `isSurvivalCritical` 给 hysteresis 打补丁，承认 hysteresis 模型在 survival 边界处错了 |
| **score 函数无统一标准** | `JobHarvestBase.score = roleFit × pressure × distFactor × 0.85`，`JobEat.score = clamp(1.05 - hunger, 0, 0.95)`，`JobWander.score = 0.05` — 三个 Job 三种语义，没法直接对比 |
| **隐式状态散落多处** | `worker.currentJob` + `worker.stateLabel` + `worker.blackboard.intent` + `worker.debug.lastIntent` 四个字段表征同一件事 |
| **3 个 service 失效规则各异** | ReachabilityCache 按 grid.version；PathFailBlacklist 按 5s TTL；JobReservation 按 release-on-abandon |
| **WorkerAISystem.js 仍 1687 LOC** | v0.9.0 重写后老 handle* 函数还在（被 Job tick delegate） |
| **可扩展性差** | 加新行为 = 新建 Job 类（6 方法）+ canTake 复制粘贴 + score 公式调到能对比 + 改 JobRegistry |

**根本症结**：用了 Utility AI 范式（"打分对比"），但 worker 决策本质是**有明确优先级的离散事件**（"饿了就吃"不是"吃饭分数算出来比工作高"，而是"hunger<阈值就触发 EAT 转换"）。打分擅长连续比较，不擅长离散切换 — 后者用打分必然引出 hysteresis + 特例补丁。

## 2. 业界范式对比

| 范式 | 代表作 | 决策粒度 |
|---|---|---|
| Utility AI | The Sims, RimWorld 早期 | 每 tick 全局打分 |
| Behavior Tree | Halo, Unreal | 树遍历 |
| GOAP | F.E.A.R., Shadow of Mordor | A* over action space |
| HTN | Killzone, Transformers | 多层规划 |
| **Priority FSM** | **Dwarf Fortress, Project Zomboid** | **当前状态 + 优先级转移列表** |
| HFSM | Bungie Destiny | 父状态批量转移 + 子状态本地行为 |
| ThinkTree | RimWorld 现代 | 树形 + 第一个返回 Job 的胜出 |

**Project Utopia 实际场景**：~14 个明确不同的离散行为；优先级语义清晰（饿>累>战斗>工作>漫步）；状态切换频率低；不需长程规划。

**最匹配范式**：**Priority FSM + 局部目标选择**（DF / Zomboid 风格）。"该做什么"用 FSM，"具体哪个 tile"用一次性目标选择函数，**两者解耦**。

## 3. 提议架构：优先级状态机

### 3.1 核心数据结构

```js
// 唯一真值：worker.fsm = { state, enteredAtSec, target?, payload? }

const STATE_BEHAVIOR = {
  IDLE: { onEnter, onExit, tick },
  SEEKING_FOOD: { ... },
  EATING: { ... },
  SEEKING_REST: { ... },
  RESTING: { ... },
  FIGHTING: { ... },
  SEEKING_HARVEST: { ... },
  HARVESTING: { ... },
  DELIVERING: { ... },
  DEPOSITING: { ... },
  SEEKING_BUILD: { ... },
  BUILDING: { ... },
  SEEKING_PROCESS: { ... },
  PROCESSING: { ... },
};

// 每个状态附带【优先级有序的】转移列表
const STATE_TRANSITIONS = {
  HARVESTING: [
    { priority: 0,  to: "FIGHTING",        when: hostileInAggroRadius },
    { priority: 1,  to: "SEEKING_FOOD",    when: hungryAndFoodAvailable },
    { priority: 2,  to: "SEEKING_REST",    when: tooTired },
    { priority: 5,  to: "DELIVERING",      when: carryFull },
    { priority: 10, to: "IDLE",            when: yieldPoolDriedUp },
  ],
  SEEKING_FOOD: [
    { priority: 0,  to: "FIGHTING",        when: hostileInAggroRadius },
    { priority: 1,  to: "EATING",          when: arrivedAtFoodTile },
    { priority: 5,  to: "IDLE",            when: pathFailedAndNoCarryFood },
  ],
  // ...
};
```

### 3.2 调度器（整个文件）

```js
function tickWorker(worker, state, services, dt) {
  worker.fsm ??= { state: "IDLE", enteredAtSec: 0 };

  const transitions = STATE_TRANSITIONS[worker.fsm.state] ?? [];
  for (const t of transitions) {
    if (t.when(worker, state, services)) {
      enterState(worker, state, services, t.to);
      break;
    }
  }
  STATE_BEHAVIOR[worker.fsm.state].tick(worker, state, services, dt);
}

function enterState(worker, state, services, newName) {
  const oldName = worker.fsm.state;
  STATE_BEHAVIOR[oldName]?.onExit?.(worker, state, services);
  worker.fsm = { state: newName, enteredAtSec: state.metrics.timeSec };
  STATE_BEHAVIOR[newName].onEnter?.(worker, state, services);
}
```

**~30 LOC dispatcher**，替代当前 161 LOC JobScheduler + 78 LOC Job 基类 + 各 Job 滞后/竞态/抢断逻辑。

### 3.3 滞后 / 抢断 / 1:1 绑定 → 自然涌现

| 当前需要的特殊机制 | FSM 中如何自然发生 |
|---|---|
| Hysteresis sticky bonus 0.25→0.05 | **不需要**。状态自带粘性 — 只有 `when` 触发才离开 HARVESTING |
| `isSurvivalCritical` survival bypass | **不需要**。SEEKING_FOOD 在 HARVESTING 转移列表 priority=1，比 DELIVERING 的 priority=5 高 |
| Job priority 字段（实际不用） | **就是 transition.priority**，真用了 |
| `tryReserve` 原子绑定 | `SEEKING_HARVEST.onEnter` 调用，`onExit` 释放 |
| `pickUnreservedFallback` | `SEEKING_HARVEST.onEnter` 内的 target 选择函数 |
| `worker.currentJob` 4 字段同步 | **唯一字段** `worker.fsm.state` |
| Blacklist hot-loop 检查 | `SEEKING_X.tick` 检测 path 失败 → 触发 X→IDLE |

### 3.4 添加新行为成本

**当前**（加"采蘑菇"）：写 `JobGatherMushroom.js` 6 个方法 ~120 LOC + JobRegistry + 调和 score + 担心 hysteresis 互动。

**FSM 框架**：加 2 state（SEEKING_MUSHROOM + GATHERING_MUSHROOM）写 onEnter/tick/onExit ~30 LOC + IDLE.transitions 加一行。**新行为 ≈ 40 LOC**。

### 3.5 状态转移图

```
                    [FIGHTING]
                     /  ↑  \
              all states with role=GUARD
                        │
              ┌─────────┴─────────┐
              ↓                   ↓
     [SEEKING_FOOD]──→[EATING]──→[IDLE]
              ↑                    │
              │←─ hunger<seek ─────│
              │                    │
     [SEEKING_REST]──→[RESTING]────┤
              ↑                    │
              │←─ rest<seek ───────│
                                   │
              ┌────────────────────┤
              ↓                    │
    [SEEKING_HARVEST]──→[HARVESTING]
                              │
                       carry full
                              ↓
                     [DELIVERING]──→[DEPOSITING]──→[IDLE]
                                                    │
                              ┌─────────────────────┤
                              ↓                     │
                    [SEEKING_BUILD]──→[BUILDING]────┤
                                                    │
                              ↓                     │
                  [SEEKING_PROCESS]──→[PROCESSING]──┤
                                                    ↓
                                                [WANDER (in IDLE)]
```

每个箭头对应一条 `{priority, when, to}` 元组，**全部写在一张表里**。

## 4. 与服务层的关系

3 个 service **保留**，但消费者从 13 个 Job 收敛到 ~5 个 onEnter / when / tick 函数：

| Service | 用在哪 |
|---|---|
| `ReachabilityCache` | `hungryAndFoodAvailable`（when）、`SEEKING_FOOD.onEnter`（target） |
| `PathFailBlacklist` | `SEEKING_X.tick`（path fail 触发回 IDLE）、`SEEKING_X.onEnter`（避开） |
| `JobReservation` | `SEEKING_HARVEST.onEnter`（占）、`HARVESTING.onExit`（释放） |

## 5. 迁移规划：5 个 phase

| Phase | 内容 | LOC | 风险 |
|---|---|---|---|
| **0.10.0-a** | FSM 基础设施：`WorkerFSM.js`（dispatcher 30 LOC）+ `WorkerStates.js`（state 行为映射）+ `WorkerTransitions.js`（转移表）+ FEATURE_FLAGS.USE_FSM 默认 OFF | ~200 | 零（flag OFF） |
| **0.10.0-b** | 写出 14 个 state 的 onEnter/tick/onExit + 全部 transitions | ~400 | 零（flag OFF） |
| **0.10.0-c** | flag ON 隔离测试跑全 7 个 trace 场景（A-G），对比 v0.9.4 baseline | ~50 测试 | 中（可能露转移漏洞） |
| **0.10.0-d** | 翻 flag ON。退役 JobScheduler + 13 Job 类 + JobRegistry + JobHelpers + isSurvivalCritical。WorkerAISystem.js -500 LOC | -1500 净删 | 高 — 必须 trace 等价 |
| **0.10.0-e** | 清理 + 文档 + worker.stateLabel 直接读 fsm.state | ~50 | 零 |

**总成本估**：净 +200，抵消 v0.9.x Job 层 ~1500，**净 -1300**。

## 6. 与 v0.9.x 的契约保持

迁移期间不变：

- `worker.x / .z / .role / .hunger / .rest / .carry`：FSM 读，不动
- `state.grid / .resources / .buildings / .constructionSites`：FSM 读，不写
- `services.reachability / .pathFailBlacklist / .pathfinder`：FSM 通过 service 调用
- `JobReservation`：保留为 1:1 binding 工具
- `Navigation.js`：路径生命周期不动
- `RoleAssignmentSystem`：仍决定 role；FSM 的 IDLE 转移用 role 决定下一步去哪
- `MortalitySystem`：死亡决策不动

迁移期间新加：

- `worker.fsm = { state, enteredAtSec, target? }`：唯一行为字段
- `STATE_BEHAVIOR` / `STATE_TRANSITIONS`：两张冻结字典

## 7. 兼容性 / 显示层

`worker.stateLabel` 在 phase d 收敛为 getter：

```js
get worker.stateLabel() { return DISPLAY_LABEL[worker.fsm.state]; }
```

UI（EntityFocusPanel 等）不需要改。

## 8. 决定性 / 测试

每条 transition 是确定性 boolean 函数 → 同输入同输出。FSM dispatcher 不引入随机源。

测试形式：

```js
test("hungry harvester preempts to eat", () => {
  worker.hunger = 0.15;
  worker.fsm.state = "HARVESTING";
  tickWorker(worker, state, services, dt);
  assert.equal(worker.fsm.state, "SEEKING_FOOD");
});
```

每条转移直接写 1 个测试覆盖。

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 转移表条目膨胀（14 状态 × N 转移） | **transition group**：相同的"survival 抢断"转移定义一次，多状态引用 |
| 某个 when 函数 bug → 永久卡死 | "guaranteed exit" 测试：每状态 60s 模拟内必须至少触发一次转移 |
| 需要"所有 X 中选最好的" | 保留在 `SEEKING_HARVEST.onEnter` 内 — 一次性 score，不进 FSM |
| 离散切换无法表达"略偏好之前的" | 极少需要；如需可加 `enteredAgo > N` 条件 |
| 新转移与已有转移优先级冲突 | 转移表加注释 + 单元测试每条转移触发顺序 |

## 10. 收益预期

- 代码 LoC -1300（删多于加）
- 新行为成本 ~120 → ~40 LOC
- bug 类别消失：hysteresis 边界 / score 不可比 / state 多源同步
- 测试可读性大幅提升（每条转移 1 测试）

## 11. 开放问题（实施前定夺）

1. **HFSM 还是 Flat FSM？** 推荐 flat（14 个 state 不算多）
2. **是否保留 utility scoring 用于"选目标"环节？** 推荐保留 — FSM 决"该 SEEKING_HARVEST"，onEnter 用 utility 选哪块 farm
3. **回退策略？** Phase d 翻 flag 翻车 → 至少保留 `FEATURE_FLAGS.USE_FSM=false` 一个版本以便回滚
