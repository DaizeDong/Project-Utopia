function normalizeSeed(seed) {
  if (Number.isFinite(seed)) {
    const n = Number(seed) >>> 0;
    return n || 0x9e3779b9;
  }
  const text = String(seed ?? "utopia");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 0x9e3779b9;
}

export class SeededRng {
  constructor(seed = "utopia") {
    this.initialSeed = normalizeSeed(seed);
    this.state = this.initialSeed;
    this.calls = 0;
  }

  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    this.calls += 1;
    return this.state / 4294967296;
  }

  chance(probability) {
    return this.next() < Math.max(0, Math.min(1, Number(probability) || 0));
  }

  int(min, maxInclusive) {
    const lo = Math.floor(Number(min) || 0);
    const hi = Math.floor(Number(maxInclusive) || 0);
    if (hi <= lo) return lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  range(min, max) {
    const lo = Number(min) || 0;
    const hi = Number(max) || 0;
    return lo + (hi - lo) * this.next();
  }

  jitter(amount) {
    const a = Number(amount) || 0;
    return (this.next() * 2 - 1) * a;
  }

  snapshot() {
    return {
      initialSeed: this.initialSeed,
      state: this.state,
      calls: this.calls,
    };
  }

  restore(snapshot = {}) {
    this.initialSeed = normalizeSeed(snapshot.initialSeed ?? this.initialSeed);
    this.state = normalizeSeed(snapshot.state ?? this.initialSeed);
    this.calls = Math.max(0, Number(snapshot.calls) || 0);
  }
}

export function deriveRngSeed(baseSeed, namespace = "runtime") {
  const seed = normalizeSeed(baseSeed);
  let h = seed;
  const text = String(namespace);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
