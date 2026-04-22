---
reviewer_id: 01a-onboarding
round: 1
date: 2026-04-22
score: 3
verdict: 有按钮有 Help 面板，但没有真正的"教学"——把一份技术文档塞给玩家自己啃
---

# Project Utopia — 外部评测（引导性视角）

## 总体评分：3 / 10

**一句话结论**：这款游戏把"How to Play"当作阅读理解题塞给了玩家，然后让玩家独自面对一张信息密度爆炸、几乎没有反馈的 RTS 俯视图——在它声称自己是"无尽生存"游戏的同时，它连"你现在该做什么、有没有建成、是不是要死了"这三件最基本的事都没能告诉玩家。

---

## 一、第一印象（进入游戏前 30 秒）

打开页面后直接弹出标题卡 "Project Utopia"，下面一句模糊的开场："Reconnect the west lumber line, reclaim the east depot, then scale the colony."——这句文案有三个问题：

1. 没有任何画面告诉我"west lumber line"和"east depot"长什么样、在哪里。我看到的是一张湖、几丛树、几只小羊的俯视图，根本不知道哪里是西、哪里是东。
2. "Reclaim"、"scale"这种词假设我是老玩家。新手对 scale a colony 没有任何心理模型。
3. 标题上方写着 "Broken Frontier · frontier repair · 96×72 tiles"，后面那半截是给开发者看的（地图尺寸），不是给玩家看的。商业成品游戏不会在欢迎画面秀 `96×72 tiles`。

紧接着下面是一个 "∞ Survive as long as you can, 00:00:00 · 0 pts" 的计分条——它在我开始玩之前就已经开始显示分数了。我既没有被告诉什么是 "pts"、也没被告诉 "Dev" 是什么。

底部有三个按钮：**Start Colony / How to Play / New Map**。"New Map" 这个按钮的存在暧昧——它是不是只是换个种子？我点了下确认这一点，不会重置 How to Play。作为第一次打开游戏的人，我期望的是类似"开始教程 / 自由游玩 / 设置"这种清晰分工，而不是"开始 / 看 wiki / 换地图"。

**第一印象评分：3/10**。不像成品，像一个早期 alpha dev build。

---

## 二、核心教学缺陷

### 1. "How to Play" 是一份 wall-of-text，不是教学

点进去是三个 tab：Controls / Resource Chain / Threat & Prosperity。每个 tab 都是一段纯文字 + 列表。没有任何：
- 图示 / gif / 箭头指向界面
- 交互式演示（"现在请你放一个 Farm"）
- 分阶段的小任务
- 可以随时 pin 在屏幕上的 checklist

> "Raw resources become refined goods through processing buildings. Workers haul resources to warehouses; processors pull from storage."

这句话给一个没玩过 RimWorld 的新手读，他只能理解"好像要建点东西"。如果他玩过 RimWorld，这句话对他来说又是废话。两头不讨好。

**对比 RimWorld**：RimWorld 有 "Learning Helper"，它会在玩家第一次碰到"饥饿"、"第一次有尸体"、"第一次遇袭"时弹出上下文帮助。Project Utopia 把所有内容一次性糊到你脸上，然后关掉 Help 就让你凭空开始。

### 2. 进入游戏后没有 "接下来做什么" 的引导

按下 Start Colony 之后，立刻出现一个 12 个按钮的 Build Tools 面板，顶部有 5 个资源图标 + 一段被截断的 Storyteller 文本 + 一行无解释的数据：

```
routes 1/1 · depots 1/1 · wh 3/2 · farms 4/4 · lumbers 2/3 · walls 7/4
+1/s · +5/birth · -10/death (lived 0 · births 0 · deaths -0)
```

作为一个没有先验知识的玩家，我看到这行数据**完全不知道是好消息还是坏消息**。

