---
reviewer_id: 01c-ui
review_date: 2026-04-25
build_url: http://127.0.0.1:5183/
viewport_tested: [1920x1080, 1024x768, 800x600, 1366x768, 2560x1440]
screenshot_dir: assignments/homework6/Agent-Feedback-Loop/Round6/Feedbacks/screenshots/01c-ui/
---

# 外部评测：UI 呈现 — Project Utopia

## 总体评分：**3 / 10**

一句话总结：作为一款付费商业级殖民地模拟产品，Project Utopia 的 UI 呈现仍然停留在“开发者调试面板”而非“成品游戏”阶段——视觉语言混乱、信息层级失衡、响应式严重崩坏、3D 渲染干瘪、并伴随多处明显的层叠/穿帮 bug。

---

## 第一印象（Boot Splash → 进入游戏的 30 秒体验）

打开页面后我看到的是一块深蓝/深绿色的暗色背景，中央漂浮着一个圆角矩形 modal，标题 “Project Utopia” 用了亮蓝色（#3a8fd6 风格），下面一段灰色描述文字“Reconnect the west lumber line, reclaim the east depot, then scale the colony.”。这块启动卡片的设计本身**还算干净**——但仅止于此：

- 启动卡有一段“First pressure / First build / Heat Lens / Map size”的四行说明文本，密密麻麻挤在一个内嵌灰色框中，行距偏小，灰色字 `#9aa…` 在深色背景上对比度偏低（目测约 4.0:1，刚好低于 WCAG AA 4.5:1 的正文阈值），扫一眼相当费眼。
- 模板下拉框（Temperate Plains / Rugged Highlands / …）和 Map Size 数字框是**纯原生 HTML 控件**，浏览器默认外观直接暴露——没有自定义 chevron、focus ring、hover 高亮，跟周围的圆角扁平卡片风格完全脱节。这是付费产品里非常致命的一种“下沉感”。
- 三个底部按钮（Start Colony / How to Play / New Map）只有 Start Colony 是亮蓝填充，其余两个是同色边框幽灵按钮。视觉权重还算合理，但圆角半径不一致（Start Colony 看起来圆角更大），左右两侧也没有 8pt 网格对齐的痕迹。
- 图标层面：splash 完全没有 logo/品牌图形，只有文字标题。进入游戏后 topbar 用的是低分辨率像素图标（看上去像 8x8 / 16x16 的 pixel sprite），与 build menu 里的 emoji-like 矢量图标（farm 是一个🌾意象、smithy 是锤子）混搭——两套图标体系打架，**完全没有统一的图标设计语言**。

进入游戏后第一印象——**信息密度爆炸 + 视觉层级近乎全失**。屏幕上同时出现：左上角资源条、顶部中央剧本提示、顶部右侧 autopilot 状态、右上角“Why no WHISPER”技术性 fallback 字段、左下角 Entity Focus 列表、底部居中播放控件、右侧 7 个垂直 tab、又下方一闪而过的“Selection cleared.”绿色 toast。这就是典型的“把所有 dev tooling 都堆到屏幕上”的开发态，**没人替玩家做减法**。

截图：`screenshots/01c-ui/01-boot-splash-1920b.png`、`02-game-start-1920.png`。

---

## 信息架构

### 1. 顶部 HUD（Topbar）
顶部 HUD 一行塞下 8+ 类信息：5 个资源数字（食物 / 木 / 石 / 草药 / 工人）、剧本标题与一句长达 80 字的副标题、生存计时器、Autopilot 状态胶囊、Why no WHISPER 调试信息、右上角 ☰ 折叠按钮——**全部挤在 ~30px 高度内**。

问题：
- 资源数字（210, 4, 1, 0, 13）和图标都很小，距离屏幕 60cm 几乎读不出来；这是策略类游戏 HUD 的最致命缺陷——**核心数字应当是最显著的信息**。RimWorld 的资源条字号通常是 13–14px 加粗、Factorio 的则是清晰的 14px 等宽数字，本作目测只有 ~11px。
- 中间剧本副标题 “Reconnect the west lumber line, reclaim the east depot, then scale the colony.” 居然是这一行的视觉重心（最长、最居中），但它对正在玩的玩家几乎没有任何运营价值——这是玩家**只需要看一次**的引导文本，却天天霸占 HUD 黄金位。
- “Why no WHISPER?: LLM never reached / No policy yet / LLM quiet — fallback steering” 这种**显然是给开发者看的字符串**直接出现在右上角玩家视野里，没有折叠/隐藏，是商业产品绝对不可接受的。
- Autopilot 状态在“Manual control / ON - rule-based / ON - llm/fallback / off / errored (error)”几种状态间切换，文字直接截断（Round 5 的截图 1024 viewport 下只剩 “Autopilot off. Manual contro”）。文案过长且没有 ellipsis 视觉处理。

