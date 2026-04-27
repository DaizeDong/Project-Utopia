# Project Utopia —— 一个角色扮演玩家的深度游玩报告

评测者：第四位外部玩家（"叙事/角色扮演型"）
日期：2026-04-22
版本：v0.8.1（页面标题显示为 Project Utopia，构建为 "Living World" 线）
游玩时长：约 55 分钟真机交互；模拟内至少跨越 5 个模板 / 300+ 秒 sim 时间

---

## 身份自述

我玩殖民模拟，不是为了"最优解"。我玩它，是为了等那一刻：RimWorld 里最后一个老兵靠着半塌的石墙向海盗扔最后一颗手雷；Dwarf Fortress 里矮人"Urist McMiner"在暴风雪里冻死在回家的 3 格外的走廊上，她老婆在公共餐厅吃完最后一顿杂烩之后拎起斧头去劈了那扇门。

我要**名字**，要**关系**，要能在心里给小人编出一段悼词的**素材**。我不介意数字化的 HP/Hunger/Sabotage Cooldown，但如果一款殖民模拟不能让我"给工人起名字"，它在我心里就永远过不了 5 分。

今天我第一次打开 Project Utopia。`127.0.0.1:5173` 一打开，音响里——**沉默**。没有任何前奏，没有风声、鸟声、伐木咚咚声。游戏一上来就是 UI。我已经开始心生警惕：一个殖民模拟如果开场没有哪怕一首三音符的 ambient 钢琴，它想让我"入戏"就得付出几倍的努力。

---

## 我试着给工人起名字

第一眼看到 13 个小像素人在 "Broken Frontier" 的断壁残垣之间跑来跑去，我挺期待的——场景标题叫"破碎边境"，子标题"frontier repair"，目标是"Reconnect the west lumber line, reclaim the east depot, then scale the colony."（重连西侧伐木线，夺回东侧仓库，再扩张殖民地）。这个文案不坏，有 BattleBrothers 那种"灰暗边境重建"的味道。

但接下来就冷了下来。

我打开右下角的 **Entity Focus** 面板，它写着"No entity selected. Click any worker/visitor/animal."。我在废墟里圈出一个抱着草捆的小人，点下去——没反应。原来左键是建筑模式。我按了几次 Esc、按 `0`、按 `L`（Heat Lens），总之折腾了一分钟后才想出办法让那个小人显形。

在我把工人拉出焦点面板的一刻，我看到的信息流是这样的：

> **Worker-122 (worker_122)** — Type: WORKER | Role: WOOD | Group: workers
> State: Seek Task | FSM: current=seek_task prev=eat | AI Target: seek_task | TTL: 14.8s | Priority: 0.60
> Vitals: hp=100/100 | hunger=0.725 | alive=true
> Carry: food=0.00 wood=0.00
> Path: idx=1/2 | next=(47, 25)
> ...
> （再往下是 Policy Exchange、Prompt Input: System、Raw Model Content 等等——这是开发者 dump，不是一张角色卡）

叫 **Worker-122**。这就是它的名字。

没有"Kira"，没有"Halden"，没有"那个总和姐姐吵架的伐木工"。它有 traits —— `["swift", "careful"]`——但这四五个词我在 20 分钟内看遍了全部（swift/careful/hardy/efficient/social/resilient）。这些更像"属性修饰词"，不是"人格缺陷"。没有 RimWorld 的"pyromaniac 纵火癖"、"kind psychopath 温柔精神病"、没有 DF 的"她不喜欢玄武岩，却爱鹤的影子"。

我只能在心里给她起名字。我叫她 **Vera**。我决定跟她 5 分钟。

*（后来我发现，Vera 在大概第 80 秒就饿死或被换了——因为我稍微动了一下设置面板，整个地图重置，Vera 消失了。这个游戏的 Settings 面板似乎是"一碰就重启世界"的设计，对于想长线追踪一个角色的玩家来说，这非常致命。我被迫在第二张地图上选了 Worker-156 做替身，我还是叫她 Vera。）*

---

## 游玩中最接近"故事"的瞬间

我翻遍了这个游戏的所有 surface-level 反馈，**最接近"故事"的文字**是这几段：

1. 顶部中央的一条临时横幅：
   > "Emergency relief stabilized the colony. Use the window to rebuild routes and depots."
   > "Supply-chain heat lens On"
   > "Insufficient resources."

2. 右侧 AI Trace 面板里每几秒刷新一次的 **Narrative** 字段（这是我能找到的唯一叫 "Narrative" 的东西）：
   > Restore harbor relay causeway | Bridge the harbor relay causeway with roads.
   > AI: env=stabilization | workers:route repair and depot relief | saboteurs:soft frontier corridor hits | traders:defended warehouse lanes

