# Project Utopia — Speedrunner 评测报告

**玩家身份**：速通/最优化型玩家，习惯拆解计分公式、找 dominant strategy、靠 Debug 面板读参数
**评测日期**：2026-04-22
**版本**：v0.8.1 "Phase 8 Survival Hardening"（endless survival 模式）
**评测方式**：浏览器直连 127.0.0.1:5173，不读源代码，纯 in-game 数据采集
**总交互次数**：50+ 次（按键、点击、DOM 注入、Debug 面板读取、多次 run 重启）

---

## 身份自述

我是那种上手一个殖民地模拟器，第一件事就是去找 Debug 面板的人。不是因为我想作弊，而是因为我想知道**游戏在用什么数字给我算分**。我会故意把一个 slider 拉到最大看它崩不崩，会故意不做建筑看 score 会不会负数，会故意 FF 到 10 分钟看它到底有没有 endgame。

Project Utopia 的 pitch 是 endless survival，"Survive as long as you can"。作为 min-max 玩家，endless 对我来说就是**单位时间出分效率**——一分钟内能攒多少 Score、多少 Dev Index、能不能把 Threat 压到 0、能不能让 Prosperity 爆到 100。这篇报告就是一个 speedrunner 第一次真正深度体验这个游戏之后的硬核感受。

---

## Run 1 日志 — Broken Frontier / Temperate Plains / seed 1337

**开局条件**
- 模板：Temperate Plains
- 场景：Broken Frontier — "Reconnect the west lumber line, reclaim the east depot, then scale the colony"
- 起始资源：Food 110, Wood 7, Stone 4, Herbs 0, Meals 13, Gold 65, Defense 24
- 起始人口：Workers 15, Visitors 4, Herbivores 2, Predators 1
- 起始角色分布：FARM 3, WOOD 8, STONE 1, HERBS 1, COOK 0, SMITH 1, HAUL 1
- 初始 Dev Index：**48/100**（已经几乎满血的一半，有点水）

**策略**：偏探索型——先摸清 HUD、建筑费用、暂停/FF 的行为，再少量建造。

**关键观察**
- **Selected Tool: Road, Cost: 1w**——路是 1 木一格，**Farm 5w**，**Kitchen 8w+3s**，**Warehouse 10w**。经济瓶颈是木头而不是食物。
- Space 可以暂停，但**暂停时可以无限放建筑**（只要资源够），这就是典型的 "pause-and-queue" cheese 空间。
- FF 实测：**并不是 x10，更像是 x1.5~x2**（60 秒真实时间推进 2 分钟 sim 时间）。对速通玩家来说这个 FF 太弱，且在 pop pump 之后因 WorkerAISystem 时延 11.5ms 而进一步掉帧。

**Run 1 结果**
| Sim 时间 | Score | Dev | Food | Wood | Meals | 备注 |
|---------|-------|-----|------|------|-------|------|
| 0:26    | 31    | 49  | 101  | 8    | 15    | 开局暂停，看 HUD |
| 0:41    | 50    | 48  | 101  | —    | 15    | "Insufficient resources" 红字 |
| 1:01    | 81    | 47  | 84   | 3    | 18    | Dev 慢慢掉 |
| 1:52    | 147   | 45  | 2    | 0    | 21    | **食物崩盘** |
| 1:56    | 151   | 45  | 5    | 1    | 21    | Threat 54→60 |
| ~2:10   | 崩     |     | —    |      |       | 场景重置回主菜单 |

**Run 1 最终估计 Score ~ 150，Survived ~2:00，触发自动重置**

**速通视角吐槽**
- Score 基本就是 **1.3 pts/秒 × 生存时长**——一个线性函数。只要我活着，每秒固定进 1~1.5 分，**跟我建不建东西关系不大**。第一次跑几乎就能得出：Score = f(Time)。
- Dev Index 开局 48/100，之后**只降不升**（我动建造反而扣分）。作为玩家我很困惑：Dev 到底怎么涨？没人告诉我。
- 场景目标（Broken Frontier）我根本没去完成，因为游戏没有把目标 checklist 放在显眼地方——只有开菜单时一行描述。

