import { TILE, TILE_INFO } from "../../config/constants.js";
import { getAiInsight, getCausalDigest, getEntityInsight, getEventInsight, getFrontierStatus, getLogisticsInsight, getTileInsight, getTrafficInsight, getWeatherInsight } from "../interpretation/WorldExplain.js";
import { getConstructionOverlay } from "../../simulation/construction/ConstructionSites.js";

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
    const digest = getCausalDigest(this.state);
    const aiInsight = getAiInsight(this.state);
    if (!tile) {
      const frontier = getFrontierStatus(this.state);
      const weather = getWeatherInsight(this.state);
      const events = getEventInsight(this.state);
      const logistics = getLogisticsInsight(this.state);
      const traffic = getTrafficInsight(this.state);
      return `
        <div><b>Selected Tile</b></div>
        <div class="small muted">Left click tile to build/select. Alt+Left click tile for inspect-only. Right drag pans the camera.</div>
        <div class="small" style="margin-top:8px;"><b>Objective Hint:</b> ${this.state.gameplay.objectiveHint ?? "none"}</div>
        <details style="margin-top:8px;" open>
          <summary class="small"><b>System Narrative</b></summary>
          <div class="small" style="margin-top:6px;"><b>Headline:</b> ${digest.headline}</div>
          <div class="small"><b>Next Move:</b> ${digest.action}</div>
          <div class="small"><b>AI:</b> ${aiInsight.summary}</div>
          <div class="small"><b>Evidence:</b><br />${digest.evidence.join("<br />")}</div>
        </details>
        <div class="small"><b>Frontier:</b> ${frontier.summary}</div>
        <div class="small"><b>Logistics:</b> ${logistics}</div>
        <div class="small"><b>Traffic:</b> ${traffic.summary}</div>
        <div class="small"><b>Weather:</b> ${weather.summary}</div>
        <div class="small"><b>Events:</b> ${events}</div>
      `;
    }

    const currentType = this.state.grid.tiles[tile.ix + tile.iz * this.state.grid.width];
    const info = TILE_INFO[currentType] ?? { passable: false, baseCost: 0, height: 0 };
    const idx = tile.ix + tile.iz * this.state.grid.width;
    // v0.8.4 Round 2 polish — overlay-aware tile label. When a construction
    // blueprint or demolish job is in progress on this tile, show
    // "Warehouse (under construction, 35%)" or "Demolishing Wall (60%)"
    // instead of the bare underlying tile type. The base "Type:" line still
    // shows the actual current TILE_LABEL so the player can see what tile
    // is underneath.
    const overlay = getConstructionOverlay(this.state, tile.ix, tile.iz);
    let overlayLine = "";
    if (overlay) {
      const total = Math.max(1e-3, Number(overlay.workTotalSec ?? 0));
      const applied = Math.max(0, Number(overlay.workAppliedSec ?? 0));
      const pct = Math.max(0, Math.min(100, Math.round((applied / total) * 100)));
      // v0.8.7 T3-4 (QA2-F4): when work has not started yet (no builderId
      // assigned, 0% progress) tell the player WHY — either no builder
      // claimed the site yet, or the colony has zero live BUILDERs at all.
      // Without this cue, players assume the blueprint is broken when
      // really it's just waiting for role-assignment to dispatch.
      let builderHint = "";
      if (overlay.builderId == null && pct === 0) {
        const agents = Array.isArray(this.state.agents) ? this.state.agents : [];
        const liveBuilders = agents.filter((a) => a && a.role === "BUILDER" && a.alive !== false).length;
        builderHint = liveBuilders === 0
          ? " <span class=\"muted\">(no builders available)</span>"
          : " <span class=\"muted\">(awaiting builder)</span>";
      }
      if (overlay.kind === "build") {
        const targetLabel = overlay.tool
          ? String(overlay.tool).replace(/_/g, " ")
          : (TILE_LABEL[Number(overlay.targetTile)] ?? "structure").toLowerCase();
        overlayLine = `<div class="small"><b>Construction:</b> ${targetLabel} (under construction, ${pct}%)${builderHint}</div>`;
      } else if (overlay.kind === "demolish") {
        const oldLabel = TILE_LABEL[Number(overlay.originalTile)] ?? "structure";
        overlayLine = `<div class="small"><b>Demolish:</b> ${oldLabel.toLowerCase()} (${pct}%)${builderHint}</div>`;
      }
    }
    // v0.8.7 T3-5 (QA2-F10): Wall HP indicator — show current/max HP for
     // WALL/GATE tiles so players can verify the visual red-tint cue
     // numerically. Reads from grid.tileState.wallHp (set by ConstructionSystem
     // on placement and decremented by saboteur/raider attacks).
    let wallHpLine = "";
    if (currentType === TILE.WALL || currentType === TILE.GATE) {
      const tileState = this.state.grid?.tileState;
      const entry = tileState?.get?.(idx) ?? null;
      if (entry && entry.wallHp != null) {
        const max = currentType === TILE.GATE
          ? Number(this.state.balance?.gateMaxHp ?? 75)
          : Number(this.state.balance?.wallMaxHp ?? 50);
        const hp = Math.max(0, Number(entry.wallHp));
        const ratio = max > 0 ? hp / max : 0;
        const tone = ratio >= 0.7 ? "#8ebf8e" : ratio >= 0.4 ? "#c9a94e" : "#e07070";
        wallHpLine = `<div class="small" style="color:${tone};"><b>HP:</b> ${hp.toFixed(0)} / ${max} (${Math.round(ratio * 100)}%)</div>`;
      }
    }
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

    // Processing block for kitchen / smithy / clinic tiles (Step 5)
    const PROCESSING_KINDS = { [TILE.KITCHEN]: "kitchen", [TILE.SMITHY]: "smithy", [TILE.CLINIC]: "clinic" };
    const processingKind = PROCESSING_KINDS[currentType];
    let processingBlock = "";
    if (processingKind) {
      const snapshot = Array.isArray(this.state.metrics?.processing) ? this.state.metrics.processing : [];
      const entry = snapshot.find((e) => e.ix === tile.ix && e.iz === tile.iz);
      if (entry) {
        const pct = Math.floor((entry.progress01 ?? 0) * 100);
        const eta = Math.max(0, Math.round(entry.etaSec ?? 0));
        const workerLabel = entry.workerPresent ? `${entry.kind} present` : `${entry.kind} missing`;
        const statusLabel = entry.stalled ? `stalled \u2014 ${entry.stallReason ?? "unknown"}` : "running";
        const inputLabel = entry.kind === "kitchen" ? `food OK: ${entry.inputOk}`
          : entry.kind === "smithy" ? `stone+wood OK: ${entry.inputOk}`
          : `herbs OK: ${entry.inputOk}`;
        processingBlock = `
          <details style="margin-top:8px;" open>
            <summary class="small"><b>Processing</b></summary>
            <div class="small" style="margin-top:6px;"><b>Cycle:</b> ${pct}% (ETA ${eta}s)</div>
            <div class="small"><b>Worker:</b> ${workerLabel}</div>
            <div class="small"><b>Inputs:</b> ${inputLabel}</div>
            <div class="small"><b>Status:</b> ${statusLabel}</div>
          </details>`;
      } else {
        processingBlock = `
          <details style="margin-top:8px;" open>
            <summary class="small"><b>Processing</b></summary>
            <div class="small muted">No cycle data yet (idle or simulation warming up).</div>
          </details>`;
      }
    }

    // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 2) — Building block
    // for raw producers / warehouse: FARM / LUMBER / QUARRY / HERB_GARDEN /
    // WAREHOUSE. Reads from state.metrics.production.byTile (Step 3) so the
    // old-vet "I clicked the FARM and got nothing" deal-breaker is closed.
    // Processing buildings (KITCHEN/SMITHY/CLINIC) keep their dedicated
    // Processing block above for backward compatibility with
    // test/inspectorProcessingBlock.test.js + test/processingSnapshot.test.js.
    const RAW_PRODUCER_KINDS = {
      [TILE.FARM]: "farm",
      [TILE.LUMBER]: "lumber",
      [TILE.QUARRY]: "quarry",
      [TILE.HERB_GARDEN]: "herb_garden",
      [TILE.WAREHOUSE]: "warehouse",
    };
    const rawKind = RAW_PRODUCER_KINDS[currentType];
    let buildingBlock = "";
    if (rawKind) {
      const prodMap = this.state.metrics?.production?.byTile;
      const prodKey = `${tile.ix},${tile.iz}`;
      const prodEntry = (prodMap instanceof Map) ? prodMap.get(prodKey) : null;
      const lastYield = prodEntry ? Number(prodEntry.lastYield ?? 0) : 0;
      const idleReason = prodEntry?.idleReason ?? null;
      const lastTickSec = prodEntry ? Number(prodEntry.lastTickSec ?? 0) : 0;
      const nowSec = Number(this.state.metrics?.timeSec ?? 0);
      const ageSec = lastTickSec > 0 ? Math.max(0, nowSec - lastTickSec) : null;
      const yieldLine = prodEntry
        ? `${lastYield.toFixed(2)}${ageSec !== null ? ` (${ageSec.toFixed(1)}s ago)` : ""}`
        : "no harvest yet";
      const idleLine = idleReason ?? "none";
      buildingBlock = `
        <details style="margin-top:8px;" open>
          <summary class="small"><b>Building</b></summary>
          <div class="small" style="margin-top:6px;"><b>Kind:</b> ${rawKind}</div>
          <div class="small"><b>Last Yield:</b> ${yieldLine}</div>
          <div class="small"><b>Idle Reason:</b> ${idleLine}</div>
        </details>`;
    }

    // Logistics efficiency for all production tiles (bonus carry-over)
    const PRODUCTION_TILE_SET = new Set([TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
      TILE.WAREHOUSE, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]);
    const tileKey = `${tile.ix},${tile.iz}`;
    const logEff = this.state.metrics?.logistics?.buildingEfficiency?.[tileKey];
    let logisticsLine = "";
    if (logEff !== undefined && PRODUCTION_TILE_SET.has(currentType)) {
      const eff = Number(logEff);
      const label = eff >= 1.1 ? `connected \xd7${eff.toFixed(2)}`
        : eff >= 0.95 ? `adjacent \xd7${eff.toFixed(2)}`
        : `isolated \xd7${eff.toFixed(2)}`;
      logisticsLine = `<div class="small"><b>Logistics:</b> ${label}</div>`;
    }

    return `
      <div><b>Selected Tile</b></div>
      <div class="small" style="margin-top:6px;"><b>Coord:</b> (${tile.ix}, ${tile.iz}) | idx=${idx}</div>
      <div class="small"><b>Type:</b> ${TILE_LABEL[currentType] ?? tile.typeName} (${currentType})</div>
      <div class="small"><b>Passable:</b> ${String(info.passable)}</div>
      <div class="small"><b>Move Cost:</b> ${Number(info.baseCost).toFixed(2)}</div>
      <div class="small"><b>Height:</b> ${Number(info.height).toFixed(3)}</div>
      <div class="small"><b>Grid Version:</b> ${this.state.grid.version}</div>
      <div class="small"><b>Neighbors:</b> ${neighbors.join(" | ")}</div>
      ${wallHpLine}
      ${overlayLine}
      ${logisticsLine}
      ${buildingBlock}
      ${processingBlock}
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
    // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 1) — Carry shows all 4
    // resources (food/wood/stone/herbs); previously stone+herbs were silently
    // truncated, hiding "80 workers carrying nothing" diagnostics from old vets.
    const carry = entity.carry
      ? ["food", "wood", "stone", "herbs"]
        .map((k) => `${k}=${(Number(entity.carry?.[k] ?? 0)).toFixed(2)}`)
        .join(", ")
      : "-";
    const pathProgress = entity.path ? `${entity.pathIndex}/${entity.path.length}` : "none";
    const pathNodes = entity.path ? entity.path.map((n) => `(${n.ix},${n.iz})`).join(" -> ") : "none";
    const speed = Math.hypot(entity.vx || 0, entity.vz || 0).toFixed(3);
    const desired = entity.desiredVel ? vecFmt(entity.desiredVel.x || 0, entity.desiredVel.z || 0) : "(0, 0)";
    const blackboardIntent = entity.blackboard?.intent ?? entity.debug?.lastIntent ?? "-";
    const groupPolicy = this.state.ai.groupPolicies.get(entity.groupId)?.data ?? null;
    const entityInsights = getEntityInsight(this.state, entity);
    const digest = getCausalDigest(this.state);
    const aiInsight = getAiInsight(this.state);

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
      <div class="small"><b>Path Versions:</b> grid=${entity.pathGridVersion} traffic=${entity.pathTrafficVersion ?? 0}</div>
      <details style="margin-top:8px;" open>
        <summary class="small"><b>Why It Matters</b></summary>
        <div class="small" style="margin-top:6px;"><b>Global Headline:</b> ${digest.headline}</div>
        <div class="small"><b>AI Narrative:</b> ${aiInsight.summary}</div>
        <div class="small"><b>Current Warning:</b> ${digest.warning}</div>
      </details>
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
