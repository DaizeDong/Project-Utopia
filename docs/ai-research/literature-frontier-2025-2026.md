# Frontier Literature Survey (2025 H2 – 2026 H1)

**Status:** Draft v1 (2026-05-10)
**Coverage window:** 2025-07 → 2026-05
**Companion to:** `literature-metrics-survey.md` (30 anchor papers, mostly 2022-2024), `paper-framework.md`, `experimental-design.md`
**Method:** 5 parallel research agents pulled NeurIPS 2025 D&B / ICLR 2026 / arXiv 2025-07 ~ 2026-05 listings via Firecrawl

> 30 篇 anchor 调研覆盖了 LLM benchmark 的方法学根基（~2022-2024）。这份单独整理 **过去 11 个月内**（2025-07 → 2026-05）的 frontier 工作 — 包含 NeurIPS 2025 D&B + ICLR 2026 + 大量 arXiv preprints。**有 4 个发现直接威胁 Project-Utopia 的 contribution claim**，本文档详细分析每一条 + 给出反应策略。

---

## 0. Executive Summary

### 0.1 Critical findings (会进 paper §2 + reviewer 必问)

**🔴 THREAT-1**: §2.3 "first heterogeneous LLM" claim 站不住 — **X-MAS (2025-05)** 已系统证明 heterogeneous > homogeneous on 27 LLMs × 5 domains。
- **Action**: §2.3 重 framing 为 **"channel-axis heterogeneity in long-horizon survival"**

**🔴 THREAT-2**: §2.5 "Recall × Drift × Performance 三曲线" 部分被 cover — **MemoryArena (2026)** 已做 action-grounded recall in agent loop, **MemoryAgentBench (2025-07)** 已含 Selective Forgetting 轴。
- **Action**: §2.5 收窄到 **"三轴联合分析 on continuous tick-level sim with naturally accumulated context"** — 这个组合仍未被任何 paper 同时做到

**🟡 THREAT-3**: **Orak (ICLR 2026)** 是直接 competitor — 12 real video games including Stardew Valley + StarCraft II, MCP plug-and-play interface
- **Action**: §2 必须明确 differentiate — **breadth-first 12 sims (Orak) vs depth-first 1 sim 4-channel (Utopia)**

**🟢 GOOD NEWS-1**: §2.8 Bayesian Beta-Binomial 被 ICML 2025 Spotlight 验证为 best practice
- **Bowyer et al. ICML 2025**: "Don't Use the CLT in LLM Evals With Fewer Than a Few Hundred Datapoints" 直接推荐 Beta-Binomial 作 small-N 默认
- **Action**: 引 Bowyer，§2.8 不再 claim "novel method choice"，改为 "应用到 long-horizon colony sim"

**🟢 GOOD NEWS-2**: §2.9 reproducibility 可升级到 **3-tier** 体系
- **LayerCast (Yuan et al., NeurIPS 2025 Oral)** 让 LLM 也可 hardware-independent bit-identical
- 3 tier: (a) fallback bit-identical (已有) / (b) LLM + LayerCast bit-identical / (c) production LLM stationary only
- **Action**: 把 tiered reproducibility 提升为 §2.9 主 contribution

**🟢 GOOD NEWS-3**: Judge-free, objective-metric-only 是 2025-2026 趋势
- **PeerBench (NeurIPS 2025)** 明确反 agent-as-judge for high-stakes
- Project-Utopia 全部用 simulator-objective metrics (DevIndex / deaths / 生存 ticks) → 直接合规
- **Action**: §2 加一句 "Following PeerBench, judge-free objective metrics throughout"

### 0.2 New citation list — must include in paper §2

按引用紧急度排序：

