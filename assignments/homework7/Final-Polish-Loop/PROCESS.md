# Final-Polish-Loop — 全局规则（HW7 终交付阶段）

> 闭环迭代流水线：`review → plan → implement → validate`
>
> 每轮历史日志见 `PROCESS-LOG.md`。
>
> **本目录仅用于 Assignment 7（Buffer Phase + Final Submission）**。
> 与 HW6 的 `Agent-Feedback-Loop` 完全独立 —— reviewer 名单、freeze 边界、停止条件全部不同。

---

## 1. 目标

HW6 已经 feature-freeze。HW7 是**终交付阶段**：

> 把当前 build **磨成一个能交付的成品** —— 稳定、达到 FPS 目标、闭合 HW6 用户研究 action items、文档与视频齐全、代码架构整洁可解释。

> ⚠️ **不为提分而打磨表象**。每一轮迭代要让"实际产物"更好，而不是让 reviewer "听说改了什么"后给更高分。

---

## 2. 三层访问层级（与 HW6 最大区别）

HW6 仅有"全员 blind"一种 reviewer。HW7 引入**三层访问层级**：

| Tier | 访问范围 | Reviewer 数 | 用途 |
|------|----------|-------------|------|
| **A 黑盒** | 仅浏览器 build；不读源码、不读文档、不读 HW6 历史 | 7 | 评估"陌生玩家"视角下的交付质量 |
| **B 半盲** | 浏览器 + **限定文档**（每位 reviewer 个体声明可读路径） | 2 | 验证"作业要求"层面的闭环（HW6 闭环 / 提交清单） |
| **C 白盒** | 全代码 + 全文档 + 全 git 历史 | 1 | 架构整洁度审计（不可能黑盒得到的判断） |

每位 reviewer 的 prompt **顶部 frontmatter 明确写出 `tier: A | B | C` 与 `read_allowlist`**。Orchestrator 在派遣前用此校验运行时上下文，不允许把 A 级 reviewer 升权到 B/C。

---

## 3. 角色职责

### Reviewer

#### Tier A（A1-A7）严格盲审

**只能访问**：浏览器构建 URL、自己的输出路径、截图目录、当前日期。

**严禁访问**：源码、`docs/`、`CLAUDE.md`、`CHANGELOG.md`、git 历史、HW6 任意目录、其他 reviewer 输出、上一轮评分、任何关于"本轮改动了什么"的描述。

| ID | 视角 |
|----|------|
| `A1-stability-hunter` | 崩溃 / console error / unhandled rejection |
| `A2-performance-auditor` | A2 FPS 目标达标 + 长程内存泄漏 |
| `A3-first-impression` | 全新玩家前 3 分钟体验 |
| `A4-polish-aesthetic` | 视觉 / 音频 / 动效 polish |
| `A5-balance-critic` | 资源曲线 / 难度曲线 / 策略深度 |
| `A6-ui-design` | 视觉层级 / 排版 / 信息密度 / 控件 bug |
| `A7-rationality-audit` | 残留死设计 / 表述不清 / 隐藏状态 |

#### Tier B（B1, B2）半盲

每位 reviewer prompt 中显式声明 `read_allowlist`，**只能 Read 列表内的文件**，且严禁推断未列出文件内容。

| ID | 可读 | 用途 |
|----|------|------|
| `B1-action-items-auditor` | 浏览器 + HW6 末轮 `Validation/test-report.md` 与 `Feedbacks/summary.md` | 逐项验证 HW6 用户研究提出的 3-5 个 action items 是否在当前 build 关闭 |
| `B2-submission-deliverables` | 浏览器 + 仓库 `README.md` + `assignments/homework7/*.md` + `CHANGELOG.md` | 按 HW7 提交清单核对 |

B 层禁止读 `src/` 和 `test/`。

#### Tier C（C1）白盒架构审计

| ID | 可读 | 用途 |
|----|------|------|
| `C1-code-architect` | 全部 | 每轮重盘所有系统；判断每个系统是否使用一个**自成一体的算法框架**（worker AI 的 `Intent → State → Action` 流水线为黄金范例），还是一堆补丁堆砌 |

C1 不进行游玩，仅做静态架构审计。每轮必须：
1. 重新枚举所有系统（`SYSTEM_ORDER` + `docs/systems/*` + `src/simulation/**` glob，与上一轮的 inventory 做 diff）
2. 对每个系统给出 A / B / C / D 的架构整洁度评分
3. 列具体到 `file:line` 的架构债条目
4. 标记本轮新增 / 消除 / 恶化的债

