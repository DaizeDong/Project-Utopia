# Benchmark 系统性改进方案

> **日期**: 2026-04-11  
> **输入**: benchmark-methodology-review.md 识别的三大系统性问题  
> **方法**: 从四个独立视角（ML benchmark 设计、游戏 AI 评估、统计严谨性、软件架构）交叉论证

---

## 0. 问题回顾

| 问题 | 当前评分 | 本质 |
|------|:--------:|------|
| 泛化性 | 3.6/10 | 固定预设场景，无法测试未见条件下的能力 |
| 本质性 | 4.5/10 | 检查格式/存在性而非决策质量 |
| 大局观 | 4.4/10 | 可通过调参/加补丁刷分，无需架构改进 |

---

## 1. 程序化场景生成器 — 解决泛化性

### 1.1 核心思路

用**参数化状态空间采样**替代手工枚举预设。每次 benchmark 运行面对的场景组合都是新的，从根本上消除对固定场景的依赖。

### 1.2 状态空间定义

```js
// ScenarioSampler.js
const SCENARIO_SPACE = Object.freeze({
  templateId:     { type: 'categorical', values: ALL_6_TEMPLATE_IDS },
  seed:           { type: 'uniform_int', min: 0, max: 2**32 },
  food:           { type: 'log_uniform', min: 5, max: 200 },
  wood:           { type: 'log_uniform', min: 3, max: 150 },
  stone:          { type: 'uniform', min: 0, max: 40 },
  herbs:          { type: 'uniform', min: 0, max: 25 },
  workerCount:    { type: 'uniform_int', min: 2, max: 25 },
  threat:         { type: 'uniform', min: 0, max: 100 },
  predators:      { type: 'uniform_int', min: 0, max: 6 },
  weather:        { type: 'categorical', values: ['clear','storm','drought'] },
  buildingBudget: { type: 'uniform_int', min: 0, max: 30 },
});
```

### 1.3 难度分层采样

定义难度函数，确保覆盖完整难度谱：

```
D(scenario) = w₁·scarcity + w₂·threat + w₃·isolation
  scarcity  = 1 - resources / (workerCount × survivalThreshold)
  threat    = scenario.threat / 100
  isolation = 1 - connectedBuildings / totalBuildings
```

将 D 分为 5 个 bin（trivial / easy / medium / hard / extreme），每个 bin 采样等量场景。另外强制包含 20% 边界条件（2 workers + 0 food、25 workers + 3 farms 等）。

### 1.4 与现有系统的衔接

生成的场景对象与现有 preset 格式完全一致，直接传入 `applyPreset(state, generatedScenario)`。手工预设保留为回归基线，但不再是评分的唯一来源。

### 1.5 实验矩阵（正交设计）

参考统计学视角的建议：

```
因子A: 种子     — 16 个（检测 d=0.5 效应量需 n≥34，8 preset × 16 seeds = 128）
因子B: 场景     — 每类别分层抽 1-2 个，共 8 个
因子C: AI 配置  — baseline vs treatment
总运行: 2 × 8 × 16 = 256 次/比较
```

消融实验最少 16 seeds（当前仅 3 个，统计功效严重不足）。

---

## 2. 能力探针 (Capability Probes) — 解决本质性

### 2.1 核心思路

每个探针测试一个**不可约的基础能力**（参考 ARC 的核心知识先验），用**行为断言**替代格式检查。探针评估"AI 在当前上下文中是否做出了最有利于长远发展的决策"，而非"输出是否包含特定关键字"。

### 2.2 六个基础能力探针

| Probe | 能力 | 评估方式 | 指标 |
|-------|------|---------|------|
| **RESOURCE_TRIAGE** | 资源稀缺优先级 | food=3, workers=10 → 30s 内 >50% worker 分配到食物 | workerFoodRatio |
| **THREAT_RESPONSE** | 威胁感知与防御 | 注入 3 predators 于仓库旁 → 测量防御响应延迟 | responseLatencySec |
| **BOTTLENECK_ID** | 瓶颈识别 | 8 farms + 0 warehouse → 检查是否优先建仓库 | correctPriorityBool |
| **PLAN_COHERENCE** | 多步一致性 | 连续 5 个决策的目标漂移度 | switchRate |
| **ADAPTATION** | 环境突变适应 | 稳态后注入 storm + predators → 恢复到 80% 基线的时间 | recoveryTimeSec |
| **SCALING** | 规模扩展 | 5/15/25 workers 同一任务 → 效率是否次线性增长 | efficiencyRatio |

