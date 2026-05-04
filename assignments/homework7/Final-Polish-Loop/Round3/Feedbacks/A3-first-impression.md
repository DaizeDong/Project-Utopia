---
reviewer_id: A3-first-impression
round: 3
date: 2026-05-01
verdict: YELLOW
score: 4
friction_count: 7
i_want_to_quit_at: 02:30
i_understood_the_goal_by: never
---

## 一句话定性

3 分钟后我"放下 3 个 road tile，但完全不知道自己在玩什么、目标是什么、也不知道刚才那 3 次点击到底有没有效果"。

## 时间线（必须按时间戳）

[00:00-00:30] 加载到主菜单。标题 "Project Utopia" 清晰，副标题 "Your colony just landed. The west forest is overgrown — clear a path back, then rebuild the east warehouse." 让我以为我大概知道目标了——我以为是个殖民地生存游戏。但下面那块 "Best Runs" 列表全是 "loss"，第一感觉就是"哦这游戏一定要输的，我也会输"。还看到 "Survive as long as you can" 的 ∞ 图标——居然没有一个可量化的"赢"目标。Template 下拉、Map Size、一堆hotkey hints (1-12 tools, RMB drag, Scroll zoom, L heat lens) 直接砸在脸上。我还没玩呢就要消化 ~10 个键盘提示。点 "Start Colony"。

[00:30-01:30] 进游戏。**屏幕上至少 7 块独立 UI** 同时出现：左上角资源条（Food 319 / Wood 34 / Stone 15 / Herbs 0 / Workers 12，**没有任何单位**——319 是什么？人份？吨？天？）；左中是 Entity Focus 列表，里面 "Senn Elm Hungry / WOOD Wander hungry"——什么是 WOOD？职业吗？为什么 Hungry 同时又 Wander？还有 "Snare-14 Blocked / (saboteur) Scout well-fed"——saboteur 在我自己的殖民地里？我没招他啊；右边是 Build Tools (12 个图标)；上方是个 "routes 0/1, depots 0/1, warehouses 0/2, farms 0/6 ..." 的进度条阵列；下方是 entity inspector；最下是播放控制；右侧还有 Colony / Settings / AI Log / Heat / Terrain / Help 标签栏。**我此刻完全 lost**——该看哪？

[01:30-02:30] 想起briefing说 "build a road to the west forest"。看到 Road tool 高亮（号码 1）。点地图中央——弹出 tile inspector 写 "GRASS Passable, Elev 0.88, Moisture 0.00, Fertility Poor, B = build · R = road · T = fertility"。**我以为左键就能直接放 road**（Road 已经选中了啊？），但实际只 highlight 了一个 tile。**下面那行 hint 里的 "B = build" 误导我以为要按 B 才能下建筑**，按 B—— 没反应。再点 Road 按钮一次，整个地图突然变成黄/蓝渲染（"Tool: Road · auto-overlay: Connectivity"）——我以为我开了什么调试模式，**完全不知道刚才那次点击切换了什么状态**。再点地图，左下角 toast 闪过 "Road at (48,35): 1 segment placed, 0/2 route anchors linked." —— 哪两个 anchor？(48,35) 在哪？我看不见我刚放的 road，因为蓝/黄 overlay 太花了把它盖住了。

[02:30-03:00] 我此刻是想关掉的。点 F1 打开 Help——上面写的是 "Open the **Build** panel (top-left) and place a **Farm** on green grass"——可 Build panel 在**右侧**，不是左上。而且和首屏 briefing "First build: Build a road" **直接矛盾**：到底是先 farm 还是先 road？两份 onboarding 文案互相打架。我此刻已经决定"再玩 1 分钟看看 toast 反馈是不是真的有效"，但不打算认真玩了。

## Friction 清单（按严重度）

### F1（P0）：第一次 LMB 点击不会下建筑 —— 它只 inspect

- 出现时刻：01:30
- 我以为会发生：Road 工具已经高亮（顶部 "Build Tools" 面板里 Road 是选中态），左键点 grass 应该直接放路。
- 实际：左键弹出一个 tile info popup（Elev / Moisture / Fertility），并显示 "B = build · R = road · T = fertility" 这句**让人误以为要按字母键才能下建筑**的 hint。
- 影响：反复尝试 ~30 秒。先试 B 键（无反应），再以为 Road 没真选中，再点 Road 按钮，结果**第二次点击 Road 按钮把工具又切到 inspect 模式**（或开了 connectivity overlay），整个地图配色突变。
- 改进建议：第一次进游戏时 Road 必须默认未选；选中 Road 后 LMB 立刻放置（不要再先 inspect）；移除 tile popup 里的 "B = build" 字样——它和 1-9 数字键的 hotkey 体系冲突，让人以为有第二套 build 键。

### F2（P0）：Best Runs 列表全是 "loss" —— 主菜单第一眼就劝退

- 出现时刻：00:10
- 我以为会发生：主菜单展示成就 / 教程 / 难度选择。
- 实际：10 条历史记录每条结尾都是 "loss" 红字。Score 358 也是 loss、Score 172 也是 loss。
- 影响：默认期望降到"反正都是输的"，玩之前先泄气。
- 改进建议：第一次启动时如果没有玩家自己的本地 run，就别显示"全是 loss"的占位——换成 "你的第一次 run 还没开始" 之类正向引导。

