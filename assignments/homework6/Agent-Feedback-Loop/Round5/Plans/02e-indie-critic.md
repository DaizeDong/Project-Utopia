---
reviewer_id: 02e-indie-critic
feedback_source: Round5/Feedbacks/02e-indie-critic.md
round: 5
date: 2026-04-22
build_commit: 61ddd8a
priority: P0
estimated_scope:
  files_touched: 4
  loc_delta: ~220
  new_tests: 2
  wall_clock: 75
conflicts_with: []
---

## 1. 核心问题

Reviewer 02e（indie-critic，4/10）表层诉求是"蓝色贴图丑 + 加 BGM + 换美术"，但这些都属于 HW06
Round 5 明确 D5 拒绝的诉求（summary.md §6 freeze list 第 1/10 条）。因此必须挖到 02e 自己点名
的**深层洞察**作为根因：

1. **作者声音被工程日志腔调压住 95%**（feedback §三、§七评分扣分项 -2）。作者在
   `scenario.title`、help panel、`kitchen` tooltip 里写出过"Threat is the cost of being late"、
   "The danger is not distance but exposure"、"the difference between a stocked warehouse and
   workers starving beside it" 这种**能直接当 Steam tagline** 的句子；但玩家 95% 时间看的是
   HUD 中间那条 **storyteller strip**，它显示的是 `PromptBuilder.js:126 describeWorkerFocus`
   产出的**函数式 focus 词组**（"push the frontier outward"、"clear the stalled cargo"），并
   被 `storytellerStrip.js:147 humaniseSummary` 规则链二次重写后拼进模板
   `"Workers should sustain <focus> while keeping hunger and carried cargo from overriding the
   map's intended reroute pressure"`（`PromptBuilder.js:322-324`）。这个模板**没有任何作者
   文学冲动**，且与 fallback 叙述路径共用，所以**作者声音永远不会到达玩家眼睛**。

2. **WHISPER / DIRECTOR / DRIFT 三档徽章语义在 LLM 不可用时欺骗玩家**
   （feedback §三末段 + §七 "+1 for authorial intent"；summary.md §2 P0-3 命中 5 人）。
   当 LLM HTTP 503（02a/01e/02d 实测：整场 WHISPER 从未亮起），
   `storytellerStrip.js:237 computeStorytellerStripModel` 只要 `groupPolicies.workers` 有数据
   就降为 `mode="fallback"` / 前缀 "DIRECTOR"；玩家看不到"当前是降级路径、为什么降级、什么
   时候会恢复"。WHISPER 徽章在代码里存在、在 CSS 里染色、在 help 文案里承诺，但**运行时
   永远不亮** —— 这就是 02e §七 "+1 for WHISPER/DIRECTOR/DRIFT bold design" 与扣分的矛盾
   来源："作者押注最大的设计选择，在玩家看到的层全部落空"。

3. **fallback 路径叙述复合 bug —— "sustain reconnect the broken supply lane while keeping
   empty bellies and full backpacks from overriding..." 半句泄漏**
   （summary.md §2 P0-3 bullet 2 引玩家截屏原文）。根因是
   `humaniseSummary` 的规则链被组合应用：`focus` 已经是
   "rebuild the broken supply lane"（`PromptBuilder.js:131`），塞入模板得到
   "Workers should sustain rebuild the broken supply lane while keeping hunger and carried
   cargo..."，然后 humaniseSummary 命中四条 rule（
   `rebuild the broken supply lane` → `reconnect the broken supply lane`；
   `workers should` → `the colony should`；
   `hunger and carried cargo` → `empty bellies and full backpacks`；
   最后模板被裁到第一个句号而丢失后半句），最终拼出**语法错乱 + 半句截断 + 两图共用**的
   观感。这是纯文本 bug，HW06 freeze 允许动 humaniseSummary / fallback 文案。

三条根因都指向**同一个系统面**：`storytellerStrip → PromptBuilder.describe*Focus/adjust*Policy
→ HUDController badge render` 这条链路上的**文本腔调与降级语义**。

---

## 2. Suggestions（可行方向）

### 方向 A: Authorial Voice Pack — 把 scenario/help/building tooltip 里已有的作者文案反注入 storyteller strip，并把徽章状态重写成人话

