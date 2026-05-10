# Literature Survey — Benchmark Metric Design

**Status:** Draft v1 (2026-05-10)
**Scope:** 15 anchor papers across LLM-agent / LLM-in-game / MARL / memory / aggregation methodology
**Companion to:** `experimental-design.md` (E1–E9), `benchmark_proposal.md`, `refactor-plan.md`

> 本文档把"现有 benchmark 怎么定义指标 + 怎么聚合 + 怎么处理 stochasticity + 怎么主张可复现"系统盘点一遍，然后给出 Project-Utopia 应该 **直接借用 / 改造 / 主动填的洞** 的精确清单。论文写作时 §2 (related work) 与 §4 (metrics) 都直接引用本文。

---

## 0. Executive Summary — What to Borrow / What to Innovate

**直接借用（社区共识，零原创成本）：**

| Paper | 借的是什么 | 用到 Project-Utopia 哪里 |
|---|---|---|
| **Crafter** (Hafner 2021) | Geometric-mean over per-resource sufficiency `S = exp(mean(ln(1+sᵢ))) − 1` | RAE composite — punishes 单元资源饿死 |
| **Crafter** | Per-seed-then-average ordering（先 seed 再 average，避免 per-tick 假独立） | E1–E7 全部 Bayesian step 协议 |
| **MeltingPot 2** (Agapiou 2022) | `(focal − random) / (exploiter − random)` 三明治归一化 | 把 fallback 作为 R_random，oracle scripted policy 作为 R_exploiter，RAE/DTE 都套这个 [0, 1+] 量纲 |
| **AgentBoard** (Ma 2024) | **Progress Rate** = `max_t f(sₜ, g)` 让 partial credit 可见 | endless-survival 不能只报 binary "survived to day-X" |
| **BALROG** (Paglieri 2024) | 每 env normalize 到 [0, 100] + 5–25 seed × scenario × mean ± std | 替代当前 SimHarness 单 seed 跑 |
| **HELM** (Liang 2023) | Mean Win Rate `MWR_m = (1/|S|) Σ_s W_{m,s}` 跨 metric 排名 | 5 个 dimension plugin 量纲不一，MWR 给单数排名 |
| **GAIA** (Mialon 2023) | Level L1/L2/L3 difficulty tiers + 人类基线对照 | 6 map templates → easy/medium/hard 分桶 |
| **Lost-in-the-Middle** (Liu 2024) | "Report the curve, not a scalar" + U-shape 形状作为 contribution | E5d 直接复现的目标对象 |
| **LongMemEval** (Wu 2024) | Recall@k + GPT-4o judge with 97% human agreement | E5 anchored-fact recall 探针 |
| **Generative Agents** (Park 2023) | TrueSkill rating from pairwise rank + Kruskal-Wallis significance | LLM-on vs fallback 的 statistical test |

**Project-Utopia 主动填的洞（论文 contribution claim）：**

| Gap | 5+15 篇里**没人做** | Project-Utopia 怎么填 |
|---|---|---|
| Recall + Drift + Performance 三曲线联合 | 0 | E5 (§2.5) |
| 多资源 Pareto / Gini balance | 0（Catan 1-D，MineDojo tech tree 是偏序非流） | E4 RAE Gini (§2.4) |
| 单一基准里 4 个 LLM channel multi-LLM ablation | 0 | E3 (§2.3) |
| Cost-per-DevIndex-point (DTE) | 0（Voyager 仅定性提 GPT-4 比 GPT-3.5 贵 15×） | E7 (§2.7) |
| Bit-identical seeded reproducibility on LLM-driven sim | 0 | E9 (§2.9) |
| Programmatic 4 通道 schema rejection profile | 0 | E6 (§2.6) |

---

## A. LLM Agent Benchmarks (web/coding/multi-task)

### A.1 AgentBench (Liu et al., ICLR 2024)

- **URL**: https://arxiv.org/abs/2308.03688
- **Domain**: 8-环境组合 (OS shell, DB(SQL), KG, Card Game, Lateral Puzzle, ALFWorld household, WebShop, Mind2Web)
- **主指标**:
  - Per-env: `SR = success / total` 或 F1（DB）或 Reward∈[0,100]（WebShop）
  - Overall: `Σ wᵢ · SRᵢ_norm`，wᵢ 由"GPT-4 dev set 得分"做归一化分母
