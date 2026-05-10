# Experimental Design — Project-Utopia Academic Benchmark

**Status:** Draft v1 (2026-05-10)
**Companion to:** `benchmark_proposal.md` (research framing), `refactor-plan.md` (cut list), `determinism-report.md` (S0 audit)
**Branch:** `refactor/academic-benchmark` (tag `refactor/academic-benchmark-v0.11.0-rc1`)

> 这份文档把 §2.1–§2.9 的 9 个创新点逐个落到**可执行的实验设计**：每个实验有研究问题、假设、因子结构、seeds、模型选型、采集指标、期望结果形状、算力预算、有效性威胁。论文的实验章 (§4–§5) 应该按这份逐节展开。

---

## 0. 共享实验基础设施

### 0.1 场景集合

| ID | Template | 初始资源 | 初始 worker | 主要压力 | 备注 |
|---|---|---|---|---|---|
| `S-PLAINS` | `temperate_plains` | balanced (food=120, wood=60, stone=10) | 8 | 一般 (raid 频率 normal) | 基线 / 对照 |
| `S-BASIN` | `fortified_basin` | scarce stone (food=120, wood=60, stone=2) | 8 | 高 raid + chokepoint | 防御 + 瓶颈推理测试床 |
| `S-PLAINS-FAMINE` | `temperate_plains` + crisis | food=40 | 8 | 食物危机 cascade | RAE sufficiency 极限 |
| `S-BASIN-SIEGE` | `fortified_basin` + crisis | balanced | 8 | raid escalation 拉满（DevIndex tier→ pressure 比 normal 高 50%） | 长程对抗 |
| `S-PLAINS-LARGE` | `temperate_plains` | balanced | 24 | normal | 测 token cost vs world size 解耦 |

`crisis` 通过 `src/benchmark/framework/CrisisInjector.js` 注入。

### 0.2 Seed 集合

主实验：`{0xC0FFEE, 0xBEEF, 0xCAFE, 0xDEAD, 0xFACE, 0xFADE, 0xF00D, 0xDECAF, 0xACED, 0xBABE}` — 10 seeds

灵敏度子实验：仅前 3 个 seed (`0xC0FFEE, 0xBEEF, 0xCAFE`)

每个 (model, scenario, seed) 是一个 cell；同 cell 可复跑 N=3 次以测 LLM-on 模式的 wall-clock variance（fallback 模式同 seed 必出同 hash，N=1 即可）。

### 0.3 模型集合

| ID | 简称 | 家族 | 用途 |
|---|---|---|---|
| `M-CLAUDE-OPUS` | Claude-Opus-4.7 | Claude | 强基线 |
| `M-CLAUDE-SONNET` | Claude-Sonnet-4.6 | Claude | 中量 |
| `M-CLAUDE-HAIKU` | Claude-Haiku-4.5 | Claude | 轻量 |
| `M-GPT5` | GPT-5-mini | OpenAI | 跨家族对照 |
| `M-HERMES7B` | Hermes-3-7B | Mistral | 本地 vLLM (open weights) |
| `M-LLAMA8B` | Llama-3.1-8B-Instruct | Meta | 本地 vLLM |
| `M-QWEN72B` | Qwen-2.5-72B-Instruct | Alibaba | 本地 vLLM |
| `M-FALLBACK` | (no LLM) | — | `state.ai.coverageTarget = "fallback"`，用 `Guardrails` 默认策略 — 免费对照组 |

模型可通过 `OPENAI_BASE_URL` 切换到 vLLM / llama.cpp-server / Ollama。

### 0.4 Tick rate 与 budget

- `dt = 1/30 s`, `runtimeProfile = "long_run"`
- 默认 `durationSec = 7200` (2 sim-hour)
- LLM-on per-run budget: `maxTokens = 500_000`, `wallclockSec = 3600` (1 真实小时)

### 0.5 公共 manifest 字段

每个 run 写一行 JSONL：
```json
{
  "runId": "...", "experiment": "E3",
  "seed": "0xC0FFEE", "scenario": "S-PLAINS",
  "agents": {"environment-director": "M-CLAUDE-OPUS", ...},
  "schemaVersion": "1.0",
  "simulator": {"sha": "<git sha of refactor/academic-benchmark>", "tag": "v0.11.0-rc1"},
  "results": "metrics.ndjson"
}
```

