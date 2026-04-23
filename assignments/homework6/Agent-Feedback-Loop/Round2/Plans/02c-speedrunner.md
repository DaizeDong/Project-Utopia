---
reviewer_id: 02c-speedrunner
feedback_source: Round2/Feedbacks/02c-speedrunner.md
round: 2
date: 2026-04-22
build_commit: 01eec4d
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~60
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

归并速通玩家 feedback 里 9 条 findings → 3 根因：

1. **输入层承诺与实现脱节**（P2-1 + P0-4 表象）：工具栏 tooltip 写 "Road (1) … Clinic (12)"，但 `src/app/shortcutResolver.js` 的 `TOOL_SHORTCUTS` 只定义 `Digit1`–`Digit6`；`Digit7`–`Digit9/0` 的 quarry/herb_garden/kitchen/smithy/clinic/erase 全部无响应。canvas click 本身是可用的（`#ui { pointer-events: none }` + 子元素 auto），但玩家在暂停下没法用键盘建筑——这是 agency 的根因。
2. **4× 倍速链路上的三处不一致**（P1-10）：
   - `src/app/GameApp.js:697 setTimeScale` 把入参 clamp 到 **[0.25, 2.0]**，slider 永远达不到 4。
   - `src/ui/hud/HUDController.js:221` FastForward 按钮 **绕过** `setTimeScale`，直接写 `state.controls.timeScale = 4.0` → 写入成功，但下一帧 PerformancePanel 的 label 会显示为 2x（下条）。
   - `src/ui/panels/PerformancePanel.js:144 #syncTimeScaleLabel` 又 clamp 到 `Math.min(2, ...)`，导致 HUD 显示永远 ≤ 2.00x，与底层 simStepper 实际用的 4x 不一致——这就是 reviewer 说的"button state 偶发不触发"的现象根源（按钮点了，模拟真的 4x，但 UI 假装没生效）。
3. **Autopilot 不可见 toggle 隐藏**（P0-4 部分）：`aiToggle` 复选框埋在 Sidebar 一个 `<details>` 卡里（index.html:1220），新玩家找不到；而且它 toggle 的是 "LLM Agent" 而非 "DRIFT autopilot"（fallback 策略仍在跑）。速通玩家想"停 autopilot 自己操作"做不到。

上述 3 条都在 HW06 feature-freeze 的允许范围内（tooltip 兑现 / bug fix / UI polish）。

## 2. Suggestions（可行方向）

### 方向 A: 三处 1-line 修补 + toolbar toggle 可见化（小 scope 完整收口）

- 思路：
  1. 扩展 `TOOL_SHORTCUTS` map 到 Digit7–Digit0（共 12 个工具；Digit0 → 第 10 号 kitchen，Digit-/Digit= 备选或 shift 组合）。
  2. 放开 `setTimeScale` 的 clamp 上界 2.0 → 4.0；放开 `PerformancePanel.#syncTimeScaleLabel` 的 `Math.min(2, ...)` → `Math.min(4, ...)`；index.html `#timeScale` slider `max="200"` → `max="400"`。
  3. 把隐藏在 sidebar 卡里的 `aiToggle` 复制/迁移到 **顶部 HUD 时间控制条**（speedPauseBtn/speedPlayBtn/speedFastBtn 旁），label 改写为 "Autopilot (AI)"，使它成为一个可见的 on/off 翘板；点击后同步 `state.ai.enabled`。
- 涉及文件：`src/app/shortcutResolver.js`、`src/app/GameApp.js`、`src/ui/panels/PerformancePanel.js`、`src/ui/hud/HUDController.js`、`index.html`
- scope：小
- 预期收益：3 个速通核心诉求一次性收口；不动任何模拟逻辑；可直接跑现有测试
- 主要风险：`TOOL_SHORTCUTS` 扩展需要更新 `test/shortcut-resolver.test.js` 的枚举断言；PerformancePanel label 改后 `test/sim-stepper-timescale.test.js` 不会受影响（那里已经在测 4.0）

### 方向 B: 重写 HUD 速度控制成段式按钮组（Pause/1×/2×/4×）

- 思路：把 HUDController.setupSpeedControls 的三个按钮扩成 Pause/1×/2×/4× 四档明确按钮，并在顶条加 autopilot toggle，同时修 1-12 热键。
- 涉及文件：`src/ui/hud/HUDController.js`、`index.html`、`src/app/shortcutResolver.js`、`src/app/GameApp.js`、可能 `PerformancePanel`
- scope：中
- 预期收益：速通玩家得到标准 RTS 式 1×/2×/4× 档位，可读性最好
- 主要风险：新增 UI DOM 节点需要动 CSS；引入 2× 档本质上属于"新增 UI 档位"，边界模糊（HW06 freeze 允许 polish 但介于"加新功能"边界）；改动比方向 A 大 3–4 倍；更容易在 shortcut 测试里出现回归

### 方向 C: 保守方案——只修 label/clamp bug，不动热键与 toggle

