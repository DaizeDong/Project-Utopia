---
round: 9
stage: C
date: 2026-04-26
status: IMPLEMENTED
---

# Round 9 Stage C - Implementation Summary

## Scope Landed

| Area | Files | Outcome |
|------|-------|---------|
| Storyteller readability | `src/ui/hud/storytellerStrip.js`, `index.html` | Removed duplicate `DIRECTOR` phrasing and added natural DOM text boundaries between badge, title, and summary. |
| AI automation boundary | `src/ui/panels/AIAutomationPanel.js` | Autopilot OFF now explicitly says live LLM calls are disabled while fallback/director summaries can still be visible. |
| Food-crisis guidance | `src/ui/hud/nextActionAdvisor.js`, `src/ui/interpretation/WorldExplain.js` | Advice now checks isolated farms/worksites and recommends reconnecting farm access, extending roads, adding warehouses, or placing reachable farms. |
| Runtime API contract | `src/main.js` | `window.__utopiaLongRun` remains available for non-dev smoke tests while `window.__utopia` stays dev-gated. |
| Event/progression cleanup | `src/ui/panels/DeveloperPanel.js`, `src/simulation/meta/ProgressionSystem.js` | Noisy building-destroyed log formatting is suppressed; emergency recovery messaging now has priority over same-tick depot milestones. |
| Test contract cleanup | multiple `test/*.test.js` files | Updated stale expectations for Autopilot copy, entity hitbox source guards, build-cost hard caps, and mood-output coupling. |

## Notes

- The build-cost implementation was briefly investigated but restored to the current production contract: beyond-cap costs may continue rising, while hard caps block placement where configured.
- Food guidance was kept inside existing advisor/explanation paths. No new building, tile, or economy mechanic was introduced.
- The automation boundary is intentionally explicit: Autopilot OFF means no live LLM control, but rule-based simulation directors and fallback summaries can still be displayed.

## Key Tests Added Or Updated

- `test/storyteller-strip.test.js`
- `test/hud-storyteller.test.js`
- `test/ai-automation-panel.test.js`
- `test/next-action-advisor.test.js`
- `test/hud-next-action.test.js`
- `test/world-explain.test.js`
- `test/ui/hud-autopilot-chip.test.js`
- `test/buildSpamRegression.test.js`
- `test/entity-pick-hitbox.test.js`
- `test/mood-output-coupling.test.js`
