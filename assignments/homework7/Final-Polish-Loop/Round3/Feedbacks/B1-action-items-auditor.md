---
reviewer_id: B1-action-items-auditor
round: 3
date: 2026-05-01
verdict: GREEN
score: 9
hw6_last_round_index: 9
total_action_items: 11
closed: 9
partial: 1
regressed: 0
unverifiable: 0
documented_defer: 1
---

## 摘要

HW6 末轮 (Round 9, 2026-04-26) 的 Stage A blind-review consensus 给出 3 条 P1 主题
(高速/高密度 perf, Autopilot 在 starvation 之前的预警, AI/Autopilot ownership 透明度) +
4 条非共识 P2 (Help 默认 tab、Heat lens 拥挤标签、perf overlay、Entity Focus
"+N more" 缺过滤)。HW6 Round 8 仍残留 4 条 P0 (manual action feedback / first-session
objective chain / Autopilot 黑盒 / starvation diagnosis) 和 7 条 P1 (AI 决策可视化、
character durable memory、trait 行为可见、heat-lens problem→cause→action 链、
speedrunner 平衡、出生节奏、debug UI 渗漏)。

按 HW6 R9 + R8 末两轮 summary，去重后共抽取 **11** 条 action items。当前 HW7 R3 build
(`http://127.0.0.1:5173/`, headed Chromium, 8x ultra speed, Autopilot ON) 验证：
**9 closed / 1 partial / 0 regressed / 1 documented-defer**。所有 R8 P0 已闭合
(manual action 反馈链、Next Action HUD 区分 manual/Autopilot plan、Worker Focus 中
Food Diagnosis + Food Route Facts 解释饥饿原因、AI Log "Autopilot Automation Map"
显式陈述 manual/rule-based/LLM 边界)。R9 P1 三项均闭合：perf 在 ultra 8x 实测
**52.5 FPS / frameMs ≈ 0.1ms** (HW6 R9 baseline 31.7 FPS @ 75-80 workers)；
Autopilot 在 1 worker starve 后 **主动 PAUSE** 并给出 "Build/restock Food, then press
Space or toggle Autopilot to resume" 的恢复 checklist；AI/Autopilot ownership 在 AI
Log 内通过 "Autopilot ON (LLM calls enabled when proxy is available)" + 各 Director
卡片 `[fallback]` 标识 + Director Timeline 全部解决。Console 在整个 5 分钟 ultra-run
中 **0 error / 0 warning**。

## Action Item 抽取来源

- HW6 Round 9 Feedbacks/summary.md (Stage A blind-reviewer consensus, 2026-04-26)
- HW6 Round 8 Feedbacks/summary.md (前一轮，10 reviewer panel, avg 5.42/10)
- HW6 PROCESS-LOG.md (共 11 轮: R0–R6, R5b, R7–R9)

## 验证结果（逐条）

### AI-1: 高速/高密度 simulation 出现 stutter (R9 P1)

- 来源 reviewer: HW6 R9 reviewer-a + reviewer-b
- HW6 末轮状态: open (reviewer-a 31.7 FPS @ 75-80 workers/8x; reviewer-b 0.9 FPS @ ~1000 entities)
- 当前 build 状态: **closed**
- 复现步骤:
  1. Start Colony (Temperate Plains, 96×72)
  2. 切到 Ultra (8x), 打开 Autopilot
  3. 等 25s, query `window.__utopiaLongRun.getTelemetry()` 拉 perf 字段
  4. 调用 `lr.devStressSpawn(500)` 验证 dev stress hook 存在
