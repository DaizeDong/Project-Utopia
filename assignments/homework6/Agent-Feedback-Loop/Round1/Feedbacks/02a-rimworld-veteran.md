---
reviewer_id: 02a-rimworld-veteran
round: 1
date: 2026-04-22
score: 3
verdict: 一个形似 colony sim 的自动模拟器，玩家在场但不存在——对 RimWorld 老兵来说几乎没有可操控的策略层，观察 10 分钟便看清全貌
---

# Project Utopia — 外部试玩评测（RimWorld 老兵视角）

## 玩家身份自述

玩了十年 colony sim，从 RimWorld 的第一个 alpha 到 Dwarf Fortress 的 ASCII 深井，从 ONI 的氧气管道到 Banished 的寒冬存活。我习惯了 Entity Inspector 里几十个字段、习惯了工人心情条、习惯了生产链从第 4 层开始才真正露牙齿。带着这种审美，我今天打开了 Project Utopia。

开局 start screen 相当干净：一个标题、六个地图模板下拉、一个固定 96×72 的地图尺寸、一个“Survive as long as you can”的终极目标。美术风格是柔和像素块——接受度没问题，我连 DF 的 `@` 符号都玩过。问题从点下“Start Colony”的那一秒开始。

## Session 1：Temperate Plains——一场 10 分钟的观察实验

画面推给我一个中央有河流、两岸有少量道路与田地的既成殖民地：13 名工人已经在劳作，110 食物、12 木、5 石。HUD 告诉我目标是“Reconnect the west lumber line, reclaim the east depot, then scale the colony.”——Broken Frontier 场景。很好，我喜欢有目标的开局。

我习惯先观察 60 秒，再做第一个决策。按了 ⏩ 4x 倍速。

**第 1 分 59 秒**：食物断崖式跌到 3，木材 1，工人涨到 21。-10/death 开始出现，已经死了 10 个。我心里第一次不安了——RimWorld 里你通常有 5–10 分钟的"蜜月期"让你熟悉地图，而这里倍速刚开两分钟就出现了批量饿死。

**第 3 分 37 秒**：Dev 指数从 49 跌到 44，仓库数 0/2（本来 7/2，全消失了），farms 6/4、lumbers 2/3、而 **routes 0/1 · depots 0/1**——场景目标反而倒退了。最诡异的是 Colony 面板的角色分布：9 农夫、6 伐木、1 石匠、1 采药、1 铁匠、**0 厨师、0 草药师、0 搬运**。我有一座 Kitchen 可以建，但 AI fallback planner 根本没想过去建它。食物生产 0.0/min、损耗 -0.4/min。

我尝试救灾。切到 Warehouse 工具——Cost: 10 wood，我只有 5。切到 Farm——工人已经有 9 个在 farm 上，再建也不会有人去种。切到 Kitchen——没资源。这种"我想干预但没手段"的挫败感，在一款 colony sim 里是致命的。

**第 5 分 33 秒**：食物 17，木材 7，死亡 -80。开始大面积灭口。

**第 6 分 02 秒**：我鼠标悬停在现有道路瓦片上，Warehouse 工具居然告诉我 "cost: 8 wood"——基础价是 10，但根据地块不同折扣成 8。没有任何 UI 提示这是道路邻接奖励还是什么机制。RimWorld 的 blueprint 会明确告诉你 "requires adjacent road" 或 "road speed bonus will apply"；这里只有神秘的一行数字变化。

**第 7 分 39 秒**：Workers 8，farms 0/4——农田在消亡。Deaths -140。我按 L 切 Heat Lens，画面**看不出任何变化**。是没生效？还是颜色叠加太淡？我无从判断。按 Space 暂停、Space 继续——空白键响应倒是正常。

**第 9 分 39 秒**：工人稳定在 8、食物 22、所有生产速率都是 0.0/min。殖民地进入"活死人"平衡：每隔几十秒死一个、诞生一个，分数仍在 +1/s 慢慢涨，**得分机制只奖励"活着"这件事本身**，不奖励扩张、不奖励科技、不奖励完成场景目标。这是我见过最空洞的得分函数。

我彻底放弃 Session 1。

## Session 2：Rugged Highlands——几乎一模一样的开局

回到 start 页面，切 Rugged Highlands，点 Start。画面推上来的殖民地布局、河流走向、ruins 位置、工人数量、资源初值——**和 Temperate Plains 一模一样**。场景描述仍然是 "Broken Frontier — Reconnect the west lumber line..."。

我一度以为地图没切换，直到玩了一会儿，注意到 HUD 里有 herbs=6 而 Plains 那局始终是 0——推断地图生成器确实跑了不同的代码路径，但视觉结果高度同质。作为一个见过 RimWorld "沙漠/冰原/热带雨林"和 DF 六种生物群系地下差异的老兵，这种"地形只影响 3 个资源数字"的模板多样性是**玩法没有支撑、只有命名不同**。

