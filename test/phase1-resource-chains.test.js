import test from "node:test";
import assert from "node:assert/strict";
import { TILE, ROLE, TILE_INFO } from "../src/config/constants.js";
import { BALANCE, BUILD_COST } from "../src/config/balance.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { chooseWorkerIntent } from "../src/simulation/npc/WorkerAISystem.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { tileToWorld, listTilesByType } from "../src/world/grid/Grid.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findTileOfType(state, tileType) {
  const { grid } = state;
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === tileType) return { ix, iz };
    }
  }
  return null;
}

function findTileMatching(state, predicate) {
  const { grid } = state;
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (predicate(ix, iz, grid.tiles[ix + iz * grid.width])) return { ix, iz };
    }
  }
  return null;
}

/**
 * Place a processing building tile directly and create a correctly-roled worker
 * standing on that tile. Returns { tile, worker }.
 */
function setupProcessingBuilding(state, buildingTileType, workerRole) {
  // Prefer to overwrite a ROAD tile so logistics adjacency is already satisfied.
  const roadTile = findTileOfType(state, TILE.ROAD);
  assert.ok(roadTile, "Test map must contain at least one road tile");

  const { ix, iz } = roadTile;
  state.grid.tiles[ix + iz * state.grid.width] = buildingTileType;
  state.grid.version = (state.grid.version ?? 0) + 1;

  const { x, z } = tileToWorld(ix, iz, state.grid);
  const worker = createWorker(x, z);
  worker.role = workerRole;
  worker.alive = true;
  state.agents.push(worker);

  return { tile: roadTile, worker };
}

function makeMinimalWorker(role = ROLE.FARM) {
  return {
    hunger: 0.9,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    role,
    stateLabel: "Idle",
    blackboard: {},
  };
}

function makeMinimalState(overrides = {}) {
  return {
    resources: { food: 50, wood: 50, stone: 10, herbs: 10, meals: 0, medicine: 0, tools: 0, ...overrides.resources },
    buildings: {
      warehouses: 1, farms: 1, lumbers: 1, quarries: 0,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0,
      ...overrides.buildings,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. ProcessingSystem Tests
// ---------------------------------------------------------------------------

test("ProcessingSystem: kitchen converts food to meals when COOK is adjacent", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  const { tile } = setupProcessingBuilding(state, TILE.KITCHEN, ROLE.COOK);

  // Set enough food for two cycles
  state.resources.food = 20;
  state.resources.meals = 0;

  const foodCost = BALANCE.kitchenFoodCost;
  const mealOutput = BALANCE.kitchenMealOutput;
  const cycleSec = BALANCE.kitchenCycleSec;

  // First call: initialises the timer
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  // Second call: time has passed, processing should occur
  state.metrics.timeSec = cycleSec * 2 + 2;
  const foodBefore = state.resources.food;
  const mealsBefore = state.resources.meals;
  system.update(1, state);

  assert.ok(state.resources.food < foodBefore || state.resources.meals > mealsBefore,
    "Kitchen should have consumed food or produced meals");
});

test("ProcessingSystem: kitchen does NOT process without a COOK worker nearby", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  const roadTile = findTileOfType(state, TILE.ROAD);
  assert.ok(roadTile);
  state.grid.tiles[roadTile.ix + roadTile.iz * state.grid.width] = TILE.KITCHEN;
  state.grid.version = (state.grid.version ?? 0) + 1;

  // Place a FARM worker far away (no COOK near the kitchen)
  const { x, z } = tileToWorld(0, 0, state.grid);
  const wrongWorker = createWorker(x, z);
  wrongWorker.role = ROLE.FARM;
  state.agents.push(wrongWorker);

  state.resources.food = 30;
  const cycleSec = BALANCE.kitchenCycleSec;
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  const foodAfterInit = state.resources.food;
  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);

  assert.equal(state.resources.food, foodAfterInit, "No COOK => no food should be consumed by kitchen");
  assert.equal(state.resources.meals, 0, "No COOK => no meals should be produced");
});

test("ProcessingSystem: kitchen does NOT process when insufficient food", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  const { tile } = setupProcessingBuilding(state, TILE.KITCHEN, ROLE.COOK);

  // Give less food than the kitchen needs
  state.resources.food = BALANCE.kitchenFoodCost - 1;
  state.resources.meals = 0;

  const cycleSec = BALANCE.kitchenCycleSec;
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  const foodAfterInit = state.resources.food;
  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);

  assert.equal(state.resources.meals, 0, "Kitchen should not produce meals when food < kitchenFoodCost");
});

