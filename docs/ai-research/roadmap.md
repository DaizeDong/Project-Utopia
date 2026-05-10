# Execution Roadmap — Submission Sprint

**Status:** Draft v2 (2026-05-10, post-frontier-survey)
**Primary Target:** NeurIPS Datasets & Benchmarks Track (deadline ~2026-06-07)
**Secondary Target:** ICLR 2027 main track (deadline ~2026-09-30)
**Tertiary Target:** EMNLP 2026 Resources & Evaluation track (deadline ~2026-06-15) — see `emnlp-readiness-assessment.md` for fit analysis
**Companion to:** `paper-framework.md` v2, `experimental-design.md` v2, `literature-frontier-2025-2026.md`, `refactor-plan.md`

> 这是从今天起到投稿日的具体执行 roadmap。每天颗粒度的工作清单 + 阻塞列表 + 决策门 + 退路方案。

---

## 0. 全局视图

| Phase | Days | Focus | Output |
|---|---|---|---|
| **W1**: Infra P0 | D1–D7 | Multi-seed runner / sandwich norm / PVB / HTTPAgentClient / ScriptedOracle | 跑 E 系列前的全部 prereq |
| **W2**: Cheap experiments | D8–D14 | E2 / E6 / E7 / E1 | 4 个实验数据 + 初步 figures |
| **W3**: Heavy experiments + paper draft | D15–D21 | E3 / E4 / E8 + §1–§4 LaTeX | 论文前半 + multi-LLM 矩阵 |
| **W4**: E5 long-horizon + paper finalize | D22–D28 | E5 30m/2h/8h + E9 + §5–§8 + polish | 投稿就绪 |

总算力：**~225 GPU-hours + ~$255 API**。
人力：**1 dev full-time 4 周**（如多人协作可压缩到 2 周）。

---

## 1. P0 / P1 / P2 优先级清单

### P0 — 必须做（blocking E 系列实验）— v2 expanded

| # | 任务 | LOC | 估时 | 阻塞哪个 E |
|---|---|---|---|---|
| P0-1 | Multi-seed SimHarness runner | ~150 | 0.5d | 全部 E |
| P0-2 | Sandwich normalization layer in `ScoringEngine.js` | ~80 | 0.3d | E1/E4/E5/E7 |
| P0-3 | Crafter geometric mean for `RAE_composite` | ~30 | 0.1d | E1/E4 |
| P0-4 | PolicyValue Baseline (PVB) — Pluribus AIVAT-style variance reduction | ~120 | 1d | E1/E3/E4/E7 |
| P0-5 | HTTPAgentClient + agent-bridge.js + agent-routing.js（4 channel routing） | ~400 | 2d | **E3 multi-LLM (Phase A + B)** |
| P0-6 | ScriptedOraclePolicy.js per scenario | ~250 | 1d | E1/E4/E7 |
| P0-7 | 7200-tick long determinism gate | ~30 | 0.2d | E5/E9 |
| P0-8 | FlatBaselineAdapter.js | ~150 | 0.5d | E1 |
| **P0-9 (NEW v2)** | **LayerCast inference adapter** wrap around LLMClient (16-bit weights + FP32 compute) — 实现 Yuan et al. NeurIPS 2025 Oral 的 hardware-independent bit-identical | ~150 | 1d | **E9 Tier 2** |
| **P0-10 (NEW v2, promoted from P1)** | **Record-replay LLM cache** (VCR-cassette style; cache prompt→response pairs for offline replay) | ~200 | 1d | E9 Tier 2 fallback path |
| **P0-11 (NEW v2)** | **Cross-vendor `OPENAI_BASE_URL` per-channel routing**（agent-routing.js 增强）— 4 个 ai-proxy 进程切不同 vendor | ~80 | 0.5d | **E3 Phase B cross-vendor cells** |
| **P0-12 (NEW v2)** | **Action-grounded recall probe** in MemoryDegradation plugin — 不只测 verbal recall，还测 directive distribution 是否反映 anchor (E5 H5e) | ~120 | 0.5d | E5 |
| **P0-13 (NEW v2)** | **Session-discrete ablation mode**（每 30 min reset prompt context 模拟 MemoryArena） — E5 H5f 对照 | ~50 | 0.3d | E5 |

