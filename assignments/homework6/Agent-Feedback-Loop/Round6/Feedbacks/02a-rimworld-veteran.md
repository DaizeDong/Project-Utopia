---
reviewer_id: 02a-rimworld-veteran
date: 2026-04-25
build_url: http://127.0.0.1:5183/
verdict: 苛刻但克制 — 是一个会动的 prototype，不是一款 colony sim
score: 3/10
---

# Project Utopia 试玩长评：当一个 RimWorld 老兵第一次按下 Start

## 玩家身份自述

我从 Alpha 17 开始打 RimWorld，DF 我有过两个写到 800+ 的 fortress（一个被 forgotten beast 吃完了，一个我自己 ragequit 了），ONI 我打完过 Spaced Out 全 DLC，Banished 是我冬天的小甜点。我对 colony sim 的判断标准非常顽固：**世界要长牙齿、人要有灵魂、系统之间要打架、玩家的决定要在 30 小时之后还有回响**。如果一款游戏只是「在格子上贴贴砖、看数字往上爬」，对我来说它再漂亮也只是 Excel。

打开 Project Utopia 之前我读了一眼标题——「reconnect the west lumber line, reclaim the east depot」——OK，至少它知道 colony sim 要有 narrative hook。然后我按下 Start，进入了大约 40 分钟的真实游玩，跨四张地图（Temperate Plains、Hollow Keep、Archipelago Islands、Coastal Ocean），看了好几次崩溃和恢复，最终的感觉是：**这是一个比 demo 多一点、比 colony sim 少很多** 的东西。下面我把过程写出来。

---

## Session 1: Temperate Plains "Broken Frontier" — 第一次见面就死了一遍

第 0 秒：我点 Start Colony，资源面板跳出来——210 Food、4 Wood、1 Stone、0 Herbs、12 Workers。可以接受的开局物资。地图载入后我看到一片中央绿岛，被很高对比度的"墙体海"包围（蓝色海/沼泽 tile，几乎是棋盘格 noise）。中央岛上已经有 prefab 的 ruin tile（红色屋顶图标），有几名工人在 Seek Task，还有 ASCII-级精度的小动物 sprite 在外围晃。我看到 toast 一条接一条蹦出来——"First extra Warehouse raised"、"First Kitchen raised"、"First Meal served"——**前 30 秒就把 4 个 milestone 喊完了**。RimWorld 第一座厨房的 First Meal 是你的 colonist 在饥饿濒死时端出第一盘 simple meal 的小高潮，这里被压缩成"开局自动建好"的吐司通知。震撼第一次打折。

第 0:14：我没动鼠标，资源已经在变。Food 从 210 掉到 176，Wood 从 4 涨到 2 又涨到 0，Workers 从 12 涨到 16，再到 20。**这个游戏里"工人"是从天上掉下来的**。RimWorld 里你要靠 raid prisoner / wanderer joins / 婴儿出生才能扩员，每一个新 colonist 都是一个故事；这里 4 分钟之内 12 → 28，全是凭空冒出来的 Mose / Pia / Ilia / Fen / Cora 这种 Markov chain 名字，没有 trait、没有 story log、没有"why did Mose Keane arrive on day 3?"。

第 2:38：Status 显示 Day 3，"Food: -250/min"，"224 until empty"。**4 分钟死亡螺旋**。我连忙翻面板想救灾，但 Inspector 给我的 actionable 信息是什么？我点了第三个工人——

```
Mose Jorvik (worker_8)
Backstory: mining specialist, hardy temperament
Top Intents: deliver:2.10 | eat:1.80 | farm:1.60
Policy Focus: rebuild the broken supply lane
Hunger: Hungry (36% well-fed)
Vitals: hp=100/100 | hunger=0.637 | alive=true
Carry: food=0.20 wood=0.00
```

诶，这个 Top Intents 和 Policy Notes 居然是看得见的 utility scoring，挺好——这是这游戏整个 session 给我留下最好印象的一处。但同时我也看到 **Carry 字段只列出 food/wood**——这游戏的"resource chain"号称有 herbs/stone/meals/tools/medicine，**worker 携带却只显示两种**？要么 UI 没接，要么 worker 根本只能搬两种东西。后面我反复抽了 8 个不同工人的 Inspector，确认 Carry 永远只是 food + wood。这意味着 stone / herbs 这两个 raw resource 根本不进 worker 的口袋——它们只有"产出在原地"或者"由专门的 HAUL 角色处理"两种可能，前者会卡住生产链、后者意味着 hauler 拥有一类 carry，普通 worker 拥有另一类——而玩家是看不到 hauler 的 carry 状态的。RimWorld 里我能看每个 colonist 此刻背着什么、剩多少质量、走多少距离——这里不行。

