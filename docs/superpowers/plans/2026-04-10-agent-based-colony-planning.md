# Agent-Based Colony Planning & Building System

> **Status**: Phase 2 Complete (v1.2)
> **Author**: Claude / Daize Dong
> **Date**: 2026-04-10
> **Scope**: ColonyDirectorSystem upgrade — from rule-based priority queue to LLM agent closed-loop planning

---

## 1. Motivation & Problem Statement

### 1.1 Current System Limitations

The existing `ColonyDirectorSystem` uses a **static priority queue** with hardcoded phase targets:

```
Emergency (100) → Bootstrap (80) → Logistics (70) → Processing (72-77) → Fortification (45-74) → Expansion (38-55) → Continuous (20-35)
```

This approach has fundamental limitations:

| Problem | Description |
|---------|-------------|
| **No spatial reasoning** | Placement is greedy — finds first valid tile near infrastructure, ignores terrain quality, chokepoints, resource flow topology |
| **No temporal planning** | Cannot reason about "build quarry now so smithy can produce tools by t=300" |
| **No adaptive strategy** | Fixed 2:1 farm:lumber ratio regardless of map, season, threat level |
| **No self-evaluation** | Cannot detect "80 farms + 3 warehouses = bad" until food crisis occurs |
| **No coordination** | Building placement ignores worker patrol patterns, delivery routes, defense geometry |
| **Fragile phase transitions** | Linear phase progression doesn't adapt to non-standard maps or player disruption |

### 1.2 Design Goal

Design a **closed-loop agent system** that:
1. **Observes** colony state and terrain topology
2. **Plans** multi-step build sequences with spatial and temporal reasoning
3. **Executes** plans via the existing BuildSystem
4. **Evaluates** outcomes against predicted effects
5. **Adapts** plans when observations diverge from expectations

---

## 2. Theoretical Foundation

### 2.1 Core Agent Paradigms

The design synthesizes insights from five frontier agent architectures:

#### 2.1.1 ReAct: Reasoning + Acting [1]

ReAct interleaves reasoning traces with environment actions. Each step produces a **Thought → Action → Observation** cycle. Applied to colony planning:

```
Thought: "Food production is 2.1/s but consumption is 3.0/s. Need 2 more farms within warehouse coverage."
Action: Plan(farm, near_warehouse_3, priority=high)
Observation: Farm placed at (42,31). Food rate now 2.8/s. Still deficit.
Thought: "One more farm needed, but wood is low. Should build lumber first."
Action: Plan(lumber, near_warehouse_3, priority=high)
```

This replaces the current system's blind priority evaluation with **causal reasoning** about *why* a building is needed and *what effect* it should produce.

> **[1]** Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2023). *ReAct: Synergizing Reasoning and Acting in Language Models.* ICLR 2023. arXiv:2210.03629

#### 2.1.2 Reflexion: Self-Evaluating Agents [2]

Reflexion adds an **evaluator** that assesses whether the agent's plan succeeded, and a **self-reflection** step that stores lessons for future episodes. Key insight: the agent maintains a **reflective memory** separate from working memory.

Applied to colony planning:
- After each build cycle, evaluate: "Did the planned farm increase food rate?"
- If not: reflect — "Farm at (42,31) is too far from warehouse. Future farms must be within 8 tiles."
- Store reflection in MemoryStore for future planning cycles.

> **[2]** Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning.* NeurIPS 2023. arXiv:2303.11366

#### 2.1.3 Inner Monologue: Grounded Feedback for Embodied Agents [3]

Inner Monologue grounds language model planning in continuous environmental feedback. The agent maintains a running internal dialogue that incorporates sensor observations, success detection, and scene description at each step.

Applied to colony planning:
- Each evaluation tick generates a **structured scene description** (resource rates, spatial coverage, threat vectors)
- The agent's plan is always grounded in *current* observations, not stale state
- Success/failure detection drives plan continuation vs. replanning

> **[3]** Huang, W., Xia, F., Xiao, T., Chan, H., Liang, J., Florence, P., Zeng, A., Tompson, J., Mordatch, I., Chebotar, Y., Sermanet, P., Brown, T., Jackson, T., Luu, L., Levine, S., Hausman, K., & Ichter, B. (2023). *Inner Monologue: Embodied Reasoning through Planning with Language Models.* CoRL 2022. arXiv:2207.05608

#### 2.1.4 Voyager: Open-Ended Embodied Agent [4]

Voyager introduces three key mechanisms for game agents:
1. **Automatic curriculum** — progressively harder objectives
2. **Skill library** — reusable action programs
3. **Iterative prompting** with environment feedback

Applied to colony planning:
- **Build patterns** as reusable skills: "logistics hub" (warehouse + 4 roads + 2 farms), "defense line" (wall chain + road), "processing cluster" (quarry + smithy + road)
- **Curriculum**: bootstrap → logistics → processing → defense → expansion (already exists as phases, but now data-driven)
- **Iterative refinement**: plan → execute partial → observe → adjust plan

> **[4]** Wang, G., Xie, Y., Jiang, Y., Mandlekar, A., Xiao, C., Zhu, Y., Fan, L., & Anandkumar, A. (2023). *Voyager: An Open-Ended Embodied Agent with Large Language Models.* arXiv:2305.16291

#### 2.1.5 Plan-and-Solve: Decomposition with Verification [5]

Plan-and-Solve prompting decomposes complex problems into subtasks, solves each, and verifies the solution. The "PS+" variant adds explicit variable extraction and calculation verification.

Applied to colony planning:
- Decompose "achieve food surplus" into: (1) count current farms and their warehouse distances, (2) calculate expected yield per farm based on fertility and worker allocation, (3) determine how many new farms are needed and where, (4) verify placement feasibility
- Each subtask produces **verifiable intermediate results**

> **[5]** Wang, L., Xu, W., Lan, Y., Hu, Z., Lan, Y., Lee, R.K.W., & Lim, E.P. (2023). *Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models.* ACL 2023. arXiv:2305.04091

