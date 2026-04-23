---
reviewer_id: 01c-ui
round: 2
date: 2026-04-22
score: 4
verdict: 视觉风格统一但信息拥挤、响应式崩裂、交互反馈稀薄——像一个有美学坚持但未打磨的原型。
---

# Project Utopia 外部 UI 评测（Round 2）

## 第一印象

访问 `http://127.0.0.1:5173/` 后首先看到的是一张草地+水域的顶视图预览，其上悬浮着一个以深蓝渐变为背景的"开局面板"。标题 **Project Utopia** 使用亮青蓝色加粗字体，下方一段任务简介（"Reconnect the west lumber line, reclaim the east depot, then scale the colony."），然后是一串按 pill 样式排列的场景标签（"Broken Frontier · frontier repair · 96×72 tiles"）和一个带 ∞ 图标的长条：

> Survive as long as you can ..... 00:00:00 · 0 pts

再下方是 Template 下拉、Map Size 两个数字输入、两行快捷键说明（RMB/Scroll/1–12/Space/L、LMB/RMB/?/F1），最后是 **Start Colony / How to Play / New Map** 三枚按钮。

整体第一眼的感觉：

- **美术基调**可辨识——深蓝玻璃感的面板、高对比的白字、青蓝主色调按钮，并不算业余；
- 但**信息密度偏高**：在"还没开始玩"的状态下就塞进了目标、地图模板、地图尺寸、5 组快捷键提示，外部玩家（尤其是非英语母语的新人）在 5 秒内只能抓住 "Start Colony" 这一颗按钮；
- 背景泄露的草地+水（棋盘格水面带白色波浪条纹）显得非常**像素风 / 贴图拼接**——并不是那种在商业 Three.js 游戏里能看到的"3D 漂亮模型+柔和光影"，而更像一层贴在平面网格上的 2D tile sprite；
- 画面底部还浮着一块 "Entity Focus" 的折叠栏和一个**音频播放器样式**的速度控件（⏸ ▶ ⏩ 0:15），看起来很像 Bootstrap 的 media control——这块会让人**短暂怀疑游戏是不是内嵌了一段视频教程**。

综合首印象：视觉风格有自己的语言，但**没有明显的"我是一款商业游戏"那种精致感**。更像是一款功能完备的独立游戏 demo。

## 布局问题

### 屏幕四角被遮挡，**游戏主画面被挤到中央小窗**

点击 Start Colony 进入游戏（1920×1080）后的布局大致是：

- 左上：5 个资源 pill（食物/木/石/草药/工人）+ 场景描述，占据了**屏幕左上 40% 宽度**，但并未用线框或分隔线明确包起来；
- 正上中央：**两行正文**——第一行 "Survived 00:00:15 Score 25 · Dev 48/100"，第二行是一串极长的目标清单（"1 of 1 supply routes open 1 of 1 depots reclaimed 7 warehouses built (goal 2) 4 farms built (goal 4) 3 lumber camps (goal 3) 7 walls placed (goal 4)"），接下来还有 "Last: No deaths yet"；
- 右上：DRIFT/DIRECTOR 字样 + 黄色副本叙事条（"The colony breathes again. Rebuild your routes before the next wave."）+ 四个功能按钮（Build / Colony / Heat Lens / ? Help）；
- 左中：Build Tools + Construction 两个折叠面板常驻（即使我从来没点过展开），面板**宽度约占屏幕 14%，高度超过 55%**；
- 右中：点 Colony 后出现的 Resources + Population 面板，占据屏幕右 18%；
- 底部正中：Entity Focus 折叠栏 + ⏸ ▶ ⏩ 速度控件。

真实可见的地图区域被压到**大约中心 60% × 65%** 的矩形，而且 HUD 没有"收起/打开"切换键，玩家**没有一键进入纯净游戏视图的方式**。

### 顶栏信息没有视觉分隔

资源条、任务描述、时间+分数、长达一整行的目标清单（wall placed（goal 4）这种）、DRIFT 提示、叙事黄条全部在顶部**白字贴在场景上**，没有底色容器、没有分组线。一旦背景从深色水域过渡到浅色草地，顶部白字**对比度会瞬间崩掉**（01c-02 中 "Broken Frontier — Reconnect..." 就贴在浅绿草地上，几乎看不清）。

### Entity Focus 位置可疑

