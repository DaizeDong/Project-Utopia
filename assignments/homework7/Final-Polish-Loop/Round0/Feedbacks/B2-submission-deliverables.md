---
reviewer_id: B2-submission-deliverables
round: 0
date: 2026-05-01
verdict: RED
score: 3
checklist_total: 22
checklist_pass: 7
checklist_pending: 0
checklist_fail: 15
build_url_works: true
post_mortem_path: none
demo_video_link: missing
---

## 总评

HW7 是终交付阶段，但目前的仓库状态距离一份"可提交的成品"还差关键一截 —— 不是 polish 不够，而是**Phase 4 的 deliverable 几乎全缺**。

具体地：
- README 仍然是 HW3/HW4 工程季的 "engineering / release flow" 文档，里面没有 HW2 定义的两个 pillar、没有 demo video link、没有 Post-Mortem 链接、没有 final hosted URL（README 第 68 行明确写"authoritative artifact is local build, not hosted URL"，但 HW7 Phase 1 checklist 第一条要么提供 WebGL 链接要么提供 desktop build 的傻瓜安装；目前两者都没有 —— 只有一条要 fresh checkout、`.env`、`OPENAI_API_KEY` 才能跑的 dev server 指令）。
- `assignments/homework7/` 目录下**根本没有 Post-Mortem.md / Engineering-Retrospective.md**。仅有 `Assignment 7_ Final Submission.md`（TA 原题）+ `Final-Polish-Loop/` 流程框架（PROCESS.md / ORCHESTRATOR.md / Reviewers/ / Coders/ / Round0/Feedbacks/）—— 这是 *做作业用的内部工具*，不是交付物。
- Demo Video 既没有 link，也没有"plan / placeholder"占位。按 reviewer prompt 第 71-72 行的协议，这意味着 video 状态是 **missing**（不是 pending）—— 因为没有任何文档说"video pending recording"。

唯一亮点是 build 跑得起来：`http://127.0.0.1:5173/` 加载正常，主菜单 → Start Colony → 进入游戏 → canvas 渲染、无 console error，game loop 闭合可达。CHANGELOG 在版本覆盖度上极度详尽（从 v0.10.0-a 一直滚到 v0.10.1-m，每个 commit 都有对应条目），这条单独是绿的。

但工程质量 ≠ 交付清单。**当前状态如果直接交，TA 会判定为 incomplete submission**。验证截图见 `screenshots/B2/01-game-running.png`。

---

## C1 Final Build / Web Link

| 子项 | 状态 | 证据 |
|------|------|------|
| README 含 final build URL（WebGL）或 build instruction（Desktop） | WARN | README 给出 `npm start` / `npm run start:prod` / `Project Utopia.cmd` 三条本地启动方式；明确表态"no hosted URL"。但 HW7 Phase 4 checklist 要求 *"updated, final live URL"* OR *"a compiled executable (.exe, .app) with all necessary assets bundled, or strict, foolproof run instructions"*。当前指令需要 `npm ci` + `cp .env.example .env` + 配 `OPENAI_API_KEY`，**对 TA / grader 而言不是 foolproof**（无 key 时 fallback 模式可跑，但 README 没有突出说明这一点）。 |
| URL 可访问（browser_navigate 测） | PASS | `http://127.0.0.1:5173/` 200 OK，`document.title === "Project Utopia"`, canvas 已挂载。`screenshots/B2/01-game-running.png` |
| 进入 build 后能完成 menu → 进游戏 → 玩 → 退出 game loop | PASS | "Start Colony" 按钮可点，进入游戏后 HUD/canvas 渲染正常，无 console error。退出回主菜单的 UX 未在本审计中验证（B2 不深 QA gameplay，归 A3 / A6） |
| README 中的 build instruction 与 actual build 行为一致 | PASS | `npm start` ≡ `dev:full`，与本次 :5173 启动一致 |

**结论**：build 本身没问题；问题在于"final build 的入口形态"未按 HW7 要求收敛 —— TA 拿到 zip 或 GitHub link 后，需要的是一条 `npx vite preview` 或一个 hosted URL，而不是 README 半屏的 release flow 指南。

---

## C2 Source Code + README

| 子项 | 状态 | 证据 |
|------|------|------|
| README 项目简介 | PASS | 第 3 行：一句话介绍 Three.js + tile-based + LLM AI |
| README setup / run instruction（本地起 dev server） | PASS | 第 11-46 行 Quick Start + 启动方式 |
| README final build instruction（`npm run build`） | PASS | 第 33 行 `npm run build`，第 45 行解释 build → preview 流程 |
| README 解释了**核心两个 pillar**（A2 中定义的） | **FAIL** | grep "pillar/Pillar/PILLAR" → README 0 次命中。整份 README 没有任何 "two pillars / core pillars / 技术亮点" 章节。这条是 HW7 检查的核心条目之一（demo video 与 post-mortem 都需要回应这两个 pillar） |
| README 引用 demo video link | **FAIL** | grep "video/youtube/vimeo" → 0 次命中 |
| README 引用 post-mortem | **FAIL** | grep "post-mortem/postmortem/retrospective" → 0 次命中。Post-Mortem.md 文件本身也不存在（见 C4） |
| README 避免 "lorem ipsum / TODO / Coming Soon" 残留 | PASS | 静读 199 行，未发现占位文字 |
| CHANGELOG 覆盖到当前版本 | PASS | grep "^## v" → 至少 20 条，从 v0.10.1-m（最新 HEAD）一路覆盖到 v0.10.0-a，每条都标注日期 + 变更分类。是当前唯一完全合格的提交物 |

