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

// v0.8.2 Round-5b Wave-1 (01e Step 6) — render a collapsed log of the last
// ≤5 errored/fallback exchanges so players (and testers) can see a history
// of LLM failures without chasing lastPolicyError single-value churn.
// Reads state.ai.policyExchanges + state.ai.environmentExchanges rings.
function renderErrorLogCard(title, exchanges, keyPrefix) {
  const safeList = Array.isArray(exchanges) ? exchanges : [];
  const rows = [];
  for (const ex of safeList) {
    if (!ex) continue;
    if (!ex.error && !ex.fallback) continue;
    const t = fmtSec(ex.simSec);
    const kind = ex.error ? `error: ${ex.error}` : "fallback";
    const endpoint = ex.endpoint ? `endpoint=${escapeHtml(ex.endpoint)}` : "";
    const model = ex.model ? `model=${escapeHtml(ex.model)}` : "";
    rows.push(`<div class="small">[${t}] ${escapeHtml(kind)} ${endpoint} ${model}</div>`);
    if (rows.length >= 5) break;
  }
  const body = rows.length === 0
    ? `<div class="small muted">No LLM errors captured yet.</div>`
    : rows.join("\n");
  return `
    <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:errorLog`)}" style="margin-top:8px;">
      <summary class="small"><b>${escapeHtml(title)}</b></summary>
      ${body}
    </details>
  `;
}

function renderInactiveExchangeCard(title, keyPrefix, reason, detail = "") {
  return `
    <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:root`)}" style="margin-top:8px;" open>
      <summary class="small"><b>${escapeHtml(title)}</b></summary>
      <div class="small" style="margin-top:6px;font-weight:600;"><span style="color:#f3b85d;font-weight:700;">&#9679;</span> NOT WIRED IN LIVE RUNTIME</div>
      <div class="small muted" style="margin-top:4px;">${escapeHtml(reason)}</div>
      ${detail ? `<div class="small" style="margin-top:4px;"><b>Decision:</b> ${escapeHtml(detail)}</div>` : ""}
    </details>
  `;
}

function renderExchangeCard(title, exchange, keyPrefix) {
  if (!exchange) {
    return `
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:root`)}" style="margin-top:8px;" open>
        <summary class="small"><b>${escapeHtml(title)}</b></summary>
        <div class="small muted" style="margin-top:6px;">No exchange captured yet.</div>
      </details>
    `;
  }

  const isLlm = exchange.source === "llm";
  const badgeColor = isLlm ? "#4caf50" : "#ff9800";
  const badgeDot = `<span style="color:${badgeColor};font-weight:700;">&#9679;</span>`;
  const latencyPart = exchange.latencyMs != null ? ` | ${Number(exchange.latencyMs).toFixed(0)}ms` : "";
  const modelPart = exchange.model ? ` ${escapeHtml(exchange.model)}${latencyPart}` : latencyPart;
  const sourceLabel = isLlm ? `LLM${modelPart}` : "RULE-BASED";
  const badgeLine = `${badgeDot} ${sourceLabel} at T=${fmtSec(exchange.simSec)}`;

  const status = [
    `source=${escapeHtml(exchange.source || "-")}`,
    `fallback=${String(Boolean(exchange.fallback))}`,
    `model=${escapeHtml(exchange.model || "-")}`,
    `at=${fmtSec(exchange.simSec)}`,
  ].join(" | ");

  return `
    <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:root`)}" style="margin-top:8px;" open>
      <summary class="small"><b>${escapeHtml(title)}</b></summary>
      <div class="small" style="margin-top:6px;font-weight:600;">${badgeLine}</div>
      <div class="small" style="margin-top:2px;">${status}</div>
      <div class="small"><b>Endpoint:</b> ${escapeHtml(exchange.endpoint || "-")} | <b>Error:</b> ${escapeHtml(exchange.error || "none")}</div>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:prompt-system`)}" style="margin-top:6px;" open>
        <summary class="small"><b>Prompt Input: System</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:prompt-system:pre`)}">${escapeHtml(exchange.promptSystem || "(system prompt unavailable)")}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:prompt-user`)}" style="margin-top:6px;" open>
        <summary class="small"><b>Prompt Input: User</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:prompt-user:pre`)}">${escapeHtml(exchange.promptUser || "(user prompt unavailable)")}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:request-payload`)}" style="margin-top:6px;">
        <summary class="small"><b>Request Payload</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:request-payload:pre`)}">${escapeHtml(prettyJson(exchange.requestPayload) || "(empty)")}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:request-summary`)}" style="margin-top:6px;">
        <summary class="small"><b>Request Summary</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:request-summary:pre`)}">${escapeHtml(prettyJson(exchange.requestSummary) || "(empty)")}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:raw`)}" style="margin-top:6px;" open>
        <summary class="small"><b>Raw Model Content</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:raw:pre`)}">${escapeHtml(String(exchange.rawModelContent ?? "(empty)"))}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:parsed`)}" style="margin-top:6px;">
        <summary class="small"><b>Parsed Before Validation</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:parsed:pre`)}">${escapeHtml(prettyJson(exchange.parsedBeforeValidation) || "(empty)")}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:guarded`)}" style="margin-top:6px;">
        <summary class="small"><b>Guarded Output</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:guarded:pre`)}">${escapeHtml(prettyJson(exchange.guardedOutput) || "(empty)")}</pre>
      </details>
      <details data-ai-exchange-key="${escapeHtml(`${keyPrefix}:decision`)}" style="margin-top:6px;" open>
        <summary class="small"><b>Decision Result</b></summary>
        <pre class="entity-exchange-pre" data-ai-exchange-scroll="${escapeHtml(`${keyPrefix}:decision:pre`)}">${escapeHtml(prettyJson(exchange.decisionResult ?? exchange.guardedOutput) || "(empty)")}</pre>
      </details>
    </details>
  `;
}

