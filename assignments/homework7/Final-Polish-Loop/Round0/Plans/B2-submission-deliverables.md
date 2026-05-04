---
reviewer_id: B2-submission-deliverables
reviewer_tier: B
feedback_source: Round0/Feedbacks/B2-submission-deliverables.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P0
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~320
  new_tests: 0
  wall_clock: 35
conflicts_with: []
rollback_anchor: 3f87bf4
---

## 1. 核心问题

1. **HW7 Phase 4 deliverable 几乎全缺**：`assignments/homework7/Post-Mortem.md` 不存在；README 既无 pillars 章节也无 demo video / post-mortem 链接。22 项 checklist 中 15 项 FAIL（其中 5 项是 Post-Mortem 不存在的衍生项）。
2. **Submission Format 未定**：README 第 68 行明确拒绝 hosted URL，但仓库内既无 hosted link 也无 zip 打包说明，TA 拿到提交后没有 foolproof 入口。
3. **README 受众错位**：当前 README 写给 dev / release pipeline，没有为 grader 准备的 onboarding（无 LLM key fallback 提示前置缺失、无 "open browser to 5173" 明示）。

---

## 2. Suggestions（可行方向）

### 方向 A: 三文件同步落地（Post-Mortem.md 全文 + Demo-Video-Plan.md 占位 + README pillars/links/grader 段补丁）

- 思路：一次性把 P0 的 5 条 + P1 的 1-2 条全部以**纯文档**方式补齐，达成 RED→GREEN 跃迁。
- 涉及文件：
  - `assignments/homework7/Post-Mortem.md`（新建）
  - `assignments/homework7/Demo-Video-Plan.md`（新建）
  - `README.md`（在第 4 行后插 Pillars 章节；在第 65 行后插 Demo Video / Post-Mortem 链接小节；在第 11 行 Quick Start 顶部前置 fallback 提示与 browser-open 一句；在第 132 行 "Submission / Release Flow" 末尾追加 "How to grade this" 子节，定 zip 路径）
- scope：中（~320 LOC docs delta，零代码）
- 预期收益：B2 verdict RED→GREEN；同时给 B1 / TA 复评提供 anchor
- 主要风险：Post-Mortem 内容若由 LLM 直写会被 TA 识别（feedback §1.5 强调）。**作者必须亲手改写每节**——plan 里只出**结构骨架与每节要回答的问题清单**，不写散文段落
- freeze 检查：OK（无新 tile / role / building / mood / mechanic / audio / UI panel；纯 docs）

### 方向 B: 仅创建 Post-Mortem.md 骨架，README 暂不动

- 思路：最小子集——只 close C4 的 NOT EXISTS，留 README pillars / links / submission format 给后续轮次
- 涉及文件：仅 `assignments/homework7/Post-Mortem.md`
- scope：小（~120 LOC）
- 预期收益：C4 由 0/5 升至 5/5 子项 EXISTS；但 C2 的三条 README FAIL（pillars / video link / post-mortem link）和 C5 的 submission format FAIL 仍开
- 主要风险：B2 score 仍停留在 ~5（YELLOW），未达 GREEN 阈值；下轮 reviewer 还要再开一个 plan 收尾
- freeze 检查：OK

### 方向 C: 只改 README，Post-Mortem 留给作者后续手写

- 思路：依赖作者之后亲笔写 Post-Mortem，本轮只补 README 三条引用 + submission format
- 涉及文件：仅 `README.md`
- scope：小（~80 LOC）
- 预期收益：C2 三条 FAIL 转 PASS；但 C4 整段 0/5 与 C5 zip 缺仍开
- 主要风险：README 引用的 Post-Mortem.md 不存在 → 死链 → 下轮 B2 复评直接判 INCONSISTENT，比当前更差
- freeze 检查：OK，但**逻辑上不可选**（链接到不存在的文件比无链接更糟）

---

## 3. 选定方案

选 **方向 A**，理由：

- B2 feedback §"改进优先级" 明列 P0 五条，这五条**必须捆绑落地**才能避免 README 引用悬空（方向 C 的死链陷阱）或残留 C4/C5 大坑（方向 B 的半成品）
- 纯 docs，零 freeze 风险，零代码冲突，wave-0 兼容所有并发 plan
- 一次到位，避免下一轮重新规划再消耗 orchestrator predicate
- 关键防御：plan 仅给**结构骨架与 prompt-style 每节问题清单**，不替作者落散文 → 规避 TA "LLM 美化味" 红线

---

## 4. Plan 步骤

