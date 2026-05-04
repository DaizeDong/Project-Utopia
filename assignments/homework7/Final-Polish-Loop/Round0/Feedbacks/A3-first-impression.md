---
reviewer_id: A3-first-impression
round: 0
date: 2026-05-01
verdict: YELLOW
score: 4
friction_count: 9
i_want_to_quit_at: 01:10
i_understood_the_goal_by: 02:00
---

## 一句话定性

3 分钟后我**勉强搞懂了"重连补给线"是当下目标，但没意识到这是一款"看 AI 自己玩"的游戏，差点在 1 分钟时关掉页面**。

## 时间线（按 mm:ss）

[00:00-00:30] **首屏**
- 看到 "Project Utopia"、一段叙事文 ("Your colony just landed. The west forest is overgrown — clear a path back, then rebuild the east warehouse.")。OK，殖民地题材，懂了。
- 下面有四块灰色"简报" (First pressure / First build / Heat Lens / Map size)，文字很多但**抽象** ——"red tiles = stuff piling up unused" 让我没法把术语和我尚未见过的画面对应起来。
- 看到 "Survive as long as you can ∞ 00:00:00 · 0 pts" —— 终于明白，目标是"活下去"+"得分"。
- 三个按钮：Start Colony / How to Play / New Map。我**第一反应直接点 Start Colony**，跳过 How to Play —— 因为 Start Colony 是蓝色 primary 按钮，而 How to Play 看起来像普通备选。**这是后面所有困惑的源头**。

[00:30-01:30] **进入游戏 —— 第一波信息洪水**
- 屏幕同时弹出：
  - 顶部 5 个资源图标（无数字单位 / 无目标值），右侧一个 "Survived 00:00:02 / Autopilot OFF" 状态条
  - 中间地图，上面浮着 "west lumber route ×2"、"west lumber route"、"east ruined depot" 三个深色标签
  - 左下角 "Run started: Temperate Plains... Build the starter network now. Try Again replays this layout; New Map rerolls." toast
  - 左下角 "Entity Focus" 面板列着 20 个实体（Workers + Deer + Bear），每个都标着 "Hungry / WOOD · Wander · hungry" 这样的状态
  - 底部播放控件 + Autopilot 复选框 + AI Log 按钮 + 时间
  - 右侧侧边栏 7 个收起的 tab：Build / Colony / Settings / AI Log / Heat (L) / Terrain (T) / ? Help
- **我现在该点哪？** Build Tools 默认收起。"Build the starter network" 但我看不到一个明显的 "Build" 入口 CTA。
- 试图 LMB 在地图上点一下 → 选中了一只 **Bear-20**，旁边弹出 "GRASS Passable / Elev 0.02 / Moisture 0.11 / Fertility Poor" 的 tile 卡。Inspector 给出 "Food Diagnosis: Food exists, but there is no warehouse access point." —— 这个**诊断很有用！但完全不告诉我"该怎么做"**。
- 按 `2` 键期望选中第二个工具（Farm），结果切换了 "Overlay: Fertility" —— 屏幕变成绿/蓝色块。**预期完全不符**。

[01:30-02:30] **上手 —— 找到 Build 面板，但不知道怎么用**
- 右侧 Build tab 终于点开，看到 13 个工具按钮。Selected Tool 已经是 Farm（被我那个 `2` 改的），描述："Adds food production but only works when it can feed back into the road / warehouse network. Cost: 5 wood. Rules: Place on grass, roads, or ruins. Farms need nearby logistics access."
- "**nearby logistics access**" 是什么？哪是 logistics access？地图上根本没有任何已建建筑。
- 切到 Road，按 LMB 点地图 —— 没看到任何视觉反馈，但 Construction 面板底部不显眼地写了 "Road at (48,35) extends the first network line." —— 我**完全没注意到**。
- 大概想到："要不开 Autopilot 让 AI 帮我？" 勾选 Autopilot → 顶部状态从 "Autopilot OFF · manual; builders/director idle" 变成 "Autopilot ON · llm/llm" —— **这一刻 AI 接管，开始自动放蓝图、workers 状态变成 BUILDER · Construct**。这是第一个真正的"哦！"瞬间，但**它来得太晚（≈01:10），且不是被引导发现的**。
- 点开 AI Log tab，**Aha moment（≈02:00）**：终于看到清晰目标 "Broken Frontier: 0/1 routes online | 0/1 depots reclaimed | warehouses 0/2 | farms 0/6 | lumbers 0/3 | roads 4/20 | walls 0/8"。**这才是 onboarding 应该首屏给我看的东西**。
- 同时 Director Timeline 里 12 行重复 "fallback-healthy rebuild the broken supply lane fallback" —— 噪音爆表。

