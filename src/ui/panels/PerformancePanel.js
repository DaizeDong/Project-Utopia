const SCHEDULE_PRESETS = Object.freeze({
  default: "0,100,200,300,400,500",
  light: "0,50,100,150,200,250",
  heavy: "0,200,400,600,800,1000",
});

function parseScheduleText(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,\s]+/g)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.round(n)));
}

function scheduleToText(schedule = []) {
  return schedule.join(",");
}

export class PerformancePanel {
  constructor(state, handlers) {
    this.state = state;
    this.handlers = handlers;

    this.extraWorkersInput = document.getElementById("extraWorkers");
    this.extraWorkersLabel = document.getElementById("extraWorkersLabel");
    this.applyBtn = document.getElementById("applyStressBtn");
    this.runBenchmarkBtn = document.getElementById("runBenchmarkBtn");
    this.cancelBenchmarkBtn = document.getElementById("cancelBenchmarkBtn");
    this.downloadBenchmarkBtn = document.getElementById("downloadBenchmarkBtn");
    this.pauseBtn = document.getElementById("pauseBtn");
    this.step1Btn = document.getElementById("step1Btn");
    this.step5Btn = document.getElementById("step5Btn");
    this.timeScaleInput = document.getElementById("timeScale");
    this.timeScaleLabel = document.getElementById("timeScaleLabel");
    this.benchmarkStageDurationInput = document.getElementById("benchmarkStageDuration");
    this.benchmarkStageDurationLabel = document.getElementById("benchmarkStageDurationLabel");
    this.benchmarkSampleStartInput = document.getElementById("benchmarkSampleStart");
    this.benchmarkSampleStartLabel = document.getElementById("benchmarkSampleStartLabel");
    this.benchmarkSchedulePreset = document.getElementById("benchmarkSchedulePreset");
    this.benchmarkScheduleInput = document.getElementById("benchmarkScheduleInput");
    this.applyBenchmarkConfigBtn = document.getElementById("applyBenchmarkConfigBtn");

    this.benchmarkStatusVal = document.getElementById("benchmarkStatusVal");
    this.performanceSummaryVal = document.getElementById("performanceSummaryVal");
    // v0.10.1-n (A2 perftrace) — top-systems sub-section is created lazily on
    // first render so it only exists when `?perftrace=1` populated
    // `window.__perftrace`. Stored as `perftraceTopSystemsVal` once created.
    this.perftraceTopSystemsVal = null;
    this.benchmarkLastRunVal = document.getElementById("benchmarkLastRunVal");
    this.simControlVal = document.getElementById("simControlVal");
    this.fpsVal = document.getElementById("fpsVal");
    this.frameVal = document.getElementById("frameVal");
    this.agentVal = document.getElementById("agentVal");
    this.workerVal = document.getElementById("workerCountVal");
    this.workerBreakdownVal = document.getElementById("workerBreakdownVal");
    this.lastBenchmarkUiSignature = "";

    this.extraWorkersInput?.addEventListener("input", () => {
      const value = Number(this.extraWorkersInput.value);
      this.state.controls.stressExtraWorkers = Math.max(0, Math.min(1000, value));
      this.#syncInputLabel();
    });

    this.applyBtn?.addEventListener("click", () => {
      this.handlers?.onSetExtraWorkers?.(this.state.controls.stressExtraWorkers);
    });

    this.runBenchmarkBtn?.addEventListener("click", () => {
      this.handlers?.onRunBenchmark?.();
    });

    this.cancelBenchmarkBtn?.addEventListener("click", () => {
      this.handlers?.onCancelBenchmark?.();
    });

    this.downloadBenchmarkBtn?.addEventListener("click", () => {
      this.handlers?.onDownloadBenchmark?.();
    });

    this.pauseBtn?.addEventListener("click", () => {
      this.handlers?.onPauseToggle?.();
    });

    this.step1Btn?.addEventListener("click", () => {
      this.handlers?.onStepFrame?.();
    });

    this.step5Btn?.addEventListener("click", () => {
      this.handlers?.onStepFrames?.(5);
    });

    this.timeScaleInput?.addEventListener("input", () => {
      const value = Number(this.timeScaleInput.value) / 100;
      this.handlers?.onSetTimeScale?.(value);
      this.#syncTimeScaleLabel();
    });

    this.benchmarkStageDurationInput?.addEventListener("input", () => {
      this.#syncBenchmarkConfigLabels();
      this.#emitBenchmarkConfig();
    });

    this.benchmarkSampleStartInput?.addEventListener("input", () => {
      this.#syncBenchmarkConfigLabels();
      this.#emitBenchmarkConfig();
    });

    this.benchmarkSchedulePreset?.addEventListener("change", () => {
      if (this.benchmarkSchedulePreset.value === "custom") return;
      const presetValue = SCHEDULE_PRESETS[this.benchmarkSchedulePreset.value] ?? SCHEDULE_PRESETS.default;
      if (this.benchmarkScheduleInput) this.benchmarkScheduleInput.value = presetValue;
      this.#emitBenchmarkConfig();
    });

    this.applyBenchmarkConfigBtn?.addEventListener("click", () => {
      this.#emitBenchmarkConfig();
    });

    this.benchmarkScheduleInput?.addEventListener("input", () => {
      if (this.benchmarkSchedulePreset) this.benchmarkSchedulePreset.value = "custom";
    });

    this.#syncInputLabel();
    this.#syncTimeScaleLabel();
    this.#syncBenchmarkConfigSection();
  }

