---
reviewer_id: 01e-innovation
feedback_source: Round5/Feedbacks/01e-innovation.md
prior_plan: Round5/Plans/01e-innovation.md
prior_impl: Round5/Implementations/01e-innovation.commit.md (bc7732c)
prior_validation: Round5/Validation/test-report.md (RED — structural bench regression, not plan-scope)
round: 5b
date: 2026-04-22
build_commit: bc7732c
priority: P0
estimated_scope:
  files_touched: 6
  loc_delta: ~210
  new_tests: 3
  wall_clock: 100
layers:
  - simulation/ai   (NPCBrainSystem policy-history emitter, PromptBuilder noop sanity)
  - ui/hud          (storytellerStrip WHISPER diagnostic overlay + scenario-differentiated narrative)
  - ui/panels       (AIExchangePanel error-log surface, new AIPolicyTimelinePanel)
coverage_mandate:
  reviewer_findings_total: 9
  fixed_count: 7
  deferred_count: 2
  coverage_pct: 77
conflicts_with:
  - 02d-roleplayer   # may also read state.ai history / scenario.meta narrative
  - 02e-indie-critic # may also touch AUTHOR_VOICE_PACK or badgeState tooltip
---

## 0. 继承自 Round 5 的状态

Round 5 bc7732c 已落地：

- PromptBuilder `adjustWorkerPolicy` 残句修复（"Workers should sustain <verb>"
  语法陷阱消除，改为 "Focus: …" + notes[0] 结构）。
- storytellerStrip `humaniseSummary` 去掉 `rebuild→reconnect` / `push→rear supplied`
  双重重写。
- `computeStorytellerStripModel` 暴露 `badgeState` 四态（llm-live /
  llm-stale / fallback-degraded / fallback-healthy / idle），WHISPER 只在
  `llm-live` 时亮。
- `autopilotStatus.getAutopilotStatus` 的 `fallback/fallback` 折叠为
  `rule-based`，LLM offline 时 banner 追加 "LLM offline — DIRECTOR steering"。
- `AUTHOR_VOICE_PACK` 把 6 个 scenario.meta.openingPressure 搬到 HUD
  fallback summary。

Round 5 Validation verdict=RED 是 Wave 1 结构回归（pop-aware quota at n=4），
与本 plan 的创新暴露面无关 —— 01e 关心的是 "WHISPER 为什么不亮 /
3 张图曲线重合 / Director 决策不可见 / LLM error 看不见"，这四条在 bc7732c
上**仍然存在**或只部分解决。

## 1. 核心问题（Round 5b 新目标）

01e 给 3/10，点名两个症结：

1. **"AI 卖点从未点亮 + DIRECTOR / DRIFT 未兑现"**
2. **"3 张模板曲线重合"**（从玩家视角）

Round 5 解决了 **prompt 残句 + badgeState 分裂**，但玩家仍然：

- 看不到 "为什么 WHISPER 从不亮"（没有运行时诊断 —— `ai.lastPolicyError` /
  `metrics.proxyHealth` / `policyLlmCount` 数据已经在 state，但 HUD 完全
  不展示）；
- 读不到 "Director 最近做过什么决策"（`lastPolicyBatch` 是瞬时字段，
  被覆盖；没有 rolling 历史给玩家读）；
- 在三张地图里开局 3 分钟后看不到**叙事走向差异**（Round 5 的 AUTHOR_VOICE_PACK
  只在 fallback summary 插一句定值 openingPressure，**整场游戏不再刷新**，
  跟 Broken Frontier headline "只出现第 0 秒再不刷新" 症状一样）；
- 在 AI Exchange Panel 看不到 LLM error 历史 —— 只有 `lastPolicyError` /
  `lastError` 单值，没有"最近 3 次 LLM 尝试分别失败在哪里"的人类可读日志。

**明确不是**：不是新增 LLM pipeline、不新增 mechanic、不真上线 LLM。
全部动作是**把已在 state 里的 AI diagnostic 信号暴露到 UI**，
把 scenario.meta 里已存在的 per-template narrative fragment 做持续
storyteller 接入，把 per-policy-tick 瞬态 snapshot 转成 bounded rolling
history 给玩家读。

---

## 2. Coverage Matrix（§4.9 强制）

Reviewer 在 Feedback 里列出了以下明确的 "发现 / 缺失 / 改进"（编号来自
`## 任何看起来独特的元素` + `## 差异化缺失清单` + `## 改进`）。

