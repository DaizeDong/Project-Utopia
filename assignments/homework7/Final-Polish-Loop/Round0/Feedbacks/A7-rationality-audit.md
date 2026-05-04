---
reviewer_id: A7-rationality-audit
round: 0
date: 2026-05-01
verdict: RED
score: 4
dead_design_count: 6
unclear_label_count: 13
no_effect_setting_count: 2
hidden_state_issues: 5
cause_effect_breaks: 4
---

## 一句话定性

游戏运行起来基本可玩，但表层 UI 处处出现"显示与现实脱钩"——头部 stat bar 上一局的分数残留、Food 速率头条与括号分项相差 14 倍、`L` 键 toast 与帮助文档对不上、Heat Lens / Heat Labels / Terrain Overlay 三套同义词系统混在一起、整面 LLM debug 面板对普通玩家裸露——属于"实现已经足够多但收尾没人做"的状态。

---

## R1 残留死设计

| 位置 | 表现 | 是该删 / 是该实现 / 是该解释 |
|---|---|---|
| 顶部 stat bar `Survived 00:03:08 Score 168 Dev 22/100 — Scrappy outpost, still finding its r…` | Try Again 重开后该字符串保持上一局的"3:08"持续 ≥1 分钟（实际新一局已到 1:36）；底部 simulation 时钟正常推进。该 string 在跨局过渡里没有 reset。截图 14/15/19/20/21 全部可见。 | **该修**：reset on new run。 |
| Best Runs 列表里 7 条全是 `seed 1337 · loss · Dev 21 · 3:12 / 3:11` | 不同模板（Temperate Plains, Fertile Riverlands）记录但 score/dev/duration 几乎一致 → 玩家无法判断该榜单到底在记什么、有意义吗 | **该解释 + 该改进**：loss 应该不计入排行榜，或榜单要标 "Best survival time"，并允许过滤 win/loss。 |
| Inspector 末尾 70+ 个 `<details>` (LLM Call I/O, Prompt Input: System / User, Request Payload, Raw Model Content, Parsed Before Validation, Guarded Output, Last LLM errors, Stress Test, Logic Consistency, System Timings, Director Timeline 8 条 fallback 完全相同, Dev Tools, A* + Boids, AI Trace, …) | 普通玩家完全无法消费 — 这是开发者面板暴露在生产 UI 里 | **该删 / 折叠到 dev mode**：放到 F2 或 `?dev` URL 后面。 |
| 设置 → "Map & Doctrine → Target Farmer Ratio: 50%" slider | 拖动 slider 没有任何 toast / 视觉反馈、Role 占比也未变 (FARM 7 → 8 是因为 worker reroled, 与 slider 无关) | **该实现 反馈** 或 **该解释**：标注"下一次轮班生效"。 |
| 设置 → 面板里出现 2 个 Autopilot 复选框（status bar + settings），2 个 Tile Icons / Unit Sprites（设置面板 + dev runtime） | DOM 上 13 个 checkbox，重复入口；玩家点了一处不知道另一处也跟着变 | **该删冗余**。 |
| 右侧 Settings → "Reset Display Settings" + Quality Preset 下拉 → Resolution Scale slider 三者关系 | 选 Quality Preset 会被 toggle 任一项立刻改成 "Custom – manual overrides"；但选 "Balanced" 之后 Resolution Scale 还是 100% 没变。Preset 实际改了什么没明确告知。 | **该解释**。 |

## R2 表述不清

