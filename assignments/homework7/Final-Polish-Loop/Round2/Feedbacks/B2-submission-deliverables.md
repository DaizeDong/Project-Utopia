---
reviewer_id: B2-submission-deliverables
round: 2
date: 2026-05-01
verdict: YELLOW
score: 8
checklist_total: 22
checklist_pass: 18
checklist_pending: 4
checklist_fail: 0
build_url_works: true
post_mortem_path: assignments/homework7/Post-Mortem.md
demo_video_link: pending
---

## 总评

R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW **18/22** (+1)。R1 实现 (commit
9b77339) 落地 5 步：`assignments/homework7/build-submission.sh` (~119 LOC，
含 `set -euo pipefail`、`npm ci`、`npm run build`、`dist/index.html` 校验、
timestamped zip with excludes、`du -h` 报告、`AUTHOR ACTION REQUIRED` heredoc
含 4 项 grep gate)、`package.json` `submission:zip` 脚本入口 (line 42)、
PROCESS-LOG R1 closeout 段、CHANGELOG `### Docs (HW7 Round 0 → Round 1 ...)`
块、README line 170 双端口注释 (`:4173` preview vs `:5173` dev server)。

核对所有 R1 修复仍存在：
- `assignments/homework7/build-submission.sh` ✓ EXISTS (Glob 命中)
- `npm run submission:zip` ✓ wired (`package.json:42`)
- PROCESS-LOG `AUTHOR ACTION REQUIRED` ✓ 1 hit (4 sub-items 在 heredoc 内)
- README `4173` + `5173` 注释 ✓ line 170 双端口注释存在

C5 submission-format **由 R1 FAIL → R2 PASS** —— `submission:zip` 脚本 +
README "How to Grade" zip-vs-clone 双路径都已定形，作者还需选 zip / GitHub
之一并执行，但工程产物到位即可记 PASS。

剩余 4 PENDING 全是"作者亲手填"动作，不是 reviewer 该 fail 的工程缺陷：
README pillar 名 (3 hits)、Post-Mortem `<AUTHOR>` 注释 (6 hits)、demo video
URL (`pending — see Demo-Video-Plan` 仍在 README line 92)、author 选 zip
还是 GitHub。这些是 TA HW7 §1.5 anti-LLM-polish 红线下**只能由作者本人执行**
的事，R2 实现层不应该越界 auto-fill。

距 GREEN 仅 4 步，全在作者本地 30 分钟 + 1 个录制 session 内可收。

---

## C1 Final Build / Web Link

| 子项 | 状态 | 证据 |
|------|------|------|
| README 含 final build URL 或 build instruction | PASS | README §"How to Grade This Submission" line 162-178 给出 6-步 grader walkthrough；line 178 "若 zip" 路径加注 `npm ci && npx vite preview` from unzipped root。 |
| URL 可访问 | PASS | `browser_navigate http://127.0.0.1:5173/` 200 OK，Page Title=`Project Utopia`。`screenshots/B2/01-initial-load.png` 显示 Survival 模式 menu (`Survive as long as you can`) + Best Runs 排行榜 + Map Size config。 |
| menu → 进游戏 → 玩 → 退出 game loop | PASS | `Start Colony` 按钮可点 (`evaluate clicked: true`)，进入后 Build Tools sidebar (Road/Farm/Lumber/Warehouse/Wall/Bridge/Demolish/Quarry/Herbs/Kitchen/Smithy/Clinic) + Resource HUD (315 food, 34 wood, 15 stone, 12 herbs) + Speed controls (⏸▶⏩⏭) + Entity Focus (20 workers/wildlife) + AI Log button + Run timer 跑到 00:00:08。无 console error。`screenshots/B2/02-game-loop.png` |
| README build instruction 与 actual build 行为一致 | PASS | README line 49 `localhost:5173` + line 170 `localhost:4173` 双 URL 在 R1 已显式区分 (`Vite preview defaults to :4173; the Vite dev server (npx vite / npm start) instead uses :5173`) — 与本次 :5173 启动一致；grader 路径独立可重现。 |

---

## C2 Source Code + README

