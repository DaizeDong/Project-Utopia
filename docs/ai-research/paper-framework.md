# Paper Research Framework — Project-Utopia

**Status:** Draft v1 (2026-05-10)
**Audience:** the project owner + 论文协作者
**Companion to:** `benchmark_proposal.md` (initial proposal), `refactor-plan.md` (codebase 7-phase refactor), `experimental-design.md` (E1–E9), `literature-metrics-survey.md` + `literature-game-ai-metrics.md` (30 prior-art papers)

> 这份是论文写作的总体框架。把 30 篇文献调研、9 个实验设计、当前代码状态合成为：(1) paper title + abstract draft、(2) 章节 outline + 每节的 contribution / evidence / figures、(3) 投稿时间线、(4) reviewer-anticipation 防御清单。

---

## 1. Pitch & Positioning

### 1.1 Tagline

**"A deterministic colony-simulation benchmark for LLM long-horizon planning, exposing low-rank schema-validated vector directives across four hierarchical decision channels."**

(每个加粗短语都在文献中可被反驳——论文 §2 要把每个的 prior art 全部引用并指出 gap。)

### 1.2 Three contribution claims (paper Abstract 三句话)

- **C1 — Architectural**: A 4-channel LLM action surface (environment / npc-policy / strategic / colony-agent) operating above a deterministic A*+Boids+seeded-RNG substrate, with schema validation + numerical guardrails making LLM outputs **bit-identical reproducible** under fallback mode.
- **C2 — Methodological**: A 4-layer metric stack — per-tick dimension plugins (RAE / GroupDynamics / MemoryDegradation / DTE / HierarchicalCoordination) → MeltingPot-style sandwich normalization → Crafter geometric mean → HELM Mean Win Rate — combined with Pluribus-AIVAT-style PolicyValue Baseline for 2–3× seed variance reduction.
- **C3 — Empirical**: 9 experiments across hierarchy, multi-LLM, memory, schema-failure, token efficiency, reproducibility — yielding novel findings: (a) hierarchical decomposition outperforms flat at matched token budget, (b) strong-environment + weak-policy LLM mix achieves near-strong-on-all RAE at 1/3 the cost, (c) Recall(t) × Drift(t) × Performance(t) decompose into three dissociable axes for the first time.

### 1.3 Position vs related benchmark families

| Family | Examples | What we share | What's distinct |
|---|---|---|---|
| Single-agent LLM tool-use | AgentBench, GAIA, WebArena, AgentBoard | Programmatic state oracle, schema validation | Hierarchy (4 channels), long-horizon sim, no-LLM fallback baseline免费 |
| LLM-in-game | Voyager, Generative Agents, SmartPlay, BALROG | Game environment, multi-axis metrics | Multi-resource flow allocation, deterministic substrate |
| Multi-agent LLM coord | ChatDev, MetaGPT, AgentVerse, CAMEL, Concordia | Role specialization, message passing | Heterogeneous-LLM-per-channel SS/SW/WS/WW matrix (not done by any of them) |
| Long-context | RULER, NIAH, InfiniteBench, LongMemEval, Lost-in-the-Middle | Memory probing | Action-grounded vs verbal recall decoupling, naturally accumulated context |
| MARL | MeltingPot 2, Crafter | Determinism, multi-seed | LLM as policy substrate (not flat RL) |
| Game-playing AI eval | AlphaStar, OpenAI Five, Pluribus, FTW, OpenSpiel | TrueSkill, league, AIVAT | Applied to LLM hierarchy not RL training |

### 1.4 Submission target

**Primary**: NeurIPS Datasets & Benchmarks Track (D&B)
- 截止时间：2026 年 6 月
- 审稿偏好：reproducibility kit、large-scale evaluation、明确 gap claim
- 要求：Datasheet for Datasets style 附录、Croissant metadata、reproducibility statement

**Secondary**: ICLR (next-cycle main track)
- 截止时间：2026 年 9 月
- 审稿偏好：methodological novelty、ablation depth
- 要求：reproducibility checklist

**Workshop fallback**: NeurIPS Foundation Models for Decision Making 或 ICML AI for Science
- 退路：如果实验不全则先投 workshop 拿 feedback

---

## 2. Paper Outline (target 10–12 pages + supplement)

### Abstract (200 words)