截图：`02-game-start-1920.png`、`20-resize-1024-768.png`（这里 “Manual contro” 被切了一半）。

### 2. 右侧 Tab 栏（Build / Colony / Settings / Debug / Heat / Terrain / ? Help）
右侧采用纵向标签条，标签文字是**逆时针 90° 旋转**（“Build” 字侧躺）。这种设计有两个明显败笔：
- 标签条 7 项 + 实际面板内容拼出一个非常笨重的“竖向工具墙”，宽度占据约 22% 视口。
- 标签是“切换”的（点 Settings 显示 Settings 内容），但**“折叠”逻辑非常迷惑**：关闭面板要按右上角 ☰，重新打开后再点 tab 才显示——这套交互在 1024×768 下还会偶发把整个面板挤压到不可用。
- 多次实测中，发现点击 Settings 标签**有时并不切换内容**——点了之后右侧面板立刻关闭/隐藏，需要再次点击或用键盘配合才能看到 Settings 内容（截图 `15-settings-real.png`）。这是显著的状态机 bug。
- 进入 Settings 后看到的是“Map & Doctrine”、“Role Quotas”（6 个滑块：Cook 8 / Smith 8 / Herbalist 8 / Haul 8 / Stone 8 / Herbs 8）和 “Save / Replay”，**总共三个分组**。商业级模拟游戏的设置面板（Oxygen Not Included、Frostpunk）至少包含：图形、音频、键位、自动保存、UI 缩放、可访问性、语言——本作几乎全部缺席。

截图：`28-help-controls.png`（Settings 面板完整展开）、`15-settings-real.png`、`11-settings-panel.png`。

### 3. 左下角 Entity Focus 列表
列表用紧凑的等宽字体 “Mose Keane · FARM · Seek Task · hungry” 一行表达 4 类信息：名字、角色、状态、饱腹度。问题：
- 状态用纯文本（“Seek Task / Deliver / Process / Eat / Idle”），没有任何颜色编码、icon、或者图形指示器。10 个角色有 4-5 个并发状态时，玩家只能逐行阅读。
- “hungry / peckish / well-fed / starving” 是饱腹度的语义文字——但这种 ordinal 信息**最适合用横向 mini-bar 或颜色 chip**，文字只是退化方案。
- 列表下方有一个超小的 “Backstory: woodcutting specialist, efficient temperament” 的角色档案——文本拥挤、没有头像、没有美术形象。RimWorld 在这里会有人物 portrait / equipment / health bar 等丰富信息，本作只是干瘪两行字。

截图：`19-entity-focus.png`、`24-colony-detailed.png`。

### 4. 底部 Transport 控件
底部居中的 ▶ ⏸ ⏩ Autopilot AI Log 时间码——这是少数我**赞同**的设计：浮动胶囊、阴影、按钮大小够大、状态可见。但与整体风格脱节——这一行用的是更现代的 macOS 风格圆角 + soft shadow，旁边的 sidebar 却完全是 Discord 式深色平面卡，两种语言碰在一起。

---

## 视觉设计（颜色、字体、风格）

### 配色
- 主色：亮蓝 `#3a8fd6`（按钮、链接、tab 高亮）。
- 危险/警告：橙黄（autopilot 提示条）+ 红（Insufficient resources）。
- 状态绿：用于 STABLE 标签和 Autopilot 提示。

颜色一致性问题：
- “STABLE” 标签是亮绿色填充黑字，看起来**廉价**——商业游戏一般会用更暗的祖母绿 + 更柔和的暖色字体。
- “Autopilot ON - rule-based - n / Autopilot ON - llm/fallback” 这种橙色 pill 在深色 HUD 上配纯白字，对比度极强、视觉上**抢戏到几乎刺眼**——而且 “n” 这个字符显然是文本被截断后留下的残尾，是 bug。
- 红色 toast “Insufficient resources.” 直接堆在左下角 Entity Focus 列表底部，没有 icon、没有动画、没有缓出，看起来像是 console 错误（截图 `20-resize-1024-768.png`）。

