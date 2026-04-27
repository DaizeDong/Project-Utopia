---
reviewer_id: 01a-onboarding
round: 5
date: 2026-04-24
score: 4
one_liner: "有欢迎页和三标签帮助，但 30 秒后教学断崖：工具半数没解释、点人不给信息、Autopilot 静默崩盘。"
---

# 01a Onboarding 评测（外部新玩家视角）

## 评分理由（4 / 10）

这款游戏**有**引导入口（Welcome 对话框、Opening briefing、How-to-Play 四标签、F1 快捷键），已经高于很多同类独立作品的"一脚踢进空地图"做法。所以**不是 1-3 分**。

但它**远远够不上**"付费成品"的 5-6 分合格线：

- 13 个建造工具里只有 6 个被教学列出（Road/Farm/Lumber/Warehouse/Wall/Erase），剩下 7 个（Bridge/Quarry/Herbs/Kitchen/Smithy/Clinic + 一个 Erase 左邻）靠自己撞；
- Construction 面板说"点击 worker 检查"，实际左键就是建造；要先切回 Select 才能检查——但 Select 按下后立即"回弹"成 Road（见下方"具体场景 3"）；结果就是**新手根本无法成功点中一个 worker**；
- Autopilot 打开后 5 分钟内殖民地直接饿死（Food 从 100 → 0 → 3 个 worker 连续 starvation 死亡），却没有任何"教学式失败解释"——新手只会觉得"这游戏坏了"；
- 错误反馈近乎为零：点水面建 Farm，没有红叉、没有提示、没有音效、资源也没扣，完全静默，新手必须反复试才能推断出规则。

总体这是一个"有**菜单级**引导、但**无新手前 3 分钟陪跑**"的半成品教学。给 **4 分**——比真正糟糕的（1-3）好，但比合格（5）差得看得见。

---

## 亲测流程（含截图）

### 流程 1：首次进入 → 读 How-to-Play → 启动 → 30 秒内迷失

1. 刷新页面，弹出 Welcome 对话框（`screenshots/01-welcome.png`），信息密度偏高但尚可读：标题、"Survive as long as you can"目标、Heat Lens 说明、模板下拉、地图尺寸、快捷键条、三个按钮。**加分**：有明确的"First pressure / First build / Heat Lens / Map size"四段 briefing。
2. 点 **How to Play**（`02-how-to-play.png`）：四标签 Controls / Resource Chain / Threat & Prosperity / What makes Utopia different。Controls 标签列出 LMB/RMB/滚轮/0/1-6/Space/Esc/L/Ctrl+Z/F1——覆盖到位。Getting Started 三步："Farm on grass → Lumber near trees + Warehouse → Roads connect"。这是**整个教学里唯一有用的新手路径**。
3. 点 **Resource Chain**（`03-help-resourcechain.png`）：四条 Food/Wood/Stone/Herbs → Meals/Tools/Medicine 链。文字清晰，但**没有示意图**，"meals/tools/medicine 是 colony-wide，不进 worker 背包"这种关键坑只在 Tip 最后一句埋着。
4. 点 **Threat & Prosperity**（`04-help-threat.png`）："Threat is the cost of being late"。写得像营销文案，新手根本看不懂——"DevIndex"、"First failure path"、"prosperity pulls it down"都是**黑话**，从来没定义。
5. 关掉帮助，点 **Start Colony**（`05-game-start.png`）。一进游戏就被信息淹没：顶栏 `Food/Wood/Stone/Herbs/Workers` + `Survived 00:00:03 Score 3 Dev 49/100` + `Autopilot off. Manual control is active; fallback is ready.` + 6 个 checklist（routes/depots/warehouses/farms/lumber/walls）+ 一行绿色方向指令 `Grow food supply target -> Grow food su`（**截断**了）+ `Last: No deaths yet` + 右上 DIRECTOR 灰框 + 底部 Entity Focus + 播放控件 + 左侧 13 个建造按钮 + 左下 Construction 详情。一个新玩家这一瞬间要消化 **30+ 个 UI 元素**，帮助里没有任何"先看哪里"的导引。
6. 顶部 `Broken Frontier — Reconnect the west lumber line...` 被省略号截成 `Broken Frontier...`——新手看不到剧情。

### 流程 2：试 Autopilot 观察长期行为 → 5 分钟崩盘 → 无失败解释

