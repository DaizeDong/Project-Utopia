---
round: 3
reviewer_id: 01d-mechanics-content
wave: 1
status: implemented
---

## Scope
- Tuned existing worker hunger and delivery thresholds so workers seek food earlier and unload smaller carried loads sooner.
- Updated worker intent stability tests to lock the new Round 3 thresholds and hysteresis boundaries.

## Files Changed
- `src/config/balance.js`
- `test/worker-intent-stability.test.js`
- `test/worker-intent.test.js`

## Tests
- `node --test test/worker-intent-stability.test.js test/worker-intent.test.js`
  - 21 pass / 21 total
- `node --test test/*.test.js`
  - 1058 pass / 1060 total
  - 0 fail
  - 2 skipped

## Notes
- No new buildings, tiles, assets, mechanics, victory condition, or tutorial content were added.
- `CHANGELOG.md` intentionally left untouched for Stage D archival.
