---
round: 5
date: 2026-04-24
reviewers: 10
avg_score: 3.55
score_min: 3
score_max: 4.5
verdict: "骨架齐全但核心游戏循环在 fallback AI 下自毁 —— 5 分钟饿死、角色分配失衡、Heat Lens/Entity Focus/DIRECTOR 三大卖点承诺未兑现，整张体验是仪表盘而不是游戏。"
---

## 1. 评分表（按 01a..02e 顺序）

| reviewer | 身份 | 分数 | 一句话摘要 |
|---|---|---|---|
| 01a | Onboarding 新玩家 | 4 | 有帮助菜单但无前 3 分钟陪跑，Select 回弹 + Autopilot 静默崩盘让新手永远点不中 worker、永远看不懂为啥死。 |
| 01b | 可玩性 | 3 | "视觉像 colony sim，玩起来像开发者仪表板"，Autopilot 1:33 内零死亡零事件零进展，Dev 冻在 49。 |
| 01c | UI 呈现 | 3 | 信息过载、Colony 面板 Food 行被顶 HUD 遮住、Heat Lens 不真染色、800×600 完全崩，业余手感。 |
| 01d | 机制/内容 | 4 | 机制呈现 5 / 内容丰富度 3 —— Debug 层过透明 HUD 层因果断层，11 建筑 + 7 资源 + 5 事件仅 RimWorld 10%。 |
| 01e | 创新性 | 3 | 勤奋但无独特钩子的 RimWorld-lite，LLM 卖点从未亮起（整场 DIRECTOR/DRIFT），"What makes Utopia different"成尴尬证据。 |
| 02a | RimWorld 老兵 | 3 | 三张图全部 5-6 分钟 fallback AI 自毁：FARM 堆到 14、COOK=0、HAUL=1，scenario 目标倒退，DIRECTOR 文本残句泄漏。 |
| 02b | 休闲玩家 | 4.5 | "认真学生的作业但没学会对休闲玩家温柔"—— 全程静音、无动画反馈、Autopilot 坑新手，目标完成后不知道干嘛。 |
| 02c | 速通/min-max | 4 | 没有 dominant strategy、没有竞速 milestone，手动 build-spam 被饥饿锁死，Autopilot 弱基线，FF 4x 实测 ~1.2x。 |
| 02d | 叙事/RP | 3 | "系统把纸锁在抽屉里"—— 有 backstory / relationships / memory 却全不闭环：死亡不入记忆、厨子被派去砍树、全程静默。 |
| 02e | 独立评论人 | 4 | "凌晨三点 devlog 的仪表盘禅学"，作者能写漂亮话（"Threat is the cost of being late"）但被工程日志腔调压住 95%。 |

---

## 2. P0 — Structural Blocker

### P0-1. Fallback AI 在 5 分钟内把殖民地自己玩死（COOK/HAUL 缺口 + 人口增长后 meal pipeline 断裂）

- **Reviewers**: 01a, 01b, 01d, 02a, 02b, 02c（6 人独立命中）
- **症状（玩家可观测）**:
  - Autopilot ON 后 2-3 分钟 Food 从 100+ → 0，4-6 分钟首批饿死（"Thal-15 starved", "Luka-38 starved", "Aila-28 starved"）。
  - Colony 面板显示 FARM 堆到 14 人、COOK=0、HAUL=1、HERBALIST=0；Meals/Medicine 产出长期 0.0/min。
  - Scenario 目标会**倒退**：warehouses 7/2 → 3/2，farms 4/6 → 0/6，routes 1/1 → 0/1，玩家不知道是 decay / scenario reset / 被 fallback 拆除。
  - Autopilot banner 始终绿色 "next policy in X.Xs"，**AI 从不承认自己在崩**。
  - 三张不同地形（Plains / Highlands / Archipelago）行为曲线几乎一致——fallback 和地图/scenario 完全解耦。
- **系统层猜测**:
  - 经济根因：workers 从 carry 直接吃（CLAUDE.md 自己标注的 Phase 9 结构性 punt），fallback 短视地"缺啥补啥"把人全堆进 FARM，但食物→Kitchen→Meal→warehouse→deposit→消费的 pipeline 中间 COOK/HAUL 没有被角色配额系统响应人口增长（Doctrine 的 "Cook/Smith/Herbalist/Haul quotas 各 1" 就是这个 bug 的根）。
  - AI 层根因：ColonyPlanner fallback 缺少"人口→角色配额"再平衡步骤，只在建筑/资源轴上做局部梯度，无法触发从 FARM 抽人给 COOK/HAUL。
  - scenario tick 与 fallback policy 无共享状态 → 完成目标在下次 tick 被 re-evaluate 为未完成（倒退观感）。
  - 这不是"加 tooltip"能修的，是 **fallback planner 的配额反馈闭环本身缺失**。

### P0-2. 玩家→单位→世界的观察闭环断裂（Select 工具回弹 + Entity Focus 点不中 + 无工人列表）

