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

