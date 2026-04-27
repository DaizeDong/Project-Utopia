# Project Utopia —— 一个 RimWorld 老兵第一次试玩的诚实 blog

*Playtest date: 2026-04-22 · Build: web dev build on 127.0.0.1:5173 · Total session time ~12 min elapsed real-time, 多场地图轮换*

---

## 玩家身份自述

我叫老赵，十年 colony sim 的坑里我都趟过。RimWorld 4500 小时（其中 1200 是 Combat Extended + Rimfactory + Rimefeller）、Dwarf Fortress 800 小时（classic + Steam 版都有）、Oxygen Not Included 900 小时、Banished 300 小时、Going Medieval 刚退坑。我下载 demo 的标准很苛刻——只要开局五分钟没看到让我想"哦，这个机制有意思"的瞬间，基本就关了。

我喜欢的东西很明确：**深度可见、AI 有思考、中后期有结构性挑战、死亡有叙事**。我不在乎美术（Dwarf Fortress 的纯 ASCII 是我心头好），但我不能忍受一种游戏——看起来像是 sim，但玩起来像是 idle clicker。Project Utopia 我完全没听过，朋友丢来一个 localhost 链接说"你看看"。以下是我三个多小时（好吧，实际不到十五分钟，密度很高）的诚实体验。

---

## Session 1：Temperate Plains · Broken Frontier · 第一次崩盘得毫无尊严

开局是个叫"Broken Frontier"的 scenario（frontier repair 子类型），叙述写着"重连西线木材路、夺回东线仓库、扩张殖民地"。Seed 1337，96×72 地图，不算小。进游戏瞬间给我 13 个工人、100 食物、30 木头、8 石头、0 药草。HUD 顶部还挂着 Prosperity 65、Threat 26 的两条隐性压力槽——这个设计我喜欢，不用我从菜单里扒。

然后问题来了。我打开 Colony panel 一看工人分布：**FARM 3, WOOD 7, STONE 1, HERBS 1, COOK 0, SMITH 1, HERBALIST 0, HAUL 1**。7 个伐木工、3 个农民？这殖民地一开始就是畸形的。我本能去找"RimWorld 式的 Work Priority 表格"——找不到。只有一个 Target Farmer Ratio 的滑块，藏在 Settings 的"Map & Doctrine"下。我把它从 50% 推到 65%，期待它会重分配。

然后我犯了一个很蠢的错误：我按 2 选了 Farm，在空地上连点了 5 次，指望它变成一个农场田地。**结果：每次点击都是独立的 5 木头 Farm，连点 5 次消耗 25 木——我一共才 30 木**。屏幕右上角立刻弹出红字 "Insufficient resources"。这就是第一个设计槽点：**没有拖拽框选放置，也没有"一次只放一个"的防呆**。对比 RimWorld 的区域工具，这里像是原始时代。

接下来 30 秒我目送食物从 110 一路跌到 98、78、27，再跌到 **5**。2 倍速下大概 40 秒真实时间里殖民地就死了。Wood=0, Stone=0，Threat 飙到 60，Prosperity 跌到 24。顶端横幅说"Emergency relief stabilized"——系统自动送了我一批救济食物，我还能看到食物数字回跳到 99 那一刻的欣喜——但没用，我没法回头建 Kitchen（要 8w 3s），连 Road（1w）都建不动。工人们像布朗运动一样乱跑，我点了个工人打开 Entity Focus，显示：

```
Worker-80 | Role: FARM | State: Seek Task | Intent: farm
FSM: current=seek_task | prev=idle | nextPath=--
Policy Influence: applied=false | topIntent=eat | topWeight=1.40 | policyDesired=harvest
Decision Time: sim=25.4s | policyAt=20.1s | envAt=24.1s
Path: idx=1/2 | next=(58,34) | target=(58,34)
```

这个 Entity Focus 面板的信息密度是真 **RimWorld dev mode 级别的**，我看了第一眼就起鸡皮疙瘩——`Policy Influence: applied=false | topIntent=eat | topWeight=1.40 | policyDesired=harvest`，这说明 **工人的 policy 想让他去收割，但环境 override 成了去吃饭，而且这个 override 根本没 apply**。这是 AI planner 和 executor 之间的 desync。我在调试自己手搓的 HTN 时见过这种日志。

可惜漂亮的 debug ≠ 漂亮的游戏。第 2 分钟我的 Session 1 结束了，殖民地自动进入下一张地图。我 0 次战斗、0 次事件、0 次抉择。只是纯粹没饭吃。Score 停在 50。

