---
reviewer_id: A6-ui-design
round: 0
date: 2026-05-01
verdict: YELLOW
score: 5
ui_bug_count_p0: 2
ui_bug_count_p1: 9
ui_bug_count_p2: 8
resolutions_tested: 6
panels_audited: 8
---

## 总评

Project Utopia 的 UI 已经远离 "demo" 阶段，但仍距离商业 SaaS dashboard 标准（评 9）有明显距离。
核心强项：信息密度真实、tab 切换可发现、有快捷键提示、有 toast 与 chronicle、modal dim 背景做得到位。
核心弱项：

1. **关键字符串过早截断** —— 1366 / 1280 / 1024 三档分辨率下右侧 "Build Tools" 的快捷键卡片中 "supply-chain heat lens"、"cancel / deselect"、"undo build"、"redo build"、"inspect tile" 等都被截断成 "supply-chai he…" / "cancel /" / "redo b" / "ins ti"。在 1920 × 1080 下也临界。
2. **Demolish 按钮在 default 态用警示红文字** —— 它不是 active、不是 hover、不是 disabled，仅仅是一个静态选项，却用了 #f87 红，违反 "颜色含义一致性" 原则（红 = active / 危险 / 不可用），也让真正 active 的 Farm（白边框）视觉权重失衡。
3. **响应式断点几乎不存在** —— 1024×768 下 Entity Focus 面板与 chronicle toast 与 inspector panel 直接重叠；2560×1440 下界面不放大，地图占去 70 % 的死空间，资源 icon 缩成芝麻大。
4. **Inspector 面板上的 "Click a worker..." 提示条遮挡 Inspector 自身的 Food Diagnosis 行** —— 这是一处明显的 z-index 冲突，且 tooltip 在 inspector 已经显示内容时仍坚持出现。
5. **顶部状态栏 "Autopilot OFF · manual; builders/director idle" 在窄屏下换行成两行，把告警 ⚠ 顶到资源行外侧** —— 文字溢出真实危险。

总体节奏：玩家进入游戏 1 秒内眼睛先看到的是 **中央橙色 modal**（首屏 briefing），层级是对的；进入游戏后眼睛先看到的是 **Build Tools 面板的彩色按钮组**，也合理。
但 build 完之后 Entity Focus 那个底部 panel 是一个长名单 + 7 个 chip filter + 行操作按钮 + 选中详情，明显超过 7 ± 2，需要折叠或第二步揭示。

最终给 5/10：一个"能用、有想法、但还远没成品"的内部 dashboard。

## D1 视觉层级

- 起始页：Project Utopia 标题（蓝粗 28pt）→ 描述 → 模板信息 → "Survive as long as you can" 灰底 chip → Best Runs → Start Colony 蓝按钮，**信息层级清晰，1 秒能找到 Start Colony**。
- 游戏内首屏：左上资源 5 个 icon + 数字、顶中央 "Survived 00:00:00 · Autopilot OFF…"、右上 ⚠ 告警、右栏 Build Tools 按钮组、左下 Entity Focus 面板、底部播放控件 ——
  → **同时存在 ≥ 6 个 "焦点元素"**，眼睛找不到主入口。Build Tools 用了彩色 icon 偏花哨，Demolish 默认红更夺目，并不是真正最重要的操作。
- 主操作（Start Colony / Try Again）用了纯亮蓝实心按钮，是全场最高对比度，**评价：层级正确**。
- Entity Focus chip filters 用 pill 样式，但所有 pill 视觉权重一致 —— 没办法暗示玩家"Critical hunger 0" 在 0 时不需要看，"Hungry 4" 才是当前热点。
- 顶部资源条：Food / Wood / Stone / Herbs / Workers icon 大小一致、数字字号一致，但没有视觉强调"Food 正在跌"——只用一个 ▼ 字符且偏小。

## D2 排版与对齐

