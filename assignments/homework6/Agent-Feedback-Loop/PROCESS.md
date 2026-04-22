# Agent-Feedback-Loop — Pipeline 规格书

> Project Utopia 的 agent 驱动迭代开发流水线规格。
> 本文件同时是**规格书**（未来每一轮 iteration 的执行指南）和 **Round 0 执行日志**
> （2026-04-22 已完成的第一轮完整 4-stage 流水线）。

---

## 0. 目的与定位

用 LLM agent 替代真人 playtest + 人工 code review 的传统开发循环，搭建一个
**闭环的 review → plan → implement → validate** 流水线。每轮迭代输出：

- 一组独立 reviewer 的 feedback
- 基于 feedback 的修改 plan（由 enhancer 生成）
- 已提交的代码改动
- 验证报告

目标是让项目能够**在少量人工监督下持续自我迭代**，直到 feedback summary 里
没有明显问题为止，再交由人类实际游玩验收。

**不用真人 playtest 的理由**（摘自 a6.md）：
- 领域专家稀缺（RimWorld 深度玩家、独立游戏评论家在班级里几乎没有）
- persona 广度：一次覆盖 10 种玩家类型，真人招募不可能
- 评测密度：agent 单份 review 10 000–25 000 字 vs 真人 15 分钟 0.5 页
- 可重放：prompt 入仓，同一位 reviewer 可以在 Round N 再评一次做纵向对比
- 零社交偏差：agent 给分均值 3.1 / 10，比任何同学都毒辣

---

## 1. 目录结构

```
assignments/homework6/
├── a6.md                               ← 交作业用的简明版
├── Assignment 6_ Feature Complete.md   ← 作业原文
└── Agent-Feedback-Loop/
    ├── PROCESS.md                      ← 本文件
    ├── Reviewers/                      ← N 个 reviewer prompt 常量（身份锚点）
    │   ├── README.md
    │   ├── 01a-onboarding.md
    │   ├── 01b-playability.md
    │   ├── 01c-ui.md
    │   ├── 01d-mechanics-content.md
    │   ├── 01e-innovation.md
    │   ├── 02a-rimworld-veteran.md
    │   ├── 02b-casual.md
    │   ├── 02c-speedrunner.md
    │   ├── 02d-roleplayer.md
    │   └── 02e-indie-critic.md
    ├── Enhancers/                      ← 1 个 enhancer prompt 模板
    │   └── enhancer.md
    ├── Coders/                         ← Coder prompt 模板（implementer + debugger）
    │   ├── implementer.md
    │   └── debugger.md
    ├── Round0/                         ← 第一轮完整 4-stage iteration（Stage A/B/C/D 都跑过）
    │   ├── Feedbacks/                  ← Stage A：10 reviews + 2 summaries
    │   ├── Plans/                      ← Stage B：10 plans + 1 priority-ordered summary
    │   ├── Implementations/            ← Stage C：10 commit logs
    │   └── Validation/                 ← Stage D：test-report.md
    ├── Round1/                         ← 下一轮完整 iteration
    │   ├── Feedbacks/
    │   │   ├── <reviewer-id>.md        ← 每位 reviewer 的原始 feedback
    │   │   └── summary.md              ← feedback 汇总
    │   ├── Plans/
    │   │   ├── <reviewer-id>.md        ← 每份 feedback 对应的 enhancer plan
    │   │   └── summary.md              ← 排序后的纲领性执行总结
    │   ├── Implementations/
    │   │   └── <plan-step>.commit.md   ← 每条 plan 执行后的变更记录
    │   └── Validation/
    │       └── test-report.md          ← debug/test 轮次的最终状态
    └── Round2, Round3, …               ← 继续迭代
```

**命名规则**：
- reviewer id 格式 `<round-prefix><letter>-<name>`，终生不变（跨 round 可追踪）
- 每个 Round 下 `Feedbacks/`、`Plans/` 文件名与 reviewer id 对齐
- `summary.md` 是该阶段的聚合产物，由 summarizer agent 生成

---

## 2. 三类 agent 角色

### 2.1 Reviewer（多个，固定 persona）

**数量**：目前 10 个（5 rubric + 5 persona，详见 `Reviewers/README.md`）。
**prompt**：`Reviewers/<id>.md`，**一次写死，跨所有 round 复用**。
**工具**：仅 Playwright MCP（操纵浏览器）。
**不提供**：源代码、文档、CHANGELOG、他人 review。
**职责**：独立游玩 → 产出一份 Markdown feedback。

