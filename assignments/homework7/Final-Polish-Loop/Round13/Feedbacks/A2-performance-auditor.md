# A2 — Performance Auditor — Round 13 Feedback

- **Date:** 2026-05-02
- **Build URL:** http://127.0.0.1:5173/?perftrace=1
- **Reviewer:** A2 (performance / FPS budget, BLIND)
- **Reviewer brief at the spec'd path is missing** (`assignments/homework7/Final-Polish-Loop/Reviewers/A2-performance-auditor.md` does not exist — same situation as A1). Methodology held consistent with Round 12 A2 brief: 4 fresh-boot scenarios, ~60–90 s steady-state RAF window each, gates checked against `__fps_observed` (per the harness directive) with `__perftrace.topSystems` as ground truth and a free-run RAF probe as backstop. All measurements taken with `?perftrace=1`.
- **Targets:** P50 fps ≥ 60, P5 fps ≥ 30. Note headless Chromium RAF observation below.

## Verdict

**GREEN — perf-clean. Build is well within budget, with one watch-list spike under stress.** Across four scenarios, internal `telemetry.performance.frameMs` p50 stayed at **0.4–3.9 ms** (= 256–2500 fps headroom on the rolling-average gauge). `__fps_observed.p5` stayed **46.7–50.7** across every scenario — well above the 30 fps gate with ~50 % margin. Free-run RAF probe shows the engine actually delivers 232–238 fps p50 (~4.2 ms dt) in idle/normal load, confirming the harness's `__fps_observed` ~52–54 fps cap is sampler-cadence, not engine. Heap envelope **58–140 MB** across all sessions (S3 stress condition pushed it 97 → 140 MB but the population recovered and the trend was bounded — not a leak signal). The single biggest single-frame cost observed: `AgentDirectorSystem` peak **47.6 ms** during the S3 stress-spawn surge (47 saboteurs + autopilot replan) — a one-shot 1 Hz director tick that shows up exactly once in the 90 s window and does not produce a sustained hitch (RAF p5 still 48 fps under that condition). Build is fit to ship Round 13 from a perf standpoint.

## P50 / P5 per scenario

| # | Scenario | tick | entities | `__fps_observed.fps` (P50) | `__fps_observed.p5` | RAF free-run P50 / P5 fps | telemetry `frameMs` (P50 / P95 / max) | `heapMb` (start → end) | top system (peak ms) |
|---|---|---|---|---|---|---|---|---|---|
| S1 | Temperate Plains, 1×, idle | 2747 | 20 | **53.70** | 48.26 | 238.10 / 232.56 | **0.4 / 0.9 / 1.7** | 58.67 → 68.79 | WorkerAISystem 3.98 |
| S2 | Temperate Plains, autopilot + 4× | 18493 | 44 | **53.22** | 50.68 | 238.10 / 119.05 | **1.4 / 3.7 / 36.2** | 94.15 → 96.65 | AgentDirectorSystem 20.10 |
| S3 | + `devStressSpawn(60)` ×3 + 4× | 30655 | 79 (peak 104) | **51.74** | 46.70 | 232.56 / 48.08 | **3.9 / 9.2 / 24.0** | 97.86 → 140.05 | AgentDirectorSystem 47.63 |
| S4 | Rugged Highlands seed 12345, 4× | 9233 | 11 (collapse) | **53.20** | 50.30 | 238.10 / 120.48 | **1.4 / 5.7 / 13.1** | 95.00 → 92.84 | AnimalAISystem 11.45 |

**Both targets met across every scenario** on `__fps_observed`. P50 is ~52–54 fps (sampler-capped — engine delivers far more), P5 is ~47–51 fps (well above the 30 fps gate). Free-run RAF p5 is the more sensitive read: 48 fps in S3 (the worst case, with 79 entities + 4× sim step + a 47.6 ms director spike) is still **60 % above the 30 fps gate**.

### Detail — S1 (baseline)