```
Existing LLM-agent benchmarks evaluate single agents in episodic tool-
use tasks (AgentBench, WebArena) or flat MARL policies in stateless
games (MeltingPot, Crafter), leaving the regime where LLMs operate as
hierarchical decision-makers above a deterministic substrate largely
under-evaluated — despite this being the canonical pattern in real
production agent systems. We introduce Project-Utopia, a deterministic
colony-simulation benchmark exposing four hierarchical LLM decision
channels (environment-director, npc-policy, strategic-plan, colony-
agent) above an A* + Boids + seeded-RNG substrate, with schema validation
and numerical guardrails ensuring bit-identical reproducibility under
fallback mode. We propose a four-layer metric stack combining per-tick
dimension plugins (Resource-Allocation Efficiency, Group Dynamics,
Memory Degradation, Decision Token Efficiency, Hierarchical Coordination)
with MeltingPot-style sandwich normalization and Pluribus-style variance
reduction. Across nine experiments evaluating seven LLM families on
five scenarios with ten seeds each (2,250 runs), we demonstrate
[KEY FINDING 1: hierarchical decomposition advantage], [KEY FINDING 2:
multi-LLM specialization], and [KEY FINDING 3: three-axis memory
degradation]. Project-Utopia is released with a Docker container, a
4-line reproducibility command, and a record-replay LLM cache.
```

### §1 Introduction (1.5 pages)

- Motivating example: the gap between current LLM-agent benchmarks and production hierarchical agents
- Concrete failure mode: AgentBench / WebArena single-agent tool-use does not capture allocation under conflicting hierarchical signals
- Three contributions C1/C2/C3 (from §1.2 above)
- Outline of paper structure

### §2 Related Work (1 page)

按 §1.3 的 6 个 family 各 1 段。引用前面 30 篇 + 5 篇游戏 AI = 35 papers 全部对应位置（见 `literature-metrics-survey.md` 的 §G "what to cite where" 表）。

### §3 Project-Utopia: Architecture (2 pages)

#### §3.1 Tick loop and 4 LLM channels (Figure 1)

- 描述 SimHarness 的 17-system tick order
- 4 channel 的 cadence + trigger + payload + response schema
- Reference: `src/benchmark/framework/SimHarness.js`, `src/simulation/ai/llm/AgentAdapter.js`

#### §3.2 Schema, guardrails, fallback (Figure 2)

- ResponseSchema.js 字段 + Guardrails.js 钳制范围
- Fallback policy = `Guardrails` default + 状态自适应规则 — 无 LLM baseline 免费
- LLM directive → group policy → entity FSM → A* target → Boids desiredVel 四层降维（已在 `experimental-design.md` 第 0.1 节有图）

#### §3.3 Determinism layer (with audit verification)

- `rng.js` seeded PRNG，AST-grep 扫描 `Math.random()` leaks (`tools/audit/rng-coverage-report.js`)
- A* + PathCache key `(faction, gridVersion, costVersion)`
- `audit:determinism` 工具：同 seed × 60 tick × 2 runs → identical hash `e360b76...` (verified 2026-05-09)

### §4 Metric Stack (2 pages)

按 `literature-metrics-survey.md §F` 的 4 层架构（图 3）:

```
Cross-model leaderboard       → HELM Mean Win Rate
↓
Per-dimension model compare   → Beta-Binomial per-seed-aggregated  
↓
Per-scenario score            → MeltingPot sandwich + Crafter geometric mean + AgentBoard Progress Rate
↓
Per-tick raw signal           → 5 dimension plugins + aiRuntimeStats
```

#### §4.1 Five dimension plugins

每个 plugin 一段，给公式 + reference 现有 src/benchmark/dimensions/ 对应文件。

#### §4.2 Sandwich normalization

`score_norm = (score_LLM − score_fallback) / (score_oracle − score_fallback)` (cite MeltingPot 2)
- R_random = `Guardrails` default policy（已实现）
- R_exploiter = ScriptedOraclePolicy（**待实现 ~200 LOC，论文 P0**）
- 允许 score > 1.0 表示超 oracle

#### §4.3 Geometric-mean composite (cite Crafter)

`RAE_composite = exp((1/4) Σ ln(1 + sᵢ)) − 1` over {food, wood, stone, herbs} sufficiency

