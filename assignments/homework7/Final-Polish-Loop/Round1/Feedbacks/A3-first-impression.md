---
reviewer_id: A3-first-impression
round: 1
date: 2026-05-01
verdict: RED
score: 3
friction_count: 8
i_want_to_quit_at: 02:30
i_understood_the_goal_by: never
---

## 一句话定性

3 分钟后我"满头雾水地放了一个看不见的农场，桌面 30+ 个 hungry/blocked 的小人毫无反馈，我想关掉页面查菜单"。

## 时间线

[00:00-00:30] 标题屏。"Project Utopia" + 一段 briefing 文字（西边伐木路线 / 东边废弃仓库），还有 BEST RUNS 列表 (Score 182, Dev 21, 3:12 survived, "loss"…)。第一直觉：什么是 Dev？为什么前 10 个分数都几乎一样且都是 loss？这个游戏是不是注定要输？briefing 里出现 "Heat Lens / 红蓝热力图 / Broken Frontier" 等术语，我还没玩就已经在被术语轰炸。点击 Start Colony。

[00:30-01:30] 进入游戏。**第一眼信息过载**：顶栏 5 种资源 + 6 种建造目标计数 (routes 0/1, depots 0/1…)，左侧 20 个实体列表（已经分组：Critical hunger / Hungry / Blocked / Idle / Hauling / Combat / Other），右侧 13 个建造按钮 + 一面墙的快捷键说明，底栏播放控制 + Autopilot 开关 + AI Log。地图被裁得很奇怪——只看到正中很小一片绿地，"west lumber route" 圆圈在左、"east ruined depot" 在右，画面上下大半都是黑/水。我以为这就是地图全貌。

briefing 说"先修路通西边森林"，那我点 Road——但 Road 按钮当前已经选中了？右下"Selected Tool: Road, Cost: free"。我点了画面中央的 grass 上一下，**结果选中了一只 Bear-20（"Combat / Stalk well-fed"）**——我刚到 20 秒就有熊？右下还冒出红字"Target tile is unchanged"，但同时 Wood 从 35 变成 36，发生了什么完全不知道。

[01:30-02:30] 我又点了一次 Road 按钮显式选中，再点地图——这次画面**突然剧变**：地图大幅放大，覆盖一层蓝色"Connectivity Overlay"。原来真实地图比刚才看到的大十倍。这显然是 viewport 第一次自动缩放。我连续往 west lumber route 方向猛点，每次都跳出"Road at (XX,XX) extends the first network line."的绿色 toast——但**右上 routes 0/1 计数从来没有变成 1**，我不知道我修的路算不算数。地图中央莫名其妙出现一团 + 字形的绿色亮块（fertility overlay 自动启用了？），但这不是我想要的位置。

我打开 F1 Help，看到"Place a Farm on green grass — workers will harvest food"。OK，原来 Farm 才是当务之急。关 help，点 Farm，再点中心绿块——看到一个橘色方块出现在地图上（蓝图？），但 farms 0/6 计数仍然是 0，workers 列表里 6 个 Hungry / FARM 的小人**全部**还在 Wander，没人去建。**底栏小字"Autopilot OFF · manual; builders/director idle"**——但我从没被告知 builders 需要被分配，或者 Autopilot 是干什么的。

[02:30-03:00] 资源 Food 从 318 滑到 297，Wood 35→61（？没人砍树却涨了），Stone/Herbs 没动，时间显示 1:54。屏幕一团乱：Hungry 6、Blocked 4、"Last: Deer-17 died (predation)" 弹幕掠过。我已经放了"农场"，但不知道为什么没人建；我放了"路"，但 0/1 计数器不动；workers 列表里没有一个人在 "Build" 或 "Haul"。我此刻完全不知道下一步该点什么，**萌生关掉页面的冲动**。

## Friction 清单（按严重度）

### F1（P0）：起手 viewport 框得极差，看到的是地图的一小角而不是全图
- 出现时刻：00:30
- 我以为会发生：进入游戏后看到完整地图、起始定居点居中。
- 实际：viewport 只显示中央巴掌大一片，水/黑遮住了大部分视野。我以为这就是整张图（"96x72 tiles"原来这么大？）。在我第一次成功放下 Road 之后才"啪"地放大到全景，但没有任何提示。
- 影响：**反复尝试**，导致前 60 秒我以为可建造区域很小。
- 改进建议：默认 viewport 应展示完整起始基地 + 两个任务地标（west lumber route + east ruined depot）同框。

### F2（P0）：左键点击行为对工具的依赖**毫无视觉反馈**——Road 工具明明已选中，第一次点却选中了一只熊
- 出现时刻：00:50
- 我以为会发生：选中 Road→点击地块→放置 Road。
- 实际：第一次点击穿透到一只 Bear（"Combat / Stalk"），并弹出"Target tile is unchanged"的红字（但 Wood 计数还偷偷动了一格）。
- 影响：**反复尝试 + 怀疑工具到底有没有选中**。
- 改进建议：鼠标光标根据当前工具改变形状（cursor: crosshair / 工具图标）；选中 Road 时 hover 任意 tile 必须有蓝色幽灵预览；红字 "Target tile is unchanged" 应该说明**为什么**（比如"已是 Road 不能重叠"或"和动物冲突"）。

