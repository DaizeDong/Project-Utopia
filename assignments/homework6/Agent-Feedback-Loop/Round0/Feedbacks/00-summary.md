# Project Utopia — 外部玩家评测汇总报告

> **评测日期**：2026-04-22
> **评测版本**：v0.8.1 "Phase 8 Survival Hardening"
> **评测方式**：5 个独立外部玩家 subagent 通过浏览器（Playwright）实际游玩，**全程未读源代码与项目文档**
> **评测立场**：默认成品商业游戏标准，严苛、毒舌、不留情面

---

## 一、综合评分一览

| # | 维度 | 评分 | 评测文件 |
|---|------|------|----------|
| 1 | **引导性** Onboarding（重要） | **2 / 10** | [01-onboarding.md](01-onboarding.md) |
| 2 | **可玩性** Playability（重要） | **3 / 10** | [02-playability.md](02-playability.md) |
| 3 | **UI 呈现** | **3.5 / 10** | [03-ui.md](03-ui.md) |
| 4a | **游戏机制呈现** | **2 / 10** | [04-mechanics-content.md](04-mechanics-content.md) |
| 4b | **游戏内容丰富度** | **3 / 10** | [04-mechanics-content.md](04-mechanics-content.md) |
| 5 | **创新性** | **2.5 / 10** | [05-innovation.md](05-innovation.md) |

**综合均分：约 2.67 / 10**（六个子项平均）

**共同一句话**：这不像一款游戏，更像一台在浏览器里跑的、未关调试模式的殖民地模拟引擎 — 引擎本身工程上扎实，但玩家体验从第一秒就完全崩坏。

---

## 二、五位评测者的核心结论

### 评测者 1（引导性）· **2/10**
> "这不像一款游戏，更像一个开发者忘了关调试模式就把测试服务器链接分享出来的东西——任何付费玩家会在 10 分钟内关闭标签页并要求退款。"

核心指控：**零教程 / 零 tooltip / 零总结页 / 错误提示稍纵即逝 / FSM/A\*/RNG 调试信息当玩家 UI / Settings 充斥开发参数 / 场景目标藏在 Dev Trace 里 / 失败后无缝跳地图 / UI 响应式在非 1920×1080 下崩溃。**

### 评测者 2（可玩性）· **3/10**
> "后端模拟深到失控、前端玩家体验瘫到不存在——玩家点击地图不给反馈、AI 全权托管劳动、Settings 混入世界生成滑条、核心决策几乎不存在；它更像一个套了 UI 的 benchmark sandbox 而非游戏。"

核心指控：**玩家 agency 极低（AI 全权托管） / 点击地图无反馈 / 决策深度 1/10 / 心流 0/10 / 反馈循环 2/10 / 没有紧张-解决-满足的正循环。**

### 评测者 3（UI 呈现）· **3.5/10**
> "一个明显'工程师自用调试台'气质极重的模拟器原型，信息全但毫无美术把控，在成品商业游戏的标尺下属于'勉强能玩、完全不能卖'的状态。"

核心指控：**顶栏 10 个图标挤成一行且无 tooltip / 警报与普通消息共用截断 banner / Settings 里塞满 20+ 开发者 slider / Debug 面板直接暴露 AI 调度文本 / Heat Lens 按钮点亮但地图零视觉反馈 / 800×600 下顶栏被切出屏幕 / 地图缩到最远外围是裸露深蓝背景 / 建筑与角色 sprite 辨识度极低 / 无 3D 光影/昼夜/天气表现。**

### 评测者 4（机制+内容）· **2/10 + 3/10**
> "底层宣称的 15 套 ECS 系统 / 分层 AI / 天气 / 土壤 / raid 几乎全部对玩家不可见（Developer Telemetry 六个面板五个永久 `loading...`），而 UI 暴露的清单只有 11 建筑 / 7 资源 / 4 生物 / 1 实测事件——离 RimWorld、DF 有 1–2 个数量级差距。"

核心指控：**Telemetry 面板 5/6 常驻 loading / 资源无速率显示 / Heat Lens 点了无可见变化 / 事件日志空 / Tile hover 不给具体数据 / 内容密度约为 RimWorld 的 5-10%、DF 的 1-3%。**

### 评测者 5（创新性）· **2.5/10**
> "A well-engineered simulation kernel in search of a game." —— 一颗写得不错的模拟内核，还在找自己要成为的那款游戏。

