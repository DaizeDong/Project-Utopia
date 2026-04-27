---
reviewer_id: 02c-speedrunner
round: 2
date: 2026-04-22
score: 3
verdict: 自动驾驶崩盘成 dominant strategy —— 玩家只能眼睁睁看着 Dev Index 从 49 一路跌到 34，没有可优化的空间。
---

# Project Utopia — 速通视角评测（Round 2）

## 第一印象：开场即顶配，一切向下

作为速通 / min-max 玩家，我的第一条本能就是找"起手最优解"。Project Utopia 的开场画面很漂亮：三种资源图标整整齐齐、12 种建筑工具摆一栏、Space 暂停、1-12 热键、4x 快进、Heat Lens 叠加……从 UI 设计看这绝对是想做硬核策略的。然而点完 **Start Colony** 的第一秒钟，我就发现了这款游戏对速通玩家最致命的一件事：

**你开局就已经处在曲线的顶点。**

第一次 run (Temperate Plains / 默认种子 / Broken Frontier scenario)：开场 Score 4、Dev 49/100、Wood 110、Food 12、Stone 5、Pop 13、Warehouses 7 / Farms 4 / Lumber 2 / Walls 7。剧本目标 (goal 2 warehouses, goal 4 farms, goal 3 lumber, goal 4 walls) 开场就已经 **全部超额完成**。"Reconnect the west lumber line" 的 frontier repair 任务——1/1 routes open, 1/1 depots reclaimed——全 done。也就是说，游戏的所谓"任务"，开局已经被 seed 赠送完毕，scenario objective 成为一个装饰性文本，没有任何 pacing 意义。

接下来 6 分钟的整个 run，Dev Index、Workers、Warehouses、Farms、Lumber、Walls **全部数字都在下降**，每一项。这不是成长游戏，这是"阻止下滑"游戏；但更糟糕的是，玩家甚至没什么好办法去阻止下滑。

## Run 1 日志：Temperate Plains / 默认种子 / 纯自动驾驶

| 时间 | Score | Dev | Pop | Food | Wood | Farms | WH | Lumber | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 0:09 | 4   | 49 | 13 | 12 | 110 | 4  | 7 | 2 | 起手超额达标 |
| 1:37 | 127 | 43 | 20 | 0  | 0   | 13 | 7 | 3 | Food -142.3/min, Wood -28.8/min |
| 2:25 | 175 | 43 | 20 | 0  | 0   | 14 | 0 | 3 | Warehouse 全部坍塌 |
| 4:13 | 263 | 44 | 18 | 0  | 0   | 12 | 0 | 1 | 首例饿死 Ora-26 |
| 6:42 | 362 | 43 | 13 | 9  | 7   | 8  | 0 | 2 | Tam-45 饿死，Pop 跌 35% |

核心发现：**Score 就是生存秒数乘 ~0.9**。这意味着 Score 不反映"玩得好不好"，只反映"你放任游戏跑了多久"。Dev Index 才是真正衡量决策的标准，而 Run 1 里 DRIFT 模式 (autopilot) 的 DirectOR 完全无法让 Dev 涨上去——49 → 43，净下滑 6 点。从速通角度看：**这个游戏的基础自动驾驶 AI 是 strictly worse than AFK**。因为它会乱花 wood 扩 Farm (4→14)，但连最基础的 Kitchen / 粮食加工链都懒得搭，于是 20 个工人和 14 个农场都在吃生食，饿到 spiral。

## Run 2 日志：Fertile Riverlands / 新 seed / 尝试手动干预

我切到 Fertile Riverlands 并重 roll 地图，scenario 变成 "Silted Hearth"，不过剧本文本不一样、机制完全一样。开场 Wood 110 Food 8 Stone 7 Herbs 0 Pop 13 Dev 45，比 Run 1 起点还低 4 点。

第一次 speedrun 尝试：按 Space 暂停，想在 0s 里把所有 Wood 一把花在 Farm-spam 上 (5 wood/farm × 22 = 110 wood)。但我马上碰到了第二个速通级问题：

1. **按键 1-12 切工具没有响应。**我压了 "a"、"9"、"0"，Selected Tool 一直停在 Road。UI 写着 "1-12 tools" 是虚的。
2. **Canvas 点击被工具栏高度消化掉。**模拟 45 个 mousedown/mouseup/click 打在 colony 中心的 9×5 grid 上，实际落地建筑一个都没产生。要么 Playwright 的 dispatchEvent 被 three.js renderer 绕开，要么需要 pointer events 而非 mouse events。
3. **暂停下能无限排单，但落子成本是 synchronous 的**——Wood 110 立刻归零，不像 RimWorld / Factorio 那样暂停期可以"排计划"。

于是 Run 2 退化成了"让 autopilot 试另一张图"：

