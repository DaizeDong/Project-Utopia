---
reviewer_id: 02c-speedrunner
round: 1
date: 2026-04-22
score: 3
verdict: 调试 API 比游戏机制本身更好玩，玩家被 AI 自动化系统剥夺了优化深度。
---

# Project Utopia 速通/破解向评测

## 第一印象（前 60 秒）

我是一个习惯了《工厂帝国》《RimWorld》《Dwarf Fortress》，并对任何有 DevIndex、Score、Threat 这种数字的游戏都要先盘机制的硬核玩家。第一眼看 Project Utopia，菜单干净，六个地图模板可选，目标是"活得越久越好"。Survive 模式的小标识 ∞ 图标我是喜欢的，它暗示这是一个 endurance run 而不是 objective clear——也就是说，**理论上应该有 min-max 空间**。

Start Colony 之后 HUD 做得相当直白：左上 Food/Wood/Stone/Herbs/Workers 五个数字，顶栏一句话目标 "Broken Frontier — routes 0/1 · depots 0/1 · wh 2/2 · farms 4/4 · lumbers 2/3 · walls 7/4"，右下角播放/暂停/Fast Forward 三个按钮加计时器。左侧是建筑工具栏，12 个工具（Road / Farm / Lumber / Warehouse / Wall / Bridge / Erase / Quarry / Herbs / Kitchen / Smithy / Clinic）。

但第一印象的**第一个失望就来了**：你点 Start Colony 之后，工人们自己就开始修路、砍树、种田、建仓库。我还没碰键盘，屏幕上已经在进行"标准起手"。**这是一个让玩家观看的游戏，而不是让玩家优化的游戏。** 一个速通玩家最不想看见的就是 "AI 会替你做决定"。

好在我很快发现了 `window.__utopia` 和 `window.__utopiaLongRun` 这两个全局对象——这是个开发调试接口，基本就是"速通玩家的礼包"。我决定 3 个 run 里面至少做一次纯 AI、一次数值注入 exploit、一次不同 seed 的对照。

## 可利用 exploit 清单（硬核玩家视角）

我在 3 个 run 里主要找到下列机制可利用：

### 1. `window.__utopia.state.controls.timeScale` 可写
默认 `timeScale = 1`，UI 上最多 "Fast forward 4x"。但我直接在 console 里写 `timeScale = 50`，模拟照跑不误，FPS 还稳在 52（仅 `frameMs` 会飙）。**这等于把原本需要 15 分钟的一局压到 30 秒。** 对任何想跑分数据的玩家，这是压倒性的加速 cheese。

### 2. `window.__utopia.state.resources` 可直接赋值
我把 `food/wood/stone/herbs/meals/medicine/tools` 全部硬设为 99999。
- DevIndex 瞬间从 48 涨到 80+；
- Prosperity 冲到 92（最高见过 100）；
- Threat 掉到 27；
- AI 看到材料富余后立刻开始造 Kitchen、Clinic、Bridge——**这是 AI 之前根本造不出来的建筑**（因为 stone 长期 0）。
- **Run 2 最终 Dev 82 / Survival 817 / Pop 66**，是三局里最好的。

这不是小 cheese，这是**直接破解整个游戏的资源生产链**。

### 3. 一个真正的 bug：`placeToolAt({ tool, ix, iz })` 完全忽略 `tool` 参数
我尝试用 `__utopiaLongRun.placeToolAt({ tool: 'kitchen', ix, iz })` 在 paused 状态 bulk-place Kitchen / Clinic / Smithy，返回结果**永远是 road**：
```
info.label: "Road"
info.summary: "Extends the logistics network..."
reason: "occupiedTile"
```
不管我传什么 tool，它都按 controls.tool（默认 road）走。把 `controls.tool` 先改成 `kitchen` 也无效——因为 `placeToolAt` 内部把传入的 `{tool, ix, iz}` 整体写回了 `controls.tool`（变成了一个对象而不是字符串），反而把工具栏状态搞坏。**这是一个对外暴露的调试 API 的明显实现缺陷**，意味着任何 headless / benchmark / AI 训练跑分脚本都只能摆 road。

### 4. "Emergency relief" 自动救济是个防输保险
Run 1 开局 6.1s 就触发了 `Emergency relief arrived: +20 food, +14 wood, threat -10`。Run 3 出现相同字样。这个系统叫 `gameplay.recovery`，`collapseRisk` 超过阈值就回血——**它让游戏不会真的让你死**，削弱了"作死实验"的反馈清晰度。speedrun 角度这是**反高潮设计**。

### 5. 资源数值是 float 连续衰减 + 全局池（但 worker 从自身 carry 吃饭）
这是我这次 run 里最蛋疼的发现：我把 food 拉到 99999，仓库里 food 永远不会 0，但 worker 仍然死于 starvation（"Mose-96 died (starvation)" at 527s）。说明 **worker 吃饭不是从全局池扣，而是从自己 carry 扣**——意味着即使仓库爆仓，若 worker 走不到/没抓到食物，照样饿死。从速通角度讲，这是"**提供了数字但没给出操作杠杆**"，我没办法直接用资源注入避免死亡。

