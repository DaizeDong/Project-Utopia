---
reviewer_id: 01e-innovation
round: 7
build_commit: f0bc153
freeze_policy: lifted
---

# Enhancer Plan — Round 7 / 01e-innovation

## 1. Core Problems (Root Cause Analysis)

### P1 — DIRECTOR/WHISPER gap creates a broken promise at the title level

`AI_CONFIG.enableByDefault` is `false` (`src/config/aiConfig.js:8`). On startup,
`GameApp.js:1387` enforces `state.ai.enabled = false` whenever `hasApiKey` is
falsy (the common case for anyone who has not configured a proxy). `LLMClient`
immediately short-circuits in both `requestEnvironment` and `requestPolicies`
when `enabled === false` (lines 87-105, 160-178), returning a local
`buildEnvironmentFallback` / `buildPolicyFallback` result with `fallback: true`
and `model: "fallback"`. The `storytellerStrip` then prepends `"DIRECTOR picks"`
(line 751). The player therefore always sees `DIRECTOR picks rebuild the broken
supply lane: ...` — never WHISPER — regardless of gameplay duration or colony
state. The fallback text comes from a handful of `describeWorkerFocus` branches
(~5 strings) that are structurally identical across games.

**Root cause:** the LLM path is gated behind an API key that no default player
has. There is no demo or local-substitute path that shows the gameplay shape of
WHISPER output. The feature is invisible.

### P2 — Worker traits are labels, not mechanics

`EntityFactory.js:292-293` wires only `swift` and `efficient` into
`preferences.speedMultiplier` / `workDurationMultiplier`. The traits `hardy`,
`social`, and `resilient` have zero mechanical effect on the worker's decision
loop or state transitions. `WorkerAISystem.js` never reads `worker.traits`
during the intent-scoring or state-execution phase. The EntityFocusPanel
displays the trait array but nothing in the simulation makes a `hardy` worker
behave differently than one with no trait. The reviewer's observation is
accurate: traits are decorative labels.

### P3 — Fallback DIRECTOR copy is structurally uniform; the WHISPER demo path
is absent, so the AI system's "maximum differentiation moment" is never reached

`describeWorkerFocus` (PromptBuilder.js:126-143) produces one of exactly five
fixed strings (`"rebuild the broken supply lane"`, `"clear the stalled cargo"`,
`"keep the larder filling"`, `"work the safe edge of the frontier"`,
`"push the frontier outward"`). Because the LLM never fires, all HUD
storyteller output is drawn from this five-branch switch. The `buildEnvironmentDirective`
summary is the interpolation `"Pressure ${focus} for ${durationSec}s while keeping
the scenario legible."` — structurally identical every call.

The "AI director bargaining" feature requested by the reviewer (Suggestion 2 in
the feedback, §VI) is completely absent from the codebase: no state path, no UI
slot, no handler.

---

## 2. Code Locations

| Concern | File(s) | Lines |
|---------|---------|-------|
| AI disabled by default | `src/config/aiConfig.js` | 8 |
| enableByDefault enforcement | `src/app/GameApp.js` | 1382–1409 |
| LLM short-circuit on `enabled=false` | `src/simulation/ai/llm/LLMClient.js` | 87–105, 160–178 |
| Fallback text generation | `src/simulation/ai/llm/PromptBuilder.js` | 126–143, 722–780, 364–382 |
| "DIRECTOR picks" prefix injection | `src/ui/hud/storytellerStrip.js` | 749–752 |
| Trait pool definition | `src/entities/EntityFactory.js` | 221, 292–293 |
| Trait mechanical effect (only swift/efficient) | `src/entities/EntityFactory.js` | 292–293 |
| Worker intent scoring | `src/simulation/npc/WorkerAISystem.js` | (no trait reads found) |
| EntityFocusPanel trait display | `src/ui/panels/EntityFocusPanel.js` | 486–487, 562 |
| Worker introspection panel (positive) | `src/ui/panels/EntityFocusPanel.js` | 480–563 |
| Policy bargaining UI slot | none | — |
| whisperBlockedReason tooltip chain | `src/ui/hud/storytellerStrip.js` | 762–800; `HUDController.js` 1072–1163 |

---

## 3. Reproduction (Browser)

The Playwright backend was not running during this analysis pass; reproduction
is based on source code and the reviewer's 45-interaction session notes.

Key observations that match source:

- `enableByDefault: false` confirms WHISPER never fires without an API key.
- The reviewer saw only five distinct focus strings across five scenarios and
  multiple sessions — exactly matching the five branches in `describeWorkerFocus`.
- `storytellerStrip.js:751` confirms the `"DIRECTOR picks"` prefix on every
  fallback tick. With `enabled=false` from startup, every tick is a fallback
  tick.
