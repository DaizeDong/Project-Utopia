# Round 8 盲测反馈：01a-onboarding

## 总评分（10 分制）

**4.0 / 10**

作为完全没接触过 Project Utopia 的付费外部玩家，我能看出游戏已经有“想教玩家”的意识：标题菜单有开局 brief，How to Play 有四个页签，局内右侧有 Build Tools、Construction 说明，错误点击会出现 toast，热力图和地形 overlay 也有快捷键提示。但从 onboarding 角度看，这些信息还没有形成一条可执行的新手路径。它更像把系统术语和机制摘要摆给玩家，而不是把玩家带过第一次成功闭环。我的首次体验是在读完帮助后仍然不确定“现在第一步到底点哪里、为什么点那里、成功了没有、下一步是什么”。

本轮通过浏览器实际体验了标题菜单、How to Play 四个页签、模板切换、新地图、开始殖民地、F1/? 帮助、暂停/继续、热力图、缩放、拖拽地图、1-12 工具热键、多次放置建筑/道路、无效地块点击、撤销/重做、等待游戏推进等 50+ 次交互，并保存了多张截图到 `screenshots/01a-onboarding`。

## 第一印象

标题页的氛围不错，背景地图和卡片式开场说明能立刻传达“殖民地刚落地、要修复物流”的主题。菜单 brief 里明确写了“西侧森林路”和“东侧仓库平台”，这是好的方向：它给了一个局部目标，而不是一上来让玩家面对完整沙盒。

问题是第一屏的信息密度和表达顺序不稳定。标题页说第一步是“Build a road to the west forest and put a warehouse on the broken east platform”，How to Play 的 Controls 页又说“先造 Farm、Lumber Mill、Warehouse、Road”。换成 Rugged Highlands 后，目标变成 “Reopen the north timber gate, reclaim the south granary, and stabilize two chokepoints”，但帮助页仍在讲通用资源链。作为新玩家，我不知道应该优先相信菜单 brief、帮助页、右侧 Construction 面板，还是地图上浮动的标签。

开始后视觉上能看到一片可探索区域、一些动物/工人/资源图标、右侧工具栏和底部速度控制。局内 UI 比菜单更像真实游戏，但新手落地时没有强制暂停、没有高亮第一个可点地块、没有任务 checklist，也没有“你刚刚完成了第 1 步”的确认。开局几秒后资源、工人状态、出生事件、AI/Autopilot、Dev 分数、热力图提示同时出现，玩家很容易从“我要修路”变成“我是不是已经错过了什么”。

## 核心教学缺陷

1. **没有可验证的第一分钟任务链。** 菜单告诉我要修路/仓库，但进入游戏后没有把目标拆成“选择 Road -> 点击这 3 格 -> 选择 Warehouse -> 点击此平台 -> 等工人搬运”。我可以按 1-12 切换工具，也可以乱点地图，但系统没有把我拉回正确路径。

2. **目标、胜负和评分解释仍然抽象。** 标题页写 “Survive as long as you can”，Threat 页写“run ends when colony cannot recover”，局内状态条写 “Survived 00:00:06 Score 11 Dev 47/100”。这些词都存在，但没有解释失败阈值、Threat 具体在哪里看、Dev 如何影响分数、为什么我 6 秒时是 Working colony。玩家知道“活下去”，但不知道“活下去靠什么指标判断”。

3. **帮助页是百科，不是教程。** How to Play 讲了资源链、Threat、AI director、热力图、模板差异，但没有任何图例、步骤图、示例截图或“现在试一下”。对复杂殖民模拟来说，文字解释只能降低一点陌生感，不能替代首次操作训练。

4. **局内反馈缺少因果闭环。** 例如无效点击会提示 “Cannot build on unexplored terrain. Scout this area first.”，资源不足会提示 “Need 6 more wood”，这些是有用的。但它没有告诉我“如何 scout”、哪位工人会 scout、是否需要建路才能 scout、为什么缺 wood、哪里有 wood、当前 Lumber/warehouse 是否可用。错误反馈停在原因，没有给修复动作。

5. **系统术语过早出现。** Autopilot、AI Log、WHISPER/DIRECTOR/DRIFT、DevIndex、prosperity、entropy、node health、traffic hotspot、input starved、scenario gap 等词在首次体验很快出现。它们可能是游戏特色，但 onboarding 没有先建立玩家最基本的心智模型：地块、建筑、工人、搬运、库存、威胁、失败。

## 具体场景问题列表

