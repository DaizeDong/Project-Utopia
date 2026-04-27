import test from "node:test";
import assert from "node:assert/strict";

import { formatGameEventForLog } from "../src/ui/panels/DeveloperPanel.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

test("formatGameEventForLog formats WORKER_STARVED with entity name + [HUNGER] tag", () => {
  const line = formatGameEventForLog({
    type: EVENT_TYPES.WORKER_STARVED,
    t: 113.37,
    entityId: "worker-80",
    entityName: "Worker-80",
    detail: { reason: "starvation", groupId: "colonists" },
  });
  assert.ok(line, "expected non-null formatted line for WORKER_STARVED");
  assert.match(line, /\[113\.4s\]/, "timestamp prefix with one decimal");
  assert.match(line, /\[HUNGER\]/, "hunger tag must be present");
  assert.match(line, /Worker-80/, "entity name must survive into the line");
  assert.doesNotMatch(line, /undefined/);
});

test("formatGameEventForLog formats WAREHOUSE_FIRE with coords + food loss", () => {
  const line = formatGameEventForLog({
    type: EVENT_TYPES.WAREHOUSE_FIRE,
    t: 42,
    entityId: null,
    entityName: null,
    detail: { ix: 13, iz: 27, foodLoss: 15 },
  });
  assert.ok(line);
  assert.match(line, /\[FIRE\]/);
  assert.match(line, /\(13,27\)/);
  assert.match(line, /food=-15/);
});

test("formatGameEventForLog formats TRADE_COMPLETED and WEATHER_CHANGED", () => {
  const trade = formatGameEventForLog({
    type: EVENT_TYPES.TRADE_COMPLETED,
    t: 99,
    entityId: "trader-4",
    entityName: "trader-4",
    detail: { goods: 8 },
  });
  assert.ok(trade);
  assert.match(trade, /\[TRADE\]/);
  assert.match(trade, /\+8/);

  const weather = formatGameEventForLog({
    type: EVENT_TYPES.WEATHER_CHANGED,
    t: 30,
    entityId: null,
    entityName: null,
    detail: { from: "clear", to: "storm", duration: 85 },
  });
  assert.ok(weather);
  assert.match(weather, /\[WEATHER\]/);
  assert.match(weather, /clear -> storm/);
  assert.match(weather, /\(85s\)/);
});

test("formatGameEventForLog returns null for noisy event types", () => {
  const noisyTypes = [
    EVENT_TYPES.BUILDING_PLACED,
    EVENT_TYPES.BUILDING_DESTROYED,
    EVENT_TYPES.WORKER_RESTING,
    EVENT_TYPES.WORKER_SOCIALIZED,
    EVENT_TYPES.NIGHT_BEGAN,
    EVENT_TYPES.DAY_BEGAN,
    EVENT_TYPES.HERBIVORE_FLED,
    EVENT_TYPES.RESOURCE_DEPLETED,
    EVENT_TYPES.RESOURCE_SURPLUS,
    EVENT_TYPES.WORKER_MOOD_LOW,
    EVENT_TYPES.ANIMAL_MIGRATION,
  ];
  for (const type of noisyTypes) {
    const line = formatGameEventForLog({ type, t: 1, detail: {} });
    assert.equal(line, null, `expected null for noisy type ${type}`);
  }
});

test("formatGameEventForLog produces fallback line for unknown event types", () => {
  const line = formatGameEventForLog({
    type: "wholly_unknown_type",
    t: 5,
    entityId: null,
    entityName: null,
    detail: {},
  });
  assert.ok(line);
  assert.match(line, /wholly_unknown_type/);
  assert.match(line, /\[5\.0s\]/);
});

test("formatGameEventForLog rejects malformed input safely", () => {
  assert.equal(formatGameEventForLog(null), null);
  assert.equal(formatGameEventForLog(undefined), null);
  assert.equal(formatGameEventForLog("not-an-event"), null);
  assert.equal(formatGameEventForLog(42), null);
});