---

## Session 2：Rugged Highlands · 我以为我学会了，结果又死

系统给我扔到了 Rugged Highlands（Seed 15736）。但我得坦白说——**名字叫 Rugged Highlands 的这张图，我看不出任何 rugged**。整张地图中央是一个近圆形的绿色大岛，周围全是水。没有山、没有岩层、没有海拔变化。开场"Tuning"参数显示 `mountain=0.08 island=0.03`——山系密度只有 8%，和名字完全不符。对比 RimWorld 的 "Tropical rainforest vs Extreme desert" 那种视觉身份差异，这里所有地图看起来都像"带一点水的绿地"。

但这次我学乖了。先在 Settings 把 Farmer Ratio 推到 70%，然后**只**放 4 个 Farm（20 木），保留 2 木。Kitchen 要 8 木 3 石我暂时也造不起，但至少 Farm 会进入产能循环。我还学会了点工人——这次 Worker-122 的 Entity Focus 出来了：

```
Type: WORKER | Role: WOOD | State: Deliver | Intent: deliver
Policy Influence: applied=true | topIntent=deliver | topWeight=2.50 | policyDesired=deliver
Path: idx=2/12 | next=(48,30) | target=(45,24)
Path Recalc: 105.5s | Path Grid: 55 | Path Traffic: 0
Vitals: hp=100.0/100.0 | hunger=0.446 | alive=true
```

注意 `Path Recalc: 105.5s`——这位工人上次重算路径是 105 秒以前。有没有可能他在沿着一条过时的路走？这就是为什么 **Feasibility rejects: workers=1090 @ t=120s**——AI 每帧在拒绝成吨的候选动作。每分钟拒绝将近 500 次。这种数字量级在 RimWorld 里也能见到，但 RimWorld 有 JobGiver 的优先级裁剪，Project Utopia 看起来是裸跑 planner，难怪浪费这么多 CPU。

第 2 分钟食物跌到 20 以下，我又手忙脚乱点出 Insufficient resources。Wood 永远不够。我才意识到：**即使把一半工人转去 FARM，木头供应瞬间就断了**——而 Farm 成本 5 木、Warehouse 10 木、Kitchen 8 木、Road 1 木，**所有东西都要木头**。这里的经济非常"木本位"，但初始 Lumber 只有几个。对比 RimWorld 里砍一棵树得 ~50 木、玩家可以主动命令砍哪棵，这里 **我无法直接命令哪个工人去砍哪棵树**——全靠 AI fallback 自己决定。当 AI mode 显示 "off / fallback (down)" 时，游戏本质上在跑一个写死的启发式，而这个启发式显然没在处理"紧急情况下把伐木工转去砍急需木料"这个 case。

颜色提示一下：右上角红色 "Insufficient resources" 横幅几乎一直亮着。Session 2 在 1:40 左右结束。Score 又是三位数以内。

---

## Session 3：Fertile Riverlands → Coastal Ocean · 终于活过两分钟

系统把我推到 Fertile Riverlands（Seed 还是 15736，但 Doctrine 变成了 "agrarian"——很好，agrarian doctrine 可能加成农业？）。

这一局我打开了底部 Developer Telemetry 的所有六个面板。信息量在 colony sim 里我只在 DF 的 gamelog.txt 和 RimWorld 的 Dev Mode Inspector 里见过：

| 面板 | 数据 |
|---|---|
| Global & Gameplay | map, seed, grid version, tuning（water/river/mountain/island）, sim tick/dt/steps, entities, resources, buildings W/H/F/L, deaths（starvation/predation/event）, ecology hotspots, doctrine, prosperity, threat, AI mode/env/policy counters, RNG seed+calls |
| A\* + Boids | requests / success / fail, cache hits, path avg length, traffic version, last query from→to |
| AI Trace | Narrative（scenario 叙事），AI Decisions（workers/traders/saboteurs 的行动），spatial pressure/warning focus |
| Logic Consistency | Invalid transitions, goal flips, starvation risk entities |
| System Timings | 每个 System 的 last/avg/peak ms |
| Objective / Event Log | …空的。一条都没有。 |

**Event log 是空的**。这是我第一个真正的"wtf"时刻。这就像 RimWorld 的 History tab 没东西记录，或者 DF 的 Announcements 没声音。游戏里明明 Deaths: total=9 (starvation=7, predation=2)——那 9 个死人谁都不值得记一行吗？这让我感觉这款游戏有 **严重的叙事失声**：它知道发生了什么（Warning 里会弹"Herbivore-167 died (predation)"），但它不告诉"我"这个玩家。RimWorld 里每一次 pawn 死亡都至少有个 letter 弹窗、可以查"Character died from xxx"的记录，这是 colony sim 的情感核心——Project Utopia 目前完全没接上这根线。

