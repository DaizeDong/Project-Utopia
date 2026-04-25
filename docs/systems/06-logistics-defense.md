# Project Utopia 物流、防御与世界事件系统

## 目录
1. [道路网络](#道路网络)
2. [仓库与物流](#仓库与物流)
3. [运输链](#运输链)
4. [压力透镜指标](#压力透镜指标)
5. [供应热图系统](#供应热图系统)
6. [天气系统](#天气系统)
7. [事件系统](#事件系统)
8. [突袭系统](#突袭系统)
9. [生态压力](#生态压力)
10. [桥梁与水路隔离检测](#桥梁与水路隔离检测)

---

## 道路网络

### Union-Find 连通性追踪

**位置**：`src/simulation/navigation/RoadNetwork.js`

道路网络通过 Union-Find（并查集）数据结构管理矩形网格上的连通分量：

```javascript
class UnionFind {
  // 路径压缩 + 按秩合并
  find(x)      // O(α(n)) 平均时间复杂度
  union(a, b)  // 合并两个集合
  connected(a, b)    // 检查连通性
  componentSize(x)   // 获取分量大小
}
```

#### 瓦片分类

- **道路瓦片集合** = `{ROAD, BRIDGE, WAREHOUSE}`
- 仅这三种瓦片参与连通性计算
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
- **位数组存储**：`parent`, `rank`, `size` 使用类型数组（Int32Array, Uint8Array, Uint16Array）

### 道路速度加成与磨损机制

**配置**：`src/config/balance.js`

```javascript
roadSpeedMultiplier: 1.35        // 基础速度加成
roadStackPerStep: 0.03           // 每个连续道路步骤的堆叠加成
roadStackStepCap: 20             // 最多堆叠20步 → 最大1.6倍

// 有效加成公式
= 1 + (roadSpeedMultiplier - 1) × (1 - wear) × (1 + min(step, cap) × perStep)
= 1 + 0.35 × (1 - wear) × (1 + min(step, 20) × 0.03)
```

#### 磨损衰减

- 道路瓦片通过 `tileState.wear` 追踪（0～1）
- 高流量或时间推移导致磨损增加
- 物流系统在计算相邻道路平均磨损时应用衰减：

```javascript
_avgAdjacentRoadWear(ix, iz, grid, roadNet) {
  let totalWear = 0, count = 0;
  for (const adjacent of [4方向邻居]) {
    if (roadNet.isRoadTile(adjacent)) {
      totalWear += adjacent.wear;
      count++;
    }
  }
  return count > 0 ? totalWear / count : 0;
}
```

#### 堆叠重置

- 工人踩离 ROAD/BRIDGE 瓦片时，`roadStep` 计数器重置为 0
- 恢复到基础速度加成 1.35×

---

## 仓库与物流

### 仓库覆盖范围与效率等级

**系统**：`LogisticsSystem`

三个效率等级由生产建筑与仓库的连通关系决定：

| 场景 | 效率 | 说明 |
|------|------|------|
| 通过道路连接到仓库 | 1.0 + 1.15 = 2.15 | 最优物流（带磨损衰减） |
| 邻接道路但不连接仓库 | 1.0 | 道路就近但孤立 |
| 无任何道路邻接 | 0.85 | 隔离惩罚（`ISOLATION_PENALTY`） |

#### 计算流程

```javascript
update(dt, state) {
  for (tile of PRODUCTION_TILES) {
    if (roadNet.isAdjacentToConnectedRoad(tile.ix, tile.iz, grid)) {
      avgWear = _avgAdjacentRoadWear(...)
      bonus = 1 + (1.15 - 1) × (1 - avgWear)
      efficiency[tile] = bonus          // ~1.15 最大
    } else if (roadNet.isAnyRoadNeighbor(tile.ix, tile.iz, grid)) {
      efficiency[tile] = 1.0
    } else {
      efficiency[tile] = 0.85           // 隔离惩罚
    }
  }
}
```

### 仓库队列与吞吐量限制

**配置**：`BALANCE`

```javascript
warehouseIntakePerTick: 2           // M2a: 每游戏 tick 最多接纳 2 个工人
warehouseQueueMaxWaitTicks: 120     // 队列超时时间（约 2s 游戏时间）
warehouseSoftCapacity: 4            // M2: 软上限队列大小
```

- 尝试向仓库卸货的工人排队等待
- 超过 120 tick（~2秒）未被处理 → 触发 `WAREHOUSE_QUEUE_TIMEOUT` 事件
- 工人重新分配目标，产生 `strandedCarryWorkers` 状态

### 仓库密度与风险

**配置**：`BALANCE`

```javascript
warehouseDensityRadius: 6               // 曼哈顿半径扫描范围
warehouseDensityRiskThreshold: 400      // 密度分数阈值（触发"热"状态）
warehouseDensityAvgStockPerTile: 50     // 单位瓦片平均库存基线

// 每 tick 风险滚动
warehouseFireIgniteChancePerTick: 0.008
verminSwarmIgniteChancePerTick: 0.005
```

#### 密度计算指标

系统在 `state.metrics.warehouseDensity` 中维护：

```javascript
{
  byKey: { "ix,iz": densityScore, ... },  // 各仓库密度分数
  hotWarehouses: ["ix,iz", ...],          // 分数 ≥ 阈值的仓库列表
  threshold: 400,
  peak: maxScore,
}
```

高密度仓库的实时损失：

```javascript
if (roll() < fireChance) {
  lossFood = 0.2 × min(food, 30)
  lossWood = 0.2 × min(wood, 30)
  // ... 火灾损失 food, wood, stone, herbs
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

- 耕地、木材厂等资源地产出资源到工人手中
- 工人在携带任何资源时受 **carry fatigue**（1.5× 休息衰减）
- 物资在途中腐烂（食物 0.5%/s，草药 1%/s，有 500 tick 恩惠期）

#### 2. 不在线交付与隔离惩罚

```javascript
if (workerIsOff-road) {
  durationEstimate = distance / speed
  if (durationEstimate > spoilageHalfLifeSeconds) {
    planner.emit(riskSpoilage)  // 软告警
  }
}

// 递送到隔离仓库时的惩罚
unloadRate = 4.2 item/s
if (warehouse.efficiency === 0.85) {  // ISOLATION_PENALTY
  actualUnloadRate = 4.2 × 0.8 = 3.36 item/s
}
```

- 隔离仓库递送速度降低 20%
- 通过修建连接仓库的道路来解除隔离

#### 3. 仓库分配与碎片化风险

```javascript
// 工人通过 RoleAssignmentSystem 分配货物卸货点
targetWarehouse = selectDepot(
  worker.carry,
  state.metrics.logistics.buildingEfficiency,
  policy
)
```

检测的问题状态：

| 状态 | 原因 | 影响 |
|------|------|------|
| `strandedCarryWorkers` | 仓库队列超时或目标不可达 | 携带的资源滞留 |
| `overloadedWarehouses` | 吞吐量超过 2/tick × 5s 缓冲 | 物流效率降低 |
| `isolatedWorksites` | 无连接道路的生产地 | 效率 0.85× 衰减 |

### 路由验证与碎片化检测

**配置**：`src/world/scenarios/ScenarioFactory.js`（运行时）

```javascript
// 路由对象结构
{
  id: "route_0",
  label: "south supply",
  connected: boolean,      // 是否两端都连接到仓库
  gapTiles: [ix, iz, ...], // 未铺装的道路瓦片列表
  ready: boolean,          // 所有 gap 已填补
}

// 仓库对象结构
{
  id: "depot_0",
  anchor: "south_depot",   // 指向 anchors[south_depot]
  ready: boolean,          // 是否满足覆盖范围
  radius: 2,               // 覆盖范围
}
```

#### 断裂路由检测

```javascript
function detectBrokenRoutes(runtime) {
  for (const route of runtime.routes) {
    route.connected = roadNetwork.areConnected(
      route.startIx, route.startIz,
      route.endIx, route.endIz,
      grid
    );
    route.gapTiles = [list of GRASS tiles between endpoints]
  }
}
```

#### 未就绪仓库检测

```javascript
function detectUnreadyDepots(runtime) {
  for (const depot of runtime.depots) {
    const anchor = anchors[depot.anchor];
    depot.ready = countWarehousesInRadius(anchor, depot.radius) > 0
                   && connectedToNetwork(anchor);
  }
}
```


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

## 供应热图系统

**位置**：`src/render/PressureLens.js` — buildHeatLens()

### 三通道颜色编码

| 通道 | 颜色 | 瓦片类型 | 触发条件 |
|------|------|---------|----------|
| RED | 红色（过量） | 原始生产地 | 邻接热仓库（密度≥400） |
| BLUE | 蓝色（饥饿） | 处理厂/仓库 | 输入资源空或仓库闲置 |
| GREY | 灰色（健康） | 其他 | 默认 |

---

## 天气系统

**位置**：`src/world/weather/WeatherSystem.js`

### 5种天气 + 4季节

天气类型：CLEAR, RAIN, STORM, DROUGHT, WINTER

效果：

| 天气 | 移动成本 | 农业产出 | 木材产出 |
|------|---------|---------|---------|
| 晴朗 | 1.0× | 1.0× | 1.05× |
| 雨天 | 1.15× | 1.0× | 1.0× |
| 暴风 | 1.3× | 0.8× | 0.95× |
| 干旱 | 1.0× | 0.55× | 1.05× |
| 冬季 | 1.25× | 0.65× | 0.9× |

灾害前线生成：basePenalty + zonePenalty，计算平均压力分数。

---

## 事件系统

**位置**：`src/world/events/WorldEventSystem.js`

### 3种事件类型

EVENT_TYPE = { ANIMAL_MIGRATION, BANDIT_RAID, TRADE_CARAVAN }

生命周期：prepare(1s) → active(durationSec) → resolve(1s) → cooldown(4s)

### 目标评分算法

突袭：score = roads×0.05 + hazard×0.52 + hazardRatio×0.55 - walls×0.06 + bonuses

商队：score = warehouses×0.18 + roads×0.055 + safety + bonuses - penalties

迁移：score = occupancy×0.18 + hazard×0.38 + wildlifeBonus

---

## 突袭系统

**位置**：`src/simulation/meta/RaidEscalatorSystem.js`

### DevIndex驱动升级

tier = clamp(floor(devIndexSmoothed / 15), 0, 10)
intervalTicks = max(600, 3600 - tier × 300)
intensityMultiplier = 1 + tier × 0.3

升级表：DevIndex 0 → tier 0 (1.0×), 30 → tier 2 (1.6×), 100 → tier 6+ (2.8×)

### 掠夺者与防御

loss = intensity × dt × 0.62 × lossMultiplier × mitigation
mitigation = max(0.42, 1 - walls × 0.12)

次级破坏：pressure ≥ 1.2 时额外造成建筑毁灭

---

## 生态压力

**位置**：`src/simulation/ecology/WildlifePopulationSystem.js`

### 食草动物与农场压力

herbivoreFarmPressurePerSecond: 0.34
herbivoreFarmPressureDecayPerSecond: 0.16

农场产出惩罚：penalty = min(0.7, pressure × 0.44)

生态热点：PressureLens 提取最多4个压力最高的农场作为ecology标记

---

## 桥梁与水路隔离检测

**位置**：`src/simulation/ai/colony/ColonyPlanner.js`

### 隔离检测BFS

candidateHasReachableWarehouse(grid, ix, iz, minSteps=3)

从候选瓦片出发，仅沿ROAD/BRIDGE行走，在6步内到达仓库则reachable=true

隔离惩罚：通过 scoreFallbackCandidate() 应用 0.8× 得分衰减

---

## 集成示例：紧急情景

冬季中期面临复合压力：

事件状态：
- Weather: WINTER (1.25× move, 0.65× farm yield)
- Event: BanditRaid (pressure: 1.8, intensity: 2.4)
- Logistics: 3条断裂道路，2个未就绪仓库
- Ecology: 食草动物迁移+农场压力0.6 (26% yield loss)

Pressure Lens输出（优先级排序）：
1. [120] route gap - 最高优先级
2. [108] depot - 仓库覆盖
3. [96] bandit raid - 突袭事件
4. [84] weather - 天气前线
5. [70] traffic - 流量热点
6. [64] ecology - 生态压力

Heat Lens输出：
1. BLUE: Kitchen (food < 10)
2. RED: Farm (adjacent to hot warehouse)
3. GREY: idle

---

## 性能特征

缓存策略：RoadNetwork按grid.version重建，LogisticsSystem级联重建，WeatherSystem定期采样

时间复杂度：
- Union-Find连通性：O(α(n))
- 仓库密度计算：O(w×h × r²) ≈ O(7000)
- BFS隔离检测：O(r²) ≈ O(36)
- 事件评分：O(candidates × zones) ≈ O(300)
- 标记生成：O(200)

