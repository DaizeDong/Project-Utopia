# Project Utopia — 外部玩家评测 · 引导性（Onboarding）

**评测人**：从未接触过此游戏的付费玩家（第一次打开浏览器）
**评测日期**：2026-04-22
**评测维度**：引导性 / 新手教学 / 上手门槛
**游玩时长（模拟）**：~3 小时的等效操作与观察（30+ 次交互、多次长时间挂机、两次"游戏周期"、三种模板尝试）

---

## 总体评分：**2 / 10**

> 一款把"开发者仪表盘"伪装成"殖民地模拟"的作品。作为一个商业产品，它几乎完全缺失新手教学这一最基本的模块——没有欢迎动画、没有教程、没有任何形式的任务提示弹窗、没有帮助菜单、没有术语表、没有死亡复盘、没有失败理由解释。玩家被扔进一个正在自己运行的模拟中，无事可做也不知道自己该做什么。

---

## 第一印象

打开 `http://127.0.0.1:5173/`，屏幕中央弹出一个黑底卡片：

> **Project Utopia**
> Reconnect the west lumber line, reclaim the east depot, then scale the colony.
> `BROKEN FRONTIER · FRONTIER REPAIR · 96×72 · SEED 1337`
> `Survive as long as you can — 00:00:00 · 0 pts`
> Template: Temperate Plains | Map Size: 96 × 72 tiles
> `RMB drag to preview · Scroll zoom · 1-12 tools · Space pause · L heat lens`
> [Start Colony] [New Map]

**问题立刻扑面而来**：

1. **我在哪？我是谁？我要做什么？**——这段小字的含义我完全猜不到。"west lumber line"是一条铁路？一个村庄？"east depot"是什么？是我要去摧毁的东西还是要去占领的？"scale the colony"是扩张的意思？没有任何背景故事、没有文案铺垫、没有角色、没有阵营。
2. **"BROKEN FRONTIER · FRONTIER REPAIR · 96×72 · SEED 1337"** 像是有人把调试信息直接漏进 UI。`SEED 1337`？我为什么要关心种子值？一个成品游戏会把随机数种子写在标题屏幕上吗？
3. **唯一的"目标"是 "Survive as long as you can"**——比 Dwarf Fortress 的"losing is fun"还要干瘪。Survive 针对什么？饥饿？怪物？海啸？随时间流逝减分？我毫无概念。
4. **Start Colony vs New Map** 的区别完全没解释。经过试错我才发现前者启动模拟，后者切换种子/模板。
5. **底部那一行极短的快捷键提示** `RMB drag to preview · Scroll zoom · 1-12 tools · Space pause · L heat lens`：没讲 LMB（左键）干什么、没讲"tools"是什么、没列出这 12 个 tool 各自的作用。
6. **Quick Start Guide** 字样出现了，但点不开，也没有对应内容——这不是"快速指南"，这是标签文字。

**结论**：一个从未见过这游戏的玩家在开始画面停留 15 秒后，对游戏玩法的理解度 = **0%**。

---

## 核心教学缺陷

### 缺陷 1：**没有教程，没有引导，没有入门流程**

我把整个前 5 分钟、前 30 分钟、前 60 分钟都走了一遍：
- **没有**任何形式的"第一步：选中 Road"提示
- **没有**对话框弹出告诉我"注意！食物正在减少"
- **没有**叙事文本、CG、过场、声音、配音
- **没有**一个 `?` / `Help` / `Tutorial` / `How to Play` 按钮
- **没有**"新手模式"选项

我按下 `H`、`?`、`F1` 全部无响应。按 `Space` 暂停是有效的，但唯一的 Space 用途就是暂停，不能调出任何信息窗口。

RimWorld 第一次打开时至少会让你选择剧本、读角色背景；Oxygen Not Included 有一段完整的"小型教学任务链"引你建第一个氧气站、第一个食物机器；Dwarf Fortress Adventure 模式本身就是混乱的代名词，但仍然允许新玩家走 "Tutorial Embark"。**Project Utopia 什么都没有。**

### 缺陷 2：**UI 全是图标，没有 tooltip**

顶部资源栏 11 个图标（Food / Wood / Stone / Herbs / Workers / Meals / Tools / Medicine / Prosperity / Threat）——我**只能**靠左上角因为键盘 Tab 意外触发的一段浮动文字 `Food — raw food from farms, feeds workers` 才判断出 Food 图标的含义。鼠标悬停资源图标**没有出现 tooltip**（我试了多次，验证了 DOM 里没有 `[role="tooltip"]` 元素）。

