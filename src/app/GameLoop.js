export class GameLoop {
  constructor(update, render, options = {}) {
    this.update = update;
    this.render = render;
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.stopOnError = Boolean(options.stopOnError);
    this.running = false;
    const maxFps = Number(options.maxFps);
    this.maxFps = Number.isFinite(maxFps) ? Math.max(20, Math.min(240, maxFps)) : 60;
    this.minFrameMs = 1000 / this.maxFps;
    this.last = performance.now();
    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  frame(now) {
    if (!this.running) return;

    const elapsedMs = now - this.last;
    if (this.maxFps > 0 && elapsedMs < this.minFrameMs) {
      requestAnimationFrame(this.frame);
      return;
    }

    const dt = Math.min(0.1, elapsedMs / 1000);
    this.last = now;

    try {
      this.update(dt);
      this.render(dt);
    } catch (err) {
      this.onError?.(err);
      if (this.stopOnError) {
        this.running = false;
        return;
      }
    }

    requestAnimationFrame(this.frame);
  }
}
