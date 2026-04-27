/**
 * Perceiver Benchmark — evaluates ColonyPerceiver observation quality.
 *
 * Runs headless simulation, samples observations at regular intervals,
 * then uses an LLM judge to score them on multiple dimensions.
 *
 * Usage:
 *   node scripts/perceiver-benchmark.mjs [--duration=300] [--template=temperate_plains]
 *
 * Environment:
 *   OPENAI_API_KEY — required for LLM judge
 *   OPENAI_BASE_URL — optional, defaults to https://api.openai.com/v1
 */
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { StrategicDirector } from "../src/simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../src/world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { ColonyPerceiver, formatObservationForLLM } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { TILE } from "../src/config/constants.js";

const DT_SEC = 1 / 30;

function parseArgs() {
  const args = {};
  for (const token of process.argv.slice(2)) {
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq < 0) { args[token.slice(2)] = true; continue; }
    args[token.slice(2, eq)] = token.slice(eq + 1);
  }
  return args;
}

function buildSystems(memoryStore) {
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
    new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new TileStateSystem(),
    new NPCBrainSystem(),
    new WorkerAISystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new WildlifePopulationSystem(),
    new BoidsSystem(),
    new ResourceSystem(),
    new ProcessingSystem(),
    new ColonyDirectorSystem(),
  ];
}

// ── LLM Judge ────────────────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `You are an expert game AI evaluator. You will receive structured observation snapshots from a colony simulation game's "ColonyPerceiver" system. Your task is to evaluate the quality of these observations across multiple dimensions.

The ColonyPerceiver is a component of an agent-based colony planning system. It observes game state and produces structured data that will be consumed by a downstream LLM planner. Good observations should:
1. Accurately capture the colony's current state
2. Provide actionable information for planning decisions
3. Detect important patterns (clusters, bottlenecks, opportunities)
4. Track temporal trends (resource rates, growth)
5. Be compact yet information-dense

Score each dimension from 1-10 and provide brief justification.`;

function buildJudgePrompt(observations, groundTruth) {
  return `## Perceiver Observation Evaluation

You are given ${observations.length} observation snapshots from a colony simulation run on the "${groundTruth.templateId}" map template, sampled every ${groundTruth.sampleInterval}s over ${groundTruth.duration}s total.

### Ground Truth (from simulation)
- Final workers: ${groundTruth.finalWorkers}
- Final buildings: ${groundTruth.finalBuildings}
- Building growth: ${groundTruth.buildingGrowth}
- Pop growth: ${groundTruth.popGrowth}
- Final prosperity: ${groundTruth.finalProsperity}
- Game outcome: ${groundTruth.outcome ?? "still running"}
- Stagnation periods: ${groundTruth.stagnationCount}

### Observation Snapshots

${observations.map((obs, i) => `#### Snapshot ${i + 1} (t=${obs.timeSec}s)
${formatObservationForLLM(obs)}
`).join("\n---\n\n")}

### Evaluation Dimensions

Score each dimension 1-10 with brief justification:

1. **Completeness** (1-10): Does the observation capture all critical colony state? Resources, buildings, workers, threats, weather, objectives?

2. **Spatial Awareness** (1-10): Does cluster detection accurately group infrastructure? Are disconnected worksites identified? Are expansion frontiers useful?

3. **Temporal Awareness** (1-10): Do resource rates accurately reflect trends? Are declining/rising resources correctly identified? Are projected-zero times reasonable?

4. **Actionability** (1-10): Could a downstream planner make good decisions from these observations alone? Are bottlenecks/opportunities surfaced? Is affordability information helpful?

5. **Information Density** (1-10): Is the observation compact yet information-rich? No unnecessary verbosity? Key metrics prominently surfaced?

6. **Consistency** (1-10): Are observations consistent across time? Do building counts match between snapshots? Do trends align with stock changes?

7. **Crisis Detection** (1-10): Does the system detect food shortages, population stagnation, resource depletion, logistics bottlenecks? Are growth blockers identified?

8. **Strategic Value** (1-10): Does the observation enable long-term strategic planning? Phase progression visibility? Expansion frontier quality? Defense posture?

