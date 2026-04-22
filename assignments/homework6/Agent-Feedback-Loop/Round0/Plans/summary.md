---
round: 0
stage: B
date: 2026-04-22
build_commit: a8dd845
enhancer_count: 10
total_files_touched: ~51 (with dedup ~18 unique)
total_loc_delta: ~2440
total_new_tests: 18
total_wall_clock_min: ~790
convergence_target: Round 3 (based on P0 count reducing to ≤ 2)
---

# Round 0 · Stage B — Plans Summary

本文档是 orchestrator 对 10 份独立 enhancer plan 的聚合结果。按 **priority × scope**
排序，并标注跨 plan 的 **REDUNDANT / CONFLICT / SEQUENCE** 关系。Coder（Stage C）
应按此顺序依次执行。

---

## 1. Priority 表

| Rank | Plan | Priority | Files | LOC | Tests | Wall | 核心主旨 |
|---:|---|:---:|---:|---:|---:|---:|---|
| 1 | [01c-ui](01c-ui.md) | P0 | 3 | ~260 | 2 | 75 | Dev-mode gate + 响应式修复 + Heat Lens 信道分离 |
| 2 | [01d-mechanics-content](01d-mechanics-content.md) | P0 | 5 | ~220 | 2 | 90 | `loading…` 竞态 + toast 截断 + HUD 速率显示 |
| 3 | [01b-playability](01b-playability.md) | P0 | 5 | ~220 | 2 | 90 | 建造点击反馈（飘字 toast + hover 拒绝原因 + 菜单期计时器守卫） |
| 4 | [02b-casual](02b-casual.md) | P0 | 6 | ~260 | 2 | 90 | Casual profile（隐藏 dev 面板、canvas 预览、节点可视差） |
| 5 | [01a-onboarding](01a-onboarding.md) | P0 | 5 | ~420 | 2 | 90 | 教程入口 + `data-tooltip` 替代原生 title + 结束面板 gate |
| 6 | [02a-rimworld-veteran](02a-rimworld-veteran.md) | P1 | 4 | ~120 | 1 | 60 | `state.events.log` 管道对接 DeveloperPanel |
| 7 | [02e-indie-critic](02e-indie-critic.md) | P1 | 6 | ~140 | 1 | 55 | 术语对齐（"Heat" vs "Pressure"）+ scenario headline 常驻 statusBar |
| 8 | [02c-speedrunner](02c-speedrunner.md) | P1 | 5 | ~180 | 2 | 55 | HUD scoreboard ribbon + FF clamp 3→4 |
| 9 | [01e-innovation](01e-innovation.md) | P1 | 6 | ~260 | 2 | 95 | 工人姓名池 + storyteller strip + Policy Focus 升为一等面板 |
| 10 | [02d-roleplayer](02d-roleplayer.md) | P1 | 6 | ~260 | 2 | 90 | Worker/Visitor 命名 + death → objectiveLog + EventPanel 扩充 |

**P0 计数：5**　**P1 计数：5**　**P2 计数：0**（下轮终止阈值 P0 ≤ 2）

---

## 2. 重叠与冲突矩阵

### REDUNDANT（≥2 plan 提出同一方案，orchestrator 需要合并）

#### R1. 工人命名池（01e × 02a × 02d）
- **共同目标**：把 `displayName = "Worker-122"` 替换为具人情味的姓名。
- **方案差异**：
  - 01e：`WORKER_NAME_BANK` 常量 + seeded pick，EntityFactory.js:32-35。
  - 02a：同样的 seeded pool，位于 Suggestion B（**未选中**，只做 Suggestion A 事件日志）。
  - 02d：`pickWorkerName/pickVisitorName` 确定性池，Step 1。
- **仲裁**：**采纳 01e 的 WORKER_NAME_BANK + 02d 的 pickWorker/pickVisitor 拆分**。
  02a 的 Suggestion B 已被 enhancer 自己标记未选中，不需要再动。
- **执行顺序**：先落 01e Step 1，再让 02d Step 1-3 增量扩到 Visitor 与 death 联动。

#### R2. Dev-mode gate（01a × 01c × 02b）
- **共同目标**：把 Settings / Debug / Dev Telemetry 从默认可见变成需要 URL 参数 /
  localStorage 开启。
- **方案差异**：
  - 01c：`#initDevModeGate()` 添加到 GameApp.js，入口在 `#panelToggles`。
  - 01a：主菜单 Help/Tutorial 按钮 + 结束面板 gate（**只碰菜单层，不碰 dev dock**）。
  - 02b：URL/localStorage 双开关 casual profile，扩到 BuildToolbar 的 cost 缩写。
