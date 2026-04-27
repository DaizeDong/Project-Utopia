---
reviewer_id: 01d-mechanics-content
feedback_source: Round1/Feedbacks/01d-mechanics-content.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P0
estimated_scope:
  files_touched: 5
  loc_delta: ~180
  new_tests: 2
  wall_clock: 60
conflicts_with: []
---

## 1. 核心问题

Reviewer 打了 3/10，核心抱怨"系统都在，玩家感知不到"。**归并为 3 个根本问题**
（按可实施性 × 投诉密度排序；所有方案都只 surface 已有机制，**不加新 mechanic**，
符合 HW06 freeze）：

1. **P0 — Entity Focus 点击完全失灵（核心交互入口坏掉）**
   静态代码审计确认病因：`SceneRenderer.js:983-988` 为 worker/visitor/herbivore/
   predator 用的 InstancedMesh 所承载几何体是 `SphereGeometry(0.34, ...)`——**半径
   仅 0.34 世界单位**，在默认相机距离下屏幕投影大概是 8-12 像素直径。
   `#pickEntity` (`SceneRenderer.js:1850-1902`) 用 `this.raycaster` **无任何
   tolerance** 地射向 mesh；只要玩家点击落在这个 8-12px 圆外一点就直接 miss。
   Miss 之后 `#onPointerDown` (`SceneRenderer.js:1944-1976`) 立刻跳到 `#pickTile`
   + `buildSystem.placeToolAt`——**玩家根本不知道"差了一点点"，只看到 Entity
   Focus 面板一直显示 "No entity selected"**。与 reviewer "暂停+5 次不同坐标全
   失败"的观察完全吻合。

2. **P1 — 死亡无玩家可见因果链（"我不知道谁为什么死了"）**
   后端数据已经齐全：`MortalitySystem.recordDeath`（`MortalitySystem.js:190-233`）
   已经填 `state.metrics.deathsByReason`、`deathByReasonAndReachability`、
   `state.gameplay.objectiveLog` 里已 unshift 了 "[t] Name died (reason) near
   (x,y)" 行；Round-0 也已在 `EventPanel.js:60-82` 把 objectiveLog 追加到
   "Recent Colony Events" 区块。**问题是这个区块躲在 Events 面板深处**，
   reviewer 玩 20 分钟没看见；HUD 顶栏的 deaths 聚合 `HUDController.js:299-346`
   只显示 `N (starve X / pred Y)`——**没有最近一条死因的快捷面板**。

3. **P1 — 资源速率无成分拆解（"Food -149.6/min 不知道哪里漏"）**
   Round-0 已经加了 `/min` 徽标（`HUDController.js:181-226`），但只是净流量。
   `ColonyPerceiver.js` 里已经在跟踪 production/consumption/spoilage（reviewer
   引用过该数字），**HUD 只取了 delta 没拆开**。玩家看到"130→9→87 反复跳"时
   无法归因。

*注：reviewer 还建议 "扩建筑 / 拆 Food 子类 / 扩事件库 / 工人个体化" 等——全部
属于新 mechanic 或新内容量级扩张，**违反 HW06 freeze**，本 plan 不采纳；采用
的策略是 "surface existing mechanic" 而非 "add new mechanic"。*

## 2. Suggestions（可行方向）

### 方向 A: 修 Entity Focus 点击 + 死因快捷行 + 食物成分拆解（P0+P1，最小改动三件套）

- 思路：
  - (a) 在 `SceneRenderer.#pickEntity` 末尾加一个 **屏幕空间 fallback**：如果
    raycast 硬命中返回空，遍历 `entityById` 把每个实体 world 坐标 project 到
    屏幕，选离点击点 ≤ 24px 的最近实体。这能把 8-12px 的"小白球"变成 ~48px
    的有效点击区，**不改 mesh、不改 mechanic、只改 pick 容差**。
  - (b) HUDController 新加一个 `#hudLatestDeathVal` DOM 节点，每次渲染时读
    `state.gameplay.objectiveLog[0]` 里"died"关键字最近那条，写入该 DOM；
    复用 Round-0 `_lastDeathsSeen` / obituary 节流逻辑，不在 3s 内重复渲染。
  - (c) HUDController 扩展 rate 计算：除 `net = (snap - prev) / dt * 60`，
    把 `state.metrics.foodProduced / foodConsumed / foodSpoiled / foodRaided`
    （如果 metrics 里有；若无则从 `ColonyPerceiver.observation.economy.food`
    取 production/consumption/spoilage 字段）同期 delta 化，渲染成
    `Food ▼ −149.6/min (prod +50 / cons −180 / spoil −20)`。