test("ProcessingSystem: kitchen respects cycle cooldown", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  const { tile } = setupProcessingBuilding(state, TILE.KITCHEN, ROLE.COOK);

  state.resources.food = 100;
  state.resources.meals = 0;

  const cycleSec = BALANCE.kitchenCycleSec;
  const mealOutput = BALANCE.kitchenMealOutput;

  // Initialise timer
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  // First eligible process
  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);
  const mealsAfterFirst = state.resources.meals;

  // Immediately process again (time has NOT advanced past next cooldown)
  system.update(1, state);
  assert.equal(state.resources.meals, mealsAfterFirst, "Kitchen should not process again within the same cycle window");
});

test("ProcessingSystem: smithy converts stone+wood to tools when SMITH is adjacent", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  setupProcessingBuilding(state, TILE.SMITHY, ROLE.SMITH);

  state.resources.stone = 20;
  state.resources.wood = 20;
  state.resources.tools = 0;

  const cycleSec = BALANCE.smithyCycleSec;

  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  const stoneBefore = state.resources.stone;
  const woodBefore = state.resources.wood;
  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);

  assert.ok(state.resources.tools > 0 || state.resources.stone < stoneBefore || state.resources.wood < woodBefore,
    "Smithy should have consumed stone+wood or produced tools");
});

test("ProcessingSystem: smithy requires BOTH stone and wood", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  setupProcessingBuilding(state, TILE.SMITHY, ROLE.SMITH);

  // Enough stone but no wood
  state.resources.stone = 20;
  state.resources.wood = 0;
  state.resources.tools = 0;

  const cycleSec = BALANCE.smithyCycleSec;
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);

  assert.equal(state.resources.tools, 0, "Smithy should not produce tools without wood");

  // Symmetric case: enough wood but no stone
  state.resources.stone = 0;
  state.resources.wood = 20;
  state.resources.tools = 0;

  state.metrics.timeSec = cycleSec * 4 + 4;
  system.update(1, state);

  state.metrics.timeSec = cycleSec * 5 + 5;
  system.update(1, state);

  assert.equal(state.resources.tools, 0, "Smithy should not produce tools without stone");
});

test("ProcessingSystem: clinic converts herbs to medicine when HERBALIST is adjacent", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  setupProcessingBuilding(state, TILE.CLINIC, ROLE.HERBALIST);

  state.resources.herbs = 20;
  state.resources.medicine = 0;

  const cycleSec = BALANCE.clinicCycleSec;
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  const herbsBefore = state.resources.herbs;
  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);

  assert.ok(state.resources.medicine > 0 || state.resources.herbs < herbsBefore,
    "Clinic should produce medicine or consume herbs when HERBALIST is present");
});

test("ProcessingSystem: clinic does NOT process without HERBALIST nearby", () => {
  const state = createInitialGameState();
  const system = new ProcessingSystem();

  const roadTile = findTileOfType(state, TILE.ROAD);
  assert.ok(roadTile);
  state.grid.tiles[roadTile.ix + roadTile.iz * state.grid.width] = TILE.CLINIC;
  state.grid.version = (state.grid.version ?? 0) + 1;

  // No HERBALIST workers
  state.resources.herbs = 20;
  state.resources.medicine = 0;

  const cycleSec = BALANCE.clinicCycleSec;
  state.metrics.timeSec = cycleSec + 1;
  system.update(1, state);

  state.metrics.timeSec = cycleSec * 2 + 2;
  system.update(1, state);

  assert.equal(state.resources.medicine, 0, "Clinic should not produce medicine without HERBALIST");
});

// ---------------------------------------------------------------------------
// 2. Resource Effects Tests
// ---------------------------------------------------------------------------

test("ResourceSystem: tool production multiplier formula", () => {
  const state = createInitialGameState();
  const system = new ResourceSystem();

  state.resources.tools = 0;
  system.update(0.1, state);
  assert.equal(state.gameplay.toolProductionMultiplier, 1.0,
    "0 tools => 1.0x multiplier");

  state.resources.tools = 1;
  system.update(0.1, state);
  assert.ok(Math.abs(state.gameplay.toolProductionMultiplier - 1.15) < 0.001,
    "1 tool => 1.15x multiplier");

  state.resources.tools = 3;
  system.update(0.1, state);
  assert.ok(Math.abs(state.gameplay.toolProductionMultiplier - 1.45) < 0.001,
    "3 tools => 1.45x multiplier");

  // Cap at 3 effective tools
  state.resources.tools = 5;
  system.update(0.1, state);
  assert.ok(Math.abs(state.gameplay.toolProductionMultiplier - 1.45) < 0.001,
    "5 tools => still 1.45x (capped at 3)");
});

