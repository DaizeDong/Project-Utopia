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
 *  pathTrafficVersion?: number,
 *  blackboard: Record<string, unknown> & {
 *    taskLock?: {state:string, untilSec:number},
 *    emergencyRationCooldownSec?: number,
 *    lastFeasibilityReject?: {source:string, requestedState:string, reason:string, simSec:number}
 *  },
 *  policy: Record<string, unknown>|null,
 *  alive?: boolean,
 *  hp?: number,
 *  maxHp?: number,
 *  deathReason?: "starvation"|"predation"|"event"|string,
 *  deathSec?: number,
 *  starvationSec?: number,
 *  attackCooldownSec?: number,
 *  memory: {recentEvents:string[], dangerTiles: TileCoord[]},
 *  debug: {
 *    lastIntent:string,
 *    lastPathLength:number,
 *    lastPathRecalcSec:number,
 *    policyRejectedReason?: string,
 *    aiRejectedReason?: string,
 *    finalDesiredState?: string,
 *    feasibilityReject?: {source:string, requestedState:string, reason:string, simSec:number}
 *  }
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
 *  pathTrafficVersion?: number,
 *  policy: Record<string, unknown>|null,
 *  hunger?: number,
 *  alive?: boolean,
 *  hp?: number,
 *  maxHp?: number,
 *  deathReason?: "starvation"|"predation"|"event"|string,
 *  deathSec?: number,
 *  starvationSec?: number,
 *  attackCooldownSec?: number,
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
 *  proxyHasApiKey?: boolean,
 *  proxyModel?: string,
 *  proxyLastCheckSec?: number,
 *  regressionFlags?: string[],
 *  populationStats?: {workers:number, baseWorkers:number, stressWorkers:number, visitors:number, traders:number, saboteurs:number, herbivores:number, predators:number, farmers:number, loggers:number, totalEntities:number}
 *  deathsTotal?: number,
 *  deathsByReason?: Record<string, number>,
 *  deathsByGroup?: Record<string, number>
 *  invalidTransitionCount?: number,
 *  idleWithoutReasonSec?: Record<string, number>,
 *  pathRecalcPerEntityPerMin?: number,
 *  goalFlipCount?: number,
 *  avgGoalFlipPerEntity?: number,
 *  deliverWithoutCarryCount?: number,
 *  feasibilityRejectCountByGroup?: Record<string, number>,
 *  starvationRiskCount?: number,
 *  deathByReasonAndReachability?: Record<string, number>,
 *  logistics?: {
 *    carryingWorkers: number,
 *    totalCarryInTransit: number,
 *    avgDepotDistance: number,
 *    strandedCarryWorkers: number,
 *    overloadedWarehouses: number,
 *    busiestWarehouseLoad: number,
 *    stretchedWorksites: number,
 *    isolatedWorksites: number,
 *    warehouseLoadByKey?: Record<string, number>,
 *    summary?: string
 *  },
 *  traffic?: {
 *    version: number,
 *    activeLaneCount: number,
 *    hotspotCount: number,
 *    peakLoad: number,
 *    avgLoad: number,
 *    peakPenalty: number,
 *    loadByKey?: Record<string, number>,
 *    penaltyByKey?: Record<string, number>,
 *    hotspotTiles?: Array<{ix:number, iz:number, load:number, penalty:number}>,
 *    summary?: string
 *  }
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
 *  groupPolicies: Map<string, {expiresAtSec:number, data:Record<string, unknown>}>,
 *  lastEnvironmentDirective?: Record<string, unknown>|null,
 *  lastPolicyBatch?: Array<Record<string, unknown>>,
 *  lastEnvironmentModel?: string,
 *  lastPolicyModel?: string,
 *  lastEnvironmentExchange?: Record<string, unknown>|null,
 *  lastPolicyExchange?: Record<string, unknown>|null,
 *  lastPolicyExchangeByGroup?: Record<string, Record<string, unknown>>,
 *  policyExchanges?: Array<Record<string, unknown>>,
 *  environmentExchanges?: Array<Record<string, unknown>>,
 *  groupStateTargets?: Map<string, {targetState:string, expiresAtSec:number, priority:number, source:"llm"|"fallback", reason:string}>,
 *  lastStateTargetBatch?: Array<Record<string, unknown>>
 * }} AIState
 *
 * @typedef {{
 *  selectedTile: SelectedTileState|null,
 *  systemTimingsMs: Record<string, {last:number, avg:number, peak:number}>,
 *  astar: Record<string, unknown>,
 *  boids: Record<string, unknown>,
 *  traffic?: Record<string, unknown>,
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
 *  gridStats?: Record<string, number>,
 *  logic?: {
 *    invalidTransitions: number,
 *    goalFlipCount: number,
 *    totalPathRecalcs: number,
 *    idleWithoutReasonSecByGroup: Record<string, number>,
 *    pathRecalcByEntity: Record<string, number>,
 *    lastGoalsByEntity: Record<string, string>,
 *    deathByReasonAndReachability: Record<string, number>
 *  }
 * }} DebugState
 *
 * @typedef {{
 *  phase: "menu"|"active"|"end",
 *  outcome: "none"|"win"|"loss",
 *  reason: string,
 *  endedAtSec: number
 * }} SessionState
 *
 * @typedef {{
 *  id: string,
 *  family: string,
 *  title: string,
 *  summary: string,
 *  anchors: Record<string, {ix:number, iz:number}>,
 *  routeLinks?: Array<{id:string, label:string, from:string, to:string, gapTiles:Array<{ix:number, iz:number}>, radius?:number, hint?:string}>,
 *  depotZones?: Array<{id:string, label:string, anchor:string, radius?:number, hint?:string}>,
 *  chokePoints?: Array<{id:string, label:string, anchor:string, radius?:number}>,
 *  wildlifeZones?: Array<{id:string, label:string, anchor:string, radius?:number}>,
 *  targets?: {
 *    logistics?: {warehouses:number, farms:number, lumbers:number, roads:number, walls:number},
 *    stockpile?: {food:number, wood:number},
 *    stability?: {walls:number, prosperity:number, threat:number, holdSec:number}
 *  },
 *  objectiveCopy?: Record<string, string>,
 *  hintCopy?: Record<string, string>
 * }} ScenarioState
 *
 * @typedef {{
 *  doctrine: string,
 *  doctrineMastery?: number,
 *  modifiers: Record<string, number>,
 *  prosperity: number,
 *  threat: number,
 *  objectiveIndex: number,
 *  scenario?: ScenarioState,
 *  objectives: Array<{id:string,title:string,description:string,completed:boolean,progress:number,reward:string}>,
 *  objectiveHoldSec: number,
 *  recovery?: {
 *    charges:number,
 *    activeBoostSec:number,
 *    lastTriggerSec:number,
 *    collapseRisk:number,
 *    lastReason:string
 *  },
 *  objectiveHint?: string,
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
 *  populationTargets: {workers:number, traders:number, saboteurs:number, herbivores:number, predators:number, visitors:number},
 *  populationBreakdown?: {baseWorkers:number, stressWorkers:number, totalWorkers:number, totalEntities:number},
 *  saveSlotId?: string,
 *  canUndo?: boolean,
 *  canRedo?: boolean,
 *  buildPreview?: {
 *    ok:boolean,
 *    tool:string,
 *    ix:number,
 *    iz:number,
 *    summary?:string,
 *    reason?:string,
 *    reasonText?:string,
 *    effects?: string[],
 *    warnings?: string[],
 *    cost?: {food?:number, wood?:number},
 *    refund?: {food?:number, wood?:number}
 *  } | null,
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
 *  session: SessionState,
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
