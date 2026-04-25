---
reviewer_id: 02a-rimworld-veteran
persona: RimWorld 老兵（10 年 colony sim 经验，RimWorld / DF / ONI / Banished）
date: 2026-04-24
build_url: http://127.0.0.1:5173/
maps_played: [Temperate Plains (Broken Frontier), Rugged Highlands (Gate Bastion), Archipelago Isles (Island Relay)]
total_session_minutes_real: ~18
total_session_minutes_ingame: ~18 (累计三张图)
score: 3
---

# Project Utopia —— 一个 RimWorld 老兵的首玩实录

## 玩家身份自述

我从 Alpha 15 开始玩 RimWorld，DF 里建过 5 个熔岩城堡，ONI 通关过 Rime 无伤，Banished 把一个 300 人村打到 500 年。给我一款新的 colony sim，我的直觉会在 5 秒内锁定三件事：**生产链深度、worker AI 的决策可读性、长期运营的压力曲线**。其他东西——美术、UI 布局、音效——我都可以忍。我唯一不能忍的是：**玩了 10 分钟我就看穿它的全部机制**，或者更糟——**AI 蠢到让我的殖民地在我还在搞建筑布局的时候就饿死一半人**。

打开 Project Utopia 的落地页时，我看到 “∞ Survive as long as you can”、六个地图模板、14 种 tile、生存模式 + 积分系统。好，这是一个有野心的小项目，感觉像 RimWorld-lite + 生存沙盒的缝合。我先挑了 Temperate Plains 作为 tutorial 图，看它能不能教会我它自己。

---

## Session 1：Temperate Plains — Broken Frontier

进图的第一眼 UI 非常密集。顶部是资源条（Food 104 / Wood 8 / Stone 4 / Herbs 0 / Workers 14），中间是一个像素风格的殖民地——有 13 种建筑按钮（Road / Farm / Lumber / Warehouse / Wall / Bridge / Erase / Quarry / Herbs / Kitchen / Smithy / Clinic），右下 Entity Focus，左上 scenario objectives（routes 1/1、depots 1/1、warehouses 7/2、farms 4/6、lumber 3/3、walls 7/8）。**这个 objective 清单是个好设计**——我一眼就知道该做什么。但同时也暴露了第一个问题：**Stone 只有 4**，而我还需要 walls 7/8，而 Kitchen 要 3 stone，Smithy 也要 stone。Stone 是瓶颈。

地图上已经有了先民遗迹、8 个农田 tile、几条路、一个简陋的村子，西北是树林东南是沙 + 水域。先民给的底子很到位，开局不会面对空白画布（这里比 RimWorld 好，RimWorld 开局永远是 3 人 + 零建筑）。

我开了 Autopilot，挂上 4x 快进，想看看它的 fallback AI 到底有多聪明——真正的 colony sim 老兵都这么做，先看 AI 把殖民地玩成什么样。

**00:30**：First Tool forged 触发的里程碑横幅跳出来。Score 35 Dev 48/100。Population 15（初始 14 + 1 出生？），角色分配 FARM 3 / WOOD 8 / STONE 1 / HERBS 1 / COOK 0 / SMITH 1 / HERBALIST 0 / HAUL 1。我心里咯噔了一下：**COOK 0、HERBALIST 0、HAUL 1**——整个殖民地只有 1 个搬运工，没有厨师，没有医药。这意味着哪怕我有 Kitchen 和 Clinic，工人也不会去操作。RimWorld 里这是致命的——食物会堆在农田烂掉。

**02:35**：果不其然。食物条从 104 → 0（!!），顶部红色 banner：「Food bottleneck -> Recover food now ->」。Population 21，autopilot 看到饥荒，把 farmer 拉到了 **14 个**（占总人口 2/3），但——**COOK 仍然是 0，HAUL 还是 1**。它把所有人堆去种地，但没人去煮没人去运。Warehouses 从 7/2 掉到 3/2（仓库在掉？可能是被erase或者是scenario objective reset？）。Routes 也从 1/1 掉到 0/1。**Autopilot 同时毁掉了 scenario 目标和经济**。

