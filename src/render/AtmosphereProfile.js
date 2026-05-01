import { WEATHER } from "../config/constants.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mixHex(a, b, t) {
  const safeT = clamp(Number(t) || 0, 0, 1);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (mixChannel(ar, br, safeT) << 16)
    | (mixChannel(ag, bg, safeT) << 8)
    | mixChannel(ab, bb, safeT);
}

function scaleNumber(value, multiplier, min = 0) {
  return Math.max(min, Number(value ?? 0) * Number(multiplier ?? 1));
}

const SCENARIO_BASES = Object.freeze({
  frontier_repair: Object.freeze({
    background: 0xc8e7ff,
    fogColor: 0xd7efe7,
    fogNear: 84,
    fogFar: 268,
    ambientColor: 0xfff2d7,
    ambientIntensity: 1.1,
    hemiSkyColor: 0xe9f7ff,
    hemiGroundColor: 0xc6d9a2,
    hemiIntensity: 0.46,
    sunColor: 0xffd497,
    sunIntensity: 1.1,
    sunPosition: Object.freeze({ x: 54, y: 118, z: 32 }),
    fillColor: 0xb1dcff,
    fillIntensity: 0.3,
    fillPosition: Object.freeze({ x: -60, y: 74, z: -38 }),
    exposure: 1.28,
  }),
  gate_chokepoints: Object.freeze({
    background: 0xd0d8e2,
    fogColor: 0xdce4e8,
    fogNear: 78,
    fogFar: 236,
    ambientColor: 0xf2ece3,
    ambientIntensity: 1.02,
    hemiSkyColor: 0xe4edf7,
    hemiGroundColor: 0xb8b39e,
    hemiIntensity: 0.42,
    sunColor: 0xffe0b8,
    sunIntensity: 1.03,
    sunPosition: Object.freeze({ x: 50, y: 130, z: 20 }),
    fillColor: 0xc3d8ec,
    fillIntensity: 0.27,
    fillPosition: Object.freeze({ x: -52, y: 82, z: -34 }),
    exposure: 1.18,
  }),
  island_relay: Object.freeze({
    background: 0xbde5ff,
    fogColor: 0xcfeff4,
    fogNear: 90,
    fogFar: 286,
    ambientColor: 0xfbf4de,
    ambientIntensity: 1.12,
    hemiSkyColor: 0xe2f6ff,
    hemiGroundColor: 0xb7d5b8,
    hemiIntensity: 0.48,
    sunColor: 0xffdb9f,
    sunIntensity: 1.12,
    sunPosition: Object.freeze({ x: 62, y: 112, z: 28 }),
    fillColor: 0x9fdcff,
    fillIntensity: 0.32,
    fillPosition: Object.freeze({ x: -66, y: 70, z: -44 }),
    exposure: 1.3,
  }),
});

