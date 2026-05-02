import { getAiInsight, getCausalDigest, getEventInsight, getFrontierStatus, getLogisticsInsight, getScenarioProgressCompact, getScenarioProgressCompactCasual, getSurvivalScoreBreakdown, getTrafficInsight, getWeatherInsight } from "../interpretation/WorldExplain.js";
import { ColonyPlanner } from "../../simulation/ai/colony/ColonyPlanner.js";
import { BALANCE } from "../../config/balance.js";
import { tileToWorld } from "../../world/grid/Grid.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";
import { describeAutopilotToggle, getAutopilotStatus } from "./autopilotStatus.js";
import { isDevMode } from "../../app/devModeGate.js";
import { explainTerm } from "./glossary.js";
import { getNextActionAdvice } from "./nextActionAdvisor.js";
import { computeStorytellerStripModel, computeStorytellerStripText, extractLatestNarrativeBeat, formatBeatTextWithKind } from "./storytellerStrip.js";
import { EVENT_TYPES } from "../../simulation/meta/GameEventBus.js";
// v0.8.2 Round-5 Wave-2 (02b-casual Step 2): resource-chain stall summary
// for 7-row rate badges. Cached per-RATE_WINDOW_SEC in render() to avoid
// hitting ColonyPerceiver every frame.
import { getResourceChainStall } from "../../simulation/ai/colony/ColonyPerceiver.js";
import { audioSystem } from "../../audio/AudioSystem.js";

function shouldSuppressUserWarning(warningEvent, warningText = "") {
  const source = String(warningEvent?.source ?? "").toLowerCase();
  const text = String(warningEvent?.message ?? warningText ?? "").toLowerCase();
  if (source === "npcbrainsystem" && text.includes("dropped infeasible state target")) return true;
  if (text.includes("dropped infeasible state target")) return true;
  return false;
}

