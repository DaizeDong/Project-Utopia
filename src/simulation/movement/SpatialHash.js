export function buildSpatialHash(entities, cellSize = 2) {
  const map = new Map();
  const key = (cx, cz) => `${cx}:${cz}`;

  for (const e of entities) {
    const cx = Math.floor(e.x / cellSize);
    const cz = Math.floor(e.z / cellSize);
    const k = key(cx, cz);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }

  return { map, cellSize };
}

export function queryNeighbors(hash, entity) {
  const out = [];
  const cx = Math.floor(entity.x / hash.cellSize);
  const cz = Math.floor(entity.z / hash.cellSize);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const k = `${cx + dx}:${cz + dz}`;
      const list = hash.map.get(k);
      if (list) out.push(...list);
    }
  }

  return out;
}
