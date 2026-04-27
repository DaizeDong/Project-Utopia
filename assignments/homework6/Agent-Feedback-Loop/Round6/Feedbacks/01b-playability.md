# 可玩性评测 — Project Utopia（盲审）

- **评测者**：01b-playability
- **评测日期**：2026-04-25
- **构建地址**：http://127.0.0.1:5183/
- **评测方式**：浏览器盲审，未阅读任何源代码、文档、changelog 或同伴评测
- **本游戏定位（按页面文案）**：Three.js 殖民地经营 + 永续生存（Survive as long as you can）

---

## 一、总体评分：**3 / 10**

一句话总评：**「这是一个野心比执行力大很多的玩具，玩家被边缘化、节奏靠等、UI 噪音盖过反馈，作为付费产品远不及格；作为技术 demo 才能勉强看。」**

游戏有不少细节藏在底层（角色背景、关系网、记忆流、Heat Lens、剧本式开局简报、多模板地图、AI 自动驾驶 + 规则回退），看得出团队是冲着 RimWorld + 信息可视化做的。但玩家这一侧体感非常糟糕：决策几乎没有，节奏漫长无聊，UI 反复打架，崩溃式异常路径很多。我多次从主菜单进入殖民地后又被「弹回菜单 / 切到别的模板」，一次完整 manual playthrough 都没能稳定跑通到 10 分钟。这不是一个我会推荐朋友花 30 块的产品。

---

## 二、前 30 分钟体验（约前 0–5 分钟实际游戏时间，因加速 ×4 已等同 30 分钟节奏）

进入游戏的第一印象其实不错：

- 启动屏有一个剧本式简报：「Broken Frontier — Reconnect the west lumber line, reclaim the east depot, then scale the colony.」并配有 First pressure / First build / Heat Lens / Map size 四段对开局有指引意义的文字。
- 模板下拉里有六张地图（Temperate Plains / Rugged Highlands / Archipelago Isles / Coastal Ocean / Fertile Riverlands / Fortified Basin），地图尺寸可手动调（96×72 默认）。每次重开「New Map」都能换一段不同的剧情简报（我至少见到 Broken Frontier、Hollow Keep、Island Relay 三种），开局确实有「不同地图给不同压力」的意图。
- 点 Start Colony 后视角直接落到一个已经存在的小村落，13 个 named worker，已经有路、农田、储物点。这种「不让你从空地起步、直接给你接手一个濒危的殖民地」的剧本式开局是有想法的。

然后问题就开始了：

1. **第一秒就饥饿**：13 个工人里，启动 4 秒后我看到的是 hungry / hungry / peckish / peckish / hungry / hungry / hungry / hungry / hungry / peckish / peckish / hungry / starving。简报让你「stitch the broken supply line」，但你刚到现场就有人 starving，玩家根本没有机会先观察就被节奏推着走。这不像「first pressure」，更像「late-stage panic」。
2. **关键资源数太少**：开局给 210 食物 / 4 木 / 1 石 / 0 草药。Farm 要 5/6 木，多次出现 「Insufficient resources. ✗ Need 5 more wood」。第一拍想盖个农场都得先去伐木——而 Lumber Mill 自己也吃木——节奏直接卡死，玩家只能干等 AI 工人自己慢慢补木。这是没有玩家 agency 的「假经营」。
3. **Heat Lens 标签轰炸**：按 L 打开 Supply-Chain Heat Lens 后，地图上瞬间出现 14 个「halo」黑底标签，叠在建筑物上，根本看不出哪个是仓库、哪个是厨房。所谓 supply surplus / input starved / warehouse idle 标签不只在该亮的格子上，而是整片刷出来，连图例都看不清楚。这是「**信息过载 = 没有信息**」的反面教材。

前 5 分钟玩家做的事 ≈ 0 个有效决策，我能做的只是「按 ▶ 看着工人自己跑」。

---

## 三、中期体验（5–10 分钟）

中期我开了 ×4 加速，等到 3:00–5:44。看到的内容：

