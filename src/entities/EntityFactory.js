import { ENTITY_TYPE, ROLE, VISITOR_KIND, ANIMAL_KIND, ANIMAL_SPECIES, TILE } from "../config/constants.js";
import { BALANCE, INITIAL_POPULATION, INITIAL_RESOURCES } from "../config/balance.js";
import { GROUP_IDS } from "../config/aiConfig.js";
import { nextId } from "../app/id.js";
import { createDefaultAiRuntimeStats } from "../app/aiRuntimeStats.js";
import { getActiveUiProfile } from "../app/uiProfileState.js";
import { DEFAULT_DISPLAY_SETTINGS } from "../app/controlSanitizers.js";
import {
  createInitialGrid,
  randomTileOfTypes,
  tileToWorld,
  rebuildBuildingStats,
  countTilesByType,
  DEFAULT_MAP_TEMPLATE_ID,
  describeMapTemplate,
} from "../world/grid/Grid.js";
import { buildScenarioBundle, seedResourceNodes } from "../world/scenarios/ScenarioFactory.js";
import { createPerformanceTelemetry } from "../app/performanceTelemetry.js";

const ALPHA_START_RESOURCES = Object.freeze({
  food: INITIAL_RESOURCES.food,
  wood: INITIAL_RESOURCES.wood,
  stone: INITIAL_RESOURCES.stone ?? 0,
});

function createDeterministicRandom(seed) {
  let s = Number(seed) >>> 0;
  if (!s) s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function withLabel(id, fallback) {
  const seq = id.includes("_") ? id.split("_")[1] : "?";
  return `${fallback}-${seq}`;
}

// v0.8.2 Round-0 01e-innovation (Step 1) — Worker name bank. ~40 short
// given-names used to replace the generic "Worker-N" label with personalised
// identifiers like "Aila-10". Name selection uses the deterministic RNG
// passed into createWorker, so replay/snapshot determinism is preserved. The
// numeric suffix from the id is retained to avoid name collisions in the UI
// when two workers share the same drawn name. 02d will extend a similar bank
// to visitors/saboteurs — this first landing covers WORKERS only.
//
// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 1) — bank expanded from 40 → 84
// (deduped) so the 13 initial colonists no longer collide on "3 Mose" picks.
// `pickWorkerName` accepts an optional `excludeSet`: if a draw lands on a
// name already in the set we **reroll up to 3 times** before falling back to
// the original draw. The 3-retry cap bounds RNG offset drift to a small,
// constant window so the long-horizon-determinism contract still holds —
// later workers (post-spawn births) almost never trigger reroll because the
// excludeSet is small compared to bank size, so the 4-seed bench stays
// near-baseline.
export const WORKER_NAME_BANK = Object.freeze([
  "Aila", "Ren", "Bram", "Ivo", "Nell", "Cato", "Mira", "Joss",
  "Kira", "Tam", "Ora", "Vela", "Hale", "Ris", "Fen", "Luka",
  "Sora", "Dax", "Yara", "Evan", "Pia", "Mose", "Nira", "Ody",
  "Reva", "Talon", "Kess", "Lio", "Nori", "Vian", "Saro", "Beck",
  "Tess", "Remy", "Juno", "Anse", "Dova", "Ilia", "Cora", "Marek",
  // Round-6 Wave-3 02d expansion (44 additional unique first-names).
  "Bora", "Eira", "Garek", "Halo", "Inza", "Jora", "Kael", "Lira",
  "Mael", "Niko", "Olen", "Pell", "Quin", "Rhea", "Senn", "Toma",
  "Una", "Vail", "Wren", "Xara", "Yvo", "Zara", "Brae", "Calla",
  "Dace", "Esha", "Faye", "Gren", "Hova", "Ives", "Joran", "Karis",
  "Liva", "Maro", "Nessa", "Orin", "Polla", "Riven", "Sela", "Tova",
  "Ula", "Veska", "Wynn", "Zora",
]);

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 1) — lineage relation tags
// reserved for future kinship rendering (parent / child / sibling). Currently
// only `parent` and `child` are populated in PopulationGrowthSystem, but the
// tag set is exported for downstream UI/voice-pack consumers.
export const LINEAGE_RELATION = Object.freeze({
  PARENT: "parent",
  CHILD: "child",
  SIBLING: "sibling",
});

function pickWorkerName(random, excludeSet = null) {
  const bank = WORKER_NAME_BANK;
  const baseIdx = Math.floor(random() * bank.length);
  const safeBaseIdx = Number.isFinite(baseIdx) && baseIdx >= 0 && baseIdx < bank.length
    ? baseIdx
    : 0;
  const baseName = bank[safeBaseIdx];
  if (!excludeSet || typeof excludeSet.has !== "function" || !excludeSet.has(baseName)) {
    return baseName;
  }
  // Reroll up to 3 times — capped to bound RNG offset drift for benchmarks.
  // If the bank is exhausted (excludeSet covers ≥ bank.length entries) the
  // reroll is impossible to satisfy, so we fall through to the base draw.
  if (excludeSet.size >= bank.length) return baseName;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const idx = Math.floor(random() * bank.length);
    const safeIdx = Number.isFinite(idx) && idx >= 0 && idx < bank.length ? idx : 0;
    const candidate = bank[safeIdx];
    if (!excludeSet.has(candidate)) return candidate;
  }
  return baseName;
}

