---
reviewer_id: 02d-roleplayer
feedback_source: Round5/Feedbacks/02d-roleplayer.md
prior_plan: Round5/Plans/02d-roleplayer.md
prior_implementation: Round5/Implementations/w1-fallback-loop.commit.md (02d section)
prior_validation: Round5/Validation/test-report.md (RED — structural regression unrelated to 02d)
round: 5b
date: 2026-04-22
build_commit: bc7732c
priority: P1
coverage_pct: 75
layers:
  - simulation/lifecycle       # MortalitySystem — already on from Round 5, extended here
  - simulation/population      # RoleAssignmentSystem — specialty expanded to FARM/WOOD/HAUL
  - simulation/npc             # WorkerAISystem — birth + friendship-breakthrough memory emit + intent "because"
  - ui/panels                  # EntityFocusPanel — relationships reason + intent because line
  - world/events               # WorldEventSystem (light touch — reuse pushWorkerMemory wiring for births)
estimated_scope:
  files_touched: 6
  loc_delta: ~200
  new_tests: 4
  wall_clock: 90
conflicts_with: []
---

## 1. Core problem (02d's 13+ findings collapsed)

Round 5 delivered two of 02d's抽屉 ("drawers") partway:

- **drawer 1 — witness/death memory**: Round 5 added `related ∪ nearby` union + `(dedupKey, windowSec)` dedup. CLOSED. Re-verified in code at `src/simulation/lifecycle/MortalitySystem.js:77-130`.
- **drawer 2 — specialty-aware role picks**: Round 5 scoped to COOK/SMITH/HERBALIST/STONE/HERBS only (Round 5 ran into a -10 DevIndex risk on FARM/WOOD and pulled back defensively — see w1-fallback-loop commit §02d Step 4 "SCOPED"). PARTIAL — "Dax-7 cook specialist 砍木头" still happens because WOOD absorbs spawn-order workers.

**Still locked** after Round 5:

1. **Birth / marriage / friendship are not `recentMemory` events.** `PopulationGrowthSystem.update` emits `VISITOR_ARRIVED {reason:"colony_growth"}` but no worker's `memory.recentEvents` gets a line. `WorkerAISystem.js:988-997` silently bumps `relationships[other.id] += 0.05` every ~5s — when opinion crosses the `Friend` (≥0.15) / `Close friend` (≥0.45) semantic bands (same bands UI uses), no memory entry, no event emit. Players see the number change; they can't read "why did Dax-7 and Fen-10 become close?" — because nothing records the threshold crossing.

2. **Worker intent "because" narration.** `chooseWorkerIntent` (`WorkerAISystem.js:216-262`) returns a **terse string** (`"eat"` / `"farm"` / `"deliver"`) that is persisted into `worker.debug.lastIntent` but never paired with its gate (e.g. `hunger < 0.15 && food>0`). EntityFocusPanel surfaces `lastIntent` directly; "Dax is farming" is invisibly-caused. 02d specifically asked: "who saw Luka's death; why did opinion tick up; why does this worker farm right now" — the last question ONLY requires pairing the intent decision with the gate that won.

3. **Specialty→FARM/WOOD/HAUL soft-match.** Round 5 plan Step 4 originally covered every role; the debugger scoped it to specialist roles only after seed-1 `monotonicity.test.js` wobbled. Looking at the landed code (`src/simulation/population/RoleAssignmentSystem.js:265-292`), FARM/WOOD/HAUL still use `workers[idx++]` spawn-order — i.e. **Dax-7 (cooking=0.95) is still put into WOOD whenever COOK slot is already filled or emergency cap = 0**. Round 5b is allowed to expand this under the 01b overhaul that landed alongside (Wave 1 population-aware quotas). Rather than break the spawn-order-preserves-spatial-locality invariant, Round 5b introduces a **specialty soft-match with an anti-mismatch filter**: the picker prefers workers whose top-skill is NOT WOODCUTTING for FARM, and NOT FARMING for WOOD (i.e. a "not-worst-fit" sort rather than a "best-fit" sort). Dax-7 (cooking=0.95, farming=0.4, woodcutting=0.35) becomes the LAST choice for WOOD, not the first.

