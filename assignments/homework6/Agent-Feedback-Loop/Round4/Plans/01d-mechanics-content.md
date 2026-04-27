---
reviewer_id: 01d-mechanics-content
feedback_source: Round4/Feedbacks/01d-mechanics-content.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 8
  loc_delta: ~260
  new_tests: 4
  wall_clock: 180
conflicts_with: []
---

## 1. 核心问题

- 现有版本已经把资源、目标、里程碑、Autopilot、Heat Lens、Dev 等系统名词摆上了 HUD，但这些面板大多只显示计数或标签，没有把“刚刚发生了什么变化、为什么变化、下一步为什么是这个”讲清楚。
- 场景目标与运行时状态之间缺少可见的因果桥梁。`Broken Frontier` 的路线修复、仓库回收、农场缺口、库存缺口都已在代码里有状态来源，但玩家端主要看到的是静态计数，难以验证修复前后收益。
- 现有内容薄弱感更多来自“反馈呈现不足”而不是“完全没有底层逻辑”。因此本轮最有效的修正应集中在把已有运行时数据转成持续、可归因、可验证的玩家反馈，而不是新增 mechanic。

## 2. Suggestions（可行方向）

### 方向 A: 把已有运行时状态串成可读的因果反馈链
- 思路：复用现有 scenario runtime、logistics、milestone、event、AI policy 数据，在 HUD / Event / Inspector / advisor 里持续解释“原因 -> 变化 -> 下一步”。
- 涉及文件：`src/world/scenarios/ScenarioFactory.js`、`src/ui/interpretation/WorldExplain.js`、`src/ui/hud/HUDController.js`、`src/ui/hud/nextActionAdvisor.js`、`src/ui/hud/autopilotStatus.js`、`src/ui/panels/EventPanel.js`、`src/ui/panels/InspectorPanel.js`、`src/simulation/meta/ProgressionSystem.js`
- scope：中
- 预期收益：直接回应 reviewer 对机制可感知度、内容消化度、Autopilot / Heat Lens / Dev 可理解性的批评，且不跨 freeze 边界。
- 主要风险：HUD 文案可能过密；多个面板重复讲同一件事会造成噪音，需要统一数据口径。

### 方向 B: 围绕单条资源链强化 milestone 和事件叙事
- 思路：以 `Farm -> Warehouse -> Kitchen -> Workers` 为主链，只加强 milestone、objective log、event detail 的前后对照文案，让玩家看懂一条链条的完整收益。
- 涉及文件：`src/simulation/meta/ProgressionSystem.js`、`src/ui/panels/EventPanel.js`、`src/ui/hud/HUDController.js`、`src/ui/interpretation/WorldExplain.js`
- scope：小
- 预期收益：实现快、风险低，能改善“名字多、过程弱”的第一印象。
- 主要风险：覆盖面偏窄，无法充分解决 reviewer 对 `Autopilot`、`Heat Lens`、`Dev`、场景目标链路的整体批评。

### 方向 C: 调整场景初始态，让修路/回收 depot 的前后差异更显眼
- 思路：只改 `Broken Frontier` 的初始断点、缺口和提示文案，让路线修复和 depot 回收更早、更明显地影响吞吐和 HUD。
- 涉及文件：`src/world/scenarios/ScenarioFactory.js`、`src/ui/hud/nextActionAdvisor.js`、`src/ui/interpretation/WorldExplain.js`
- scope：中
- 预期收益：场景前 2-5 分钟的“修前/修后”对照会更直观。
- 主要风险：容易滑向玩法重调和平衡改动；单场景收益高，但对整体“内容感薄”覆盖不够。

## 3. 选定方案

选 **方向 A**，理由：该 reviewer 的核心批评不是“缺少一个新系统”，而是“已有系统没有被持续演给玩家看”。方向 A 能在不新增 mechanic 的前提下，把现有运行时数据变成稳定可见的因果反馈，覆盖面比方向 B 更完整，同时比方向 C 更不容易触碰 HW06 freeze 的机制边界。

## 4. Plan 步骤

