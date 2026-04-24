import { BALANCE } from "../../config/balance.js";
import { ROLE } from "../../config/constants.js";


function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * v0.8.2 Round-5 Wave-1 (01b Step 2 + 02a Step 2) — derive the pop-aware
 * default quotas from BALANCE.roleQuotaScaling. Returns a plain object keyed
 * by role slug (cook/smith/...). Used when `state.controls.roleQuotas` is
 * absent or holds the sentinel 99 "unlimited" marker. `minFloor` (default 1)
 * guarantees a specialist always exists when the gate is satisfied.
 * @param {number} n — worker count
 * @returns {{cook:number,smith:number,herbalist:number,haul:number,stone:number,herbs:number}}
 */
function computePopulationAwareQuotas(n) {
  const s = BALANCE.roleQuotaScaling ?? {};
  const minFloor = Number(s.minFloor ?? 1);
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
  }

  update(dt, state) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = BALANCE.managerIntervalSec;

    const workers = state.agents.filter((a) => a.type === "WORKER");
    const n = workers.length;
    if (n === 0) return;

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

    // Reserve minimum slots for FARM (2) and WOOD (1 if lumber tiles exist)
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

    let cookSlots = (kitchenCount > 0) ? Math.min(applyEmergency(q("cook")), specialistBudget) : 0;
    let smithSlots = 0;
    let herbalistSlots = 0;
    // Compute specialist slots sequentially; assign after the full picture so
    // the pipeline-idle boost can steal from FARM reserve when needed.
    specialistBudget -= cookSlots;

    smithSlots = (smithyCount > 0) ? Math.min(applyEmergency(q("smith")), specialistBudget) : 0;
    specialistBudget -= smithSlots;

    herbalistSlots = (clinicCount > 0) ? Math.min(applyEmergency(q("herbalist")), specialistBudget) : 0;
    specialistBudget -= herbalistSlots;

    const stoneSlots = (quarryCount > 0) ? Math.min(q("stone"), specialistBudget) : 0;
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
    void foodRate;  // reserved for Wave 2 foodRate breakdown wire-up
    if (!emergencyActive) {
      cookSlots = tryBoost(cookSlots, kitchenCount > 0 && foodStock >= idleThreshold * 2);
      smithSlots = tryBoost(smithSlots, smithyCount > 0 && stoneStock >= 10);
      herbalistSlots = tryBoost(herbalistSlots, clinicCount > 0 && herbsStock >= 6);
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
    const remaining = Math.max(0, farmMin + woodMin + specialistBudget);
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
    let totalFarm = Math.round(remaining * effectiveRatio);
    totalFarm = Math.max(farmMin, Math.min(remaining, totalFarm));
    if (remaining - totalFarm < woodMin) {
      totalFarm = Math.max(farmMin, remaining - woodMin);
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
      for (const agent of agents) agent.role = role;
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

    // Legacy ordering for FARM/WOOD/HAUL (spawn-order → cluster proximity).
    let idx = 0;
    for (let i = 0; i < totalFarm && idx < pool.length; i += 1) pool[idx++].role = ROLE.FARM;
    for (let i = 0; i < totalWood && idx < pool.length; i += 1) pool[idx++].role = ROLE.WOOD;
    for (let i = 0; i < haulSlots && idx < pool.length; i += 1) pool[idx++].role = ROLE.HAUL;
    // Any leftover workers get FARM.
    while (idx < pool.length) pool[idx++].role = ROLE.FARM;

    // v0.8.2 Round-5 Wave-1 (01b Step 5) — publish roleCounts to metrics so
    // ColonyPlanner's Priority 3.75 "idle processing chain" branch can gate
    // on "kitchen exists but COOK=0". Counts reflect the post-assignment
    // distribution.
    state.metrics ??= {};
    const counts = { FARM: 0, WOOD: 0, STONE: 0, HERBS: 0, COOK: 0, SMITH: 0, HERBALIST: 0, HAUL: 0 };
    for (const worker of workers) {
      const r = worker.role;
      if (r && counts[r] !== undefined) counts[r] += 1;
    }
    state.metrics.roleCounts = counts;
  }
}
