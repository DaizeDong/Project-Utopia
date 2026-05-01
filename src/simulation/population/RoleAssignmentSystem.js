import { BALANCE } from "../../config/balance.js";
import { ROLE } from "../../config/constants.js";
import { releaseBuilderSite } from "../construction/ConstructionSites.js";


function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * v0.8.3 role-transition cleanup (Bug B) — assign a new role to a worker AND
 * release the JobReservation slot held under the old role so the now-vacated
 * tile is available to other workers immediately. We deliberately do NOT
 * clear `targetTile` / `path` / `blackboard.lastIntent` here: WorkerAISystem
 * already detects role/intent mismatch on its next maybeRetarget tick and
 * replans. Eager path-nuking here measurably degraded long-horizon
 * throughput because RoleAssignmentSystem fires every managerInterval and
 * even brief FARM↔HAUL oscillations would trash in-flight paths every cycle.
 *
 * `worker.carry` is intentionally NOT cleared — the new role's deposit
 * logic in WorkerAISystem can drop carry at any warehouse, and clearing
 * here would silently destroy resources (Bug D parity).
 */
function setWorkerRole(state, worker, newRole) {
  if (!worker) return;
  const currentRole = worker.role;
  if (currentRole === newRole) return;
  if (state?._jobReservation && typeof state._jobReservation.releaseAll === "function") {
    state._jobReservation.releaseAll(worker.id);
  }
  // v0.8.6 Tier 2 BH3: when transitioning OUT of BUILDER, release any builder-
  // site reservation so a demoted ex-BUILDER doesn't permanently hold a
  // construction site's `builderId` slot. Pre-fix, the site was wasted until
  // the worker died — reservations cleared via JobReservation are a different
  // datum (per-tile reservations) and didn't touch ConstructionSites.builderId.
  if (currentRole === "BUILDER" && newRole !== "BUILDER") {
    releaseBuilderSite(state, worker);
  }
  worker.role = newRole;
}

/**
 * v0.8.2 Round-5b Wave-1 (01b Step 2) — find the population-band entry for
 * worker count `n` from BALANCE.roleQuotaScaling.bandTable. Returns `null`
 * if `n` exceeds every band (caller should fall through to perWorker path).
 * @param {number} n
 * @param {Array<{minPop:number,maxPop:number,allow:object}>} bandTable
 */
function findBand(n, bandTable) {
  if (!Array.isArray(bandTable)) return null;
  for (const band of bandTable) {
    if (!band) continue;
    const lo = Number(band.minPop ?? 0);
    const hi = Number(band.maxPop ?? -1);
    if (n >= lo && n <= hi) return band;
  }
  return null;
}

/**
 * v0.8.2 Round-5b Wave-1 (01b Step 2) — derive the pop-aware default
 * specialist quotas. At low pop (n<=7) consult the explicit bandTable so
 * 0-valued entries stay 0 (no minFloor=1 promotion → no 6-way contention
 * for a single slot). At n>=8 fall through to the Wave-1 perWorker×floor
 * formula (retained verbatim for seed=7/42 bit-identity).
 * @param {number} n — worker count
 * @returns {{cook:number,smith:number,herbalist:number,haul:number,stone:number,herbs:number}}
 */
function computePopulationAwareQuotas(n) {
  const s = BALANCE.roleQuotaScaling ?? {};
  const minFloor = Number(s.minFloor ?? 1);
  const bandTable = Array.isArray(s.bandTable) ? s.bandTable : [];
  const band = findBand(n, bandTable);
  if (band && band.allow) {
    // Band-hit: return the discrete allow table verbatim. 0 values stay 0,
    // which is the whole point of this refactor (Round 5b mandate #2).
    return {
      cook: Number(band.allow.cook ?? 0),
      smith: Number(band.allow.smith ?? 0),
      herbalist: Number(band.allow.herbalist ?? 0),
      haul: Number(band.allow.haul ?? 0),
      stone: Number(band.allow.stone ?? 0),
      herbs: Number(band.allow.herbs ?? 0),
    };
  }
  // Fall-through (n >= 8): keep Wave-1 perWorker formula unchanged.
  const scale = (perWorker) => {
    const pw = Number(perWorker ?? 0);
    if (!(pw > 0)) return minFloor;
    return Math.max(minFloor, Math.floor(n * pw));
  };
  return {
    cook: scale(s.cookPerWorker),
    smith: scale(s.smithPerWorker),
    herbalist: scale(s.herbalistPerWorker),
    haul: scale(s.haulPerWorker),
    stone: scale(s.stonePerWorker),
    herbs: scale(s.herbsPerWorker),
  };
}