- 思路：新增一个小型内部 "voice pack"（纯 JS 对象，不走 LLM），把作者在其他位置已经写过
  的高质量短句按「地图 × focus 类型」索引；`computeStorytellerStripModel` 在拿到
  `focus/summary` 后**先尝试 voice pack 命中**，命中则覆盖 `summaryText`；未命中走回现有的
  humaniseSummary 残句兜底。徽章状态同时改写：`mode="fallback"` 时 prefix 保持 "DIRECTOR"
  但附加 dataset.state="fallback-healthy"；当 `ai.lastPolicyError` 非空或
  `metrics.proxyHealth` 为 503/error 时切 dataset.state="fallback-degraded"，HUD 文本加
  "LLM offline — rule director in charge" 一行。WHISPER 真正点亮的条件收紧到
  `source === "llm" && !lastPolicyError`。
- 涉及文件：`src/ui/hud/storytellerStrip.js`（~120 LOC 新增 voice pack + 状态派生）、
  `src/ui/hud/HUDController.js`（~30 LOC badge dataset/aria-label 加状态语义）、
  `src/simulation/ai/llm/PromptBuilder.js`（~15 LOC 修复 summary 模板的"sustain <focus>"
  双动词 bug）、`test/storyteller-strip.test.js`（增补 case）
- scope：中
- 预期收益：
  - 玩家 HUD 中间那条最吸引眼球的 strip，从 "Workers should sustain reconnect the broken
    supply lane while keeping empty bellies..." 的工程残句，切到
    "The danger is not distance but exposure — hold the gates before raiders find the breach"
    这种作者真声；
  - WHISPER 徽章第一次有**真诚的降级语义**（fallback-degraded ≠ fallback-healthy ≠ llm），
    不再"假装 DIRECTOR 在工作"；
  - 02e §七扣分的 -2（工程日志压住作者 95%）+ -1（Vian-25 半成品情感）的一部分被结构性回
    收；summary.md §2 P0-3 命中的 prompt 残句 bug 被治本。
- 主要风险：
  - voice pack 文案可能在非预期 scenario 组合下被错误命中（需要 fallthrough 保底）；
  - 现有 `test/storyteller-strip.test.js` / `test/hud-storyteller.test.js` 断言了具体字符串，
    会被迫更新；
  - "WHISPER 真正点亮" 条件收紧后，如果 LLM proxy 曾经短暂返回过 200，旧 fixtures 可能从
    WHISPER 退到 DIRECTOR，造成测试噪声（需一次性 golden 更新）。

### 方向 B: Fallback Narration Synthesizer — 让 fallback 路径在 LLM 503 时自生成一段"谁在做决定 + 为什么 + 下一步"的短自述，不再复用 LLM 模板残句

- 思路：在 `NPCBrainSystem.js:305` 组装 `state.ai.lastPolicySource="fallback"` 的同时，挂
  一段**完全独立的 fallback narrator**，把当前 `policy.focus` / `buildQueue` /
  `steeringNotes` / 最近 `eventTrace` 的前 1 条组合成"In this lull, the director falls back
  to rule: <X>, next it will <Y>"，写进 `policy.summary`。把 PromptBuilder 那条双动词
  "Workers should sustain <focus>" 彻底弃用于 fallback 路径。徽章在降级时显式写 "DIRECTOR
  (rule fallback, LLM offline)"。
- 涉及文件：`src/simulation/ai/llm/PromptBuilder.js`（删除 fallback 路径的 summary 模板，新
  增 `buildFallbackNarration` export）、`src/simulation/ai/brains/NPCBrainSystem.js`（调用点
  ~6 LOC）、`src/ui/hud/storytellerStrip.js`（tweaks ~20 LOC）、`src/ui/hud/HUDController.js`
  （徽章文本 ~10 LOC）
- scope：中-大
- 预期收益：
  - 根治残句 bug（因为 fallback 不再走 LLM 风格模板）；
  - 让 "凌晨三点 devlog" 的气质保留，但把腔调从 "throughput 工单" 改回"作者视角的系统播
    报"；
  - 玩家读得懂 "为什么现在 COOK=0"、"为什么 fallback 在堆 FARM"——切入 02e §二末段
    "Vian-25 没戏剧感" 的因果断层。
