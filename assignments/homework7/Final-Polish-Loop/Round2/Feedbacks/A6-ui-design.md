---
reviewer_id: A6-ui-design
round: 2
date: 2026-05-01
verdict: YELLOW
score: 5.5
ui_bug_count_p0: 2
ui_bug_count_p1: 7
ui_bug_count_p2: 6
resolutions_tested: 3
panels_audited: 7
---

## 总评

Project Utopia 的界面在 1920×1080 单一分辨率下已具备“可读 SaaS 仪表盘雏形”，配色（深蓝 + 绿色叙事 chip + 黄色警告）整体克制，对齐基本一致。但**只要离开 1920×1080，UI 立即破裂**：1366×768 顶部 chip bar 已开始换行 / 截断，1024×768 顶部 chip 有 2-3 个直接被推出可视区，左侧 Entity Focus 浮层与右侧 Sidebar 同时生效，地图视口被压缩到不足 50% 宽。叠加上 AI Log 面板里 "Director Timeline" 列表 9 条全是同一行复读 (`fallback-healthy rebuild the broken supply lane fallback`)，以及顶 toast (`Last: Deer-17 died (predation). (4s ago)`) 与顶部 KPI bar 在 1366 / 1024 下垂直重叠遮挡 — 商业级感缺失明显。

锚点：商业 SaaS dashboard ≈ 9 / 排版 demo ≈ 1。当前位置约 **5.5**。视觉语言已经选好，但 **响应式 + 信息节奏** 未做完。

判定：**YELLOW**。无致命阻挡（核心控件全部可点击 / 状态可见），但完成度感与“成品 UI”的距离仍大；R3 必须修响应式 + 重复文本前才宜上架。

## D1 视觉层级

- 进入页面 1 秒：眼睛先看到居中标题 “Project Utopia” + Survive 蓝按钮 — 是对的（CTA 命中）。
- 进入游戏后 1 秒：注意力被 4 个区域同时抢 — (a) 顶部 KPI chip bar、(b) 顶部居中 Autopilot status pill、(c) 左下 Entity Focus 浮层、(d) 右侧 sidebar Build Tools 网格。**焦点元素 ≥ 4，已逼近 7±2 上限**。
- F-pattern：右侧 sidebar 的 Build Tools 是“按 grid 阅读”的；但左下 Entity Focus 同时是 list view，又同时和右侧 grid 共享屏幕中线的眼动 — 视觉上没有清晰的“主信息柱”。
- 装饰 vs 信息权重：顶部 KPI chip 都用相同 outline + 相同字号，导致 Food (304▼) 和 walls 0/8 视觉权重一致 — 实际上 Food 更紧要。**等权重 = 没有层级**。

## D2 排版与对齐

- spacing token 化：右侧 Build Tools 网格用 8px/12px 体系，OK。但顶部 KPI chip 之间间距与 Autopilot pill 不一致；Autopilot pill 外圈 padding 明显大于 chip。
- baseline：顶部 KPI 数字 `304` 与下方箭头 `▼` 不在同一基线 — 箭头偏下约 2px。
- panel 边距：右侧 Build sidebar `padding-left ≈ 24px`，左下 Entity Focus 浮层 `padding-left ≈ 12px`，**两个主面板用了两套 padding**。
- 数字格式：Food `304` vs Wood `47` 都是裸数 OK，但 `Food: -33/min` 与 `cons -27 / spoil -5` 同一行内有混用空格分隔 vs slash 分隔，节奏不一。
- 时间格式：顶部 `Run 00:01:03` (HH:MM:SS) vs 控制条 `1:03` (M:SS) vs `Day 2` — **同屏 3 种时间格式并存**。

## D3 信息密度

- AI Log 面板：`Director Timeline` 区域 9 条全是同一句话 `fallback-healthy rebuild the broken supply lane fallback` — 真实信号 = 1，重复 = 8。**应折叠为 “×9 last 80s”**。
- Decision Results 内嵌段落级文字（无 chip / 无 bullet 缩进），1 屏内挤了 ~120 个汉字 + 英文混排，密度过载。
- Colony 面板 Resources 进度条用 `0  | = 0.0/min (sampling…)` — `(sampling…)` 在每行重复，是装饰性占位，挤占有效信息。
- Population 面板的 `HERBS / COOK / SMITH / HERBALIST / HAUL` 全是 0 — 没有“暂未解锁”视觉降权，**全黑列表行造成 7 行视觉等权噪音**。

