---
reviewer_id: 02d-roleplayer
reviewer_persona: 叙事/角色扮演玩家
round: 5
date: 2026-04-24
build_url: http://127.0.0.1:5173/
templates_played:
  - Temperate Plains / Broken Frontier
  - Archipelago Isles / Island Relay
play_duration_min: ~15
score: 3
verdict: "系统准备了很多名字和小抄，但没人把它们拼成故事。"
---

# Project Utopia · 叙事/角色扮演玩家 Round 5 评测

## 身份自述

我玩 colony sim 是来听故事的。别的玩家打开 RimWorld 看产量曲线，我打开它是想看那个叫 Smith 的独眼老兵，愿不愿意在寒潮最冷的那晚，替身患抑郁症的伴侣去修围墙；打开 Dwarf Fortress 是想读一个矮人酒馆的涂鸦日志——他在上面画了一只熊，上面写着"我的父亲"。这些瞬间不来自系统，来自系统给玩家留下的"缝隙"：只要那里有一个名字、一段关系、一场灾难和一个幸存者，我就能脑补出一整段族谱。

所以今天我打开 Project Utopia，带着的是"故事工具箱"而不是"效率工具箱"。我想给工人起名字，追一个我最喜欢的走五分钟看他走去哪里，然后看一场危机如何被游戏叙事化——它是会在右下角弹一条"Luka 饿死在仓库门口"，还是只弹一行 `worker_38 died (starvation)`？

结论是介于两者之间，偏向后者。

## 我试着给工人起名字——但其实它替我起好了

第一个小惊喜来自 Entity Focus 面板。点开 Dax-7，看到：

> **Backstory**: cooking specialist, resilient temperament
> **Traits**: resilient, swift
> **Mood**: 0.69 | Morale: 0.88 | Social: 1.00 | Rest: 0.80
> **Relationships**: Fen-10 Friend (+0.30) | Tam-9 Friend (+0.20) | Ren-5 Friend (+0.20)
> **Recent Memory**: (no recent memories)

这比我预期的多。这游戏其实真的给每个工人生成了身世、性格、社交图。Dax-7 是个"烹饪专员、性格坚韧"的家伙，和 Fen-10、Tam-9、Ren-5 关系不错。OK——这已经能让我开始脑补："Dax 是营地里那个沉默但靠谱的厨子，闲下来会跟副手 Fen 斗嘴。"

问题立刻出现。我去看 Colony 面板里的角色分配：

```
COOK: 0
WOOD: 14
FARM: 5
```

整个殖民地一个厨师都没有被指派。"烹饪专员"的 Dax-7 被塞去砍木头了——身世描述和真实行为彻底脱钩。这是 RimWorld 不会犯的错：那里一个"Incapable of Cooking"的家伙会摆出拒绝表情，你能从这个矛盾里读出情绪。Utopia 的工人只是默默接受了角色与背景完全无关的分配，系统既没为此道歉、也没让 Dax 心情下降一格。**背景故事只是一个装饰字段，不是一条叙事的因果链。**

接着我切到 Vela-8——"farming specialist, efficient temperament"。她的 Recent Memory 这回有东西了：

```
- [317s] Warehouse fire at (52,38)
- [312s] Warehouse fire at (52,38)
- [307s] Warehouse fire at (40,27)
- [279s] Warehouse fire at (40,27)
```

我当时激动了一下——火灾！但激动完就冷静下来，因为**记忆只是一条坐标日志**。"仓库起火 @(52,38)"不是一个故事，它是一个 DEBUG 字符串。如果 RimWorld 的 Vela 看到仓库起火，她会有 Mood 惩罚，会跟家人讨论，会一周后在日记里再提一次；这里的 Vela 在 12 秒内"记得"了同一场火四次，然后就没了。重复坐标被当作独立事件塞进记忆流，这不叫记忆，这叫 log。

不过 Relationships 确实在动态演化——两分钟之内，Tam-9 从 "+0.20 Friend" 升到 "+0.30 Friend"，Ren-5 从 +0.20 到 +0.25，Ivo-23 被 Vela 升为 "Close friend (+0.70)"。证明底下有社交 tick 在跑。但我没有一处 UI 告诉我"他们为什么变亲密了"——是一起干了活？一起吃了饭？一起躲过了预警？数字变了，情节没变。

## 游玩中最接近"故事"的瞬间

**Luka-38 starved.** 游戏的第一个死亡，发生在 Temperate Plains 的第 232.9 秒。屏幕上闪了一条红色 toast "Luka-38 starved"，下面弹出 "Food bottleneck → Recover food now"。

这大概是我全程最接近"故事"的瞬间——但它之所以有情感重量，主要是因为我自己脑补的：我刚花 5 分钟看过 Dax-7 的好友清单，我知道 Luka 可能是某个 Ren 或 Fen 的朋友，我知道他死之前世界只剩 16 份食物和 21 个工人。但游戏本身没有帮我放大这个瞬间——没有画面聚焦，没有音效，没有其他工人对 Luka 的追悼，没有"Ren-5 lost friend Luka-38 (-0.40 mood for 3 days)"。

