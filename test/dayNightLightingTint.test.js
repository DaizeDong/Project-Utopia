// v0.10.1-A4 (V1) — day-night lighting tint unit tests.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round0/Plans/A4-polish-aesthetic.md
// Plan (R1 amend): assignments/homework7/Final-Polish-Loop/Round1/Plans/A4-polish-aesthetic.md
//
// Pure helpers exported from AtmosphereProfile.js so this test does not need
// a Three.js / canvas context. Verifies:
//   - the 4-stop ramp matches plan colours/intensities at canonical phases
//     (within 0.04 tolerance for intensity multipliers and ±4 hex channels
//     for the resolved tint colour — widened from R0's 0.02/±2 because the
//     R1 stops sit at deeper saturation),
//   - quantizeDayNightPhase distributes phase ∈ [0,1) across exactly 32
//     non-negative bins ≤ 31 (no overflow at phase = 1.0 - epsilon),
//   - applyDayNightModulation never mutates its input profile and clamps
//     intensities into the stated safe range (R1 floors: ambient ≥ 0.22,
//     sun ≥ 0.12, hemi ≥ 0.20 — tightened so weather × night double-multiply
//     cannot crush the scene to black).

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDayNightModulation,
  computeDayNightTint,
  DAY_NIGHT_TINT_BINS,
  getDayNightPhase,
  quantizeDayNightPhase,
} from "../src/render/AtmosphereProfile.js";

const TINT_TOLERANCE = 0.04;
const COLOR_TOLERANCE = 4;

function approxEqual(a, b, tolerance = TINT_TOLERANCE) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function colorDistance(a, b) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
}

test("computeDayNightTint matches the 4-stop ramp at canonical phases (R1 amplified)", () => {
  const dawn = computeDayNightTint(0.00);
  assert.ok(colorDistance(dawn.color, 0xffb070) <= COLOR_TOLERANCE, `dawn color=${dawn.color.toString(16)}`);
  assert.ok(approxEqual(dawn.ambientMul, 0.78), `dawn ambientMul=${dawn.ambientMul}`);
  assert.ok(approxEqual(dawn.sunMul, 0.55), `dawn sunMul=${dawn.sunMul}`);

  const day = computeDayNightTint(0.25);
  assert.ok(colorDistance(day.color, 0xffffff) <= COLOR_TOLERANCE, `day color=${day.color.toString(16)}`);
  // R1: ambient 1.20 → 1.25 (brighter midday); sun 1.00 → 1.10.
  assert.ok(approxEqual(day.ambientMul, 1.25), `day ambientMul=${day.ambientMul}`);
  assert.ok(approxEqual(day.sunMul, 1.10), `day sunMul=${day.sunMul}`);
  // Visibility claim — day must be brighter than R0 floor (1.20) was.
  assert.ok(day.ambientMul >= 1.20, `day ambient must be >= 1.20 to read as brighter than R0 day`);

  const dusk = computeDayNightTint(0.50);
  assert.ok(colorDistance(dusk.color, 0xff7a3a) <= COLOR_TOLERANCE, `dusk color=${dusk.color.toString(16)}`);
  assert.ok(approxEqual(dusk.ambientMul, 0.72), `dusk ambientMul=${dusk.ambientMul}`);
  assert.ok(approxEqual(dusk.sunMul, 0.55), `dusk sunMul=${dusk.sunMul}`);

  const night = computeDayNightTint(0.75);
  assert.ok(colorDistance(night.color, 0x1c2850) <= COLOR_TOLERANCE, `night color=${night.color.toString(16)}`);
  // R1: night 0.45 → 0.32 ambient; 0.20 → 0.08 sun. The "visibility" claim:
  // night ambient must be at most 0.40 (was ≤0.55 in R0) and sun ≤0.16 (was ≤0.30).
  assert.ok(approxEqual(night.ambientMul, 0.32), `night ambientMul=${night.ambientMul}`);
  assert.ok(approxEqual(night.sunMul, 0.08), `night sunMul=${night.sunMul}`);
  assert.ok(night.ambientMul <= 0.40, `night ambient must be <= 0.40 to read as night, not dim day`);
  assert.ok(night.sunMul <= 0.16, `night sun must be <= 0.16 to read as night, not dim day`);
});