- **仲裁**：**以 01c 的 `#initDevModeGate()` 为唯一真源**。02b 的 profile 开关通过
  相同 gate 旗标触发额外的 UI 差异（cost 展开、节点视觉）。01a 的菜单层改动与
  dev-gate 正交，独立合并。
- **执行顺序**：01c（gate 基础设施）→ 02b（基于 gate 做 profile 差异）→ 01a
  （菜单层文案 + Help 按钮）。

#### R3. EntityFocusPanel.render 多次改动（01a × 01e × 02b × 02d）
- **共同目标**：把 FSM dump 隐藏，换成玩家友好视图。
- **方案差异**：
  - 01a：整个 FSM block (309-345) 移到 dev-mode-only `<details>`。
  - 01e：Policy Focus / Policy Summary / Policy Notes **升级为默认可见**的
    "AI 表达"信道。
  - 02b：casual profile 下整个 debug 区隐藏；展示 "Needs / Task"。
  - 02d：在面板顶部加 "Character" block（traits / mood / relationships / memory）。
- **仲裁**：此文件会被 4 次编辑，必须**串行合并**。`EntityFocusPanel.render()` 的
  最终结构：
  ```
  [Character header]    ← 02d
  [Needs/Task summary]  ← 02b（casual profile）
  [AI Policy Focus]     ← 01e（原 debug 区升级）
  [FSM + path + weights]← 01a（dev-mode gate 折叠）
  ```
- **执行顺序**：02d → 02b → 01e → 01a（从顶到底）。每步后跑一次
  `test/entity-focus-panel.test.js`（若不存在需新建）。

#### R4. `index.html:1161-1181` 6 个 `loading…` 占位（01d × 02e）
- **共同目标**：去掉首次展开时的 `loading…` 视觉崩坏。
- **方案差异**：
  - 01d：改占位文本为更友好的 `awaiting tick…` 并把 `DeveloperPanel.render`
    从 dock-collapsed skip 中解耦。
  - 02e：同一处改为 `—` 或空字符串，作为 voice 污染清理的一部分。
- **仲裁**：采纳 01d 方案（从渲染管道根治），02e Step 可以仅保留文案选择。
- **执行顺序**：01d 优先。

### CONFLICT（真正互斥的设计决策）

#### C1. Heat Lens 命名（01c × 02e）
- **01c**：保留 "Heat Lens" 名称，扩展为 priority channel 并加图例。
- **02e**：把 toast 文本从 "Pressure lens hidden" 改为 "Heat Lens hidden" 以与
  按钮对齐。
- **冲突点**：02e 的修改 **前提是保留 "Heat Lens" 命名**，与 01c 兼容。
- **仲裁**：两者合并为同一条修改（改 `GameApp.js:1369-1370` 的 toast 文本 +
  `SceneRenderer.js:2023 toggleHeatLens()` 的 console 文案）。**不是真冲突**，
  只是时间顺序问题。先 01c 后 02e。

#### C2. FF timeScale 上限（02c 提议 clamp 3→4）
- 与 **v0.8.1 Phase 10 long-horizon determinism hardening** 潜在冲突：如果拉到
  x8 会触发 accumulator 0.5s 上限进入 spiral-of-death。
- **仲裁**：采纳 02c 的 x4（保守），**拒绝任何 x8 扩展**。benchmark 回归阈值
  `long-horizon-bench.mjs` seed=42 / temperate_plains / DevIndex ≥ 41.8 作为
  验收 gate（见 CLAUDE.md v0.8.1 基线 44 的 -5%）。

#### C3. `index.html:#panelToggles` 区域（01a × 01c × 02b）
- 三个 plan 都要向此 DOM 片段添加按钮或修改按钮可见性。
- **仲裁**：由 01c 主理（`#initDevModeGate()` 统一管理 + 响应式 wrap），
  01a 仅追加 `#helpBtn` 按钮 + 快捷键 `?`，02b 通过 gate 旗标条件隐藏。
- **测试负担**：`test/ui-layout.test.js` 的 id 白名单需要同时加 `#helpBtn` +
  `#scoreboardRibbon`（02c 引入），一次性合并以避免多次改测试。

### SEQUENCE-ONLY（不互斥但需确定顺序）