/**
 * v0.8.2 Round-5 Wave-1 (02d Step 4) — pick the top-`n` agents from `pool`
 * by the given skill key (higher is better), mutating nothing. Agents
 * without a skill entry default to 0. Returns `{ picked, remaining }`
 * where `picked` has n (or fewer) best-matched workers and `remaining`
 * preserves the original order of the rest.
 * @param {Array} pool
 * @param {string} skillKey
 * @param {number} n
 * @returns {{ picked: Array, remaining: Array }}
 */
function pickBestForRole(pool, skillKey, n) {
  if (!Array.isArray(pool) || pool.length === 0 || n <= 0) {
    return { picked: [], remaining: pool ?? [] };
  }
  const indexed = pool.map((agent, idx) => ({
    agent,
    idx,
    skill: Number(agent.skills?.[skillKey] ?? 0),
  }));
  // Sort by skill desc; ties broken by original index for determinism.
  indexed.sort((a, b) => {
    if (b.skill !== a.skill) return b.skill - a.skill;
    return a.idx - b.idx;
  });
  const pickSet = new Set();
  const picked = [];
  for (let i = 0; i < Math.min(n, indexed.length); i += 1) {
    picked.push(indexed[i].agent);
    pickSet.add(indexed[i].idx);
  }
  const remaining = pool.filter((_, idx) => !pickSet.has(idx));
  return { picked, remaining };
}

export class RoleAssignmentSystem {
  constructor() {
    this.name = "RoleAssignmentSystem";
    this.timer = 0;
    // v0.8.11 worker-AI bare-init responsiveness (Fix 4) — track the last
    // observed sites/buildings totals so a player rapid-placing blueprints
    // doesn't have to wait up to managerIntervalSec (1.2s) before workers
    // are reassigned as BUILDERs. When either count changes mid-cooldown
    // we force the timer to zero on the next tick.
    this._lastSitesCount = -1;
    this._lastBuildingsSum = -1;
  }