### 2.2 Enhancer（单个模板，多实例）

**数量**：prompt 模板 1 份，每轮 per-feedback 起一个 subagent 实例（10 实例/轮）。
**prompt**：`Enhancers/enhancer.md`。
**工具**：Read / Grep / Glob / Playwright MCP / 只读 Bash（可以 `git log`
但不能 `git commit`）。
**提供**：仓库完整代码 + 游戏网页 + 一份 feedback（作为 input）。
**职责**：理解 feedback → 定位代码 → 写详细修改 plan（不改代码）。

### 2.3 Coder（分两个子角色）

**Implementer**：按 `Plans/summary.md` 的排序逐条执行代码修改。
- 工具：Read / Edit / Write / Grep / Glob / Bash
- 每条 plan 执行完**单独 commit**，写到 `Implementations/<step>.commit.md`
- 一次只做一条，做完 commit 再做下一条

**Debugger/Tester**：所有 plan 执行完后运行 `node --test` 和 benchmark，
修复回归，写 `Validation/test-report.md`。
- 工具：Read / Edit / Bash / Playwright
- 直到 `node --test test/*.test.js` 全过、benchmark 通过 CI smoke job

### 2.4 Summarizer（轻量，无独立 prompt 文件）

**职责**：聚合 per-item 文件成 `summary.md`。
**实现**：orchestrator 直接在对话里让 Claude 读所有 per-item 文件后写
summary——不起 subagent，不单独建 prompt 文件。

Stage A summarizer 侧重共识性发现与评分分布；Stage B summarizer 必须
**输出 priority ordering**（P0/P1/P2 按执行顺序排），因为 Coder 会严格照序。

---

## 3. 迭代流程（4 阶段）

```
┌────────────────────────────────────────────────────────────────────┐
│ Iteration N（N ≥ 1，N = 0 是 baseline，不走完整流程）              │
│                                                                    │
│  Stage A: Review    → Feedbacks/{<id>.md, summary.md}              │
│        ↓                                                           │
│  Stage B: Plan      → Plans/{<id>.md, summary.md}                  │
│        ↓                                                           │
│  Stage C: Implement → Implementations/<step>.commit.md             │
│        ↓                                                           │
│  Stage D: Validate  → Validation/test-report.md                    │
│        ↓                                                           │
│  Decision: converged? → stop and hand off to human                 │
│                         else → Iteration N+1                       │
└────────────────────────────────────────────────────────────────────┘
```

### Stage A — Review

**输入**：当前 git HEAD 的 build URL（Vite dev server）。
**执行**：
1. orchestrator 启动 dev server：`npx vite --host 127.0.0.1 --port 5173`
2. **串行**（不并发）为每位 reviewer 起 subagent：
   ```
   for reviewer in Reviewers/*.md (exclude README):
     dispatch subagent with prompt = reviewer + "build URL: http://localhost:5173"
     subagent 产出 RoundN/Feedbacks/<reviewer-id>.md
   ```
3. orchestrator 读取所有 feedback，自己写 `Feedbacks/summary.md`（summarizer 角色）

**为什么串行**：Round 0 并发派遣 5 个 reviewer 共享同一个 dev server，LLM
proxy 被打爆导致所有 agent 都看到 `AI proxy unreachable`，污染观察。
并发收益（墙钟 -80%）不值得这个 confounding。

**输出规范**（每位 reviewer 的 feedback Markdown）：
- YAML frontmatter：`reviewer_id / round / date / build_commit`
- 必须含：整体评分（0-10）、3-5 条 findings、复现步骤、截图引用
- 建议含：与标杆游戏对比、DOM 审计、console 错误节选

### Stage B — Plan

**输入**：`Feedbacks/summary.md` + 所有 per-reviewer feedback + 仓库 HEAD。
**执行**：
1. **并发**为每份 feedback 起一个 enhancer subagent（10 实例）：
   ```
   for feedback in Feedbacks/*.md (exclude summary):
     dispatch enhancer subagent with:
       - enhancer prompt (Enhancers/enhancer.md)
       - feedback content (input)
       - full repo access (Read/Grep/Glob)
       - dev server URL (Playwright 复现)
     subagent 产出 RoundN/Plans/<reviewer-id>.md
   ```