**05:09**：第一个饿死。"Thal-15 starved — food empty 79s"。Population 19（从 21 掉）。Score 314，Dev 43/100。Dev 在掉。

**07:55**：又饿死一批。Population 14（和开局一样）。Food 0、Wood 0、Stone 0、Meals 0、Medicine 0。Farms 0/6（!!），Lumber 0/3。**所有 scenario 目标都崩了**。Dev 42/100，Score 430。我停下来，想：这不是玩家输了，这是**默认 AI 在无人干预的情况下只能活 5 分钟**。

在 RimWorld 里，Storyteller 会给你喘息。在 DF 里，dwarves 蠢但至少会自己吃饭。这里的 fallback AI 似乎陷入了一个经典困局：**食物低 → 加农民 → 但没厨 → 食物不过是摆设 → 继续缺食 → 继续加农民**。这是 feedback loop 设计错误，不是 AI 能力差。

我尝试 click worker 看 Entity Focus（老兵动作），想看 state machine 内部。但我的 synthetic click 没穿到 Three.js pick raycaster，面板只显示 "No entity selected"。真人玩应该 OK，但作为一个深挖内部状态的玩家，我没能看到**单个 worker 的 intent / state / carry / fatigue**——这些对诊断至关重要。希望 UI 在真人手上能工作；如果连这个都要 Debug 才能开，那信息披露就太差了。

（截图：`01-temperate-start.png`, `02-colony-panel.png`, `04-autopilot-5min.png`, `05-autopilot-10min.png`）

---

## Session 2：Rugged Highlands — Gate Bastion

我重开了一局，这次选 Rugged Highlands，想看**不同地形会不会强制不同策略**。

开局：Food 128 / Wood 25 / Stone 9 / Herbs 1 / Workers 12。比 Plains 资源更充足，地形明显不同——一条南北狭长山谷，两侧是蓝色山石（应该是高海拔），中央一条绿色走廊。Scenario：「Reopen the north timber gate, reclaim the south granary, and stabilize two chokepoints」，walls 目标 7/10，明显是 **defense-oriented** 设置。

**我注意到一个奇怪的东西**：DIRECTOR 文本框里写着：

> "reconnect the broken supply lane: the colony should sustain reconnect the broken supply lane while keeping empty bellies and full backpacks from overriding the map's intended reroute pres"

后半句被截断、语法破碎、像 prompt 模板泄漏。两张图（Plains 也有同样的）都是这同一段文字——**这是 LLM 输出 / prompt 拼接出了 bug**，不是每张图各自的 director 叙事。RimWorld 的 Storyteller 至少给你一句有戏剧感的 flavor。这里是 **"reroute pres"** 断在半句里，像 bug 报告而不是叙事。**开发者必须修这个，它破坏了所有 immersion。**

Autopilot + 4x，重复昨天的剧本：

- **03:24**：Food 3（!!），Wood 1，Population 20，"Food bottleneck" banner。FARM 14，COOK 0，HAUL 0。_跟 Plains 一模一样的坍缩_。
- **06:04**：Ilia-32 死亡（饿死 @350.5s）。Population 20→12，掉了 40%。Food 11、Wood 0、Stone 2。Farms 0/3，Lumber 1/2，walls 7/10 保住。Dev 40/100。

**关键发现**：地形变了，scenario 变了，但 **fallback AI 的行为曲线完全一致**——约 2-3 分钟食物耗尽，5-6 分钟首批饿死，所有生产建筑 decay 到 0。这说明 autopilot 是和地图解耦的通用策略，而这个策略对**人口增长后的 meal/haul 缺口没有响应**。在 RimWorld 里你可以手动指定 work priority；这里 autopilot 似乎只有一个「短视的缺啥补啥」策略层。

（截图：`09-highlands-start.png`, `10-highlands-midgame.png`, `11-highlands-long.png`）

---

## Session 3：Archipelago Isles — Island Relay

第三图我换了**海岛**模板，想看 Bridge 机制。这图的美术效果是三张里最好的——多个绿岛被深蓝水隔开，中央岛上已经有殖民地和一些砍好的树桩，东南有远岛（探索诱惑），北岛上有个看起来像 visitor 的熊一样的家伙。Scenario：「east fields causeway gap at (53,35)」——东边一个 tile 级的精确坐标任务，这很细节，我喜欢。

