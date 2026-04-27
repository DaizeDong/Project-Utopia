---
round: 8
stage: B
priority: P0
status: ACCEPTED
---

# Starvation Diagnostics Plan

## Problem

Players can see hungry or dead workers but cannot tell whether the failure came from no food, no reachable warehouse, broken road/depot coverage, task timing, or an AI rejection.

## Changes

- Add a food diagnosis line to the worker focus panel.
- Prefer existing runtime evidence: reachable food debug state, nutrition source type, starvation seconds, death context, current food stock, and last feasibility rejection.
- Phrase every diagnosis as problem -> likely cause -> next action.
- Do not change eating behavior in this round; this is a visibility pass.

## Acceptance

- A hungry/starving worker panel explains the likely food access failure.
- A dead worker panel uses death context when available.
- The copy suggests concrete fixes such as reconnect roads/depots, rebuild food production, or restore warehouse access.
