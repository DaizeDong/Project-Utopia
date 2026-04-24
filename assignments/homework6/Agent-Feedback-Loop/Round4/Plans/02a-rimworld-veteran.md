---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round4/Feedbacks/02a-rimworld-veteran.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~140
  new_tests: 3
  wall_clock: 90
conflicts_with: []
---

## 1. 核心问题

1. 首屏仍然主要在展示“名词和按键”，没有把当前 run 的前 5-10 分钟决策压力讲清楚。`GameStateOverlay` 现在只渲染 scenario 标题、无限生存卡片和两行 controls，缺少“先修什么、先怕什么、为什么要看 heat lens”的开局判断框架。
2. 地图模板和尺寸在菜单里仍然像低信息量设置项，而不是有明确后果的战略选择。浏览器复现显示：把模板从 `Temperate Plains` 切到 `Fortified Basin` 后，菜单文案仍停留在 `Broken Frontier`，必须再点 `New Map` 才更新到 `Hollow Keep`；尺寸输入也没有任何推荐值或节奏/难度提示。
3. Help Modal 已经存在，但解释仍偏“系统说明书”，没有把 heat lens、template 差异、survival scoring 与开局生存逻辑串成一个玩家可执行的决策模型，因此老玩家首屏仍会怀疑系统是否真的咬合。

## 2. Suggestions（可行方向）

### 方向 A: 把菜单改成“决策简报”，不是“控件集合”
- 思路：在开局 overlay 直接展示当前模板的战略摘要、map size 后果、heat lens 为什么重要、以及前几分钟的操作优先级。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`, `index.html`, `src/world/grid/Grid.js`, `src/world/scenarios/ScenarioFactory.js`, `src/app/GameApp.js`
- scope：中
- 预期收益：玩家在点 `Start Colony` 前就能理解模板差异、第一波风险和关键观察工具，首屏系统信用明显提升。
- 主要风险：首屏信息量如果组织不好，会从“空心”变成“过载”。

### 方向 B: 保持菜单轻量，把解释主要下沉到 Help Modal 和 tooltip
- 思路：菜单只保留简短摘要，把模板差异、heat lens 含义、map size 后果都塞进 `How to Play` 与各控件 tooltip。
- 涉及文件：`index.html`, `src/ui/hud/GameStateOverlay.js`, `src/ui/hud/glossary.js`
- scope：小
- 预期收益：改动面小，测试风险低，能补齐一部分解释缺口。
- 主要风险：玩家在首屏不一定会主动开 `How to Play`，核心问题仍然留在第一眼体验里。

### 方向 C: 只修菜单设置的“即时反馈”契约
- 思路：优先修复模板/尺寸选择后首屏不立即反映的问题，让选项变成可信输入，但不大改文案结构。
- 涉及文件：`src/ui/hud/GameStateOverlay.js`, `src/app/GameApp.js`, `test/start-button-applies-template.test.js`
- scope：小
- 预期收益：解决最直接的 UI contract 问题，玩家不会再觉得模板选择像盲盒。
- 主要风险：只能修“控件可信度”，不能解决 reviewer 指出的“前十分钟生存逻辑不清”。

## 3. 选定方案

选 **方向 A**，理由：这份 feedback 的问题不只是某个控件失效，而是首屏没有把系统压力翻译成可执行判断。单修 `New Map` / `Start Colony` 契约不够，单补 Help Modal 又太后置。方向 A 仍然停留在 HW06 freeze 允许的 polish / UX 范围内，不引入新 mechanic，但能同时覆盖“模板差异”“heat lens 意义”“map size 后果”“首局优先级”四个首屏信任问题。

## 4. Plan 步骤

- [ ] Step 1: `src/ui/hud/GameStateOverlay.js:constructor` — edit — 为 menu overlay 增加 `change` 级别的本地预览状态同步：模板切换时立即更新 overlay 内的 scenario/meta/briefing 文案；同时把 map width / height 的当前输入纳入本地展示模型，而不是只在 `New Map` 时生效。
- [ ] Step 2: `src/ui/hud/GameStateOverlay.js:render` — edit — 把当前纯 controls 导向的 menu 内容改成决策导向摘要：新增“template strategic summary / first danger / first build priority / heat lens use-case / map size consequence”渲染分支，并让 `Survive as long as you can` 与当前 scenario 文案形成统一叙事，不再彼此割裂。
- [ ] Step 3: `src/app/GameApp.js:startSession` — edit — 让 `Start Colony` 消费 overlay 当前选择的 template + width + height，而不只是 `controls.mapTemplateId`；若当前 loaded world 与 menu 选择不一致，则在进入 active 前用这些显式选择 regenerate，保证首屏所见即开局所得。
  - depends_on: Step 1
- [ ] Step 4: `index.html:1201` — edit — 在 `#overlayMenuPanel` 里补充首屏 briefing DOM 槽位（例如 template summary、size hint、decision checklist），并重写 `#overlayMapTemplate`, `#overlayMapWidth`, `#overlayMapHeight`, `#overlayStartBtn`, `#overlayResetFromMenuBtn` 附近的可见文案/tooltip，使其表达“选择会改变什么”而不只是“控件是什么”。
  - depends_on: Step 2