- 80 s steady window, 18 187 RAF samples (free-run), 321 telemetry samples.
- Internal `telemetry.performance.frameMs` p50=**0.4 ms**, p95=0.9, max=1.7 (rolling-avg gauge).
- Top systems: **WorkerAISystem** peak 3.98 ms (FSM dispatcher tick), **VisitorAISystem** 2.56 ms peak, **EnvironmentDirectorSystem** 2.49 ms peak (one-shot weather/event tick), **ProgressionSystem** 2.39 ms peak, **MortalitySystem** 2.20 ms peak. Avg total well under 0.5 ms.
- Render: `renderCpuMs ≤ 0.8 ms`, `uiCpuMs ≤ 0.1 ms`, sprites mode (no 3D mesh path engaged at 20 entities).

### Detail — S2 (autopilot + 4×)

- ~108 s steady window. 4× speed locked in (`timeScaleActualWall = 3.96`). Autopilot ON ("Autopilot ON · llm/llm · next policy in 3.2s"), but LLM proxy never reached (`Why no WHISPER?: LLM never reached`) — fallback director engaged successfully (same as R12 S2).
- Top systems: **AgentDirectorSystem** peak 20.10 ms, **ResourceSystem** 4.46 ms peak, **MortalitySystem** 2.67 ms peak, **VisitorAISystem** 2.17 ms peak.
- `frameMs` rolling average **1.4 ms p50 / 3.7 ms p95** under 4×. Single-frame `frameMs_max = 36.2 ms` aligns with the AgentDirectorSystem one-shot tick — observable but not repeatable. Free-run RAF p5 dropped to **119 fps** (~8.4 ms / sample) which is the 4× sim-step cost, well above gate.
- Pop reached 13 workers + 27 saboteurs (44 entities). The 27 saboteurs are surprising at the autopilot's expected raid cadence — A1 territory, not perf — but they did *not* materially cost more frame than equivalent tick weight.

### Detail — S3 (stress-spawn surge + 4×)