#### §4.4 PolicyValue Baseline (PVB) — variance reduction (cite Pluribus AIVAT)

```
PVB-DevIndex(A, s) = realized DevIndex(A, s) − V̂_F(initial_state)
                     + Σ_t [V̂_F(state_t after F) − V̂_F(state_t after A)]
```

V̂_F = fallback policy's expected DevIndex contribution。预期 2–3× variance 缩减 → 3–5× seed 节省。

#### §4.5 Mean Win Rate for cross-model leaderboard (cite HELM)

`MWR_m = (1/|S|) Σ_s W_{m,s}` where `W_{m,s} = (1/(|M|−1)) Σ_{m'≠m} 1{score(m,s) > score(m',s)}`

#### §4.6 TrueSkill for low-sample multi-LLM cells (cite OpenAI Five)

(μ, σ) per cell；calibration anchor: TS difference 8.3 ≈ 80% win rate

#### §4.7 α-rank for non-transitive results (cite OpenSpiel)

stationary-distribution-on-Markov-chain ranking — robust 当 SS/SW/WS/WW 出现 rock-paper-scissor cycles

### §5 Experiments (4 pages)

按 `experimental-design.md` 的 E1–E9，每个实验半页：

#### §5.1 (E1) Hierarchical Decomposition is Necessary

- Hypothesis H1: hierarchical 4-channel > flat-baseline ≥ 0.10 RAE at matched token budget
- 40 runs × 2 scenarios × 10 seeds × 2 architectures
- **Figure 2**: bar chart RAE composite by architecture × scenario
- Effect-size target: ≥ ChatDev's −44% role-removal canonical delta

#### §5.2 (E2) Token Cost Decoupled from World Size

- H2: prompt_tokens/decision Pearson ρ < 0.20 with entity_count
- 25 runs × 5 world sizes × 5 seeds
- **Figure 3**: scatter tokens-per-decision vs entity-count, 4 channel lines flat

#### §5.3 (E3) Multi-LLM Director-Policy Matrix

- H3a: SW ≥ WW + 0.15 RAE; H3b: SW within 0.05 of SS at 1/3 cost
- 100 runs × 5 cells (FB/WW/SW/WS/SS) × 2 scenarios × 10 seeds
- **Figure 4**: 2×2 heatmap (env model × policy model) RAE / cost / DTE
- **Cite**: AgentVerse WW degradation prior art; AlphaStar league learning; ChatDev Quality formula
- Adversarial extension: exploiter prompts (cite AlphaStar)

#### §5.4 (E4) Multi-Resource RAE Gini × Sufficiency

- H4: stronger model → flatter Gini at matched sufficiency
- 120 runs × 4 model tiers × 3 scenarios × 10 seeds
- **Figure**: scatter sufficiency vs Gini, by model tier
- **Cite**: Crafter geometric mean; MineDojo programmatic eval

#### §5.5 (E5) Three-Curve Memory Degradation

- H5a-d: Recall(t) ↘, Drift(t) ↗ at t=2h, Performance lag ≥ 30 sim-min, lost-in-middle reproduction
- 60+27 runs × 4 length × 3 model × 5 seeds (24h subset deferred)
- **Figure 5**: three-curve plot Recall × Drift × Performance over sim-time
- **Figure 6**: lost-in-middle U-shape replication on Recall(t)
- **Cite**: LongMemEval Recall@k probe; Lost-in-the-Middle U-shape; OpenAI Five γ-horizon analogue

#### §5.6 (E6) Schema-Validated Failure Mode Profile

- H6: cross-family fingerprints distinct; 7B-tier reject rate ≥ 5× Opus
- 70 runs × 7 model × 2 scenarios × 5 seeds
- **Table 2**: failure mode matrix (schema / timeout / 429 / parse-fail) per family
- **Cite**: CAMEL failure-mode taxonomy

#### §5.7 (E7) Decision Token Efficiency

- H7a: Spearman ρ(RAE, DTE) < 0.7
- Reuse E6 logs + 15 cadence ablation runs
- **Figure 7**: Pareto plot RAE vs total tokens, DTE iso-curves; ranking inversion at 7B-tier
- **Cite**: MetaGPT Productivity = tokens/output

#### §5.8 (E8) Bayesian vs Frequentist Methodology

