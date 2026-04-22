# Project Utopia 外部玩家评测（机制呈现 & 内容丰富度）

**评测日期**：2026-04-22
**评测者**：外部玩家（苛刻）
**评测场景**：默认 `Broken Frontier · frontier repair · 96×72 · seed 1337` / Temperate Plains，生存模式（无限）
**游玩时长**：约 2 分 05 秒游戏内时间（Normal + Fast Forward）+ 多次交互
**使用工具**：浏览器 Playwright（127.0.0.1:5173）

---

## 总评快速结论

- **机制呈现（Mechanics Presentation）评分：2 / 10**
- **内容丰富度（Content Richness）评分：3 / 10**
- **一句话总结**：系统深度肉眼不可见、关键调试面板直接卡死在 “loading…”，而 UI 暴露出的内容清单只够撑起一个 jam 雏形——离 RimWorld / DF 两个数量级。

---

## 一、机制呈现评分：2 / 10

### 1.1 整体感受

开发者在 CLAUDE.md 里夸耀自己有 15 套 ECS 系统、分层 AI、StrategicDirector、Hierarchical StatePlanner、LLM fallback、raid escalator、fatigue/spoilage/grace、road compounding、soil exhaustion、seasonal weather……**但是我作为玩家，在整整 2 分钟内感知不到其中任何一套系统正在发生。**

- 地图上只有小人走来走去的绿色/红色像素方块，看不见 AI 决策、看不见意图气泡、看不见路径线。
- 仅有的"状态反馈"只是顶部的资源数字和两行 toast（"Emergency relief stabilized the colony" / "Insufficient resources." / "Pressure lens restored."），没有任何解释 *为什么* 发生、*谁* 做了决定。
- `Developer Telemetry` 一栏挂着 6 个子面板（Global & Gameplay / A\* + Boids / AI Trace / Logic Consistency / System Timings / Objective / Event Log），**六个里五个全部永久显示 `loading...`**，从开局到 2:05 一直没加载出来。唯一没写 loading 的 Objective Log 看起来也是空的。
- 点击 `Debug` 顶栏按钮、`Expand All` 按钮都没有产生任何新的可见信息。

也就是说，开发者自己写的核心"机制可视化"层是坏的。对玩家来说，这个游戏目前是一个**黑箱沙盒**：我扔进去一个 Farm，不知道它输出多少、何时输出、被谁搬运、去了哪里。

### 1.2 机制可见性清单（我能实际看到的）

| 系统 | 是否可见 | 说明 |
|---|---|---|
| 全局资源（Food/Wood/Stone/Herbs/Meals/Tools/Medicine） | 是 | 顶部 HUD + Colony 面板显示数字。只有绝对值，**没有速率、没有收支**。Food 从 105 在 1 分钟内掉到 12，完全没有"每 tick -X"提示。 |
| Prosperity / Threat | 是 | 顶部两个数字（"Prosperity 58 / Threat 29"）。**没有解释为什么涨、为什么跌**，阈值不可见。 |
| Dev 指数 | 是 | "Dev 48/100" 挂在顶栏，不知道组成。 |
| Survived 计时 + Score | 是 | 秒表 + 累计 Score，Score 单位不明。 |
| 工人数量 | 是 | Workers 22，但个体 **不可选中的信息**（Entity Focus 显示"No entity selected"，我点击地图中心 canvas 之后依然 No entity selected）。 |
| 角色分布 | 部分 | Colony 面板显示 FARM/WOOD/STONE/HERBS/COOK/SMITH/HERBALIST/HAUL 计数，但**不可干预、不可调优先级**；系统自动把 FARM 从 4 调到 15（食物危机反馈），但我看不到决策逻辑。 |
| AI 意图 / Intent | 不可见 | 没有任何 thought bubble、target line、role tag 浮层。 |
| 寻路（A\*/Boids） | 不可见 | 面板 loading，游戏里也没画出路径。 |
| 生产链（Raw→Processing→Refined） | 不可见 | Tools 数量 0→1 静默发生，没有事件、没有动画、没有 toast。 |
| 天气 / 季节 / Drought / Wildfire | 不可见 | CLAUDE.md 宣称有 seasonal weather + drought wildfire，我玩了 2 分钟没看到任何季节指示器、天气图标、温度、季节日历。 |
| 土壤疲劳 / Soil exhaustion | 不可见 | 农田颜色没有渐变指示，没有 tile tooltip 呈现"肥力 X%"。 |
| Fog / 战争迷雾 | 不可见 | 整张地图开局全亮，CLAUDE.md 提的 `fog initial radius 6` 在视觉上不存在。 |
| Fatigue（疲劳） | 不可见 | 工人没有疲劳条。 |
| Spoilage（腐败） | 不可见 | 仓库没有状态。 |
| Raid / 事件 | 不可见 | 2 分钟里 0 个事件；只看到 Predators=1 在计数里。 |
| Heat Lens | 宣称存在 | 按 L 键或点击按钮显示"Pressure lens restored."——*重置了*，但实际上开局本就没有可见热力图，切换前后地图完全一样，没有任何 overlay 变化。 |

