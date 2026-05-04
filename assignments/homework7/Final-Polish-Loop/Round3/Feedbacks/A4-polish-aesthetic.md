---
reviewer_id: A4-polish-aesthetic
round: 3
date: 2026-05-01
verdict: YELLOW
score: 4
v1_lighting: 4
v2_color: 5
v3_audio: 1
v4_motion: 3
v5_bugs_count: 4
---

## 总评

Project Utopia 在 Round 3 已经是一台**能用、能玩、能写很多日志**的 colony sim 模拟器，但当我把它当成一款 Steam 待发售独游来评，它仍然停在"早期 access 第三周"这个心理位置。它不是丑——配色克制、UI 排版有节奏、tile 绘制干净——但它**没有任何一个 5 秒钟内会让人停下滚轮的视觉锚点**。整个画面更像 dev tooling 截图：左下角永远悬着一个白底绿条 toast、右侧永远占着 1/4 视宽的工具栏、地图永远是 60° 等距俯视的方块格。

最大的问题不是 polish 缺失，而是**风格没有定位**：grass 是扁平 SVG 风格的菱形，water 是像素风的点阵，建筑是 RimWorld 调色板的 16-color 平涂，UI 字体是 Chrome 默认 sans-serif，标题是亮蓝色 web button——4 种语言混在同一帧里。任何一个独立做下去，都能撑起一款上架游戏；4 个并存就显得是没人 own 视觉方向。

听觉这一格更直白：**没有任何音频**。我整个 review 期间没有听到 BGM、UI click、build sfx、dying wolf yelp。考虑这是一款核心循环就是"听食物溢出/听袭击响起来"的 sim，零音频是 P0 阻塞项。

值得肯定的地方：白天到夜晚的全场景调暗（A4-worker-inspect 可见 grass 明显灰化）说明灯光系统是真的；heat lens / terrain overlay 切换流畅没有 flash；Help 模态有 backdrop blur 透出场景；toast 有出场过渡。地基都在，就是没穿衣服。

---

## V1 灯光与昼夜

- 现象描述：游戏运行 ~2:00 后，整体场景从开局的明亮草绿渐变到偏冷的深绿（对比 `A4-game-day-start.jpeg` vs `A4-worker-inspect.jpeg`，水面也从 #5b8ab5 → #3e6488 左右）。这是真实的全局调色而不是 overlay 蒙版——但**没有方向性阴影**：建筑 3-D 高度感全靠每个 tile 内的 hand-painted 高光暗角，太阳从哪个角度都不变。也**没有黄昏暖色过渡**：从亮直接到暗，缺中间的橙/粉/紫帧。夜晚虽然变暗了，但没有点光源（warehouse / kitchen 这些"应该有炉火"的 tile 没有 bloom 灯笼），所以视觉上只是"调低了 brightness slider"，不是"夜来了"。
- 截图：`screenshots/A4/A4-game-day-start.jpeg`（白天）, `screenshots/A4/A4-worker-inspect.jpeg`（夜，明显偏冷）, `screenshots/A4/A4-peak-development.jpeg`（午后）
- 评分：4/10
- 改进建议：(1) 给 kitchen / smithy / warehouse 加 1 像素的暖色 emissive 点，夜里发光；(2) 在 day→night transition 中插 30 秒"sunset"色调，sky 偏 #E8A87C，grass 走暖再走冷；(3) tile 高光不要 baked，做一个全局的 light-direction uniform，让建筑屋顶随时间转向。

## V2 后处理与调色

- 现象描述：调色板**克制但碎**。grass 用了至少 4 种饱和度的绿（亮草绿、forest 暗绿、heat-lens overlay 后的荧光绿、夜晚冷绿），水用了纯像素点阵风格（明显是另一种艺术语言），建筑是 RimWorld 风格的扁平 16-color，UI 是亮蓝 #3aa0ff + 深灰 #1a2230 web 卡片风。**4 种艺术风格并存**：vector flat tile + pixel water + painted building + web UI。没有 bloom，没有 vignette，没有 color grading LUT——这正是它"看起来像 prototype"的根因。截图丢到 Steam 商店首图位置，会被旁边的 Rimworld / Stardew / Going Medieval 截图直接吃掉。我没有观察到 contrast 拉爆或饱和过载，反过来——**整个画面 contrast 偏低**，前景（建筑 + worker）和背景（grass）的 luminance 差只有 ~15%，远看就一片绿。
- 截图：`screenshots/A4/steam-3-thriving-colony.jpeg`, `screenshots/A4/A4-terrain-overlay.jpeg`
- 评分：5/10
- 改进建议：(1) 选定一种艺术语言（建议 painted-flat 朝 RimWorld 走，砍掉 pixel water），然后让 water 也走平涂 + 描边；(2) 加一个非常轻的 LUT，把 grass 推暖一点点（绿 → 黄绿），把 water 推蓝紫，把建筑屋顶推红橙——出现"温度对比"；(3) 给前景 entity 一个 0.5px outline / drop shadow，立刻和 grass 分离。

