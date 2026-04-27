---
reviewer_id: 02d-roleplayer
feedback_source: Round4/Feedbacks/02d-roleplayer.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~140
  new_tests: 2
  wall_clock: 75
conflicts_with: []
---

## 1. 核心问题

- 开场入口把玩家注意力先拉到模板、地图尺寸、控制提示、计时和分数上；`index.html:1201-1226` 与 `src/ui/hud/GameStateOverlay.js:184-233` 目前没有把“这是谁的处境”放到第一屏。
- 工人其实已经有名字和 backstory，且开局世界在菜单阶段就已生成（`src/entities/EntityFactory.js:createWorker`, `src/entities/EntityFactory.js:createVisitor`, `src/entities/EntityFactory.js:394-404`），但这些身份信息只在开始后点选实体时才可见，且菜单阶段还会把相关面板隐藏掉（`src/ui/hud/GameStateOverlay.js:175-180`）。
- 现有“叙事”文案主要停留在系统摘要或检视器里：`src/ui/panels/InspectorPanel.js:34-52` / `:143-162` 的 AI/System Narrative 更像调试阅读，而 roleplayer 反馈要的是前台、即时、人物化的 framing。

## 2. Suggestions（可行方向）

### 方向 A: 用现有角色数据重做开场第一屏的叙事入口
- 思路：保留现有 mechanics，只把菜单页和空状态面板改成“处境 + 人物 + 利害关系”优先，用已存在的 `displayName` / `backstory` / scenario summary 组织第一屏。
- 涉及文件：`index.html`、`src/ui/hud/GameStateOverlay.js`、`src/world/scenarios/ScenarioFactory.js`、`src/ui/panels/EntityFocusPanel.js`
- scope：中
- 预期收益：直接命中 reviewer 最强烈的不满点，玩家在按下 Start 之前就能看到“谁在这里、为什么危险、为什么值得关心”。
- 主要风险：菜单文案和 overlay DOM 改动会碰到现有 overlay / HUD 快照测试。

### 方向 B: 保持菜单不动，把叙事权重前移到运行中 HUD
- 思路：继续沿用当前菜单结构，但把 `HUDController` / `storytellerStrip` / `EventPanel` 的文案改成更人物化，让游戏开始后尽快出现角色感。
- 涉及文件：`src/ui/hud/HUDController.js`、`src/ui/hud/storytellerStrip.js`、`src/ui/panels/EventPanel.js`
- scope：中
- 预期收益：能提升开局后 30-60 秒的故事感，并复用已有 objectiveLog / obituary / beat surfaces。
- 主要风险：没有解决 reviewer 对“第一印象就是系统入口”的核心批评，ROI 低于菜单入口重排。

### 方向 C: 直接暴露 Inspector/AI Narrative 面板
- 思路：在菜单或运行初期把 `InspectorPanel` 的 Narrative 摘要前置显示。
- 涉及文件：`src/ui/panels/InspectorPanel.js`、`src/ui/hud/GameStateOverlay.js`
- scope：小
- 预期收益：实现快，能让 “AI Narrative” 不再藏得太深。
- 主要风险：会把调试味很重的“System Narrative / Evidence”直接推到前台，仍然不是人物入口，且容易越做越像 developer HUD。

## 3. 选定方案

选 **方向 A**，理由：它不引入新 mechanic，只重排现有 UI 和文案，并复用已经存在的 worker/visitor identity 数据，最符合 HW06 freeze 下“polish / fix / UX”边界；同时它正对 reviewer 扣分最重的开场 framing 问题，比继续堆 HUD 字幕更有效。

## 4. Plan 步骤