第 3:53：我冲去 Build 面板想自己放 Farm。Farm cost 5 wood，**我手上 Wood 是 3**。无解。autopilot 已经把 wood 全部花完去搭 Warehouse + Kitchen。我看到底部红条："Autopilot struggling — manual takeover recommended"。OK，所以 autopilot 知道自己挂了，提醒我接管，但**它不会告诉我具体是哪一步走错**。我手动想接管，结果按 L 切热力图、按 2 切 Build 工具，可右侧的 Settings 标签同时被键盘事件吃了一下，我画面被切到 Settings panel——keymap 冲突。

第 4 分钟左右，splash 启动页 **凭空又跳了出来**。根据 URL 的变化（`/?template=archipelago_isles`），我相信是因为我用 Esc 退出某个对话框时，触发了"返回主菜单"逻辑，整局清零。我没看到任何"确认丢弃当前 run"的提示。**colony sim 最害怕的事情就是无提示重置存档**——这一刻我心里给它扣了第一分。

总结 Session 1：4 分钟体验完整流程，看到了 utility AI 的影子，看到了一个莫名其妙的 reset，看到了 carry 系统残缺的暴露。

## Session 2: Rugged Highlands → "Hollow Keep" — Autopilot 的真面目

第二局我换 Rugged Highlands，scenario 抽到的是 **Hollow Keep** "The old keep's gates hang open — hold north and south before raiders find the breach"。听着像 RimWorld 的 mechanoid raid 倒计时，我兴奋地坐稳了。

地图载入，central island 上有两个标好的 ring 标签："north timber gate"（双层堆叠渲染，bug）和 "south granary"。Fertility overlay 自动开着，深绿/浅绿区分肥力。**视觉上是 Project Utopia 全部 session 中最好看的一帧**——overlay 把 information density 做到了，hex-ish 菱形 tile + 河流穿过岛屿，有 Banished 的味道。

我先把 Autopilot 关掉，准备自己经营。第 1:52，我刚选了 Smithy，发现 Autopilot 又自己开了——**这是一个会自己重新启动的 autopilot**。后来我观察到：autopilot 的 checkbox 有 **两个**——top bar 一个 (`#aiToggleTop`)、Settings 内的 Save/Replay 区一个 (`#aiToggle`)，UI 之间不同步。每次 splash 重启会把它默认开起来。OK，那我索性把 autopilot 留着、当观察者。

第 4:57，Day 5，Status 是绿色 STABLE。Resources：Food 49 +57.3/min（cons -140，58s 到空），Wood 21 -34.7/min，Stone 0 -18.0/min，Herbs 15 +0.0/min，Meals 2 +13.5/min prod +20，Tools 4。**colony 同时被打上 STABLE 标签和"58 秒后没饭吃"的标签**——这两件事是同时显示的，没有红字预警。RimWorld 里食物倒计时进入红色会有 alert sound + bottom letter；这里只有数字默默变小。

我等到 8:14，68 workers，171 food，139 stone，0 herbs，4 tools。终于看到了一个东西——东边出现了一片连续的浅褐色棋盘格，就是 Quarry 的开采痕迹；地图整体的"建设面"明显比开局扩大了 5 倍。**autopilot 的搭建是工整且无趣的**——它沿着 north gate → keep 中心 → south granary 拉了一条几乎对称的纵向 spine，再向东 spawn 出一片 quarry pad。我拿不准这是 algorithmic road planner 的产物还是固定模板，但它没有 RimWorld 的 dwarven cottage chaos，也没有 DF 玩家手挖的 megaproject taste。整张地图建得像编辑器自动 fill 的 Excel sheet。

第 9:20，"Why no WHISPER?: LLM errored (error)"——LLM proxy 看起来没接通过。这等于说 **我整个 session 的 AI"导演"都是 fallback policy 在跑**。这个 fallback 写的还行（policy notes 里能看到"Broken routes mean workers should favor sites that reconnect or shorten logistics"这种 rule-based reasoning），但你既然产品里把 LLM 故事讲得很大（splash 里"AI STORYTELLER · DIRECTOR"），那 fallback 永远 silent error 是非常糟的产品体验——玩家根本不知道自己是不是在玩"完整版"。