- 主要风险：
  - 和方向 A 在 prompt 层改动更深，回归面更广；
  - `NPCBrainSystem` 是 ECS 顺序敏感位置，任何改动都需要跑 benchmark 回归；
  - fallback 叙述生成逻辑若 unbound，容易滑坡成 "第三套模板"（需要 guardrails）；
  - 可能触发 `test/npc-brain-*`、`test/prompt-payload.test.js` 等不止 2 个测试文件。

---

## 3. 选定方案

**选方向 A**。理由：

1. **scope 可控**：A 是"在现有 storytellerStrip.js 前置一层 voice pack + HUDController
   dataset 多一种状态值"，不动 ECS 关键路径（NPCBrainSystem.applyPendingResult），不碰
   promise/latency 面，Coder 执行风险显著低于 B；
2. **对 02e 本质诉求命中度更高**：02e 的核心指控是"作者的漂亮话被压住"——A 直接把作者已
   存在的漂亮话（scenario.meta、Kitchen tooltip、help "Threat & Prosperity"段）反注入到玩家
   最常看的那条 strip，这**就是** 02e §三想要的东西；B 是在造"第三套"叙述语气，反而可能
   离 02e "已经写得很好的句子为什么不用" 更远；
3. **HW06 freeze 合规**：只改 fallback 叙述文案、徽章状态文字、humaniseSummary —— 全部在
   Runtime Context 第 3 条显式放行范围内，且不跨过"不改美术 / 不加 BGM / 不新增 LLM 模型"
   的硬线；
4. **与 P0-1 / P0-2 正交**：summary.md §2 列出 P0-1（fallback planner 配额）/ P0-2（worker
   inspector 观察闭环）/ P0-3（DIRECTOR 透明化），方向 A 严格锁定 P0-3，不触碰 ColonyPlanner
   配额或 EntityFocus —— 避免与其他 enhancer plan 的 conflicts_with（留空）；
5. **可度量**：方向 A 天然给出两个硬指标（见 §6）：(a) storyteller strip 渲染文本中"作者声
   音短句"占比 ≥ 60%；(b) fallback 路径下 HUD 文本 ≠ 模板残句占比 = 100%。

---

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/hud/storytellerStrip.js:function humaniseSummary` — edit —
  把第 157 行规则 `/push the frontier outward/gi → "push the frontier outward while keeping
  the rear supplied"` **删除**（这条是致 PromptBuilder.summary 模板复合爆炸的 co-author），
  并在 `humaniseSummary` 入口加前哨：如果 `raw` 已经以 `"sustain "` 或 `"the colony should
  sustain "` 开头且其后立刻跟另一个动词（"rebuild/reconnect/clear/keep/run/hug/strike"），
  直接吞掉前导 `"(the colony should )?sustain "`，避免 "sustain rebuild" 双动词。

- [ ] **Step 2**: `src/ui/hud/storytellerStrip.js:buildTemplateTag`（在其上方新增） — add —
  新增常量 `AUTHOR_VOICE_PACK`（frozen object），按 `state.world.mapTemplateId × focusTag`
  索引到短句，例如：
    - `fortified_basin × broken-routes` → "The danger is not distance but exposure — hold the
      gates before the breach finds them."
    - `archipelago_isles × stockpile` → "One missed bridge leaves the island chain broken and
      idle — keep the larder moving across water."
    - `rugged_highlands × frontier` → "Every cleared route becomes a gate you must hold."
    - `temperate_plains × cargo-stall` → "A stocked warehouse and workers starving beside it
      — clear the cargo before that gap opens."
    - 默认桶 `* × *` → "Threat is the cost of being late — keep the chain reinforcing itself."
  **所有文案必须来自已经写好的 scenario.meta/help 面板/building tooltip**（不新增作者原创
  叙述，避免跨 freeze）。