- **Worker 数量在涨**：13 → 18 → 25 → 29 → 32 → 34 → 37。这种「自然繁衍 + 移民」是好的，会出现「Ilia Orrow was born at the warehouse」这种事件提示，工人面板出现 birthstory（「woodcutting specialist, efficient temperament」）和 traits（efficient / hardy / swift），有 Mood / Morale / Social / Rest 四个维度，还有关系网（「Mose Hale: Close friend (+0.65) (because worked adjacent)」）。这套**社会模拟系统**是这个游戏的最大亮点，明显在抄 RimWorld 的作业，并且抄得不是表面。
- **Decision Context 框**：选中工人后侧栏会写「Local logistics rule sees 0.80 carried resources, so delivery should outrank more harvesting. Carry pressure has been building for 12.4s, so the worker is being pushed back toward a depot.」——**这种把 AI 决策语言化给玩家看的设计很罕见，加分**。
- **Toasts 持续刷出阶段成就**：First Lumber camp raised / First Meal served / First Tool forged / First Medicine brewed / First Kitchen raised. 看得出有进度反馈意图。

但中期的核心问题是**玩家完全没事干**：

- 自动驾驶 AI（rule-based）会自己决定盖什么，玩家想插一脚就要打开 Build 面板手选工具，但每次切工具/面板/键位都会触发非预期的副作用（详见第七节 Bug）。
- 资源池长期 0 木、0 石、0 草药，所以你「想 build 也 build 不动」。变成「卡资源 → 等 AI 工人捡 → 工人 hungry → 又卡食物」的死循环。中期 5 分钟内我看到工人状态最常见就是 peckish + Seek Task，几乎一半在「Seek Task」（找事做）。这意味着 AI 决策器对工人指派也不够积极。
- 危机感几乎为 0：Threat 长期挂在 42% 但从来没有真正打到家门口的画面。没有看到一次明显的袭击事件、没有死亡警告（除了一只「Herbivore-17 died - predation」的草食动物），没有冬天来了、没有疾病爆发。所谓「Hold north and south before raiders find the breach」从头到尾没出现敌人。

**中期 = 慢速放风的农场动画**，这不该是经营游戏。

---

## 四、长期体验（10 分钟以上 / 多次重开）

我做了 4 次完整重开（被动重开 3 次、主动 1 次），观察到：

- **不同模板的 mechanical 差异有限**：Temperate Plains 是大陆、Rugged Highlands 多山带峡谷、Archipelago Isles 是一堆小岛+水道；地形渲染差别明显，但 30 秒后做的事完全一样：放农场、等木头、放 Lumber、等 Stone、循环。岛屿地图额外要 Bridge，但 Bridge 也是「等木头 → 工人自己接」的流程，**玩家不需要做地图特定决策**。
- **永续生存模式（∞）的目标是「Survive as long as you can」**，但游戏没有给我「会死」的紧迫感。生存进度表示 00:00:24 / 00:05:44，但分数（pts）一直是 0 — 我没看到过分数增长。所以**长程激励缺位**。
- **没有 tech / 解锁 / 节点感**：我没看到任何 research tree、文化树、信仰系统、季节切换、年节庆典之类。所有 12 个建筑工具一开局就解锁，没有 Tier 2、没有「先研究 XX 才能盖 YY」的爬升曲线。这就让 50 分钟的游戏跟 5 分钟的游戏内容上**几乎没区别**。
- **Replayability 极低**：六张地图 + 三种剧情简报 + 每次随机 worker 名字 = 表层差异；底层经营循环完全一样。一次跑完后，第二次没有动力。

---

## 五、决策深度

我列一下这游戏给玩家的「真决策」：

| 候选决策 | 实际是不是真决策 |
|---|---|
| 选模板 / 地图大小 | 是的，开局唯一一次。但选完地图后的玩法没差，所以是浅决策 |
| 放路 / 放农 / 放仓 / 放厂 | 名义上是，但建筑放置点几乎没有 trade-off：所有工业都要靠路连接，找一块绿色 grass 就能放，没有「这块土地优势是 X 但代价是 Y」 |
| 角色分工 | 自动决定，玩家只能在 Settings 里调一个 「Target Farmer Ratio: 50%」滑条，调了我也没看到立竿见影的反馈 |
| Autopilot ON/OFF | 是个真决策，但 ON 和 OFF 都跑得差不多稳，OFF 反而玩家更操心 |
| 战术应对（防御/灾害） | **缺位**：没有看到敌人袭击，所以 Wall 这工具没用上 |

