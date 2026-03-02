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

    this.benchmarkStatusVal = document.getElementById("benchmarkStatusVal");
    this.simControlVal = document.getElementById("simControlVal");
    this.fpsVal = document.getElementById("fpsVal");
    this.frameVal = document.getElementById("frameVal");
    this.agentVal = document.getElementById("agentVal");
    this.workerVal = document.getElementById("workerCountVal");

    this.extraWorkersInput?.addEventListener("input", () => {
      const value = Number(this.extraWorkersInput.value);
      this.state.controls.stressExtraWorkers = Math.max(0, Math.min(500, value));
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

    this.#syncInputLabel();
    this.#syncTimeScaleLabel();
  }

  #syncInputLabel() {
    if (!this.extraWorkersInput || !this.extraWorkersLabel) return;
    const value = Math.max(0, Math.min(500, this.state.controls.stressExtraWorkers | 0));
    this.extraWorkersInput.value = String(value);
    this.extraWorkersLabel.textContent = String(value);
  }

  #syncTimeScaleLabel() {
    if (!this.timeScaleInput || !this.timeScaleLabel) return;
    const value = Math.max(0.25, Math.min(2, this.state.controls.timeScale || 1));
    this.timeScaleInput.value = String(Math.round(value * 100));
    this.timeScaleLabel.textContent = `${value.toFixed(2)}x`;
  }

  render() {
    this.#syncInputLabel();
    this.#syncTimeScaleLabel();

    const totalAgents = this.state.agents.length + this.state.animals.length;
    if (this.fpsVal) this.fpsVal.textContent = this.state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${this.state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(totalAgents);
    if (this.workerVal) this.workerVal.textContent = String(this.state.agents.filter((a) => a.type === "WORKER").length);
    if (this.benchmarkStatusVal) this.benchmarkStatusVal.textContent = `Benchmark: ${this.state.metrics.benchmarkStatus}`;
    if (this.simControlVal) {
      const sim = this.state.controls.isPaused ? "paused" : "running";
      this.simControlVal.textContent = `Sim: ${sim} | simDt=${this.state.metrics.simDt.toFixed(3)} | steps=${this.state.metrics.simStepsThisFrame} | simCost=${this.state.metrics.simCostMs.toFixed(2)}ms | heap=${this.state.metrics.memoryMb.toFixed(1)}MB`;
    }
    if (this.downloadBenchmarkBtn) this.downloadBenchmarkBtn.disabled = !this.state.metrics.benchmarkCsvReady;
    if (this.pauseBtn) this.pauseBtn.textContent = this.state.controls.isPaused ? "Resume" : "Pause";
    if (this.runBenchmarkBtn) this.runBenchmarkBtn.disabled = this.state.controls.isPaused;
  }
}