- H8: Bayesian ranking stability ≥ 30% better at N=5
- Post-hoc analysis on E1–E7 logs
- **Figure 8**: line plot ranking stability vs N seeds
- **Cite**: HELM Mean Win Rate as alternative; Crafter per-seed-then-aggregate ordering

#### §5.9 (E9) Reproducibility Verification

- 4 gates: short determinism / long determinism (7200 ticks) / container / multi-OS
- **Table 3**: reproducibility verification matrix
- **Cite**: MLE-Bench Docker pin + grading server; OSWorld VM snapshot revert; **novel**: record-replay LLM cache

### §6 Discussion (1 page)

- 三大发现的 implication（implication for production agent design）
- Failure modes observed (AgentVerse-style "weak collaboration hurts" 是否在 WW cell 复现)
- DTE 揭示的"7B 频繁调度 vs 70B 稀疏" Pareto 前沿对工业部署的意义

### §7 Limitations & Future Work (0.5 page)

- 当前未实现 partial observability 完整 ablation（虽 `VisibilitySystem` 在 codebase 但未挂出 toggle）
- LLM-on 模式 bit-identical 不可能，仅 distribution-level reproducible
- 24h memory harness 留 camera-ready
- v2+ 扩展（partial obs / RLHF / inter-LLM negotiation channel / domain transfer）

### §8 Reproducibility Statement (0.5 page)

按 NeurIPS D&B Datasheet for Datasets 模板：
- Provenance (forked from Project Utopia v0.10.0 colony sim)
- Composition (89 tests / 684 total / 4 LLM channels / 6 maps)
- Collection (refactor 7-phase log in `refactor-plan.md`)
- Recommended uses + limitations
- Maintenance (CHANGELOG.md, version pin, container shipping)

---

## 3. Figure / Table Inventory (final paper)

| ID | 类型 | 内容 | 来源数据 | 状态 |
|---|---|---|---|---|
| Fig 1 | Diagram | Architecture: 4 channel × deterministic substrate × dimension plugins | `experimental-design.md §0.4` 已有 ASCII；需 graphical 重画 | TODO |
| Fig 2 | Diagram | LLM directive → desiredVel 4-layer reduction | `refactor-plan.md §1.3` ASCII；需重画 | TODO |
| Fig 3 | Diagram | 4-layer metric stack | `literature-metrics-survey.md §F` ASCII；需重画 | TODO |
| Fig 4 | Bar chart | E1 hierarchical vs flat × scenario | E1 runs | TODO |
| Fig 5 | Scatter | E2 token-per-decision vs entity-count | E2 runs | TODO |
| Fig 6 | 2×2 heatmap | E3 SS/SW/WS/WW × RAE / cost / DTE | E3 runs | TODO |
| Fig 7 | Three-curve | E5 Recall × Drift × Performance over sim-time | E5 runs | TODO |
| Fig 8 | U-shape | E5d lost-in-middle replication | E5d runs | TODO |
| Fig 9 | Pareto | E7 RAE vs tokens, DTE iso-curves | E7 runs | TODO |
| Fig 10 | Line | E8 ranking stability vs N seeds | E8 post-hoc | TODO |
| Table 1 | Cross-model | E4 Gini × sufficiency by tier | E4 runs | TODO |
| Table 2 | Fingerprint | E6 failure mode matrix per model family | E6 runs | TODO |
| Table 3 | Verification | E9 reproducibility verification matrix | E9 runs | TODO |

---

## 4. Reviewer-Anticipation Defense Checklist

按预期 reviewer 问题归档，每项给 paper 内对应 paragraph 与防御策略：