test("computeDayNightTint smoothly interpolates between stops (R1 amplified)", () => {
  // Mid-dawn → mid-day at phase 0.125 should land halfway between 0.78 and 1.25.
  const midRise = computeDayNightTint(0.125);
  assert.ok(midRise.ambientMul > 0.78 && midRise.ambientMul < 1.25, `midRise ambientMul=${midRise.ambientMul}`);
  assert.ok(midRise.sunMul > 0.55 && midRise.sunMul < 1.10, `midRise sunMul=${midRise.sunMul}`);

  // Mid-night → mid-dawn (wrap from 0.75 toward 1.00≡0.00) at phase 0.875 should
  // sit between 0.32 (night) and 0.78 (dawn). This exercises the phase wrap.
  const midPredawn = computeDayNightTint(0.875);
  assert.ok(midPredawn.ambientMul > 0.32 && midPredawn.ambientMul < 0.78, `midPredawn ambientMul=${midPredawn.ambientMul}`);
  assert.ok(midPredawn.sunMul > 0.08 && midPredawn.sunMul < 0.55, `midPredawn sunMul=${midPredawn.sunMul}`);
});

test("computeDayNightTint normalises phase outside [0,1)", () => {
  const wrapped = computeDayNightTint(1.25); // ≡ 0.25 (day)
  const direct = computeDayNightTint(0.25);
  assert.equal(wrapped.color, direct.color);
  assert.ok(approxEqual(wrapped.ambientMul, direct.ambientMul));
  assert.ok(approxEqual(wrapped.sunMul, direct.sunMul));

  const negative = computeDayNightTint(-0.25); // ≡ 0.75 (night)
  const nightDirect = computeDayNightTint(0.75);
  assert.equal(negative.color, nightDirect.color);
});

test("quantizeDayNightPhase stays within [0, 31] for 1000 random phases", () => {
  const seenBins = new Set();
  for (let i = 0; i < 1000; i += 1) {
    const phase = Math.random();
    const bin = quantizeDayNightPhase(phase, DAY_NIGHT_TINT_BINS);
    assert.ok(Number.isInteger(bin), `bin must be integer, got ${bin}`);
    assert.ok(bin >= 0 && bin <= DAY_NIGHT_TINT_BINS - 1, `bin=${bin} out of range`);
    seenBins.add(bin);
  }
  // Statistically should hit most of the 32 bins given 1000 samples.
  assert.ok(seenBins.size > 24, `only saw ${seenBins.size} distinct bins; quantization may be skewed`);
});

test("quantizeDayNightPhase clamps phase = 1 to the top bin", () => {
  // Phase exactly 1 wraps to 0, so bin = 0; phase 0.999 should land in last bin.
  assert.equal(quantizeDayNightPhase(1.0, DAY_NIGHT_TINT_BINS), 0);
  assert.equal(quantizeDayNightPhase(0.999, DAY_NIGHT_TINT_BINS), DAY_NIGHT_TINT_BINS - 1);
  assert.equal(quantizeDayNightPhase(0.0, DAY_NIGHT_TINT_BINS), 0);
});

test("getDayNightPhase reads state.environment.dayNightPhase when present", () => {
  // Use approxEqual: ((0.42 % 1) + 1) % 1 introduces floating-point noise
  // (~1e-16) that strict equality would reject.
  assert.ok(approxEqual(getDayNightPhase({ environment: { dayNightPhase: 0.42 } }), 0.42, 1e-9));
  // Falls back to timeSec mod 90 s when environment is missing.
  const fallback = getDayNightPhase({ metrics: { timeSec: 45 } });
  assert.ok(approxEqual(fallback, 0.5, 0.001), `fallback phase=${fallback}`);
  // Empty state → phase 0.
  assert.equal(getDayNightPhase({}), 0);
});