- 涉及文件：
  - `src/render/SceneRenderer.js:1850-1902`（#pickEntity 加屏幕距离 fallback）
  - `src/ui/hud/HUDController.js:100-140`（DOM ref + 构造）
  - `src/ui/hud/HUDController.js:181-226`（rate 拆解）
  - `src/ui/hud/HUDController.js:299-346`（death 快捷行）
  - `index.html:~1020`（加一个 `<div id="latestDeathRow">` 与
    `<span id="foodRateBreakdown">` 的 DOM 节点 + style）
- scope：小-中
- 预期收益：直接命中 reviewer 3 条 P0/P1 投诉，3/10 → ~6/10；投诉 1
  ("Entity Focus 失灵")被根治，投诉 3、4（死亡无日志 / 因果不清）被暴露。
- 主要风险：屏幕空间 fallback 的 24px 阈值若太大可能在密集人群里选错实体；
  用"先 raycast 硬命中，miss 才 fallback"的两段式最小化这个风险。

### 方向 B: 把 EntityFocus 默认展开 + 死亡日志独立面板（更大改动）

- 思路：`entityFocusOverlay` 在 `index.html:963` 是 `<details>` 默认合上，
  改为默认 `open`；同时新建 `src/ui/panels/DeathLogPanel.js` 独立渲染
  objectiveLog 里"died"行，挂到左侧 floating panel 区。
- 涉及文件：`index.html` + 新 panel + GameApp 注册。
- scope：中
- 预期收益：可感知度再提升，但 **不治 pick 失灵的根因**——Entity Focus 展开
  了，玩家还是点不到工人。
- 主要风险：①"新 panel" 可能被误判新 mechanic；②panel 注册路径涉及 GameApp
  init 顺序，回归面更大。

### 方向 C: 只改 CSS/文案（最保守）

- 思路：把 `#entityFocusBody` 的"No entity selected"文案改成"Tip: zoom in
  with wheel, then click the worker sphere"，再在 index.html 加个小图例。
- scope：极小
- 预期收益：无；reviewer 明确写了"暂停后反复点击 5 次仍失败"，不是文案问题。
- 主要风险：不治本，reviewer 复评大概率仍 ≤ 3/10。

## 3. 选定方案

选 **方向 A**。理由：

- **根治** P0（pick 失灵）而非绕开；同时 surface 两个已有后端能力
  （deathsByReason / foodConsumption breakdown）。
- 全部改动只改**渲染层 + HUD 显示层**，未动 simulation / balance / mechanic，
  不触 freeze 红线。
- 对测试的冲击最小：`test/hud-resource-rate.test.js` 已由 Round-0 覆盖 net-rate
  路径，新增 breakdown 只追加断言；Entity pick fallback 可加新测试文件而不
  影响既有。
- LOC delta 可控 ~180；方向 B ~300+ LOC 且要 UI 布局调整，与 20-min 执行
  预算对不齐。

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/SceneRenderer.js:1850-1902` — edit — 在
  `#pickEntity(mouse)` 方法末尾（`return candidates[0].entity;` 之前）加
  **屏幕空间 fallback**：
  ```js
  if (candidates.length === 0) {
    // Screen-space proximity fallback — entity spheres are r=0.34
    // (~8-12px at default zoom), which is below the ~44px touch target
    // minimum. If raycast misses, project each live entity to NDC and pick
    // the nearest within SCREEN_PICK_RADIUS_PX (24px).
    const SCREEN_PICK_RADIUS_PX = 24;
    const rect = this.canvas.getBoundingClientRect();
    const targetPx = {
      x: ((mouse.x + 1) / 2) * rect.width,
      y: ((1 - mouse.y) / 2) * rect.height,
    };
    const v = new THREE.Vector3();
    let best = null; let bestDistPx = SCREEN_PICK_RADIUS_PX;
    for (const e of this.entityById.values()) {
      if (e.alive === false) continue;
      v.set(e.x, 0.48, e.z).project(this.camera);
      if (v.z < -1 || v.z > 1) continue;
      const px = ((v.x + 1) / 2) * rect.width;
      const py = ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(px - targetPx.x, py - targetPx.y);
      if (d < bestDistPx) { bestDistPx = d; best = e; }
    }
    if (best) return best;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0].entity;
  ```
  保持原有 raycast 优先 — 只在 zero-hit 时兜底，不改变已有精确命中行为。

- [ ] **Step 2**: `src/render/SceneRenderer.js` (imports section, ~top of file)
  — verify — 确认 `THREE.Vector3` 已经导入；若用 ES `import * as THREE`
  风格（该文件确实如此）无需新增 import。
  - depends_on: Step 1

