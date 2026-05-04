---
reviewer_id: A2-performance-auditor
reviewer_tier: A
feedback_source: Round1/Feedbacks/A2-performance-auditor.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P1
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 2
  loc_delta: ~80
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

A2 R1 测得 P3/P4 p50 ≈ 54-56 fps，稳态帧时间约 18 ms — **超 60 fps 预算 ~2 ms**，无尖峰、无泄漏、无加速期 GC。p5（43-45 fps）仍远超 30 fps target。8.5 min 实时堆增长 70.9%（WARN，未达泄漏阈），主要是缓存累积 + GC 周期，非 P0。

归并为**一个根本问题**：

**SceneRenderer.render() 在每个 RAF 帧上无差别地执行 8 个 `#update*` 子例程**（`#applyAtmosphere`, `#rebuildTilesIfNeeded`, `#updateEntityMeshes`, `#updatePathLine`, `#updatePressureLens`, `#updatePressureLensLabels`, `#updatePlacementLens`, `#updateTerrainFertilityOverlay`, `#updateOverlayMeshes`, `#updateConstructionOverlays`），其中至少 3 处即使在缓存命中也每帧分配 string / object 字面量：

- `src/render/SceneRenderer.js:2568-2587` — `#pressureLensSignature` 每帧都跑 `(state.events.active).map(...).join("|")` + `(metrics.ecology.hotspotFarms).map(...).join("|")` 仅为求 cache key，命中也照分配 2 个 string + 临时数组。
- `src/render/SceneRenderer.js:2256-2295` — `#updatePressureLensLabels` 每帧重建 `projected[]`、`entries[]`、`entryToPoolIdx[]`、`visibleCandidates[]`、`Map`、`new Map()`（_prevLabelSignatures next），即使 markers 数组未变。
- `src/render/SceneRenderer.js:3145-3152` — `#entityMeshUpdateIntervalSec` 在 `totalEntities < 350`（A2 P3/P4 测得 pop=21）时返回 `0`，导致 `#updateEntityMeshes` 每帧重建实体 InstancedMesh、收集 4 个 buckets。pop=21 时此节流策略 = 不节流。

R0 已铺好的 perftrace 探针（`window.__perftrace.topSystems` 与 `state.debug.systemTimingsMs`）只测了 sim 层 22 systems，但 A2 测得稳态 18 ms 总帧 — sim 在 P3/P4 仅占其中一小块（v0.10.0 FSM dispatcher 已优化），其余主要在 SceneRenderer.render（`state.metrics.renderCpuMs`）。**主要嫌犯是渲染层的 per-frame allocation + 无门控的 cache-key 字符串构建**。

## 2. Suggestions（可行方向）

### 方向 A: 给 #pressureLensSignature 与 #updatePressureLensLabels 加 version-stamp 早退 + 复用 scratch buffer

- 思路：(a) 把 `#pressureLensSignature` 的 string-join 换成 version-id 比较（events.activeVersion / ecology.hotspotVersion 已存在或可添加 monotonic counter）；(b) `#updatePressureLensLabels` 用 module-scope `_projectedScratch` / `_entriesScratch` 数组，按 length 重置不重新分配。
- 涉及文件：`src/render/SceneRenderer.js`（行 2212-2431, 2568-2587）
- scope：小
- 预期收益：消除每帧 ~6 个 string-build + ~4 个临时数组 + 1 个 Map 的分配；估计 0.3-0.6 ms。GC 压力显著下降（A2 P5 长程 70.9% 增长部分来自这里）。
- 主要风险：version-counter 需要 PressureLens / EconomyTelemetry 同步增量；如果有路径忘记 bump 会卡住（label 不更新）。比较安全的做法是**保留 string-sig 但提前用 length / version 做粗筛**。
- freeze 检查：OK — 纯内部数据结构改动，不新增任何 tile / role / building / panel。

### 方向 B: 把 #updateEntityMeshes 节流下界从 350 拉到 0（pop=21 也走 1/30s 间隔）+ 跳过未变 entity 时的 InstancedMesh.needsUpdate

- 思路：当 `totalEntities < 350` 时也返回非零 interval（如 1/30s = 跟 sim 步长对齐），并加 `entityVersion` 检查 — 若 entity 数组没增删且每个 entity 的 `(x,z)` 自上帧变化 < 0.01 单位则跳过 instanceMatrix 写入和 needsUpdate=true。
- 涉及文件：`src/render/SceneRenderer.js:3145-3152`（interval 表）、`3248-3298`（4 个 setInstancedMatrix 块）
- scope：小
- 预期收益：在 pop=21 + 60 Hz RAF 场景下，InstancedMesh 写入从 60 Hz 降到 30 Hz；估计 0.3-0.5 ms。但 A2 测得 frameDt 18ms = ~55 fps，所以实际 RAF 频率本就<60，节流幅度可能小于纸面值。
- 主要风险：1/30s 间隔下，1× speed 看起来仍流畅；但 hover / 选中 entity 的 selection ring 跟随会有 ~33 ms 延迟，casual profile 用户可能感到"粘滞"。可通过 `selectedEntityId` 在场时强制每帧更新该一个实体来缓解。
- freeze 检查：OK — 不新增任何 mechanic / panel。