test("ResourceSystem: clamps all 7 resources to >= 0", () => {
  const state = createInitialGameState();
  const system = new ResourceSystem();

  state.resources.food = -10;
  state.resources.wood = -5;
  state.resources.stone = -1;
  state.resources.herbs = -3;
  state.resources.meals = -2;
  state.resources.medicine = -7;
  state.resources.tools = -4;

  system.update(0.1, state);

  assert.equal(state.resources.food, 0);
  assert.equal(state.resources.wood, 0);
  assert.equal(state.resources.stone, 0);
  assert.equal(state.resources.herbs, 0);
  assert.equal(state.resources.meals, 0);
  assert.equal(state.resources.medicine, 0);
  assert.equal(state.resources.tools, 0);
});

test("ResourceSystem: resets NaN resources to 0", () => {
  const state = createInitialGameState();
  const system = new ResourceSystem();

  state.resources.food = NaN;
  state.resources.wood = NaN;
  state.resources.stone = NaN;
  state.resources.herbs = NaN;
  state.resources.meals = NaN;
  state.resources.medicine = NaN;
  state.resources.tools = NaN;

  system.update(0.1, state);

  assert.equal(state.resources.food, 0, "NaN food should reset to 0");
  assert.equal(state.resources.wood, 0, "NaN wood should reset to 0");
  assert.equal(state.resources.stone, 0, "NaN stone should reset to 0");
  assert.equal(state.resources.herbs, 0, "NaN herbs should reset to 0");
  assert.equal(state.resources.meals, 0, "NaN meals should reset to 0");
  assert.equal(state.resources.medicine, 0, "NaN medicine should reset to 0");
  assert.equal(state.resources.tools, 0, "NaN tools should reset to 0");
});

// ---------------------------------------------------------------------------
// 3. Role Assignment Tests
// ---------------------------------------------------------------------------

test("RoleAssignment: with no processing buildings, workers only get FARM or WOOD", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  // Ensure no processing buildings exist
  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;

  system.update(2, state);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  for (const worker of workers) {
    assert.ok(
      worker.role === ROLE.FARM || worker.role === ROLE.WOOD || worker.role === ROLE.HAUL,
      `Expected FARM, WOOD, or HAUL but got ${worker.role}`,
    );
  }
});

test("RoleAssignment: with 1 kitchen, exactly 1 worker gets COOK role", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  state.buildings.kitchens = 1;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;

  system.update(2, state);

  const cooks = state.agents.filter((a) => a.type === "WORKER" && a.role === ROLE.COOK);
  assert.equal(cooks.length, 1, "Exactly 1 COOK expected when 1 kitchen exists");
});

test("RoleAssignment: with 1 smithy, exactly 1 worker gets SMITH role", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 1;
  state.buildings.clinics = 0;

  system.update(2, state);

  const smiths = state.agents.filter((a) => a.type === "WORKER" && a.role === ROLE.SMITH);
  assert.equal(smiths.length, 1, "Exactly 1 SMITH expected when 1 smithy exists");
});

test("RoleAssignment: with 1 clinic, exactly 1 worker gets HERBALIST role", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 0;
  state.buildings.clinics = 1;

  system.update(2, state);

  const herbalists = state.agents.filter((a) => a.type === "WORKER" && a.role === ROLE.HERBALIST);
  assert.equal(herbalists.length, 1, "Exactly 1 HERBALIST expected when 1 clinic exists");
});

test("RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  state.buildings.quarries = 1;
  state.buildings.herbGardens = 0;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;

  system.update(2, state);

  const stoners = state.agents.filter((a) => a.type === "WORKER" && a.role === ROLE.STONE);
  assert.equal(stoners.length, 1, "Exactly 1 STONE worker expected when 1 quarry exists");
});

test("RoleAssignment: with 1 herb garden, exactly 1 worker gets HERBS role", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  state.buildings.quarries = 0;
  state.buildings.herbGardens = 1;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;

  system.update(2, state);

  const herbWorkers = state.agents.filter((a) => a.type === "WORKER" && a.role === ROLE.HERBS);
  assert.equal(herbWorkers.length, 1, "Exactly 1 HERBS worker expected when 1 herb garden exists");
});

