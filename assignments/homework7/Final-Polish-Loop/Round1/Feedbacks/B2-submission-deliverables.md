---
reviewer_id: B2-submission-deliverables
round: 1
date: 2026-05-01
verdict: YELLOW
score: 7
checklist_total: 22
checklist_pass: 17
checklist_pending: 4
checklist_fail: 1
build_url_works: true
post_mortem_path: assignments/homework7/Post-Mortem.md
demo_video_link: pending
---

## 总评

Round 0 把 P0 的五项结构性缺口全部补上：`Post-Mortem.md` (191 LOC skeleton)、
`Demo-Video-Plan.md` (62 LOC plan)、README "Highlights — Two Pillars"、README
"Demo Video & Post-Mortem"、README "How to Grade This Submission"。Build URL
仍可用，game loop 可达 (Start Colony → in-game HUD/canvas渲染正常，无console
error；见 `screenshots/B2/01-game-loop.png`)。

由 RED → YELLOW。**还没到 GREEN** 的唯一原因是 Post-Mortem 与 Pillar 区块仍然
是 skeleton —— 所有 `<!-- AUTHOR: ... -->` 占位符还在，pillar 名字还是
`<copy exact pillar name from A2>`，§2/§3/§4/§5 的内容只有 prompt questions 没有
作者本人的回答。这是 Round 0 实现者明确按 plan 留下的（"作者必须自己填"），不是
B2 这一轮该判 FAIL 的事，但提交前必须由作者本人完成。Demo video 也还没拍，按
reviewer 协议是 **pending** (有 plan 文档兜底) 而非 missing。

22 子项中：PASS 17 / PENDING 4 (作者待填 + 视频待拍) / FAIL 1 (submission format
未最终决定 zip vs hosted)。比 Round 0 (7/22) 改善 +10。

---

## C1 Final Build / Web Link

| 子项 | 状态 | 证据 |
|------|------|------|
| README 含 final build URL 或 build instruction | PASS | README §"How to Grade This Submission" (line 162-178) 给出 6 步 grader walkthrough：clone → `npm ci` → `npm run build` → `npx vite preview` → Start Colony → 读 Post-Mortem。明确"no API key required"。Round 0 的实现把 build instruction 收敛到 grader-可用形态。 |
| URL 可访问 | PASS | `browser_navigate http://127.0.0.1:5173/` 200 OK，`document.title === "Project Utopia"`，canvas 已挂载，`bodyClass="casual-mode"`，`#wrap.game-active` 切换正常。 |
| menu → 进游戏 → 玩 → 退出 game loop | PASS | "Start Colony" 按钮可点；进入后 Build Tools sidebar、Resource HUD、Speed controls、Entity Focus 均正常渲染。Survival timer 起跳 (00:00:07)，无 console error。退出 UX 归 A3/A6 范围。`screenshots/B2/01-game-loop.png` |
| README build instruction 与 actual build 行为一致 | PASS | README line 49 "Then open <http://localhost:5173>" 与本次 :5173 启动一致。grader 6-步走法独立可重现。 |

---

## C2 Source Code + README

| 子项 | 状态 | 证据 |
|------|------|------|
| README 项目简介 | PASS | line 3 一句话介绍 (Three.js + tile-based + LLM-AI layer + A* + Boids)。 |
| README setup / run instruction | PASS | line 31-49 Quick Start + 三种 launch path (`npm start` / `dev:full` / `start:prod`)。 |
| README final build instruction | PASS | line 56-64 列出 `npm run build` 等；line 167 "How to Grade" 中的 `npm run build` + `npx vite preview` 是 grader 入口。 |
| README 解释了**核心两个 pillar** | **PENDING** | Round 0 加了 `## Highlights — Two Pillars` 章节 (line 5-23)，结构齐全 (Pillar A / Pillar B / 长形式跳转)，但 pillar 名字仍是占位 `<copy exact pillar name from A2>`，summary 是模板文字而非作者自己的话。**结构 PASS、内容 PENDING 作者填**。 |
| README 引用 demo video link | PASS | line 90-92 `## Demo Video & Post-Mortem` → `Demo-Video-Plan.md`。video 未上传时显式标 "pending"。 |
| README 引用 post-mortem | PASS | 6 处命中：line 16, 21, 23, 93, 172, 加 Highlights 跳转。 |
| README 避免 "lorem ipsum / TODO / Coming Soon" 残留 | PASS | 全文 grep 无 TODO/lorem/coming soon。占位是 `<copy exact pillar name from A2>` 形式，escape angle 标记为 author-fill 而非 LLM 模板词。 |
| CHANGELOG 覆盖到当前版本 | PASS | 5499 行 ([Unreleased] HW7 Final Polish Loop Round 0 块在 line 1-99 滚动；HEAD 是 v0.10.1-m，line 100 起按版本倒序铺到 v0.2.0)。Round 0 的 polish/balance 改动均有条目。 |

