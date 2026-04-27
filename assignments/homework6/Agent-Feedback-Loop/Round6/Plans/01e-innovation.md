---
reviewer_id: 01e-innovation
feedback_source: assignments/homework6/Agent-Feedback-Loop/Round6/Feedbacks/01e-innovation.md
round: 6
date: 2026-04-25
build_commit: 5622cda
freeze_policy: lifted
priority: P1
estimated_scope:
  files_touched: 8
  loc_delta: ~520
  new_tests: 4
  wall_clock: 95
conflicts_with: []
---

## 1. 核心问题

Reviewer (4/10) 把所有 findings 收敛到三个根本病因，全部围绕"作为 AI-native colony sim 的差异化承诺没有被翻译成玩家体验"：

1. **决策透明面板是 dev console 漏出来的字符串，不是叙事**。`Carry pressure has been building for 5.8s, so the worker is being pushed back toward a depot.` / `Group AI is currently biasing this unit toward seek_task.` 这种第三人称 + 数字 + 系统术语，技术力 8 分玩家感知 3 分。它是 `WorldExplain.getEntityInsight` 直接拼装的英语句子，没有人格化包装层。**根因**：缺少 `(insight)→(in-character voice)` 的转换器；`EntityFocusPanel` 的 `Why is this worker doing this?` 块直接渲染 `entityInsights.join(" | ")`。
2. **Saboteurs / WHISPER 这种"卖点 faction/AI"在地图上完全不可见**。Reviewer 在 5 分钟里只看到 debug HUD 文字 "saboteurs:strike a soft frontier corridor" 和地面上的小红点，没有看到 sabotage 事件被叙事化、saboteur 单位被标记为"另一派系"、也没有 LLM 写出来的人格化叙事（fallback 文字模板每个 colony 一样）。**根因**：(a) `VisitorAISystem` / `SceneRenderer` 没有把 saboteur 与 trader / herbivore 在视觉/UI 上做差异化广告；(b) `storytellerStrip.AUTHOR_VOICE_PACK` 是一组每张地图静态的 fallback 文案，跑完一两次就重复；(c) sabotage runs 没有被 promoted 成 storytellerStrip 的 `beatText` 之外的"事件式叙事条"。
3. **整套 UI 漏出中文 / dev 字符串**。`index.html:1918` `物流图例 (Logistics Legend)` summary、其后 7 行 `● 红圈 = 物资过剩 (heat_surplus)` 等中文标签直接在英文 UI 出现；`Why no WHISPER?: LLM never reached / LLM quiet — fallback steering` 类诊断字符串虽然准确但不"角色化"，跟 reviewer 的另一条吐槽（"AI 没跑通"）叠加成"产品形态破绽"。**根因**：i18n 没有完成；`storytellerStrip.computeStorytellerStripModel` 的 `whisperBlockedReason` 字符串以 dev 措辞为主，没有 in-world 包装。

本轮 freeze_policy=lifted，允许引入"in-character narrator pack" 作为新机制。我把 P1 划给 (1) — 决策透明的角色化包装是 reviewer 给出的最大单一改善建议（"信息一样，叙事价值是 5×"），P1 同时附带 (3) i18n 卫生（成本极低，~30 LOC，必须做），(2) 留作 P2 follow-up（saboteur 视觉差异 + 新事件叙事条）。

## 2. Suggestions（可行方向）

