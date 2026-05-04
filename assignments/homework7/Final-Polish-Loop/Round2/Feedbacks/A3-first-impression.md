---
reviewer_id: A3-first-impression
round: 2
date: 2026-05-01
verdict: YELLOW
score: 4
friction_count: 8
i_want_to_quit_at: 02:15
i_understood_the_goal_by: 02:30
---

## 一句话定性

3 分钟后我**仍然没成功手动放下任何一块地砖**，最后是被 Autopilot 救场，才看见游戏真的"在玩"——这给我一个矛盾印象：核心循环是有趣的，但前 3 分钟我体感像在和 UI 摔跤而不是和游戏摔跤。

## 时间线（按时间戳）

[00:00-00:30] 落地菜单。标题、briefing、"west lumber route / east ruined depot" 像箭头标签，"Best Runs"列出一堆 "loss" 让我有点泄气（"我接下来也会 loss?"）。我滚动到底找 Start Colony，按钮在 fold 之下，差点没看到。

[00:30-01:30] 进游戏。屏幕一下子炸开 12 个 build 按钮、4 个资源数字、左侧一长串 worker 列表、底部一堆快捷键文字、map 上还有两个黄色路标 + 一个 "Last: Deer-17 died (predation)" toast。我盯着右上角的资源数字看了几秒才明白第一个是 Food（要 hover 才能看到 sublabel "Food"，因为图标我认不出）。我按了 "2" 想选 Road（视觉上 Road 在第二位），结果选中了 Farm —— 因为 "1" 才是 Road。

[01:30-02:30] 选了 Road，左键点 map，结果**选中了一个 worker**（不是放 road）。再选 Warehouse，左键点 east ruined depot 区域 —— 又选中了 worker，没放下任何东西。光标处也没有 ghost preview 告诉我"如果我点这里会放在哪里"。Food 一路从 317 掉到 300，Hungry 工人从 4 升到 8。屏幕上整个 map 被 Connectivity overlay 染成屎黄色，**我不知道为什么颜色变了**——以为我搞坏了什么。

[02:30-03:00] 走投无路，勾选了 Autopilot。立刻弹出 "First extra Warehouse raised" toast，工人们的 intent 从 "Wander" 全部变成 "Seek Constr / Seek Trade / BUILD"。游戏自己开始玩自己，我从旁观者视角终于看见了"循环"。这一刻我想继续看，但**不是因为我学会了游戏，而是因为我把方向盘交了出去**。

## Friction 清单（按严重度）

### F1（P0）：左键点地图选中 worker，没放下建筑
- 出现时刻：01:30, 02:15
- 我以为会发生：选了 Road / Warehouse 工具后，左键点 grass 会放下一块道路或仓库 ghost。
- 实际：每一次点击都"穿透"工具选择，选中了底下的 worker，左侧切换成 worker 详情面板。
- 影响：**反复尝试 5+ 次都失败**，最终放弃手动建造，只能开 Autopilot。这是 onboarding 最严重的卡点。
- 改进建议：工具激活时光标应跟一个半透明 ghost footprint，并且 LMB 在工具激活态下必须**优先放置**而不是选中实体。

### F2（P0）：Start Colony 按钮在 fold 之下
- 出现时刻：00:25
- 我以为会发生：标题菜单的核心 CTA 应该一眼可见。
- 实际：浏览器 1049×630 视口下，"Start Colony" 在 Best Runs 长列表后面被推到了视口外，要滚才能点到。
- 影响：差点错过；Playwright 自动滚动重试都 timeout。
- 改进建议：Best Runs 折叠或限高，把 Start Colony 钉在 overlay 底部。

### F3（P1）：键盘 1-12 vs 视觉位置不一致
- 出现时刻：01:00
- 我以为会发生：按键 "2" = 视觉第二个按钮 (Road)。
- 实际：Road 是 (1)，Farm 是 (2)。视觉网格是 2 列，第二格视觉位置是 Road，但快捷键按行优先编号。
- 影响：试错成功，但留下"键盘不可信"的印象。
- 改进建议：每个 build 按钮上叠一个小 hotkey badge（"1"/"2"/...），让映射可见即所得。

