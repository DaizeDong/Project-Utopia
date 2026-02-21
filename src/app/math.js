export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function normalize2D(v) {
  const len = Math.hypot(v.x, v.z);
  if (len < 1e-8) return { x: 0, z: 0 };
  return { x: v.x / len, z: v.z / len };
}

export function add2D(a, b) {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function sub2D(a, b) {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale2D(v, s) {
  return { x: v.x * s, z: v.z * s };
}