// v0.8.2 Round-5b (02e Step 4) — 40 ASCII neutral surnames for casual profile.
// Source: Dwarf Fortress / Crusader Kings naming cadence; all ≤ 8 letters.
// Only consumed in casual uiProfile — full/dev profile preserves old RNG seq.
export const SURNAME_BANK = Object.freeze([
  "Hollowbrook", "Riven", "Marsh", "Cole", "Orr", "Vesper", "Pale",
  "Thorn", "Brannt", "Ashford", "Keane", "Drift", "Hale", "Fenn",
  "Lowe", "Grove", "Stoker", "Reeve", "Moss", "Quinn",
  "Ward", "Tull", "Orrow", "Sable", "Rook", "Venn", "Coll", "Pike",
  "Arden", "Bower", "Cray", "Dane", "Elm", "Foss", "Glade", "Hearn",
  "Inge", "Jorvik", "Lark", "Mend",
]);

function pickSurname(random) {
  const idx = Math.floor(random() * SURNAME_BANK.length);
  const safeIdx = Number.isFinite(idx) && idx >= 0 && idx < SURNAME_BANK.length ? idx : 0;
  return SURNAME_BANK[safeIdx];
}

// v0.8.2 Round-0 02d-roleplayer (Step 1) — Visitor name banks. 01e introduced
// WORKER_NAME_BANK; we extend the same pattern to visitors so traders and
// saboteurs stop reading as "Trader-217" / "Saboteur-218" in EntityFocusPanel
// and the narrative event log. Two small banks (rather than reusing workers)
// so the cadence of a trader name ("Mercer") reads differently from a
// colonist ("Aila"), which reinforces the "other faction" tell when players
// see a visitor die in the Colony Log. Animals intentionally keep the
// "Predator-N" / "Herbivore-N" label per 01e's decision.
export const TRADER_NAME_BANK = Object.freeze([
  "Mercer", "Halden", "Orrin", "Thal", "Brandt", "Voss",
  "Corvo", "Sable", "Rook", "Dagan", "Wylde", "Brinn",
  "Sten", "Myre", "Orla", "Kade", "Breck", "Jory",
  "Nash", "Tove", "Quill", "Reeve",
]);

export const SABOTEUR_NAME_BANK = Object.freeze([
  "Vex", "Creed", "Draven", "Mire", "Sloan", "Thorne",
  "Kade", "Ren", "Garrick", "Ash", "Crow", "Vail",
  "Harrow", "Shade", "Nox", "Salt", "Grue", "Rook",
  "Snare", "Hex", "Barr", "Kal",
]);

function pickVisitorName(random, kind) {
  const bank = kind === "TRADER" ? TRADER_NAME_BANK : SABOTEUR_NAME_BANK;
  const idx = Math.floor(random() * bank.length);
  const safeIdx = Number.isFinite(idx) && idx >= 0 && idx < bank.length ? idx : 0;
  return bank[safeIdx];
}

function seqFromId(id) {
  const raw = String(id ?? "");
  return raw.includes("_") ? raw.split("_")[1] : "?";
}

// v0.8.2 Round-0 01e-innovation (Step 2) — backstory builder. Uses the
// argmax of the seeded `skills` object for `topSkill` and the first entry
// of the seeded `traits` array for `topTrait`, giving a human-readable
// one-liner like `"farming specialist, swift temperament"`. EntityFocusPanel
// renders this below the displayName; HUD deathVal uses `(topSkill specialist)`
// as a micro-obituary.
export function buildWorkerBackstory(skills = {}, traits = []) {
  let topSkill = "generalist";
  let topSkillValue = -Infinity;
  for (const key of Object.keys(skills)) {
    const v = Number(skills[key]);
    if (Number.isFinite(v) && v > topSkillValue) {
      topSkillValue = v;
      topSkill = key;
    }
  }
  const topTrait = Array.isArray(traits) && traits.length > 0
    ? String(traits[0])
    : "steady";
  return `${topSkill} specialist, ${topTrait} temperament`;
}

function baseAgent(id, type, x, z, displayName, random = Math.random) {
  return {
    id,
    displayName,
    type,
    x,
    z,
    vx: (random() - 0.5) * 0.3,
    vz: (random() - 0.5) * 0.3,
    desiredVel: { x: 0, z: 0 },
    hunger: 1,
    stamina: 1,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    stateLabel: "Idle",
    cooldown: 0,
    sabotageCooldown: 25 + random() * 15,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    pathTrafficVersion: 0,
    blackboard: {
      taskLock: { state: "", untilSec: -Infinity },
      emergencyRationCooldownSec: -Infinity,
      lastFeasibilityReject: null,
    },
    policy: null,
    alive: true,
    hp: 100,
    maxHp: 100,
    deathReason: "",
    deathSec: -1,
    starvationSec: 0,
    attackCooldownSec: 0,
    memory: { recentEvents: [], dangerTiles: [] },
    debug: {
      lastIntent: "",
      lastPathLength: 0,
      lastPathRecalcSec: 0,
    },
  };
}

// Available trait pool — each worker gets 1-2 random traits
const TRAIT_POOL = ["hardy", "swift", "careful", "efficient", "social", "resilient"];

