# A5 - Balance Critic - Round 12 (Tier A, R12)

- **Build URL:** http://127.0.0.1:5173/
- **Date:** 2026-05-02
- **Mode:** Strictly blind. No prior R12 reviewer feedback consulted; reviewer brief at requested path was missing, so worked from PROCESS.md role definition (`A5 = resource curves / difficulty curves / strategy depth`).
- **Coverage:** 3 distinct playthroughs on different templates with different opening strategies, all at 8x ultra speed under colony Autopilot (LLM offline → fallback director steered every run).

## Playthroughs

| # | Template | Seed | Strategy | Survived | Score | Dev | Deaths | Finale |
|---|----------|------|----------|----------|-------|-----|--------|--------|
| 1 | Temperate Plains - Broken Frontier (default starter) | 1638360143 | balanced autopilot, no manual builds | **39:33** | **3132** | 32 (smoothed 24) | 26 | "Mid-tier · The frontier ate them." |
| 2 | Rugged Highlands - Gate Bastion (chokepoint preset) | 94499 | autopilot + manual Space-resume on first food crisis | **8:28** | 444 | 28 (smoothed 21) | 14 | "Mid-tier · The frontier ate them." |
| 3 | Fertile Riverlands - Silted Hearth (throughput preset) | 45030 | autopilot + manual Space-resume on first food crisis | **7:16** | 275 | 20 (smoothed 11) | 17 | "Low-tier · The colony stalled." |

All three runs ended with **Workers: 0** (colony wiped). Mean survival 18:22; mean deaths 19. Best run was the easiest "starter / balanced / logistics" template, which is also the only one in the build's curated best-runs list with scores >1000.

## Verdict

**Fail (curve & strategy depth) / Conditional Pass (anti-grind)**. The intent — fast survival arcs that end in failure and reward the next run — is legible and the score/Dev/finale-tier closeout copy is genuinely good. **However**, two structural problems make the difficulty curve degenerate today:

1. **The starter map is a generation behind every other map.** Temperate Plains lasted 4.6× longer than Highlands and 5.4× longer than Riverlands on the very same fallback policy, identical 12-worker start, identical autopilot. The "fertile" tag map died **fastest**. This is the inverse of what the briefing copy promises ("the valley pays off") and inverts the design tags (`balanced/steady` should not crush `fertile/throughput`).
2. **There is no recoverable food crisis.** All three runs reached `Food 0, Workers ~11 all Critical/starving` between **6:35 and 6:46 sim time** — a tighter clustering than three different maps + three different seeds should produce. The autopilot pause-on-food-crisis fires correctly, but Space-resume + recovery boost yields a near-identical wipe ~60-90 seconds later. The "Recovery Director" added in earlier rounds is not visible in outcomes.

