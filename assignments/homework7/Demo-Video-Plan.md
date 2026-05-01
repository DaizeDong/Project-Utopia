---
title: Project Utopia — Demo Video Plan
status: pending
target_length_minutes: 3
target_length_max_minutes: 4
platform: TBD (YouTube unlisted preferred; Vimeo acceptable)
recorded_against_build: TBD (fill with `git rev-parse --short HEAD` at record time)
date_created: 2026-05-01
---

<!-- This file is the *plan* for the demo video, not the video itself.
     When the recording is uploaded, replace `status: pending` with `status: published`
     and add a top-level `url:` field to the frontmatter, then mirror the URL into:
       - README.md § "Demo Video & Post-Mortem"
       - assignments/homework7/Post-Mortem.md § "Demo Video"
     Do NOT delete this file after publishing — it is the production-record. -->

## §1 Recording Window

- Target window: \<TBD by author\> (suggested: any clean session against the
  current `main` after Round 0 of the Final Polish Loop closes)
- Pre-flight checklist:
  - [ ] `git status` clean
  - [ ] `npm ci`
  - [ ] `npm run build`
  - [ ] `npx vite preview` opens in a fresh browser profile (no devtools, no extensions)
  - [ ] Resolution 1920×1080, 60 fps capture (OBS or equivalent)
  - [ ] Audio: lavalier or headset; ambient room silence; one take per shot

## §2 Shot List (3:00 target — pad to 3:30 if pillars need air)

| # | Time | Shot | Purpose / What the grader sees |
|---|------|------|-------------------------------|
| 1 | 0:00–0:15 | Title card + landing screen | "Project Utopia — HW7 final demo, build \<sha\>" |
| 2 | 0:15–0:30 | Click _Start Colony_, first 30s of game loop | Tile grid, workers spawning, basic motion |
| 3 | 0:30–1:15 | **Pillar A demo** | Live map editing → NPC reroute. Place a road, a wall, a building; show A* + Boids reacting. (See Post-Mortem.md §1 Pillar A.) |
| 4 | 1:15–2:00 | **Pillar B demo** | LLM-driven decisions visible in HUD: open _Developer Telemetry → AI Trace_, toggle live-LLM vs fallback if a key is configured, show the policy diff. (See Post-Mortem.md §1 Pillar B.) |
| 5 | 2:00–2:30 | Survival-mode end-state | Day cycle elapsed, DevIndex readout, raid escalator visible (if one fires); survival is the tangible win condition |
| 6 | 2:30–2:50 | Closing: brief tour of Inspector Panel + Heat Lens | Shows the "interpretable" half of A2's pitch |
| 7 | 2:50–3:00 | End card | "Code: \<repo URL\> · Post-Mortem: assignments/homework7/Post-Mortem.md" |

## §3 Voiceover / Text Overlay Decisions

- Voiceover: \<TBD — recommend voiceover over silent text, since Pillar B
  requires explaining what AI Trace lines mean\>
- Caption / overlay text on each shot: \<TBD\>
- Music: none (avoids copyright + makes voiceover legible)

## §4 Post-Upload Checklist

When the video is published, perform ALL of the following in one commit
(`docs(submission): demo video published`):

- [ ] Set `status: published` and add `url: https://...` to this file's frontmatter
- [ ] Replace the placeholder line in `README.md` § "Demo Video & Post-Mortem"
      with the live URL
- [ ] Replace the "pending" line at the top of
      `assignments/homework7/Post-Mortem.md` § "Demo Video" with the live URL
- [ ] Add a `[Demo Video]` row to `CHANGELOG.md` under the Final Polish Loop
      release entry
- [ ] Verify the video plays in incognito (i.e. unlisted/public, not "private")
- [ ] Confirm the recorded build sha matches the grader-facing tag
