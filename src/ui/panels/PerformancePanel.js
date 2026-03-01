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
    this.benchmarkStatusVal = document.getElementById("benchmarkStatusVal");
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

    this.#syncInputLabel();
  }

  #syncInputLabel() {
    if (!this.extraWorkersInput || !this.extraWorkersLabel) return;
    const value = Math.max(0, Math.min(500, this.state.controls.stressExtraWorkers | 0));
    this.extraWorkersInput.value = String(value);
    this.extraWorkersLabel.textContent = String(value);
  }

  render() {
    this.#syncInputLabel();
    const totalAgents = this.state.agents.length + this.state.animals.length;
    if (this.fpsVal) this.fpsVal.textContent = this.state.metrics.averageFps.toFixed(1);
    if (this.frameVal) this.frameVal.textContent = `${this.state.metrics.frameMs.toFixed(2)} ms`;
    if (this.agentVal) this.agentVal.textContent = String(totalAgents);
    if (this.workerVal) this.workerVal.textContent = String(this.state.agents.filter((a) => a.type === "WORKER").length);
    if (this.benchmarkStatusVal) this.benchmarkStatusVal.textContent = `Benchmark: ${this.state.metrics.benchmarkStatus}`;
    if (this.downloadBenchmarkBtn) this.downloadBenchmarkBtn.disabled = !this.state.metrics.benchmarkCsvReady;
  }
}