There is currently no dominant *player* strategy because the player is barely a participant — autopilot is the only viable path (manual play not tested here per blind protocol, but the fallback policy's failure rate is itself a balance signal). The dominant *colony* strategy is "stack wood, never feed anyone" — see issue #1 below.

## Top 3 Balance Issues

### 1. (P0 - Resource Curve) **Wood snowballs while food collapses on every map**
Run 1: Wood 34 → 291 → 444 → **685 → final 767** (+22×). Food 315 → 333 → **13 → 56 → 0** (-100%). Same shape on Run 2 (W=0 wasn't even a problem; food collapse happened first) and Run 3 (W still ≤3 when F=0). The fallback director assigns workers to FARM/BUILDER/WOOD by role but only WOOD actually produces a deliverable to the warehouse fast enough; FARM workers spend the run cycling Hungry / Wander / Harvest / Wander while the food gauge bleeds. The lumber@95 zero-lumber safety net (R4-A5 patch) is doing its job too well — wood has no consumption sink commensurate with its 20× ramp, while farms either don't get placed or don't deliver before nearby workers starve. Recommend: cut farm-build commission cost (or include 1 farm in Alpha bootstrap before the road target), or halve `BALANCE.kitchenMealOutput` consumption upstream until the carry → warehouse → eat loop completes its delivery window. The screenshot `screenshots/A5/04-p1-mid.png` (19:23 sim, F=13 W=445) and `screenshots/A5/05-p1-late.png` (31:21 sim, F=96 W=685, 6 workers all Starving/Critical) tell the story.

### 2. (P0 - Difficulty Curve) **Non-starter templates wipe in 7-9 sim minutes on default fallback**
Highlands and Riverlands hit `Food 0 + 11 Critical-hunger workers + Autopilot PAUSED · food crisis` at **6:35** and **6:46** respectively, then wiped at **8:28** and **7:16**. By contrast Temperate Plains rode the same crisis to 39:33. Three of six templates (Highlands, Riverlands, by extension the unexamined Coastal/Archipelago given they ship lower starting wood per `EntityFactory.getTemplateStartingResources`) appear to be in a difficulty band the autopilot can't handle, which means they're effectively *unwinnable* for any player who relies on the fallback director (the screen prompt itself says "Story AI is offline — fallback director is steering. (Game still works.)" — but it visibly doesn't on these maps). Either rebalance starting resources up for non-temperate templates, or buff the fallback director's first-100-second build sequence on `mountain/fertile/coastal` tags. The "best runs" list in the title screen (`screenshots/A5/01-title.png`) tells the same story — every entry >300 points is Temperate Plains or Highlands, never Coastal, Archipelago, Riverlands, or Fortified.

### 3. (P1 - Strategy Depth / Recovery) **Autopilot food-crisis pause is a dead-end, not a recovery hook**
The PAUSED banner reads "Build/restock Food, then press Space or toggle Autopilot to resume." On both Run 2 and Run 3, pressing Space (which the player is told to do) resumed the run into a wipe ~60-90s later with **zero** new food production and `Workers 0` shortly after. The Recovery Director that was supposed to short-circuit this pattern (per Round 9 plan + R4-A5 food-floor gate) is either not firing or not effective at the actual crisis depth (`food=0, farms=0 OR farms-not-yet-built`). The food-floor gate explicitly suppresses recovery charge consumption when food≥200, which is *correct* but irrelevant — by the time the crisis fires, food is already 0 and recovery should be aggressively spending charges. Recommend: add an inverse "panic" branch — if `food <= 5 AND farms === 0`, force-spawn a farm blueprint adjacent to the colony spawn within 10s, drawn from a 1-charge emergency pool that's separate from the regular cooldown gate. Also: the pause banner copy should *do something* when player presses Space — currently it reads as agency but is functionally a death sentence.

## Secondary Notes (not in top 3)

- **Pop ceiling never tested.** All 3 runs lost workers monotonically from t=0 (12 → 10 → 6 → 0). Recruitment system never engaged because food never hit the buffer threshold (R4-A5 food-buffer spawn gate). Strategy depth around recruit-vs-build-vs-defend is unreachable from current opening.
- **"Autopilot OFF - manual; builders/director idle." banner regression.** The HUD banner (`#headerStatus` or similar) shows `Autopilot OFF - manual; builders/director idle.` even when the toggle checkbox `#aiToggleTop` is `checked === true` (verified with two `page.evaluate()` reads). I confirmed the toggle was visually checked AND the autopilot was clearly running (workers seeking tasks, not all wandering). The banner text is stale / mis-bound to the underlying state. Mid-run readability issue for any balance audit and almost certainly confusing for players. See `screenshots/A5/03-p1-30s.png` and `04-p1-mid.png`.
- **Threat plateau at 35-45 across all maps.** Threat hovered 36-47 on every screenshot regardless of which map / which sim time. Not a difficulty input on this build — the wipe driver is starvation, not raids. If raid pressure is supposed to scale with DevIndex, it isn't visibly doing so on a Dev=24-32 outcome. Threat slider feels like flavour text.
- **Best Runs ledger feels like a curve diagnostic.** Top-10 list at title screen is dominated by Temperate Plains and Highlands; not a single Archipelago / Coastal / Fertile run >300 pts. After my 3 runs the ledger shows `1. 3132 Temperate / 2. 1459 Highlands / 5. 444 Highlands / 8. 275 Riverlands` — the gap between #1 and #2 is 2.1×, and between starter map and others is 7-12×. That spread is map-imbalance, not player skill, because all my runs used the same fallback policy.
- **Per-map starting wood (R4-A5) may have over-corrected for non-temperate maps.** Riverlands started at W=0 visible in HUD at 1:48 sim time (Run 3) — wood was already exhausted by the lumber camp build before any food production existed. Temperate's W=34 starting kit stretched 13 sim minutes; Riverlands' (likely 32 per the table) was gone in 90 seconds because the Silted Hearth scenario forces the road-clearing build. Either bump Riverlands starting wood OR delay the silt road blocker by 2-3 minutes.
- **"killed-by-worker" toast spam for wildlife.** Run 1 spawned 5+ centerscreen red toasts (`Rook-47`, `Crow-300`, `Hex-294`, `Thorne-143`, `Barr-165`, `Bear-189` — all wildlife) labelled `died - killed-by-worker`. These aren't player-relevant balance events but they were the most prominent notification in the run. Clutters the channel that should be carrying actual crisis signal (`food crisis`, `worker starved`).

## Dominant Strategy

There is no player-discoverable dominant strategy because two of three maps are unsurvivable past 9 sim minutes on the fallback policy and manual play wasn't blind-attempted. The *autopilot* dominant behaviour is "rush wood-camp, then attempt farm, then watch the colony starve" — which is exactly the failure mode the curve is supposed to dissuade. Effectively the dominant strategy on the title screen is *"play Temperate Plains and ignore the other 5 maps."*

## Main Balance Issues (summary)

1. Wood inflation vs food collapse — the two halves of the resource economy run on different clocks, wood +20× while food → 0 every run.
2. Non-starter maps unsurvivable — Highlands / Riverlands wipe in 7-9 sim min vs Temperate's 39 min, on the same autopilot.
3. Food-crisis pause has no recovery — Space-resume → wipe in ~60-90s with no new food production.

## Screenshots

- `screenshots/A5/01-title.png` — title + best-runs ledger (curve diagnostic)
- `screenshots/A5/02-p1-start.png` — Run 1 t=0:07 Temperate Plains, 12 workers, F=315
- `screenshots/A5/03-p1-30s.png` — Run 1 t=6:39, "Autopilot OFF" stale-banner bug, F=324 W=288
- `screenshots/A5/04-p1-mid.png` — Run 1 t=19:23, F=13 W=445, wood 32× food
- `screenshots/A5/05-p1-late.png` — Run 1 t=31:21, F=94 W=685, 6 workers all Starving
- `screenshots/A5/06-p1-end.png` — Run 1 wiped 39:33, score 3132, 26 deaths, "frontier ate them"
- `screenshots/A5/07-p2-title.png` — Run 2 Highlands brief
- `screenshots/A5/08-p2-start.png` — Run 2 t=1:48, target panel showing routes/depots/warehouses/farms/lumber/walls
- `screenshots/A5/09-p2-mid.png` — Run 2 t=6:35, food crisis pause, 11/11 Critical
- `screenshots/A5/10-p2-after-resume.png` — Run 2 wiped 8:28, score 444, 14 deaths
- `screenshots/A5/11-p3-title.png` — Run 3 Riverlands brief ("the valley pays off")
- `screenshots/A5/12-p3-mid.png` — Run 3 t=6:46, food crisis pause, 11/11 Critical, W=3 (fertile map ran out of wood faster than starter)
- `screenshots/A5/13-p3-end.png` — Run 3 wiped 7:16, score 275, 17 deaths, "the colony stalled"