核心指控：**玩法清单几乎是 RimWorld 的减法版 / LLM 驱动 AI 这个最大卖点默认 `off / fallback`（`/health` 返回 500） / 工人叫 Worker-10/26 没有名字故事 / 无音乐无音效 / 无科技树无解锁无胜利条件 / 地图模板视觉几乎无差异。加的 0.5 分留给 Supply-Chain Heat Lens 和 Entity Focus 对 AI 影响的可解释性这两点少见的"有思想"设计。**

---

## 三、五位评测者达成的**共识性缺陷**

以下问题被 **3 位及以上评测者独立发现**，属于游戏当前最顶级的阻塞项：

### 共识 1：**Developer Telemetry / Debug 面板直接暴露给玩家** （5/5 评测者提到）
- FSM 状态、策略权重、A\* 路径、RNG state、tick 率、grid version、Terrain tuning 全部裸露
- Debug 面板在某些分辨率下还会**拦截 pointer 事件**，挡住正常按钮
- 5/6 的 Telemetry 子面板挂在 `loading...` 永不加载
- **对玩家的观感是"这游戏没做完就被上线了"**

### 共识 2：**资源/图标无 tooltip、无颜色预警、无速率** （4/5）
- 10 个顶栏资源图标 ~16px、全灰白、无 `title` / `aria-label`
- `Food 12` 从不会变成 `Food 12 ▼ −3.2/s`
- `Prosperity 49` / `Threat 30` / `Dev 50/100` —— 玩家永远猜不出阈值方向
- 低资源时无红底警告、无闪烁、无声音

### 共识 3：**点击地图零反馈 / 错误提示稍纵即逝** （4/5）
- 资源不足建造失败时：顶部一闪的绿/红 banner 2 秒后消失
- 没有光标红叉、没有建筑闪红、没有音效
- 玩家会直接认为"游戏坏了"

### 共识 4：**Settings 面板塞满开发者调参滑条** （4/5）
- Target Farmer Ratio、Sim Tick Hz、Water Level、River Count、River Meander、Mountain Bias、Island Bias、Road Density、Settlement、Wall Mode、Ocean Side……
- 玩家想找的音量/全屏/画质/快捷键**一个都没有**
- 地图生成参数应该仅在 "New Map" 流程里出现

### 共识 5：**核心卖点 LLM AI 默认不工作** （2/5 但由创新性评测者深挖 debug 确认）
- `AI Mode: off / fallback (unknown, -)`，`model: fallback`，`source: fallback`
- 健康检查端点 `/health` 返回 HTTP 500（首次加载 console 就能看到）
- 所有 AI I/O 精巧架构玩家感知为零

### 共识 6：**工人/单位 Entity Focus 是开发者文档而非玩家工具** （3/5）
- 点开一个工人看到的是：`FSM: current→seek_task prev→idle | Policy Influence: applied=false | topWeight=1.60 | Path: idx=0/11 | next=(48, 36)`
- 没有 RimWorld 式的 Name / Role / Hunger bar / Current Task / Recent Events
- 工人名字叫 `Worker-26`（没有名字、背景故事、肖像）

### 共识 7：**Heat Lens 按钮点了无可见变化** （3/5）
- "Pressure lens restored." toast 之外，地图上零 overlay
- 这是典型的"交互承诺不兑现" —— 比没这按钮更伤玩家信任

### 共识 8：**响应式布局在 1366×768 以下完全崩坏** （2/5，但严重度高）
- 800×600：Settings/Debug/Heat Lens 按钮被切出屏幕
- 600×900 竖屏：资源图标只剩 5 个，Build 面板铺满屏
- 1024×768：顶栏文字 "Emergenc…" / "Supply-…" 全部省略号

### 共识 9：**死亡/失败无总结页，直接踢回换地图** （3/5）
- 没有 "You survived 03:12 / Final Score 175 / 12 workers died of starvation"
- 没有重试按钮、没有死因统计、没有"再来一局同种子"
- 玩家会不知道自己刚才发生了什么

### 共识 10：**内容密度与宣称严重不符** （2/5，但关键）
- 宣传 15 套系统 / 10 项环境层（elevation/moisture/soil/salinization/fog/seasonal weather/drought wildfire/fatigue/spoilage/road wear）
- 玩家实际能感知的：**2 层（terrain + water）**
- 建筑 11 种（RimWorld 150+）/ 资源 7 种（RimWorld 30+）/ 生物 4 类（RimWorld 80+）/ 实测事件 1 个（RimWorld 单年数十个）

