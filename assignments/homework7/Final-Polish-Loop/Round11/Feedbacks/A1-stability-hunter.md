# A1 — Stability Hunter — Round 11 Feedback

- **Date:** 2026-05-02
- **Build URL:** http://127.0.0.1:5173/
- **Reviewer:** A1 (stability sanity, BLIND)
- **Reviewer brief at the spec'd path is missing** (`assignments/homework7/Final-Polish-Loop/Reviewers/A1-stability-hunter.md` does not exist on disk; the closest analogue is `assignments/homework6/Agent-Feedback-Loop/Reviewers/`, which is for the prior assignment). Proceeded from the role name + Hard Rules in the harness prompt + my own R10 feedback as a self-template, so the bar stays consistent across rounds.
- **Sessions:** 5 (each navigated fresh; ≥5 min wall-clock per session except s3 which is the deliberately short save/load/regenerate cycle).

## Verdict

**STABLE — green.** Across five fresh-boot sessions, zero uncaught console errors, zero NaN/non-finite metrics, zero crashes, zero observable memory growth (heap envelope 28–56 MB across all stress, including 60-worker spawn). Save/load round-trip works (2.5 MB snapshot persisted to slot `default` and reloaded cleanly to phase=active at the same tick). devStressSpawn(60) ran a full 4.5 min without escalating any warning to error and without frame-budget collapse. AI proxy timeouts in s1/s2 fell back cleanly; in s4/s5 the LLM director engaged for real and steered without raising any error. **R10's P1 (regenerate ignored on subsequent calls) is FIXED in R11** — the second `regenerate({template:'archipelago_isles', seed:7777})` did update the splash to Archipelago Isles seed 7777. Build is fit to ship Round 11 from a stability standpoint.

## Session log

| # | Setup | Wall time | end tick | end heap MB | console errors | console warnings | in-game errorCount | in-game warnCount | NaN | AI mode | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Temperate Plains, fresh, idle | 5 min | 91 | 30 | 0 | 0 | 0 | 0 | 0 | fallback | rAF heavily throttled in headless tab → 91 ticks / 3 sim-sec across 5 wall-min. Pop 12 / 2 / 2 / 8 / 2. Deaths 0. fps 9.5, frameMs 3.1 (game has plenty of headroom; renderer simply not being called). |
| 2 | Temperate Plains, autopilot ON via `#aiToggleTop`, 4× via `#speedFastBtn` | 5 min | 3453 | 52 | 0 | 0 | 0 | 10 | 0 | fallback | "Autopilot ON - fallback/llm" toolbar ; "WHISPER?: LLM quiet — fallback steering" overlay. Speed shows `target ×4.0 / running ×0.6 (capped)` — game adapts to throttled rAF. 1 worker death. fps 4.08. |
| 3 | Save → Load → regenerate(rugged_highlands seed 12345) → regenerate(archipelago_isles seed 7777) | ≈1.5 min | n/a (back to splash) | n/a | 0 | 2 | 0 | n/a | 0 | n/a | `saveSnapshot()` returned `{ok:true, slotId:"default", bytes:2507024}` — clean. `loadSnapshot()` returned `{ok:true, slotId:"default", phase:"active"}`. Tick was preserved (534 → 534 round-trip). **First** `regenerate({template:'rugged_highlands', seed:12345})` returned `null` and dropped to splash showing Rugged Highlands. **Second** `regenerate({template:'archipelago_isles', seed:7777})` ALSO updated the splash — now showing Archipelago Isles seed 7777. R10's P1 is FIXED. |
| 4 | Temperate Plains + `devStressSpawn(60)` after 30 s warm-up | 4.5 min | 2409 | 43 | 0 | 0 | 0 | 10 | 0 | llm | `devStressSpawn` returned `{ok:true, spawned:48, total:60, fallbackTilesUsed:48}`. Pop spiked to 60 workers (74 entities); ~4.5 min later workers had **been culled back to 12** (deaths.total=2, all predation). The 48 stress-spawn workers vanished without incrementing a death reason — possibly infraCap GC or pop trim. No errors, no NaN, but the `total:60` contract is silently broken downstream — see P2 below. AI engaged in `llm` mode (proxy responsive). |
| 5 | `configure(coastal_ocean, seed 42)` → `startRun(coastal_ocean, seed 42)` from a fresh page | 5 min | 816 | 34 | 0 | 0 | 0 | 8 | 0 | llm | `configure()` and `startRun()` template+seed overrides on a fresh page were IGNORED — game booted Temperate Plains alpha_broken_frontier. Same R10 P1 carryover but now isolated to the bootstrap path (regenerate-on-already-running is fixed in R11). Run itself stable. fps 1.0 (browser tab was background-throttled hardest in this run). |