- **Reviewers**: 01a, 01b, 01d, 02a, 02d（5 人）
- **症状（玩家可观测）**:
  - "Click a worker to inspect" 承诺：默认工具是 Road，点击 = 建造；切 Select 后按钮立即回弹回 Road（01a "12-select-worker"）。
  - canvas 点击工人要 4-5 次才偶尔命中（02b 游戏自己弹"Click a bit closer to the worker (hitbox is small)"——开发自己知道）。
  - Entity Focus 一直显示空态；没有 "next worker" / 工人列表 / 按名字搜索；**02d 想"追随某人 5 分钟"根本办不到**。
  - 后果：intentWeights / carry / fatigue / recentMemory / relationships 这些最贵的数据**玩家永远看不到**——全部只在 Debug 面板可见。
- **系统层猜测**:
  - 这不是 hitbox 调大就行。核心问题是**玩家决策闭环的"观察"环节**缺失："暂停→点人→看他为什么不去 COOK→下指令→放行→观察因果"—— 目前这个闭环在 UI 层 0% 可用。
  - 需要 ControlContract 级的介入：把 WorkerInspector 从 canvas pick 改成 persistent worker list + focus/cycle keyboard，把 intentWeights/carry/state 从 Debug 提到 HUD。

### P0-3. DIRECTOR / WHISPER / LLM 三态徽章承诺落空 + prompt 模板泄漏残句

- **Reviewers**: 01d, 01e, 02a, 02d, 02e（5 人）
- **症状（玩家可观测）**:
  - 整场实战 WHISPER 徽章**从未亮起**（LLM HTTP 503 fallback），100% DIRECTOR/DRIFT——作者在 "What makes Utopia different" 自己推销的独特卖点永远不点亮。
  - DIRECTOR 文本出现**破损残句**："reconnect the broken supply lane: the colony should sustain reconnect the broken supply lane while keeping empty bellies and full backpacks from overriding the map's intended reroute pres..."（两张图共用同一段、半句截断、疑似 prompt 模板变量未替换或 fallback 漏文）。
  - "fallback/fallback - next policy in 0.0s" 对新手是纯黑话。
- **系统层猜测**:
  - 这触及 **autopilot / fallback / DIRECTOR 的 control contract 对玩家透明性**——本轮核心矛盾之一。
  - 根因不是"加个 tooltip 解释 DIRECTOR"，是 LLM 不可用时 fallback 路径既不产生 narrative 叙述、又泄漏未填充模板。必须修：(a) fallback 生成简短人类语气的叙述理由；(b) LLM 不可用时 WHISPER 徽章要有明确降级语义（而不是假装 DIRECTOR 在工作）；(c) 玩家可以在 HUD 一眼看出"现在谁在做决策、下一步为什么"。

---

## 3. P1 — Major

### P1-1. 反馈完全沉默（无音效、无 BGM、无建造特效、无死亡冲击）

- **Reviewers**: 01a, 01b, 02b, 02d, 02e（打到情感/留存循环）
- 死亡只是一行 toast；建造无音效无动画；全程静音；Colony sim 失去"世界在呼吸"的触感。02d 实测 `audioElements:0`。
- 不是 P0 因为不阻断循环，但打到"玩家再多玩 1 分钟"的钩子。

### P1-2. HUD 信息因果断层：数据过密，因果密度 0

- **Reviewers**: 01b, 01c, 01d, 02a
- Food -151.7/min 不给来源拆分（吃 vs 产掉）；Dev 49/100 不给阈值（下一档需要什么）；Score 只是 time × k 与玩家行为无关；scenario 目标文本被 ellipsis 截断。
- 这是 P0-1/P0-2 的派生症状，enhancer 单修这条会表面化；但 Score 公式与 Dev 卡壳是 benchmark DevIndex 37.8 离不开家的直接映射。

### P1-3. Heat Lens 承诺的可视化实际不渲染

- **Reviewers**: 01a, 01b, 01c, 01d, 02a
- 按 L 后 legend 浮现但 tile 本身无明显染色。UI 文案指向不存在的视觉 —— 最致命的产品感问题。

### P1-4. Scenario 目标倒退无事件 log / 建筑成本面板不一致

- **Reviewers**: 02a, 02c
- warehouses 7/2 → 3/2 无任何 event log 解释；Kitchen 成本在 Construction 面板 8w+3s，在 tool-hint 5w+3s 矛盾。

### P1-5. 响应式崩坏 + z-index bug

- **Reviewer**: 01c（单 reviewer 但属于付费产品门槛硬伤）
- 1920 / 1440 下 Colony panel Food 行被顶 HUD bar 遮住；800×600 完全不可用。

---

## 4. P2 — Minor

- Welcome 页 `○ ○ ○ ○ ○ ○` 占位字符（01a, 01c）
- 键位矛盾：Welcome 1-12 vs Help 1-6（01a）
- FF 4x 实测仅 ~1.2x，后台 throttle（01b, 02c）
- Entity Focus 空壳占底部 C 位（01c）
- 无 focus ring / a11y（01c）
- 开场 bootstrap 脚本替玩家打勾 routes/depots，剥夺首次成就感（01b）
- Clinic 的 herb→medicine 链在默认开局 ROI≈0（02c）
- 工人 backstory（"cooking specialist"）与实际角色分配脱钩（02d）

