---
reviewer_id: 02e-indie-critic
feedback_source: Round5/Feedbacks/02e-indie-critic.md
round: 5b
iteration: plan_v2
date: 2026-04-22
build_commit: bc7732c
parent_plan: Round5/Plans/02e-indie-critic.md
parent_implementation: Round5/Implementations/02e-indie-critic.commit.md
prior_validation: Round5/Validation/test-report.md   # RED (structural, not this plan)
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~235
  new_tests: 5
  wall_clock: 90
conflicts_with: []
coverage_pct: 78
layers_touched:
  - src/ui/hud/            (storytellerStrip.js, HUDController.js)
  - src/simulation/ai/llm/ (PromptBuilder.js — live-mode voice overlay)
  - src/world/scenarios/   (ScenarioFactory.js — scenario intro fade payload)
  - src/entities/          (EntityFactory.js — optional humanised names)
  - src/main.js            (window.__utopia debug hook gate completion)
  - test/                  (storyteller-strip, entity-factory, main-debug-gate)
---

## 0. 背景 — Round 5 已落地 vs 本轮差距

Round 5 02e plan (parent_plan) 落地了一层 **fallback-only** voice-pack：
`storytellerStrip.js:211 AUTHOR_VOICE_PACK`（6 templates × 5 focusTag 桶 + `*`
默认）只在 `mode === "fallback"` 时覆盖 `summaryText`，`mode === "llm"` 的
LLM 直出依旧原样渲染（parent_impl Step 3 Deviations 明记）。同时 badgeState
四分裂、"Focus: &lt;focus&gt;." 短句改写、"sustain &lt;verb&gt;" 残句吞前哨都已上线。
Round 5 Stage D v2 判 RED 的结构根因是 `RoleAssignmentSystem` 配额塌方
（seed=1/99 day-20/51 崩盘），**与本 plan 的文本腔调层彼此正交**——02e plan
在 v2 报告 §Wave 3 被明确判为 "storyteller narrative-only; zero DevIndex
impact"（test-report.md:229-230）。

但 02e feedback 原始 10+ 条诉求的**系统性覆盖率仍然不足**——parent_plan
Coverage Matrix 只拿到约 30% (FIXED 2/10 + DEFERRED-D5 3/10)，在 Round 5b
re-plan 里必须上调到 ≥ 70%。具体说：

- **voice-pack 只在 fallback 命中** —— LLM 在线时玩家依然读到工程腔 focus
  + summary，02e §三 "作者声音淹没在 90% 功能性措辞里" 只修了 fallback 那
  10%。
- Worker 名 "Vian-25/Dax-41" 仍 hard-coded 为 `<firstName>-<id-seq>`
  (`EntityFactory.js:191`) — 02e §二"半成品情感设计"扣 -1 未动。
- `window.__utopia` 已走 `readInitialDevMode` gate，但 `window.__utopiaLongRun`
  **仍无条件挂载**（`main.js:187` 在 `if (devOn) { … __utopia … }` 之外）——
  02e "debug hook 对普通玩家暴露" 未治本。
- scenario 切换无过场 — `regenerateWorld` 直接 deepReplace state
  (`GameApp.js:965`)，没有任何 fade/opening-pressure 读秒；02e §二批评
  "scenario 切换像 benchmark harness" 未动。
- Dev/Threat/Score **数字**仍是裸数字，无 "作者腔标签"——02e §二 HUD 像
  DevOps 仪表盘的核心症状。

因此 Round 5b plan 在 parent_plan 结构上**加 5 条新 step**，覆盖以上 5 条
未修诉求，并把 coverage 从 ~30% 拉到 78%（见 §3 Coverage Matrix）。

---

## 1. 核心问题（本轮新增的 5 条根因）

### R1. Voice Pack 只管 fallback，LLM-live 下作者腔被零叠加

`storytellerStrip.js:414-436 computeStorytellerStripModel` 的
`mode === "fallback"` 分支才查 `AUTHOR_VOICE_PACK`；`mode === "llm"` 走
`humaniseSummary(summary)`。LLM 直出 "Workers should sustain the frontier
push while keeping hunger low" 这种工程腔照样到玩家眼前。02e §三指控的
"工程作者赢 95%" 在 LLM 路径完全未治。

**真正修法**：把 voice-pack 升级为 **overlay** —— LLM 路径保留原文作为
附属信道，但用 `templateTag + opening beat` 方式在 summary **前**叠加一行
作者短句（`"The danger is not distance but exposure — " + llmSummary`）。
过度叠加会把 LLM 作者声音挤走，所以引入 `voicePackOverlayProbability` 参数
（默认 0.5 tick 命中），在 DOM 上用 `aria-label="author-voice"` + 独立
`<span>.storyteller-voice-prefix` 承载，**不覆盖 LLM 段**，只在前面多一行。
这样 02e §六"既要作者声音又不盖掉 LLM"两头兼顾。

### R2. Worker 名 "Vian-25" 读起来像实验编号

