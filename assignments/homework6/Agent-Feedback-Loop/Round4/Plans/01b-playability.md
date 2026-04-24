---
reviewer_id: 01b-playability
feedback_source: Round4/Feedbacks/01b-playability.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~190
  new_tests: 4
  wall_clock: 150
conflicts_with: []
---

## 1. 核心问题

- 开局前 1-5 分钟的主引导仍然是“目标计数 + 系统状态”视角，不是“此刻为什么该做这一步”的因果视角；玩家能看到 `Farm 4/6`、`Warehouse 2/4`，但看不到资源瓶颈、场景锚点和预期收益之间的直接关系。
- HUD 把自动化与系统完成感放在过强位置：`Autopilot` 文案、阶段目标 chip、里程碑闪现和近期事件一起强化了“系统已经在替我推进”的印象，削弱了玩家 agency。
- 地图层反馈已经有 `BuildAdvisor` 和场景运行态数据，但没有被整合成“放下这个建筑后，哪条线会恢复、哪个 depot 会解锁、哪种短缺会缓解”的短闭环，因此中期体验容易退化成补 KPI。

## 2. Suggestions（可行方向）

### 方向 A: 把现有 HUD 从目标清单改成因果引导
- 思路：保留现有场景目标和自动化系统，但把 `Next Action`、目标 chip、Autopilot 文案、开局 overlay 统一改成“瓶颈 -> 推荐动作 -> 预期结果”的表达。
- 涉及文件：`src/ui/hud/nextActionAdvisor.js`、`src/ui/hud/HUDController.js`、`src/ui/hud/autopilotStatus.js`、`src/ui/hud/GameStateOverlay.js`、`src/simulation/construction/BuildAdvisor.js`、`src/world/scenarios/ScenarioFactory.js`
- scope：中
- 预期收益：最快改善前 5 分钟可玩性，直接回应 reviewer 对“看起来复杂但不知道该做什么”的批评，且不引入新 mechanic。
- 主要风险：如果文案与真实运行态不同步，会产生“建议不可信”的副作用；需要补测试覆盖 advisor 优先级和 HUD 文案分支。

### 方向 B: 降低导演系统前期推进感，延后“系统替我玩”的信号
- 思路：调整导演器的前期阈值、资源缓冲和 milestone 暴露时机，避免开局太快进入“已完成多项建设/目标”的观感。
- 涉及文件：`src/simulation/meta/ColonyDirectorSystem.js`、`src/ui/hud/HUDController.js`、`src/ui/panels/EventPanel.js`
- scope：中
- 预期收益：能更直接削弱“系统先开玩了”的印象，让玩家亲手触发更多关键节点。
- 主要风险：这是模拟平衡改动，容易影响既有长跑表现、场景完成率和 `DevIndex` 相关回归；验证成本高于纯 HUD/UX 调整。

### 方向 C: 强化建造预览，把反馈重心从 HUD 文本拉回地图
- 思路：复用 `BuildAdvisor.evaluateBuildPreview()` 已有的 route/depot/logistics 信息，在建造预览里优先显示“这一步会修好什么/解锁什么/仍缺什么”。
- 涉及文件：`src/simulation/construction/BuildAdvisor.js`、`src/ui/tools/BuildToolbar.js`、`src/ui/hud/HUDController.js`
- scope：小-中
- 预期收益：能缩短“放下建筑 -> 看懂影响”的反馈链，改善中期“盲放”问题。
- 主要风险：单做这一项只能改善放置瞬间反馈，无法处理开局信息分层和 autopilot 存在感过强的问题。

## 3. 选定方案

选 **方向 A**，理由：它在 HW06 freeze 内属于 HUD / UX / polish，不新增 mechanic；同时能直接覆盖 reviewer 最集中的三个痛点：开局信息分层、目标因果化、自动化存在感降噪。相比方向 B，它对平衡和长跑系统的回归风险更低；相比方向 C，它覆盖面更完整。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/hud/nextActionAdvisor.js:getFoodCrisisAdvice` / `getRouteAdvice` / `getDepotAdvice` / `getTargetAdvice` / `getNextActionAdvice` - edit - 把“Build X N/M”式清单建议改成因果建议对象，优先输出 `why_now`、`expected_outcome`、场景锚点/坐标与资源瓶颈，而不是只回传计数差额。
- [ ] Step 2: `src/world/scenarios/ScenarioFactory.js:getScenarioRuntime` / `buildScenarioBundle` - edit - 在运行态输出里补足 `Next Action` 需要的场景标签与简短因果文案来源，确保 advisor 能稳定引用 route/depot/stockpile/stability 上下文。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/HUDController.js:#renderNextAction` - edit - 调整 `statusNextAction` 渲染格式，显示“当前瓶颈 -> 推荐动作 -> 预期结果”的单句闭环，并把 tooltip 改成更明确的执行说明。
  - depends_on: Step 1
