---
reviewer_id: 02c-speedrunner
feedback_source: Round4/Feedbacks/02c-speedrunner.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~45
  new_tests: 2
  wall_clock: 60
conflicts_with: []
---

## 1. 核心问题

- 首个 run 入口并不稳定：`index.html:1851` 会在第一次加载时自动打开 `#helpModal`，该弹层会拦截 `Start Colony` 点击，导致 speedrunner 的第一步实验循环在 fresh load 上就被阻断。
- 进入 run 的“成功反馈”不够强：`src/app/GameApp.js:startSession` 虽然会切到 `active`，但当前可见反馈主要落在通用 action 文案，缺少一个明确、可扫描的“run 已开始 / 当前模板 / seed / restart 路径”的确认面。
- 菜单前置信息更像操作提示，不像实验提示：`src/ui/hud/GameStateOverlay.js:219` 只显示模板族名与尺寸，没把 speedrunner 真正在意的可比较信息提前组织出来。

## 2. Suggestions（可行方向）

### 方向 A: 修正首屏阻断，并给 run 开始一个明确握手反馈
- 思路：取消首次强制弹出帮助，保留 `How to Play` / `F1` 入口；同时在开始 run 时补一个更强的状态确认与 restart 提示。
- 涉及文件：`index.html:1819`, `index.html:1851`, `src/app/GameApp.js:startSession`, `src/ui/hud/GameStateOverlay.js:219`
- scope：小
- 预期收益：直接修复 fresh-load 开跑阻断，让 speedrunner 能在 10 秒内稳定进入第一轮实验，并更快判断本局是否值得继续。
- 主要风险：如果完全移除自动帮助，没有别的引导补位，首次玩家的教程发现率会下降。

### 方向 B: 保留帮助自动打开，但把开始流程改成显式两段式
- 思路：让帮助弹层本身承担“Continue to Run”职责，玩家在弹层内就能完成进入 run 的确认。
- 涉及文件：`index.html:1704`, `index.html:1786`, `src/app/GameApp.js:startSession`, `src/ui/hud/GameStateOverlay.js:82`
- scope：中
- 预期收益：把教程和开跑绑成一条链，理论上能同时覆盖 onboarding 与 speedrunner 入口。
- 主要风险：会改动现有帮助弹层职责，接近新交互设计；在 HW06 freeze 下风险高于必要值。

## 3. 选定方案

选 **方向 A**，理由：它直接命中 reviewer 的 P0 问题，而且改动最小，属于纯入口稳定性与 UX polish，不跨出 HW06 freeze。相比之下，方向 B 会把帮助系统改成新的主流程节点，范围和回归面都更大。

## 4. Plan 步骤

- [ ] Step 1: `index.html:1851` — `edit` — 移除首次加载自动 `openHelp()` 的分支，改成仅记录/读取 `utopia:helpSeen` 而不在 fresh load 时强制抢焦点。
- [ ] Step 2: `index.html:1819` — `edit` — 保留 `#helpBtn` / `#overlayHelpBtn` / `F1` / `?` 打开帮助的现有入口，并在帮助 footer 或按钮 title 上补充“按需查看”的轻量提示，避免 Step 1 后帮助完全失去存在感。
  - depends_on: Step 1
- [ ] Step 3: `src/app/GameApp.js:startSession` — `edit` — 将开始 run 的 action 文案改成更明确的 run-entry 确认，至少包含“run 已开始”、当前模板名，以及 restart / new map 的下一步入口提示。
  - depends_on: Step 1
- [ ] Step 4: `src/app/GameApp.js:#setRunPhase` — `edit` — 在切到 `active` 时补一个一次性的 run-start 状态同步钩子，确保 HUD 在菜单消失后马上出现稳定的 phase/paused/timer 可见状态，而不是依赖后续普通 tick 自然刷新。
  - depends_on: Step 3
- [ ] Step 5: `src/ui/hud/GameStateOverlay.js:219` — `edit` — 重写菜单 meta 行，把模板名、地图尺寸、seed（若 dev mode 开启）组织成更利于 speedrunner 扫描的格式，并避免只剩氛围化 family 文案。
  - depends_on: Step 3
- [ ] Step 6: `test/help-modal.test.js` — `edit` — 新增断言：`#helpModal` 默认关闭且不会在首次加载脚本末尾自动展开，但 `#overlayHelpBtn`、`F1`、`?` 仍能打开帮助。
  - depends_on: Step 1
- [ ] Step 7: `test/game-state-overlay.test.js` — `edit` — 新增 run-entry 回归用例：从 menu 进入 active 后，overlay 隐藏、HUD 显示、开始反馈文案立即可读。
  - depends_on: Step 4

## 5. Risks

- 去掉自动帮助后，01a/onboarding 相关预期可能回退，需要确认“帮助发现率”是否还能接受。
- `startSession` 与 `#setRunPhase` 同时改动时，容易和现有 `restartSession` / `resetSessionWorld` 的 phase 切换文案产生不一致。
- `GameStateOverlay` 菜单 meta 改写若过度强调 seed，可能重新触发 casual 侧对 dev-only 信息泄露的抱怨。
- 可能影响的现有测试：`test/help-modal.test.js`, `test/game-state-overlay.test.js`, `test/start-button-applies-template.test.js`

## 6. 验证方式

- 新增测试：`test/help-modal.test.js` 覆盖 fresh-load 不自动弹帮助、但保留 `How to Play` / `F1` / `?` 入口。
- 新增测试：`test/game-state-overlay.test.js` 覆盖 menu -> active 切换后 overlay 立即隐藏、HUD 立即可读、run-start 反馈文案存在。
- 手动验证：打开 dev server -> 首次进入 `http://127.0.0.1:4173/` -> 不关闭任何额外弹层即可直接点击 `Start Colony` -> 期望 1 秒内进入 active HUD，计时开始跳动，帮助弹层未拦截点击。
- 手动验证：fresh load 后点击 `How to Play`、按 `F1`、按 `?` -> 期望帮助仍可正常打开与关闭；进入 run 后使用 `New Map` / `Try Again` 不回归卡死。
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / `temperate_plains`，DevIndex 不低于当前基线 - 5%。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用。已在当前 build 复现到 fresh load 时 `#helpModal` 默认展开并拦截 `Start Colony`，且在关闭帮助后 run 可以进入 `active`，说明 reviewer 反馈里的“首个 run 入口不稳定”有明确的 UI 入口病因可定位。
