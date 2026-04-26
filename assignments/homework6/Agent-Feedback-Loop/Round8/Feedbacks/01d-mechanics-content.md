# Round 8 盲测反馈：01d-mechanics-content

## 总评分（10 分制）

**6.2 / 10**

这次只从当前浏览器 build 的实际可见体验评测，不参考源码、文档、历史反馈或作者意图。整体结论是：Project Utopia 已经有殖民地模拟的雏形，而且机制标签和信息面板比普通原型丰富得多；但它目前更像一个“带有大量策略文字说明和自动调度日志的资源沙盘”，还没有稳定形成真正可玩的长期殖民地模拟。它能展示资源、建筑、角色、路线、热力、事件和死亡，但很多深度停留在 UI 文案、状态列表或自动系统解释上，玩家可感知的因果链仍然不够清晰。

本轮实际交互超过 30 次：点击 Start Colony，切换 Farm、Lumber、Quarry、Herbs、Kitchen、Smithy、Clinic、Warehouse、Road、Wall、Bridge、Select 等工具，在地图上多次落点建造或尝试建造，切换 Heat、Terrain、Help，检查工人详情，开启 Autopilot，使用 4x/8x 推进，打开 AI Log，并推进到出生、首餐、首个工具、资源告急、饥饿死亡、Autopilot struggling 等多个阶段。截图保存在 `screenshots/01d-mechanics-content/01-started.png`、`02-worker-detail.png`、`03-autopilot-advanced.png`。

## 机制第一印象

第一印象是“内容入口很多，但玩家抓手偏弱”。开局 briefing 明确提示西部伐木路线、东部废弃仓库、热力图含义和首要建设方向，这对新玩家很友好。进入游戏后，顶部资源栏显示 Food、Wood、Stone、Herbs、Workers，右侧有建筑工具，左侧有实体聚焦列表，底部有暂停和速度控制，地图上有路线标签、废弃仓库标签、工人/动物图标和道路网络。作为机制呈现，它明显不是空壳。

问题在于，开局几秒内系统已经自动出现“First extra Warehouse raised”“First Kitchen raised”“First Meal served”等里程碑，玩家还没有做出足够明确的决策，就已经看到机制自行推进。手动点击工具和地图时，反馈多是“Insufficient resources”“Need 1 more wood”“Clear the road before building here”“Target tile is unchanged”这类短提示，但这些提示没有和地图预览、建筑排队、工人执行过程形成足够强的可读闭环。玩家知道某事失败，却不容易知道为什么这个格子、这条路、这个建筑在整个殖民地系统中是否重要。

## 内容广度与重复度

建筑广度不错：可见建筑包括 Road、Farm、Lumber、Warehouse、Wall、Bridge、Quarry、Herbs、Kitchen、Smithy、Clinic，覆盖了基础采集、物流、储存、加工、防御、跨水、医疗等多个方向。帮助页还说明了资源链：Farm 产 Food，Kitchen 制 Meals；Lumber 产 Wood；Quarry 产 Stone，Stone + Wood 经 Smithy 产 Tools；Herbs + Clinic 产 Medicine。单看列表，已经接近殖民地模拟应有的基础内容。

但重复度也明显。角色列表一开始有十几名工人，后期人口增加到二十多人，但多数行的差异主要是 Role、State、饥饿程度和名字。实际观察中大量工人状态在 Seek Task、Seek Food、Eat、Seek Rest、Wander、Harvest、Process 之间循环，阅读感上比较重复。事件日志也以出生、动物死亡、饥饿死亡、资源不足、路线/仓库标签为主，缺少事件类型的扩展，例如天气、疾病、袭击、贸易、迁徙、建筑损坏、季节变化、情绪冲突等。玩到中期时，最突出的变化是人口暴涨后食物/木材压力和连续 starved，而不是出现新的策略阶段。

## 资源 / 建筑 / 事件 / 角色系统问题

资源系统有基本闭环，但平衡和可解释性不足。Food 从 400 多快速下降，Wood、Stone、Herbs 在低位波动，开启 Autopilot 后能看到 Dev 51/100、Score 106、Working colony、Wood runs out in 55s 等状态。问题是资源变化太快，且玩家很难从 UI 上判断哪个建筑正在消耗什么、哪个工人负责补哪个缺口、哪个仓库堵塞。帮助文本说 processors pull from storage，但地图上看不到储存量、加工队列、建筑输入/输出库存，也无法明显看出某条道路减少了多少搬运成本。

建筑系统的种类丰富，但交互落点的规则不够透明。Road 的说明写着可修补断裂供应线、道路必须从已有基础设施延伸或修复场景缺口；Clinic 说明需要 Herb Garden 支撑；Smithy 说明工具提升采集速度。这些文案很好，但实际点击时，玩家得到的多是资源不足或目标不变，缺少“这座建筑缺输入”“这个格子不满足 fertility/connection”“建成后预期产出”的可视化因果。Wall 和 Bridge 有按钮，但本轮没有看到威胁或水路瓶颈让它们成为必要选择，因此它们更像预留内容。

