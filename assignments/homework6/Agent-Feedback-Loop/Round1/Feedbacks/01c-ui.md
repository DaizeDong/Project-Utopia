---
reviewer_id: 01c-ui
round: 1
date: 2026-04-22
score: 3.5
verdict: 视觉与交互反馈仍停留在原型阶段，信息层级尚可但响应式、美术、标题画面与反馈感均未达付费产品水准。
---

# Project Utopia — UI/UX 外部评测报告（01c-ui）

> 我是第一次打开这个网页的外部玩家，以付费商业成品的标准评测其 UI 呈现。本次共进行了约 30 次交互，截取 17 张截图，覆盖主界面、Help、Build、Colony、Heat Lens、窗口响应式（800/1024/1440/1920）及多层级缩放。

## 一、第一印象

第一次加载进来，我看到的是一个**中央弹窗**盖在一张看似地图底图的背景之上（`01c-01-first-impression.png`）。弹窗内写着「Project Utopia」标题、一句任务目标（"Reconnect the west lumber line, reclaim the east depot, then scale the colony."）、一个写着"Survive as long as you can 00:00:00 · 0 pts"的进度条式卡片、Template/Map Size 选择、一串灰色键位小方块（RMB/Scroll/1–12/Space/L），以及三个按钮：Start Colony、How to Play、New Map。

客观说，这个启动面板**信息密度是合理的**：主标题字号清晰、按钮层级（蓝色主 CTA + 灰色次级）基本符合 Web 设计惯例。但它完全没有呈现"商业游戏启动界面"的**仪式感**——没有 Logo，没有标题艺术字，没有背景美术（只是一张被游戏底图透出来的粗糙绿地 + 蓝色海岸），没有音效暗示，连版本号和主菜单（Continue/Settings/Credits）都缺席。这更像一个内部工具的配置面板而不是"我付钱要玩的游戏"。

底层"地图预览"相当糟糕：绿色是一块一块的纯色方块、蓝色海岸由 **棋盘花纹的材质 + 白色竖条（大概是波浪？）** 组成，完全没有透视、光照、阴影。如果这是 Three.js 引擎渲染的"3D 场景"，那它的摄像机是正交俯视、没有 Z 轴落差，实质上是一张 2D 网格贴图。

**第一印象评分：4/10**——能看懂、能点进去，但没有"哇"的瞬间。

## 二、布局问题 / 信息架构

### 主 HUD 布局（见 `01c-04-game-start.png`）

进入游戏后布局如下：
- **顶部**：资源数值条（四个食物/木/石/草药图标 + 数字 + workers）、任务名描述、Survived/Score/Dev 指标、"+1/s · +5/birth · -10/death"增长流水、Storyteller 文字、绿色提示条、右侧 Build/Colony/Heat Lens/Help 四个按钮
- **左侧**：Build Tools 面板（12 个工具按钮，2 列）+ Construction 说明卡
- **右侧**：Colony 面板（Resources 产出率 + Population）
- **底部**：Entity Focus 小条 + 速度控制（⏸ ▶ ⏩ + 时钟）

**核心问题**：

1. **顶部信息过于密集且无分组。** 资源、文字任务、Storyteller 日志、scoring meta、storyteller banner、CTA 按钮全部横向塞进同一行区间，最终变成 5~6 行文字挤在最顶 1/10 屏幕中。左上有 4 张只显示数字、无 label 的彩色图标；右上有 4 个明确带文字的按钮。这种左右不对称看上去像是"两个不同的设计师写了这行 UI"。
2. **Storyteller 文本被截断为 "route repair and…"。** 付费游戏绝不允许核心叙事文案在主 HUD 被 ellipsis 截掉；玩家无法判断现在到底发生了什么事件。
3. **中间那条 meta 数据 "+1/s · +5/birth · -10/death (lived 210 · births 60 · deaths -40)"** 明显是开发者 debug 文字，连标签都没有。成品里这种东西要么隐藏在 dev overlay 中（F3 之类），要么包装成"Colony trend"面板。直接塞在标题条上非常不专业。
4. **Build 与 Colony 面板宽度固定且不可折叠。** 在 1440×900 下两侧各吃掉 ~250px，中央留给地图大约只剩 ~930px，可视半径很小。用户想看全局必须关闭侧面板，但关闭后那些信息完全消失，没有"折叠图标/吸边/浮窗"的设计。
5. **Entity Focus 面板漂在正中央底部**，点击后不会变大、也不会展示选中单位信息（我多次点击 canvas 上的 worker，它始终保持 "No entity selected. Click any worker/visitor/animal." —— 说明点击反馈判定非常脆弱，下方会详述）。

