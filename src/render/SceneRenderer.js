import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { TILE_INFO, ENTITY_TYPE, ANIMAL_KIND, TILE, VISITOR_KIND } from "../config/constants.js";
import { tileToWorld, worldToTile, inBounds } from "../world/grid/Grid.js";
import { explainBuildReason } from "../simulation/construction/BuildAdvisor.js";
import { pushWarning } from "../app/warnings.js";
import { deriveAtmosphereProfile } from "./AtmosphereProfile.js";
import { createProceduralTileTexture, resolveTileTextureMode } from "./ProceduralTileTextures.js";
import { buildPressureLens } from "./PressureLens.js";
import { deriveVisualAssetDebugState } from "./visualAssetDebug.js";

const TILE_LABEL = Object.freeze(
  Object.entries(TILE).reduce((acc, [name, value]) => {
    acc[value] = name;
    return acc;
  }, {}),
);

const MAT_TMP = new THREE.Matrix4();
const MAT_Q = new THREE.Quaternion();
const MAT_P = new THREE.Vector3();
const MAT_S = new THREE.Vector3();
const COLOR_TMP = new THREE.Color();
const VEC_TMP = new THREE.Vector3();

function setInstancedMatrix(mesh, index, x, y, z, sx = 1, sy = 1, sz = 1) {
  MAT_P.set(x, y, z);
  MAT_S.set(sx, sy, sz);
  MAT_TMP.compose(MAT_P, MAT_Q, MAT_S);
  mesh.setMatrixAt(index, MAT_TMP);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerpAngle(a, b, t) {
  const full = Math.PI * 2;
  const delta = ((b - a + Math.PI) % full + full) % full - Math.PI;
  return a + delta * t;
}

function createRendererWithFallback(canvas) {
  const attempts = [
    { antialias: true, powerPreference: "high-performance" },
    { antialias: false, powerPreference: "high-performance" },
    { antialias: false, powerPreference: "default" },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, ...attempt });
      return { renderer, attempt };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Unable to initialize WebGL renderer.");
}

const MODEL_LIBRARY = Object.freeze({
  worker: { url: "/assets/models/medieval/worker_man.glb" },
  visitorTrader: { url: "/assets/models/medieval/visitor_trader.glb" },
  visitorSaboteur: { url: "/assets/models/medieval/visitor_saboteur.glb" },
  herbivore: { url: "/assets/models/medieval/herbivore_deer.glb" },
  predator: { url: "/assets/models/medieval/predator_wolf.glb" },
  roadTile: { url: "/assets/models/medieval/tile_road.glb" },
  farmTile: { url: "/assets/models/medieval/tile_farm.glb" },
  lumberTile: { url: "/assets/models/medieval/tile_lumber.glb" },
  warehouseTile: { url: "/assets/models/medieval/tile_warehouse.glb" },
  wallTile: { url: "/assets/models/medieval/tile_wall.glb" },
  ruinsTile: { url: "/assets/models/medieval/tile_ruins.glb" },
});

const ENTITY_MODEL_BINDINGS = Object.freeze({
  worker: {
    scale: 0.8,
    y: 0.018,
    headingOffset: 0,
    shadowRadius: 0.3,
    shadowOpacity: 0.22,
    bobAmp: 0.015,
    idleBobAmp: 0.004,
    leanFactor: 0.03,
  },
  visitorTrader: {
    scale: 0.78,
    y: 0.018,
    headingOffset: 0,
    shadowRadius: 0.3,
    shadowOpacity: 0.22,
    bobAmp: 0.013,
    idleBobAmp: 0.0035,
    leanFactor: 0.028,
  },
  visitorSaboteur: {
    scale: 0.79,
    y: 0.018,
    headingOffset: 0,
    shadowRadius: 0.3,
    shadowOpacity: 0.22,
    bobAmp: 0.013,
    idleBobAmp: 0.0035,
    leanFactor: 0.028,
  },
  herbivore: {
    scale: 0.74,
    y: 0.016,
    headingOffset: 0,
    shadowRadius: 0.34,
    shadowOpacity: 0.24,
    bobAmp: 0.012,
    idleBobAmp: 0.003,
    leanFactor: 0.025,
  },
  predator: {
    scale: 0.76,
    y: 0.016,
    headingOffset: 0,
    shadowRadius: 0.34,
    shadowOpacity: 0.24,
    bobAmp: 0.013,
    idleBobAmp: 0.003,
    leanFactor: 0.027,
  },
});

const TILE_MODEL_BINDINGS = Object.freeze({
  [TILE.ROAD]: { key: "roadTile", scale: { x: 0.95, y: 0.08, z: 0.95 }, y: 0.02, randomYaw: false, autoYaw: true },
  [TILE.FARM]: { key: "farmTile", scale: { x: 0.8, y: 0.62, z: 0.8 }, y: 0.04, randomYaw: true, jitter: 0.08, scaleJitter: 0.08 },
  [TILE.LUMBER]: { key: "lumberTile", scale: { x: 0.82, y: 0.62, z: 0.82 }, y: 0.04, randomYaw: true, jitter: 0.08, scaleJitter: 0.08 },
  [TILE.WAREHOUSE]: { key: "warehouseTile", scale: { x: 0.88, y: 0.88, z: 0.88 }, y: 0.04, randomYaw: true, jitter: 0.05, scaleJitter: 0.05 },
  [TILE.WALL]: { key: "wallTile", scale: { x: 0.95, y: 0.46, z: 0.26 }, y: 0.03, randomYaw: false, autoYaw: true },
  [TILE.RUINS]: { key: "ruinsTile", scale: { x: 0.68, y: 0.42, z: 0.68 }, y: 0.04, randomYaw: true, jitter: 0.1, scaleJitter: 0.12 },
});

const WORLD_SIM_MANIFEST_URL = "/assets/worldsim/asset-manifest.json";
const TILE_ICON_SCALE = 0.34;
const TILE_ICON_Y = 0.24;
const TILE_ICON_BASE_OPACITY = 0.8;
const TILE_ICON_FADE_START_ZOOM = 0.92;
const TILE_ICON_FADE_FULL_ZOOM = 1.18;
const TILE_BORDER_BASE_OPACITY = 0.24;
const TILE_BORDER_FADE_START_ZOOM = 0.78;
const TILE_BORDER_FADE_FULL_ZOOM = 1.1;
const TILE_ICON_TYPES = Object.freeze({
  [TILE.ROAD]: "ROAD",
  [TILE.FARM]: "FARM",
  [TILE.LUMBER]: "LUMBER",
  [TILE.WAREHOUSE]: "WAREHOUSE",
  [TILE.WALL]: "WALL",
  [TILE.RUINS]: "RUINS",
  [TILE.WATER]: "WATER",
  [TILE.QUARRY]: "QUARRY",
  [TILE.HERB_GARDEN]: "HERB_GARDEN",
  [TILE.KITCHEN]: "KITCHEN",
  [TILE.SMITHY]: "SMITHY",
  [TILE.CLINIC]: "CLINIC",
  [TILE.BRIDGE]: "BRIDGE",
});

const UNIT_SPRITE_BINDINGS = Object.freeze({
  WORKER: { key: "WORKER", scale: 0.95, y: 0.42, shadowRadius: 0.31, shadowOpacity: 0.26, bobAmp: 0.012, bobIdleAmp: 0.0035 },
  VISITOR: { key: "VISITOR", scale: 0.97, y: 0.42, shadowRadius: 0.33, shadowOpacity: 0.26, bobAmp: 0.012, bobIdleAmp: 0.0035 },
  HERBIVORE: { key: "HERBIVORE", scale: 0.9, y: 0.36, shadowRadius: 0.3, shadowOpacity: 0.24, bobAmp: 0.011, bobIdleAmp: 0.003 },
  PREDATOR: { key: "PREDATOR", scale: 1.02, y: 0.4, shadowRadius: 0.35, shadowOpacity: 0.28, bobAmp: 0.012, bobIdleAmp: 0.0032 },
});

const TILE_TEXTURE_BINDINGS = Object.freeze({
  [TILE.GRASS]: { key: "grass", tint: 0xa8d98b, repeatX: 12, repeatY: 12, roughness: 0.97, emissive: 0x183b1a, emissiveIntensity: 0.08 },
  [TILE.ROAD]: { key: "road", tint: 0xdfc7a7, repeatX: 10, repeatY: 10, roughness: 0.94, emissive: 0x3f2e21, emissiveIntensity: 0.05 },
  [TILE.FARM]: { key: "plants", tint: 0xe4cb72, repeatX: 10, repeatY: 10, roughness: 0.95, emissive: 0x4c3f19, emissiveIntensity: 0.07 },
  [TILE.LUMBER]: { key: "plants", tint: 0x9fcf7f, repeatX: 9, repeatY: 9, roughness: 0.95, emissive: 0x1f3d1f, emissiveIntensity: 0.07 },
  [TILE.WAREHOUSE]: { key: "structure", tint: 0xd59f74, repeatX: 8, repeatY: 8, roughness: 0.9, emissive: 0x4b2a1d, emissiveIntensity: 0.06 },
  [TILE.WALL]: { key: "wall", tint: 0xb6c1cd, repeatX: 8, repeatY: 8, roughness: 0.88, emissive: 0x30363f, emissiveIntensity: 0.05 },
  [TILE.RUINS]: { key: "props", tint: 0xc19b81, repeatX: 8, repeatY: 8, roughness: 0.92, emissive: 0x432f24, emissiveIntensity: 0.06 },
  [TILE.WATER]: { key: "grass", tint: 0x86c8f8, repeatX: 12, repeatY: 12, roughness: 0.66, emissive: 0x1f527f, emissiveIntensity: 0.12 },
  [TILE.QUARRY]: { key: "props", tint: 0xb8a88e, repeatX: 9, repeatY: 9, roughness: 0.93, emissive: 0x3d3028, emissiveIntensity: 0.06 },
  [TILE.HERB_GARDEN]: { key: "plants", tint: 0x8fd47a, repeatX: 10, repeatY: 10, roughness: 0.95, emissive: 0x1f3d1a, emissiveIntensity: 0.07 },
  [TILE.KITCHEN]: { key: "structure", tint: 0xe0be74, repeatX: 8, repeatY: 8, roughness: 0.9, emissive: 0x4c3a18, emissiveIntensity: 0.06 },
  [TILE.SMITHY]: { key: "structure", tint: 0xa08e7a, repeatX: 8, repeatY: 8, roughness: 0.88, emissive: 0x2a2018, emissiveIntensity: 0.06 },
  [TILE.CLINIC]: { key: "structure", tint: 0xc8e0c0, repeatX: 8, repeatY: 8, roughness: 0.92, emissive: 0x2a3d28, emissiveIntensity: 0.06 },
  [TILE.BRIDGE]: { key: "road", tint: 0xb09878, repeatX: 10, repeatY: 10, roughness: 0.92, emissive: 0x3a2a1a, emissiveIntensity: 0.06 },
});

