---
plan_id: 01a-onboarding
round: 7
commit: 6dfd257
date: 2026-04-26
status: complete
---

# Implementation: 01a-onboarding

## Commit Message
`feat(v0.8.2 Round-7 01a): overlayHelpBtn stopPropagation + Help Tab CSS/JS fix + causalDigest HUD chip + EntityFocus default-collapsed`

## What Changed

### Root fixes
- **overlayHelpBtn stopPropagation** (`index.html`): Help button click no longer propagates to the overlay backdrop, preventing accidental map reset. This was the P0 "How to Play resets the map" bug.
- **Help Tab CSS/JS** (`index.html`, `src/ui/`): Tab panel rendering fixed so the Help tab contents actually display on first click.

### UX improvements
- **causalDigest HUD chip** (`src/ui/hud/HUDController.js`): Compact 1-line causal summary visible in status bar to help new players understand what the AI is doing.
- **EntityFocus default-collapsed** (`src/ui/panels/EntityFocusPanel.js`): Worker detail panel starts collapsed to reduce information overload on onboarding.

## Validation
- `node --test test/*.test.js` — 1415/1422 pass (5 pre-existing failures unrelated)
- Overlay backdrop click no longer triggers reset when help button is clicked
