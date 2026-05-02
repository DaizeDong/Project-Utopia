# Benchmark 评测方法论审查报告

> **审查日期**: 2026-04-11  
> **审查范围**: 8 个 benchmark runner + 2 个 metric 模块 + 26 个 presets  
> **评估维度**: 泛化性、本质性、大局观

---

## 1. 评估框架

每个 benchmark 在三个维度上评分 (1-10)：

| 维度 | 定义 | 好的评测 | 差的评测 |
|------|------|---------|---------|
| **泛化性** | 是否具有任意拓展性 | "在任意地形大小与分布下测试" | "在固定几个预设场景下测试" |
| **本质性** | 是否从算法本质出发 | "决策是否适应游戏上下文" | "在特定 case 下输出是否匹配" |
| **大局观** | 低分是否指向架构缺陷 | "需要重构算法设计才能改善" | "调参数/加补丁即可刷分" |

---

## 2. 综合评分矩阵

| Benchmark | 泛化性 | 本质性 | 大局观 | 均分 | 核心问题 |
|-----------|:------:|:------:|:------:|:----:|---------|
| **benchmark-runner** | 3 | 4 | 5 | 4.0 | 场景硬编码，指标衡量数值而非决策，合成成本数据 |
| **perceiver-benchmark** | 3 | 4 | 4 | 3.7 | 单一场景，检查字段存在而非数值准确性，基分过高 |
| **planner-benchmark** | 3 | 3 | 2 | 2.7 | 格式验证为主，不评估执行后经济效果 |
| **executor-benchmark** | 4 | 5 | 3 | 4.0 | 硬编码断言值，不测放置质量/竞争冲突 |
| **evaluator-benchmark** | 3 | 4 | 3 | 3.3 | 无多轮迭代测试，诊断正确性未验证 |
| **director-benchmark** | 4 | 5 | 6 | 5.0 | A/B 阈值宽松，self-assessment 为线性映射 |
| **skills-benchmark** | 3 | 4 | 4 | 3.7 | 不衡量学习带来的实际效率提升 |
| **ablation-benchmark** | 6 | 7 | 8 | 7.0 | 设计最科学，但评估维度单一且无统计检验 |

**整体均分: 4.2/10** — 工程质量合格但评测深度不足。

---

## 3. 逐维度系统性问题

### 3.1 泛化性 — 整体评分: 3.6/10

**核心缺陷: 有限组合的查找表式测试**

所有 benchmark 共享同一模式：
- 默认锁定单一地图模板 (`temperate_plains`) + 固定种子 (`42`)
- 测试用例为手工枚举的硬编码值（资源量、坐标、阈值）
- 无参数化生成、无 Monte Carlo 采样、无 property-based testing
- 网格尺寸完全由模板决定，无尺寸变化维度

**具体证据：**

| Benchmark | 场景覆盖 | 证据 |
|-----------|---------|------|
| benchmark-runner | 3 模板 × 10 种子 | 6 个可用模板只用了 3 个 (line 46-50) |
| perceiver | 1 模板 × 1 种子 | seed=42, template=temperate_plains (line 306-307) |
| planner | 1 模板 × 1 快照 | 硬编码 JSON 测试验证逻辑 (line 119-186) |
| executor | 1 模板 × 1 种子 | 所有断言不随地图变化 |
| evaluator | 1 模板 × 1 种子 | 固定坐标 ix:5,iz:5 (line 183) |
| ablation | 5 模板 × 3 种子 | 消融仅在 temperate_plains 做 (line 424) |

**后果：** 新增一个地图模板、改变网格尺寸、或引入新建筑类型时，benchmark 完全无法自动覆盖——需要人工添加新的预设和断言。

### 3.2 本质性 — 整体评分: 4.5/10

**核心缺陷: 检查格式/存在性，而非语义质量**

| 问题模式 | 出现位置 | 示例 |
|---------|---------|------|
| **字段存在性检查** | perceiver, evaluator | `last[f] != null` → 全零数据也能拿高分 |
| **关键词匹配** | planner, evaluator | `prompt.includes("Colony State")` → 模板加关键字即可 |
| **通过率线性映射** | 全部 6 个组件 benchmark | `passRate * 8 + 2` → self-assessment 与算法质量脱钩 |
| **合成数据替代真实度量** | benchmark-runner | tokens:200, latencyMs:150 硬编码 (line 244) |
| **不与 ground truth 对比** | perceiver | 收集了 groundTruth 但 selfAssess 未使用 |
| **阈值过低** | planner, executor | `feasible > 0` → 一个步骤可行就算通过 |

