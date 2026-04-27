/**
 * MemoryObserver — records game events as observations in a MemoryStore.
 * Extracted from GameApp.#recordMemoryObservations() for use in headless runners.
 */
export class MemoryObserver {
  constructor(memoryStore) {
    this.store = memoryStore;
    this.initialized = false;
    this.lastDeaths = 0;
    this.lastFoodCritical = false;
    this.lastObjIdx = 0;
    this.lastWeather = "clear";
  }

  reset() {
    this.initialized = false;
    this.lastDeaths = 0;
    this.lastFoodCritical = false;
    this.lastObjIdx = 0;
    this.lastWeather = "clear";
  }

  observe(state) {
    if (state.session?.phase && state.session.phase !== "active") return;
    const t = state.metrics.timeSec;
    const deaths = state.metrics.deathsTotal ?? 0;
    const food = state.resources.food;
    const objIdx = state.gameplay.objectiveIndex ?? 0;
    const weather = state.weather?.current ?? "clear";

    if (!this.initialized) {
      this.lastDeaths = deaths;
      this.lastFoodCritical = food < 15;
      this.lastObjIdx = objIdx;
      this.lastWeather = weather;
      this.initialized = true;
      return;
    }

    // Deaths
    if (deaths > this.lastDeaths) {
      const diff = deaths - this.lastDeaths;
      const reasons = state.metrics.deathsByReason ?? {};
      const detail = Object.entries(reasons).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(", ");
      this.store.addObservation(t, `${diff} death(s) (${detail || "unknown"})`, "death", 3);
      this.lastDeaths = deaths;
    }

    // Food critical
    if (food < 15 && !this.lastFoodCritical) {
      this.store.addObservation(t, `Food critically low: ${Math.floor(food)}`, "resource_critical", 2);
      this.lastFoodCritical = true;
    } else if (food >= 15) {
      this.lastFoodCritical = false;
    }

    // Objective completion
    if (objIdx > this.lastObjIdx) {
      const title = state.gameplay.objectives?.[this.lastObjIdx]?.title ?? `objective-${this.lastObjIdx}`;
      this.store.addObservation(t, `Completed objective: ${title}`, "objective", 3);
      this.lastObjIdx = objIdx;
    }

    // Weather change
    if (weather !== "clear" && weather !== this.lastWeather) {
      this.store.addObservation(t, `Weather changed to ${weather}`, "weather", 1);
      this.lastWeather = weather;
    } else if (weather === "clear") {
      this.lastWeather = "clear";
    }
  }
}
