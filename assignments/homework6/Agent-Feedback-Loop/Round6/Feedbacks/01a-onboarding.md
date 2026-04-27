---
reviewer_id: 01a-onboarding
review_round: Round 6
date: 2026-04-25
build_url: http://127.0.0.1:5183/
---

# Project Utopia 第六轮盲审 · 引导性外部评测

## 总体评分：**3 / 10**

一句话定性：**这不是一款准备好交给玩家的游戏，它是一份没人配讲解员的程序员演示。** 引导层从第一秒到第三十分钟全程缺位、错位或自相矛盾；如果不是评测要求我必须打满 30+ 次交互，我作为外部玩家会在 5 分钟内关掉标签页。

---

## 第一印象（前 60 秒）

打开 `http://127.0.0.1:5183/` 后，弹出一个标题屏幕，标题是 "Project Utopia"，下方的一段提示语是 "Reconnect the west lumber line, reclaim the east depot, then scale the colony."。再下面一行紧跟着是模板信息条："Temperate Plains · 96x72 tiles · Broken Frontier · balanced map, steady opening"。

紧接着是四段称为 **"Opening briefing"** 的剧本，标题分别是 First pressure / First build / Heat Lens / Map size。然后是一个目标横幅："∞ Survive as long as you can 00:00:00 · 0 pts"。再下面是 Template 下拉框、Map Size 数值输入、热键提示，最后是三个按钮：**Start Colony / How to Play / New Map**。

第一印象已经埋了三颗雷：

1. **背景里游戏已经在跑**。我尚未点 Start，title 屏后面的世界已经在前进 —— 工人在动，时间在跳，HUD 上的资源在变化。我没碰任何按键，标题菜单还半透明地遮在画面上方，结果你截屏会看到：title 弹窗+里面 8 段说明文字，背后却是个跑了几十秒的实际殖民地。这种"边读说明边偷跑模拟"的设计让玩家完全分不清"我现在到底是在主菜单还是在游戏里"。
2. **briefing 的内容写死了**。我把 Template 下拉切到 Rugged Highlands 后，URL 立刻变成 `?template=rugged_highlands`，但弹窗里的 briefing 还是 Temperate Plains / Broken Frontier，那段 "First pressure / First build / Heat Lens / Map size" 完全没更新。换句话说，**模板选择器看上去跟下面的剧本说明是两个互不通气的系统**，新玩家根本判断不出来"我到底选了哪个开局"。
3. **briefing 里出现了五条孤零零的悬浮文字**："west lumber route" 重复 4 次 + "east ruined depot"。这些是世界中场景目标的地名标签，因为前一次模拟还没死透就跳回了主菜单，于是它们就直接漂在标题面板上方。一个外部玩家第一眼看到这种 UI 调试残渣会立刻把这游戏归类为"未完成的 demo"。

更糟糕的是，**点 "Start Colony" 之后页面不一定真的进入新一局**。我多次点 Start Colony，浏览器要么静止不动要么闪烁后回到 `about:blank`（白屏）。需要我手动 reload `http://localhost:5183/` 才能继续。一个开始游戏按钮要靠玩家不断刷新才能 work，这是 P0 级 bug。

---

## 核心教学缺陷（按破坏力排序）

### 1. **没有任何"教学序列"——直接把仪表盘扔给你**

启动后玩家面对的是一份高密度的 HUD：左上 5 个图标 (food/wood/stone/herbs/workers) + 中上一段冗长的 scenario 描述（"Broken Frontier — Reconnect the west lumber line, reclaim the east depot, then scale the colony."）+ 中上一行 "Survived 00:00:08 / Autopilot off. Manual control is active; fallback is ready."（这句话谁懂？fallback 是什么？autopilot 是什么？）+ 一行 "Why no WHISPER?: LLM never reached"（什么是 WHISPER？）+ 右上角一堆 sidebar tab "Build / Colony / Settings / Heat (L) / Terrain (T) / ? Help"，然后地图上还有飘着的方块文字 "halo" "halo" "halo" "supply surplus" "starved" "surplus"，左下角是 19 个工人的列表 "Mose Keane · FARM · Seek Task · hungry"。