3. Objective / Event Log 面板（侧边最右）：
   > "No event/diagnostic logs yet."（是的，跑了 5 分钟之后还是这句话。它里面偶尔唯一会出现的是：）
   > "[4.1s] Emergency relief arrived: +24 food, +12 wood, threat -8."

4. 通过 Debug 面板深挖到的 **eventTrace**（这是"真正在发生的事"）：
   > [161.6s] Worker-218 died (starvation).
   > [159.2s] Worker-239 died (starvation).
   > [158.5s] Worker-240 died (starvation).
   > [125.3s] sabotage resolve -> cooldown target=farm belt p=0.93
   > [123.3s] Herbivore-206 died (predation).
   > [79.7s] sabotage active -> resolve target=central relay depot p=1.01

请注意最后这一组。这是**三个工人**在 3 秒内相继饿死，在暴风雨（storm）季节、在"farm belt"上被连续破坏之后的瞬间。在一个好的殖民模拟里，这应该是该局游戏的高潮——至少应该在屏幕中央弹一个黑底白字："**Three colonists died of starvation as the autumn storms hit the farm belt.**" 然后暂停游戏，给我一秒钟情绪缓冲。

但 Project Utopia 里——**屏幕上什么都没发生**。`objectiveLog` 仍然只有那一条 "Emergency relief arrived"。Event Log 面板仍然是"No event/diagnostic logs yet."。工人的像素小人只是从 sprite 列表里被静静移除了。没有"黑色标点"落在地上（RimWorld 会给尸体画 X），没有墓碑，没有红色弹窗。我是点进 Debug > World State 里发现 `Deaths 3 (starve 3 / pred 0)` 这个数字变了，才知道发生了什么。

**它在后端有戏，但它不讲给我听。**

我尝试主动制造戏剧——把 `state.resources.food` 手动设成 0——但地图又被重置了（这个游戏对任何看起来像"开发者干预"的行为都用重置世界来惩罚你，很奇怪的设计选择）。

最接近叙事张力的视觉瞬间，是我在 Coastal Ocean 地图上看到一队 Saboteur（破坏者访客）移动到仓库附近，同时一个 Worker 正从内陆往外跑——两个绿色光圈互相错过，几秒钟后 `sabotage active -> resolve target=warehouse p=0.93` 出现在 trace 里。

如果这一刻有音效——一声警报、一声远处的铁器碰撞——我可能就入戏了。

它没有。

---

## 氛围音乐与画面

我搜索了整个 DOM，确认了：
- `document.querySelectorAll('audio').length === 0`
- 没有音乐开关、没有音量条、没有"让玩家点一下才播放"的沉默 CTA
- `AudioContext` 这个 API 是浏览器自带的，但游戏本身**完全没有使用任何音频**

**零音乐，零音效，零环境声。**

这对一个"叙事型玩家"的打击是毁灭性的。Dwarf Fortress 的 chiptune 虽然粗糙，但开场那首竖琴 + 低音弦的 loop 是一种情绪烙印。RimWorld 的乡村吉他和西部小号，Banished 的教堂钟声，甚至 Kenshi 那永远在风沙里嘶嘶作响的环境噪音——它们是让你接受"这个世界是真的"的第一层契约。Project Utopia 从视觉到数据都在努力建模一个世界，但它的**声音接口是死的**。我玩了 40 分钟，最大的一次"情感波动"是浏览器标签页标题显示 "Project Utopia" 这几个字母。

再说画面。

视觉风格是**像素风扁平俯视**。6 个地图模板的地形差异做得不错——Archipelago Isles 真的是零碎小岛漂在蓝色大海里，Fortified Basin 是深绿高原上的一个盆地防御阵，Coastal Ocean 东边一整条海岸线。**这一点值得表扬**：当我切到 Archipelago 时，我真的"啊"了一声。

但是：
- 白天黑夜不变。我看了 300+ 秒没看到光照循环。
- 天气切到 **storm**（debug 告诉我的）、季节切到 **autumn**（debug 告诉我的）——屏幕上没有任何视觉变化。没有雨丝，没有云影，没有叶子变黄，没有风吹过草地。`hazardTiles` 在 debug 里罗列了几十个被风暴影响的瓷砖，但在画面上它们看起来和晴天一模一样。
- 工人只有三四种 sprite（带锄头的、带斧头的、空手的、背箱子的）。不同 trait、不同心情的工人长得完全一样。
- 没有情绪 emote（没有小汗滴、没有愤怒感叹号）。
- 尸体不渲染。死了就消失。