### 方向 C: 把 22-system tick 链按 cadence 分级（每 N 步跑一次的低优先级 system）

- 思路：在 `SYSTEM_ORDER` 中给非每帧关键的 system（如 ProgressionSystem / DevIndexSystem / AgentDirectorSystem）标 `tickEveryN`，同步状态机在 (tick % N === 0) 时才调用 update。
- 涉及文件：`src/config/constants.js`（SYSTEM_ORDER）、`src/app/GameApp.js`（stepSimulation 行 458-499）、对应 system 文件
- scope：中
- 预期收益：理论 0.5-1.5 ms（DevIndex / Progression 通常每秒一次足够）。
- 主要风险：**改变 sim 时序**会破坏 v0.10.0 invariant 测试；FSM 与 DevIndex 之间存在隐性数据竞争（CLAUDE.md 已警告 `assertSystemOrder(["DevIndexSystem", "RaidEscalatorSystem", "WorldEventSystem"])`）。容易引入难以重现的回归。
- freeze 检查：OK（不新增内容），但**风险/收益比差**——A2 数据说 sim 在 P3/P4 已不是瓶颈（"v0.10.0 FSM 重写已优化"），动 SYSTEM_ORDER 是动既存稳定面。

### 方向 D: 把 SceneRenderer 几个 per-frame `#update*` 改用 grid-version / entity-version / events-version 做 dirty 检查

- 思路：在 GameApp 写一个轻量 `state.versions = { grid, entities, events, ecology, weather }` monotonic-counter，所有 mutator 自增。SceneRenderer 各 `#update*` 改成 "if version unchanged → return"。这是方向 A 的泛化。
- 涉及文件：`src/render/SceneRenderer.js`、`src/app/GameApp.js`、被改 mutator 的 system 文件（潜在 5-10 个）
- scope：大
- 预期收益：1-2 ms（完整覆盖所有 #update*）
- 主要风险：触及多个 system 的 mutator，每漏 bump 一处 → "渲染卡死在旧帧"。LOC 大概 300-500，超过这一轮 30 min 的 deadline。
- freeze 检查：OK，但 scope 太大，留给后续 round。

## 3. 选定方案

选 **方向 A**（叠加方向 B 的轻量子集 — 仅"selected entity 期间强制更新"那一行）。

理由：
1. **A2 R0 报告里明确指出 perftrace 探针已布好但**「下游使用 Chrome DevTools Performance 录屏定位」**未做** — 渲染层的稳态分配是最可疑的 ~2 ms 候选。
2. 方向 A 完全在 SceneRenderer 内部，**0 风险触及 SYSTEM_ORDER**，0 风险触及 freeze。
3. scope 小（~80 LOC），30 min deadline 内可落地。
4. 方向 C 风险/收益比差（A2 自己说 sim 不是 super-linear 瓶颈）。
5. 方向 D 收益大但 LOC 超 400，本轮不做。
6. 选定方向 A 完成后，剩余的 ~1 ms 留给后续 round 用方向 D 收尾。

**注**: 此 plan 完全是 P1 优化（YELLOW verdict、p5 远超 30 fps、未影响 playability），不是 P0 阻塞修复。Implementer 若 25 min 无法完成，**优先保 step 1+2+5**（最大收益的两步 + 测试），step 3+4 可延后。

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/SceneRenderer.js:2568-2587` `#pressureLensSignature` — `edit` — 在函数开头加 length / version 粗筛短路：若 `state.events.active.length === this._lastEventsLen && state.metrics.ecology?.hotspotFarms?.length === this._lastHotspotsLen && state.grid.version === this._lastGridVerForLensSig && state.metrics?.traffic?.version === this._lastTrafficVerForLensSig` → 直接 return `this._cachedLensSignature`。否则按现逻辑构建 string，并把这 4 个 length/version 与 string 一起记到对应 `this._last*` 字段。

- [ ] **Step 2**: `src/render/SceneRenderer.js:2256-2304` `#updatePressureLensLabels` projection / entries 循环 — `edit` — 把局部 `const projected = []` 和 `const entries = []` 替换为 module-scope 或 instance-scope scratch buffer：构造函数中加 `this._labelProjectedScratch = []; this._labelEntriesScratch = []; this._labelEntryToPoolIdxScratch = [];`；render 时 `arr.length = 0` 复用，**不分配新数组**。`visibleCandidates` 同处理。`new Map()` 改成 `this._visibleScratchMap.clear()`（构造函数中预分配）。
  - depends_on: 无