**结论**：决策深度 < Banished，远 < Frostpunk。Frostpunk 让玩家在「让小孩做工 vs. 让人冻死」之间做痛苦取舍；这游戏让玩家在「点 Farm vs. 不点 Farm」之间等系统资源够。

---

## 六、反馈循环

| 时间尺度 | 反馈点 | 评分 |
|---|---|---|
| 短期（秒级） | 点击 Build 工具有蓝色高亮 + 右栏出 Cost / Rules / Insufficient resources 文案 | OK |
| 短期（秒级） | 工人状态实时滚动（Eat / Harvest / Deliver / Seek Task） | OK |
| 中期（分钟级） | 「First Kitchen raised」「First Tool forged」等成就 toast | OK 但很短，飘过就忘 |
| 中期 | Resources 面板的 sampling 数字（Food: -29.0/min）、Stable / Drift 状态条 | **加分**，能看出经济健康度 |
| 长期（10+ 分钟） | 分数（0 pts 一直挂着）、Day 计数（Day 2 → Day ?）、AI Storyteller drift | **缺位**，分数永远是 0，看不到「我玩到现在做对了」的画面 |
| 失败反馈 | 没看到任何「殖民地崩盘 / Game Over」画面 | **严重缺位** |

游戏没有 win / loss 状态，也没有阶段性 milestone 庆典。**作为生存游戏，没有死亡威胁就没有生存乐趣**。

---

## 七、节奏 / 心流 / Bug

**节奏**：极慢。即使 ×4 加速，从开局到看到「First Tool forged」也要 2:13 实际秒数（≈ 接近 9 游戏秒数？看不出 Day 怎么换算）。3 分钟看到「Day 2」，意味着想看到「Day 30」的内容大概要等很久。心流完全做不出来。

**Bug / 卡死 / 反直觉行为列表**：

1. **Space 不是暂停，是切到 Erase 工具**：reviewer prompt 和官方 Help 都明明白白写「Space pause/resume」，实测按 Space 后底部 toast 显示「Selected tool: erase」。**严重热键 bug**。
2. **L 既切 Heat Lens 又切 Fertility Overlay**：按 L 的同时左上角弹「Overlay: Fertility」「Overlay: Elevation」之类。两个本应独立的图层叠加触发。
3. **AI Log 按钮触发了 navigation**：点 AI Log 后页面 URL 从 `/` 跳到 `/?template=fertile_riverlands` 又跳到 `/?template=archipelago_isles`，整个游戏被踢回 splash 屏。我重开了 4 次。
4. **Heat Lens 标签 14 连发 「halo」**：黑底白字「halo」在地图上重叠堆栈，根本看不出是哪个建筑的 halo，也没图例说「halo」是啥意思（halo / surplus / supply surplus / warehouse idle / input starved 五种标签同屏）。
5. **「north timber gate / north gate / south granary」标签自我重叠**：5:44 的截图里能看到 north gate × 2、south granary × 2 完全压在同一个建筑上，是渲染重复 bug。
6. **HUD 里 Workers 图标的语义不一致**：截图里看到 `200 / 4 / 1 / 0 / 13`，13 是 Workers，但同张图右下「Population: Workers 0」，两边数字不同步。后来又见到「Workers 18, Visitors 4, Herbivores 2, Predators 1」也对不齐 HUD 顶栏的 29。
7. **Try Again toast 跟 Run started toast 重叠**：左下区出现「Run started: Temperate Plains (96x72 tiles). Build the starter network now. Try Again replays this layout; New Map rerolls.」一段长 toast 占据整个左下角，遮住 Entity Focus 列表的最后一两条。
8. **AI proxy unreachable**：「AI proxy unreachable (timeout). Running fallback mode.」「Why no WHISPER?: LLM never reached / LLM errored / LLM quiet」—— 这些状态信息暴露给玩家是一个严重的产品判断问题。**普通玩家根本不该知道你后台有 LLM 调用**，更不该看到「LLM errored」这种字眼，相当于汽车仪表盘上写「ECU 出错，正在用备用程序开车」。
9. **侧栏面板 Build / Colony / Settings 有时不响应**，需要先点 ← 折叠再展开，或者刷新页面。

