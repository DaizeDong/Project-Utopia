# Project Utopia — 速通/最优化玩家深度评测报告

**测评人身份：** 速通玩家 / Min-Max 优化者 / 机制猎人  
**测评日期：** 2026-04-25  
**游戏版本：** v0.8.x（基于构建信息推断）  
**总游玩时间（实际）：** ~60 分钟，累计 ~50 次交互  
**评分：** 4/10

---

## 一、身份自述

我是一个习惯开 Debug 面板、读数值、找 dominant strategy 的玩家。打开新游戏的第一件事是找暂停键、找分数公式、找资源上限、找自动化是否可绕过。Project Utopia 号称 RimWorld 风格的殖民地模拟，我的目标很简单：**找出最高分策略、发现数值漏洞、确认玩家干预是否真的有效**。

---

## 二、Run 1 日志 — Temperate Plains 冷启动观察

**地图：** Temperate Plains（种子 1337 → 后切换为 4353）  
**策略：** 默认配置 + 快进 × 8 + Autopilot ON  
**目标：** 基线数据采集，了解默认 AI 行为

### T=0s — 初始状态
- 资源：Food 200, Wood 27, Stone 7, Herbs 0, 工人 12 名
- 工人全员处于 "Idle · hungry/starving" 状态
- Dev Index: 40（"foothold"阶段）
- 已有建筑：Kitchen（游戏内置/自动建造）

**关键发现：** 游戏在开始前 AI 就已经自动建造了 Kitchen、多个 Warehouse、道路，玩家拿到手的已经是"启动好"的殖民地，而不是真正的零基础。

### T=8s — 极速扩张
- Food 上涨到 210（Farm 工人开始产粮）
- Wood 暴跌：27 → 4（建造消耗）
- 工人从 12 增至 13（Garek Venn 出生！）
- 角色分配变为：FARM×2, WOOD×6, STONE×1, HERBS×1, COOK×1, SMITH×1, HAUL×2

**第一个 cheese 发现：** 工人 Dova Vesper 处于 "starving"（饥饿值 0.79），但游戏没有立即处罚，她还在正常工作。**饥饿阈值对工作效率的实际影响非常小，短期饥饿可以忽视。**

### T=19s — Debug 面板深挖
通过 JavaScript 访问 `debugFloatingPanel`，获得完整状态：

```
Seed: 1337 | Temperate Plains
Prosperity: 66.8 | Threat: 38.8%
Score: 19 | Deaths: 1 (predation)
已建设：warehouses 5/2 | farms 4/6 | lumbers 2/3 | roads 30/20 | walls 8/8
Weather: rain, 27 hazard tiles, pressure 0.40
AI Mode: off / fallback (LLM proxy DOWN)
```

**重大发现：AI LLM 后端完全离线（proxy=down, hasKey=false）**。整个测评期间，游戏始终在 DIRECTOR/fallback 模式运行，没有真正的 LLM 决策。这意味着游戏宣传的"AI 叙事导演"功能在当前环境下根本不可用。

### Run 1 综合结果
- 最终 Score：约 77（T=57.7s）
- Deaths: 1（predation）
- Prosperity 维持 66-68 区间
- 工人增至 18 名
- 结束原因：Bandit raid（土匪突袭）后 Prosperity 暴跌至 47，最终崩溃

---

## 三、Run 2 日志 — Archipelago Isles 长生型殖民地

**地图：** Archipelago Isles（种子 56291）  
**策略：** 默认配置 + 快进 × 8 + Autopilot ON  
**特点：** 这是观察到的最长存活 run

### 关键时间线数据

| 时间点 | SimTime | Score | Prosperity | Threat | Deaths | Workers |
|--------|---------|-------|-----------|--------|--------|---------|
| T1     | 9.4s    | 14    | 70.9      | 27.2%  | 0      | 13      |
| T2     | 89.6s   | 134   | 43.6      | 42.9%  | 0      | 25      |
| T3     | 127.6s  | 192   | 43.6      | 42.9%  | 0      | 25      |
| T4     | 218.5s  | 268   | 26.6      | 54.2%  | 3(饥)  | 25→少   |
| T5     | 478.9s  | 358   | 24.9      | 25.4%  | 20(饥) | 8       |
| T6     | 768.4s  | 628   | 24.3      | 30.7%  | 22(饥) | 6       |
| T7     | 1021.8s | 861   | 23.4      | 32.5%  | 24(饥) | 4       |
| T8     | 1236.4s | 1076  | 26.3      | 32.5%  | 24(饥) | 4       |
| T9     | 1494.6s | 1334  | 26.3      | 32.5%  | 24(饥) | 4       |