**新玩家没有得到任何"先看这里、再点这里"的引导路径**。Help 对话框里那段所谓 "Getting Started"（"Open the Build panel and place a Farm... Add a Lumber Mill... Connect with Roads"）只有 3 行字，藏在 Help → Controls 标签下面 —— 而 Help 默认是不打开的。等于说：**最关键的"该做什么"教程，需要玩家自己点 ? Help 才看得到，而且点出来还是默认在 Controls 标签**。

我作为外部玩家，**前 5 分钟根本不知道要从哪一步开始**。游戏里有自动驾驶模式（Autopilot），它会自己造东西，所以不点也行 —— 那玩家"玩"的部分到底是什么？这个游戏从来没解释过。

### 2. **说明文字里大量术语完全没有定义**

在 5 分钟之内我能数出至少 15 个未定义专有名词：**WHISPER / DIRECTOR / DRIFT / Heat Lens / DevIndex / Dev 60 thriving / Survival Mode / Fallback / scenario / west lumber route / depot / starter / balanced / logistics / island / fragmented**。这些词全部出现在 HUD、briefing、AI Storyteller 面板里，没有一个有 hover 解释或词汇表。

举个具体例子：右上角红色错误条不停弹出 "Why no WHISPER?: LLM never reached" 和 "AI proxy unreachable (timeout). Running fallback mode."——一个外部玩家看到红色 + LLM + proxy + timeout 的字眼会怀疑游戏挂了。**这种本应隐藏在开发者控制台的诊断字符串被直接当作 UI 文案**。商业作品（Frostpunk / Rimworld / ONI）绝不会让玩家看到 "LLM proxy unreachable"。

### 3. **建造按钮没有可见 tooltip——但游戏却宣传"hover 看说明"**

Help 对话框里写 "12 tools in the Build toolbar; hover any button for name + hotkey"。**但实际上 hover 任何 build 按钮都不会出现可见的悬浮气泡**。我用 DOM 检查确认：所有 build 按钮的 `title` / `aria-label` 都为空字符串。文字描述被 push 到了一个 `aria-live` 区，**只有屏幕阅读器能"听到"**：

```
"Warehouse (4) — store & distribute resources, cost: 10 wood. Place before your 3rd farm so haul distance stays short."
```

也就是说 —— **作者在 Help 对话框里向玩家承诺了一项不存在的功能**。要看建筑说明必须点击按钮（让它成为 Selected Tool），右下角才更新 Construction 面板。这意味着新玩家如果想"先了解再决定"，得 12 个按钮挨个点过去（每点一次还会清除你之前选中的工具），完全反自然。

### 4. **信息密度爆炸 + 大量调试残留可见**

地图上始终漂浮着一堆诊断小方块："halo / halo / halo / supply surplus / starved / surplus / traffic hotspot / north timber gate / south granary / west ridge wilds / harbor relay causeway"。其中 **"halo" 这个词在画面上同一时间会出现 6–10 次重叠**，看起来像 placeholder 没来得及替换。工人的 inspector 面板也充满 raw 数据：

```
Top Intents: eat:1.40 | deliver:1.30 | gather_herbs:1.30
Top Targets: warehouse:1.70 | road:1.65 | depot:1.55
Worker policy biases FARM ratio to 50.0% (farm=1.00 wood=1.00).
Decision Context: Local logistics rule sees 0.20 carried resources, so delivery should outrank more harvesting. | Group AI is currently biasing this unit toward seek_task.
Hunger: Hungry (36% well-fed)
Position: world=(1.10, 2.37) tile=(49, 38)
Vitals: hp=100.0/100.0 | hunger=0.639 | alive=true
Carry: food=0.20 wood=0.00 | Attack CD: 0.00
```

