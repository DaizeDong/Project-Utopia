export function buildSpatialHash(entities, cellSize = 2, reuseHash = null) {
  const hash = reuseHash ?? { map: new Map(), cellSize };
  hash.map.clear();
  hash.cellSize = cellSize;

  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    const cx = Math.floor(entity.x / cellSize);
    const cz = Math.floor(entity.z / cellSize);

    let column = hash.map.get(cx);
    if (!column) {
      column = new Map();
      hash.map.set(cx, column);
    }

    let bucket = column.get(cz);
    if (!bucket) {
      bucket = [];
      column.set(cz, bucket);
    }
    bucket.push(entity);
  }

  return hash;
}

export function queryNeighbors(hash, entity, out = [], maxOut = Infinity) {
  out.length = 0;
  const cx = Math.floor(entity.x / hash.cellSize);
  const cz = Math.floor(entity.z / hash.cellSize);

  for (let dx = -1; dx <= 1; dx += 1) {
    const column = hash.map.get(cx + dx);
    if (!column) continue;
    for (let dz = -1; dz <= 1; dz += 1) {
      const list = column.get(cz + dz);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 1) {
        out.push(list[i]);
        if (out.length >= maxOut) return out;
      }
    }
  }

  return out;
}
