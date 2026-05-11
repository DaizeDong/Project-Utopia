# Project-Utopia as a Benchmark for LLM Long-Term Planning and Resource Allocation

**Subject repository:** `https://github.com/DaizeDong/Project-Utopia` (commit on `main`, fetched 2026-05-05)
**Author of this evaluation:** Computer-science research evaluation prepared for an academic benchmark proposal
**Scope:** Architectural profile, comparative landscape, and a concrete integration plan that would convert the simulation into a rigorous, reproducible evaluation harness.

---

## Executive summary

Project-Utopia is a Three.js crowd simulation in which an LLM is consulted at three distinct cadences to shape (a) the *environment* (weather, events, faction tension), (b) *group policies* (intent-weight distributions and risk tolerances over five role classes), and (c) a *strategic plan* (colony-level long-horizon directives). The LLM never controls individual entities; it produces low-rank, schema-validated, clamped directives that flow through a deterministic stack (decision scheduler → policy applier → group → NPC FSM → A\* over a versioned grid → Boids steering → Verlet-style integration). This **hybrid hierarchical** structure is precisely what is missing from most current LLM-agent benchmarks, which either evaluate single agents in episodic web/coding tasks or evaluate dense MARL policies without natural-language reasoning. The repository's existing telemetry, schema validators, and proxy abstraction give it 60–70% of what an academic benchmark needs; the remaining work is mainly *measurement infrastructure*, *framework-neutral endpoints*, and *hardware/cost telemetry*. None of these require restructuring the simulation core.

We recommend four concrete additions (§3): a metrics module wrapping the existing analytics surface, a versioned `/api/agent/*` endpoint contract that any external framework can target without forking the simulation, a token/latency/VRAM telemetry sidecar, and a long-horizon memory-stress harness that exercises context degradation under fixed seeds.

---

## Task 1 — Codebase profile

### 1.1 Simulation skeleton

```
src/app/
  GameLoop.js              fixed-step driver
  SimulationClock.js       sim-time accumulator (decoupled from render)
  simStepper.js            single-tick orchestration
  longRunTelemetry.js      buildLongRunTelemetry(state) → JSON snapshot
  performanceTelemetry.js  FPS / frame-time / memory / per-system peaks
  aiRuntimeStats.js        request/response/timeout/fallback counters

src/simulation/
  ai/
    llm/   PromptBuilder.js, PromptPayload.js, ResponseSchema.js,
           Guardrails.js, LLMClient.js
    director/   EnvironmentDirectorSystem.js + EnvironmentDirectiveApplier.js
                + EnvironmentAnalytics.js
    brains/     NPCBrainSystem.js, NPCBrainAnalytics.js
    strategic/  StrategicDirector.js, DecisionScheduler.js, StrategicAnalytics.js
    colony/     (long-horizon plan store)
    memory/     (rolling memoryStore.formatForPrompt)
  navigation/   AStar.js, Navigation.js, PathCache.js,
                PathWorkerPool.js, pathWorker.js, RoadNetwork.js, Faction.js
  movement/     BoidsSystem.js, SpatialHash.js
  ecology/  economy/  construction/  lifecycle/  population/
  services/  telemetry/  npc/  world/

server/ai-proxy.js          /api/ai/environment, /api/ai/policy,
                            /api/ai/plan, /health  (Express)
```

### 1.2 Tick loop and where the LLM enters

The `GameLoop` advances `simStepper` at a fixed `dt`. Each tick it runs (in order): perception aggregation → strategic / environment / NPC-brain LLM gates → policy applier → group-state distribution → per-entity FSM step → `Navigation.setTargetAndPath` → `BoidsSystem.boidsSteer` → integration → telemetry write-back.

Three LLM channels are gated by cadence and triggers:

| Channel | Cadence | Triggers (in addition to cadence) | Endpoint |
|---|---|---|---|
| **Environment director** | `tuning.environmentDecisionIntervalSec` | none — pure throttle | `POST /api/ai/environment` |
| **NPC group policy** | `policyDecisionIntervalSec` | gated *only* when threat ≤14 tiles, guard deficit, or workers actively hit (rule-based otherwise) | `POST /api/ai/policy` |
| **Strategic plan** | `heartbeatSec=90s` | crises (workers→0; food/wood ≤5; threat ≥85); changes (death delta, objective advance, prosperity Δ>15); 15 s cooldown | `POST /api/ai/plan` |

All three calls are *non-blocking*: `state.ai.last…DecisionSec` records the request time, the deterministic fallback path runs immediately, and the eventual LLM response replaces the directive in-place when validation succeeds.

### 1.3 Observation space

Both `environment` and `policy` payloads share the same envelope produced by `PromptPayload.js`:

```js
{
  channel: "environment-director" | "npc-policy",
  summary:               buildWorldSummary(state),     // raw world snapshot
  operationalHighlights: pickHighlights(summary, 8),    // top-8 ranked alerts
  explanationFields:     ["summary", "focus", "steeringNotes"],
  hardRules:             [...],                          // 3–4 invariants
  strategyContext?:      summary.strategy,               // optional
  recentMemory?:         memoryStore.formatForPrompt()  // optional rolling log
}
```

`buildWorldSummary(state)` returns:

* **Resources**: food, wood, water; warehouse loads; depot reachability flags.
* **Buildings**: counts by type, broken-route set, unready depots.
* **Population**: per-role counts (workers, traders, saboteurs, herbivores, predators); per-zone wildlife stats with breeding/recovery cooldowns; food-runway estimate.
* **Events**: active events with intensity / pressure; recent severity history.
* **Ecology**: farm-pressure metrics, soil/node/water crises with coordinate hints.
* **Threat**: prosperity, threat score, recovery charges, collapse risk.
* **Spatial pressure**: stranded-worker count, overloaded-warehouse count, isolated-worksite count, threat-sector map.

`pickHighlights` ranks ≤8 alerts across {scenario progress, frontier disruption, logistics strain, ecology pressure, active events, recovery collapse, soil/water crises, population bottlenecks}. The environment channel additionally injects `EnvironmentPerception.fragilityLevel ∈ {critical, fragile, watchful, stable, thriving}` and a pre-rated *menu* of weather/event candidates with posture classifications. The policy channel additionally injects `groupContracts` — the per-group allowlists of legal intents and target keys.

The strategic `/plan` route accepts arbitrary `{systemPrompt, userPrompt}` strings; the schema lives entirely in the calling system prompt.

**Key observation: the model never sees the raw grid or per-entity state.** It sees an *aggregated, role-keyed, ranked* digest. This matters for benchmark design — agent skill is decoupled from token-budget pressure caused by entity count.

### 1.4 Action space and the deterministic boundary

#### Environment directive (`ResponseSchema.js`)

```ts
EnvironmentDirective = {
  weather: enum WEATHER,                     // string allowlist
  durationSec: finite number,
  factionTension: finite number,             // clamped 0..1
  eventSpawns: Array<{                       // max 3 retained
    type: enum EVENT_TYPE,
    intensity: finite,                       // clamped ≥ 0.4
    durationSec: finite
  }>,
  summary?: string, focus?: string, steeringNotes?: string[]
}
```

#### Group policy directive

```ts
GroupPolicy = {
  policies: Array<{
    groupId: canonicalizeAiGroupId(string),  // WORKERS|TRADERS|SABOTEURS|HERBIVORES|PREDATORS
    intentWeights:    {[intentName]: number},  // each clamped 0..3
    riskTolerance:    number,                  // clamped 0..1
    targetPriorities: {[targetKey]: number},   // clamped 0..3
    ttlSec:           number,                  // clamped to 8–24 h band
    summary?, focus?, steeringNotes?
  }>,
  stateTargets?: Array<{groupId, targetState, priority, ttlSec, reason?}>
}
```