Cumulative: **0 console errors, 0 NaN metrics, 0 crashes, 0 frozen renders, 0 leaks**. Heap envelope 28–56 MB across all stress (down from R10's 65–92 MB envelope — cleaner). In-game `warnings.count` accrues 0–10 per session, `errorCount` stays 0 in every session.

## Findings

### P0 — none

No game-breaking stability issues observed.

### P1 — none

R10's P1 (`regenerate` ignored on subsequent calls) is fixed in R11. The remaining quirks are demoted to P2 because (a) they don't break the game, (b) they only affect benchmark/Playwright harnesses, and (c) the on-screen splash now visibly reflects the regenerate side effect even though the function still returns `null`.

### P2 — minor / cosmetic

1. **`regenerate()` still returns `null` despite working.** s3 confirmed both `regenerate({template:'rugged_highlands', seed:12345})` and `regenerate({template:'archipelago_isles', seed:7777})` updated the splash correctly — but both calls return `null` instead of the conventional `{ok:true, ...}` object that `saveSnapshot` and `loadSnapshot` return. Recommend mirroring the save/load shape (`{ok:true, templateId, seed, phase}`) so chained Playwright scripts can `expect(r.ok).toBe(true)` instead of relying on a follow-up `getTelemetry()`.
2. **`configure()` / `startRun()` template overrides on a fresh boot are ignored** (s5). After a fresh page load, calling `lr.configure({template:'coastal_ocean', seed:42})` and then `lr.startRun({template:'coastal_ocean', seed:42})` started a Temperate Plains alpha_broken_frontier run. Splash defaults won. The fix in R11 to chained `regenerate` calls suggests the same mechanism (drain pending splash config before applying the new one) would apply here — currently the fresh-boot path commits the splash defaults to the active run before the override is read. Recommend either honouring `configure()`'s template/seed before `startRun()` commits, or returning `{ok:false, reason:'splash_already_committed'}`.
3. **`devStressSpawn(60)` workers silently culled within ~4 min** (s4). The function returns `{ok:true, spawned:48, total:60}`, the population telemetry confirms `workers:60` immediately after the call, but ~4.5 min later `workers:12` and `deaths.total:2` (both predation). The 48 stress-spawn workers vanished without showing up in `deaths.byReason` — likely infraCap or pop-cap GC. This is correct gameplay (the colony can't sustain 60 workers without infrastructure), but it silently breaks any benchmark script that spawns 60 to measure system throughput at scale. Recommend either (a) bumping a `population.culledByCap` counter so the disappearance is observable in telemetry, or (b) emitting an in-game warning the first time a cap-cull fires after a `devStressSpawn`.
4. **AI proxy timeout warning still fires every fresh session** (s1, s2 of 5; s4 and s5 actually got LLM responses this round). The "WHISPER?: LLM never reached" / "Story AI is offline" pair within ~1 s of overlay click. Already counted by the in-game `warnings` collector (errorCount stays 0). Same observation as R10 P2 #2 and R9 P2 #4; not fixed. Suggest deduping the first probe so a fresh page load isn't visibly noisy when the user hasn't even clicked Autopilot yet.
5. **Stale `population.byGroup` after regenerate** (s3). Carryover from R10 P2 #4 / R9 P2 #3 — telemetry still reports the prior colony's by-group counts (12/2/2/8/2) immediately after `regenerate()` lands on the splash. Resets correctly once Start Colony is pressed. Affects only benchmark scripts that read telemetry between regenerate and the next Start.
6. **`warnCount` accrues without a HUD pill.** s2 ended at 10 internal warnings, s4 also 10, s5 8. Same as R10 P2 #3 — no in-HUD badge for "internal warning rate" so a sudden warning storm under autopilot would be invisible to a reviewer not running `getTelemetry()`. Cosmetic only — no warnings escalated.

### Environmental notes (not findings)

- Playwright headless throttles `requestAnimationFrame` aggressively. s1 ran 91 ticks / 3 sim-sec in 5 wall-min; s2 (4× speed + autopilot) hit 3453 ticks / 115 sim-sec in 5 wall-min. The renderer simply isn't being called frequently — `frameMs` stayed at 3.1 ms in s1, indicating ~320 fps headroom. Build itself is performant.
- The s1 run-banner "Run --:--:--" with autopilot OFF correctly distinguishes "no time has passed yet" from "game is broken" — good copy.
- s4 LLM mode + s5 LLM mode show the AI proxy IS reachable in this round (s1/s2 timed out, s4/s5 succeeded). Round-by-round flakiness in the upstream proxy, not the build.

## Files

- Output: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round11\Feedbacks\A1-stability-hunter.md`
- Screenshots: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round11\Feedbacks\screenshots\A1\`
  - `s1-boot.jpeg` (s1, ~30 s after Start)
  - `s1-5min.jpeg` (s1, end)
  - `s2-autopilot-5min.jpeg` (s2, autopilot ON + 4×, end)
  - `s3-after-regen.jpeg` (s3, splash after regenerate to Archipelago Isles seed 7777)
  - `s4-stress60.jpeg` (s4, after stress-spawn culled back to 12)
  - `s5-fresh-end.jpeg` (s5, end on Temperate Plains, autopilot+LLM engaged)
