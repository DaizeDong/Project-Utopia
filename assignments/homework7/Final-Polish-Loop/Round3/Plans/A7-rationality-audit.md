---
reviewer_id: A7-rationality-audit
reviewer_tier: A
feedback_source: Round3/Feedbacks/A7-rationality-audit.md
round: 3
date: 2026-05-01
build_commit: 0344a4b
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 5
  loc_delta: ~+60 / -25
  new_tests: 1
  wall_clock: 75
conflicts_with: []
rollback_anchor: 0344a4b
---

## 1. 核心问题

1. **Tile inspector 错的 key hint（P0）** — 显示 "B = build · R = road · T = fertility"，但全局 keymap 是 R = reset camera, T = terrain overlay, build = 1-12，没有 "B"。三键全错。需要要么删除该行要么改成 "Press 1-12 to build" 句式。同步 A3 的 F1 P0。
2. **T overlay 不循环（P1 #4）** — R2 已加 test 但 live 仍只显示 Fertility 不切到 elev / conn / nodes。根因可能是 shortcutResolver T binding 没正确 cycle，或 pickBootSeed 改动破坏了 overlay state。
3. **Heat lens "supply surplus" 在 starvation 时矛盾（P0）** — 红色 = surplus 但工人在挨饿（"queue 卡住"）。tooltip 应 context-sensitive："red = surplus AT this tile (workers starving means delivery blocked, see worker focus)".
4. **Autopilot 超 budget（P1 #5）** — warehouses 6/2、farms 17/6，超目标 3-3 倍。WorldEvent autopilot Plan 没 cap "已达目标" 的建造。

## 2. Suggestions（可行方向）

### 方向 A: 4 处定点修复（hint 文案 + T cycling + heat-lens context tooltip + autopilot cap）

- 思路：
  1. 删除 TileInspectorPopup 的 "B = build · R = road · T = fertility" 错 hint，替换为 "Press 1-12 to select a build tool · Hover to preview"；
  2. shortcutResolver T binding 修：让 T 真的 cycle 4 modes (Fertility → Elevation → Connectivity → Nodes → off)，currentMode 字段从 `state.overlay.terrainMode` 读 + 写；
  3. heat-lens label 在 worker.hungerSeverity > 0.5 + tile 标 "supply surplus" 时改 label 为 "queued (delivery blocked — see workers)" 而非 "supply surplus"；
  4. WorldEvent autopilot Plan 入口加 cap：当 `state.buildings.filter(b=>b.type==target).length >= goal[target]` 时 skip 该 build proposal，加一行 toast "Goal reached: warehouses 2/2 — pausing further warehouse builds".
- 涉及文件：`src/ui/TileInspectorPopup.js`、`src/ui/shortcutResolver.js` (或 InputManager keymap)、`src/render/HeatLensOverlay.js`、`src/world/events/WorldEventSystem.js` 或 ColonyPlanner
- scope：中
- 预期收益：P0 #2 关闭、P0 #1 (heat-lens) 关闭、P1 #4 / #5 关闭。
- 主要风险：T cycling 需要找对 keybind 实现路径，可能 spread 到 InputManager + state.overlay；autopilot cap 与 A5 的 recovery 白名单交互需对齐（A5 强调 farm 必须放，A7 强调超 6/6 不放 — 两者 OK：A5 让 farm 在 0/6 → 6/6 进度内放，A7 在 6/6 后停）。
- freeze 检查：OK（无新 mechanic / role）

### 方向 B: 仅修 P0 (hint + heat-lens) — 最小爆炸面

- scope：小
- 预期收益：P0 关 2 条；P1 全留。
- 主要风险：Reviewer 列 P0 3 + P1 7，部分关；verdict YELLOW 不一定升级。
- freeze 检查：OK

### 方向 C: 重写 keymap 系统统一 single-source-of-truth (FREEZE-VIOLATION 边缘)

- 思路：建立 KeymapRegistry 全局 module，所有 hint / Help / shortcut 都从它读。
- scope：大
- 风险：触发"重大架构整理"应留 C1 wave；本轮不做。
- freeze 检查：超 P0 修复合理范围；不选定。

## 3. 选定方案

