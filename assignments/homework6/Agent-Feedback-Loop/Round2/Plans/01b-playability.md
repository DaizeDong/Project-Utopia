---
reviewer_id: 01b-playability
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round2/Feedbacks/01b-playability.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~230
  new_tests: 2
  wall_clock: 70
conflicts_with:
  - 01d-mechanics   # also claims P1-6 (legal-tile highlight). Coordinate on which system owns the overlay pass; this plan owns the toggle UX and one-shot visual helper, 01d may repurpose the same mesh pool.
  - 02c-speedrunner # also claims P0-4 (autopilot hotkey/behaviour). This plan only adds a default-off switch + visible agency log, not hotkeys.
---

## 1. 核心问题

1. **Autopilot 默认架空玩家 agency（P0-4）**。`aiHealthMonitor` 在探测到 `/health` 返回 `hasApiKey=true` 时会静默把 `state.ai.enabled` 置 true（GameApp.js:1208-1213），DRIFT/DIRECTOR 的工人调度因此永远在后台跑。玩家从第一秒起就处在"被动观察"心流，任何手动点击建筑的反馈都被下一个 director 周期抵消。根本原因不是"AI 太聪明"，而是 **玩家没有一个可视化 kill-switch 来让自己的操作变成当前的权威动作源**。Stage A 约束下不能新增 priority matrix，但可以把 autopilot 变成**默关 + 可切 + 状态可见**的 toggle，并在 HUD 上把"下一个自动 tick 在 X 秒后"透出来，这就是可见杠杆。
2. **资源型建筑（Lumber / Quarry / Herb Garden）的合法 tile 不可视（P1-6）**。当前 `evaluateBuildPreview`（BuildAdvisor.js:346-450）只在 **hover 单格** 时返回 ok/fail，玩家必须一格一格扫才能发现森林/石矿/草药节点。这是"试错式 UX"，直接把新手卡死在"Cannot build on..."的红字弹窗循环里。治法：在玩家**选中** lumber/quarry/herb_garden 这三类 node-gated 工具的瞬间，用现有 pressure-lens marker pool 一次性扫出所有符合 `NODE_FLAGS` 的地格并高亮，工具切走立刻隐藏。
3. **Score / DevIndex 数字无独立解释（P1-9）**。`statusObjective` 同一个 `title` 已经被 `Dev breakdown: ...` 覆盖（HUDController.js:638），把 glossary 里的 `dev` / `survivedScore` 条目都挤没了。玩家看到 `Score 562 · Dev 40/100` 却不知道前者 = 存活秒数+生育-死亡、后者 = 6 维复合。需要把 score 与 dev 拆成独立 hover 目标，并在这两个 span 的 tooltip 里给出公式 + 实时小计 + 一行语义解释。

## 2. Suggestions（可行方向）

### 方向 A: Autopilot 默关 toggle + 合法 tile 高亮 + Score/Dev 拆分 tooltip（recommended）
- 思路：在现有 `aiToggle` 的基础上增加一个顶栏 "AI Autopilot" chip，明确其 on/off 与下一次 tick 倒计时；把 `aiHealthMonitor` 的 auto-enable 路径改成 opt-in（默认 off，除非玩家在菜单里勾过）；新增 `#updateLegalTileOverlay()` 复用 `pressureLensRoot` 的 marker pool；把 `statusScoreBreak` 的 tooltip 从"被 casual mode 清空"改成"始终保留，但 casual 模式用 high-level 解说，dev 模式用 +1/s 原文"。
- 涉及文件：`src/app/GameApp.js`、`src/ui/hud/HUDController.js`、`src/ui/tools/BuildToolbar.js`、`src/render/SceneRenderer.js`、`src/ui/hud/glossary.js`、`index.html`
- scope：中
- 预期收益：玩家第一次看到 Start Colony → Autopilot OFF 就知道这局是自己在开车；选 Lumber 看到全地图高亮就不用猜森林位置；Score 和 Dev 两个数字分别悬停各给一句独立解说。Stage A 三个目标同批落地。
- 主要风险：Autopilot 默关后长时间不动会让 `DevIndex` 回退（因为工人 role 分配没人 babysit），benchmark `long-horizon-bench.mjs` 在 `aiToggleDefault=off` 会低于基线。必须让 benchmark 脚本显式置 on 绕过默认值（它们走 `setAiEnabled(true, {manualOverride:true})`，已满足）。