### 方向 A: In-Character Voice Pack (角色化决策透明)
- 思路：把 `WorldExplain.getEntityInsight` 输出的第三人称英文句子在显示层翻译成"工人内心独白"（第一人称），保留原文作为 dev-profile / hover tooltip。新增 `src/ui/interpretation/EntityVoice.js`，导出 `humaniseInsightLine(line, entity, profile)`：根据 line 起始词（"Local logistics rule sees…", "Carry pressure has been building…", "Target warehouse currently has…", "Group AI is currently biasing…", "Wildlife pressure is suppressing…"）做模式匹配，回写成第一人称的"我背的太多了，得去仓库放下"风格；`entity.displayName` / `entity.role` 用作主语线索。`EntityFocusPanel.#whyBlock` 在 casual profile 下渲染人格化版本，dev profile 下保留原文。同时给 `storytellerStrip.AUTHOR_VOICE_PACK` 扩 4 倍 entries（每张地图 6 条 vs 现在 1-3 条），按 `state.metrics.timeSec` round-robin 选择，避免每个 colony 看到完全一样的句子。
- 涉及文件：
  - 新增 `src/ui/interpretation/EntityVoice.js` (~150 LOC)
  - 编辑 `src/ui/panels/EntityFocusPanel.js:505-513` (whyBlock + Decision Context 渲染)
  - 编辑 `src/ui/hud/storytellerStrip.js:211-243` (AUTHOR_VOICE_PACK 扩容 + round-robin select)
  - 修复 `index.html:1918-1927` (中文 → 英文)
  - 编辑 `src/ui/hud/storytellerStrip.js:478-500` (whisperBlockedReason → in-world 文案)
  - 新增 `test/entity-voice.test.js`, `test/storyteller-voicepack-roundrobin.test.js`, `test/i18n-no-cjk-in-html.test.js`
- scope：中
- 预期收益：reviewer 给的 +5× 叙事价值预期；解决 finding §2.1 / §2.2 / §九 / §十 的"假装是 LLM 但其实是模板"问题；不用真的让 LLM 调通也能让玩家感觉到"AI 写的"。
- 主要风险：voice pack 写得不好会更尴尬（templated whimsy 比工程语言更糟）；如果第一人称改写规则覆盖不全，会出现混合人称页面；扩容 voice pack 的 round-robin 索引必须用 deterministic seed，否则 snapshot 测试 (`test/hud-storyteller.test.js`) 会 flaky。

### 方向 B: Saboteur Visibility Pass (派系存在感 / 新事件叙事条)
- 思路：把 sabotage event 从 dev log 提到玩家可视化。三件事：(a) `VisitorAISystem` 在 sabotage cooldown=0 / 即将发动时把工事写进 `state.events.active` 用一个新 EVENT_TYPE.SABOTAGE_RUN（已有 SABOTAGE 标签于 storyteller beat，但没有 active event 表条目），让 `EventPanel` 能看到；(b) `SceneRenderer` 给 saboteur visitor 加一个常驻 outline / billboard（已有 `visitorSaboteur` glb，但没有派系标签）；(c) 在 `storytellerStrip.AUTHOR_VOICE_PACK` 加一个 sabotage-tag bucket，让 fallback storyteller 能讲出"a third party is staging at the south depot"这种叙事。
- 涉及文件：`src/simulation/npc/VisitorAISystem.js`, `src/render/SceneRenderer.js`, `src/world/events/WorldEventSystem.js`, `src/config/constants.js`（EVENT_TYPE 新增）, `src/ui/panels/EventPanel.js`, `storytellerStrip.js`
- scope：大
- 预期收益：解决 finding §2.3 / §三第3条（玩家动机钩子）/ §三第5条（AI 人格）。让"3 派系 LLM 控制"从 debug log 变成可见事件。
- 主要风险：跨 5 个系统改动 → `test/visitor-pressure.test.js` / `test/event-log-rendering.test.js` / 现有 `test/state-graph.test.js` 都有 sabotage 相关 fixture 可能受影响；新增 EVENT_TYPE 会牵动 `EventPanel` / 序列化 / snapshot 兼容性；renderer outline pass 容易和 v0.8.2 的 Heat Lens halo overlay 冲突。需要 4-seed bench 重跑成本比 A 大。

