# Project Utopia 物流、防御与世界事件系统

## 目录
1. [道路网络](#道路网络)
2. [仓库与物流](#仓库与物流)
3. [运输链](#运输链)
4. [仓库腐烂](#仓库腐烂)
5. [压力透镜指标](#压力透镜指标)
6. [Heat Lens 与上下文标签](#heat-lens-与上下文标签)
7. [Boids 路径阻尼](#boids-路径阻尼)
8. [天气系统](#天气系统)
9. [事件系统](#事件系统)
10. [突袭系统](#突袭系统)
11. [生态压力](#生态压力)
12. [桥梁与水路隔离检测](#桥梁与水路隔离检测)
13. [自动驾驶 Scout-Road 提议](#自动驾驶-scout-road-提议)

---

## 道路网络

### Union-Find 连通性追踪

**位置**：`src/simulation/navigation/RoadNetwork.js`

道路网络通过 Union-Find（并查集）数据结构管理矩形网格上的连通分量：

```javascript
class UnionFind {
  // 路径压缩 + 按秩合并
  find(x)            // O(α(n)) 平均时间复杂度
  union(a, b)        // 合并两个集合
  connected(a, b)    // 检查连通性
  componentSize(x)   // 获取分量大小
}
```

#### 瓦片分类

- **道路瓦片集合** = `{ROAD, BRIDGE, WAREHOUSE, GATE}`（GATE 在 v0.8.4 加入；
  对友方阵营可通过，对敌对阵营 — predators / raiders / saboteurs — 由
  `src/simulation/navigation/Faction.js#isTilePassableForFaction` 阻挡）
- 仅这些瓦片参与连通性计算
- 其他建筑（农场、工坊等）不参与路网

#### 构建过程

1. 遍历所有瓦片，找到所有道路类瓦片
2. 对每个道路瓦片，检查其 4 方向邻居
3. 若邻居也是道路瓦片，执行 `union()` 操作
4. 计算不同连通分量的总数（isolated road clusters）

#### API

```javascript
areConnected(ix1, iz1, ix2, iz2, grid)
  // 两个道路瓦片是否通过路网连接

connectedWarehouse(ix, iz, grid) -> warehouseIndex
  // 该瓦片所在分量是否包含仓库（-1 = 无）

isAdjacentToConnectedRoad(ix, iz, grid)
  // 非道路瓦片是否邻接（Manhattan距离1）一个连接到仓库的道路

getComponentSize(ix, iz, grid)
  // 该瓦片所在连通分量的大小
```

#### 性能优化

- **懒加载重建**：仅当 `grid.version` 变化时重建
- **位数组存储**：`parent`, `rank`, `size` 使用类型数组（Int32Array,
  Uint8Array, Uint16Array）

### 道路速度加成与磨损机制

**配置**：`src/config/balance.js`

```javascript
roadSpeedMultiplier: 1.35        // 基础速度加成
roadStackPerStep: 0.04           // 每个连续道路步骤的堆叠加成 (v0.8.8 Tier C: 0.03→0.04)
roadStackStepCap: 15             // 最多堆叠15步 → 最大~1.56倍 (v0.8.8 Tier C: 20→15)

// 有效加成公式
= 1 + (roadSpeedMultiplier - 1) × (1 - wear) × (1 + min(step, cap) × perStep)
```

#### 磨损衰减

- 道路瓦片通过 `tileState.wear` 追踪（0～1）
- 高流量或时间推移导致磨损增加
- 物流系统在计算相邻道路平均磨损时应用衰减

#### 堆叠重置

- 工人踩离 ROAD/BRIDGE 瓦片时，`roadStep` 计数器重置为 0
- 恢复到基础速度加成 1.35×

---

## 仓库与物流

### 仓库覆盖范围与效率等级

**系统**：`LogisticsSystem`（`src/simulation/logistics/`）

三个效率等级由生产建筑与仓库的连通关系决定：

| 场景 | 效率 | 说明 |
|------|------|------|
| 通过道路连接到仓库 | 1.0 + 1.15 = 2.15 | 最优物流（带磨损衰减） |
| 邻接道路但不连接仓库 | 1.0 | 道路就近但孤立 |
| 无任何道路邻接 | 0.85 | 隔离惩罚（`ISOLATION_PENALTY`） |

### 仓库队列与吞吐量限制

```javascript
warehouseIntakePerTick: 2           // 每游戏 tick 最多接纳 2 个工人
warehouseQueueMaxWaitTicks: 120     // 队列超时（约 2s 游戏时间）
warehouseSoftCapacity: 4            // 软上限队列大小（v0.8.5 Tier 1: 3→4）
```

- 尝试向仓库卸货的工人排队等待
- 超过 120 tick（~2秒）未被处理 → 触发 `WAREHOUSE_QUEUE_TIMEOUT` 事件
- 工人重新分配目标，产生 `strandedCarryWorkers` 状态

### 仓库密度与火灾风险

```javascript
warehouseDensityRadius: 6
warehouseDensityRiskThreshold: 400
warehouseDensityAvgStockPerTile: 50

warehouseFireIgniteChancePerTick: 0.008
verminSwarmIgniteChancePerTick: 0.005
```

`state.metrics.warehouseDensity`：

```javascript
{
  byKey: { "ix,iz": densityScore, ... },
  hotWarehouses: ["ix,iz", ...],
  threshold: 400,
  peak: maxScore,
}
```

---

## 运输链

### 工人携带 → 交付 → 分配流程

**位置**：`src/simulation/npc/WorkerAISystem.js`

#### 1. 采集与携带

```
Worker.harvest(resource_tile)
  → tileState.yieldPool -= harvest_rate × dt
  → worker.carry[resource] += amount
```

- 工人在携带任何资源时受 **carry fatigue**（1.5× 休息衰减）
- 物资在途中按食物 0.5%/s, 草药 1%/s 腐烂（500 tick 恩惠期）

#### 2. 隔离仓库递送惩罚

```javascript
unloadRate = 4.2 item/s
if (warehouse.efficiency === 0.85) {  // ISOLATION_PENALTY
  actualUnloadRate = 4.2 × 0.8 = 3.36 item/s
}
```

#### 3. 仓库分配与碎片化风险

| 状态 | 原因 | 影响 |
|------|------|------|
| `strandedCarryWorkers` | 仓库队列超时或目标不可达 | 携带的资源滞留 |
| `overloadedWarehouses` | 吞吐量超过 2/tick × 5s 缓冲 | 物流效率降低 |
| `isolatedWorksites` | 无连接道路的生产地 | 效率 0.85× 衰减 |

---

## 仓库腐烂

v0.10.1 引入仓库内库存的被动腐烂以避免无操作下仓库无限堆积。

### 食物腐烂（v0.10.1-j）

```javascript
warehouseFoodSpoilageRatePerSec: 0.0003
```

按比例衰减；1000 食物每天损失 ~9.5，大致抵消盈余生产，使 90 天食物
仍约为初始值的 3 倍。`BALANCE.spoilageOnRoadMultiplier = 0` 默认保留
"道路上零腐烂" 行为，可调（v0.8.8 Tier C 引入的旋钮）。

### 木材腐烂（v0.10.1-r2-A5 P0-3，新增）

```javascript
warehouseWoodSpoilageRatePerSec: 0.00015
```

与食物相同的比例腐烂模式，调整为约一半的强度，使正常建造周期木材
（35–60）几乎不损失，而无操作下 235+ 的堆积会缓慢回到平衡点。保持
木材作为有意义的资源，而不破坏正在进行的建造循环。

---

## 压力透镜指标

**位置**：`src/render/PressureLens.js`

### 7 种标记类型

压力透镜在地图上渲染最多 24 个标记点，按优先级和权重排序：

| 类型 | 优先级 | 权重范围 | 含义 |
|------|--------|---------|------|
| **route** | 120 | 0.98 | 断裂路由的间隙瓦片 |
| **depot** | 108 | 0.82 | 未就绪仓库的覆盖范围 |
| **event** | 96 | 0.45～0.98 | 活跃事件按强度着色 |
| **weather** | 84 | 0.46～0.92 | 天气灾害前线 |
| **traffic** | 70 | 0.45～0.88 | 流量热点 |
| **ecology** | 64 | 0.45～0.84 | 野生动物压力农场 |

---

## Heat Lens 与上下文标签

**位置**：`src/render/PressureLens.js — buildHeatLens()`

### 三通道颜色编码

| 通道 | 颜色 | 瓦片类型 | 触发条件 |
|------|------|---------|----------|
| RED (heat_surplus) | 红色 | 原始生产地 | 邻接热仓库（密度≥400） |
| BLUE (heat_starved) | 蓝色 | 处理厂/仓库 | 输入资源空或仓库闲置 |
| GREY | 灰色 | 其他 | 默认 |

### 上下文敏感的 "supply surplus" 标签（HW7 R3 A7 P0）

`buildHeatLens()` 每次调用扫描一次 `state.agents`，找到任何 `alive WORKER`
且 `hunger < 0.35`（即 `workerHungerSeekThreshold` 代理值，"主动找食物" 状态）。
当存在饥饿工人时：

- RED "supply surplus" 标签翻转为 **`"queued (delivery blocked)"`**
- 悬停 tooltip 增加 **"Worker Focus"** 指针，提示玩家打开 Worker Focus 面板

这样玩家不会看到 "供应过剩" 的红格而旁边工人正在饿死的矛盾。Marker
kind / id / priority / labelPriority 不变，halo 扩展和 dedup 路径保持
绿色。

### 实时 Popover（HW7 hotfix Batch C）

Heat Lens marker 增加了实时 popover，在悬停时显示 worker-context tooltip
（"N workers waiting" 等聚合信息）。`summarizeWorkersByTile(state)` 每次
heat-lens build 单次扫描 `state.agents`，预聚合工人按瓦片分布；由
`heatLensSignature` 节流。

### Logistics Legend Tooltip + Help

Logistics 图例增加了 tooltip 解释每种 marker 的含义；F1 Help 对话框增加
4-bullet "Heat Lens" 章节（hotfix Batch C + iter2 Gap A）。

---

## Boids 路径阻尼

**位置**：`src/simulation/movement/BoidsSystem.js`

HW7 hotfix Batch A — 工人在执行 A* 路径时，分离权重（separation）按
**0.35×** 阻尼，防止工人在路径上相互推挤导致 jitter。

```javascript
const SEP_DAMPEN_ON_PATH = 0.35;
const hasPath = Boolean(/* ... entity has active A* path ... */);
const separationFactor = hasPath ? SEP_DAMPEN_ON_PATH : 1.0;
// workers (sep weight 2.6) × 0.35 ≈ 0.91 < seek weight 1.22
// → seek 占主导，工人沿路径前进，不再被相邻工人推开
```

这条修复直接来自玩家试玩反馈：高密度路径上的工人会原地抖动并互相
让位，看起来 "AI 笨"。阻尼让 path-following 不被 separation 主导。

---

## 天气系统

**位置**：`src/world/weather/WeatherSystem.js`

### 5 种天气

天气类型：CLEAR, RAIN, STORM, DROUGHT, WINTER

效果：

| 天气 | 移动成本 | 农业产出 | 木材产出 |
|------|---------|---------|---------|
| 晴朗 | 1.0× | 1.0× | 1.05× |
| 雨天 | 1.15× | 1.0× | 1.0× |
| 暴风 | 1.3× | 0.8× | 0.95× |
| 干旱 | 1.0× | 0.55× | 1.05× |
| 冬季 | 1.25× | 0.65× | 0.9× |

灾害前线生成：`basePenalty + zonePenalty`，计算平均压力分数。

---

## 事件系统

**位置**：`src/world/events/WorldEventSystem.js`

### 3 种主事件类型

`EVENT_TYPE = { ANIMAL_MIGRATION, BANDIT_RAID, TRADE_CARAVAN }`

v0.8.2 Round-6 Wave-2 还增加了 MORALE_BREAK / DISEASE_OUTBREAK / WILDFIRE
（由 `EventDirectorSystem` 按 ~240s cadence 排队）。

### 生命周期

`prepare(1s) → active(durationSec) → resolve(1s) → cooldown(4s)`

### 目标评分

```
突袭：score = roads×0.05 + hazard×0.52 + hazardRatio×0.55 - walls×0.06 + bonuses
商队：score = warehouses×0.18 + roads×0.055 + safety + bonuses - penalties
迁移：score = occupancy×0.18 + hazard×0.38 + wildlifeBonus
```

### TRADE_CARAVAN 食物速率减半（HW7 R2 A5 P0）

```javascript
state.resources.food += dt * 0.22 * intensity * yieldMultiplier;  // 0.5 → 0.22
state.resources.wood += dt * 0.18 * intensity * yieldMultiplier;  // 0.34 → 0.18
```

A5 R2 根因：20s 商队按 intensity=1 注入约 10 食物，EventDirector 的
`tradeCaravan` weight=1 每隔几分钟就重新触发，使 AFK 食物在 30 分钟内
从 18 升到 313 — 让 "do nothing wins"。减半使商队对活跃殖民地仍是有
意义的补给，但无法单独维持零农场的无操作运行。

---

## 突袭系统

**位置**：`src/simulation/meta/RaidEscalatorSystem.js`

### DevIndex 驱动升级

```
tier = clamp(floor(devIndexSmoothed / 15), 0, 10)
intervalTicks = max(600, 3600 - tier × 300)
intensityMultiplier = 1 + tier × 0.3
```

升级表：DevIndex 0 → tier 0 (1.0×), 30 → tier 2 (1.6×),
100 → tier 6+ (2.8×)

### 掠夺者与防御

```
loss = intensity × dt × 0.62 × lossMultiplier × mitigation
mitigation = max(0.42, 1 - walls × 0.12)
```

次级破坏：pressure ≥ 1.2 时额外造成建筑毁灭。

### `raidsRepelled` 计数器（HW7 R2 A5 P0）

`WorldEventSystem` 在 BANDIT_RAID 从 `active → resolve` 时考虑 +1，但
**只有真正进行了防御** 才计数：

```javascript
const defenseScore = Number(event.payload?.defenseScore ?? 0);
const blockedByWalls = event.payload?.blockedByWalls === true;
if (defenseScore >= 1 || blockedByWalls) {
  state.metrics.raidsRepelled += 1;
}
```

预 r2 时纯按 event-status 转换递增，所以 0 墙 0 守卫的零防御运行也会
得到 "raid 击退" 计数。现在要求 (a) `defenseScore >= 1`（HP 加权墙覆盖
≥ 1，约等于路径上 1+ 墙）或 (b) `applyBanditRaidImpact` 显式设置
`blockedByWalls = true`（实际遮蔽时）。

### `defended_tier_5` Milestone（HW7 R2 A5 P0）

```javascript
const tier = Number(state.gameplay?.raidEscalation?.tier ?? 0);
const repelled = Number(state.metrics?.raidsRepelled ?? 0);
const walls = Number(state.buildings?.walls ?? 0);
const guards = Number(state.combat?.guardCount ?? 0);
const hasDefense = guards >= 1 || walls >= 4;
return tier >= 5 && repelled >= 1 && hasDefense ? 1 : 0;
```

要求真实防御基础设施（≥4 墙 OR ≥1 GUARD-role 工人）+ tier ≥ 5 + 至少
一次有效击退。预 r2 在 0 墙 0 守卫的运行也会点亮该 milestone（A5 R2
观察到 "Tier-5 raid defended" 在零防御运行下亮起）。

---

## 生态压力

**位置**：`src/simulation/ecology/WildlifePopulationSystem.js`

### 食草动物与农场压力

```
herbivoreFarmPressurePerSecond: 0.34
herbivoreFarmPressureDecayPerSecond: 0.16
```

农场产出惩罚：`penalty = min(0.7, pressure × 0.44)`

生态热点：PressureLens 提取最多 4 个压力最高的农场作为 ecology 标记。

### 初始野生动物提升（HW7 hotfix-A Issue #4）

`INITIAL_POPULATION` 从 `herbivores: 3, predators: 1` 提升至
`herbivores: 8, predators: 2`，回应玩家 "动物太少" 反馈，让世界从
第 1 秒开始就有可见的野生动物群落。

---

## 桥梁与水路隔离检测

**位置**：`src/simulation/ai/colony/ColonyPlanner.js`

### 隔离检测 BFS

`candidateHasReachableWarehouse(grid, ix, iz, minSteps=3)`

从候选瓦片出发，仅沿 ROAD/BRIDGE 行走，在 6 步内到达仓库则
`reachable = true`。

隔离惩罚：通过 `scoreFallbackCandidate()` 应用 0.8× 得分衰减。

---

## 自动驾驶 Scout-Road 提议

**位置**：`src/simulation/meta/ColonyDirectorSystem.js — proposeScoutRoadTowardFoggedStone()`

HW7 hotfix iter2 Gap B — 自动驾驶在以下条件下扩展一段 scout 道路指向
雾隐 STONE 节点：

1. **石头赤字**：`state.resources.stone < 15`（同 `assessColonyNeeds` 的
   `quarry@95` 触发阈值）
2. **可见 STONE 为零**：当前 EXPLORED/VISIBLE 半区无 STONE 节点
3. **存在雾隐 STONE**：HIDDEN 雾区至少有一个 STONE 节点
4. **有钱**：`canAfford(state.resources, BUILD_COST.road)`
5. **节流**：每 30 sim-sec 最多一条 scout road（防止真正远离石头时刷屏）

候选集 = 每个邻接现有 infrastructure（warehouse / road / bridge）的
EXPLORED/VISIBLE GRASS 瓦片，按到最近雾隐 STONE 的曼哈顿距离评分。
工人走到该 road 瓦片会顺带通过 `VisibilitySystem` 揭开周围雾，使下
一个 ColonyDirector tick 能通过正常 placement 路径放下 quarry 蓝图。

---

## 集成示例：紧急情景

冬季中期面临复合压力：

事件状态：
- Weather: WINTER (1.25× move, 0.65× farm yield)
- Event: BanditRaid (pressure: 1.8, intensity: 2.4)
- Logistics: 3 条断裂道路，2 个未就绪仓库
- Ecology: 食草动物迁移 + 农场压力 0.6 (26% yield loss)
- 工人 hunger=0.10（饥饿）

Pressure Lens 输出（优先级排序）：
1. [120] route gap
2. [108] depot
3. [96] bandit raid
4. [84] weather
5. [70] traffic
6. [64] ecology

Heat Lens 输出（饥饿工人在场，标签翻转）：
1. RED "queued (delivery blocked)" — 农场紧邻饱和仓库
2. BLUE "input starved" — Kitchen (food < 10)
3. GREY: idle

---

## 性能特征

缓存策略：RoadNetwork 按 `grid.version` 重建，LogisticsSystem 级联重建，
WeatherSystem 定期采样，Heat Lens 按 `heatLensSignature` 节流。

时间复杂度：
- Union-Find 连通性：O(α(n))
- 仓库密度计算：O(w×h × r²) ≈ O(7000)
- BFS 隔离检测：O(r²) ≈ O(36)
- 事件评分：O(candidates × zones) ≈ O(300)
- 标记生成：O(200)
