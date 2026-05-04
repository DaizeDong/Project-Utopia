// R13 sanity Plan-R13-sanity-toast-dedup — pushToastWithCooldown contract.
//
// Pins the cooldown helper that gates the R13 BANDIT_RAID warning,
// configureLongRunMode/startRun deprecation, and (future) fog scout toasts
// against spam. Single dedup-key contract + LRU cap.

import { test } from "node:test";
import assert from "node:assert";

import { pushToastWithCooldown, clearWarnings } from "../src/app/warnings.js";

function makeState(timeSec = 0) {
  return {
    metrics: { timeSec, warnings: [], warningLog: [] },
  };
}

test("pushToastWithCooldown: same dedupKey within cooldown is suppressed", () => {
  const state = makeState(0);
  pushToastWithCooldown(state, "raid incoming", "warning", { dedupKey: "raid", cooldownSec: 60 });
  state.metrics.timeSec = 30; // half the cooldown
  pushToastWithCooldown(state, "raid incoming", "warning", { dedupKey: "raid", cooldownSec: 60 });
  assert.equal(state.metrics.warnings.length, 1);
});

test("pushToastWithCooldown: same dedupKey after cooldown emits second warning", () => {
  const state = makeState(0);
  pushToastWithCooldown(state, "raid incoming", "warning", { dedupKey: "raid", cooldownSec: 60 });
  state.metrics.timeSec = 90; // past cooldown
  pushToastWithCooldown(state, "raid incoming", "warning", { dedupKey: "raid", cooldownSec: 60 });
  assert.equal(state.metrics.warnings.length, 2);
});

test("pushToastWithCooldown: different dedupKeys do not interfere", () => {
  const state = makeState(0);
  pushToastWithCooldown(state, "raid", "warning", { dedupKey: "raid-1", cooldownSec: 60 });
  pushToastWithCooldown(state, "fire", "warning", { dedupKey: "fire-1", cooldownSec: 60 });
  pushToastWithCooldown(state, "vermin", "warning", { dedupKey: "vermin-1", cooldownSec: 60 });
  assert.equal(state.metrics.warnings.length, 3);
});

test("pushToastWithCooldown: missing dedupKey behaves like plain pushWarning", () => {
  const state = makeState(0);
  pushToastWithCooldown(state, "first", "warn", { source: "test" });
  pushToastWithCooldown(state, "second", "warn", { source: "test" });
  pushToastWithCooldown(state, "third", "warn", { source: "test" });
  // All three pass through (no cooldown without dedupKey).
  assert.equal(state.metrics.warnings.length, 3);
});

test("pushToastWithCooldown: clearWarnings does not reset cooldown timestamps", () => {
  // By design — cooldowns survive a clear so a previously-spammed warning
  // doesn't re-flood after the user clears the warning list.
  const state = makeState(0);
  pushToastWithCooldown(state, "raid", "warning", { dedupKey: "raid", cooldownSec: 60 });
  clearWarnings(state);
  assert.equal(state.metrics.warnings.length, 0);
  state.metrics.timeSec = 30;
  pushToastWithCooldown(state, "raid", "warning", { dedupKey: "raid", cooldownSec: 60 });
  // Suppressed because cooldown still active even after clear.
  assert.equal(state.metrics.warnings.length, 0);
});

test("pushToastWithCooldown: long cooldownSec acts as once-per-session (deprecation)", () => {
  const state = makeState(0);
  pushToastWithCooldown(state, "deprecated", "warn", { dedupKey: "deprecated-template-key", cooldownSec: 9999 });
  state.metrics.timeSec = 5000;
  pushToastWithCooldown(state, "deprecated", "warn", { dedupKey: "deprecated-template-key", cooldownSec: 9999 });
  state.metrics.timeSec = 9000;
  pushToastWithCooldown(state, "deprecated", "warn", { dedupKey: "deprecated-template-key", cooldownSec: 9999 });
  assert.equal(state.metrics.warnings.length, 1);
});

test("pushToastWithCooldown: LRU cap evicts oldest entry past 64 unique keys", () => {
  const state = makeState(0);
  // Fill to cap with unique keys.
  for (let i = 0; i < 64; i += 1) {
    pushToastWithCooldown(state, `msg-${i}`, "warn", { dedupKey: `key-${i}`, cooldownSec: 9999 });
  }
  assert.equal(state.__toastCooldowns.size, 64);
  // 65th key should evict key-0 (oldest insertion).
  pushToastWithCooldown(state, "msg-65", "warn", { dedupKey: "key-65", cooldownSec: 9999 });
  assert.equal(state.__toastCooldowns.size, 64);
  assert.equal(state.__toastCooldowns.has("key-0"), false, "oldest entry should be evicted");
  assert.equal(state.__toastCooldowns.has("key-65"), true, "newest entry should be present");
});

test("pushToastWithCooldown: missing state is a safe no-op", () => {
  // Should not throw on null/undefined state.
  pushToastWithCooldown(null, "x", "warn", { dedupKey: "x" });
  pushToastWithCooldown(undefined, "x", "warn", { dedupKey: "x" });
  pushToastWithCooldown({}, "x", "warn", { dedupKey: "x" });
  // No assertion needed — absence of throw is the test.
});