### F3（P0）：briefing/HUD 顶部计数器 (routes 0/1, farms 0/6…) 不会因为"放置蓝图"而前进——shouldve gauge progress
- 出现时刻：01:30
- 我以为会发生：放下 Road → routes 计数器跳到 1/1。
- 实际：toast 提示"Road extends the first network line"，但 routes 0/1 一直定格 0。我不知道是 toast 在骗我、还是计数器要等真正建好才更新、还是我修的路连接错位置。
- 影响：**完全失去进度感**，怀疑全部操作都白费。
- 改进建议：toast 与计数器必须同步；蓝图阶段就把分子从 0→0.5 用半透明色填充，建好再变 1。

### F4（P1）：Farm 蓝图放下后没有任何 worker 走过去建造，没有解释为什么 builders/director idle
- 出现时刻：02:20
- 我以为会发生：放下 Farm → 一个工人走过去带着锤子建造 → 建好出现农作物 → 食物增长。
- 实际：橘色方块原地不动，所有工人列表里仍是 "Wander hungry"，没人切换到 BUILDER 状态；底部小字"builders/director idle"——但我没被告诉 builder 是分配出来的角色、Autopilot 关闭意味着我得手动指派、或者干脆缺一个 Warehouse 才能开工。
- 影响：**放弃**——我完全不知道哪一环出问题。
- 改进建议：蓝图旁边浮显"Waiting for: Builder / Wood / Logistics"等阻塞原因；首次放蓝图自动弹小气泡"Workers will start building once they reach the tile"。

### F5（P1）：Autopilot OFF 的含义对新手不明
- 出现时刻：00:35（首屏即出现"Autopilot OFF · manual; builders/director idle"）
- 我以为会发生：Autopilot 是帮助提示之类的可选辅助。
- 实际：好像没开 Autopilot 就连建造工人都不会自动派？这究竟是 hard requirement 还是建议？
- 影响：**犹豫**，第二局可能直接打开 Autopilot 让 AI 替我玩，反而更糊涂。
- 改进建议：首屏应当弹一次性 onboarding modal，明确"你的工人会自己干活，但建造任务需要你下达 / 或开 Autopilot"。

### F6（P1）：左侧实体列表分类 (Critical hunger / Hungry / Blocked / Idle / Hauling / Combat / Other) 看起来重要但点开没有引导
- 出现时刻：00:40
- 我以为会发生：点 Hungry tab 把所有饥饿工人筛出来，看到"为什么饿"。
- 实际：列出的每个工人都标着 "Hungry / FARM Wander hungry"——我只看到一连串 Wander 状态，看不出 root cause（是没食物？没仓库？路径堵了？）。
- 影响：**视觉层级失败**——这块 200×400 的面板在第一分钟没给我任何 actionable 信息。
- 改进建议：在 Hungry 标题下显示一句"4 workers can't reach food. Cause: no warehouse"作为聚合诊断，而不是每行重复 "hungry"。

### F7（P2）：Heat Lens / Terrain Overlay 自动激活但没说"已开"
- 出现时刻：01:18（点 Road 之后画面变蓝色 Connectivity）→ 02:00（点 Farm 之后画面变 Fertility）
- 我以为会发生：overlay 是 L 键手动开启的。
- 实际：选了某些工具会自动切 overlay，画面颜色突变，第一感觉是"游戏 bug 了"。左上角小字 "Overlay: Connectivity / Fertility"——但太低调。
- 改进建议：自动切 overlay 时弹 1 秒大字 toast"Auto-overlay: Fertility (best soil for farms)"，并在 overlay 名称旁配一个图例条。

### F8（P2）：BEST RUNS 列表全是 "loss"，新手未玩先沮丧
- 出现时刻：00:10
- 我以为会发生：高分榜激励玩家。
- 实际：前 10 名都是 Score 17x、Dev 21、3:12 survived、loss——给人"这游戏 3 分钟就 GG 了"的暗示。
- 改进建议：首次启动隐藏 BEST RUNS，或至少不要标 "loss"；用 "Best survival run: 3:12" 这种正向措辞。

## 与同类作品的预期对比

如果我玩过 RimWorld，我会预期"放下蓝图 → 工人自动跑过去建"，但这里似乎需要 Autopilot 或手动调度，且没有明显标识。

如果我玩过 Banished / Cities: Skylines，我会预期"建筑放下后看到工地动画 + 进度条"，这里只有一个静态橘色方块，看不出在建造、还是被什么 block。

如果我玩过 Frostpunk，我会预期"屏幕角落有一两条主目标 + 当前阻塞原因"，但 Project Utopia 的顶栏计数器 (routes 0/1 etc.) 看起来是目标，却不更新；左下角"builders/director idle"看起来是阻塞，却没解释。

## 结论

我不会继续玩第 4 分钟。原因：3 分钟里我没有得到一次"哦我搞懂了"的瞬间——既不知道目标是不是"修路 + 仓库 + 农场"还是 survive 倒计时，也不知道为什么我的指令（放路、放农场）看起来生效又看起来没生效。最关键是 worker 不动手 + 计数器不前进 + Autopilot 含义不明，三件事叠加让我感到自己在按按钮但游戏完全不响应。