事件系统有出生、动物 predation、首餐、首工具、饥饿死亡、Autopilot struggling、资源耗尽预警。它们能制造殖民地活着的感觉，但事件之间缺少玩家可预测的节奏。出生发生很快，人口从 13 增到 28，随后多名工人饥饿死亡，像是系统自我膨胀后自我崩塌。作为模拟，这有一定戏剧性；作为可玩游戏，玩家需要更早看到人口增长的原因、食物需求曲线、是否能限制生育或迁入、死亡对劳动力和生产链的后果。

角色系统文本丰富。工人详情显示 backstory、specialist、temperament、Policy Focus、Policy Summary、Policy Notes、Type、Role、Group、State、Intent、Hunger、Health、Carry、Attack CD。这个面板是本 build 的亮点，尤其 Policy Notes 能解释系统为何让工人优先吃饭、送货、修复断路或减少拥堵。但角色差异仍然偏“说明性”：woodcutting specialist 是否真的比别人砍木快、resilient temperament 是否影响饥饿/疾病/战斗，本轮体验中没有足够可见证据。

## 可见因果链

目前最清楚的因果链是：Farm 提供 Food，Kitchen 把食物转为 Meals，Meals 改善 hunger；Quarry + Wood 经 Smithy 产生 Tools；Herbs + Clinic 产生 Medicine；道路/仓库影响物流；人口增长提高食物压力；资源不足阻止建设；饥饿最终导致死亡。帮助页和状态日志把这些链条写出来了，角色面板也会解释政策选择。

真正可见的问题是，因果链更多是“文本告知”，不是“模拟显现”。例如 First Tool forged 出现后，帮助说工具有 +15% harvest speed，但屏幕上没有看到采集速度、单位效率、前后对比或产能曲线。热力图说明红色代表堆积、蓝色代表等待输入，但推进中我能切换 overlay，却难以从画面稳定识别哪个建筑因何变红或变蓝。资源告急和 starvation 的关系很明显，但为什么 Autopilot 仍让很多人 Wander 或 Seek Food、为什么某些路线没有解决东部 depot、为什么人口暴涨，都不够清楚。

## 缺失机制或假深度

作为殖民地模拟，当前缺少几个关键层次。第一，天气和季节没有明显呈现；地图模板有 Temperate Plains、Highlands、Archipelago 等，但本轮实际玩到的长期变化主要是资源和人口，没有气候周期。第二，威胁系统存在文字暗示和 Wall 按钮，但没有观察到清晰敌人、袭击、防线压力、破坏、警报或胜负后果。第三，目标系统偏弱，顶部写 Survive as long as you can，后期有 Score 和 Dev 51/100，但没有明确阶段目标、胜利条件、失败倒计时或殖民地评价。第四，建筑链虽然列得完整，但缺少建筑等级、维护、损坏、升级、替代路线、生产配方选择等长期决策。

“假深度”主要体现在 UI 文案密度很高，却没有同等强度的操作结果。Policy Notes、scenario gap、entropy、development score、depot congestion、heat lens 都是有潜力的概念，但如果玩家不能通过操作看到它们如何改变地图状态，它们就会像一层高级术语。Autopilot 也有类似问题：它能快速制造内容，甚至让殖民地从 Working colony 走到 starvation collapse，但玩家会变成旁观日志，而不是经营者。

## 改进建议

1. 把资源链做成建筑级可视化：每个生产建筑点击后显示输入库存、输出库存、等待原因、最近 30 秒产量、负责工人、物流距离。这样 Farm、Kitchen、Smithy、Clinic 的链条会从帮助文本变成地图上的可诊断系统。

2. 为道路和仓库补充预览反馈：放置前显示是否连通、预计减少的搬运距离、哪些建筑会受益、当前堵点在哪里。现在“道路修补断链”的概念很好，但需要让玩家看到修了以后发生了什么。

3. 控制人口增长节奏并增加人口政策：出生很快让殖民地热闹，但也导致食物压力突然失控。建议加入住房、家庭、迁入许可、配给、工作优先级等机制，让人口增长成为玩家选择，而不是系统噪声。

4. 做实威胁和天气：Wall、Medicine、Health、Attack CD 已经暗示防御/伤病系统，下一步应该让袭击、野兽、风暴、寒潮、疾病或洪水至少一种成为可见压力，并与建筑/角色/资源形成互动。

5. 明确阶段目标：除“活得越久越好”外，可以加入第一阶段修复西路、第二阶段重建东仓、第三阶段生产工具、第四阶段抵御袭击或达到 Dev 100。这样玩家更容易判断自己是在进步还是只是在看模拟滚动。

6. 减少只靠文案解释的深度：如果工具提升 15% 采集速度，就显示采集条变快；如果工人 temperament 有影响，就在角色表现上给出差异；如果 depot congestion 存在，就在仓库或道路上显示拥堵队列。

## 一句话总结

Project Utopia 已经有资源链、建筑列表、工人状态和事件压力的可玩雏形，但当前深度主要靠文字说明和自动日志支撑，玩家仍缺少能直接观察、预测和操控的因果系统。