| label / 数字 | 当前显示 | 缺什么（单位 / 量级 / 上下文） | 建议 |
|---|---|---|---|
| `Food 106 ▼ -562.4/min (cons -39 / spoil -2)` | 头条 -562.4，括号 -41，二者差 14×。同时旁边 `⚠ 2m 47s until empty` 用的是 41/min 才能算对。 | 头条数字疑似 bug（每 tick × 60 重复算？）；玩家会以为 14× 严重 | **必修**：让头条 = cons + spoil。 |
| `Wood 35 ▼ -248.6/min (sampling…)` | 木头数字几分钟没动过 (35 → 35 → 35)，却显示 -248.6/min | "sampling…" 提示语 + 实际负值打架 | **修**：sampling 期间隐藏 rate，或显示 `—/min`。 |
| `Stone 15 = 0.0/min (sampling…)` | 同上，`=` 是相对正常，但 `(sampling…)` 永久挂着 | sampling 是不是永远 sampling？ | **修**：sampling 应有 time-out。 |
| 顶部 HUD `Workers 12` vs 左下 Entity Focus `All 20` | 同一概念两个口径，没有 Visitor/Animal 拆分；Bear-20 / Deer-18 与 Vian Hearn 同列 | 玩家点 "All 20" 以为是工人 | **拆 tabs**：Workers / Visitors / Animals。 |
| Entity Focus 行 `Vian Hearn · Hungry / FARM · Wander · hungry` | "Hungry" 出现两次（state + tag），"FARM" 大写、"hungry" 小写；动物行 `Bear-20 · Combat / -· Hunt · well-fed` 把 Hunt 当 state，Combat 当 group | 信息冗余 + 大小写混乱 | **统一**：删掉重复 "hungry"，统一大小写。 |
| Inspector `State: Wander | Intent:` | Intent 字段空 | 留白没意义 | **修**：要么隐藏，要么写 `Intent: idle`。 |
| Inspector `Vian Hearn (worker_4)` | 内部 id `worker_4` 露出 | 玩家不需要看到 id | **删**或 **dev-only**。 |
| `Carry: food=0.00 wood=0.00 | Attack CD: 0.00` | 全是 `0.00`；攻击 CD 单位是秒？冷却时间是 0 = 可立即攻击，还是已用尽？ | 单位 + 含义 | **加单位 (s)**，CD = 0 时改成 "Ready"。 |
| Death modal `Try Again (2)` `New Map (2)` | `(2)` 是上一局攻击次数？是 hotkey？是 attempt 计数？ | 完全无解释 | **改写**：`Try Again (press 2)` 或干脆去掉。 |
| 死亡 modal `#1 of 8` | 8 个什么？8 局历史？8 个排行槽？ | 没有 legend | **改写**：`Best Runs rank #1 of 8`。 |
| `Devindex: 21/100 (smoothed 21)` | smoothed 是什么计算？为何与瞬时一致？ | 缺解释 | **加 tooltip**。 |
| AI Storyteller `DIRECTOR picks rebuild the broken supply lane. : The grass hides every shortcut…` | **句首多了个 `:`**（未填充模板字段） | 字符串模板 bug | **修**。 |
| Colony 顶部 chip `STABLE` 同时 `Food: -562/min, 0 idle, Threat: 21%` | "STABLE" + 高速失血 + 21% 威胁 — 这三个在一行互相抵消 | "STABLE" 阈值不明 | **加 tooltip**：稳定标准是什么。 |

## R3 效果不明的设置

| 设置项 | 测试方法 | 是否有可见差异 |
|---|---|---|
| `Fog of War` | 关闭 → 整张图立刻亮起来 | ✅ 有差异 |
| `Tile Icons` | 关闭 → 树木 sprite 消失，warehouse outline 还在 | ✅ 有差异 |
| `Heat Labels` | 关闭 → "west lumber route" / "east ruined depot" 标签消失 | ✅ 有差异 (但和 `Heat Lens` 名字撞车，产生 R5 混淆，见下) |
| `Effects` | 没单独验证（视觉差不出来） | ❓ 未确认 |
| `Weather Particles` | 没单独验证（当前没下雨） | ❓ 未确认 |
| `Entity Animation` | 没单独验证 | ❓ 未确认 |
| `Unit Sprites` | 没单独验证 | ❓ 未确认 |
| `Map & Doctrine → Target Farmer Ratio: 50%` slider | 拖动后无 toast、无 role 重新分布 | ❌ 无明显差异（设计是延迟生效就需要标） |
| Quality Preset 下拉 (Balanced/Custom) | 切到 Custom 是被动；从 Custom 选 Balanced，没 toast，AA/Shadow 字段没变 | ❌ 反馈缺失 |
| `L` 键（按帮助：toggle Heat Lens） | 实测：toast 写 "Tile icons enabled / disabled" — **行为完全不是 Heat Lens** | ❌ 与帮助矛盾，详见 R5 |
| `T` 键（按 build legend：terrain overlay） | toast `Auto-overlay: Overlay: Fertility` — 多了个 "Overlay:" | ⚠ 有差异但字串重复 |
| 右侧 sidebar 上的 `Heat (L)` 按钮 | 点击 → toast `Heat lens ON — red = surplus, blue = starved.` — 才是真正的 Heat Lens | ✅ 有差异 |