### 2.2 Additional References

| Reference | Key Contribution | Application |
|-----------|-----------------|-------------|
| **GITM** [6] — Zhu et al., 2023 | Goal decomposition tree for Minecraft agents | Hierarchical goal → subgoal → action decomposition |
| **SayCan** [7] — Ahn et al., 2022 | Grounding LLM proposals in affordance scores | Filter LLM building proposals by actual placement feasibility |
| **ToolLLM** [8] — Qin et al., 2024 | Tool-augmented LLM with depth-first decision tree | Multi-tool orchestration for spatial analysis |
| **Generative Agents** [9] — Park et al., 2023 | Reflection + retrieval memory for game NPCs | Memory-augmented long-horizon planning |
| **LLM-MCTS** [10] — Zhao et al., 2024 | Monte Carlo Tree Search with LLM value heuristic | Evaluate candidate build plans via simulated rollout |

> **[6]** Zhu, X., Chen, Y., Tian, H., Tao, C., Su, W., Yang, C., Huang, G., Li, B., Lu, L., Wang, X., Qiao, Y., Zhang, Z., & Dai, J. (2023). *Ghost in the Minecraft: Generally Capable Agents for Open-World Environments via Large Language Models with Text-based Knowledge and Memory.* arXiv:2305.17144
>
> **[7]** Ahn, M., Brohan, A., Brown, N., et al. (2022). *Do As I Can, Not As I Say: Grounding Language in Robotic Affordances.* arXiv:2204.01691
>
> **[8]** Qin, Y., Liang, S., Ye, Y., et al. (2024). *ToolLLM: Facilitating Large Language Models to Master 16000+ Real-World APIs.* ICLR 2024. arXiv:2307.16789
>
> **[9]** Park, J.S., O'Brien, J.C., Cai, C.J., Morris, M.R., Liang, P., & Bernstein, M.S. (2023). *Generative Agents: Interactive Simulacra of Human Behavior.* UIST 2023. arXiv:2304.03442
>
> **[10]** Zhao, H., et al. (2024). *Large Language Models as Commonsense Knowledge for Large-Scale Task Planning.* NeurIPS 2023. arXiv:2305.14078

---

## 3. System Architecture

### 3.1 Overview

```
┌─────────────────────────────────────────────────────────┐
│                   AgentDirectorSystem                    │
│  (replaces ColonyDirectorSystem when AI enabled)        │
│                                                         │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────┐ │
│  │   Perceiver    │──▶│    Planner     │──▶│  Executor  ││
│  │  (Observe)     │   │  (Reason+Plan) │   │  (Act)     ││
│  └───────────────┘   └───────┬───────┘   └─────┬─────┘ │
│         ▲                    │                   │       │
│         │              ┌─────▼─────┐            │       │
│         │              │  Evaluator │            │       │
│         │              │ (Reflect)  │            │       │
│         │              └─────┬─────┘            │       │
│         │                    │                   │       │
│         │              ┌─────▼─────┐            │       │
│         └──────────────│   Memory   │◀───────────┘       │
│                        │  (Store)   │                    │
│                        └───────────┘                    │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Skill Library (Build Patterns)          ││
│  │  logistics_hub | defense_line | processing_cluster  ││
│  │  food_district | expansion_outpost | bridge_link    ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │           Algorithmic Fallback Layer                 ││
│  │   (Current ColonyDirectorSystem as safety net)      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Role | Paradigm Reference |
|-----------|------|--------------------|
| **Perceiver** | Builds structured world model from game state | Inner Monologue [3] — scene description |
| **Planner** | Generates multi-step build plans with reasoning | ReAct [1] + Plan-and-Solve [5] |
| **Executor** | Translates plans to BuildSystem calls with affordance checking | SayCan [7] — grounded execution |
| **Evaluator** | Measures plan outcomes vs. predictions | Reflexion [2] — success detection |
| **Memory** | Stores reflections, patterns, and spatial knowledge | Generative Agents [9] + Reflexion [2] |
| **Skill Library** | Reusable compound build patterns | Voyager [4] — skill library |
| **Fallback** | Rule-based system when LLM unavailable | Current ColonyDirectorSystem |

---

## 4. Detailed Design

### 4.1 Perceiver: Structured World Model

The Perceiver transforms raw game state into a **structured observation** optimized for LLM reasoning.

#### 4.1.1 Observation Schema

```javascript
/**
 * Generated every planning cycle (10-30s depending on colony size).
 * Designed to be compact yet information-dense for LLM consumption.
 */
