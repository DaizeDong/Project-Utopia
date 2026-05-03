import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { TILE_INFO, ENTITY_TYPE, ANIMAL_KIND, TILE, VISITOR_KIND } from "../config/constants.js";
import { BALANCE, CASUAL_UX } from "../config/balance.js";
import { tileToWorld, worldToTile, inBounds } from "../world/grid/Grid.js";
import { explainBuildReason, summarizeBuildPreview } from "../simulation/construction/BuildAdvisor.js";
import { onEvent, EVENT_TYPES } from "../simulation/meta/GameEventBus.js";
import { pushWarning } from "../app/warnings.js";
import { DEFAULT_DISPLAY_SETTINGS, sanitizeDisplaySettings } from "../app/controlSanitizers.js";
import { deriveAtmosphereProfile, applyDayNightModulation, getDayNightPhase, quantizeDayNightPhase, DAY_NIGHT_TINT_BINS } from "./AtmosphereProfile.js";
import { createProceduralTileTexture, resolveTileTextureMode } from "./ProceduralTileTextures.js";
import { buildPressureLens, buildHeatLens, heatLensSignature, classifyPlacementTiles, dedupPressureLabels, getPressureLabelRank, heatLabelBudgetForZoom } from "./PressureLens.js";
import { deriveVisualAssetDebugState } from "./visualAssetDebug.js";
import { FogOverlay } from "./FogOverlay.js";

const TILE_LABEL = Object.freeze(
  Object.entries(TILE).reduce((acc, [name, value]) => {
    acc[value] = name;
    return acc;
  }, {}),
);

// Build validity accent helper.
// Given a BuildSystem preview result and the active UI profile, compute a
// small description of how the hover preview should be accentuated:
//   { color: "#4ade80" | "#ef4444" | null, scale: 1.0 | 1.08,
//     reasonText: string, legal: boolean }
// The renderer calls this and forwards `scale` to the preview-mesh scale +
// `color` to the material tint. Extracted as a pure function so the
// casual-profile accent can be unit-tested without standing up Three.js.
// `null` color signals "no hover / no preview available".
export function describeBuildValidityAccent(preview, uiProfile = "casual") {
  if (!preview || typeof preview !== "object") {
    return { color: null, scale: 1.0, reasonText: "", legal: false };
  }
  const legal = Boolean(preview.ok);
  const color = legal ? "#4ade80" : "#ef4444";
  const scale = uiProfile === "casual" ? 1.08 : 1.0;
  const reasonText = legal
    ? String(preview.summary ?? "")
    : String(preview.reasonText ?? explainBuildReason(preview.reason, preview) ?? "");
  return { color, scale, reasonText, legal };
}

// Build click feedback layer.
// Pure helper: render a short floating-toast string from a BuildSystem result.
// Separated from DOM/THREE so unit tests can assert text shape without a
// rendering context. Shapes expected:
//   success: { ok: true, cost: { food, wood, stone, herbs } }
//     → "-N wood", joined by commas if multiple resources had non-zero cost
//     → "+built" when all cost entries are zero (e.g. erase tool with no refund)
//   failure, insufficient: { ok: false, reason: "insufficientResource",
//                             cost: {...}, resources: {...} }
//     → "Need N more wood, M more stone" (only resources that fell short)
//   failure, other reasons: { ok: false, reasonText: "<text>" } → that text
// The `resources` input is optional; when missing or the reason is not
// insufficientResource, we fall back to reasonText.
export function formatToastText(buildResult, resources = null) {
  if (!buildResult || typeof buildResult !== "object") return "blocked";
  const RESOURCE_KEYS = ["food", "wood", "stone", "herbs"];
  if (buildResult.ok) {
    const cost = buildResult.cost ?? {};
    const parts = [];
    for (const k of RESOURCE_KEYS) {
      const v = Number(cost[k] ?? 0);
      if (v > 0) parts.push(`-${v} ${k}`);
    }
    if (parts.length === 0) return "+built";
    return parts.join(", ");
  }
  if (buildResult.reason === "insufficientResource" && resources) {
    const cost = buildResult.cost ?? {};
    const shortfalls = [];
    for (const k of RESOURCE_KEYS) {
      const need = Number(cost[k] ?? 0);
      const have = Number(resources[k] ?? 0);
      const gap = need - have;
      if (gap > 0) shortfalls.push(`${gap} more ${k}`);
    }
    if (shortfalls.length > 0) {
      const recovery = String(buildResult.recoveryText ?? "").trim();
      return recovery ? `Need ${shortfalls.join(", ")}. ${recovery}` : `Need ${shortfalls.join(", ")}`;
    }
  }
  const reason = String(buildResult.reasonText ?? "blocked");
  const recovery = String(buildResult.recoveryText ?? "").trim();
  return recovery && reason !== "blocked" ? `${reason} ${recovery}` : reason;
}

const MAT_TMP = new THREE.Matrix4();
const MAT_Q = new THREE.Quaternion();
const MAT_P = new THREE.Vector3();
const MAT_S = new THREE.Vector3();
const COLOR_TMP = new THREE.Color();
const VEC_TMP = new THREE.Vector3();

// v0.9.1 perf — hoisted out of the per-frame terrain-overlay loops and the
// per-tooltip header loop. Allocating a fresh Set on every overlay rebuild was
// pure waste; a frozen module-scope Set has identical Set#has semantics.
const TERRAIN_OVERLAY_RESOURCE_TILES = Object.freeze(new Set([TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]));

// Screen-space proximity fallback + build-guard.
// The worker InstancedMesh geometry has radius ~0.35 world units, which at
// typical camera zoom translates to roughly 8–12 screen pixels. That means
// the default THREE.Raycaster pick on the InstancedMesh almost never hits
// when the user clicks near (but not exactly on) a worker sprite, leaving
// the Entity Focus panel stuck on "No entity selected". These two constants
// define the screen-space fallback radius used by
// `findProximityEntity` / `#proximityNearestEntity`:
//   - ENTITY_PICK_FALLBACK_PX (24): select the nearest entity when exact
//     raycast returns no hit. ≈ 1 tile at default zoom, low enough to
//     avoid mis-selecting neighbours.
//   - ENTITY_PICK_GUARD_PX (14): when a build tool is active, suppress the
//     build placement and redirect the click to entity-pick if the click
//     landed within this radius of a worker. v0.10.1-A3 R2 (F1) — was 36
//     px, which was a *perception buffer* that mis-treated "entity-near"
//     as "entity-on": with the 36 px guard, almost any click on grass
//     within ~3 tiles of a wandering animal silently emitted "Selecting
//     nearby unit (release the build tool to place)" instead of placing
//     the road, so the first-impression reviewer's "I can't place a road"
//     P0 reproduced every single time. The new 14 px threshold matches
//     the worker sprite's *visual hitbox* (~12 px) + 2 px slop, so only
//     clicks that actually overlap a worker fall through to entity-pick.
// v0.8.2 Round-5b (02a-rimworld-veteran Step 5) — hitbox sourced from BALANCE
// so uiProfile can enlarge picks for non-casual (RimWorld veteran) players.
const ENTITY_PICK_FALLBACK_PX = Number(BALANCE.renderHitboxPixels?.entityPickFallback ?? 24);
const ENTITY_PICK_GUARD_PX = Number(BALANCE.renderHitboxPixels?.entityPickGuard ?? 14);