**后果：** 一个"空壳"实现——输出正确数据结构但内容质量低下——可以轻松获得 6-7 分。指标衡量的是**结果数值**（资源量、存活时间），而非**决策过程质量**（是否在正确时机做了正确优先级决策）。

### 3.3 大局观 — 整体评分: 4.4/10

**核心缺陷: 分数可通过补丁/调参提升，无需架构改进**

| 可刷分模式 | 示例 |
|-----------|------|
| 模板加关键字 | planner prompt 测试只查 `includes()` |
| 增加 trivial test | self-assessment = passRate * 8 + 2 |
| 硬编码修复单个 case | executor 检查 logistics_hub 的 wood 恰好 = 24 |
| 资源过剩避免失败 | executor 测试给 200 wood/50 stone 执行 4 步计划 |

**唯一例外: ablation-benchmark (8/10)**
消融实验从设计上要求架构级改进——禁用一个组件导致的分数下降，只能通过改进该组件的设计来恢复，而非调参。

---

## 4. 共性问题与根因分析

### 4.1 T_composite 权重 bug

`BenchmarkMetrics.js` line 95-102: `T_surv` 被**重复计入**（0.20 + 0.10 = 0.30），导致存活时间在综合分中权重过高。

```javascript
const T_composite =
  0.20 * T_surv +   // ← 第一次
  0.25 * T_obj +
  0.10 * T_res +
  0.10 * T_pop +
  0.15 * T_pros +
  0.10 * T_threat +
  0.10 * T_surv;    // ← 重复！应该是另一个指标
```

### 4.2 Self-Assessment 公式失效

所有 6 个组件 benchmark 使用相同的 `passRate * N + M` 线性公式。这意味着：
- 添加一个必过的 trivial test 就能提高所有维度分数
- 分数与算法设计质量完全脱钩
- 100% 通过率自动得 10 分，无论测试本身质量如何

### 4.3 缺乏端到端因果链验证

没有任何 benchmark 测试跨系统因果链：
- 天气变化 → 资源产出下降 → AI 调整策略 → 人口存活
- Perceiver 观察 → Planner 计划 → Executor 执行 → Evaluator 反思 → 下轮改进

每个组件 benchmark 在隔离环境中测试，丢失了系统级涌现行为。

### 4.4 缺乏统计严谨性

- 无置信区间 / p-value / 效应量
- 多数 benchmark 只取均值，丢失方差和尾部风险信息
- Ablation 实验仅 3 个种子，统计功效不足

---

## 5. 改进路线图

### Phase 1: 修复已知缺陷 (低成本)

| 改进 | 文件 | 预估工作量 |
|------|------|-----------|
| 修复 T_surv 重复权重 | BenchmarkMetrics.js:101 | 1 行 |
| 启用 computeDecisionQuality | benchmark-runner.mjs | ~10 行 |
| 用真实决策日志替代合成数据 | benchmark-runner.mjs:243-248 | ~20 行 |
| 扩展默认场景至全部 6 个模板 | benchmark-runner.mjs:46-50 | 3 行 |

### Phase 2: 提升本质性 (中等成本)

| 改进 | 描述 |
|------|------|
| **Ground truth 对比** | Perceiver: observation 数值 vs 实际 state 数值的偏差率 |
| **情境适应性指标** | 资源充裕→匮乏转折点，测量 AI 策略切换延迟 (秒) |
| **计划执行效果** | Planner: 执行计划后继续模拟 N 秒，检查关键指标是否改善 |
| **诊断准确率** | Evaluator: 对已知失败场景标注正确根因，计算 precision/recall |
| **学习曲线** | Skills: 衡量后期 plan 是否优于早期 plan |

### Phase 3: 提升泛化性 (较高成本)

| 改进 | 描述 |
|------|------|
| **参数化预设生成器** | 给定资源/人口/建筑密度范围，自动采样 N 个配置 |
| **Property-based testing** | 对 parsePredictedValue 等函数生成随机输入，验证不变量 |
| **跨模板消融矩阵** | 所有 6 模板 × 全部消融条件 |
| **随机种子池** | `--random-seeds=50` 参数，替代固定列表 |
| **网格尺寸维度** | 48×36, 96×72, 144×108 等多种尺寸 |