- spacing 体系大致是 4 / 6 / 8 / 12 / 16，但局部出现 5、9、11 这类非 token 数字（侧栏 tab 标签竖排时间距）。
- 字体统一用 "Segoe UI / Trebuchet MS, sans-serif"，base font-size 13.54px **（偏小，1080p 应至少 14px）**。
- baseline：资源数字 "193 ▼" 与 icon 中心轴对齐良好；但 Entity Focus 行内 "Hungry / FARM" 与 "Wander" 与 "hungry" 三段之间用 · 分隔，三段宽度未对齐成列，扫读困难。
- panel 边距：Build Tools panel 用 16px 内边距，Entity Focus panel 用 12px，Settings panel 用 14px——三种边距同屏共存。
- AI Log panel 中 "Decision Results" 区块的 inset 比 "Director Timeline" 多 4px，对齐感差。
- 顶部 chronicle toast "Run started: Temperate Plains…" 与 Entity Focus header 高度不一致，有 3px hairline 错位。

## D3 信息密度

- Entity Focus 面板：7 个 filter chips + 19+ 行实体列表 + 选中实体详情 8+ 段（Backstory / Character / Why is this worker doing this? / Policy Focus / Policy Notes / Type / State / Hunger / Food Diagnosis / Food Route Facts / Health / Carry）—— **远超 7 ± 2**，需要折叠或 tab。
- 部分段落已用 ▶ 折叠（"Character"、"Why is this worker doing this?"、"Food Route Facts"），方向正确但还不够。
- Build Tools 面板：13 个工具按钮 + 12 行快捷键 ≈ 25 项 —— **同样过载**。
- Colony 面板：Resources 7 行 + Population 4 行 + Roles 7 行 = 18 项，密度可接受但缺少分组视觉边界（仅靠 H3 标题，没有卡片分隔）。
- 数字呈现：Food 显示 "193 ▼ -39.4/min (cons -36 / spoil -3)" —— 一行三个信息冗长且括号信息字号一致，需要弱化。
- icon + 文字使用：Build Tools 用 icon + 文字（双重编码），但顶部资源条仅 icon + 数字（无文字标签，鼠标 alt 也没看到 tooltip 在 hover 时出现），不一致。

## D4 控件状态完整度

| panel | default | hover | active | disabled | 缺失 |
|-------|---------|-------|--------|----------|------|
| Build Tools 工具按钮 (Select / Road / Farm / …) | ✓ | ✓（背景轻微变化） | ✓（白边框 + 浅蓝底） | ✗ 未观察到 disabled 态（资源不够时按钮不变灰） | **disabled** |
| Build Tools "Demolish" 按钮 | ✗（用 #f87 红，与"危险/active" 颜色含义混用） | ✓ | ✓ | ✗ | **default 颜色误导 + disabled 缺失** |
| Sidebar tabs (Build/Colony/Settings/AI Log/Heat/Terrain/?Help) | ✓（竖排灰底） | 未观察到明显 hover 反馈 | ✓（绿色高亮） | n/a | **hover** |
| Top playback controls (⏸ / ▶ / ⏩ / ⏭) | ✓ | ✓ | ✓（背景填充） | ✗（暂停时 pause icon 不变 disabled？需要检查） | **disabled 未验证** |
| Entity Focus filter chips | ✓ | 未观察到 hover | ✓（深底） | ✗（chip 数字为 0 时不变灰） | **hover + disabled 语义** |
| Entity Focus row buttons | ✓ | ✓（行高亮） | ✓（深蓝高亮） | n/a | 无 |
| Settings sliders (Resolution Scale / UI Scale / Target Farmer Ratio) | ✓ | 未观察到 hover | ✓（拖动时立即响应） | n/a | **hover** |
| Settings Reset Display Settings | ✓ | 未观察到 hover | n/a | n/a | **hover** |

合计：**6 个 panel 缺至少一个状态**（按 Tier A 标准 = 6 个 P1）。

## D5 排版 bug 列表