## R4 隐藏状态

1. **Threat 21%** —— 21% of what? 出现在 Colony chip 行，没有上下文：是 raid 概率？是负面情绪？ 21% 高还是低？没有阈值线。
2. **Prosperity 10** —— 出现在死亡 modal "Prosperity: 10 | Threat: 44"。10 是 0–100 区间还是无上限？没说。
3. **Worker `Hunger: Hungry (41% fed)`** —— `Hungry` 是 tag，41% 是数；何时降为 `Critical hunger`？没阈值线。
4. **`Auto-build queued: lumber, road`** 出现在 Inspector，但 status bar 写 `Autopilot OFF · manual; builders/director idle`，二者矛盾：autopilot off 还会自动 queue build？
5. **`Bear-20 · Combat / - · Hunt · well-fed`** —— bear 居然在 Combat 分类里被计入 `Combat 1`，与玩家的 worker 战斗状态混在一起。点 `Combat 1` filter 时玩家以为 1 个工人在战斗。

## R5 cause-effect 断裂

1. **`L` ≠ Heat Lens（帮助骗了你）** —— Help 明确写：`L — toggle the Supply-Chain Heat Lens.`，Build legend 也写：`L: heat lens`。但实际按 `L` toast 报 "Tile icons enabled/disabled"。Heat Lens 的真正切换在右侧 sidebar 的 `Heat (L)` tab。**这是文档骗局**。
2. **Heat Lens 打开却没有热点** —— 进 Heat Lens 后地图只剩淡化的白图层，没有红/蓝 paint，因为玩家还没建任何 storage/processor。但没有提示 "尚无瓶颈数据"，玩家会怀疑是不是按错了。
3. **`Workers 12` vs `Visitors 4`** —— 4 个 Visitor 是谁？打开后发现就是 Nash-13、Kade-14、Thal-15、Ash-16 这种 Scout，但 Entity Focus 没标他们 visitor，反而和 worker 混排，且都标 "Blocked / -"。"visitor" 字面意义和实际行为对不上（他们看起来在 scout 而不是访问）。
4. **Director Timeline 8 条 `fallback-healthy rebuild the broken supply lane fallback`** —— 间隔 10s 重复完全一样的字符串，没有任何变化。让玩家以为 AI 在反复 reconsider 同一件事，无意义。

## R6 视觉 / 文字 / 音频不匹配

1. **Survival counter 与 stat bar 时间不一致** —— 底部 simulation timer 0:24, top stat bar `Survived 00:03:08`。两个 "Survived" 在屏幕上同时出现。
2. **`STABLE` 绿章 + 红色 ⚠ "2m 47s until empty"** —— 同一行同一面板同时显示。玩家只能选一个相信。
3. **Day 3** vs **survival 2:14** —— 1 day = 90s 在 CLAUDE 框架里写过；那 day 3 应在 90×2 = 180s 后到，但当前是 134s = day 1.5。Day count 与时钟不匹配（虽然 Day 计数在 menu 之外没解释起算点）。
4. **Pause 反馈微弱** —— 按 Space 后 toast `Simulation paused.` 一闪而过，没有大字"PAUSED"、没有色调改变；玩家容易以为没生效。
5. **Heat Lens 开启后底部地图边缘出现两片黑影** (screenshots 13/15) — 非常像渲染 artifact 而非 lens 数据：几何形状（梯形 + 倒三角）和地形完全无关。
6. **AI Storyteller 的 leading colon** "DIRECTOR picks rebuild the broken supply lane. : The grass hides…" — 模板字串残留分隔符。

