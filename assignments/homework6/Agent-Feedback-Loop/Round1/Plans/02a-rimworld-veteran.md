---
reviewer_id: 02a-rimworld-veteran
feedback_source: Round1/Feedbacks/02a-rimworld-veteran.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~180
  new_tests: 2
  wall_clock: 55
conflicts_with: []
---

## 1. 核心问题

1. **玩家没有能动性 / fallback planner 把殖民地玩死** — 三个 session 里 COOK / HAUL 两个角色稳定为 0，`RoleAssignmentSystem` 把这些 slot 硬编码成 "只有当对应建筑存在时分配 1 个"，而 fallback ColonyPlanner 又不会建 Kitchen（除非 `farms>=2 && food>=5 && wood>=8 && stone>=3`，Temperate Plains 开局 stone=5 满足不了 workerCount≥2 + 仓库场景），于是殖民地陷入 "无厨房 → 无 cook 槽位 → 生食浪费 → 无 stone → 永无厨房" 的结构锁死。RimWorld 老兵的 Top-1 诉求（work priority tab）本质是 **暴露已存在的决策 knob**：`cookSlots/smithSlots/herbalistSlots/haulSlots/stoneSlots/herbsSlots` 这些槽位。
2. **4x 速度 = 灾难放大器** — 开局饥荒 120 秒形成，玩家还在学 UI 就死光。没有任何 "危机自动降速" 兜底。
3. **模板切换 UI 反馈延迟** — 下拉切 Archipelago 后预览不变，必须再点 "New Map"；这是 UX polish 范畴的小 bug。

> 我归并 1 + 2 + 3 为一条主线：**玩家在场但没有能动性**。单一 plan 无法全部根治，我选 P0 问题 1 做主推（RimWorld 老兵最想要），问题 2/3 留到后续 round。

## 2. Suggestions（可行方向）

### 方向 A: 暴露 Role Quota Sliders（work-priority-lite）
- 思路：把 `RoleAssignmentSystem` 内部硬编码的 `cookSlots=1 / smithSlots=1 / herbalistSlots=1 / haulSlots=1 / stoneSlots=1 / herbsSlots=1` 改成从 `state.controls.roleQuotas` 读取。UI 在 Management panel 新增 6 个 range input（min 0 / max 8），允许玩家**手动**把 3 个工人从 FARM 拉到 HAUL，哪怕当前没有 kitchen，也能 pre-allocate 1 名 cook 预备役等建筑就位。gating 条件（需要 kitchen 才允许 cook）保留，但 max slots 由玩家控制。
- 涉及文件：`src/simulation/population/RoleAssignmentSystem.js`（读取 quotas）、`src/ui/tools/BuildToolbar.js`（wire sliders）、`index.html`（6 个 range DOM）、`src/app/types.js`（补 `roleQuotas` 字段）、可选 `src/app/GameApp.js`（snapshot persistence）
- scope：中
- 预期收益：**直接回应 reviewer Top-3 诉求**（work priority UI）；让玩家可以把 fallback planner 的 "0 cooks / 0 haul" 结构缺陷手动覆盖；与 v0.8.1 Phase 9 "carry/deposit policy" 正交，不互相踩脚。
- 主要风险：若玩家把 quota 全部拉到 HAUL/COOK，会饿死；需要保留 farmMin=2 / woodMin=1 的 hard floor（已存在，good）。

### 方向 B: 自动危机降速 Toggle（Crisis Auto-Slow）
- 思路：HUD 新增 "Auto-slow on crisis" 开关（默认 on）。`simStepper.js` 在 `food rate < -1.0/min && food < foodEmergencyThreshold(18)` 时把 `timeScale` 钳到 ≤1.0 并弹一次 action chip。复用已有的 `BALANCE.foodEmergencyThreshold=18` 常量。
- 涉及文件：`src/app/simStepper.js`、`src/ui/hud/HUDController.js`、`index.html`
- scope：小
- 预期收益：解决槽点 1（"4x 倍速 = 灾难倍速"）。
- 主要风险：可能干扰 `long-horizon-bench.mjs` 的确定性（benchmark 不走 HUD，但 simStepper 是共用路径）；要 gate 在 `state.session.phase === 'active'` 后 + 提供 benchmark-mode opt-out，否则破坏 Phase-10 determinism 硬约束。

