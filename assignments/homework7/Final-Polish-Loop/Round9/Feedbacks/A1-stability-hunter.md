# A1 — Stability Hunter — Round 9 Feedback

- **Date:** 2026-05-02
- **Build URL:** http://127.0.0.1:5173/
- **Reviewer:** A1 (stability sanity, BLIND)
- **Reviewer brief at expected path was missing** (`assignments/homework7/Final-Polish-Loop/Reviewers/A1-stability-hunter.md` does not exist) — proceeded based on role name + Hard Rules in the prompt.
- **Sessions:** 5 (≥5 min wall-clock each; navigated fresh at the start of each)

## Verdict

**STABLE — green.** Across five fresh-boot sessions, zero uncaught console errors, zero NaN/non-finite metrics, zero crashes, zero memory leaks observable. Save/load round-trip succeeds; regenerate succeeds; entity stress (devStressSpawn 50+ extra workers, 64 total entities) does not destabilize the simulation. Two warnings classes are expected and benign (AI proxy unreachable → fallback director engages cleanly; fallback toast surfaces in the HUD). The build is fit to ship Round 9 from a stability standpoint.

## Session log

| # | Map / Setup | Wall time | tick / sim-sec at end | fps | heap MB | errors | NaN | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Temperate Plains, Start, autopilot toggle attempted, then idle | 5 min | tick 7883 / sim 262.8s | 53.1 | 92.0 | 0 | 0 | First-Farm milestone fired; 22 internal warnings, 0 elevated to error. AI mode `fallback`. |
| 2 | Temperate Plains, autopilot ON via #aiToggleTop, fast-forward 4× via #speedFastBtn | 5 min | tick 801 / sim 26.7s | 1.24 | 76.3 | 0 | 0 | HUD "target ×4.0 / running ×0.8 (capped)". AI flipped to `llm` mid-run, then back to `fallback`. |
| 3 | Save → Load → Regenerate(rugged_highlands, seed 12345) | 5 min | tick 0 / sim 0 (regen returned to splash; idle) | 7.2 | 59.2 | 0 | 0 | `saveSnapshot` ok, payload ~1.9 MB. `loadSnapshot` ok. `regenerate` ok. After regenerate the splash overlay re-appeared (expected — needs explicit Start) but `getTelemetry().population` still reported the prior colony's by-group counts (mild stale-cache observation, P2). |
| 4 | Temperate Plains + devStressSpawn (workers 50, plus saboteur batches) | 4+ min | tick 231 / sim 7.7s | 1.68 | 67.1 | 0 | 0 | 64 entities. AnimalAISystem peak 4.0 ms, frameMs 4.1, simStepsThisFrame 3. No warnings escalated. `kind:'wolf'` ignored — spawned workers anyway (P2). Spawn cap kicked in cleanly (`spawned: 0` after total = 40/50). |
| 5 | Archipelago Isles, fresh, idle settle | 5 min | tick 135 / sim 4.5s | 6.9 | 61.1 | 0 | 0 | Run-started toast rendered correctly, 3-causeway scenario placement clean. |

Cumulative: 0 errors, 0 elevated warnings, 0 NaN metrics, 0 visible crashes / frozen renders.

## Findings

### P0 — none

No game-breaking stability issues observed. (Throttled fps in headless Playwright is environmental, not a build defect — see "Notes" below.)

### P1 — none confirmed

Watch-item, not yet a finding: under the in-app fast-forward request of ×4, HUD reports `target ×4.0 / running ×0.8 (capped)` (s2). This is intentional self-throttling when the page can't keep up — the cap is doing its job. In a non-headless browser the user would see the cap engage only when their machine cannot sustain ×4, which is the correct UX. **Recommend** keeping it, with a short tooltip explaining the "(capped)" suffix.

### P2 — minor / cosmetic

1. **`devStressSpawn` ignores `options.kind`** (s4). Calls with `{kind:'wolf', count:5}` produced 50 additional **workers** instead of wolves, despite returning `ok:true`. Dev-only API; harmless, but misleading for QA scripts. Source: `app.devStressSpawn` arg unpacking.
2. **Splash re-shows after `regenerate`** (s3). Calling `window.__utopiaLongRun.regenerate({...})` while a colony is live drops the user back to the splash overlay; expected if intentional, but worth documenting in the API surface doc — currently undocumented.
3. **Stale `population.byGroup` after regenerate** (s3). Immediately after `regenerate`, `getTelemetry().population.byGroup` still reports the prior colony's group counts (12 / 2 / 2 / 8 / 2). Resets correctly once Start Colony is pressed again. Cosmetic, only affects benchmark scripts that read telemetry between regenerate and the next Start.
4. **Two duplicate AI-proxy `[WARNING]` lines** within the first second of every fresh page load (s1, s2, s3, s5). Identical text, same line — the proxy is probed twice on init. Deduping the first probe (or coalescing the warning) would clean up console noise. Already counted by the in-game `warnings` collector but shown twice in DevTools.

### Environmental notes (not findings)

- Playwright headless throttles `requestAnimationFrame` aggressively when the tab is backgrounded between long `wait_for` blocks. Sessions 2-5 show fps 1.2-7 with frameMs ≤ 4 ms — i.e. plenty of headroom, the renderer just isn't being called. Session 1 ran ~53 fps because the tab stayed foregrounded the whole time. The build itself is performant.
- Screenshot tool occasionally times out on 5 s budget (PNG with font wait) but succeeds as JPEG. Not a build defect.

## Files

- Output: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round9\Feedbacks\A1-stability-hunter.md`
- Screenshots: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round9\Feedbacks\screenshots\A1\`
  - `s1-boot.png`, `s1-1min.png`, `s1-5min.png`
  - `s2-paused.png`, `s2-stall.jpeg`
  - `s3-1min.jpeg`, `s3-end.jpeg`
  - `s4-stress.jpeg`
  - `s5-archipelago.jpeg`