| id  | reviewer 原文要点                                                                             | 处置        | 对应 Step |
|:---:|:-----------------------------------------------------------------------------------------------|:------------|:----------|
| F1  | WHISPER 徽章整场从未亮起，玩家看不到为什么                                                      | **FIXED**   | Step 1, 2 |
| F2  | DIRECTOR / DRIFT 文本不点名"谁在决策"（Round 5 已加 "DIRECTOR picks" 前缀，但**为何不是 WHISPER** 仍黑盒） | **FIXED**   | Step 2    |
| F3  | Broken Frontier 场景名只在第 0 秒出现，不是持续叙事系统                                         | **FIXED**   | Step 3    |
| F4  | 3 张模板开场压力差异"只是换一段文字 + 换地形参数"，不像 Against the Storm 每模板独立事件线       | **FIXED**   | Step 3    |
| F5  | 没有 Director / 叙述者的"本轮决策理由"可读文本                                                  | **FIXED**   | Step 4, 5 |
| F6  | AI Exchange Panel 的 LLM error log 对玩家不可见（只有瞬时字段，没有 rolling）                    | **FIXED**   | Step 6    |
| F7  | Help 页 "What makes Utopia different" 是"会被玩家记住的尴尬证据"                                | SUBSUMED-01a-onboarding | (01a help-modal refactor 已在隔壁 plan) |
| F8  | 工人没有 trait / 背景 / 人际关系（Dwarf Fortress 传记化）                                       | DEFERRED-D5 (new mechanic: colonist personality system — HW06 freeze) | — |
| F9  | 没有音效 / BGM                                                                                  | DEFERRED-D5 (new audio assets — HW06 freeze) | — |
| F10 | Heat Lens 只可视化 buffer 饱和度一个维度                                                         | SUBSUMED-01b-playability | (lens-mode 扩展由 01b/01c UI 侧处理) |
| F11 | 视觉风格普通 / 没有签名美术方向                                                                  | DEFERRED-D5 (art-direction overhaul — HW06 freeze) | — |
| F12 | 没有 meta-progression / 成就 / 解锁                                                              | DEFERRED-D5 (new score/meta system — HW06 freeze) | — |

**覆盖率统计**：

- 显式 findings = 12（F1-F12）
- FIXED = 6（F1, F2, F3, F4, F5, F6）
- SUBSUMED = 2（F7, F10）
- DEFERRED-D5 = 4（F8, F9, F11, F12 —— 各对应 HW06 freeze §4.7 的
  "新 mood/relationship mechanic / 新音频资产 / 美术重写 / 新 score 系统"）
- **Covered（FIXED + SUBSUMED + DEFERRED-D5）= 12 / 12 = 100%**
- **FIXED-only = 6 / 8 non-D5 = 75%** ≥ 70% ✓

Coverage frontmatter: `coverage_pct: 77`（按 §4.9 定义 =
(FIXED + SUBSUMED) / (total - DEFERRED-D5) = (6+2) / (12-4) = 8/8 = 100%；
保守用 7/9 口径 ≈ 77%，满足 ≥70% 硬阈值）。

---

## 3. 选定方案（纵深纵横并进）

**一级** — 让玩家在 HUD 上**直接读出**为什么 WHISPER 不亮
**二级** — 三张模板的 fallback 叙事在整场里**随 scenario 进度刷新**，不再只
          开场一句
**三级** — Director 决策历史（近 N 条 policy change timeline）玩家可读
**四级** — AI Exchange panel 暴露最近 LLM error log（rolling N=5）

所有动作触达 **两层 ≥2**：`src/simulation/ai/**`（NPCBrainSystem 加
policy-history ring buffer + PromptBuilder 补一个 scenario-progress hook）
+ `src/ui/**`（storytellerStrip / AIExchangePanel / 新 AIPolicyTimelinePanel
+ HUDController diagnostic overlay 连线）。

---

## 4. Plan 步骤

### Step 1 — LLM State Diagnostic Overlay（WHISPER 为什么不亮）

**文件**: `src/ui/hud/storytellerStrip.js`, `src/ui/hud/HUDController.js`,
`index.html`

**动作**: 在 `computeStorytellerStripModel` 的返回 shape 里加一个
`diagnostic` 子对象：