- **Aggregation**: Macro 平均 8 个 env 的归一化分；用 "GPT-4 dev = 1.0" 作 reference baseline
- **Stochasticity**: T=0，单 trial，**不报 CI** ← 后来 AgentBoard 主要批评点
- **Cost**: token + API call；不报 latency / USD
- **Reproducibility**: Docker 化每 env，prompt template 固定；LLM 本身随机故 non-bit-identical
- **借鉴**: "Macro 跨场景 + per-scenario normalize 到 reference baseline" 套路。GPT-4 ref 思路对应 Project-Utopia 的"fallback policy as R_random baseline"

### A.2 GAIA (Mialon et al., 2023)

- **URL**: https://arxiv.org/abs/2311.12983
- **Domain**: 466 道真实世界问题（多模态 + tool use + web 浏览 + 文件读 + 计算）；single-answer QA but 需要 long-horizon
- **主指标**: `accuracy = exact_match(model_answer, gold) / total` + quasi-exact match（数字容差、字符串规范化）
- **Aggregation**: 分 3 个 difficulty level (L1/L2/L3)，per-level + 总平均；300 公开 + 166 private
- **Stochasticity**: 单次回答；无 CI；**人类基线 92%** 提供对照（"题目单答案、可校验，single-shot 也算稳定"）
- **Reproducibility**: gold 锁死可自动 grade；但 web 状态会漂移（已知缺陷）
- **借鉴**: **分层级报告 + human-baseline 对照**——Project-Utopia 直接对应 6 maps × 3 tiers × fallback baseline

### A.3 WebArena (Zhou et al., ICLR 2024)

- **URL**: https://arxiv.org/abs/2307.13854
- **Domain**: 4 个 self-hosted 真实网站 (Gitlab/Reddit/shopping/CMS) + 2 工具 (Map/Wikipedia)，812 任务
- **主指标**: `task_SR = 1[programmatic_check_passes]`（每任务 oracle = URL match / DOM query / DB state check）；整体 `SR = Σ task_SR / N`
- **Aggregation**: Micro 平均 + per-website / per-intent (info-seek vs site-nav vs content-modify) breakdown
- **Stochasticity**: 单 trial，T=0；**未做多 seed**
- **Reproducibility**: **强**——完全 Docker 化，DB snapshot/restore，每任务 init from clean snapshot，oracle 是 deterministic state assertion
- **借鉴**: **Programmatic state oracle**（不是 LLM-as-judge）——Project-Utopia 已经在做对的事（DevIndex / survival ticks）；建议进一步把 RAE 也表达成可程序化 assertion

### A.4 AgentBoard (Ma et al., NeurIPS 2024)

- **URL**: https://arxiv.org/abs/2401.13178
- **Domain**: 9 任务 / 4 类（Embodied / Game / Web / Tool）
- **主指标 — 核心创新**: **Progress Rate** `pr = max_t f(sₜ, g)`，f = subgoal completion fraction ∈ [0,1]
  - 然后 `SR = 1[pr=1]`、`Avg Progress = mean(pr)`、配 **Grounding Accuracy**（合法 action ratio）+ **Progress vs Turn 学习曲线**
- **Aggregation**: Macro 平均跨 task；同时报 SR 和 PR（PR 暴露"partial progress 但最终失败"）
- **Stochasticity**: 3 seeds，主表 mean
- **Reproducibility**: 全 task 容器化 + subgoal annotation 公开；PR 是 deterministic state check
- **借鉴**: **直接借 Progress Rate**——endless survival 不该只报 binary "活到 X 天"，而是 `progress = min(devindex_at_T / target, 1.0)`。Subgoal 思路对应 Project-Utopia 的 `pop_30 / dev_year_1 / defended_tier_5 / all_dims_70` milestones（CLAUDE.md 已有）

### A.5 BALROG (Paglieri et al., ICLR 2025)