// Pure helper for screen-space proximity pick. Extracted from
// SceneRenderer.#pickEntity so it can be unit-tested without standing up
// Three.js renderers / canvases.
//
//   entities: iterable of { id, x, z, alive? }. Dead entities (alive===false)
//     are filtered out.
//   projectWorldToNdc(x, z): ({ ndcX, ndcY }) — caller-provided projection,
//     normally `new THREE.Vector3(x, 0, z).project(camera)` mapped to NDC
//     {-1..+1, -1..+1}.
//   mouseNdc: { x, y } — the pointer position in the same NDC space.
//   viewport: { width, height } — canvas pixel size; used to convert NDC
//     deltas back to pixel distances (NDC uses half-extents, so
//     dx_px = (ndc.x - mouse.x) * 0.5 * width).
//   thresholdPx: max allowed screen-pixel distance; entities outside this
//     radius are skipped.
//
// Returns: { entity, pixelDistance } | null. Stable tie-break: first match
// in iteration order wins on exact tie (should be impossible with floats).
export function findProximityEntity({ entities, projectWorldToNdc, mouseNdc, viewport, thresholdPx }) {
  if (!entities || typeof projectWorldToNdc !== "function") return null;
  if (!mouseNdc || !viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return null;
  if (!Number.isFinite(thresholdPx) || thresholdPx <= 0) return null;

  const halfW = viewport.width * 0.5;
  const halfH = viewport.height * 0.5;
  let best = null;
  for (const entity of entities) {
    if (!entity) continue;
    if (entity.alive === false) continue;
    const wx = Number(entity.x);
    const wz = Number(entity.z);
    if (!Number.isFinite(wx) || !Number.isFinite(wz)) continue;
    const ndc = projectWorldToNdc(wx, wz);
    if (!ndc || !Number.isFinite(ndc.ndcX) || !Number.isFinite(ndc.ndcY)) continue;
    // Skip entities behind the camera (beyond far plane) if caller signalled
    // with ndcZ > 1. Optional — callers may omit ndcZ.
    if (Number.isFinite(ndc.ndcZ) && ndc.ndcZ > 1) continue;
    const dxPx = (ndc.ndcX - mouseNdc.x) * halfW;
    const dyPx = (ndc.ndcY - mouseNdc.y) * halfH;
    const pixelDistance = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    if (pixelDistance > thresholdPx) continue;
    if (!best || pixelDistance < best.pixelDistance) {
      best = { entity, pixelDistance };
    }
  }
  return best;
}

function setInstancedMatrix(mesh, index, x, y, z, sx = 1, sy = 1, sz = 1) {
  MAT_P.set(x, y, z);
  MAT_S.set(sx, sy, sz);
  MAT_TMP.compose(MAT_P, MAT_Q, MAT_S);
  mesh.setMatrixAt(index, MAT_TMP);
}

// v0.10.1-A4 R1 (V5 P2 #4) — Deterministic per-entity stack jitter to break
// up worker / visitor / herbivore / predator z-fighting when 4+ entities pile
// on the same tile. Pure function of the entity id (Knuth-multiplicative
// hash → 32-bit unsigned → unit interval). Horizontal range is ±0.16 world
// units (~⅓ tile half-width so entities never visually cross to the
// neighbour); vertical range is 0..0.06 units which is below the shadow
// bias threshold so cast shadows do not pop. No new entity field — the
// hash is derived from the existing integer id at render time.
const STACK_JITTER_HASH = 2654435761; // Knuth multiplicative
const STACK_JITTER_INV = 1 / 0xffffffff;
function entityStackJitter(id) {
  const h = (((id | 0) * STACK_JITTER_HASH) >>> 0) * STACK_JITTER_INV;
  const dx = (h - 0.5) * 0.32;
  const dy = ((h * 7) % 1) * 0.06;
  const dz = (((h * 13) % 1) - 0.5) * 0.32;
  return { dx, dy, dz };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerpAngle(a, b, t) {
  const full = Math.PI * 2;
  const delta = ((b - a + Math.PI) % full + full) % full - Math.PI;
  return a + delta * t;
}

function createRendererWithFallback(canvas, displaySettings = DEFAULT_DISPLAY_SETTINGS) {
  const { settings } = sanitizeDisplaySettings(displaySettings, DEFAULT_DISPLAY_SETTINGS);
  const preferredPower = settings.powerPreference;
  const attempts = settings.antialias === "off"
    ? [
        { antialias: false, powerPreference: preferredPower, compatibilityFallback: false },
        { antialias: false, powerPreference: "default", compatibilityFallback: true },
        { antialias: true, powerPreference: preferredPower, compatibilityFallback: false },
      ]
    : [
        { antialias: true, powerPreference: preferredPower, compatibilityFallback: false },
        { antialias: false, powerPreference: preferredPower, compatibilityFallback: true },
        { antialias: false, powerPreference: "default", compatibilityFallback: true },
      ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const { compatibilityFallback, ...rendererOptions } = attempt;
      const renderer = new THREE.WebGLRenderer({ canvas, ...rendererOptions });
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
  // v0.8.8 A14 — TODO removed. Per-instance amber pulse for warehouses
  // under active raid is signalled via the PressureLens markers
  // (lensMode === "heat") and the floating "Raid !" toast spawned by
  // RaidSystem; the instanced-tile path remains type-shared.
  [TILE.WALL]: { key: "wallTile", scale: { x: 0.95, y: 0.46, z: 0.26 }, y: 0.03, randomYaw: false, autoYaw: true },
  [TILE.RUINS]: { key: "ruinsTile", scale: { x: 0.68, y: 0.42, z: 0.68 }, y: 0.04, randomYaw: true, jitter: 0.1, scaleJitter: 0.12 },
  // v0.8.4 strategic walls + GATE (Agent C). Reuse the wall model template
  // but with shorter pillars (y: 0.32 vs wall's 0.46) and a horizontal-only
  // yaw so the gate visually reads as an opening. autoYaw is intentionally
  // disabled — gates should track their wall-line orientation but with a
  // gap; we use the wall yaw heuristic against neighbouring WALL tiles.
  [TILE.GATE]: { key: "wallTile", scale: { x: 0.95, y: 0.32, z: 0.18 }, y: 0.03, randomYaw: false, autoYaw: true },
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
  // v0.8.4 strategic walls + GATE (Agent C). Reuse the wall icon for now;
  // a dedicated gate atlas entry is a future polish pass.
  [TILE.GATE]: "WALL",
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
  // v0.10.1-A4 R1 (V5 P2 #3) — halve repeatX/repeatY on WALL/RUINS/QUARRY/GATE
  // so the procedural texture cells double in size, eliminating the visible
  // 8×8 "developer placeholder grid" that read as a checker pattern when
  // mountain/wall clusters render at the top of the frame. WALL roughness
  // dropped 0.88 → 0.82 so the directional light catches the larger cells
  // and breaks up flat appearance under the R1 amplified day-night tint.
  [TILE.WALL]: { key: "wall", tint: 0xb6c1cd, repeatX: 4, repeatY: 4, roughness: 0.82, emissive: 0x30363f, emissiveIntensity: 0.05 },
  [TILE.RUINS]: { key: "props", tint: 0xc19b81, repeatX: 5, repeatY: 5, roughness: 0.92, emissive: 0x432f24, emissiveIntensity: 0.06 },
  [TILE.WATER]: { key: "grass", tint: 0x86c8f8, repeatX: 12, repeatY: 12, roughness: 0.66, emissive: 0x1f527f, emissiveIntensity: 0.12 },
  [TILE.QUARRY]: { key: "props", tint: 0xb8a88e, repeatX: 5, repeatY: 5, roughness: 0.93, emissive: 0x3d3028, emissiveIntensity: 0.06 },
  [TILE.HERB_GARDEN]: { key: "plants", tint: 0x8fd47a, repeatX: 10, repeatY: 10, roughness: 0.95, emissive: 0x1f3d1a, emissiveIntensity: 0.07 },
  [TILE.KITCHEN]: { key: "structure", tint: 0xe0be74, repeatX: 8, repeatY: 8, roughness: 0.9, emissive: 0x4c3a18, emissiveIntensity: 0.06 },
  [TILE.SMITHY]: { key: "structure", tint: 0xa08e7a, repeatX: 8, repeatY: 8, roughness: 0.88, emissive: 0x2a2018, emissiveIntensity: 0.06 },
  [TILE.CLINIC]: { key: "structure", tint: 0xc8e0c0, repeatX: 8, repeatY: 8, roughness: 0.92, emissive: 0x2a3d28, emissiveIntensity: 0.06 },
  [TILE.BRIDGE]: { key: "road", tint: 0xb09878, repeatX: 10, repeatY: 10, roughness: 0.92, emissive: 0x3a2a1a, emissiveIntensity: 0.06 },
  // v0.8.4 strategic walls + GATE (Agent C). Warm wood tint so gates read
  // visually distinct from the cold-grey wall texture. Reuses the wall
  // texture key (which has a brick-pattern look that's gate-adjacent).
  [TILE.GATE]: { key: "wall", tint: 0xb38a55, repeatX: 3, repeatY: 3, roughness: 0.86, emissive: 0x4a3520, emissiveIntensity: 0.07 },
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
  // v0.10.1-n A3 — was 1.12; framing the full grid on first paint requires
  // zoom 1.0 so applyViewState(DEFAULT_CAMERA_VIEW) does not snap back to a
  // tighter view than the constructor-set frustum (P0 first-impression bug).
  zoom: 1.0,
});

/**
 * v0.10.1-n A3 — pure pointer-priority decision helper extracted from
 * #onPointerDown so the (tool-vs-entity) priority logic can be unit-tested
 * without instantiating a WebGL renderer. Mirrors the order #onPointerDown
 * implements: a placement tool tries the tile first; an entity-pick is the
 * fallback when (a) the user is inside the 14 px guard radius around a
 * worker (R2 F1: tightened from 36 px so only clicks that actually overlap
 * a worker fall through) or (b) placement was rejected because the tile is
 * occupied by an entity.
 *
 * @param {object} ctx
 * @param {string|null} ctx.activeTool - state.controls.tool ("road","select",…)
 * @param {boolean} ctx.entityNearby - within ENTITY_PICK_GUARD_PX
 * @param {boolean} ctx.tilePlaceable - placeToolAt would return ok:true
 * @param {boolean} ctx.tileOccupiedByEntity - placeToolAt would return reason:"occupiedTile"
 * @returns {"place" | "select"}
 */
export function decidePointerTarget({ activeTool, entityNearby, tilePlaceable, tileOccupiedByEntity }) {
  const isPlacementTool = activeTool && activeTool !== "select" && activeTool !== "inspect";
  if (!isPlacementTool) {
    // Pure select / inspect: entity always wins when one is nearby.
    return entityNearby ? "select" : "select";
  }
  // Placement tool active. Tile-first priority unless the user is clearly
  // aiming at a worker, OR the placement collides with an entity-on-tile.
  if (entityNearby) return "select";
  if (tilePlaceable) return "place";
  if (tileOccupiedByEntity) return "select";
  // Other placement failures (water, hardCap, no resource, …) — surface
  // the rejection, NOT a silent entity selection.
  return "place";
}
export const PRESSURE_MARKER_STYLE = Object.freeze({
  route: Object.freeze({ ring: 0xffa75a, fill: 0xffe0b8, ringOpacity: 0.58, fillOpacity: 0.16 }),
  depot: Object.freeze({ ring: 0x71d9ff, fill: 0xc8f4ff, ringOpacity: 0.54, fillOpacity: 0.14 }),
  weather: Object.freeze({ ring: 0x72b9ff, fill: 0xd0e8ff, ringOpacity: 0.5, fillOpacity: 0.13 }),
  bandit_raid: Object.freeze({ ring: 0xff6d6d, fill: 0xffcbc4, ringOpacity: 0.62, fillOpacity: 0.15 }),
  trade_caravan: Object.freeze({ ring: 0xf0cf78, fill: 0xffefbe, ringOpacity: 0.5, fillOpacity: 0.12 }),
  animal_migration: Object.freeze({ ring: 0x9bde84, fill: 0xdaf2c7, ringOpacity: 0.48, fillOpacity: 0.12 }),
  traffic: Object.freeze({ ring: 0xffcd6c, fill: 0xffefc5, ringOpacity: 0.52, fillOpacity: 0.13 }),
  ecology: Object.freeze({ ring: 0x8ed66f, fill: 0xd8efb7, ringOpacity: 0.48, fillOpacity: 0.12 }),
  event: Object.freeze({ ring: 0xff9d80, fill: 0xffdccb, ringOpacity: 0.5, fillOpacity: 0.12 }),
  // v0.8.0 Phase 7.C — Supply-Chain Heat Lens channels (spec § 6).
  heat_surplus: Object.freeze({ ring: 0xff5a48, fill: 0xff9180, ringOpacity: 0.72, fillOpacity: 0.22 }),
  heat_starved: Object.freeze({ ring: 0x4aa8ff, fill: 0x9fd0ff, ringOpacity: 0.7, fillOpacity: 0.22 }),
  heat_idle: Object.freeze({ ring: 0x8a94a2, fill: 0xb6bdc6, ringOpacity: 0.34, fillOpacity: 0.08 }),
});
export const HEAT_TILE_OVERLAY_VISUAL = Object.freeze({
  heat_surplus: Object.freeze({ opacity: 0.62 }),
  heat_starved: Object.freeze({ opacity: 0.56 }),
  heat_idle: Object.freeze({ opacity: 0.44 }),
  pulseAmplitude: 0.28,
});

// v0.8.7.1 P3 — road-distance field. BFS from every road/warehouse/bridge
// tile out to MAX dist; both connectivity overlay (#buildTerrainConnectivity-
// Markers) and tooltip header (road/warehouse) read field[ix + iz*width] in
// O(1) instead of redoing a 7×7 Manhattan scan per tile.
const ROAD_DISTANCE_MAX = 6;
function buildRoadDistanceField(grid) {
  const { width, height, tiles } = grid;
  const field = new Uint8Array(width * height);
  field.fill(255);
  const queue = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (t === TILE.ROAD || t === TILE.WAREHOUSE || t === TILE.BRIDGE) {
      field[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head]; head += 1;
    const dist = field[idx];
    if (dist >= ROAD_DISTANCE_MAX) continue;
    const ix = idx % width;
    const iz = (idx - ix) / width;
    const next = dist + 1;
    if (ix > 0) {
      const n = idx - 1;
      if (field[n] > next) { field[n] = next; queue.push(n); }
    }
    if (ix < width - 1) {
      const n = idx + 1;
      if (field[n] > next) { field[n] = next; queue.push(n); }
    }
    if (iz > 0) {
      const n = idx - width;
      if (field[n] > next) { field[n] = next; queue.push(n); }
    }
    if (iz < height - 1) {
      const n = idx + width;
      if (field[n] > next) { field[n] = next; queue.push(n); }
    }
  }
  return field;
}

export class SceneRenderer {
  constructor(canvas, state, buildSystem, onSelectEntity) {
    this.canvas = canvas;
    this.state = state;
    this.buildSystem = buildSystem;
    this.onSelectEntity = onSelectEntity;
    this.hoverTile = null;
    this.state.controls.display = sanitizeDisplaySettings(this.state.controls.display, DEFAULT_DISPLAY_SETTINGS).settings;

    const { renderer, attempt: rendererAttempt } = createRendererWithFallback(canvas, this.state.controls.display);
    this.renderer = renderer;
    this.rendererAttempt = rendererAttempt;
    this.compatibilityRenderer = Boolean(rendererAttempt.compatibilityFallback);
    this.rendererAntialias = Boolean(rendererAttempt.antialias);
    const deviceMemory = Number(globalThis?.navigator?.deviceMemory ?? 0);
    this.lowMemoryMode = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 8;
    this.basePixelRatio = this.lowMemoryMode ? 1 : Math.min(1.25, window.devicePixelRatio || 1);
    this.lowQualityPixelRatio = this.lowMemoryMode ? 0.55 : 0.6;
    this.ultraLowQualityPixelRatio = this.lowMemoryMode ? 0.45 : 0.5;
    this.currentPixelRatio = this.basePixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.activeShadowQuality = this.#effectiveShadowQuality();
    this.renderer.shadowMap.enabled = this.activeShadowQuality !== "off";
    this.renderer.shadowMap.type = this.#shadowMapType(this.activeShadowQuality);
    this.appliedDisplaySignature = "";

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
    this.state.controls.display = this.#displaySettings();
    this.state.debug.rendererAntialias = this.rendererAntialias;
    this.state.debug.rendererPowerPreference = rendererAttempt.powerPreference;
    this.state.debug.shadowQuality = this.activeShadowQuality;
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

    // v0.10.1-n A3 — was 0.65 (=62.4 frustum height vs 96-wide grid → only
    // ~58% of map visible at zoom 1.12). 1.05 expands the orthographic
    // frustum to span the full 96×72 grid plus a small margin on first
    // paint so the player sees both lumber-route and ruined-depot markers
    // before the camera ever re-frames.
    this.orthoSize = Math.max(state.grid.width, state.grid.height) * 1.05;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.camera.position.set(0, 120, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.#updateOrthoProjection();
    this.camera.zoom = 1.0;
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
    // v0.8.8 A12 (QA3 L6) — sentinel that mismatches any computed integer
    // hash so the first frame always rebuilds.
    this.lastEntityRenderSignature = NaN;
    this.entityMeshUpdateAccumulatorSec = Infinity;
    this.pressureLensMarkers = [];
    this.lastPressureLensSignature = "";
    // v0.8.0 Phase 7.C — supply-chain heat lens overlay toggle.
    // Modes: "pressure" (default scenario/weather markers), "heat" (supply-chain
    // red/blue/grey channels), "off" (hide all lens markers entirely).
    this.lensMode = "pressure";
    this.lastHeatLensSignature = "";
    this.lastPlacementLensSignature = "";
    // Terrain Overlay — toggled by T key. null | "fertility" | "elevation" | "connectivity" | "nodeDepletion"
    this.terrainLensMode = null;
    // v0.9.1 perf — replaced 6912-element Mesh pool with InstancedMesh buckets
    // keyed by opacity tier. See #setupPressureLensMeshes for the live state.
    this.terrainOverlayBuckets = null;
    this.lastTerrainVersion = -1;
    this.lastTerrainLensMode = null;
    // Tile info tooltip DOM element (resolved lazily).
    this.tileInfoTooltipEl = null;
    this.tileInfoLastTile = null;
    // Track last pointer position for tooltip positioning.
    this.lastPointerClientX = 0;
    this.lastPointerClientY = 0;
    // v0.8.2 — Pressure lens HTML label pool (populated lazily from #pressureLabelLayer).
    this.pressureLabelPool = [];
    this.pressureLabelLayerEl = null;
    // v0.10.1 R1 (A2 perf) — instance-scope scratch buffers for the
    // pressure-label projection / dedup / visibility loops. Reused every
    // frame via `arr.length = 0` and `map.clear()` so the per-frame work
    // does not allocate a new array/Map. Must be `this._*` (per-instance)
    // not module-scope so multiple SceneRenderer instances (Playwright /
    // hot-reload) cannot cross-contaminate.
    this._labelProjectedScratch = [];
    this._labelEntriesScratch = [];
    this._labelEntryToPoolIdxScratch = [];
    this._labelVisibleCandidatesScratch = [];
    this._labelVisibleScratchMap = new Map();

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
    this.fogOverlay = new FogOverlay(this.state.grid);
    this.fogOverlay.attach(this.scene);

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
    this.#setupConstructionOverlayMeshes();
    this.#setupPressureLensMeshes();
    this.#loadWorldSimManifest();
    this.#applyRendererDisplaySettings();
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
      this.#hideTileInfoTooltip();
    };
    this.boundOnPointerDown = (e) => this.#onPointerDown(e);

    // Build-feedback toast pool. Pre-allocate 6 reusable DOM nodes so rapid-fire
    // clicks at 2x speed don't churn the heap. We look up #floatingToastLayer
    // lazily because SceneRenderer may be instantiated in test environments
    // without that node present.
    this.toastLayer = typeof document !== "undefined"
      ? document.getElementById("floatingToastLayer")
      : null;
    this.toastPool = [];
    this.lastToastTileKey = "";
    this.lastToastTimeMs = 0;
    this.boundDeathToastEvent = (event) => this.#handleDeathToastEvent(event);
    this.boundMilestoneToastEvent = (event) => this.#handleMilestoneToastEvent(event);
    onEvent(this.state, EVENT_TYPES.WORKER_STARVED, this.boundDeathToastEvent);
    onEvent(this.state, EVENT_TYPES.WORKER_DIED, this.boundDeathToastEvent);
    onEvent(this.state, EVENT_TYPES.COLONY_MILESTONE, this.boundMilestoneToastEvent);
    this.boundOnContextMenu = (e) => e.preventDefault();
    this.boundOnControlsStart = () => {
      this.isCameraInteracting = true;
      this.hoverTile = null;
      this.#hideTileInfoTooltip();
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

  // v0.8.7.1 P5 — cache sanitized display settings against the input
  // reference identity. Sanitizer runs ~once per state.controls.display
  // mutation instead of every call site (HUD/render/textureQuality/etc.).
  #displaySettings() {
    const input = this.state.controls.display;
    const cache = this._displaySettingsCache;
    if (cache && cache.input === input) return cache.output;
    const { settings } = sanitizeDisplaySettings(input, DEFAULT_DISPLAY_SETTINGS);
    this.state.controls.display = settings;
    // After replacement, both pre-sanitize and post-sanitize references map
    // to the cached output. Stash both so the next call short-circuits.
    this._displaySettingsCache = { input: settings, output: settings };
    return settings;
  }

  #effectiveShadowQuality(settings = this.#displaySettings()) {
    if (settings.renderMode === "2d") return "off";
    if (this.compatibilityRenderer) return "off";
    const requested = settings.shadowQuality;
    if (requested === "off") return "off";
    if (requested === "low" || requested === "medium" || requested === "high") return requested;
    return this.lowMemoryMode ? "low" : "medium";
  }

  #shadowMapType(quality) {
    if (quality === "high" || quality === "medium") return THREE.PCFSoftShadowMap;
    return THREE.BasicShadowMap;
  }

  #shadowMapSize(quality) {
    if (quality === "high") return 2048;
    if (quality === "medium") return 1536;
    if (quality === "low") return 768;
    return 0;
  }

  #textureQualityOptions(quality = this.#displaySettings().textureQuality) {
    const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
    if (quality === "ultra") return { mipmaps: true, anisotropy: maxAnisotropy };
    if (quality === "high") return { mipmaps: true, anisotropy: Math.min(8, maxAnisotropy) };
    if (quality === "medium") return { mipmaps: true, anisotropy: Math.min(4, maxAnisotropy) };
    return { mipmaps: false, anisotropy: 1 };
  }

  #applyTextureQuality() {
    const options = this.#textureQualityOptions();
    const apply = (texture, pixelated = false) => {
      if (!texture) return;
      if (pixelated) {
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.anisotropy = 1;
      } else {
        texture.minFilter = options.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = options.mipmaps;
        texture.anisotropy = options.anisotropy;
      }
      texture.needsUpdate = true;
    };

    for (const material of this.tileMaterialsByType.values()) {
      apply(material?.map, false);
    }
    for (const material of this.tileIconMaterials.values()) {
      apply(material?.map, true);
    }
    for (const texture of this.unitSpriteTextures.values()) {
      apply(texture, true);
    }
  }

  #applyShadowFlags(enabled) {
    if (this.sunLight) this.sunLight.castShadow = enabled;
    for (const mesh of this.tileMeshesByType?.values?.() ?? []) {
      mesh.receiveShadow = enabled;
    }
    const entityMeshes = [this.workerMesh, this.visitorMesh, this.herbivoreMesh, this.predatorMesh];
    for (const mesh of entityMeshes) {
      if (!mesh) continue;
      mesh.castShadow = enabled;
      mesh.receiveShadow = enabled;
    }
    this.entityModelRoot?.traverse?.((node) => {
      if (node.userData?.entityShadow) node.visible = enabled;
      if (!node.isMesh) return;
      node.castShadow = enabled;
      node.receiveShadow = enabled;
    });
    this.entitySpriteRoot?.traverse?.((node) => {
      if (node.userData?.entityShadow) node.visible = enabled;
    });
  }

  #applyRendererDisplaySettings() {
    const settings = this.#displaySettings();
    const shadowQuality = this.#effectiveShadowQuality(settings);
    const signature = [
      settings.textureQuality,
      shadowQuality,
      settings.renderMode,
      settings.effectsEnabled ? 1 : 0,
      settings.weatherParticles ? 1 : 0,
      settings.fogEnabled ? 1 : 0,
      settings.heatLabels ? 1 : 0,
      settings.entityAnimations ? 1 : 0,
    ].join("|");
    if (signature === this.appliedDisplaySignature) return;
    this.appliedDisplaySignature = signature;
    this.activeShadowQuality = shadowQuality;
    const shadowsEnabled = shadowQuality !== "off";
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.renderer.shadowMap.type = this.#shadowMapType(shadowQuality);
    if (this.sunLight) {
      this.sunLight.castShadow = shadowsEnabled;
      const size = this.#shadowMapSize(shadowQuality);
      if (size > 0) this.sunLight.shadow.mapSize.set(size, size);
      this.sunLight.shadow.needsUpdate = true;
    }
    this.#applyShadowFlags(shadowsEnabled);
    this.#applyTextureQuality();
    // v0.8.8 A12 (QA3 L6) — NaN sentinel mismatches any computed hash so
    // the next frame rebuilds. Was empty string before the hash refactor.
    this.lastEntityRenderSignature = NaN;
    if (this.state.debug) {
      this.state.debug.shadowQuality = shadowQuality;
      this.state.debug.rendererAntialias = this.rendererAntialias;
      this.state.debug.rendererPowerPreference = this.rendererAttempt?.powerPreference ?? "default";
      this.state.debug.displaySettings = { ...settings, effectiveShadowQuality: shadowQuality };
    }
  }

  applyDisplaySettings(settings = this.state.controls.display) {
    this.state.controls.display = sanitizeDisplaySettings(settings, DEFAULT_DISPLAY_SETTINGS).settings;
    this.#applyRendererDisplaySettings();
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
    // v0.8.4 strategic walls + GATE (Agent C). Walls and gates share yaw
    // logic — a gate placed in a wall line should align with the wall
    // segments on either side. We treat both WALL and GATE as wall-line
    // members for the orientation hint.
    const left = this.#tileAt(ix - 1, iz) === TILE.WALL || this.#tileAt(ix - 1, iz) === TILE.GATE;
    const right = this.#tileAt(ix + 1, iz) === TILE.WALL || this.#tileAt(ix + 1, iz) === TILE.GATE;
    const up = this.#tileAt(ix, iz - 1) === TILE.WALL || this.#tileAt(ix, iz - 1) === TILE.GATE;
    const down = this.#tileAt(ix, iz + 1) === TILE.WALL || this.#tileAt(ix, iz + 1) === TILE.GATE;
    const horizontal = left || right;
    const vertical = up || down;
    if (horizontal && !vertical) return 0;
    if (vertical && !horizontal) return Math.PI / 2;
    return this.#hash01(ix, iz, 32) > 0.5 ? 0 : Math.PI / 2;
  }

  #tileYaw(ix, iz, tileType, binding) {
    if (binding.autoYaw && tileType === TILE.ROAD) return this.#roadYawForTile(ix, iz);
    // v0.8.4 strategic walls + GATE (Agent C). Both WALL and GATE use the
    // shared wall-yaw heuristic so a gate-in-a-wall-line orients with the
    // surrounding wall segments.
    if (binding.autoYaw && (tileType === TILE.WALL || tileType === TILE.GATE)) return this.#wallYawForTile(ix, iz);
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
    const display = this.#displaySettings();
    if (display.renderMode === "2d") return;
    const needsModels = display.renderMode === "3d"
      || this.state.controls.visualPreset !== "flat_worldsim"
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
    // PHH R11 (Plan-PHH-convoy-feel): per-tile foot-traffic EWMA weights.
    // Per-tile index 0..(W*H-1) → weight ∈ [0..4]. Decays toward 0 over
    // ~30 sim-sec (half-life). Used to amber-tint road tiles via setColorAt.
    this._roadTrafficWeights = new Float32Array(this.state.grid.width * this.state.grid.height);
    // Reverse map (tileIdx → road instance index), filled in #rebuildTilesIfNeeded.
    this._roadInstanceIdxByTileIdx = new Int32Array(this.state.grid.width * this.state.grid.height).fill(-1);
    this._roadTintColor = new THREE.Color();
    this._roadBaseColor = new THREE.Color(TILE_INFO[TILE.ROAD]?.color ?? 0xb89a76);
    this._roadAmberColor = new THREE.Color(0xff9a3a);
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
    const quality = this.#textureQualityOptions();
    const useMipmaps = options.mipmaps ?? (pixelated ? false : quality.mipmaps);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (pixelated) {
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.anisotropy = 1;
    } else {
      texture.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = useMipmaps;
      texture.anisotropy = clamp(Number(options.anisotropy) || quality.anisotropy, 1, quality.anisotropy);
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
    // PGG R11 (Plan-PGG-sphere-dominance): lift sphere visual weight (+24 % area)
    // so agents out-pop painted tile glyphs. Was 0.34; now 0.42.
    const sphere = new THREE.SphereGeometry(0.42, 14, 14);
    const maxWorkers = 1200;
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

    // PGG R11 (Plan-PGG-sphere-dominance): subtle additive-blend white halo per
    // entity so spheres read against any tile background. One InstancedMesh per
    // entity bucket (4 extra draw calls/frame total — flat regardless of entity
    // count). Ring is laid flat on the ground plane (rotation.x = -PI/2 baked
    // into the orientation quaternion in #syncEntitySphereHalos) for a
    // "shadow-halo" read consistent with the overhead-tilted camera.
    const haloGeometry = new THREE.RingGeometry(0.50, 0.62, 24);
    const makeHaloMaterial = () => new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.workerHaloMesh = new THREE.InstancedMesh(haloGeometry, makeHaloMaterial(), maxWorkers);
    this.visitorHaloMesh = new THREE.InstancedMesh(haloGeometry, makeHaloMaterial(), maxVisitors);
    this.herbivoreHaloMesh = new THREE.InstancedMesh(haloGeometry, makeHaloMaterial(), maxHerbivores);
    this.predatorHaloMesh = new THREE.InstancedMesh(haloGeometry, makeHaloMaterial(), maxPredators);
    for (const halo of [this.workerHaloMesh, this.visitorHaloMesh, this.herbivoreHaloMesh, this.predatorHaloMesh]) {
      halo.frustumCulled = false;
      halo.castShadow = false;
      halo.receiveShadow = false;
      halo.renderOrder = RENDER_ORDER.ENTITY_MODEL;
      halo.count = 0;
    }
    this.scene.add(this.workerHaloMesh, this.visitorHaloMesh, this.herbivoreHaloMesh, this.predatorHaloMesh);
    // Halo ring laid flat on the ground plane (rotate -PI/2 around X).
    this._haloQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this._haloMatrix = new THREE.Matrix4();
    this._haloPos = new THREE.Vector3();
    this._haloScale = new THREE.Vector3(1, 1, 1);

    // PHH R11 (Plan-PHH-convoy-feel): per-worker fading motion trail. ONE
    // LineSegments for ALL workers, indexed by render slot. 8 segments × 2
    // verts × 3 floats = 48 floats per worker. Alpha decays linearly from
    // 0.5 (head) → 0 (tail) over ~2 sim-sec at 30 Hz render cadence.
    const TRAIL_LENGTH = 8;
    this._trailLength = TRAIL_LENGTH;
    const trailVerts = maxWorkers * TRAIL_LENGTH * 2;
    this._trailPositions = new Float32Array(trailVerts * 3);
    this._trailColors = new Float32Array(trailVerts * 4);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(this._trailPositions, 3));
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(this._trailColors, 4));
    const trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.workerTrailMesh = new THREE.LineSegments(trailGeometry, trailMaterial);
    this.workerTrailMesh.frustumCulled = false;
    this.workerTrailMesh.renderOrder = RENDER_ORDER.ENTITY_MODEL;
    this.scene.add(this.workerTrailMesh);
    // Per-worker history: id → ring buffer of {x, z, age} (oldest at [0]).
    this._workerTrailHistory = new Map();
  }

  #setHaloMatrix(mesh, index, x, y, z) {
    this._haloPos.set(x, y, z);
    this._haloMatrix.compose(this._haloPos, this._haloQuaternion, this._haloScale);
    mesh.setMatrixAt(index, this._haloMatrix);
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

  // v0.8.4 building-construction (Agent A) — Round 2 polish.
  // Renders semi-transparent blueprint plates + horizontal progress bars for
  // each entry in `state.constructionSites`. Pools are reused across frames;
  // surplus meshes are hidden with `mesh.visible = false`. Called from
  // render(dt) after #updatePlacementLens / #updateOverlayMeshes so overlays
  // sit cleanly above the base tile and any selection ring.
  #setupConstructionOverlayMeshes() {
    this.constructionGroup = new THREE.Group();
    this.constructionGroup.frustumCulled = false;
    this.scene.add(this.constructionGroup);
    const tileSize = this.state.grid.tileSize;
    // Blueprint plate — scaled slightly under one tile so we can still see
    // the underlying tile colour around the edges.
    this.constructionPlateGeometry = new THREE.PlaneGeometry(tileSize * 0.94, tileSize * 0.94);
    // Progress-bar geometries: thin background quad + thin foreground fill
    // that we scale on the X axis (anchor on the left edge via origin shift).
    this.constructionBarBgGeometry = new THREE.PlaneGeometry(tileSize * 0.86, tileSize * 0.10);
    // Foreground geometry has its origin pinned to the left edge so scaling
    // the X axis fills from the left rather than from the centre.
    this.constructionBarFgGeometry = new THREE.PlaneGeometry(tileSize * 0.86, tileSize * 0.10);
    this.constructionBarFgGeometry.translate(tileSize * 0.43, 0, 0);
    // Pool of { plate, barBg, barFg, group } entries.
    this.constructionOverlayPool = [];
  }

  #createConstructionOverlayEntry() {
    const tileSize = this.state.grid.tileSize;
    const group = new THREE.Group();
    group.frustumCulled = false;
    const plate = new THREE.Mesh(
      this.constructionPlateGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x6ec8ff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.renderOrder = RENDER_ORDER.TILE_OVERLAY + 3;
    plate.frustumCulled = false;
    const barBg = new THREE.Mesh(
      this.constructionBarBgGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x111419,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    barBg.rotation.x = -Math.PI / 2;
    barBg.renderOrder = RENDER_ORDER.TILE_OVERLAY + 4;
    barBg.frustumCulled = false;
    // Centre the bar background relative to the tile.
    barBg.position.set(0, 0.85, 0);
    const barFg = new THREE.Mesh(
      this.constructionBarFgGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    barFg.rotation.x = -Math.PI / 2;
    barFg.renderOrder = RENDER_ORDER.TILE_OVERLAY + 5;
    barFg.frustumCulled = false;
    // Anchor the bar fill on the left edge of the bar background. The bar
    // geometry was already pre-translated by half its width so X scale fills
    // from the left.
    barFg.position.set(-tileSize * 0.43, 0.85, 0);
    group.add(plate, barBg, barFg);
    group.visible = false;
    this.constructionGroup.add(group);
    return { group, plate, barBg, barFg };
  }

  #ensureConstructionOverlayPool(count) {
    while (this.constructionOverlayPool.length < count) {
      this.constructionOverlayPool.push(this.#createConstructionOverlayEntry());
    }
  }

  #updateConstructionOverlays() {
    const sites = Array.isArray(this.state.constructionSites) ? this.state.constructionSites : null;
    const pool = this.constructionOverlayPool;
    if (!pool) return;
    if (!sites || sites.length === 0) {
      for (const entry of pool) entry.group.visible = false;
      return;
    }
    this.#ensureConstructionOverlayPool(sites.length);
    const grid = this.state.grid;
    for (let i = 0; i < pool.length; i += 1) {
      const entry = pool[i];
      const site = sites[i];
      if (!site) {
        entry.group.visible = false;
        continue;
      }
      const ix = Number(site.ix);
      const iz = Number(site.iz);
      if (!Number.isFinite(ix) || !Number.isFinite(iz)) {
        entry.group.visible = false;
        continue;
      }
      const p = tileToWorld(ix, iz, grid);
      // Position the whole group at the tile centre slightly above the
      // ground plane so the plate doesn't z-fight with the base tile mesh.
      entry.group.position.set(p.x, 0.18, p.z);
      const isDemolish = site.kind === "demolish";
      // Plate colour: cyan for build, red for demolish. We tint the
      // material via the cached color slot to avoid per-frame allocation.
      const plateMat = entry.plate.material;
      if (plateMat?.color) {
        plateMat.color.setHex(isDemolish ? 0xff5a48 : 0x6ec8ff);
      }
      // Bar fill colour: gold for build, red for demolish.
      const fillMat = entry.barFg.material;
      if (fillMat?.color) {
        fillMat.color.setHex(isDemolish ? 0xff7560 : 0xffd166);
      }
      const total = Math.max(1e-3, Number(site.workTotalSec ?? 0));
      const applied = Math.max(0, Number(site.workAppliedSec ?? 0));
      const fill = Math.min(1, Math.max(0, applied / total));
      // Scale the bar fill on the X axis. The geometry's origin was shifted
      // so the left edge stays anchored.
      entry.barFg.scale.set(fill, 1, 1);
      entry.group.visible = true;
    }
    // Hide surplus entries beyond the active site count.
    for (let i = sites.length; i < pool.length; i += 1) {
      pool[i].group.visible = false;
    }
  }

  #setupPressureLensMeshes() {
    this.pressureLensRoot = new THREE.Group();
    this.pressureDiscGeometry = new THREE.CircleGeometry(1, 36);
    this.pressureRingGeometry = new THREE.RingGeometry(0.82, 1, 40);
    this.pressureMarkerPool = [];
    this.scene.add(this.pressureLensRoot);

    this.heatTileOverlayRoot = new THREE.Group();
    this.heatTileOverlayGeometry = new THREE.PlaneGeometry(this.state.grid.tileSize * 0.98, this.state.grid.tileSize * 0.98);
    this.heatTileOverlayPool = [];
    this.scene.add(this.heatTileOverlayRoot);

    // Terrain Property Overlay (fertility / elevation / connectivity / nodeDepletion).
    //
    // v0.9.1 perf — replace the per-tile Mesh pool (~6912 individual draw calls
    // and ~6912 MeshBasicMaterial allocations on first activation) with a small
    // set of InstancedMesh "buckets", one per distinct opacity tier. Each
    // bucket has a single material with a fixed opacity; per-instance color is
    // written via `setColorAt`. This collapses 6912 draw calls into ≤4 (worst
    // case is fertility/elevation modes which use 4 opacity tiers each).
    //
    // Visual fidelity is preserved: every tile that previously rendered with
    // (color, opacity) is now in the bucket whose material.opacity equals that
    // opacity, and its instance color equals the previous color. Layout
    // (position, rotation, plane size) is unchanged.
    this.terrainOverlayRoot = new THREE.Group();
    this.terrainOverlayGeometry = new THREE.PlaneGeometry(this.state.grid.tileSize * 0.97, this.state.grid.tileSize * 0.97);
    this.terrainOverlayGeometry.rotateX(-Math.PI / 2);
    this.terrainOverlayBuckets = new Map(); // opacity (rounded to 0.001) -> InstancedMesh
    this.terrainOverlayCapacity = Math.max(1, Number(this.state.grid.width ?? 0) * Number(this.state.grid.height ?? 0));
    this.scene.add(this.terrainOverlayRoot);

    this.placementLensRoot = new THREE.Group();
    const placementCapacity = Math.max(1, Number(this.state.grid.width ?? 0) * Number(this.state.grid.height ?? 0));
    this.placementLensGeometry = new THREE.PlaneGeometry(this.state.grid.tileSize * 0.92, this.state.grid.tileSize * 0.92);
    this.placementLensGeometry.rotateX(-Math.PI / 2);
    this.placementLegalMesh = new THREE.InstancedMesh(
      this.placementLensGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.32,
        depthTest: false,
        depthWrite: false,
      }),
      placementCapacity,
    );
    this.placementIllegalMesh = new THREE.InstancedMesh(
      this.placementLensGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.08,
        depthTest: false,
        depthWrite: false,
      }),
      placementCapacity,
    );
    this.placementLegalMesh.count = 0;
    this.placementIllegalMesh.count = 0;
    this.placementLegalMesh.renderOrder = RENDER_ORDER.TILE_OVERLAY + 1;
    this.placementIllegalMesh.renderOrder = RENDER_ORDER.TILE_OVERLAY;
    this.placementLegalMesh.frustumCulled = false;
    this.placementIllegalMesh.frustumCulled = false;
    this.placementLensRoot.visible = false;
    this.placementLensRoot.add(this.placementIllegalMesh, this.placementLegalMesh);
    this.scene.add(this.placementLensRoot);
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

  #createHeatTileOverlayEntry() {
    const mesh = new THREE.Mesh(this.heatTileOverlayGeometry, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = RENDER_ORDER.TILE_OVERLAY + 1;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.heatTileOverlayRoot.add(mesh);
    return mesh;
  }

  #ensureHeatTileOverlayPool(count) {
    while (this.heatTileOverlayPool.length < count) {
      this.heatTileOverlayPool.push(this.#createHeatTileOverlayEntry());
    }
  }

  #hideHeatTileOverlay() {
    for (const mesh of this.heatTileOverlayPool) mesh.visible = false;
  }

  // === Terrain Property Overlay ===
  //
  // v0.9.1 perf — InstancedMesh buckets keyed by opacity tier. Up to 4 buckets
  // are active at once (one per distinct opacity in the current mode); each
  // bucket renders in a single draw call regardless of instance count. Per-tile
  // color is written via `setColorAt`, position via `setMatrixAt`. Compared to
  // the prior pool-of-Meshes design (6912 individual meshes / draw calls), this
  // is a >1000x reduction in GPU-side draw cost on first activation and on
  // every subsequent frame the lens stays on.
  //
  // Bucket lifecycle:
  //   - Lazily created the first time a given opacity is needed (any mode).
  //   - Reused across modes: switching from "fertility" to "elevation" reuses
  //     the same buckets if opacities overlap, and creates new ones if not.
  //   - All buckets are always present in `terrainOverlayRoot`; per-frame, only
  //     the buckets used by the active mode have `count > 0` and `visible=true`.

  #getOrCreateTerrainBucket(opacity) {
    const key = Math.round(opacity * 1000) / 1000;
    let mesh = this.terrainOverlayBuckets.get(key);
    if (mesh) return mesh;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: key,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      vertexColors: false,
    });
    mesh = new THREE.InstancedMesh(this.terrainOverlayGeometry, material, this.terrainOverlayCapacity);
    mesh.count = 0;
    mesh.renderOrder = RENDER_ORDER.TILE_OVERLAY + 2;
    mesh.frustumCulled = false;
    mesh.visible = false;
    // mesh.count gates rendering, so unset instances beyond `count` never paint.
    // setColorAt lazily allocates `instanceColor` on first call; we don't
    // pre-fill — cheaper to let the first flush touch only the live slots.
    this.terrainOverlayRoot.add(mesh);
    this.terrainOverlayBuckets.set(key, mesh);
    return mesh;
  }

  #hideTerrainOverlay() {
    if (!this.terrainOverlayBuckets) return;
    for (const mesh of this.terrainOverlayBuckets.values()) {
      mesh.count = 0;
      mesh.visible = false;
    }
  }

  // Per-mode tile -> (color, opacity) classification.
  // Fertility: 4 opacity tiers (0.50 / 0.40 / 0.38 / 0.28).
  // Elevation: 4 opacity tiers (0.50 / 0.45 / 0.40 / 0.35).
  // Connectivity: 2 opacity tiers (0.60 / 0.40).
  // Node depletion: 2 opacity tiers (0.60 / 0.50).
  // The classifier writes directly into bucket-keyed instance arrays via
  // #emitTerrainTile; no temporary marker objects are allocated on the per-
  // tile loop.

  #emitTerrainTile(buckets, ix, iz, color, opacity) {
    const mesh = this.#getOrCreateTerrainBucket(opacity);
    let entry = buckets.get(mesh);
    if (entry === undefined) {
      // Reuse persistent scratch arrays per bucket so per-rebuild allocation
      // stays at zero. The arrays are sized to grid capacity once and live on
      // the InstancedMesh itself.
      let scratch = mesh.userData?.scratch;
      if (!scratch) {
        scratch = {
          hexes: new Int32Array(this.terrainOverlayCapacity),
          ix: new Int16Array(this.terrainOverlayCapacity),
          iz: new Int16Array(this.terrainOverlayCapacity),
        };
        mesh.userData = mesh.userData ?? {};
        mesh.userData.scratch = scratch;
      }
      entry = { count: 0, hexes: scratch.hexes, ix: scratch.ix, iz: scratch.iz };
      buckets.set(mesh, entry);
    }
    const n = entry.count;
    entry.hexes[n] = color;
    entry.ix[n] = ix;
    entry.iz[n] = iz;
    entry.count = n + 1;
  }

  #classifyTerrainFertility(buckets) {
    const grid = this.state.grid;
    const { width, height, tiles, moisture } = grid;
    if (!moisture) return;
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const idx = ix + iz * width;
        if (tiles[idx] === TILE.WATER) continue;
        const m = moisture[idx];
        let color, opacity;
        if (m > 0.65)      { color = 0x1a7f2a; opacity = 0.50; }
        else if (m > 0.40) { color = 0x4aad3a; opacity = 0.40; }
        else if (m > 0.20) { color = 0xb8c03a; opacity = 0.38; }
        else                { color = 0x6a6a6a; opacity = 0.28; }
        this.#emitTerrainTile(buckets, ix, iz, color, opacity);
      }
    }
  }

  #classifyTerrainElevation(buckets) {
    const grid = this.state.grid;
    const { width, height, tiles, elevation } = grid;
    if (!elevation) return;
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const idx = ix + iz * width;
        if (tiles[idx] === TILE.WATER) continue;
        const e = elevation[idx];
        let color, opacity;
        if (e > 0.7)      { color = 0xcc4444; opacity = 0.50; }
        else if (e > 0.4) { color = 0xcc8833; opacity = 0.45; }
        else if (e > 0.2) { color = 0xaacc33; opacity = 0.40; }
        else               { color = 0x88aacc; opacity = 0.35; }
        this.#emitTerrainTile(buckets, ix, iz, color, opacity);
      }
    }
  }

  #classifyTerrainConnectivity(buckets) {
    const grid = this.state.grid;
    const { width, height, tiles } = grid;
    const field = this.#getRoadDistanceField();
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const idx = ix + iz * width;
        if (tiles[idx] === TILE.WATER) continue;
        const hasRoad = field[idx] <= 3;
        const color = hasRoad ? 0x44cc44 : 0xcc4444;
        const opacity = hasRoad ? 0.60 : 0.40;
        this.#emitTerrainTile(buckets, ix, iz, color, opacity);
      }
    }
  }

  // v0.8.7.1 P3 — return cached road-distance field, rebuilding only when
  // grid.version advances.
  #getRoadDistanceField() {
    const grid = this.state.grid;
    const cache = this._roadDistanceField;
    if (cache && cache.version === grid.version
        && cache.width === grid.width && cache.height === grid.height) {
      return cache.data;
    }
    const data = buildRoadDistanceField(grid);
    this._roadDistanceField = { data, version: grid.version, width: grid.width, height: grid.height };
    return data;
  }

  #classifyTerrainNodeDepletion(buckets) {
    const grid = this.state.grid;
    const { width, height, tiles } = grid;
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const idx = ix + iz * width;
        const tileType = tiles[idx];
        if (!TERRAIN_OVERLAY_RESOURCE_TILES.has(tileType)) continue;
        const ts = grid.tileState?.get?.(idx);
        const exhaustion = Number(ts?.exhaustion ?? ts?.soilExhaustion ?? 0);
        const ratio = exhaustion / 8.0; // matches TERRAIN_MECHANICS.soilExhaustionMax
        let color, opacity;
        if (ratio > 0.7)      { color = 0xcc2222; opacity = 0.60; }
        else if (ratio > 0.4) { color = 0xcc8822; opacity = 0.50; }
        else                   { color = 0x33cc33; opacity = 0.50; }
        this.#emitTerrainTile(buckets, ix, iz, color, opacity);
      }
    }
  }

  #updateTerrainFertilityOverlay() {
    if (!this.terrainLensMode) {
      this.#hideTerrainOverlay();
      this.lastTerrainLensMode = null;
      this.lastTerrainVersion = -1;
      return;
    }
    const gridVersion = this.state.grid?.version ?? 0;
    // tileStateVersion captures soil-exhaustion drift, which only "nodeDepletion"
    // mode reads. Cheap to include in the cache key — other modes already settle
    // on grid.version so they short-circuit anyway.
    const tileStateVersion = this.state.grid?.tileStateVersion ?? 0;
    const cacheKey = `${this.terrainLensMode}|${gridVersion}|${this.terrainLensMode === "nodeDepletion" ? tileStateVersion : 0}`;
    if (cacheKey === this._terrainOverlayCacheKey
        && this.lastTerrainLensMode === this.terrainLensMode
        && this.terrainOverlayBuckets.size > 0) {
      // Already up to date — buckets already have their counts + visibility set.
      return;
    }
    this._terrainOverlayCacheKey = cacheKey;
    this.lastTerrainVersion = gridVersion;
    this.lastTerrainLensMode = this.terrainLensMode;

    // Reset bucket counts before re-classifying.
    const usedBuckets = new Map();
    for (const mesh of this.terrainOverlayBuckets.values()) mesh.count = 0;

    if (this.terrainLensMode === "elevation") {
      this.#classifyTerrainElevation(usedBuckets);
    } else if (this.terrainLensMode === "connectivity") {
      this.#classifyTerrainConnectivity(usedBuckets);
    } else if (this.terrainLensMode === "nodeDepletion") {
      this.#classifyTerrainNodeDepletion(usedBuckets);
    } else {
      this.#classifyTerrainFertility(usedBuckets);
    }

    // Flush each bucket's instance arrays into its InstancedMesh.
    // tileToWorld is inlined here (offsetX/offsetZ + tileSize multiply) to
    // avoid 6912 small-object allocations per rebuild.
    const grid = this.state.grid;
    const tileSize = grid.tileSize;
    const offsetX = (-grid.width / 2 + 0.5) * tileSize;
    const offsetZ = (-grid.height / 2 + 0.5) * tileSize;
    const tmpColor = COLOR_TMP;
    for (const [mesh, entry] of usedBuckets) {
      const n = entry.count;
      for (let i = 0; i < n; i++) {
        const wx = entry.ix[i] * tileSize + offsetX;
        const wz = entry.iz[i] * tileSize + offsetZ;
        setInstancedMatrix(mesh, i, wx, 0.18, wz);
        tmpColor.setHex(entry.hexes[i]);
        mesh.setColorAt(i, tmpColor);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = n > 0;
    }
    // Buckets that exist but were not used by this mode get count=0 + hidden.
    for (const mesh of this.terrainOverlayBuckets.values()) {
      if (!usedBuckets.has(mesh)) {
        mesh.count = 0;
        mesh.visible = false;
      }
    }
  }

  // === Tile Info Tooltip ===

  // Return 0–2 contextual header lines for the tile info tooltip based on the
  // currently active build tool. Lines are pre-formatted HTML strings.
  #buildContextualTooltipHeader(ix, iz, tool) {
    const grid = this.state.grid;
    const idx = ix + iz * grid.width;
    function esc(v) { return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    const headerLines = [];

    if (tool === "farm" || tool === "herb_garden") {
      // Fertility / moisture is the key metric.
      if (grid.moisture && idx < grid.moisture.length) {
        const moist = Number(grid.moisture[idx]);
        let hint, color;
        if (moist > 0.65)      { hint = "Fertile";   color = "#a5f2b2"; }
        else if (moist > 0.40) { hint = "Moderate";  color = "#ffdf8a"; }
        else                   { hint = "Poor soil";  color = "#ff8a80"; }
        headerLines.push(
          `<b style="font-size:12px">Fertility / Moisture</b>`,
          `<span style="color:${color};font-size:12px;font-weight:bold">${hint}</span> <span style="opacity:0.7">(${esc(moist.toFixed(2))})</span>`,
        );
      }
    } else if (tool === "lumber" || tool === "clinic") {
      // Node depletion / soil exhaustion is the key metric.
      const tileType = grid.tiles[idx];
      if (TERRAIN_OVERLAY_RESOURCE_TILES.has(tileType)) {
        const ts = grid.tileState?.get?.(idx);
        const exhaustion = Number(ts?.exhaustion ?? ts?.soilExhaustion ?? 0);
        const maxExhaustion = 8.0;
        const ratio = exhaustion / maxExhaustion;
        let hint, color;
        if (ratio > 0.7)      { hint = "Heavily depleted"; color = "#ff8a80"; }
        else if (ratio > 0.4) { hint = "Moderate use";     color = "#ffdf8a"; }
        else                  { hint = "Healthy node";      color = "#a5f2b2"; }
        headerLines.push(
          `<b style="font-size:12px">Node Health</b>`,
          `<span style="color:${color};font-size:12px;font-weight:bold">${hint}</span> <span style="opacity:0.7">(${esc((ratio * 100).toFixed(0))}% used)</span>`,
        );
      } else {
        headerLines.push(`<b style="font-size:12px">Node Health</b>`, `<span style="opacity:0.6">No resource node here</span>`);
      }
    } else if (tool === "quarry" || tool === "wall") {
      // Elevation is the key metric.
      if (grid.elevation && idx < grid.elevation.length) {
        const elev = Number(grid.elevation[idx]);
        let hint, color;
        if (elev > 0.7)       { hint = "High ground";   color = "#a5f2b2"; }
        else if (elev > 0.4)  { hint = "Mid elevation"; color = "#ffdf8a"; }
        else                  { hint = "Low ground";     color = "#ff8a80"; }
        headerLines.push(
          `<b style="font-size:12px">Elevation</b>`,
          `<span style="color:${color};font-size:12px;font-weight:bold">${hint}</span> <span style="opacity:0.7">(${esc(elev.toFixed(2))})</span>`,
        );
      }
    } else if (tool === "road" || tool === "warehouse") {
      // Road connectivity is the key metric.
      // v0.8.7.1 P3 — read cached road-distance field instead of inline BFS.
      const field = this.#getRoadDistanceField();
      const hasRoad = field[idx] <= 3;
      const isRoadTile = grid.tiles[idx] === TILE.ROAD;
      const hint  = isRoadTile ? "Road tile" : (hasRoad ? "Road nearby" : "Not connected");
      const color = (isRoadTile || hasRoad) ? "#a5f2b2" : "#ff8a80";
      headerLines.push(
        `<b style="font-size:12px">Road Connectivity</b>`,
        `<span style="color:${color};font-size:12px;font-weight:bold">${hint}</span>`,
      );
    }

    return headerLines;
  }

  #resolveTileInfoTooltipEl() {
    if (this.tileInfoTooltipEl) return this.tileInfoTooltipEl;
    if (typeof document === "undefined") return null;
    this.tileInfoTooltipEl = document.getElementById("tileInfoTooltip");
    return this.tileInfoTooltipEl;
  }

  #hideTileInfoTooltip() {
    const el = this.#resolveTileInfoTooltipEl();
    if (!el) return;
    el.style.display = "none";
    this.tileInfoLastTile = null;
  }

  #updateTileInfoTooltip(ix, iz, clientX, clientY) {
    const el = this.#resolveTileInfoTooltipEl();
    if (!el) return;

    const grid = this.state.grid;
    const idx = ix + iz * grid.width;
    const tileType = grid.tiles[idx];
    const info = TILE_INFO[tileType];
    const tileName = TILE_LABEL[tileType] ?? String(tileType);
    const passable = info?.passable ? "Passable" : "Impassable";
    const passableColor = info?.passable ? "#a5f2b2" : "#ff8a80";

    // HTML rows with bold keys for scanability.
    // Safe: all dynamic values are numbers / enum strings — no user text injected.
    function esc(v) { return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    const rows = [];

    // Contextual header: show the most relevant metric first based on active tool.
    const activeTool = this.state?.controls?.tool ?? "select";
    const ctxHeader = this.#buildContextualTooltipHeader(ix, iz, activeTool);
    if (ctxHeader.length > 0) {
      rows.push(...ctxHeader);
      rows.push(`<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:3px 0">`);
    }

    rows.push(`<b>${esc(tileName)}</b> <span style="color:${passableColor};font-size:10px">${esc(passable)}</span>`);

    // Elevation
    if (grid.elevation && idx < grid.elevation.length) {
      const elev = Number(grid.elevation[idx]).toFixed(2);
      rows.push(`<span style="opacity:0.6">Elev</span> ${esc(elev)}`);
    }

    // Moisture + fertility hint
    if (grid.moisture && idx < grid.moisture.length) {
      const moist = Number(grid.moisture[idx]);
      rows.push(`<span style="opacity:0.6">Moisture</span> ${esc(moist.toFixed(2))}`);
      if (tileType === TILE.FARM || tileType === TILE.GRASS) {
        let hint;
        let color;
        if (moist > 0.65) { hint = "Fertile"; color = "#a5f2b2"; }
        else if (moist > 0.40) { hint = "Moderate"; color = "#ffdf8a"; }
        else { hint = "Poor"; color = "#ff8a80"; }
        rows.push(`<span style="opacity:0.6">Fertility</span> <span style="color:${color}">${hint}</span>`);
      }
    }

    // Building production stats per tile type.
    // Descriptions are static strings keyed by tile type — no user-injected text.
    const BUILDING_DESC = Object.freeze({
      [TILE.FARM]:        { role: "Produces food", input: "—", output: "food" },
      [TILE.LUMBER]:      { role: "Produces wood", input: "—", output: "wood" },
      [TILE.QUARRY]:      { role: "Produces stone", input: "—", output: "stone" },
      [TILE.HERB_GARDEN]: { role: "Produces herbs", input: "—", output: "herbs" },
      [TILE.WAREHOUSE]:   { role: "Storage hub", input: "all resources", output: "all resources" },
      [TILE.KITCHEN]:     { role: "Processing: Cook", input: "food", output: "meals" },
      [TILE.SMITHY]:      { role: "Processing: Smith", input: "wood + stone", output: "tools" },
      [TILE.CLINIC]:      { role: "Processing: Heal", input: "herbs", output: "medicine" },
      [TILE.ROAD]:        { role: "Fast transit (−35% movement cost)", input: "—", output: "—" },
      [TILE.BRIDGE]:      { role: "Water crossing (passable)", input: "—", output: "—" },
      [TILE.WALL]:        { role: "Defensive barrier (impassable)", input: "—", output: "—" },
      // v0.8.4 strategic walls + GATE (Agent C). Gate is colony-passable
      // and blocked for hostile factions; placed in wall lines to seal
      // supply routes without locking the colony out.
      [TILE.GATE]:        { role: "Faction doorway (colony-passable)", input: "—", output: "—" },
      [TILE.RUINS]:       { role: "Salvageable structure", input: "—", output: "stone/wood" },
    });
    const bDesc = BUILDING_DESC[tileType];
    if (bDesc) {
      rows.push(`<span style="opacity:0.6">Role</span> ${esc(bDesc.role)}`);
      if (bDesc.input !== "—") {
        rows.push(`<span style="opacity:0.6">Input</span> ${esc(bDesc.input)}`);
      }
      if (bDesc.output !== "—") {
        rows.push(`<span style="opacity:0.6">Output</span> ${esc(bDesc.output)}`);
      }
    }

    // tileState info (salinization, yieldPool)
    const ts = grid.tileState?.get?.(idx);
    if (ts) {
      if (Number.isFinite(ts.yieldPool) && ts.yieldPool > 0) {
        rows.push(`<span style="opacity:0.6">Yield pool</span> ${Math.round(ts.yieldPool)}`);
      }
      if (Number.isFinite(ts.salinized) && ts.salinized > 0) {
        const salPct = (ts.salinized * 100).toFixed(0);
        const salColor = ts.salinized > 0.5 ? "#ff8a80" : "#ffdf8a";
        rows.push(`<span style="opacity:0.6">Salinization</span> <span style="color:${salColor}">${salPct}%</span>`);
      }
    }

    // Neighbor hints
    let forestNeighbors = 0;
    let hasWaterNeighbor = false;
    let hasRuinsNeighbor = tileType === TILE.RUINS;
    for (const [dix, diz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = ix + dix;
      const nz = iz + diz;
      if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
      const nIdx = nx + nz * grid.width;
      const nType = grid.tiles[nIdx];
      const nFlags = Number(grid.tileState?.get?.(nIdx)?.nodeFlags ?? 0);
      if (nType === TILE.WATER) hasWaterNeighbor = true;
      if (nType === TILE.RUINS) hasRuinsNeighbor = true;
      if (nFlags & 1 /* NODE_FLAGS.FOREST */) forestNeighbors++;
      if (nType === TILE.LUMBER) forestNeighbors++;
    }
    const hints = [];
    if (forestNeighbors > 0) hints.push("near forest");
    if (hasWaterNeighbor) hints.push("near water");
    if (hasRuinsNeighbor) hints.push("salvageable ruins");
    if (hints.length > 0) {
      rows.push(`<span style="opacity:0.55;font-style:italic">${hints.join(" · ")}</span>`);
    }

    // v0.10.1-A3 R3 — removed misleading "B = build · R = road · T = fertility"
    // hint. Those single-letter shortcuts do not exist in the global keymap
    // (build = 1-12, R = reset camera, T = terrain overlay), so the line
    // actively miseducated. Replaced with the correct number-row shortcut
    // that aligns with the Help dialog Controls tab.
    rows.push(`<span style="opacity:0.4;font-size:10px">Press 1-12 to select a build tool</span>`);

    el.innerHTML = rows.join("<br>");
    el.style.whiteSpace = "normal";
    // Position near cursor with a small offset; keep inside the viewport.
    // Account for the right sidebar (280px when open) so tooltip doesn't appear
    // under the sidebar panel. Also account for bottom bar (~50px).
    const margin = 12;
    let left = clientX + margin;
    let top = clientY + margin;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    // Estimate tooltip size (width ~220 + padding, height ~18px * rows).
    const estW = 235;
    const estH = rows.length * 18 + 14;
    // Determine right clearance: sidebar takes 280px when open, 36px (tab strip) otherwise.
    const sidebarOpen = typeof document !== "undefined" &&
      document.getElementById("wrap")?.classList?.contains("sidebar-open");
    const rightClearance = sidebarOpen ? 280 : 36;
    const rightLimit = vpW - rightClearance;
    if (left + estW > rightLimit) left = clientX - estW - margin;
    if (top + estH > vpH - 50) top = clientY - estH - margin;
    el.style.left = `${Math.max(4, left)}px`;
    el.style.top = `${Math.max(4, top)}px`;
    el.style.display = "block";
  }

  #hidePressureMarkers() {
    for (const entry of this.pressureMarkerPool) entry.group.visible = false;
  }

  // v0.8.2 — Pressure lens HTML label overlays.
  // Projects each active pressure marker's world position onto screen space and
  // positions a pooled <div class="pressure-label"> absolutely over the canvas.
  // When the lens is off, all labels are hidden. Maximum pool size is 24
  // (matching the buildPressureLens cap) so the DOM cost stays bounded.
  #updatePressureLensLabels() {
    if (typeof document === "undefined") return;

    // Lazily resolve the label container once.
    if (!this.pressureLabelLayerEl) {
      this.pressureLabelLayerEl = document.getElementById("pressureLabelLayer");
    }
    const container = this.pressureLabelLayerEl;
    if (!container) return;

    const display = this.#displaySettings();
    if (!display.effectsEnabled || !display.heatLabels) {
      for (const el of this.pressureLabelPool) {
        el.style.display = "none";
        el.title = "";
      }
      container.dataset.hiddenLabelCount = "0";
      return;
    }

    const markers = this.lensMode !== "off" ? this.pressureLensMarkers : [];

    // Grow pool as needed (max 24 to match buildPressureLens cap).
    while (this.pressureLabelPool.length < markers.length) {
      const div = document.createElement("div");
      div.className = "pressure-label";
      container.appendChild(div);
      this.pressureLabelPool.push(div);
    }

    const canvasRect = this.canvas.getBoundingClientRect?.() ?? null;
    const vpW = canvasRect ? canvasRect.width : this.canvas.clientWidth;
    const vpH = canvasRect ? canvasRect.height : this.canvas.clientHeight;
    const offsetLeft = canvasRect ? canvasRect.left : 0;
    const offsetTop = canvasRect ? canvasRect.top : 0;

    // v0.8.2 Round-6 Wave-1 (01c-ui Step 5) — two-pass projection +
    // screen-space dedup. Pass 1 projects each marker and records its pixel
    // coordinates / resolved label / weight. Pass 2 invokes
    // `dedupPressureLabels` (a pure helper exported from PressureLens.js so
    // tests can stand it up without canvas) which collapses repeat labels
    // and bucket-overlapping primaries. Pass 3 writes display state to the
    // pool elements. This eliminates the "supply surplus / supply surplus /
    // supply surplus" stack reviewers reported (feedback #4).
    // v0.10.1 R1 (A2 perf) — reuse instance scratch buffers instead of
    // allocating fresh arrays each frame. `length = 0` empties without
    // dropping the underlying capacity (V8 keeps the backing store).
    const projected = this._labelProjectedScratch;
    projected.length = 0;
    for (let i = 0; i < this.pressureLabelPool.length; i += 1) {
      const marker = markers[i];
      if (!marker || vpW <= 0 || vpH <= 0) {
        projected.push(null);
        continue;
      }
      const wp = tileToWorld(marker.ix, marker.iz, this.state.grid);
      VEC_TMP.set(wp.x, 0.3, wp.z);
      VEC_TMP.project(this.camera);
      // Off-screen / behind camera → omit from dedup pool.
      if (VEC_TMP.z > 1 || Math.abs(VEC_TMP.x) > 1.05 || Math.abs(VEC_TMP.y) > 1.05) {
        projected.push(null);
        continue;
      }
      const px = (VEC_TMP.x * 0.5 + 0.5) * vpW;
      const py = (-VEC_TMP.y * 0.5 + 0.5) * vpH;
      // v0.8.2 Round-6 Wave-1 01a-onboarding (Step 2): when a marker carries
      // an explicit empty-string label (heat-lens halo markers, see
      // PressureLens.js#buildHeatLens), suppress the label DOM entirely.
      const rawLabel = marker.label;
      const labelText = rawLabel === ""
        ? ""
        : String(rawLabel ?? marker.kind ?? "");
      if (labelText === "") {
        projected.push(null);
        continue;
      }
      projected.push({
        idx: i,
        px,
        py,
        label: labelText,
        weight: getPressureLabelRank({ ...marker, resolvedLabel: labelText }),
        markerWeight: Number(marker.weight ?? 0),
        priority: Number(marker.priority ?? 0),
        hoverTooltip: marker.hoverTooltip ?? "",
        kind: marker.kind ?? "",
      });
    }

    // Pass 2: dedup. Build entries array (skip nulls) and remember mapping.
    // v0.10.1 R1 (A2 perf) — reuse instance scratch arrays.
    const entries = this._labelEntriesScratch;
    entries.length = 0;
    const entryToPoolIdx = this._labelEntryToPoolIdxScratch;
    entryToPoolIdx.length = 0;
    for (let i = 0; i < projected.length; i += 1) {
      const p = projected[i];
      if (!p) continue;
      entries.push(p);
      entryToPoolIdx.push(i);
    }
    const decisions = dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 });

    // Pass 3: write display state.
    // v0.10.1 R1 (A2 perf) — scratch reuse for visibleCandidates + visible map.
    const visibleCandidates = this._labelVisibleCandidatesScratch;
    visibleCandidates.length = 0;
    for (let j = 0; j < decisions.length; j += 1) {
      const d = decisions[j];
      const poolIdx = entryToPoolIdx[j];
      if (d.keep) {
        visibleCandidates.push({ poolIdx, decision: d, entry: entries[j] });
      }
    }
    const labelBudget = this.lensMode === "heat"
      ? heatLabelBudgetForZoom(this.camera?.zoom)
      : Number.POSITIVE_INFINITY;
    visibleCandidates.sort((a, b) => {
      const rankDelta = Number(b.entry?.weight ?? 0) - Number(a.entry?.weight ?? 0);
      if (Math.abs(rankDelta) > 0.0001) return rankDelta;
      const countDelta = Number(b.decision?.count ?? 1) - Number(a.decision?.count ?? 1);
      if (countDelta !== 0) return countDelta;
      return String(a.entry?.label ?? "").localeCompare(String(b.entry?.label ?? ""));
    });
    const visible = this._labelVisibleScratchMap;
    visible.clear();
    for (const item of visibleCandidates.slice(0, labelBudget)) {
      visible.set(item.poolIdx, { decision: item.decision, entry: item.entry });
    }
    container.dataset.hiddenLabelCount = String(Math.max(0, visibleCandidates.length - visible.size));
    // v0.8.7.1 P6 \u2014 DOM-write diff. Track per-pool-element signature
    // (rounded px,py + text + count) and skip style/textContent writes when
    // the signature is unchanged across frames. Hide-state transitions still
    // mutate the element but only once per change.
    if (!this._prevLabelSignatures) this._prevLabelSignatures = new Map();
    const prevSigs = this._prevLabelSignatures;
    const nextSigs = new Map();
    for (let i = 0; i < this.pressureLabelPool.length; i += 1) {
      const el = this.pressureLabelPool[i];
      if (!visible.has(i)) {
        // Not visible: hidden either because off-screen, empty label, or
        // collapsed into a sibling.
        if (prevSigs.get(i) !== "hidden") {
          el.style.display = "none";
          el.title = "";
          if (el.dataset) {
            if ("merged" in el.dataset) delete el.dataset.merged;
            if ("count" in el.dataset) delete el.dataset.count;
          }
        }
        nextSigs.set(i, "hidden");
        continue;
      }
      const { decision, entry } = visible.get(i);
      const renderPx = decision.cx ?? entry.px;
      const renderPy = decision.cy ?? entry.py;
      const count = decision.count ?? 1;
      const labelText = count > 1 ? `${entry.label} \u00d7${count}` : entry.label;
      const left = Math.round(renderPx + offsetLeft);
      const top = Math.round(renderPy + offsetTop);
      const sig = `${left},${top}|${labelText}|${count}|${entry.kind ?? ""}`;
      if (prevSigs.get(i) === sig) {
        nextSigs.set(i, sig);
        continue;
      }
      el.dataset.kind = entry.kind;
      if (count > 1) {
        el.dataset.merged = "1";
        el.dataset.count = String(count);
      } else {
        if (el.dataset && "merged" in el.dataset) delete el.dataset.merged;
        if (el.dataset && "count" in el.dataset) delete el.dataset.count;
      }
      // v0.8.8 A4 (F13) — at cluster density (>=3 merged markers) reduce
      // opacity to 0.7 so the dense overlay reads as background context
      // rather than a wall of foreground labels.
      el.style.opacity = count >= 3 ? "0.7" : "";
      el.textContent = labelText;
      el.title = entry.hoverTooltip ? String(entry.hoverTooltip) : labelText;
      // v0.9.2-ui (F10) — viewport-edge clamp + anchor flip. The default
      // CSS transform centers the label horizontally above the marker
      // (translate(-50%, -160%)). On tiles near the right edge the label
      // would extend off-canvas and get clipped by #pressureLabelLayer's
      // overflow:hidden. We measure el.offsetWidth/Height once after
      // textContent is written, then nudge `left` (and flip the ::after
      // triangle via data-anchor) to keep the entire label inside the
      // viewport. Reference: Cities Skylines / Dwarf Fortress flip the
      // anchor when label would clip. ≤24 visible labels is the budget,
      // so the extra layout pass is cheap.
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.display = "block";
      try {
        const labelW = el.offsetWidth || 0;
        const labelH = el.offsetHeight || 0;
        // Default anchor: bottom-center triangle, label sits ABOVE the marker.
        let anchor = "bottom";
        let adjLeft = left;
        // Default visual extent: label spans [left - labelW/2, left + labelW/2]
        // because of translate(-50%, ...). Clamp horizontally:
        const halfW = labelW / 2;
        const minLeft = halfW + 8;
        const maxLeft = vpW + offsetLeft - halfW - 8;
        if (adjLeft > maxLeft) {
          adjLeft = maxLeft;
          anchor = "right";
        } else if (adjLeft < minLeft) {
          adjLeft = minLeft;
          anchor = "left";
        }
        // Vertical: label sits at top - 160% of its own height (the
        // ::after triangle hangs 10px BELOW the box). If that pushes the
        // top above the viewport, flip to below the marker.
        const labelTopVisual = top - labelH * 1.6;
        if (labelTopVisual < offsetTop + 8) {
          // Flip below the marker (anchor=top, triangle at top).
          el.style.transform = "translate(-50%, 60%)";
          anchor = anchor === "bottom" ? "top" : `${anchor}-top`;
        } else {
          el.style.transform = "";
        }
        el.dataset.anchor = anchor;
        if (adjLeft !== left) el.style.left = `${Math.round(adjLeft)}px`;
      } catch {
        // offsetWidth/Height read can fail in headless test DOMs; ignore.
      }
      nextSigs.set(i, sig);
    }
    this._prevLabelSignatures = nextSigs;
  }

  #updateHeatTileOverlay(markers) {
    this.#ensureHeatTileOverlayPool(markers.length);
    const timeSec = Number(this.state.metrics?.timeSec ?? 0);
    for (let i = 0; i < this.heatTileOverlayPool.length; i += 1) {
      const mesh = this.heatTileOverlayPool[i];
      const marker = markers[i];
      if (!marker) {
        mesh.visible = false;
        continue;
      }
      const style = PRESSURE_MARKER_STYLE[marker.kind] ?? PRESSURE_MARKER_STYLE.heat_idle;
      const p = tileToWorld(marker.ix, marker.iz, this.state.grid);
      const visual = HEAT_TILE_OVERLAY_VISUAL[marker.kind] ?? HEAT_TILE_OVERLAY_VISUAL.heat_idle;
      const wave = Math.sin(timeSec * (1.5 + Number(marker.weight ?? 0) * 0.45) + i * 0.73);
      const pulse = 1 + (wave * HEAT_TILE_OVERLAY_VISUAL.pulseAmplitude);
      mesh.visible = true;
      mesh.position.set(p.x, 0.175 + (Number(marker.weight ?? 0) * 0.015), p.z);
      mesh.scale.set(pulse, pulse, 1);
      mesh.material.color.setHex(style.fill);
      mesh.material.opacity = visual.opacity * (0.92 + ((wave + 1) * 0.08));
    }
  }

  #setPlacementMesh(mesh, tiles) {
    let count = 0;
    const capacity = mesh.instanceMatrix.count ?? tiles.length;
    for (const tile of tiles) {
      if (count >= capacity) break;
      const p = tileToWorld(tile.ix, tile.iz, this.state.grid);
      setInstancedMatrix(mesh, count, p.x, 0.19, p.z);
      count += 1;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  #updatePlacementLens() {
    const tool = this.state.controls?.tool;
    if (this.lensMode === "off") {
      this.placementLensRoot.visible = false;
      this.placementLegalMesh.count = 0;
      this.placementIllegalMesh.count = 0;
      return;
    }

    const classified = classifyPlacementTiles(this.state, tool);
    if (!classified.requiredFlag) {
      this.placementLensRoot.visible = false;
      this.placementLegalMesh.count = 0;
      this.placementIllegalMesh.count = 0;
      this.lastPlacementLensSignature = "";
      return;
    }

    const signature = [
      tool,
      this.state.grid?.version ?? 0,
      this.state.grid?.tileStateVersion ?? 0,
      classified.legal.length,
      classified.illegal.length,
    ].join("|");
    this.placementLensRoot.visible = true;
    if (signature === this.lastPlacementLensSignature) return;
    this.lastPlacementLensSignature = signature;
    this.#setPlacementMesh(this.placementLegalMesh, classified.legal);
    this.#setPlacementMesh(this.placementIllegalMesh, classified.illegal);
  }

  #lerpColor(targetColor, hex, t) {
    COLOR_TMP.setHex(hex);
    targetColor.lerp(COLOR_TMP, t);
  }

  #applyAtmosphere(dt) {
    // v0.8.8 A11 (QA3 L5) — cache deriveAtmosphereProfile(state) against a
    // signature of the inputs it actually reads. The full derive is ~15
    // mixHex + clamp ops per frame, but inputs (scenario family, weather,
    // session phase, pressure-derived scalars) only change every few
    // ticks. A signature hit reuses the previous profile object.
    const s = this.state;
    const sig = `${s.gameplay?.scenario?.family ?? ""}|${s.weather?.current ?? ""}|${s.weather?.pressureScore ?? 0}|${s.metrics?.spatialPressure?.weatherPressure ?? 0}|${s.metrics?.spatialPressure?.eventPressure ?? 0}|${s.metrics?.ecology?.maxFarmPressure ?? 0}|${s.metrics?.traffic?.peakPenalty ?? 0}|${s.session?.phase ?? ""}|${s.session?.outcome ?? ""}`;
    let baseTarget;
    if (this._lastAtmosphereSig === sig && this._lastAtmosphereProfile) {
      baseTarget = this._lastAtmosphereProfile;
    } else {
      baseTarget = deriveAtmosphereProfile(this.state);
      this._lastAtmosphereSig = sig;
      this._lastAtmosphereProfile = baseTarget;
    }
    // v0.10.1-A4 (V1) — Day-night tint modulation off the existing
    // SimulationClock (state.environment.dayNightPhase, period =
    // BALANCE.dayCycleSeconds=90). Quantized to 32 bins so we only re-blend
    // the tinted profile when the bin index changes (~once every 2.8 s on
    // the default cycle); per-frame work stays at the base-profile cache
    // hit + this single modulo. No new mesh/asset/shadow rig — pure
    // ambient + directional light parameter modulation.
    const phase = getDayNightPhase(this.state);
    const bin = quantizeDayNightPhase(phase, DAY_NIGHT_TINT_BINS);
    let target;
    if (
      this._lastDayNightBin === bin
      && this._lastDayNightBaseTarget === baseTarget
      && this._lastDayNightTintedTarget
    ) {
      target = this._lastDayNightTintedTarget;
    } else {
      target = applyDayNightModulation(baseTarget, phase);
      this._lastDayNightBin = bin;
      this._lastDayNightBaseTarget = baseTarget;
      this._lastDayNightTintedTarget = target;
    }
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
    // v0.10.1 R1 (A2 perf) — coarse pre-filter on cheap-to-read inputs
    // (lengths + monotonic versions + scalar IDs). When none has changed
    // we return the previously cached string by *identity*, skipping two
    // .map().join() passes plus the outer .join("||"). The prefilter is
    // intentionally a superset of the keys that drive the full signature
    // — any miss still falls through to the full string build, so a
    // missed bump only spends one extra frame's work, never produces a
    // stuck cache. Identity reuse is verified by perf-allocation-budget
    // test (see Round1 A2 plan §5).
    const eventsArr = this.state.events?.active ?? null;
    const hotspotsArr = this.state.metrics?.ecology?.hotspotFarms ?? null;
    const eventsLen = eventsArr ? eventsArr.length : 0;
    const hotspotsLen = hotspotsArr ? hotspotsArr.length : 0;
    const gridVer = this.state.grid?.version ?? 0;
    const trafficVer = this.state.metrics?.traffic?.version ?? 0;
    const trafficHotspots = this.state.metrics?.traffic?.hotspotCount ?? 0;
    const objectiveIdx = this.state.gameplay?.objectiveIndex ?? 0;
    const weatherCurrent = this.state.weather?.current ?? "clear";
    const weatherHazard = this.state.weather?.hazardFocusSummary ?? "";
    const weatherScore = this.state.weather?.pressureScore ?? 0;
    const spatialSummary = this.state.metrics?.spatialPressure?.summary ?? "";
    if (
      this._cachedLensSignature !== undefined
      && this._lastEventsLen === eventsLen
      && this._lastHotspotsLen === hotspotsLen
      && this._lastGridVerForLensSig === gridVer
      && this._lastTrafficVerForLensSig === trafficVer
      && this._lastTrafficHotspotsForLensSig === trafficHotspots
      && this._lastObjectiveIdxForLensSig === objectiveIdx
      && this._lastWeatherCurrentForLensSig === weatherCurrent
      && this._lastWeatherHazardForLensSig === weatherHazard
      && this._lastWeatherScoreForLensSig === weatherScore
      && this._lastSpatialSummaryForLensSig === spatialSummary
    ) {
      return this._cachedLensSignature;
    }
    const events = (eventsArr ?? [])
      .map((event) => `${event.type}:${event.status}:${event.payload?.targetLabel ?? "-"}:${Number(event.payload?.pressure ?? 0).toFixed(2)}`)
      .join("|");
    const ecology = (hotspotsArr ?? [])
      .map((entry) => `${entry.ix},${entry.iz}:${Number(entry.pressure ?? 0).toFixed(2)}`)
      .join("|");
    const sig = [
      gridVer,
      objectiveIdx,
      weatherCurrent,
      weatherHazard,
      weatherScore,
      trafficVer,
      trafficHotspots,
      spatialSummary,
      events,
      ecology,
    ].join("||");
    this._cachedLensSignature = sig;
    this._lastEventsLen = eventsLen;
    this._lastHotspotsLen = hotspotsLen;
    this._lastGridVerForLensSig = gridVer;
    this._lastTrafficVerForLensSig = trafficVer;
    this._lastTrafficHotspotsForLensSig = trafficHotspots;
    this._lastObjectiveIdxForLensSig = objectiveIdx;
    this._lastWeatherCurrentForLensSig = weatherCurrent;
    this._lastWeatherHazardForLensSig = weatherHazard;
    this._lastWeatherScoreForLensSig = weatherScore;
    this._lastSpatialSummaryForLensSig = spatialSummary;
    return sig;
  }

  #updatePressureLens() {
    // v0.8.0 Phase 7.C — heat mode swaps the marker source + signature diff.
    if (this.lensMode === "off") {
      this.#hidePressureMarkers();
      this.#hideHeatTileOverlay();
      this.pressureLensMarkers = [];
      return;
    }

    if (this.lensMode === "heat") {
      const signature = heatLensSignature(this.state);
      if (signature !== this.lastHeatLensSignature) {
        this.lastHeatLensSignature = signature;
        this.pressureLensMarkers = buildHeatLens(this.state);
      }
      this.#hidePressureMarkers();
      this.#updateHeatTileOverlay(this.pressureLensMarkers);
      return;
    } else {
      this.#hideHeatTileOverlay();
      const signature = this.#pressureLensSignature();
      if (signature !== this.lastPressureLensSignature) {
        this.lastPressureLensSignature = signature;
        this.pressureLensMarkers = buildPressureLens(this.state);
      }
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
      const isHeatMarker = String(marker.kind ?? "").startsWith("heat_");
      const pulseAmount = isHeatMarker ? HEAT_TILE_OVERLAY_VISUAL.pulseAmplitude : 0.08;
      const ringPulseAmount = isHeatMarker ? 0.28 : 0.12;
      const pulse = 1 + Math.sin(timeSec * (1.9 + Number(marker.weight ?? 0) * 0.9) + entry.phase) * pulseAmount;
      const ringPulse = 1 + Math.cos(timeSec * (1.4 + Number(marker.weight ?? 0) * 0.7) + entry.phase) * ringPulseAmount;
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

    // PHH R11: rebuild reverse map (tileIdx → road-instance index) so the
    // per-tick foot-traffic loop can write setColorAt on the right slot.
    if (this._roadInstanceIdxByTileIdx) this._roadInstanceIdxByTileIdx.fill(-1);
    for (let iz = 0; iz < this.state.grid.height; iz += 1) {
      for (let ix = 0; ix < this.state.grid.width; ix += 1) {
        const tileIdx = ix + iz * this.state.grid.width;
        const tile = this.state.grid.tiles[tileIdx];
        const info = TILE_INFO[tile];
        const mesh = this.tileMeshesByType.get(tile);
        if (!mesh) continue;
        const idx = counts.get(tile) ?? 0;
        const p = tileToWorld(ix, iz, this.state.grid);
        setInstancedMatrix(mesh, idx, p.x, info.height / 2, p.z, 1, info.height, 1);
        if (tile === TILE.ROAD && this._roadInstanceIdxByTileIdx) this._roadInstanceIdxByTileIdx[tileIdx] = idx;
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
    // v0.8.8 A8 (QA1 L7) — dropped renderLists.dispose() call. Three.js
    // auto-manages render lists per-frame; manually disposing here forced
    // a rebuild every clear (which can run multiple times per frame on
    // tile/entity rebuilds), wasting CPU on no observable benefit.
  }

  #rebuildTileModels() {
    if (!this.useTileModels || this.state.controls.visualPreset === "flat_worldsim") {
      this.#clearGroup(this.tileModelRoot);
      return;
    }

    this.#clearGroup(this.tileModelRoot);

    // v0.8.7 T3-5 (QA2-F10): wall HP visual indicator. For WALL/GATE tiles
    // with wallHp < wallMaxHp, modulate the binding tint toward red
    // proportional to (1 - hpRatio). Players can now see at a glance which
    // walls are taking damage rather than having to open the inspector.
    const wallMaxHp = Math.max(1, Number(BALANCE.wallMaxHp ?? 50));
    const gateMaxHp = Math.max(1, Number(BALANCE.gateMaxHp ?? wallMaxHp));
    const tileState = this.state.grid?.tileState ?? null;
    const computeWallHpDamageTint = (tileType, idx) => {
      if (tileType !== TILE.WALL && tileType !== TILE.GATE) return null;
      if (!tileState?.get) return null;
      const entry = tileState.get(idx);
      if (!entry || entry.wallHp == null) return null;
      const max = tileType === TILE.GATE ? gateMaxHp : wallMaxHp;
      const ratio = Math.max(0, Math.min(1, Number(entry.wallHp) / max));
      if (ratio >= 0.95) return null; // fully healthy — no visual change
      // Damage ranges 0..1, where 1 = at zero HP (full red shift).
      return 1 - ratio;
    };
    for (let iz = 0; iz < this.state.grid.height; iz += 1) {
      for (let ix = 0; ix < this.state.grid.width; ix += 1) {
        const idx = ix + iz * this.state.grid.width;
        const tileType = this.state.grid.tiles[idx];
        const binding = TILE_MODEL_BINDINGS[tileType];
        if (!binding) continue;
        const model = this.#cloneTemplate(binding.key);
        if (!model) continue;

        const damage = computeWallHpDamageTint(tileType, idx);
        if (damage != null) {
          // Lerp tint hex toward red (0xff5040) proportional to damage. We
          // round to the nearest 24-bit color so the result is still a
          // hex literal #applyTint can multiply into the base material.
          const baseHex = Number(binding.tint ?? 0xffffff);
          const baseR = (baseHex >> 16) & 0xff;
          const baseG = (baseHex >> 8) & 0xff;
          const baseB = baseHex & 0xff;
          const dmgR = 0xff;
          const dmgG = 0x50;
          const dmgB = 0x40;
          const t = Math.min(0.85, damage);
          const r = Math.round(baseR + (dmgR - baseR) * t);
          const g = Math.round(baseG + (dmgG - baseG) * t);
          const b = Math.round(baseB + (dmgB - baseB) * t);
          this.#applyTint(model, (r << 16) | (g << 8) | b);
        } else {
          this.#applyTint(model, binding.tint);
        }

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
    const animateEntities = this.#displaySettings().entityAnimations;

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
      const bobAmp = animateEntities ? (speed > 0.2 ? binding.bobAmp : binding.bobIdleAmp) : 0;
      const bobFreq = speed > 0.2 ? 9 : 3.4;
      const bob = Math.sin(this.state.metrics.timeSec * bobFreq + entry.phase) * bobAmp;

      entry.group.position.set(entity.x, 0, entity.z);
      entry.sprite.position.set(0, binding.y + bob, 0);
      entry.sprite.scale.set(binding.scale, binding.scale, 1);
      entry.shadow.visible = this.renderer.shadowMap.enabled;
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
    const animateEntities = this.#displaySettings().entityAnimations;

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
      entry.yaw = animateEntities ? lerpAngle(entry.yaw, targetYaw, turnSmooth) : targetYaw;
      const bobAmp = animateEntities ? (speed > 0.2 ? binding.bobAmp : binding.idleBobAmp) : 0;
      const bobFreq = speed > 0.2 ? 10 : 3.6;
      const bob = Math.sin(this.state.metrics.timeSec * bobFreq + entry.phase) * bobAmp;
      const lean = animateEntities ? clamp(speed * binding.leanFactor, 0, 0.11) : 0;

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
    const display = this.#displaySettings();
    const resolutionScale = clamp(Number(display.resolutionScale) || 1, 0.5, 1.75);
    const scaledTarget = targetPixelRatio * resolutionScale;
    const maxPixelRatio = Math.min(2.5, Math.max(0.45, this.basePixelRatio * resolutionScale));
    const clamped = Math.max(0.35, Math.min(maxPixelRatio, scaledTarget));
    if (Math.abs(clamped - this.currentPixelRatio) < 0.01) return;
    this.currentPixelRatio = clamped;
    this.renderer.setPixelRatio(clamped);
  }

  #entityMeshUpdateIntervalSec(totalEntities) {
    const requestedScale = Number(this.state.controls?.timeScale ?? 1);
    if (totalEntities >= 1000 && requestedScale >= 7) return 1 / 8;
    if (totalEntities >= 700 && requestedScale >= 7) return 1 / 10;
    if (totalEntities >= 700) return 1 / 15;
    if (totalEntities >= 350) return 1 / 24;
    // v0.10.1 R1 (A2 perf) — at small entity counts (the default casual
    // / Round-1 P3/P4 measurement profile, pop=21) the previous policy
    // was 0 = "update every RAF". A2 R1 measured ~18 ms steady-state
    // frame (~55 fps) and identified per-frame InstancedMesh writes as
    // a contributor. Throttling to 1/30s aligns with the sim fixed step
    // (entity positions advance at 30 Hz regardless), so visual smoothness
    // is preserved while halving InstancedMesh.needsUpdate work at 60 Hz.
    // When the user has a selected entity (hover / click), we still
    // return 0 so the selection ring follows the unit at full RAF cadence.
    if (this.state.controls?.selectedEntityId != null) return 0;
    return 1 / 30;
  }

  // PHH R11 (Plan-PHH-convoy-feel): one LineSegments for all worker trails
  // + per-tile EWMA foot-traffic weights tinted onto road InstancedMesh via
  // setColorAt. Render-only; no entity/AI/sim mutation. Called from inside
  // the worker bucket loop in #updateEntityMeshes (only when worker spheres
  // are visible).
  #updateWorkerTrailsAndRoadTraffic(visibleCount) {
    if (!this.workerTrailMesh || !this._workerTrailHistory) return;
    const TRAIL_LEN = this._trailLength;
    const positions = this._trailPositions;
    const colors = this._trailColors;
    const history = this._workerTrailHistory;
    const seen = new Set();
    const grid = this.state.grid;
    const W = grid.width;
    const H = grid.height;
    const tiles = grid.tiles;
    const weights = this._roadTrafficWeights;
    const roadMap = this._roadInstanceIdxByTileIdx;
    const roadMesh = this.tileMeshesByType?.get(TILE.ROAD);
    let segCursor = 0;
    for (let n = 0; n < visibleCount; n += 1) {
      const e = this.workerEntities[n];
      const id = e.id ?? n;
      seen.add(id);
      let h = history.get(id);
      if (!h) { h = []; history.set(id, h); }
      // Age existing entries; append new head; cap at TRAIL_LEN.
      for (let k = 0; k < h.length; k += 1) h[k].age += 1;
      h.push({ x: e.x, z: e.z, age: 0 });
      while (h.length > TRAIL_LEN) h.shift();
      // Write segments: (h[k], h[k+1]) for k in 0..len-2. Pad missing with head.
      const head = h[h.length - 1];
      for (let k = 0; k < TRAIL_LEN - 1; k += 1) {
        const a = h[k] ?? head;
        const b = h[k + 1] ?? head;
        const pi = segCursor * 6;
        positions[pi] = a.x;     positions[pi + 1] = 0.05; positions[pi + 2] = a.z;
        positions[pi + 3] = b.x; positions[pi + 4] = 0.05; positions[pi + 5] = b.z;
        const aA = Math.max(0, 0.5 - (a.age ?? 0) * (0.5 / TRAIL_LEN));
        const aB = Math.max(0, 0.5 - (b.age ?? 0) * (0.5 / TRAIL_LEN));
        const ci = segCursor * 8;
        colors[ci] = 1; colors[ci + 1] = 1; colors[ci + 2] = 1; colors[ci + 3] = aA;
        colors[ci + 4] = 1; colors[ci + 5] = 1; colors[ci + 6] = 1; colors[ci + 7] = aB;
        segCursor += 1;
      }
      // Foot-traffic EWMA: bump weight if current tile is a road tile.
      if (weights && tiles) {
        const { ix, iz } = worldToTile(e.x, e.z, grid);
        if (ix >= 0 && ix < W && iz >= 0 && iz < H) {
          const tIdx = ix + iz * W;
          if (tiles[tIdx] === TILE.ROAD) {
            // EWMA: weight = weight*0.97 + 4*0.03; clamped to [0,4].
            weights[tIdx] = weights[tIdx] * 0.97 + 0.12;
            if (weights[tIdx] > 4) weights[tIdx] = 4;
          }
        }
      }
    }
    // Drop history entries for workers no longer present.
    if (history.size > seen.size) {
      for (const key of history.keys()) if (!seen.has(key)) history.delete(key);
    }
    // Zero out unused trail slots (so stale segments don't render).
    const totalSegs = (this.workerMesh?.instanceMatrix?.count ?? 1200) * (TRAIL_LEN - 1);
    for (let s = segCursor; s < totalSegs; s += 1) {
      const ci = s * 8;
      colors[ci + 3] = 0; colors[ci + 7] = 0;
    }
    this.workerTrailMesh.geometry.attributes.position.needsUpdate = true;
    this.workerTrailMesh.geometry.attributes.color.needsUpdate = true;
    this.workerTrailMesh.geometry.setDrawRange(0, segCursor * 2);
    this.workerTrailMesh.visible = true;

    // Decay weights + write road tile colors. Decay rate ~0.967/sec ≈ 30 s
    // half-life — applied per-tick scaled by 1/30 (worker mesh ticks ~30 Hz).
    if (!weights || !roadMesh || !roadMap) return;
    const decay = 0.999; // per-tick (~30 Hz → ~0.967/sec)
    const baseR = this._roadBaseColor.r, baseG = this._roadBaseColor.g, baseB = this._roadBaseColor.b;
    const ambR = this._roadAmberColor.r, ambG = this._roadAmberColor.g, ambB = this._roadAmberColor.b;
    const tmp = this._roadTintColor;
    const total = W * H;
    for (let i = 0; i < total; i += 1) {
      if (roadMap[i] < 0) continue;
      weights[i] *= decay;
      // Quantize to 5 buckets for that "warm-amber, 5 levels" feel.
      const t = Math.min(weights[i] / 4, 1);
      const tQ = Math.floor(t * 4) / 4;
      tmp.setRGB(baseR + (ambR - baseR) * tQ, baseG + (ambG - baseG) * tQ, baseB + (ambB - baseB) * tQ);
      roadMesh.setColorAt(roadMap[i], tmp);
    }
    if (roadMesh.instanceColor) roadMesh.instanceColor.needsUpdate = true;
  }

  #updateEntityMeshes() {
    this.#collectEntityBuckets();
    const totalEntities = this.allEntities.length;
    const display = this.#displaySettings();
    const spritesReady = this.unitSpriteTextures.size > 0;
    const force2d = display.renderMode === "2d";
    const force3d = display.renderMode === "3d";
    const spriteMode = !force3d
      && totalEntities < 650
      && Boolean(this.state.controls.showUnitSprites)
      && spritesReady
      && this.state.controls.visualPreset === "flat_worldsim";
    this.state.debug.unitSpriteLoaded = spritesReady;

    if (spriteMode) {
      this.#setRenderPixelRatio(totalEntities >= 1000
        ? this.ultraLowQualityPixelRatio
        : totalEntities >= 700 ? this.lowQualityPixelRatio : this.basePixelRatio);
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
      // PGG R11: keep halos in lockstep with their parent sphere meshes.
      if (this.workerHaloMesh) {
        this.workerHaloMesh.visible = false;
        this.visitorHaloMesh.visible = false;
        this.herbivoreHaloMesh.visible = false;
        this.predatorHaloMesh.visible = false;
        this.workerHaloMesh.count = 0;
        this.visitorHaloMesh.count = 0;
        this.herbivoreHaloMesh.count = 0;
        this.predatorHaloMesh.count = 0;
      }

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

    let shouldUseEntityModels = force3d ? true : this.useEntityModels;
    if (force2d) shouldUseEntityModels = false;
    if (!force2d && !force3d && shouldUseEntityModels && totalEntities > this.modelDisableThreshold) shouldUseEntityModels = false;
    if (!force2d && !force3d && !shouldUseEntityModels && totalEntities < this.modelEnableThreshold) shouldUseEntityModels = true;
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

    const fastPixelRatio = totalEntities >= 1000
      ? this.ultraLowQualityPixelRatio
      : totalEntities >= 700
        ? this.lowQualityPixelRatio
        : Math.max(this.lowQualityPixelRatio, Math.min(this.basePixelRatio, 0.9));
    this.#setRenderPixelRatio(this.useEntityModels ? this.basePixelRatio : fastPixelRatio);

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
    // PGG R11: halos visible iff their sphere bucket is visible.
    if (this.workerHaloMesh) {
      this.workerHaloMesh.visible = workerFallbackVisible;
      this.visitorHaloMesh.visible = visitorFallbackVisible;
      this.herbivoreHaloMesh.visible = herbivoreFallbackVisible;
      this.predatorHaloMesh.visible = predatorFallbackVisible;
    }

    // v0.8.7.1 P7 — replace per-frame .slice() allocations with bounded
    // for-loops. Hot path on 700+ entities; eliminates 4 slice copies per
    // tick.
    // v0.10.1-A4 R1 (V5 P2 #4) — apply deterministic id-hashed stack jitter
    // so 4+ entities on the same tile no longer z-fight at the same world
    // coordinate. ~⅓ tile horizontal spread, ≤0.06 vertical so shadow cast
    // stays stable.
    // PGG R11: same per-entity loop also writes the halo InstancedMesh matrix
    // (lower y so the ring lays just above the ground plane, below the sphere).
    if (workerFallbackVisible) {
      const capacity = Number(this.workerMesh.instanceMatrix?.count ?? this.workerEntities.length);
      const visibleCount = Math.min(this.workerEntities.length, capacity);
      for (let n = 0; n < visibleCount; n += 1) {
        const e = this.workerEntities[n];
        const j = entityStackJitter(e.id ?? n);
        setInstancedMatrix(this.workerMesh, n, e.x + j.dx, 0.48 + j.dy, e.z + j.dz);
        if (this.workerHaloMesh) this.#setHaloMatrix(this.workerHaloMesh, n, e.x + j.dx, 0.06 + j.dy, e.z + j.dz);
      }
      this.workerMesh.count = visibleCount;
      if (this.workerHaloMesh) {
        this.workerHaloMesh.count = visibleCount;
        this.workerHaloMesh.instanceMatrix.needsUpdate = true;
      }
      // PHH R11: per-tick worker trails + road foot-traffic EWMA tint.
      this.#updateWorkerTrailsAndRoadTraffic(visibleCount);
    } else {
      this.workerMesh.count = 0;
      if (this.workerHaloMesh) this.workerHaloMesh.count = 0;
      if (this.workerTrailMesh) this.workerTrailMesh.visible = false;
    }
    this.workerMesh.instanceMatrix.needsUpdate = true;

    if (visitorFallbackVisible) {
      const capacity = Number(this.visitorMesh.instanceMatrix?.count ?? this.visitorEntities.length);
      const visibleCount = Math.min(this.visitorEntities.length, capacity);
      for (let n = 0; n < visibleCount; n += 1) {
        const e = this.visitorEntities[n];
        const j = entityStackJitter(e.id ?? n);
        setInstancedMatrix(this.visitorMesh, n, e.x + j.dx, 0.48 + j.dy, e.z + j.dz);
        if (this.visitorHaloMesh) this.#setHaloMatrix(this.visitorHaloMesh, n, e.x + j.dx, 0.06 + j.dy, e.z + j.dz);
      }
      this.visitorMesh.count = visibleCount;
      if (this.visitorHaloMesh) {
        this.visitorHaloMesh.count = visibleCount;
        this.visitorHaloMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      this.visitorMesh.count = 0;
      if (this.visitorHaloMesh) this.visitorHaloMesh.count = 0;
    }
    this.visitorMesh.instanceMatrix.needsUpdate = true;

    if (herbivoreFallbackVisible) {
      const capacity = Number(this.herbivoreMesh.instanceMatrix?.count ?? this.herbivoreEntities.length);
      const visibleCount = Math.min(this.herbivoreEntities.length, capacity);
      for (let n = 0; n < visibleCount; n += 1) {
        const e = this.herbivoreEntities[n];
        const j = entityStackJitter(e.id ?? n);
        setInstancedMatrix(this.herbivoreMesh, n, e.x + j.dx, 0.48 + j.dy, e.z + j.dz);
        if (this.herbivoreHaloMesh) this.#setHaloMatrix(this.herbivoreHaloMesh, n, e.x + j.dx, 0.06 + j.dy, e.z + j.dz);
      }
      this.herbivoreMesh.count = visibleCount;
      if (this.herbivoreHaloMesh) {
        this.herbivoreHaloMesh.count = visibleCount;
        this.herbivoreHaloMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      this.herbivoreMesh.count = 0;
      if (this.herbivoreHaloMesh) this.herbivoreHaloMesh.count = 0;
    }
    this.herbivoreMesh.instanceMatrix.needsUpdate = true;

    if (predatorFallbackVisible) {
      const capacity = Number(this.predatorMesh.instanceMatrix?.count ?? this.predatorEntities.length);
      const visibleCount = Math.min(this.predatorEntities.length, capacity);
      for (let n = 0; n < visibleCount; n += 1) {
        const e = this.predatorEntities[n];
        const j = entityStackJitter(e.id ?? n);
        setInstancedMatrix(this.predatorMesh, n, e.x + j.dx, 0.48 + j.dy, e.z + j.dz);
        if (this.predatorHaloMesh) this.#setHaloMatrix(this.predatorHaloMesh, n, e.x + j.dx, 0.06 + j.dy, e.z + j.dz);
      }
      this.predatorMesh.count = visibleCount;
      if (this.predatorHaloMesh) {
        this.predatorHaloMesh.count = visibleCount;
        this.predatorHaloMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      this.predatorMesh.count = 0;
      if (this.predatorHaloMesh) this.predatorHaloMesh.count = 0;
    }
    this.predatorMesh.instanceMatrix.needsUpdate = true;

    // v0.10.1 R1 (A2 perf) — reuse the lookup object (allocated in the
    // constructor) instead of building a fresh object literal each frame.
    // Field-by-field assignment keeps existing aliasing semantics (the
    // lookup just points at the bucket arrays) without producing a
    // short-lived 4-key object that the GC has to collect every RAF tick.
    this.renderEntityLookup.workers = this.workerEntities;
    this.renderEntityLookup.visitors = this.visitorEntities;
    this.renderEntityLookup.herbivores = this.herbivoreEntities;
    this.renderEntityLookup.predators = this.predatorEntities;

    if (this.state.debug) {
      this.state.debug.renderMode = this.useEntityModels ? "detailed" : "fast";
      this.state.debug.renderEntityCount = totalEntities;
      this.state.debug.renderEntityMeshLod = {
        totalEntities,
        updateIntervalSec: this.#entityMeshUpdateIntervalSec(totalEntities),
        skippedFrame: false,
      };
      this.state.debug.renderFallbackCounts = {
        workers: this.workerMesh.count,
        visitors: this.visitorMesh.count,
        herbivores: this.herbivoreMesh.count,
        predators: this.predatorMesh.count,
      };
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

    if (candidates.length === 0) {
      // Screen-space proximity fallback: when exact raycast missed (typical for
      // small instanced workers at moderate zoom), project alive entities to NDC
      // and pick the nearest one within ENTITY_PICK_FALLBACK_PX.
      const proximity = this.#proximityNearestEntity(mouse, ENTITY_PICK_FALLBACK_PX);
      if (proximity) return proximity.entity;
      return null;
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].entity;
  }

  // Proximity fallback entry point. Wraps `findProximityEntity` with the
  // renderer's camera + canvas so callers can keep using NDC `mouse` coords.
  // Returns { entity, pixelDistance } or null.
  #proximityNearestEntity(mouse, thresholdPx) {
    if (!this.camera || !this.canvas || !this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width || 0;
    const height = rect.height || this.canvas.height || 0;
    if (width <= 0 || height <= 0) return null;
    const camera = this.camera;
    const projectWorldToNdc = (x, z) => {
      VEC_TMP.set(x, 0, z);
      VEC_TMP.project(camera);
      return { ndcX: VEC_TMP.x, ndcY: VEC_TMP.y, ndcZ: VEC_TMP.z };
    };
    const agents = Array.isArray(this.state.agents) ? this.state.agents : [];
    const animals = Array.isArray(this.state.animals) ? this.state.animals : [];
    // v0.8.8 A10 (QA3 L4) — reuse a single concat buffer across calls to
    // avoid generator-protocol overhead and per-yield allocations on hot
    // pointer-move paths. Cleared in-place each call.
    if (!this._proximityEntityBuf) this._proximityEntityBuf = [];
    const buf = this._proximityEntityBuf;
    buf.length = 0;
    for (let i = 0; i < agents.length; i += 1) buf.push(agents[i]);
    for (let i = 0; i < animals.length; i += 1) buf.push(animals[i]);
    return findProximityEntity({
      entities: buf,
      projectWorldToNdc,
      mouseNdc: { x: mouse.x, y: mouse.y },
      viewport: { width, height },
      thresholdPx,
    });
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
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;

    const picked = this.#pickTile(this.mouse);
    this.hoverTile = picked?.tile ?? null;

    // Pipe BuildSystem.previewToolAt reasonText into state.controls.buildHint for
    // HUD surfacing. When the hovered tile is invalid for the current tool, the
    // player sees the textual reason (e.g. "Farm requires grass tile") instead of
    // a silent red mesh. Appends Ctrl+Z hint when there's an undo stack so the
    // shortcut is discoverable at the point of error.
    const state = this.state;
    try {
      if (this.hoverTile && state?.controls?.tool && state.controls.tool !== "select") {
        const preview = this.buildSystem.previewToolAt(
          state, state.controls.tool, this.hoverTile.ix, this.hoverTile.iz,
        );
        if (preview && preview.ok === false) {
          const tip = summarizeBuildPreview(preview);
          const undoHint = Array.isArray(state.controls?.undoStack) && state.controls.undoStack.length > 0
            ? " (Ctrl+Z to undo last build.)"
            : "";
          state.controls.buildHint = tip + undoHint;
        } else {
          state.controls.buildHint = "";
        }
      } else if (state?.controls) {
        state.controls.buildHint = "";
      }
    } catch {
      // buildHint is UI sugar — never fail the hover path on a preview error.
      if (state?.controls) state.controls.buildHint = "";
    }

    // Tile info tooltip in select mode.
    try {
      if (this.hoverTile && state?.controls?.tool === "select") {
        this.#updateTileInfoTooltip(this.hoverTile.ix, this.hoverTile.iz, this.lastPointerClientX, this.lastPointerClientY);
      } else {
        this.#hideTileInfoTooltip();
      }
    } catch {
      // Tooltip is UI sugar — never fail on errors.
    }
  }

  #onPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    // v0.10.1-n A3 — F2 fix: when a placement tool is active, the click
    // should TRY the tile first; entity-pick is only a fallback when the
    // placement is illegal because the tile is occupied by a unit. Without
    // this priority, a click on grass near a wandering bear silently
    // becomes "Selected Bear-20" and the road never appears, which the
    // first-impression reviewer logged as P0.
    const activeTool = this.state.controls?.tool;
    const isPlacementTool = activeTool && activeTool !== "select" && activeTool !== "inspect";
    if (isPlacementTool) {
      // 14 px guard (R2 F1: was 36 px — see ENTITY_PICK_GUARD_PX): only
      // when the click *actually overlaps* a worker sprite (~12 px hitbox
      // + 2 px slop) do we fall through to entity-pick. Outside that
      // narrow radius the placement tool wins and a road / farm gets
      // dropped on the tile, which is what the player asked for.
      const nearWorker = this.#proximityNearestEntity(this.mouse, ENTITY_PICK_GUARD_PX);
      if (!nearWorker) {
        const picked = this.#pickTile(this.mouse);
        if (picked) {
          const { tile } = picked;
          this.state.controls.selectedEntityId = null;
          this.#updateSelectedTile(tile.ix, tile.iz);
          const inspectOnly = event.altKey;
          if (inspectOnly) {
            this.state.controls.actionMessage = `Selected tile (${tile.ix}, ${tile.iz})`;
            this.state.controls.actionKind = "info";
            return;
          }
          const buildResult = this.buildSystem.placeToolAt(this.state, activeTool, tile.ix, tile.iz);
          this.state.controls.buildPreview = buildResult;
          if (buildResult.ok) {
            this.#updateSelectedTile(tile.ix, tile.iz);
            this.state.controls.actionMessage = buildResult.message ?? `Built ${activeTool} at (${tile.ix}, ${tile.iz})`;
            this.state.controls.actionKind = "success";
            const worldPos = tileToWorld(tile.ix, tile.iz, this.state.grid);
            this.#spawnFloatingToast(worldPos.x, worldPos.z, formatToastText(buildResult), "success", tile.ix, tile.iz);
            return;
          }
          // Placement failed. Only fall through to entity-pick when the
          // failure was caused by an entity-on-tile collision; for any
          // other failure (waterBlocked, insufficientResource, hardCap,
          // missing_resource_node, etc.) the player needs the rejection
          // reason as dominant feedback, NOT a silent entity selection.
          const isEntityCollision = buildResult.reason === "occupiedTile";
          if (!isEntityCollision) {
            this.state.controls.actionMessage = summarizeBuildPreview(buildResult)
              || buildResult.reasonText
              || explainBuildReason(buildResult.reason, buildResult);
            this.state.controls.actionKind = "error";
            const worldPos = tileToWorld(tile.ix, tile.iz, this.state.grid);
            const text = formatToastText(buildResult, this.state.resources);
            this.#spawnFloatingToast(worldPos.x, worldPos.z, text, "error", tile.ix, tile.iz);
            return;
          }
          // entity-collision → fall through to #pickEntity below so the
          // user sees the unit on the tile instead of an opaque "tile
          // occupied" toast.
        }
      } else {
        // Inside the 14 px guard — user wanted the worker, not a
        // placement; explicit message, then fall through to entity-pick.
        this.state.controls.actionMessage = "Selecting nearby unit (release the build tool to place)";
        this.state.controls.actionKind = "info";
      }
    }

    const selected = this.#pickEntity(this.mouse);
    if (selected) {
      this.state.controls.selectedEntityId = selected.id;
      this.state.controls.selectedTile = null;
      // Clear stale hover build preview so the mesh stops flashing on the
      // tile underneath when a click lands on a worker via proximity fallback.
      this.state.controls.buildPreview = null;
      if (this.state.debug) this.state.debug.selectedTile = null;
      this.state.controls.actionMessage = `Selected ${selected.displayName ?? selected.id}`;
      this.state.controls.actionKind = "info";
      // Surface a confirmation toast over the selected entity for feedback.
      // Uses tile coords (-1,-1) to bypass the per-tile dedupe window.
      try {
        const selName = selected.displayName ?? selected.id;
        this.#spawnFloatingToast(selected.x ?? 0, selected.z ?? 0, `Selected ${selName}`, "info", -1, -1);
      } catch (err) {
        // Spawning a toast is a non-essential UI sugar — never fail the
        // click path if the DOM layer is absent (tests / headless).
      }
      // Auto-expand the EntityFocus overlay on first successful pick so the
      // inspector is visible without requiring a separate click.
      if (typeof document !== "undefined") {
        try {
          const overlay = document.getElementById("entityFocusOverlay");
          if (overlay && !overlay.open) overlay.open = true;
        } catch {
          // headless DOM / forbidden contexts — safe no-op.
        }
      }
      this.onSelectEntity?.(selected.id);
      return;
    }

    // No entity hit and no placement-tool branch executed (or the
    // placement branch fell through with no entity nearby): handle as a
    // pure tile-select for "select"/"inspect" tools.
    if (!isPlacementTool) {
      const picked = this.#pickTile(this.mouse);
      if (!picked) return;

      const { tile } = picked;
      this.state.controls.selectedEntityId = null;
      this.#updateSelectedTile(tile.ix, tile.iz);
      const inspectOnly = event.altKey;
      if (inspectOnly) {
        this.state.controls.actionMessage = `Selected tile (${tile.ix}, ${tile.iz})`;
        this.state.controls.actionKind = "info";
      }
    }
  }

  #handleDeathToastEvent(event) {
    const detail = event?.detail ?? {};
    const worldX = Number(detail.worldX);
    const worldZ = Number(detail.worldZ);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return;
    const name = String(detail.entityName ?? detail.displayName ?? "Worker").trim() || "Worker";
    const reason = String(detail.reason ?? "event").trim() || "event";
    const foodEmptySec = Number(detail.foodEmptySec ?? 0);
    const secText = foodEmptySec >= 5 ? ` - food empty ${Math.floor(foodEmptySec)}s` : "";
    const text = event?.type === EVENT_TYPES.WORKER_STARVED || reason === "starvation"
      ? `${name} starved${secText}`
      : `${name} died - ${reason}`;
    const tile = detail.tile ?? {};
    this.#spawnFloatingToast(
      worldX,
      worldZ,
      text,
      "death",
      Number.isFinite(Number(tile.ix)) ? Number(tile.ix) : -1,
      Number.isFinite(Number(tile.iz)) ? Number(tile.iz) : -1,
    );
    const now = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
    this.state.ui ??= {};
    this.state.ui.deathToastShownUntil = now + 3500;
  }

  #handleMilestoneToastEvent(event) {
    const detail = event?.detail ?? {};
    const anchor = detail.tile
      ?? this.state.gameplay?.scenario?.anchors?.coreWarehouse
      ?? { ix: Math.floor(Number(this.state.grid?.width ?? 0) / 2), iz: Math.floor(Number(this.state.grid?.height ?? 0) / 2) };
    const world = Number.isFinite(Number(detail.worldX)) && Number.isFinite(Number(detail.worldZ))
      ? { x: Number(detail.worldX), z: Number(detail.worldZ) }
      : tileToWorld(Number(anchor.ix ?? 0), Number(anchor.iz ?? 0), this.state.grid);
    const text = String(detail.label ?? "Milestone reached").trim() || "Milestone reached";
    this.#spawnFloatingToast(
      world.x,
      world.z,
      text,
      "milestone",
      Number.isFinite(Number(anchor.ix)) ? Number(anchor.ix) : -1,
      Number.isFinite(Number(anchor.iz)) ? Number(anchor.iz) : -1,
    );
  }

  #spawnFloatingToast(worldX, worldZ, text, kind, tileIx = -1, tileIz = -1) {
    // Re-query once if the layer wasn't in the DOM at construction time (tests).
    if (!this.toastLayer && typeof document !== "undefined") {
      this.toastLayer = document.getElementById("floatingToastLayer");
      if (!this.toastLayer) return;
    }
    if (!this.toastLayer || !this.camera) return;
    // 2s message-text dedup: suppress identical toast messages within 2 seconds.
    this._lastToastTextMap ??= new Map();
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    // v0.8.7 T1-2 (QA3-C2): prune entries older than 2s before insert. Pre-fix
    // this map grew unbounded (every unique toast text accumulated forever) —
    // a long-running session with autopilot could leak megabytes of strings
    // over a few hours.
    for (const [k, t] of this._lastToastTextMap) {
      if (now - t > 2000) this._lastToastTextMap.delete(k);
    }
    // v0.8.8 A6 (F18) — for ERROR toasts include tile coords in the dedup
    // key so per-tile failures (e.g. "Need 5 wood" on tile A then on tile
    // B 200ms later) aren't suppressed when the player is rapidly trying
    // multiple tiles. Non-error toasts keep simple text-based dedup so we
    // don't spam success/info pulses.
    const dedupKey = kind === "error" || kind === "err"
      ? `${text}@${tileIx},${tileIz}`
      : text;
    if (this._lastToastTextMap.has(dedupKey) && now - this._lastToastTextMap.get(dedupKey) < 2000) return;
    this._lastToastTextMap.set(dedupKey, now);
    // Throttle: ignore duplicate clicks on the same tile within 100ms.
    const key = `${tileIx},${tileIz}`;
    if (key === this.lastToastTileKey && (now - this.lastToastTimeMs) < 100) return;
    this.lastToastTileKey = key;
    this.lastToastTimeMs = now;

    // Project world coords to NDC, then to CSS pixels inside the viewport rect.
    const canvasRect = this.canvas.getBoundingClientRect();
    const layerRect = this.toastLayer.getBoundingClientRect();
    VEC_TMP.set(Number(worldX) || 0, 0, Number(worldZ) || 0);
    VEC_TMP.project(this.camera);
    const px = canvasRect.left - layerRect.left + (VEC_TMP.x * 0.5 + 0.5) * canvasRect.width;
    const py = canvasRect.top - layerRect.top + (-VEC_TMP.y * 0.5 + 0.5) * canvasRect.height;

    // Acquire a div from the pool or create one on demand (cap at 6 reused nodes).
    let node = this.toastPool.find((n) => n.dataset.busy !== "1");
    if (!node) {
      if (this.toastPool.length >= 6) {
        node = this.toastPool[0]; // oldest — evict and reuse
      } else {
        node = document.createElement("div");
        this.toastLayer.appendChild(node);
        this.toastPool.push(node);
      }
    }

    node.dataset.busy = "1";
    const classKind = kind === "success"
      ? "ok"
      : kind === "death"
        ? "death"
        : kind === "milestone"
          ? "milestone"
          : "err";
    node.className = `build-toast build-toast--${classKind}`;
    node.textContent = String(text ?? "");
    node.style.left = `${px}px`;
    node.style.top = `${py}px`;
    // Reset the keyframe animation so repeat spawns on the same node re-trigger.
    node.style.animation = "none";
    // Force reflow so the reset takes effect before the new animation is applied.
    void node.offsetWidth;
    const animationName = kind === "death" ? "toastDeath" : kind === "milestone" ? "toastMilestone" : "toastFloat";
    const durationMs = kind === "death"
      ? 4000
      : kind === "milestone"
        ? 3200
        : kind === "err"
          ? CASUAL_UX.errToastMs
          : kind === "warn"
            ? CASUAL_UX.warnToastMs
            : CASUAL_UX.successToastMs;
    node.style.animation = `${animationName} ${durationMs / 1000}s ease-out forwards`;

    // Free the slot shortly after the animation ends.
    if (node._utopiaToastTimer) clearTimeout(node._utopiaToastTimer);
    node._utopiaToastTimer = setTimeout(() => {
      node.dataset.busy = "0";
      node.style.animation = "none";
      node.style.opacity = "0";
    }, durationMs + 50);
  }

  /**
   * v0.8.7 T3-3 (QA2-F3): clear all in-flight toast nodes. BuildToolbar's
   * tool-change handler dispatches `utopia:toolChange`; GameApp listens and
   * forwards to here so stale toasts don't bleed across tool changes (e.g.,
   * "Need 5 wood" left over after switching from BUILD to ERASE).
   */
  clearToasts() {
    if (!Array.isArray(this.toastPool)) return;
    for (const node of this.toastPool) {
      if (!node) continue;
      if (node._utopiaToastTimer) {
        clearTimeout(node._utopiaToastTimer);
        node._utopiaToastTimer = null;
      }
      node.dataset.busy = "0";
      node.style.animation = "none";
      node.style.opacity = "0";
      node.textContent = "";
    }
    // Drop the dedup map so the same text can re-fire under the next tool.
    if (this._lastToastTextMap?.clear) this._lastToastTextMap.clear();
  }

  spawnDeathToast(worldX, worldZ, name, reason, tileIx = -1, tileIz = -1) {
    const safeName = String(name ?? "Worker").trim() || "Worker";
    const safeReason = String(reason ?? "unknown cause").trim() || "unknown cause";
    this.#spawnFloatingToast(
      worldX,
      worldZ,
      `${safeName} died - ${safeReason}`,
      "death",
      tileIx,
      tileIz,
    );
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

      // v0.10.1-A3 R2 (F1) — ghost-preview tile follows the cursor in
      // placement mode and tints green/red based on placeToolAt feasibility.
      // Reuses state.controls.buildPreview so the existing BuildToolbar /
      // InspectorPanel hint pipelines see the same payload as the click
      // path. Gated on `tool` being a placement tool — for "select" /
      // null tool the preview mesh stays hidden so the player gets a
      // clean tile-info hover instead of a misleading green/red flash.
      const tool = this.state.controls?.tool;
      const isPlacementTool = tool && tool !== "select" && tool !== "inspect";
      if (isPlacementTool) {
        const preview = this.buildSystem.previewToolAt(this.state, tool, this.hoverTile.ix, this.hoverTile.iz);
        this.state.controls.buildPreview = preview;
        this.previewMesh.visible = true;
        this.previewMesh.position.set(p.x, 0.2, p.z);
        const color = preview.ok ? 0x6eeb83 : 0xff6b6b;
        this.previewMesh.material.color.setHex(color);
      } else {
        this.previewMesh.visible = false;
        this.state.controls.buildPreview = null;
      }
    }

    // In casual profile, scale the preview mesh slightly so the legal/illegal
    // cue is easier to read at standard zoom.
    const profile = this.state.controls?.uiProfile ?? "casual";
    if (this.hoverTile && this.previewMesh?.visible) {
      const accent = profile === "casual" ? 1.08 : 1.0;
      this.previewMesh.scale.set(accent, accent, accent);
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
    this.#applyRendererDisplaySettings();
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
      // v0.8.8 A12 (QA3 L6) — NaN sentinel mismatches integer hash.
      this.lastEntityRenderSignature = NaN;
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

  // v0.8.0 Phase 7.C — Supply-Chain Heat Lens toggle (spec § 6).
  // Cycle order: pressure → heat → off → pressure. Returns the new mode so
  // callers (L-key handler, HUD button) can update their UI state.
  toggleHeatLens() {
    const next = this.lensMode === "pressure"
      ? "heat"
      : this.lensMode === "heat"
        ? "off"
        : "pressure";
    this.setLensMode(next);
    return this.lensMode;
  }

  setLensMode(mode) {
    const valid = mode === "heat" || mode === "off" ? mode : "pressure";
    if (this.lensMode === valid) return this.lensMode;
    this.lensMode = valid;
    // Invalidate cached signatures so the next update() rebuilds the marker set
    // against the freshly-selected mode regardless of whether state has changed.
    this.lastPressureLensSignature = "";
    this.lastHeatLensSignature = "";
    return this.lensMode;
  }

  getLensMode() {
    return this.lensMode;
  }

  // Cycle terrain overlay mode: null → "fertility" → "elevation" → "connectivity" → "nodeDepletion" → null.
  // Returns the new mode string (null when off).
  toggleTerrainLens() {
    const MODES = [null, "fertility", "elevation", "connectivity", "nodeDepletion"];
    const idx = MODES.indexOf(this.terrainLensMode);
    this.terrainLensMode = MODES[(idx + 1) % MODES.length];
    if (!this.terrainLensMode) {
      this.#hideTerrainOverlay();
    } else {
      // Force rebuild on next render pass.
      this.lastTerrainVersion = -1;
    }
    return this.terrainLensMode;
  }

  // Directly set a specific terrain overlay mode without cycling.
  // targetMode: null | "fertility" | "elevation" | "connectivity" | "nodeDepletion"
  // Returns the new mode (unchanged if targetMode is invalid or already active).
  setTerrainLensMode(targetMode) {
    const VALID = [null, "fertility", "elevation", "connectivity", "nodeDepletion"];
    if (!VALID.includes(targetMode)) return this.terrainLensMode;
    if (this.terrainLensMode === targetMode) return targetMode;
    this.terrainLensMode = targetMode;
    this.#updateTerrainFertilityOverlay();
    return targetMode;
  }

  getTerrainLensActive() {
    return this.terrainLensMode !== null;
  }

  getTerrainLensMode() {
    return this.terrainLensMode;
  }

  resetView() {
    // v0.10.1-n A3 — mirror constructor: full-grid framing factor 1.05 (was 0.65).
    this.orthoSize = Math.max(this.state.grid.width, this.state.grid.height) * 1.05;
    this.lastGridVersion = -1;
    // Rebuild instanced meshes if grid dimensions changed (capacity may differ)
    const newCount = this.state.grid.width * this.state.grid.height;
    const existingSample = this.tileMeshesByType.values().next().value;
    if (!existingSample || existingSample.instanceMatrix.count !== newCount) {
      for (const mesh of this.tileMeshesByType.values()) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
      this.#setupTileMesh();
      // Rebuild tile border grid lines for new dimensions
      if (this.tileBorderLines) {
        this.scene.remove(this.tileBorderLines);
        this.tileBorderLines.geometry.dispose();
        this.tileBorderLines.material.dispose();
      }
      this.#setupTileBorders();
      this.fogOverlay?.dispose?.();
      this.fogOverlay = new FogOverlay(this.state.grid);
      this.fogOverlay.attach(this.scene);
    }
    this.#updateOrthoProjection();
    this.applyViewState(DEFAULT_CAMERA_VIEW);
  }

  // v0.8.2 Round-7 01d — rain particle system. Three simple private methods
  // so the render() loop stays readable. _rainParticles is null when dry.
  #createRainParticles() {
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 100;
      pos[i * 3 + 1] = Math.random() * 30 + 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x88aacc, size: 0.15, transparent: true, opacity: 0.5 });
    this._rainParticles = new THREE.Points(geo, mat);
    this.scene.add(this._rainParticles);
  }

  #removeRainParticles() {
    if (this._rainParticles) {
      this.scene.remove(this._rainParticles);
      this._rainParticles.geometry.dispose();
      this._rainParticles.material.dispose();
      this._rainParticles = null;
    }
  }

  #updateRainParticles() {
    const pos = this._rainParticles.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] -= 0.3;
      if (pos[i] < 0) pos[i] = Math.random() * 30 + 10;
    }
    this._rainParticles.geometry.attributes.position.needsUpdate = true;
  }

  render(dt) {
    this.#applyRuntimeControlSettings();
    const display = this.#displaySettings();
    this.#syncVisualAssetDebug();
    this.#ensureModelTemplatesRequested();
    this.controls.update();
    this.#updateTileLayerVisibilityByZoom();
    this.#applyAtmosphere(dt);

    // v0.8.2 Round-7 01d — weather rain particles: activate when
    // state.weather.current === "rain" (or "storm"), deactivate otherwise.
    const weatherNow = String(this.state.weather?.current ?? "clear");
    const isRaining = display.effectsEnabled
      && display.weatherParticles
      && (weatherNow === "rain" || weatherNow === "storm");
    if (isRaining !== Boolean(this._weatherRain)) {
      this._weatherRain = isRaining;
      if (isRaining) {
        this.#createRainParticles();
      } else {
        this.#removeRainParticles();
      }
    }
    if (this._rainParticles) this.#updateRainParticles();

    this.#rebuildTilesIfNeeded();
    const totalEntities = Number(this.state.agents?.length ?? 0) + Number(this.state.animals?.length ?? 0);
    const entityUpdateIntervalSec = this.#entityMeshUpdateIntervalSec(totalEntities);
    this.entityMeshUpdateAccumulatorSec += dt;
    // v0.8.8 A12 (QA3 L6) — integer hash instead of join("|") string. The
    // signature is computed every frame even when entities haven't changed,
    // so avoiding the string concat + comparison saves microseconds at
    // 60Hz and avoids one tiny allocation per frame. We fold 9 numeric
    // inputs (string fields hashed via cheap rolling hash) using
    // `(a * 31 + b) | 0` so the result fits in a 32-bit signed int.
    const visualPreset = this.state.controls.visualPreset ?? "";
    const renderMode = display.renderMode ?? "";
    let presetHash = 0;
    for (let i = 0; i < visualPreset.length; i += 1) presetHash = ((presetHash * 31) + visualPreset.charCodeAt(i)) | 0;
    let modeHash = 0;
    for (let i = 0; i < renderMode.length; i += 1) modeHash = ((modeHash * 31) + renderMode.charCodeAt(i)) | 0;
    let entityRenderSignature = 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (this.state.agents.length | 0)) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (this.state.animals.length | 0)) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (this.state.controls.showUnitSprites ? 1 : 0)) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + presetHash) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (this.modelDisableThreshold | 0)) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (this.modelTemplates.size | 0)) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + modeHash) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (Math.round(Number(display.resolutionScale ?? 0) * 1000) | 0)) | 0;
    entityRenderSignature = ((entityRenderSignature * 31) + (display.entityAnimations ? 1 : 0)) | 0;
    const shouldUpdateEntities = entityRenderSignature !== this.lastEntityRenderSignature
      || entityUpdateIntervalSec <= 0
      || this.entityMeshUpdateAccumulatorSec >= entityUpdateIntervalSec;
    if (shouldUpdateEntities) {
      this.lastEntityRenderSignature = entityRenderSignature;
      this.entityMeshUpdateAccumulatorSec = 0;
      this.#updateEntityMeshes();
    } else if (this.state.debug) {
      this.state.debug.renderEntityMeshLod = {
        totalEntities,
        updateIntervalSec: entityUpdateIntervalSec,
        skippedFrame: true,
      };
    }
    this.#updatePathLine();
    const fogVisible = display.effectsEnabled && display.fogEnabled;
    if (this.fogOverlay?.mesh) this.fogOverlay.mesh.visible = fogVisible;
    if (fogVisible) this.fogOverlay?.update?.(this.state);
    this.#updatePressureLens();
    this.#updatePressureLensLabels();
    this.#updatePlacementLens();
    this.#updateTerrainFertilityOverlay();
    this.#updateOverlayMeshes();
    this.#updateConstructionOverlays();

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
    this.fogOverlay?.dispose?.();
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