| Paper | Date | Why must cite |
|---|---|---|
| **X-MAS** (Ma et al.) | 2025-05 | THREAT-1: §2.3 直接 prior art on heterogeneous MAS |
| **Bowyer et al. "Don't Use the CLT"** | ICML 2025 Spotlight | §2.8 method-choice warrant |
| **LayerCast (Yuan et al.)** | NeurIPS 2025 Oral | §2.9 LLM-on bit-identical 路径 |
| **PeerBench (Cheng et al.)** | NeurIPS 2025 Position | §2 judge-free 立场 + contamination preempt |
| **MemoryArena** | 2026 | THREAT-2: §2.5 action-grounded recall prior art |
| **MemoryAgentBench (Hu et al.)** | ICLR 2026 | THREAT-2: §2.5 Selective Forgetting 轴 |
| **Orak** (KRAFTON/NVIDIA) | ICLR 2026 | THREAT-3: §2 game-sim panel competitor |
| **HeroBench** | 2025-08 v2 2026-04 | §2.4 hierarchical crafting DAG (RAE 直接对照) |
| **EcoGym** | 2026-02 | §2 closest economic-multi-scenario cousin |
| **REALM-Bench** | 2025-08 v2 | §2 long-horizon planning competitor |
| **Stop Overvaluing MAD** | 2025-02 | §2.3 heterogeneity-as-antidote 加强 |
| **Anthropic Multi-Agent Research System** | 2025-06 (Engineering blog) | §2.3 工业 prior art (intra-family mix only) |
| **MultiAgentBench / MARBLE** | ACL 2025 | §2.3 holistic MAS benchmark |
| **AgentArch (ServiceNow)** | 2025-09 | §2 factorial harness ablation 模板 |
| **TheAgentCompany** | NeurIPS 2025 D&B | §2 partial-completion checkpointing |
| **VitaBench** (Meituan) | ICLR 2026 | §4 rubric sliding-window LLM-judge |
| **UltraHorizon** | 2025-09 (ICLR 2026) | §2 ultra-long-horizon failure mode taxonomy |
| **VIKI-Bench / VIKI-R** | NeurIPS 2025 | §2 hierarchical analog (robotics) |
| **WorldModelBench** | NeurIPS 2025 | §2 world-model framing 对照 |
| **SimWorld** (UCSD/UVA/JHU/UMich) | 2026-01 | §2 dominant 2026 reference (UE5 city sim) |
| **AgentSociety / OASIS** | 2025 KDD/Web | §2 social-sim 对照 |
| **Project Sid (Altera)** | 2024-2025 | §2 emergent vs commanded economy 对照 |
| **HELM Long Context** (Stanford CRFM) | 2025-09 | §2.5 industrial leaderboard pattern |
| **LongBench v2** | ACL 2025 | §2.5 multilingual long-context |
| **The Illusion of Diminishing Returns** | 2025-09 | §2.5 H(p) 数学根基 |
| **Evo-Memory** | 2025-11 | §2.5 embodied memory baseline |
| **Memora** | 2026-04 | §2.5 personalized agent memory |
| **MathArena** | NeurIPS 2025 D&B | §4 streaming/dynamic anti-contamination 模板 |
| **FAQ (Wu, Nair, Candès)** | 2026-01 | §2.8 active querying 5× 效率 |
| **BATS budget-aware** | 2025-11 | §3.3 cost-aware Pareto 标配 |
| **Siddiq SE Reproducibility Crisis** | 2025-11 | §2.9 RMM 7-smell 框架 |
| **Agent-as-Judge survey** (Yu) | 2025-08 | §2 judge-free 反向论据 |

**总计：32 篇必须引用的 2025-2026 frontier paper**（加上原 30 篇 anchor + 5 篇 game-AI = 67 篇 paper §2 reference）。

---

## 1. Cluster G — General Agent Benchmarks 2025-2026 (12 篇)

| Paper | Date | Domain | Headline metric | Threat / opportunity |
|---|---|---|---|---|
| **UltraHorizon** | 2025-09 | 200K+ tokens, 400+ tool calls, 3 探索环境 | success × horizon × token entropy | **OPPORTUNITY**: define long-horizon failure modes (in-context locking + foundational gaps) |
| **EcoGym** | 2026-02 | Vending + Freelance + Operation 三经济场景 | net_worth, income, DAU 365-day | **🟡 CLOSEST ECONOMIC COUSIN** — 但 text-only, 无 spatial grid, 无 FSM workers |
| **HeroBench** | 2025-08 v2 2026-04 | RPG-inspired hierarchical crafting | success / progress / damage / `D_total` 难度 | **OPPORTUNITY**: DAG-based difficulty scaling 可直接借用 |
| **EnterpriseArena** | 2026-03 | Agent-as-CFO 132 月企业 sim | survival rate (best 16%) | **OPPORTUNITY**: budgeted-observation channel idea (LLM 用 sim 货币买 telemetry queries) |
| **VitaBench** (Meituan) | ICLR 2026 | 食物配送 + in-store + travel, 66 tools | rubric sliding-window LLM-judge, `Avg@4 / Pass@4 / Pass^4` | **OPPORTUNITY**: rubric-judge + Pass^k methodology |
| **AMA-Bench** | 2026-02 | dialogue + agentic memory split | 72.26% best (GPT-5.2) | **THREAT-2 minor**: dialogue vs agentic memory 分类直接 cover §2.5 一部分 |
| **OdysseyBench** | 2025-08 | 602 office tasks (Word/Excel/PDF/Email/Calendar) | partial completion | confirms multi-app long-horizon trend |
| **TheAgentCompany** | NeurIPS 2025 D&B | mock company env (web + code + comms) | partial-completion-aware SR (top 30%) | **OPPORTUNITY**: partial-completion checkpointing |
| **AgentArch** (ServiceNow) | 2025-09 | 18 architectures × 6 LLMs × 2 enterprise workflows | `Acceptable = C∧A∧O / R` factorial | **OPPORTUNITY**: factorial harness ablation 模板 |
| **ML-Master 2.0** | 2026-01 | MLE-Bench hardened with day/week-scale | 56.44% medal rate, 24h budget | confirms ultra-long-horizon trend |
| **KAIROS + Agent Security Arena** | ICLR 2026 | adversarial multi-agent + 103k prompt-injection battles | safety eval | **OPPORTUNITY**: prompt-injection channel = upgrade saboteur tile |
| **HORIZON** | 2026-04 | (待补 — agent 调研中提到但细节不足) | — | — |