| 子项 | 状态 | 证据 |
|------|------|------|
| README 项目简介 | PASS | line 3 一句话介绍 (Three.js + tile-based + LLM-AI layer + A* + Boids)。 |
| README setup / run instruction | PASS | line 31-49 Quick Start，three launch path (`npm start` / `dev:full` / `start:prod`)。 |
| README final build instruction | PASS | line 56-64 列出 `npm run build` 等；line 167 6-步 grader walkthrough；line 178 zip 路径明确。 |
| README 解释了**核心两个 pillar** | **PENDING** | R0 加结构 (line 5-23 `## Highlights — Two Pillars`)。`grep "<copy exact pillar name from A2>" README.md` → **2 hits** (line 12, 18) — pillar 名仍是占位。**结构 PASS，作者填充 PENDING**。 |
| README 引用 demo video link | PASS | line 90-92 `## Demo Video & Post-Mortem` → `Demo-Video-Plan.md`，video 显式标 "pending"。 |
| README 引用 post-mortem | PASS | 6 处命中：line 16, 21, 23, 93, 172, Highlights 跳转。 |
| README 避免 "lorem ipsum / TODO / Coming Soon" 残留 | PASS | grep 仅命中 placeholder 标记 (`<copy exact pillar name from A2>`) — 这是显式 author-fill 注释，不是 LLM 模板词。无 lorem / coming soon。 |
| CHANGELOG 覆盖到当前版本 | PASS | line 1-46 `[Unreleased] — HW7 Final Polish Loop Round 1`，line 47 `### Docs (HW7 Round 0 → Round 1 — submission deliverables trajectory)` 子节，line 107+ Round 0 块。HEAD 是 `3f87bf4` (v0.10.1-m balance overhaul + AI decision improvements)，对应版本块在 changelog 里有覆盖。 |

---

## C3 Final Demo Video

| 子项 | 状态 | 证据 |
|------|------|------|
| post-mortem / README 中存在 video link | **PENDING** | `Demo-Video-Plan.md` (62 LOC, frontmatter `status: pending`) 完整：§1 recording window + 6 项 pre-flight、§2 7-shot 表 (timecodes 0:00-3:00)、§3 voiceover 决策、§4 post-upload 三处同步 checklist。README line 92 指向。**plan 在 → status pending (非 missing)**。 |
| video 时长 claim 在 2-4 分钟 | PASS (claim) | `target_length_minutes: 3` / `target_length_max_minutes: 4` —— 落在 HW7 §3 "2 to 4 minutes" 范围。 |
| 描述提到 "complete game loop showcase" | PASS (claim) | shot 1-2 (title + 30s game loop) + shot 5 (survival end-state) + shot 7 (end card) 涵盖 menu → core → end。 |
| 描述提到 "two pillars demonstration" | PASS (claim) | shot 3 (0:30-1:15 Pillar A live map editing → reroute) + shot 4 (1:15-2:00 Pillar B LLM-driven AI Trace)。两条 shot 显式 cross-reference Post-Mortem §1 Pillar A/B。 |
| 描述提到 voiceover / text overlay | PASS (claim) | §3 显式列 voiceover 与 caption，标 "voiceover preferred since Pillar B requires explaining AI Trace"。 |

---

## C4 Post-Mortem 内容核对

