// src/simulation/ai/colony/proposers/LogisticsProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Ported verbatim from ColonyDirectorSystem.js:175-187 (parent commit
// 93497ba) — logistics phase block (4 sub-rules).
//
// All sub-rules are INDEPENDENT (no chain). They fire alongside the
// BootstrapProposer's outputs; the downstream sort+dedup in
// `assessColonyNeeds` keeps the higher-priority record per type. This
// is why bootstrap @82 supersedes logistics @70 for warehouse: same
// type, higher priority wins after sort.
//
//   warehouse @70  — buildings.warehouses < PHASE_TARGETS.logistics.warehouses (4)
//   farm      @68  — buildings.farms      < PHASE_TARGETS.logistics.farms (6)
//   lumber    @66  — buildings.lumbers    < PHASE_TARGETS.logistics.lumbers (5)
//   road      @60  — buildings.roads      < PHASE_TARGETS.logistics.roads (20)
//
// Caller responsibility: skipped during recoveryMode (see
// ColonyDirectorSystem.js for the gating logic).

const LOGISTICS_TARGETS = Object.freeze({
  warehouses: 4,
  farms: 6,
  lumbers: 5,
  roads: 20,
});

/** @type {import("../BuildProposer.js").BuildProposer} */
export const LogisticsProposer = Object.freeze({
  name: "logistics",
  evaluate(_state, ctx) {
    const b = ctx.buildings ?? {};
    const out = [];
    if ((b.warehouses ?? 0) < LOGISTICS_TARGETS.warehouses) {
      out.push({ type: "warehouse", priority: 70, reason: "logistics: need warehouses" });
    }
    if ((b.farms ?? 0) < LOGISTICS_TARGETS.farms) {
      out.push({ type: "farm", priority: 68, reason: "logistics: need more farms" });
    }
    if ((b.lumbers ?? 0) < LOGISTICS_TARGETS.lumbers) {
      out.push({ type: "lumber", priority: 66, reason: "logistics: need more lumbers" });
    }
    if ((b.roads ?? 0) < LOGISTICS_TARGETS.roads) {
      out.push({ type: "road", priority: 60, reason: "logistics: need more roads" });
    }
    return out;
  },
});
