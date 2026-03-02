export class EventPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("eventsPanel");
    this.lastHtml = "";
  }

  render() {
    if (!this.root) return;

    let html = "";
    if (this.state.events.active.length === 0) {
      html = "<div class='small muted'>No active events.</div>";
    } else {
      html = this.state.events.active
        .map((event) => {
          const remaining = Math.max(0, event.durationSec - event.elapsedSec);
          return `<div class='small'><b>${event.type}</b> ${event.status} (${remaining.toFixed(1)}s)</div>`;
        })
        .join("");
    }

    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