这个条浮在画面底部中央、看起来像一个播放控制条旁边的"曲目标题"。它和它右侧的速度按钮完全是两种设计语言（一个用 ▶ 符号，一个用纯文字），且被放在一个本应该是"空地"的视觉区域。商业游戏（Rimworld/ONI）的默认做法是把 selection inspector 固定在**下半屏或右侧常驻栏**，而不是半浮动的折叠框。

## 可读性

### 字体大小不统一

- 资源数值（100 / 7 / 4）字号较大，可读；
- 顶部"Survived 00:00:15 Score 25 · Dev 48/100"中号白字，勉强清晰；
- 下一行目标清单是**同一字号的连续白字**，只在数字前后有空格分隔，肉眼需要眯眼解析，极其像 `console.log` 直接输出；
- 右侧 Resources 面板的 "+38.3/min" 速率标签字号偏小（约 11 px），且灰色浅色字显示在深蓝背景上，距离 1.5 m 外阅读会吃力。

### 颜色对比度

最严重的对比度问题是**白色/浅灰叙事文本**直接贴在草地/地图上——例如 "Broken Frontier — Reconnect the west lumber line, reclaim the east depot, then scale the colony." 在 01c-02 截图中与浅绿草地几乎融合。WCAG AA 要求 4.5:1 对比度，这里肉眼判断应该只有 2:1 左右。

DRIFT/DIRECTOR 标签是小写粉蓝色缩略词（约 10 px），在浅绿上更糊。

### 数值语义不够显著

顶栏 "Dev 48/100" 作为"整体繁荣度"这种**最核心的分数指标**，和 "Score 25" 拼在同一行、字号、颜色——玩家第一眼看不出它重要。没有进度环、没有色彩编码（例如 Dev<40 红/40–70 黄/>70 绿）。

资源数字前面的图标——食物（棉花/麦穗？）、木（木头）、石（灰块）、草药（紫叶）、工人（小人）——**风格化尚可**，但 pill 上没有文字 label，完全依赖图标识别度。对新人而言，"7"到底是木头还是石头要盯着图标想一下。

## 视觉层次

层次基本**是平的**：

- 所有面板都用同一套"深蓝半透明 + 白字 + 青边"的设计语言，面板与面板之间**没有主次区分**；
- Resources 面板里，Food / Wood / Stone / Herbs 用一种布局，Meals / Tools / Medicine 用横排紧凑布局——内部已经不统一；
- Build Tools 里 12 个工具按钮按 2 列 6 行排列，按钮尺寸完全相等，**没有"基础/进阶/特殊"的视觉分组**（道路和 Kitchen 并列，但重要度差很多）；
- "Selected Tool Road" 在 Construction 面板里用的是**右对齐的灰字**而不是高亮色，选中反馈弱；
- 顶栏那串长达一整行的目标清单（Warehouses 7/2 Farms 4/4 Lumber 3/3 Walls 7/4）完全没有**已完成（绿勾/划线）vs 未完成**的视觉标记。

警告优先级完全缺失：当看到 "Last: [182.8s] Dax-27 died (starvation)" 和随后一连串死亡事件时，文字仅仅是 **同字号灰白文本**，没有红色、没有惊叹号图标、没有浮动 toast——对商业生存游戏来说这是**严重的反馈失败**。

## 反馈感

### 悬停反馈

- 工具按钮悬停会出现小 tooltip（例如 Farm 上出现 "Farm (2) — produce food, cost: 5 wood"）——**极简但有**；
- Heat Lens 按钮悬停时出现 "Heat Lens legend — red = producer warehouse full / overflowing, blue = processor starved for input" 的白条 tooltip，内容有用，但排版为**两行极长的无标点文字**，阅读体验不佳；
- 资源条 / 顶部分数区 / DRIFT 区域**悬停无任何反馈**。

### 点击反馈

- 工具按钮（Road 当前选中）被高亮成**蓝色底+白字**，这是可见的，但和未选中按钮的对比并没有那么强；
- 点 Heat Lens 后**只在顶栏左侧多出一个小字标签**"Heat ens ON — red = surplus, blue = starved"和右上一个小小的图例（红点 surplus、蓝点 starved）；地图上**本身看不出明显色温叠加**——在我截的 01c-06 / 01c-14 里我都没能看到明显的热度覆盖层，这对于一个以"供应链热图"为核心的功能是**致命的可视化反馈缺失**；
- 在画布上点击一个 worker tile：尝试用程序化 click 事件时 Entity Focus 仍显示 "No entity selected"——也就是说 **UI 层没有捕捉到 canvas click 事件**（或者需要特定的像素精度），对鼠标不精准的玩家非常不友好；
- Start Colony 按钮点下没有加载/过渡动画，直接切到游戏界面。

