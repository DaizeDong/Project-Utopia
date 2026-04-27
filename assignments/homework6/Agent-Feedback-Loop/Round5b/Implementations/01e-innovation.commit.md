# 01e-innovation — Implementation Log (Round 6)

**Commit:** 7c78ea3  
**Branch:** feature/v080-living-world  
**Date:** 2026-04-24  
**Suite result:** 1202 pass / 0 fail / 2 pre-existing skips (1204 total)

---

## Summary

All four plan deliverables are implemented and verified. The core simulation/UI logic (Steps 1–6 + 11 tests) was already committed in ancestor commit `54d3c4d` (feat round5b wave-1 01e-innovation). Commit `7c78ea3` adds the remaining wiring: HUDController DOM write for `#storytellerWhyNoWhisper`, GameApp panel registration, and index.html mount points.

---

## Files Touched

| File | Change | Key Lines |
|------|--------|-----------|
| `src/simulation/ai/brains/NPCBrainSystem.js` | policyHistory ring push (pure observer, post-pendingResult landing) | 349–381 |
| `src/entities/EntityFactory.js` | `ai.policyHistory: []` initialisation | ~635 |
| `src/ui/hud/storytellerStrip.js` | `diagnostic` sub-object + `whisperBlockedReason` in `computeStorytellerStripModel` | 456–495 |
| `src/ui/hud/HUDController.js` | tooltip `diagSuffix` + `#storytellerWhyNoWhisper` span update | 962–993 |
| `src/ui/panels/AIExchangePanel.js` | `renderErrorLogCard` helper (≤5 errored exchanges) + wired into `render()` | 27–49, 229–230 |
| `src/ui/panels/AIPolicyTimelinePanel.js` | New read-only panel class — renders policyHistory newest-first, 12-entry cap | 1–67 |
| `src/app/GameApp.js` | import + `new AIPolicyTimelinePanel` + `safeRenderPanel` registration | 11, 174–177, 491 |
| `index.html` | `#storytellerWhyNoWhisper` span (after storytellerStrip); Director Timeline `<details data-panel-key="ai-timeline">` with `#aiPolicyTimelinePanelBody` (before ai-insights card) | 1536–1540, 1942–1950 |
| `test/storyteller-strip-whisper-diagnostic.test.js` | 5 tests: all five badgeState → whisperBlockedReason mappings | — |
| `test/ai-policy-history.test.js` | 3 tests: empty init, 32-cap slice, dedup semantic | — |
| `test/ai-policy-timeline-panel.test.js` | 3 tests: empty copy, 3-entry order, >12 truncation | — |
| `CHANGELOG.md` | Round-6 01e-innovation unreleased entry | 1–46 |

---

## Deliverable Status

| Deliverable | Status | Commit |
|-------------|--------|--------|
| policyHistory ring (Step 2) | DONE | 54d3c4d |
| WHISPER diagnostic overlay — storytellerStrip model (Step 1) | DONE | 54d3c4d |
| WHISPER diagnostic — HUDController tooltip + span (Step 1) | DONE | 7c78ea3 |
| #storytellerWhyNoWhisper DOM span in index.html (Step 1) | DONE | 7c78ea3 |
| AIPolicyTimelinePanel class (Step 4) | DONE | 54d3c4d |
| AIPolicyTimelinePanel GameApp wiring (Step 4) | DONE | 7c78ea3 |
| #aiPolicyTimelinePanelBody in index.html (Step 4) | DONE | 7c78ea3 |
| AIExchangePanel errorLog card (Step 6) | DONE | 54d3c4d |
| 11 new tests (Step 7) | DONE | 54d3c4d |

---

## Benchmark Safety

- `state.ai.policyHistory` ring is a pure observer appended after the existing `pendingResult` landing block in NPCBrainSystem. No decision math, no policy content, no RNG touched. Benchmark bit-identical.
- All other changes are UI-layer (DOM writes + `innerHTML` renders). Zero simulation impact.

---

## Coverage Matrix (§4.12)

- F1 FIXED: WHISPER diagnostic tooltip — Step 1 (storytellerStrip + HUDController)
- F2 FIXED: Director decision visibility — Step 4 (AIPolicyTimelinePanel) + Step 2 (policyHistory)
- F5 FIXED: Director decision reason readable — Step 4 (timeline rows include focus + badgeState)
- F6 FIXED: LLM error log — Step 6 (AIExchangePanel renderErrorLogCard)
- F3/F4 FIXED (prior round): scenario-phase voice refresh via AUTHOR_VOICE_PACK (54d3c4d includes deriveScenarioPhaseTag + exportScenarioVoiceForHUD)
