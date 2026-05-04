# 最终评审讲稿（NOTES）

> 整合自原 7 份 md（PRESENTATION-SCRIPT / TWO-PILLARS / KEY-METRICS / Q&A-PREP / DEMO-PLAN / SLIDE-OUTLINE / README）。
> 演讲时只看本文件即可。
>
> **目标时长**：7:00（5–8 min 窗口，留 1 min buffer）
> **风格**：口语化，不要逐句念稿；`[方括号]` 是动作提示，不是台词
> **Slides**：`slides.html`（10 页，自包含 HTML，与游戏暗色等宽风格一致）

---

## §0 关键数字（背下来 / Q&A 直接引用）

| 项 | 值 |
|---|---|
| HW7 总轮次 | **13** 轮（R0 → R13） |
| 最终 HEAD | `9c7ed5a`（R13 ship）→ 后续合并 commit `463f68c` |
| 测试 | **2060 pass / 0 fail / 4 skip**（R13 baseline） |
| HW7 内新增测试 | **+395**（R0 baseline 1665 → R13 2060） |
| 0 fail 连续轮数 | **7 轮**（R7 → R13） |
| Worker FSM 状态数 | **12**（IDLE / SEEKING_HARVEST / HARVESTING / DELIVERING / DEPOSITING / SEEKING_BUILD / BUILDING / SEEKING_PROCESS / PROCESSING / SEEKING_REST / RESTING / FIGHTING） |
| Worker FSM transition 规则 | **38** 条 priority-ordered |
| `PriorityFSM.js` dispatcher | **125 LOC** 一个屏幕显示得下 |
| Visitor FSM | 9 状态（R5 wave-3.5 已迁移） |
| AnimalAI | 仍在 legacy StatePlanner（HW8 候选） |
| LLM 模型 | `gpt-5.4-nano` via OpenAI direct API |
| LLM round-trip 延时 | ~1.5–3s（planner 0.5s sim-time cadence gate） |
| Grid | 96 × 72 = **6912 tiles** |
| Tile 类型 | **14**（GRASS / ROAD / WATER / FOREST / ... / BRIDGE / GATE） |
| A\* | 8-neighbor cost-weighted |
| Boids weights（动物 / 无路径） | sep 1.0 + align 0.6 + coh 0.4 + seek 1.2 |
| Boids weights（worker 沿路径） | **sep 0.35**（dampened，A\* 主导） |
| Bridge 决策 | **dual-search** A\*（allowBridge: false vs true） |
| TRAFFIC_AMORTIZATION | **50** round trips |
| DevIndex day-90 轨迹 | HW6 baseline **37.77** → HW7 R8 峰值 **73.18 (+93.7%)**，90 天全程存活 |
| Stop-condition | 4/7 fully met（A1 / A2 / B1 / Validator MET；C1 / B2 / 人类 playtest 未 MET） |

**金句（可逐字引用）**：

- "I shipped a flat priority FSM dispatcher in 125 lines of code; the entire transition table fits on one screen."
- "Dual-search A\* costs both with-bridge and without-bridge, scores by build cost plus length times an amortization of 50 round trips, and picks the lower."
- "A\* gives the route, Boids handles local avoidance — with separation dampened to 0.35× when the worker has an active path so we get visible flowing convoys."
- "DevIndex went from 37 — the HW6 baseline — to 73 at the R8 peak, almost double, with the colony surviving the full 90-day benchmark window."

**别主动说**（被问到再老实说）：

- bundle 1.95 MB raw / 0.55 MB gzip，vendor-three 612 KB 是 Three.js 不可避免
- Post-Mortem 还有 4 节作者占位 prose
- demo video URL 还没 finalize
- AnimalAI 仍在 legacy StatePlanner
- 真实 Chrome FPS 还没量（headless RAF cap workaround 已在用）

---

## §1 Intro & How It Works（1:30）

> *[切到游戏，splash 可见]*

