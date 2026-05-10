# Literature Survey — Benchmark Metric Design

**Status:** Draft v2 (2026-05-10)
**Scope:** 30 anchor papers across 6 clusters
**Companion to:** `experimental-design.md` (E1–E9), `paper-framework.md`, `benchmark_proposal.md`, `refactor-plan.md`
**Sister doc:** `literature-game-ai-metrics.md` (cluster F — RL/game-AI evaluation methodology)

> 本文档把"现有 benchmark 怎么定义指标 + 怎么聚合 + 怎么处理 stochasticity + 怎么主张可复现"系统盘点一遍，然后给出 Project-Utopia 应该 **直接借用 / 改造 / 主动填的洞** 的精确清单。论文写作时 §2 (related work) 与 §4 (metrics) 都直接引用本文。

---

## 0. Executive Summary — What to Borrow / What to Innovate

**直接借用（社区共识，零原创成本）：**

| Paper | 借的是什么 | 用到 Project-Utopia 哪里 |
|---|---|---|
| **Crafter** (Hafner 2021) | Geometric-mean over per-resource sufficiency `S = exp(mean(ln(1+sᵢ))) − 1` | RAE composite — punishes 单元资源饿死 |
| **Crafter** | Per-seed-then-average ordering | E1–E7 Bayesian step 协议 |
| **MeltingPot 2** (Agapiou 2022) | `(focal − random) / (exploiter − random)` 三明治归一化 | RAE/DTE 全部 [0,1+] 量纲 |
| **AgentBoard** (Ma 2024) | **Progress Rate** `pr = max_t f(sₜ, g)` 让 partial credit 可见 | endless-survival 不能只 binary |
| **BALROG** (Paglieri 2024) | 每 env normalize 到 [0,100] + 5–25 seed × scenario × mean ± std | 替代当前单 seed 跑 |
| **HELM** (Liang 2023) | Mean Win Rate `MWR_m = (1/|S|) Σ_s W_{m,s}` | 跨 metric 量纲不一时单数排名 |
| **GAIA** (Mialon 2023) | Level L1/L2/L3 difficulty tiers + 人类基线 | 6 map templates → easy/medium/hard 分桶 |
| **Lost-in-the-Middle** (Liu 2024) | "Report the curve, not a scalar" + U-shape | E5d 直接复现的目标 |
| **LongMemEval** (Wu 2024) | Recall@k + GPT-4o judge with 97% human agreement | E5 anchored-fact recall 探针 |
| **Generative Agents** (Park 2023) | TrueSkill rating + Kruskal-Wallis significance | LLM-on vs fallback statistical test |
| **OpenAI Five** (Berner 2019) | TrueSkill (μ, σ) for low-sample multi-LLM matrix | E3 SS/SW/WS/WW cell ranking |
| **Pluribus** (Brown 2019) | **AIVAT → PolicyValue Baseline (PVB)** 减 2–4× seed variance | 全部 E 实验的方差缩减（最高 leverage win）|
| **OpenSpiel** (Lanctot 2019) | α-rank 处理非传递性 | E3 multi-LLM matrix 出现 rock-paper-scissor 时 |
| **AlphaStar** (Vinyals 2019) | League learning + exploiter prompts | E3 红队压力测试 |
| **FTW** (Jaderberg 2019) | Reaction-time-matched fairness | LLM thinking-token budget cap (200 tokens) |
| **MetaGPT** (Hong 2023) | Publish-subscribe message pool + Productivity (tokens/output) | 4-channel directive bus 直接类比 |
| **ChatDev** (Qian 2023) | Quality = Completeness × Executability × Consistency 多轴乘积 + −44% role-removal benchmark | E1 hierarchy ablation 效应量目标 |
| **AgentVerse** (Chen 2023) | "GPT-3.5 collaboration 反而退化" 的 prior art | E3 WW cell 假设的支撑 |
| **CAMEL** (Li 2023) | Failure-mode 分类 (role-flip / instruction-repeat / flake / infinite-loop) | 4 channel pathology checklist |
| **Concordia** (Vezhnevets 2023) | Game-Master-as-broker | grid/state-as-deterministic-broker for 4 channels |
| **OSWorld** (Xie 2024) | VM snapshot revert + 自托管 mirror | E9 reproducibility env 重置 |
| **MLE-Bench** (Chan 2024) | Docker pin + 独立 grading server + ≥3 seeds + mean ± SEM | E9 最严格 reproducibility spec 模板 |

**Project-Utopia 主动填的洞（论文 contribution claim）：**