- **URL**: https://arxiv.org/abs/2411.13543
- **Domain**: 6 RL game env (BabyAI / Crafter / TextWorld / Baba is AI / MiniHack / NetHack)，难度跨度大
- **主指标**: `progressᵢ = 100 · raw_scoreᵢ / max_raw_scoreᵢ`，归一化到 [0, 100]；Overall = unweighted mean across 6 games
- **Aggregation**: Macro + per-env normalize to [0,100]（与 AgentBench 类似但分母用 env-defined max 而非 GPT-4 ref，避免 baseline 漂移）
- **Stochasticity**: **明确多 seeds：NetHack 5，简单 env 25**；主表 mean ± std
- **Cost**: episode length + tokens；leaderboard 含 cost-per-run
- **Reproducibility**: env 给 seed 是 fully deterministic；T=0；**bit-identical 不可能（LLM stoch），但 trajectory-level 可重现**
- **借鉴**: **多 seed × mean ± std 是 long-horizon stochastic env 的硬指标**——Project-Utopia 现在 single-seed 跑，必须升级到 ≥5 seed × scenario

---

## B. LLM-in-Games Benchmarks

### B.1 Voyager (Wang et al., 2023)

- **URL**: https://arxiv.org/abs/2305.16291
- **Domain**: Minecraft，GPT-4 as policy + 增长式 skill library
- **主指标**:
  - `unique_items_obtained` = |I_t|（"63 in 160 prompting iterations"）
  - **Tech-tree milestones**: prompting-iterations to {wood / stone / iron / diamond}
  - **Map traversal distance** (cumulative Manhattan)
  - **Zero-shot generalisation**: success k/3 on 4 unseen tasks
- **Aggregation**: relative ratio vs baselines（3.3× items, 2.3× distance, 15.3× faster milestones）；3 trials per task
- **Stochasticity**: 仅 3 trials，无 CI
- **Cost**: 仅定性提 GPT-4 比 GPT-3.5 贵 15×
- **借鉴**: **"distinct artifact count"** + **"tier-unlock wall-clock"**——Project-Utopia 可加 `distinct_buildings_ever_placed` 和 `seconds_to_first_kitchen` 作为 cheap long-horizon proxies

### B.2 Cicero (FAIR Diplomacy Team, *Science* 2022)

- **URL**: https://www.science.org/doi/10.1126/science.ade9097 (preprint mirror: gwern.net / noambrown.github.io)
- **Domain**: Diplomacy 7-player negotiation
- **主指标**:
  - `score_share s_i = SC_i / Σ_j SC_j`（supply-center fraction at game end）
  - **Average score**: Cicero 25.8% vs human 12.4% （**2.08× lift**）
  - **Percentile ranking**: top 10% of 82 opponents who played >1 game
- **Aggregation**: mean s_i over 40 games
- **Stochasticity**: 40-game corpus 是 n；无 CI 但 2× lift effect size 干净
- **Reproducibility**: 代码 + 模型权重开源 (facebookresearch/diplomacy_cicero)
- **Architecture**: explicit 两层 — intent model → piKL planner → dialogue conditioned on plans；ablations (no-dialogue, BC-only) 替代单数 hierarchy 指标
- **借鉴**: **"share of finite resource pool"** as ceiling-aware headline——Project-Utopia 可加 `fraction_habitable_tiles_developed` / `fraction_food_capacity_used`，这是 robust to map size 的好指标

### B.3 Generative Agents (Park et al., UIST 2023)

- **URL**: https://arxiv.org/abs/2304.03442
- **Domain**: 25-agent Sims-style sandbox，LLM 驱动 memory-stream + reflection + planning
- **主指标**:
  - **Believability via TrueSkill** (Herbrich): 100 Prolific raters 对 5 conditions (full / no-reflection / no-planning / no-memory / human-crowdworker) pairwise rank
    - Full: μ=29.89 σ=0.72；ablated: μ=21.21 σ=0.70；effect size **d = 8.16**
  - **Interview probes**: 5 类 (Self-Knowledge / Memory / Plans / Reactions / Reflections)
  - **Information diffusion** over 2 game-days: Sam mayoral candidacy 4% → 32%；Isabella party 4% → 52%
  - **Network density**: 0.167 → 0.74
- **Aggregation**: TrueSkill from pairwise rank；Kruskal-Wallis with p<0.001
- **借鉴**:
  1. **Information diffusion %** template → Project-Utopia 可加 *"% of workers re-tasked within 30s of LLM directive"* / *"% of agents converging on objective after strategy change"*
  2. **TrueSkill + Kruskal-Wallis** → 用于"LLM-on vs fallback 是否 meaningfully better"——这正是 Project-Utopia 缺的 statistical test 套路

### B.4 SmartPlay (Wu et al., ICLR 2024)

