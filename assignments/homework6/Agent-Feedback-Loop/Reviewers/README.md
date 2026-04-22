# Reviewer Prompts — 2026-04-22 Baseline

> 这 10 份 prompt 是 2026-04-22 评测会话里**实际派遣给 subagent 的原文**，从
> Claude Code 会话日志 `945ccbad-5fdd-453e-b64f-c3950c3b89cc.jsonl` 里直接导出。
> 之后所有 review-enhance pipeline 的 iteration 都应以这 10 份为 reviewer 身份常量。

## Reviewer 清单

### Round 1 — 冷面评测员（5 个 rubric 视角）

| ID | 对应 review 文件 | 维度 |
|----|----------------|------|
| `01a-onboarding` | `01-onboarding.md` | 引导性 |
| `01b-playability` | `02-playability.md` | 可玩性 |
| `01c-ui` | `03-ui.md` | UI 呈现 |
| `01d-mechanics-content` | `04-mechanics-content.md` | 游戏机制 + 内容丰富度 |
| `01e-innovation` | `05-innovation.md` | 创新性 |

### Round 2 — 玩家人格（5 个 persona 视角）

| ID | 对应 review 文件 | Persona |
|----|----------------|---------|
| `02a-rimworld-veteran` | `player-01-rimworld-veteran.md` | RimWorld / DF / ONI 老兵 |
| `02b-casual` | `player-02-casual.md` | Stardew / AC 休闲玩家 |
| `02c-speedrunner` | `player-03-speedrunner.md` | 速通 / 最优化玩家 |
| `02d-roleplayer` | `player-04-roleplayer.md` | 叙事 / 角色扮演玩家 |
| `02e-indie-critic` | `player-05-indie-critic.md` | 独立游戏行业评论家 |

## 关于被覆盖的 prompt

Round 1 的 "可玩性" 和 "机制+内容" 首次派遣时 agent 因探索过长被 context
truncation 提前终止（没有写出文件），被第二次"补写"派遣替换。
JSONL 里可以看到两次派遣，但**仅保留了第二次（实际生效的）**。
导出脚本中标记为 `_superseded_*` 的条目已跳过。

## 如何用于 review-enhance pipeline

**常量化**：把这 10 份 prompt 作为 reviewer 身份常量传入每一轮迭代。
**可变部分**：只有"本轮游戏构建版本"和"上一轮改进 diff"随迭代变化——用
模板头部追加一段 "Context update since last round: ..." 注入即可，原 prompt
主体保持不变。

建议的迭代结构：

```
for round in 1..N:
  build = deploy_current_git_head()
  for reviewer in prompts/*.md:
    review = dispatch_agent(
      base_prompt=reviewer,
      build_url=build.url,
      delta_since_last_round=diff(prev_round, current_round),
    )
    save_review(round, reviewer.id)
  aggregate = summarize(round)
  plan_changes = distill_action_items(aggregate)
  apply_and_commit(plan_changes)
```

**一致性保证**：只要 `prompts/` 不被改写，Round N 的 `02a-rimworld-veteran`
仍然是那位"玩了十年 RimWorld"的同一身份人格，可以和 Round N-1 的同 id 评分
横向对比，看出改进效果。

## 注意事项

- LLM 调用本身不是 bit-deterministic；即便 prompt 完全相同，两次运行评分也会
  有 ±0.5 / 10 的抖动。要做严肃对比，建议每轮对每个 reviewer 跑 3 次取中位数。
- 每个 prompt 里都嵌了 Playwright 使用说明和"必须在结束前写入文件"的 guard
  rail，这些是和 subagent 工具环境耦合的，换 pipeline 框架时需要同步改。
- `date: 2026-04-22` 在 YAML frontmatter 里记录的是 baseline 创建日期，不是
  prompt 内容日期；iteration 运行时不需要改。