## R7 教程与首次体验断点

1. **Help dialog 教错按键**：`L → Heat Lens` 是错的（见 R5）。新手按 L 再按帮助以为坏掉，会反复尝试。
2. **未教 `T` 键** 但 `T` 在 build legend 里写了 `terrain overlay (fertility/elev/conn/nodes)`，而 Help dialog 的 Controls tab 完全没提 `T`。Build legend 与 Help 应统一来源。
3. **未教 `Heat Labels`** 是设置里独立 toggle；玩家无法把 "west lumber route" 这种 sticker 与 Heat Labels 关联。
4. **未教 "Visitors / Herbivores / Predators" 来自哪里、能不能控制** —— Population 一栏列出 Predators 1，但玩家无法 attack/avoid，新手不知道是被动威胁还是被动事件。
5. **教程提到 "build a Farm on green grass"**，但 Build 工具激活 Farm 时游戏自动切到 Fertility overlay (绿+黄+蓝)，新玩家会以为蓝/黄网格是"草地颜色"，反而看不出哪里是草。需要明确"绿(高 fertility) = 推荐"而非"绿 = 草"。

## R8 默认状态合理性

1. **默认 seed 1337**：Best Runs 全是 seed 1337，新玩家不知道还能换 seed。"New Map" 按钮的"换地图"含义不显。
2. **默认地图模板 Temperate Plains + Broken Frontier**：是合理 starter，但 briefing 说 "balanced map, steady opening"，实测 0:00–3:08 全程 0 建筑就死了 — "steady opening" 与 "3 分钟必死" 不匹配，应当为 starter scenario 调更温和参数（e.g. 起始 food 多一点）。
3. **默认时间倍率 ▶ Normal**：合理。但 ▶ 按钮没有 active style → 玩家无法肉眼判断当前是 Normal 还是 4x。
4. **默认 sidebar 展开到 Build**：合理，**但** Right sidebar 5 个标签 (Build / Colony / Settings / AI Log / Heat / Terrain / ? Help) 完全不指明哪个是默认；切到任何一个再回 Build 都没有 "back" 概念。
5. **默认 Help 按钮提示 `?` or `F1`**：F1 在浏览器里通常被占用（新手会反射性按 F1 → 浏览器 help）。`?` 也需要 Shift。"H" 更合理。

## 自行扩展角度（必须写，至少 2 个）

### A. "AI Director" 的玩家代入感断裂
帮助文档写 `WHISPER / DIRECTOR / DRIFT` 三种 badge。实测整局只见到 `DIRECTOR` (绿色)，没见到 `WHISPER` 或 `DRIFT` 切换。如果 LLM 一直未连上，则永远是 DIRECTOR，那么这个 3-state 系统对玩家无意义；如果 LLM 应该会连上，玩家不知道它什么时候会连上、为什么不连。**整个三态颜色系统看起来像未完成功能或开发者占位符**。

### B. 死因可观察性差
Toast 反复显示 `💀Last: Deer-18 died (predation)`，但只有 4s 显示。等玩家回头去看，已经没了。`Last: Deer-21 died` 对游戏战略有价值（Predator 在哪里活跃？是否会盯上 worker？），却只在 toast 浮窗里出现，没有持续 log（除了 dev 面板里的 Events log，被折叠且需要展开）。死亡日志应该有一个常驻按钮 / 角标。

### C. 经济单位不一致
- Food / Wood / Stone / Herbs 在 HUD 用图标 + 整数。
- 在 Colony 用 `<icon> 名 数 ▼/= 速率/min (cons N / spoil M)`。
- Meals / Tools / Medicine 没有 HUD 图标，只在 Colony 列出。
- Help 写 "Tools (+15% harvest speed)"、"Meals (2× hunger recovery)"，但游戏里 Tools 数量为 0 时这些百分比没有体现给玩家看，没有 worker inspector 写 "current speed: ×1.0 (no tools)"。
**结果**: 玩家不知道 Tools 是不是真的有效。

