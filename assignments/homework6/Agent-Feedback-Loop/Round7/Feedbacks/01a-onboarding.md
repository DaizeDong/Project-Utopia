# 外部玩家引导性（Onboarding）评测报告
**Project Utopia** — 第七轮评测 · 日期：2026-04-26  
**评测维度：引导性 / 新手教学 / Tutorial**  
**评测立场：从未接触过本游戏的外部付费玩家**

---

## 总体评分：**3 / 10**

相比上一轮，游戏在部分细节上有所改进——建筑工具的 tooltip 更具体了，Heat Lens 图例有所补全，场景简报加入了更明确的"First build"行动建议。但引导性的根本性缺陷依然存在：没有交互式教学序列，关键引导信息藏在开发者调试面板，Help 标签页切换存在功能性失效，且"How to Play"按钮在本轮测试中触发了意外的场景切换。一个首次接触本游戏的玩家，在不借助外部资料的情况下，大概率在 2 分钟内感到迷失，并在 10 分钟内放弃。

---

## 一、第一印象（前 60 秒）

### 1.1 启动画面：有结构，但背景令人困惑

本轮打开游戏后，页面中央出现浮层，包含：
- 游戏标题"Project Utopia"
- 场景一句话背景（"Your colony just landed. The west forest is overgrown — clear a path back, then rebuild the east warehouse."）
- 场景元数据标签（地图名称、尺寸、场景名、难度描述）
- 四行"Opening Briefing"要点，包含 First Pressure、First Build、Heat Lens 说明、地图尺寸说明
- 游戏目标卡（"∞ Survive as long as you can"）
- 地图模板选择器和尺寸输入
- 两行键盘快捷键提示
- 三个按钮：**Start Colony** / **How to Play** / **New Map**

浮层结构相比早期版本更规整，Opening Briefing 有明确的 First Build 行动指示（"Build a road to the west forest and put a warehouse on the broken east platform before scaling up."），这是进步。

**但背景中的地图已经在实时运动。** 殖民者在走动，3D 地图的光影在变化。在浮层消失之前，玩家无法明确区分"我还在菜单"和"游戏已经在运行"。这个视觉混淆是根本性的第一印象问题，且在本轮测试中依然未修复。

### 1.2 "How to Play"按钮的致命缺陷（本轮新发现）

本轮测试中，点击"How to Play"按钮后，游戏发生了以下行为：

1. 浮层没有立即停止，游戏在后台**切换了地图场景**（从"Temperate Plains · Broken Frontier"切换到"Fortified Basin · Hollow Keep"）
2. 游戏开始运行，计时器启动
3. Help 对话框延迟数秒后才弹出
4. 当 Help 对话框弹出时，玩家面对的是一个**完全不同的地图和场景**

这意味着：**新玩家在主菜单点击"学习如何玩"这个最安全的选择，却意外启动了一场游戏，且还换了一个不是他们选择的地图。** 这是引导性的零分场景——用户意图（我想先学习再开始）与系统行为（直接开始并切换场景）完全背离。这个问题在上一轮评测中也有记录，本轮仍未修复，应视为高优先级 Bug。

---

## 二、游戏内引导状态（进入游戏后）

### 2.1 无交互式教程，依然

进入游戏后，画面上没有：
- 任何步骤式高亮提示（"现在点击这里"）
- 任何分步目标卡（"Step 1/3: Place your first Farm"）
- 任何上下文感知弹窗（当玩家第一次打开 Build 面板时弹出说明）
- 任何禁止误操作的保护机制（新手很容易误点 Erase 工具删掉建筑）

游戏完全依赖玩家主动查阅帮助或悬停 tooltip。这对熟悉殖民地模拟游戏的玩家来说尚可接受，但对完全新手来说等同于没有引导。

### 2.2 Help 对话框结构问题

帮助对话框（F1 或点击"? Help"打开）有四个标签页：Controls、Resource Chain、Threat & Prosperity、What makes Utopia different。

本轮测试发现一个功能性问题：**四个 Tab 在点击后内容不切换**，所有内容同时渲染在一个滚动区域内，Tab 按钮点击没有实际的 UI 状态变化。对新玩家来说，这会让帮助系统看起来像"坏掉的"，或者干脆误认为"四个标签内容一样"后放弃查阅。

内容本身的质量：