### 方向 C: 模板预览即时刷新（小修 UX）
- 思路：`mapTemplateSelect.change` handler 里补一次 `handlers.onRegenerateMap(...)` 调用。
- 涉及文件：`src/ui/tools/BuildToolbar.js`
- scope：小
- 预期收益：一条槽点修复。
- 主要风险：pregame 页面的 preview pipeline 可能对频繁 regenerate 不友好（每次切下拉都重跑 generator）。低危但不如 A 高价值。

## 3. 选定方案

选 **方向 A（Role Quota Sliders）**。理由：

- 直接对应 reviewer Top-3 "Work priority UI" 诉求，也间接缓解 Top-1 "修 fallback planner 对 Kitchen 和 Haul role 的盲区"（玩家可以手动补）。
- **严格遵守 freeze 约束**：不新增 mechanic，只把已经存在于 `RoleAssignmentSystem` 内部的决策 knob（cookSlots, smithSlots, haulSlots 等）暴露到 UI。gating 规则（需要建筑存在才生效）保留。
- 不会破坏现有测试：`role-assignment-system.test.js` 如果存在（下面验证列表会看），用默认 quotas 仍然等价于今天的硬编码 1。
- P1 复杂度，55 分钟预算内可落地。

## 4. Plan 步骤

- [ ] Step 1: `src/app/types.js:~345` — edit — 在 `@typedef` controls 对象补一字段
  `roleQuotas: { cook: number, smith: number, herbalist: number, haul: number, stone: number, herbs: number }`；紧贴 `farmRatio` 之后写，复用同一类型注释段。
- [ ] Step 2: `src/entities/EntityFactory.js:~773` — edit — 在 `controls` 初始化块（`farmRatio: 0.5` 所在对象）追加
  `roleQuotas: { cook: 1, smith: 1, herbalist: 1, haul: 1, stone: 1, herbs: 1 }`（与当前硬编码默认 1 保持等价）。
- [ ] Step 3: `src/simulation/population/RoleAssignmentSystem.js:~56` — edit — 替换 6 行硬编码 `cookSlots = (kitchenCount > 0 && specialistBudget > 0) ? 1 : 0` 等为从 `state.controls.roleQuotas` 读取：
  `const quotas = state.controls?.roleQuotas ?? { cook:1, smith:1, herbalist:1, haul:1, stone:1, herbs:1 };`
  然后
  `const cookSlots = Math.min(quotas.cook|0, (kitchenCount > 0 ? quotas.cook|0 : 0), specialistBudget);`（同构处理 smith/herbalist/haul/stone/herbs）。保留 gating 条件（建筑不存在 → slot 0）与 `haulSlots` 的 `n >= 10 && warehouseCount >= 1` 硬门槛。
  - depends_on: Step 2
- [ ] Step 4: `index.html:~1067` — edit — 在 `#farmRatio` 后插入一个 `<details class="subpanel">Role Quotas</details>`，内含 6 行 `<div class="small muted">Cook: <span id="roleQuotaCookLabel">1</span></div><input id="roleQuotaCook" type="range" min="0" max="8" step="1" value="1" />`（对 smith / herbalist / haul / stone / herbs 同样五段，ids: `roleQuotaSmith`, `roleQuotaHerbalist`, `roleQuotaHaul`, `roleQuotaStone`, `roleQuotaHerbs`）。
- [ ] Step 5: `src/ui/tools/BuildToolbar.js:~37-45` — edit — 在 constructor 的 DOM grab 块里补 6 组 ref（`this.roleQuotaCook = document.getElementById("roleQuotaCook"); this.roleQuotaCookLabel = ...;` 重复 6 次）。
  - depends_on: Step 4
- [ ] Step 6: `src/ui/tools/BuildToolbar.js:#setupManagementControls` — edit — 新增一段 `#setupRoleQuotaControls()` 私有方法（紧跟 `#setupPopulationControls`），绑定 6 个 range 的 `input` 事件：
  ```js
  this.roleQuotaCook?.addEventListener("input", () => {
    const v = Math.max(0, Math.min(8, Math.round(Number(this.roleQuotaCook.value) || 0)));
    this.state.controls.roleQuotas = this.state.controls.roleQuotas ?? {};
    this.state.controls.roleQuotas.cook = v;
    this.sync();
  });
  ```
  对 smith / herbalist / haul / stone / herbs 同样 5 段。然后在 `#setupManagementControls` 末尾调用 `this.#setupRoleQuotaControls();`。
  - depends_on: Step 5