2. orchestrator 读取所有 plan，**排序**成 `Plans/summary.md`：
   - 按 priority（P0 → P1 → P2）
   - 同 priority 内按 scope（小改在前、大改在后）
   - 识别 plan 之间的冲突（两个 enhancer 对同一块代码提了相反方案），
     在 summary 里标注 `CONFLICT:` 并由 orchestrator 给出仲裁

**为什么并发可以**：enhancer 不需要活的 dev server（只读静态 build）。即使
多个 enhancer 同时读代码也没有竞态。

**输出规范**（每个 plan Markdown）：
- YAML frontmatter：`reviewer_id / priority / files_touched / loc_delta / risk`
- 章节：核心问题 / Suggestions / 选定方案 / Plan 步骤清单 / Risks / 验证方式
- plan 步骤必须精确到 `file:line` 和函数名

### Stage C — Implement

**输入**：`Plans/summary.md`（排序后的执行总纲）。
**执行**：**严格串行**一个 Implementer subagent 按序执行。
- 每条 plan 一次 tool session，做完 commit
- commit message 格式：`chore(agent-loop round-N): <plan-id> <one-line summary>`
- commit body 引用 plan 文件
- 每条 commit 后 orchestrator 跑 `node --test` 确认没破坏既有测试

**halt 条件**：若某条 plan 执行后测试红了且 Implementer 在 3 次尝试内没修好，
跳过该条 plan（记录为 `SKIPPED`），继续下一条。所有 `SKIPPED` 的在 Stage D
由 Debugger 重审。

### Stage D — Validate

**输入**：Stage C 的 HEAD。
**执行**：Debugger subagent 循环执行：
1. 跑 `node --test test/*.test.js`
2. 跑 `npm run preview:full` + Playwright smoke（加载网页、3 分钟自动播放、
   无 console error）
3. 跑 `scripts/long-horizon-bench.mjs` 90-day 确认 DevIndex 不回退
4. 修复所有红色测试，直到绿
5. 写 `Validation/test-report.md`（测试通过率、benchmark 数值、回归对比）

**完成标志**：测试全绿 + benchmark 没有严重回退（DevIndex Δ > -5% 算严重）。

---

## 4. 终止条件与人工 gate

### 自动推进条件

- Stage A summary 里 **P0 findings 数量 ≤ 2**（从 Round 0 的 ~10 条降到 ≤ 2）
- 全 reviewer 平均分**从 Round 0 的 3.1/10 升到 ≥ 7.0/10**
- 连续 2 轮 Stage A summary 中**没有新的 P0 问题**出现

### 人工 gate（由我本人介入）

必须人工确认的节点：
1. **每轮 Stage B 结束后**：审 `Plans/summary.md`，否决或调整 enhancer 提出的
   修改方向。agent 经常会把"这个不够好"升级成"推倒重写"，我要拦住。
2. **遇到架构级 plan**（新增 system、删除 system、改变 ECS 顺序）：必须人工
   批准才能进入 Stage C。
3. **连续 5 轮仍未达到终止条件**：人工 retrospect，看是 prompt 不够细
   还是 agent 能力边界。
4. **终止条件达成后**：我本人实际玩游戏 30 分钟，验证 agent 没有**过拟合
   自己的评测标准**（比如为了分数提升把 UI 做成迎合 agent 审美而不是人类
   审美的样子）。

---

## 5. Prompt 设计原则（六条硬约束）

这六条是从 Round 0 踩坑中提炼的，所有 agent prompt 都必须遵守。

### 5.1 时间预算显式划分
subagent 容易把所有 context 花在探索上，最后没写文件。prompt 必须写：
```
留 40% 时间写文件。Write 工具调用必须在结束前完成。
若已经探索 20+ 步但一行评测都没写，立即停止探索开始写。
```

### 5.2 输出路径硬编码
prompt 里直接给绝对路径，不留解释空间：
```
你必须用 Write 工具写到：
RoundN/Feedbacks/<reviewer-id>.md
（N 会在运行时替换为实际数字；<reviewer-id> 与 prompt 文件名同）
```

### 5.3 禁止跨 agent 通信
reviewer 之间、enhancer 之间不能互相读对方的输出。防止"观点趋同 / 回声室"。

