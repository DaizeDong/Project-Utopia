---
reviewer_id: 02c-speedrunner
feedback_source: Round1/Feedbacks/02c-speedrunner.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P1
estimated_scope:
  files_touched: 2
  loc_delta: ~70
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

## 1. 核心问题

Reviewer 给 3/10，但大部分扣分点（"AI 抢戏"/"Survival 公式扁平"/"无 leaderboard"/"Raid 指数升级"/"Emergency Relief 兜底"/"Worker 从 carry 吃饭") 都是 **mechanic 层面的设计方向**，在 HW06 freeze 约束下一律不能动。我只能处理 reviewer 显式指出的两个 **已暴露调试 API 的 bug / UX 缺陷**，它们是纯 fix 而非 mechanic：

1. **`window.__utopiaLongRun.placeToolAt` 的参数形态反直觉**（reviewer B1）。
   - 实际签名是 `placeToolAt(tool, ix, iz)`（三个位置参数；见 `src/main.js:47` → `src/app/GameApp.js:915`）。
   - reviewer 按"JS 惯用 options-bag"风格调用了 `placeToolAt({tool, ix, iz})`。此时 `tool` 形参绑定到整个对象 `{tool:'kitchen', ix, iz}`，GameApp.js:916 会把这个**对象**直接赋给 `state.controls.tool`，后续的 `buildSystem.placeToolAt(state, <object>, undefined, undefined)` 走 fallback → tool 名解析失败 → 默认当作 `road`，且**把工具栏 `controls.tool` 污染成了对象**。这解释了 reviewer "永远摆 road / tool 状态被搞坏"的现象。
   - **根因：API 形状对外不友好，且没有输入校验。**

2. **`window.__utopiaLongRun.regenerate({template})` 不换模板**（reviewer B2）。
   - `regenerateWorld({ templateId, seed, … })` 在 `src/app/GameApp.js:930` 解构的是 `templateId`；reviewer 传的是 `template`。结果 `templateId === undefined`，`createInitialGameState` 落回默认 `temperate_plains`，seed 照用 → 表现为"只换 seed 不换 template"。
   - **根因：参数命名没有别名，且静默忽略未识别 key。**

（第三个 bug B3 "worker 从 carry 吃饭" 属于 mechanic——资源消费链路设计决定——freeze 之后不能改，仅在 plan 第 7 节作 UNREPRODUCIBLE/out-of-scope 标注。）

## 2. Suggestions（可行方向）

### 方向 A: 在 `main.js` 外层 API shim 层做 adapter + 输入校验（推荐）
- 思路：不改 `GameApp.placeToolAt` / `regenerateWorld` 的内部签名（避免波及 `BuildToolbar.onRegenerateMap`、17 处现存 test/harness 调用），只在 `src/main.js` 暴露 `__utopiaLongRun` 时做参数归一化：
  - `placeToolAt` 支持两种形态：`placeToolAt(tool, ix, iz)` **和** `placeToolAt({tool, ix, iz})`。传入非法 `tool`（非字符串 / 不在允许列表）时**不**污染 `controls.tool`，而是返回 `{ok:false, reason:"invalidArgs", reasonText:"..."}`。
  - `regenerate(params)` 支持 `template` 作为 `templateId` 的别名（以及 `seedValue` → `seed` 容错可选）。
- 涉及文件：`src/main.js`（仅此一个；新增 adapter 函数 + 导入常量）；新测试 `test/long-run-api-shim.test.js`。
- scope：**小**（adapter 本体 ~30 LOC + 测试 ~40 LOC）。
- 预期收益：**直接把 reviewer 的 B1+B2 清零**；任何 headless / benchmark / AI 训练脚本从此能稳定 bulk place kitchen/clinic/smithy；不动 freeze 相关 mechanic。
- 主要风险：`src/main.js` 现阶段没有单元测试覆盖（它是 Vite entry），需要把 adapter 抽成可导出的纯函数才能 `node --test`。

