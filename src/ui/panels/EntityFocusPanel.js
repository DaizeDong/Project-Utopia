import { worldToTile } from "../../world/grid/Grid.js";
import { getCausalDigest, getEntityInsight } from "../interpretation/WorldExplain.js";

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

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
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
    <details data-focus-key="${escapeHtml(`${keyPrefix}:root`)}" style="margin-top:6px;" open>
      <summary class="small"><b>${escapeHtml(label)}</b></summary>
      <div class="small" style="margin-top:6px;"><b>Status:</b> ${hasExchange ? "captured" : "not-captured"}</div>
      <div class="small"><b>Time:</b> sim=${fmtSec(normalized.simSec)} | reqAt=${escapeHtml(normalized.requestedAtIso || "-")}</div>
      <div class="small"><b>Source:</b> ${escapeHtml(normalized.source || "-")} | <b>Fallback:</b> ${String(Boolean(normalized.fallback))} | <b>Model:</b> ${escapeHtml(normalized.model || "-")}</div>
      <div class="small"><b>Endpoint:</b> ${escapeHtml(normalized.endpoint || "-")} | <b>Error:</b> ${escapeHtml(normalized.error || "none")}</div>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:prompt-system`)}" style="margin-top:6px;">
        <summary class="small"><b>Prompt Input: System</b></summary>
        <pre class="entity-exchange-pre" data-focus-scroll="${escapeHtml(`${keyPrefix}:prompt-system:pre`)}">${escapeHtml(promptSystemText || "(system prompt unavailable)")}</pre>
      </details>
      <details data-focus-key="${escapeHtml(`${keyPrefix}:prompt-user`)}" style="margin-top:6px;" open>
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
      <details data-focus-key="${escapeHtml(`${keyPrefix}:raw`)}" style="margin-top:6px;" open>
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
    this.lastHtml = "";
    this.lastSelectedId = null;
    this.openStateByKey = new Map();
    this.scrollStateByKey = new Map();
    this.rootScrollTop = 0;
    this.interactionUntilMs = 0;
    this.pointerActive = false;
    this.#bindInteractionGuards();
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
    const entityInsights = getEntityInsight(this.state, entity);
    const digest = getCausalDigest(this.state);
    const simSec = fmtSec(this.state.metrics.timeSec);
    const policySec = fmtSec(this.state.ai.lastPolicyResultSec);
    const envSec = fmtSec(this.state.ai.lastEnvironmentResultSec);
    const hp = Number(entity.hp ?? entity.maxHp ?? 0);
    const maxHp = Number(entity.maxHp ?? 0);
    const fsmState = entity.blackboard?.fsm?.state ?? "-";
    const fsmPrev = entity.blackboard?.fsm?.previousState ?? "-";
    const fsmPath = Array.isArray(entity.blackboard?.fsm?.path) ? entity.blackboard.fsm.path.join(" -> ") : "-";
    const aiTargetState = entity.blackboard?.aiTargetState ?? "-";
    const aiTargetMeta = entity.blackboard?.aiTargetMeta ?? null;
    const aiTargetTtl = aiTargetMeta ? Math.max(0, Number(aiTargetMeta.expiresAtSec ?? 0) - Number(this.state.metrics.timeSec ?? 0)) : 0;

    const policyExchangeByGroup = this.state.ai.lastPolicyExchangeByGroup?.[entity.groupId] ?? null;
    const policyExchangeLatest = this.state.ai.lastPolicyExchange ?? null;
    const policyExchange = policyExchangeByGroup ?? policyExchangeLatest;
    const environmentExchange = this.state.ai.lastEnvironmentExchange ?? null;

    // v0.8.2 Round0 02b-casual — engineering block (FSM dump, policy
    // influence weights, decision-time clock, velocity/path debug, AI
    // exchange panels) is semantically "developer telemetry". Casual
    // players surveyed the EntityFocusPanel and reported "NPC click gives
    // me a brain MRI" — we wrap all of these in `.casual-hidden` spans
    // so that body.casual-mode CSS suppresses them without breaking DOM
    // ids (existing tests still query the elements). Power users see them
    // via `?ui=full`. Keep the concise "Role / State / Vitals / Carry"
    // rows above the hr divider always visible — that is the friendly
    // "Needs / Task" summary Suggestion A promised.
    const casualHiddenOpen = `<span class="casual-hidden">`;
    const casualHiddenClose = `</span>`;

    const html = `
      <div class="small"><b>${escapeHtml(entity.displayName ?? entity.id)}</b> <span class="muted">(${escapeHtml(entity.id)})</span></div>
      <div class="small" style="margin-top:4px;"><b>Type:</b> ${escapeHtml(entity.type)}${entity.kind ? ` / ${escapeHtml(entity.kind)}` : ""} | <b>Role:</b> ${escapeHtml(entity.role ?? "-")} | <b>Group:</b> ${escapeHtml(entity.groupId ?? "-")}</div>
      <div class="small"><b>State:</b> ${escapeHtml(entity.stateLabel ?? "-")} | <b>Intent:</b> ${escapeHtml(entity.debug?.lastIntent ?? entity.blackboard?.intent ?? "-")}</div>
      ${casualHiddenOpen}
      <div class="small"><b>FSM:</b> current=${escapeHtml(fsmState)} prev=${escapeHtml(fsmPrev)} | nextPath=${escapeHtml(fsmPath || "-")}</div>
      <div class="small"><b>AI Target:</b> ${escapeHtml(aiTargetState)} | <b>TTL:</b> ${fmtSec(aiTargetTtl)} | <b>Priority:</b> ${fmtNum(aiTargetMeta?.priority ?? 0, 2)} | <b>Source:</b> ${escapeHtml(aiTargetMeta?.source ?? "-")}</div>
      <div class="small"><b>Policy Influence:</b> applied=${String(Boolean(entity.debug?.policyApplied))} | topIntent=${escapeHtml(entity.debug?.policyTopIntent ?? "-")} | topWeight=${fmtNum(entity.debug?.policyTopWeight ?? 0, 2)} | policyDesired=${escapeHtml(entity.debug?.policyDesiredState ?? "-")}</div>
      <div class="small"><b>Decision Time:</b> sim=${simSec} | policyAt=${policySec} | envAt=${envSec}</div>
      ${casualHiddenClose}
      <div class="small"><b>Position:</b> world=${vecFmt(entity.x, entity.z)} tile=(${posTile.ix}, ${posTile.iz})</div>
      ${casualHiddenOpen}
      <div class="small"><b>Velocity:</b> ${vecFmt(entity.vx, entity.vz)} speed=${fmtNum(speed, 3)} | <b>Desired:</b> ${vecFmt(entity.desiredVel?.x, entity.desiredVel?.z)}</div>
      <div class="small"><b>Path:</b> idx=${entity.pathIndex ?? 0}/${pathLen} | next=${nextNode} | target=${target}</div>
      <div class="small"><b>Path Recalc:</b> ${fmtSec(entity.debug?.lastPathRecalcSec)} | <b>Path Grid:</b> ${entity.pathGridVersion ?? "-"} | <b>Path Traffic:</b> ${entity.pathTrafficVersion ?? 0}</div>
      ${casualHiddenClose}
      <div class="small"><b>Vitals:</b> hp=${fmtNum(hp, 1)}/${fmtNum(maxHp, 1)} | hunger=${fmtNum(entity.hunger, 3)} | alive=${String(Boolean(entity.alive ?? true))}</div>
      <div class="small"><b>Carry:</b> food=${fmtNum(entity.carry?.food, 2)} wood=${fmtNum(entity.carry?.wood, 2)} | <b>Attack CD:</b> ${fmtNum(entity.attackCooldownSec ?? 0, 2)}</div>
      <hr style="border:none; border-top:1px solid rgba(53, 94, 129, 0.2); margin:8px 0;" class="casual-hidden" />
      <div class="small casual-hidden"><b>AI Agent Effect</b></div>
      <div class="small casual-hidden"><b>Mode:</b> ${escapeHtml(this.state.ai.mode)} | <b>Policy Source:</b> ${escapeHtml(this.state.ai.lastPolicySource)} | <b>Model:</b> ${escapeHtml(this.state.ai.lastPolicyModel || this.state.metrics.proxyModel || "-")}</div>
      <div class="small casual-hidden"><b>Global Headline:</b> ${escapeHtml(digest.headline)}</div>
      <div class="small casual-hidden"><b>Global Warning:</b> ${escapeHtml(digest.warning)}</div>
      <div class="small casual-hidden"><b>Policy Focus:</b> ${escapeHtml(policyFocus)}</div>
      <div class="small casual-hidden"><b>Policy Summary:</b> ${escapeHtml(policySummary)}</div>
      <div class="small casual-hidden"><b>Top Intents:</b> ${escapeHtml(topIntent)}</div>
      <div class="small casual-hidden"><b>Top Targets:</b> ${escapeHtml(topTargets)}</div>
      <div class="small casual-hidden"><b>Policy Notes:</b> ${escapeHtml(policyNotes)}</div>
      <div class="small casual-hidden" style="margin-top:4px;">${escapeHtml(aiImpact)}</div>
      <div class="small casual-hidden" style="margin-top:4px;"><b>Decision Context:</b> ${escapeHtml(entityInsights.join(" | ") || "none")}</div>
      <div class="small casual-hidden"><b>Target Selection:</b> score=${fmtNum(entity.debug?.policyTargetScore ?? 0, 2)} | frontier=${fmtNum(entity.debug?.policyTargetFrontier ?? 0, 2)} | depot=${fmtNum(entity.debug?.policyTargetDepot ?? 0, 2)} | load=${fmtNum(entity.debug?.policyTargetWarehouseLoad ?? 0, 2)} | ecology=${fmtNum(entity.debug?.policyTargetEcology ?? 0, 2)}</div>
      <details data-focus-key="focus:path-nodes" class="casual-hidden" style="margin-top:8px;">
        <summary class="small"><b>Path Nodes</b></summary>
        <div class="small" style="margin-top:6px; white-space:normal;">${entity.path ? entity.path.map((n) => `(${n.ix},${n.iz})`).join(" -> ") : "none"}</div>
      </details>
      <details data-focus-key="focus:last-ai-exchange" class="casual-hidden" style="margin-top:8px;" open>
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