### 字体与可读性
- 我数到至少 4 套字体在用：（a）topbar 资源数字（~11px 系统 sans-serif）、（b）模板下拉/spinbox（浏览器原生）、（c）Build Tools 按钮（~13px sans-serif，加粗）、（d）热力图“halo / supply surplus / input starved” pill（看起来是 Inter / Helvetica，偏细）。各处缺乏 type scale 规范。
- 屏幕远处可读性？基本不行。我把窗口放到 1920×1080 在 27" 屏幕模拟距离 1m 观察，topbar 资源数字几乎只能看到模糊光块。这点上 Factorio（大粗体白字 + 黑描边）和 RimWorld（粗体 16px）都吊打本作。
- 浅色字白背景：Help 模态框内部（“Resource Chain”等）用蓝标题 + 浅灰正文 + 白底深背景——对比度 OK，但段内小字 “(2× hunger recovery)” 等小括号说明字号 ~11px 在普通显示器上很费眼。

### 图标设计
- Build Tools 面板里 Farm/Lumber/Warehouse/Wall/Bridge/Quarry/Herbs/Kitchen/Smithy/Clinic 共 10 个建筑图标——彼此风格**勉强统一**（都是浅色简笔几何 + 单色背景），但缺乏视觉重量：远看几乎只能看到白色亮块，靠图标识别建筑非常困难。
- 资源条的 5 个图标（食物/木/石/草药/工人）是另一套：偏 pixel-art 风格，又跟 build 面板的卡通图标不一致。
- 没看到任何**自定义 cursor、自定义 select chevron、自定义 scrollbar**——所有交互的“微观元素”都是浏览器默认。这是商业游戏不可接受的。

### 整体风格
"暗色调 + 蓝 accent + 一点 emoji-style 图标" 的这种风格本身可以做出来，但要做出**一致性**才能打动人。本作把 splash 的优雅 modal、HUD 的 dev string、Build 的卡通建筑图标、3D 场景的 low-poly 平铺地形、底部 transport 的 macOS-pill——全揉在一起，**没有视觉锚点**。

---

## 交互反馈（hover / click / focus / animation）

- **悬停反馈**：在 Build Tools 上 hover Farm 时，左上角弹出一个**真正普通**的纯文本 tooltip “Farm (2) — produce food, cost: 5 wood. Place near soil-rich tiles; you'll need 3 before you can afford a Kitchen.”——白底黑字，完全没有自定义样式（截图 `28-help-controls.png` 左上）。这是浏览器默认的 title attribute 渲染或者非常接近的 fallback，是商业游戏不能接受的。
- **选中状态**：点 Lumber 后按钮换成蓝色填充（截图 `18-fortified-basin.png` Lumber 选中态）。OK，但只是颜色变化，没有光晕、没有图标变化、没有 micro-animation。
- **点击反馈**：按钮按下没有 active state（深一档/缩小），只有静态颜色切换。
- **Toast 反馈**：成就 toast “First Smithy lit: Stone + wood → tools is online.” 等出现在左下角，用一个小的浅绿色填充 chip——但**没有动画**，只是直接显示/消失，玩家很可能看漏。
- **键盘可达性**：F1 打开 Help、L 切换 Heat lens、T 切换 Terrain，键盘绑定是有的；但没有 focus ring，Tab 键导航完全无法使用——任何用屏幕阅读器或键盘玩家都无法进入。
- **3D 场景里的 worker 选中**：我多次尝试在地图上 click worker，都没有触发任何 highlight；只能从左下角 Entity Focus 列表里点选。这意味着“click any worker/visitor/animal” 的提示是**虚假承诺**。

---

## 3D 呈现

打开后画面给的是**俯视近 2D 投影**，并不是真正的 3D 视角——所有地形、建筑、生物都是平铺的小 sprite/平面。我很难称之为“Three.js 3D 场景”，更像是 Three.js 当作 2D canvas 在用。