### 方向 B: 改 `GameApp.placeToolAt` / `regenerateWorld` 本身为 dual-signature
- 思路：直接让 `GameApp.placeToolAt` 接受 `(toolOrArgs, ix?, iz?)`，在函数体开头做 `if (typeof toolOrArgs === 'object') {...}`。`regenerateWorld` 同理接受 `template` 别名。
- 涉及文件：`src/app/GameApp.js`、`src/main.js` 不变；所有既有 test 不变（都用位置参数）；`BuildToolbar` 不变。
- scope：**小-中**（~35 LOC in GameApp，但触到了生产路径）。
- 预期收益：同 A，但调用路径少一层。
- 主要风险：`GameApp.placeToolAt` 也被 `scripts/soak-browser-operator.mjs`、生产路径 build-toolbar 点击流调用；给生产函数加 polymorphism 会让未来读代码的人产生歧义。方向 A 把 "外部 API 容错" 和 "内部稳定签名" 清晰分层，更干净。

## 3. 选定方案

选 **方向 A**。理由：

- **隔离度高**：`src/main.js` 是 entry 薄层，专门就该做外部 API 的 normalize。内部 `GameApp` 签名不变 → 现存 ~17 个 `placeToolAt` 调用点和 865 个测试全不受影响。
- **可测性高**：把 `normalizePlaceToolArgs` / `normalizeRegenerateArgs` 抽成纯函数导出，可用 Node `--test` 直接覆盖，不需要启 Vite。
- **不触碰 mechanic**：零改 simulation/、balance/、constants/，freeze 约束下 orchestrator 不会拒收。
- **优先级**：reviewer 明确把 B1、B2 列为"破坏 automation / speed-strat 的实现缺陷"，是 P1 fix；小 scope 能在 25 分钟内落地。

## 4. Plan 步骤

- [ ] **Step 1**: `src/main.js:1-10` — `edit` — 在文件顶部新增一个 import 常量列表（合法 tool 名的白名单），从 `src/config/constants.js` 或直接本地硬编码为 `VALID_BUILD_TOOLS = Object.freeze(["road","farm","lumber","warehouse","wall","bridge","erase","quarry","herbs","kitchen","smithy","clinic"])`（与 `BuildToolbar` 工具栏 12 个条目对齐；同时允许 `"road_plan"`/`"erase"` 等已有 alias）。优先 import 已存在的常量（如 `TILE` 的反查或 `src/config/constants.js` 中已导出的 `TOOL`-like 集合）；若不存在就直接定义本地常量并加 JSDoc 注释"debug API shim whitelist, keep in sync with BuildToolbar"。
  - 验证点：Grep `BuildToolbar.js` 里 `dataset.tool`/`tool:` 字面量，确保白名单完全一致。

- [ ] **Step 2**: `src/main.js:47` — `edit` — 替换现有的 `placeToolAt` 箭头函数为一个 adapter：
  ```js
  placeToolAt: (...args) => {
    const norm = normalizePlaceToolArgs(args);
    if (!norm.ok) return norm; // {ok:false, reason:"invalidArgs", reasonText, received}
    return app?.placeToolAt?.(norm.tool, norm.ix, norm.iz) ?? null;
  },
  ```
  新增 `export function normalizePlaceToolArgs(args)` 实现：
  - 若 `args.length === 1 && typeof args[0] === 'object' && args[0] !== null`：从对象里读 `tool, ix, iz`。
  - 若 `args.length >= 3`：按位置参数读。
  - 若 `tool` 不是字符串 或 不在 `VALID_BUILD_TOOLS`：返回 `{ok:false, reason:"invalidArgs", reasonText:"placeToolAt: unknown tool '<value>'. Valid tools: road, farm, lumber, warehouse, wall, bridge, erase, quarry, herbs, kitchen, smithy, clinic."}`。
  - 若 `ix`/`iz` 不是有限整数：返回 `{ok:false, reason:"invalidArgs", reasonText:"placeToolAt: ix/iz must be finite integers."}`。
  - depends_on: Step 1