## D4 控件状态完整度（每个 panel 一栏）

| panel | default | hover | active | disabled | 缺失 |
|---|---|---|---|---|---|
| Build Tools 网格 (Road/Farm/Lumber/Wall…) | OK | 未检测到 hover 高亮 | Selected (Select 按钮蓝底) OK | Clinic 灰色 OK，**无 tooltip 解释为何禁用** | hover、disabled 原因 |
| Sidebar tabs (Build/Colony/Settings/AI Log) | OK | hover 仅 cursor 变化 | active 蓝边 OK | n/a | hover |
| Entity Focus 顶部 filter chips (All 19 / Hungry 4 / Idle 8…) | OK | 未见 hover 反差 | All 19 active 蓝底 OK | 0 计数项无降权（如 `Combat 0`） | hover、空状态降权 |
| 控制条按钮 (pause / play / fast / Autopilot toggle) | OK | hover 未见 | active 不明显（play 按下后无 pressed 视觉） | n/a | hover、active |
| 顶部 KPI chip bar | OK | n/a — 不可点 | n/a | n/a | 未声明可点击性 → 但鼠标在其上是 default 光标，OK |
| Help / shortcut 快捷键 chip | OK（kbd 风格 chip） | n/a | n/a | n/a | OK |
| Inspect 工具 (`?` / F1) | 未触发，无快照 | — | — | — | 未确认 |

**P1 漏洞：Build Tools 网格无可见 hover 反馈、Clinic disabled 无解释、控制条 play/pause active state 不明显。**

## D5 排版 bug 列表

| 严重度 | 描述 | 位置 | 截图 |
|---|---|---|---|
| P0 | 1024×768 顶 KPI bar `routes / depots / lumber / walls` 4 个 chip 被推出可视区右侧（被 sidebar 遮挡） | 顶部 KPI bar | 05-1024x768-game.png |
| P0 | 1366×768 toast 横幅 `Last: Deer-17 died (predation). (4s ago)` 与顶部 KPI bar 垂直重叠（z-order 互压） | 顶部中央 | 04-1366x768-game.png |
| P1 | AI Log → Director Timeline 9 条全是相同字符串重复，无去重 | 右侧 sidebar | 07-1920-ai-log.png |
| P1 | `Run 00:01:03` (HH:MM:SS) 与底部控制条 `1:03` (M:SS) 同时显示，时间格式不一致 | 顶部 + 底部 | 03-1920x1080-running.png |
| P1 | `Run started: Temperate Plains (96x72 tiles)…` 横幅 banner 在 1366 / 1024 都遮住了地图主区，且无关闭按钮 | 中左浮层 | 04 / 05 |
| P1 | Entity Focus 浮层与底部控制条在 1024×768 间距贴合（约 4px），无 padding | 左下 | 05-1024x768-game.png |
| P1 | `Cost: free` 和 `Selected Tool — Road` 大写不一致；其他面板用 Title Case，这处用 Sentence case 混排 | 右下 Construction | 03-1920x1080-running.png |
| P1 | 控制条 `Autopilot` 复选框旁的 `AI Log` 是按钮还是 label 不明（无 cursor / 无 hover） | 底部 | 03 |
| P1 | 顶部 KPI 箭头 `▼` 与数字 `304` 基线偏移约 2px | 顶部 | 03 |
| P2 | `(sampling…)` 在 Resources 每行尾重复 6 次 | Colony 面板 | 06-1920-colony-panel.png |
| P2 | Population 列表 5 个角色 (HERBS/COOK/SMITH/HERBALIST/HAUL) 全 0 但等权重显示 | Colony 面板 | 06 |
| P2 | Build Tools 网格图标 emoji 与文字混排（🪓 Lumber、🏛 Warehouse 等），与系统其余处“纯文字 chip”不一致 | 右 sidebar | 03 |
| P2 | 顶部 chip bar `routes 0/1`、`depots 0/1`、`lumber 0/3`：分母用 `/`，与 `Run 00:01:03` 的 `:` 分隔混用 | 顶部 | 03 |
| P2 | `Heat (L)` `Terrain (T)` `? Help` 三个垂直竖排 tab 字号 ≈ 11px，疑似低于 12px 最小阈值 | 右 sidebar 边 | 03 |
| P2 | "well-fed" / "a bit hungry" / "hungry" 颜色无差异，纯黑灰，状态语义未编码颜色 | Entity Focus | 03 |

