---
reviewer_id: 02d-roleplayer
round: 2
date: 2026-04-22
score: 3
verdict: 机制丰富但叙事贫瘠——有"角色卡"没有"人"，有死亡没有故事。
---

# 角色扮演玩家视角评测 — Project Utopia (Round 2)

## 第一印象：一个安静的、被 503 驱动的乌托邦

我点进 http://127.0.0.1:5173 的瞬间，看到标题 **"Broken Frontier — Reconnect the west lumber line, reclaim the east depot, then scale the colony."** 这句话写得挺硬派——有"破碎的边境"、"被废弃的东部仓库"的背景设定，一下子把我拉进"战后拓荒者"的氛围。我心想："不错啊，像 Firefly + RimWorld 的前置剧情。"

我挑了最基础的 Temperate Plains，按 Start Colony。镜头落下，一个正方的、扁平的俯视图出现——9×12 格左右的小聚落已经搭好，四周是水、草和几块灰色墙体。工人是几条几乎不能辨识的小茎型像素，白色的"齿轮花"图案飘在远处（后来我才知道那是牲畜 Herbivore）。**画面朴素到几乎没有美术语言**，像一份未上色的游戏原型。

然后我立刻注意到两件事：
1. **没有任何声音。** 我特意检查了 DOM，整个页面 `<audio>` 元素数量是 0。没有鸟鸣、没有斧头伐木声、没有远处的教堂钟——这对"讲故事"这种事是致命的。RimWorld 开场那段吉他，DF 那种诡异的 tick-tock MIDI，这些是把玩家"扣进"情绪的第一个钩子。Project Utopia 选择了沉默。
2. **顶部居然有叙事语气标签。** 右上角有个小标签在 `WHISPER / DIRECTOR / DRIFT` 之间切换，还配了句"The colony breathes again. Rebuild your routes before the next wave." 这种"殖民地又呼吸了"的拟人化句子让我眼前一亮。翻查 Help 的 "What makes Utopia different" 标签才明白：WHISPER = 真 LLM 在说话、DIRECTOR = 规则 fallback、DRIFT = 闲置。

悬念很快破灭——Debug panel 里的 AI Trace 毫不掩饰地告诉我：**`Error: OpenAI HTTP 503: No available channels for this model`**，每隔几分钟一次。整场 run，LLM 从没接通过。我看到的所有"叙事"，都是 fallback 规则生成的模板句子。这意味着我体验到的"故事感"只是这个游戏愿景的地板版。

## 我试着给工人起名字——但他们已经有了

我的惯例是给重要工人起 RimWorld 式的绰号："斧头 Betty"、"矿洞老齐"、"那个总是先去吃饭的馋胖子"。Project Utopia 没让我给工人命名，但是——我点开一个工人之后，它已经有了名字：

> **Tam-9 (worker_9)**
> Backstory: cooking specialist, social temperament

**Tam-9**。不是 Tamara、不是 Tammy，是 Tam-**9**。这个连字符加数字的命名法像极了实验室小白鼠的编号。每个工人死的时候，消息是 `[354.5s] Vian-23 died (starvation) near (31,42)`、`Ren-5 died`、`Luka-6 died`、`Dax-7 died`、`Mose-1 died`、`Talon-24 died (starvation)`——听起来像是批量交付的克隆兵阵亡报告。

我点击 Entity Focus 查看 Tam-9 的全部信息（要试五次才点中，因为 hitbox 非常小，游戏甚至会冒出 toast "Click a bit closer to the worker (hitbox is...")：

- **Traits: social, resilient**
- **Mood: 0.45 | Morale: 0.48 | Social: 1.00 | Rest: 0.19**
- **Relationships: Luka-6: +0.25 | Vian-11: +0.20 | Ren-5: +0.15**
- **Recent Memory: (no recent memories)**
- **Policy Focus: route repair and depot relief**
- Hunger: Hungry (36% well-fed)

这是一份极其丰富的角色卡——traits / mood / morale / social / rest 四个轴，还有羁绊值，还标注了"社交 / 坚韧"的性格。比 Dwarf Fortress 的 dwarf sheet 差一截但已远超 Banished。问题是：

**Recent Memory 永远是 `(no recent memories)`。**