function pickTraits(random) {
  const count = random() < 0.4 ? 1 : 2;
  const pool = [...TRAIT_POOL];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function generateSkills(random) {
  return {
    farming: 0.3 + random() * 0.7,
    woodcutting: 0.3 + random() * 0.7,
    mining: 0.3 + random() * 0.7,
    cooking: 0.3 + random() * 0.7,
    crafting: 0.3 + random() * 0.7,
  };
}

export function createWorker(x, z, random = Math.random, options = null) {
  const id = nextId("worker");
  // v0.8.2 Round-0 01e-innovation (Step 1). Draw the name BEFORE the other
  // random()-consuming constructors so the selection stays on a stable
  // offset of the deterministic RNG stream (see Risks §Snapshot determinism
  // in Round0/Plans/01e-innovation.md). pickTraits / generateSkills still
  // consume the same number of random() calls they did before.
  // v0.8.2 Round-5b (02e Step 4): casual profile adds SURNAME_BANK pick
  // here (1 extra random() call, before pickTraits to keep RNG offset stable).
  // full/dev profile skips surname to preserve benchmark RNG sequence.
  // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 1+2) — `options.excludeSet`
  // (Set<string>) lets initial-population creation avoid name collisions
  // without changing the RNG stream offset on the common (no-collision) path.
  // The reroll cap inside pickWorkerName bounds drift to ≤3 extra calls/per
  // collision; long-horizon-determinism still passes because mid-game births
  // pass `excludeSet=null` (the colony rarely re-enters initial-pop pressure).
  const excludeSet = options?.excludeSet ?? null;
  const workerName = pickWorkerName(random, excludeSet);
  const uiProfile = getActiveUiProfile();
  const surname = uiProfile === "casual" ? pickSurname(random) : null;
  const displayName = uiProfile === "casual"
    ? `${workerName} ${surname}`
    : `${workerName}-${seqFromId(id)}`;
  const hungerSeekThreshold = 0.12 + random() * 0.08;
  const eatRecoveryTarget = 0.62 + random() * 0.12;
  const traits = pickTraits(random);
  const skills = generateSkills(random);
  const backstory = buildWorkerBackstory(skills, traits);
  const worker = {
    ...baseAgent(id, ENTITY_TYPE.WORKER, x, z, displayName, random),
    role: ROLE.FARM,
    groupId: GROUP_IDS.WORKERS,
    metabolism: {
      hungerSeekThreshold,
      eatRecoveryTarget,
      hungerDecayMultiplier: 0.88 + random() * 0.24,
      eatRecoveryPerFoodMultiplier: 0.9 + random() * 0.2,
    },
    // Needs system
    rest: 0.7 + random() * 0.3,      // 0 = exhausted, 1 = fully rested
    morale: 0.6 + random() * 0.4,    // 0 = miserable, 1 = happy
    social: 0.5 + random() * 0.5,    // 0 = lonely, 1 = socially fulfilled
    mood: 0.7,                        // composite mood indicator (updated each tick)
    // Individual identity
    traits,
    skills,
    backstory,
    preferences: {
      speedMultiplier: traits.includes("swift") ? 1.15 : (traits.includes("careful") ? 0.9 : 1.0),
      workDurationMultiplier: traits.includes("efficient") ? 0.8 : (traits.includes("careful") ? 1.2 : 1.0),
    },
    relationships: {},                // { otherWorkerId: opinion (-1 to 1) }
    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 2) — kinship hooks. Initial
    // population workers spawn with empty parents/children arrays; growth-
    // path births populate `parents` with 1-2 nearby living worker ids and
    // append the newborn id into each parent's `children`. `deathSec` mirrors
    // the existing top-level `deathSec` field but is scoped to the lineage
    // subtree so future obituary/voice-pack consumers can read it without
    // walking back to the agent root. Snapshot determinism: SnapshotSystem
    // uses deepReplace which is schema-tolerant — old saves with no
    // `lineage` field roundtrip into a defaulted shape on read; see Risks
    // R1 in 02d-roleplayer.md for the loadSnapshot guard. Frozen via
    // baseAgent's plain-object pattern.
    lineage: { parents: [], children: [], deathSec: -1 },
    // Work progress tracking
    progress: 0,                      // 0-1 progress toward current action completion
    workRemaining: 0,                 // seconds remaining on current work action
  };
  // Stagger worker hunger so eating behavior appears within 120s scenarios.
  worker.hunger = 0.4 + random() * 0.55;
  worker.hunger = Math.min(1, worker.hunger);
  return worker;
}

export function createVisitor(x, z, kind = VISITOR_KIND.SABOTEUR, random = Math.random) {
  const id = nextId("visitor");
  const groupId = kind === VISITOR_KIND.TRADER ? GROUP_IDS.TRADERS : GROUP_IDS.SABOTEURS;
  // v0.8.2 Round-0 02d-roleplayer (Step 2). Pull the personalised name BEFORE
  // baseAgent() starts consuming random() for velocity/cooldown jitter — same
  // ordering convention as createWorker to keep snapshot determinism stable.
  // Backstory still uses the terse stock string 01e shipped so existing
  // entity-factory.test.js assertions (`"wandering trader"` / `"roaming
  // saboteur"`) continue to pass.
  const visitorName = pickVisitorName(random, kind);
  const displayName = `${visitorName}-${seqFromId(id)}`;
  const backstory = kind === VISITOR_KIND.TRADER
    ? "wandering trader"
    : "roaming saboteur";
  return {
    ...baseAgent(id, ENTITY_TYPE.VISITOR, x, z, displayName, random),
    kind,
    groupId,
    backstory,
  };
}

// v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 6) — per-species HP table.
// Wolf is the standard pack hunter; bear is the rare bruiser; raider_beast is
// the new "raider" archetype that targets workers exclusively. Deer is the
// only herbivore species today (placeholder for future content rounds).
const ANIMAL_SPECIES_HP = Object.freeze({
  [ANIMAL_SPECIES.DEER]: 70,
  [ANIMAL_SPECIES.WOLF]: 80,
  [ANIMAL_SPECIES.BEAR]: 130,
  [ANIMAL_SPECIES.RAIDER_BEAST]: 110,
});