Workers 图标旁边的数字变化我得靠联想才理解是人口。Prosperity 49 和 Threat 30 到底是什么量纲？越高越好还是越低越好？Threat 上升到 92 时我才从它的红色背景推断出大概是"越低越安全"。

Build 工具条 12 个按钮（Road/Farm/Lumber/Warehouse/Wall/Bridge/Erase/Quarry/Herbs/Kitchen/Smithy/Clinic）**没有悬停 tooltip**。要看每个按钮的功能，必须先**点击**它——然后左侧 Construction 面板才会更新显示"Cost: 5w / Rules: …"。这是反直觉的：悬停提示是 2000 年代以来所有建造类游戏的基本功。

### 缺陷 3：**目标系统形同虚设**

标题里说 `Survive as long as you can`。进入游戏后，顶部条短暂显示 `Simulation started. Build the starter network first, then push stockpile and stability.` 然后**被后续消息替换**——没有持久任务列表，没有目标面板里的"□ 建造第一座仓库"清单。

当我点到了"Objective" Dev 面板，里面写着 `Objective: all completed`——**刚开始就"全部完成"**？那我还玩什么？另一个场景（Rugged Highlands）的目标叙述藏在 `AI Trace > Narrative` 里：`Claim south granary | Place a warehouse near the south granary to hold the basin.` 这条关键的叙事指引**埋在开发者调试面板里**，普通玩家绝不会去翻。

每个地图模板都有自己的"场景目标"（Frontier Repair / Gate Chokepoints / Island Relay），但选模板下拉框时不会显示任何说明，而且"south granary"、"harbor"、"relay depot"这些地名在地图上也没有标注，我完全不知道朝哪个方向走。

### 缺陷 4：**反馈是靠猜的**

- 我选了 Farm 工具，点地图空地，顶部红色条闪了一下 `Insufficient resources.`——是啊，Wood 只剩 3，Farm 需要 5——但那条提示过了 2 秒自动消失，我要非常眼快才能看到。
- 我把 Lumber Camp 建到草地上，得到 `No forest node on this tile. Lumber camps must be sited on a forest.`——好吧，这是真正有用的提示。但问题是：**地图上哪是 forest？** 我肉眼分辨不出一般草地和森林地格。没有悬停 tooltip 说这块地是啥。
- 我点地图空处被提示 `Cannot build on unexplored terrain. Scout this area first.`——**scout 怎么做？** Build Tools 里没有 Scout 工具！没有工人命令菜单！这是一个死循环：游戏要我侦查，但游戏不告诉我怎么侦查。
- 一个 Warehouse 突然起火（顶部滚出 `Warehouse fire at (52,38) — stored goods damaged`），我根本不知道为什么。没有生存手册告诉我仓库会自燃？火灾机制是什么？能用什么灭火？

### 缺陷 5：**Entity Focus 是开发者文档，不是玩家工具**

我好不容易点中一个工人，右下角展开 Entity Focus：

```
Worker-26 (worker_26)
Type: WORKER | Role: WOOD | Group: workers
State: Seek Task | Intent: lumber
FSM: current→seek_task prev→idle | nextPath←
AI Target: seek_task | TTL: 9.2s | Priority: 0.45 | Source: fallback
Policy Influence: applied=false | topIntent=wood | topWeight=1.60 | policyDesired=seek_task
Decision Time: sim→28.0s | policyAt→20.2s | envAt→24.2s
Position: world→(1.12, -0.29) tile→(49, 35)
Path: idx=0/11 | next=(48, 36) | target=(54, 40)
Path Recall: 15.7s | Path Grid: 26 | Path Traffic: 0
Vitals: hp=100.0/100.0 | hunger=0.287 | alive=true
```

**这是玩家界面？** `FSM: current→seek_task prev→idle` —— 这是有限状态机的调试输出，原封不动塞给了玩家。`Policy Influence: applied=false | topWeight=1.60` —— 这是强化学习策略的权重。`Path: idx=0/11 | next=(48, 36)` —— 这是 A\* 寻路中点。**没有任何一位正常玩家会从这段文字里学到任何东西。** RimWorld 给每个小人 4 个标签页（Character / Gear / Needs / Social），点开"Needs"就是直观的进度条；Project Utopia 直接把 C 代码往你脸上一贴。