- [ ] **Step 1**: `assignments/homework7/Post-Mortem.md` — **add**（新建文件，~180 行 markdown 骨架）
  - YAML frontmatter：`title: Project Utopia — Post-Mortem`、`date: 2026-05-01`、`build_commit: 3f87bf4`、`author: <作者填>`
  - 顶部 "Demo Video" 小节：占位 `[pending — see Demo-Video-Plan.md]`，链接到 Step 2 的文件
  - **§1 Pillars Overview**（骨架 + 引导问题清单）：
    - "Pillar A — <按 A2 原文锚定，不替作者命名>"：3 个引导问题（这 pillar 解决什么？技术上如何实现？哪些 commit 是关键证据？）
    - "Pillar B — <同上>"：同 3 个引导问题
    - 注释行：`<!-- AUTHOR: 必须从 assignments/homework2/*.md 中复制 A2 原文 pillar 定义，不要 LLM 重写 -->`
  - **§2 Playtest Resolution**（骨架）：表格头 `| User Study Finding | Action Item | Commit / File Evidence | Status |`，注释行指向 `assignments/homework6/` 与 `Final-Polish-Loop/PROCESS-LOG.md`
  - **§3 Technical Post-Mortem — Architectural Challenges**（骨架）：4 个建议子节（worker AI 三次重写 v0.9.0 utility scoring → v0.10.0 flat priority FSM；LLM proxy 容错与 retry；长程 benchmark `MONOTONICITY_RATIO` 调参；production build freshness gate），每子节标注 "see CHANGELOG.md vX.Y.Z" 锚点供作者扩写
  - **§4 Technical Post-Mortem — Pivots & Cuts from A2 MVP**（骨架）：3 个引导问题（survival mode 是否替代了原 victory condition / objective 系统？wildlife / defense 是缩水还是新增？多 LLM persona 是否计划过又被砍？）
  - **§5 AI Tool Evaluation**（骨架，TA §1.5 重点）：明确写注释 `<!-- AUTHOR: 用第一人称写真实经验。列具体 commit hash / 文件名。诚实写 LLM 浪费时间的案例。不要让 LLM 直接生成本节散文。-->`
  - 文件末尾 "References" 区：链接到 `CHANGELOG.md`、`CLAUDE.md`、`Final-Polish-Loop/PROCESS-LOG.md`

- [ ] **Step 2**: `assignments/homework7/Demo-Video-Plan.md` — **add**（新建文件，~50 行）
  - YAML frontmatter：`status: pending`、`target_length_minutes: 3`、`platform: TBD (YouTube / Vimeo)`
  - §1 计划录制时间窗口（占位 `<TBD by author>`）
  - §2 分镜清单：menu screen → Start Colony → first 30s game loop → Pillar A 展示（指向 Post-Mortem §1） → Pillar B 展示 → end-state（survival mode DevIndex）
  - §3 Voiceover / text overlay 决策（占位）
  - §4 上传后回填 README + Post-Mortem 顶部链接的 checklist
  - 注释：`<!-- 这是 placeholder。video 录完后用真实 URL 替换状态字段，并在 README 与 Post-Mortem.md 顶部 video 区域同步链接 -->`
  - depends_on: Step 1（Post-Mortem 顶部 Demo Video 小节会链向本文件）

- [ ] **Step 3**: `README.md:4` 后 — **edit / add**（在第 4 行末与第 5 行 `## Tech Stack` 之间插入新章节 `## Highlights — Two Pillars`，~25 行）
  - 章节用骨架 + 注释提醒作者从 A2 复制原文：`<!-- AUTHOR: 此处 pillar 名称必须与 assignments/homework2/*.md 中 A2 定义一致，不要 LLM 重命名 -->`
  - 两个子标题 `### Pillar A — <name>` / `### Pillar B — <name>`，每段 2-3 句技术摘要占位
  - 章节末追加 `> See [Post-Mortem](assignments/homework7/Post-Mortem.md) for the full technical retrospective.`
  - depends_on: Step 1（链接目标必须存在）

- [ ] **Step 4**: `README.md:11` Quick Start 章节首段 — **edit**（在 `## Quick Start` 标题下、第一条命令 `npm ci` 之前插入 ~6 行）
  - 加一段 callout：`> **For graders / first-time runners**: This project runs fully without an LLM API key — the AI fallback policy provides complete gameplay. Set OPENAI_API_KEY only to enable live LLM-driven decisions (optional enhancement).`
  - 在 `npm start` 命令行之后追加一行：`Then open <http://localhost:5173> in your browser (Vite auto-launches in most setups).`
  - 解决 feedback §"自行扩展角度 1" 的两条 grader-onboarding 缺失

- [ ] **Step 5**: `README.md:65` 后 — **edit / add**（在 `## Submission / Release Flow` 章节之前，插入新小节 `## Demo Video & Post-Mortem`，~12 行）
  - 两条 bullet：
    - `- **Demo Video**: pending — see [Demo-Video-Plan.md](assignments/homework7/Demo-Video-Plan.md)`
    - `- **Post-Mortem**: [assignments/homework7/Post-Mortem.md](assignments/homework7/Post-Mortem.md) — pillars, playtest resolution, technical challenges, AI tool evaluation`
  - depends_on: Step 1, Step 2（两条链接目标必须先存在）