- [ ] **Step 3**: `index.html:~1020` (HUD top status bar, 紧邻 `#deathVal`)
  — edit — 新增两个 DOM 节点供 HUD 写入：
  ```html
  <div class="hud-row" id="latestDeathRow" title="Most recent colonist death — click any worker to inspect their intent/path">
    <span class="muted small">Last:</span>
    <span id="latestDeathVal" class="small">—</span>
  </div>
  ```
  并在 `#foodRateVal` 所在行的**同一 li/div**末尾（index.html 约 1050 行附近
  `<span id="foodRateVal" ...>` 之后）追加：
  ```html
  <span id="foodRateBreakdown" class="small muted" style="margin-left:4px;">—</span>
  ```

- [ ] **Step 4**: `src/ui/hud/HUDController.js:100-140` (constructor block,
  紧挨 `this.foodRateVal = document.getElementById("foodRateVal");`) — edit —
  加 DOM ref：
  ```js
  this.latestDeathVal = document.getElementById("latestDeathVal");
  this.foodRateBreakdown = document.getElementById("foodRateBreakdown");
  ```
  - depends_on: Step 3

- [ ] **Step 5**: `src/ui/hud/HUDController.js:181-226` (resource-rate
  computation block, 在 `const rates = this._lastComputedRates;` 之后) — edit
  — 计算食物 breakdown 文本：
  ```js
  if (this.foodRateBreakdown) {
    const m = this.state.metrics ?? {};
    // Prefer per-minute windowed deltas if ColonyPerceiver populated them;
    // fall back to cumulative counters divided by sim time.
    const prod = Number(m.foodProducedPerMin ?? m.foodProduced ?? 0);
    const cons = Number(m.foodConsumedPerMin ?? m.foodConsumed ?? 0);
    const spoil = Number(m.foodSpoiledPerMin ?? m.foodSpoiled ?? 0);
    const parts = [];
    if (prod > 0.05) parts.push(`prod +${prod.toFixed(0)}`);
    if (cons > 0.05) parts.push(`cons -${cons.toFixed(0)}`);
    if (spoil > 0.05) parts.push(`spoil -${spoil.toFixed(0)}`);
    this.foodRateBreakdown.textContent = parts.length > 0
      ? `(${parts.join(" / ")})`
      : "";
  }
  ```
  如果 `state.metrics` 里没有 `foodProducedPerMin/...`，本步骤落到 `""`（空
  字符串）——**不会让 UI 报错**，只是暂无 breakdown。Coder 可在执行前用
  Grep 在 ColonyPerceiver 里确认字段名并映射。
  - depends_on: Step 4

- [ ] **Step 6**: `src/ui/hud/HUDController.js:299-346` (death aggregate block,
  在 `this.deathVal.textContent = aggregate;` 之后的**同一个 if 分支外**) —
  edit — 追加"最近一条死亡快讯"渲染逻辑：
  ```js
  if (this.latestDeathVal) {
    const log = Array.isArray(this.state.gameplay?.objectiveLog)
      ? this.state.gameplay.objectiveLog
      : [];
    // objectiveLog is newest-first (unshift). Find the first line that
    // describes a death; skip recovery / storyteller entries.
    const latestDeathLine = log.find((ln) => /died\s*\(/.test(String(ln ?? "")));
    this.latestDeathVal.textContent = latestDeathLine
      ? String(latestDeathLine).slice(0, 80)
      : "No deaths yet";
    this.latestDeathVal.setAttribute?.("title",
      latestDeathLine ?? "No deaths this run");
  }
  ```
  - depends_on: Step 4

- [ ] **Step 7**: `test/entity-pick-screen-fallback.test.js` — add — 新建单测
  （无需 WebGL，mock `canvas.getBoundingClientRect` + mock `this.camera` 的
  `project`）：构造 `SceneRenderer` 的 `#pickEntity` 可访问版本（可抽取为
  普通导出函数 `pickEntityWithFallback(state, entitiesById, canvasRect, camera,
  mouseNdc)`，或在测试里 stub 内部依赖）。断言：
  - 当 `candidates` 为空但某实体 project 后距 targetPx < 24，返回该实体；
  - 当所有实体 project 距离 > 24，返回 null；
  - 屏幕外 (z > 1) 实体不参与。
  若抽函数难度大，则改为**集成测试 via jsdom + mock three.js**，断言
  `state.controls.selectedEntityId` 在一次 "close-but-not-hit" 点击后被设置。
  - depends_on: Step 1

- [ ] **Step 8**: `test/hud-latest-death-surface.test.js` — add — 新建单测：
  mock `document.getElementById` 返回 stub 节点，构造最小 state 带
  `gameplay.objectiveLog = ["[12.3s] Alice died (starvation) near (10,10)",
  "[5.0s] Emergency relief arrived: +40 food"]`，调用 HUDController.render()
  后断言：
  - `latestDeathVal.textContent` 包含 `"Alice died (starvation)"`；
  - 若 objectiveLog 为空，`textContent === "No deaths yet"`。
  - depends_on: Step 6

