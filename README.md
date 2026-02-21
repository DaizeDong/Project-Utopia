# Project Utopia 系统规划（Web + Three.js）

## 1. 游戏系统总览

| 系统 | 子系统 | 核心功能 |
| --- | --- | --- |
| 世界系统 | 地形网格、地块状态、地图数据 | 管理可建造区域、通行成本、资源地块和障碍规则 |
| 建造系统 | 道路、生产建筑、仓储、防御 | 玩家放置与拆除建筑，改变资源链路与交通网络 |
| 资源系统 | 生产、运输、仓储、消耗 | 形成“采集-搬运-入库-消费”的闭环 |
| 人口系统 | 村民职业、需求、状态 | 自动分工、饥饿与体力驱动、工作效率变化 |
| 导航系统 | A* 全局寻路、局部避障、Boids | 保证单位能到达目标并形成群体流动 |
| AI Agent 系统 | 环境 Agent、NPC Agent、行为执行器 | 由大模型驱动世界事件与角色策略决策 |
| 生态系统 | 动物群体、迁徙、觅食、惊逃 | 形成可观察的自然行为并影响交通与资源 |
| 外来势力系统 | 商旅、流民、破坏者 | 引入交易、抢占资源、扰动与冲突压力 |
| 时间与事件系统 | 昼夜、天气、全局事件 | 以状态修正器影响产量、移动和行为概率 |
| 交互与信息系统 | HUD、建筑工具、单位检视、调试可视化 | 向玩家呈现系统状态并支持策略调整 |

## 2. 世界与地形系统

### 2.1 网格世界
- 世界以二维网格表示，渲染为 Three.js 场景中的地块实例。
- 每个地块记录：`tileType`、`passable`、`moveCost`、`buildable`、`yieldProfile`、`durability`。
- 地块支持运行时状态切换：草地、道路、农田、林地、矿点、水域、墙体、废墟。

### 2.2 地图数据
- 地图由 JSON 驱动，包含尺寸、初始地块、出生点、初始资源、事件权重。
- 支持多场景地图切换，切换时重建网格、资源状态和实体集合。

## 3. 建造系统

### 3.1 建造类型
- 交通类：道路、桥梁、城门。
- 生产类：农田、伐木场、矿场、工坊。
- 物流类：仓库、集散站、市场。
- 防御类：墙体、哨塔。

### 3.2 功能规则
- 建造前校验地块条件、建造成本、邻接规则。
- 建造后实时更新寻路网格、资源产能与物流目标点。
- 拆除会产生退料或废墟状态，废墟可修复或清除。

## 4. 资源与经济系统

### 4.1 资源类型
- 基础资源：`Food`、`Wood`、`Stone`。
- 进阶资源：`Tools`、`Coin`。

### 4.2 资源闭环
- 生产：村民在生产地块工作，按周期生成资源并进入携带栏。
- 运输：搬运角色将资源送至仓库或目标建筑。
- 消耗：人口维持、建造、制造、事件损失共同消耗库存。
- 交易：外来商旅以价格表和库存差进行交换。

### 4.3 经济调度
- 资源管理器维护全局库存与短缺指标。
- 根据短缺指数动态调整职业分配权重和运输优先级。

## 5. 人口与实体系统

### 5.1 实体分类
- 玩家阵营：农民、伐木工、矿工、搬运工、建造工、守卫。
- 外来 NPC：商旅、流民、雇工、破坏者。
- 动物：食草群、掠食者、驮兽。

### 5.2 基础状态
- 通用状态：`position`、`velocity`、`health`、`stamina`、`hunger`、`inventory`。
- 社会状态：`faction`、`role`、`relationship`、`threatLevel`。
- 认知状态：`memory`、`currentGoal`、`intent`、`cooldowns`。

## 6. AI Agent 系统（核心亮点）

### 6.1 环境 AI Agent（LLM Director）

#### 输入
- 世界摘要：人口、库存、建筑分布、交通拥堵、最近事件、阵营关系。
- 生态摘要：动物数量、迁徙趋势、食物链压力。
- 玩家行为摘要：扩张速度、防御强度、资源偏科。

#### 输出
- 结构化环境决策（JSON）：
  - 天气与环境参数：`weather`、`temperatureBias`、`terrainPenalty`。
  - 世界事件：`tradeCaravan`、`banditRaid`、`animalMigration`、`disease`。
  - 阵营态势：访客友好度、破坏者活跃度、市场波动。

#### 执行机制
- 按固定决策间隔运行，不逐帧调用。
- 决策先通过规则守卫器（合法性、强度上限、冷却）再生效。
- 无模型响应时回退到本地规则模板，确保仿真连续。

### 6.2 NPC AI Agent（LLM Brains）

#### 覆盖对象
- 玩家 NPC（村民与守卫）。
- 外来 NPC（商旅、流民、破坏者）。
- 动物群体（食草群与掠食者）。

#### 决策分层
- 高层意图层（LLM）：基于记忆与上下文生成意图和目标优先级。
- 中层策略层（Utility/BT）：把意图映射为可执行任务序列。
- 低层执行层（导航/移动/动作）：A* + Boids + 动作状态机完成行为。

#### 记忆与个性
- 短期记忆：最近遭遇、资源获取结果、危险位置。
- 长期记忆：常去地点、关系偏好、风险厌恶度。
- 个性参数：贪婪、谨慎、社交、攻击倾向，影响同类决策差异。

