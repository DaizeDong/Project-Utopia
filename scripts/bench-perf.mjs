import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { SeededRng, deriveRngSeed } from "../src/app/rng.js";
import { MAP_TEMPLATES, createInitialGrid, randomPassableTile } from "../src/world/grid/Grid.js";
import { aStar } from "../src/simulation/navigation/AStar.js";

function formatMs(value) {
  return Number(value).toFixed(3);
}

function run() {
  const seeds = [7, 23, 97, 2026];
  const rows = [];

  for (const template of MAP_TEMPLATES) {
    for (const seed of seeds) {
      const rng = new SeededRng(deriveRngSeed(seed, `bench:${template.id}`));
      const t0 = performance.now();
      const grid = createInitialGrid({ templateId: template.id, seed });
      const genMs = performance.now() - t0;

      const start = randomPassableTile(grid, () => rng.next());
      const goal = randomPassableTile(grid, () => rng.next());
      const t1 = performance.now();
      const path = aStar(grid, start, goal, 1);
      const astarMs = performance.now() - t1;

      rows.push({
        template: template.id,
        seed,
        grid_ms: formatMs(genMs),
        astar_ms: formatMs(astarMs),
        path_len: path?.length ?? 0,
        width: grid.width,
        height: grid.height,
      });
    }
  }

  const outDir = path.resolve(process.cwd(), "docs/assignment4/metrics");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "perf-baseline.csv");
  const header = "template,seed,grid_ms,astar_ms,path_len,width,height";
  const lines = rows.map((r) => [r.template, r.seed, r.grid_ms, r.astar_ms, r.path_len, r.width, r.height].join(","));
  fs.writeFileSync(outPath, `${header}\n${lines.join("\n")}\n`, "utf8");
  console.log(`Performance baseline written: ${outPath}`);
}

run();
