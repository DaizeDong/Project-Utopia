---
reviewer_id: 01a-onboarding
feedback_source: Round4/Feedbacks/01a-onboarding.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P0
estimated_scope:
  files_touched: 7
  loc_delta: ~180
  new_tests: 3
  wall_clock: 120
conflicts_with: []
---

## 1. 核心问题

- 当前 onboarding 把“目标”显示出来了，但没有把它翻译成可执行步骤。`src/ui/hud/nextActionAdvisor.js` 和 `src/ui/hud/HUDController.js` 只给出 `Build Farm 4/6` / `Recover food now` 这类结果导向文案，没有把工具、有效地块、目标坐标、成功判定和补救动作串成一步一步的指引。
- 首局信息分层错误。`index.html` 的开场 overlay、帮助弹窗、状态条、故事条同时暴露 controls、AI、heat lens、template meta、资源链等不同层级信息，导致新手在前 10 分钟看见很多字，但学不会“现在先做什么”。
- 失败反馈没有对准真实原因。`src/render/SceneRenderer.js` 的近点工人提示把失败归因到 hitbox，而不是建造规则；死亡、饥荒、autopilot/fallback、storyteller 文案也仍然偏系统自述，没有转成玩家可行动的纠偏语言。

## 2. Suggestions（可行方向）

### 方向 A: 重构现有 onboarding 文案与反馈层，保留现有系统和工具集
- 思路：不加新 mechanic，不锁工具；只重排首局信息、把 next-action / storyteller / failure copy 改成“当前该做什么、去哪里做、做成算什么”的玩家语言。
- 涉及文件：`index.html`、`src/ui/hud/nextActionAdvisor.js`、`src/ui/hud/HUDController.js`、`src/ui/hud/storytellerStrip.js`、`src/render/SceneRenderer.js`、`src/world/scenarios/ScenarioFactory.js`、`src/ui/hud/glossary.js`
- scope：中
- 预期收益：直接解决 reviewer 指出的“有帮助但不会教”的根因；改动集中在 UI/copy/feedback，符合 HW06 freeze
- 主要风险：文案分支变多，容易与现有 HUD / tooltip / snapshot 测试不一致

### 方向 B: 做更强约束的首局教学模式，临时隐藏高级信息并分阶段解锁
- 思路：为首局单独增加 onboarding state，按阶段限制 Build 面板、AI 区块和帮助内容，只暴露 Farm / Lumber / Warehouse / Road 等必要操作。
- 涉及文件：`index.html`、`src/ui/tools/BuildToolbar.js`、`src/ui/hud/HUDController.js`、`src/ui/hud/nextActionAdvisor.js`、`src/app/GameApp.js`
- scope：大
- 预期收益：新手认知负担下降最明显，路径最强约束
- 主要风险：引入新的 UI 状态机和保存/恢复边界，容易碰到 freeze；还可能和已有快捷键、测试 DOM、面板持久化逻辑冲突

## 3. 选定方案

选 **方向 A**，理由：这是 P0 onboarding 问题，但更适合用现有 UI 层和反馈层做根治式修复，而不是再加一套首局模式。它能保留现有系统结构，改动集中在文案、提示排序、目标解释和错误归因，风险和 scope 都明显低于新增 gating mechanic，更符合 HW06 freeze。

## 4. Plan 步骤

- [ ] Step 1: `index.html:1222-1228`, `index.html:1704-1770` — `edit` — 重写开场 overlay 与 Help modal 的信息层级：把“首局必读/前三步”放到首屏与默认 tab，弱化 AI / template / heat lens 的首屏权重，确保 30 秒内能读完的内容先回答“先造什么、造在哪、怎么判断成功”。
- [ ] Step 2: `src/world/scenarios/ScenarioFactory.js:22-30` and `src/world/scenarios/ScenarioFactory.js:321-333` — `edit` — 把 Temperate Plains 的 `summary` / `hintInitial` / `objectiveCopy` 从宏观叙述改成首局可执行语言，明确 west lumber route、east depot、stockpile 的先后关系和玩家动作。
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/nextActionAdvisor.js:getFoodCrisisAdvice`, `src/ui/hud/nextActionAdvisor.js:getRouteAdvice`, `src/ui/hud/nextActionAdvisor.js:getDepotAdvice`, `src/ui/hud/nextActionAdvisor.js:getTargetAdvice` — `edit` — 把 advice model 扩成 onboarding 可执行提示，补充具体动作、工具、目标 tile/anchor、成功条件与短补救语，不再只返回 `Build Farm 4/6` 这类结果标签。
  - depends_on: Step 2
- [ ] Step 4: `src/ui/hud/HUDController.js:#renderNextAction` and `src/ui/hud/HUDController.js:938-1002` — `edit` — 让状态条同时呈现简短命令和更完整 tooltip/secondary text，把 scenario headline、goal chips、next action 组织成“为什么现在做这个 + 去哪里做”的链路，而不是三块各说各话。
  - depends_on: Step 3