**总计 v2: ~1810 LOC，~8.4 dev-day** (v1 是 1210 LOC / 5.6d)，加 P0-9~P0-13 共 +600 LOC + 3.3 dev-day

**W1 安排调整**: 原 W1 7 天，v2 P0 总量 8.4 天 → 把 P0-12/P0-13 推到 W2 D8 一并完成（不阻塞 E1/E2/E6/E7 启动）。

### P1 — 强烈建议（实验质量）— v2

| # | 任务 | LOC | 估时 | 改善哪 |
|---|---|---|---|---|
| ~~P1-1~~ | ~~Record-replay LLM cache~~ → **promoted to P0-10** | — | — | — |
| P1-2 | **Dockerfile 双 container** (utopia-eval + utopia-agent-base) per MLE-Bench 模板 | ~80 + Dockerfile | 0.5d | E9 reproducibility |
| P1-3 | TrueSkill (μ, σ) reporting in ScoringEngine | ~100 | 0.5d | E3 multi-LLM 排名 |
| P1-4 | α-rank for non-transitive cells | ~80 | 0.5d | E3 |
| P1-5 | Filling 4 placeholder dimension scores | ~200 | 1d | E3/E4/E5 完整 |
| P1-6 | Token-counter normalization (cross-tokenizer using tiktoken) | ~50 | 0.3d | E7 fairness |
| P1-7 | Anchor-fact protocol with semantic anchors（5 anchors per run） | ~80 | 0.5d | E5 |
| P1-8 | Progress Rate (AgentBoard) for endless survival | ~50 | 0.3d | §3 metrics |
| **P1-9 (NEW v2)** | **VitaBench-style rubric sliding-window LLM judge** for 4-channel scoring | ~150 | 1d | §4 contamination resistance |
| **P1-10 (NEW v2)** | **BATS cost-aware Pareto reporter** `α·tokens + β·tool_calls` | ~80 | 0.3d | §3.3 cost axis |
| **P1-11 (NEW v2)** | **FAQ active querying** (Wu/Nair/Candès 2026-01) — 5× sample efficient | ~250 | 1.5d | E8 wave-2 |

**总计：~840 LOC，~4.6 dev-day** ← 见缝插针进 W2/W3。

### P2 — 论文优雅度（可推迟到 camera-ready）

| # | 任务 | 改善哪 |
|---|---|---|
| P2-1 | Information diffusion % metric (Generative Agents) | §4 secondary metric |
| P2-2 | Cicero score-share `fraction_habitable_tiles_developed` | secondary headline |
| P2-3 | Voyager tier-unlock wall-clock | cheap long-horizon proxy |
| P2-4 | OpenSpiel integration adapter | §6 future work demo |
| P2-5 | Kruskal-Wallis significance for LLM-on vs fallback conditions | rigor |
| P2-6 | 24-hour E5 run | paper polish |

---

## 2. Week-by-Week 详细日程

### Week 1 (D1–D7): Infrastructure P0

**D1 (Mon)** — Multi-seed runner + ScoringEngine
- [ ] P0-1: 写 `src/benchmark/framework/SeedMatrix.js`
- [ ] P0-2: 在 `ScoringEngine.js` 加 sandwich normalization
- [ ] P0-3: 在 `ResourceAllocationEfficiency.js` 改 geometric mean
- 测试：跑 5 seed × 1 scenario × fallback，verify NDJSON 出来

**D2 (Tue)** — PolicyValue Baseline
- [ ] P0-4: 在 `src/benchmark/framework/PVB.js` 实现
- [ ] 单元测试：fallback × fallback 跑出 PVB ≈ 0（健全性）
- [ ] 集成测试：fallback × random LLM 跑出 PVB variance < raw RAE variance

**D3-D4 (Wed-Thu)** — HTTPAgentClient + agent-bridge
- [ ] P0-5: `src/simulation/ai/llm/HTTPAgentClient.js` (~150 LOC)
- [ ] `server/agent-bridge.js` 加 `/api/agent/*` endpoint (~150 LOC)
- [ ] `server/config/agent-routing.js` channel→agentId 路由 (~100 LOC)
- [ ] 集成测试：multi-process 启 2 个 ai-proxy（不同 model），通过 agent-bridge 跑 4 channel × 异质模型