All numeric fields pass through `Number.isFinite` then `clamp(…)`. Unknown intent names, unknown target keys, unknown group IDs, and out-of-enum weather/event types are dropped. When the validator rejects, `Guardrails.js` substitutes `DEFAULT_GROUP_POLICIES` so the simulation never stalls.

#### The handoff

There are **two distinct handoff boundaries**:

**Group → entity (logical):** `GroupPolicy.intentWeights` are scored against the per-group `groupContracts`. The highest-weighted feasible intent maps through `POLICY_INTENT_TO_STATE` to an FSM state stored on each NPC's blackboard at `entity.blackboard.aiTargetState`. Example mapping (from `NPCBrainSystem.js`):

```
WORKERS:    eat→seek_food | deliver→deliver | farm→seek_task | …
TRADERS:    trade→seek_trade | eat→seek_food | wander→wander
SABOTEURS:  sabotage→sabotage | scout→scout | evade→evade | …
HERBIVORES: flee→flee | graze→graze | migrate→regroup | …
PREDATORS:  hunt→hunt | stalk→stalk | feed→feed | rest→rest | …
```

**FSM → physics (numeric):** the FSM picks a tile target → `Navigation.setTargetAndPath(entity, targetTile, state, services)` → `aStar(grid, start, target, weatherMultiplier, dynamicCosts, {faction})` (cached by `(faction, gridVersion, costVersion)`, optionally dispatched on `PathWorkerPool`) → `entity.path` populated → `followPath` writes `entity.desiredVel = {x, z}` → `BoidsSystem.boidsSteer` applies four forces (separation, alignment, cohesion, seek), with separation damped to 0.35× when `entity.path` exists so pathfinding dominates → integration updates `entity.x, entity.z, entity.vx, entity.vz`.

> **The single field that crosses the boundary at the per-entity level is `entity.desiredVel`.** Above it, everything is symbolic and LLM-influenceable; below it, everything is deterministic vector math. At the group level, the boundary is `groupPolicy.intentWeights` post-Guardrails.

#### Hard caps the LLM cannot violate

`Guardrails.js` enforces:
* `weights ∈ [0, 3]`, `riskTolerance ∈ [0, 1]`, `factionTension ∈ [0, 1]`
* `ttlSec ∈ [8 h, 24 h]`
* `eventSpawns` truncated to 3, each `intensity ≥ 0.4`
* unknown enum values for weather/event/intent/target/group → dropped or substituted
* a *raid-posture clamp* hard-caps weights when threat is imminent regardless of LLM output.

These bounds collectively define the **effective action space dimension**: 5 groups × ({≈10 intent slots clamped to 4-bit-equivalent} ∪ {target slots} ∪ {risk, TTL}) ≈ on the order of 10²–10³ continuous axes per policy directive, plus a categorical 1 weather × ≤3 events × continuous intensity for the environment directive.

---

## Task 2 — Benchmark landscape

### 2.1 Adjacent benchmarks and their fit

| Benchmark | Domain | LLM role | Resource allocation? | Long horizon? | Hybrid w/ deterministic stack? |
|---|---|---|---|---|---|
| **MeltingPot 2** (DeepMind) | grid MARL | none (pure RL) | yes | medium (≤1 k steps) | n/a |
| **SMAC / SMACv2** | StarCraft micro | none | partial (unit comp.) | low | n/a |
| **Google Research Football** | continuous 2-D | none | weak | low | n/a |
| **Diplomacy / Cicero** | turn-based negotiation | central | yes (alliances) | high (game-length) | partial |
| **Generative Agents** (Park 2023) | sandbox town | per-agent dialog | implicit | medium | weak (no formal env API) |
| **Voyager / MineDojo / Crafter** | Minecraft | per-agent skill code | partial (crafting) | high | partial (Mineflayer) |
| **AgentBench / MLAgentBench / GAIA** | tool-use, web, ML | central | n/a | episodic | n/a |
| **WebArena / VisualWebArena** | web | central | n/a | episodic | n/a |
| **CityFlow / SUMO-RL** | traffic | optional | yes (signal control) | medium | yes |
| **AgentSociety / Concordia** | social sim | central | partial | high | weak |
| **SmartPlay / GAMA-LLM** | video-game suite | central | partial | low–medium | mixed |
| **LongMemEval / HELM-Agent** | memory probes | central | n/a | high (token-bound) | n/a |

