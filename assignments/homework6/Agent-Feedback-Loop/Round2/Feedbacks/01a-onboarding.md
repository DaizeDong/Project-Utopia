---
reviewer_id: 01a-onboarding
round: 2
date: 2026-04-22
score: 3
verdict: 有说明书但没教学，开局就是一锅正在沸腾的水，新手根本不知道自己在看什么。
---

# Project Utopia · Round 2 外部评测 — 引导性（Onboarding）

## 总体评分：3 / 10

作为第一次打开这款游戏的外部玩家，我花了大约三分钟才从"Start Colony"按下之后的混乱中爬出来，然后用剩下的时间看着殖民地在我能做任何有意义决策之前就自动运转、自动死人、自动重置目标。**它把"有一份 How to Play 文档"当作了"已经有教学"，这是 2026 年付费级商业殖民模拟游戏不应该犯的错误。**

---

## 第一印象（前 60 秒）

打开 `http://127.0.0.1:5173` 后出现标题菜单，卡片居中，标题是 "Project Utopia"，下方有一行剧情描述——"Reconnect the west lumber line, reclaim the east depot, then scale the colony."——以及一个 "Broken Frontier · frontier repair · 96×72 tiles" 的场景标签，再下面是 "Survive as long as you can, 00:00:00 · 0 pts"。

这段信息对第一次接触的玩家是**完全无意义的**：

- "west lumber line"——哪个 west？地图还没看到。
- "east depot"——depot 是什么？
- "frontier repair"——修什么？为什么要修？
- "Survive as long as you can"——上面又说要 reconnect/reclaim/scale，到底是叙事目标还是生存目标？

三个按钮：**Start Colony / How to Play / New Map**。按常识先点 How to Play，发现是一个四页 tab 的说明书弹窗（Controls / Resource Chain / Threat & Prosperity / What makes Utopia different）。内容尚可：

- Controls 页解释了快捷键。
- Resource Chain 页用一段文字讲了食物→餐食、石料+木头→工具、药草→药品。
- Threat & Prosperity 页解释了两个抽象指标。
- 第四页讲 "AI Director" 和 WHISPER / DIRECTOR / DRIFT 三种 storyteller 状态，以及 Heat Lens。

**问题是**：这是"手册"，不是"教学"。手册 = 被动阅读 → 合上就忘；教学 = 手把手带你做一次就记住。RimWorld 开局会有叙事导师把你拖进第一次伐木、第一次吃饭；ONI 会整个 45 分钟的 "Guided" 教学关让你解锁每个系统；Dwarf Fortress 自己都在 Premium 版加了 wiki-linked tutorial。Utopia 的做法是——扔给你四页文字，然后祝你好运。

---

## 核心教学缺陷（按严重程度排序）

### 1. 开局不是"开局"，是"已经玩了半小时的存档"

按下 Start Colony 后，屏幕上出现的不是一块空地、一个起始工人、一个"现在请放第一个农场"的箭头——而是**一个已经有 20 个工人、14 个农场、3 个伐木场、7 面墙、一堆仓库、一条完整道路的成熟殖民地**，任务栏还写着"7 warehouses built (goal 2) 4 farms built (goal 4) 3 lumber camps (goal 3)"——**所有数字都已经远远超过目标了**。

外部玩家完全不知道自己要做什么：
- 任务已经完成了吗？
- 我是被丢进了一个 save state，还是这是某种"重修场景"？
- 那 5 个新手要素是什么？场景叙述说"reconnect the west lumber line"——可是 lumber camps 已经 3/3 了？

更荒谬的是——我坐着什么都不做，**目标数字在往回跳**。起始 "7 warehouses"，一分钟后是 "6"，两分钟后是"0 warehouses built (goal 2)"。**仓库为什么会消失？** 游戏没有给任何解释，没有"a warehouse collapsed from fire"的弹窗，没有"a raider destroyed…"的事件日志。目标状态在玩家无操作的前提下自己漂移。对一个新手来说，这传递的信号是"这游戏的状态我无法理解，所以我也无法影响"。