  update(dt, state) {
    // v0.8.11 Fix 4 — early-fire trigger when sitesCount or building totals
    // changed since the last assignment pass. Cheap O(1) sum comparison.
    const sitesCountNow = Array.isArray(state?.constructionSites) ? state.constructionSites.length : 0;
    const buildingsSumNow = Number(state.buildings?.farms ?? 0)
      + Number(state.buildings?.lumbers ?? 0)
      + Number(state.buildings?.quarries ?? 0)
      + Number(state.buildings?.herbGardens ?? 0)
      + Number(state.buildings?.kitchens ?? 0)
      + Number(state.buildings?.smithies ?? 0)
      + Number(state.buildings?.clinics ?? 0)
      + Number(state.buildings?.warehouses ?? 0);
    if (this.timer > 0 && (sitesCountNow !== this._lastSitesCount || buildingsSumNow !== this._lastBuildingsSum)) {
      this.timer = 0;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = BALANCE.managerIntervalSec;
    this._lastSitesCount = sitesCountNow;
    this._lastBuildingsSum = buildingsSumNow;

    const allWorkers = state.agents.filter((a) => a.type === "WORKER");

    // v0.8.3 worker-vs-raider combat — GUARD allocation. Threat-driven hint
    // published by ColonyPlanner (`state.ai.fallbackHints.pendingGuardCount`)
    // tells us how many GUARDs the colony needs this tick. Promote up to
    // that many workers BEFORE the regular farm/wood/specialist allocation
    // runs. Promoted GUARDs are excluded from the rest of the allocation so
    // their role isn't overwritten. Cap at `BALANCE.threatGuardCap` and
    // never strip below 1 economy-side worker.
    const totalWorkerCount = allWorkers.length;
    const guardCap = Math.max(0, Math.min(
      Number(BALANCE.threatGuardCap ?? 4),
      Math.max(0, totalWorkerCount - 1),
    ));
    // Two sources contribute to the requested guard count:
    //   (a) explicit hint via state.ai.fallbackHints.pendingGuardCount
    //       (one-shot from ColonyPlanner / LLM reassign_role steps)
    //   (b) live combat posture via state.metrics.combat — keeps GUARDs
    //       on watch as long as a hostile raider is in range, so the hint
    //       does not need to be re-emitted every tick.
    //
    // Live promotion is gated to RAIDERS only (not all predators). Wolves
    // and bears that wander near the colony while hunting deer should not
    // pull farmers off their crops — workers' built-in counter-attack and
    // existing predator AI handle those incidental encounters. GUARDs are
    // specifically a raider response, matching the raider-beast threat
    // model in this milestone. This also prevents long-horizon DevIndex
    // regressions caused by economy workers being repeatedly drafted into
    // GUARD when ambient wildlife passes within range.
    const hintGuards = Math.max(0, Number(state.ai?.fallbackHints?.pendingGuardCount ?? 0) | 0);
    const combat = state.metrics?.combat ?? null;
    const activeRaiders = Number(combat?.activeRaiders ?? 0);
    // v0.8.7 T0-4 (QA1-H2): saboteurs are also a hostile-threat type that
    // should pull GUARD draft. MortalitySystem.recomputeCombatMetrics now
    // populates `combat.activeSaboteurs`; treat raiders+saboteurs as a
    // combined threat headcount so a saboteur breach without raiders still
    // promotes guards (was dead-field pre-fix — saboteurs were invisible to
    // RoleAssignmentSystem, leaving farms exposed during pure-saboteur runs).
    const activeSaboteurs = Number(combat?.activeSaboteurs ?? 0);
    const totalActiveThreats = activeRaiders + activeSaboteurs;
    const nearestDist = Number(combat?.nearestThreatDistance ?? -1);
    // Tight proximity gate (~6 tiles) keeps the live-promotion responsive
    // for actual raids while avoiding any ambient draft.
    const proximityGate = 6;
    const liveTargetGuards = (totalActiveThreats > 0 && nearestDist > 0 && nearestDist <= proximityGate)
      ? Math.min(guardCap, Math.max(1, totalActiveThreats * Number(BALANCE.targetGuardsPerThreat ?? 1)))
      : 0;
    const requestedGuards = Math.max(0, Math.min(
      guardCap,
      Math.max(hintGuards, liveTargetGuards),
    ));
    if (state.ai?.fallbackHints && "pendingGuardCount" in state.ai.fallbackHints) {
      delete state.ai.fallbackHints.pendingGuardCount;
    }
    const currentGuardSet = new Set(allWorkers.filter((w) => w.role === "GUARD"));
    let guards = [];
    if (requestedGuards > 0) {
      // Prefer existing guards (preserves attackCooldown pacing); top up
      // from workers nearest to the active threat so the new guard can
      // engage in the same tick rather than running across the map.
      guards = Array.from(currentGuardSet).slice(0, requestedGuards);
      const need = requestedGuards - guards.length;
      if (need > 0) {
        // Find the nearest threat anchor for ordering. Falls back to
        // farming-skill ascending when no live predator is recorded yet.
        // v0.8.7 T0-4: include hostile saboteurs (state.agents VISITORs) as
        // threat anchors so guard top-up orders by distance to whichever
        // hostile is closest (saboteurs live in agents[], predators in animals[]).
        let threat = null;
        let threatD2 = Infinity;
        for (const a of state.animals ?? []) {
          if (!a || a.alive === false) continue;
          if (a.kind !== "PREDATOR") continue;
          for (const w of allWorkers) {
            const dx = a.x - w.x;
            const dz = a.z - w.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < threatD2) {
              threatD2 = d2;
              threat = a;
            }
          }
        }
        for (const v of state.agents ?? []) {
          if (!v || v.alive === false) continue;
          if (v.type !== "VISITOR" || v.kind !== "SABOTEUR") continue;
          for (const w of allWorkers) {
            const dx = v.x - w.x;
            const dz = v.z - w.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < threatD2) {
              threatD2 = d2;
              threat = v;
            }
          }
        }
        const candidates = allWorkers
          .filter((w) => !currentGuardSet.has(w))
          .map((w, i) => ({
            w,
            i,
            skill: Number(w.skills?.farming ?? 0),
            distToThreat: threat
              ? (threat.x - w.x) * (threat.x - w.x) + (threat.z - w.z) * (threat.z - w.z)
              : Infinity,
          }))
          .sort((a, b) => {
            if (threat) {
              if (a.distToThreat !== b.distToThreat) return a.distToThreat - b.distToThreat;
            }
            if (a.skill !== b.skill) return a.skill - b.skill;
            return a.i - b.i;
          });
        for (let i = 0; i < need && i < candidates.length; i += 1) {
          guards.push(candidates[i].w);
        }
      }
    }
    const guardSet = new Set(guards);
    for (const w of guards) setWorkerRole(state, w, "GUARD");
    // Any current GUARD that didn't make the cut reverts to FARM (the
    // economy-side allocator below will pick them up correctly because
    // they're now in the `workers` pool with a non-GUARD role).
    for (const w of currentGuardSet) {
      if (!guardSet.has(w)) setWorkerRole(state, w, "FARM");
    }

