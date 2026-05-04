---
reviewer_id: C1-code-architect
reviewer_tier: C
feedback_source: Round1/Feedbacks/C1-code-architect.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P1
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 7
  loc_delta: ~+340 / -100  (net ~+240, all under the 400 budget)
  new_tests: 1
  wall_clock: 35
conflicts_with: []
rollback_anchor: 1f6ecc6
system_order_safe: true
wave: 2 of 4
---

## 1. 核心问题

1. **两套 NPC AI framework 并存（核心架构债）**：`VisitorAISystem` 与 `AnimalAISystem` 仍 import v0.9.x 的 `StatePlanner` / `StateGraph` 三件套（两文件 :8-9 行），与 v0.10.0 `WorkerFSM` 黄金范例分裂。Round 0 已完成 doc-side wave-1（`docs/systems/03-worker-ai.md` 同步 + `worker-fsm-doc-contract.test.js` 锁测，drift 7→3），但 src-side wave-1（generic dispatcher 抽出）仍未启动。`WorkerFSM.js` 的 124 LOC dispatcher 是 framework-y 的范例，但目前锁死在 `npc/fsm/` 子目录 + 默认 import worker-specific behavior，不可被 Visitor / Animal 直接复用。
2. **debt-pop-2（Round 0 唯一新增债，职责越界）**：`__devForceSpawnWorkers` (~90 LOC) 被 1f1eea5 加到 `src/simulation/population/PopulationGrowthSystem.js:243-332` 末尾。`src/simulation/` 公约是纯生产代码；dev-only helper（绕过 food cost / cooldown / queue gate，仅供 `__utopiaLongRun.devStressSpawn` 浏览器全局调用）应居 `src/dev/` 或 `src/app/`（与 `longRunTelemetry.js` 同居更合理）。

## 2. Suggestions（可行方向）

### 方向 A: Wave-2 抽 generic `PriorityFSM<StateName>` + Wave-2 同时 fix debt-pop-2

- 思路：把 `WorkerFSM.tickWorker` 的 dispatcher 内核 generalize 成 `PriorityFSM` class（构造 takes `behavior` / `transitions` / `displayLabel` / `defaultState` 注入；不再 default-import worker-specific 模块）。`WorkerFSM` 缩成 thin facade（沿用类名 + `tickWorker` 方法名，零调用站点改动）。同时把 `__devForceSpawnWorkers` 从 `PopulationGrowthSystem.js` 移到新建的 `src/dev/forceSpawn.js`，原 file 改为 re-export shim 保持 import 路径不变（GameApp / 测试无须修改）。Visitor / Animal 实际迁移留到 wave-3 / wave-4。
- 涉及文件（新增 / 修改 / 移动）：
  - `src/simulation/npc/PriorityFSM.js`（**新增**，generic dispatcher，~95 LOC）
  - `src/simulation/npc/fsm/WorkerFSM.js`（**改写为 facade**，~30 LOC，从 124 缩到 ~30，保留 `WorkerFSM` 类名 + `tickWorker` 方法以零外部影响）
  - `src/dev/forceSpawn.js`（**新增**，~95 LOC，承接 `__devForceSpawnWorkers` 实现 + JSDoc）
  - `src/simulation/population/PopulationGrowthSystem.js`（**edit**，删 :242-332 实现，保留 `export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js"` 一行 alias 以保 import 路径稳定）
  - `test/priority-fsm-generic.test.js`（**新增**，~110 LOC，覆盖 priority walk / onExit-onEnter 顺序 / displayLabel 写入 / target+payload 重置 / 自转移 no-op，独立于 WorkerStates 实例化）
  - `src/app/GameApp.js`（**no edit**，`__devForceSpawnWorkers` 通过 PopulationGrowthSystem.js re-export 仍可 import；shim 保持二进制兼容）
- scope：中（generic 抽出 + 1 文件 move + 1 facade，但都不动调用方接口）
- 预期收益：
  - WorkerFSM.js 变 facade（debt 不增）；`PriorityFSM` 为 wave-3 (Visitor) / wave-4 (Animal) 铺路，**用最小改动证明 framework 可复用**（Refactor-1 真正启动）。
  - debt-pop-2 resolved（Round 0 唯一新增债被吃掉），系统总债 28→27。
  - test baseline 1646 pass 不变；新增 1 lock 测保护 generic dispatcher 行为。
