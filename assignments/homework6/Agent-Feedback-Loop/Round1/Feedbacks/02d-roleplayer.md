---
reviewer_id: 02d-roleplayer
round: 1
date: 2026-04-22
score: 3
verdict: 一场把所有戏剧素材都写进了后台日志、却在玩家屏幕上只留一行静态字幕的殖民地 sim。
---

# 身份自述

我是那种会给 RimWorld 每一个矮子、每一头母狗起名字的玩家。我还记得我在某局里，一个叫 Pablo 的老兵独守东桥、弹药打光、用义肢击杀最后一名袭掠者然后失血过多死在雨里——我给他立了块墓碑，截了图发给了朋友。我也记得 Dwarf Fortress 里一个醉醺醺的雕刻师把自己最好的作品刻在监狱墙上、然后第二天就因为饿疯了抽剑砍翻自己的亲弟弟。

我打开 colony sim 的唯一动机，是寻找这种**涌现叙事的瞬间**。不是 KPI、不是 DevIndex、不是 score/100，是那个能让我在饭桌上跟朋友复述十分钟的瞬间。所以当我被请来作为 roleplayer 视角评测 **Project Utopia** 的时候，我心里的基准分一开始就很保守：大多数 colony sim 都讲不好故事——最多给 3–4 分，能上到 6 的是天才。

以下是我玩了两个模板（Broken Frontier + Archipelago Isles / Island Relay）、大约十几次交互之后的真实手感。

# 我试着给工人起名字

**我不能给他们起名字。**

这是这一场 playtest 最早、最致命的失望。

开局面板是两行令我眼前一亮的文案："**Reconnect the west lumber line, reclaim the east depot, then scale the colony.**" 外加 "Broken Frontier · frontier repair"。像极了 RimWorld 起始情景——它在向我许诺一个**有前史的世界**："这里曾经有一条木材线，它断了；那儿曾经有一个补给站，它陷落了；你是救援队。" 我立刻开始脑补：那么是谁把它打断的？工人们是谁？他们为什么来？是拓荒者后裔？流亡者？

点进游戏，画面上散落着十几只像白蚂蚁一样的小人（截图 `02d-02-colony-started.png`）。我急着打开 Entity Focus——这是我唯一找到的"看单个角色"的 UI 入口。

它说："**Click a worker, visitor, or animal on the map to inspect it here.**"

然后我发现，**它永远点不中**。

不管我点工人聚集的木场、点单独在野外游荡的小点、还是点地图上孤零零走过的小白点——Entity Focus 始终停在 `No entity selected`。因为全屏默认绑定 Build 工具（Road、Farm、Wall…），左键总是优先当作"铺路"，然后要么报错 "Target tile is unchanged"，要么真给你铺上一段我根本没想建的路，消耗宝贵的 wood。按 Esc 也无效：tool 没取消。按 1–12 切 tool 也没有"指针/选择"这种 mode。

我花了 5 分钟尝试 10 多个坐标、配合 pause/heat lens，没有一次成功把一个工人"点出来"看他的"内心世界"。

这意味着：
- 工人们没有可见名字
- 他们没有性格属性（年龄？恐惧？技能？爱情？一样都没暴露）
- 他们是**抽象的、可互换的**劳动力单位

Colony 面板确认了这一点（截图 `02d-06-colony-panel.png`）：它只告诉我"Workers 20 / FARM 4 / WOOD 13 / COOK 0 / HAUL 1"。这是一张 Excel 表，不是一支队伍。没有一个人是"人"。

# 游玩中最接近"故事"的瞬间

我以为我不会有故事。但实际上后台日志里**全是**故事——只是它们从来没到达我的眼睛。

游戏里确实藏着一个看起来很强的事件引擎。我在 devtools 里翻出了它的隐藏面板（`eventsPanel` / `devEventTraceVal` / `devAiTraceVal`——**都是 `visible:false`**），里面赫然写着：