const RENDER_ORDER = Object.freeze({
  TILE_BASE: 0,
  TILE_BORDER: 6,
  TILE_ICON: 12,
  ENTITY_MODEL: 20,
  ENTITY_SPRITE: 24,
  DEBUG_PATH: 30,
  PRESSURE_LENS: 34,
  TILE_OVERLAY: 36,
  SELECTION_RING: 38,
});
const DEFAULT_CAMERA_VIEW = Object.freeze({
  targetX: 0,
  targetZ: 0,
  zoom: 1.12,
});
const PRESSURE_MARKER_STYLE = Object.freeze({
  route: Object.freeze({ ring: 0xffa75a, fill: 0xffe0b8, ringOpacity: 0.58, fillOpacity: 0.16 }),
  depot: Object.freeze({ ring: 0x71d9ff, fill: 0xc8f4ff, ringOpacity: 0.54, fillOpacity: 0.14 }),
  weather: Object.freeze({ ring: 0x72b9ff, fill: 0xd0e8ff, ringOpacity: 0.5, fillOpacity: 0.13 }),
  bandit_raid: Object.freeze({ ring: 0xff6d6d, fill: 0xffcbc4, ringOpacity: 0.62, fillOpacity: 0.15 }),
  trade_caravan: Object.freeze({ ring: 0xf0cf78, fill: 0xffefbe, ringOpacity: 0.5, fillOpacity: 0.12 }),
  animal_migration: Object.freeze({ ring: 0x9bde84, fill: 0xdaf2c7, ringOpacity: 0.48, fillOpacity: 0.12 }),
  traffic: Object.freeze({ ring: 0xffcd6c, fill: 0xffefc5, ringOpacity: 0.52, fillOpacity: 0.13 }),
  ecology: Object.freeze({ ring: 0x8ed66f, fill: 0xd8efb7, ringOpacity: 0.48, fillOpacity: 0.12 }),
  event: Object.freeze({ ring: 0xff9d80, fill: 0xffdccb, ringOpacity: 0.5, fillOpacity: 0.12 }),
});

export class SceneRenderer {
  constructor(canvas, state, buildSystem, onSelectEntity) {
    this.canvas = canvas;
    this.state = state;
    this.buildSystem = buildSystem;
    this.onSelectEntity = onSelectEntity;
    this.hoverTile = null;

    const { renderer, attempt: rendererAttempt } = createRendererWithFallback(canvas);
    this.renderer = renderer;
    this.rendererAttempt = rendererAttempt;
    this.compatibilityRenderer = !rendererAttempt.antialias;
    const deviceMemory = Number(globalThis?.navigator?.deviceMemory ?? 0);
    this.lowMemoryMode = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 8;
    this.basePixelRatio = this.lowMemoryMode ? 1 : Math.min(1.25, window.devicePixelRatio || 1);
    this.lowQualityPixelRatio = this.lowMemoryMode ? 0.85 : 1;
    this.currentPixelRatio = this.basePixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = !this.compatibilityRenderer && !this.lowMemoryMode;
    this.renderer.shadowMap.type = this.lowMemoryMode ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;

    const initialAtmosphere = deriveAtmosphereProfile(state);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initialAtmosphere.background);
    this.scene.fog = new THREE.Fog(initialAtmosphere.fogColor, initialAtmosphere.fogNear, initialAtmosphere.fogFar);
    this.renderer.toneMappingExposure = initialAtmosphere.exposure;

    this.modelLoader = new GLTFLoader();
    this.modelLoadPromises = new Map();
    this.modelTemplates = new Map();
    this.modelLoadErrors = new Map();
    this.modelTemplatesRequested = false;
    this.entityById = new Map();
    this.workerEntities = [];
    this.visitorEntities = [];
    this.herbivoreEntities = [];
    this.predatorEntities = [];
    this.allEntities = [];
    this.renderEntityLookup = {
      workers: this.workerEntities,
      visitors: this.visitorEntities,
      herbivores: this.herbivoreEntities,
      predators: this.predatorEntities,
    };
    this.entityModelInstances = new Map();
    this.entityShadowGeometry = new THREE.CircleGeometry(1, 18);
    this.entityShadowMaterialCache = new Map();
    this.useEntityModels = true;
    this.useTileModels = false;
    this.modelDisableThreshold = Math.max(80, Math.round(state.controls.renderModelDisableThreshold ?? 260));
    this.modelEnableThreshold = Math.max(40, this.modelDisableThreshold - 40);

    this.state.controls.visualPreset ??= "flat_worldsim";
    this.state.controls.showTileIcons ??= true;
    this.state.controls.showUnitSprites ??= true;
    this.state.controls.cameraMinZoom ??= 0.55;
    this.state.controls.cameraMaxZoom ??= 3.2;
    this.state.controls.renderModelDisableThreshold ??= this.modelDisableThreshold;
    this.state.debug.visualAssetPack = "loading";
    this.state.debug.iconAtlasLoaded = false;
    this.state.debug.unitSpriteLoaded = false;
    this.textureLoader = new THREE.TextureLoader();
    this.worldSimManifest = null;
    this.tileMaterialsByType = new Map();
    this.tileIconMaterials = new Map();
    this.tileIconMeshes = new Map();
    this.unitSpriteTextures = new Map();
    this.entitySpriteInstances = new Map();
    this.state.debug.tileTexturesLoaded = false;

    this.orthoSize = Math.max(state.grid.width, state.grid.height) * 0.65;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.camera.position.set(0, 120, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.#updateOrthoProjection();
    this.camera.zoom = 1.12;
    this.camera.updateProjectionMatrix();

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableRotate = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomSpeed = 0.78;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons.LEFT = -1;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.minZoom = this.state.controls.cameraMinZoom;
    this.controls.maxZoom = this.state.controls.cameraMaxZoom;
    this.controls.target.set(0, 0, 0);

    this.lastShowTileIcons = null;
    this.lastVisualPreset = this.state.controls.visualPreset;
    this.lastEntityRenderSignature = "";
    this.pressureLensMarkers = [];
    this.lastPressureLensSignature = "";

    this.ambientLight = new THREE.AmbientLight(initialAtmosphere.ambientColor, initialAtmosphere.ambientIntensity);
    this.hemiLight = new THREE.HemisphereLight(
      initialAtmosphere.hemiSkyColor,
      initialAtmosphere.hemiGroundColor,
      initialAtmosphere.hemiIntensity,
    );
    const sun = new THREE.DirectionalLight(initialAtmosphere.sunColor, initialAtmosphere.sunIntensity);
    sun.position.set(
      initialAtmosphere.sunPosition.x,
      initialAtmosphere.sunPosition.y,
      initialAtmosphere.sunPosition.z,
    );
    const shadowSpan = Math.max(state.grid.width, state.grid.height) * 0.8;
    sun.castShadow = this.renderer.shadowMap.enabled;
    sun.shadow.mapSize.set(this.lowMemoryMode ? 1024 : 1536, this.lowMemoryMode ? 1024 : 1536);
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.near = 8;
    sun.shadow.camera.far = 280;
    sun.shadow.bias = -0.00012;
    this.sunLight = sun;
    this.fillLight = new THREE.DirectionalLight(initialAtmosphere.fillColor, initialAtmosphere.fillIntensity);
    this.fillLight.position.set(
      initialAtmosphere.fillPosition.x,
      initialAtmosphere.fillPosition.y,
      initialAtmosphere.fillPosition.z,
    );
    this.scene.add(this.ambientLight, this.hemiLight, this.sunLight, this.fillLight);

    this.tileModelRoot = new THREE.Group();
    this.entitySpriteRoot = new THREE.Group();
    this.entityModelRoot = new THREE.Group();
    this.scene.add(this.tileModelRoot, this.entitySpriteRoot, this.entityModelRoot);

    this.lastGridVersion = -1;
    this.pathDoneVerts = [];
    this.pathFutureVerts = [];
    this.pathRenderSignature = "";
    this.#setupTileMesh();
    this.#setupTileBorders();
    this.#setupTileIcons();
    this.#setupEntityMeshes();
    this.#setupDebugPath();
    this.#setupOverlayMeshes();
    this.#setupPressureLensMeshes();
    this.#loadWorldSimManifest();
    if (this.compatibilityRenderer) {
      this.state.controls.actionMessage = "Compatibility renderer enabled (anti-alias off).";
      this.state.controls.actionKind = "info";
    }

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.lastPointerSampleMs = 0;
    this.pointerSampleIntervalMs = 20;
    this.isCameraInteracting = false;

    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);

    this.boundOnPointerMove = (e) => this.#onPointerMove(e);
    this.boundOnPointerLeave = () => {
      this.hoverTile = null;
    };
    this.boundOnPointerDown = (e) => this.#onPointerDown(e);
    this.boundOnContextMenu = (e) => e.preventDefault();
    this.boundOnControlsStart = () => {
      this.isCameraInteracting = true;
      this.hoverTile = null;
    };
    this.boundOnControlsEnd = () => {
      this.isCameraInteracting = false;
    };

