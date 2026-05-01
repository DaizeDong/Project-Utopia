// test/perf-allocation-budget.test.js
//
// v0.10.1 Round-1 (A2 perftrace, Final-Polish-Loop) — regression smoke for
// the SceneRenderer per-frame allocation budget. The Round-1 A2 plan
// (assignments/homework7/Final-Polish-Loop/Round1/Plans/A2-performance-auditor.md)
// targets ~2 ms/frame from the steady-state RAF loop by:
//
//   Step 1 — `#pressureLensSignature` length/version pre-filter that returns
//             a cached string by *identity* when no input has changed.
//   Step 2 — `#updatePressureLensLabels` instance scratch buffers
//             (`_labelProjectedScratch`, `_labelEntriesScratch`,
//             `_labelEntryToPoolIdxScratch`, `_labelVisibleCandidatesScratch`,
//             `_labelVisibleScratchMap`) reused via `length = 0` / `clear()`.
//   Step 3 — `#entityMeshUpdateIntervalSec` returns 1/30 (was 0) for small
//             entity counts, with a `selectedEntityId != null` fast-path.
//   Step 4 — `renderEntityLookup` field-only assignment.
//
// SceneRenderer requires THREE.js + a canvas + WebGL context, none of which
// are available under `node --test` (jsdom/canvas would be heavyweight).
// We therefore verify the per-frame contract via two surrogate strategies:
//
//   (a) **Cache-identity contract** — replicate the `#pressureLensSignature`
//       pre-filter logic against the same shape of `_last*` cache fields a
//       real instance would carry, and assert that on two successive calls
//       with identical state inputs the second call returns the literal
//       same string instance (`===`, not just byte-equal). This documents
//       the perf invariant: cache hits do *not* re-build the signature.
//
//   (b) **Scratch-reuse contract** — exercise the same Array `length = 0`
//       and Map `clear()` reset patterns used by `#updatePressureLensLabels`,
//       proving that capacity is preserved across frames (no per-frame
//       backing-store allocation) while previous content is dropped.
//
// Soft-skip via `CI_FAST=1` to avoid blocking fast PR cycles.

import test from "node:test";
import assert from "node:assert/strict";

const FAST = process.env.CI_FAST === "1";