### 核心发现：饥饿螺旋与"僵尸殖民地"

**最残酷的 bug/设计缺陷：** 在 T=218s 时，25 名工人中出现 3 例饥饿死亡。此后殖民地进入"僵尸状态"——即使工人数量从 25 暴跌到 4，剩余 4 名工人仍能无限期维持。到 T=1494s（24 分钟！），这 4 名工人依然在 Wander/Farm，Food 只剩 22 单位，Wood 只有 7，但游戏没有触发终局！

**得分公式实验：** 
- Score ≈ SimTime 的线性函数（约 0.87-1.4x 比率，随 Prosperity 变化）
- 帮助文档明确写道：**"Survival score is the time you keep the colony alive, with prosperity and DevIndex as the main multipliers"**
- 但实测中，即使 Prosperity 崩至 24，Score 仍在线性增长——说明倍率下限不为零

**关键发现：游戏不会因工人减少而强制结束**。只要至少有 1 名工人存活，Run 就无限续期。最终我们看到 4 名工人以 Wander 状态支撑了超过 20 分钟实际游戏时间。

### 地图特性观察
Archipelago Isles 的地形参数：passable=23.5%（仅 23.5% 可通行！），water=5276 瓷砖，这导致工人必须绕行大量水路。但正因为水路阻隔，敌人也难以进入，**威胁自然被地形控制**。这可能是这张图存活最长的原因。

---

## 四、Run 3 日志 — 极限食物优先策略测试

**地图：** Fortified Basin（种子 25523）→ 后切换多个  
**策略：** 手动设置 farmRatio=90%, cookQuota=8（极限粮食优先）  
**目标：** 验证配置干预是否有效

### 策略执行结果

通过 JavaScript 修改设置面板滑块：
```javascript
farmRatio: 90%   (原默认 50%)
roleQuotaCook: 8  (最大厨师配额)
roleQuotaSmith: 8
roleQuotaHerbalist: 0
roleQuotaHaul: 8
roleQuotaStone: 1
roleQuotaHerbs: 0
```

### 结果：策略**完全无效**

在 Coastal Ocean（种子 1337）的后续 run 中，farmRatio=90% 生效，但角色分配仍为：
```
FARM=8, WOOD=7, STONE=2, HERBS=2, COOK=0, SMITH=0, HAUL=3
```

**COOK 依然为 0！** 即使设置了 cookQuota=8，AI fallback policy 不分配 Cook 角色。

**根因分析：** 游戏的角色配额系统是**建议性的（advisory）**，而非命令性的。Fallback policy（DIRECTOR 模式）有自己的角色分配逻辑，**会无视滑块设置**。在 LLM AI 下线的情况下，玩家完全失去了对角色分配的控制权。

### Run 3 数据点
- Fortified Basin 种子 31005：T=32s，Score=37，Prosperity=71.6，Threat=22.5%，0 死亡
- 该图在 T=68s 遭遇 Bandit raid + 2 个 Trade caravan 同时，Prosperity 从 71 暴跌至 47
- 最终 Fortified Basin 系 run 最长 Score=93（T=68s），随后崩溃

---

## 五、综合数据表

| Run# | Template | Seed | 最终 SimTime | Score | 最终 Dev | Deaths | 结束原因 |
|------|----------|------|------------|-------|---------|--------|---------|
| R1-a | Temperate Plains | 1337 | ~57.7s | ~77 | 40→35 | 1(捕食) | 土匪突袭→崩溃 |
| R1-b | Fortified Basin | 1337 | ~68.2s | 93 | 未记录 | 1(捕食) | 土匪+商队→崩溃 |
| R2 | Archipelago Isles | 56291 | 1494.6s | **1334** | 24/100 | 24(饥) | 持续运行 |
| R3-a | Coastal Ocean | 1337 | ~99.9s | 139 | 未记录 | 1(捕食) | 饥荒崩溃 |
| R3-b | Fortified Basin | 25523 | 58.8s | 88 | 未记录 | 0 | 后续记录丢失 |

**备注：** 游戏以同一种子在多模板间循环重启，每次 run 失败后自动进入下一模板。Best Runs 面板始终显示"No runs yet"——说明游戏要求特定"正常结束"条件才能记录，而非简单的所有工人死亡。

---

## 六、发现的策略、Cheese 与 Bug

### 6.1 已确认 Cheese：地形防御天然屏障

**Archipelago Isles 天然软 cheese**：passable=23.5%，大量水路将 Saboteur/Predator 的路径大幅拉长，实际威胁远低于数字显示。在这张图上，配合 8× 快进可以让殖民地以"慢速崩溃"模式存活 20+ 分钟，累计 Score 超过 1000+。

