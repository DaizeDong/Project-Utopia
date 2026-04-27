import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE } from "../src/config/constants.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { BALANCE } from "../src/config/balance.js";

// ---------------------------------------------------------------------------
// Case 1 — WorldEventSystem enforces `raidEscalation.intervalTicks` as the
// raid cooldown: two raids queued within intervalTicks cannot both spawn.
// ---------------------------------------------------------------------------
test("WorldEventSystem: raidEscalation.intervalTicks gates successive raids", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new WorldEventSystem();

  // First raid — lastRaidTick starts at -9999 so tick 0 is well past cooldown.
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  system.update(1.0, state);
  const firstActive = state.events.active.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(firstActive.length, 1, "first raid must spawn");
  assert.equal(state.gameplay.lastRaidTick, 0, "lastRaidTick should be set to current tick");

  // Second raid queued "immediately" (still tick 0) within the cooldown window.
  // Expectation: WorldEventSystem drops the raid from the queue.
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  system.update(1.0, state);
  const activeRaidsNow = state.events.active.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  // The original raid may still be active, but no NEW raid should have
  // joined the active list (both would have status 'active'; spawning a new
  // one would add a second entry). The queue must be empty (drained).
  assert.equal(state.events.queue.length, 0, "queue must drain each tick");
  assert.equal(activeRaidsNow.length, 1,
    "second raid should be dropped while cooldown is active");

  // Advance past the cooldown: push metrics.tick forward.
  state.metrics.tick = Number(state.gameplay.raidEscalation.intervalTicks) + 5;
  // Resolve the first raid so it doesn't masquerade as a second spawn.
  state.events.active = state.events.active.filter((e) => e.type !== EVENT_TYPE.BANDIT_RAID);

  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  system.update(1.0, state);
  const afterCooldown = state.events.active.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(afterCooldown.length, 1, "raid spawns again after cooldown elapses");
});

// ---------------------------------------------------------------------------
// Case 2 — intensityMultiplier = 2 doubles the raid's effective intensity.
// Baseline raid queued with intensity=1 should emerge with intensity=2.
// ---------------------------------------------------------------------------
test("WorldEventSystem: intensityMultiplier=2 doubles raid intensity payload", () => {
  const baseline = createInitialGameState({ seed: 4242 });
  const scaled = createInitialGameState({ seed: 4242 });
  // Baseline: tier 0, 1× intensity (default).
  const baselineSystem = new WorldEventSystem();
  // Scaled: force a 2× escalation bundle BEFORE enqueueing the raid.
  scaled.gameplay.raidEscalation = {
    tier: 5,
    intervalTicks: Number(BALANCE.raidIntervalBaseTicks ?? 3600),
    intensityMultiplier: 2,
    devIndexSample: 75,
  };
  const scaledSystem = new WorldEventSystem();

  enqueueEvent(baseline, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  baselineSystem.update(1.0, baseline);

  enqueueEvent(scaled, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  scaledSystem.update(1.0, scaled);

  const baseRaid = baseline.events.active.find((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  const scaledRaid = scaled.events.active.find((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.ok(baseRaid, "baseline raid should spawn");
  assert.ok(scaledRaid, "scaled raid should spawn");

  // The spawn payload records the multiplier AND the event.intensity is
  // scaled — this is the "raider count / damage is doubled" contract.
  assert.equal(scaledRaid.payload.raidIntensityMultiplier, 2);
  assert.ok(Math.abs(scaledRaid.intensity / baseRaid.intensity - 2) < 1e-9,
    `expected scaled intensity to be 2× baseline, got ${scaledRaid.intensity} vs ${baseRaid.intensity}`);
  assert.equal(scaledRaid.payload.raidTier, 5);
});

// ---------------------------------------------------------------------------
// Case 3 — the deprecated RAID_TIER_CAP=6 constant no longer exists anywhere
// under src/. Recursively scans every .js file and fails on any match.
// ---------------------------------------------------------------------------
test("deprecated RAID_TIER_CAP is absent from src/", () => {
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  const offenders = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else if (s.isFile() && full.endsWith(".js")) {
        const text = readFileSync(full, "utf8");
        if (text.includes("RAID_TIER_CAP")) offenders.push(full);
      }
    }
  }
  walk(srcRoot);

  assert.deepEqual(offenders, [],
    `RAID_TIER_CAP must not appear under src/; offenders: ${offenders.join(", ")}`);
});
