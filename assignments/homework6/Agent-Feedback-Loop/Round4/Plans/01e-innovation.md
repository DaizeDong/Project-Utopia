---
reviewer_id: 01e-innovation
feedback_source: Round4/Feedbacks/01e-innovation.md
round: 4
date: 2026-04-23
build_commit: 65a8cb7
priority: P1
estimated_scope:
  files_touched: 6
  loc_delta: ~180
  new_tests: 2
  wall_clock: 180
conflicts_with: []
---

## 1. Core Problems

- The game’s distinct pitch is still mostly carried by help text and labels; the live play loop does not foreground why the AI director and autopilot meaningfully change play.
- Existing differentiators such as AI decision causality, supply-chain heat, and map-template identity are presented as supporting UI instead of first-order play feedback, so players classify the build as a familiar colony sim before they feel the twist.
- Early-session UX does not force a memorable “this only happens here” moment, which leaves the project’s innovation claim under-supported even when the underlying systems are present.

## 2. Suggestions

### Direction A: Promote Existing AI Causality Into The Main HUD Loop
- Approach: move current autopilot state, AI rationale, and consequences into always-visible HUD/panel surfaces so players repeatedly see why the system acted and how to react.
- Involved files: `src/ui/hud/*`, `src/ui/panels/*`, `src/config/ai.js`
- Scope: medium
- Expected benefit: strengthens differentiation without adding mechanics; makes current AI systems legible, discussable, and testable.
- Main risk: if the underlying AI event stream is sparse, the surfaced UI may feel repetitive or over-claimed.

### Direction B: Reframe The First Ten Minutes Around Scenario Identity And Directed Moments
- Approach: retune scenario copy, milestone sequencing, and heat-lens prompts so each map template quickly produces a visible pressure pattern and a clear AI-led intervention moment.
- Involved files: `src/config/constants.js`, `src/config/balance.js`, `src/ui/hud/*`, `src/ui/panels/*`
- Scope: medium
- Expected benefit: gives players an earlier and clearer sense that templates and AI framing actually change how they think.
- Main risk: tuning-only changes may still feel cosmetic if the AI explanations remain buried.

### Direction C: Tighten Product Language To Match What The Build Actually Delivers
- Approach: reduce “AI director” marketing emphasis in help/onboarding where the runtime experience cannot yet fully prove it, and rewrite around observable behavior already in the build.
- Involved files: `src/ui/panels/*`, `src/ui/hud/*`
- Scope: small
- Expected benefit: lowers expectation mismatch and makes the current build feel more coherent.
- Main risk: safer messaging alone does not improve the felt distinctiveness of play.

## 3. Selected Direction

Choose **Direction A**.

Reason: this is the best freeze-safe path. It does not require inventing a new mechanic, but it directly addresses the reviewer’s core criticism that the AI layer exists more in description than in felt play. It also creates a foundation for later tuning of scenario identity without forcing broad systemic change.

## 4. Plan Steps

- [ ] Step 1: `src/ui/hud/Autopilot*.{js,jsx,ts,tsx}:render|update` - edit - expand the autopilot status block so it shows active mode, latest directive, and immediate tradeoff/result instead of a binary ON/OFF-style readout.
- [ ] Step 2: `src/ui/panels/AIDecisions*.{js,jsx,ts,tsx}:render|buildEntries` - edit - promote the AI Decisions panel into a higher-salience summary with concise cause -> action -> consequence rows visible during normal play.
  - depends_on: Step 1
- [ ] Step 3: `src/ui/hud/StoryStrip*.{js,jsx,ts,tsx}:pushEvent|render` - edit - connect milestone/story notifications to AI-directed decisions so key events read as system interventions, not generic colony progress toasts.
  - depends_on: Step 2
- [ ] Step 4: `src/ui/tools/HeatLens*.{js,jsx,ts,tsx}:renderLegend|toggle` - edit - tie supply-chain heat lens messaging to AI decision context, clarifying why the lens matters to current autopilot behavior.
  - depends_on: Step 2
- [ ] Step 5: `src/config/ai.js:directorProfiles|decisionTelemetry` - edit - ensure existing AI decision metadata exposes stable labels/reasons/consequences needed by the HUD and panel surfaces.
  - depends_on: Step 2
- [ ] Step 6: `src/ui/panels/Help*.{js,jsx,ts,tsx}:renderWhatMakesUtopiaDifferent|renderAutopilotHelp` - edit - align help copy with the newly visible runtime signals so documentation describes what the player can now directly observe.
  - depends_on: Step 1
- [ ] Step 7: `test/ui/ai-director-visibility.test.js` - add - cover autopilot HUD and AI Decisions panel visibility for manual vs autopilot states.
  - depends_on: Step 5
- [ ] Step 8: `test/ui/story-strip-ai-context.test.js` - add - cover that milestone/story notifications include AI-context labels when tied to system actions.
  - depends_on: Step 3

## 5. Risks

- Increasing HUD density could make the interface noisier and reduce the current clean readability.
- Surfacing AI rationale too aggressively may reveal deterministic or repetitive behavior that was previously hidden by abstraction.
- Story-strip changes may over-attribute routine simulation outcomes to the AI director and feel misleading.
- Possible impacted existing tests: `test/ui/hud*.test.js`, `test/ui/panels*.test.js`, `test/snapshots/*`

## 6. Verification

- New tests: `test/ui/ai-director-visibility.test.js` covering autopilot state, rationale, and consequence display; `test/ui/story-strip-ai-context.test.js` covering AI-linked milestone messaging.
- Manual verification: open the build, start a standard map, toggle `Autopilot`, trigger at least one supply or construction bottleneck, and confirm the HUD plus AI Decisions panel expose cause -> action -> consequence without opening help.
- Manual verification: switch to the supply-chain heat lens during an active bottleneck and confirm the lens language matches the current AI-directed response.
- Benchmark regression: run `scripts/long-horizon-bench.mjs` with `seed 42` on `temperate_plains`; DevIndex should not fall more than 5% from the current baseline after UI/telemetry changes.

## 7. UNREPRODUCIBLE

- Live reproduction was not performed in this pass because the task ownership restricted reading to the assigned feedback file and writing only the plan artifact. This plan is therefore based on the reviewer’s described symptoms and the enhancer template’s freeze constraints.
