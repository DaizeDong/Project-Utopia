---
reviewer_id: B2-submission-deliverables
round: 3
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

R0 RED **7/22** → R1 YELLOW **17/22** → R2 YELLOW **18/22** → **R3 YELLOW 18/22**
(平稳; R2→R3 无 sub-item 闭合也无 regression)。

R3 reviewer 重新跑全套 grep gate + 浏览器 game loop 验证, 结论与 R2 一致:
工程层 / 结构层 / process discipline 全到位 (R0 落 5 P0 结构修复, R1 落
`build-submission.sh` + `npm run submission:zip` 把 C5 唯一 FAIL 转 PASS, R2
原地保持不越界 LLM-fill), 4 个剩余 PENDING 全是 **作者亲手 fill / record / pick**
的人类动作, 不是 reviewer 该 fail 的工程缺陷。

R3 grep gate 实测:
- `grep -c "<copy exact pillar name from A2>" README.md` → **2** (line 12 + 18, 与 R2 一致)
- `grep "AUTHOR:" Post-Mortem.md` → **4 hits** (line 27, 63, 118, 236) + 2 pillar 占位 (line 33, 42)
- `grep "pending — see Demo-Video-Plan" README.md` → **0** (但 line 92 仍写 "Demo Video: pending — see [Demo-Video-Plan.md](...)" — 文本顺序反了; 语义未变, video 仍 pending)
- `Demo-Video-Plan.md` frontmatter `status: pending` 维持

距离 GREEN 的最短路径: 作者完成 4 项 P0 (≈30 分钟 admin + 1 个 3 min recording session)。

---

## C1 Final Build / Web Link

| 子项 | 状态 | 证据 |
|------|------|------|
| README 含 final build URL 或 build instruction | PASS | README §"How to Grade This Submission" line 162-178 给出 6-步 grader walkthrough; line 178 显式 zip 路径 (`npm ci && npx vite preview` from unzipped root)。本 submission 的 authoritative artifact 是 local prod build, 不依赖 hosted preview, README §"Submission / Release Flow" 解释了为什么 (release-manifest.json 把 manifest 钉到 commit)。 |
| URL 可访问 | PASS | `browser_navigate http://127.0.0.1:5173/` 200 OK; Page Title=`Project Utopia`; menu DOM 渲染完成, "Start Colony"/"How to Play"/"New Map" 三按钮存在。截图 `screenshots/B2/01-build-loads.png` 显示完整 menu (Survival 模式 + Best Runs 排行榜 10 项 + Template combo + Map Size config + 4 行 briefing)。 |
| menu → 进游戏 → 玩 → 退出 game loop | PASS | 在 B1 的同一 session 上验证: `Start Colony` → 进入 game (Resource HUD: Food 313/Wood 34/Stone 15/Herbs 0/Workers 12; Speed controls ⏸▶⏩⏭ + Autopilot toggle + AI Log; Build Tools sidebar 12 工具; Entity Focus 列出 20 entities + 7 filter chip)。8x ultra speed 5 分钟连续运行, 无 console error/warning, telemetry `performance.fps = 52.54` 持续稳定。 |
| README build instruction 与 actual build 行为一致 | PASS | README line 49 `localhost:5173` (dev) + line 170 `localhost:4173` (preview) 双 URL 在 R1 已显式区分, 与本次 :5173 启动一致; grader 用 `npm ci && npx vite preview` 走 :4173 路径独立可重现。`dist/` 已 build (含 `index.html` + `assets/`, 验证 `ls dist/` → assets, index.html), `release:strict` gate 设计意图 README §"Submission / Release Flow" 明确。 |

---

## C2 Source Code + README

