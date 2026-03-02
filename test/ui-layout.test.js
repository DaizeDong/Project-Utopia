import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("UI layout contains required control ids", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const requiredIds = [
    "toggleSidebarBtn",
    "toggleDockBtn",
    "sidebarCollapseAllBtn",
    "sidebarExpandCoreBtn",
    "sidebarExpandAllBtn",
    "pauseBtn",
    "step1Btn",
    "step5Btn",
    "timeScale",
    "benchmarkStatusVal",
    "simControlVal",
    "aiToggle",
    "inspect",
    "mapTemplateSelect",
    "mapSeedInput",
    "regenerateMapBtn",
    "terrainWaterLevel",
    "terrainRiverCount",
    "terrainRiverWidth",
    "terrainRiverAmp",
    "terrainMountainStrength",
    "terrainIslandBias",
    "terrainOceanBias",
    "terrainRoadDensity",
    "terrainSettlementDensity",
    "terrainWallModeSelect",
    "terrainOceanSideSelect",
    "resetTerrainTuningBtn",
    "showTileIconsToggle",
    "showUnitSpritesToggle",
    "fixedStepHz",
    "cameraMinZoom",
    "cameraMaxZoom",
    "renderDetailThreshold",
    "benchmarkStageDuration",
    "benchmarkSampleStart",
    "benchmarkSchedulePreset",
    "benchmarkScheduleInput",
    "applyBenchmarkConfigBtn",
    "populationBreakdownVal",
    "applyPopulationBtn",
    "undoBuildBtn",
    "redoBuildBtn",
    "saveSlotInput",
    "saveSnapshotBtn",
    "loadSnapshotBtn",
    "comparePresetsBtn",
    "exportReplayBtn",
    "workerBreakdownVal",
    "doctrineSelect",
    "devGlobalVal",
    "devAlgoVal",
    "devAiTraceVal",
    "devSystemVal",
    "devEventTraceVal",
  ];

  for (const id of requiredIds) {
    assert.ok(html.includes(`id=\"${id}\"`), `missing ${id}`);
  }
});