我主动去点开 Vela-8 的 Memory 想看她记不记得这事。没有。Luka-38 死亡没有进任何人的记忆流。整个殖民地里最戏剧化的事件，在每一个工人的内心世界里都没发生过。

**Herbivore-18 died - predation.** 另一个 toast。我再点进画面里那只还在游荡的 Predator-20——系统给的数据很棒：

```
Selected Predator-20
Backstory: lone predator
State: Stalk | Intent: stalk
Hunger: Starving (0% well-fed)
Policy Focus: isolated prey patrol
```

一只"孤狼、饥饿 0%、潜行狩猎"的掠食者。在脑子里这就是一个故事——它刚杀了一只食草动物，还在继续找食物。但我在地图上根本没法目击这一场狩猎，我看到的只是一群像素精灵在小岛上随机游走，然后每隔几十秒弹一条 toast。**戏剧发生在数据层，而不是表现层。**

我又点了一个 Worker：Dax 的好友 Fen/Tam/Ren 我都没能锁定，因为 canvas 点击选到谁完全看运气。没有"按名字搜索"的功能，没有工人列表，Entity Focus 也没有"选下一个"或"切换到 Ren-5"按钮。想追一个工人 5 分钟，你会发现几秒之内你就把他丢了——它们长得一模一样，挤在一个 3 tile 宽的道路簇里走来走去。"**让我化身某个 NPC**"这件事在 UI 层是根本不可能的。

## 氛围：音乐与画面

这部分是最短也最直白的一节。我用 JS 探测了一下页面：

```
audioElements: 0
hasAudioContext: true  // 但从未被启用
playing: 0
```

**没有背景音乐，没有环境音，没有 UI sfx。** 在一款号称 "Living World"（v0.8 起的 slogan）的游戏里，整个世界在物理意义上是完全静默的。RimWorld 的长笛前奏能让你在加载界面坐住三十秒；DF 开个老游戏第一秒的 crickets 能把你送进石头仓库的夜晚。Utopia 什么都没有。工人被狼撕开、仓库起火、Luka 饿死，都伴随 Three.js 风扇的静音。

画面这边评价要分两头说：

- **像素风格本身不难看**。水面、草地、建筑的 pixel tileset 是称职的；建筑升起的时候有一点微动画（我猜是比例缩放）。
- **但氛围为零**。没有天气粒子的声音；切地图模板时除了"地图好像有点岛"之外，感官差异不大（Archipelago 的水占一半，Plains 是大陆——视觉上分得清，但情绪上没有"这是一片孤岛"的感觉）。没有日夜循环的明显灯光色温变化（至少我在 6 分钟快进里没感受到）。Heat Lens 切进去之后世界变成 surplus/starved 颜色——那是一张系统管理员的表格，不是一张氛围画。

画面+声音=0.5 / 10。

## AI Narrative 面板读后感

这部分反而是游戏最让我"哦？"的地方。DOM 里藏了一堆 AI Narrative 的东西：

```
System Narrative
Headline: Claim east ruined depot
Next Move: Place a warehouse near the east ruined depot.
AI: env=let the colony breathe | workers:rebuild the broken supply lane
    | traders:hug the warehouse lanes | saboteurs:disrupt a frontier depot
Evidence:
  Frontier: 1/1 routes online | 0/1 depots reclaimed | warehouses 6/2
            | farms 5/6 | lumbers 5/3 | roads 48/20 | walls 8/8
  Logistics: carriers 9, avg depot dist 1.3, overload ...
```

还有 "Raw Model Content"：

```json
{
  "weather": "clear",
  "durationSec": 22,
  "factionTension": 0.35,
  "focus": "let the colony breathe",
  "summary": "Pressure let the colony breathe for 22s while keeping the scenario legible.",
  "steeringNotes": [
    "Respect the unreclaimed depot at east ruined depot so the player can see why route repair matters."
  ]
}
```

这是一个 Storyteller-style AI 在跑。**它懂叙事指令**——"让殖民地喘口气"、"尊重未收复的仓库，让玩家看到路线修复的意义"。这些是开发者留下的叙事骨架，甚至用词都比普通 colony sim 有意思。

但——这个骨架只对 Director 层可见。玩家头顶永远只看到黄色警告条 "east ruined depot at (57,39) -> Reclaim east"。**AI 讲的是"让殖民地喘口气"，HUD 翻译成"完成目标 2/6"。** 所有有趣的叙事语言都在玩家看不到的下层字典里，不进工人记忆，不进死亡通报，不进环境动画。

这就像看一个剧本杀房间：编剧写了"NPC 今晚要说谎"，但演员拿到的只是"你走到桌边坐下"。