Food 120 / Wood 21 / Stone 17 / Herbs 0 / Workers 12 / walls 2/6。

这次我先**暂停、选 Kitchen、想手动放一个厨房打破循环**——如果 Kitchen 有 cook 工人，能把 food→meal，应该能救命。Kitchen 成本提示：8 wood + 3 stone（面板里的说明文字写的是 8+3，但快捷气泡又写的是 5 wood + 3 stone——**成本提示不一致**）。我 synthetic click 在 canvas 上又没触发建造（Three.js raycaster 吃不进 dispatched MouseEvent），只好继续开 autopilot。

**03:15**：Food 7 / Wood 0 / Stone 3 / Herbs 2 / Workers 18。"Tam-46 died（starvation）" @178s。**饿死得更早了**——可能因为海岛地形上 workers 往返更远，pathing 更差。Score 205。Dev 32/100（比前两图更低的起点）。Routes 0/2（autopilot 没修因果任务）。

和 RimWorld 的海岛 modded map 对比：RW 里海岛策略就是窝在一个岛先自给自足，再伸桥；这里的 autopilot 似乎不会做这种「聚焦」决策，依旧把人力铺开。

（截图：`12-archipelago-start.png`, `13-archipelago-kitchen-attempt.png`, `14-archipelago-long.png`）

---

## 系统深度评价（老兵视角）

**生产链深度（6/10）**：名义上有 food→meal（Kitchen）、wood/stone→tool（Smithy）、herbs→medicine（Clinic）、4 种 raw × 3 processed。这在纸面上是 RimWorld 早期的水准。但在我三图的观察里，**我从没看到过 Meal 或 Medicine 的产出非 0**——Tools 固定 1（可能是开局给的），其余都卡在 0/0.0 /min。这就意味着生产链**在 fallback 策略下从未运转**。纸面上 6 分，运行时 2 分。

**Worker AI 可读性（3/10）**：Colony panel 显示角色分配（FARM / WOOD / STONE / HERBS / COOK / SMITH / HERBALIST / HAUL）是个好起点，但我看不到：每个 worker 的 intent、当前目标 tile、carry 内容、fatigue、spoilage state。Entity Focus 面板需要 canvas pick，synthetic 不行，没机会深挖。相比 RW 的 bio / gear / schedule / health，这里给的数据面太薄。

**长期战略挑战（2/10）**：三图三次在 5-6 分钟就崩，而且是 **fallback AI 自己把自己玩崩**。我甚至没机会体验到 mid-game。在 RimWorld 里这个阶段等于「第 2 季」，在这里是「死亡竞赛」。Dev 条最多到 49，掉到 40 就卡住。

**地形差异化（7/10）**：Plains / Highlands / Archipelago 三张图的生成**确实不同**——开阔 vs 走廊 vs 群岛，起始资源比例也不同（Plains 缺 stone，Highlands 多 stone，Archipelago 多 wood）。Scenario 的 objective 也跟着变。这是亮点。

**Scenario Director 叙事（2/10）**：那段 `"reconnect the broken supply lane: the colony should sustain reconnect the broken supply lane while keeping empty bellies..."` 明显是 **prompt 模板/LLM 输出 bug**，两张图共用、半句截断。这是灾难性的 immersion 断裂。我怀疑 LLM 不可用时走了 fallback 却把 prompt 原文吐出来了。

**UI / 控制（5/10）**：热键提示 (1-12、Space、L、Ctrl+Z) 清晰；Build panel 直观；tooltip 里 Kitchen 成本面板说 8+3、tool-hint 又说 5+3，**矛盾**；Heat Lens (L) 我按了没反馈，不确定 toggle 成功了没；Colony panel 的 per-role 数字很好；Entity Focus 概念对但我没点中过。

**Scenario objective 会回退**：这是一个我没在任何 colony sim 见过的机制——**已经完成的 warehouses 7/2 和 lumber 3/3 会在 autopilot 阶段倒退回 0**。是因为建筑被 decay / scenario 在 re-evaluating / autopilot 在拆东墙？我不知道，但一个老兵对「完成的目标为什么会 uncheck」会立刻起疑。这像 bug。