    // v0.8.4 building-construction (Agent A) — BUILDER allocation. Sized
    // by `clamp(ceil(sites * builderPerSite), builderMin, builderMax)` and
    // never strips below the GUARD count + 1 economy worker. Sites empty
    // ⇒ all current BUILDERs revert to FARM (the economy allocator will
    // re-spread them).
    const sitesArr = Array.isArray(state?.constructionSites) ? state.constructionSites : [];
    const sitesCount = sitesArr.length;
    const builderPerSite = Number(BALANCE.builderPerSite ?? 1.5);
    const builderMin = Math.max(0, Number(BALANCE.builderMin ?? 0));
    const builderMax = Math.max(0, Number(BALANCE.builderMax ?? 6));
    let targetBuilders = sitesCount > 0
      ? Math.ceil(sitesCount * builderPerSite)
      : 0;
    targetBuilders = Math.max(builderMin, Math.min(builderMax, targetBuilders));
    // v0.8.6 Tier 3 BC3: enforce BALANCE.builderMaxFraction (default 0.30) so
    // a small population with ambitious construction queues can't drain
    // economy workers into BUILDER. Pre-fix the constant existed in balance.js
    // but was never read — 5 of 7 workers could end up BUILDER while food
    // production crashed. Floor result so 1 builder is always allowed when
    // sites exist.
    const builderMaxFraction = Number(BALANCE.builderMaxFraction ?? 0.30);
    // v0.8.11 worker-AI bare-init responsiveness (Fix 1) — when no functional
    // economy buildings exist (bare-init bootstrap) AND blueprints are pending,
    // the fractionCap of 0.30 strands workers as wandering FARMs against
    // farms=0 → StatePlanner returns "wander". Bypass the fraction cap during
    // this narrow bootstrap window so the colony can actually build itself
    // out of the bare state. economyHeadroom still enforces the "leave ≥1
    // non-GUARD economy worker" invariant so the colony can't strip itself
    // entirely into BUILDERs.
    const economyBuildingsSum = Number(state.buildings?.farms ?? 0)
      + Number(state.buildings?.lumbers ?? 0)
      + Number(state.buildings?.quarries ?? 0)
      + Number(state.buildings?.herbGardens ?? 0)
      + Number(state.buildings?.kitchens ?? 0)
      + Number(state.buildings?.smithies ?? 0)
      + Number(state.buildings?.clinics ?? 0)
      + Number(state.buildings?.warehouses ?? 0);
    const noEconomyBootstrap = economyBuildingsSum === 0 && sitesCount > 0;
    if (sitesCount > 0 && !noEconomyBootstrap) {
      const fractionCap = Math.max(1, Math.floor(totalWorkerCount * builderMaxFraction));
      targetBuilders = Math.min(targetBuilders, fractionCap);
    }
    // Don't draft more BUILDERs than the post-GUARD pool can spare while
    // still leaving at least one non-GUARD economy worker.
    const economyHeadroom = Math.max(0, totalWorkerCount - guards.length - 1);
    targetBuilders = Math.min(targetBuilders, economyHeadroom);

    const currentBuilderSet = new Set(allWorkers.filter((w) => w.role === "BUILDER" && !guardSet.has(w)));
    let builders = [];
    if (targetBuilders > 0) {
      // Prefer existing BUILDERs (preserve site reservation), then
      // top-up with the nearest idle worker to a site centroid. Falls back
      // to spawn order so determinism is preserved.
      builders = Array.from(currentBuilderSet).slice(0, targetBuilders);
      const need = targetBuilders - builders.length;
      if (need > 0) {
        const candidates = allWorkers
          .filter((w) => !guardSet.has(w) && !currentBuilderSet.has(w))
          .map((w, i) => {
            let nearestSiteDist = Infinity;
            for (const s of sitesArr) {
              if (!s) continue;
              const dx = (s.ix - 0.5) - (w.x ?? 0);
              const dz = (s.iz - 0.5) - (w.z ?? 0);
              const d = Math.abs(dx) + Math.abs(dz);
              if (d < nearestSiteDist) nearestSiteDist = d;
            }
            return { w, i, dist: nearestSiteDist };
          })
          .sort((a, b) => {
            if (a.dist !== b.dist) return a.dist - b.dist;
            return a.i - b.i;
          });
        for (let i = 0; i < need && i < candidates.length; i += 1) {
          builders.push(candidates[i].w);
        }
      }
    }
    const builderSet = new Set(builders);
    for (const w of builders) setWorkerRole(state, w, "BUILDER");
    // Any current BUILDER that didn't make the cut reverts to FARM. When
    // sites empty (targetBuilders === 0) this drains the entire BUILDER pool.
    for (const w of currentBuilderSet) {
      if (!builderSet.has(w)) setWorkerRole(state, w, "FARM");
    }

    // The rest of the allocator works on `workers` (non-GUARD, non-BUILDER pool).
    const workers = allWorkers.filter((w) => !guardSet.has(w) && !builderSet.has(w));
    const n = workers.length;
    if (n === 0) {
      // All workers are guards or builders — still publish counts and bail.
      state.metrics ??= {};
      state.metrics.roleCounts = {
        FARM: 0, WOOD: 0, STONE: 0, HERBS: 0, COOK: 0, SMITH: 0, HERBALIST: 0, HAUL: 0,
        GUARD: guards.length,
        BUILDER: builders.length,
      };
      return;
    }