- **URL**: https://arxiv.org/abs/2310.01557
- **Domain**: 6 games × 9 capabilities (Bandit / RPS / Hanoi / Messenger×3 / Crafter / Minecraft)
- **主指标公式（直接照抄 Appendix D.2）**:
  - Per-game normalised: `s_g = (s_g^human − s_g^raw) / (s_g^human − s_g^min)`
  - Per-capability: `p_c^LLM = Σ_g d_{c,g} · s_g / Σ_g d_{c,g}`，d_{c,g} ∈ {0,1,2,3} 是 capability c 在 game g 中的 *challenge degree*
- **Aggregation**: capability scores 加权平均 across games；最终 radar plot per LLM
- **Stochasticity**: 10–100 trials per game；无 CI
- **借鉴**: **直接借 d_{c,g} 加权聚合**——Project-Utopia 把 6 maps 当 "games"，DevIndex sub-dimensions（economy/defense/population/meta）当 capabilities，weights 即 per-scenario challenge intensity

### B.5 MineDojo (Fan et al., NeurIPS 2022 Outstanding Paper)

- **URL**: https://arxiv.org/abs/2206.08853
- **Domain**: Minecraft，**3000+ tasks** in 4 programmatic groups (Survival / Harvest / Tech-tree / Combat) + Creative + Playthrough
- **主指标**:
  - Programmatic: binary SR over N episodes (Milk-Cow 64.5%, Combat-Pigman 87.5%)
  - **MineCLIP reward**: cos similarity between 16-frame video clip φ_v(o_{t-15:t}) 和 language goal φ_l(g)；DIRECT (raw similarity) / DELTA (Δ-similarity) 变种
  - Creative tasks: human MTurk binary judgement，agreement = **F1 between MineCLIP classifier vs human labels**
- **Aggregation**: per-task SR → per-group mean；F1 for creative
- **借鉴**: MineCLIP-style learned reward overkill；但 **"prompt-as-task" + binary scenario success + F1-against-human-judgement** 适合 Project-Utopia creative scenario（如"建立可防御的沿海贸易站"）

---

## C. Memory + MARL + Aggregation Methodology

### C.1 LongMemEval (Wu et al., ICLR 2025)

- **URL**: https://arxiv.org/abs/2410.10813
- **Core**: Chat assistants (LLM + memory modules) 在 ~50-session / ~115k-token 历史上能否维持 accuracy
- **主指标**:
  - QA accuracy = `E[1{judge(a_pred, a_gold) = correct}]`，judge 是 prompt-engineered `gpt-4o-2024-08-06` (>**97% human agreement**)
  - Retrieval probe: `Recall@k = |R_k ∩ E| / |E|`；`NDCG@k = DCG_k / IDCG_k`
  - Per-ability accuracy (5 abilities: IE/MR/KU/TR/ABS) → simple macro-mean
- **Stochasticity**: deterministic via fixed evidence/distractor placement；**不报 seed / CI**——judge prompt held constant + validated against humans 一次
- **Position-aware metric**: NO closed-form Recall(t)；position 是 dataset construction axis 而非 metric
- **借鉴**:
  1. **Recall@k / NDCG@k retrieval probe** → 直接对应 Project-Utopia §2.5 anchored-fact recall (k = top-k strategic-summary tokens)
  2. **GPT-4o judge with human meta-eval** → 现成的 "anchor presence in summary" 评分方式
  3. **重要差异**：LongMemEval 不把 recall 接到 downstream task；**Project-Utopia §2.5 三曲线 (Recall × Drift × Performance) 是真 gap**

### C.2 MeltingPot 2.0 (Agapiou et al., DeepMind 2022)

- **URL**: https://arxiv.org/abs/2211.13746
- **Core**: focal MARL pop. 在 256 scenarios 跨 cooperation/competition 下的 generalisation
- **主指标 — focal min-max normalization**:
  ```
  normalized_score(s) = (R_focal(s) − R_random(s)) / (R_exploiter(s) − R_random(s))
  ```
  - R_random = 上界 lower (uniform-random MAPLA, 10⁹ steps)
  - R_exploiter = 上界 upper (self-interested ACB/OPRE trained on that one scenario, 10⁹ steps)
  - Background-pop secondary: 0=只有一个 player 正回报；1=完全平等回报 (Gini-like equality bound)