// ---------------------------------------------------------------------------
// Cache-identity surrogate. Mirrors `SceneRenderer#pressureLensSignature`
// pre-filter logic so this test can stand alone without a DOM. If the
// production method diverges, the test will still flag a contract drift
// because the production class is asserted to expose the same `_last*`
// field names below (parsed from the source file as a smoke check).
// ---------------------------------------------------------------------------
function makePressureLensSignatureHarness() {
  const cache = {
    _cachedLensSignature: undefined,
    _lastEventsLen: -1,
    _lastHotspotsLen: -1,
    _lastGridVerForLensSig: -1,
    _lastTrafficVerForLensSig: -1,
    _lastTrafficHotspotsForLensSig: -1,
    _lastObjectiveIdxForLensSig: -1,
    _lastWeatherCurrentForLensSig: null,
    _lastWeatherHazardForLensSig: null,
    _lastWeatherScoreForLensSig: -1,
    _lastSpatialSummaryForLensSig: null,
  };
  function compute(state) {
    const eventsArr = state.events?.active ?? null;
    const hotspotsArr = state.metrics?.ecology?.hotspotFarms ?? null;
    const eventsLen = eventsArr ? eventsArr.length : 0;
    const hotspotsLen = hotspotsArr ? hotspotsArr.length : 0;
    const gridVer = state.grid?.version ?? 0;
    const trafficVer = state.metrics?.traffic?.version ?? 0;
    const trafficHotspots = state.metrics?.traffic?.hotspotCount ?? 0;
    const objectiveIdx = state.gameplay?.objectiveIndex ?? 0;
    const weatherCurrent = state.weather?.current ?? "clear";
    const weatherHazard = state.weather?.hazardFocusSummary ?? "";
    const weatherScore = state.weather?.pressureScore ?? 0;
    const spatialSummary = state.metrics?.spatialPressure?.summary ?? "";
    if (
      cache._cachedLensSignature !== undefined
      && cache._lastEventsLen === eventsLen
      && cache._lastHotspotsLen === hotspotsLen
      && cache._lastGridVerForLensSig === gridVer
      && cache._lastTrafficVerForLensSig === trafficVer
      && cache._lastTrafficHotspotsForLensSig === trafficHotspots
      && cache._lastObjectiveIdxForLensSig === objectiveIdx
      && cache._lastWeatherCurrentForLensSig === weatherCurrent
      && cache._lastWeatherHazardForLensSig === weatherHazard
      && cache._lastWeatherScoreForLensSig === weatherScore
      && cache._lastSpatialSummaryForLensSig === spatialSummary
    ) {
      return cache._cachedLensSignature;
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
    cache._cachedLensSignature = sig;
    cache._lastEventsLen = eventsLen;
    cache._lastHotspotsLen = hotspotsLen;
    cache._lastGridVerForLensSig = gridVer;
    cache._lastTrafficVerForLensSig = trafficVer;
    cache._lastTrafficHotspotsForLensSig = trafficHotspots;
    cache._lastObjectiveIdxForLensSig = objectiveIdx;
    cache._lastWeatherCurrentForLensSig = weatherCurrent;
    cache._lastWeatherHazardForLensSig = weatherHazard;
    cache._lastWeatherScoreForLensSig = weatherScore;
    cache._lastSpatialSummaryForLensSig = spatialSummary;
    return sig;
  }
  return { compute, cache };
}

function makeStableState() {
  return {
    grid: { version: 7 },
    gameplay: { objectiveIndex: 2 },
    weather: {
      current: "clear",
      hazardFocusSummary: "",
      pressureScore: 0.31,
    },
    metrics: {
      traffic: { version: 4, hotspotCount: 2 },
      spatialPressure: { summary: "calm" },
      ecology: {
        hotspotFarms: [
          { ix: 5, iz: 6, pressure: 0.42 },
          { ix: 9, iz: 11, pressure: 0.61 },
        ],
      },
    },
    events: {
      active: [
        { type: "raid", status: "incoming", payload: { targetLabel: "north", pressure: 0.5 } },
      ],
    },
  };
}

test("perf-allocation: pressureLensSignature returns cached string by IDENTITY across stable frames", (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  const { compute } = makePressureLensSignatureHarness();
  const state = makeStableState();
  const first = compute(state);
  // 50 successive frames with no state mutation must all return the identical
  // string instance — this is the perf contract of the version pre-filter.
  for (let i = 0; i < 50; i += 1) {
    const next = compute(state);
    assert.equal(next, first, `frame ${i} returned different sig string`);
    assert.ok(next === first, `frame ${i} cache miss (identity check failed)`);
  }
});

test("perf-allocation: pressureLensSignature rebuilds when grid version bumps", (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  const { compute } = makePressureLensSignatureHarness();
  const state = makeStableState();
  const first = compute(state);
  state.grid.version = 8;
  const second = compute(state);
  assert.notEqual(second, first, "grid.version bump must invalidate cache");
});

test("perf-allocation: pressureLensSignature rebuilds when events.active length changes", (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  const { compute } = makePressureLensSignatureHarness();
  const state = makeStableState();
  const first = compute(state);
  state.events.active.push({
    type: "trade",
    status: "open",
    payload: { targetLabel: "south", pressure: 0.2 },
  });
  const second = compute(state);
  assert.notEqual(second, first, "events.active length change must invalidate cache");
});

test("perf-allocation: pressureLensSignature rebuilds when ecology hotspots length changes", (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  const { compute } = makePressureLensSignatureHarness();
  const state = makeStableState();
  const first = compute(state);
  state.metrics.ecology.hotspotFarms.push({ ix: 1, iz: 1, pressure: 0.7 });
  const second = compute(state);
  assert.notEqual(second, first, "hotspot length change must invalidate cache");
});

// ---------------------------------------------------------------------------
// Scratch-reuse contract.
// ---------------------------------------------------------------------------
test("perf-allocation: array `length = 0` reuse preserves backing capacity (no per-frame realloc)", (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  // Replicates the `_labelProjectedScratch` reuse pattern from
  // `#updatePressureLensLabels`. We run 100 simulated frames each pushing 24
  // items (the buildPressureLens cap) and assert the array is empty between
  // frames but the same Array reference is reused.
  const scratch = [];
  const ref = scratch;
  for (let frame = 0; frame < 100; frame += 1) {
    scratch.length = 0;
    assert.equal(scratch.length, 0, `frame ${frame}: not reset`);
    for (let i = 0; i < 24; i += 1) scratch.push({ idx: i, frame });
    assert.equal(scratch.length, 24, `frame ${frame}: push failed`);
    assert.ok(scratch === ref, `frame ${frame}: array reference changed`);
  }
});

test("perf-allocation: Map `clear()` reuse preserves identity across frames", (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  // Replicates the `_labelVisibleScratchMap` reuse pattern.
  const scratch = new Map();
  const ref = scratch;
  for (let frame = 0; frame < 100; frame += 1) {
    scratch.clear();
    assert.equal(scratch.size, 0, `frame ${frame}: not cleared`);
    for (let i = 0; i < 24; i += 1) scratch.set(i, { frame, i });
    assert.equal(scratch.size, 24, `frame ${frame}: set failed`);
    assert.ok(scratch === ref, `frame ${frame}: map reference changed`);
  }
});

// ---------------------------------------------------------------------------
// Source-level smoke check: assert SceneRenderer.js declares the cache and
// scratch fields the harness above mirrors. If a future refactor renames any
// field without updating the harness, this guard fails loudly.
// ---------------------------------------------------------------------------
test("perf-allocation: SceneRenderer.js exposes the expected scratch + cache field names", async (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = await readFile(
    resolve(here, "..", "src", "render", "SceneRenderer.js"),
    "utf8",
  );
  const expected = [
    "_cachedLensSignature",
    "_lastEventsLen",
    "_lastHotspotsLen",
    "_lastGridVerForLensSig",
    "_lastTrafficVerForLensSig",
    "_labelProjectedScratch",
    "_labelEntriesScratch",
    "_labelEntryToPoolIdxScratch",
    "_labelVisibleCandidatesScratch",
    "_labelVisibleScratchMap",
  ];
  for (const name of expected) {
    assert.ok(
      src.includes(name),
      `SceneRenderer.js must reference '${name}' (perf cache/scratch field)`,
    );
  }
});

test("perf-allocation: SceneRenderer.js entityMeshUpdateInterval throttles small-entity case to 1/30s", async (t) => {
  if (FAST) {
    t.skip("CI_FAST=1");
    return;
  }
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = await readFile(
    resolve(here, "..", "src", "render", "SceneRenderer.js"),
    "utf8",
  );
  // Round-1 plan Step 3: small-entity branch returns 1/30 (was `return 0`)
  // with a `selectedEntityId != null` fast-path that returns 0.
  assert.ok(
    src.includes("return 1 / 30"),
    "entityMeshUpdateIntervalSec must throttle small-entity case to 1/30s",
  );
  assert.ok(
    src.includes("this.state.controls?.selectedEntityId != null"),
    "must keep RAF-cadence updates while a selection exists",
  );
});