## 最优策略分析（经过 3 个 run 数据比较）

### 综合数据表

| Run | Template | Seed | TimeScale | 干预 | TimeSec | Survival | DevIndex | Pop | Deaths | Prosp | Threat |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | temperate_plains | 1337 | 20→50 | 纯 AI 观战 | 716 | 811 | 64.2 | 37 | 5 | 34.9 | 69.0 |
| 2 | temperate_plains | 4242 | 50 | 资源注入 99999 | 567 | 817 | 81.9 | 66 | 3 | 81.6 | 44.5 |
| 3 | temperate_plains | 777 | 50 | 纯 AI 观战 | 345 | 390 | 45.5 | 23 | 1 | 37.8 | 41.5 |

（注：`regenerate({template: 'fertile_riverlands'})` 被证实不换模板——这是我发现的另一个 API bug，所以三局全是 temperate_plains。）

### 从数据看机制

- **Survival Score = TimeSec + 5·Births − 10·Deaths**（从 HUD 上 "+1/s · +5/birth · -10/death" 看板直接读出来的公式）。这个分数计算极度扁平：**时间是主项**。也就是说速通玩家"活着不动"等于"活着快进"，**没有真正的策略杠杆差异**。
- **DevIndex** 是 6 维度加权：population, economy, infrastructure, production, defense, resilience。production 一直是 100（蜜汁），defense/infrastructure/economy 变动大。我 Run 2 注入资源后 economy 冲顶推高 DevIndex，但**AI 的建造顺序仍然不产出 kitchen/clinic 连锁**——说明策略树的上层被 AI 把持，玩家手动干预几乎没有意义。
- **Raid Escalation** 随 DevIndex 指数上升：Run 1 tier 3 / intensity 1.9x，Run 2 cheese 后 tier 5 / intensity 2.5x。**这意味着爬分本身会自动加大威胁**，和前 Frostpunk 类似的自平衡机制。但是：因为 emergency relief + AI 自动造墙，即便到 tier 5 我的死亡也只有 3 人。**难度曲线没法把玩家逼到极限**。

### 想象中的"最优解"以及它为什么不存在

速通玩家的 Dominant Strategy 应该长这样：
1. 开局暂停 → 手工规划 5 个 Farm + 2 个 Lumber + 1 个 Warehouse + 2 个 Kitchen + 2 个 Wall；
2. Fast Forward 到处理链转起来；
3. 中期开启 Smithy + Clinic 把 tool / medicine 备足；
4. 定期用 Bridge 跨水扩展资源盘。

但实测下来：
- **手动摆不动几个建筑，AI 已经自己摆了**（AI 在第 1 秒就开始建造）；
- **摆建筑的位置选择权也被限制死了**（scenario anchors 固定了关键点位，placeToolAt 还有 bug）；
- **kitchen 链条需要 stone，而 stone 在开局几乎是 0 甚至会一直卡 0**——这是 AI "卡死在伐木+种田" 的根本原因；
- **而 stone 补齐的唯一办法是建 Quarry + 等**，但 AI 建了 13 个 Quarry 还是 stone=0（Run 1 全程），说明 **stone 收益被别的系统吸走了**（可能是 wall 消耗，可能是道路扩展）。

所以游戏内**没有真正的最优解可供玩家发现**，玩家只能选择"相信 AI" 或者"作死干预再被 AI 覆盖掉"。

## 优化深度评估

| 可优化的维度 | 玩家能干预吗 | 干预有效吗 |
|---|---|---|
| 建筑摆放位置 | 部分（可点击地图） | AI 会在你旁边继续摆，覆盖策略 |
| 建造顺序 | 可以（手工选工具） | AI 不会听你的，照自己顺序继续 |
| 资源分配 | 不能（统一池子） | 无 |
| 工人分工 / 角色 | 不能（populationTargets 是自动分配） | 无 |
| 时间流速 | 可以（FF 4x，console 可 50x） | 有效，但只是加速观看 |
| Scenario 选择 | 开局可选 | 有效，但只影响地形不影响策略空间 |
| Seed | 开局可选 | 有效，但影响有限 |
| 防御布置 | 理论上可以（Wall 工具） | AI 会自己造 171 面墙，你摆的微不足道 |

**结论：这游戏几乎没有"player skill expression"**。它更像 RimWorld 的 storyteller 模式下的纯模拟观看，而不是 Factorio / Dyson Sphere Program 那种"每一个选择都产生显著结果"的优化沙盒。对速通玩家来说，**可挑战的只是找 bug**——我确实找了三个（timeScale 可写、resources 可写、placeToolAt 忽略 tool 参数）。

## 失望点总结