- 主要风险：
  - facade 必须 100% 行为兼容（构造默认值、`tickWorker` 签名、`getStats` 返回字段、`worker.fsm` 默认值结构、`worker.stateLabel` 单写时机）。需要新测验证 facade equivalence。
  - `re-export shim` 路径需保持 GameApp.js / test/long-run-api-shim.test.js 的现有 import 不变。
- freeze 检查：OK（不新增 tile / building / role / mood / mechanic / audio / UI panel；不动 SYSTEM_ORDER；不增 LLM call surface；外部可观察行为完全不变）。

### 方向 B: 只 fix debt-pop-2，PriorityFSM 抽出 deferred 到 Round 2

- 思路：本轮只搬 `__devForceSpawnWorkers` 到 `src/dev/forceSpawn.js` + `PopulationGrowthSystem.js` re-export shim。WorkerFSM 抽 generic 推迟。
- 涉及文件：`src/dev/forceSpawn.js`（新增）+ `src/simulation/population/PopulationGrowthSystem.js`（删 90 LOC + 加 1 行 re-export）。
- scope：小（~95 LOC move + 1 行 re-export，无 generic dispatcher 工作）。
- 预期收益：debt-pop-2 解决；但 Refactor-1 src-side wave-1 仍未启动，整体 verdict 仍 YELLOW，下轮 reviewer 大概率维持同等评分。
- 主要风险：极低。但**机会成本高**：C1 反复点名 generic PriorityFSM 抽出是头等机会、是 Round 2/3 Visitor/Animal 迁移的前置必要工作；本轮跳过会让 Refactor-1 timeline 顺延 1 轮。
- freeze 检查：OK。

## 3. 选定方案

选 **方向 A**。理由：

- C1 feedback §8 明确点名："如果你只能改 1 件事，先改 Refactor-1 Wave-1：抽出 generic `PriorityFSM<StateName>` dispatcher class"，且 §5 把 Refactor-1 列为 Top-1 重构机会。
- C1 feedback §8"二顺位（如果 Wave-1 plan 还有 budget）"明确表态：debt-pop-2 是 ~90 LOC 搬移，"成本极低"，可与 PriorityFSM 抽出同 plan 完成。
- LOC budget 估算：generic 抽出（+95 新文件 -94 旧 dispatcher = 净 +1 但分布到 facade）+ debt-pop-2 搬移（+95 新文件 -90 旧实现 +1 re-export = 净 +6）+ 新测试（+110）= 总计 ~+340 LOC，在 400 LOC 上限内。
- system_order_safe = true：dispatcher 抽出是"同义重写"，调用站点（`src/simulation/npc/WorkerAISystem.js:1654`）不动，`SYSTEM_ORDER` 不动，运行时调度顺序不变。
- 外部可观察行为不变：facade 的 `WorkerFSM.tickWorker(worker, state, services, dt)` 签名、`worker.fsm` 结构、`worker.stateLabel` 单写、`getStats` 返回值都对齐。lock 测覆盖 facade 等价性。

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/npc/PriorityFSM.js:new-file` — `add` — 新文件。从 `src/simulation/npc/fsm/WorkerFSM.js:32-124` 把 dispatcher 类内核拷出，重命名 class `WorkerFSM` → `PriorityFSM`；构造签名改为 `constructor({ behavior, transitions, displayLabel, defaultState })`，去掉对 WorkerStates / WorkerTransitions 的默认 import；`tickWorker` 重命名为 `tick(entity, state, services, dt)`（参数名 entity 而非 worker）；保留 `_enterState` / `getStats` 等私有方法语义；在 facade 上仍走 `defaultState` 注入而非 hardcoded `"IDLE"`。
- [ ] **Step 2**: `src/simulation/npc/fsm/WorkerFSM.js:32-124` — `edit` — 改写为 thin facade（~30 LOC）。`import { PriorityFSM } from "../PriorityFSM.js"`；`import { DISPLAY_LABEL, STATE_BEHAVIOR } from "./WorkerStates.js"`；`import { STATE_TRANSITIONS } from "./WorkerTransitions.js"`。`class WorkerFSM` 内构造 `this._fsm = new PriorityFSM({ behavior: STATE_BEHAVIOR, transitions: STATE_TRANSITIONS, displayLabel: DISPLAY_LABEL, defaultState: "IDLE" })`。`tickWorker(worker, state, services, dt)` 委托给 `this._fsm.tick(worker, state, services, dt)`；`getStats()` 委托给 `this._fsm.getStats()`。**保持类名 + 方法名 + 返回字段 100% 兼容**，调用方 `src/simulation/npc/WorkerAISystem.js:1654` 零修改。
  - depends_on: Step 1
- [ ] **Step 3**: `src/dev/forceSpawn.js:new-file` — `add` — 新文件。从 `src/simulation/population/PopulationGrowthSystem.js:242-332` 整段（含 JSDoc warning）拷过来。仍然 export `function __devForceSpawnWorkers(state, targetCount, rng)`，签名 / 行为 / 返回字段（`{ spawned, total, fallbackTilesUsed }`）/ infraCap 处理 / `state.metrics.devStressSpawnTotal` 副作用 / `isStressWorker` tag 全部保持完全一致。imports 直接挪过来（`createWorker` from `../entities/EntityFactory.js`、`tileToWorld` / `randomPassableTile` / `listTilesByType` from `../world/...`，路径相对调整）。
- [ ] **Step 4**: `src/simulation/population/PopulationGrowthSystem.js:242-332` — `delete` + `edit` — 删除原 `__devForceSpawnWorkers` 实现 (~90 LOC)；在原位置之上保留 `export { RecruitmentSystem as PopulationGrowthSystem };` 和 `export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js";` 这两行 re-export shim（保 GameApp.js:21 + test/long-run-api-shim.test.js:269/288 现有 import 路径不变）。同步删除现在多余的 `randomPassableTile` / `listTilesByType` / `tileToWorld` / `createWorker` import 行（如该文件中其余 RecruitmentSystem 代码不再用到这些 import）。
  - depends_on: Step 3