- [ ] Step 1: `src/world/scenarios/ScenarioFactory.js:getScenarioRuntime` — edit — 在现有 `routes / depots / counts / targets` 之外补充玩家可消费的派生字段（如未完成 route/depot、logistics 缺口、stockpile 缺口、stability 缺口），统一后续 HUD / advisor / event 使用的数据口径。
- [ ] Step 2: `src/ui/interpretation/WorldExplain.js:getFrontierStatus` — edit — 把场景摘要从“纯计数罗列”改成“当前卡点 + 已完成收益 + 剩余缺口”的叙述；同时更新 `getCausalDigest`、`getEventInsight`、`getLogisticsInsight`，让它们引用 Step 1 的派生字段而不是各自拼接零散数字。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/nextActionAdvisor.js:getRouteAdvice` / `getDepotAdvice` / `getTargetAdvice` / `getNextActionAdvice` — edit — 把 `Next:` 文案从通用建造提示改为带收益说明的下一步建议，明确“修哪条线/补哪个仓/补几座农场，以及这样做会解除什么瓶颈”。
  - depends_on: Step 1
- [ ] Step 4: `src/simulation/meta/ProgressionSystem.js:detectMilestones` — edit — 让 milestone payload / action 文案携带前后对照信息，尤其是仓库、农场、木材、厨房相关里程碑，避免只出现“First X raised”而不说明具体影响。
  - depends_on: Step 1
- [ ] Step 5: `src/ui/panels/EventPanel.js:buildEventDetail` / `render` — edit — 将 active events 与 objective log 渲染为更有因果性的细节行，优先展示目标区域、压力、重叠天气、影响坐标、以及与场景目标的关系，减少“有事件名、没决策意义”的空转。
  - depends_on: Step 2
- [ ] Step 6: `src/ui/panels/InspectorPanel.js:#renderTileSection` / `#renderEntitySection` — edit — 在 inspect 视图里突出显示该 tile / entity 当前受哪些路线、仓储覆盖、天气、事件、AI 指令影响，让玩家点击后能验证系统内部因果链。
  - depends_on: Step 2
- [ ] Step 7: `src/ui/hud/autopilotStatus.js:getAutopilotStatus` — edit — 把 Autopilot 状态从 `ON/OFF + mode/coverage` 扩展为可观察的控制反馈，至少包含下一次 policy、当前 coverage 含义、以及“正在接管什么/没有接管什么”的玩家文案。
  - depends_on: Step 2
- [ ] Step 8: `src/ui/hud/HUDController.js:render` / `buildDevIndexTooltip` / `scenarioGoalChips` — edit — 用 Step 2-7 的解释型数据重写顶部摘要、`Next:`、`Last:`、Autopilot chip、Dev tooltip、goal chips、food rate breakdown，让 HUD 主条本身就能承载 reviewer 要求的“可观察、可归因、可验证”的机制反馈。
  - depends_on: Step 2
- [ ] Step 9: `src/app/GameApp.js:toggleHeatLens` — edit — 统一 Heat Lens 的启停反馈与 HUD 上的解释性文案，明确它当前展示的是哪类供应链瓶颈/余量，避免仅有按钮名和开关 toast。
  - depends_on: Step 8

## 5. Risks

- HUD / Event / Inspector 同时增强后，可能出现重复文案和信息噪音，需要明确每个面板的职责层级。
- `getScenarioRuntime()` 新增派生字段后，如果多个调用方直接依赖旧 shape，可能引入 UI 空值或标题不同步。
- milestone / advisor 文案改得太“解释型”后，可能导致 HUD 在窄视口换行或溢出，需要注意现有布局约束。
- Heat Lens、Autopilot、Dev tooltip 如果都试图解释过多内容，可能让一线玩家更难扫读。
- 可能影响的现有测试：`test/ui-layout.test.js`

## 6. 验证方式

- 新增测试：`test/world-explain-causal-digest.test.js` 覆盖 route/depot/logistics 缺口转成玩家文案的场景。
- 新增测试：`test/ui-next-action-advisor.test.js` 覆盖 `getNextActionAdvice()` 在 food crisis、route gap、depot missing、target deficit 下的优先级与收益说明。
- 新增测试：`test/ui-autopilot-status.test.js` 覆盖 `getAutopilotStatus()` 的 on/off、coverage、remainingSec、说明文案。
- 新增测试：`test/progression-milestone-copy.test.js` 覆盖 `detectMilestones()` 对 warehouse/farm/lumber/kitchen 里程碑的前后对照文案。
- 手动验证：打开 `http://127.0.0.1:4173/`，进入默认 `Broken Frontier`，观察顶部 HUD 是否能明确解释 `routes / depots / warehouses / farms / walls / Next / Last / Autopilot / Dev` 的当前意义，而不是只显示计数。
- 手动验证：开始一局后，修复道路、补农场、靠近 depot 区域放仓库，确认 `Next:`、milestone、event log、Inspector 文案会同步反映“修复前/修复后”的收益变化。
- 手动验证：切换 `Heat Lens (L)`、开启/关闭 `Autopilot`，确认 HUD 与 toast 文案一致，并能说明当前可见反馈代表什么。
- benchmark 回归：`scripts/long-horizon-bench.mjs` 使用 `seed 42 / temperate_plains`，DevIndex 不得低于当前基线 5% 以上；若当前基线沿用 `44`，则 floor 为 `42`。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。本次已在 `http://127.0.0.1:4173/` 复现 reviewer 描述的关键现象：HUD 中可见大量系统名词与计数（如 `Autopilot OFF - manual - coverage fallback`、goal chips、`Next: Build Farm 4/6`、里程碑提示），但当前玩家视角下因果反馈仍偏弱。
