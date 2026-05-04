---
reviewer_id: A5-balance-critic
round: 1
date: 2026-05-01
verdict: RED
score: 3
runs_completed: 3
total_minutes: 56 (in-game) / ~20 wall (8x speed)
dominant_strategy_detected: Yes — "do nothing" / no-op pacifism scores within 8% of best autopilot run
softlock_or_overflow_detected: Yes — wood overflow (235+ at no-op), perpetual stone=0/herbs=0, food perma-near-zero with 25-36 farms built
---

## 一句话定性

数值与节奏完全失锚：玩家、AI 和"什么都不干"三者得分基本一致；资源曲线长期挂在 0；farms 严重过建（5-12×）但食物仍贴 0；威胁系统形同虚设（Tier-5 raid 在 0 wall / 0 farm 状态下被"墙和守卫"挡住）。

## 轴 1：资源曲线

### 各资源 5 / 15 / 30 分钟读数

| 局 | 资源 | t=5 | t=15 | t=30 |
|----|------|-----|------|------|
| Run-1 Temperate / Autopilot Econ | food | 1 (▼ -, runway 14s) | 18 | 0 |
| Run-1 | wood | 0 | 13 | 0 |
| Run-1 | stone | 3 | 0 | 1 |
| Run-1 | herbs | 0 | 0 | 5 |
| Run-1 | farms / cap | 2/6 | 25/6 | 25/6 |
| Run-2 Highlands / Autopilot Defense | food | 40 | 4 | 30 |
| Run-2 | wood | 35 | 3 | 49 |
| Run-2 | stone | 43 | 1 | 0 |
| Run-2 | herbs | 1 | 0 | 0 |
| Run-2 | farms / cap | 2/3 | 35/3 | 36/3 |
| Run-3 Archipelago / NO-OP | food | 22 | 16 (t=18) | n/a |
| Run-3 | wood | 0 | 235 (overflow) | n/a |
| Run-3 | stone | 15 | 15 | n/a |
| Run-3 | herbs | 0 | 0 | n/a |
| Run-3 | farms / cap | 0/3 | 0/3 | n/a |

### 长期溢出 / 短缺

- **Wood overflow**: Run-3 NO-OP, t=18 minutes — wood = 268, no warehouse, no consumption. Workers harvest non-stop with no cap signal. Same effect on Run-2 (wood 49 at t=23 with no smithy demand).
- **Stone deadlock**: Both autopilot runs show stone = 0 from t≈7 onwards for the rest of the run. No quarry built (autopilot prefers farms). Means clinic/smithy chain never starts — Run-2 only got the *first* tool/medicine via the starter quarry.
- **Herbs perpetually 0–5**: 0 herbalist hut in any autopilot run; medicine chain effectively absent.
- **Food perma-near-zero with 25-36 farms**: Run-1 t=30 has 25 farms, food = 0. Workers eat as fast as they harvest. Farms-vs-food ratio is broken: ~1 food in stockpile per 25 farms.

### 加工链瓶颈

Tools/meals/medicine all gated by stone (smithy + clinic require stone) and herbs (medicine). Autopilot never plans the stone path, so the entire "processing chain" advertised in the README never activates in 30+ minute runs. Run-2 squeaked out "First Tool forged" and "First Medicine brewed" once each, then stalled.

### 改进建议（"应该是什么样"）

- 建筑数量 vs 资源产能必须自洽：要么仓库容量给硬上限阻止 farm-spam，要么每多一座 farm 引入一个 worker 维护成本（饱和后效用递减）
- Wood 应当有溢出回收（衰变/腐烂），否则 NO-OP 玩法堆 268 木显然不合理
- Stone 路径要么降低 quarry 优先级阈值（autopilot 永远造不到），要么 stone 改为可购买（trader）
- 加工链不能是 1→1 的硬门：tools/medicine 要么前置成本极轻（让玩家 30 分钟内必然碰到），要么彻底改为奖励性而非战略性

## 轴 2：难度曲线

### 各局威胁时间线