### 2.3 Context-Optimal Delta (COD) 框架

从游戏 AI 评估角度，不评估"做了什么"，而评估"决策与当前态势最优策略的偏离度"：

1. **态势识别准确度** — 将游戏态势分类为模式（饥荒/扩张/防御/瓶颈），对比 Perceiver 输出与规则引擎后验标签的吻合度
2. **策略一致性** — 检查 Planner 的资源分配是否与态势匹配（如饥荒模式下 40-70% 劳动力投入食物生产）
3. **长期收益率** — 从决策点追踪未来 N tick 的殖民地健康指标变化率，与基线策略对比

**最终分数** = 0.2 × 态势识别 + 0.3 × 策略一致性 + 0.5 × 长期收益率

### 2.4 情境适应性测试：动态转折点注入

设计 `CrisisInjector`，在 AI 进入"稳态"（连续 30 tick 无重大策略调整）后注入突发事件：

**三阶段评分**：
- **检测延迟**: 从注入到 Perceiver 首次反映威胁的 tick 数。0-3 tick 满分，>10 tick 零分
- **响应质量**: 注入后 20 tick 内的策略调整覆盖率（角色重分配、建筑优先级变更等）
- **恢复曲线**: 从危机最低点恢复到 80% 基线水平的时间

---

## 3. 抗刷分评分体系 — 解决大局观

### 3.1 相对评分替代绝对评分

当前 `T_composite` 使用绝对阈值，trivial 策略也能拿到正分。改为：

```js
probeScore = (agentScore - baselineScore) / (ceilingScore - baselineScore)
```

- **baseline**: 同一场景下运行随机策略的分数
- **ceiling**: 同一场景下运行贪心 oracle 的分数
- trivial 策略得分趋近 0，而非某个可以"够到"的正数

### 3.2 一致性惩罚

跨场景的分数方差纳入最终评分，惩罚只在特定场景表现好的"过拟合"策略：

```js
finalScore = mean(probeScores) - λ · std(probeScores)   // λ = 0.5
```

### 3.3 Bayesian Beta-Binomial 评分（替代 passRate×8+2）

对每个维度 m 的 N 次运行得分 {x₁,...,xₙ}（各 ∈ [0,1]）：

```
先验:   Beta(α₀=2, β₀=2)                    弱信息先验
后验:   α_post = α₀ + Σxᵢ,  β_post = β₀ + N - Σxᵢ
点估计: μ = α_post / (α_post + β_post)
95% CI: Beta.quantile([0.025, 0.975], α_post, β_post)
```

**优势**: 自带置信区间、小样本友好、区分度远优于线性映射。

### 3.4 跨系统因果链追踪

构建 **Decision Trace Graph**，在每个 phase 接口埋点：

```
Perceiver.output → Planner.input → Planner.output → Executor.input → ...
```

当殖民地发生负面事件时，执行反向追踪：
1. Executor 执行是否偏离 Planner 指令？→ 若否继续向上
2. Planner 收到的数据是否包含危机信号？→ 包含但忽略 → 归因 Planner
3. 原始状态是否存在信号？→ 存在但未提取 → 归因 Perceiver

输出各 phase 的**过失分布**（如 Perceiver 45%、Planner 35%、Executor 20%），直接指导优化方向。

### 3.5 结果报告标准

```js
const BenchmarkReport = {
  meta: { agent, date, gitHash, totalRuns, wallTimeMin },
  dimensions: {
    T_composite: {
      mean: 0.72, std: 0.09,
      ci95: [0.67, 0.77],          // Beta 后验 CI
      median: 0.74,
      p5: 0.58, p95: 0.83,         // 尾部风险
    },
  },
  comparison: {                     // A/B 比较
    deltaMean: 0.08,
    cohenD: 0.52,                   // 效应量
    bayesFactor: 4.7,               // BF₁₀ > 3 = 实质性证据
    verdict: "LIKELY_IMPROVEMENT",
  },
};
```

