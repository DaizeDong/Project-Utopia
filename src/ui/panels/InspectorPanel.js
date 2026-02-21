export class InspectorPanel {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("inspect");
  }

  render() {
    if (!this.root) return;

    const selectedId = this.state.controls.selectedEntityId;
    if (!selectedId) {
      this.root.innerHTML = "<div><b>Selected Entity</b></div><div class='small muted'>Click any unit.</div>";
      return;
    }

    const entity = [...this.state.agents, ...this.state.animals].find((e) => e.id === selectedId);
    if (!entity) {
      this.root.innerHTML = "<div><b>Selected Entity</b></div><div class='small muted'>Not found.</div>";
      return;
    }

    const target = entity.targetTile ? `(${entity.targetTile.ix}, ${entity.targetTile.iz})` : "none";
    const hunger = entity.hunger !== undefined ? entity.hunger.toFixed(2) : "-";
    const carry = entity.carry ? `food=${entity.carry.food}, wood=${entity.carry.wood}` : "-";
    const pathProgress = entity.path ? `${entity.pathIndex}/${entity.path.length}` : "none";

    this.root.innerHTML = `
      <div><b>Selected Entity</b> <span class="muted">(${entity.id})</span></div>
      <div class="small" style="margin-top:6px;"><b>Type:</b> ${entity.type}${entity.kind ? `/${entity.kind}` : ""}</div>
      <div class="small"><b>State:</b> ${entity.stateLabel}</div>
      <div class="small"><b>Role:</b> ${entity.role ?? "N/A"}</div>
      <div class="small"><b>Hunger:</b> ${hunger}</div>
      <div class="small"><b>Carry:</b> ${carry}</div>
      <div class="small"><b>Target Tile:</b> ${target}</div>
      <div class="small"><b>Path:</b> ${pathProgress}</div>
      <div class="hint muted">Intent source: deterministic executor + optional group policy.</div>
    `;
  }
}