**D5 (Fri)** — ScriptedOraclePolicy + FlatBaselineAdapter
- [ ] P0-6: `src/benchmark/baselines/ScriptedOraclePolicy.js`
  - per-scenario hand-tuned policy（pre-pilot 验证 +≥20% RAE over fallback）
- [ ] P0-8: `src/benchmark/baselines/FlatBaselineAdapter.js` (E1 控对照)
- 集成测试：oracle 跑 5 seed 看分数 ceiling

**D6 (Sat)** — Long determinism gate + bench:dimensions full pipeline
- [ ] P0-7: 跑 7200-tick determinism check on 2 scenarios
  - 决策门：如 fail → 修 PathWorkerPool 或限制 ≤ 1800 tick
- [ ] `scripts/benchmark-paper.mjs` 完整版：runSeedMatrix → 5 dimensions → ScoringEngine → NDJSON

**D7 (Sun)** — Buffer + W1 retro
- [ ] 跑 E2 试点（5 seed × 1 scenario × 1 model）确认 pipeline 通
- [ ] **决策门 G1**：是否 W1 P0 全部就绪？如 NO，延后 W2 启动 1 天

### Week 2 (D8–D14): Cheap Experiments E2/E6/E7/E1

**D8-D9 (Mon-Tue)** — E2 (token decoupling) + E6 (failure profile)
- [ ] E2: 25 runs × 5 world sizes × 5 seeds + 1 scenario + 1 model （Claude-Sonnet）
- [ ] E6: 70 runs × 7 model × 2 scenario × 5 seeds
- 估计算力 ~24 GPU-hours
- 输出：E2 scatter + E6 failure matrix table

**D10 (Wed)** — E7 (DTE)
- [ ] Reuse E6 logs + 15 cadence ablation runs (1 model × 3 cadence × 5 seeds)
- [ ] 计算 Spearman ρ(RAE, DTE)
- [ ] **决策门 G2**：DTE 是否给出与 RAE 不同的排序？如 ρ > 0.7 → 可能要重新设计 DTE

**D11-D13 (Thu-Sat)** — E1 (hierarchical vs flat)
- [ ] 40 runs × 2 architecture × 2 scenario × 10 seeds
- [ ] 估计 ~16 GPU-hours
- [ ] **决策门 G3**：H1 effect size ≥ 0.10？如 NO → 论文 §5.1 重新 framing

**D14 (Sun)** — Buffer + W2 retro
- [ ] 4 个实验数据 + figure 初稿
- [ ] 决策门：Week 3 是否上 E3 / E4？如 W1/W2 落后 → drop E4 留到 v2

### Week 3 (D15–D21): Heavy Experiments + Paper Draft §1-§4

**D15-D17 (Mon-Wed)** — E4 (multi-resource Gini)
- [ ] 120 runs × 4 model × 3 scenario × 10 seeds
- [ ] ~50 GPU-hours
- [ ] 输出：scatter sufficiency vs Gini by tier

**D18-D20 (Thu-Sat)** — E3 (multi-LLM matrix) — **最高 risk**
- [ ] 100 runs × 5 cells (FB/WW/SW/WS/SS) × 2 scenario × 10 seeds
- [ ] ~50 GPU-hours
- [ ] 退路：如 HTTPAgentClient 不稳 → Plan B（4 个独立 ai-proxy 进程切换）
- [ ] **决策门 G4**：H3a (SW > WW + 0.15) 与 H3b (SW within 0.05 of SS) 是否成立？
  - 若 H3a fail → §5.3 重新 framing；可能保留 paper 但 weaken claim
  - 若 H3b fail → still publishable（"SS 显著好于 SW" 也是 finding）