我让 Rugged Highlands 跑到 **8 分 28 秒**：

- Workers 15（始终浮动 8–23）
- Food 23、Wood 10、Herbs 8
- Score 468、Dev 46
- Deaths -100、births 60
- **routes 0/1 · depots 0/1**（还是没完成）

比 Plains 多撑了一会儿，大概因为初始地形多给了一点 herbs 加成，但结局是相同的——**治理存在但看不见的玻璃天花板，AI 建到 16 个 farm 也无法解决 0 cook、0 haul 的结构性缺陷**。

## Session 3：Archipelago Isles——第一次看到地图真的不一样

这个 Session 让我对这游戏态度软化了一点点。

模板切到 Archipelago 后 start 页面还是 Plains 的预览（bug：template change 不触发 preview regenerate），点了一次 "New Map" 终于拿到真正的岛屿地形：蓝色汪洋中几个散落绿岛、初始殖民地被挤在中等大小的岛上、场景改成 "Island Relay — Bridge two causeways, claim the relay depot, and connect the harbor to the outer fields." 终于不是那行模板化的 "west lumber line" 了。

点 Start、⏩ 4x 跑 60 秒。结果：

- Workers 22、Food 13、Wood 8、Herbs 1
- FARM 15（**再次夸张地堆到一个角色**）、COOK 0、HAUL 1
- 2:59 已经 -20 deaths

Archipelago 在 RimWorld 里是"海盗骚扰频率低、但食物产区小、必须尽早造桥"的紧张玩法；这里它是"颜色不一样的正方形孤岛"。桥能不能造、能不能跨海运输、AI 会不会发现跨岛路径——我在剩余预算里没机会测完，但从 farms 16/4（严重超建）的行为看，**殖民地 AI 还是那个只会把最简单的 role 堆到上限的 fallback planner**，桥接这种跨岛决策大概率也是由它想当然地完成（或者压根不做）。

## 系统深度评价（老兵视角）

### 我能看到的——对比 RimWorld，哪些"形"有了

- **Entity Inspector 面板**：点右下角有个 Entity Focus tab，可以 select 工人看 state——但我点了多次，canvas 上工人太小、hit box 太窄，没成功选中一次。好消息是 UI 入口存在；坏消息是交互失败率高。
- **资源速率 ticker**：Resources 面板会写 `Food 22= 0.0/min` 或 `Wood 7▼ -66.6/min`，方向箭头+数字速率，这个信息密度是 colony sim 的**最低标配**。好。
- **角色分布**：Population 面板显示 FARM/WOOD/STONE/HERBS/COOK/SMITH/HERBALIST/HAUL 数量——可以 debug 出"为什么工人没在厨房做饭"。对老玩家是加分项。
- **Dev Index / Score 双指标**：Dev 0–100 是进步指标，Score 是累计分，这个双轨制我 approve，类似 RimWorld 的 wealth + 财富惩罚。
- **12 种建筑 toolbar**：Road / Farm / Lumber / Warehouse / Wall / Bridge / Erase / Quarry / Herbs / Kitchen / Smithy / Clinic。数量够，分类合理——比 Banished 的建筑种类还多一些。

### 我看不到的——"意"几乎全无

- **没有"暂停指挥"模式**。RimWorld 的核心乐趣之一是暂停 → 下 10 个指令 → 解除暂停看表演。Utopia 里空格确实暂停，但我**按了暂停后什么都做不了**——Build 按钮依然只能"选工具"，没有 queue/blueprint 概念，工人什么时候去建完全由 AI 决定。玩家的能动性停留在"选择 12 种建筑之一然后希望 AI 去建"。
- **没有 worker priority 表**。RimWorld 那张 11x15 的 work tab 是这类游戏的灵魂。Utopia 里没有办法告诉"那个工人优先做搬运"，一切由 fallback planner 决定，而它明显不懂得开厨房。
- **没有情绪/心情系统**。10 分钟游戏里没有一次"工人崩溃"、"工人打架"、"工人酗酒"事件。工人就是一个会变灰色的方块。
- **没有天气/季节的可见反馈**。CLAUDE.md（我没读，但从 HUD 推断）应该有 seasonal weather、soil exhaustion 等深度系统，但玩家视角下我看不到任何"冬天来了"、"干旱了"、"这块田疲劳了"的弹窗或视觉提示。
- **没有战斗预演或威胁显示**。我看到 HUD 里有 `walls 10/4`，暗示有围墙/防御目标，但 10 分钟内没遇到任何袭击或野兽攻击事件（除了 "Predators 1" 数字常驻）。Raid 频率？威胁等级？未知。
- **场景目标 `routes 0/1 · depots 0/1`** 在我所有三盘里始终是 0/1，AI fallback planner 从来不去完成它。那这个目标对玩家意味着什么？我应该手动建路去关闭缺口？但教程里没说，Storyteller 那段话也只告诉我"Workers should sustain route repair"——那**为什么他们不 sustain？**

