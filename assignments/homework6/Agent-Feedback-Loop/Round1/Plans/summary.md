---
round: 1
date: 2026-04-22
plans: 10
total_files_touched: ~28
avg_loc_delta: ~149
---

# Stage B — Round 1 Aggregation & Arbitration

本文件由 Stage B Aggregator 整合 10 份 enhancer plan 的 frontmatter + "选定方案"/"Plan 步骤"章节生成。Implementer 应按 §3 的 Wave 顺序逐个落地；受 §4/§5 决议影响的 plan 在执行前必须对照本文件调整具体步骤；§6 列出建议跳过的 plan。

---

## 1. Priority Table

| id | priority | files_touched | loc_delta | new_tests | wall_clock | one-line-scope |
|---|---|---|---|---|---|---|
| 01a-onboarding | P1 | 4 | ~180 | 1 | 35 | HUD glossary tooltips (`title=`) 覆盖 Dev/wh/routes/HAUL 等 10+ 缩写 |
| 01b-playability | P0 | 3 | ~120 | 1 | 25 | `#pickEntity` 屏幕空间 fallback(16px)+build-tool 24px guard，修 Entity Focus 永失败 |
| 01c-ui | P0 | 3 | ~90 | 1 | 25 | `#statusScoreBreak` 加 `dev-only` class + ≤1024px 响应式侧栏 auto-collapse |
| 01d-mechanics-content | P0 | 5 | ~180 | 2 | 60 | `#pickEntity` 屏幕空间 24px fallback + HUD 加 latestDeathRow / foodRateBreakdown |
| 01e-innovation | P1 | 6 | ~260 | 2 | 55 | Storyteller LLM/RULE/IDLE 徽章 + Heat Lens legend + How-to-Play "Why Utopia is different" tab |
| 02a-rimworld-veteran | P0 | 4 | ~180 | 2 | 55 | Management panel 暴露 6 个 role quota sliders（cook/smith/herbalist/haul/stone/herbs） |
| 02b-casual | P0 | 3 | ~120 | 1 | 25 | 3 条 HUD chip 拆 nowrap 支持 2 行 + `getScenarioProgressCompactCasual` 人话版 |
| 02c-speedrunner | P1 | 2 | ~70 | 1 | 25 | `__utopiaLongRun` shim：`placeToolAt` 支持 options-bag + `regenerate` 接受 `template` 别名 |
| 02d-roleplayer | P1 | 3 | ~110 | 1 | 45 | Storyteller strip 追加最新 eventTrace salient beat（SABOTAGE/DEATH/VISITOR…）+ 2.5s dwell |
| 02e-indie-critic | P1 | 6 | ~180 | 2 | 55 | 6 模板专属 scenario voice + storyteller 前缀人话化 + Emergency relief 叙事化 + `.hud-action` max-width 放宽 |

**Totals**: files ≈ 28 unique (after dedup), loc_delta ≈ 1,490, new_tests = 14, wall_clock sum = 405 min.

---

## 2. 冲突矩阵

### REDUNDANT（两份 plan 目标同一问题 / 同一文件同一意图）

| R# | plans | 共同目标 | 判定依据 |
|---|---|---|---|
| R1 | **01b-playability** + **01d-mechanics-content** | `SceneRenderer.#pickEntity` 屏幕空间 fallback（解决工人 8-12px hitbox 点不中） | 两份 plan 都在 `#pickEntity` 函数末尾追加 `project()→像素距离` 的 fallback 分支；01b 阈值 16px、01d 阈值 24px；逻辑完全同构 |
| R2 | **01c-ui**（Step 1）+ **01b-playability**（§1 问题 3 反响） | `#statusScoreBreak` 对 casual 玩家不可见 | 01b 只在核心问题段提及，未在选定方案中动手；01c Step 1 明确 `dev-only` class + Step 3 JS 双保险。01b 已显式 punt → 无实际冲突，但归类提示 |
| R3 | **02b-casual**（Step 5 `getScenarioProgressCompactCasual`）+ **02e-indie-critic**（Step 4 重写 `getScenarioProgressCompact`） | `WorldExplain.getScenarioProgressCompact` 的"wh 5/2 · farms 4/4"开发者味道 | 02b 新增旁路 Casual 版本并在 HUD 分支调用；02e 直接改写原函数为"West route open · Logistics on plan"叙事版。二者都修同一 pain point；存在语义重叠（见 §5 CONFLICT C1） |

