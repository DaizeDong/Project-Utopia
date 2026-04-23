---
reviewer_id: 01b-playability
round: 2
date: 2026-04-22
score: 3
verdict: 一款"自己在玩自己"的殖民地模拟：AI 托管替代了玩家 agency，可视化失语、操作反馈残缺、心流几乎为零。
---

# 01b · 可玩性（Playability）Round 2 评测

## 第一印象（0–2 分钟）

打开 `127.0.0.1:5173` 弹出一个标题为 **Project Utopia** 的启动面板，副标题写着 "Reconnect the west lumber line, reclaim the east depot, then scale the colony."（**Broken Frontier · frontier repair · 96×72 tiles**）。还有一个"Survive as long as you can / 00:00:00 · 0 pts"的大横条，非常直球地告诉你这是 endless survival 打分模式。

模态窗背后已经把地图预览铺满整个屏幕。我的第一反应是：**这画风也太刺眼了**。大片纯绿的草地 + 几团像打补丁一样的蓝色像素块（水体？河流？湖？）+ 零星的橙色食物图标散落在草原上。整体色彩分区非常"平"：没有高度感、没有光影、没有边界描边，几乎就是把一层 Photoshop 油漆桶刷完了事。

最致命的是：水体的像素边缘是用一种方块抖动算法生成的，看起来像坏掉的 JPEG。Three.js 的优势（3D、光照、景深、层次感）**一个都没体现**，还不如一个正经的 2D tilemap 清楚。

点 **Start Colony**，启动时有一瞬间的相机缩放过渡，然后你会在屏幕中央看到一个**已经盖好**的迷你殖民地：一小撮棕色方块（路）、几个深红/米色的小图标（建筑），10 几个白色小人在原地抖动，外加散落的羊群。HUD 顶部开始刷大段文字：

> "1 of 1 supply routes open · 1 of 1 depots reclaimed · 7 warehouses built (goal 2) · 4 farms built (goal 4) · 3 lumber camps (goal 3) · 7 walls placed (goal 4)"

以及最刺眼的一句：

> **DRIFT — autopilot: colony holding steady — awaiting the next directive**

**"autopilot"**。我什么都还没做，AI 已经接管了殖民地。这对一个可玩性评测来说是个非常不祥的开场。

## 核心可玩性缺陷

### 1. 玩家 agency 被 "AI Director" 架空

游戏的 Help 面板里有一个 tab 叫 **"What makes Utopia different"**，开门见山写：

> "An AI director drives the colony. Every worker is steered by a policy published each decision tick. Watch the AI Decisions panel in the right sidebar..."

翻译过来就是：**工人不是你指挥的，是 AI 指挥的**。WHISPER / DIRECTOR / DRIFT 三种状态轮流出现在 HUD，告诉你"现在是 LLM 在开车 / 规则 fallback 在开车 / 空档漂移"。作为玩家，我能做的只有：
- 放建筑（12 种工具：Road / Farm / Lumber / Warehouse / Wall / Bridge / Erase / Quarry / Herbs / Kitchen / Smithy / Clinic）
- 围观

**这根本不是一个殖民地模拟玩法，是一个殖民地可视化**。RimWorld 的精髓是给每个殖民者排优先级、调度任务、处理各种意外；Banished 的精髓是精确控制资源缓冲；Frostpunk 的精髓是两难决策按钮。Project Utopia 把这些全部交给 AI 了，玩家只剩"造几个房子然后看戏"。

### 2. 第一个十分钟就让殖民地崩盘，玩家却完全插不上手

我从头到尾没有主动做出一个有意义的决策，就眼睁睁看它崩溃：

| 时刻 | 食物 | Wood | 工人 | 死亡 | 目标完成度 |
|---|---|---|---|---|---|
| 0:11 | 110 | 7 | 14 | 0 | 7 warehouses / 4 farms / 3 lumber / 7 walls |
| 1:03 | 39 | 0 | 18 | 0 | 5 warehouses / 4 farms / 3 lumber / 7 walls |
| 2:16 | 2 | 1 | 19 | **1 (Cato-21 饿死)** | 0 warehouses / 3 farms / 4 lumber / 7 walls |
| 2:36 | 5 | 5 | 18 | **2 (Ilia-12 饿死)** | 0 wh / 2 farms / 4 lumber / 7 walls |
| 6:06 | 29 | 5 | 12 | **3 (Anse-22 饿死)** | 0 / 1 farm / 0 lumber / 7 walls |
| 8:57 | 23 | 5 | 7 | **4 (Fen-10 饿死)** | 0 / 0 / 0 / 7 walls |
| 11:12 | 21 | 5 | 6 | **5 (Vela-8 饿死)** | 全部归零 |

开局食物消耗速度一度飙到 **-157/min**（我截了图）。AI 明明是自动的，却连基本的食物循环都稳不住。7 个成就目标（warehouses, farms, lumber, walls）一个个从"已完成"掉回零——**你会亲眼看到已经建好的建筑被莫名其妙地拆除或消失**，因为某套内部策略觉得要"route repair and dep..."。