## D6 分辨率测试

> **说明**：Runtime 指定测 1920×1080 / 1366×768 / 1024×768 三档；规范模板列了 6 档。我按 runtime 指令测了 3 档（决定性档位 — 大、中、小），其余 3 档的行为可由 1366→1024 之间梯度推断（基本保持线性收缩；问题集中在 ≤ 1366 段）。

### 1024×768
- 截图：`screenshots/A6/05-1024x768-game.png`
- 错位 / 溢出：
  - **P0** 顶部 KPI chip bar：`routes/depots/lumber/walls` 4 个 chip 被 sidebar 遮挡 / 推出可视区。
  - 左下 Entity Focus 浮层吃掉左下 1/3 屏，剩余地图区 ≈ 580 × 380px。
  - `Run started: …` banner 在中左压住地图。

### 1366×768
- 截图：`screenshots/A6/04-1366x768-game.png`
- 错位 / 溢出：
  - **P0** Top Toast (`Last: Deer-17 died`) 与顶部 KPI chip bar 垂直堆叠重叠，z-order 互压。
  - 顶 KPI bar：`farms 0/6` 已开始触碰 sidebar 左边缘；`lumber 0/3` 已被截。
  - Build Tools 网格：从 3-列降到 2-列 — 自适应正确，但失去“一屏看完”的视觉效率（10 个工具变 5 行）。

### 1920×1080
- 截图：`screenshots/A6/03-1920x1080-running.png`、`06-1920-colony-panel.png`、`07-1920-ai-log.png`
- 错位 / 溢出：
  - 无致命错位。
  - 但顶部 chip 和 Autopilot pill 之间留白巨大 (~280px) — “屏幕预算没用满” + “屏幕预算在小屏溢出”同时存在，说明 layout 是 fixed 而不是 flex / grid。

## D7 信息反馈完备性

- **toast** 存在（`Last: Deer-17 died (predation)`），但只有 4 秒后才显示 `(4s ago)`，没有动画 / 没有图标差异化（信息事件 vs 危险事件 vs 战斗事件视觉一致）。
- **背景事件**：Deer 死亡有 toast，但 “bandit raid”、“warehouse 建成”、“worker 饿死” 是否有 toast — 在测试 80s 内没观察到，**疑似 silent**（需 R3 主动触发验证）。
- **重要事件日志**：AI Log 是“director decisions”不是“player events log”，Chronicle 类历史事件入口未发现按钮。
- **toast 过载**：未观察到 1s 多于 1 条的情况（OK）。
- **toast 过早消失**：观察 17s 仍存在 `(17s ago)`，所以 dwell 时间 ≥ 30s — 不会过早消失，但可能**反向过载**（同一事件持续 30s 占顶 bar）。

## D8 可读性 / 可访问性

- 字号：主要面板 ≥ 12px；但右 sidebar 垂直 tab `Heat (L)` / `Terrain (T)` 视觉上 ≈ 11px，临界。
- 对比度：深蓝底 #0a1a2a 上的浅蓝文字 #6cc — 大文本 OK，小文字（如 `(sampling…)`）对比度堪忧，肉眼判断 < 4.5:1。
- 色盲安全：
  - "well-fed / a bit hungry / hungry" 三档**无颜色编码** — 纯黑灰文字，色盲安全（因为根本没用颜色）但同时也意味着**信息低带宽**。
  - Stable / Threat / Food rate 蓝绿色 chip — 红绿色盲下 “STABLE 绿” vs 任何潜在“CRITICAL 红” 会失真，**未观测到红色危险态截图，不能判定**。