- **Aggregation**: arithmetic mean across scenarios within substrate；substrates 保持 disaggregated（不强求 single global number）
- **Stochasticity**: 多训练 seeds per MAPLA；contest variant 用 bootstrap CI
- **借鉴 — 核心**: `(random, exploiter)` **三明治归一化**直接搬到 Project-Utopia
  ```
  RAE_norm = (RAE_LLM − RAE_fallback) / (RAE_oracle − RAE_fallback)
  ```
  - R_random ← 现有 deterministic fallback（无 LLM）—— `Guardrails.js` 的 DEFAULT_GROUP_POLICIES
  - R_exploiter ← scripted ColonyPlanner oracle（手工调出来的最优策略，per-scenario）
  - 给 §2.8 一个 principled [0, 1+] scale；模型可超 1.0 不破坏 math

### C.3 Crafter (Hafner, ICLR 2022)

- **URL**: https://arxiv.org/abs/2109.06780
- **Core**: 1M-step sandbox 单一数测 agent capability 全谱（exploration/hierarchy/memory/generalization）
- **主指标 — geometric-mean achievement score**:
  ```
  S = exp((1/N) Σᵢ ln(1 + sᵢ)) − 1
  ```
  - N=22 achievements，sᵢ = success rate %
  - +1/−1 shift 处理 sᵢ=0 而不丢 rare-achievement 放大性质
  - Reward (training signal) ≠ Score (eval signal) — 论文坚持只报 score
- **Difficulty weighting**: **隐式不显式** — Hafner 故意拒绝手工权重，几何平均 auto up-weight rare achievements
- **Stochasticity**: **10 random seeds**，full 1M step train；**先算 per-seed score，再 average 跨 seed**（顺序很重要——先 average per-tick 会膨胀 geometric mean）；±1σ shading；"within 95% of best" = bold（threshold convention，非 formal CI）
- **借鉴 — 核心 protocol**:
  1. **Geometric mean shape** for RAE composite: `RAE_geo = exp((1/4) Σ ln(1 + sᵢ)) − 1` over {food/wood/stone/herbs} sufficiency——punishes 单元资源饿死
  2. **Per-seed-then-aggregate ordering** 是 §2.8 Bayesian step 的正确协议——避免 per-tick 假独立膨胀 n

### C.4 HELM (Liang et al., TMLR 2023)

- **URL**: https://arxiv.org/abs/2211.09110
- **Core**: 7 metrics × 16 scenarios 多轴评测，避免 single-number trade-off
- **主指标 — Mean Win Rate**:
  - Per (scenario, metric)：per-instance score → scenario score
  - Win rate of model m on scenario s: `W_{m,s} = (1/(|M|−1)) Σ_{m'≠m} 1{score(m,s) > score(m',s)}`
  - **MWR**: `MWR_m = (1/|S|) Σ_s W_{m,s}` — 单数排名 ∈ [0,1]
- **Aggregation 哲学**: macro-average over scenarios after pairwise ranking。NOT micro（被大 scenario 主导）、NOT Pareto（虽然 HELM 也画 Pareto plot）、NOT raw arithmetic（量纲不可比）
- **Stochasticity**: 大多 T=0 / single decode；headline 表无 formal CI；多 seed 仅 selected ablations
- **借鉴**:
  - **MWR for cross-model leaderboard**——绕过 RAE [0,1] / DTE [tokens⁻¹] / collapse [count] 量纲不可比
  - **Beta-Binomial for per-metric pairwise significance** — 与 MWR 互补，不冲突：
    - MWR for ranking
    - Beta-Binomial 答 "model A 在 RAE 上是否 significantly outperform model B"

### C.5 Lost in the Middle (Liu et al., TACL 2024)

- **URL**: https://aclanthology.org/2024.tacl-1.9/ (preprint: 2307.03172)
- **Core**: LLM 是否均匀使用 long context，还是有 positional bias
- **主指标 — best-subspan accuracy as f(position)**:
  - `Acc(p) = (1/|Q|) Σ_q 1{any gold ∈ generated_text(q,p)}`，p = gold doc 在 k 个 distractor 中的 rank
  - Positions tested at k=20: indices 0/4/9/14/19
  - **Result: U-shape**—Acc(0), Acc(k−1) high；Acc(k/2) trough（~30%+ drop from peak）