**心流评分：1/10**。即使加速到 ×4 都觉得在等。

---

## 八、和 RimWorld / Banished / Frostpunk 的对比

- **vs RimWorld**：相似点是 named worker + traits + relationships + memory stream + decision-context 解释。这是 RimWorld 的灵魂部分。但 RimWorld 用「事件驱动」（袭击 / 心理崩溃 / 火灾 / 收养小动物）让玩家随时被打断；Project Utopia 没有事件，社会模拟变成纯背景噪声。**形似神不似，1/3 RimWorld**。
- **vs Banished**：Banished 也是慢节奏，但**资源 trade-off 非常清晰**：开荒、燃料、储粮、衣物、墓地，每一格都要算性价比。Project Utopia 这边连「这块地比那块地肥多少」的数据都得开 Fertility overlay 才看到，平时玩家无法决策。**Banished 的策略密度大约是这游戏的 3 倍**。
- **vs Frostpunk**：Frostpunk 是「道德决策 + 法案系统 + 倒计时」。Project Utopia 没有任何一个。生存的「冷酷选择」氛围完全没有。**差距 5x 以上**。

---

## 九、改进建议（按优先级）

1. **修热键冲突**（Space 应该真的暂停，L 应该不连带 Fertility 图层切换，AI Log 不应该刷页面）。这些是付费产品门槛，不修是 -2 分。
2. **HUD 数字一致性**：顶栏 Workers 数 = Population 面板 Workers 数 = Entity Focus 列表条数，必须一致。
3. **Heat Lens 标签去重**：每个建筑只打 1 个标签；建立图例（halo 是什么意思要解释）；冷热色用 saturation 区分而不是文字标签。
4. **加紧迫感**：要么加随机灾害（暴雨、瘟疫、蝗虫、冬天）、要么加敌人 raid（既然剧本写了 raiders breach 那就 follow through），要么加「资源耗尽倒计时」。**没有死亡威胁就不是生存游戏**。
5. **加分数 / Milestone 反馈**：每过 5 游戏分钟、或每 100 人口、或每个 First-X 阶段，给一个 satisfying score bump 和动画/音效。
6. **隐藏 LLM 后台失败信息**：把「LLM never reached」「AI proxy unreachable」改成「Story Director: pondering...」之类的 in-fiction 文案；LLM errored 应该静默重试。
7. **去掉「Loading Project Utopia」的全黑屏每次切换都跳出**。一次 session 里我看了 5 次这个 splash。
8. **加 tech tree / 时代解锁**，让 30 分钟和 5 分钟的游戏内容产生差异。
9. **首 5 分钟做 onboarding tutorial**：手把手教玩家点哪个，而不是丢一个简报+13个饿肚子工人就让他自己消化。
10. **多花点功夫在「玩家 agency」上**：比如让玩家自己安排 worker 的轮班、营养优先级、收割顺序，而不是把 90% 决策交给 rule-based AI。

---

## 十、结语

这个项目能感觉到工程师有一颗喜欢系统设计的心：人物关系、决策解释、剧本简报、Heat Lens、AI 自动驾驶 + 规则 fallback、procedurally generated 模板，每一项单拎出来都是亮点。但当 12 个亮点都没人帮玩家串起来、每个亮点又被一个 bug 或一个 UI 噪音拖累时，整体感受就是**「一桌散件，一盘没拼完的乐高」**。

我会给一个**3/10**：作为开源技术 demo 是合格的（+0.5），有人物关系深度（+0.5），有 6 张地图模板（+0.5），有 AI 决策可解释（+0.5）；但热键 bug 和导航 bug（-1）、玩家 agency 几乎为零（-1.5）、长期反馈缺位（-1）、UI 信息过载（-0.5）、缺乏紧迫感（-0.5）。

如果团队下一轮能拿掉 Heat Lens 噪音、修热键、加一个真正的死亡威胁、把 LLM 后台错误隐藏掉，分数能到 5/10。如果再加 tech tree 和 milestone 反馈循环，到 7/10 是有可能的。但目前的版本，付费玩家会在 15 分钟内退款。

— 01b-playability，2026-04-25
