import { worldToTile } from "../../world/grid/Grid.js";
import { getCausalDigest, getEntityInsight } from "../interpretation/WorldExplain.js";
import { humaniseInsightLine, humaniseGroupVoice } from "../interpretation/EntityVoice.js";

function fmtNum(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function fmtSec(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n >= 0 ? `${n.toFixed(1)}s` : "-";
}

function vecFmt(x = 0, z = 0) {
  return `(${fmtNum(x, 2)}, ${fmtNum(z, 2)})`;
}

export function relationLabel(opinion) {
  const n = Number(opinion);
  if (!Number.isFinite(n)) return "Acquaintance";
  if (n >= 0.45) return "Close friend";
  if (n >= 0.15) return "Friend";
  if (n >= -0.15) return "Acquaintance";
  if (n > -0.45) return "Strained";
  return "Rival";
}

export function formatRelationOpinion(opinion) {
  const n = Number(opinion);
  const value = Number.isFinite(n) ? n : 0;
  return `${relationLabel(value)} (${value >= 0 ? "+" : ""}${fmtNum(value, 2)})`;
}

export const TRAIT_DESC = Object.freeze({
  hardy: "bad weather morale loss is reduced",
  social: "rest drains slower; close friends restore rest",
  efficient: "shorter work cycles",
  resilient: "extra survival margin in crises",
  swift: "15% faster movement",
  careful: "slower travel; more deliberate work cycles",
});

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function foodSourceLabel(sourceType) {
  switch (String(sourceType ?? "none")) {
    case "carry":
      return "carried food";
    case "warehouse":
      return "warehouse food";
    case "nearby-farm":
      return "nearby farm food";
    case "none":
      return "no source";
    default:
      return String(sourceType ?? "unknown");
  }
}

function formatFoodReject(reject) {
  if (!reject || typeof reject !== "object") return "";
  const requested = String(reject.requestedState ?? "state");
  const reason = String(reject.reason ?? "not feasible");
  const source = String(reject.source ?? "planner");
  return `${source} rejected ${requested}: ${reason}`;
}

export function buildFoodDiagnosis(entity, state = {}) {
  const deathContext = entity?.deathContext && typeof entity.deathContext === "object"
    ? entity.deathContext
    : null;
  const debug = entity?.debug ?? {};
  const reject = deathContext?.lastFeasibilityReject
    ?? entity?.blackboard?.lastFeasibilityReject
    ?? debug.feasibilityReject
    ?? null;
  const reachableFood = typeof deathContext?.nutritionReachable === "boolean"
    ? deathContext.nutritionReachable
    : (typeof deathContext?.reachableFood === "boolean"
      ? deathContext.reachableFood
      : (typeof debug.reachableFood === "boolean" ? debug.reachableFood : null));
  const sourceType = String(deathContext?.nutritionSourceType ?? debug.nutritionSourceType ?? "unknown");
  const storedFood = finiteNumber(state?.resources?.food, 0);
  const storedMeals = finiteNumber(state?.resources?.meals, 0);
  const carryFood = finiteNumber(entity?.carry?.food, 0);
  const warehouses = finiteNumber(state?.buildings?.warehouses, 0);
  const farms = finiteNumber(state?.buildings?.farms, 0);
  const hunger = Number(entity?.hunger);
  const starvationSec = finiteNumber(
    deathContext?.starvationSecAtDeath ?? entity?.starvationSec,
    0,
  );
  const isStarvationDeath = entity?.alive === false
    && String(deathContext?.reason ?? entity?.deathReason ?? "") === "starvation";
  const hasFoodStock = storedFood + storedMeals > 0;
  const rejectText = formatFoodReject(reject);
  const rejectMentionsFood = /food|eat|ration|nutrition/i.test(rejectText);

  let cause = "Food status is stable.";
  let next = "No action needed unless hunger starts falling.";
  let severity = "ok";

  if (isStarvationDeath) {
    severity = "critical";
    cause = reachableFood === false
      ? `Died of starvation with ${foodSourceLabel(sourceType)} reachable=false.`
      : `Died of starvation after ${fmtSec(starvationSec)} below the survival line.`;
    next = hasFoodStock && warehouses > 0
      ? "Repair the route to a warehouse or add a closer warehouse before this happens again."
      : "Restore stored food first, then connect farms and warehouses so workers can reach it.";
  } else if (carryFood > 0 && Number.isFinite(hunger) && hunger < 0.2) {
    severity = "warn";
    cause = `Carrying ${fmtNum(carryFood, 1)} food, but hunger is still critical.`;
    next = "Let the worker finish or interrupt into eating; check task locks if hunger keeps falling.";
  } else if (!hasFoodStock && carryFood <= 0) {
    severity = Number.isFinite(hunger) && hunger < 0.35 ? "critical" : "warn";
    cause = farms > 0
      ? "Stored food is 0; farms exist but food is not in the stockpile."
      : "Stored food is 0 and there is no carried food.";
    next = farms > 0
      ? "Assign/unstick farmers and haulers, then connect farms to a warehouse."
      : "Build or recover food production before adding more population.";
  } else if (warehouses <= 0 && hasFoodStock) {
    severity = "critical";
    cause = "Food exists, but there is no warehouse access point.";
    next = "Build or reconnect a warehouse so workers have a reachable eating target.";
  } else if (reachableFood === false) {
    severity = "critical";
    cause = hasFoodStock
      ? "Food exists, but this worker has no reachable nutrition source."
      : "No reachable nutrition source was found.";
    next = warehouses > 0
      ? "Repair roads/bridges or remove blockers between the worker and warehouse."
      : "Add a warehouse or a close farm source near the worker.";
  } else if (rejectMentionsFood) {
    severity = "warn";
    cause = rejectText;
    next = "Fix that precondition, then watch whether the worker enters eat/seek food.";
  } else if (reachableFood === true) {
    severity = Number.isFinite(hunger) && hunger < 0.25 ? "warn" : "ok";
    cause = `${foodSourceLabel(sourceType)} is reachable.`;
    next = Number.isFinite(hunger) && hunger < 0.25
      ? "Wait for the eat task; if hunger keeps falling, inspect task lock and threshold timing."
      : "No immediate food-routing action needed.";
  } else if (Number.isFinite(hunger) && hunger < 0.35) {
    severity = "warn";
    cause = "Hunger is low, but reachability has not been checked yet.";
    next = "Confirm warehouse/farm reachability if this worker does not switch to eating soon.";
  }

  return {
    severity,
    cause,
    next,
    facts: `stock food=${fmtNum(storedFood, 1)}, meals=${fmtNum(storedMeals, 1)}, carry=${fmtNum(carryFood, 1)}, warehouses=${fmtNum(warehouses, 0)}, farms=${fmtNum(farms, 0)}, source=${foodSourceLabel(sourceType)}, reachable=${reachableFood === null ? "unknown" : String(reachableFood)}, starvation=${fmtSec(starvationSec)}`,
    reject: rejectText,
  };
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export const ENTITY_FOCUS_GROUP_ORDER = Object.freeze([
  "starving",
  "hungry",
  "blocked",
  "idle",
  "hauling",
  "combat",
  "other",
]);

const ENTITY_FOCUS_ROW_SORT_ORDER = Object.freeze([
  "starving",
  "hungry",
  "blocked",
  "combat",
  "hauling",
  "idle",
  "other",
]);

const ENTITY_FOCUS_GROUP_META = Object.freeze({
  // v0.8.7 T3-1 (QA2-F1): rename to "Critical hunger" so the focus-panel
  // group label disambiguates from the FSM/MortalitySystem "starvation"
  // death cause. Threshold (hunger<0.2) is unchanged — only the human-
  // facing string. Players were misreading "Starving" as "about to die"
  // when in fact it just means hunger<20% (still has 30+ ticks of buffer).
  starving: Object.freeze({ label: "Critical hunger", shortLabel: "Critical" }),
  hungry: Object.freeze({ label: "Hungry", shortLabel: "Hungry" }),
  blocked: Object.freeze({ label: "Blocked", shortLabel: "Blocked" }),
  idle: Object.freeze({ label: "Idle", shortLabel: "Idle" }),
  hauling: Object.freeze({ label: "Hauling", shortLabel: "Hauling" }),
  combat: Object.freeze({ label: "Combat", shortLabel: "Combat" }),
  other: Object.freeze({ label: "Other", shortLabel: "Other" }),
});

function entityFocusGroupMeta(groupId) {
  return ENTITY_FOCUS_GROUP_META[groupId] ?? ENTITY_FOCUS_GROUP_META.other;
}

function normalizeSearchText(...parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .map((part) => {
      if (typeof part === "object") {
        try { return JSON.stringify(part); } catch { return String(part); }
      }
      return String(part);
    })
    .join(" ")
    .toLowerCase();
}

function entityCarryTotal(entity) {
  const carry = entity?.carry ?? {};
  return finiteNumber(carry.food, 0)
    + finiteNumber(carry.wood, 0)
    + finiteNumber(carry.stone, 0)
    + finiteNumber(carry.herbs, 0);
}

function entityFocusStateNode(entity) {
  // v0.10.1-b — workers expose FSM state directly via `entity.fsm.state`
  // (uppercase: "IDLE" / "HARVESTING" / "DELIVERING" / ...). Animals +
  // visitors still use the legacy display planner via
  // `entity.blackboard.fsm.state` (lowercase: "idle" / "graze" / ...).
  // Lowercasing both unifies the vocabulary for downstream regex
  // classification (classifyEntityFocusGroup).
  return String(
    entity?.fsm?.state
      ?? entity?.blackboard?.fsm?.state
      ?? entity?.debug?.lastStateNode
      ?? entity?.blackboard?.intent
      ?? entity?.debug?.lastIntent
      ?? entity?.stateLabel
      ?? "",
  ).toLowerCase();
}

function entityFocusStateText(entity) {
  return String(entity?.stateLabel ?? entity?.blackboard?.intent ?? entity?.debug?.lastIntent ?? "-");
}

function isEntityBlockedForFocus(entity) {
  const reject = entity?.blackboard?.lastFeasibilityReject
    ?? entity?.debug?.feasibilityReject
    ?? entity?.deathContext?.lastFeasibilityReject
    ?? null;
  if (reject) return true;

  const text = normalizeSearchText(
    entity?.stateLabel,
    entity?.debug?.lastIntentReason,
    entity?.debug?.stateReason,
    entity?.blackboard?.fsm?.reason,
    entity?.blackboard?.emotionalContext,
  );
  return /\b(blocked|stuck|reject|rejected|unreachable|invalid)\b/.test(text)
    || /no[- ]worksite|no reachable|no warehouse|deliver-stuck/.test(text);
}

function isEntityInCombatForFocus(entity) {
  const hp = Number(entity?.hp);
  const maxHp = Number(entity?.maxHp);
  if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp < maxHp) return true;

  const text = normalizeSearchText(
    entity?.stateLabel,
    entity?.debug?.lastIntent,
    entity?.debug?.lastStateNode,
    entity?.blackboard?.intent,
    entity?.groupId,
    entity?.kind,
  );
  return /\b(attack|combat|raid|hunt|stalk|flee|evade|sabotage)\b/.test(text);
}

function classifyEntityFocusGroup(entity) {
  const hunger = Number(entity?.hunger);
  if (Number.isFinite(hunger) && hunger < 0.2) return "starving";
  if (Number.isFinite(hunger) && hunger < 0.5) return "hungry";
  if (isEntityBlockedForFocus(entity)) return "blocked";
  if (isEntityInCombatForFocus(entity)) return "combat";

  const stateNode = entityFocusStateNode(entity);
  const text = normalizeSearchText(entity?.stateLabel, entity?.debug?.lastIntent, stateNode);
  if (entityCarryTotal(entity) > 0.05 || /\b(deliver|delivering|depositing|haul|hauling)\b/.test(text)) return "hauling";
  if (stateNode === "idle" || stateNode === "wander" || /\b(idle|wander)\b/.test(text)) return "idle";
  return "other";
}

function entityFocusSortValue(groupId) {
  const idx = ENTITY_FOCUS_ROW_SORT_ORDER.indexOf(groupId);
  return idx >= 0 ? idx : ENTITY_FOCUS_ROW_SORT_ORDER.length;
}

function compareEntityFocusRows(a, b) {
  const groupDelta = entityFocusSortValue(a.groupId) - entityFocusSortValue(b.groupId);
  if (groupDelta !== 0) return groupDelta;
  const hungerA = Number.isFinite(a.hunger) ? a.hunger : 1;
  const hungerB = Number.isFinite(b.hunger) ? b.hunger : 1;
  if (Math.abs(hungerA - hungerB) > 0.0001) return hungerA - hungerB;
  const carryDelta = Number(b.carryTotal ?? 0) - Number(a.carryTotal ?? 0);
  if (Math.abs(carryDelta) > 0.0001) return carryDelta;
  return String(a.entity?.id ?? "").localeCompare(String(b.entity?.id ?? ""));
}

export function deriveEntityFocusGroups(state = {}) {
  const agents = Array.isArray(state.agents) ? state.agents : [];
  const animals = Array.isArray(state.animals) ? state.animals : [];
  const entities = [...agents, ...animals].filter((entity) => entity && entity.alive !== false);
  const rows = entities.map((entity) => {
    const groupId = classifyEntityFocusGroup(entity);
    const hunger = Number(entity?.hunger);
    return {
      entity,
      groupId,
      groupLabel: entityFocusGroupMeta(groupId).shortLabel,
      stateText: entityFocusStateText(entity),
      hunger: Number.isFinite(hunger) ? hunger : null,
      carryTotal: entityCarryTotal(entity),
    };
  }).sort(compareEntityFocusRows);

  const groups = ENTITY_FOCUS_GROUP_ORDER.map((id) => ({
    id,
    label: entityFocusGroupMeta(id).label,
    rows: rows.filter((row) => row.groupId === id),
  }));
  return {
    entities,
    rows,
    groups,
    total: rows.length,
    groupCounts: Object.fromEntries(groups.map((group) => [group.id, group.rows.length])),
  };
}

function formatFocusHungerLabel(entity) {
  const hungerN = Number(entity?.hunger);
  if (!Number.isFinite(hungerN)) return "?";
  if (hungerN >= 0.8) return "well-fed";
  if (hungerN >= 0.5) return "a bit hungry";
  if (hungerN >= 0.2) return "hungry";
  return "starving";
}

function summarizeHiddenFocusRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
  }
  return ENTITY_FOCUS_ROW_SORT_ORDER
    .filter((id) => counts.has(id))
    .slice(0, 4)
    .map((id) => `${entityFocusGroupMeta(id).shortLabel.toLowerCase()} ${counts.get(id)}`)
    .join(", ");
}