const observation = {
  // ── Resource Flow Analysis ──
  economy: {
    food: { stock: 24, rate: "+1.2/s", trend: "declining", projectedZeroSec: 20 },
    wood: { stock: 156, rate: "+3.1/s", trend: "rising", projectedZeroSec: null },
    stone: { stock: 8, rate: "+0.4/s", trend: "stable" },
    herbs: { stock: 3, rate: "+0.2/s", trend: "stable" },
    // Processed goods
    meals: { stock: 0, rate: "0/s", bottleneck: "no kitchen workers" },
    tools: { stock: 11, rate: "+0.1/s", bottleneck: null },
    medicine: { stock: 4, rate: "0/s", bottleneck: "no clinic" },
  },

  // ── Spatial Topology ──
  topology: {
    clusters: [
      {
        id: "main_base",
        center: { ix: 48, iz: 36 },
        warehouses: 4,
        farms: 12, lumbers: 3, quarries: 2,
        workerCount: 18,
        avgWarehouseDistance: 3.2,
        coverageRatio: 0.92,
        avgElevation: 0.35,
        avgMoisture: 0.62,
      },
      {
        id: "north_outpost",
        center: { ix: 52, iz: 18 },
        warehouses: 1,
        farms: 3, lumbers: 2,
        workerCount: 6,
        avgWarehouseDistance: 5.1,
        coverageRatio: 0.67,
        avgElevation: 0.55,
        avgMoisture: 0.41,
      },
    ],
    disconnectedWorksites: 4,
    roadNetworkSize: 45,
    expansionFrontiers: [
      { direction: "north", availableGrass: 120, avgMoisture: 0.55, avgElevation: 0.4, threats: "low" },
      { direction: "east", availableGrass: 80, avgMoisture: 0.7, avgElevation: 0.3, threats: "medium" },
    ],
  },

  // ── Population & Workforce ──
  workforce: {
    total: 42,
    allocation: { farm: 22, wood: 8, stone: 2, herbs: 1, cook: 1, smith: 1, herbalist: 1, haul: 1, idle: 5 },
    popCap: 80,
    growthBlocked: "food < 20",
    avgHunger: 0.62,
    workerEfficiency: 0.78, // fraction of time spent productively
  },

  // ── Threat & Defense ──
  defense: {
    threat: 42,
    wallCoverage: 0.35,
    wallElevationBonus: 1.12,
    activeSaboteurs: 1,
    recentDamage: [
      { type: "sabotage", target: "farm@(44,33)", timeSec: 15 },
    ],
  },

  // ── Season & Weather ──
  environment: {
    season: "summer",
    seasonProgress: 0.6,
    weather: "drought",
    weatherRemainingSec: 18,
    fireRisk: "high",
    fertilityModifier: 0.85,
  },

  // ── Objective Progress ──
  objective: {
    id: "stockpile-1",
    progress: 0.65,
    requirements: { food: "72/95", wood: "156/90 ✓", prosperity: "52/55", walls: "8/8 ✓" },
    estimatedCompletionSec: 180,
  },

  // ── Active Plans ──
  activePlan: {
    id: "plan_042",
    goal: "establish_food_surplus",
    stepsTotal: 5,
    stepsCompleted: 2,
    currentStep: "build farm near warehouse_3",
    blockers: ["wood < 10 for next warehouse"],
  },
};
```

#### 4.1.2 Cluster Detection Algorithm

Infrastructure clusters are detected using **BFS flood-fill** from warehouses with a maximum hop distance:

```javascript
function detectClusters(grid, maxHopDistance = 12) {
  // 1. Seed from each warehouse tile
  // 2. BFS along roads/buildings (Manhattan adjacency)
  // 3. Merge overlapping clusters (shared tiles)
  // 4. For each cluster: compute centroid, coverage, worker count, resource rates
  // Result: Array of cluster objects with spatial summaries
}
```

#### 4.1.3 Resource Rate Estimation

Resource production rates are estimated by sampling delta over a sliding window:

```javascript
function estimateResourceRates(state, windowSec = 30) {
  // Track resource values at each sample interval
  // Compute linear regression slope → rate per second
  // Project time-to-zero for declining resources
  // Identify bottlenecks (e.g., "kitchen exists but no workers assigned to COOK")
}
```

### 4.2 Planner: ReAct + Plan-and-Solve

The Planner is the core LLM-powered component. It generates **multi-step build plans** using structured reasoning.

#### 4.2.1 Planning Cycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Trigger  │────▶│ Perceive │────▶│  Reason  │────▶│   Plan   │
│ Decision  │     │  State   │     │  (LLM)   │     │  Output  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     ▲                                                    │
     │                                                    ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Adapt   │◀────│ Evaluate │◀────│ Execute  │◀────│ Ground   │
│  Memory  │     │ Outcome  │     │  Steps   │     │ Affordnce│
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

**Trigger Conditions** (extends DecisionScheduler):
- Heartbeat: every 30s (more frequent than StrategicDirector's 90s)
- Plan completion: current plan finished or blocked
- Crisis: food rate negative + stock < 30
- Opportunity: wood > 100 and many valid build sites
- Evaluation failure: predicted outcome not achieved within tolerance

#### 4.2.2 LLM Prompt Structure

```markdown
# Colony Construction Planner

## Current Observation
{observation JSON — see 4.1.1}

## Recent Reflections
{last 5 reflections from MemoryStore, filtered by "construction" category}

## Available Skills
{skill library summaries — see 4.4}

## Available Build Actions
- farm (cost: 5 wood) — food production, needs warehouse within 12 tiles
- lumber (cost: 5 wood) — wood production
- warehouse (cost: 10 wood) — logistics anchor, spacing ≥ 5 tiles
- quarry (cost: 6 wood) — stone production
- herb_garden (cost: 4 wood) — herb production
- kitchen (cost: 8 wood + 3 stone) — converts food → meals
- smithy (cost: 6 wood + 5 stone) — converts stone → tools
- clinic (cost: 6 wood + 4 herbs) — converts herbs → medicine
- road (cost: 1 wood) — extends logistics network
- wall (cost: 2 wood) — defense structure
- bridge (cost: 3 wood + 1 stone) — crosses water

## Terrain Context
- Elevation affects: movement cost, build cost, wall defense bonus
- Moisture affects: fertility cap, fire risk
- Season affects: weather probabilities, growth rates

## Your Task
Analyze the observation and produce a **build plan** with 3-8 steps.

For each step, provide:
1. **Thought**: Why is this action needed? What effect do you predict?
2. **Action**: What to build (type + preferred location hint)
3. **Predicted Effect**: Quantitative prediction (e.g., "food rate +0.5/s")
4. **Priority**: critical / high / medium / low
5. **Dependencies**: Which prior steps must complete first