---

## E1 — Hierarchical Decomposition is Necessary (§2.1)

### Research question
**当 token budget 匹配时，4 通道分层 LLM 架构是否优于"单一 flat LLM 直接产生 NPC primitive 行动"基线？**

### Hypothesis
**H1**: 在同样 LLM token budget 下，分层 (4-channel) 架构的 RAE-sufficiency 时间加权均值 显著高于 flat-baseline 至少 0.10（绝对值）。

### Design

| Factor | Levels |
|---|---|
| Architecture | `hierarchical` (现在的 4 channel) / `flat-baseline` (单 LLM 直接出每个 worker 的 FSM 状态偏好) |
| Scenario | S-PLAINS, S-BASIN |
| Seed | 10 主 seed |
| Model | M-CLAUDE-SONNET 固定（全 4 通道用同一个，flat 用同一个，token budget 也对齐） |
| Token budget | 200k tokens / run |

总 cells: 2 × 2 × 10 = **40 runs**

### Implementation note
`flat-baseline` 是一个新 `AgentAdapter` 实现：每 5 秒调一次 LLM，把 NPCBrainSystem 的 group payload 拆开 broadcast 成"per-worker hint"。需要写 `src/benchmark/baselines/FlatBaselineAdapter.js`（约 ~150 LOC）。

### Metrics
- 主：**RAE-composite**（time-weighted mean of `rae_sufficiency`）
- 副：**survival rate**（end-of-run alive workers / initial workers）
- 副：**token efficiency** (RAE-composite / total completionTokens)

### Expected table

| Architecture | Scenario | RAE-sufficiency (mean ± 95% CrI) | Survival | Tokens/run |
|---|---|---|---|---|
| hierarchical | S-PLAINS | 0.78 ± 0.04 | 0.92 | 180 k |
| hierarchical | S-BASIN  | 0.61 ± 0.05 | 0.84 | 195 k |
| flat-baseline | S-PLAINS | 0.55 ± 0.06 | 0.71 | 198 k |
| flat-baseline | S-BASIN  | 0.34 ± 0.08 | 0.48 | 200 k |

### Power
n=10 seeds × 2 scenarios per arm = 20 obs/arm. 假设 σ=0.10，δ=0.10 → power ≈ 0.91 at α=0.05 (two-sample t).

### Threats to validity
1. **Token budget 对齐**：flat-baseline 容易 token blow-up 因为 broadcasting；强制截到同样 budget。
2. **Architecture 不可见性**：模型不能从 prompt 看出"我是 hierarchical channel 之一"vs"我是 flat agent" —— 让 system prompt 长度匹配。
3. **Schema 公平**：flat-baseline 也走 `Guardrails`，避免"hierarchical 有保护伞但 flat 没有"。

### Compute estimate
40 runs × 2 sim-hour × ~12 min real-time/sim-hour（fallback 平均，LLM-on 加 ~20%）= **~16 GPU-hours** (M-CLAUDE-SONNET via API) 或 **~24 GPU-hours** 本地。

---

## E2 — Token Cost is Decoupled from World Size (§2.2)

### Research question
**Per-decision token cost 是否随 entity 数（world load）线性增长？**

### Hypothesis
**H2**: `prompt_tokens / decision` 与 `entity_count` 的 Pearson 相关 ρ < 0.20（弱线性），即 PromptPayload 的 ranked-highlights 截断有效解耦了 world size 与 token。

### Design

| Factor | Levels |
|---|---|
| World size (initial workers) | 4, 8, 16, 24, 36 |
| Scenario | S-PLAINS only (变量隔离) |
| Seed | 5 seeds |
| Model | M-CLAUDE-SONNET |

总 cells: 5 × 1 × 5 = **25 runs**

### Metrics
- 主：**`prompt_tokens / decision`**（per channel）
- 主：**`first_token_latency_p50`**（不应随 entity_count 显著上升）
- 副：每个 channel 的 `pickHighlights` 截断后实际 highlights 数（应 ≤ 8 不变）

### Expected
散点图：x 轴 entity_count, y 轴 mean prompt_tokens/decision；4 条线（4 channel）应近水平 (slope ≈ 0)，与"flat MARL agent」假设的"slope ≈ entity_count" 形成对照。