"Hi, I'm Daize, NetID dd1376, solo project. This is **Project Utopia** — a minimalist colony simulation where the player **doesn't micromanage individuals**. You build infrastructure and set high-level priorities; **autonomous agents** living on a tile grid figure out the rest. Every living thing — workers, visitors, predators, herds — is rendered as a simple sphere on a 96×72 tile grid."

> *[点 Start Colony，~12 个 worker sphere 出现，食物开始消耗]*

"Each of those spheres is independently deciding what to do every tick. The colony has a global resource pool — food, wood, stone, herbs — and as soon as anything goes critical, you'll see workers re-prioritize. That's the gameplay loop: **the system reacts; you steer**."

> *[点一个 worker，Inspector 面板打开]*

"Each agent has a backstory, a current FSM state, an intent, hunger and morale, and a 'food diagnosis' explaining what they're trying to do and why. The whole point is to make the AI **interpretable** — you can always click and see why."

> *[可选 5s — 打开 AI Log 一眼]*

"There's also an AI Log showing the strategic director's decisions, and the system can be driven by a real LLM — GPT-class model — that reads the colony state and emits high-level plans. Those plans become tasks the FSM executes."

---

## §2 Pillar 1 — NPC AI（2:00）

"Now the two CG pillars. **First, NPC AI.**"

> *[Inspector 高亮 worker FSM 状态]*

"My original spec proposed **Behavior Trees with a shared blackboard**. After building the first version I realized BT was the wrong shape for our problem — and I'll explain why."

"A behavior tree answers '**what should I do if condition X holds**'. But for an autonomous worker the right question is: '**given my current state, what transitions can fire**?' That's a state machine."

"So I built a **PriorityFSM** — a flat priority-ordered state-machine dispatcher."

> *[有时间的话打开 `src/simulation/npc/PriorityFSM.js` 一眼]*

"Each worker has 12 named states: IDLE, SEEKING_HARVEST, HARVESTING, DELIVERING, BUILDING, FIGHTING, RESTING, etc. Each state defines onEnter, onExit, tick, plus a list of priority-ordered transitions. The dispatcher walks the transition list and the first matching `when()` predicate fires — so a deeply hungry worker in HARVESTING can transition to FIGHTING the moment a predator enters aggro range, without waiting for the harvest to finish."

> *[如能现场展示一个 FSM 跳转 — 点 worker 看状态变化]*

"The same generic `PriorityFSM<StateName>` dispatcher hosts both **Worker AI** and **Visitor AI** — the visitor migration was a 4-wave refactor I shipped over two rounds. AnimalAI still runs the older `StatePlanner` framework — that's documented as known debt for HW8."

"For the LLM half: a Claude-class model reads colony state via `/api/ai/plan` and emits 'build a quarry; recruit a builder; reassign role X to GUARD'. The FSM is the **execution layer** below that — the LLM doesn't move workers directly; it just changes priorities and the FSM picks them up. That separation means the game still runs cleanly even when the LLM is offline — there's a **deterministic fallback director** that emits the same shape of plan from rule-based heuristics."

"Result: 12 named FSM states, 125-LOC dispatcher with the entire transition table fitting on one screen, **fully observable**, **fully replaceable** between LLM and rule-based modes."

### Pillar 1 — 架构细节（Q&A 备查）

`src/simulation/npc/PriorityFSM.js` 核心：

```js
export class PriorityFSM {
  constructor({ states, transitions, initialState, displayLabels }) { ... }

  tick(entity, state, services) {
    const fsm = entity.fsm;
    const transitionsForState = this.transitions[fsm.state];
    for (const transition of transitionsForState) {  // priority-ordered
      if (transition.when(entity, state, services)) {
        this.#exit(entity, state, services);
        fsm.state = transition.to;
        this.#enter(entity, state, services);
        break;
      }
    }
    this.states[fsm.state].tick(entity, state, services);
  }
}
```

每条 transition：

```js
COMBAT_PREEMPT: {
  priority: 1,  // 最高 — 抢占一切
  when: (e, s) => hostileInAggroRadius(e, s),
  to: "FIGHTING"
},
SURVIVAL_EAT: {
  priority: 2,
  when: (e, s) => e.hunger < 0.15 && e.carry.food > 0,
  to: "EATING"
},
...
```