玩家几乎没有任何杠杆可以止损。我点 Lumber、点 Farm、点 Warehouse，全是"Cannot build on water tile"或"No forest node on this tile. Lumber camps must be sited on a forest."，可**地图上我完全看不出哪里是森林**。没有 tile 标注、没有 overlay、没有"Show resources"按钮。你必须抱着建筑工具一格一格扫描整张地图，靠红字错误提示反向推断哪里可以盖。

### 3. 反馈循环全面失灵

- **资源栏**显示 Food 39, Wood 0, Stone 0, Herbs 0，右下方每一项标的都是 **"0.0/min"**。整个 Resources 面板上下全是 `0.0/min`（只有 Food 偶尔跳一下 +41/min 或 -157/min）。**产出速率几乎从不更新**，你就无法判断刚盖的建筑到底有没有生效。
- **Population 面板**里列了 FARM 13 / WOOD 3 / STONE 1 / HERBS 1 / COOK 0 / SMITH 1 / HERBALIST 0 / HAUL 1 这种角色分布，但你不能**直接**调整——也就是说你看得到分布不合理（明明食物崩溃却 0 个 COOK），但你改不了它。AI 自己会转职，但节奏对不上现实危机。
- **点击工人没有弹出 inspect 面板**。Help 说 "click a worker to inspect"，我连点三次，HUD 右下角的 "Entity Focus" 区块一直是空的黑条。可能是因为工人太小、总在移动、点击精度要求过高——但**没有任何反馈告诉你点偏了**。
- **Heat Lens (L)** 号称"one-glance bottleneck map"，我按 L 两次，地图没有任何可见的红蓝染色。Help 里宣称"red over producers drowning beside a full warehouse, blue over processors starving for input"，**我完全没看到这个视觉层**。这个被列为游戏卖点的功能形同虚设。

### 4. 目标 vs 现实严重失衡

HUD 顶部永远挂着 7 个目标："1 supply route / 1 depot / 2 warehouses / 4 farms / 3 lumber camps / 4 walls"。开局这些都显示为"已完成"（后面带括号的数字远超 goal）。但随时间推移，已完成量会被 AI 系统自己拆回 0。**"完成目标"根本不是单向积分制，它是一个会反向流失的数字**。

而且 **Score 还在持续上升（从 0 涨到 562）同时 DevIndex（Dev 48/100 → 40/100）在下降**。一个玩家完全搞不懂的双轨计分：你不知道是在赢还是在输，不知道死人是扣分还是给分，不知道"Dev"是什么。"Survived 00:11:12 Score 562 · Dev 40/100"——这三个数字，没有一个在帮助玩家建立心流预期。

## 具体场景问题

### A. 启动菜单选项形同虚设

选模板的下拉框有 6 个选项（Temperate Plains / Rugged Highlands / Archipelago Isles / Coastal Ocean / Fertile Riverlands / Fortified Basin），Help 吹嘘每个模板会"re-weights terrain, resources, and raid lanes"。但启动后你只会看到一张 96×72 的大地图，一小片草地一小片水，模板之间的差异从第一眼画面**根本看不出来**。

### B. 建造规则不可见化

Farm "Cost: 5 wood"，Lumber "Cost: 5 wood"，Warehouse "Cost: 10 wood"。当前 Wood=5 时你点 Warehouse 也没有**灰掉按钮**、没有"不够"的提示。点下去才告诉你"No forest node on this tile"（如果是 Lumber）。这种**先选先点再报错**的流程在 2026 年的任何 city-builder 都是反模式。

### C. 救援循环失败

当食物 = 0 时，理想路径应该是：玩家暂停 → 看到"这里是森林、那里是农田"的 overlay → 快速造 Farm 救命 → 暂停结束继续。实际体验是：暂停按钮在右下很远的位置（空格键倒是能用），"森林"看不到，"农田适宜地"看不到，造上去还可能被 AI 拆掉。玩家彻底无力回天。

### D. Autopilot 的存在让玩家质疑自己存在的意义

HUD 永远挂着 "autopilot: colony holding steady" 或 "DIRECTOR: route repair and dep..."，就算玩家一动不动也会持续产出叙事文本。**你玩了 10 分钟跟你离开键盘 10 分钟结果几乎一样**（可能你离开还好一点）。这是自称"Playability"的游戏最致命的问题。

## 对比同类游戏

| 维度 | RimWorld | Banished | Frostpunk | **Project Utopia** |
|---|---|---|---|---|
| 玩家可给单个工人下指令 | 是 | 否（但可分配职业） | 否（但可分配区） | **否，AI director 接管** |
| 建造时位置预览 | 全 3D ghost | 2D ghost + 资源需求 | tile 高亮 | **只有红字错误** |
| 资源图层/overlay | 超丰富 | 丰富 | 清晰的温度/燃料/健康 | **看似有 Heat Lens，实际无视觉反馈** |
| 失败时的挽救手段 | 暂停 + 手动指派 | 停职业 + 造 barn | 推新法令 | **几乎没有** |
| 第一局生存率（新手） | 中高 | 中 | 中 | **极低（11 分钟内人口折半，最终趋零）** |
| 玩家心流 | 强 | 中 | 强 | **近乎为零** |

