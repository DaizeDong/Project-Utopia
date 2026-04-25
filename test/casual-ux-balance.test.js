import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CASUAL_UX } from "../src/config/balance.js";

describe("CASUAL_UX config shape", () => {
  it("errToastMs is at least 3000", () => {
    assert.ok(Number(CASUAL_UX.errToastMs) >= 3000, `errToastMs=${CASUAL_UX.errToastMs}`);
  });

  it("warnToastMs is at least 2000", () => {
    assert.ok(Number(CASUAL_UX.warnToastMs) >= 2000, `warnToastMs=${CASUAL_UX.warnToastMs}`);
  });

  it("struggleBannerGraceSec is between 15 and 45", () => {
    const v = Number(CASUAL_UX.struggleBannerGraceSec);
    assert.ok(v >= 15 && v <= 45, `struggleBannerGraceSec=${v}`);
  });

  it("toolTierUnlockBuildings has secondary and advanced keys", () => {
    assert.ok("secondary" in CASUAL_UX.toolTierUnlockBuildings, "missing secondary");
    assert.ok("advanced" in CASUAL_UX.toolTierUnlockBuildings, "missing advanced");
  });

  it("toolTierUnlockTimeSec has secondary and advanced keys", () => {
    assert.ok("secondary" in CASUAL_UX.toolTierUnlockTimeSec, "missing secondary");
    assert.ok("advanced" in CASUAL_UX.toolTierUnlockTimeSec, "missing advanced");
  });
});