function summarizeTopWeights(weights = {}) {
  const rows = Object.entries(weights)
    .map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return "none";
  return rows.slice(0, 3).map(([k, v]) => `${k}:${fmtNum(v, 2)}`).join(" | ");
}

function prettyJson(value) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function renderExchange(label, exchange, emptyText = "No exchange captured yet.", keyPrefix = "exchange") {
  const hasExchange = Boolean(exchange);
  const normalized = hasExchange
    ? exchange
    : {
        simSec: null,
        requestedAtIso: "",
      source: "none",
      fallback: true,
      model: "n/a",
      endpoint: "-",
      error: emptyText,
      promptSystem: "",
      promptUser: "",
      requestPayload: null,
      requestSummary: { note: emptyText },
      parsedBeforeValidation: { note: emptyText },
      guardedOutput: { note: emptyText },
      rawModelContent: `(no model reply captured) ${emptyText}`,
    };

  const requestPayloadText = prettyJson(normalized.requestPayload);
  const requestText = prettyJson(normalized.requestSummary);
  const parsedText = prettyJson(normalized.parsedBeforeValidation);
  const guardedText = prettyJson(normalized.guardedOutput);
  const promptSystemText = String(normalized.promptSystem ?? "");
  const promptUserText = String(normalized.promptUser ?? "");
  const rawContent = String(normalized.rawModelContent ?? "");

  return `
    <details data-focus-key="${escapeHtml(`${keyPrefix}:root`)}" style="margin-top:6px;">
      <summary class="small"><b>${escapeHtml(label)}</b></summary>
      <div class="small" style="margin-top:6px;"><b>Status:</b> ${hasExchange ? "captured" : "not-captured"}</div>
      <div class="small"><b>Time:</b> sim=${fmtSec(normalized.simSec)} | reqAt=${escapeHtml(normalized.requestedAtIso || "-")}</div>
      <div class="small"><b>Source:</b> ${escapeHtml(normalized.source || "-")} | <b>Fallback:</b> ${String(Boolean(normalized.fallback))} | <b>Model:</b> ${escapeHtml(normalized.model || "-")}</div>
      <div class="small"><b>Endpoint:</b> ${escapeHtml(normalized.endpoint || "-")} | <b>Error:</b> ${escapeHtml(normalized.error || "none")}</div>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:prompt-system`)}" style="margin-top:6px;">
        <summary class="small"><b>Prompt Input: System</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:prompt-system:pre`)}">${escapeHtml(promptSystemText || "(system prompt unavailable)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:prompt-user`)}" style="margin-top:6px;">
        <summary class="small"><b>Prompt Input: User</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:prompt-user:pre`)}">${escapeHtml(promptUserText || "(user prompt unavailable)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:request-payload`)}" style="margin-top:6px;">
        <summary class="small"><b>Request Payload</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:request-payload:pre`)}">${escapeHtml(requestPayloadText || "(empty)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:request`)}" style="margin-top:6px;">
        <summary class="small"><b>Request Summary (full)</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:request:pre`)}">${escapeHtml(requestText || "(empty)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:raw`)}" style="margin-top:6px;">
        <summary class="small"><b>Raw Model Content (full)</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:raw:pre`)}">${escapeHtml(rawContent || "(no raw model content captured)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:parsed`)}" style="margin-top:6px;">
        <summary class="small"><b>Parsed Before Validation</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:parsed:pre`)}">${escapeHtml(parsedText || "(empty)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:guarded`)}" style="margin-top:6px;">
        <summary class="small"><b>Guarded Output</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:guarded:pre`)}">${escapeHtml(guardedText || "(empty)")}</pre>
      </details>
    </details>
  `;
}

