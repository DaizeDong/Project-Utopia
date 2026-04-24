// v0.8.2 Round-5b Wave-1 (01e Step 4) — AIPolicyTimelinePanel.
//
// Read-only Debug subpanel that renders state.ai.policyHistory (bounded
// ring of up to 32 policy-change entries populated by NPCBrainSystem.update
// on focus/source flips). Shows the most recent 12 entries in reverse-
// chronological order so players can see "what did the Director just
// decide?" without chasing transient state.lastPolicyBatch churn.
//
// Mount: attach to #aiPolicyTimelinePanelBody (created in index.html by the
// debug panel lifecycle). Missing root → no-op (safe in headless tests).

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAgo(nowSec, atSec) {
  const delta = Math.max(0, Number(nowSec ?? 0) - Number(atSec ?? 0));
  if (delta < 60) return `${delta.toFixed(1)}s ago`;
  const mins = Math.floor(delta / 60);
  return `${mins}m ${Math.floor(delta % 60)}s ago`;
}

function formatRow(entry, nowSec) {
  const ago = formatAgo(nowSec, entry.atSec);
  const badge = escapeHtml(entry.badgeState ?? entry.source ?? "unknown");
  const focus = escapeHtml(entry.focus ?? "");
  const errSuffix = entry.errorKind && entry.errorKind !== "none"
    ? ` <span class="muted">(${escapeHtml(entry.errorKind)})</span>`
    : "";
  const modelSuffix = entry.model ? ` <span class="muted">${escapeHtml(entry.model)}</span>` : "";
  return `<li class="small">[${ago}] <b>${badge}</b> ${focus}${modelSuffix}${errSuffix}</li>`;
}

export class AIPolicyTimelinePanel {
  constructor(state) {
    this.state = state;
    this.root = typeof document !== "undefined"
      ? document.getElementById("aiPolicyTimelinePanelBody")
      : null;
    this.lastHtml = "";
  }

  render() {
    if (!this.root) return;
    const history = Array.isArray(this.state?.ai?.policyHistory)
      ? this.state.ai.policyHistory
      : [];
    const nowSec = Number(this.state?.metrics?.timeSec ?? 0);
    if (history.length === 0) {
      const html = `<div class="small muted">No policy changes yet.</div>`;
      if (html === this.lastHtml) return;
      this.lastHtml = html;
      this.root.innerHTML = html;
      return;
    }
    const rows = history.slice(0, 12).map((e) => formatRow(e, nowSec)).join("\n");
    const html = `<ul style="list-style:none;padding:0;margin:0;">${rows}</ul>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