- **Stochasticity**: single decode；**no seed averaging, no CIs**——U-shape effect size 大到不需要
- **Position-aware definition**: **Acc 报 curve，不 aggregated**——*shape 本身是 contribution*；无 AUC 或 mean-over-positions 复合数
- **借鉴**:
  1. **"Report the curve, not a scalar" convention** for §2.5 Recall(t) / Drift(t) plots
  2. 但 §2.8 需要单数排名时，定义 **mid-context degradation** `Δ = (Acc(t_start) + Acc(t_end))/2 − min_t Acc(t)`——直接对应 §2.5 Recall(t) 中段下沉

---

## D. Cross-Cutting Synthesis

### D.1 哪些做法是 5+15 篇里的"共识"

1. **Programmatic state-based oracle**（不是 LLM-as-judge）—— WebArena / AgentBoard / MineDojo / Crafter / MeltingPot 都做。Project-Utopia 已经在做对的事（DevIndex 程序化校验）。
2. **Macro 平均 + per-scenario breakdown**——AgentBench / WebArena / AgentBoard / BALROG / MeltingPot / HELM 都做。避免大场景稀释小场景。
3. **Containerized environment for reproducibility**——所有 5+ 个 LLM benchmark 都做。Project-Utopia 应配 minimal Dockerfile（E9 已包含）。
4. **Token / step count as secondary**——大多数现代 benchmark 已开始报；Project-Utopia 的 `aiRuntimeStats` 已经准备好。

### D.2 关键差异：聚合方法论谱系

| 方法 | 论文 | 优势 | 劣势 | 适合 Project-Utopia 哪里 |
|---|---|---|---|---|
| **GPT-4 dev as 1.0** | AgentBench | 跨 env 量纲对齐 | baseline 漂移（GPT-4 升级则需重新 normalize） | 不推荐 |
| **Per-env [0, 100]** | BALROG | 简洁、无 baseline 依赖 | 需要 env-defined max，不一定存在 | DevIndex 总分（已是 100 制） |
| **(random, exploiter) sandwich** | MeltingPot | principled [0, 1+]、score>1 表示超 oracle | 需要 scripted oracle（成本） | **首选**——RAE / DTE 归一化 |
| **Geometric mean** | Crafter | 自动放大 rare 维度 | 任一为 0 整体为 0（既是优点也是脆弱性） | RAE composite over 4 资源 |
| **Mean Win Rate** | HELM | 跨 metric 量纲对齐、robust to outliers | 丢失 effect size，需 ≥3 模型 | 跨模型 leaderboard |
| **Beta-Binomial posterior** | (Project-Utopia §2.8) | 可信区间、works for 2 models | 仅 [0,1] success-rate-like、需独立 trials | 单 metric 内 pairwise |
| **Capability × challenge weighting** | SmartPlay | 显式 task-specific 难度权重 | 需要专家主观 d_{c,g} | DevIndex sub-dim × scenario |
| **TrueSkill + K-W** | Generative Agents | 真严格 statistical test、pairwise 自然处理量纲 | 需要人评（成本） | LLM-on vs fallback condition test |

**推荐组合**: MeltingPot sandwich for normalization → Crafter geometric mean for RAE composite → MWR for cross-model leaderboard → Beta-Binomial within-metric → SmartPlay-style weighted aggregation across scenarios。**这套组合在文献里没人完整做过**。

### D.3 Stochasticity 的现状清单

| Benchmark | seeds | trials/task | CI? | 说明 |
|---|---|---|---|---|
| AgentBench | × (T=0) | 1 | ✗ | 弱点 |
| GAIA | × | 1 | ✗ | single-answer QA，可接受 |
| WebArena | × | 1 | ✗ | 弱点 |
| AgentBoard | 3 | — | mean 表 | 进步 |
| BALROG | **5–25** | — | mean ± std | **现代标杆** |
| Voyager | — | 3 | ✗ | 弱 |
| Cicero | — | 40 games | effect size | OK |
| Generative Agents | — | 100 raters | **K-W p<0.001** | **方法论标杆** |
| SmartPlay | — | 10–100 | ✗ | 中等 |
| MineDojo | 3 | — | ✗ | 弱 |
| Crafter | **10** | — | ±1σ shading | **训练时间充足时的标杆** |
| MeltingPot | 多 | — | bootstrap CI | 中等 |
| HELM | 1（多数） | 1 | ✗ | 弱 |
| LongMemEval | — | 1 | judge 与 human 97% agreement | OK |
| Lost-in-Middle | — | 1 | effect size 大 | OK |