画面服务的是**系统状态可视化**，而不是**情感代入**。它像一个战术沙盘，不像一个家园。

---

## AI Narrative 面板读后感

这是我最期待的一章，也是最失望的。

游戏有一个 **AI Trace** 面板，一个 **AI I/O** 面板，一个 **AI Decisions** 面板，还有一个 **Strategic Director** 系统。我原以为这就是"LLM 来写故事"的窗口。

然而：

1. `source: fallback | model: fallback | Warning: AI proxy is unreachable; running fallback.`
   整个会话里，LLM 从未联通过。所有的"AI"都是**本地回退策略**。

2. 所谓的 "Narrative" 头部，内容是：
   > Restore harbor relay causeway | Bridge the harbor relay causeway with roads.
   > AI: env=stabilization | workers:route repair and depot relief | saboteurs:soft frontier corridor hits

   这不是叙事，这是 **军事简报格式**。它写给一个总参谋长看。它告诉我"工人正在做路线维修和仓库救援"，不告诉我 Vera 走到了哪一块 farm、为什么她犹豫了一下、她饿不饿、她旁边那个 hardy 的 Worker-189 是不是她哥。

3. 最诡异的是 `AI I/O > Policy Exchange > Prompt Input: User`——它把正准备发给 LLM 的 prompt 完整打印出来了。里面是结构化 JSON：
   ```
   {"channel":"npc-policy","summary":{"world":{"simTimeSec":60,"resources":{"food":83.72,...}},"population":{"workers":18,"visitors":4,...},"scenario":{"id":"alpha_broken_frontier","title":"Broken Frontier","family":"frontier_repair"}}}
   ```
   也就是说，**这个游戏的"AI"设计目标是让 LLM 决定"工人的宏观策略"**（该伐木还是该回仓库），而**不是让 LLM 讲故事**。"Narrative" 这个词在它的词汇表里约等于"战略简报"。

4. Strategic Director 的输出永远是 4 行：env + workers + saboteurs + traders + predators。它是一个状态机，不是一个叙事生成器。

我深挖到代码级的数据（工人对象内部），确认 Project Utopia 的底层数据结构**其实支持叙事**：
- 工人有 `traits`、`skills`、`mood`、`morale`、`relationships`、`memory.recentEvents`、`memory.dangerTiles`。
- Worker-194（在我后期的一局里）和 30+ 个其他工人都有 `relationships` 条目，其中最高值 0.55 —— 这是一段"中等好感"。
- 访客明确分 `Trader` / `Saboteur` 两种身份，前者带商队来，后者来搞破坏。

**骨架都在**。但 UI 层不把这些当故事讲。Entity Focus 不显示 traits、mood、morale、relationships、memory——它只显示 FSM state、policy source、path recalc count 这种给调试用的东西。`memory.recentEvents` 在我观察的整整 5 分钟里长度都是 0——不是没人死，是系统从来没往里写过任何条目。

这是一个**把 DF/RimWorld 的数据搭好了、却忘了安上"讲述者"的游戏**。

---

## 我编出来的殖民地故事（如果能编的话）

我尽量。

> 深秋的某个暴风雨之夜，Broken Frontier 边境殖民地的"central relay depot"中央中转仓被敌人连续打击了三次。三个工人——218、239、240——在同一分钟内相继倒在了 farm belt 上。谁也不知道他们的名字，也没人认识他们的面孔。殖民地的无线电（其实没有无线电）没有播报。事件日志里只写着一行：Emergency relief arrived, +24 food, +12 wood, threat -8。那一条还是几分钟前播的。

> 老 Worker-194 ——在统计里她和 33 个同伴有关系值——也许是他们中某人的好友。但她不知道。她只是继续走她的路径：pathIndex 1/2, next (47, 25)。FSM 状态：seek_task。TTL: 14.8 秒。

> 暴风雨在 11.7 秒后结束，太阳（其实是永远不变的 ambient light）照常升起，saboteur 的 cooldown 是 62 秒，trade caravan 将在 24 秒后重新 spawn。殖民地继续。

说实话，我**编不出真正的故事**。我编出的是"一个系统日志的拟人化 paraphrase"。因为游戏给我的素材全是数字和 FSM 状态，没有一个具体的**瞬间**有**意义**。

RimWorld 里我能编："Aurora 在她的婚礼当天被一只疯狼咬掉了一条腿，她的新郎 Bjorn 在第二天出门打猎时'意外地'射杀了那只狼又射杀了他自己。殖民地的吟游诗人 Kael 把这件事写成了一首叫《狼婚》的悲歌，后来每次有狼从边界出现，Kael 都会躲进地窖。"