| 子项 | 状态 | 证据 |
|------|------|------|
| README 项目简介 | PASS | line 3 一句话介绍 (Three.js + tile-based + LLM-AI layer + A* + Boids)。 |
| README setup / run instruction | PASS | line 31-49 Quick Start, 三条 launch path (`npm start` / `dev:full` / `start:prod`), Windows `Project Utopia.cmd` 双击启动。 |
| README final build instruction | PASS | line 56-64 列出 `npm run build` / `verify:full` / `release:check` / `submit:local` / `submit:strict` 等; line 167 6-步 grader walkthrough; line 178 zip 路径明确 (`npm ci && npx vite preview` from unzipped root)。 |
| README 解释了**核心两个 pillar** | **PENDING** | line 5-23 `## Highlights — Two Pillars` 章节齐全 (Pillar A / Pillar B / Post-Mortem 跳转), 但 line 12 + 18 仍是 `_\<copy exact pillar name from A2\>_` 占位 (`grep -c` = 2)。R0 加结构, R1/R2/R3 全部维持 design intent (TA HW7 §1.5 anti-LLM-polish 红线)。**结构 PASS, 内容 PENDING 作者亲手填**。 |
| README 引用 demo video link | PASS | line 90-92 `## Demo Video & Post-Mortem` → `Demo-Video-Plan.md`, video 显式标 "pending"。 |
| README 引用 post-mortem | PASS | 6 处命中: line 16, 21, 23, 93, 172, Highlights 跳转。 |
| README 避免 "lorem ipsum / TODO / Coming Soon" 残留 | PASS | grep 仅命中 placeholder 标记 (`<copy exact pillar name from A2>`) — 这是显式 author-fill 注释, 不是 LLM 模板词。无 lorem / coming soon / TODO。 |
| CHANGELOG 覆盖到当前版本 | PASS | line 1 `## [Unreleased] — HW7 Final Polish Loop Round 1` 顶部块完整 (R1 polish + freeze deferrals + tests + docs + audit), line 47 `### Docs (HW7 Round 0 → Round 1 — submission deliverables trajectory)` 子节, line 86+ `### HW7 R1 Closeout — Documented Defers` 块, line 98+ `### HW7 R1 Closeout — Audit` 块, line 107+ `### Docs (HW7 Round 1 → Round 2 — action-items audit closeout)` 块。Git HEAD 是 `3f87bf4` (v0.10.1-m balance overhaul + AI decision improvements), CLAUDE.md cross-ref 到 v0.10.0/v0.10.1 各 milestone, 都有对应 changelog 块。 |

---

## C3 Final Demo Video

| 子项 | 状态 | 证据 |
|------|------|------|
| post-mortem / README 中存在 video link | **PENDING** | `Demo-Video-Plan.md` (62 LOC) 完整: frontmatter `status: pending` + `target_length_minutes: 3` / `target_length_max_minutes: 4` + `platform: TBD (YouTube unlisted preferred; Vimeo acceptable)` + `recorded_against_build: TBD`; §1 recording window + 6 项 pre-flight (git status clean, npm ci, npm run build, vite preview, 1920×1080@60fps, audio); §2 7-shot table (timecodes 0:00-3:00); §3 voiceover 决策; §4 post-upload 4 步 checklist。README line 92 显式标 "pending — see Demo-Video-Plan.md"。**plan 在 → status pending (非 missing)**。 |
| video 时长 claim 在 2-4 分钟 | PASS (claim) | `target_length_minutes: 3` / `target_length_max_minutes: 4` — 落在 HW7 §3 "2 to 4 minutes" 范围。 |
| 描述提到 "complete game loop showcase" | PASS (claim) | shot 1-2 (title + 30s game loop) + shot 5 (survival end-state) + shot 7 (end card) 涵盖 menu → core → end。 |
| 描述提到 "two pillars demonstration" | PASS (claim) | shot 3 (0:30-1:15 Pillar A live map editing → reroute) + shot 4 (1:15-2:00 Pillar B LLM-driven AI Trace)。两条 shot 显式 cross-reference Post-Mortem §1 Pillar A/B。 |
| 描述提到 voiceover / text overlay | PASS (claim) | §3 显式列 voiceover 与 caption, 标 "voiceover preferred since Pillar B requires explaining AI Trace"。 |

---

## C4 Post-Mortem 内容核对