| Gap | 30 篇里**没人做** | Project-Utopia 怎么填 |
|---|---|---|
| Recall + Drift + Performance 三曲线联合 | 0 | E5 (§2.5) |
| 多资源 Pareto / Gini balance | 0 (Catan 1-D，MineDojo 偏序非流，SmartPlay/Crafter binary) | E4 RAE Gini (§2.4) |
| 单一基准里 4 个 LLM channel × 异质模型 SS/SW/WS/WW matrix | 0（AgentVerse 只跑同模型对照；ChatDev/MetaGPT 同模型拆角色）| E3 (§2.3) |
| Cost-per-DevIndex-point (DTE) | 0（Voyager 定性、MetaGPT Productivity 是 token/code-line 不到任务进度）| E7 (§2.7) |
| Bit-identical seeded reproducibility on LLM-driven sim | 0（仅 RL benchmark 在 deterministic env 下能；LLM benchmark 全部承认非 bit-identical）| E9 (§2.9) |
| Programmatic 4 通道 schema rejection profile | 0 | E6 (§2.6) |
| Action-grounded recall vs verbal recall 解耦 | 0（NIAH/RULER 仅 verbal）| E5 子分维度 |
| Record-replay LLM cache + graceful fallback degrade | 0 | E9 (§2.9) novel infrastructure |

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

## D. Multi-Agent LLM Coordination (5 篇 — §2.3 multi-LLM 直接 prior art)

### D.1 Concordia (Vezhnevets et al., DeepMind 2023)

- **URL**: https://arxiv.org/abs/2312.03664
- **Domain**: Generative Agent-Based Modeling (GABM) — town elections, business operations, social-psych scenarios
- **Architecture**: N agents (4–10) + **Game Master (GM) orchestrator** as deterministic state-keeper. GM resolves conflicting actions; agents 之间通讯均通过 GM broker。Components-based agent: LLM call + associative memory
- **主指标**: 无 closed-form score；validation 是 evidence hierarchy（direct test data > ecological validity > algorithmic fidelity > model comparison > sensitivity > theory consistency）。Per-experiment grounded variables 在 individual + societal 两层 logged
- **Stochasticity**: 承认但无显式 seeds/CI（follow-up arXiv:2512.03318 引入 Likert + return-correlation 方法）
- **Cross-LLM matrix**: **未做**——明确说 "any particular LLM will be better at simulating some people over other people" 但 deferred
- **Reproducibility**: 开源 (github.com/google-deepmind/concordia)，Codespace dev env
- **借鉴**: **Game-Master-as-broker pattern**——deterministic state authority 防止 hallucinated coordination。Project-Utopia 的 grid + `Guardrails.js` 已经是 Concordia 的 GM 等价物

### D.2 ChatDev (Qian et al., ACL 2024)

- **URL**: https://arxiv.org/abs/2307.07924
- **Domain**: Software development，5 roles in 3 phases (CEO + CTO → Programmer → Reviewer + Tester)；SRDD benchmark = 1200 prompts × 5 cat × 40 subcat
- **Architecture**: 每 subtask 是 instructor-assistant 二元；通讯 via **chat-chain**: vanilla `⟨I→A, A↝I⟩↻` + **communicative dehallucination**: `⟨I→A, ⟨A→I, I↝A⟩↻, A↝I⟩↻`
- **主指标公式**:
  ```
  Quality = Completeness × Executability × Consistency
  Consistency = cos(e_req, e_code)
  ```
  ChatDev: 0.5600 / 0.8800 / 0.8021 / **0.3953** vs MetaGPT 0.1523 vs GPT-Engineer 0.1419
- **Aggregation**: Macro-mean 1200 prompts (uniform 30/subcat)
- **Stochasticity**: 单 run，无 CI
- **Ablations — directly relevant to E1/E3**:
  - Remove communicative dehallucination: Quality 0.3953 → 0.3094 (**−21.7%**)
  - **Remove role assignments (single-LLM-all): Quality 0.3953 → 0.2212 (−44%)** ← canonical effect-size benchmark
- **Cost**: 148.2 s runtime + **22,949 tokens** + 4.39 files + 144.3 LOC per task
- **借鉴 — 直接**:
  1. **Quality = product-of-axes**——防止单强轴掩盖另一轴塌陷；Project-Utopia RAE composite 应用 product (or geometric mean) 而非 mean
  2. **−44% role-removal delta** = E1 hierarchical-vs-flat 的效应量目标——目标至少打平这个数

### D.3 AgentVerse (Chen et al., ICLR 2024)