**评价：** 这不是真正的最优策略，而是 map exploit。游戏设计者没有针对这个情况做额外惩罚。

### 6.2 已确认 Bug：COOK 角色永不分配

在所有测试 run 中，COOK 角色数量始终为 0，即使：
- Kitchen 建筑已存在
- roleQuotaCook 滑块设为 8
- 食物持续亏损

Fallback policy 的角色分配逻辑**完全忽视 Cook 岗位**。这导致 Kitchen 建筑形同虚设：食物永远以原始食材形式堆积（或消耗），无法转化为 Meals（营养效率 2×）。这是一个严重的平衡漏洞，也是"饥饿螺旋"的直接原因。

**引用帮助文档：** "Food (from Farms) + Kitchen → Meals (2× hunger recovery)." 但实测 Meals 始终为 0。

### 6.3 已确认 Bug：角色配额滑块无效

Settings 面板的 farmRatio 和 roleQuota 系列滑块可以被修改，事件也正确触发，但 **Fallback policy 忽视这些设置**。玩家无法通过 UI 控制角色分配。只有 LLM AI 在线时，policy 才可能响应这些参数。这对 LLM 离线情况（当前状态）是完全的玩家控制失效。

### 6.4 暂停建造测试结果

测试了在暂停时是否可以批量放置建筑：
- 暂停状态下点击画布：触发"Selection cleared"（清除选择），**不能放置建筑**
- 速度切换（1×→8×）会短暂导致执行上下文销毁，类似轻微崩溃
- **结论：** 没有可利用的"暂停建造"exploit

### 6.5 分数公式实证

根据 Help 面板和实测数据：
> Score = SimTime × 某个基于 Prosperity/DevIndex 的系数

实测数据验证：
- T=89.6s → Score=134（比率 1.49×，Prosperity=70）
- T=478.9s → Score=358（比率 0.75×，Prosperity=25）  
- T=1494.6s → Score=1334（比率 0.89×，Prosperity=26）

**结论：** Prosperity 高时分数乘以约 1.4-1.5×，Prosperity 崩溃时降至 0.75×。**提升 Prosperity 是最重要的得分策略，远比单纯拖时间有效。**

### 6.6 实际快进速度

Debug 面板显示 "actual ×7.6"（标称 8× 快进）。因为 FPS 在 10-52 之间大幅波动，实际加速比会在高负载时显著下降。当实体数量超过 20+ 时，FPS 通常跌至 10，实际快进约 ×1-2，远低于标称 ×8。

**换言之：8× 快进按钮是个谎言**——高实体数量下性能是瓶颈。

### 6.7 关键数值边界发现

从 Dev Telemetry 读取：
- 最大可观察到的 Workers：25 名（Archipelago Isles，T=89s）
- DevIndex 上限：100（"Dev 24/100" 在 20+ 分钟后仍是 24，说明极难提升）
- DevIndex 起始：40（每个 run 都从 40 开始）
- DevIndex 变化：在 Prosperity 崩溃时会主动下降（40→24）
- Threat 上限：未触及 100%（最高见到 54.2%）

---

## 七、游戏有没有真正的玩法上限？

**直接结论：在当前 LLM 离线的状态下，游戏没有真正的可博弈玩法上限。**

### 7.1 LLM 是核心玩法，而非辅助

游戏设计的核心是 WHISPER（LLM AI）导演机制：工人策略、敌对事件、贸易商行为都依赖 LLM 实时决策。但 LLM proxy 完全下线（`proxy=down, hasKey=false`）。**整个测评期间，游戏只能运行 DIRECTOR（deterministic fallback）模式。**

fallback 模式的问题：
1. Cook 角色从不分配
2. 工人常处于 Wander/Seek Task 而非实际工作
3. 角色配额设置无效
4. 战略深度大幅降低

### 7.2 Autopilot 不是玩家策略，而是自动驾驶

当 Autopilot=ON 时，游戏基本是自动运行的，玩家只是观众。**手动干预的有效途径极为有限**：
- Settings 滑块：对 fallback AI 无效（如上述）
- 画布建造：需要先了解哪里可以建，AI 会自动建造大多数必要建筑

**实际可控的策略深度约等于零**（在 LLM 离线时）。

### 7.3 DevIndex 100 是名义天花板

DevIndex 从 40 开始，测试中最长 run（24 分钟）只跌至 24。DevIndex 100 可能需要：
- 完整 food chain（Meals、Tools、Medicine 全部运作）
- 达到 Frontier 所有目标
- 高 Prosperity 持续维持