### 方向 B: 仅做 autopilot chip + Score/Dev tooltip，P1-6 延后
- 思路：放弃 P1-6 以最小化 scope，只在 HUD 加一个 "Autopilot OFF" chip + 在 `setAiEnabled(false, …)` 时写入可见 agency log，同时修 Score/Dev tooltip 冲突。
- 涉及文件：`src/ui/hud/HUDController.js`、`src/app/GameApp.js`、`index.html`、`src/ui/hud/glossary.js`
- scope：小
- 预期收益：P0-4 + P1-9 两项解决，不碰渲染层。
- 主要风险：P1-6 是 Stage A 明确要求的 reviewer focus，跳过会被 orchestrator 拒收。

### 方向 C: 全量透明化 —— autopilot 拆成三挡（off / advisor / full）+ 热图化 legal tile + Score/Dev 独立 header card
- 思路：引入 "advisor-only" 中间档（autopilot 不自动放建筑但仍调度工人 role）；legal tile 用 InstancedMesh 在 grid 层做浅绿/浅红底色而非 ring marker；Score/Dev 独立成两个 header card，替换 `statusObjective` 单行。
- 涉及文件：大范围 — `src/render/SceneRenderer.js`、`src/simulation/ai/**`、`index.html` layout、CSS。
- scope：大
- 预期收益：最彻底，但把 autopilot 拆成三挡就是 new mechanic（"advisor" 是新角色），被 feature-freeze 禁止；header card 改动会拉进 01c-ui 的响应式工作。
- 主要风险：触碰 feature freeze（P0-4 规则条款：priority matrix/新机制禁止）；conflict with 01c-ui, 01d-mechanics。

## 3. 选定方案

选 **方向 A**。
- P0 优先级：Stage A 三项同批落地，与 reviewer 01b 三个 focus（P0-4 + P1-6 + P1-9）1:1 对应。
- 不违反 feature freeze：autopilot chip 只是把已存在的 `aiToggle` 换默认值 + 加可见度；legal-tile 高亮复用现成的 `pressureLensRoot`；tooltip 拆分全部靠 glossary 字符串和 `title` 属性。
- 不破坏测试：`test/ai-interval.test.js` 和 `test/agent-director.test.js` 已经走 `setAiEnabled(true, {manualOverride:true})`，对默认值不敏感。

## 4. Plan 步骤

- [ ] Step 1: `src/app/GameApp.js:1208` — `edit` — 把 `hasApiKey && !manualModeLocked && !this.state.ai.enabled && !this.aiHealthMonitor.autoEnabledOnce` 分支改成**只写 `proxyHealth` 元数据，不再自动翻转 `state.ai.enabled`**；保留"提示玩家 LLM 可用，请手动点 Enable"的 `actionMessage`。并在同函数末尾保证 `state.ai.enabled` 默认保持 false。
- [ ] Step 2: `src/app/types.js:234` 附近（`ai` 状态块）— `edit` — 在 JSDoc 上注明 `enabled` 的初始值语义为"玩家主动开启"，`coverageTarget` 默认 `"fallback"`。配合 Step 1 落地文档层约定，不改运行时默认（已由 types 默认给出）。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/HUDController.js:render()` — `add` — 新增一段 autopilot chip 渲染块：读 `state.ai.enabled`、`state.ai.lastPolicyResultSec`、`state.metrics.timeSec`，写到 `#aiAutopilotChip`（新节点，Step 7 在 index.html 加）。文本格式 `Autopilot OFF — you are in control` / `Autopilot ON — next tick in 3.2s`。chip 颜色：OFF = 绿 `#6eeb83`（你在开车）；ON = 橙 `#ffb84c`（有托管）。
  - depends_on: Step 7