- **URL**: https://arxiv.org/abs/2308.10848
- **Domain**: 5 task families (FED text understanding / MGSM + Logic-Grid reasoning / HumanEval coding / 10 tool-use / Minecraft embodied)
- **Architecture**: **4-stage iterative pipeline**: Expert Recruitment → Collaborative Decision (horizontal democratic OR vertical solver-reviewer) → Action Execution → Evaluation → loop。Agent 数动态 per task
- **主指标**: domain-specific (Pass@1: HumanEval 89.0% group vs 87.2% solo with GPT-4；MGSM acc；FED win-rate；tools success-rate 9/10 group vs 3/10 ReAct)
- **Aggregation**: per-task，无全局聚合
- **Ablations — strong solo vs multi-agent at fixed LLM**: critically **GPT-3.5 sometimes degrades under collaboration** ("susceptibility to erroneous feedback") ← **直接 prior art for Project-Utopia E3 WW cell hypothesis**
- **3 emergent behaviors**: volunteer / conformity / **destructive (safety concern)**
- **借鉴**:
  1. Horizontal-vs-vertical structural toggle 作为二阶 ablation
  2. **WW degradation 是 cited prior art**——E3 论文写作时直接引

### D.4 CAMEL (Li et al., NeurIPS 2023)

- **URL**: https://arxiv.org/abs/2303.17760
- **Architecture**: 严格 2-agent (AI User + AI Assistant) + Task Specifier 预处理；inception prompting；终止 token `<CAMEL_TASK_DONE>`
- **主指标**: GPT-4-as-judge pairwise preference + human eval。AI Society: CAMEL 76.3% human / 73.0% GPT-4 wins vs single-shot
- **失败模式分类**（**直接借用 §2.6**）: role flipping / instruction repetition / flake replies / infinite loops
- **借鉴**:
  1. 失败模式 taxonomy → Project-Utopia 4 channel pathology checklist
  2. 2-agent + Task Specifier 是 4-channel 退化案例；inception prompting 对称性可作 null baseline

### D.5 MetaGPT (Hong et al., ICLR 2024)

- **URL**: https://arxiv.org/abs/2308.00352
- **Architecture**: **5 SOP-encoded roles** (Product Manager / Architect / Project Manager / Engineer / QA Engineer) + **shared message pool publish-subscribe**（NOT free chat）— agents 发布 structured documents，其他 subscribe role-relevant 内容
- **主指标**:
  - Pass@1 (HumanEval 85.9%, MBPP 87.7% with GPT-4)
  - Executability (1–4 scale; MetaGPT 3.75)
  - **Productivity = tokens / code-line** (MetaGPT 124.3 vs ChatDev 248.9 = 2× efficiency)
  - **Human Revision Cost** (0.83 manual fixes/task)
- **Ablations — best-in-cluster role progression**: Engineer-only → +PM → +Arch → +PjM → +QA monotonically lifts Executability 1.0 → 4.0 / revisions 10 → 2.5
- **借鉴 — 直接**:
  1. **Publish-subscribe message pool** is the cleanest analog to Project-Utopia 4-channel directive bus
  2. **Role-progression ablation curve**（每加 1 channel 看效应）= E1 增量 ablation 模板

### D.x Cross-cluster (multi-agent) takeaways

**Q1: Strong+weak heterogeneous LLM mix 被研究过吗？** 大体 **没有**。所有 5 篇默认 single backbone（GPT-3.5 in CAMEL/early ChatDev；GPT-4 in MetaGPT/late-ChatDev/AgentVerse-headline）。**AgentVerse 最接近**：同 pipeline 在 GPT-3.5 vs GPT-4 各跑了一次，**collaboration 帮 GPT-4 但伤 GPT-3.5**——但**没有跨**（无 GPT-4-director + GPT-3.5-workers mix）。**Project-Utopia E3 SS/SW/WS/WW matrix 是真空的**。

**Q2: Channel specialization quantification**——3 套可重用模式：
1. **MetaGPT role-removal monotonicity**（leave-one-out 边际贡献）
2. **ChatDev −44% effect size**（canonical 数字）
3. **CAMEL GPT-4-judge pairwise attribution**（黑盒）
推荐 Project-Utopia E3 三套全报：(per-channel removal Δ) × (token share by channel) × (judge influence share)

**Q3: §2.3 SS/SW/WS/WW 实验所需的测量工具**全部现成：ChatDev (Quality 公式) + MetaGPT (publish-subscribe + Productivity 成本指标) + AgentVerse (cross-backbone 比较 + WW 退化警告) + CAMEL (failure taxonomy) + Concordia (GM-as-broker 防止 hallucinated coord)。**E3 是新实验，但工具链 prefab。**