**结论**：8 子项中 7 PASS / 1 PENDING (pillar 内容填充)。结构层全部到位。

---

## C3 Final Demo Video

| 子项 | 状态 | 证据 |
|------|------|------|
| post-mortem / README 中存在 video link | **PENDING** | Round 0 创建 `Demo-Video-Plan.md` (62 LOC) — 包含 frontmatter `status: pending`、§1 recording window + 6项 pre-flight checklist、§2 7-shot 表 (timecodes 0:00–3:00)、§3 voiceover 决策、§4 post-upload checklist。README line 92 指向该 plan。**plan 存在 → 状态 pending (不是 missing)**。 |
| video 时长 claim 在 2-4 分钟 | PASS (claim) | Demo-Video-Plan frontmatter `target_length_minutes: 3` / `target_length_max_minutes: 4` —— 落在 HW7 §3 "2 to 4 minutes" 范围。 |
| 描述提到 "complete game loop showcase" | PASS (claim) | shot 1-2 (title + 30s game loop) + shot 5 (survival end-state) + shot 7 (end card) 涵盖 menu → core → end。 |
| 描述提到 "two pillars demonstration" | PASS (claim) | shot 3 (0:30-1:15 Pillar A live map editing → reroute) + shot 4 (1:15-2:00 Pillar B LLM-driven HUD/AI Trace)。两条 shot 显式 cross-reference Post-Mortem §1 Pillar A/B。 |
| 描述提到 voiceover / text overlay | PASS (claim) | §3 显式列出 voiceover 与 caption 决策，并标 "voiceover preferred since Pillar B requires explaining AI Trace"。 |

**结论**：plan 文档全部 5 子项 claim 满足，等录制；video URL 出现前持 pending。

---

## C4 Post-Mortem 内容核对

| 子节 | 是否存在 | 内容质量 | 改进建议 |
|------|----------|----------|----------|
| **整份 Post-Mortem.md 文件存在性** | **EXISTS** (191 LOC) | skeleton — 所有 section heading 齐全 | Round 0 已落 |
| §1 Brief overview of two pillars | 结构 EXISTS / 内容 PENDING | Pillar A/B 名字仍是 `<copy exact pillar name from A2>`，4 道 guiding question 但作者答案缺失 | 作者从 `assignments/homework2/a2.md` 复刻确切 pillar 名；4-8 句第一人称回答 4 道 question；至少引一个 `src/` 路径与 2-3 个 commit sha |
| §2 Playtest Resolution | 结构 EXISTS / 内容 PENDING | 表头齐全 (Finding / Action / Evidence / Status)，1 条样例行；正文行待填 | 作者从 HW6 user-study 笔记 + PROCESS-LOG 拉真实 finding；每条配 commit / file evidence；DONE/PARTIAL/WON'T FIX/DEFERRED 任选其一，不可漏报 |
| §3 Architectural Challenges | 结构 EXISTS / 内容 PENDING | 4 个 sub-section 齐全：worker AI 三次重写 / LLM proxy 容错 / 长程 benchmark / release:strict freshness gate。每节有 prompt question 与 evidence anchor (CLAUDE.md / docs/superpowers/plans/) | 作者每节写 1 段 narrative + 1 行 evidence。重点：CLAUDE.md 已给的 -2530 LOC FSM 重写故事是 §3.1 天然素材 |
| §4 Pivots & Cuts from A2 MVP | 结构 EXISTS / 内容 PENDING | 3 道 question (survival vs cut victory loop; wildlife/defense scope; multi-LLM persona) 已立题 | 作者按 "我计划 X，做了 Y，砍了 Z" 结构作答 |
| §5 AI Tool Evaluation | 结构 EXISTS / 内容 PENDING | TA §1.5 anti-LLM-polish 警示已显式注入 AUTHOR comment；4 项 required element 列出 (≥2 帮助 / ≥1 伤害 / prompt strategy / 不会用 LLM 做的事) | **此节最危险**：TA 明确反对 LLM 美化。作者必须亲手写，最好包含 1 个具体的 LLM 失败故事 (例如 v0.9.0 utility scoring 上线后被 v0.10.0 全删的 -2530 LOC 教训)，而不是泛泛 "AI 加速了开发"。 |