| 严重度 | 描述 | 位置 | 截图 |
|--------|------|------|------|
| P0 | Demolish 按钮 default 态用红色文字，与 active / 危险 / 不可用语义冲突 | Build Tools panel | 02, 09, 14 |
| P0 | 1024 × 768 下 Entity Focus 与 chronicle toast 与 Inspector 重叠到无法读 | 整屏 | 12 |
| P1 | 快捷键卡片在 1024 / 1280 / 1366 / 1440 四档下文字截断（"supply-chai he…" / "cancel /" / "ins ti…"） | Build Tools 右侧 keybindings 卡 | 11, 12, 13, 14 |
| P1 | 顶部 "Autopilot OFF · manual; builders/director idle" 在 1366 / 1280 / 1024 下换行两行，把告警 ⚠ 推到资源行外 | Top status bar | 11, 12 |
| P1 | Inspector 显示后 "Click a worker, visitor, or animal..." tooltip 仍出现并遮挡 Food Diagnosis 行 | Entity Focus inspector | 10, 13, 14 |
| P1 | 2560 × 1440 下 UI 不放大，资源 icon、按钮、文字全部缩成原 1080 像素，地图占 70 % 死空间 | 全屏 | 15 |
| P1 | Heat Lens 启用后，sidebar tab strip 上出现一个新 tab "Heat (L)"，与下方"plus" 字符叠在一起，z-index 冲突 | Sidebar right edge | 06 |
| P1 | Game-over modal 出现时整个 HUD 与 sidebar 完全消失，玩家无法回看 chronicle / colony stats | "The colony stalled." | 16 |
| P1 | 顶部 chronicle 单行 toast 与左下 Entity Focus 同时存在两套通知，颜色都是绿/橙底，含义不区分 | chronicle bar + toast | 02, 03 |
| P1 | "Last: Deer-19 died (predation). (4s ago)" toast 在中央顶部出现 11 字，遮挡 Autopilot 状态条 | Top center | 11 |
| P1 | Resources Food 行 "193 ▼ -39.4/min (cons -36 / spoil -3)" —— 单行三段信息字号一致，无视觉权重 | Colony panel | 03 |
| P2 | base font-size 13.54px 偏小（建议 ≥ 14） | 全局 | n/a |
| P2 | Entity Focus 行 · 分隔符使用，多列宽度不对齐成栅格 | Entity Focus 列表 | 02 |
| P2 | Build Tools panel 与 Construction panel 同标题字号但 Construction 比 Build Tools 缩进多 4px | 右侧 sidebar | 02, 09 |
| P2 | 资源条 icon 没有 tooltip（hover Food 不解释 cons/spoil） | Top resource bar | n/a |
| P2 | Templates 下拉用浏览器原生 select，与全站设计语言不一致 | Start screen | 01 |
| P2 | "Best Runs" list 6 行内容信息相同（全部 seed 1337 / Score ~171），需要 dedup 或结构化 | Start screen | 01 |
| P2 | Help modal 关闭只能 ESC 或右上 ×，背景 dim 但点击 backdrop 不关闭 | Help modal | 07 |
| P2 | Settings 中 "Quality Preset" 下拉与 "3D Rendering" / "Shadows" 两列下拉对齐方式不同（前者全宽，后者半宽） | Settings panel | 04 |

合计：**P0 = 2，P1 = 9，P2 = 8（共 19 个 UI bug）**

## D6 分辨率测试

### 1024 × 768

- 截图：12-1024x768.png
- 错位 / 溢出：
  - 顶部 Autopilot 文字换行两行
  - chronicle toast "Last: Deer-19 died" 遮挡 Autopilot 条
  - Build Tools 右侧 keybinding 卡 "Esc"、"L su he" 严重截断
  - Entity Focus panel 占去左侧 60 % 屏幕，与 inspector 一起几乎到底部
  - Filter chips 自动换行第二行（7 chip 装不下）

### 1280 × 800

- 截图：13-1280x800.png
- 错位 / 溢出：
  - keybinding 卡 "1-9 / -" 右边缘 cut，"Ctrl+Y redo b" cut，"Alt+C ins" cut
  - Inspector "Click a worker..." tooltip 出现并遮挡 Food Diagnosis 行
  - Filter chips 7 个，第二行只剩 3 个，残缺感

### 1366 × 768

- 截图：11-1366x768.png
- 错位 / 溢出：
  - Autopilot 状态条仍换行两行
  - chronicle toast 遮挡顶栏
  - keybinding 卡 "Esc canc dese" / "L su he" 截断
  - Entity Focus 与 chronicle toast 视觉打架

### 1440 × 900

