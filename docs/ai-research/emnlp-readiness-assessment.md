# EMNLP 2026 Readiness Assessment — Project-Utopia

**Status:** Draft v1 (2026-05-10)
**Question asked:** "评估我们研究在 EMNLP 的终稿绿"——i.e., 投 EMNLP 终稿能否过审？
**Companion to:** `paper-framework.md` v2, `experimental-design.md` v2, `roadmap.md` v2, `literature-frontier-2025-2026.md`

> 这份是诚实的可投性评估。不是 "能投" 的兜售文。结论先行：**EMNLP 是 next-best fit，但 NeurIPS D&B 仍然是 primary target**。下面解释为什么，列出 EMNLP 投稿要做的额外工作，给最后的"绿灯 / 黄灯 / 红灯"判定。

---

## TL;DR — 终稿绿灯判定

| 维度 | 状态 | 备注 |
|---|---|---|
| **NeurIPS D&B 2026** (primary) | 🟡 **Yellow** — 4-week 全力冲刺可达 | deadline 2026-06-07；需要 W1-W4 全部 P0 落地 + 9 个实验跑完 + 核心 figure |
| **ICLR 2027 main** (secondary) | 🟢 **Green-ish** — 时间充裕 + 4 个月 polish 余地 | deadline 2026-09-30；与 Orak 同 venue 是 risk |
| **EMNLP 2026 R&E track** | 🟡 **Yellow** — fit 不算最佳但可行 | deadline ARR 2026-04 cycle（已过）or direct submission 2026-06-15；EMNLP 偏 NLP，本 paper 偏 agent benchmark |
| **EMNLP 2026 Findings** | 🟢 **Green** — 退路稳 | rejected from main → automatic Findings consideration |
| **EMNLP 2026 Workshop** (e.g. NLP4DM, GamesAndNLP) | 🟢 **Green** — 后备稳 | 如所有 main venue 都 reject |

**核心判断**：
- 如果"必须发 EMNLP"是硬性需求 → Resources & Evaluation track 可行，但需要在论文 framing 上向 NLP audience 倾斜（多语言 prompt / 语言学分析 / dialogue evaluation）
- 如果只是"考虑 EMNLP 作为 backup" → 现有 NeurIPS D&B framing 直接复用没问题，但**接受率低于直投 NeurIPS D&B**

---

## 1. EMNLP 2026 Venue Fit Analysis

### 1.1 Track Mapping

EMNLP 2026 主要 tracks（按 fit 排序）：

| Track | Fit Score | Reason |
|---|---|---|
| **Resources & Evaluation** | 7/10 | 最自然匹配；接收 dataset / benchmark papers; LLM benchmark 在过去 3 年常见 (e.g. MMAU, AgentBoard, GAIA 都进过 R&E 系列 venue) |
| Generation | 4/10 | LLM directive 是结构化输出，不是自由生成；不直接匹配 |
| Dialogue & Interactive Systems | 5/10 | 多 agent + 4 channel 通讯有 dialogue 元素，但不是 primary contribution |
| NLP Applications | 5/10 | colony sim 是 application 但太 atypical (game/economy) |
| Reasoning | 5/10 | hierarchical planning 是 reasoning 但不是 NLP 风味的 reasoning (math/commonsense/...) |
| Multimodality | 1/10 | 我们没多模态 |
| **Industry Track** | 6/10 | Project-Utopia 的 production-relevance（4 channel 类比 industrial agent system）契合 industry track；但不是 first-priority |

**结论**: 主投 **Resources & Evaluation**，备 **Industry Track** 或 **Dialogue & Interactive Systems**。

### 1.2 EMNLP 历史接收的类似 paper

最近 3 届 EMNLP 接收过的 LLM benchmark / agent paper（quick scan）:

| Year | Paper | Track | 关键 fit point |
|---|---|---|---|
| EMNLP 2024 | OdysseyBench (office tasks) | Main | 长程 + multi-app (类比 Project-Utopia 多 channel) |
| EMNLP 2024 | GAIA-style follow-ups | R&E | LLM agent benchmark |
| EMNLP 2024 | LiveBench-style contamination-resistant | R&E | benchmark methodology |
| EMNLP 2023 | AgentBench (early version) | Main | LLM as agent eval |
| EMNLP 2023 | LongBench v1 | R&E | long-context benchmark |