### Enhancer（计划者）

**只能读取**：当轮单份 reviewer feedback、当前仓库代码与文档。

**严禁读取**：其他 enhancer 的 plan、其他 reviewer 的 feedback。

职责：定位根因 → 写 plan → 不改代码。

#### HW7 计划质量基本准则

1. **覆盖 reviewer 全部反馈**（与 HW6 相同）。
2. **优先顶层逻辑修复，禁止缝补**（与 HW6 相同）。
3. **Step 粒度可验证**（与 HW6 相同）。
4. **Track 标注**：plan frontmatter **必须**包含 `track: code | docs | both`。docs track 仅允许改 `README.md` / `assignments/homework7/*.md` / `CHANGELOG.md`；code track 仅允许改 `src/` 与 `test/`。
5. **来自 C1 的架构整改 plan**（refactor 类）必须额外满足：
   - 改动**保持外部可观察行为不变**（用现有测试 + 新增 invariant 测试守住）
   - **不引入新 mechanic / tile / role / building / mood / audio asset**
   - 单 plan LOC delta ≤ 400；超出则拆 wave / 拆轮次
   - 必须列**回滚锚点 commit**

### Implementer（实施者）

**只能读取**：当轮 `Plans/summary.md` 的 accepted plans。

职责：按 wave 顺序串行落地 → 一条 plan 一个 commit → 每条 plan 写 implementation log。

禁止：跨 plan 混改、碰 plan 外路径、为绕过 freeze 引入新机制、跨 track 越界（code 的 plan 不许动 docs，反之亦然）。

### Validator（验证者）

职责：

1. 全量单测（`node --test test/*.test.js`）
2. **HW7 强制 Production Build Gate**：`npx vite build` 无错；`vite preview` 起 3 分钟 smoke 无 console error
3. **HW7 强制 FPS Gate**：runtime context 注入 A2 spec 中的 `target_fps_p50` 与 `target_fps_p5`，用 `browser_evaluate` 实测 P50 / P5；任一不达标 → RED
   - **Runtime Context — `playwright_chrome_flags` 字段（R3+ 强制）**：Reviewer / Validator 启动 Playwright Chromium 测 FPS 时，必须在 runtime context 中显式列出使用的 Chrome flags（如 `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`）。未列出 = 默认 headless RAF 1 Hz throttle 在生效，FPS 数字不可信；此时必须改用 `window.__perftrace.topSystems` / `__perftrace.frameMs` 作为 ground-truth perf 信号（参见 PROCESS-LOG R3 Closeout）。
4. Long-horizon benchmark（沿用 HW6 baseline，仅做回归监控，HW7 不再以 DevIndex 提升为目标）
5. **Hard-freeze diff check**：`git diff --stat <round-base>..HEAD` 不得新增 `src/simulation/<新系统>/`、新 tile 常量、新 role enum；如有 → RED 并指明哪条 plan 越界
6. Bundle size：单 chunk > 500 KB 警告；> 1 MB → RED

benchmark 回归不能被"UI 更好了"或"架构更整洁了"软性抵消。处理顺序：先修 → 修不动再回退 → 明确写入 validation。

---

## 4. 各阶段输入输出

| 阶段 | 输入 | 输出 |
|------|------|------|
| A Review | 浏览器构建（+ B/C 层 reviewer 的限定 read_allowlist） | `RoundN/Feedbacks/<reviewer-id>.md` + `summary.md` |
| B Plan | 当轮 feedback + 仓库代码 | `RoundN/Plans/<reviewer-id>.md` + `summary.md` |
| C Implement | `Plans/summary.md` | 代码 / 文档 commits + `RoundN/Implementations/<reviewer-id>.commit.md` |
| D Validate | Stage C HEAD | `RoundN/Validation/test-report.md`（含 build / FPS / freeze-diff / bundle 四道 gate） |

---

## 5. 强制约束

### HW7 Hard Freeze（比 HW6 active 更紧）

plan 主方案若包含以下任一类内容，整份 plan **作废重写**（HW6 是 D5 defer，HW7 是直接拒收）：

- 新建筑 / 新 tile / 新工具 / 新 role / 新 mood / 新 mechanic
- 新音频资产 / 新 3D 模型 / 新教程关卡
- 新胜利条件 / 新 score 系统 / 新 director / 新 LLM persona
- 新 UI panel / 新 HUD 区块（**调整既有 panel 内容允许**）