- **地形**：水域是漂亮的扁平蓝色 hatched pattern（细斜线纹理），草地是柔和的绿色，山地是棕色。整体画面在远观时**像一张色块拼图**——没有高光、没有环境光遮蔽、没有 shadow casting，明显单光源/无光源。
- **建筑**：Farm/Lumber/Warehouse 等建筑是 6×4 像素左右的小色块（红色农田、棕色木屋、灰色石屋），近距离看糊成一片，没有屋顶细节、没有体量层级（截图 `02-game-start-1920.png` 中央城镇区）。
- **角色模型**：worker 是 ~3px 高的小色斑，只在 zoom-in 时偶尔能看到“小人”轮廓——没有动画帧、没有装备显示、没有 emote。RimWorld 的小人有自己的衣服色、武器、动作；ONI 的角色更夸张地表情丰富。本作是**完全无角色识别**。
- **光影**：完全是 unlit 平面着色，毫无氛围感。日夜循环？没看出来；天气？只在 Heat lens 时看到 “halo / supply surplus” 的弹出 chip。
- **动画**：worker 是在地图上滑行的小点，没有 walk-cycle，没有缓动——纯线性平移。砍树、建造、运输的视觉化几乎不存在，玩家只能从 entity list 文字里看到“Process / Deliver / Seek Task” 状态。
- **3D 与 UI 协调**：3D 场景**没有任何遮挡处理**——HUD 直接覆盖在场景上，热力图“halo”/“supply surplus” 的标签**直接画在场景中心**，把建筑遮个严严实实（截图 `05-heat-lens.png`）。这是非常初级的"叠 div" 做 UI overlay，不是真正用世界坐标 anchor 的 sprite-text。
- **重叠 Bug**：scenarios 中的 “west lumber route”/“east ruined depot”/“north timber gate”/“south gate”/“south granary” 等地名标签**会重复堆叠**——同一个地点出现 4 个 “west lumber route” 标签（截图 `08-help-modal.png`、`27-splash-1920.png` 中 “north timber gate”/“north gate” 完全互相挤压）。这是 z-order 与 dedup 都没做。

截图：`02-game-start-1920.png`、`05-heat-lens.png`、`16-archipelago.png`（archipelago 有水陆边缘，相对好看一些）、`27-splash-1920.png`（标签重叠）。

---

## 具体缺陷清单（带 screenshot 描述）

| # | 截图 | 问题描述 | 严重度 |
|---|---|---|---|
| 1 | `02-game-start-1920.png` | Topbar 资源数字 ~11px，远距离不可读；中间挤一段 80 字 scenario 副标题 | 高 |
| 2 | `02-game-start-1920.png` | 右上角 “Why no WHISPER?: LLM never reached” 是 dev 调试字段直接暴露给玩家 | 高 |
| 3 | `05-heat-lens.png` | 热力图 “halo / supply surplus / input starved” 标签直接覆盖建筑，无 anchor / 无半透明背景 | 高 |
| 4 | `08-help-modal.png`、`27-splash-1920.png` | 同一地名标签（west lumber route / north timber gate）多重叠加，dedup 失效 | 高 |
| 5 | `15-settings-real.png` | 点 Settings tab 不能可靠切换内容，需要二次点击 / 折叠重开 | 高 |
| 6 | `20-resize-1024-768.png` | 1024×768 时 “Autopilot off. Manual contro” 文字被截断没有 ellipsis | 中 |
| 7 | `21-resize-800-600.png` | 800×600 时整个右侧 sidebar、底部 transport 全部消失，UI 完全不可用 | 高 |
| 8 | `23-resize-2560-1440.png` | 2560×1440 高分屏字号未 scale，topbar 文字在 27"+ 屏几乎不可读 | 中 |
| 9 | `28-help-controls.png` 左上 | Hover Farm 后弹出的 tooltip 是浏览器默认 / 几乎默认样式，无设计 | 高 |
| 10 | `19-entity-focus.png` | Entity Focus 列表用纯文本编码 worker 状态，无颜色 / icon / portrait | 中 |
| 11 | `13-settings-content.png` 等 | 启动卡 Template 下拉、Map Size 数字框是浏览器原生控件 | 高 |
| 12 | `09-help-dialog.png` | Help 模态框 Tabs 设计算合格，但内部小字 (~11px) 易疲劳 | 低 |
| 13 | 全部 | 没有任何自定义 scrollbar、cursor、focus ring | 中 |
| 14 | 全部 | 角色无 portrait、worker 在 3D 视图中无识别，"click worker" 在地图上无效 | 高 |
| 15 | 全部 | 没有日夜循环 / 天气视觉变化 | 低 |
| 16 | `24-colony-detailed.png` | “AI proxy unreachable (timeout). Running fallback mode.” 红色错误条直接堆在 entity list 下 | 高 |
| 17 | `30-help-controls-tab.png` | URL 突然出现 `?template=fertile_riverlands` / `?template=fortified_basin`，貌似 sidebar 操作错误地修改了路由（多次复现） | 高 |