```
[106.7s] [SABOTAGE] visitor_16 sabotaged colony
[100.8s] [SHORTAGE] food low (threshold=18)
[179.9s] Mose-26 died (starvation)
[165.1s] Hale-28 died (starvation)
Warehouse fire at (52,38) — stored goods damaged
Herbivore-18 died (predation).
```

在 Archipelago Isles 局里，日志进一步给出：

```
[55.2s] [VISITOR] Lio-50 arrived
[45.2s] [VISITOR] Ody-48 arrived
[57.1s] [SABOTAGE] visitor_34 sabotaged colony
[41.1s] [WEATHER] clear -> rain (15s)
```

看到了吗？**Mose-26**。**Hale-28**。**Lio-50**。**Ody-48**。

游戏内部**有名字**。工人是真的有 ID、有死因、有死亡时间戳的。有一个叫 Mose 的在第 180 秒饿死了；一个叫 Hale 的 15 秒后也饿死了。有一个叫 Ody 的陌生人走进了我的岛屿补给站、10 秒后另一个叫 visitor_34 的家伙就去破坏了它。天下雨了，15 秒之后雨停。还有一个仓库在 (52,38) 起火、烧毁了储备。

**这就是故事**。这就是 RimWorld 叙事的原始素材——Mose 和 Hale 兄弟在冬天第一场饥荒里接连倒下、Ody 进门时看到的可能就是 Mose 的墓碑、然后 saboteur 来纵火——剧情完全可以像磁铁一样在这些事件上吸附、成型。

但作为玩家，我一眼都看不到这些。

我在屏幕顶上看到的是什么？一条永远不变的字幕：

> `[Rule-based Storyteller] route repair and depot relief: Workers should sustain route repair and depot relief while keeping hunger and carried cargo from overriding the map's intended reroute press`

这句话从第 10 秒到第 231 秒**一个字都没变过**（我换 Archipelago 模板后换了一次"east fields causeway"，但整个玩法周期内仍然是静态的）。它听起来像**给开发者看的 AI tuning 注释**，不是给玩家看的 storytelling。它不会说"Mose 倒下了"，不会说"visitor_34 又来了，警觉仓库"，不会说"冬雨降临，泥泞减速"。它就挂在那里，像一个被忘记 wire 的 placeholder。

更讽刺的是，屏幕正上方的数字条其实在实时刷新："`Survived 00:03:20 Score 126 · Dev 47/100`" + "`lived 200 · births 50 · deaths -30`"。也就是说**游戏记录了 30 次死亡**、并且**给了我一个负分**——但它从来没告诉我**谁死了、怎么死的、在哪死的**。30 条生命在我完全不知情的情况下被悄悄划掉了。

这是一种很奇特的剥离感：你知道事在发生，但没人讲给你听。

# 氛围：音乐 · 画面 · 天气

## 画面
两个模板的**地图生成品质确实出色**。Broken Frontier 的那条带状破碎河流、Archipelago Isles 的分裂岛群、漂浮在海里的绿色补给站——视觉语言很扎实（见截图 `02d-11-archipelago-start.png`、`02d-13-archipelago-ingame.png`）。像素小人有朝向、建筑有 tint 区分。这块**不拉分**。

还有一个我意外喜欢的细节：**死亡留痕**——我看见一把灰色短剑 icon 躺在木场的路面上（截图 `02d-10-4x-famine.png`），就站在活着的工人当中。那是 Mose 或 Hale 倒下的地方。这种"不擦掉尸体"的处理比干净的 death counter 有力一百倍。可惜它也没有后续动作——没有葬礼、没有墓碑铭、没有其他工人停下来哀悼。尸体就是一张静态 sprite 插在 sprite grid 里。

## 音乐 / 音效
**完全没有。** 整局 playtest 0 音效、0 环境音、0 BGM。Browser 标签也没出现扬声器 icon。对一款想要讲故事的游戏，没有风声、没有雨声、没有工人死亡时短短的一个下沉音色——这是致命的氛围空缺。就算是 DF 那种纯字符界面，至少也有一声 chime 提示 "Urist McDwarf has died"。

