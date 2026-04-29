import * as THREE from "three";
import { TILE } from "../config/constants.js";

export const PROCEDURAL_TILE_TEXTURE_PROFILES = Object.freeze({
  [TILE.GRASS]: Object.freeze({
    size: 72,
    repeatX: 1.8,
    repeatY: 1.8,
    pattern: "grass",
    base: "#7ea95a",
    accent: "#5f7f39",
    detail: "#97bc68",
    line: "#456128",
  }),
  [TILE.ROAD]: Object.freeze({
    size: 72,
    repeatX: 1.2,
    repeatY: 1.2,
    pattern: "road",
    base: "#cdb18e",
    accent: "#a68966",
    detail: "#e7d5bc",
    line: "#8b6f4f",
  }),
  [TILE.FARM]: Object.freeze({
    size: 72,
    repeatX: 1.15,
    repeatY: 1.15,
    pattern: "farm",
    base: "#9a743d",
    accent: "#c19b52",
    detail: "#dfcb6e",
    line: "#6e5024",
  }),
  [TILE.LUMBER]: Object.freeze({
    size: 72,
    repeatX: 1.2,
    repeatY: 1.2,
    pattern: "lumber",
    base: "#6b9351",
    accent: "#446734",
    detail: "#91b36a",
    line: "#2f4a24",
  }),
  [TILE.WAREHOUSE]: Object.freeze({
    size: 72,
    repeatX: 1,
    repeatY: 1,
    pattern: "warehouse",
    base: "#b68b67",
    accent: "#8d654a",
    detail: "#d8b390",
    line: "#6e4a33",
  }),
  [TILE.WALL]: Object.freeze({
    size: 72,
    repeatX: 1,
    repeatY: 1,
    pattern: "wall",
    base: "#8f98a2",
    accent: "#66717a",
    detail: "#b3bcc6",
    line: "#4c5660",
  }),
  [TILE.RUINS]: Object.freeze({
    size: 72,
    repeatX: 1,
    repeatY: 1,
    pattern: "ruins",
    base: "#8c705d",
    accent: "#675244",
    detail: "#b49782",
    line: "#4d3b30",
  }),
  [TILE.WATER]: Object.freeze({
    size: 72,
    repeatX: 1.45,
    repeatY: 1.45,
    pattern: "water",
    base: "#62a8d9",
    accent: "#3779ab",
    detail: "#8fd1f6",
    line: "#24597f",
  }),
  [TILE.QUARRY]: Object.freeze({
    size: 72,
    repeatX: 1.15,
    repeatY: 1.15,
    pattern: "quarry",
    base: "#8c7a62",
    accent: "#a59478",
    detail: "#6e5c48",
    line: "#524030",
  }),
  [TILE.HERB_GARDEN]: Object.freeze({
    size: 72,
    repeatX: 1.2,
    repeatY: 1.2,
    pattern: "herb_garden",
    base: "#5a8c4a",
    accent: "#7bb86a",
    detail: "#3d6b30",
    line: "#2e5220",
  }),
  [TILE.KITCHEN]: Object.freeze({
    size: 72,
    repeatX: 1.1,
    repeatY: 1.1,
    pattern: "kitchen",
    base: "#b8924a",
    accent: "#d4a65a",
    detail: "#8c6e32",
    line: "#6e5424",
  }),
  [TILE.SMITHY]: Object.freeze({
    size: 72,
    repeatX: 1.1,
    repeatY: 1.1,
    pattern: "smithy",
    base: "#6b5a4a",
    accent: "#8c7a6b",
    detail: "#4a3a2a",
    line: "#3a2a1a",
  }),
  [TILE.CLINIC]: Object.freeze({
    size: 72,
    repeatX: 1.1,
    repeatY: 1.1,
    pattern: "clinic",
    base: "#a8c4a0",
    accent: "#c4d8c0",
    detail: "#88a880",
    line: "#6a8a62",
  }),
  [TILE.BRIDGE]: Object.freeze({
    size: 72,
    repeatX: 1.2,
    repeatY: 1.2,
    pattern: "bridge",
    base: "#3a6e9a",
    accent: "#9a7e5a",
    detail: "#c4a878",
    line: "#6e5434",
  }),
  // v0.8.4 strategic walls + GATE (Agent C). Wood-and-iron palette so
  // gates read as a doorway in the wall line, not another wall segment.
  // The "gate" pattern is a vertical-plank door with iron banding —
  // visually distinct from the brick wall pattern next to it.
  [TILE.GATE]: Object.freeze({
    size: 72,
    repeatX: 1,
    repeatY: 1,
    pattern: "gate",
    base: "#8b6f47",
    accent: "#a98552",
    detail: "#5e4a2c",
    line: "#3a2c18",
  }),
});