选 **方向 A**。理由：(a) Reviewer P0 3 条 + P1 7 条，方向 A 关 4 条（2 P0 + 2 P1）刚好覆盖 verdict 升级最低门槛；(b) 与 A3 (P0 hint 同源) 协同 — A3 plan 已含 Step 6 删 hint；本 plan 进一步加 T cycling fix；(c) 方向 C 超 R3 budget。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/TileInspectorPopup.js` (Grep `B = build\|R = road\|T = fertility`) — edit — 删除整行 hint 或替换为 "Press 1-12 to select a build tool · Hover to preview cost"；同步 A3 plan Step 6 的修改（如 A3 实施在前则确认无冲突）。
- [ ] Step 2: `src/ui/shortcutResolver.js` 或 `src/ui/InputManager.js` (Grep `["']T["']\|cycleTerrain\|terrainOverlay`) — edit — 修 T binding：cycle 顺序 `null → fertility → elevation → connectivity → nodes → null`，每按一次 set `state.overlay.terrainMode` 推进一格；同步顶栏 badge 文字。如果存在 R2 加的 test 文件 `test/terrain-cycle.test.js`，确保 production code 与 test 同源。
- [ ] Step 3: `src/render/HeatLensOverlay.js` 或 HeatLens label 渲染入口 (Grep `supply surplus\|warehouse idle`) — edit — 在 label 决定逻辑加 context check：`if (state.workers.some(w => w.hungerSeverity > 0.5) && tile.label === "supply surplus") label = "queued (delivery blocked — open Worker Focus)"`；保持 "supply surplus" 在无 hungry worker 时仍显示。
- [ ] Step 4: `src/world/events/WorldEventSystem.js` 或 `ColonyPlanner.js` autopilot Plan 入口 (Grep `autopilot.buildsPlaced\|warehousesBuilt\|farmsBuilt`) — edit — 在生成 build proposal 时：`for type in proposalTypes: if (state.buildings.filter(b=>b.type===type).length >= state.scenario.goals[type]) skip; emit toast "Goal reached: <type> N/N — pausing further <type> builds";`
- [ ] Step 5: `src/ui/HUDController.js` (Threat / Dev unit labels；Grep `Threat:\|Dev \d+/100`) — edit — 把 `Threat: 50%` 改为 `Threat 50% (raid at 80%)`；把 `Dev 29/100` 文案保留但 tooltip 加 "100 = utopia milestone"。这关 P1 #7 (单位 anchor 缺失)。
- [ ] Step 6: `test/heat-lens-context-label.test.js` — add — 测试：构造 state 让 (a) 仓库 surplus、(b) 工人 hunger > 0.5；调用 heat lens label 渲染 → assert label === "queued (delivery blocked — open Worker Focus)"；当 hunger = 0 时 → label === "supply surplus".
  - depends_on: Step 3

## 5. Risks

- shortcutResolver T binding 改动可能与 R/L/Space 等其它 binding 共用 cycle helper；mitigation：仅改 T 的 onPress callback。
- autopilot cap 改动与 A5 recovery 白名单交互：A5 让 farm 在 < goal 时仍放，A7 让 farm 在 = goal 时停 — 两者天然兼容。
- heat-lens label change 可能影响 EconomyTelemetry 的 wantedSet 缓存；mitigation：只改 label 字符串，不改底层数据。
- TileInspectorPopup 与 A3 plan Step 6 同改一处；orchestrator 应让一个 implementer 先落地 A3 Step 6（或 A7 Step 1），后者跳过即可。
- 可能影响的现有测试：`test/terrain-overlay.test.js`、`test/heat-lens.test.js`、`test/autopilot-plan.test.js`、`test/ScenarioFactory.test.js`。

## 6. 验证方式

- 新增测试：`test/heat-lens-context-label.test.js`。
- 手动验证：`npx vite` → 进游戏 → click tile → 期望 inspector 不再显示 "B = build · R = road · T = fertility"；按 T 4 次 → 期望顶栏 badge 依次显示 Fertility / Elevation / Connectivity / Nodes / off；触发 food crisis (autopilot ON 等 90s) → hover 红色 surplus 块 → 期望 tooltip 改 "queued (delivery blocked — open Worker Focus)"；让 autopilot run 5 分钟 → 期望 warehouses 不超 2/2、farms 不超 6/6（除非超 goal 已 raise via scenario）。
- FPS 回归：未触主循环；FPS 不变。
- benchmark 回归：autopilot cap 可能让 dev index 略下降（少了几个 redundant warehouse），acceptable < -5%。
- prod build：`npx vite build` 无错；smoke 5 分钟无 console error。

## 7. 回滚锚点

- 当前 HEAD: `0344a4b`
- 一键回滚：`git reset --hard 0344a4b`

## 8. UNREPRODUCIBLE 标记（如适用）

可复现 — feedback 给了 22-tile-inspect.png / 13-heatlens-on.png / 24-colony-late.png 等 screenshot；T cycling 与 autopilot over-budget 在游戏 t=2:00+ 都直接观察到。