这是**调试日志**而不是玩家界面。`hp=100.0/100.0`、`hunger=0.639`、`world=(1.10, 2.37) tile=(49, 38)` 这些就该藏在开发者面板，主 UI 应该是"This worker is hungry and looking for food"这种自然语言描述。RimWorld 显示 "Mood: Content (78%)"，这游戏直接抛 "Mood: 0.51 | Morale: 0.45 | Social: 1.00 | Rest: 0.00"，外部玩家看 0.51 不知道高低、不知道单位，不知道怎么干预。

### 5. **关键交互的反馈是反直觉的**

具体几个我亲测过的"误操作惊喜"：

- 我按 **数字键 3** 想选 Farm（Help 写 1–12 是 quick-pick），结果 build panel 收起、地图弹出 fertility overlay、Entity panel 跳出。3 既切换了工具又切换了 overlay？太混乱了。
- 我按 **T** 想看 terrain overlay，结果**整个游戏跳回主菜单**（template 选择器又显示出来了）。我猜是因为 T 在某个状态下被绑定为 New Map / Try Again，但没有任何提示。
- 我按 **0** 想"重置摄像机"（Help 明确说 0 = reset camera），结果显示 "Selected tool: kitchen (shortcut)"。0 在 Build 面板激活时被解释成了 "tool 10 — kitchen"，**默认 hotkey 在不同上下文里语义完全不同**，且没有提示玩家"现在你按数字键我会切工具不是切相机"。
- 我点 **Build** 那个 sidebar tab 想打开建筑面板，结果浏览器导航到 `about:blank`（直接清空页面）—— 并且不止一次复现，每隔几次操作就发生一次。这是对未保存的"Survived 10:19, 47 工人"那一局的彻底丢弃。**"按一个 UI 标签，整个游戏就消失"是不能放过的崩溃级 bug。**
- 切换 **Template 下拉框**会立刻无确认地启动新的 run（覆盖正在进行的存档）。新玩家点击 dropdown "看看有什么模板"会瞬间失去所有进度。

### 6. **Help 对话框结构合理但内容仍是程序员视角**

Help 弹窗 4 个 tab：Controls / Resource Chain / Threat & Prosperity / What makes Utopia different。结构本身可以接受，是这游戏里**唯一像样**的引导组件。问题在内容：

- "Resource Chain" 写着 "Food (from Farms) + Kitchen → Meals (2× hunger recovery)"。**它没说 Kitchen 需要多少 wood、多少 stone**（实际是 8 wood + 3 stone）。对一个还没建第一个农场的玩家来说，"消耗 8 wood + 3 stone"这种关键数字必须前置。
- "What makes Utopia different" 介绍 **WHISPER / DIRECTOR / DRIFT** 这三个 AI 模式 —— 但这是 v0.1 demo 玩家最不需要的东西。他根本还没建第一栋建筑，就被告知"WHISPER 是 LLM 在驱动政策、DIRECTOR 是 deterministic fallback、DRIFT 是 colony idle"。**这是把开发笔记当教程发给玩家**。
- "First Failure Path" 段落写："Most runs do not fail from one event. They fail when food, wood, and hauling stop reinforcing each other, then threat rises faster than the colony can recover." —— 文学化但模糊。新玩家读完不会知道"我现在该多盖几个仓库还是多砍点树"。

### 7. **目标系统完全不引导玩家**

游戏顶部不停喊 "Reconnect the west lumber line, reclaim the east depot, then scale the colony."，地图上飘着 "west lumber route"、"east ruined depot" 等文字。**但游戏从来没用箭头/路径/目标 marker 告诉玩家"那个 east ruined depot 具体在哪里、应该怎么 reclaim"**。我搜遍 UI 找不到一个"任务列表"或"主线进度条"。AI Storyteller 面板会闪一句 "DIRECTOR picks rebuild the broken supply lane"，但下一秒又跳到 "DIRECTOR picks push the frontier outward"，不同 directive 之间没有连续叙事。

