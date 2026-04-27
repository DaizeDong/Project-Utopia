---
reviewer_id: 01b-playability
round: 5
date: 2026-04-24
score: 3
source: claude-agent-sdk general-purpose subagent
build_url: http://127.0.0.1:5173/
---

# 可玩性评测 — Project Utopia

## 总体评分：3 / 10

一句话总结：**视觉上像一款殖民地模拟游戏，玩起来像一个跑在角落里的开发者仪表板。** 启动流畅、UI 元素丰富，但核心玩家回路（决策→压力→反馈→再决策）几乎不存在；Autopilot 更是把"游戏性"直接关掉，剩下的是一个在播放自己本身的屏保。

---

## 前 30 分钟体验（约实测 2–3 分钟真时长、折合若干游戏内分钟）

开场体验被"Broken Frontier"剧本做了个短简报：重连西部木材线、夺回东部物资点、再扩张。听起来有节奏感。点 Start Colony 之后进入地图，HUD 给了一堆数字：Food 110 / Wood 7 / Stone 4 / Herbs 0 / Workers 13，顶部还挂了一排目标勾勾（routes 1/1, depots 1/1, warehouses 7/2, farms 4/6, lumber 3/3, walls 7/8）。

问题马上来了：

1. **目标已经"自动完成"了一半**。开场 10 秒就弹出"First Lumber camp raised"，也就是说启动瞬间剧本的一部分已经被 bootstrap 脚本完成了。玩家还没做决定，系统已经在替他打勾。这直接把"第一次胜利感"提前消费光。
2. **Heat Lens 的图例是"surplus / starved"，但实际画面上几乎看不到强烈的热力变化。** 我按 L 打开，期待看到缺粮红点或堆积蓝点，结果只是图例浮出，地图本身没有显著的配色梯度，提示功能和视觉语言之间有明显脱节。
3. **资源数字跳动乱序**。颜色/箭头时好时坏：同一个 Food 值，一会儿显示 ▲ +2.3/min，再过 10 秒变成 ▲ +66/min，再变 ▲ +26/min。这种速率估计只用很短窗口，玩家根本读不到趋势，只会被 IIR 抖动。

前 30 分钟应该是"我在做选择"的阶段，但我实际做的只有：选一下 Build Tool，尝试放 Farm（显示"Insufficient resources"但我 Wood 明显 > 5，UI/规则错位），没有任何一次真正意义上的决策被系统接纳。

评分：**2/10**。

---

## 中期体验

开启 Autopilot 后游戏直接瘫成一个观察窗。顶部 banner 常年写着 `Autopilot ON - fallback/fallback - next policy in X.Xs`。关键点：

- **Autopilot 一直停在 fallback/fallback**，没有任何策略切换发生。LLM 未接入、规则兜底在跑，但兜底策略看起来和"什么都不做"差别不大。
- 游戏内跑过 1:33 后，剧本目标依然：farms **4/6**（开场就是 4）、walls **7/8**（开场就是 7），**零进展**。唯一动的是 warehouses 7/2 → 9/2（过度重复建同一种建筑），以及 lumber 3/3 → 5/3（超建）。
- Dev 指数停在 **49/100**，完全不动，像仪表盘冻死。
- Population / Role 面板：COOK=0、HERBALIST=0、Meals=0、Medicine=0。明明 UI 里给了 Kitchen、Clinic、Smithy、Herbs 这些建筑按钮，Autopilot 根本不碰加工链；整个"深度"只存在于描述文字里。
- 唯一的"事件"是一只 Herbivore-18 被 Predator 吃了。没有后续，没有玩家能做的事。

中期本应出现压力、出现权衡、出现抉择。这里全是静止的数字。评分：**3/10**。

---

## 长期体验

所谓"长期"我并没有真正拿到，因为游戏本身把"长期"演成了"继续静止"。分数（Score）几乎按秒线性增加：10s=15、37s=47、54s=69、1:14=99、1:33=128。**分数就是一个计时器 × 某系数**，不是胜利度量。没有死亡、没有饥荒、没有袭击、没有季节切换视觉、没有 milestone 弹窗。survival 模式本该靠"撑得越久越难"来制造张力，但我在可观测窗口内没看到任何加剧信号。

画面上你能看出时间确实在跑——工人小人在地图上晃来晃去、木材点被砍——但玩家视角上，这和一个循环播放的 gif 区别有限。评分：**3/10**。

---

## 决策深度

名义上的决策空间：12 个建造工具（Select/Road/Farm/Lumber/Warehouse/Wall/Bridge/Erase/Quarry/Herbs/Kitchen/Smithy/Clinic）、6 个地图模板、Autopilot 开关、速度控制、Heat Lens。纸面丰富。