第 10:30，我打开 Heat Lens（L）。出来一堆方框，**几乎所有方框写的字都是"halo"**，只有偶尔两个写"supply"、一两个写"input starved"或"warehouse idle"或"supply surplus"或"traffic hotspot"。"halo"明显是 placeholder，不是给玩家看的。RimWorld 的 alert 是"Mash room overheating: 31°C"——具体到状态、温度、位置；这里给我"halo"。**这个 heat lens 是 v0 状态**。

第 11:41，资源 174/20/76/1/75。我对着这个不会真正崩盘也不会真正起飞的数字流看了一会，发现一个事实：**autopilot ON 之后，整个游戏其实是 idle 挂机器**。我不需要做任何决策，数字就会涨到几乎不变的 plateau。Threat 28%、Stable、Day 7 然后就是 Day 8、Day 9、Day 10。在 RimWorld 里 raid 永远在 storyteller 的 dice 上等你；在 ONI 里 dupe 心情会突然爆雷；在这里——**什么都不会发生**。

这局我玩了 17:00，最后 Inspector 抽到一个工人 "Top Intents: deliver:2.10 | eat:1.80 | farm:1.60"——utility 数字基本不变，policy summary 反复读"rebuild the broken supply lane"，但**每个 worker 都是同一个 policy**——80 个工人共享同一份 7-bullet 策略文本。没有 individual goal、没有 grudge、没有 friend、没有 mood break。

## Session 3: Archipelago Isles "Island Relay" — 当 colony sim 被压成 puzzle

我换 Archipelago。scenario "Island Relay — Bridge two causeways, claim the relay depot, and connect the harbor"。**这局的初始状态是 Project Utopia 试图最有特色的一帧**：5-6 个独立的小岛漂在水面上，central relay depot 只有一个小岛起步，两条 causeway 是断的（已有 ruin tile，但缺一段路）。这是一个真正的 puzzle scenario——我立刻想起 Banished 怎么处理桥梁、ONI 怎么处理 base expansion across pockets。

可是开了 autopilot 让它跑——**它跑得相当蠢**。第 5:55，Day 6，我看 Population panel 显示 42 workers，north island 上散布着"traffic hotspot"标签，**意思是工人都堵在那一座桥上来回跑**。autopilot 没有把"I should drop a Warehouse on north island so haulers don't make 30-tile round trips"这种思路融进它的 build queue，它只会沿着已有 road 慢慢加 farm/quarry。Wood 流量同时显示 -480/min（construction overdraft）和 +30/min（lumber output），AI 完全没有 backpressure 调度，就是在乱花。**Logistics 是 colony sim 的核心，这游戏的 logistics 是断的**。

第 8:58，Meals 0、Tools 0。**production buildings 好像就这样停了**。我没有 production queue 面板，我也不知道 Kitchen 此刻是 idle 还是 starved，**只有 colony 总览的"Meals 0 +0.0/min sampling..."这一行**——sampling 状态停留在"sampling..."很久不更新。RimWorld 给我一个 work tab，让我看每个 work bench 的 priority；DF 给我 manager order，让我堆 50 个 plump helmet stew job；ONI 给我每个 building 的 priority + recipe；Project Utopia 给我什么？**没有 building 选中**。我点 Kitchen tile，没有反应；点 Smithy tile，没有反应。整个游戏 **没有 building inspector**。worker 我能选，building 我不能选——这是一个 colony sim 不可接受的缺陷。

第 11:46，Status 从 STRUGGLING 变回 STABLE，Day 12。Threat 58% → 27%。但 Threat 涨跌也只是个数字，**整局 22 分钟我没看到一次 raid、没看到一次 wildlife event、没看到一次火灾、没看到一次 disease**。Splash briefing 写的是"hold north and south before raiders find the breach"——OK 那 raiders 在哪？我打到 Day 17，没人来。"Wildlife pressure"标签在地图上挂着，但下面是几只静止的 sprite（看起来像兔子？），没有威胁感。

第 14:18，"First Medicine brewed: Injuries are no longer permanent" 这个吐司在 Day 15 又跳了一次——**重复的 first-time milestone 通知**。第 11:46 也跳过一次"First Meal served"——milestone 系统状态机有 bug 或者没存。

第 16:59，我开始翻 Inspector。Mose Jorvik 工人，Carry: food=0.00 wood=0.00。**80 个工人同时空手**。整个 colony 的物流"halo"全部空载。这意味着 deliver intent 评分高达 2.10 的工人，下一秒做的事可能是又走回 warehouse 取下一份 food，他们没在搬 stone / herbs / meals / tools / medicine。supply chain 是不是只在 food + wood 两条线上有效？我无法核实，但 visible state 没有给我相信"5 种资源都被运输"的依据。

