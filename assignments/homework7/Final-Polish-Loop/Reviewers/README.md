# Reviewer Prompts — Final Polish Loop

> 这 10 份 prompt 对应 HW7 终交付阶段的 10 个 reviewer 身份。
>
> 与 HW6 的 reviewer 身份**完全独立**：HW7 不再评估"游戏好不好玩"，而是评估"这个 build 能不能作为终交付"。

---

## 1. Reviewer 清单与三层访问层级

### Tier A — 黑盒盲审（7 位）

仅浏览器 build。严禁读源码、文档、CHANGELOG、HW6 历史、其他 reviewer 输出、上一轮分数。

| ID | 视角 |
|----|------|
| `A1-stability-hunter` | 崩溃 / console error / unhandled rejection |
| `A2-performance-auditor` | A2 FPS 目标 + 长程内存泄漏 |
| `A3-first-impression` | 全新玩家前 3 分钟体验 |
| `A4-polish-aesthetic` | 视觉 / 音频 / 动效 polish |
| `A5-balance-critic` | 资源曲线 / 难度曲线 / 策略深度 |
| `A6-ui-design` | 视觉层级 / 排版 / 信息密度 / 控件 bug |
| `A7-rationality-audit` | 残留死设计 / 表述不清 / 隐藏状态 |

### Tier B — 半盲（2 位）

浏览器 + 各自 prompt frontmatter 中 `read_allowlist` 明确列出的若干文件。**禁止 Read 任何 `src/` 或 `test/` 文件。**

| ID | 可读 | 用途 |
|----|------|------|
| `B1-action-items-auditor` | HW6 末轮 `Validation/test-report.md` + `Feedbacks/summary.md` | 逐项核对 HW6 用户研究 action items 闭环 |
| `B2-submission-deliverables` | 仓库 `README.md` + `assignments/homework7/*.md` + `CHANGELOG.md` | HW7 提交清单核对 |

### Tier C — 白盒架构审计（1 位）

| ID | 可读 | 用途 |
|----|------|------|
| `C1-code-architect` | 全部代码 + `docs/systems/*` + git 历史 | 每轮重盘所有系统的架构整洁度 |

---

## 2. Blind Review Contract（仅 Tier A）

### Tier A reviewer 允许接收的运行时上下文

- `build_url`
- `output_path`
- `screenshot_dir`
- `date`
- 仅 A2 额外接收 `target_fps_p50` 与 `target_fps_p5`（来自 A2 spec，不暴露 spec 文件路径）
- browser-only / write-before-budget / tool budget 之类的执行护栏

### Tier A reviewer 禁止接收的运行时上下文

- 源代码、仓库文档、CHANGELOG、PROCESS、README 摘要
- `docs/systems/*` 任何节选
- HW6 目录任何节选
- git diff / git log / commit message
- 上一轮 feedback / plans / validation summary
- 上一轮 reviewer 分数
- "这轮修了什么"
- "作者声称做了哪些提升"
- benchmark 历史或 delta
- 任何会诱导 reviewer 预设"这版应该更好"的背景信息

### 原则

Tier A 评分只能来自：

- 当前浏览器 build
- 当前实际交互体验
- 当前屏幕上看得到 / 听得到 / 量得到的东西

跨轮比较应在 Stage A 结束后由 orchestrator 或人工完成，**不能在 reviewer runtime context 内完成**。

---

## 3. Tier B 访问规则

每位 B 层 reviewer 的 prompt frontmatter **必须**含 `read_allowlist:` 列表。

执行规则：

1. reviewer 只能 Read 列表内**精确匹配**的路径。
2. Glob / Grep 必须限定在 allowlist 路径范围内。
3. 越界读取 = 该份 feedback 作废，orchestrator 重启。
4. 即便 allowlist 内文件提到了 allowlist 外的内容，reviewer **不得追读**那个外部内容。

---

## 4. Tier C 访问规则

C1 反向 —— **必须读全**：

- `src/config/constants.js`（取 `SYSTEM_ORDER`）
- `docs/systems/*.md`（全部 8 个）
- `src/simulation/**/*.js`（glob 全枚举，对照 docs/systems 找出**新增 / 删除**的系统）
- 关键架构示例：`src/simulation/ai/` 下的 worker AI 流水线（黄金范例）
- 上一轮 `RoundN-1/Feedbacks/C1-code-architect.md`（用于 delta 对比）

C1 **不进行游玩**，纯静态审计。允许调用 `git log` / `git blame` / `git diff` 但禁止 commit。

---

## 5. 如何用于 pipeline

```text
for round in 0..N:
  build = deploy_current_git_head()
  start_dev_server()  # npx vite, ready before any reviewer

  # Stage A — 浏览器型 reviewer 严格串行
  # （2026-05-01 实测：Playwright 全局 (current) tab race 无法靠协议规避；详见 PROCESS.md §5）
  for reviewer in [A1, A2, A3, A4, A5, A6, A7, B1, B2]:
    dispatch_and_await(reviewer, runtime_ctx={build_url, output_path, screenshot_dir, date, ...})

  # C1 不浏览器，可与上面任一时机并行
  dispatch(C1, runtime_ctx={..., prior_round_feedback})

  aggregate -> Feedbacks/summary.md

  # Stage B — enhancer 并行（浏览器使用轻量；如观察到 race 再降级串行）
  parallel for feedback in Feedbacks/*.md:
    enhancer(feedback) -> Plans/<reviewer-id>.md
  Plans/summary.md (orchestrator 仲裁 conflict / redundancy)

  # Stage C — implementer 同 wave 内串行
  for plan in Plans/summary.md.accepted (按 wave):
    implementer(plan) -> commit + Implementations/<reviewer-id>.commit.md

  # Stage D — 单 agent
  validator() -> Validation/test-report.md  # test / prod build / FPS / freeze-diff / bundle 五道 gate
```

---

## 6. Prompt 维护原则

- reviewer 身份锚点应保持稳定
- 允许补充执行安全护栏
- Tier A：不允许把"上一轮信息"写入 prompt 或 runtime context
- Tier B：read_allowlist 修改必须在 PROCESS-LOG.md 留痕
- Tier C：每轮**必须重盘所有系统**，不允许缓存上一轮的 system inventory

---

## 7. 启动每一轮前的前置检查

启动 RoundN 前确认：

- [ ] `npx vite` dev server 已就绪（`curl localhost:5173` 返回 200）
- [ ] Tier A reviewer prompt + runtime context 没有 delta / previous_score / fixed_items / HW6 节选
- [ ] Tier B reviewer 的 `read_allowlist` 与 prompt frontmatter 一致
- [ ] C1 已挂载上一轮 inventory 路径用于 delta 对比
- [ ] A2 的 `target_fps_p50` / `target_fps_p5` 已从 A2 spec 注入

任一项不满足，不应启动该轮。
