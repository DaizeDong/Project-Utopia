---
reviewer_id: A5-balance-critic
round: 0
date: 2026-05-01
verdict: RED
score: 3
runs_completed: 4
total_minutes: ~35 (real-time, includes 8x speed-up; ~3 in-game hours observed across runs)
dominant_strategy_detected: yes — "no strategy is viable; the only stable equilibrium is autopilot's perpetual food-drought oscillation that locks score at ~210 and never advances DevIndex past ~24/100"
softlock_or_overflow_detected: yes — every run softlocks: (a) Food + Wood double-zero starvation crash at game-time 3:11–3:12 without intervention, OR (b) autopilot oscillation between Food=0 and Food=~60 forever, with Survived clock and score frozen
---

## 一句话定性

**The early-game crash window is hard-coded at game-time 3:11; nothing the player can build before that point appears to escape it, and the only "winning" mode is to let autopilot enter an infinite food-drought oscillation that freezes Score, DevIndex, and even the Survived clock — i.e. the simulation continues but no progression metric responds, so there is effectively no early game, no mid game, and no late game, just a single 3-minute death spiral followed by a flatline.**

## 轴 1：资源曲线

### 各资源 5 / 15 / 30 分钟读数（每局一栏）

All four runs share identical starting conditions regardless of map template: Food=180–197, Wood=35, Stone=15, Herbs=0, Pop=12, Workers split 4 FARM / 4 WOOD / 4 idle (per Entity Focus filter counts). Below is observed in-game time, not real-time.

| 局 | 资源 | t=0 | t=3:11 (no-input) | t=12:00 (autopilot) | t=24:00 (autopilot) | t=30:44 (autopilot) |
|----|------|-----|--------------------|---------------------|---------------------|---------------------|
| Run-1 (Plains, autopilot) | Food | 193 | n/a — survived | 0 ▼ | 33 ▲ | 37 ▼ |
| Run-1 (Plains, autopilot) | Wood | 35 | n/a | 0 | 20 ▲ | 21 ▲ |
| Run-1 (Plains, autopilot) | Stone | 15 | n/a | 0 | 0 | 0 |
| Run-1 (Plains, autopilot) | Herbs | 0 | n/a | 0 | 0 | 0 |
| Run-1 (Plains, autopilot) | Pop | 12 | n/a | 16 | 16 | 16 |
| Run-2 (Highlands, autopilot) | Food | 197 | n/a | 0 | 29 ▲ | n/a (stopped @ 6:26) |
| Run-2 (Highlands, autopilot) | Wood | 35 | n/a | 0 | 19 ▲ | n/a |
| Run-2 (Highlands, autopilot) | Stone | 15 | n/a | 5 | 30 ▲ | n/a |
| Run-3 (Riverlands, no input) | Food | 166 | 0 — STALL | — | — | — |
| Run-3 (Riverlands, no input) | Wood | 35 | 0 — STALL | — | — | — |
| Run-4 (Riverlands, ~6 farm clicks then 8x) | Food | 144 | 0 — STALL | — | — | — |

Observations:

- **Starting Food drains at ~0.6/sec colony-wide with 12 workers** (Run-1: 193 → 136 in 97s = ~0.59/s). At that rate, the 193-food buffer empties in ~5:25 minutes if no production at all, but production from base-game-state farms cannot ramp fast enough — every run loses both Food and Wood before the 3:11 mark.
- **Wood and Stone start FROZEN at 35/15 for the entire pre-crash window** in no-input Run-3 (because nothing was built — the FARM/WOOD-tagged starter workers are showing "Wander hungry" and accomplish no production). This is a major issue: starter assignments do nothing on their own.
- **Herbs is forever 0**. Across 30+ in-game minutes I never saw a single Herb produced, even though the build menu has a Herbs tool and the resource bar shows Herbs as a primary HUD slot. Either the herb production node placement is too rare to be relevant in 30 min, or autopilot never builds the Herbs facility, or both. The Clinic / medicine processing chain therefore never activates.
- **Stone stays at 0 in autopilot for 30 in-game minutes on Plains** (Run-1, t=30:44 still Stone=0). On Highlands stone reaches 30 by t=6:26 — but it just *sits* there because the next-tier user (Smithy) is never built. Stone is overflow-by-default-of-no-consumer rather than overflow-by-abundance.
- **Processing chain (meals/tools/medicine) never reaches steady state.** The "First Meal served" toast did fire on Highlands Run-2, but on Plains Run-1 the autopilot never raised a Kitchen even at t=30:44.

