---
reviewer_id: 01c-ui
round: 5
date: 2026-04-24
build_url: http://127.0.0.1:5173/
viewport_tested: [1440x900, 1024x768, 800x600, 1920x1080]
screenshot_dir: assignments/homework6/Agent-Feedback-Loop/Round5/screenshots/01c-ui/
score: 3
one_liner: 业余手感的深色 HUD + 像素贴图 2.5D 地图，信息过载、布局脆弱、可访问性差，远未达到付费产品标准。
---

# 01c-ui · UI 呈现评测（Round 5）

## 总体评分：**3 / 10**

定位：一款对外宣称为殖民地模拟的 Three.js 作品。作为**外部玩家首次接触**，我的感受：信息密度过高、视觉语言混乱、布局在常见分辨率下就崩、可访问性基本为零。3D 层和 UI 层之间没有真正的设计协调，给人的第一印象更像"内部调试工具"而不是"商业游戏"。

---

## 第一印象（启动画面）

截图 `01-initial-1440.png`：打开 127.0.0.1:5173 后立即看到一个居中的深蓝色圆角模态框"Project Utopia"，模态后面是**已经在实时跑的低透明度预览地形**——地图外围有"电路板 / 青色瓷砖花纹"的方块群（明显是森林或树木？但第一时间读不出来），纯黑绿色背景几乎无纹理。

模态内信息层级尚可：
- H2 品牌蓝（#3da9fc 左右）标题"Project Utopia"
- 一句开场简介："Reconnect the west lumber line, reclaim the east depot, then scale the colony."
- 一个 pill-badge 写着 "TEMPERATE PLAINS | 96X72 TILES | BROKEN FRONTIER | BALANCED MAP, STEADY OPENING"——全大写加分隔符，像 DevLog 而非玩家界面
- 四条灰色 briefing 段落，对玩家扔了"Heat Lens"、"red means surplus is trapped"、"blue means bottleneck starving input"、"starter / balanced / logistics" 这些术语，**完全没有解释就进入专业词汇**
- "Survive as long as you can ∞ 00:00:00 · 0 pts"——survival banner 图标过小，点数"0 pts"在空状态下显得多余
- Template 下拉 + 96×72 手动输入的 Map Size——暴露的是引擎参数，不是玩家友好的"小 / 中 / 大"
- 键盘提示行密密麻麻："RMB drag to preview / Scroll zoom / 1-12 tools / Space pause / L heat lens / LMB build / RMB drag-pan / click a worker to inspect / ? or F1 open Help"——堆成两行信息瀑布

启动屏上方出现了一行怪异的 `○ ○ ○ ○ ○ ○`——六个未标记的圆圈（截图 01 上角），在实际渲染里是 `text: ○ ○ ○ ○ ○ ○` 这种无可访问语义的纯文本，来源不明，很可能是一个被样式漏掉的 stepper / carousel dots 占位，纯视觉 bug。

**评价：**有设计意图但执行停留在"开发者自用"阶段——玩家被要求理解专有术语、手输网格尺寸、读完一屏键位表才能点 Start。

---

## 信息架构（进入游戏后）

截图 `04-game-start.png` / `05-colony-panel.png` / `09-fast-forward.png` / `15-farm-tool.png`：

正式游戏 UI 分四大分区：
1. **顶部 HUD 带**：左起资源图标 + 数值（Food 100 / Wood 30 / Stone 8 / Herbs 0 / Workers 12），然后 scenario flavor 文字、然后一行进度 chips（✓ routes 1/1、✓ depots 1/1、✓ warehouses 4/2、○ farms 4/6、○ lumber 2/3、○ walls 7/8），然后 DIRECTOR 标签 + 长文本 + 绿色高亮成就 badge "First extra Warehouse..."，右侧四个按钮 Build / Colony / Heat Lens (L) / ? Help。顶条实际**塞进了 6 个概念层**：资源 / 场景 / 目标进度 / 剧情 / 成就 / 主菜单——每个都挤成一小块，没有视觉呼吸。
2. **左侧列**：Build 面板（13 个工具按钮 Select / Road / Farm / Lumber / Warehouse / Wall / Bridge / Erase / Quarry / Herbs / Kitchen / Smithy / Clinic，3 列网格），下方 Construction 面板显示选中工具的描述 / 花费 / 规则。
3. **中央 canvas**：2.5D pixel-art 风格的地形。
4. **右侧列（打开 Colony 后）**：资源速率 + Population + 角色分配（FARM/WOOD/STONE/HERBS/COOK/SMITH/HERBALIST/HAUL）。
5. **底部**：Playback controls（⏸ / ▶ / ⏩ / Autopilot checkbox / 时钟）+ 一个"Entity Focus"空壳。