---

## E. Long-Context Evaluation + Modern Agent Benchmarks (5 篇 — §2.5 / §2.9 直接 prior art)

### E.1 RULER (Hsieh et al., COLM 2024)

- **URL**: https://arxiv.org/abs/2404.06654
- **Core question**: 模型 *声明* context window 是否匹配 *实际* 可用 context？
- **主指标**: per-task accuracy（substring/exact match for retrieval；exact match for variable tracking；accuracy for QA）。**Effective context length** = 最大 length 使 mean score across 13 tasks > 固定 threshold (Llama2-7B-4K baseline)。13 tasks × 4 families: NIAH (single/multi-key/multi-value/multi-query), variable tracking (multi-hop), common/frequent-words extraction, SQuAD/HotpotQA
- **Length tested**: 4K / 8K / 16K / 32K / 64K / 128K (some 1M)
- **Stochasticity**: fixed prompt templates × multiple sampled needle positions；**未报 seed / CI**（公认弱点）
- **Distractor**: 完全 synthetic（essays + UUID-key dictionaries）
- **借鉴**: **RULER 测合成 distractor 下的 retrieval；Project-Utopia 测 *自然 cumulative agent action history* 下的 task-grounded recall**——清楚区分而非超越

### E.2 NIAH (Kamradt 2023, no formal paper)

- **URL**: https://github.com/gkamradt/LLMTest_NeedleInAHaystack
- **Core question**: 模型能否在任意长度 haystack 任意深度 retrieve 单个 planted "fact"？
- **主指标**: LLM-judge 或 substring score per (depth%, context_len) cell，2D heatmap
- **Position-aware by construction**: heatmap *本身* 是 metric
- **Stochasticity**: single-trial-per-cell visualization，非 statistical benchmark
- **借鉴**: **2D heatmap 是 §2.5 三曲线的 visualization template**；但 Project-Utopia 的 needle 应是 *causally-consequential anchor* (e.g. "tick 50 warehouse 放在 (12, 8)")，且 probe 是 *action distribution at tick 5000* 而非 verbal recall

### E.3 InfiniteBench / ∞Bench (Zhang et al., ACL 2024)

- **URL**: https://arxiv.org/abs/2402.13718
- **Core question**: 超 retrieval，能否在 >100K-token contexts 上 *reasoning*（En + Zh）
- **主指标**: per-task task-native scores (Acc / EM / ROUGE / pass@1 for code)，average across 12 tasks in 5 domains (math / code / novel QA / dialogue / retrieval / KV)；avg context ~192K tokens
- **真实材料 vs 合成 distractor**: 全长小说 / 真实代码库 / 真实对话 + 几个合成 stress test (KV retrieval / math.find)
- **借鉴 — 关键 positioning anchor**: Project-Utopia 累积的 4-channel sim trace 是 *natural data*（更接近 InfiniteBench 小说/代码）而非 RULER UUID 填充的 distractor。论文 framing：
  - "RULER measures retrieval under synthetic distractors"
  - "InfiniteBench measures reasoning over realistic long documents"
  - **"Project-Utopia measures causally-grounded long-horizon recall where the anchor must shape downstream action policy or the colony dies"**

### E.4 OSWorld (Xie et al., NeurIPS 2024)

- **URL**: https://arxiv.org/abs/2404.07972
- **Core question**: Multimodal agent 在 369 真实桌面任务（Ubuntu / Windows / macOS）上能否完成（仅 screen + keyboard + mouse）
- **主指标**: Execution-based success rate `success = 1[post_state ⊨ φ_task]`，φ_task 是 per-task Python assertion over post-execution OS state
- **Result**: 人类 72.36% vs best agent 12.24%
- **Reproducibility（§2.9 直接相关）**:
  - **VM/Container**: vmware/virtualbox/docker/AWS providers；agent runs against snapshotted VM image；每任务 init from clean snapshot 是 OS-state-reset analogue of `git checkout`
  - **Network nondeterminism**: 自托管 local mirrors of web services + proxy；任务 oracle 跑在本地 VM filesystem 而非 live network
  - **Headless mode** 支持
  - **GPU determinism**: 未深度处理；screenshot→action loop 容忍 pixel-level non-det because oracle 是 state assertion 不是 pixel
  - **Seeds**: 标准 1–3 trials per task；未报 task-level Wilson CI
- **借鉴**: **VM snapshot revert pattern** 直接对应 Project-Utopia tick-0 state snapshot；**oracle = state assertion 不是 pixel** 是 Project-Utopia 已有 (DevIndex / survival ticks 都是 state)