**结论**：可见的状态只有十几个顶栏数字，其余 80% 的系统都在后台默默跑，玩家得靠"信念"相信它们存在。这是一个**数据驱动的模拟器在没有数据视图的情况下发布**。

### 1.3 因果链清晰度

当 Food 从 100 掉到 7 的时候，我期待游戏告诉我：

- 哪几块 Farm 在产出，产出速率多少？
- 哪些 Worker 正在吃饭、吃饭频率多少？
- Spoilage 损失了多少？
- 是不是运输网络断了，食物堆在 Farm 没被运回 Warehouse？
- Prosperity 从 58 掉到 46 是因为食物，还是其他？

**实际上我得到的全部反馈**：一句 "Insufficient resources." 提示在我尝试建造时弹出，然后 "Supply-…" 在 toast 里被截断（UI 连完整文字都不显示）。因果链可视化是 0。

这直接导致一个严重的 UX 后果：**玩家玩输了却不知道自己输在哪**。对一个定位"RimWorld-inspired 资源链经济"的游戏，这是灾难级问题。

### 1.4 UI/HUD 可用性瑕疵

- 顶栏的 toast 文字被截断成 "Emergenc…" / "Supply-…"，没有 title hover 看全文。
- Tile tooltip：悬停"Hover a tile to preview cost, rules, and scenario impact"——但构造面板永远只显示 `Cost: 5w` + 通用规则文字，**没有针对当前悬停 tile 的数值反馈**（例如 "此格肥力 75%，距最近仓库 6 格，预计产量 X"）。宣称的 "preview scenario impact" 形同虚设。
- 建造工具 12 个按钮一字排开、图标抽象（看不出哪个是哪个），且顺序（Road/Farm/Lumber/Warehouse/Wall/Bridge/Erase/Quarry/Herbs/Kitchen/Smithy/Clinic）让 Erase 挤在中间而不是末尾，违反约定。
- 控制台 2 分钟累计 10+ 个 error，telemetry 面板挂掉大概率是 JS 报错直接断了渲染。

---

## 二、内容丰富度评分：3 / 10

### 2.1 建筑清单（从 Build 工具栏提取）

共 **11 种建筑物 + 1 个拆除工具**：

| # | 建筑 | 成本 | 用途 |
|---|---|---|---|
| 1 | Road | 1 wood | 物流网络 |
| 2 | Farm | 5 wood | 食物生产 |
| 3 | Lumber | 5 wood | 砍伐木材（需森林节点） |
| 4 | Warehouse | ? | 仓储 |
| 5 | Wall | ? | 防御 |
| 6 | Bridge | ? | 跨水 |
| 7 | Quarry | ? | 石矿 |
| 8 | Herbs | ? | 草药田 |
| 9 | Kitchen | ? | 食物加工 → Meals |
| 10 | Smithy | ? | Tools 加工 |
| 11 | Clinic | ? | Medicine 加工 |
| —  | Erase | — | 拆除 |