### 方向 C: Worker Daily Diary (LLM 第一人称内心独白)
- 思路：让 LLM 真的为每个被 inspect 的工人产出 1 行 in-character 内心独白；缓存到 `entity.memory.diaryLine`，`EntityFocusPanel` 渲染。LLMClient 新增 `requestWorkerDiary(entity, contextSummary)` 端点，复用现有 fallback 模板兜底。
- 涉及文件：`src/simulation/ai/llm/LLMClient.js`, 新增 `src/simulation/ai/llm/PromptBuilder.js` 中 `buildDiaryFallback`, `src/ui/panels/EntityFocusPanel.js`, `src/config/aiConfig.js`（新端点配置）
- scope：大
- 预期收益：兑现 reviewer §五.4 第一条建议；如果 LLM 跑通就是 7/10 的关键拼图。
- 主要风险：(a) LLM 现在 100% fallback（429）→ 上线就是空诺；(b) 每工人一个 LLM 调用 = O(N) per inspect，会进一步 trigger 限流；(c) fallback 文案如果模板化又会被同一个 reviewer 在 Round 7 吐槽"还是模板"；(d) 完全新机制，违反 "不要 gold-plate"。

## 3. 选定方案

选 **方向 A：In-Character Voice Pack**，理由：

- **杀伤面最广**：一次性命中 reviewer 评分模型里 §2.1（决策透明面板）+ §2.2（DIRECTOR 模板感）+ §3.5（AI 没人味）+ §3.9（i18n）这 4 条 — 相当于 4/10 直接抬到目标 6/10 的最短路径。
- **不依赖 LLM 跑通**：reviewer 第 10 条明确说"它最大的卖点是 LLM AI，但 LLM 在我整场 review 里没成功调用一次"。在 LLM 跑通前，方向 A 是把"假装是 LLM"的 fallback 显式当成 in-character narrator 来包装，从工程角度更老实，也更可控。
- **scope 可控**：~520 LOC，4 个测试文件，不动 `src/benchmark/**` / `scripts/long-horizon-bench.mjs` / `package.json` / `vite.config.*`，符合 freeze_policy=lifted 的边界约束（边界禁动）。
- **不破坏 prior work**：v0.8.2 Round-5b Wave-1 引入的 `whisperBlockedReason` / `policyHistory` / AIPolicyTimelinePanel 全部保留，本计划只是把 5 个 dev 字符串重写成 in-world 措辞。
- **方向 B 留给 P2**：saboteur 可见性需要跨 5 系统重构 + 新 EVENT_TYPE，本轮如果搭进去 LOC 估到 ~1200，risks 列表翻倍。先把"AI 有没有人味"这条解决，下轮再做派系可视化。

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/interpretation/EntityVoice.js`（新文件，~150 LOC）— `add` — 导出三个纯函数：
  - `humaniseInsightLine(rawLine: string, entity, opts?: { profile, displayName }) → string`：识别 `WorldExplain.getEntityInsight` 产出的 9 类句式（"Local survival rule is prioritizing food access…", "Local logistics rule sees X carried…", "Carry pressure has been building for X.Xs…", "Target warehouse currently has N inbound…", "Wildlife pressure is suppressing the target farm…", "Group AI is currently biasing this unit toward STATE.", "Trader is favoring LABEL…", "Saboteur is pressuring LABEL…", "Worker is still in a gather loop…"），用 entity.displayName 做主语，回写成第一人称 + 工人 voice（e.g. `Carry pressure has been building for 5.8s, so the worker is being pushed back toward a depot.` → `I've been hauling for nearly 6 seconds — time to drop this load at the depot.`）。
  - `humaniseGroupVoice(focus: string, role: string) → string`：把 `seek_task` / `harvest` / `deliver` 这类 state 名翻译成"swing back to find work" / "head out to gather" / "haul this back to base"。
  - `pickVoicePackEntry(bucket: string[], seed: number) → string`：deterministic round-robin（`seed % bucket.length`），用于 storytellerStrip。
  - 文件头注明：所有改写必须保留信息（数字 / 标签 / 状态名仍可读），只是把"系统分析"改为"工人独白"。