### 5.4 YAML frontmatter 强制
每个 agent 产出的第一段必须是 frontmatter。orchestrator 的 summarizer 阶段
全靠解析 frontmatter 做聚合。没有 frontmatter 的产出 = 无法聚合 = 作废重跑。

### 5.5 评分尺度统一
所有 reviewer 都用 0-10 分制，10 分锚定为 "商业可发售"，5 分锚定为
"demo 合格"，1 分锚定为 "不能运行"。避免每位 reviewer 用自己的尺度。

### 5.6 拒绝"综合建议"
reviewer 只报问题、不给方案。enhancer 只写 plan、不改代码。Coder 只改代码、
不评价。**角色边界清晰**——agent 一旦越权会导致整个流水线混乱。

---

## 6. Round 0 执行日志（historical）

### 6.1 时间线

```
T+0:00   启动 Vite dev server
T+0:02   Stage A 并行派遣 5 个 rubric reviewer
T+0:30   Agent 01b, 01d 返回但未写文件（context truncation）
T+0:32   重新派遣 01b, 01d（加 §5.1 时间预算 guardrail）
T+0:55   5 份 rubric review 落盘
T+0:58   orchestrator 合成 Feedbacks/00-summary.md
T+1:10   Stage A 追加派遣 5 个 persona reviewer
T+1:45   5 份 persona review 落盘（无故障）
T+1:50   orchestrator 合成 Feedbacks/player-00-summary.md
T+3:30   从 JSONL 提取 10 份 prompt 到 Reviewers/（prompt 归档补课）
T+4:00   写 PROCESS.md v1
T+4:30   Stage B 并发派遣 10 个 enhancer
T+8:40   10 份 plan 落盘（Round0/Plans/*.md）
T+8:50   orchestrator 合成 Plans/summary.md（priority ordering + 冲突仲裁）
T+9:00   写 Coders/implementer.md + debugger.md 模板
T+9:05   Stage C 开始，**串行**派遣 Implementer subagent 按 Wave 1→4 顺序执行
         Wave 1 (P0)   : 01c-ui → 01d-mechanics-content → 01b-playability
         Wave 2 (P0)   : 02b-casual → 01a-onboarding
         Wave 3 (P1)   : 02a-rimworld-veteran → 02e-indie-critic → 02c-speedrunner
         Wave 4 (P1)   : 01e-innovation → 02d-roleplayer
T+22:30  Stage C 完成：10 份 plan 全部落盘为 11 个 commit（bf24945..eca024f）
         每个 commit 后 orchestrator 跑 `node --test` 确认无回归
T+22:40  Stage D 派遣 Debugger
T+23:40  Debugger 完成：测试 970/972 绿（2 pre-existing skip），
         benchmark 实际改进（+57 days survived @ seed=42 / temperate_plains），
         CHANGELOG 统一追加（commit 3b09065），verdict GREEN
T+23:50  写 Round0/Validation/test-report.md
T+24:00  更新本文件
```

### 6.2 产出

| 类别 | 文件数 | 字节数 |
|------|-------|-------|
| Rubric reviews | 5 | ~82 KB |
| Rubric summary | 1 | ~19 KB |
| Persona reviews | 5 | ~88 KB |
| Persona summary | 1 | ~13 KB |
| Reviewer prompts | 10 + README | ~33 KB |
| Enhancer prompt | 1 | ~6 KB |
| Plans + summary | 11 | ~95 KB |
| Coder prompts | 2 | ~11 KB |
| Implementation logs | 10 | ~45 KB |
| Validation report | 1 | ~8 KB |
| Code commits | 11 | bf24945..3b09065 |
| New test files | 18 | ~3600 LOC |
| Touched production files | ~18（去重） | +2440 / -11 LOC（估算） |
| **Round 0 总计** | **49 artefact files + 11 commits** | **~400 KB docs + ~6000 LOC code** |

### 6.2.1 Stage C commit 链（Round 0）