**EMNLP 历史录用 LLM benchmark 是常态**，但 R&E track 通常要求 paper:
1. **NLP-relevant evaluation methodology**（不仅是 game-AI）
2. **多语言或语言学维度**（加分项）
3. **可被 NLP 社区直接复用的 dataset / metrics**（hard requirement）

Project-Utopia 第 1 项**勉强满足**（schema validation 是 NL-to-structured-output, recall 是 NL-recall），第 2 项**缺**，第 3 项**满足**（schema + dimension plugin 通用）。

---

## 2. EMNLP-Specific Requirements vs Current State

### 2.1 论文必须做的 EMNLP-fit 调整（如果投 EMNLP）

| Requirement | Current State | Gap |
|---|---|---|
| **NLP-style abstract**（强调 language eval, not game eval） | abstract 现在以 "colony simulation" 开头 | 需要 reframe abstract：开头先提 "language model evaluation under hierarchical decision making"，game sim 后置 |
| **Language-specific contribution**（多语言/句法/对话） | 4 个 prompt 都是英文；schema validation 算 NLG-related | 弱满足；建议加 **multilingual prompt ablation** as supplement (中文 / 日文 / 西班牙文 prompt → schema rejection rate 对比) |
| **Linguistic analysis of LLM directives** | 暂无 | 加一个 **subsection: linguistic analysis of LLM-generated `summary` / `focus` / `steeringNotes`**（length distribution, keyword consistency, hallucination rate）— 1-2 页 supplement |
| **Engagement with NLP literature** | 现在 cite 30 篇 anchor + 32 篇 frontier 主要是 agent benchmarks | EMNLP reviewer 期望 dialogue / language model / NLG 经典 cite (e.g. BLEU, ROUGE, METEOR, BERTScore for summaries)；至少加 5-8 篇经典 NLP eval references |
| **Schema validation as NLG eval** | 已有 ResponseSchema.js | 加一段 "Schema-validated structured generation as a controllable-NLG benchmark" 角度 |
| **Page limit**: EMNLP main 8 pages + unlimited refs | NeurIPS D&B 9 pages + 4 supplement | EMNLP 紧 1 页；需要把 §1-§4 压缩 |

**估计 EMNLP-fit 改造量**：~1.5-2 dev-day 改 framing + ~1 dev-day 加 multilingual prompt ablation + ~0.5 dev-day 加 linguistic analysis = **~4 dev-day total**。可在 W4 buffer 期间做。

### 2.2 EMNLP 不需要 NeurIPS 需要的事

| NeurIPS D&B Requirement | EMNLP 不需要 |
|---|---|
| Datasheet for Datasets | 不强求（但加分） |
| Croissant metadata | 不要求 |
| Reproducibility Checklist | EMNLP 有自己的 ARR checklist，比 NeurIPS 简单 |
| RMM Tier 4+ commitment | 不强求（但仍是好实践） |

**好消息**: EMNLP 比 NeurIPS D&B 在 reproducibility infrastructure 上要求**略低**——但 review 强度相当。

### 2.3 Reviewer Pool 差异

| | NeurIPS D&B | EMNLP R&E |
|---|---|---|
| 主要 reviewer 背景 | ML / RL / agent system / dataset construction | NLP / linguistics / dialogue / NLG |
| 偏好 metric | RAE / DTE / Bayesian Beta-Binomial 都熟 | 偏好 BLEU/ROUGE 类 + 相关人类评价 |
| 对 game-sim 容忍度 | 高（BALROG/Crafter 都进过 NeurIPS 系） | 中（OdysseyBench office tasks 进过，但纯 game 较少）|
| Multi-LLM 兴趣 | 高（社区热点）| 中（更关心 dialogue agent）|
| Long-context memory 兴趣 | 高 | **极高**（NLP 核心议题）— Project-Utopia §2.5 三曲线在 EMNLP 反而是 highlight |
| 反对 hype | 中 | 高（EMNLP reviewer 历史更挑剔）|