- 思路：仅修 PerformancePanel label clamp 和 setTimeScale clamp；不扩展 1-12 热键，不迁移 autopilot toggle。用 "feedback 里声称的能力，确认存在" 的最小面。
- 涉及文件：`src/app/GameApp.js`、`src/ui/panels/PerformancePanel.js`、`index.html`
- scope：极小
- 预期收益：4× 倍速显示与实际值同步
- 主要风险：留着 1-12 热键半残和 autopilot 隐藏不解决，reviewer 的 P0-4/P2-1 无改进，下轮还会重复出现

## 3. 选定方案

选 **方向 A**。理由：

- 核心问题是三处"承诺 ≠ 实现"的契约漏洞 → 都是 bug fix / polish，精准落在 HW06 freeze 允许范围内；不加新 mechanic、不动 Score 公式、不加胜利条件。
- 三处修补各自 1–3 行；总 loc_delta 估计 ~60（含测试）；Coder 半小时可完成。
- 方向 B 的 4 档按钮本质上加了新 UI 档位，与 HW06 "只 fix 现有 bug" 的硬约束更贴边；方向 C 漏修两个 P0 相关点。
- 方向 A 保留 shortcutResolver 的单一枚举表（TOOL_SHORTCUTS），不破坏现有 `test/shortcut-resolver.test.js` 的结构，只扩展条目。

## 4. Plan 步骤

- [ ] **Step 1**: `src/app/shortcutResolver.js:TOOL_SHORTCUTS` — edit — 把 `TOOL_SHORTCUTS` freeze 对象从 6 条扩到 12 条，新增 `Digit7: "quarry"`、`Digit8: "herb_garden"`、`Digit9: "kitchen"`、`Digit0: "smithy"`、`Minus: "clinic"`、`Equal: "bridge"`（顺序须与 index.html:1108-1119 的 `data-tool` 按钮 tooltip 里声明的 `(1)…(12)` 位数一致；把 erase 从 "7" 调整为 "13 / Backspace" 备选，以腾出 Digit7 给 quarry）。**注意**：若要保持 index.html tooltip 中的数字标签不变，改法二是把 `Digit7: "erase"`、`Digit8: "quarry"`、`Digit9: "herb_garden"`、`Digit0: "kitchen"`、`Minus: "smithy"`、`Equal: "clinic"`、`BracketLeft: "bridge"`（以 tooltip 原标号为准；以按钮顺序为准，Coder 选后者以避免也改 HTML tooltip）。
- [ ] **Step 2**: `src/app/shortcutResolver.js:SHORTCUT_HINT` — edit — 把 hint 字符串 `"1-6 tools"` 改为 `"1-0/-/= tools (12 slots)"`，避免文档漂移
- [ ] **Step 3**: `test/shortcut-resolver.test.js` — edit — 扩展测试用例覆盖新增的 Digit7/8/9/0/Minus/Equal 分派；保留原 1-6 测试（断言向后兼容）
  - depends_on: Step 1
- [ ] **Step 4**: `src/app/GameApp.js:697 setTimeScale` — edit — 把 `Math.max(0.25, Math.min(2.0, ...))` 改为 `Math.max(0.25, Math.min(4.0, ...))`，与 `simStepper.js:17` 的 4.0 上限对齐
- [ ] **Step 5**: `src/ui/panels/PerformancePanel.js:144 #syncTimeScaleLabel` — edit — 把 `Math.min(2, this.state.controls.timeScale || 1)` 改为 `Math.min(4, ...)`；label 格式保持 `${value.toFixed(2)}x` 不动，让 4.00x 能正确显示
- [ ] **Step 6**: `index.html:1456` — edit — slider `<input id="timeScale" type="range" min="25" max="200" …>` 的 `max="200"` 改为 `max="400"`；`#timeScaleLabel` 的默认文本从 `"1.00x"` 保持不变
  - depends_on: Step 5
- [ ] **Step 7**: `src/ui/hud/HUDController.js:setupSpeedControls` — edit — 在方法末尾追加：查询 `document.getElementById("aiToggle")` 与新建一个顶条镜像复选框 `#aiToggleTop`（若不存在则不做 DOM 操作，保持 headless 测试兼容），把两者 `change` 事件互相同步到 `state.ai.enabled`；并在 HUDController `render()` 里 mirror `aiToggle.checked` 到 `aiToggleTop.checked`
- [ ] **Step 8**: `index.html`（speedPauseBtn 同一行 HUD 时间控制区块，位置 ≈ speedPauseBtn 附近的容器 div 内） — add — 新增一个 `<label><input id="aiToggleTop" type="checkbox" />Autopilot</label>` 元素；class 按附近按钮复用；`aria-label="Toggle AI autopilot"`；保持 `pointer-events: auto`
  - depends_on: Step 7