Project Utopia 里我能编："Worker-239 died (starvation) at [159.2s]. sabotage active -> resolve target=farm belt p=0.93 at [133.8s]."

---

## 与 RimWorld / DF 的叙事对比

| 维度 | RimWorld | Dwarf Fortress | Project Utopia |
|---|---|---|---|
| 工人命名 | 自动生成 + 手动改名 | Urist McMiner 风格自动生成 | "Worker-122"（纯数字 ID） |
| 人格 Traits | 30+ 组合，常互相矛盾 | "prefers basalt, hates trout" 级别的细节 | 6 个形容词（swift/careful/hardy...） |
| 关系 | 爱人/夫妻/兄弟/仇敌，有关系故事 | 朋友/孩子/公婆，完整家谱 | 数字 0.05~0.55，无语义标签 |
| 情绪 | Mood 触发事件（暴怒、崩溃、写诗） | Thoughts 系统（"她喜欢鲜艳的蓝色"） | mood/morale 数字无反馈 |
| 记忆/日志 | Message Log + 弹窗 + 图标 | Legends + 历史事件 | objectiveLog 通常空，eventTrace 纯机械 |
| 死亡仪式感 | 墓碑、讣告、幸存者 mood debuff | 棺材、魂灵、传说 | sprite 消失，无提示 |
| 环境叙事 | 天气 + 光影 + 音乐 | 即使 ASCII 也有 $ ¤ ° 等季节符号 | 画面完全静态，0 音频 |
| 涌现戏剧 | 频繁（动物复仇、社交爆炸） | 疯狂（吸血鬼、神鬼、爱神附身） | 几乎没有；底层数据有，上层沉默 |

Project Utopia **在系统层面是有野心的**——它有 Strategic Director、有 Environment Director、有 LLM hooks、有 Memory Stream、有 hazardFronts 带语义标签（"harbor relay causeway"）——这些都是好东西。但**所有东西都停留在 telemetry 层**。没有一个"叙事中间件"把 "[161.6s] Worker-218 died (starvation)" 翻译成"暴风夜里，Worker-218 在最后一块空荡荡的农田上倒下。他今天的最后一次移动是朝着 (45, 33) 的中央仓库，他没走到。"

LLM 的存在会是救赎吗？也许——如果那个 AI proxy 真的联通，Prompt 的结构（已经包含完整的 scenario、events、resources）是可以生成漂亮叙事文本的。但我游玩期间**从未**看到 LLM 回复进入画面。全程 fallback，全程模板式输出。对一个在 2026 年 4 月发布的作品来说，这像是"把舞台搭好但没点灯"。

---

## 评分与总结

**总分：3 / 10**

详细打分（10 分制）：
- 命名与人格：**1** —— Worker-122，swift+careful，仅此而已
- 关系与家庭：**2** —— 数据存在，UI 完全不暴露
- 情绪表达：**1** —— mood/morale 在后端跳动，在前端静默
- 事件叙事：**2** —— eventTrace 里有事件，objectiveLog 空，无通知
- 环境氛围（画面）：**4** —— 6 个地图差异明显，但天气/昼夜/季节无视觉表达
- 环境氛围（声音）：**0** —— 完全无音
- LLM Narrative 承诺：**2** —— 架构存在，fallback 永远不会写故事
- 手动制造戏剧的乐趣：**2** —— 游戏抗拒干预，Settings 一碰就重置
- 和 RimWorld/DF 的距离：**3** —— 系统基础有了，灵魂还没注入

**一句话总结**：这是一款"把殖民模拟写成了供应链 dashboard"的作品——后端有工人的性格、关系、记忆，但 UI 上只给你看 FSM 状态和 pathIndex；有暴风雨和破坏者袭击，但没有音效、没有通知、没有讣告；它技术上可能比 90% 的同类完整，叙事上却比 90% 的同类更冷。

**给开发者的两句建议**（我这个角色扮演玩家版本的）：
1. 把 `memory.recentEvents` 真的写进去，把 `eventTrace` 里的工人死亡翻译成"Worker-218 died alone on the farm belt during the autumn storm"，放进那个永远空着的 Objective / Event Log 面板。仅此一步就能从 3 分涨到 5 分。
2. 加上一段 8-bit loop 的环境音，哪怕是 8 秒循环的单竖琴。这是差 0 分和 2 分的距离。

我合上浏览器标签的时候，心里留下的唯一人物，是**那个我自己叫她 Vera 的 Worker-122**。她没存在过，因为游戏重启了三次。她是我给自己的礼物——不是 Project Utopia 给我的。