export class AIExchangePanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("aiExchangePanelBody");
    this.lastHtml = "";
    this.openStateByKey = new Map();
    this.scrollStateByKey = new Map();
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
    const details = this.root.querySelectorAll("details[data-ai-exchange-key]");
    for (const node of details) {
      const key = node.dataset.aiExchangeKey;
      if (!key) continue;
      this.openStateByKey.set(key, Boolean(node.open));
    }
  }

  #restoreOpenStates() {
    if (!this.root) return;
    const details = this.root.querySelectorAll("details[data-ai-exchange-key]");
    for (const node of details) {
      const key = node.dataset.aiExchangeKey;
      if (!key || !this.openStateByKey.has(key)) continue;
      node.open = Boolean(this.openStateByKey.get(key));
    }
  }

  #captureScrollStates() {
    if (!this.root) return;
    this.rootScrollTop = Number(this.root.scrollTop ?? 0);
    const scrollables = this.root.querySelectorAll("[data-ai-exchange-scroll]");
    for (const node of scrollables) {
      const key = node.dataset.aiExchangeScroll;
      if (!key) continue;
      this.scrollStateByKey.set(key, Number(node.scrollTop ?? 0));
    }
  }

  #restoreScrollStates() {
    if (!this.root) return;
    this.root.scrollTop = Number(this.rootScrollTop ?? 0);
    const scrollables = this.root.querySelectorAll("[data-ai-exchange-scroll]");
    for (const node of scrollables) {
      const key = node.dataset.aiExchangeScroll;
      if (!key || !this.scrollStateByKey.has(key)) continue;
      node.scrollTop = Number(this.scrollStateByKey.get(key) ?? 0);
    }
  }

  render() {
    if (!this.root) return;
    this.#captureOpenStates();
    this.#captureScrollStates();
    const ai = this.state.ai ?? {};
    const environment = ai.lastEnvironmentExchange ?? null;
    const strategic = ai.lastStrategicExchange ?? null;
    const policy = ai.lastPolicyExchange ?? null;
    const planner = ai.lastColonyPlannerExchange ?? ai.lastPlannerExchange ?? null;

    const environmentExchanges = ai.environmentExchanges ?? [];
    const strategicExchanges = ai.strategicExchanges ?? [];
    const policyExchanges = ai.policyExchanges ?? [];
    const html = `
      <div class="small muted">Categories match docs/llm-agent-flows.md. Each live card shows prompt input, raw model output, validated output, and the final decision applied to simulation state.</div>
      ${renderExchangeCard("Environment Director", environment, "environment")}
      ${renderExchangeCard("Strategic Director", strategic, "strategic")}
      ${renderExchangeCard("NPC Brain", policy, "npc-brain")}
      ${planner
        ? renderExchangeCard("Colony Planner", planner, "colony-planner")
        : renderInactiveExchangeCard(
          "Colony Planner",
          "colony-planner",
          "docs/llm-agent-flows.md defines this LLM flow, but GameApp currently wires rule-based ColonyDirectorSystem instead of AgentDirectorSystem/ColonyPlanner.",
          "No live Colony Planner LLM calls can appear until that system is wired into GameApp.",
        )}
      ${renderErrorLogCard("Last LLM errors (environment)", environmentExchanges, "environment")}
      ${renderErrorLogCard("Last LLM errors (strategic)", strategicExchanges, "strategic")}
      ${renderErrorLogCard("Last LLM errors (npc brain)", policyExchanges, "npc-brain")}
    `;
    if (html === this.lastHtml) return;
    if (this.#isUserInteracting()) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
    this.#restoreOpenStates();
    this.#restoreScrollStates();
  }
}
