import { TILE, TILE_INFO } from "../../config/constants.js";
import { getAiInsight, getCausalDigest, getEntityInsight, getEventInsight, getFrontierStatus, getLogisticsInsight, getTileInsight, getTrafficInsight, getWeatherInsight } from "../interpretation/WorldExplain.js";
import { getConstructionOverlay } from "../../simulation/construction/ConstructionSites.js";
import { isDevMode } from "../../app/devModeGate.js";

const TILE_LABEL = Object.freeze(
  Object.entries(TILE).reduce((acc, [name, value]) => {
    acc[value] = name;
    return acc;
  }, {}),
);

// v0.9.2-ui (F2) — Inspector tab strip. Each tab owns the full sidebar
// width so that the Terrain / Building / Path / Memory concerns no longer
// fight for the same 244px column. RimWorld inspector reference: Bio /
// Health / Gear / Schedule / Social — different concerns get different
// tabs so width pressure is split. localStorage key follows the
// utopia* convention used by sidebar / compact mode.
const INSPECTOR_TAB_KEY = "utopiaInspectorTab";
const INSPECTOR_TABS = Object.freeze([
  { id: "terrain", label: "Terrain" },
  { id: "building", label: "Building" },
  { id: "path", label: "Path" },
  { id: "memory", label: "Memory" },
]);

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

// v0.9.2-ui (F13) — readable list of node flag bits (FOREST/STONE/HERB).
// The flags Uint8 lives at state.grid.nodeFlags[idx] when present.
const NODE_FLAG_LABELS = [
  { mask: 0x01, label: "FOREST" },
  { mask: 0x02, label: "STONE" },
  { mask: 0x04, label: "HERB" },
];
function describeNodeFlags(flags) {
  if (!flags) return "—";
  const out = [];
  for (const { mask, label } of NODE_FLAG_LABELS) {
    if ((flags & mask) === mask) out.push(label);
  }
  return out.length ? out.join(", ") : "—";
}

// v0.9.2-ui (F13) — render a numeric metric with an inline 0-1 bar.
function metricBar(label, value, opts = {}) {
  if (value == null || !Number.isFinite(Number(value))) {
    return `<div class="small"><b>${label}:</b> —</div>`;
  }
  const v = Number(value);
  const norm = opts.scale ? Math.max(0, Math.min(1, v / opts.scale)) : Math.max(0, Math.min(1, v));
  const pct = Math.round(norm * 100);
  const tint = opts.invertColor
    ? (norm > 0.66 ? "#e07070" : norm > 0.33 ? "#c9a94e" : "#8ebf8e")
    : (norm > 0.66 ? "#8ebf8e" : norm > 0.33 ? "#c9a94e" : "#e07070");
  const formatted = opts.format === "int" ? v.toFixed(0) : v.toFixed(opts.digits ?? 2);
  return `<div class="small" style="display:flex;align-items:center;gap:6px;"><b style="flex:0 0 auto;">${label}:</b><span style="flex:0 0 auto;font-variant-numeric:tabular-nums;">${formatted}</span><span style="flex:1 1 auto;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;min-width:60px;"><span style="display:block;height:100%;width:${pct}%;background:${tint};"></span></span></div>`;
}

