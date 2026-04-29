// v0.8.4 strategic walls + GATE (Agent C). Cache key now includes the
// faction tag so a colony A* search and a hostile A* search for the same
// (start, goal) pair don't share results — one path goes through a gate,
// the other can't. Pre-v0.8.4 callers that omit the faction get the same
// behaviour as before (default "colony").
const DEFAULT_FACTION = "colony";

export class PathCache {
  constructor(maxEntries = 800) {
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  #key(gridVersion, start, goal, costVersion = 0, faction = DEFAULT_FACTION) {
    // Faction is appended *after* the goal so older log/debug parsers that
    // split on "->" still see the start->goal segment unchanged.
    return `${gridVersion}:${costVersion}:${start.ix},${start.iz}->${goal.ix},${goal.iz}:${faction}`;
  }

  get(gridVersion, start, goal, costVersion = 0, faction = DEFAULT_FACTION) {
    const key = this.#key(gridVersion, start, goal, costVersion, faction);
    const item = this.cache.get(key);
    if (!item) return null;

    // cheap LRU update
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.path;
  }

  set(gridVersion, start, goal, costVersion = 0, factionOrPath, maybePath) {
    // v0.8.4: backward-compatible signature. Old callers passed
    // `(gridVersion, start, goal, costVersion, path)`. New callers pass
    // `(gridVersion, start, goal, costVersion, faction, path)`. We detect
    // the faction-bearing form by looking at the 5th argument: if it's a
    // string, treat it as the faction; otherwise fall back to the default
    // and treat it as the path (the old shape).
    let faction = DEFAULT_FACTION;
    let path;
    if (typeof factionOrPath === "string") {
      faction = factionOrPath;
      path = maybePath;
    } else {
      path = factionOrPath;
    }
    const key = this.#key(gridVersion, start, goal, costVersion, faction);
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