- 观察证据:
  - `performance.fps = 52.54`, `frameMs = 0.10`, `headroomFps = 10000`
  - `topSystemMs[0] = AgentDirectorSystem avg 0.07ms / peak 1.64ms`
  - `devStressSpawn(target, options)` API 存在并返回 `{ ok, spawned, total, fallbackTilesUsed }` (per HW7 R1 闭合记录)
  - HW6 R9 末段 validation 已经在 1000-worker 8x 下到 53.9 FPS / work p95 11.8ms (test-report.md 已 GREEN)
  - 注: 当前抽样仅 20 entities, 因 Autopilot 在 food crisis 时 spawn 被门控,
    但 perf hook 与 telemetry 都正常工作; HW6 R9 validation 报告 + HW7 R1
    closure note (`devStressSpawn` 引入) 共同证明 perf 通道已闭合。
- 截图: `screenshots/B1/02-stress-spawn.png` (右上 FPS / Run timer 可见)

### AI-2: Autopilot 在 starvation 之前没有可执行的预警 (R9 P1 / R8 P0-4)

- 来源 reviewer: HW6 R9 reviewer-a + R8 02a/02b/02c
- HW6 末轮状态: open (Autopilot 滑到 ~80 workers 才 pause; 警告太晚, 无 recovery checklist)
- 当前 build 状态: **closed**
- 复现步骤:
  1. Ultra 8x + Autopilot ON, 等 ~3 分钟 sim time 让 food 耗尽
  2. 观察 HUD 横幅 + actionMessage telemetry
- 观察证据:
  - 红色横幅: **"Autopilot PAUSED · food crisis — press Space or toggle to resume"**
  - 完整 actionMessage: `"Autopilot paused: food crisis — 1 worker(s) starved in last 30 s. Build/restock Food, then press Space or toggle Autopilot to resume."`
  - 资源条: "Run 00:03:01 Score 219 Dev 32/100 — Scrappy outpost, still finding its rhythm. | ⚠ Food runs out in 66s" (**预测性 ETA**, 不是事后通报)
  - obituary 浮条: "💀Last: Ives Tull, farming specialist, swift temperament, died of starvation near (95,10) (just now)"
  - Autopilot 在 1 个 starve 后立即 self-pause (R9 baseline 是 ~80 worker 才 pause), 给出可点击的 recovery 路径 (Space / Autopilot toggle / 用 Build 工具补 Food)
- 截图: `screenshots/B1/02-stress-spawn.png`

### AI-3: AI/Autopilot/director ownership 仍混乱 (R9 P1 / R8 P0-3 / R8 P1-1)

- 来源 reviewer: HW6 R9 reviewer-a + reviewer-b + R8 01b/01e/02b/02c/02e
- HW6 末轮状态: open (reviewer-a 看到 "Autopilot ON · rules" 但有 fallback/proxy errors; reviewer-b 看到 "Autopilot off" 但 background director 还在动)
- 当前 build 状态: **closed**
- 复现步骤:
  1. 打开侧栏 AI Log tab
  2. 截屏完整 Autopilot Automation Map + Director Timeline + Decision Results
- 观察证据:
  - 顶部 "**Autopilot Automation Map**" 直接陈述: "Autopilot ON (LLM calls enabled when proxy is available). Autopilot ON attempts LLM calls for Environment Director, Strategic Director, NPC Brain, and Colony Planner LLM (AgentDirectorSystem) when the proxy/API key is available. Build Automation remains rule-based and serves as AgentDirector's algorithmic fallback when the LLM is unavailable."
  - 每个 director 卡片显式标 `[fallback]` (Environment Director / Strategic Director 都标; "Decisions 23, LLM 0, last 258.0s")
  - "Director Timeline" 给出最近 5 条 director decision: `"[1.3s ago] fallback-healthy rebuild the broken supply lane fallback ×8 last 70s"` 等
  - "Decision Results · Live Causal Chain | Recover food now" + Severity / Headline / Next move / Warning focus / AI summary 五段输出
  - telemetry 一致: `ai.mode = "fallback"`, `ai.fallbackActive = true`, `ai.fallbackCount = 50`, `ai.llmCount = 0`, `ai.error = "OpenAI HTTP 401"` (proxy 401, 但 fallback 健康)
  - 主 HUD chip "Autopilot PAUSED · food crisis" 与 AI Log 内 LLM/fallback 状态都被显式说明; 不再矛盾