### 2. 没有"下一步该做什么"的任何指引

游戏进入 3 分钟，前面说的死人事件发生了：
- `[158.8s] Nell-23 died (starvation)`
- `[167.7s] Ora-26 died (starvation) near (3,56)`

关键点：**此时屏幕显示 Food = 22（涨到 32），生产速率 +87/min，甚至标红警告都没有**。工人在食物充裕的情况下饿死——这是游戏内部状态（大概是工人没走到仓库 / 仓库被拆了 / 后勤链断了）的复杂后果，但 UI 没有任何"为什么"的解释。新玩家会得出唯一的结论："这游戏不讲道理"。

而且：没有任何提示告诉我**我应该**做什么来救人。没有教学气泡说"Build a Kitchen to double food efficiency"，没有红框闪仓库说"Warehouse destroyed—rebuild here"。一切都在后台默默进行，玩家不被邀请参与。

### 3. 点击工人 / 建筑 / tile 的反馈几乎为零

屏幕下方有一个持续存在的占位符 **"Entity Focus"** 黑条，空着。我尝试了大量次数的 canvas 点击，从来没能让它显示任何实体信息。试着用合成事件分发 mousedown/mouseup/click 到 canvas 都没触发选择。对新手来说这意味着：**你点不开任何东西看详情**。

相比之下：
- RimWorld 点任何小人都直接打开一整块面板：饥饿、心情、当前任务、技能、衣着、关系。
- ONI 点 duplicate 会弹出类似面板，还标着当前呼吸的气体。
- Dwarf Fortress 的 examine 键 (`k` / `v`) 一直是核心交互。

Utopia 的 "Entity Focus" 条出现在屏幕正下方、醒目、有标签，但**什么也不选中**，这比没有这个面板更糟——它在向玩家承诺某种功能，然后拒绝兑现。

### 4. 资源图标只有 icon，没有文字标签，没有悬浮就认不出

顶栏的资源条只有 5 个小图标加数字：🍎110、🪵7、⛰️4、🌿0、⚙️13（食物 / 木头 / 石头 / 药草 / 工人）。鼠标悬停时会弹出非常短的自定义 tooltip（如"Food — raw food from farms, feeds workers"），但默认不可见。结合前文"点击物体没有反馈"，玩家的认知负担被堆到一起：**你既不知道图标是什么，也没法点来问明白**。

ONI 顶栏的资源条每个都有文字标签 + 图表悬浮 + 点击进入产能图；RimWorld 的资源悬浮直接告诉你库存、产出、消耗——Utopia 这里省得过分。

### 5. "Supply-Chain Heat Lens"：名字很酷，理解成本极高

按 L 开关 Heat Lens，画面变成 "Heat lens ON === red === | surplus | starved"。整个图例只有一行文字，没有进阶解释。新手完全不知道"producers drowning beside a full warehouse"和"processors starving for input"这两个概念在说什么——更糟糕的是，第一次开 Heat Lens 的时候地图上几乎什么都没染色（因为我的处理链只有一座 Smithy），所以这个工具的所谓"一眼就看到瓶颈"的承诺完全落空。

### 6. Storyteller 的文字完全无法解析

右上角的 `DIRECTOR` 文字块每隔几秒刷新一次内容，我看到的一句是：

> "route repair and depot relief: the colony should sustain route repair and depot relief while keeping hunger and carried cargo from overriding the map's intended reroute press"

这是**机器生成的机器话**，对新玩家零信息量。"reroute press" 是什么？"intended reroute" 是什么意图？"carried cargo overriding" 指哪段逻辑？没有上下文，没有可点击的术语表，没有从文字跳到相关机制的超链接。

### 7. 没有任何 "uncover / scouting" 教学，但建造会被迷雾拦截

当我试图放农场、放道路在看起来是草地的空地上时，弹出：
> "Cannot build on unexplored terrain. Scout this area first."

