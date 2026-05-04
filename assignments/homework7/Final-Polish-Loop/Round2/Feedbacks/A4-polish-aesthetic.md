---
reviewer_id: A4-polish-aesthetic
round: 2
date: 2026-05-01
verdict: RED
score: 3
v1_lighting: 2
v2_color: 4
v3_audio: 1
v4_motion: 3
v5_bugs_count: 4
---

## 总评

打开浏览器，访问 `http://127.0.0.1:5173/`，欢迎屏是一张深蓝色 `Project Utopia` 卡片漂浮在一张几乎黑色的程序化海岸贴图上，没有 logo 动画、没有摄像机推移、没有粒子，更没有任何一声音。点击 *Start Colony*，瞬切进入主场景：俯视 2D 网格，一个角色就是一颗 sprite。然后……什么都不再发生——视觉层面。没有日夜，没有云阴影掠过，没有摄像机微颤，没有水面波光，没有风吹动的草叶。开自动驾驶让模拟跑了 12 分钟（游戏内 ~ Run 03:01 → 12:17），整张画面的"温度"恒定不变，唯一变化是 tile 的颜色随建造工程更新——但那是数据可视化，不是美术 polish。

这是一款 **simulation-engineer-grade** 但 **screenshot-grade 远远不够** 的作品。它用功能告诉我"我能玩很深"，但它没有任何一帧能让我在 Steam 商店滚动到第 14 款 colony sim 时停下来。即使锚点放在最低（"我看过最好的 indie colony sim 是 9"），我会给它 **3 / 10**——比起 Bookkeeper-tier 的 Excel 视觉好一些，但远低于即使是早期 EA 的 Rimworld / Going Medieval / Against the Storm。

verdict: **RED**——上 Steam 的话我会建议先打 6 周美术专项再发 capsule。

## V1 灯光与昼夜

**现象描述：** 整场游戏没有"光"的概念。地形是程序化贴图（绿草、棕泥、蓝水方块格），全部使用平涂 + 网格线，看不到任何方向光、点光、AO、cast shadow。我让模拟从 `00:00` 跑到 `Run 12:17`，没有一次画面亮度发生变化——也就是说**根本没有昼夜系统**（或者它只影响 gameplay 数据，没影响渲染）。建筑没有立面阴影，水面是单色蓝色 + 纹理（无反射、无折射、无 specular highlight），墙壁没有"高度"——这是一个完全 2D top-down 的 painter's algorithm 渲染。
**截图：** `screenshots/A4/steam-clean-baseline.png`, `screenshots/A4/steam-mid-game.png`（同一关卡 3 分钟跨度，画面亮度 0 变化）
**评分：** 2 / 10
**改进建议：** 哪怕只是给 canvas 套一个全屏 CSS gradient 蒙版（白天 → 黄昏 → 夜晚 → 黎明），并在夜晚降低饱和度 + 增加蓝色色温，立刻就能从 "工程 demo" 跨入 "indie game" 一档。再进一步：建筑投出 1-tile 偏移的暗色阴影 sprite；水域加 sin-wave 的色相微抖。

## V2 后处理与调色

**现象描述：** 整体调色方向是**正确的**——蓝色海洋 + 绿色草地 + 棕色泥土 + 灰色石头/墙壁，识别度高，"是同一款游戏" 这条没问题（V2 唯一不算灾难的维度）。但问题在三处：
1. **没有任何后处理**：没有 bloom、没有 vignette、没有 color grading LUT、没有 chromatic aberration（这倒不需要）、也没有 film grain。所有色块都是 100% 饱和度的 hex 颜色，看上去像 1995 年 SimCity 2000 的截图，而不是 2025 年的 indie。
2. **天气没有视觉差异**：整场没有看到雨/雾/旱——HUD 文本上没有"weather"标签出现过，也无法判断是否触发。如果天气被移除了，那"雨/雾/旱区分"这条直接 0 分。
3. **overlay 与 base 的颜色冲突**：按 T 切换 fertility/elev/conn/node-health overlay，每一种 overlay 都直接覆盖在地图上，颜色饱和度高到把建筑 sprite 都吞掉（见 `screenshots/A4/steam-zoom.png` 中 node-health 红绿覆盖让木匠和铁匠 sprite 几乎看不出来）。Heat lens 同理——`screenshots/A4/steam-5.png` 中 supply-surplus 橙色块直接糊住了仓库 sprite。

**截图：** `screenshots/A4/steam-2.png`（无 overlay，最干净），`screenshots/A4/steam-3.png`（zoom 含 overlay，过载），`screenshots/A4/steam-5.png`（heat lens）
**评分：** 4 / 10
**改进建议：** 给 base layer 加一道整体的轻 LUT（暖一点、对比度 -10、饱和度 -8）；overlay 一律改成 50% alpha + 高斯模糊；水面加 0.15 透明度 specular noise；菜单背景加 ken-burns 极慢推进。

## V3 音频混音

