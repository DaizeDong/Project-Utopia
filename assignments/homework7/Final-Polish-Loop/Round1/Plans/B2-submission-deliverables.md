---
reviewer_id: B2-submission-deliverables
reviewer_tier: B
feedback_source: Round1/Feedbacks/B2-submission-deliverables.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P1
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~120
  new_tests: 0
  wall_clock: 20
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

R0 把 P0 五项结构性缺口全部补上，verdict 由 RED (7/22) 跃到 YELLOW (17/22)。剩余 5 项中有 4 项是**作者本人必须填**的内容（pillar 名字、Post-Mortem §1-§5 实质内容、demo video URL、pillar summary）—— 按 TA §1.5 anti-LLM-polish 红线，这些**不可以由 LLM 代填**，R0 实现者按 plan 留 `<!-- AUTHOR: ... -->` 是正确选择，本轮**继续保留** author-fill 状态。剩余 1 项 FAIL（C5 submission format zip vs hosted）是**进程问题**而不是内容问题——repo 缺一个可执行的 zip 打包脚本来 pre-stage 提交产物。

归并为 2 个根本问题：

1. **Author-fill 任务从未被显式登记进 closeout checklist**——4 个 PENDING 子项散落在 README / Post-Mortem / Demo-Video-Plan 三个文件，作者交付前若漏看任意一个就会撞 `<copy exact pillar name from A2>` 占位 → TA 判 RED。需要把这 4 项以 "AUTHOR ACTION REQUIRED" 形式集中登记到 PROCESS-LOG，并在 validator sign-off 加 grep gate。
2. **Submission zip path 只在 README 写了文字说明（"exclude node_modules / .env / output / dist"），没有可执行产物脚本**——作者要么手敲一长串 `zip -r ... -x ...` 命令（容易漏排除项），要么放弃 zip 走 GitHub link。需要 `assignments/homework7/build-submission.sh`（Bash，跨平台 git-bash 兼容）+ `npm run submission:zip` 入口，把 "决定 zip vs hosted" 收敛成一条命令。

---

## 2. Suggestions（可行方向）

### 方向 A: 进程脚本 + author-fill checklist + CHANGELOG 收束（推荐）

- 思路：纯 docs / 进程层落地：(1) 新增 `assignments/homework7/build-submission.sh` 打包脚本（process，不是 content）；(2) 新增 `npm run submission:zip` package.json 入口；(3) PROCESS-LOG.md 追加一条 R1 收尾条目，集中列 4 项 AUTHOR ACTION REQUIRED 并给出每项的具体 prompt；(4) CHANGELOG.md [Unreleased] 块追加 R0→R1 trajectory 条目（7/22 → 17/22）；(5) README §"How to Grade" 第 4 步加一行 ":4173 vs :5173" 澄清（feedback P2-1）。
- 涉及文件：
  - `assignments/homework7/build-submission.sh`（新建，~50 行 bash）
  - `package.json`（在 `scripts` 块加 `"submission:zip": "bash assignments/homework7/build-submission.sh"`）
  - `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md`（追加 R1 closeout 条目）
  - `CHANGELOG.md`（[Unreleased] 块追加 R0/R1 docs 收束 entry）
  - `README.md`（"How to Grade" 第 4 步追加 1 行 :4173 注释）
- scope：小（~120 LOC docs + bash，零代码改动）
- 预期收益：B2 verdict YELLOW→GREEN（在作者完成 4 项 author-fill 后；本 plan 把 author-fill 的"流程位"焊死，不让作者忘）；C5 FAIL → PASS（脚本即产物入口）
- 主要风险：bash 脚本在纯 Windows 无 git-bash 环境跑不动。**缓解**：脚本加 shebang `#!/usr/bin/env bash`，并在 README 注明 "requires git bash on Windows or any POSIX shell"——作者用的环境正是 git bash（CLAUDE.md 明示 shell: bash）。
- freeze 检查：OK（无新 tile / building / role / mood / mechanic / audio / UI panel；纯 process docs + bash 脚本）

### 方向 B: 仅追加 CHANGELOG 条目，等作者自己处理 zip + author-fill

- 思路：本轮只补一条 CHANGELOG 收束，不动其他文件，全靠作者下一步亲手 zip + 填 Post-Mortem。
- 涉及文件：仅 `CHANGELOG.md`
- scope：极小（~15 LOC）
- 预期收益：CHANGELOG 完整度满足 C2 末项；但 C5 FAIL 不动（作者依然要手敲 zip 命令），4 项 PENDING 也无 closeout gate。
- 主要风险：feedback §改进优先级 P0-4 明确点名要"决定 zip vs hosted"——本轮不解决，下轮 B2 复评依然挂 1 FAIL。
- freeze 检查：OK，但**收益不足**。