## Output Format (JSON)
{
  "goal": "short description of what this plan achieves",
  "horizon_sec": estimated time to complete entire plan,
  "reasoning": "2-3 sentence strategic analysis",
  "steps": [
    {
      "id": 1,
      "thought": "Food rate is -0.8/s. Need farm near main_base warehouse cluster.",
      "action": { "type": "farm", "hint": "near_cluster:main_base", "skill": null },
      "predicted_effect": { "food_rate_delta": "+0.5/s" },
      "priority": "critical",
      "depends_on": []
    },
    {
      "id": 2,
      "thought": "Wood accumulating (156). Should invest in warehouse for north outpost coverage.",
      "action": { "type": "warehouse", "hint": "cluster:north_outpost, coverage_gap" },
      "predicted_effect": { "coverage_ratio": "0.67 → 0.85" },
      "priority": "high",
      "depends_on": []
    },
    {
      "id": 3,
      "thought": "Once warehouse is placed, add farms nearby for food production.",
      "action": { "type": "farm", "hint": "near_step:2" },
      "predicted_effect": { "food_rate_delta": "+0.4/s" },
      "priority": "high",
      "depends_on": [2]
    }
  ]
}

## Hard Rules
- Never plan more buildings than current resources can afford (including buffer)
- Warehouse spacing must be ≥ 5 tiles from nearest warehouse
- Production buildings should be within 12 tiles of a warehouse
- Consider current season: drought = fire risk for low-moisture farms/lumbers
- Food-producing steps should come before expansion when food rate is negative
```

#### 4.2.3 Plan Validation & Grounding (SayCan-inspired)

Before executing, each plan step is **grounded** against actual game state:

```javascript
function groundPlanStep(step, state, buildSystem) {
  // 1. Parse location hint → candidate tiles
  const candidates = resolveLocationHint(step.action.hint, state);

  // 2. Check affordability (SayCan affordance score)
  const cost = BUILD_COST[step.action.type];
  const canAffordScore = computeAffordanceScore(state.resources, cost);

  // 3. Check placement feasibility for each candidate
  const feasibleTiles = candidates.filter(tile => {
    const preview = buildSystem.previewToolAt(state, step.action.type, tile.ix, tile.iz);
    return preview.ok;
  });

  // 4. Rank by terrain quality (moisture for farms, elevation for walls)
  const rankedTiles = rankByTerrainQuality(feasibleTiles, step.action.type, state.grid);

  // 5. Return grounded step with concrete placement
  return {
    ...step,
    groundedTile: rankedTiles[0] ?? null,
    affordanceScore: canAffordScore,
    feasible: rankedTiles.length > 0 && canAffordScore > 0.5,
  };
}
```

**Location Hint Resolution**:

| Hint Format | Resolution Strategy |
|-------------|-------------------|
| `near_cluster:<id>` | Search within radius 6 of cluster centroid |
| `near_step:<id>` | Search within radius 4 of grounded tile from step N |
| `expansion:<direction>` | Search in expansion frontier tiles |
| `coverage_gap` | Use findCoverageWarehousePlacement |
| `defense_line:<from>-<to>` | Manhattan walk between two points |
| `terrain:high_moisture` | Filter tiles by moisture > 0.5, then search from infrastructure |

### 4.3 Evaluator: Reflexion-based Outcome Assessment

After each plan step executes, the Evaluator compares actual outcomes to predictions.

#### 4.3.1 Evaluation Metrics

```javascript
const evaluation = {
  stepId: 1,
  action: "farm",
  predicted: { food_rate_delta: "+0.5/s" },
  actual: { food_rate_delta: "+0.3/s" },
  deviation: -0.2,  // actual - predicted
  success: true,     // within 50% tolerance
  diagnosis: null,   // set if failure
};
```

**Success Criteria**:
- Quantitative predictions: actual within **50%** of predicted value
- Binary predictions (coverage improvement): check boolean outcome
- Multi-step plans: overall goal achieved within `horizon_sec * 1.5`

#### 4.3.2 Failure Diagnosis

When evaluation fails, the system generates a **structured diagnosis**:

```javascript
function diagnoseFailure(step, evaluation, state) {
  const causes = [];

  // Check if building was actually placed
  if (!evaluation.buildSuccess) {
    causes.push({ type: "placement_failure", detail: "no valid tile found" });
  }

  // Check if workers are servicing the building
  if (step.action.type === "farm") {
    const nearbyWorkers = countWorkersNear(step.groundedTile, state, 12);
    if (nearbyWorkers === 0) {
      causes.push({ type: "no_workers", detail: "farm too far from worker paths" });
    }
  }

  // Check warehouse coverage
  const warehouseDist = nearestWarehouseDistance(step.groundedTile, state);
  if (warehouseDist > 12) {
    causes.push({ type: "uncovered", detail: `nearest warehouse is ${warehouseDist} tiles away` });
  }

  // Check terrain quality
  const moisture = state.grid.moisture?.[tileIndex] ?? 0.5;
  if (step.action.type === "farm" && moisture < 0.3) {
    causes.push({ type: "poor_terrain", detail: `low moisture (${moisture.toFixed(2)}) limits fertility` });
  }

  return causes;
}
```

#### 4.3.3 Reflection Generation

Diagnoses are converted to **natural language reflections** and stored in MemoryStore:

```javascript
function generateReflection(step, evaluation, diagnosis) {
  // Template-based reflection with concrete values
  if (diagnosis.type === "uncovered") {
    return {
      text: `Farm at (${step.groundedTile.ix},${step.groundedTile.iz}) produced only ${evaluation.actual.food_rate_delta}/s vs predicted ${step.predicted.food_rate_delta}/s because nearest warehouse is ${diagnosis.detail}. Future farms must be within 8 tiles of a warehouse.`,
      category: "construction_reflection",
      importance: 4,
    };
  }
  // ... other templates
}
```

### 4.4 Skill Library: Compound Build Patterns (Voyager-inspired)

Skills are **reusable multi-step build templates** that the Planner can invoke as atomic actions.

#### 4.4.1 Skill Definition

```javascript
const SKILL_LIBRARY = {
  logistics_hub: {
    name: "Logistics Hub",
    description: "Warehouse + road star + 2 farms — creates a new logistics anchor with food production",
    preconditions: { wood: 22, availableGrass: 12 },
    steps: [
      { type: "warehouse", offset: [0, 0] },
      { type: "road", offset: [1, 0] },
      { type: "road", offset: [-1, 0] },
      { type: "road", offset: [0, 1] },
      { type: "road", offset: [0, -1] },
      { type: "farm", offset: [2, 0] },
      { type: "farm", offset: [-2, 0] },
    ],
    expectedEffect: { coverage: "+1 cluster", food_rate: "+1.0/s" },
    terrain_preference: { minMoisture: 0.4 },
  },

  processing_cluster: {
    name: "Processing Cluster",
    description: "Quarry + Smithy near warehouse — unlocks tools for colony-wide production boost",
    preconditions: { wood: 18, stone: 5 },
    steps: [
      { type: "quarry", offset: [0, 0] },
      { type: "road", offset: [1, 0] },
      { type: "smithy", offset: [2, 0] },
    ],
    expectedEffect: { tools_rate: "+0.2/s", production_multiplier: "+15%" },
    terrain_preference: { maxElevation: 0.6 },
  },

  defense_line: {
    name: "Defense Line",
    description: "Wall chain along elevation ridge — maximizes wall defense bonus",
    preconditions: { wood: 10 },
    steps: [
      { type: "wall", offset: [0, 0] },
      { type: "wall", offset: [1, 0] },
      { type: "wall", offset: [2, 0] },
      { type: "wall", offset: [3, 0] },
      { type: "wall", offset: [4, 0] },
    ],
    expectedEffect: { threat: "-5", wall_coverage: "+0.05" },
    terrain_preference: { minElevation: 0.6 },
  },

  food_district: {
    name: "Food District",
    description: "Dense farm cluster near warehouse with kitchen — maximizes food throughput",
    preconditions: { wood: 25, stone: 3, farms: ">= 6" },
    steps: [
      { type: "farm", offset: [0, 1] },
      { type: "farm", offset: [1, 0] },
      { type: "farm", offset: [0, -1] },
      { type: "farm", offset: [-1, 0] },
      { type: "kitchen", offset: [0, 0] },
    ],
    expectedEffect: { food_rate: "+2.0/s", meals_rate: "+0.3/s" },
    terrain_preference: { minMoisture: 0.5 },
  },

  expansion_outpost: {
    name: "Expansion Outpost",
    description: "Warehouse + road + farm + lumber in new territory — seeds colony expansion",
    preconditions: { wood: 22 },
    steps: [
      { type: "road", offset: [-1, 0] },
      { type: "warehouse", offset: [0, 0] },
      { type: "road", offset: [1, 0] },
      { type: "farm", offset: [2, 0] },
      { type: "lumber", offset: [0, 2] },
    ],
    expectedEffect: { coverage: "+1 frontier", food_rate: "+0.4/s", wood_rate: "+0.5/s" },
    terrain_preference: { minMoisture: 0.3 },
  },

  bridge_link: {
    name: "Bridge Link",
    description: "Bridge chain across water with road approaches — connects islands",
    preconditions: { wood: 12, stone: 4 },
    steps: [
      { type: "road", offset: [-1, 0] },
      { type: "bridge", offset: [0, 0] },
      { type: "bridge", offset: [1, 0] },
      { type: "road", offset: [2, 0] },
    ],
    expectedEffect: { connectivity: "+1 route" },
    terrain_preference: {},
  },
};
```

#### 4.4.2 Skill Selection by Planner

The LLM Planner can reference skills in its plan output:

```json
{
  "id": 2,
  "thought": "North frontier has 120 available grass tiles with good moisture. Perfect for expansion outpost.",
  "action": { "type": "skill", "skill": "expansion_outpost", "hint": "expansion:north" },
  "predicted_effect": { "coverage": "+1 frontier", "food_rate": "+0.4/s" },
  "priority": "high",
  "depends_on": [1]
}
```

#### 4.4.3 Learned Skills (Future)

Over time, successful ad-hoc build sequences that produce above-average results can be **promoted to skills**:

```javascript
function maybeLearnSkill(completedPlan, evaluation) {
  if (evaluation.overallSuccess && evaluation.efficiency > 1.2) {
    // Extract successful step sequence as a new skill
    const skill = {
      name: `learned_${Date.now()}`,
      description: completedPlan.goal,
      steps: completedPlan.steps.map(s => ({
        type: s.action.type,
        offset: computeRelativeOffset(s.groundedTile, completedPlan.anchor),
      })),
      expectedEffect: evaluation.actual,
      terrain_preference: inferTerrainPreference(completedPlan),
    };
    skillLibrary.add(skill);
  }
}
```

### 4.5 Memory Integration

The agent system extends the existing `MemoryStore` with construction-specific categories:

| Category | Content | Importance | Retrieval Query |
|----------|---------|------------|-----------------|
| `construction_plan` | "Plan goal: establish food surplus. 5 steps." | 3 | "food production planning" |
| `construction_reflection` | "Farm at (42,31) underperformed due to low moisture." | 4 | "farm placement moisture" |
| `construction_pattern` | "Logistics hubs work best at moisture > 0.5." | 5 | "logistics hub placement" |
| `construction_failure` | "Expansion to north failed — predator zone." | 4 | "expansion north threat" |
| `terrain_knowledge` | "NE quadrant: high elevation, low moisture, poor farming." | 3 | "terrain northeast" |

**Memory Retrieval in Planning**:
- Before generating a plan, retrieve top-5 relevant memories
- Inject as "Recent Reflections" in the LLM prompt
- This enables the agent to **learn from past mistakes** (Reflexion [2])

---

## 5. Execution Flow

### 5.1 Tick-Level Integration

```javascript
class AgentDirectorSystem {
  constructor(memoryStore) {
    this.name = "AgentDirectorSystem";
    this._fallback = new ColonyDirectorSystem();  // algorithmic safety net
    this._perceiver = new ColonyPerceiver();
    this._planner = new ColonyPlanner(memoryStore);
    this._executor = new PlanExecutor();
    this._evaluator = new PlanEvaluator(memoryStore);
    this._activePlan = null;
    this._lastPlanSec = 0;
  }