- **Controls**：覆盖了基本操作（鼠标/快捷键）+ 3 条 Getting Started 要点 + Resource Chain 摘要。信息量合适，但"Getting Started"的 3 条建议（放 Farm、Lumber、Road）缺乏任何"为什么"的解释，也没有指引玩家去地图上找合适的位置
- **Resource Chain**：有资源转化链（Farm→Meals、Quarry+Wood→Tools 等），有一条"Tip"说明 Meals/Tools/Medicine 是全殖民地共享的。这是有用的信息，但缺乏数量性数据（一个 Farm 能养几个工人？一个 Kitchen 需要多少 Cook？）
- **Threat & Prosperity**：解释了 Threat 的含义，有"First Failure Path"说明，有 Survival Mode 定义。内容合格，但标题"First Failure Path"对新手没有直觉性（听起来像是"第一条失败路径"，而不是"常见的失败原因"）
- **What makes Utopia different**：解释 AI Director 系统（WHISPER/DIRECTOR/DRIFT）、Heat Lens、地图模板差异。这一页的内容对完全不了解基本循环的新手毫无意义——AI Director 的说明放在第四个标签等于隐藏了

整个帮助系统是**"把开发者已知的概念列成文档"**，而不是**"以玩家首次遭遇的顺序来组织信息"**。

### 2.3 顶部 HUD：信息密度过高，优先级不明

进入游戏后，顶部 HUD 从左到右依次显示：

```
[食物图标] 210  [木材图标] 4  [石头图标] 1  [草药图标] 0  [工人图标] 13
[场景描述文字 — 约 60 字] 
[存活时间] [Autopilot 状态] [警告图标⚠] [最新事件文字]
[场景进度条：routes 1/1 · depots 1/1 · farms 3/3 · walls 7/10]
```

**问题一：场景进度条字体过小**（经测试约 11px，透明度 0.85），与同行其他 UI 元素不成比例地弱化。这恰恰是最能告诉新手"我现在需要做什么"的信息，却是最难被注意到的元素。

**问题二：Autopilot 状态标签"DRIFT"含义不明**。经本轮实测，"DRIFT"出现时游戏明明已经在运行，殖民者已在移动，但帮助文档中 DRIFT 的定义是"colony is idle, between directives (menu phase, or right after load)"。对新玩家来说，这种不一致是无法自洽的矛盾。

**问题三："Dev 48/100"指标无上下文**。这个数字出现在 HUD 侧边（tooltip 说"Dev Index: 0-100 composite of production, infra, safety, morale"），但没有任何视觉脉络告诉玩家这是核心指标还是调试数字，更没有说明"48 是好还是坏"、"应该追求多少"。

**问题四："⚠"警告图标的 tooltip 内容**是"Storyteller fell back to rule-based director — Story Director: warming up..."，这是开发者调试信息，不是玩家可以理解或采取行动的信息。

### 2.4 最有价值的实时引导藏在开发者调试面板

本轮测试的最大发现：游戏内存在一个"System Narrative"模块（位于 Debug 侧边栏的折叠面板中），其内容直接包含：

```
Headline: Restore north timber gate
Next Move: Repair the north timber gate with roads.
AI: env=let the colony breathe | workers: rebuild the broken supply lane
Evidence: [详细场景状态数据]
```

以及"Live Causal Chain"模块：

```
Severity: error | Headline: Restore north timber gate
Next move: Repair the north timber gate with roads.
Warning focus: Hollow Keep: 0/1 routes online | 0/1 depots reclaimed...
```

这些内容本质上就是**"当前最优先做什么"的实时指导**——正是新玩家最需要的信息。但它们被埋在 Debug 面板的折叠 `<details>` 元素里，正常玩家绝不会打开"Debug"这个标签，更不会在一堆开发者数据中找到这个模块。

**将最有价值的引导信息放在开发者工具里，是引导设计上最大的结构性失误。**

### 2.5 Entity Focus（工人检视）：信息过载

点击工人后，Entity Focus 面板展示：
- 名字、角色（FARM/WOOD/STONE 等）、当前动作（Harvest/Seek Task/Deliver）、饥饿状态
- 角色详情（Traits: efficient/resilient/hardy）
- Mood/Morale/Social/Rest 四项数值（0.x 格式）
- 关系列表（Friend/Acquaintance + 数值）
- "Why is this worker doing this?" 区域：Top Intents（带权重数字）、Policy Notes、Decision Context（多段英文解释）
- Path Nodes（路径节点坐标）
- Last AI Exchange（完整 AI 调用的 JSON 输入/输出）
- Blackboard 数据

对新玩家来说，这个面板提供的第一屏信息中：**Mood=0.42 是好是坏？Top Intents: eat=1.40 | deliver=1.30 是什么意思？路径节点坐标有什么用？**

完全没有能让新手立即理解并采取行动的信息。大量调试数据和可阅读信息混合在同一层级，没有区分"玩家信息"和"开发者信息"。