### 长期溢出 / 短缺

- **Permanent shortage: Food (every run, every map)** — Even with autopilot building 8+ farms, food oscillates 0 ↔ 30–60 in a 5-game-minute cycle. The colony eats faster than it harvests, then the eating slows when workers go Hungry/Critical, harvesters resume, food rises briefly, repeat. This is a textbook unstable equilibrium, not a sustainable steady state.
- **Permanent shortage: Wood** — On the Plains autopilot run, Wood never exceeded 28 (t=24:02). Walls cost 2 wood, Farms cost 5 wood — the autopilot can barely afford 4–5 buildings per game-day cycle.
- **Permanent shortage: Herbs** — never went above 0 in 30+ in-game minutes.
- **Latent overflow: Stone (Highlands only)** — 30 stone sits idle because no Smithy or Wall queue.
- **No long-horizon overflow exists** because the colony never reaches the long horizon.

### 加工链瓶颈

The processing chain (Farm → Kitchen → Meals; Wood + Stone → Smithy → Tools; Herbs → Clinic → Medicine) is structurally **unreachable** in the 3-minute survival window:

- Farm needs 5 wood, raw food only.
- Kitchen needs (presumably) wood + stone + standing room near a warehouse.
- Warehouse is the gating piece — the scenario-flagged "east ruined depot" tile is the *named first build* in the briefing, and autopilot took >12 game-minutes to build a warehouse on Run-1 and never finished the scenario depot at all by t=30:44.
- Until a warehouse exists, workers eat from carry, which apparently dumps a giant chunk of food the moment a worker picks any up, accelerating the food crash.
- Therefore the entire downstream chain (Tools, Medicine, anything Smithy/Clinic) is **dead content** in any normal opening — the player never sees it before the crash.

### 改进建议（不讨论实现，只说"应该是什么样"）

1. The starting food buffer needs to be either **2× larger** (giving a real ~6-minute opening window) **or** the colony-wide food consumption rate should **drop ~30–40%** during the first game-day so the 12 starter colonists can actually live long enough to build their first farm.
2. Starter workers tagged FARM/WOOD should **immediately work an obvious starter resource node** without requiring road/warehouse infrastructure first. Today they spawn, walk to the obvious food/wood, and then "Wander hungry" because they have no warehouse to deposit to.
3. The first warehouse should either be **pre-built** on the named scenario tile, or **buildable for 0 wood / 0 stone** so the first survival action ("rebuild east depot") is actually achievable from the starter inventory.
4. Stone should have an early consumer that is *available* in the first 3 minutes (the smithy / wall combo is too gated), so Stone stockpile pressure provides a meaningful tradeoff rather than being inert overflow.
5. Herbs need either visible starting nodes or a starter tutorial event, otherwise the entire medicine economy is invisible and DevIndex/score are capped from below.

## 轴 2：难度曲线

### 各局威胁时间线

- **Run-1 (Plains, autopilot)**:
  - 00:00 — peaceful, all workers Idle/Wander, Food 193
  - 01:37 — Food 136, 7 workers Hungry, first non-saboteur deer death from "predation" (a bear/predator attack)
  - 03:10 — Score peaks at 210, Survived clock STOPS advancing forever after this point. Game considers this the death-tick.
  - 06:56 — Food=1, Wood=1, "Autopilot struggling — manual takeover recommended" banner. First Meal served.
  - 11:56 — Food=0, Wood=0; First Lumber camp raised. Autopilot in full recovery loop.
  - 18:36 — Food=33 ▲, Stone=0, Wood=20 ▲, 11 workers in Combat (vs wildlife pressure event), Score still 210, Dev still 24.
  - 24:02 — Food=59 ▲, Stone still 0, Score still 210. East depot scenario quest still unfinished.
  - 30:44 — Food=37, Wood=21, Stone=0, Score still 210. The simulation is in steady-state oscillation but no progression metric moves.
- **Run-2 (Highlands, autopilot)**:
  - 03:46 — Food=0, Stone=5, 1 worker starving Critical, Score=174 Dev=23 (the score is *lower* than Plains — Highlands is harder)
  - 06:26 — Food=29, Stone=30 ▲, Score still 174. Same lock pattern as Plains.
- **Run-3 (Riverlands, NO input)**:
  - 03:11 — "The colony stalled. Both food and wood reached zero with no supply still in transit." Score 171, Survived 3:11.