## V3 音频混音

- 现象描述：**完整 review 期间零音频输出**。没有 BGM；没有 UI click；放置建筑、worker 死亡（toast 显示 "Last: Wolf-20 died (killed-by-worker)"）、autopilot 触发 recovery（"food runway unsafe"）这些**重大事件全部没有 audio cue**。游戏纯靠玩家眼睛去扫 toast 和左下角 banner。对一款让玩家长跑数十分钟、autopilot 后台跑的 sim，这是 P0。
- 评分：1/10（不是 0 是因为我无法 100% 确认是浏览器静音 vs 项目无音频，但 console 没有 audio-related log，DOM 没有 `<audio>` 标签）
- 改进建议：(1) 最低限度先上 1 条循环 ambient（白噪鸟鸣 / 风），证明 audio pipeline 接通；(2) 三个最重要的 sfx：raid 来袭低音 stab、build complete 高音叮、death 短促木鱼 thud；(3) UI hover / click 用 60ms 的微小 noise burst，不是钢琴音。

## V4 动效与微交互

- 现象描述：button hover 有 tooltip 弹出（`A4-button-hover-tooltip.jpeg` 可见 "Farm (2) — produce food, cost: 5 wood. Place near soil-rich tiles..."），文案极佳——但 tooltip 是**瞬切**而不是 fade in。disabled state 用 `⚠` 警示符 + 半透明灰，能看出来但没有 visual hint 解释为什么 disabled（hover 也不告诉我）。Help 模态有 backdrop blur + 居中（`A4-help-panel.jpeg`），是全场最 polished 的一处。建筑放置我没有观察到 ghost preview 动画或 placement burst。worker 在地图上是小像素点，没有 idle vs walk vs work 的形态区别——只能靠 entity panel 文字判断。speed control（⏸ ▶ ⏩ ⏭）没有 active 态高亮过渡。Pressure / heat-lens 切换是瞬切，没有 cross-fade。autopilot recovery banner 在左下角是直接显现，没有 slide-in。
- 截图：`screenshots/A4/A4-button-hover-tooltip.jpeg`, `screenshots/A4/A4-help-panel.jpeg`
- 评分：3/10
- 改进建议：(1) 全部 panel / banner / toast 加 120ms ease-out fade + 8px slide；(2) worker idle 加 ±1px 呼吸、walk 加 leg-bob、work 加锤击/砍树循环——3 帧像素动画就够；(3) build placement 加 1 帧白色 flash + 4 帧粒子 burst；(4) disabled 的 build button hover 时显示"为什么 disabled"（缺 wood / 无 soil / etc）。

## V5 视觉 bug 列表

| 严重度 | 描述 | 截图 | 复现 |
|---|---|---|---|
| P1 | 1024×768 下顶栏 stat bar 折行（"warehouses 2/2 farms 0/6 wood 0/8" 行换行换到第二行），右侧 Build Tools 因换行被推下且和 toast "Last: Wolf-20 died" 重叠 | `A4-resize-1024x768.jpeg` | resize 1024×768，启动游戏，等 toast |
| P2 | 1366×768 下右侧 sidebar (Build Tools) 仍占 ~280px，把顶栏 "walls 0/8" 完全遮住 | `A4-resize-1366x768.jpeg` | resize 1366×768 |
| P2 | tooltip 弹出时**没有 fade**，瞬切；并且 hover Farm 按钮时 tooltip 直接覆盖了 Wall / Quarry / Herbs 按钮，玩家来不及看其它 | `A4-button-hover-tooltip.jpeg` | hover 任何 build button |
| P2 | Inspector panel ("Hale Hale (worker_10)") 弹出时和 Entity Focus 列表的"Click a worker..."占位 tooltip 重叠（两个白底浮层叠在一起） | `A4-worker-inspect.jpeg` | 点 entity 列表中的 worker 行 |
| P3 | water tile 是像素点阵，grass tile 是矢量 flat，两种艺术风格在同一帧 — 不是 bug 但是 visual incoherence | `A4-game-day-start.jpeg` | 任何带水边界的视图 |
| P3 | Heat Lens overlay 在 grass 上覆盖荧光色块时，原 tile 的 highlight pattern 透出来，造成网格感更强 | `A4-heatlens.jpeg` | 按 L 切 heat lens |