---

## 2. Cluster H — Multi-Agent LLM Coordination 2025-2026 (11 篇)

| Paper | Date | Heterogeneous mix? | Threat to §2.3 |
|---|---|---|---|
| **🔴 X-MAS** (Ma et al.) | 2025-05 | **YES — central thesis**: 27 LLMs × 5 domains × 5 functions, +47% on AIME via chatbot+reasoner | **MAJOR**: "first heterogeneous MAS" 已被占；§2.3 必须 reframe |
| **Stop Overvaluing MAD** | 2025-02 | **YES** — 论证 heterogeneity is the only way MAD beats single CoT | **加强 §2.3**：独立证据支持 heterogeneous 重要性 |
| **MultiAgentBench / MARBLE** | ACL 2025 | Limited — varies topology not model family | 短-horizon coord; no economic survival |
| **AgentArch** | 2025-09 | No — 18 architectures × single LLM | factorial ablation 模板 |
| **MAFBench** | 2026-02 | No — framework comparison only | latency 100×, coord 90%→<30% — architecture matters |
| **AdaptOrch** | 2026-02 | No — same model different topology | "topology > model" 论证 |
| **Hierarchical MAS for Multi-Robot Planning** | 2026-02 | No | manager-worker 类比，neuro-symbolic backbone |
| **Financial Document MAS** | 2026-03 | Partial — frontier vs open-weight 分别评 | best cost-accuracy Pareto 数据 |
| **M3MAD-Bench** | 2026-01 | Partial — agent-role 异质 | post-"Stop Overvaluing" 标准化 protocol |
| **REALM-Bench** | 2025-08 v2 | Partial — 6 LLM families per single-LLM run | **🟡 STRONG COMPETITOR**: long-horizon, disruption-aware, dynamic replanning |
| **Anthropic Multi-Agent Research System** | 2025-06 (Engineering) | YES intra-family — Opus lead + Sonnet workers | +90.2% over single Opus, ~15× tokens; production validation |

**Project-Utopia §2.3 reframed pitch**:
> "While X-MAS (Ma et al. 2025) demonstrated heterogeneous LLM mixes outperform homogeneous on per-task routing, and Anthropic's Multi-Agent Research System (2025) validated intra-family Opus+Sonnet mixes in production, **no work has examined cross-vendor heterogeneous mixes operating on parallel decision channels within a single long-horizon survival task**. We address this gap with a 4-channel × cross-vendor SS/SW/WS/WW matrix on Project-Utopia, additionally evaluating long-horizon emergent-economy survival rather than per-task routing."

---

## 3. Cluster I — Long-Context + Memory Benchmarks 2025-2026 (10 篇)

