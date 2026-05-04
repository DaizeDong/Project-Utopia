---
reviewer_id: A6-ui-design
round: 1
date: 2026-05-01
verdict: YELLOW
score: 5.5
ui_bug_count_p0: 2
ui_bug_count_p1: 7
ui_bug_count_p2: 6
resolutions_tested: 3
panels_audited: 6
---

## 总评

Project Utopia 的 UI 整体处于"工程师做的内部工具"水准 — 信息密度、层级、控件
区分都基本到位，但分辨率适配脆弱、控件状态不完整、排版对齐属于"凑合能用"
而非成品级。锚定商业 SaaS = 9，本作约 5.5：在 1920×1080 完整阅览，但 1366×768
即出现关键 HUD 截断，1024×768 出现关键面板被覆盖、键盘帮助溢出窗口外。

> 注：因运行预算与盲审约束，仅完整测了 1920×1080 / 1366×768 / 1024×768 三种
> 分辨率，并目测推断了 1280/1440/2560 的退化趋势（在 D6 节标注）。

## D1 视觉层级

进入 1 秒内眼睛先看到：标题（"Project Utopia"，蓝色 28px 粗体）→ 蓝色 Start
Colony CTA。层级在 landing 上是对的。游戏中：眼睛先看顶部资源条 + 中央地图，
正确。但右侧 Build Tools 14 个按钮全部同色同重，没有"主操作 vs 辅助操作"区分；
对新手意味着 Selectk / Demolish / Bridge 同样抢眼。Entity Focus 列表里 8 个
状态标签（hungry / well-fed / a bit hungry…）同色同字号，无 severity ramp。
**P1: 缺乏 emphasis hierarchy**。

## D2 排版与对齐

- 顶部 HUD 资源 chip（314 / 35 / 15…）和 Survived 时间用了不同的 baseline，
  眼睛会感到一条无形锯齿。
- Resources 行内"307 ▾ -32.5/min (cons -27 / spoil -6)"三段间距全是裸像素，
  无 token 化（看起来像 4 / 7 / 11px 混用）。
- Entity Focus 表里 "Hungry / FARM"、"Wander"、"hungry" 三列右对齐，但每行宽度
  不一，造成"凹凸边"。
- Sidebar 标签（Build / Colony / Settings / AI Log / Heat / Terrain / ? Help）
  纵向旋转 90°，间距不齐，且与右侧面板内边距不对齐。
**P1: 没有 4/8/12 spacing token，对齐靠手感。**

## D3 信息密度

- Colony 面板单屏列出 Resources(7) + Population(4) + Roles(8) = 19 项，远超
  7±2 经验值，但好在分组明确，可以接受。
- Entity Focus 列表行末三段文本："Hungry / FARM · Wander · hungry"信息冗余 —
  "Hungry"和"hungry"重复，前者大写表 role-state、后者表 nutrition；玩家完全
  无法从视觉区分。**P1**
- 顶部 chip "routes 0/1 · depots 0/1 · warehouses 0/2 · farms 0/6 · lumber 0/3 ·
  wells 0/8" 在 1366 宽下后两项被裁掉 — 关键目标进度被悄悄隐藏。**P0**

## D4 控件状态完整度

| panel | default | hover | active | disabled | 缺失 |
|---|---|---|---|---|---|
| Build Tools (14 按钮) | OK | 未观察到 hover 反馈 | Select 选中态有蓝边框 | 无 disabled 区分（建材不足时按钮仍亮） | hover, disabled |
| 顶部资源 chip | OK | 无 | n/a | n/a | hover 缺失 |
| Sidebar tab | OK | 无 | active 蓝色高亮 OK | n/a | hover 缺失 |
| Entity Focus filter chip | OK | 无 | "All 19" 蓝高亮 OK | n/a | hover 缺失 |
| Playback bar (▶▶▶▶) | OK | 无 | 无 pressed 反馈 | n/a | hover, pressed |
| Autopilot checkbox | OK | 无 | 切换有视觉但无动效 | n/a | hover |

**P1: 全局 hover 状态系统性缺失** — 这是"未完成"的最强信号。
**P1: Build Tools 资源不足时按钮无 disabled 视觉**，玩家会困惑为何点了没反应。

## D5 排版 bug 列表