**LLM 集成 — 两层 AI**：
- **High level（LLM）**：`/api/ai/plan` 端点把世界状态序列化成 JSON 喂给 GPT，模型返回结构化 plan（`[{action: "build", type: "quarry", priority: 90}, ...]`），用 `gpt-5.4-nano`
- **Low level（FSM）**：worker 执行；LLM 永远不直接移动 worker，它只改优先级 + `state.constructionSites` 入队
- `ColonyDirectorSystem.js` 是 **rule-based fallback director**，离线时发同形 plan，gameplay 不依赖网络

---

## §3 Pillar 2 — Pathfinding & Navigation（2:00）

"**Second pillar: Pathfinding & Navigation.**"

> *[切到 worker 走在路上的画面 — 形成 convoy]*

"Workers need to walk from A to B on a 6912-tile grid with **water, walls, predators, and other workers** in the way. The classical solution is two layers: **A\*** for the global route and **Boids** for local steering."

"Standard stuff — except we hit two interesting problems."

"**Problem one — bridges across water.** A\* with WATER marked impassable just refuses to plan across rivers. Adding a fixed water-traversal cost penalizes player roads even when a 3-tile bridge would be the shortest path."

"My solution: **dual-search A\* with bridge interleave**. The road planner runs A\* twice — once with `allowBridge:false` (forced detour around water), once with `allowBridge:true` (water tiles cost a fixed bridge step). Then it scores both by `buildCost + length × TRAFFIC_AMORTIZATION` — assumes ~50 round trips of worker traffic — and picks the lower. So the planner builds bridges only when they're actually a payoff."

> *[可能的话切到 archipelago 地图，水面上能看到桥]*

"**Problem two — Boids dampening on path.** Pure Boids around a moving worker convoy fights the A\* path: separation pushes everyone aside, then path-following snaps them back, and the visible result is jitter."

"Fix: when a worker has an **active path**, separation weight drops to 0.35× of normal. Animals keep full Boids; only entities-with-path get dampened. So a convoy on a road flows; a herd of deer still scatters away from each other organically."

> *[autopilot 揭开足够地图后 — 展示 worker convoy 在路上]*

"And one more: **fog-aware planning.** The colony director won't propose buildings on un-revealed tiles, and IDLE workers bias their wander toward fog-edges to scout. So the LLM saying 'build a quarry near stone' literally cannot succeed until a worker has walked over to reveal the stone first — the same constraint a player would face."

### Pillar 2 — 架构细节（Q&A 备查）

**Dual-search bridge interleave** (`R10 PDD`)：

```js
function planRoadConnections(grid, fromIx, fromIz, toIx, toIz, options) {
  const noBridgePath  = roadAStar(grid, ..., { allowBridge: false });
  const withBridge    = roadAStar(grid, ..., { allowBridge: true  });
  if (!noBridgePath) return withBridge;
  if (!withBridge)   return noBridgePath;

  const TRAFFIC_AMORTIZATION = 50;  // 假设每条路一生命周期 50 round trips
  const scoreNoBridge = noBridgePath.length;
  const scoreWithBridge =
    withBridge.length +
    (withBridge.bridgeCount * BRIDGE_BUILD_COST) / TRAFFIC_AMORTIZATION;

  return scoreWithBridge < scoreNoBridge ? withBridge : noBridgePath;
}
```

3-tile 桥省 ~20 detour-tile × 50 trips = 1000 worker-traversal units，justifies ~50 build-cost units → 建。1-tile 桥省 2 detour-tiles → 不建，绕路。

**BridgeProposer**（`src/simulation/ai/colony/proposers/BridgeProposer.js`）：扫描 8-tile shoreline pairs，可提议 2/3/4 tile 桥序列；`DETOUR_RATIO_THRESHOLD = 1.5` — land-detour 至少 1.5× 才提议。

**Boids 路径减震** (`BoidsSystem.js`)：

