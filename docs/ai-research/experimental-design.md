# Experimental Design — Project-Utopia Academic Benchmark

**Status:** Draft v2 (2026-05-10, post-frontier-survey update)
**Companion to:** `benchmark_proposal.md`, `refactor-plan.md`, `determinism-report.md` (S0 audit), `paper-framework.md` (v2), `literature-frontier-2025-2026.md`, `roadmap.md`
**Branch:** `refactor/academic-benchmark` (tag `refactor/academic-benchmark-v0.11.0-rc1`)

> 这份文档把 §2.1–§2.9 的 9 个创新点落到**可执行的实验设计**。**v2 update**: 已根据 32 篇 2025 H2 - 2026 H1 frontier paper 反向修订 E3 / E5 / E8 / E9，加入 cross-vendor channel-axis、3-tier reproducibility (LayerCast)、Bowyer 引用、RMM 7-smell mapping 等。

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

## E3 — Cross-Vendor Channel-Axis Heterogeneous LLM Mix in Long-Horizon Survival (§2.3)

> **v2 重 framing (THREAT-1 应对)**: X-MAS (Ma et al. 2025-05) 已证明 heterogeneous>homogeneous on 27 LLMs × 5 domains × 5 functions 的 per-task routing；Anthropic Multi-Agent Research System (2025-06) 在 production 用 intra-family Opus+Sonnet。Project-Utopia E3 的 contribution **收窄到 cross-vendor × channel-axis × long-horizon-survival 三-way 限定**——这个组合在所有 frontier paper 里仍空。

### Research question
**让不同 vendor 的 LLM 各占 4 个 channel 中的一个 (cross-vendor channel-axis routing) 是否优于 single-vendor-all-channels，在 long-horizon 殖民地 survival sim 下？**

**与 X-MAS 的差异化**: X-MAS routes per (domain, function)，每个 task 是 isolated；Project-Utopia routes per **channel within one continuous long-horizon task**。
**与 Anthropic Multi-Agent 的差异化**: Anthropic 用 Opus + Sonnet **intra-family** 的 lead-worker；Project-Utopia 测 **cross-vendor** (Anthropic + OpenAI + open-weight) **per-channel**。