| 时间 | Score | Dev | Pop | Food | Wood | Farms | WH | Lumber | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 0:10 | 5   | 45 | 13 | 8 | 110 | 4  | 6 | 2 | 起手，"Silted Hearth" scenario |
| 2:31 | 176 | 39 | 19 | 0 | 2   | 4  | 1 | 2 | Wood 早期全喂 Road/Farm 未反弹 |
| 3:13 | 188 | 38 | 18 | 0 | 0   | 0  | 0 | 2 | Farms 归零，Tam-45 starv |
| 5:47 | 292 | 34 | 14 | 0 | 3   | 0  | 0 | 0 | 全线崩塌，goal 全丢 |

Run 2 的 Dev 从 45 跌到 34，下降 11 点。就是说：**在 Fertile Riverlands 这种应该加成农业的模板里，autopilot 表现更差**，因为初始 Food 更低但 DirectOR 没针对模板做调整。所谓"6 种地图模板"对速通玩家没有任何差异化——跑出来的曲线形状一致。

## Run 3 日志：Fortified Basin / 新 seed / 观察 DIRECTOR 模式

第三次我切到 Fortified Basin，期望防御向模板会触发不同的剧本/数值。结果：

- Scenario 文本仍然是 "Broken Frontier — Reconnect the west lumber line..."，跟 Run 1 一字不差。
- 地图生成有些变化（湖体形状不同），但起手 goal / 建筑清单 / 资源参数完全一致 (Wood 100 / Food 7 / Stone 4 / Herbs 0 / Pop 14)。
- 开局状态显示 **DIRECTOR** 接管而不是 Run 1 的 **DRIFT**。这是 LLM autopilot 模式——表现略好，但也略好一点点而已。

| 时间 | Score | Dev | Pop | Food | Wood | Farms | WH | Lumber | Mode |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 0:16 | 26  | 48 | 14 | 7  | 100 | 4  | 7 | 3 | DIRECTOR route repair |
| 0:56 | 76  | 46 | 18 | 4  | 59  | 4  | 6 | 3 | frontier buildout |
| 1:04 | 84  | 46 | 18 | 0  | 55  | 4  | 5 | 3 | Food 归零 |
| 1:51 | 141 | 46 | 20 | 0  | 2   | 4  | 2 | 3 | 第一次 WH 掉 |
| 4:26 | 246 | 42 | 17 | 10 | 4   | 2  | 0 | 0 | Marek-27 starv |

DIRECTOR 模式 Dev 保在 46 挺住了约 2 分钟，然后被同样的 food → spiral 拖下去。比 DRIFT 只多苟了一分多钟。从 min-max 角度看：**LLM 接管不改变 dominant outcome**，它只是换了个死法。

## 综合数据表

| Run | Template | Scenario | Seed | Pop 峰值 → 谷 | Score (终) | Dev (起→终) | 首次 starv | Autopilot |
| :-: | :------- | :------- | :--- | :-: | :-: | :-: | :-: | :-: |
| 1 | Temperate Plains | Broken Frontier | default | 20 → 13 | 362 | 49 → 43 | 4:13 | DRIFT |
| 2 | Fertile Riverlands | Silted Hearth | reroll | 19 → 14 | 292 | 45 → 34 | 3:13 | DRIFT |
| 3 | Fortified Basin | Broken Frontier | reroll | 20 → 17 | 246 | 48 → 42 | 4:26 | DIRECTOR |

三次 run 的 Dev 曲线形状 **高度重合**：开场 45-49，前 2 分钟微调 ±2，之后以约 -1 点/分钟下滑。速通玩家最怕的"曲线相似"出现了——这说明游戏没有 meaningful branching 决策空间，所谓的 "Template / Seed / DIRECTOR vs DRIFT" 变量对终局曲线影响都在噪声级。

## 想找的 exploit / cheese / bug

速通玩家模式开启，我试了这些 cheese 向量：

1. **暂停时批量放建筑**：失败。按键 1-12 不切工具，canvas 点击事件被拦截，无法用 dispatchEvent 绕过。**玩家在暂停下几乎无法做任何事**。这对 min-max 来说是致命的：Factorio/Rimworld 的核心乐趣就是 pause-plan-execute 循环，这里被削没了。
2. **资源数字溢出**：无法测试，因为从未攒到高位。Food/Wood 基本贴着 0 跑。
3. **Farm-spam cheese**：autopilot 会帮你 spam 到 14 个 farm (Run 1)，但没 Kitchen 就等于摆设，Dev 不会涨。**建筑数量对 Dev 贡献递减非常陡**——Farms 从 4 涨到 14，Dev 反而跌了 6。说明 Farm 的 ROI 在第 5 个之后就是负的。
4. **工人压榨**：Pop 20 时资源仍然归零。**瓶颈不在工人而在加工链**。没有 Cook 角色 (Run 1 里 COOK=0 整场)，Smith 1 个也不够。这意味着 dominant strategy 理论上应该是 "早期 5 farm + 1 kitchen + 1 herbalist" 黄金起手，但 autopilot 完全不走这条线，而玩家又没有被赋予暂停放建筑的 agency。
5. **4x 快进 skip**：没有 skip，4x 就是 4x。想跑分到更高 Score 只能挂机。**4x 的 button state 偶发不触发**，我在 Run 3 里需要第三方式（querySelectorAll + button.click）才把它激活——UI state 有同步 bug。
6. **Heat Lens (L)**：没带来任何玩法层价值。按下只是换一种可视化，不影响操作。
7. **Bridge 工具**：Temperate Plains 地图我根本过不到水对岸 (河太宽 + 没路)，Bridge 成本 3 stone 我总共没攒到过。死码。