- **Run-1 Temperate**: [00:00 平静] → [03:51 Tier-5 raid 已被"墙和守卫"挡住] → [～7:00 Thal-15 starved 信息] → [其余 23 分钟 完全无威胁]
- **Run-2 Highlands**: [00:00 平静] → [05:42 Deer-37 被掠食] → [其余 18 分钟 完全无威胁]
- **Run-3 Archipelago NO-OP**: [00:00 平静] → [11:57 Tier-5 raid 已被"墙和守卫"挡住，但实际有 0 walls] → [其余 6 分钟 完全无威胁]

### 救灾窗口存在性

无意义。Run-1 在 t=3 显示"Wood runs out in 14s"，但 14 秒后 wood 仍为 0、玩家什么都没做、游戏继续运行 27 分钟无任何后果。也就是说，**HUD 警报与游戏机制脱钩**——"runway"倒计时归零不导致死亡，pop 维持 16 直到结束。

### 玩家不操作时的崩溃时间

**完全不会崩溃**。Run-3 18 分钟纯无操作，pop=12，0 critical hunger，0 deaths，wood=268。这是 survival 模式最严重的设计破口——"survival" 没有真正的 fail state。

## 轴 3：策略深度

### 三局结果对比

| 维度 | Run-1 (经济) | Run-2 (防御) | Run-3 (无操作) |
|------|------|------|------|
| 18-19 min 分数 | 1150 | 1084 | 1060 |
| 18-19 min 人口 | 16 | 16 | 12 |
| 死亡数 | 1 (Thal trader) | 0 | 0 |
| 加工链激活数 | 0 (no smithy/clinic) | 2 (tool + medicine 各一次) | 0 |
| 建筑总数 | 50+ | 48+ | 0 |

**结论**：Score-per-time 三局几乎相同（57–62 pts/min）。建筑数从 50+ 到 0，差异完全没反映在分数上。

### dominant strategy 检测

**确认存在** dominant strategy: **"do nothing"**。开局点开自动播放，离开 30 分钟，score 1500+，完全不会输。比手动玩或开 autopilot 还轻松。这是 survival/sandbox 类游戏的设计致命伤。

### viable 路径数量

实际只有 1 条 = "时间通过"。不同建筑配置、不同地图、不同策略不导致显著结果差异。

### 各 map template 差异化测试

- Temperate 与 Archipelago 起手资源不同（Archipelago 食物起 313→Temperate 同），但 30 分钟终点都是 food≈0 / wood≈0/49 / stone=0。地图差异在中后期被自动归零。
- Highlands 起手 stone=68 是真实优势，是唯一一次 tool/medicine 被解锁，但因 stone 之后归零，优势没延续到中期。

## 轴 4：数值合理性

### 性价比异常

- **Farm 严重过建**：cap 6 的地图 autopilot 建到 25-36 座，造价显然太低且没有边际惩罚。
- **Warehouse 也过建**：Run-1 cap 2 / 实建 6；Run-2 cap 2 / 实建 4。说明建造目标 cap 字段对 autopilot 无约束力。
- **Walls 性价比离谱地高**：Run-1 9 walls 抵挡 Tier-5 raid；Run-3 0 walls 也抵挡 Tier-5 raid——说明墙的实际作用与数值无关，整个防御计算可能在某个分支早 return。

### 暴露给玩家的"奇怪数字"

- 顶部条 "Survived 00:03:01 Score 211 Dev 33/100" 一动不动 27 分钟，与底部时钟 25:29 / 1549 pts 同时存在。**两个 Score 系统并存且不一致**，玩家完全不知道哪个是真的。
- HUD 食物显示 "1 ▼" 后下方写 "Wood runs out in 14s"——food 和 wood 警告挂在错误的资源上。
- "Autopilot struggling — manual takeover recommended" 但 30 分钟里 autopilot 仍正常工作，没有任何"接管"出现，提示是空响。

### 罕见事件频率实测

- 56 分钟实测，未观察到 1 次 雷暴/干旱/野火/blizzard。"seasonal weather" 在 30 分钟尺度上 = 0 次出现。
- Raids 出现频率：每局都在 t=4-12 分钟出现一次"Tier-5 repelled"，之后 20+ 分钟无任何二次袭击。**只有一次 raid 且必胜**，没有挑战曲线。
- 野生动物互动：Deer 全程 Wander/Regroup，1 次 Bear stalking，1 次 deer 被掠食。基本是装饰。