第 22:26，我累了。45/295/0/7 + 80 workers，已经第 25 天，threat 28%，**绝对不会崩盘**。这个游戏在 autopilot ON + 不接 LLM 的情况下，进入一个 **永生 plateau**——它不会让你死，也不会让你赢。

## Session 4: Coastal Ocean — 验证 scenario 与 template 的解耦

最后我快速试 Coastal Ocean。开局 scenario 抽到的是 **"Broken Frontier"**——和 Temperate Plains 第一局完全一样的 brief。也就是说，**scenario 是从一个池子里随机抽，跟 template 没绑定**。我看到熟悉的 west lumber route / east ruined depot 标签飘在中央小岛上。Coastal Ocean 这个 template 名字叫 Ocean，但视野外面除了一圈水，并没有"沿海 / 渔业 / 风暴 / 潮汐"任何元素。**没有渔业 building，没有海洋资源，没有专属危机**。RimWorld 的 sea ice biome 是真的会冷死人的；这里 Coastal Ocean 跟 Temperate Plains 玩起来除了视觉边框是一圈蓝以外，没有差别。

我大概跑了 22 秒就意识到——四张地图玩下来其实是同一份基础经济、同一套 autopilot、同一份 milestone 流程。我退出。

---

## 系统深度评价（老兵视角）

### 经济链 — 浅且断
名义上是 5 raw + 3 processed（food/wood/stone/herbs → meals/tools/medicine），真跑的时候我只确认了 food + wood 主导。Stone / herbs 进不进 worker carry 是个迷。Meals/Tools/Medicine 在 colony 总览里反复显示 `0 = 0.0/min (sampling…)`，"sampling..."字样在 30+ 秒后还不退场。Kitchen 和 Smithy 这种 processing building 一旦 idle 没有任何 UI 暴露原因。Compare RimWorld：每个 work bench 显示当前 bill、剩余 ingredient、worker queue——**这游戏没有这一层**。

### Worker AI — 有骨没肉
Inspector 给的 Top Intents（deliver:2.10 | eat:1.80 | farm:1.60）和 Policy Notes（"Broken routes mean workers should favor sites that reconnect..."）说明背后有 utility AI + state-adaptive policy fallback。这是值得肯定的设计。**但问题在于 visible behaviour 太单薄**：80 个工人同时 idle/seek_task/seek_food，他们 carry 永远 0.00，他们的 backstory 是"crafting specialist, efficient temperament"这种 2-axis 排列组合，没有人物 trait（lazy / pyromaniac / cannibal），没有 mood、没有 thought、没有 break、没有 berserk、没有 social fight。**这些不是缺失的 polish，这是 colony sim 的灵魂**。

### Storytelling — 通知，不是故事
"AI STORYTELLER · DIRECTOR picks rebuild the broken supply lane"——这是模板字段。它从来没说过"Mose Keane 第三次试图穿越 north bridge 失败，他扔下 wood 跑去找 Cora 抱怨"。RimWorld 的 message log 是会写 Tynan 都笑的小故事的，DF 的传说能让 Boatmurdered 上 Reddit 头条。这里的 storyteller 是一个 toast 喷射器：First Meal、First Medicine、First Tool、Day 5 Stable、Day 12 Struggling，全是 metric 包装的标签。

### 威胁 / 事件 — 没有
Survival mode 跑到 Day 17 + 80 workers，**0 raid、0 fire、0 disease、0 wildlife attack**。Splash 反复说"raiders find the breach"、"the next wave"——next wave 永远没来。Threat 数字在 27% ↔ 58% 范围漂浮，**没有 visible 触发条件**。

### Heat Lens / 信息 overlay — 半成品
Heat Lens 上 90% 的 label 是字面字符串"halo"，剩下 10% 是"supply surplus / input starved / warehouse idle / traffic hotspot"。后者有用，前者是 bug 或调试残留。Fertility / Elevation / Node Health overlay 视觉做得不错（自动切换有点干扰），是这游戏少数让我点头的部分。

### 长期节奏 — 不存在
Autopilot ON 时进入 plateau；Autopilot OFF 时玩家无法手动接管（5 wood 的 Farm 你拿不出来）；混合模式 splash 会突然把 run reset。**没有"中后期"概念**。我打了 22 分钟单局，世界没有发生任何质变——没有冬天、没有夏天的火灾、没有 raid pressure curve、没有科技 unlock、没有 trade caravan、没有 quest。