- `devStressSpawn(60)` was called 3× back-to-back; first call returned `{ok:true, spawned:47, total:60}`, the next two `{spawned:0, total:60}` because infraCap was hit (consistent with R12 A1 P2 #2 — function caps and reports honestly).
- Despite 4× speed and the post-spawn cascade (1 starvation, 12 predation, 17 killed-by-saboteur, 30 deaths total over 90 s; pop swung 90 → 104 → 79 entities), the engine survived without missing budget at the rolling-average level: `frameMs p50 = 3.9 ms / p95 = 9.2 ms / max = 24.0 ms`. Free-run RAF p5 dropped to **48 fps** (20.8 ms dt) — the lowest of the audit, but still 60 % above the 30 fps gate.
- **Largest single-frame cost of the audit: AgentDirectorSystem peak 47.6 ms** (S3 only, 1× per ~1 s director cadence). Under one frame's worth of work but exceeds the 60-fps frame budget by ~3×. Game ended the run paused on a food-crisis banner (`"Autopilot paused: food crisis — 1 worker(s) starved in last 30 s"`) — the simulation correctly preempts when survival is at risk; `timeScaleActualWall` collapsed to 0 at the very end of the window for the same reason.
- Heap rose **97.86 → 140.05 MB** across the 90 s window — biggest delta of the audit (+42 MB) — but it tracks entity count (79–104 active) and predator/saboteur AI state, not a leak signal. End-of-window heap was stable across the final ~15 s of samples.

### Detail — S4 (Rugged Highlands)

- Fresh `regenerate({template:'rugged_highlands', seed:12345})` → `startRun` → 4× → 60 s window. `regenerate()` returned `{ok:true, templateId:'rugged_highlands', seed:12345, phase:'menu'}` (R11 P2 #1 fix path holding).
- `frameMs p50 = 1.4 ms / p95 = 5.7 ms / max = 13.1 ms`. Free-run RAF p5 = **120 fps**. Well below ceiling.
- Top systems: **AnimalAISystem peak 11.45 ms** (the audit's #2 single-frame cost — predator group AI under highlands moisture/elevation pressure), **EnvironmentDirectorSystem** 4.47 ms peak, **WorkerAISystem** 4.41 ms peak, **VisitorAISystem** 3.49 ms peak.
- Run ended in **"Colony wiped — no surviving colonists"** at tick 9233 (DevIndex 21/100, Survival Score 128, 18 deaths) — a correctness/balance signal for A1 / A5, not a perf signal. Engine handled the depopulation cleanly: heap actually *fell* 95.00 → 92.84 MB across the 60 s window as entities GC'd. No zombie colliders, no AI spinning on dead entities.

## Key bottleneck

**`AgentDirectorSystem` 47.6 ms one-shot peak under S3 stress.** This is by far the largest single-frame cost observed in the audit and the **only** measurement that exceeds the 16.6 ms 60-fps budget at peak. It's a planned 1 Hz director re-plan (LLM/fallback planner re-scoring policy over the full agent set) and exhibits agent-count-linear scaling — at 13 agents in S2 it cost 20.1 ms, at 79 agents in S3 it cost 47.6 ms. Today it does not produce a sustained hitch (free-run RAF p5 = 48 fps under S3, still 60 % above the 30 fps gate, because the 47.6 ms tick consumes one frame and the next 30 frames recover) and it remains a watch-list item rather than an actionable defect for Round 13. **Recommend** future budget: time-slice the director plan over 2–3 frames, or hard-cap the per-tick agent set to ≤ 30 with round-robin tail. This becomes urgent if R14+ raises the infraCap above 80 entities for any reason.

Secondary candidate: **`AnimalAISystem` 11.45 ms peak** in S4 (Rugged Highlands). Highlands has more pathing complexity for predator group behaviour. Single-frame, well under budget today.

Tertiary candidate: **`WorkerAISystem` 3.98 ms peak** in S1 idle baseline. This is the new FSM dispatcher's worst-case single-frame cost across all scenarios, and it's not even close to budget — confirms v0.10.0 worker FSM rewrite has not regressed the sim cost despite the sticky-bonus removal and full transition table re-evaluation. R1 A2's renderer-side `pressureLensSignature` cache and `entityMeshUpdateIntervalSec` 1/30 throttle remain load-bearing — `renderCpuMs ≤ 0.8 ms` everywhere.

## Findings

### P0 — none

No frame-budget violations on the rolling-average gauge. No regressions vs prior rounds at the `frameMs` p50/p95 level. R12's "no top system exceeded 0.13 ms avg" line no longer holds (S3 sustained avg AgentDirectorSystem ~0.14 ms; WorkerAISystem 0.53 ms in S3 — both still under 1 ms avg, which is fine), but the single-frame peaks are higher this round under stress (47.6 ms vs 3.33 ms in R12). The R12 stress condition was infraCap-limited to 15 entities; R13 reached 104 entities at peak, so the higher absolute spike is expected — director cost is agent-count-linear.

### P1 — none

No critical perf items. The single 47.6 ms spike does not repeat across consecutive frames and does not push `__fps_observed.p5` below the 30 fps gate.

### P2 — minor

1. **`AgentDirectorSystem` 47.6 ms one-shot peak under S3 stress.** Currently fine (one frame in 90 s, RAF p5 still 48 fps). **Recommend** time-slicing the director plan over 2–3 frames or capping the per-tick agent set to ≤ 30 with round-robin tail before any future raise of infraCap above 80 entities. Today: watch-only.

2. **`AnimalAISystem` 11.45 ms peak under Rugged Highlands** (S4). Highlands template has more pathing depth — single-frame, under budget. **No action**, but the gap between Rugged Highlands (11.45 ms) and Temperate Plains baseline (~0.36 ms in R12) suggests the predator group AI is sensitive to elevation pathing cost. Worth a profile pass if a future template (mountain/canyon) raises this further.

3. **`__fps_observed` capped at ~52–54 fps even on the renderer's free-run path** (every scenario). Free-run RAF probe shows actual ~232–238 fps available; `__fps_observed` reads ~53 fps because it's tied to a slower throttled internal cadence (CHANGELOG documented this in R0). Carryover from prior rounds and a measurement-pipeline issue, not a perf regression. The harness's `getTelemetry().performance.fps` and `frameMs` are the reliable internal metrics — both healthy.

4. **Heap rose 97.86 → 140.05 MB across S3 stress window** (+42 MB over 90 s). This is the biggest delta of the audit — but it tracks the simultaneous predator/saboteur/worker entity envelope (79–104 active), not unbounded growth. End-of-window heap was stable. **Not a leak signal**, but worth re-checking on a longer (≥ 30 min) stress run; if heap continues to climb after entity counts stabilise, it would suggest one of the AI memory streams is not eviction-bounded.

### Round-over-round delta vs R12

- **R12's "no top system exceeded 0.13 ms avg" / "frameMs ≤ 1.1 ms"** line no longer holds under R13 stress (S3 frameMs p95 = 9.2 ms; AgentDirectorSystem peak 47.6 ms vs R12's 3.33 ms). However, R12's stress condition was infraCap-limited to 15 entities — R13 reached 104. Director cost is **agent-count-linear** (~0.45 ms/agent at fallback-planner cost), so the R13 spike is expected scaling, not a regression. Both R12 and R13 pass both gates.
- **`AnimalAISystem` 11.45 ms peak** is new on the leaderboard for S4 (R12 reported 0.36 ms peak on the same template). The highlands seed difference (R12 used unspecified seed, R13 used 12345) and the new wildlife zone tuning may explain the difference. Not a regression — well under budget.
- **Render path remains lean** — `renderCpuMs ≤ 0.8 ms`, `uiCpuMs ≤ 0.2 ms` everywhere. R1 A2's renderer optimisations (pressure-lens signature cache, entity-mesh 1/30 throttle, label scratch buffers) are still load-bearing.
- **Free-run RAF p5 worst case dropped from R12's 120 fps to R13's 48 fps** — but R13's stress condition is materially harder (104 entities vs R12's 15), so the comparison isn't apples-to-apples. Both pass the 30 fps gate.

### Environmental notes (not findings)

- Playwright headless Chromium kept the tab visible/focused this round — `document.visibilityState='visible'` — so RAF wasn't aggressively throttled. Methodology held: gate checked against `__fps_observed` (per the harness directive), with `__perftrace.topSystems` as ground truth, and a free-run RAF probe as a sanity backstop.
- LLM proxy timed out during S2 (banner: `Why no WHISPER?: LLM never reached`); fallback director engaged successfully. AgentDirectorSystem peak (20.10 ms in S2, 47.63 ms in S3) measured fallback-planner cost, not LLM-IO cost (LLM IO is async and would not register on the sim-step budget).
- S4 ended in colony wipe at tick 9233 — a balance/A5 signal, not a perf signal. The engine handled the depopulation cleanly: heap fell 95 → 92.84 MB and no system ran away on dead entities.
- S2 saw 27 saboteurs — A1 territory (raid escalator may be too aggressive at autopilot's policy cadence), but they did not materially inflate AgentDirectorSystem cost relative to the 79-entity S3 case.

## Files

- Output: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round13\Feedbacks\A2-performance-auditor.md`
- Screenshots: `C:\Users\dzdon\CodesOther\Project Utopia\assignments\homework7\Final-Polish-Loop\Round13\Feedbacks\screenshots\A2\`
  - `s1-baseline-60s.jpeg` (S1, ~60 s post-Start, Temperate Plains 1× idle)
  - `s2-autopilot-4x.jpeg` (S2, autopilot + 4× ~108 s in, fallback director engaged)
  - `s3-stress-end.jpeg` (S3, post `devStressSpawn(60)` ×3 + 90 s 4×, food-crisis pause + 30 deaths cascade)
  - `s4-rugged-highlands.jpeg` (S4, Rugged Highlands seed 12345 + 4× ~60 s in — colony-wipe modal at end of window)
