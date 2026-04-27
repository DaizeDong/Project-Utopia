---
round: 2
date: 2026-04-22
reviewers: 10
avg_score: 3.42
verdict: 骨架在、卖点哑火——autopilot 抢走 agency、Heat Lens 和 Entity Focus 哑火、开局即巅峰随后一路崩塌，10 个 reviewer 里 9 个给 3 分。
---

## 1. 评分表
| reviewer | 身份 | 分数 | 一句话摘要 |
|---|---|---|---|
| 01a-onboarding | 引导性 | 3 | 有说明书没教学；Start Colony 后直接扔进一个已成熟却正在崩塌的殖民地。 |
| 01b-playability | 可玩性 | 3 | 一款"自己在玩自己"的殖民地，玩家 agency 被 AI Director 架空。 |
| 01c-ui | UI | 4 | 视觉风格统一但信息拥挤、响应式崩裂、核心可视化（Heat Lens/死亡警告）哑火。 |
| 01d-mechanics | 机制与内容 | 3 | 底层系统不少，玩家可感知仅剩资源流曲线；11 建筑 / 1 事件是概念验证层。 |
| 01e-innovation | 创新性 | 3 | LLM 导演+热力透镜+模板三大卖点在实测里一个没兑现；产品承诺与交付脱节。 |
| 02a-rimworld-veteran | RW 老兵 | 3 | 骨架有、血肉缺；模板假、操作僵，救灾无门。 |
| 02b-casual | 休闲玩家 | 3 | 像素小人可爱但新手只能看工人饿死，下次不会再打开。 |
| 02c-speedrunner | 速通玩家 | 3 | 开局即顶点，autopilot 把所有曲线向下推，没有可优化的维度。 |
| 02d-roleplayer | RP 玩家 | 3 | 有"角色卡"没有"人"；Recent Memory 永远是空的，讲不出故事。 |
| 02e-indie-critic | 独立游戏批评 | 6.2 | 有 soul 但没 shape，该上 itch.io 免费页而不是 Steam $15。 |

## 2. P0 — blocker（≥3 个 reviewer 独立提及）

### P0-1. Entity Focus / 点击工人无反馈
- **Reviewers**: 01a, 01b, 01c, 01d, 02a, 02b, 02d（7 人）
- **症状**：屏幕底部有 "Entity Focus" 折叠栏，但玩家点击 canvas 上的 worker/animal 从未稳定打开详情面板；即使按提示 "click a bit closer" 多次尝试仍无反应；02a 整局没成功打开过任何工人面板。
- **HW06 允许**：是（UX/bug fix） — 点击命中框扩大、hover 高亮、或用 Tab 循环选择。

### P0-2. Heat Lens 按下后地图无可见着色
- **Reviewers**: 01a, 01b, 01c, 01d, 01e, 02a, 02c（7 人）
- **症状**：按 L 只让顶栏换一个小标签（且文字被截断 "Heat ens ON..."），地图 tile 没有红/蓝叠色层；就算 Stone 长期=0、Smithy 缺料，也从未触发蓝色 starved 标记。被吹作核心差异化的功能实测等同哑火。
- **HW06 允许**：是（polish/fix） — 修复可见 overlay，阈值调整。

### P0-3. 饿死事件无视觉反馈 / 警告
- **Reviewers**: 01a, 01b, 01c, 01d, 02a, 02b, 02d（7 人）
- **症状**：`Last: [XX s] Name-YY died (starvation) near (x,y)` 以同字号灰白小字滚进顶栏，没有红色 toast、位置闪烁、音效、暂停提示；食物充裕时也会饿死但零解释，玩家反复得出"游戏不讲道理"结论。
- **HW06 允许**：是（UX/polish） — 红色 toast 堆叠 + 位置高亮 + 死因链说明。