const ANIMAL_SPECIES_LABEL = Object.freeze({
  [ANIMAL_SPECIES.DEER]: "Deer",
  [ANIMAL_SPECIES.WOLF]: "Wolf",
  [ANIMAL_SPECIES.BEAR]: "Bear",
  [ANIMAL_SPECIES.RAIDER_BEAST]: "Raider-beast",
});

function pickPredatorSpecies(random) {
  const weights = BALANCE.predatorSpeciesWeights ?? { wolf: 0.55, bear: 0.30, raider_beast: 0.15 };
  const entries = [
    [ANIMAL_SPECIES.WOLF, Number(weights.wolf ?? 0)],
    [ANIMAL_SPECIES.BEAR, Number(weights.bear ?? 0)],
    [ANIMAL_SPECIES.RAIDER_BEAST, Number(weights.raider_beast ?? 0)],
  ];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return ANIMAL_SPECIES.WOLF;
  let pick = random() * total;
  for (const [species, w] of entries) {
    pick -= Math.max(0, w);
    if (pick <= 0) return species;
  }
  return entries[entries.length - 1][0];
}

export function createAnimal(x, z, kind = ANIMAL_KIND.HERBIVORE, random = Math.random, species = null) {
  const id = nextId("animal");
  // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 6) — species variant.
  // Defaults preserve the legacy two-species behaviour: HERBIVORE → DEER,
  // PREDATOR → weighted random over wolf/bear/raider_beast. Existing
  // call-sites that don't pass a 5th arg still get a working animal back.
  let resolvedSpecies = species;
  if (!resolvedSpecies) {
    if (kind === ANIMAL_KIND.HERBIVORE) {
      resolvedSpecies = ANIMAL_SPECIES.DEER;
    } else if (kind === ANIMAL_KIND.PREDATOR) {
      resolvedSpecies = pickPredatorSpecies(random);
    } else {
      resolvedSpecies = ANIMAL_SPECIES.DEER;
    }
  }
  let hp = Number(ANIMAL_SPECIES_HP[resolvedSpecies] ?? (kind === ANIMAL_KIND.PREDATOR ? 90 : 70));
  // v0.8.3 worker-vs-raider combat — raider_beast attribute randomisation.
  // Wolf/bear stay on the fixed BALANCE values to keep the wildlife loop
  // stable; raiders get an envelope of ±BALANCE.raiderStatsVariance around
  // the base hp so each spawn fights a little differently. The same seeded
  // RNG passed in produces the same stats on replay (determinism contract).
  // Per-instance overrides are stored on the animal so AnimalAISystem can
  // read them even though predator damage/speed still flow through BALANCE
  // for non-raiders.
  let raiderAttackDamage = null;
  let raiderSpeed = null;
  let raiderAttackCooldownSec = null;
  if (resolvedSpecies === ANIMAL_SPECIES.RAIDER_BEAST) {
    const variance = Math.max(0, Number(BALANCE.raiderStatsVariance ?? 0.25));
    const jitter = () => 1 + (random() * 2 - 1) * variance;
    hp = Math.max(20, Math.round(hp * jitter()));
    raiderAttackDamage = Math.max(4, Number((BALANCE.predatorAttackDamage ?? 26) * jitter()).toFixed(2));
    raiderAttackDamage = Number(raiderAttackDamage);
    raiderSpeed = Math.max(0.4, Number((BALANCE.predatorSpeed ?? 2.25) * jitter()).toFixed(3));
    raiderSpeed = Number(raiderSpeed);
    raiderAttackCooldownSec = Math.max(0.5, Number((BALANCE.predatorAttackCooldownSec ?? 1.4) * jitter()).toFixed(3));
    raiderAttackCooldownSec = Number(raiderAttackCooldownSec);
  }
  const speciesLabel = ANIMAL_SPECIES_LABEL[resolvedSpecies]
    ?? (kind === ANIMAL_KIND.PREDATOR ? "Predator" : "Herbivore");
  // v0.8.2 Round-0 01e-innovation (Step 2). Animals get a constant backstory
  // so EntityFocusPanel has consistent content to render for every entity
  // kind (colonist / visitor / animal). Species sub-types extend the per-kind
  // backstory so a Bear reads differently from a Wolf in EntityFocusPanel.
  let backstory;
  if (kind === ANIMAL_KIND.PREDATOR) {
    if (resolvedSpecies === ANIMAL_SPECIES.BEAR) backstory = "lone bruiser";
    else if (resolvedSpecies === ANIMAL_SPECIES.RAIDER_BEAST) backstory = "feral raider";
    else backstory = "lone predator";
  } else {
    backstory = "wild forager";
  }
  return {
    id,
    displayName: withLabel(id, speciesLabel),
    type: ENTITY_TYPE.ANIMAL,
    kind,
    backstory,
    x,
    z,
    vx: (random() - 0.5) * 0.25,
    vz: (random() - 0.5) * 0.25,
    desiredVel: { x: 0, z: 0 },
    hunger: 1,
    hp,
    maxHp: hp,
    alive: true,
    deathReason: "",
    deathSec: -1,
    starvationSec: 0,
    attackCooldownSec: 0,
    stateLabel: "Wander",
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    pathTrafficVersion: 0,
    blackboard: {
      lastFeasibilityReject: null,
    },
    policy: null,
    memory: {
      recentEvents: [],
      migrationTarget: null,
      migrationLabel: "",
      homeTile: null,
      territoryAnchor: null,
      territoryRadius: 0,
      homeZoneId: "",
      homeZoneLabel: "",
    },
    debug: {
      lastIntent: "",
      lastPathLength: 0,
      lastPathRecalcSec: 0,
    },
    groupId: kind === ANIMAL_KIND.PREDATOR ? GROUP_IDS.PREDATORS : GROUP_IDS.HERBIVORES,
    species: resolvedSpecies,
    // v0.8.3 worker-vs-raider combat — raider-only stat overrides. null on
    // wolf/bear/deer (they read BALANCE directly). AnimalAISystem applies
    // these when the species is RAIDER_BEAST.
    raiderAttackDamage,
    raiderSpeed,
    raiderAttackCooldownSec,
  };
}