## 天气
天气系统**存在**——我在 trace 里看到 `clear -> rain (15s)`，后台日志里还有 `weather=winter`。但屏幕上看不到任何天气覆盖层——没有雨滴粒子、没有雪、没有云影。我只能在 dev trace 里读到"下雨了"。

## Heat Lens (L)
按 L 切换后，地图上会亮起几个脉冲圆圈（截图 `02d-09-heat-lens.png`、`02d-14-archipelago-late.png`）。我猜这是"事件压力区"——对应后台的 "sabotage @ warehouse medium 0.97" 和 "tradeCaravan active @ east ruined depot low 0.28"。但**没有图例、没有标签、圆圈上没有文字**。我作为玩家只能看到"某些地方在闪"——不知道闪什么、为什么闪。这个叙事接口有设计直觉，但完成度停留在 placeholder。

# AI Narrative 面板读后感

这是最令我哭笑不得的一部分。

游戏**确实有** AI Narrative / AI Trace 的后端（`devAiTraceVal`）。它的内容长这样：

```
Narrative:
Restore east fields causeway | Bridge the east fields causeway with roads.
AI: env=steady state | traders:warehouse circulation | saboteurs:soft frontier corridor hits | workers:route repair and depot relief

Trace:
[50.2s] policy fallback ... targets=workers:seek_task traders:seek_trade saboteurs:evade herbivores:wander predators:hunt
[40.1s] policy fallback ... targets=workers:seek_task traders:seek_trade saboteurs:sabotage herbivores:regroup predators:stalk
```

作为一个写过一点 ECS/GOAP 的玩家，我看得出来：这是一套**意图层调度日志**——policy fallback 正在告诉每一方势力"你这 10 秒应该追求什么目标"。predators 的目标从 `hunt → stalk` 的切换、saboteurs 从 `evade → sabotage` 的切换，说明**幕后确实有 drama beats 在推动**。理论上，这些完全可以写成小标题丢给玩家："**捕食者们今晚异常不安。**" "**破坏者终于按捺不住，开始对你的仓库下手。**"

但它们**全部**停留在这段隐藏 pre 标签里。外层那条静态字幕根本没接到它们。

值得肯定的是：字段名 `Narrative:` 本身已经暗示开发者**意识到**这是给故事准备的位置，而且第一行 `Restore east fields causeway | Bridge the east fields causeway with roads.` 确实是**模板切换后会变**的——Broken Frontier 时它是 "Restore west lumber route"，Archipelago 时变成 "east fields causeway"。所以这块**不是不存在，是没接入 UI**。

它像是一锅已经炖好的汤，但服务员忘了端到桌上。

# 我编出来的殖民地故事（如果能编的话）

老实说，我编不太出来。因为我没有**角色**——我没有办法"跟着 Mose 走五分钟"、我不知道他多大年纪、我不知道他和 Hale 是什么关系、我不知道他死前最后一件工作是什么。

硬挤的话我能挤出**一段只有三行的掠影**：

> 断裂的西河岸边，有个叫 Mose 的人。我不知道他长什么样，我只知道他在我到达后的第 180 秒饿死了。15 秒后，一个叫 Hale 的人也倒下了。他们的灰色剑形墓碑留在木场的路面上，和其他还在搬木头的人并肩而立。
>
> 没有人停下来。
>
> 然后一个叫 Ody 的陌生人走进了村子。几秒后，仓库起火。

这就是**我能编出来的全部**。不是因为游戏没发生事，而是因为游戏**没讲**。所有的名字、因果、空间信息都在后台日志里，但玩家界面只有一个不变的字幕和一堆数字仪表。

作为对比：即便是最简陋的 Roguelike，只要屏幕底下能滚一行 "A giant rat bites you!"，玩家就能自己补出故事。Project Utopia **已经写好了那行台词**——`[SHORTAGE] food low (threshold=18)` / `Mose-26 died (starvation)` / `Warehouse fire at (52,38)`——**只是没把它 print 到屏幕上**。

# 与 RimWorld / DF 的叙事对比

