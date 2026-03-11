import test from "node:test";
import assert from "node:assert/strict";

import { PRESETS, resolvePreset } from "../scripts/soak-sim.mjs";

test("soak-sim exposes honest offline fallback presets", () => {
  assert.equal(Boolean(PRESETS["ecology-long"]), true);
  assert.equal(String(PRESETS["ai-on"]?.aiMode ?? ""), "offline-fallback");
  assert.equal(Boolean(PRESETS["ai-on"]?.aiOfflineFallback), true);
  assert.equal(String(PRESETS["ecology-long"]?.aiMode ?? ""), "offline-fallback");
});

test("resolvePreset keeps ecology-long and ai-on deterministic", () => {
  const aiOn = resolvePreset({ preset: "ai-on" });
  const ecologyLong = resolvePreset({ preset: "ecology-long" });

  assert.equal(aiOn.aiEnabled, true);
  assert.equal(aiOn.aiOfflineFallback, true);
  assert.equal(ecologyLong.durationSec, 20 * 60);
  assert.equal(ecologyLong.aiOfflineFallback, true);
});