---

## 响应式测试

| Viewport | 表现 | 评级 |
|---|---|---|
| 1920×1080 | Baseline 设计目标。Topbar 文字小、信息密度高，但布局完整。 | ⚠️ 勉强可用 |
| 1366×768（主流笔记本） | sidebar 折叠掉了 panel 内容；topbar 字体未压缩，scenario 副标题被 ... 截断；entity list 占据左下三分之一画面。 | ❌ 不达标 |
| 1024×768（旧分辨率/平板） | Autopilot 文本被切，sidebar panel 占去近 30% 宽，画面被挤；hover Tooltip 弹出位置出错（左上角角落）。 | ❌ 不达标 |
| 800×600（极端） | 右侧 sidebar tab、底部 transport 全部消失；整个 UI **变成了一张空地图**——玩家除了 zoom 与拖拽几乎无法操作。 | ❌ 完全崩坏 |
| 2560×1440（高分屏） | 字号未 scale，topbar、entity list、settings 全部缩成超小尺寸；UI 没有 “xl” breakpoint。 | ❌ 不达标 |

商业 strategy 游戏的最低 baseline 应当是 1366×768（ thin laptop）和 1920×1080，本作只在 1920 单一档位下勉强 OK，**且没有任何 viewport-aware UI scaling** —— Cities: Skylines / Frostpunk 都有专门的 UI Scale 滑块。

截图：`20-resize-1024-768.png`、`21-resize-800-600.png`、`22-resize-1366-768.png`、`23-resize-2560-1440.png`。

---

## 与 RimWorld / Factorio / Oxygen Not Included 对比

| 维度 | RimWorld | Factorio | Oxygen Not Included | Project Utopia |
|---|---|---|---|---|
| HUD 信息层级 | 资源条 + alert 队列 + 角色队列 三段清晰 | 顶部资源条 + 任务条 + 提示 | 资源条 + 列出气体/液体细分 | 资源条 + 一坨 dev string |
| 字体可读性 | 14–16px 粗体白字带描边 | 14px 等宽数字 | 13–14px sans-serif | ~11px 普通 sans，无描边 |
| 角色 portrait | ✅ 高质量像素肖像 | N/A（机器） | ✅ 卡通头像 | ❌ 完全没有 |
| 自定义图标体系 | ✅ 像素风一致 | ✅ 等距视图统一 | ✅ 卡通统一 | ❌ 多套图标混搭 |
| Hover Tooltip | ✅ 自定义皮肤、含状态、含 hotkey | ✅ 极其详细，含数值预览 | ✅ 多段、含因果链 | ❌ 类浏览器默认 |
| 3D / 美术 | 顶视图 2D，角色动画丰富 | 顶视图 2D，机械动画 60Hz | 侧视图 2D，丰富表情 | 顶视图“伪 3D”，无动画 |
| 响应式 | 桌面专用 + UI 缩放 | UI 缩放 | UI 缩放 + 多分辨率 | 仅 1920 单挡 |
| Settings 深度 | 图形/音频/键位/玩法/可访问性 | 同上 + mod 管理 | 同上 + UI 缩放 | 仅 Role Quotas + Save |

简言之：本作在每一个传统模拟经营 UI 的维度上都明显落后业界 5–8 年。

---

## 改进建议（按 ROI 排序）

### 高 ROI（必须做）
1. **删除所有 dev 字符串**：Why no WHISPER、AI proxy unreachable、AI Storyteller (DRIFT autopilot) 这些都搬到 Settings → Debug 面板，正常玩家根本不该看到。
2. **重构 topbar**：把 scenario 长副标题挪到 Mission/Quest 侧栏；资源数字加大到 16px、加粗、加金色描边；保留 5 个核心资源 + 时间 + Threat 即可。
3. **统一图标体系**：选定一套（建议简笔卡通或 pixel-art），重画所有资源、建筑、角色 icon，保证 line-weight、palette、风格一致。
4. **修响应式**：至少 1366×768 / 1024×768 / 1920×1080 / 2560×1440 四档 layout；800×600 直接降级为 portrait splash 提示用户调大窗口。
5. **修可见 bug**：地名标签 dedup、Settings tab 状态机、autopilot 文本不该被截断、URL 不该被 sidebar 操作误改。

