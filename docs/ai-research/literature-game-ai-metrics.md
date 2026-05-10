# Literature Survey — Game-Playing AI Evaluation Methodology

**Status:** Draft v1 (2026-05-10)
**Scope:** 5 RL/game-AI flagship papers (AlphaStar, OpenAI Five, Pluribus, FTW Capture-the-Flag, OpenSpiel)
**Companion to:** `literature-metrics-survey.md` (15 LLM-benchmark papers), `experimental-design.md`, `benchmark_proposal.md`
**Cited from paper §4 (metrics) — these are NOT LLM benchmarks, but their evaluation methodology (Elo/TrueSkill, professional-rank baselines, league-style robustness, AIVAT variance reduction) is the prior art for "how do you measure long-horizon agent strategy".**

---

## 1. AlphaStar — Vinyals et al., *Nature* 575 (2019)

- **URL:** https://www.nature.com/articles/s41586-019-1724-z
- **Game / domain:** StarCraft II (full game, all 3 races: Terran, Protoss, Zerg). 1v1 real-time strategy, partial observability, ~10–20 min/game, ~10²⁶ action sequences.
- **Skill measurement:** Two complementary axes. (a) **Battle.net online MMR** — agent plays anonymous ranked ladder games against humans; resulting MMR places it relative to the official Blizzard rank distribution. AlphaStar Final achieved **Grandmaster (GM) for all 3 races, above 99.8% of officially ranked human players** (the abstract's headline number). (b) **Internal Elo** within the league of agents — used during training to track relative agent strength. Elo is the standard chess formula `E_A = 1/(1+10^((R_B−R_A)/400))`.
- **Hierarchical evaluation:** Yes, two layers. (i) Internal **payoff matrix** (Extended Data Fig. 8) splits agents into *main agents*, *main exploiters*, *league exploiters* — main agents must beat the entire league, exploiters specialize in finding holes. The matrix shows transitive structure among main agents but **~3,000,000 rock-paper-scissor cycles among exploiters** — i.e. league learning intentionally maintains non-transitive sub-populations to stress-test the main agent. (ii) Macro-strategy (build orders, army composition) vs micro (APM-bounded unit control) — APM was capped to human-comparable rates (Extended Data Fig. 6) to factor out reflex from strategy.
- **Long-horizon coherence:** No single scalar; coherence is *inferred* from win-rate against expert humans, who can punish strategic incoherence over a 15-min game. Auxiliary methods: Z-statistics (build-order conditioning), supervised pretraining from 971k human replays to give the policy a reasonable prior.
- **Sample size / opponents:** Battle.net experiment — anonymous matchmaker over weeks; 90 final ranked games used for the GM claim (per race). Training league: 600+ distinct neural-net agents played each other for 44 days (~200 years of game time per race, in wall-clock-equivalent).
- **Cost / training compute:** **44 days on TPUs** for the league. Per-agent TPU cost not itemized in main paper but each agent was trained with **32 TPUv3 cores** for 44 days; total league = ~roughly 12,800 TPU-days equivalent.
- **Reproducibility:** Pseudocode, NN architecture, replays, and bnet.json released as Supplementary Data. **Weights NOT released.** Several open-source reimplementations exist (e.g. mini-AlphaStar) but full reproduction is impractical for academic budgets.
- **Implication for Project-Utopia §4:**
  - **League learning maps directly to E3 (multi-LLM matrix).** Project-Utopia evaluates 1 LLM at a time; AlphaStar evaluates a *population* of agents and reports the **best-response payoff matrix**. Worth introducing a lightweight version: for each prompt variant × LLM, compute the cross-payoff (agent A's RAE under prompt B's worldview) — this exposes the same kind of non-transitivity that league learning surfaced for AlphaStar.
  - **PFSP (prioritized fictitious self-play) opponent sampling** — AlphaStar samples opponents proportional to win-loss difficulty. This is a cheap way to *stratify* Project-Utopia's seeds by difficulty rather than uniform-random.
  - **GM = top 0.2% as oracle benchmark** — Project-Utopia can frame "scripted ColonyPlanner heuristic" as the equivalent of "top-X% reference policy" by computing a percentile of LLM runs that beat it.

---

## 2. OpenAI Five — Berner et al., arXiv:1912.06680 (Dec 2019)

- **URL:** https://arxiv.org/abs/1912.06680 / PDF: https://arxiv.org/pdf/1912.06680
- **Game / domain:** Dota 2 (5v5 MOBA, partial-info, 17 heroes, ~45-min games, continuous action space).
- **Skill measurement:** **TrueSkill** (Microsoft's Bayesian Elo extension; mean μ + uncertainty σ; rank ≈ μ − 3σ). Figure 3 plots TrueSkill over training. Calibration: **a TrueSkill difference of ~8.3 corresponds to an 80% win rate**. The headline claim — **defeated Team OG (TI8 world champions) 2-0 in best-of-three (April 2019)**; then **OpenAI Five Arena (April 18-21, 2019): 7,257 games vs 3,193 public teams, won 99.4%**. Only 29 teams managed to win even 1 game (42 wins total against Five).
- **Hierarchical evaluation:** Implicit. Long-horizon strategic skill probed by **horizon-of-discounting ablation** (§4.6): increasing γ-horizon from 60s to 360s monotonically improves win rate against the base agent — this is a *direct measurement of the value of long-horizon credit assignment*, which Project-Utopia §3 long-horizon-LLM claim should cite.
- **Long-horizon coherence:** Operationalized as **win rate as a function of training horizon** (the discount-factor curve). Plus the Arena's 99.4% win rate over **7,257 games of ~45 min each ≈ 5,400 hours of gameplay** is itself a long-horizon coherence proof.
- **Sample size / opponents:** 7,257 Arena games × 3,193 distinct opponent teams; 2 best-of-three games vs world champion. "Diverse" = no team played more than ~3 series; team composition draws from public matchmaker.
- **Cost / training compute:** **770 ± 50 PFlops/s-days of compute over 10 months** of wall-clock training (with restarts and "surgery" — checkpoint migration when env/model changed). Roughly 45,000 years of Dota self-play. Hardware: thousands of GPUs + tens of thousands of CPU cores.
- **Reproducibility:** Code/weights NOT released. Architecture diagram + hyperparams documented. The "surgery" tooling for resuming training across env upgrades is a methodological contribution.
- **Implication for Project-Utopia §4:**
  - **TrueSkill > Elo for low-sample regimes.** Each of Project-Utopia's E-experiments runs 5–25 seeds; TrueSkill's σ explicitly tracks small-sample uncertainty, which a raw Elo collapses. Recommend: when Project-Utopia compares LLM-A vs LLM-B head-to-head (e.g. on the same seed grid), report TrueSkill (μ, σ) rather than win-rate ± SE.
  - **Calibration anchor `TS difference ≈ 80% win rate` gives a clean readability handle.** Project-Utopia §4 currently reports raw Δ-RAE; a "TrueSkill-equivalent gap" sidebar (computed via Bradley-Terry) would let reviewers from the RL community read the table without translating units.
  - **Discount-horizon ablation (§4.6) is the prior art for E5 (long-context lost-in-the-middle).** OpenAI Five literally measured "how much does long-horizon credit-assignment matter?" by sweeping γ. Project-Utopia E5 sweeps **prompt-context history length**; the analogy is exact and should be cited.

---

## 3. Pluribus — Brown & Sandholm, *Science* 365 (2019)

- **URL:** https://www.science.org/doi/10.1126/science.aay2400
- **Game / domain:** Six-player no-limit Texas hold'em poker — multi-player imperfect-information.
- **Skill measurement:** **Milli-big-blinds per game (mbb/game)** — standard poker metric (1000 hands × big blind). Reported with 95% CI via one-tailed t-test. Headline: **5H+1AI: Pluribus won +48 mbb/game (SE 25), p = 0.028 over 10,000 hands × 12 days; 1H+5AI: +32 mbb/game (SE 15), p = 0.014.** Each human had won >$1M playing professionally.
- **Hierarchical evaluation:** Two-tier algorithmic structure — **blueprint strategy** (offline self-play via MCCFR) for Round 1, **real-time depth-limited search** for later rounds with k=4 continuation strategies. Evaluation is single-tier (mbb/game), but the *design* of Pluribus exposes the strategy/tactics decomposition that Project-Utopia mirrors with StrategicDirector → Tactical.
- **Long-horizon coherence:** A poker hand is short (~20s for Pluribus; ~40s for humans), but a **session of 10,000 hands over 12 days** is the long-horizon evaluation unit. Figure 5 plots cumulative mbb won per day — the **slope's stability over 12 days = absence of exploitable drift** ("the relatively steady performance suggests humans were unable to find exploitable weaknesses").
- **Sample size / opponents:** **5H+1AI: 10,000 hands among 13 elite pros (5 per session)**, alias-anonymized so opponents could track per-alias tendencies but not real identity. **1H+5AI: 5,000 hands × 2 humans (Chris Ferguson, Darren Elias)**.
- **Cost / training compute:** **Blueprint computed in 8 days on a 64-core server, 12,400 CPU-core hours, <512 GB RAM, ~$144 cloud cost.** Real-time play: 2 Intel Haswell E5-2695 v3 CPUs, <128 GB RAM, 1–33s/decision. **Massively cheaper than AlphaStar/OpenAI Five** — comparable to the Project-Utopia compute budget.
- **Reproducibility:** Pseudocode in supplement. **Code NOT released** (commercial-poker risk). Algorithmic novelty (Linear CFR + depth-limited search with k continuation strategies) is documented.
- **Implication for Project-Utopia §4:**
  - **AIVAT (Burch et al. 2018) — variance reduction is the killer technique here.** Poker has enormous luck variance (a strong player can lose for hundreds of hands by chance); AIVAT subtracts a baseline computed from the *strategy* (importance-sampling-style), turning a noisy estimator into a tighter one. **For Project-Utopia, the analogue is: each tick, subtract the *fallback policy's* value estimate from the LLM agent's score.** This is a Project-Utopia-original move, but it is *the same statistical idea*. Suggest naming this **"PolicyValue Baseline" (PVB)** in §4.5 and crediting AIVAT as prior art. Expected effect: **2–4× reduction in seed variance**, meaning E1–E7 could run with 5–8 seeds instead of 25 and still achieve significance — directly addressing the cost concern.
  - **mbb/game's per-game framing handles seed-stochasticity cleanly.** Project-Utopia currently reports DevIndex/RAE per-seed; framing as "*per scenario-day* mbb-equivalent" via PVB would let us aggregate across day-365 vs day-50 cleanly.
  - **Multi-player asymmetric profitability (different humans lose at different rates) — Pluribus reports per-opponent breakdown.** Project-Utopia should consider per-LLM × per-scenario breakdowns rather than averaging away the LLM × map interaction.

---

## 4. FTW (Capture the Flag) — Jaderberg et al., *Science* 364 (2019)

- **URL:** https://www.science.org/doi/10.1126/science.aau6249
- **Game / domain:** Quake III Arena — 3D first-person, 2v2 capture-the-flag, randomly generated maps every game. Pixels-only input (no privileged game state).
- **Skill measurement:** **Elo ratings** computed from a tournament against 40 human participants of mixed skill (recreational gamers and professional gamers). Result: **FTW agents achieved super-human Elo even when slowed to human reaction times**. (Critical caveat: human-ablated FTW with matched reaction time still beats humans, isolating *strategic* skill from *mechanical* speed — this is the FTW paper's signature methodological move.)
- **Hierarchical evaluation:** **Two-tier optimization**: (i) inner RL learner trains each agent's policy + internal reward signal (separate from the win/loss game-points signal), (ii) outer **PBT (Population-Based Training)** evolves agents' hyperparameters and reward weights against each other. Plus a tournament-style cross-evaluation grid.
- **Long-horizon coherence:** Not specifically targeted (CTF games are 5 min). However, CTF on procedurally generated maps tests **generalization across map distribution** — equivalent to Project-Utopia's "evaluate on unseen seed × map combination".
- **Sample size / opponents:** **Tournament with 40 human participants** of varied skill, including ablations with bot-augmented teams (FTW+human teammates). Thousands of parallel training matches in PBT.
- **Cost / training compute:** Hundreds of millions of training games via PBT; specific TPU/GPU figures not in main text. Order-of-magnitude similar to AlphaStar's league.
- **Reproducibility:** **Pseudocode + supplementary data released on Harvard Dataverse (DVN/JJETYE).** Quake III is open-source so the env is reproducible. Code/weights for the agent NOT released.
- **Implication for Project-Utopia §4:**
  - **Reaction-time-matched human evaluation is the fairness pattern Project-Utopia needs in §3.4.** Project-Utopia's LLM has unbounded "thinking time" between calls; a human commander would not. Consider an ablation: **clip LLM reasoning to a max-tokens budget that matches a human's per-tick deliberation** (~10s ≈ 200 tokens). This exposes whether the LLM advantage is strategic or just compute-deliberation.
  - **PBT is the inspiration for our E3 multi-LLM matrix.** PBT *evolves* the population; Project-Utopia *selects* from a fixed model menu — but the cross-evaluation and population-summary statistics (per-pair Elo, transitivity check) are directly portable.
  - **Procedural map generalization gap = Project-Utopia's 6 map templates.** FTW reports "performance on held-out map seeds"; we should report "RAE on held-out map_template × seed" (gen-gap), which is *not currently* in `experimental-design.md` E1–E9 but should be added.

---

## 5. OpenSpiel — Lanctot et al., arXiv:1908.09453 (2019, last revised Sep 2020)

- **URL:** https://arxiv.org/abs/1908.09453
- **Game / domain:** Framework, not a paper-with-headline-numbers. Supports n-player zero-sum / cooperative / general-sum, perfect/imperfect info, sequential/simultaneous, partially-observable grid worlds, social dilemmas. Bundled algorithms include CFR, DCFR, PSRO, NeuRD, MCTS, fictitious play, deep Q-learning, etc.
- **Skill measurement:** Provides analysis tooling rather than prescribing a single metric. Built-in: **NashConv / exploitability** (best-response gap to equilibrium), **Elo / α-rank** (game-theoretic ranking), **best-response value**, **regret-matching diagnostics**. α-rank in particular is OpenSpiel's distinctive contribution — robustly handles non-transitive games (rock-paper-scissor cycles) where Elo collapses.
- **Hierarchical evaluation:** Yes — explicitly supports learning-dynamics analysis (`policy_aggregator`, `replicator_dynamics`, `psro_v2`) on top of single-game win-rate. PSRO (Policy-Space Response Oracles) iterates "find best response → add to population → recompute meta-game" — same conceptual structure as AlphaStar's league.
- **Long-horizon coherence:** Not domain-specific; framework provides the substrate.
- **Sample size / opponents:** N/A (framework).
- **Cost / training compute:** N/A (per-game, depends on user setup).
- **Reproducibility:** **Fully open source — Apache-2.0 license, GitHub `deepmind/open_spiel`.** This is the framework's contribution. Includes 70+ games, 30+ algorithms, Python/C++ bindings.
- **Implication for Project-Utopia §4:**
  - **α-rank and exploitability are the right tools for Project-Utopia's multi-LLM matrix when results are non-transitive.** If LLM-A beats LLM-B on map-X, B beats C on Y, C beats A on Z, plain Elo aggregation misranks. α-rank's stationary-distribution-on-Markov-chain formulation is robust to this. **Recommend: add an α-rank column to the §4 multi-LLM table.**
  - **OpenSpiel could be a future Project-Utopia integration target** — if Project-Utopia's harness exposed an OpenSpiel `Game` interface, the entire OpenSpiel algorithm zoo (PSRO, NashConv probes, MCTS as a *fallback policy*) becomes free baseline. Worth a paragraph in §6 "future work".
  - **NashConv / exploitability** is the formal version of "can a follow-up LLM exploit this LLM's strategy?" — directly answers the reviewer question "is your fallback strong enough that beating it is meaningful?"

---

## Cross-cutting Synthesis

### Q1 — Best method to evaluate "strategy-layer" capability across these 5?

**Winner: AlphaStar's league + payoff matrix, when budget allows.** It is the only method that simultaneously (a) measures absolute strength via humans (Battle.net MMR), (b) tracks relative robustness to *adversarial best-responses* via the league, and (c) exposes non-transitivity via the rock-paper-scissor cycle count. Pluribus is cleaner statistically (AIVAT + t-test) but assumes a fixed, well-known opponent population (elite human pros). FTW's reaction-time-controlled tournament is the right *fairness* pattern for human-vs-AI but doesn't scale to 1000s of model variants.

**For Project-Utopia's actual budget (no LLM training, fixed model menu):** the **lightweight league** is the right port — for each (LLM, prompt-variant) cell, run round-robin against (i) fallback policy, (ii) scripted oracle, (iii) other LLM cells, then build the payoff matrix. AlphaStar's analysis (Extended Data Fig. 8) becomes our §4.7 "robustness ablation".

### Q2 — AlphaStar PBT-league → Project-Utopia §2.3 multi-LLM matrix

The key insight: **a single best agent can be exploited; a population whose best agent has been *trained against exploiters* generalizes better.** Project-Utopia §2.3 currently treats "different LLMs" as independent rows. AlphaStar suggests a stronger framing: **explicitly construct LLM-A's prompt to be an *exploiter* of LLM-B's known failure modes**, then test whether LLM-A's win rate against the original LLM-B reveals strategic brittleness. This is a publishable contribution: "we find that prompting GPT-X to explicitly counter Claude's identified failure modes reduces Claude's RAE by Δ" — and conversely, the claim "our top model is GM-level" is much stronger if it has been trained-against / red-teamed by exploiters.

Concrete proposal for §2.3: each LLM gets a (i) **main prompt** (no opponent info), (ii) **exploiter prompt** (designed to counter another LLM's known weaknesses observed in pilot runs), (iii) report both the Battle.net-style headline and the league payoff matrix.

### Q3 — Pluribus AIVAT → Project-Utopia seed variance reduction

**Yes — AIVAT's core idea ports cleanly.** AIVAT works by subtracting the *expected value under the agent's own strategy* from the realized outcome, then adding back an unbiased correction. The variance reduction comes because the fixed-strategy baseline absorbs most of the dealing/board-card luck. The Project-Utopia equivalent:

- For each tick t in seed s with agent A, also evaluate the **fallback policy F**'s expected DevIndex contribution `V̂_F(state_t)`.
- Report **PVB-DevIndex(A,s) = realized DevIndex(A,s) − V̂_F(initial_state) + Σ_t [V̂_F(state_t after F) − V̂_F(state_t after A)]**.
- The variance of PVB-DevIndex is bounded by the variance of (A − F) actions only, *not* by the variance of map/event stochasticity.

**Expected payoff:** Pluribus reports AIVAT typically gives **2–10× variance reduction** in poker (variance dominated by deal). Project-Utopia's variance is dominated by raid-timing + weather + animal-pathfinding stochasticity, all of which the fallback policy also experiences. Conservative estimate: **2-3× variance reduction** → **3-5× fewer seeds for the same statistical power**, which is the difference between E1–E7 fitting in our compute budget and not.

This is arguably the highest-leverage finding from this survey — worth implementing before E1 runs at scale.

---

## Summary table — what to cite where

| Paper | §2 (Related) | §3 (Method) | §4 (Metrics) | §5 (Results) | §6 (Future) |
|---|---|---|---|---|---|
| AlphaStar | Yes (league learning) | — | Yes (PFSP, payoff matrix) | Yes (transitivity check) | — |
| OpenAI Five | Yes (long-horizon RL) | Yes (γ-horizon ablation analogy) | Yes (TrueSkill) | Yes (Arena = 7,257-game scale claim) | — |
| Pluribus | Yes (multi-player imperfect info) | Yes (blueprint+search ↔ Strategic+Tactical) | Yes (AIVAT → PVB) | Yes (mbb/game framing) | — |
| FTW | Yes (PBT) | Yes (reaction-time-matched fairness) | Yes (Elo + held-out map gen-gap) | — | — |
| OpenSpiel | Yes (framework) | — | Yes (α-rank, NashConv) | — | Yes (integration target) |