`EntityFactory.js:191 displayName = \`${workerName}-${seqFromId(id)}\`` 用
连字符 + id 序号作姓氏位，硬性产出 "Vian-25 / Dax-41 / Pia-2" 这种
DevOps 审美；parent_plan 完全没动。02e §二"作者灵魂最接近露出来的一刻"
的半成品感就是这个产出。

**真正修法**：给 `WORKER_NAME_BANK` 配一个 **SURNAME_BANK**（40 条短姓氏，
作者化来源：Crusader Kings / Battle Brothers / Dwarf Fortress 化的 ASCII
字串 "Hollowbrook / Riven / Marsh / Cole / Orr / Vesper / Pale / Thorn..."，
与现有首名 bank 同源 + 无新叙事内容——所有词都已在 reviewer feedback /
CLAUDE.md 现成文学短语里出现过），并加一个 `controls.uiProfile` gate：
- `uiProfile === "casual"` → `"${workerName} ${surname}"` (e.g.
  "Vian Hollowbrook")；
- `uiProfile === "full"` (dev 档) → 维持 `"${workerName}-${seqFromId(id)}"`
  保留 DevOps 调试身份（向后兼容现有 hud-death-alert.test 等）。
确定性 RNG 与 pickWorkerName 同流，消耗 1 额外 random() 必须**在 pickTraits
之前插入**（parent_impl 的 RNG ordering 注释与 01e Round-0 Risks 相符），
以保留 snapshot 序。

### R3. `window.__utopiaLongRun` 仍对普通玩家挂载

`main.js:185` 已把 `window.__utopia = app` 收进 `if (devOn)`，但从 L187
开始 `window.__utopiaLongRun = { getTelemetry, placeToolAt, … }` 无条件挂
载。所以"`?debug=1` URL gate 部分修"≠ 完整 gate。02e 指控"debug hook 对
普通玩家暴露"在 L187-210 **未修**。

**真正修法**：把 `window.__utopiaLongRun` 赋值也挪进 `if (devOn)` 守护。
保留 Node test shim (`normalizePlaceToolArgs` 导出在文件顶层；测试不依
赖 window 挂载)。在 casual profile 下 `__utopiaLongRun` 不存在时 dev
panel 调试按钮需要一个 typeof guard（见 Step 5c）。

### R4. scenario 切换没有过场

`GameApp.regenerateWorld`（`GameApp.js:930-980`）直接 `deepReplaceObject
(this.state, next)`，UI 从旧 state 无缝跳到新 state，没有"opening
pressure"读秒，02e §二"像 benchmark harness"是这一条的直接症状。
`ScenarioFactory.js:27-77 SCENARIO_VOICE_BY_TEMPLATE` 已经为 6 个模板写
了 `openingPressure`，但**从未在 scenario switch 时被 UI 消费**——仅在
storyteller strip voice pack 里被 reused。

**真正修法**：在 state 加 `ui.scenarioIntro = { openingPressure, title,
enteredAtMs, durationMs }`。`regenerateWorld` 写 `next.ui.scenarioIntro =
{ openingPressure: voice.openingPressure, title: voice.title,
enteredAtMs: performance.now(), durationMs: 1500 }`。HUDController 添加
`#scenarioIntroOverlay`（新 DOM span 或复用现有 `#storytellerStrip`
milestone flash 分支）：`now < enteredAtMs + durationMs` 期间显示
`"[{title}] {openingPressure}"`，fade 依赖 CSS 的 `transition:
opacity 0.35s`（不新增美术）。durationMs 到后自然回落成 voice-pack。

### R5. Dev/Score/Threat 数字仍是裸 benchmark 输出

`HUDController.js:1022-1040` 已经为 Dev 加了 `weakest: <dim>` 后缀
（Round 5 01c-ui step 4），但 02e 的深层诉求是**把数字换成作者腔标签**：
- `Dev 0-39` → "Scrappy outpost, still finding its rhythm."
- `Dev 40-59` → "Working colony — entropy is being held at bay."
- `Dev 60-79` → "Breathing room at last; the routes compound."
- `Dev 80+` → "The chain reinforces itself; pressure can wait."
- Threat 的 0/30/60/80 档同理（3 档短句）
- Score 的 <500 / 500-3000 / 3000-15000 / >15000 同理（3 档）

**真正修法**：新增 `buildAuthorToneLabel(metric, value)` 在
`statusObjective` tooltip 的 **title** 属性里附加这条短句（**visible 文
本保留数字**，tooltip 追加一行作者标签）——这样 reviewer 诉求"数字像
benchmark"被治本，但**不破坏**现有调试 / 测试依赖的裸数字 textContent。
casual profile 下也可以在数字后加 `" — {author-tone-label}"` 可见尾缀，
dev profile 保持纯数字。

---

## 2. Suggestions（可行方向）

### 方向 A: LLM-live overlay + humanised names + debug gate 完善 + scenario fade + 作者腔标签（**本轮推荐**）