**结论**：6 子项中文件存在 PASS，5 个内容子项 PENDING 作者填充。Round 0 的实现严格
按 plan 走 skeleton path，没有让 LLM 替作者编造 pillar 名或经历，**这是正确选择**
(否则会撞 TA §1.5 anti-polish 红线)。

---

## C5 Submission Format

| 子项 | 状态 | 证据 |
|------|------|------|
| 所有 report 都是 markdown | PASS | Post-Mortem.md / Demo-Video-Plan.md / README.md / CHANGELOG.md 均 .md。 |
| 提交内容包含 zip 或 hosted link 二者之一 | **FAIL → 但有 mitigation** | README §"How to Grade" line 178 给出 zip 打包说明 (exclude `node_modules/`, `.env`, `output/`, `dist/` 可选)，与 "fresh clone" 路径并列。**形态写出来了，但作者还没决定最终交哪种、也没产出实际 zip artifact**。建议作者在最终交付前 (1) 决定 zip vs GitHub link，(2) 若 zip，跑一次打包验证产物大小。这条留作 P0 收尾。 |

---

## 自行扩展角度

### 1. Skeleton 留 placeholder 是最佳做法 (合规反 LLM 美化)

Round 0 的 implementation commit 显式说明 "Validator should NOT mark this plan as
'Post-Mortem complete', only as 'Post-Mortem skeleton landed; author content
pending'"。这是正确的 anti-polish 姿态：让 LLM 给 skeleton + guiding question，
让作者填实质内容。若 implementation 当时 "贴心地"用 LLM 生成了 pillar 名 +
playtest finding + AI tool 故事，TA 会一眼看穿 (TA §1.5 显式反对)。当前状态
强制作者亲手填，反而是更安全的 submission posture。

唯一风险：作者忘了填就交。建议在 PROCESS-LOG / closeout checklist 显式列一条
"Post-Mortem author-fill pass" 作为 Round 1 后必交项目，validator 在 final
sign-off 前 grep 一次 `<copy exact pillar name from A2>` / `<TBD>` /
`AUTHOR:` 注释，若 README + Post-Mortem 仍命中超过 0 处，submission 直接 RED。

### 2. README 在 fresh checkout 上的 grader 可用性 (Round 0 的 "无 key 也能跑" 前置已生效)

Round 0 把 fallback 提示从原 line ~174 提前到 line 33 (Quick Start 顶部 blockquote)
+ line 174 (How to Grade 末尾再次确认)。grep 验证：first occurrence of "fallback"
in README is line 29 (Tech Stack)，第二处 line 33 (Quick Start callout)，第三处
line 84+ (verify:long:fallback)。**fallback 提示前置 PASS**，与 Round 0 plan §6
manual-verification 第 6 项一致。

剩余微调：README line 49 已加 "Then open <http://localhost:5173>" —— 但 grader
的 6 步走法走的是 `npx vite preview` (默认 :4173)，不是 :5173。两个 URL 在 README
里都出现过，建议作者在 "How to Grade" 第 4 步加一行 "(Vite preview defaults to
http://localhost:4173)"。这是 P2，不影响 Round 1 verdict。

