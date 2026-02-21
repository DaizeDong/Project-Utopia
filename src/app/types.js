/**
 * @typedef {{ix:number, iz:number}} TileCoord
 *
 * @typedef {{
 *  id: string,
 *  type: "WORKER"|"VISITOR",
 *  kind?: string,
 *  role?: string,
 *  x: number,
 *  z: number,
 *  vx: number,
 *  vz: number,
 *  hunger: number,
 *  stamina: number,
 *  carry: {food:number, wood:number},
 *  stateLabel: string,
 *  cooldown: number,
 *  sabotageCooldown: number,
 *  targetTile: TileCoord|null,
 *  path: TileCoord[]|null,
 *  pathIndex: number,
 *  blackboard: Record<string, unknown>,
 *  policy: Record<string, unknown>|null,
 *  memory: {recentEvents:string[], dangerTiles: TileCoord[]}
 * }} AgentState
 *
 * @typedef {{
 *  id: string,
 *  type: "ANIMAL",
 *  kind: "HERBIVORE"|"PREDATOR",
 *  x: number,
 *  z: number,
 *  vx: number,
 *  vz: number,
 *  stateLabel: string,
 *  targetTile: TileCoord|null,
 *  path: TileCoord[]|null,
 *  pathIndex: number,
 *  policy: Record<string, unknown>|null,
 *  memory: {recentEvents:string[]}
 * }} AnimalState
 *
 * @typedef {{
 *  width: number,
 *  height: number,
 *  tileSize: number,
 *  tiles: Uint8Array,
 *  version: number
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
 *  warnings: string[]
 * }} MetricsState
 *
 * @typedef {{
 *  enabled: boolean,
 *  mode: "fallback"|"llm",
 *  lastError: string,
 *  lastEnvironmentDecisionSec: number,
 *  lastPolicyDecisionSec: number,
 *  groupPolicies: Map<string, {expiresAtSec:number, data:Record<string, unknown>}>
 * }} AIState
 *
 * @typedef {{
 *  farmRatio: number,
 *  selectedEntityId: string | null,
 *  tool: "road"|"farm"|"lumber"|"warehouse"|"wall"|"erase"
 * }} ControlState
 *
 * @typedef {{
 *  grid: GridState,
 *  resources: ResourceState,
 *  agents: AgentState[],
 *  animals: AnimalState[],
 *  buildings: {warehouses:number, farms:number, lumbers:number, walls:number},
 *  events: {queue: WorldEventState[], active: WorldEventState[]},
 *  weather: WeatherState,
 *  metrics: MetricsState,
 *  ai: AIState,
 *  controls: ControlState
 * }} GameState
 */

export {};