- [ ] **Step 3**: `src/ui/hud/storytellerStrip.js:computeStorytellerStripModel` — edit —
  在 `focus/summary` 解析后、`humaniseSummary` 调用前，新增一段 "voice pack lookup"：
    - 先从 `focus` 字符串派生一个 `focusTag`（"broken-routes" / "cargo-stall" / "stockpile" /
      "frontier" / "safety" 之一），未命中则 `"default"`；
    - 用 `(mapTemplateId, focusTag)` 查 `AUTHOR_VOICE_PACK`，命中则 **用作者句覆盖**
      `summaryText`，并把 `model.voicePackHit = true` 标记；
    - 未命中走现有 humaniseSummary 兜底。
  depends_on: Step 2

- [ ] **Step 4**: `src/ui/hud/storytellerStrip.js:computeStorytellerStripModel` — edit —
  **徽章状态三分裂**：在 mode 决定后追加派生字段 `badgeState`：
    - `source === "llm"` 且 `lastPolicyError` 空 → `badgeState="llm-live"`
    - `source === "llm"` 且 `lastPolicyError` 非空 → `badgeState="llm-stale"`
    - `source === "fallback"` 且 `(metrics.proxyHealth === "error" || lastPolicyError)` →
      `badgeState="fallback-degraded"`
    - `source === "fallback"` 普通情况 → `badgeState="fallback-healthy"`
    - 否则 → `badgeState="idle"`
  把 `badgeState` 加入 return 对象。**`prefix` 仅在 `badgeState==="llm-live"` 时才返回
  "WHISPER"**（其他 llm-stale 也降回 DIRECTOR），治本"WHISPER 徽章从不亮" 的欺骗感。
  depends_on: Step 3

- [ ] **Step 5**: `src/ui/hud/HUDController.js:722-842`（storyteller render 块） — edit —
  读取 `model.badgeState`，写入 `getBadgeEl.dataset.state`（新字段，独立于现有
  `dataset.mode`）；当 `badgeState==="fallback-degraded"` 时在 `tooltipText` 前缀加
  "[LLM offline — rule director in charge] " 一句；`summaryWithSeparator` 前若
  `model.voicePackHit === true` 追加 `aria-label="author-voice"` 辅助选择器以供测试断言。

- [ ] **Step 6**: `src/simulation/ai/llm/PromptBuilder.js:322-324`
  （`adjustWorkerPolicy` 尾部 summary 赋值） — edit — 把
  `Workers should sustain ${focus} while keeping hunger and carried cargo from overriding the
  map's intended reroute pressure.` 模板拆分为两条短句：
    - 第一句只含 focus："Focus: ${focus}."
    - 第二句给条件：只在 `notes.length > 0` 时追加 notes 的第 1 条 + `"."`
  不再用 "sustain <focus>" 前缀（杀掉根因 bug）。同步 trader / saboteur 对应行
  (`L362-363`, `L401-402`) 做相同去"sustain"化。

- [ ] **Step 7**: `test/storyteller-strip.test.js` — edit — 新增三个 case：
    - (a) `mode: fallback`, focus `"rebuild the broken supply lane"`, mapTemplateId
      `"fortified_basin"` → 期望 `summaryText` 命中 voice pack（`"danger is not distance but
      exposure"` 子串出现）；
    - (b) `source: "llm"` + `lastPolicyError: "HTTP 503"` → 期望 `prefix === "DIRECTOR"` 且
      `badgeState === "llm-stale"`（不再错误地亮 WHISPER）；
    - (c) 任意 fallback 输入下，`summaryText` 不得同时包含子串 `"sustain"` 和 `"reconnect"`
      （防 bug 回归）。
  depends_on: Step 1, Step 3, Step 4, Step 6

- [ ] **Step 8**: `test/prompt-payload.test.js` — edit — 若存在断言
  `"Workers should sustain"` 或 `"while keeping hunger and carried cargo"` 的 golden
  fixture，按新模板更新（Step 6 去 sustain 化后的短句）。若无相关断言则跳过本步。
  depends_on: Step 6

---

## 5. Risks

- **R1 现有测试回归**：`test/storyteller-strip.test.js` 与 `test/hud-storyteller.test.js` 会有
  字符串断言失败（Step 1 humaniseSummary 删规则 + Step 6 summary 模板重写）——需 golden
  更新，不是行为回归，但 Coder 必须逐条 diff 核对而非盲 accept。