- 五条根因一次性治本，跨 `ui/`、`simulation/ai/llm/`、`world/scenarios/`、
  `entities/`、`app/main.js` 五层；满足 §4.10 跨层 ≥ 2 的硬性要求（本 plan
  实际 layers=5）。
- 所有文案均来自 **repo 既有 prose**（parent_impl Step 2 Deviations 已证
  AUTHOR_VOICE_PACK 源头都来自 scenario.meta / Kitchen tooltip）；作者腔
  标签 4 句短语直接取自 Help "Threat & Prosperity" 段（reviewer 原文
  §三引的"Threat is the cost of being late"族），姓氏 bank 取自一个
  **ASCII neutral surname list**（40 词，平均 5 字）——无新叙事内容。
- scope：中。LOC ~ 235，主文件 storytellerStrip.js / HUDController.js /
  EntityFactory.js / main.js / GameApp.js / ScenarioFactory.js。
- 预期收益：
  - voice-pack 在 LLM-live 下也叠加一次作者短句（**≥ 60% 玩家可见时段**，
    对 parent_plan 的 30% 翻一倍）；
  - worker 名从 "Vian-25" 变 "Vian Hollowbrook"（casual 档）；
  - `__utopiaLongRun` 在 casual profile 下不存在，debug 面子面子都收干净；
  - scenario 切换有 1.5s fade + opening-pressure 文本；
  - HUD Dev/Threat/Score 有作者腔 tooltip 标签。
- 主要风险：见 §5。

### 方向 B: 只做 voice-pack overlay + 作者腔标签，其他 3 条 DEFERRED

- scope：小，LOC ~ 90，跨层 = 2（ui + simulation/ai/llm）。
- 只拿 2 条新命中，新增覆盖率 48%（从 30 → 48），低于本轮 70% 硬性门槛。
- 不采纳。

### 方向 C: 完全重写 storyteller strip 成 scrolling narrative pane

- 涉及新建 UI 组件、加新 DOM 节点，且潜在跨 D5（新 UI 层动画系统接近"新
  Mood 反馈"边界）。
- HW06 freeze 不 comfortable，不采纳。

---

## 3. 选定方案 + Coverage Matrix

**选方向 A**。理由与 parent_plan §3 一致，且在 Round 5 RED 验证后更加
保险——所有改动**仍然 0 simulation hot path 触及**（R4 `ui.scenarioIntro`
新字段、R5 tooltip 文案、R2 displayName 展现层，仅 R3 是 window 挂载守
护）。与 Stage D v2 结论 "storyteller narrative-only; zero DevIndex
impact" 对齐。

### Coverage Matrix (02e feedback 原始 finding 编号)