**关键缺失**：README 完全没有"作业语境"。它读起来像一个 release pipeline 手册，而不是给课程评审看的项目展示。三条致命缺失：pillar 介绍、demo video link、post-mortem link。这三条都是 HW7 Phase 4 checklist 显式要求的。

---

## C3 Final Demo Video

| 子项 | 状态 | 证据 |
|------|------|------|
| post-mortem / README 中存在 video link | **FAIL → missing** | post-mortem 文件不存在；README 也无任何 video 引用。按 reviewer 协议 §71-72：missing ≠ pending —— 没有任何文档说 "video pending recording / video plan TBD"，因此判定 **missing** |
| video 时长 claim 在 2-4 分钟范围 | N/A | 无 video / 无 plan，无法核对 |
| 描述提到 "complete game loop showcase" | N/A | 同上 |
| 描述提到 "two pillars demonstration" | N/A | 同上 |
| 描述提到 "voiceover or text overlay explaining technical achievements" | N/A | 同上 |

**建议补救最低姿势**（即使 video 还没拍）：在 `assignments/homework7/Demo-Video-Plan.md` 或新建的 `Post-Mortem.md` 里写一段 "Demo Video Plan" 草稿，明确：
- 计划录制时间 / 长度
- 分镜：menu → game loop → pillar A 演示 → pillar B 演示 → end state
- 投稿平台（YouTube / Vimeo）
- 上传后会回填到 README

这样下一轮 reviewer 能从 "missing" 改判为 "pending"。

---

## C4 Post-Mortem 内容核对

| 子节 | 是否存在 | 内容质量 | 改进建议 |
|------|----------|----------|----------|
| **整份 Post-Mortem.md 文件存在性** | **NOT EXISTS** | N/A | 首要任务：在 `assignments/homework7/Post-Mortem.md` 创建文件。该路径下只有 TA 原题 + Final-Polish-Loop/ 流程框架，**没有任何 post-mortem markdown** |
| Brief overview of two pillars and achievements | 缺失 | — | 需对应 A2 中定义的 pillar；从 CLAUDE.md 推测可能是 "ECS-like 15-system architecture + worker FSM (v0.10.0)" 与 "LLM-driven AI policy layer with deterministic fallback"，但必须由作者自己锚定 A2 原文 |
| Playtest Resolution | 缺失 | — | 需逐条罗列 HW6 Round X user study 的 3-5 个 action items，每条配 commit / build 行为变更证据。这条与 B1-action-items-auditor 输出有交叉，B2 只看文档存在性；当前文档完全不存在 |
| Technical Post-Mortem — biggest architectural / engineering challenges | 缺失 | — | 推荐至少覆盖：worker AI 三次重写（commitment latch → utility scoring → flat priority FSM）、LLM proxy 容错、长程 benchmark spike (`MONOTONICITY_RATIO`) 调参、production build freshness gate |
| Technical Post-Mortem — pivots / cuts from A2 MVP & reasons | 缺失 | — | 推荐覆盖：survival 模式替代了原计划的 victory condition / objective 系统；wildlife / defense 是从计划 MVP 缩水还是新增；多 LLM persona 是否计划过又被砍 |
| AI Tool Evaluation | 缺失 | — | TA 在 §1.5 强调"不要用 LLM 美化"。这一节务必写真实经验：哪段 LLM 辅助提速明显、哪段 hallucination 浪费时间。Project Utopia 的开发轨迹大量依赖 Claude Code，这是正题 |

**整体**：C4 整段 0 / 5 子项满足。这是当前提交清单**最严重的单点缺口**。

---

## C5 Submission Format

| 子项 | 状态 | 证据 |
|------|------|------|
| 所有 report 都是 markdown | PASS（条件性） | 仓库内现有 docs / changelog / assignment 报告均 .md。但 Post-Mortem 还不存在，无法核对其格式 |
| 提交内容包含 zip 或 hosted link 二者之一 | **FAIL** | 当前都没有：无 hosted URL（README 明确拒绝），无打包好的 zip / release artifact。submission 形态未定 |

---

## 自行扩展角度

### 1. README 在 fresh checkout 上的 grader 可用性

