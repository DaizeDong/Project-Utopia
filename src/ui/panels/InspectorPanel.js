import { TILE, TILE_INFO } from "../../config/constants.js";
import { getEntityInsight, getEventInsight, getFrontierStatus, getLogisticsInsight, getTileInsight, getWeatherInsight } from "../interpretation/WorldExplain.js";

const TILE_LABEL = Object.freeze(
  Object.entries(TILE).reduce((acc, [name, value]) => {
    acc[value] = name;
    return acc;
  }, {}),
);

function vecFmt(vx = 0, vz = 0) {
  return `(${Number(vx).toFixed(2)}, ${Number(vz).toFixed(2)})`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export class InspectorPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("inspect");
    this.lastHtml = "";
  }

  #renderTileSection() {
    const tile = this.state.controls.selectedTile;
    const preview = this.state.controls.buildPreview;
    if (!tile) {
      const frontier = getFrontierStatus(this.state);
      const weather = getWeatherInsight(this.state);
      const events = getEventInsight(this.state);
      const logistics = getLogisticsInsight(this.state);
      return `
        <div><b>Selected Tile</b></div>
        <div class="small muted">Left click tile to build/select. Alt+Left click tile for inspect-only. Right drag pans the camera.</div>
        <div class="small" style="margin-top:8px;"><b>Objective Hint:</b> ${this.state.gameplay.objectiveHint ?? "none"}</div>
        <div class="small"><b>Frontier:</b> ${frontier.summary}</div>
        <div class="small"><b>Logistics:</b> ${logistics}</div>
        <div class="small"><b>Weather:</b> ${weather.summary}</div>
        <div class="small"><b>Events:</b> ${events}</div>
      `;
    }

    const currentType = this.state.grid.tiles[tile.ix + tile.iz * this.state.grid.width];
    const info = TILE_INFO[currentType] ?? { passable: false, baseCost: 0, height: 0 };
    const idx = tile.ix + tile.iz * this.state.grid.width;
    const tileInsights = getTileInsight(this.state, tile);
    const previewMatchesTile = preview && preview.ix === tile.ix && preview.iz === tile.iz;
    const neighbors = [
      { label: "N", ix: tile.ix, iz: tile.iz - 1 },
      { label: "S", ix: tile.ix, iz: tile.iz + 1 },
      { label: "W", ix: tile.ix - 1, iz: tile.iz },
      { label: "E", ix: tile.ix + 1, iz: tile.iz },
    ].map((n) => {
      const inBounds = n.ix >= 0 && n.iz >= 0 && n.ix < this.state.grid.width && n.iz < this.state.grid.height;
      if (!inBounds) return `${n.label}: out`;
      const t = this.state.grid.tiles[n.ix + n.iz * this.state.grid.width];
      return `${n.label}: ${t}`;
    });

    return `
      <div><b>Selected Tile</b></div>
      <div class="small" style="margin-top:6px;"><b>Coord:</b> (${tile.ix}, ${tile.iz}) | idx=${idx}</div>
      <div class="small"><b>Type:</b> ${TILE_LABEL[currentType] ?? tile.typeName} (${currentType})</div>
      <div class="small"><b>Passable:</b> ${String(info.passable)}</div>
      <div class="small"><b>Move Cost:</b> ${Number(info.baseCost).toFixed(2)}</div>
      <div class="small"><b>Height:</b> ${Number(info.height).toFixed(3)}</div>
      <div class="small"><b>Grid Version:</b> ${this.state.grid.version}</div>
      <div class="small"><b>Neighbors:</b> ${neighbors.join(" | ")}</div>
      <details style="margin-top:8px;" open>
        <summary class="small"><b>Tile Context</b></summary>
        <div class="small" style="margin-top:6px;">
          ${tileInsights.length > 0 ? tileInsights.join("<br />") : "No frontier-specific context on this tile."}
        </div>
      </details>
      <details style="margin-top:8px;" ${previewMatchesTile ? "open" : ""}>
        <summary class="small"><b>Build Preview</b></summary>
        <div class="small" style="margin-top:6px;">
          ${previewMatchesTile
            ? [
              `<b>Tool:</b> ${String(this.state.controls.tool)}`,
              `<b>Status:</b> ${preview.ok ? "valid" : "blocked"}`,
              preview.summary ? `<b>Summary:</b> ${preview.summary}` : "",
              preview.reasonText ? `<b>Reason:</b> ${preview.reasonText}` : "",
              preview.cost ? `<b>Cost:</b> food ${preview.cost.food ?? 0}, wood ${preview.cost.wood ?? 0}` : "",
              preview.refund ? `<b>Salvage:</b> food ${preview.refund.food ?? 0}, wood ${preview.refund.wood ?? 0}` : "",
              preview.effects?.length ? `<b>Effects:</b> ${preview.effects.join(" | ")}` : "",
              preview.warnings?.length ? `<b>Warnings:</b> ${preview.warnings.join(" | ")}` : "",
            ].filter(Boolean).join("<br />")
            : "Hover the selected tile to inspect construction rules and scenario impact."}
        </div>
      </details>
    `;
  }

  #renderEntitySection() {
    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      return `
        <div style="margin-top:10px;"><b>Selected Entity</b></div>
        <div class="small muted">Click any worker, visitor, herbivore, or predator.</div>
      `;
    }

    const entity = [...this.state.agents, ...this.state.animals].find((e) => e.id === selectedId);
    if (!entity) {
      return `
        <div style="margin-top:10px;"><b>Selected Entity</b></div>
        <div class="small muted">Selected id not found in current world.</div>
      `;
    }

    const target = entity.targetTile ? `(${entity.targetTile.ix}, ${entity.targetTile.iz})` : "none";
    const hunger = entity.hunger !== undefined ? entity.hunger.toFixed(3) : "-";
    const carry = entity.carry ? `food=${entity.carry.food.toFixed?.(2) ?? entity.carry.food}, wood=${entity.carry.wood.toFixed?.(2) ?? entity.carry.wood}` : "-";
    const pathProgress = entity.path ? `${entity.pathIndex}/${entity.path.length}` : "none";
    const pathNodes = entity.path ? entity.path.map((n) => `(${n.ix},${n.iz})`).join(" -> ") : "none";
    const speed = Math.hypot(entity.vx || 0, entity.vz || 0).toFixed(3);
    const desired = entity.desiredVel ? vecFmt(entity.desiredVel.x || 0, entity.desiredVel.z || 0) : "(0, 0)";
    const blackboardIntent = entity.blackboard?.intent ?? entity.debug?.lastIntent ?? "-";
    const groupPolicy = this.state.ai.groupPolicies.get(entity.groupId)?.data ?? null;
    const entityInsights = getEntityInsight(this.state, entity);

    return `
      <div style="margin-top:10px;"><b>Selected Entity</b> <span class="muted">(${entity.id})</span></div>
      <div class="small" style="margin-top:6px;"><b>Name:</b> ${entity.displayName ?? entity.id}</div>
      <div class="small"><b>Type:</b> ${entity.type}${entity.kind ? `/${entity.kind}` : ""}</div>
      <div class="small"><b>State:</b> ${entity.stateLabel}</div>
      <div class="small"><b>Role:</b> ${entity.role ?? "N/A"}</div>
      <div class="small"><b>Group:</b> ${entity.groupId ?? "-"}</div>
      <div class="small"><b>Position:</b> (${entity.x.toFixed(3)}, ${entity.z.toFixed(3)})</div>
      <div class="small"><b>Velocity:</b> ${vecFmt(entity.vx || 0, entity.vz || 0)} | speed=${speed}</div>
      <div class="small"><b>DesiredVel:</b> ${desired}</div>
      <div class="small"><b>Hunger:</b> ${hunger}</div>
      <div class="small"><b>Carry:</b> ${carry}</div>
      <div class="small"><b>Intent:</b> ${blackboardIntent}</div>
      <div class="small"><b>Target Tile:</b> ${target}</div>
      <div class="small"><b>Path:</b> ${pathProgress}</div>
      <div class="small"><b>Path Grid Version:</b> ${entity.pathGridVersion}</div>
      <details style="margin-top:8px;" open>
        <summary class="small"><b>Decision Context</b></summary>
        <div class="small" style="margin-top:6px;">
          ${entityInsights.length > 0 ? entityInsights.join("<br />") : "No extra decision context for this entity."}
        </div>
      </details>
      <details style="margin-top:8px;">
        <summary class="small"><b>Path Detail</b></summary>
        <div class="small" style="margin-top:6px; white-space:normal;">${pathNodes}</div>
      </details>
      <details style="margin-top:8px;">
        <summary class="small"><b>AI / Memory / Blackboard</b></summary>
        <div class="small" style="margin-top:6px;"><b>Cooldown:</b> ${Number(entity.cooldown ?? 0).toFixed(2)}</div>
        <div class="small"><b>Sabotage CD:</b> ${Number(entity.sabotageCooldown ?? 0).toFixed(2)}</div>
        <pre class="small" style="white-space:pre-wrap; margin-top:6px;">blackboard = ${safeJson(entity.blackboard ?? {})}</pre>
        <pre class="small" style="white-space:pre-wrap; margin-top:6px;">policy = ${safeJson(entity.policy ?? null)}</pre>
        <pre class="small" style="white-space:pre-wrap; margin-top:6px;">groupPolicy = ${safeJson(groupPolicy)}</pre>
        <pre class="small" style="white-space:pre-wrap; margin-top:6px;">memory = ${safeJson(entity.memory ?? {})}</pre>
        <pre class="small" style="white-space:pre-wrap; margin-top:6px;">debug = ${safeJson(entity.debug ?? {})}</pre>
      </details>
    `;
  }

  render() {
    if (!this.root) return;
    const html = `${this.#renderTileSection()}${this.#renderEntitySection()}`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