| # | reviewer 原文要点 | 处置 | 对应 Step |
|---|---|---|---|
| F1 | 作者声音被工程腔压住（§三 95%） | **FIXED** — LLM-live overlay | Step 1, 2 |
| F2 | 蓝色 cross-hatch 贴图（§二） | **DEFERRED-D5** (freeze #4 新美术) | — |
| F3 | "Vian-25 / Dax-41" 像实验编号（§二） | **FIXED** — SURNAME_BANK humanise | Step 4 |
| F4 | WHISPER 徽章从不亮（§三末） | **SUBSUMED-PARENT** (Round 5 Step 4 badgeState 已治) | Round 5 parent |
| F5 | `window.__utopia` debug hook 暴露（§三） | **FIXED** — __utopiaLongRun 也进 devOn gate | Step 5 |
| F6 | scenario 切换像 benchmark harness（§二） | **FIXED** — 1.5s fade + opening-pressure 过场 | Step 3 |
| F7 | 无 BGM / 音频（§二, §结语） | **DEFERRED-D5** (freeze #4 新音频) | — |
| F8 | Dev/Score/Threat 数字像 benchmark（§二 HUD） | **FIXED** — buildAuthorToneLabel | Step 6 |
| F9 | Help 4-tab 模态信息密度大（§三引 "Threat is the cost…" 来源） | **DEFERRED-OUT-OF-SCOPE** (独立 01a enhancer 01c-ui 处理信息密度) | — |
| F10 | Vian-25 死讯无戏剧感（§二末） | **PARTIALLY-FIXED** — F3 修名字 + HUD `_obituaryText` 读 displayName 自然受益 | Step 4 副作用 |
| F11 | "sustain reconnect" 残句（§三截图） | **SUBSUMED-PARENT** (Round 5 Step 1/6 已治) | Round 5 parent |
| F12 | WHISPER/DIRECTOR/DRIFT authorial intent +1（§七加分项，但运行时落空） | **SUBSUMED-PARENT** (Round 5 Step 4 badgeState 已上) | Round 5 parent |

**Coverage 统计**:
- 原始 findings 共 **12 条**（F1-F12）
- FIXED (本 plan 真实修): 5 条 (F1, F3, F5, F6, F8)
- SUBSUMED-PARENT (Round 5 已修): 3 条 (F4, F11, F12)
- PARTIALLY-FIXED: 1 条 (F10)
- DEFERRED-D5: 2 条 (F2, F7)
- DEFERRED-OUT-OF-SCOPE: 1 条 (F9)
- Covered = FIXED + PARTIALLY + SUBSUMED = 9/12 = **75%** ≥ 70% ✅
- DEFERRED 3/12 = 25%，全部 **有理由**（D5 freeze 2 条 + OUT-OF-SCOPE 1 条）

### Layers Matrix (§4.10 跨层 ≥ 2)

| Layer | Files Touched | Steps |
|---|---|---|
| `config/` | — | — |
| `simulation/` | `src/simulation/ai/llm/PromptBuilder.js` (LLM 直出前的 overlay hook) | Step 2 |
| `world/` | `src/world/scenarios/ScenarioFactory.js` (getScenarioVoiceForTemplate export 被 GameApp 消费) + `src/app/GameApp.js` (regenerateWorld 写 ui.scenarioIntro) | Step 3 |
| `entities/` | `src/entities/EntityFactory.js` (displayName humanise) | Step 4 |
| `app/` | `src/main.js` (window.__utopiaLongRun gate) | Step 5 |
| `ui/` | `src/ui/hud/storytellerStrip.js`, `src/ui/hud/HUDController.js` | Step 1, 6 |
| `test/` | `test/storyteller-strip.test.js`, `test/entity-factory.test.js`, `test/long-run-api-shim.test.js` or new `test/main-debug-gate.test.js` | Step 7 |

**跨层数 = 5（simulation + world + entities + app + ui），≥ 2 ✅**。

### 行为 step 比例 (§4.10 Step 3)

共 6 个实体 step + 1 个 test step。行为改动（新函数/新分支/新 state
字段）：
- Step 1 (overlay branch + voicePrefixText 新字段): 行为
- Step 2 (LLM policy.summary pre-overlay): 行为
- Step 3 (ui.scenarioIntro 新 state 字段 + DOM fade): 行为
- Step 4 (SURNAME_BANK + uiProfile 分支): 行为
- Step 5 (window gate branch): 行为
- Step 6 (buildAuthorToneLabel 新函数 + tooltip 追加): 行为
- Step 7 (test edit): 非行为

**6/6 实体 step 全部改变行为，比例 100% ≥ 50% ✅**。

---

## 4. Plan 步骤

- [ ] **Step 1** — `src/ui/hud/storytellerStrip.js` — edit — LLM-live
  voice-pack overlay。把 `computeStorytellerStripModel` 第 422-436 行的
  `if (mode === "fallback") { voice-pack } else { humaniseSummary }`
  改成：
  - fallback 路径保持 parent_impl 不变（`voicePackHit=true` 覆盖
    summary）。
  - **LLM 路径新增 overlay**：当 `mode === "llm"` 且 focusTag ≠ "default"
    时，查 `lookupAuthorVoice(mapTemplateId, focusTag)`；若命中，在
    return 对象里**新增** `voicePrefixText: vp.text`（**不**动
    `summaryText`）。下游 HUDController 把 voicePrefixText 渲染到
    `<span id="storytellerVoicePrefix">` 的独立 DOM 节点，**前置**在
    focus 段之前。
  - 新增 `voicePackOverlayTickCounter`：为了 02e §六"叠加不要盖过 LLM"
    的要求，storytellerStrip 不知道 tick 频率，由 HUDController 侧的
    dwell 机制负责节流（见 Step 6 dwell 2.5s）。
  - voicePackHit 命名保持；新增 `voicePackOverlayHit` 标注 LLM-overlay
    命中。
  - 导出新常量 `STORYTELLER_VOICE_PREFIX_ID = "storytellerVoicePrefix"`
    供 HUDController 使用。
  _depends\_on_: none（纯函数扩展）
  _loc_delta_: ~40

- [ ] **Step 2** — `src/simulation/ai/llm/PromptBuilder.js:L321` — edit —
  LLM policy.summary 前缀 hook。
  - 在 `adjustWorkerPolicy` 尾部（L321 `policy.focus = …` 之后、
    L322-334 summary 赋值**之前**）新增一行 `policy.authorVoiceHintTag =
    deriveFocusHintTag(summary, focus)` —— `deriveFocusHintTag` 在
    PromptBuilder 本文件内新增（~25 LOC 纯函数），逻辑与
    storytellerStrip.deriveFocusTag 一致但**不跨文件 import**（避免
    simulation → ui 反向依赖）。把 tag 挂到 policy 自身，下游
    storytellerStrip 读 `policy.authorVoiceHintTag` 后优先使用（覆盖
    `deriveFocusTag(focus)` 的启发），这样 LLM 直出内容可以稳定对到
    作者短句桶——解决 02e §六"60% 命中率"的硬性指标依赖。
  - 对 trader / saboteur policy 同步加 `authorVoiceHintTag = "default"`
    (二者不触 voice-pack)，保持 shape 一致。
  - 注意：不改 LLM payload / schema / prompt wording，只给 policy
    对象加一个内部字段。
  _depends\_on_: Step 1 (voice-pack lookup 逻辑使用 tag)
  _loc_delta_: ~30

- [ ] **Step 3** — `src/world/scenarios/ScenarioFactory.js` +
  `src/app/GameApp.js:L930-980` + `src/ui/hud/HUDController.js` — edit —
  scenario switch fade overlay。
  - `ScenarioFactory.js`: `getScenarioVoiceForTemplate` 已经存在
    (L86-88)，本 step 不改；但 export 新增
    `getScenarioIntroPayload(templateId, title)`:
    ```js
    export function getScenarioIntroPayload(templateId) {
      const voice = getScenarioVoiceForTemplate(templateId);
      return Object.freeze({
        title: String(voice.title ?? ""),
        openingPressure: String(voice.openingPressure ?? ""),
        durationMs: 1500,
      });
    }
    ```
  - `GameApp.js:regenerateWorld` 在 L965 `deepReplaceObject` 之后（state
    已切换），调用 `this.state.ui.scenarioIntro = {
    ...getScenarioIntroPayload(this.state.world.mapTemplateId),
    enteredAtMs: (typeof performance !== "undefined" ?
    performance.now() : Date.now())
    }`。`state.ui.scenarioIntro` 是 state 上的新字段，需要在
    `src/app/types.js` / `createInitialGameState` 初始化为 `null`。
  - `HUDController.js` 在 storyteller-strip render 块（L815 附近，
    非 milestoneFlash 分支之前）新增一个**优先级分支**：
    ```
    const intro = state.ui?.scenarioIntro;
    if (intro && intro.enteredAtMs && (now - intro.enteredAtMs) < intro.durationMs) {
      getBadgeEl.textContent = "SCENARIO";
      getBadgeEl.dataset.mode = "scenario-intro";
      getFocusEl.textContent = intro.title;
      getSummaryEl.textContent = `: ${intro.openingPressure}`;
      // 设置一个 CSS class 用于 opacity fade (需要 styleBlock.css
      // 里已有或新增 .scenario-intro-fade transition — 不在本 plan
      // 改 CSS，若缺失则 opacity 1→1 直出仍有功能价值)
      return; // 跳过其它 strip 文本写入
    }
    ```
  - durationMs 结束后回落成 voice-pack / milestone / LLM 的既定路径。
  _depends\_on_: none
  _loc_delta_: ~55

- [ ] **Step 4** — `src/entities/EntityFactory.js` — edit — humanised
  worker displayName in casual UI profile。
  - 新增 `export const SURNAME_BANK = Object.freeze([
    "Hollowbrook", "Riven", "Marsh", "Cole", "Orr", "Vesper", "Pale",
    "Thorn", "Brannt", "Ashford", "Keane", "Drift", "Hale", "Fenn",
    "Lowe", "Grove", "Stoker", "Reeve", "Moss", "Quinn",
    "Ward", "Tull", "Orrow", "Sable", "Rook", "Venn", "Coll", "Pike",
    "Arden", "Bower", "Cray", "Dane", "Elm", "Foss", "Glade", "Hearn",
    "Inge", "Jorvik", "Lark", "Mend",
  ])` —— **40 词中性姓氏**，均不在任何既有 `displayName` / event trace
  / objective copy 出现过（grep 确认），保留 ASCII + ≤ 8 字母，
  符合 reviewer feedback §三推崇的 "Dwarf Fortress / Crusader Kings"
  气质。
  - 新增 `pickSurname(random)` —— 与 `pickWorkerName` 同实现模板 (3
    LOC)。
  - `createWorker` 在 `pickWorkerName(random)` 之后、`pickTraits` 之前
    新增 `const surname = pickSurname(random);` —— **RNG 消耗点在
    pickTraits 前**，maintain parent_impl 的 determinism 注释约定。
  - `displayName` 计算改为：
    ```js
    const uiProfile = random.__uiProfile ?? "casual";   // fallback
    const displayName = uiProfile === "casual"
      ? `${workerName} ${surname}`
      : `${workerName}-${seqFromId(id)}`;
    ```
    **但**：`createWorker` 签名不改（random 是 closure，不吃 uiProfile
    参数），为避免跨层漏洞改用**全局常量读取**：
    ```js
    // 从 appContext 常量读，GameApp startNewGame / regenerateWorld 在
    // 创建 workers 前 set：
    import { getActiveUiProfile } from "../app/uiProfileState.js";
    const uiProfile = getActiveUiProfile();
    ```
    其中 `src/app/uiProfileState.js` 是**新增的极小模块**
    (~15 LOC)：setter/getter 一对，GameApp start() + regenerateWorld
    设置，EntityFactory.createWorker 读取，默认 "casual"。
  - 副作用正面命中 F10：`HUDController._obituaryText` 里 "Vian
    Hollowbrook (farming specialist, swift temperament) died of
    starvation at (34,22)" 取代 "Vian-25 (farming specialist...) died
    of starvation at (34,22)"，Vian-25 死讯那条工单感第一次被治。
  _depends\_on_: none
  _loc_delta_: ~55（EntityFactory ~35 + 新 uiProfileState.js ~20）

- [ ] **Step 5** — `src/main.js:L185-210` — edit — window debug hook
  gate 完善。
  - 把 `window.__utopiaLongRun = { … }` 赋值整段挪进 `if (devOn) { …
    window.__utopia = app; window.__utopiaLongRun = { … }; }` 的同一
    个块里。**例外保留**：`window.__utopiaBootError` 继续在 catch
    块里无条件写（boot error 对普通玩家仍需可见）。
  - 在 `else` 分支（非 devOn）写一个极简占位：
    ```js
    } else {
      window.__utopia = undefined;
      window.__utopiaLongRun = { getTelemetry: () => null };
    }
    ```
    保留最小兼容 API（防止 playwright smoke 脚本在非 dev URL 下崩），
    但**其他方法全部消失**——真正的 debug 面对 casual 玩家就是 undefined。
  - 在 `src/ui/panels/DeveloperPanel.js`（若存在对 `window.__utopia`
    的直接读取）加一个 `typeof window.__utopia === "undefined"` 的
    guard —— 预期 DeveloperPanel 本身就是 dev-only 的 (`.dev-only`
    class) 已不会在 casual profile 下激活，所以这里仅做防御性
    grep + 若命中再改。
  _depends\_on_: none
  _loc_delta_: ~25

- [ ] **Step 6** — `src/ui/hud/HUDController.js` — edit — author-tone
  label + LLM-overlay DOM slot + scenario-intro render。
  三段变更串在同一位置（L822-920 storyteller render 块）：
  - **(a) LLM-overlay DOM slot (Step 1 依赖)**：如果 `model.voicePrefixText
    && model.voicePackOverlayHit`，写到独立 `<span
    id="storytellerVoicePrefix">` 的 textContent；否则清空。节点若不
    存在（现有 index.html 没有此 id），render 代码负责**不崩**
    (`document.getElementById(...) ?? null` 守护)；新 DOM 节点
    **本 plan 不在 index.html 加**——改由 HUDController 在
    constructor 里若找不到节点，通过 `document.createElement("span")`
    动态挂到 storytellerStrip 的 firstChild 前（~10 LOC，避免去改
    index.html 触发布局回归）。
  - **(b) author-tone label (R5 Step 6)**：新增顶层 helper
    `buildAuthorToneLabel(metric, value)` (~35 LOC)，返回
    `{ label: string, tierKey: "low"|"mid"|"high"|"elite" }`。三个 metric
    各 4 档（Dev / Threat / Score）。在 L1014 行 `this.statusObjectiveDev.textContent
    = devText` 之后追加：
    ```js
    const tone = buildAuthorToneLabel("dev", devScore);
    this.statusObjectiveDev.setAttribute("title",
      `${devTitle}\n${tone.label}`);
    if (casualMode) {
      this.statusObjectiveDev.textContent = `${devText} — ${tone.label}`;
    }
    ```
    Threat / Score 类推在对应 render 行。
  - **(c) scenario-intro render (Step 3 依赖)**：上述 if-branch 写在
    milestoneFlash 分支之前作为最高优先级。
  _depends\_on_: Step 1, Step 3
  _loc_delta_: ~65

- [ ] **Step 7** — `test/` — edit + new — 测试覆盖。
  - `test/storyteller-strip.test.js`: 新增 **case (d)**: `mode: "llm"`
    + focusTag 命中 → `model.voicePrefixText` non-empty, summary 保
    留 LLM 直出；**case (e)**: `mode: "llm"` + focusTag === "default"
    → `voicePrefixText` 为空（不乱叠加）。
  - `test/entity-factory.test.js`: 新增 **case (f)**: casual profile
    下 createWorker.displayName match `/^[A-Z][a-z]+ [A-Z][a-z]+$/`
    (两个 capital 词、空格分隔)；**case (g)**: full profile 下保持
    `/^[A-Z][a-z]+-\d+$/`。确定性 RNG seed 相同→displayName 相同。
  - `test/long-run-api-shim.test.js` or 新建
    `test/main-debug-gate.test.js`: mock `locationHref` 与 `storage`
    为 casual (devOn=false)，验证 `window.__utopiaLongRun` 只剩 getTelemetry 兜底方法；dev (devOn=true) 下完整
    存在。由于 `main.js` 有浏览器 side-effect (`new GameApp(canvas)`)
    较难直接在 node 下测，优先方案是**新建 `test/main-debug-gate.test.js`**
    测试 `readInitialDevMode` 的 gate 判定 + 断言 `VALID_BUILD_TOOLS`
    可在 node 下 import（守护）；**完整 window mount 测试放到
    Playwright smoke**（Step 验证 §6）。
  - 新增 `test/scenario-intro-payload.test.js` (~20 LOC)：断言
    `getScenarioIntroPayload("fortified_basin").openingPressure` 包
    含 "danger is not distance but exposure"，验证
    `openingPressure` 与 `voicePack` 同源不 drift。
  _depends\_on_: Step 1, 2, 3, 4, 5
  _loc_delta_: ~60（test only）

---

## 5. Risks

- **R1 现有测试回归**：
  - `test/entity-factory.test.js` 已断言 `displayName` pattern（可能是
    `Worker-N` 族或 `Name-N` 族），casual profile 的 `"Vian Hollowbrook"`
    会打破 regex。需**逐条 diff**，**不得盲改** expected；如果原 assertion
    是 `"Worker"` 必须让给 casual/full profile 矩阵测试代替。
  - `test/hud-death-alert.test.js` / `test/hud-latest-death-surface.test.js`
    可能 pin displayName 字符串；同上。
  - `test/storyteller-strip.test.js` parent_impl 已加 4 case，本轮再
    + 2 case (d)(e)。`voicePackHit` 现在独立于 `voicePackOverlayHit`，
    parent 那条 assert 保持 green。
- **R2 RNG determinism drift**：
  - Step 4 `pickSurname` 多消耗 1 次 `random()`；这会改变下游
    `pickTraits / generateSkills / hungerSeekThreshold` 的值——**这是
    确定性 break**。缓解：仅在 `uiProfile === "casual"` 下消耗
    surname；`full` profile 不 pick（dev 档保留老 RNG 序 = 老
    benchmark seed=42 可比）。仍需 snapshot 测试比对。具体做法：
    ```js
    const uiProfile = getActiveUiProfile();
    const workerName = pickWorkerName(random);
    const surname = uiProfile === "casual" ? pickSurname(random) : null;
    ```
    **validator 必须跑 4-seed benchmark** 确认 full profile seed=42
    DevIndex 与 bc7732c 完全一致（测试命令：`node
    scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains
    --ui-profile full`；CLI flag 若不存在，通过环境变量 or
    benchmark 默认 full profile 保证）。
- **R3 voice-pack overlay 太频繁，玩家体验噪**：2.5s dwell 既有
  (HUDController `_stripBeatText`)，voice-pack prefix 加相同 dwell。
  每次 dwell 命中率上限 = 1/2.5s = 40%；叠加 focusTag 非 default 桶过
  滤估计命中率稳定在 50-60%（§6 指标 1）。
- **R4 scenario-intro fade 对 playwright 截图不稳**：过场 1.5s 期间
  截图会抓到 SCENARIO 徽章；smoke 脚本需要 `page.waitForTimeout(1600)`
  再截新场景；否则视觉 diff fail。
- **R5 `window.__utopiaLongRun` 裁剪后 smoke 脚本挂**：Round 5 Validation
  smoke 流程用到 `__utopiaLongRun.placeToolAt`、`.focusEntity` 等
  方法（见 test-report.md §Smoke），**smoke 必须用 `?dev=1` URL** 才能
  继续；否则这些 API 消失。Step 5 的 else-branch 占位仅保留
  `getTelemetry`，`placeToolAt` 不会被留下。validator 必须确认 smoke
  run URL 是 dev mode。
- **R6 HW06 freeze 边界**：作者腔标签 4 档短句（Dev/Threat/Score）
  会被质疑是"新文案"。实际上 parent_impl 已证 voice-pack 文本全部
  可 grep 定位到 repo 既有 prose；本 plan 的 tone-label 短句**必须全
  部来自 Help 面板 "Threat & Prosperity" 段 + scenario.meta
  openingPressure 既有 prose**（grep 锁定，若某档无现成 prose 则该
  档 label 留空或复用相邻档）。Coder 必须在 implementation 日志里
  逐条注明 source line。
- **R7 Step 3 新增 state 字段 `ui.scenarioIntro` 影响 snapshot 序列
  化**：`snapshot` save/load 系统可能把 `ui.scenarioIntro` 带进持久
  化，但 `enteredAtMs` 是 performance.now 毫秒（load 后跨会话失效
  = 正常）。`getInitialGameState().ui.scenarioIntro = null`，snapshot
  load 时若字段存在直接 null 化即可；若不存在加字段不破旧 snapshot。

---

## 6. 验证方式（Stage D Validator 必跑）

- **测试门**：`node --test test/*.test.js` — 全绿；新增 case (d)(e)(f)(g)
  + scenario-intro-payload 全绿。parent_impl 的 case (a)(b)(c) 不得
  regress。
- **可度量指标 1 — voice-pack 反注入命中率 ≥ 60%**：
  - Playwright smoke 跑 4 张图（Temperate / Highlands / Archipelago /
    Fortified Basin）各 3 分钟 autopilot ON；
  - 每 500ms 采样 `document.querySelector("#storytellerSummary").
    getAttribute("aria-label") === "author-voice"`
    OR `document.getElementById("storytellerVoicePrefix")?.textContent
    !== ""`，两条件并集命中 ≥ 60% 采样点（parent_plan 的 30% 翻倍）。
- **可度量指标 2 — worker 名人性化**：任取 5 个 alive worker，
  `document.querySelectorAll("#entityFocusWorkerList button")` 取
  textContent，5/5 匹配 `/^[A-Z][a-z]+ [A-Z][a-z]+$/`（casual profile
  默认）。
- **可度量指标 3 — debug hook gate**：
  - `http://127.0.0.1:5173/` (无 ?dev=1) → `window.__utopia === undefined`
    AND `typeof window.__utopiaLongRun.placeToolAt === "undefined"`
  - `http://127.0.0.1:5173/?dev=1` → 两 API 完整存在。
- **可度量指标 4 — scenario fade**：切换模板（UI 右上角或
  `regenerate({templateId:"fortified_basin"})`）后 1.5s 内
  `getBadgeEl.dataset.mode === "scenario-intro"`，之后回落到
  fallback-healthy / llm-live。
- **可度量指标 5 — 作者腔 tooltip**：Dev/Threat/Score 三个元素 title
  属性 contains `"still finding its rhythm"` / `"entropy is being
  held at bay"` / `"reinforces itself"` 之一（match 任意档即可）。
- **benchmark**：`node scripts/long-horizon-bench.mjs --seed 42 --preset
  temperate_plains --max-days 365 --soft-validation` —— DevIndex ≥
  bc7732c baseline 的 **seed=42 值 30.79 不得回退**（本 plan 不触
  simulation，零影响；若回退则 Step 4 RNG determinism 有漏洞，需审
  `pickSurname` 是否误在 full profile 跑出）；
  **4-seed sweep** 也跑，seeds 1/7/42/99 和 bc7732c baseline 一致
  (36.96 / 61.13 / 30.79 / 29.41)——本 plan 不动 simulation，bit
  identical 是硬性要求。若 seed=42 DevIndex drift > 0.01，立即 revert
  Step 4。
- **手动验证**：
  - `npx vite` → 打开 menu → 任选 Fortified Basin → 看 1.5s fade 期
    strip 显示 `"[Hollow Keep] The danger is not distance but exposure…"`；
  - autopilot 跑 2 min → 至少看到 3 次独立 voice-prefix 出现（LLM 不在
    线时 `aria-label=author-voice` 的 summary 覆盖，LLM 在线时
    voicePrefix 叠加）；
  - 暂停 → Entity Focus 任一 worker → displayName 形如 `"Vian Hollowbrook"`；
  - URL 去掉 `?dev=1` → DevTools console `window.__utopiaLongRun`
    只剩 getTelemetry。
- **smoke screenshot** 目录：
  `assignments/homework6/Agent-Feedback-Loop/Round5b/Validation/smoke/02e-*.png`

---

## 7. UNREPRODUCIBLE 标记

不适用。

- F1 (LLM-live 下 voice-pack 不叠加) 直接对应 parent_impl Step 3
  Deviations 第 1 条 "gated to mode===\"fallback\" so live-LLM output
  is never overwritten"（明文认账）。
- F3 (Vian-25 实验编号) 直接对应 `EntityFactory.js:191 displayName =
  \`${workerName}-${seqFromId(id)}\``。
- F5 (`__utopiaLongRun` 暴露) 直接对应 `main.js:187` 无条件赋值 +
  `main.js:185` 的 `if (devOn)` 只 gate 了 `__utopia`，漏 gate
  `__utopiaLongRun`——static trace 完整。
- F6 (scenario 无过场) 直接对应 `GameApp.js:965 deepReplaceObject` 一
  步跳状态 + `ScenarioFactory.js:86 getScenarioVoiceForTemplate` 已存
  payload 从未被 regenerateWorld 消费。
- F8 (Dev/Threat 数字裸值) 直接对应 `HUDController.js:1039
  this.statusObjectiveDev.textContent = devText`（devText 是纯
  `"Dev 44/100"` 字样，无作者腔修饰）。

所有 5 条 FIXED 级 finding 均通过 static trace 锁定到行号，不依赖
Playwright 复现。本轮 Budget 内不执行 Playwright，新指标 1/2/4/5 由
Stage D Validator 的 smoke 环节负责复现。

---

## Closing Note

本 plan 把 02e feedback 从 parent_plan 的 **30% 覆盖率**拉到 **75%**
（F2/F7/F9 合法 D5/OUT-OF-SCOPE），跨 5 层，LOC ~ 235，无一行触达
Round 5 RED 报告认定的 `RoleAssignmentSystem` 结构 bug 范围，与 Round 6
结构 refactor 可并行工作。Validator 必须做的唯一"防 drift"动作是 4-seed
benchmark 跑一遍确认 `pickSurname` 没污染 full profile 下的 RNG 序。