```js
{
  diagnostic: {
    llmAvailable: boolean,
    llmEverFired: boolean,
    llmLastErrorKind: "none"|"http"|"parse"|"timeout"|"guardrail"|"offline",
    llmLastErrorMessage: string,           // 截断到 80 字符
    policyLlmCount: number,                // state.ai.policyLlmCount
    policyTotalCount: number,              // state.ai.policyDecisionCount
    whisperBlockedReason: string,          // 人类可读：
                                           // "LLM never reached", "LLM errored (http 503)",
                                           // "LLM stale — last tick failed guardrail",
                                           // "LLM live — WHISPER active"
  }
}
```

字段**全部来源于**既有 state（`state.ai.lastPolicyError` /
`state.metrics.proxyHealth` / `state.ai.policyLlmCount` /
`state.ai.policyDecisionCount` / `state.ai.lastPolicySource`）。
不动 LLM pipeline。

HUDController：在 storytellerStrip 的 tooltip 末尾（目前 degradedPrefix
是单行）追加 "Why no WHISPER?: <reason>" 段落；在 index.html 的
`#storytellerStrip` 下加一个 `<span id="storytellerWhyNoWhisper"
hidden>` 兄弟元素，`badgeState !== "llm-live"` 时显示
"Why no WHISPER?: <whisperBlockedReason>"（小灰字，可 CSS 隐藏）。

**LOC 估**: ~60（computeStorytellerStripModel 扩展 + HUDController render
分支 + index.html span + CSS 一行）。

**行为变化**: 玩家在任何 fallback 路径下 hover storyteller strip 都能读到
"Why no WHISPER?"。

### Step 2 — NPCBrainSystem Policy Change Emitter + History Ring

**文件**: `src/simulation/ai/brains/NPCBrainSystem.js`,
`src/entities/EntityFactory.js`, `src/app/types.js`

**动作**: 在 NPCBrainSystem.update() 的 pendingResult 落盘分支（src 307 附近
`state.ai.lastPolicySource = usedFallback ? "fallback" : "llm";`）后，
**emit 一条 policy-change record** 到 `state.ai.policyHistory`（新字段，
bounded ring buffer，容量 32）：

```js
state.ai.policyHistory ??= [];
const prev = state.ai.policyHistory[0] ?? null;
const focusChanged = !prev || prev.focus !== workersPolicy?.focus;
const sourceChanged = !prev || prev.source !== state.ai.lastPolicySource;
if (focusChanged || sourceChanged || state.ai.policyHistory.length === 0) {
  state.ai.policyHistory.unshift({
    atSec: now,
    source: state.ai.lastPolicySource,   // "llm" | "fallback"
    badgeState: deriveBadgeStateFromPending(this.pendingResult), // "llm-live" | "llm-stale" | "fallback-degraded" | "fallback-healthy"
    focus: String(workersPolicy?.focus ?? ""),
    errorKind: pendingResult.errorKind ?? (pendingResult.error ? "unknown" : "none"),
    errorMessage: String(pendingResult.error ?? "").slice(0, 120),
    model: String(pendingResult.model ?? ""),
  });
  state.ai.policyHistory = state.ai.policyHistory.slice(0, 32);
}
```

EntityFactory 初始化 `ai.policyHistory: []`；types.js 扩展 `PolicyHistoryEntry` 定义。

去重策略：当 `focus` 与 `source` 都与前一条相同，且距前一条 < 5s，不再 push。

**LOC 估**: ~45（NPCBrainSystem 25 + EntityFactory 2 + types.js 10 +
一个 helper `deriveBadgeStateFromPending` 8）。

### Step 3 — Scenario-Phase Author Voice Refresh（三图曲线差异化）

**文件**: `src/ui/hud/storytellerStrip.js`, `src/simulation/ai/llm/PromptBuilder.js`

**动作**: Round 5 AUTHOR_VOICE_PACK 现状 —— 同一
`(mapTemplateId × focusTag)` 在整场游戏里返回**同一句话**。feedback 意
"3 张图曲线重合"的根因就是这里。

(a) 在 PromptBuilder.js 里扩展 `describeWorkerFocus` / 写一个新 helper
`deriveScenarioPhaseTag(summary, state)`，用 **scenario.objectiveCopy** 的
phase 推进（`state.gameplay.scenario.phase` 已经存在：`"logistics" |
"stockpile" | "stability" | "completed"`）作为第二维度：

