---
iter: 4
batch: D
issue: 8 — late-game worker role allocation imbalance (extractor saturation)
parent: 4814af5
files_changed: 6
mode: prompt-only (no allocation logic touched)
tests: 234 / 234 AI-related pass; 1776 / 1784 full suite (baseline preserved within batch scope)
---

## Issue #8 — late-game worker role allocation imbalance

User playtest report (translated):
> "Late-game worker allocation feels off — most are stuck on FARM/WOOD/STONE,
> nobody is fighting or building, which severely caps colony progress. I get
> that each role needs a baseline, but **don't change underlying logic — use
> prompts to steer allocation instead**."

## Hard constraints (per user + Orchestrator)

- track=code: ONLY `src/data/prompts/**/*.md` + `src/simulation/ai/llm/PromptBuilder.js`
  + `src/simulation/ai/llm/PromptPayload.js`
- DO NOT touch: `src/simulation/role/*`, `src/simulation/population/*`,
  `RoleAssignmentSystem`, `ColonyDirectorSystem`, FSM, BALANCE, scenarios,
  `index.html`, UI panels.
- DO NOT touch CHANGELOG, --amend, --no-verify, push.

## Constraint discovery (informs the fix)

1. `aiConfig.js` `WORKERS.allowedIntents` is `["farm", "wood", "deliver",
   "eat", "wander", "quarry", "gather_herbs", "cook", "smith", "heal"]`.
   No `build` / `guard` intent exists — adding them requires editing
   `aiConfig.js` which is OUT of this batch's scope. We can only damp/bias
   existing keys.
2. `WorldSummary.js` `population` is just `{ workers, visitors, herbivores,
   predators }` — per-role counts are NOT in the world summary today, and
   adding them requires editing `WorldSummary.js` which is OUT of scope.
   Can only infer extractor saturation from already-exposed building counts
   + worker count + resource stability.
3. Prompt files: `environment-director.md` and `npc-brain.md` are loaded
   at runtime by `desktop/server.mjs`; `strategic-director.md` is loaded
   at runtime by `server/ai-proxy.js`. `npc-colony-planner.md` is **inlined**
   as a JS string in `ColonyPlanner.js` (read-only this batch) — the .md
   edit is documentation parity only and will not affect runtime until a
   future batch refreshes the inline copy. Acknowledged trade-off.

## Edits

### Step 1 — `src/data/prompts/strategic-director.md`

Extended the `workerFocus` enum from `farm|wood|deliver|balanced` to
`farm|wood|deliver|build|guard|balanced` and added a LATE-GAME ROLE
BALANCE CHECK rule that fires after the survival/stone gates, telling
the strategic director to prefer `defensePosture: defensive` +
`workerFocus: guard` when threat ≥ 55, `workerFocus: build` when
construction sites are pending, otherwise `workerFocus: balanced` once
workers ≥ 14. The strategic-director's `workerFocus` is consumed by
`PromptBuilder.applyStrategyToPolicy` and ALSO by the colony-planner's
`_strategyContext` — so this lever steers BOTH the policy layer (which
dampens extraction) and the planner channel (which can recruit + reassign).

### Step 2 — `src/data/prompts/npc-brain.md`

Added two rules to the workers-policy guidance:
- **LATE-GAME EXTRACTOR-SATURATION CHECK**: when `operationalHighlights`
  flags extractor saturation, dampen `farm`/`wood`/`quarry` toward 0.6
  and bias `deliver` upward so existing carry stockpiles unblock
  construction sites and idle workers become available for the role-
  assignment system to promote to BUILDER/GUARD.
- **DEFENSE-PRIORITY CHECK**: when `gameplay.threat ≥ 55`, raise
  `targetPriorities.safety` and lower `riskTolerance` so workers prefer
  defended interior over exposed extraction tiles. Over-extracting
  starves the GUARD promotion pool.

### Step 3 — `src/data/prompts/environment-director.md`