**核心信息可见性：**
- 资源数值（Food/Wood/Stone/Herbs/Workers）用小图标 + 小字号，字重偏细，在 1440 宽下每个 slot 宽度不够——图标甚至会和文字撞在一起（截图 04 顶部 "Food / 100" 和 "Wood / 30" 之间几乎无间距）。
- **Survived / Score / Dev 49/100 三个最关键指标用的是**普通灰白小字，夹在屏幕最顶行正中间，没有任何图标、没有分隔、字号比资源条还小（截图 09）。这是一个"付费游戏"绝不该犯的错——生存时长是整个 survival 模式的核心 KPI，却成了视觉最弱的一项。
- 进度 chips（✓/○）设计语言不统一：绿色勾号 + 黄色圆圈混用，"4/6"这种分数读起来要先找当前 / 总数的顺序。
- 场景目标链 "Grow food supply target -> Grow food supply -> C..." **被截断**成省略号，玩家没有办法看到完整的 objective chain（截图 04、05、09 都能看到 "-> C..." 被切掉）。
- 同样地，DIRECTOR 长文本 "reconnect the broken supply lane: the colony should sustain reconnect the broken supply lane while keeping empty bellies and full backpacks from overriding the map's intended reroute pres…"——**语句本身读不通**（"reconnect X: should sustain reconnect X"），而且再次被 ellipsis 硬切。
- 成就 badge "First extra Warehouse raised"（绿色）出现在主菜单按钮左侧，与按钮条视觉同级，玩家极易当成可点击按钮误点。

---

## 视觉设计 / 美术风格

**色彩：**
- 整体深色主题，背景 `#0a0f1a`~`#101826` 附近，蓝 accent `#3b82f6`/`#2c8fff`。
- HUD 模糊玻璃 panel 配色克制，但缺乏层级对比——Build panel、Colony panel、Construction panel 底色几乎一样，panel 边界靠极淡的 1px 边框划分，很难一眼看出边界。
- 绿色 accent（完成 chip）和红色/蓝色 heat lens legend 没有统一色板。红 "surplus"、蓝 "starved"——和"红色=危险"的普世颜色直觉反着走（surplus 理应是好事）。

**字体 / 排版：**
- 全局使用同一款 sans-serif（看起来像 Inter / system-ui），没有 display font 区分品牌感。
- 正文 12-13px 左右，在 1440 宽度下已经偏小；Colony 面板的 "Stone / Herbs / Meals / Tools / Medicine" 列表行高过挤，右侧速率 "= 0.0/min" 和 "▼ -134.0/min" 箭头字号相同、颜色都是中灰，没有红/绿强调，信息密度拉满但视觉优先级 = 0。
- Construction 描述段用斜体/正体混排（"colony-wide — they stay in the warehouse" 里斜体 colony-wide），属于 Markdown 原始渲染感，不像 UI 文本。

**图标：**
- 资源图标是小像素贴图 + 低色位，和按钮里使用的 lineal outline icon（锤子、镰刀、大厦）**完全不是一个图标家族**——两种风格硬拼。
- 工具按钮里有"十"字工具图标也有像素贴图图标——不一致。
- ✓ / ○ 进度标记是 Unicode 字符而非矢量图标，锯齿和对齐都不理想。

**按钮 / 面板语言：**
- Build 面板里 Select / Road 按钮样式有微妙差异（底纹、图标粗细不同）；Warehouse / Wall / Bridge / Erase 那一片又切成另一个色调（更深一点）——没有统一的 button primitive。
- Start Colony 按钮是蓝色实心，How to Play / New Map 是深色 ghost—— primary/secondary 对比 OK，但三个按钮的 padding 不一致，How to Play 比 New Map 略窄。

**3D 层：**
- 地图是等距 / 近正交的**像素贴图瓷砖**，草地是简单平面绿色方块，水面是蓝色带笔触纹理，树林用重复的"电路板"式蓝绿瓷砖——老远一看以为是迷宫地砖，需要放大才能辨认出"哦这是森林"（截图 04、07、12）。
- 建筑物（棕色房子图块）、worker 小人、鸡和白花（装饰？食物？）的尺度不统一——worker 比建筑还高，鸡和 worker 同高。
- 没有阴影、没有环境光遮蔽、没有任何 post-processing。建筑是贴图 billboard 而非真 3D 模型。用 Three.js 但几乎没发挥 3D 的优势——和纯 2D canvas 游戏相比也不占优。
- 动画只能看到 worker 走路（像素 sprite 帧切换），没有任何建造、收获、资源搬运的视觉反馈 flourish。
- Autopilot 打开后，map 上没有任何视觉指示器告诉玩家"AI 在接管"；只有顶部一行文字换了颜色。

