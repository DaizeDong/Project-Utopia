# 02d-roleplayer · Project Utopia 评测（Round 6）

> 评测日期：2026-04-25  
> Build: http://127.0.0.1:5183/  
> 视角：叙事/角色扮演型玩家  
> 评测时长：约 50 分钟（25 分钟手动 + 25 分钟挂机观察 + 写作）

---

## 一、身份自述

我是那种打开 RimWorld 第一件事就是把每个殖民者改成熟人名字的玩家。我会给每只猫起名字。我玩 Dwarf Fortress 是为了两年后某个矮人在地牢里对自己刻一段诗，然后被狗熊咬死，留下一座"血泪雕像"。我玩 colony sim 不是为了 KPI，不是为了优化 DPS / min，是为了在某个雪夜里一个独居的工人独自走了 200 格回到仓库吃了一口冷饭，然后我截图发推。

抱着这种心态打开 Project Utopia，我立刻开始找：**名字、面孔、关系、回忆、死亡、爱、悔恨**。

---

## 二、我试着给工人起名字

打开"Broken Frontier"开局，13 个工人列在 Entity Focus 面板里。我第一眼看到的名字组合让我愣了一下：**Mose Keane、Mose Hale、Mose Jorvik**——三个 Mose。**Anse Hale、Mose Hale**——两个 Hale。**Kess Pale、Pia Orr、Ilia Tull、Fen Hearn**……名字是程序生成的姓名词典拼接，发音上有种古英语 / 北欧 / 假托尔金的味道，初见还算有氛围。

但我重启了三次（不同模板），名字池**完全相同**。Mose Jorvik 是 worker_8 也好 worker_68 也好，永远叫 Mose Jorvik，永远"mining specialist, hardy temperament"。这就让"我给他起名字"这件事彻底失去意义——我不是在和一个具体的人相处，我是在和**一个种子位的占位符**相处。在 RimWorld 里 Daize Dong 一旦死了就再也不会出现，他的死之所以重，是因为他不可替换。Project Utopia 里 Mose Jorvik 像 NPC 数据库里的 ROW 8，重置一下他又笑着站在 warehouse 门口，告诉我他还是个 mining specialist——尽管他这次被分配去砍木头了。

我尝试在脑子里给 Mose Jorvik 加私设：他失去了矿、被迫砍树、心里苦——但游戏没有任何一处文本支持我这个私设。我只是在给一份 .json 编辑梦境。

---

## 三、跟随 Mose Jorvik 5 分钟

我决定挑 Mose Jorvik 当我的"化身"，跟他 5 分钟，看他过得怎么样。

**第 0–60 秒**：他写着 `WOOD · Seek Task · hungry`。Backstory 是 mining specialist，但他被分到木工。这个错位本来可以是个故事钩子（"前矿工被迫上山砍树"），但游戏不给任何旁注，**Backstory 字段对实际行为完全没影响**。

**第 1–3 分钟**：状态机像挂在弹簧上的棒人——每隔几秒就在 Seek Task / Harvest / Deliver / Eat 之间切。他的 `Top Intents` 写着 "deliver:1.95 | wood:1.60 | eat:1.40"，Decision Context 写着 "Local logistics rule sees 1.60 carried resources, so delivery should outrank more harvesting"。**这是工程师写给工程师看的剧本**。我需要"Mose 累了，肚子咕咕叫，但他想先把那捆木头送到仓库再回家吃饭"，游戏给我"carry pressure has been building for 38.3s"。后者更准确，前者才是故事。

**第 3–5 分钟**：他的 Recent Memory 终于吐了三条事件：
- `[55s] Aila Grove was born at the warehouse`
- `[45s] Nira Pale was born at the warehouse`  
- `[42s] Became Friend with Ivo Inge`

我等了 5 分钟，他的"内心世界"一共记录了：**婴儿出生（在仓库里？！）+ 朋友升级**。没有他自己看见过的事，没有"我爱过谁"，没有"我害怕雨夜"，没有"昨天的篝火让我想起母亲"。Memory 是事件总线的 dump，不是回忆。"出生在 warehouse"这个文本本身就毁了氛围——这是一个把孩子当作 Stockpile 里掉出来的资源的世界。

5 分钟结束，我能讲出来的关于 Mose Jorvik 的故事是：**他叫 Mose Jorvik。他是个 WOOD。他和 Mose Hale 是朋友（因为彼此挨着站过 (3,-1)）。他从来没饿死过，也没遇见过狼。他可能不存在。**

---

## 四、游玩中最接近"故事"的瞬间