### F3（P0）：屏幕首帧信息密度爆炸，没有视觉层级

- 出现时刻：00:30
- 我以为会发生：进游戏后有一个箭头 / pulse / 新手指引说"先在这里点这个"。
- 实际：7 块 UI panel 同时呈现，每块都 actively 显示数据。Entity Focus 滚动列表 + Build Tools 12 按钮 + 顶部 6 个 progress chip + 资源条 + 时间速度控制 + 6 个右侧标签 + 地图本身。**没有一个元素 visually 跳出来说"先看我"**。
- 影响：放弃尝试主动理解，开始随机点击。
- 改进建议：第一次 run 应该用 spotlight / dim 其余 UI 的方式只高亮 "Build → Road → 点这块绿地" 这一条线索，其他面板默认折叠。

### F4（P1）：放置 road 没有视觉反馈

- 出现时刻：02:25
- 我以为会发生：road tile 在地图上明显出现，比如灰色斑块、或者闪一下 + 音效。
- 实际：toast 写 "Road at (48,35): 1 segment placed"，但屏幕上找不到 road——connectivity overlay 已经把整个地图染成黄/蓝色块，新放的灰 tile 完全看不出。
- 影响：怀疑自己是不是真的成功了，第二次点又放了一块——造成 2 个 wood 已扣（虽然 cost: free，但 food 减了）。
- 改进建议：放置成功的 tile 闪 0.3s 高亮（白色脉冲），且 toast 同时给出"已放置 1 段，需再 X 段连到 west lumber route"的具体下一步。

### F5（P1）：单位 / 数字缺 baseline

- 出现时刻：00:35
- 我以为会发生：Food 319 旁边能看出"够吃几天"或者 "12 工人吃 7 天"。
- 实际：纯数字，没有变化箭头（增/减）、没有时间换算、没有 net flow（+/-x per day）。
- 影响：我不知道 319 是充裕还是危险。看到工人列表里"hungry"、"a bit hungry"占了大半却又 "well-fed" 几个，前后矛盾。
- 改进建议：资源条加 trend arrow（▲/▼ + 每分钟净变化）。

### F6（P1）：Briefing 与 Help 内容互相矛盾

- 出现时刻：02:50
- 我以为会发生：F1 帮助会重申 "build road first"。
- 实际：Help 第一条 Getting Started 是 "place a Farm on green grass"，且把 Build panel 描述成"top-left"——而实际 Build panel 在**右侧**。和首屏 briefing 完全是两套指引，且方位描述错。
- 影响：怀疑游戏自己都不知道该让玩家先做什么，更不信任接下来的 hint。
- 改进建议：把首屏 scenario briefing 和 F1 Getting Started 改成**单一来源**（template 决定）；修正方位描述。

### F7（P2）：Entity 列表里出现 "saboteur" / "trader" / "predator"，但开局根本没解释

- 出现时刻：00:50
- 我以为会发生：开局就 12 个工人，他们都是我的人。
- 实际：Entity Focus 里赫然有 "Snare-14 (saboteur) Scout"、"Brinn-13 (trader)"、"Wolf-20 (predator)" —— 第一秒我就有"敌人在我殖民地里"的恐慌，但游戏没任何提示我该不该立刻应对。
- 影响：分散注意力，让我去研究 saboteur 是什么而不是去建road。
- 改进建议：Entity Focus 默认只显示我自己的 worker；外来单位（trader / predator / saboteur）放二级 tab。

## 与同类作品的预期对比

如果我之前玩过 RimWorld / Banished / Cities: Skylines，我会预期：
- **第一秒能看到一个清晰的"先做这个"箭头或圈圈**（Cities: Skylines 第一次进游戏直接 spotlight road tool 提示连路）。这里没有。
- **Build tool 选中 → 左键直接拖一条 road**。这里左键先 inspect、再次点击工具切 overlay，规则反直觉。
- **Best Runs 板块在新档应当是空的或只显示成就解锁提示**。这里展示 10 条 loss，劝退。
- **资源数字应当带上下文**（RimWorld 顶栏鼠标 hover food 会显示 "X colonists × Y per day = Z days remaining"）。这里只有裸数字。
- **敌对单位应当显眼且分组**（RimWorld 用红圈标 raider）。这里 saboteur 静静躺在和我自己工人同一个 list 里。

## 结论

**我会犹豫地继续玩第 4 分钟**，但是怀着"我再给它一次机会"的心情，而不是"我想知道接下来会发生什么"。原因：

1. 视觉风格还可以（颜色、字体、布局密度都是"专业小品质"那一档），让我相信背后有内容；
2. 看到 12 个 tool、6 个 template、资源链条复杂——意识到这是个有深度的 sim，不是浅薄 demo；
3. **但 onboarding 完全失败**：3 分钟内我没搞清"我现在该干嘛"，没有一次成功的"我做了 X → 它给我 Y 反馈"的闭环。

评分 4/10。再加 1-2 个新手蒙层 + 修复 LMB 直接放置 + 统一 onboarding 文案，立刻能到 6-7。

build_url: http://127.0.0.1:5173/