Respond in JSON format:
\`\`\`json
{
  "scores": {
    "completeness": { "score": <1-10>, "justification": "<brief>" },
    "spatial_awareness": { "score": <1-10>, "justification": "<brief>" },
    "temporal_awareness": { "score": <1-10>, "justification": "<brief>" },
    "actionability": { "score": <1-10>, "justification": "<brief>" },
    "information_density": { "score": <1-10>, "justification": "<brief>" },
    "consistency": { "score": <1-10>, "justification": "<brief>" },
    "crisis_detection": { "score": <1-10>, "justification": "<brief>" },
    "strategic_value": { "score": <1-10>, "justification": "<brief>" }
  },
  "overall_score": <1-10>,
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "improvement_suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"]
}
\`\`\``;
}

async function callLLMJudge(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: OPENAI_API_KEY not set. LLM judge unavailable.");
    return null;
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.JUDGE_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`LLM judge HTTP ${resp.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Parse JSON from response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    console.error("Could not parse LLM judge response as JSON");
    console.error(content.slice(0, 500));
    return null;
  } catch (err) {
    console.error(`LLM judge error: ${err.message}`);
    return null;
  }
}

// ── Self-Assessment (no LLM required) ─────────────────────────────────

function selfAssess(observations, groundTruth) {
  const scores = {};
  const first = observations[0];
  const last = observations[observations.length - 1];

  // Completeness: check all key fields present
  let completeness = 0;
  const requiredFields = ["economy", "topology", "workforce", "defense", "environment", "affordable", "buildings"];
  for (const f of requiredFields) {
    if (last[f] != null) completeness++;
  }
  // Check economy subfields
  for (const k of ["food", "wood", "stone", "herbs"]) {
    if (last.economy?.[k]?.stock != null) completeness += 0.3;
  }
  scores.completeness = Math.min(10, Math.round(completeness / requiredFields.length * 8 + 2));

  // Spatial Awareness: clusters detected, disconnected worksites tracked, coverage percentage
  let spatial = 5;
  if (last.topology?.clusters?.length > 0) spatial += 2;
  if (last.topology?.coveragePercent != null) spatial += 1;
  if (last.topology?.expansionFrontiers?.length > 0) spatial += 1;
  if (last.topology?.clusters?.some(c => c.coverageRatio < 1)) spatial += 1;
  scores.spatial_awareness = Math.min(10, spatial);

  // Temporal Awareness: rate tracking quality
  let temporal = 3;
  if (observations.length >= 3) {
    const midObs = observations[Math.floor(observations.length / 2)];
    if (midObs.economy?.food?.rate !== 0 || midObs.economy?.wood?.rate !== 0) temporal += 2;
    if (midObs.economy?.food?.trend !== "unknown") temporal += 1;
    if (last.economy?.food?.trend !== "unknown") temporal += 1;
    // Check if rates changed between observations
    if (first.economy?.food?.rate !== last.economy?.food?.rate) temporal += 1;
    // Check projected zero
    if (observations.some(o => o.economy?.food?.projectedZeroSec != null)) temporal += 1;
  }
  scores.temporal_awareness = Math.min(10, temporal);

  // Actionability: affordability, blockers, bottleneck detection
  let action = 4;
  if (last.affordable) action += 1;
  if (last.workforce?.growthBlockers?.length > 0 || last.workforce?.total >= last.workforce?.popCap) action += 1;
  if (last.topology?.disconnectedWorksites > 0) action += 1;
  // Check if resource rates provide directional guidance
  if (last.economy?.food?.rate != null && last.economy?.wood?.rate != null) action += 1;
  if (last.topology?.expansionFrontiers?.length > 0) action += 1;
  scores.actionability = Math.min(10, action);

  // Information Density: check observation size vs info content
  let density = 6;
  const obsStr = JSON.stringify(last);
  const infoPerByte = Object.keys(last).length / obsStr.length;
  if (infoPerByte > 0.005) density += 1;
  if (last.topology?.clusters?.length > 0) density += 1;
  // Penalty for empty sections
  if (!last.objective) density -= 1;
  scores.information_density = Math.min(10, Math.max(1, density));

  // Consistency: building counts should be monotonically non-decreasing (or close)
  let consistency = 7;
  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1];
    const curr = observations[i];
    // Check building count consistency
    if (curr.topology?.totalBuildings < prev.topology?.totalBuildings - 5) consistency -= 1;
    // Worker count should roughly match
    if (Math.abs(curr.workforce?.total - prev.workforce?.total) > 20) consistency -= 1;
  }
  scores.consistency = Math.min(10, Math.max(1, consistency));

  // Crisis Detection
  let crisis = 4;
  // Check if low food triggers growth blocker
  const lowFoodObs = observations.filter(o => o.economy?.food?.stock < 20);
  if (lowFoodObs.length > 0) {
    if (lowFoodObs.some(o => o.workforce?.growthBlockers?.includes("food < 20"))) crisis += 3;
  } else {
    crisis += 2; // no crisis to detect
  }
  if (observations.some(o => o.economy?.food?.projectedZeroSec != null && o.economy?.food?.projectedZeroSec < 30)) crisis += 1;
  if (last.defense?.activeSaboteurs != null) crisis += 1;
  scores.crisis_detection = Math.min(10, crisis);

  // Strategic Value
  let strategic = 4;
  if (last.topology?.expansionFrontiers?.length >= 2) strategic += 1;
  if (last.topology?.clusters?.length >= 1 && last.topology.clusters[0].coverageRatio != null) strategic += 1;
  if (last.defense?.wallCoverage != null) strategic += 1;
  if (last.environment?.weather) strategic += 1;
  if (last.objective) strategic += 1;
  scores.strategic_value = Math.min(10, strategic);

  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length * 10) / 10;

  return { scores, overall };
}

// ── Main ─────────────────────────────────────────────────────────────

async function run() {
  const args = parseArgs();
  const duration = Number(args.duration) || 300;
  const templateId = args.template || "temperate_plains";
  const seed = Number(args.seed) || 42;
  const sampleInterval = Number(args.interval) || 30;
  const skipLlm = args["skip-llm"] === true;

  console.log(`\n=== Perceiver Benchmark ===`);
  console.log(`Template: ${templateId}, Seed: ${seed}, Duration: ${duration}s, Sample: ${sampleInterval}s\n`);

  // Initialize game
  const state = createInitialGameState({ templateId, seed });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.ai.runtimeProfile = "long_run";

  const memoryStore = new MemoryStore();
  const services = createServices(seed, { offlineAiFallback: true });
  services.memoryStore = memoryStore;
  const systems = buildSystems(memoryStore);

  const perceiver = new ColonyPerceiver();
  const totalTicks = Math.round(duration / DT_SEC);
  const sampleTicks = Math.round(sampleInterval / DT_SEC);
  const observations = [];

  // Run simulation and collect observations
  console.log("Running simulation...");
  const simStart = performance.now();

  for (let tick = 0; tick < totalTicks; tick++) {
    for (const system of systems) {
      system.update(DT_SEC, state, services);
    }
    await Promise.resolve();

    if (tick % sampleTicks === 0 || tick === totalTicks - 1) {
      const obs = perceiver.observe(state);
      observations.push(obs);

      const t = obs.timeSec;
      const w = obs.workforce.total;
      const b = obs.topology.totalBuildings;
      const clusters = obs.topology.clusters.length;
      const food = obs.economy.food;
      console.log(`  t=${String(t).padStart(4)}s | Workers=${String(w).padStart(2)} | Buildings=${String(b).padStart(3)} | Clusters=${clusters} | Food=${food.stock} (${food.rate > 0 ? "+" : ""}${food.rate}/s, ${food.trend})`);
    }

    if (state.session.phase === "end") {
      const obs = perceiver.observe(state);
      observations.push(obs);
      console.log(`  >>> GAME ENDED: ${state.session.outcome} — ${state.session.reason}`);
      break;
    }
  }

  const simMs = Math.round(performance.now() - simStart);
  console.log(`\nSimulation complete in ${simMs}ms (${observations.length} observations)\n`);

  // Ground truth
  const first = observations[0];
  const last = observations[observations.length - 1];
  const mid = observations[Math.floor(observations.length / 2)];
  const groundTruth = {
    templateId,
    duration: last.timeSec - first.timeSec,
    sampleInterval,
    finalWorkers: last.workforce.total,
    finalBuildings: last.topology.totalBuildings,
    buildingGrowth: last.topology.totalBuildings - first.topology.totalBuildings,
    popGrowth: last.workforce.total - first.workforce.total,
    finalProsperity: state.gameplay?.prosperity ?? 0,
    outcome: state.session.outcome ?? null,
    stagnationCount: countStagnation(observations),
  };

  // Self-assessment (always run)
  console.log("=== Self-Assessment ===");
  const selfResult = selfAssess(observations, groundTruth);
  for (const [dim, score] of Object.entries(selfResult.scores)) {
    const bar = "█".repeat(score) + "░".repeat(10 - score);
    console.log(`  ${dim.padEnd(22)} ${bar} ${score}/10`);
  }
  console.log(`  ${"OVERALL".padEnd(22)} ${selfResult.overall}/10`);

  // LLM judge (if API key available and not skipped)
  let llmResult = null;
  if (!skipLlm) {
    console.log("\n=== LLM Judge ===");
    // Sample a subset of observations for the judge (first, mid, last + 2 others)
    const judgeObs = [
      observations[0],
      observations[Math.floor(observations.length * 0.25)],
      observations[Math.floor(observations.length / 2)],
      observations[Math.floor(observations.length * 0.75)],
      observations[observations.length - 1],
    ].filter((v, i, a) => a.indexOf(v) === i); // dedup

    const judgePrompt = buildJudgePrompt(judgeObs, groundTruth);
    console.log(`Sending ${judgeObs.length} observations to LLM judge...`);
    llmResult = await callLLMJudge(JUDGE_SYSTEM_PROMPT, judgePrompt);

    if (llmResult) {
      console.log("\nLLM Judge Scores:");
      for (const [dim, val] of Object.entries(llmResult.scores ?? {})) {
        const score = val.score ?? 0;
        const bar = "█".repeat(score) + "░".repeat(10 - score);
        console.log(`  ${dim.padEnd(22)} ${bar} ${score}/10  ${val.justification ?? ""}`);
      }
      console.log(`  ${"OVERALL".padEnd(22)} ${llmResult.overall_score ?? "?"}/10`);
      if (llmResult.strengths?.length > 0) {
        console.log(`\n  Strengths:`);
        for (const s of llmResult.strengths) console.log(`    ✓ ${s}`);
      }
      if (llmResult.weaknesses?.length > 0) {
        console.log(`  Weaknesses:`);
        for (const w of llmResult.weaknesses) console.log(`    ✗ ${w}`);
      }
      if (llmResult.improvement_suggestions?.length > 0) {
        console.log(`  Suggestions:`);
        for (const s of llmResult.improvement_suggestions) console.log(`    → ${s}`);
      }
    } else {
      console.log("LLM judge unavailable — using self-assessment only.");
    }
  }

  // Final summary
  console.log("\n=== Final Summary ===");
  const finalScore = llmResult?.overall_score ?? selfResult.overall;
  console.log(`Template: ${templateId}`);
  console.log(`Duration: ${groundTruth.duration}s`);
  console.log(`Workers: ${first.workforce.total} → ${last.workforce.total}`);
  console.log(`Buildings: ${first.topology.totalBuildings} → ${last.topology.totalBuildings}`);
  console.log(`Clusters detected: ${last.topology.clusters.length}`);
  console.log(`Final score: ${finalScore}/10`);

  if (finalScore < 6) {
    console.log("\n⚠ BELOW THRESHOLD — improvement needed");
    process.exitCode = 1;
  } else if (finalScore < 8) {
    console.log("\n✓ PASSING — room for improvement");
  } else {
    console.log("\n✓✓ EXCELLENT");
  }

  // Return results for programmatic use
  return {
    groundTruth,
    selfAssessment: selfResult,
    llmAssessment: llmResult,
    observations,
    finalScore,
  };
}

function countStagnation(observations) {
  let count = 0;
  for (let i = 2; i < observations.length; i++) {
    if (observations[i].topology.totalBuildings === observations[i - 1].topology.totalBuildings
      && observations[i - 1].topology.totalBuildings === observations[i - 2].topology.totalBuildings
      && observations[i].workforce.total === observations[i - 1].workforce.total) {
      count++;
    }
  }
  return count;
}

run().catch(err => { console.error(err); process.exit(1); });