整场试玩里，最接近"故事"的两个 moment：

1. **Warehouse fire at (39,32)**（225 秒处的 toast），后来出现在了 Mose Jorvik 的 Recent Memory 里。这条记录有时间、有坐标、有事件，是它最像故事的一刻。但它是没有起因、没有后果、没有当事人姓名的纯系统通知——"仓库着火了。over."。然后日志里再也没出现"谁去救火"、"烧了多少粮"、"谁被烟呛了"。一段火光闪过，舞台暗下，演员们继续 seek task。

2. **Vermin swarm gnawed the stores**：又一个 toast。这种事件有"swarm"、"gnawed"这种词，是有作者用心写的，能撑起 1 秒钟的氛围。但同样是孤立事件，没有谁说"这是我第三次见到这种鼠灾"，没有 Mose Keane 因此变得 paranoid。

事件出现，事件结束，工人继续走他们的网格路径。氛围像一个施工现场偶尔放了一段背景广播。

---

## 五、氛围音乐与画面

**音乐**：没有。我打开 DevTools 检查 `<audio>` 元素和 AudioContext，**audios = 0**，AudioContext 类存在但从未被实例化。整个殖民地是死寂的。RimWorld 那种夜里淡入的钢琴，DF 那种鼓点 chiptune——一个都没有。鼠灾、火灾、夜幕降临、第一座厨房落成——全靠右下角 toast 的两秒淡出。这是叙事氛围最大的硬伤。

**画面**：地图是俯视 2D 网格，工人是约 12×12 像素的小人偶，没有面部、没有发色、没有衣服色差区分职业（我得靠 Entity Focus 列表判断 Mose 在哪里）。建筑有清晰的瓦片色块（farm 棕色、warehouse 红顶、kitchen 黄），辨识度不错，但**完全谈不上肖像或角色识别**。

地图上有"north timber gate"、"south granary"、"west ridge wilds"这种**场景名牌**漂浮在地形上，这是我最喜欢的设计——它给地图赋予了地名（"西脊野地"），让我在选位置时会心想"这是脊岭那边"，而不是"这是 (47,35)"。这是叙事潜力最大的一处。

地形 overlay 的分层（Fertility / Elevation / Node Health / 物流 Heat Lens）很多很专业，但都是数据图层，不是世界感。雾的边缘倒是给了一点"前线"的感觉。

---

## 六、AI Narrative 面板读后感

游戏里有"AI STORYTELLER"这个标签，第一眼我超级期待——莫不是 RimWorld 三巨头那种动态叙事 AI？

打开后，它写着：

> **DIRECTOR picks push the frontier outward**: The frontier is wide open, but the colony stalls fast if the west lumber line and east depot stay disconnected.

或者另一个状态：

> **DRIFT** autopilot: colony holding steady — awaiting the next directive

这……是**策略目标的复述**，不是故事。RimWorld 的 Cassandra Classic 也是一个调度器，但她的存在是不可见的——你只感受到她在"找你麻烦"。Project Utopia 的 Storyteller 把后台 prompt 直接挂在前台，不仅没有故事，反而提醒你这是个**未开机的 LLM 接口**。HUD 顶上还有一个永久的"Why no WHISPER?: LLM never reached / LLM quiet — fallback steering / LLM errored (error)"，全程在告诉我 AI 没连上。这种调试信息暴露在玩家面前——叙事浸入感被打了一拳。

打开 AI Log（"开发者面板"）后看到的内容：
```
AI: env=recovery lane | workers:rebuild the broken supply lane | traders:keep goods moving between warehouses | saboteurs:strike a soft frontier corridor
```
这不是故事，这是 protobuf。

---

## 七、关系系统与"死亡作为事件"

公平地说，Project Utopia **是**有关系系统的。Mose Jorvik 后期数据：
- Mose Hale: Close friend (+1.00) (because worked adjacent (-1,1))
- Pia Sable: Close friend (+0.90) (because worked adjacent (-1,-12))
- Mose Keane: Close friend (+0.75) (because worked adjacent (-1,-10))

这是基础的"近邻 → 好感度递增"模型。问题是它**只有正向**——我没看到任何 rivalry / dislike / lover / family。三个层级（Acquaintance / Friend / Close friend）也很浅。`(because worked adjacent (-1,1))` 这种括号里的解释暴露了机制本身——如果让 RimWorld 风格的玩家看到"因为站在(-1,1)"，他会哭笑不得。