我**没有**观察到：z-fighting 闪烁、shader 错误（粉/黑）、文字 clip-overflow（最长字符串 "Rhea Hollowbrook · Hungry / FARM..." 优雅截断带 ellipsis）、图标锯齿。

P0+P1 视觉 bug 数 = **1**（仅 1024×768 折叠重叠是 P1；其余降级到 P2/P3）。

## Steam 截图测试

### steam-1-title-screen.png — 蓝色卡片飘在虚空里
- 时刻：游戏首启动，Project Utopia 主菜单
- selling point：标题字蓝、有 "Best Runs" leaderboard、有 template 下拉、有 "Survive as long as you can" tagline——能传达"硬核 colony sim"的味道
- 缺什么：背景是**几乎纯黑加一点灰色像素噪点**——在 Steam 列表里会被秒杀。需要：(1) 一张实际游戏的 hero artwork 模糊放在背后；(2) 标题字加 glow / 描边；(3) "Project Utopia" 字体换成有 personality 的 display font 而不是 web sans。

### steam-2-fresh-landing.jpeg — 第一天，孤岛降落
- 时刻：游戏开始 ~2 秒，3 块绿岛 + 12 个 worker 散在 broken 仓库旁
- selling point：构图有"frontier 拓荒"叙事——红屋顶 east ruined depot 在右下、west lumber route waypoint 在中间、worker 像 ant 般铺开
- 缺什么：(1) viewport 一半是黑 void，太空旷；(2) 没有视觉焦点，眼睛不知道看哪；(3) 缺戏剧光线（夕阳 / fog 边界）。要让"小 colony 对抗虚无 wilderness"的张力立起来，需要 desaturate 背景 void 推到深蓝紫，前景 colony 推暖。

### steam-3-thriving-colony.jpeg — 8 分钟后的产业带
- 时刻：autopilot ON 跑 ~2 分钟，多块岛被开发，有 farm + warehouse + wall 集群
- selling point：**这是 5 张里最有戏的一张**。能看到 4 种不同建筑、worker 在跑、"Recovery: food runway - expansion paused" banner 表明系统有 stakes
- 缺什么：(1) 整个 colony 集中在屏幕中心一小块，周围 60% 屏幕是空 grass + void——zoom 不够近；(2) 缺少"动作"瞬间（一个 worker 砍树挥舞、一个 wolf 在边境潜伏）；(3) UI sidebar 占 25% 宽，要么 pre-screenshot 模式收起 UI，要么把 UI 也设计得 picture-worthy。

### steam-4-heat-lens-strategy.jpeg — 战略分析模式
- 时刻：按 L 启动 supply-chain heat lens，叠加在 colony 上
- selling point：传达"这是一款有数据深度的硬核 sim"——有 overlay、有色块、有 surplus/starved 二元色码
- 缺什么：(1) 实际上 overlay 颜色饱和度太低，远看像是"草地稍微变色了"而不是"信息层亮起来了"——需要把饱和度推到 80%+；(2) 缺一个图例 (legend) 浮窗在角落显示色阶——目前只有左上角小标签 "Overlay: Node Health"，太弱；(3) 适合 Steam 第 3 张副图位置（"看，我们也有 visual analytics"），不适合首图。

### steam-5-night-inspector.jpeg — 午夜，与 Hale Hale 对话
- 时刻：选中 worker Hale Hale，Inspector panel 展开 backstory + policy notes
- selling point：能传达"colonist 有名字、有 backstory（'woodcutting specialist, careful temperament'）、有 hunger 状态"——这是 RimWorld 玩家会在意的细节
- 缺什么：(1) 场景太暗了——夜晚调色把整个画面拉成 50% brightness，截图丢出去会显得"游戏没渲染好"；(2) Inspector panel 里**纯文本 + bullet list**，没有 worker portrait / icon——加一个 32×32 像素头像就质感跃迁；(3) panel 和左上 Entity Focus list 重叠，要么先关 list 再截。

## 结论

**Verdict: YELLOW**——可以继续打磨上架，但当前状态绝不是"能放 Steam 商店首图"的 polish 等级。三个最高优先级的修复：

1. **加任何形式的音频**（P0，blocker）。即使是 1 条 royalty-free ambient + 3 条 sfx，立刻把"原型感"切掉一半。
2. **统一艺术风格**（P1）。在 pixel-water vs flat-vector-grass 之间二选一，然后让 UI 也对齐。当前的 4 种风格混杂是 Steam reviewer 第一眼会扣分的点。
3. **加方向性灯光 + 黄昏过渡**（P1）。dimming 整个画面不算昼夜——加 directional shadow caster + 30 秒 sunset color shift，整个游戏立刻"活起来"。

打磨地基都在（heat lens / overlay / autopilot / tooltip 内容质量都好），缺的是把它穿上演出服。
