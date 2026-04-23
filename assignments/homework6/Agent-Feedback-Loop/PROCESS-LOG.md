# Agent-Feedback-Loop — Historical Log

> 本文件只记录各轮执行日志、关键问题、结果与 handoff。
>
> 规则、准则、角色分工与 Round 4 前置检查见 `PROCESS.md`。

---

## Round 0

### Timeline

- 启动第一轮完整 4-stage 流水线
- Stage A 初始并发 reviewer 触发过 context truncation，随后补派
- Stage B 产出 10 份 plan 与 1 份 summary
- Stage C 串行实现 10 份 plan，累计多次 commit
- Stage D 完成测试与 benchmark 验证

### Key Result

- `node --test` 通过
- benchmark 从 baseline 有明显改善
- 但 reviewer 平均分只有约 `3.1 / 10`

### Main Lesson

Round 0 证明了这条流水线能跑通，但还没有证明它会自动趋向“真正更好的游戏”。

---

## Round 1

### Timeline

- 用户明确要求 reviewer 独立、无记忆、不能看到上轮评论
- 发现早期 reviewer runtime context 泄漏了上一轮评分与 delta 信息
- 删除受污染 feedback，重跑 Stage A
- Stage B / C / D 继续完成

### Key Result

- 流水线继续可执行
- reviewer 分数仍然低位徘徊
- 说明 blind rerun 后，项目质量并没有因为“上下文更会讲故事”而自然提高

### Main Lesson

第一次明确暴露出一个核心规则：**reviewer 必须盲审**。跨轮比较应该由 orchestrator 或人来做，而不是把“上轮发生了什么”喂给 reviewer。

---

## Round 2

### Timeline

- Stage A：10 个 reviewer feedback + summary
- Stage B：10 个 enhancer plan + summary，accepted `10/10`
- Stage C：按 3 waves 串行实现
- Stage D：最初 benchmark 回归，随后修复 starter wall floor
- 归档 Round 2 artefacts

### Final Validation

- full test suite: `1055/1057` pass
- benchmark: DevIndex `37.77`
- browser smoke: 通过

### Main Lesson

Round 2 做了大量 HUD、提示、可见性、交互反馈与文案层优化，工程上是完整的，但 benchmark 基本回到原有带宽，没有形成本质性突破。

---

## Round 3

### Timeline

- 先写 `structural-reflection.md`
- Stage A：10 个 reviewer feedback，平均分约 `5.18 / 10`
- Stage B：10 份 plan 中 accepted `4`、deferred/subsumed `6`
- Wave 1：
  - `01d` worker recovery tuning
  - `01b` build consequence preview
- Wave 2：
  - `01a` next-action contract
  - `02c` autopilot truth contract
- Stage D 首次 benchmark 失败：
  - day 21 loss
  - DevIndex `41.32`
  - score `4906`
- Stage D debugger 重新校准 `01d` 阈值
- 最终归档 Round 3 artefacts

### Final Validation

- full test suite: `1069/1071` pass, `0` fail, `2` skip
- benchmark:
  - `max_days_reached`
  - DevIndex `37.8`
  - score `20450`
  - `passed=true`
- browser smoke:
  - active HUD 正常
  - next-action chip 正常
  - autopilot chip 正常
  - 无 console/page error

### Main Lesson

Round 3 比 Round 0-2 更接近结构问题，因为它开始处理：

- 当前下一步行动
- 建造前因果预览
- worker recovery timing
- autopilot 状态真相

但它仍不是本质突破。90 天 DevIndex 仍在与前几轮相近的区间，说明真正的经济/物流/autopilot 核心循环还没有被重构。

---

## Cross-Round Summary

| Round | Focus | Validation | Main Lesson |
|------|------|------------|-------------|
| 0 | 流水线打通 + UX polish | 绿色 | 流程能跑通，不代表质量会本质提升 |
| 1 | 盲审纠偏 + 持续修补 | 绿色 | reviewer context 泄漏会直接污染结论 |
| 2 | 大量 UI / feedback / readability polish | 绿色 | 改得很多，但不够本质 |
| 3 | agency / consequence / control-truth | 绿色 | 比前几轮更对路，但仍未解决核心模拟循环 |

---

## Round 4 Handoff

Round 4 启动前必须坚持两条原则：

1. reviewer 完全 blind，不能看到仓库、历史、差分、作者叙事
2. plan 与实现优先追求更本质的系统改进，而不是让 reviewer 更容易“感到被照顾”从而提分

Round 4 若违反其中任一条，应视为流程失效，而不是正常迭代。