| Paper | Date | Recall? | Drift? | Performance? | Joint analysis? |
|---|---|---|---|---|---|
| **HELM Long Context** (Stanford CRFM) | 2025-09 | ✓ | ✗ | ✗ | ✗ |
| **LongBench v2** | ACL 2025 | ✓ | ✗ | ✗ | ✗ |
| **LongBench Pro** | 2026-01 | ✓ multi-axis | ✗ | ✗ | ✗ |
| **MemoryAgentBench** | 2025-07 (ICLR 2026) | ✓ | **partial (Selective Forgetting)** | ✗ (no env loop) | ✗ |
| **🔴 MemoryArena** | 2026 | ✗ | ✗ | **✓** | ✗ (但 LoCoMo 满分模型在 Arena 跌到 40-60% 强证据) |
| **UltraHorizon** | 2025-09 | partial | partial | partial | partial — 但侧重 reasoning failure |
| **The Illusion of Diminishing Returns** | 2025-09 | — | **✓ (H(p) 数学公式)** | partial | ✗ |
| **AMA-Bench** | 2026-02 | ✓ | ✗ | partial | ✗ |
| **Evo-Memory** | 2025-11 | ✗ | ✗ | **✓ action-grounded** | ✗ |
| **Memora** | 2026-04 | ✓ | partial | weak | ✗ |
| **§2.5 (Project-Utopia)** | — | **✓** | **✓** | **✓** | **✓** + tick-continuous + naturally accumulated |

**结论**: §2.5 **三轴联合 + 连续 tick 时间 + 自然累积上下文** 这个**组合**仍未被任何 2025-2026 论文同时做到。但 **MemoryArena** 已经是 Performance 轴的强对照，**MemoryAgentBench** 已经是 Drift 轴的强对照。论文 §2.5 必须**显式列对比矩阵**说清楚 each 单轴谁先做，**combo 是 contribution**。

---

## 4. Cluster J — Methodology + Reproducibility Frontier (8 篇)

| Paper | Date | Contribution | Impact on §2.8 / §2.9 |
|---|---|---|---|
| **🟢 Bowyer et al. "Don't Use the CLT"** | ICML 2025 Spotlight | Beta-Binomial / Clopper-Pearson < 300 samples | **VALIDATE** §2.8 method choice (drop "novel" claim, cite as best practice) |
| **🟢 LayerCast (Yuan et al.)** | NeurIPS 2025 Oral | Hardware-independent bit-identical LLM inference | **UPGRADE** §2.9 to 3-tier reproducibility |
| **FAQ (Wu/Nair/Candès)** | 2026-01 (Stanford) | Active querying 5× sample efficiency, frequentist coverage preserved | §2.8 wave-2 enhancement (adaptive eval) |
| **🟢 PeerBench (Cheng et al.)** | NeurIPS 2025 Position | Anti-AI-as-judge; sealed execution | **VALIDATE** §2 judge-free 立场 |
| **MathArena** | NeurIPS 2025 D&B | Streaming dynamic benchmark + Wilson CIs + cost-perf tradeoffs | §4 dynamic-rotation idea |
| **Agent-as-Judge survey** (Yu) | 2025-08 | +10-16% human correlation but biased | §2 反向论据 (Project-Utopia 不用) |
| **BATS budget-aware** (Liu et al.) | 2025-11 | `α·tokens + β·tool_calls` joint cost metric | §3.3 cost-aware Pareto (already aligned) |
| **🟡 Siddiq SE Reproducibility Crisis** | 2025-11 (EMSE submitted) | 7-smell taxonomy + RMM (5 tiers) replacing binary badges | **UPGRADE** §2.9 around 7-smell + Tier 4+ commitment |

**Reproducibility tiers post-LayerCast** (§2.9 全新结构):

```
Tier 1 — Fallback bit-identical
  audit:determinism (60-tick) ✓ PASS
  Long determinism (7200-tick) ⏳ TODO E9
  Cross-OS (Linux/macOS/Windows) ⏳ TODO E9

Tier 2 — LLM + LayerCast bit-identical
  Pin LLM provider model snapshot ID + LayerCast inference
  Same prompt + temperature=0 + LayerCast → identical sample distribution
  Record-replay LLM cache (VCR-cassette) for offline replay

Tier 3 — Production LLM stationary
  No LayerCast, just temperature=0
  KL between same-prompt response distributions < 0.05
  Standard Bayesian CIs on directives
```

---

## 5. Cluster K — Sim / World / Embodied 2025-2026 (10 篇)