**"Scout"到底怎么做？** 教程里完全没提这事。屏幕上没有"侦查"按钮，没有"派一个工人去探索"的提示，而且视觉上**迷雾根本不明显**——整张地图都是绿草蓝水，迷雾没有深色覆盖。玩家根本看不出哪里是已探索区、哪里不是。

### 8. 暂停/速度控件堆在底部 + "Entity Focus"，无层级感

底部中央一条：⏸ ▶ ⏩ 0:xx 和一个空 "Entity Focus"。没有分组、没有图例。新玩家不会知道 ⏩ 是 4x 而不是永久快进；按钮太小（都是 16px 字符），在 1440 宽屏上显得孤零零。

### 9. 目标栏信息过载但无优先级

顶栏中间任务条："0 of 1 supply routes open 0 of 1 depots reclaimed 0 warehouses built (goal 2) 5 farms built (goal 4) 4 lumber camps (goal 3) 7 walls placed (goal 4)"——**一句话 8 个状态、4 个不同格式**（X of Y、X built (goal Y)、不同的动词）。这种字符串拼接式 UI 在一个 2026 年的付费产品里属于占位符水平。

### 10. 没有失败提示 / 没有成功提示 / 没有里程碑

我两个工人饿死，UI 的唯一反馈是在 "Last:" 字段里换了一行。没有事件弹窗、没有叙事文本、没有"要不要暂停看一下"的提示。反过来也没有"第一次 +10 Food"、"第一次解锁 Kitchen"这种里程碑鼓励。整个体验是冰冷的数字表格在自己运转。

---

## 具体场景问题清单（Session 记录）

| 时间 | 事件 / 我看到的 | 我不理解的 |
|---|---|---|
| 00:00 | 标题菜单 + 剧情一句话 | 没有教程 / 剧情 intro 动画 |
| 00:10 | 按下 Start Colony，殖民地已经半成品运行 | 为什么我不是从零开始？ |
| 00:45 | Food 从 110 掉到 5 | 为什么没有消耗/产出图？ |
| 01:00 | 打开 Colony 面板，看到 Food=0, Wood=0, Tools=1 | 14 farms 怎么生产 0 food？ |
| 01:30 | 尝试建农场，弹出 "Cannot build on unexplored terrain" | "Scout" 是按什么？迷雾在哪？ |
| 01:50 | 尝试点击工人→"Entity Focus"空着 | 怎么选工人？ |
| 02:17 | DIRECTOR 的文字完全看不懂 | 什么是 "reroute press"？ |
| 02:45 | Nell-23 饿死，屏幕 Food=22 且 +87/min | 食物富裕时为什么饿死？ |
| 02:56 | Ora-26 也饿死 | 无任何事件弹窗或高亮 |
| 03:02 | 任务栏 "0 warehouses built (goal 2)"——但我开局看到 7 个 | 仓库凭空消失？ |

---

## 与 RimWorld / Dwarf Fortress / Oxygen Not Included 的差距

| 维度 | RimWorld | DF (Premium) | ONI | Project Utopia |
|---|---|---|---|---|
| 欢迎/IntroVO | 叙事家介绍 + 角色背景故事 | Wiki-linked tutorial 关卡 | 45 分钟 Guided 教学 | 四页文本说明书 |
| 第一次行动引导 | 点高亮 tile 建第一个事物 | 交互式 wiki quests | 屏幕箭头 + 对话框 | 无 |
| 选取单位反馈 | 全量 pawn 面板 | `v`/`k` 详情页 | duplicate 详细面板 | "Entity Focus" 空置 |
| 资源条 | 图标+数字+悬浮图表 | 库存多级 | 图标+标签+产能图 | 只有图标+数字 |
| 事件系统 | 叙事家驱动，每次弹窗+剧情 | 传奇日志 + 触发 | 任务提示 + 里程碑 | "Last: X died" 一行文字 |
| 迷雾 | 无需，但有无视野反馈 | 受限于视野 | 不适用 | 有迷雾但不可视 |
| AI 术语 | 无 | 无 | 无 | 三种 storyteller + DevIndex + Heat Lens |
| 暂停后的解释 | 暂停+提示+Tips | 暂停=默认 | 可暂停看指标 | 暂停只是暂停 |