test("RoleAssignment: specialist roles not assigned when building does not exist", () => {
  const state = createInitialGameState();
  const system = new RoleAssignmentSystem();

  // All specialist buildings absent
  state.buildings.quarries = 0;
  state.buildings.herbGardens = 0;
  state.buildings.kitchens = 0;
  state.buildings.smithies = 0;
  state.buildings.clinics = 0;

  system.update(2, state);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  const specialists = workers.filter((w) =>
    w.role === ROLE.STONE || w.role === ROLE.HERBS ||
    w.role === ROLE.COOK || w.role === ROLE.SMITH || w.role === ROLE.HERBALIST
  );
  assert.equal(specialists.length, 0, "No specialist roles when no specialist buildings exist");
});

// ---------------------------------------------------------------------------
// 4. Worker Intent Tests
// ---------------------------------------------------------------------------

test("Worker intent: STONE role chooses 'quarry' when quarries exist", () => {
  const state = makeMinimalState({ buildings: { quarries: 1, warehouses: 1, farms: 1, lumbers: 1 } });
  const worker = makeMinimalWorker(ROLE.STONE);
  assert.equal(chooseWorkerIntent(worker, state), "quarry");
});

test("Worker intent: HERBS role chooses 'gather_herbs' when herb gardens exist", () => {
  const state = makeMinimalState({ buildings: { herbGardens: 1, warehouses: 1, farms: 1, lumbers: 1 } });
  const worker = makeMinimalWorker(ROLE.HERBS);
  assert.equal(chooseWorkerIntent(worker, state), "gather_herbs");
});

test("Worker intent: COOK role chooses 'cook' when kitchens exist", () => {
  const state = makeMinimalState({ buildings: { kitchens: 1, warehouses: 1, farms: 1, lumbers: 1 } });
  const worker = makeMinimalWorker(ROLE.COOK);
  assert.equal(chooseWorkerIntent(worker, state), "cook");
});

test("Worker intent: SMITH role chooses 'smith' when smithies exist", () => {
  const state = makeMinimalState({ buildings: { smithies: 1, warehouses: 1, farms: 1, lumbers: 1 } });
  const worker = makeMinimalWorker(ROLE.SMITH);
  assert.equal(chooseWorkerIntent(worker, state), "smith");
});

test("Worker intent: HERBALIST role chooses 'heal' when clinics exist", () => {
  const state = makeMinimalState({ buildings: { clinics: 1, warehouses: 1, farms: 1, lumbers: 1 } });
  const worker = makeMinimalWorker(ROLE.HERBALIST);
  assert.equal(chooseWorkerIntent(worker, state), "heal");
});

test("Worker intent: specialist roles fall back to 'wander' if building is destroyed", () => {
  const state = makeMinimalState({ buildings: { quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, warehouses: 1, farms: 1, lumbers: 1 } });

  const stoneWorker = makeMinimalWorker(ROLE.STONE);
  assert.equal(chooseWorkerIntent(stoneWorker, state), "wander", "STONE with no quarries => wander");

  const herbsWorker = makeMinimalWorker(ROLE.HERBS);
  assert.equal(chooseWorkerIntent(herbsWorker, state), "wander", "HERBS with no herbGardens => wander");

  const cookWorker = makeMinimalWorker(ROLE.COOK);
  assert.equal(chooseWorkerIntent(cookWorker, state), "wander", "COOK with no kitchens => wander");

  const smithWorker = makeMinimalWorker(ROLE.SMITH);
  assert.equal(chooseWorkerIntent(smithWorker, state), "wander", "SMITH with no smithies => wander");

  const herbalistWorker = makeMinimalWorker(ROLE.HERBALIST);
  assert.equal(chooseWorkerIntent(herbalistWorker, state), "wander", "HERBALIST with no clinics => wander");
});

// ---------------------------------------------------------------------------
// 5. Config Integrity Tests
// ---------------------------------------------------------------------------

test("Config: all 5 new TILE_INFO entries exist and have passable:true", () => {
  for (const tileType of [TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]) {
    const info = TILE_INFO[tileType];
    assert.ok(info, `TILE_INFO missing entry for tile type ${tileType}`);
    assert.equal(info.passable, true, `TILE_INFO[${tileType}] should be passable`);
  }
});