---

## 交互反馈

- **Hover 反馈：**建筑工具按钮 hover 没有明显高亮（深色→稍深色几不可见）。Canvas 上 hover 某个 tile 时，Construction panel 里那行 "Hover a tile to preview cost, rules, and scenario impact." 从未变化——我 mousemove 到草地、道路、水面，panel 内容始终是工具默认描述，**预览功能要么没触发要么没显示**（截图 16）。
- **Click 反馈：**工具选中会显示为"active"态但对比度微弱。点击 Entity Focus 条会弹出一个浮动灰框 "Click a worker, visitor, or animal on the map to inspect it here"（截图 13）——但 tooltip 浮在它自己按钮下方且不贴附，像 detached tooltip。
- **Toggles：**Autopilot checkbox 勾上后要等 5~7 秒顶部 banner 才从 "Autopilot off" 更新为 "Autopilot ON · fallback/fallback · next policy in 9.6s"——延迟反馈违反直觉，我在截图 14 那一刻 checkbox 已显示 ✓ 但 banner 仍写"Autopilot off"。
- **Tooltips：**Heat Lens 按钮 hover 有 tooltip "Heat Lens legend — red = producer warehouse full / overflowing, blue = processor starved for input"（截图 07）——文案技术性太强，而且切换 ON 后地图本身没有任何颜色变化可见，legend 指向不存在的视觉。
- **键盘：**F1 / ? / Space / L / Ctrl+Z / Esc 都做了，值得肯定。但 Tab 键焦点环从来没出现，无法纯键盘导航。

---

## 3D 呈现

截图 `04 / 07 / 09 / 12 / 15 / 16`：

- **地形可读性差**：森林瓷砖（蓝青方格 + 白色"鱼刺"纹）乍看像 PCB 电路板，距离屏幕 50cm 根本不知道那是树——应该用 silhouette 明显的 sprite 或 3D 模型。
- **水体 / 海岸线**不区分：水面是同一种蓝色方块，没有波纹动画、没有海岸浪花。
- **建筑物**几乎都是同色系棕块，Warehouse / Farm / Kitchen / Smithy 在截图里无法区分——只能靠位置猜。
- **人物 / 动物**缩略成极小像素 sprite（约 24×24 px），在 1440 宽度的地图上已经接近"鸡和人和鹿都是几个像素"——选中几乎不可能精确。
- **光影 / 昼夜**完全缺席；survival mode 玩到 00:00:48 环境一成不变。
- **相机**：scroll zoom 能用，但画面永远是同一个 2.5D 俯视角，没有旋转、没有倾斜、没有 cinematic 时刻。与 Oxygen Not Included 或 Dwarf Fortress Premium 相比，视觉冲击力明显不足。

总结：3D 引擎的价值几乎为零——这套内容用 HTML canvas 2D 也能跑，而且可能还更锐利。

---

## 响应式测试

- **1920×1080** (截图 12)：勉强呼吸感——左右 panel 之间有中央地图空间，但 HUD 顶条里 scenario flavor 还是被截断成 "Broken Frontier — Reconnect the west lumber line, reclaim the…"，右上 Colony panel 的 "Food" 行**被顶部 HUD bar 硬生生覆盖**（仅能看到 "Wood / Stone / Herbs" 起的，Food 这第一行直接被遮），这是**严重 z-index / 布局 bug**。
- **1440×900** (默认)：同样的 Food 行遮挡问题依然存在（截图 05、06）。顶部 DIRECTOR 长文本被压缩为省略号。
- **1024×768** (截图 10)：布局开始明显崩坏。顶栏 "Broken Frontier - Temperate Plains" 文字被裁剪成 "Brok... S e"（下一行只剩首字母），右上按钮组被压缩到几乎贴住屏幕右边缘。底部 playback bar 和 Entity Focus 空壳开始重叠左侧 Build 面板。
- **800×600** (截图 11)：**完全不可用**。顶部资源条 + scenario 文本 + Director 文本堆成 4 行 HUD；底部 Entity Focus 消失；"First Tool forged: Advanced production has started." 的绿色 toast 和进度 chips 挤在一起；Construction 面板里文本流出到 Colony panel 下方；玩家无法在此分辨率下玩。
- 无移动端适配（未测触摸，但 hit-target 明显桌面导向）。