在 fallback AI 下，这些目标几乎不可达——COOK=0 意味着 Meals 永远不生产，DevIndex 无法从 40 突破。

### 7.4 分数理论上无上限

由于殖民地可以以"僵尸状态"（4 工人，无限循环）持续运行，**Score 理论上可以无限增长**。只需要 ≥1 工人能维持最低限度的 Farm 产粮。但这种 run 毫无策略趣味，Prosperity 崩在 24 左右，分数增长率约 0.87×/s，是个无聊的等待游戏。

**真正的玩法上限问题**：游戏缺少一个"高分需要高 Prosperity"的强制机制——即使 Prosperity 崩溃，Score 仍在缓慢增长，没有压力让玩家维持高质量运营。

---

## 八、模板横向比较

| 模板 | 特点 | 最佳生存性 | 难点 | 建议评分 |
|------|------|-----------|------|---------|
| Temperate Plains | 平衡开局，标准 | 中等 | 土匪突袭 | 标准基线 |
| Rugged Highlands | 山地隘口，挑战难度 | 低 | 路线代价 | 最难 |
| Archipelago Isles | 水路阻隔，天然防御 | **最高**（本测评最长 run） | Bridge 需求 | 最适合刷分 |
| Coastal Ocean | 港口，海风威胁 | 中等 | 天气影响大 | 中等 |
| Fertile Riverlands | 高产农业 | 理论最高 | 未深度测试 | 潜在最优 |
| Fortified Basin | 要塞防御 | 短期强，长期弱 | 土匪集中 | 前期有趣 |

**刷分推荐：Archipelago Isles** — 地形天然封锁敌人，配合快进可轻松拖到 Score 1000+。

---

## 九、评分与总结

### 评分细项

| 维度 | 分数 | 理由 |
|------|------|------|
| 策略深度 | 2/10 | LLM 离线→无实际策略空间；滑块无效；建造受限 |
| 分数机制清晰度 | 5/10 | Score=时间×倍率，简单但不透明；DevIndex 如何提升无提示 |
| 快进/速度控制 | 4/10 | 8×快进存在但性能瓶颈严重；实际只有 7.6×；FPS 波动大 |
| 可干预性 | 2/10 | 画布建造理论可行但难操作；角色控制在 fallback 下完全无效 |
| Cheese 空间 | 3/10 | Archipelago 地形 cheese 可用；无 pause-build exploit |
| 平衡性 | 3/10 | COOK=0 永久 bug；饥饿螺旋无法打破；分数无上限惩罚 |
| 数值读取性 | 8/10 | Debug panel 极为详细，Dev Telemetry 丰富，是优点 |
| 重开价值 | 4/10 | 6 个模板有差异；但 fallback AI 让每次 run 感觉雷同 |

**综合评分：4/10**

### 一句话总结

> Project Utopia 的调试面板是世界级的，但 LLM AI 完全下线导致游戏核心策略层坍塌——玩家能做的只有开快进然后看 4 个饥饿工人在孤岛上苟延残喘 20 分钟，Score 数字缓慢爬升直到你关掉浏览器。

---

## 附录：关键技术发现

### 分数公式（实证）
```
Score ≈ SimTime_seconds × (0.75 ~ 1.5)
倍率随 Prosperity 线性变化：Prosperity=70时约×1.5，Prosperity=25时约×0.75
```

### 性能边界
```
最大 FPS（低实体）：52.9
最小 FPS（高实体，20+实体）：10.0
8× 快进实际速度：7.6×（性能受限）
单步渲染最大耗时：54.6ms（远超 16ms 目标）
```

### AI 系统状态（测评期间全程）
```
AI Mode: off / fallback (proxy=down, hasKey=false)
所有 run 均为 DIRECTOR（deterministic fallback）模式
WHISPER（LLM）功能：完全不可用
```

### 关键 Bug 清单
1. **COOK 角色永不分配** — Kitchen 建筑无法产出 Meals（fallback policy 缺陷）
2. **角色配额滑块对 fallback 无效** — Settings 面板的 farmRatio/roleQuota 被忽视
3. **僵尸殖民地无终局** — 4 工人可无限维持，Score 无限增长，缺乏结束机制
4. **快进性能谎言** — 标称 8× 在高实体数量下退化至 ×1-2

### 最优策略建议（基于当前可用机制）
1. 选择 **Archipelago Isles** 模板（水路天然隔离敌人）
2. 开启 **Autopilot + 8× 快进**
3. 不干预任何设置（干预无效）
4. 等待 20+ 分钟即可积累 Score 1000+
5. **这不是策略，这是等待——游戏在当前状态下没有真正的最优决策空间**
