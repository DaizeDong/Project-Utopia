import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CASUAL_UX } from "../src/config/balance.js";

describe("CASUAL_UX config shape", () => {
  // v0.8.7.1 U1 — errToastMs reduced from 3500 → 2800; the prior 3000-floor
  // assertion was tied to the 3500 default and is now relaxed to 2500.
  // successToastMs floor added to lock in the 1400 → 2200 bump from the
  // same patch.
  it("errToastMs is at least 2500", () => {
    assert.ok(Number(CASUAL_UX.errToastMs) >= 2500, `errToastMs=${CASUAL_UX.errToastMs}`);
  });

  it("warnToastMs is at least 2000", () => {
    assert.ok(Number(CASUAL_UX.warnToastMs) >= 2000, `warnToastMs=${CASUAL_UX.warnToastMs}`);
  });

  it("successToastMs is at least 2000", () => {
    assert.ok(Number(CASUAL_UX.successToastMs) >= 2000, `successToastMs=${CASUAL_UX.successToastMs}`);
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