### 缺陷 6：**Dev Telemetry 默认就在界面里**

屏幕底部 1/4 被 "Developer Telemetry" 霸占，包含 6 个抽屉：Global & Gameplay / A\* + Boids / AI Trace / Logic Consistency / System Timings / Objective Event Log。每一块内容都是：

```
Seed: 36459 | Grid v26 | 96x72
Terrain: passable=91.0% road=29 water=577 walls=21 emptyBase=0
Tuning: water=0.16 riverCount=1 riverWidth=2.2 riverAmp=0.12 mountain=0.08 island=0.03 ocean=0.00 road=72% settle=78%
Sim: t=32.2s tick=965 dt=0.167 steps=5
Render: fps=12.2 frame=64.00ms simCost=5.80ms
...
RNG: seed=3396352920 state=2524043081 calls=3115
```

FPS 12.2？？`tick=965 dt=0.167`？？`RNG: seed=3396352920 state=2524043081 calls=3115` —— 随机数生成器的内部状态被**暴露给玩家**。这是一个明显没有从"开发工具"切换到"消费者产品"的版本。

Dev Telemetry 还**抢占鼠标点击**——我甚至不能正常点击顶部"Fast forward"按钮，因为 Dev Telemetry 的 DOM 层在它上面遮盖，Playwright 直接报错 `<div id="devDockGrid"> intercepts pointer events`。这等同于在商店版游戏里对玩家说"抱歉，先把调试窗关了才能点按钮"。

### 缺陷 7：**Settings 是 50 个滑条的开发菜单**

我误点了顶部"Settings"按钮，弹出的右侧面板：

- Target Farmer Ratio 50%
- Sim Tick: 30.0 Hz
- Min Zoom: 0.55 / Max Zoom: 3.20 / Detail Threshold: 260
- Water Level: 0.16 / River Count: 1 / River Width: 2.2 / River Meander: 0.12 / Mountain: 0.08 / Island Bias: 0.03 / Ocean Bias: 0.00
- Road Density: 72% / Settlement: 78%
- Wall Mode: none / Ocean Side: none
- Population Control: Base W:17 | Stress W:0 | Total W:17 | Entities:25 …
- Workers: 12 [slider]

这是"设置"？这是地图生成器的参数面板。玩家想找的"音量/全屏/字体大小"一个都没有。

### 缺陷 8：**游戏结束 = 直接扔回主菜单**

我让殖民地自然崩溃（食物归零、工人从 15 死到 6 再到更少），**没有**：
- 弹窗说"Game Over"
- 统计页 "You survived 03:12 / Final Score 175 / 12 workers died of starvation"
- 重试同一种子
- 下一步建议
- "回顾"或"录像"

只是某一刻突然又出现了开局模态框，而且是**不同的地图模板**（从 Rugged Highlands 跳到 Archipelago Isles）。我甚至搞不清自己是主动按了"New Map"还是游戏自动踢我回来的。一个不够耐心的付费玩家看到"死了就换地图"这种粗暴过场，会立刻关闭标签页。

### 缺陷 9：**UI 响应式布局崩坏**

我把浏览器窗口从 1920×1080 改成 1600×1000 后再改回来，Build Tools 面板直接膨胀到屏幕一半高度，地图被压缩到左上角 1/4。刷新才能恢复。这是典型的"从未在非开发分辨率下测试过"。

### 缺陷 10：**控制台 500 错误**

页面一打开就有 2 个 HTTP 500 错误：`Failed to load resource: 500 (Internal Server Error) @ http://127.0.0.1:5173/health`。一个未发布的健康检查端点直接在主路径下失败——玩家不会看到，但任何懂一点前端的玩家按 F12 都会发现这游戏"看起来就不完整"。

---

## 具体场景列表（逐条复现）