回到玩法。Session 3 这张 Fertile Riverlands 我活到了 3:28 真实时间（游戏内 sim time 更短），但中途食物从 85 跌到 10、然后靠 Warehouse 自动补给拉回 80、再跌、再拉。Prosperity 一度跌到 13。**我看到了一次有趣的经济反弹**：Meals 从 0 涨到 5 再跌回 0，说明 Kitchen 有在生产但被吃光的速度大于生产速度。这种"紧平衡"的感觉如果能稳下来会很上瘾，但它根本不稳——更像是随机振荡。

然后死后系统又把我扔到 **Coastal Ocean**（前面的 Archipelago Isles 居然被跳过了，我直接进了 Coastal）。这张图终于有一点像它的名字：窄绿陆条 + 大面积深蓝海洋。Passable 只有 52.2%，压迫感对路。我这次什么都没动，让 fallback AI 自己接手，观察了 3 分钟：

| t | food | wood | stone | workers | deaths | prosperity | threat |
|---|---|---|---|---|---|---|---|
| 0:25 | 109 | 9 | 17 | 13 | 0 | 44 | 42 |
| 0:52 | 102 | 12 | 14 | ~16 | 0 | 55 | 37 |
| 1:22 | 95 | 1 | 17 | **62** | 1 | 46.5 | 52.3 |
| 3:02 | 43 | 0 | 8 | 55 | **9** (starve=7) | 23.9 | 51.8 |

最有意思的数据点：**工人数从 13 冲到 62 再跌回 55**。这意味着 Warehouse 在疯狂生人（从 HUD 旁边 +10/+1 的人口按钮来看，人口是由玩家控制的，但 AI fallback 也在推）。62 个工人但**只有 0 个 Farm 在地图上**（buildings W/H/F/L=2/0/0/3——2 仓库 0 房屋 0 农场 3 伐木）。没有农场怎么可能喂 62 个工人？靠 Warehouse 的保底救济。所以 fallback AI 的策略是"造人+靠系统喂"，**完全没有种地的意愿**。Feasibility rejects: workers=**118,524** 次（3 分钟内！）——意味着工人候选动作每秒被拒绝数百次。这不是 AI 在思考，这是 AI 在空转。

我终于在 3:02 放弃干预，让它自然死亡。Coastal Ocean 收场时 Score 160 左右，活过 ~3 分钟是我三局里最长的一次。

---

## 系统深度评价（老兵视角）

### 一、那个令人心动的 debug 面板

我想先把好话说完：**Entity Focus + Developer Telemetry 这套调试 UI 的信息密度是 AAA 级别的**。

- FSM 当前态 / 上一态
- Policy Influence 的 `applied/topIntent/topWeight/policyDesired`（能看到决策是否 override 了 policy）
- Decision Time 的 `sim / policyAt / envAt` 三戳
- A* `success/fail/cache hits/avg path len`
- 按 System 分的 ms 时序（WorkerAISystem, VisitorAISystem, ProgressionSystem, NPCBrainSystem 等 10+ 个 system 都有数据）
- `Feasibility rejects` 分 herbivores/workers 计数
- 连 `RNG: seed=xxx state=xxx calls=5940` 都有

这套面板如果做成玩家可见的——而不是 debug——会是 **colony sim 品类的重大创新**。目前只有 DF 的 `gamelog.txt` + Legends mode 和 Songs of Syx 的 stat graphs 能比。我不希望开发者把它藏起来。

### 二、AI 架构的野心与塌方

根据我能看到的字段（`AI Mode: off / fallback (down)`, `AI env(0/16) policy(0/9)`, `fallback @ 120.3s | stabilization`），这游戏的本意是：
1. 有一个基于 LLM 的 planner（AI 代理）为工人/商人/破坏者生成高层策略
2. 当 LLM 不可用时，fallback 到一个启发式 policy
3. 启发式 policy 又有分层：`workers:route repair and depot relief`, `traders:defended warehouse lanes`, `saboteurs:soft frontier corridor hits`