这是整个游戏叙事层的致命伤。一个角色扮演玩家需要什么？需要工人会"记得上周的暴风雨"、"还记得那次矿难里 Luka 救了他"、"记得 Ren-5 是他最好的朋友"。Tam-9 的关系表写着 **Ren-5: +0.15**——但当我在同一张地图的前 10 分钟里看到 `Ren-5 died (starvation)` 的时候，Tam-9 没有任何反应。Mood 没有暴跌、Morale 没有破碎、Memory 没有多一行"Ren-5 死于饥荒"。

**系统知道"Ren-5 死了"（死亡日志明确写了），系统知道"Tam-9 和 Ren-5 关系 +0.15"（羁绊表明确写了），但系统没有把这两点连起来讲一句话。**

这是一行 `if` 能写出来的"故事"，游戏没有写。于是 Tam-9 在 Ren-5 死后继续毫无情感地砍树、Mood 从 0.64 滑到 0.45 只是因为饥饿，和朋友无关。

## 游玩中最接近"故事"的瞬间：14 个饥饿亡灵与一张永远不动的剑

第一张 Temperate Plains 跑到 13 分钟的时候，我已经见证了 21 个工人死亡（18 饿死 / 3 被捕食）。这些死亡本身是有戏剧的素材——食物从 110 爆跌到 0，Food -237.8/min，工人从 20 锐减到 8。我一直在 4x 快进看灾难展开，而 DIRECTOR 切换成了 **DRIFT — "autopilot: colony holding steady — awaiting the next directive"**。

"autopilot: colony holding steady" ——这句话放在 14 人饿死的时间节点上，荒诞得有种冷幽默。它说"殖民地 holding steady"，同时尸体在 (3,56)、(44,28)、(31,42) 各处。一个好的叙事引擎这时该说："The colony is bleeding. 14 graves this week. We cannot feed our own."

游戏做不到。它只会不变地重复：`route repair and depot relief`、`frontier buildout`、`stabilization`——这些是策略术语，不是故事语言。

同时我注意到地图中央有一把 **剑**（sword sprite）永远插在那里，旁边是几块肉。我原以为是战斗痕迹或者"某位老兵阵亡处"的标记——这是 DF 风格的地景故事，那种"一把生锈的剑立在矮人曾经倒下的地方"的物哀。但进一步观察，剑只是 **Tools 资源图标**。肉只是 **食物资源图标**。它们没有故事，只是物品堆。一件资源就是一件资源，不带情绪。

最接近"故事"的一个瞬间出现在 Debug Panel 里："**Trade Caravan active (6.3s) east ruined depot...**"。有个商队来了！这对一个 RP 玩家来说是兴奋的——陌生人来访、交易、可能触发事件。但我点过去看它，就只是一个"环境事件计时器"，没有商队的名字、没有他们带来的 item 展示、没有"他们的家园在哪里"的背景。它只存在 6.3 秒然后消失。Saboteurs 2 / Traders 2 也是纯数字。

**这些事件发生了，但没有人讲它们的故事。**

## 氛围音乐与画面：无声的像素沙盘

美术风格是极简平面像素，整张地图大概 10 种颜色——绿、蓝、沙色、深棕、几个亮点的红和紫。建筑是 32 像素的小方块图标。工人是一条细条的像素茎。动物是白色的"齿轮花"。所有元素都**没有动画帧**（除了位移），人不会抬手砍树、不会弯腰采食物、不会举手招呼——他们就是**平移的贴图**。

这种风格如果配上强烈的氛围音乐（比如 Banished 那种寒冷的竖琴、RimWorld 那种潜伏式的太空西部吉他），能瞬间升华成"冷峻的生存寓言"。但 Project Utopia 选择完全静音。我打开浏览器 8 分钟，一点声音都没有，这让画面的"空"显得更空。

PressureLens 的 Heat Lens 按下 L 后能切换"压力 → 热度 → 关闭"——红色代表生产者溢出、蓝色代表加工者挨饿。这是**极好的信息可视化**，但不是叙事工具——它告诉我系统哪里堵，不告诉我工人感受如何。