### 2.2 Limitations Project-Utopia would address

1. **Hierarchical decomposition is rare.** Most LLM-agent benchmarks (AgentBench, GAIA, WebArena) test a *single* agent against tool APIs in episodic tasks; most MARL benchmarks test *flat* dense policies. Project-Utopia is one of very few systems where the LLM operates strictly above a deterministic substrate at *three* hierarchically nested cadences (90 s strategic, ~10–30 s environmental, ~5–15 s policy with event triggers). This is the canonical pattern in real autonomous-systems research (Robotics: BT/HFSM; OR: hierarchical MPC) but is under-evaluated in the LLM literature.

2. **Action-space at the right altitude.** MeltingPot, SMAC, and Crafter expose primitive movement actions to the agent. AgentBench and WebArena expose tool calls. Project-Utopia exposes *low-rank policy directives* — the same shape as a real production agent system (Cicero's strategic-belief vector, AlphaStar's high-level intents). Token cost and decision frequency decouple from world size, which is the principal reason most LLM-MARL hybrids do not scale.

3. **Continuous environmental adaptation.** SMAC and Football have static rules. Voyager and MineDojo lack systemic shocks. Project-Utopia's environment director can *itself* be the LLM under test, producing weather/events/factional pressure that a separate policy LLM must adapt to. This adversarial decomposition (director-vs-policy) is closer to reality than any current benchmark and is a natural ablation axis.

4. **Resource distribution at multiple scales.** Existing resource benchmarks are either single-resource (CityFlow signal time) or settler-style with discrete steps (Crafter, Settlers-of-Catan-LLM). Project-Utopia models food, wood, depot connectivity, soil/water/node crises, farm pressure, and per-zone wildlife jointly; the policy directive sets `targetPriorities` over heterogeneous resource keys. This is the first widely-available simulator we are aware of that exposes a *vector-valued resource allocation* problem to an LLM at multiple cadences.

5. **Memory stress without synthetic distractors.** LongMemEval and similar tests inject artificial filler. Project-Utopia provides *naturally arising* long-horizon context: `memoryStore.formatForPrompt()` exposes a rolling event log over a multi-hour run. Memory degradation can be observed against a *task* (resource sufficiency, population stability), not against retrieval accuracy alone.

6. **Reproducibility and counterfactuals at low cost.** Existing LLM benchmarks are expensive (WebArena needs a live web stack; MineDojo needs Minecraft). Project-Utopia is browser/Node, deterministic given the seeded RNG (`src/app/rng.js`), and the AI proxy already has a deterministic fallback path that can stand in as a no-LLM baseline.

### 2.3 Blind spots that *remain* even with Project-Utopia

To be honest about scope: the simulator does not currently exercise (a) multi-LLM negotiation between agents (no inter-LLM channel), (b) partially observable settings — every channel sees the global summary, (c) adversarial environments where the director and policy are different model families, or (d) sample-efficient learning. Items (a), (c), and (d) are addressed in §3; (b) requires a partial-observation flag that is deferred to future work.

---

## Task 3 — Novel contribution and integration design

The proposals below are scoped to leave the simulation core untouched and to add only thin, testable surfaces. Each lists the files to create or extend and an acceptance check.

### 3.1 Quantitative metrics module

**Goal.** A single `src/simulation/benchmark/Metrics.js` module exporting versioned metrics drawn from the existing analytics outputs (`EnvironmentAnalytics`, `NPCBrainAnalytics`, `StrategicAnalytics`, `EconomyTelemetry`, `longRunTelemetry`) plus three new families.