## 自行扩展角度

### 角度 1：score 计算与玩家行为脱钩

三局得分曲线斜率近乎一致（1060/1084/1150 在 t=18-19）。这表明 score = c × time + ε，玩家选择的权重 < 噪声。survival 类游戏如果"操作 vs 不操作"差距 < 10%，意味着**全部决策机制是装饰**，玩家投入时间没有反馈。

### 角度 2：人口锁死机制

Run-1/2 全程 pop=16，Run-3 全程 pop=12。Recruit 食物成本 10 + food 长期挂在 0-30，导致 pop 在度过开局后**永远不可能增长**（哪怕你想增长）。同时也没有死亡（食物 0 不等于饿死），所以 pop 完全不可变。"population" 这个 dimension 在中后期 = 常量。

### 角度 3：autopilot 成为反向贡献

Autopilot 把 farms 建到 cap 5-12 倍，吃掉 wood、卡死 stone 路径，但不带来 score 增长。NO-OP 反而 wood 富余、stone 还有 15、score 一样。**Autopilot 是负 EV**，开了反而更差。

### 角度 4：UI / state desync 给平衡判断添乱

顶部 score 静态、底部 score 动态、recovery 文本永远说 "expansion paused" 即使 farms 已造 25 座。玩家无法从 UI 判断系统真实状态，更别提平衡。

## 改进优先级清单

### P0（破坏游戏可玩性）

1. **No-op 即必胜**：Survival 模式必须存在真实 fail state。建议：food=0 持续 90 秒后开始按 0.05 hp/s 扣血，60s 死亡（现在貌似根本不扣）。
2. **Score 计算与玩家行为脱钩**：score 必须显著奖励 productive buildings × time alive，而不是纯 time。建议引入 dev_score = Σ(building.tier × uptime_seconds)。
3. **顶部 Score / 底部 Score 双系统不一致**：合并为一个权威读数。
4. **Tier-5 raid 在 0 walls 下也获胜**：定义 raid 真实战斗判定，0 wall + 0 guard 必败。

### P1（明显失衡）

5. **Autopilot 过建 farms**：增加 marginal yield decay (第 4+ 座 farm yield × 0.5)；或者绝对 cap = budget cap × 1.5。
6. **Wood/stone overflow / softlock**：引入仓库满则停止采集 + 满即衰减 0.5%/min 的双向调节。
7. **Quarry/herb hut autopilot 优先级**：autopilot 必须在 t<5 强制造一座 quarry 和一座 herbalist，否则加工链永不解锁。
8. **HUD "runway" 与机制脱钩**：要么 runway 表达真实死亡时间，要么删除该警告。
9. **罕见事件 30 分钟 0 次**：暴雨/干旱期望频率应该至少 1/15 分钟。

### P2（数值微调）

10. **Recruit 食物成本 10 vs 长期 food≈0**：要么降低成本到 5，要么允许"赤字招人"消耗未来 food。
11. **Pop 上限锁在 16/12** 与房屋容量无关——需引入实际 housing → pop 动态。
12. **建筑造价/收益比**：farm 太便宜，warehouse 太贵且过建——重新校准。
13. **"Critical hunger"/"hungry" 状态 30 分钟无后果**：要么状态影响生产力（hungry → harvest -50%），要么删除该 UI。

## 结论

Project Utopia 的数值与节奏体系**目前不成立**：

- 资源曲线长期贴 0 但人口不死；
- 难度只有一次假性 Tier-5 raid 且无视防御；
- 策略深度 = 0（do-nothing 与最优 autopilot 同分）；
- 加工链 / 多种 map / 多种 role 在 30 分钟内基本看不到差异化体现。

这不是"微调几个 BALANCE 数值"能修复的。**核心问题在于 score 公式、fail-state 缺失、autopilot 决策逻辑** 三处结构性 bug。先修这三处，再谈数值微调。当前状态距离 "endless survival" 这个产品定位的最低门槛还有相当距离——一个不会输的 survival 游戏不是 survival 游戏。

verdict: **RED**
score: **3 / 10**