| Reviewer Q | 出处 | Defense |
|---|---|---|
| "Why not just use [BALROG / AgentBench / WebArena]?" | 必问 | §2 + §1.3：他们都是 single-agent；Project-Utopia 唯一在 4-channel hierarchy 下做评估 |
| "Your 'first widely-available' claim is too strong" | E.g., Diplomacy / Voyager 反驳 | §1：收窄到 "first low-rank schema-validated vector directive at 3 nested cadences" |
| "Sample size 10 seeds 太少" | 必问 | §4.4：PVB 给 2–3× variance reduction → 等价 25–30 seeds |
| "fallback policy 太弱，这是 strawman baseline" | 强 reviewer 必问 | §3.2 fallback 是 production-grade state-adaptive policy，不是 random；§4.2 sandwich 用 oracle 上界 ground truth |
| "你的 LLM 跨平台不 bit-identical" | OSWorld/MLE-Bench style | §3.3 + §7: fallback 模式 bit-identical 已验证；LLM-on 用 record-replay cache + temperature=0 + 模型 snapshot ID |
| "Memory degradation 三曲线和 Lost-in-Middle 重复" | E5 必问 | §5.5: LiM 用合成 distractor + verbal recall；P-U 用自然 sim history + action-grounded recall |
| "Multi-LLM matrix 是 prompt engineering trick" | E3 必问 | §5.3 ablation: same prompt × different model 隔离 prompt confound；AlphaStar exploiter 实验作 robustness check |
| "DTE = (Δscore / tokens) 太简单，已是平均做法" | E7 | §5.7: 关键 claim 是 ρ(RAE, DTE) < 0.7（即 DTE 排序与 RAE 不一致），证明 DTE 是新信号轴而非 RAE 的衍生 |
| "Crafter geometric mean 在 sᵢ=0 时整体为 0 是 brittleness" | §4 | acknowledged in §7；用 +1 shift 已在论文中 |
| "为什么不评 GPT-5 / Claude-4.7 / Gemini-2 / o3" | 模型选择 | §5 model menu 包含 Anthropic, OpenAI, open-weight 7B/70B；Gemini/o3 留 v2 |
| "为什么没有 partial observability" | §7 | acknowledged in §7 future work；fog 系统在 codebase 但未挂 toggle |
| "Schema rejection rate 是 prompt format 偏向问题" | E6 | §5.6 + appendix: prompt 给所有 model 一致；prompt-tuned variants 在 supplement |
| "为什么不直接用 OpenSpiel 框架" | §6 future | acknowledged：integration target 是 v2 |

---

## 5. Code & Infrastructure Deliverables

发表时 GitHub 仓库需要：

| Item | 当前状态 | 论文前必须做 |
|---|---|---|
| `refactor/academic-benchmark` 分支 | ✓ tagged rc1 | rebase to main + 改 tag 为 v0.11.0 |
| `tools/audit/{rng-coverage,determinism-check}.js` | ✓ verified | 加 7200-tick long determinism gate |
| 5 dimension plugins | ✓ skeletons + 8 tests | placeholder 子分（coalition_coupling 等）填 |
| ScoringEngine 归一化层 | ✗ | sandwich normalization + PVB（P0）|
| AgentAdapter 4 channel | ✓ interface only | HTTPAgentClient + agent-bridge.js（P0）|
| ScriptedOraclePolicy.js | ✗ | 200 LOC × per-scenario hand-tuned（P0）|
| Multi-seed runner | ✗ (单 seed 跑) | SimHarness 升级支持 5 seeds × N parallel（P0）|
| Record-replay LLM cache | ✗ | VCR-cassette-style cache + offline replay（P1）|
| Dockerfile (multi-stage: utopia-eval + utopia-agent) | ✗ | MLE-Bench 风格（P1）|
| `bench:dimensions` script with NDJSON + LaTeX 表 | ✓ test only | full pipeline + figure-render scripts（P1）|

---

## 6. Submission Timeline (4-week sprint)

```
Week 1 (2026-05-11 ~ 17): 基础设施 P0
  - Multi-seed SimHarness runner
  - Sandwich normalization + Crafter geo-mean in ScoringEngine
  - PVB (PolicyValue Baseline) implementation
  - HTTPAgentClient + agent-bridge for E3
  - ScriptedOraclePolicy per scenario
  - 长 determinism gate (7200 ticks)
  Deliverable: 所有 P0 落地，能开始跑 E1

Week 2 (2026-05-18 ~ 24): 跑 E1, E2, E6, E7
  - E2 (25 runs, 10 GPU-h)
  - E6 (70 runs, 14 GPU-h)
  - E7 reuses E6 + 15 ablation runs (3 GPU-h)
  - E1 (40 runs, 16 GPU-h)
  Deliverable: 4 个实验数据齐全，开始 figure 绘制

Week 3 (2026-05-25 ~ 31): 跑 E3, E4, E8 + 写论文 §1-§4
  - E4 (120 runs, 50 GPU-h)
  - E3 (100 runs, 50 GPU-h)
  - E8 post-hoc analysis on existing logs
  - Paper §1 (Intro), §2 (Related Work), §3 (Architecture), §4 (Metrics) 初稿
  Deliverable: 论文前半部分初稿，剩 E5 + E9

Week 4 (2026-06-01 ~ 07): E5 + E9 + 写论文 §5-§8 + buffer
  - E5 30min/2h/8h subset (60 runs + 27 runs, 80 GPU-h)
  - E9 reproducibility 4 gates
  - Paper §5 (Experiments), §6 (Discussion), §7 (Limitations), §8 (Reproducibility) 初稿
  - 全文 polish + figure 美化
  Deliverable: NeurIPS D&B submission ready
```