test("applyDayNightModulation does not mutate input profile and stays in clamp range", () => {
  const base = Object.freeze({
    background: 0xc8e7ff,
    fogColor: 0xd7efe7,
    fogNear: 80,
    fogFar: 260,
    ambientColor: 0xfff2d7,
    ambientIntensity: 1.10,
    hemiSkyColor: 0xe9f7ff,
    hemiGroundColor: 0xc6d9a2,
    hemiIntensity: 0.46,
    sunColor: 0xffd497,
    sunIntensity: 1.10,
    sunPosition: { x: 54, y: 118, z: 32 },
    fillColor: 0xb1dcff,
    fillIntensity: 0.30,
    fillPosition: { x: -60, y: 74, z: -38 },
    exposure: 1.28,
  });

  // Object.freeze on the base profile means any mutation would throw in
  // strict mode. The pure helper must build a new object.
  // R1 clamp floors: ambient ≥ 0.22, sun ≥ 0.12, hemi ≥ 0.20.
  for (const phase of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    const tinted = applyDayNightModulation(base, phase);
    assert.notEqual(tinted, base, `phase=${phase} returned same reference`);
    assert.ok(tinted.ambientIntensity >= 0.22 && tinted.ambientIntensity <= 1.6,
      `phase=${phase} ambientIntensity=${tinted.ambientIntensity}`);
    assert.ok(tinted.sunIntensity >= 0.12 && tinted.sunIntensity <= 1.5,
      `phase=${phase} sunIntensity=${tinted.sunIntensity}`);
    assert.ok(tinted.hemiIntensity >= 0.20 && tinted.hemiIntensity <= 0.78,
      `phase=${phase} hemiIntensity=${tinted.hemiIntensity}`);
    // dayNightPhase should round-trip into the result for SceneRenderer cache.
    assert.ok(approxEqual(tinted.dayNightPhase, ((phase % 1) + 1) % 1, 1e-6),
      `phase=${phase} dayNightPhase=${tinted.dayNightPhase}`);
  }
});

test("applyDayNightModulation R1 clamp floors hold under stormy-night double-multiply", () => {
  // Simulates weather × night chained multiplication: a low-light base
  // (storm-style) modulated at night phase must still respect R1 clamp floors
  // (ambient ≥ 0.22, sun ≥ 0.12, hemi ≥ 0.20) so the scene never crushes to
  // black even when both signals stack.
  const storm = {
    ambientColor: 0xa6b8c5,
    ambientIntensity: 0.42,
    hemiSkyColor: 0x6e7e90,
    hemiGroundColor: 0x303a40,
    hemiIntensity: 0.28,
    sunColor: 0x6f8294,
    sunIntensity: 0.34,
    fillColor: 0x6e7d8a,
    fillIntensity: 0.28,
  };
  const stormNight = applyDayNightModulation(storm, 0.75);
  assert.ok(stormNight.ambientIntensity >= 0.22,
    `storm × night ambient=${stormNight.ambientIntensity} should respect R1 floor`);
  assert.ok(stormNight.sunIntensity >= 0.12,
    `storm × night sun=${stormNight.sunIntensity} should respect R1 floor`);
  assert.ok(stormNight.hemiIntensity >= 0.20,
    `storm × night hemi=${stormNight.hemiIntensity} should respect R1 floor`);
});

test("applyDayNightModulation is darker at night than at noon (sunIntensity)", () => {
  const base = {
    ambientColor: 0xffffff,
    ambientIntensity: 1.0,
    hemiSkyColor: 0xffffff,
    hemiGroundColor: 0xffffff,
    hemiIntensity: 0.5,
    sunColor: 0xffffff,
    sunIntensity: 1.0,
    fillColor: 0xffffff,
    fillIntensity: 0.3,
  };
  const noon = applyDayNightModulation(base, 0.25);
  const night = applyDayNightModulation(base, 0.75);
  assert.ok(noon.sunIntensity > night.sunIntensity,
    `noon sun=${noon.sunIntensity} should exceed night sun=${night.sunIntensity}`);
  assert.ok(noon.ambientIntensity > night.ambientIntensity,
    `noon ambient=${noon.ambientIntensity} should exceed night ambient=${night.ambientIntensity}`);
});