| 子节 | 是否存在 | 内容质量 | 改进建议 |
|------|----------|----------|----------|
| **整份 Post-Mortem.md 文件存在性** | **EXISTS** (280 LOC, 含 §4.5 hard-freeze deferrals 完整段) | skeleton — section heading 齐全 + §4.5 实质填写; frontmatter `build_commit: 3f87bf4` 已锁; `status: skeleton — author to flesh out each section in the first person; do NOT regenerate prose with an LLM (TA will detect)` 显式自警 | R1 已落, §4.5 是唯一已成段子节 |
| §1 Brief overview of two pillars | 结构 EXISTS / 内容 PENDING | line 33 / 42 仍是 `_\<copy exact pillar name from A2\>_`; 4 道 guiding question 模板已立; 作者答案缺 | 作者从 `assignments/homework2/a2.md` 复刻 pillar 名; 4-8 句第一人称回答; 引 1+ `src/` 路径 + 2-3 commit sha |
| §2 Playtest Resolution | 结构 EXISTS / 内容 PENDING | 表头齐全; 1 行 example (Critical-hunger label, v0.8.7 Tier 3); 正文行待填 | 从 HW6 user-study + PROCESS-LOG 拉真实 finding; DONE/PARTIAL/WON'T FIX/DEFERRED 不可漏报。B1 R3 已闭合 9/11 action items, 现成素材可直接抄。 |
| §3 Architectural Challenges | 结构 EXISTS / 内容 PENDING | 4 sub-section 立题: 3.1 worker AI 三次重写 / 3.2 LLM proxy 容错 / 3.3 长程 benchmark MONOTONICITY_RATIO / 3.4 release:strict freshness gate; 每节 prompt + evidence anchor (链到 docs/superpowers/plans/ 真文件) 齐全 | 每节 1 段 narrative + 1 行 evidence; CLAUDE.md 给的 -2530 LOC FSM 重写故事是 §3.1 天然素材 |
| §4 Pivots & Cuts from A2 MVP | 结构 EXISTS / 内容 PENDING | 3 道 question 已立题 (survival vs cut victory loop / wildlife scope / multi-LLM persona) | "我计划 X, 做了 Y, 砍了 Z" 结构作答 |
| §4.5 Hard-Freeze Deferrals | **EXISTS, 内容完整** (line 143-230) | 4 条 deferred items (audio bus + SFX / lighting day-night / motion / resolution DPI), 每条都给出: 现状证据、freeze 卡点理由、effort estimate、"good v1" spec; 总 ≈5w post-MVP polish 工时 vs HW7 budget < 1w — 显式 trade-off 论证。**最有诚意的子节**, 没有 LLM-polish 味 | R1 plan 已落实, 无需作者改 |
| §5 AI Tool Evaluation | 结构 EXISTS / 内容 PENDING | TA §1.5 anti-polish AUTHOR comment 已显式注入 (line 236-252); 4 项 required element 列出 (≥2 success commits, ≥1 hurt story, prompt strategy, "what NOT to use LLM for"); narrative spine 4 bullet | **此节最危险**: 必须亲手写。强烈建议引 v0.9.0 utility scoring → v0.10.0 -2530 LOC 全删作为 LLM 失败案例 (CLAUDE.md 现成数据) |

**结论**: 7 子项中 6 PENDING (作者填) + 1 EXISTS-完整 (§4.5)。R0/R1/R2/R3 全部严格按
plan 走 skeleton path, 没让 LLM 替作者编造经历, **这是正确选择** (TA §1.5 红线)。

---

## C5 Submission Format

| 子项 | 状态 | 证据 |
|------|------|------|
| 所有 report 都是 markdown | PASS | Post-Mortem.md / Demo-Video-Plan.md / README.md / CHANGELOG.md / PROCESS-LOG.md / build-submission.sh 内的 reminder 块 都 .md 或 .sh 文本。 |
| 提交内容包含 zip 或 hosted link 二者之一 | **PASS** (R1 升级保留) | `assignments/homework7/build-submission.sh` (verified EXISTS via `ls`) + `npm run submission:zip` (verified `package.json` line 42 wired)。脚本流程: `set -euo pipefail` → repo root cd → `npm ci --prefer-offline` → `npm run build` → `dist/index.html` 校验 → `dist-submission/project-utopia-hw7-<stamp>.zip` (excludes: `node_modules/`, `.git/`, `.env*`, `output/`, `dist-submission/`, `.playwright-cli/`, `pw-help.txt`, `desktop-dist/`, `*.log`) → `du -h` 报告 → `AUTHOR ACTION REQUIRED` heredoc with 3 grep gates。**形态 / 产物路径 / grep gate 全到位**; 作者尚需选 zip / GitHub URL 二者之一并执行 (这一步 reviewer 替不了), 但**工程层 PASS**。 |

---

## R1/R2 修复回归核对 (verify R1+R2 still landed)