- 文字与背景：CTA `Start Colony` 蓝底白字 — 高对比 OK。

## 自行扩展角度

### E1 — 输入方式差异
- 键鼠：完整覆盖（1-9 选工具、Space 暂停、L 热图、T 地形）— OK。
- 触屏：未做适配。Build Tools 网格 hit-target ≈ 96 × 36px，触控边缘临界（推荐 ≥ 44 × 44）。
- 键盘 only：tab 顺序未测，但 sidebar tab 不是 `<a>` / `<button>` 而是自定义 `data-sidebar-target` div？如果是 div + click，则键盘用户被锁。**P1 待 R3 主动验证 Tab/Enter 流程**。

### E2 — Modality 冲突
- 同时打开 Build Tools sidebar（右）+ Entity Focus 浮层（左下）+ 顶部 toast — 没有任何 modality 冲突机制；如果再叠加 Inspector（点击 worker 时），猜测会进一步压缩地图。**应有 “选中 worker 自动收 sidebar” 或 sidebar drawer 动画**。
- Help 面板（`?` / F1）未测试是否会全屏 modal — 如果是 modal，关闭按钮位置一致性未验证。

### E3 — 滚动 / 折叠
- AI Log → Director Timeline 9 条 + Decision Results 长段落 — 总体右 sidebar 会出现垂直滚动条；垂直滚动条样式默认浏览器灰色，与暗色主题反差大。**P2：需自定义 scrollbar 颜色**。
- Best Runs 列表：Splash 屏 7 条用了浏览器默认滚动条，同样问题。

## 改进优先级清单

### P0（影响关键操作）

1. **响应式断点缺失** — 1366 / 1024 下顶 KPI bar 内容溢出 / 被遮挡，玩家在低端笔记本 / 1080P 全窗口外的任何场景都无法看到全部资源 chip。
2. **Toast 与 KPI bar z-order 冲突** — 1366×768 下 `Last: Deer-X died` toast 直接遮住顶部 chip 数字。

### P1（影响完成度感）

3. AI Log Director Timeline 重复字符串 9 连击 — 改为 dedupe + count badge (`×9 last 80s`)。
4. 时间格式不统一（HH:MM:SS / M:SS / Day N 三套）— 统一为 “Day N · HH:MM” 单一格式。
5. Build Tools 按钮缺 hover 状态、Clinic disabled 缺 tooltip、控制条 play/pause 缺 pressed state — 控件状态完整度补齐。
6. `Run started: …` banner 在 1366 / 1024 遮地图，无关闭按钮 — 加 dismiss `×`，或改为 toast。
7. `Cost: free` Sentence case 与系统其余 Title Case 混排 — 统一文本风格。
8. Entity Focus 浮层与底部控制条贴合 — 至少 12px gap。
9. KPI 数字与 `▼` 箭头基线错位 2px — fix line-height / vertical-align。

### P2（细节）

10. `(sampling…)` Resources 行重复占位 — 折叠到 panel 头部状态指示。
11. Population 全 0 角色等权重 — 0 计数项 opacity 0.5 降权。
12. Build Tools emoji 图标与系统其余“纯文字 chip”不一致 — 统一图标语言。
13. 自定义 scrollbar 颜色匹配暗色主题。
14. `Heat (L)` 等垂直竖排 tab 字号 11px → 提升到 12px 或加粗。
15. Toast 不区分事件等级（info / warn / danger）— 加左侧 4px 颜色条。
16. 状态文字 (well-fed / hungry / starving) 加颜色 token（绿 / 黄 / 红）+ 图标 — 提升信息带宽。

## 结论

UI 不是“坏”，是“没做完”。视觉语言（颜色 / 字体 / spacing token）已经定型；**真正缺的是响应式 layout + 重复文本去噪 + 控件状态完整化**。这是 1-2 个工作日能闭环的工作量，不是结构性返工。

R2 verdict：**YELLOW**, score **5.5/10**。R3 修完 P0 + 至少 4 个 P1 即可升 GREEN（预估 7.0+）。