**结论**: §2.5 (memory) 在 EMNLP 是 strength；§2.3 (multi-LLM) 是 neutral；§2.4 (multi-resource RAE) 是 weakness（NLP audience 不熟）。

---

## 3. EMNLP 投稿 Specific Risks & Mitigations

### Risk EMNLP-1: "Too game-y, not NLP enough"

**Probability**: High
**Reviewer signal**: "I see this as a benchmark for game AI, not for NLP; consider RL/agent venue"
**Mitigation**:
1. Abstract 开头 reframe to "We introduce a benchmark for evaluating language models on hierarchical decision making, schema-controlled structured generation, and long-horizon memory under naturally accumulating context"
2. §1 Intro 先讲 NLP 角度（schema validation = controllable NLG; long-horizon recall = LLM memory; hierarchical directive = controlled generation under constraints）
3. §3 Architecture 把 4-channel decision 描述成 "structured natural-language directive generation" 而非 "game policy"
4. §5 Experiments 把 RAE 改名 "Resource-Allocation Efficiency (a structured-generation correctness metric)"
5. **不要删 game sim 内容**——它仍是 paper backbone——但**用 NL framing 包装**

### Risk EMNLP-2: "Multilingual evaluation missing"

**Probability**: Medium-High
**Reviewer signal**: "Are these findings limited to English-prompted LLMs?"
**Mitigation**:
1. W3-W4 buffer 加一个 **mini ablation**: 3 model × 3 language prompt (English / Chinese / Spanish) × 1 scenario × 5 seeds = 45 runs (~6 GPU-h)
2. 报 schema rejection rate × language → 显示 "schema controllability robust across languages" 或 "specific language X 退化"
3. 1 表 + 1 段 in supplement，约 0.5 page

### Risk EMNLP-3: "Schema validation = JSON output is not an NLP contribution"

**Probability**: Medium
**Reviewer signal**: "Constrained decoding via JSON schema is established (e.g. Outlines, jsonformer); what's new?"
**Mitigation**:
1. 论文中**明确 cite Outlines / jsonformer / structured-decoding 论文**（5-8 篇 NLP 文献），强调 Project-Utopia 的 contribution 不是 schema *enforcement* 而是 **schema-validated structured generation under long-horizon environment feedback** 的 evaluation framework
2. §4 加一段 "Schema validation as a NLG controllability metric: per-channel schema rejection rate as proxy for instruction following"

### Risk EMNLP-4: "Long-horizon memory section overlaps with NLP literature"

**Probability**: High（EMNLP reviewer 必懂 NIAH/RULER/LongMemEval）
**Reviewer signal**: "How does this differ from RULER / MemoryArena / MemoryAgentBench?"
**Mitigation**:
1. §2.5 已经 reframe 到 三轴 + 连续 tick + 自然累积 (paper-framework.md v2 已锁定)
2. Related Work 段必须**最先**讨论 LongMemEval / RULER / MemoryArena / Lost-in-Middle，并把 Project-Utopia 三曲线作为它们的**自然延伸**而非 supersede
3. EMNLP reviewer 对 memory 兴趣高，这反而是 paper highlight

### Risk EMNLP-5: "Reproducibility 比 NeurIPS 易过但 evaluation 严"

**Probability**: Medium
**Reviewer signal**: "Sample size justification? Statistical significance? Effect sizes?"
**Mitigation**:
1. Bowyer ICML 2025 Spotlight 引用是关键 — EMNLP reviewer 喜欢看到方法学严谨
2. PVB variance reduction + Beta-Binomial CIs 在 EMNLP context 是加分项
3. 不要省 §5.x 的 statistical detail；每个 effect size 都报 ± SEM

---

## 4. EMNLP-Specific Paper Restructure (if K1 选 EMNLP)

如果决定主投 EMNLP（K1=EMNLP 而非 NeurIPS），论文结构小调整：

### 4.1 Abstract 重写（NLP-first framing）