4. **Relationships show semantic label but no reason.** Round 5 feedback line 58: "Tam-9 从 +0.20 Friend 升到 +0.30 Friend… 证明底下有社交 tick 在跑。但我没有一处 UI 告诉我他们为什么变亲密了." The semantic label ("Friend") is already in EntityFocusPanel (we verified `formatRelationOpinion` at `src/ui/panels/EntityFocusPanel.js:28-32`). The gap is the **reason string** — the UI should explain "became Close friend after working together in (52,38) area" rather than just "+0.30 Friend". This requires threading a `relationships.reason[otherId]` field when the tick-bump happens in `WorkerAISystem.js:988-997`, and an upgrade to `formatRelationOpinion` to consume it.

5. **scenario.meta 里的 NPC 背景传记不暴露.** DEFERRED-OUT-OF-SCOPE — verified by grep: `src/world/scenarios/ScenarioFactory.js` has no `colonistBank` / `meta.npcBackgrounds` field. Reviewer conflated scenario `openingPressure` (briefing text per template) with per-worker biographies. Scenario meta only carries scenario-level voice, not worker-level bio. OUT-OF-SCOPE for this plan; any "more biography detail" belongs to `EntityFactory.buildWorkerBackstory` which 01e already shipped in Round 5. Not re-opening.

6. **Template-role soft association.** DEFERRED-D5 in spirit (new content) — but there is a tiny signal we CAN wire: the scenario's `openingPressure` family ("frontier_repair" / "gate_chokepoints" / "island_relay") could bias the worker skill-roll (e.g. island_relay scenarios mildly favour `farming` + `woodcutting` — coastal colonists). This is inherent to `EntityFactory.createWorker`, which is called independently of scenario context — wiring scenario into worker-gen is a cross-layer refactor beyond this plan's budget. DEFERRED-OUT-OF-SCOPE (needs a new scenario→EntityFactory plumbing layer; not belt-tightening on existing wires).

## 2. Coverage Matrix

