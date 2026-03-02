export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
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

    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    this.update(dt);
    this.render(dt);

    requestAnimationFrame(this.frame);
  }
}
