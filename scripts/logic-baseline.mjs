import fs from "node:fs";
import path from "node:path";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { DEFAULT_GROUP_POLICIES } from "../src/config/aiConfig.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";

const OUT_ARG = process.argv.find((arg) => arg.startsWith("--out="));
const outPath = OUT_ARG
  ? OUT_ARG.slice("--out=".length)
  : path.resolve("docs/logic-baseline-2026-03.json");

const seedArg = process.argv.find((arg) => arg.startsWith("--seed="));
const seed = seedArg ? Number(seedArg.slice("--seed=".length)) : 1337;
const dt = 1 / 30;
const totalSec = 120;
const totalTicks = Math.round(totalSec / dt);

const state = createInitialGameState({ seed });
const services = createServices(state.world.mapSeed);
for (const policy of Object.values(DEFAULT_GROUP_POLICIES)) {
  state.ai.groupPolicies.set(policy.groupId, {
    expiresAtSec: Number.POSITIVE_INFINITY,
    data: JSON.parse(JSON.stringify(policy)),
  });
}

const systems = [
  new RoleAssignmentSystem(),
  new WorkerAISystem(),
  new VisitorAISystem(),
  new AnimalAISystem(),
  new MortalitySystem(),
  new WildlifePopulationSystem(),
  new BoidsSystem(),
  new ResourceSystem(),
];

const stateDistribution = {};
for (let i = 0; i < totalTicks; i += 1) {
  state.metrics.timeSec += dt;
  state.metrics.tick += 1;
  for (const system of systems) {
    system.update(dt, state, services);
  }
  for (const entity of [...state.agents, ...state.animals]) {
    const groupId = String(entity.groupId ?? entity.type ?? "unknown");
    const stateNode = String(entity.blackboard?.fsm?.state ?? "none");
    const key = `${groupId}:${stateNode}`;
    stateDistribution[key] = Number(stateDistribution[key] ?? 0) + 1;
  }
}

const pathRecalcByEntity = Object.entries(state.debug.logic?.pathRecalcByEntity ?? {})
  .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))
  .slice(0, 10)
  .map(([id, count]) => ({ id, count: Number(count ?? 0) }));

const payload = {
  generatedAt: new Date().toISOString(),
  seed,
  durationSec: totalSec,
  goalFlipCount: Number(state.metrics.goalFlipCount ?? 0),
  invalidTransitionCount: Number(state.metrics.invalidTransitionCount ?? 0),
  deathsTotal: Number(state.metrics.deathsTotal ?? 0),
  deliverWithoutCarryCount: Number(state.metrics.deliverWithoutCarryCount ?? 0),
  stateDistributionByGroup: stateDistribution,
  pathRecalcByEntityTopN: pathRecalcByEntity,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
