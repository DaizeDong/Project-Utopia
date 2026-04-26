---
round: 9
stage: A
date: 2026-04-26
mode: orchestrator_visible_browser_review
verdict: NEEDS_TARGETED_FIXES
---

# Round 9 Stage A - Reviewer-Standard Review Summary

## Review Method

Round 9 did not run a new 10-reviewer blind panel. The user requested a strict reviewer-standard optimization pass, so the orchestrator performed a visible headed-browser review against the live Vite app and the AI proxy.

Primary artifact set:

| Artifact | Purpose |
|----------|---------|
| `output/playwright/Round9/round9-review-samples.json` | 180s visible-browser sample log |
| `output/playwright/Round9/round9-00-menu.png` | start screen confirmation |
| `output/playwright/Round9/round9-02-ai-log.png` | AI Log panel confirmation |
| `output/playwright/Round9/round9-long-4.png`, `round9-long-8.png`, `round9-long-12.png` | long-run checkpoints |
| `output/playwright/Round9/round9-final.png` | end of initial review run |

## P0 Findings

### P0-1 Storyteller text was visually present but machine-read as joined strings

The Storyteller strip rendered important state, but DOM text collapsed without separators. Browser extraction produced strings such as `MILESTONEDepot...` and `Broken Frontier - Temperate PlainsDIRECTORDIRECTOR picks...`.

Impact: assistive technology, test automation, and reviewer copy inspection all see malformed language even when the visual layout looks acceptable.

### P0-2 AI Log did not clearly separate Autopilot OFF from active LLM control

The AI Log contained useful decision surfaces, but while Autopilot was OFF it still showed fallback/director summaries. That made it easy to read the panel as "the LLM is controlling the run" even when no live LLM call was active.

Impact: the product concept depends on trust. If the player cannot tell which automation is rule-based, which is fallback, and which is live LLM/autopilot control, the AI surfaces are not reliable.

### P0-3 Food-crisis guidance still became too generic during long runs

In starvation states the next-action loop sometimes said only to stabilize food or add food production. It did not always connect the visible problem to the reachable-farm/worksite coverage chain.

Impact: the player can see food is zero, but still may not know whether to place a farm, reconnect an existing farm, extend roads, or build a warehouse.

### P0-4 Full-suite validation debt from Round 8 had to be closed

Round 8 ended with targeted tests green but `npm test` timed out. Round 9 review treated that as a blocker, not a soft warning.

Impact: without full-suite completion, UI improvements could be masking stale contracts or regressions.

## P1 Findings

### P1-1 Existing tests had stale expectations around current product contracts

Several failures were not product regressions but tests still asserting older copy or older contracts:

- Autopilot chip copy
- entity hitbox hardcoded source regex
- build cost escalator cap behavior
- mood-output coupling magnitude

### P1-2 Developer-facing event log noise still leaked low-value events

`BUILDING_DESTROYED` events could still enter the formatted developer/event log path, adding noise without player value.

### P1-3 Progression messaging priority could hide emergency recovery

Same-tick route/depot milestone detection and emergency recovery could compete. In the tested path, emergency recovery needed priority so the player sees the urgent survival message first.

## Stage B Priorities

1. Fix Storyteller DOM text boundaries and remove duplicate director wording.
2. Make AI Log and automation copy explicitly state whether live LLM calls are disabled, enabled, fallback-only, or Autopilot-owned.
3. Make food-crisis next actions concrete by checking reachable worksite/farm coverage before generic advice.
4. Resolve full-suite regressions, preserving current production contracts where tests were stale.
5. Re-run visible browser verification after fixes, including a long enough high-speed run to hit crisis conditions.