**Files to add.**

```
src/simulation/benchmark/
  Metrics.js                  # tick-level evaluator, pure
  RAEScorer.js                # Resource-Allocation Efficiency family
  GroupDynamicsScorer.js      # emergent group dynamics family
  MemoryDegradationProbe.js   # long-horizon context decay family
  schemas/MetricsRecord.ts    # versioned, JSON-serializable
test/benchmark/*.test.js
```

**Resource-allocation efficiency (RAE).** Borrow from operations research:

* **Sufficiency score** *S(t)* = clamp(food / food_demand, 0, 1) × clamp(wood / wood_demand, 0, 1).
* **Distribution Gini** over per-zone availability — high Gini ⇒ uneven allocation.
* **Idle-capacity ratio** = (workers in `idle`/`wander` + unused depot slots) / total slots.
* **Allocation-vs-demand correlation** using `targetPriorities` issued by the LLM and the realized end-of-window throughput per resource. A low correlation indicates the LLM is allocating to the wrong resources.
* **Path-cost overhead** — average A\* path length / Manhattan-optimal length, captured from `PathCache` keys; tells you whether the LLM's policy is creating routing pressure.

**Emergent group dynamics.**

* **Intent entropy** *H(W_g)* per group from `intentWeights` — mean and variance over the run.
* **Coalition coupling**: cross-group correlation of `targetPriorities` over time — proxy for emergent alliances or stratification.
* **State-target obedience**: fraction of NPCs in the group whose realized FSM state matches the LLM's `stateTargets[i].targetState` within `ttlSec`. Already most of the data is in `NPCBrainAnalytics.feasibilityViolations`.
* **Faction-tension responsiveness**: cross-correlation between `EnvironmentDirective.factionTension` and the next-window predator/saboteur incident rate.

**Long-term memory degradation.** Two complementary probes:

* **Anchored-fact recall**: insert N seeded "anchor" events into `memoryStore` at known times (e.g., a unique scenario identifier and a unique resource milestone). At intervals, ask the strategic LLM to summarize the run; score whether the anchors persist in the returned `summary` field. Score curve as a function of run-time and prompt-token length.
* **Behavioral drift**: hash the policy directive and compare against an early-run baseline directive *under matched world summaries* (resampled from a tagged checkpoint). Measure cosine and KL drift. This directly captures whether the LLM is "forgetting its strategy" as context grows.

**Implementation sketch.**

```js
// src/simulation/benchmark/Metrics.js
export function createMetrics({intervalSec = 5} = {}) {
  const records = []; let nextEval = 0;
  return {
    onTick(state) {
      if (state.metrics.timeSec < nextEval) return;
      nextEval = state.metrics.timeSec + intervalSec;
      records.push({
        t: state.metrics.timeSec,
        rae:    scoreRAE(state),
        groups: scoreGroupDynamics(state),
        memory: scoreMemoryProbes(state),
        ai:     state.ai,                       // already populated
        perf:   state.perf,
      });
    },
    flush()       { return records.splice(0); },
    asNDJSON()    { return records.map(JSON.stringify).join('\n'); },
  };
}
```

**Hook points.** `simStepper.js` already calls `aiRuntimeStats` after each LLM-bearing step; insert `metrics.onTick(state)` immediately after, and dump `metrics.flush()` from `longRunTelemetry.js` so existing capture continues to work unchanged.

**Acceptance.** Replay the same seed twice with the same model and verify metric records are byte-identical when the LLM is in fallback mode (deterministic). Verify metric variance is bounded across 5 seeds when LLM is on.

### 3.2 Standardized agent-framework integration endpoints

**Goal.** Allow any locally hosted agent framework — Hermes, OpenClaw, raw vLLM, llama.cpp, or a research SDK — to be evaluated as the decision-maker without forking the simulation. The current `server/ai-proxy.js` couples the OpenAI client to the directive logic; we factor that out behind an HTTP-only contract.