```
原 abstract (NeurIPS D&B framing):
"Existing LLM-agent benchmarks evaluate single agents in episodic
tool-use tasks (AgentBench, WebArena) or flat MARL policies in
stateless games (MeltingPot, Crafter)..."

EMNLP-fit abstract:
"Language models increasingly serve as hierarchical decision-makers:
generating structured natural-language directives (schemas, plans,
policies) under long-horizon environmental feedback. Yet existing
NLP benchmarks evaluate LLMs in episodic single-turn settings or
isolated tool-use tasks, leaving the regime of *structured directive
generation under accumulating context and multi-channel resource
constraints* under-evaluated. We introduce Project-Utopia..."
```

### 4.2 §1 Intro 顺序调整

| NeurIPS 顺序 | EMNLP 顺序 |
|---|---|
| 1. Production hierarchical agent gap | 1. NLP eval gap (single-turn → multi-turn → hierarchical) |
| 2. AgentBench / WebArena 局限 | 2. Long-context / structured-gen / memory NLP 文献 |
| 3. 4-channel + deterministic substrate | 3. 4-channel as structured NLG with schema |
| 4. C1/C2/C3/C4 contributions | 4. C1/C2/C3/C4 (语言 framing) |

### 4.3 §2 Related Work 重排

EMNLP reviewer 想先看 NLP 文献：

```
原 NeurIPS:                           EMNLP:
A. Single-agent LLM tool-use     →    A. Long-context LLM evaluation (MOVE FIRST)
B. LLM-in-game                   →    B. Structured / constrained NLG
C. Multi-agent LLM coord         →    C. Multi-agent / dialogue systems
D. Long-context (NLP)            →    D. Hierarchical agent benchmarks
E. MARL                          →    E. LLM-as-policy in games (less emphasis)
F. Game-AI eval                  →    F. (omit or supplement)
```

### 4.4 §5 Experiment ordering

EMNLP audience 关心：
1. **E5 Memory degradation 三曲线** ← 优先；NLP audience 最 excited 的 finding
2. **E6 Schema-validated failure mode** ← 高 fit (schema = controllable NLG)
3. **E1 Hierarchical decomposition** ← OK fit
4. **E3 Multi-LLM** ← OK fit (cross-vendor heterogeneity)
5. **E2 Token decoupling** ← lower priority for EMNLP
6. **E4 Multi-resource RAE** ← lowest priority；可能放 supplement
7. **E7 DTE** ← OK fit (cost-aware now standard)
8. **E8 Bayesian methodology** ← OK fit
9. **E9 Reproducibility** ← OK fit

### 4.5 EMNLP 8-page 压缩策略

NeurIPS D&B 9 pages → EMNLP 8 pages：

| Section | NeurIPS pages | EMNLP pages | 压缩做法 |
|---|---|---|---|
| Abstract | 0.3 | 0.3 | 不变 |
| §1 Intro | 1.5 | 1.0 | 把 5 段 reduce 到 4 段；删一个 motivating example |
| §2 Related Work | 1 | 0.8 | 把 6 family 表合并为 4 family；frontier paper 大表移 supplement |
| §3 Architecture | 2 | 1.5 | 删 Figure 2 (4-layer reduction)，移 supplement；保留 Figure 1 |
| §4 Metric Stack | 2 | 1.7 | Figure 3 stack 浓缩；删 §4.7 α-rank 移 supplement |
| §5 Experiments | 4 | 3.0 | 9 个实验每个从 0.45 → 0.33 page；E2 / E4 / E8 / E9 部分内容移 supplement |
| §6-§8 | 1.5 | 0.8 | 紧凑写法 |
| **总计** | **9** | **8** | |

---

## 5. 最关键的"绿灯 / 黄灯 / 红灯"判定

| Submission Path | Verdict | 原因 |
|---|---|---|
| **NeurIPS D&B 2026** (deadline 2026-06-07) | 🟡 Yellow | 4-week sprint 紧但可达；自然 fit；reviewer pool 友好。**主推荐**。|
| **EMNLP 2026 R&E** (deadline 2026-06-15, ARR 已过则 direct) | 🟡 Yellow | Fit 不最佳但可行；需要 ~4 dev-day NLP framing 改造 + 加 multilingual ablation；reviewer pool 对 game-sim 中等友好。**Plan B**。|
| **NeurIPS D&B + EMNLP R&E 双投** | 🔴 Red | **不允许**——多数 venue 禁止 simultaneous submission；选一个 |
| **ICLR 2027 main** (deadline 2026-09-30) | 🟢 Green | 时间充裕 (4 month polish)；与 Orak 同 venue 是 differentiation 风险；**Plan B' if NeurIPS rejects** |
| **EMNLP 2026 Findings** | 🟢 Green | 自动 path if rejected from main |
| **NeurIPS Workshop** (e.g. FMDM, AI for Decision Making) | 🟢 Green | 退路 |