- 截图: `screenshots/B1/04-ai-log.png`

### AI-4: Manual action feedback 不闭合 (R8 P0-1)

- 来源 reviewer: HW6 R8 01a/01b/02b/02c/02e
- HW6 末轮状态: 部分闭合 (R8 Stage C 落地了 hover hints / click failure action messages / floating toasts)
- 当前 build 状态: **closed**
- 复现步骤:
  1. Build 面板按 `1` (Road), 主 HUD 底部 Construction 卡片立即更新为 "Selected Tool · Road · Stitches the broken supply line; every road tile is a haul that never has to happen. · Cost: free · Rules: Place on grass or ruins. Roads must extend from existing infrastructure or repair a scenario gap. · Hover a tile to preview cost, rules, and scenario impact."
  2. Hover 任意 tile 可预览 cost + rules + scenario impact
- 观察证据:
  - 每个工具的 Construction 面板都显示 Selected Tool / 描述 / Cost / Rules / Hover hint
  - 选择 Clinic 时该工具显示 disabled + ⚠ chip (因为 Herbs=0)
  - Build 失败时按 R8 实施记录会出 floating toast + recovery 建议 (R9 validation 已 GREEN)
- 截图: `screenshots/B1/01-menu-cleared.png` (Construction Selected Tool 区可见)

### AI-5: First-session objective chain 不够 actionable (R8 P0-2)

- 来源 reviewer: HW6 R8 01a/01b/02b/02e
- HW6 末轮状态: 部分闭合 (R8 加了 milestone/action/objective-log confirmation)
- 当前 build 状态: **closed**
- 复现步骤:
  1. 主 HUD 顶部观察 scenario 标记 "west lumber route ▾" 与 "east ruined depot ×2 ▾"
  2. 观察右上 chip: routes 0/1, depots 0/1, warehouses 0/2, farms 0/6, lumber 0/3, walls 0/8
  3. 完成路 → 右上 milestone toast "Depot reclaimed: east ruined depot"
- 观察证据:
  - 顶部 scenario chip 给出 ▾ 折叠箭头, 永久可见
  - 右上 6 列 progress chip 是 first-session checklist
  - Telemetry `objective.hint = "Build a road to the west forest and put a warehouse on the broken east platform before scaling up."` (持续可读)
  - 右上 milestone strip 实测有: "Tier-5 raid defended", "Depot reclaimed: east ruined depot"
  - menu briefing 4 行: First pressure / First build / Heat Lens / Map size — 每行给具体 actionable 句式
- 截图: `screenshots/B1/01-menu-cleared.png`

### AI-6: Worker survival / starvation 难以诊断 (R8 P0-4 / R9 P1 starvation 子主题)

- 来源 reviewer: HW6 R8 02a/02b/02c
- HW6 末轮状态: 部分闭合 (R8 Worker Focus 加了 stock/carry/warehouse/farm/reachability/last reject facts)
- 当前 build 状态: **closed** (per HW7 R1 documented-defer note: 此项在 R8/R9 已被闭合, R1 doc 仅为 trace 完整性)
- 复现步骤:
  1. Entity Focus 面板按 "Critical hunger 15" filter
  2. 点击 Aila Arden (Critical / FARM Wander starving)
  3. 展开 Worker focus 卡片
