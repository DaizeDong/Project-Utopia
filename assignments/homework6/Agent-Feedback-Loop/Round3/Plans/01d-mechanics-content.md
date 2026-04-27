---
reviewer_id: 01d-mechanics-content
feedback_source: Round3/Feedbacks/01d-mechanics-content.md
round: 3
date: 2026-04-23
build_commit: 53da600
priority: P0
estimated_scope:
  files_touched: 3
  loc_delta: ~80
  new_tests: 2
  wall_clock: 60m
conflicts_with: [02a-rimworld-veteran]
---

## 1. 核心问题

- The food/logistics failure path is visible but not sufficiently recoverable.
- Existing worker hunger/deliver/carry thresholds are the right low-risk tuning surface; no new mechanics are needed.

## 2. Suggestions

### 方向 A: Earlier Eat/Deliver Recovery Tuning
- 思路：retune existing hunger seek/recover and carry delivery thresholds so food reaches storage/workers earlier.
- 涉及文件：`src/config/balance.js`, `test/worker-intent-stability.test.js`, `test/worker-intent.test.js`
- scope：中
- 预期收益：benchmark-relevant survival/logistics improvement.
- 主要风险：over-delivery could reduce harvesting throughput.

### 方向 B: Add A New Crisis System
- 思路：create a separate starvation recovery system.
- 涉及文件：new simulation system
- scope：大
- 预期收益：clear recovery logic.
- 主要风险：D5 feature-freeze violation.

## 3. 选定方案

选择 **方向 A**。It modifies existing parameters and tests only.

## 4. Plan 步骤

- [ ] Step 1: `src/config/balance.js` — edit — raise `workerHungerSeekThreshold` and `workerHungerRecoverThreshold` so workers seek food earlier and recover further.
- [ ] Step 2: `src/config/balance.js` — edit — lower `workerDeliverThreshold`, `workerDeliverLowThreshold`, and `workerCarryPressureSec` to reduce stranded carry.
- [ ] Step 3: `test/worker-intent-stability.test.js` — edit/add — update exact threshold assertions and add early-hunger regression.
- [ ] Step 4: `test/worker-intent.test.js` — edit/add — assert smaller aged carries deliver earlier while fresh tiny carries still work.
- [ ] Step 5: run `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90 --soft-validation`.

## 5. Risks

- More delivery trips may lower production if thresholds are too aggressive.
- Existing tests pin literal threshold values.
- 可能影响：`test/exploit-regression.test.js`, long-horizon benchmark.

## 6. 验证方式

- Unit tests above.
- Full suite.
- Benchmark must not drop below Round2 DevIndex 37.77 or increase deaths beyond 157; target is improvement.