### D. 名字空间冲突: `Heat`
- `Heat Lens` (L key + sidebar `Heat (L)`)
- `Heat Labels` (settings checkbox)
- `Threat` (Colony chip; 同音不同字)
四个名字几乎挤在一起，新玩家根本分不清。强烈建议改成：
- Heat Lens → "Bottleneck Lens" 或 "Supply Heatmap"
- Heat Labels → "Map Hotspot Labels"
- Threat → 保留

## 改进优先级清单

### P0（玩家会困惑到无法继续）

1. **顶部 stat bar 跨局不 reset** —— 显示上一局的 Survived/Score/Dev，至少持续 1 分钟。直接误导玩家以为已经在计分。
2. **Food 速率 -562.4/min 与 cons/spoil 分项 -41/min 矛盾 14×** —— 数值显示 bug。玩家会做错决定。
3. **`L` 键的实际行为与 Help 文档+Build legend 完全不一致** —— Help 写 Heat Lens，实际 toggle Tile Icons。这是直接的文档骗局。
4. **Inspector 末尾 70+ LLM debug `<details>` 暴露给所有玩家** —— 整页 prompt / payload / raw model content，对非开发者完全无意义且看起来像作弊面板。

### P1（明显的合理性破洞）

5. **Wood/Stone "sampling…" 永远挂着** + 同时显示一个看起来准确实际是错的负值 (`-248.6/min` 但 Wood 数值不变)。
6. **`STABLE` chip 与红色 "2m 47s until empty" 同行同时显示**，stable 阈值不明。
7. **AI Storyteller 句首多个 `:`** 模板字串残留分隔符。
8. **Director Timeline 8 条完全相同的 fallback 行**，让 AI 看起来在打转。
9. **Entity Focus 把动物 (Deer / Bear) / Visitor / Worker 混排**，且 Combat / Blocked filter 把 Bear/Deer 计数进去，造成"我有 1 个工人在战斗"的错觉。
10. **Best Runs 7 条全是 loss · 同 seed · 同分**，且没法区分 win/loss 排序方式。
11. **Heat Lens 打开却没有热点时**，无 "no data yet" 提示，地图反而出现疑似渲染伪影 (screenshots 13/15 黑色梯形)。
12. **Pause 视觉反馈不足**（仅 2 秒小 toast，无 PAUSED 大字 / 滤镜）。
13. **Briefing "balanced map, steady opening" + 实测 3:08 必死** 之间的 tone 严重不符；新手会以为这是 normal 失败。
14. **Death modal `(2)` 含义未解释**。
15. **Help 文档未提 `T` 键**，但 build legend 提到。

### P2（细节）

16. **设置 `Target Farmer Ratio` slider 无反馈**。
17. **"Visitors / Predators" 名词无 onboarding tooltip**。
18. **Worker Inspector 露出 `(worker_4)` 内部 id**。
19. **`Carry: food=0.00 wood=0.00 | Attack CD: 0.00`** 单位不明。
20. **Help "F1 or ?"** ：F1 与浏览器原生 help 冲突 → 推荐 `H`。
21. **Quality Preset 切回 "Balanced" 无 toast**。
22. **"Tools (+15%)" / "Meals (2×)"** 在 Inspector 完全不展示当前 multiplier 是否生效。
23. **Heat / Heat Labels / Threat 名字空间冲突**（建议改 Heat Lens → "Supply Heatmap"）。

## 结论

**Verdict: RED**。
当前 build 的"实现完成度" vs "成品打磨度"严重失衡：底层模拟、AI、面板都跑得起来，但表层文字 / 数字 / 反馈环节几乎处处出现"显示和行为对不上"。最致命的两条是 **Food 速率 -562/min 与分项 -41/min 矛盾**（直接误导关键决策）和 **`L` 键实际行为与文档完全不一致**（直接欺骗新手）。其次是 **stat bar 跨局残留**与 **70+ LLM debug 面板裸露给所有玩家**——这两条都属于"打磨没人做"的硬伤。

如果按 P0 4 条 + P1 11 条全部 fix，rationality 评分可以从 4 升到 7。再处理 P2 的 8 条，可达 8.5。