### 时间/速度反馈

⏸ ▶ ⏩ 三键的选中态有**浅色高亮**（01c-09 中 ⏩ 被框起来），这一点做得合格。

### 死亡/危机事件

在 6:55 时刻，我观察到 "Last: [411.5s] Beck-31 died (starvation)" 这行文字出现在顶栏第二行，完全和普通目标文字同一视觉权重——一个**死亡事件和"walls placed (goal 4)"** 竟然用相同的灰白字号。作为商业成品，这非常不合格。

## 对比同类

- **RimWorld**：底部 tab 栏（Architect / Work / Schedule…），右下常驻速度控件，顶部左右分别是日期/温度和警报堆叠（红色弹出的 "Raid!" 条）。信息量同样大，但**使用色块+图标区分类别**，新手可以在不懂英文的情况下识别"红=危险/绿=安全"；Utopia 的顶栏全是白字白字白字。
- **Oxygen Not Included**：极强的视觉层次——左上资源总览用大字+彩色图标+走势箭头（↑绿/↓红）；Utopia 也有 ▲▼ 箭头和 +38.3/min，但**箭头颜色只是深绿/红色小字**，远不如 ONI 显眼。
- **Factorio**：游戏画面占满，所有 UI 都是"按 E/J/L 等键呼出的全屏/半屏面板"；进入游戏后画面**极度干净**。Utopia 选择了"永远显示 Build Tools + Construction"的 MMO 式常驻面板，对硬核策略玩家来说其实是**屏幕被 HUD 吃掉**的负担。
- **Frostpunk / Surviving Mars**：资源栏用大号数字、图标、颜色编码的进度趋势；危机通知是**屏幕中央的弹窗+震动+声音**。Utopia 的死亡事件只是一行小字。

综合来看，Utopia 的 UI **达到了"独立游戏早期版本"的水平**，还远没到付费商业产品的标准。

## 响应式测试

- **1920×1080**：基本可用，但顶部目标文字和 "Last:" 行会水平溢出、右侧 Colony 面板竖直几乎顶到底部；
- **1024×768**（01c-12）：**严重崩坏**——资源 pill 被挤到左上两列 + 右下一行；中央文字块挤成一列 9 行（"0 of 1 supply / routes open 0 of 1 / depots reclaimed / 0 warehouses built / (goal 2) 2 farms / built (goal 4) 1 / lumber camps …"）；Build Tools 面板左侧和 Resources 面板右侧几乎把地图挤没；按钮上的文字（"Heat Lens (L)"）开始换行。这个分辨率**实际不可玩**；
- **800×600**（01c-13）：反而比 1024 更"凑合"——HUD 把中央让给地图。资源条变单行 horizontal，死亡事件条 "Last: [349.5s] Nori-23 died (starvation)" 直接横跨；但面板覆盖了大半个游戏区，**小地图上几乎看不见 worker 动作**。

结论：UI **没有针对中低分辨率的优雅降级**。一款付费游戏 2026 年应该至少在 1280×720 下保持可用。

## 3D 场景呈现

- Three.js 渲染的其实是**2D 贴图 tile grid**，没有真正的透视、光照或阴影；地形靠**颜色块**区分（绿草 / 深青+白条纹水面 / 森林绿方块 / 棕色土路 / 灰色石板）；
- Tile 的贴图在近距离（01c-14）下能看到**棋盘格 + 白色三角波浪的水**和**规整矩形的土路与废墟**，有独立风格但精度不高；
- Worker 是很小的**灰白像素人偶**，方向/动作几乎不可辨；Herbivores 和 Predators 也类似小剪影——**没有动画帧表达行为状态**（走/砍/吃）；
- 建筑图标（小剑、肉、花、齿轮、柱子）作为 overlay 堆在 tile 上，**不是 3D 模型**；这与"Three.js 殖民地模拟"的宣传会让玩家有落差；
- 光影：**没有任何方向光/环境光变化**，不存在昼夜循环的渲染表现（即使游戏内有 "Survived 00:06:55" 的计时）；
- 没有过渡动画：建造、摧毁、资源变化都是**瞬间跳变**的。

## 具体缺陷清单