| 场景 | 玩家期望 | 实际发生 | 严重度 |
|------|---------|----------|--------|
| 第一次打开游戏 | 主菜单/教程/剧情介绍 | 一个含有调试字符串的小弹窗 | 致命 |
| 鼠标悬停 Food 图标 | 出现 tooltip "食物 — 由农场产出" | 什么都不出现 | 致命 |
| 鼠标悬停 Farm 按钮 | 出现 tooltip 说明造价和规则 | 什么都不出现，必须先点击 | 严重 |
| 点击一个空地 | 造建筑或得到失败原因 | 顶部飞一行小字 2 秒后消失 | 严重 |
| 点击我的工人 | 弹出工人面板（任务、需求） | 弹出 10 行 FSM 调试信息 | 致命 |
| 按 H / ? / F1 | 出现帮助菜单 | 无响应 | 严重 |
| 按 Space | 暂停模拟 | 可能有效（有时不生效），且无视觉反馈 | 中等 |
| Settings 按钮 | 音量/画质/操作 | 50+ 个地形生成滑条 | 致命 |
| 食物降到 0 | 弹窗警告 / 红色闪烁 / 声音 | 图标背景变红，没人注意 | 严重 |
| 工人死亡 | 死亡动画 / 通知 | 人口数字默默 -1 | 严重 |
| 所有工人死亡 | 游戏结束总结页 | 静默回到主菜单，换个地图 | 致命 |
| 切换地图模板 | 看到模板的图片/说明/难度 | 只换个名字和 1 行场景描述 | 严重 |
| 需要"侦查未探索区域" | 给我一个 Scout 工具 | 根本没有这个工具 | 致命 |
| 建 Lumber Camp 到草地 | 允许或高亮可用位置 | 失败，提示"需要森林" | 中等（只有这一条提示是合格的）|
| 右下角 Entity Focus 空着 | 提示"选中工人"/"开始教程" | 灰字说 `No entity selected.` | 中等 |
| 玩了 3 分钟经济崩溃 | 给出建议/难度重置选项 | 无，换地图了事 | 致命 |

---

## 与同类成品游戏对比

### vs RimWorld
- RimWorld 开局有 **剧本选择**（Cassandra / Phoebe / Randy），各剧本都有 1-2 段话说明难度曲线；Project Utopia 只有地形模板，没有剧情、没有 AI Director 说明。
- RimWorld 每个小人有 **Bio + Traits + Needs** 浮层，把"Hunger 75%"用人话表达；Project Utopia 把 `hunger=0.287` 丢给玩家。
- RimWorld 的 Alerts 系统会在屏幕右侧堆栈警告（"Bob is starving"、"Muffalos nearby"），Project Utopia 的警告是一瞬消失的顶部烟雾弹。
- RimWorld 的 **Learning Helper** 会在你每次接触新系统时弹解释；Project Utopia 零教学。

### vs Oxygen Not Included
- ONI 有完整的 **剧情教程 Duplicant**（你从睡眠舱里醒来后一步步建氧气机），是引导的典范。Project Utopia 你醒来就在尸体堆里。
- ONI 每个资源图标 hover 都弹出 **渐变进度条 + 下降速率 + 剩余天数**。Project Utopia 图标就是个裸数字。
- ONI 的 Errands 系统清晰展示每个工人在做什么以及为什么；Project Utopia 展示的是 FSM state name。

### vs Dwarf Fortress
- 连以"难啃"著称的 DF，都在 2022 年 Steam 版加入了 **完整的可视化新手教程**——新版 DF 教你挖第一条隧道、造第一个卧室。**Project Utopia 比 2022 年前的 DF 还难上手**，因为 DF 至少有一本 1500 页的社区 Wiki；Project Utopia 没有任何外部文档入口，游戏里也不告诉你有 wiki。

**残酷对比**：RimWorld/ONI/DF 都经过多年把开发工具和玩家工具切开的打磨。Project Utopia 看起来根本没开始这一步。它是一个 **tech demo / 模拟引擎**，不是一款游戏。

---

## 玩家理解度推测曲线

| 时间点 | 我理解的内容 | 我不理解的内容 |
|-------|-------------|--------------|
| 0:00 前 5 秒 | "这是个殖民地模拟"、"要建东西" | 所有具体机制 |
| 0:30（跑过第一分钟） | "我有 11 种建筑"、"我有工人" | 建筑互相关系，哪个先造 |
| 2:00 | "食物在下降，工人会死" | 食物从哪来，为什么下降，怎么止血 |
| 5:00 | "地图上东边有个敌对的 saboteur"（猜的，因为看到 AI Trace 里 `saboteurs:sabotage`） | 我能怎么对付他们，墙建在哪 |
| 15:00 | "有 'heat lens'、'doctrine' 这些词但我不懂" | doctrine 是什么，prosperity 分数怎么变 |
| 30:00 | **放弃** | 全部 |
| 1:00:00 | —— | 不会有玩家玩到这里 |
| 2:00:00 | —— | 极度不可能 |