**现象描述：** **静默。** 整场——主菜单、游戏内、暂停、resume、击杀、建造完成、Tier-5 raid defended——**0 BGM、0 SFX、0 UI tick**。我用 `document.querySelectorAll('audio').length` 直接确认，DOM 里 audio 元素数 = **0**。不能排除 game 用 WebAudio 直生成 buffer，但我把声音开到最大听了 12 分钟，确凿无声。最关键的事件——`Tier-5 raid defended`、`Thal-15 starved`、`First Kitchen raised: Meals can now turn raw food into stamina`——都只用 toast 文本反馈，听觉锚点为 0。
**截图：** `screenshots/A4/steam-clean-baseline.png`（"Tier-5 raid defended" toast 在画面正中——一个本应有 fanfare 的高光时刻，鸦雀无声）
**评分：** 1 / 10（不给 0 是因为"静默"在 alpha 里也算作 reproducible 的稳定状态）
**改进建议：** 哪怕从 freesound.org 拼一套 5 段：(a) menu loop 30s, (b) 白天 ambient, (c) 夜晚 ambient + 远处狼嚎 1 次/45s, (d) UI hover/click tick, (e) raid alarm + raid defended fanfare。每个 SFX 1-2 秒就能让游戏感觉"活了"。

## V4 动效与微交互

**现象描述：** 这是我最失望的维度，因为 polish 的 70% 价值在动效，但游戏几乎一样没有。
- **按钮 hover/pressed/disabled 状态：** 是齐全的——hover 出现 tooltip（"Smithy (11) — forge stone+wood into tools, cost: 6 wood + 5 stone..."），disabled 状态用置灰 + ⚠ 图标处理。**这一项是 OK 的**。
- **建筑放置/拆除/升级动画：** 完全没有。建造前 = 空 tile；建造后 = sprite 直接出现在那里（0 frame transition），无 scale-up、无尘土粒子、无 outline pulse。
- **worker idle/walk/work 动画：** Worker 是单帧 sprite，移动时位置 lerp 但姿势不变。看了 12 分钟没看到任何农夫弯腰、伐木工挥斧、建筑工锤击的动作。
- **panel 弹出/收起 transition：** Build/Colony/Settings 侧边栏是瞬切，没有 slide/fade。menu → game 也是瞬切。
- **toast 出入场：** 看到了 "Tier-5 raid defended"、"Depot reclaimed"、"First Kitchen raised" 等——它们是淡入淡出的（有 transition），这是除按钮 hover 外**唯一**有动效的 UI。

**截图：** `screenshots/A4/tooltip-smithy.png`（hover tooltip OK），`screenshots/A4/steam-clean-baseline.png`（toast 淡出中）
**评分：** 3 / 10（hover/tooltip + toast 给 3 分；其余全空）
**改进建议：** 优先级排序——(1) 建筑落成 0.3s scale-bounce + 4 颗灰尘粒子，(2) worker 在 work 状态时的 1-frame 摆动 sprite，(3) panel 0.2s slide-in，(4) menu→game 200ms cross-fade。这四件事每件 1 天工作量，加起来能让评分从 3 直接拉到 6。

## V5 视觉 bug 列表

| 严重度 | 描述 | 截图 | 复现 |
|---|---|---|---|
| P1 | 1024×768 分辨率下顶部 status bar 严重截断（"Recovery: food runway - exp..." 看不到末端，"Autopilot ON · fallback/llm \| Reco..."），右侧 sidebar 与左侧 Entity Focus panel 几乎拼到一起，中间游戏区域被压扁。**Steam Deck 分辨率（1280×800）会有同样问题**。 | `screenshots/A4/res-1024x768.png` | resize 1024×768 |
| P1 | 1366×768 分辨率（**笔记本最常见分辨率之一**）下，顶部状态条仍被截断（"expansio..."），sidebar 内的 keymap 文字开始换行错位（`Ctrl+Z undo build` 折成两行）。 | `screenshots/A4/res-1366x768.png` | resize 1366×768 |
| P2 | 2560×1440 / 4K 分辨率下，**UI 不做 DPI 缩放**——所有按钮、文字、icon 在视口里看起来只占一小撮，HUD 字号 ≈ 9px，几乎不可读。 | `screenshots/A4/res-2560x1440.png` | resize 2560×1440 |
| P2 | Heat lens 与 terrain overlay 的色块**直接覆盖**到建筑 sprite 上——`steam-5.png` 中 "supply surplus" 橙色完全糊住了 warehouse / kitchen sprite，玩家无法在 lens 开启时识别建筑类型。属于功能性视觉冲突。 | `screenshots/A4/steam-5.png`, `screenshots/A4/steam-3.png` | 任意时刻按 L 或 T |

未发现：z-fighting、shader 错误（粉/黑/闪烁）、texture seam（贴图 seam 不存在因为是 grid，每个 tile 边界硬切是有意为之但仍然带来"工程图"感）。
**P0+P1 视觉 bug 数：** 2（两个分辨率截断），**总计 4**（含 P2）。