---

## 可访问性

- 无 alt/aria-label 机制（snapshot 里只有少量带名字的 button），大量 `generic` role。
- 色彩对比：深蓝背景 + 中灰文字，正文对比度约 4.2:1——擦边 WCAG AA，部分次要文本（"= 0.0/min" 的灰）明显低于 4.5:1。
- 没有 focus ring；Tab 键尝试后看不到任何可见焦点。
- 没有"降低动画"/"高对比度"偏好。
- 文字全英文，无 i18n 结构可见。
- 屏幕阅读器：H2 "Project Utopia" + H3 "Basic Controls" / "Getting Started" 有，但顶部 HUD 里 6 个信息区块都是 nested `generic`——screen reader 读出来会是一堆无结构的 div 流。

---

## 具体缺陷清单

1. **启动页开场的 6 个无语义圆圈 `○ ○ ○ ○ ○ ○`**（截图 01 顶部，accessibility snapshot e3 text）——纯视觉 bug。
2. **Colony panel 第一行 "Food" 在所有测试分辨率下都被顶部 HUD bar 遮住**（截图 05/06/12），只能看到 progress bar 的下沿漏出。
3. **目标链 / DIRECTOR 文本被 ellipsis 截断**且无 tooltip 展开（截图 04/09/12/15）："Grow food supply target -> Grow food supply -> C..."、"push the fro..."。
4. **DIRECTOR 文本语义错乱**："reconnect the broken supply lane: the colony should sustain reconnect the broken supply lane while keeping empty bellies and full backpacks from overriding the map's intended reroute pres..." —— 这是**模板字符串未经人工润色**。
5. **Heat Lens 开启后，地图上看不到任何热度染色**（截图 07 和 08 对比：建筑屋顶 / tile 颜色完全没变），但右上显示了 legend chip——功能 / UI 脱节。
6. **Autopilot checkbox 与 banner 状态延迟 / 不同步**（截图 14 checkbox 已勾但文本仍 "Autopilot off"）。
7. **Tile hover preview 不触发 Construction 面板更新**——提示词 "Hover a tile to preview cost, rules, and scenario impact." 始终存在但从未被替换（截图 16）。
8. **资源 icon 与工具 icon 家族不统一**——像素贴图 vs 线性 outline 混用。
9. **进度 chips ✓/○ 是 Unicode 字符**——锯齿 / 基线错位。
10. **800×600 下 UI 完全崩坏**——底部 playback bar 消失，顶栏折行，Entity Focus 缺失。
11. **顶部核心 KPI（Survived / Score / Dev）用最弱字号**——生存 KPI 应该是焦点第一。
12. **Build 按钮按下后无声音、无按压微动画**——按钮感觉"死"。
13. **"Entity Focus"** 一个永远空的占位 widget 占据底部 C 位大块面积——空状态设计差。
14. **模态 "How to Play" 关闭按钮 `×`** 视觉很小；tab list 底部下划线颜色仅在 hover 才可见。
15. **无 loading 状态 / 无 splash 界面**——打开 5173 直接进半透明菜单，第一秒的空白让人疑心页面挂了。
16. **HUD 的资源 slot 没有间距**，图标和数字紧贴、slot 之间也紧贴（截图 04 顶部"Food 100 Wood 30 Stone 8"几乎无 gap）。
17. **场景名称标签"TEMPERATE PLAINS | 96X72 TILES | BROKEN FRONTIER | BALANCED MAP, STEADY OPENING"** 全大写 + 管道分隔——像 CLI tag 而非 game UI。

---

## 与 RimWorld / Factorio / Oxygen Not Included 对比

| 维度 | Project Utopia | RimWorld | Factorio | ONI |
|---|---|---|---|---|
| 第一印象 | 半透明黑蓝模态 + DevLog pills | 手绘羊皮纸主菜单 | 工业字体 + 动态工厂背景 | 像素 colony cutscene |
| 信息层级 | HUD 塞 6 层, 核心 KPI 弱 | 顶栏清爽, alerts 独立 | HUD 极简, HUD 通过右下小面板扩展 | 顶栏图标化, 饱和度高 |
| 字体 | system sans, 全部同字号 | serif + sans 组合 | 工业 bitmap + 清晰 hierarchy | pixel font 全系一致 |
| 图标 | 像素 + outline 混搭 | 统一手绘 sprite | 统一工业图标 | 统一像素 icon pack |
| 颜色 | 深蓝 + 几个 accent, 不统一 | 羊皮纸暖色 + 有限 accent | 橙黑工业 + 黄 accent | 紫色太空 + 霓虹 accent |
| 3D / 2D | 伪 2.5D Three.js, 廉价感 | 纯 2D, 强艺术方向 | 纯 2D, 工业美学 | 纯 2D, 可爱 colony |
| 响应式 | 800×600 完全崩 | 只支持固定比例 | 只支持固定比例 | 只支持固定比例 |
| 可访问性 | 几乎无 | 基础 | 基础 | 色盲模式 |
| 美术成本感 | 低（占位级） | 高 | 高 | 高 |