**D15-D21 (并行)** — Paper §1-§4 LaTeX 初稿
- [ ] §1 Intro + §2 Related Work（用 30 篇文献调研）
- [ ] §3 Architecture（用 paper-framework.md §2.3 结构）
- [ ] §4 Metric Stack（用 paper-framework.md §2.4 结构）
- [ ] Figure 1/2/3 重画（架构图 + 4-layer 降维 + metric stack）
- [ ] **决策门 G5 (D21 Sat)**：§1-§4 是否完成？图片是否齐？

### Week 4 (D22–D28): E5 + E9 + Paper §5-§8 + Polish

**D22-D24 (Mon-Wed)** — E5 (memory degradation 三曲线)
- [ ] 30min × 3 model × 5 seed = 15 runs (~3 GPU-h)
- [ ] 2h × 3 model × 5 seed = 15 runs (~30 GPU-h)
- [ ] 8h × 3 model × 3 seed = 9 runs (~36 GPU-h)
- [ ] E5d lost-in-middle: 27 runs × 2h ablation (~14 GPU-h)
- [ ] 总计 ~80 GPU-h
- [ ] 24h subset 留 camera-ready

**D25 (Thu)** — E9 reproducibility
- [ ] 7200-tick determinism × 2 scenario × 2 runs = hash equality
- [ ] Container reproducibility: docker build + docker run on 2 OS
- [ ] Multi-OS: Linux + macOS（Windows 可选）
- [ ] **决策门 G6**：所有 reproducibility gates 通过？如有 64-bit float 跨架构不一致 → 论文标 "partial reproducibility"

**D26 (Fri)** — E8 post-hoc Bayesian analysis
- [ ] 对 E1-E7 的 logs 跑 bootstrap
- [ ] Compare Bayesian vs frequentist ranking stability vs N
- [ ] Figure 8 ranking stability line chart

**D27 (Sat)** — Paper §5-§8 finalize
- [ ] §5 Experiments 9 个子节
- [ ] §6 Discussion
- [ ] §7 Limitations & Future Work
- [ ] §8 Reproducibility Statement (Datasheet for Datasets 模板)
- [ ] Supplement: prompt 全文 / model snapshots / Dockerfile / extended tables

**D28 (Sun)** — Submission day
- [ ] 全文 polish
- [ ] LaTeX 编译 + figure 美化
- [ ] **检查 NeurIPS D&B 提交清单**：
  - [ ] Croissant metadata
  - [ ] Reproducibility checklist
  - [ ] Author identity check
  - [ ] Page limit
- [ ] 提交！

---

## 3. 决策门一览（critical path）

| Gate | When | 测什么 | 通过 → | 不通过 → |
|---|---|---|---|---|
| G1 | D7 Sun | W1 P0 全部就绪？multi-seed runner / sandwich / PVB / HTTPAgentClient / oracle / FlatBaseline 全可跑？ | W2 启动 | 延后 W2，drop E4 留 v2 |
| G2 | D10 Wed | DTE rank ≠ RAE rank？(ρ < 0.7) | E7 paper section 成立 | 重新设计 DTE 公式（如改 multi-window aggregation） |
| G3 | D13 Sat | E1 H1 effect size ≥ 0.10？ | §5.1 hierarchical-necessary 成立 | weaken claim 到 "comparable but more interpretable" |
| G4 | D20 Sat | E3 H3a (SW > WW + 0.15) AND/OR H3b (SW ≈ SS at 1/3 cost)？ | §5.3 multi-LLM win | 保留 paper 但 framing 改为 "trade-off space exploration" |
| G5 | D21 Sat | §1-§4 LaTeX 初稿 + 3 figures 完成？ | W4 启动 | W4 加班 |
| G6 | D25 Thu | E9 reproducibility 全部 gate 通过？ | bit-identical claim 站住 | 论文标 "partial reproducibility under specified conditions" |
| G7 | D28 Sun | 全文完整 + Croissant/checklist 完整？ | 提交 | workshop 退路 |

---

## 4. 退路方案 (Plan B for each risk)

### 4.1 HTTPAgentClient 不稳（W1 D3-D4 阻塞 E3）

**Plan B**: 4 个独立 ai-proxy 进程，env var 切换
- `OPENAI_BASE_URL_ENV / NPC / STRATEGIC / COLONY` 4 个环境变量
- SimHarness 启动时根据 channel 注入对应 base URL
- 比 agent-bridge 简陋但 1 天可实现