  update(dt, state, services) {
    const director = state.ai.agentDirector ??= {
      mode: "agent",          // "agent" | "fallback"
      activePlan: null,
      planHistory: [],
      reflections: [],
      stats: { plansGenerated: 0, plansCompleted: 0, plansFailed: 0 },
    };

    // Always run scenario requirements (non-negotiable)
    this._fallback._ensureBuildSystem(state);
    fulfillScenarioRequirements(state, this._fallback._buildSystem);

    // If AI disabled or LLM unavailable, use fallback
    if (!state.ai.enabled) {
      this._fallback.update(dt, state, services);
      return;
    }

    const nowSec = state.metrics.timeSec ?? 0;

    // ── Step 1: Execute current plan steps ──
    if (this._activePlan && this._activePlan.steps.length > 0) {
      const executed = this._executor.executeNextSteps(
        this._activePlan, state, this._fallback._buildSystem
      );

      // ── Step 2: Evaluate completed steps ──
      for (const step of executed) {
        const evaluation = this._evaluator.evaluate(step, state);
        if (!evaluation.success) {
          const reflection = this._evaluator.reflect(step, evaluation, state);
          services.memoryStore.addReflection(nowSec, reflection.text);
        }
      }

      // Check if plan is complete or blocked
      if (this._executor.isPlanComplete(this._activePlan)) {
        const overallEval = this._evaluator.evaluatePlan(this._activePlan, state);
        director.stats.plansCompleted += 1;
        director.planHistory.push({
          goal: this._activePlan.goal,
          success: overallEval.success,
          completedAtSec: nowSec,
        });
        this._activePlan = null;
      } else if (this._executor.isPlanBlocked(this._activePlan, state)) {
        // Plan is stuck — request replan
        this._activePlan = null;
      }
    }

    // ── Step 3: Generate new plan if needed ──
    if (!this._activePlan && this._shouldReplan(nowSec, state)) {
      const observation = this._perceiver.observe(state);
      const memories = services.memoryStore.formatForPrompt(
        "construction planning building", nowSec, 5
      );

      // Async LLM call (non-blocking)
      this._planner.requestPlan(observation, memories, state).then(plan => {
        if (plan) {
          // Ground all steps against actual game state
          const grounded = this._executor.groundPlan(plan, state, this._fallback._buildSystem);
          this._activePlan = grounded;
          director.activePlan = { goal: plan.goal, steps: plan.steps.length };
          director.stats.plansGenerated += 1;
        }
      });

      this._lastPlanSec = nowSec;
    }

    // ── Step 4: Fallback — if no active plan, use algorithmic system ──
    if (!this._activePlan) {
      this._fallback.update(dt, state, services);
    }
  }
}
```

### 5.2 Async Planning Pipeline

```
                    ┌─────────────┐
                    │   Trigger   │
                    │  (10-30s)   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Perceive   │  ← 2ms (synchronous)
                    │  State      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  LLM Call   │  ← 1-5s (async, non-blocking)
                    │  (Plan)     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Ground &   │  ← 5ms (synchronous)
                    │  Validate   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │ Step 1  │─────▶│ Step 2  │─────▶│ Step 3  │  ← Execute over
    │ Execute │      │ Execute │      │ Execute │    multiple ticks
    │ Evaluate│      │ Evaluate│      │ Evaluate│
    └─────────┘      └─────────┘      └─────────┘
                                            │
                                     ┌──────▼──────┐
                                     │  Evaluate   │
                                     │  Full Plan  │
                                     │  + Reflect  │
                                     └─────────────┘