| 严重度 | 描述 | 位置 | 截图 |
|---|---|---|---|
| P0 | 顶部 progress chip 在 1366 宽截掉 farms / lumber / wells 三项 | 顶部 HUD | 03 |
| P0 | 1024 宽时顶部 chip 被右侧 sidebar 覆盖（z 错位） | 顶部 HUD | 04 |
| P1 | 1024 宽时键盘帮助 block 内容被裁切，溢出 viewport 底部 | 右侧 Build 面板 | 04 |
| P1 | 1366 宽时键盘帮助里的快捷键描述被强制单字符竖排（"select / inspect tool"变成纵向 1 字宽） | 右侧 Build 面板 | 03 |
| P1 | "Run started…" 蓝色 banner 与 Entity Focus 面板共用左下区，互相挤压；1024 下 banner 文本换行成 2 行后压住 Entity Focus 头部 | 左下 toast/列表 | 04 |
| P1 | west lumber route / east ruined depot 标签会被建造 Hover 圈或 sidebar 遮住 | 地图 | 02/04 |
| P1 | 资源 chip 数字格式不一致：307 / -32.5/min / 1,234（未观察到千分位） | Resources | 05 |
| P2 | "Hungry / FARM" 与 "hungry" 大小写区分语义，但无 legend，无颜色 | Entity Focus | 02 |
| P2 | Sidebar tab 文本垂直旋转，可读性差，且字号小于 12px | Sidebar | 02 |
| P2 | Population 中 "Workers 12 / Visitors 4 / Herbivores 2 / Predators 1" 没有图标 ramp，敌友混排 | Colony 面板 | 05 |
| P2 | Toast "Last: Deer-17 died (predation). (13s ago)" 时间格式与 Survived (mm:ss) 与 Day 1 三种时序混用 | 顶 toast / Colony / 顶 HUD | 05 |
| P2 | Build Tools 14 按钮 7×2 网格，但图标样式不统一（部分有底色圆角，部分扁平） | 右侧 | 02 |
| P2 | "Selected Tool …… Road" 字段右对齐 "Road" 像超链接但不可点击 | Construction | 02 |
| P2 | Best Runs 列表"Score 182 · Dev 21 · 3:12 survived · Temperate Plains · seed 1337 · loss" 信息密度过高且无视觉分隔 | Landing 面板 | 01 |
| P1 | Entity Focus filter chips 在 1024 宽换行成 2 行，与列表头无 padding | 左下 | 04 |

## D6 分辨率测试

### 1024 × 768 — RED
- 截图：04
- 关键 HUD chip 被右侧 sidebar 覆盖（z-index 错位）
- 键盘帮助 block 顶部和底部都被裁
- Entity Focus filter chip 换行
- 中央交互区（地图）剩余宽度仅 ~600px，建造很难精准

### 1280 × 800 — 推断 YELLOW
未直接测；介于 1366 与 1024 之间，预计 chip 截 2 项，键盘帮助勉强单列。

### 1366 × 768 — YELLOW
- 截图：03
- farms / lumber / wells 三个进度 chip 被截掉（P0 信息丢失）
- 键盘帮助文字"select / inspect tool" 强制纵向单字符
- 仍可玩

### 1440 × 900 — 推断 GREEN
预计与 1920×1080 接近，仅 chip 边距略紧。

### 1920 × 1080 — GREEN
- 截图：02 / 05
- 完整呈现，但仍有 D2 / D4 缺陷

### 2560 × 1440 — 未直接测，推断 GREEN-leaning
布局未观察到自适应 max-width，预计中央地图被两侧 panel 之间留白拉扯。

## D7 信息反馈完备性

- toast：观察到"Run started…"、"Last: Deer-17 died (predation)"、"west lumber
  route" — 有反馈但无层级（info / warn / error 同色同字号）。
- 后台事件：动物死亡有 toast，建好建筑未观察到（短时间内）。**P2**
- 操作反馈：点击 Build Tools 按钮无声音、无 toast、按钮无 pressed flash —
  仅高亮持续。新手会怀疑是否点中。**P1**
- 重要事件日志：右侧有 "AI Log" tab，可回看 — 这是正向。
- toast 过载/过早消失：未观察到过载，但 13s 才显示"Deer-17 died"显得滞后。