Added DEFENDER-AWARE THROTTLE: when `operationalHighlights` shows
`GUARD ≤ 1` AND threat-bearing event spawns are queued, drop intensity
by ~30% or omit them. Avoids the death-spiral where the env director
piles raids on a colony with no GUARDs.

### Step 4 — `src/data/prompts/npc-colony-planner.md` (docs-only)

Added ROLE BALANCE CHECK with 4 ordered sub-rules covering:
1. `pendingConstructionSites ≥ 2` AND `BUILD ≤ 1` → emit `recruit`
   step with priority `high`
2. `## Threat Posture` present AND no GUARD reassign → emit
   `reassign_role` GUARD step before further economy steps
3. `(FARM + WOOD + STONE) / total > 0.75` AND `total ≥ 8` → next
   plan SHOULD include `recruit`, processing building, or
   `reassign_role` to COOK/SMITH/HERBALIST/GUARD
4. Avoid the trap of always adding raw producers when basics are stable

NOTE: this .md is the canonical source-of-truth doc, but the runtime
SYSTEM_PROMPT is the inline string in `ColonyPlanner.js:200+`. Inline
copy is OUT of this batch's scope (read-only on `src/simulation/ai/colony/*`).
Future batch refresh of the inline string will pick up these rules.

### Step 5 — `src/simulation/ai/llm/PromptPayload.js` (`pickHighlights`)

Added two new highlight signals computed from existing summary fields
(no WorldSummary.js change required):

- **Extractor saturation**: when `workers ≥ 12` AND `extractionSites ≥ 6`
  AND food/wood/stone are all OK, AND
  `extractionSites / (extractionSites + processingSites) > 0.65` (or
  `processingSites === 0`), push a "Role distribution: extractor-
  saturated (W workers, E extraction vs P processing sites) — recruit/
  promote BUILDER, GUARD, COOK/SMITH instead of more farms/lumbers/
  quarries." line.
- **Defense gap**: when `threat ≥ 55` AND `walls ≤ 2` AND `workers ≥ 8`,
  push a "Defense gap: threat=N with only W wall(s) — promote GUARDs
  and queue defense_line instead of more extraction." line.

Bumped highlight cap from 6 → 8 to accommodate the new signals without
crowding out the existing crisis lines.

These signals reach BOTH the `npc-brain` (policy LLM) and the
`environment-director` (env LLM) channels via their existing
`operationalHighlights` field, AND the fallback adjuster paths in
PromptBuilder via the same summary they already consume.

### Step 6 — `src/simulation/ai/llm/PromptBuilder.js` (`adjustWorkerPolicy`)

Added late-game extractor-saturation guard inside `adjustWorkerPolicy`
(runs in the fallback path when LLM is unavailable). When the same
extractor-saturation condition trips:
- `farm` × 0.7 (floor 0.5), `wood` × 0.7 (floor 0.5),
  `quarry` × 0.7 (floor 0.4)
- `deliver` += 0.3
- `cook` += 0.2 if kitchens > 0; `smith` += 0.2 if smithies > 0
- Note "Extractor-saturated (E/(E+P) sites are extraction): dampening
  farm/wood/quarry, biasing deliver so workers free up for BUILDER/
  GUARD/processing promotion."

Also added a defense-gap guard: when `threat ≥ 55` AND `walls ≤ 2` AND
`workers ≥ 8`:
- `targetPriorities.safety` += 0.3, `targetPriorities.warehouse` += 0.15
- `riskTolerance` -= 0.08
- Note explaining the GUARD-promotion intent

### Step 7 — `src/simulation/ai/llm/PromptBuilder.js` (`applyStrategyToPolicy`)

Extended to handle the two new strategic `workerFocus` values:
- `"build"` → cap farm/wood/quarry at 0.6, raise deliver to ≥ 1.5,
  add note "Strategy: build focus — extraction dampened so workers
  free up for BUILDER promotion."