- [ ] Step 5: `index.html:1759` — edit — 重写 Help Modal 的 `data-help-page="different"` 与 `data-help-page="threat"` 文案，把 `heat lens`、template 差异、survival score、第一波失败路径改成决策说明，不再停留在 feature 描述。
- [ ] Step 6: `src/world/grid/Grid.js:MAP_TEMPLATES` — edit — 复用现有 `description` / `tags` 数据补足首屏模板摘要所需字段；如现有描述不够行动化，则在该常量上扩展更适合 menu briefing 的短摘要，不改生成机制本身。
  - depends_on: Step 2
- [ ] Step 7: `src/world/scenarios/ScenarioFactory.js:SCENARIO_VOICE_BY_TEMPLATE` — edit — 为首屏 briefing 提供可直接消费的“opening pressure”级别文案来源，避免 overlay 自己硬编码抽象解释；保持 scenario family 和 targets 不变，只补玩家可见解释字段。
  - depends_on: Step 2
- [ ] Step 8: `test/game-state-overlay.test.js` — edit — 扩充 overlay 菜单渲染断言：模板切换后无需点 `New Map` 就能更新 menu briefing；menu phase 应显示 template-specific summary、size consequence 和 heat-lens rationale。
- [ ] Step 9: `test/start-button-applies-template.test.js` — edit — 把现有 template-only 契约扩展为 template + width + height 一起应用，确保 `Start Colony` 真正按菜单当前选择开局。
  - depends_on: Step 3
- [ ] Step 10: `test/help-modal.test.js` — edit — 增加 Help Modal 文案断言，覆盖 “Templates change the whole run”“Supply-Chain Heat Lens”“Survival Mode” 三块必须出现的决策语义，防止后续回退成纯术语说明。
  - depends_on: Step 5

## 5. Risks

- 首屏新增 briefing 后，如果层级设计不好，可能压缩原有按钮区并再次造成信息过载。
- `Start Colony` 改为消费 width / height 选择后，可能改变现有“只有 New Map 才应用尺寸”的隐式行为，需要同步测试和文案，避免用户误判。
- 如果直接在 `GameStateOverlay` 内复制 template / scenario 解释字符串，后续很容易与 `ScenarioFactory`、Help Modal 文案漂移。
- 可能影响的现有测试：`test/game-state-overlay.test.js`, `test/start-button-applies-template.test.js`, `test/help-modal.test.js`, `test/ui-voice-consistency.test.js`, `test/scenario-voice-by-template.test.js`

## 6. 验证方式

- 新增/更新测试：`test/game-state-overlay.test.js` 覆盖 menu briefing 即时刷新；`test/start-button-applies-template.test.js` 覆盖 start 时应用 template + size；`test/help-modal.test.js` 覆盖 decision-oriented help copy。
- 手动验证：打开 `http://127.0.0.1:4173/` → 在 menu 把模板从 `Temperate Plains` 切到 `Fortified Basin`，不点 `New Map`，期望副标题/briefing 立即从 `Broken Frontier` 风格切成 `Hollow Keep` 风格；再修改 `Map Size`，期望出现对应的节奏/难度提示；点击 `Start Colony` 后，实际开局 world 与 menu 选择一致。
- 手动验证：打开 `How to Play` → 切到 “Threat & Prosperity” 与 “What makes Utopia different” → 期望能直接读到“为什么一开始就该关心 heat lens / template / first failure path”，而不是只看到功能术语。
- benchmark 回归：运行 `scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，DevIndex 不得低于当前基线 - 5%。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。浏览器已复现首屏问题：模板切换后 menu 文案不会即时更新，必须点击 `New Map` 才从 `Broken Frontier` 切到 `Hollow Keep`；同时首屏可见信息仍缺少 template consequence、map size consequence 与 heat lens 决策语义。
