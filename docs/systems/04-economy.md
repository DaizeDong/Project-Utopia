# 经济与资源系统文档 (Economy & Resource System)

**版本**: v0.8.2 | **最后更新**: 2026年4月

---

## 1. 资源类型与流转

### 1.1 资源定义

Project Utopia 的经济系统管理两个层次的资源：

#### 原始资源 (Raw Resources)
- **food** — 从农场收获的谷粒
- **wood** — 从木材营地提取
- **stone** — 从采石场开采  
- **herbs** — 从草药园采集

初始资源: food: 100, wood: 80, stone: 15

#### 加工资源 (Processed Goods)
- **meals** — 厨房将食物加工成的营养品（恢复×2）
- **tools** — 铁匠铺制造（+15% 采集速度）
- **medicine** — 诊所制造（8hp/sec）

#### 工人携带结构 (Carry Structure)
```javascript
carry: { food: 0, wood: 0, stone: 0, herbs: 0 }
```

### 1.2 资源流转图

生产建筑(FARM/LUMBER/QUARRY/HERB_GARDEN)
  ↓ 生产资源
Worker.carry (food/wood/stone/herbs)
  ↓ 运输至仓库
WAREHOUSE (state.resources)
  ↓ 分流加工
KITCHEN(2f→1meal) / SMITHY(3s+2w→1tool) / CLINIC(2h→1medicine)
  ↓ 工人消费
Worker consumption (meals/raw food/medicine)

在途损坏(In-Transit Spoilage):
- 食物: 0.5%/秒（路上）
- 草药: 1.0%/秒（路上）
- 宽限期: 500 ticks

---

## 2. 建筑完整列表

### 2.1 生产建筑表

| 名称 | 木材 | 石头 | 草药 | 功能 | 工人角色 | 产率 | 备注 |
|------|:---:|:---:|:---:|------|:------:|------|------|
| **FARM** | 5 | — | — | 收获食物 | FARM | 0.3-1.0 | 受肥沃度/水分影响 |
| **LUMBER** | 5 | — | — | 收获木材 | WOOD | 0.4-1.0 | 工具加成 |
| **QUARRY** | 6 | — | — | 采石 | STONE | 0.45/s | 持续产出 |
| **HERB_GARDEN** | 4 | — | — | 采草药 | HERBS | 0.28/s | 持续产出 |
| **KITCHEN** | 8 | 3 | — | 加工meals | COOK | 2f→1m/2.8s | 室内无天气 |
| **SMITHY** | 6 | 5 | — | 制造tools | SMITH | 3s+2w→1t/8s | 户外天气敏感 |
| **CLINIC** | 6 | — | 4 | 制造medicine | HERBALIST | 2h→1m/4s | 逆天气 |
| **WAREHOUSE** | 10 | — | — | 存储hub | HAUL | — | 间距≥5 |
| **ROAD** | 1 | — | — | 后勤加成 | — | +35% | 连接加成 |

---

## 3. 土壤系统 (Soil System)

### 3.1 盐碱化机制

```javascript
soilSalinizationPerHarvest: 0.012  // 每次收获 +0.012
soilSalinizationThreshold: 0.8     // 触发休耕阈值
soilFallowRecoveryTicks: 1200      // ~3.3分钟恢复
```

流程:
1. 每次收获后: salinized += 0.012
2. 如果 salinized ≥ 0.8: 触发休耕
3. 休耕期间: fertility = 0, 产量池 = 0
4. 恢复后: fertility = 0.9, salinized = 0, yieldPool = 120

### 3.2 产量池系统

```javascript
farmYieldPoolInitial: 120     // 初始值
farmYieldPoolMax: 180         // 被动上限
farmYieldPoolRegenPerTick: 0.1
```

产量池工作:
1. 初始化为 120
2. 每次收获时递减
3. 当未采集时被动恢复 +0.1/tick
4. 池子枯竭时收获返回 0

---

## 4. 加工链

### 4.1 食物链

FARM (0.3-1.0 food/harvest)
  ↓
Worker.carry[food]
  ↓ deliver
WAREHOUSE (state.resources.food)
  ├→ Worker eating (0.11 recovery/food)
  └→ KITCHEN (2food + COOK)
     ↓ 2.8秒周期
     meals (0.22 recovery/meal)

### 4.2 工具链

QUARRY (0.45 stone/sec)
  ↓
WAREHOUSE
  ↓
SMITHY (3stone + 2wood + SMITH)
  ↓ 8秒周期
  tools (最多3件有效)
  ↓
+15% 采集速度 × 件数

### 4.3 医疗链

HERB_GARDEN (0.28 herbs/sec)
  ↓
WAREHOUSE
  ↓
CLINIC (2herbs + HERBALIST)
  ↓ 4秒周期
  medicine
  ↓
MortalitySystem: 8 hp/sec per medicine

---

## 5. 仓库与后勤

### 5.1 仓库选择

