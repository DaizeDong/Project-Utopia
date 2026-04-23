# Reviewer Prompts

> 这 10 份 prompt 对应 10 个固定 reviewer 身份。
>
> 身份核心来自 2026-04-22 的 baseline，会跨轮复用；但安全护栏可以更新。
> Round 3 已确认：**不能把仓库、历史轮次、上一轮评分或改进摘要暴露给 reviewer**。

---

## 1. Reviewer 清单

### Rubric 视角

| ID | 维度 |
|----|------|
| `01a-onboarding` | 引导性 |
| `01b-playability` | 可玩性 |
| `01c-ui` | UI 呈现 |
| `01d-mechanics-content` | 机制与内容 |
| `01e-innovation` | 创新性 |

### Persona 视角

| ID | Persona |
|----|---------|
| `02a-rimworld-veteran` | RimWorld / DF / ONI 老兵 |
| `02b-casual` | 休闲玩家 |
| `02c-speedrunner` | 速通 / 最优化玩家 |
| `02d-roleplayer` | 叙事 / 角色扮演玩家 |
| `02e-indie-critic` | 独立游戏评论者 |

---

## 2. Blind Review Contract

Round 4 起，这一条必须严格执行。

### reviewer 允许接收的运行时上下文

- `build_url`
- `output_path`
- `screenshot_dir`
- `date`
- browser-only / write-before-budget / tool budget 之类的执行护栏

### reviewer 禁止接收的运行时上下文

- 源代码、仓库文档、CHANGELOG、PROCESS、README 摘要
- git diff / git log / commit message
- 上一轮 feedback / plans / validation summary
- 上一轮 reviewer 分数
- “这轮修了什么”
- “作者声称做了哪些提升”
- benchmark 历史或 delta
- 任何会诱导 reviewer 预设“这版应该更好”的背景信息

### 原则

reviewer 的评分只能来自：

- 当前浏览器 build
- 当前实际交互体验
- 当前屏幕上看得到的东西

跨轮比较应在 Stage A 结束后由 orchestrator 或人工完成，**不能在 reviewer runtime context 内完成**。

---

## 3. 如何用于 pipeline

推荐流程：

```text
for round in 1..N:
  build = deploy_current_git_head()
  for reviewer in Reviewers/*.md:
    dispatch reviewer with:
      - base_prompt = reviewer
      - build_url
      - output_path
      - screenshot_dir
      - date
      - tool/write guardrails
  aggregate feedbacks
  plan
  implement
  validate
```

不要再使用这样的注入：

```text
delta_since_last_round
context update since last round
previous_score
known improvements
```

这些信息会污染 reviewer，降低评测可信度。

---

## 4. Prompt 维护原则

- reviewer 身份锚点应保持稳定
- 允许补充执行安全护栏
- 不允许把“上一轮信息”写入 reviewer prompt 或 runtime context
- 不允许为了提分而在 reviewer prompt 中暗示“这轮重点看哪些已修复项”

---

## 5. Round 4 前置检查

启动 Round 4 前，至少确认：

- [ ] reviewer prompt 中明确写了 blind review 要求
- [ ] orchestration runtime context 没有 delta / previous_score / fixed_items
- [ ] reviewer 只能使用浏览器
- [ ] 输出路径与写盘约束明确

任一项不满足，都不应启动 Round 4。