- `routes 1/1` 是满足了要求吗？还是它只追到了 1？
- `wh 3/2` 的 3/2 到底是 3 个现有 warehouse 对比要求 2 个吗？
- `lumbers 2/3` 意思是我少一个？少一个会怎样？
- `+1/s +5/birth -10/death` —— 是分数公式，但页面上没解释 lived、births、deaths 到底算的什么，也没解释这些数字之后将从哪里来。

商业游戏会把这些包装成 **"Objectives（当前目标）"** 和 **"Tips（新手提示）"** 分开。这里把日志、KPI、任务目标全搅在一起，用同一种字号渲染。

### 3. 没有"任务列表"——只有 Storyteller 讲废话

UI 顶部那条文字 `[Rule-based Storyteller] route repair and depot relief: Workers should sustain route repair and depot relief while keeping hunger and carried cargo from overriding the map's intended reroute press...` 读起来像一段 LLM 吐的 dev note，不是玩家需要看到的东西。它告诉玩家"工人应该维持 route repair"——但**这是工人的任务，不是玩家的任务**。玩家需要的是"你该在哪放下一个 Warehouse"这种可执行的指示，不是"worker 会怎么做"的元描述。

### 4. 建造反馈几乎为零

我做了四个关键测试，发现游戏在这些场景几乎完全静默：

- **测试 A：Kitchen 建造**。我选了 Kitchen 工具（提示成本是 "8 wood + 3 stone"），在一个疑似空地的位置点了下。我的 wood 从 22 掉到 7（但游戏一直在消耗 wood，消耗速率是 -148/min，所以这个降幅其实不一定是 kitchen 扣的）。屏幕上**没有弹出 "Kitchen placed"、没有闪光、没有音效、没有 Kitchen 的建筑图标在地面上出现**。我根本不确定我是否成功建造了。后面的 Colony 面板里的 COOK 角色仍然是 0，暗示 Kitchen 没建成或者没有 worker 被分配——但我从 UI 根本看不出是哪种情况。
- **测试 B：在水面上放 Road**。Road 的说明写着 "Place on grass or ruins"。我把它放到了湖里。**什么都没发生**——没有红色 X、没有 "Invalid placement" 弹窗、没有鼠标变成禁止光标、没有声音提示。这在 RimWorld / Oxygen Not Included 里都是 UI 硬底线。
- **测试 C：点击 worker**。主菜单 tooltip 写 "click a worker to inspect"。我在很明显的 worker sprite 上点了几次，Entity Focus 面板**始终是空的**（只显示标题 "Entity Focus"）。不确定是 hitbox 太小还是我根本没点中。即使 miss 也应该至少闪一下告诉我"没选中东西"。
- **测试 D：鼠标悬停 tile**。Construction 面板底部写 "Hover a tile to preview cost, rules, and scenario impact." 我悬停了多个 grass、水、建筑上方，**什么 tooltip 都没有弹出**。不知道是 bug 还是我没理解这句话在说什么。

这四个测试**每一条都击中新手最不能原谅的 UX 硬伤**。商业游戏在用户点错的时候会给反馈；这里连点对了都不给反馈。

### 5. Heat Lens 的"教学"失败

按下 L 或点击 Heat Lens 按钮后，顶部文字变成 "Heat lens ON — red = surplus, blue = starved."——但我在整张地图上**一个红色或蓝色 heat 区域都没看到**。地图色调跟开 lens 之前几乎没区别。如果确实有 overlay，对比度低到肉眼分辨不出。这种"打开了功能但看不到效果"比没这个功能更糟——我只会认为这是个 bug。

### 6. 术语黑洞

我在前 60 秒内遇到的没解释的术语（这些都出现在主界面上或 Help 里，从未被定义）：

- **Dev 49/100**（Dev Index？DevIndex？谁都不知道）
- **routes / depots / wh**（缩写，没展开过）
- **Prosperity**（Help 里提了一次，没告诉我当前值是多少也没告诉我怎么看）
- **Threat**（同上）
- **DevIndex**（Help 里提了但主界面缩写成 Dev）
- **Supply-Chain Heat Lens**（三个词的专有名词一口气砸脸上）
- **Storyteller**（RimWorld 老玩家懂，其他玩家会懵）
- **routes 1/1**（用 / 表示 current/target 吗？还是 live/required？）
- **scenario gap**（Road 工具说明里提到 "repair a scenario gap"，我完全不知道 scenario gap 长啥样）
- **HAUL、COOK、SMITH、HERBALIST**（大写、全缩写，像游戏 dev 常量而不是 UI 标签）