const WEATHER_OVERRIDES = Object.freeze({
  [WEATHER.CLEAR]: Object.freeze({
    background: 0xffffff,
    fogColor: 0xffffff,
    ambientColor: 0xffffff,
    hemiSkyColor: 0xffffff,
    hemiGroundColor: 0xffffff,
    sunColor: 0xffffff,
    fillColor: 0xffffff,
    mix: 0,
    ambientMul: 1,
    hemiMul: 1,
    sunMul: 1,
    fillMul: 1,
    fogNearMul: 1,
    fogFarMul: 1,
    exposureDelta: 0,
  }),
  [WEATHER.RAIN]: Object.freeze({
    background: 0x98aebe,
    fogColor: 0xb2c5d0,
    ambientColor: 0xd7e1e7,
    hemiSkyColor: 0xcddce6,
    hemiGroundColor: 0xaab89d,
    sunColor: 0xc8d6e2,
    fillColor: 0xc5deee,
    mix: 0.5,
    ambientMul: 0.95,
    hemiMul: 0.96,
    sunMul: 0.74,
    fillMul: 1.08,
    fogNearMul: 0.9,
    fogFarMul: 0.9,
    exposureDelta: -0.14,
  }),
  [WEATHER.STORM]: Object.freeze({
    background: 0x677789,
    fogColor: 0x8799aa,
    ambientColor: 0xc8d3dd,
    hemiSkyColor: 0xaec0cf,
    hemiGroundColor: 0x93a18f,
    sunColor: 0xc5d1db,
    fillColor: 0xc3d7e6,
    mix: 0.7,
    ambientMul: 0.9,
    hemiMul: 0.92,
    sunMul: 0.58,
    fillMul: 1.12,
    fogNearMul: 0.82,
    fogFarMul: 0.8,
    exposureDelta: -0.22,
  }),
  [WEATHER.DROUGHT]: Object.freeze({
    background: 0xe9c98c,
    fogColor: 0xe8cf9e,
    ambientColor: 0xffe6b4,
    hemiSkyColor: 0xf5ddae,
    hemiGroundColor: 0xc7b07d,
    sunColor: 0xffcf82,
    fillColor: 0xe5c191,
    mix: 0.46,
    ambientMul: 1.03,
    hemiMul: 1.02,
    sunMul: 1.08,
    fillMul: 0.96,
    fogNearMul: 0.94,
    fogFarMul: 0.9,
    exposureDelta: 0.04,
  }),
  [WEATHER.WINTER]: Object.freeze({
    background: 0xdce8f7,
    fogColor: 0xe7f1fb,
    ambientColor: 0xf4f8ff,
    hemiSkyColor: 0xe9f4ff,
    hemiGroundColor: 0xcbd7e2,
    sunColor: 0xf7fbff,
    fillColor: 0xcfdef0,
    mix: 0.48,
    ambientMul: 1,
    hemiMul: 1.02,
    sunMul: 0.82,
    fillMul: 1.04,
    fogNearMul: 0.92,
    fogFarMul: 0.88,
    exposureDelta: -0.08,
  }),
});

function derivePressureScalar(state) {
  const spatial = state.metrics?.spatialPressure ?? {};
  const ecology = state.metrics?.ecology ?? {};
  const traffic = state.metrics?.traffic ?? {};
  const weatherPressure = Number(spatial.weatherPressure ?? state.weather?.pressureScore ?? 0) * 0.65;
  const eventPressure = Number(spatial.eventPressure ?? 0) * 0.24;
  const ecologyPressure = Number(ecology.maxFarmPressure ?? 0) * 0.18;
  const trafficPressure = Math.max(0, Number(traffic.peakPenalty ?? 1) - 1) * 0.82;
  return clamp(Math.max(weatherPressure, eventPressure, ecologyPressure, trafficPressure), 0, 1.35);
}

function applySessionOutcome(profile, state) {
  const phase = String(state.session?.phase ?? "active");
  const outcome = String(state.session?.outcome ?? "none");
  if (phase === "menu") {
    return {
      ...profile,
      background: mixHex(profile.background, 0xf4f0de, 0.08),
      fogColor: mixHex(profile.fogColor, 0xf2f4ea, 0.06),
      exposure: profile.exposure + 0.04,
    };
  }
  if (phase !== "end") return profile;
  // v0.8.0 Phase 4 — "win" outcome retired; only darken the ending for loss.
  if (outcome !== "loss") return profile;
  return {
    ...profile,
    background: mixHex(profile.background, 0x243246, 0.26),
    fogColor: mixHex(profile.fogColor, 0x435163, 0.24),
    ambientIntensity: profile.ambientIntensity * 0.92,
    sunIntensity: profile.sunIntensity * 0.84,
    fillIntensity: profile.fillIntensity * 0.94,
    exposure: profile.exposure - 0.08,
  };
}