这是**极高的架构野心**，接近 RimWorld 的 Storyteller + StrategicDirector 组合，再加一层 LLM。但在我这次 playtest 里 **LLM 全程 down**，我看到的是纯 fallback 表现——而 fallback 的表现**严重不及格**：
- 不会根据资源危机重分配工人角色（7 伐木 3 农民 when food is crashing）
- 不会在 Wood=0 的时候停止建造单
- Policy 和 FSM 的决策层 desync（top intent=eat but state=seek_task）
- Feasibility rejects 每分钟数万次（在我看来是在反复尝试不合法动作）

这就像我买了一辆承诺自动驾驶的车，上路才发现自动驾驶关了，然后它的"基础 ACC"连定速巡航都做不好。**AI 系统的上限很高、下限非常低**。

### 三、地图模板名不副实

我玩了 Temperate Plains / Rugged Highlands / Fertile Riverlands / Coastal Ocean 四张图。**它们的视觉差异基本只有"水多一点 vs 水少一点"**。

参数上：
| Template | mountain | island | ocean | 视觉身份 |
|---|---|---|---|---|
| Temperate Plains | 0.08 | 0.03 | 0.00 | 中央一条大河 |
| Rugged Highlands | 0.08-ish | 0.04 | 0.00 | 一个圆岛 |
| Fertile Riverlands | 0.10 | 0.03 | 0.00 | 几条河 |
| Coastal Ocean | 0.06 | 0.12 | 0.33 | 窄绿条+大海 |

**没一张图有实际的"山"可见**。Rugged Highlands 里我没见到一块岩石瓦。而 DF 的 Mountain biome 直接就是不可 embark 的硬墙、RimWorld 的 Extreme desert 地表 90% 沙土零木材——那是真的有身份的地图。Project Utopia 目前只有"水比例"在变，其他维度都没张力。

### 四、死亡无叙事

我在三局里造成了差不多 10 条生命的消失（大部分是工人饿死）。游戏告诉我的只有 `Deaths: total=9 (starvation=7, predation=2)`。没有名字、没有讣告、没有事件日志。对比 RimWorld 的"John Doe died of starvation. Ate: lavish meal (2 days ago). Relationship: Jane Doe (wife, grieving +15 days)."——那才是玩家心碎的理由。

Project Utopia 目前像一个"殖民地 excel 表"：所有事情都发生在数字里，没有任何时刻让我去记住一个工人、去伤心一次。这让游玩体验**非常冷**。

### 五、Build 操作的人体工学灾难

- **没有拖拽框选放置**（我想放一片 3x3 农场？点 9 次）
- **没有 shift-click 复制同类建筑**
- **点击反馈延迟**（点了 Farm tool，确认才出来）
- **一键放满 5 个农场会闷声消耗 25 wood，没有"资源不足时静默拒绝"的前置提示**——Insufficient resources 是事后红字
- **Ctrl+Z 有 Undo Build 按钮但不是每次都能触发**（提示灰掉过）

### 六、ASCII 以上、像素以下的美术

视觉上它是"flat_worldsim"预设：瓦片有带纹理的绿/蓝、建筑是小图标、工人是 16px sprite。比 DF 的 ASCII 好，比 RimWorld 的像素差很多。可接受，但我选 colony sim 不是为了美术。

### 七、长期运营？没看到

我最长的一局活了 3 分钟。**中后期节奏我根本没摸到**——因为开局的食物经济就崩。理论上 Warehouse 提供 logistics、Road 提供加速、Kitchen/Smithy/Clinic 提供加工链——但我一次都没完整运转起来。这不是游戏"晚期空洞"，这是**早期就劝退**。

---

## 与 RimWorld / Dwarf Fortress 的直接对比

| 维度 | RimWorld | Dwarf Fortress | Project Utopia (v0.8.1) |
|---|---|---|---|
| **个体深度** | 每个 pawn 有性格、关系、记忆、创伤、技能级别 | 每个矮人有 14 项技能+几百记忆+身体部位模拟 | 工人只有 Role + FSM state，无名、无故事 |
| **AI 可见性** | Dev Inspector + Job/WorkGiver 可查 | `gamelog.txt` + Legends + Announcements | **Dev Panel 信息量爆炸**（这里 Utopia 领先） |
| **地图身份** | Biome 差异巨大（Ice sheet → Tropical） | 每张 embark 独一无二（地质+神话+文明） | 四张地图差异弱到几乎等价 |
| **叙事** | Storyteller + Letter 事件流 | 世界级传奇生成 | 几乎为零，无事件日志 |
| **操作感** | Zone / blueprint / priority 完备 | 设计→工程→执行三层任务 | 单点放置、无框选 |
| **紧急救灾** | 手动 draft pawn + 指派优先砍树/耕种 | 手动 d-b-d 挖矿、v-p 调整 | 几乎无手段（只有 ratio 滑块） |
| **晚期** | 机械族 raid + 终局任务 + modded endgame | Megabeast / Cavern / Adamantine / FB | 未知（我够不着） |
| **上手难度** | 中 | 地狱 | 伪简单（实际靠运气） |
| **机制深度** | 很深 | 超深 | 架构有野心（LLM + 15 system + doctrine），**落地还差一大截** |