1. 点左下 **Autopilot** 勾选 + 点 **4x 快进**（`13-autopilot-ffwd.png`）。顶栏变成橙色 `Autopilot ON - fallback/fallback - next policy in 0.0s`——"fallback/fallback"这种术语**从未解释过**。
2. 00:02:34 时：Food=0，出现红色警告 `Food bottleneck -> Recover food now ->`（又被截断），但屏幕上**没有气泡、没有音效、没有暂停提示**，新手会错过。
3. 00:04:18（`14-long-run.png`）：`[251.3s] Joss-32 died (starvation) near (32,27)` 开始连续死亡。左下冒出红色吐司 `Fen-10 starved - food empty 10s`。**这是目前唯一及格的失败反馈**——有位置、有时间、有原因。
4. 00:09:41（`18-invalid-place.png`）：Worker 从 22 → 10，farms 从 4/6 → 1/6，depots 0/1 退行。Autopilot 在目视意义上完全失控，但顶栏仍然显示绿色 `Autopilot ON ... next policy in 0.0s`——**AI 不承认自己在崩**。新手此时会得出结论："游戏 AI 是假的"，关掉浏览器。
5. 关键问题：**教学里说"Autopilot"是 AI 辅助**，没说它可能直接把殖民地玩死。新玩家打开它 = 送命。没有推荐"先手动体验再开 Autopilot"。

---

## 具体场景问题列表（严重度从高到低）

### P0（阻断新手）

1. **"点击 worker 检查"承诺落空**：Welcome 页和底部 Entity Focus 都说"click a worker to inspect"。实际在默认 Road 工具下左键 = 建造。要切 `Select` 但 Select 按一下**立即回弹到 Road**（`12-select-worker.png`——Construction 面板仍然显示 Selected Tool: Road）。新玩家大概率**永远点不到一个 worker**。
2. **Autopilot 教学虚假**：教程暗示 AI 会帮你，实测默认地图在 Autopilot 下 4 分钟内崩。且橙色状态条说"next policy in 0.0s"永远刷新，不暗示失败。这会让新玩家误判整个 AI 系统的信任度。
3. **Build 工具一半没教学**：Bridge / Quarry / Herbs / Kitchen / Smithy / Clinic 6 个工具在 How-to-Play 里**没出现**，只能靠 hover tooltip（`17-quarry-hover.png`："Quarry (8) — mine stone, cost: 4 wood"）。连一句"什么时候要建 Kitchen？"都没有。Resource Chain 标签里 Kitchen/Smithy/Clinic 只是一笔带过："Food + Kitchen → Meals"。

### P1（严重影响体验）

4. **顶部 scenario 指令被截断**（`14-long-run.png`：`Food bottleneck -> Recover food now ->`；`18`：`west lumber route gap at (43,35) -> Repa…`）。方向指令是教学的核心，被 CSS 吃掉一半。
5. **Broken Frontier / DevIndex / Prosperity / Threat / fallback/fallback / "next policy" 等术语全是黑话**，帮助里用这些词互相定义自己——循环无解。
6. **错误反馈完全沉默**：在水面 Farm（`18`）没有红色提示、没有音效、没有规则解释。规则条 "Rules: Place on grass, roads, or ruins. Farms need nearby logistics access."写在 Construction 面板里，新玩家不会主动读。
7. **Heat Lens 模式切换无动画无引导**：按 L（`08-heat-lens.png`）场景变化微弱，连 legend 都要把鼠标挪到 Heat Lens 按钮才弹（`09-heat-lens2.png`：红=生产仓满，蓝=处理器缺料）。新手按一次感觉"没反应"就再也不按了。
8. **Survival Mode 没有任何第一次胜利感**：目标是"活下去"，没有里程碑、没有"第 5 分钟解锁 X"、没有游戏化节奏。第一个 Achievement 是 `First Tool forged`（`08`）弹了一个黄条，但**没有解释这代表什么进度**。

### P2（抛光缺失）