---

## 四、具体场景复现列表（跨评测者合集）

| 场景 | 玩家期望 | 实际发生 | 严重度 | 来源 |
|------|---------|---------|--------|------|
| 第一次打开游戏 | 主菜单/教程/剧情介绍 | 弹出含 `SEED 1337` 调试字串的小卡片 | 致命 | 1 |
| Hover Food 图标 | tooltip "食物由农场产出" | 无任何显示 | 致命 | 1, 3, 4 |
| Hover Farm 按钮 | tooltip 说明造价和规则 | 无，必须先点击 | 严重 | 1, 3 |
| 点击空地造 Farm（木不够） | 建筑或给出明确拒绝 | 顶部飞字 2 秒消失 | 严重 | 1, 2 |
| 点击工人 | 工人面板（任务、需求、心情） | 10 行 FSM + Policy 调试输出 | 致命 | 1, 3, 5 |
| 按 H / ? / F1 | 帮助菜单 | 无响应 | 严重 | 1 |
| 点击 Settings | 音量/画质/快捷键 | 50+ 地形生成滑条 | 致命 | 1, 2, 3, 4 |
| 食物降到 0 | 弹窗 / 红闪 / 声音 | 图标背景变红，无人注意 | 严重 | 1, 2 |
| 工人死亡 | 死亡动画 / 通知 | 人口数字默默 -1 | 严重 | 1, 2, 5 |
| 所有工人死亡 | 总结页 + 重试 | 静默回主菜单，换个地图 | 致命 | 1 |
| 按 L 切 Heat Lens | 地图上出现热力 overlay | 按钮点亮但地图完全无变化 | 严重 | 2, 3, 4 |
| "侦查未探索区域" | 给 Scout 工具 | Build Tools 里没有这个工具 | 致命 | 1, 2 |
| 切换地图模板 | 卡片/缩略图/难度说明 | 只换名字和一行描述 | 严重 | 1, 5 |
| 缩放到最远 | 小地图/边框/vignette | 裸露深蓝 body 背景 | 严重 | 3 |
| 800×600 分辨率 | 响应式折叠 | 顶栏按钮被切出屏幕 | 致命 | 3 |
| 打开 Dev Telemetry | 技术统计 | 5/6 子面板永久 loading | 致命 | 4 |
| 首次加载 F12 console | 干净 | 2 个 HTTP 500（`/health`） | 中等（但对 AI 心脏致命）| 1, 2, 5 |
| Play 30 秒后主菜单回来 | 计时器停在 0 | Survived 00:00:26 在跑（主菜单也在计时）| 中等 | 2 |
| 一次完整游玩 | 看到 raid/天气/季节 | 2 分钟内 1 个实测事件 | 严重 | 4 |

---

## 五、与标杆游戏的差距（跨评测者综合）

| 维度 | RimWorld | Banished | Frostpunk | ONI | DF | **Project Utopia** |
|------|----------|----------|-----------|-----|-----|---------------------|
| 玩家 agency | 极高（每 pawn 微管） | 中高（每建筑手动） | 高（法律+区调度） | 高（每 duplicant）| 极高（每 dwarf） | **极低**（AI 托管） |
| 叙事 | AI Storyteller | 代际静默史诗 | 发电机 × 道德压力 | — | Legends 涌现史诗 | **无** |
| 新手引导 | 剧本选择 + Learning Helper | 简易 tutorial | 剧情教程 | 完整 Duplicant 教程 | Steam 版可视化教程 | **完全没有** |
| Tooltip 密度 | 每图标 / 每数值 | 大部分 | 大部分 | 极高（带下降速率） | 有 | **几乎为 0** |
| 建筑种类 | 150+ | ~40 | ~25 | ~200 | 500+ | **11** |
| 资源种类 | 30+ material / 数百 item | ~15 | ~10 | 数十 | 数千 | **7** |
| 生物种类 | 80+ | ~10 | — | ~30 | 300+ | **4** |
| 事件类型 | 50+ / 年 | ~10 | 脚本剧情 | ~20 | 100+ | **1**（实测）|
| 终局条件 | 船逃 / royalty / anomaly | 长期村镇 | 31/45 天剧情 | 建造火箭 | 传承 | **无**（endless + score） |
| 美术方向 | top-down 像素独特 | 低多边形统一 | 蒸汽朋克统一 | 扁平工业 | ASCII / Premium 精致 | **大色块像素，毫无风格** |
| 音效音乐 | 完整 BGM + 环境音 | 完整 | 强叙事音乐 | 强 | 有 | **完全静音** |
| 响应式 / 分辨率 | 宽广支持 | 支持 | 支持 | 支持 | 支持 | **1366×768 以下即崩** |

