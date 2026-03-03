function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtSec(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n >= 0 ? `${n.toFixed(1)}s` : "-";
}

function prettyJson(value) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function renderExchangeCard(title, exchange) {
  if (!exchange) {
    return `
      <details style="margin-top:8px;" open>
        <summary class="small"><b>${escapeHtml(title)}</b></summary>
        <div class="small muted" style="margin-top:6px;">No exchange captured yet.</div>
      </details>
    `;
  }

  const status = [
    `source=${escapeHtml(exchange.source || "-")}`,
    `fallback=${String(Boolean(exchange.fallback))}`,
    `model=${escapeHtml(exchange.model || "-")}`,
    `at=${fmtSec(exchange.simSec)}`,
  ].join(" | ");

  return `
    <details style="margin-top:8px;" open>
      <summary class="small"><b>${escapeHtml(title)}</b></summary>
      <div class="small" style="margin-top:6px;">${status}</div>
      <div class="small"><b>Endpoint:</b> ${escapeHtml(exchange.endpoint || "-")} | <b>Error:</b> ${escapeHtml(exchange.error || "none")}</div>
      <details style="margin-top:6px;" open>
        <summary class="small"><b>Prompt Input: System</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(exchange.promptSystem || "(system prompt unavailable)")}</pre>
      </details>
      <details style="margin-top:6px;" open>
        <summary class="small"><b>Prompt Input: User</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(exchange.promptUser || "(user prompt unavailable)")}</pre>
      </details>
      <details style="margin-top:6px;">
        <summary class="small"><b>Request Payload</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(prettyJson(exchange.requestPayload) || "(empty)")}</pre>
      </details>
      <details style="margin-top:6px;">
        <summary class="small"><b>Request Summary</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(prettyJson(exchange.requestSummary) || "(empty)")}</pre>
      </details>
      <details style="margin-top:6px;" open>
        <summary class="small"><b>Raw Model Content</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(String(exchange.rawModelContent ?? "(empty)"))}</pre>
      </details>
      <details style="margin-top:6px;">
        <summary class="small"><b>Parsed Before Validation</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(prettyJson(exchange.parsedBeforeValidation) || "(empty)")}</pre>
      </details>
      <details style="margin-top:6px;">
        <summary class="small"><b>Guarded Output</b></summary>
        <pre class="entity-exchange-pre">${escapeHtml(prettyJson(exchange.guardedOutput) || "(empty)")}</pre>
      </details>
    </details>
  `;
}

export class AIExchangePanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("aiExchangePanelBody");
    this.lastHtml = "";
  }

  render() {
    if (!this.root) return;
    const policy = this.state.ai.lastPolicyExchange ?? null;
    const environment = this.state.ai.lastEnvironmentExchange ?? null;

    const html = `
      <div class="small muted">Shows exact prompt input and model output for demo/debug.</div>
      ${renderExchangeCard("Policy Exchange", policy)}
      ${renderExchangeCard("Environment Exchange", environment)}
    `;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}