    // v0.8.2 Round-5 Wave-1 (01b Step 6) — consume the ColonyPlanner's
    // `reassign_role` hint once per tick. Planner emits this on its Priority
    // 3.75 "idle processing chain" branch; PlanExecutor writes to
    // `state.ai.fallbackHints.pendingRoleBoost` as a noop and we read +
    // clear the signal here, constituting the closed feedback loop
    // ColonyPlanner → state.ai → RoleAssignmentSystem.
    const hints = state.ai?.fallbackHints ?? null;
    const roleBoostHint = hints?.pendingRoleBoost ? String(hints.pendingRoleBoost) : null;
    if (hints && roleBoostHint) {
      delete hints.pendingRoleBoost;
    }

    let targetFarmRatio = state.controls.farmRatio;
    const doctrineBias = Number(state.gameplay?.modifiers?.farmBias ?? 0);
    targetFarmRatio = clamp(targetFarmRatio + doctrineBias, 0, 1);
    const workerPolicy = state.ai.groupPolicies.get("workers")?.data;
    if (workerPolicy?.intentWeights?.farm && workerPolicy?.intentWeights?.wood) {
      const farmW = Number(workerPolicy.intentWeights.farm);
      const woodW = Number(workerPolicy.intentWeights.wood);
      const sum = farmW + woodW;
      if (sum > 0) {
        targetFarmRatio = farmW / sum;
      }
    }

    targetFarmRatio = clamp(targetFarmRatio, BALANCE.objectiveFarmRatioMin, BALANCE.objectiveFarmRatioMax);

    // Count existing building types
    const quarryCount = Number(state.buildings?.quarries ?? 0);
    const kitchenCount = Number(state.buildings?.kitchens ?? 0);
    const smithyCount = Number(state.buildings?.smithies ?? 0);
    const herbGardenCount = Number(state.buildings?.herbGardens ?? 0);
    const clinicCount = Number(state.buildings?.clinics ?? 0);
    const lumberCount = Number(state.buildings?.lumbers ?? 0);

    // Reserve minimum slots for FARM and WOOD.
    const farmMin = Math.min(2, n);
    const woodMin = (lumberCount > 0) ? Math.min(1, n - farmMin) : 0;
    const reserved = farmMin + woodMin;

    // Allocate specialist roles from remaining pool.
    //
    // v0.8.2 Round-1 02a-rimworld-veteran — slot caps per role were originally
    // sourced from `state.controls.roleQuotas` (player-exposed sliders) with
    // legacy defaults of {cook:1,smith:1,...}.
    //
    // v0.8.2 Round-5 Wave-1 (01b Step 2 + 02a Step 2) — caps now come from
    // `min(scaledByPopulation, playerMaxFromSlider)`. `computePopulationAware
    // Quotas(n)` derives the scaled value from BALANCE.roleQuotaScaling;
    // `state.controls.roleQuotas` is treated as the player's upper bound. The
    // sentinel 99 ("unlimited") lets the scaled formula dominate. Gating
    // (kitchen for COOK, warehouse+pop>=haulMinPopulation for HAUL, etc.)
    // is preserved; `specialistBudget` still hard-caps the sum.
    const playerMax = state.controls?.roleQuotas ?? null;
    const scaledQuotas = computePopulationAwareQuotas(n);
    const q = (key) => {
      const scaled = Math.max(0, Math.floor(Number(scaledQuotas[key] ?? 0)));
      if (!playerMax || !(key in playerMax)) return scaled;
      const playerCap = Math.max(0, (Number(playerMax[key]) | 0));
      return Math.min(scaled, playerCap);
    };
    let specialistBudget = Math.max(0, n - reserved);

    // v0.8.2 Round-5 Wave-1 (01b Step 3) — emergency override: when food is
    // critically low, drop specialist slots (cook/smith/herbalist) to the
    // emergency floor so the freed budget falls through to FARM.
    const emergencyActive = state.resources.food < BALANCE.foodEmergencyThreshold;
    const emergencyFloor = Math.max(0, Number(BALANCE.roleQuotaScaling?.emergencyOverrideCooks ?? 1));
    const applyEmergency = (raw) => (emergencyActive ? Math.min(raw, emergencyFloor) : raw);

    // v0.8.2 Round-5b Wave-1 (01b Step 4) — FARM cannibalise safety valve.
    // At pop=4 bandTable yields cook=1 but reserved=farmMin(2)+woodMin(1)=3,
    // leaving specialistBudget=0 → cookSlots=min(1,0)=0. This branch detects
    // the all-zeros specialistBudget at low pop, and if food is comfortably
    // above emergency threshold + kitchen already exists + cooldown elapsed,
    // borrows a single FARM reserve slot to unblock the cook. The FARM
    // reserve is decremented via `cannibalisedFarmSlots`, which is later
    // subtracted from the `remaining` distribution pool.
    const cannibaliseEnabled = Boolean(BALANCE.roleQuotaScaling?.farmCannibaliseEnabled);
    const cannibaliseMult = Number(BALANCE.roleQuotaScaling?.farmCannibaliseFoodMult ?? 1.5);
    const cannibaliseCooldownTicks = Math.max(0, Number(BALANCE.roleQuotaScaling?.farmCannibaliseCooldownTicks ?? 3));
    state.ai ??= {};
    state.ai.roleAssignMemo ??= { cannibaliseLastTick: -999 };
    const memo = state.ai.roleAssignMemo;
    const nowTick = Number(state.tick ?? state.metrics?.tickCount ?? state.metrics?.timeSec ?? 0);
    const foodStockForCann = Number(state.resources?.food ?? 0);
    const foodEmergency = Number(BALANCE.foodEmergencyThreshold ?? 14);
    const foodSafe = foodStockForCann > foodEmergency * cannibaliseMult;
    const cannibaliseReady = (nowTick - Number(memo.cannibaliseLastTick ?? -999)) >= cannibaliseCooldownTicks;
    let cannibalisedFarmSlots = 0;