function finiteCount(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function isCasualMode() {
  return globalThis.document?.body?.classList?.contains?.("casual-mode") ?? false;
}

function buildSurvivalScoreTooltip(state, casualMode) {
  if (casualMode) return explainTerm("survivedScore");
  const br = getSurvivalScoreBreakdown(state);
  return `Survival Score: +${br.perSec}/s survived, +${br.perBirth}/birth, -${br.perDeath}/death | lived ${br.livedSec} | births +${br.subtotalBirths} | deaths -${br.subtotalDeaths}`;
}

function formatDevDimLabel(key) {
  if (key === "infrastructure") return "infra";
  return String(key);
}

function buildDevIndexTooltip(state, casualMode) {
  if (casualMode) return explainTerm("dev");
  const dims = state.gameplay?.devIndexDims ?? {};
  const dimEntries = Object.entries(dims)
    .filter(([, v]) => Number.isFinite(Number(v)))
    .map(([k, v]) => `${formatDevDimLabel(k)} ${Math.round(Number(v))}`);
  const base = "Dev Index: 0-100 composite";
  return dimEntries.length > 0
    ? `${base}; breakdown ${dimEntries.join(" | ")}`
    : explainTerm("dev");
}

// v0.8.2 Round-5b (02e Step 6b) — author-tone label for Dev/Threat/Score KPIs.
// Short-sentence that replaces "Dev 44/100" with an authored feel in tooltip.
// Source: existing Help panel "Threat & Prosperity" prose + scenario openingPressure.
function buildAuthorToneLabel(metric, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { label: "", tierKey: "low" };
  if (metric === "dev") {
    if (v < 40) return { label: "Scrappy outpost, still finding its rhythm.", tierKey: "low" };
    if (v < 60) return { label: "Working colony \u2014 entropy is being held at bay.", tierKey: "mid" };
    if (v < 80) return { label: "Breathing room at last; the routes compound.", tierKey: "high" };
    return { label: "The chain reinforces itself; pressure can wait.", tierKey: "elite" };
  }
  if (metric === "threat") {
    if (v < 30) return { label: "Frontier holds; no pressure incoming.", tierKey: "low" };
    if (v < 60) return { label: "Threat is the cost of being late.", tierKey: "mid" };
    return { label: "The danger is not distance but exposure.", tierKey: "high" };
  }
  if (metric === "score") {
    if (v < 500) return { label: "Holding on \u2014 the colony needs time.", tierKey: "low" };
    if (v < 3000) return { label: "Routes compound and the score follows.", tierKey: "mid" };
    if (v < 15000) return { label: "The colony breathes on its own now.", tierKey: "high" };
    return { label: "The chain reinforces itself; entropy waits outside.", tierKey: "elite" };
  }
  return { label: "", tierKey: "low" };
}

function scenarioGoalChips(state) {
  const runtime = getScenarioRuntime(state);
  const targets = runtime.logisticsTargets ?? {};
  const counts = runtime.counts ?? {};
  const chips = [];
  const add = (label, current, target) => {
    const safeTarget = finiteCount(target);
    if (safeTarget <= 0) return;
    const safeCurrent = finiteCount(current);
    chips.push({
      // v0.10.1-A6 (R3 P0) — `label` retains the legacy "name N/T" form so
      // existing tests + dev-mode plain-text rendering stay green; the
      // split `name`/`count` fields feed the two-span DOM structure used
      // by #renderGoalChips, which lets the ≤1280 media query hide the
      // name span (icon-only mode) while the count + chip title stay
      // visible.
      label: `${label} ${safeCurrent}/${safeTarget}`,
      name: label,
      count: `${safeCurrent}/${safeTarget}`,
      done: safeCurrent >= safeTarget,
    });
  };

  add("routes", runtime.connectedRoutes, runtime.routes?.length ?? 0);
  add("depots", runtime.readyDepots, runtime.depots?.length ?? 0);
  add("warehouses", counts.warehouses, targets.warehouses);
  add("farms", counts.farms, targets.farms);
  add("lumber", counts.lumbers, targets.lumbers);
  add("walls", counts.walls, targets.walls);
  return chips;
}

export class HUDController {
  constructor(state) {
    this.state = state;
    this.foodVal = document.getElementById("foodVal");
    this.woodVal = document.getElementById("woodVal");
    this.stoneVal = document.getElementById("stoneVal");
    this.herbsVal = document.getElementById("herbsVal");
    this.mealsVal = document.getElementById("mealsVal");
    this.toolsVal = document.getElementById("toolsVal");
    this.medicineVal = document.getElementById("medicineVal");
    this.foodBar = document.getElementById("foodBar");
    this.woodBar = document.getElementById("woodBar");
    this.stoneBar = document.getElementById("stoneBar");
    this.herbsBar = document.getElementById("herbsBar");
    this.mealsBar = document.getElementById("mealsBar");
    this.toolsBar = document.getElementById("toolsBar");
    this.medicineBar = document.getElementById("medicineBar");

    this.workersVal = document.getElementById("workersVal");
    this.visitorsVal = document.getElementById("visitorsVal");
    this.herbivoresVal = document.getElementById("herbivoresVal");
    this.predatorsVal = document.getElementById("predatorsVal");
    this.farmersVal = document.getElementById("farmersVal");
    this.loggersVal = document.getElementById("loggersVal");
    this.stonersVal = document.getElementById("stonersVal");
    this.herbistsVal = document.getElementById("herbistsVal");
    this.cooksVal = document.getElementById("cooksVal");
    this.smithsVal = document.getElementById("smithsVal");
    this.herbalistsVal = document.getElementById("herbalistsVal");
    this.haulersVal = document.getElementById("haulersVal");

    this.weatherVal = document.getElementById("weatherVal");
    this.mapVal = document.getElementById("mapVal");
    this.doctrineVal = document.getElementById("doctrineVal");
    this.prosperityVal = document.getElementById("prosperityVal");
    this.threatVal = document.getElementById("threatVal");
    this.objectiveVal = document.getElementById("objectiveVal");
    this.aiModeVal = document.getElementById("aiModeVal");
    this.aiEnvVal = document.getElementById("aiEnvVal");
    this.aiPolicyVal = document.getElementById("aiPolicyVal");
    this.aiDecisionVal = document.getElementById("aiDecisionVal");
    // v0.8.2 Round-0 01e-innovation (Step 4) — Storyteller strip DOM ref.
    // Populated every render() via renderStorytellerStrip; hidden element
    // is fine, HUDController simply no-ops when the node is missing.
    this.storytellerStrip = document.getElementById("storytellerStrip");
    // v0.8.2 Round-0 01e-innovation (Step 5) — Death obituary flash. When a
    // new worker dies, replace the aggregate "N (starve X / pred Y)" line
    // with a personalised micro-obituary for OBITUARY_FLASH_MS ms before
    // falling back. `_lastDeathsSeen` is used to detect new deaths relative
    // to the previous render; _obituaryUntilMs is the wall-clock deadline
    // after which the HUD reverts to the aggregate count.
    this._lastDeathsSeen = 0;
    this._obituaryText = "";
    this._obituaryUntilMs = 0;
    // v0.8.2 Round-1 02d-roleplayer — dwell throttle for the storyteller
    // strip's salient event-beat line. eventTrace unshifts a new row per
    // tick so without dwell the beat span would flicker on every frame.
    // We hold the last-rendered text for STRIP_BEAT_DWELL_MS (2500 ms)
    // before accepting a new one. Mirrors the `_obituary*` pattern above.
    this._stripBeatText = "";
    this._stripBeatUntilMs = 0;
    this._milestoneFlashText = "";
    this._milestoneFlashEventKey = "";
    this._milestoneFlashUntilMs = 0;
    // v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 4) — Author Voice ticker.
    // Ring buffer of recent salient beats (capacity 3) surfaced into
    // #authorTickerStrip below the HUD topbar. dwell ≥ 4s/entry per Stage B
    // Risk #2 (friendship beats fire 5-10× more often than sabotage; without
    // dwell the strip becomes a "friendship spam wall"). dev-mode hides the
    // strip entirely (see CSS in index.html — DeveloperPanel surfaces
    // eventTrace directly so the ticker would be redundant).
    this.authorTickerStrip = document.getElementById("authorTickerStrip");
    this.authorTickerIcon = this.authorTickerStrip?.querySelector?.(".ticker-icon") ?? null;
    this.authorTickerText = this.authorTickerStrip?.querySelector?.(".ticker-text") ?? null;
    this._tickerRing = [];
    this._tickerRingCap = 3;
    this._tickerLastShownAt = 0;
    this._tickerCurrentText = "";
    this._tickerCurrentKind = "generic";
    this._tickerDwellMs = 4000;
    this.deathVal = document.getElementById("deathVal");
    this.eventVal = document.getElementById("eventVal");
    this.timeVal = document.getElementById("timeVal");
    this.warningVal = document.getElementById("warningVal");
    this.actionVal = document.getElementById("actionVal");
    this.toolVal = document.getElementById("toolVal");
    this.simVal = document.getElementById("simVal");
    this.fpsVal = document.getElementById("fpsVal");
    this.frameVal = document.getElementById("frameVal");
    this.agentVal = document.getElementById("agentVal");
    this.visualModeVal = document.getElementById("visualModeVal");

    this.statusFood = document.getElementById("statusFood");
    this.statusWood = document.getElementById("statusWood");
    this.statusStone = document.getElementById("statusStone");
    this.statusHerbs = document.getElementById("statusHerbs");
    this.statusWorkers = document.getElementById("statusWorkers");
    this.statusMeals = document.getElementById("statusMeals");
    this.statusTools = document.getElementById("statusTools");
    this.statusMedicine = document.getElementById("statusMedicine");
    this.statusProsperity = document.getElementById("statusProsperity");
    this.statusThreat = document.getElementById("statusThreat");
    this.statusStoneBar = document.getElementById("statusStoneBar");
    this.statusHerbsBar = document.getElementById("statusHerbsBar");
    this.statusObjective = document.getElementById("statusObjective");
    // v0.8.2 Round-0 02e-indie-critic — scenario headline slot. Surfaces the
    // procedurally generated scenario title/summary as a persistent line in
    // the HUD status bar (previously only visible on the pre-game menu).
    this.statusScenarioHeadline = document.getElementById("statusScenarioHeadline");
    this._lastScenarioHeadlineText = null;
    // v0.8.2 Round-0 02c-speedrunner — scoreboard ribbon DOM refs. Sits
    // alongside #statusScenarioHeadline (02e) and #statusObjective (existing).
    // #statusScenario shows the compact scenario-progress ribbon; #statusScoreBreak
    // carries the per-rule score rules (survival/birth/death) in both the
    // visible span and the `title` tooltip so hover still works on narrow
    // viewports where the text is hidden by CSS.
    this.statusScenario = document.getElementById("statusScenario");
    this.statusScoreBreak = document.getElementById("statusScoreBreak");
    this.statusNextAction = document.getElementById("statusNextAction");
    // v0.8.2 Round-5b Wave-1 (01a Step 5 + Step 3) — new DOM slots.
    this.statusBuildHint = document.getElementById("statusBuildHint");
    this.statusAutopilotCrisis = document.getElementById("statusAutopilotCrisis");
    this._lastBuildHint = "";
    this.statusAction = document.getElementById("statusAction");
    this.statusFoodBar = document.getElementById("statusFoodBar");
    this.statusWoodBar = document.getElementById("statusWoodBar");
    this.statusProsperityBar = document.getElementById("statusProsperityBar");
    this.statusThreatBar = document.getElementById("statusThreatBar");
    this.hudFood = document.getElementById("hudFood");
    this.hudWood = document.getElementById("hudWood");
    // v0.9.2-ui (F14) — capture stone/herbs chip parents so we can mirror
    // the live trend into their title= attribute (tooltip).
    this.hudStone = document.getElementById("hudStone");
    this.hudHerbs = document.getElementById("hudHerbs");
    this.hudWorkers = document.getElementById("hudWorkers");
    this.statusObjectiveTime = document.getElementById("statusObjectiveTime");
    this.statusObjectiveScore = document.getElementById("statusObjectiveScore");
    this.statusObjectiveDev = document.getElementById("statusObjectiveDev");
    this.aiAutopilotChip = document.getElementById("aiAutopilotChip");

    this.speedPauseBtn = document.getElementById("speedPauseBtn");
    this.speedPlayBtn = document.getElementById("speedPlayBtn");
    this.speedFastBtn = document.getElementById("speedFastBtn");
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5e) — ultra speed (8x)
    // tier button. Optional element; setupSpeedControls tolerates absence.
    this.speedUltraBtn = document.getElementById("speedUltraBtn");
    this.aiToggleTop = document.getElementById("aiToggleTop");
    this.aiToggleMirror = document.getElementById("aiToggle");
    this.gameTimer = document.getElementById("gameTimer");
    this.timeScaleActualLabel = document.getElementById("timeScaleActualLabel");

    // v0.8.2 Round-0 01d — Resource rate badges. Snapshot every RATE_WINDOW_SEC
    // sim-seconds and compute (delta / window) * 60 → per-minute rate. Kept at 3s
    // to avoid jittery signs on stable supply. /min unit is chosen because
    // production/consumption events on the colony-chain are O(1 per few sec).
    this.foodRateVal = document.getElementById("foodRateVal");
    this.woodRateVal = document.getElementById("woodRateVal");
    this.stoneRateVal = document.getElementById("stoneRateVal");
    this.herbsRateVal = document.getElementById("herbsRateVal");
    this.mealsRateVal = document.getElementById("mealsRateVal");
    this.toolsRateVal = document.getElementById("toolsRateVal");
    this.medicineRateVal = document.getElementById("medicineRateVal");
    // v0.8.2 Round-1 01d-mechanics-content (Step 4) — DOM refs for the new
    // "Last: ... died (...)" scoreboard row and the food-rate breakdown span
    // that sits next to #foodRateVal. Both may be absent in minimal test DOMs
    // so all writes below guard with `if (this.x)`.
    this.latestDeathVal = document.getElementById("latestDeathVal");
    this.alertStack = document.getElementById("alertStack");
    this.foodRateBreakdown = document.getElementById("foodRateBreakdown");
    this.woodRateBreakdown = document.getElementById("woodRateBreakdown");
    this.stoneRateBreakdown = document.getElementById("stoneRateBreakdown");
    this.herbsRateBreakdown = document.getElementById("herbsRateBreakdown");
    this.mealsRateBreakdown = document.getElementById("mealsRateBreakdown");
    this.toolsRateBreakdown = document.getElementById("toolsRateBreakdown");
    this.medicineRateBreakdown = document.getElementById("medicineRateBreakdown");
    this.foodRunoutHint = document.getElementById("foodRunoutHint");
    this.mealsRunoutHint = document.getElementById("mealsRunoutHint");
    this.herbsRunoutHint = document.getElementById("herbsRunoutHint");
    this.medicineRunoutHint = document.getElementById("medicineRunoutHint");
    this.toolsRunoutHint = document.getElementById("toolsRunoutHint");
    this.stoneRunoutHint = document.getElementById("stoneRunoutHint");
    this._lastRunoutSmoothed = {};
    this._lastResourceSnapshot = null;
    this._lastSnapshotSimSec = 0;
    this._lastComputedRates = null; // cached between windows so UI shows continuous values

    // v0.8.2 Round-0 01b — track last shown action message so we only re-fire
    // the flash-action pulse when the text actually changes (not every render).
    this.lastActionMessage = "";

    // v0.8.2 Round-1 01a-onboarding — glossary tooltips are static metadata
    // (title text never changes during a session), so we apply them exactly
    // once per HUDController instance and use this flag to skip the DOM
    // writes on subsequent render() calls. Keeps render hot-path allocation-
    // free and avoids clobbering any Round-0 title attributes that were
    // already present on these nodes.
    this._glossaryApplied = false;
    this._lastHudHeight = 0;

    // v0.10.1-hotfix-batchC (issue #1) — priority-overflow chip hider for the
    // top status bar. Real-Chrome users at 1366×768/1440×900 still saw chips
    // clipped/wrapped despite the existing media-query rules (R0..R3 fixes),
    // because the sidebar-open width contribution + chip flex-shrink rules do
    // not deterministically trim chips when the bar would overflow. Instead
    // of relying on @media + flex-wrap, we install a ResizeObserver on the
    // statusBar and on the sidebar; whenever the bar's scrollWidth exceeds
    // its clientWidth (i.e. content would overflow horizontally), we walk a
    // fixed priority list and hide chips in order until overflow is gone.
    // When width is recovered, we re-show in reverse-priority order so the
    // most useful chips return first. Each hide tags the element with
    // `data-overflow-hidden="1"`; we never touch elements without that tag,
    // so user CSS / display:none-by-other-means is respected.
    this._overflowHiddenSelectors = new Set();
    this.setupSpeedControls();
    this.#observeStatusBarHeight();
    this.#observeStatusBarOverflow();
    this.#dismissBootSplash();
  }

  /**
   * Append glossary explanations to the `title` attribute of abbreviated
   * HUD nodes so new players get plain-language tooltips on hover. Preserves
   * any pre-existing Round-0 title (stored first in the composite) and
   * appends the glossary copy after a " | " separator. Runs exactly once
   * per instance — subsequent calls are no-ops.
   */
  #applyGlossaryTooltips() {
    if (this._glossaryApplied) return;
    // Note: #statusScoreBreak is intentionally excluded from glossary
    // tooltips because Round-1 01c-ui clears its `title` in casual profile
    // as an accessibility gate — appending the glossary explanation here
    // would leak dev-copy keywords to screen readers. The per-sec / per-
    // birth / per-death explanations live under "perSec"/"perBirth"/
    // "perDeath" glossary keys for future targeted tooltips on standalone
    // rule nodes if they're ever surfaced separately.
    const pairs = [
      [this.statusScenario, "routes"],
      [this.prosperityVal, "prosperity"],
      [this.threatVal, "threat"],
      [this.cooksVal, "cook"],
      [this.smithsVal, "smith"],
      [this.haulersVal, "haul"],
      [this.herbalistsVal, "herbalist"],
      [this.storytellerStrip, "storyteller"],
      // v0.8.2 Round-5 Wave-2 (01c-ui Step 7): explain the new "(prod / cons
      // / spoil)" suffix so a first-time hover reveals the 3-second window.
      [this.foodRateBreakdown, "foodRateBreakdown"],
    ];
    for (const [node, key] of pairs) {
      if (!node || typeof node.setAttribute !== "function") continue;
      const gloss = explainTerm(key);
      if (!gloss) continue;
      const existing = typeof node.getAttribute === "function"
        ? (node.getAttribute("title") ?? "")
        : "";
      // Don't duplicate if glossary copy already present (e.g. render()
      // fires before first #applyGlossaryTooltips completes, or a Round-0
      // tooltip path already wrote the same value).
      if (existing.includes(gloss)) continue;
      const composite = existing ? `${existing} | ${gloss}` : gloss;
      node.setAttribute("title", composite);
    }
    this._glossaryApplied = true;
  }

  #observeStatusBarHeight() {
    if (typeof ResizeObserver === "undefined") return;
    const bar = typeof document !== "undefined" ? document.getElementById("statusBar") : null;
    if (!bar) return;
    const observer = new ResizeObserver((entries) => {
      const h = Math.round(entries[0]?.contentRect?.height ?? 0);
      if (Math.abs(h - this._lastHudHeight) < 2) return;
      this._lastHudHeight = h;
      const root = document.documentElement;
      if (root?.style) root.style.setProperty("--hud-height", `${h}px`);
    });
    observer.observe(bar);
    this._statusBarObserver = observer;
  }

  // v0.10.1-hotfix-batchC (issue #1) — Priority queue for top-bar overflow.
  // Selectors are listed lowest-priority FIRST (hidden first when bar would
  // overflow; restored last when there is room). Resource chips & autopilot
  // are intentionally absent because they are core HUD signals.
  static get OVERFLOW_HIDE_PRIORITY() {
    return [
      "#statusBar #latestDeathRow",
      "#statusBar #statusBuildHint",
      "#statusBar #statusScoreBreak",
      "#statusBar #storytellerStrip",
      "#statusBar .hud-goal-chip:nth-child(n+5)",
      "#statusBar .hud-goal-chip:nth-child(n+4)",
      "#statusBar .hud-goal-chip:nth-child(n+3)",
      "#statusBar #statusScenario",
      "#statusBar #statusScenarioHeadline",
      "#statusBar #hudMedicine",
      "#statusBar #hudTools",
      "#statusBar #hudMeals",
      "#statusBar #hudThreat",
      "#statusBar #hudProsperity",
      "#statusBar #hudHerbs",
    ];
  }

  #observeStatusBarOverflow() {
    if (typeof ResizeObserver === "undefined") return;
    if (typeof document === "undefined") return;
    const bar = document.getElementById("statusBar");
    if (!bar) return;
    this._statusBar = bar;
    let scheduled = false;
    const reflow = () => {
      scheduled = false;
      try { this.#applyStatusBarOverflowPriority(); } catch (_err) { /* defensive */ }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
      raf(reflow);
    };
    const observer = new ResizeObserver(() => schedule());
    observer.observe(bar);
    const sidebar = document.getElementById("sidebar");
    if (sidebar) observer.observe(sidebar);
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("resize", schedule);
    }
    this._statusBarOverflowObserver = observer;
    // Initial pass after the bar has rendered.
    schedule();
  }

  #applyStatusBarOverflowPriority() {
    const bar = this._statusBar;
    if (!bar) return;
    const priority = HUDController.OVERFLOW_HIDE_PRIORITY;
    // v0.10.1-hotfix-iter2 (issue #1 follow-up): the 1025-1366 media-query
    // band lets `.hud-goal-list { flex-wrap: wrap }` push to a second row
    // when the goal chips don't fit on one line. The width-only check
    // (`scrollWidth > clientWidth + 4`) is fooled by this — the inner list
    // wraps but the bar's own clientWidth absorbs the overflow, so the
    // bar reports no horizontal scroll. Detect inner-list wrap by walking
    // visible children's offsetTop values and treating any vertical
    // dispersion (more than one row) as overflow. We deliberately avoid
    // checking the bar's own height because the media-query sets a hard
    // `min-height: 56px` to leave headroom — that 56px floor would
    // otherwise force the hider to drain every priority chip even when
    // the row fits cleanly.
    const ROW_TOLERANCE_PX = 6;
    const hasWrappedRow = () => {
      if (typeof bar.querySelectorAll !== "function") return false;
      let minTop = Infinity;
      let maxTop = -Infinity;
      const list = bar.querySelector(".hud-goal-list");
      const candidates = list ? list.children : bar.children;
      for (const child of candidates) {
        if (!child || child.offsetParent === null) continue;
        const top = Number(child.offsetTop ?? 0);
        if (!Number.isFinite(top)) continue;
        if (top < minTop) minTop = top;
        if (top > maxTop) maxTop = top;
      }
      if (!Number.isFinite(minTop) || !Number.isFinite(maxTop)) return false;
      return (maxTop - minTop) > ROW_TOLERANCE_PX;
    };
    const isOverflowing = () => {
      const sw = Number(bar.scrollWidth ?? 0);
      const cw = Number(bar.clientWidth ?? 0);
      if (!Number.isFinite(sw) || !Number.isFinite(cw)) return false;
      if (sw - cw > 4) return true;
      if (hasWrappedRow()) return true;
      return false;
    };
    // Step 1: while the bar overflows, walk priority list and hide one entry
    // at a time until either we run out of selectors or overflow is gone.
    if (typeof bar.querySelectorAll === "function") {
      for (const sel of priority) {
        if (!isOverflowing()) break;
        if (this._overflowHiddenSelectors.has(sel)) continue;
        const matches = bar.querySelectorAll(sel);
        if (!matches || matches.length === 0) continue;
        let touched = false;
        for (const node of matches) {
          if (!node || !node.style) continue;
          if (node.dataset && node.dataset.overflowHidden === "1") continue;
          // Don't override a real `display:none` set by other code (e.g.
          // tier="secondary" CSS). Probe inline display first.
          node.dataset.overflowHidden = "1";
          node.dataset.overflowPrevDisplay = node.style.display ?? "";
          node.style.display = "none";
          touched = true;
        }
        if (touched) this._overflowHiddenSelectors.add(sel);
      }
    }
    // Step 2: if there is now headroom, walk back in REVERSE priority and
    // restore selectors until restoring one would cause overflow again.
    const reversed = [...this._overflowHiddenSelectors].reverse();
    for (const sel of reversed) {
      if (typeof bar.querySelectorAll !== "function") break;
      const matches = bar.querySelectorAll(sel);
      if (!matches || matches.length === 0) {
        this._overflowHiddenSelectors.delete(sel);
        continue;
      }
      // Speculatively un-hide and check overflow.
      const restored = [];
      for (const node of matches) {
        if (!node || !node.style) continue;
        if (node.dataset?.overflowHidden !== "1") continue;
        const prev = node.dataset.overflowPrevDisplay ?? "";
        node.style.display = prev;
        delete node.dataset.overflowHidden;
        delete node.dataset.overflowPrevDisplay;
        restored.push(node);
      }
      if (isOverflowing() && restored.length > 0) {
        // Reverting: still no room, hide them again and stop trying to
        // restore higher-priority entries.
        for (const node of restored) {
          if (!node || !node.style) continue;
          node.dataset.overflowHidden = "1";
          node.dataset.overflowPrevDisplay = node.style.display ?? "";
          node.style.display = "none";
        }
        break;
      }
      this._overflowHiddenSelectors.delete(sel);
    }
  }

  // v0.10.1-n (A7-rationality-audit P0 #1) — Try-Again / regenerate-world hook.
  // When the player clicks Try Again, GameApp.regenerateWorld() rebuilds
  // state.metrics / state.gameplay from a fresh createInitialGameState(), but
  // HUDController carries a handful of `_last*` caches across world resets:
  //   - _lastResourceSnapshot / _lastSnapshotSimSec / _lastComputedRates
  //     (3-sec rate window) — previous run's `t` is now in the future relative
  //     to the new `state.metrics.timeSec=0`, so the rate flush condition
  //     (`simSec - this._lastSnapshotSimSec >= RATE_WINDOW_SEC`) cannot fire
  //     until the new run accumulates past the old timer, leaving the
  //     previous-run rate string visible for ≥1 minute.
  //   - _lastRunoutSmoothed (per-resource EWMA) — leaks the previous run's
  //     "until empty" estimate.
  //   - _lastDeathsSeen / _lastBuildHint / _lastScenarioHeadlineText — stale
  //     cause/hint strings can otherwise persist past the reset.
  //   - _lastChainStall / _lastChainStallSec — stale stall reason.
  // Public method so GameApp can invoke it deterministically post-reset
  // without reaching into private fields.
  resetTransientCaches() {
    this._lastRunoutSmoothed = {};
    this._lastResourceSnapshot = null;
    this._lastSnapshotSimSec = 0;
    this._lastComputedRates = null;
    this._lastDeathsSeen = 0;
    this._lastBuildHint = "";
    this._lastScenarioHeadlineText = null;
    this._lastChainStall = null;
    this._lastChainStallSec = null;
    this._runoutLoggedAt = {};
    this.lastActionMessage = "";
  }

  #dismissBootSplash() {
    if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") return;
    const splash = document.getElementById("bootSplash");
    if (!splash) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        splash.classList.add("done");
        setTimeout(() => splash.classList.add("hidden"), 400);
      });
    });
  }

  #rendererForDeathToast() {
    return this.state.services?.renderer
      ?? globalThis.window?.__utopia?.renderer
      ?? globalThis.__utopia?.renderer
      ?? null;
  }

  #pushDeathAlert(name, reason, tx, tz) {
    const stack = this.alertStack;
    const doc = stack?.ownerDocument ?? globalThis.document;
    if (!stack || !doc?.createElement || typeof stack.appendChild !== "function") return;
    const node = doc.createElement("div");
    node.className = "hud-death-toast";
    node.textContent = `${name} died - ${reason} at (${tx},${tz})`;
    stack.appendChild(node);

    const children = stack.children ?? stack.childNodes ?? [];
    while (children.length > 5) {
      const first = stack.firstElementChild ?? children[0];
      if (!first) break;
      if (typeof first.remove === "function") first.remove();
      else if (typeof stack.removeChild === "function") stack.removeChild(first);
      else break;
    }

    const timer = setTimeout(() => {
      if (typeof node.remove === "function") node.remove();
      else if (typeof stack.removeChild === "function") {
        try { stack.removeChild(node); } catch (_err) {}
      }
    }, 3500);
    timer?.unref?.();
  }

  #setDeathSeverity(active) {
    if (!this.deathVal) return;
    if (this.deathVal.style) {
      this.deathVal.style.color = active ? "#ff8a80" : "";
    }
    if (active) {
      this.deathVal.setAttribute?.("data-severity", "critical");
    } else if (typeof this.deathVal.removeAttribute === "function") {
      this.deathVal.removeAttribute("data-severity");
    } else {
      this.deathVal.setAttribute?.("data-severity", "");
    }
  }

  #notifyDeath(latestDead, name, reason, tx, tz) {
    const tile = latestDead?.deathContext?.targetTile ?? latestDead?.targetTile ?? null;
    const hasTile = Number.isFinite(Number(tile?.ix)) && Number.isFinite(Number(tile?.iz));
    const world = hasTile && this.state.grid
      ? tileToWorld(Number(tile.ix), Number(tile.iz), this.state.grid)
      : {
          x: Number(latestDead?.x ?? tx) || 0,
          z: Number(latestDead?.z ?? tz) || 0,
        };
    this.#rendererForDeathToast()?.spawnDeathToast?.(
      world.x,
      world.z,
      name,
      reason,
      tx,
      tz,
    );
    this.#pushDeathAlert(name, reason, tx, tz);
  }

  #currentMilestoneFlash(state) {
    const nowMs = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const log = Array.isArray(state.events?.log) ? state.events.log : [];
    const latest = log
      .slice()
      .reverse()
      .find((event) => (
        event?.type === EVENT_TYPES.COLONY_MILESTONE
        && nowSec - Number(event.t ?? nowSec) <= 3
      ));

    if (latest) {
      const eventKey = `${latest.t}:${latest.detail?.kind ?? latest.detail?.key ?? "milestone"}`;
      if (eventKey !== this._milestoneFlashEventKey) {
        const label = String(latest.detail?.label ?? "Milestone reached");
        const message = String(latest.detail?.message ?? "The colony made visible progress.");
        this._milestoneFlashEventKey = eventKey;
        this._milestoneFlashText = `${label}: ${message}`;
        this._milestoneFlashUntilMs = nowMs + 2500;
        this.storytellerStrip?.classList?.remove?.("flash-action");
        void this.storytellerStrip?.offsetWidth;
        this.storytellerStrip?.classList?.add?.("flash-action");
        audioSystem.onMilestone();
      }
    }

    if (this._milestoneFlashText && nowMs < this._milestoneFlashUntilMs) {
      const [label, ...rest] = this._milestoneFlashText.split(": ");
      return {
        label: label || "Milestone reached",
        message: rest.join(": ") || "The colony made visible progress.",
        text: this._milestoneFlashText,
      };
    }
    return null;
  }

  #renderGoalChips(chips, fallbackText) {
    const node = this.statusScenario;
    if (!node) return;
    const doc = node.ownerDocument ?? globalThis.document;
    node.classList?.add("hud-goal-list");
    node.setAttribute?.("title", fallbackText);
    if (!doc?.createElement || chips.length === 0) {
      node.textContent = fallbackText;
      return;
    }

    const chipNodes = chips.map((chip) => {
      const el = doc.createElement("span");
      el.className = `hud-goal-chip hud-goal-chip--${chip.done ? "done" : "pending"}`;
      el.setAttribute?.("data-status", chip.done ? "done" : "pending");
      // v0.10.1-A6 (R3 P0) — split chip text into name + count spans so
      // the ≤1280 px responsive band can hide the verbose name and keep
      // only the count visible (icon-only mode). The `title` attribute
      // carries the full label so hover still surfaces "farms 0/6".
      // Falls back to single-span text when chip lacks split fields
      // (preserves the legacy textContent contract for existing tests).
      el.setAttribute?.("title", chip.label);
      if (chip.name && chip.count && doc?.createElement) {
        const nameSpan = doc.createElement("span");
        nameSpan.className = "hud-goal-chip-name";
        nameSpan.textContent = `${chip.name} `;
        const countSpan = doc.createElement("span");
        countSpan.className = "hud-goal-chip-count";
        countSpan.textContent = chip.count;
        el.appendChild?.(nameSpan);
        el.appendChild?.(countSpan);
      } else {
        el.textContent = chip.label;
      }
      return el;
    });
    if (typeof node.replaceChildren === "function") {
      node.replaceChildren(...chipNodes);
    } else {
      node.textContent = "";
      if (Array.isArray(node.children)) node.children.length = 0;
      for (const chipNode of chipNodes) node.appendChild?.(chipNode);
    }
  }

  #renderNextAction(state) {
    const node = this.statusNextAction;
    if (!node) return;
    // v0.8.2 Round-7 (01e+02b) — Manual mode advisory chip.
    // When autopilot is disabled, supplement getNextActionAdvice with
    // ColonyPlanner.getAdvisoryRecommendation so the HUD shows a
    // ColonyPlanner-level priority hint (e.g. "Assign a COOK") in the
    // Next Action slot.  The getNextActionAdvice result still wins at
    // critical priority; advisory only shows when next-action is idle/done.
    const autopilotEnabled = Boolean(state?.ai?.enabled);
    const planOwnerLabel = autopilotEnabled ? "Autopilot plan" : "Manual guide";
    const planOwnerKey = autopilotEnabled ? "autopilot" : "manual";
    const planBoundary = autopilotEnabled
      ? "Autopilot may execute this plan on the next policy tick."
      : "Guidance only: you choose actions; builders/directors are idle while Autopilot is off.";
    if (!autopilotEnabled && typeof ColonyPlanner?.getAdvisoryRecommendation === "function") {
      const advisory = ColonyPlanner.getAdvisoryRecommendation(state);
      if (advisory && advisory.text) {
        const advisoryPriority = String(advisory.urgency ?? "low");
        // Only show advisory when the next-action chip would be idle or done
        // (critical/high/normal from getNextActionAdvice take priority).
        const currentNext = getNextActionAdvice(state);
        const currentPriority = String(currentNext?.priority ?? "idle");
        if (currentPriority === "idle" || currentPriority === "done") {
          node.textContent = `${planOwnerLabel}: ${advisory.text}`;
          node.setAttribute?.("data-priority", advisoryPriority);
          node.setAttribute?.("data-severity", advisoryPriority === "critical" ? "critical" : "");
          node.setAttribute?.("data-owner", planOwnerKey);
          node.setAttribute?.("data-tool", "select");
          node.setAttribute?.("data-reason", "manual_advisory");
          node.setAttribute?.("data-headline", advisory.text);
          node.setAttribute?.("data-outcome", "");
          node.setAttribute?.("data-why-now", "Manual mode - autopilot is off");
          node.setAttribute?.("title", `${planOwnerLabel}: ${advisory.text}. ${planBoundary}`);
          node.setAttribute?.("data-full", `${planOwnerLabel}: ${advisory.text}. ${planBoundary}`);
          node.setAttribute?.("data-target", "");
          return;
        }
      }
    }
    const next = getNextActionAdvice(state);
    const digestNow = getCausalDigest(state);
    const isIdle = next.priority === "idle";
    const headline = String(next.headline ?? next.whyNow ?? next.bottleneck ?? "").trim();
    const action = String(next.label ?? "Hold").trim();
    const outcome = String(next.expectedOutcome ?? next.detail ?? "").trim();
    // Use causalDigest override only when advice priority is not already critical
    let loopTextOverride = null;
    if (digestNow?.severity === "error" && digestNow?.action && next.priority !== "critical") {
      loopTextOverride = String(digestNow.action).trim();
      node.setAttribute?.("data-severity", "critical");
    } else {
      node.removeAttribute?.("data-severity");
    }
    const planBody = loopTextOverride ?? (isIdle
      ? (next.label ? `Next: ${next.label}` : "Next: hold")
      : [headline || "Next", action, outcome].filter(Boolean).join(" -> "));
    const loopText = `${planOwnerLabel}: ${planBody}`;
    const titleParts = [next.whyNow, next.detail, next.expectedOutcome]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean);
    const title = titleParts.length > 0
      ? `${planOwnerLabel}. ${planBoundary} ${titleParts.join(" ")}`
      : `${loopText}. ${planBoundary}`;
    node.textContent = loopText;
    node.setAttribute?.("title", title);
    // v0.8.2 Round-5b Wave-1 (01a Step 3) — data-full mirrors the full
    // headline so CSS ellipsis truncation never swallows instructions the
    // player actually needs. Hover title= (set above) + data-full both
    // expose the uncut string.
    node.setAttribute?.("data-full", title || loopText);
    node.setAttribute?.("data-priority", next.priority ?? "normal");
    node.setAttribute?.("data-owner", planOwnerKey);
    node.setAttribute?.("data-tool", next.tool ?? "select");
    node.setAttribute?.("data-reason", next.reason ?? "");
    node.setAttribute?.("data-headline", headline);
    node.setAttribute?.("data-outcome", outcome);
    node.setAttribute?.("data-why-now", String(next.whyNow ?? "").trim());
    const target = next.target;
    if (target && Number.isFinite(Number(target.ix)) && Number.isFinite(Number(target.iz))) {
      node.setAttribute?.("data-target", `${target.ix},${target.iz}`);
    } else {
      node.setAttribute?.("data-target", "");
    }
  }

  // v0.8.2 Round-7 (01e+02b) — Urgent resource ETA indicator.
  // Reads state.metrics.resourceEmptySec for all key resources and appends a
  // ⚠ banner to #statusObjective when the most-urgent resource runs out
  // within 120s.  No-ops when the node is absent or no resource is critical.
  #renderUrgentResourceEta(state) {
    const node = this.statusObjective;
    if (!node) return;
    const eta = state?.metrics?.resourceEmptySec ?? {};
    const RESOURCE_LABELS = { food: "Food", wood: "Wood", stone: "Stone", herbs: "Herbs" };
    let mostUrgentLabel = null;
    let mostUrgentSec = Infinity;
    for (const [key, label] of Object.entries(RESOURCE_LABELS)) {
      const sec = Number(eta[key] ?? 0);
      if (sec > 0 && sec < mostUrgentSec) {
        mostUrgentSec = sec;
        mostUrgentLabel = label;
      }
    }
    if (mostUrgentLabel && mostUrgentSec <= 120) {
      const rounded = Math.round(mostUrgentSec);
      const urgencyText = `\u26A0 ${mostUrgentLabel} runs out in ${rounded}s`;
      const existing = String(node.dataset?.urgencyText ?? "");
      if (existing !== urgencyText) {
        node.dataset.urgencyText = urgencyText;
        // Append/update urgency suffix without clobbering existing objective text
        const base = String(node.dataset?.objectiveBase ?? node.textContent ?? "").split(" | \u26A0")[0];
        node.dataset.objectiveBase = base;
        node.textContent = base ? `${base} | ${urgencyText}` : urgencyText;
      }
    } else {
      // No urgent resource — restore base objective text if we previously injected urgency.
      if (node.dataset?.urgencyText) {
        const base = String(node.dataset?.objectiveBase ?? "");
        if (base) node.textContent = base;
        delete node.dataset.urgencyText;
        delete node.dataset.objectiveBase;
      }
    }
  }

  // v0.8.2 Round-5b Wave-1 (01a Step 5) — #statusBuildHint reflects the
  // BuildSystem.previewToolAt(...).reasonText piped through
  // state.controls.buildHint by SceneRenderer.#onPointerMove. Diff-guarded
  // to avoid DOM thrash when the hover reason doesn't change.
  #renderBuildHint(state) {
    const node = this.statusBuildHint;
    if (!node) return;
    const hint = String(state?.controls?.buildHint ?? "").trim();
    if (hint === this._lastBuildHint) return;
    this._lastBuildHint = hint;
    if (!hint) {
      node.hidden = true;
      node.textContent = "";
      node.setAttribute?.("title", "");
      return;
    }
    node.hidden = false;
    node.textContent = hint;
    node.setAttribute?.("title", hint);
    node.setAttribute?.("data-reason", "invalid");
  }

  // v0.8.2 Round-5b Wave-1 (01a Step 3) — render #statusAutopilotCrisis
  // when FOOD_CRISIS_DETECTED has auto-paused the colony. Carries the
  // actionMessage teaching string so the player sees an honest failure
  // contract rather than the optimistic "fallback/fallback" banner.
  #renderAutopilotCrisis(state) {
    const node = this.statusAutopilotCrisis;
    if (!node) return;
    const paused = Boolean(state?.ai?.pausedByCrisis);
    if (!paused) {
      node.hidden = true;
      node.textContent = "";
      return;
    }
    node.hidden = false;
    const msg = String(state?.controls?.actionMessage ?? "Autopilot paused: food crisis.");
    node.textContent = msg;
    node.setAttribute?.("role", "alert");
  }

  setupSpeedControls() {
    this.speedPauseBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = !this.state.controls.isPaused;
    });
    this.speedPlayBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = false;
      this.state.controls.timeScale = 1.0;
    });
    this.speedFastBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = false;
      // v0.8.2 Round-0 02c-speedrunner — FF target 2.0 → 4.0 (x4). Coordinated
      // with simStepper's clamp widening from 3 → 4 so the button actually
      // reaches the requested rate.
      this.state.controls.timeScale = 4.0;
    });
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5e) — ultra speed (8x)
    // tier button. Mirrors `speedFastBtn` semantics: unpause + raise
    // timeScale. The honest ceiling at 8x is enforced inside simStepper
    // (Step 5a). When sim cost saturates, HUDController.timeScaleActualLabel
    // displays the *actual* rate so players see when the cap kicks in.
    this.speedUltraBtn?.addEventListener("click", () => {
      this.state.controls.isPaused = false;
      this.state.controls.timeScale = 8.0;
    });
    const syncAutopilot = (enabled) => {
      const active = Boolean(enabled);
      this.state.ai.enabled = active;
      this.state.ai.coverageTarget = active ? "llm" : "fallback";
      if (!active) this.state.ai.mode = "fallback";
      // Reset decision timers so the LLM is called immediately on the next
      // simulation tick rather than waiting for the full interval to elapse.
      if (active) {
        this.state.ai.lastEnvironmentDecisionSec = -9999;
        this.state.ai.lastPolicyDecisionSec = -9999;
        this.state.ai.forceStrategicDecision = true;
      }
      this.state.controls.actionMessage = describeAutopilotToggle(active).actionMessage;
      this.state.controls.actionKind = "info";
      if (this.aiToggleTop) this.aiToggleTop.checked = active;
      if (this.aiToggleMirror) this.aiToggleMirror.checked = active;
    };
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5e) — Autopilot decoupling.
    // Reviewer Run 3 reported "Autopilot turned off after I clicked Fast
    // Forward". Root cause: in some browsers a focus-stealing button click
    // can dispatch a synthetic `change` event on a focused checkbox. We
    // gate the change handler on `event.isTrusted` (true only for genuine
    // user interaction), with a `detail.userInitiated` escape hatch for
    // future programmatic toggles. A synthetic event from a button click
    // bubbling to the checkbox will be `isTrusted: false` AND have no
    // `detail.userInitiated`, so the handler will return early and the
    // ai.enabled state will be preserved.
    const isUserInitiated = (event) => {
      if (!event) return false;
      if (event.isTrusted === true) return true;
      if (event.detail && event.detail.userInitiated === true) return true;
      return false;
    };
    this.aiToggleTop?.addEventListener("change", (event) => {
      if (!isUserInitiated(event)) return;
      syncAutopilot(Boolean(this.aiToggleTop.checked));
    });
    this.aiToggleMirror?.addEventListener("change", (event) => {
      if (!isUserInitiated(event)) return;
      syncAutopilot(Boolean(this.aiToggleMirror.checked));
    });
  }

  render() {
    const { state } = this;
    const frontier = getFrontierStatus(state);
    const weather = getWeatherInsight(state);
    const logistics = getLogisticsInsight(state);
    const traffic = getTrafficInsight(state);
    const aiInsight = getAiInsight(state);
    const digest = getCausalDigest(state);
    const latestWarningEvent = Array.isArray(state.metrics.warningLog) && state.metrics.warningLog.length > 0
      ? state.metrics.warningLog[state.metrics.warningLog.length - 1]
      : null;
    const latestWarningText = latestWarningEvent?.message
      ?? (state.metrics.warnings.length > 0 ? state.metrics.warnings[state.metrics.warnings.length - 1] : "");

    this.foodVal.textContent = Math.floor(state.resources.food);
    this.woodVal.textContent = Math.floor(state.resources.wood);
    if (this.stoneVal) this.stoneVal.textContent = Math.floor(state.resources.stone);
    if (this.herbsVal) this.herbsVal.textContent = Math.floor(state.resources.herbs);
    if (this.mealsVal) this.mealsVal.textContent = Math.floor(state.resources.meals);
    if (this.toolsVal) this.toolsVal.textContent = Math.floor(state.resources.tools);
    if (this.medicineVal) this.medicineVal.textContent = Math.floor(state.resources.medicine);

    // --- v0.8.2 Round-0 01d: Resource rate badges (/min) ---
    const RATE_WINDOW_SEC = 3;
    const simSec = Number(state.metrics?.timeSec ?? 0);
    const snap = {
      food: Number(state.resources.food ?? 0),
      wood: Number(state.resources.wood ?? 0),
      stone: Number(state.resources.stone ?? 0),
      herbs: Number(state.resources.herbs ?? 0),
      meals: Number(state.resources.meals ?? 0),
      tools: Number(state.resources.tools ?? 0),
      medicine: Number(state.resources.medicine ?? 0),
      t: simSec,
    };
    if (this._lastResourceSnapshot == null) {
      this._lastResourceSnapshot = snap;
      this._lastSnapshotSimSec = simSec;
    } else if (simSec - this._lastSnapshotSimSec >= RATE_WINDOW_SEC) {
      const prev = this._lastResourceSnapshot;
      const dt = Math.max(0.0001, simSec - prev.t);
      // v0.10.1-n (A7-rationality-audit P0 #2) — headline rate is derived
      // from the SAME per-min accumulators that feed #renderRateBreakdown
      // (prod / cons / spoil) so the headline cannot disagree with its own
      // parenthetical breakdown. Previously the headline used a stock-delta
      // sample which drifted by 14× from the metrics-sourced breakdown
      // when warehouse deliveries / scenario re-stocks crossed the window.
      // Fall back to the legacy stock-delta when no per-min metric is
      // available (defence: keeps tests pinning stock-delta semantics on
      // resources without producer/consumer instrumentation alive).
      const m = state.metrics ?? {};
      const deriveRate = (resource, snapKey) => {
        const prodKey = `${resource}ProducedPerMin`;
        const consKey = `${resource}ConsumedPerMin`;
        const spoilKey = resource === "food" ? "foodSpoiledPerMin" : null;
        const hasProd = m[prodKey] !== undefined;
        const hasCons = m[consKey] !== undefined;
        if (!hasProd && !hasCons) {
          return ((snap[snapKey] - prev[snapKey]) / dt) * 60;
        }
        const prod = Number(m[prodKey] ?? 0);
        const cons = Number(m[consKey] ?? 0);
        const spoil = spoilKey ? Number(m[spoilKey] ?? 0) : 0;
        return prod - cons - spoil;
      };
      this._lastComputedRates = {
        food: deriveRate("food", "food"),
        wood: deriveRate("wood", "wood"),
        stone: deriveRate("stone", "stone"),
        herbs: deriveRate("herbs", "herbs"),
        meals: deriveRate("meals", "meals"),
        tools: deriveRate("tools", "tools"),
        medicine: deriveRate("medicine", "medicine"),
      };
      this._lastResourceSnapshot = snap;
      this._lastSnapshotSimSec = simSec;
    }
    const formatRate = (rate, stockSec) => {
      if (rate == null || !Number.isFinite(rate)) return "—";
      if (Math.abs(rate) < 0.05) return "= 0.0/min";
      // v0.8.2 Round-7 01b: cross-check stockSec — if stock is nearly depleted
      // (<120s) but rate shows positive, the measurement window is misleading;
      // display "≈ 0/min" to avoid showing false hope.
      if (rate > 0 && stockSec != null && Number.isFinite(stockSec) && stockSec > 0 && stockSec < 120) {
        return "≈ 0/min";
      }
      return rate >= 0
        ? `▲ +${rate.toFixed(1)}/min`
        : `▼ ${rate.toFixed(1)}/min`;
    };
    const rates = this._lastComputedRates;
    const resourceEmptySec = state.metrics?.resourceEmptySec ?? {};
    for (const r of ["food", "wood", "stone", "herbs", "meals", "tools", "medicine"]) {
      this.#renderRateBreakdown(r, state);
    }
    if (this.foodRateVal) this.foodRateVal.textContent = formatRate(rates?.food, resourceEmptySec.food);
    if (this.woodRateVal) this.woodRateVal.textContent = formatRate(rates?.wood);
    if (this.stoneRateVal) this.stoneRateVal.textContent = formatRate(rates?.stone);
    if (this.herbsRateVal) this.herbsRateVal.textContent = formatRate(rates?.herbs);
    if (this.mealsRateVal) this.mealsRateVal.textContent = formatRate(rates?.meals, resourceEmptySec.meals);
    if (this.toolsRateVal) this.toolsRateVal.textContent = formatRate(rates?.tools);
    if (this.medicineRateVal) this.medicineRateVal.textContent = formatRate(rates?.medicine);

    // v0.8.2 Round-5 Wave-2 (02b-casual Steps 2-3): per-resource stall
    // tooltip + data-stall marker. Throttled to the same RATE_WINDOW_SEC
    // (3s) the rate badges use so we don't hit ColonyPerceiver every
    // frame. Tooltip text: "<bottleneck> — <nextAction>"; marker:
    // `data-stall="1"` when rate is ~0 and the chain has a bottleneck,
    // otherwise `data-stall=""` to let the CSS left-border fade.
    try {
      if (this._lastChainStallSec == null || simSec - this._lastChainStallSec >= RATE_WINDOW_SEC) {
        this._lastChainStall = getResourceChainStall(state);
        this._lastChainStallSec = simSec;
      }
      const stall = this._lastChainStall ?? {};
      const stallPairs = [
        ["food", this.foodRateVal, rates?.food],
        ["wood", this.woodRateVal, rates?.wood],
        ["stone", this.stoneRateVal, rates?.stone],
        ["herbs", this.herbsRateVal, rates?.herbs],
        ["meals", this.mealsRateVal, rates?.meals],
        ["tools", this.toolsRateVal, rates?.tools],
        ["medicine", this.medicineRateVal, rates?.medicine],
      ];
      for (const [key, node, rate] of stallPairs) {
        if (!node || typeof node.setAttribute !== "function") continue;
        const info = stall[key];
        const rateAbs = Math.abs(Number(rate ?? 0));
        const isStalled = info && info.bottleneck && rateAbs < 0.05;
        if (isStalled) {
          const tip = info.nextAction
            ? `${info.bottleneck} — ${info.nextAction}`
            : String(info.bottleneck);
          node.setAttribute("title", tip);
          node.setAttribute("data-stall", "1");
        } else {
          node.setAttribute(
            "title",
            `${key}: ${formatRate(rate)} over last ${RATE_WINDOW_SEC}s`,
          );
          node.setAttribute("data-stall", "");
        }
      }
    } catch {
      // Never let tooltip logic break rate rendering.
    }

    this.foodBar.style.width = `${Math.min(100, (state.resources.food / 180) * 100)}%`;
    this.woodBar.style.width = `${Math.min(100, (state.resources.wood / 180) * 100)}%`;
    if (this.stoneBar) this.stoneBar.style.width = `${Math.min(100, (state.resources.stone / 80) * 100)}%`;
    if (this.herbsBar) this.herbsBar.style.width = `${Math.min(100, (state.resources.herbs / 50) * 100)}%`;
    if (this.mealsBar) this.mealsBar.style.width = `${Math.min(100, (state.resources.meals / 50) * 100)}%`;
    if (this.toolsBar) this.toolsBar.style.width = `${Math.min(100, (state.resources.tools / 10) * 100)}%`;
    if (this.medicineBar) this.medicineBar.style.width = `${Math.min(100, (state.resources.medicine / 30) * 100)}%`;

    const stats = state.metrics.populationStats ?? {
      workers: state.agents.filter((a) => a.type === "WORKER").length,
      visitors: state.agents.filter((a) => a.type === "VISITOR").length,
      herbivores: state.animals.filter((a) => a.kind === "HERBIVORE").length,
      predators: state.animals.filter((a) => a.kind === "PREDATOR").length,
      farmers: state.agents.filter((a) => a.type === "WORKER" && a.role === "FARM").length,
      loggers: state.agents.filter((a) => a.type === "WORKER" && a.role === "WOOD").length,
      totalEntities: state.agents.length + state.animals.length,
    };

    this.workersVal.textContent = String(stats.workers);
    this.visitorsVal.textContent = String(stats.visitors);
    this.herbivoresVal.textContent = String(stats.herbivores);
    this.predatorsVal.textContent = String(stats.predators);
    this.farmersVal.textContent = String(stats.farmers);
    this.loggersVal.textContent = String(stats.loggers);
    if (this.stonersVal) this.stonersVal.textContent = String(stats.stoneMiners ?? 0);
    if (this.herbistsVal) this.herbistsVal.textContent = String(stats.herbGatherers ?? 0);
    if (this.cooksVal) this.cooksVal.textContent = String(stats.cooks ?? 0);
    if (this.smithsVal) this.smithsVal.textContent = String(stats.smiths ?? 0);
    if (this.herbalistsVal) this.herbalistsVal.textContent = String(stats.herbalists ?? 0);
    if (this.haulersVal) this.haulersVal.textContent = String(stats.haulers ?? 0);

    this.weatherVal.textContent = weather.summary;
    if (this.mapVal) {
      this.mapVal.textContent = `${state.world.mapTemplateName} (seed ${state.world.mapSeed})`;
    }
    if (this.doctrineVal) this.doctrineVal.textContent = state.gameplay.doctrine;
    if (this.prosperityVal) this.prosperityVal.textContent = state.gameplay.prosperity.toFixed(1);
    if (this.threatVal) this.threatVal.textContent = state.gameplay.threat.toFixed(1);
    if (this.objectiveVal) {
      // v0.8.0 Phase 4 — Survival Mode: display the running survival score and
      // elapsed time instead of objective progress. Keep the legacy headline
      // digest as secondary context. objectives[] is always empty in survival
      // mode (the scenario objective pipeline was retired), so we unconditionally
      // render the survival status line here.
      // v0.8.2 Round-0 01b (P1): when the run is not active (menu / end overlay
      // is up), the simulation is paused, so we must also FREEZE the rendered
      // timer/score. Otherwise the HUD creates a "game is running behind the
      // menu" visual illusion (reviewer feedback 02, P1 root cause).
      const totalSec = Math.max(0, Math.floor(Number(state.metrics?.timeSec ?? 0)));
      const inActive = state.session?.phase === "active" && totalSec > 0;
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const formatted = inActive
        ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : "--:--:--";
      const score = inActive ? Math.floor(Number(state.metrics?.survivalScore ?? 0)) : "\u2014";
      this.objectiveVal.textContent = `Survived ${formatted} · Score ${score} | ${digest.headline}`;
    }
    const proxyModel = state.metrics.proxyModel || "-";
    this.aiModeVal.textContent = `${state.ai.enabled ? "on" : "off"} / ${state.ai.mode} (${state.metrics.proxyHealth ?? "unknown"}, ${proxyModel})`;
    const fmtSec = (sec) => (sec >= 0 ? `${sec.toFixed(1)}s` : "-");
    if (this.aiEnvVal) {
      this.aiEnvVal.textContent = `${state.ai.lastEnvironmentSource} @ ${fmtSec(state.ai.lastEnvironmentResultSec)} | ${aiInsight.environmentFocus}`;
    }
    if (this.aiPolicyVal) {
      this.aiPolicyVal.textContent = `${state.ai.lastPolicySource} @ ${fmtSec(state.ai.lastPolicyResultSec)} | workers=${digest.workerFocus}`;
    }
    if (this.aiDecisionVal) {
      this.aiDecisionVal.textContent = aiInsight.summary;
    }
    if (this.deathVal) {
      const deathsTotal = Number(state.metrics.deathsTotal ?? 0);
      const starvation = Number(state.metrics.deathsByReason?.starvation ?? 0);
      const predation = Number(state.metrics.deathsByReason?.predation ?? 0);
      const aggregate = `${deathsTotal} (starve ${starvation} / pred ${predation})`;

      // v0.8.2 Round-0 01e-innovation (Step 5) — personalised obituary flash.
      // When deathsTotal advances between renders, search `state.agents` for
      // the most recently-died worker (highest `deathSec`) and build a short
      // narrative using their displayName + backstory + deathReason. Show it
      // for OBITUARY_FLASH_MS milliseconds, then revert to the aggregate.
      const OBITUARY_FLASH_MS = 8000;
      const now = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now()
        : Date.now();
      const suppressDeathToast = Number(state.ui?.deathToastShownUntil ?? 0) > now;
      if (deathsTotal > this._lastDeathsSeen) {
        const candidates = Array.isArray(state.agents) ? state.agents : [];
        let latestDead = null;
        let latestDeathSec = -Infinity;
        for (const agent of candidates) {
          if (!agent || agent.alive) continue;
          const sec = Number(agent.deathSec ?? -1);
          if (sec > latestDeathSec) {
            latestDeathSec = sec;
            latestDead = agent;
          }
        }
        if (latestDead) {
          const name = String(latestDead.displayName ?? latestDead.id ?? "Unknown");
          const backstory = String(latestDead.backstory ?? "").trim();
          const reason = String(latestDead.deathReason ?? "unknown cause").trim() || "unknown cause";
          const tx = Math.floor(Number(latestDead.x ?? 0));
          const tz = Math.floor(Number(latestDead.z ?? 0));
          const bio = backstory ? ` (${backstory})` : "";
          this._obituaryText = `${name}${bio} died of ${reason} at (${tx},${tz})`;
          this._obituaryUntilMs = now + OBITUARY_FLASH_MS;
          if (!suppressDeathToast) this.#notifyDeath(latestDead, name, reason, tx, tz);
        }
        this._lastDeathsSeen = deathsTotal;
      }
      if (suppressDeathToast) this._obituaryText = "";
      if (this._obituaryText && now < this._obituaryUntilMs && !suppressDeathToast) {
        this.deathVal.textContent = this._obituaryText;
        this.#setDeathSeverity(true);
        this.deathVal.setAttribute?.("title", `${this._obituaryText} · total ${aggregate}`);
      } else {
        this.deathVal.textContent = aggregate;
        this.#setDeathSeverity(false);
        this.deathVal.setAttribute?.("title", "Deaths by cause (starvation / predation)");
        this._obituaryText = "";
      }
    }

    // v0.8.2 Round-1 01d-mechanics-content (Step 6) — Latest death quick-row.
    // MortalitySystem already unshifts "[t] Name died (reason) near (x,y)" lines
    // into state.gameplay.objectiveLog (newest-first). We surface the newest
    // such line to #latestDeathVal on the HUD top bar so the player never has
    // to open the Events panel to see who just died. Non-death log lines
    // (recovery, emergency relief, storyteller beats) are skipped via the
    // `/died\s*\(/` filter that matches MortalitySystem's format exactly.
    if (this.latestDeathVal) {
      const log = Array.isArray(state.gameplay?.objectiveLog)
        ? state.gameplay.objectiveLog
        : [];
      const latestDeathLine = log.find((ln) => /died\s*\(/.test(String(ln ?? "")));
      this.latestDeathVal.textContent = latestDeathLine
        ? String(latestDeathLine).slice(0, 80)
        : "No deaths yet";
      this.latestDeathVal.setAttribute?.("title",
        latestDeathLine ?? "No deaths this run");
    }

    // v0.8.2 Round-0 01e-innovation (Step 4) — Storyteller strip render.
    // Keeps the computation side-effect-free (computeStorytellerStripModel +
    // computeStorytellerStripText) and just writes the result into the DOM
    // refs. The text communicates fallback-as-feature rather than going
    // silent when no LLM is connected.
    //
    // v0.8.2 Round-1 01e-innovation — switched to the structured model so the
    // player sees a colour-coded WHISPER / DIRECTOR / DRIFT badge (D3
    // arbitration). We purposely use textContent + per-span writes (no
    // innerHTML) because focus/summary may originate from LLM output.
    // When the expected children are missing (older DOM / test rig), we
    // fall back to the legacy single-line renderer for back-compat.
    if (this.storytellerStrip) {
      const getBadgeEl = typeof document !== "undefined"
        ? document.getElementById("storytellerBadge")
        : null;
      const getFocusEl = typeof document !== "undefined"
        ? document.getElementById("storytellerFocus")
        : null;
      const getSummaryEl = typeof document !== "undefined"
        ? document.getElementById("storytellerSummary")
        : null;
      // v0.8.2 Round-1 02d-roleplayer — optional beat span populated from
      // model.beatText. May be null/absent in older templates; we fall
      // back to hiding/ignoring the beat in that case.
      const getBeatEl = typeof document !== "undefined"
        ? document.getElementById("storytellerBeat")
        : null;
      const getTemplateTagEl = typeof document !== "undefined"
        ? document.getElementById("storytellerTemplateTag")
        : null;
      const milestoneFlash = this.#currentMilestoneFlash(state);
      // v0.8.2 Round-5b (02e Step 6c / Step 3) — scenario-intro highest-priority
      // branch: during first 1.5s after regenerateWorld, override strip content
      // to show opening-pressure text. Exits early to skip other strip logic.
      const scenarioIntro = state.ui?.scenarioIntro;
      const nowMs = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now() : Date.now();
      // v0.8.7 T2-3 (QA2-F8): the storytellerWhyNoWhisper span sits inside the
      // "no milestone, no scenario-intro" branch below; on a tick that
      // crosses into either of those branches the prior dev-mode "Why no
      // WHISPER?" text would otherwise persist. Helper clears it for the
      // non-fallback branches so leaving fallback mode wipes the span too.
      const __resetWhySpan = () => {
        if (typeof document === "undefined") return;
        const el = document.getElementById("storytellerWhyNoWhisper");
        if (!el) return;
        el.textContent = "";
        if (!el.hasAttribute?.("hidden")) el.setAttribute?.("hidden", "");
      };
      if (getBadgeEl && getFocusEl && getSummaryEl && scenarioIntro
          && scenarioIntro.enteredAtMs
          && (nowMs - scenarioIntro.enteredAtMs) < (scenarioIntro.durationMs ?? 1500)) {
        if (getBadgeEl.textContent !== "SCENARIO") getBadgeEl.textContent = "SCENARIO";
        if (getBadgeEl.dataset) getBadgeEl.dataset.mode = "scenario-intro";
        else getBadgeEl.setAttribute?.("data-mode", "scenario-intro");
        const introTitle = String(scenarioIntro.title ?? "");
        if (getFocusEl.textContent !== introTitle) getFocusEl.textContent = introTitle;
        const introSummary = `: ${String(scenarioIntro.openingPressure ?? "")}`;
        if (getSummaryEl.textContent !== introSummary) getSummaryEl.textContent = introSummary;
        if (getBeatEl) {
          if (getBeatEl.textContent !== "") getBeatEl.textContent = "";
          if (!getBeatEl.hasAttribute?.("hidden")) getBeatEl.setAttribute?.("hidden", "");
        }
        __resetWhySpan();
      } else if (getBadgeEl && getFocusEl && getSummaryEl) {
        if (milestoneFlash) {
          if (getBadgeEl.textContent !== "MILESTONE") getBadgeEl.textContent = "MILESTONE";
          if (getBadgeEl.dataset) getBadgeEl.dataset.mode = "milestone";
          else getBadgeEl.setAttribute?.("data-mode", "milestone");
          if (getFocusEl.textContent !== milestoneFlash.label) getFocusEl.textContent = milestoneFlash.label;
          const summaryWithSeparator = `: ${milestoneFlash.message}`;
          if (getSummaryEl.textContent !== summaryWithSeparator) getSummaryEl.textContent = summaryWithSeparator;
          if (getBeatEl) {
            if (getBeatEl.textContent !== "") getBeatEl.textContent = "";
            if (!getBeatEl.hasAttribute?.("hidden")) getBeatEl.setAttribute?.("hidden", "");
          }
          if (getTemplateTagEl) {
            if (getTemplateTagEl.textContent !== "") getTemplateTagEl.textContent = "";
            if (!getTemplateTagEl.hasAttribute?.("hidden")) getTemplateTagEl.setAttribute?.("hidden", "");
          }
          this.storytellerStrip.setAttribute?.("title", `[MILESTONE] ${milestoneFlash.text}`);
          __resetWhySpan();
        } else {
        const model = computeStorytellerStripModel(state);
        if (getTemplateTagEl) {
          const templateTag = String(model.templateTag ?? "");
          if (getTemplateTagEl.textContent !== templateTag) {
            getTemplateTagEl.textContent = templateTag;
          }
          if (templateTag) {
            if (getTemplateTagEl.hasAttribute?.("hidden")) getTemplateTagEl.removeAttribute?.("hidden");
          } else if (!getTemplateTagEl.hasAttribute?.("hidden")) {
            getTemplateTagEl.setAttribute?.("hidden", "");
          }
        }
        if (getBadgeEl.textContent !== model.prefix) {
          getBadgeEl.textContent = model.prefix;
        }
        if (getBadgeEl.dataset) {
          if (getBadgeEl.dataset.mode !== model.mode) {
            getBadgeEl.dataset.mode = model.mode;
          }
          // v0.8.2 Round-5 Wave-3 (02e Step 5) — expose badgeState (four-way
          // split: llm-live / llm-stale / fallback-degraded / fallback-healthy /
          // idle) independently of the legacy `mode`. Downstream selectors
          // and tests can key off `dataset.state` to tell a healthy fallback
          // from a degraded one without inspecting other state.
          const nextBadgeState = String(model.badgeState ?? "");
          if (nextBadgeState && getBadgeEl.dataset.state !== nextBadgeState) {
            getBadgeEl.dataset.state = nextBadgeState;
          }
        } else {
          getBadgeEl.setAttribute?.("data-mode", model.mode);
          if (model.badgeState) getBadgeEl.setAttribute?.("data-state", String(model.badgeState));
        }
        if (getFocusEl.textContent !== model.focusText) {
          getFocusEl.textContent = model.focusText;
        }
        const summaryWithSeparator = `: ${model.summaryText}`;
        if (getSummaryEl.textContent !== summaryWithSeparator) {
          getSummaryEl.textContent = summaryWithSeparator;
        }

        // v0.8.2 Round-1 02d-roleplayer — beat span with 2.5s dwell throttle.
        // The eventTrace unshifts new rows every tick, so without dwell the
        // beat would flicker / stutter. We only accept a new beat string
        // once the dwell window has elapsed; stale text stays visible until
        // then. Clearing beatText (null) always takes effect immediately so
        // the span hides as soon as the 15s age horizon expires.
        if (getBeatEl) {
          const STRIP_BEAT_DWELL_MS = 2500;
          const now = (typeof performance !== "undefined" && typeof performance.now === "function")
            ? performance.now()
            : Date.now();
          const incoming = typeof model.beatText === "string" ? model.beatText : null;
          let renderText = this._stripBeatText;
          if (incoming === null || incoming === "") {
            renderText = "";
            this._stripBeatText = "";
            this._stripBeatUntilMs = 0;
          } else if (incoming !== this._stripBeatText) {
            if (now >= this._stripBeatUntilMs) {
              this._stripBeatText = incoming;
              this._stripBeatUntilMs = now + STRIP_BEAT_DWELL_MS;
              renderText = incoming;
            } // else: hold prior text until dwell elapses
          } else {
            renderText = this._stripBeatText;
          }
          if (renderText) {
            if (getBeatEl.textContent !== renderText) {
              getBeatEl.textContent = renderText;
            }
            if (getBeatEl.hasAttribute?.("hidden")) {
              getBeatEl.removeAttribute?.("hidden");
            }
          } else {
            if (getBeatEl.textContent !== "") getBeatEl.textContent = "";
            if (!getBeatEl.hasAttribute?.("hidden")) {
              getBeatEl.setAttribute?.("hidden", "");
            }
          }
        }

        const beatFrag = (getBeatEl && getBeatEl.textContent) ? ` \u00B7 ${getBeatEl.textContent}` : "";
        const tagFrag = model.templateTag ? `${model.templateTag} | ` : "";
        // v0.8.2 Round-5 Wave-3 (02e Step 5) — fallback-degraded tooltip
        // prefix so hover on the strip explicitly states the LLM is offline
        // and the rule-based director is in charge. Keeps the strip's main
        // text clean while giving the player a one-hover answer to "what
        // happened to WHISPER?".
        const degradedPrefix = (model.badgeState === "fallback-degraded")
          ? "[LLM offline \u2014 rule director in charge] "
          : "";
        // v0.8.2 Round-5b Wave-1 (01e Step 1) — append Why no WHISPER?
        // diagnostic when the badge is anything other than llm-live. Pulls
        // pre-computed whisperBlockedReason from model.diagnostic so the
        // hover tooltip answers "why isn't WHISPER on?" without requiring
        // the player to open a debug panel.
        //
        // v0.8.2 Round-6 Wave-1 01b-playability (Step 5) — gate the
        // engineer-facing dev string behind `state.controls.devMode`. The
        // in-fiction `whisperBlockedReason` (e.g. "Story Director:
        // pondering") is fine to surface to casual players; the
        // `whisperBlockedReasonDev` ("LLM errored (http)") only appears when
        // dev mode is explicitly enabled.
        //
        // v0.8.2 Round-6 Wave-1 01c-ui (Step 1) — switched from the local
        // `state.controls.devMode` flag to the shared `isDevMode(state)`
        // helper which also honours the `body.dev-mode` DOM class set by
        // GameApp's URL/storage/Ctrl+Shift+D dev gate. Casual-mode players
        // (no body.dev-mode) drop the entire "Why no WHISPER?" suffix; the
        // sibling badge surfaces a humanised tooltip instead.
        // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 8) — Step 8 retained
        // intentionally as a no-op: prior 01b (Round-6 Wave-1) and 01c
        // (Round-6 Wave-1) commits already implement the plan's intent —
        // casual players (no body.dev-mode set; the default for first-time
        // players in createInitialGameState) drop the engineer "Why no
        // WHISPER?" string entirely; only the in-fiction
        // `whisperBlockedReason` ("Story Director: settling in") reaches
        // the badge tooltip via the showBadge gate further down. Power
        // users that explicitly opt into dev-mode (URL flag /
        // Ctrl+Shift+D) still see the engineer suffix — that is the
        // `hud-dev-string-quarantine.test.js` contract pinned in Wave-1.
        // Casual `state.controls.uiProfile` (without dev-mode) already
        // hits the !devModeOn branch, so no additional uiProfile gate is
        // wired here. See plan Risks §R5 — the test that DID need an
        // update was `storyteller-strip-whisper-diagnostic.test.js` which
        // continues to assert both the in-fiction + dev string fields
        // (current state already satisfies that contract).
        const devModeOn = isDevMode(state);
        const diagText = devModeOn
          ? (model.diagnostic?.whisperBlockedReasonDev ?? model.diagnostic?.whisperBlockedReason ?? "")
          : "";
        const diagSuffix = (model.diagnostic
            && model.badgeState !== "llm-live"
            && diagText
            && devModeOn)
          ? ` \u2014 Why no WHISPER?: ${diagText}`
          : "";
        const tooltipText = `${degradedPrefix}${tagFrag}[${model.prefix}] ${model.focusText}${summaryWithSeparator}${beatFrag}${diagSuffix}`;
        this.storytellerStrip.setAttribute?.("title", tooltipText);
        // v0.8.2 Round-5b Wave-1 (01e Step 1) — update the sibling
        // #storytellerWhyNoWhisper span so CSS selectors / tests can
        // read the reason without parsing the tooltip string. Hidden
        // when llm-live (reason is not applicable); shown otherwise.
        //
        // v0.8.2 Round-6 Wave-1 01b-playability (Step 5) — same dev-mode
        // gate as the tooltip suffix above: casual players see the
        // in-fiction whisperBlockedReason; dev-mode appends the engineer
        // string. Empty when dev-mode is off AND there is no in-fiction
        // reason (defence in depth, should not happen post-Step 4).
        if (typeof document !== "undefined") {
          const whySpan = document.getElementById("storytellerWhyNoWhisper");
          if (whySpan) {
            // v0.8.7 T2-3 (QA2-F8): always reset the span BEFORE the
            // conditional populate. The pre-fix code only cleared it on
            // the explicit `else` branch — but the entire whySpan handler
            // sits inside the `else if (getBadgeEl && getFocusEl && ...)`
            // → "no milestone flash" branch. On a tick that flips into
            // milestone-flash or scenario-intro, the whySpan kept its
            // prior text indefinitely. Reset-first guarantees the only
            // path that leaves text on screen is the explicit dev-mode
            // populate below.
            whySpan.textContent = "";
            if (!whySpan.hasAttribute?.("hidden")) whySpan.setAttribute?.("hidden", "");
            // v0.8.2 Round-6 Wave-1 01c-ui (Step 1) — only populate the
            // dev-only `#storytellerWhyNoWhisper` span when `body.dev-mode`
            // (or `state.controls.devMode`) is on; casual players never see
            // this engineer-facing string in the topbar. The sibling
            // `#storytellerWhisperBadge` (Step 2) surfaces a friendly
            // tooltip-only fallback for non-dev players.
            const reasonText = devModeOn
              ? (model.diagnostic?.whisperBlockedReasonDev ?? model.diagnostic?.whisperBlockedReason ?? "")
              : "";
            if (devModeOn && model.badgeState !== "llm-live" && reasonText) {
              whySpan.textContent = `Why no WHISPER?: ${reasonText}`;
              if (whySpan.hasAttribute?.("hidden")) whySpan.removeAttribute?.("hidden");
            }
          }
          // v0.8.2 Round-6 Wave-1 01c-ui (Step 1 + Step 2) — casual-mode
          // ⚠ badge: shown only when (a) NOT dev-mode and (b) the
          // storyteller fell back from LLM. The badge's data-tooltip
          // surfaces the in-fiction reason via the global #customTooltip
          // hover handler (no engineer tokens like "LLM" / "proxy"). When
          // dev-mode is on, the badge is hidden and the topbar suffix /
          // span carries the engineer string instead.
          const whisperBadge = document.getElementById("storytellerWhisperBadge");
          if (whisperBadge) {
            const casualReason = String(model.diagnostic?.whisperBlockedReason ?? "").trim();
            const showBadge = !devModeOn
              && model.badgeState !== "llm-live"
              && casualReason.length > 0;
            if (showBadge) {
              const tooltipMsg = `Storyteller fell back to rule-based director — ${casualReason}`;
              whisperBadge.setAttribute?.("data-tooltip", tooltipMsg);
              whisperBadge.setAttribute?.("title", tooltipMsg);
              if (whisperBadge.hasAttribute?.("hidden")) whisperBadge.removeAttribute?.("hidden");
            } else {
              whisperBadge.removeAttribute?.("data-tooltip");
              whisperBadge.removeAttribute?.("title");
              if (!whisperBadge.hasAttribute?.("hidden")) whisperBadge.setAttribute?.("hidden", "");
            }
          }
        }
        // v0.8.2 Round-5 Wave-3 (02e Step 5) — aria-label marker when the
        // summary text is sourced from AUTHOR_VOICE_PACK. Enables test /
        // a11y selectors to confirm voice-pack reach-through.
        if (getSummaryEl) {
          if (model.voicePackHit) {
            getSummaryEl.setAttribute?.("aria-label", "author-voice");
          } else {
            getSummaryEl.removeAttribute?.("aria-label");
          }
        }
        // v0.8.2 Round-5b (02e Step 6a) — LLM-live voice-prefix DOM slot.
        // Dynamically created if #storytellerVoicePrefix is absent in index.html.
        if (typeof document !== "undefined") {
          let voicePrefixEl = document.getElementById("storytellerVoicePrefix");
          if (!voicePrefixEl && this.storytellerStrip) {
            voicePrefixEl = document.createElement("span");
            voicePrefixEl.id = "storytellerVoicePrefix";
            voicePrefixEl.className = "storyteller-voice-prefix";
            voicePrefixEl.setAttribute("aria-label", "author-voice");
            this.storytellerStrip.insertBefore(voicePrefixEl, this.storytellerStrip.firstChild);
          }
          if (voicePrefixEl) {
            const prefixText = (model.voicePackOverlayHit && model.voicePrefixText)
              ? String(model.voicePrefixText) : "";
            if (voicePrefixEl.textContent !== prefixText) voicePrefixEl.textContent = prefixText;
            if (prefixText) {
              if (voicePrefixEl.hasAttribute?.("hidden")) voicePrefixEl.removeAttribute?.("hidden");
            } else {
              if (!voicePrefixEl.hasAttribute?.("hidden")) voicePrefixEl.setAttribute?.("hidden", "");
            }
          }
        }
        }
      } else {
        const text = milestoneFlash?.text ?? computeStorytellerStripText(state);
        if (this.storytellerStrip.textContent !== text) {
          this.storytellerStrip.textContent = text;
          this.storytellerStrip.setAttribute?.("title", text);
        }
      }
    }

    // Mirror storyteller content into the Colony sidebar section (#storytellerSidebarBadge etc.)
    // so players see the storyteller status when the bar strip is hidden.
    if (typeof document !== "undefined") {
      const sidebarBadge = document.getElementById("storytellerSidebarBadge");
      const sidebarFocus = document.getElementById("storytellerSidebarFocus");
      const sidebarSummary = document.getElementById("storytellerSidebarSummary");
      if (sidebarBadge || sidebarFocus || sidebarSummary) {
        const badgeEl = typeof document !== "undefined" ? document.getElementById("storytellerBadge") : null;
        const focusEl = typeof document !== "undefined" ? document.getElementById("storytellerFocus") : null;
        const summaryEl = typeof document !== "undefined" ? document.getElementById("storytellerSummary") : null;
        if (sidebarBadge && badgeEl) {
          sidebarBadge.textContent = badgeEl.textContent;
          if (badgeEl.dataset?.mode !== undefined) sidebarBadge.dataset.mode = badgeEl.dataset.mode;
          else sidebarBadge.setAttribute?.("data-mode", badgeEl.getAttribute?.("data-mode") ?? "idle");
        }
        if (sidebarFocus && focusEl) {
          sidebarFocus.textContent = focusEl.textContent;
        }
        if (sidebarSummary && summaryEl) {
          sidebarSummary.textContent = summaryEl.textContent;
        }
      }
    }

    this.eventVal.textContent = getEventInsight(state);
    this.timeVal.textContent = `${state.metrics.timeSec.toFixed(1)}s`;
    if (this.toolVal) this.toolVal.textContent = state.controls.tool;
    if (this.simVal) {
      const phase = state.session?.phase ?? "menu";
      const mode = phase !== "active" ? "locked" : state.controls.isPaused ? "paused" : "running";
      this.simVal.textContent = `phase=${phase} | ${mode} | steps=${state.metrics.simStepsThisFrame}`;
    }
    if (this.actionVal) {
      const actionKind = state.controls.actionMessage ? (state.controls.actionKind ?? "info") : digest.severity;
      this.actionVal.textContent = state.controls.actionMessage || digest.action || state.gameplay.objectiveHint || frontier.summary;
      this.actionVal.setAttribute("data-kind", actionKind);
    }
    if (this.visualModeVal) {
      const icons = state.controls.showTileIcons ? "icons:on" : "icons:off";
      const sprites = state.controls.showUnitSprites ? "sprites:on" : "sprites:off";
      this.visualModeVal.textContent = `${state.controls.visualPreset} | ${icons} | ${sprites}`;
    }
    const totalAgents = stats.totalEntities;
    if (this.fpsVal) this.fpsVal.textContent = state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(totalAgents);

    // v0.9.2-ui (F14) — append a trend triangle to each resource chip so
    // players can see direction at a glance without opening the Colony
    // panel. ▲ rising / ▼ falling / · stable. Frostpunk reference:
    // resource chips always show current + trend. Rates come from the
    // 3s-window cache (_lastComputedRates, /min). The full breakdown is
    // mirrored into the parent chip's title= (the existing data-tip
    // migrateTitles MO converts that to the styled tooltip).
    const trendRates = this._lastComputedRates ?? null;
    const trendArrow = (rate) => {
      if (rate == null || !Number.isFinite(rate)) return "";
      if (Math.abs(rate) < 0.5) return ` <span class="hud-trend hud-trend-flat" style="opacity:0.5;font-size:0.78em;">·</span>`;
      const tone = rate > 0 ? "#8ebf8e" : "#e07070";
      const glyph = rate > 0 ? "▲" : "▼";
      return ` <span class="hud-trend" style="color:${tone};font-size:0.78em;font-weight:700;">${glyph}</span>`;
    };
    const setChipNumber = (el, value, rate) => {
      if (!el) return;
      // innerHTML over textContent so the trend span renders. The number
      // itself is escaped via Math.floor (always Number).
      if (typeof el !== "object") return;
      try {
        el.innerHTML = `${Math.floor(value)}${trendArrow(rate)}`;
      } catch {
        // Mock nodes in tests may not implement innerHTML setter; fall back.
        el.textContent = String(Math.floor(value));
      }
    };
    setChipNumber(this.statusFood, state.resources.food, trendRates?.food);
    setChipNumber(this.statusWood, state.resources.wood, trendRates?.wood);
    setChipNumber(this.statusStone, state.resources.stone, trendRates?.stone);
    setChipNumber(this.statusHerbs, state.resources.herbs, trendRates?.herbs);
    if (this.statusWorkers) this.statusWorkers.textContent = state.metrics?.populationStats?.workers ?? 0;
    setChipNumber(this.statusMeals, state.resources.meals, trendRates?.meals);
    setChipNumber(this.statusTools, state.resources.tools, trendRates?.tools);
    setChipNumber(this.statusMedicine, state.resources.medicine, trendRates?.medicine);

    // v0.9.2-ui (F14) — mirror full breakdown into the parent chip's title.
    // hudFood / hudWood / hudStone / hudHerbs are the outer containers in
    // index.html (lines 1888-1956). Existing static title= attributes are
    // preserved and prefixed with the live rate snippet.
    const formatTrend = (rate) => {
      if (rate == null || !Number.isFinite(rate)) return "rate: —";
      if (Math.abs(rate) < 0.05) return "rate: ≈ 0/min";
      return rate >= 0 ? `rate: ▲ +${rate.toFixed(1)}/min` : `rate: ▼ ${rate.toFixed(1)}/min`;
    };
    const setChipTitle = (el, rate) => {
      if (!el || typeof el.setAttribute !== "function") return;
      const trend = formatTrend(rate);
      const stored = el.dataset?.baseTitle ?? null;
      const base = stored != null ? stored : (el.getAttribute?.("title") || "");
      if (stored == null && el.dataset) {
        try { el.dataset.baseTitle = base; } catch { /* dataset write may fail in mocks */ }
      }
      el.setAttribute("title", `${base}\n${trend}`);
    };
    setChipTitle(this.hudFood, trendRates?.food);
    setChipTitle(this.hudWood, trendRates?.wood);
    setChipTitle(this.hudStone, trendRates?.stone);
    setChipTitle(this.hudHerbs, trendRates?.herbs);
    if (this.statusProsperity) this.statusProsperity.textContent = (state.gameplay?.prosperity ?? 0).toFixed(0);
    if (this.statusThreat) this.statusThreat.textContent = (state.gameplay?.threat ?? 0).toFixed(0);

    const foodPct = Math.min(100, (state.resources.food / 120) * 100);
    const woodPct = Math.min(100, (state.resources.wood / 120) * 100);
    const stonePct = Math.min(100, (state.resources.stone / 80) * 100);
    const herbsPct = Math.min(100, (state.resources.herbs / 50) * 100);
    const prosperityPct = Math.min(100, state.gameplay?.prosperity ?? 0);
    const threatPct = Math.min(100, state.gameplay?.threat ?? 0);

    if (this.statusFoodBar) this.statusFoodBar.style.width = `${foodPct}%`;
    if (this.statusWoodBar) this.statusWoodBar.style.width = `${woodPct}%`;
    if (this.statusStoneBar) this.statusStoneBar.style.width = `${stonePct}%`;
    if (this.statusHerbsBar) this.statusHerbsBar.style.width = `${herbsPct}%`;
    if (this.statusProsperityBar) this.statusProsperityBar.style.width = `${prosperityPct}%`;
    if (this.statusThreatBar) this.statusThreatBar.style.width = `${threatPct}%`;

    if (this.hudFood) this.hudFood.setAttribute("data-urgency", state.resources.food < 20 ? "low" : "");
    if (this.hudWood) this.hudWood.setAttribute("data-urgency", state.resources.wood < 15 ? "low" : "");
    if (this.hudWorkers) this.hudWorkers.setAttribute("data-urgency", (state.metrics?.populationStats?.workers ?? 0) <= 3 ? "low" : "");

    if (this.aiAutopilotChip) {
      // v0.8.2 Round-6 Wave-1 (01c-ui Step 4) — pass dev-mode flag so the
      // chip text strips "next policy in 9.8s" / "LLM offline — DIRECTOR"
      // for casual players. Tooltip (`title`) still carries the verbose
      // copy for hover.
      const status = getAutopilotStatus(state, { devMode: isDevMode(state) });
      this.aiAutopilotChip.textContent = status.text;
      this.aiAutopilotChip.setAttribute?.("data-mode", status.dataMode);
      this.aiAutopilotChip.setAttribute?.("data-ai-mode", status.aiMode);
      this.aiAutopilotChip.setAttribute?.("data-coverage", status.coverageTarget);
      this.aiAutopilotChip.setAttribute?.("title", status.title);
      if (status.struggling) {
        this.aiAutopilotChip.setAttribute?.("data-kind", "warn");
      } else {
        this.aiAutopilotChip.removeAttribute?.("data-kind");
      }
    }
    if (this.aiToggleTop) this.aiToggleTop.checked = Boolean(state.ai?.enabled);
    if (this.aiToggleMirror) this.aiToggleMirror.checked = Boolean(state.ai?.enabled);

    if (this.statusObjective) {
      // v0.8.0 Phase 4 — Survival Mode badge. Shows
      // "Survived HH:MM:SS  Score N · Dev D/100" once DevIndex is live.
      // v0.8.2 Round-0 01b (P1): freeze the visible ticker when the session is
      // not active so the menu/end overlays don't create the illusion that the
      // simulation is still running behind them.
      const totalSec = Math.max(0, Math.floor(Number(state.metrics?.timeSec ?? 0)));
      const inActive = state.session?.phase === "active" && totalSec > 0;
      // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 4) — keep the final
      // score visible while the end overlay is up so reviewers can see
      // their result before the boot screen takes over. `inEnd` flips on
      // for the entire end-phase duration; the suffix " · final" makes the
      // freeze-state explicit (no fake-running impression). statusBar is
      // hidden by GameStateOverlay during overlay-visible frames anyway
      // (see GameStateOverlay.render :statusBar.style.display="none") so
      // this only matters in the brief gap before the overlay paints.
      const inEnd = state.session?.phase === "end" && totalSec > 0;
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const ss = String(s).padStart(2, "0");
      const timeText = (inActive || inEnd) ? `${hh}:${mm}:${ss}` : "--:--:--";
      const finalScore = Math.floor(Number(state.metrics?.survivalScore ?? 0));
      const score = inActive
        ? finalScore
        : inEnd ? finalScore : "\u2014";
      const devTicks = Number(state.gameplay?.devIndexTicksComputed ?? 0);
      const devScore = Math.round(Number(state.gameplay?.devIndexSmoothed ?? 0));
      const devSuffix = (inActive || inEnd) && devTicks > 0 ? `  \u00b7  Dev ${devScore}/100` : "";
      const finalSuffix = inEnd ? "  \u00b7  final" : "";
      const objectiveText = `Survived ${timeText}  Score ${score}${devSuffix}${finalSuffix}`;
      const casualMode = isCasualMode();
      const scoreTitle = buildSurvivalScoreTooltip(state, casualMode);
      const devTitle = buildDevIndexTooltip(state, casualMode);
      if (this.statusObjectiveTime && this.statusObjectiveScore && this.statusObjectiveDev) {
        // v0.10.1-n (A7-rationality-audit R1) — chip text "Survived HH:MM:SS"
        // → "Run HH:MM:SS" so the player can distinguish it from the day-cycle
        // clock (e.g. "6:00 Day 1") elsewhere on screen. Hover title still
        // says "Survival time and running score" (index.html:2336). The
        // legacy combined `statusObjective` fallback (line ~1647) keeps the
        // "Survived ..." literal for backwards-compat tests.
        this.statusObjectiveTime.textContent = `Run ${timeText}`;
        // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 4) — append " · final"
        // suffix on the Score chip when the run has ended so reviewers see
        // their final number instead of an em-dash.
        const scoreSuffix = inEnd && !casualMode ? " \u00b7 final" : "";
        this.statusObjectiveScore.textContent = `Score ${score}${scoreSuffix}`;
        this.statusObjectiveScore.setAttribute?.("title", scoreTitle);
        // v0.8.2 Round-5 Wave-2 (01c-ui Step 4): append a `weakest: <dim>
        // <value>` suffix when Dev < 50 and one dimension lags > 8 points
        // below the overall score. Surfaces the "what do I fix next" signal
        // that was previously only visible in the tooltip. Casual-mode UI
        // falls back to pure `Dev N/100`.
        let devText = (inActive || inEnd) && devTicks > 0 ? `Dev ${devScore}/100` : "Dev --/100";
        if (!casualMode && inActive && devTicks > 0) {
          const dims = state.gameplay?.devIndexDims ?? {};
          let weakestKey = null;
          let weakestValue = Number.POSITIVE_INFINITY;
          for (const [key, rawValue] of Object.entries(dims)) {
            const v = Number(rawValue);
            if (!Number.isFinite(v)) continue;
            if (v < weakestValue) {
              weakestValue = v;
              weakestKey = key;
            }
          }
          if (weakestKey && Number.isFinite(weakestValue) && weakestValue < devScore - 8) {
            devText = `Dev ${devScore}/100 · weakest: ${weakestKey} ${Math.round(weakestValue)}`;
          }
        }
        this.statusObjectiveDev.textContent = devText;
        // v0.8.2 Round-5b (02e Step 6b) — author-tone tooltip on Dev KPI.
        const devTone = buildAuthorToneLabel("dev", devScore);
        const devTitleWithTone = devTone.label ? `${devTitle}\n${devTone.label}` : devTitle;
        this.statusObjectiveDev.setAttribute?.("title", devTitleWithTone);
        if (casualMode && inActive && devTicks > 0 && devTone.label) {
          this.statusObjectiveDev.textContent = `${devText} \u2014 ${devTone.label}`;
        }
        // author-tone tooltip on Score KPI
        const rawScore = Number(state.metrics?.survivalScore ?? 0);
        const scoreTone = buildAuthorToneLabel("score", rawScore);
        if (scoreTone.label && this.statusObjectiveScore) {
          const scoreTitleWithTone = `${scoreTitle}\n${scoreTone.label}`;
          this.statusObjectiveScore.setAttribute?.("title", scoreTitleWithTone);
        }
        // author-tone tooltip on Threat KPI (if element exists)
        if (typeof document !== "undefined") {
          const threatEl = document.getElementById("statusObjectiveThreat");
          if (threatEl) {
            const threat = Number(state.gameplay?.threat ?? 0);
            const threatTone = buildAuthorToneLabel("threat", threat);
            if (threatTone.label) {
              const existingTitle = threatEl.getAttribute?.("title") ?? "";
              if (!existingTitle.includes(threatTone.label)) {
                threatEl.setAttribute?.("title", `${existingTitle}\n${threatTone.label}`.trim());
              }
            }
          }
        }
      } else {
        this.statusObjective.textContent = objectiveText;
      }
      // Round 2 01b: keep Score and Dev as separate hover targets while the
      // wrapper carries the combined title for legacy tests and narrow DOMs.
      this.statusObjective.setAttribute?.("title", `${scoreTitle} | ${devTitle}`);
    }
    // v0.8.2 Round-0 02c-speedrunner (Step 5) — Compact scenario-progress
    // ribbon. Surfaces the `scenario.targets` counts (routes/depots/wh/farms/
    // lumbers/walls) that were previously only visible in the Debug panel so
    // the HUD shows the causal chain between "what the scenario wants" and
    // "what Score rewards". Survival-mode returns "endless · no active
    // objectives"; see WorldExplain.getScenarioProgressCompact.
    if (this.statusScenario) {
      // v0.8.2 Round-1 02b-casual (Step 6) — Casual profile shows the
      // human-readable "2 of 5 supply routes open" variant. Dev profile keeps
      // the original terse "routes 2/5 · wh 5/2 · ..." tokens that downstream
      // debug tools and tests depend on.
      const uiProfile = this.state.controls?.uiProfile ?? "casual";
      if (uiProfile === "casual") {
        this.#renderGoalChips(
          scenarioGoalChips(state),
          getScenarioProgressCompactCasual(state),
        );
      } else {
        this.statusScenario.classList?.remove("hud-goal-list");
        const text = getScenarioProgressCompact(state);
        this.statusScenario.textContent = text;
        this.statusScenario.setAttribute?.("title", text);
      }
    }
    // v0.8.2 Round-0 02c-speedrunner (Step 5b) — Per-rule score breakdown.
    // Renders BALANCE.survivalScorePerSecond/perBirth/perDeath alongside
    // running subtotals from metrics.timeSec/birthsTotal/deathsTotal so the
    // player can map HUD actions → score deltas without opening Debug.
    // v0.8.2 Round-1 01c-ui — JS gate mirrors the CSS `.dev-only` gate on
     // #statusScoreBreak. In casual profile we clear textContent/title so AT
     // tools (screen readers, devtools Accessibility tree) never expose the
     // dev-debug "+1/s · +5/birth · -10/death (lived X · births Y · deaths -Z)"
     // copy that CSS hides visually. Dev profile still renders full breakdown.
    if (this.statusScoreBreak) {
      const bodyClassList = globalThis.document?.body?.classList;
      const casualMode = bodyClassList?.contains?.("casual-mode") ?? false;
      if (casualMode) {
        this.statusScoreBreak.textContent = "";
        this.statusScoreBreak.setAttribute?.("title", "");
      } else {
        const br = getSurvivalScoreBreakdown(state);
        const rules = `+${br.perSec}/s · +${br.perBirth}/birth · -${br.perDeath}/death`;
        const subtotals = `lived ${br.subtotalSec} · births ${br.subtotalBirths} · deaths -${br.subtotalDeaths}`;
        const text = `${rules} (${subtotals})`;
        this.statusScoreBreak.textContent = text;
        this.statusScoreBreak.setAttribute?.("title", text);
      }
    }
    // v0.8.2 Round-0 02e-indie-critic — render scenario headline in statusBar.
    // Pulls `scenario.title` + `scenario.summary` (same copy reviewer praised
    // on the pre-game menu) and mirrors it into #statusScenarioHeadline. We
    // only touch the DOM when the text changes to avoid layout thrash, and
    // hide the node outright when there is no active scenario (Quick Start).
    this.#renderNextAction(state);
    // v0.8.2 Round-7 (01e+02b) — Most-urgent resource ETA indicator.
    // When any tracked resource will run out within 120s, show a warning
    // in the storyteller strip (or #statusObjective if available) so manual
    // players see the countdown even when autopilot is off.
    this.#renderUrgentResourceEta(state);
    // v0.8.2 Round-7 01a — food crisis pulse on statusFood chip.
    const foodEta = state.metrics?.resourceEmptySec?.food;
    if (foodEta > 0 && foodEta <= 120) {
      this.statusFood?.classList.add('hud-critical-pulse');
    } else {
      this.statusFood?.classList.remove('hud-critical-pulse');
    }
    // v0.8.2 Round-5b Wave-1 (01a Step 3+5) — mount new status slots.
    this.#renderBuildHint(state);
    this.#renderAutopilotCrisis(state);
    if (this.statusScenarioHeadline) {
      const scenario = state?.gameplay?.scenario ?? {};
      const title = String(scenario.title ?? "").trim();
      const summary = String(scenario.summary ?? "").trim();
      let headline;
      if (title && summary) headline = `${title} — ${summary}`;
      else if (title) headline = title;
      else headline = "";
      if (headline !== this._lastScenarioHeadlineText) {
        if (headline) {
          this.statusScenarioHeadline.textContent = headline;
          this.statusScenarioHeadline.setAttribute("title", headline);
          this.statusScenarioHeadline.hidden = false;
        } else {
          this.statusScenarioHeadline.textContent = "";
          this.statusScenarioHeadline.setAttribute("title", "Current scenario briefing");
          this.statusScenarioHeadline.hidden = true;
        }
        this._lastScenarioHeadlineText = headline;
      }
    }
    if (this.statusAction) {
      if (state.controls.actionMessage) {
        // v0.8.2 Round-7 01b: skip DOM thrash for repeated error messages
        // (error chips stay visible until cleared; no need to re-apply the same text).
        if (state.controls.actionKind === "error" && state.controls.actionMessage === this.lastActionMessage) {
          // no-op: already showing this error
        } else {
        this.statusAction.textContent = state.controls.actionMessage;
        // v0.8.2 Round-0 01d — mirror textContent into the native `title`
        // attribute so the browser tooltip shows the full message even when
        // ellipsis truncates the visible text (40-char cap at max-width 420px).
        this.statusAction.setAttribute("title", state.controls.actionMessage);
        this.statusAction.style.opacity = "1";
        this.statusAction.style.background = state.controls.actionKind === "error" ? "rgba(244,67,54,0.3)" : "rgba(76,175,80,0.3)";
        this.statusAction.style.color = state.controls.actionKind === "error" ? "#ff8a80" : "#a5d6a7";
        // v0.8.2 Round-0 01b — pulse the status-bar action chip whenever the
        // message text changes, so eye-gazes anchored on the canvas still
        // register the feedback channel. Only triggered on value transitions
        // (not every render); compact-mode CSS neutralises the scale pulse.
        if (this.lastActionMessage !== state.controls.actionMessage) {
          try {
            // Classic "retrigger animation" trick: remove, force reflow, re-add.
            this.statusAction.classList?.remove("flash-action");
            // Reading offsetWidth forces a reflow so the keyframe restarts.
            void this.statusAction.offsetWidth;
            this.statusAction.classList?.add("flash-action");
          } catch (_err) {
            // Headless test nodes may not implement classList; ignore.
          }
          this.lastActionMessage = state.controls.actionMessage;
        }
        } // end else (not repeated error)
      } else {
        this.statusAction.setAttribute("title", "");
        this.statusAction.style.opacity = "0";
        this.lastActionMessage = "";
      }
    }

    if (state.ai.lastEnvironmentError || state.ai.lastPolicyError) {
      const envErr = state.ai.lastEnvironmentError ? `env=${state.ai.lastEnvironmentError}` : "";
      const policyErr = state.ai.lastPolicyError ? `policy=${state.ai.lastPolicyError}` : "";
      const errorText = [envErr, policyErr].filter(Boolean).join(" | ");
      this.warningVal.textContent = `AI: ${errorText}`;
      this.warningVal.setAttribute("data-kind", "error");
    } else if (state.metrics.proxyHealth === "down") {
      this.warningVal.textContent = "AI proxy is unreachable; running fallback.";
      this.warningVal.setAttribute("data-kind", "error");
    } else if (latestWarningEvent?.level === "error" && latestWarningText) {
      this.warningVal.textContent = latestWarningText;
      this.warningVal.setAttribute("data-kind", "error");
    } else if (traffic.hasHotspots) {
      this.warningVal.textContent = digest.warning || traffic.summary;
      this.warningVal.setAttribute("data-kind", digest.severity === "error" ? "error" : "info");
    } else if (latestWarningText && !shouldSuppressUserWarning(latestWarningEvent, latestWarningText)) {
      this.warningVal.textContent = latestWarningText;
      this.warningVal.setAttribute("data-kind", "info");
    } else {
      this.warningVal.textContent = digest.warning || logistics || frontier.summary;
      this.warningVal.setAttribute("data-kind", digest.severity === "error" ? "error" : "info");
    }

    if (this.gameTimer) {
      const totalSec = Math.floor(state.metrics.timeSec ?? 0);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.gameTimer.textContent = `${min}:${sec.toString().padStart(2, "0")}`;
    }
    const paused = state.controls.isPaused;
    const fast = (state.controls.timeScale ?? 1) > 1.2;
    this.speedPauseBtn?.classList.toggle("active", paused);
    this.speedPlayBtn?.classList.toggle("active", !paused && !fast);
    this.speedFastBtn?.classList.toggle("active", fast && !paused);
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5e) — ultra (8x) tier
    // active-class. Threshold 7 keeps a small dead-band so a 6x request
    // still highlights speedFastBtn rather than splitting the highlight.
    const ultra = (state.controls.timeScale ?? 1) >= 7;
    this.speedUltraBtn?.classList.toggle("active", ultra && !paused);
    if (this.timeScaleActualLabel) {
      const requested = Number(state.controls.timeScale ?? 1);
      const actual = Number(state.metrics.timeScaleActualWall ?? state.metrics.timeScaleActual ?? requested);
      const cap = state.metrics.performanceCap ?? {};
      const showLabel = fast && !paused && (cap.active || Math.abs(actual - requested) > 0.2);
      this.timeScaleActualLabel.style.display = showLabel ? "" : "none";
      if (showLabel) {
        this.timeScaleActualLabel.textContent = cap.active
          ? `target ×${requested.toFixed(1)} / running ×${actual.toFixed(1)} (capped)`
          : `target ×${requested.toFixed(1)} / running ×${actual.toFixed(1)}`;
        this.timeScaleActualLabel.title = cap.reason || "Actual wall-clock simulation speed.";
      }
    }

    // v0.8.2 Round-1 01a-onboarding — append glossary tooltips to abbreviated
    // HUD nodes exactly once per HUDController instance. Placed at the end of
    // render() so any Round-0 title set earlier in this frame is preserved as
    // the prefix and the glossary copy is appended after " | ".
    this.#applyGlossaryTooltips();

    this.#renderRunoutHints(state);
    // Colony Health Card — live status summary at top of Colony panel.
    this.#updateColonyHealthCard(state);
    // v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 4) — Author Voice ticker.
    // Pinned below the HUD topbar; renders the latest salient eventTrace beat
    // from `extractLatestNarrativeBeat` with a 4-second dwell + ring-buffer.
    this.#renderAuthorTicker(state);
    // v0.10.1-hotfix-batchC (issue #1) — re-evaluate top-bar overflow after
    // chip text/visibility may have changed this frame. The ResizeObserver
    // already handles viewport / sidebar width changes; this catches the
    // case where the bar's content width grew (e.g. autopilot string
    // expanded) without the bar itself resizing.
    try { this.#applyStatusBarOverflowPriority(); } catch (_err) { /* defensive */ }
  }

  // v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 4) — Author Voice ticker.
  //
  // Reads the latest salient narrative beat from `state.debug.eventTrace`
  // (via the existing extractor — same data source as #storytellerBeat) and
  // pushes it into a 3-entry ring buffer. The visible entry rotates only
  // after `_tickerDwellMs` (4s) has elapsed, so friendship beats — which
  // fire 5-10× more often than sabotage — don't spam the strip.
  //
  // Hides the strip element entirely (`hidden` attr + `display:none` CSS)
  // when (a) no beat is available, (b) dev-mode is on (DeveloperPanel
  // surfaces eventTrace directly so the ticker is redundant), or (c) the
  // strip element is missing from the DOM (test rigs).
  #renderAuthorTicker(state) {
    const strip = this.authorTickerStrip;
    if (!strip) return;
    const inDevMode = isDevMode(state);
    if (inDevMode) {
      // dev-mode also hides via CSS, but eagerly drop the visible class +
      // clear text so a transition from casual→dev mid-session doesn't leave
      // a stale beat painted under DeveloperPanel.
      strip.classList?.remove?.("visible");
      strip.setAttribute?.("hidden", "");
      return;
    }
    const beat = extractLatestNarrativeBeat(state);
    const formatted = formatBeatTextWithKind(beat);
    if (!formatted) {
      strip.classList?.remove?.("visible");
      strip.setAttribute?.("hidden", "");
      return;
    }
    const nowMs = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now();
    // Ring-buffer push: only enqueue when the incoming text differs from the
    // most recent ring entry (so the same beat doesn't fill all 3 slots).
    if (this._tickerRing[0] !== formatted.text) {
      this._tickerRing.unshift(formatted.text);
      if (this._tickerRing.length > this._tickerRingCap) {
        this._tickerRing.length = this._tickerRingCap;
      }
    }
    // Dwell gate: hold the current rendered text for `_tickerDwellMs` before
    // accepting a new one. First-paint (lastShownAt === 0) bypasses the gate
    // so the player sees the very first beat immediately.
    let nextText = this._tickerCurrentText;
    let nextKind = this._tickerCurrentKind;
    if (!nextText) {
      nextText = formatted.text;
      nextKind = formatted.kind;
      this._tickerCurrentText = nextText;
      this._tickerCurrentKind = nextKind;
      this._tickerLastShownAt = nowMs;
    } else if (formatted.text !== this._tickerCurrentText
        && (nowMs - this._tickerLastShownAt) >= this._tickerDwellMs) {
      nextText = formatted.text;
      nextKind = formatted.kind;
      this._tickerCurrentText = nextText;
      this._tickerCurrentKind = nextKind;
      this._tickerLastShownAt = nowMs;
    }
    if (this.authorTickerIcon) {
      const icon = formatted.icon;
      if (this.authorTickerIcon.textContent !== icon) {
        this.authorTickerIcon.textContent = icon;
      }
    }
    if (this.authorTickerText) {
      if (this.authorTickerText.textContent !== nextText) {
        this.authorTickerText.textContent = nextText;
      }
    } else if (strip.textContent !== nextText) {
      // Fallback when the test DOM didn't include the icon/text spans.
      strip.textContent = nextText;
    }
    if (strip.dataset) {
      if (strip.dataset.kind !== nextKind) strip.dataset.kind = nextKind;
    } else {
      strip.setAttribute?.("data-kind", nextKind);
    }
    if (strip.hasAttribute?.("hidden")) strip.removeAttribute?.("hidden");
    strip.classList?.add?.("visible");
  }

  /**
   * Update the Colony Health Card at the top of the Colony panel.
   * Shows badge (THRIVING/STABLE/STRUGGLING/CRISIS), current day,
   * food rate, idle worker count, and threat level.
   */
  #renderRateBreakdown(resource, state) {
    const node = this[`${resource}RateBreakdown`];
    if (!node) return;
    const m = state.metrics ?? {};
    const prod = Number(m[`${resource}ProducedPerMin`] ?? 0);
    const cons = Number(m[`${resource}ConsumedPerMin`] ?? 0);
    const spoil = resource === "food" ? Number(m.foodSpoiledPerMin ?? m.foodSpoiled ?? 0) : 0;
    const parts = [];
    if (prod > 0.05) parts.push(`prod +${prod.toFixed(0)}`);
    if (cons > 0.05) parts.push(`cons -${cons.toFixed(0)}`);
    if (spoil > 0.05) parts.push(`spoil -${spoil.toFixed(0)}`);
    node.textContent = parts.length > 0 ? `(${parts.join(" / ")})` : "(sampling…)";
  }

  #renderRunoutHints(state) {
    const m = state.metrics ?? {};
    const res = state.resources ?? {};
    for (const resource of ["food", "meals", "herbs", "medicine", "tools", "stone"]) {
      const hintNode = this[`${resource}RunoutHint`];
      if (!hintNode) continue;
      const produced = Number(m[`${resource}ProducedPerMin`] ?? 0);
      const consumed = Number(m[`${resource}ConsumedPerMin`] ?? 0);
      const stock = Number(res[resource] ?? 0);
      const netPerSec = (produced - consumed) / 60;
      if (netPerSec >= -0.02 || stock <= 0) {
        hintNode.textContent = "";
        hintNode.className = "runout-hint";
        this._lastRunoutSmoothed[resource] = undefined;
        continue;
      }
      const rawRunout = stock / -netPerSec;
      const prev = this._lastRunoutSmoothed[resource];
      const smoothed = prev === undefined ? rawRunout : prev * 0.7 + rawRunout * 0.3;
      this._lastRunoutSmoothed[resource] = smoothed;
      if (smoothed >= 180) {
        hintNode.textContent = "";
        hintNode.className = "runout-hint";
        continue;
      }
      const minutes = Math.floor(smoothed / 60);
      const seconds = Math.floor(smoothed % 60);
      hintNode.textContent = `\u2248 ${minutes}m ${seconds}s until empty`;
      hintNode.className = smoothed < 60 ? "runout-hint warn-critical" : "runout-hint warn-soon";
      // v0.8.2 Round-7 audio — play food crisis sound (throttled in AudioSystem).
      if (smoothed < 60 && resource === "food") {
        audioSystem.onFoodCritical(
          typeof performance !== "undefined" ? performance.now() / 1000 : 0,
        );
      }
      // v0.8.2 Round-7 02a — push warn-critical runout to objectiveLog (45s dedup).
      if (smoothed < 60) {
        const logKey = resource;
        this._runoutLoggedAt ??= {};
        const lastLogged = this._runoutLoggedAt[logKey] ?? -Infinity;
        const nowSec = Number(state.metrics?.timeSec ?? 0);
        if (nowSec - lastLogged > 45) {
          this._runoutLoggedAt[logKey] = nowSec;
          if (state.gameplay && Array.isArray(state.gameplay.objectiveLog)) {
            state.gameplay.objectiveLog.unshift(`[${nowSec.toFixed(1)}s] Warning: ${resource} nearly depleted (< 60s)`);
            state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
          }
        }
      }
    }
  }

  #updateColonyHealthCard(state) {
    const card = typeof document !== "undefined"
      ? document.getElementById("colonyHealthCard")
      : null;
    if (!card) return;

    const badge = document.getElementById("colonyHealthBadge");
    const dayEl = document.getElementById("colonyHealthDay");
    const foodRateEl = document.getElementById("healthFoodRate");
    const idleEl = document.getElementById("healthWorkerIdle");
    const threatEl = document.getElementById("healthThreatLevel");

    const threat = Number(state.gameplay?.threat ?? 0);
    const timeSec = Number(state.metrics?.timeSec ?? 0);

    // Determine status tier
    let status;
    if (threat < 20) status = "thriving";
    else if (threat < 50) status = "stable";
    else if (threat < 70) status = "struggling";
    else status = "crisis";

    const badgeText = status.charAt(0).toUpperCase() + status.slice(1).toUpperCase()
      .replace("THRIVING", "THRIVING")
      .replace("STABLE", "STABLE")
      .replace("STRUGGLING", "STRUGGLING")
      .replace("CRISIS", "CRISIS");

    // Day calculation — approximate using 60 sim-seconds per day
    const day = Math.max(1, Math.floor(timeSec / 60) + 1);

    // Food rate from cached computed rates (set earlier in render())
    const rates = this._lastComputedRates;
    let foodRateText = "Food: —/min";
    if (rates && Number.isFinite(rates.food)) {
      const r = rates.food;
      if (Math.abs(r) < 0.05) foodRateText = "Food: +0/min";
      else foodRateText = r >= 0 ? `Food: +${r.toFixed(0)}/min` : `Food: ${r.toFixed(0)}/min`;
    }

    // Idle worker count — workers in IDLE state
    let idleCount = 0;
    if (Array.isArray(state.agents)) {
      for (const a of state.agents) {
        if (a && a.alive && a.type === "WORKER" && (a.state === "IDLE" || a.intent === "idle")) {
          idleCount++;
        }
      }
    }

    // Apply to DOM
    if (card.dataset) card.dataset.status = status;
    else card.setAttribute("data-status", status);
    if (badge) badge.textContent = status.toUpperCase();
    if (dayEl) dayEl.textContent = `Day ${day}`;
    if (foodRateEl) foodRateEl.textContent = foodRateText;
    if (idleEl) idleEl.textContent = `${idleCount} idle`;
    // v0.10.1-r3-A7 P1 #7 — anchor the Threat percent to its consequence so
    // a bare "50%" reads as actionable rather than abstract. The 80% raid
    // mark is the BalanceCritic-published escalator inflection; surfacing it
    // here lets the player frame the current value against a known event.
    if (threatEl) threatEl.textContent = `Threat ${Math.round(threat)}% (raid at 80%)`;
  }
}