**Design.** Add a sibling endpoint group `/api/agent/*` whose semantics are framework-neutral. The simulator becomes a *server of decision requests*, and the framework under test pulls work; alternatively, the framework registers a webhook URL and the simulator pushes. Both modes are supported:

```
POST /api/agent/register            { agentId, mode: "pull"|"push", channels[], pushUrl? }
GET  /api/agent/:agentId/poll        → next pending DecisionRequest or 204
POST /api/agent/:agentId/decision    DecisionResponse  (resolves a pending request)
GET  /api/agent/:agentId/health      → liveness + last-seen
GET  /api/benchmark/run/:runId       → final MetricsRecord[] + manifest
POST /api/benchmark/run               { seed, scenario, durationSec, agent: {...},
                                        budget: {...} }
                                       → runId
```

`DecisionRequest` carries the *exact* observation the LLM would have seen via the existing `PromptPayload` envelope — this is the contract surface that decouples the framework from the model. `DecisionResponse` carries either an `EnvironmentDirective` or a `GroupPolicy` validated against the existing `ResponseSchema.js`. The current `LLMClient.js` becomes one concrete adapter; a `HTTPAgentClient` that talks to `/api/agent/*` is a sibling. The decision-scheduler logic, fallback path, and Guardrails are unchanged.

**Files to add or extend.**

```
server/
  agent-bridge.js            # new: /api/agent/* and /api/benchmark/*
  ai-proxy.js                # extend: factor LLM client behind AgentAdapter
src/simulation/ai/llm/
  AgentAdapter.js            # new interface: { request(channel, payload) }
  LLMClient.js               # implements AgentAdapter (existing path)
  HTTPAgentClient.js         # new: implements AgentAdapter via /api/agent
config/
  benchmark-runs/*.yaml      # scenario + agent + budget manifests
```

**Reference adapter contract** (TypeScript-style for clarity):

```ts
interface AgentAdapter {
  request(
    channel: "environment-director" | "npc-policy" | "strategic-plan",
    payload: PromptPayload,
    options: { timeoutMs: number; signal: AbortSignal }
  ): Promise<DirectiveResponse>;
}
```

**Why this is the right altitude.** The schemas already exist (`ResponseSchema.js`); the validators already exist (`Guardrails.js`); the fallback path already exists. The new surface is the smallest possible delta that opens the simulator to arbitrary frameworks while preserving safety. Frameworks under evaluation never touch the simulation state — they only observe `PromptPayload` and emit a directive.

**Reproducibility manifest.** Each benchmark run writes:

```json
{
  "runId": "...", "seed": 0xC0FFEE, "scenarioId": "frontier-3",
  "durationSec": 14400, "agent": {"id":"hermes-7b","mode":"push"},
  "budget": {"maxTokens": 2000000, "maxRequests": 5000, "wallclockSec": 4500},
  "simulator": {"sha": "<git-sha>", "tuning": {}},
  "results": "metrics.ndjson"
}
```

**Acceptance.** A reference Python client in `tools/agent-clients/python/` consumes `/api/agent/*` and replays a fixed seed twice; the metrics module reports identical resource trajectories under fallback and statistically stationary trajectories under a fixed-temperature LLM.

### 3.3 Hardware and inference telemetry sidecar

**Goal.** Capture inference latency, throughput, token counts, and GPU-side utilization for *locally hosted* models — vLLM, llama.cpp, Ollama, TGI — during continuous simulation. The current `aiRuntimeStats.js` records request-side latency only and explicitly does not count tokens.

**Design.** A two-channel telemetry pipeline:

* **In-process (request side).** Extend `aiRuntimeStats.js` with `promptTokens`, `completionTokens`, `cachedTokens` fields populated from the response (most local servers expose `usage` in the OpenAI-compatible payload; for llama.cpp use the `n_prompt_tokens`/`n_predict` fields). Track `tokensPerSecond = completionTokens / latencySec`, `firstTokenLatencyMs` if streaming is enabled, and a per-channel `tokenBudgetUsage`.