### 方向 C: 作者直接代填 Post-Mortem + Pillar 名字（FREEZE-VIOLATION × 软违规）

- 思路：让 LLM 从 CLAUDE.md / CHANGELOG / git log 反推 pillar 名字，把 Post-Mortem §1-§5 的散文一次性写满。
- 涉及文件：`Post-Mortem.md`、`README.md`
- scope：中（~200 LOC author-equivalent prose）
- 预期收益：表面 PENDING → PASS，verdict 跳 GREEN
- 主要风险：**FREEZE-VIOLATION（soft）**——TA HW7 §1.5 anti-LLM-polish 显式反对 LLM 填 §5 AI Tool Evaluation；R0 feedback §"自行扩展角度 1" 强调 "skeleton + author guidance" 是正确姿态，反向操作会破坏 R0 已建立的 anti-polish posture。即使技术上不触 hard freeze 的 tile/role/building/mechanic 字面定义，但触 HW7 spec 的 author-content rule，**实质等同 freeze-violation**。
- freeze 检查：**FREEZE-VIOLATION（HW7 §1.5）—— 不选定**

---

## 3. 选定方案

选 **方向 A**，理由：

- feedback §改进优先级 P0 列了 4 条，其中 1-3（pillar 名 / Post-Mortem 内容 / demo video）**只能作者本人完成**——本 plan 不替代，但显式把它们登记成 AUTHOR ACTION REQUIRED 流程节点；P0-4（zip vs hosted）是流程问题，**正是本轮该收束的**。
- 纯 docs + bash 脚本，零代码冲突，不动 src/，不动测试，符合 freeze。
- 帮 R2 reviewer 拿到一个干净的 GREEN 路径：作者跑 `npm run submission:zip` → 产出 `dist-submission/project-utopia-hw7.zip` → C5 FAIL → PASS；同时 PROCESS-LOG closeout 条目把剩余 author-fill 焊死成 validator gate。
- 方向 B 收益不足；方向 C 触 anti-polish 红线。

---

## 4. Plan 步骤

- [ ] **Step 1**: `assignments/homework7/build-submission.sh` — **add**（新建，~55 行 bash）
  - shebang `#!/usr/bin/env bash` + `set -euo pipefail`
  - 顶部 comment block 说明用途、依赖（bash + zip + git）、Windows 注意事项（git bash / WSL ok）
  - 步骤：
    1. `cd "$(git rev-parse --show-toplevel)"` 切根
    2. echo build commit (`git rev-parse --short HEAD`)、HW7 version 文字
    3. `npm ci --prefer-offline --no-audit` （优先用现存 lockfile）
    4. `npm run build`（产出 dist/）
    5. 校验 `dist/index.html` 存在；不存在则 `exit 2`
    6. `mkdir -p dist-submission/`
    7. `STAMP=$(date +%Y%m%d-%H%M%S)`、`OUT="dist-submission/project-utopia-hw7-${STAMP}.zip"`
    8. `zip -r "$OUT" . -x 'node_modules/*' -x '.git/*' -x '.env' -x '.env.*' -x 'output/*' -x 'dist-submission/*' -x '.playwright-cli/*' -x 'pw-help.txt' -x 'desktop-dist/*' -x '*.log'`（include `dist/` 让 grader 不必重 build）
    9. echo 产物路径 + 大小（`du -h "$OUT"`）
    10. echo 后续提示："Upload $OUT to Canvas, or push current branch to GitHub and submit URL instead."
  - 末尾 echo `=== AUTHOR ACTION REQUIRED ===` 块，列 4 项 PENDING（同 Step 3 内容），让作者每跑一次都看到 reminder
  - 文件权限：仓库只需作为文本 commit；脚本通过 `bash assignments/homework7/build-submission.sh` 显式调用，不依赖 +x 位（Windows git checkout 不保留 mode bit）

- [ ] **Step 2**: `package.json:scripts` — **edit**（在第 41 行 `"desktop:dist"` 之后追加一条 `npm run submission:zip` 入口）
  - 新增 line: `"submission:zip": "bash assignments/homework7/build-submission.sh"`
  - 注意：现有 line 41 末尾是 `}` —— 必须在前一行末尾加逗号
  - depends_on: Step 1（脚本必须先存在）