第 1 分钟我以为 reconnect 是任务、第 5 分钟还在看到同一句话、第 10 分钟它已经被新的弹幕信息淹没了 —— **任务系统等于不存在**。

### 8. **Status / 数值显示前后不一**

我在第 9 分钟同时观察到：
- 顶部状态条："Autopilot off. Manual control is active; fallback is ready."
- AI Storyteller："MILESTONE Dev 60 thriving: Meals are flowing; consider Smithy for tool bonus."
- 资源面板：**Meals 0**（0/min 也不在生产）

"Meals are flowing" 但 meals 是 0。这种**叙事文案与数值实际状态相反**的情况贯穿整局。又比如第 15 天我看到 STABLE 标签 + "Food 49 ▼ +19/min cons -40 ≈ 0m" + 红色 "50s until empty"。**STABLE 和 50 秒后断粮明显是矛盾的**。这种"撒谎的叙述者"在新手期会彻底摧毁玩家对系统的信任 —— 我无法判断到底游戏觉得我做得对还是不对。

### 9. **没有失败教学和 onboarding 死亡保护**

我让游戏跑到第 17 天，工人 80 人，食物长期接近 0，threat 27%，HUD 仍然写 STABLE。我没看到任何"colony collapsed"或"game over"画面。Survival Mode 的承诺是"the run ends when the colony cannot recover" —— 然而**它什么时候认定 cannot recover？**外部玩家完全猜不到。新手最需要的"安全失败 → 重启"循环根本没建立。

### 10. **页面级路由 / 状态管理不可靠**

具体行为我多次复现：
- 切换 template dropdown → URL 变了，浏览器 push 一次 history。
- 点 Start Colony → URL 不变但游戏开始。
- 反复点 Build sidebar tab → 整个 SPA 卡死并跳到 `about:blank`。
- F5 reload → 有时回到 title screen，有时直接进游戏（autopilot 已在跑）。
- 关掉 How to Play 弹窗后再开 → 弹窗状态 reset，但游戏没暂停（教学期间游戏继续跑！）。

**Onboarding 的最低要求是"读教程时游戏要 pause"**，这里完全没做。

---

## 具体场景问题列表（按时间线）

### 0–60 秒
- 弹出 title screen，背后游戏已经在跑（autopilot）。新玩家心理状态：???
- briefing 文字与下方 Template 选择器不同步（永远显示 Temperate Plains）
- title screen 上方漂浮着 "west lumber route" × 4 + "east ruined depot"——明显是上一次 run 的残留 UI
- Start Colony 按钮的 tooltip 说 "Start the colony with the visible template and size"，但 visible template 是哪个不明确（dropdown 显示 Temperate，URL 是 fortified_basin）

### 1–5 分钟
- 资源条上的 5 个图标没有数字以外的悬停说明（图标也不显眼，可能是麦穗、木头、石头、草药、工人）
- HUD 中段 "Why no WHISPER?: LLM never reached" 红色错误信息一直挂着
- 红色 "AI proxy unreachable (timeout). Running fallback mode." 在屏幕底部反复弹出
- 玩家看到这两条会以为游戏崩了，可能直接关掉
- 地图上的 "halo" 标签像 placeholder（是 supply chain 状态指示器但没说明）
- 按 1–12 quick pick build tool 时，工具说明文字带浓厚的文学色彩 ("a name on the obituary strip" / "saws with its hands" / "grain rots in the field")，对新手不友好
- 没有任何"建议你先 [建造 Farm] [连接 Road]"的箭头或视觉提示

### 5–30 分钟
- Autopilot 自己造了一堆建筑，玩家不知道自己该不该插手
- Workers 数量一路涨到 80 但 Food 始终接近 0、Wood 偶尔 -480/min（剧烈耗用）
- AI Storyteller 一会说 STABLE 一会说 thriving 一会说 rebuild the broken supply lane
- "First Lumber camp raised" / "First Kitchen raised" / "First Tool forged" / "First Medicine brewed" 这种里程碑 toast 不停闪过，但每条只显示几秒就消失，没有"成就墙"或"已解锁"列表
- 我无法在任何菜单里找到"目标进度"
- 也找不到"已建造数量"的概览（Colony 面板里没有 Buildings 分区）