| commit | plan | 目的 |
|--------|------|-----|
| `bf24945` | 01c-ui | Dev-mode gate 基础设施 + 响应式 statusBar |
| `0a0658e` | 01d-mechanics-content | Dev-telemetry `loading…` 竞态修复 + toast 截断 + HUD rate |
| `568bdb6` | 01b-playability | 建造点击反馈层（飘字 toast + hover 拒绝原因 + menu-phase guard） |
| `bdb874d` | 02b-casual | Casual profile（复用 dev-mode gate） |
| `4693e38` | 01a-onboarding | Help modal + `?`/F1 + 结束面板读阅 gate |
| `d72f53c` | 02a-rimworld-veteran | GameEventBus → DeveloperPanel 管道对接 |
| `69606b1` | 02e-indie-critic | Voice 清理 + scenario headline 常驻 |
| `298406e` | 02c-speedrunner | HUD scoreboard ribbon + FF x4 clamp（严守） |
| `6bdcd80` | 01e-innovation | WORKER_NAME_BANK + storyteller strip + Policy Focus 升级 |
| `383144c` | 02d-roleplayer | Visitor names + death→objectiveLog + EventPanel 扩充 |
| `eca024f` | 02d-roleplayer | log sha followup |
| `3b09065` | validator | CHANGELOG 统一追加 v0.8.x iter-0 条目 |

### 6.2.2 Stage D 验证结果（Round 0）

| 指标 | 数值 | 基线 | Δ | 判定 |
|------|-----:|-----:|--:|:----:|
| `node --test` pass | 970 / 972 (2 pre-existing skips) | 865 (CLAUDE.md 基线) / 882 (Stage C 入场) | +88 / +105 | ✅ |
| `node --test` fail | 0 | 0 | — | ✅ |
| Benchmark max_days_reached | day 90 | day 33 (baseline a8dd845) | +57 天 | ✅ |
| Benchmark DevIndex @ end | 37.77 | 36.68 | +2.96% | ✅ |
| Benchmark survival-score | 20 070 | 7 629 | +163% | ✅ |
| Benchmark deaths | 157 | — | — | ✅ |
| Console errors during smoke | 未执行（留给人工 gate） | — | — | ⚠ |
| **verdict** | **GREEN** | — | — | ✅ |

**关键观察**：10 份 UI polish plan 的 commit 串**意外地改善了决定性 benchmark 的存活
曲线**（+57 天）。原因推测：01c/02b 的 dev-mode gate + casual profile 减少了默认
渲染的 DOM 压力；01b 的 menu-phase guard 使得 menu 态不再推进 metrics.timeSec 从而
不污染 pacing 统计。需要 Round 1 Stage A 的 reviewer 留意是否真的变稳了，还是
统计幸运。

### 6.3 关键 finding（Round 0 summary 摘要）

综合均分 **3.1 / 10**。P0 级问题（≥ 3 位 reviewer 独立发现）：

1. Dev Telemetry / Settings 滑条默认暴露给玩家（**9/10 reviewer** 命中）
2. 无 tooltip（4/10）
3. 点击地图无反馈、错误提示稍纵即逝（4/10）
4. 点 worker 看到 FSM 调试输出而非玩家面板（3/10）
5. Heat Lens 按钮点了无可见变化（3/10）
6. 零音效（DOM 审计确认 `<audio>` 数 = 0）
7. Settings 滑条会静默重置世界
8. Survival score 公式奖励"不操作"
9. LLM AI pillar 默认不工作（`/health` 500）
10. 响应式布局 1280 以下崩坏

### 6.4 Round 0 的故障与修复

- **Stage A · Context truncation（2 次）**：agent 01b, 01d 探索过长未写文件 → 在
  prompt 里强制时间预算 → 修复。写入 §5.1。
- **Stage A · 并发污染**：5 个 agent 共享 dev server 打爆 LLM proxy → 后续改串行。
  写入 Stage A 说明。
- **Stage A · Prompt 未归档**：评测完成后才意识到 prompt 没入仓，从 JSONL 回溯提取。
  写入 §5.2 / §5.4 作为前置要求。
- **Stage B · Playwright 证据不足**：10 份 plan 中 6 份标 `UNREPRODUCIBLE` 或跳过
  Playwright（时间预算分配问题）。Round 1 enhancer prompt 应加硬约束"至少 1 个
  Playwright selector 证据"。
- **Stage B · P2 分类缺席**：全部 plan 被判 P0/P1，没有 P2。enhancer prompt 应
  引入"次轮候选"类别防止所有修复都挤进首轮。
- **Stage C · commit sha 未落 frontmatter**：02d-roleplayer 的 commit log 首次
  写入时忘了记录 HEAD sha，需要 followup commit (`eca024f`) 修。Round 1 应在
  Implementer prompt 里显式要求 "commit 后重新打开 commit log 填 head_commit"。