### 4.2 ScriptedOraclePolicy 太弱（< +20% over fallback）

**Plan B**: 不用 oracle ceiling，归一化改成 `(LLM − fallback) / theoretical_max`
- theoretical_max = `min(food_capacity, 100)` 之类
- 仍可用 sandwich 公式但上界不严格

### 4.3 PVB variance reduction < 2×

**Plan B**: 直接扩 seeds 到 25
- 多花 ~3× compute → 总预算 ~700 GPU-hours，仍可负担
- 论文 §4.4 改 framing："PVB 给方差缩减 ~1.5× as expected for natural-language directives"（弱版 claim 仍成立）

### 4.4 24-hour E5 跑非确定

**Plan B**: limit 到 8 hours，camera-ready 再补 24h
- 不影响主表
- §5.5 改 "8h preview, 24h projection"

### 4.5 LLM API rate limit (E3 100 runs)

**Plan B**: 多 provider 并行
- Anthropic + OpenAI + 本地 vLLM 三路
- 排队跑而非 burst
- 加 ~12 hours wall clock

### 4.6 投稿截止前数据不全

**Plan B**: drop E5 24h、E4 缩到 60 runs（4 model × 3 scenario × 5 seeds）
- 仍可投 NeurIPS D&B；workshop 是最终 fallback

### 4.7 (NEW v2) Reviewer cite X-MAS 反驳 §2.3 first heterogeneous claim

**Plan B**: §2.3 重 framing **已锁定**为 channel-axis × cross-vendor × long-horizon-survival 三-way（见 paper-framework.md §1.2 C3）。E3 Phase B 的 cross-vendor cells (XV-DIVERSE-LIGHT / XV-DIVERSE-STRONG / XV-OPENWEIGHT-ONLY) 是 defend 这个 claim 的核心证据 — **必跑**。

### 4.8 (NEW v2) Reviewer cite MemoryArena/MemoryAgentBench 反驳 §2.5 三曲线 first

**Plan B**: §2.5 重 framing **已锁定**为 三轴联合 + 连续 tick + 自然累积 三-way（见 paper-framework.md §1.2 C3）。E5 H5e (action-grounded vs verbal recall) + H5f (session-vs-tick ablation) 是 defend 的核心证据 — **必跑**。

### 4.9 (NEW v2) LayerCast adapter 实现失败

**Plan B**: P0-9 降级 P2，§2.9 退回 2-tier (fallback + production stationary) 比 MLE-Bench 仍强。论文 §7 Limitations 标 "Tier 2 LayerCast verification deferred to camera-ready upon hardware availability"。

### 4.10 (NEW v2) Cross-vendor agent-bridge 复杂度爆炸

**Plan B**: P0-11 是设计为 P0-5 的 simplified fallback — 4 个独立 ai-proxy 进程 × `OPENAI_BASE_URL_ENV / NPC / STRATEGIC / COLONY` 4 环境变量。1 day 实现量。如 P0-5 W1 完不成，P0-11 仍可独立跑 E3 Phase A + B。

### 4.11 (NEW v2) Orak (ICLR 2026) 同 venue 撞车

**Risk**: ICLR 2026 已 accept Orak，如 Project-Utopia 也投 ICLR 2027 main，reviewer 可能视为重复。
**Plan B**: 主投 NeurIPS D&B 2026 (D&B 与 ICLR main 重叠率低)；§2 显式 differentiate depth-first vs breadth-first；如 D&B 拒，转 ICLR 2027 时强化 differentiation segment.

---

## 5. 关键决策（项目所有者拍板）— v2

下列 7 项必须在 W1 D1 前定下，否则后续工作有歧义：

