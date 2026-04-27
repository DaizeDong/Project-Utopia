---
round: 8
stage: B
priority: P0
status: ACCEPTED
---

# Autopilot Plan Card Plan

## Problem

Autopilot is useful but feels dominant and opaque. Manual players see less feedback than players who let the director run.

## Changes

- Use the existing next-action HUD as the lightweight plan card.
- Prefix plan text with whether it is `Autopilot plan` or `Manual guide`.
- Include the current `whyNow` and `expectedOutcome` fields in the title/help copy.
- Avoid promising full manual ownership because background director systems may still react even when the AI toggle is off.

## Acceptance

- Autopilot-on players can see what the system plans to do and why.
- Autopilot-off players receive guidance without claiming the simulation is fully manual.
- No new DOM structure is required for this round.