### Threats to validity
- **highlights 截断 bias**：高负载下被丢弃的 alert 是否系统性损害决策？需 secondary check：RAE-composite 在 5 size 下应保持 monotonic-ish。
- **观察 vs 因果**：tokens 不变可能因 prompt 静态部分主导，要单独报 `dynamic_tokens = total - static_prompt_tokens` 才有说服力。

### Compute
25 × 2 sim-hour ≈ **~10 GPU-hours**.

---

## E3 — Director vs Policy Multi-LLM Adversarial Decomposition (§2.3)

### Research question
**让不同 LLM 各占 1 个 channel 是否优于"single LLM 全包"，且总成本更低？**

这是论文最有 wow-factor 的实验。在文献里**没人做过**。

### Hypothesis
**H3a**: `mix(strong-env, weak-policy)` 在 RAE 上 ≥ `weak(env+policy+both other channels)` 但成本仅高 +20%。
**H3b**: `mix(strong-env, weak-policy)` 在 RAE 上落后 `strong(env+policy+others)` 不超过 0.05，但成本低 50%+。
**H3c**: 4 通道之间存在 **specialization gradient** —— environment-director 对 strong model 的边际收益 > npc-policy（直觉：env 决策长尾，policy 多是 routine clamp）。

### Design

2 × 2 multi-LLM matrix（先做 env × policy，strategic + colony 固定为 weak）：

| Cell | environment-director | npc-policy | strategic-plan | colony-agent |
|---|---|---|---|---|
| `WW` | M-HERMES7B | M-HERMES7B | M-HERMES7B | M-HERMES7B |
| `SW` | M-CLAUDE-SONNET | M-HERMES7B | M-HERMES7B | M-HERMES7B |
| `WS` | M-HERMES7B | M-CLAUDE-SONNET | M-HERMES7B | M-HERMES7B |
| `SS` | M-CLAUDE-SONNET | M-CLAUDE-SONNET | M-CLAUDE-SONNET | M-CLAUDE-SONNET |

参考点：`FB` (M-FALLBACK 全包，免费对照)。

总 cells: 5 × 2 scenarios × 10 seeds = **100 runs**

### Implementation prerequisite
**当前阻塞**：`HTTPAgentClient` + `agent-bridge.js` 是 S5 wave-2 deferred。需要先实现 channel→adapter 路由（plan 估 2-3 天）。在此之前可用 Plan B：4 个独立 ai-proxy 进程，每个绑定一个模型，通过 `OPENAI_BASE_URL` env var 在 sim 启动时按 channel 切换（hacky 但能跑）。

### Metrics
- **RAE-composite, survival rate**
- **`hierarchical.env_threat_responsiveness`** (Pearson corr factionTension↔threat)
- **`hierarchical.colony_cadence_health`** (decision-interval std-dev)
- **Total tokens × token-price-table → cost in USD**
- **DTE-per-decision** (单独每 channel 拆)

### Expected table (RAE-composite mean across seeds × scenarios)

| Cell | RAE | Survival | Cost (USD/run) | DTE (Δscore/k-tokens) |
|---|---|---|---|---|
| FB (no LLM) | 0.45 | 0.62 | 0.00 | — |
| WW | 0.52 | 0.74 | 0.04 | 0.31 |
| SW | **0.71** | **0.88** | 0.18 | **0.39** |
| WS | 0.66 | 0.83 | 0.21 | 0.32 |
| SS | 0.74 | 0.90 | 0.62 | 0.12 |

**Key claim**：`SW`（strong-env + weak-policy）在 95% CrI 上与 `SS`（strong-all）不可区分，但成本差 3.4×。

### Threats to validity
1. **Communication cost between channels**：当前 channel 间通过 state 共享，无 direct LLM-to-LLM 传话；这弱化了"adversarial" claim。建议在论文中诚实写为 "loose coupling"。
2. **Prompt-leakage**：strong model 在 env channel 的输出会被 weak model 的 policy channel 在 prompt context 里看到 — 这是不是变相把 strong model 的能力"漏给"weak model？需要做 ablation：对比 `SW`（看 env summary）vs `SW-blind`（policy 看不到 env summary）。
3. **小模型断崖**：M-HERMES7B 可能完全不能产出合 schema 的 JSON，导致 fallback 占比 100% — 实验前先跑 schema-pass-rate sanity check (E6)。

