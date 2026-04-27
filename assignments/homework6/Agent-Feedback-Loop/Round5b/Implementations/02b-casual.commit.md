---
plan: Round5b/Plans/02b-casual.md
plan_version: v2
primary_commit: 008bbe6
branch: feature/v080-living-world
date: 2026-04-25
author: Claude Sonnet 4.6
tests_pass: 1275/1281 (4 pre-existing from 02a/02c/02e; 0 new failures; lumber cost fix resolved 1 pre-existing)
---

# Round5b 02b-casual Implementation Log

## Files Touched

| File | Change Type | LOC | Notes |
|------|-------------|-----|-------|
| `src/config/balance.js` | edit | +14 | `CASUAL_UX` sibling export: errToastMs/warnToastMs/struggleBannerGraceSec/toolTierUnlock tables |
| `src/render/SceneRenderer.js` | edit | +10 | `import CASUAL_UX`; err/warn toast duration reads from config (was magic 1200) |
| `src/simulation/meta/ProgressionSystem.js` | edit | +57 | 7 new MILESTONE_RULES; `ensureProgressionState` baseline seeds clinics/smithies/medicine/haulDeliveredLife/`__devNever__` |
| `src/ui/hud/autopilotStatus.js` | edit | +22 | `struggling` signal: food ≤ emergency×1.1 or starvRisk>0, grace ≥ 20 s; text/title suffix; `struggling` on return |
| `src/ui/hud/HUDController.js` | edit | +5 | `data-kind="warn"` on autopilotChip when `status.struggling` |
| `src/ui/tools/BuildToolbar.js` | edit | +18 | `#refreshToolTier(state)` private helper; called at end of `sync()` |
| `index.html` | edit | +18 | `data-tool-tier` on 12 buttons; 4-rule casual-mode CSS gate; enriched 12 title= strings; lumber cost 3→5 |
| `test/casual-ux-balance.test.js` | new | +25 | Step 8: CASUAL_UX shape contract (5 cases) |
| `test/progression-extended-milestones.test.js` | new | +60 | Step 9: first_clinic/dev_40/dev_60 dedupe/first_haul/already-seen guard (5 cases) |
| `test/autopilot-struggling-banner.test.js` | new | +50 | Step 10: struggling true/false across food/grace/disabled/starvRisk (5 cases) |
| `test/tool-tier-gate.test.js` | new | +42 | Step 11: tier unlock logic + keyboard agency (5 cases) |

**Total: ~321 LOC added**

## Key Line References

### Step 1 — CASUAL_UX config (balance.js)
```js
export const CASUAL_UX = Object.freeze({
  errToastMs: 3500, warnToastMs: 2600, successToastMs: 1400,
  struggleBannerGraceSec: 20, struggleFoodPctOfEmergency: 1.1,
  toolTierUnlockTimeSec: { secondary: 180, advanced: 360 },
  toolTierUnlockBuildings: {
    secondary: { warehouses: 1 },
    advanced: { farms: 3, lumbers: 1 },
  },
});
```

### Step 2 — Toast duration (SceneRenderer.js)
```js
const durationMs = kind === "death" ? 4000 : kind === "milestone" ? 3200
  : kind === "err" ? CASUAL_UX.errToastMs
  : kind === "warn" ? CASUAL_UX.warnToastMs
  : CASUAL_UX.successToastMs;
```

### Step 3 — Milestone rules (ProgressionSystem.js)
- 7 new rules appended: `first_clinic`, `first_smithy`, `first_medicine`, `dev_40`, `dev_60`, `dev_80`, `first_haul_delivery`
- `dev_*` rules use `baselineKey: "__devNever__"` (always 0); fires when `devIndexSmoothed >= threshold`
- `ensureProgressionState.milestoneBaseline` seeds 5 new keys + `__devNever__: 0`

### Step 4 — Autopilot struggling (autopilotStatus.js)
```js
const struggling = enabled
  && (food <= struggleFoodFloor || starvRisk > 0)
  && (nowSec - enableSec) >= graceSec;
```
- Text suffix: `"| Autopilot struggling — manual takeover recommended"`
- Return object includes `struggling: Boolean`

### Step 5 — HUDController chip styling (HUDController.js)
```js
if (status.struggling) this.aiAutopilotChip.setAttribute?.("data-kind", "warn");
else this.aiAutopilotChip.removeAttribute?.("data-kind");
```

### Step 6 — Tool-tier gate (index.html + BuildToolbar.js)
- HTML: primary = road/farm/lumber/warehouse; secondary = wall/bridge/erase; advanced = quarry/herb_garden/kitchen/smithy/clinic
- CSS: `body.casual-mode .tool-grid button[data-tool-tier="secondary|advanced"] { display: none !important; }`
- CSS: `body.casual-mode[data-tool-tier-unlocked~="secondary"] .tool-grid button[data-tool-tier="secondary"] { display: inline-flex !important; }`
- `#refreshToolTier` sets `body.dataset.toolTierUnlocked = tiers.join(" ")` each sync

### Bonus — lumber cost fix (index.html)
- Original: `"cost: 3 wood"` vs `BUILD_COST.lumber.wood = 5` → mismatch caught by pre-existing 02a test
- Fixed: `"cost: 5 wood"` — resolves 1 pre-existing test failure

## Steps Coverage

| Step | Description | Behaviour-changing? | Covered |
|------|-------------|---------------------|---------|
| 1 | CASUAL_UX config | Yes (feeds Steps 2/4/6) | ✓ |
| 2 | Toast linger (3.5 s err, 2.6 s warn) | Yes | ✓ |
| 3 | Milestone rules extension | Yes (new emit events) | ✓ |
| 4 | autopilotStruggling signal | Yes | ✓ |
| 5 | HUDController struggling render | Yes (conditional styling) | ✓ |
| 6 | Tool-tier gate HTML + BuildToolbar | Yes (conditional display) | ✓ |
| 7 | Enriched tool titles | Cosmetic | ✓ |
| 8-11 | Tests (20 new cases, all pass) | No (test) | ✓ |

**Behaviour-changing steps: 6/7 = 86% ≥ 50% ✓**
**System layers: config + render + simulation + ui = 4 layers ≥ 2 ✓**