实际决策深度：

- **玩家手动放建筑的成本/规则检查模糊**。Farm 显示 "Insufficient resources"，但 HUD 的 Wood 读数明显高于 5。要么 cost 规则有隐藏的仓储/road 连通前置（描述里提到"Farms need nearby logistics access"），要么 UI 没把 blocker 原因讲清楚。前者是深度，后者是 bug；但从玩家感受上两者都是"我点了，没反应"。
- **点击 canvas 没反馈**。Reviewer 约束我只能用浏览器交互；我做了多种合成事件派发，游戏对 canvas 点击毫无可见响应（也可能是因为 synthetic PointerEvent 不走底层）。但即便这只是自动化适配问题，作为人类玩家我也观察到：hover 提示写着"Hover a tile to preview cost, rules, and scenario impact"，可实际我没看到任何 tile-level hover tooltip 出现过。
- **Autopilot ↔ 手动**之间的切换不提供回馈：打开 Autopilot 并不会向玩家解释它"正在做什么"，关掉它也不会显示"接下来轮到你做什么"。这是策略游戏里最该有的交接仪式，这里完全缺失。

权衡感：几乎为零。所有资源都在慢慢涨，没有 trade-off。评分：**3/10**。

---

## 反馈循环

- **短期反馈（秒级）**：弱。放建筑没有音效、没有震动、没有 particle；资源数字只给一个微小的上下箭头。
- **中期反馈（分钟级）**：有目标勾勾栏，但它既会在开场被脚本自动打勾，又会长期不动，变成"装饰"。"First Lumber camp raised" toast 只出现一次，之后再无类似节点提示。
- **长期反馈（全局）**：Dev 指数是个看似重要的总分，但它卡在 49/100 不动；Score 则是计时器。玩家永远不知道"我做对了什么""我做错了什么"。
- **负反馈**：一条 "Herbivore-18 died - predation" 日志。没有伤亡、没有饥荒警告、没有入侵预警。survival 模式声称会变难，可视化上完全看不到。

整体循环是**空心的**：系统内部 (per CHANGELOG-style 说辞) 可能在跑 yieldPool、fatigue、salinization 一堆东西，但没有一个 surface 给玩家。评分：**2/10**。

---

## 情绪曲线

- **0:00–0:20**：好奇。简报写得像正经剧本，UI 有层次，Start 按钮有仪式感。
- **0:20–1:00**：困惑。"我按的按钮为什么没反应？""Autopilot 是托管还是挂掉了？""Heat Lens 为什么看不出热力？"
- **1:00–2:30**：倦怠。目标不动、数字乱跳、工人在同一块地来回磨蹭。典型的"这游戏在等我做什么，但我不知道该做什么"。
- **2:30 往后**：想关掉。没有任何 hook 把我再往前拉。

和真正会让人上瘾的殖民地模拟游戏比，这里缺了最关键的"我再玩一分钟就能……"的钩子。

---

## 和 RimWorld / Banished / Frostpunk 对比

- **对比 RimWorld**：RimWorld 的核心是"角色故事"——每个 pawn 有名字、特质、心情、关系。Project Utopia 这里的工人只是匿名色块，没有 ID、没有背景、点击一下也没有 inspect 面板主动弹出。RimWorld 5 分钟能让你记住一个人的名字；这里 5 分钟我连能不能 focus 单个 worker 都没确认到。
- **对比 Banished**：Banished 的压力来自季节、疾病、食物多样性。Project Utopia 号称有 soil/salinization/fog/recycling/fatigue/spoilage——但表层没有任何一个系统对玩家可见。Banished 会给你 GUI 明确告诉你"这个房子缺柴火，人会冻死"；这里只告诉你一个 Dev=49。
- **对比 Frostpunk**：Frostpunk 的张力来自法案选择、道德困境、温度曲线。Project Utopia 没有任何显式的剧情抉择、任何 UI 上的道德选项、任何倒计时式威胁。剧本简报说得很戏剧，执行起来像一个被 mute 的模拟器。
- 共同缺口：**可读的失败条件**。上述三款游戏玩家随时能说出"我离死有多近"。Project Utopia 我玩了 1 分半，完全不知道"死"这个状态存不存在。

---

## Bug / 卡点记录