---

## 5. 本质优先级（给 Stage B enhancer 的选择偏置）

**核心矛盾（按出现频次 × 系统深度排序，enhancer 必须锁定其一）**:

1. **核心经济循环在 fallback AI 下的 10 分钟存活**（P0-1）
   对应 benchmark DevIndex 37.8 离不开家的结构根因——workers 吃 carry 直接绕过 warehouse + COOK/HAUL 配额不随人口增长——punted 到 Phase 9 但本轮必须动。
2. **玩家"暂停→点人→读意图→下指令→放行→观察"闭环**（P0-2）
   需要 persistent worker inspector + intentWeights HUD 提升 + 可切换 focus。这是把 Debug 层已有数据"搬到 HUD 中间层"的工程，不是加新内容。
3. **autopilot / fallback / DIRECTOR control contract 对玩家透明化**（P0-3）
   fallback 叙述自证 + LLM 不可用时显式降级 + prompt 残句 bug 修复 —— 让"AI 在做什么"从黑话变成可读的控制契约。

**必须拒绝的建议类型（本轮全部 D5，不采纳）**:
- ❌ "加新手教程关卡 / Intro Mission"（01a #1）—— 表面修复，不触达循环根因
- ❌ "加音效 / BGM / 动画微反馈"（02b, 02d, 02e）—— 体验分但非结构性
- ❌ "新增建筑（防御塔/陷阱/研究台/床）"（01d #1 内容丰富度）—— 扩内容不修 loop
- ❌ "新增 tile 类型 / 新生物物种"（01d）
- ❌ "新 mood / 心情系统 / 社交事件"（02d 扩展）
- ❌ "重写 Score 公式 / 加 meta-progression / 加成就"（02c #结论）
- ❌ 纯文案润色 / tooltip 修订 / 术语表 Glossary（01a #5, #8；01c #审 UX 文案）
- ❌ 响应式 800×600 修布局、z-index bug（01c P0 视觉）—— 是真 bug 但不是本轮本质
- ❌ Heat Lens 改配色（01b #8）—— 除非它作为 P0-2 观察闭环的一部分被真正通电

**enhancer 应该带回来的 plan 形态**:
- 必须触达 `ColonyPlanner` / `StatePlanner` / `WorkerAISystem` / `ConsumptionSystem` / `WarehouseSystem` / `DirectorSystem` / `EntityInspector` 其中 ≥1 个。
- 必须可验证：给出 "fallback AI 10 分钟存活率" 或 "DevIndex 离开 37.8 至 X" 或 "玩家点中工人一次成功率" 这类可度量指标。
- 修 fallback planner 配额再平衡 > 修 worker inspector HUD > 修 DIRECTOR fallback 叙述 > 其他一切。

---

## 6. HW06 Freeze 边界提醒

以下 reviewer 抱怨整轮**不能接受**（超出 HW06 范围或需要数周美术/内容工作）:

- 加 BGM / 音效 / 音乐系统（02b #1, 02d, 02e）
- 加 Intro Mission 强制新手教程（01a #1）
- 加 25+ 新建筑 / 研究树 / tier 2-3 tech（01d 改进）
- 加 3-5 生物物种拆分 Herbivore/Predator（01d）
- 加季节天气可视动画（01b, 01d）
- 加 mod 支持 / i18n / 色盲模式 / 完整 a11y（01c）
- 重写 LLM pipeline 让 WHISPER 真的持续点亮（01e, 02d）——可以做"降级语义透明化"但不能承诺真上线 LLM
- 重写美术贴图（独立 indie-critic 02e 的"蓝色交叉阴影"审美诉求）
- 响应式 800×600 / 移动端适配（01c）
- 加 meta-progression / 成就 / 解锁（02b, 02c）

这些都是正当诉求，但 HW06 Round 5 框架下只做**系统循环层修复**，内容/美术/音频冻结。

---

## 7. Stage B 输入契约

- 每个 enhancer 1:1 对应一个 reviewer id（01a..02e，共 10 个 enhancer）；只读自己那份 feedback；允许读仓库代码（`src/simulation/`, `src/config/`, `src/ui/`, `docs/superpowers/plans/`, `CHANGELOG.md`, `CLAUDE.md`）但**不读其他 reviewer 输出、不读 Round1-4 summary、不读 PROCESS.md**。
- 本轮选择偏置：**本质优先于表面**，见第 5 节。若 reviewer 原文的最强诉求是被第 5 节列入"拒绝清单"的表面类，enhancer 必须在 reviewer feedback 里挖第二层根因重新立题，而不是把表面诉求直接做成 plan。
- 每个 enhancer plan 必须包含：(a) 锁定的核心矛盾（第 5 节三条之一，或 reviewer 独有的深层系统问题）；(b) 要动的源码路径；(c) 一个可度量指标；(d) 明确声明为什么这不是"加 tooltip / 加文案 / 加内容"的表面修复。