```

**Key Design Decision**: During the 1-5s async LLM call, the **algorithmic fallback** continues operating. This ensures the colony never stalls waiting for AI. When the LLM plan arrives, it supersedes the fallback.

### 5.3 Plan Execution Strategy

```javascript
class PlanExecutor {
  executeNextSteps(plan, state, buildSystem) {
    const executed = [];
    const maxPerTick = 2;  // match current build rate

    for (const step of plan.steps) {
      if (executed.length >= maxPerTick) break;
      if (step.status === "completed" || step.status === "failed") continue;

      // Check dependencies
      const depsComplete = step.depends_on.every(depId =>
        plan.steps.find(s => s.id === depId)?.status === "completed"
      );
      if (!depsComplete) continue;

      // Check affordability
      if (!this._canAfford(step, state)) {
        step.status = "waiting_resources";
        continue;
      }

      // Execute
      if (step.action.skill) {
        // Skill execution: run each sub-step
        const result = this._executeSkill(step, state, buildSystem);
        step.status = result.ok ? "completed" : "failed";
      } else {
        // Single build action
        const tile = step.groundedTile;
        if (!tile) { step.status = "failed"; continue; }

        const result = buildSystem.placeToolAt(
          state, step.action.type, tile.ix, tile.iz, { recordHistory: false }
        );
        step.status = result.ok ? "completed" : "failed";
        step.actualTile = result.ok ? tile : null;
      }

      if (step.status === "completed") {
        state.buildings = rebuildBuildingStats(state.grid);
      }
      executed.push(step);
    }

    return executed;
  }
}
```

---

## 6. Fallback & Safety

### 6.1 Graceful Degradation

The system operates in three modes with automatic fallback:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Full Agent  │────▶│  Hybrid Mode │────▶│  Pure Algo   │
│  (LLM + Algo) │     │ (Algo + Mem) │     │ (Current)    │
└──────────────┘     └──────────────┘     └──────────────┘
  LLM available       LLM unavailable      AI disabled
  Plan + Execute      Algo + Reflections   assessColonyNeeds
  Evaluate + Learn    Use past memories    + selectNextBuilds
```