Project Utopia 唯一在这张表里**胜过 RimWorld** 的地方是：有一个非常酷的 Supply-Chain Heat Lens 概念——但这个功能在教学中被降级成了"请读第四页的一段文字"。它值得一个专门的引导教程关卡。

---

## 改进建议（按优先级）

### 必须做（P0）

1. **真正的第一关教学**：让玩家从 0 个建筑、3 个工人、一个"第一目标：让他们今晚吃上饭"开始。每一步有屏幕箭头 + 暂停引导 + 对话气泡。参考 ONI 的 45 分钟教学。
2. **Entity Focus 必须真的能选中东西**。要么修 bug，要么把这条占位符直接删掉——现在的半成品比没有更差。
3. **饿死事件必须附带可视反馈**：弹窗 + 位置闪烁 + "原因：Nell 距离最近的仓库 12 tile 且路径被拆" 这种因果链。
4. **迷雾必须可见**：用深灰覆盖层，让玩家直观看到"哪里需要探索"。然后提供一个"派工人侦查"工具（也许就叫 Scout），而不是把建造失败扔给玩家。
5. **任务栏信息分层**：当前 primary goal 用大号字体，次要目标折叠到 "View details"。不要一行 8 指标。

### 应该做（P1）

6. **工具/建筑卡片改进**：把 "Cost: 5 wood" 和 "Rules: Place on grass, roads, or ruins" 加图标化。现在一整块只有两种字号的灰白文字。
7. **Storyteller 文本 human-ify**：让 DIRECTOR / WHISPER 的输出从机器语言变成"Your farms are producing fine but hunger is still rising — try a Kitchen"这种可执行建议。
8. **资源条加文字标签**：至少 hover 时在图标下方一直显示名称，而不是依赖短 tooltip。
9. **首次使用 Heat Lens 弹教学**：按 L 第一次打开时暂停游戏，指着地图说"红色=这里生产过剩、蓝色=这里处理饥饿。点这些可以跳到 bottleneck"。

### 可选（P2）

10. **里程碑 / 叙事事件系统**：第一个农场、第一次餐食、第一次工人结交朋友……给玩家存在感。
11. **可选 tutorial 跳过入口**：老玩家能跳过，新手默认进入。
12. **术语表面板**：F2 打开一个可搜索的 glossary，把 DevIndex / Heat Lens / storyteller modes 都列出来。

---

## 结论

Project Utopia 的底层系统（多种地形模板、AI storyteller、Heat Lens、Resource Chain、Prosperity/Threat 双向指标）听上去像一个有野心的复杂模拟器，但**引导性这一项基本不及格**。

作为一个从未接触过这款游戏的外部玩家，在三分钟内我经历了：信息密度爆表的开场菜单、**一个已经运行的半成品殖民地**、模糊的资源条、无效的实体点击、无法解析的 AI 文本、两个无征兆的饿死事件，以及一个在我无操作下自己把目标改掉的任务栏。

在同赛道有 RimWorld、ONI、DF 这些已经把 onboarding 做得极其工业化的竞品的情况下，Utopia 目前的引导等级大约在**十年前 Steam Early Access 预告 demo** 的水平。我不会推荐任何朋友在当前状态下尝试这款游戏——他们会在 5 分钟内流失。

如果开发团队希望把这款作品推到付费产品级别，**引导应该是下一个大版本的 P0 工作**，在继续做 Phase 9 结构性调整之前。否则再多的系统深度都会被堵在"新玩家根本进不去"的门口。

评分：**3 / 10**——加分项：有 How to Play 弹窗；减分项：几乎所有别的东西。

---

*评测方式：Playwright 自动化浏览器 ~25 次交互 + 文档/快照对比观察，总游玩模拟时长约 3 分 20 秒游戏内时间。所有观察都基于浏览器可见内容，未阅读任何源代码、文档或历史评测。*