**死亡呢？**这是一个真正的灾难。我在场上 8 分钟，故意大量 Erase 农田和仓库，引发饥荒，让 13 人增长到 49 人后又陷入食物 0、消耗 -287/min 的死亡螺旋。没有死亡通知。没有"Yara Thorn 在去仓库的半路饿倒"。Workers 数字一直涨——出生事件成串："Aila Grove was born / Nira Pale was born / Lio Glade was born / Evan Jorvik was born / Tam Glade was born"——这是出生轰炸。出生只标"at the warehouse"，没有母亲、没有父亲、没有家庭。整个殖民地像个克隆工厂。

死亡作为事件**不存在**——至少不存在于玩家可见的叙事层。这对 colony sim 来说是致命缺失，因为在这类游戏里，**死亡是故事的标点符号**。没有死亡，就只有源源不断的生产和繁殖，没有戏剧。

---

## 八、模板对比：Temperate Plains vs Hollow Keep / Silted Hearth

我玩了三个 scenario：
- **Broken Frontier**（Temperate Plains）："west lumber route / east ruined depot"
- **Silted Hearth**（Fertile Riverlands）："Last year's flood buried the west road under silt — rebuild the lumber line before the river runs dry"
- **Hollow Keep**（Fortified Basin）："The old keep's gates hang open — hold north and south before raiders find the breach"

这三段开场白**都写得不错**，每一段都有时间、有事件、有威胁。Silted Hearth 那句"last year's flood"特别带感——立刻有"这地方有过往"的既视感。Hollow Keep 的"gates hang open"+"raiders"也有戏剧感。

**问题是**：开场白之外，**这些设定在游玩过程中没有任何具体化**。Silted Hearth 没有任何"洪水回忆 / 河面浮木 / 河神祭祀"的事件；Hollow Keep 我玩到 8:41，**没等到任何袭击者**，那个"hang open"的门也没人来撞。开场白是**封皮上的诗句**，揭开后里面是同一本机制说明书。

不同模板的工人名单**完全相同**——Mose Keane、Pia Orr、Ilia Tull……同一个 12 人花名册。模板没有给角色染上任何色。在 RimWorld 里，"Lost Tribe"开局是树皮甲、矛和草药；"Crashlanded"开局是激光手枪和 MRE。Project Utopia 的开局只换地图色，工人复制粘贴。

---

## 九、我编出来的殖民地故事（如果能编的话）

我试一下，按照自己看到的素材编：

> *第 5 天，Hollow Keep。Mose Jorvik 还是个伐木工，尽管他童年学的是采矿。他的好友 Mose Hale 也是个伐木工——这片殖民地三个人都姓 Mose，谁也不记得为什么。仓库在第 4 天起了一场火，没人知道是谁点的；火灭之后第二天又有一群老鼠啃光了储粮。Mose Jorvik 站在西脊野地的边缘，看着北门——传说门已经歪了，但他至今没看见过袭击者。他的好友 Pia Sable 在身后挑水。新生儿 Tam Glade 在仓库里降生，没有母亲。Mose Jorvik 收下木头，转身回家，他的"carry pressure"已经建立了 23.6 秒。*

我能编。但请注意我编里面 80% 的细节是我自己的私货：
- "童年学的是采矿"——backstory 字段在游戏里只是一句标签，从不被叙事化
- "谁也不记得为什么"——名字是种子，殖民地里没人问这件事
- "没人知道是谁点的"——fire 事件确实没有归因
- "他的好友"——这是真的，因为关系数据存在
- "新生儿降生没有母亲"——这是游戏的真实表述（"born at the warehouse"，没母亲）

这段故事**靠 Project Utopia 给的素材撑不起 30 秒**。我编的部分都来自我对 colony sim 这个类型的预期。游戏本身只贡献了名字、坐标和一个"warehouse fire"toast。

如果我换个不熟悉这个类型的玩家（比如我妹），让她仅看 Entity Focus 面板和 Storyteller 面板，让她讲讲"Mose Jorvik 经历了什么"——她讲不出来。她只会说："他在送货，他饿，他有几个朋友，他今年很热。"

---

## 十、与 RimWorld / DF 的叙事对比

