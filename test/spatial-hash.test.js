import test from "node:test";
import assert from "node:assert/strict";

import { buildSpatialHash, queryNeighbors } from "../src/simulation/movement/SpatialHash.js";

test("queryNeighbors respects maxOut cap", () => {
  const entities = [];
  for (let i = 0; i < 40; i += 1) {
    entities.push({ x: 0.1 * (i % 5), z: 0.1 * Math.floor(i / 5) });
  }
  const hash = buildSpatialHash(entities, 2);
  const out = queryNeighbors(hash, entities[0], [], 12);
  assert.equal(out.length, 12);
});

test("queryNeighbors returns full neighborhood without cap", () => {
  const entities = [
    { x: 0, z: 0 },
    { x: 0.2, z: 0 },
    { x: 0, z: 0.2 },
    { x: 0.2, z: 0.2 },
  ];
  const hash = buildSpatialHash(entities, 2);
  const out = queryNeighbors(hash, entities[0], []);
  assert.equal(out.length, 4);
});