- `EntityFactory.js:292-293` confirms `hardy`, `social`, `resilient` have zero
  `preferences` multipliers; no `WorkerAISystem.js` path reads `worker.traits`.

---

## 4. Suggestions

### Suggestion A — Local WHISPER Demo Mode (no API key required)

Add a `demoWhisperFallback` path inside `LLMClient.requestEnvironment` and
`requestPolicies` that fires when `state.ai.enabled === true` but no real proxy
is reachable. This demo path calls an expanded `buildEnvironmentFallback` /
`buildPolicyFallback` variant that:

1. Produces structurally varied, context-sensitive natural-language output — not
   a fixed 5-branch switch. Keys to vary on: scenario ID, colony age (timeSec
   bands), dominant crisis type, current weather, recent death count.
2. Sets `fallback: false` and `model: "local-demo"` so the badge renders
   `WHISPER (local-demo)` instead of `DIRECTOR`.
3. Includes a one-time toast: `"Story Director online — running in offline
   demo mode"` so the player understands what they are seeing.

This does not require an API key or server. It makes the WHISPER display path
reachable by any player on first launch. The key commitment: WHISPER text must
feel meaningfully different from the current five-branch DIRECTOR text.

**Impact on P1 and P3:** direct fix. WHISPER becomes observable in the default
play session.

### Suggestion B — Wire `hardy` and `social` traits into measurable stat modifiers

Extend `EntityFactory.js` preferences to cover all six traits:

| Trait | Mechanical effect |
|-------|-------------------|
| `hardy` | `weatherSpeedPenaltyMultiplier: 0.5` — halves movement-speed penalties from storm/rain weather events |
| `social` | `socialDecayMultiplier: 0.4` — social stat decays 60% slower when isolated; passively boosts nearby workers' social gain by +0.003/tick |
| `resilient` | `moraleDecayOnDeathMultiplier: 0.5` — morale penalty from witnessing a death is halved |
| `swift` | (already wired: `speedMultiplier: 1.15`) |
| `efficient` | (already wired: `workDurationMultiplier: 0.8`) |
| `careful` | (already wired: speed 0.9, work 1.2) |

In `WorkerAISystem.js`, read `worker.preferences.weatherSpeedPenaltyMultiplier`
during movement-speed calculation under weather conditions; read
`worker.preferences.socialDecayMultiplier` in the social-update block (lines
1069-1076); read `worker.preferences.moraleDecayOnDeathMultiplier` when the
morale-on-death penalty is applied in `MortalitySystem.js` / the grief block.

Traits become observable in the EntityFocusPanel data by day 5 (social/morale
numbers diverge visibly). No new UI needed; existing stat rows surface the
difference.

**Impact on P2:** direct fix. `hardy` and `social` now have a visible effect
inside the panel the reviewer praised.

### Suggestion C — Director Bargaining: a player-response slot in the HUD

Add a small "Respond" affordance to the storyteller strip. When the DIRECTOR or
WHISPER strip shows a directive (e.g. `"push the frontier outward"`), a
one-click alternative appears: `[Hold back]` which sets a short-lived override
flag `state.ai.playerOverride = { directive: "consolidate", expirySec: now + 90 }`.
`PromptBuilder` reads this flag as a strong `steeringNotes` input: `"Player
requested consolidation — restrict new frontier pushes for ${remaining}s."`.
The flag is shown in the AI Decision Panel, and the storyteller strip shows
`"DIRECTOR: noted — consolidating"` for its duration.

This requires: a new boolean/object on `state.ai`, a HUD button wired in
`HUDController`, a `steeringNotes` injection in `adjustWorkerPolicy`, and a
test covering the override expiry path.

**Impact on P3:** partial fix — transforms the AI director from a read-only
narrative label into a one-degree-of-freedom interaction. Does not require LLM.

---

## 5. Selected Approach

**Primary:** Suggestion A (Local WHISPER Demo Mode) + Suggestion B (trait mechanics).

Rationale: Suggestion A addresses the single most damaging criticism in the
feedback — the LLM never firing — without requiring any backend infrastructure
change. Suggestion B addresses the second-most-cited weakness (traits as labels)
with a small, safe change that generates observable panel data. Both are
testable, have no balance risk, and do not require UI work beyond what already
exists.

Suggestion C (bargaining) is logged as a follow-on; it requires a HUD layout
decision that should go through a separate UI plan pass.

---

## 6. Implementation Plan

### Step 1 — Expand trait preferences in EntityFactory
**File:** `src/entities/EntityFactory.js`

Add `weatherSpeedPenaltyMultiplier`, `socialDecayMultiplier`, and
`moraleDecayOnDeathMultiplier` to the `preferences` object:

```js
preferences: {
  speedMultiplier: traits.includes("swift") ? 1.15 : (traits.includes("careful") ? 0.9 : 1.0),
  workDurationMultiplier: traits.includes("efficient") ? 0.8 : (traits.includes("careful") ? 1.2 : 1.0),
  weatherSpeedPenaltyMultiplier: traits.includes("hardy") ? 0.5 : 1.0,
  socialDecayMultiplier:         traits.includes("social") ? 0.4 : 1.0,
  moraleDecayOnDeathMultiplier:  traits.includes("resilient") ? 0.5 : 1.0,
},
```

### Step 2 — Wire `hardy` weather-speed modifier in WorkerAISystem
**File:** `src/simulation/npc/WorkerAISystem.js`

Find the movement-speed calculation block that applies a weather penalty
(storm/rain multiplier). Multiply the penalty delta by
`worker.preferences.weatherSpeedPenaltyMultiplier ?? 1.0` before applying.

### Step 3 — Wire `social` decay multiplier in WorkerAISystem
**File:** `src/simulation/npc/WorkerAISystem.js`

At lines 1069-1070 (social decay tick), apply:
```js
const decayMultiplier = worker.preferences?.socialDecayMultiplier ?? 1.0;
const socialDelta = nearbyWorkers > 0
  ? 0.005 * nearbyWorkers
  : -0.003 * decayMultiplier;
```

For the social-gain-to-nearby bonus: when a `social` worker is present in the
nearbyWorkers scan, add `+0.003 * dt` to each counted neighbour's social stat
(cap total delta per tick at `0.008`).

### Step 4 — Wire `resilient` morale-on-death multiplier
**File:** `src/simulation/lifecycle/MortalitySystem.js` and/or
`src/simulation/npc/WorkerAISystem.js` (wherever witness-death morale penalty
is applied)

Locate the morale-decrease call triggered by witnessing a death or by grief
memory entries. Multiply the penalty magnitude by
`worker.preferences?.moraleDecayOnDeathMultiplier ?? 1.0`.

### Step 5 — Build the demo WHISPER fallback text engine
**File:** `src/simulation/ai/llm/PromptBuilder.js`

Add `buildDemoWhisperEnvironmentFallback(summary)` and
`buildDemoWhisperPolicyFallback(summary)`. These functions extend the existing
fallback logic with:

- A scenario-phase keyed prose bank (4-6 entries per phase: `logistics`,
  `stockpile`, `stability`, `default`). Entries are full natural-language
  sentences rather than phrase fragments. Example for `logistics` phase with
  broken routes:
  `"The relay chain is your critical path right now — one gap in the bridge
  network freezes every downstream delivery. Get that crossing rebuilt before
  the frontier outposts run dry."`
- Selection: `Math.floor((timeSec / 45) % bank.length)` — cycles through the
  bank on a ~45-second cadence, producing perceived variety without needing RNG.
- The returned object sets `model: "local-demo"` and `fallback: false`.

### Step 6 — Route demo fallback through LLMClient
**File:** `src/simulation/ai/llm/LLMClient.js`

Add a new gate: when `enabled === true` but the proxy request fails (the catch
block, lines 136-156 / 210-229), call `buildDemoWhisperEnvironmentFallback` /
`buildDemoWhisperPolicyFallback` instead of the basic `buildEnvironmentFallback`
/ `buildPolicyFallback`. Set `fallback: false` and `model: "local-demo"`.

Additionally: change the short-circuit branch (`if (!enabled)` at line 87 /
line 160) to remain as-is for `enabled === false` (true autopilot off), but add
a new `enabled-demo` sub-branch: if `enabled === true` AND
`AI_CONFIG.demoModeEnabled === true` (new config flag, default `true`), call the
demo fallback immediately rather than attempting the proxy. This means players
who launch without a proxy immediately see WHISPER-mode output.

### Step 7 — Add `demoModeEnabled` flag to AI_CONFIG
**File:** `src/config/aiConfig.js`

```js
demoModeEnabled: true,   // show local-demo WHISPER text when proxy is absent
```

### Step 8 — First-launch toast for demo mode
**File:** `src/ui/hud/storytellerStrip.js` or `src/app/GameApp.js`

Emit a single `pushWarning(state, "Story Director: online in offline demo mode — connect a proxy for live AI", "info", "demo-whisper-once")` on the first decision tick where `model === "local-demo"` and no prior toast has fired (`state.ai.demoToastShown` guard). This explains to the player what they are seeing without breaking immersion.

### Step 9 — Update EntityFocusPanel to surface trait effects
**File:** `src/ui/panels/EntityFocusPanel.js`

Below the existing `Traits: hardy, social` line, add a `Trait effects:` line
that reads `preferences` and renders only non-trivial modifiers:

```
Trait effects: weather-resilient (×0.50 storm penalty) | slow social decay (×0.40)
```

This closes the loop between the reviewer's "I see traits but can't feel them"
observation and the new mechanical values.

### Step 10 — Tests
**File:** `test/trait-mechanics.test.js` (new) and `test/demo-whisper-fallback.test.js` (new)

`trait-mechanics.test.js`:
- Assert `preferences.weatherSpeedPenaltyMultiplier === 0.5` for a worker
  created with `traits = ["hardy"]`.
- Assert `preferences.socialDecayMultiplier === 0.4` for `traits = ["social"]`.
- Assert `preferences.moraleDecayOnDeathMultiplier === 0.5` for `traits = ["resilient"]`.
- Assert workers without those traits have the multiplier at `1.0`.

`demo-whisper-fallback.test.js`:
- Assert `buildDemoWhisperEnvironmentFallback(summary)` returns
  `fallback: false` and `model: "local-demo"`.
- Assert the returned summary text is not one of the five fixed DIRECTOR strings.
- Assert that across 5 different `timeSec` values, at least 2 distinct summary
  strings are produced (cycle variety check).

---

## 7. Risks and Verification

### R1 — Demo WHISPER text quality regression
**Risk:** Low-quality demo text makes the WHISPER path look worse than DIRECTOR,
reversing the differentiation goal.
**Mitigation:** Write at minimum 4 distinct entries per scenario phase. Have
each entry reference a concrete colony state signal (broken routes, food level,
weather, day count) drawn from the `summary` object — not a generic string.
**Verification:** Manual playtesting in each of the 6 scenarios at the 3
scenario phases. Pass criterion: the WHISPER text visibly references something
that is true about the current colony.

### R2 — Trait multiplier balance
**Risk:** `weatherSpeedPenaltyMultiplier: 0.5` may make `hardy` workers
significantly over-powered in storm scenarios, distorting food delivery balance.
**Mitigation:** The multiplier only affects the penalty delta (not base speed),
so the maximum effect is halving the storm slowdown, not removing it. Run the
existing `long-horizon-bench` against a storm-heavy scenario with the change;
DevIndex should not change by more than ±4%.
**Verification:** `node --test test/*.test.js` full pass; benchmark comparison
before/after.

### R3 — `social` neighbour-boost creating positive feedback loop
**Risk:** A cluster of `social` workers near each other could drive all workers'
social stats to the cap, eliminating social differentiation.
**Mitigation:** Cap the bonus-to-neighbours at `+0.003 * dt` per `social` worker
present (not cumulative across multiple `social` workers in range). The
existing `clamp(0,1)` is already in place.
**Verification:** Unit test asserting that social stat for a non-social worker
capped at `0.98` does not exceed `1.0` after 100 ticks with 3 social workers
adjacent.

### R4 — Demo WHISPER mode masking real LLM errors
**Risk:** If `demoModeEnabled: true` silently swallows proxy errors, operators
who have configured a proxy won't notice when the proxy is down.
**Mitigation:** `state.ai.lastEnvironmentError` should still capture the real
error string from the failed proxy attempt. The demo fallback activates as the
content delivery path, but the error is preserved for the DeveloperPanel and
the `whisperBlockedReasonDev` diagnostic string.
**Verification:** Developer Panel `AI:` line should show the proxy error even
when demo text is displayed in the storyteller strip.

### R5 — `enableByDefault: false` should remain false
**Risk:** Changing `enableByDefault` to `true` causes all sessions to attempt
LLM calls, creating noise in error logs for users without API keys.
**Mitigation:** Do NOT change `enableByDefault`. The demo path is gated on
`demoModeEnabled: true`, which is a separate flag that only controls local text
generation — no network calls are made. The distinction: `enabled` controls
whether the proxy is contacted; `demoModeEnabled` controls whether local demo
prose replaces the basic fallback when the proxy is absent or fails.

### Verification checklist

- [ ] `node --test test/*.test.js` — all 867 tests pass (865 + 2 pre-existing
  skips) plus new trait-mechanics and demo-whisper-fallback tests.
- [ ] Launch game without API key configured: storyteller strip shows `WHISPER
  (local-demo)` within 30 seconds of scenario start.
- [ ] Demo text is not one of the five DIRECTOR strings.
- [ ] First-launch toast fires once and not again on subsequent ticks.
- [ ] Open EntityFocusPanel on a `hardy` worker — "Trait effects" row is visible.
- [ ] Open EntityFocusPanel on a non-hardy worker in same storm scenario — speed
  stat differs visibly from the hardy worker after 60 seconds of storm.
- [ ] DeveloperPanel AI line still shows proxy error string when demo mode is
  active and no proxy is configured.