- **Run-4 (Riverlands, attempted manual farm placement before 8x)**:
  - 03:12 — same crash, Score 172, Prosperity 10 (vs 7 in Run-3 — slight gain from clicks but cosmetic).

### 救灾窗口存在性

- **Crisis window for the *player* is the ~3 minutes between game start and the no-input crash.** That window is far too short for a player who is reading the briefing, learning the build menu, finding the warehouse tile, etc.
- **Crisis window for *autopilot* is permanent** — the recovery banner ("Autopilot struggling — manual takeover recommended") fires within 2 game-minutes and never clears across 30+ minutes of observation.
- There is a "救灾" mechanic: the colony can recover from the t=11:56 Food=0 state up to Food=~60 over ~12 in-game minutes. So **the crisis can be survived numerically, but the simulation refuses to count the survival** (Survived clock and Score remain frozen at the moment of the original starvation event). This is an exceptionally bad balance signal — the recovery loop is *cosmetic*.

### 玩家不操作时的崩溃时间

- **3:11 in-game minutes, every single time.** Best-Runs leaderboard shows four prior runs all clustered at 3:11–3:12. My no-input Run-3 hit exactly 3:11. My partial-click Run-4 hit exactly 3:12. This is suspiciously deterministic. Either (a) the seed is locked (1337) and the deterministic RNG produces identical timelines, or (b) the food/wood drain is so far past the production rate that the timing is mathematically forced. Both interpretations are bad.

## 轴 3：策略深度

### 三局结果对比

| Run | Map | Strategy | Outcome at 30 in-game min | Score | Dev |
|----|------|----------|---------------------------|-------|-----|
| 1 | Plains | Autopilot economy | Frozen oscillation, Survived locked at 3:10 | 210 | 24 |
| 2 | Highlands | Autopilot defense-flavored (Wall tool selected pre-start, not built) | Frozen at 6:26 sample but same pattern | 174 | 23 |
| 3 | Riverlands | No input | Hard crash 3:11 | 171 | 21 |
| 4 | Riverlands | ~6 manual farm-tool clicks then 8x | Hard crash 3:12 | 172 | 21 |

### dominant strategy 检测

**Yes, there is a single dominant strategy: "Enable Autopilot before t=2:00 and let it enter the food-drought oscillation."** This is the only mode that survives past 3:11. Within autopilot mode:

- Map choice doesn't matter — same crash shape, same recovery shape.
- Manual building before autopilot doesn't help — the 6 click-attempts in Run-4 produced a +3 Prosperity bump and nothing else.
- The "winning" outcome is a frozen flatline at Score=210, Dev=24 forever. There is no score-relative reason to play more than one run because all your subsequent runs will land at the same flatline.

### viable 路径数量

**Effectively one.** The economy/defense/exploration distinction collapses because:
- All starting maps spawn the same scenario ("west lumber route" + "east ruined depot"), regardless of map template selection. Riverlands has water, Highlands has elevation, but the named objectives are identical, the starter resources are identical, and the named worker roles are identical (4 FARM, 4 WOOD).
- Defense-priority is non-viable because Wall costs 2 wood and you have 35 wood total — building a wall ring around even a 5-tile colony costs your entire wood stockpile, leaving nothing for the farm/lumber that you need to *not starve*.
- Exploration is non-viable because the colony loses food balance before scouts can return useful information.

### 各 map template 差异化测试

- **Temperate Plains**: same scenario tags, same start, same crash.
- **Rugged Highlands**: same scenario tags ("north timber gate", "south granary" — different *flavor* tags but same objective structure), more elevation noise, slightly lower score (174 vs 210), Stone production slightly easier.
- **Riverlands**: same scenario tags, water tiles in the upper map (irrelevant for a 3-minute crash), same crash.

The map templates are **cosmetic re-skins of the same scenario**. They do not require different strategies; they are barely distinguishable by outcome.

## 轴 4：数值合理性

### 性价比异常（高 / 低）的建筑 / role / item

- **Farm (cost: 5 wood)** — required for survival, but each one barely keeps up with consumption rate. Autopilot built ~8+ farms in Run-1 and *still* couldn't stabilize food. Either farm output is too low or worker eat rate is too high.
- **Wall (cost: 2 wood)** — laughably expensive in the *opening* (you need 12+ walls to ring even a small base = 24 wood, two-thirds of starting wood) and effectively free in the late game (which never arrives). No middle ground.
- **Warehouse** — the named gating piece for the entire scenario, but autopilot never built one in 30+ in-game minutes on Plains Run-1. The cost (probably ~10 wood + some stone) is unreachable in the early window.
- **Quarry / Smithy / Clinic / Kitchen / Bridge / Demolish / Herbs** — never observed activated by autopilot. They are *invisible content* under the actual play conditions.