    this.canvas.addEventListener("pointermove", this.boundOnPointerMove);
    this.canvas.addEventListener("pointerleave", this.boundOnPointerLeave);
    this.canvas.addEventListener("pointerdown", this.boundOnPointerDown);
    this.canvas.addEventListener("contextmenu", this.boundOnContextMenu);
    this.controls.addEventListener("start", this.boundOnControlsStart);
    this.controls.addEventListener("end", this.boundOnControlsEnd);
  }

  #hashAngle(ix, iz) {
    const seed = ((ix * 73856093) ^ (iz * 19349663)) >>> 0;
    return (seed % 360) * (Math.PI / 180);
  }

  #hash01(ix, iz, salt = 0) {
    const seed = ((ix * 73856093) ^ (iz * 19349663) ^ (salt * 83492791)) >>> 0;
    return (seed % 10000) / 10000;
  }

  #hashSigned(ix, iz, salt = 0) {
    return this.#hash01(ix, iz, salt) * 2 - 1;
  }

  #hashPhaseFromId(id) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < id.length; i += 1) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h % 6283) / 1000;
  }

  #tileAt(ix, iz) {
    if (!inBounds(ix, iz, this.state.grid)) return null;
    return this.state.grid.tiles[ix + iz * this.state.grid.width];
  }

  #roadYawForTile(ix, iz) {
    const left = this.#tileAt(ix - 1, iz) === TILE.ROAD;
    const right = this.#tileAt(ix + 1, iz) === TILE.ROAD;
    const up = this.#tileAt(ix, iz - 1) === TILE.ROAD;
    const down = this.#tileAt(ix, iz + 1) === TILE.ROAD;
    const horizontal = left || right;
    const vertical = up || down;
    if (horizontal && !vertical) return 0;
    if (vertical && !horizontal) return Math.PI / 2;
    return this.#hash01(ix, iz, 31) > 0.5 ? 0 : Math.PI / 2;
  }

  #wallYawForTile(ix, iz) {
    const left = this.#tileAt(ix - 1, iz) === TILE.WALL;
    const right = this.#tileAt(ix + 1, iz) === TILE.WALL;
    const up = this.#tileAt(ix, iz - 1) === TILE.WALL;
    const down = this.#tileAt(ix, iz + 1) === TILE.WALL;
    const horizontal = left || right;
    const vertical = up || down;
    if (horizontal && !vertical) return 0;
    if (vertical && !horizontal) return Math.PI / 2;
    return this.#hash01(ix, iz, 32) > 0.5 ? 0 : Math.PI / 2;
  }

  #tileYaw(ix, iz, tileType, binding) {
    if (binding.autoYaw && tileType === TILE.ROAD) return this.#roadYawForTile(ix, iz);
    if (binding.autoYaw && tileType === TILE.WALL) return this.#wallYawForTile(ix, iz);
    if (binding.randomYaw) return this.#hashAngle(ix, iz);
    return 0;
  }

  #getShadowMaterial(opacity = 0.2) {
    const key = String(opacity);
    if (this.entityShadowMaterialCache.has(key)) return this.entityShadowMaterialCache.get(key);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.entityShadowMaterialCache.set(key, mat);
    return mat;
  }

  #attachEntityShadow(model, binding) {
    if (!this.renderer.shadowMap.enabled) return;
    if (!binding.shadowRadius || binding.shadowRadius <= 0) return;
    const shadow = new THREE.Mesh(this.entityShadowGeometry, this.#getShadowMaterial(binding.shadowOpacity ?? 0.2));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    const localRadius = binding.shadowRadius / Math.max(0.01, binding.scale);
    shadow.scale.set(localRadius, localRadius, localRadius);
    shadow.userData.entityShadow = true;
    model.add(shadow);
  }

  #normalizeTemplate(scene) {
    const root = new THREE.Group();
    root.add(scene);
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });

    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      const maxAxis = Math.max(size.x, size.y, size.z, 1e-5);
      root.scale.multiplyScalar(1 / maxAxis);
      root.updateMatrixWorld(true);

      box.setFromObject(root);
      box.getCenter(center);
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.position.y -= box.min.y;
      root.updateMatrixWorld(true);
    }

    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });

    return root;
  }

  #loadTemplateByUrl(url) {
    if (this.modelLoadPromises.has(url)) return this.modelLoadPromises.get(url);

    const promise = new Promise((resolve, reject) => {
      this.modelLoader.load(
        url,
        (gltf) => {
          resolve(this.#normalizeTemplate(gltf.scene));
        },
        undefined,
        (err) => reject(err),
      );
    });
    this.modelLoadPromises.set(url, promise);
    return promise;
  }

  #loadModelTemplates() {
    if (this.modelTemplatesRequested) return;
    this.modelTemplatesRequested = true;
    const entries = Object.entries(MODEL_LIBRARY).filter(([key]) => {
      if (this.useTileModels) return true;
      return !key.endsWith("Tile");
    });
    Promise.allSettled(entries.map(async ([key, cfg]) => {
      try {
        const template = await this.#loadTemplateByUrl(cfg.url);
        this.modelTemplates.set(key, template);
      } catch (err) {
        this.modelLoadErrors.set(key, String(err?.message ?? err ?? "unknown"));
      }
    })).then(() => {
      this.lastGridVersion = -1;
      if (this.modelLoadErrors.size > 0) {
        this.state.controls.actionMessage = `Models loaded with ${this.modelLoadErrors.size} fallback(s).`;
        this.state.controls.actionKind = "error";
      } else {
        this.state.controls.actionMessage = `Loaded ${entries.length} model assets.`;
        this.state.controls.actionKind = "success";
      }
    });
  }

  #ensureModelTemplatesRequested() {
    if (this.modelTemplatesRequested) return;
    const needsModels = this.state.controls.visualPreset !== "flat_worldsim"
      || !this.state.controls.showUnitSprites;
    if (!needsModels) return;
    this.#loadModelTemplates();
  }

  #cloneTemplate(key) {
    const template = this.modelTemplates.get(key);
    if (!template) return null;
    return SkeletonUtils.clone(template);
  }

  #applyTint(root, tintHex) {
    if (!tintHex) return;
    const tint = new THREE.Color(tintHex);
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const baseMats = Array.isArray(node.material) ? node.material : [node.material];
      const tinted = baseMats.map((mat) => {
        const clone = mat.clone();
        if (clone.color) clone.color.multiply(tint);
        return clone;
      });
      node.material = Array.isArray(node.material) ? tinted : tinted[0];
    });
  }

  #updateOrthoProjection() {
    const aspect = Math.max(0.5, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    this.camera.left = (-this.orthoSize * aspect) / 2;
    this.camera.right = (this.orthoSize * aspect) / 2;
    this.camera.top = this.orthoSize / 2;
    this.camera.bottom = -this.orthoSize / 2;
    this.camera.updateProjectionMatrix();
  }

  #setupTileMesh() {
    const count = this.state.grid.width * this.state.grid.height;
    this.tileMeshesByType = new Map();
    this.tileMaterialsByType.clear();
    const geometry = new THREE.BoxGeometry(this.state.grid.tileSize, 1, this.state.grid.tileSize);
    for (const [typeRaw, info] of Object.entries(TILE_INFO)) {
      const type = Number(typeRaw);
      const material = new THREE.MeshStandardMaterial({
        color: info.color,
        roughness: 0.94,
        metalness: 0.0,
        emissive: new THREE.Color(0x202020),
        emissiveIntensity: 0.06,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.TILE_BASE;
      this.tileMeshesByType.set(type, mesh);
      this.tileMaterialsByType.set(type, material);
      this.scene.add(mesh);
    }
  }

  #setupTileBorders() {
    const verts = [];
    const tile = this.state.grid.tileSize;
    const halfW = (this.state.grid.width * tile) / 2;
    const halfH = (this.state.grid.height * tile) / 2;

    for (let ix = 0; ix <= this.state.grid.width; ix += 1) {
      const x = ix * tile - halfW;
      verts.push(x, 0.03, -halfH, x, 0.03, halfH);
    }

    for (let iz = 0; iz <= this.state.grid.height; iz += 1) {
      const z = iz * tile - halfH;
      verts.push(-halfW, 0.03, z, halfW, 0.03, z);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x8fb0c9,
      transparent: true,
      opacity: TILE_BORDER_BASE_OPACITY,
      depthTest: true,
      depthWrite: false,
    });
    this.tileBorderLines = new THREE.LineSegments(geom, mat);
    this.tileBorderLines.frustumCulled = false;
    this.tileBorderLines.renderOrder = RENDER_ORDER.TILE_BORDER;
    this.scene.add(this.tileBorderLines);
  }

  #setupTileIcons() {
    const maxCount = this.state.grid.width * this.state.grid.height;
    const geom = new THREE.PlaneGeometry(1, 1);
    geom.rotateX(-Math.PI / 2);
    const iconKeys = Object.values(TILE_ICON_TYPES);
    for (const key of iconKeys) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        alphaTest: 0.24,
        depthTest: true,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.InstancedMesh(geom, mat, maxCount);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.TILE_ICON;
      this.tileIconMaterials.set(key, mat);
      this.tileIconMeshes.set(key, mesh);
      this.scene.add(mesh);
    }
  }

  #setTextureSampling(texture, options = {}) {
    const pixelated = Boolean(options.pixelated);
    const useMipmaps = options.mipmaps ?? !pixelated;
    const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (pixelated) {
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
    } else {
      texture.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = useMipmaps;
      texture.anisotropy = clamp(Number(options.anisotropy) || 4, 1, maxAnisotropy);
    }
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(options.repeatX ?? 1, options.repeatY ?? 1);
    texture.needsUpdate = true;
  }

  #syncVisualAssetDebug() {
    Object.assign(this.state.debug, deriveVisualAssetDebugState({
      manifestTheme: this.worldSimManifest?.theme ?? this.state.debug.visualAssetPack ?? "flat_worldsim",
      tileMaterials: this.tileMaterialsByType.values(),
      iconMaterials: this.tileIconMaterials.values(),
      unitSpriteCount: this.unitSpriteTextures.size,
    }));
  }

  #applyProceduralTileTextures() {
    let applied = 0;
    for (const [tileTypeRaw, binding] of Object.entries(TILE_TEXTURE_BINDINGS)) {
      const tileType = Number(tileTypeRaw);
      const material = this.tileMaterialsByType.get(tileType);
      if (!material) continue;

      const texture = createProceduralTileTexture(tileType);
      if (!texture) continue;
      this.#setTextureSampling(texture, {
        repeatX: texture.repeat.x,
        repeatY: texture.repeat.y,
        pixelated: false,
        mipmaps: true,
        anisotropy: 8,
      });

      if (material.map && material.map !== texture) {
        material.map.dispose?.();
      }
      material.map = texture;
      material.color.setHex(binding.tint ?? 0xffffff);
      material.roughness = binding.roughness ?? 0.95;
      material.emissive.setHex(binding.emissive ?? 0x202020);
      material.emissiveIntensity = binding.emissiveIntensity ?? 0.06;
      material.needsUpdate = true;
      applied += 1;
    }
    this.#syncVisualAssetDebug();
    return applied;
  }

  async #loadTileTexturesFromManifest(manifest) {
    const textureMap = manifest?.tileTextures ?? {};
    const sourceCache = new Map();
    let applied = 0;
    const warnings = [];

    const getSourceTexture = async (relPath) => {
      if (!relPath) return null;
      if (sourceCache.has(relPath)) return sourceCache.get(relPath);
      const loaded = await this.textureLoader.loadAsync(`/assets/worldsim/${encodeURI(relPath)}`);
      sourceCache.set(relPath, loaded);
      return loaded;
    };

    for (const [tileTypeRaw, binding] of Object.entries(TILE_TEXTURE_BINDINGS)) {
      const tileType = Number(tileTypeRaw);
      const material = this.tileMaterialsByType.get(tileType);
      if (!material) continue;

      const keyCandidates = [
        binding.key,
        "grass",
        "road",
        "structure",
        "plants",
        "props",
        "wall",
      ];
      const textureKey = keyCandidates.find((k) => Boolean(textureMap[k]));
      const relPath = textureMap[textureKey];

      if (!relPath) {
        warnings.push(`missing texture for tile ${tileType}`);
        continue;
      }

      try {
        const sourceTexture = await getSourceTexture(relPath);
        if (!sourceTexture) continue;
        const texture = sourceTexture.clone();
        this.#setTextureSampling(texture, { repeatX: binding.repeatX, repeatY: binding.repeatY, pixelated: false });
        texture.offset.set((tileType % 3) * 0.07, (tileType % 4) * 0.05);

        if (material.map && material.map !== texture) {
          material.map.dispose?.();
        }
        material.map = texture;
        material.color.setHex(binding.tint ?? 0xffffff);
        material.roughness = binding.roughness ?? 0.95;
        material.emissive.setHex(binding.emissive ?? 0x202020);
        material.emissiveIntensity = binding.emissiveIntensity ?? 0.06;
        material.needsUpdate = true;
        applied += 1;
      } catch (err) {
        warnings.push(`tile texture ${textureKey} failed: ${String(err?.message ?? err)}`);
      }
    }

    this.#syncVisualAssetDebug();
    if (warnings.length > 0) {
      for (const warning of warnings.slice(0, 8)) {
        pushWarning(this.state, warning, "warn", "SceneRenderer");
      }
    }
    return applied;
  }

  async #loadWorldSimManifest() {
    try {
      const resp = await fetch(WORLD_SIM_MANIFEST_URL);
      if (!resp.ok) {
        this.state.debug.visualAssetPack = `manifest:${resp.status}`;
        this.#applyProceduralTileTextures();
        return;
      }
      const manifest = await resp.json();
      this.worldSimManifest = manifest;
      this.state.debug.visualAssetPack = manifest.theme ?? "flat_worldsim";
      const tileTextureMode = resolveTileTextureMode(manifest);
      if (tileTextureMode === "atlas") {
        await this.#loadTileTexturesFromManifest(manifest);
      } else {
        this.#applyProceduralTileTextures();
      }

      const warnings = [];
      const iconEntries = Object.entries(manifest.tileIcons ?? {});
      const iconResults = await Promise.allSettled(iconEntries.map(async ([key, relPath]) => {
        const mat = this.tileIconMaterials.get(key);
        if (!mat || !relPath) return;
        const texture = await this.textureLoader.loadAsync(`/assets/worldsim/${encodeURI(relPath)}`);
        this.#setTextureSampling(texture, { pixelated: true });
        if (mat.map && mat.map !== texture) {
          mat.map.dispose?.();
        }
        mat.map = texture;
        mat.opacity = TILE_ICON_BASE_OPACITY;
        mat.needsUpdate = true;
      }));
      for (let i = 0; i < iconResults.length; i += 1) {
        const r = iconResults[i];
        if (r.status !== "rejected") continue;
        warnings.push(`tileIcon ${iconEntries[i][0]} failed: ${String(r.reason?.message ?? r.reason)}`);
      }
      for (const texture of this.unitSpriteTextures.values()) {
        texture.dispose?.();
      }
      this.unitSpriteTextures.clear();
      const unitEntries = Object.entries(manifest.unitSprites ?? {});
      const unitResults = await Promise.allSettled(unitEntries.map(async ([key, relPath]) => {
        if (!relPath) return;
        const texture = await this.textureLoader.loadAsync(`/assets/worldsim/${encodeURI(relPath)}`);
        this.#setTextureSampling(texture, { pixelated: true });
        this.unitSpriteTextures.set(key, texture);
      }));
      for (let i = 0; i < unitResults.length; i += 1) {
        const r = unitResults[i];
        if (r.status !== "rejected") continue;
        warnings.push(`unitSprite ${unitEntries[i][0]} failed: ${String(r.reason?.message ?? r.reason)}`);
      }
      this.#syncVisualAssetDebug();
      if (warnings.length > 0) {
        for (const warning of warnings.slice(0, 6)) {
          pushWarning(this.state, warning, "warn", "SceneRenderer");
        }
      }

      this.lastGridVersion = -1;
      this.#rebuildTilesIfNeeded();
    } catch (err) {
      this.state.debug.visualAssetPack = "flat_worldsim:fallback";
      this.#applyProceduralTileTextures();
      this.state.debug.iconAtlasLoaded = false;
      this.state.debug.unitSpriteLoaded = false;
      this.#syncVisualAssetDebug();
      pushWarning(this.state, `WorldSim asset manifest load failed: ${String(err?.message ?? err)}`, "error", "SceneRenderer");
    }
  }

  #setupEntityMeshes() {
    const sphere = new THREE.SphereGeometry(0.34, 14, 14);
    const maxWorkers = 900;
    const maxVisitors = 240;
    const maxHerbivores = 300;
    const maxPredators = 120;

    this.workerMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), maxWorkers);
    this.visitorMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xffb866, roughness: 0.5 }), maxVisitors);
    this.herbivoreMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0x89d37f, roughness: 0.52 }), maxHerbivores);
    this.predatorMesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ color: 0xe07b7b, roughness: 0.52 }), maxPredators);
    const shadowEnabled = this.renderer.shadowMap.enabled;
    this.workerMesh.castShadow = shadowEnabled;
    this.workerMesh.receiveShadow = shadowEnabled;
    this.visitorMesh.castShadow = shadowEnabled;
    this.visitorMesh.receiveShadow = shadowEnabled;
    this.herbivoreMesh.castShadow = shadowEnabled;
    this.herbivoreMesh.receiveShadow = shadowEnabled;
    this.predatorMesh.castShadow = shadowEnabled;
    this.predatorMesh.receiveShadow = shadowEnabled;
    this.workerMesh.frustumCulled = false;
    this.visitorMesh.frustumCulled = false;
    this.herbivoreMesh.frustumCulled = false;
    this.predatorMesh.frustumCulled = false;
    this.workerMesh.renderOrder = RENDER_ORDER.ENTITY_MODEL;
    this.visitorMesh.renderOrder = RENDER_ORDER.ENTITY_MODEL;
    this.herbivoreMesh.renderOrder = RENDER_ORDER.ENTITY_MODEL;
    this.predatorMesh.renderOrder = RENDER_ORDER.ENTITY_MODEL;

    this.scene.add(this.workerMesh, this.visitorMesh, this.herbivoreMesh, this.predatorMesh);
  }

  #setupDebugPath() {
    const pathGeomA = new THREE.BufferGeometry();
    pathGeomA.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    pathGeomA.setDrawRange(0, 0);
    const pathGeomB = new THREE.BufferGeometry();
    pathGeomB.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    pathGeomB.setDrawRange(0, 0);

    this.pathDoneLine = new THREE.Line(pathGeomA, new THREE.LineBasicMaterial({
      color: 0x4aa3ff,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
    }));
    this.pathFutureLine = new THREE.Line(pathGeomB, new THREE.LineBasicMaterial({
      color: 0x00d1ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    }));
    this.pathDoneLine.frustumCulled = false;
    this.pathFutureLine.frustumCulled = false;
    this.pathDoneLine.renderOrder = RENDER_ORDER.DEBUG_PATH;
    this.pathFutureLine.renderOrder = RENDER_ORDER.DEBUG_PATH + 1;
    this.scene.add(this.pathDoneLine, this.pathFutureLine);
  }

  #setupOverlayMeshes() {
    const tileSize = this.state.grid.tileSize * 0.94;
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0x7ec8ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), hoverMat);
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.visible = false;
    this.hoverMesh.renderOrder = RENDER_ORDER.TILE_OVERLAY;
    this.hoverMesh.frustumCulled = false;

    const previewMat = new THREE.MeshBasicMaterial({
      color: 0x6eeb83,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.previewMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize * 0.92, tileSize * 0.92), previewMat);
    this.previewMesh.rotation.x = -Math.PI / 2;
    this.previewMesh.visible = false;
    this.previewMesh.renderOrder = RENDER_ORDER.TILE_OVERLAY + 1;
    this.previewMesh.frustumCulled = false;

    const selectedTileMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    this.selectedTileMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize * 0.88, tileSize * 0.88), selectedTileMat);
    this.selectedTileMesh.rotation.x = -Math.PI / 2;
    this.selectedTileMesh.visible = false;
    this.selectedTileMesh.renderOrder = RENDER_ORDER.TILE_OVERLAY + 2;
    this.selectedTileMesh.frustumCulled = false;

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = RENDER_ORDER.SELECTION_RING;
    this.selectionRing.frustumCulled = false;

    this.scene.add(this.hoverMesh, this.previewMesh, this.selectedTileMesh, this.selectionRing);
  }

  #setupPressureLensMeshes() {
    this.pressureLensRoot = new THREE.Group();
    this.pressureDiscGeometry = new THREE.CircleGeometry(1, 36);
    this.pressureRingGeometry = new THREE.RingGeometry(0.82, 1, 40);
    this.pressureMarkerPool = [];
    this.scene.add(this.pressureLensRoot);
  }

  #createPressureMarkerEntry() {
    const disc = new THREE.Mesh(this.pressureDiscGeometry, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = RENDER_ORDER.PRESSURE_LENS;
    disc.frustumCulled = false;

    const ring = new THREE.Mesh(this.pressureRingGeometry, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = RENDER_ORDER.PRESSURE_LENS + 1;
    ring.frustumCulled = false;

    const group = new THREE.Group();
    group.visible = false;
    group.add(disc, ring);
    this.pressureLensRoot.add(group);
    return {
      group,
      disc,
      ring,
      phase: Math.random() * Math.PI * 2,
    };
  }

  #ensurePressureMarkerPool(count) {
    while (this.pressureMarkerPool.length < count) {
      this.pressureMarkerPool.push(this.#createPressureMarkerEntry());
    }
  }

  #lerpColor(targetColor, hex, t) {
    COLOR_TMP.setHex(hex);
    targetColor.lerp(COLOR_TMP, t);
  }

  #applyAtmosphere(dt) {
    const target = deriveAtmosphereProfile(this.state);
    const blend = clamp(Math.max(0.08, Number(dt) * 3.1), 0.08, 0.24);

    this.#lerpColor(this.scene.background, target.background, blend);
    if (this.scene.fog) {
      this.#lerpColor(this.scene.fog.color, target.fogColor, blend);
      this.scene.fog.near += (target.fogNear - this.scene.fog.near) * blend;
      this.scene.fog.far += (target.fogFar - this.scene.fog.far) * blend;
    }
    this.#lerpColor(this.ambientLight.color, target.ambientColor, blend);
    this.ambientLight.intensity += (target.ambientIntensity - this.ambientLight.intensity) * blend;
    this.#lerpColor(this.hemiLight.color, target.hemiSkyColor, blend);
    this.#lerpColor(this.hemiLight.groundColor, target.hemiGroundColor, blend);
    this.hemiLight.intensity += (target.hemiIntensity - this.hemiLight.intensity) * blend;
    this.#lerpColor(this.sunLight.color, target.sunColor, blend);
    this.sunLight.intensity += (target.sunIntensity - this.sunLight.intensity) * blend;
    VEC_TMP.set(target.sunPosition.x, target.sunPosition.y, target.sunPosition.z);
    this.sunLight.position.lerp(VEC_TMP, blend);
    this.#lerpColor(this.fillLight.color, target.fillColor, blend);
    this.fillLight.intensity += (target.fillIntensity - this.fillLight.intensity) * blend;
    VEC_TMP.set(target.fillPosition.x, target.fillPosition.y, target.fillPosition.z);
    this.fillLight.position.lerp(VEC_TMP, blend);
    this.renderer.toneMappingExposure += (target.exposure - this.renderer.toneMappingExposure) * blend;
  }

  #pressureLensSignature() {
    const events = (this.state.events?.active ?? [])
      .map((event) => `${event.type}:${event.status}:${event.payload?.targetLabel ?? "-"}:${Number(event.payload?.pressure ?? 0).toFixed(2)}`)
      .join("|");
    const ecology = (this.state.metrics?.ecology?.hotspotFarms ?? [])
      .map((entry) => `${entry.ix},${entry.iz}:${Number(entry.pressure ?? 0).toFixed(2)}`)
      .join("|");
    return [
      this.state.grid.version,
      this.state.gameplay?.objectiveIndex ?? 0,
      this.state.weather?.current ?? "clear",
      this.state.weather?.hazardFocusSummary ?? "",
      this.state.weather?.pressureScore ?? 0,
      this.state.metrics?.traffic?.version ?? 0,
      this.state.metrics?.traffic?.hotspotCount ?? 0,
      this.state.metrics?.spatialPressure?.summary ?? "",
      events,
      ecology,
    ].join("||");
  }

  #updatePressureLens() {
    const signature = this.#pressureLensSignature();
    if (signature !== this.lastPressureLensSignature) {
      this.lastPressureLensSignature = signature;
      this.pressureLensMarkers = buildPressureLens(this.state);
    }

    this.#ensurePressureMarkerPool(this.pressureLensMarkers.length);
    const timeSec = Number(this.state.metrics?.timeSec ?? 0);

    for (let i = 0; i < this.pressureMarkerPool.length; i += 1) {
      const entry = this.pressureMarkerPool[i];
      const marker = this.pressureLensMarkers[i];
      if (!marker) {
        entry.group.visible = false;
        continue;
      }

      const style = PRESSURE_MARKER_STYLE[marker.kind] ?? PRESSURE_MARKER_STYLE.event;
      const pulse = 1 + Math.sin(timeSec * (1.9 + Number(marker.weight ?? 0) * 0.9) + entry.phase) * 0.08;
      const ringPulse = 1 + Math.cos(timeSec * (1.4 + Number(marker.weight ?? 0) * 0.7) + entry.phase) * 0.12;
      const worldRadius = this.state.grid.tileSize * (Number(marker.radius ?? 1) * 0.7 + 0.28);
      const p = tileToWorld(marker.ix, marker.iz, this.state.grid);

      entry.group.visible = true;
      entry.group.position.set(p.x, 0.16 + (Number(marker.weight ?? 0) * 0.02), p.z);
      entry.disc.scale.set(worldRadius * pulse, worldRadius * pulse, 1);
      entry.ring.scale.set(worldRadius * ringPulse, worldRadius * ringPulse, 1);
      entry.disc.material.color.setHex(style.fill);
      entry.ring.material.color.setHex(style.ring);
      entry.disc.material.opacity = (style.fillOpacity ?? 0.12) * (0.8 + Number(marker.weight ?? 0) * 0.5);
      entry.ring.material.opacity = (style.ringOpacity ?? 0.5) * (0.78 + Number(marker.weight ?? 0) * 0.4);
    }
  }

  #updateLineGeometry(line, sourceVerts) {
    const drawCount = (sourceVerts.length / 3) | 0;
    let attr = line.geometry.getAttribute("position");
    if (!attr || attr.array.length < sourceVerts.length) {
      const nextLen = Math.max(3, sourceVerts.length);
      attr = new THREE.BufferAttribute(new Float32Array(nextLen), 3);
      line.geometry.setAttribute("position", attr);
    }
    if (sourceVerts.length > 0) {
      attr.array.set(sourceVerts, 0);
      attr.needsUpdate = true;
    }
    line.geometry.setDrawRange(0, drawCount);
  }

  #clearPathLine() {
    if (this.pathRenderSignature === "") return;
    this.pathRenderSignature = "";
    this.pathDoneVerts.length = 0;
    this.pathFutureVerts.length = 0;
    this.#updateLineGeometry(this.pathDoneLine, this.pathDoneVerts);
    this.#updateLineGeometry(this.pathFutureLine, this.pathFutureVerts);
  }

  #updatePathLine() {
    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      this.#clearPathLine();
      return;
    }

    const selected = this.entityById.get(selectedId);
    if (!selected?.path || selected.path.length === 0) {
      this.#clearPathLine();
      return;
    }

    const first = selected.path[0];
    const last = selected.path[selected.path.length - 1];
    const signature = [
      selected.id,
      selected.pathGridVersion,
      selected.pathIndex,
      selected.path.length,
      first.ix,
      first.iz,
      last.ix,
      last.iz,
    ].join("|");
    if (signature === this.pathRenderSignature) return;
    this.pathRenderSignature = signature;

    this.pathDoneVerts.length = 0;
    this.pathFutureVerts.length = 0;

    for (let i = 0; i < selected.path.length; i += 1) {
      const node = selected.path[i];
      const p = tileToWorld(node.ix, node.iz, this.state.grid);
      const target = i < selected.pathIndex ? this.pathDoneVerts : this.pathFutureVerts;
      target.push(p.x, 0.235, p.z);
    }

    this.#updateLineGeometry(this.pathDoneLine, this.pathDoneVerts);
    this.#updateLineGeometry(this.pathFutureLine, this.pathFutureVerts);
  }

  #rebuildTilesIfNeeded() {
    if (this.lastGridVersion === this.state.grid.version) return;
    this.lastGridVersion = this.state.grid.version;
    const counts = new Map();
    for (const type of this.tileMeshesByType.keys()) counts.set(type, 0);

    for (let iz = 0; iz < this.state.grid.height; iz += 1) {
      for (let ix = 0; ix < this.state.grid.width; ix += 1) {
        const tile = this.state.grid.tiles[ix + iz * this.state.grid.width];
        const info = TILE_INFO[tile];
        const mesh = this.tileMeshesByType.get(tile);
        if (!mesh) continue;
        const idx = counts.get(tile) ?? 0;
        const p = tileToWorld(ix, iz, this.state.grid);
        setInstancedMatrix(mesh, idx, p.x, info.height / 2, p.z, 1, info.height, 1);
        counts.set(tile, idx + 1);
      }
    }
    for (const [type, mesh] of this.tileMeshesByType.entries()) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.#rebuildTileIcons();
    this.#rebuildTileModels();
  }

  #clearGroup(group) {
    while (group.children.length > 0) {
      group.remove(group.children[group.children.length - 1]);
    }
    this.renderer?.renderLists?.dispose?.();
  }

  #rebuildTileModels() {
    if (!this.useTileModels || this.state.controls.visualPreset === "flat_worldsim") {
      this.#clearGroup(this.tileModelRoot);
      return;
    }

    this.#clearGroup(this.tileModelRoot);

    for (let iz = 0; iz < this.state.grid.height; iz += 1) {
      for (let ix = 0; ix < this.state.grid.width; ix += 1) {
        const idx = ix + iz * this.state.grid.width;
        const tileType = this.state.grid.tiles[idx];
        const binding = TILE_MODEL_BINDINGS[tileType];
        if (!binding) continue;
        const model = this.#cloneTemplate(binding.key);
        if (!model) continue;

        this.#applyTint(model, binding.tint);

        const p = tileToWorld(ix, iz, this.state.grid);
        const tileBaseHeight = TILE_INFO[tileType]?.height ?? 0;
        const jitter = binding.jitter ?? 0;
        const jx = jitter > 0 ? this.#hashSigned(ix, iz, 41) * jitter : 0;
        const jz = jitter > 0 ? this.#hashSigned(ix, iz, 42) * jitter : 0;
        const scaleJitter = binding.scaleJitter ?? 0;
        const sx = binding.scale.x * (1 + this.#hashSigned(ix, iz, 43) * scaleJitter);
        const sy = binding.scale.y * (1 + this.#hashSigned(ix, iz, 44) * Math.min(scaleJitter * 0.55, 0.08));
        const sz = binding.scale.z * (1 + this.#hashSigned(ix, iz, 45) * scaleJitter);

        model.position.set(p.x + jx, tileBaseHeight + binding.y, p.z + jz);
        model.scale.set(sx, sy, sz);
        model.rotation.y = this.#tileYaw(ix, iz, tileType, binding);
        this.tileModelRoot.add(model);
      }
    }
  }

  #rebuildTileIcons() {
    const shouldShow = Boolean(this.state.controls.showTileIcons) && this.state.controls.visualPreset === "flat_worldsim";
    const counts = new Map();
    for (const key of this.tileIconMeshes.keys()) counts.set(key, 0);

    if (!shouldShow) {
      for (const mesh of this.tileIconMeshes.values()) {
        mesh.count = 0;
        mesh.visible = false;
      }
      return;
    }

    for (let iz = 0; iz < this.state.grid.height; iz += 1) {
      for (let ix = 0; ix < this.state.grid.width; ix += 1) {
        const idx = ix + iz * this.state.grid.width;
        const tileType = this.state.grid.tiles[idx];
        const iconKey = TILE_ICON_TYPES[tileType];
        if (!iconKey) continue;
        if (tileType === TILE.ROAD && ((ix + iz) % 3 !== 0)) continue;
        if (tileType === TILE.WATER && ((ix + iz) % 4 !== 0)) continue;
        if (tileType === TILE.WALL && ((ix + iz) % 2 !== 0)) continue;

        const mesh = this.tileIconMeshes.get(iconKey);
        const material = this.tileIconMaterials.get(iconKey);
        if (!mesh || !material?.map) continue;

        const iconIndex = counts.get(iconKey) ?? 0;
        const p = tileToWorld(ix, iz, this.state.grid);
        const tileHeight = TILE_INFO[tileType]?.height ?? 0;
        setInstancedMatrix(
          mesh,
          iconIndex,
          p.x,
          tileHeight + TILE_ICON_Y,
          p.z,
          this.state.grid.tileSize * TILE_ICON_SCALE,
          this.state.grid.tileSize * TILE_ICON_SCALE,
          1,
        );
        counts.set(iconKey, iconIndex + 1);
      }
    }

    for (const [key, mesh] of this.tileIconMeshes.entries()) {
      mesh.count = counts.get(key) ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.#updateTileLayerVisibilityByZoom();
  }

  #updateTileLayerVisibilityByZoom() {
    const zoom = this.camera.zoom;
    const borderFade = clamp(
      (zoom - TILE_BORDER_FADE_START_ZOOM)
      / Math.max(0.001, TILE_BORDER_FADE_FULL_ZOOM - TILE_BORDER_FADE_START_ZOOM),
      0,
      1,
    );
    const borderOpacity = TILE_BORDER_BASE_OPACITY * borderFade;
    if (this.tileBorderLines?.material) {
      this.tileBorderLines.material.opacity = borderOpacity;
      this.tileBorderLines.visible = borderOpacity > 0.015;
    }

    const shouldShowIcons = Boolean(this.state.controls.showTileIcons)
      && this.state.controls.visualPreset === "flat_worldsim";
    const iconFade = clamp(
      (zoom - TILE_ICON_FADE_START_ZOOM)
      / Math.max(0.001, TILE_ICON_FADE_FULL_ZOOM - TILE_ICON_FADE_START_ZOOM),
      0,
      1,
    );
    const iconOpacity = TILE_ICON_BASE_OPACITY * iconFade;
    const iconsVisible = shouldShowIcons && iconOpacity > 0.05;
    for (const material of this.tileIconMaterials.values()) {
      material.opacity = iconOpacity;
    }
    for (const mesh of this.tileIconMeshes.values()) {
      mesh.visible = iconsVisible && mesh.count > 0;
    }
  }

  #entitySpriteBinding(entity) {
    if (entity.type === ENTITY_TYPE.WORKER) return UNIT_SPRITE_BINDINGS.WORKER;
    if (entity.type === ENTITY_TYPE.VISITOR) return UNIT_SPRITE_BINDINGS.VISITOR;
    if (entity.type === ENTITY_TYPE.ANIMAL) {
      return entity.kind === ANIMAL_KIND.PREDATOR ? UNIT_SPRITE_BINDINGS.PREDATOR : UNIT_SPRITE_BINDINGS.HERBIVORE;
    }
    return null;
  }

  #disposeSpriteEntry(entry) {
    if (!entry) return;
    if (entry.sprite?.material) {
      entry.sprite.material.dispose?.();
    }
  }

  #clearEntitySpriteInstances() {
    for (const entry of this.entitySpriteInstances.values()) {
      this.#disposeSpriteEntry(entry);
      this.entitySpriteRoot.remove(entry.group);
    }
    this.entitySpriteInstances.clear();
    this.renderer?.renderLists?.dispose?.();
  }

  #syncEntitySprites(entities) {
    const alive = new Set();
    let removedAny = false;

    for (const entity of entities) {
      const binding = this.#entitySpriteBinding(entity);
      if (!binding) continue;
      const texture = this.unitSpriteTextures.get(binding.key);
      if (!texture) continue;
      alive.add(entity.id);

      let entry = this.entitySpriteInstances.get(entity.id);
      if (!entry || entry.key !== binding.key) {
        if (entry) {
          this.#disposeSpriteEntry(entry);
          this.entitySpriteRoot.remove(entry.group);
          this.entitySpriteInstances.delete(entity.id);
          removedAny = true;
        }

        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.15,
          depthTest: true,
          depthWrite: false,
        }));
        sprite.userData.entityId = entity.id;
        sprite.renderOrder = RENDER_ORDER.ENTITY_SPRITE;

        const shadow = new THREE.Mesh(
          this.entityShadowGeometry,
          this.#getShadowMaterial(binding.shadowOpacity),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.012;
        shadow.userData.entityShadow = true;
        shadow.renderOrder = RENDER_ORDER.ENTITY_MODEL - 1;

        const group = new THREE.Group();
        group.userData.entityId = entity.id;
        group.add(shadow, sprite);
        this.entitySpriteRoot.add(group);

        entry = {
          key: binding.key,
          group,
          sprite,
          shadow,
          phase: this.#hashPhaseFromId(entity.id),
        };
        this.entitySpriteInstances.set(entity.id, entry);
      }

      const speed = Math.hypot(entity.vx || 0, entity.vz || 0);
      const bobAmp = speed > 0.2 ? binding.bobAmp : binding.bobIdleAmp;
      const bobFreq = speed > 0.2 ? 9 : 3.4;
      const bob = Math.sin(this.state.metrics.timeSec * bobFreq + entry.phase) * bobAmp;

      entry.group.position.set(entity.x, 0, entity.z);
      entry.sprite.position.set(0, binding.y + bob, 0);
      entry.sprite.scale.set(binding.scale, binding.scale, 1);
      entry.shadow.scale.set(binding.shadowRadius, binding.shadowRadius, binding.shadowRadius);
    }

    for (const [id, entry] of this.entitySpriteInstances.entries()) {
      if (alive.has(id)) continue;
      this.#disposeSpriteEntry(entry);
      this.entitySpriteRoot.remove(entry.group);
      this.entitySpriteInstances.delete(id);
      removedAny = true;
    }
    if (removedAny) this.renderer?.renderLists?.dispose?.();
  }

  #entityModelKey(entity) {
    if (entity.type === ENTITY_TYPE.WORKER) return "worker";
    if (entity.type === ENTITY_TYPE.VISITOR) {
      return entity.kind === VISITOR_KIND.TRADER ? "visitorTrader" : "visitorSaboteur";
    }
    if (entity.type === ENTITY_TYPE.ANIMAL) {
      return entity.kind === ANIMAL_KIND.PREDATOR ? "predator" : "herbivore";
    }
    return null;
  }

  #entityModelEnabled(entity) {
    if (!this.useEntityModels) return false;
    if (entity.type === ENTITY_TYPE.WORKER) return this.modelTemplates.has("worker");
    if (entity.type === ENTITY_TYPE.VISITOR) {
      return this.modelTemplates.has("visitorTrader") && this.modelTemplates.has("visitorSaboteur");
    }
    if (entity.type === ENTITY_TYPE.ANIMAL) {
      if (entity.kind === ANIMAL_KIND.PREDATOR) return this.modelTemplates.has("predator");
      return this.modelTemplates.has("herbivore");
    }
    return false;
  }

  #syncEntityModels(entities) {
    const alive = new Set();
    let removedAny = false;

    for (const entity of entities) {
      if (!this.#entityModelEnabled(entity)) continue;
      const modelKey = this.#entityModelKey(entity);
      const binding = ENTITY_MODEL_BINDINGS[modelKey];
      if (!binding) continue;

      alive.add(entity.id);

      let entry = this.entityModelInstances.get(entity.id);
      if (!entry || entry.key !== modelKey) {
        if (entry) {
          this.entityModelRoot.remove(entry.object);
          this.entityModelInstances.delete(entity.id);
          removedAny = true;
        }
        const model = this.#cloneTemplate(modelKey);
        if (!model) continue;
        model.userData.entityId = entity.id;
        model.traverse((node) => {
          if (node.isMesh) node.userData.entityId = entity.id;
        });
        this.#attachEntityShadow(model, binding);
        this.entityModelRoot.add(model);
        entry = {
          key: modelKey,
          object: model,
          yaw: Math.atan2(entity.vx, entity.vz) || 0,
          phase: this.#hashPhaseFromId(entity.id),
        };
        this.entityModelInstances.set(entity.id, entry);
      }

      const speedSq = entity.vx * entity.vx + entity.vz * entity.vz;
      const speed = Math.sqrt(speedSq);
      const targetYaw = speed > 0.03 ? Math.atan2(entity.vx, entity.vz) : entry.yaw;
      const turnSmooth = speed > 0.2 ? 0.26 : 0.11;
      entry.yaw = lerpAngle(entry.yaw, targetYaw, turnSmooth);
      const bobAmp = speed > 0.2 ? binding.bobAmp : binding.idleBobAmp;
      const bobFreq = speed > 0.2 ? 10 : 3.6;
      const bob = Math.sin(this.state.metrics.timeSec * bobFreq + entry.phase) * bobAmp;
      const lean = clamp(speed * binding.leanFactor, 0, 0.11);

      entry.object.position.set(entity.x, binding.y + bob, entity.z);
      entry.object.rotation.set(-lean, entry.yaw + binding.headingOffset, 0);
      entry.object.scale.set(binding.scale, binding.scale, binding.scale);
    }

    for (const [id, entry] of this.entityModelInstances.entries()) {
      if (alive.has(id)) continue;
      this.entityModelRoot.remove(entry.object);
      this.entityModelInstances.delete(id);
      removedAny = true;
    }
    if (removedAny) this.renderer?.renderLists?.dispose?.();
  }

  #extractEntityIdFromHitObject(object) {
    let cursor = object;
    while (cursor) {
      if (cursor.userData?.entityId) return cursor.userData.entityId;
      cursor = cursor.parent;
    }
    return null;
  }

  #collectEntityBuckets() {
    this.workerEntities.length = 0;
    this.visitorEntities.length = 0;
    this.herbivoreEntities.length = 0;
    this.predatorEntities.length = 0;
    this.allEntities.length = 0;
    this.entityById.clear();

    for (let i = 0; i < this.state.agents.length; i += 1) {
      const entity = this.state.agents[i];
      this.allEntities.push(entity);
      this.entityById.set(entity.id, entity);
      if (entity.type === ENTITY_TYPE.WORKER) {
        this.workerEntities.push(entity);
      } else if (entity.type === ENTITY_TYPE.VISITOR) {
        this.visitorEntities.push(entity);
      }
    }

    for (let i = 0; i < this.state.animals.length; i += 1) {
      const entity = this.state.animals[i];
      this.allEntities.push(entity);
      this.entityById.set(entity.id, entity);
      if (entity.kind === ANIMAL_KIND.HERBIVORE) {
        this.herbivoreEntities.push(entity);
      } else if (entity.kind === ANIMAL_KIND.PREDATOR) {
        this.predatorEntities.push(entity);
      }
    }
  }

  #setRenderPixelRatio(targetPixelRatio) {
    const clamped = Math.max(0.85, Math.min(this.basePixelRatio, targetPixelRatio));
    if (Math.abs(clamped - this.currentPixelRatio) < 0.01) return;
    this.currentPixelRatio = clamped;
    this.renderer.setPixelRatio(clamped);
  }

  #updateEntityMeshes() {
    this.#collectEntityBuckets();
    const totalEntities = this.allEntities.length;
    const spritesReady = this.unitSpriteTextures.size > 0;
    const spriteMode = Boolean(this.state.controls.showUnitSprites) && spritesReady && this.state.controls.visualPreset === "flat_worldsim";
    this.state.debug.unitSpriteLoaded = spritesReady;

    if (spriteMode) {
      this.#syncEntitySprites(this.allEntities);
      if (this.entityModelInstances.size > 0) {
        this.#clearGroup(this.entityModelRoot);
        this.entityModelInstances.clear();
      }

      this.workerMesh.visible = false;
      this.visitorMesh.visible = false;
      this.herbivoreMesh.visible = false;
      this.predatorMesh.visible = false;
      this.workerMesh.count = 0;
      this.visitorMesh.count = 0;
      this.herbivoreMesh.count = 0;
      this.predatorMesh.count = 0;
      this.workerMesh.instanceMatrix.needsUpdate = true;
      this.visitorMesh.instanceMatrix.needsUpdate = true;
      this.herbivoreMesh.instanceMatrix.needsUpdate = true;
      this.predatorMesh.instanceMatrix.needsUpdate = true;

      this.#setRenderPixelRatio(this.basePixelRatio);
      if (this.state.debug) {
        this.state.debug.renderMode = "sprites";
        this.state.debug.renderEntityCount = totalEntities;
        this.state.debug.renderModelDisableThreshold = this.modelDisableThreshold;
        this.state.debug.renderPixelRatio = this.currentPixelRatio;
      }
      return;
    }

    if (this.entitySpriteInstances.size > 0) {
      this.#clearEntitySpriteInstances();
    }

    let shouldUseEntityModels = this.useEntityModels;
    if (shouldUseEntityModels && totalEntities > this.modelDisableThreshold) shouldUseEntityModels = false;
    if (!shouldUseEntityModels && totalEntities < this.modelEnableThreshold) shouldUseEntityModels = true;
    if (shouldUseEntityModels !== this.useEntityModels) {
      this.useEntityModels = shouldUseEntityModels;
      if (!this.useEntityModels) {
        this.#clearGroup(this.entityModelRoot);
        this.entityModelInstances.clear();
        this.state.controls.actionMessage = `Fast render mode enabled (${totalEntities} entities).`;
        this.state.controls.actionKind = "info";
      } else {
        this.state.controls.actionMessage = `Detailed model mode restored (${totalEntities} entities).`;
        this.state.controls.actionKind = "info";
      }
    }

    this.#setRenderPixelRatio(this.useEntityModels ? this.basePixelRatio : this.lowQualityPixelRatio);

    if (this.useEntityModels) {
      this.#syncEntityModels(this.allEntities);
    } else if (this.entityModelInstances.size > 0) {
      this.#clearGroup(this.entityModelRoot);
      this.entityModelInstances.clear();
    }

    const workerFallbackVisible = !this.useEntityModels || !this.modelTemplates.has("worker");
    const visitorFallbackVisible = !this.useEntityModels || !(this.modelTemplates.has("visitorTrader") && this.modelTemplates.has("visitorSaboteur"));
    const herbivoreFallbackVisible = !this.useEntityModels || !this.modelTemplates.has("herbivore");
    const predatorFallbackVisible = !this.useEntityModels || !this.modelTemplates.has("predator");

    this.workerMesh.visible = workerFallbackVisible;
    this.visitorMesh.visible = visitorFallbackVisible;
    this.herbivoreMesh.visible = herbivoreFallbackVisible;
    this.predatorMesh.visible = predatorFallbackVisible;

    let i = 0;
    if (workerFallbackVisible) {
      for (const e of this.workerEntities) {
        setInstancedMatrix(this.workerMesh, i, e.x, 0.48, e.z);
        i += 1;
      }
      this.workerMesh.count = this.workerEntities.length;
    } else {
      this.workerMesh.count = 0;
    }
    this.workerMesh.instanceMatrix.needsUpdate = true;

    i = 0;
    if (visitorFallbackVisible) {
      for (const e of this.visitorEntities) {
        setInstancedMatrix(this.visitorMesh, i, e.x, 0.48, e.z);
        i += 1;
      }
      this.visitorMesh.count = this.visitorEntities.length;
    } else {
      this.visitorMesh.count = 0;
    }
    this.visitorMesh.instanceMatrix.needsUpdate = true;

    i = 0;
    if (herbivoreFallbackVisible) {
      for (const e of this.herbivoreEntities) {
        setInstancedMatrix(this.herbivoreMesh, i, e.x, 0.48, e.z);
        i += 1;
      }
      this.herbivoreMesh.count = this.herbivoreEntities.length;
    } else {
      this.herbivoreMesh.count = 0;
    }
    this.herbivoreMesh.instanceMatrix.needsUpdate = true;

    i = 0;
    if (predatorFallbackVisible) {
      for (const e of this.predatorEntities) {
        setInstancedMatrix(this.predatorMesh, i, e.x, 0.48, e.z);
        i += 1;
      }
      this.predatorMesh.count = this.predatorEntities.length;
    } else {
      this.predatorMesh.count = 0;
    }
    this.predatorMesh.instanceMatrix.needsUpdate = true;

    this.renderEntityLookup = {
      workers: this.workerEntities,
      visitors: this.visitorEntities,
      herbivores: this.herbivoreEntities,
      predators: this.predatorEntities,
    };

    if (this.state.debug) {
      this.state.debug.renderMode = this.useEntityModels ? "detailed" : "fast";
      this.state.debug.renderEntityCount = totalEntities;
      this.state.debug.renderModelDisableThreshold = this.modelDisableThreshold;
      this.state.debug.renderPixelRatio = this.currentPixelRatio;
    }
  }

  #pickEntity(mouse) {
    this.raycaster.setFromCamera(mouse, this.camera);
    const candidates = [];

    const spriteHits = this.raycaster.intersectObjects(this.entitySpriteRoot.children, true);
    for (const hit of spriteHits) {
      const id = this.#extractEntityIdFromHitObject(hit.object);
      if (!id) continue;
      const entity = this.entityById.get(id);
      if (!entity) continue;
      candidates.push({ entity, distance: hit.distance });
      break;
    }

    const modelHits = this.raycaster.intersectObjects(this.entityModelRoot.children, true);
    for (const hit of modelHits) {
      const id = this.#extractEntityIdFromHitObject(hit.object);
      if (!id) continue;
      const entity = this.entityById.get(id);
      if (!entity) continue;
      candidates.push({ entity, distance: hit.distance });
      break;
    }

    const workerHit = this.workerMesh.visible && this.workerMesh.count > 0 ? this.raycaster.intersectObject(this.workerMesh, true)[0] : null;
    const visitorHit = this.visitorMesh.visible && this.visitorMesh.count > 0 ? this.raycaster.intersectObject(this.visitorMesh, true)[0] : null;
    const herbivoreHit = this.herbivoreMesh.visible && this.herbivoreMesh.count > 0 ? this.raycaster.intersectObject(this.herbivoreMesh, true)[0] : null;
    const predatorHit = this.predatorMesh.visible && this.predatorMesh.count > 0 ? this.raycaster.intersectObject(this.predatorMesh, true)[0] : null;

    const hits = [workerHit, visitorHit, herbivoreHit, predatorHit].filter(Boolean);
    for (const hit of hits) {
      if (hit.object === this.workerMesh) {
        const entity = this.renderEntityLookup.workers[hit.instanceId] ?? null;
        if (entity) candidates.push({ entity, distance: hit.distance });
      }
      if (hit.object === this.visitorMesh) {
        const entity = this.renderEntityLookup.visitors[hit.instanceId] ?? null;
        if (entity) candidates.push({ entity, distance: hit.distance });
      }
      if (hit.object === this.herbivoreMesh) {
        const entity = this.renderEntityLookup.herbivores[hit.instanceId] ?? null;
        if (entity) candidates.push({ entity, distance: hit.distance });
      }
      if (hit.object === this.predatorMesh) {
        const entity = this.renderEntityLookup.predators[hit.instanceId] ?? null;
        if (entity) candidates.push({ entity, distance: hit.distance });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].entity;
  }

  #pickTile(mouse) {
    this.raycaster.setFromCamera(mouse, this.camera);
    const planeHit = this.raycaster.intersectObject(this.pickPlane, true)[0];
    if (!planeHit) return null;

    const tile = worldToTile(planeHit.point.x, planeHit.point.z, this.state.grid);
    if (!inBounds(tile.ix, tile.iz, this.state.grid)) return null;
    return { tile, point: planeHit.point };
  }

  #onPointerMove(event) {
    if (this.isCameraInteracting) return;
    const now = performance.now();
    if (now - this.lastPointerSampleMs < this.pointerSampleIntervalMs) return;
    this.lastPointerSampleMs = now;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    const picked = this.#pickTile(this.mouse);
    this.hoverTile = picked?.tile ?? null;
  }

  #onPointerDown(event) {
    if (event.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    const selected = this.#pickEntity(this.mouse);
    if (selected) {
      this.state.controls.selectedEntityId = selected.id;
      this.state.controls.selectedTile = null;
      if (this.state.debug) this.state.debug.selectedTile = null;
      this.state.controls.actionMessage = `Selected ${selected.displayName ?? selected.id}`;
      this.state.controls.actionKind = "info";
      this.onSelectEntity?.(selected.id);
      return;
    }

    const picked = this.#pickTile(this.mouse);
    if (!picked) return;

    const { tile } = picked;
    this.state.controls.selectedEntityId = null;
    this.#updateSelectedTile(tile.ix, tile.iz);
    const inspectOnly = event.altKey;
    if (inspectOnly) {
      this.state.controls.actionMessage = `Selected tile (${tile.ix}, ${tile.iz})`;
      this.state.controls.actionKind = "info";
      return;
    }

    const buildResult = this.buildSystem.placeToolAt(this.state, this.state.controls.tool, tile.ix, tile.iz);
    this.state.controls.buildPreview = buildResult;
    if (buildResult.ok) {
      this.#updateSelectedTile(tile.ix, tile.iz);
      this.state.controls.actionMessage = buildResult.message ?? `Built ${this.state.controls.tool} at (${tile.ix}, ${tile.iz})`;
      this.state.controls.actionKind = "success";
    } else {
      this.state.controls.actionMessage = buildResult.reasonText ?? explainBuildReason(buildResult.reason, buildResult);
      this.state.controls.actionKind = "error";
    }
  }

  #updateSelectedTile(ix, iz) {
    const idx = ix + iz * this.state.grid.width;
    const type = this.state.grid.tiles[idx];
    const info = TILE_INFO[type];
    const selected = {
      ix,
      iz,
      type,
      typeName: TILE_LABEL[type] ?? `TILE_${type}`,
      passable: Boolean(info?.passable),
      baseCost: Number(info?.baseCost ?? 0),
      height: Number(info?.height ?? 0),
      gridVersion: this.state.grid.version,
    };
    this.state.controls.selectedTile = selected;
    if (this.state.debug) this.state.debug.selectedTile = selected;
  }

  #updateOverlayMeshes() {
    if (!this.hoverTile) {
      this.hoverMesh.visible = false;
      this.previewMesh.visible = false;
      this.state.controls.buildPreview = null;
    } else {
      const p = tileToWorld(this.hoverTile.ix, this.hoverTile.iz, this.state.grid);
      this.hoverMesh.visible = true;
      this.hoverMesh.position.set(p.x, 0.17, p.z);

      const preview = this.buildSystem.previewToolAt(this.state, this.state.controls.tool, this.hoverTile.ix, this.hoverTile.iz);
      this.state.controls.buildPreview = preview;
      this.previewMesh.visible = true;
      this.previewMesh.position.set(p.x, 0.2, p.z);
      const color = preview.ok ? 0x6eeb83 : 0xff6b6b;
      this.previewMesh.material.color.setHex(color);
    }

    const selectedTile = this.state.controls.selectedTile;
    if (!selectedTile) {
      this.selectedTileMesh.visible = false;
    } else {
      const p = tileToWorld(selectedTile.ix, selectedTile.iz, this.state.grid);
      this.selectedTileMesh.visible = true;
      this.selectedTileMesh.position.set(p.x, 0.185, p.z);
    }

    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      this.selectionRing.visible = false;
      return;
    }

    const selected = this.entityById.get(selectedId);
    if (!selected) {
      this.selectionRing.visible = false;
      return;
    }

    this.selectionRing.visible = true;
    this.selectionRing.position.set(selected.x, 0.22, selected.z);
  }

  #applyRuntimeControlSettings() {
    const minZoom = clamp(Number(this.state.controls.cameraMinZoom) || 0.55, 0.3, 5);
    const maxZoom = clamp(Number(this.state.controls.cameraMaxZoom) || 3.2, minZoom + 0.1, 6);

    this.state.controls.cameraMinZoom = minZoom;
    this.state.controls.cameraMaxZoom = maxZoom;
    this.controls.minZoom = minZoom;
    this.controls.maxZoom = maxZoom;
    this.camera.zoom = clamp(this.camera.zoom, minZoom, maxZoom);

    const threshold = Math.max(80, Math.round(Number(this.state.controls.renderModelDisableThreshold) || 260));
    this.state.controls.renderModelDisableThreshold = threshold;
    this.modelDisableThreshold = threshold;
    this.modelEnableThreshold = Math.max(40, threshold - 40);

    const currentPreset = this.state.controls.visualPreset;
    const showTileIconsNow = Boolean(this.state.controls.showTileIcons)
      && currentPreset === "flat_worldsim";
    const visualChanged = this.lastVisualPreset !== currentPreset;
    const iconVisibilityChanged = this.lastShowTileIcons !== showTileIconsNow;
    if (visualChanged || iconVisibilityChanged) {
      this.lastVisualPreset = currentPreset;
      this.lastShowTileIcons = showTileIconsNow;
      this.#rebuildTileModels();
      this.#rebuildTileIcons();
      this.lastEntityRenderSignature = "";
    }
  }

  getViewState() {
    return {
      targetX: Number(this.controls.target.x) || DEFAULT_CAMERA_VIEW.targetX,
      targetZ: Number(this.controls.target.z) || DEFAULT_CAMERA_VIEW.targetZ,
      zoom: Number(this.camera.zoom) || DEFAULT_CAMERA_VIEW.zoom,
    };
  }

  applyViewState(view = null) {
    const nextTargetX = Number(view?.targetX);
    const nextTargetZ = Number(view?.targetZ);
    const nextZoom = Number(view?.zoom);
    const targetX = Number.isFinite(nextTargetX) ? nextTargetX : DEFAULT_CAMERA_VIEW.targetX;
    const targetZ = Number.isFinite(nextTargetZ) ? nextTargetZ : DEFAULT_CAMERA_VIEW.targetZ;
    const zoom = Number.isFinite(nextZoom) ? nextZoom : DEFAULT_CAMERA_VIEW.zoom;

    this.controls.target.set(targetX, 0, targetZ);
    this.camera.position.set(targetX, this.camera.position.y, targetZ);
    this.camera.zoom = clamp(zoom, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix();

    // OrbitControls keeps a damped pan delta internally, so flushing a few
    // updates here prevents the previous drag gesture from leaking into a
    // regenerated world or restored snapshot.
    for (let i = 0; i < 24; i += 1) {
      this.controls.update();
    }

    this.controls.target.set(targetX, 0, targetZ);
    this.camera.position.set(targetX, this.camera.position.y, targetZ);
    this.camera.updateProjectionMatrix();
    this.isCameraInteracting = false;
  }

  resetView() {
    this.applyViewState(DEFAULT_CAMERA_VIEW);
  }

  render(dt) {
    this.#applyRuntimeControlSettings();
    this.#syncVisualAssetDebug();
    this.#ensureModelTemplatesRequested();
    this.controls.update();
    this.#updateTileLayerVisibilityByZoom();
    this.#applyAtmosphere(dt);

    this.#rebuildTilesIfNeeded();
    const entityRenderSignature = [
      this.state.metrics.tick,
      this.state.agents.length,
      this.state.animals.length,
      this.state.controls.showUnitSprites ? 1 : 0,
      this.state.controls.visualPreset,
      this.modelDisableThreshold,
      this.modelTemplates.size,
    ].join("|");
    if (entityRenderSignature !== this.lastEntityRenderSignature) {
      this.lastEntityRenderSignature = entityRenderSignature;
      this.#updateEntityMeshes();
    }
    this.#updatePathLine();
    this.#updatePressureLens();
    this.#updateOverlayMeshes();

    const pixelRatio = this.renderer.getPixelRatio();
    const targetWidth = Math.floor(this.canvas.clientWidth * pixelRatio);
    const targetHeight = Math.floor(this.canvas.clientHeight * pixelRatio);
    if (
      this.renderer.domElement.width !== targetWidth ||
      this.renderer.domElement.height !== targetHeight
    ) {
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
      this.#updateOrthoProjection();
    }

    this.renderer.render(this.scene, this.camera);
  }

  #disposeMaterial(material) {
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.map) mat.map.dispose?.();
      mat.dispose?.();
    }
  }

  #disposeObject3D(root) {
    if (!root) return;
    root.traverse((node) => {
      if (node.geometry) node.geometry.dispose?.();
      if (node.material) this.#disposeMaterial(node.material);
    });
  }

  dispose() {
    this.canvas.removeEventListener("pointermove", this.boundOnPointerMove);
    this.canvas.removeEventListener("pointerleave", this.boundOnPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.boundOnPointerDown);
    this.canvas.removeEventListener("contextmenu", this.boundOnContextMenu);
    this.controls.removeEventListener("start", this.boundOnControlsStart);
    this.controls.removeEventListener("end", this.boundOnControlsEnd);

    this.controls?.dispose?.();
    this.#clearEntitySpriteInstances();
    for (const texture of this.unitSpriteTextures.values()) {
      texture.dispose?.();
    }
    this.unitSpriteTextures.clear();
    this.#disposeObject3D(this.scene);
    this.modelTemplates.clear();
    this.modelLoadPromises.clear();
    this.modelLoadErrors.clear();
    this.renderer?.dispose?.();
  }
}