// v0.10.1-A4 (V1) — Day-night tint ramp keyed off the existing
// SimulationClock cycle (BALANCE.dayCycleSeconds=90 → state.environment.
// dayNightPhase ∈ [0, 1)). Pure parameter modulation that mutates the
// ambient + directional light colour & intensity already present in the
// scene; no new mesh, no shadow rig, no asset import.
//
// Phase ramp (4 stops, smooth-blended via mixHex over 0.25-wide quadrants):
//   0.00  dawn   #ffd9a8
//   0.25  day    #ffffff
//   0.50  dusk   #ffb574
//   0.75  night  #3a4a78
//
// Intensity ramps:
//   ambientIntensityMul: 0.85 (dawn) → 1.20 (day) → 0.85 (dusk) → 0.45 (night)
//   sunIntensityMul:     0.70 (dawn) → 1.00 (day) → 0.70 (dusk) → 0.20 (night)
//
// SceneRenderer quantizes the phase to 32 bins (DAY_NIGHT_TINT_BINS) so the
// modulation only re-blends when the bin changes — at the default cycle of
// 90 s this is one update every ~2.8 s, well below per-frame work cost.
const DAY_NIGHT_STOPS = Object.freeze([
  Object.freeze({ phase: 0.00, color: 0xffd9a8, ambient: 0.85, sun: 0.70 }), // dawn
  Object.freeze({ phase: 0.25, color: 0xffffff, ambient: 1.20, sun: 1.00 }), // day
  Object.freeze({ phase: 0.50, color: 0xffb574, ambient: 0.85, sun: 0.70 }), // dusk
  Object.freeze({ phase: 0.75, color: 0x3a4a78, ambient: 0.45, sun: 0.20 }), // night
]);
export const DAY_NIGHT_TINT_BINS = 32;

export function getDayNightPhase(state) {
  // Prefer the SimulationClock-emitted phase; if missing (test rig that runs
  // SceneRenderer without ticking the clock), fall back to wall-clock-second
  // modulo 90 s (matches DAY_CYCLE_PERIOD_SEC in SimulationClock.js).
  const fromState = Number(state?.environment?.dayNightPhase);
  if (Number.isFinite(fromState)) {
    return ((fromState % 1) + 1) % 1;
  }
  const elapsed = Number(state?.metrics?.timeSec ?? 0);
  const period = 90;
  return ((elapsed % period) / period + 1) % 1;
}

export function computeDayNightTint(phase) {
  const p = ((Number(phase) % 1) + 1) % 1;
  // Find the stop bracket; phases are at 0.00, 0.25, 0.50, 0.75. Stop K covers
  // [stops[K].phase, stops[(K+1) % 4].phase) wrapping at 1.0.
  let from = DAY_NIGHT_STOPS[0];
  let to = DAY_NIGHT_STOPS[1];
  for (let i = 0; i < DAY_NIGHT_STOPS.length; i += 1) {
    const a = DAY_NIGHT_STOPS[i];
    const b = DAY_NIGHT_STOPS[(i + 1) % DAY_NIGHT_STOPS.length];
    const aPhase = a.phase;
    const bPhase = b.phase <= aPhase ? b.phase + 1 : b.phase;
    const probe = p < aPhase ? p + 1 : p;
    if (probe >= aPhase && probe < bPhase) {
      from = a;
      to = b;
      break;
    }
  }
  const fromPhase = from.phase;
  const toPhase = to.phase <= fromPhase ? to.phase + 1 : to.phase;
  const probe = p < fromPhase ? p + 1 : p;
  const span = Math.max(1e-6, toPhase - fromPhase);
  const t = clamp((probe - fromPhase) / span, 0, 1);
  return {
    color: mixHex(from.color, to.color, t),
    ambientMul: from.ambient + (to.ambient - from.ambient) * t,
    sunMul: from.sun + (to.sun - from.sun) * t,
  };
}

export function quantizeDayNightPhase(phase, bins = DAY_NIGHT_TINT_BINS) {
  const p = ((Number(phase) % 1) + 1) % 1;
  const b = Math.max(2, Math.floor(Number(bins) || DAY_NIGHT_TINT_BINS));
  return Math.min(b - 1, Math.floor(p * b));
}

/**
 * Modulate an existing atmosphere profile by the day-night tint. Returns a
 * new profile object with `ambientColor`/`sunColor`/`hemiSkyColor` blended
 * toward the phase tint and `ambientIntensity`/`sunIntensity`/`hemiIntensity`
 * scaled by the ramp multipliers. The base profile is left untouched (no
 * mutation) so AtmosphereProfile.test.js's pure-function contract still holds.
 *
 * The tint is mixed at 35 % strength against the scenario/weather-derived
 * base colour: at noon (phase 0.25) the multiplier is white at full strength
 * → near-zero net change; at night (phase 0.75) the multiplier is deep blue
 * → noticeable cool tint without crushing the scenario family identity.
 */
