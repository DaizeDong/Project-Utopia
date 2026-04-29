import test from "node:test";
import assert from "node:assert/strict";

import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { FOG_STATE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { makeSerializableSnapshot, restoreSnapshotState } from "../src/app/snapshotService.js";

function countMilestones(state, kind) {
  return (state.events?.log ?? []).filter((event) => (
    event.type === EVENT_TYPES.COLONY_MILESTONE
    && event.detail?.kind === kind
  )).length;
}

function placeFirstBuildableFarm(state, buildSystem) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      const preview = buildSystem.previewToolAt(state, "farm", ix, iz);
      if (!preview.ok) continue;
      const placed = buildSystem.placeToolAt(state, "farm", ix, iz, { instant: true });
      assert.equal(placed.ok, true, `farm placement failed at (${ix},${iz}): ${placed.reason}`);
      return { ix, iz };
    }
  }
  assert.fail("expected at least one legal farm placement");
}

test("ProgressionSystem emits first_farm milestone once after baseline is exceeded", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.session.phase = "active";
  state.resources.wood = 999;
  state.fog = {
    visibility: new Uint8Array(state.grid.width * state.grid.height).fill(FOG_STATE.VISIBLE),
    version: 1,
  };
  const progression = new ProgressionSystem();
  const buildSystem = new BuildSystem();

  progression.update(0.1, state);
  assert.equal(countMilestones(state, "first_farm"), 0, "scenario bootstrap must not emit first_farm");

  placeFirstBuildableFarm(state, buildSystem);
  progression.update(0.1, state);
  assert.equal(countMilestones(state, "first_farm"), 1);
  assert.equal(state.gameplay.milestonesSeen.includes("first_farm"), true);

  placeFirstBuildableFarm(state, buildSystem);
  progression.update(0.1, state);
  assert.equal(countMilestones(state, "first_farm"), 1, "first_farm must be deduped");
});

test("milestone baseline and seen list survive snapshot roundtrip", () => {
  const state = createInitialGameState({ seed: 2026 });
  state.gameplay.milestonesSeen.push("first_farm");
  state.gameplay.milestoneBaseline.farms = 4;

  const restored = restoreSnapshotState(makeSerializableSnapshot(state));

  assert.deepEqual(restored.gameplay.milestonesSeen, ["first_farm"]);
  assert.equal(restored.gameplay.milestoneBaseline.farms, 4);
});