对比参考：
- **RimWorld**：光 Production 就有 Butcher Table / Electric Smelter / Drug Lab / Machining Table / Tailor Bench / Brewing…；Furniture 类数十种；Defense 类十几种；总计 **150+ 可建造物**。
- **Dwarf Fortress**：Workshops 就 40+ 种，还有炉子、陷阱、机关、家具、建筑几百计。
- **Project Utopia**：**11 种**。这个数量对一个两周 jam 可以接受，对一个标榜"RimWorld-inspired / 8 major 版本"的项目是尴尬的。而且 Wall 只有一种（没有木墙/石墙/钢墙分层），防御体系单薄。

### 2.2 资源清单

从顶栏 + Colony 面板提取：

**原料（4）**：Food / Wood / Stone / Herbs
**成品（3）**：Meals / Tools / Medicine
**元资源（3）**：Prosperity / Threat / Dev Index

共 **7 种可消耗资源**。

对比：
- RimWorld 资源项 **30+**（不含武器/衣物/药品等装备数百件）。
- DF 资源类别无法枚举。
- Project Utopia 的 7 项等于把 Stardew Valley 砍一半。加工链只有 1 层深度（raw → refined），没有二级加工（没有"面粉→面包"/"铁矿→铁锭→铁镐"的链条）。

### 2.3 单位清单

从 Population 面板提取：

| 类别 | 数量 | 说明 |
|---|---|---|
| Workers | 22 | 玩家阵营工人 |
| Visitors | 4 | 访客（性质不明，无 UI 解释） |
| Herbivores | 2 | 食草动物（鹿？兔？不可见） |
| Predators | 1 | 捕食者（狼？熊？不可见） |

共 **4 类生物实体**。作为对比：
- RimWorld 有 **80+** 种可驯化/野生动物 + 敌对派系。
- DF 动物 + 巨型怪物 + 地底生物 **300+**。
- Project Utopia 的 4 类里连具体物种都没告诉我。

另有角色分工 8 种：FARM / WOOD / STONE / HERBS / COOK / SMITH / HERBALIST / HAUL，这是工人内部 role 切分，不算额外单位。

### 2.4 事件清单

**我 2 分钟游戏中见到的事件**：

1. 开局 "Simulation started. Build the starter network first."
2. "Emergency relief stabilized the colony." （文字被截断）
3. "Selected tool: farm" / "Selected tool: lumber" （这是 UI 反馈，不是事件）
4. "Insufficient resources." （构造失败提示）
5. "Pressure lens restored."

**实质性世界事件：1 个（Emergency relief）**。CLAUDE.md 提到的 raid escalator、drought wildfire、seasonal change、spoilage、fatigue crash……**全部没出现**。

对比：
- RimWorld 每个游戏年触发十几种 incident（raids / ship chunks / mad animal / solar flare / toxic fallout / wanderer join / trader caravan / disease / heatwave / volcanic winter…）。
- DF 事件更是密集。
- Project Utopia 我玩 125 秒游戏时间看到 1 个事件。

### 2.5 环境 / 地形系统清单

**地形模板（6）**：Temperate Plains / Rugged Highlands / Archipelago Isles / Coastal Ocean / Fertile Riverlands / Fortified Basin。这是唯一算得上丰富的维度。

**Tile 类型（CLAUDE.md 说 14 种，ID 0-13）**：GRASS 到 BRIDGE。我肉眼看到的 tile：
- 草地（grass）
- 水（water）
- 森林（白色花/树的绿色块）
- 沙地（棕色块，可能是土？ruins？）
- 路（beige 路面）
- 房屋 / farm（小色块带图标）

**宣称存在但不可感知的环境子系统**：
- 高程（elevation） – 地图看起来是 2D 平坦的，没有高度表现
- 湿度（moisture） – 无指示
- 肥力（soil exhaustion） – 无指示
- 盐化（salinization） – 无指示
- 季节 / 天气 – 无指示
- 干旱野火（drought wildfire） – 未见
- 战争迷雾（fog） – 未见

实质**可见**的环境层数：~2（terrain + water）。距离宣称的 10 层环境深度差十倍。

### 2.6 敌人 / 威胁

看到的敌对或中立威胁：只有 `Predators 1`。我没看到袭击者、没看到 raid、没看到任何战斗动画。"Threat 29→50" 数字在涨，但地图上没有任何威胁实体出现。