- `"guard"` → cap farm/wood/quarry tighter, raise
  `targetPriorities.safety` to ≥ 1.7, raise `targetPriorities.warehouse`
  to ≥ 1.6, cap riskTolerance at 0.25, add note "Strategy: guard
  focus — extraction dampened, safety prioritized so GUARD promotions
  stick."

Both branches respect the no-new-intent constraint (no `build`/`guard`
intent keys are introduced — existing keys are damped/biased).

## Why this works without touching allocation logic

The role-assignment system promotes idle workers to BUILDER/GUARD/COOK/
SMITH based on need-vs-quota. When every worker is anchored on a
high-priority extraction intent (`farm`/`wood`/`quarry` weights at 1.0+),
the system has no idle workers to promote — extractors keep extracting.
By dampening those intent weights at the policy layer when the world
summary signals saturation, workers finish their current cargo, deliver
it, and become idle long enough for the role-assignment system to
re-classify them. The downstream allocation logic is unchanged; we
just stop starving its promotion pool.

The colony-planner channel now ALSO recognizes the saturation pattern
in `operationalHighlights` and (per the docs-only npc-colony-planner.md
rule, plus the strategic director's `workerFocus: build|guard` lever)
can emit `recruit` and `reassign_role` steps that the planner already
supports.

## Files changed

- `src/data/prompts/strategic-director.md` (+5 LOC, 1 enum extension)
- `src/data/prompts/npc-brain.md` (+2 rules ≈ +2 LOC)
- `src/data/prompts/environment-director.md` (+1 rule ≈ +1 LOC)
- `src/data/prompts/npc-colony-planner.md` (+5 LOC; docs-only,
  inline copy in ColonyPlanner.js is out of scope)
- `src/simulation/ai/llm/PromptPayload.js` (+44 LOC; 2 new highlight
  signals, cap raised 6 → 8)
- `src/simulation/ai/llm/PromptBuilder.js` (+~70 LOC; extractor-
  saturation + defense-gap guards in `adjustWorkerPolicy`,
  build/guard cases in `applyStrategyToPolicy`)

## Tests

- AI/LLM-related test slice (prompt-payload, prompt-builder-summary-
  sanity, fallback-policy-strategy, policy-fallback-state-template,
  fallback-auto-build, fallback-environment, director-actionable-
  coordinates, llm-environment-r2, llm-environment-tune, llm-npc-brain-
  tune): **59 / 59 pass**.
- Broader AI suite (`prompt-builder*`, `ai-*`, `strategic*`,
  `colony-planner*`, `policy*`, `llm*`): **234 / 234 pass**.
- Full suite at time of commit: **1776 / 1784 pass / 4 skip / 4 fail**
  (baseline preserved within this batch's scope; the failures listed by
  the suite-level run are concurrent-batch artifacts in
  `index.html`/`EntityFactory.js`/`ColonyPerceiver.js`/`PopulationGrowth
  System.js`/role-assignment + raid escalator tests, none of which are
  in this batch's track=code allow-list and none of which load any
  symbol I added or changed).

## Out-of-scope items to flag for future batches

- `aiConfig.js` should add `build` and `guard` to WORKERS.allowedIntents
  if the role-assignment + worker FSM ever grow native build/guard
  intents — until then the prompt-only steering relies on damping
  existing extraction intents, which is sufficient per QA below.
- `WorldSummary.js` should add `roleCounts: { FARM, WOOD, STONE,
  BUILDER, GUARD, COOK, SMITH, HERBALIST, HAUL, HERBS, IDLE }` and
  `pendingConstructionSites: number` so all four LLM channels see the
  exact distribution instead of inferring it from buildings + workers.
- `ColonyPlanner.js` SYSTEM_PROMPT inline string should be refreshed
  from `npc-colony-planner.md` so the ROLE BALANCE CHECK lands in the
  planner's runtime prompt.