### Compute
100 runs × ~30 min real-time = **~50 GPU-hours**, 加上 multi-model API 费用 ~50 USD.

---

## E4 — Multi-Resource RAE under Pressure (§2.4)

### Research question
**模型的"结构化推理"能力（reasoning effort / chain-of-thought）是否表现为更平的资源 Gini？**

### Hypothesis
**H4**: 在固定的 RAE-sufficiency 下，强模型分配的 `rae_distribution_gini` 显著低于弱模型，即**强模型不仅做得多，还做得均**。

### Design

| Factor | Levels |
|---|---|
| Model tier | M-HAIKU, M-SONNET, M-OPUS, M-GPT5 |
| Scenario | S-PLAINS, S-BASIN, S-PLAINS-FAMINE |
| Seed | 10 |

总 cells: 4 × 3 × 10 = **120 runs**

### Metrics
- **`rae_sufficiency`** (主)
- **`rae_distribution_gini`** (主)
- **`rae_idle_capacity`** (副)
- **`rae_path_overhead`** (待 wave-2 wired) — 副

### Expected scatter
散点图 x=`rae_sufficiency`, y=`rae_distribution_gini`：
- M-HAIKU 落右上（高 sufficiency 但 Gini 也高 — "够吃但偏科"）
- M-OPUS / M-GPT5 落左上（高 sufficiency 且低 Gini — "均衡"）
- M-SONNET 中间

### Statistical test
按 sufficiency 分箱后做 Mann-Whitney U on Gini between Haiku vs Opus；期望 p < 0.01。

### Threats to validity
1. **Gini 计算口径**：当前 `ResourceAllocationEfficiency.js:gini` 在 4-tuple 资源向量上算（food/wood/stone/herbs），不区分 zone。S6 wave-2 应改为 per-zone Gini 才贴合 paper claim。
2. **结构化推理 vs 模型大小**：tier 与 model size 强相关，无法分离。诚实写为 "model capability" 而非 "structured reasoning"。

### Compute
120 × 2 sim-hour ≈ **~50 GPU-hours**.

---

## E5 — Long-Horizon Memory Degradation (§2.5)

### Research question
**Recall(t), Drift(t), Performance(t) 三条曲线在长程模拟下如何分化？是否能自然复现 "lost-in-the-middle"？**

这是论文最有方法论新意的实验。

### Hypothesis
**H5a**: Recall(t) 随 sim-time 单调下降（模型 forget 早期 anchor）。
**H5b**: Drift(t) 在 t=2h 后明显（KL > 0.5）。
**H5c**: Performance(t) 的下降**滞后**于 Recall(t) ≥ 30 sim-min，即 LLM 不需要"记得过去"也能维持当前任务，**直到记忆涉及非当前观察可见的资源约束**。
**H5d**: 把 anchor 注入位置从 prompt 头移到中间，观察 Recall(t) 在中间 anchor 上的额外下降 ≥ 30%（lost-in-the-middle 复现）。

### Anchor 协议

`MemoryStore` 启动时注入 5 条**唯一**事件，每条带不可篡改 token 串：
```
"ANCHOR-SCN-PLAINS-RIVERLINE-7AB3"
"ANCHOR-RES-INITIAL-FOOD-120"
"ANCHOR-WORKER-NAME-FIRST-Mendelin"
"ANCHOR-EVENT-DAY1-DROUGHT-SEVERE"
"ANCHOR-OBJECTIVE-COMPLETE-FOREST-CLEAR"
```

每 5 sim-min 取 strategic-plan 的 `summary` 字段，正则匹配每个 anchor token。Recall(t) = 命中的 anchor 数 / 5。

### Design

| Factor | Levels |
|---|---|
| Run length | 30 min, 2 h, 8 h, 24 h |
| Anchor position | head, middle, tail (E5d only) |
| Model | M-OPUS, M-SONNET, M-HERMES7B |
| Scenario | S-PLAINS（控变量） |
| Seed | 5 (主), 3 (24h subset) |

总 cells: 4 × 3 × 5 = **60 runs** (E5a-c)
位置 ablation: 3 × 3 × 3 = **27 runs** (E5d at 2h only)