- [ ] **Step 2**: `src/ui/panels/EntityFocusPanel.js:505-513`（`#whyBlock` 渲染）— `edit` — 在 `entityInsights.join(" | ")` 前用 `import { humaniseInsightLine } from "../interpretation/EntityVoice.js"` 包装：每条 line 通过 `humaniseInsightLine(line, entity, { profile: this.state.controls?.uiProfile })` 转换。dev profile (`uiProfile === "dev"`) 直接渲染原文（保留可调试性）；casual / 默认 profile 渲染人格化版本。`entity.blackboard?.aiTargetState` 那行同样通过 `humaniseGroupVoice` 包装（"Group AI is biasing this unit toward seek_task" → "The colony's plan is pushing me back to find work").
  - depends_on: Step 1

- [ ] **Step 3**: `src/ui/hud/storytellerStrip.js:211-243`（`AUTHOR_VOICE_PACK` 扩容）— `edit` — 把每张地图模板的 default bucket 从 1 条扩到 4-6 条，broken-routes / cargo-stall / stockpile / frontier / safety 每个 tag 至少 2 条候选；新增 `sabotage` tag bucket（5 条候选，描述 saboteur 在地图各处 staging 的 in-world 文案，例如 "Hooded riders left tracks near the southern depot — keep eyes on the wall."）。`lookupAuthorVoice` 改签名返回 `string[]`（不是单 string），由调用方 `computeStorytellerStripModel` 用 `pickVoicePackEntry(bucket, Math.floor(state.metrics.timeSec / 30))`（每 30s 切一句）选当前条。
  - depends_on: Step 1

- [ ] **Step 4**: `src/ui/hud/storytellerStrip.js:478-500`（`whisperBlockedReason` 文案）— `edit` — 把 5 条 dev 字符串改为 in-world 包装但保留诊断信息：
  - `"LLM live — WHISPER active"` → `"WHISPER on air — the storyteller is listening."`
  - `"LLM stale — last tick failed guardrail"` → `"WHISPER hesitated — the storyteller's last word didn't land cleanly."`
  - `"LLM errored (http)"` → `"WHISPER offline — the storyteller's line dropped (proxy error). Director is taking the wheel."`
  - `"LLM quiet — fallback steering"` → `"WHISPER quiet — the Director is calling shots from the rule book tonight."`
  - `"LLM never reached"` → `"WHISPER asleep — the Director has held the floor since the colony woke."`
  - `"No policy yet"` → `"The colony hasn't drawn its first breath yet."`
  - 同时在 `diagnostic` 子对象里**保留** `whisperBlockedReasonDev`（原 5 条字符串）用于 dev profile / `AIExchangePanel` 错误日志，保证现有 `test/storyteller-strip-whisper-diagnostic.test.js` 不破。

- [ ] **Step 5**: `index.html:1916-1928`（Logistics Legend 中文清理）— `edit` — `<summary>物流图例 (Logistics Legend)</summary>` → `<summary>Logistics Legend</summary>`；7 行 `● 红圈 = 物资过剩 (heat_surplus)` 等中文标签全部翻译为英文（保留括号里的英文 key，因为它们是 lens mode 内部 ID）：
  - `物资过剩` → `Resource surplus`
  - `物资短缺` → `Resource starved`
  - `路线中断` → `Route broken`
  - `仓库未就绪` → `Depot not ready`
  - `天气影响` → `Weather impact`
  - `生态压力` → `Ecology pressure`
  - `交通堵塞` → `Traffic congestion`
  - `红圈` / `蓝圈` / `橙环` / `黄环` / `紫圈` / `青圈` / `灰环` 替换为对应 ASCII 颜色词（`red dot` / `blue dot` / `orange ring` / `yellow ring` / `purple ring` / `green ring` / `grey ring`）。
  - 不要删除 `(heat_surplus)` 这类英文 key，它们和 lens mode 字符串绑定。