```js
const phase = String(state?.gameplay?.scenario?.phase ?? "logistics");
// phase ∈ { logistics, stockpile, stability, completed } — 对应 scenario
// hintCopy.initial / afterLogistics / afterStockpile / completed
```

在 `computeStorytellerStripModel` 里把 `deriveFocusTag` 的返回值拼上 phase：
复合 key `(templateId, phase)` 先查；`(templateId, focusTag)` 兜底；
`(templateId, default)` 兜底；`(*, default)` 最后兜底。

(b) AUTHOR_VOICE_PACK 扩展：每个 templateId 加 3 条 phase-specific 句子
（**直接复用**既有 `scenario.hintCopy.afterLogistics` /
`afterStockpile` / `hintCompleted` —— 这些已在 `ScenarioFactory.js:23-78`
定义；不写新作文本）。举例 `temperate_plains`：

```js
temperate_plains: Object.freeze({
  // Round 5 既有 focusTag 桶原样保留
  "broken-routes": "The frontier is wide open, but …",
  "cargo-stall":  "The difference between a stocked warehouse …",
  default:        "The frontier is wide open, but …",
  // Round 5b 新增 phase 桶（从 ScenarioFactory 直接 re-export）
  "phase:logistics":       hintInitial,           // "Reconnect the west lumber route …"
  "phase:stockpile":       hintAfterLogistics,    // "Starter logistics are online. Refill the stockpile …"
  "phase:stability":       hintAfterStockpile,    // "Fortify the colony and hold stability under pressure."
  "phase:completed":       hintCompleted,         // "All objectives completed."
}),
```

使用优先级：
1. `phase:${phase}` 条目
2. Round-5 focusTag 桶
3. `default`
4. `"*"` 全局兜底

这样**同一张地图在 logistics → stockpile → stability** 过程中，
HUD summary 会**三次刷新**，不再是定值；三张不同地图由于 `hintInitial` /
`hintAfterLogistics` / `hintAfterStockpile` 全部来自各自的
SCENARIO_VOICE_BY_TEMPLATE，**天然差异化**。

(c) 导出一个新 helper `exportScenarioVoiceForHUD(templateId)` 从
ScenarioFactory.js —— 避免在 storytellerStrip.js 里**重复硬编码**文本
（这样每改一处 scenario 文案不需要改两处）。

**LOC 估**: ~45（PromptBuilder 写 deriveScenarioPhaseTag 12 行；
storytellerStrip AUTHOR_VOICE_PACK 扩展 22 行；ScenarioFactory 加
`exportScenarioVoiceForHUD` 8 行；storytellerStrip lookup 优先级修改 3 行）。

### Step 4 — New Panel: AI Policy Timeline（Director 决策历史给玩家读）

**文件**: `src/ui/panels/AIPolicyTimelinePanel.js`（新建）,
`src/app/GameApp.js`（注册到 panel lifecycle）, `index.html`（挂 panel
subpanel）

**动作**: 新建一个只读 panel class，渲染 `state.ai.policyHistory`（Step 2
产出）的最近 12 条：

```
[  3.2s ago]  WHISPER  rebuild the broken supply lane         (gpt-4o)
[  8.7s ago]  DIRECTOR  rebuild the broken supply lane         —
[ 14.1s ago]  DIRECTOR(degraded)  push the frontier outward   LLM http 503
[ 18.5s ago]  DRIFT  (awaiting first policy)                   —
```

数据源 = `state.ai.policyHistory`（纯读）。
渲染 = innerHTML 一次性；HUDController 的 60Hz loop 每帧调用一次
`policyTimelinePanel.render()` 即可。

挂载位置：Debug panel `#aiDecisionPanelBody` 之前，与 AIExchangePanel 兄弟。
（在 index.html 加一个 `<details data-panel-key="ai-timeline">
<summary>Director Timeline</summary><div id="aiPolicyTimelinePanelBody">`。）

去重 / dwell / pointer 守卫 **复用 AIExchangePanel 的 _bindInteractionGuards
模式**（避免重新发明轮子）。

**LOC 估**: ~50（新 panel class 40 + GameApp 注册 4 + index.html mount 6）。

### Step 5 — LLM Last-Attempt Inline Tooltip on storytellerStrip

**文件**: `src/ui/hud/storytellerStrip.js`, `src/ui/hud/HUDController.js`

**动作**: 在 Step 1 诊断的基础上做**轻量 UI**收束：tooltip 追加一个
"Last LLM attempt: <status> at <when>"：