### Metrics
- **Recall(t)** 曲线（5 sim-min 粒度）
- **Drift(t)** = KL between 当前 group policy distribution 和 t=0 baseline policy（matched world summary 通过 fixed-checkpoint snapshot 取）
- **Performance(t)** = RAE-sufficiency rolling 5-min window
- 散点：x=Recall slope, y=Performance slope across seeds

### Expected curves
```
Recall(t)        ┐  Performance(t)         Drift(t)
  1 ─                 1 ──                  0  ─┐
   ╲╲╲╲                ───╲╲                    ╲╲╲
   ╲   ╲                    ╲╲                    ╲╲╲╲
0 ─────────         0 ─────────             1 ─────────
  0   8h               0   8h                  0   8h
```

### Cost-driven seed schedule
- E5a-c 60 runs × (avg 4 sim-hours × ~10 min real-time/sim-hour) = **~40 GPU-hours**
- 24-hour runs (4 × 5 seeds × 3 models = 60 runs at 24 sim-hour ≈ 240 min real-time each) = **~240 GPU-hours** — too expensive for v1 paper
- **建议**: 30-min + 2-h + 8-h subset for v1; 24h 作为 final figure 在 camera-ready 期间补
- Total v1: ~80 GPU-hours

### Threats to validity
1. **Anchor 设计 leakage**：模型可能 "ANCHOR-XXX" 这样的 token pattern 触发记忆区别对待。建议用语义化 anchor（"day 1 drought hit the western farms hard"），多次 grep 不同句法。
2. **Strategic summary 不等于 model 内部记忆**：summary 是 model 写的字符串，可能简化掉 anchor。要副跑：直接探查 `recentMemory` 是否还在 prompt context 里 — 这是 hard fact。
3. **Determinism 前提**：长程跑必须满足 S0 audit (`audit:determinism` 通过)，否则 Drift 曲线带 noise。

---

## E6 — Schema-Validated Failure Mode Profile (§2.6)

### Research question
**不同 model 家族在 schema 拒绝 / fallback / retry 上是否表现出可识别的 fingerprint？**

### Hypothesis
**H6a**: 各家族失败模式分布显著不同（χ² test, p<0.001）。
**H6b**: 7B 量级 open-weight 模型的 schema-reject-rate 比 GPT-5 / Claude-Opus 至少高 5×。
**H6c**: schema-reject-rate 与 RAE 负相关（更多 reject → 更多 fallback → 更平的 RAE）。

### Design

横切面：每个 model × 单一 scenario × 5 seeds，1 sim-hour。

| Model | seeds × scenarios |
|---|---|
| M-OPUS, M-SONNET, M-HAIKU, M-GPT5, M-HERMES7B, M-LLAMA8B, M-QWEN72B | 5 × 2 |

总 cells: 7 × 5 × 2 = **70 runs**

### Metrics（per channel）
- `schema_reject_rate` = `(errorCount + timeoutCount) / requestCount`
- `last_error_kind` 分布（`schema_invalid`, `timeout`, `429`, `network`, `none`）
- `consecutive_fallback_responses` p95
- `max_unrecovered_fallback_sec`
- 与 **`rae_composite`** 的散点 / Spearman correlation

### Expected
对 7 model 给出一张 `failure profile matrix`：
```
                schema  timeout  429   parse-fail
M-OPUS          0.01    0.00     0.02  0.00
M-SONNET        0.02    0.01     0.03  0.01
M-HAIKU         0.04    0.01     0.02  0.03
M-GPT5          0.02    0.01     0.04  0.01
M-HERMES7B      0.18    0.05     0.00  0.12
M-LLAMA8B       0.22    0.08     0.00  0.10
M-QWEN72B       0.06    0.03     0.00  0.02
```

### Threats to validity
1. **Schema dialect**：schema 用 OpenAI-style JSON; 部分模型微调时见过更多 anthropic-style XML / function-calling，对 JSON struct 输出可能不够 robust。在论文中诚实写。
2. **Prompt 工程**：每个家族对 prompt 格式偏好不同；用统一 prompt 是否对小模型不公？建议附录跑一组 prompt-tuned variants。

### Compute
70 × 1 sim-hour × ~12 min ≈ **~14 GPU-hours**.

---

## E7 — Decision Token Efficiency (§2.7)

### Research question
**DTE (Δscore / completionTokens) 是否给出与 raw RAE 不同的模型排序？**