---

## Run 2 日志 — Gate Bastion / Fertile Riverlands / seed 1337

**开局条件**
- 模板：Fertile Riverlands（起始资源更好：Wood 32, Stone 16）
- 场景：Gate Bastion — "Reopen the north timber gate, reclaim the south granary, and stabilize two chokepoints"
- 起始 Dev：**55/100**（比 Temperate 高 +7，**Fertile = 更好的起始 Dev**）
- 地图：水域遍布，河流切割成岛屿，殖民地只有一条短垂直路 spine

**策略**：Farm spam + Kitchen + Warehouse 密集布局。
- 一次性队列放 4 个 Farm、1 个 Kitchen、2 个 Warehouse、4 个 Lumber
- Wood 32 → 9（6 个 Farm/Lumber 各消耗 ~4w）
- **Dev 从 55 掉到 37**——大跳水，证明"一股脑 spam 建筑"直接扣 Dev

**Run 2 结果**
| Sim 时间 | Score | Dev | Food | Wood | Meals | 备注 |
|---------|-------|-----|------|------|-------|------|
| 0:02    | 2     | 55  | 100  | 32   | 12    | 开局豪华 |
| 0:27    | 32    | 37  | 101  | 9    | 15    | 建筑放完，Dev 崩 |
| 1:19    | 109   | 36  | 37   | 2    | 20    | 资源打折但没饿死 |
| 1:40?   | 崩     |     |      |      |       | 重置回主菜单（Archipelago 默认） |

**Run 2 最终估计 Score ~ 140，Survived ~1:40**

**速通视角吐槽**
- 我花时间布局反而比 Run 1 没布局**死得更早**。这告诉我一件事：**主动玩法的 ROI 是负的**。
- 没看见任何"Gate Bastion 场景目标进度条"，我完全不知道"stabilize two chokepoints"需要什么。
- 建筑费用 vs 收益根本不清晰。Farm 5w 换多少 Food/秒？没 tooltip 说。

---

## Run 3 日志 — Fertilt Riverlands 又一遍 / seed 15736 （passive baseline）

**策略**：完全躺平——开局就 FF，不做任何建造，看 AI fallback 能撑多久，作为 min-max 玩家的 baseline 对照。

**Run 3 结果**
| Sim 时间 | Score | Dev | Food | Meals | 备注 |
|---------|-------|-----|------|-------|------|
| 1:09    | 94    | 49  | 79   | 19    | 自然增长 |
| 2:11    | 171   | 46  | 0    | 22    | 食物归零 |
| ~2:50   | 崩     |     |      |       | 回主菜单 |

**Run 3 最终估计 Score ~ 200，Survived ~2:40**

**极其重要的对照结论**：
- Run 1（轻度干预，死早）：Score ~150
- Run 2（重度干预，死更早）：Score ~140
- Run 3（完全躺平）：Score **~200**

**躺平 > 干预。** 这是 speedrunner 最不想看到的结论——游戏的 dominant strategy 是**什么都不做**，让 AI fallback policy 自己帮你走。干预只会让 Dev 掉、让 Wood 归零、让 Food 没机会恢复。

---

## Run 4 日志 — Island Relay / Coastal Ocean / seed 15736（cheese 攻击）

**策略**：Population Control 面板 **Workers +10 连点 5 次**，把工人从 12 pump 到 62+，看游戏会不会"规模即正义"。

**Run 4 结果**
| Sim 时间 | Score | Dev | Deaths | Meals | 备注 |
|---------|-------|-----|--------|-------|------|
| 0:06    | 11    | 33  | 0      | 13    | pump 后 Dev 立刻掉 |
| 1:09    | ~95   | 49  | —      | 62    | Meals 爆炸，Gold 54 |
| 2:31    | 161   | 37  | —      | 62    | 看似稳了 |
| 4:03    | **-157** | 30 | —   | 22    | **Score 负了！！** |
| 5:55    | -155  | 24  | —      | 12    | 轻微回升 |
| 6:28    | -122  | —   | **54 (starve 50 / pred 4)** | 0 | Deaths 信息终于显示 |