- [ ] Step 5: `src/ui/hud/storytellerStrip.js:146-173` and `src/ui/hud/storytellerStrip.js:237-291` — `edit` — 收紧 `humaniseSummary` 和 early-game strip 输出，减少 `DIRECTOR` / `DRIFT` / “push the frontier outward” 这类系统腔，优先产出面向玩家的行动句，并在首局阶段避免把 AI 源信息放在主要信息位。
  - depends_on: Step 3
- [ ] Step 6: `src/render/SceneRenderer.js:2240-2274` — `edit` — 替换“Click a bit closer to the worker (hitbox is small)”这类误导性失败文案；优先输出当前 tool 的真实失败原因，区分“你点到了工人”“无效建造地块”“缺少连接/资源/距离条件”等反馈。
  - depends_on: Step 3
- [ ] Step 7: `src/ui/hud/glossary.js:14-49`, `src/ui/hud/HUDController.js:447-456`, `src/ui/tools/BuildToolbar.js:#setupModeControls` — `edit` — 统一 autopilot / storyteller / heat lens / role 相关术语的玩家语言，避免 `AI disabled. Using fallback.` 等系统状态文案继续在 onboarding 阶段制造噪音。
  - depends_on: Step 1

## 5. Risks

- 帮助弹窗、overlay、状态条、storyteller strip 同时改文案后，容易出现相同概念在多个入口说法不一致的问题。
- `nextActionAdvisor` 新增更细的 advice 字段后，`HUDController` 的回退分支和旧 DOM 兼容路径可能漏接。
- `SceneRenderer` 若把点击失败原因改得更严格，可能暴露 `buildSystem.placeToolAt(...)` 当前 reason code 不够细的问题。
- 可能影响的现有测试：`test/ui/hud-glossary.test.js`、任何覆盖 `storytellerStrip` 文案快照的测试、任何依赖 `statusNextAction` 现有 title/text 的 HUD 测试。

## 6. 验证方式

- 新增测试：`test/ui/next-action-advisor.onboarding.test.js` 覆盖 farm target / route gap / food crisis 三种提示都包含可执行动作与目标信息。
- 新增测试：`test/ui/storyteller-strip.onboarding.test.js` 覆盖 early-game storyteller 输出不会再落回抽象系统腔，并验证 idle/fallback 文案不会抢占玩家行动信息。
- 新增测试：`test/render/scene-renderer-build-feedback.test.js` 覆盖 near-worker guard 与 build failure 文案优先返回真实规则原因，而不是 hitbox 提示。
- 手动验证：打开 dev server -> 进入 `01a-onboarding` 对应首局 -> 仅看开场 overlay 与 Help 默认页，30 秒内应能明确知道先放 Farm / Lumber / Warehouse / Road 的顺序与判定方式。
- 手动验证：进入局内后观察 `statusScenarioHeadline`、`statusScenario`、`statusNextAction`、`storytellerStrip`，它们应形成单一链路：目标、位置、动作、补救互相一致，不再分别输出抽象叙述。
- 手动验证：用错误点击触发建造失败、切换 autopilot、让食物跌入危机，HUD 文案应给出明确规则或补救步骤，而不是 `fallback` / `hitbox` / 抽象战报式文本。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / `temperate_plains`，DevIndex 不得低于当前基线 -5%。

## 7. UNREPRODUCIBLE 标记（如适用）

尝试用 Playwright MCP 访问 `http://127.0.0.1:4173/` 进行浏览器复现，但共享浏览器会话被占用并持续返回 `Browser is already in use`，因此本轮未完成 live reproduction。代码定位已按要求完成；该标记仅适用于浏览器复现阻塞，不影响 plan 中的文件与函数定位。