### Building Inspector — 整个不存在
点 building tile 无反应。这是 deal-breaker。

### UX 杂症
- splash 不可控地重新出现，可能造成 silent run reset
- Autopilot 两个 checkbox 不同步
- Esc 会触发返回主菜单
- 数字键 1-12 在 splash 上选 template，在 game 中选 build tool，没有清晰的边界
- toast 在地图中央堆栈遮挡视野
- "First X" milestone 会重复 trigger
- LLM 不可达时 silent fallback 没解释

---

## 与 RimWorld / DF / ONI 的直接对比

| 维度 | RimWorld | DF | ONI | Project Utopia |
| --- | --- | --- | --- | --- |
| 单 colonist 个性深度 | trait + skill + mood + relationship + thought | personality + preference + dream + grudge + worship | trait + interests + stress reactions | 2-axis backstory string + role |
| Building 选中 + 配置 | 每个 work bench 完整 priority/bill | 每个 workshop 完整 task queue | 每个 building 完整 recipe/priority | 不存在 |
| 事件 / 危机系统 | storyteller + raid + event 池 | 移民 + 季节 + forgotten beast + curse | meteor + flatulence + germ outbreak | 0 raid 0 event observed |
| 物流可见性 | hauler + stockpile priority + bill ingredient | quantum stockpile + minecart 可视化 | dupe queue + automation | "halo" |
| 中后期 | endgame ship + 各种 megaproject | strange mood + adamantine + circus | space DLC + radioactive | 数字 plateau |
| 故事生成 | 玩家可叙述的小段子无穷 | Boatmurdered 级传奇 | Klei 短动画级 | toast 通知流 |

每一栏 Project Utopia 都是最右边的 **空格** 或 **placeholder**。

---

## 最想让开发者修复的 5 件事

1. **加 Building Inspector**。点击 Farm / Kitchen / Smithy 应该开 panel：当前 input、output、worker assignment、idle reason、recipe queue。这是 colony sim 的最低准入门槛。
2. **Splash 不要无端覆盖正在跑的 run**。任何会清空当前局面的操作都必须二次确认；URL 改变不能触发 reset。
3. **把 Heat Lens 的"halo" placeholder 换成有意义的指标**（比如 throughput value、或"+12 wood/min"）。整套 supply lens 现在 90% 是 noise。
4. **触发实际事件**：raid、disease、wildfire、wildlife attack。光有 threat 数字而没有事件落地，scenario brief 就是空话。Splash 里写"raiders find the breach"就要让 raider 真来。
5. **给 worker 加 trait + mood**。不需要复制 RimWorld，但至少 4-5 个 trait，会改变工作偏好和长期心情曲线，让"Mose Jorvik"和"Cora Ashford"在 30 分钟之后是两个能被记住的名字，而不是名单上的两行字符串。

---

## 总评

**Project Utopia 此刻的状态是：colony sim 风格的 city builder prototype**。它有正确的 vocabulary（worker、role、resource chain、policy、heat lens），有正确的 UI 骨架（top bar metric / sidebar panel / inspector），甚至有一套相当像样的 utility AI 暴露在 inspector 里。但是它没有 colony sim 的本体——**没有性格、没有事件、没有故事、没有 building inspector、没有真正的中后期挑战**。这是一份配菜端上来时让人以为后面有主菜，结果服务员告诉你"今天就这样"的体验。

如果我用 Steam 评测口吻：**"展示了 utility AI 与 overlay 系统有趣的萌芽，但 60 分钟之内体验完全到顶；缺少 colony sim 玩家最在意的 emergent storytelling 与系统冲突。"** RimWorld 老粉会在第 4 分钟看完所有 milestone 通知后失望地关掉。

**最终分数：3 / 10**

> 加分点：utility AI 的 Top Intents 暴露、overlay 视觉、scenario 标签系统、Inspector 的 Position/Vitals/Carry 字段格式、Resources 面板的 prod/cons/until-empty 计算
>
> 减分点：building 不可选、heat lens placeholder、autopilot 双 toggle 不同步、scenario 与 template 解耦但内容空洞、worker 无 trait/mood/social、0 实际危机事件、splash 无提示重置 run、"sampling…"占位符卡死、toast 重复 trigger、5 wood 的 Farm 在 wood=3 时无解的 deadlock
>
> 一句话：**很会摆 colony sim 的形状，但还没长出 colony sim 的牙。**
