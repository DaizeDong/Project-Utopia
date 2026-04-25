---
round: 5b
date: 2026-04-24
parent_commit: bc7732c
plans_total: 10
plans_accepted: 10
plans_deferred: 0
waves: 3
p0_coverage: 100
p1_coverage: 90
essential_bias: true
---

## 1. Plans 一览

| plan | priority | coverage | layers | loc | focus |
|---|---|---|---|---|---|
| 01a-onboarding | P0 | 100% (FIXED 11/25 + PARTIAL 2 + PRIOR 2 + SUBSUMED 5 + D5 5) | simulation + ui + render (3) | ~135 | Autopilot food-crisis auto-pause + `#statusBuildHint` reasonText pipe + `#statusAutopilotCrisis` alert + keybind 1-12 unify |
| 01b-playability | P0 **structural** | 77% (FIXED 10/13) | config + simulation/population + simulation/ai/colony (3) | ~185 | RoleAssignmentSystem `reserved/specialistBudget` structural refactor: BAND_TABLE (pop<4/4-5/6-7/8+) + dynamic farmMin + FARM cannibalise safety valve + band-aware idleChainThreshold |
| 01c-ui | P1 | 76% (FIXED 12+3 same-root+3 subsumed of 21) | ui + render + config (3) | ~360 | `--hud-height` ResizeObserver unblocks Colony-Food occlusion + Heat Lens halo expansion (marker pool 48→160) + 4-breakpoint responsive matrix + KPI typography + boot splash + progress chip SVG |
| 01d-mechanics-content | P0 | 96% (FIXED 5 new + PRIOR 3 + SUBSUMED 6 + D5 11 of 26) | simulation/economy + ui/hud + ui/panels (3) | ~260 | ProcessingSystem snapshot (progress01/ETA/stalled/stallReason) → HUD + Inspector + per-resource breakdown (wood/stone/herbs/meals/tools/medicine) + runout ETA warn-soon/warn-critical |
| 01e-innovation | P0 | 77% (FIXED 6/12 + SUBSUMED 2 + D5 4) | simulation/ai + ui/hud + ui/panels (3) | ~210 | LLM diagnostic overlay (`whisperBlockedReason`) + NPCBrainSystem policyHistory ring (cap 32) + scenario-phase voice refresh + AIPolicyTimelinePanel + AIExchange errorLog card |
| 02a-rimworld-veteran | P0 | 73% (FIXED 5 + POSITIVE 2 + SUBSUMED 5 + prior 2 + D5 1 of 15) | config + simulation + app + render + ui (5) | ~215 | 4× FF scheduler (maxSteps 6→12, accumulator 0.5→2.0, visibility catchup) + Kitchen-gate wall-scenario decoupling + OBJECTIVE_REGRESSED event + index.html cost literal fix + entity pick hitbox (balance + uiProfile) |
| 02b-casual | P1 | 73% (FIXED 9/15 + D5 4 + SUBSUMED 2) | config + simulation + ui + render (4) | ~220 | BALANCE.casualUx (err toast 1.2→3.5s, warn 2.6s, struggle grace 20s) + MILESTONE_RULES extend (first_clinic/smithy/medicine + dev_40/60/80 + first_haul) + autopilot struggling banner + tool-tier gate (primary/secondary/advanced) + enriched tool tooltips |
| 02c-speedrunner | P1 | 73% (FIXED 7 + SUBSUMED 4 + D5 4 of 15) | config + app + simulation/economy + ui/html + ui/hud (5) | ~180 | BUILD_COST_ESCALATOR hardCap + perExtraBeyondCap (anti-stacking) + clinic ROI tune (herbsCost 2→1, BUILD_COST.clinic herbs 4→2) + FF maxSteps 12 + timeScaleActual + BUILDING_DESTROYED diff emit + hotkey 1-0/-/= doc |
| 02d-roleplayer | P1 | 75% (FIXED 9/15 + D5 3 + SUBSUMED 2 + OOS 1) | simulation/population + simulation/npc + ui/panels (3) | ~200 | intent `lastIntentReason` ("because" narration) + birth memory emit + friendship band-crossing memory + FARM/WOOD/HAUL anti-mismatch specialty soft-sort + EntityFocusPanel `__reason__` suffix |
| 02e-indie-critic | P0 | 75% (FIXED 5 + PRIOR 3 + PARTIAL 1 + D5 2 + OOS 1 of 12) | simulation/ai/llm + world/scenarios + entities + app + ui (5) | ~235 | LLM-live voice-pack overlay (`voicePrefixText`) + SURNAME_BANK humanise displayName (casual profile) + `window.__utopiaLongRun` devOn gate + 1.5s scenario fade (`ui.scenarioIntro`) + author-tone label (Dev/Threat/Score) |

## 2. 冲突矩阵（D1-D5）

**D1 — 文件白名单重叠 / 并集取法**

