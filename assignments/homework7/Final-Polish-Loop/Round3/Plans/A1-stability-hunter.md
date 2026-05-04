---
reviewer_id: A1-stability-hunter
reviewer_tier: A
feedback_source: Round3/Feedbacks/A1-stability-hunter.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~+60 / -10
  new_tests: 1
  wall_clock: 45
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **Save Snapshot 抛 DataCloneError** — `makeSerializableSnapshot` 只对 `state` 调用 `structuredClone`，但是某条死亡 toast handler `(event) => this.#handleDeathToastEvent(event)` 通过某个对象图 (event-bus 监听器列表 / GameApp 反向引用 / NPC.deathListeners) 漏入 state；structuredClone 在遇到函数引用时整体失败。根因是 sanitiser 不是白名单字段而是黑盒 clone。
2. **Load Snapshot 让主循环崩溃** — `restoreSnapshotState` 没有恢复 `state.grid.tileState` 为 Map 实例（line 165-200 只恢复 `grid.tiles` Uint8Array、`ai.groupPolicies` Map，未触 `grid.tileState`）。SceneRenderer.js:1978/2085/2222/2245/2904-2908 全部假定 `grid.tileState.get(idx)` 是 Map.get；反序列化后 tileState 是 plain object（或 undefined），首帧 render 即 `tileState.get is not a function`。

两个 bug 同源（snapshotService.js 序列化/反序列化对偶不全）。

## 2. Suggestions（可行方向）

### 方向 A: 在 makeSerializableSnapshot 增加 listener / 函数剥离 + 在 restoreSnapshotState 显式恢复 tileState Map

- 思路：在 `makeSerializableSnapshot` 入口先做一层 strip-listeners (递归扫 state，遇到 function 字段直接丢弃；遇到事件总线引用也丢弃)，然后再 `structuredClone`；同时 `mapToEntries` 扩展一条 `state.grid.tileState`；`restoreSnapshotState` 中用 `entriesToMap` 还原 `snapshot.grid.tileState`。
- 涉及文件：`src/app/snapshotService.js`（makeSerializableSnapshot + restoreSnapshotState 主体），新建 `test/snapshot-tileState-roundtrip.test.js`
- scope：小
- 预期收益：Save 不再 DataCloneError；Load 后 `tileState.get` 是 Map.get；P0-1 + P1-1 同时关闭。
- 主要风险：tileState 字段 v0.8.x 起新增过 nodeFlags / yieldPool / salinization 等子键，serialise 时若深度 clone 不够则 round-trip 丢字段；mitigation 用 `mapToEntries` 已有的 `[k, ensureStructuredClone(v)]` 模式。
- freeze 检查：OK（无新 tile/role/building/mood/UI）

### 方向 B: 在 GameApp.saveSnapshot / loadSnapshot try-catch 兜底 + 失败时 graceful 不杀主循环

- 思路：在 `GameApp.saveSnapshot` (GameApp.js:1626) 包 try/catch，DataCloneError 时 toast warn 不抛；`loadSnapshot` 在 restore 后做 `state.grid.tileState instanceof Map` 校验，不是 Map 就 abort restore + 回滚到 pre-load state。
- 涉及文件：`src/app/GameApp.js`
- scope：小
- 预期收益：缓解症状（不丢 colony、不到标题屏），但不解决根因。
- 主要风险：把 bug 从 crash 变成 silent corruption（玩家以为 Load 成功但实际是 pre-load 状态）；如果 sanitiser 残留 listener，每次 Save 仍失败。
- freeze 检查：OK

### 方向 C: 改用 JSON.stringify(replacer) + JSON.parse(reviver) 全替 structuredClone

- 思路：完全绕开 structuredClone，改 JSON 路径，replacer 跳过 function。
- 涉及文件：`src/app/snapshotService.js` 大改
- scope：中
- 预期收益：无函数能进 JSON。
- 主要风险：性能下降 (state ~MB 级)；TypedArray 必须特殊处理；改动面比方向 A 大 5×。
- freeze 检查：OK

## 3. 选定方案