| 子节 | 是否存在 | 内容质量 | 改进建议 |
|------|----------|----------|----------|
| **整份 Post-Mortem.md 文件存在性** | **EXISTS** (219 LOC, 含 §4.5 hard-freeze deferrals) | skeleton — section heading 齐全 + §4.5 已实质填写 (audio + walk cycle deferrals) | R1 已落，§4.5 是唯一已完整成段的子节 |
| §1 Brief overview of two pillars | 结构 EXISTS / 内容 PENDING | Pillar A/B 名仍 `<copy exact pillar name from A2>`；4 道 guiding question；作者答案缺 | 作者从 `assignments/homework2/a2.md` 复刻 pillar 名；4-8 句第一人称回答；引 1+ `src/` 路径 + 2-3 commit sha |
| §2 Playtest Resolution | 结构 EXISTS / 内容 PENDING | 表头齐全；1 行 example；正文行待填 | 从 HW6 user-study + PROCESS-LOG 拉真实 finding；DONE/PARTIAL/WON'T FIX/DEFERRED 不可漏报 |
| §3 Architectural Challenges | 结构 EXISTS / 内容 PENDING | 4 sub-section：worker AI 三次重写 / LLM proxy 容错 / 长程 benchmark / release:strict freshness gate；prompt + evidence anchor 齐全 | 每节 1 段 narrative + 1 行 evidence；CLAUDE.md 给的 -2530 LOC FSM 重写故事是 §3.1 天然素材 |
| §4 Pivots & Cuts from A2 MVP | 结构 EXISTS / 内容 PENDING | 3 道 question (survival vs cut victory loop / wildlife scope / multi-LLM persona) 已立题 | "我计划 X，做了 Y，砍了 Z" 结构作答 |
| §4.5 Hard-Freeze Deferrals | **EXISTS, 内容完整** | audio + walk cycle 两条 deferred items，scoped/sized/parked，未来工时估算 (audio ≈4h) | R1 plan 已落实，无需作者改 |
| §5 AI Tool Evaluation | 结构 EXISTS / 内容 PENDING | TA §1.5 anti-polish AUTHOR comment 已显式注入；4 项 required element 列出 | **此节最危险**：必须亲手写。强烈建议引 v0.9.0 utility scoring → v0.10.0 -2530 LOC 删除作为 LLM 失败案例 |

**结论**：7 子项中 6 PENDING (作者填) + 1 EXISTS-完整 (§4.5)。R0/R1 实现严格按
plan 走 skeleton path，没让 LLM 替作者编造经历，**这是正确选择** (TA §1.5 红线)。

---

## C5 Submission Format

| 子项 | 状态 | 证据 |
|------|------|------|
| 所有 report 都是 markdown | PASS | Post-Mortem.md / Demo-Video-Plan.md / README.md / CHANGELOG.md / PROCESS-LOG.md / build-submission.sh 内的 reminder 块 都 .md 或 .sh 文本。 |
| 提交内容包含 zip 或 hosted link 二者之一 | **PASS** (R1 升级) | R1 新增 `assignments/homework7/build-submission.sh` (119 LOC) + `npm run submission:zip` (`package.json:42`)。脚本流程：`set -euo pipefail` → repo root cd → `npm ci --prefer-offline` → `npm run build` → `dist/index.html` 校验 → `dist-submission/project-utopia-hw7-<stamp>.zip` (with excludes: `node_modules/`, `.git/`, `.env*`, `output/`, `dist-submission/`, `.playwright-cli/`, `pw-help.txt`, `desktop-dist/`, `*.log`) → `du -h` 报告 → `AUTHOR ACTION REQUIRED` heredoc。**形态、产物路径、grep gate 全到位**；作者尚需选 zip / GitHub URL 二者之一并执行 (这一步 reviewer 替不了)，但**工程层 PASS**。 |

---

## R1 修复回归核对 (verify R1 still landed)

R1 plan §4 五步全部仍在 R2 仓库中：

| R1 Step | 验证命令 | 结果 |
|---------|----------|------|
| 1. `assignments/homework7/build-submission.sh` 存在 | `Glob` | ✓ 命中 (119 LOC) |
| 2. `package.json` `submission:zip` 入口 | `grep submission:zip` | ✓ line 42: `"submission:zip": "bash assignments/homework7/build-submission.sh"` |
| 3. PROCESS-LOG `AUTHOR ACTION REQUIRED` | `grep -c` | ✓ 1 hit (4 sub-items 在 heredoc 内) |
| 4. CHANGELOG `### Docs (HW7 Round 0 → Round 1)` 子节 | `grep ^### Docs` | ✓ line 47 命中 |
| 5. README line 170 `:4173` + `:5173` 双端口注释 | `grep 4173\|5173` | ✓ line 49 (`:5173` dev) + line 170 (`:4173` preview, dev :5173) |