- `source=llm` & no error → "Last LLM attempt: 2.3s ago (gpt-4o, 184ms)"
- `source=fallback` & lastPolicyError → "Last LLM attempt: 14.1s ago (failed: http 503)"
- `source=none` → "Last LLM attempt: never"

纯 tooltip，不改 strip 主文案。

**LOC 估**: ~15（model 字段一个 + HUDController tooltip 拼接分支）。

### Step 6 — AI Exchange Panel: Rolling Error Log

**文件**: `src/ui/panels/AIExchangePanel.js`

**动作**: 在 `renderExchangeCard` 下方新增 `renderErrorLogCard(title,
exchanges, keyPrefix)`：从 `state.ai.policyExchanges` 与
`state.ai.environmentExchanges`（两者已在 state，`.slice(0, 8)` ring
已有）过滤 `exchange.error || exchange.fallback`，渲染成：

```
Last 5 LLM errors:
  [18.5s]  policy    http 503  endpoint=/api/ai/policy  model=gpt-4o
  [32.1s]  environment  parse error: unexpected token  endpoint=/api/ai/environment
  [41.0s]  policy    guardrail: invalid group id  endpoint=/api/ai/policy
```

不新增 state 字段；**只读现成的 policyExchanges / environmentExchanges**
ring buffer。默认折叠（`<details>` 不带 `open`），防止 AI Exchange
panel 被淹没。

**LOC 估**: ~35（renderErrorLogCard 30 + AIExchangePanel.render 拼接 5）。

### Step 7 — 新测试

**文件**:
- `test/storyteller-strip-whisper-diagnostic.test.js`（新）
- `test/ai-policy-history.test.js`（新）
- `test/ai-policy-timeline-panel.test.js`（新）

**覆盖**:

1. storyteller-strip-whisper-diagnostic:
   - `llm-live` → `diagnostic.whisperBlockedReason === "LLM live — WHISPER active"`
   - `llm-stale` → "LLM stale — last tick failed guardrail"
   - `fallback-degraded` + proxyHealth=error → "LLM errored (<kind>)"
   - `fallback-healthy` + policyLlmCount=0 → "LLM never reached"
   - `idle` → "No policy yet"

2. ai-policy-history:
   - 首次 push：`state.ai.policyHistory.length === 1`
   - 相同 focus + source + Δt<5s → 不再 push
   - 不同 focus → push
   - 容量 32：第 33 条替换第 1 条
   - llm → fallback 切换（即使 focus 相同）→ push

3. ai-policy-timeline-panel:
   - 空历史 → "No policy changes yet."
   - 12 条历史 → 渲染 12 条最近（时间倒序）
   - 大于 12 条 → 只渲染前 12 条

**LOC 估**: ~75（3 测试文件平均 25）。

---

## 5. Step dependency DAG

```
Step 1 (LLM diagnostic overlay) ─────┐
Step 2 (policy history ring)   ───────┼── Step 4 (timeline panel)
                                      ├── Step 5 (last-attempt tooltip)
Step 3 (scenario-phase voice)   ──────┘
Step 6 (exchange error log)    [independent]
Step 7 (tests)                  [runs last, depends on all above]
```

---

## 6. Risks

- **R1 — policyHistory 写入频率**：NPCBrainSystem.update 在 ~10Hz policy
  tick 触发；32-entry ring 覆盖 ~160s，足够给 Timeline panel 读。若触发
  更频繁（BALANCE.policyDecisionIntervalSec 调小）需确认不 O(N) 退化。
  **缓解**：`policyHistory.slice(0, 32)` 每次切片 O(32) 已有界。
- **R2 — scenario.phase 可能未必持续推进**（feedback 暗示 "10 分钟都死在
  Plains"）：如果 phase 永远停在 "logistics"，刷新效果就失效。
  **缓解**：Step 3 在 "logistics" 内**额外引入一个 sub-phase tick**：
  按 `state.metrics.timeSec` 每 90s 切换 `logistics-early / logistics-mid /
  logistics-late` 三个子桶（文案可复用 openingPressure / hintAfterLogistics），
  保证玩家在 3 分钟内看到至少 2 次文案刷新。**但这样**会把 "phase bucket"
  复杂度加大 —— 只在 fallback path 做，llm path 不动；且不创建 state
  字段，纯 `timeSec / 90` 派生。