* **Out-of-process (host side).** A new `tools/hwtelemetry/` sidecar polls the GPU at 1 Hz and writes NDJSON keyed by wallclock. Implementation choice depends on the host:

  ```
  tools/hwtelemetry/
    nvml-poller.py     # NVIDIA: pynvml — utilization, memory, temp, power, SM occupancy
    rocm-poller.py     # AMD:    rocm-smi
    apple-poller.swift # Apple:  ioreg + powermetrics for ANE/GPU power
    sidecar.js         # node coordinator; advertises /api/hw/stream (SSE)
  ```

  The simulator subscribes to `/api/hw/stream` and joins samples to `aiRuntimeStats` by timestamp; the metrics module emits a `perf.hw` record per interval.

**Specific signals worth capturing.**

| Signal | Source | Why it matters |
|---|---|---|
| `firstTokenLatencyMs` | streaming response | dominant cost for short directives |
| `tokensPerSecond` | usage / latency | throughput at this prompt length |
| `kvCacheHits` / `prefixHits` | server (vLLM, SGLang) | measures whether the rolling memory benefits from prefix caching |
| `gpuUtilizationPct` | NVML / rocm-smi | reveals whether the simulator's bursty cadence under-uses the GPU |
| `gpuMemoryUsedMB` | NVML | KV-cache pressure correlates with context length growth |
| `powerDrawW` | NVML / IPMI | useful for energy-per-decision comparisons |
| `cpuTimePerStepMs` | existing `performanceTelemetry` | bound on simulation tick rate independent of GPU |
| `requestQueueDepth` | local server | indicates contention between channels |

**Token-efficiency metric.** We define **Decision Token Efficiency (DTE)**:
*DTE = Δ(taskScore) / completionTokens*, where `taskScore` is a weighted sum of `RAE.sufficiency`, `groupDynamics.stateTargetObedience`, and the negative of `populationCollapseEvents`. DTE makes it possible to compare a 7-B locally-hosted model issuing many short directives against a 70-B model issuing fewer rich directives, on a single axis.

**Acceptance.** Run a 30-minute scenario against a local vLLM with one fixed seed; produce a single `metrics.ndjson` whose records contain joined `ai`, `perf`, and `perf.hw` blocks with monotonically increasing timestamps and ≤100 ms join error.

### 3.4 Long-horizon memory and context-degradation harness

**Goal.** Make Project-Utopia the first benchmark to measure naturalistic context degradation against a *task signal* rather than a synthetic recall probe.

**Design.** A `MemoryStressHarness` that drives runs of 30 min, 2 h, 8 h, and 24 h sim-time, captures `memoryStore` length and tokenized prompt size at every strategic call, and pairs each call with the anchored-fact and behavioral-drift probes from §3.1. The harness reports three curves:

1. **Recall(t)** — fraction of seeded anchor facts present in the strategic summary.
2. **Drift(t)** — KL divergence from the early-run policy under matched world summaries.
3. **Performance(t)** — RAE sufficiency over time.

A model that maintains high Recall and low Drift but low Performance is *coherent but ineffective*; a model that loses Recall but maintains Performance is *adapting via current observations only*. These curves cannot be produced by current LLM-memory benchmarks because they lack a downstream task.

**Files.**

```
src/simulation/benchmark/MemoryStressHarness.js
config/scenarios/long-horizon/{30m,2h,8h,24h}.yaml
tools/analysis/memory-curves.py
```

**Acceptance.** Reproduce a published memory-degradation finding (e.g., the "lost-in-the-middle" effect) by varying `memoryStore` injection position; the harness should detect a measurable Recall drop without manual labeling.

---

## Combined deliverables and rollout