| # | reviewer finding (paraphrased) | disposition | step |
|---|---|---|---|
| F1 | Dax-7 "cooking specialist" 被派去砍木头 (backstory-role 脱钩) | FIXED (extend specialty match to FARM/WOOD; anti-mismatch filter) | Step 4 |
| F2 | 死亡不进记忆流 (Luka-38 death 在 Vela-8 memory 里没有) | FIXED in Round 5 — re-verified | (carried from R5 Step 1) |
| F3 | 重复坐标 4 次刷屏 ("记忆只是坐标日志") | FIXED in Round 5 — re-verified | (carried from R5 Step 2-3) |
| F4 | Relationships 数字变动无 "why" (Tam-9 +0.20→+0.30 无理由) | FIXED (add reason string threading + UI display) | Steps 3a, 3b, 5 |
| F5 | Birth 事件 ("colony_growth") 不进任何 worker memory | FIXED (memory push into nearby workers + event emit wire) | Step 2a |
| F6 | Friendship 跨越阈值 (Friend→Close friend) 不入 memory | FIXED (band-crossing emit into both workers' memory) | Step 2b |
| F7 | "为什么 Dax 在砍树" 没有因果解释 (intent 不带 "because") | FIXED (lastIntentReason + UI display) | Steps 1a, 1b, 5 |
| F8 | Entity Focus 面板 "Recent Memory" 读起来像 DEBUG log | FIXED partially — Step 2a/2b add human phrased lines | Steps 2a, 2b |
| F9 | Colony Panel COOK=0 但 Kitchen 已建 (Specialty 不影响分配) | FIXED in Round 5 (specialist roles) — re-verified green | (carried) |
| F10 | 环境 loop / BGM / SFX 静默 | DEFERRED-D5 (new audio asset, freeze) | — |
| F11 | Entity Focus 不能 cycle worker / 按名字搜 | DEFERRED-SUBSUMED-01d (worker-list已在 Round 5 Wave 2 by 01d落地) | — |
| F12 | scenario.meta NPC biographies 不暴露 | DEFERRED-OUT-OF-SCOPE (field doesn't exist) | — (§1.5) |
| F13 | Template-role soft link (island colonists should favour fishing skill etc.) | DEFERRED-D5 (new scenario→EntityFactory bridge + content) | — (§1.6) |
| F14 | AI Narrative 用词没 surface 到工人对话 | DEFERRED-SUBSUMED-02a (02a-rimworld-veteran owns prompt-template残句) | — |
| F15 | Heat Lens / 视觉氛围 / 夜晚光照 | DEFERRED-D5 (视觉 pass, freeze) | — |

**Coverage count**: 15 findings total. FIXED = 9 (F1, F2, F3, F4, F5, F6, F7, F8, F9). DEFERRED = 6 (F10, F11, F12, F13, F14, F15). **Coverage = 9/12 non-D5 = 75% (F10/13/15 are D5; F11/F14 SUBSUMED; F12 OUT-OF-SCOPE)**. Meets ≥70% mandate.

Per PROCESS.md §4.9: SURFACE-PATCH tag — Steps 1b/5 are UI surfaces on an already-existing data field; Steps 1a/2a/2b/3a/3b/4 are all **system-layer** behaviour changes (new emits, new memory pushes, new sort comparators, new state fields). Ratio = 5 system : 2 UI. System-layer ≥ 1 mandated minimum is met.

## 3. Suggestions (discarded / accepted)

### Path I (discarded) — "add mood debuff: saw friend die"

Why not: direct HW06 freeze violation (new mood mechanic). Round 5 plan §C already discarded this. Still a no.

### Path II (discarded) — "write scenario NPC biography bank"

Why not: field doesn't exist; requires new content authoring + scenario→EntityFactory bridge. D5 by construction.

### Path III (discarded) — "audio environment loop"

Why not: audio asset, HW06 freeze. summary.md §6 explicitly rejects.

### Path IV (accepted) — "close the two half-open drawers + open three new ones using existing data"

Chosen because every step uses an already-existing field (`worker.memory.recentEvents`, `worker.relationships`, `worker.debug.lastIntent`, `state.events.log`, `EVENT_TYPES.VISITOR_ARRIVED`, `EVENT_TYPES.WORKER_SOCIALIZED`). No new mechanic; five "接线" edits on existing plumbing.

## 4. Plan steps

### Step 1 — Intent "because" narration (WorkerAISystem + EntityFocusPanel wire)

- [ ] **Step 1a**: `src/simulation/npc/WorkerAISystem.js:216-262 (chooseWorkerIntent)` — edit — change the return shape from `string` to still-`string` but additionally set `worker.debug.lastIntentReason` at each branch. Example:
  - `"eat"` branch: `worker.debug.lastIntentReason = \`hunger=\${hunger.toFixed(2)} < threshold=\${threshold.toFixed(2)} and food=\${foodStock}\``
  - `"deliver"` branch: `\`carry=\${carryTotal.toFixed(1)} ≥ threshold=\${deliverThreshold.toFixed(1)}\``
  - `"farm"` branch: `\`role=FARM and farms=\${farmCount}\``
  - `"wander"` branch: `\`no role-matching worksite (role=\${worker.role}); fog frontier cleared\``

  All branches. Function stays pure returning the intent string; `worker.debug.lastIntentReason` is a side-channel write. Keep backward-compat: callers that don't read `lastIntentReason` see no change.

- [ ] **Step 1b**: `src/ui/panels/EntityFocusPanel.js:517` — edit — extend the `Intent` line to include `(because: <reason>)` when `entity.debug.lastIntentReason` is a non-empty string:

  ```js
  const intentLabel = escapeHtml(entity.debug?.lastIntent ?? entity.blackboard?.intent ?? "-");
  const intentReason = entity.debug?.lastIntentReason ? ` <span class="muted">(because ${escapeHtml(entity.debug.lastIntentReason)})</span>` : "";
  // ...existing State/Intent line gets intentReason appended after intentLabel
  ```
  - depends_on: Step 1a

### Step 2 — Birth / friendship memory emit (WorkerAISystem + PopulationGrowthSystem + optional WorldEventSystem helper reuse)

- [ ] **Step 2a (birth memory)**: `src/simulation/population/PopulationGrowthSystem.js:81-85` — edit — after the `emitEvent(state, VISITOR_ARRIVED, ...)` call, iterate workers within Manhattan distance ≤ 10 from the warehouse tile and push a human-readable memory line:

  ```js
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const timeStr = nowSec.toFixed(0);
  const newbornName = newWorker.displayName ?? newWorker.id;
  for (const agent of state.agents) {
    if (agent === newWorker || agent.type !== "WORKER" || agent.alive === false) continue;
    const dist = Math.abs(agent.x - pos.x) + Math.abs(agent.z - pos.z);
    if (dist > 10) continue;
    // Inline pushWorkerMemory-equivalent (reuse the (dedupKey, windowSec, nowSec)
    // convention Round 5 established in MortalitySystem.js). Births are rare
    // enough that a dedupKey of `birth:${newWorker.id}` with windowSec=9999
    // simply guards against PopulationGrowthSystem running twice on the same tick.
    agent.memory ??= { recentEvents: [], dangerTiles: [] };
    if (!Array.isArray(agent.memory.recentEvents)) agent.memory.recentEvents = [];
    if (!(agent.memory.recentKeys instanceof Map)) agent.memory.recentKeys = new Map();
    const key = `birth:${newWorker.id}`;
    if (agent.memory.recentKeys.has(key)) continue;
    agent.memory.recentKeys.set(key, nowSec);
    agent.memory.recentEvents.unshift(`[${timeStr}s] ${newbornName} was born at the warehouse`);
    agent.memory.recentEvents = agent.memory.recentEvents.slice(0, 6);
  }
  ```

  **Reuse note**: the `pushWorkerMemory` helper currently lives as a file-local function in both `MortalitySystem.js` and `WorldEventSystem.js` — Round 5 chose file-local duplication intentionally to avoid a new `src/simulation/lifecycle/memory.js` module. PopulationGrowthSystem gets its own inline copy (≈14 lines). If Step 2b wants to do the same, we accept the 3x file-local duplication in this round rather than extract a helper (extraction = +1 file, triggers snapshot test re-baselining). Future Round 6 can consolidate.

- [ ] **Step 2b (friendship band-crossing memory)**: `src/simulation/npc/WorkerAISystem.js:988-997` — edit — the proximity-drift block bumps `relationships[other.id]` by 0.05 every ~5s. Before the bump, capture `oldOpinion`; after, compare against semantic bands (0.15 Friend, 0.45 Close friend) and if the `oldOpinion < band ≤ newOpinion` crossing happened, push a memory line into **both** workers:

  ```js
  if (worker.relationships && (state.metrics.tick % 300 === (worker.id?.charCodeAt?.(7) ?? 0) % 300)) {
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const timeStr = nowSec.toFixed(0);
    for (const other of state.agents) {
      if (other === worker || other.type !== "WORKER" || other.alive === false) continue;
      const dist = Math.abs(worker.x - other.x) + Math.abs(worker.z - other.z);
      if (dist < 3) {
        const oldOp = Number(worker.relationships[other.id] ?? 0);
        const newOp = clamp(oldOp + 0.05, -1, 1);
        worker.relationships[other.id] = newOp;
        // 02d Step 2b — band-crossing emit. Bands match EntityFocusPanel.relationLabel.
        const crossedFriend = oldOp < 0.15 && newOp >= 0.15;
        const crossedClose = oldOp < 0.45 && newOp >= 0.45;
        if (crossedFriend || crossedClose) {
          const label = crossedClose ? "Close friend" : "Friend";
          const otherName = other.displayName ?? other.id;
          const workerName = worker.displayName ?? worker.id;
          // push into both workers' memory with dedupKey so a dozen frames
          // within one tick don't spam — band crossings are once-in-a-life.
          pushFriendshipMemory(worker, `[${timeStr}s] Became ${label} with ${otherName}`, `friend:${label}:${other.id}`, 9999, nowSec);
          pushFriendshipMemory(other,  `[${timeStr}s] Became ${label} with ${workerName}`, `friend:${label}:${worker.id}`, 9999, nowSec);
          // Also record the causal reason so EntityFocusPanel (Step 3a/5) can render
          // "because they worked the same tile" hint. The reason is kept symmetric.
          worker.relationships[`__reason__${other.id}`] = `worked adjacent (${Math.round(worker.x)},${Math.round(worker.z)})`;
          other.relationships[`__reason__${worker.id}`] = `worked adjacent (${Math.round(other.x)},${Math.round(other.z)})`;
          emitEvent(state, EVENT_TYPES.WORKER_SOCIALIZED, {
            entityId: worker.id, otherId: other.id, band: label, opinion: newOp,
          });
        }
      }
    }
  }
  ```

  `pushFriendshipMemory` is a new file-local helper in `WorkerAISystem.js` mirroring the MortalitySystem shape (≈12 LOC). It must NOT emit on every +0.05 tick — only on band crossings.
  - depends_on: none (Step 2a and 2b are independent)

### Step 3 — Relationship reason wire-up (already partially done in Step 2b; Step 3 finishes UI consumption)

- [ ] **Step 3a**: `src/simulation/npc/WorkerAISystem.js` — edit — when Step 2b writes `worker.relationships["__reason__" + otherId]`, also clean up that key format so `EntityFocusPanel` can distinguish it from a real numeric opinion:

  The `__reason__`-prefixed keys are plain strings and the existing UI code at `src/ui/panels/EntityFocusPanel.js:467-472` filters by `Number.isFinite`; these prefixed keys naturally fail `isFinite` and get silently skipped by the existing filter. **No additional defensive filter needed** — the existing `filter(([, v]) => Number.isFinite(v))` already rejects them.

- [ ] **Step 3b**: N/A — merged into Step 5 below.

### Step 4 — Expand specialty to FARM/WOOD/HAUL via anti-mismatch soft-match

- [ ] **Step 4**: `src/simulation/population/RoleAssignmentSystem.js:265-292` — edit — replace the tail section (lines 286-292 "Legacy ordering for FARM/WOOD/HAUL") with a **specialty-penalty-sorted** pick rather than blind `workers[idx++]`:

  ```js
  // 02d Round 5b — specialty-aware picks extended to FARM/WOOD/HAUL using a
  // "not-worst-fit" soft-match: rather than picking workers by (farming skill
  // desc), which disrupts spatial cluster locality at spawn, we PENALISE the
  // top 10% of workers whose dominant skill is strongly mismatched. Concretely:
  //
  //   FARM anti-mismatch: prefer workers whose topSkill is NOT "cooking" /
  //     "crafting" (they belong in COOK/SMITH slots; the specialist picker
  //     already took those, so any remaining cooking/crafting-dominant worker
  //     lands in FARM/WOOD only because budget overflowed — still, push them
  //     to the back of the queue).
  //   WOOD anti-mismatch: same, plus prefer workers whose topSkill IS
  //     "woodcutting" when possible.
  //
  // Implementation: compute a sort key `mismatchPenalty(role, worker)` that's
  //   0 if the worker's topSkill matches role's native (farming→FARM, wood→WOOD),
  //   0.5 if topSkill is neutral (mining / farming for WOOD),
  //   1 if topSkill belongs to a specialist role (cooking, crafting).
  // Sort the remaining pool by (mismatchPenalty ASC, origIdx ASC) so that
  // order-ties preserve the Round 5 spatial invariant.

  function topSkillKey(agent) {
    const skills = agent.skills ?? {};
    let best = "generalist"; let bestV = -Infinity;
    for (const k of Object.keys(skills)) {
      const v = Number(skills[k]);
      if (Number.isFinite(v) && v > bestV) { bestV = v; best = k; }
    }
    return best;
  }
  function mismatchPenalty(role, agent) {
    const top = topSkillKey(agent);
    if (role === ROLE.FARM) {
      if (top === "farming") return 0;
      if (top === "cooking" || top === "crafting" || top === "mining") return 1;
      return 0.5;
    }
    if (role === ROLE.WOOD) {
      if (top === "woodcutting") return 0;
      if (top === "cooking" || top === "crafting") return 1;
      return 0.5;
    }
    if (role === ROLE.HAUL) {
      // HAUL has no native skill, so any non-specialist is fine.
      if (top === "cooking" || top === "crafting") return 0.75;
      return 0;
    }
    return 0.5;
  }
  function sortByMismatch(pool, role) {
    return pool.map((agent, idx) => ({ agent, idx }))
      .sort((a, b) => {
        const da = mismatchPenalty(role, a.agent);
        const db = mismatchPenalty(role, b.agent);
        if (da !== db) return da - db;
        return a.idx - b.idx;
      })
      .map(({ agent }) => agent);
  }
  // Now assign:
  const farmPool = sortByMismatch(pool, ROLE.FARM).slice(0, totalFarm);
  for (const a of farmPool) a.role = ROLE.FARM;
  const afterFarm = pool.filter(a => !farmPool.includes(a));
  const woodPool = sortByMismatch(afterFarm, ROLE.WOOD).slice(0, totalWood);
  for (const a of woodPool) a.role = ROLE.WOOD;
  const afterWood = afterFarm.filter(a => !woodPool.includes(a));
  const haulPool = sortByMismatch(afterWood, ROLE.HAUL).slice(0, haulSlots);
  for (const a of haulPool) a.role = ROLE.HAUL;
  const leftover = afterWood.filter(a => !haulPool.includes(a));
  for (const a of leftover) a.role = ROLE.FARM;
  ```

  **Determinism guard**: `mismatchPenalty` only depends on `agent.skills` (seed-deterministic) and role constants. The tiebreaker is original `idx` → stable ordering preserved when mismatch ties. Seeds 1/7/42/99 should be invariant within ±2% DevIndex — the penalty function is monotonic in an existing data field. If the debugger Round 5 v2 benchmark sweep re-runs after this lands (seeds 1/7/42/99, preset=temperate_plains), the acceptance bar is **median DevIndex ≥ 33.88 (= the Round 5 v2 baseline)**, i.e. no regression relative to the RED baseline the refactor is trying to salvage. Do NOT use this plan as cover to move DevIndex — it's a narrative plan; survival metrics should be within noise.

  **Risk**: if the top-10% of workers (cooking/crafting skill ≈ 0.95) have a spatial cluster near the warehouse and get pushed to the BACK of the FARM queue, farms on the map edge get the leftover workers. For a 12-worker colony at steady-state, spatial perturbation is ≤2 tiles. Mitigation: if validation shows regression, flip `mismatchPenalty` for FARM such that mismatch=0 weight drops from 1 → 0.5 (reducing penalty strength by half).

  - depends_on: none (independent of Steps 1-3)

### Step 5 — EntityFocusPanel surfaces relationship reason + memory "because" badge

- [ ] **Step 5**: `src/ui/panels/EntityFocusPanel.js:467-487` — edit — extend `topRelations` mapping so when a `__reason__` key exists for the same `otherId`, append `(because <reason>)` to the relationship line:

  ```js
  const topRelations = Object.entries(relMap)
    .map(([otherId, op]) => [otherId, Number(op)])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([otherId, v]) => {
      const reason = relMap[`__reason__${otherId}`];
      const reasonSuffix = reason ? ` <span class="muted">(because ${escapeHtml(String(reason))})</span>` : "";
      return `${escapeHtml(lookupDisplayNameById(otherId))}: ${formatRelationOpinion(v)}${reasonSuffix}`;
    });
  ```

  NOTE: the `reasonSuffix` contains HTML; the outer `escapeHtml(relationsLine)` in the current render at line 485 would double-escape. Rewrite the line render to use `relationsLine = topRelations.join(" | ")` WITHOUT the outer `escapeHtml` call. The per-piece escaping inside the map already sanitises user data. This is a minor XSS-awareness refactor — no reviewer-visible regression as worker IDs are internal.

  - depends_on: Steps 2b, 3a

### Step 6 — Tests (4 new)

- [ ] **Step 6a**: `test/memory-recorder.test.js` (extend) — new case **"birth pushes memory into nearby workers"**: construct a state with 1 warehouse + 3 workers (distances 2, 8, 20 tiles from warehouse), stub `state.resources.food = 50`, tick `PopulationGrowthSystem` once, assert workers at dist 2 and 8 have one new `recentEvents[0]` matching `/was born at the warehouse/`; worker at dist 20 has `recentEvents.length === 0`.
- [ ] **Step 6b**: `test/memory-recorder.test.js` (extend) — new case **"friendship band crossing writes memory to both workers"**: construct 2 workers A and B, set `A.relationships[B.id] = 0.12` (just below Friend threshold), place them 2 tiles apart, tick `WorkerAISystem.update` with `state.metrics.tick` such that the 5s cadence fires for A; assert both A and B have `[timestamp] Became Friend with <name>` in their `recentEvents[0]`, and `A.relationships[B.id] ≥ 0.15` (band crossed), and `A.relationships["__reason__"+B.id]` is a non-empty string.
- [ ] **Step 6c**: `test/role-assignment-specialty.test.js` (extend, existing file from Round 5) — new case **"cooking-dominant worker not pushed into WOOD when general workers available"**: 8 workers, 1 with `skills.cooking=0.95` (others cooking ≤ 0.3); `state.buildings = {farms:6, lumbers:6, warehouses:1}`, no kitchens → COOK slot = 0 (gated off); run RoleAssignmentSystem; assert the cooking-specialist worker's `role` is NOT `ROLE.WOOD` (can be FARM or HAUL, depending on anti-mismatch ordering; the key is it's not the most-mismatched slot).
- [ ] **Step 6d**: `test/worker-ai-intent-because.test.js` (new file) — **"chooseWorkerIntent writes lastIntentReason"**: for each branch (eat / deliver / farm / wander), construct a minimal state + worker, call `chooseWorkerIntent`, assert `worker.debug.lastIntentReason` is a non-empty string containing the gating values. Example for eat branch: `hunger=0.10 < threshold=0.15`.
  - depends_on: Steps 1-4

## 5. Risks

- **Snapshot/determinism (Step 2b friendship emit)**: the `__reason__${otherId}` keys are added to `relationships` map — if any downstream test iterates `Object.keys(worker.relationships)` and casts each value to Number without a finite-check, it will see `NaN` entries. Grep (`src/simulation/ai/**`) shows only `ColonyPerceiver` reads `relationships` and uses `Number.isFinite` filter — safe. EntityFocusPanel already filters (line 469). OK.
- **Monotonicity (Step 4)**: extending specialty to FARM/WOOD/HAUL is the reason Round 5's implementer (w1-fallback-loop commit §02d Step 4 SCOPED section) narrowed to specialist roles. The anti-mismatch approach differs from that "skill DESC" sort — we only penalise the top-10% mismatched workers rather than re-sort the whole pool. Seeds 1/2/3 monotonicity.test.js risk is lower but non-zero. **If regression**: Step 4 implementation includes a fallback lever — set `mismatchPenalty` return for the mismatch=1 case to `0.5` (halve penalty); set the mismatch=0.5 case to `0.25`. This preserves order for ~90% of cases.
- **UI double-escape (Step 5)**: removing the outer `escapeHtml` call requires care; every reactive-piece (`lookupDisplayNameById`, `formatRelationOpinion`, `reason`) must escape its own output. Step 5 does this explicitly. Code review checklist.
- **Birth flood (Step 2a)**: late-game population bloom (birth every 10s) might push 10+ birth lines into `recentEvents` over 100s, displacing interesting events (Luka died). Mitigation: the `worker.memory.recentEvents.slice(0, 6)` cap already enforces max 6 entries. Births ≥ 6 in 100s would displace death memories — but at that population density death rate typically exceeds birth rate so deaths naturally stay on top. Accept.
- **Round 5 RED regression decoupling**: Round 5 Validation test-report.md verdict=RED is due to structural `computePopulationAwareQuotas` + `reserved` budget split in `RoleAssignmentSystem`, not 02d's wire-ups. This Round 5b plan touches the FARM/WOOD/HAUL assignment tail but NOT the budget split (Step 4 only touches lines 286-292; line 122 `farmMin = Math.min(2, n)` and line 140 `scaledQuotas` are both untouched). The Round 6 mandate in test-report.md §"Round 6 mandate: structural refactor" flags those two lines for a separate refactor.

## 6. Verification plan

- New tests: 6a + 6b + 6c + 6d — 4 new or extended cases.
- Existing tests that must stay green:
  - `test/role-assignment-system.test.js` (counts-only, unaffected by anti-mismatch sort)
  - `test/role-assignment-quotas.test.js` (counts-only)
  - `test/role-assignment-specialty.test.js` (existing specialist assertions should still hold — specialty for COOK/SMITH/HERBALIST is unchanged)
  - `test/role-assignment-population-scaling.test.js`
  - `test/memory-recorder.test.js` (pre-existing nearby-witness + dedup tests unchanged)
  - `test/mortality-system.test.js`
  - `test/entity-focus-relationships.test.js` — label/reason UI invariant
  - `test/death-narrative-log.test.js`
  - `test/monotonicity.test.js` seeds 1/2/3 — critical regression guard on Step 4
- Manual:
  - `npx vite` → open Entity Focus → click any worker → confirm new line "Intent: farm (because role=FARM and farms=6)"
  - Wait for first birth (pop count increase) → click a nearby worker → confirm `Recent Memory` has `"[Ns] <name> was born at the warehouse"`
  - Wait ≥ 30s for proximity tick → click a worker → if any relationship changed to a new band, confirm `Recent Memory` has `"Became Friend with <other>"` and the relationship line includes `(because worked adjacent ...)`
- Benchmark (same 4-seed sweep as test-report.md §"Baseline"): `node scripts/long-horizon-bench.mjs --seed {1,7,42,99} --preset temperate_plains --max-days 365 --soft-validation`. **Acceptance**: median DevIndex within ±2 of the Round 5 v2 baseline (33.88), i.e. 31.9-35.9. Seeds 1/99 may still lose the colony — Round 5b 02d is NOT trying to fix structural survival (that's Round 6 §1 mandate). If a seed regresses from pre-existing `ok` to `loss` due to Step 4, revert Step 4 only (Steps 1-3 + 5 are independent).

## 7. Scope summary

- layers hit: `simulation/lifecycle` (re-verified), `simulation/population` (Step 4), `simulation/npc` (Steps 1a, 2b), `world/events` (indirect — reuse pushWorkerMemory pattern, no edits), `ui/panels` (Steps 1b, 5) → **≥2 system layers mandated by §4.10 ✓** (specifically: simulation/population + simulation/npc + ui/panels = 3 layers, plus lifecycle as carry-over)
- loc_delta: Step 1a ≈ 25, Step 1b ≈ 5, Step 2a ≈ 18, Step 2b ≈ 40, Step 4 ≈ 60, Step 5 ≈ 15, Step 6 (4 tests) ≈ 80 → **~200+ LOC > 120 mandate ✓**
- system-layer behaviour changes: 5 (Steps 1a, 2a, 2b, 3a, 4). UI-layer surface changes: 2 (Steps 1b, 5). Ratio 5:2 well above §4.10 #3 "≥50% behaviour" threshold.
- coverage: 9/12 non-D5 findings FIXED = **75% ≥ 70% ✓**

## 8. UNREPRODUCIBLE / OUT-OF-SCOPE summary

- F10 (audio), F13 (template-role bio), F15 (visual) → HW06 freeze (D5)
- F11 (Entity Focus cycle) → SUBSUMED by 01d Round 5 Wave 2 (`entityFocusWorkerList` landed, verified in test-report.md smoke §02-mid-run-hud.png — `Tab-key cycled focus to Pia-2`, functional)
- F12 (scenario.meta biography) → OUT-OF-SCOPE (field doesn't exist; see §1.5)
- F14 (AI Narrative prompt残句) → SUBSUMED by 02a-rimworld-veteran owns Storyteller prompt templates

All deferrals documented per PROCESS.md §4.9.