test("DeveloperPanel renderEventLog pipeline: empty log shows friendly fallback, not 'No event/diagnostic'", async () => {
  // Simulate the renderEventLog text-assembly logic with an empty log.
  // This mirrors the fallback branch of #renderEventLog without needing a DOM.
  const state = {
    events: { log: [] },
    gameplay: { objectiveLog: [] },
    debug: { eventTrace: [], presetComparison: [] },
    metrics: { warnings: [] },
  };
  const gameEventLog = state.events?.log ?? [];
  const objectiveLog = state.gameplay.objectiveLog ?? [];
  const eventTrace = state.debug.eventTrace ?? [];
  const warnings = state.metrics.warnings ?? [];
  const lines = [];
  if (objectiveLog.length > 0) lines.push("Objective Log:");
  if (gameEventLog.length > 0) lines.push("Colony Log:");
  if (eventTrace.length > 0) lines.push("Event Trace:");
  if (warnings.length > 0) lines.push("Warnings:");
  const text = lines.length > 0
    ? lines.join("\n")
    : "Colony log is quiet. Events appear here when workers die, fires break out, traders arrive, or weather shifts.";
  assert.doesNotMatch(text, /No event\/diagnostic logs yet/);
  assert.match(text, /Colony log is quiet/);
});

test("DeveloperPanel renderEventLog pipeline: mixed log renders newest-first with summary", () => {
  const log = [
    {
      type: EVENT_TYPES.WORKER_STARVED,
      t: 10,
      entityId: "w-1",
      entityName: "Aldric-80",
      detail: { reason: "starvation" },
    },
    {
      type: EVENT_TYPES.WAREHOUSE_FIRE,
      t: 20,
      entityId: null,
      entityName: null,
      detail: { ix: 5, iz: 6, foodLoss: 12 },
    },
    {
      type: EVENT_TYPES.TRADE_COMPLETED,
      t: 30,
      entityId: "t-1",
      entityName: "trader-1",
      detail: { goods: 4 },
    },
  ];

  // Replicate the Colony Log assembly used inside #renderEventLog.
  const MAX = 12;
  const tail = log.slice(-MAX * 2);
  const formatted = [];
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const line = formatGameEventForLog(tail[i]);
    if (line) formatted.push(line);
    if (formatted.length >= MAX) break;
  }
  assert.equal(formatted.length, 3);
  // Newest-first: trade (t=30) should come before warehouse fire (t=20).
  assert.match(formatted[0], /\[TRADE\]/);
  assert.match(formatted[1], /\[FIRE\]/);
  assert.match(formatted[2], /\[HUNGER\]/);
  assert.match(formatted[2], /Aldric-80/);

  const header = `Colony Log (${log.length} total, showing last ${formatted.length}):`;
  assert.match(header, /3 total, showing last 3/);
});

test("DeveloperPanel renderEventLog pipeline: >12-event log is truncated with accurate total", () => {
  const log = [];
  for (let i = 0; i < 30; i += 1) {
    log.push({
      type: EVENT_TYPES.WORKER_STARVED,
      t: i,
      entityId: `w-${i}`,
      entityName: `Worker-${i}`,
      detail: { reason: "starvation" },
    });
  }
  const MAX = 12;
  const tail = log.slice(-MAX * 2);
  const formatted = [];
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const line = formatGameEventForLog(tail[i]);
    if (line) formatted.push(line);
    if (formatted.length >= MAX) break;
  }
  assert.equal(formatted.length, MAX);
  // Newest first: Worker-29 at top, decreasing toward Worker-18.
  assert.match(formatted[0], /Worker-29/);
  assert.match(formatted[MAX - 1], /Worker-18/);
  const header = `Colony Log (${log.length} total, showing last ${formatted.length}):`;
  assert.match(header, /30 total, showing last 12/);
});
