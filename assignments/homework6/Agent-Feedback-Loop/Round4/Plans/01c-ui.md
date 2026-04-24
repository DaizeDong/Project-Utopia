---
reviewer_id: 01c-ui
feedback_source: Round4/Feedbacks/01c-ui.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~180
  new_tests: 2
  wall_clock: 150
conflicts_with: []
---

## 1. 核心问题

- 标题页把主启动动作、地图配置、热键说明和生存状态都放在同一层级里，`Start Colony` 没有形成绝对主次，第一次进入时阅读路径被打断。
- 主 HUD 混入了面向开发者或系统内部的文案与状态：`Dev 49/100`、`Autopilot OFF - manual - coverage fallback`、过密的目标 checklist、storyteller/score breakdown 等一起争抢顶部注意力。
- 右侧 `Colony` 面板和左侧建造区默认直接暴露细节层，没有先给“概览层”，导致资源/人口/职业信息与建造说明都显得像调试读数而不是策略 UI。

## 2. Suggestions（可行方向）

### 方向 A: 做一次“信息层级重排”而不是继续加字
- 思路：保留现有系统与数据，只重排标题页、顶部 HUD、左右面板的默认可见层级，把关键决策信息前置，把细节/调试信息后移或折叠。
- 涉及文件：`index.html`、`src/ui/hud/GameStateOverlay.js`、`src/ui/hud/HUDController.js`、`src/ui/hud/autopilotStatus.js`、`src/ui/interpretation/WorldExplain.js`、`src/ui/tools/BuildToolbar.js`
- scope：中
- 预期收益：同时解决“首屏主次不清”“HUD 噪声过多”“Colony 面板扑面而来”这三类根因，且不引入新 mechanic。
- 主要风险：会影响现有 HUD/DOM 结构，相关 UI 单测与布局断言需要同步更新。

### 方向 B: 最小化清理 telemetry 泄漏
- 思路：只把 dev/debug 文本从玩家主 HUD 隐掉，缩短 autopilot 与目标追踪文案，尽量不动标题页和面板结构。
- 涉及文件：`index.html`、`src/ui/hud/HUDController.js`、`src/ui/hud/autopilotStatus.js`、`src/ui/interpretation/WorldExplain.js`
- scope：小
- 预期收益：能快速提高成品感，改动面较小，测试回归压力低。
- 主要风险：无法触及标题页和 `Colony` 面板的层级问题，审稿人指出的“UI 会说话能力弱”只会被部分缓解。

### 方向 C: 只重做左右面板默认态
- 思路：保留顶部 HUD 基本不动，重点把 `Build` / `Colony` 两侧面板改成“概览 + 折叠细节”。
- 涉及文件：`index.html`、`src/ui/hud/HUDController.js`、`src/ui/tools/BuildToolbar.js`
- scope：中
- 预期收益：能明显降低长时间游玩时的扫描负担。
- 主要风险：标题页和顶部 HUD 仍然是第一印象问题，收益不够完整。

## 3. 选定方案

选 **方向 A**，理由：这是 P1 级 UI polish/root-cause 修复，能在不新增系统的前提下，一次性处理标题页、主 HUD、面板默认态三处同源问题；范围仍然落在 HW06 freeze 允许的 polish / UX / 信息架构内。

## 4. Plan 步骤

- [ ] Step 1: `index.html:1201` — edit — 重排标题页 `overlayMenuPanel`，把 `Start Colony` 保持为唯一主 CTA，把 `Template` / `Map Size` / 控制提示改成次级区块或折叠区，而不是继续与主按钮并列。
- [ ] Step 2: `src/ui/hud/GameStateOverlay.js:render` — edit — 同步标题页文案与元信息输出，只保留首屏必需的 scenario/title/meta，避免把高级设置与玩家首个动作混成同一阅读层。
  - depends_on: Step 1