---

## 与 RimWorld / DF 的直接对比

- **RimWorld**：Storyteller (Cassandra/Randy) 给的是戏剧曲线，Utopia 的 "Director" 给的是破碎 prompt。RW 的 work priority 一拖一拉 1 分钟调完，Utopia 的 autopilot 不允许介入角色分配（我只看到资源/建筑级控制）。RW 的 Pawn inspector 给你 50 个属性，Utopia 的 Entity Focus 我根本没点进去过。
- **Dwarf Fortress**：DF 的魅力在于涌现叙事——第 47 年 dwarf Urist 因为猫死了发疯把酒桶全砸了。Utopia 的叙事层是 scenario objective + 单行死亡 log (「Thal-15 starved — food empty 79s」)——信息正确但**完全没有故事性**，连 RW 里「Colonist X got a bionic arm」的简单 event 都不如。
- **Oxygen Not Included**：ONI 的生产链优雅在于**每一条 duplicant 路径你都能追踪**，气体/热/液体可视化。Utopia 的 Heat Lens 似乎想提供这种可视化（supply chain heat），但我按 L 没反馈，体验未兑现。
- **Banished**：Banished 的长期挑战来自人口平衡 / 季节 / 寿命。Utopia 的长期挑战**在 fallback 下根本没机会出现**——5 分钟就死光。

---

## 最想让开发者修复的 5 件事

1. **Fallback AI 的 job balance 彻底失衡**。COOK / HAUL / HERBALIST 长期停留在 0，而 FARM 堆到 14。任何 colony sim 的基本常识：人口超过 10 就必须有 dedicated hauler，超过 15 必须有 cook，不然 food → meal pipeline 断裂就是必死。**这是最关键的 bug。**
2. **Director prompt 模板 / LLM fallback 输出破损**。`"reroute pres"` 被截断半句，两图共用同一段残文，必须 diagnose 这是 LLM timeout 后的 fallback 漏文、还是模板变量未替换。
3. **Scenario objective 会倒退**。已完成的 warehouses/lumber/farms 会掉回 0/X。玩家不知道是 decay / reset / 建筑损毁。**需要 event log 标注「X warehouse destroyed by Y at tile (a,b)」**，不然系统感觉非确定性。
4. **建筑成本提示不一致**。Kitchen 在 Construction 面板是 8 wood + 3 stone，在 tool-hint 是 5 wood + 3 stone。挑一个，然后两处同步。
5. **Entity Focus 需要一个 fallback**：即使我点不到 worker（也许是 pick 太严格、UI 遮挡），应该有「Show first worker」「Cycle workers」按钮，或者一个 Worker list。老兵会花 20 分钟只看单个 pawn 的 state，这是 colony sim 的灵魂。

---

## 总分与一句话定性

**总分：3 / 10**

> **一个纸面机制很丰富、运行时却在 5 分钟内被自己的 fallback AI 玩崩的 colony sim；地形差异化和 scenario 目标显示了设计野心，但破损的 Director 文本、失衡的 job 分配和无法深挖的 worker inspector，让它停留在一个"还没 ready 给老兵玩"的状态。**

在 RimWorld 里，我会在第 50 天评价一款 colony sim。在 Project Utopia 里，我三张图都没活过第 6 分钟，而且每一次都是 autopilot 不是我输的。开发者把很多齿轮都造好了（14 种 tile、13 种建筑、4 种 raw × 3 processed、6 种地图、scenario director、Heat Lens、Dev score、生存模式），但齿轮没咬合——尤其是 meal/haul pipeline 在人口增长后彻底断掉。

我期待 Phase 9 如果真的像 UI 暗示的那样修 carry/deposit 策略，分数会回到 5-6；如果再补上一个可用的 Entity Focus 和一个不破碎的 Director 叙事层，这游戏有 7 分的骨相。但在我今天 4 月 24 日玩到的 build 里，它还是 3 分的体验。

DONE 02a score=3.