- [ ] Step 4: `src/ui/hud/HUDController.js:render()` — `edit` — 拆分 `statusObjective` 为**两个独立 hover target**：把 `Survived ${time}` 和 `Score ${score}` 各包一个独立 `<span>`（DOM 在 Step 7），分别绑定 `title="Survival Score: +1/s survived, +5/birth, -10/death · current lived=X · births=+Y · deaths=-Z"` 和 `title="Dev Index: 0-100 composite... breakdown: prod P · infra I · safety S · morale M · ..."`（公式来自 `getSurvivalScoreBreakdown` 已有 API，dev 面来自 `state.gameplay.devIndexDims`）。casual mode 改成语义 fallback（glossary `survivedScore` / `dev` 长句），dev mode 保留数值细节。
  - depends_on: Step 7
- [ ] Step 5: `src/ui/hud/glossary.js:HUD_GLOSSARY` — `add` — 新增 2 条 key：`autopilotOff`（"Autopilot OFF: workers wait for your clicks. AI director paused."）和 `autopilotOn`（"Autopilot ON: AI director schedules workers on its own ~every 8s. Click to toggle."），给 Step 3 的 chip `title` 用。同时把 `survivedScore`/`dev` 的长度审一遍保证 ≤ 120 char（glossary.js 头注释要求）。
  - depends_on: Step 3
- [ ] Step 6: `src/render/SceneRenderer.js:#updateOverlayMeshes` — `add` — 新增一个 one-shot 计算 `#updateLegalTileOverlay(tool)`：当 `state.controls.tool` ∈ {`lumber`, `quarry`, `herb_garden`} 时遍历 `state.grid`，对每个 `(ix,iz)` 调用轻量版 node-flag 检查（只读 `getTileState(...).nodeFlags & NODE_GATED_TOOLS[tool]`），把命中格 push 进 `this.legalTileMarkers`；复用 `pressureMarkerPool` 的 disc 实例但染浅绿 `0x7bffaa` / opacity 0.35，renderOrder 落在 `TILE_OVERLAY + 1`。工具切换到非 node-gated 立刻清空数组并隐藏所有 marker。
  - depends_on: Step 1
- [ ] Step 7: `index.html:1220` 附近（`aiToggle` 所在 switch）— `edit` — (a) 新增顶栏 chip `<span id="aiAutopilotChip" class="hud-chip" title="">Autopilot OFF</span>`，放在 `#statusObjective` 右邻；(b) 把 `#statusObjective` 的内部拆成 `<span id="statusObjectiveTime">` + `<span id="statusObjectiveScore">` + `<span id="statusObjectiveDev">` 三个子 span，保留原外层 id 以兼容现有测试。(c) 在 `Management` 面板把 `aiToggle` 的 `<label>` 文案由 `Enable LLM Agent` 改成 `Autopilot (AI Director)`，并在旁边加一句 muted 说明 "Off by default — you drive the colony. Flip on to let the AI schedule workers."。
  - depends_on: Step 5
- [ ] Step 8: `test/ui/hud-autopilot-chip.test.js` — `add` — 新增测试：构造 `state.ai.enabled=false` → render → 断言 `#aiAutopilotChip` 文本以 `Autopilot OFF` 开头、`data-mode="off"`；翻转 `state.ai.enabled=true` 并设置 `lastPolicyResultSec=1.0`、`timeSec=2.3` → 断言文本包含 `next tick in` 且数字格式为 `N.Ns`。