**这是全程最关键的数据点**：
- Pop pump 之后工人吃光 62 份 Meals，接着饥饿死亡 50 人
- 每个饿死的工人扣大概 **5~6 点 Score**（50 死 × 5 ≈ -250，配合 Scenario 失败罚分合计约 -280）
- Debug 面板 World State 里写着 "Island Relay: 0/2 routes online | 0/1 depots reclaimed | warehouses 0/2 | farms 0/3 | lumbers 0/2 | roads 46/22 | walls 2/6"——**所有场景目标都是 0/2 或 0/3 失败**，这是负分的真正来源

**关键 breaking 发现**：
1. **Score 可以为负**（没 UI 警示，HUD 只显示数字，我都差点没发现）
2. **场景目标 silent fail**——游戏不会红字告诉你"你没做到 warehouses 2 个"，只有打开 Debug 才能看到进度
3. **人口 cap 存在**：我 pump 到 62，最终 Workers 只剩 16，说明饿死+cap 会把人口回归到一个平衡点
4. **FPS 掉到 51.9（Frame 1.10ms）**——277354 累计 worker 实体说明 WorkerAISystem 吃了大量 CPU

---

## 综合数据表

| Run # | Template           | Seed  | Scenario        | 策略           | Survived | Final Score | Final Dev | Deaths |
|-------|--------------------|-------|-----------------|----------------|----------|-------------|-----------|--------|
| 1     | Temperate Plains   | 1337  | Broken Frontier | 轻度 Farm 建设 | ~2:00    | ~150        | 45        | ?      |
| 2     | Fertile Riverlands | 1337  | Gate Bastion    | 重度建筑 spam  | ~1:40    | ~140        | 36        | ?      |
| 3     | Fertile Riverlands | 15736 | (unnamed)       | **完全躺平**   | ~2:40    | **~200**    | 46        | ?      |
| 4     | Coastal Ocean      | 15736 | Island Relay    | Worker pump cheese | 6:28+  | **-122 ~ -157** | 24 | **54 (50 饿死)** |

**观察总结**
- Score/秒 约为 **1.3**，时间是主要变量
- Dev 只降不升（至少在我尝试的主动策略中），说明 Dev 的 positive 信号被 negative 遮盖了
- Scenario 目标未完成会**大额扣分**（至少 -150+）但没有 UI 提示
- Population pump 会引发 starvation spiral 造成毁灭性惩罚

---

## 找到的策略与 cheese

### 1. **Dominant Strategy: 躺平 FF**
开局 Space 解锁 → Fast Forward → 什么都不做 → Score ≈ 1.3 × 生存秒数。
这是真的 optimal strategy，因为任何主动建筑都会扣 Dev、吃 Wood，最后把 Food 拖垮。

### 2. **反向 cheese: 绝对不要 pop pump**
增加 Workers 数量 = 增加食物消耗 = 必死循环 → Score 崩盘到 -100 以下。
Population Control 这个 slider 对速通来说是 **trap option**。

### 3. **Pause-build exploit（无效）**
Space 暂停时可以无限点放置建筑——传统 RTS 玩家会喜欢的 pause-micro。
但在本作里，因为建筑本身负收益，pause-spam 反而加速死亡。
**是个可以用但无收益的"cheese"。**

### 4. **Template meta**
- **Fertile Riverlands 起始 Dev +7**（55 vs 48），是开局最强模板
- **Coastal Ocean 场景极难**（Island Relay 要求 bridge 多个 causeway，木头压力大）
- **Temperate Plains 中庸**但起始 Dev 最低
- 如果 speedrun WR：**Fertile Riverlands + 躺平** 大概是最稳 200+ 分路线

### 5. **Debug 面板的隐藏信息**
- World State 的 Warning 行是**唯一**能看到场景目标进度的地方（普通玩家永远看不到）
- Deaths 细分（starve / pred）只有 Debug 里有
- Prosperity / Threat 数字也只有 Debug 里

