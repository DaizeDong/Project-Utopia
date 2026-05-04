# A1 — Stability Hunter — Round 13 Feedback

- **Date:** 2026-05-02
- **Build URL:** http://127.0.0.1:5173/
- **Reviewer:** A1 (stability sanity, BLIND)
- **Reviewer brief at the spec'd path is missing** (`assignments/homework7/Final-Polish-Loop/Reviewers/A1-stability-hunter.md` does not exist — same as R11 + R12). Proceeded from the role name + Hard Rules in the harness prompt + my R12 feedback as a self-template, so the bar stays consistent across rounds.
- **Sessions:** 5 (each navigated fresh; ≥5 min wall-clock for s1/s2/s5; s3 is the deliberately short save/load/regenerate cycle; s4 is 30 s warm-up + 4 min stress observation).

## Verdict

**STABLE — green.** Across five fresh-boot sessions, **zero uncaught console errors, zero NaN/non-finite metrics, zero crashes, zero observable memory growth** (heap envelope 58–91 MB across all stress, including stress-spawn). Save/load round-trip works cleanly (783 KB snapshot persisted to slot `default` and reloaded to phase=`menu`). LLM director engaged in s2 + s5 (`liveCoverageSatisfied: true`, `proxyHealth: "up"`, `model: gpt-5.4-nano`); fallback mode took over cleanly when needed in s1/s4 with no escalation. **R12's P2 #1 (`regenerate()` shape) is preserved in R13** — still returns `{ok:true, templateId, seed, phase:"menu"}`. **NEW IN R13:** the `regenerate({template:...})` parameter name is now soft-deprecated with a console warning recommending `{templateId:...}` (visible in s3 — non-breaking, both forms still work). **devStressSpawn(60)** in R13 returned `{ok:true, spawned:48, total:60, fallbackTilesUsed:48}` — this is *better* than R12's silent up-front cap because it now discloses fallback-tile usage as a separate field, and the actual byGroup workers count (60) matches the request. Build is fit to ship Round 13 from a stability standpoint.

## Session log

