import { BALANCE } from "../../config/balance.js";
import { EVENT_TYPE } from "../../config/constants.js";
import { enqueueEvent } from "../../world/events/WorldEventQueue.js";

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
 *
 * v0.8.5 Tier 2 S1: log-curve replacement for the linear floor(DI/15) tier.
 * The previous formula gave DI=100 → tier 6 → 60s interval, ~2.8× intensity,
 * which combined with EventDirector and saboteurs made late-game
 * unsurvivable. The log curve flattens the late-game tier ramp:
 *   tier = floor(2.5 × log2(1 + DI / devIndexPerRaidTier))
 *   DI=15  → tier 2.5 → 2
 *   DI=30  → tier 3.9 → 3
 *   DI=60  → tier 5.5 → 5
 *   DI=100 → tier 6.7 → 6
 *
 * Plus: above DI 60, intensity is softened by the colony's defenseScore so
 * a fortified colony enjoys a "fortified plateau" rather than raid spirals.
 *
 * @param {number} devIndexSmoothed
 * @param {object} [opts] - { defenseScore } for the fortified-plateau bonus
 */
export function computeRaidEscalation(devIndexSmoothed, opts = {}) {
  const sample = Number.isFinite(devIndexSmoothed) ? Number(devIndexSmoothed) : 0;
  const perTier = Math.max(1e-6, Number(BALANCE.devIndexPerRaidTier ?? 15));
  const tierMax = Math.max(0, Number(BALANCE.raidTierMax ?? 10));
  // v0.8.5 Tier 2 S1: log-curve tier. Math.log2(1 + sample/perTier) so DI=0
  // still yields tier=0; the 2.5 coefficient calibrates DI=100 to ≈ tier 6.7.
  const safeSample = Math.max(0, sample);
  const rawTier = 2.5 * Math.log2(1 + safeSample / perTier);
  const tier = clamp(Math.floor(rawTier), 0, tierMax);

  const baseTicks = Math.max(1, Number(BALANCE.raidIntervalBaseTicks ?? 3600));
  const minTicks = Math.max(1, Number(BALANCE.raidIntervalMinTicks ?? 900));
  const reductionPerTier = Math.max(0, Number(BALANCE.raidIntervalReductionPerTier ?? 300));
  const intervalTicks = Math.max(minTicks, baseTicks - tier * reductionPerTier);

  const intensityPerTier = Math.max(0, Number(BALANCE.raidIntensityPerTier ?? 0.22));
  let intensityMultiplier = 1 + tier * intensityPerTier;

  // v0.8.5 Tier 2 S1: fortified-plateau bonus. When the colony's defense
  // score is high (≥ 80 fully neutralises the bonus), late-game raid
  // intensity scales down — walls reduce raid intensity, rewarding the
  // player for actually defending instead of letting raid scaling cap out.
  const defenseScore = Math.max(0, Number(opts.defenseScore ?? 0));
  if (safeSample > 60) {
    const defenseFactor = 1.5 - 0.5 * Math.min(1, defenseScore / 80);
    // Clamp to [0.5, 1.5] so a maxed-defense colony still sees baseline+
    // pressure (defenseFactor ≥ 1.0 only when defenseScore < 80).
    intensityMultiplier *= Math.max(0.5, Math.min(1.5, defenseFactor));
  }

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
    // v0.8.5 Tier 2 S1: pass defense score for the fortified-plateau bonus
    // (above DI 60). Read from the DevIndexSystem dimensions if populated,
    // else fall back to 0 (no bonus, equivalent to pre-v0.8.5 behaviour).
    const defenseScore = Number(state.gameplay?.devIndexDimensions?.defense ?? 0);
    const bundle = computeRaidEscalation(sample, { defenseScore });

    // Mutate in place so downstream systems holding a reference stay in sync.
    g.raidEscalation.tier = bundle.tier;
    g.raidEscalation.intervalTicks = bundle.intervalTicks;
    g.raidEscalation.intensityMultiplier = bundle.intensityMultiplier;
    g.raidEscalation.devIndexSample = bundle.devIndexSample;

    // v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 5) — fallback scheduler.
    // The reviewer's "0 raid in 22 minutes" complaint traces to a single bug:
    // the only path that enqueues BANDIT_RAID is the LLM-driven
    // EnvironmentDirectiveApplier, which never fires when the LLM is offline
    // (100% of fallback sessions). Without this block, tier-0 raid cadence
    // (3600 ticks ≈ 2 game-min @ 30Hz) is functionally never honoured because
    // WorldEventSystem only DRAINS the queue — it never fills it.
    //
    // We add a self-firing path here that respects four floors so 4-seed bench
    // (DevIndex ≥ 32, deaths ≤ 499) does not regress:
    //   - tier ≥ 1 (don't trigger before DevIndex has grown above the floor;
    //     otherwise a fresh colony eats raids before it can stand up)
    //   - elapsed ticks ≥ intervalTicks (respect the existing tier cadence)
    //   - no BANDIT_RAID currently queued or active (don't double-stack)
    //   - graceSec elapsed (boot grace; default 360 ≈ 6 game-min)
    //   - alive pop ≥ popFloor (don't kick a dying colony)
    //   - food ≥ foodFloor (don't kick a starving colony)
    //
    // See plan §5 R1 risk discussion for the rationale on each floor and the
    // mitigation ladder (raise graceSec / raidEnvironmentDeathBudget).
    const tier = Number(g.raidEscalation.tier ?? 0);
    if (tier < 1) return;

    const tick = Number(state.metrics?.tick ?? 0);
    const lastRaidTick = Number(g.lastRaidTick ?? -9999);
    const intervalTicks = Number(g.raidEscalation.intervalTicks ?? BALANCE.raidIntervalBaseTicks ?? 3600);
    if ((tick - lastRaidTick) < intervalTicks) return;

    const queue = Array.isArray(state.events?.queue) ? state.events.queue : [];
    const active = Array.isArray(state.events?.active) ? state.events.active : [];
    const queuedRaid = queue.find((e) => e?.type === EVENT_TYPE.BANDIT_RAID);
    const activeRaid = active.find((e) => e?.type === EVENT_TYPE.BANDIT_RAID);
    if (queuedRaid || activeRaid) return;

    const timeSec = Number(state.metrics?.timeSec ?? 0);
    const graceSec = Number(BALANCE.raidFallbackGraceSec ?? 360);
    if (timeSec < graceSec) return;

    const aliveCount = Array.isArray(state.agents)
      ? state.agents.filter((a) => a && a.alive !== false).length
      : 0;
    const popFloor = Number(BALANCE.raidFallbackPopFloor ?? 18);
    if (aliveCount < popFloor) return;

    const foodNow = Number(state.resources?.food ?? 0);
    const foodFloor = Number(BALANCE.raidFallbackFoodFloor ?? 60);
    if (foodNow < foodFloor) return;

    const durationSec = Number(BALANCE.raidFallbackDurationSec ?? 18);
    const intensity = Number(g.raidEscalation.intensityMultiplier ?? 1);
    enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, { source: "raid_fallback_scheduler" }, durationSec, intensity);
    // v0.8.6 Tier 2 CB-H3: do NOT set lastRaidTick at enqueue time. Pre-fix
    // the raid was enqueued AND lastRaidTick was bumped to currentTick, so
    // WorldEventSystem's per-event cooldown gate dropped the same-tick raid
    // as `(tick - lastRaidTick) < intervalTicks` evaluated to `0 < N` and
    // refused to fire. The raid was effectively a no-op. The advance is now
    // moved to WorldEventSystem._applyEvent for BANDIT_RAID at the moment
    // the event is actually drained from the queue.
  }
}