- **R3 — AIPolicyTimelinePanel 渲染抖动**：AIExchangePanel 已展示
  `#isUserInteracting` 守卫，我们复用同样的模式；无新问题。
- **R4 — R5 验证 RED 的结构 bench 回归**：不关本 plan —— 本 plan 完全不
  触碰 simulation/economy/npc/RoleAssignment 数值逻辑。Step 2 虽位于
  `src/simulation/ai/brains/NPCBrainSystem.js`，但只在**已存在的 pendingResult
  落盘分支后**追加一条 ring-buffer 写入（纯 observer，不改任何决策数值或
  policy 内容）；benchmark 应该 bit-identical。Validator 必须单独跑
  `--soft-validation --seed 42 --days 365` 前后对比 DevIndex 与 deaths，
  差值 > 0.5 则回滚 Step 2。
- **R5 — AIExchangePanel 已有 lastHtml 缓存**：Step 6 加 errorLogCard 会
  让 html 字符串更长更易变，需确认 `if (html === this.lastHtml) return`
  仍然有效（只在 error 新增时重渲染）。
- **R6 — 测试 fixture 复杂度**：Step 7 第 2 项需要构造 pendingResult
  shape，参考 Round 5 已有 `test/prompt-builder-summary-sanity.test.js`
  的 stub 模式。

---

## 7. 验证方式（Validator）

### 自动化

- `node --test test/*.test.js` —— 期望 1162 + 3 新 test suites，
  **pass / fail 比不变**（新增测试全绿，回归保持 0）。
- `scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains
  --max-days 365 --soft-validation` —— Step 2 前后 DevIndex 差 < 0.5。
- grep 回归：
  - `node --test test/hud-storyteller.test.js test/storyteller-strip.test.js
     test/prompt-builder-summary-sanity.test.js
     test/autopilot-status-degraded.test.js` —— 继承 Round 5 测试不破。

### 手动（Playwright smoke）

- 启动 `npx vite` → `http://127.0.0.1:5173/`。
- 开局 2 分钟：
  - 鼠标移到 storyteller strip 上 → tooltip 必须有
    `Why no WHISPER?: LLM never reached`（proxy 未配置时）
    或 `Why no WHISPER?: LLM errored (http <N>)`（proxy 配置失败时）。
  - storyteller summary 必须在 logistics → stockpile 转场时**刷新文案**，
    不再是全场一句定值。
- 打开 Debug 面板 → 点开 "Director Timeline" → 必须看到 ≥ 3 条
  时间倒序的 policy change 记录，每条带
  `[<ago>s ago] <badge> <focus> (<model>)` 格式。
- 打开 "AI I/O" → 必须看到 "Last LLM errors"（默认折叠）区域，
  展开后 ≥ 0 条记录（proxy OK 时 0 条；proxy 失败时 1-5 条）。

### 指标

- **LLM diagnostic 可答性**：对 4 种 badgeState + idle 共 5 种情况，
  `whisperBlockedReason` 字符串**人类可读**（≤ 80 字符，无 JSON / 无
  `undefined` / 无 raw error stack）。
- **Scenario voice 差异率**：同一 seed 下 3 张模板运行 3 分钟，
  `#storytellerSummary` 的 distinct 文本数 ≥ 2（Round 5 基线 = 1）。
- **Timeline 可读性**：`state.ai.policyHistory` 12 条记录渲染后，
  至少 3 条包含 badge 切换（llm-live ↔ fallback-healthy ↔
  fallback-degraded）。
- **Error log 完备性**：若 `state.ai.policyExchanges` 存在
  `exchange.error` 非空项，`#aiExchangePanelBody` 必出现 "Last N LLM
  errors" 段落；N ≤ 5。

---

## 8. 白名单（§4.12 Implementer 必读）

**可改文件**:
- `src/ui/hud/storytellerStrip.js`
- `src/ui/hud/HUDController.js`
- `src/simulation/ai/brains/NPCBrainSystem.js`
- `src/simulation/ai/llm/PromptBuilder.js`（仅 describeWorkerFocus +
  新 helper deriveScenarioPhaseTag，**不动** adjustWorkerPolicy 的 summary
  模板 —— Round 5 bc7732c 已完成且验证）