**Mode Selection**:
```javascript
function selectMode(state, services) {
  if (!state.ai.enabled) return "algorithmic";
  if (services.llmClient.lastStatus === "down") return "hybrid";
  return "agent";
}
```

**Hybrid Mode**: Uses the algorithmic ColonyDirectorSystem but injects stored reflections to adjust priorities. For example, if memory contains "farms at low moisture underperform", the hybrid mode filters placement candidates by moisture.

### 6.2 Safety Invariants

Regardless of mode, these invariants are **always enforced** at the executor level:

```javascript
const SAFETY_INVARIANTS = {
  // Never deplete resources below survival floor
  minWood: 5,
  minFood: 5,

  // Never build more production buildings than workers can service
  maxFarmsPerWorker: 1.2,
  maxLumberPerWorker: 0.6,

  // Never place buildings on water (except bridges) or protected tiles
  protectedTileTypes: new Set([TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, ...]),

  // Maximum plan horizon (prevent runaway plans)
  maxPlanSteps: 10,
  maxPlanHorizonSec: 300,

  // Minimum warehouse count (never demolish below this)
  minWarehouses: 3,
};
```

---

## 7. State Schema Extension

```javascript
// Addition to state.ai
state.ai.agentDirector = {
  mode: "agent" | "hybrid" | "algorithmic",
  activePlan: {
    id: "plan_042",
    goal: "establish_food_surplus",
    reasoning: "Food rate declining...",
    steps: [/* PlanStep[] */],
    createdAtSec: 420,
    horizonSec: 120,
  },
  planHistory: [
    { goal: "...", success: true, completedAtSec: 380, stepsCompleted: 4, stepsTotal: 5 },
  ],
  lastObservation: { /* Observation schema */ },
  stats: {
    plansGenerated: 12,
    plansCompleted: 9,
    plansFailed: 2,
    plansSuperseded: 1,
    avgPlanSuccessRate: 0.82,
    totalBuildingsPlaced: 84,
    reflectionsGenerated: 15,
  },
};
```

---

## 8. LLM Integration Points

### 8.1 API Endpoint

```
POST /api/ai/colony-plan
```

**Request**:
```json
{
  "channel": "colony-planner",
  "observation": { /* Observation schema */ },
  "memories": "Recent reflections...",
  "skillLibrary": { /* Skill summaries */ },
  "hardRules": ["Never deplete wood below 5", ...],
  "systemPrompt": "system prompt markdown (npc-colony-planner.md)"
}
```

**Response**:
```json
{
  "goal": "establish_food_surplus",
  "horizon_sec": 120,
  "reasoning": "...",
  "steps": [/* PlanStep[] */]
}
```

### 8.2 Token Budget

| Component | Estimated Tokens |
|-----------|-----------------|
| System prompt | ~800 |
| Observation | ~600 |
| Memories (5 entries) | ~300 |
| Skill library | ~400 |
| Rules + format | ~300 |
| **Total input** | **~2,400** |
| Plan output | ~400-800 |
| **Total per call** | **~3,000-3,200** |

At 30s intervals with 10-minute games: ~20 calls/game, ~64K tokens total.

### 8.3 Offline Fallback Prompt

When LLM is unavailable, the system uses a **template-based plan generator** that applies the same observation analysis but with deterministic rules:

```javascript
function buildFallbackPlan(observation) {
  const steps = [];

  // Rule 1: Food crisis → farm + warehouse
  if (observation.economy.food.rate < 0) {
    if (observation.topology.clusters[0]?.coverageRatio < 0.8) {
      steps.push({ type: "warehouse", hint: "coverage_gap", priority: "critical" });
    }
    steps.push({ type: "farm", hint: "near_cluster:main_base", priority: "critical" });
  }

  // Rule 2: Wood surplus → expand
  if (observation.economy.wood.stock > 50) {
    steps.push({ type: "skill", skill: "expansion_outpost", hint: "expansion:best" });
  }

  // ... more rules (essentially the current assessColonyNeeds logic, but plan-structured)

  return { goal: "fallback_plan", steps };
}
```

---

## 9. Evaluation Framework

### 9.1 Quantitative Metrics

Track these metrics across planning cycles to measure agent effectiveness:

| Metric | Definition | Target |
|--------|-----------|--------|
| **Plan Success Rate** | % of plans where goal was achieved | > 70% |
| **Prediction Accuracy** | Avg ratio of actual/predicted effects | 0.7 - 1.3 |
| **Building Efficiency** | Buildings placed per plan step | > 0.8 |
| **Time to Recovery** | Seconds from crisis to stable food/wood | < 60s |
| **Coverage Improvement** | Avg coverage ratio gain per plan | > 0.05 |
| **Reflection Utility** | % of reflections referenced in future plans | > 30% |

### 9.2 A/B Comparison Protocol

To validate the agent system against the algorithmic baseline:

```javascript
// In soak-sim.mjs
const scenarios = [
  { templateId: "temperate_plains", seed: 1337, mode: "algorithmic" },
  { templateId: "temperate_plains", seed: 1337, mode: "agent" },
  // ... same for other templates
];

// Compare: building count, population, prosperity, threat at t=300, 600, 900
```

---

## 10. Implementation Phases

### Phase 1: Perceiver + Observation ✅ COMPLETE

- ✅ Implement `ColonyPerceiver` class with BFS cluster detection from warehouses
- ✅ Add `ResourceRateTracker` with sliding-window linear regression
- ✅ Add expansion frontier analysis (4 directional quadrants, moisture/density scoring)
- ✅ Add worksite coverage analysis (disconnected count + percentage)
- ✅ Add logistics bottleneck detection (farm:warehouse, production:warehouse ratios)
- ✅ Add delta tracking between observations (workers, buildings, prosperity, resources)
- ✅ Add prosperity + objective progress normalization
- ✅ Add `computeAffordability()` for downstream planner
- ✅ Add `formatObservationForLLM()` text formatter
- ✅ 31 unit tests (all passing)
- ✅ LLM judge benchmark: avg 9.0/10 across 3 templates (temperate_plains 9/10, archipelago_isles 10/10, fortified_basin 8/10)