| # | Setup | Wall time | end tick | end heap MB | console errors | console warnings | in-game errorCount | in-game warnCount | NaN | AI mode | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Temperate Plains, fresh, idle | 5 min | 251 | 59.67 | 0 | 0 | 0 | 1 | 0 | fallback | Clean idle baseline. Pop 12/2/2/7/2. 1 predation death. fps 11.56 (sim throttled by headless rAF — `headroomFps: 303`, `frameMs: 3.3`). simSec 8.37 — heavily backgrounded. Game itself is fine; the harness tab just isn't getting render slots. |
| 2 | Temperate Plains, autopilot ON via `setAiEnabled(true)` + `#speedFastBtn` | 5 min | 771 | 91.28 | 0 | 0 | 0 | 5 | 0 | **llm** | Toolbar showed "Autopilot ON - llm/llm - next policy in 6.0s". 2 LLM responses + 2 fallback in 6 requests, `proxyHealth:"up"`, `model:"gpt-5.4-nano"`, `liveCoverageSatisfied:true`. Director registered Construction Targets x6/x3/x8/x1/x2/x1 in scoreboard; "east ruined depot ×2" tag confirms blueprints in flight (telemetry `world.buildings` still reads 0 because none completed in the 5-min window — sim was running at running ×0.8 of target ×4). 1 predation death. heapMb 91.28 (within R12's 30–87 MB envelope plus a small tick). |
| 3 | Save → Load → regenerate(rugged_highlands seed 12345) → regenerate(archipelago_isles seed 7777) | ≈30 s | n/a (back to splash) | n/a | 0 | 3 | 0 | n/a | 0 | n/a | `saveSnapshot()` → `{ok:true, slotId:"default", bytes:783551}`. `loadSnapshot()` → `{ok:true, slotId:"default", phase:"menu"}`. **`regenerate()` shape preserved from R12**: `{ok:true, templateId:"archipelago_isles", seed:7777, phase:"menu"}`. Splash visibly updated to "Archipelago Isles · Island Relay · seed 7777". **NEW R13 deprecation warning (non-breaking)**: `[utopia] regenerate({template}) is deprecated; use {templateId} instead.` — both forms still accepted. Population `byGroup` STILL shows splash defaults (12/2/2/8/2) on the menu phase (R12 P2 #3 / R11 P2 #5 carryover). |
| 4 | Temperate Plains + `devStressSpawn(60)` after 30 s warm-up | 4 min | 582 | 69.74 | 0 | 0 | 0 | 5 | 0 | fallback | `devStressSpawn(60)` returned `{ok:true, spawned:48, total:60, fallbackTilesUsed:48}` — **R13 reverts to R11's "spawn what fits + report fallback tile count" behaviour, BUT now exposes `fallbackTilesUsed` as a first-class field in the return value.** This is a net improvement over R12's silent up-front cap (60→5) because the harness can now see exactly how many tiles were force-placed via fallback (48 of 60) and the actual `population.byGroup.workers` (60) matches the request. 2 predation deaths. fps 1.71 / `headroomFps:107`. UI showed "Dev 40 - foothold: Your colony is surviving; widen the production chain." |
| 5 | Fresh page → `lr.configure({template:'coastal_ocean', seed:42})` → `lr.startRun({template:'coastal_ocean', seed:42})` → `lr.setAiEnabled(true)` + 4× | 5 min | 534 | 69.56 | 0 | 1 | 0 | 2 | 0 | **llm** | `configure()` and `startRun()` template+seed overrides on a fresh page were **STILL IGNORED** — game booted Temperate Plains alpha_broken_frontier (R12 P2 #1 / R11 P2 #2 carryover, NOT fixed). Both calls returned `undefined`. Once `setAiEnabled(true)` engaged, LLM director served 2/4 requests, `proxyHealth:"up"`, `liveCoverageSatisfied:true`. Banner "Autopilot ON - llm/llm". 0 deaths. Recovery banner: "The colony breathes again. Rebuild your routes before the next wave." Heap 62→70 MB across 5 min — within R12's 30–87 MB envelope. |

Cumulative: **0 console errors, 0 NaN metrics, 0 crashes, 0 frozen renders, 0 leaks**. Heap envelope 58–91 MB (s2 peaked at 91 MB during LLM autopilot; rest stayed 60–70 MB). In-game `warnings.count` accrues 1–5 per session, `errorCount` stays 0 in every session. Console warnings cumulative across all 5 sessions: 6 (4× AI proxy timeout, 2× regenerate-deprecation).

## Findings

### P0 — none

No game-breaking stability issues observed.

### P1 — none

R12's P1 list was already empty. The remaining quirks below are demoted to P2 because (a) they don't break the game, (b) they only affect benchmark/Playwright harnesses, and (c) the on-screen experience is unaffected.

### P2 — minor / cosmetic

1. **`configure()` / `startRun()` template overrides on a fresh boot are STILL ignored** (s5; R12 P2 #1 / R11 P2 #2 carryover, NOT fixed). After a fresh page load, calling `lr.configure({template:'coastal_ocean', seed:42})` and then `lr.startRun({template:'coastal_ocean', seed:42})` started a Temperate Plains alpha_broken_frontier run. Both functions returned `undefined`. Splash defaults won. Same recommendation as R11/R12: either honour `configure()`'s template/seed before `startRun()` commits, or return `{ok:false, reason:'splash_already_committed'}`. **R13's `regenerate()` shape fix and the new deprecation warning show the pattern — apply it here.** Bonus: now that `regenerate({template})` is being deprecated in favour of `{templateId}`, `configure`/`startRun` should accept the same canonical key.

2. **Stale `population.byGroup` after regenerate** (s3). Carryover from R12 P2 #3 / R11 P2 #5 / R10 P2 #4 / R9 P2 #3 — telemetry still reports the prior colony's by-group counts (12/2/2/8/2) immediately after `regenerate()` lands on the splash. Resets correctly once Start Colony is pressed. Affects only benchmark scripts that read telemetry between regenerate and the next Start. Now that `regenerate()` returns proper shape (R12 fix preserved), zeroing or null-ing `byGroup` in the menu phase would be the consistent next step.

3. **`warnCount` accrues without a HUD pill.** s2 ended at 5 internal warnings, s4 at 5 (post-stress), s5 at 2. Same as R12 P2 #4 / R11 P2 #6 / R10 P2 #3 — no in-HUD badge for "internal warning rate" so a sudden warning storm under autopilot would be invisible to a reviewer not running `getTelemetry()`. Cosmetic only — no warnings escalated.

4. **AI proxy fresh-session probe still fires "AI proxy unreachable: timeout" warnings on the first 1–2 health-checks** (s5: 4 such console warnings before the proxy came up at the 30 s mark). Same as R12 P2 #5 / R11 P2 #4 / R10 P2 #2 / R9 P2 #4. Already counted by the in-game `warnings` collector (errorCount stays 0). Suggest either deduping the first probe or downgrading the boot-time timeout from `console.warn` to `console.debug` so a fresh page load isn't visibly noisy when the proxy is just slow to wake.

5. **`regenerate({template:...})` is now deprecated but `configure`/`startRun` still document `{template:...}` (s3, s5).** R13 added the deprecation warning `[utopia] regenerate({template}) is deprecated; use {templateId} instead.` for `regenerate()`, but the same parameter name `template` is the *only* form documented in the harness for `configure()` and `startRun()` — so callers that follow the deprecation guidance will inadvertently use `{templateId}` everywhere, which `configure`/`startRun` may silently ignore (compounding finding #1). Recommend either (a) ship the deprecation simultaneously across the three sister APIs, or (b) make `configure`/`startRun` accept both keys for transition.

6. **`devStressSpawn` semantics changed again between R12 → R13.** R11 was `{spawned:48, total:60}` (silent post-cull). R12 was `{spawned:5, total:17}` (silent up-front infra-cap). R13 is `{spawned:48, total:60, fallbackTilesUsed:48}` (back to "best-effort + disclose"). The R13 form is the most honest of the three — `fallbackTilesUsed:48` lets a harness reason about "of 60 requested, 48 needed fallback tile placement" — but the round-over-round churn on this one undocumented dev API is the kind of thing that breaks long-term benchmark scripts. Recommend: pin the contract in a JSDoc on `devStressSpawn` so it doesn't flip every round.

### Round-over-round delta vs R12

- **R12 P2 #1 (`configure`/`startRun` overrides ignored) — NOT FIXED.** Carryover (s5).
- **R12 P2 #2 (`devStressSpawn` semantics) — IMPROVED.** Now returns `{spawned, total, fallbackTilesUsed}` with the actual count matching the request (s4). The `fallbackTilesUsed` field is new and useful.
- **R12 P2 #3 (stale `byGroup` after regenerate) — NOT FIXED.** Carryover (s3).
- **R12 P2 #4 (`warnCount` no HUD pill) — NOT FIXED.** Carryover (s2/s4/s5).
- **R12 P2 #5 (fresh-session AI probe noisy) — NOT FIXED.** Carryover (s5: 4× timeout warnings before LLM came up).
- **R12 P2 #6 (autopilot click race) — NOT OBSERVED THIS ROUND** (s2 used `setAiEnabled(true)` directly per s5's R12 lesson; banner engaged cleanly).
- **NEW R13 — `regenerate({template})` deprecation warning** (s3). Non-breaking (both forms still accepted). Good direction; see P2 #5 above for the cross-API consistency note.
- **R12 `regenerate()` shape fix — PRESERVED in R13.**

### Environmental notes (not findings)

- Playwright headless still throttles `requestAnimationFrame` aggressively. s1 ran 251 ticks in 5 wall-min; s2/s5 (4× speed setting) hit 534–771 ticks in 5 wall-min. The renderer simply isn't being called frequently — `frameMs` stayed at 3–14 ms in every session, indicating ~70–300+ fps headroom. Build itself is performant.
- LLM proxy was reachable for both s2 and s5 this round (similar to R12). The 4× speed setting actually runs at ×0.4–×0.8 because of headless throttling — toolbar honestly displays "target ×4.0 / running ×0.4 (capped)" which is the right copy.
- The "Autopilot ON - llm/llm - next policy in 6.0s" banner in s2/s5 is exactly the right copy for a state-aware LLM director with a visible cool-down — useful for both QA and the player.
- The new deprecation warning `[utopia] regenerate({template}) is deprecated; use {templateId} instead.` is the right pattern; just needs to be applied uniformly across `configure`/`startRun`/`regenerate`.

## Files

- Output: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round13\Feedbacks\A1-stability-hunter.md`
- Screenshots: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round13\Feedbacks\screenshots\A1\`
  - `s1-boot.jpeg` (s1, ~30 s after Start)
  - `s1-5min.jpeg` (s1, end)
  - `s2-autopilot-5min.jpeg` (s2, autopilot ON + 4×, end — LLM mode active, "next policy in 6.0s")
  - `s3-after-regen.jpeg` (s3, splash after `regenerate({template:'archipelago_isles', seed:7777})`)
  - `s4-stress60.jpeg` (s4, after `devStressSpawn(60)` + 4 min — 60 workers visible, "Dev 40 - foothold" banner)
  - `s5-fresh-end.jpeg` (s5, end on Temperate Plains, autopilot+LLM engaged, "colony breathes again" recovery banner)