### 30 分钟以上
- 我等到游戏内 Day 17 / 17 分钟，run 一直处于 STABLE，从没出现"游戏结束"画面
- 没有任何节奏感（不是越来越难、不是 wave 推进、不是季节切换）
- 玩家没有明确"赢了/输了"的判定，且 Survival 分数从未在 HUD 中突出 —— 我得专门翻 Goal banner 才能看到 "00:00:00 · 0 pts"，且这个 0 pts 在我玩到 16 分钟后还是 0 pts（实际是它在 title screen 里的占位，进游戏后直接消失）
- **得分系统在游戏中完全不可见**，在主菜单上写着 "0 pts"，玩着玩着这个数字就不更新也不显示了。"Survive as long as you can" 但你的 score 我永远看不见。

---

## 与同类成品游戏的差距

### vs **RimWorld**
- RimWorld 第一次进新地图会有一个 "Tale of three survivors" 角色介绍 + 写实的 starting scenario，并配 Tynan 的"Cassandra Classic" 故事讲述者卡片，告诉你节奏。
- 第一个目标提示在屏幕右下角 "Build a wooden bed for each colonist, before nightfall"——**写明对象 + 数量 + 截止条件**。
- 死亡时会有 "Pause world" 弹窗解释发生了什么。
- Project Utopia：没有任务卡、没有节奏、没有教学钢笔指路。不及 RimWorld 2013 EA 阶段水准。

### vs **Oxygen Not Included**
- ONI 的 Tutorial Asteroid 第一次开局会强制走 7 步 tutorial：1. 选指挥官 2. 挖一格 3. 放厕所 4. 建食堂 5. 训练 sweep 6. 建 oxygen diffuser 7. 储水。每一步都暂停，明确高亮按钮。
- Project Utopia：没有任何强制 step-by-step；玩家进游戏后**完全自由 + 完全无引导 = 完全迷茫**。
- ONI 的悬浮信息球（蓝色 i 图标）能点出每个数值的解释。Project Utopia 没有。

### vs **Dwarf Fortress**（DF Steam 版）
- 即使是因复杂闻名的 DF，Steam 版也加了 Tutorial Embark + 在 Hotkey/Job 面板做了大量配色与 hover 提示。
- 每个建筑 hover 都有详细 tooltip 说明前置物料 + 所需工人 + 后续解锁。
- Project Utopia：完全没做这层。Resource Chain 在 Help 弹窗里只用 6 行字一笔带过。

### vs **Frostpunk**
- 第一关 New Home 全程都是脚本化教学，从生第一个火堆开始一步步 unlock 玩法。
- Project Utopia：完全没有脚本化关卡，所有 6 个 template 都是开局即开放，差异写在 briefing 里 —— 但 briefing 还不更新。

### vs **Banished / Going Medieval / Songs of Syx**
- 这些独立殖民地 sim 的 onboarding 也都比 Project Utopia 完整。Banished 至少给你一个简短的 PDF 风格 quickstart；Going Medieval 给你 5 分钟的 sandbox tutorial mode。
- Project Utopia 最接近的同类（独立 + 像素+俯视）也没做出 Banished 2014 的水准。

**结论：Project Utopia 在 onboarding 维度上落后所在品类的成品作品至少 8 年。**

---

## 改进建议（按优先级）