export function createInitialEntities(grid) {
  return createInitialEntitiesWithRandom(grid, Math.random);
}

function randomTileNearAnchorOfTypes(grid, anchor, radius, targetTypes, random) {
  if (!anchor) return null;
  const candidates = [];
  for (let iz = anchor.iz - radius; iz <= anchor.iz + radius; iz += 1) {
    for (let ix = anchor.ix - radius; ix <= anchor.ix + radius; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      if (Math.abs(ix - anchor.ix) + Math.abs(iz - anchor.iz) > radius) continue;
      const tile = grid.tiles[ix + iz * grid.width];
      if (!targetTypes.includes(tile)) continue;
      candidates.push({ ix, iz });
    }
  }
  if (candidates.length <= 0) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

function assignAnimalHabitat(animal, zone, anchor, spawnTile) {
  animal.memory.homeTile = spawnTile ? { ix: spawnTile.ix, iz: spawnTile.iz } : null;
  animal.memory.territoryAnchor = anchor ? { ix: anchor.ix, iz: anchor.iz } : null;
  animal.memory.territoryRadius = Number(zone?.radius ?? 0);
  animal.memory.homeZoneId = String(zone?.id ?? "");
  animal.memory.homeZoneLabel = String(zone?.label ?? "");
}

export function createDefaultEcologyMetrics() {
  return {
    activeGrazers: 0,
    pressuredFarms: 0,
    maxFarmPressure: 0,
    frontierPredators: 0,
    migrationHerds: 0,
    farmPressureByKey: {},
    hotspotFarms: [],
    herbivoresByZone: {},
    predatorsByZone: {},
    zoneStats: [],
    events: {
      births: 0,
      breedingSpawns: 0,
      recoverySpawns: 0,
      predatorRecoverySpawns: 0,
      predatorRetreats: 0,
      predationDeaths: 0,
      starvationDeaths: 0,
    },
    clusters: {
      maxSameSpeciesClusterSize: 0,
      stuckClusterCount: 0,
      longestClusterDurationSec: 0,
      byGroup: {},
    },
    flags: {
      extinctionRisk: false,
      overgrowthRisk: false,
      clumpingRisk: false,
      predatorWithoutPrey: false,
    },
    summary: "Ecology: idle",
  };
}

export function createDefaultWildlifeRuntime() {
  return {
    zoneControl: {},
    clusterState: {},
    audit: {
      herbivoreZeroSinceSec: null,
      predatorWithoutPreySinceSec: null,
      predatorRetreats: 0,
    },
  };
}

function createInitialEntitiesWithRandom(grid, random, scenario = null) {
  const agents = [];
  const animals = [];
  const wildlifeZones = Array.isArray(scenario?.wildlifeZones) ? scenario.wildlifeZones : [];
  const anchors = scenario?.anchors ?? {};
  const wildlifeRadiusBonus = Number(BALANCE.wildlifeSpawnRadiusBonus ?? 3);

  // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 1+2) — drive initial
  // colonist names with a no-replacement excludeSet so the 13 initial picks
  // never collide on "3 Mose"-type duplicates. Bank size (84) >> 13 so the
  // reroll cap inside pickWorkerName almost never fires for initial pop.
  const initialNameExcludeSet = new Set();
  for (let i = 0; i < INITIAL_POPULATION.workers; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const worker = createWorker(p.x, p.z, random, { excludeSet: initialNameExcludeSet });
    // Only the bare given-name (without numeric suffix / surname) is added —
    // collision check inside pickWorkerName operates on the BANK token.
    const tok = String(worker.displayName ?? "").split(/[\s\-]/)[0];
    if (tok) initialNameExcludeSet.add(tok);
    agents.push(worker);
  }

  for (let i = 0; i < INITIAL_POPULATION.visitors; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.ROAD, TILE.GRASS], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const kind = i % 2 === 0 ? VISITOR_KIND.TRADER : VISITOR_KIND.SABOTEUR;
    agents.push(createVisitor(p.x, p.z, kind, random));
  }

  for (let i = 0; i < INITIAL_POPULATION.herbivores; i += 1) {
    const zone = wildlifeZones.length > 0 ? wildlifeZones[i % wildlifeZones.length] : null;
    const anchor = zone ? anchors[zone.anchor] : null;
    const tile = randomTileNearAnchorOfTypes(
      grid,
      anchor,
      Math.max(2, Number(zone?.radius ?? 2) + wildlifeRadiusBonus),
      [TILE.GRASS, TILE.FARM],
      random,
    ) ?? randomTileOfTypes(grid, [TILE.GRASS, TILE.FARM], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const animal = createAnimal(p.x, p.z, ANIMAL_KIND.HERBIVORE, random);
    assignAnimalHabitat(animal, zone, anchor, tile);
    animals.push(animal);
  }

  for (let i = 0; i < INITIAL_POPULATION.predators; i += 1) {
    const zone = wildlifeZones.length > 0 ? wildlifeZones[i % wildlifeZones.length] : null;
    const anchor = zone ? anchors[zone.anchor] : null;
    const tile = randomTileNearAnchorOfTypes(
      grid,
      anchor,
      Math.max(2, Number(zone?.radius ?? 2) + wildlifeRadiusBonus),
      [TILE.GRASS, TILE.LUMBER, TILE.RUINS, TILE.FARM],
      random,
    ) ?? randomTileOfTypes(grid, [TILE.GRASS, TILE.LUMBER, TILE.RUINS], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const animal = createAnimal(p.x, p.z, ANIMAL_KIND.PREDATOR, random);
    assignAnimalHabitat(animal, zone, anchor, tile);
    animals.push(animal);
  }

  return { agents, animals };
}

/**
 * @returns {import("../app/types.js").GameState}
 */
export function createInitialGameState(options = {}) {
  const templateId = options.templateId ?? DEFAULT_MAP_TEMPLATE_ID;
  const seed = options.seed ?? 1337;
  const terrainTuning = options.terrainTuning ?? {};
  const grid = createInitialGrid({ templateId, seed, terrainTuning, width: options.width, height: options.height });
  // v0.8.0 Phase 3 M1a: seed resource nodes (forest / stone / herb) across
  // eligible GRASS tiles before scenario stamping. Uses a deterministic RNG
  // derived from the grid seed so benchmark runs stay reproducible.
  const nodeRng = createDeterministicRandom(grid.seed ^ 0xa1a1a1a1);
  seedResourceNodes(grid, nodeRng);
  const scenarioBundle = buildScenarioBundle(grid);
  const templateMeta = describeMapTemplate(grid.templateId);
  const random = createDeterministicRandom(grid.seed);
  const { agents, animals } = createInitialEntitiesWithRandom(grid, random, scenarioBundle.scenario);
  const roads = countTilesByType(grid, [TILE.ROAD]);
  const farms = countTilesByType(grid, [TILE.FARM]);
  const lumbers = countTilesByType(grid, [TILE.LUMBER]);
  const warehouses = countTilesByType(grid, [TILE.WAREHOUSE]);
  const walls = countTilesByType(grid, [TILE.WALL]);
  const water = countTilesByType(grid, [TILE.WATER]);
  const grass = countTilesByType(grid, [TILE.GRASS]);
  const ruins = countTilesByType(grid, [TILE.RUINS]);
  const passable = roads + farms + lumbers + warehouses + grass + ruins;

  return {
    grid,
    session: {
      phase: "menu",
      outcome: "none",
      reason: "",
      endedAtSec: -1,
    },
    world: {
      mapTemplateId: grid.templateId,
      mapTemplateName: templateMeta.name,
      mapSeed: grid.seed,
      terrainTuning: grid.terrainTuning,
    },
    resources: {
      food: ALPHA_START_RESOURCES.food,
      wood: ALPHA_START_RESOURCES.wood,
      stone: ALPHA_START_RESOURCES.stone,
      herbs: 0,
      meals: 0,
      medicine: 0,
      tools: 0,
    },
    agents,
    animals,
    buildings: rebuildBuildingStats(grid),
    events: {
      queue: [],
      active: [],
    },
    weather: {
      current: "clear",
      timeLeftSec: 30,
      moveCostMultiplier: 1,
      farmProductionMultiplier: 1,
      lumberProductionMultiplier: 1,
      source: "default",
      hazardTiles: [],
      hazardTileSet: new Set(),
      hazardPenaltyMultiplier: 1,
      hazardPenaltyByKey: {},
      hazardLabelByKey: {},
      hazardFronts: [],
      hazardFocusSummary: "",
      pressureScore: 0,
      hazardLabel: "clear",
    },
    metrics: {
      timeSec: 0,
      tick: 0,
      frameMs: 0,
      frameCount: 0,
      renderFrameCount: 0,
      averageFps: 60,
      benchmarkStatus: "idle",
      benchmarkCsvReady: false,
      benchmarkLastRun: null,
      simDt: 0,
      simStepsThisFrame: 0,
      rawFrameMs: 0,
      observedFps: 60,
      timeScaleActualWall: 1,
      performance: createPerformanceTelemetry(),
      performanceCap: {
        active: false,
        reason: "",
        targetScale: 1,
        actualScale: 1,
        effectiveMaxSteps: 12,
        fixedStepSec: 1 / 30,
      },
      simCostMs: 0,
      simCpuFrameMs: 0,
      isDebugStepping: false,
      warnings: [],
      warningLog: [],
      resourceEmptySec: {
        food: 0,
        wood: 0,
      },
      memoryMb: 0,
      cpuBudgetMs: 0,
      uiCpuMs: 0,
      renderCpuMs: 0,
      aiLatencyMs: 0,
      proxyHealth: "unknown",
      proxyHasApiKey: false,
      proxyModel: "",
      proxyLastCheckSec: -999,
      aiRuntime: createDefaultAiRuntimeStats(),
      regressionFlags: [],
      deathsTotal: 0,
      deathsByReason: {
        starvation: 0,
        predation: 0,
        event: 0,
      },
      deathsByGroup: {},
      // v0.8.0 Phase 4 — Survival Mode. Running score on state.metrics.
      // `survivalScore` accrues +survivalScorePerSecond each in-game second,
      // +survivalScorePerBirth per birth, -survivalScorePenaltyPerDeath per
      // death. `birthsTotal` is a monotonic counter bumped by
      // PopulationGrowthSystem on each spawn; `survivalLastBirthsSeen` and
      // `survivalLastDeathsSeen` are cursors so ProgressionSystem diffs
      // exactly once per event (silent-failure C2 fix: timestamp cursor
      // dropped births that collided on the same integer timeSec).
      survivalScore: 0,
      birthsTotal: 0,
      lastBirthGameSec: -1,
      survivalLastBirthsSeen: 0,
      survivalLastDeathsSeen: 0,
      invalidTransitionCount: 0,
      idleWithoutReasonSec: {},
      pathRecalcPerEntityPerMin: 0,
      goalFlipCount: 0,
      avgGoalFlipPerEntity: 0,
      deliverWithoutCarryCount: 0,
      feasibilityRejectCountByGroup: {},
      starvationRiskCount: 0,
      deathByReasonAndReachability: {},
      ecologyPendingDeaths: {
        predation: 0,
        starvation: 0,
        event: 0,
      },
      logistics: {
        carryingWorkers: 0,
        totalCarryInTransit: 0,
        avgDepotDistance: 0,
        strandedCarryWorkers: 0,
        overloadedWarehouses: 0,
        busiestWarehouseLoad: 0,
        stretchedWorksites: 0,
        isolatedWorksites: 0,
        warehouseLoadByKey: {},
        summary: "Logistics: idle",
      },
      ecology: createDefaultEcologyMetrics(),
      spatialPressure: {
        weatherPressure: 0,
        eventPressure: 0,
        contestedZones: 0,
        contestedTiles: 0,
        activeEventCount: 0,
        peakEventSeverity: 0,
        summary: "Spatial pressure: idle",
      },
    },
    ai: {
      enabled: false,
      coverageTarget: "fallback",
      runtimeProfile: "default",
      manualModeLocked: false,
      mode: "fallback",
      lastError: "",
      lastEnvironmentError: "",
      lastPolicyError: "",
      lastEnvironmentDecisionSec: -999,
      lastPolicyDecisionSec: -999,
      lastEnvironmentResultSec: -999,
      lastPolicyResultSec: -999,
      lastEnvironmentSource: "none",
      lastPolicySource: "none",
      environmentDecisionCount: 0,
      policyDecisionCount: 0,
      environmentLlmCount: 0,
      policyLlmCount: 0,
      groupPolicies: new Map(),
      lastEnvironmentDirective: null,
      lastPolicyBatch: [],
      lastEnvironmentModel: "",
      lastPolicyModel: "",
      lastEnvironmentExchange: null,
      lastPolicyExchange: null,
      lastPolicyExchangeByGroup: {},
      policyExchanges: [],
      environmentExchanges: [],
      // v0.8.2 Round-5b Wave-1 (01e Step 2) — bounded ring of policy-change
      // records (32 entries). Populated by NPCBrainSystem.update on
      // focus/source flips; consumed by AIPolicyTimelinePanel (read-only).
      policyHistory: [],
      groupStateTargets: new Map(),
      lastStateTargetBatch: [],
    },
    debug: {
      selectedTile: null,
      systemTimingsMs: {},
      astar: {
        requests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        success: 0,
        fail: 0,
        avgDurationMs: 0,
        avgPathLength: 0,
        lastDurationMs: 0,
        lastPathLength: 0,
        lastFrom: null,
        lastTo: null,
      },
      boids: {
        entities: 0,
        avgNeighbors: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        congestionHotspots: 0,
        peakTileLoad: 0,
        peakPenalty: 1,
        trafficVersion: 0,
      },
      traffic: {
        version: 0,
        activeLaneCount: 0,
        hotspotCount: 0,
        peakLoad: 0,
        avgLoad: 0,
        peakPenalty: 1,
        loadByKey: {},
        penaltyByKey: {},
        hotspotTiles: [],
        summary: "Traffic: unavailable",
      },
      renderMode: "detailed",
      renderEntityCount: agents.length + animals.length,
      renderModelDisableThreshold: 260,
      renderPixelRatio: Math.min(1.4, (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1),
      visualAssetPack: "unloaded",
      tileTexturesLoaded: false,
      iconAtlasLoaded: false,
      unitSpriteLoaded: false,
      rng: { initialSeed: 0, state: 0, calls: 0 },
      aiTrace: [],
      eventTrace: [],
      presetComparison: [],
      roadCount: roads,
      gridStats: {
        roads,
        farms,
        lumbers,
        warehouses,
        walls,
        water,
        grass,
        ruins,
        emptyBaseTiles: grid.emptyBaseTiles ?? 0,
        passableRatio: passable / grid.tiles.length,
      },
      logic: {
        invalidTransitions: 0,
        goalFlipCount: 0,
        totalPathRecalcs: 0,
        idleWithoutReasonSecByGroup: {},
        pathRecalcByEntity: {},
        lastGoalsByEntity: {},
        deathByReasonAndReachability: {},
      },
    },
    gameplay: {
      doctrine: "balanced",
      doctrineMastery: 1,
      modifiers: {
        farmYield: 1,
        lumberYield: 1,
        tradeYield: 1,
        sabotageResistance: 1,
        threatDamp: 1,
        farmBias: 0,
        logisticsWarehouseScale: 1,
        logisticsFarmScale: 1,
        logisticsLumberScale: 1,
        logisticsRoadScale: 1,
        logisticsWallScale: 1,
        stockpileFoodScale: 1,
        stockpileWoodScale: 1,
        stockpileProsperityFloor: 36,
        stabilityWallScale: 1,
        stabilityHoldScale: 1,
        stabilityProsperityOffset: 0,
        stabilityThreatOffset: 0,
        recoveryFood: 12,
        recoveryWood: 10,
        recoveryThreatRelief: 8,
        recoveryProsperityBoost: 6,
      },
      prosperity: 35,
      threat: 25,
      objectiveIndex: 0,
      scenario: scenarioBundle.scenario,
      wildlifeRuntime: createDefaultWildlifeRuntime(),
      objectives: scenarioBundle.objectives,
      recovery: {
        charges: 1,
        activeBoostSec: 0,
        lastTriggerSec: -Infinity,
        collapseRisk: 0,
        lastReason: "",
      },
      objectiveHint: scenarioBundle.objectiveHint,
      objectiveLog: [],
      milestonesSeen: [],
      milestoneBaseline: {
        warehouses,
        farms,
        lumbers,
        kitchens: 0,
        meals: 0,
        tools: 0,
      },
      // v0.8.0 Phase 4 — DevIndex system fields. Initialised to zero so tests
      // that skip DevIndexSystem.update() can still safely read these fields.
      // See `src/simulation/meta/DevIndexSystem.js` for the live contract.
      devIndex: 0,
      devIndexSmoothed: 0,
      devIndexDims: {
        population: 0,
        economy: 0,
        infrastructure: 0,
        production: 0,
        defense: 0,
        resilience: 0,
      },
      devIndexHistory: [],
      // v0.8.0 Phase 4 — RaidEscalator bundle. Initialised to tier-0 baseline so
      // WorldEventSystem has safe defaults even when RaidEscalatorSystem has
      // not yet run (e.g. tests that skip the meta systems). See
      // `src/simulation/meta/RaidEscalatorSystem.js` for the live contract.
      raidEscalation: {
        tier: 0,
        intervalTicks: 3600,
        intensityMultiplier: 1,
        devIndexSample: 0,
      },
      lastRaidTick: -9999,
    },
    ui: {
      // v0.8.2 Round-5b (02e Step 3) — scenario switch intro overlay payload.
      // Written by GameApp.regenerateWorld after deepReplace; null when inactive.
      // enteredAtMs is performance.now() at switch time; expires after durationMs.
      scenarioIntro: null,
    },
    controls: {
      farmRatio: 0.5,
      // v0.8.2 Round-1 02a-rimworld-veteran — expose the previously hardcoded
      // role slot counts (cook/smith/herbalist/haul/stone/herbs) so players can
      // override fallback planner's blind spots via UI sliders.
      //
      // v0.8.2 Round-5 Wave-1 (02a Step 6): the default "1 per type" acted as
      // a hard upper bound and starved meal/haul pipelines in populations > 8.
      // Sentinel 99 = "unlimited"; the pop-scaled formula in
      // RoleAssignmentSystem (via BALANCE.roleQuotaScaling) dominates and
      // BuildToolbar sliders still let players compress the cap back to 1-5.
      // Snapshot migration (old cook:1 → 99) lives in loadSnapshot — see
      // src/simulation/meta/SnapshotSystem.js.
      roleQuotas: { cook: 99, smith: 99, herbalist: 99, haul: 99, stone: 99, herbs: 99 },
      selectedEntityId: null,
      selectedTile: null,
      // v0.8.2 Round-5 Wave-2 (01a-onboarding Step 1): default tool is now
      // "select" so the first canvas click on a worker inspects instead of
      // dropping a road tile under the worker. Restores the P0-2 observation
      // loop contract ("Click any worker/visitor/animal to inspect it").
      // Road / other build tools are still one keystroke away (number keys).
      tool: "select",
      stressExtraWorkers: 0,
      populationTargets: {
        workers: agents.filter((a) => a.type === ENTITY_TYPE.WORKER).length,
        traders: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR && (a.kind === VISITOR_KIND.TRADER || a.groupId === GROUP_IDS.TRADERS)).length,
        saboteurs: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR && !(a.kind === VISITOR_KIND.TRADER || a.groupId === GROUP_IDS.TRADERS)).length,
        herbivores: animals.filter((a) => a.kind === ANIMAL_KIND.HERBIVORE).length,
        predators: animals.filter((a) => a.kind === ANIMAL_KIND.PREDATOR).length,
        visitors: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR).length,
      },
      populationBreakdown: {
        baseWorkers: agents.filter((a) => a.type === ENTITY_TYPE.WORKER).length,
        stressWorkers: 0,
        totalWorkers: agents.filter((a) => a.type === ENTITY_TYPE.WORKER).length,
        totalEntities: agents.length + animals.length,
      },
      saveSlotId: "default",
      canUndo: false,
      canRedo: false,
      buildPreview: null,
      showReplayPanel: false,
      showPresetComparator: false,
      undoStack: [],
      redoStack: [],
      isPaused: false,
      stepFramesPending: 0,
      timeScale: 1,
      fixedStepSec: 1 / 30,
      cameraMinZoom: 0.55,
      cameraMaxZoom: 3.2,
      renderModelDisableThreshold: 260,
      benchmarkConfig: {
        schedule: [0, 100, 200, 300, 400, 500],
        stageDurationSec: 4,
        sampleStartSec: 1.2,
      },
      visualPreset: "flat_worldsim",
      showTileIcons: true,
      showUnitSprites: true,
      display: { ...DEFAULT_DISPLAY_SETTINGS },
      mapTemplateId: grid.templateId,
      mapSeed: grid.seed,
      terrainTuning: { ...(grid.terrainTuning ?? {}) },
      doctrine: "balanced",
      actionMessage: "Ready",
      actionKind: "info",
      // v0.8.2 Round0 02b-casual — UI profile gate. "casual" (default for
      // first-time players) hides developer-only visualisations and the
      // engineering-heavy EntityFocusPanel regions; "full" restores the
      // debug-era HUD. Runtime is wired in GameApp.#applyUiProfile via
      // body.casual-mode (orthogonal to body.dev-mode from 01c-ui).
      uiProfile: "casual",
    },
  };
}
