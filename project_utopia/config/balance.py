"""Balance constants (port of ``src/config/balance.js``).

NEUTRALIZED — academic benchmark frontier.
=========================================

The JS file accumulated as gameplay-tuning surface across v0.8 – v0.10
patches (spoilage curves, recruit cooldowns, escalator caps, fatigue
rates, wildlife leash radii, raid pressure curves, etc.). After S3 the
consumers of those tuning values are either deleted (Wildlife,
Processing, Progression) or running headless through SimHarness only.

Policy for this file:

* Constant names are preserved to avoid null-deref in remaining read
  sites (S4 plan §4 — "neutralize, don't delete").
* Values that ride directly on the LLM action space (clamps, cadences,
  resource costs, group policy weight ranges) are LOAD-BEARING and
  must not be changed without re-baselining the benchmark.
* Values tuned for player feel (visual spawn jitter, casual-difficulty
  cushions, narrative pacing) are dead in headless and not ported.

If you are adding a new field, prefer wiring it through the
:class:`~project_utopia.simulation.ai.llm.response_schema` surface
rather than expanding this module — every ``BALANCE.*`` value ends up
in the bench manifest.

This Python port keeps only the constants the Phase-2 surface actually
references; everything else stays archived in the JS source.
"""

from __future__ import annotations

from types import MappingProxyType

from .constants import WEATHER

__all__ = [
    "BALANCE",
    "BUILD_COST",
    "BUILD_COST_ESCALATOR",
    "CONSTRUCTION_BALANCE",
    "INITIAL_POPULATION",
    "INITIAL_RESOURCES",
    "WEATHER_MODIFIERS",
]


# ── Build cost tables ────────────────────────────────────────────────

BUILD_COST: MappingProxyType[str, MappingProxyType[str, int]] = MappingProxyType(
    {
        "road": MappingProxyType({"wood": 1}),
        "farm": MappingProxyType({"wood": 5}),
        "lumber": MappingProxyType({"wood": 5}),
        "warehouse": MappingProxyType({"wood": 10}),
        "wall": MappingProxyType({"wood": 2}),
        "quarry": MappingProxyType({"wood": 6}),
        "bridge": MappingProxyType({"wood": 3, "stone": 1}),
    }
)


def _esc(soft: int, per: float, cap: float, beyond: float) -> MappingProxyType[str, float]:
    return MappingProxyType(
        {
            "softTarget": float(soft),
            "perExtra": per,
            "cap": cap,
            "perExtraBeyondCap": beyond,
        }
    )


BUILD_COST_ESCALATOR: MappingProxyType[str, MappingProxyType[str, float]] = MappingProxyType(
    {
        "warehouse": _esc(2, 0.3, 2.5, 0.25),
        "wall": _esc(8, 0.1, 2.0, 0.18),
        "farm": _esc(5, 0.1, 1.8, 0.05),
        "lumber": _esc(3, 0.1, 1.8, 0.05),
        "quarry": _esc(3, 0.15, 1.8, 0.05),
    }
)


CONSTRUCTION_BALANCE: MappingProxyType[str, float] = MappingProxyType(
    {
        "salvageRefundRatio": 0.5,
        "worksiteAccessRadius": 2.0,
        "warehouseRoadRadius": 1.0,
        "warehouseSpacingRadius": 5.0,
    }
)


# ── Starting state ───────────────────────────────────────────────────

INITIAL_RESOURCES: MappingProxyType[str, int] = MappingProxyType(
    {
        "food": 320,
        "wood": 35,
        "stone": 15,
    }
)

INITIAL_POPULATION: MappingProxyType[str, int] = MappingProxyType(
    {
        "workers": 12,
        "visitors": 4,
        "herbivores": 8,
        "predators": 2,
    }
)


# ── Weather production / movement modifiers ─────────────────────────

WEATHER_MODIFIERS: MappingProxyType[str, MappingProxyType[str, float]] = MappingProxyType(
    {
        WEATHER["CLEAR"]: MappingProxyType(
            {
                "moveCostMultiplier": 1.0,
                "farmProductionMultiplier": 1.0,
                "lumberProductionMultiplier": 1.05,
            }
        ),
        WEATHER["RAIN"]: MappingProxyType(
            {
                "moveCostMultiplier": 1.15,
                "farmProductionMultiplier": 1.0,
                "lumberProductionMultiplier": 1.0,
            }
        ),
        WEATHER["STORM"]: MappingProxyType(
            {
                "moveCostMultiplier": 1.3,
                "farmProductionMultiplier": 0.8,
                "lumberProductionMultiplier": 0.95,
            }
        ),
    }
)


# ── Core BALANCE bag — load-bearing tuning values only ───────────────
# Keys here are the ones referenced by Phase-2 dimensions, lifecycle, +
# economy ports. Dead values from JS (UI cushions, narrative pacing,
# Wildlife/Processing curves) are intentionally omitted.

BALANCE: MappingProxyType[str, float] = MappingProxyType(
    {
        # Hunger / consumption.
        "hungerDecayPerSecond": 0.014,
        "hungerEatRatePerSecond": 5.0,
        "hungerEatRecoveryPerFoodUnit": 0.04,
        "workerHungerDecayPerSecond": 0.0055,
        "workerHungerSeekThreshold": 0.18,
        "workerStarvingPreemptThreshold": 0.22,
        "workerHungerRecoverThreshold": 0.42,
        "workerEatRecoveryTarget": 0.70,
        "workerHungerEatRecoveryPerFoodUnit": 0.11,
        "warehouseEatRatePerWorkerPerSecond": 0.60,
        "warehouseEatCapPerSecond": 4.0,
        "workerFoodConsumptionPerSecond": 0.038,
        "workerHungerDecayWhenFoodLow": 0.020,
        "workerHungerDecayLowFoodThreshold": 8,
        "warehouseFoodSpoilageRatePerSec": 0.0003,
        "warehouseWoodSpoilageRatePerSec": 0.00015,
        "resourceCollapseCarryGrace": 1.5,
        # Visitor / wildlife (kept as names; values neutralized to mid-range).
        "visitorHungerDecayPerSecond": 0.0085,
        "visitorHungerRecoveryPerSecond": 0.16,
        # LLM-action clamp ranges (load-bearing per the policy header).
        "intentWeightMin": 0.0,
        "intentWeightMax": 3.0,
        "riskToleranceMin": 0.0,
        "riskToleranceMax": 1.0,
        "ttlSecMin": 8.0,
        "ttlSecMax": 24.0,
        # Recruit / build cadence.
        "builderMax": 4,
        "recruitCooldownSec": 30.0,
    }
)
