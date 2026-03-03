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
  }

  #renderEnvironmentBlock() {
    const ai = this.state.ai;
    const directive = ai.lastEnvironmentDirective;
    const source = ai.lastEnvironmentSource ?? "none";
    const model = ai.lastEnvironmentModel || this.state.metrics.proxyModel || "-";
    const resultSec = fmtSec(ai.lastEnvironmentResultSec);
    const err = ai.lastEnvironmentError ? escapeHtml(ai.lastEnvironmentError) : "";

    if (!directive) {
      return `
        <div class="small muted">No environment directive applied yet.</div>
        <div class="small muted" style="margin-top:4px;">source=${source} model=${escapeHtml(model)} at=${resultSec}</div>
      `;
    }

    const weather = directive.weather ?? "-";
    const durationSec = directive.durationSec ?? "-";
    const tension = directive.factionTension ?? "-";
    const events = Array.isArray(directive.eventSpawns) ? directive.eventSpawns : [];
    const eventLines = events.length > 0
      ? events.map((e) => `${escapeHtml(e.type)} i=${fmtNum(e.intensity, 2)} d=${fmtNum(e.durationSec, 1)}s`).join("<br/>")
      : "none";

    return `
      <div class="small"><b>source:</b> ${source} | <b>model:</b> ${escapeHtml(model)} | <b>at:</b> ${resultSec}</div>
      <div class="small"><b>weather:</b> ${escapeHtml(weather)} | <b>duration:</b> ${fmtNum(durationSec, 1)}s | <b>tension:</b> ${fmtNum(tension, 2)}</div>
      <div class="small" style="margin-top:4px;"><b>eventSpawns:</b><br/>${eventLines}</div>
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

    if (!policy) {
      return `
        <details style="margin-top:8px;">
          <summary class="small"><b>${escapeHtml(groupId)}</b> (no policy)</summary>
          <div class="small muted" style="margin-top:6px;">source=${source} model=${escapeHtml(model)} at=${resultSec}</div>
          ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
        </details>
      `;
    }

    const intents = summarizeWeights(policy.intentWeights ?? {});
    const targets = summarizeWeights(policy.targetPriorities ?? {});
    const ttl = fmtNum(policy.ttlSec, 1);
    const risk = fmtNum(policy.riskTolerance, 2);

    return `
      <details style="margin-top:8px;" open>
        <summary class="small"><b>${escapeHtml(groupId)}</b> | ttl=${ttl}s | risk=${risk}</summary>
        <div class="small" style="margin-top:6px;"><b>source:</b> ${source} | <b>model:</b> ${escapeHtml(model)} | <b>at:</b> ${resultSec}</div>
        <div class="small"><b>expires:</b> ${expiresAtSec}</div>
        <div class="small"><b>intentWeights:</b> ${escapeHtml(intents)}</div>
        <div class="small"><b>targetPriorities:</b> ${escapeHtml(targets)}</div>
        ${err ? `<div class="small" style="margin-top:4px; color:#a33;"><b>error:</b> ${err}</div>` : ""}
      </details>
    `;
  }

  render() {
    if (!this.root) return;
    const html = `
      <div>
        <div class="small" style="font-weight:700;">World Directive (Parsed)</div>
        <div style="margin-top:6px;">${this.#renderEnvironmentBlock()}</div>
      </div>
      <div style="margin-top:10px;">
        <div class="small" style="font-weight:700;">Group Policies (Parsed)</div>
        ${GROUP_ORDER.map((groupId) => this.#renderPolicyBlock(groupId)).join("")}
      </div>
    `;

    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