### CONFLICT（plan 互相 undo / 同一 DOM / 同一字符串字面值）

| C# | plans | 冲突点 | 具体位置 |
|---|---|---|---|
| C1 | **02b-casual** vs **02e-indie-critic** | `WorldExplain.js` `getScenarioProgressCompact` 字面值 | 02b 保留原函数返回 `wh 5/2 · farms 4/4`（作为 regression guard）并新加 Casual 分支；02e 直接重写原函数为 label-first。两者同函数作用域互相 undo |
| C2 | **01e-innovation** vs **02e-indie-critic** | `storytellerStrip.js` 的前缀语义 | 01e 保留 `LLM/RULE/IDLE` 作为彩色徽章文案（把技术术语视作 feature）；02e 明确要求**去掉** `LLM Storyteller`/`Rule-based Storyteller` 等 dev term，改成"The colony is thinking"/"Your storyteller whispers"。两者对 `source → 前缀` 的语气诉求完全相反 |
| C3 | **01e-innovation** vs **02d-roleplayer** | `storytellerStrip.js` `computeStorytellerStripText` 函数返回结构 | 01e 新增 `computeStorytellerStripModel(state)` 并让 HUDController 改用它组装 DOM（3 个 span）；02d 仍走旧的 `textContent = computeStorytellerStripText(state) + " · Last: …"` 单字符串路径。若两份都落地，02d 追加的 "· Last:" 必须分流到 `#storytellerSummary` 子节点而非整条 textContent |
| C4 | **02b-casual**（Step 1-3 `.hud-objective/.hud-scenario/.hud-action`）vs **02e-indie-critic**（Step 6 `.hud-action` max-width） | `index.html` 行 91/99/103-105 CSS | 02b 把 `.hud-action` 改成 `-webkit-line-clamp:2; max-width:520px`；02e 把 `.hud-action` 改成 `min-width:260px; max-width:min(560px,45vw)` 并保留 `white-space:nowrap`。两者同一 selector 互相覆盖 |
| C5 | **01c-ui**（Step 2 `@media (max-width:1200px)` collapse）vs **02b-casual**（Step 2 `.hud-scenario` clamp 高度） | `index.html` 顶栏响应式堆叠 | 01c 让侧栏在 ≤1200px 默认 translateX 收合；02b 让 statusBar 最多 2 行（高度 ~44px）。若 01c 先落地，02b 的 2 行 clamp 可能在 1200px 断点内和 collapse 交互导致 chip 溢出；需按顺序验证 |
| C6 | **01d-mechanics-content** vs **02e-indie-critic** | `src/simulation/meta/ProgressionSystem.js:245` Emergency relief 文案 | 01d 不碰该文案；02e 改为叙事版。非冲突（01d 未触），列入矩阵仅作提醒：02c 的 shim 测试不会触发该路径 |

### SEQUENCE（必须在 X 之前）

| S# | 前置 plan | 后置 plan | 原因 |
|---|---|---|---|
| S1 | **01c-ui**（Step 1 给 `#statusScoreBreak` 加 `dev-only`）| **任何触碰 HUD 顶栏布局的 plan** | 01c 在 casual profile 下隐藏 scoreBreak 后，顶栏宽度预算变化；02b 的 `max-width:520px` / 02e 的 `max-width:min(560px,45vw)` 在隐藏 scoreBreak 后才不会撑爆 flex |
| S2 | **01b OR 01d**（Entity pick fallback，二选一）| **02d-roleplayer**（Narrative Ticker）| Narrative Ticker 的效果需要玩家能点选工人对照查看；pick 修好后才便于手测验收 02d |
| S3 | **01e-innovation**（storyteller 结构化 DOM）| **02d-roleplayer**（追加 eventTrace beat）| 若 01e 先落地，02d 的 "· Last:" 片段必须以新的 `#storytellerSummary` 子节点为写入目标；反之 02d 先落地，01e 需要吸收 02d 的 beat 逻辑进 `computeStorytellerStripModel` |
| S4 | **01a-onboarding**（glossary 模块）| **02a-rimworld-veteran**（role quota sliders）| 01a 的 `explainTerm("haul"/"cook"/…)` 已为 quota sliders 的 role label 预备了悬停文案；02a 新增 slider DOM 时可复用 `title=explainTerm(…)` 避免重复写解释 |
| S5 | **02c-speedrunner**（shim normalize）| 无硬依赖，但**建议尽早**，因为它为后续 benchmark/headless 回归护栏打底 | Wave 1 并行安全；若与 Wave 2 的 UI plan 同时落地不会冲突 |