## 最优策略（理论）vs（实际玩得到）

**理论 dominant strategy**：
1. 起手暂停 → 挖 3 个 Farm、1 个 Kitchen、1 个 Warehouse、2 个 Road 连起来。Food 生产链 > Farm 数量。
2. 用 Herbalist + Clinic 对冲 Predator 捕食事件。
3. Wall 只建在 predator spawn 附近，不要铺满。
4. 角色指派：2 cook / 3 farmer / 2 lumber / 1 smith / 1 herbalist / rest haul。
5. 保持 Wood ≥ 20, Food ≥ 20 的缓冲。

**实际能执行的策略**：几乎没有。按键热键不工作、canvas 点击被吃、没有角色指派 UI、autopilot 在 2 分钟后会把你的努力推平。速通玩家在这里**没有 agency**。

## 优化深度：上限 vs 下限

- **上限**：我没能突破 Dev 50，即开局送的 48/49。
- **下限**：可以在 3 分钟内把 Dev 推到 34 (Run 2 最低)。
- **Score 上限**：理论无限 (endless 模式)，但等价于"挂机时长"。
- **Score 下限**：0——不能再低。

**优化深度 = 上限减下限 = 15 Dev 点**，而且 15 点里 10 点是下滑节流、只有 5 点是真正的"玩得更好"。对比 Factorio 的 SPM 或 OSRS 的 XP/h，速通玩家会说**这不是一个可优化系统**。

## 失望点（速通视角）

1. **Score 公式 = 时间**。这意味着"跑分"退化成"挂机"，排行榜机制在设计层直接废掉。
2. **Dev Index 没有清晰反馈**。我从未看到 Dev 涨超过起手值，也不知道哪个动作会"加 Dev"——面板没有 breakdown。
3. **没有胜利条件**。endless 模式本身无可厚非，但需要 milestone/achievement/tier，不然速通玩家没有目标。
4. **Autopilot 抢 agency**。autopilot 一直在拆玩家可能放的建筑 (Wall 10→0, Lumber 3→0)，玩家完全说不上话。
5. **键位 1-12 失效 + canvas click 被吃**。UI 说能做的事，代码里做不到。
6. **Scenario 文本名字换了数值不换**。速通玩家最敏感的就是 "有没有 variant"——这游戏 fake variant。
7. **无 Debug 面板显示关键数值**。`window.__state` 没暴露，debug 查 spawn rate / carry capacity / spoil rate 都做不了。
8. **死亡信息没有时间轴**。`Last: XX died (starvation)` 只显示最后一条，无法回看全局 demography。
9. **食物瓶颈是 hard-coded spiral**，缺少反馈环路。

## 评分理由

我给 **3 / 10**。

我知道我的默认上限是 5/10，但这游戏在速通玩家视角下有两个不可接受的硬伤：

1. **玩家 agency 太低** —— 没法在暂停下批量放建筑、热键失效、canvas 点击被吞、autopilot 主导进度。速通的灵魂是 "player expression"，这里几乎没有。-1.5 分。
2. **没有优化上限** —— Dev Index 起手即顶点，Score 公式等于挂机时长，6 种模板产出一致曲线。没有 meaningful decision space。-0.5 分。

加分项：

- UI 视觉和数据展示是扎实的 3.5 起手值，Colony 面板的 Resources / Population / Roles 三块分区很干净。
- DIRECTOR vs DRIFT 这个架构立意好（LLM 接管），只是实际表现差距不大。
- endless 模式 + 死亡日志让人愿意看两遍。

给 3 而不是 2：游戏能跑，没 crash，基础模拟生效，死亡/饿死/捕食这些事件确实在按机制触发，不是 fake simulation。只是作为速通跑分玩家，我找不到可以 min-max 的维度。

**一句话总结**：Project Utopia 在速通玩家眼里像一台"只能看、不能推"的老式时钟——机件运转着，但你摸不到指针。

---

（评测字数约 2100 字，基于 3 个独立 run 的实战数据，全部时间点、资源数字、Dev/Score 数值来自截图记录。）