| 条件 | 结论 |
|------|------|
| BF₁₀ > 10, Cohen's d > 0.5 | **确认改进** |
| BF₁₀ > 3, Cohen's d > 0.3 | 可能改进，建议增加样本 |
| BF₁₀ ∈ [1/3, 3] | 证据不足 |
| BF₁₀ < 1/3 | 无效果 |

---

## 4. 统一框架架构 — 落地基础

### 4.1 目录结构

```
src/benchmark/
├── BenchmarkMetrics.js            ← 保留
├── BenchmarkPresets.js            ← 保留
├── framework/
│   ├── SimHarness.js              ← 模拟运行器（复用 state/systems/services 初始化）
│   ├── ScenarioSampler.js         ← 程序化场景生成器
│   ├── CrisisInjector.js          ← 动态转折点注入
│   ├── ProbeCollector.js          ← 探针采样收集
│   ├── ScoringEngine.js           ← Bayesian 评分引擎
│   ├── DecisionTracer.js          ← 因果链追踪
│   ├── LLMJudge.js                ← LLM 评审共享逻辑
│   └── cli.js                     ← 共享 CLI + 报告格式化
├── dimensions/                    ← 插件目录
│   ├── DimensionPlugin.js         ← 插件协议定义
│   ├── perceiver.js               ← 从 perceiver-benchmark.mjs 迁移
│   ├── planner.js
│   ├── executor.js
│   ├── evaluator.js
│   ├── director.js
│   ├── skills.js
│   ├── infrastructure.js
│   ├── adaptation.js              ← 新：情境适应性
│   └── causal-chain.js            ← 新：因果链验证
└── run.js                         ← 统一入口
```

### 4.2 核心接口

```js
// DimensionPlugin 协议
{
  id: string,                    // "perceiver"
  label: string,                 // "Perceiver Quality"
  scoreDimensions: string[],     // ["completeness", "spatial", "temporal"]

  collectSamples(harness, opts) → object[],           // 运行模拟 + 采样
  selfScore(samples, context) → Record<string, number>, // 确定性自评
  buildJudgePrompt?(samples) → string,                // 可选 LLM judge
  parseJudgeResponse?(text) → Record<string, number>, // 可选
}
```

```js
// SimHarness — 消除 8 个 runner 中的重复代码
class SimHarness {
  constructor({ templateId, seed, aiEnabled, preset, systemOverride })
  get context() → { state, services, systems, memoryStore }
  advanceTo(targetSec)
  advanceTicks(count, onTick)
  snapshot() → stateSnapshot
}
```

### 4.3 分阶段迁移

| Phase | 内容 | 风险 |
|-------|------|------|
| **1. 提取共享层** | SimHarness + cli.js + LLMJudge.js，独立测试，不改现有脚本 | 零破坏 |
| **2. 逐个迁移** | perceiver → planner → evaluator → executor → director → skills → ablation → runner | 每迁一个验证输出一致 |
| **3. 新维度添加** | ScenarioSampler + CrisisInjector + adaptation + causal-chain | 纯新增 |
| **4. 评分升级** | ScoringEngine (Bayesian) + 相对评分 + 报告标准 | 需建立 baseline/ceiling |

---

## 5. 改进效果预估

| 问题 | 当前 | 目标 | 关键改进 |
|------|:----:|:----:|---------|
| 泛化性 | 3.6 | **8+** | 程序化场景生成 + 16 seeds × 8 presets 矩阵 |
| 本质性 | 4.5 | **8+** | 能力探针 + COD 框架 + ground truth 对比 |
| 大局观 | 4.4 | **8+** | 相对评分 + 一致性惩罚 + 因果链归因 |

### 核心转变

```
当前: "测试实现是否正确"  →  目标: "测试算法是否智能"

格式检查        →  行为断言（能力探针）
绝对阈值        →  相对评分（baseline/ceiling）
固定场景        →  程序化采样（难度分层）
单轮通过率      →  多轮学习曲线 + 恢复曲线
passRate×8+2   →  Bayesian Beta-Binomial + 置信区间
均值报告        →  效应量 + Bayes Factor + P5/P95
```