- [ ] **Step 6**: `test/entity-voice.test.js`（新文件，~80 LOC）— `add` — 4 测试：
  1. `humaniseInsightLine` 把 `Carry pressure has been building for 5.8s, so the worker is being pushed back toward a depot.` 转为含 `5.8` 数字、不含 "the worker"、含第一人称代词（`I`、`I've`、`my`）的字符串；
  2. dev profile 透传原文不改写；
  3. 9 类原句式都能命中分支（用 fixture 表驱动）；
  4. 未识别句式 fallback 为原文 + 不抛异常。
  - depends_on: Step 1

- [ ] **Step 7**: `test/storyteller-voicepack-roundrobin.test.js`（新文件，~60 LOC）— `add` — 3 测试：
  1. 同一 mapTemplateId + tag、不同 timeSec（0 / 30 / 60 / 90）能轮转出 ≥3 条不同 voice；
  2. timeSec=0 的输出对同一种子是 deterministic（同输入两次调用返回相同字符串）；
  3. unknown tag fallback 到 default bucket、unknown template fallback 到 `*` bucket（兼容现有 lookupAuthorVoice 兜底链路）。
  - depends_on: Step 3

- [ ] **Step 8**: `test/i18n-no-cjk-in-html.test.js`（新文件，~30 LOC）— `add` — 1 测试：读取 `index.html`，断言不包含任何 CJK Unified Ideographs (`/[\u3400-\u9FFF]/u`)。这能阻止后续回归（reviewer 痛点 §3.9）。注意排除 HTML 中可能存在的 inline `lang="zh"` 注释代码块（如有）；当前实现下 grep 仅命中 1918-1926 这 1 个区块，本测试在 Step 5 执行后会变成 PASS。
  - depends_on: Step 5

- [ ] **Step 9**: `CHANGELOG.md`（顶部 Unreleased 段）— `edit` — 添加一节 `### v0.8.2 Round-6 01e-innovation: in-character voice pack + i18n hygiene`，列出 voice pack 扩容、`humaniseInsightLine` 引入、5 条 whisperBlockedReason 改写、Logistics Legend i18n 清理、4 个新 test 文件。条目分组：New Features / Files Changed / New Tests / Reviewer Pain Points Addressed。
  - depends_on: Step 1, 2, 3, 4, 5, 6, 7, 8

## 5. Risks

- **R1 — 测试回归**：`test/hud-storyteller.test.js` / `test/storyteller-strip.test.js` / `test/storyteller-strip-whisper-diagnostic.test.js` 三个文件目前断言 `whisperBlockedReason` 等于固定字符串。Step 4 必须把 dev 字符串保留在 `whisperBlockedReasonDev` 字段，并把这三个测试中的断言迁移到 `Dev` 字段名以保证 PASS。新增 `whisperBlockedReason` 的人格化文案断言放在 Step 6 / Step 7 的新测试里。
- **R2 — voice pack 选择不稳定**：Step 3 的 round-robin seed 用 `state.metrics.timeSec`，benchmark seed-42 跑分时 timeSec 变化是 deterministic 的，但 `test/hud-storyteller.test.js` 之类纯 unit test 喂的 state stub 可能 `metrics.timeSec` 缺失 → seed=NaN。`pickVoicePackEntry` 需要在 NaN/缺失时 fallback 到 index 0。
- **R3 — 第一人称改写可能误读**：`humaniseInsightLine` 的正则匹配如果太严，碰到 reviewer 没看到但其它 case 里出现的句式会回退原文（看起来"一半中文一半英文"那种风格不一致）。Step 6 的 fixture 表必须覆盖 `getEntityInsight` 当前 9 类输出全部，并加 fallback 测试。
- **R4 — i18n 测试过严**：Step 8 的 `/[\u3400-\u9FFF]/u` 正则会扫到注释。需要先确认 `index.html` 注释里没有 CJK；当前 grep 显示只有 Logistics Legend 一处中文，Step 5 执行后即清空。如果未来 reviewer 标签需要 CJK 支持，本测试需放开为白名单机制 — 但本轮不需要。
- **R5 — DOM 测试 hint**：`EntityFocusPanel.#whyBlock` 改动后 `lastHtml` 缓存策略仍生效，但因为内容变了，刷新次数会增加 → 渲染开销轻微上升。基于 reviewer §3.7 的 UI 信息密度抱怨这是想要的方向，但要避免每帧都重新计算 voice — 改写函数应是 pure，无侧效。
- **可能影响的现有测试**：
  - `test/hud-storyteller.test.js`
  - `test/storyteller-strip.test.js`
  - `test/storyteller-strip-whisper-diagnostic.test.js`
  - 通用 snapshot 测试 (`test/event-log-rendering.test.js` 不受影响 — 不动 EventPanel)