24-hour E5 长程跑放 camera-ready buffer（接受后 ~6 周）。

---

## 7. Risk Register & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| PVB variance reduction 不到 2× | Medium | High | E1 先用 5 seeds 跑试点；如效果不够则扩到 10 seeds（多花 2× compute） |
| HTTPAgentClient + agent-bridge 实现超时 | High | High | Plan B：4 个独立 ai-proxy 进程（hacky 但可跑 E3）；本周 5 内决定 fallback |
| 24h E5 跑 nondeterministic（PathWorkerPool 等） | Medium | Medium | benchmark 模式默认禁 PathWorkerPool；如仍 nondet → 限制为 8h 上限 |
| ScriptedOraclePolicy 太弱（< fallback） | Low | High | Pre-pilot：手调到至少 +20% RAE over fallback 才算 valid oracle |
| LLM API 速率限制 (E3 100 runs × 5 cells) | Medium | Medium | 多 provider 并行；Anthropic + OpenAI + 本地 vLLM 三路 |
| 投稿截止前数据不全 | Medium | High | E5 24h 留 camera-ready；E3 退回 4 cells（去 SS）应急 |
| Reviewer 质疑 "fallback baseline 太弱" | High | Medium | 提前在 supplement 跑 oracle vs fallback gap 数字；直接展示 ratio |

---

## 8. What "Done" Looks Like

论文准备齐全的 checklist：

- [ ] `paper-framework.md`（本文档）已被项目所有者审阅 + signed off
- [ ] 所有 P0 代码 (P0-1 ~ P0-7) 落地在 `refactor/academic-benchmark`
- [ ] E1–E9 全部 runs 完成，数据在 `output/benchmark-runs/`
- [ ] 13 figures + 3 tables 全部生成 in `docs/ai-research/paper/figures/` `docs/ai-research/paper/tables/`
- [ ] Paper §1–§8 LaTeX 草稿（用 NeurIPS D&B 模板）
- [ ] Supplement 含：reproducibility statement / Datasheet / prompt 全文 / model snapshots / Dockerfile
- [ ] GitHub 仓库 README 显示 "live status: rc1 → camera-ready"
- [ ] Determinism gate (7200 tick) 在 CI 上每 commit 跑一次
- [ ] 一键复现命令: `docker run project-utopia-bench --seed 0xC0FFEE --scenario S-PLAINS` 在 reviewer 机器上 exit 0

---

## 9. Living-Document Index

| 文档 | 角色 | 当前状态 |
|---|---|---|
| `benchmark_proposal.md` | 初始 research 提案（外部 audit） | 已存在 |
| `refactor-plan.md` | 7-phase 代码改造计划 + decision matrix | rc1 已落地 |
| `determinism-report.md` | S0 audit 输出 | ✓ |
| `experimental-design.md` | E1–E9 实验设计 | ✓ 542 行 |
| `literature-metrics-survey.md` | 25 篇 LLM benchmark 文献调研（cluster A-E） | ✓ extended |
| `literature-game-ai-metrics.md` | 5 篇 game-AI eval 方法学（cluster F） | ✓ |
| **`paper-framework.md`**（本文档） | 论文写作总框架 | ✓ |
| `roadmap.md` | 4-week 执行 + 阻塞 + 决策门 | TODO 下一份 |
| `paper/draft.tex` | LaTeX 主稿 | week 3+ |

---

**End of framework.** 下一步：写 `roadmap.md`（4-week 执行 + 决策门），开始 P0 代码落地（multi-seed runner + sandwich norm + PVB + HTTPAgentClient + ScriptedOraclePolicy）。