## 主动制造戏剧

我做了两个尝试：

1. **空转看危机涌现**。开 4x 快进，不建 Kitchen、不转 Cook 角色。结果如记录：250 秒开始 food -192.7/min，280 秒 Luka-38 饿死，330 秒 food=6 还在撑。危机发生了，但叙事呈现=1 条 toast + 1 个计数器。
2. **切地图重来看开局叙事**。从 Temperate Plains → Archipelago Isles。Briefing 文案变了（"Island Relay — Bridge tw..."、"east fields causeway gap at (53,35)"），Director 目标从"修陆地路线"变成"修海上桥"。这已经是游戏最棒的一面——**每张地图有自己的开局故事**。但工人不会说"我们这辈没见过这么多水"，建筑不会有海岛版本的贴图，天气不会下海雾。世界的叙事还是停留在文字 briefing 上。

## 我编不编得出一段殖民地故事

勉强能编，但**每一个细节都是我脑补的，不是游戏给的**。

> "Dax-7 是个厨子，可惜新殖民地没人做饭的地方，他只好跟着 Fen 和 Tam 上山砍树。Luka-38 在第四天饿死，没人给他收尸，Ren-5 在三格外继续摘草药，什么都没说。那只叫 Predator-20 的孤狼现在还在岛的北缘游荡，饿到 0%，它吃掉的那只食草 18 号是谁的眼睛里瞥过的，游戏没告诉我。"

注意这段里每一个情感细节都是我的——"没人给他收尸"、"什么都没说"。游戏给了我：名字、数字、坐标、状态。它没给我：**谁看见了 Luka 的死亡；谁因此悲伤；这件事在三天后会以什么方式出现**。

这跟 RimWorld 的差距不是技术差距，是**叙事因果链**的差距。Utopia 有所有原料（名字、关系、记忆流、Director AI、Policy 文本），但这些原料没有相互触发——死亡不入记忆，记忆不改情绪，情绪不改行为，行为不影响其他人的记忆。整个叙事闭环是开路的。

## 与 RimWorld / Dwarf Fortress 的对比

| 维度 | RimWorld | DF | Project Utopia v0.8.1 |
|---|---|---|---|
| 工人有名字 | 是 + 历史背景 | 是 + 家谱 + 艺术品 | 是 + 一行 backstory |
| 死亡有叙事重量 | Mood 惩罚传染 + 墓碑 + 日志 | 家族仇恨 + 幽灵 | 一条 toast |
| 关系演化可见 | 对话 + 床上关系 + 冲突 | 好恶矩阵 + 酒馆打架 | 数字悄悄变动 |
| 环境氛围 | 音乐 + 天气 + 光照 | ASCII 但有 crickets | 静默 + 静态瓦片 |
| Storyteller AI | Cassandra / Phoebe / Randy | 不预设 | Director + Policy（玩家看不到） |
| 可化身/追随某人 | 允许锁定相机到 Pawn | 可切视角 | Entity Focus 只是面板 |

Utopia 在**系统设计**（AI Director、Policy、社交图、Backstory 生成）上其实走了一条非常正确的路——它把很多"叙事原料"都留好了。但它把最后一公里全部卡在"系统→玩家"的呈现层。

## 评分与总结

**3 / 10**

满分 10 分，我给 3。分解：

- **+1** Entity Focus 真的点到 NPC 会看到 backstory、traits、mood、relationships、memory——比我预期的多。
- **+1** AI Narrative / Director / Policy 在 DOM 里是存在的，用词不俗（"let the colony breathe"、"respect the unreclaimed depot"），表明有人真心在设计叙事骨架。
- **+0.5** 每张地图的开局 briefing 是有差异的——Broken Frontier、Island Relay 文案不同，目标不同。
- **+0.5** 死亡和火灾 toast 存在，最基础的事件通报有。
- **-** 死亡不进记忆流（最关键的一扣）。
- **-** Backstory 跟真实角色分配脱钩（Dax 厨子砍树）。
- **-** 完全静默，没 BGM、没 SFX、没环境音。
- **-** Entity Focus 不能切工人，无法"追随某人 5 分钟"。
- **-** 重复事件刷屏记忆，不是"记忆"，是 log。
- **-** AI Storyteller 的叙事语言没有 surface 到 HUD/工人对话/画面里。

**一句话总结**：这个殖民地把我每一个工人的身世都写好了、把 Director 的剧本大纲写好了，然后把所有的纸都锁进了抽屉，只给我看一张"farms 5/6"的记分卡。我编不出故事——因为游戏没让故事发生在我能看见的那一层。

给设计者的一句建议：**把死亡、火灾、救援、节庆塞进 `recentMemory`；让 backstory 真的影响 Role 分配；加一段 20 秒的环境 loop。** 这三条单独任何一条都能让我从 3 分升到 5 分。

---

DONE 02d score=3.