    let cookSlots = (kitchenCount > 0) ? Math.min(applyEmergency(q("cook")), specialistBudget) : 0;

    // If the allocation-loss pattern is present (kitchen exists + q('cook')
    // > 0 + but specialistBudget=0), consume ONE FARM reserve slot as a
    // conditional override. Protected by food safety, cooldown, and a hard
    // floor of at least 1 FARM always preserved.
    if (cannibaliseEnabled && kitchenCount > 0 && cookSlots === 0 && specialistBudget === 0
        && foodSafe && cannibaliseReady && (farmMin - cannibalisedFarmSlots) > 1
        && applyEmergency(q("cook")) >= 1) {
      cannibalisedFarmSlots += 1;
      memo.cannibaliseLastTick = nowTick;
      cookSlots = 1;
      // Note: do NOT decrement specialistBudget (it is already 0); FARM
      // reserve is decremented below via `remaining - cannibalisedFarmSlots`.
    }
    let smithSlots = 0;
    let herbalistSlots = 0;
    // Compute specialist slots sequentially; assign after the full picture so
    // the pipeline-idle boost can steal from FARM reserve when needed.
    specialistBudget -= cookSlots;
    // If cannibalise fired we took from FARM, not from the specialistBudget
    // that was already 0 — keep budget floor at 0.
    if (specialistBudget < 0) specialistBudget = 0;

    smithSlots = (smithyCount > 0) ? Math.min(applyEmergency(q("smith")), specialistBudget) : 0;
    specialistBudget -= smithSlots;

    herbalistSlots = (clinicCount > 0) ? Math.min(applyEmergency(q("herbalist")), specialistBudget) : 0;
    specialistBudget -= herbalistSlots;

    // Task 2: When stone < 20 and a quarry exists, force at least 2 STONE
    // workers so the mine is never left unstaffed during a shortage.
    let stoneSlots = 0;
    if (quarryCount > 0) {
      const baseStone = q("stone");
      const urgentStone = (state.resources?.stone ?? 999) < 20 ? Math.max(baseStone, 2) : baseStone;
      stoneSlots = Math.min(urgentStone, specialistBudget);
    }
    specialistBudget -= stoneSlots;

    const herbsSlots = (herbGardenCount > 0) ? Math.min(q("herbs"), specialistBudget) : 0;
    specialistBudget -= herbsSlots;

    // HAUL role: gate on n>=haulMinPopulation + warehouseCount>=1 (01b Step 2
    // lowered from n>=10 to configurable haulMinPopulation=8 so early
    // populations don't rely on producer carry-back).
    const warehouseCount = Number(state.buildings?.warehouses ?? 0);
    const haulMinPop = Number(BALANCE.roleQuotaScaling?.haulMinPopulation ?? 8);
    const haulSlots = (warehouseCount >= 1 && n >= haulMinPop) ? Math.min(q("haul"), specialistBudget) : 0;
    specialistBudget -= haulSlots;