### Hypothesis
**H7a**: Spearman ρ(RAE-rank, DTE-rank) < 0.7（DTE 加新信号）。
**H7b**: 7B-tier 模型在 DTE 上能跑赢 70B-tier（"小而频"赢"大而少"）。
**H7c**: DTE 与 `first_token_latency_p50` 强负相关（短 latency → 多 decision → 高 DTE，前提是 quality 不塌）。

### Design

复用 E6 的 7 model × 5 seed × 2 scenario = 70 runs（同一批 logs）。新增**频率 ablation**：把 `decisionIntervalSec` 从默认值变 0.5×, 1×, 2×（1 个模型 × 3 levels × 5 seeds = 15 runs，独立）。

### Metrics
- `dte_per_completion_token` (主)
- `dte_per_decision`
- `first_token_latency_p50`
- 散点：x = total_completion_tokens, y = RAE-composite，按 model 着色

### Expected
- 7B + low cadence × 频繁调度 vs 70B + high cadence × 稀疏调度，**两条 Pareto 前沿不重合**
- DTE 排序里 M-HERMES7B 进入 top-3，但 RAE 排序里 M-HERMES7B 落到 bottom-2

### Threats to validity
1. **Δscore 定义**：选哪段窗口算 Δ 影响排序。建议**多窗口** (5min, 30min, 1h, total) 全报。
2. **Token 计费一致性**：vLLM 报的 `completionTokens` vs OpenAI report 不完全等量（whitespace tokenization 不同）；应做 single-tokenizer 后处理对齐 (使用 tiktoken 重新 count)。

### Compute
分摊 E6 的 70 runs + 15 ablation runs ≈ **+3 GPU-hours**.

---

## E8 — Bayesian Beta-Binomial Scoring vs Frequentist (§2.8)

### Research question
**Beta-Binomial scoring 是否在 small-N (5–10 seeds) 下给出比 `passRate × N + M` 更稳定的模型排序？**

这是方法论 defense，不是新实验，复用 E1–E7 的 logs。