## 6. 验证方式

- **新增测试**:
  - `test/entity-voice.test.js` 覆盖 9 类句式 → 第一人称 + dev profile 透传 + fallback 路径
  - `test/storyteller-voicepack-roundrobin.test.js` 覆盖 voice pack round-robin 决定性 + 多样性 + 兜底链
  - `test/i18n-no-cjk-in-html.test.js` 覆盖 CJK 防回归
  - 现有 `test/storyteller-strip-whisper-diagnostic.test.js` 改 5 个断言（`whisperBlockedReason` → `whisperBlockedReasonDev`）以兼容人格化包装
- **手动验证**（dev server `npx vite`）:
  1. 启动 → temperate_plains seed 42 → 进入游戏后等待 30s
  2. 选中任一 worker → Inspector "Why is this worker doing this?" 区域：应看到第一人称内心独白（"I've been hauling for ~6s …"）；切换 uiProfile 到 dev → 应看到原 `Carry pressure has been building for 5.8s` 字串
  3. 鼠标悬停 storyteller strip → tooltip 应显示新 in-world 文案（"WHISPER quiet — the Director is calling shots from the rule book tonight."）；DevTools 控制台输出 `state.ai.whisperBlockedReasonDev` 仍能拿到原 dev 字符串
  4. 打开 Heat Lens (按 L) → Logistics Legend 卡片标题与 7 行说明应全部为英文，无任何中文字符
  5. 等待 60-90s → storyteller strip 在 fallback 模式下文案应有变化（不再每次相同）
- **benchmark 回归**: `node scripts/long-horizon-bench.mjs --seed 42 --template temperate_plains` 4 seed 平均 DevIndex 不得低于当前基线（v0.8.1 的 44）的 95%（即 ≥ 41.8）。本计划不动模拟系统，只动 UI 渲染层，理论上 DevIndex 不会受影响；如果跑出 <41.8，必须 root cause analysis 而不是直接 land。
- **测试命令**: `node --test test/*.test.js` 全绿；`node --test test/entity-voice.test.js test/storyteller-voicepack-roundrobin.test.js test/i18n-no-cjk-in-html.test.js test/storyteller-strip-whisper-diagnostic.test.js` 单独全绿。

## 7. UNREPRODUCIBLE 标记（如适用）

不适用 — feedback 全部 finding 都在仓库代码可定位（已通过 Grep 验证）：
- `index.html:1918` 中文 i18n 漏洞（确认）
- `src/ui/interpretation/WorldExplain.js:469-498` 决策透明 dev 字符串（确认 — `Carry pressure has been building for ${carryAgeSec}s, so the worker is being pushed back toward a depot.` 在 line 476）
- `src/ui/hud/storytellerStrip.js:478-500` whisperBlockedReason dev 文案（确认 — Round-5b 引入）
- `src/ui/hud/storytellerStrip.js:211-243` AUTHOR_VOICE_PACK 静态文案（确认 — 每 template 1-3 条 → reviewer 玩 5 分钟必然重复）
- saboteur 视觉缺失：`src/render/SceneRenderer.js:199` 有 visitor_saboteur.glb 但没有派系 tag → 留作 P2 (方向 B)
- LLM 跑不通：`src/simulation/ai/llm/LLMClient.js` 的 fallback 路径行为符合 reviewer 描述（429 → fallback），需要 backend 配置改动而不是 frontend，本轮不在 reviewer 直接可改范围内。