#### S1. HUDController.render 管道多次扩展（01b × 01c × 01d × 02c）
四个 plan 都扩展 `HUDController.render`：
- 01b：新增 action channel 优先级（error/warning/info）。
- 01c：priority channel 也覆盖 Heat Lens toggle。
- 01d：新增 `resourceRate` 行。
- 02c：新增 scoreboard ribbon 行 + FF 标签。

**执行顺序**：01b（建立 priority channel 骨架）→ 01c（复用它）→ 01d（新字段）
→ 02c（新字段）。每个 step 后跑 `test/hud-controller.test.js`。

#### S2. BuildToolbar.sync / tooltip 文案（01a × 01b × 02b × 02e）
- 01a：`data-tooltip` 替代原生 title（基础设施）。
- 01b：建造失败 reason 写入 tooltip 与 canvas 飘字。
- 02b：cost 缩写展开（"5w" → "5 Wood"）。
- 02e：移除 `Base W / Stress W / Total W / Entities` 等内部变量命名。

**执行顺序**：01a（tooltip 机制）→ 01b（写 reason）→ 02b（cost 展开）→
02e（voice 清理）。

---

## 3. 跨 plan 聚合指标

| 指标 | 值 |
|---|---:|
| P0 plan 数 | 5 |
| P1 plan 数 | 5 |
| 涉及文件数（去重估） | ~18 |
| 新增代码行估 | ~2440 |
| 新增测试文件 | 18 |
| Coder 串行执行估时 | ~13 小时 |
| Coder 并行（4 worker）估时 | ~4 小时 |
| Benchmark 回归基线 | DevIndex ≥ 41.8（当前 44，-5% 容差） |

---

## 4. 推荐执行顺序（Coder Stage C 消费）

### Wave 1（P0，基础设施优先）
1. **01c-ui** — Dev-mode gate 基础设施 + 响应式 statusBar + Heat Lens priority channel。
2. **01d-mechanics-content** — `loading…` 竞态修复 + toast 截断 + HUD rate display。
3. **01b-playability** — 建造点击反馈层（依赖 01c 的 priority channel）。

### Wave 2（P0，用户体验层）
4. **02b-casual** — Casual profile（依赖 01c gate 基础设施）。
5. **01a-onboarding** — 教程入口 + `data-tooltip` + 结束面板 gate（依赖 01c、02b）。

### Wave 3（P1，内容暴露层）
6. **02a-rimworld-veteran** — `state.events.log` 对接 DeveloperPanel（独立）。
7. **02e-indie-critic** — Voice 清理 + scenario headline 常驻（依赖 01a 的 tooltip）。
8. **02c-speedrunner** — Scoreboard ribbon + FF x4（依赖 01d 的 HUDController 扩展）。

### Wave 4（P1，叙事层）
9. **01e-innovation** — Worker 姓名 + storyteller strip + Policy Focus 升级。
10. **02d-roleplayer** — Visitor 命名 + death → objectiveLog + EventPanel 扩充（依赖 01e）。

---

## 5. Human gate 检查清单（Stage B → Stage C 过渡）

- [ ] 人工检视 P0 plan 的 5 份（01c / 01d / 01b / 02b / 01a）
- [ ] 确认 R3（EntityFocusPanel 四改）的合并顺序与测试覆盖
- [ ] 确认 C2（FF clamp）不违反 Phase 10 determinism 约束
- [ ] Coder 拿到 summary.md + 10 份 plan 原件后可自行选 Wave 内并行度
- [ ] Validator 在 Wave 结束时跑 `long-horizon-bench.mjs` 验 DevIndex 基线

---

## 6. 风险与未覆盖项

- **Playwright 复现率低**：10 份 plan 中有 6 份在 §7 标记 UNREPRODUCIBLE 或跳过
  Playwright（时间预算分配问题）。Round 1 的 enhancer prompt 应增加硬约束：
  "每个 plan 至少必须有 1 个 Playwright 截图或 selector 证据"。
- **feature freeze 边界**：10 份 plan 全部声称遵守 HW06 freeze（无新 mechanic），
  只做 polish/fix/UX/perf。orchestrator 复检通过。
- **P2 分类缺席**：当前全部 plan 被 enhancer 判 P0/P1。Round 1 需引入"次轮候选"
  分类防止所有修复都挤进首轮。
- **测试债**：18 个新测试文件，可能与现有 865 测试的 snapshot 产生冲突。Coder
  执行时需运行 `node --test test/*.test.js` 全量 regression。