---

## 三、具体场景问题列表

| # | 场景 | 问题 | 严重程度 |
|---|------|------|----------|
| 1 | 点击"How to Play" | 触发场景切换并启动游戏，而非显示静态帮助页 | **严重（Bug）** |
| 2 | Help 对话框 Tab 切换 | 四个 Tab 点击无内容切换效果 | **高** |
| 3 | 启动画面背景 | 地图已运行，玩家无法判断是否已进入游戏 | **高** |
| 4 | System Narrative "Next Move" | 最有价值的实时行动指引藏在 Debug 面板 | **高** |
| 5 | 场景进度条 | 11px 极小字体，术语不自解释（routes/depots） | **高** |
| 6 | Autopilot DRIFT 标签 | 游戏运行中显示 DRIFT，与文档定义矛盾 | **中** |
| 7 | "Dev 48/100" HUD 数字 | 无上下文，新手不知是否重要 | **中** |
| 8 | ⚠ 警告 tooltip | 显示开发者内部信息，对玩家无意义 | **中** |
| 9 | Entity Focus 面板 | 调试信息和可读信息混合，无简洁视图 | **中** |
| 10 | 食物耗尽告警 | 食物-62.5/min 只显示在 Colony 侧栏小字，无醒目警报 | **高** |
| 11 | 建筑 tooltip 依赖主动悬停 | 新手不知道需要悬停各按钮来了解建筑信息 | **中** |
| 12 | 失败后无复盘 | 游戏结束时无"你因 X 失败，下次尝试 Y"的建议 | **高** |
| 13 | 无任何交互式教学序列 | 没有分步高亮、没有引导箭头、没有新手关卡 | **严重** |
| 14 | Help 内容顺序不符合认知顺序 | AI Director 放第四个标签，基础建造只有 3 句话 | **高** |

---

## 四、与同类游戏的引导性对比

### vs. RimWorld（Rimworld 1.5）

RimWorld 以"学习曲线陡但有支撑"著称：
- 首次启动时，Learning Helper 会根据玩家行为动态弹出上下文提示（例如玩家第一次遭遇疾病，弹出医疗系统教学）
- 每个建筑、每个事件都有 Rimopedia 词条，可随时查阅
- 失败时游戏明确叙述"Cassandra Classic 消灭了你的殖民地，因为他们无法抵御冬天的严寒"

Project Utopia 的 Opening Briefing + 场景进度条的设计思路与 RimWorld 的 AI 叙事者风格类似，但**完全缺少 Learning Helper 的动态触发机制**。RimWorld 的帮助信息在你需要时出现；Project Utopia 的帮助信息在你主动去找时才能被发现。

### vs. Oxygen Not Included

ONI 的引导是硬核模拟类游戏中公认做得最好的：
- 完整的 Tutorial 关卡，预设地图，手把手演示核心流程
- 每个建筑有精确的输入/输出/能耗数据面板（无需查文档）
- 首次激活某功能（热图、气压图）时弹出解释卡片

Project Utopia 的 Heat Lens 与 ONI 的热图概念最相近。ONI 在玩家第一次打开热图时会显示说明；Project Utopia 在 Opening Briefing 里用一句话提过 Heat Lens，按 L 键激活后，玩家完全靠自己理解红蓝色意义，图例在 Colony 面板底部的一个折叠区域里。

### vs. Dwarf Fortress（Steam 版）

Steam 版 DF 因其主动增加了图形界面和清晰的菜单层级而受到好评。但 DF 的定位是"以不友好为卖点"，Project Utopia 显然不是这个方向（它提供了帮助文档和 tooltip）。两者最大的差距在于：DF 的社区文档极为完善（Dwarf Fortress Wiki 是游戏的"第二个教程"），而 Project Utopia 目前没有任何可见的社区支持系统。

**结论差距表：**

| 维度 | RimWorld | ONI | DF Steam | Project Utopia |
|------|----------|-----|----------|----------------|
| 交互式教程 | ✓（动态弹窗） | ✓（完整关卡） | 部分 | ✗ |
| 建筑输入/输出数值 | ✓ | ✓ | ✓ | ✗ |
| 游戏目标清晰度 | ✓ | ✓ | 部分 | 部分（进度条但隐蔽） |
| 失败复盘 | ✓（叙事描述） | ✓ | 部分 | ✗ |
| 上下文感知帮助 | ✓（Learning Helper） | ✓（弹窗）| ✗ | ✗ |
| 调试信息与玩家信息分离 | ✓ | ✓ | ✓ | ✗（混合展示） |

---

