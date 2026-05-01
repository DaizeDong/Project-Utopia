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

// v0.10.1-A6 R2 (Wave-1, plan 2/3, Steps 4-5) — render-time adjacent-group
// dedupe. NPCBrainSystem.update can push the same (badgeState + focus +
// errorKind) repeatedly during fallback-healthy reconnect storms; before
// dedupe the panel showed "9× fallback-healthy rebuild the broken supply
// lane" stacked, drowning the timeline. We collapse runs of equal entries
// (within an 80s window) into a single row tagged `×N last <span>s` while
// keeping non-adjacent or out-of-window repeats as their own group.
const DEDUPE_WINDOW_SEC = 80;

function groupKey(entry) {
  const badge = String(entry.badgeState ?? entry.source ?? "unknown");
  const focus = String(entry.focus ?? "");
  const err = String(entry.errorKind ?? "none");
  return `${badge}|${focus}|${err}`;
}

function dedupeAdjacent(history, limit) {
  // history is reverse-chronological (newest first). We walk left→right
  // accumulating runs whose head atSec − tail atSec ≤ window. When the next
  // entry breaks the key or falls outside the window, we close the current
  // group and start a new one. NaN/undefined atSec falls back to "no fold"
  // so malformed history never crashes the timeline.
  const groups = [];
  for (let i = 0; i < history.length && groups.length < limit; i += 1) {
    const entry = history[i];
    const key = groupKey(entry);
    const head = groups[groups.length - 1];
    const headAt = head ? Number(head.head.atSec) : NaN;
    const entryAt = Number(entry.atSec);
    const sameKey = head && head.key === key;
    const inWindow = Number.isFinite(headAt)
      && Number.isFinite(entryAt)
      && (headAt - entryAt) <= DEDUPE_WINDOW_SEC;
    if (sameKey && inWindow) {
      head.count += 1;
      head.spanSec = headAt - entryAt;
    } else {
      groups.push({ head: entry, key, count: 1, spanSec: 0 });
    }
  }
  return groups;
}

function formatRow(entry, nowSec, count = 1, spanSec = 0) {
  const ago = formatAgo(nowSec, entry.atSec);
  const badge = escapeHtml(entry.badgeState ?? entry.source ?? "unknown");
  const focus = escapeHtml(entry.focus ?? "");
  const errSuffix = entry.errorKind && entry.errorKind !== "none"
    ? ` <span class="muted">(${escapeHtml(entry.errorKind)})</span>`
    : "";
  const modelSuffix = entry.model ? ` <span class="muted">${escapeHtml(entry.model)}</span>` : "";
  const dedupeSuffix = count > 1
    ? ` <span class="muted">×${count} last ${Math.round(spanSec)}s</span>`
    : "";
  return `<li class="small">[${ago}] <b>${badge}</b> ${focus}${modelSuffix}${errSuffix}${dedupeSuffix}</li>`;
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
    const groups = dedupeAdjacent(history, 12);
    const rows = groups
      .map((g) => formatRow(g.head, nowSec, g.count, g.spanSec))
      .join("\n");
    const html = `<ul style="list-style:none;padding:0;margin:0;">${rows}</ul>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
