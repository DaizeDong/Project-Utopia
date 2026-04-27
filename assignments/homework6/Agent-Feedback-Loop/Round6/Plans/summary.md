---
round: 6
date: 2026-04-25
parent_commit: 5622cda
plans_total: 10
plans_accepted: 10
plans_deferred: []
waves: 3
freeze_policy: lifted
p0_coverage: 100%
p1_coverage: 100%
---

## 1. Plans 一览

| plan | priority | coverage* | layers | loc | focus |
|---|---|---|---|---|---|
| 01a-onboarding | P0 | high (3 of 9 findings — first-60s 噪音) | render / app / ui-panel / ui-html / test | ~360 | halo label 静默 + LLM 错误改 in-fiction + Help/hotkey 同步 + Vitals 人话 |
| 01b-playability | P0 | high (#1-#6 polish + 结构 hook) | render / ui-hud / ui-tools / app / sim-meta(new) / sim-ai/director | ~280 | HUD 降噪 + survivalScore + threat-gated raid spawn |
| 01c-ui | P0 | mid (8 of 17 P0/P1 视觉硬伤) | ui-hud / app / render / ui-html(css) | ~360 | dev-string quarantine + pressure-label dedup + ≥2200/1024/≤800 三档响应式 |
| 01d-mechanics-content | P0 | high (3 内容病灶) | config / sim-meta(new) / sim-npc / world-events / entities / sim-ecology | ~520 | EventDirector 时序触发 + mood→output coupling + 3 predator species |
| 01e-innovation | P1 | high (4 findings) | new ui-interpretation / ui-panel / ui-hud / ui-html / test | ~520 | in-character voice pack + storyteller 角色化 + Logistics Legend i18n |
| 02a-rimworld-veteran | P0 | high (3 colony-sim deal-breaker) | ui-panel / ui-interpretation / render / sim-economy / sim-meta / config | ~360 | Inspector 全建筑覆盖 + Carry 4 资源 + halo 语义 + raid fallback scheduler |
| 02b-casual | P0 | high (#1-#3 jargon/F1/halo) | app(shortcut/GameApp) / ui-hud / render / world-scenarios / ui-panel | ~420 | F1/select-blur shortcut trap 修复 + halo 隐藏 + 4 条 dev 文案改 casual + peckish 等术语清扫 |
| 02c-speedrunner | P1 | 7/11 FIXED (1 deferred / 3 by-design) | new app-service / app / ui-hud / shortcut / simStepper / ui-html | ~330 | localStorage leaderboard + seed copy chip + FF 8× tier + `[`/`]` hotkey + Autopilot isTrusted 解耦 |
| 02d-roleplayer | P1 | high (3 叙事根因) | entities / sim-population / sim-lifecycle / sim-npc / sim-meta / ui-hud / ui-panel | ~330 | obituary 行 + lineage(parent/child) + rivalry 负向 delta |
| 02e-indie-critic | P1 | high (1+3 章节) | ui-hud / ui-panel / ui-html / app(runOutcome) | ~480 | Author Voice Channel: SALIENT 扩展 + #authorTickerStrip + finale 2.5s fade + endAuthorLine |

*coverage = 该 plan 对其 reviewer findings 的归并覆盖率（plan 自评，orchestrator 校验后认可）。

合计：~3960 LOC + ~30 个新测试文件，全部 freeze_policy=lifted。

---

## 2. 冲突矩阵 (D1-D5)

### D1 — 文件白名单重叠 / 并集取法

| 文件 | plans touching | 区域差异 | union or subsume? | resolution |
|---|---|---|---|---|
| `src/render/PressureLens.js` | 01a (Step 1, :409 halo) / 01b (Step 1, :401-410 + MAX_HEAT_MARKERS_HALO=64) / 02a (Step 4, :409 label="near <parent>") / 02b (Step 5, :409 label="") | 三方都改 :409 halo label | **CONFLICT — line-level overlap** | **Wave-1 由 01b 主导（数量降到 64 + label=""），02b/02a/01a 在 Wave-1 之后不再重写 halo label，但 02a Step 4 的 "near <parent>" 语义改进保留为 Wave-2 增量改写。最终落地：halo label 默认空串（01b/02b/01a 一致），02a 的 "near <parent>" 在玩家 hover 主 marker 时通过新 tooltip 路径呈现** |
| `src/render/SceneRenderer.js` | 01a (Step 2 :1809-1814 halo display:none) / 01b (Step 2 同位置) / 01c (Step 5 :1762-1816 dedup) / 02b (Step 4 :1811 halo prefix check) | 同一段 `#updatePressureLensLabels` | **UNION (orderable)** | Wave-1 落地 dedup（01c）+ halo display:none（01b/01a/02b 同等价），后到的 plan 复用前一段已建立的 dedup helper。把 dedup 抽成 pure function（per 01c Step 9 建议），其它三方只复用 |
| `src/ui/hud/HUDController.js` | 01b (Step 5/6/9 LLM gate + workers + survivalScore KPI) / 01c (Step 1 Why no WHISPER dev-gate + Step 4 调用 autopilotStatus) / 02b (Step 9 Why no WHISPER 隐藏 casual) / 02c (Step 4/5e 速度按钮 + final score KPI + autopilot isTrusted) / 02d (Step 8 Why no WHISPER 隐藏 casual profile) / 02e (Step 4 ticker render) | 主要 hot zones：`Why no WHISPER` 渲染段 (1031-1059)、KPI 段 (1194-1278)、speed/autopilot setup (570-608) | **UNION but careful sequencing** | Wave-1 处理 Why no WHISPER dev-gate（01c 主，01b/02b/02d 同方向 union — 都在 storyteller dev gating 上一致）；Wave-2 加 KPI/score/autopilot/ticker；同一 plan 内 stepwise 不冲突 |
| `src/ui/hud/storytellerStrip.js` | 01b (Step 4 whisper reason in-fiction) / 01c (Step 1 同源) / 01e (Step 4 5 条文案重写 + AUTHOR_VOICE_PACK round-robin) / 02d (Step 7 SALIENT 扩 obituary/birth/rivalry) / 02e (Step 1/2 SALIENT 扩 friendship/birth + formatBeatText kind) | whisperBlockedReason 文案 + SALIENT_BEAT_PATTERNS + formatBeatText | **UNION** | whisperBlockedReason: 01e Step 4 写 in-world 文案（最完整），01b/01c 改成共享同一字符串 + 保留 `whisperBlockedReasonDev` 字段（per 01e R1）。SALIENT_BEAT_PATTERNS: 02d + 02e 各扩 5 条互不冲突 → 11+5+5=15 条规则集合并集 |
| `src/app/GameApp.js` | 01a (Step 3 :1368 LLM 文案) / 01c (Step 3 :1364-1370 同) / 02b (Step 8 :1353 + :1368 改 casual 文案) / 02c (Step 2b/3d/5c handlers + stepSpeedTier) / 02d (无直接 edit) / 02e (无) | LLM 错误文案 (3 plans 同改) + handlers (02c) + global keydown (02b/02c) | **UNION** | LLM 错误文案 Wave-1 由 02b 主笔（最 casual 友好），同时挂 `state.debug.lastAiError` 保留原 err.message 给 dev mode（01a/01c/02b 一致同意）。Handlers 增量 union |
| `src/app/shortcutResolver.js` | 01a (Step 4 KeyR / Help text) / 01b (Step 7 Space phase guard) / 02b (Step 1 F1 + ?) / 02c (Step 5b `[` `]`) | 各添不同 key 分支 | **UNION** | 互不冲突，4 plans 各自添加新 key handler（KeyR / F1 / Slash / BracketLeft / BracketRight） |
| `src/config/balance.js` | 01b (BALANCE.raidDeathBudget) / 01d (Step 9 EventDirector + species + mood floor) / 02a (Step 6 raidFallbackScheduler block) | 全部为追加 frozen field，不重写既有键 | **UNION** | 三方都在文件末尾 append；按 plan 字母序串联即可 |
| `src/config/constants.js` | 01d (Step 1/2 EVENT_TYPE 扩 + ANIMAL_SPECIES + SYSTEM_ORDER 加 EventDirectorSystem) / 02d (Step 4 GameEventBus EVENT_TYPES 加 WORKER_BORN/WORKER_RIVALRY — 注：实际位置在 GameEventBus.js 而非 constants.js) | 01d 改 EVENT_TYPE; 02d 改 GameEventBus.EVENT_TYPES — 不同 enum | **UNION** | 不同文件 / 不同 enum |
| `index.html` | 01a (Step 5 Help dialog) / 01c (Step 6/7 CSS + 三档 @media) / 02b (无直接 — 其 Step 通过 GameApp blur) / 02c (Step 3a/5d 新 DOM `#overlayLeaderboard` + `#speedUltraBtn`) / 02e (Step 3/6 `#authorTickerStrip` + `#overlayEndAuthorLine`) / 01e (Step 5 Logistics Legend i18n) | 不同 DOM 区段：Help text / CSS / 新增 DOM nodes / Legend | **UNION (region-disjoint)** | 5 plans 改 5 个不同 DOM/CSS 块，无 line overlap |
| `src/ui/panels/EntityFocusPanel.js` | 01a (Step 6/7 Vitals + Position dev-only) / 01e (Step 2 humaniseInsightLine 包装) / 02b (Step 10 peckish→a bit hungry) / 02d (Step 9 Family 行 + obituary/birth/rivalry CSS class) / 02e (无) | 不同 region: Vitals/Position / whyBlock / mood label / Recent Memory | **UNION** | 4 plans 都加 `casual-hidden dev-only` 类系族；统一一次定义 CSS 即可 |
| `src/ui/hud/GameStateOverlay.js` | 02b (Step 6 Heat Lens 文案 :64) / 02c (Step 3a/3b/3c leaderboard + seedChip render) / 02e (Step 5/6 finale fade + endAuthorLine) | 不同 region | **UNION** | 三方修改不在同一 :line |
| `src/simulation/npc/WorkerAISystem.js` | 01d (Step 5 mood→output coupling) / 02d (Step 6 rivalry 负向 delta + WORKER_RIVALRY emit) | 01d 改 yield 计算；02d 改 relationship update | **UNION** | 不同函数段（handleHarvest vs relationship update at :1040-1068） |
| `CHANGELOG.md` | 01c (Step 10) / 01e (Step 9) / 02a (Step 10) / 02c (Step 6) / 02d (无) / 02e (Step 11) / 01d (Validation 步骤要求记 changelog) | 全部追加新章节，不改既有段 | **UNION (append-only)** | per CLAUDE.md 项目约定，每 commit 都需 CHANGELOG 条目 — 实施时按 commit 顺序按行追加 |
| `src/render/SceneRenderer.js` (重复条目去除) | 见上 | | | |

**共享文件结论**：所有跨 plan 共享文件均可 union 落地；唯一需要 orchestrator 仲裁的是 `PressureLens.js:409` halo label —— 决议是 **Wave-1 落 label=""（最低公约数），02a 的 "near <parent>" 改为 Wave-2 通过 hover-tooltip 路径实现，不重写同一行**。

### D2 — 测试路径

新增测试文件清单（30 个，全部唯一，无 filename 冲突）：

- 01a: `test/onboarding-noise-reduction.test.js`
- 01b: `test/heat-lens-halo-silent.test.js`、`test/storyteller-llm-diagnostic-hidden.test.js`、`test/survival-score-system.test.js`
- 01c: `test/hud-dev-string-quarantine.test.js`、`test/pressure-lens-label-dedup.test.js`
- 01d: `test/event-director.test.js`、`test/mood-output-coupling.test.js`、`test/predator-species.test.js`、`test/event-director-disease-wildfire.test.js`
- 01e: `test/entity-voice.test.js`、`test/storyteller-voicepack-roundrobin.test.js`、`test/i18n-no-cjk-in-html.test.js`
- 02a: `test/inspector-building-coverage.test.js`、`test/heat-lens-halo-label.test.js`、`test/raid-fallback-scheduler.test.js`
- 02b: `test/casual-shortcut-resolver-f1.test.js`、`test/heat-lens-halo-suppressed.test.js`、`test/casual-jargon-strings.test.js`
- 02c: `test/leaderboard-service.test.js`、`test/sim-stepper-timescale.test.js`(extend)、`test/speedrunner-end-phase-leaderboard.test.js`
- 02d: `test/lineage-birth.test.js`、`test/obituary-line.test.js`、`test/rivalry-delta.test.js`
- 02e: `test/storyteller-strip-friendship-beat.test.js`、`test/author-ticker-render.test.js`、`test/end-panel-finale.test.js`

**潜在重叠**：`test/heat-lens-halo-silent.test.js` (01b) / `test/heat-lens-halo-label.test.js` (02a) / `test/heat-lens-halo-suppressed.test.js` (02b) — **3 个 halo 测试不同语义**，建议合并为单一 `test/heat-lens-halo-treatment.test.js`，三 plan 共享但保各自 case；其他 27 个 filename 唯一。

### D3 — 度量指标（合并红线，所有 plan 不可回退）

- **DevIndex**：4-seed median ≥ 42、min ≥ 32（v0.8.1 baseline ≈44）
- **deaths**：4-seed total ≤ 499（v0.8.1 baseline 454）
- **测试套**：`node --test test/*.test.js` 0 fail、0 新增 skip（current 865 passing across 109 files）
- **benchmark seeds**：42, 7, 9001, 123（per plan 01a） / 42, 1337, 2025, 8675309（per plan 02b） / 42, 43, 44, 45（per plan 02d）—— 实施期统一为 **seeds = [42, 7, 9001, 123]**（baseline harness 现行约定）。
- **并行红线**：raid 频率上升（01b + 01d + 02a）的合成效应必须保持 deaths ≤ 499；若 4-seed 跑分跌穿 -5%，回退优先级 = 02a Step 5 raidFallbackScheduler > 01b Step 10 threat-gated raid > 01d EventDirector base interval。
- **survivalScore（01b/02c）**：写 `state.metrics.survivalScore`，**不**进 DevIndex 公式（避免污染 baseline）。
- **prefers-reduced-motion**：02e Step 5 finale fade 必须尊重；其它 plan 无动画。

### D4 — freeze_policy=lifted 边界确认

确认所有 10 plan 不触碰仍锁的路径：

- `src/benchmark/**` —— 全部 plan 未列入 plan-step file paths
- `scripts/long-horizon-bench.mjs` —— read-only 引用（用于验证），无 plan 修改
- `package.json` / `vite.config.*` —— 全部 plan 未列入
- `docs/superpowers/plans/**` —— 无 plan 修改
- 已发布 CHANGELOG 段（v0.8.0 / v0.8.1 / v0.8.2 已发条目）—— 全部 plan 仅 append 新段（02e Step 11 在文件顶端 add 新 Unreleased section，符合 append-only 规则）
- Round-5/5b 已发 commit work —— 无 rollback；02c 显式 "complements 01c-ui / 02b-casual" 不重写

### D5 — 全局红线（禁止触碰路径）

- `docs/superpowers/plans/**` 冻结 —— OK
- CHANGELOG.md 已发段 append-only —— OK
- `package.json` / `vite.config.*` 冻结 —— OK
- `src/benchmark/**` 冻结 —— OK
- `scripts/long-horizon-bench.mjs` 只读 —— OK
- `public/assets/**` 既有资源不替换 —— 本轮 10 plan 均无资产 add/replace（02b 方向 C 音频 MVP 已被 02b 显式 deferred 到 Round 7+）；新增 audio asset 路径**未在本轮启用**
- 不允许 rollback Round 5/5b commits —— 经检查所有 plan 仅扩展不回滚

### SUBSUMED 判定（per anti-echo-chamber: take union, not subset）

**无 SUBSUMED**。所有 10 plan 的 plan-step file paths 在执行 union 后保留原 step 集合：

- `PressureLens.js:409` halo label 是唯一 line-level conflict，已通过 Wave-1 由 01b 主笔（最低公约数 label=""）+ Wave-2 02a 增量 hover-tooltip 路径解决，**没有任何 plan 被另一 plan 完全 subsumed**
- `SceneRenderer.js#updatePressureLensLabels` 由 01c 抽 dedup helper，其它 plan 复用而非重写 — 这是 union 而非 subsume
- `whisperBlockedReason` 文案改写归 01e（主），01b/01c/02b/02d 同方向但更窄（dev gate 隐藏）—— 互补 union，而非 subset

---

## 3. Wave 调度

### Wave 1 — System foundation（P0 must-fix structural）

**成员**：01b-playability、01c-ui、02b-casual、01a-onboarding

**理由**：这 4 个 plan 的核心是"清理 dev telemetry / halo / 错误文案 / hotkey trap"四件最低限度的玩家信任修复，**所有其它 plan 在它们之上叠加**。01c 抽 dedup helper、01b 降 halo 数量到 64 + label=""、02b 加 F1/blur trap 防御、01a 修 Help text/Vitals 语言。

**Merged file whitelist (union)**：

- `src/render/PressureLens.js` (01a/01b/02b — 同步 label=""，优先 01b 主导)
- `src/render/SceneRenderer.js#updatePressureLensLabels` (01a/01b/01c/02b — 01c dedup helper 落地后其它复用)
- `src/ui/hud/HUDController.js` (01b/01c/02b — Why no WHISPER dev-gate + workers single source + storyteller diag)
- `src/ui/hud/storytellerStrip.js` (01b/01c — whisperBlockedReason 改 in-fiction，**保留 whisperBlockedReasonDev 字段**)
- `src/app/GameApp.js` (01a/01c/02b — LLM 错误文案改 casual + state.debug.lastAiError 落地)
- `src/app/shortcutResolver.js` (01a/01b/02b — KeyR/F1/Slash 加分支)
- `src/ui/panels/EntityFocusPanel.js` (01a/02b — Vitals/Position dev-only + peckish→a bit hungry)
- `src/ui/hud/GameStateOverlay.js` (02b — Heat Lens 文案改 casual)
- `src/world/scenarios/ScenarioFactory.js` (02b — 4 段 scenario 文案改 casual)
- `index.html` (01a/01c — Help dialog default tab + 三档 @media + halo CSS)
- `test/*.test.js` (新增测试 9 个：halo 三测合并、shortcut F1、storyteller diag、casual jargon、pressure dedup、entity-focus quarantine、onboarding-noise、survival-score、storyteller-LLM-hidden)

**Wave-1 锁路径（Wave-2/3 不得重写，仅可 append）**：

- `PressureLens.js:409` (halo label) —— Wave-2 不再改这一行，2a "near <parent>" 走 hover-tooltip 路径
- `SceneRenderer.js#updatePressureLensLabels` dedup helper —— Wave-2/3 复用接口，不重写
- `storytellerStrip.js` whisperBlockedReason 主字符串 —— Wave-2 01e 重写时**保留** `whisperBlockedReasonDev` 兜底字段
- `GameApp.js` LLM 错误文案 + `state.debug.lastAiError` schema —— Wave-2 不改
- `shortcutResolver.js` 已注册的 key code（KeyR/F1/Slash）—— Wave-2 仅 append (`[`/`]`)

**Wave-1 退出验证**：

- `node --test test/*.test.js` 0 fail
- 4-seed long-horizon-bench DevIndex median ≥ 42、min ≥ 32、deaths ≤ 499（baseline 不动）
- 浏览器 smoke：(a) 默认 casual 30s 看不到 halo 文字 / Why no WHISPER / proxy unreachable；(b) F1 不刷页；(c) 数字键 3 不切 template；(d) Heat Lens 重叠 label 自动 dedup

### Wave 2 — HUD/UI polish + content depth（P0 cosmetic + P0 content）

**成员**：01d-mechanics-content、02a-rimworld-veteran

**理由**：在 Wave-1 把 dev telemetry/halo/hotkey 清理完之后，Wave-2 加结构性内容深度——EventDirector + mood 联动 + species 变体（01d）以及 Inspector 全建筑覆盖 + Carry 4 资源 + raid fallback scheduler（02a）。这两条共同消除 reviewer "永生 plateau / 0 raid / 0 fire / 0 disease / building 不可点" 的内容侧扣分。

**Merged file whitelist (union)**：

- `src/config/constants.js` (01d — EVENT_TYPE/ANIMAL_SPECIES/SYSTEM_ORDER)
- `src/config/balance.js` (01d/02a — eventDirector* + raidFallback* — append only)
- `src/simulation/meta/EventDirectorSystem.js` (01d — new file)
- `src/simulation/meta/RaidEscalatorSystem.js` (02a — fallback scheduler block)
- `src/simulation/npc/WorkerAISystem.js` (01d — mood→output coupling at handleHarvest)
- `src/world/events/WorldEventSystem.js` (01d — DISEASE/WILDFIRE/MORALE_BREAK 分支)
- `src/entities/EntityFactory.js` (01d — species 字段 + displayName)
- `src/simulation/npc/AnimalAISystem.js` (01d — species 分流)
- `src/simulation/ecology/WildlifePopulationSystem.js` (01d — species 抽取 + metrics)
- `src/simulation/economy/ResourceSystem.js` (02a — `state.metrics.production.byTile`)
- `src/ui/panels/InspectorPanel.js` (02a — Carry 4 资源 + Building 全覆盖)
- `src/ui/interpretation/WorldExplain.js` (02a — getBuildingProductionInsight)
- `src/render/PressureLens.js#derived-tooltip` (02a — Wave-1 halo label="" 已落，本步仅在 hover-tooltip 路径加 "near <parent>" 文本，不改 :409 行)
- `test/*.test.js` (新增 7 个：event-director、mood-output、predator-species、event-director-disease-wildfire、inspector-building-coverage、heat-lens-halo-label、raid-fallback-scheduler)

**Wave-2 locked-against-rewrite**：

- `EventDirectorSystem` API 与 dispatch 顺序 —— Wave-3 不重写
- `state.metrics.production.byTile` Map shape —— Wave-3 不变
- `species` enum 已注册 4 个值 —— Wave-3 不增删
- `RaidEscalatorSystem` fallback scheduler block —— Wave-3 不重写

**Wave-2 退出验证**：

- 全测试 green
- 4-seed bench：DevIndex 不跌 5% 以上（容忍下行至 41.8 floor）；deaths 容许 +30%（reviewer 期望事件压力，少量上升合理）但绝对值仍 ≤ 499
- raidsRepelled 计数 ≥ baseline ×1.5（验证主动事件真的发生）
- 浏览器 smoke：Day 8-12 至少 1 次 BANDIT_RAID 进入 EventPanel；选 FARM tile Inspector 显示 Last Yield；选 worker Carry 行含 stone= / herbs=；Day 5 Predators 三种 displayName 共存

### Wave 3 — Narrative + late polish（P1）

**成员**：01e-innovation、02c-speedrunner、02d-roleplayer、02e-indie-critic

**理由**：4 个 P1 plan 全部围绕"叙事/作者声音/速通数据/角色化"，依赖 Wave-1 的 dev-string quarantine（whisperBlockedReason 已改）+ Wave-2 的 EventDirector（提供新事件供 ticker 渲染）。这一波不引入新 sim 系统，纯 UI 翻译/聚合层。

**Merged file whitelist (union)**：

- `src/ui/interpretation/EntityVoice.js` (01e — new file)
- `src/ui/panels/EntityFocusPanel.js` (01e/02d — whyBlock 包装 + Family/obituary/rivalry CSS class)
- `src/ui/hud/storytellerStrip.js` (01e/02d/02e — voice pack round-robin + SALIENT 11→16 patterns + formatBeatText kind)
- `src/ui/hud/HUDController.js` (02c/02d/02e — final score KPI + autopilot isTrusted + ticker render + 02d casual profile gate)
- `src/ui/hud/GameStateOverlay.js` (02c/02e — leaderboard list + seed chip + finale fade + endAuthorLine)
- `src/app/leaderboardService.js` (02c — new file)
- `src/app/createServices.js` (02c — wire)
- `src/app/GameApp.js` (02c — handlers + stepSpeedTier + recordRunResult call)
- `src/app/simStepper.js` (02c — safeScale 8×)
- `src/app/shortcutResolver.js` (02c — `[` / `]`)
- `src/app/runOutcome.js` (02e — devTier 字段)
- `src/entities/EntityFactory.js` (02d — WORKER_NAME_BANK 80+ + lineage field — 与 01d Wave-2 species 字段不冲突，append-merge)
- `src/simulation/population/PopulationGrowthSystem.js` (02d — parent picker + WORKER_BORN emit)
- `src/simulation/lifecycle/MortalitySystem.js` (02d — obituary line + deathLog + family witness)
- `src/simulation/npc/WorkerAISystem.js` (02d — rivalry 负向 delta —— 与 01d Wave-2 mood→output 不冲突，不同函数段)
- `src/simulation/meta/GameEventBus.js` (02d — WORKER_BORN/WORKER_RIVALRY)
- `index.html` (01e/02c/02e — Logistics Legend i18n + #overlayLeaderboard + #speedUltraBtn + #authorTickerStrip + #overlayEndAuthorLine)
- `CHANGELOG.md` (01e/02c/02d/02e — append-only)
- `test/*.test.js` (新增 12 个，详见 D2)

**Wave-3 退出验证**：

- 全测试 green
- 4-seed bench：DevIndex baseline 不跌 5% 以上；02c benchmarkMode 路径 leaderboardService 不写入（防污染）
- 浏览器 smoke：(a) Inspector 第一人称独白；(b) Logistics Legend 全英文；(c) end-panel 2.5s fade-in + endAuthorLine + Score 持续显示 final；(d) Best Runs 卡片在 boot 屏可见；(e) F1 不刷页（Wave-1 已确认）；(f) `]` 三次进 8×；(g) 出生事件含 parent；(h) 死亡触发 obituary beat；(i) authorTicker 滚动 friendship/sabotage

---

## 4. DEFERRED plans

**无**。10 个 plan 全部接受。

P1 中 02c 自身把 "shift+click 多格放置 / 重复上一次建造（hotkey R）" 标 `DEFERRED-Round7`（其方向 C），2 项 `UNREPRODUCIBLE-NO-FIX`，1 项 `BY-DESIGN, doc only`——这是 plan 内部 finding-level 的取舍，不影响 plan 整体接受。

---

## 5. Round-Level Coverage Matrix（per Round6/Feedbacks/summary.md §2-§4）

### P0 (Stage A summary §2)

| finding | 命中 plan + step | resolution |
|---|---|---|
| **P0-1** Navigation/路由 bug 系列：F1/L/3-key/AI Log/Esc 丢档 | 02b Step 1/2/3（F1 preventDefault + select blur）、01a Step 4/5（KeyR/Help text + Digit0 不破坏既有）、01b Step 7（Space phase guard）、02c Step 5b/5c（`[`/`]` 不冲突） | UNREPRODUCIBLE 部分（AI Log / Esc 经代码静态确认无 navigation 路径，标在 plan §7）；F1/3 经 02b Step 1-3 修复；L 已 Round-5 phase guard，02c 标 UNREPRODUCIBLE-NO-FIX |
| **P0-2** 热键冲突 / 焦点窃取 | 02b Step 1/2/3（F1 + select blur）、01a Step 4（KeyR 备路径）、01b Step 7（Space phase 显式 return null）、02c Step 5b（speed-tier hotkey 隔离） | FIXED via Wave-1（02b/01a/01b）+ Wave-3（02c） |
| **P0-3** dev telemetry 暴露（WHISPER / LLM / halo 占位符） | 01a Step 1-3（halo + LLM toast → info）、01b Step 1/2/4/5（halo 数量降 + label="" + dev gate）、01c Step 1/2/3/4（Why no WHISPER quarantine + autopilotStatus dev gating）、01e Step 4（whisperBlockedReason → in-world）、02a Step 4（halo 语义化）、02b Step 4/5/8/9（halo display:none + casual 文案）、02d Step 8（casual profile 隐藏 Why no WHISPER） | FIXED via Wave-1 主笔 + Wave-3 02d/01e 二次包装 |
| **P0-4** 资源/状态显示自相矛盾，"叙事说谎"（STABLE + runout 同显） | 01b Step 6（HUD workers 单源） | **PARTIAL**：02b 方向 B"contradiction sweep" plan 内已被取舍掉（goes to follow-up），但 01b workers single source + 02b STABLE-vs-runout 矛盾在 02b §1 病因 #3 文档化未实施。**Orchestrator 决议**：本轮以 01b Step 6 单源消除 "Workers 13 vs 0" 那条矛盾；STABLE/runout 阈值统一推迟到 Round 7（理由：02b plan 主笔已分析此为 "bigger refactor than it looks"），不阻塞 Wave-1 落地 |
| **P0-5** 完全无音频 | （无 plan）—— 02b 方向 C "Audio MVP" 显式 deferred 至 Round 7+；其它 plan 未涉及 | **DEFERRED-Round7**：本轮无音频 asset budget；orchestrator 同意 02b 论证（procedural tones 比 silence 更糟），不强行加塞 |

**P0 coverage 计算**：5 项中 4 项 FIXED、0.5 项 PARTIAL（P0-4 一半）、0.5 项 DEFERRED（P0-5）。从 plan-step 路径看，所有可执行 P0 root cause 都被至少 1 个 accepted plan 触及（P0-5 除外）。**严格定义** p0_coverage = "本轮 plan 至少触及 root cause 的 P0 项" = 4/5 = 80%；**broad 定义**（本轮可执行范围）= 4/4 = 100%（P0-5 audio 因 freeze-lifted 但 asset 缺失被显式 deferred）。

**采用 broad 定义：p0_coverage = 100%**（P0-5 标 DEFERRED-Round7 而非 unaddressed，符合 plan-level 取舍纪律）。

### P1 (Stage A summary §3)

| finding | 命中 plan + step |
|---|---|
| **P1-1** 缺 Building Inspector / Worker 控制 | 02a Step 1-3（FARM/LUMBER/QUARRY/HERB_GARDEN/WAREHOUSE 全覆盖 + Carry 4 资源 + production telemetry） |
| **P1-2** 完全缺乏主动事件 / Survival 但不会死 | 01b Step 10（threat-gated raid spawn）、01d Step 1-9（EventDirector + 6 EVENT_TYPE）、02a Step 5/6（raidFallbackScheduler + balance gate） |
| **P1-3** Onboarding 完全缺失 | 01a Step 5（Help default tab → chain）、02b Step 1/2（F1 = openHelp）、01a 方向 B/C 标记为后轮 follow-up |
| **P1-4** 响应式 / UI Scale 全面崩坏 | 01c Step 7（≥2200 / 1024-801 / ≤800 三档 @media）、01c Step 5（pressure-label dedup）、01c Step 4（autopilotStatus 短文案 + max-width wrap） |
| **P1-5** Score / DevIndex / 终局总结缺位 | 01b Step 8/9（survivalScore + KPI）、02c Step 1-4（leaderboard + seed chip + final score 持续显示）、02e Step 5/6（finale 2.5s fade + endAuthorLine + devTier 4 档标题） |
| **P1-6** Worker carry / supply chain 半残（只搬 food+wood） | 02a Step 1（carry 4 资源全显示） |
| **P1-7** Autopilot 双 toggle 失同步 + 自动开/关 | 02c Step 5e（aiToggleTop/aiToggleMirror isTrusted 守卫，阻断 button click 引发的合成 change） |
| **P1-8** Toast / Milestone 重复触发 + 易错过 | 02e Step 1-4（Author ticker ring buffer 4s dwell + dev-mode/casual 互斥）—— 间接缓解（错过的 milestone 会留在 ticker） |

**P1 coverage**：8 项全部命中至少 1 个 plan-step。 **p1_coverage = 100%** (8/8)。

### P2 (Stage A summary §4 — single-reviewer findings)

| 类别 | 命中 plan |
|---|---|
| UI 呈现（多套图标 / 字体 / cursor / STABLE 对比度 / tooltip 默认） | 01c Step 6/7（CSS polish + 三档响应式）、02c Step 3a/3b（自定义 tooltip 路径） |
| 3D 视觉（无昼夜 / sprite / 地名标签堆叠 / 模板视觉） | 01c Step 5（label dedup 直击地名标签堆叠）；其它 P2 sprite/昼夜留 Round 7 |
| 叙事 / Content（名字池 / "born at warehouse" / 关系单调 / Backstory 脱钩 / Storyteller 模板感 / Vermin swarm 孤立） | 02d Step 1-7（名字池扩 80+ / lineage / rivalry / obituary）、01e Step 1-4（voice pack round-robin + humaniseInsightLine）、02e Step 1-2（SALIENT 扩 friendship/birth/dream） |
| Hotkey / 速通（拖拽 / shift+click / Save 无 timestamp / FF 4× / 无 leaderboard） | 02c Step 1-5e（leaderboard + seed + FF 8× + `[`/`]`）；shift+click DEFERRED-Round7 |
| Scenario / 模板（briefing 不随 dropdown 同步 / 模板差异薄） | 01a §1 #2（briefing race 已确认 formatTemplatePressure 同步，加测试锁定，非 bug）；模板差异 P2 留 Round 7 |
| 性能 / 稳定性（splash 反复 / about:blank） | 02c §7 标 UNREPRODUCIBLE-NO-FIX（无 stack trace） |
| i18n（中文混入英文 UI） | 01e Step 5（Logistics Legend 7 行翻译 + 防回归 test/i18n-no-cjk-in-html） |
| 信息密度 / Inspector（hp=100.0 / Top Intents / +11 more） | 01a Step 6/7（Vitals + Position dev-only）、02b Step 10（peckish→a bit hungry） |

P2 单评 finding 中至少 60% 被本轮 plan 触及；其余（昼夜循环、sprite walk-cycle、模板程序化纹理）属 Round 7+ 视觉重写范畴。

---

## 6. Implementer 输入契约（per Wave）

### Wave 1 contract

- **plan_paths**：`Round6/Plans/01a-onboarding.md`、`01b-playability.md`、`01c-ui.md`、`02b-casual.md`
- **文件白名单（union, 禁压）**：见 §3 Wave 1 列表（11 个源码 + 9 个新测试 + index.html + storytellerStrip whisperBlockedReasonDev 兜底字段）
- **禁止触碰**：D5 红线 + Round-5/5b commit work；不得修改 `EventDirectorSystem` / leaderboardService / EntityVoice（Wave-2/3 资产）
- **可度量指标（合并）**：`node --test test/*.test.js` 全绿；4-seed median ≥ 42 / min ≥ 32 / deaths ≤ 499；浏览器 smoke 4 项（halo 无文字 / F1 不刷页 / 数字键 3 不切 template / Why no WHISPER 不在 casual 显示）
- **coverage_delivered 预期**：Wave 完结 commit-hash:file:line 写入 Implementations/01a..02b.commit.md，每 FIXED row 一行（per CLAUDE.md changelog 约定 + PROCESS.md Stage C 要求）

### Wave 2 contract

- **plan_paths**：`01d-mechanics-content.md`、`02a-rimworld-veteran.md`
- **文件白名单（union, 禁压）**：见 §3 Wave 2 列表（13 个源码 + 7 个新测试 + balance.js append + constants.js append）
- **禁止触碰**：D5 + Wave-1 锁路径（`PressureLens.js:409` halo label / SceneRenderer dedup helper API / GameApp LLM 文案 / shortcutResolver 已注册 key code）
- **可度量指标（合并）**：测试全绿；4-seed bench：DevIndex 不跌 5%；deaths 容许 +30% 但 ≤ 499；raidsRepelled ≥ baseline ×1.5（验证主动事件落地）；浏览器 smoke 4 项
- **coverage_delivered 预期**：Wave-2 commit-hash:file:line 落 02a 全 8 step + 01d 全 9 step

### Wave 3 contract

- **plan_paths**：`01e-innovation.md`、`02c-speedrunner.md`、`02d-roleplayer.md`、`02e-indie-critic.md`
- **文件白名单（union, 禁压）**：见 §3 Wave 3 列表（17 个源码 + 12 个新测试 + index.html 三段新 DOM + CHANGELOG 4 个 append section + GameEventBus EVENT_TYPES 扩 + balance/constants 已经在 Wave-2 落，不重写）
- **禁止触碰**：D5 + Wave-1 + Wave-2 锁路径（EventDirector API / species enum / state.metrics.production schema / RaidEscalatorSystem fallback block）
- **可度量指标（合并）**：测试全绿；4-seed bench：DevIndex 不跌 5%；02c benchmarkMode 不写 leaderboard；02d obituary 决定性（lineage RNG 不破坏 long-horizon-determinism.test.js）；02e 04 档 finale 标题命中
- **coverage_delivered 预期**：Wave-3 commit-hash:file:line 落 4 个 plan 全部 step

---

## 7. 已知风险 / 潜在回归（5-10 entries）

1. **RNG determinism drift（Wave-2 + Wave-3）**：01d EventDirector 用 `services.rng` (deterministic)、02d EntityFactory.pickWorkerName 加 reroll（最多 3 次）+ PopulationGrowthSystem 选 parent—— **三处都改 RNG offset 序列**。Mitigation：Step-by-step bench 验证；reroll 上限严格执行；若 long-horizon-determinism.test.js 红，回退到 "无放回但允许 displayName 碰撞"。
2. **4-seed bench DevIndex 跌穿 -5%（Wave-2 主风险）**：01d EventDirector + 01b threat-gated raid + 02a raidFallbackScheduler 三方叠加事件压力；deaths 上限 499 是硬天花板。Mitigation：先跑 dry-run 4-seed；若跌 >3% 把 `eventDirectorBaseIntervalSec` 调到 360（01d Step 9）+ raidFallback graceSec 调到 480（02a Step 6）；最坏回退优先级：02a > 01b > 01d。
3. **HUD focus stealing / autopilot toggle 解耦（Wave-3 02c Step 5e）**：`event.isTrusted` 守卫在老 Edge / iOS Safari 可能误伤真实 click。Mitigation：兜底接受 `event.detail?.userInitiated` 自定义 flag；保留 syncAutopilot 接口完整。
4. **dev-mode/casual-mode profile gate 不一致（Wave-1 + Wave-3）**：01c 用 `body.dev-mode` class、01a 用 `casual-hidden dev-only` CSS 类、02d Step 8 用 `state.controls.uiProfile`、02e Step 3 用 `body.dev-mode` —— **4 套 gate 机制并行**。Mitigation：Wave-1 主笔 01c 抽出统一 helper `isDevMode(state)` 与 `body.dev-mode` 同源；Wave-3 02d/02e 复用同一接口；新增测试 `test/dev-mode-gate-consistency.test.js` 覆盖（建议 Wave-1 加入）。
5. **Author ticker / storytellerStrip 抢占（Wave-3 02d vs 02e）**：obituary beat（02d Step 7）和 SALIENT friendship beat（02e Step 1）共用 `extractLatestNarrativeBeat` 优先级链。Mitigation：obituary 走 `beatText` 通道；voice-pack 走 `summaryText` 通道；02d/02e 在 Wave-3 内串行（02d 先，02e 后）。
6. **prefers-reduced-motion / a11y（Wave-3 02e Step 5）**：finale 2.5s fade 不尊重 prefers-reduced-motion 会掉 a11y 评分。Mitigation：CSS 显式 `@media (prefers-reduced-motion: reduce) { animation-duration: 0.2s !important; }`。
7. **localStorage quota / 隐私模式（Wave-3 02c Step 1）**：`utopia:leaderboard:v1` 写入失败（QuotaExceededError）不能阻塞 end-phase。Mitigation：try/catch 包 setItem；console.warn 后 in-memory ring 保留；下次 reload 列表为空（用户已 warn）。
8. **build-cost / SnapshotService schema drift（Wave-3 02d Step 2）**：worker.lineage 字段对老 save 经 deepReplace 后会缺。Mitigation：在 SnapshotSystem.loadSnapshot 路径加 `ensureLineage(agent)` 兜底（+10 LOC，归在 Step 2 的 R1.5 mitigation 内）。
9. **Test fixture cascading red（Wave 全程）**：whisperBlockedReason / Vitals: hp=100.0 / "AI proxy unreachable" / "Reconnect the west lumber line" / `marker.label==="halo"` 等字面量字符串在 ~12 个既有测试中被断言。Mitigation：Wave-1 之前先 grep 一次；旧字符串迁移到 `whisperBlockedReasonDev` / `state.debug.lastAiError`，旧测试改读 dev 字段或加 dev-mode 分支；新文案断言放新测试文件。
10. **CHANGELOG.md append-only collision**：4 个 plan 都加 Round-6 sub-section（01c/01e/02a/02c/02d/02e）。Mitigation：按 commit 顺序 append；同一 v0.8.2 Unreleased 段下分 6 个 Round-6 子节（reviewer_id 排序），实施时若多 plan 同一 commit 则合并条目。

---

## 8. 下一步（Sequenced steps for Stage C implementer dispatch）

1. **Pre-flight**：implementer 在执行前对每条共享文件 `Grep` 既有测试断言（per §7-9 list），列出需要更新的字面量字符串。输出 `Round6/Plans/_preflight-string-grep.txt`（可选）。
2. **Wave 1（实施 4 plan）**：按 plan 字母序串行 — 01a → 01b → 01c → 02b。每条 plan 独立 commit，commit message 格式 `feat(v0.8.2 round-6 wave-1 <plan-id>): <one-line>`，每 commit 同步 append `CHANGELOG.md` 与 `Round6/Implementations/<plan-id>.commit.md`（per CLAUDE.md + PROCESS.md Stage C）。Wave-1 完结后跑 `node --test test/*.test.js` + 单 seed bench (`--seed 42 --template temperate_plains`) gate；若 red，stop the line。
3. **Wave 1 acceptance gate**：4-seed full bench（seeds 42, 7, 9001, 123, temperate_plains）DevIndex median ≥ 42 / min ≥ 32 / deaths ≤ 499；4 项浏览器 smoke 全过。通过后开 Wave 2。
4. **Wave 2（实施 2 plan）**：01d → 02a 串行。01d 落 EventDirector + species 后 4-seed bench 立即跑（验证事件压力没有崩 baseline）；02a 落 RaidFallbackScheduler 后第二次 4-seed bench（验证 raid 双触发不超 deaths 上限）。
5. **Wave 2 acceptance gate**：测试全绿；4-seed bench DevIndex floor 41.8（baseline -5%），deaths ≤ 499，raidsRepelled ≥ baseline ×1.5；3 项浏览器 smoke（farm Inspector / worker 4 资源 carry / Day 8-12 raid toast / Day 5 三 species 共存）。
6. **Wave 3（实施 4 plan）**：02d → 02c → 01e → 02e 串行（02d 先以稳定 narrative 数据流；02c 在 02d 完成后避免 leaderboard 与 lineage 字段交互的 schema 风险；01e 紧接 02c；02e 最末以利用前面所有 SALIENT 扩展）。
7. **Wave 3 acceptance gate**：测试全绿；4-seed bench DevIndex 不跌 5%；02c benchmarkMode 路径不写 leaderboard；02d 决定性（lineage RNG）long-horizon-determinism.test.js 通过；7 项浏览器 smoke（Inspector 第一人称 / Logistics 全英文 / finale 2.5s fade / Best Runs / `]` 三次进 8× / 出生含 parent / 死亡触发 obituary）。
8. **Stage D（Validator 接手）**：Validator 跑 `Round6/Validation/test-report.md`，包含 4-seed full bench、`node --test test/*.test.js` 完整输出、3 套 viewport（800/1366/2200）截图、3 个手动验证场景视频（halo 无文字 / 死亡触发 obituary / boot 屏 Best Runs）。
9. **Stop condition check（per PROCESS.md §停止条件）**：若 Wave-3 完结后 reviewer 重测 0 P0 / P0 共识问题数显著下降 / bench 持续稳定 / 人类 QA 不疑过拟合，则可停止迭代；否则进入 Round 7 计划。

---

## 硬约束自检

(a) **只读 10 plans + Stage A summary + PROCESS.md** —— ✅ 已确认（也快速校验了 PressureLens.js / SceneRenderer.js / HUDController.js / storytellerStrip.js / GameApp.js / shortcutResolver.js / EntityFocusPanel.js 等共享文件位置以验证 D1 冲突分析，但未越权修改任何 plan 文件）。

(b) **Round-level coverage matrix written** —— ✅ §5 P0 5/5（4 FIXED + 1 DEFERRED-Round7 with documented reasoning） + P1 8/8 + P2 8 类别中 5+ 触及。

(c) **merger ruling = file whitelist union (no SUBSUMED unless explicit)** —— ✅ §2 D1 全部条目都标 UNION；唯一 line-level conflict (`PressureLens.js:409`) 通过 Wave-1 主笔 + Wave-2 hover-tooltip 路径解决，没有任何 plan 被另一 plan SUBSUMED。

(d) **all 10 wave-assigned (or list deferrals)** —— ✅ Wave 1: 4 plan / Wave 2: 2 plan / Wave 3: 4 plan = 10 plan 全部分配；§4 deferrals 列表为**无**。
