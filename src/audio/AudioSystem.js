/**
 * AudioSystem — Web Audio API oscillator-based sounds, zero external assets.
 * Lazy-initialized on first user interaction to comply with browser autoplay policy.
 */
class AudioSystem {
  #ctx = null;
  #masterGain = null;
  #lastFoodCriticalSec = -Infinity;

  _init() {
    if (this.#ctx) return;
    try {
      this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.#masterGain = this.#ctx.createGain();
      this.#masterGain.gain.value = 0.35;
      this.#masterGain.connect(this.#ctx.destination);
    } catch (e) {
      // Non-browser environment (tests), silently skip
    }
  }

  _tone(freq, type, duration, vol = 1, delay = 0) {
    if (!this.#ctx) return;
    try {
      if (this.#ctx.state === 'suspended') this.#ctx.resume();
      const now = this.#ctx.currentTime + delay;
      const osc = this.#ctx.createOscillator();
      const gain = this.#ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.#masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (e) { /* ignore in tests */ }
  }

  /** Building successfully placed */
  onBuildingPlaced() {
    this._init();
    this._tone(523, 'sine', 0.12);
    this._tone(784, 'sine', 0.12, 0.7, 0.1);
  }

  /** Worker died */
  onWorkerDeath() {
    this._init();
    this._tone(110, 'triangle', 0.7, 0.45);
  }

  /**
   * Food crisis warning — throttled to at most once per 3 real seconds.
   * @param {number} nowRealSec - performance.now() / 1000
   */
  onFoodCritical(nowRealSec) {
    this._init();
    if (nowRealSec - this.#lastFoodCriticalSec < 3) return;
    this.#lastFoodCriticalSec = nowRealSec;
    this._tone(220, 'square', 0.15, 0.28);
    this._tone(196, 'square', 0.15, 0.28, 0.22);
  }

  /** Milestone achieved */
  onMilestone() {
    this._init();
    this._tone(523, 'sine', 0.3);
    this._tone(659, 'sine', 0.3, 0.75, 0.1);
    this._tone(784, 'sine', 0.4, 0.55, 0.22);
  }

  /** Game session started */
  onGameStart() {
    this._init();
    this._tone(330, 'sine', 0.5, 0.28);
    this._tone(392, 'sine', 0.4, 0.2, 0.3);
  }

  setVolume(v) {
    if (this.#masterGain) this.#masterGain.gain.value = Math.max(0, Math.min(1, v));
  }
}

export const audioSystem = new AudioSystem();