    // v0.8.2 Round-5 Wave-1 (01b Step 4) — pipeline-idle boost: if the
    // building exists but the specialist slot came out 0, try to force a
    // single slot while the raw material is sufficient (food/stone/herbs).
    // One slot is stolen from the FARM reserve (by decrementing
    // `specialistBudget`-steal-from-farm-remaining via `remaining`). The
    // boost is gated on the same fallbackIdleChainThreshold the planner
    // uses for its reassign_role hint — so the two systems agree on "is the
    // pipeline idle".
    const idleThreshold = Number(BALANCE.fallbackIdleChainThreshold ?? 15);
    const foodStock = Number(state.resources?.food ?? 0);
    const stoneStock = Number(state.resources?.stone ?? 0);
    const herbsStock = Number(state.resources?.herbs ?? 0);
    // foodRate via recent metrics (not always populated — fall back to +1 so
    // kitchen boost still fires in steady state). 01b Step 4 allows
    // `foodRate >= 0`; treating unknowns as 0 is fine for the boost.
    const foodRate = Number(state.metrics?.foodRatePerMin ?? state.metrics?.food?.rate ?? 0);
    let pipelineIdleBoostStolenFromFarm = 0;
    // v0.8.2 Round-5 Wave-1 — the boost only steals from the specialist
    // budget, never from the FARM reserve. Stealing from FARM was too
    // aggressive at low populations (seed=1 @ day 30→90 regressed 36→26)
    // and the explicit ColonyPlanner `pendingRoleBoost` path already routes
    // a targeted boost when the LLM/fallback considers the pipeline idle.
    const tryBoost = (current, gate) => {
      if (current > 0) return current;
      if (!gate) return current;
      if (specialistBudget >= 1) {
        specialistBudget -= 1;
        return 1;
      }
      return 0;
    };
    // v0.8.2 Round-5 Wave-1 — pipeline-idle boost only fires when raw stock
    // is well above the idle threshold AND we're not in emergency. We intentionally
    // gate on 2× the idle threshold so a marginal food situation doesn't
    // preempt the FARM reserve and dent long-horizon survival (seed 42 @ day
    // 90 benchmark risk — see summary.md § 6).
    //
    // v0.8.2 Round-6 Wave-1 (01b-structural) — inline tryBoost ALSO gates on
    // q(role) >= 1 so bandTable explicit zeros (smith=0/herbalist=0 at pop<8)
    // are not bypassed. The `pendingRoleBoost` hint path (from ColonyPlanner LLM)
    // still overrides the band — it's a deliberate "emergency override band" escape
    // hatch per plan Risk 3 decision. The inline boost has no such authority.
    void foodRate;  // reserved for Wave 2 foodRate breakdown wire-up
    if (!emergencyActive) {
      cookSlots = tryBoost(cookSlots, kitchenCount > 0 && foodStock >= idleThreshold * 2 && q("cook") >= 1);
      smithSlots = tryBoost(smithSlots, smithyCount > 0 && stoneStock >= 10 && q("smith") >= 1);
      herbalistSlots = tryBoost(herbalistSlots, clinicCount > 0 && herbsStock >= 6 && q("herbalist") >= 1);
    }

    // v0.8.2 Round-5 Wave-1 (01b Step 6) — consume `pendingRoleBoost` hint
    // from ColonyPlanner. The hint boosts cookSlots/smithSlots/herbalistSlots
    // by 1 (bounded by remaining budget + farm-steal) for this tick only.
    if (roleBoostHint) {
      const key = roleBoostHint.toUpperCase();
      if (key === "COOK" && kitchenCount > 0) {
        cookSlots = tryBoost(cookSlots, true);
      } else if (key === "SMITH" && smithyCount > 0) {
        smithSlots = tryBoost(smithSlots, true);
      } else if (key === "HERBALIST" && clinicCount > 0) {
        herbalistSlots = tryBoost(herbalistSlots, true);
      }
    }

    // Distribute remaining between FARM and WOOD using targetFarmRatio.
    // v0.8.2 Round-5b Wave-1 (01b Step 4) — subtract cannibalisedFarmSlots
    // so the FARM reserve actually gives up the borrowed slot to the cook.
    const remaining = Math.max(0, farmMin + woodMin + specialistBudget - cannibalisedFarmSlots);
    const emergency = emergencyActive;
    let effectiveRatio = emergency ? Math.max(targetFarmRatio, 0.82) : targetFarmRatio;

    // Dynamic resource balance: proportionally shift ratio toward the deficit resource
    if (!emergency) {
      const food = state.resources.food ?? 0;
      const wood = state.resources.wood ?? 0;
      const total = food + wood;
      if (total > 0) {
        // Current food share vs target (0.5 = balanced)
        const foodShare = food / total;
        // Shift away from the surplus: if foodShare > 0.5, reduce farm ratio
        const imbalance = (foodShare - 0.5) * 0.4; // scale factor
        effectiveRatio = clamp(effectiveRatio - imbalance, 0.25, 0.85);
      }
    }
    // v0.8.2 Round-5b Wave-1 (01b Step 4) — effective FARM floor drops by
    // cannibalise borrows so the redistribution below does not re-force
    // farmMin back up and undo the cook borrow.
    const farmMinEffective = Math.max(1, farmMin - cannibalisedFarmSlots);
    let totalFarm = Math.round(remaining * effectiveRatio);
    totalFarm = Math.max(farmMinEffective, Math.min(remaining, totalFarm));
    if (remaining - totalFarm < woodMin) {
      totalFarm = Math.max(farmMinEffective, remaining - woodMin);
    }
    let totalWood = remaining - totalFarm;

