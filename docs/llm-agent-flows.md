# LLM Agent 流程文档

> 本文档覆盖 Project Utopia 中所有 LLM Agent 参与的决策流程，包含调用时机、输入输出结构、Prompt、Fallback 逻辑、响应校验与消费链路。

---

## 目录

1. [系统概览](#1-系统概览)
2. [Environment Director（环境导演）](#2-environment-director)
3. [Strategic Director（战略导演）](#3-strategic-director)
4. [NPC Brain（NPC 策略脑）](#4-npc-brain)
5. [Colony Planner（殖民地规划师）](#5-colony-planner)
6. [公共组件](#6-公共组件)
7. [aiConfig.js 配置参考](#7-aiconfigjs-配置参考)
8. [系统调用关系图](#8-系统调用关系图)

---

## 1. 系统概览

游戏中有 **4 个** LLM Agent，均通过 `server/ai-proxy.js`（端口 8787）代理，Vite 将 `/api/*` 请求转发至代理。

| Agent | 触发时机 | Endpoint | Fallback |
|---|---|---|---|
| Environment Director | 周期调度（帧循环内节流） | `/api/ai/environment` | `buildEnvironmentFallback()` |
| Strategic Director | 90 秒 Heartbeat | `/api/ai/environment` 同端点（不同 channel） | `buildFallbackStrategy()` |
| NPC Brain | 周期调度 | `/api/ai/policy` | `buildPolicyFallback()` |
| Colony Planner | `shouldReplan()` 条件满足时 | `/api/ai/environment`（异步直调） | `generateFallbackPlan()` |

所有 Agent 均支持：
- `state.ai.enabled = false` → 跳过 LLM，直接走 Fallback
- 严格 JSON schema 校验（`ResponseSchema.js`）
- Guardrail 数值截断与文本消毒（`Guardrails.js`）

---

## 2. Environment Director

**文件：** `src/simulation/ai/director/EnvironmentDirectorSystem.js`

### 2.1 调用时机

帧循环内按 `AI_CONFIG.minDecisionIntervalSec` 节流，每次调用 `services.llmClient.requestEnvironment(summary, state.ai.enabled)`。

### 2.2 System Prompt

**文件：** `src/data/prompts/environment-director.md`

```
You are the environment director for a medieval sandbox simulation.
Return strict JSON only.

Input context includes:
- `summary` with resources, weather, events, scenario, objective, frontier status,
  logistics pressure, ecology pressure, and recovery risk
- `operationalHighlights` that summarize the most important current map pressures

Rules:
- Keep 0-3 events.
- Use lower pressure if resources or recovery are already fragile.
- Avoid extreme values.
- Prefer pressure that reinforces authored route gaps, depots, chokepoints,
  and wildlife zones already present in the scenario.
- `focus` should name the contested lane or pressure zone.
- `summary` should explain why this directive fits the current objective/state.
- `steeringNotes` should stay short and operational.
- Output valid JSON object only.
```

### 2.3 User Prompt 结构

由 `buildEnvironmentPromptUserContent(summary)` 构建，序列化为 JSON 字符串：

```json
{
  "channel": "environment-director",
  "summary": { ... },
  "operationalHighlights": [ "<最多6条压力摘要>" ],
  "allowedWeather": ["clear", "rain", "storm", "drought", "winter"],
  "allowedEvents": ["animalMigration", "banditRaid", "tradeCaravan"],
  "explanationFields": ["summary", "focus", "steeringNotes"],
  "hardRules": [
    "Shape short-horizon pressure around the current scenario and objective",
    "Prefer spatially legible weather and events",
    "If resources or recovery are fragile, lower pressure"
  ],
  "constraint": "Return strict JSON only. No markdown."
}
```

**`summary` 完整字段结构**（来自 `buildWorldSummary(state)`）：

```json
{
  "world": {
    "scenario": { "title": "", "summary": "", "family": "", "phase": 0 },
    "objective": { "id": "", "title": "", "progress": 0, "description": "", "hint": "" },
    "gameplay": {
      "prosperity": 0,
      "threat": 0,
      "recovery": { "collapseRisk": 0, "charges": 0 },
      "spatialPressure": { "eventPressure": 0 }
    },
    "frontier": {
      "brokenRoutes": 0,
      "unreadyDepots": 0,
      "readyDepots": 0,
      "brokenRouteCount": 0,
      "unreadyDepotCount": 0
    },
    "logistics": {
      "isolatedWorksites": 0,
      "overloadedWarehouses": 0,
      "strandedCarryWorkers": 0
    },
    "ecology": {
      "pressuredFarms": 0,
      "frontierPredators": 0,
      "maxFarmPressure": 0,
      "migrationHerds": 0
    },
    "soil": { "criticalSalinized": 0, "salinizedFarmCount": 0 },
    "nodes": { "depletedForestCount": 0, "atRiskNodeCount": 0 },
    "connectivity": { "waterIsolatedResources": 0, "bridgeCoord": null },
    "terrain": { "lowMoistureRatio": 0 },
    "resources": { "food": 0, "wood": 0, "stone": 0, "herbs": 0, "meals": 0, "tools": 0, "medicine": 0 },
    "population": { "workers": 0, "traders": 0, "predators": 0, "herbivores": 0 },
    "events": [ { "type": "", "targetLabel": "", "severity": 0, "pressure": 0 } ]
  }
}
```

**`operationalHighlights`** 由 `pickHighlights(summary)` 从以下条件中最多选 6 条：
- 土壤危机（salinizedFarmCount > 2）
- 水资源阻隔（waterIsolatedResources > 0）
- 节点耗尽（atRiskNodeCount > 0）
- 木材危机（depletedForestCount > 2）
- 路线中断（brokenRouteCount > 1）
- 仓库过载（overloadedWarehouses > 0）
- 干旱地形（lowMoistureRatio > 0.4）
- 生态压力（pressuredFarms > 0）

### 2.4 响应 Schema

```typescript
{
  weather: "clear" | "rain" | "storm" | "drought" | "winter",
  durationSec: number,          // clamp [8, 180]
  factionTension: number,       // clamp [0, 1]
  eventSpawns: [                // 最多 3 条
    {
      type: "animalMigration" | "banditRaid" | "tradeCaravan",
      intensity: number,        // clamp [0.4, maxEventIntensity]
      durationSec: number
    }
  ],
  // 可选文本字段
  focus?: string,               // max 288 chars
  summary?: string,             // max 560 chars
  steeringNotes?: string[]      // max 4 条，每条 max 480 chars
}
```

### 2.5 Fallback 逻辑

`buildEnvironmentFallback(summary)` 按以下优先级决策：

| 条件 | 天气 | 时长 | 张力 | 事件 | Focus |
|---|---|---|---|---|---|
| `lowFood \|\| collapseRisk ≥ 65` | clear | 25s | 0.3 | 贸易商队（轻度） | "recovery lane" |
| `prosperity < 55 \|\| threat > 60` | clear | 22s | 0.35 | 无 | "let the colony breathe" |
| `predators ≥ 3 && prosperity < 60` | clear | 22s | 0.3 | 无 | "predator mitigation" |
| `prosperity ≥ 70 && threat ≤ 25` | rain | 16s | 0.55 | 动物迁徙(0.5强度,12s) | "light challenge" |
| 其他（稳定） | clear | 20s | 0.4 | prosperity≥55时贸易商队 | "steady state" |

### 2.6 响应消费

`applyEnvironmentDirective(state, directive)` 执行：
- 设置 `state.weather.current`
- 通过 `WorldEventSystem` 生成事件
- 更新 Raid 升级器的 factionTension

---

## 3. Strategic Director

**文件：** `src/simulation/ai/strategic/StrategicDirector.js`

### 3.1 调用时机

90 秒 Heartbeat Scheduler，调用 `services.llmClient.requestEnvironment(promptContent, state.ai.enabled)`（复用 environment 端点，channel 字段区分）。

### 3.2 System Prompt

**文件：** `src/data/prompts/strategic-director.md`

```
You are the strategic director for a medieval colony simulation.
Return strict JSON only. No markdown fencing.

Think step by step before deciding. Your output MUST include a `reasoning` field.

Input context includes:
- `summary` with resources, workers, weather, threat, prosperity, objectives, doctrine
- `recentMemory` (if available) with past observations and reflections

Rules:
- "survive": food critically low / workers few / near collapse
- "grow": stable resources, no immediate threat
- "defend": high threat or hostile events active
- "complete_objective": only when objective nearly achieved, prosperity high, threat low
- riskTolerance: survive/defend → 0.1-0.3 / grow → 0.4-0.6 / objective → 0.7-0.9
- resourceFocus and workerFocus should align with priority
- environmentPreference "pressure" = challenging events; "calm" = breathing room
- Output valid JSON object only.
```

### 3.3 User Prompt 结构

由 `buildPromptContent(state)` 构建：

```json
{
  "channel": "strategic-director",
  "summary": {
    "timeSec": 0,
    "workers": 0,
    "deaths": 0,
    "food": 0, "wood": 0, "stone": 0, "herbs": 0,
    "tools": 0, "meals": 0,
    "prosperity": 0,
    "threat": 0,
    "objectiveIndex": 0,
    "currentObjective": "",
    "scenarioFamily": "",
    "doctrine": "",
    "weather": "",
    "season": ""
  },
  "buildings": {
    "warehouses": 0, "farms": 0, "lumbers": 0, "quarries": 0,
    "herbGardens": 0, "kitchens": 0, "smithies": 0, "clinics": 0
  },
  "chainStatus": {
    "food": "complete|ready_for_kitchen|building_farms",
    "tools": "complete|ready_for_smithy|no_quarry",
    "medical": "complete|ready_for_clinic|no_herbs"
  },
  "recentMemory": ""
}
```

### 3.4 响应 Schema

```typescript
{
  reasoning: string,            // max 500 chars，逐步分析
  strategy: {
    priority: "survive" | "grow" | "defend" | "complete_objective",
    resourceFocus: "food" | "wood" | "balanced",
    defensePosture: "aggressive" | "defensive" | "neutral",
    riskTolerance: number,      // 0-1
    expansionDirection: "north" | "south" | "east" | "west" | "none",
    workerFocus: "farm" | "wood" | "deliver" | "balanced",
    environmentPreference: "calm" | "pressure" | "neutral"
  },
  observations: string[],       // 1-2 条短观察，记入 memory
  summary: string               // max 80 chars
}
```

### 3.5 响应消费

- 写入 `state.ai.strategy`
- 发布 `state.gameplay.strategicGoal` 供 Colony Planner 读取

---

## 4. NPC Brain

**文件：** `src/simulation/ai/brains/NPCBrainSystem.js`

### 4.1 调用时机

周期调度（同 Environment Director 节流），调用 `services.llmClient.requestPolicies(summary, state.ai.enabled)`。

### 4.2 System Prompt

**文件：** `src/data/prompts/npc-brain.md`

```
You produce group strategy policies for a sandbox simulation.
Return strict JSON only.

Input context includes:
- `summary.world`: resources / population / buildings / weather / events / traffic /
  scenario / objective / gameplay / frontier / logistics / ecology / operations
- `summary.groups` (per-group counts, hunger, carrying, current states)
- `summary.stateTransitions.groups[groupId]`:
  stateNodes / transitions(legal directed edges) / dominantState / preferredPaths
- `groupContracts`: allowedIntents / allowedTargets / focusHint

Rules:
- Always include all known groups.
- Use only allowed intent and target keys.
- Keep weights between 0 and 3.
- Keep ttlSec moderate (8-60).
- `targetState` must be reachable and legal for that group's state graph.
- Prefer one clear target per group, avoid contradictory targets.
- Adjust intent weights according to legal transition paths.
- workers carrying cargo must still be able to deliver.
- hunger-safe states outrank decorative steering.
- Never imply impossible state jumps.
- Do not output markdown.
```

### 4.3 User Prompt 结构

由 `buildPolicyPromptUserContent(summary)` 构建：

```json
{
  "channel": "npc-policy",
  "summary": {
    "world": { ... },
    "groups": {
      "workers":    { "count": 0, "avgHunger": 0, "carrying": 0, "dominantState": "" },
      "traders":    { ... },
      "saboteurs":  { ... },
      "herbivores": { ... },
      "predators":  { ... }
    },
    "stateTransitions": {
      "groups": {
        "<groupId>": {
          "stateNodes": [],
          "transitions": [ { "from": "", "to": "" } ],
          "dominantState": "",
          "preferredPaths": [ "state1 -> state2 -> ..." ],
          "avgHunger": 0,
          "carrying": 0,
          "count": 0
        }
      }
    }
  },
  "operationalHighlights": [],
  "groupContracts": {
    "workers": {
      "allowedIntents": ["farm","wood","deliver","eat","wander","quarry","gather_herbs","cook","smith","heal"],
      "allowedTargets": ["warehouse","farm","lumber","road","depot","frontier","safety","quarry","herb_garden","kitchen","smithy","clinic","bridge"],
      "focusHint": "keep depots connected, push delivery before cargo stalls..."
    },
    "traders":    { "allowedIntents": [...], "allowedTargets": [...], "focusHint": "" },
    "saboteurs":  { ... },
    "herbivores": { ... },
    "predators":  { ... }
  },
  "explanationFields": ["summary", "focus", "steeringNotes"],
  "hardRules": [...],
  "constraint": "Return strict JSON only. No markdown."
}
```

### 4.4 响应 Schema

```typescript
{
  policies: [
    {
      groupId: "workers" | "traders" | "saboteurs" | "herbivores" | "predators",
      intentWeights: { [intent: string]: number },   // 仅 allowedIntents 键，clamp [0,3]
      riskTolerance: number,                          // clamp [0, 1]
      targetPriorities: { [target: string]: number }, // 仅 allowedTargets 键，clamp [0,3]
      ttlSec: number,                                 // clamp [8, 120]
      focus?: string,           // max 288 chars
      summary?: string,         // max 560 chars
      steeringNotes?: string[]  // max 4 条 × max 480 chars
    }
  ],
  stateTargets?: [
    {
      groupId: string,
      targetState: string,      // 必须在该组 stateNodes 中
      priority: number,         // clamp [0, 1]
      ttlSec: number,           // clamp [4, 120]
      reason?: string
    }
  ]
}
```

### 4.5 Fallback 逻辑

`buildPolicyFallback(summary)` 流程：

1. 克隆 `DEFAULT_GROUP_POLICIES` 中各组默认策略
2. 对每组执行 `applyStateAwareTemplate(policy, summary)` → 根据 dominantState 调整权重
3. 调用组专属调节函数

**Workers 调节规则（部分）：**

| 条件 | 调节动作 |
|---|---|
| food < 8 或 avgHunger < 0.25 | eat +0.9, deliver +0.5 |
| food < 25 或 avgHunger < 0.4 | eat +0.4, farm +0.35, deliver +0.2 |
| 携带量高 | deliver +0.6 |
| 处于 wander/idle 状态 | farm +0.25, wood +0.2, wander -0.2 |
| brokenRoutes > 0 | deliver +0.35，目标提升 road/depot/frontier |
| 仓库过载 | deliver +0.45，目标提升 warehouse |
| 土壤盐碱化 | farm 权重降低，wood 提升 |
| 节点耗尽 | lumber 权重降低 |
| 水资源阻隔 | bridge 目标提升 |
| 捕食者存在 | riskTolerance -0.1, safety 目标提升 |
| medicine < 2 | gather_herbs/deliver 提升 |
| tools < 2 | smith 提升 |

### 4.6 响应消费

- 写入 `state.ai.policies` 数组
- `stateTargets` 发布至各组行为系统，驱动 Agent 状态机跳转
- `intentWeights` 修改行为树动作选择权重

---

## 5. Colony Planner

**文件：** `src/simulation/ai/colony/ColonyPlanner.js`

### 5.1 调用时机

`shouldReplan()` 条件满足时（资源严重不足、上一轮计划执行完毕、或强制重规划），调用 `callLLM(systemPrompt, userPrompt, config)`，直接向代理发 POST。

### 5.2 System Prompt

**文件：** `src/data/prompts/npc-colony-planner.md`

```
You are the construction planner for a medieval colony simulation.
Return strict JSON only. No markdown fencing, no commentary.

## Available Build Actions
farm (5w), lumber (5w), warehouse (10w), quarry (6w), herb_garden (4w),
kitchen (8w+3s), smithy (6w+5s), clinic (6w+4h), road (1w), wall (2w), bridge (3w+1s)

## Available Skills (compound builds)
logistics_hub (24w), processing_cluster (13w+5s), defense_line (10w),
food_district (25w+3s), expansion_outpost (22w), bridge_link (12w+4s)

## Location Hints
near_cluster:<id>, near_step:<id>, expansion:<dir>, coverage_gap,
defense_line:<dir>, terrain:high_moisture, <ix>,<iz>

## Hard Rules
- Never plan more buildings than resources allow
- Warehouse spacing >= 5 tiles
- Production within 12 tiles of warehouse
- Food rate negative → food production first
- Wood buffer ~8 for emergencies

## Output Format
{ goal, horizon_sec, reasoning, steps: [{ id, thought, action, predicted_effect, priority, depends_on }] }
- 3-8 steps, unique numeric ids from 1
- depends_on references prior step ids
- priority: critical > high > medium > low
```

### 5.3 User Prompt 结构

由 `buildPlannerPrompt(observation, memoryText, state, ...)` 构建，包含以下 Section：

**`## Current Observation`**（来自 `ColonyPerceiver.observe()`）：

```json
{
  "affordable": { "farm": true, "warehouse": false, "road": true, ... },
  "economy": {
    "food":  { "stock": 0, "rate": 0, "trend": "", "projectedZeroSec": 0 },
    "wood":  { "stock": 0, "rate": 0, "trend": "" },
    "stone": { ... }, "meals": { ... }, "tools": { ... }
  },
  "workforce": {
    "total": 0,
    "byRole": { "WORKER": 0, "TRADER": 0, "SABOTEUR": 0 }
  },
  "buildings": {
    "farms": 0, "warehouses": 0, "quarries": 0,
    "kitchens": 0, "clinics": 0, "smithies": 0,
    "lumbers": 0, "herbGardens": 0, "roads": 0, "walls": 0
  },
  "topology": {
    "clusters": [ { "id": "", "center": [0,0], "warehouses": 0, "farms": 0 } ],
    "coveragePercent": 0,
    "expansionFrontiers": [ { "direction": "", "score": 0 } ]
  },
  "defense": { "threat": 0 },
  "weather": { "current": "", "season": "" },
  "objective": { ... },
  "terrain": { ... },
  "soil": { ... },
  "nodeDepletion": { ... },
  "connectivity": { ... },
  "postconditionViolations": []
}
```

**其他 Sections：**
- `## Strategic State` — 来自 StrategicDirector 的 goal chain + layout hints
- `## Recent Reflections` — memory 上下文
- `## Skill Availability` — 哪些 Skill 可负担/不可负担
- `## Affordable Buildings` — 当前可建造的类型
- `## Last Plan Evaluation` — 上一轮计划评估反馈（用于改进）

### 5.4 响应 Schema

```typescript
{
  goal: string,               // max 60 chars
  horizon_sec: number,
  reasoning: string,          // max 300 chars，2-3 句分析
  steps: [
    {
      id: number,             // 从 1 开始唯一整数
      thought: string,        // max 120 chars，解释 WHY
      action: {
        type: string,         // building type 或 "skill"
        hint: string,         // 位置提示
        skill?: string        // type=="skill" 时填写
      },
      predicted_effect: { [metric: string]: string },
      priority: "critical" | "high" | "medium" | "low",
      depends_on: number[]    // 依赖的先行步骤 id
    }
  ]
}
```

### 5.5 Fallback 逻辑

`generateFallbackPlan(observation, state)` 优先级梯阶：

| 优先级 | 条件 | 动作 |
|---|---|---|
| **Critical** | foodRate < 0 && food < 40 | 建农场 + 可能建厨房 |
| **2** | coverage < 70 && wood ≥ 10 | 建仓库 |
| **3** | woodRate ≤ 0 && lumbers < farms && wood ≥ 5 | 建伐木场 |
| **3.5** | kitchens==0 && farms≥2 && 资源够 | 建厨房（workers≥12时强制Critical） |
| **4** | quarries==0 && farms≥3 | 建采石场；有采石场且stone≥5 → 建铸造厂 |
| **5** | threat > 30 && walls < 8 | 建城墙 |
| **5.5** | 水阻隔检测 | 建桥（由 `_detectWaterIsolation()` BFS 定位） |
| **6** | wood ≥ 3 | 建道路 |
| **7-10** | 专项 Skill 建议（医疗、快速农场、资源枢纽、扩张） | 调用 SkillLibrary |

输出保证：最少 1 步、最多 8 步，所有 `depends_on` 引用有效，`status: "pending"`。

### 5.6 响应消费

- 计划步骤写入 `PlanExecutor` 队列
- `ConstructionSystem` 读取队列执行建造
- 计划评估结果写入 `state.ai.fallbackHints`，用于下次 Prompt 的 `## Last Plan Evaluation` Section

---

## 6. 公共组件

### 6.1 LLMClient（`src/simulation/ai/llm/LLMClient.js`）

两个方法，接口相同：

```javascript
// 返回值结构（两者相同）
{
  fallback: boolean,     // true = 走了 fallback
  data: object,          // guardrail 处理后的响应
  latencyMs: number,
  error: string,
  model: string,
  debug: {               // 调试信息
    requestedAtIso, endpoint, requestSummary,
    promptSystem, promptUser, requestPayload,
    rawModelContent, parsedBeforeValidation,
    guardedOutput, error
  }
}
```

### 6.2 ResponseSchema（`src/simulation/ai/llm/ResponseSchema.js`）

- `validateEnvironmentDirective(input)` → `{ ok: boolean, value?, error? }`
- `validateGroupPolicy(input)` → `{ ok: boolean, value?, error? }`
- 校验失败时抛出 `Error("schema: ...")`，触发 Fallback

### 6.3 Guardrails（`src/simulation/ai/llm/Guardrails.js`）

| 字段 | 处理方式 |
|---|---|
| `weather` | 非法值 → 重置为 "clear" |
| `durationSec` | clamp [8, 180] |
| `factionTension` | clamp [0, 1] |
| `eventSpawns` | 保留前 3 条，intensity clamp |
| `intentWeights` | 仅保留 allowedIntents 键，clamp [0, 3] |
| `targetPriorities` | 仅保留 allowedTargets 键，clamp [0, 3] |
| `riskTolerance` | clamp [0, 1] |
| `ttlSec` | clamp [8, 120] |
| 文本字段 | sanitize + 长度截断 |

### 6.4 文本字段长度限制

```javascript
// POLICY_TEXT_LIMITS (aiConfig.js)
summary:  140 chars → 实际 max 140 × 4 = 560 chars（UTF-8 字节考量）
focus:     72 chars → max 72  × 4 = 288 chars
note:     120 chars → max 120 × 4 = 480 chars
maxNotes:   4 条
```

---

## 7. aiConfig.js 配置参考

```javascript
export const AI_CONFIG = {
  environmentEndpoint:    "/api/ai/environment",
  policyEndpoint:         "/api/ai/policy",
  requestTimeoutMs:       120000,   // 2 分钟
  maxDirectiveDurationSec: 180,
  maxPolicyTtlSec:         120,
  minDecisionIntervalSec:    8,
  enableByDefault:          false,
  retryAfterFailureSec:      8,
};
```

**`.env` 运行时配置（`server/ai-proxy.js` 读取）：**

```
OPENAI_API_KEY=<key>
OPENAI_BASE_URL=https://api.resurge.one/v1
OPENAI_MODEL=gemini-3.1-pro-preview
AI_PROXY_PORT=8787
OPENAI_REQUEST_TIMEOUT_MS=120000
```

---

## 8. 系统调用关系图

```
GameLoop (帧循环)
  │
  ├─ EnvironmentDirectorSystem (节流调度)
  │    ├─ buildWorldSummary(state)
  │    ├─ LLMClient.requestEnvironment()  ──→ POST /api/ai/environment
  │    │    ├─ 成功: validateEnvironmentDirective → guardEnvironmentDirective
  │    │    └─ 失败: buildEnvironmentFallback()
  │    └─ applyEnvironmentDirective(state, data)
  │         └─ state.weather / WorldEventSystem / factionTension
  │
  ├─ NPCBrainSystem (节流调度)
  │    ├─ buildPolicySummary(state)
  │    ├─ LLMClient.requestPolicies()     ──→ POST /api/ai/policy
  │    │    ├─ 成功: validateGroupPolicy → guardGroupPolicies
  │    │    └─ 失败: buildPolicyFallback()
  │    └─ state.ai.policies → 各组 Agent 行为树权重
  │
  ├─ StrategicDirector (90s Heartbeat)
  │    ├─ buildPromptContent(state)
  │    ├─ LLMClient.requestEnvironment()  ──→ POST /api/ai/environment (channel=strategic)
  │    │    └─ 失败: buildFallbackStrategy()
  │    └─ state.ai.strategy → state.gameplay.strategicGoal
  │
  └─ ColonyPlanner (shouldReplan() 触发)
       ├─ ColonyPerceiver.observe()
       ├─ buildPlannerPrompt(observation, memory, state)
       ├─ callLLM()                         ──→ POST /api/ai/environment (同代理)
       │    └─ 失败: generateFallbackPlan()
       └─ PlanExecutor 队列 → ConstructionSystem
```

---

*最后更新：2026-04-25*