export class InspectorPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("inspect");
    this.lastHtml = "";
    // v0.9.2-ui (F2) — restore last-active tab from localStorage so the
    // player's section choice persists across reloads. activeTab is
    // mutated by the click delegate registered in render().
    this.activeTab = this.#loadActiveTab();
    this._tabClickBound = false;
  }

  #loadActiveTab() {
    try {
      const stored = (typeof localStorage !== "undefined") ? localStorage.getItem(INSPECTOR_TAB_KEY) : null;
      if (stored && INSPECTOR_TABS.some((t) => t.id === stored)) return stored;
    } catch { /* localStorage unavailable in tests */ }
    return "terrain";
  }

  #saveActiveTab(id) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(INSPECTOR_TAB_KEY, id);
    } catch { /* ignore */ }
  }

  #renderTabStrip() {
    return `<div class="inspector-tab-strip" role="tablist" style="display:flex;gap:4px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;">${INSPECTOR_TABS.map((t) => {
      const active = t.id === this.activeTab;
      return `<button type="button" role="tab" data-inspector-tab="${t.id}" aria-selected="${active}" style="flex:1 1 auto;padding:3px 6px;font-size:10px;font-weight:700;border-radius:4px;border:1px solid ${active ? "rgba(80,160,220,0.4)" : "rgba(255,255,255,0.08)"};background:${active ? "rgba(80,160,220,0.18)" : "rgba(255,255,255,0.04)"};color:${active ? "#d0e8ff" : "rgba(208,232,255,0.65)"};cursor:pointer;">${t.label}</button>`;
    }).join("")}</div>`;
  }

  // v0.9.2-ui (F13) — Terrain data is rendered inline inside the Terrain
  // tab; see #renderTerrainDataBlock below.

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
    // v0.9.2-ui (F13) — wallHp rendered inside the Terrain tab section
    // alongside fertility/moisture etc. Tests pin <b>HP:</b> shape so the
    // string lives in the terrain block, which is always emitted into
    // innerHTML even when a different tab is active.
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

    // v0.9.2-ui (F2) — split into 4 tabbed subsections. ALL sections are
    // emitted into the DOM so existing tests that grep innerHTML for
    // "Processing" / "<b>Building</b>" / "<b>HP:</b>" still pass; the
    // active tab is controlled via the [data-active-tab] CSS rule plus
    // the .inspector-section[data-inspector-section] gate. RimWorld pattern:
    // each concern owns the full panel width when active. Memory dumps live
    // in their own tab so they no longer dominate when the player is
    // looking at a FARM. Inside Memory, each <pre> JSON dump is wrapped in
    // <details> collapsed by default so a 200-line memory blob does not
    // become a 600-line waterfall.
    const tileInfoBlock = `
      <div class="inspector-section" data-inspector-section="terrain">
        <div><b>Selected Tile</b></div>
        <div class="small" style="margin-top:6px;"><b>Coord:</b> (${tile.ix}, ${tile.iz}) | idx=${idx}</div>
        <div class="small"><b>Type:</b> ${TILE_LABEL[currentType] ?? tile.typeName} (${currentType})</div>
        <div class="small"><b>Passable:</b> ${String(info.passable)}</div>
        <div class="small"><b>Move Cost:</b> ${Number(info.baseCost).toFixed(2)}</div>
        <div class="small"><b>Height:</b> ${Number(info.height).toFixed(3)}</div>
        <div class="small"><b>Grid Version:</b> ${this.state.grid.version}</div>
        <div class="small"><b>Neighbors:</b> ${neighbors.join(" | ")}</div>
        ${wallHpLine}
        ${this.#renderTerrainDataBlock(idx, currentType)}
        <details style="margin-top:8px;" open>
          <summary class="small"><b>Tile Context</b></summary>
          <div class="small" style="margin-top:6px;">
            ${tileInsights.length > 0 ? tileInsights.join("<br />") : "No frontier-specific context on this tile."}
          </div>
        </details>
      </div>
    `;
    const buildingSection = `
      <div class="inspector-section" data-inspector-section="building">
        ${overlayLine}
        ${logisticsLine}
        ${buildingBlock || `<div class="small muted">No production data for this tile (select a FARM/LUMBER/QUARRY/WAREHOUSE/KITCHEN/SMITHY/CLINIC).</div>`}
        ${processingBlock}
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
      </div>
    `;
    return `${this.#renderTabStrip()}<div class="inspector-tabs" data-active-tab="${this.activeTab}">${tileInfoBlock}${buildingSection}</div>`;
  }

  // v0.9.2-ui (F13) — extracted Terrain Data block emitted inline inside
  // the terrain tab section. The block always renders (even for grass
  // tiles with no tileState entry) so the player learns what data exists.
  #renderTerrainDataBlock(idx, currentType) {
    const tileState = this.state.grid?.tileState;
    const entry = tileState?.get?.(idx) ?? null;
    const fertility = entry?.fertility;
    const moisture = entry?.moisture;
    const soilExhaustion = entry?.soilExhaustion;
    const salinization = entry?.salinization;
    const yieldPool = entry?.yieldPool;
    const nodeFlags = this.state.grid?.nodeFlags?.[idx] ?? 0;

    let fogState = "—";
    const vis = this.state.fog?.visibility;
    if (vis && idx < vis.length) {
      const v = vis[idx];
      fogState = v >= 2 ? "visible" : v === 1 ? "discovered" : "unknown";
    }

    return `
      <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
        <div class="small" style="opacity:0.7;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-size:9px;">Terrain Data</div>
        ${fertility != null ? metricBar("Fertility", fertility) : `<div class="small muted"><b>Fertility:</b> default (no override)</div>`}
        ${moisture != null ? metricBar("Moisture", moisture) : `<div class="small muted"><b>Moisture:</b> default</div>`}
        ${soilExhaustion != null ? metricBar("Soil Exhaustion", soilExhaustion, { invertColor: true }) : `<div class="small muted"><b>Soil Exhaustion:</b> 0</div>`}
        ${salinization != null ? metricBar("Salinization", salinization, { invertColor: true }) : `<div class="small muted"><b>Salinization:</b> 0</div>`}
        ${yieldPool != null ? `<div class="small"><b>Yield Pool:</b> <span style="font-variant-numeric:tabular-nums;">${Number(yieldPool).toFixed(2)}</span></div>` : `<div class="small muted"><b>Yield Pool:</b> —</div>`}
        <div class="small"><b>Node Flags:</b> ${describeNodeFlags(nodeFlags)}</div>
        <div class="small"><b>Fog:</b> ${fogState}</div>
      </div>
    `;
  }

  #renderEntitySection() {
    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      // v0.9.2-ui (F2) — wrap fallback messages in an inspector-section so
      // the tab gate hides them when other tabs (Terrain) are active.
      return `
        <div class="inspector-section" data-inspector-section="building">
          <div style="margin-top:10px;"><b>Selected Entity</b></div>
          <div class="small muted">Click any worker, visitor, herbivore, or predator.</div>
        </div>
      `;
    }

    const entity = [...this.state.agents, ...this.state.animals].find((e) => e.id === selectedId);
    if (!entity) {
      return `
        <div class="inspector-section" data-inspector-section="building">
          <div style="margin-top:10px;"><b>Selected Entity</b></div>
          <div class="small muted">Selected id not found in current world.</div>
        </div>
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
    // v0.10.1-r5 (PE-classify-and-inspector P1): HP / Mood / Morale / Energy
    // are exposed on workers but were missing from the inspector overview
    // (HP only rendered for WALL/GATE tiles). Each line is gated on field
    // presence — visitors / animals without these fields won't see empty rows.
    // Energy falls back to `entity.rest` (which workers track via the
    // tooTired/restRecovered predicates) when `energy` itself is unset.
    const hpEntity = Number(entity.hp);
    const maxHpEntity = Number(entity.maxHp);
    const showHp = Number.isFinite(hpEntity) && Number.isFinite(maxHpEntity) && maxHpEntity > 0;
    const hpLine = showHp
      ? `<div class="small"><b>HP:</b> ${hpEntity.toFixed(0)} / ${maxHpEntity.toFixed(0)}</div>`
      : "";
    const moodEntity = Number(entity.mood);
    const moodLine = Number.isFinite(moodEntity)
      ? `<div class="small"><b>Mood:</b> ${(moodEntity * 100).toFixed(0)}%</div>`
      : "";
    const moraleEntity = Number(entity.morale);
    const moraleLine = Number.isFinite(moraleEntity)
      ? `<div class="small"><b>Morale:</b> ${(moraleEntity * 100).toFixed(0)}%</div>`
      : "";
    const energyRaw = Number.isFinite(Number(entity.energy)) ? Number(entity.energy) : Number(entity.rest);
    const energyLine = Number.isFinite(energyRaw)
      ? `<div class="small"><b>Energy:</b> ${(energyRaw * 100).toFixed(0)}%</div>`
      : "";
    const groupPolicy = this.state.ai.groupPolicies.get(entity.groupId)?.data ?? null;
    const entityInsights = getEntityInsight(this.state, entity);
    const digest = getCausalDigest(this.state);
    const aiInsight = getAiInsight(this.state);

    // v0.9.2-ui (F2) — entity content is split into Building (entity
    // overview / decision context), Path (route detail), Memory (raw JSON
    // dumps wrapped in <details> so they don't dominate). All blocks are
    // emitted; the active tab is gated by [data-active-tab] CSS.
    const overview = `
      <div class="inspector-section" data-inspector-section="building">
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
        ${hpLine}
        ${moodLine}
        ${moraleLine}
        ${energyLine}
        <div class="small"><b>Carry:</b> ${carry}</div>
        <div class="small"><b>Intent:</b> ${blackboardIntent}</div>
        <div class="small"><b>Target Tile:</b> ${target}</div>
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
      </div>
    `;
    const pathTab = `
      <div class="inspector-section" data-inspector-section="path">
        <div class="small"><b>Path:</b> ${pathProgress}</div>
        <div class="small"><b>Path Versions:</b> grid=${entity.pathGridVersion} traffic=${entity.pathTrafficVersion ?? 0}</div>
        <details style="margin-top:8px;" open>
          <summary class="small"><b>Path Detail</b></summary>
          <div class="small" style="margin-top:6px; white-space:normal;">${pathNodes}</div>
        </details>
      </div>
    `;
    // v0.9.2-ui (F2) — Memory dumps are now individually collapsible.
    // Each <pre> block sits inside its own <details> so a 200-line
    // memory blob no longer becomes a 600-line vertical waterfall the
    // moment the parent details opens.
    //
    // v0.10.1-n (A7-rationality-audit P0 #4) — raw JSON dumps (blackboard /
    // policy / groupPolicy / memory / debug) are dev telemetry, not player-
    // visible UI. Gate the entire `<pre>` ladder behind isDevMode(state) so
    // a casual player clicking on a worker sees Cooldown / Sabotage CD only,
    // and dev / QA users (URL `?dev=1`, `localStorage utopia:devMode=1`, or
    // Ctrl+Shift+D) still get the full debugger view. Same isDevMode helper
    // HUDController already uses for diagnostic strings (see autopilotStatus
    // / whisperBlockedReasonDev gates).
    const devOn = isDevMode(this.state);
    const memoryDumps = devOn
      ? `
        <details style="margin-top:8px;"><summary class="small"><b>blackboard</b></summary><pre class="small" style="white-space:pre-wrap; margin-top:6px;">${safeJson(entity.blackboard ?? {})}</pre></details>
        <details style="margin-top:8px;"><summary class="small"><b>policy</b></summary><pre class="small" style="white-space:pre-wrap; margin-top:6px;">${safeJson(entity.policy ?? null)}</pre></details>
        <details style="margin-top:8px;"><summary class="small"><b>groupPolicy</b></summary><pre class="small" style="white-space:pre-wrap; margin-top:6px;">${safeJson(groupPolicy)}</pre></details>
        <details style="margin-top:8px;"><summary class="small"><b>memory</b></summary><pre class="small" style="white-space:pre-wrap; margin-top:6px;">${safeJson(entity.memory ?? {})}</pre></details>
        <details style="margin-top:8px;"><summary class="small"><b>debug</b></summary><pre class="small" style="white-space:pre-wrap; margin-top:6px;">${safeJson(entity.debug ?? {})}</pre></details>
      `
      : `<div class="small muted" style="margin-top:6px;">Engineering dumps (blackboard / policy / memory / debug) hidden. Press Ctrl+Shift+D or append <code>?dev=1</code> to the URL to enable.</div>`;
    const memoryTab = `
      <div class="inspector-section" data-inspector-section="memory">
        <div class="small" style="margin-top:6px;"><b>Cooldown:</b> ${Number(entity.cooldown ?? 0).toFixed(2)}</div>
        <div class="small"><b>Sabotage CD:</b> ${Number(entity.sabotageCooldown ?? 0).toFixed(2)}</div>
        ${memoryDumps}
      </div>
    `;
    // Note: the entity sections are appended to the same .inspector-tabs
    // container in render() so [data-active-tab] gates them too.
    return `${overview}${pathTab}${memoryTab}`;
  }

  // v0.9.2-ui (F2) — combine tile + entity sections under a single
  // [data-active-tab] container so the tab gate hides/shows the right
  // sections cleanly. The tile section already opens .inspector-tabs;
  // we close it after the entity sections are appended.
  render() {
    if (!this.root) return;
    const tileHtml = this.#renderTileSection();
    const entityHtml = this.#renderEntitySection();
    // Tile section ends with </div> closing .inspector-tabs; reopen so
    // entity sections inherit the same data-active-tab gate. We splice
    // the closing </div> off and append entity content + close.
    let html;
    if (tileHtml.endsWith("</div>")) {
      const trimmed = tileHtml.slice(0, -"</div>".length);
      html = `${trimmed}${entityHtml}</div>`;
    } else {
      html = `${tileHtml}${entityHtml}`;
    }
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
    this.#bindTabClicks();
  }

  // v0.9.2-ui (F2) — bind a single delegated click handler that switches
  // tabs without triggering a full innerHTML rewrite. The .lastHtml gate
  // above re-renders only when the underlying tile/entity changes.
  #bindTabClicks() {
    if (this._tabClickBound) return;
    if (!this.root || typeof this.root.addEventListener !== "function") return;
    this.root.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-inspector-tab]");
      if (!btn) return;
      const id = btn.getAttribute("data-inspector-tab");
      if (!id || id === this.activeTab) return;
      if (!INSPECTOR_TABS.some((t) => t.id === id)) return;
      this.activeTab = id;
      this.#saveActiveTab(id);
      // Force a re-render so the strip's aria-selected + container's
      // data-active-tab pick up the change.
      this.lastHtml = "";
      this.render();
    });
    this._tabClickBound = true;
  }
}