### 7. 快捷键发现性低

主菜单列了一串快捷键（1-12, L, Space, F1, ?），但进了游戏后只有 Build Tools 底部小字复述，没有一个 "Press L for Heat Lens" 的 callout。Ctrl+Z / Ctrl+Y undo 在 How to Play 里提了一次，游戏中完全没有 undo 历史的 UI 显示——我不知道我撤销了什么。

---

## 三、具体场景问题列表

按玩家从进入游戏开始的时间顺序记录的具体问题：

| # | 场景 | 预期 | 实际 |
|---|---|---|---|
| 1 | 标题卡开场 | 有引导句告诉我这是什么游戏，目标是什么 | 只有一段谜语人式的殖民地叙事 |
| 2 | 点 "How to Play" | 有交互式或至少有示意图的教学 | 三个 wall-of-text tab |
| 3 | 点 "Start Colony" | 有一段"你的第一个目标"提示覆盖 | 立刻进入 UI 塞满的主界面，没有 pause 等我看 |
| 4 | 看顶部状态栏 | 资源数字 + 易懂的当前阶段目标 | 一行 KPI 缩写，Storyteller 废话被截断 |
| 5 | 悬停 tile | 弹 tooltip 说"这是什么 tile、能建什么" | 什么也没有 |
| 6 | 选 Kitchen 工具 | 禁用非法 tile，合法 tile 高亮绿色 | 所有地方看起来都差不多 |
| 7 | 点击合法 tile 建造 | 出现建造动画/音效，建筑 sprite 立刻渲染 | 不确定是否成功 |
| 8 | 点击不合法 tile（水） | 红色 X / 音效 / 文字提示 | 静默失败 |
| 9 | 点击一个 worker | 出现 worker info 面板 | Entity Focus 面板保持空 |
| 10 | 按 L 开 Heat Lens | 画面明显变色 | 只有顶部文字变，地图肉眼无变化 |
| 11 | 死了 10 个 worker 后 | 弹警告"有人饿死了/受伤了" | 只有顶部那行 `deaths -10` 闷声增长 |
| 12 | Tools / Meals / Medicine 一直 0 | Storyteller 应当提示"你需要 Kitchen" | Storyteller 还在说 "route repair and depot relief" |
| 13 | 存活 1 分钟后 | 应当解锁/提示新建筑或新机制 | UI 一成不变，没有 pacing |

---

## 四、和同类成品游戏的差距

### vs RimWorld

- **RimWorld 有 Learning Helper**——上下文弹窗，第一次冷了提示做衣服，第一次出血提示造医疗台。Project Utopia 没有任何上下文帮助。
- **RimWorld 有 Work Tab**，玩家能自己指派 cook/doctor/hauler 的优先级；Project Utopia 的 Population 面板只显示数量 "COOK 0, SMITH 1"，**没有任何交互**——我无法把一个工人从 WOOD 转到 COOK，连点击它们都没反应。
- **RimWorld 有 Alerts 面板**，右侧永远显示"X 人饥饿 / Y 人受伤 / 缺床位"这种需要处理的事。Project Utopia 只有一个一成不变的状态栏数据条。

### vs Oxygen Not Included

- **ONI 有完整的 onboarding 关卡**，解锁建筑按类别分，工具 tooltip 用图示描述"这个建筑需要什么 / 产出什么"。Project Utopia 的 Construction 面板只有一行 "Cost: 8 wood + 3 stone" 和一行描述，没有图示、没有 input/output 示意图。
- **ONI 有 Overlay 系统**（温度、气体、电力、水）**每个都有颜色图例**。Project Utopia 的 Heat Lens 打开后连图例都没弹出。