### 信息层级打分

| 维度 | 评价 |
|------|------|
| 关键资源可见性 | ⭐⭐⭐ 数字能看到，但没有 label 随图标，悬停后也无 tooltip |
| 警报/危险态呈现 | ⭐ 根本看不出来。食物从 110→60→14→1 的过程没有任何红色脉冲、没有声音、没有"Starving"警告 |
| 时间/进度 | ⭐⭐⭐⭐ 底部计时器清晰、速度按钮明确 |
| 任务目标 | ⭐⭐ 任务文本被 "..." 截断，无法点开查看 |

## 三、可读性问题

**字体与对比度**：主要字体是系统 sans-serif（应该是 -apple-system / Segoe UI 默认栈），身体文本约 12–13px。数值字号足够，但辅助说明（Construction 卡片里的"Rules: Place on grass, roads, or ruins..."）只有约 11px 的浅灰色字 (#9aa 级别) 压在深蓝背景上，从我测试时 ~50cm 观看距离就略显吃力。对于"躺在沙发上玩"的场景基本不合格。

**对比度问题**：Build 面板顶部 "Build Tools" header 是浅灰极细字体；Construction 的"Selected Tool"/"Cost"/"Rules" 等子标题也全部低对比度，导致 Build 和 Construction 两个 panel 从视觉上像"一大团黑方块"，扫视时难以立刻定位到"哪里是当前费用、哪里是规则"。

**数字 vs label 的朝向**：右侧 Colony 面板的 FARM/WOOD/STONE/HERBS/COOK/SMITH/HERBALIST/HAUL 列表采用全大写 + 右对齐数字。全大写在长列表里识别性反而下降，而且这些其实是**角色**而不是**资源**，和上面 Resources 的样式完全一样，没有分组分色，新玩家根本分不清 FARM 是"农场数量"还是"农民人数"。

**存在的彩字问题**：
- 顶部标题条中那条 "Broken Frontier — Reconnect the west lumber line..." 是半透明淡灰斜体，字号小，紧贴左侧资源图标，视觉上像"水印"，不像任务条。
- 绿色 "Emergency relief stabilized..." 通知条颜色是 #6fb，不错，但它持续显示在 HUD 上方而非 toast 弹出/消失，占用永久位置。

## 四、视觉层次 / 美术风格

### 图标设计

- 顶栏资源图标是**像素风**（能看出是 16×16 的小图），但旁边数字是现代无衬线矢量字。两种风格混搭——**像素艺术 + flat UI** 是可以做好的（参考 Stardew Valley、Kingdom: New Lands），但这里像素图太粗糙：食物是一个模糊的橙色圆圈，木头看不出是什么，石头跟草药难以区分。
- Build Tool 按钮图标全部是**同一风格的小手绘图形**：锄头（Road）、麦穗（Farm）、斧头（Lumber）、篮子（Warehouse）、砖墙（Wall）、栅栏（Bridge）等。风格基本统一但线条粗糙、识别度不高。Bridge 和 Wall 两个图标在 small size 下几乎一模一样。Herbs 和 Quarry 都是"灰褐色颗粒状"也容易混。
- 右上角四个功能按钮（Build/Colony/Heat Lens/Help）**没有图标，只有文字**，而且 Heat Lens (L) 把快捷键塞在按钮上打破了 label 一致性。Help 那个 "? Help" 的问号在外面，拥挤而难看。

### 色彩

整体 HUD 面板是**深蓝黑 (#0e1b2e 左右) + 亮蓝高亮 (#4aa3ff)**，风格偏科技感/严肃。和地图的**明绿 + 天蓝**配色产生**强烈割裂**——UI 在做太空殖民飞船仪表盘，地图在做童话牧场物语。两者没有通过中间色、渐变、边框或同色装饰彼此衔接。

地图本身色彩纯度过高：草地是 #4a9a3c 类的鲜绿、土路是 #d4a26a 橙、建筑地块是 #b04038 红、石墙地块是 #8a8a8a 灰，对比强烈但饱和度全开，整体看起来像 Excel 热图。

### 3D / 场景渲染

据 tech stack 自称是 Three.js，但经过我多次缩放（见 `01c-09-zoomed-in.png`、`01c-10-max-zoom.png`、`01c-15-zoomed-out.png`），我**没有看到任何一处 3D 迹象**：
- 所有 tile 是平面正方形贴图，无高度差
- Worker 是 2D 精灵，无阴影无朝向动画，移动时只是 sprite 在格子间突突平移
- 建筑没有体积——"Farm" 是一个白色菊花状 sprite 贴在 tile 上，"Lumber" 看起来像一根白色羽毛
- 水体没有动态波纹，只有静态棋盘图案
- 没有日夜光照、没有云影、没有雾

作为一个声称要与 RimWorld/ONI 同台竞争的 colony sim，这个视觉表现连 RimWorld（也是 2D 俯视）都不如——RimWorld 的 sprite 手绘更用心、有明显的角色侧脸、建筑有结构感。这里的 sprite 看起来是 AI 生成或最早期占位资源。

### 选择/悬停视觉反馈

- 悬停 Build 按钮：会出现一个浅灰方形提示「Farm (2) — produce food, cost: 5 wood」（见 `01c-07-farm-hover.png`）。提示**样式朴素但可用**。
- 选中的 Build 按钮会变成深蓝填充 + 白字（见 Farm 高亮）——识别性还行。
- 悬停 tile：会出现一个**淡蓝圆环光标**（见 `01c-08-tile-hover.png`）——光标本身 OK，但**没有提示 tile 类型、没有预览将要建造的建筑轮廓**，完全不知道左键会造在哪个格子。付费游戏标准做法是 ghost preview + cost/allowed/blocked 状态红绿染色。
- 点击 worker：无视觉反馈。我点了 4~5 次 sprite 位置，Entity Focus 始终是空状态 "No entity selected"。可能是 hitbox 与 sprite 不对齐，或者选中需要特别的精度——这是**严重的可用性 bug**。

## 五、反馈感

**正面反馈稀缺**：
- 建造成功没有动画、没有粒子、没有音效提示（我没有听到任何声音，不确定是没实装还是需要点击启用）
- 资源增减没有 floating number（"+1 wood" 浮动飘字）
- 死亡/出生没有事件弹窗，仅靠顶栏数字滚动
- Storyteller 的提示条不会引起注意（不闪烁、不震动）

**负面反馈缺失**：
- 食物归零后仍然继续扣（`01c-16-paused-wide.png` 显示 Food=1, -67.4/min），但没有任何"FAMINE"全屏警告
- Workers 死亡 (-40) 也只是数字变化，没 death toast

**操作确认**：建造 farm 时点地图，只有建筑 sprite 瞬间出现，没有淡入、没有施工中间态、没有"Under construction" 叠加。

**按键反馈不一致**：Space pause 可以工作但没看到任何视觉确认（没有"PAUSED"字样覆盖屏幕，没有红色边框）；我按了 Space 后只能靠看 ⏸ 按钮是否高亮来确认状态。

## 六、响应式测试

这是**本次评测发现的最严重问题之一**。

### 1920×1080（桌面标准）— `01c-14` `01c-15` `01c-16` `01c-17`

勉强可用。两侧面板依然固定宽度，中央地图区域还有约 ~1300px 可用。但此时背景地图与 Colony 面板之间的边界处出现**奇怪的竖条色差/重叠**——右侧 Colony 面板边缘往外延伸了约 5px 半透明阴影，叠在地图上变成深色条。

### 1440×900（`01c-04`, `01c-05`, `01c-06`）

面板与地图 3:7 左右，尚可用，但 Build 面板 Construction 说明开始挤压；Entity Focus 条位于中央下方漂浮看起来像"丢失的 tooltip"。

### 1024×768（`01c-12-responsive-1024.png`）— 不合格

**重大布局崩坏**：
- 顶部的资源图标行**完全脱离**容器，浮在 Build Tools 面板**之上**（z-index 混乱）
- Resources 面板的 "Food" label 被顶栏遮住，只能看到进度条
- 顶部叙事文字从 1 行变成 3~4 行挤在 60px 高度内
- Build Tools 的 Road/Farm 按钮被顶栏压住只露出底部一半
- 底部 Entity Focus 漂在正中，与控制按钮重叠

### 800×600（`01c-13-responsive-800.png`）— 完全失效

- Build 面板 + Colony 面板 + 顶部文字占据了屏幕 80% 面积
- 中央只剩一个 ~250×300 的"地图窗口"，几乎看不清地块
- 顶部 Storyteller 文字"[Rule-based Storyteller] route repair and depot relief: Workers should sustain..."挤成 3 行压在地图上方
- Entity Focus 与速度控制完全挤在底部中间，已经挡住一部分地图

**结论**：这个 UI 仅针对 1440+ 宽屏设计，没有做任何 media query / flex collapse。在任何笔记本 / 小屏显示器上都是不可用的。对于一款 Web 端发布的游戏，这是**硬伤**。

## 七、可访问性

- **键盘导航**：Tab 能在几个按钮间跳转，但焦点框（focus ring）样式不明显。键盘玩家基本无法使用 Build 面板。
- **屏幕阅读器友好度**：通过 `browser_evaluate` 检查 DOM 发现 img 元素都有正确的 alt（Food/Wood/Stone/Herbs/Workers），Pause/Normal speed/Fast forward 都有 aria-label——**这一点意外合格**。但大量关键文本（资源数字、右侧 Population 列表）没有语义角色。
- **色盲友好度**：资源图标主要靠颜色区分（橙/棕/灰/绿），对红绿色盲不友好。
- **字体缩放**：没有 UI 缩放选项。

## 八、具体缺陷清单

| # | 缺陷 | 截图 | 严重度 |
|---|------|------|--------|
| 1 | 启动屏无 Logo、无背景美术、版本号缺失 | 01c-01 | 高 |
| 2 | Storyteller 主叙事文本被 "…" 截断 | 01c-04/16 | 高 |
| 3 | "+1/s · +5/birth · -10/death (lived X · births Y · deaths Z)" debug 文字暴露在正式 HUD | 01c-04 | 高 |
| 4 | 资源图标无 hover tooltip | 01c-04 | 中 |
| 5 | 顶部资源图标在 1024×768 脱离容器 | 01c-12 | 严重（响应式 bug） |
| 6 | 800×600 面板覆盖 80% 屏幕，游戏不可玩 | 01c-13 | 严重 |
| 7 | 点击 worker/animal 无法选中 | 01c-10/11 | 严重（可用性 bug） |
| 8 | Heat Lens 切换后地图上**无可见热图覆盖** | 01c-06 | 高 |
| 9 | 建筑无 ghost preview，不知道能否落位 | 01c-08 | 中 |
| 10 | 食物 1 血时无全屏警告、无声音 | 01c-16 | 高 |
| 11 | 建造/增减资源无浮动数字或粒子 | 整局 | 中 |
| 12 | 建筑 sprite 识别度低（farm=白菊花、lumber=羽毛） | 01c-10 | 中 |
| 13 | 左/右面板不可折叠、不可拖拽、不可自定义 | 整局 | 高 |
| 14 | 没有音效 / 音乐（或未自动启用） | 整局 | 高 |
| 15 | 右侧 Colony 面板边缘阴影在宽屏下溢出 | 01c-14 | 低 |

## 九、与同类产品的对比

| 维度 | Project Utopia | RimWorld | Oxygen Not Included | Factorio |
|------|----------------|----------|---------------------|----------|
| 启动屏美术 | 无 | 手绘插画 + 音乐 | 3D 角色动画 | 2D 工业插画 |
| 实时警报 | 仅数字变化 | 红字顶栏 + 音效 + 暂停提示 | 全屏 alert + 声音 + job 队列 | 红框闪烁 + sound |
| 资源图标 | 像素糊 | 清晰手绘 | 矢量 + 一致阴影 | 2D 精细插图 |
| 悬停 tooltip | 只有 Build 按钮有 | 所有元素有 3~5 行详细说明 | 极详尽（时时反馈流量、效率） | 极详尽 |
| 建造 ghost | 无 | 有（红绿指示） | 有（蓝色轮廓 + 阻塞状态） | 有（贴在网格上） |
| 响应式 | 仅支持 1440+ | 支持 1280+ | 支持 1366+ | 支持 1280+ |
| 可折叠面板 | 无 | 有（ESC 菜单） | 有（侧边抽屉） | 有（Tab 切换） |
| 单位选中 | 不可靠 | 左键即选 + 选中框 | 左键即选 + 生物卡 | 左键即选 |
| 美术一致性 | UI 科技 vs 地图童话 割裂 | 一致卡通写实 | 一致卡通像素 | 一致工业风 |

对比下来，Project Utopia 的 UI 在几乎每个维度都处于**明显的下风**。信息层级尚可（至少没有走向那种把所有信息压到一个模态框的极端），但美术风格、反馈感、响应式都与 2015 年之后的付费 colony sim 有 3~5 年代差。

## 十、改进建议

**P0（阻塞级）**
1. **修复响应式布局**：面板需要在 ≤1280 宽度自动折叠为抽屉/Tab 切换，或至少实现"吸边 collapse"按钮。底部 Entity Focus 条要吸附底部、不要漂浮。
2. **修复 worker/tile 选中**：确保 canvas 上点击 sprite 能触发 Entity Focus 更新。当前完全不工作。
3. **顶栏拆分**：把 "+1/s · +5/birth · -10/death (lived...)" 这一整条 debug 文字从主 HUD 移除，进 Dev Overlay。Storyteller 文本要能完整显示、可展开日志。
4. **饥荒/死亡警报**：食物触底、worker 死亡必须触发**全屏 toast + 红色边框闪烁 + 可选音效**。

**P1（强烈建议）**
5. **启动屏美术**：加一张 keyart（哪怕简单的场景渲染截图）+ Logo + 版本号 + Continue/Settings/Quit 菜单。
6. **加 tooltip 到所有资源图标与数字**。Hover 显示当前值、分钟产量、来源分解、消耗分解。
7. **建造 ghost preview**：左键前先显示半透明建筑轮廓 + 红/绿可建状态。
8. **浮动反馈**：增减资源时 tile 上方飘 "+5 wood" / "-1 food"。
9. **Heat Lens 可视化**：目前切换后地图没变化，需要明显的热度色块叠加 + 图例。
10. **统一美术风格**：要么把 UI 往卡通像素走，要么把地图 sprite 提升到矢量插画级别。当前割裂无法并存。

**P2（品质抛光）**
11. 按钮图标重画（Bridge vs Wall、Herbs vs Quarry 必须有显著形状差异）。
12. 引入音效和循环 BGM。
13. 增加暂停时的 "PAUSED" 水印覆盖层。
14. Colony 面板 Population 里 FARM/WOOD/COOK 等角色与 Resources 分组要**视觉区分**（加个分隔线、图标、或改字号）。
15. 引入可自定义的 HUD scale（80% / 100% / 125%）。

## 总评

信息架构基本合理（4/10），视觉美术不达标（2/10），交互反馈感匮乏（3/10），响应式设计不合格（1/10），可访问性意外尚可（5/10）。

综合加权后给 **3.5 / 10**——这是一个**Alpha 早期原型级**的 UI，距离一个"我愿意付 15 美元的 Steam colony sim"仍有较大差距。核心数据展示勉强能看懂，但视觉品质、响应式、交互反馈、美术一致性、启动屏仪式感、警报系统均存在结构性缺陷。

作为外部玩家，如果这是一款我在 Steam 页面试玩 15 分钟的 demo，我大概率会**退款**。