### Phase 4: 提升大局观 (高成本)

| 改进 | 描述 |
|------|------|
| **跨系统因果链测试** | 天气→资源→AI策略→人口 的完整链评估 |
| **多轮 Reflexion 测试** | 3-5 轮 plan-evaluate-reflect-replan，验证学习曲线 |
| **对抗性场景** | 注入误导性状态，测试 AI 的前瞻性和鲁棒性 |
| **统计框架** | 置信区间、效应量、P5/P95 尾部指标 |
| **时间序列趋势分析** | 区分"系统性衰退"vs"波动后恢复" |

---

## 6. 结论

当前 benchmark 体系在**工程完整性**上表现良好——覆盖了 AI pipeline 全部 6 个 phase，有 A/B 对比、消融实验、LLM Judge 等方法论工具。但在评测深度上存在系统性不足：

1. **泛化性不足 (3.6/10)**：所有测试锁定在有限预设场景中，无法验证算法在未见条件下的泛化能力
2. **本质性不足 (4.5/10)**：大量检查格式/结构而非语义质量，self-assessment 与算法质量脱钩
3. **大局观不足 (4.4/10)**：分数可通过调参/加补丁提升，缺乏需要架构级改进才能解决的深度测试

**Ablation benchmark 是唯一例外 (7.0/10)**，其消融方法论从设计上确保了低分指向架构缺陷。

**核心建议**: 从"测试实现是否正确"转向"测试算法是否智能"。关键转变是：
- 用 **ground truth 对比** 替代 **字段存在性检查**
- 用 **执行后效果衡量** 替代 **输出格式验证**
- 用 **参数化采样** 替代 **硬编码预设**
- 用 **多轮学习曲线** 替代 **单轮通过率**

---

## 7. Headless RAF cap caveat (HW7 R0 → R3 perf-measurement lesson, added 2026-05-01)

> **Source**: HW7 Final-Polish-Loop R3 closeout — `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`
> lines 514-562. A2 R3 self-feedback. Cross-link: `assignments/homework7/Post-Mortem.md` § 4.5.

### 7.1 Phenomenon — Playwright headless RAF 1 Hz throttle

When Chromium runs headless under Playwright with no
`--disable-renderer-backgrounding` family of flags, the compositor
backgrounds the (offscreen) renderer and clamps `requestAnimationFrame`
to ~1 Hz. Observed signal across HW7 R0/R1/R2/R3:

- `dt ≈ 1004 ms` per game tick
- fps ≈ 0.996 across mid / stress / 86-ent
- `__perftrace.frameMs ≈ 0.4 ms` (the render loop itself finishes
  in <1 ms per frame, but the browser only fires it once per second)

This makes **any FPS measurement off the headless harness essentially
uninformative** — it measures the throttle, not the project. The R0 / R1 / R2
Validator gates all hit this and recorded YELLOW with "headless RAF cap"
annotations; R0 → R2 P50 numbers (54.5 / 55 / 56) were not the project
drifting — they were noise inside the throttle.

### 7.2 Ground-truth path — `__perftrace.topSystems`

The project ships an in-build perf trace that records sim-system wall-time
**independent of the RAF schedule**:

- `window.__perftrace.topSystems` exposes per-system avg / peak ms over a
  sliding window.
- `window.__perftrace.frameMs` exposes the render loop wall-time.

These are the **canonical perf signals** under headless Playwright. A2 R3
numbers (avg < 2 ms, peak < 6 ms, mem +11.52 % over 30 min) were
collected via this path and constitute the actual perf verdict for
HW7 R0 → R3.

### 7.3 Required Chromium flags for any future non-headless / hybrid FPS measurement

A Reviewer or Validator that needs a real RAF-driven fps number (not a
`__perftrace` sim-time number) must launch Playwright Chromium with
**all three** of:

```
--disable-renderer-backgrounding
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
```

Missing any one of them silently re-enables the 1 Hz throttle on at least
one Chromium version family.

### 7.4 Mandatory R4+ rule

Any future Reviewer / Validator that records an FPS number **must** either

- (a) launch Playwright with the three flags above and cite which flags
  were used in their report, **or**
- (b) cite `window.__perftrace.topSystems` / `__perftrace.frameMs` as
  the ground-truth perf signal.

Citing a raw fps number from a default-flag headless run is grounds for
that report being marked UNRELIABLE-MEASUREMENT in the Validator gate.