test("Config: all 5 new BUILD_COST entries exist", () => {
  for (const tool of ["quarry", "herb_garden", "kitchen", "smithy", "clinic"]) {
    assert.ok(BUILD_COST[tool] !== undefined, `BUILD_COST missing entry for ${tool}`);
  }
});

test("Config: BUILD_COST for kitchen includes stone, smithy includes stone, clinic includes herbs", () => {
  assert.ok((BUILD_COST.kitchen.stone ?? 0) > 0, "kitchen BUILD_COST should require stone");
  assert.ok((BUILD_COST.smithy.stone ?? 0) > 0, "smithy BUILD_COST should require stone");
  assert.ok((BUILD_COST.clinic.herbs ?? 0) > 0, "clinic BUILD_COST should require herbs");
});

test("Config: all BALANCE constants for Phase 1 processing exist and are positive numbers", () => {
  const keys = [
    "quarryProductionPerSecond",
    "herbGardenProductionPerSecond",
    "kitchenCycleSec",
    "kitchenFoodCost",
    "kitchenMealOutput",
    "smithyCycleSec",
    "smithyStoneCost",
    "smithyWoodCost",
    "smithyToolOutput",
    "clinicCycleSec",
    "clinicHerbsCost",
    "clinicMedicineOutput",
    "mealHungerRecoveryMultiplier",
    "toolHarvestSpeedBonus",
    "toolMaxEffective",
    "medicineHealPerSecond",
  ];
  for (const key of keys) {
    const value = BALANCE[key];
    assert.ok(typeof value === "number", `BALANCE.${key} should be a number (got ${typeof value})`);
    assert.ok(value > 0, `BALANCE.${key} should be positive (got ${value})`);
  }
});

// ---------------------------------------------------------------------------
// 6. Build System Tests
// ---------------------------------------------------------------------------

test("BuildSystem: can place quarry on grass near road/warehouse", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  // Give plenty of resources
  state.resources.wood = 999;
  state.resources.stone = 999;

  const validQuarry = findTileMatching(state, (ix, iz, tile) => {
    if (tile !== TILE.GRASS) return false;
    return buildSystem.previewToolAt(state, "quarry", ix, iz).ok;
  });

  assert.ok(validQuarry, "Should be able to find a valid quarry placement");
  const result = buildSystem.placeToolAt(state, "quarry", validQuarry.ix, validQuarry.iz);
  assert.equal(result.ok, true, `Expected ok=true but got reason: ${result.reason}`);
  assert.equal(state.grid.tiles[validQuarry.ix + validQuarry.iz * state.grid.width], TILE.QUARRY);
});

test("BuildSystem: can place kitchen (requires wood + stone)", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.resources.wood = 999;
  state.resources.stone = 999;

  const validKitchen = findTileMatching(state, (ix, iz, tile) => {
    if (tile !== TILE.GRASS && tile !== TILE.ROAD && tile !== TILE.RUINS) return false;
    return buildSystem.previewToolAt(state, "kitchen", ix, iz).ok;
  });

  assert.ok(validKitchen, "Should be able to find a valid kitchen placement");
  const result = buildSystem.placeToolAt(state, "kitchen", validKitchen.ix, validKitchen.iz);
  assert.equal(result.ok, true, `Expected ok=true but got reason: ${result.reason}`);
  assert.equal(state.grid.tiles[validKitchen.ix + validKitchen.iz * state.grid.width], TILE.KITCHEN);
});

test("BuildSystem: cannot place kitchen without enough stone", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.resources.wood = 999;
  state.resources.stone = 0; // no stone

  const validKitchen = findTileMatching(state, (ix, iz, tile) => {
    if (tile !== TILE.GRASS && tile !== TILE.ROAD && tile !== TILE.RUINS) return false;
    // Check location is valid (logistics access) ignoring resources by checking preview with enough resources
    const tempStone = state.resources.stone;
    state.resources.stone = 999;
    const preview = buildSystem.previewToolAt(state, "kitchen", ix, iz);
    state.resources.stone = tempStone;
    return preview.ok;
  });

  if (!validKitchen) return; // skip if no valid tile found

  const result = buildSystem.placeToolAt(state, "kitchen", validKitchen.ix, validKitchen.iz);
  assert.equal(result.ok, false, "Should not be able to place kitchen without stone");
  assert.equal(result.reason, "insufficientResource");
});

