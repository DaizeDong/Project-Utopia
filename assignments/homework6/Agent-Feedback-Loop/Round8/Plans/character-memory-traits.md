---
round: 8
stage: B
priority: P1
status: ACCEPTED
---

# Character Memory And Traits Plan

## Problem

Workers have names, traits, family links, births, deaths, and relationship events, but the focus panel still reads like temporary telemetry instead of durable character history.

## Changes

- Record important worker memories into a serializable capped `memory.history` array.
- Preserve existing `memory.recentEvents` behavior for compatibility.
- Add durable history for births, parenthood, death witnesses, and friendship memories.
- Display history before recent memory in the character panel.
- Replace vague trait descriptions with behavior-facing descriptions that match current code paths.
- Show child names in family text instead of only child counts.

## Acceptance

- Reopening a worker panel shows character history that outlives the immediate event tick.
- Family text names parents and children where available.
- Trait copy tells the player what the trait changes in practice.