允许的改动类别：

- bug fix（包括 P0 崩溃 / P1 不一致 / P2 视觉 glitch）
- 性能优化（FPS 提升、内存回收、批处理合并）
- 文案 / tooltip / label 修订
- UI 对齐 / spacing / typography 修复
- balance 数值微调（沿用既有 BALANCE 常量结构）
- 死代码 / 死 UI / 死 config 删除
- 架构整理（C1 driven，但必须满足 §3.Enhancer §准则 5）
- 文档：README / CHANGELOG / Post-Mortem / Demo-Video plan
- 现有 audio asset 的混音 / 音量 / 触发时机调整（不允许新 asset）

### Blind Review Contract — 仅适用于 Tier A

A1-A7 的 prompt 与 runtime context 中若出现以下信息，reviewer 必须将其视为污染输入并忽略：

- 仓库源码、文档摘要、CHANGELOG、git 历史
- HW6 任何目录的内容
- "上一轮你打了几分" / "这轮修了哪些问题"
- 任何 delta summary / round summary / 作者说明
- 任何用来诱导提分的解释性旁白

Tier B 的 reviewer 只能读 prompt frontmatter 中 `read_allowlist` 显式列出的路径；越界读 = 该份 feedback 作废。

Tier C 反向 —— **必须**读完 `docs/systems/*` 与 `SYSTEM_ORDER`，否则架构判断不成立。

### Anti-Echo-Chamber

- reviewer 之间互相隔离，不读对方输出（Tier A / B / C 各自隔离，跨 tier 也不互读）
- enhancer 之间互相隔离，不读对方 plan
- implementer 不反向重写 reviewer 结论
- 聚合只在 summary 阶段由 orchestrator 完成

### Reviewer 浏览器调度协议（串行，2026-05-01 实测验证）

> HW6 的 "parallel + 10s stagger + tab isolation" 协议在 HW7 Round 0 准备期被实测推翻：
>
> - 即使按 HW6 protocol（分步 `tabs new` → `navigate`），并行 sub-agent 中 2/3 的 navigate 打到错的 tab（呈现"新 tab 替换旧的"症状）
> - 即使改用原子 `browser_tabs action=new url=X`，agent 后续 `select MY_TAB → screenshot` 之间仍存在 race window —— 1/3 的 screenshot 捕到了别的 agent 的 tab
>
> 根因：所有 Playwright action（`navigate` / `click` / `screenshot` / `evaluate`）均对**全局 (current) tab** 操作；MCP 不暴露 per-tab handle；并行 agent 无法保证 `select` 与下一动作之间没有别 agent 的 race-inducing 调用插入。

**HW7 决议：Stage A 改为严格串行。**

- 每次只派遣 1 个浏览器型 reviewer，等其完成（feedback 文件已写出）才派下一个
- agent 内部直接 `browser_navigate url=<build_url>` 作为第一动作；**不需要** `tabs new` / `tabs select`，因为没有竞争者
- 串行天然带 fresh navigate 边界 —— 上一个 reviewer 留下的浏览器状态（zoom / 时间倍率 / 模态层）被下一个 navigate 重置
- 总耗时：约 9 个浏览器 reviewer × ~5 min = ~45 min；C1 静态审计可与任一 reviewer 并行进行
- 换 100% 可靠的 feedback 不被 race 污染

C1 不使用浏览器；与 Stage A 浏览器型 reviewer 任一时机并行均无冲突。

Stage B（enhancer）暂保留并行 —— 每位 enhancer 仅做轻量 Playwright 复现，race 风险低；若实测中出现污染再降级为串行。

---

## 6. 停止条件

可以停止自动迭代，**当且仅当下列全部成立**：

- A1（stability）连续两轮 0 个 P0
- A2（performance）连续两轮 P50 ≥ `target_fps_p50` 且 P5 ≥ `target_fps_p5`
- A3 / A4 / A5 / A6 / A7 共识问题逐轮收敛（每轮 P0 + P1 总数单调下降，或两轮无新增）
- B1（HW6 action items）所有 item 状态 = `closed` 或 `documented-defer`
- B2（submission deliverables）checklist 全绿
- C1 架构债条目数**严格非递增**且无"D 级系统"
- Validator 连续两轮 GREEN（含 prod build / FPS / freeze-diff / bundle 四道 gate）
- 人类试玩确认没有为 reviewer 提分而过拟合

任一条不满足，继续下一轮。