---

## 3. Wave 执行顺序

**原则**：Wave 内部按 plan_id 字典序给 Implementer；Wave 之间阻塞（下一 Wave 开始前上一 Wave 全绿）。每个 Wave 末尾跑一次 `node --test test/*.test.js` + `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains` 作 regression tripwire（DevIndex ≥ 42）。

### Wave 1 — P0 Bug Fix（互不冲突）

**目标**：修 Entity Focus 永失败、暴露 Role Quota、修外部 API shim。三者不触同一文件。

- **01b-playability** —— `SceneRenderer.#pickEntity` 屏幕空间 fallback + build-tool 24px guard
  - 见 §5 决议 D1：**保留 01b**，01d 的 pick fallback 步骤合并进此处
- **02a-rimworld-veteran** —— Role Quota Sliders（6 个 range）
  - 注：S4 建议 01a 先于 02a，但 01a 不阻塞核心 slider 逻辑，仅影响 tooltip；01a 可并行（见 Wave 2）
- **02c-speedrunner** —— `__utopiaLongRun` placeToolAt / regenerate shim normalization

**Wave 1 完成门槛**：Entity Focus 可点中工人；Management panel 出现 Role Quotas 折叠块；`__utopiaLongRun.placeToolAt({tool,ix,iz})` 返回 `{ok:true,...}`。

### Wave 2 — P0 UX Surface（顶栏 / 响应式 / DOM 新增）

**目标**：修 HUD 顶栏 debug 泄漏 + 响应式 + casual 缩写。依赖 Wave 1 不是硬性，但 Wave 2 内部有 §2 的 CONFLICT 需按决议合并。

- **01c-ui** —— `#statusScoreBreak` 加 `dev-only` + ≤1200px 侧栏 auto-collapse（**先落**，S1 前置）
- **01d-mechanics-content** —— HUD 加 latestDeathRow + foodRateBreakdown（**pick fallback 步骤删除**，已并入 01b；见 D1）
- **02b-casual** —— HUD chip 拆 nowrap + `getScenarioProgressCompactCasual`（**按 C1 决议调整**：保留新函数，不改原函数；见 D2）

**Wave 2 完成门槛**：Casual profile 下顶栏无 `+1/s` 调试串；1024×768 下 Build/Colony 面板默认收合；HUD 顶栏出现 `Last: ... died (...)` 行；警告文案不再被 `...` 截断。

### Wave 3 — P1 Polish（Storyteller / Glossary / Narrative）

**目标**：把 LLM / Heat Lens / eventTrace 三条差异化 hook surface 出来。此 Wave 内 CONFLICT 最密（C2/C3），必须严格按 §5 决议合并。

- **01a-onboarding** —— HUD glossary tooltips（`title=` 元数据，不改 textContent；安全并行）
- **01e-innovation** —— Storyteller badge + Heat Lens legend + How-to-Play tab（**按 C2 决议**：徽章改为 player-facing 词汇，见 D3）
- **02d-roleplayer** —— Storyteller 追加 eventTrace beat（**按 C3 决议**：写入 `#storytellerSummary` 子节点；见 D4）
- **02e-indie-critic** —— 6 模板 scenario voice + Emergency relief 叙事化（**按 C1/C2/C4 决议调整**：放弃 storyteller prefix 改写、放弃 `getScenarioProgressCompact` 改写、`.hud-action` max-width 走 02b 版本；见 D2/D3/D5）