Project Utopia 的问题不是没有对标，而是**在 UI 细节执行、美术一致性、信息层级这三个子维度上都明显低于同类商业作品**。

---

## 改进建议（优先级从高到低）

1. **修 z-index 把 Colony panel "Food" 首行从顶部 HUD 下方露出来**——P0 视觉 bug。
2. **把 Survived / Score / Dev 三大 KPI 提升为独立显眼的顶部左侧单元**，搭配图标 + 大字号，目前它们是整个顶栏最弱的元素。
3. **DIRECTOR flavor text 换行 / wrap 而不是 ellipsis**——或者允许点击展开 panel。删掉"reconnect ... should sustain reconnect ..."这种模板未填充的文字。
4. **让 Heat Lens 真的给 tile 染色**（或修回归），否则删掉 legend。UI 文案指向不存在的视觉是最致命的产品感问题。
5. **Hover tile preview 要真的触发 Construction 面板更新**——当前它是死的。
6. **统一按钮 primitive**：border radius、padding、font-size、hover-state 对齐。
7. **统一图标家族**：所有图标要么全像素 sprite（配合 pixel-art 地图），要么全 outline；不要混搭。
8. **800×600 / 1024×768 做 compact 布局**：允许折叠左右 panel、允许 HUD 顶栏隐藏次要文本。
9. **关闭启动屏那个 "○ ○ ○ ○ ○ ○"**——要么变成真的 stepper，要么删掉。
10. **Autopilot / 其他 toggle 的 banner 更新必须立即**——没有延迟必要。
11. **3D 层：给建筑模型不同颜色/形状以便空中辨识**，或者退一步，用更显眼的 icon badge overlay 标注 Farm/Kitchen/Warehouse。
12. **加 loading splash**，避免首秒空白 → 半透明菜单的跳闪观感。
13. **基础 a11y**：给按钮加 aria-label，加 focus ring，给 resource HUD 加 live region 让 screen reader 读数值变化。
14. **colorblind 模式**：红绿 surplus/starved chip 必须有备选配色。
15. **审 UX 文案**：把 "RMB drag to preview / Scroll zoom / 1-12 tools" 这种键位说明从主菜单移到 Help panel，主菜单留给"这是什么游戏 + 如何开始"。

---

## 结论

Project Utopia 的 UI 目前处于**"功能齐全但美术与信息设计停留在开发内部工具"**的阶段。交互骨架（面板分区、键位、工具切换、Help 模态、Autopilot）是合理的，但几乎每个细节都让人立刻看出"这不是一个打磨过的商业游戏"——从启动屏的占位字符，到 Colony panel 被顶栏遮住 Food 行，到 Heat Lens 没真的染色，到 DIRECTOR 模板文本显而易见的未润色，到 800×600 下完全崩溃，再到 3D 场景 1-bit 质感的森林瓷砖。

**评分：3 / 10。** 能玩，能看懂骨架，但绝对达不到"付费产品"门槛。若作为免费早期 demo 发布尚可，若标价售卖则会被用户差评"UI 粗糙 / 界面像 DevLog / 美术不配"。

---

*Screenshots referenced:*
`01-initial-1440.png` 启动屏
`02-how-to-play.png` Help · Controls tab
`03-resource-chain-tab.png` Help · Resource Chain tab
`04-game-start.png` 进入游戏第一帧
`05-colony-panel.png` Colony panel 打开
`06-colony-full.png` Colony 全图
`07-heat-lens.png` Heat Lens toggled
`08-later-game.png` 后期帧
`09-fast-forward.png` 快进
`10-resize-1024.png` 1024×768
`11-resize-800.png` 800×600（布局崩坏）
`12-resize-1920.png` 1920×1080
`13-entity-focus.png` Entity Focus 空状态
`14-autopilot.png` Autopilot toggle 延迟
`15-farm-tool.png` 选择 Farm 工具
`16-tile-hover.png` tile hover 无反应
