import { getAiInsight, getCausalDigest } from "../interpretation/WorldExplain.js";

const GROUP_ORDER = Object.freeze(["workers", "traders", "saboteurs", "herbivores", "predators"]);

function fmtNum(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function fmtSec(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n >= 0 ? `${n.toFixed(1)}s` : "-";
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function summarizeWeights(weights = {}) {
  const rows = Object.entries(weights)
    .map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return "none";
  return rows.slice(0, 4).map(([k, v]) => `${k}:${fmtNum(v, 2)}`).join(" | ");
}

export class AIDecisionPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("aiDecisionPanelBody");
    this.lastHtml = "";
    this.openStateByKey = new Map();
    this.rootScrollTop = 0;
    this.pointerActive = false;
    this.interactionUntilMs = 0;
    this.#bindInteractionGuards();
  }

  #nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  #bumpInteractionWindow(ms = 850) {
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
        this.#bumpInteractionWindow(1300);
      },
      true,
    );
    const clearPointer = () => {
      this.pointerActive = false;
      this.#bumpInteractionWindow(320);
    };
    window.addEventListener("pointerup", clearPointer);
    window.addEventListener("pointercancel", clearPointer);
    window.addEventListener("blur", clearPointer);

    this.root.addEventListener(
      "wheel",
      () => this.#bumpInteractionWindow(950),
      { passive: true, capture: true },
    );
    this.root.addEventListener(
      "scroll",
      () => this.#bumpInteractionWindow(850),
      { passive: true, capture: true },
    );
  }

  #captureOpenStates() {
    if (!this.root) return;
    const details = this.root.querySelectorAll("details[data-ai-decision-key]");
    for (const node of details) {
      const key = node.dataset.aiDecisionKey;
      if (!key) continue;
      this.openStateByKey.set(key, Boolean(node.open));
    }
  }

  #restoreOpenStates() {
    if (!this.root) return;
    const details = this.root.querySelectorAll("details[data-ai-decision-key]");
    for (const node of details) {
      const key = node.dataset.aiDecisionKey;
      if (!key || !this.openStateByKey.has(key)) continue;
      node.open = Boolean(this.openStateByKey.get(key));
    }
  }

  #renderCausalChain() {
    const digest = getCausalDigest(this.state);
    const aiInsight = getAiInsight(this.state);
    const evidence = Array.isArray(digest.evidence) && digest.evidence.length > 0
      ? digest.evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
      : "<li>Evidence unavailable.</li>";

    return `
      <details data-ai-decision-key="causal:root" style="margin-bottom:10px;" open>
        <summary class="small"><b>Live Causal Chain</b> | ${escapeHtml(digest.headline)}</summary>
        <div class="small" style="margin-top:6px;"><b>Severity:</b> ${escapeHtml(digest.severity)} | <b>Headline:</b> ${escapeHtml(digest.headline)}</div>
        <div class="small"><b>Next move:</b> ${escapeHtml(digest.action)}</div>
        <div class="small"><b>Warning focus:</b> ${escapeHtml(digest.warning)}</div>
        <div class="small"><b>AI summary:</b> ${escapeHtml(aiInsight.summary)}</div>
        <ul class="small" style="margin:6px 0 0 18px; padding:0;">${evidence}</ul>
      </details>
    `;
  }

  #renderEnvironmentBlock() {
    const ai = this.state.ai;
    const directive = ai.lastEnvironmentDirective;
    const source = ai.lastEnvironmentSource ?? "none";
    const model = ai.lastEnvironmentModel || this.state.metrics.proxyModel || "-";
    const resultSec = fmtSec(ai.lastEnvironmentResultSec);
    const err = ai.lastEnvironmentError ? escapeHtml(ai.lastEnvironmentError) : "";

    const isLlm = source === "llm";
    const badgeColor = isLlm ? "#4caf50" : "#ff9800";
    const badgeDot = `<span style="color:${badgeColor};font-weight:700;">&#9679;</span>`;
    const sourceLabel = isLlm ? `LLM (${escapeHtml(model)})` : "RULE-BASED";
    const badgeLine = `${badgeDot} ${sourceLabel} at T=${resultSec}`;

    if (!directive) {
      return `
        <div class="small" style="font-weight:600;margin-bottom:4px;">${badgeLine}</div>
        <div class="small muted">No environment directive applied yet.</div>
        <div class="small muted" style="margin-top:4px;">source=${source} model=${escapeHtml(model)} at=${resultSec}</div>
      `;
    }

    const weather = directive.weather ?? "-";
    const durationSec = directive.durationSec ?? "-";
    const tension = directive.factionTension ?? "-";
    const focus = escapeHtml(directive.focus ?? "none");
    const summary = escapeHtml(directive.summary ?? "none");
    const notes = Array.isArray(directive.steeringNotes) && directive.steeringNotes.length > 0
      ? directive.steeringNotes.map((note) => escapeHtml(note)).join("<br/>")
      : "none";
    const events = Array.isArray(directive.eventSpawns) ? directive.eventSpawns : [];
    const eventLines = events.length > 0
      ? events.map((e) => `${escapeHtml(e.type)} i=${fmtNum(e.intensity, 2)} d=${fmtNum(e.durationSec, 1)}s`).join("<br/>")
      : "none";

    return `
      <div class="small" style="font-weight:600;margin-bottom:4px;">${badgeLine}</div>
      <div class="small"><b>source:</b> ${source} | <b>model:</b> ${escapeHtml(model)} | <b>at:</b> ${resultSec}</div>
      <div class="small"><b>weather:</b> ${escapeHtml(weather)} | <b>duration:</b> ${fmtNum(durationSec, 1)}s | <b>tension:</b> ${fmtNum(tension, 2)}</div>
      <div class="small"><b>focus:</b> ${focus}</div>
      <div class="small"><b>summary:</b> ${summary}</div>
      <div class="small"><b>steeringNotes:</b><br/>${notes}</div>
      <div class="small" style="margin-top:4px;"><b>eventSpawns:</b><br/>${eventLines}</div>
      ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
    `;
  }

  #renderStrategicBlock() {
    const ai = this.state.ai;
    const strategy = ai.strategy ?? null;
    const source = ai.lastStrategySource ?? "none";
    const model = ai.lastStrategyModel || this.state.metrics.proxyModel || "-";
    const resultSec = fmtSec(ai.lastStrategySec);
    const err = ai.lastStrategyError ? escapeHtml(ai.lastStrategyError) : "";

    const isLlm = source === "llm";
    const badgeColor = isLlm ? "#4caf50" : "#ff9800";
    const badgeDot = `<span style="color:${badgeColor};font-weight:700;">&#9679;</span>`;
    const sourceLabel = isLlm ? `LLM (${escapeHtml(model)})` : "RULE-BASED";
    const badgeLine = `${badgeDot} ${sourceLabel} at T=${resultSec}`;

    if (!strategy) {
      return `
        <div class="small" style="font-weight:600;margin-bottom:4px;">${badgeLine}</div>
        <div class="small muted">No strategic decision applied yet.</div>
        ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
      `;
    }

    const budget = strategy.resourceBudget ?? {};
    const constraints = Array.isArray(strategy.constraints) && strategy.constraints.length > 0
      ? strategy.constraints.map((line) => escapeHtml(line)).join("<br/>")
      : "none";

    return `
      <div class="small" style="font-weight:600;margin-bottom:4px;">${badgeLine}</div>
      <div class="small"><b>source:</b> ${escapeHtml(source)} | <b>model:</b> ${escapeHtml(model)} | <b>at:</b> ${resultSec}</div>
      <div class="small"><b>priority:</b> ${escapeHtml(strategy.priority ?? "-")} | <b>phase:</b> ${escapeHtml(strategy.phase ?? "-")} | <b>risk:</b> ${fmtNum(strategy.riskTolerance, 2)}</div>
      <div class="small"><b>resourceFocus:</b> ${escapeHtml(strategy.resourceFocus ?? "-")} | <b>workerFocus:</b> ${escapeHtml(strategy.workerFocus ?? "-")} | <b>defense:</b> ${escapeHtml(strategy.defensePosture ?? "-")}</div>
      <div class="small"><b>goal:</b> ${escapeHtml(strategy.primaryGoal ?? "none")}</div>
      <div class="small"><b>reserve:</b> wood=${fmtNum(budget.reserveWood, 0)} food=${fmtNum(budget.reserveFood, 0)}</div>
      <div class="small"><b>constraints:</b><br/>${constraints}</div>
      ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
    `;
  }

  #renderPolicyBlock(groupId) {
    const ai = this.state.ai;
    const latestBatch = Array.isArray(ai.lastPolicyBatch) ? ai.lastPolicyBatch : [];
    const batchPolicy = latestBatch.find((p) => p?.groupId === groupId) ?? null;
    const policyWrap = ai.groupPolicies.get(groupId) ?? null;
    const policy = batchPolicy ?? policyWrap?.data ?? null;
    const expiresAtSec = fmtSec(policyWrap?.expiresAtSec);
    const source = ai.lastPolicySource ?? "none";
    const model = ai.lastPolicyModel || this.state.metrics.proxyModel || "-";
    const resultSec = fmtSec(ai.lastPolicyResultSec);
    const err = ai.lastPolicyError ? escapeHtml(ai.lastPolicyError) : "";
    const groupTarget = ai.groupStateTargets?.get?.(groupId) ?? null;
    const targetTtl = groupTarget ? fmtSec(Number(groupTarget.expiresAtSec ?? 0) - Number(this.state.metrics.timeSec ?? 0)) : "-";

    const isLlm = source === "llm";
    const badgeColor = isLlm ? "#4caf50" : "#ff9800";
    const badgeDot = `<span style="color:${badgeColor};font-weight:700;">&#9679;</span>`;
    const sourceLabel = isLlm ? `LLM (${escapeHtml(model)})` : "RULE-BASED";
    const badgeLine = `${badgeDot} ${sourceLabel} at T=${resultSec}`;

    if (!policy) {
      return `
        <details data-ai-decision-key="${escapeHtml(`policy:${groupId}`)}" style="margin-top:8px;">
          <summary class="small"><b>${escapeHtml(groupId)}</b> (no policy)</summary>
          <div class="small" style="margin-top:6px;font-weight:600;">${badgeLine}</div>
          <div class="small muted">source=${source} model=${escapeHtml(model)} at=${resultSec}</div>
          ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
        </details>
      `;
    }

    const intents = summarizeWeights(policy.intentWeights ?? {});
    const targets = summarizeWeights(policy.targetPriorities ?? {});
    const ttl = fmtNum(policy.ttlSec, 1);
    const risk = fmtNum(policy.riskTolerance, 2);
    const focus = escapeHtml(policy.focus ?? "none");
    const summary = escapeHtml(policy.summary ?? "none");
    const notes = Array.isArray(policy.steeringNotes) && policy.steeringNotes.length > 0
      ? policy.steeringNotes.map((note) => escapeHtml(note)).join("<br/>")
      : "none";

    return `
      <details data-ai-decision-key="${escapeHtml(`policy:${groupId}`)}" style="margin-top:8px;" open>
        <summary class="small"><b>${escapeHtml(groupId)}</b> | ttl=${ttl}s | risk=${risk}</summary>
        <div class="small" style="margin-top:6px;font-weight:600;">${badgeLine}</div>
        <div class="small"><b>source:</b> ${source} | <b>model:</b> ${escapeHtml(model)} | <b>at:</b> ${resultSec}</div>
        <div class="small"><b>expires:</b> ${expiresAtSec}</div>
        <div class="small"><b>stateTarget:</b> ${escapeHtml(groupTarget?.targetState ?? "none")} | <b>priority:</b> ${fmtNum(groupTarget?.priority ?? 0, 2)} | <b>targetTTL:</b> ${targetTtl}</div>
        <div class="small"><b>focus:</b> ${focus}</div>
        <div class="small"><b>summary:</b> ${summary}</div>
        <div class="small"><b>intentWeights:</b> ${escapeHtml(intents)}</div>
        <div class="small"><b>targetPriorities:</b> ${escapeHtml(targets)}</div>
        <div class="small"><b>steeringNotes:</b><br/>${notes}</div>
        ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
      </details>
    `;
  }

  render() {
    if (!this.root) return;
    this.#captureOpenStates();
    this.rootScrollTop = Number(this.root.scrollTop ?? 0);
    const html = `
      ${this.#renderCausalChain()}
      <div>
        <div class="small" style="font-weight:700;">World Directive (Parsed)</div>
        <div style="margin-top:6px;">${this.#renderEnvironmentBlock()}</div>
      </div>
      <div style="margin-top:10px;">
        <div class="small" style="font-weight:700;">Strategic Director (Parsed)</div>
        <div style="margin-top:6px;">${this.#renderStrategicBlock()}</div>
      </div>
      <div style="margin-top:10px;">
        <div class="small" style="font-weight:700;">Group Policies (Parsed)</div>
        ${GROUP_ORDER.map((groupId) => this.#renderPolicyBlock(groupId)).join("")}
      </div>
    `;

    if (html === this.lastHtml) return;
    if (this.#isUserInteracting()) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
    this.#restoreOpenStates();
    this.root.scrollTop = this.rootScrollTop;
  }
}