**Project Utopia 在每一个消费者可感知的维度上都处于劣势。**

---

## 六、五位评测者合并的**改进路线图**

### P0 · 发售前必修（不修无法称为游戏）

1. **默认隐藏 Dev Telemetry / Debug / 开发者 Settings**。改为 URL query `?dev=1` 或隐藏快捷键（Ctrl+Shift+D）才唤出。
2. **所有资源图标、建筑按钮、指标数字加 tooltip（title + aria-label）**。Food / Prosperity / Threat / Dev Index 都需显式说明含义与阈值方向。
3. **资源显示速率**：`Food 12 ▼ −3.2/s` 而不是 `Food 12`。低阈值时整块红底闪烁。
4. **点击有反馈**：建造失败必须给出红字 "need 3 more wood" + 光标红叉 + 音效；成功必须给出 "-5 wood" 飘字 + 建筑 outline 闪绿。
5. **Entity Focus 重写**：删除 FSM / Policy / Path 内部状态，替换为 RimWorld 式 Name / Role / Hunger bar / Current Task / Recent Events。
6. **Settings 拆分**：玩家设置（音量、快捷键、画质、全屏）vs. 地图生成设置（迁到 New Map 流程卡片里）。
7. **强制新手教程**：首次启动播 30-60 秒引导过场（造第一条路、第一座农场、看到食物入库），完成后解锁正式玩法。
8. **目标追踪面板**：右上角持久显示 `□ 重建西部伐木线 (0/3)`；hover 时地图高亮。
9. **失败总结页**：死光时弹统计（存活时间 / 分数 / 死因分解 / 最后事件）+ 重试按钮。
10. **响应式重写**：最低支持 1280×720；顶栏资源可滚动或自动折叠；Settings/Debug 在小屏合并进"更多"菜单。
11. **Heat Lens 必须有可见 overlay + 图例**：红=供应过剩、蓝=饥饿。
12. **修复 `/health` 500 + 把 LLM 跑起来**：集成本地 tiny-LLM（gemma-2b / qwen1.5-1.8b / Ollama）或退一步把"fallback AI"从宣传里删除。
13. **修复 Dev Telemetry 5/6 loading**：当前这是核心卖点之一，坏的比删了更伤。
14. **移除标题栏的 SEED 数值**。

### P1 · 第一次重大补丁

15. **警告系统独立**：红色告警从普通状态 banner 剥离，独立右上角 stacking alerts（类 RimWorld）。
16. **Tile hover 具体数据**：肥力 / 湿度 / 距最近仓库距离 / 预估产量。
17. **事件日志侧栏**：raid / weather / death / milestone 全部时间戳落地。
18. **建筑和角色 sprite 重绘**：至少主建筑 3-4 帧状态（工作中/空闲/损毁）；工人按角色上色明显区分。
19. **加一个 Storyteller 面板**：把 AI Narrative 抬到主界面中央，让玩家看到 AI 在"讲故事"。
20. **模板下拉 → 卡片选择**：缩略图 / 难度星级 / 一句简介 / 推荐玩法。
21. **给玩家真正的决策点**：Frostpunk 式"法律卡"每 X 分钟弹一次；或 RimWorld 式事件 popup 强制玩家做选择。
22. **暴露手动干预通道**：工人优先级滑条、工种再平衡按钮。

### P2 · 内容扩张（让它真正算 colony sim）

23. **建筑翻倍到 30+**：分层 Wall（wood/stone/steel）、Watchtower、Storage Tier、Power 系列、Bed / 餐桌 / 娱乐。
24. **加工链加第二层**：Wheat → Flour → Bread / Iron → Ingot → Tool / Herb → Extract → Medicine。
25. **生物多样化**：Herbivore / Predator 拆成 5+ 具体物种，带模型 / 声音 / 掉落。
26. **Raid / 事件系统真正落地**：从第 3 游戏日开始小袭击，给切身威胁。
27. **季节 / 天气显式化**：屏幕角放季节环 + 天气图标。
28. **科技树 / 解锁 / 章节**：至少活到第 100 天解锁 Utopia 结局的轻量目标。
29. **工人起名 + 2-3 句 backstory + 肖像**：$0 成本的叙事 hack。
30. **完整音效音乐**：BGM、点击音、工人环境音。