- [ ] **Step 3**: `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` — **edit**（文件末尾追加 R1 closeout 条目，~35 行）
  - 标题 `## 2026-05-01 — Round 1 closeout (B2-submission-deliverables enhancer plan)`
  - 一段说明：R0 RED 7/22 → R1 YELLOW 17/22 trajectory；剩余 5 项分类（4 PENDING author-fill + 1 FAIL submission format → 后者由 Step 1/2 闭环）
  - **AUTHOR ACTION REQUIRED — 4 ITEMS（必须在 final submit 前完成）**：
    1. **Pillar names + summaries**（README §"Highlights — Two Pillars" line 5-23 + Post-Mortem §1）
       - prompt：打开 `assignments/homework2/a2.md`，复制确切的 pillar 标题（不要 LLM 重命名）；每个 pillar 写 2-3 句技术摘要（你自己的话，引 1 个具体 `src/` 路径）。
       - grep gate：`grep -c "<copy exact pillar name from A2>" README.md assignments/homework7/Post-Mortem.md` 必须返回 0。
    2. **Post-Mortem §1-§5 实质内容**（all sections，author-prose）
       - prompt §1：4-8 句第一人称，引 ≥1 `src/` 路径 + 2-3 commit sha
       - prompt §2：从 HW6 user-study + PROCESS-LOG 拉真实 finding，每条 Action / Evidence / Status (DONE/PARTIAL/WON'T FIX/DEFERRED)
       - prompt §3：每个 sub-section 一段 narrative + 1 行 evidence；§3.1 worker AI 三次重写直接用 CLAUDE.md 的 `-2530 LOC FSM 重写故事`
       - prompt §4：按 "我计划 X / 做了 Y / 砍了 Z" 结构作答 3 道 question
       - prompt §5：**最危险**——TA §1.5 anti-LLM-polish 红线。**必须**亲手写，**必须**包含 1 个具体 LLM 失败故事（v0.9.0 utility scoring 上线后被 v0.10.0 全删的 -2530 LOC 教训是天然素材）。
       - grep gate：`grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md` 必须返回 0。
    3. **Demo video URL 回填**（拍 + 上传 + 同步 3 处）
       - prompt：按 `Demo-Video-Plan.md` §1-§4 录制 3-min video（7-shot 表已写好），上传 YouTube/Vimeo（**不要** unlisted-only，TA 要能看），把真实 URL 同步到：
         - `README.md` line ~92（`## Demo Video & Post-Mortem`）
         - `Post-Mortem.md` 顶部 "Demo Video" 节
         - `CHANGELOG.md` [Unreleased] 块
       - grep gate：`grep -c "pending — see Demo-Video-Plan" README.md` 必须返回 0。
    4. **Decide submission format**（zip OR GitHub URL）
       - 选项 A: 跑 `npm run submission:zip`（Step 1/2 已 land）→ 产出 `dist-submission/project-utopia-hw7-<stamp>.zip` → 上传 Canvas
       - 选项 B: 推 main 到 GitHub → 把 repo URL（带 commit sha 锚点）填进 Canvas
       - **二选一**，不要都交（避免 grader 困惑哪个是 authoritative）
       - grep gate（B 选项）：`git log -1 --format=%H` 已 push 到 origin/main
  - **VALIDATOR SIGN-OFF GATE**（在最终 submit 前必须全 0）：
    ```bash
    grep -rn "<copy exact pillar name from A2>" README.md assignments/homework7/ ; \
    grep -rn "AUTHOR:" assignments/homework7/Post-Mortem.md ; \
    grep -n "pending — see Demo-Video-Plan" README.md ; \
    test -f dist-submission/project-utopia-hw7-*.zip || git rev-parse origin/main
    ```
    任何一行有命中（除最后一行的 `test -f`/`git rev-parse` 必须有一个成功）→ 视为 NOT READY → 不准 submit。
  - depends_on: Step 1（最终 zip 路径需要脚本产出）

- [ ] **Step 4**: `CHANGELOG.md:3` `[Unreleased]` 块 — **edit**（在 line 3 标题下、line 5 现有 `### Polish` 子节之前，插入新子节 `### Docs (HW7 Round 0 → Round 1 — submission deliverables trajectory)`，~25 行）
  - bullet 1: R0 baseline 7/22 → R1 17/22 (+10 子项)；P0 五项结构性缺口（Post-Mortem skeleton / Demo-Video-Plan / README pillars+anchors / Quick Start fallback callout / How-to-Grade walkthrough）全部 land
  - bullet 2: B2 R0 plan rollback anchor `3f87bf4` → R1 plan rollback anchor `1f6ecc6`
  - bullet 3: R1 closeout 落地：`assignments/homework7/build-submission.sh` + `npm run submission:zip` 入口（C5 FAIL → PASS 的进程产物）
  - bullet 4: 4 项 PENDING 显式登记到 PROCESS-LOG 作 AUTHOR ACTION REQUIRED；validator sign-off grep-gate（pillar 占位 / `AUTHOR:` 注释 / video pending 字符串）
  - bullet 5: design intent 强调——R0 留 skeleton 是 anti-LLM-polish 的正确姿态（TA HW7 §1.5），R1 不替作者代填
  - 文件改动列表 sub-bullet：`assignments/homework7/build-submission.sh` (new) / `package.json` (1 line) / `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` / `README.md` (1 line) / `CHANGELOG.md` (本条)

- [ ] **Step 5**: `README.md:170` 附近 "How to Grade This Submission" 第 4 步 — **edit**（feedback P2-1 收束）
  - 在 `npx vite preview` 命令行后追加注释 `(Vite preview defaults to <http://localhost:4173>; the dev server uses :5173)`
  - 解决 grader 看到 README line 49 (`localhost:5173`) 与 line 170 附近 `vite preview` 默认 :4173 时的端口困惑
  - depends_on: 无（独立微调）

---

## 5. Risks

- **bash 脚本在纯 cmd.exe / PowerShell 7 无 bash 跑不动** —— 缓解：作者环境是 git bash（CLAUDE.md `Shell: bash`），脚本顶部 comment 显式注明 prerequisite；npm script 用 `bash assignments/...` 不用 `sh`，避免 dash 不兼容。Windows 上 git for windows 自带 zip 命令。
- **`npm ci` 在 zip 脚本内执行可能耗 30-60 秒** —— 实际作者本地已有 node_modules，可考虑加 `--prefer-offline`（已写入 Step 1）减少网络拉取。如果 lockfile drift 会失败 —— 缓解：脚本里 `set -e` 让 npm 失败即终止，作者会立刻看到错误。
- **作者依然漏读 PROCESS-LOG closeout 条目** —— 缓解：Step 1 脚本末尾打印 `=== AUTHOR ACTION REQUIRED ===` 块，每次跑 zip 都强迫作者看一次；同时 grep-gate 命令直接给出来，作者可以一行 paste 验证。
- **CHANGELOG 与 R0 已写的 A4-polish-aesthetic [Unreleased] 块顺序冲突** —— 缓解：Step 4 在 line 3 标题下、line 5 之前插入新子节，title `### Docs (...)` 与现有 `### Polish (...)` 并列，不动现有内容。
- **Submission zip 产物 size 可能 > 50MB（Canvas 上限多变）** —— 缓解：脚本 `du -h` 显示大小；如果作者发现超限，方向是改去 GitHub URL（选项 B 已写入 Step 3 prompt）。
- 可能影响的现有测试：**无**（纯 docs + bash 脚本 + package.json scripts 段无功能改动；`node --test` 不读这些路径，`vite build` 不依赖 submission script）

---

## 6. 验证方式

- 新增测试：**无**（纯 docs / process 改动）
- 手动验证：
  1. `ls assignments/homework7/build-submission.sh` → 文件存在
  2. `bash assignments/homework7/build-submission.sh` → 干跑产出 `dist-submission/project-utopia-hw7-<stamp>.zip`，无 error，末尾打印 AUTHOR ACTION REQUIRED 块
  3. `npm run submission:zip` → 同 (2)，确认 npm script 入口 wired up
  4. `unzip -l dist-submission/project-utopia-hw7-*.zip | head -20` → 无 `node_modules/`、无 `.env`、无 `output/`、无 `.git/`；含 `dist/`、`src/`、`README.md`、`CHANGELOG.md`、`assignments/homework7/`
  5. `grep -c "1f6ecc6" CHANGELOG.md` → ≥ 1（R1 rollback anchor 已登记）
  6. `grep -c "AUTHOR ACTION REQUIRED" assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` → ≥ 1
  7. `grep -n "4173" README.md` → 命中 ≥ 1 行（Step 5 追加的端口注释）
  8. **B2 R2 dry-run 心算**：22 子项 → C5 FAIL → PASS；4 PENDING 在作者完成 author-fill 后 → 4 PASS。预期 22/22 GREEN（作者动作完成的前提下）；本轮单看 enhancer 落地，预期 18/22（C5 PASS 进位）。
- FPS 回归：N/A（纯 docs / process）
- benchmark 回归：N/A
- prod build：`npx vite build` 无错（应不受影响，但 Step 1 的 `npm run build` 已内嵌验证）
- B2 复评 dry-run：人工对照 feedback 中 22 项 checklist —— 本轮 enhancer/implementer 落地后预期：PASS 18 / PENDING 4 / FAIL 0；author-fill 完成后即 22/22。

---

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）
- 由于本 plan 仅新增 1 个 bash 脚本 + 编辑 4 个 markdown / 1 个 json，回滚极轻量，无副作用风险

---

## 8. UNREPRODUCIBLE 标记

不适用——B2 R1 feedback 已通过 Playwright 复现 build 可达（screenshots/B2/01-game-loop.png），且剩余 1 FAIL（C5 submission format）是**进程缺失**的静态事实（`ls assignments/homework7/build-submission.sh` → no such file），无需 runtime 复现。剩余 4 PENDING 是文档占位符的静态事实（`grep -c "<copy exact pillar name from A2>" README.md` → > 0），同样无需 runtime 复现。