一个付费玩家**8-10 分钟内会退款**。

---

## 会不会在不知道该干什么的情况下放弃？

**会。而且是 100% 会。**

这不是一个需要玩家主动学习的硬核游戏——这是一个玩家主动学习也**没东西可学**的游戏。没有手册、没有 tooltip、没有教程、没有关卡。游戏自己在自动运行（fallback AI 在自动给工人分配任务），玩家的参与度接近于"看 htop 监控"。我真的开始怀疑这根本不是给人玩的，而是给开发者看"模拟引擎是否稳定"的测试台。

---

## 改进建议（若要当成一款"游戏"销售）

### 优先级 0（发售前必须做）
1. **关掉 Dev Telemetry**：默认隐藏，只在 URL 带 `?debug=1` 或按 `\` 时显示。
2. **把 Settings 拆分**：玩家设置（音量、快捷键、画质）vs. 地图生成设置（放到 New Map 流程里）。
3. **Entity Focus 重写**：把 FSM / Policy / Path 那些内部状态全删除，替换成 RimWorld 风格的 Name / Role / Hunger bar / Current Task 文字 / Recent Events。
4. **所有图标加 `title` 属性或 tooltip 组件**：Food 悬停=弹"食物：由农场产出，工人消耗"；Prosperity 悬停=弹"殖民地繁荣度，高 = 解锁更多移民"。
5. **加一个 `?` 帮助按钮**：打开内嵌的 3 页手册（基础控制 / 资源链 / 威胁系统）。

### 优先级 1（第一次重大补丁）
6. **强制新手教程**：第一次打开游戏时播放一段 30 秒的引导过场：跟随一个 NPC 配音、把第一条路建在 A→B、把第一座农场放在 C、等待产出食物并目睹工人搬运。完成后解锁正式玩法。
7. **目标追踪面板**：屏幕右上角持久显示 `□ 重建西部伐木线 (0/3)`、`□ 夺回东部仓库 (0/1)`。鼠标 hover 在任务上时，地图高亮对应位置。
8. **失败总结页**：死光时弹统计（存活 03:12 / 分数 175 / 死因：饥饿×9 / 最后一个建造：Farm at 34,28）+ "重试同种子" / "教程模式" / "回到菜单"三个按钮。
9. **警告系统**：食物 <10 时屏幕右上出现堆栈式警告条，像 RimWorld。
10. **Tile tooltip**：鼠标 hover 任何格子显示"草地 · 可通行 · 附近未被认领 · Ctrl+左键查看详情"。

### 优先级 2（润色）
11. **模板下拉框升级为卡片选择**：每张卡片有缩略图、难度星级、一句简介、推荐玩法。
12. **快捷键 `F1` 呼出帮助**、**`ESC` 呼出暂停菜单**（Resume/Settings/Main Menu/Quit）。
13. **视觉区分**：森林地格应与草地明显不同（深绿/树图标），让"必须建在森林"这样的规则可视化。
14. **第一次生火事件播一个小弹窗**：教玩家火灾会怎么蔓延、怎么建 Wall 阻隔、怎么用水源灭火（如果游戏里有这种机制）。
15. **完全移除标题栏的 SEED 数值**（或仅作为 "Advanced"）。

---

## 总结

Project Utopia 现阶段**不具备可消费的游戏形态**。它是一台精密的自动运行模拟器，在"玩家引导"这个维度——从第一次打开到玩家完整理解游戏——几乎交了白卷。评分 **2/10** 的理由：
- +1：页面能成功加载，模拟能正常开始。
- +1：Construction 面板至少给每个建筑写了 1-2 句说明（即使被隐藏在不显眼的位置）。
- -8：零教程、零 tooltip、零总结页、错误提示稍纵即逝、把 FSM/A\*/RNG 调试信息当玩家 UI、Settings 充斥开发参数、场景目标藏在 Dev Trace 里、模板之间没有说明、失败后无缝跳地图，且 UI 响应式布局在非 1920×1080 分辨率下直接崩溃。

**一句话总结**：这不像一款游戏，更像一个开发者忘了关调试模式就把测试服务器链接分享出来的东西——**任何付费玩家会在 10 分钟内关闭标签页并要求退款**。