- 截图：14-1440x900.png
- 错位 / 溢出：
  - keybinding 卡仍然有"Ctrl+Y redo b" / "Alt+Click ins ti…" 截断
  - Inspector tooltip 遮挡问题继续
  - 整体最佳的"勉强能看"分辨率

### 1920 × 1080

- 截图：02-1920x1080-game.png, 03, 04, 05, 06, 07, 08, 09, 10
- 错位 / 溢出：
  - 全部 keybinding 卡完整显示（这是设计目标分辨率）
  - 唯一 issue：Entity Focus inspector 的 tooltip 仍出现遮挡
  - Demolish 红色 default 在亮屏下尤其刺眼

### 2560 × 1440

- 截图：15-2560x1440.png
- 错位 / 溢出：
  - **UI 完全不放大**，所有面板按 px 不按 vw 布局
  - 资源 icon、字体看起来缩到 70 % 视觉大小
  - 中央地图区有 70 % 死空白
  - 没有"在 4K 下 UI 自动放大 1.5×" 的设计
  - 设置里的 UI Scale 滑块虽然存在，但它是手动而非自适应

## D7 信息反馈完备性

- 玩家点 Build Tools 按钮：**✓ 立即视觉反馈**（按钮高亮 + Selected Tool 区显示工具名）
- 玩家点 Tab：**✓ 立即切换面板**
- 玩家点工人/动物/访客：**✓ Inspector 显示**（但 tooltip 遮挡 bug）
- 后台事件：
  - chronicle 顶部条 ✓
  - "Last: Deer-19 died" toast ✓
  - 但同屏下两条 toast 同时出现就重叠
- toast 是否过载：当前节奏（一只动物死才一条）不过载
- toast 是否过早消失：chronicle 顶部条似乎是常驻；"Last: …" 那条 4-17s 自动消失，**消失节奏未给玩家时间 read（读 + 消化）**
- 重要事件日志：AI Log tab 保留了 Director Timeline，**✓ 可回看**；但 chronicle 死亡 / 建造完成事件并没专属面板
- 没有 sound 反馈（assume，无音频测试），全靠视觉/文字
- Game-over modal：**严重缺失** —— modal 出现后 HUD 全部消失，玩家无法回看 "我刚才哪里出问题"，只能 Try Again / New Map

## D8 可读性 / 可访问性

- base font-size 13.54px，**低于 1080p 商业 SaaS 标准 14-16px**
- 文字与背景对比度：
  - 主文字 #C8E0F8 on #0A1420 → 大致 11.5:1 ✓
  - 次要文字（"sampling…"、"a bit hungry"）灰度更深 → 估计 4.5:1，临界
  - 红色 Demolish 文字 #f87 on dark → 估计 6:1 ✓ 但语义错
  - chip "Critical hunger 0" 灰底白字 → 估计 3.8:1 偏弱
- 色盲安全：
  - 资源跌势用绿/橙/红（▼/▲）—— **红绿色盲会失败**
  - chip 状态全部用同一色调，仅"已选中"用深底，色盲安全
  - 地图 fertility overlay 用绿浅深 —— 单色相，色盲安全
- 无 aria-label / role 体系测试，但 snapshot 显示部分按钮有 aria-label（如 "Pause simulation"），覆盖不全
- 键盘 nav：**未测试 Tab key navigation**，但 keybindings 提示完整（Space / 1-12 / Esc / T / L / F1）

## 自行扩展角度

### 角度 1：modality 冲突 / panel 同时打开规则

- Build Tools / Colony / Settings / AI Log / Heat / Terrain / Help **互斥**（一次只能开一个 sidebar tab）—— ✓ 设计正确
- 但 Help modal 出现时 sidebar 仍可点（modal dim 不阻断）—— **需要测试 modal 内点 sidebar 是否触发面板切换**
- Game-over modal 出现时 HUD 完全隐藏 —— **过度 modal**

### 角度 2：input device 友好度

- 鼠标：所有功能可达 ✓
- 键盘：1-9 / Space / Esc / T / L / F1 / Ctrl+Z 全部映射 ✓，但**未观察到 Tab key 焦点环**，Tab nav 体验未知
- 触屏：未测试，但 sidebar 竖排 tab 文字竖排（每字 ≈ 12px）触屏不友好