- [ ] **Step 9**: `test/sim-stepper-timescale.test.js` — edit — 新增断言 `setTimeScale(4)` 后 `state.controls.timeScale === 4`（驱动 GameApp setter 而不是 stepper 本身；若该 test 文件只覆盖 stepper，则在 `test/ui-hud-speed.test.js` 新建或在既有 HUD 测试里扩展）
  - depends_on: Step 4
- [ ] **Step 10**: 新建 `test/hud-autopilot-toggle.test.js` — add — JSDOM 场景下构造一个带 `#aiToggle` + `#aiToggleTop` 的 DOM，验证点 `#aiToggleTop` 后 `state.ai.enabled` 翻转且 `#aiToggle.checked` 跟随；反向同理
  - depends_on: Step 7, Step 8

## 5. Risks

- **Risk 1**：扩展 `TOOL_SHORTCUTS` 后，若玩家浏览器的数字键在 IME 开启状态下给出的是 KeyEvent.code="Digit7" 但 key="&"（shift 组合），`resolveGlobalShortcut` 已经用 `code` 分派，不受影响；但 `eventKey` 的小写匹配可能在 Minus/Equal 上触碰到现有逻辑分支。需要在 Step 3 里加 guard 测试 shift+7 不误触发 clinic。
- **Risk 2**：`setTimeScale` 放开到 4.0 后，长 horizon benchmark 在 4× 累计可能增加 tick/sec 压力。`simStepper.js:17` 已经做过 Phase 10 determinism 验证，但 benchmark CSV 期望的 avgFps 在 4× 档下会下降。需要跑一次 `scripts/long-horizon-bench.mjs` 对照 DevIndex。
- **Risk 3**：新增 `#aiToggleTop` 节点如果挤占 statusBar 宽度，可能触发 P1-3 响应式崩坏（summary.md 已列）。建议用 `display: inline-flex` + `flex-shrink: 0`，并在 compact mode 隐藏文字 label 只留 icon。
- **Risk 4**：Autopilot toggle 翻转后必须与 `src/simulation/ai/…` 的 DRIFT fallback 策略联动。目前 `state.ai.enabled=false` 只是停 LLM，fallback 仍跑——如果 Coder 误以为 toggle 能彻底停 autopilot，会做超出范围的代码改动。**此处不改 fallback；只让 toggle 的现有语义在顶条可见**，UX 文案要明写 "LLM Agent only"。
- 可能影响的现有测试：`test/shortcut-resolver.test.js`（必须更新）、`test/sim-stepper-timescale.test.js`（不受影响，仅 stepper）、`test/ui-layout.test.js`（若 aiToggleTop 改动 statusBar layout 断言）、`test/help-modal.test.js`（若 SHORTCUT_HINT 文本被断言）。Coder 在 Step 2 修 HINT 后需跑 help-modal 测试。

## 6. 验证方式

- **新增测试**：
  - `test/shortcut-resolver.test.js`（扩展）覆盖 Digit7–Digit0/Minus/Equal → quarry/herb_garden/kitchen/smithy/clinic/bridge 的分派；额外覆盖 shift+Digit7 不触发工具选择。
  - `test/hud-autopilot-toggle.test.js`（新建）覆盖 `#aiToggleTop` 与 `#aiToggle` 的双向同步；断言 `state.ai.enabled` 与 UI 一致。
- **手动验证**：
  1. `npx vite` 启动 → Start Colony → 暂停 (Space) → 按 8/9/0 确认 quarry/herb_garden/kitchen 切换，`Selected Tool` 行变化。
  2. 点 HUD FastForward (4×) → PerformancePanel 的 `Time Scale` label 显示 `4.00x`（而不是 2.00x）；slider 拉到右端也可达 4.00x。
  3. 点顶条 Autopilot 复选框关闭 → sidebar 里的 `aiToggle` 同步取消勾选；面板状态面板显示 `AI disabled. Using fallback.`。
  4. 在暂停下连续按 2,2,2（Farm）+ click 三个不同 tile，确认每次 placeToolAt 都成功扣费并落子（暂停下 buildSystem 不受阻）。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed=42 / temperate_plains，DevIndex 不得低于当前基线 44 − 5% = **41**。4× 档位验证只针对 HUD 联调，不进 bench schedule（bench 自己跑 timeScale=1）。

## 7. UNREPRODUCIBLE 标记

未使用 Playwright MCP 做现场复现（工具未在本会话中启用）；核心问题由代码静读直接定位并三处全部可见：
- `shortcutResolver.js` TOOL_SHORTCUTS 只有 6 条 vs index.html 12 个按钮 tooltip "(1)…(12)"：可直接证伪；
- `GameApp.js:698` clamp 2.0 vs `simStepper.js:17` clamp 4.0 vs `HUDController.js:221` 写入 4.0 vs `PerformancePanel.js:144` label clamp 2.0：代码级三处不一致可直接证伪；
- `aiToggle` 仅存在于 `index.html:1220` sidebar 折叠卡内：DOM 路径即为证据。

无需 live session 复现即可确认根因；Coder 可按 Step 1–10 直接施工。
