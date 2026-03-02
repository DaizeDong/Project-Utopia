/**
 * @typedef {{ix:number, iz:number}} TileCoord
 *
 * @typedef {{x:number, z:number}} Vec2
 *
 * @typedef {{
 *  ix:number,
 *  iz:number,
 *  type:number,
 *  typeName:string,
 *  passable:boolean,
 *  baseCost:number,
 *  height:number,
 *  gridVersion:number
 * }} SelectedTileState
 *
 * @typedef {{
 *  id: string,
 *  displayName: string,
 *  type: "WORKER"|"VISITOR",
 *  kind?: string,
 *  role?: string,
 *  groupId?: string,
 *  x: number,
 *  z: number,
 *  vx: number,
 *  vz: number,
 *  desiredVel: Vec2,
 *  hunger: number,
 *  stamina: number,
 *  carry: {food:number, wood:number},
 *  stateLabel: string,
 *  cooldown: number,
 *  sabotageCooldown: number,
 *  targetTile: TileCoord|null,
 *  path: TileCoord[]|null,
 *  pathIndex: number,
 *  pathGridVersion: number,
 *  blackboard: Record<string, unknown>,
 *  policy: Record<string, unknown>|null,
 *  memory: {recentEvents:string[], dangerTiles: TileCoord[]},
 *  debug: {lastIntent:string, lastPathLength:number, lastPathRecalcSec:number}
 * }} AgentState
 *
 * @typedef {{
 *  id: string,
 *  displayName: string,
 *  type: "ANIMAL",
 *  kind: "HERBIVORE"|"PREDATOR",
 *  groupId?: string,
 *  x: number,
 *  z: number,
 *  vx: number,
 *  vz: number,
 *  desiredVel: Vec2,
 *  stateLabel: string,
 *  targetTile: TileCoord|null,
 *  path: TileCoord[]|null,
 *  pathIndex: number,
 *  pathGridVersion: number,
 *  policy: Record<string, unknown>|null,
 *  memory: {recentEvents:string[]},
 *  debug: {lastIntent:string, lastPathLength:number, lastPathRecalcSec:number}
 * }} AnimalState
 *
 * @typedef {{
 *  width: number,
 *  height: number,
 *  tileSize: number,
 *  tiles: Uint8Array,
 *  version: number,
 *  templateId?: string,
 *  seed?: number,
 *  terrainTuning?: Record<string, unknown>,
 *  emptyBaseTiles?: number
 * }} GridState
 *
 * @typedef {{
 *  id:string,
 *  type:string,
 *  status:"prepare"|"active"|"resolve"|"cooldown",
 *  elapsedSec:number,
 *  durationSec:number,
 *  intensity:number,
 *  payload:Record<string, unknown>
 * }} WorldEventState
 *
 * @typedef {{
 *  current: string,
 *  timeLeftSec: number,
 *  moveCostMultiplier: number,
 *  farmProductionMultiplier: number,
 *  lumberProductionMultiplier: number,
 *  source: "default"|"event"|"directive"
 * }} WeatherState
 *
 * @typedef {{
 *  food: number,
 *  wood: number
 * }} ResourceState
 *
 * @typedef {{
 *  timeSec: number,
 *  tick: number,
 *  frameMs: number,
 *  frameCount: number,
 *  averageFps: number,
 *  benchmarkStatus: string,
 *  benchmarkCsvReady: boolean,
 *  simDt: number,
 *  simStepsThisFrame: number,
 *  simCostMs?: number,
 *  isDebugStepping: boolean,
 *  warnings: string[],
 *  warningLog?: Array<{id:string, sec:number, level:string, source:string, message:string}>,
 *  memoryMb?: number,
 *  cpuBudgetMs?: number,
 *  uiCpuMs?: number,
 *  renderCpuMs?: number,
 *  aiLatencyMs?: number,
 *  proxyHealth?: "unknown"|"up"|"down",
 *  regressionFlags?: string[],
 *  populationStats?: {workers:number, baseWorkers:number, stressWorkers:number, visitors:number, herbivores:number, predators:number, farmers:number, loggers:number, totalEntities:number}
 * }} MetricsState
 *
 * @typedef {{
 *  enabled: boolean,
 *  mode: "fallback"|"llm",
 *  lastError: string,
 *  lastEnvironmentError: string,
 *  lastPolicyError: string,
 *  lastEnvironmentDecisionSec: number,
 *  lastPolicyDecisionSec: number,
 *  lastEnvironmentResultSec: number,
 *  lastPolicyResultSec: number,
 *  lastEnvironmentSource: "none"|"fallback"|"llm",
 *  lastPolicySource: "none"|"fallback"|"llm",
 *  environmentDecisionCount: number,
 *  policyDecisionCount: number,
 *  environmentLlmCount: number,
 *  policyLlmCount: number,
 *  groupPolicies: Map<string, {expiresAtSec:number, data:Record<string, unknown>}>
 * }} AIState
 *
 * @typedef {{
 *  selectedTile: SelectedTileState|null,
 *  systemTimingsMs: Record<string, {last:number, avg:number, peak:number}>,
 *  astar: Record<string, unknown>,
 *  boids: Record<string, unknown>,
 *  renderMode?: "detailed"|"fast"|"sprites",
 *  renderEntityCount?: number,
 *  renderModelDisableThreshold?: number,
 *  renderPixelRatio?: number,
 *  visualAssetPack?: string,
 *  tileTexturesLoaded?: boolean,
 *  iconAtlasLoaded?: boolean,
 *  unitSpriteLoaded?: boolean,
 *  aiTrace: Array<Record<string, unknown>>,
 *  eventTrace: Array<Record<string, unknown>>,
 *  rng?: {initialSeed:number, state:number, calls:number},
 *  presetComparison?: Array<Record<string, unknown>>,
 *  roadCount?: number,
 *  gridStats?: Record<string, number>
 * }} DebugState
 *
 * @typedef {{
 *  doctrine: string,
 *  modifiers: Record<string, number>,
 *  prosperity: number,
 *  threat: number,
 *  objectiveIndex: number,
 *  objectives: Array<{id:string,title:string,description:string,completed:boolean,progress:number,reward:string}>,
 *  objectiveHoldSec: number,
 *  objectiveLog: string[]
 * }} GameplayState
 *
 * @typedef {{
 *  mapTemplateId: string,
 *  mapTemplateName: string,
 *  mapSeed: number|string,
 *  terrainTuning?: Record<string, unknown>
 * }} WorldState
 *
 * @typedef {{
 *  farmRatio: number,
 *  selectedEntityId: string | null,
 *  selectedTile: SelectedTileState | null,
 *  tool: "road"|"farm"|"lumber"|"warehouse"|"wall"|"erase",
 *  stressExtraWorkers: number,
 *  isPaused: boolean,
 *  stepFramesPending: number,
 *  timeScale: number,
 *  fixedStepSec: number,
 *  cameraMinZoom: number,
 *  cameraMaxZoom: number,
 *  renderModelDisableThreshold: number,
 *  benchmarkConfig: {schedule:number[], stageDurationSec:number, sampleStartSec:number},
 *  visualPreset: "flat_worldsim",
 *  showTileIcons: boolean,
 *  showUnitSprites: boolean,
 *  mapTemplateId: string,
 *  mapSeed: number|string,
 *  terrainTuning: Record<string, unknown>,
 *  populationTargets: {workers:number, visitors:number, herbivores:number, predators:number},
 *  populationBreakdown?: {baseWorkers:number, stressWorkers:number, totalWorkers:number, totalEntities:number},
 *  saveSlotId?: string,
 *  canUndo?: boolean,
 *  canRedo?: boolean,
 *  showReplayPanel?: boolean,
 *  showPresetComparator?: boolean,
 *  undoStack?: Array<Record<string, unknown>>,
 *  redoStack?: Array<Record<string, unknown>>,
 *  doctrine: string,
 *  actionMessage: string,
 *  actionKind: "info"|"success"|"error"
 * }} ControlState
 *
 * @typedef {{
 *  grid: GridState,
 *  world: WorldState,
 *  resources: ResourceState,
 *  agents: AgentState[],
 *  animals: AnimalState[],
 *  buildings: {warehouses:number, farms:number, lumbers:number, walls:number},
 *  events: {queue: WorldEventState[], active: WorldEventState[]},
 *  weather: WeatherState,
 *  metrics: MetricsState,
 *  ai: AIState,
 *  debug: DebugState,
 *  gameplay: GameplayState,
 *  controls: ControlState
 * }} GameState
 */

export {};