| 维度 | RimWorld | Dwarf Fortress | Project Utopia |
|-----|---------|---------------|----------------|
| 角色识别 | 头像 + 衣服 + 发色 + traits | ASCII 但每个矮人有独立外貌 | 像素小人，无个体辨识 |
| 关系图谱 | Lover / Rival / Family / Bond | 7+ 种关系，含血仇 | 仅 Acquaintance/Friend/Close friend |
| Backstory | 影响技能、无法改变、被叙事化 | 童年回忆、特殊偏好 | 字段存在但与行为无关 |
| 死亡 | 头像变灰 + 葬礼 + Mood 影响 | 详细遗物、死状、复仇 | 不可见 |
| 出生 | 母亲 + 父亲 + 命名仪式 | 完整家谱 | "born at the warehouse"，无亲缘 |
| 音乐 | Alistair Lindsay 的钢琴 | 鼓点 chiptune | 无音频 |
| 叙事 AI | Cassandra/Phoebe/Randy 主动制造剧情 | Toady's chaos engine | 关闭中（fallback steering） |
| 旁白 | 事件有作家口吻 | 事件被记录入殖民地传说 | DEBUG 风格："env=recovery lane" |

Project Utopia 在叙事上**比这两位前辈晚了一个时代**。它有数据基础（traits、relationships、memory、scenario），但在表达层（音乐、旁白、肖像、死亡仪式）几乎完全缺位。

---

## 十一、其他我注意到的细节

- **HUD 顶上常驻一行 "Why no WHISPER?: LLM never reached / errored / quiet"**——这是把内部状态怼到玩家脸上。叙事玩家最讨厌这种"看到 NPC 的 .ini"的感觉。
- **多次重置后游戏会把我踢回开场画面**（疑似按键事件冲突，我按 T 切 overlay 时几次直接 navigate 到了别的 template URL，run 被吞了）——这种丢档对叙事玩家是巨大伤害，因为我们和工人之间建立的 5 分钟感情说没就没。
- **"+11 more…"折叠**：Entity Focus 列表有个不能滚到底的省略号，我大殖民地后期 41 个工人，只能看到前 20 个。**叙事玩家就是要在 41 个里翻找那个被冷落的小角色**——折叠等于剥夺。
- **Decision Context 文本风格混乱**：一会儿是英文工程语 "Local logistics rule sees 1.60 carried resources"，一会儿又是半人话 "Cargo is accumulating"。如果统一成"工人觉得肩膀沉了，想先回去卸货"这种叙事风，故事感会立刻提升。
- **唯一让我笑出声的瞬间**："born at the warehouse"——这个游戏诞生的方式是从仓库里掉出来。如果是有意的反乌托邦设定（殖民地是个克隆工厂），那它没有任何叙事支撑；如果是 placeholder，那就太懒了。

---

## 十二、评分与总结

**评分：3 / 10**

打分理由：
- **+1 / 10**：关系系统、Backstory 字段、Memory 字段、Scenario 开场白、地名标签——基础设施其实搭好了，**比绝大多数 colony sim 的"无名工人 NPC"已经领先一截**。
- **+1 / 10**：12 人名字池虽然重复，但发音风格统一，有一定异世界氛围。Mose Jorvik / Kess Pale 这种名字单看是有"人感"的。
- **+1 / 10**：Warehouse fire / Vermin swarm 这两个 toast 事件的措辞是有作者用心的，证明开发组**有叙事意图**，只是落地非常薄。

但与此同时：
- **-1**：Backstory / Traits 与角色行为脱钩，背景纯装饰
- **-1**：名字池写死、跨开档复用，毁掉"专属感"
- **-1**：死亡作为叙事单元基本不存在
- **-1**：出生事件机械化（"at the warehouse"，无亲缘）
- **-1**：AI Storyteller 是个工程标签，不是讲故事的人
- **-1**：完全没有音乐 / 音效 / 环境音
- **-1**：HUD 长期暴露 LLM 错误信息，破坏沉浸
- **-1**：工人视觉无个体识别，41 个人长一样

**一句话总结**：Project Utopia 把"叙事所需的数据骨架"立起来了——名字、关系、记忆、剧本——但没有任何一处把这些数据**翻译成情感**。我玩完五分钟，能背出 Mose Jorvik 的 Mood / Morale / Hunger / Rest 数值，能复述他三个朋友的好感度小数点，但讲不出他是个怎样的人。这就像看了五分钟一个 Excel 表格，每一行都标着"人"，每一行又都不是。这游戏需要的不是再加 100 行 traits，而是一个**叙述者**——一个会用人话讲"Mose Jorvik 今天又把木头送回去了，他想着 Pia Sable 等会儿会不会还在水井那"的旁白人。在那之前，它只是 RimWorld 的兄长留下的骨架，骨架上还在长着东西，但还没有血。

我合上浏览器，没有哪怕一个工人的名字让我想再回来。这就是我对一个 colony sim 最坦诚的判分。