一句话总结对比：**Project Utopia 更像是一个"colony sim 引擎"的 demo，而不是一个游戏**。它把 RimWorld 的 dev mode 做成了正餐，但还没做正餐。

---

## 最想让开发者修复的 5 件事

### 1. 开局经济平衡 —— 60 秒不应该就饿死

目前的默认参数让新手几乎必死。要么初始食物从 100 提到 200，要么初始 Farm 自带 2 座，要么首次死亡有 grace buff。**一个 colony sim 让玩家还没学会机制就反复死，是劝退的第一杀手**。我活过 3 分钟是因为 Warehouse 自动救济，但这救济也是偶发的。

**建议**：开局送 2 座 Farm + 1 座 Kitchen（已建），让玩家感受到"哦，这是有工作链的"，死也要死在中期。

### 2. Event Log 必须填充

`Objective / Event Log: No event/diagnostic logs yet.` 这行字我盯了三局。死人、事件、暴雨、补给——这些**游戏里明明在发生**的事情必须有行记录。最小需求是：每次死亡 1 条、每次 Emergency Relief 1 条、每次 Trade Caravan 1 条、每次 Saboteur Strike 1 条。

### 3. 工人个体化 —— 起码给个名字

Worker-80 / Worker-122 / Worker-173 这种 ID 太冷了。随机生成名字（"Aldric the Woodcutter"）+ 死亡 letter（"Aldric died of starvation after 187 sim seconds"）就够了。**成本极低，情感回报极高**。

### 4. Build 工具：拖拽框选 + 资源预检

- 拖一个矩形，预览"这 9 格 Farm 需要 45 wood，你有 22"，点击才消耗
- Insufficient resources 应该在 hover 时就显示，不是点击后弹红字

### 5. AI Fallback 的紧急模式

当 Food < 30 且连续下降 3 个 tick，fallback policy 应当强制：
- 暂停所有非必需建造
- 把 30% 的 WOOD 工人转 FARM
- 禁止产生新工人（那个 Warehouse 生人机制在危机时是负向反馈）

这不需要 LLM，写死一个 FSM guard 就行。目前的 fallback "stabilization" 模式看起来是"保持现状"，而 **"现状"就是死亡螺旋**。

---

## 总分与定性

**总分：3.5 / 10**

分项：
- 架构野心（LLM + ECS + 15 system + doctrine + prosperity/threat 双槽）：**8/10**
- Debug/Inspector UX：**8/10**（老兵会爱这个）
- 实际玩法循环：**2/10**（60 秒崩盘 × 3 次）
- 地图身份/多样性：**3/10**（名字骗人）
- 叙事/情感：**1/10**（Event log 空着）
- 视觉美术：**4/10**（不难看但无特色）
- 上手曲线：**2/10**（没有保护，新手必死）
- AI 表现（fallback 模式下）：**3/10**（空转居多）

**一句话定性**：*"一个让 AI 工程师看到会心动、让玩家第二分钟就关掉的工程原型。"*

Project Utopia 的骨架立得很好——Entity Focus 面板里那些字段我想复制到我自己的 prototype 里。但骨架再好，没肉就不是个游戏。目前版本我完全不会推荐给 colony sim 玩家朋友，但我会把 Developer Telemetry 的截图转发给做过 HTN planner 的朋友们说"看，有人想认真搞这个"。

v0.8.1 的 patch notes 里提到 "Phase 8 Survival Hardening — partial fix for day-365 starvation spiral"——我作为玩家**连 day 1 都没见到**（游戏内"day"单位我甚至不知道换算比例，因为 Session 2 结束时 sim time 才 122.4s）。开发者显然在跟 day-365 这种尺度的问题搏斗，但前 5 分钟的体验才是 90% 玩家会看到的。我 **强烈建议把一个 Sprint 完全投入到"前 180 秒"的设计**上。

祝各位继续努力。我会半年后再来看——如果那时候工人有名字、有讣告、有真正的山，我就会认真玩到 day 365。

— 老赵
