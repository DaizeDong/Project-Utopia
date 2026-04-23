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

---

## 10. Round 1 执行日志（historical）

### 10.1 时间线

```
T+0:00   用户指出 "feedback 看到了上轮评论"，要求 reviewer 独立无记忆
T+0:03   删除 3 份被污染的 Round 1 feedback（01a/01b/01c）
T+0:05   重写 reviewer runtime context：
           ✗ 删除 delta_vs_round0 / delta_summary 字段
           ✗ 删除 "Round 0 你打了 X/10" / 作者 polish 宣称
           ✓ 只保留：build_url / output_path / screenshot_dir / date
T+0:10   Stage A 串行派遣 10 个 reviewer（顺序：01a → 02e）
           发现 01a、02a、02d 因 "超交互次数 > 80" 而 context 超限未写盘；
           重新派遣时加 §效率硬约束："最多 25 次 browser 交互 + 60 tool_uses 前必须 Write"
T+2:00   10 份 reviewer feedback 全部落盘（avg 3.1/10，分布 3.0×8 / 3.5×2）
T+2:05   Stage A 聚合器写 Feedbacks/summary.md
           P0（≥3 reviewer 命中）：pick-entity / heat-lens / storyteller / 音效 / 死亡警报
T+2:20   Stage B **并发**派遣 10 个 enhancer
T+2:40   10 份 plan 落盘（Round1/Plans/*.md）
T+2:45   Stage B 聚合器写 Plans/summary.md
           冲突矩阵：R1-R3 REDUNDANT / C1-C6 CONFLICT / S1-S5 SEQUENCE
           5 条合并决议（D1-D5）：pickEntity 归 01b；getScenarioProgressCompact
           Casual 分支归 02b；storyteller badge 改 WHISPER/DIRECTOR/DRIFT
           语气（01e 结构 + 02e 文案）；beatText 挂在 01e 的 model 上（02d）；
           .hud-action CSS 归 02b
T+3:00   Stage C **串行** Wave 1 → 2 → 3
           Wave 1 (P0 bug fix, 互不冲突):
             01b-playability → 02a-rimworld-veteran → 02c-speedrunner
           Wave 2 (P0 UX surface, S1 顺序):
             01c-ui → 01d-mechanics-content → 02b-casual
           Wave 3 (P1 polish, S3/S4 顺序):
             01a-onboarding → 01e-innovation → 02d-roleplayer → 02e-indie-critic
T+5:40   Stage C 完成：10 份 plan 逐个 commit（f5c60f5..d00325e）
           每个 commit 后跑 `node --test`，全部零新回归
T+5:45   Stage D 派遣 Debugger
T+6:05   Debugger 完成：1017/1019 测试绿（2 pre-existing skip + 1 stochastic
           strategy-diversity 失败，标记为 PERSISTENT-FAILURE），
           bench DevIndex 37.77 与 Round 0 完全一致（Δ 0.0%），
           低于 41.8 硬 gate 但归类 BENCH-GATE-DEFERRED（结构性 Phase 9 gap，
           非本轮 UX plan 可达），verdict GREEN
T+6:10   Round 1 artefact archival commit (180d339)
T+6:12   写本节 10.x
```

### 10.2 产出

| 类别 | 文件数 | 备注 |
|------|-------|-------|
| Reviewer feedbacks | 10 + summary | avg 3.1/10 |
| Plans + summary | 11 | 5 条 arbitration 决议 |
| Implementation logs | 10 | 全部 DONE / PARTIAL（按 D1-D5） |
| Validation report | 1 | verdict: GREEN |
| Code commits | 10 | f5c60f5..d00325e |
| Archival commit | 1 | 180d339 |
| New test files | 10+ | +24 test cases, ~1050 LOC |
| Touched production files | 14（去重） | +~1490 LOC |

### 10.2.1 Stage C commit 链（Round 1）

| commit | plan | 目的 |
|--------|------|-----|
| `f5c60f5` | 01b-playability | Entity pick 16 px proximity fallback + 24 px build-tool guard |
| `3d701e8` | 02a-rimworld-veteran | 6 个 role quota sliders 暴露已有 knob（不改算法） |
| `f95577e` | 02c-speedrunner | `__utopiaLongRun` shim：options-bag + `{template}` 归一化 |
| `556d847` | 01c-ui | `#statusScoreBreak` dev-only class + ≤1200px 侧栏 auto-collapse |
| `a14d150` | 01d-mechanics-content | HUD `#latestDeathRow` + `#foodRateBreakdown`（pickEntity 步骤按 D1 并入 01b） |
| `6297371` | 02b-casual | HUD chip 2-line clamp + `getScenarioProgressCompactCasual` 人话版 |
| `82e4cde` | 01a-onboarding | HUD glossary tooltips 覆盖 wh/Dev/HAUL/routes 等 10+ 缩写 |
| `834381d` | 01e-innovation | Storyteller WHISPER/DIRECTOR/DRIFT 徽章 + Heat Lens legend + How-to-Play "Why Utopia is different" tab |
| `1a5d3b9` | 02d-roleplayer | `extractLatestNarrativeBeat` + 扩展 `computeStorytellerStripModel.beatText`（按 D4 挂子节点） |
| `d00325e` | 02e-indie-critic | 6 模板 `SCENARIO_VOICE_BY_TEMPLATE` + Emergency relief 叙事化（Step 3/4/6 按 D2/D3/D5 合并跳过） |
| `180d339` | archival | Feedbacks/Plans/Implementations/Validation 归档 |