  #isElementFocused(el) {
    return Boolean(el && typeof document !== "undefined" && document.activeElement === el);
  }

  #setFieldValueIfIdle(el, value) {
    if (!el || this.#isElementFocused(el)) return;
    const next = String(value ?? "");
    if (el.value !== next) {
      el.value = next;
    }
  }

  #syncInputLabel() {
    if (!this.extraWorkersInput || !this.extraWorkersLabel) return;
    const value = Math.max(0, Math.min(1000, this.state.controls.stressExtraWorkers | 0));
    this.#setFieldValueIfIdle(this.extraWorkersInput, value);
    this.extraWorkersLabel.textContent = String(value);
  }

  #syncTimeScaleLabel() {
    if (!this.timeScaleInput || !this.timeScaleLabel) return;
    const value = Math.max(0.25, Math.min(8, this.state.controls.timeScale || 1));
    this.#setFieldValueIfIdle(this.timeScaleInput, Math.round(value * 100));
    this.timeScaleLabel.textContent = `${value.toFixed(2)}x`;
  }

  #syncBenchmarkConfigLabels() {
    if (this.benchmarkStageDurationInput && this.benchmarkStageDurationLabel) {
      const value = Math.max(10, Math.min(300, Number(this.benchmarkStageDurationInput.value) || 40)) / 10;
      this.#setFieldValueIfIdle(this.benchmarkStageDurationInput, Math.round(value * 10));
      this.benchmarkStageDurationLabel.textContent = `${value.toFixed(1)}s`;
    }
    if (this.benchmarkSampleStartInput && this.benchmarkSampleStartLabel) {
      const value = Math.max(0, Math.min(300, Number(this.benchmarkSampleStartInput.value) || 12)) / 10;
      this.#setFieldValueIfIdle(this.benchmarkSampleStartInput, Math.round(value * 10));
      this.benchmarkSampleStartLabel.textContent = `${value.toFixed(1)}s`;
    }
  }

  #syncBenchmarkConfigSection() {
    const cfg = this.state.controls.benchmarkConfig ?? {
      schedule: [0, 100, 200, 300, 400, 500],
      stageDurationSec: 4,
      sampleStartSec: 1.2,
    };
    const signature = `${cfg.stageDurationSec}|${cfg.sampleStartSec}|${scheduleToText(cfg.schedule)}`;
    if (signature === this.lastBenchmarkUiSignature) return;
    this.lastBenchmarkUiSignature = signature;

    if (this.benchmarkStageDurationInput) {
      this.#setFieldValueIfIdle(this.benchmarkStageDurationInput, Math.round(cfg.stageDurationSec * 10));
    }
    if (this.benchmarkSampleStartInput) {
      this.#setFieldValueIfIdle(this.benchmarkSampleStartInput, Math.round(cfg.sampleStartSec * 10));
    }
    if (this.benchmarkScheduleInput) {
      this.#setFieldValueIfIdle(this.benchmarkScheduleInput, scheduleToText(cfg.schedule));
    }

    const scheduleText = scheduleToText(cfg.schedule);
    let preset = "custom";
    if (scheduleText === SCHEDULE_PRESETS.default) preset = "default";
    else if (scheduleText === SCHEDULE_PRESETS.light) preset = "light";
    else if (scheduleText === SCHEDULE_PRESETS.heavy) preset = "heavy";
    if (this.benchmarkSchedulePreset) this.#setFieldValueIfIdle(this.benchmarkSchedulePreset, preset);

    this.#syncBenchmarkConfigLabels();
  }

  // v0.10.1-n (A2 perftrace) — append a "Top systems" sub-section under the
  // existing PerformancePanel body when `window.__perftrace` is populated.
  // Reuses the existing `.small.muted` styling so we do not introduce a new
  // UI panel (freeze-policy compliant — additive content in existing panel).
  #renderPerftraceTopSystems() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const trace = window.__perftrace;
    if (!trace || !Array.isArray(trace.topSystems)) {
      if (this.perftraceTopSystemsVal && this.perftraceTopSystemsVal.style.display !== "none") {
        this.perftraceTopSystemsVal.style.display = "none";
      }
      return;
    }
    if (!this.perftraceTopSystemsVal) {
      const anchor = this.performanceSummaryVal;
      if (!anchor || !anchor.parentNode) return;
      const el = document.createElement("div");
      el.id = "perftraceTopSystemsVal";
      el.className = "small muted";
      el.style.marginTop = "3px";
      el.style.maxHeight = "5em";
      el.style.overflowY = "auto";
      el.title = "Top hot systems (A2 perftrace) — sorted by peak ms.";
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
      this.perftraceTopSystemsVal = el;
    }
    if (this.perftraceTopSystemsVal.style.display === "none") {
      this.perftraceTopSystemsVal.style.display = "";
    }
    const parts = ["Top systems:"];
    for (const entry of trace.topSystems) {
      if (!entry || !entry.name) continue;
      parts.push(
        ` ${entry.name} peak=${Number(entry.peak ?? 0).toFixed(2)}ms avg=${Number(entry.avg ?? 0).toFixed(2)}ms`,
      );
    }
    if (parts.length === 1) parts.push(" (no samples yet)");
    this.perftraceTopSystemsVal.textContent = parts.join(" |");
  }

  #emitBenchmarkConfig() {
    if (!this.benchmarkStageDurationInput || !this.benchmarkSampleStartInput || !this.benchmarkScheduleInput) return;
    const stageDurationSec = Math.max(1, Math.min(30, Number(this.benchmarkStageDurationInput.value) / 10));
    const sampleStartSec = Math.max(0, Math.min(30, Number(this.benchmarkSampleStartInput.value) / 10));
    const schedule = parseScheduleText(this.benchmarkScheduleInput.value);
    this.handlers?.onSetBenchmarkConfig?.({ schedule, stageDurationSec, sampleStartSec });
  }

  render() {
    this.#syncInputLabel();
    this.#syncTimeScaleLabel();
    this.#syncBenchmarkConfigSection();

    const totalAgents = this.state.agents.length + this.state.animals.length;
    const stats = this.state.metrics.populationStats ?? null;
    if (this.fpsVal) this.fpsVal.textContent = this.state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${this.state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(stats?.totalEntities ?? totalAgents);
    if (this.workerVal) this.workerVal.textContent = String(stats?.workers ?? this.state.agents.filter((a) => a.type === "WORKER").length);
    if (this.benchmarkStatusVal) this.benchmarkStatusVal.textContent = `Benchmark: ${this.state.metrics.benchmarkStatus}`;
    if (this.performanceSummaryVal) {
      const perf = this.state.metrics.performance ?? {};
      const cap = this.state.metrics.performanceCap ?? {};
      const requested = Number(this.state.controls.timeScale ?? 1);
      const actual = Number(this.state.metrics.timeScaleActualWall ?? requested);
      this.performanceSummaryVal.textContent = `Performance: fps=${this.state.metrics.averageFps.toFixed(1)} work p95=${Number(perf.workFrameP95Ms ?? perf.frameP95Ms ?? 0).toFixed(1)}ms raw p95=${Number(perf.frameP95Ms ?? 0).toFixed(1)}ms raw p99=${Number(perf.frameP99Ms ?? 0).toFixed(1)}ms | target=${requested.toFixed(1)}x actual=${actual.toFixed(1)}x | cap=${cap.active ? cap.reason : "off"} | bottleneck=${perf.bottleneck ?? "sampling"}`;
      this.performanceSummaryVal.title = perf.summary ?? "";
    }
    if (this.benchmarkLastRunVal) {
      const last = this.state.metrics.benchmarkLastRun;
      this.benchmarkLastRunVal.textContent = last
        ? `Last benchmark: ${last.status} | worst load=${last.worstLoad} p95=${Number(last.worstP95FrameMs ?? 0).toFixed(1)}ms | ${last.worstBottleneck}`
        : "Last benchmark: none";
    }
    if (this.simControlVal) {
      const phase = this.state.session?.phase ?? "menu";
      const sim = phase !== "active" ? "locked" : this.state.controls.isPaused ? "paused" : "running";
      const aiLatency = Number(this.state.metrics.aiLatencyMs ?? 0).toFixed(1);
      const frameSim = Number(this.state.metrics.simCpuFrameMs ?? this.state.metrics.simCostMs ?? 0);
      const fixedStep = Number(this.state.metrics.performanceCap?.fixedStepSec ?? this.state.controls.fixedStepSec ?? 1 / 30);
      this.simControlVal.textContent = `Sim: ${phase}/${sim} | simDt=${this.state.metrics.simDt.toFixed(3)} | step=${fixedStep.toFixed(3)} | steps=${this.state.metrics.simStepsThisFrame} | simFrame=${frameSim.toFixed(2)}ms | simLast=${this.state.metrics.simCostMs.toFixed(2)}ms | workFrame=${(this.state.metrics.workFrameMs ?? this.state.metrics.frameMs ?? 0).toFixed(2)}ms | ui=${(this.state.metrics.uiCpuMs ?? 0).toFixed(2)}ms | render=${(this.state.metrics.renderCpuMs ?? 0).toFixed(2)}ms | rawFrame=${(this.state.metrics.rawFrameMs ?? this.state.metrics.frameMs).toFixed(2)}ms | ai=${aiLatency}ms | heap=${this.state.metrics.memoryMb.toFixed(1)}MB`;
    }
    if (this.workerBreakdownVal) {
      const breakdown = this.state.controls.populationBreakdown ?? { baseWorkers: 0, stressWorkers: 0, totalWorkers: 0 };
      this.workerBreakdownVal.textContent = `Workers: base=${breakdown.baseWorkers} stress=${breakdown.stressWorkers} total=${breakdown.totalWorkers}`;
    }
    // v0.10.1-n (A2 perftrace) — render top-3 hot systems below the existing
    // panel body when GameApp has populated `window.__perftrace` (i.e. the
    // user opened with `?perftrace=1`). The container is created lazily and
    // stays hidden / detached when the flag is off so the default casual UI
    // is unchanged.
    this.#renderPerftraceTopSystems();
    if (this.downloadBenchmarkBtn) this.downloadBenchmarkBtn.disabled = !this.state.metrics.benchmarkCsvReady;
    const activePhase = this.state.session?.phase === "active";
    if (this.pauseBtn) {
      this.pauseBtn.textContent = this.state.controls.isPaused ? "Resume" : "Pause";
      this.pauseBtn.disabled = !activePhase;
    }
    if (this.step1Btn) this.step1Btn.disabled = !activePhase;
    if (this.step5Btn) this.step5Btn.disabled = !activePhase;
    if (this.runBenchmarkBtn) this.runBenchmarkBtn.disabled = !activePhase || this.state.controls.isPaused;
    if (this.applyBenchmarkConfigBtn) {
      this.applyBenchmarkConfigBtn.disabled = this.benchmarkSchedulePreset?.value !== "custom";
    }
  }
}