- [ ] Step 1: `src/world/scenarios/ScenarioFactory.js:13-74` — `edit` — 在 `SCENARIO_VOICE_BY_TEMPLATE` 里补充开场用的人物化字段（例如 `openingSituation` / `stakesLine` / `castPrompt`），只扩展 player-facing copy，不改 scenario mechanics、targets、anchors。
- [ ] Step 2: `src/ui/hud/GameStateOverlay.js:4-25` — `add` — 新增菜单叙事 helper（从 `state.gameplay.scenario` 与 `state.agents` 提取开场标题、副文案、前 2-3 名 colonist 的 `displayName` + `backstory`），明确区分 menu phase 与 active/end phase 的文案模型。
- [ ] Step 3: `index.html:1201-1226` — `edit` — 在 `overlayMenuPanel` 中增加专用 narrative slots（场景利害关系 / colony cast），并把纯控制提示降到次级位置，避免第一屏继续由模板、尺寸和热键占据视觉重心。
- [ ] Step 4: `src/ui/hud/GameStateOverlay.js:184-233` — `edit` — 渲染新的 menu narrative slots；菜单阶段把当前固定文案 `Survive as long as you can` 改成 scenario-specific stakes card，且在开局前不再把 timer/score 作为卡片主信息；保留 `formatOutcomeMeta()` 与 end panel 的 survival score 结算逻辑不变。
- [ ] Step 5: `src/ui/panels/EntityFocusPanel.js:268` — `edit` — 把“无实体选中”的空状态从泛化提示改成可点选的 named roster teaser（引用已有 worker `displayName` / `backstory`），让玩家开始后不用先猜“该点谁”。
  - depends_on: Step 2
- [ ] Step 6: `test/game-state-overlay-narrative.test.js` — `add` — 覆盖菜单阶段 narrative slots、scenario stakes card、以及“不在 menu 卡片里显示 survival timer/score”的回归场景。
  - depends_on: Step 2
- [ ] Step 7: `test/entity-focus-empty-state.test.js` — `add` — 覆盖未选中实体时的 named roster teaser，验证它读取真实的 `displayName` / `backstory` 而不是退回 generic hint。
  - depends_on: Step 5

## 5. Risks

- 菜单 overlay 文案结构变化可能打破现有 `test/game-state-overlay.test.js`、`test/hud-menu-phase.test.js`、`test/ui-voice-consistency.test.js` 对标题/摘要/阶段文案的假设。
- 若直接拼接 `state.agents` 顺序，菜单 cast 可能受初始生成顺序影响；需要保证 deterministic ordering，避免快照测试波动。
- 过度削弱 controls hint 会伤到 onboarding；应保留提示，但把它从第一叙事信号降为辅助信息。
- 可能影响的现有测试：`test/game-state-overlay.test.js`, `test/start-button-applies-template.test.js`, `test/entity-focus-player-view.test.js`, `test/scenario-voice-by-template.test.js`, `test/ui-voice-consistency.test.js`

## 6. 验证方式

- 新增测试：`test/game-state-overlay-narrative.test.js` 覆盖菜单阶段 narrative card / stakes copy / score-timer 去主导化。
- 新增测试：`test/entity-focus-empty-state.test.js` 覆盖开局后未选中实体时的 named roster teaser。
- 手动验证：打开 `http://127.0.0.1:4173/` → 停留在主菜单 → 期望第一屏能同时看到 scenario stakes 与 2-3 个有名 colonists，而不是只看到模板尺寸和 controls；点击 `Start Colony` → 未选中实体时 `entityFocusOverlay` 先给出可点选的名字与短 backstory。
- benchmark 回归：运行 `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains`，确认这是纯 UI/copy 改动，`DevIndex` 不低于当前基线 -5%。

## 7. UNREPRODUCIBLE 标记（如适用）

尝试在本轮用 Playwright MCP 复现 `http://127.0.0.1:4173/`，但当前会话暴露的 Playwright 工具只有 snapshot/click/screenshot，缺少可导航到本地 URL 的入口，因此未能完成浏览器内复现。此次定位改为基于实际 shipped UI 源码完成：`index.html:1201-1226`、`src/ui/hud/GameStateOverlay.js:184-233`、`src/world/scenarios/ScenarioFactory.js:25-66`、`src/entities/EntityFactory.js:createWorker/createVisitor` 与 `src/ui/panels/EntityFocusPanel.js:368-424`，这些内容与反馈中引用的菜单文案、模板名、分数/计时 framing 一致。