### 6. **算法可见但算法不可控**
Entity Focus 点任何 worker 都能看到 "Policy Influence: applied=false | topIntent=eat | topWeight=1.40 | policyDesired=harvest"——AI 内部 intent 分数全给你看。
但我**不能修改 Doctrine** 来 override——Doctrine 是 "agrarian" / "balanced" 自动切换的。作为 min-max 玩家，我看得到参数但碰不到——这很挫败。

### 7. **未找到的 bug**
没找到资源溢出 bug、没找到 Threat 上 100 的方法（最高看到 69）、没找到建筑叠放 cheese。游戏底层**相对扎实**——Phase 8 Survival Hardening 的补丁看来真的修了大部分 exploit。

---

## 游戏有没有真正的玩法上限？

**坦白说：对 speedrunner 来说，几乎没有。**

这个游戏更像是一个**工程师在调自己的 AI fallback policy**的 sandbox，而不是一个 player-driven 的策略游戏。证据：

1. **玩家干预的 ROI 为负**：Run 1/2/3 三次对照里，躺平得分最高
2. **没有 tech tree / upgrade 系统**：12 个建筑摆在 Build Tools 上全开局解锁，没有升级、没有 tier，玩家无法做"build order"优化
3. **没有 Score leaderboard / target**：endless 模式意味着没有 "beat this time" 目标
4. **没有主动防御操作**：Wall 可建但 Threat 增长几乎不受我行为影响，Wall 建多少都没 visible feedback
5. **场景目标 invisible**：就算我想完成 "Island Relay"，UI 不告诉我要建什么、建到哪、建几个

作为对比，**RimWorld / Oxygen Not Included / Dwarf Fortress** 都给我明确的 optimization 轴：
- 饭多少卡路里/周期
- 电力 Watt/秒
- Research 解锁速度

Project Utopia 的**数字层次非常丰富**（Prosperity/Threat/Dev/Gold/Food×7种/Doctrine/15 个 System 时延）但这些数字**玩家很难影响**。Debug 面板有 25+ 个 slider，但核心战斗力都是 AI 自己跑。

**玩法上限测评**：7 分钟左右，你就会意识到"我做的所有事都比不做更糟"。对普通玩家是迷失，对 speedrunner 是灾难——**没有可优化的轴，就没有 run**。

---

## 几个可以挽救 speedrun 体验的建议

（作为 min-max 玩家的非请求性反馈）
1. **加一个明确的 Score target**（比如 Bronze 500 / Silver 1000 / Gold 2000 @ day 30）——现在 endless 无目标太空洞
2. **把 Scenario 目标 checklist 从 Debug 搬到 HUD**——普通玩家根本看不到 "warehouses 0/2"
3. **Dev Index 的正负贡献要显示**——Dev 只掉不涨让我不敢动
4. **建筑 tooltip 加"收益/秒"**——Farm 5w 换 ? food/sec 必须说清楚
5. **FF 做到 x4 / x8 档位**——现在 ⏩ 接近 x2，对 speedrun 体感太慢
6. **解锁 Doctrine 手动切换**——让玩家选 "aggressive" / "agrarian" / "militant" 是非常自然的 min-max 维度

---

## 评分与一句话总结

**5 / 10**

（评分依据：底层系统扎实、数字丰富、Debug 可见度高是加分项；但**dominant strategy = 躺平**、**玩家干预负 ROI**、**场景目标 invisible**、**FF 太慢**、**没有可速通的 target** 是 speedrunner 视角致命缺陷。作为工程 demo 值 7 分，作为 player-facing game 值 3 分，**折中给 5 分**。）

**一句话总结**：**这不是游戏，是个给工程师看 AI fallback 表现的沙盒——作为 speedrunner 在里面最好的策略就是按下 ⏩ 然后起身倒杯水。**

---

*本报告共 50+ 次浏览器交互：DOM 注入 helper、Population Control 面板操纵、Colony/Debug 面板访问、4 次 run 对照、负分触发实验、Entity Focus AI 内部数据提取。所有数据均从游戏运行时 HUD/Debug/DevTelemetry 面板直接读取，未读取源代码。*
