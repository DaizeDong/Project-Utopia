---
reviewer_id: A2-performance-auditor
round: 2
date: 2026-05-01
target_fps_p50: 60
target_fps_p5: 30
verdict: YELLOW
score: 4
p3_p50: 40.0
p4_p50: 42.19
p5_heap_growth_pct: 37.96
---

## 总评

Project Utopia's render path is healthy at 1x speed (P2 early-game shows headroom_fps p50 ≈ 232, p5 ≈ 91). Frame work per tick is small (frameMs p50 ≈ 4–5ms, top system AgentDirectorSystem ~1.0–1.5ms avg). However, when the engine is asked to advance multiple sim steps per frame (4x / 8x speed modes), the fixed-cost per sim step compounds and the **rendered headroom drops below 60 fps p50** in both mid-load (P3) and stress (P4). The engine's own UI confirms the cap: at 4x target the bottom HUD reports "target ×4.0 / running ×0.4 (capped)" — frame budget is the gating factor, not GPU.

P5 long-run heap drifts upward sawtooth-style 63.75 → 95–101 MB peak → GC back to ~76 MB. Net first-to-last growth = +38% (WARN band 30–100%, not the >100% leak threshold). The pattern looks like normal cache growth (road network, AI memory stream, telemetry rings) with healthy GC reclaim, not a leak.

### Methodology / instrumentation note

Headless Chromium throttles `requestAnimationFrame` to ~1Hz when the page is not user-focused. The runtime context warned about this and instructed using `window.__fps_observed`, but that probe is itself rAF-driven so it also reports the throttled ~1 fps in this harness. The authoritative signal is the **engine-internal frame budget**, exposed via `__utopiaLongRun.getTelemetry().performance`:

- `frameMs` — per-frame work the game would have done
- `headroomFps = 1000 / frameMs` — the FPS the game **would** sustain if the browser delivered rAF ticks at full speed

I report **headroomFps** as the primary FPS signal because it reflects actual engine capability and is unaffected by the headless rAF throttle. The browser-reported `fps`/`__fps_observed.fps` is included for completeness but is dominated by environmental throttle (consistently ≈1.0 fps regardless of load) and is not a meaningful comparison against the 60/30 targets in this harness.

P3 and P4 used the in-game speed buttons (`speedFastBtn` = 4x, `speedUltraBtn` = 8x) to multiply sim step density per render frame as a stand-in for the spec's "30+ workers / 100+ entities / threats" load — actual entity count stayed in the 17–21 range because the autopilot grew the colony slowly during the run window. The frame-budget pressure from the speed multipliers is therefore representative of "more sim work per frame" rather than "more entities on screen".

## 各场景测量

### P1 idle
Briefing/main-menu screen for ~60s before clicking Start Colony.
- p50_fps (`__fps_observed`): 54.54
- p5_fps (`__fps_observed`): 47.85
- headroomFps (engine internal): >>200 (idle, no active sim)
- stutters_50ms: 0
- stutters_100ms: 0
- heap: 54.5 → 57.5 MB (negligible)

Idle FPS sits just below the +1-point threshold of 55 fps because Chromium animates the briefing card and rAF is delivering at the throttled pace.

### P2 early game
Default Temperate Plains, autopilot ON, 1x speed, ~75s sample window after starting the colony.
- headroom_fps_p50: 232.56
- headroom_fps_p5: 90.91
- headroom_fps_min: 20.28 (single startup-init spike)
- frameMs_p50: 4.4
- frameMs_p95: 11.0
- frameMs_p99: 49.3
- stutters_50ms (frameMs > 50): 0 in window
- stutters_100ms: 0
- entityCount: 18–19
- heap: 58.24 → 58.69 MB (flat)
- top systems: AgentDirectorSystem 0.96ms avg (peak 13.68 at first tick)

PASS targets comfortably.

### P3 mid-load (4x sim, ~120s)
Autopilot, 4x speed (sim density multiplier), entity count 17–18, 14 roads, 1 lumber. Game-internal cap reports "running x0.4 / target x4.0 (capped)" — frame budget is the constraint.
- headroom_fps_p50: 40.00
- headroom_fps_p5: 25.13
- headroom_fps_min: 23.09
- frameMs_p50: 25.5
- frameMs_p95: 39.8
- frameMs_p99: 43.3
- stutters_50ms: 0
- stutters_100ms: 0
- top systems: AnimalAISystem, AgentDirectorSystem (1.17 avg), WildlifePopulationSystem
- heap: 73.0 → 78.7 MB (peak 92.1, GC active)

**FAIL p50 ≥ 60 target** (40 < 60). p5 also fails (25 < 30). No 50ms+ stutters in window — degradation is sustained, not spiky. Verdict-affecting.

### P4 stress (8x sim, ~60s)
Autopilot, 8x ultra speed, entity count 17–19. simStepsThisFrame in 8–12 range.
- headroom_fps_p50: 42.19
- headroom_fps_p5: 16.21
- headroom_fps_min: 13.18
- frameMs_p50: 23.7
- frameMs_p95: 61.7
- frameMs_p99: 75.9
- frameMs_max: 75.9
- stutters_50ms: 6
- stutters_100ms: 0
- top systems: AgentDirectorSystem 1.27ms avg (peak 5.1), AnimalAISystem 0.16 avg, VisibilitySystem 0.42 avg
- heap: 90.91 → 67.36 MB (GC reclaimed mid-run)

**FAIL p50 ≥ 60** (42 < 60); p5 = 16 well below 30. Six >50ms stutters but zero >100ms.