- [ ] **Step 3**: `src/main.js:42` — `edit` — 替换现有的 `regenerate` 箭头函数为一个 adapter：
  ```js
  regenerate: (params, options) => {
    const norm = normalizeRegenerateArgs(params);
    return app?.regenerateWorld?.(norm, options) ?? null;
  },
  ```
  新增 `export function normalizeRegenerateArgs(raw)` 实现：
  - 复制 `raw` 为浅拷贝 `params`；若传的是 `null`/非对象则返回 `{}`。
  - 若 `params.templateId == null && typeof params.template === 'string'`：`params.templateId = params.template`，并 `console.warn("[utopia] regenerate({template}) is deprecated; use {templateId}")`（仅警告，不抛）。
  - 不删除原键（确保兼容既有调用，如 `long-run-support.mjs:347` 传的是 `templateId` 已对）。
  - depends_on: Step 1

- [ ] **Step 4**: `src/main.js` 文件底部（在 `try {...} catch` 块之后，模块 export 区域）— `add` — 增加 `export { normalizePlaceToolArgs, normalizeRegenerateArgs }`，使这两个纯函数可被 Node test runner 直接 import 而无需触发 Vite/Three.js 副作用。
  - **关键**：确保这两个函数定义在 `try {...}` 之外的模块顶层，且**不依赖 `window` / DOM / Three.js**（纯参数校验）。
  - depends_on: Step 2, Step 3

- [ ] **Step 5**: `test/long-run-api-shim.test.js` — `add` — 新建测试文件，使用 `node:test` + `node:assert/strict`。覆盖：
  1. `normalizePlaceToolArgs(["kitchen", 10, 20])` → `{ok:true, tool:"kitchen", ix:10, iz:20}`。
  2. `normalizePlaceToolArgs([{tool:"kitchen", ix:10, iz:20}])` → `{ok:true, tool:"kitchen", ix:10, iz:20}`。
  3. `normalizePlaceToolArgs(["bogus", 1, 2])` → `{ok:false, reason:"invalidArgs"}` 且 `reasonText` 含 `"unknown tool"`。
  4. `normalizePlaceToolArgs([{tool:"kitchen"}])` → `{ok:false, reason:"invalidArgs"}`（缺 ix/iz）。
  5. `normalizePlaceToolArgs([])` → `{ok:false, reason:"invalidArgs"}`。
  6. `normalizeRegenerateArgs({template:"fertile_riverlands"})` → `{templateId:"fertile_riverlands", template:"fertile_riverlands"}`。
  7. `normalizeRegenerateArgs({templateId:"temperate_plains", seed:42})` → 原样。
  8. `normalizeRegenerateArgs(null)` → `{}` 且 `normalizeRegenerateArgs(undefined)` → `{}`。
  - depends_on: Step 4

- [ ] **Step 6**: `CHANGELOG.md:<Unreleased section>` — `edit` — 在 "Bug Fixes" 下追加条目：
  - `Fixed __utopiaLongRun.placeToolAt silently falling back to 'road' when called with an options-bag ({tool, ix, iz}) instead of positional args — now accepts both forms and returns {ok:false, reason:"invalidArgs"} on unknown tools without polluting controls.tool.`
  - `Fixed __utopiaLongRun.regenerate({template}) being ignored — 'template' is now accepted as an alias of 'templateId' (with a one-time console.warn).`
  - depends_on: Step 5

## 5. Risks