```js
const sepWeight =
  (entity.path && entity.pathIndex < entity.path.length)
    ? 0.35  // 沿路径 worker：减震让 A* 主导
    : 1.0;  // 动物 / 无路径：完整 Boids
```

**Fog-aware planning** (R13)：BuildProposer 调用 `VisibilitySystem.isTileExplored(grid, tx, tz)`，所有候选 tile 都在雾中时设 `state.ai.scoutNeeded = true`，IDLE worker 通过 `pickFogEdgeTileNear` 偏向雾边。

---

## §4 Key Takeaways（1:30）

"Three takeaways."

"**One: spec fidelity isn't the goal — design fidelity is.** My pitch said Behavior Trees; I shipped FSM. Same intent, better fit. The 'autonomous agent with shared blackboard' design intent is what mattered — the data structure followed."

"**Two: telemetry first, optimization second.** I lost two rounds chasing FPS bugs that turned out to be a Playwright headless quirk capping `requestAnimationFrame` at 1 Hz. The actual sim was running at 200+ fps the whole time. Lesson: **measure your measurement** before measuring your subject."

"**Three: AI-driven development workflow.** I built a 4-stage pipeline — review, plan, implement, validate — that runs as orchestrated subagents. Across 13 rounds, I logged 140+ commits. The interesting findings:"

"- The LLM was best at **bisecting cross-round regressions** — at one point it found that one of my own previous fixes (a worker role-change cooldown) was the root cause of a later builder-stuck bug, six rounds and a hundred commits removed."

"- The LLM was best as a **reviewer not a writer** — even more than as a coder. Letting one subagent design, another implement, and a third audit caught issues a single agent would have rationalized away."

"- The hard guardrails — frozen feature scope, named rollback anchors, per-track file ownership — were worth more than any clever prompt. Constraints made the agents trustworthy."

"That's the project. Happy to take questions."

---

## §5 节奏 / Demo 备注

- §1 包含 ~10s 点击 + 展示 splash + Inspector 时间
- §2 留时间展示 1 个可见的 FSM 跳转；现场难展示就跳到 inspector 截图
- §3 需要地图上有水；Temperate Plains 没水的话开讲前 regen 到 Archipelago Isles
- §4 是 conversational，超时就削 1:00

讲稿 ~900 词，conversational pace ~7:00；如彩排到 10:00，**砍 §3 例子**而不是 §4 takeaways。

### Demo 流程（live 版本）

| 段 | 时间 | 动作 |
|---|---|---|
| 1 | 0:00–0:15 | Title card + 着陆页 |
| 2 | 0:15–0:30 | Start Colony，前 30s 游戏循环 |
| 3 | 0:30–1:15 | **Pillar 1 demo**：放路 / 墙 / 建筑，看 A\* + Boids 反应 |
| 4 | 1:15–2:00 | **Pillar 2 demo**：开 Developer Telemetry → AI Trace，切 live-LLM vs fallback，展示 policy diff |
| 5 | 2:00–2:30 | Survival 终态：DevIndex 数字、Raid escalator |
| 6 | 2:30–2:50 | 收尾：Inspector + Heat Lens 展示"可解释"的另一半 |
| 7 | 2:50–3:00 | End card |

预录视频计划在 `assignments/homework7/Demo-Video-Plan.md`，发布后改 frontmatter `status: published` + 加 `url:`，同 commit 镜像到 `README.md` 和 `Post-Mortem.md`。

---

## §6 Q&A 应急（12 题，每答 30–60s）

⭐ 标的是高频题，重点练。

### ⭐ Q1 "Spec 说 BT 但你 ship 了 FSM。为什么？算降级吗？"

不算降级，**更适合**。BT 适合"给定 A/B/C 条件做什么动作"；我们的问题是"当前状态下哪些事件能抢占？"——这是状态机。关键属性是 **priority-ordered preemption**：HARVESTING worker 看见 2-tile 内 saboteur 必须**立刻**切 FIGHTING，不是等 harvest tree 短路。flat priority FSM 用一条 `priority: 1` transition 就表达了；BT 要在每个节点装中断检查。意图——autonomous interpretable agent——是关键的；FSM 只是表达得更干净。

