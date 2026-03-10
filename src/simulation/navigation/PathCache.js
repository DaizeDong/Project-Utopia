export class PathCache {
  constructor(maxEntries = 800) {
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  #key(gridVersion, start, goal, costVersion = 0) {
    return `${gridVersion}:${costVersion}:${start.ix},${start.iz}->${goal.ix},${goal.iz}`;
  }

  get(gridVersion, start, goal, costVersion = 0) {
    const key = this.#key(gridVersion, start, goal, costVersion);
    const item = this.cache.get(key);
    if (!item) return null;

    // cheap LRU update
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.path;
  }

  set(gridVersion, start, goal, costVersion = 0, path) {
    const key = this.#key(gridVersion, start, goal, costVersion);
    this.cache.set(key, { path });

    if (this.cache.size > this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  clear() {
    this.cache.clear();
  }
}