### P0-4. AI Autopilot 架空玩家 agency
- **Reviewers**: 01b, 01d, 01e, 02a, 02b, 02c, 02e（7 人）
- **症状**：进游戏默认 DRIFT/DIRECTOR 自动拆/建建筑，玩家不动它也会跑；速通玩家试图暂停批量放建筑失败（1-12 热键无效、canvas 点击被拦）；"我玩 10 分钟和离开键盘 10 分钟结果几乎一样"。
- **HW06 允许**：部分 — autopilot 默关 / 可切换属 UX；"给工人下指令 / 职业优先级矩阵"属 new mechanic，禁止本轮。

### P0-5. 开局即"已运行中殖民地" + 随后全指标倒退
- **Reviewers**: 01a, 01b, 01d, 02a, 02b, 02c（6 人）
- **症状**：Start Colony 后地图中央已经有 7 warehouses / 4 farms / 3 lumber / 7 walls，所有场景 goal 开场已超额完成；随后 warehouses 7→0、farms 4→1 在玩家零操作下倒退；Score 公式 ≈ 存活秒数，与"玩得好不好"无关。
- **HW06 允许**：部分 — "开场建筑数量"属 balance/UX 调参（允许）；Score 公式重构属 new mechanic（禁止），但把 Dev 上涨做成可见反馈属 UX polish（允许）。

### P0-6. Storyteller / DIRECTOR 文本是机器话 + 被截断
- **Reviewers**: 01a, 01b, 01d, 01e, 02a, 02d, 02e（7 人）
- **症状**：DIRECTOR 循环输出 "route repair and depot relief: the colony should sustain route repair and depot relief while keeping hunger and carried cargo from overriding the map's intended reroute press" 这种 LLM system-prompt 级内部字符串；Archipelago Isles 开局显示 "route repair and dep..."（截断）；WHISPER 在所有 reviewer 的 session 里一次都没亮过。
- **HW06 允许**：是（文案 polish） — 改 actionable（"West lumber line broken at (42,36), place Road here"）、修截断；禁止"新增 LLM narrative 系统"。

### P0-7. 地图模板视觉/机制差异极小
- **Reviewers**: 01b, 01d, 02a, 02b, 02c（5 人）
- **症状**：02a 三次切模板得到"像素级一致"的同一张图；02b 三张模板"都是一条蓝河+草地"；02c 三 run Dev 曲线形状高度重合。与标题菜单宣传"re-weights terrain, resources, and raid lanes"严重不符。02e 反例：部分数值确实不同（目标/wall 数量），但视觉感知差距依然小。
- **HW06 允许**：部分 — 修 template 选择器是否真的驱动生成（bug fix，允许）；增加新地形 tile / 山地/沙漠（new content，禁止）。

## 3. P1 — major（2 个 reviewer 提及）

### P1-1. 目标栏像 debug 日志（"7 warehouses built (goal 2) 4 farms built (goal 4) ..."）
- **Reviewers**: 01a, 01b, 01c, 02b
- **症状**：一行 8 个状态、4 种格式混排，没有分组、没有已完成/未完成视觉标记，已完成数字还会倒退。
- **HW06 允许**：是（UX polish） — 分层、进度环、勾选标记。

### P1-2. UI 文本 / tooltip 截断
- **Reviewers**: 01e, 02e
- **症状**："Heat ens ON"、"route repair and dep..."、"DRIFT autopilot: colony holdin..." 在 1920×1080 也出现截断。
- **HW06 允许**：是（polish） — fix overflow / min-width。

### P1-3. 响应式在 1024×768 及以下崩坏
- **Reviewers**: 01c, 01e
- **症状**：Build Tools + Resources 面板挤掉中央地图，目标文字换行 9 行，按钮文字换行。
- **HW06 允许**：是（UX） — media query 紧凑模式。

### P1-4. 资源 pill 无文字标签，依赖图标识别
- **Reviewers**: 01a, 01c
- **症状**：顶栏只有 🍎110 🪵7 ⛰️4 🌿0 ⚙️13，新手不悬停认不出。
- **HW06 允许**：是（UX polish） — 常驻小字 label。