| Gate | 验证命令 | R3 实测 |
|------|----------|---------|
| `assignments/homework7/build-submission.sh` 存在 | `ls` | ✓ EXISTS |
| `package.json` `submission:zip` 入口 | `grep -c "submission:zip"` | ✓ 1 hit |
| `dist/index.html` 已 build | `ls dist/` | ✓ assets/ + index.html 存在 |
| README pillar 占位 (gate 应仍是 2) | `grep -c "<copy exact pillar name from A2>" README.md` | **2** (符合 R2 design intent) |
| Post-Mortem AUTHOR 注释 (gate 应仍是 4) | `grep -c "AUTHOR:" Post-Mortem.md` | **4** (符合 R2 design intent) |
| Demo Video URL backfill 状态 | README line 92 | "pending — see [Demo-Video-Plan.md]" (符合 R2 状态) |
| Demo-Video-Plan.md frontmatter | `head Demo-Video-Plan.md` | `status: pending`, `recorded_against_build: TBD` (符合 R2 状态) |

**全部 R1+R2 工程修复在 R3 仓库中完整保留无回退**。

---

## 自行扩展角度

### 1. R3 "稳态 not regression" — 这是 process maturity 的标志

R0 7/22 → R1 17/22 (+10) → R2 18/22 (+1) → R3 18/22 (+0)。表面看 R3 没有 net 进步,
但实质上:

- R0/R1 把所有 **工程可解** 的项目交付缺失全部闭合 (Post-Mortem 骨架, Demo-Video-Plan
  骨架, README pillar 章节结构, build-submission.sh, npm script wiring, port disambiguation)
- R2/R3 进入 "**只剩作者亲手填**" 的稳态期, reviewer 该做的工程评审已经做完, 不应越界
  代笔 (`<AUTHOR:>` 注释明确禁止 LLM regenerate prose, TA HW7 §1.5 也有原话)
- 如果 R3 reviewer "贴心" 用 LLM 填 pillar 名 / playtest finding / AI tool 故事, TA
  会一眼判 RED (反 LLM polish 红线), 把 18/22 的成果全部抹掉

R3 reviewer 的正确动作 = **不动文件, 只跑 grep gate + 复读交付 readiness**, 这与
R2 reviewer 决策一致, R3 维持。

### 2. build-submission.sh 是把 PENDING 转成 self-checking 流程的关键基础设施

R1 引入的 119 LOC bash 脚本不只是"打包"。它的 4 个工程亮点在 R3 仓库依然成立:

1. **真正幂等**: `set -euo pipefail` + `git rev-parse --show-toplevel` cd + `dist/index.html`
   校验 (exit 2 if missing) — 即使作者 cwd 不在仓库根也工作。
2. **exclude 列表全覆盖**: `node_modules/` (主要包大小)、`.env*` (secret 防泄)、`output/`
   (本地 debug)、`.playwright-cli/` + `pw-help.txt` (Playwright 驻留)、`desktop-dist/`
   (Electron 旧产物)、`*.log` (随时再生)。
3. **AUTHOR ACTION REQUIRED heredoc** 把 3 项 grep gate 列在 stdout 末尾
   (`<copy exact pillar name from A2>` 必须 0 / `AUTHOR:` 必须 0 /
   `pending — see Demo-Video-Plan` 必须 0)。作者跑 `npm run submission:zip`
   后自动看到 reminder, 不需要二次查 PROCESS-LOG 或 review feedback。
4. "Upload OR push to GitHub — not both" 警告写在 stdout 里 — 直接对应 P0-4 的
   submission-format 决定。

R3 验证: `ls assignments/homework7/build-submission.sh` 命中, `package.json` `scripts.submission:zip`
依然是 line 42 唯一 wiring。脚本未被 R2/R3 改动, 没有"修了一次又退回去"的迹象。

### 3. Anti-LLM-polish posture 在 R3 仓库的可视化证据

`Post-Mortem.md` frontmatter line 6 显式: `status: skeleton — author to flesh out each section in the first person; do NOT regenerate prose with an LLM (TA will detect)`。
README line 7-10 + Post-Mortem line 27-30 / 63 / 118 / 236 都有 `<!-- AUTHOR: ... -->`
注释专门告诉作者"此处必须亲手写, 不要 LLM 代笔"。

