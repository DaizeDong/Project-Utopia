function formatEventName(type) {
  if (type === "banditRaid") return "Bandit Raid";
  if (type === "tradeCaravan") return "Trade Caravan";
  if (type === "animalMigration") return "Animal Migration";
  if (type === "sabotage") return "Sabotage";
  return String(type ?? "Event");
}

function buildEventDetail(event) {
  const pressure = Number(event.payload?.pressure ?? 0);
  const severity = String(event.payload?.severity ?? "").trim();
  const targetLabel = String(event.payload?.targetLabel ?? "").trim();
  const contestedTiles = Number(event.payload?.contestedTiles ?? 0);
  const hazardOverlapTiles = Number(event.payload?.hazardOverlapTiles ?? 0);
  const defense = Number(event.payload?.defenseScore ?? event.payload?.wallCoverage ?? 0);
  const rewardMultiplier = Number(event.payload?.rewardMultiplier ?? 0);
  const impactTile = event.payload?.impactTile ?? null;
  const secondaryImpactTile = event.payload?.secondaryImpactTile ?? null;

  const parts = [];
  if (targetLabel) parts.push(targetLabel);
  if (pressure > 0) parts.push(`${severity || "low"} pressure ${pressure.toFixed(2)}`);
  if (hazardOverlapTiles > 0) parts.push(`weather overlap ${hazardOverlapTiles}`);
  if (contestedTiles > 0) parts.push(`contested ${contestedTiles}`);
  if (defense > 0) parts.push(`defense ${defense}`);
  if (rewardMultiplier > 0 && event.type === "tradeCaravan") parts.push(`yield x${rewardMultiplier.toFixed(2)}`);
  if (impactTile) parts.push(`impact (${impactTile.ix},${impactTile.iz})`);
  if (secondaryImpactTile) parts.push(`secondary (${secondaryImpactTile.ix},${secondaryImpactTile.iz})`);
  return parts.join(" | ");
}

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
          const detail = buildEventDetail(event);
          return `
            <div class='small'>
              <b>${formatEventName(event.type)}</b> ${event.status} (${remaining.toFixed(1)}s)
              ${detail ? `<div class='muted'>${detail}</div>` : ""}
            </div>
          `;
        })
        .join("");
    }

    // v0.8.2 Round-0 02d-roleplayer (Step 5) — append a "Recent Colony Events"
    // block pulled from state.gameplay.objectiveLog. Reviewer complaint was
    // that death/starvation/sabotage resolves never surfaced to the player;
    // MortalitySystem.recordDeath now pushes one narrative line per death,
    // ProgressionSystem.maybeTriggerRecovery already pushes recovery messages.
    // Taking the top 6 (objectiveLog already unshifts newest-first and caps
    // at 24) and rendering below the active-event list gives a consolidated
    // "Events & Colony Log" surface. Guarded with `?? []` because state
    // initialisation path may race with first render on the main menu.
    const objectiveLog = this.state.gameplay?.objectiveLog ?? [];
    if (objectiveLog.length > 0) {
      const recent = objectiveLog
        .slice(0, 6)
        .map((line) => `<div class='small muted'>${String(line ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}</div>`)
        .join("");
      html += `
        <hr style="border:none; border-top:1px solid rgba(53, 94, 129, 0.2); margin:6px 0;" />
        <div class='small'><b>Recent Colony Events</b></div>
        ${recent}
      `;
    }

    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