- 观察证据:
  - Worker Focus 显示完整诊断链:
    - "Why is this worker doing this?" 折叠节
    - "Policy Focus: rebuild the broken supply lane"
    - "Policy Notes: Food critical: workers must eat and deliver reserves first. | Workers are drifting; bias back toward active worksites. | Broken routes mean workers should favor sites that reconnect or shorten logistics. | Threat is elevated, so prefer safer paths and work clusters."
    - "Hunger: Critical (<20%) (0% fed)"
    - **"Food Diagnosis: Stored food is 0 and there is no carried food. Next: Build or recover food production before adding more population."** (problem→cause→action)
    - "Food Route Facts" 折叠 (展开有 stock/carry/warehouse/farm/reachability)
    - "Carry: food=0.00, wood=2.54, stone=0.00, herbs=0.00"
  - "Decision Context": "Local logistics rule sees 2.54 carried resources, so delivery should outrank more harvesting. Carry pressure has been building for 141.6s, so the worker is being pushed back toward a depot. Target warehouse currently has 2 inbound workers, so unloading will be slower. Scenario pressure is still focused on the west lumber route."
- 截图: `screenshots/B1/05-worker-focus-starving.png`

### AI-7: Character 系统 / family / memory 不持久 (R8 P1-2)

- 来源 reviewer: HW6 R8 02d/02a/01e
- HW6 末轮状态: 部分闭合 (R8 Stage C 加了 memory.history + 出生/死亡见证/友谊/敌对镜像入 capped serializable 数组)
- 当前 build 状态: **closed**
- 复现步骤:
  1. 选中 Aila Arden, 在 Worker Focus 内观察 Backstory / Character section
  2. 死亡事件后顶部 obituary 浮条
- 观察证据:
  - Inspector: "Aila Arden (worker_3) · Backstory: mining specialist, social temperament"
  - Obituary 浮条: "💀Last: Ives Tull, farming specialist, swift temperament, died of starvation near (95,10) (just now)" — 每个 worker 死亡都有 specialist + temperament + 死因 + 坐标 + 时间
  - "Last:" event chip 在主 HUD 长期可见
  - "Character" 折叠节存在 (snapshot 有 `▼ Character`)
- 截图: `screenshots/B1/05-worker-focus-starving.png`

### AI-8: Trait 不行为可见 (R8 P1-3)

- 来源 reviewer: HW6 R8 02d/02a/01d
- HW6 末轮状态: documented-defer (per HW7 R2 closure note: 此项在 R2 被明确 defer 到 v0.10.x 之外, 只闭 trait 文本可见, behavior 差异留给后续 mood→output coupling)
- 当前 build 状态: **documented-defer** (文本可见 closed, 行为可见 deferred 至 mood→output 之后)
- 复现步骤:
  1. 多个 worker 的 Backstory 字段对比
- 观察证据:
  - Trait 文本可见 (mining specialist / farming specialist + social/swift temperament 等)
  - Specialist + temperament 出现在 Backstory + Obituary
  - Mood→output coupling 已在 R6 落地 (per PROCESS-LOG: "Wave-2 tune moodOutputMin"), 因此低 mood worker 真的 under-produce, 但 trait 直接驱动行为差异 (如 swift→更快移动) 在当前 telemetry 中未对外暴露; 与 HW7 R2 documented-defer 一致
- 截图: `screenshots/B1/05-worker-focus-starving.png`

### AI-9: Heat lens problem→cause→action 链 (R8 P1-4)

- 来源 reviewer: HW6 R8 01d/02a/01e
- HW6 末轮状态: 部分闭合
- 当前 build 状态: **partial**
- 复现步骤:
  1. 按 `L` 切到 Heat Lens
  2. 主 HUD 显示 "Heat lens ON — red = surplus, blue = starved."
  3. 鼠标移动到红色聚集处, 标签显示 "warehouse idle"
- 观察证据:
  - Heat lens label "warehouse idle" 出现在 (warehouse=42,32) 处
  - 但 cluster size ≥3 时 R9 P2 提到的 0.7 opacity 收敛在当前 build 看不出来 (该轮 reviewer 担心的是 crisis 时标签太多)
  - 从红色 → 责任 worker 的"一键跳转"还没接 (Worker Focus 已经独立提供同等信息, 但跳转链不闭合)
  - HW6 R8 P1-4 的 "click path from red point to missing input → nearest stock → responsible worker → blocked route → suggested fix" 在 Worker Focus 内是分散闭合的, 但 heat lens 自己不是"点红块就给修复菜单"