[02:30-03:00] **结尾 —— 我在看 AI 玩**
- 点开 ? Help —— 终于！清晰的 Tabs：Controls / Resource Chain / Threat & Prosperity / What makes Utopia different。Getting Started 写得很好："Open the **Build** panel (top-left) and place a Farm..."。**但是 Build 面板在 RIGHT 不在 top-left！教程文案过期。**
- Resource Chain 那一页特别清晰（Food→Meals 2× hunger / Wood = building / Stone+Wood→Tools / Herbs+Wood→Medicine）—— 这就是我前 3 分钟最需要的"What is this game" 一图流。
- 关掉 Help，看到 "First Farm raised: Your colony has a food foothold." toast，以及 "Route online: west lumber route. Workers can haul through the repaired line." —— 系统给了正反馈，让我感觉做了对的事，但**所有这些都是 AI 替我做的，我只是按了 Autopilot**。
- 此刻心情：**好奇 > 想关掉**。但更多是因为看到 AI 行为有趣，不是因为我感到自己在玩。
- 注意到顶栏出现 "Recovery: food runway - expansion paused" 橙色警示 + 食物从 199 掉到 72 —— 我**不知道这是不是危险，也不知道我能做什么**。

## Friction 清单（按严重度）

### F1（P0）：Onboarding 不强制走 How to Play，新手直接被丢进信息洪水
- 出现时刻：00:25
- 我以为会发生：第一次启动会被引导浏览 1-2 屏教程，告诉我"这是建造游戏，先盖农场"
- 实际：Start Colony 是主按钮，How to Play 是次按钮。我点了 Start Colony 后画面同时塞给我 5 资源 + 20 实体列表 + 7 侧边栏 tab + 13 工具 + 3 地图标签 + 1 toast。**3 秒内做不到任何视觉聚焦**。
- 影响：差点在 01:10 关掉页面（评分 -3）
- 改进建议：首次进入应**强制弹 How to Play**（或一个 onboarding overlay 高亮第一步要点的位置），玩过一次后自动跳过

### F2（P0）：核心目标没有"任务清单"形式呈现，只藏在 AI Log 里
- 出现时刻：02:00
- 我以为会发生：左上或右上有一个"任务/目标"栏，显示"建 1 个 Warehouse / 6 个 Farm / 重连 west lumber route"等可勾选的 checklist
- 实际：那个清单 (`Broken Frontier: 0/1 routes online | 0/1 depots reclaimed | warehouses 0/2 ...`) **只有点开 AI Log → Decision Results → 展开 Live Causal Chain 才能看见**。新手会以为 AI Log 是"开发者调试用"
- 影响：goal 不清 → 不知道下一步该做什么 → 倾向于关掉
- 改进建议：把 "Broken Frontier" 进度条做成首屏一级 UI（类似 RimWorld 的 quest tab），不要藏在 AI Log 里

### F3（P0）：键盘快捷键 `1-9` 不响应（按 2 触发了 Fertility Overlay 而不是 Farm 工具）
- 出现时刻：00:55
- 我以为会发生：开屏提示明明写 "1-12 tools"，按 2 应该选中第 2 个 build 工具
- 实际：按 2 切换了 Fertility Overlay；Build 面板里的 Farm 没被选中
- 影响：**直接告诉我"按键提示是骗人的"**。这种 broken promise 极其伤信任感
- 改进建议：要么修复绑定，要么明确写"`1-12` 仅在 Build 面板打开后生效"

### F4（P1）：LMB 点地图既会"放置工具"又会"选中实体"，且优先级偏向"选中"
- 出现时刻：00:50
- 我以为会发生：因为 Selected Tool = Road，点地图就放 road
- 实际：地图上恰好有一只 Bear，被我点成了 "Selected Bear-20"，inspector 弹了一大堆 Bear 数据；同时 road 似乎也偷偷放了一格但不显眼
- 影响：完全混淆了"我刚才做了什么"
- 改进建议：placement 模式下不响应 entity 选中，或在 entity 上画一个明显的 cursor 提示"将选中此实体而非放置"

### F5（P1）：13 个 build 工具一字排开无任何分组 / 教学顺序提示
- 出现时刻：01:30
- 我以为会发生：开局只有 1-2 个解锁的工具高亮（"开始建这个"），其他灰色等 unlock
- 实际：Road / Farm / Lumber / Warehouse / Wall / Bridge / Demolish / Quarry / Herbs / Kitchen / Smithy / Clinic 全部可点。我不知道哪个该先建
- 影响：选择悖论；新手随便点
- 改进建议：开局只暴露 4 个 (Road/Farm/Lumber/Warehouse) + 一个 "More tools" 折叠组；或者教程明确推 1→2→3 顺序