### F4（P1）：4 个资源图标无即时 label
- 出现时刻：00:35
- 我以为会发生：第一秒就能识别每个数字是什么。
- 实际：图标是麦穗 / 木 / 石 / 草？（猜的）；要 hover 或 inspect DOM 才能看到 sublabel "Food / Wood / Stone / Herbs"。
- 影响：解读 HUD 多花 10 秒。
- 改进建议：图标下方默认显示一字 sublabel，或者首次进游戏的 30 秒内强制展开 label。

### F5（P1）：连续两个 overlay 把 map 染色，没说"我开了 overlay"
- 出现时刻：01:30（连接性 overlay 蓝橙色），02:15（黄/沙色泛滥）
- 我以为会发生：map 颜色变化是 game state 变化（"是不是地变干旱了？"）。
- 实际：是 select tool 自动切了 Connectivity overlay，warehouse tool 切了别的 overlay。
- 影响：以为游戏在惩罚我，反复尝试想"修好"它。
- 改进建议：overlay 切换时，map 左上角的 "Overlay: Connectivity" 标签应更醒目（动画/边框），并提供一键关闭。

### F6（P2）："Blocked / (saboteur)" 出现在工人名单里
- 出现时刻：00:50
- 我以为会发生：列表里都是我的殖民者。
- 实际：Kade-14 / 一些角色被标 (saboteur) / (trader)，但都列在 Entity Focus 里和我的农民并列。
- 影响：困惑——这些是我的人还是敌人？应该攻击 Kade-14 吗？
- 改进建议：Entity Focus 顶部分组（"Colonists / Visitors / Hostiles"），不要把 saboteur 和 farmer 混排。

### F7（P2）：Best Runs 列表全是 "loss" 字样
- 出现时刻：00:15
- 我以为会发生：示范 "你能做到这样的成绩"。
- 实际：10/10 都标 "loss"，给人"这个游戏没法赢"的暗示。
- 影响：心理预期降低。
- 改进建议：要么改 "Survived 3:12 · Score 182"（去掉 loss），要么把 loss 列做颜色弱化。

### F8（P2）：左下 worker 详情面板信息密度过高
- 出现时刻：01:35
- 我以为会发生：点 worker 看到"它在做什么 + 健康"两行。
- 实际：Backstory / Character / Why is this worker doing this / Policy Focus / Policy Notes / Type/Role/Group / State/Intent / Hunger / Food Diagnosis / Food Route Facts / Health / Carry / Attack CD —— 十几行密集文字。
- 影响：阅读眼花，找不到"它现在到底在干什么"那一行。
- 改进建议：默认折叠 Backstory / Character / Policy 三段，只显示 State + Hunger + Diagnosis。

## 与同类作品的预期对比

如果我之前玩过 RimWorld 或 Banished，我会预期：
- 选 build 工具后，光标拖到 map 上会有**幽灵半透明预览**告诉我即将放置的位置和占地——但 Utopia 的 cursor 没 preview。
- LMB 在 build 模式下**只放置**，要点 worker 必须切回 select 工具（Esc 或 0 键）——但 Utopia 让 LMB 同时承担"选中"和"放置"，且选中赢了。
- HUD 顶部的 4 大资源会有**清晰的图标 + 文字**（"Food: 312 ↓"）——但 Utopia 默认只有图标和数字。
- 第一次进游戏会有**明确的箭头/高亮**指向"先点这里"——Utopia 有 briefing 文字描述了，但没有 in-world 视觉指引。

## 结论

我会**勉强**继续玩第 4 分钟，但只会盯着 Autopilot 自己跑，看它做什么；如果不开 Autopilot，我会在 4-5 分钟时关掉页面。核心模拟看起来很丰富（worker 有 backstory、有 Diagnosis、有 trader / saboteur 来访），但 onboarding 的"我现在该点哪 + 我点了之后发生了什么"两个最基本的诉求都没解决。**Tier A 评分锚点：勉强继续 = 5；考虑到手动放置完全失败这是 P0，扣 1 分给 4。**