- [ ] **Step 3**: `src/render/SceneRenderer.js:3145-3152` `#entityMeshUpdateIntervalSec` — `edit` — 在小 entity 数（< 350）时返回 `1/30`（旧值是 `0` = 每帧），但当 `this.state.controls?.selectedEntityId != null` 时仍返回 `0` 以保 selection ring 流畅。注释引 A2 R1 feedback。
  - depends_on: 无

- [ ] **Step 4**: `src/render/SceneRenderer.js:3300-3305` `renderEntityLookup` 写回 — `edit` — 把每帧重建的 `this.renderEntityLookup = { workers, visitors, herbivores, predators }` 对象字面量改为复用单一 `this._entityLookupScratch`：构造函数预分配 `this._entityLookupScratch = { workers: null, visitors: null, herbivores: null, predators: null }`，渲染时仅赋值字段不重新分配 object。
  - depends_on: Step 3

- [ ] **Step 5**: `test/perf-allocation-budget.test.js` — `add` — 新测试，用 SimHarness + `temperate_plains` seed=4242 + 200 个 RAF tick（手动驱动），每 tick 调用一次 `renderer.render(0.0167)`（mock-friendly path），**断言**：(a) `#pressureLensSignature` 在静态状态下连续 50 帧返回同一字符串实例（identity check `===`，证明短路生效）；(b) `_labelProjectedScratch.length` 在两次 render 之间不增长（reuse 证明）。**Soft-skip** via `t.skip()` on `CI_FAST=1` 以避免 headless DOM 缺失。若 SceneRenderer 在 node-test 下需要 DOM，则改为只测 #pressureLensSignature 的 cache identity（不需要 DOM）。
  - depends_on: Step 1, Step 2

## 5. Risks

- **R1**: Step 1 的 length/version 粗筛若漏看某个 mutator（比如 `state.weather.pressureScore` 在某 system 内被改但未触发任何 length 变化），会出现"压力 lens 卡死在旧 marker"。**缓解**：粗筛失败回落到原 string-join 路径；保留 string-sig 作为最终判据。这是叠加优化不是替代。
- **R2**: Step 3 的 1/30s 节流可能让 1× speed 的 worker 看起来"30 Hz 跳帧"而不是平滑 60 Hz。**缓解**：节流值与 sim fixed-step 对齐（1/30s 正是 sim 步长），entity 移动本来就 30 Hz 离散。视觉上不应有差。selectedEntityId fast-path 保 hover/选中流畅。
- **R3**: Step 2 / Step 4 复用 scratch 数组若忘记 `length = 0` 会读到上帧脏数据 → label 错位 / 重叠。**缓解**：scratch reset 写在每个调用点的最前 3 行，加注释。
- **R4**: 可能影响的现有测试：
  - `test/perf-system-budget.test.js`（R0 新增的）— 不应受影响（只测 sim，未触及渲染）
  - `test/scene-renderer-*.test.js`（如有）— 需 implementer 跑确认 label 渲染逻辑回归
  - `test/pressure-lens-*.test.js` — 同上
  - `test/perf-budget*` 系列 — 应该改善而非劣化
- **R5**: 若 implementer 误把 Step 2 scratch 用 `module-scope` 而非 `instance-scope`，多个 SceneRenderer 实例（Playwright 测试 / hot-reload）会互相污染。**强制**：必须挂在 `this._*` 上。

## 6. 验证方式

- **新增测试**: `test/perf-allocation-budget.test.js` 覆盖 #pressureLensSignature cache-identity + label scratch reuse 不增长。详见 Step 5。
- **手动验证**:
  1. `npx vite` → `http://localhost:5173?perftrace=1`
  2. 启动 Temperate Plains，等 ~120 s 实时（pop ~21）
  3. 打开 DevTools Performance 录 5 s → 检查 `Render` task → 期望 `SceneRenderer.render` 自身（不含 `WebGLRenderer.render`）从 ~3-4 ms 降到 ~2-3 ms
  4. DevTools Console: `window.__fps_observed.fps` — 期望从 ~55 涨到 ~57-58（注意：headless RAF 是 throttled 1Hz 的 — 必须真浏览器测）
  5. DevTools Console: `window.__perftrace.topSystems` — 不应出现 `SceneRenderer` 名字（这探针只看 sim 层），但 `state.metrics.renderCpuMs` 应下降 ~0.5 ms
- **FPS 回归**: `browser_evaluate` 5s 平均 `__fps_observed.fps` ≥ 55 fps（baseline = 54.6，目标至少不退）
- **benchmark 回归**: `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains`，DevIndex 不得低于 baseline - 5%（不应受任何影响 — 改动纯渲染）
- **prod build**: `npx vite build` 无错；`npx vite preview` 启动后 3 min smoke 无 console error 无 label 显示异常

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）