test("BuildSystem: erase of new tiles returns correct salvage refund", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.resources.wood = 999;
  state.resources.stone = 999;
  state.resources.herbs = 999;

  // Place a smithy (requires wood + stone)
  const validSmithy = findTileMatching(state, (ix, iz, tile) => {
    if (tile !== TILE.GRASS && tile !== TILE.ROAD && tile !== TILE.RUINS) return false;
    return buildSystem.previewToolAt(state, "smithy", ix, iz).ok;
  });

  if (!validSmithy) return; // skip if no valid location

  buildSystem.placeToolAt(state, "smithy", validSmithy.ix, validSmithy.iz);

  const woodBeforeErase = state.resources.wood;
  const stoneBeforeErase = state.resources.stone;

  const eraseResult = buildSystem.placeToolAt(state, "erase", validSmithy.ix, validSmithy.iz);
  assert.equal(eraseResult.ok, true, "Should be able to erase smithy");

  // Salvage should return half of build cost (floor)
  const expectedWoodRefund = Math.floor((BUILD_COST.smithy.wood ?? 0) * 0.5);
  const expectedStoneRefund = Math.floor((BUILD_COST.smithy.stone ?? 0) * 0.5);

  assert.equal(state.resources.wood, woodBeforeErase + expectedWoodRefund, "Wood refund mismatch");
  assert.equal(state.resources.stone, stoneBeforeErase + expectedStoneRefund, "Stone refund mismatch");

  // Tile should be back to GRASS
  assert.equal(state.grid.tiles[validSmithy.ix + validSmithy.iz * state.grid.width], TILE.GRASS);
});

test("BuildSystem: erase of clinic returns herbs salvage refund", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.resources.wood = 999;
  state.resources.stone = 999;
  state.resources.herbs = 999;

  const validClinic = findTileMatching(state, (ix, iz, tile) => {
    if (tile !== TILE.GRASS && tile !== TILE.ROAD && tile !== TILE.RUINS) return false;
    return buildSystem.previewToolAt(state, "clinic", ix, iz).ok;
  });

  if (!validClinic) return;

  buildSystem.placeToolAt(state, "clinic", validClinic.ix, validClinic.iz);

  const woodBeforeErase = state.resources.wood;
  const herbsBeforeErase = state.resources.herbs;

  const eraseResult = buildSystem.placeToolAt(state, "erase", validClinic.ix, validClinic.iz);
  assert.equal(eraseResult.ok, true, "Should be able to erase clinic");

  const expectedWoodRefund = Math.floor((BUILD_COST.clinic.wood ?? 0) * 0.5);
  const expectedHerbsRefund = Math.floor((BUILD_COST.clinic.herbs ?? 0) * 0.5);

  assert.equal(state.resources.wood, woodBeforeErase + expectedWoodRefund, "Clinic wood refund mismatch");
  assert.equal(state.resources.herbs, herbsBeforeErase + expectedHerbsRefund, "Clinic herbs refund mismatch");
  assert.equal(state.grid.tiles[validClinic.ix + validClinic.iz * state.grid.width], TILE.GRASS);
});

// ---------------------------------------------------------------------------
// 7. Medicine Healing Tests
// ---------------------------------------------------------------------------

test("MortalitySystem: heals injured workers when medicine > 0", () => {
  const state = createInitialGameState();
  const system = new MortalitySystem();

  // Find the first worker and injure them
  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker, "Test needs at least one worker");

  worker.hp = 40;
  worker.maxHp = 100;
  worker.hunger = 1.0; // not starving
  worker.starvationSec = 0;

  state.resources.medicine = 5;
  state.metrics.timeSec = 0;

  const hpBefore = worker.hp;
  const medicineBefore = state.resources.medicine;

  system.update(1, state); // 1 second

  assert.ok(worker.hp > hpBefore, `Worker should have been healed (was ${hpBefore}, now ${worker.hp})`);
});

test("MortalitySystem: medicine is consumed during healing", () => {
  const state = createInitialGameState();
  const system = new MortalitySystem();

  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker);

  worker.hp = 50;
  worker.maxHp = 100;
  worker.hunger = 1.0;
  worker.starvationSec = 0;

  state.resources.medicine = 5;
  const medicineBefore = state.resources.medicine;
  state.metrics.timeSec = 0;

  system.update(1, state);

  assert.ok(state.resources.medicine < medicineBefore, "Medicine should be consumed during healing");
  assert.ok(state.resources.medicine >= 0, "Medicine should never go below 0");
});