export function applyDayNightModulation(profile, phase) {
  const tint = computeDayNightTint(phase);
  const colorBlend = 0.35;
  return {
    ...profile,
    ambientColor: mixHex(profile.ambientColor, tint.color, colorBlend),
    sunColor: mixHex(profile.sunColor, tint.color, colorBlend),
    hemiSkyColor: mixHex(profile.hemiSkyColor, tint.color, colorBlend * 0.6),
    ambientIntensity: clamp(profile.ambientIntensity * tint.ambientMul, 0.18, 1.6),
    sunIntensity: clamp(profile.sunIntensity * tint.sunMul, 0.08, 1.5),
    hemiIntensity: clamp(profile.hemiIntensity * (0.6 + tint.ambientMul * 0.4), 0.16, 0.78),
    dayNightPhase: ((Number(phase) % 1) + 1) % 1,
    dayNightTintColor: tint.color,
  };
}

export function deriveAtmosphereProfile(state) {
  const family = String(state.gameplay?.scenario?.family ?? "frontier_repair");
  const base = SCENARIO_BASES[family] ?? SCENARIO_BASES.frontier_repair;
  const weatherKey = String(state.weather?.current ?? WEATHER.CLEAR);
  const weather = WEATHER_OVERRIDES[weatherKey] ?? WEATHER_OVERRIDES[WEATHER.CLEAR];
  const pressure = derivePressureScalar(state);

  const background = mixHex(base.background, weather.background, weather.mix);
  const fogColor = mixHex(base.fogColor, weather.fogColor, weather.mix);
  const ambientColor = mixHex(base.ambientColor, weather.ambientColor, weather.mix * 0.92);
  const hemiSkyColor = mixHex(base.hemiSkyColor, weather.hemiSkyColor, weather.mix);
  const hemiGroundColor = mixHex(base.hemiGroundColor, weather.hemiGroundColor, weather.mix * 0.78);
  const sunColor = mixHex(base.sunColor, weather.sunColor, weather.mix * 0.88);
  const fillColor = mixHex(base.fillColor, weather.fillColor, weather.mix * 0.82);

  const markerStrength = clamp(0.36 + pressure * 0.5 + (state.session?.phase === "menu" ? 0.08 : 0), 0.32, 0.96);
  const profile = applySessionOutcome({
    background: mixHex(background, 0x13202b, pressure * 0.04),
    fogColor: mixHex(fogColor, 0x33424d, pressure * 0.035),
    fogNear: clamp(scaleNumber(base.fogNear, weather.fogNearMul) - pressure * 8, 52, 160),
    fogFar: clamp(scaleNumber(base.fogFar, weather.fogFarMul) - pressure * 16, 150, 320),
    ambientColor,
    ambientIntensity: clamp(scaleNumber(base.ambientIntensity, weather.ambientMul) + pressure * 0.03, 0.65, 1.5),
    hemiSkyColor,
    hemiGroundColor,
    hemiIntensity: clamp(scaleNumber(base.hemiIntensity, weather.hemiMul) + pressure * 0.025, 0.22, 0.7),
    sunColor,
    sunIntensity: clamp(scaleNumber(base.sunIntensity, weather.sunMul) + pressure * 0.02, 0.48, 1.4),
    sunPosition: base.sunPosition,
    fillColor,
    fillIntensity: clamp(scaleNumber(base.fillIntensity, weather.fillMul) + pressure * 0.025, 0.12, 0.6),
    fillPosition: base.fillPosition,
    exposure: clamp(base.exposure + Number(weather.exposureDelta ?? 0) - pressure * 0.015, 0.84, 1.42),
    markerStrength,
  }, state);

  return {
    ...profile,
    family,
    weather: weatherKey,
    pressure,
  };
}