| Paper | Date | Domain | vs Project-Utopia |
|---|---|---|---|
| **🔴 Orak** (KRAFTON/NVIDIA) | ICLR 2026 (2026-04) | 12 real video games (Stardew, StarCraft II, Civilization, ...) | **DIRECT COMPETITOR**: breadth-first vs Utopia depth-first; cite + clearly differentiate |
| **🔴 SimWorld** (UCSD/UVA/...) | 2026-01 | UE5 city sim, language-steerable | Different problem (3D photo-real perception vs 2D economic-strategic); both reactions to "world model" hype from opposite ends |
| **VIKI-Bench / VIKI-R** | NeurIPS 2025 | 3D embodied multi-robot (humanoid + wheeled + dual-arm) | "First hierarchical benchmark for X" 同名 — Utopia 是 economic hierarchy vs VIKI 是 perception hierarchy |
| **WorldModelBench** | NeurIPS 2025 | Video-gen as world model (Sora/Genie 3 panel) | World-as-output vs Utopia world-as-test-env — different problem |
| **AgentSociety / OASIS** | 2025 KDD/Web | 1M-agent social sim | Descriptive social science vs Utopia operational performance |
| **Project Sid (Altera)** | 2024-2025 | 1000+ agents Minecraft, emergent econ + tax + religion | **Inverse philosophy**: emergent (Sid) vs commanded (Utopia) economy |
| **TheAgentCompany** | NeurIPS 2025 D&B | Software company simulation, real GUI office tasks | Different domain |
| **Embodied-Agent-Interface** | 2025-02 | Standardized eval LLM decision in embodied envs | Adjacent eval methodology |
| **DSGBench** | 2025-03 | 6 strategic games | Closer in spirit but superseded by Orak |
| **Genie 3** (DeepMind blog) | 2025-08 | Real-time text-to-world video | Not a benchmark; sets world-model hype context |

**Project-Utopia 在 2026 sim landscape 的独特定位（必须在 §2 写清楚）**:

```
2026 sim/world/embodied benchmark space:
  ├── World fidelity (output)         WorldModelBench, Genie 3, Sora
  ├── Open-ended sim (perception)     SimWorld, VIKI-Bench, Embodied-Agent-Interface
  ├── Game panel (breadth)            Orak, BALROG, SmartPlay, DSGBench
  ├── Social sim (descriptive)        AgentSociety, OASIS, Project Sid
  ├── Office/enterprise               TheAgentCompany, OdysseyBench, EnterpriseArena
  ├── Long-horizon planning           REALM-Bench, UltraHorizon, ML-Master 2.0
  ├── Hierarchical crafting/economy   HeroBench, EcoGym
  └── 🟢 Strategic-controller         ★ Project-Utopia ★
       (deterministic 96×72 tile economy +
        4-channel parallel commands per tick +
        FSM workers + emergent multi-resource +
        seeded year-scale reproducibility)
```

**没有任何 2025-2026 paper 占据 Project-Utopia 的格子**。EcoGym 最近但 text-only；HeroBench 最近但 single-agent；REALM-Bench 最近但 logistics-not-survival；Orak 最近但 breadth-first 12 games 浅；VIKI 最近但 perception-hierarchy not strategic-hierarchy。

---

## 6. Updated Contribution Claims (revised after frontier survey)

原 paper-framework.md 的 3 个 claim 必须按下表更新：

| Original Claim | 威胁 | Revised Claim |
|---|---|---|
| C1 Architectural — 4-channel × deterministic substrate × bit-identical reproducibility | 🟢 OK | 强化为 **3-tier reproducibility (fallback bit-identical / LayerCast LLM bit-identical / production stationary)** |
| C2 Methodological — sandwich norm + Crafter geo-mean + HELM MWR + AIVAT-style PVB | 🟢 OK | 加 BATS cost-aware Pareto + VitaBench rubric sliding-window + Siddiq RMM Tier 4+ |
| C3 Empirical — 9 实验 (hierarchy / multi-LLM / memory) | 🔴 §2.3 + §2.5 部分被占 | (a) 多-LLM 收窄到 **channel-axis cross-vendor heterogeneity in long-horizon survival**; (b) 记忆收窄到 **三轴联合 on continuous tick-level naturally-accumulated context**; (c) 加 partial-completion checkpoint vector (TheAgentCompany) |

新增 contribution claim（鉴于 frontier 出现的新 niche）：

- **C4 Position-Defining**: First benchmark in the 2026 LLM-driven sim landscape combining (i) deterministic 96×72 tile economy, (ii) 4-channel parallel commands per tick, (iii) FSM-worker + emergent multi-resource economy, (iv) seeded year-scale reproducibility, (v) cross-vendor channel-axis heterogeneous LLM mix evaluation. Each of (i)–(v) 单独有 prior art，但 5-way 组合无 prior art。

---

## 7. Sources

按 cluster 归档：

