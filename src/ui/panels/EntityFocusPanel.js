import { worldToTile } from "../../world/grid/Grid.js";

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

export class EntityFocusPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("entityFocusBody");
    this.wrapper = document.getElementById("entityFocusOverlay");
    this.lastHtml = "";
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
    if (group === "visitors") {
      const sabotage = Number(groupPolicy.intentWeights?.sabotage ?? 0);
      return `Visitor sabotage weight=${fmtNum(sabotage)}; higher value increases sabotage pressure.`;
    }
    const topIntent = summarizeTopWeights(groupPolicy.intentWeights ?? {});
    return `Top intents: ${topIntent}`;
  }

  render() {
    if (!this.root || !this.wrapper) return;
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
    const simSec = fmtSec(this.state.metrics.timeSec);
    const policySec = fmtSec(this.state.ai.lastPolicyResultSec);
    const envSec = fmtSec(this.state.ai.lastEnvironmentResultSec);

    const html = `
      <div class="small"><b>${escapeHtml(entity.displayName ?? entity.id)}</b> <span class="muted">(${escapeHtml(entity.id)})</span></div>
      <div class="small" style="margin-top:4px;"><b>Type:</b> ${escapeHtml(entity.type)}${entity.kind ? ` / ${escapeHtml(entity.kind)}` : ""} | <b>Role:</b> ${escapeHtml(entity.role ?? "-")} | <b>Group:</b> ${escapeHtml(entity.groupId ?? "-")}</div>
      <div class="small"><b>State:</b> ${escapeHtml(entity.stateLabel ?? "-")} | <b>Intent:</b> ${escapeHtml(entity.debug?.lastIntent ?? entity.blackboard?.intent ?? "-")}</div>
      <div class="small"><b>Decision Time:</b> sim=${simSec} | policyAt=${policySec} | envAt=${envSec}</div>
      <div class="small"><b>Position:</b> world=${vecFmt(entity.x, entity.z)} tile=(${posTile.ix}, ${posTile.iz})</div>
      <div class="small"><b>Velocity:</b> ${vecFmt(entity.vx, entity.vz)} speed=${fmtNum(speed, 3)} | <b>Desired:</b> ${vecFmt(entity.desiredVel?.x, entity.desiredVel?.z)}</div>
      <div class="small"><b>Path:</b> idx=${entity.pathIndex ?? 0}/${pathLen} | next=${nextNode} | target=${target}</div>
      <div class="small"><b>Path Recalc:</b> ${fmtSec(entity.debug?.lastPathRecalcSec)} | <b>Path Grid:</b> ${entity.pathGridVersion ?? "-"}</div>
      <div class="small"><b>Hunger:</b> ${fmtNum(entity.hunger, 3)} | <b>Carry:</b> food=${fmtNum(entity.carry?.food, 2)} wood=${fmtNum(entity.carry?.wood, 2)}</div>
      <hr style="border:none; border-top:1px solid rgba(53, 94, 129, 0.2); margin:8px 0;" />
      <div class="small"><b>AI Agent Effect</b></div>
      <div class="small"><b>Mode:</b> ${escapeHtml(this.state.ai.mode)} | <b>Policy Source:</b> ${escapeHtml(this.state.ai.lastPolicySource)} | <b>Model:</b> ${escapeHtml(this.state.ai.lastPolicyModel || this.state.metrics.proxyModel || "-")}</div>
      <div class="small"><b>Top Intents:</b> ${escapeHtml(topIntent)}</div>
      <div class="small"><b>Top Targets:</b> ${escapeHtml(topTargets)}</div>
      <div class="small" style="margin-top:4px;">${escapeHtml(aiImpact)}</div>
      <details style="margin-top:8px;">
        <summary class="small"><b>Path Nodes</b></summary>
        <div class="small" style="margin-top:6px; white-space:normal;">${entity.path ? entity.path.map((n) => `(${n.ix},${n.iz})`).join(" -> ") : "none"}</div>
      </details>
    `;

    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}