9. Welcome 页顶部 `○ ○ ○ ○ ○ ○` 是什么？看起来像窗口装饰按钮，但点不动。浪费 tutorial 注意力。
10. 左上资源徽标只写数字不带"余量安全线"，`Food=100` 新手不知道 100 到底是多是少。Colony 面板里才显示 `-389/min` delta（`10-colony-panel.png`），但默认是关闭的。
11. 第一次打开 Colony 面板，右侧从屏幕**外**缓入，Role 列表滚到被截断（`10`：HAUL 行被切），没提示"可滚动"。
12. 键位表里写 `1-6` 选工具，实际有 13 个工具——`1-12` 才对。Welcome 页写 `1-12`，How-to-Play 写 `1-6`，**两处文档自相矛盾**。
13. "Try Again" 在 Help 里被宣传，但我们没见到 Game Over 流程（30+ 分钟未见），无法评价。
14. 没有任何撤销提示——`Ctrl+Z` 只在键位表静态列出，第一次建错也不会弹"可以 Ctrl+Z 撤销"的 hint。
15. 没有"请暂停思考"的建议。5 分钟快进下新手根本来不及读任何东西。

---

## 和成品游戏对比的差距

| 维度 | RimWorld | Oxygen Not Included | Dwarf Fortress Premium | **Project Utopia** |
|---|---|---|---|---|
| 强制新手教程 | 有（引导任务） | 有（图文教程 + 练习沙盒） | 有（Adventure Mode tutorial） | 只有静态 Help 文字 |
| 首次动作提示 | 任务高亮 + 箭头 | Printing Pod 发光 + 对话 | NPC 对话 | 无任何高亮或箭头 |
| 工具 tooltip 深度 | 多段（功能 / 资源 / 策略） | 有动图 | 有段落 | 一行字：`Quarry — mine stone, cost: 4 wood` |
| 错误反馈 | 红色轮廓 + 音效 + 文字 | 红 X + 原因 | 文字 log | **完全沉默** |
| AI 辅助 | Advisor 弹提示 | Printing Pod 指引 | — | Autopilot 开了就死 |
| 首次失败 | 有 "colony wipe" 故事化总结 | 有数据复盘 | 有 `Losing is fun` 叙事 | 没亲眼看到，疑似直接重玩 |
| 术语一致性 | 高 | 高 | 高（但故意复杂） | 矛盾（1-6 vs 1-12） |

Utopia 的帮助文字量**比独立游戏平均高**，但**交互式引导为零**——它是"一本说明书 + 一个沙盒"，不是"一次被引导的体验"。这是 2010 年代独立游戏水平，不是 2026 年付费产品水平。

---

## 改进建议（按 ROI 排序）

1. **Intro Mission (1 个 30 秒的强制任务)**：首次 Start Colony 后冻结 UI，箭头指向"选 Farm → 点这块绿地 → 等食物生产"。完成后解锁其他按钮。ROI 最高。
2. **Select 工具不再自动回弹**：要么默认就是 Select，要么 Select 按下后锁住，直到玩家主动切换。否则 "click worker to inspect" 永远是骗子。
3. **Autopilot 加"风险警告"**：第一次勾选弹一个 modal："Autopilot 是基于 fallback 策略的实验性 AI，在某些种子下会失败。建议先手动 10 分钟。" 或者至少在它把 Food 打到 0 时自动暂停并提示。
4. **顶栏指令单行换成两行不截断**，或者加 hover 展开。方向指令是教学核心，不能被 `...` 吃掉。
5. **Kitchen/Smithy/Clinic/Herbs/Quarry/Bridge 六个"二级"建筑**单独加一个 "Advanced Buildings" 教学标签，含解锁时机（如 "当 Food > 80 考虑建 Kitchen"）。
6. **错误反馈可视化**：无效格子 hover 时高亮红色 + 气泡显示"需要：grass/ruin + 邻近 road/warehouse"。
7. **统一键位表**：`1-12` vs `1-6` 矛盾至少要修。
8. **术语表标签**：加一个 Glossary 标签定义 DevIndex / Prosperity / Threat / Score / fallback / next policy。
9. **第一次 death 弹教学式吐司**："你的 worker 饿死了。检查 Food 供给：是否有 Farm？是否有 Road 通 Warehouse？" ——把现有红吐司升级成教学。
10. **Welcome 页装饰条 `○ ○ ○ ○ ○ ○` 要么去掉要么改成 tutorial 进度点**。

---

## 总结

Project Utopia 的引导像是**开发者写给自己朋友**看的 README：信息齐全，但假设了玩家已经有 RimWorld / ONI 底子。没有强制教程，没有交互式箭头，没有错误反馈，Select/Autopilot 两个关键教学承诺都翻车。**4/10**——有骨架，没血肉。

**一句话**：写了说明书，没写新手课。
