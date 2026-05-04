# Demo Plan

Two parallel tracks — pick one based on confidence. **Recommendation: pre-record video; if AV setup is reliable in the classroom, switch to live**.

---

## Track A — Live demo (high reward, medium risk)

### Pre-flight (run 30 min before talk)

1. `cd "C:\Users\dzdon\CodesOther\Project Utopia"`
2. `git pull && git log -1 --oneline` — confirm at expected HEAD
3. `npm install` if last touched
4. Two terminals running:
   - Terminal A: `npx vite --host 127.0.0.1 --port 5173`
   - Terminal B: `node server/ai-proxy.js`
5. `curl http://127.0.0.1:5173` → 200; `curl http://127.0.0.1:8787/health` → `hasApiKey: true`
6. Open Chrome, navigate `http://127.0.0.1:5173/?dev=1` — confirm splash, dev tools card visible in Settings
7. Screen-share the browser, NOT the terminal

### Live demo flow (matches PRESENTATION-SCRIPT.md timing)

| §1 (Intro) | t+00:00 → t+01:30 |
|---|---|
| 0:00 | splash visible during opening line |
| 0:30 | regen to **Archipelago Isles** (better water/bridge story for §3) |
| 0:50 | click Start Colony — game loads, agents visible |
| 1:00 | click on a worker — Inspector opens |
| 1:20 | open AI Log briefly, point at Director Timeline |

| §2 (Pillar 1: NPC AI) | t+01:30 → t+03:30 |
|---|---|
| 1:30 | back to game; Inspector still showing FSM state |
| 2:00 | click on different worker, show different state |
| 2:30 | speed up to 4×, watch FSM transitions in real-time |
| 3:00 | (optional, if time) `?dev=1` → +5 Predators near workers → watch FIGHTING preempt |

| §3 (Pillar 2: A* + Boids) | t+03:30 → t+05:30 |
|---|---|
| 3:30 | speed back to 1× |
| 4:00 | place a Road blueprint that crosses water — watch bridge auto-included |
| 4:30 | press `L` for Heat Lens — show worker convoys/pressure |
| 5:00 | (optional) press `T` for Terrain overlay — show fog of war + revealed area |

| §4 (Takeaways) | t+05:30 → t+07:00 |
|---|---|
| 5:30 | game still visible in background; speak to camera |
| 6:30 | open `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` in editor briefly to show the 13-round trail |
| 7:00 | close out, "questions?" |

### Live failure modes & recovery

- **AI proxy unreachable at start** → fallback director will run; everything still works, just no LLM-tagged decisions visible. Comment "I'm running in fallback mode now to keep things deterministic" — sounds intentional.
- **Browser slow to start** → already loaded splash from pre-flight; just F5 reload to fresh state.
- **Worker stuck / colony wipes during talk** → "and that's exactly the kind of regression my 13-round review loop catches — let me show you the BUILDER-stuck story I mentioned." Pivot to Inspector + AI Log.
- **Chrome crashes** → say "as luck would have it, here's the pre-recorded video" — switch tracks (see Track B).

---

## Track B — Pre-recorded video (low risk, lower reward)

### Recording setup

- OBS Studio or Win+G screen recorder
- 1920×1080, 30fps, MP4
- Include 2 audio tracks: voice + system audio (system audio = silence currently, but track is ready for HW8)
- Keep cursor visible
- Record at 1× game speed; planner cuts to 4× during slower moments
- Target final cut: 6:00–6:30 (leave room for slate + 2-min Q&A)

### Shot list (mirrors PRESENTATION-SCRIPT.md beats)

1. **0:00–0:10** — slate: "Project Utopia | Daize Dong dd1376 | CG pillars: NPC AI + Pathfinding"
2. **0:10–1:30** — Intro: splash → Start Colony → Inspector on a worker → AI Log glance
3. **1:30–3:30** — Pillar 1:
   - close-up of Inspector showing FSM state name
   - speed up, watch FSM state change in real-time on selected worker
   - dev panel `?dev=1` → +5 Predators → FIGHTING preempt visible
4. **3:30–5:30** — Pillar 2:
   - regen to Archipelago Isles
   - place road across water → bridge auto-included
   - L key → Heat Lens; T key → Terrain overlay; show fog
   - dev panel → +30 workers → Boids convoy on road visible
5. **5:30–6:30** — Takeaways:
   - cut to PROCESS-LOG.md briefly (13 rounds visible)
   - cut back to game
   - voice-over close: "questions?"

### Edit notes

- Cut all "loading…" pauses
- Add 1px text overlays for key terms ("PriorityFSM", "Dual-search A*", "Boids dampening")
- Final 5 seconds: blank slate with NetID + project URL for examiner reference

### Upload checklist

- [ ] Recorded
- [ ] Edited to ≤ 6:30
- [ ] Captions burned in (good for accessibility)
- [ ] Uploaded to YouTube (unlisted) OR a Google Drive link
- [ ] URL added to `assignments/homework7/Demo-Video-Plan.md`
- [ ] URL added to README.md "submission" line

---

## Track C — Hybrid (recommended)

1. Open with **2 minutes of live demo** (just §1 — splash + Inspector + click around) — proves it works
2. Cut to **pre-recorded video for §2 + §3** (the technical demos that need precise timing)
3. Close with **live takeaways** + open game on screen as background while talking

This gives the energy of live + the safety of recorded for the parts where things can break.