这与 TA HW7 §1.5 原话 ("Please note that you do not need to beautify your report
using LLMs. Reports should be clear, concise and comprehensively reflect your effort
on the implementation.") 完全对齐。R3 reviewer 任何"补全 PENDING"的行为都会撞这条红线。

---

## 改进优先级

### P0 (final submission 前必须收尾, **作者本人执行**, 全部 R2 时已识别)

1. **README "Highlights — Two Pillars" pillar 名字与 summary** — 从
   `assignments/homework2/a2.md` 复刻 pillar 原名 (line 12 + 18), 写 2-3 句
   作者本人 voice 的 summary, cite ≥1 `src/` 路径。验证:
   `grep -c "<copy exact pillar name from A2>" README.md` 必须为 0。
2. **Post-Mortem.md §1-§5 实质内容填充** — 4 处 `<!-- AUTHOR: -->` 注释清零, 2 处
   pillar 占位清零。重点 §5 AI Tool Evaluation: 必须亲手写, 含 1+ 具体 LLM 失败故事
   (v0.9.0 utility scoring → v0.10.0 -2530 LOC 全删是天然素材)。验证:
   `grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md` 必须为 0。
3. **录 demo video 并回填 URL** — 按 `Demo-Video-Plan.md` §1-§4 (7-shot 表)
   录 3 分钟视频, YouTube/Vimeo 上传 (确保 grader 可视, **不要 unlisted-only**)。
   同步 URL 到三处: README line 92 + Post-Mortem.md "Demo Video" 节 + CHANGELOG
   `[Unreleased]` 块。Demo-Video-Plan.md frontmatter 改 `status: published` + 加 `url:`。
4. **决定 submission format (ONE of two)** — 选项 A: `npm run submission:zip`
   生成 zip 上传 Canvas; 选项 B: 推 main 到 GitHub, submit repo URL +
   commit sha anchor。**只交一份, 避免 grader 两份不知道哪份 authoritative**。

### P1 (存在但不达标)

1. closeout 前再跑一次三 grep gate — 全 0 才可 submit。`build-submission.sh`
   heredoc 已经把这 3 条 grep gate 写进 stdout 提醒。
2. `Demo-Video-Plan.md` §4 post-upload checklist 在 video 上传后必须按 4 步
   一次 commit。

### P2 (细节)

1. CHANGELOG 应在 R3 完成后追加 `### Docs (HW7 Round 2 → Round 3 — sustained
   stable)` 子节, 记录 R3 的稳态 verdict 与 author-fill 阻断点 (即便没有 commit
   也应记录)。
2. `Demo-Video-Plan.md` frontmatter `platform: TBD` 在录制前应敲定为
   `YouTube unlisted` 或 `Vimeo`, 免得 P0-4 决定时反复改文件。

---

## 结论

**Verdict: YELLOW** (score 8 / 10) — 与 R2 一致, 稳态保持。

22 子项: **PASS 18 / PENDING 4 / FAIL 0**

- PASS 18: 所有结构 / 工程 / build / submission-format 工程层全到位, R0+R1+R2 累计修复完整保留。
- PENDING 4: Pillar 名 + Post-Mortem 内容 + Demo video URL + Submission format
  最终决定 — 全是"作者亲手填 / 录 / 选"动作, **不是 reviewer 这一轮该 fail
  的工程缺陷**, 也不是 R3 实现层该 LLM-fill 的项目 (TA §1.5 红线)。
- FAIL 0: R1 把 R0 的唯一 FAIL (submission format 工程产物缺) 通过
  `build-submission.sh` + `npm run submission:zip` 闭环, R2/R3 维持。

R0 RED 7/22 → R1 YELLOW 17/22 → R2 YELLOW 18/22 → R3 YELLOW 18/22 (累计 +11, 平稳期)。

距离 GREEN 的最短路径: **作者本人完成 P0 第 1-4 条** (≈30 分钟 admin work
+ 1 个 3-min recording session)。当 README pillar 名是真实文字、Post-Mortem
6 处 `AUTHOR:`/pillar 占位清零、demo video 有真 URL、`npm run submission:zip` 产物
出现在 Canvas (或 GitHub URL submitted) 时, submission 即可 GREEN, 无需 reviewer
再次介入。

**关键判断 (与 R2 一致)**: R1 的实现选择 "build-submission.sh + 4-item author gate"
而不是 "擅自 LLM-fill pillar 名/post-mortem 内容" 是正确的 process discipline。
R2/R3 review 不应越界。当前 PENDING 状态本身不是 bug, 是 design intent (TA HW7 §1.5
anti-LLM-polish 红线下的安全 posture)。

R1 的 5 项工程修复 (build-submission.sh / npm script / PROCESS-LOG / CHANGELOG /
README port 注释) 全部在 R3 仓库中**完整保留无回退**。
