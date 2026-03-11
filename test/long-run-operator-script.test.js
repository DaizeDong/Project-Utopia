import test from "node:test";
import assert from "node:assert/strict";

import { buildOperatorActionSchedule, drainDueOperatorActions } from "../src/longrun/operatorPlan.js";

test("operator schedule covers all three 20-minute segments", () => {
  const schedule = buildOperatorActionSchedule();
  assert.equal(schedule.length, 33);
  assert.deepEqual(schedule[0], {
    atSec: 5,
    segmentIndex: 0,
    templateId: "temperate_plains",
    segmentLabel: "temperate_plains",
    type: "start_segment",
  });
  assert.equal(schedule[11].segmentIndex, 1);
  assert.equal(schedule[11].atSec, 1205);
  assert.equal(schedule.at(-1)?.templateId, "archipelago_isles");
  assert.equal(schedule.at(-1)?.type, "final_segment_observe");
});

test("drainDueOperatorActions advances the cursor deterministically", () => {
  const schedule = buildOperatorActionSchedule();
  const first = drainDueOperatorActions(schedule, 100, 0);
  assert.equal(first.due.length, 4);
  assert.equal(first.nextCursor, 4);

  const second = drainDueOperatorActions(schedule, 300, first.nextCursor);
  assert.equal(second.due.some((entry) => entry.type === "repair_primary_route"), true);
  assert.equal(second.nextCursor > first.nextCursor, true);
});

test("operator schedule truncates segments when durationSec is shorter than the full suite", () => {
  const schedule = buildOperatorActionSchedule({
    durationSec: 120,
    segmentDurationSec: 60,
  });
  assert.equal(schedule.some((entry) => entry.templateId === "archipelago_isles"), false);
  assert.equal(schedule.at(-1)?.templateId, "fortified_basin");
});