- **R1 — `src/main.js` 本来不是 module-style 可测文件**：它的 side effect 是 mount DOM + `new GameApp`。方向 A 要求 `normalize*` 函数在 `try {...}` 作用域之外被 `export`。若不小心让它们依赖 `app` / `window`，测试会在 Node 下炸。**缓解**：在 Step 2/3 里明确这两个函数是**纯函数**（只看 `args`），把它们放到 `import` 语句紧下方。
- **R2 — 白名单与 `BuildToolbar` 不同步**：若以后新增 tool（freeze 后应该不会，但 Phase 9 可能）却忘了同步常量，新 tool 会被这层挡掉。**缓解**：加 JSDoc 注释；最好从 `BuildToolbar` 或 `constants.js` 统一导出一个 `VALID_BUILD_TOOLS`。先查 `src/config/constants.js` 是否已有此导出；若有就复用。
- **R3 — `regenerate` 新增 `console.warn` 可能污染 benchmark log**：`scripts/long-run-support.mjs` 正确传 `templateId` 不会触发；仅用户控制台 cheese 时触发。可接受。
- **R4 — `normalizePlaceToolArgs` 对 `ix/iz` 过严会挡掉现存脚本**：检查 `soak-browser-operator.mjs` / `evaluator-benchmark.mjs` 里 `placeToolAt` 调用点确认传的都是整数。
- **可能影响的现有测试**：
  - `test/build-system.test.js`（所有 `buildSystem.placeToolAt(state, …)` 调用，不走 shim，应**不受影响**）。
  - `test/phase1-resource-chains.test.js`、`test/demo-recycling.test.js`、`test/skill-library-executor.test.js`（同样走 `buildSystem` 直连或 `GameApp`，不经过 window shim）。
  - `test/ui-layout.test.js` 涉及 `regenerate` / BuildToolbar — 走的是 `onRegenerateMap` 回调，不走 shim，应**不受影响**。
  - 风险面小，预期 865 tests + 1 new = 866 全绿。

## 6. 验证方式

- **新增测试**：`test/long-run-api-shim.test.js` 覆盖 8 个 case（见 Step 5）。执行：`node --test test/long-run-api-shim.test.js`。
- **手动验证**：
  1. `npx vite` → 打开 http://127.0.0.1:5173 → Start Colony。
  2. 开 DevTools console，执行：
     - `__utopiaLongRun.placeToolAt({tool:"kitchen", ix:10, iz:20})` → 期望返回 `{ok:true, …}` **或**合法的 `{ok:false, reason:"occupiedTile"/"insufficientResource"}`（不再是"永远 road"）。
     - `__utopiaLongRun.placeToolAt("bogus", 10, 20)` → 期望返回 `{ok:false, reason:"invalidArgs"}`，且 `__utopia.state.controls.tool` **仍然是字符串**（未被污染）。
     - `__utopiaLongRun.regenerate({template:"fertile_riverlands"})` → 期望 HUD `mapTemplateName` 变成 "Fertile Riverlands"，且 console 打印 deprecation warning。
     - `__utopiaLongRun.regenerate({templateId:"archipelago_isles"})` → 无 warning，切换成功。
  3. `__utopia.state.controls.tool` 输出必须仍是合法字符串（"road"/"kitchen"/…）。
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs` seed 42 / `temperate_plains` — 由于 `long-run-support.mjs:347` 一直传的是 `templateId`（已对），此改动对 headless benchmark 零影响。DevIndex 不得低于当前 baseline - 5%（当前 Phase 10 post-fix 值 ≈ 44 → 阈值 ≥ 42）。
- **全量测试**：`node --test test/*.test.js` → 期望 866 passing / 2 skipped / 0 failing。

## 7. UNREPRODUCIBLE 标记

- **B3（worker carry vs global food pool）**: **out-of-scope**。这属于 worker 消费路径设计（`src/simulation/npc/WorkerAISystem.js` 的 hunger→carry.food→eat 链），改动涉及 eating policy 语义，等同于加/换 mechanic，**违反 freeze**。CLAUDE.md 里也标注过这是 Phase 9 punted 项。此次 plan 不处理。
- **reviewer 其他 9 项扣分（AI 抢戏 / Score 扁平 / Emergency Relief / raid escalator / kitchen 触发率 / 无 leaderboard / FF 按钮无用 / 无 player skill expression / 无重玩冲动）**：全部属于 mechanic/gameplay balance 调整，**freeze 禁区**，本轮不做。如后续 Phase 9 解除 freeze，建议参考 `docs/superpowers/plans/` 新开一份"player-agency"专题 plan。
- **复现状态**：B1、B2 的根因在代码里直接可读（`src/main.js:47` 位置参数签名 / `src/app/GameApp.js:930` 只认 `templateId`），**无需 Playwright 重启浏览器**即可确定根因 → 未使用 MCP browser，节省预算。