RimWorld 的"AI Storyteller"是往玩家的剧本里塞事件，而不是替玩家打工。Project Utopia 学到了名字没学到本质。

Banished 没有任何 AI 介入，全靠玩家排优先级，每一次粮食危机都是玩家自己判断冬储 vs 建材的结果，心流满分。Project Utopia 把这个决策权拿走了还不给你看到数据。

Frostpunk 的每一个"造什么"决策背后都有明确的温度、人力、物资曲线展示，玩家明知要死也会死得清楚。Project Utopia 只给你看 0.0/min 的死寂数据和"autopilot: colony holding..."的空话。

## 情绪曲线

- **0–2 min**：好奇 → 困惑（为什么已经有东西了？）
- **2–6 min**：焦虑（食物狂掉）→ 尝试介入（按 1,2,3 切工具）→ 挫败（点哪里都说不行）
- **6–11 min**：失望（人口腰斩）→ 无聊（我做啥都一样，AI 自己玩自己的）→ 放弃欲望（算了开 4× 快进看它怎么死）

几乎没有任何正反馈时刻。没有"建成一个 warehouse → 看到小人开始搬运 → 食物曲线往上拐"那种 city-builder 经典的多巴胺回路。

## 重玩价值

几乎没有。六个模板在视觉和机制上都看不出差别；AI director 会用一套它自己的"固定剧本"开局（预先盖好同一个小殖民地、同一个路网拓扑）。你换种子地图，看到的还是那个熟悉的小棕色村子。**你和地图的第一次接触，就已经是 AI 导演过的版本了**。

## 改进建议（按优先级）

1. **把 agency 还给玩家**。Autopilot 应当是**玩家主动开启**的可选项（"我想休息一下"），而不是游戏默认状态。默认模式必须是：工人空闲 → 玩家分配 / 排优先级 / 设置 Zone。现在这套 AI director 剥夺了 city-builder 最核心的乐趣。
2. **资源/地形 overlay 必须默认常开**。按住 Shift 就显示所有森林、果树、石矿、水源、土壤质量的高亮。没有这个，第一局新手 100% 会因为看不到森林而建不了 Lumber Camp。
3. **建造预览必须在**鼠标悬停时就把 ghost 放上去。红色=不可建，绿色=可建，并直接显示将消耗的资源。不要等到点下去才报错。
4. **Heat Lens 要真的画颜色**。如果按 L 之后地图看不出变化，那这个功能就是假的。红色瓶颈、蓝色饥饿的叠色层必须**肉眼可见**。
5. **Score 和 DevIndex 需要教学 tooltip**。解释这两个数字分别代表什么，怎么升降，玩家的行为和它们的关系。现在它们完全像一团黑盒噪声。
6. **死亡不应该被积分奖励**。Score 持续上涨同时殖民地崩塌，这种反馈极具误导性。建议 Score = f(存活人口 × 存活天数)，人一死该扣的就扣，不能混在一起。
7. **建筑被拆回 0 的机制必须可见**。如果是 AI 策略拆掉的，要在 log 里标"[AI] demolished Warehouse at (x,y) because ..."，否则玩家永远搞不懂自己"完成"的目标为什么会变回未完成。
8. **点击工人必须稳定打开 inspect 面板**。加一个点击容差（3–5 px），或者直接做"按 Tab 循环选择工人"。
9. **第一局引导必须手把手**。前 2 分钟该用弹窗指引："食物只剩 100，先造一个 Farm → 这里有森林，造一个 Lumber → 然后造一个 Warehouse 储存"。不要甩给玩家一个已经运转但马上要死的殖民地。

## 总结

**评分：3 / 10**

Project Utopia 有野心：endless survival + LLM-driven AI director + resource chain + 6 个模板。但从**纯粹玩家视角**出发，它的可玩性几乎全面失守。

核心问题可以浓缩成一句话：**这是一个会"自己玩自己"的游戏**。玩家没有控制权、没有数据可视化、没有有效的介入手段、没有任何正反馈循环。它更像一个"AI 殖民地模拟模型的观察窗口"，而不是一款让人沉浸 2 小时的 city-builder。

如果作者的定位是"你来欣赏 AI 如何管理一个殖民地"，那请把它重新定位为**可交互演示（interactive demo）**而不是**游戏（game）**。如果作者的定位是"玩家来玩一个 colony sim"，那当务之急是把 Autopilot 默关、把 overlay 打开、把反馈环修好。

现在这个状态，一个普通玩家大概率会在 8–12 分钟内因为"我干啥都没用 + 看不懂正在发生什么 + 人一个接一个饿死"而关掉标签页。这就是我给 3 / 10 的原因——不是 2，因为技术栈（Three.js 渲染、AI 决策链、endless survival 评分）本身有潜力；不是 4 及以上，因为目前的体验对 95% 的普通玩家就是**反可玩性**。