### 2.7 与 RimWorld / DF 对比表

| 维度 | Project Utopia | RimWorld | Dwarf Fortress |
|---|---|---|---|
| 建筑种类 | 11 | 150+ | 500+（含 workshop / trap / furniture） |
| 资源种类 | 7 | 30+ material + 数百 item | 数千 |
| 生物种类 | 4 | 80+ | 300+ |
| 事件类型 | 1（实测） | 50+ | 100+ |
| 加工链深度 | 1 层 | 3–5 层 | 5–10 层 |
| Tile 类型 | 14（宣称） / 6（可感知） | ~30 | ~80 |
| 职业 / Role | 8 | 20+ work priorities | 100+ labors |
| 地图模板 | 6 | biome-procedural | biome + 地下 150z |

结论：**Project Utopia 的内容密度约为 RimWorld 的 5–10%，DF 的 1–3%。**

### 2.8 加分项

- 6 个 terrain template 在选单里描述得很香（Fertile Riverlands / Fortified Basin 等），确实是一个早期项目里少见的用心点。
- 资源链概念（Raw → Kitchen/Smithy/Clinic → Meal/Tool/Medicine）结构上是对的，只是量太少。
- 8 种 role 的自动再分配（我看到危机下 FARM 4→15）说明底层 role switcher 在跑——这是潜力点，只是 UI 0 暴露。

---

## 三、改进建议（狠话版）

### 机制呈现（优先级 P0）

1. **先修 Telemetry 面板**。5/6 面板永久 `loading...` 是底线问题；游戏的核心卖点（AI trace、logic consistency、system timings）直接下线，等同于把引擎藏进保险箱。
2. **资源 HUD 必须显示速率**：不只是 `Food 12`，而是 `Food 12 ▼ −3.2/s`。否则玩家永远不知道自己为什么死。
3. **Worker Entity Focus 必须真的可点**：我点地图中心没反应。至少对 worker 实体加 hitbox，显示 name/role/state/目标/carry。
4. **Toast 不能被截断**，至少要有 hover 看全文。
5. **Heat Lens 点了要有可见变化**，不然就是假按钮。
6. **加一个事件日志侧栏**（RimWorld 风格），把 raid / weather / death / milestone 全部时间戳落地。
7. **Tile hover 必须给具体数据**：肥力、湿度、距仓库距离、当前作物产量预估。

### 内容丰富度（优先级 P1）

1. **建筑翻倍**：至少分层 Wall（wood/stone/steel）、增加 Watchtower / Storage Tier / Power 系列、Bed / 餐桌 / 娱乐。11 → 30 是及格线。
2. **加工链加第二层**：Wheat → Flour → Bread；Iron → Ingot → Tool；Herb → Extract → Medicine。至少 3 个两段链。
3. **生物多样化**：把 Herbivore/Predator 拆成 5+ 具体物种，各有模型、声音、掉落。
4. **Raid / 事件系统落地**：CLAUDE.md 写了 raid escalator，那把它露出来——从第 3 游戏日开始有小袭击，给玩家切身威胁感。
5. **季节/天气显式化**：屏幕角上放一个季节环 + 天气图标。

### 综合

这个项目的代码底层看起来 over-engineered（15 个 systems / ECS / LLM fallback），但**玩家可触达的表面积极度贫瘠**。优先级应该反转：把已经写好的系统暴露出来，而不是继续加新子系统。不然每个版本都像是在给一个黑盒贴更多隐形标签。

---

## 四、最终评分

- **机制呈现：2 / 10**。底层也许复杂，但暴露给玩家的信息量≈一个 jam 作品，关键调试视图全挂，因果链 0 可读。
- **内容丰富度：3 / 10**。11 建筑 / 7 资源 / 4 生物 / 1 实测事件，距离 RimWorld / DF 差 1–2 个数量级；仅 6 个 terrain 模板勉强撑起一点多样性。

**一句话**：一个野心写在 CLAUDE.md 里、实际呈现给玩家的只是"数字顶栏 + 会自己死掉的小人"的半成品——先把已写好的东西可视化，再谈扩张。