- [ ] Step 7: `src/ui/tools/BuildToolbar.js:sync()` — edit — 在 `sync()` 尾部补 6 行 `#setFieldValueIfIdle` 同步 DOM 值和 label 文本（参考 `farmRatio`/`farmRatioLabel` 的 pattern）。
  - depends_on: Step 6
- [ ] Step 8: `test/role-assignment-system.test.js`（new OR append if exists） — add — 写两个 test case：(a) 当 `state.controls.roleQuotas.haul = 3` 且 `n=12, warehouseCount=2` 时，`haulSlots` 应为 3；(b) 当 `quotas.cook = 5` 但 `kitchenCount = 0` 时，`cookSlots` 仍为 0（gating 仍生效）。
  - depends_on: Step 3

## 5. Risks

- **风险 1 — quota 过大 starve workforce**：玩家把 haul=8 会吃掉本该给 FARM 的 workers。缓解：Step 3 已保留 `farmMin=2, woodMin=1` floor；且 `specialistBudget` 在 Step 3 仍是 `Math.max(0, n - reserved)` 的 hard cap。不会跑出总人数。
- **风险 2 — snapshot/load 破坏**：`saveSnapshot` / `loadSnapshot` 序列化 `state.controls`。Step 2 在 EntityFactory 给默认值，load 旧 slot 时 controls.roleQuotas 是 undefined → Step 3 的 `?? { cook:1,... }` 兜底等价旧行为。
- **风险 3 — 破坏现有测试**：可能影响 `test/role-assignment-system.test.js`、`test/balance-playability.test.js`、`test/long-horizon-bench-iteration.test.js`（若有）。默认 quota = 1 保持与当前行为等价；预期零回归。
- **风险 4 — Doctrine bias 叠加**：Doctrine 通过 `state.gameplay.modifiers.farmBias` 调整 FARM 比例，与 quota 无关，互不影响。
- **可能影响的现有测试**：`test/role-assignment-system.test.js`（若存在）、`test/balance-playability.test.js`、`test/colony-planner.test.js`、`test/fallback-environment.test.js`。

## 6. 验证方式

- **新增测试**：`test/role-assignment-quotas.test.js` 覆盖：
  - default quotas (all=1) 与 pre-change 行为 byte-equivalent（回归护栏）
  - `quotas.haul = 3, n = 12, warehouseCount = 2` → `workers.filter(r=>r==="HAUL").length === 3`
  - `quotas.cook = 5, kitchenCount = 0` → 仍然 0 cook（gating 胜出）
  - `quotas.cook = 4, kitchenCount = 1, specialistBudget = 2` → 2 cooks（budget cap 胜出）
- **手动验证**：
  1. `npx vite` 打开 `http://localhost:5173`，Start Colony（Temperate Plains）
  2. 在 Management panel 展开 Role Quotas 折叠块，把 Haul 拉到 3
  3. 建一座 Kitchen（手动）+ 确认 stone ≥ 3
  4. 观察 Population 面板：`haulers: 3`（上一版永远是 0）
  5. 验收：`cooks` 会在 Kitchen 建好后变 1；把 quota.cook 拉到 3，观察值为 min(3, specialistBudget)
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains`；默认 quotas 与当前行为等价，DevIndex 不得低于 **42**（当前 44 - 5% ≈ 42），deaths365 不得高于当前 +5%。
- **full test run**：`node --test test/*.test.js`；期望 867 ±0 通过（允许新测试 2 个 +2）。

## 7. UNREPRODUCIBLE 标记

无。feedback 中的三条核心事实（0 cooks / 0 haulers 三个 session 均出现、4x 导致 120 秒饥荒、模板切换后 preview 不更新）均可从代码直接复现：
- `RoleAssignmentSystem.js:56-69` 硬编码 `cookSlots = (kitchenCount > 0 && specialistBudget > 0) ? 1 : 0` ↔ 若 kitchen 永远不被建，cook 永远 0（已验证）
- `ColonyPlanner.js:586-598` 的 kitchen trigger 条件（`farms >= 2 && food >= 5 && wood >= 8 && stone >= 3`）在开局 stone=5 + 食物断崖并存时很难同时满足（已验证）
- `BuildToolbar.js:157-164` 的 `mapTemplateSelect.change` handler 没有调用 `handlers.onRegenerateMap`，只更新 state.controls，于是 3D preview 不刷新（已验证）

Playwright 复现不必要，因为这是**代码事实**层面的 bug，不是时序 UI 问题。