### 6.3 行为执行器（Deterministic Runtime）
- 村民：觅食、生产、搬运、建造、休息、避险。
- 商旅：选路入城、报价交易、离场返程。
- 破坏者：侦察薄弱点、接近目标、破坏后撤离。
- 动物：觅食、群聚、迁徙、受惊逃散、捕猎。

## 7. 导航与移动系统

### 7.1 全局导航
- 使用 A* 进行网格路径计算。
- 支持动态重算：目标变化、道路破坏、障碍更新。
- 路径缓存按起终点和地形版本号索引。

### 7.2 局部群体移动
- 使用 Boids 规则：`separation`、`alignment`、`cohesion`。
- `path-follow` 约束使群体沿全局路径推进。
- 邻域查询采用 Spatial Hash，控制大规模实体更新成本。

## 8. 生态与外来势力系统

### 8.1 动物生态
- 食草群按资源密度迁徙，形成自然拥堵与资源竞争。
- 掠食者追踪群体边缘个体，触发食草群惊逃重组。
- 环境 Agent 可注入迁徙事件改变区域压力。

### 8.2 外来势力
- 商旅系统与市场系统联动，提供资源交换与价格反馈。
- 流民可加入玩家村落或占据空地形成临时聚落。
- 破坏者基于防御薄弱区和财富暴露度选择目标。

## 9. 时间与事件系统

### 9.1 时间推进
- 统一模拟时钟驱动生产、消耗、行为冷却和事件调度。
- 昼夜周期影响视野、移动效率、事件触发概率。

### 9.2 事件调度
- 全局事件由环境 Agent 生成并挂入事件队列。
- 事件具备生命周期：`prepare`、`active`、`resolve`、`cooldown`。
- 事件影响以修正器形式注入其他系统，避免硬编码耦合。

## 10. 交互与信息系统

### 10.1 玩家交互
- 建造工具栏：放置、升级、拆除、修复。
- 策略面板：职业配比、运输优先级、防御策略。

### 10.2 信息显示
- HUD：资源、人口、满意度、安全度、事件告警。
- 检视面板：单位状态、当前意图、目标路径、记忆摘要。
- 调试叠层：路径线、Boids 邻域、交通热力图、事件范围。

## 11. 代码组织结构

```text
project-utopia/
  src/
    main.js
    app/
      GameApp.js
      GameLoop.js
      SimulationClock.js
    config/
      constants.js
      balance.js
      aiConfig.js
    world/
      grid/
        Grid.js
        Tile.js
        TileTypes.js
      map/
        MapLoader.js
        MapRegistry.js
      time/
        DayNightSystem.js
      weather/
        WeatherSystem.js
      events/
        WorldEventQueue.js
        WorldEventSystem.js
    entities/
      Entity.js
      Agent.js
      Animal.js
      Building.js
      components/
        Identity.js
        Needs.js
        Inventory.js
        Memory.js
        Faction.js
    simulation/
      construction/
        BuildSystem.js
        RepairSystem.js
      economy/
        ResourceSystem.js
        ProductionSystem.js
        LogisticsSystem.js
        MarketSystem.js
      population/
        PopulationSystem.js
        RoleAssignmentSystem.js
      navigation/
        AStar.js
        NavigationGrid.js
        PathCache.js
      movement/
        BoidsSystem.js
        SpatialHash.js
      ai/
        director/
          EnvironmentDirectorSystem.js
          EnvironmentDirectiveApplier.js
        brains/
          NPCBrainSystem.js
          IntentPlanner.js
          UtilitySelector.js
          BehaviorTreeExecutor.js
        memory/
          MemoryStore.js
          MemoryCompressor.js
        llm/
          LLMClient.js
          PromptBuilder.js
          ResponseSchema.js
          Guardrails.js
      npc/
        WorkerAISystem.js
        VisitorAISystem.js
        SaboteurAISystem.js
        AnimalAISystem.js
    render/
      SceneRenderer.js
      CameraController.js
      InstancedTileRenderer.js
      AgentRenderer.js
      DebugOverlayRenderer.js
    ui/
      hud/
        HUDController.js
      panels/
        InspectorPanel.js
        StrategyPanel.js
        EventPanel.js
      tools/
        BuildToolbar.js
    data/
      maps/
        *.json
      balance/
        resources.json
        buildings.json
        jobs.json
      prompts/
        environment-director.md
        npc-brain.md
    services/
      save/
        SaveLoadService.js
      telemetry/
        MetricsCollector.js
    workers/
      pathfinding.worker.js
      boids.worker.js
      ai-summary.worker.js
```

## 12. 模块职责与数据流

### 12.1 模块职责
- `world/*`：维护静态世界与动态环境状态。
- `simulation/*`：执行核心仿真逻辑，产出状态变更。
- `simulation/ai/*`：完成 LLM 决策、约束校验与行为分发。
- `entities/*`：统一实体与组件数据模型。
- `render/*`：把状态映射为 Three.js 可视对象。
- `ui/*`：玩家输入与信息展示。
- `data/*`：地图、数值、提示词配置。

### 12.2 关键数据流
1. `SimulationClock` 推进 Tick。  
2. `EnvironmentDirectorSystem` 读取世界摘要并生成环境指令。  
3. `NPCBrainSystem` 为各类 NPC 生成高层意图。  
4. `BehaviorTreeExecutor` 与 `UtilitySelector` 下发任务。  
5. `AStar + Boids` 完成移动，`Economy/Construction` 执行资源与建筑更新。  
6. `WorldEventSystem` 结算事件并写回全局状态。  
7. `Renderer + UI` 读取状态并展示。  