```javascript
worksiteCoverageSoftRadius: 10  // 绿区
worksiteCoverageHardRadius: 16  // 黄区（警告）
// >16 tile = 隔离状态 → -15% 效率
```

### 5.2 摄入限制 (M2 吞吐量)

```javascript
warehouseIntakePerTick: 2       // 每tick最多2工人
warehouseQueueMaxWaitTicks: 120 // 超时
```

排队机制:
- Worker1,2 → 卸载（消费2个令牌）
- Worker3 → 进入队列
- tick+1: 令牌重置, Worker3 卸载

### 5.3 卸载速率

```javascript
baseRate = 4.2 res/sec
penalty = 1 + max(0, load-1) × 0.32
isolationPenalty = 0.8  // 孤立仓库

effectiveRate = baseRate / penalty × isolation
```

---

## 6. 建造成本与规则

### 6.1 成本计算

基础成本 (BUILD_COST):
```javascript
{ farm: {wood: 5}, kitchen: {wood: 8, stone: 3}, ... }
```

升级器 (超过 softTarget):
```javascript
cost *= min(cap, 1 + perExtra × max(0, count - softTarget))
// 例: 第7个农场 = 5w × 1.1 = 5.5w → 6w
```

地形修正:
```javascript
elevationMult = 1 + elevation × 0.15
ruinDiscount = 0.7  // 废墟折扣
final = base × elevMult × ruinDiscount
```

### 6.2 放置规则

1. **地块**: 不能在水/HIDDEN上
2. **节点门控** (M1a):
   - lumber → FOREST 节点
   - quarry → STONE 节点
   - herb_garden → HERB 节点
3. **后勤**: 生产建筑需仓库≤10 tile
4. **间距**: 仓库≥5 tile曼哈顿距离

### 6.3 拆除回收 (M1c)

```javascript
woodRecovery: 0.25    // 25%
stoneRecovery: 0.35   // 35%
foodRecovery: 0.0
herbsRecovery: 0.0
```

---

## 7. 资源指标

### 7.1 流量监控

```javascript
// 每3秒快照
foodProducedPerMin
foodConsumedPerMin
foodSpoiledPerMin
woodProducedPerMin
[...]
```

### 7.2 危急检测

```javascript
foodEmergencyThreshold: 18    // food < 18 → warning
foodEmergencyCrisisThreshold: 0  // → pause if autopilot
resourceEmptySec: { food, wood }  // 追踪零时间
```

### 7.3 仓库密度风险 (M2)

```javascript
score = producerTileCount × 50  // 近似库存
if (score >= 400) {
  fireChance = 0.008/tick    // 20% loss + 30 cap
  verminChance = 0.005/tick  // 15% loss + 40 cap
}
```

---

## 8. 工人经济

### 8.1 饥饿与进食

```javascript
hungerDecayPerSecond: 0.0055
hungerSeekThreshold: 0.18     // 触发进食
hungerRecoverTarget: 0.70     // 饱满目标

recoveryPerFoodUnit: 0.11     // raw food
mealMultiplier: 2.0           // meals = 0.22/meal
```

### 8.2 应急口粮

当工人饥饿 < 0.18 且无法到达仓库:
```javascript
emergencyRationCooldown: 2.8秒
eatRate: ~1.1/sec
```

### 8.3 工人携带与腐烂

```javascript
foodSpoilageRatePerSec: 0.005  // 宽限期500ticks
herbSpoilageRatePerSec: 0.01   // 宽限期500ticks
carryPressureSec: 3.8           // 强制投递阈值
```

---

## 9. 系统执行顺序

```javascript
TileStateSystem          // 肥沃度/盐碱化
→ WorkerAISystem         // 收获/卸载/进食
→ ResourceSystem         // 流量汇总
→ ProcessingSystem       // 厨房/铁匠/诊所
```

---

## 10. 关键参数参考

| 参数 | 值 | 用途 |
|------|:---:|------|
| hungerDecayPerSecond | 0.0055 | 工人饥饿速度 |
| kitchenCycleSec | 2.8 | 饭菜周期 |
| farmYieldPoolInitial | 120 | 可采次数 |
| soilSalinizationPerHarvest | 0.012 | 休耕速度 |
| soilFallowRecoveryTicks | 1200 | 恢复时间 |
| warehouseIntakePerTick | 2 | 卸载并发 |
| workerUnloadRatePerSecond | 4.2 | 卸载速率 |
| toolHarvestSpeedBonus | 0.15 | 工具加成 |
| roadLogisticsBonus | 1.15 | 道路加成 |
| isolationDepositPenalty | 0.85 | 隔离衰减 |

---

## 文件清单

- src/simulation/economy/ResourceSystem.js
- src/simulation/economy/ProcessingSystem.js
- src/simulation/economy/TileStateSystem.js
- src/simulation/economy/LogisticsSystem.js
- src/simulation/construction/BuildSystem.js
- src/simulation/construction/BuildAdvisor.js
- src/simulation/npc/WorkerAISystem.js
- src/config/constants.js
- src/config/balance.js
- src/entities/EntityFactory.js