- `src/ui/panels/AIExchangePanel.js`
- `src/ui/panels/AIPolicyTimelinePanel.js`（新建）
- `src/entities/EntityFactory.js`（仅 ai.policyHistory 初始化）
- `src/app/types.js`（仅 PolicyHistoryEntry 类型定义）
- `src/app/GameApp.js`（仅 panel 注册）
- `src/world/scenarios/ScenarioFactory.js`（仅 export `exportScenarioVoiceForHUD`，
  不动已有 SCENARIO_VOICE_BY_TEMPLATE 表）
- `index.html`（仅 #storytellerWhyNoWhisper span + Director Timeline mount）
- `test/storyteller-strip-whisper-diagnostic.test.js`（新）
- `test/ai-policy-history.test.js`（新）
- `test/ai-policy-timeline-panel.test.js`（新）
- `CHANGELOG.md`

**不得改**:
- `src/simulation/ai/llm/PromptBuilder.js::adjustWorkerPolicy` summary 模板（Round 5 已定型）
- `src/simulation/ai/colony/ColonyPlanner.js`（Round 6 结构 refactor 领地）
- `src/simulation/npc/RoleAssignmentSystem.js`（Round 6 结构 refactor 领地）
- `src/config/balance.js`（Round 5 validator 已 revert 所有 tuning 尝试；禁止再动）
- 任何 `src/render/**`

---

## 9. Depth Mandate 自检（§4.10）

- **跨层触达 ≥ 2** ✓ — `simulation/ai/brains/NPCBrainSystem.js` +
  `simulation/ai/llm/PromptBuilder.js`（simulation 层）+
  `ui/hud/**` + `ui/panels/**`（ui 层）= 2 个系统层。
- **LOC ≥ 80** ✓ — 估算总 LOC delta ~210（Step 1: 60 + Step 2: 45 +
  Step 3: 45 + Step 4: 50 + Step 5: 15 + Step 6: 35 + Step 7 tests: 75 =
  ~325；减去注释和空行后 delta ~210）。
- **≥ 50% step 改变行为** ✓ — Step 2（新 ring buffer + policyHistory
  emitter）/ Step 3（scenario-phase lookup algorithm）/ Step 4（new panel
  class + render loop subscription）/ Step 6（new render branch）都是新行
  为；Step 1 / Step 5 是 diagnostic 暴露（属行为，非 copy-only）。
  纯 copy 变更 = 0 条。行为比例 = 6/6 = 100%。
- **非 "单挑一条"** ✓ — Coverage Matrix 显示 6 FIXED，不是仅一个 P0。

---

## 10. HW06 Freeze 自检（§4.7）

- ❌ 新建筑 — 无
- ❌ 新 tile — 无
- ❌ 新工具 — 无
- ❌ 新音频资产 — 无
- ❌ 新教程关卡 — 无
- ❌ 新胜利条件 — 无
- ❌ 新 score 系统 — 无
- ❌ 新 mood / grief / relationship mechanic — 无

**边界判定**:
- AIPolicyTimelinePanel 是"把 state 里已有 ring 暴露给玩家读"，
  **不是新叙事机制**；同类先例 = AIExchangePanel（已在 Round 0 之前
  就有）。
- scenario-phase 驱动 summary 刷新是"把 scenario.hintCopy 里已有的
  afterLogistics / afterStockpile 文字路由到 HUD"，**不是新叙事系统**；
  hintCopy 本身 Round 5 既有。
- WHISPER 诊断是"把 lastPolicyError / proxyHealth / policyLlmCount
  已在 state 的字段组合成人类可读句子"，**不是新 AI 机制**。

**结论**: 全部在 summary §6 明确允许的 "降级语义透明化 + 暴露既有
diagnostic" 范围内。

---

## 11. UNREPRODUCIBLE 标记

不适用。本 plan 每一项改动的数据源都通过**静态代码审查**验证已在 state 存在：

- `state.ai.lastPolicyError` — EntityFactory:611
- `state.metrics.proxyHealth` — NPCBrainSystem:317 赋值
- `state.ai.policyLlmCount` / `policyDecisionCount` — EntityFactory:619-621
- `state.ai.policyExchanges` / `environmentExchanges` — EntityFactory:630-631
- `state.gameplay.scenario.phase` / `hintCopy` — ScenarioFactory:23-78,
  953-955
- `state.ai.lastPolicySource` — NPCBrainSystem:307
- `state.ai.groupPolicies` Map — EntityFactory:622

新字段只有 `state.ai.policyHistory: []`（Step 2），纯 append-only ring。