- 标题页默认地图为 Temperate Plains 时，地图上已经有 “west lumber route ×2”“east ruined depot”等标签，但点击开始后如果换过模板，目标文本、地图标签和帮助页通用建议之间容易断裂。
- How to Play 打开后默认停在 Resource Chain，而不是 Controls 或 “First 3 Minutes”。如果玩家第一次点击 How to Play，最想知道的是怎么开始操作，不是后期加工链。
- Controls 页写 “Open the Build panel (top-left)”，但实际局内 Build Tools 在右侧。这个方位差会直接伤害新手信任。
- 工具热键提示出现 “1-12”，实际键盘显示为 `1-0/-/=`，对普通玩家不直观；按钮上也没有把第几个键与具体建筑强绑定成可扫读格式。
- Construction 面板说明 Road “Cost: free” 和放置规则，但没有显示当前鼠标悬停 tile 为什么可放/不可放；错误 toast 消失后也没有在 tile 上留下持续标记。
- 选择 Clinic、Smithy 等建筑时，系统能显示成本和规则，但新手不知道这些属于第几阶段，是否现在应该建。没有“推荐/暂缓”的教学标签。
- 工人列表显示很多姓名、职业和饥饿状态，例如 FARM、WOOD、HAUL、SMITH，但没有解释职业是否自动分配、玩家能不能改、idle/seek task 的区别、谁会响应我的建筑命令。
- AI director 帮助页说右侧有 AI Decisions panel，但局内我看到的是 “AI Log” 按钮和 Autopilot 状态；新手不知道它是可选功能、辅助功能还是核心胜负机制。
- 热力图是好功能，但在第一次开启时只显示 Overlay/红蓝色块和 “input starved”等标签，缺少图例浮层。玩家需要知道红/蓝分别代表“过剩/缺输入”，但局内不应要求回忆菜单文字。
- 错误 “Cannot build on unexplored terrain. Scout this area first.” 没有后续引导。没有 Scout 工具、没有 scout 按钮、没有推荐路径，所以这是一个死胡同式反馈。
- “Need 6 more wood” 指出资源不足，但没有自动高亮最近 wood 来源、现有 Lumber 是否连通、仓库是否堵塞、工人为什么不采。
- 出生事件在很早阶段弹出，主题很有趣，但在第一分钟教学中会和关键建造反馈抢注意力。
- 没有专门的 combat/raid 教学。Threat 页只提到 raids 会拉高威胁，Wall 工具存在，但敌人从哪里来、什么时候来、如何防守、工人是否会战斗、受伤如何处理都没有被首次引导覆盖。
- 没有阶段性复盘。等待一段时间后状态变成 Dev 47/100、Working colony，但系统没有解释为什么更好或更坏。

## 前 5 / 30 / 60 分钟理解度推断

**前 5 分钟：** 玩家大概率能知道这是一个殖民地物流建造游戏，能找到建筑按钮，能暂停、缩放、打开帮助，也能理解食物、木头、石头、药草大致是资源。但玩家不一定能完成第一个正确物流闭环，尤其在模板目标不是 Temperate Plains 时更明显。

**前 30 分钟：** 愿意试错的玩家会逐渐知道道路、仓库、采集建筑、加工建筑之间有关联，也会开始理解热力图的价值。但因为错误反馈不带修复路径，很多人会把失败归因于“我不知道游戏要我干嘛”，而不是“我做了一个可学习的战略错误”。

**前 60 分钟：** 如果没有外部攻略，玩家可能仍无法稳定解释 AI/Autopilot、Threat、Dev、Prosperity、raid、防御、worker policy 的关系。复杂系统会显得有潜力，但 onboarding 没有足够支架让玩家从“看见系统”过渡到“掌控系统”。

## 与 RimWorld / Dwarf Fortress / Oxygen Not Included 的引导差距

RimWorld 的新手强项是把复杂殖民系统压成具体任务：规划仓库、指定工作、建床、处理需求，并持续用 alert 告诉玩家哪里会出问题。Project Utopia 目前有 alert 和状态文字，但缺少“从目标到点击”的连续任务链。

Dwarf Fortress 本身也复杂，但新版至少会用教程模式逐步介绍挖掘、指定区域、库存和矮人任务，让玩家先建立“命令不是即时执行，而是居民自动响应”的心智模型。Project Utopia 的工人自动决策和 AI director 更复杂，却没有先解释玩家命令、工人任务、物流执行之间的边界。

Oxygen Not Included 的优势是 overlay 和资源问题高度可视化：氧气、温度、电力、管道等都有明确模式和图例，并且早期目标围绕厕所、床、氧气、食物逐步展开。Project Utopia 的 heat lens 很有潜力，但缺少局内图例、缺少点击问题点后的诊断面板，也缺少“这个蓝色 input-starved 具体需要哪条链修复”的教学桥梁。

## 改进建议

1. 增加一个不可跳过但可关闭的 “First 3 Minutes” guided mode：暂停开局，逐步高亮 Road、可放地块、Warehouse 平台、Lumber/Farm，完成一步再解锁下一步。
2. 把标题 brief、How to Play 和局内任务统一成同一套模板目标。玩家选择 Rugged Highlands 后，帮助页首屏也应切换成对应开局路径，而不是仍讲通用农场开局。
3. 在局内右侧增加 “Current Objective” checklist，例如 “1/4 Connect north timber gate with roads”，“2/4 Build warehouse on south granary ruins”。每项都能点击镜头定位。
4. 错误 toast 增加修复动作：不能建在未探索地形时，提示“沿现有道路向这里修路以探索”并高亮最近可建 road tile；缺 wood 时，高亮 wood 来源和 Lumber building。
5. 给热力图加入局内图例和点击诊断：红色=库存/产物堵塞，蓝色=缺输入，点击蓝点显示缺什么、从哪里来、哪段路断了。
6. 降低第一分钟术语噪音。AI director、WHISPER、DevIndex、entropy、prosperity 可以保留在高级帮助里，但首次目标应优先讲“你下的建筑命令会由工人自动执行”。
7. 增加建筑阶段标签：Early / Next / Advanced。Clinic、Smithy、Wall、Bridge 等在资源不足或未遇到对应问题前，可以显示“稍后需要：治疗/工具/防御/跨水”。
8. 增加 worker onboarding：第一次点击工人时弹出短说明，解释职业、饥饿、Seek Task、Idle、搬运、玩家是否能直接控制。
9. 增加 combat/raid 预告教学：Threat 到某阈值会发生什么，Wall 如何防守，受伤需要 Medicine/Clinic，敌人路径如何识别。
10. 每 5 分钟给一次复盘卡：当前最大风险、已完成链路、下一建议建筑、为什么分数/Dev 改变。

## 一句话总结

Project Utopia 已经把很多机制说明放进了界面，但还没有把它们组织成新手能完成、能验证、能复盘的第一条生存链路；目前更像复杂系统说明书，而不是 onboarding 教程。