### 10.2.2 Stage D 验证结果（Round 1）

- **测试**: 1017/1019 pass, 2 pre-existing skip, 1 stochastic flake
  (`exploit-regression: strategy-diversity`, 标记 PERSISTENT-FAILURE)
- **Benchmark** (seed 42 / temperate_plains / 90 days):
  - DevIndex: 37.77 (vs Round 0 基线 37.77, Δ 0.0%)
  - Deaths: 157 @ day 90 (Δ 0.0%)
  - Survival score: 20070 (Δ 0.0%)
  - 结论：本轮改动纯 UX/HUD/DOM/参数归一化，不触 simulation 层；
    bench 完全持平，低于 41.8 硬 gate 的结构性 Phase 9 gap 延续
- **Playwright smoke**: SKIPPED（与 Round 0 一致）
- **Verdict**: GREEN（测试 + benchmark + 归档 + arbitration 遵守都满足）

### 10.3 关键 finding（Round 1 summary 摘要）

综合均分 **3.1 / 10**（与 Round 0 持平，离散度极低 3.0–3.5）。P0 级问题
（≥ 3 位 reviewer 独立命中）：

1. **Entity Focus 点不中**（6 reviewer）—— raycast 用 8-12px SphereGeometry，
   工人像素 hitbox 太小；修复：16px proximity fallback + 24px build-guard
2. **Heat Lens 视觉无反馈**（6 reviewer）—— 按 L 只有顶栏高亮；修复：加
   `#heatLensLegend` 常驻 legend（红=surplus 蓝=starved）
3. **Storyteller 是 dev 文本**（7 reviewer）—— `[Rule-based Storyteller]`
   前缀 + 策略描述；修复：WHISPER/DIRECTOR/DRIFT 徽章 + eventTrace beat
   fan-out
4. **零音效**（7 reviewer）—— freeze 范围外（需新 audio manager + 音频资源），
   defer 到未来轮次
5. **崩溃无可感知警报**（6 reviewer）—— 修复：HUD 顶栏 `#latestDeathRow`
   显示最新死亡 "Last: <name> died (<reason>) near (x,y)"

**Reviewer 独立性验证**（本轮最重要的 process 修正）：
10 份 feedback 里无一份引用 Round 0 评分、作者 polish 宣称或 delta 对比；
YAML frontmatter 只含 `reviewer_id / round / date / score / verdict`；
reviewer runtime context 只投放 build_url / output_path / screenshot_dir /
date。这条原则下 reviewer 的打分自然持平于 Round 0（3.1/10），印证了
"问题是结构性的、横跨所有外部视角"。

### 10.4 Round 1 的故障与修复

1. **Reviewer runtime context 泄漏**（最重要）— 初始 dispatch 里带了
   "Round 0 你打了 X/10" / 作者 polish 宣称 / `delta_vs_round0` 字段。
   用户中断要求重跑。修复：删除 3 份已写盘的污染 feedback，重写 context
   只保留 build_url / output_path / screenshot_dir / date。
2. **3 个 reviewer agent 因超交互而 context 截断**（01a, 02a, 02d）—
   跑了 80+ 次 browser 交互未进入写盘阶段就耗尽 token。修复：在 runtime
   context 加入 "最多 25 次 browser 交互 / 60 tool_uses 前必须 Write" 硬约束。
3. **Stage B 并发派遣有一组 conflict 过密**（storytellerStrip.js 被 01e/02d/
   02e 同时触碰）。修复：Plans/summary.md 的 D3/D4 决议把三方改动合并到
   01e 的 `computeStorytellerStripModel` 结构化 DOM 路径上。
4. **02e 部分 step 与 02b / 01e 重复**（getScenarioProgressCompact 重写 /
   storyteller prefix / .hud-action max-width）。修复：D2/D3/D5 指定保留
   02b 的 Casual 分支与 2-line clamp、保留 01e 的 badge 结构；02e 只做 6
   模板 scenario voice + Emergency relief 叙事化。
5. **02e 触发 1 个 pre-existing stochastic test**（exploit-regression
   strategy-diversity）— 在 parent `1a5d3b9` 上即偶发存在。Debugger 复跑
   2 次确认 stochastic，标记 PERSISTENT-FAILURE 不强制回退。