- [ ] Step 3: `index.html:1128` — edit — 重排顶部 `statusScoreboard` / `storytellerStrip` 区域的默认可见内容，保留“生存状态 + 任务进度 + next action”主链路，把 `statusScoreBreak`、`latestDeathRow`、storyteller 次要信息和 dev 味较重的元素降级到次级显示或 `dev-only`。
- [ ] Step 4: `src/ui/hud/autopilotStatus.js:getAutopilotStatus` — edit — 收敛 autopilot 可见文案，移除 `manual` / `coverage fallback` 这类系统内部措辞，保留玩家能理解的开关状态；详细诊断信息只放 tooltip 或 debug surface。
  - depends_on: Step 3
- [ ] Step 5: `src/ui/interpretation/WorldExplain.js:getFrontierStatus` — edit — 将当前超长 frontier 摘要从日志式串联文本改成更适合 HUD 的概览表述，避免把所有 logistics target 都塞进一句长句。
- [ ] Step 6: `src/ui/interpretation/WorldExplain.js:getScenarioProgressCompact` — edit — 缩短顶部任务追踪 tokens，优先保留 routes / depots / 当前缺口，减少 `warehouses/farms/lumbers/walls` 全量同时在线的噪声。
  - depends_on: Step 5
- [ ] Step 7: `src/ui/hud/HUDController.js:render` — edit — 按新的层级规则重新绑定 HUD：主状态栏只写入玩家当前决策所需信息，把 dev/debug/secondary chips 的写入改为条件渲染或次级面板写入。
  - depends_on: Step 4
  - depends_on: Step 6
- [ ] Step 8: `index.html:1266` — edit — 调整左侧 `Build` 面板与右侧 `Colony` 面板默认结构：建造区保留当前工具概览，资源/人口面板新增“概览层”，详细职业与每分钟波动改为折叠后查看。
- [ ] Step 9: `src/ui/hud/HUDController.js:render` — edit — 给新的 `Colony` 概览层提供数据绑定，默认先展示关键资源与总人口摘要，细节层再填充 per-minute 与职业拆分。
  - depends_on: Step 8
- [ ] Step 10: `src/ui/tools/BuildToolbar.js:sync` — edit — 强化当前选中工具的状态表达，并把建造说明保持在“当前工具摘要”层，避免工具区继续呈现为纯文字密集按钮墙。
  - depends_on: Step 8

## 5. Risks

- 顶部状态栏 DOM 结构变化可能打破现有 HUD 测试对固定节点顺序/文本的断言。
- 将 `statusScoreBreak`、storyteller、latest-death 等元素降级后，依赖这些节点始终可见的测试或样式可能需要同步调整。
- `Colony` 面板从“全部默认展开”改成“概览 + 细节”后，已有面板开合持久化状态可能需要兼容旧 localStorage 键值。
- 可能影响的现有测试：`test/hud-controller.test.js`、`test/game-state-overlay.test.js`、`test/responsive-status-bar.test.js`、`test/ui-layout.test.js`、`test/storyteller-strip.test.js`、`test/hud-autopilot-status-contract.test.js`

## 6. 验证方式

- 新增测试：`test/ui/title-screen-hierarchy.test.js` 覆盖标题页“主 CTA 前置、地图设置降级、重复提示收敛”的 DOM 结构。
- 新增测试：`test/ui/player-hud-hierarchy.test.js` 覆盖主 HUD 只保留玩家关键链路、autopilot 文案去 telemetry 化、`Colony` 面板默认先显示概览层。
- 手动验证：打开 `http://127.0.0.1:4173/` -> 首屏确认 `Start Colony` 是唯一视觉主按钮且模板/尺寸不再抢同级 -> 进入游戏确认顶部先看到生存时间/目标/下一步，而不是 `Dev` / `coverage fallback` / 过密 checklist -> 切换 `Colony` / `Build` 确认默认态更易扫读、细节仍可展开。
- benchmark 回归：运行 `scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains`，DevIndex 与当前基线相比不得下降超过 5%。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。本次已在 `http://127.0.0.1:4173/` 成功复现标题页层级问题、HUD telemetry 泄漏、任务追踪过密以及 `Colony` 面板默认信息过载。
