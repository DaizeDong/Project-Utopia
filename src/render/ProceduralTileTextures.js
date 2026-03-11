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