**Wave 3 完成门槛**：Fertile Riverlands 不再显示"Broken Frontier"；storyteller strip 出现 "The colony is thinking / Your storyteller whispers" 前缀 + 当前 LLM/RULE 徽章（颜色）+ eventTrace 最新 salient beat；按 L 后 Heat Lens legend 可见；悬停 HUD 缩写出现 glossary tooltip。

### Wave 4 — 无

所有 10 份 plan 在 Wave 1-3 内消化完毕。无 P2 / nice-to-have 项进入 Wave 4。

（Wave 5 预留给跨 Wave 回归修复，默认为空。）

---

## 4. REDUNDANT 合并决议

### D1 — R1: 01b-playability vs 01d-mechanics-content（`#pickEntity` fallback）

**保留**：**01b-playability** 的 pick fallback 步骤（Step 1-4 + Step 5 测试）。
**跳过**：01d-mechanics-content 的 **Step 1-2 + Step 7**（`#pickEntity` 修改 + `entity-pick-screen-fallback.test.js`）。
**保留 01d 的其余步骤**：Step 3（index.html DOM 新增）、Step 4-6（HUDController latestDeathRow + foodRateBreakdown）、Step 8（`test/hud-latest-death-surface.test.js`）。

**理由**：
- 01b 阈值 16px 更保守，降低密集人群误选风险（§1 Risk 表明 24px 在 >6 workers/tile 场景会误中后排），且 01b 额外提供了 24px guard—即 build-tool 工具下 16px 选中 / 24px 警告的两段式，比 01d 单一 24px 更细腻。
- 01b 抽出 `PICK_FALLBACK_PX` 常量便于后续调参；01d 的实现嵌在函数内部。
- 01b scope 更纯（只 3 文件），测试覆盖 "12px 命中 / 40px 不命中"；01d 的 pick 部分是附带改动，核心价值在 latestDeathRow/foodRateBreakdown。
- **Implementer 执行说明**：Wave 1 处理 01b 的 7 步全部；Wave 2 处理 01d 时跳过 Step 1/2/7，直接从 Step 3（index.html DOM）开始，且 Step 8 的测试改为只覆盖 `hud-latest-death-surface`（不再测 pick fallback，已由 01b 覆盖）。

### D2 — R3 + C1: 02b-casual vs 02e-indie-critic（`WorldExplain.getScenarioProgressCompact`）

**保留**：**02b-casual** 的 Step 5（新增 `getScenarioProgressCompactCasual` 旁路）+ Step 6（HUDController profile 分支）。
**跳过**：02e-indie-critic 的 **Step 4**（重写原 `getScenarioProgressCompact`）。

**理由**：
- 02b 方案不破坏向后兼容（保留旧函数签名作为 regression guard），02b Step 7 明确 lock 了这一点；02e Step 4 会击中任何依赖 `wh 5/2` 字面值的既有测试/脚本（如 `test/world-explain-scoreboard.test.js`）。
- 02b 的 Casual 语气更一致（"3 of 5 supply routes open"），与 02e 的目标（"West route open · Logistics on plan"）语义高度重合；保留 02b 即达到 02e 的 reviewer 诉求。
- **Implementer 执行说明**：Wave 3 处理 02e 时跳过 Step 4；其余步骤照原 plan 执行。

### D3 — C2: 01e-innovation vs 02e-indie-critic（storyteller prefix）

**保留**：**01e-innovation** 的 badge 方案（视觉化徽章），但**按 02e 改写徽章文案**。
**合并方式**：
- 01e 保留 `<span id="storytellerBadge">` DOM 结构 + CSS（data-mode 颜色分支）。
- 徽章文案从 `LLM` / `RULE` / `IDLE` **改为** player-facing 词汇：
  - `mode === "llm"` → `"WHISPER"`（对应 02e "Your storyteller whispers"）
  - `mode === "fallback"` → `"DIRECTOR"`（对应 02e "The colony is thinking"）
  - `mode === "idle"` → `"DRIFT"`（对应 02e "The colony drifts, waiting"）