**Project-Utopia 应该至少做到 BALROG / Crafter 水平**：每 (model, scenario) cell 跑 ≥5 seed，主表 mean ± std。**进一步拼上 Generative Agents 的 Kruskal-Wallis** 给"LLM-on vs fallback 是否真显著"加 statistical test 后台。

### D.4 Project-Utopia 主动填的洞 — paper §2 contribution claim

**社区这 15 篇中没人做的事**：

1. **Recall(t) × Drift(t) × Performance(t) 三曲线联合分析在自然产生的长程上下文上**
   - LongMemEval 有 Recall@k 没 task；Lost-in-Middle 有 task 没自然时间轴；Crafter / MeltingPot 没 recall。
   - Project-Utopia §2.5 三曲线 + 自然 sim-time = clean contribution。
2. **Multi-resource Pareto / Gini balance metric**
   - Diplomacy 1-D supply centers；MineDojo tech tree 是偏序非流；SmartPlay/Crafter 4-resource 但是 binary success。
   - Project-Utopia §2.4 RAE Gini × sufficiency = 第一次把多元资源分配作为独立 axis。
3. **Multi-LLM ablation (4 channel × 不同模型族) 的对比**
   - Cicero 是单一 LLM；其他全是。
   - Project-Utopia §2.3 director-vs-policy 的 SS/SW/WS/WW 矩阵 = 全新 design space。
4. **Cost-per-task-progress (DTE) 单一 axis**
   - Voyager 仅定性提；其他都把 token 当 secondary 副指标。
   - Project-Utopia §2.7 DTE = 把 token 提升到 primary axis，同时与 RAE 排序解耦。
5. **Bit-identical seeded reproducibility on LLM-driven sim**
   - 所有 LLM benchmark 都承认 LLM stoch → non-bit-identical；只有 RL benchmark (MeltingPot/Crafter) 在 deterministic env 下能。
   - Project-Utopia §2.9 在 fallback 模式下严格 bit-identical（已验证）；LLM-on 模式下 trajectory-level reproducible = 中间地带的最佳实践。
6. **Programmatic 4 通道 schema rejection profile**
   - 所有 LLM benchmark 把 schema rejection 当 noise 抹掉；none report 失败模式 fingerprint。
   - Project-Utopia §2.6 把 fallback / schema-reject / retry / latency 作为可观察变量 = 工业级 agent 系统首要关心的事，论文届缺。

---

## E. Concrete Recommendations for Project-Utopia Metric Layer

按优先级（**P0 必须改 / P1 强烈推荐 / P2 可选**）：

### P0 — 必须改

1. **`SimHarness` 升级为 multi-seed runner**：当前单 seed 跑出的数字是 anecdotal，必须改 ≥5 seed × scenario。`scripts/long-horizon-bench.mjs` 已有 `--seeds` 参数支持，需把测试 baseline 也升级。
2. **`ResourceAllocationEfficiency.js` 的 RAE composite 用 Crafter geometric mean**：
   ```js
   const sufficiencies = [foodSuf, woodSuf, stoneSuf, herbSuf];
   const rae_composite = Math.exp(sufficiencies.reduce((a, s) => a + Math.log(1 + s), 0) / sufficiencies.length) - 1;
   ```
   替换当前的 `clamp(food/demand) × clamp(wood/demand)` 双因子产品。
3. **MeltingPot sandwich normalization 接到 ScoringEngine**：
   ```js
   const score_norm = (score_LLM - score_fallback) / (score_oracle - score_fallback);
   ```
   需要新建 `src/benchmark/baselines/ScriptedOraclePolicy.js`（hand-tuned per scenario，~200 LOC）。
4. **Bayesian per-seed posterior，不是 per-tick**：当前 ScoringEngine 接受 sample array，需在文档里加 "samples 必须是 per-seed aggregated 结果"。

### P1 — 强烈推荐