### 角度 3：超过 1 屏的滚动机制

- Entity Focus 列表超过 12 行时 ✓ 滚动条出现
- AI Log Director Timeline 超过 6 行 ✓ 内嵌滚动
- Settings 长面板 ✓ 自然滚动
- **但 sidebar tab 数量未来增加时（已有 7 个：Build/Colony/Settings/AI Log/Heat/Terrain/?Help），竖排不够空间会被挤压**

### 角度 4：close button consistency

- Help modal: 右上 × ✓
- Game-over modal: **没有 close button**，只能 Try Again / New Map
- Sidebar panels: 没有专属 close button，靠"再点一次 tab"或"点 ←"
- → close UX 不一致

### 角度 5：颜色含义体系

| 颜色 | 用法 1 | 用法 2 | 冲突 |
|------|--------|--------|------|
| 蓝 #1E90FF | Start Colony 主按钮 | Heat lens overlay "starved" | 部分冲突 |
| 红 #f87 | Demolish 按钮 default | "Food Diagnosis: ..." 错误标识 | **严重冲突** |
| 绿 | Build active state border | "well-fed" 状态 | 中等冲突 |
| 橙 | "The colony stalled" 警告 | autopilot 提示条 | 中等冲突 |

→ **color token 体系需要重新规划**

## 改进优先级清单

### P0（影响关键操作）

1. **Demolish 按钮重新着色**（default 不该用红，应使用与其他工具一致的灰，仅 hover/active 时才用红警示）
2. **响应式断点重构** —— 至少 1024 / 1280 / 1366 三档下 keybinding 卡需要换行而非截断；Entity Focus 与 toast 不可同位；2560 下 UI 自动 1.25-1.5× 放大

### P1（影响完成度感）

3. Inspector 显示后隐藏 "Click a worker..." tooltip（用 :empty 选择器或 JS 切换）
4. Game-over modal 改成右下角浮卡，或提供 "保留 HUD 在背后" 选项，让玩家能 review
5. Sidebar 全部按钮加 hover 反馈（0.15s opacity / bg shift）
6. Resource icons 加 tooltip（hover Food 时弹"Food: 193, consumed -36/min, spoil -3/min, projection: -39.4/min"）
7. chronicle 顶部条与中央 toast 二选一，避免双通知通道
8. base font-size 提升到 14px（设置 1.04rem）
9. Settings 中下拉控件统一 width（"Quality Preset" 全宽 vs "3D Rendering" 半宽混搭）
10. 同屏限制最多 3 个 toast，超出排队
11. 颜色 token 系统化：建立 success/warn/error/info/neutral 五色，禁止跨语义复用

### P2（细节）

12. Templates 下拉换为 custom styled dropdown
13. Best Runs 去重（连续 seed 1337 重复 6 行）
14. Help modal backdrop click 关闭
15. Entity Focus 行用 grid layout 对齐三列而非 · 分隔
16. Filter chips 0 时降权（opacity 0.5）
17. base color 对比度提升（次级文字 4.5:1 → 7:1）
18. Sidebar tab 用横排或可折叠
19. Demolish 用图标改成"砸锤" + 浅灰，hover 才警示红

## 结论

Project Utopia 的 UI 是一个**有想法、有结构、但工艺尚未抛光的内部工具级 dashboard**。
核心信息架构（资源条 / sidebar tab / Entity Focus / Build Tools / 底部播放）是对的；
但**颜色语义混乱、响应式断点缺失、控件状态不全、tooltip / toast 通道重叠**让它从"专业"掉到"业余"。

按 Tier A 商业级标准评 **5 / 10**，verdict **YELLOW**。

最迫切的两件事：

1. 给 Demolish 一个不引起 active 误读的 default 色 → 5 分钟工作量
2. 1024-1366 下 keybinding 卡布局重构（横向 grid 改成 wrap） → 2 小时工作量

完成这两件后预期可冲到 6.5/10。要进 7+ 需要 modality 改造（game-over modal、tooltip 冲突）+ 颜色 token 系统化（约 1-2 天工作量）。