## Steam 截图测试

我从 ~14 张抓图里挑出 5 张作为"商店首图候选"。

### steam-1.png — 主菜单
- **时刻：** 进入 URL 后 1.5 秒，标题卡片淡入完毕。
- **selling point：** "Project Utopia" 字体清晰，副标题"Your colony just landed..."给出叙事钩子，下面的 Best Runs 列表（"Score 182 · Dev 21 · 3:12 survived"）证明这是一个有"meta progression"的 roguelite 系 colony sim——这点对 Rimworld 玩家来说是**唯一可能让人点进去的 hook**。
- **缺什么：** 背景是一张漆黑的低对比度地图缩略图，等于没有背景图。没有 hero sprite、没有 character cluster、没有"看一眼就懂玩什么"的 visual。如果我是 Steam 用户，**100% 不会因为这张图点进去**。商店首图至少要替换为一张游戏中场景的高对比度合成图。

### steam-2.png — 中后期殖民地全景（俯视 zoom-out, 无 overlay）
- **时刻：** 跑了 ~ 9 分钟自动驾驶，殖民地中心建筑铺满网格，蓝色水域围绕，森林边缘可见。
- **selling point：** 这是**全场最有 Steam 感的角度**。建筑 icon 类型识别度最高（农场、伐木场、仓库、墙、herb plot、smithy 一目了然），蓝绿棕的色彩三角让人立刻明白"这是 colony sim"。
- **缺什么：** 太"工程"了——没有人物特写（worker sprite 太小看不见性别、衣着、动作）、没有事件高光（没有正在打仗、没有正在建造）。如果加一个"raid 来袭"的红色 alert 圈 + 战斗粒子，这张就能上首图。

### steam-3.png — 殖民地特写 (zoom-in, node-health overlay)
- **时刻：** 同一关卡 zoom-in 到核心区域，开启 node-health overlay 显示 tile 红/绿色块。
- **selling point：** 强调"系统深度"——红绿色块让玩家立刻知道"这游戏有 simulation 颗粒度"，建筑 sprite 在这个 zoom level 终于够大可以认出 (sword、herb、wood、stone tools)。
- **缺什么：** overlay 颜色压住了建筑——这张作为 "feature 截图"（介绍"我们有 deep simulation"）可以，但作为 selling 第一图不行，因为 overlay 让人看不清"游戏本体"。

### steam-4.png — Tier-5 raid defended（事件高光）
- **时刻：** Run 03:01，tier-5 raid 被防守住，画面正中黄色 toast"Tier-5 raid defended"，殖民地一角被红色高亮（攻击痕迹）。
- **selling point：** **这是除 steam-2 之外最有"卖点"的截图**——它讲了一个故事："你的殖民地刚扛住了一波大袭击"。Steam 玩家对"叙事截图"反应远好于"技术截图"。
- **缺什么：** 但是 toast 的视觉权重不够——只是一个浅黄色 banner 在画面中部漂浮，没有屏幕震动、没有 overlay 暗化、没有 raid 部队 sprite。理想情况下这张图应该有十几个红色敌人 sprite + 防御 sprite + 一个清晰的烟雾粒子柱，现在只有一行字。

### steam-5.png — Heat Lens 启用（systems showcase）
- **时刻：** 按 L 启用 supply-chain heat lens，"supply surplus" 橙色 badge 漂浮在多个 tile 上。
- **selling point：** 这张是"我们有 logistics depth"的 marketing 镜头。Factorio / Dyson Sphere 玩家会因为"哦，有 supply chain visualization"点进去。
- **缺什么：** 橙色 badge 文字可读但 ugly——是 plain HTML toast 风格，不是 in-game 美术风格，**完全脱离了游戏的视觉语言**。如果把 supply-surplus 标签换成一个有边框、有 icon、有 typography 的 in-world UI 元素，这张就能上 features 页。

## 结论

Project Utopia 在 simulation-engineering 维度交付了一个 **deep 且稳定** 的 systems 沙盒（这从 Tier-5 raid、autopilot/llm fallback、heat-lens、4 种 terrain overlay 可以看出）——但视听 polish **基本是零起点**：没有日夜、没有阴影、没有动画、没有声音、UI 在两个最常见笔记本分辨率下截断。

**verdict: RED.** 如果今天放上 Steam，capsule 图会被"是不是 placeholder？"的评论淹没。Top-3 优先级修复：
1. **加 BGM + 5 个 SFX** —— 1 周工作量，能把"它是死的"印象立刻消除（v3: 1→5）。
2. **昼夜全屏蒙版 + 建筑落成动画 + worker work-frame** —— 2 周工作量（v1: 2→5, v4: 3→6）。
3. **修 1024/1366 分辨率截断 + 4K 下 UI scaling** —— 3 天工作量（v5 P1×2 → 0）。

完成这三件事，整体分数能从 3 推到 6—— 离"steam 商店候选首图能用"的最低门槛就近了。