| Phase | Deliverables | Risk | Time estimate |
|---|---|---|---|
| **P1 — Metrics module** (§3.1) | `Metrics.js`, RAE/group/memory scorers, NDJSON output wired into `longRunTelemetry` | low: read-only over existing analytics | 1–2 weeks |
| **P2 — Agent bridge** (§3.2) | `/api/agent/*`, `/api/benchmark/*`, `AgentAdapter` interface, reference Python client | medium: requires factoring `LLMClient` | 2–3 weeks |
| **P3 — Hardware sidecar** (§3.3) | `tools/hwtelemetry/`, token usage in `aiRuntimeStats`, joined records | low–medium: NVML/rocm/Apple variations | 1–2 weeks |
| **P4 — Memory harness** (§3.4) | `MemoryStressHarness`, scenario configs, analysis scripts | medium: needs careful seeding to keep runs reproducible | 2 weeks |

**No changes** are required to `BoidsSystem.js`, `AStar.js`, `Navigation.js`, the FSM mappings in `NPCBrainSystem.js`, or `Guardrails.js`. The deterministic substrate is preserved as the *fixed environment* against which agent frameworks are evaluated.

---

## Why this benchmark is publishable

A benchmark contribution needs three properties: (i) a *gap* in the literature, (ii) *measurable* tasks, (iii) *reproducible* infrastructure. Project-Utopia, after the four additions above, satisfies each:

* **Gap.** No existing benchmark evaluates LLM-driven hierarchical planning over a continuous, multi-resource simulation with deterministic substrate, at three nested cadences, with framework-neutral plug-in.
* **Measurable.** The metrics families in §3.1 (RAE, group dynamics, memory, DTE) are pure functions of state and directives, computable per-tick, comparable across models.
* **Reproducible.** Seeded RNG, deterministic fallback, manifest-keyed runs, container-friendly Node/Express stack, and a hardware sidecar that captures the local-GPU dimension that cloud-only benchmarks omit.

The remaining open research questions — partial observability, multi-LLM negotiation, sample-efficient policy learning under directive constraints — are *future work* the benchmark would *enable*, not blockers to its release.

---

## Appendix A — Concrete file/line references for implementers

| Concern | File |
|---|---|
| Tick orchestration | `src/app/simStepper.js`, `src/app/GameLoop.js` |
| Decision cadence | `src/simulation/ai/strategic/DecisionScheduler.js` |
| Observation builder | `src/simulation/ai/llm/PromptPayload.js`, `PromptBuilder.js` |
| Action schema | `src/simulation/ai/llm/ResponseSchema.js` |
| Guardrails | `src/simulation/ai/llm/Guardrails.js` |
| Environment channel | `src/simulation/ai/director/EnvironmentDirectorSystem.js` + `EnvironmentDirectiveApplier.js` |
| Policy channel | `src/simulation/ai/brains/NPCBrainSystem.js` |
| Strategic channel | `src/simulation/ai/strategic/StrategicDirector.js` |
| LLM transport | `server/ai-proxy.js`, `src/simulation/ai/llm/LLMClient.js` |
| A\* invocation | `src/simulation/navigation/Navigation.js` (`setTargetAndPath`), `AStar.js` |
| Steering | `src/simulation/movement/BoidsSystem.js` (`boidsSteer`) |
| AI runtime metrics | `src/app/aiRuntimeStats.js` |
| Long-run telemetry | `src/app/longRunTelemetry.js` |
| Performance | `src/app/performanceTelemetry.js` |

## Appendix B — Open questions for the project owner

1. Is the random seed exposed in `src/app/rng.js` honored by *every* stochastic subsystem (event spawn, ecology, NPC action ties)? Determinism under fallback is a benchmark prerequisite.
2. Does `PathWorkerPool` produce identical paths to inline A\* under the same `(faction, gridVersion, costVersion)`? If not, deterministic mode should disable the pool.
3. Is `memoryStore.formatForPrompt()` token-bounded or unbounded? If unbounded, the memory-stress harness will need to assert a known truncation policy.
4. Are `groupContracts` versioned? Schema-version pinning would let the benchmark publish a frozen contract while the game project continues to evolve.