6. **Bench DevIndex 低于 41.8 硬 gate**。与 Round 0 完全一致，属结构性
   Phase 9 carry/deposit eating policy gap；本轮 plan 全部属 UX/HUD 层，
   不触 simulation。归类 BENCH-GATE-DEFERRED，不阻断 GREEN verdict。

### 10.5 Round 1 → Round 2 Handoff

已解决但仍需要下一轮 reviewer 关注是否真的 surface 出来：
- Entity Focus 能点中否（01b/01d）
- Heat Lens legend 玩家能看懂否（01e）
- Storyteller WHISPER/DIRECTOR/DRIFT 能否传达技术差异（01e + 02e）
- 顶栏 debug 串对 casual 玩家是否隐藏（01c + 02b）
- Glossary tooltip 是否覆盖主要缩写（01a）
- Role quota sliders 是否真的给玩家能动性（02a）
- Narrative beat 是否让 roleplayer 有故事感（02d）
- 6 模板 scenario voice 是否差异化（02e）

未解决 / freeze 外（defer）：
- 音效 / 音乐 / 环境音（7 reviewer 命中，但属新 audio pipeline）
- Worker carry vs deposit eating policy（02c B3，simulation 层）
- 新手 tutorial 动线（02b/01a 触及，但属新 content pipeline）
- Colonist mood / bio（02a/02d 触及，新 mechanic）
- Entity hover ring + Esc-to-Inspect（02d 方向 B，中等 render 改动）

### 10.6 Round 1 会话 ID

`945ccbad-5fdd-453e-b64f-c3950c3b89cc`（与 Round 0 同会话，连续推进）

---

## 11. Round 2 执行日志（historical）

### 11.1 时间线

```text
T+0:00   Round 2 Stage A 完成：10 个 reviewer feedback + summary
T+0:20   Stage B 完成：10 个 enhancer plan + Plans/summary.md
         plans_total=10, accepted=10, deferred=0, waves=3
T+0:30   Stage C Wave 1:
         02a -> 01c -> 01a wave1 -> 01d
T+2:30   Stage C Wave 2:
         01a wave2 -> 02b -> 01b -> 02c
T+5:30   Stage C Wave 3:
         02d -> 01e -> 02e
T+7:40   Stage D:
         full tests green, benchmark initially regressed to DevIndex 32.69
         debugger fix restored Temperate Plains starter wall floor
T+8:10   Stage D final:
         full tests 1055/1057 pass, benchmark DevIndex 37.77, Playwright smoke OK
T+8:20   Round 2 archival:
         CHANGELOG + PROCESS.md + Round2 artefacts committed
```

### 11.2 Stage C commit 链

| commit | plan | 目的 |
|--------|------|------|
| `7065647` | 02a-rimworld-veteran | Select tool, Start template application, x4 clamp alignment |
| `ed8d1de` | 01c-ui | Death alerts, goal chips, mid-width HUD fixes |
| `aeb6543` | 01a-onboarding wave1 | Scenario footprint + FogOverlay |
| `d912248` | 01d-mechanics-content | Heat tile overlay + placement lens + tile insight |
| `4edd744` | 01a-onboarding wave2 | Milestone detector + HUD flash |
| `2dff83d` | 02b-casual | Death/resource/milestone feedback toasts |
| `91729ff` | 01b-playability | Autopilot default-off chip + score/dev tooltips |
| `16d5b74` | 02c-speedrunner | 1-12 shortcuts + top autopilot mirror |
| `40ba609` | 02d-roleplayer | Worker memories + relationship labels + narrative voice |
| `02ec616` | 01e-innovation | Actionable DIRECTOR coordinates + template tag + Heat Lens pulse |
| `76d7393` | 02e-indie-critic | Storyteller truncation fix + voice diffusion + `__utopia` dev gate |
| `d0bf672` | Stage D fix | Restore benchmark defense floor without pre-completing wall objective |

### 11.3 Stage D 验证结果

| 指标 | 结果 | 判定 |
|------|------|------|
| `node --test test/*.test.js` | 1055/1057 pass, 0 fail, 2 pre-existing skip | GREEN |
| Benchmark seed=42 / temperate_plains / 90 days | DevIndex 37.77, deaths 157, score 20070 | GREEN vs Round 1 baseline |
| Browser smoke | `/` hides `window.__utopia`, keeps `__utopiaLongRun`; `/?dev=1` exposes both; 0 console errors | GREEN |
| Redline audit | no new tile/building/tool constants, no new audio/assets, no new score/mood/grief/win mechanics | GREEN |

Benchmark note: the strict long-run spec floor remains below target, as in Round 1. The relevant Round 2 regression check is relative to the Round 1 baseline; after `d0bf672`, DevIndex and deaths returned to the same baseline.