### vs Dwarf Fortress（新版 Steam）

- **DF Steam 版本甚至有 tutorial fortress**，一步步教你挖地、做床、建餐厅。Project Utopia 把你扔进去，用一段 LLM 式 storyteller 文本充当"引导"。
- **DF 的 Unit 选择**会显示整页详情（姓名、技能、心情、需求）。Project Utopia 连 worker 能不能点中都成问题。

### 底线

Project Utopia 在纯机制上有 12 种建筑、5 种资源、多个角色分工、Heat Lens、Storyteller、无尽生存——这些特性都比入门向的独立游戏更复杂。但它的 onboarding 水平**停留在一个 jam 版本**：有 help 面板，但没有交互教学；有 tooltip，但只在工具按钮上有；有反馈需要的地方（建造/点击/选中/死亡）全都静默或极不显眼。

---

## 五、改进建议（按性价比排序）

### P0 必须做（否则根本留不住新玩家）

1. **点击无效时给明确视觉反馈**：红色闪烁的 tile 边框 + 错误文字 "Roads must be placed on grass or ruins."
2. **建造成功给反馈**：放下建筑后，建筑 sprite 立即在地面出现（现在看不出有没有放下），配一个很短的 "thunk" 音效。
3. **Entity Focus 必须能用**：点击 worker/building 一定要显示面板。如果没命中，给一个 "No entity selected" 提示。
4. **让 Heat Lens 可见**：至少画一个色图，或者开启后暗掉非 heat 区域让 heat 区域突出。
5. **把 Objectives 从 KPI 行里拆出来**：右上角单独一个 "Current Goals" 列表，勾选式的，"✓ Repair the west route（已完成）/ ⬜ Build a Kitchen（未完成）"。这一个改动就能救 50% 的新手教学。

### P1 强烈建议

6. **第一次进场 auto-pause**，让玩家先看 UI；弹一个小 overlay 教控制键。
7. **Storyteller 只说和玩家操作相关的内容**（"你饿了！请建 Kitchen"），别说工人"应该做什么"的元描述。
8. **加 Alerts 面板**（模仿 RimWorld）：缺医疗、缺食物、单位受伤、袭击将至，红黄图标常驻右侧。
9. **Tooltip on hover tile**：按 Help 里说的实现，不要把 UI 文字写成 "hover to preview" 然后不实现。
10. **缩写全展开**：Colony 面板里 "WOOD / STONE" 改成 "Woodcutter (5) / Stonecutter (1)"。

### P2 有时间再做

11. 把 How to Play 改成交互式：第一次进游戏弹"建一个 Farm 试试" → 放下后立即 "现在建一个 Warehouse"，一步步走。
12. 加 "Undo preview"——undo 一下告诉我撤销了什么。
13. Building 名字标签（zoom 深时可见），至少鼠标悬停 2 秒显示名字 + 状态。

---

## 六、总结

给 3/10 的理由：

- 有 Help 面板、有快捷键列表、有基础叙事，**说明开发者意识到需要 onboarding**，不是零分。
- 但三个关键操作（合法建造、非法建造、选择单位）全静默失败，Heat Lens 只动顶部文字不动画面，Storyteller 讲工人的事不是玩家的事，术语缩写泛滥——**新玩家 5 分钟内会认为这游戏不在乎他们是否理解**。
- 长时间（等效 30 分钟 / 1 小时 / 2 小时）玩家理解度几乎不提升，因为系统**没有新信息递送机制**——没有解锁、没有提示、没有目标推进。玩家只会在重复查看 Colony 面板的过程中学会一点点词条，但学会了也不能操作（无法重分配工人职业）。

如果这是"作品集级 demo"就算它合格；如果它要宣称是一个真的能让外部玩家坐下来玩 3 小时的游戏，当前的 onboarding **会在 5 分钟内劝退绝大多数没玩过 RimWorld/ONI 的人**。

最终评分：**3 / 10**。