### ⭐ Q2 "LLM 实际怎么参与？只是花哨的 text generator 吗？"

它是真正的策略决策者。Director 把 JSON 化的 world state（资源数 / 建筑数 / 角色分布 / 威胁级别 / 场景目标）发给 `/api/ai/plan`，模型返回结构化 plan：`[{action: "build", type: "warehouse", priority: 90}, {action: "recruit"}, ...]`。用 `gpt-5.4-nano` via direct OpenAI API。Plan 进队列，FSM 取来执行。关键：**LLM 永远不直接移动 worker** — 只改优先级。所以 LLM 离线的最坏情况是 build queue 不理想，不会污染 simulation。这个分离是 LLM 在实时游戏里 safe 的根本。

### ⭐ Q3 "怎么处理 AI 不确定性？"

两手。(1) Simulation 自身确定 — seeded RNG，固定步长 physics，所有系统按 `SYSTEM_ORDER` 跑。LLM 只注入 high-level intent；LLM 跑飞最坏只是 build queue 烂，不会污染 simulation。(2) 测试用 deterministic fallback director 发同形 plan from rule-based heuristics。所以 `node --test` 能覆盖整个 AI surface 不调 LLM。我们 ~2060 个测试全过，全部确定。

### Q4 "最难的 bug？"

一个 6 轮前的自伤 regression。R5 我加了 4-second `roleChangeCooldownSec` 防 worker role-thrash。3 轮后 playtest reviewer 报 "BUILDER never claims sites; blueprints sit unbuilt forever"。冷却阻挡了 FARM→BUILDER。整个 reviewer-driven bisect 才追回到我自己的 fix。修复是一行 predicate：unclaimed sites bypass cooldown。教训：**cross-round regression 是真的，自加的 safeguard 能成 bug**。

### Q5 "path-following + Boids 跟纯 Boids 有啥区别？"

纯 Boids 给 flocking — convoy 会聚成一团漂。纯 A\* 给 robotic 单列 ignore collision。混合是：A\* 给**路线**（走哪些 tile），Boids 给**局部避让**（别撞前面的、别穿过鹿）。诀窍是 **path 上 separation 减震** — worker 有 active A\* path 时 sep 降到 0.35×，path-following 主导。没减震，12-worker convoy 在路上抖：sep 推开，path snap 回来。有减震 = 沿路 visible **flowing convoys**。

### Q6 "为什么 dual-search 不直接 weighted A\*？"

因为桥的 cost 不是固定数 — 取决于**用多少次**。weighted A\* 用固定 water cost 区分不了"用 50 次的捷径"和"用 1 次的猎奇过河"。dual-search 跑两次 A\*（allow / disallow bridge），都用 `length × TRAFFIC_AMORTIZATION`（50 round trips）打分。If bridge variant 在 amortize build cost 50 trips 后还赢 → 建。3-tile 桥省 20 detour-tiles → 赢。1-tile 桥省 2 detour-tiles → 不赢，绕路。

### Q7 "AI 编码辅助改变了你的工作方式吗？"

三件事。(1) **迭代速度** — 13 个 review/plan/implement/validate 轮，~140 commits，约 2 周 wall-clock。是手动 10×–20× 的量。(2) **自我批判质量** — 让一个 subagent review 另一个写的代码，抓住了我会合理化的问题。(3) **硬护栏比聪明 prompt 更重要** — frozen feature scope, named rollback anchors, file-ownership tracks。约束让 agent 从 creative-but-unreliable 变 trustworthy。最大惊喜：LLM 最擅长 **bisect cross-round regression** — 一次 4-commit binary search 抓出了 5 轮前的 bug。

### Q8 "为什么没有音频？"