export function resolveTileTextureMode(manifest = null) {
  const raw = String(manifest?.tileTextureMode ?? "").trim().toLowerCase();
  return raw === "atlas" ? "atlas" : "procedural";
}

function createCanvas(size) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(size, size);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  return null;
}

function drawNoiseDots(ctx, size, color, count, radiusMin, radiusMax, alpha = 1) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i += 1) {
    const seed = i * 0.7548776662466927;
    const x = ((Math.sin(seed * 12.9898) + 1) * 0.5) * size;
    const y = ((Math.sin(seed * 78.233) + 1) * 0.5) * size;
    const radius = radiusMin + (((Math.sin(seed * 34.133) + 1) * 0.5) * (radiusMax - radiusMin));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGrass(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  drawNoiseDots(ctx, size, profile.accent, 180, 0.8, 1.8, 0.22);
  drawNoiseDots(ctx, size, profile.detail, 120, 0.6, 1.3, 0.24);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.14;
  for (let x = 4; x < size; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.quadraticCurveTo(x + 1.2, size - 10, x - 1, size - 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoad(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  drawNoiseDots(ctx, size, profile.accent, 120, 0.7, 1.6, 0.28);
  drawNoiseDots(ctx, size, profile.detail, 56, 0.8, 2.1, 0.24);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.1;
  ctx.globalAlpha = 0.12;
  for (let y = 9; y < size; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFarm(ctx, profile) {
  // v0.8.8 A13 — TODO removed. Per-tile dynamic salinization cannot be
  // expressed in a shared per-TYPE CanvasTexture; signalling exhausted
  // soil is handled instead via the SoilExhaustion overlay layer
  // (renderInstancedTileOverlays in SceneRenderer.js), which paints a
  // tinted decal on top of farm tiles whose salinized > 0.5.
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.42;
  for (let x = 5; x < size; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 4, size);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = profile.detail;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.44;
  for (let x = 10; x < size; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x - 6, size - 4);
    ctx.stroke();
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.accent, 48, 1.2, 2.1, 0.16);
}

function drawLumber(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  drawNoiseDots(ctx, size, profile.accent, 70, 3.2, 5.8, 0.35);
  drawNoiseDots(ctx, size, profile.detail, 48, 1.8, 3.4, 0.22);
  ctx.save();
  ctx.fillStyle = profile.line;
  ctx.globalAlpha = 0.26;
  for (let y = 6; y < size; y += 18) {
    for (let x = 5; x < size; x += 18) {
      ctx.fillRect(x, y, 2, 6);
    }
  }
  ctx.restore();
}

function drawWarehouse(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.32;
  for (let y = 0; y <= size; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  for (let x = 0; x <= size; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 36, 1.2, 2.2, 0.2);
}

function drawWall(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.34;
  const rowHeight = 14;
  const brickWidth = 18;
  for (let row = 0; row < Math.ceil(size / rowHeight); row += 1) {
    const y = row * rowHeight;
    const offset = row % 2 === 0 ? 0 : brickWidth / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    for (let x = -offset; x < size + brickWidth; x += brickWidth) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, Math.min(size, y + rowHeight));
      ctx.stroke();
    }
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 32, 1, 2, 0.18);
}

function drawRuins(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 10; i += 1) {
    const x = 4 + ((i * 17) % (size - 18));
    const y = 5 + ((i * 23) % (size - 18));
    const w = 8 + ((i * 7) % 14);
    const h = 6 + ((i * 11) % 12);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 50, 1, 2.8, 0.24);
  drawNoiseDots(ctx, size, profile.accent, 22, 2.2, 4.4, 0.18);
}

function drawWater(ctx, profile) {
  const { width: size } = ctx.canvas;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, profile.detail);
  gradient.addColorStop(0.55, profile.base);
  gradient.addColorStop(1, profile.accent);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.22;
  for (let y = 8; y < size; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.25, y + 2, size * 0.5, y - 2, size * 0.75, y + 1);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 36, 0.8, 1.8, 0.16);
}

function drawQuarry(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.fillStyle = profile.detail;
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 14; i += 1) {
    const x = 3 + ((i * 19) % (size - 14));
    const y = 4 + ((i * 23) % (size - 14));
    const w = 6 + ((i * 11) % 12);
    const h = 5 + ((i * 7) % 10);
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.26;
  for (let i = 0; i < 8; i += 1) {
    const x = 6 + ((i * 21) % (size - 16));
    const y = 3 + ((i * 29) % (size - 16));
    const w = 7 + ((i * 9) % 10);
    const h = 4 + ((i * 5) % 8);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.accent, 40, 1.4, 3.2, 0.22);
}

function drawHerbGarden(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.2;
  for (let y = 8; y < size; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = profile.accent;
  ctx.globalAlpha = 0.52;
  for (let row = 0; row < Math.ceil(size / 14); row += 1) {
    const y = 8 + row * 14;
    const offset = row % 2 === 0 ? 0 : 6;
    for (let x = 4 + offset; x < size; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 36, 0.8, 1.6, 0.18);
}

function drawKitchen(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.3;
  for (let y = 0; y <= size; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  for (let x = 0; x <= size; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = profile.accent;
  ctx.globalAlpha = 0.28;
  for (let y = 2; y < size; y += 16) {
    for (let x = 2; x < size; x += 16) {
      ctx.fillRect(x, y, 12, 12);
    }
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 28, 1, 2.4, 0.2);
}

function drawSmithy(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.32;
  const rowHeight = 16;
  const brickWidth = 20;
  for (let row = 0; row < Math.ceil(size / rowHeight); row += 1) {
    const y = row * rowHeight;
    const offset = row % 2 === 0 ? 0 : brickWidth / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    for (let x = -offset; x < size + brickWidth; x += brickWidth) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, Math.min(size, y + rowHeight));
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = profile.detail;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 6; i += 1) {
    const x1 = 4 + ((i * 23) % (size - 12));
    const y1 = 3 + ((i * 31) % (size - 12));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + 10, y1 + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 + 10, y1);
    ctx.lineTo(x1, y1 + 10);
    ctx.stroke();
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.accent, 30, 1.2, 2.6, 0.18);
}

function drawClinic(ctx, profile) {
  const { width: size } = ctx.canvas;
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const armW = size * 0.18;
  const armH = size * 0.5;
  ctx.save();
  ctx.fillStyle = profile.accent;
  ctx.globalAlpha = 0.48;
  ctx.fillRect(cx - armW / 2, cy - armH / 2, armW, armH);
  ctx.fillRect(cx - armH / 2, cy - armW / 2, armH, armW);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.3;
  ctx.strokeRect(cx - armW / 2, cy - armH / 2, armW, armH);
  ctx.strokeRect(cx - armH / 2, cy - armW / 2, armH, armW);
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 40, 1, 2.2, 0.2);
}

// v0.8.4 strategic walls + GATE (Agent C). Procedural gate texture — two
// vertical plank panels with an iron band across the midline and a small
// gap (the door opening) down the centre. Mirrors the wall texture's
// pixel grid so gates and walls visually align in a row.
function drawGate(ctx, profile) {
  const { width: size } = ctx.canvas;
  // Wood base.
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  // Vertical plank lines: 4 planks per side (8 total), with a 6px gap in
  // the centre representing the door opening.
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.36;
  const half = size / 2;
  const plankWidth = (half - 4) / 4;
  for (let i = 0; i < 4; i += 1) {
    const xL = 2 + i * plankWidth;
    const xR = half + 6 + i * plankWidth;
    ctx.beginPath(); ctx.moveTo(xL, 4); ctx.lineTo(xL, size - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xR, 4); ctx.lineTo(xR, size - 4); ctx.stroke();
  }
  ctx.restore();
  // Iron banding across midline.
  ctx.save();
  ctx.fillStyle = profile.detail;
  ctx.globalAlpha = 0.74;
  ctx.fillRect(0, half - 4, size, 8);
  ctx.restore();
  // Iron rivets on banding.
  ctx.save();
  ctx.fillStyle = profile.line;
  ctx.globalAlpha = 0.6;
  for (let x = 8; x < size; x += 12) {
    ctx.beginPath();
    ctx.arc(x, half, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Centre gap shadow (the doorway).
  ctx.save();
  ctx.fillStyle = profile.line;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(half - 3, 4, 6, size - 8);
  ctx.restore();
  drawNoiseDots(ctx, size, profile.accent, 28, 0.6, 1.2, 0.18);
}

function drawBridge(ctx, profile) {
  const { width: size } = ctx.canvas;
  // Dark water base
  ctx.fillStyle = profile.base;
  ctx.fillRect(0, 0, size, size);
  // Wooden planks across the tile
  ctx.save();
  ctx.fillStyle = profile.accent;
  ctx.globalAlpha = 0.82;
  const plankH = 8;
  const gap = 3;
  for (let y = 2; y < size; y += plankH + gap) {
    ctx.fillRect(4, y, size - 8, plankH);
  }
  ctx.restore();
  // Plank grain lines
  ctx.save();
  ctx.strokeStyle = profile.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.28;
  for (let y = 2; y < size; y += plankH + gap) {
    const mid = y + plankH / 2;
    ctx.beginPath();
    ctx.moveTo(4, mid);
    ctx.lineTo(size - 4, mid);
    ctx.stroke();
  }
  ctx.restore();
  // Highlight edges
  ctx.save();
  ctx.strokeStyle = profile.detail;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.3;
  for (let y = 2; y < size; y += plankH + gap) {
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(size - 4, y);
    ctx.stroke();
  }
  ctx.restore();
  drawNoiseDots(ctx, size, profile.detail, 20, 0.6, 1.4, 0.14);
}

function drawPattern(ctx, profile) {
  switch (profile.pattern) {
    case "road":
      drawRoad(ctx, profile);
      return;
    case "farm":
      drawFarm(ctx, profile);
      return;
    case "lumber":
      drawLumber(ctx, profile);
      return;
    case "warehouse":
      drawWarehouse(ctx, profile);
      return;
    case "wall":
      drawWall(ctx, profile);
      return;
    case "ruins":
      drawRuins(ctx, profile);
      return;
    case "water":
      drawWater(ctx, profile);
      return;
    case "quarry":
      drawQuarry(ctx, profile);
      return;
    case "herb_garden":
      drawHerbGarden(ctx, profile);
      return;
    case "kitchen":
      drawKitchen(ctx, profile);
      return;
    case "smithy":
      drawSmithy(ctx, profile);
      return;
    case "clinic":
      drawClinic(ctx, profile);
      return;
    case "bridge":
      drawBridge(ctx, profile);
      return;
    case "gate":
      // v0.8.4 strategic walls + GATE (Agent C).
      drawGate(ctx, profile);
      return;
    case "grass":
    default:
      drawGrass(ctx, profile);
  }
}

export function createProceduralTileTexture(tileType) {
  const profile = PROCEDURAL_TILE_TEXTURE_PROFILES[tileType];
  if (!profile) return null;
  const canvas = createCanvas(profile.size);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawPattern(ctx, profile);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(profile.repeatX, profile.repeatY);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
