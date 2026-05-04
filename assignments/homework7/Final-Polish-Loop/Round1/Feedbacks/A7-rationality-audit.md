---
reviewer_id: A7-rationality-audit
round: 1
date: 2026-05-01
verdict: RED
score: 4
dead_design_count: 4
unclear_label_count: 11
no_effect_setting_count: 3
hidden_state_issues: 6
cause_effect_breaks: 7
---

## 一句话定性

这是一个 UI 信息密度极高、但 label 自洽性、单位约定、状态-表现一致性都被反复破坏的 build —— 玩家 30 分钟内能玩，但 30 分钟内**绝对解释不清**屏幕上一半的数字、颜色和状态在说什么。

## R1 残留死设计

| 位置 | 表现 | 是该删 / 是该实现 / 是该解释 |
|---|---|---|
| 右下角 sidebar 的 "Debug" tab（DOM 中存在 `<button class="sidebar-tab-btn dev-only">Debug</button>`） | 被 CSS 隐藏，玩家正常看不到。但 DOM 残留留给开发模式的痕迹 | 该删（生产 build 不应残留 dev-only tab） |
| Best Runs 列表上每个 run 都标 "loss" | "Survival Mode" 文档明确说"endless simulation"，又显示 loss/win，玩家无法理解 win 条件 | 该解释（"loss" 含义） |
| Heat Lens（按 L 切）在 Farm 工具激活时形同虚设：状态条说 "Heat lens ON — red = surplus, blue = starved"，但屏幕上没有红蓝点，因为 Farm 自动叠了 Fertility overlay 把 Heat 顶掉 | overlay 优先级冲突 → Heat 看起来是死开关 | 该实现（让 Heat overlay 与 tool overlay 共存或显式声明被覆盖） |
| Top status bar 的 "Survived 00:03:13 Score 183 Dev 25/100 — Scrappy outpost..." 在 6:00 当前时刻仍显示 3:13 | 这是历史最佳还是当前？没标 | 该解释（加 "(best)" 或 "(current)" 前缀） |

## R2 表述不清

| label / 数字 | 当前显示 | 缺什么（单位 / 量级 / 上下文） | 建议 |
|---|---|---|---|
| `Threat: 23%` / `Threat: 28%` | 百分比无上下界 | 100% = 什么？什么算危险线？ | 加 tooltip：threshold + 当前因子 |
| `Dev 25/100` （header）vs `Dev 21`（best runs 列表） | 同一个量两个格式 | 主页 best runs 不带 /100，游戏中带 | 统一为 25/100 或 25% |
| `Day 7` 在 Survived 6:00 时出现 | 推算 ≈51s/天，但 CLAUDE.md 与 Threat&Prosperity tab 都未给玩家公开"一天几秒" | 玩家无法用 Day 反推时间 | 显式告诉玩家 day length |
| `Food 18 ▼ -27.7/min (cons -27 / spoil -0)` | 没有 production 项；▼ 只表示下降但不说降速等级 | 读不出"产-耗"完整账 | 加 prod row + ▼ 颜色按速率分级 |
| `STABLE` 状态在 `Food: -28/min · 0m 41s until empty` 同行同时显示 | 文字"稳定" + 数据"45 秒后耗尽" 直接矛盾 | 改 `CRITICAL` 阈值 | 食物 runway < 60s 必须 ≥ WARNING |
| Inspector 的 `Attack CD: 0.00` | 出现在所有实体（包括农民）；单位未知 | 是秒？tick？为何农民有？ | 仅对持武装实体显示；加单位 |
| `Hunger: Peckish (71% fed)` vs `Hungry (41% fed)` | "Peckish/Hungry/Critical" 与 "% fed" 同时显示 | 两套表达让玩家不知道哪个是阈值 | 词语表 + `% fed → 状态` 公式 |
| Worker 列表行 `Vian Hearn · Hungry / FARM · Wander · hungry` | "Hungry" 出现两次（status 类 + tail 词） | 信息冗余且词义重叠 | 去重 |
| `Hungry / -` 与 `Blocked / -`（Ash-16 / Kade-14） | 后斜杠是 role，"-" 表"无 role"。但玩家看不出这意味着 Visitor / Saboteur | 看不出敌我 | "-" 改成 `(visitor)` / `(saboteur)`（从死亡日志可知）|
| Ash-16 死亡 toast 写 `died of killed-by-worker near (49,11)` | "killed-by-worker" 明显是程序字符串泄漏 | 没本地化 | 改人话："cut down by your worker" |
| `risk 0` 在 Autopilot recovery 字符串里 | risk 量纲未知（0/100? 0/10?） | 玩家不知 0 是好是坏 | 加单位/参考线 |

## R3 效果不明的设置