**Files**: `src/simulation/ai/colony/ColonyPerceiver.js`, `test/colony-perceiver.test.js`, `scripts/perceiver-benchmark.mjs`

### Phase 2: Skill Library + Executor ✅ COMPLETE

- ✅ Define 6 frozen skills: logistics_hub, processing_cluster, defense_line, food_district, expansion_outpost, bridge_link
- ✅ Implement `SkillLibrary` with skill queries: getSkillTotalCost, checkSkillPreconditions, expandSkillSteps, assessSkillFeasibility, scoreSkillTerrain, selectSkillForGoal, listSkillStatus
- ✅ Implement `PlanExecutor` with `resolveLocationHint()` supporting 7 hint types (near_cluster, near_step, expansion, coverage_gap, defense_line, terrain:high_moisture, explicit coords)
- ✅ Implement SayCan-inspired `computeAffordanceScore()` for resource gating
- ✅ Implement `rankByTerrainQuality()` with type-specific weights (moisture for farms, elevation for walls)
- ✅ Implement `groundPlan()` with topological dependency ordering
- ✅ Implement `executeNextSteps()` with per-tick build limit, skill sub-step atomic execution
- ✅ Implement `isPlanComplete()`, `isPlanBlocked()`, `getPlanProgress()` status queries
- ✅ Terrain scoring uses average across all step positions (not just anchor) with soft penalty floor
- ✅ 50 unit tests (all passing)
- ✅ LLM judge benchmark: avg 9.5/10 across 3 templates (temperate_plains 9/10, archipelago_isles 9.5/10, fortified_basin 10/10)

**Files**: `src/simulation/ai/colony/SkillLibrary.js`, `src/simulation/ai/colony/PlanExecutor.js`, `test/skill-library-executor.test.js`, `scripts/executor-benchmark.mjs`

### Phase 3: Planner + LLM Integration (3-4 days)

- Design system prompt (`src/data/prompts/npc-colony-planner.md`)
- Implement `ColonyPlanner` with LLM call
- Implement plan validation and grounding
- Implement fallback plan generation
- Add `/api/ai/colony-plan` endpoint

**Files**: `src/simulation/ai/colony/ColonyPlanner.js`, `src/data/prompts/npc-colony-planner.md`

### Phase 4: Evaluator + Memory (2-3 days)

- Implement `PlanEvaluator` with prediction comparison
- Implement failure diagnosis
- Implement reflection generation + MemoryStore integration
- Test full planning loop

**Files**: `src/simulation/ai/colony/PlanEvaluator.js`

### Phase 5: AgentDirectorSystem Integration (2-3 days)

- Implement `AgentDirectorSystem` with mode selection
- Wire into GameApp and headless runners
- Implement graceful degradation
- A/B benchmark comparison
- Full test suite

**Files**: `src/simulation/ai/colony/AgentDirectorSystem.js`

### Phase 6: Tuning & Learned Skills (ongoing)

- Tune prompt for prediction accuracy
- Implement skill learning from successful plans
- Add more skills based on gameplay patterns
- Extended soak testing across all map templates

---

## 11. Architectural Principles

1. **Agent as upgrade, not replacement** — The algorithmic system remains as fallback. Agent adds intelligence on top.

2. **Grounded reasoning** — Every LLM proposal is validated against actual game state before execution (SayCan [7]). The agent cannot hallucinate placements.

3. **Learn from failure** — Reflexion [2]-style memory means the agent improves over time within a single game session. Past mistakes inform future plans.

4. **Composable skills** — Voyager [4]-inspired skill library provides reusable building blocks. The LLM focuses on *when* and *where* to apply skills, not low-level tile placement.

5. **Non-blocking execution** — LLM calls are async. The colony never stalls waiting for AI. Algorithmic fallback fills gaps.

6. **Observable and debuggable** — All plans, evaluations, and reflections are stored in `state.ai.agentDirector` for UI display and post-hoc analysis.

7. **Token-efficient** — Structured observation (~600 tokens) replaces verbose natural language. Plan output is JSON, not prose. Total budget: ~3K tokens/call.

---

## References

[1] Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2023). ReAct: Synergizing Reasoning and Acting in Language Models. *ICLR 2023*. arXiv:2210.03629

[2] Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S. (2023). Reflexion: Language Agents with Verbal Reinforcement Learning. *NeurIPS 2023*. arXiv:2303.11366

[3] Huang, W., Xia, F., Xiao, T., et al. (2023). Inner Monologue: Embodied Reasoning through Planning with Language Models. *CoRL 2022*. arXiv:2207.05608

[4] Wang, G., Xie, Y., Jiang, Y., et al. (2023). Voyager: An Open-Ended Embodied Agent with Large Language Models. arXiv:2305.16291

[5] Wang, L., Xu, W., Lan, Y., et al. (2023). Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models. *ACL 2023*. arXiv:2305.04091

[6] Zhu, X., Chen, Y., Tian, H., et al. (2023). Ghost in the Minecraft: Generally Capable Agents for Open-World Environments via Large Language Models with Text-based Knowledge and Memory. arXiv:2305.17144

[7] Ahn, M., Brohan, A., Brown, N., et al. (2022). Do As I Can, Not As I Say: Grounding Language in Robotic Affordances. arXiv:2204.01691

[8] Qin, Y., Liang, S., Ye, Y., et al. (2024). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-World APIs. *ICLR 2024*. arXiv:2307.16789

[9] Park, J.S., O'Brien, J.C., Cai, C.J., et al. (2023). Generative Agents: Interactive Simulacra of Human Behavior. *UIST 2023*. arXiv:2304.03442

[10] Zhao, H., et al. (2024). Large Language Models as Commonsense Knowledge for Large-Scale Task Planning. *NeurIPS 2023*. arXiv:2305.14078