- [ ] **Step 6**: `README.md:132` `## Submission / Release Flow` 章节末尾 — **edit / add**（追加新子节 `### How to Grade This Submission`，~20 行）
  - 明确 submission format 决策：保留 local-build-as-authoritative 策略，但提供 zip artifact 准备步骤
  - 步骤清单：(1) `git clone <repo>` 或解压 zip → (2) `npm ci` → (3) `npm run build` → (4) `npx vite preview` → (5) 浏览器打开 preview 给出的 URL → (6) Start Colony 走完一个 day cycle 即视为通过
  - 加一段：`> If submitting as zip: run \`npm run build\` first, then zip the repo root **excluding** node_modules / .env / output/. Reviewer can \`npm ci && npx vite preview\` against the bundled \`dist/\`.`
  - 同时**软化** README 第 68 行的 "authoritative artifact is local build, not hosted URL"——把这句限定为 "*for daily verification gates during development*"，并加一句 "*for HW7 final submission, see § How to Grade This Submission below*"
  - 解决 feedback C5 的 zip / hosted format 二选一悬空 + P2-1 限定语缺失

---

## 5. Risks

- **作者未亲手改写 Post-Mortem 散文** → TA §1.5 识别出 LLM 味 → score 反而扣分。**缓解**：Step 1 只产出骨架 + 注释 + 引导问题，**不**写整段散文；plan 已显式标注 "AUTHOR" 注释行。
- **README 修改可能与 B1 action-items plan 抢同一份文件**（B1 若也要在 README 写 action item resolution 表）。**缓解**：本 plan 只动 README 顶部 Highlights + Quick Start callout + 第 65 行后新增小节 + 第 132 行后子节追加，**不动**第 48-65 行 Long-Run Validation 和第 133 行后 Optional Live-AI / AI Runtime Self-Check / Fallback Diagnostics 区域，保留充足 surface 给其他 plan。
- **Pillar 名称作者必须从 A2 原文锚定** —— 若骨架里强行猜名（如 CLAUDE.md 推测的 "ECS-like 15-system" + "LLM-driven AI"）会与 A2 真实定义冲突。**缓解**：Step 1 / Step 3 都标注 `<!-- AUTHOR: 从 assignments/homework2/*.md 复制 -->` 注释，Implementer 必须读 A2 原文不能 LLM 重写。
- **Demo-Video-Plan.md 占位文件若被 reviewer 误读为 "已完成"** → 状态混淆。**缓解**：frontmatter `status: pending` + 文件名带 "Plan" 后缀，明确为计划而非实物。
- 可能影响的现有测试：**无**——纯 docs 改动，`node --test test/*.test.js` 与 `npx vite build` 都不读这些文件。

---

## 6. 验证方式

- 新增测试：**无**（纯 docs，不需要单测）
- 手动验证：
  1. `ls assignments/homework7/Post-Mortem.md` → 文件存在
  2. `ls assignments/homework7/Demo-Video-Plan.md` → 文件存在
  3. `grep -i "pillar" README.md` → ≥ 3 处命中（章节标题 + 两个子标题）
  4. `grep -i "post-mortem" README.md` → ≥ 1 处命中
  5. `grep -i "demo video" README.md` → ≥ 1 处命中
  6. `grep -i "fallback" README.md` 第一处命中行号 < 25（即前置到了 Quick Start 顶部，不是埋在 174 行）
  7. README 中所有 `[...](...)` 相对链接打开都指向真实存在文件（特别校验 `assignments/homework7/Post-Mortem.md` 与 `assignments/homework7/Demo-Video-Plan.md`）
- FPS 回归：N/A（纯 docs）
- benchmark 回归：N/A（纯 docs）
- prod build：`npx vite build` 无错（应当无影响，但跑一遍确认 .md 改动未误伤）
- B2 复评 dry-run：人工对照 feedback 中 22 项 checklist——预期 PASS 至少升至 17 / 22（C2 三条 FAIL → PASS、C3 status missing → pending、C4 文件存在性 FAIL → PASS、C5 zip path FAIL → PASS）

---

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚：`git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发）
- 由于本 plan 仅新增 2 个 markdown 文件 + 编辑 1 个 markdown，回滚极轻量，无副作用风险

---

## 8. UNREPRODUCIBLE 标记

不适用——B2 feedback 已通过 Playwright 复现 build 可达（screenshots/B2/01-game-running.png），且 P0 缺失项是**文件不存在**的静态事实（`ls assignments/homework7/Post-Mortem.md` → no such file），无需 runtime 复现。
