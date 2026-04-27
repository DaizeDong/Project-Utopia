import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CASUAL_UX } from "../src/config/balance.js";
import { TOOL_SHORTCUTS } from "../src/app/shortcutResolver.js";

// Mirror of BuildToolbar.#refreshToolTier for unit-testing the logic without jsdom.
function computeToolTiers(state) {
  const unlock = state?.services?.balance?.casualUx?.toolTierUnlockBuildings ?? {};
  const unlockT = state?.services?.balance?.casualUx?.toolTierUnlockTimeSec ?? {};
  const ts = Number(state?.metrics?.timeSec ?? 0);
  const bld = state?.buildings ?? {};
  const meetsBuildings = (req) => Object.entries(req ?? {}).every(([k, v]) => Number(bld[k] ?? 0) >= Number(v));
  const tiers = ["primary"];
  if (ts >= Number(unlockT.secondary ?? 180) || meetsBuildings(unlock.secondary)) tiers.push("secondary");
  if (ts >= Number(unlockT.advanced ?? 360) || meetsBuildings(unlock.advanced)) tiers.push("advanced");
  return tiers;
}

function makeState(buildings = {}, timeSec = 0) {
  return {
    buildings,
    metrics: { timeSec },
    services: { balance: { casualUx: CASUAL_UX } },
  };
}

describe("tool-tier gate", () => {
  it("at t=30, no warehouses → only primary tier", () => {
    const tiers = computeToolTiers(makeState({}, 30));
    assert.deepEqual(tiers, ["primary"]);
  });

  it("warehouses=1 → unlocks secondary", () => {
    const tiers = computeToolTiers(makeState({ warehouses: 1 }, 30));
    assert.ok(tiers.includes("secondary"), "secondary not unlocked");
    assert.ok(!tiers.includes("advanced"), "advanced should not be unlocked yet");
  });

  it("timeSec=400 → unlocks secondary and advanced", () => {
    const tiers = computeToolTiers(makeState({}, 400));
    assert.ok(tiers.includes("secondary"), "secondary not unlocked by time");
    assert.ok(tiers.includes("advanced"), "advanced not unlocked by time");
  });

  it("farms=3, lumbers=1 → unlocks advanced", () => {
    const tiers = computeToolTiers(makeState({ farms: 3, lumbers: 1 }, 0));
    assert.ok(tiers.includes("advanced"), "advanced not unlocked by building prereq");
  });

  it("keyboard shortcut Digit9 → herb_garden regardless of tier (agency preserved)", () => {
    assert.equal(TOOL_SHORTCUTS["Digit9"], "herb_garden", "herb_garden shortcut broken");
  });
});