### P3 · 创新突围（找到"这是一款 X 游戏"的 X）

31. **让 LLM 生成事件叙事包装**：不是 `"vermin swarm at (48,36)"`，而是 `"一群田鼠顺着东侧道路涌入 3 号仓库"`。
32. **让玩家用自然语言下指令**："优先修复东侧道路并派两个工人挖石头。" —— 这是 LLM 在 colony sim 的真正 differentiator。
33. **3D 表现力**：若真用 Three.js，加日夜循环 / 投影阴影 / 材质变化 / 天气粒子；至少做 isometric tileset + camera tilt 让 elevation 可见。
34. **Storyteller 面板抬升**：把 AI Narrative 从 Debug 子面板抬到玩家主界面。

---

## 七、最终定性

| 评测者 | 定性 |
|--------|------|
| 引导性 | "开发者忘了关调试模式就分享的测试服务器链接" |
| 可玩性 | "开发者拿来跑基准测试的仪表盘——只是不小心长得像游戏" |
| UI | "工程师自用调试台气质极重的模拟器原型，勉强能玩、完全不能卖" |
| 机制+内容 | "数据驱动的模拟器在没有数据视图的情况下发布" |
| 创新性 | "A well-engineered simulation kernel in search of a game." |

**五位评测者独立得出几乎一致的结论**：

1. **工程内核扎实**：ECS / 分层 AI / fallback 策略 / deterministic RNG / snapshot replay / benchmark harness —— 这些技术储备不输商业作品。
2. **玩家产品形态缺失**：教学 / tooltip / 反馈 / 总结页 / 响应式 / 美术 / 音效 / 叙事 / 决策深度 —— **全部未达到付费游戏基线**。
3. **核心卖点不兑现**：宣传 15 系统 / 10 环境层 / LLM 驱动 AI —— 玩家实际感知到 2 层 terrain + fallback AI，Telemetry 面板 5/6 还在 loading。
4. **内容密度数量级差距**：对 RimWorld 5-10%，对 Dwarf Fortress 1-3%。
5. **Debug 与 玩家 UI 未分离**：SEED / FSM / Policy Weights / RNG state 全部裸露。

**现阶段不具备可消费的游戏形态。** 要从 ~2.67/10 抬到 7/10 的商业可卖及格线，按合并路线图保守估计需要 **6-12 个月全职开发 + 一次美术外包 + LLM 默认集成 + 一位 UX 设计师全程参与**。

---

## 八、推荐的下一步（给项目方）

评测者集体建议：

**短期（1-2 周）：止血**
- 默认隐藏 Dev Telemetry / Debug / 开发者 Settings
- 所有图标加 tooltip
- 资源速率显示
- 点击反馈（音效 / 飘字 / 红叉）
- 响应式最低 1280×720

**中期（1-2 月）：核心玩家体验**
- 新手教程 + 目标追踪 + 失败总结页
- Entity Focus 重写为玩家视角
- Heat Lens 真的给 overlay
- 修 `/health` 500 或至少修 Telemetry loading
- 警告系统独立

**长期（3-6 月）：产品化**
- 内容扩张（建筑 / 生物 / 事件）
- 美术 / 音效 / 音乐
- LLM 默认集成 + 自然语言指令通道
- 叙事包装 + 工人名字/背景

**或者**：直接把当前版本**重新定位为 "simulation sandbox / research tool / LLM-driven AI 研究开源 demo"**，不以游戏形态销售。这是评测者 2 和 5 都提出的备选方案。

---

## 附：所有评测原始文件

- [01-onboarding.md](01-onboarding.md) - 引导性 - 19.4K
- [02-playability.md](02-playability.md) - 可玩性 - 12.7K
- [03-ui.md](03-ui.md) - UI 呈现 - 21.6K
- [04-mechanics-content.md](04-mechanics-content.md) - 机制+内容 - 14.5K
- [05-innovation.md](05-innovation.md) - 创新性 - 13.8K
- [00-summary.md](00-summary.md) - 本文件（汇总）

---

**结语**

5 位从未接触此项目的外部评测者独立游玩、独立打分、独立下结论，得出了**惊人一致**的判断：**Project Utopia 的工程是优秀的，产品是不完整的**。任何一条改进都值得做，但最不能躲的是那个最基本的问题 —— **把 Debug 藏起来，把玩家放出来**。

在这之前，它不是一款游戏。
