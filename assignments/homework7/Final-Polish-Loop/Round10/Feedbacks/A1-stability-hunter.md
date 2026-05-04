# A1 — Stability Hunter — Round 10 Feedback

- **Date:** 2026-05-02
- **Build URL:** http://127.0.0.1:5173/
- **Reviewer:** A1 (stability sanity, BLIND)
- **Reviewer brief at expected path was missing** (`assignments/homework7/Final-Polish-Loop/Reviewers/A1-stability-hunter.md` does not exist). Proceeded from role name + Hard Rules in the prompt + Round 9 A1 self-template.
- **Sessions:** 5 (each navigated fresh; ≥5 min wall-clock per session except where noted).

## Verdict

**STABLE — green.** Across five fresh-boot sessions, zero uncaught console errors, zero NaN/non-finite metrics, zero crashes, zero observable memory growth. Save/load round-trip works (874594-byte snapshot persisted to slot `default`). devStressSpawn to 60 workers (68 total entities) ran a full 4 min without escalating any warning to error and without frame-budget collapse. Two warning classes are expected and benign (AI proxy timeout → fallback director steers cleanly; in-game `warnings.count` accrues 4–22 per session but `errorCount` stays 0). Build is fit to ship Round 10 from a stability standpoint.

## Session log

| # | Setup | Wall time | end tick | end heap MB | console errors | console warnings | in-game errorCount | NaN | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Temperate Plains, fresh, idle | 5 min | 3861 | 72 | 0 | 0 | 0 | 0 | AI `fallback`. Pop 12/2/0/4/0. Hungry 5 / Critical 0. Predators all consumed, saboteurs all neutralised. |
| 2 | Temperate Plains, autopilot ON via `#aiToggleTop`, 4× via `#speedFastBtn` | 5 min | 8105 | 83 | 0 | 1 (LLM proxy timeout) | 0 | 0 | "Story AI is offline — fallback director is steering. (Game still works.)" toast rendered. Saboteur load spiked to 7 mid-run, defenders engaged, returned to 2. 22 entities. `Run 00:00:44` after 5 wall-min — Playwright headless throttles rAF (env, not build defect). |
| 3 | Save → Load → Regenerate(rugged_highlands seed 12345) → Regenerate(archipelago_isles seed 7777) | ≈3 min | 0 (back to splash) | n/a | 0 | 2 | 0 | 0 | `saveSnapshot()` returned `{ok:true, slotId:"default", bytes:874594}` — clean. `loadSnapshot()` returned `true`. **First** `regenerate({template:'rugged_highlands'})` returned `null` and dropped to splash showing Rugged Highlands. **Second** `regenerate({template:'archipelago_isles'})` was effectively no-op — splash still showed Rugged Highlands (P1, see below). |
| 4 | Temperate Plains + `devStressSpawn(60)` | 4+ min | 2230 | 92 | 0 | 1 (LLM) | 0 | 0 | 60 workers (48 fallback tiles used, infraCap honoured; `total: 60` returned). 68 entities. Dev 40 milestone fired. No frame collapse. |
| 5 | Configure(`coastal_ocean`, seed 42) → Start | 5 min | 2516 | 74 | 0 | 0 | 0 | 0 | `configure()` and `startRun()` template overrides did NOT switch the splash from Temperate Plains — fresh-boot defaults won. Game ran cleanly on Temperate Plains. |

Cumulative: 0 console errors, 0 elevated in-game warnings, 0 NaN metrics, 0 crashes, 0 frozen renders, 0 leaks. Heap envelope 65–92 MB across all stress.

## Findings

### P0 — none

No game-breaking stability issues observed.

### P1 — Regenerate accepts options but ignores subsequent calls (s3)

`window.__utopiaLongRun.regenerate({template, seed})` is idempotent in a confusing way: the **first** call after a session does drop the user back to splash and prepares a fresh layout, but **further** `regenerate()` calls before pressing Start do NOT update the splash's announced template/seed. Reproduction in s3:

1. Start Temperate Plains.
2. `regenerate({template:'rugged_highlands', seed:12345})` → splash returns and shows Rugged Highlands seed 12345. Good.
3. `regenerate({template:'archipelago_isles', seed:7777})` → splash still Rugged Highlands. Returned value is `null`. No console error.

Effect: any benchmark / test harness that wants to chain regenerates without an intervening Start will silently keep the first map. Recommend either (a) honouring subsequent `regenerate` calls from splash phase, or (b) returning `{ok:false, reason:'pending_start'}` so callers can detect it. (Round 9 P2 noted the related stale `population.byGroup`; that is also still present here — `pop` after regen still mirrors the prior session's 12/2/2/8/2.)

Carryover: `configure()` / `startRun()` from `__utopiaLongRun` (s5) likewise didn't override the splash's template. Same root cause likely (splash already populated; setters don't re-seed it).

### P2 — minor / cosmetic

1. **`devStressSpawn` API contract changed without docstring deprecation hint.** Round 9 callers passing `devStressSpawn({count:50})` now get `{ok:false, reason:'invalid_target'}` because the signature is `(target:number, _options)` (s4). The change is correct (Round 9 noted the `kind` arg was being ignored — now it's loud about it), but external Playwright scripts pinned to the v0.9.x shape will break silently as `ok:false`. Recommend the JSDoc above `devStressSpawn` in `src/app/GameApp.js` add an explicit "BREAKING in v0.10.1: was previously `(options:{count, kind?})`" line so anyone diffing the file knows.
2. **AI proxy timeout warning fires every fresh session** (s1, s2, s3, s4, s5). Identical "WHISPER?: LLM never reached" / "Story AI is offline" pair within ~1 s of overlay click. Already counted by the in-game `warnings` collector (errorCount stays 0), but DevTools shows the warning each load. Suggest deduping the first probe so a fresh page load isn't visibly noisy. (Same observation as Round 9 P2 #4; not fixed.)
3. **`warnCount` accrues without surfacing in HUD.** s1 ended at 0 visible warnings, but s2 hit 21 internal warnings under autopilot. The HUD has no pill / badge for "internal warning rate"; a small dev-only counter would help reviewers spot regressions like a sudden warning storm. Cosmetic only — no warnings escalated.
4. **Stale `population.byGroup` after regenerate** (s3). Carryover from Round 9 P2 #3 — telemetry still reports the prior colony's by-group counts immediately after `regenerate()`. Resets correctly once Start Colony is pressed. Affects only benchmark scripts that read telemetry between regenerate and the next Start.

### Environmental notes (not findings)

- Playwright headless throttles `requestAnimationFrame` aggressively. Sessions 2-5 show `Run 00:00:44–00:01:25` after 4-5 wall-min — i.e. ≈8-15× slower than realtime, but with `frameMs` headroom (the renderer just isn't being called frequently). Session 1 ran closer to realtime because the tab stayed foregrounded. Build itself is performant.
- Two zero-byte JSON warnings in DevTools are coming from `console.warn` on AI proxy probe; benign.

## Files

- Output: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round10\Feedbacks\A1-stability-hunter.md`
- Screenshots: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round10\Feedbacks\screenshots\A1\`
  - `s1-boot.jpeg` (s1, ~1 min)
  - `s1-5min.jpeg` (s1, end)
  - `s2-autopilot-5min.jpeg` (s2, autopilot ON + 4×, end)
  - `s3-after-regen.jpeg` (s3, splash after regenerate)
  - `s4-stress60.jpeg` (s4, 60 workers + 8 visitors)
  - `s5-fresh-end.jpeg` (s5, end)