### P1-5. 迷雾不可见 + 建造失败式"教学"（Cannot build on unexplored）
- **Reviewers**: 01a, 01b
- **症状**：玩家看不出哪里是未探索区，没有 "Scout" 按钮/动作指引，靠点建筑报红字反向推断。
- **HW06 允许**：部分 — 加深色覆盖层属视觉 polish（允许）；新增 Scout 工具属 new mechanic（禁止）。

### P1-6. Quarry / Lumber / Farm 放置条件不可视
- **Reviewers**: 01b, 01d
- **症状**："No forest node on this tile"、"rocky deposit" 不可见，玩家抱着建筑工具一格格扫整张地图；Stone 长期 0.0/min 且无 idle 提示。
- **HW06 允许**：是（UX） — 预放置阶段高亮合法 tile，tooltip 写清硬规则。

### P1-7. Recent Memory 永远为空 / 关系值无语义
- **Reviewers**: 02b, 02d
- **症状**：Entity Focus 里 Relationships "+0.25"、"Recent Memory: (no recent memories)"，朋友死了幸存者 mood 无反应。
- **HW06 允许**：部分 — 把现有死亡事件写进 memory 属 bug/连线（允许，如果只是 UI 显示）；新增 mood modifier 系统属 new mechanic（禁止）。

### P1-8. 无音频 / BGM / 音效
- **Reviewers**: 01e, 02d
- **症状**：整局静音，建造、死亡、收获都无反馈音。
- **HW06 允许**：部分 — HW06 通常禁止新增音频资产；若仓库已有资产只是未接线，则属 fix。

### P1-9. Dev Index / Score / Threat / Prosperity 四个分数无解释
- **Reviewers**: 01b, 01d, 02c
- **症状**：顶栏 "Score 562 · Dev 40/100" 无 tooltip、无 breakdown，Threat 数值从不暴露；玩家不知道自己在赢还是输。
- **HW06 允许**：是（UX） — 悬浮解释 + 趋势箭头颜色。

### P1-10. 4× 快进实测未达标 + 缺乏 1/2/3× 档位 / pause-on-event
- **Reviewers**: 02a, 02c
- **症状**：4× 实测约 2.7× 真实速度；无自动暂停条件；按钮 state 偶发不触发。
- **HW06 允许**：是（bug fix + 可选加档） — 核心是 fix 倍速同步 bug。

## 4. P2 — minor（单个 reviewer 或 nice-to-have）

- **P2-1**（02c）：1-12 数字热键切工具无响应；canvas 点击被工具栏高度消化。可能和 P0-1 / P0-4 同根源。
- **P2-2**（01c）：Build Tools 12 按钮无视觉分组（Infra/Resource/Processing/Defense），Kitchen 与 Road 同权重。
- **P2-3**（01c）：Entity Focus 位置在屏幕正中下方像音频播放器 track 标题，语义混乱。
- **P2-4**（01c）：字体层级单调，Dev 48/100 这种核心指标与普通文本同字号。
- **P2-5**（01a, 02b）：没有"第一次 Farm/Meal/Tool 造成"里程碑或鼓励音效。
- **P2-6**（02e）：`window.__utopia` 直接挂全局、Help 面板把架构当卖点讲，独游味过重但对大众玩家是扣分。
- **P2-7**（02a）：4× 快进没有 pause-on-event 救命功能。
- **P2-8**（02d）：工人名字是 "Tam-9" 实验室编号，坐标 `(31,42)` 未叙事化（应 `east river bend`）。
- **P2-9**（01c）：键盘焦点环 / ARIA / Tab 顺序缺失，可访问性差。
- **P2-10**（01c）：建筑/工人/路/废墟 zoom in 后难分辨。

## 5. Stage B 建议

> enhancer ↔ reviewer 1:1 绑定（01a→01a-plan.md …）。每个 enhancer 只聚焦自己对应 reviewer 原本的关注点。