### 中 ROI
6. **替换浏览器原生控件**：自定义 select、spinbox、slider、scrollbar；这是付费产品的最低门槛。
7. **加 UI Scale 滑块**：让玩家能在 0.8x – 1.4x 调节字体与控件大小。
8. **Hover Tooltip 自定义**：深色卡片、含图标、含 keybind、含数值变化预览（参考 Factorio）。
9. **Worker portrait + 详细面板**：每个 colonist 至少有头像、状态条、健康/饥饿/疲劳 mini-bars，3D 视图里点小人能选中并高亮。

### 低 ROI（lover-priority polish）
10. **加 micro-animation**：button press、toast slide、tab transition 都加 ~150ms 缓出。
11. **加日夜循环 + 季节色调**变化；环境光让 3D 场景活起来。
12. **加 boot loader 动画**：一段 1–2s 的 logo 揭示 + 加载进度条，比直接弹 modal 高级。

---

## 结语

我作为一个**第一次见到这款游戏**的外部玩家，在浏览器里花了大约 10 分钟探索它的 UI——结论是：**它今天还不能作为收费产品发售**。问题不在于功能（功能其实很多——热力图、AI 自动驾驶、政策面板、role quota 滑块等），而在于呈现：每一个面板都像是开发者顺手写出来的 placeholder UI，从未经过任何美术 / UX 抛光迭代。响应式从 800 到 2560 区间几乎没有适配，3D 场景空有 Three.js 但无任何 3D 美术内容，hover tooltip 是默认浏览器渲染，dev 字符串直接穿到玩家屏幕上。

如果按照 Steam 早期访问 (Early Access) 的尺度看，本作大约在 0.3 alpha 的水平；如果按照已上架付费游戏的 1.0 标准看，**远远没到出货门槛**。

最终评分：**3 / 10**——给到 3 分而非更低，是因为：
- splash modal 的视觉还算干净；
- Help 弹窗的 tab 切换本身合格；
- 底部 transport pill 有现代感；
- 地图 archipelago 视图水陆色彩有美感；
- F1 / L / T 的键盘快捷键体系是有规划的，开发者意识到要做 expert UX。

但这点亮色无法掩盖 HUD 信息架构、视觉一致性、响应式、3D 呈现、交互反馈五大维度的全面欠缺。

---

**截图清单（共 30 张）：**
- 01-boot-splash-1920b.png — 启动卡片
- 02-game-start-1920.png — 进入游戏第一画面
- 03-colony-panel.png — Colony 信息面板
- 04-after-navigate.png — 重启后状态
- 05-heat-lens.png — 热力图开启时 halo 标签覆盖建筑
- 06-settings-panel.png / 06b-after-restart.png — sidebar 收起
- 07-help-modal.png — esc 关 modal 后
- 08-help-modal.png — 多个地名标签重叠
- 09-help-dialog.png — Help 模态框 Resource Chain tab
- 10-settings-actual.png — Settings tab click 异常表现
- 11-settings-panel.png — Settings panel 收起后空白
- 12-settings-shown.png — toggle ☰ 后回到 splash
- 13-settings-content.png — 不同 template 启动
- 14-current.png — fertile_riverlands template
- 15-settings-real.png — 点 Settings 仍展示 Build 内容
- 16-archipelago.png — Archipelago Isles 模板
- 17-archipelago-overall.png — 全图浏览
- 18-fortified-basin.png — Fortified Basin + Lumber 选中
- 19-entity-focus.png — Entity Focus 列表
- 20-resize-1024-768.png — 1024×768 文本截断
- 21-resize-800-600.png — 800×600 整个 UI 崩坏
- 22-resize-1366-768.png — 1366×768 sidebar panel 收起
- 23-resize-2560-1440.png — 2560×1440 字体未 scale
- 24-colony-detailed.png — Colony 资源/Population 列表
- 25-ai-log.png — AI Log toggle
- 26-debug-panel.png — Debug panel toggle
- 27-splash-1920.png — Hollow Keep + 多重地名重叠
- 28-help-controls.png — Settings 完整展开 (Map & Doctrine + Role Quotas + Save/Replay) + Farm tooltip
- 29-help-tabs.png — north timber gate 标签三层重叠
- 30-help-controls-tab.png — Node Health overlay 全图视图