### Cluster G (general agent benchmarks)
- [UltraHorizon](https://arxiv.org/abs/2509.21766) — 2025-09 (ICLR 2026)
- [EcoGym](https://arxiv.org/abs/2602.09514) — 2026-02
- [HeroBench](https://arxiv.org/abs/2508.12782) — 2025-08 v2 2026-04
- [EnterpriseArena](https://arxiv.org/abs/2603.23638) — 2026-03
- [VitaBench](https://arxiv.org/abs/2509.26490) — ICLR 2026 (Meituan)
- [AMA-Bench](https://arxiv.org/abs/2602.22769) — 2026-02
- [OdysseyBench](https://arxiv.org/abs/2508.09124) — 2025-08
- [TheAgentCompany](https://openreview.net/forum?id=LZnKNApvhG) — NeurIPS 2025 D&B
- [AgentArch](https://arxiv.org/abs/2509.10769) — 2025-09 (ServiceNow)
- [ML-Master 2.0](https://arxiv.org/abs/2601.10402) — 2026-01
- KAIROS + Agent Security Arena — ICLR 2026
- [HORIZON](https://arxiv.org/abs/2604.17259) — 2026-04

### Cluster H (multi-agent)
- [X-MAS](https://arxiv.org/html/2505.16997v1) — 2025-05
- [MultiAgentBench / MARBLE](https://arxiv.org/abs/2503.01935) — ACL 2025
- [MAFBench](https://arxiv.org/html/2602.03128) — 2026-02
- [AdaptOrch](https://arxiv.org/abs/2602.16873) — 2026-02
- [Hierarchical MAS Multi-Robot](https://arxiv.org/abs/2602.21670) — 2026-02
- [Financial Document MAS](https://arxiv.org/abs/2603.22651) — 2026-03
- [Stop Overvaluing MAD](https://arxiv.org/abs/2502.08788) — 2025-02
- [M3MAD-Bench](https://arxiv.org/html/2601.02854v1) — 2026-01
- [REALM-Bench](https://arxiv.org/abs/2502.18836) — 2025-08 v2
- [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) — 2025-06

### Cluster I (long-context + memory)
- [HELM Long Context](https://crfm.stanford.edu/2025/09/29/helm-long-context.html) — 2025-09
- [LongBench v2](https://aclanthology.org/2025.acl-long.183.pdf) — ACL 2025
- [LongBench Pro](https://arxiv.org/html/2601.02872v1) — 2026-01
- [MemoryAgentBench](https://arxiv.org/abs/2507.05257) — 2025-07 (ICLR 2026)
- [MemoryArena](https://arxiv.org/abs/2602.16313) — 2026
- [The Illusion of Diminishing Returns](https://arxiv.org/abs/2509.09677) — 2025-09
- [Evo-Memory](https://arxiv.org/html/2511.20857v1) — 2025-11
- [Memora](https://arxiv.org/html/2604.20006v1) — 2026-04

### Cluster J (methodology + reproducibility)
- [Bowyer et al. "Don't Use the CLT"](https://arxiv.org/abs/2503.01747) — ICML 2025 Spotlight
- LayerCast (Yuan et al.) — NeurIPS 2025 Oral, OpenReview Q3qAsZAEZw
- [FAQ — Efficient Evaluation w/ Statistical Guarantees](https://arxiv.org/abs/2601.20251) — 2026-01 (Stanford)
- [PeerBench](https://arxiv.org/abs/2510.07575) — NeurIPS 2025 Position
- [MathArena](https://openreview.net/forum?id=y0zL9IZxZ7) — NeurIPS 2025 D&B
- [Agent-as-Judge survey](https://arxiv.org/abs/2508.02994) — 2025-08
- [BATS budget-aware](https://arxiv.org/abs/2511.17006) — 2025-11
- [Siddiq SE Reproducibility Crisis](https://arxiv.org/abs/2512.00651) — 2025-11

### Cluster K (sim/world/embodied)
- [SimWorld](https://arxiv.org/abs/2512.01078) — 2026-01
- [Orak](https://arxiv.org/abs/2506.03610) — ICLR 2026
- [VIKI-Bench / VIKI-R](https://arxiv.org/abs/...) — NeurIPS 2025
- [WorldModelBench](https://...) — NeurIPS 2025
- AgentSociety / OASIS — 2025 KDD/Web
- Project Sid (Altera) — 2024-2025

---

**End of frontier survey.** 下一步：把 §0.1 Critical findings 的 reframing 落进 `paper-framework.md`，更新 §2 Related Work outline 加这 32 篇 frontier paper 的引用位置。
