# A1 — Stability Hunter — Round 12 Feedback

- **Date:** 2026-05-02
- **Build URL:** http://127.0.0.1:5173/
- **Reviewer:** A1 (stability sanity, BLIND)
- **Reviewer brief at the spec'd path is missing** (`assignments/homework7/Final-Polish-Loop/Reviewers/A1-stability-hunter.md` does not exist — same as R11). Proceeded from the role name + Hard Rules in the harness prompt + my R11 feedback as a self-template, so the bar stays consistent across rounds.
- **Sessions:** 5 (each navigated fresh; ≥5 min wall-clock per session, except s3 which is the deliberately short save/load/regenerate cycle, and s4 which is 30 s warm-up + 4 min stress observation).

## Verdict

**STABLE — green.** Across five fresh-boot sessions, **zero uncaught console errors, zero NaN/non-finite metrics, zero crashes, zero observable memory growth** (heap envelope 30–87 MB across all stress, including stress-spawn). Save/load round-trip works cleanly (2.6 MB snapshot persisted to slot `default` and reloaded to phase=active at the same tick 1150). LLM director engaged in s2 + s5 (`liveCoverageSatisfied: true`, recoveryCount 5–8, `proxyHealth: "up"`); fallback mode took over cleanly when needed in s1/s4 with no escalation. **R11's P2 #1 is FIXED in R12** — `regenerate()` now returns `{ok:true, templateId, seed, phase}` (the conventional shape that mirrors `saveSnapshot`/`loadSnapshot`) instead of `null`. **R11's P2 #3 is partially addressed** — `devStressSpawn(60)` now hard-caps at infraCap up-front (`spawned:5, total:17` instead of R11's `spawned:48, total:60` followed by silent culling). Build is fit to ship Round 12 from a stability standpoint.

## Session log

