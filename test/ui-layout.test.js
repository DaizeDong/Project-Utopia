import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("UI layout contains required control ids", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const requiredIds = [
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