5. **Progress Rate (AgentBoard) 加进 endless survival 评分**：除了 binary milestone (`pop_30`, `dev_year_1`...)，加 `progress = min(devindex_at_T / target, 1.0)` 给 partial credit。
6. **Difficulty tier (GAIA) 标注 6 maps**：明确把 `temperate_plains` / `fertile_riverlands` 标 L1，`rugged_highlands` / `coastal_ocean` 标 L2，`archipelago_isles` / `fortified_basin` 标 L3。论文表分 tier 报。
7. **Mean Win Rate (HELM) 作 cross-model 表**：所有维度 (RAE / GroupDynamics / Memory / DTE / Hierarchical) 用 MWR 给单数排名，伴随 per-dim Beta-Binomial 表。
8. **Information diffusion % (Generative Agents) 加 dimension**：定义 `% workers re-tasked within 30s of LLM directive`，这是 Hierarchical Coordination plugin 的一个直接子指标。

### P2 — 可选（论文优雅度）

9. **TrueSkill + Kruskal-Wallis** 用于 "LLM-on vs fallback / multi-LLM cells" condition ranking（E3 multi-LLM 实验直接受益）。
10. **Cicero score-share** 加 `fraction_habitable_tiles_developed` 作为 ceiling-aware secondary metric（防止 RAE 主指标饱和后看不出 ceiling）。
11. **Voyager-style "tier-unlock wall-clock"**：`seconds_to_first_kitchen / first_smithy / first_clinic` 作 cheap long-horizon proxies。
12. **MineDojo F1-against-human-judgement** 仅当 paper 有 budget 做 MTurk 时；适合 creative scenarios。

---

## F. Metric Stack — Final Recommended Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Cross-model leaderboard (paper Table 1)                          │
│   → Mean Win Rate (HELM)                                         │
└─────────────┬───────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│ Per-dimension model comparison (paper Tables 2–6)              │
│   → Beta-Binomial posterior on per-seed-aggregated scores      │
│   → Bootstrap CI for visual error bars                         │
└─────────────┬───────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│ Per-scenario score (per-cell of model × scenario × seed table) │
│   → MeltingPot sandwich norm: (LLM − fallback)/(oracle − fb)   │
│   → Crafter geometric mean composite for RAE                   │
│   → Progress Rate (AgentBoard) for endless survival            │
└─────────────┬───────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│ Per-tick raw signal (in-sim measurements)                      │
│   → existing dimension plugins: RAE / GroupDyn / Memory /      │
│     DTE / Hierarchical                                         │
│   → per-channel aiRuntimeStats (token, latency, fallback)     │
└─────────────────────────────────────────────────────────────────┘
```

每一层都对应文献先例：上至下分别是 **HELM / Bayesian (Project-Utopia §2.8) / MeltingPot+Crafter / 现有 dimension plugins**。

---

## G. Sources (按时间排序)

1. [Crafter — Hafner 2021](https://arxiv.org/abs/2109.06780)
2. [HELM — Liang et al. 2023 (TMLR)](https://arxiv.org/abs/2211.09110)
3. [MeltingPot 2.0 — Agapiou et al. 2022](https://arxiv.org/abs/2211.13746)
4. [MineDojo — Fan et al. 2022](https://arxiv.org/abs/2206.08853)
5. [Cicero — FAIR 2022 (Science)](https://www.science.org/doi/10.1126/science.ade9097)
6. [Generative Agents — Park et al. 2023](https://arxiv.org/abs/2304.03442)
7. [Voyager — Wang et al. 2023](https://arxiv.org/abs/2305.16291)
8. [WebArena — Zhou et al. 2024 (ICLR)](https://arxiv.org/abs/2307.13854)
9. [AgentBench — Liu et al. 2024 (ICLR)](https://arxiv.org/abs/2308.03688)
10. [SmartPlay — Wu et al. 2024 (ICLR)](https://arxiv.org/abs/2310.01557)
11. [GAIA — Mialon et al. 2023](https://arxiv.org/abs/2311.12983)
12. [Lost in the Middle — Liu et al. 2024 (TACL)](https://aclanthology.org/2024.tacl-1.9/)
13. [AgentBoard — Ma et al. 2024 (NeurIPS)](https://arxiv.org/abs/2401.13178)
14. [LongMemEval — Wu et al. 2025 (ICLR)](https://arxiv.org/abs/2410.10813)
15. [BALROG — Paglieri et al. 2025 (ICLR)](https://arxiv.org/abs/2411.13543)

---

**End of survey.** 写论文 §2 (related work) 时按 A/B/C 类别分段；§4 (metrics) 按 §F 的四层 stack 展开。
