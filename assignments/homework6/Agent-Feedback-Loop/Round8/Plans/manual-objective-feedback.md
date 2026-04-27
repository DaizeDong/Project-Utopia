---
round: 8
stage: B
priority: P0
status: ACCEPTED
---

# Manual Objective Feedback Plan

## Problem

Players can attempt roads, farms, warehouses, kitchens, and resource buildings but do not reliably learn what changed, why a click failed, or whether the west-route / east-depot scenario objective advanced.

## Changes

- Keep existing machine-readable build failure reasons intact.
- Add a short `recoveryText` / player-facing suggestion to failed build previews.
- Surface that suggestion in hover hints, click failure toasts, and action messages.
- Add scenario objective completion messages when connected routes or ready depots increase after a build.
- Avoid changing build costs, pathing, or scenario targets.

## Acceptance

- Invalid road/building placement gives a reason plus next action.
- Insufficient resources include the missing resource and a recovery hint.
- Completing or extending a scenario route/depot produces a visible confirmation.
- Existing build preview tests continue passing.