- [ ] **Step 5**: `test/priority-fsm-generic.test.js:new-file` — `add` — 新增 lock 测试，覆盖 generic dispatcher 行为：(a) 构造时不传 behavior/transitions 抛或 fallback safely；(b) tick 触发 onEnter→tick→（next call）transition→onExit→onEnter 顺序；(c) 优先级 walk first-match-wins（同状态多 transition 命中时按 array 顺序取第一个）；(d) `entity.stateLabel` 在每 tick 末尾被 displayLabel[entity.fsm.state] 单写覆盖；(e) `_enterState` 重置 target / payload；(f) 自转移（oldName === newName）no-op 不 bump transitionCount。独立于 WorkerStates / WorkerTransitions 实例化（用 stub behavior+transitions table）。
  - depends_on: Step 1
- [ ] **Step 6**: `src/simulation/npc/fsm/WorkerStates.js:75-93` — `edit`（**注释级**） — 把 docstring 中"`WorkerFSM.tickWorker`"改成"`WorkerFSM.tickWorker`（thin facade over `PriorityFSM.tick`）"。两处 comment 提及（:76 和 :93）。**仅文档注释**，不改运行行为。
  - depends_on: Step 2
- [ ] **Step 7**: `src/entities/EntityFactory.js:214` — `edit`（**注释级**） — 同 Step 6，把 "`WorkerFSM.tickWorker`" 注释改为 "`WorkerFSM.tickWorker` (which delegates to `PriorityFSM.tick`)"。**仅文档注释**。
  - depends_on: Step 2

## 5. Risks