**全部 5 项 R1 修复回归 PASS**。无 R1 实现被覆盖 / 撤回的迹象。

---

## 自行扩展角度

### 1. R1 build-submission.sh 是 R0/R1 升级最大的工程产物 (FAIL → PASS)

R0 时 C5 唯一 FAIL 子项 ("提交内容包含 zip 或 hosted link") 在 R1 通过 119
LOC bash 脚本 + 1-line `package.json` 入口闭环。脚本 4 项亮点：
1. 真正幂等：`set -euo pipefail` + `git rev-parse --show-toplevel` cd + `dist/index.html`
   校验 (exit 2 if missing) — 即使作者 cwd 不在仓库根也工作。
2. exclude 列表覆盖了所有"会污染交付产物"的目录：`node_modules/` (解决主要包大小)、
   `.env*` (secret 防泄)、`output/` (本地 debug)、`.playwright-cli/` + `pw-help.txt`
   (Playwright 驻留)、`desktop-dist/` (Electron 旧产物)、`*.log` (随时再生)。
3. `AUTHOR ACTION REQUIRED` heredoc 把 4 项 PENDING 显式列在脚本输出末尾 + 给出
   grep gate (`<copy exact pillar name from A2>` 必须 0 / `AUTHOR:` 必须 0 /
   `pending — see Demo-Video-Plan` 必须 0)。作者运行 `npm run submission:zip`
   后自动看到 reminder，不需要二次查 PROCESS-LOG。
4. "Upload OR push to GitHub — not both" 警告写在 stdout 里 — 直接对应 P0-4 的
   submission-format 决定。

唯一可改进点：脚本依赖 git-bash on Windows / WSL / POSIX bash。如果作者 grader
是纯 PowerShell 用户，脚本会 fail。但 README §"How to Grade" 明示路径是
`npm ci && npx vite preview` 而不是 zip 解包，所以这个限制不影响 grader 路径。

### 2. R2 没有为 anti-LLM-polish 红线"擅自越界" — 这是正确的 process discipline

R1 commit message 明确 "anti-LLM-polish (TA HW7 §1.5) check: PRESERVED"。
R2 review 验证：

- README pillar 名仍是 `<copy exact pillar name from A2>` (3 hits, line 12 + 18)
- Post-Mortem `AUTHOR:` 注释仍 6 hits
- 这些**不是缺陷，是 design intent**。