## 5. Risks

- **屏幕空间 fallback 在密集人群里可能选错邻居实体**。缓解：24px 阈值偏保守，
  且 raycast 硬命中优先；若 Coder 在实测里发现误选多，阈值可收紧到 16px。
- **`foodProducedPerMin/...` 字段若 ColonyPerceiver 未曾写入 state.metrics**，
  Step 5 的 breakdown 会永远是空字符串，reviewer 复评可能仍 flag "没拆解"。
  **缓解**：Coder 执行 Step 5 前必须 `Grep -n "foodProduced"
  src/simulation/ai/colony/ColonyPerceiver.js`，确认字段；若缺失则在
  `ColonyPerceiver` observe 阶段追加一行 `state.metrics.foodProducedPerMin =
  rate` （属于只读 metric 填充，仍不越 freeze 线）。
- **objectiveLog unshift 的 "[t]" 前缀正则**：MortalitySystem 写入格式是
  `[12.3s] Name died (reason) near (x,y)`。Step 6 的 `/died\s*\(/` 正则与该
  格式匹配；若 Round-0 修改过格式需回头确认。
- **可能影响的现有测试**：
  - `test/hud-resource-rate.test.js`（Round-0 新建的 rate 测试）—— Step 5
    只**追加** breakdown 字段，不改既有 rate 逻辑，应不破坏。
  - `test/toast-title-sync.test.js` —— 无关。
  - `test/mortality-system.test.js` —— 无 UI 断言，不受影响。
  - `test/entity-focus-panel.test.js` (若存在) —— 未改 EntityFocusPanel.js
    本体，应不受影响。

## 6. 验证方式

- **新增测试**：
  - `test/entity-pick-screen-fallback.test.js` 覆盖 24px fallback（命中 /
    边界 / 屏幕外三分支）。
  - `test/hud-latest-death-surface.test.js` 覆盖 objectiveLog → latestDeathVal
    的字符串搬运。
- **回归测试**：`node --test test/*.test.js` 跑全量，865 pass / 2 skip
  维持不变（新增 2 个测试 → 867/2）。
- **手动验证（Playwright）**：
  1. `npx vite` → `http://localhost:5173` → Start Colony。
  2. 暂停游戏，滚轮缩放到任意级别，**点击任何白色小球附近 20px 内**的
     位置 → 右侧 Entity Focus 面板必须显示 worker 的 displayName + role +
     hunger label。
  3. 游戏跑 2-3 分钟产生自然死亡（或 Ctrl+Shift+D 开 dev，手动调
     hunger）→ 顶栏 HUD 出现一行 `Last: [t] WorkerName died (starvation)
     near (x,y)`。
  4. Food 数字旁边的速率徽标应变成 `Food ▼ -149.6/min (prod +50 / cons
     -180 / spoil -20)` 形态；若 breakdown 为空字符串则 revisit Step 5
     的风险条。
- **benchmark 回归**：`scripts/long-horizon-bench.mjs` seed 42 /
  temperate_plains，DevIndex 当前 ≈ 44；本 plan 只加渲染层字符串渲染与
  pick fallback，**DevIndex 不得低于 42**（允许 -5% 容差）。若 DevIndex
  明显下降，怀疑屏幕投影循环每帧跑太多次——需要加 `if (entityById.size >
  500) skip fallback`。

## 7. UNREPRODUCIBLE 标记

不适用。所有病因通过静态审计定位，证据链：

- Entity Focus 失灵：`SceneRenderer.js:984` `SphereGeometry(0.34, 14, 14)`
  + `SceneRenderer.js:1874-1897` 无 tolerance 的 `raycaster.intersectObject`
  + `SceneRenderer.js:1944-1948` miss 后直接走 tile 分支且清空
  `selectedEntityId = null`。不复现的原因是 reviewer 没点中 8-12px 的命中圆，
  与描述"5 次全部失败"一致。
- 死因无快捷面板：`MortalitySystem.js:205-217` 已写 objectiveLog，
  `EventPanel.js:60-82` 只在展开的 Events 面板里显示。HUD 顶栏的 deathVal
  （`HUDController.js:299-346`）只有聚合计数，无最近一条。reviewer 报"deaths
  从 0 跳到 -200 但没有 log"其实是因为 log 埋在合集面板里没看到。
- 食物拆解缺失：`HUDController.js:181-226` 只计算 `net = (snap - prev) * 60`，
  未读 production/consumption/spoilage 分量；reviewer 明确引用的 "-149.6/min"
  正好来自这里。

Playwright 浏览器会话在本 plan 撰写中未启动（时间预算 ≥ 75% 给了静态
审计 + plan 撰写；pick-radius 代码证据已足够）。
