// src/simulation/ai/colony/proposers/BootstrapProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Ported verbatim from ColonyDirectorSystem.js:161-173 (parent commit
// 93497ba) — bootstrap phase block (4 sub-rules).
//
// Each sub-rule is INDEPENDENT (no if-else-if chain): all four can
// fire simultaneously when their building counts are below the
// bootstrap PHASE_TARGETS thresholds.
//
//   warehouse @82  — buildings.warehouses < PHASE_TARGETS.bootstrap.warehouses (3)
//   farm      @80  — buildings.farms      < PHASE_TARGETS.bootstrap.farms (3)
//   lumber    @78  — buildings.lumbers    < PHASE_TARGETS.bootstrap.lumbers (2)
//   road      @75  — buildings.roads      < PHASE_TARGETS.bootstrap.roads (10)
//
// These constants are duplicated from PHASE_TARGETS.bootstrap in
// ColonyDirectorSystem.js to keep the proposer self-contained. If the
// canonical PHASE_TARGETS change, both must update — this is the
// behaviour-preservation cost of the wave-2 extraction.
//
// Caller responsibility: ColonyDirectorSystem skips invoking this
// proposer when recoveryMode is active (matches the legacy
// `if (recoveryMode) ... return;` short-circuit).

const BOOTSTRAP_TARGETS = Object.freeze({
  warehouses: 3,
  farms: 3,
  lumbers: 2,
  roads: 10,
});

/** @type {import("../BuildProposer.js").BuildProposer} */
export const BootstrapProposer = Object.freeze({
  name: "bootstrap",
  evaluate(_state, ctx) {
    const b = ctx.buildings ?? {};
    const out = [];
    if ((b.warehouses ?? 0) < BOOTSTRAP_TARGETS.warehouses) {
      out.push({ type: "warehouse", priority: 82, reason: "bootstrap: need warehouses" });
    }
    if ((b.farms ?? 0) < BOOTSTRAP_TARGETS.farms) {
      out.push({ type: "farm", priority: 80, reason: "bootstrap: need farms" });
    }
    if ((b.lumbers ?? 0) < BOOTSTRAP_TARGETS.lumbers) {
      out.push({ type: "lumber", priority: 78, reason: "bootstrap: need lumbers" });
    }
    if ((b.roads ?? 0) < BOOTSTRAP_TARGETS.roads) {
      out.push({ type: "road", priority: 75, reason: "bootstrap: need roads" });
    }
    return out;
  },
});