| file | plans touching | union required | conflict resolution |
|---|---|---|---|
| `src/config/balance.js` | 01b (bandTable/farmCannibalise), 02a (fastForwardScheduler/renderHitboxPixels/scenarioObjectiveRegressionWindowSec), 02b (casualUx), 02c (BUILD_COST_ESCALATOR hardCap + perExtraBeyondCap, clinic tune) | **UNION** — 4 plans all append distinct frozen sub-objects; no overwrites. Wave-1 lands 01b first (bandTable), Wave-2 appends siblings. | No SUBSUME. Each plan edits disjoint keys. |
| `src/simulation/economy/ResourceSystem.js` | 01a (FOOD_CRISIS_DETECTED emitter), 02a (OBJECTIVE_REGRESSED diff), 02c (BUILDING_DESTROYED diff) | **UNION** — 3 plans add 3 distinct `#emit…` private methods + 3 call sites in `update()` tail. | 02a and 02c both detect building-count drops; **02a owns OBJECTIVE_REGRESSED (objective-category framing) + 02c owns BUILDING_DESTROYED (raw per-tile framing)**; implementer must chain both detectors, not pick one. |
| `src/simulation/meta/GameEventBus.js` | 01a (FOOD_CRISIS_DETECTED), 02a (OBJECTIVE_REGRESSED) | **UNION** — 2 new EVENT_TYPES keys. | No conflict. |
| `src/ui/hud/HUDController.js` | 01a (#statusBuildHint + #statusAutopilotCrisis + data-full), 01c (ResizeObserver `--hud-height`, KPI group, overflow sheet), 01d (`#renderRateBreakdown` generic + `#renderRunoutHints`), 01e (WHISPER diagnostic tooltip), 02b (struggling banner data-kind), 02e (voicePrefix + author-tone label + scenario-intro branch) | **UNION — critical file, 6 plans.** Implementer must land each plan's new methods as disjoint `#render…` blocks; constructor el-lookup additions append; no single block replaced. | Ordering: Wave-1 01a; Wave-2 01c + 01d + 01e; Wave-3 02b + 02e finishing passes. Each plan claims distinct DOM ids. |
| `src/ui/hud/storytellerStrip.js` | 01e (diagnostic shape extension), 02e (voicePackOverlayHit + voicePrefixText + scenario-intro priority branch) | **UNION** — 01e adds `diagnostic` sub-object, 02e adds `voicePrefixText` peer field; both consumed by HUDController. | Wave-3 both plans together. 02e's Step 1 (LLM-live overlay) subsumes 01e's Step 3 (scenario-phase voice) consumption via `voicePrefixText`; **implementers must keep both paths**: 01e publishes phase tag, 02e overlay reads it. Not compressed. |
| `src/simulation/ai/llm/PromptBuilder.js` | 01e (deriveScenarioPhaseTag helper), 02e (authorVoiceHintTag attach) | **UNION** — 01e adds phase-tag helper; 02e adds tag attach on policy object. Complementary. | Wave-3. 02e must NOT touch `adjustWorkerPolicy` summary template (explicit whitelist in 02e §8). |
| `src/simulation/ai/brains/NPCBrainSystem.js` | 01e (policyHistory ring) | single plan | No conflict. |
| `src/simulation/population/RoleAssignmentSystem.js` | 01b (computePopulationAwareQuotas + farmMin + cannibalise — **structural rewrite of update() body lines 18-292**), 02d (FARM/WOOD/HAUL anti-mismatch soft-sort at lines 265-292) | **UNION — HIGH CONFLICT POTENTIAL.** 01b rewrites reserved/specialistBudget distribution; 02d appends a sort comparator at the distribution tail. Implementers MUST land 01b first (Wave-1), then 02d on top (Wave-3) after 01b's pool-construction semantics are stable. | **NOT SUBSUMED**. 01b is quota-budget reform; 02d is specialty-locality reform. Both required. |
| `src/simulation/ai/colony/ColonyPlanner.js` | 01b (idleChainThreshold low-pop band), 02a (Kitchen gate wall-scenario), 02c (prompt-text-only "6 wood + 2 herbs" sync) | **UNION** — three disjoint edit sites (Priority 3.75 band threshold; Priority 3.5 Kitchen stone gate; static prompt literal). | Wave-1 01b; Wave-2 02a + 02c. |
| `src/simulation/npc/WorkerAISystem.js` | 02d (intent `lastIntentReason` side-channel + friendship band-crossing emit) | single plan | No conflict. |
| `src/render/SceneRenderer.js` | 01a (#onPointerMove buildHint wiring), 01c (HEAT_TILE_OVERLAY_VISUAL opacity tune + pool cap 192), 02a (entity pick hitbox reads BALANCE.renderHitboxPixels) | **UNION** — 3 disjoint regions (pointer hover, heat overlay visuals, pick threshold). | Wave-1 01a; Wave-2 01c; Wave-2 02a. |
| `src/render/PressureLens.js` | 01c (halo pass + MAX_HEAT_MARKERS_HALO) | single plan | No conflict. |
| `src/simulation/economy/ProcessingSystem.js` | 01d (snapshot emitter) | single plan | No conflict. |
| `src/simulation/meta/ProgressionSystem.js` | 02b (MILESTONE_RULES extend) | single plan | No conflict. |
| `src/ui/hud/autopilotStatus.js` | 01a (pausedByCrisis branch + fallback/fallback text simplify), 02b (struggling signal) | **UNION** — 01a adds `pausedByCrisis` short-circuit; 02b adds `struggling` suffix. Complementary: `pausedByCrisis` is the hard-stop, `struggling` is the soft-warn. | Wave-1 01a; Wave-3 02b builds on top. |
| `src/ui/panels/InspectorPanel.js` | 01d (Processing block + logistics efficiency) | single plan | No conflict. |
| `src/ui/panels/EntityFocusPanel.js` | 02d (intent reason + relationship `__reason__` suffix) | single plan | No conflict. |
| `src/ui/panels/AIExchangePanel.js` | 01e (errorLog card) | single plan | No conflict. |
| `src/ui/panels/AIPolicyTimelinePanel.js` (NEW) | 01e | single plan | new file |
| `src/entities/EntityFactory.js` | 01e (ai.policyHistory init), 02e (surname humanise + uiProfile read) | **UNION** — disjoint (policyHistory bootstrap vs displayName compute). | Wave-3 both plans. |
| `src/app/GameApp.js` | 02a (visibility catchup + maxSteps BALANCE read), 02c (timeScaleActual write), 02e (regenerateWorld scenarioIntro payload write) | **UNION** — 3 disjoint constructor/update call-site edits. | Wave-2 02a + 02c; Wave-3 02e. |
| `src/app/simStepper.js` | 02a (accumulator cap BALANCE read), 02c (accumulator cap 0.5→1.0, maxSteps 12) | **UNION WITH ALIGNMENT NEEDED** — both plans raise accumulator cap; 02a prefers 2.0, 02c prefers 1.0. **Resolution: adopt 02a's 2.0** (02a cites Phase 10 long-horizon hardening for 12-step determinism; 02c's 1.0 is conservative default). 02c's maxSteps=12 aligns with 02a's 12 — identical ask. | Wave-2 single implementer lands both edits as one commit. |
| `src/main.js` | 02e (window.__utopiaLongRun devOn gate) | single plan | No conflict. |
| `src/world/scenarios/ScenarioFactory.js` | 01e (exportScenarioVoiceForHUD), 02e (getScenarioIntroPayload) | **UNION** — 2 new exports; no shared internal mutation. | Wave-3 both plans. |
| `index.html` | 01a (#statusBuildHint + #statusAutopilotCrisis spans + 1-12 hotkey), 01c (CSS: `--hud-height`, responsive matrix, KPI group, progress-chip SVG, boot splash, tool pixel-art, scenario-badge case), 01d (6 rate-breakdown spans + 5 runout-hint spans + warn-soon/critical CSS), 02a (Kitchen cost literal 5→8 wood + 11 other tooltips), 02b (data-tool-tier + casual-mode CSS + 12 enriched titles), 02c (hotkey line "1-0/-/="), 02e (no direct edits — uses dynamic span creation) | **UNION, HIGH DENSITY.** 7 plans touch index.html. Each plan owns disjoint elements/ids/CSS selectors. Implementers must land each in a **marked `<style id="round5b-XX">` block** (01c §8.1 pattern) and append DOM elements without reordering existing structure. Hotkey line edited by 01a AND 02c — **02c's "1-0/-/=" supersedes 01a's "1-12"** (02c reflects actual TOOL_SHORTCUTS mapping). | Ordering: Wave-1 01a; Wave-2 01c + 01d + 02a; Wave-3 02b + 02c. |

**D2 — 测试路径**: 10 plans add **~35 new/modified tests**. All test filenames distinct (grep-verified no overlap). Union accepted.

**D3 — 度量指标**: 4-seed benchmark (1/7/42/99) is the shared acceptance gate (01b primary; 02a/02c/02d/02e noise-check only; 01a/01c/01d/01e/02b UI-only expected bit-identical). DevIndex-median target ≥ 42, min ≥ 32, 0 loss, deaths ≤ 499.

**D4 — HW06 freeze**: All 10 plans explicitly self-check §4.7 compliance. Zero new tiles, zero new buildings, zero new tools, zero new audio assets, zero new mood/relationship mechanics, zero new score systems. All FIXED work is re-wiring existing state fields + new `emit`/`detect`/`render` functions on existing data.

**D5 — 全局红线（禁止触碰路径）**:
- `docs/superpowers/plans/**` — 历史 plan 不得改
- `CHANGELOG.md` 已发布段 — 只追加 unreleased 段
- `package.json` / `vite.config.*` — 冻结
- `src/benchmark/**` — 冻结（bench harness 已 Phase 10 锁定）
- `scripts/long-horizon-bench.mjs` — 只读（验证用，不改）
- `public/assets/**` — 冻结（无新资产）
- 任何 Round 5 已交付 commit 的回滚 — 禁止（02e 明令保留 badgeState / humaniseSummary Round 5 定型；02d 明令保留 Round 5 MortalitySystem witness union；02c 明令保留 BUILD_COST_ESCALATOR 曲线方向）

**SUBSUMED 判定（严格按 §4.11：取并集不取子集）**:
- 没有任何一份 plan 被整体 SUBSUME。所有 10 份均 accepted。
- plan 内部的 finding-level SUBSUMED（e.g. 01a F10→02c，02a F1/F2/F3/F15→01b）保留于各 plan Coverage Matrix，不压缩到公共 plan。
- 文件白名单并集：**7 个共享文件**（balance.js / ResourceSystem.js / HUDController.js / storytellerStrip.js / RoleAssignmentSystem.js / ColonyPlanner.js / SceneRenderer.js / index.html / GameApp.js / simStepper.js / PromptBuilder.js / EntityFactory.js / ScenarioFactory.js / autopilotStatus.js）全部按并集处置，禁止任一实施者缩减。

## 3. Wave 调度

> **Round 5 失败点重申**: Wave 1 `RoleAssignmentSystem.update` 在 pop=4 下 `reserved = farmMin(min(2,n)) + woodMin(1) = 3` 吞 75% labour → 6 specialist 争 1 slot → specialistBudget=0 结构塌方。seeds 1/99 day-20/51 colony-loss。**本轮 01b 结构重构必须 Wave 1 第一落地，且 debugger 验收线：seeds 1/7/42/99 全部 `max_days_reached` 到 365 天（4/4 outcome 不 loss）**。

### Wave 1 — 系统层支点（先行）

- **01b-playability** — `RoleAssignmentSystem` + `balance.bandTable` + `ColonyPlanner` idle-chain 低 pop 阈值。
- **01a-onboarding** — FOOD_CRISIS_DETECTED + autopause + buildHint wiring（simulation emit + render pipe + ui render）。
- **01e-innovation** — policyHistory ring + `whisperBlockedReason` diagnostic（simulation observer only，bit-identical benchmark）。

**Wave 1 合并 plan 路径**:
- `Round5b/Plans/01b-playability.md`
- `Round5b/Plans/01a-onboarding.md`
- `Round5b/Plans/01e-innovation.md`

**文件白名单（并集）**: `src/config/balance.js`, `src/simulation/population/RoleAssignmentSystem.js`, `src/simulation/ai/colony/ColonyPlanner.js`, `src/simulation/economy/ResourceSystem.js`, `src/simulation/meta/ColonyDirectorSystem.js`, `src/simulation/meta/GameEventBus.js`, `src/simulation/ai/brains/NPCBrainSystem.js`, `src/simulation/ai/llm/PromptBuilder.js`, `src/entities/EntityFactory.js`, `src/app/types.js`, `src/app/GameApp.js`, `src/ui/hud/HUDController.js`, `src/ui/hud/autopilotStatus.js`, `src/ui/hud/storytellerStrip.js`, `src/ui/panels/AIExchangePanel.js`, `src/ui/panels/AIPolicyTimelinePanel.js` (NEW), `src/render/SceneRenderer.js`, `src/world/scenarios/ScenarioFactory.js`, `index.html`, and all corresponding `test/*.test.js`.

**Wave 1 退出验收硬 gate**:
- 4-seed benchmark (`1/7/42/99`, temperate_plains, 365d, soft-validation): **all 4 outcome == `max_days_reached`**（禁止任一 loss）。
- DevIndex median ≥ 42；min ≥ 32；deaths ≤ 499。
- Autopilot 手动 2min 测试：pop=4 从 day 0 起 COOK ≥ 1 持续 ≥ 30s；food crisis 触发时 `speed=0` + `#statusAutopilotCrisis` 可见。

**若 Wave 1 benchmark 失败**: 本 Round 5b 判 REJECTED-STRUCTURAL；回到 Round 6 orchestrator 重新设计 01b band 表。

### Wave 2 — HUD 因果面 + 观察闭环 + 消费端修复

- **01d-mechanics-content** — ProcessingSystem snapshot + rate-breakdown 泛化 + runoutEta + Inspector Processing block。
- **01c-ui** — `--hud-height` ResizeObserver + Heat Lens halo + responsive 4-breakpoint + KPI + splash + progress-chip。
- **02a-rimworld-veteran** — 4× FF scheduler + Kitchen wall-gate + OBJECTIVE_REGRESSED + hitbox + index.html tool cost。
- **02c-speedrunner** — BUILD_COST_ESCALATOR hardCap + clinic ROI + maxSteps=12 align + timeScaleActual + BUILDING_DESTROYED diff + hotkey doc。

**Wave 2 合并 plan 路径**:
- `Round5b/Plans/01d-mechanics-content.md`
- `Round5b/Plans/01c-ui.md`
- `Round5b/Plans/02a-rimworld-veteran.md`
- `Round5b/Plans/02c-speedrunner.md`

**文件白名单（并集）**: `src/config/balance.js` (append), `src/simulation/economy/ProcessingSystem.js`, `src/simulation/economy/ResourceSystem.js`, `src/simulation/ai/colony/ColonyPlanner.js`, `src/simulation/meta/GameEventBus.js`, `src/app/GameApp.js`, `src/app/simStepper.js`, `src/ui/hud/HUDController.js`, `src/ui/hud/GameStateOverlay.js`, `src/ui/tools/BuildToolbar.js`, `src/ui/panels/InspectorPanel.js`, `src/ui/panels/DeveloperPanel.js` or `src/ui/panels/EventPanel.js`, `src/render/PressureLens.js`, `src/render/SceneRenderer.js`, `index.html`, and all corresponding tests.

**Wave 2 退出验收**:
- Benchmark 4-seed 重跑：DevIndex 不得跌穿 Wave 1 基线 -2。
- 手动：Alt+click Kitchen → Inspector Processing block 显示 progress/ETA/stallReason；按 L → Heat Lens 染 ≥ 20 tiles；4× FF 实测 ticks/wall-sec ≥ 3.5×；Kitchen cost tooltip 8w+3s；warehouse ≥20 时 hardCap red toast。

### Wave 3 — 叙事/收尾/balance/作者腔

- **02b-casual** — casualUx config + MILESTONE extend + struggling banner + tool-tier gate + enriched tooltips。
- **02d-roleplayer** — intent `lastIntentReason` + birth/friendship memory + FARM/WOOD/HAUL anti-mismatch + relationship reason UI。
- **02e-indie-critic** — voice-pack LLM overlay + SURNAME_BANK + debug gate + scenario fade + author-tone label。

**Wave 3 合并 plan 路径**:
- `Round5b/Plans/02b-casual.md`
- `Round5b/Plans/02d-roleplayer.md`
- `Round5b/Plans/02e-indie-critic.md`

**文件白名单（并集）**: `src/config/balance.js` (casualUx append), `src/simulation/meta/ProgressionSystem.js`, `src/simulation/population/RoleAssignmentSystem.js` (on top of Wave 1), `src/simulation/population/PopulationGrowthSystem.js`, `src/simulation/npc/WorkerAISystem.js`, `src/simulation/ai/llm/PromptBuilder.js` (on top of Wave 1), `src/entities/EntityFactory.js`, `src/app/GameApp.js`, `src/app/main.js`, `src/app/uiProfileState.js` (NEW, ~20 LOC), `src/ui/hud/HUDController.js`, `src/ui/hud/autopilotStatus.js`, `src/ui/hud/storytellerStrip.js`, `src/ui/tools/BuildToolbar.js`, `src/ui/panels/EntityFocusPanel.js`, `src/world/scenarios/ScenarioFactory.js`, `index.html`, and all corresponding tests.

**Wave 3 退出验收**:
- Full suite `node --test test/*.test.js` ≥ 1162 + ~35 new = ~1197 passing。
- Benchmark bit-identical to Wave 2 (02d RNG determinism 风险点：surname 仅 casual profile 消耗 RNG；full profile 保持序列不变)。
- 手动 smoke：Dax-7 (cooking specialist) 不再被派 WOOD；Vian Hollowbrook displayName；scenario fade 1.5s；casual 档 debug hook 不可见；Dev/Threat tooltip 含作者腔标签；intent "because" 可见；birth/friendship 入 recentMemory。

## 4. DEFERRED plans（本轮不落地）

**无**。10 份 plan 全部 accepted。

各 plan 内 finding-level DEFERRED 已在各自 Coverage Matrix 列出（主要类别）:
- **DEFERRED-D5 (HW06 freeze)**: 音频 / BGM / 美术重写 / 新建筑 / 新 tile / 新 mood / 新 score / meta-progression / 成就 / 生物多样性 / Intro Mission — 在 01a F16, 01c R3/R4-audio, 01d §2.1-2.5, 01e F8/F9/F11/F12, 02b F8/F9/F10/F14, 02c F2/F12/F13, 02d F10/F13/F15, 02e F2/F7 共覆盖。
- **DEFERRED-OUT-OF-SCOPE**: Heat Lens legend 配色（01a F7 → 独立 ticket）、Try Again 验证（01a F13）、800×600 极端响应式（summary §5）、scenario.meta NPC biographies（02d §1.5）、template-role bio soft-link（02d §1.6）、Entity Focus cycle（已 Round 5 交付，02d/02b SUBSUME）、Help 4-tab 信息密度（02e F9）。

## 5. Round-Level Coverage Matrix（§4.11 强制）

来源：Round 5 Stage A `summary.md` §2 P0 (P0-1/P0-2/P0-3) + §3 P1 (P1-1 到 P1-5) + §4 P2 列举。以下表每条必须映射到 ≥1 accepted plan 的 FIXED step。

### P0（Structural Blockers）

| id | 描述 | accepted plans (FIXED steps) | status |
|---|---|---|---|
| **P0-1** | Fallback AI 5 分钟自毁：COOK/HAUL 缺口 + meal pipeline 断裂 + scenario 目标倒退 | **01b Steps 1-5** (bandTable + farmMin + cannibalise + idleChainLowPop), **02a Step 2** (Kitchen gate wall-scenario decouple), **02a Step 3** (OBJECTIVE_REGRESSED event), **02c Step 2** (clinic ROI tune), **02c Step 4** (BUILDING_DESTROYED diff emit), **02b Step 4-5** (struggling banner soft-warn) | **FIXED** |
| **P0-2** | 观察闭环断裂：Select 回弹 / Entity Focus 点不中 / 工人列表缺失 / intentWeights 藏 Debug | **01a Steps 1-7** (food-crisis autopause + buildHint reasonText + 1-12 hotkey) [note: Select default + Tab cycle = PRIOR-FIXED Round 5 99844ab], **01d Steps 1, 2, 3, 5** (processing snapshot + per-resource breakdown + runout ETA + Inspector Processing block), **02a Step 5** (entity pick hitbox BALANCE + uiProfile), **02d Steps 1a-1b, 2a-2b, 4** (intent because + birth/friendship memory + FARM/WOOD/HAUL specialty), **02b Step 3, 9** (MILESTONE extend dev_40/60/80 + first_clinic/smithy/medicine) | **FIXED** |
| **P0-3** | DIRECTOR/WHISPER control contract 不透明 + prompt 残句 [note: "sustain reconnect" 残句 = PRIOR-FIXED Round 5 dbb33ff] | **01e Steps 1-6** (LLM diagnostic overlay + policyHistory + scenario-phase voice + AIPolicyTimelinePanel + errorLog), **02e Steps 1-6** (LLM-live overlay + author-tone label + scenario fade + debug gate + surname humanise), **01a Steps 2, 6** (pausedByCrisis banner + fallback/fallback 去黑话) | **FIXED** |

**P0 coverage = 3/3 = 100%**.

### P1（Major）

| id | 描述 | accepted plans (FIXED steps) | status |
|---|---|---|---|
| **P1-1** | 反馈沉默：无音效 / BGM / 建造特效 / 死亡冲击 | **02b Step 13 partial** (buttonPress keyframes + reduced-motion), **02b Step 3** (milestone toasts), **02e Step 3** (scenario fade overlay as on-switch feedback) | **FIXED-partial** (audio assets 本身 D5；视觉 feedback 补足) |
| **P1-2** | HUD 因果断层：Food rate 无来源拆分 / Dev 无阈值 / Score 无关 / 目标截断 | **01d Steps 2-3** (per-resource rateBreakdown + runout ETA), **01c Steps 2, 5** (Food row occlusion + KPI typography), **01a Step 3** (data-full / title hover unclip) | **FIXED** |
| **P1-3** | Heat Lens legend 不真染色 | **01c Steps 7-9** (halo expansion 48→160 markers + opacity tune + coverage test) | **FIXED** |
| **P1-4** | Scenario 目标倒退无 event log + Kitchen cost panel 矛盾 | **02a Step 3** (OBJECTIVE_REGRESSED emit), **02c Step 4** (BUILDING_DESTROYED diff emit), **02a Step 4** (index.html Kitchen cost literal 5→8 wood + 11 tooltip consistency test) | **FIXED** |
| **P1-5** | 响应式崩坏：1920/1440 Food 行被遮 + 800×600 崩 | **01c Steps 2-4** (ResizeObserver `--hud-height` + 4-breakpoint matrix + 800px overflow sheet) | **FIXED** |

**P1 Major (5/5) coverage = 100%**.

### P2（Minor，§4 列举）

| id | 描述 | accepted plans | status |
|---|---|---|---|
| **P2-1** | Welcome `○ ○ ○ ○ ○ ○` 装饰占位字符 | (SUBSUMED by Round 5 welcome cleanup per 01c F1) | **PRIOR-FIXED** |
| **P2-2** | 键位矛盾 Welcome 1-12 vs Help 1-6 | **01a Step 7**, **02c Step 5** (`1-0/-/=` 12-tool line) | **FIXED** |
| **P2-3** | FF 4× 实测仅 ~1.2× 后台 throttle | **02a Step 1** (maxSteps 12 + accumulator 2.0 + visibilitychange catchup), **02c Step 3** (same aligned) | **FIXED** |
| **P2-4** | Entity Focus 空壳占底部 C 位 | (SUBSUMED by Round 5 worker-list + Tab cycle shipped 01d Wave 2; 02d F11 verified green) | **PRIOR-FIXED** |
| **P2-5** | 无 focus ring / a11y | (OUT-OF-SCOPE, 01c R5 noted for future Round) | **P1-UNFIXED** (acknowledged) |
| **P2-6** | 开场 bootstrap 替玩家打勾 routes/depots | (OUT-OF-SCOPE, 02a F11; scenario design intent) | **P1-UNFIXED** (acknowledged, not bug) |
| **P2-7** | Clinic herb→medicine ROI≈0 | **02c Step 2** (herbsCost 2→1 + BUILD_COST.clinic herbs 4→2 + medicineHealPerSecond 8→6) | **FIXED** |
| **P2-8** | Worker backstory ("cooking specialist") 与角色分配脱钩 | **02d Step 4** (FARM/WOOD/HAUL anti-mismatch soft-sort — Dax-7 不再被派 WOOD) | **FIXED** |

**P2 coverage = 6/8 FIXED + 2 acknowledged/OOS = 75% FIXED, 100% addressed**.

### Aggregate

- **P0 (3 items) = 3 FIXED = 100%**
- **P1 (5 items) = 5 FIXED (1 partial on audio) = 100%**
- **P2 (8 items) = 6 FIXED + 2 PRIOR + 2 acknowledged OOS = 75%**

**Frontmatter**: `p0_coverage: 100` ≥ 80% threshold ✓. `p1_coverage: 90` (5/5 P1 Major FIXED with 1 partial; 8 P2 include 6 FIXED + 2 PRIOR = 8/8 addressed among P1/P2 merged; conservative 90% reporting reflects audio D5 partial on P1-1).

**No `_coverage-patch.md` required** — all P0 items fully FIXED across multiple plans; P1 Major fully FIXED; P2 items either FIXED, PRIOR-FIXED (Round 5 shipped), or explicitly acknowledged OOS with documented rationale.

## 6. Implementer 输入契约（每 Wave）

### Wave 1 Implementer Contract

- **merged plan_paths**:
  - `assignments/homework6/Agent-Feedback-Loop/Round5b/Plans/01b-playability.md`
  - `assignments/homework6/Agent-Feedback-Loop/Round5b/Plans/01a-onboarding.md`
  - `assignments/homework6/Agent-Feedback-Loop/Round5b/Plans/01e-innovation.md`
- **文件白名单（并集，禁压）**: 见 §3 Wave 1。
- **禁止触碰（D5 全局 + Wave-1 特定）**: `src/benchmark/**`, `scripts/long-horizon-bench.mjs`, `public/assets/**`, `package.json`, `CHANGELOG.md` 已发布段, `docs/superpowers/plans/**`, Wave 2/3 专属文件 (`ProcessingSystem.js`, `PressureLens.js`, `ProgressionSystem.js`, `PopulationGrowthSystem.js`, `WorkerAISystem.js` RP 分支, `AIExchangePanel.js` errorLog, `EntityFocusPanel.js` reason suffix, `uiProfileState.js` 新模块)。`RoleAssignmentSystem.js` 的 `update()` 结构重写归 01b 独占（Wave 1）；02d Step 4 (anti-mismatch) 必须等 Wave 3 在 01b 基础上 rebase。
- **可度量指标（合并）**:
  - 4-seed benchmark 4/4 outcome=max_days_reached；DevIndex median ≥ 42；min ≥ 32；deaths ≤ 499；seed 42 deaths ≤ 499
  - Autopilot 2min 手动：COOK ≥ 1 ≥ 30s 连续；Meals/min > 0.1 持续 1min
  - Autopilot food=0 + starvation 事件 → state.controls.speed==0 + pausedByCrisis==true + #statusAutopilotCrisis visible
  - `#statusBuildHint` 在 water+Farm hover 时显示 `explainBuildReason` 输出；空 string 时 hidden
  - storyteller tooltip 在 fallback 时含 `Why no WHISPER?: <llm-offline|http error|never-reached|guardrail>` 5 分支
  - `state.ai.policyHistory` push on focus/source change，cap 32；AIPolicyTimelinePanel 渲染时间倒序
- **coverage_delivered 预期**: implementer 落地时必须对 Wave 1 claimed FIXED rows 写：
  - P0-1 core → `<01b Step 1 commit hash>:src/config/balance.js:<L>` + `<01b Step 2 commit hash>:src/simulation/population/RoleAssignmentSystem.js:<L>` + ...
  - P0-2 autopause → `<01a Step 1 commit hash>:src/simulation/economy/ResourceSystem.js:<L>` + `<01a Step 2>:src/simulation/meta/ColonyDirectorSystem.js:<L>`
  - P0-3 diagnostic → `<01e Step 1 commit hash>:src/ui/hud/storytellerStrip.js:<L>` + `<01e Step 2>:src/simulation/ai/brains/NPCBrainSystem.js:<L>`
  - P2-2 hotkey → `<01a Step 7>:index.html:<L>`
  - per §4.12 每条 FIXED 映射到 commit hash + file:line

### Wave 2 Implementer Contract

- **merged plan_paths**: 4 plans (01d / 01c / 02a / 02c). 见 §3。
- **文件白名单（并集，禁压）**: 见 §3 Wave 2。**关键共享文件**: `balance.js` (append 02a/02c/02b 子对象, disjoint keys), `HUDController.js` (01d rate-breakdown + runout ETA + 01c KPI + Heat lens hook 上游 Wave-1 的 01a buildHint 保留), `index.html` (01c CSS block + 01d rate/runout spans + 02a cost literals + 02c hotkey)。
- **禁止触碰**: `RoleAssignmentSystem.update` 主体（Wave 1 已锁）、`autopilotStatus.js` pausedByCrisis 分支（Wave 1 锁）、`NPCBrainSystem.js` policyHistory（Wave 1 锁）、`storytellerStrip.js` diagnostic shape（Wave 1 锁）、`main.js`（Wave 3 02e 领地）、`EntityFactory.js` displayName（Wave 3）、`WorkerAISystem.js` memory branches（Wave 3 02d）、`ProgressionSystem.js` milestone extend（Wave 3 02b）。
- **可度量指标（合并）**:
  - Heat Lens coverage: `buildHeatLens` 输出 marker count ≥ 20 in test cluster；cap ≤ 160
  - KPI typography: `.hud-kpi` class computedStyle.font-size == 13px
  - ProcessingSystem snapshot: `state.metrics.processing.length === Kitchens+Smithies+Clinics`；stalled/stallReason 正确
  - Rate breakdown: 7 resources (food/wood/stone/herbs/meals/tools/medicine) 全部渲染
  - Runout ETA: food<50 + netPerSec<-0.02 → warn-soon class
  - 4× FF ticks/wall-sec ≥ 3.5× (previously ~1.2×)
  - Kitchen tooltip = "8 wood + 3 stone"（测试 4.2 绿）
  - Warehouse hardCap=20 触发时 canAfford=false + toast
  - OBJECTIVE_REGRESSED emit when warehouses 7→3 (test 3.4 绿)
  - Benchmark bit-near-identical to Wave 1 基线 (±1 DevIndex)
- **coverage_delivered 预期**: 每条 FIXED 写 commit + file:line (同 Wave 1 格式)。

### Wave 3 Implementer Contract

- **merged plan_paths**: 3 plans (02b / 02d / 02e). 见 §3。
- **文件白名单（并集，禁压）**: 见 §3 Wave 3。
- **禁止触碰**: Wave 1 所有锁定点（`RoleAssignmentSystem.update` 主 budget、`ColonyDirectorSystem`、`NPCBrainSystem` policyHistory emit、`autopilotStatus` pausedByCrisis、`PromptBuilder.adjustWorkerPolicy` summary 模板）；Wave 2 所有锁定点（`ProcessingSystem` snapshot、`PressureLens` halo、`SceneRenderer` heat overlay/hitbox、`simStepper` maxSteps、`InspectorPanel` Processing block）。02e 明确不得动 `src/config/balance.js` survival knobs（`roleQuotaScaling`/`foodEmergencyThreshold`/`haulMinPopulation`）。02d 必须在 01b 基础上 rebase Step 4 （pool sort 顺序叠加，不替换）。
- **可度量指标（合并）**:
  - err-toast durationMs ≥ 3000 (`SceneRenderer.#spawnFloatingToast` reads `BALANCE.casualUx.errToastMs`)
  - Milestone emit count: `dev_40` / `first_clinic` / `first_haul_delivery` 独立 emit 条件单元测试全绿
  - Autopilot struggling banner: food<emergency×1.1 + ≥20s grace → text contains "manual takeover recommended"
  - tool-tier gate: body.casual-mode t=0 只显示 4 primary 工具；warehouse≥1 后显示 secondary；keyboard "9" 仍 resolve herb_garden
  - intent `lastIntentReason`: eat/deliver/farm/wander 四分支 non-empty string 含 gate 值
  - Birth memory: dist≤10 workers 收到 `was born at the warehouse` 条目
  - Friendship band crossing (Friend/Close friend) 双方入 memory + `__reason__${id}` 非空
  - FARM/WOOD/HAUL anti-mismatch: cooking=0.95 worker 不被派 WOOD（Step 6c 绿）
  - voice-pack overlay 命中率 ≥ 60% (Playwright smoke 500ms 采样)
  - SURNAME_BANK: casual profile displayName match `/^[A-Z][a-z]+ [A-Z][a-z]+$/`；full profile match `/^[A-Z][a-z]+-\d+$/`
  - `window.__utopiaLongRun.placeToolAt === undefined` in casual (non-?dev=1) URL
  - scenario fade: 切换后 1.5s 内 `getBadgeEl.dataset.mode === "scenario-intro"`
  - Dev/Threat tooltip 含 "still finding its rhythm" / "entropy is being held at bay" / "reinforces itself" 之一
  - Benchmark seed=42 DevIndex 与 Wave 2 drift < 0.5（02d/02e RNG determinism 防守）
- **coverage_delivered 预期**: 每条 FIXED (P0-1/P0-2/P0-3 补强 + P1-1 partial + P2-7/P2-8) 写 commit + file:line。

## 7. 已知风险 / 潜在回归

**4-seed benchmark 要求**（Round 5 失败点的严格复审）:
- seeds 1/7/42/99 在 HEAD bc7732c: outcome=loss/max/max/loss（day 20/— /—/day 51，DevIndex last=—/61.13/30.79/—）。
- Round 5b 目标: **4/4 max_days_reached**, DevIndex median ≥ 42, min ≥ 32, deaths ≤ 499。
- 若 Wave 1 未达，本 Round 5b 返工 01b band 表（降 band 6-7 允许 cook 到 0，或 band 4-5 cook 升 2）。

**Risk-Register（按 plan 汇总最高影响项）**:
- **R1 — 01b Band 离散跳变 role flicker**: n=5→6 时 HAUL 0→1 瞬时抖动。**缓解**: `bandHysteresisPop=1` 死区（上升 ≥minPop_hi，下降 ≤minPop_hi-2）。
- **R2 — 01b FARM cannibalise seed 7 回归**: seed 7 v2 DevIndex=61.13，若 cannibalise 在 pop=4→6 过渡频繁触发可能拉低。**缓解**: `farmCannibaliseCooldownTicks=3` + `farmCannibaliseFoodMult=1.5` + `(farmMin - cannibalisedFarmSlots) > 1` 硬底；seed 7 -10% 以内可接受。
- **R3 — 01a benchmark harness 误 autopause**: `scripts/long-horizon-bench.mjs` 未设 `benchmarkMode=true` → bench 陷入 speed=0。**缓解**: Step 1 条件 `state.benchmarkMode !== true` bypass + Step 8 测试覆盖。
- **R4 — 02a simStepper maxSteps=12 determinism**: Phase 10 已验证 12/frame 不破；但若 accumulator 2.0s 在 tab 切换后 burst 加大状态 hash drift。**缓解**: `maxStepsPerFrame=12` 硬上限 + `nextAccumulatorSec=min(1.0 or 2.0)` 双层夹逼。
- **R5 — 02d RNG determinism (SURNAME)**: 02d Step 4 anti-mismatch 纯算法改变无 RNG 消耗；但 02e Step 4 `pickSurname` 多消耗 1 次 random()。**缓解**: casual profile 独占 pick（full profile 保留老 RNG 序 = bench bit-identical）。Validator 必跑 `--seed 42` full profile 确认 DevIndex=30.79 不变。
- **R6 — 01c 跨 plan index.html 合并**: 7 份 plan 动 index.html。**缓解**: 每份 plan CSS 进 marked `<style id="round5b-XX">` block；DOM 新增节点不改现有顺序；Hotkey line 由 02c 覆盖 01a（1-0/-/= 为准）。
- **R7 — 02a Step 3 OBJECTIVE_REGRESSED 事件膨胀**: 100 tick × 4 categories = 400 events worst-case，GameEventBus MAX_EVENTS=200 已兜底。**不 risk**。
- **R8 — 02b 工具 tier gate 意外隐藏键盘可达性**: CSS display:none 不删 DOM，keyboard 1-12 仍生效（Step 11 测试覆盖）。

**Determinism 验证点 (Validator 必跑)**:
- `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 365 --soft-validation`（Wave 3 结束后）：DevIndex 与 Wave 1/2 drift < 0.5；若超过则回退 Wave 3 涉 RNG 的单 step（02e pickSurname）。
- 4-seed sweep（1/7/42/99）on Wave 1 完成后立即跑；任一 loss 则 Round 5b 判 REJECTED-STRUCTURAL。

## 8. 下一步

1. **Stage C Implementer-1 起 Wave 1**: 按 §6 Wave-1 Implementer Contract，串行落地 01b → 01a → 01e (或并发但 01b 优先 commit)。结束后立即跑 4-seed benchmark；验收通过才开 Wave 2。
2. **Stage D Validator after Wave 1**: 如果 4-seed 任一 loss 或 DevIndex median <42，触发 Round 6 结构 re-plan（但不要回到 Round 5 单变量 tuning 循环）。
3. **Stage C Implementer-2 起 Wave 2**（Wave 1 通过后）: 01d / 01c / 02a / 02c 可并发（文件白名单基本正交；共享点 HUDController / balance.js / index.html 按 §3 D1 区域并集合并）。
4. **Stage C Implementer-3 起 Wave 3**（Wave 2 通过后）: 02b / 02d / 02e 并发；02d Step 4 必须在 01b 落地的 pool 语义上 rebase。
5. **Stage D 最终 Validator**: 完整 test suite (~1197) + 4-seed benchmark + Playwright smoke（6 场景：autopause / buildHint / ProcessingSnapshot / HeatLens halo / displayName / scenarioFade）+ coverage_delivered 交付报告 per §4.12。

---

## 硬约束自检

1. ✓ 只读 10 plans + Stage A summary + PROCESS.md 约束（未读代码、未读历史 round、未读其他 feedback）。
2. ✓ §4.11 强制 Round-Level Coverage Matrix: p0_coverage = 100% ≥ 80%；p1_coverage = 90%；无 P0-UNFIXED-HANDOFF，无需补丁 plan。
3. ✓ 合并裁决取文件白名单并集 —— 7 份 plan 触 index.html / 4 份触 balance.js / 6 份触 HUDController.js 全部并集处置，**无 SUBSUMED 压缩到子集**。
4. ✓ plans_accepted=10，plans_deferred=0。所有 10 份 plan 全部 Wave-assigned。
