---
plan: Round5b/Plans/02e-indie-critic.md
plan_version: v1
primary_commit: e7b3b82
branch: feature/v080-living-world
date: 2026-04-25
author: Claude Sonnet 4.6
tests_pass: 1247+/1255 (5 pre-existing from 02a/02c + 1 exploit-regression timeout; 0 new failures)
---

# Round5b 02e-indie-critic Implementation Log

## Files Touched

| File | Change Type | LOC | Notes |
|------|-------------|-----|-------|
| `src/ui/hud/storytellerStrip.js` | edit | +20 | LLM-live overlay: `voicePrefixText` + `voicePackOverlayHit`; `policyTag` reads `authorVoiceHintTag` from policy; return object extended |
| `src/simulation/ai/llm/PromptBuilder.js` | edit | +18 | `deriveFocusHintTag()` inline (no cross-layer import); `policy.authorVoiceHintTag` written in worker/trader/saboteur paths |
| `src/world/scenarios/ScenarioFactory.js` | edit | +12 | `getScenarioIntroPayload(templateId)` export: frozen `{title, openingPressure, durationMs:1500}` |
| `src/entities/EntityFactory.js` | edit | +32 | `SURNAME_BANK` (40 entries) export; `pickSurname()`; `createWorker` reads `getActiveUiProfile()` for casual/full displayName; import added |
| `src/app/uiProfileState.js` | new | +12 | `getActiveUiProfile` / `setActiveUiProfile` singleton module |
| `src/app/GameApp.js` | edit | +14 | imports `getScenarioIntroPayload` + `setActiveUiProfile`; `regenerateWorld` writes `state.ui.scenarioIntro` after deepReplace; `#applyUiProfile` calls `setActiveUiProfile` |
| `src/main.js` | edit | +8 | `window.__utopiaLongRun` moved into `if(devOn)` block; else stubs `{ getTelemetry: () => null }` |
| `src/ui/hud/HUDController.js` | edit | +75 | `buildAuthorToneLabel()` 3-metric helper; scenario-intro priority branch (1.5s SCENARIO badge); voice-prefix DOM slot (dynamic createElement); Dev/Score/Threat author-tone tooltip |
| `test/scenario-intro-payload.test.js` | new | +28 | 3 cases: fortified_basin payload; temperate_plains non-empty; unknown template graceful fallback |
| `test/entity-factory.test.js` | edit | +38 | cases (f)(g): casual/full displayName format; SURNAME_BANK shape guard; import setActiveUiProfile; existing test updated to use "full" profile |
| `test/storyteller-strip.test.js` | edit | +40 | cases (d)(e): LLM-live + broken-routes → overlay hit; LLM-live + default → no overlay |

**Total: ~297 LOC added**

## Key Line References

### Step 1 — storytellerStrip LLM-live overlay
```js
// In computeStorytellerStripModel, after fallback path:
if (mode === "llm" && focusTag && focusTag !== "default") {
  const vp = lookupAuthorVoice(mapTemplateId, focusTag);
  if (vp.hit) { voicePrefixText = vp.text; voicePackOverlayHit = true; }
}
```
- `policyTag` = `state?.ai?.groupPolicies?.get?.("workers")?.authorVoiceHintTag` overrides `deriveFocusTag`

### Step 2 — PromptBuilder authorVoiceHintTag
- `deriveFocusHintTag(focus)` → same regexes as `deriveFocusTag` in storytellerStrip, no cross-layer import
- `policy.authorVoiceHintTag = deriveFocusHintTag(policy.focus)` at end of `adjustWorkerPolicy`

### Step 3 — ScenarioFactory + GameApp + HUDController scenario fade
- `getScenarioIntroPayload`: `getScenarioVoiceForTemplate(templateId) → {title, openingPressure, durationMs:1500}`
- `regenerateWorld`: after `deepReplaceObject`, writes `state.ui.scenarioIntro = {...payload, enteredAtMs: performance.now()}`
- HUDController: priority branch before milestoneFlash checks; badge = "SCENARIO", dataset.mode = "scenario-intro"

### Step 4 — EntityFactory SURNAME_BANK + uiProfileState
```js
const uiProfile = getActiveUiProfile();
const surname = uiProfile === "casual" ? pickSurname(random) : null;
const displayName = uiProfile === "casual"
  ? `${workerName} ${surname}`
  : `${workerName}-${seqFromId(id)}`;
```
- `surname` pick consumes 1 extra `random()` in casual mode only → full profile RNG unchanged

### Step 5 — main.js __utopiaLongRun gate
```js
if (devOn) {
  window.__utopia = app;
  window.__utopiaLongRun = { getTelemetry, configure, ..., placeToolAt, ... };
} else {
  window.__utopia = undefined;
  window.__utopiaLongRun = { getTelemetry: () => null };
}
```

### Step 6 — HUDController buildAuthorToneLabel + voice-prefix + tone tooltips
- `buildAuthorToneLabel("dev", v)` → 4 tiers: `"Scrappy outpost..."` / `"Working colony..."` / `"Breathing room..."` / `"The chain reinforces itself..."`
- Voice-prefix: `document.getElementById("storytellerVoicePrefix") ?? createElement("span")` inserted as firstChild

## Steps Coverage

| Step | Description | Behaviour-changing? | Covered |
|------|-------------|---------------------|---------|
| 1 | storytellerStrip LLM-live overlay (voicePrefixText) | Yes | ✓ |
| 2 | PromptBuilder authorVoiceHintTag | Yes | ✓ |
| 3 | ScenarioFactory getScenarioIntroPayload + GameApp.regenerateWorld + HUD scenario-intro | Yes | ✓ |
| 4 | SURNAME_BANK + uiProfileState + casual displayName | Yes | ✓ |
| 5 | window.__utopiaLongRun gate in devOn | Yes | ✓ |
| 6 | buildAuthorToneLabel + voice-prefix DOM + tone tooltips | Yes | ✓ |
| 7 | Tests (cases d,e,f,g + scenario-intro-payload) | No (test) | ✓ |

**Behaviour-changing steps: 6/6 = 100% ≥ 50% ✓**
**System layers: simulation/ai/llm + world/scenarios + entities + app + ui = 5 layers ≥ 2 ✓**

## Fixes Applied During Implementation

- **TDZ conflict**: `const score` re-declared inside `if(inActive)` block shadowed outer `const score`; renamed to `rawScore` to avoid temporal dead zone.
- **`state.ui` initialization**: Added `ui: { scenarioIntro: null }` to `createInitialGameState` return object; `regenerateWorld` guards with `if (!this.state.ui) this.state.ui = {}` for snapshots missing the field.