## 五、改进建议

### 优先级 P0（立即修复）

**1. 修复"How to Play"按钮行为**  
点击应弹出静态帮助对话框，不应触发游戏启动或场景切换。这是基础 UX 正确性问题。如果 How to Play 当前是在游戏运行状态下叠加显示的，则应确保帮助对话框打开时模拟暂停，且关闭后不切换场景。

**2. 修复 Help 对话框 Tab 切换**  
四个 Tab 应当实际切换到各自独立的内容区域，而非将全部内容同时渲染。当前行为让帮助系统看起来功能损坏。

### 优先级 P1（核心引导补全）

**3. 将 System Narrative "Next Move" 移入主 HUD**  
"Restore north timber gate — Repair the north timber gate with roads."这类实时行动建议是最有价值的引导信息，应当在游戏主界面（顶部状态栏或画面一角）以醒目方式展示，而不是埋在 Debug 面板的折叠区域。可参考 ONI 的任务卡设计或 RimWorld 的叙事框。

**4. 增加至少 3 步交互式引导序列**  
游戏开始后，依次高亮：
- Build 面板 → Farm 按钮（"这是你的第一步：建造食物来源"）
- 一块草地（"点击绿色地块放置"）
- 建造成功后，高亮 Road 按钮和最近的 Warehouse（"用道路连接建筑加速运输"）

不需要复杂的教程引擎，三步 CSS 高亮 + 条件触发弹窗即可。

**5. 食物危机醒目警报**  
当食物剩余时间低于 2 分钟时，顶部 HUD 应出现红色脉冲警告（不只是 Colony 侧栏里的一行小字"≈ 48s until empty"）。饥饿是最常见的新手失败原因，必须有第一时间可见的警报。

**6. Entity Focus 简洁 / 高级视图切换**  
工人面板默认显示：名字、当前任务、饥饿状态、当前工作建筑。Mood 数值、AI 决策权重、路径坐标、Blackboard 数据收入"高级"折叠区，不作为第一屏呈现。

### 优先级 P2（体验提升）

**7. 失败后复盘卡**  
游戏结束时显示："你的殖民地在第 X 天因食物耗尽失败。最后死亡的殖民者是 Y。下次尝试：在 Day 3 之前建造第二个 Farm。"参考 FTL 和 ONI 的失败叙述设计。

**8. 场景进度条视觉升级**  
当前 11px 极小字体的进度条（routes/depots/farms/walls）应放大为可视化进度卡，加入图标和颜色状态区分（绿色=完成、黄色=进行中、红色=警告）。

**9. 建筑 tooltip 加入数量信息**  
每个建筑的 tooltip 应当包含"每分钟产出约 X 单位"和"建议工人数"。当前 tooltip 只有定性描述（"produces food for workers"），缺乏让玩家做决策所需的数量参考。

**10. Autopilot 开机解释**  
游戏第一次启动时，弹出一个一次性说明："Autopilot 让 AI 管理大部分决策，适合新手观察游戏逻辑。你可以随时关闭并手动接管，或同时存在。"然后让玩家做选择。避免新手在不知情的情况下不知道自己有没有控制权。

---

## 六、结论

Project Utopia 在本轮（Round 7）的引导性状态与上一轮对比，改进是边际性的：建筑 tooltip 文案更具操作性（例如 Kitchen 的 tooltip 明确说"unlocks after you have 6 farms feeding well"），Opening Briefing 的 First Build 行动指示更具体。这些是正确方向的进步。

然而，两个严重 Bug（How to Play 触发场景切换、Help Tab 不切换内容）在本轮仍然存在，说明引导系统的测试覆盖率不足。更根本的问题——无交互式教程、最有价值引导藏在 Debug 面板、调试信息与玩家信息不分离——是架构性问题，无法靠 tooltip 文案迭代来解决。

**评分：3 / 10。**  
游戏拥有扎实的深度，但对新玩家来说，它目前更像是一个需要开发者陪同演示的 Demo，而不是一个可以独立体验的产品。

---

*本评测基于约 50 次独立 UI 交互，涵盖：启动画面、How to Play 按钮、Help 对话框全部 4 个标签、Build 面板（所有 13 个工具按钮及其 tooltip）、Colony 面板（Resources/Population/AI Storyteller）、Settings 面板、Entity Focus（多名工人及全部展开数据）、Heat Lens 激活状态、Terrain Overlay、Debug 面板（System Narrative/Inspector/Events/Director Timeline/AI Decisions）、顶部 HUD 所有可交互元素（共约 90 个 data-tip 元素），以及游戏运行约 90 秒的实时观察。*
