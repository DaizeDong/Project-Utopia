export class PathCache {
  constructor(maxEntries = 800) {
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  #key(gridVersion, start, goal) {
    return `${gridVersion}:${start.ix},${start.iz}->${goal.ix},${goal.iz}`;
  }

  get(gridVersion, start, goal) {
    const key = this.#key(gridVersion, start, goal);
    const item = this.cache.get(key);
    if (!item) return null;

    // cheap LRU update
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.path;
  }

  set(gridVersion, start, goal, path) {
    const key = this.#key(gridVersion, start, goal);
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