### F6（P1）：Autopilot 一开就接管全部决策，玩家不知道自己还能做什么
- 出现时刻：01:10 onwards
- 我以为会发生：Autopilot 是 "辅助"，会建议 / 高亮我下一步该建什么
- 实际：Autopilot 直接全自动放蓝图、调度 builders。我变成观众。**也没说 Autopilot OFF 模式下我必须自己规划全部供应链**
- 影响：分不清这是"放置类沙盒"还是"自动模拟看戏"
- 改进建议：Autopilot 三档 (Off / Suggest / Auto)；或者 Autopilot 接管时出现"AI 在为你建 Farm at (x,y)" 微 toast 让玩家学

### F7（P2）：Director Timeline 重复同一行 12+ 次刷屏
- 出现时刻：02:00 onwards
- 我以为会发生：每个独立决策一行
- 实际："[8.8s ago] fallback-healthy rebuild the broken supply lane fallback" 完全相同的字符串重复 12 行。我想读最新事件得自己滚
- 影响：log 失去信号
- 改进建议：相同决策合并 "rebuild the broken supply lane fallback ×12 (last 1m 9s)"

### F8（P2）：资源图标无目标值 / 无变化趋势
- 出现时刻：00:30
- 我以为会发生：199 food 旁边有个箭头或速率（+0.5/s, ETA 10 min）
- 实际：纯数字。3 分钟里 food 从 199 掉到 72，我不知道这是 OK 的、还是马上 game over
- 影响：无法做策略判断
- 改进建议：每个资源加 `▲ +x/s` 或 `▼ -x/s` 趋势 + tooltip 显示 baseline

### F9（P2）：Help 文案与实际 UI 位置不一致 ("Build panel (top-left)" 实际在 right sidebar)
- 出现时刻：02:35
- 我以为会发生：Help 教 "Build 在 top-left" → 我去 top-left 找
- 实际：Build 在 right sidebar
- 影响：Help 信任度受损
- 改进建议：Help 文案与当前布局同步，或写"在 Build 标签页（侧边栏中）"

## 与同类作品的预期对比

- **如果我之前玩过 Cities: Skylines / SimCity**：我会预期开局有一个"任务向导"问我"先建什么"，并把 build 工具列在屏幕底部一字排开（不是侧边收起）。这里 build 在右侧 collapsed，且没有 first-build 提示。
- **如果我之前玩过 RimWorld**：我会预期 colonist 在上方一行小头像，点头像看 schedule / mood；同时屏幕右下有一个事件 ticker。这里"Entity Focus"列表样式（Hungry/WOOD/Wander · hungry）信息密度高但视觉杂，更像调试面板而非玩家面板。
- **如果我之前玩过 Banished / Frostpunk**：我会预期目标 = "活到第 X 天 + 维持 Y 人口"，屏幕显眼处一个 day counter + 食物消耗预测。这里"Survive as long as you can ∞" 太空泛，没有时间锚点。
- **常识预期**：开局应该有 ≤1 个"红色感叹号"指引我"点这里学一下"。这里有 ⚠ 三角图标但 hover 不出明显 tooltip（只看到顶部状态变成 "Recovery: food runway - expansion paused" 但不知道 severity）。

## 结论

**我会勉强继续玩第 4 分钟，因为：**
1. 看到 AI 自己把蓝图、农场、道路一路自动建起来（"First Farm raised" / "Route online" toast）让我**好奇 AI 接下来怎么做**
2. AI Log 的 "Live Causal Chain" + Director Timeline（如果去重的话）很有 "AI 思考过程透明化" 的科技感

**但是我会带着以下挫败感继续：**
1. 我不确定我作为玩家的"输入"对结果有多大影响 —— 是我在玩，还是 AI 在玩给我看？
2. 食物在持续下跌，我不知道是不是要做点什么干预
3. 我不知道达成"Broken Frontier 8/8 子目标"之后会发生什么 —— 没有"赢"的画面预告

**评分锚点：4/10** —— 比"勉强继续 5"略低。原因：onboarding 让我**几乎放弃**（-1），但 Autopilot 的"AI 自己玩"让我**好奇心>挫败感**（+0），最终落在 4。

**最关键的一句话改进建议：把 ? Help 的 Resource Chain + Getting Started 内容做成第一次启动时的强制 3 屏 onboarding overlay，并把 "Broken Frontier 0/8" 进度条提升到顶栏一级。**
