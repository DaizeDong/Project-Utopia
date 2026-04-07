const LN2 = Math.LN2;
const RECENCY_HALF_LIFE = 120;

export class MemoryStore {
  /**
   * @param {object} options
   * @param {number} [options.maxObservations=50]
   * @param {number} [options.maxReflections=20]
   */
  constructor(options = {}) {
    this._maxObservations = options.maxObservations ?? 50;
    this._maxReflections = options.maxReflections ?? 20;
    this.observations = [];
    this.reflections = [];
  }

  /**
   * Add an observation to the memory stream.
   * @param {number} timeSec
   * @param {string} text
   * @param {string} category
   * @param {number} importance  1 (routine) to 5 (critical), clamped
   */
  addObservation(timeSec, text, category, importance) {
    const clamped = Math.max(1, Math.min(5, importance));
    this.observations.push({
      timeSec,
      text,
      category,
      importance: clamped,
      type: "observation",
    });
    while (this.observations.length > this._maxObservations) {
      this.observations.shift();
    }
  }

  /**
   * Add a reflection (always importance 5).
   * @param {number} timeSec
   * @param {string} text
   */
  addReflection(timeSec, text) {
    this.reflections.push({
      timeSec,
      text,
      importance: 5,
      type: "reflection",
    });
    while (this.reflections.length > this._maxReflections) {
      this.reflections.shift();
    }
  }

  /**
   * Retrieve top-K entries scored by recency, relevance, and importance.
   * @param {string} query
   * @param {number} currentTimeSec
   * @param {number} [topK=5]
   * @returns {Array<{timeSec:number, text:string, type:string, importance:number, score:number}>}
   */
  retrieve(query, currentTimeSec, topK = 5) {
    const all = [...this.observations, ...this.reflections];
    if (all.length === 0) return [];

    const tokens = (query ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);

    const scored = all.map((entry) => {
      const ageSec = Math.max(0, currentTimeSec - entry.timeSec);
      const recencyScore = Math.exp((-ageSec * LN2) / RECENCY_HALF_LIFE);

      let relevanceScore = 0;
      if (tokens.length > 0) {
        const textLower = entry.text.toLowerCase();
        let matched = 0;
        for (const token of tokens) {
          if (textLower.includes(token)) matched += 1;
        }
        relevanceScore = matched / tokens.length;
      }

      const importanceScore = entry.importance / 5;

      const score = recencyScore * 0.3 + relevanceScore * 0.5 + importanceScore * 0.2;

      return {
        timeSec: entry.timeSec,
        text: entry.text,
        type: entry.type,
        importance: entry.importance,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Format retrieved memories for LLM prompt injection.
   * @param {string} query
   * @param {number} currentTimeSec
   * @param {number} [topK=5]
   * @returns {string}
   */
  formatForPrompt(query, currentTimeSec, topK = 5) {
    const entries = this.retrieve(query, currentTimeSec, topK);
    if (entries.length === 0) return "";
    return entries.map((e) => `[T=${e.timeSec}s, ${e.type}] ${e.text}`).join("\n");
  }

  /** Remove all observations and reflections. */
  clear() {
    this.observations.length = 0;
    this.reflections.length = 0;
  }

  /** Total number of stored entries. */
  get size() {
    return this.observations.length + this.reflections.length;
  }
}