- **Stage C · CHANGELOG.md 分散更新的陷阱**：原 CLAUDE.md 约定"每 commit 都更新
  CHANGELOG"在 agent 管线里会造成 10 次独立修改冲突。本轮改为 Implementer
  跳过、Validator 统一追加一条 → 写入 Implementer 模板。
- **Stage D · benchmark 基线语义澄清**：`DevIndex ≥ 41.8` floor 是按 v0.8.1
  day-365 基线 44 × 95% 设定的；但 90-day deterministic 跑 seed=42/temperate
  基线本就不到 44（37.77），因此应按 **day 数匹配** 的基线比较，不是盲比
  数值。Round 1 Debugger prompt 应给出 "按 day N 的 baseline 对比" 脚本。
- **Stage D · 截图工件污染**：Round 0 Stage A 的 Playwright 评测在仓库根遗留
  ~220 个 PNG/JPEG。Implementer / Debugger 都必须用精确 `git add <path>` 而
  非 `-A`。需加入 `.gitignore` 或移到 `Round0/screenshots/` 子目录（下轮
  orchestrator 的清理任务）。

---

## 7. 成本估算

### 单轮成本（Round N，N ≥ 1）

| Stage | Subagent 数 | 单个耗时 | 单个 token 成本估算 |
|-------|-----------|---------|--------------------|
| A Review | 10（串行） | ~1h | $5–8 |
| B Plan | 10（并发） | ~30min | $3–5 |
| C Implement | 1（长任务） | ~2h | $10–15 |
| D Validate | 1 | ~30min | $3–5 |
| **单轮总计** | — | **~8-10h 墙钟** | **$100–150** |

### 5 轮到收敛预期

- 墙钟：~50h（约 1 个工作周 allocate 一半时间）
- 金钱：$500–750
- 人工时间：每轮 ~30min gate review，共 ~2.5h

### 什么时候值

- 游戏复杂度足够高（手动 playtest 单轮 > 2h）
- 有明确可量化的回归 metric（DevIndex、测试通过率）
- 项目处于"已有可玩但体验差"阶段（Round 0 场景）

什么时候不值：
- 游戏还没有可玩 loop → 直接手写代码快
- 已经接近发售 → 细节打磨需要人类审美，agent 会过拟合 metric

---

## 8. 与 a6.md 的职责分工

| 文件 | 受众 | 内容 |
|------|-----|------|
| `a6.md` | 助教 | 作业合规的简明报告：方法论披露 + Round 0 评分表 + 10 action items |
| `PROCESS.md`（本文件）| 我本人 & 未来迭代 | 流水线规格 + Round 0 完整日志 + prompt 设计原则 |

a6.md 只在 User Study 段落末尾引用本文件路径，不复制内容。

---

## 9. 附录

### 9.1 从 JSONL 提取 prompt 的脚本

```javascript
const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(JSONL_PATH, 'utf8').split('\n').filter(Boolean);
for (const line of lines) {
  let msg; try { msg = JSON.parse(line); } catch { continue; }
  const content = msg.message?.content;
  if (!Array.isArray(content)) continue;
  for (const c of content) {
    if (c.type !== 'tool_use' || c.name !== 'Agent') continue;
    const desc = c.input?.description;
    const prompt = c.input?.prompt;
    // 按 desc 映射到 reviewer_id，写到 Reviewers/<id>.md
  }
}
```

### 9.2 Claude Code 会话 JSONL 位置

```
C:\Users\dzdon\.claude\projects\c--Users-dzdon-CodesOther-Project-Utopia\
  <session-id>.jsonl
```

每个会话一个文件，包含所有 Agent tool call 的完整 input / output。是
Round 0 重建唯一可信源。

### 9.3 Round 0 会话 ID

`945ccbad-5fdd-453e-b64f-c3950c3b89cc`

### 9.4 未来可能的演化

- 把 reviewer 从 10 扩到 20（加 accessibility、mobile、low-end hardware 三类）
- 引入 "Red Team" reviewer：专门尝试找 exploit 和 cheese strategy
- Stage B 加一层 "plan debate" — 让 2 个 enhancer 对同一 feedback 各写一版
  plan，第 3 个 enhancer 做仲裁
- Stage D 接 CI：用 GitHub Action 自动拉起全流水线而不是在本地
- 每轮产出一份 "delta report"，量化对比 Round N vs Round N-1 的改进