| 维度 | RimWorld | Dwarf Fortress | Project Utopia v0.8.1 |
|---|---|---|---|
| 角色有名字 | 是 | 是 | 后台有、UI 无法查看 |
| 角色有性格/技能 | 是 | 是 | 未暴露 |
| 角色能被跟随 | 是 (drafting) | 是 (zoom + announcement follow) | **无——Entity Focus 点不中** |
| 关键事件提示 | popup + sound + pause | 红字 announcement + center camera | 隐藏日志（玩家看不到） |
| 环境音/BGM | 是 | 有/有 mod | **无** |
| 死亡具名 | 是（墓碑、回忆录） | 是（thought history） | 仅尸体 sprite，无文字 |
| 天气氛围 | 雨雪粒子 | 字符变化 | **仅后端数值** |
| "能不能口述 10 分钟故事" | 是 | 是 | **否** |

这张表基本解释了我的挫败感。

# 缺失

总结游戏**有什么素材却没做成叙事**：

1. **工人有 ID 和死因，但 UI 不可访问** → 需要一个真正能工作的 Entity Focus（按住 Alt 或 tool=None 时允许选择）
2. **storytellerStrip 是静态占位符** → 把 devAiTraceVal 和 devEventTraceVal 里 10s 内的 salient event 写成 1–2 行自然语言推送上来
3. **没有音效** → 至少加三层：环境底噪 / 建造击打 / 死亡 chime
4. **没有天气视觉** → 雨滴、雪、云影、冬天的发白滤镜
5. **死亡无墓志铭** → 尸体处点击至少弹一句 "Mose-26, forager, starved on day 1 winter"
6. **模板标语只在开局出现一次** → 通关条件（reconnect / reclaim）其实随时间演化（`1/2 routes online | 1/1 depots reclaimed`），应持续叙事化
7. **visitor / trader / saboteur 没有进场提示** → visitor_34 破坏了三次，我一次都没听见
8. **Heat Lens 圆圈无 label** → 需要把 "sabotage at warehouse" 文字挂在圆圈上
9. **角色 ID 是 `Mose-26` 这种半生成** → 建议做成完整两段式姓名（"Mose Iron-Hand the Miller"），给玩家记忆钩子
10. **没有情景回顾** → 游戏结束时应该能回放 "你的殖民地存活了 00:03:20，共 200 活过、30 死亡，最重要的事件：..."

# 评分理由

**3 / 10。**

这个分数比我常给的 colony sim 标准线（4/10）还要**低一点**。原因是：

Project Utopia 并不是那种"根本没想做叙事"的数值游戏——**恰恰相反**，它的 AI trace、event trace、visitor 命名、weather 切换、sabotage drama beats、甚至 `Restore east fields causeway` 这种动态叙事目标，**都已经写好了**。它的引擎里坐着一个相当像样的"叙事导演"。

但这位导演**从未走上舞台**。所有台词都在幕布后面排练，舞台上只挂着一条占位符字幕 + 一堆 KPI 仪表盘。作为玩家，我经历了整整 4 分钟的饥荒 / 破坏 / 贸易 / 降雨 / 死亡——**零提示、零声音、零具名角色画面**。

这比"根本没做叙事"更令人沮丧——因为素材明明就在那里，却不给玩家。差一步就能到 6 分；但这一步没迈出来，所以只能 **3 分**。

加分项：
- 模板标语文案写得好，有 RimWorld 启动情景那味儿（+0.5）
- 地图生成视觉上真的不一样，两个模板一眼能辨（+0.5）
- 尸体不擦除的设计是朝对方向迈的半步（+0.5）
- 后台日志里已经是完整的故事原料（+1）

扣分项：
- Entity Focus 完全不工作（-2）
- 静态 storyteller strip（-1.5）
- 零音效（-1）
- 天气只在数据层（-0.5）
- 工人是可互换数字、没有人格（-1）

最终：3/10，verdict 已写在 frontmatter。

---

*—— 一个想跟 Mose-26 告别却没被允许的 roleplayer，2026 年 4 月 22 日*