final-polish phase 的 hard freeze 禁止加新 asset。音频 — 哪怕免费的 — 也带来 licensing decision、文件 pipeline、debug surface，时间不够 validate。所以 audio 是 Post-Mortem §4.5 的 documented deferral。替代：**toast notification** 重要事件（raid incoming, worker died with name + cause, milestone reached）。不如音频好但保留了"看一眼就能信任 colony"的交互。

### Q9 "colony 怎么 scale —— 比如 200 worker？"

我们测到 50 worker + 30 building + multi-saboteur stress（R9 PW），dispatcher 撑住了 — `multiClaim=0` across 16 sites @ 50 worker。50 worker 时 per-tick 预算 ~4ms（~470 fps headroom）。scale 瓶颈 (1) **AgentDirector planner** — 0.5s sim-time gate；(2) **Boids separation queries** — 还没改 quadtree，目前 worker 邻域内 O(N²)。200+ worker 需要 spatial partitioning。我们没 ship 是因为 gameplay 没 demand。

### Q10 "LLM agent 做过最 surprising 的事？"

两个故事。(1) R7 perf reviewer agent 在 `WorkerAISystem.js` 找出了 **latent ReferenceError** — 一个常量 `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD` 被引用但从未声明。任何 code path 调到都会立刻 crash。当前状态下 unreachable，但 feature flag 一翻 — instant breakage。Agent 抓到是因为做 perf trace 时注意到这个 symbol 不在 file exports table。(2) R11 audit agent **bisect 了一个 4-commit regression** 我都不知道存在 — 跑 long-horizon benchmark 在 R8–R10 之间每个 commit 上跑，找到 -60% DevIndex 跌幅，溯源到 cascade-mitigation fix 里一行 phase-offset math。

### Q11 "你怎么知道游戏好玩？"

我不完全知道。proxy 指标：13 轮 holistic playability rank reviewer 1–10 打分；轨迹 5.5 → 4.0（结构重构期）→ 回到 5.5。bench DevIndex 28（早期 collapse）→ 73（90 天全程存活）。但老实说：subjective fun 只能 **human playtester** 判。我自己测了 ~50 小时，orchestrator 的 blind reviewer agent 测了 ~20 小时，但还没外部 playtester。Post-Mortem §3 记了这个 gap。

### ⭐ Q12 "再给你两周你做什么？"

三件事，按优先级。(1) **AnimalAI 迁移** — 还在 legacy StatePlanner，Worker + Visitor 已迁 PriorityFSM。统一整个 NPC AI 层（~1 wave）。(2) **重构两个 Grade-D 系统** — ColonyPlanner（1884 LOC）+ ColonyPerceiver（1970 LOC） — 能跑但是 patch-pile。(3) **真实音频 + 行走动画** — 都被 freeze 推迟。minimalist sphere-on-grid 是 a1.md 故意的，但 tasteful 音频层会显著提升"living system"感觉。都不是核心 gameplay；loop 已经 work。

### Bonus 现场 cheat-sheet

- "Can you show…" → 切到游戏 tab；边讲边演示
- "How did you test…" → 提 2060+ 测试 suite，CI 每个 commit 跑
- "Why a sphere?" → a1.md 锁定 minimalist；scale 到 200+ entity @ 60fps；rendering 是 one InstancedMesh per role
- "How did you avoid scope creep?" → HW7 hard-freeze 禁止新 tile/role/building/mood/mechanic/audio/UI panel；13 轮每个 plan 都过这个 gate
- "What's the most fragile system?" → ColonyPlanner（size 大）；BuildProposer interface 迁移（R5+R6）抽出了 safety-net，但 planner 自身还是 monolithic

---

## §7 Slide deck 后备说明

`slides.html` 已是成品（10 页，self-contained，与游戏暗色等宽风格一致）。如果 AV 出问题：

- **PDF export**：浏览器 print → "另存为 PDF"，任何机器都能开
- **离线**：HTML 完全 self-contained，无外网依赖（图片在 `img/` 同目录）
- **font**：等宽 monospace；**transitions**：none — 直切；**total**：10 页 × ~40s = 6:40，留 0:20 buffer 到 7:00 目标

每页台词与本文 §1–§4 一一对应。