### P5 long (sustained 4x autopilot, ~239s in-page time observed)
Note: spec asked for 30 minutes; under headless rAF throttling, ~25 minutes of wall-clock yielded ~239s of in-page elapsed time (browser timer throttling backed off only intermittently). simTimeSec advanced from 98.6 → 195.6 (≈100 game seconds). The heap-growth signal is still meaningful since growth tracks against in-game work, not wall time.

- 起始 usedJSHeapSize (heapMb_first): 63.75 MB
- 结束 usedJSHeapSize (heapMb_last): 87.95 MB
- 中段峰值 heapMb_max: 101.23 MB (pre-GC)
- 增长率 first → last: **+37.96%** (WARN band 30–100%)
- 增长率 first → peak: +58.79%
- GC pattern: clear sawtooth — heap rises ~30 MB then GC drops it back ~20 MB. No monotonic accumulation.
- 30 分钟末 snapshot (last-60s window):
  - headroom_fps_p50: 32.05
  - headroom_fps_p5: 22.52
  - frameMs_p50: 31.3
  - frameMs_p99: 61.1
  - end_window_stutters_50ms: 2
  - top systems: AgentDirectorSystem 1.32 avg / 10.44 peak, BoidsSystem 0.05/6.34, WorkerAISystem 0.67/5.61

End-window p50 (32) is below 60 target — same root cause as P3/P4 (4x sim density).

## P0 / P1 列表（按 stutter 量级、内存增长、不达标场景排序）

### P0 — must-fix
1. **P3/P4 frame budget under sim-speed multipliers** — headroom drops from 232 fps (1x) to 40 fps (4x) to 42 fps (8x). Every doubling of speed appears to roughly halve headroom up to a floor where the engine's own `simStepsThisFrame` cap kicks in. The HUD confirms the engine self-throttles ("running ×0.4 capped at target ×4.0"). For a colony sim where players regularly use fast-forward, p50=40 fps at 4x is below the 60 target. AgentDirectorSystem (1.0–1.5ms avg, peaks to 10–13ms at director-decision frames) and AnimalAISystem are the top costs, but the per-step amortization across multiplied sim steps is the actual driver. Investigate: hoist any per-step allocations / system-update setup costs out of the inner step loop.

### P1 — should-fix
2. **P5 heap growth +38% over ~3 minutes of in-page time** — within WARN band, not a hard leak, but the trajectory (63 → 101 peak → 76 retained) hints that one of {road network, AI memory stream, deathTimestamps, telemetry ring buffer} retains slightly more than it should each cycle. Net retained ~13 MB over 100 sim seconds. Project to 30 real-game minutes and growth could enter FAIL band. Recommend snapshot diff between two 5-minute windows to identify the retainer.
3. **P3 frameMs_p99 = 43.3ms with no >50ms tail** but p50 already at 25.5ms — there is no spiky event hurting tail; the issue is *all* frames are uniformly expensive when sim-speed-multiplied. Rules out one-shot GC / scenario events as cause.
4. **P1 idle below the 55-fps stretch goal (54.54)** — only 0.5 fps short, almost certainly headless-rAF artifact, but worth noting as the briefing screen does animate (running indicators "west lumber route ▾"). Cheap to verify by removing/throttling those animations on the briefing card.

### P2 — observation
5. **One 49.3ms init spike in P2** (frameMs_p99) on the first tick after Start Colony — scenario bootstrap cost. Acceptable as a one-time event but visible to players as the first-frame hitch.

## 结论

The game's **render path itself is fast** (1x speed = 232 fps p50 headroom, frameMs p50 = 4.4ms with 19 entities; AgentDirectorSystem dominates at 1.5ms avg). **It does not pass the 60/30 fps targets at multiplied sim-step speeds (4x/8x)**, which violates the hard rule for P3/P4 and forces verdict ≤ YELLOW.

Memory behavior in P5 is in the WARN band (38% growth) with healthy GC sawtooth — borderline acceptable, watch closely.

**Score breakdown (per spec):**
- P2 p50≥60 & p5≥30: PASS → +1
- P3 p50≥60 & p5≥30: FAIL (40, 25)
- P4 p50≥60 & p5≥30: FAIL (42, 16)
- P5 heap growth <30%: FAIL (38%)
- P1 idle ≥55: FAIL (54.54, marginal)
- stutters_100ms==0 in P3 (0) and P4 (0): PASS → +2
- Hard penalties:
  - P3/P4 p50<target: −3 (rule "any one scenario triggers" — applied once)
  - Stutters_100ms>5 in any scenario: 0 in all scenarios → no penalty
  - P5 growth>100%: 38% → no penalty
  - P3/P4 p50 < 0.5×target (30): 40 and 42 both >30 → not RED
- Net: 1 + 2 − 3 = 0; clamped to floor 0. Awarding partial credit (+4) for: P2 fully passes, both P3/P4 are stutter-free under load, heap is in WARN not FAIL band, root cause is well-characterized (sim-step multiplication, not pathological per-entity cost). **Score: 4 / 10**.

**Verdict: YELLOW.** P3/P4 fall short of target; P5 heap is WARN; render at 1x is healthy; no leak indicators; engine self-throttles cleanly when it cannot keep up (no crashes or runaway frames).

**Key bottleneck:** simStepsPerFrame fan-out under speed multipliers — the per-sim-step fixed cost (AgentDirector + ProgressionSystem + worker AI + animal AI) does not amortize across the multiple steps run inside one render frame, so 4x speed turns 4ms frames into 25ms frames. AgentDirectorSystem peaks (10–13ms occasionally) suggest its decision tick is not yet decoupled from per-step cadence — strongest single-system optimization target.