- **R1（facade 等价性）**：`WorkerFSM` facade 必须 100% 行为兼容。任何 `worker.fsm` / `worker.stateLabel` / `getStats` 字段名或时机偏移都会破坏现有 1646 测试中的 `worker-fsm-*.test.js` / `worker-fsm-doc-contract.test.js` / 13 个 worker AI behavioural test。**缓解**：Step 5 新测 + 跑 `node --test test/worker-fsm-*.test.js` 全绿验证。
- **R2（`__devForceSpawnWorkers` re-export 路径）**：GameApp.js:21 与 test/long-run-api-shim.test.js:268-291 都从 `PopulationGrowthSystem.js` 命名 import。如果 Step 4 的 re-export shim 没有正确暴露符号（例如打错路径），运行时会立即崩。**缓解**：Step 4 必须用 `export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js"`（命名 re-export 而非默认 re-export）；测试 `node --test test/long-run-api-shim.test.js` 验证。
- **R3（PriorityFSM file 路径）**：选择 `src/simulation/npc/PriorityFSM.js`（脱出 fsm/ 子目录），而不是 `src/simulation/PriorityFSM.js`，因为 visitor/animal 也在 npc/ 下。如果 wave-3 Visitor 迁移决定把 npc/ 重组（如分 worker/visitor/animal/shared 子目录），路径会再动。**缓解**：plan 接受这个未来代价，本轮不预测重组。
- **R4（system_order_safe）**：facade 委托模式不改 SYSTEM_ORDER；调用 `WorkerAISystem.update()` 的位置 + 它内部 `this._workerFSM.tickWorker(worker, state, services, dt)` 调用站点都未动。dispatcher 只是从内部 method 改为 delegated method，单 tick 内执行的 `onExit / onEnter / tick / displayLabel-write` 顺序完全保留。
- 可能影响的现有测试：`test/worker-fsm-*.test.js`（5 个）、`test/worker-fsm-doc-contract.test.js`、`test/long-run-api-shim.test.js`（特别是 :268 和 :287 两 helper 测试）。

## 6. 验证方式

- 新增测试：`test/priority-fsm-generic.test.js` 覆盖 generic dispatcher（priority walk / lifecycle hook ordering / displayLabel write / target+payload reset / 自转移 no-op）。
- 现有测试回归：`node --test test/worker-fsm-*.test.js test/worker-fsm-doc-contract.test.js test/long-run-api-shim.test.js test/priority-fsm-generic.test.js`，期望 baseline 1646 pass + 1 new pass = 1647 pass / 0 fail / 2 skip。
- 全测试套件：`node --test test/*.test.js`，期望与 Round 0 baseline 完全一致（1646 pass + 1 new = 1647 pass / 0 fail / 2 skip）。
- 手动验证：开 `npx vite` → `http://localhost:5173/?dev=1` → console: `__utopiaLongRun.devStressSpawn(50)`，期望返回 `{ ok: true, spawned: <≥0>, total: <≥50 或 infraCap clamped>, fallbackTilesUsed: <int> }`，期望与 Round 0 行为完全一致；UI 上 worker count 上涨。
- FPS 回归：`browser_evaluate` 5 秒平均 FPS ≥ 55（baseline ~60；facade 委托是 zero-cost 单层间接，无 measurable 开销）。
- benchmark 回归：可选——`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，DevIndex 不得低于 baseline - 5%。本轮不强制（dispatcher 抽出无算法变化）。
- prod build：`npx vite build` 无错；`vite preview` 60 秒 smoke 无 console error。

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记（如适用）

不适用（C1 driven 整理 plan，跳过现场复现步骤）。

## 9. C1 对照表（仅 C1 driven 整理 plan）

| 旧 | 新 | 备注 |
|----|----|------|
| `src/simulation/npc/fsm/WorkerFSM.js` (124 LOC, dispatcher class with hardcoded WorkerStates / WorkerTransitions imports + `"IDLE"` default) | `src/simulation/npc/PriorityFSM.js` (~95 LOC, generic class via constructor injection) + `src/simulation/npc/fsm/WorkerFSM.js` (~30 LOC, thin facade re-using PriorityFSM) | 调用方 (`WorkerAISystem.js:1654`) 完全不动；`worker.fsm` / `worker.stateLabel` 字段时机不变 |
| `WorkerFSM.tickWorker(worker, state, services, dt)` (method on monolithic class) | `WorkerFSM.tickWorker(...)` (facade delegates to `this._fsm.tick(entity, state, services, dt)`) — `PriorityFSM.tick` 是 generic | facade 保留 method 名、签名、返回（无返回） |
| `WorkerFSM._enterState(...)` (private) | `PriorityFSM._enterState(...)` (private on generic) | facade 不暴露；语义不变（onExit→fsm reset→onEnter→bump transitionCount） |
| `WorkerFSM.getStats()` returns `{ transitionCount, tickCount }` | `WorkerFSM.getStats()` (facade) → `this._fsm.getStats()` returns 同字段 | 字段名 + 类型不变 |
| `import { DISPLAY_LABEL, STATE_BEHAVIOR } from "./WorkerStates.js"` (in WorkerFSM.js) | 同 import，但移到 facade 内部；构造时通过 `{ behavior, displayLabel }` 注入 PriorityFSM | 注入而非默认 import 是 generic-化关键 |
| `import { STATE_TRANSITIONS } from "./WorkerTransitions.js"` | 同 import，但移到 facade；注入 `{ transitions }` | 同上 |
| **(debt-pop-2)** `src/simulation/population/PopulationGrowthSystem.js:242-332` `export function __devForceSpawnWorkers(state, targetCount, rng)` (~90 LOC dev helper 居业务 module) | `src/dev/forceSpawn.js` `export function __devForceSpawnWorkers(state, targetCount, rng)` (~95 LOC, 含原 JSDoc) + `src/simulation/population/PopulationGrowthSystem.js` 单行 `export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js";` re-export shim | 调用方 (`src/app/GameApp.js:21`, `test/long-run-api-shim.test.js:269/288/291`) 零改 |
| `src/simulation/population/PopulationGrowthSystem.js` 顶部 `import { randomPassableTile, listTilesByType, tileToWorld } from "../../world/..."` + `import { createWorker } from "../../entities/EntityFactory.js"` （仅 helper 用） | 移到 `src/dev/forceSpawn.js`；原 file 删除（如 RecruitmentSystem 主体不再用到） | import 守卫，避免业务 module 静态依赖 dev surface |
| **(no change)** `WorkerStates.js` / `WorkerTransitions.js` / `WorkerAISystem.js:1654` 调用站点 | 同 | facade 包住，无外部破坏 |
| **(deferred to wave-3)** `src/simulation/npc/VisitorAISystem.js:8-9` 仍 import `StatePlanner` + `StateGraph` | 不动（wave-3 用 PriorityFSM 重构 Visitor 行为） | 本轮 PriorityFSM 抽出为 wave-3/4 铺路，但**0 callers of new class** outside facade |
| **(deferred to wave-4)** `src/simulation/npc/AnimalAISystem.js:8-9` 仍 import `StatePlanner` + `StateGraph` | 不动（wave-4 用 PriorityFSM 重构 Animal 行为） | 同上 |

