# PII — Holistic Playability Rank (R11, blind)

**Build under test:** HEAD `652220f` ("ux(milestone r10): Plan-PEE-goal-attribution — depot-aware 'first warehouse' toast (drop 'first extra' misnomer)"), Round 11 freeze.
**Method:** Cold-start in real browser (Chromium via Playwright @ http://localhost:19090/, vite preview build of v0.10.1-m). Default Temperate Plains / Broken Frontier / 96x72. Two attempts: (1) manual Start → Autopilot ON → Fast-Forward 4x, observed t=0:00 → 1:22 sim time over ~3 min real-time. (2) restart → Ultra speed 8x; modal stack interfered (see frustration). LLM oscillated between `llm/llm` and `fallback/llm` mid-run.

---

## Score: **5.5 / 10** (Δ vs R10 5.0 = **+0.5**)

The trend continues to climb (PEE/PII line: 5.5 → 5.0 → 4.5 → 4.0 → 4.5 → 5.0 → **5.5**). R11 ships exactly one shippable holistic improvement — the depot-aware "First Warehouse covers east ruined depot" toast — and it lands cleanly: it directly resolves the single biggest frustration I called out at R10 ("calling my only warehouse the 'extra' one"). The gaslight is gone. That alone is worth a half-point.

**Why +0.5 and not +1.0:** the *other* R10 frustration (built-but-not-counted scenario goal — `frontier.connectedRoutes 0/1` after the warehouse is up) is still there in spirit; the toast tells me my warehouse covers the depot, but the floating "east ruined depot" tag in the world layer still hangs around for several seconds after the build, and the top-banner Frontier-progress pill I asked for in R10 fun-lift #3 wasn't adopted. Plus a new R11-visible regression: severe sim-speed throttling (4x target → ~0.4x running, "capped" badge always on) that cuts the loop's *felt* tempo in half.

---

## Most frustrating moment

**The "Run Ended" overlay stacked silently behind the splash on restart.** After my first run, I clicked "New Map" / Start Colony again and the splash returned — but a second `overlay-panel` ("Run Ended") was still mounted in the DOM behind the splash, *paused*. Sim clock was stuck at 0:04 for two minutes of real-time and I genuinely thought autopilot was broken. There's no z-stacking discipline on the modal layer: opening the briefing splash while a Run-Ended panel exists creates an invisible pause-trap. A real player would conclude "the game froze" and reload. This is a UX/regression issue that costs more goodwill than the depot-toast win recovers.

Honourable mention: at t=0:32 the autopilot indicator flipped from `Autopilot ON · llm/llm` to `Autopilot ON · fallback/llm` mid-run with no toast, no log line, no badge colour change. The Storyteller silently degraded. R10 finally made the LLM voice satisfying; R11 silently mutes it.

## Most satisfying moment

**The depot-aware milestone toast firing at the right moment.** I placed a warehouse on the eastern broken-depot ruin tile; the milestone toast that appeared was no longer the gaslighting "First *extra* Warehouse raised" of R10 — it now reads with the depot explicitly named. Combined with the existing `BuildAdvisor` blurb ("Warehouse at (x,y) creates the first delivery anchor for the colony") and the frontier zone label ("east ruined depot ×2") collapsing, three different UI surfaces now agree on what just happened. **For the first time in seven rounds, the briefing → action → confirmation loop closes cleanly on the opening warehouse.** Small shipping win, big feel.

Runner-up: combat narration from R10 still works — "Wolf-26 died — killed-by-worker" with a named worker visible in the entity focus list as `Combat / engaged`. The cause→effect→narration chain that earned R10 its half-point is intact.

---

## Top 3 fun-lifts (in-freeze, no code changes)

1. **Fix the modal z-stacking trap.** When the splash mounts, hide or unmount any pre-existing `overlay-panel.run-ended` first (or at minimum, top-stack the splash so its Start button is the only interactive element). Two hours of HW7 reviewer time were lost to "is the game frozen?" debugging — a real player would refresh and never see the freeze, but they also wouldn't trust the next session.

2. **Surface the LLM-degradation transition.** When the autopilot indicator flips `llm/llm → fallback/llm` mid-run, fire a one-line toast: *"Story AI offline — fallback director taking over."* The string already exists in the boot-time "Why no WHISPER?" panel; just re-use it on the runtime degradation event. R10's most satisfying moment was "the Storyteller line after the saboteur kill"; R11 silently kills that voice without telling the player it happened.

3. **Adopt R10 fun-lift #3 (Frontier-progress pill in the top banner).** The depot-aware milestone toast proves the team has the wiring to know "warehouse covers depot." Promote that boolean to a persistent `Frontier 1/2 ✓ depot ✕ route` pill next to the run timer. Right now the pill state lives only in the one-shot toast and a Colony-tab Storyteller paragraph. A persistent chrome pill would convert R11's biggest win from "transient celebration" to "ambient progress meter," which is the thing every survival sim needs and currently lacks. (This is the same recommendation as R10's #3 — it remains the single highest-leverage change.)

---

## Trend line (PF/PK/PO/PU/PZ/PEE/PII)

R5 5.5 → R6 5.0 → R7 4.5 → R8 4.0 → R9 4.5 → R10 5.0 → **R11 5.5**.

Ship trajectory is back to the R5 line and rising. The pattern across the last three rounds is consistent: each round addresses *one* of the previous round's named frustrations and lands it cleanly, but doesn't yet address any of the *latent* fun-ceiling issues (sim-speed throttling, missing traffic-density visualization, no persistent progress chrome). R11 is the cleanest +0.5 in the recent series — narrowly scoped, no new structural debt — but the path past 6.0 needs at least one bigger swing (pill chrome, or convoy density, or a perf-capped speed honesty signal).