- `computeStorytellerStripModel` 返回的 `prefix` 字段值相应调整。
- 01e 的 How-to-Play tab 正文明确说明 `WHISPER` = live LLM model / `DIRECTOR` = deterministic fallback / `DRIFT` = idle（把 reviewer 觉得专业的技术背景作为"解谜"放在 tab 里）。

**跳过**：02e-indie-critic 的 **Step 3**（直接改 `computeStorytellerStripText` 前缀字符串）—— 改由 01e 的结构化路径承担。

**理由**：01e 的结构化徽章是更坚实的信息架构（颜色 + 文字），02e 的改字符串方案与 01e 的 DOM 拆分不兼容（C3 冲突）；选择保留 01e 的 DOM 方案，再把 02e 的"去除 Rule-based / LLM dev term"诉求吸收到徽章文案里，兼顾两位 reviewer。

### D4 — C3 + S3: 01e-innovation vs 02d-roleplayer（storyteller 输出结构）

**决议**：01e 先落地（Wave 3），02d 在 01e 的结构化 DOM 上追加 eventTrace beat。

**合并方式**：
- 02d 的 Step 1-2（`extractLatestNarrativeBeat` helper + 拼接到返回字符串）保留，但**改为扩展 `computeStorytellerStripModel`**（01e 新增的结构化函数），在返回对象里追加 `beatText: string | null` 字段。
- 02d 的 Step 4（HUDController dwell 节流）保留，应用在 `beatText` 的写入上（避免 beat 抖动）。
- HUDController 渲染 storyteller strip 时，把 beat 写入 `#storytellerSummary` 子节点末尾（或新建 `#storytellerBeat` 子节点），而非拼到整条 textContent。
- 02d 的 Step 5 测试（3 条 case）改为测试 `computeStorytellerStripModel` 的 `beatText` 字段，而非 `computeStorytellerStripText`。

**理由**：S3 已指出 01e 必须先于 02d；合并后两 plan 在同一结构化路径上协作，无 undo。

### D5 — C4: 02b-casual vs 02e-indie-critic（`.hud-action` CSS）

**保留**：**02b-casual** 的 `.hud-action` 改写（2 行 -webkit-line-clamp + max-width:520px + word-break）。
**跳过**：02e-indie-critic 的 **Step 6**（`.hud-action` 改为 min/max/vw 的单行 nowrap 版本）。

**理由**：
- 02b 的 2 行 clamp 是 reviewer 02b 和 02e 共同诉求的超集——02e 抱怨"Heat lens 文案被截断为 're...'"，02b 的 clamp 方案直接允许 2 行显示完整文案，比 02e 的放宽 max-width（仍 nowrap）更彻底。
- 02b 同步修改了 `.hud-objective` 和 `.hud-scenario`（02e 没动这两个），一次性处理 3 条 chip；02e 只动 `.hud-action` 单条。
- 02b 提供 compact-mode 单行 ellipsis 兜底（Step 4），保留窄屏密集布局。
- **Implementer 执行说明**：Wave 3 处理 02e 时跳过 Step 6；其余步骤照原 plan 执行。

---

## 5. CONFLICT 决议

见 §4 的 D2/D3/D4/D5 —— C1/C2/C3/C4 均已并入 REDUNDANT 合并决议（因为冲突本质即为"两份 plan 追同一 pain point 但手法互斥"）。

### C5 — 01c-ui vs 02b-casual（顶栏响应式堆叠）

**决议**：按 S1 顺序落地（01c 先，02b 后）。
**验收补丁**：02b Step 8 手测必须在 1024×768 / 1200×900 / 1440×900 三个断点下回归检查；若 2 行 clamp 在 1024-1200px 断点内挤出 storytellerStrip，将 `.hud-scenario` 的 `max-width` 从 420px 进一步收到 360px（仅在 01c 新增的 `@media (max-width:1200px)` 块内追加一条覆盖规则）。

### C6 — 01d 与 02e Emergency relief 文案（非实际冲突）

**决议**：无须处理。01d 未触该文案；02e 照原 plan Step 5 执行。

---

## 6. SKIP 列表

**无 plan 被整体跳过。** 所有 10 份 plan 都有保留价值，仅部分步骤按 §4/§5 决议删减：