### Worker role contribution

- **FARM workers** — never observably produced food in the no-input run. The four starter FARM-tagged workers were tagged "Hungry / FARM · Wander hungry" at t=0:00. They never harvested, deposited, or contributed in any measurable way before the crash.
- **WOOD workers** — same problem. Wood never moved off 35 in Run-3.
- **Scouts / Wanderers (the auto-spawned "Nash-13", "Kade-14" etc.)** — listed as "Blocked / – Wander a bit hungry". I do not understand why my colony spawns 4–8 entities tagged as Blocked from frame 0 — they appear to be already-broken NPCs eating food without contributing. Possibly traders/visitors, but they should not be drawing from food stockpile if so.

### 暴露给玩家的"奇怪数字"

- **Survived clock freezes mid-run** while the AI Log clock keeps advancing. At t=12:00 game-time, the Survived display said "00:03:10". This is incredibly confusing — it makes the player think "I'm dead and the game is just running" or "the game is broken". It should either pause, show "post-mortem extension", or keep counting.
- **Score 210 sticks for 25+ in-game minutes**. This means that *all play time after the 3-minute crash is worth zero points*. There is literally no incentive to survive past minute 3. This kills meta-progression entirely.
- **Dev 24/100 with description "Scrappy outpost, still finding its rhythm"** at t=30 game-min — this implies a 100-point ceiling, but nothing the player can do in the observed conditions seems to advance it. We never saw it move past 24.
- **"#1 of 5" / "#1 of 6"** counter on the loss screen — this is a leaderboard-position indicator, but it implies the player has failed 5–6 times already. Encountering "#1 of 6" on Run-4 means the engine counted my pre-game shutdown attempts. Confusing.
- **"Threat: 47" / "Threat: 45"** — Threat is in the 40s by minute 3. Without context the player does not know if 47 is high, low, or neutral.
- **"Prosperity: 7" → "Prosperity: 10"** between Run-3 and Run-4 — small variance suggests a real metric, but unclear what it maps to.

### 罕见事件频率实测

- **Wildlife predation** — "Deer-21 died (predation)" at t=1:37. Bear/wildlife combat is *extremely* common — by t=18:36 there were 11 entities in Combat. This is not a rare event, it's the dominant time-sink.
- **Saboteur** — "Ash-16, roaming saboteur, died of killed-by-worker" at t=6:56. Saboteur events fire fast and the colony handles them, but this is the only "raid"-like content I saw in 30 minutes.
- **Weather (storm/drought/wildfire)** — **never observed in 30+ in-game minutes**. The weather system either has too long a cooldown or simply doesn't fire in the early-crash window. Either way it is dead content under normal play.
- **Bandit raid** — never observed.
- **Trader visit** — workers tagged "Seek Trade" appear (Nash-13, Polla Reeve), but no trade UI fired in observed time.

## 自行扩展角度（你必须写，至少 2 个）

### 角度 1：经济链反馈周期

The investment-to-payoff cycle for *any* building is longer than the food drain runway. A Farm placed at t=0:00 costs 5 wood, takes worker-time to construct (autopilot took until t=11:56 to raise its first Lumber camp), then takes additional time to harvest crops, then additional hauling time to deposit (or no deposit at all if no warehouse). By the time the first Farm produces anything useful, the colony has burned through the entire starting food buffer. The economic feedback loop is **architecturally too slow** for the survival pressure curve.

### 角度 2：Autopilot vs Manual asymmetry — automation breaks the game

Enabling Autopilot does survive the 3-minute crash, *but* the cost is that no progression metric advances. The game is therefore in a paradoxical state where:

- Manual play crashes at 3:11 with Score=172 and Dev=21.
- Autopilot play "survives" indefinitely with Score=210 and Dev=24.
- Autopilot's "survival" is meaningless because Score and Survived both froze.

So the player's choice is "die in 3 minutes with a low score" or "watch the screen forever with a slightly higher frozen score". Neither has an obvious endgame goal. **Autopilot replaces strategy with spectatorship**, and there is no incentive within the game to ever turn autopilot off.