### 综合建议

**推荐路径**:
```
W1-W4: 全力冲 NeurIPS D&B 2026 (deadline 2026-06-07)
  ↓ if accept → camera-ready 期间 polish 24h E5 + LayerCast Tier 2
  ↓ if reject (likely 30-50% probability)

W5: 投 EMNLP 2026 R&E (deadline 2026-06-15) — 用 NeurIPS submission 反馈快速 NLP-fit 改造
  ↓ if accept main → done
  ↓ if Findings → done (acceptable)
  ↓ if reject

W10: 投 ICLR 2027 main (deadline 2026-09-30) — 充足时间打磨 + 加 partial observability ablation
  ↓ if reject

终极退路: NeurIPS / ICLR Workshop 2027
```

**EMNLP 单独投的判定**: 🟡 Yellow — 不是 first choice 但可投，需要 ~4 dev-day NLP framing 改造（§4.1-§4.5 已列）。**如果 NeurIPS D&B 路径完全失败**（赶不上 2026-06-07），EMNLP 是 next best 选择。

---

## 6. EMNLP-Specific Pre-Submission Checklist

如果 K1 决定 = EMNLP，按下表 prep（在 W3-W4 buffer 完成）：

- [ ] Abstract reframe to NLP-first
- [ ] §1 Intro 顺序调整 (NLP eval gap 先讲)
- [ ] §2 Related Work 重排：long-context NLP 先于 game-AI
- [ ] 加 §6.5 Multilingual Prompt Ablation (3 lang × 3 model × 5 seeds, ~6 GPU-h, ~$10)
- [ ] 加 §6.6 Linguistic Analysis of LLM Directives (length / hallucination / keyword consistency, no extra runs needed — analyze existing logs)
- [ ] §2 Related Work 加 5-8 篇经典 NLP eval cite (BLEU/ROUGE/METEOR/BERTScore/HumanEval/...)
- [ ] §4 Metric Stack 加 "Schema validation as NLG controllability" framing
- [ ] §5 Experiment 顺序按 EMNLP 优先级重排 (memory → schema → hierarchy → multi-LLM)
- [ ] 8-page 压缩 per §4.5 表
- [ ] EMNLP responsible NLP research checklist (类似 ARR)
- [ ] (optional) Datasheet for Datasets 仍可写，加 supplement 加分

---

## 7. Sources

- [EMNLP 2026 Call for Papers](https://2026.emnlp.org/) (待 confirm date)
- [ARR (ACL Rolling Review) calendar](https://aclrollingreview.org/)
- EMNLP 2024 / 2023 接收 papers (D&B/R&E track) 列表
- 同 venue 历年同类 paper review 模式

---

## 8. 总结判定

**问**: "评估我们研究在 EMNLP 的终稿绿"

**答**: 🟡 **Yellow / Conditional Green**——可投但不是最优 venue，**主推 NeurIPS D&B 2026**。EMNLP 作为 strong Plan B：
- 4 dev-day NLP framing 改造可达 ✓
- §2.5 memory 三曲线在 EMNLP 反而是 highlight ✓
- §2.3 cross-vendor multi-LLM 在 EMNLP 中性 ✓
- §2.4 multi-resource RAE 在 EMNLP 是 weakness ⚠️
- multilingual ablation 加分项 ✓
- 接收概率：估 35-45% (R&E track) vs 30-40% (NeurIPS D&B)
- Findings 退路稳 ✓

**真实期望**: NeurIPS D&B (primary) + EMNLP (backup) 双 path 设计；NeurIPS deadline 在 EMNLP 之前 7 天，可串行。

---

**End of EMNLP readiness assessment.**