export class EntityFocusPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("entityFocusBody");
    this.wrapper = document.getElementById("entityFocusOverlay");
    // v0.8.2 Round-5 Wave-2 (01d Step 4-5): persistent worker list so casual
    // users can select any worker without relying on canvas picking.
    this.workerListRoot = typeof document !== "undefined"
      ? document.getElementById("entityFocusWorkerList")
      : null;
    this.workerListSignature = "";
    this.lastHtml = "";
    this.lastSelectedId = null;
    this.openStateByKey = new Map();
    this.scrollStateByKey = new Map();
    this.rootScrollTop = 0;
    this.interactionUntilMs = 0;
    this.pointerActive = false;
    this.#bindInteractionGuards();
    this.#bindWorkerListDelegate();
    this.#bindFamilyChipDelegate();
  }

  #bindWorkerListDelegate() {
    if (!this.workerListRoot) return;
    this.workerListRoot.addEventListener("click", (event) => {
      const target = event?.target;
      if (!target || typeof target.closest !== "function") return;
      const filterBtn = target.closest("button[data-entity-focus-filter]");
      if (filterBtn) {
        const filter = String(filterBtn.dataset.entityFocusFilter ?? "all");
        event.preventDefault();
        this.state.controls ??= {};
        this.state.controls.entityFocusFilter = filter;
        this.workerListSignature = "";
        this.#renderWorkerList();
        return;
      }
      const btn = target.closest("button[data-entity-id]");
      if (!btn) return;
      const entityId = btn.dataset.entityId;
      if (!entityId) return;
      event.preventDefault();
      this.state.controls.selectedEntityId = entityId;
      this.state.controls.selectedTile = null;
      if (this.state.debug) this.state.debug.selectedTile = null;
    });
  }

  #bindFamilyChipDelegate() {
    if (!this.root) return;
    this.root.addEventListener("click", (event) => {
      const target = event?.target;
      if (!target || typeof target.closest !== "function") return;
      const btn = target.closest("button[data-family-entity-id]");
      if (!btn) return;
      const entityId = btn.dataset.familyEntityId;
      if (!entityId) return;
      event.preventDefault();
      this.state.controls.selectedEntityId = entityId;
      this.state.controls.selectedTile = null;
      if (this.state.debug) this.state.debug.selectedTile = null;
    });
  }

  #renderWorkerList() {
    if (!this.workerListRoot) return;
    const focus = deriveEntityFocusGroups(this.state);
    const selectedId = this.state.controls?.selectedEntityId ?? "";
    const requestedFilter = String(this.state.controls?.entityFocusFilter ?? "all");
    const activeFilter = requestedFilter === "all" || Object.hasOwn(ENTITY_FOCUS_GROUP_META, requestedFilter)
      ? requestedFilter
      : "all";
    if (this.state.controls && this.state.controls.entityFocusFilter !== activeFilter) {
      this.state.controls.entityFocusFilter = activeFilter;
    }
    const PAGE_SIZE = 20;
    const activeGroup = focus.groups.find((group) => group.id === activeFilter);
    const filteredRows = activeFilter === "all" ? focus.rows : (activeGroup?.rows ?? []);
    let shown = filteredRows.slice(0, PAGE_SIZE);
    const selectedInFilterIndex = filteredRows.findIndex((row) => row.entity?.id === selectedId);
    if (selectedInFilterIndex >= PAGE_SIZE && PAGE_SIZE > 0) {
      shown = [...filteredRows.slice(0, PAGE_SIZE - 1), filteredRows[selectedInFilterIndex]];
    }
    const shownIds = new Set(shown.map((row) => row.entity?.id));
    const hiddenRows = filteredRows.filter((row) => !shownIds.has(row.entity?.id));
    const overflow = hiddenRows.length;
    // Signature-based dirty-check: rebuild only when identity / role / state
    // / selection changes (plan "Risks: 50+ workers O(N) rebuild every tick").
    const signature = [
      selectedId,
      activeFilter,
      focus.total,
      overflow,
      ENTITY_FOCUS_GROUP_ORDER.map((id) => `${id}:${focus.groupCounts[id] ?? 0}`).join("|"),
      shown.map((row) => {
        const w = row.entity;
        return `${w.id}|${row.groupId}|${w.role ?? "-"}|${row.stateText}|${Number(w.hunger ?? 0).toFixed(2)}|${row.carryTotal.toFixed(2)}`;
      }).join(";"),
    ].join("::");
    if (signature === this.workerListSignature) return;
    this.workerListSignature = signature;

    if (focus.total === 0) {
      this.workerListRoot.innerHTML = `<div class="entity-worker-list-footer">(no focusable entities in colony yet)</div>`;
      return;
    }

    const chipStyle = "font:inherit;font-size:10px;line-height:1.1;padding:3px 6px;border-radius:999px;border:1px solid rgba(80,140,200,0.28);background:rgba(80,140,200,0.08);color:rgba(208,232,255,0.82);cursor:pointer;";
    const activeChipStyle = "background:rgba(120,180,220,0.25);border-color:rgba(120,180,220,0.65);color:var(--text);";
    const chips = [
      { id: "all", label: "All", count: focus.total },
      ...focus.groups.map((group) => ({ id: group.id, label: group.label, count: group.rows.length })),
    ].map((chip) => {
      const pressed = chip.id === activeFilter;
      return `<button type="button" data-entity-focus-filter="${escapeHtml(chip.id)}" aria-pressed="${pressed ? "true" : "false"}" style="${chipStyle}${pressed ? activeChipStyle : ""}">${escapeHtml(chip.label)} <b>${chip.count}</b></button>`;
    }).join("");

    const rows = shown.map((row) => {
      const w = row.entity;
      const name = String(w.displayName ?? w.id);
      const role = `${entityFocusGroupMeta(row.groupId).shortLabel} / ${String(w.role ?? "-")}`;
      const stateLabel = String(row.stateText ?? "-");
      // v0.8.2 Round-6 Wave-1 02b-casual (Step 10) — swap the worker-list
      // mood label "peckish" for the casual-friendly "a bit hungry".
      // Reviewer reported "what is peckish? Looked it up: hungry but not
      // very. Words like that don't appear in mainstream games." The
      // primary Hunger row (rendered separately at the entity-detail
      // template, line ~430) keeps "Peckish" capitalised because
      // entity-focus-player-view.test.js pins that label literal — only
      // the worker-list rollup is rewritten here.
      const hungerLabel = formatFocusHungerLabel(w);
      const selectedClass = w.id === selectedId ? " selected" : "";
      // v0.9.2-ui (F4) — split name / role / state / hunger into separate
      // spans so each can shrink/ellipsize independently. The name claims
      // priority (flex:1) and ellipsizes first; role + state ellipsize but
      // stay visible at narrow widths. Full row mirrored into title= so
      // hover (via the customTooltip migrateTitles MO) reveals the
      // unabridged content. Visible text still preserves the "·" pattern
      // for a11y/snapshot stability — separators are emitted as data so
      // they don't affect layout flex calculations.
      const fullText = `${name} · ${role} · ${stateLabel} · ${hungerLabel}`;
      return `<button type="button" class="entity-worker-row${selectedClass}" data-entity-id="${escapeHtml(w.id)}" title="${escapeHtml(fullText)}"><span class="ewr-name">${escapeHtml(name)}</span><span class="ewr-sep" aria-hidden="true">·</span><span class="ewr-role">${escapeHtml(role)}</span><span class="ewr-sep" aria-hidden="true">·</span><span class="ewr-state">${escapeHtml(stateLabel)}</span><span class="ewr-sep" aria-hidden="true">·</span><span class="ewr-hunger">${escapeHtml(hungerLabel)}</span></button>`;
    }).join("");
    const hiddenSummary = overflow > 0 ? summarizeHiddenFocusRows(hiddenRows) : "";
    const displayFooter = overflow > 0
      ? `<div class="entity-worker-list-footer">+${overflow} more${hiddenSummary ? `: ${escapeHtml(hiddenSummary)}` : ""}</div>`
      : (filteredRows.length === 0
        ? `<div class="entity-worker-list-footer">(no ${escapeHtml(activeFilter === "all" ? "focusable" : entityFocusGroupMeta(activeFilter).shortLabel.toLowerCase())} entities now)</div>`
        : "");
    this.workerListRoot.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">${chips}</div>${rows}${displayFooter}`;
  }

  #nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  #bumpInteractionWindow(ms = 900) {
    this.interactionUntilMs = Math.max(this.interactionUntilMs, this.#nowMs() + ms);
  }

  #isUserInteracting() {
    return this.pointerActive || this.#nowMs() < this.interactionUntilMs;
  }

  #bindInteractionGuards() {
    if (!this.root) return;

    this.root.addEventListener(
      "pointerdown",
      () => {
        this.pointerActive = true;
        this.#bumpInteractionWindow(1400);
      },
      true,
    );

    const clearPointer = () => {
      this.pointerActive = false;
      this.#bumpInteractionWindow(300);
    };
    window.addEventListener("pointerup", clearPointer);
    window.addEventListener("pointercancel", clearPointer);
    window.addEventListener("blur", clearPointer);

    this.root.addEventListener(
      "wheel",
      () => {
        this.#bumpInteractionWindow(900);
      },
      { passive: true, capture: true },
    );

    this.root.addEventListener(
      "scroll",
      () => {
        this.#bumpInteractionWindow(800);
      },
      { passive: true, capture: true },
    );
  }

  #captureOpenStates() {
    if (!this.root) return;
    const details = this.root.querySelectorAll("details[data-focus-key]");
    for (const node of details) {
      const key = node.dataset.focusKey;
      if (!key) continue;
      this.openStateByKey.set(key, Boolean(node.open));
    }
  }

  #restoreOpenStates() {
    if (!this.root) return;
    const details = this.root.querySelectorAll("details[data-focus-key]");
    for (const node of details) {
      const key = node.dataset.focusKey;
      if (!key || !this.openStateByKey.has(key)) continue;
      node.open = Boolean(this.openStateByKey.get(key));
    }
  }

  #captureScrollStates() {
    if (!this.root) return;
    this.rootScrollTop = Number(this.root.scrollTop ?? 0);
    const scrollables = this.root.querySelectorAll("[data-focus-scroll]");
    for (const node of scrollables) {
      const key = node.dataset.focusScroll;
      if (!key) continue;
      this.scrollStateByKey.set(key, Number(node.scrollTop ?? 0));
    }
  }

  #restoreScrollStates() {
    if (!this.root) return;
    this.root.scrollTop = Number(this.rootScrollTop ?? 0);
    const scrollables = this.root.querySelectorAll("[data-focus-scroll]");
    for (const node of scrollables) {
      const key = node.dataset.focusScroll;
      if (!key || !this.scrollStateByKey.has(key)) continue;
      node.scrollTop = Number(this.scrollStateByKey.get(key) ?? 0);
    }
  }

  #buildAiImpact(entity, groupPolicy) {
    if (!groupPolicy) return "No active group policy.";
    const group = entity.groupId ?? "";
    if (group === "workers") {
      const farmW = Number(groupPolicy.intentWeights?.farm ?? 0);
      const woodW = Number(groupPolicy.intentWeights?.wood ?? 0);
      const sum = farmW + woodW;
      if (sum > 0) {
        const farmRatio = farmW / sum;
        return `Worker policy biases FARM ratio to ${fmtNum(farmRatio * 100, 1)}% (farm=${fmtNum(farmW)} wood=${fmtNum(woodW)}).`;
      }
      return "Worker policy has no farm/wood bias.";
    }
    if (group === "traders") {
      const trade = Number(groupPolicy.intentWeights?.trade ?? 0);
      return `Trader trade weight=${fmtNum(trade)}; higher value increases warehouse-focused behavior.`;
    }
    if (group === "saboteurs") {
      const sabotage = Number(groupPolicy.intentWeights?.sabotage ?? 0);
      return `Saboteur sabotage weight=${fmtNum(sabotage)}; higher value increases sabotage pressure.`;
    }
    const topIntent = summarizeTopWeights(groupPolicy.intentWeights ?? {});
    return `Top intents: ${topIntent}`;
  }

  render() {
    if (!this.root || !this.wrapper) return;
    // v0.8.2 Round-5 Wave-2 (01d Step 5): render the worker-list strip above
    // the detail pane regardless of whether an entity is selected.
    this.#renderWorkerList();
    this.#captureOpenStates();
    this.#captureScrollStates();
    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      const html = `<div class="small muted">No entity selected. Click any worker/visitor/animal.</div>`;
      if (html !== this.lastHtml) {
        this.root.innerHTML = html;
        this.lastHtml = html;
      }
      return;
    }

    const entity = [...this.state.agents, ...this.state.animals].find((e) => e.id === selectedId);
    if (!entity) {
      const html = `<div class="small muted">Selected entity not found in current world.</div>`;
      if (html !== this.lastHtml) {
        this.root.innerHTML = html;
        this.lastHtml = html;
      }
      return;
    }

    if (selectedId === this.lastSelectedId && this.#isUserInteracting()) {
      return;
    }

    const groupPolicy = this.state.ai.groupPolicies.get(entity.groupId)?.data ?? null;
    const posTile = worldToTile(entity.x, entity.z, this.state.grid);
    const target = entity.targetTile ? `(${entity.targetTile.ix}, ${entity.targetTile.iz})` : "none";
    const nextNode = entity.path && entity.path[entity.pathIndex]
      ? `(${entity.path[entity.pathIndex].ix}, ${entity.path[entity.pathIndex].iz})`
      : "none";
    const pathLen = entity.path?.length ?? 0;
    const speed = Math.hypot(entity.vx || 0, entity.vz || 0);
    const topIntent = summarizeTopWeights(groupPolicy?.intentWeights ?? {});
    const topTargets = summarizeTopWeights(groupPolicy?.targetPriorities ?? {});
    const aiImpact = this.#buildAiImpact(entity, groupPolicy);
    const policyFocus = String(groupPolicy?.focus ?? "none");
    const policySummary = String(groupPolicy?.summary ?? "none");
    const policyNotes = Array.isArray(groupPolicy?.steeringNotes) && groupPolicy.steeringNotes.length > 0
      ? groupPolicy.steeringNotes.join(" | ")
      : "none";
    const rawEntityInsights = getEntityInsight(this.state, entity);
    // v0.8.2 Round-6 Wave-3 (01e-innovation Step 2) — humanise the
    // WorldExplain decision-context lines into first-person worker
    // monologue when the player is in casual / default profile. Dev
    // profile (`uiProfile === "dev"`/"full") preserves verbatim text so
    // engineers keep their diagnostic surface.
    const uiProfile = String(this.state?.controls?.uiProfile ?? "casual").toLowerCase();
    const entityInsights = rawEntityInsights.map((line) => humaniseInsightLine(line, entity, { profile: uiProfile }));
    const digest = getCausalDigest(this.state);
    const simSec = fmtSec(this.state.metrics.timeSec);
    const policySec = fmtSec(this.state.ai.lastPolicyResultSec);
    const envSec = fmtSec(this.state.ai.lastEnvironmentResultSec);
    const hp = Number(entity.hp ?? entity.maxHp ?? 0);
    const maxHp = Number(entity.maxHp ?? 0);
    // v0.10.1-b — workers expose FSM state via `entity.fsm`. Animals +
    // visitors still use the legacy display planner; show its breadcrumb
    // (previousState / path) for them. The FSM has no path concept for
    // workers — `previousState` and `path` show "-".
    const fsmState = entity.fsm?.state ?? entity.blackboard?.fsm?.state ?? "-";
    const fsmPrev = entity.fsm
      ? "-"
      : entity.blackboard?.fsm?.previousState ?? "-";
    const fsmPath = entity.fsm
      ? "-"
      : Array.isArray(entity.blackboard?.fsm?.path)
        ? entity.blackboard.fsm.path.join(" -> ")
        : "-";
    const aiTargetState = entity.blackboard?.aiTargetState ?? "-";
    const aiTargetMeta = entity.blackboard?.aiTargetMeta ?? null;
    const aiTargetTtl = aiTargetMeta ? Math.max(0, Number(aiTargetMeta.expiresAtSec ?? 0) - Number(this.state.metrics.timeSec ?? 0)) : 0;

    const policyExchangeByGroup = this.state.ai.lastPolicyExchangeByGroup?.[entity.groupId] ?? null;
    const policyExchangeLatest = this.state.ai.lastPolicyExchange ?? null;
    const policyExchange = policyExchangeByGroup ?? policyExchangeLatest;
    const environmentExchange = this.state.ai.lastEnvironmentExchange ?? null;

    // v0.8.2 Round0 01a-onboarding — engineering block (FSM dump, policy
    // influence weights, decision-time clock, velocity/path debug, AI
    // exchange panels) is semantically "developer telemetry". Reviewer
    // 01a-onboarding observed first-time players describe "clicking an NPC
    // gives me a brain MRI". Previous work (02b-casual) wrapped these in
    // `.casual-hidden` so body.casual-mode suppressed them; we additionally
    // mark them `.dev-only` so that even players running in `?ui=full`
    // profile do not see FSM/Policy/Path/AI-Exchange unless they have
    // enabled developer mode (Ctrl+Shift+D or `?dev=1`).
    //
    // v0.8.2 Round0 01e-innovation — Policy Focus / Policy Summary / Policy
    // Notes (the player-readable "what the AI storyteller is telling this
    // group to do" surface) have been **promoted** out of the gated block
    // above the Type/Role line, so every player sees the AI's intent at the
    // top of EntityFocusPanel regardless of casual/dev profile. The concrete
    // raw debug data (Top Intents / Top Targets / AI Target / FSM / AI
    // Exchange panels) stays gated behind `.casual-hidden .dev-only`.
    //
    // Both classes coexist (OR relationship — either one hides the block).
    // Power users: `?dev=1&ui=full` to see everything. Keep the concise
    // "Role / State / Vitals / Carry" rows always visible — that is the
    // friendly "Needs / Task" summary Suggestion A promised. Hunger is
    // additionally rendered as a human-readable label ("Well-fed" /
    // "Peckish" / "Hungry" / "Starving") so casual players don't have to
    // mentally decode `hunger=0.287`.
    const engBlockOpen = `<span class="casual-hidden dev-only">`;
    const engBlockClose = `</span>`;
    const engClasses = `casual-hidden dev-only`;

    const hungerN = Number(entity.hunger);
    // v0.8.7 T3-1 (QA2-F1): bottom band relabel "Starving" → "Critical (<20%)"
    // so the detail row matches the renamed group meta and reads as "very
    // hungry" rather than "actively dying" (which is what MortalitySystem's
    // starvation death cause means). Threshold unchanged.
    const hungerLabel = !Number.isFinite(hungerN)
      ? "Unknown"
      : hungerN >= 0.8
        ? "Well-fed"
        : hungerN >= 0.5
          ? "Peckish"
          : hungerN >= 0.2
            ? "Hungry"
            : "Critical (<20%)";
    const hungerPct = Number.isFinite(hungerN)
      ? Math.round(Math.max(0, Math.min(1, hungerN)) * 100)
      : null;
    const foodDiagnosis = buildFoodDiagnosis(entity, this.state);
    const foodTone = foodDiagnosis.severity === "critical"
      ? "#e07070"
      : (foodDiagnosis.severity === "warn" ? "#c9a94e" : "#8ebf8e");
    const foodDiagnosisBlock = `
      <div class="small" style="color:${foodTone};"><b>Food Diagnosis:</b> ${escapeHtml(foodDiagnosis.cause)} <span class="muted">Next: ${escapeHtml(foodDiagnosis.next)}</span></div>
      <details data-focus-key="focus:food-diagnosis" style="margin-top:4px;">
        <summary class="small"><b>Food Route Facts</b></summary>
        <div class="small muted" style="margin-top:4px;">${escapeHtml(foodDiagnosis.facts)}</div>
        ${foodDiagnosis.reject ? `<div class="small muted">Last AI reject: ${escapeHtml(foodDiagnosis.reject)}</div>` : ""}
      </details>
    `;

    // v0.8.2 Round-6 Wave-1 01a-onboarding (Step 6): humanise the Vitals row.
    // Reviewer 01a-onboarding called out "hp=100.0/100.0 | hunger=0.639 |
    // alive=true" as the canonical "looks like a debugger" line. We dual-track:
    // a casual-friendly "Health: Healthy (100%)" row always visible, and the
    // raw hp= / hunger= / alive= numbers retained behind the casual-hidden
    // dev-only gate so power users keep their telemetry.
    const alive = Boolean(entity.alive ?? true);
    const hpPct = maxHp > 0
      ? Math.round(Math.max(0, Math.min(1, hp / maxHp)) * 100)
      : null;
    const healthLabel = !alive
      ? "Deceased"
      : hpPct === null
        ? "Unknown"
        : hpPct >= 80
          ? "Healthy"
          : hpPct >= 50
            ? "Wounded"
            : "Critical";
    const healthPctText = hpPct === null ? "" : ` (${hpPct}%)`;
    const healthDeceasedSuffix = alive ? "" : " — deceased";

    // v0.8.2 Round-0 02d-roleplayer (Step 4) — Character block. Surfaces
    // data that already lived on the worker object (traits/mood/morale/
    // social/rest, relationships map, memory.recentEvents) so reviewers get
    // a "character sheet" instead of a debugger dump. Deliberately rendered
    // BEFORE the engineering block (FSM/policy/path) so casual-profile users
    // still see the narrative first; the `<details>` wrapper lets power
    // users collapse it alongside everything else.
    // v0.8.2 Round-7 (01e+02b) — trait descriptions and grief notice.
    const traitsText = Array.isArray(entity.traits) && entity.traits.length > 0
      ? entity.traits.map((t) => {
          const desc = TRAIT_DESC[t];
          return desc
            ? `<span class="trait-tag">${escapeHtml(t)}<span class="trait-desc"> (${escapeHtml(desc)})</span></span>`
            : `<span class="trait-tag">${escapeHtml(t)}</span>`;
        }).join(", ")
      : "(none)";
    // Grief notice: rendered in character block header when grief is active.
    const nowSec = Number(this.state.metrics?.timeSec ?? 0);
    const griefFriendName = entity.blackboard?.griefFriendName;
    const griefUntilSec = Number(entity.blackboard?.griefUntilSec ?? -1);
    const isGrieving = Boolean(griefFriendName) && nowSec < griefUntilSec;
    const griefNotice = isGrieving
      ? `<div class="grief-notice" style="color:#e07070;font-size:11px;font-style:italic;margin-bottom:4px;">&#x1F494; Grieving ${escapeHtml(String(griefFriendName))}</div>`
      : "";
    // Emotional context: set by WorkerAISystem when addEmotionalPrefix produces a non-trivial string.
    const emotionalContext = String(entity.blackboard?.emotionalContext ?? "").trim();
    const moodN = Number(entity.mood);
    const moraleN = Number(entity.morale);
    const socialN = Number(entity.social);
    const restN = Number(entity.rest);
    const hasCharacterStats = Number.isFinite(moodN)
      || Number.isFinite(moraleN)
      || Number.isFinite(socialN)
      || Number.isFinite(restN);
    const relMap = entity.relationships && typeof entity.relationships === "object"
      ? entity.relationships
      : {};
    const lookupDisplayNameById = (id) => {
      const match = this.state.agents?.find?.((a) => a.id === id);
      if (match) return match.displayName ?? match.id;
      return id;
    };
    const topRelations = Object.entries(relMap)
      .map(([otherId, op]) => [otherId, Number(op)])
      .filter(([, v]) => Number.isFinite(v))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([otherId, v]) => {
        const name = escapeHtml(lookupDisplayNameById(otherId));
        const label = escapeHtml(formatRelationOpinion(v));
        const reason = relMap[`__reason__${otherId}`];
        const reasonSuffix = reason ? ` <span class="muted">(because ${escapeHtml(String(reason))})</span>` : "";
        return `${name}: ${label}${reasonSuffix}`;
      });
    // Reason suffixes contain HTML — do not double-escape; per-piece escaping above already sanitises.
    const relationsLine = topRelations.length > 0 ? topRelations.join(" | ") : "(no relationships yet)";
    const historyMemories = Array.isArray(entity.memory?.history)
      ? entity.memory.history.slice(0, 5)
      : [];
    const recentMemories = historyMemories.length > 0
      ? historyMemories
      : (Array.isArray(entity.memory?.recentEvents) ? entity.memory.recentEvents.slice(0, 3) : []);
    const memorySourceLabel = historyMemories.length > 0 ? "Memory History" : "Recent Memory";
    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 9) — narrative beat CSS
    // tagging. Lines whose body matches obituary / birth / rivalry markers
    // get a `mem-obituary` / `mem-birth` / `mem-rivalry` class so styles can
    // gently emphasise them (italic, accent colour) without overhauling the
    // memory list. Generic memories keep `mem-default`.
    const classifyMemoryLine = (rawText) => {
      const txt = String(rawText ?? "");
      if (/died of |died \(/i.test(txt)) return "mem-obituary";
      if (/born to |arrived at the colony/i.test(txt)) return "mem-birth";
      if (/Felt grim relief|Became (Strained|Rival) with/i.test(txt)) return "mem-rivalry";
      return "mem-default";
    };
    const memoryLines = recentMemories.length > 0
      ? recentMemories.map((m) => {
        const text = String(m?.label ?? m?.summary ?? m?.type ?? m ?? "");
        const cls = classifyMemoryLine(text);
        const type = m && typeof m === "object" && m.type ? ` <span class="muted">[${escapeHtml(String(m.type))}]</span>` : "";
        return `<div class="small muted ${cls}">- ${escapeHtml(text)}${type}</div>`;
      }).join("")
      : `<div class="small muted">(no memories yet)</div>`;
    // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 9) — Family line. Renders
    // lineage.parents / lineage.children counts so players see the colony
    // family tree at a glance. Hidden when no kinship is wired (initial
    // population's empty arrays — keeps the panel uncluttered).
    const lineageParents = Array.isArray(entity.lineage?.parents) ? entity.lineage.parents : [];
    const lineageChildren = Array.isArray(entity.lineage?.children) ? entity.lineage.children : [];
    const renderFamilyChip = (id) => {
      const name = escapeHtml(lookupDisplayNameById(id));
      const isKnown = this.state.agents?.some?.((a) => a.id === id);
      if (!isKnown) return `<span class="entity-family-chip muted">${name}</span>`;
      return `<button type="button" class="entity-family-chip" data-family-entity-id="${escapeHtml(id)}">${name}</button>`;
    };
    let familyLine = "";
    if (lineageParents.length > 0 || lineageChildren.length > 0) {
      const segs = [];
      if (lineageChildren.length > 0) {
        const childNames = lineageChildren.map((id) => renderFamilyChip(id)).join(", ");
        segs.push(`parent of ${childNames}`);
      }
      if (lineageParents.length > 0) {
        const parentNames = lineageParents.map((id) => renderFamilyChip(id)).join(", ");
        segs.push(`child of ${parentNames}`);
      }
      familyLine = `<div class="small"><b>Family:</b> ${segs.join(" \u00B7 ")}</div>`;
    }
    const characterBlock = `
      <details data-focus-key="focus:character" style="margin-top:6px;">
        <summary class="small"><b>Character</b></summary>
        ${griefNotice}
        <div class="small" style="margin-top:4px;"><b>Traits:</b> ${traitsText}</div>
        ${hasCharacterStats ? `<div class="small"><b>Mood:</b> ${fmtNum(moodN, 2)} | <b>Morale:</b> ${fmtNum(moraleN, 2)} | <b>Social:</b> ${fmtNum(socialN, 2)} | <b>Rest:</b> ${fmtNum(restN, 2)}</div>` : ""}
        <div class="small"><b>Relationships:</b> ${relationsLine}</div>
        ${familyLine}
        <div class="small" style="margin-top:4px;"><b>${memorySourceLabel}:</b></div>
        ${memoryLines}
      </details>
    `;

    // v0.8.2 Round-5 Wave-2 (01d Step 6): promote "Top Intents / Top Targets /
    // AI Agent Effect / Decision Context" OUT of the casual-hidden/dev-only
    // gate into a single casual-visible `<details open>` wrapper. This is the
    // core "Why is this worker doing this?" surface that casual profiles
    // previously could not see. FSM / Policy Influence / Decision Time /
    // Velocity / Path / Target Selection / Path Nodes / AI Exchange remain
    // dev-only.
    const whyBlock = `
      <details data-focus-key="focus:why" style="margin-top:6px;">
        <summary class="small"><b>Why is this worker doing this?</b></summary>
        <div class="small" style="margin-top:4px;"><b>Top Intents:</b> ${escapeHtml(topIntent)}</div>
        <div class="small"><b>Top Targets:</b> ${escapeHtml(topTargets)}</div>
        <div class="small" style="margin-top:4px;">${escapeHtml(aiImpact)}</div>
        <div class="small" style="margin-top:4px;"><b>Decision Context:</b> ${escapeHtml(entityInsights.join(" | ") || "none")}</div>
        ${emotionalContext ? `<div class="small" style="margin-top:2px;color:#c9a94e;font-style:italic;"><b>Mood:</b> ${escapeHtml(emotionalContext)}</div>` : ""}
      </details>
    `;

    const html = `
      <div class="small"><b>${escapeHtml(entity.displayName ?? entity.id)}</b> <span class="muted">(${escapeHtml(entity.id)})</span></div>
      <div class="small" style="margin-top:2px;"><b>Backstory:</b> ${escapeHtml(entity.backstory ?? "\u2014")}</div>
      ${characterBlock}
      ${whyBlock}
      <div class="small"><b>Policy Focus:</b> ${escapeHtml(policyFocus)}</div>
      <div class="small"><b>Policy Summary:</b> ${escapeHtml(policySummary)}</div>
      <div class="small"><b>Policy Notes:</b> ${escapeHtml(policyNotes)}</div>
      <div class="small" style="margin-top:4px;"><b>Type:</b> ${escapeHtml(entity.type)}${entity.kind ? ` / ${escapeHtml(entity.kind)}` : ""} | <b>Role:</b> ${escapeHtml(entity.role ?? "-")} | <b>Group:</b> ${escapeHtml(entity.groupId ?? "-")}</div>
      <div class="small"><b>State:</b> ${escapeHtml(entity.stateLabel ?? "-")} | <b>Intent:</b> ${escapeHtml(entity.debug?.lastIntent ?? entity.blackboard?.intent ?? "-")}${entity.debug?.lastIntentReason ? ` <span class="muted">(because: ${escapeHtml(entity.debug.lastIntentReason)})</span>` : ""}</div>
      <div class="small"><b>Hunger:</b> ${escapeHtml(hungerLabel)}${hungerPct === null ? "" : ` (${hungerPct}% fed)`}</div>
      ${foodDiagnosisBlock}
      ${engBlockOpen}
      <div class="small"><b>FSM:</b> current=${escapeHtml(fsmState)} prev=${escapeHtml(fsmPrev)} | nextPath=${escapeHtml(fsmPath || "-")}</div>
      <div class="small"><b>AI Target:</b> ${escapeHtml(aiTargetState)} | <b>TTL:</b> ${fmtSec(aiTargetTtl)} | <b>Priority:</b> ${fmtNum(aiTargetMeta?.priority ?? 0, 2)} | <b>Source:</b> ${escapeHtml(aiTargetMeta?.source ?? "-")}</div>
      <div class="small"><b>Policy Influence:</b> applied=${String(Boolean(entity.debug?.policyApplied))} | topIntent=${escapeHtml(entity.debug?.policyTopIntent ?? "-")} | topWeight=${fmtNum(entity.debug?.policyTopWeight ?? 0, 2)} | policyDesired=${escapeHtml(entity.debug?.policyDesiredState ?? "-")}</div>
      <div class="small"><b>Decision Time:</b> sim=${simSec} | policyAt=${policySec} | envAt=${envSec}</div>
      ${engBlockClose}
      <div class="small ${engClasses}"><b>Position:</b> world=${vecFmt(entity.x, entity.z)} tile=(${posTile.ix}, ${posTile.iz})</div>
      ${engBlockOpen}
      <div class="small"><b>Velocity:</b> ${vecFmt(entity.vx, entity.vz)} speed=${fmtNum(speed, 3)} | <b>Desired:</b> ${vecFmt(entity.desiredVel?.x, entity.desiredVel?.z)}</div>
      <div class="small"><b>Path:</b> idx=${entity.pathIndex ?? 0}/${pathLen} | next=${nextNode} | target=${target}</div>
      <div class="small"><b>Path Recalc:</b> ${fmtSec(entity.debug?.lastPathRecalcSec)} | <b>Path Grid:</b> ${entity.pathGridVersion ?? "-"} | <b>Path Traffic:</b> ${entity.pathTrafficVersion ?? 0}</div>
      ${engBlockClose}
      <div class="small"><b>Health:</b> ${escapeHtml(healthLabel)}${healthPctText}${healthDeceasedSuffix}</div>
      <div class="small ${engClasses}"><b>Vitals (dev):</b> hp=${fmtNum(hp, 1)}/${fmtNum(maxHp, 1)} | hunger=${fmtNum(entity.hunger, 3)} | alive=${String(Boolean(entity.alive ?? true))}</div>
      <div class="small"><b>Carry:</b> food=${fmtNum(entity.carry?.food, 2)} wood=${fmtNum(entity.carry?.wood, 2)} | <b>Attack CD:</b> ${fmtNum(entity.attackCooldownSec ?? 0, 2)}</div>
      <hr style="border:none; border-top:1px solid rgba(53, 94, 129, 0.2); margin:8px 0;" class="${engClasses}" />
      <div class="small ${engClasses}"><b>Mode:</b> ${escapeHtml(this.state.ai.mode)} | <b>Policy Source:</b> ${escapeHtml(this.state.ai.lastPolicySource)} | <b>Model:</b> ${escapeHtml(this.state.ai.lastPolicyModel || this.state.metrics.proxyModel || "-")}</div>
      <div class="small ${engClasses}"><b>Global Headline:</b> ${escapeHtml(digest.headline)}</div>
      <div class="small ${engClasses}"><b>Global Warning:</b> ${escapeHtml(digest.warning)}</div>
      <div class="small ${engClasses}"><b>Target Selection:</b> score=${fmtNum(entity.debug?.policyTargetScore ?? 0, 2)} | frontier=${fmtNum(entity.debug?.policyTargetFrontier ?? 0, 2)} | depot=${fmtNum(entity.debug?.policyTargetDepot ?? 0, 2)} | load=${fmtNum(entity.debug?.policyTargetWarehouseLoad ?? 0, 2)} | ecology=${fmtNum(entity.debug?.policyTargetEcology ?? 0, 2)}</div>
      <details data-focus-key="focus:path-nodes" class="${engClasses}" style="margin-top:8px;">
        <summary class="small"><b>Path Nodes</b></summary>
        <div class="small" style="margin-top:6px; white-space:normal;">${entity.path ? entity.path.map((n) => `(${n.ix},${n.iz})`).join(" -> ") : "none"}</div>
      </details>
      <details data-focus-key="focus:last-ai-exchange" class="${engClasses}" style="margin-top:8px;">
        <summary class="small"><b>Last AI Exchange (Full)</b></summary>
        ${renderExchange(`Policy Exchange for ${entity.groupId ?? "unknown"}`, policyExchange, "No policy exchange for this group yet.", "focus:policy")}
        ${renderExchange("Environment Exchange (Global)", environmentExchange, "No environment exchange yet.", "focus:environment")}
      </details>
    `;

    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.lastSelectedId = selectedId;
    this.root.innerHTML = html;
    this.#restoreOpenStates();
    this.#restoreScrollStates();
  }
}