我也想称赞一下地图的 seed 叙事标记：`Map: Temperate Plains (seed 1337)`——但我切换到 Fortified Basin 模板后，地图看起来**几乎完全一样**（同一片绿草、同一条河、同一个聚落），场景标题依然是"Broken Frontier — Reconnect the west lumber line"。这证明**整个游戏只有一个场景**，六个地图模板只换了地形参数，不换故事。这极大削弱了"换个模板重开"的驱动力。

## AI Narrative 面板读后感：策略参谋，不是说书人

AI Trace 的 **Narrative** 模块本该是游戏讲故事的心脏。我在 Debug Panel 里读到的一条实例：

> **Narrative:** Reconnect 1 isolated worksite | At least one worksite is outside depot reach, so route repair should outrank more expansion.
> **AI: env=recovery lane**
> **Warning focus:** Logistics: no warehouse anchors online.

这不是"Narrative"，这是**战术 briefing**。语气像一个参谋长在给 CO 汇报生产瓶颈，而不是一个说书人在讲"Tam-9 今晚又饿着肚子入睡"。

再看 AI I/O 面板暴露的 Prompt：

> You produce group strategy policies for a sandbox simulation. Return strict JSON only.

**Return strict JSON only** ——这一行道出了整个叙事设计的选择：游戏把 LLM 当成一个 **policy function**，不是一个 **storyteller**。LLM 被叫来生成 `{"workers": "seek_task", "predators": "hunt"}` 这种机器指令，而不是"今天北方来了一场雪，Tam-9 蜷缩在空仓库里等他的兄弟 Ren-5 回来，但 Ren-5 永远不会回来了。"

这是**设计方向的选择**，是可以理解的——叙事 LLM 成本高、出错风险高、一致性难保。但作为角色扮演玩家，我看到的是一个用 LLM 做调度器的优化工程，而不是讲故事的机器。

## 我编出来的殖民地故事（试着编一下）

让我硬写一段："在 Broken Frontier 的第十三分钟，食物线断裂。西线伐木工 Talon-24 最先倒下，倒在 (44, 28)。他的工友 Ren-5 走向自己曾经走过的路径试图回仓库，但路径不通——`starvation:unreachable`。Vian-23 死在 (31, 42)。Dax-7 死在 (3, 56)，那已经是地图边缘。最后 Luka-6、Mose-1、Ren-5 相继跟上。Tam-9 活下来了，他曾经和 Luka-6 的关系值是 +0.25——他们可能一起烤过肉、一起在暴雨夜里缩在仓库角落；但我们永远不知道，因为 Tam-9 的 Recent Memory 永远写着 `(no recent memories)`。"

**这段故事是我凭着地图坐标和死亡日志硬编的，不是游戏讲给我的。**

游戏提供了"素材"：名字（虽然是 "Name-数字" 格式）、死因、关系值、坐标。但它没有提供"讲述"：没有悼词、没有存活者的反应、没有日记、没有墓地、没有"这是第 X 次我们失去伐木工"的叙事弧。

而这些"讲述"在 RimWorld 里是默认配置：雷诺·兰德尔（Randy Random）会生成一段消息"Tam has lost a close friend and is devastated"，会给 Tam 加上 -15 mood buff、命名 "Grief: Luka" 持续 3 天，Tam 可能会躁狂、可能会孤立自己。在 DF 里矮人会跑到神庙"刻一块纪念碑 in memory of Luka, who starved in the Year 512"。

## 与 RimWorld / DF 的叙事对比

| 维度 | RimWorld | Dwarf Fortress | **Project Utopia** |
|------|----------|----------------|---------------------|
| 工人命名 | 完整名字+姓 | 完整矮人名+绰号 | **"Tam-9" 实验室编号** |
| 背景故事 | 多段式 backstory（幼年/成年/传说） | 完整年表、爱好、喜恶 | **一行 "cooking specialist, social temperament"** |
| 情感反应 | 20+ mood modifier，有事件名 | 100+ emotional states | **4 个滑条数字，无事件** |
| 死亡叙事 | Story teller 专门播报 | 诗化记录入历史 | **`Vian-23 died (starvation) near (31,42)`** |
| 关系网 | 家人/恋人/仇敌/导师 | 完整社交图谱 | **数字 +0.15，无语义** |
| 记忆系统 | Ideology / 信念、梦 | 艺术创作反映经历 | **Recent Memory: (no recent memories)** |
| 音乐/音效 | Pre-meditated soundtrack | 环境声+tick | **完全静音** |
| 场景叙事 | Randy Random 生成事件 | 神话/传奇 worldgen | **只有一个场景硬编码** |