如果 R2 实现层"贴心"用 LLM 生成 pillar 名 + playtest finding + AI tool 故事，
TA §1.5 反 LLM polish 红线会一眼看穿 (TA 原话："注意：评估者会注意到 LLM
生成的稿子味")。当前状态强制作者亲手填，反而是更安全的 submission posture。

唯一风险：作者忘了填就交。`build-submission.sh` heredoc 已经把 4 个 grep gate
列在 stdout，作者跑 `npm run submission:zip` 必然看到。这个机制比 R0 plan 的
"在 PROCESS-LOG 加 reminder" 更稳 — reminder 在交付时刻强制呈现。

### 3. R1 README port 注释解决了 R0 plan 的 P2-1 项

R0 feedback P2-1 标 "README line 168-170 'How to Grade' 第 4 步加一行 (Vite
preview defaults to http://localhost:4173)"。R1 step 5 实现这一点，且做得比
plan 还好：plan 只要求加 `(:4173)` 注释，R1 实际写成 `Vite **preview** defaults
to http://localhost:4173; the Vite **dev server** (npx vite / npm start) instead
uses http://localhost:5173`，明确把两个端口的语义都说清楚。grader 不再有
"为什么 README line 49 说 5173 但 line 170 提到 4173" 的困惑。

P2-1 由 R1 关闭。

---

## 改进优先级

### P0 (final submission 前必须收尾，**作者本人执行**)

1. **README "Highlights — Two Pillars" pillar 名字与 summary** — 从
   `assignments/homework2/a2.md` 复刻 pillar 原名 (line 12 + 18)，写 2-3 句
   作者本人 voice 的 summary，cite ≥1 `src/` 路径。验证：
   `grep -c "<copy exact pillar name from A2>" README.md` 必须为 0。
2. **Post-Mortem.md §1-§5 实质内容填充** — 6 处 `AUTHOR:` 注释清零。重点
   §5 AI Tool Evaluation：必须亲手写，含 1+ 具体 LLM 失败故事 (v0.9.0
   utility scoring → v0.10.0 -2530 LOC 全删是天然素材)，否则撞 TA §1.5
   anti-polish 红线。验证：`grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md`
   必须为 0。
3. **录 demo video 并回填 URL** — 按 `Demo-Video-Plan.md` §1-§4 (7-shot 表)
   录 3 分钟视频，YouTube/Vimeo 上传 (确保 grader 可视，**不要 unlisted-only**)。
   同步 URL 到三处：README line 92 + Post-Mortem.md "Demo Video" 节 + CHANGELOG
   `[Unreleased]` 块。验证：
   `grep -c "pending — see Demo-Video-Plan" README.md` 必须为 0。
4. **决定 submission format (ONE of two)** — 选项 A: `npm run submission:zip`
   生成 zip 上传 Canvas；选项 B: 推 main 到 GitHub，submit repo URL +
   commit sha anchor。**只交一份，避免 grader 两份不知道哪份 authoritative**。

### P1 (存在但不达标)

1. closeout 前 grep `<copy exact pillar name from A2>` / `AUTHOR:` /
   `pending — see Demo-Video-Plan` —— 全 0 才可 submit。`build-submission.sh`
   heredoc 已经把这 3 条 grep gate 写进 stdout 提醒。
2. `Demo-Video-Plan.md` §4 post-upload checklist 在 video 上传后必须按 4 步
   一次 commit (设 status: published / 加 url 到 frontmatter / sync README +
   Post-Mortem + CHANGELOG / 验证 incognito 可视)。

### P2 (细节)

1. CHANGELOG `[Unreleased] HW7 Final Polish Loop Round 1` 块当前覆盖到 R1
   end of 2026-05-01；如果 author-fill 在 2026-05-02 进行，需要追加一条
   `### Docs (HW7 Round 1 → Round 2 — author-fill)` 子节，记录：(a) pillar
   名敲定 / (b) Post-Mortem 内容 fleshed out / (c) demo video URL 同步。
2. `Demo-Video-Plan.md` frontmatter `platform: TBD` 在录制前应敲定为
   `YouTube unlisted` 或 `Vimeo`，免得 P0-4 决定时反复改文件。

---

## 结论

**Verdict: YELLOW** (score 8 / 10)

22 子项：**PASS 18 / PENDING 4 / FAIL 0**

- PASS 18：所有结构 / 工程 / build / submission-format 工程层全到位 (R1 +1)。
- PENDING 4：Pillar 名 + Post-Mortem 内容 + Demo video URL + Submission format
  最终决定 — 全是"作者亲手填 / 录 / 选"动作，**不是 reviewer 这一轮该 fail
  的工程缺陷**。
- FAIL 0：R1 把 R0 的唯一 FAIL (submission format 工程产物缺) 通过
  `build-submission.sh` + `npm run submission:zip` 闭环。

R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22 (累计 +11)。

距离 GREEN 的最短路径：**作者本人完成 P0 第 1-4 条** (≈30 分钟 admin work
+ 1 个 3-min recording session)。当 README pillar 名是真实文字、Post-Mortem
6 处 `AUTHOR:` 注释清零、demo video 有真 URL、`npm run submission:zip` 产物
出现在 Canvas (或 GitHub URL submitted) 时，submission 即可 GREEN，无需
reviewer 再次介入。

**关键判断**：R1 的实现选择 "build-submission.sh + 4-item author gate" 而不是
"擅自 LLM-fill pillar 名/post-mortem 内容" 是正确的 process discipline。R2
review 不应越界。当前 PENDING 状态本身不是 bug，是 design intent (TA HW7 §1.5
anti-LLM-polish 红线下的安全 posture)。

R1 的 5 项工程修复 (build-submission.sh / npm script / PROCESS-LOG / CHANGELOG /
README port 注释) 全部在 R2 仓库中**完整保留无回退**。