1. **AI 抢戏**：从第 1 秒开始自动建造，玩家不存在"早期规划空间"。
2. **Score 公式过于扁平**：Survival = Time + 5·Births − 10·Deaths，没有奖励效率、科技、品味——拖时间就行。
3. **Kitchen/Clinic 链条在常规 run 里几乎不会被 AI 触发**：三个 run 中 AI 自动造出 kitchen 的只有我注入 stone 之后的 Run 2，且只有 2 个。整个"处理链系统"（raw → refined）几乎看不到效果。
4. **Worker 从 carry 吃饭，而不是从全局池**：我注资 99999 food 他们照样饿死，感觉像 double-book 的账本系统，exploit 乐趣直接被扼杀。
5. **Emergency Relief 保险机制让作死失败**：我几乎没法让一个殖民地真正 collapse。"能不能把全体玩死" 这个速通子目标被防死。
6. **`regenerate` API 不换 template**：我三次尝试都返回 temperate_plains，UI select 的变化不被 Start Colony 尊重。
7. **`placeToolAt` 的 tool 参数形同虚设**：破坏任何 automation / speed-strat。
8. **Raid 强度随 DevIndex 指数升级**，但防御效果几乎线性，导致中期"稳态"比"冲分"更优——反速通。
9. **没有 leaderboard 或历史记录**：跑完一局没有任何 Score 汇总页，只有 HUD 上一个 "Survived 00:06:27 Score 412 · Dev 48/100" 字样，**我得自己截图记账**。
10. **FastForward 4x 按钮形同虚设**，因为 console 能拉到 50x 以上。正经玩家没人会点它。

## 有没有 cheese / bug / 必赢策略？

**Cheese**：`timeScale = 50` + `resources = 99999` + `threat = 0` + `prosperity = 100`，Dev 从 48 飙到 82，Survival 从 390 到 817。这是**必赢打法**，但需要 dev console。

**Bug 清单**（3 个，以 speedrunner 报告风格）：
- B1. `__utopiaLongRun.placeToolAt` 的 tool 参数被内部覆写为整个 args 对象，始终只摆 road。
- B2. `__utopiaLongRun.regenerate({template})` 不切换 template，仅切换 seed。
- B3. 全局 food 资源与 worker carry food 为两本账，全局池爆满时 worker 仍可死于 starvation（Run 2 observed at t=440/528）。

**必赢策略**（非 cheese 版本）：**什么都不做**，让 AI 自动建造。三局里纯 AI 挂机 Run 1 的 811 Survival 就已经相当稳了，玩家插手大概率只是降低效率。这对一个标榜"策略模拟"的游戏来说，是最刺耳的差评。

## 游戏真的有玩法上限吗？

老实说——**没有明确的上限**。`∞ Survive as long as you can` 意味着理论上无尽，但实操上：
- timeSec 是 float，可以无限涨；
- Score 单调递增，没有段位封顶；
- DevIndex 0–100 封顶；
- 没有周目、没有结局、没有解锁；
- 没有在线排行、没有可分享的 seed 成就。

所以"玩法上限"其实是"玩家的耐心上限"——我跑到 Run 2 的 817 秒基本就已经在等 AI 摆完剩下的墙了，真的没动力继续。对一个速通玩家来说，**没有一个可以自豪展示的"pr"（personal record）指标**，也就没了重开理由。

## 评分理由

- **核心玩法可发现性**：差（玩家感受不到自己在做什么影响） — −2
- **数值平衡**：一般（有 fallback 和 storyteller 兜底，但 kitchen 链几乎不触发，stone 结构性短缺） — −1
- **调试 API / 开发可见性**：好（exploit 随手可得，找 bug 很爽） — +1
- **HUD / 反馈清晰度**：中（数字足够多，但 Score 公式不显眼） — ±0
- **可重玩性**：差（6 个模板 regenerate 还有 bug，seed 差异不大） — −1
- **速通潜力**：差（无 leaderboard、无难度挑战、无反作弊） — −1
- **让玩家产生 "想再来一局" 冲动**：很差 — −1

综合结论：这更像一个**沙盒技术 demo**，不像一个**能让速通玩家反复挑战的游戏**。AI 自动化系统抢走了玩家绝大部分的优化乐趣，Emergency Relief 削弱了作死反馈，Score 公式扁平到让"只等时间"成为最优解。

## 一句话总结

**调试 API 比游戏机制本身更好玩**——能写 timeScale=50、能改 resources=99999、能找出 3 个 bug 让我笑出声，但一个硬核玩家真正想要的"我的选择是否改变结局"，这款游戏没给出答案。

## 最终评分

**3 / 10**

给 3 分是因为调试接口丰富（我能 3 分钟摸清 Score 公式）、数值系统骨架完整（6 维 DevIndex、raid escalation tiers）、AI fallback 在极端情况下真的不崩。但**作为速通游戏，这不是一个有上限可以追的游戏**。它是 Anthropic 给 LLM-agent 用的仿真沙盒，而不是给人类玩家的策略游戏。玩家想 min-max 时，AI 早就已经决定好了。

---

（评测数据：3 runs / 60+ playwright 交互 / 1 次 cheese 验证 / 3 个 bug 复现 / 2 个显著设计缺陷）