1. "Insufficient resources" 红字在 Wood 充足时仍然显示，tooltip 没解释为什么（疑似 logistics/road 连通前置被当作 cost 缺口来报错）。
2. Autopilot banner 长期显示 `fallback/fallback - next policy in X.Xs`，但 next policy 好像从来没真的切换过。
3. 后台 tab 有明显节流：60 秒真时间只推进了 10 秒游戏内时间，速度按钮状态和实际推进不同步，玩家无从判断"游戏是卡了还是被浏览器压了"。
4. Heat Lens 的图例浮现，但地图上的热力差异肉眼几乎不可见，功能性不足。
5. Hover tile 理应有 cost / rules / scenario impact preview，实际我没触发出来（synthetic hover 的局限，但人类玩家也应该能被告知 hover 到哪里）。
6. 剧本目标（farms 4/6、walls 7/8）在 Autopilot 下长期不进展，说明 fallback 策略优先级与剧本完成度完全解耦。
7. 分数（Score）显然只是 `time * k`，和策略表现没有相关性。这让 survival 模式失去意义。
8. Console 报了 1 条 error（未深入检查来源，但作为盲审玩家我关心的是"它警告了我一下，又没告诉我什么东西挂了"）。
9. 死亡事件 "Herbivore-18 died - predation" 进 toast，但没有进任何一个持久化的 event log 面板供我回看。
10. 开场 bootstrap 自动替玩家完成 routes/depots/warehouses/lumber 这几项，剥夺了玩家体验开局成长的机会。

---

## 重玩价值

6 个地图模板 + 尺寸可调 + Autopilot on/off，理论上有 24 种组合起手。但当：

- 单局内部决策稀薄；
- Autopilot 跑成同一个 fallback 样貌；
- Score 只是计时器；
- 反馈事件几乎没有；

……两局之间的**可感知差异**会非常薄。Rugged Highlands 和 Fertile Riverlands 的差别需要玩家真的读到产出曲线才能感知，但产出曲线本身就不可读。重玩价值评分：**2/10**。

---

## 心流评估

心流需要：明确目标 + 即时反馈 + 挑战–能力平衡 + 专注屏蔽干扰。Project Utopia 在这四条上：

- 目标：有 checklist，但自动打勾 / 长期不动，目标感被稀释；
- 即时反馈：弱到几乎没有；
- 挑战–能力平衡：无压力 = 无挑战，能力过剩；
- 专注：被"自己在干嘛 / 在不在动"的元问题反复打断。

心流：**0**。

---

## 改进建议（给开发者）

1. **强制 Autopilot 可视化自己在思考什么**。每次策略切换都应该在一个专门的 log 面板里写一行"优先扩大食物产能，因为 Food 净流 < 0"。否则玩家没法信任它，更没法从它身上学策略。
2. **Score 必须和玩家行为挂钩**。把计时系数降到次要位置，拿人口健康、加工链开工率、Dev 指数增量这种东西做主要分母。
3. **Dev 指数的卡住必须给出原因**。"49/100 — 下一档需要：Meals ≥ X, Tools ≥ Y, Clinic ≥ Z"。现在它就是个冻住的数字。
4. **建筑建造失败必须说明真实原因**。"Insufficient resources"不能是万能报错。把 logistics access、road adjacency、moisture 级别等 blocker 分项写出来。
5. **给 worker 做 identity pass**。名字、职业、一点个性，这是 RimWorld 从第 1 分钟就开始做的事。
6. **开场不要替玩家做事**。让玩家亲手放第一个 Lumber camp、亲手接上第一条 road，成就感立刻建立。
7. **survival 模式的难度曲线必须可视化**。给一条"Threat level"进度条、第 N 天会来袭、天气会变差，让玩家能预期和部署。
8. **Heat Lens 的色彩梯度需要加强**。现在的图例诚实地说明了颜色语义，但地图本体色差太弱。
9. **tile hover tooltip 需要在人类鼠标下真的出现**，并显示适用规则。
10. **剧本 DIRECTOR 台词过度啰嗦且自我重复**（"push the frontier outward while keeping the rear supplied" 这句话在描述里出现了两次并且前后半句是同一个短语）。叙事层也需要一次编辑收敛。

---

## 最终复述

Project Utopia 在"系统深度"这一侧堆了很多东西（Changelog / 代码层可以看到一长串：yieldPool、salinization、fatigue、recycling），但它在"玩家感受"这一侧几乎交了白卷。**当一款殖民地模拟游戏开了 Autopilot 后 1:33 内场上零死亡、零事件、零目标推进、Dev 不动、分数只是计时器——它就已经输掉了"游戏"这个定义**。给 **3/10**，额外 1 分给 UI 布局和剧本文本有真诚感，扣回来是因为那份真诚没有被任何玩家可感知的 loop 兑现。