| 设置项 | 测试方法 | 是否有可见差异 |
|---|---|---|
| Press `L`（Heat Lens）当 Farm 工具激活时 | toggle on/off，对比截图 21 vs 18 | **无可见差异** —— Fertility overlay 占据视图，Heat overlay 看不出来；状态条仍说"Heat lens ON" |
| Press `T`（Terrain overlay 循环）— fertility/elev/conn/nodes | 反复按 T 看 corner label 与色块 | 可见差异微小，但**没有图例**告诉玩家 4 种各自代表什么；只有左上一个文字标签，不带颜色 key |
| Settings → "Effects" / "Weather Particles" / "Heat Labels" 等 toggle | 各开关一遍 | 多数无明显视觉差异（在当前 scene state 下）；用户无法验证开关是否生效 |

## R4 隐藏状态

1. **Visitor 是谁、从哪来、为何来** — Population 里 4 visitors，inspector 里只看到 "Type: WORKER" 但有些行 role 是 "-"；除非看 toast，玩家根本不知道有 saboteur 存在。
2. **Threat 的"原因"被遮蔽** — Threat 22% → 28% → 30%，没有"是什么把它推上去的"分项；只有 AI Storyteller 的散文。
3. **Day 长度** — 系统知道 day length（90s 或更短），但 UI 不公开。
4. **天气 / 雨** — AI Log 里出现 "Weather: rain (33s, 2 fronts on west lumber route, east ruined depot, 27 hazard tiles, pressure 0.40, peak x1.42 path cost)"，但**主视图完全看不出在下雨**（截图 22）；没有视觉/音频提示。
5. **Bear/Predator 的 Hunger/Health** — Inspector 显示 "Food Diagnosis: Food exists, but there is no warehouse access point" 给一头熊（截图 15）。Bear 的进食模型显然不走 warehouse，但 UI 复用了 worker 的 diagnosis 模板。
6. **Worker `Intent` 字段** — Inspector 行 `State: Wander | Intent: ` 经常 Intent 留空（截图 14）；说明此字段在某些 state 下未填。

## R5 cause-effect 断裂

1. **绿条 toast "The colony breathes again. Rebuild your routes before the next wave."**（截图 17）—— 出现时**根本没有"上一次 wave"的痕迹**：survived 才 3 分钟，AI Log 里没 raid 事件，玩家会把这条当文学描写而不是游戏反馈。
2. **STABLE / 0m 41s until empty** —— 状态字与数据字直接矛盾（截图 23 / 24）。
3. **Ash-16 在 worker 列表里以 "Hungry / - · Scout · hungry" 出现，转眼 toast 说 "Ash-16, roaming saboteur, died of killed-by-worker"** —— 玩家从未被告知 Ash-16 是 saboteur 而非 colonist；身份切换没有公开线索。
4. **Top food bar 从 286 → 71 → 20 在不到 30s** —— 没有 spike event 解释（cons -27/min × 0.5min = 13.5，不该掉 60+）。Inspector 也没 burst 提示。
5. **Bear-20 inspector 的 "Food Diagnosis: Build or reconnect a warehouse..."** —— Bear 永远不会用 warehouse；模板复用造成假因果。
6. **west lumber route ▾ 与 east ruined depot ×N（×2/×3/×2 跳来跳去）** —— "×N" 含义未在任何地方解释；玩家会以为这是"倍数 / 攻击次数 / 已完成数"中任意一个。
7. **Pia Arden Backstory: "mining specialist" 但 Role: WOOD** —— backstory 与实际职业脱钩（截图 19）。

## R6 视觉 / 文字 / 音频不匹配

1. **Logistics Legend 颜色 vs 描述错位**（决定性证据，DOM eval）：
   - "yellow ring = Depot not ready (depot)" 实际 border-color `#71d9ff`（**青蓝**，不是黄）
   - "purple ring = Weather impact (weather)" 实际 border-color `#72b9ff`（**淡蓝**，不是紫）
   - 7 行图例里 2 行颜色名称与实际颜色不符，是最硬的"label 不可信"证据
2. **下雨期间地图无视觉雨效果** —— AI Log 报告 27 hazard tiles，画面无雨水/雨点/水洼。
3. **east ruined depot ×3** 的 "×3" 没解释 —— 视觉上并没有 3 个 depot。
4. **"Demolish" 按钮 vs 内部 `data-tool="erase"`** —— 玩家不会看到，但提示开发命名未统一。
5. **Heat lens 文字 banner "Heat lens ON — red = surplus, blue = starved"** 出现时**看不到红蓝**（被 Fertility 覆盖）。

## R7 教程与首次体验断点

1. **首次进入是先 menu briefing，再 Start Colony，但 How-to-Play 中出现的 "AI Decisions panel"、"WHISPER/DIRECTOR/DRIFT 三种 voice" 在游戏 HUD 默认无显著入口** —— "AI Storyteller" panel 在 Colony tab 里，玩家可能找不到（顶部 banner "Autopilot OFF · manual; builders/director idle" 不直接对应"AI Decisions panel"）。
2. **Help → Resource Chain tab 列了 5 种 raw / refined goods，但没列 Stone → Tools (15% 收割速度) 的"先后置依赖"** —— 玩家会卡在"为什么我建不了 Smithy？"
3. **Threat & Prosperity tab 写 "DevIndex 是主乘数"，但没有任何位置 inline 显示 DevIndex 的 raw value** —— Header 写 `Dev 25/100`，但 tab 里叫 DevIndex；命名不一致。
4. **新手提示 "Build Lumber Camp near trees" —— 但 fog-of-war 默认开，远处的森林看不见** —— 玩家不知道森林在哪。