## 缺失清单（按角色扮演玩家优先级）

1. **Memory 系统是空的。** 这是最严重的。"Recent Memory: (no recent memories)" 在所有工人身上看到的都是这句。
2. **名字是 "Name-数字"。** 没有姓、没有绰号、没有诨名。
3. **死亡只有一行日志。** 没有讣闻、没有共情触发、没有墓碑。
4. **关系值没有语义化。** "+0.25" 是什么？ 朋友？ 师徒？ 爱人？ 不知道。
5. **没有音乐音效。** 画面的沉默让空旷变得死寂。
6. **只有一个场景。** 6 个地图模板共享同一段 "Broken Frontier" 剧情。
7. **LLM 全程 503，fallback 句子模板化。** Director 说的永远是 "route repair and depot relief" 这类术语。
8. **Narrative 面板是战术简报，不是故事面板。**
9. **工人动作无动画。** 砍树、挖矿、进食看不出区别。
10. **坐标信息未被叙事化。** `died near (31,42)` 应当至少变成 `died near the east river bend`。
11. **Trade Caravan / Saboteur 等访客无个体。** 他们就是 Visitors: 4。
12. **Prosperity / Threat 数值不触发故事拐点。** 应该在 Threat > 20 时说 "The colony feels unsafe tonight."

## 能编的优点（被我的评分压制但不该无视）

- **叙事语气标签（WHISPER/DIRECTOR/DRIFT）的设计意图很好**。这是一个承诺——承诺游戏愿意在不同状态下切换语言风格。如果 LLM 真的能接通、fallback 文本写得更文学，这个标签会成为杀手锏。
- **Entity Focus 的信息密度很高**。Mood / Morale / Social / Rest 四维 + Traits + Relationships + Policy Focus + Carry + Path + AI Exchange 全在一个面板里。我作为 RP 玩家很愿意盯着它看 5 分钟。
- **死亡分类 `starvation:unreachable`** 这种数据化标签如果转成故事，就是"他被困在路的那头无法归来"——素材就在那里，差一个 narrator。
- **场景目标 "Reconnect the west lumber line, reclaim the east depot" 本身是有故事味的**。只是它是单一静态的，一旦开局就重复。

## 评分理由

**3 / 10**。

- +2：有 Entity Focus、有 Backstory 一行、有 Traits 关系网、有场景标题。基础骨架是立起来了。
- +1：DIRECTOR/WHISPER/DRIFT 标签的设计意图、AI Narrative 面板的存在（哪怕只是战术 briefing），让我能感觉到"开发者想要叙事"。
- -2：LLM 全程 fallback（503），我体验的是底板不是地板。fallback 句子高度模板化。
- -2：核心 Memory 系统完全为空 —— 这是 colony sim 叙事的命门。
- -1：零音频。整场体验静默。
- -1：只有一个硬编码场景。六个模板没有差异化剧情。

**默认分不高于 4/10** 是我给 colony sim 的底线要求——RimWorld 和 DF 太难追赶了。Project Utopia 在工程侧做了很多扎实的工作（资源链、路径系统、Pressure Lens、AI 决策回路），但它在"讲故事能力"上**刚刚起步**：骨架有了，血肉没填上。

一个 RP 玩家不会为"系统稳定"打分，只会为"我能不能讲出故事"打分。**我今天编不出我自己的殖民地故事——因为游戏没给我素材**。它给了我尸体列表，没给我悼词；给了我羁绊值，没给我朋友；给了我名字，没给我姓氏；给了我 Mood 滑条，没给我情绪。

如果下一个版本能做到：**(a) Memory 系统真正记录事件、(b) 名字加上姓和绰号、(c) 死亡触发存活者 mood debuff、(d) 加一条钢琴 BGM、(e) LLM fallback 文本至少写得有文学性**——这个游戏能从 3 跳到 6，甚至 7。现在它是一款"机制丰富的调度器"，不是一款"讲故事的沙盒"。

一句话总结：**Tam-9 的 Recent Memory 永远是空的——这就是这个殖民地讲故事能力的隐喻。**