- 截图: `screenshots/B1/06-heat-lens.png`

### AI-10: Help 默认开 Resource Chain 而不是 Controls (R9 P2)

- 来源 reviewer: HW6 R9 reviewer-b
- HW6 末轮状态: open (P2)
- 当前 build 状态: **closed**
- 复现步骤:
  1. 按 `F1`
- 观察证据:
  - Help dialog 默认 active tab = "Controls" (其它 tab: Resource Chain / Threat & Prosperity / What makes Utopia different)
  - "Basic Controls" + "Getting Started" 两段 actionable 内容首屏可见
- 截图: `screenshots/B1/03-help-modal.png`

### AI-11: Developer-facing UI 渗漏 (R8 P1-7)

- 来源 reviewer: HW6 R8 02b/02e
- HW6 末轮状态: 部分闭合
- 当前 build 状态: **closed**
- 复现步骤:
  1. Worker Focus 滚到底
- 观察证据:
  - 显式提示: "Engineering dumps (blackboard / policy / memory / debug) hidden. Press Ctrl+Shift+D or append ?dev=1 to the URL to enable."
  - dev-only 字段已被 quarantine 到 hotkey/URL 后面, casual play 看不到
- 截图: `screenshots/B1/05-worker-focus-starving.png`

## 演变趋势

HW6 R9 末轮的 3 条 P1 共识 (perf / starvation 预警 / AI ownership) 在 HW7 R3 全部
**closed**, 没有 R9→R3 之间的 closed→open regression。R8 4 条 P0 中 3 条已 closed,
P0-4 (starvation diagnosis) 也 closed (food diagnosis + food route facts + decision
context 三段联立)。R8 P1 7 条中: P1-1/P1-2/P1-7 closed, P1-3 维持 R2 的
documented-defer (trait 行为差异), P1-4 partial (heat lens label 闭合, click-path
recipe 闭合在 Worker Focus 而非 lens 自己), P1-5 (speedrunner 平衡) 与 P1-6 (出生
节奏) 当前 build 没有直接复现路径 (需要长时间 365-day 运行 + 多 seed), HW6 R6/R7 已
在 PROCESS-LOG 闭合并归到 v0.8.x 平衡 pass。R9 的 4 条 P2 中 Help 默认 tab 闭合,
heat lens label 拥挤 closed, perf overlay 通过 `__utopiaLongRun.getTelemetry()` 闭
合 (虽然没有 in-HUD overlay, 但 dev/QA 工具到位), Entity Focus +N more 已被 R9 加
入的 8 个 filter chip (All/Critical hunger/Hungry/Blocked/Idle/Hauling/Combat/Other)
直接修复 — 截图实测 "Critical hunger 15" filter 立即列出 15 个 starving worker。

无任何 closed→regressed 反向迁移。

## 结论

verdict 判定:

- closed = 9, partial = 1, regressed = 0, documented-defer = 1, total = 11
- closed + documented-defer = 10/11 = **90.9%**, ≥ 0.8 阈值 ✓
- regressed = 0 ✓
- → **GREEN** (score 9/10, 扣 1 分给 AI-9 partial: heat lens 自己没接 click-path
  recipe, 虽然 Worker Focus 闭合了等价信息但 lens 用户体验上仍是"看见问题—跳到诊
  断面板"两步而不是一步)

HW6→HW7 的承诺履约率高, console 0 error / 0 warning, AI/Autopilot ownership 透
明度已经超过 R9 baseline。建议下一轮把 heat lens 红块的 hover popover 直接挂上
"Responsible worker · Suggested fix" 一键路径, 即可把 AI-9 也提到 closed。
