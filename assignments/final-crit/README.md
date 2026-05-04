# Project Utopia — Final Crit Materials

**Date**: Monday, May 4, 2026
**Format**: 5–8 minutes per group + live 2-min Q&A
**Project**: Project Utopia (`https://github.com/DaizeDong/Project-Utopia`)
**Author**: Daize Dong (NetID dd1376) — solo project

## Files in this folder

| file | purpose |
|---|---|
| `README.md` | this index |
| `PRESENTATION-SCRIPT.md` | **timed speaking script** (~7 min, line-by-line) |
| `TWO-PILLARS.md` | deep-dive on Pillar 1 (NPC AI) + Pillar 2 (Pathfinding & Navigation) with code refs |
| `DEMO-PLAN.md` | live-demo path + pre-recorded video shot list (safe-fallback) |
| `Q&A-PREP.md` | 12 anticipated questions + answers for the live 2-min Q&A |
| `KEY-METRICS.md` | numbers to cite — DevIndex, tests, commits, FPS, balance values |
| `SLIDE-OUTLINE.md` | 10-slide outline if you want slides instead of pure speaking |

## Time-budget overview (7 min target)

| segment | time | content |
|---|---|---|
| Intro + how-it-works | 1:30 | What it is, demo image, who plays it |
| **Pillar 1: NPC AI** | 2:00 | a1.md Behavior-Tree → shipped PriorityFSM, code, demo |
| **Pillar 2: Pathfinding & Navigation** | 2:00 | A* + Boids hybrid + dual-search bridge interleave |
| Takeaways | 1:30 | Lessons + AI-coding insights |
| **Total** | **7:00** | + 2-min live Q&A |

## Pillar choice rationale

a1.md committed to **3 pillars**:
1. NPC AI / Behavior Trees ← pillar #1 in talk (strongest engineering work)
2. Swarm & Boids Modeling ← folded into Pillar 2 as "local steering"
3. Pathfinding & Navigation ← pillar #2 in talk (A* + Boids hybrid is genuinely novel)

Discussing both **NPC AI** (Pillar 1) and **A* + Boids hybrid** (Pillar 2) covers all 3 a1.md pillars while staying within "two CG pillars" rubric.

## Last-minute checklist (before walking in)

- [ ] Pull latest main: `git pull && git log -1 --oneline`
- [ ] `npm install` if any deps changed
- [ ] Local server up: `npx vite --host 127.0.0.1 --port 5173` + `node server/ai-proxy.js`
- [ ] AI proxy `/health` returns `hasApiKey: true`, `apiKeySource: env`
- [ ] Pre-record demo video as fallback (see `DEMO-PLAN.md`)
- [ ] Bring laptop charger
- [ ] Print or open `PRESENTATION-SCRIPT.md` on second device
- [ ] Read `Q&A-PREP.md` once cold for confidence