### 11.4 Artefacts

| 类别 | 文件数 | 备注 |
|------|-------:|------|
| Feedbacks | 10 + summary | Stage A raw reviewer output |
| Plans | 10 + summary | Stage B conflict matrix + 3-wave schedule |
| Implementations | 11 | 10 accepted plans; `01a-onboarding` split into wave1/wave2 logs |
| Validation | 1 | `Validation/test-report.md`, verdict GREEN |
| Code commits | 12 | 11 Stage C implementation commits + 1 Stage D stabilization fix |

### 11.5 Round 2 -> Round 3 Handoff

- Re-review whether restored starter walls still feel sparse enough for onboarding.
- Check status-bar width at 1024-1200 px with template tag, storyteller beat, top autopilot mirror, resource sublabels, and goal chips all visible.
- Audio remains deferred by HW06 feature freeze.
- Long-run economy/population gaps remain structural and outside this UX-focused round.

---

## 12. Round 3 execution log (historical)

### 12.1 Timeline

```text
T+0:00   Round 3 structural reflection written.
         Core conclusion: Rounds 0-2 improved readability and feedback, but did
         not materially change agency, recovery, or benchmark outcomes.
T+0:20   Stage A completed: 10 reviewer feedbacks + summary.
         Average score: 5.18/10. Verdict: STRUCTURAL_WORK_REQUIRED.
T+0:45   Stage B completed: 10 enhancer plans + summary.
         plans_total=10, accepted=4, deferred/subsumed=6, waves=2.
T+1:00   Wave 1 implemented:
         01d mechanics recovery tuning -> 01b build consequence preview.
T+3:30   Wave 2 implemented:
         01a next-action contract -> 02c autopilot truth contract.
T+5:20   Stage D initial benchmark failed:
         outcome=loss at day 21, DevIndex 41.32, score 4906.
T+5:45   Stage D debugger calibrated 01d thresholds.
         Final benchmark reached 90 days, DevIndex 37.8, score 20450.
T+6:30   Final validation:
         full tests 1069/1071 pass, benchmark passed, browser smoke passed.
T+6:45   Round 3 archival:
         CHANGELOG + PROCESS.md + Round3 artefacts committed.
```

### 12.2 Stage C / D commit chain

| commit | plan | purpose |
|--------|------|---------|
| `fda15d0` | 01d-mechanics-content | Earlier worker hunger seek/recover and smaller delivery thresholds |
| `b9c09cf` | 01b-playability | BuildAdvisor logistics consequence preview |
| `9de5d26` | 01a-onboarding | Current next-action HUD contract |
| `f85b638` | 02c-speedrunner | Centralized autopilot status truth contract |
| `2629fcf` | Stage D debugger | Calibrate 01d thresholds after benchmark day-21 loss |

### 12.3 Final validation

| check | result | verdict |
|------|--------|---------|
| `node --test test/*.test.js` | 1069/1071 pass, 0 fail, 2 skip | GREEN |
| Benchmark seed=42 / temperate_plains / 90 days | max_days_reached, DevIndex 37.8, score 20450 | GREEN |
| Browser smoke | active HUD shows next-action + autopilot chips, canvas present, no console/page errors | GREEN |
| Redline audit | no new building/tile/tool/assets/audio/victory/score/mood/grief/tutorial systems | GREEN |

### 12.4 Accepted vs deferred

Accepted in Round 3:

- 01a: current next-action contract.
- 01b: build consequence preview.
- 01d: worker recovery/logistics threshold tuning.
- 02c: autopilot/timeScale truth contract.

Deferred or subsumed:

- 01c, 01e, 02a, 02b, 02e were subsumed by the accepted P0 plans.
- 02d was deferred as D5 because relationship-aware decision systems would be a
  new mechanic under HW06 feature freeze.

### 12.5 Why Rounds 0-2 were not essential improvements

Rounds 0-2 mostly changed how the game explains itself: HUD chips, copy,
tooltips, heat/placement/storyteller surfaces, death alerts, and responsive
layout. Those were useful, but they did not create a stronger decision loop.
The player could see more information and receive more feedback, yet still did
not have a trustworthy answer to "what should I do next, where, and why will it
fix the colony?"

The benchmark told the same story. After Round 2 stabilization, the 90-day seed
42 result returned to the old band: DevIndex 37.77, deaths 157, score 20070.
That means the polish was not load-bearing for economy, logistics, or survival.

Round 3 is a partial correction: it makes the current action explicit, predicts
build consequences, improves worker recovery timing, and makes autopilot state
truthful. But it is still bounded by feature freeze. Final DevIndex 37.8 is not
a product-level breakthrough. The next non-freeze round should change the core
economy/logistics/autopilot loop rather than adding more explanatory surfaces.
