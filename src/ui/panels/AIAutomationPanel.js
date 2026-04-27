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

function sourceBadge(source, fallback, error = "") {
  const src = String(source ?? "none");
  const color = src === "llm" || src === "rule" ? "#57d68d" : (error ? "#ff8b63" : "#f3b85d");
  const label = src === "llm"
    ? "LLM live"
    : src === "rule"
      ? "rule-based active"
      : src === "inactive"
        ? "not wired"
        : (fallback ? "fallback" : src || "none");
  return `<span style="color:${color};font-weight:700;">[${escapeHtml(label)}]</span>`;
}

function latestError(exchange) {
  return String(exchange?.error ?? "").trim();
}

function countActiveTargets(state) {
  const targets = state?.ai?.groupStateTargets;
  return targets instanceof Map ? targets.size : 0;
}

function topPolicyFocus(state) {
  const batch = Array.isArray(state?.ai?.lastPolicyBatch) ? state.ai.lastPolicyBatch : [];
  const worker = batch.find((p) => p?.groupId === "workers") ?? batch[0] ?? null;
  return String(worker?.focus ?? worker?.summary ?? "").trim() || "no policy yet";
}

export class AIAutomationPanel {
  constructor(state) {
    this.state = state;
    this.root = typeof document !== "undefined"
      ? document.getElementById("aiAutomationSummaryBody")
      : null;
    this.lastHtml = "";
  }

  render() {
    if (!this.root) return;
    const state = this.state;
    const ai = state.ai ?? {};
    const enabled = Boolean(ai.enabled);
    const mode = enabled ? "ON" : "OFF";
    const callModeLabel = enabled
      ? "LLM calls enabled when proxy is available"
      : "LLM calls disabled; fallback directors still visible";
    const boundaryCopy = enabled
      ? "Autopilot ON attempts LLM calls for Environment Director, Strategic Director, NPC Brain, and Colony Planner LLM (AgentDirectorSystem) when the proxy/API key is available. Build Automation remains rule-based and serves as AgentDirector's algorithmic fallback when the LLM is unavailable."
      : "Autopilot OFF means player build control is manual and live LLM calls are disabled. The rows below can still update because rule-based simulation directors keep weather, strategy, NPC policy, and build safety rails running.";
    const envExchange = ai.lastEnvironmentExchange ?? null;
    const strategicExchange = ai.lastStrategicExchange ?? null;
    const policyExchange = ai.lastPolicyExchange ?? null;
    const director = ai.colonyDirector ?? null;
    const strategy = ai.strategy ?? {};
    const agentDirector = ai.agentDirector ?? null;
    const agentStats = agentDirector?.stats ?? {};
    const agentMode = agentDirector?.mode ?? "off";
    const activePlan = agentDirector?.activePlan ?? null;
    const plansGenerated = Number(agentStats.plansGenerated ?? 0);
    const plansCompleted = Number(agentStats.plansCompleted ?? 0);
    const plansFailed = Number(agentStats.plansFailed ?? 0);
    const llmFailures = Number(agentStats.llmFailures ?? 0);
    // Pick a status enum that matches neighbouring rows: agent-mode LLM plans
    // count as "llm"; hybrid/algorithmic count as "rule"; never-ticked as
    // inactive; recent llmFailures bumps the badge to a fallback warning.
    const planSource = activePlan?.source ?? null;
    const plannerStatusKind = planSource === "llm"
      ? "llm"
      : (agentMode === "agent" || agentMode === "hybrid" || agentMode === "algorithmic")
        ? "rule"
        : "inactive";
    const plannerHasError = llmFailures > 0;
    const plannerOutput = activePlan
      ? `goal=${activePlan.goal ?? "-"} steps=${Number(activePlan.steps ?? 0)} source=${activePlan.source ?? "-"}`
      : "no active plan (next tick will generate one)";
    const automationRows = [
      {
        title: "Environment Director",
        status: sourceBadge(ai.lastEnvironmentSource, envExchange?.fallback, latestError(envExchange)),
        detail: `Controls weather, event pressure, faction tension. Decisions ${Number(ai.environmentDecisionCount ?? 0)}, LLM ${Number(ai.environmentLlmCount ?? 0)}, last ${fmtSec(ai.lastEnvironmentResultSec)}.`,
        output: envExchange?.decisionResult
          ? `weather=${envExchange.decisionResult.weather ?? "-"} focus=${envExchange.decisionResult.focus ?? "-"}`
          : "no directive applied yet",
      },
      {
        title: "Strategic Director",
        status: sourceBadge(ai.lastStrategySource, strategicExchange?.fallback, latestError(strategicExchange)),
        detail: `Sets colony-level priority and resource focus. Decisions ${Number(ai.strategyDecisionCount ?? 0)}, last ${fmtSec(ai.lastStrategySec)}.`,
        output: `priority=${strategy.priority ?? "-"} phase=${strategy.phase ?? "-"} goal=${strategy.primaryGoal ?? strategy.resourceFocus ?? "-"}`,
      },
      {
        title: "NPC Brain",
        status: sourceBadge(ai.lastPolicySource, policyExchange?.fallback, latestError(policyExchange)),
        detail: `Controls group policies and temporary state targets for workers, traders, saboteurs, herbivores, predators. Decisions ${Number(ai.policyDecisionCount ?? 0)}, LLM ${Number(ai.policyLlmCount ?? 0)}, active targets ${countActiveTargets(state)}.`,
        output: topPolicyFocus(state),
      },
      {
        title: "Build Automation",
        status: sourceBadge("rule", false, ""),
        detail: "Live runtime uses ColonyDirectorSystem, a rule-based builder that repairs scenario routes/depots, places phase buildings, and connects worksites. It is automation, not an LLM call.",
        output: director
          ? `phase=${director.phase ?? "-"} buildsPlaced=${Number(director.buildsPlaced ?? 0)} lastEval=${fmtSec(director.lastEvalSec)}`
          : "not evaluated yet",
      },
      {
        title: "Colony Planner LLM",
        status: sourceBadge(plannerStatusKind, plannerStatusKind !== "llm", plannerHasError ? `${llmFailures} llm failure(s)` : ""),
        detail: `AgentDirectorSystem live (docs/llm-agent-flows.md). mode=${agentMode} plansGenerated=${plansGenerated} plansCompleted=${plansCompleted} plansFailed=${plansFailed} llmFailures=${llmFailures}.`,
        output: plannerOutput,
      },
    ];

    const html = `
      <div class="small" style="margin-bottom:8px;">
        <b>Autopilot ${mode}</b>
        <span class="muted">(${escapeHtml(callModeLabel)})</span>
        <span class="muted"> coverage=${escapeHtml(ai.coverageTarget ?? "fallback")} mode=${escapeHtml(ai.mode ?? "fallback")} proxy=${escapeHtml(state.metrics?.proxyHealth ?? "unknown")} model=${escapeHtml(state.metrics?.proxyModel || ai.lastPolicyModel || ai.lastEnvironmentModel || "-")}</span>
      </div>
      <div class="small muted" style="margin-bottom:8px;">
        ${escapeHtml(boundaryCopy)}
      </div>
      ${automationRows.map((row) => `
        <div class="ai-automation-row" style="border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:7px;margin:6px 0;background:rgba(255,255,255,0.035);">
          <div class="small"><b>${escapeHtml(row.title)}</b> ${row.status}</div>
          <div class="small muted">${escapeHtml(row.detail)}</div>
          <div class="small"><b>Decision:</b> ${escapeHtml(row.output)}</div>
        </div>
      `).join("")}
    `;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.root.innerHTML = html;
  }
}