    // v0.8.2 Round-5 Wave-1 (02d Step 4) — specialty-aware assignment for
    // BUILDING-GATED specialist roles only (COOK/SMITH/HERBALIST/STONE/HERBS).
    // FARM/WOOD/HAUL keep the legacy `workers[idx++]` array-order so the
    // spatial correlation between spawn order and clustered worksites is
    // preserved — spec-ordered skill picks there had a -10 DevIndex drift in
    // the long-horizon benchmark because skill-top workers are not always
    // spatially near farms/lumber (see monotonicity seed=1 Risk note in
    // Round5/Implementations/w1-fallback-loop.commit.md).
    const assignTo = (agents, role) => {
      for (const agent of agents) setWorkerRole(state, agent, role);
    };
    let pool = workers.slice();
    // Specialist picks — building-gated (COOK/SMITH/HERBALIST/STONE/HERBS).
    let res;
    res = pickBestForRole(pool, "cooking",    cookSlots);       assignTo(res.picked, ROLE.COOK);       pool = res.remaining;
    res = pickBestForRole(pool, "crafting",   smithSlots);      assignTo(res.picked, ROLE.SMITH);      pool = res.remaining;
    // HERBALIST uses farming as proxy (no dedicated "herbalism" skill in v0.8.x).
    res = pickBestForRole(pool, "farming",    herbalistSlots);  assignTo(res.picked, ROLE.HERBALIST);  pool = res.remaining;
    res = pickBestForRole(pool, "mining",     stoneSlots);      assignTo(res.picked, ROLE.STONE);      pool = res.remaining;
    res = pickBestForRole(pool, "farming",    herbsSlots);      assignTo(res.picked, ROLE.HERBS);      pool = res.remaining;

    // v0.8.2 Round-5b (02d Step 4) — specialty anti-mismatch for FARM/WOOD/HAUL.
    // Uses a "not-worst-fit" sort: workers whose dominant skill is strongly
    // mismatched for a role (e.g. cooking-specialist in WOOD) are pushed to the
    // back. Tiebreaker = original pool index → preserves spatial cluster locality
    // for workers with equal mismatch penalty.
    const topSkillKey = (agent) => {
      const skills = agent.skills ?? {};
      let best = "generalist"; let bestV = -Infinity;
      for (const k of Object.keys(skills)) {
        const v = Number(skills[k]);
        if (Number.isFinite(v) && v > bestV) { bestV = v; best = k; }
      }
      return best;
    };
    const mismatchPenalty = (role, agent) => {
      const top = topSkillKey(agent);
      if (role === ROLE.FARM) {
        if (top === "farming") return 0;
        if (top === "cooking" || top === "crafting" || top === "mining") return 1;
        return 0.5;
      }
      if (role === ROLE.WOOD) {
        if (top === "woodcutting") return 0;
        if (top === "cooking" || top === "crafting") return 1;
        return 0.5;
      }
      if (role === ROLE.HAUL) {
        if (top === "cooking" || top === "crafting") return 0.75;
        return 0;
      }
      return 0.5;
    };
    const sortByMismatch = (arr, role) =>
      arr.map((agent, i) => ({ agent, i }))
        .sort((a, b) => {
          const da = mismatchPenalty(role, a.agent);
          const db = mismatchPenalty(role, b.agent);
          return da !== db ? da - db : a.i - b.i;
        })
        .map(({ agent }) => agent);

    const farmSorted = sortByMismatch(pool, ROLE.FARM);
    const farmPicked = farmSorted.slice(0, totalFarm);
    for (const a of farmPicked) setWorkerRole(state, a, ROLE.FARM);

    const afterFarm = pool.filter(a => !farmPicked.includes(a));
    const woodSorted = sortByMismatch(afterFarm, ROLE.WOOD);
    const woodPicked = woodSorted.slice(0, totalWood);
    for (const a of woodPicked) setWorkerRole(state, a, ROLE.WOOD);

    const afterWood = afterFarm.filter(a => !woodPicked.includes(a));
    const haulSorted = sortByMismatch(afterWood, ROLE.HAUL);
    const haulPicked = haulSorted.slice(0, haulSlots);
    for (const a of haulPicked) setWorkerRole(state, a, ROLE.HAUL);

    const leftover = afterWood.filter(a => !haulPicked.includes(a));
    for (const a of leftover) setWorkerRole(state, a, ROLE.FARM);

    // v0.8.2 Round-5 Wave-1 (01b Step 5) — publish roleCounts to metrics so
    // ColonyPlanner's Priority 3.75 "idle processing chain" branch can gate
    // on "kitchen exists but COOK=0". Counts reflect the post-assignment
    // distribution.
    state.metrics ??= {};
    const counts = {
      FARM: 0, WOOD: 0, STONE: 0, HERBS: 0,
      COOK: 0, SMITH: 0, HERBALIST: 0, HAUL: 0,
      GUARD: 0, BUILDER: 0,
    };
    for (const worker of allWorkers) {
      const r = worker.role;
      if (r && counts[r] !== undefined) counts[r] += 1;
    }
    state.metrics.roleCounts = counts;
  }
}