| # | Setup | Wall time | end tick | end heap MB | console errors | console warnings | in-game errorCount | in-game warnCount | NaN | AI mode | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Temperate Plains, fresh, idle | 5 min | 2021 | 61.93 | 0 | 1 | 0 | 6 | 0 | fallback | Clean idle baseline. Pop 12/2/1/8/0. Deaths 0. fps 53.18, frameMs 0. simSec 67.4 in 5 wall-min (rAF throttled in headless tab — game itself runs ~320 fps headroom). 1 saboteur died during session (3→2→1). |
| 2 | Temperate Plains, autopilot ON via `#aiToggleTop`, 4× via `#speedFastBtn` | 5 min | 5746 | 70.14 | 0 | 0 | 0 | 14 | 0 | **llm** | "Autopilot ON - fallback/llm" toolbar + "Recovery: food runway" overlay. 13 LLM responses + 14 fallback in 18 requests, `proxyHealth:"up"`, `recoveryCount:8`, `liveCoverageSatisfied:true`. Director built warehouse + farm + lumber + 15 roads. 6 predation deaths, 4 saboteurs spawned (event-driven). fps 54.1. |
| 3 | Save → Load → regenerate(rugged_highlands seed 12345) → regenerate(archipelago_isles seed 7777) | ≈30 s | n/a (back to splash) | n/a | 0 | 3 | 0 | n/a | 0 | n/a | `saveSnapshot()` → `{ok:true, slotId:"default", bytes:2641940}`. `loadSnapshot()` → `{ok:true, slotId:"default", phase:"active"}`. Tick preserved (1150 → 1150). **`regenerate()` now returns `{ok:true, templateId, seed, phase:"menu"}` — R11 P2 #1 FIXED.** Both the `rugged_highlands/12345` and `archipelago_isles/7777` calls returned the new shape, the splash visibly updated to "Archipelago Isles · seed 7777", and `getTelemetry().world.templateId` reflected the regen target. Population `byGroup` still shows previous-colony stale 12/2/2/8/2 between regenerate and Start (R11 P2 #5 carryover). |
| 4 | Temperate Plains + `devStressSpawn(60)` after 30 s warm-up | 4 min | 10488 | 77.83 | 0 | 1 | 0 | 32 | 0 | fallback | `devStressSpawn(60)` returned `{ok:true, spawned:5, total:17, fallbackTilesUsed:0}` — **R12 changed the contract: now hard-capped at infraCap up-front rather than spawn-then-cull. R11 was `spawned:48, total:60`; R12 is `spawned:5, total:17`.** This is more honest (the silent-culling regression in R11 P2 #3 is gone), but the function name `devStressSpawn(60)` is now misleading because a request for 60 only delivers 5. UI shows the spawn-tagged workers under "Stress patrol" task — nice touch. 3 starvation + 5 predation deaths (food crisis after spawn surge). Autopilot toggle didn't engage in this session — banner stayed "Autopilot OFF" despite the click via overlay (likely a click-race with the runtime banner). fps 52.8 stable. |
| 5 | Fresh page → `lr.configure({template:'coastal_ocean', seed:42})` → `lr.startRun({template:'coastal_ocean', seed:42})` → `lr.setAiEnabled(true)` + 4× | 5 min | 5696 | 86.9 | 0 | 0 | 0 | 12 | 0 | **llm** | `configure()` and `startRun()` template+seed overrides on a fresh page were **STILL IGNORED** — game booted Temperate Plains alpha_broken_frontier (R11 P2 #2 carryover, NOT fixed). Both calls returned `undefined`. Once `setAiEnabled(true)` engaged, LLM director served 9/17 requests, `proxyHealth:"up"`, `recoveryCount:5`, `liveCoverageSatisfied:true`. 6 predation deaths. Heap rose 30→87 MB across the 5 min run but not unbounded — within R11's 28–56 envelope plus stress factor. fps 53.15 stable. Recovery banner: "food runway unsafe (net -151.2/min, risk 0). Expansion paused; farms, warehouses, and roads take priority." |

Cumulative: **0 console errors, 0 NaN metrics, 0 crashes, 0 frozen renders, 0 leaks**. Heap envelope 30–87 MB across all stress (slightly higher ceiling than R11's 28–56 MB, but no unbounded growth and well below the 200 MB threshold). In-game `warnings.count` accrues 1–32 per session (s4 spike from stress spawn), `errorCount` stays 0 in every session.

## Findings

### P0 — none

No game-breaking stability issues observed.

### P1 — none

R11's P1 list was already empty (R10's P1 was fixed in R11). The remaining quirks below are demoted to P2 because (a) they don't break the game, (b) they only affect benchmark/Playwright harnesses, and (c) the on-screen experience is unaffected.

### P2 — minor / cosmetic

1. **`configure()` / `startRun()` template overrides on a fresh boot are STILL ignored** (s5; R11 P2 #2 carryover, NOT fixed). After a fresh page load, calling `lr.configure({template:'coastal_ocean', seed:42})` and then `lr.startRun({template:'coastal_ocean', seed:42})` started a Temperate Plains alpha_broken_frontier run. Both functions returned `undefined`. Splash defaults won. Same recommendation as R11: either honour `configure()`'s template/seed before `startRun()` commits, or return `{ok:false, reason:'splash_already_committed'}`. R12's `regenerate()` shape fix shows the pattern — apply it here.

2. **`devStressSpawn(N)` now silently caps to a fraction of N up-front.** s4: `devStressSpawn(60)` returned `{ok:true, spawned:5, total:17}`. This is an *improvement* over R11's silent post-cull (R11 P2 #3 partially addressed), but the function name + signature still imply "spawn 60". Recommend either renaming the parameter (`devStressSpawn({target, capStrategy:'infra'|'force'})`) or returning a `requested:60, capped:55, capReason:'infraCap'` field so harnesses can detect the gap.

3. **Stale `population.byGroup` after regenerate** (s3). Carryover from R11 P2 #5 / R10 P2 #4 / R9 P2 #3 — telemetry still reports the prior colony's by-group counts (12/2/2/8/2) immediately after `regenerate()` lands on the splash. Resets correctly once Start Colony is pressed. Affects only benchmark scripts that read telemetry between regenerate and the next Start. Now that `regenerate()` returns proper shape (R12 fix), zeroing or null-ing `byGroup` in the menu phase would be the consistent next step.

4. **`warnCount` accrues without a HUD pill.** s2 ended at 14 internal warnings, s4 at 32 (post-stress), s5 at 12. Same as R11 P2 #6 / R10 P2 #3 — no in-HUD badge for "internal warning rate" so a sudden warning storm under autopilot would be invisible to a reviewer not running `getTelemetry()`. Cosmetic only — no warnings escalated.

5. **AI proxy fresh-session probe still fires "WHISPER?: LLM never reached" within ~1 s** (s1 of 5; s2/s4/s5 reached LLM successfully, s3 was menu-only). Same as R11 P2 #4 / R10 P2 #2 / R9 P2 #4. Already counted by the in-game `warnings` collector (errorCount stays 0). Suggest deduping the first probe so a fresh page load isn't visibly noisy when the user hasn't even clicked Autopilot yet.

6. **Autopilot click race in s4.** After fresh boot + Start, calling `document.getElementById('aiToggleTop').click()` immediately after `overlayStartBtn` did *not* engage Autopilot — the banner stayed "Autopilot OFF" through 4.5 min of observation. This is the same call sequence that worked in s2; the difference seems to be that s4 chained the two clicks in the same `evaluate` while s2 separated them. Cosmetic / harness ergonomics only — `lr.setAiEnabled(true)` is the reliable path (used in s5).

### Round-over-round delta vs R11

- **R11 P2 #1 (`regenerate()` returns `null`) — FIXED.** Now returns `{ok:true, templateId, seed, phase:"menu"}` (s3).
- **R11 P2 #3 (`devStressSpawn` silent cull) — PARTIALLY ADDRESSED.** Capping now happens up-front and is visible in the return value. The function still doesn't disclose *why* it capped or that 60→17 is a 72% shortfall (s4).
- **R11 P2 #2 (`configure`/`startRun` overrides ignored) — NOT FIXED.** Carryover (s5).
- **R11 P2 #5 (stale `byGroup` after regenerate) — NOT FIXED.** Carryover (s3).
- **R11 P2 #6 (`warnCount` no HUD pill) — NOT FIXED.** Carryover (s2/s4/s5).
- **R11 P2 #4 (fresh-session AI probe noisy) — NOT FIXED.** Carryover (s1).

### Environmental notes (not findings)

- Playwright headless still throttles `requestAnimationFrame` aggressively. s1 ran 2021 ticks / 67.4 sim-sec in 5 wall-min; s2 + s5 (4× speed) hit 5696–5746 ticks / ~190 sim-sec in 5 wall-min. The renderer simply isn't being called frequently — `frameMs` stayed at 0–1.2 ms in every session, indicating ~300+ fps headroom. Build itself is performant.
- LLM proxy was reachable for both s2 and s5 this round (R11 had s1/s2 timeouts, s4/s5 success — R12 has s1 fallback-only because Autopilot wasn't toggled, then s2 + s5 LLM success). Round-by-round flakiness in the upstream proxy continues, not the build.
- The "Autopilot recovery: food runway unsafe (net -151.2/min)" overlay in s5 is exactly the right copy for an LLM director making a state-aware decision — useful for both QA and the player.

## Files

- Output: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round12\Feedbacks\A1-stability-hunter.md`
- Screenshots: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round12\Feedbacks\screenshots\A1\`
  - `s1-boot.jpeg` (s1, ~30 s after Start)
  - `s1-5min.jpeg` (s1, end)
  - `s2-autopilot-5min.jpeg` (s2, autopilot ON + 4×, end — LLM mode active)
  - `s3-after-regen.jpeg` (s3, splash after `regenerate({template:'archipelago_isles', seed:7777})`)
  - `s4-stress60.jpeg` (s4, after `devStressSpawn(60)` + 4 min — Sela Reeve starvation toast visible)
  - `s5-fresh-end.jpeg` (s5, end on Temperate Plains, autopilot+LLM engaged, food-runway recovery banner)