选 **方向 A**。理由：(a) P0 紧急，方向 A scope 最小；(b) 同时关闭 Save + Load 两个 bug；(c) 延续 snapshotService.js 既有的 `mapToEntries` / `entriesToMap` 对偶模式，符合现有架构；(d) 方向 B 是治标不治本，方向 C 改动太大风险高。

## 4. Plan 步骤

- [ ] Step 1: `src/app/snapshotService.js:9-12` (`ensureStructuredClone`) — edit — 增加 `stripUncloneable(value)` helper：递归扫描，遇到 `typeof v === "function"` 跳过该字段；遇到带 `__noClone` 标记或继承自 EventTarget / NPCBrain listener 数组时跳过；其它字段保留。在 ensureStructuredClone 入口先调用 stripUncloneable。
- [ ] Step 2: `src/app/snapshotService.js:144-154` (`makeSerializableSnapshot`) — edit — 在 `snapshot.grid.tiles = Array.from(...)` 后追加：`if (state.grid.tileState instanceof Map) snapshot.grid.tileState = mapToEntries(state.grid.tileState);`
  - depends_on: Step 1
- [ ] Step 3: `src/app/snapshotService.js:165-205` (`restoreSnapshotState`) — edit — 在 `snapshot.grid.tiles = Uint8Array.from(...)` 后追加：`snapshot.grid.tileState = entriesToMap(snapshot.grid.tileState);`（遵循 `ai.groupPolicies` 处的等价语句模式）
  - depends_on: Step 2
- [ ] Step 4: `src/app/GameApp.js:1626` (`saveSnapshot` 入口) — edit — 用 try-catch 包 `snapshotService.saveToStorage(...)`；catch 内调用 `this.toast.warn("Save Snapshot failed: " + e.message)` 而不 rethrow，保 UI 不挂。
  - depends_on: Step 3
- [ ] Step 5: `test/snapshot-tileState-roundtrip.test.js` — add — 新建测试：构造一个最小 state（含 grid.tileState Map 带 1 entry { idx:5, payload:{ nodeFlags:2, yieldPool:99 } }）→ makeSerializableSnapshot → JSON.parse(JSON.stringify(...)) (模拟 localStorage 路径) → restoreSnapshotState → assert `result.grid.tileState instanceof Map && result.grid.tileState.get(5).yieldPool === 99`。
  - depends_on: Step 3
- [ ] Step 6: `test/snapshot-listener-strip.test.js` — add — 测试：构造 state 故意挂 `state.__deathListener = () => 1`；`makeSerializableSnapshot(state)` 不抛错；返回 payload 不含 `__deathListener` 字段。
  - depends_on: Step 1

## 5. Risks

- snapshotService.js 是 22 个测试文件依赖路径，stripUncloneable 若过于激进可能误删合法字段。Mitigation：只剥离 `typeof === "function"`，其它原样保留。
- tileState entries 数量在 mid-game 可能 ~6000+；mapToEntries 复制开销 ~10ms（仍 <Save 总耗时）。
- 可能影响的现有测试：`test/snapshotService.test.js`（如存在）、`test/GameApp.save-load.test.js`（如存在）；运行 `node --test test/*snapshot*.test.js` 验证。

## 6. 验证方式

- 新增测试：`test/snapshot-tileState-roundtrip.test.js`、`test/snapshot-listener-strip.test.js` 覆盖 Save/Load 对偶 + listener 剥离。
- 手动验证：`npx vite` → 进游戏 → 触发 1 次 worker 杀 wolf 死亡 → Debug 面板 Save Snapshot → 期望 toast "Snapshot saved" 而非 DataCloneError → Load Snapshot → 期望 colony 状态保留 + 无 "tileState.get is not a function" → 主循环继续渲染。
- FPS 回归：`window.__fps_observed.fps` Save 前后差 < 5%。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains DevIndex 不得低于 baseline -5%。
- prod build：`npx vite build` 无错；`vite preview` 1 分钟 smoke + Save/Load 操作 0 console error。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

可复现。Stack trace 在 feedback 内完整保留：DataCloneError 指向 snapshotService.js:10 (`ensureStructuredClone`)；renderer crash 指向 SceneRenderer.js → tileState.get（确认 tileState 反序列化失败成 plain object）。