- **01a-onboarding → enhancer 01a**：抓 P0-5（开局殖民地预铺 + 目标倒退）+ P1-5（迷雾可见化 + 建造失败式教学）+ P2-5（里程碑反馈）。目标：让新手第一 60 秒看懂自己在做什么。
- **01b-playability → enhancer 01b**：抓 P0-4（autopilot 默认行为 / 让玩家介入有可见杠杆）+ P1-6（放置前高亮合法 tile）+ P1-9（Score/Dev 解释）。核心：把"有效介入"变得可感。
- **01c-ui → enhancer 01c**：抓 P0-3（死亡警告 UI）+ P1-1（目标栏分层）+ P1-2（文本截断 fix）+ P1-3（响应式）。纯 UI 打磨战场。
- **01d-mechanics → enhancer 01d**：抓 P0-2（Heat Lens overlay 修复）+ P1-6（Quarry/Lumber 放置可视化）+ P1-9（把已存在但隐藏的系统透出 UI）。不允许加新系统，只允许"把现有系统暴露给玩家"。
- **01e-innovation → enhancer 01e**：抓 P0-2（Heat Lens 兑现承诺）+ P0-6（storyteller 文本 human-ify + 去截断）+ P0-7（template 差异化）。三项都是"把吹过的牛补齐"。
- **02a-rimworld-veteran → enhancer 02a**：抓 P0-1（Entity Focus 真的能选中）+ P0-7（template 选择器修 bug）+ P1-10（4× 实测达标）。老兵要的是"系统可信"。
- **02b-casual → enhancer 02b**：抓 P0-3（死亡红色提示 + 因果）+ P1-4（资源 pill 加 label）+ P2-5（造建筑音效/小动画）。降低新手焦虑。
- **02c-speedrunner → enhancer 02c**：抓 P0-4（暂停下可用 / 热键生效）+ P2-1（1-12 数字键 + canvas click 修 bug）+ P1-10（4× 倍速同步 fix）。速通要的是精准控制。
- **02d-roleplayer → enhancer 02d**：抓 P1-7（Recent Memory 把已有死亡事件写进去 / 关系值语义化显示）+ P0-6（fallback 文本人味化，不改架构）。纯叙事 polish，不能加 mood 系统。
- **02e-indie-critic → enhancer 02e**：抓 P1-2（文本截断修干净）+ P0-6（让"drowning beside a full warehouse"这种 voice 句扩散到更多 tooltip）+ P2-6（`window.__utopia` / debug panel 对外隐藏或加 toggle）。把"15% vibe"往 25% 推。

## 6. 已知限制 / 非本轮目标（HW06 feature freeze 不能动）

- **新增教程关卡 / Guided mission**（01a 要求类似 ONI 45 分钟 tutorial）—— new content，禁止。
- **Worker 级优先级矩阵 / 手动指派职业**（02a, 02b, 02c 要求）—— new mechanic，禁止。
- **新增 Scout 工具 / 侦查兵角色**（01a, 01b）—— new mechanic，禁止；只允许把迷雾可视化（polish）。
- **新增 mood modifier / grief 事件 / 存活者情绪连锁**（02d）—— new mechanic，禁止；只允许用现有字段做 UI 连线。
- **新建筑品类**（研究台、电力、家具、码头、医院手术台等，01d）—— new content，禁止。
- **新增音频资产 / BGM / 音效包**（01e, 02d）—— new asset，禁止；若仓库已内置音频则属接线（允许）。
- **新地形 tile（ROCK / MOUNTAIN / SAND / SWAMP）**（01d）—— new content，禁止。
- **新事件（raid / 商队交互 UI / 瘟疫 / 火灾）扩充**（01d）—— new content，禁止。
- **Score 公式重构 / 新增胜利条件 / milestone tier**（02c, 01a）—— new mechanic，禁止；允许改 Score/Dev 的显示与反馈。
- **名字加姓 / 绰号系统**（02d）—— 边界模糊，如仅改命名字符串则属 polish；若引入 trait-driven 绰号生成则禁止。