**system_order_safe = true 证据**：
- `SYSTEM_ORDER`（`src/config/constants.js`）未动：所有 25 个 system 实例化和调度顺序不变。
- WorkerAISystem.update() 内部调用 `this._workerFSM.tickWorker(worker, state, services, dt)`，本轮调用签名零改动；facade 内部走 `this._fsm.tick(...)`，行为字面等价。
- `worker.fsm` / `worker.stateLabel` 单写时机：facade 保留 `enterState` 的 onExit→reset→onEnter 顺序 + tick 末尾 displayLabel 单写。
- 没有跨系统读 / 写关系发生顺序变化（PriorityFSM 是纯 in-memory class，无外部 state 副作用、无 SYSTEM_ORDER 依赖）。
- 测试 `worker-fsm-doc-contract.test.js`（Round 0 78b346e 新增）的 doc-code 锁测保持原有契约不变。

**LOC delta 估算汇总**：
- `src/simulation/npc/PriorityFSM.js`（new）: +95 LOC
- `src/simulation/npc/fsm/WorkerFSM.js`（changes）: 124 → ~30，~-94 LOC
- `src/dev/forceSpawn.js`（new）: +95 LOC
- `src/simulation/population/PopulationGrowthSystem.js`（changes）: 332 → ~245，~-87 LOC（含删 4 个 import）
- `test/priority-fsm-generic.test.js`（new）: +110 LOC
- `src/simulation/npc/fsm/WorkerStates.js` + `src/entities/EntityFactory.js`（注释级）: ±0 LOC
- **Net**: ~+340 / -181 = **+159 LOC**，well under 400 LOC budget。

**外部可观察行为不变 invariant 证据**：
- `worker.fsm = { state, enteredAtSec, target, payload }` 字段 + 默认值 + 重置时机不变（lock 测在 `worker-fsm-*.test.js` 已覆盖）。
- `worker.stateLabel` 单写时机不变（dispatcher 末尾，从 `DISPLAY_LABEL[fsm.state]` 取）。
- `__devForceSpawnWorkers(state, targetCount, rng)` 签名 / 返回字段 / 副作用（`devStressSpawnTotal` 计数 + `isStressWorker` tag + infraCap 行为）完全一致。
- `WorkerFSM.getStats()` 返回 `{ transitionCount, tickCount }` 不变。
- `worker-fsm-doc-contract.test.js` 锁测继续 pass（doc 契约不变）。