| plan | 整体动作 | 删减步骤 |
|---|---|---|
| 01d-mechanics-content | 部分保留 | 跳过 Step 1（pickEntity fallback）、Step 2（THREE.Vector3 verify）、Step 7（`entity-pick-screen-fallback.test.js`）—— 已由 01b 承担 |
| 01e-innovation | 部分保留（调整文案） | 徽章文案改为 WHISPER/DIRECTOR/DRIFT（按 D3）；其余照原 plan |
| 02b-casual | 全部保留 | 无 |
| 02d-roleplayer | 部分调整（走 01e 的结构化路径）| Step 1-2 的返回值改为扩展 `computeStorytellerStripModel` 的 `beatText` 字段（按 D4） |
| 02e-indie-critic | 部分保留 | 跳过 Step 3（storyteller prefix，由 D3 承担）、Step 4（`getScenarioProgressCompact` 重写，由 D2 承担）、Step 6（`.hud-action` CSS，由 D5 承担）；保留 Step 1/2（6 模板 scenario voice）、Step 5（Emergency relief 叙事化）、Step 7/8/9（新测试 + Changelog） |
| 其他 5 份 plan（01a/01b/01c/02a/02c）| 全部保留 | 无 |

**未来轮次 defer 列表**（不在本轮 scope，但 reviewer 反复提及）：
- worker carry-vs-deposit eating policy（02c B3，mechanic，freeze）
- AI Thought Stream 浮窗（01e 方向 B，触 simulation state）
- ColonistTicker 独立频道（02e 方向 B，新 UI channel）
- 音效 / 音乐 / 新手 tutorial 动线（02b/02e，新资源管线）
- Entity hover ring + Esc-to-Inspect（02d 方向 B，中等 render 改动）

---

## 7. 给 Implementer 的硬约束提醒

1. **严格照抄每份 plan 的步骤，不 extend scope。** 若本文件 §4/§5 决议要求跳过某 Step，Implementer 在 PR 描述中明确写明"Skipped Step N per summary.md §4 D<x>"；不得自作主张补回。
2. **Freeze: HW06 禁止新增 mechanic。** 所有改动必须是 CSS / DOM / 纯函数 / 参数归一化 / 已有后端数据的 surface。任何改动涉及 `src/simulation/` 下 balance/constants/新系统注册的，必须在 PR 中给出"为什么这是 surface 而非 new mechanic"的说明；若无法说明则 revert。
3. **不改 `Plans/` 和 `Feedbacks/` 目录。** 本文件（`Plans/summary.md`）由 Stage B 产出，Implementer 只读不写；Round1 所有产物已冻结。
4. **Changelog 强制。** CLAUDE.md 要求每次 commit 同步 `CHANGELOG.md`；每个 Wave 结束时在 Unreleased 段追加分组条目（按 "Bug Fixes" / "UI Polish" / "Tests" 分）。
5. **回归门槛**（每个 Wave 末尾跑一次，全部通过才进下一 Wave）：
   - `node --test test/*.test.js` — 865 baseline + 新测试数，0 failing。
   - `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains --days 365` — DevIndex ≥ 42（v0.8.1 基线 44 的 -5%）。
   - Playwright smoke（仅 Wave 2/3）：无 console error；顶栏 DOM id 完整。
6. **冲突 guardrail**：
   - 任何修改 `src/ui/hud/storytellerStrip.js` 的 PR 必须引用本文件 D3/D4 决议。
   - 任何修改 `src/ui/interpretation/WorldExplain.js` 的 PR 必须引用 D2 决议。
   - 任何修改 `index.html` `.hud-action` / `.hud-scenario` / `.hud-objective` 的 PR 必须引用 D5 决议。
   - 任何修改 `src/render/SceneRenderer.js` 的 `#pickEntity` 的 PR 必须引用 D1 决议。
7. **测试文件命名去重**：按 §4 决议，`test/entity-pick-screen-fallback.test.js`（01d Step 7）不创建；`test/entity-pick-hitbox.test.js`（01b Step 5）保留。其余新测试文件名按各自 plan 原样执行。
8. **每 Wave 独立 commit**（不合并 Wave；Wave 内多个 plan 可合并到 1-3 个 commit 以便回滚粒度）。