| ID | 决策 | 默认建议 | 拍板 |
|---|---|---|---|
| K1 | 主投目标 | **NeurIPS D&B 2026** (deadline 2026-06-07)；备 ICLR 2027 (2026-09); EMNLP 2026 R&E (2026-06-15, 见 emnlp-readiness-assessment.md) | _待定_ |
| K2 | E3 cross-vendor cells 选哪些 4 vendor？建议 (a) Anthropic + OpenAI + 本地 vLLM Hermes/Llama + Qwen | 按 `experimental-design.md §E3 v2` | _待定_ |
| K3 | LLM API budget 上限：v2 估 $340 | $400 (含 buffer) | _待定_ |
| K4 | 24-hour E5 是否在 v1 必须有？ | 否（camera-ready 再补） | _待定_ |
| K5 | 论文协作者数与角色 | 1 dev only（保守估时）| _待定_ |
| **K6 (NEW v2)** | **RMM Tier 目标** (Siddiq 2025-11)：Tier 4 (强 reproducibility) / Tier 5 (顶级，需要持续维护)？ | Tier 4 | _待定_ |
| **K7 (NEW v2)** | **LayerCast adapter 是否 P0**？依赖：能否拿到 LayerCast inference 配置（NVIDIA H100 + bf16 weights + FP32 ops）？如硬件不支持 → P0-9 降级 P2 | P0 if hardware permit, else P2 | _待定_ |

---

## 6. 每周 deliverables checklist

### W1 deliverables (D7 Sun)
- [ ] `src/benchmark/framework/SeedMatrix.js` — multi-seed runner
- [ ] `src/benchmark/framework/PVB.js` — variance reduction
- [ ] `src/simulation/ai/llm/HTTPAgentClient.js`
- [ ] `server/agent-bridge.js` + `agent-routing.js`
- [ ] `src/benchmark/baselines/ScriptedOraclePolicy.js`
- [ ] `src/benchmark/baselines/FlatBaselineAdapter.js`
- [ ] `tools/audit/determinism-check.js` 升级到 7200 tick
- [ ] `scripts/benchmark-paper.mjs` 全 pipeline
- [ ] 5 seed pilot run on 1 scenario × fallback 出 NDJSON

### W2 deliverables (D14 Sun)
- [ ] E2 / E6 / E7 / E1 数据 + NDJSON files
- [ ] 4 figures 初稿
- [ ] §5 各节实验描述初稿
- [ ] 决策门 G2 / G3 报告（DTE / hierarchy 是否站住）

### W3 deliverables (D21 Sat)
- [ ] E3 / E4 数据
- [ ] §1-§4 LaTeX 初稿
- [ ] Figure 1-7 + Table 1
- [ ] 决策门 G4 报告（multi-LLM 是否站住）

### W4 deliverables (D28 Sun)
- [ ] E5 + E9 + E8 数据
- [ ] §5-§8 LaTeX 完整
- [ ] Figure 1-10 + Table 1-3 全部
- [ ] Supplement 完整
- [ ] Croissant metadata + reproducibility checklist
- [ ] **NeurIPS D&B submission**

---

## 7. Living-Document Cross-Reference

| 文档 | 此 roadmap 引用关系 |
|---|---|
| `paper-framework.md` | 论文章节结构（§2 outline）+ figure inventory（§3）+ reviewer defense（§4） |
| `experimental-design.md` | E1–E9 的 hypothesis / factor / metric / expected table |
| `literature-metrics-survey.md` | metric stack（§4.x）的 prior art 全部引用 |
| `literature-game-ai-metrics.md` | PVB / TrueSkill / α-rank / league learning prior art |
| `refactor-plan.md` | 已落地代码（rc1）vs 未落地 deferred 项的盘点 |
| `determinism-report.md` | E9 复现性 audit 当前状态 + 未答问题 |

---

## 8. 即刻下一步（开工动作）

提交此 roadmap 后立即可做：

1. **K1-K5 五个决策**：项目所有者勾选 §5 表
2. **D1 Mon**：开始 P0-1 multi-seed runner + P0-2 sandwich norm + P0-3 geometric mean
3. **同步**：在 GitHub 开 5 个 issue 跟踪 P0 任务，每完成 close 一个；用 GitHub project board 看 burndown
4. **协作**：如有 collaborator，按 P0/P1/P2 分配；如 solo dev 严格按 D1-D28 顺序

**End of roadmap.** 实际开工 day-counter 从 K1-K5 拍板后第 1 天开始。