- [ ] Step 4: `src/ui/hud/HUDController.js:scenarioGoalChips` / `#renderGoalChips` / render block around `statusScenario` (`src/ui/hud/HUDController.js:938-953`) - edit - 把纯 KPI chip 改成更弱视觉层级的进度摘要；保留完成度信息，但避免与 `Next Action` 抢主叙事焦点。
  - depends_on: Step 3
- [ ] Step 5: `src/ui/hud/autopilotStatus.js:getAutopilotStatus` and `src/ui/hud/HUDController.js` render block around `aiAutopilotChip` (`src/ui/hud/HUDController.js:885-891`) - edit - 弱化 `Autopilot OFF - manual - coverage fallback` 这类内部实现文案，把 OFF 状态改成玩家导向表达，并收缩 tooltip 中的系统术语暴露。
- [ ] Step 6: `src/simulation/construction/BuildAdvisor.js:addLogisticsPreview` / `evaluateBuildPreview` / `summarizeBuildPreview` - edit - 让建造预览优先给出“会修复哪条 route / 会让哪个 depot 可用 / 会缓解哪种短缺”的第一反馈，降低玩家从 HUD 反推结果的成本。
  - depends_on: Step 1
- [ ] Step 7: `src/ui/hud/GameStateOverlay.js:render` (`src/ui/hud/GameStateOverlay.js:184-217`) - edit - 收短开局 overlay 首屏文案，把默认 lead 改成更像战场简报的短说明，并让首张卡片突出一个起手目标，而不是泛化操作手册。
- [ ] Step 8: `src/ui/hud/HUDController.js:#currentMilestoneFlash` / storyteller render block (`src/ui/hud/HUDController.js:346-374`, `730-747`) and `src/ui/panels/EventPanel.js:render` - edit - 下调前期 milestone / recent log 的叙事抢占感，确保新手阶段先突出玩家刚完成的关键动作，而不是系统自动刷出的“已达成”印象。
- [ ] Step 9: `src/ui/hud/nextActionAdvisor.test.js` - add - 覆盖 food crisis、route gap、missing depot、target fallback 四类优先级与新因果文案分支。
  - depends_on: Step 1
- [ ] Step 10: `src/ui/hud/autopilotStatus.test.js`, `src/simulation/construction/BuildAdvisor.test.js`, `src/ui/hud/HUDController.test.js` - add - 分别覆盖 Autopilot OFF 文案降噪、建造预览因果摘要、`statusNextAction` / `statusScenario` 新层级渲染。
  - depends_on: Step 3

## 5. Risks

- `Next Action` 若过度依赖场景数据，可能在无场景/菜单态/旧测试夹具下退化为空建议，需要保留 `missing_state` 和 `session_inactive` 兜底。
- Goal chips 降权后，可能影响 speedrunner / debug 用户快速读取目标完成度的效率；需要保留 tooltip 或 dev profile 下的完整摘要。
- Autopilot 文案去工程化后，可能让调试时更难一眼看见 `coverageTarget` 和轮询节奏；需要只缩在玩家默认 HUD，避免破坏 dev-only 视图。
- 里程碑闪现和 Recent Colony Events 若降噪过头，可能反向削弱已有叙事反馈。
- 可能影响的现有测试：`src/ui/hud/HUDController.test.js`、`src/simulation/construction/BuildAdvisor.test.js`、任何断言 `statusScenario` / `aiAutopilotChip` / `statusNextAction` 具体文案的测试。

## 6. 验证方式

- 新增测试：`src/ui/hud/nextActionAdvisor.test.js` 覆盖 advisor 因果优先级；`src/ui/hud/autopilotStatus.test.js` 覆盖 OFF/ON 文案；`src/simulation/construction/BuildAdvisor.test.js` 覆盖 route/depot/shortage 预览摘要；`src/ui/hud/HUDController.test.js` 覆盖 `statusNextAction` 与目标层级渲染。
- 手动验证：开启 dev server -> 进入 `http://127.0.0.1:4173/` -> 开局关闭 overlay 后观察顶部 HUD -> 期望首个主提示先说明当前瓶颈与推荐起手动作，而不是只显示 `Build Farm 4/6` 或内部 autopilot 状态。
- 手动验证：选择 `road` / `warehouse` / `farm` 在 route gap、depot zone、普通地块上悬停 -> 期望预览摘要先说明“修复 supply route / reclaim depot / 缓解食物短缺”等结果，并保留警告信息。
- 手动验证：在开局前 60 秒内观察 `storytellerStrip`、`statusScenario`、`EventPanel` -> 期望 milestone 与 recent log 不再压过玩家手动操作反馈，Autopilot OFF 文案不再暗示“系统已接管”。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / `temperate_plains`，DevIndex 不得低于当前基线 - 5%。

## 7. UNREPRODUCIBLE 标记（如适用）

- 浏览器复现尝试失败：Playwright MCP 在本轮返回 `Browser is already in use ... use --isolated to run multiple instances`，导致无法附加到 `http://127.0.0.1:4173/` 做交互式复现。
- 代码定位已完成，且本 plan 的文件/函数引用均来自实际仓库文件；`UNREPRODUCIBLE` 仅适用于浏览器现象复现，不影响代码级方案定位。