### E.5 MLE-Bench (Chan et al., OpenAI ICLR 2025)

- **URL**: https://arxiv.org/abs/2410.07095
- **Core question**: Agent 能否在真实 Kaggle ML 工程问题上达到 bronze 牌
- **主指标**: `AnyMedal% = (1/N) Σ 1[score_i ≥ bronze_threshold_i]`，threshold 来自每 Kaggle 历史 leaderboard。报 Low / Medium / High complexity splits
- **Reproducibility（最严格 spec, 5 papers within）**:
  - **Container**: pinned base image `mlebench-env`，`Dockerfile --platform=linux/amd64`，conda env baked in，`INSTALL_HEAVY_DEPENDENCIES` build arg
  - **独立 grading server** 验证 submission——agent 接触不到 grader code
  - **Data**: Kaggle datasets local mirror via Git-LFS (`mlebench prepare --all`, ~2 days)
  - **GPU**: 36 vCPU / 440 GB RAM / 1× 24GB A10 推荐；CUDA seed pinning **未文档化**
  - **Seeds**: **强制 ≥3 seeds**，报 **mean ± SEM**
  - **Network**: intentionally unconstrained（已知非确定性源——pip install 不同包版本）
- **借鉴 — 直接**:
  1. Docker pin + conda env + heavy-deps build arg
  2. **独立 grading server 模式**——Project-Utopia 应做 `utopia-eval` (frozen sim + grader) 与 `utopia-agent-base` (untrusted) 分离 container
  3. **≥3 seeds + mean ± SEM** 是 baseline；Project-Utopia 应去 ≥5 seeds + Wilson CI

### E.x Cross-cluster (long-context + reproducibility) takeaways

**Q1: 长上下文 SOTA**？RULER for *probing* claimed context；InfiniteBench for *realistic* long-context reasoning；NIAH 是 visualization template 不再是 benchmark（everyone passes it）。

**Q2: Project-Utopia 在哪里站位**？**Orthogonal not superior**——三个 long-context paper 测 passive document recall/reasoning；Project-Utopia 测 *agent's own causally-coupled action history*，忘 warehouse 位置 *kills the colony*。Different stress, complementary。

**Q3: 最严格 reproducibility spec**：MLE-Bench (Docker pin + ≥3 seeds + mean ± SEM + grading server)。OSWorld 最强的是 *environment* reproducibility (VM snapshots)。Project-Utopia 应明确 cite 两者：**"Container + grader 来自 MLE-Bench；snapshot-revert 来自 OSWorld；record-replay LLM cache 是 novel"**。

**Q4: 三曲线设计的清晰度**：传统 long-context paper（NIAH/RULER/Lost-in-Middle）只测 verbal recall；InfiniteBench 测 reasoning；**Project-Utopia 三曲线 = verbal recall (anchor token in summary) × action-grounded recall (action distribution still reflecting anchor) × causal counterfactual (剥夺 anchor 后 RAE 衰减)**——这种 3-way 解耦 30 篇里没人做。

---

## F. Game-Playing AI Evaluation Methodology (5 篇 — 详见 sister doc)

详见 `literature-game-ai-metrics.md`。简略要点（论文写作时引用此处）：

| Paper | 关键贡献给 Project-Utopia | 用到哪 |
|---|---|---|
| **AlphaStar** (Vinyals 2019, *Nature*) | League learning + payoff matrix + PFSP opponent stratification | E3 lightweight league × red-team exploiter prompts |
| **OpenAI Five** (Berner 2019) | TrueSkill (μ, σ) + γ-horizon ablation | E3 multi-LLM 排名；E5 long-horizon credit assignment 类比 |
| **Pluribus** (Brown & Sandholm 2019, *Science*) | **AIVAT → PolicyValue Baseline (PVB)** | **全部 E 实验方差缩减 2–3×（最高 leverage）** |
| **FTW** (Jaderberg 2019, *Science*) | Reaction-time-matched fairness + held-out-map gen-gap | LLM thinking-token budget cap；E1 generalization gap |
| **OpenSpiel** (Lanctot 2019) | α-rank + NashConv + exploitability | E3 multi-LLM 排名出现非传递性时 |

**最高 leverage finding from cluster F**: **AIVAT → PVB**。Pluribus 在 poker 上获 2–10× variance reduction；Project-Utopia 保守 2–3×，意味 E1–E7 用 5–8 seeds 而非 25 seeds 仍可有 statistical power → **3–5× compute saving**。**E1 scale-up 前应实现**。

---

## G. Cross-Cutting Synthesis

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