- [ ] Step 9: `test/ui/hud-score-dev-tooltip.test.js` — `add` — 新增测试：mock `state.gameplay.devIndexDims = { production: 40, infra: 55 }`、`state.metrics.timeSec=30, birthsTotal=2, deathsTotal=1` → render → 断言 `#statusObjectiveScore` 的 `title` 里同时包含 `+1/s`、`+5/birth`、`-10/death`、`lived 30` 字样；`#statusObjectiveDev` 的 `title` 包含 `Dev Index` 与 `production 40`、`infra 55`；casual mode（`body.casual-mode`）下 Score tooltip 回退到 glossary `survivedScore` 句，不含 `+1/s` 原文。

## 5. Risks

- Autopilot 默关后 **long-horizon benchmark** 可能低于基线，因为 DevIndex 依赖 LLM/fallback 连续调度。缓解：benchmark 脚本已显式 `setAiEnabled(true, {manualOverride:true})`（GameApp.js:805-810 已就位），手动触发不会受默认值影响；需在执行 `long-horizon-bench.mjs` 时复核日志确认 autopilot 状态。
- P0-4 与 reviewer 02c（speedrunner）在同一症状上提 P2-1（1-12 热键）、P1-10（4× 同步），本 plan 只改默认值 + chip UI，不碰热键路径，避免 double-owner；如果 02c 同时落地热键修复，两 plan 在 `state.controls.tool` 写入侧没有交集。
- `#updateLegalTileOverlay` 对 96×72 = 6912 格扫一次在工具切换瞬间一次性完成，但如果玩家在 node-gated tool 之间快速切换，每次都要 O(W*H) getTileState。缓解：缓存 key = `${tool}:${grid.version}:${tileStatesVersion}`，命中则直接复用数组（类似 `lastPressureLensSignature`）。
- `statusObjective` 内部拆成 3 个 span 可能破坏下列**现有测试**（需跑一遍）：
  - `test/hud-storyteller.test.js`（已检视 via grep，只 assert `storytellerStrip`，不关心 `statusObjective` 内部结构）
  - `test/ui/hud-glossary.test.js`（根据 glossary.js 注释，pin 的是 key set，新增 `autopilotOff`/`autopilotOn` 必须同步更新断言数组）
- Autopilot chip 颜色 orange（ON）在高对比度 / ARIA 场景里和已有 `flash-action` 橙系冲突 —— 01c-ui 如果同步改主题色需要再对齐。

## 6. 验证方式

- 新增测试：`test/ui/hud-autopilot-chip.test.js`（Step 8）+ `test/ui/hud-score-dev-tooltip.test.js`（Step 9）。
- 手动验证：
  1. `npx vite` → 打开 http://localhost:5173 → Start Colony → 观察顶栏 chip 为绿色 "Autopilot OFF — you are in control"。
  2. 点 Lumber 按钮 → 地图上所有森林 tile 染浅绿半透 disc；切换到 Farm → disc 全消失。
  3. 把 `aiToggle` 打开 → chip 变橙 "Autopilot ON — next tick in ~8.0s" 并 tick。
  4. 鼠标悬停 `Score 562` → tooltip 显示 `+1/s survived, +5/birth, -10/death`；悬停 `Dev 40/100` → tooltip 显示 6-dim breakdown。
  5. `body.classList.add("casual-mode")` 手动注入 → Score tooltip 变成 glossary 语义句（不含 `+1/s` 原文）。
- benchmark 回归：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains` → DevIndex 不得低于当前 v0.8.1 基线 `44` 的 95%（即 ≥ 42）；因为 benchmark 脚本走 `setAiEnabled(true, manualOverride=true)`，应与基线完全一致。

## 7. UNREPRODUCIBLE 标记

N/A — 本 plan 不依赖运行时复现，所有结论基于源码审读：
- GameApp.js:1208-1213 确认 auto-enable 路径存在。
- BuildAdvisor.js:346-450 确认 `evaluateBuildPreview` 只处理单格。
- HUDController.js:605-639 确认 `statusObjective` 的 title 已被 `Dev breakdown` 覆盖，glossary 键 `dev` / `survivedScore` 在 render 时被反复写入同一 title 属性。