### P0：必须立刻修
1. **修复 Build sidebar tab 引发 about:blank 的崩溃 bug**。一个 SPA 不应该因为点 tab 就跳页。
2. **让标题屏幕真正暂停游戏**。title screen 显示时世界不能在跑，不能让玩家看到模拟在背后偷偷推进。
3. **briefing 内容必须随 Template dropdown 同步更新**。要么删掉 dropdown 只用 ?template URL 参数，要么让两边同步。
4. **隐藏所有 LLM/proxy 错误提示**。那些 "WHISPER / LLM never reached / AI proxy unreachable" 不该让玩家看到，应该静默 fallback 并在背后写日志。
5. **删掉地图上的 "halo" 调试标签**，它们让游戏看起来像未完成 demo。
6. **数字键 0 的"重置摄像机"功能不能被建造工具吃掉**。Hotkey 上下文冲突需要消歧。
7. **切换 template dropdown 不能立即开始新 run**。必须有"覆盖当前进度？"的确认弹窗。

### P1：教学核心
1. **加一个真正的 Tutorial 关卡**：5–10 步强制脚本化 onboarding，每一步暂停游戏 + 高亮目标按钮 + 简短文字说明，直到玩家建出第一个 Farm + Lumber + Warehouse + Road。
2. **加"任务/目标"侧栏**：把 scenario 的 "Reconnect the west lumber line / reclaim the east depot" 拆成具体子目标（带勾选框、地图坐标、奖励），并在玩家完成时给明确的 ✓ 反馈。
3. **建造按钮加可见 tooltip**（hover 出现卡片），列出：名称 + 热键 + 资源消耗 + 解锁条件 + 一句话作用。文学化文案放第二行。
4. **Inspector 面板换成自然语言**："Hunger: Hungry (36%)" 改 "Mose Keane is getting hungry — he's looking for food"。Top Intents/Top Targets 这种调试数据折叠到一个 "Debug" expander 里。
5. **失败画面**：colony collapse 时弹出明确的 "Run ended — Day X — Score Y — Try Again / New Map" 卡片，并说明导致失败的最关键事件（"The food chain broke at Day 12 when your Lumber stopped supplying the Kitchen."）。

### P2：UX 一致性
1. **Heat Lens / Terrain overlay 加图例**：现在屏幕左上写 "Overlay: Fertility" 但完全没说红 / 绿 / 黄分别代表多少。
2. **Resources 面板的 ETA 文字**（如 "1m 50s until empty"）应该提升到 HUD 主条，并配合动态颜色和警报。
3. **Score（pts）需要持续显示**。现在你 "Survive as long as you can" 却看不到分数。
4. **DevIndex / WHISPER / DRIFT 这些自创术语全部需要词汇表**（点问号 → 弹小卡）。或者干脆改名成玩家能立刻理解的英文（如 "Storyteller mode: Live AI / Rule-based / Idle"）。
5. **Help 对话框默认在 "Resource Chain" tab 而非 "Controls"**——玩家先要知道做什么，再问怎么按。

### P3：感受细节
1. 标题菜单加一个简短 30s 引子动画/插画/音乐，建立基调。
2. 角色 backstory（"woodcutting specialist, efficient temperament"）应该在选择 worker 时显示在 HUD 边缘而不是埋在 inspector 第二屏。
3. Toast 通知（如 "First Medicine brewed"）应该可点击查看历史，否则错过就再也找不到了。

---

## 收尾

我作为外部付费玩家，最终评分锁定 **3 / 10**：

- +1 因为你确实有 6 个不同的 map template 和 12 个建筑工具，框架是有的
- +1 因为 Help 对话框 4 个 tab 的结构是正确的（虽然内容不行）
- +1 因为 Storyteller 偶尔会给一句相对有用的提示（如 "consider Smithy for tool bonus"）
- −7 因为 onboarding 在每一个关键节点都失败：title 与游戏耦合错乱、术语爆炸、tooltip 撒谎、目标无视化、调试残渣横陈、还会蓝屏
- 整体感觉：**这是开发者的 sandbox，不是给玩家的产品**

如果不是被强制要求，新玩家会在 90 秒内关闭页面。**这款游戏的引导层目前不及 2014 年 Banished 的水平，更不要谈 RimWorld / ONI / Frostpunk。** 在交付商业玩家之前，需要至少 4–6 周专门做一次 onboarding 重写，包括但不限于上面 P0+P1 全部条目。
