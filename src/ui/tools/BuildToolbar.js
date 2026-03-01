export class BuildToolbar {
  constructor(state) {
    this.state = state;
    this.toolButtons = Array.from(document.querySelectorAll("button[data-tool]"));
    this.farmRatio = document.getElementById("farmRatio");
    this.farmRatioLabel = document.getElementById("farmRatioLabel");
    this.aiToggle = document.getElementById("aiToggle");
    this.compactToggle = document.getElementById("compactToggle");
    this.uiRoot = document.getElementById("ui");

    this.toolButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool;
        if (!tool) return;
        this.state.controls.tool = tool;
        this.sync();
      });
    });

    this.farmRatio?.addEventListener("input", () => {
      const pct = Number(this.farmRatio.value);
      this.state.controls.farmRatio = Math.max(0, Math.min(1, pct / 100));
      this.sync();
    });

    this.aiToggle?.addEventListener("change", () => {
      this.state.ai.enabled = Boolean(this.aiToggle.checked);
      if (!this.state.ai.enabled) {
        this.state.ai.mode = "fallback";
      }
    });

    this.compactToggle?.addEventListener("change", () => {
      const compact = Boolean(this.compactToggle.checked);
      this.uiRoot?.classList.toggle("compact", compact);
      localStorage.setItem("utopiaCompactMode", compact ? "1" : "0");
    });

    const savedCompact = localStorage.getItem("utopiaCompactMode") === "1";
    if (savedCompact) {
      this.uiRoot?.classList.add("compact");
      if (this.compactToggle) this.compactToggle.checked = true;
    }

    this.sync();
  }

  sync() {
    this.toolButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === this.state.controls.tool);
    });

    if (this.farmRatio && this.farmRatioLabel) {
      const pct = Math.round(this.state.controls.farmRatio * 100);
      this.farmRatio.value = String(pct);
      this.farmRatioLabel.textContent = `${pct}%`;
    }

    if (this.aiToggle) {
      this.aiToggle.checked = this.state.ai.enabled;
    }

    if (this.compactToggle && this.uiRoot) {
      this.compactToggle.checked = this.uiRoot.classList.contains("compact");
    }
  }
}