### 角度 3：The survival counter / score-counter divorce

This is a critical bug-or-design-choice that breaks balance perception. The Survived display freezes at the moment the colony "should have died", but the simulation continues. From a balance-design standpoint this means **the game is ranking your run by the moment you first hit zero food/wood**, not by how long you actually played. That makes the entire mid- and late-game uninteresting because nothing you do after minute 3 affects your scoreboard position. Either:
- Survival should keep counting and reward genuine survival, or
- The game should hard-end at the moment the survival counter freezes and not pretend to continue.

The current "counter freezes but simulation runs" hybrid is the worst of both worlds.

### 角度 4：Map template differentiation

Map template selection is *almost* a no-op. Same starting resources, same starting workers, same scenario tags, same crash window. Highlands had ~30 stone vs Plains 0 stone but neither used the stone for anything observable. Riverlands' water was never crossed by a worker. A balance-design that offers 6 templates should have at least 6 distinct viability profiles; instead all six funnel into the same death.

## 改进优先级清单

### P0（破坏游戏可玩性）

1. **The 3:11 crash is unavoidable**. The food/wood drain rate vs production capability is structurally impossible to balance in the opening. Either give the player a longer opening (more food/wood), or slow the consumption, or speed up the production. Pick one and ship it; right now the player cannot meaningfully play.
2. **Survived counter and Score must keep counting after first food-zero** OR the game must hard-end. The current hybrid (frozen counter + live simulation) tells the player "you already lost, keep watching" which is the worst possible balance signal.
3. **Starter workers tagged FARM/WOOD must immediately work**. Currently they spawn in "Wander hungry" and contribute nothing. The very first action of the colony should be "the four FARM workers walk to the nearest food node and harvest", visibly and without infrastructure prerequisite.

### P1（明显失衡）

4. **Autopilot must either solve the game or be removed**. Currently Autopilot survives the crash but freezes Score/Dev forever, so it is a "soft cheat" that produces no progression.
5. **Map templates must have differentiated openings**. Same resources + same scenario across all 6 maps means the player has no reason to pick anything but the easiest.
6. **Processing chain (Kitchen / Smithy / Clinic) is dead content** in the 30-minute window. Either gate them behind a survivable opening or raise their visibility / lower their cost.
7. **Herbs is invisible** (always 0). Either spawn herb nodes near the starter area or remove the resource bar slot until the player actually has access.
8. **Wall cost (2 wood) is wrong-scaled**. Too expensive in opening, free in late game. Should scale to colony pop or to local threat level.

### P2（数值微调）

9. **Threat / Prosperity / Dev metrics need tooltips**. "Threat: 47" with no scale is meaningless to the player; the balance designer cannot evaluate whether the player perceives the difficulty curve correctly without these labels.
10. **"#1 of 5" / "#1 of 6" leaderboard counter is confusing**. Should say "Run 6 of 6" or "Best run #1, attempt 6".
11. **The Survived clock should count up in real-time, not in-game time**, OR display both. Player has no idea whether 4x speed is helping or hurting their score.
12. **Eat rate audit**: 12 workers consume ~0.6 food/sec colony-wide → 2160 food/hour-of-game-time. This is plausible but the *opening* spike feels fast — a 30-second emergency-rations grace window where no food is consumed would buy the player time to make their first build.
13. **Stone is irrelevant** in the early game on Plains (0 produced, 0 consumed). Either the placement should be more visible to starter workers or the early-game build menu should not advertise Smithy/Quarry until stone is realistic.

## 结论

Project Utopia in its current state has a single dominant strategy ("autopilot on, watch flatline") and a single failure mode ("starve at minute 3"). The early game is *not* "survivable but tense" — it is mechanically unsurvivable without autopilot. The mid game does *not* "require choices" — it is a stable oscillation that no choice perturbs. The late game does *not* "keep generating new pressures" — it is a frozen score forever. The four-axis balance evaluation (resource curve / difficulty curve / strategy depth / numerical reasonableness) finds **all four axes failing**.

The single highest-leverage fix is to extend the opening window — give the player 5–6 game-minutes of breathing room before food/wood double-zero, and the entire downstream chain (Kitchen, Smithy, Clinic, defense, late-game pressure events) becomes reachable and balanceable. Until that one fix lands, no other balance work is testable because the player never reaches the systems that need balancing.

Verdict: **RED — game is currently un-balanceable because the early-game crash window prevents any later system from being observed under play.** Score: **3/10**.