### 具体槽点

1. **"4x 倍速 = 灾难倍速"**。 倍速下 AI 决策没跟上，饥荒 30 秒内形成。我理解这是 survival mode 的长时程测试压力，但对玩家来说等于"我点了倍速然后殖民地自杀了"。应该在危机发生时**自动降速并弹窗**（RimWorld 的 Randy Random 即便再坏也会给你提示）。
2. **角色分布硬缺 COOK 和 HAUL**。三盘游戏下来两个角色始终是 0。AI planner 不知道造 Kitchen、不懂得把食物从 farm 搬到 warehouse。这在 CLAUDE.md 里（我猜）已经被标记为 "Phase 9 punted" 的 bug，但作为玩家我不该为此买单。
3. **模板选择的视觉反馈延迟**。下拉切 Archipelago 后预览不变，必须再点 New Map 才刷新。开发者迷惑 UX。
4. **Heat Lens 按 L 无明显效果**。也可能是我没看懂颜色叠加的含义——但 RimWorld 的 overlay 会用刺眼的红/绿/蓝让你一眼看懂。这里什么都没变。
5. **Entity Focus 点击命中率 0**。canvas 上工人是 8×8 像素，鼠标移动到位也没 tooltip，多次尝试 select 失败。这种核心 inspect 动作失败率太高。
6. **Score 只奖励"活着"**。`+1/s · +5/birth · -10/death` 是一个恶性循环——AI 拼命生、拼命死，分数稳步上涨。不奖励技术、不奖励探索、不奖励 Dev Index。这会让长期玩家没有任何中后期推进动机。
7. **Dev Index 在我三盘里都停在 40–49**。从未上过 50。天花板是结构性的（缺 COOK/HAUL 就封锁 kitchen/medicine 科技），玩家却被告知这指数 0–100。你**永远看不到上半区**。

## 缺失机制（老兵最想看到的）

- **Work tab 优先级编辑**（RimWorld 11×15 那张表）——让玩家可以手动修补 fallback planner 的盲区
- **Blueprint 蓝图 / 建造队列**（DF 的 designate、RimWorld 的蓝图）——让我在暂停时批量下单
- **Colonist 心情条 + 崩溃事件**——让 NPC 感觉像人
- **威胁时间轴 / Storyteller 面板**（RimWorld 的 Cassandra）——让我知道下一次 raid 还有多久
- **可视化的温度/湿度/土壤肥力 overlay**——让 Heat Lens 有实际价值
- **Save/Load**——我在 UI 里没找到，长时程测试的反直觉
- **场景目标完成后的正反馈**（关闭 route、reclaim depot 的弹窗 + 奖励）

## 与 RimWorld / DF 的直接对比

| 维度 | RimWorld | Dwarf Fortress | Project Utopia |
|---|---|---|---|
| 可操控维度 | 几十个 work priority + blueprint + 药物策略 | 无数 zone + stockpile + manager order | 选一个工具，希望 AI 去建 |
| AI 行为深度 | 每个 pawn 有心情、技能、成瘾、关系 | 每个 dwarf 有 100+ 属性 | 工人有 role 归属，没见到个体差异 |
| 场景结构化目标 | 可选（结束殖民） | 可选（击败 megabeast） | 有，但 AI 不完成，玩家也无办法完成 |
| 长期动机 | 富豪威胁 + 科技 + 故事 | 传奇大师 + fun 事件 | Score +1/s 恒速 |
| 建筑数量 | 100+ | 无穷 | 12 |
| 单局最短"学会"时间 | 20 小时 | 20 小时 + wiki | 10 分钟看完全貌 |

## 最想让开发者修复的 5 件事

1. **修 fallback planner 对 Kitchen 和 Haul role 的盲区**——这是食物链最基础的断层
2. **自动降速 + 危机弹窗**——倍速时别让玩家眼睁睁看殖民地死光
3. **Work priority UI**——给玩家一个手动接管 AI 的工具
4. **Entity Focus 点击 hit box 扩大 3–5 倍**——目前几乎不可用
5. **模板之间拉开差异**（不只是资源数字，要有可见的地形/植被/规则变化）

## 总分与一句话定性

**3 / 10**

三颗星给的是：多角色资源链的骨架存在、HUD 的速率面板信息密度合格、Archipelago 模板确实有视觉差异。扣分是：玩家没有能动性、AI 自己把殖民地玩死、模板同质化严重、场景目标形同虚设、Score 函数空洞、中后期节奏根本不存在——这款游戏的"游戏"部分还没写完，它当前更像一个**给 benchmark 跑分用的自动模拟器**，而不是一款给玩家体验的 colony sim。

一句话总结：**Project Utopia 是一份诚意的架构底稿，但对 RimWorld 老兵来说，它还没到"可以坐下来玩"的阶段——玩家在场但不存在。**
