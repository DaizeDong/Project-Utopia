export class EventPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("eventsPanel");
  }

  render() {
    if (!this.root) return;

    if (this.state.events.active.length === 0) {
      this.root.innerHTML = "<div class='small muted'>No active events.</div>";
      return;
    }

    this.root.innerHTML = this.state.events.active
      .map((event) => {
        const remaining = Math.max(0, event.durationSec - event.elapsedSec);
        return `<div class='small'><b>${event.type}</b> ${event.status} (${remaining.toFixed(1)}s)</div>`;
      })
      .join("");
  }
}