## R8 默认状态合理性

1. **默认 template "Temperate Plains" 是合理的入门图**，但 **Best Runs 全是 Temperate Plains 也意味着没人探索其它 5 张图** —— 默认与不健康的玩家行为画像耦合。
2. **默认 Map Size 96×72** + **默认 0.5 Target Farmer Ratio** 配 **默认 12 workers / 0 STONE / 0 HERBS / 0 COOK**：意味着玩家开局 STONE/HERBS/COOK/SMITH/HERBALIST/HAUL **6 个 role 全空**，但 UI 又同时显示这 6 行 0 数据 —— 视觉上是 "你的 colony 一半瘫痪"，劝退新人。
3. **默认 Autopilot OFF + 默认 Heat Labels ON + 默认 Fog of War ON + 默认 weather particles ON** —— 但 Autopilot OFF 状态下，"AI Storyteller" 仍每秒输出散文 —— **散文与玩家操作之间没耦合**，新玩家会以为 AI 已经在帮自己玩。
4. **Best Runs 默认显示并占据中央**：登陆页 ⅓ 是历史 leaderboard，但游戏未发布、玩家根本没"自己的最好成绩"，全是种子 1337 的 demo runs。**应改为"hide if no real player runs"**。

## 自行扩展角度（必须写，至少 2 个）

### 角度 A：双时钟问题（time-domain inconsistency）

Top header 显示 `Survived 00:03:13`，bottom-right HUD 显示 `6:00`。两个都是时间，但**意义不同且无 label 区分**：top 是"上一次最佳"，bottom 是"当前 run"。玩家会把它们当成同一个值，得出"为什么时钟在倒退"的错觉。

### 角度 B：Backstory 与 Role 的语义脱钩

Inspector 给每个 worker 一段背景（"crafting specialist", "mining specialist", "lone bruiser"），但 backstory **不影响** role，也**不影响** policy notes。这是典型的"flavor text 与 mechanics 不挂钩"——玩家读了 Pia Arden = 矿业特长，会预期她应该被分到 STONE，但她是 WOOD。这种"你看到的特征不影响你能用她做什么"是合理性破洞。

### 角度 C（额外）：scenario 标签 "▾" / "×N" 的语法

`west lumber route ▾`、`east ruined depot ×3` —— ▾ 是下拉箭头还是装饰？×3 是数量、级别、攻击数？没有任何 hover/legend。

## 改进优先级清单

### P0（玩家会困惑到无法继续）

- **Logistics Legend 颜色与文字错位**（"yellow ring" 实为青蓝、"purple ring" 实为淡蓝）—— 玩家学完图例就发现图例骗人，整个 lens 系统的可信度坍塌
- **STABLE 与 0m 41s until empty 同时出现** —— 引入 CRITICAL 阈值
- **Bear inspector 给"Build a warehouse"** —— Predator 的 Food Diagnosis 模板必须独立
- **Top header 的 "Survived 03:13" 是历史最佳但未标注** —— 加 "(best)" 前缀
- **Visitor / Saboteur 在死亡时才暴露身份** —— Inspector 必须公开身份

### P1（明显的合理性破洞）

- "killed-by-worker" 程序字符串
- "×3 / ×2" 在 scenario tag 上无解释
- Heat lens 与 tool auto-overlay 互相覆盖、状态条说谎
- Best Runs 默认占据登陆页中央（demo data）
- Backstory 与 Role 完全脱钩
- "Threat 28%" 没有 threshold tooltip
- worker 列表行 "Hungry / FARM ... hungry" 信息重复

### P2（细节）

- "Demolish" / `erase` 内外命名不一致
- Day 长度未公开
- Inspector "Attack CD: 0.00" 显示给非战斗角色
- Settings 内多个 toggle 视觉差异不明显（Effects、Weather Particles、Heat Labels）

## 结论

整个 build 的可玩性 / 内容深度都很高（FSM、AI Director、policy notes、storyteller 都很丰富），但**末端呈现层的 label/单位/状态文字**是被设计与实现两侧反复 cherry-pick 后留下的"半成品文档"——
- 同一种概念（时间、threat、dev、role 是否为 colonist）在屏幕上有 2-3 套不一致的写法。
- "颜色 = 状态" 的图例自己就错。
- 死设计与"还没擦的 dev 痕迹"留在生产 DOM。

新玩家在 30 分钟内能让 colony 不死，但**完全无法构建一个自洽的世界模型**——这就是 R1-R8 全亮红的核心原因。**verdict = RED**，需要在 P0 全部清零后才能 reopen 评估。