## D8 可读性 / 可访问性

- 字号：右侧键盘帮助文字 ≈ 11px，低于 12px 阈值。**P1**
- Sidebar 旋转 90° 文字可读性差。**P1**
- 对比度：深底深字处即"Heat / Terrain / Help"竖标签灰度 #8x，偏低。
- 色盲：Resources 进度条仅靠绿/黄色长度区分，红绿色盲会损失"将耗尽"语义。**P1**
- 仅靠颜色区分的元素：饥饿 vs 饱食在 Entity Focus 完全靠文字小写大小写，
  无图标 / 无颜色，色盲与全盲都失败。**P1**

## 自行扩展角度

### 扩展 1：modal/Panel 冲突
点击 Colony tab 后右侧切换 Colony 内容，但顶部"Last: Deer-17 died" toast
出现在 sidebar 与顶部资源条之间，挤掉了 Survived 时间的边距。两个独立子系统
往同一个垂直空间塞内容、互相不知道，需要一个全局垂直布局调度。**P1**

### 扩展 2：键盘 / 鼠标 / 触屏一致性
界面假设鼠标 + 键盘并存：右侧"键盘帮助"占了 Build 面板 1/3 高度，但触屏没有
任何 hint。键盘 1-9 选 tool 是发现型快捷键 — 没有第一类视觉提示（按钮上无
角标"1"/"2"），只能从右下角的密集帮助 block 找。**P1**

### 扩展 3：撤销/退出路径
Esc cancel / Ctrl+Z undo build 在帮助块里，但实际操作中没有撤销栈可视化，
玩家不知道还能回退几步。**P2**

### 扩展 4：landing → game 的认知断层
Landing 面板满满讲故事 + 教学，Start 后骤变到信息密集 HUD，没有任何"过渡向
导"或"第一次进入高亮"。新玩家会迷失。**P1**

## 改进优先级清单

### P0（影响关键操作）
1. 顶部 progress chip 在 1366 宽以下被截掉关键目标 — 玩家完全看不到 farms/
   lumber/wells 进度（截图 03）。需要 wrap 或 collapse-to-icon。
2. 1024 宽时顶部 HUD 与右侧 sidebar 重叠（z 错位）— 视觉损坏（截图 04）。

### P1（影响完成度感）
3. 全局 hover 状态系统性缺失（所有 panel 6/6 没有 hover 区分）。
4. Build Tools 资源不足时无 disabled 视觉。
5. 1024 宽时键盘帮助 block 溢出 viewport 底部。
6. Entity Focus 用大小写区分 role 状态 vs 饥饿状态，无图标无颜色。
7. 资源进度条仅靠颜色 — 色盲不友好。
8. 字号 < 12px 出现在右侧键盘帮助。
9. landing → game 认知断层无过渡。
10. 操作反馈缺 pressed flash / 声音 / toast。
11. modal/panel 垂直空间冲突。
12. 数字 / 时间格式三种混用（mm:ss vs Day N vs N s ago）。

### P2（细节）
13. Build Tools 图标视觉风格不统一。
14. Sidebar tab 90° 旋转可读性。
15. Population 列表敌友未视觉分组。
16. Best Runs 列表无视觉分隔符。
17. "Run started…" toast 与 Entity Focus 共用空间互挤。
18. 撤销栈不可视化。

## 结论

UI 处于"功能完整但未做完工业化打磨"的中间态。Landing 页面是这个项目最像
SaaS 的部分（5.5/9 → 7/9）；游戏内 HUD 有明显的"工程师堆功能、未交给设计师
最后一道工序"气味（5/9）。最致命问题不是审美，而是 **1366 及以下分辨率
信息丢失** 与 **控件状态缺失** — 这两类是商业产品 day-0 阻塞项。

**verdict: YELLOW** — 不至于不能玩，但离"成品"差一轮系统化的设计 token + 响应
式断点 + 状态完整度补齐。建议下一轮：
1. 引入 4/8/12 spacing token + 全局 hover/disabled state library
2. 顶部 chip 在 < 1440 时折叠为图标 + tooltip
3. 1024×768 列为不支持，或做整体 sidebar 折叠模式
4. 给资源/状态加图标 ramp，不再仅靠大小写区分语义