静读 README 流程：
- `npm ci` ✓ 标准
- `cp .env.example .env` ✓ 但 grader 拿到 zip 后，`.env.example` 是否真存在仓库内？这条未在 B2 允许读路径里，无法核对，但建议作者手动确认
- `set OPENAI_API_KEY` ✗ grader 大概率没有 key —— README 应在 Quick Start 顶部就明确写 **"无 key 时游戏自动 fallback，所有核心机制可演示"**，把 LLM 列为可选增强而非启动前提
- `npm start` → `:5173` ✓
- 但 README 没有写"这是默认 entry，浏览器自动打开此 URL"。grader 可能开了 `npm start` 后看不到东西。建议加一行 "open `http://localhost:5173` in your browser"
- 没有任何 "first 5 minutes 应该看到什么" 的引导

整体：README 假设读者是开发者；HW7 的读者是 TA。这两类受众的 onboarding 路径不一样。

### 2. Post-Mortem 一旦写出来，如何避免"LLM 美化味"

TA 在 §1.5 显式反对。建议作者：
- 多用第一人称具体回忆，少用"the architecture leverages a robust ECS pattern"这类无信息量句式
- 列具体 commit hash / 文件名（CHANGELOG 已经够细，复用即可）
- 在 AI Tool Evaluation 节真实写"Claude 给我搞错了 X，浪费了 Y 小时"，而不是泛泛的"AI tools accelerated development"
- 长度控制在 800-1500 行 markdown 区间；过短不严肃，过长是 LLM 套话
- **不要让 Claude / GPT 直接写整份 post-mortem**，至少作者亲手改过每段（TA 指明会看出来）

### 3. 外链有效性

不适用 —— README 内无任何外部 URL（既没有 demo video，也没有 hosted build）。

### 4. CHANGELOG 与 PROCESS-LOG 的关系

CHANGELOG 维护得极佳，但 `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` 仍是空模板（仅含一段 README 用法说明 + 一个 round 模板）。Round 0 还没收敛，这条是 orchestrator 该做的，不进 B2 评分；但提醒：**Post-Mortem 中"Playtest Resolution" 节的最佳证据来源就是 PROCESS-LOG 跨轮迭代记录**，所以 PROCESS-LOG 也要在最终提交前补完。

---

## 改进优先级

### P0（缺失关键 deliverable，submission 直接不合格）

1. **创建 `assignments/homework7/Post-Mortem.md`**，至少覆盖 Phase 3 的 4 节：pillars overview / Playtest Resolution / Technical Post-Mortem / AI Tool Evaluation。每节有具体内容，不是空 heading
2. **README 顶部加 "Highlights / Two Pillars" 章节**，对应 A2 的两个核心 pillar 定义
3. **README 加 Demo Video 链接**或在 Post-Mortem 顶部加 "Demo Video Plan"（即使 video 还没拍，也要标 pending 而不是缺席）
4. **README 加 Post-Mortem 链接**（与 P0-1 配对）
5. **明确 Submission Format**：决定用 zip 还是 hosted link。如果坚持 local build，至少把 release artifact 打包流程写进 README 结尾的 "How to grade this" 章节

### P1（存在但不达标）

1. README 顶部把 "无 LLM key 时游戏自动 fallback、核心机制全可演示" 这条**前置**到 Quick Start 的第一句（目前埋在第 172 行 Fallback Diagnostics 表里）
2. README 加 "open browser to http://localhost:5173" 一句明示
3. PROCESS-LOG.md 在 Round 0 收敛时补一条记录，作为 Post-Mortem 的引用源
4. Post-Mortem 写完后做"去 LLM 化"通读 —— TA 会看出来

### P2（细节）

1. README 第 68 行的 "authoritative artifact is local build, not hosted URL" 这条在 HW3/HW4 工程语境下成立，但在 HW7 提交语境下与 TA 期望相左 —— 至少加一句限定 "for daily verification gates" 区分场景
2. CHANGELOG 已经极详尽，无需改动
3. Post-Mortem 中 "AI Tool Evaluation" 节可顺便回应 CLAUDE.md 中已有的 v0.9.x → v0.10.x worker AI 重写经验，这是天然素材

---

## 结论

**Verdict: RED**（score 3 / 10）

22 项 checklist 子项中，PASS 7 / FAIL 15（其中 5 项是 Post-Mortem 的 NOT EXISTS 衍生项）。Round 0 的 B2 输出非常清楚：

- 工程做完了 ✓
- 提交清单基本未启动 ✗

下一轮（Round 1 或 closeout 前）必须 close 的 P0 是：
1. Post-Mortem.md 文件 + 4 节内容
2. README 加 pillars / video / post-mortem 三条引用
3. Submission Format 决定（zip vs hosted）

只要 P0 五条全部落地，B2 verdict 可直接由 RED → GREEN（不需要 YELLOW 中转，因为 build / changelog / build instruction 三条已经稳）。