- **R2 voice pack 未命中 fallthrough 不当**：若 `focusTag` 派生不稳，可能退回到 humaniseSummary
  的残句路径，玩家感知改善 ≈ 0。需要测试用例 (a) + 手动验证覆盖 6 个 mapTemplateId × 5
  focusTag 组合（30 桶，全命中或默认桶兜底 100%）。
- **R3 WHISPER 点亮条件收紧的可观测副作用**：若 LLM proxy 偶尔返回 200 但
  `lastPolicyError` 是上一 tick 残留，badge 会一帧来回抖动。需要在
  `NPCBrainSystem.js:305` 成功路径显式清 `lastPolicyError=""`（如已清则无需动）。
- **R4 跨 enhancer 冲突可能**：若 02d-roleplayer enhancer 也动 `storytellerStrip.js` 的
  `extractLatestNarrativeBeat` / `formatBeatText`，Coder 合并时需把 voice pack 与 beat 并存
  （voice pack 覆盖 summary，beat 继续走独立 `#storytellerBeat` span，两者不共享 DOM 节
  点，逻辑上独立）。
- **R5 可能影响的现有测试**：`test/storyteller-strip.test.js`、`test/hud-storyteller.test.js`、
  `test/prompt-payload.test.js`（可能）、任何 assert `ai.lastPolicySource` 文案为 "llm" 时
  即 WHISPER 的测试（grep 未直接命中，但保守列出）。

## 6. 验证方式

- **新增测试**（包含在 Step 7 里，不是独立文件）：`test/storyteller-strip.test.js` 扩展三个
  case（voice pack 命中 / WHISPER 降级 / sustain+reconnect 组合禁止）。
- **可度量指标 1 — 作者声音反注入命中率**：在手动复现 02e 走过的 4 张图（Temperate Plains /
  Rugged Highlands / Archipelago Isles / Fortified Basin）各跑 3 分钟 autopilot，采样
  `#storytellerSummary.textContent`，**voice-pack-hit 标记的文本占比必须 ≥ 60%**（目标：玩
  家看到的 strip 文本大部分是作者原话而非工程模板）。
- **可度量指标 2 — 残句 bug 根绝**：fallback 路径下渲染的 `summaryText` **同时包含
  "sustain" 与 "reconnect"/"rebuild"/"clear"** 的频率 = 0（Step 1 + Step 6 双保险，Step 7
  case (c) 自动化断言）。
- **可度量指标 3 — 徽章降级诚实度**：当 `state.ai.lastPolicyError` 非空时，HUD 徽章文本
  **不得**为 "WHISPER"；当 `metrics.proxyHealth==="error"` 时，`getBadgeEl.dataset.state`
  必须为 `"fallback-degraded"`（Step 7 case (b) + 手动触发 proxy 断网验证）。
- **手动验证**：`npx vite` → `http://localhost:5173` → 点 Fortified Basin → 按 P 暂停看初始
  strip 是否出现 "The danger is not distance but exposure" 子串；按 L → 保持 autopilot ON →
  2 分钟内 strip 至少切换到一次 voice pack 命中的句子；DevTools 断网 `/api/ai-proxy/*` →
  badge 应切到 DIRECTOR + dataset.state=fallback-degraded + tooltip 含 "LLM offline"。
- **benchmark 回归**：`node --test test/*.test.js` 必须 green（预期 `storyteller-strip` /
  `hud-storyteller` / 可能 `prompt-payload` 需更新断言，但新断言 green）；
  `scripts/long-horizon-bench.mjs` seed 42 / temperate_plains，**DevIndex 不得低于 42**
  （当前 v0.8.1 基线 44，本 plan 纯文本层不应影响 DevIndex，留 -5% 缓冲即 42 为下限）。

## 7. UNREPRODUCIBLE 标记

不适用。02e 截的 4 张图 + feedback §三列出的四段开场文案 + summary.md §2 P0-3 bullet 2
直接引的玩家可见残句 "sustain reconnect the broken supply lane while keeping empty bellies
and full backpacks from overriding the map's intended reroute pres..."，与
`PromptBuilder.js:322-324` 模板 + `storytellerStrip.js:147-174 humaniseSummary` 规则链组合
严格对应；Playwright 端未开启本轮复现会话（本任务预算内不必要），但代码级复现链已通过
static trace 完整建立。
