---
round: 3
reviewer_id: stage-d-debugger
wave: D
status: implemented
---

## Trigger
- Initial Stage D benchmark failed after Round 3 implementation:
  - `outcome=loss`
  - `days=21`
  - `devIndex(last)=41.32`
  - `survivalScore=4906`
  - violations: `post_terminal_checkpoint`, `loss_before_day_180`

## Fix
- Reduced the aggressiveness of the 01d worker recovery tuning.
- Kept Round 3 behavior ahead of Round 2 thresholds, but avoided over-consuming worker time through frequent eating and small-load delivery.

## Files Changed
- `src/config/balance.js`
- `test/worker-intent-stability.test.js`
- `test/worker-intent.test.js`

## Verification
- `node --test test/worker-intent-stability.test.js test/worker-intent.test.js`
  - 21 pass / 21 total
- `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90 --soft-validation`
  - `outcome=max_days_reached`
  - `days=90`
  - `devIndex(last)=37.8`
  - `survivalScore=20450`
  - `passed=true`
- `node --test test/*.test.js`
  - 1069 pass / 1071 total
  - 0 fail
  - 2 skipped
