import { BALANCE } from "../../config/balance.js";

/**
 * RaidEscalatorSystem — Living World v0.8.0 Phase 4 (spec §§ 5.4-5.5, Plan C).
 *
 * Scales raid frequency and intensity as the colony matures. Replaces the
 * prior fixed 6-tier cap with a DevIndex-driven tier that scales linearly
 * with `state.gameplay.devIndexSmoothed`:
 *
 *   raidTier = floor(devIndexSmoothed / BALANCE.devIndexPerRaidTier)
 *            clamped to [0, BALANCE.raidTierMax]
 *   raidIntervalTicks = max(
 *     raidIntervalMinTicks,
 *     raidIntervalBaseTicks - raidTier * raidIntervalReductionPerTier
 *   )
 *   raidIntensityMultiplier = 1 + raidTier * raidIntensityPerTier
 *
 * The system publishes a composite `state.gameplay.raidEscalation` bundle
 * which `WorldEventSystem` reads when deciding whether to fire the next
 * bandit raid and when sizing raider counts / damage.
 *
 * SYSTEM_ORDER: runs immediately AFTER `DevIndexSystem` (so escalation reads
 * a fresh per-tick composite) and BEFORE `WorldEventSystem` (so the event
 * system reads a fresh `state.gameplay.raidEscalation`).
 *
 * Read path: `state.gameplay.devIndexSmoothed` (the ring-buffer mean — NOT
 * `devIndex`). The smoothed signal prevents raid tier from flickering with
 * per-tick noise; see `DevIndexSystem` for the contract.
 */

function clamp(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function ensureEscalationState(state) {
  state.gameplay ??= {};
  if (!state.gameplay.raidEscalation || typeof state.gameplay.raidEscalation !== "object") {
    state.gameplay.raidEscalation = {
      tier: 0,
      intervalTicks: Number(BALANCE.raidIntervalBaseTicks ?? 3600),
      intensityMultiplier: 1,
      devIndexSample: 0,
    };
  }
  if (typeof state.gameplay.lastRaidTick !== "number") {
    state.gameplay.lastRaidTick = -9999;
  }
  return state.gameplay;
}

/**
 * Pure helper exposed for testing — derives a raid-escalation bundle from a
 * DevIndex sample without touching state. Kept deterministic and free of
 * side effects.
 */
export function computeRaidEscalation(devIndexSmoothed) {
  const sample = Number.isFinite(devIndexSmoothed) ? Number(devIndexSmoothed) : 0;
  const perTier = Math.max(1e-6, Number(BALANCE.devIndexPerRaidTier ?? 15));
  const tierMax = Math.max(0, Number(BALANCE.raidTierMax ?? 10));
  const rawTier = Math.floor(Math.max(0, sample) / perTier);
  const tier = clamp(rawTier, 0, tierMax);

  const baseTicks = Math.max(1, Number(BALANCE.raidIntervalBaseTicks ?? 3600));
  const minTicks = Math.max(1, Number(BALANCE.raidIntervalMinTicks ?? 600));
  const reductionPerTier = Math.max(0, Number(BALANCE.raidIntervalReductionPerTier ?? 300));
  const intervalTicks = Math.max(minTicks, baseTicks - tier * reductionPerTier);

  const intensityPerTier = Math.max(0, Number(BALANCE.raidIntensityPerTier ?? 0.3));
  const intensityMultiplier = 1 + tier * intensityPerTier;

  return {
    tier,
    intervalTicks,
    intensityMultiplier,
    devIndexSample: sample,
  };
}

export class RaidEscalatorSystem {
  constructor() {
    this.name = "RaidEscalatorSystem";
  }

  update(_dt, state, _services) {
    if (!state) return;
    const g = ensureEscalationState(state);

    // Read smoothed DevIndex. Fallback to 0 when DevIndexSystem has not run
    // (e.g. tests that skip it) so raids still spawn at the baseline tier.
    const sample = Number(state.gameplay?.devIndexSmoothed ?? 0);
    const bundle = computeRaidEscalation(sample);

    // Mutate in place so downstream systems holding a reference stay in sync.
    g.raidEscalation.tier = bundle.tier;
    g.raidEscalation.intervalTicks = bundle.intervalTicks;
    g.raidEscalation.intensityMultiplier = bundle.intensityMultiplier;
    g.raidEscalation.devIndexSample = bundle.devIndexSample;
  }
}