1. **顶栏叙事文本贴浅色背景** — 01c-02 中 "Broken Frontier — Reconnect..." 被草地吞掉 → 需要深色底板或文字阴影。
2. **目标清单无视觉分组** — "7 warehouses built (goal 2) 4 farms built (goal 4) ..." 像 debug 日志 → 改为勾选列表 / 进度圆环 / chip。
3. **死亡事件仅单行灰字** — 01c-10/11/14 starvation 事件应有红色警示 + 图标 + toast 动画。
4. **Heat Lens 视觉效果几乎看不到** — 01c-06/14 地图无热度叠加；这是核心玩法功能却"哑火"。
5. **Entity Focus 浮栏位置/设计违和** — 01c-15 折叠栏贴近 media player 按钮，语义混乱。
6. **Canvas 点击反馈不稳定** — 外部玩家点 worker 未必能选中，没有 hover 高亮提示。
7. **响应式崩坏** — 1024×768 下 HUD 抢版面（01c-12），目标文字换行 9 行。
8. **Build Tools 12 个按钮同权重**，高级建筑（Kitchen/Smithy/Clinic）和 Road 平起平坐。
9. **速度控件位置过于中心** — 一个游戏节奏控件放在屏幕正下方中央像播放器，不像 HUD。
10. **键盘可访问性**：Build Tools 按钮没有焦点环，Tab 导航时看不清当前焦点在哪；Help 弹窗能 Esc 关闭（加分），但其他面板不能键盘操作。
11. **字体层级单调** — 除 h2 标题外，正文、资源数字、目标、警告几乎同粗细；需引入 tabular-nums、数字专用字重或颜色编码。
12. **建筑/工人区分度低** — 01c-14 zoom in 后依然要盯一会儿才能分辨"这块砖是房子还是路"。

## 改进建议

1. **引入单独的 HUD 背板**：顶部加半透明深底 bar，把资源 / 时间 / 分数 / 任务分区；解决草地白字对比问题。
2. **警报信号化**：死亡、粮荒、袭击事件 → 红色右侧 toast 堆叠 + 图标 + 微震动/声效。
3. **把 Dev 48/100 做成大进度环**放在顶栏中心，它是核心得分，不应被淹没在一行文字里。
4. **Heat Lens 必须在地图上明显着色**（红/蓝 overlay + 图例 minimap）；现在几乎无效。
5. **响应式**：<1280 宽自动折叠侧栏为图标抽屉；<1024 直接走紧凑模式。
6. **Build Tools 分组**：Infra / Resource / Processing / Defense 四组 + 分组标题。
7. **Entity Focus 固定到右下**或合并到 Colony 面板，不再做"播放器 track 标题"造型。
8. **统一 tooltip 设计**：目前 tooltip 有两种样式（工具 tooltip 单行、Heat Lens tooltip 两行长文），需统一成**带标题 + 描述 + 可选快捷键**的三行卡片。
9. **键盘焦点环 & Tab 顺序**，ARIA label 补齐（canvas 需要 keyboard-accessible 替代操作）。
10. **3D 层面至少引入倾斜透视 + 地形高度阴影**，以匹配 "Three.js 殖民地模拟" 的宣传；哪怕是假 2.5D（isometric shear）也比当前纯 top-down 贴图有质感。
11. **文字去英语式技术味**："1 of 1 supply routes open" 类表达应替换为 "补给线：1/1 通畅" 这种玩家友好短语（若本产品面向中文市场）。
12. **空状态文案更温暖**：Entity Focus 的 "No entity selected. Click any worker/visitor/animal." 可换成带小插画的空状态，而不是冷冰冰一句英文。

## 总结

作为一个没看过文档、没读过代码的外部玩家，我对 Project Utopia 的 UI 评分是 **4/10**。理由是：

- 它**有自己的视觉风格**（深蓝半透明 + 青蓝 accent），不是完全裸奔；
- **Help 弹窗、tooltip、资源面板、建造面板**这些基础件都齐；
- 但**信息层级压得很平、警告优先级几乎不存在、响应式崩坏、点击反馈弱、Heat Lens 这种核心可视化哑火、3D 更像 2D**——作为付费商业产品这些都是硬伤；
- 相对 RimWorld / ONI / Frostpunk 等成熟产品，Utopia 大概还处在**上线前 1 年**的打磨状态。

它已经能让人玩起来，但离"我愿意掏钱买"的视觉门槛还差一次完整的 UI 重构。