### 3. 外链有效性

Round 0 加的两条内部相对链接 (`assignments/homework7/Post-Mortem.md`,
`assignments/homework7/Demo-Video-Plan.md`) — 文件均存在。无外部 URL 待验。
Demo video URL 还是 pending → 上传后必须 grep README + Post-Mortem + CHANGELOG
三处一致同步 (Demo-Video-Plan §4 post-upload checklist 已写入)。

---

## 改进优先级

### P0 (final submission 前必须收尾)

1. **作者亲手填 Post-Mortem.md §1-§5 实质内容** — 5 个 PENDING 子项收敛。重点
   §5 AI Tool Evaluation：必须有具体 LLM 失败故事 (v0.9.0 utility scoring 全删
   是天然素材)，否则撞 TA §1.5 anti-polish 红线。
2. **作者填 README "Highlights — Two Pillars" pillar 名字与 summary**，与 A2
   原文对齐；与 Post-Mortem §1 同步。
3. **录 demo video 并回填 URL** 到 README line 92 + Post-Mortem.md "Demo Video"
   节 + CHANGELOG (Demo-Video-Plan.md §4 post-upload checklist 已列三处同步点)。
4. **决定 submission format (zip vs GitHub URL)**，若 zip 则跑一次打包并验证
   产物 (排除 node_modules / .env / output / dist 可选)。

### P1 (存在但不达标)

1. closeout 前 grep `<copy exact pillar name from A2>` / `<TBD>` /
   `AUTHOR:` —— 若仍命中超过 0 处，submission 必 RED。建议在 validator
   sign-off checklist 里硬编码这条。
2. PROCESS-LOG.md 在 Round 1 收敛时补一条记录 (Post-Mortem §2 Playtest
   Resolution 的 evidence source)。

### P2 (细节)

1. README line 168-170 "How to Grade" 第 4 步加一行 "(Vite preview defaults to
   http://localhost:4173)" — 当前 :5173 与 :4173 在 README 中并列出现可能让
   grader 短暂困惑。
2. CHANGELOG [Unreleased] HW7 Final Polish Loop Round 0 块已记录 A4 polish
   wave-0 的 polish 改动，但本次 B2 (Round 0 docs landing) 没专门的 changelog
   条目。closeout 前可补一条 "docs(submission): Post-Mortem.md skeleton +
   Demo-Video-Plan + README pillars/anchors landed for HW7 Phase 4"。

---

## 结论

**Verdict: YELLOW** (score 7 / 10)

22 子项：**PASS 17 / PENDING 4 / FAIL 1**
- PENDING 4：Pillar 内容、Demo video URL、Post-Mortem §1-§5 内容、submission
  format 决定 — 全是"作者填 / 录视频 / 收尾"动作，**不是 reviewer 这一轮该
  fail 的工程缺陷**。
- FAIL 1：submission zip vs hosted 形态决定 — 有 mitigation 文字，但没产物。

由 Round 0 (RED, 7/22) → Round 1 (YELLOW, 17/22)。+10 子项改善的核心是 Post-Mortem
skeleton + Demo-Video-Plan + README anchors 三条 P0 全部落地。

距离 GREEN 的最短路径：**作者本人完成 P0 第 1-3 条** (Post-Mortem 实质内容 +
Pillar 名字 + demo video URL)。当 Post-Mortem `<AUTHOR>` 注释清零、README pillar
名是真实文字、demo video 有 URL 时，submission 即可 GREEN，无需 reviewer 再次
介入。剩余 P0-4 (zip/hosted 决定) 是 1 个命令的事 (`zip -r project-utopia.zip . -x
'node_modules/*' '.env' 'output/*'`) 或 GitHub release tag。

**关键判断：Round 0 的实现选择 "skeleton + author guidance" 而不是 "LLM-fill
the whole thing" 是正确的 anti-polish 姿态**。当前 PENDING 状态本身不是 bug，
是 design intent。