### Analysis
对 E1–E7 的所有 RAE results：
1. 计算 `passRate = sum(score > threshold) / N` — 经典 frequentist 排序
2. 计算 `bayesianScore` — Beta-Binomial posterior mean
3. 排序差异 (Kendall's τ)
4. 重采样：随机抽 3 / 5 / 10 seeds 子集 1000 次，测两种 scoring 的排序稳定性

### Hypothesis
**H8a**: Bayesian 排序在 N=5 时 Kendall τ 标准差比 frequentist 低 ≥30%。
**H8b**: Bayesian 给出可信区间，frequentist 不给（这是定性优势）。

### Expected figure
线图：x 轴 N (3..10)，y 轴 ranking-stability (Kendall τ across bootstrap samples)；两条线，Bayesian 在小 N 处显著高。

### Compute
0 — 仅 post-hoc analysis on existing logs.

---

## E9 — Reproducibility Verification (§2.9)

### Research question
**论文公布的 final figures 是否可由 reviewer 在自己机器 / Docker 容器中 bit-identical 复现？**

### Protocol
1. **Determinism gate**: `node tools/audit/determinism-check.js --seed 0xC0FFEE --ticks 7200 --scenario temperate_plains` × 2 → exit 0 + same hash. ✓ verified at 60 ticks; **TODO: 7200 tick run before camera-ready**.
2. **Cross-machine reproducibility**: 在 3 台不同硬件（Linux x86_64, macOS arm64, Windows x86_64）跑同 seed、同 scenario、fallback mode → 三机器 hash 必须相同。Floating-point 实现差异是已知风险。
3. **Container reproducibility**: 提供 Dockerfile：
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package.json ./
   COPY src/ src/
   COPY scripts/ scripts/
   COPY tools/ tools/
   COPY test/ test/
   COPY server/ server/
   COPY README.md CHANGELOG.md CLAUDE.md ./
   CMD ["sh", "-c", "node --test test/*.test.js && node tools/audit/determinism-check.js --seed 0xC0FFEE --ticks 1800"]
   ```
   `docker run --rm <image>` 必须 exit 0 with hash equality.
4. **LLM-on partial reproducibility**: API 模型每次回复非确定，但**directive distribution** 应在 5 seed × 3 repeat 下 KL < 0.05；这是 paper 给的 "near-deterministic LLM mode" 保证。

### Expected appendix table
| Verification | Command | Result |
|---|---|---|
| Test suite | `npm test` | 684 / 0 fail / 18 s |
| RNG coverage | `npm run audit:rng` | ≤ 3 leaks documented |
| Short determinism | `npm run audit:determinism` | hash-equal on 2 runs |
| Long determinism | `node tools/audit/determinism-check.js --ticks 7200` | hash-equal (TODO) |
| Container | `docker run` 上面那个 Dockerfile | exit 0 |
| Multi-machine | 3 OS × 1 seed | 3 hashes equal |

### Threats to validity
1. **64-bit float order-of-ops**：累加顺序差异可能在 ARM vs x86 上产生 last-bit 差异。需要在 Boids / TileState 关键累加上加 `Math.fround` 强制 32-bit 截断；如不修，**降级为"hash 长度 < 256 char 时部分相同"** —— 这条要在论文里诚实标注。

### Compute
~30 min total（多机器手动跑）。

---

## 实验之间的依赖图

```
E1 ─┐
E2 ─┤              E5 (long-horizon)
E3 ─┼─→ E8 (post-hoc Bayesian analysis)
E4 ─┤
E6 ─┴── E7 (DTE shares E6 logs)        E9 (cross-cutting reproducibility)
```

---

## 总算力 / 时间预算

| 实验 | GPU-hours | API-USD（如用 API 模型） |
|---|---|---|
| E1 hierarchical vs flat | 16 | $30 |
| E2 token-vs-world | 10 | $15 |
| E3 multi-LLM matrix | 50 + dev (2-3d) | $60 |
| E4 multi-resource RAE | 50 | $80 |
| E5 long-horizon | 80 | $40 |
| E6 failure modes | 14 | $25 |
| E7 DTE | +3 | +$5 |
| E8 Bayesian post-hoc | 0 | $0 |
| E9 reproducibility | 0.5 | $0 |
| **Total** | **~225 GPU-hr** | **~$255** |

折算单 A100：约 1 周连续跑 + 半周 dev work for E3。

---

## v1 论文的核心 figure / table 清单

| Figure | 来源 | 长什么样 |
|---|---|---|
| Fig 1 | architecture diagram | 4 channel × deterministic substrate × dimension plugins |
| Fig 2 | E1 | bar chart RAE: hierarchical vs flat × scenario |
| Fig 3 | E2 | scatter token-per-decision vs entity-count (4 channel lines flat) |
| Fig 4 | E3 | 2×2 heatmap (env model × policy model) RAE / cost |
| Fig 5 | E5 | three-curve plot Recall / Drift / Performance over time |
| Fig 6 | E5d | lost-in-middle reproduction |
| Fig 7 | E7 | Pareto plot RAE vs total tokens, DTE iso-curves |
| Fig 8 | E8 | ranking stability vs N seeds, Bayesian vs frequentist |
| Table 1 | E4 | Gini × sufficiency by model tier |
| Table 2 | E6 | failure mode matrix |
| Table 3 | E9 reproducibility verification matrix |

---

## 实验执行顺序（论文写作 4 周计划）

| Week | 任务 |
|---|---|
| 1 | S5 wave-2 落地（HTTPAgentClient + agent-bridge）；E9 reproducibility infrastructure；S6 wave-2 ScoringEngine 归一化层 |
| 2 | E6 + E7 跑全（70 + 15 runs；最便宜，先做）；E2 跑全（25 runs） |
| 3 | E1 (40 runs) + E4 (120 runs)；E8 post-hoc analysis 起 |
| 4 | E3 multi-LLM (100 runs)；E5 short-horizon subset (60 runs)；E5 8h 取 final figure |

24-hour E5 留到 camera-ready 阶段。

---

## v2+（投稿后）扩展

1. **Partial observability ablation** — 把 `world/VisibilitySystem.js` 暴露为 prompt 变量，对比 fully-observable 与 partially-observable 下的 RAE 衰减
2. **Sample-efficient learning** — RLHF / DPO 在 fallback baseline 上的边际效用
3. **Inter-LLM negotiation channel** — 把 4 channel 之间加一条直接 LLM-to-LLM 通讯（Cicero 风格），与无通讯版做对照
4. **Domain transfer** — 同 schema 下喂入完全不同的 scenario domain（医院调度、灾后救援），测 zero-shot