### Hypothesis
**H3a**: `mix(strong-env, weak-policy)` 在 RAE 上 ≥ `weak-on-all` 至少 +0.15 (matched X-MAS 的 +47% AIME 数量级)。
**H3b**: `mix(strong-env, weak-policy)` 在 RAE 上落后 `strong-on-all` 不超过 0.05，但成本低 50%+ (matched ChatDev's −44% role-removal effect size as ablation strength benchmark)。
**H3c**: 4 通道存在 **specialization gradient**——environment-director 对 strong model 的边际收益 > npc-policy（直觉：env 决策长尾，policy 多 routine clamp）。
**H3d (NEW v2)**: **跨 vendor mix > 同 vendor mix** at matched per-channel capability level——例如 (Claude env + GPT-5 policy + Hermes strategic + Llama colony) 优于 (Claude × 4)，因为 vendor diversification 减少 mode collapse。

### Design (v2 expanded — 含 cross-vendor cells)

**Phase A: 同 vendor SS/SW/WS/WW matrix (2×2)**——baseline 比较

| Cell | environment-director | npc-policy | strategic-plan | colony-agent |
|---|---|---|---|---|
| `WW` | M-HERMES7B | M-HERMES7B | M-HERMES7B | M-HERMES7B |
| `SW` | M-CLAUDE-SONNET | M-HERMES7B | M-HERMES7B | M-HERMES7B |
| `WS` | M-HERMES7B | M-CLAUDE-SONNET | M-HERMES7B | M-HERMES7B |
| `SS` | M-CLAUDE-SONNET | M-CLAUDE-SONNET | M-CLAUDE-SONNET | M-CLAUDE-SONNET |

**Phase B (NEW v2): Cross-vendor cells**——core novelty

| Cell | environment | npc-policy | strategic | colony | Rationale |
|---|---|---|---|---|---|
| `XV-OPUS-SONNET` | Claude-Opus | Claude-Sonnet | Claude-Sonnet | Claude-Sonnet | intra-family ladder (Anthropic Multi-Agent style) |
| `XV-DIVERSE-LIGHT` | Claude-Sonnet | GPT-5-mini | Hermes-7B | Llama-8B | 4 vendor mix lightweight |
| `XV-DIVERSE-STRONG` | Claude-Opus | GPT-5 | Claude-Sonnet | Qwen-72B | 4 vendor mix premium |
| `XV-OPENWEIGHT-ONLY` | Hermes-7B | Llama-8B | Qwen-72B | Hermes-7B | open-weight only (论文 reproducibility 价值)|

参考点：`FB` (M-FALLBACK 全包，免费对照)。

总 cells: 4 (Phase A) + 4 (Phase B) + 1 (FB) = **9 cells × 2 scenarios × 10 seeds = 180 runs** (v1 是 100 runs；v2 增加 80 runs 覆盖 cross-vendor)

### Implementation prerequisite
**当前阻塞**：`HTTPAgentClient` + `agent-bridge.js` 是 S5 wave-2 deferred。需要先实现 channel→adapter 路由（plan 估 2-3 天）。在此之前可用 Plan B：4 个独立 ai-proxy 进程，每个绑定一个模型，通过 `OPENAI_BASE_URL` env var 在 sim 启动时按 channel 切换（hacky 但能跑）。

### Metrics
- **RAE-composite, survival rate**
- **`hierarchical.env_threat_responsiveness`** (Pearson corr factionTension↔threat)
- **`hierarchical.colony_cadence_health`** (decision-interval std-dev)
- **Total tokens × token-price-table → cost in USD**
- **DTE-per-decision** (单独每 channel 拆)

### Expected table v2 (sandwich-normalized score = `(LLM − fallback) / (oracle − fallback)`)

| Cell | RAE_norm | Survival | Cost (USD/run) | DTE (Δscore/k-tokens) | Diversity index |
|---|---|---|---|---|---|
| FB (no LLM)             | 0.00 | 0.62 | 0.00  | — | — |
| WW                      | 0.18 | 0.74 | 0.04  | 0.31 | 1.0 |
| SW                      | **0.62** | **0.88** | 0.18  | **0.39** | 1.0 |
| WS                      | 0.51 | 0.83 | 0.21  | 0.32 | 1.0 |
| SS                      | 0.71 | 0.90 | 0.62  | 0.12 | 1.0 |
| XV-OPUS-SONNET (intra)  | 0.69 | 0.91 | 0.45  | 0.18 | 2.0 |
| **XV-DIVERSE-LIGHT**    | **0.65** | 0.86 | **0.16**  | **0.42** | **4.0** |
| XV-DIVERSE-STRONG       | 0.78 | 0.93 | 0.71  | 0.13 | 4.0 |
| XV-OPENWEIGHT-ONLY      | 0.41 | 0.78 | 0.05  | 0.36 | 3.0 |

**Key claims (v2)**:
1. **SW ≈ SS at 1/3 cost** (Phase A): replicates ChatDev-scale role-removal effect
2. **XV-DIVERSE-LIGHT ≥ SW at lower cost (Phase B core finding)**: cross-vendor mix outperforms single-family mix at matched cost — first evidence in literature
3. **XV-DIVERSE-STRONG ≈ SS at +14% cost**: cross-vendor strong ≈ single-vendor strong → no penalty for diversification
4. **XV-OPENWEIGHT-ONLY ≥ WW**: open-weight mix > single open-weight model → reproducibility-friendly path

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

## E5 — Three-Axis Joint Memory Analysis on Continuous Tick-Level Naturally-Accumulated Context (§2.5)

> **v2 重 framing (THREAT-2 应对)**: MemoryArena (2026) 已做 action-grounded recall in agent loop (但 session-discrete 不连续)；MemoryAgentBench (Hu et al. ICLR 2026) 已含 Selective Forgetting 轴 (但 no env loop)。Project-Utopia E5 的 contribution **收窄到 三轴联合 + 连续 tick + 自然累积 三-way combo**——这个组合在所有 frontier paper 里仍空。

### Research question
**Recall(t), Drift(t), Performance(t) 三条曲线在 *naturally-accumulated continuous tick-level* sim history 下如何分化？是否能复现 "lost-in-the-middle" U-shape？**

**与 MemoryArena 的差异化**: MemoryArena 是 session-discrete 任务（task A 完成 → task B 开始）；Project-Utopia 是 tick-continuous (1/30s 粒度 × 多小时)，记忆衰减是 *gradient* 而非 *step*。
**与 MemoryAgentBench 的差异化**: MemoryAgentBench 测 Selective Forgetting on chat sessions；Project-Utopia 测 forgetting under environment-loop pressure (forget warehouse location → 下次决策错误 → DevIndex 下降)。
**与 Lost-in-the-Middle 的差异化**: LiM 用合成 distractor + verbal QA recall；Project-Utopia 用自然累积 sim trace + action-grounded recall。

### Hypothesis (v2 — 加 vs MemoryArena 显式对照)
**H5a**: Recall(t) 随 sim-time 单调下降（模型 forget 早期 anchor）。
**H5b**: Drift(t) 在 t=2h 后明显 (KL > 0.5)。
**H5c**: Performance(t) 的下降**滞后**于 Recall(t) ≥ 30 sim-min，即 LLM 不需要"记得过去"也能维持当前任务，**直到记忆涉及非当前观察可见的资源约束**。
**H5d**: 把 anchor 注入位置从 prompt 头移到中间，观察 Recall(t) 在中间 anchor 上的额外下降 ≥ 30%（lost-in-the-middle 复现）。
**H5e (NEW v2)**: **action-grounded recall 衰减比 verbal recall 衰减快**——LLM 可能在 strategic-summary 里仍提到 anchor (verbal recall) 但下游 directive 已不反映 anchor 影响 (action-grounded recall lost first)。这点 MemoryArena 暗示但未量化。
**H5f (NEW v2)**: **session-discrete (MemoryArena style) vs tick-continuous (Project-Utopia)** 跑同一 model 同一 anchor，tick-continuous 衰减 ≥ 2× session-discrete (因为 prompt context 在每个 tick 都被刷新)。这是 ablation：把 Project-Utopia 模拟成"每 30 min 一个 session reset"对照 vs 默认连续模式。

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

> **v2 重 framing (GOOD-1 应对)**: Bowyer/Aitchison/Ivanova "Don't Use the CLT in LLM Evals With Fewer Than a Few Hundred Datapoints" (ICML 2025 Spotlight) 已直接推荐 Beta-Binomial 作为 small-N 默认。Project-Utopia §2.8 不再 claim novel method choice，**改 framing 为 "applying community best practice (Bowyer ICML 2025) to long-horizon colony sim with PVB variance reduction novelty"**。

### Research question (v2)
- **Q8a (defending)**: Beta-Binomial scoring 在 small-N (5–10 seeds) 下是否如 Bowyer (ICML 2025 Spotlight) 所言稳定 ≥ frequentist Wald CIs？(post-hoc 验证)
- **Q8b (NEW v2 contribution)**: 在 PVB 加持下 (Pluribus AIVAT-style variance reduction)，Beta-Binomial CIs 是否能进一步收紧 ≥ 2×？(unique contribution beyond Bowyer)
- **Q8c (NEW v2 advanced)**: FAQ (Wu/Nair/Candès 2026-01) 的 Factorized Active Querying 是否能在保 frequentist coverage 的前提下进一步 5× sample efficient？(wave-2 enhancement)

这是方法论 defense + 1 个 unique contribution (PVB-augmented Bayesian)，复用 E1–E7 的 logs。

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

## E9 — 3-Tier Reproducibility Verification (§2.9, v2 upgrade)

> **v2 重 framing (GOOD-2 应对)**: LayerCast (Yuan et al. NeurIPS 2025 Oral) 让 LLM-on 也能 hardware-independent bit-identical (bf16 inference 跨 GPU 可产生 9 percentage points accuracy 差异 — LayerCast 通过 16-bit 存 weight + FP32 计算 解决)。Project-Utopia §2.9 **从 1 tier (fallback bit-identical) 升级到 3 tier**——这是 v2 强化项。
>
> **v2 加 RMM mapping (Siddiq 2025-11)**: 7-smell taxonomy (Code/Execution / Data / Documentation / Environment-Tooling / Versioning / Model / Access-Legal) — 论文 §2.9 显式声明 RMM Tier 4+ 合规。

### Research question (v2)
**论文公布的 final figures 是否可由 reviewer 在自己机器 / Docker 容器中按 3 个 tier reproducibility 复现？**

### 3-Tier Protocol

#### Tier 1: Fallback bit-identical (P0 baseline)

```bash
node tools/audit/determinism-check.js --seed 0xC0FFEE --ticks 7200 --scenario temperate_plains  # × 2 runs
# Expected: identical SHA-256 hash on both runs
```

- ✓ verified at 60 ticks (`e360b76...`)
- ⏳ TODO: 7200-tick verification before camera-ready
- 可复现保证：100% bit-identical given same seed × same scenario × fallback mode

#### Tier 2: LLM + LayerCast bit-identical (P1 upgrade, NEW v2)

```bash
# Pin LLM provider model snapshot ID + LayerCast inference adapter
LAYERCAST_MODE=on \
LLM_MODEL_SNAPSHOT_ID=claude-opus-4-7-20260101 \
node tools/audit/determinism-check.js --seed 0xC0FFEE --ticks 1800 --aiEnabled true  # × 2 runs
# Expected: identical SHA-256 hash on both runs IF LayerCast inference is used
```

- 依赖 LayerCast adapter wrap around LLMClient（P0-9 任务，~150 LOC）
- 跨 GPU 类型仍 bit-identical（这是 LayerCast 的核心承诺）
- Record-replay LLM cache 作 fallback：cached prompt→response 重放保证 100% reproducibility 即使 provider snapshot 漂移

#### Tier 3: Production LLM stationary (P2 acceptance)

```bash
# No LayerCast, just temperature=0
node tools/audit/distribution-stationary-check.js --seed 0xC0FFEE --runs 5
# Expected: KL divergence between same-prompt response distributions < 0.05
```

- 用于评测 production LLM API（无法控制 provider 内部硬件）
- 可接受弱化保证：directive distribution stationary 而非 bit-identical

### Cross-machine + Cross-OS verification

3 台不同硬件（Linux x86_64, macOS arm64, Windows x86_64）跑同 seed、同 scenario、Tier 1（fallback bit-identical mode）→ 三机器 hash 必须相同。

Floating-point 实现差异是已知风险（accumulator 顺序）；如不修，**降级 documenting** "partial reproducibility on architectures with same FP unit ordering"。

### RMM 7-Smell Compliance Mapping (NEW v2)

按 Siddiq et al. (2025-11) 7-smell taxonomy：

| Smell | Project-Utopia 对应措施 | Tier |
|---|---|---|
| **Code/Execution** | Git tag `v0.11.0-rc1` + commit-pinned Dockerfile build | RMM 4 |
| **Data** | Scenario template hash committed; seed range fixed | RMM 4 |
| **Documentation** | `CLAUDE.md` + `README.md` + 8 ai-research/ docs + LaTeX paper | RMM 5 |
| **Environment-Tooling** | Pin Node 22.x; pin LayerCast version; pin GPU/CUDA matrix in Dockerfile | RMM 4 |
| **Versioning** | Git tags for every release; `package.json` version + lock | RMM 5 |
| **Model** | LLM snapshot ID pinned; LayerCast inference adapter; record-replay cache | RMM 4 |
| **Access-Legal** | All datasets + code Apache 2.0 / MIT; no proprietary data | RMM 5 |

**Overall**: Project-Utopia 目标 **RMM Tier 4+** 全部 7 smell 合规——比 MLE-Bench (Tier 3) 高一档。

### Protocol

1. **Determinism gate**: Tier 1 + Tier 2 + Tier 3 全部 pass
2. **Cross-machine reproducibility**: 3 OS × Tier 1 hash equality
3. **Container reproducibility**: 双 container (utopia-eval + utopia-agent-base) per MLE-Bench 模板：
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

## 总算力 / 时间预算 (v2 — 含 cross-vendor cells + LayerCast)

| 实验 | GPU-hours v1 | GPU-hours v2 | API-USD v2 |
|---|---|---|---|
| E1 hierarchical vs flat | 16 | 16 | $30 |
| E2 token-vs-world | 10 | 10 | $15 |
| **E3 multi-LLM matrix (cross-vendor extended)** | **50 + 2-3d dev** | **90 + 4d dev** | **$120** |
| E4 multi-resource RAE | 50 | 50 | $80 |
| **E5 long-horizon (含 H5e/H5f ablation)** | **80** | **100** | **$60** |
| E6 failure modes | 14 | 14 | $25 |
| E7 DTE | +3 | +3 | +$5 |
| E8 Bayesian post-hoc + FAQ wave-2 | 0 | 2 | $0 |
| **E9 3-tier reproducibility** | **0.5** | **5** (Tier 2 LayerCast verification) | $5 |
| **Total v2** | — | **~290 GPU-hr** | **~$340** |

折算单 A100：约 12 天连续跑 + 1 周 dev work（含 LayerCast adapter + cross-vendor agent-bridge）。

**Cost increase rationale**: v1 → v2 增加 ~65 GPU-hours + $85 API 主要来自：
- E3 cross-vendor cells (+80 runs)
- E5 H5e action-grounded recall ablation + H5f session-vs-tick comparison
- E9 LayerCast Tier 2 verification (1800 ticks × multiple runs)

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
