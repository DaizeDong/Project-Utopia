---
round: 0
date: 2026-05-01
build_commit: 3f87bf4
total_reviewers: 10
verdict_distribution:
  GREEN: 2
  YELLOW: 4
  RED: 4
---

# Round 0 — Feedbacks Summary

## Verdict 概览

| reviewer | tier | verdict | score | 关键发现一句话 |
|---|---|---|---|---|
| A1-stability-hunter | A | GREEN | 8/10 | 0 P0 / 0 P1 / 2 P2 across 5 sessions ~22 min；零崩溃、零 unhandled rejection、零 NaN；P2 仅为 saveSnapshot/loadSnapshot API 不一致 + ResizeObserver 良性 warning |
| A2-performance-auditor | A | YELLOW | 4/10 | Headless Chromium 把 RAF 节流到 1Hz 导致 60/30 FPS gate 机械失败；真实瓶颈：sim tick 在 P4 stress 下被 cap 到 ×0.3（目标 ×8），drawcall 随 infra 线性增长（51→137→203/tick）暗示低 instancing；内存稳定 70-100MB 无泄漏；零 console error |
| A3-first-impression | A | YELLOW | 4/10 | 3 P0 新手摩擦：开局信息过载（5 资源 + 20 实体 + 7 tabs + 13 工具同时砸下来）/ 真实目标 checklist 埋在 AI Log 三层下 / 键盘 `2` 切肥力 lens 而不是选 Farm（broken promise）；aha moment 存在但晚且无引导 |
| A4-polish-aesthetic | A | RED | 3/10 | 三大 polish 缺口：完全无音频（settings 无 volume 控件）/ 无日夜循环+无 shadow+静态光照 / tile checkerboard hard seams + worker 无行走动画；4 视觉 bug 含 1920×1080 状态栏溢出、主菜单 label 重复渲染 |
| A5-balance-critic | A | RED | 3/10 | 硬编码 3:11 饿死崩盘（所有地图都同样）；Score 在 food=0 时冻结，之后所有游玩都 0 分；地图模板纯换皮（同起始资源同 scenario tags 同崩盘形状）；processing chain 死内容（Kitchen/Smithy/Clinic/Quarry/Bridge 30+ 分钟从未观察到激活）；Weather/Bandit/Trader 30 分钟从未触发 |
| A6-ui-design | A | YELLOW | 5/10 | 19 UI bugs（2 P0 / 9 P1 / 8 P2）；P0：Demolish 按钮用警告红做默认态与 active/danger 语义冲突 + 响应式断点缺失（1024/1280/1366 keybinding 卡片严重截断，2560×1440 70% 死空间）；P1：Inspector/tooltip/toast z-index 冲突 |
| A7-rationality-audit | A | RED | 4/10 | 4 P0 显示与现实脱节：Try Again 后顶栏仍显示上一局 Survived/Score 至少 1 分钟 / 食物速率 -562/min 与 (cons -39/spoil -2)=-41/min 14× 不一致 / `L` 键 toast 文案错（说"Tile icons"实际是"Heat Lens"）/ 70+ LLM 调试 `<details>` panel 暴露给玩家 Inspector |
| B1-action-items-auditor | B | GREEN | 9/10 closed | 10 个 HW6 action items 中 9 closed + 1 partial（AI-1 perf 仅 baseline 验证未触达 75-worker stress）；0 regressed |
| B2-submission-deliverables | B | RED | 3/10 | 22 checklist items 中 7 PASS / 15 FAIL；P0：Post-Mortem.md 不存在 / README 无 pillars 段 / 无 demo video link / 无 demo video plan 文档 / submission 格式未定（README 拒绝 hosted URL 但无 zip artifact）；CHANGELOG 是唯一全绿交付物 |
| C1-code-architect | C | YELLOW | n/a | 25 系统：4A / 11B / 8C / 2D；2 个 D 级（ColonyPlanner 1867 LOC + ColonyPerceiver 1966 LOC）；Round 0 baseline 无 delta；架构债 top-3：(1) VisitorAI/AnimalAI 仍跑 v0.9.x StatePlanner 已废弃框架（与 v0.10.0 worker FSM 黄金范例并存）/ (2) WorkerAISystem.update() 1500-1680 行 ~250 LOC 的 mood/social/morale 补丁不在 FSM dispatcher 内 / (3) docs/systems/03-worker-ai.md 完全过期（描述已删除的 chooseWorkerIntent / planEntityDesiredState / commitmentCycle） |

## Tier A 共识 P0（多个 A 级 reviewer 同时报的高严重度问题）

### 共识 P0-1: 食物 / 饥饿系统的根本失败
- A5 RED：硬编码 3:11 全部地图饿死崩盘
- A7 RED：食物速率 -562/min 与分项 -41/min 14× 不一致 → 玩家信息错误
- A3 YELLOW：真实目标 checklist 埋在三层下，玩家不知道要先解决食物问题
- 综合：早期 food 经济既数值上不可生存，又 UI 上误导玩家
- 建议归并为单一 `economy/food-runway-fix` plan，触及 BALANCE.foodSpoilage / BALANCE.foodCost / WorkerAISystem 食物诊断速率计算 / FoodDiagnosticsPanel 显示

### 共识 P0-2: UI 状态泄漏 + 死内容暴露
- A7 RED：Try Again 后顶栏显示上一局 + 70+ LLM debug panels 暴露
- A6 YELLOW：z-index 冲突 + tooltip 不消
- A3 YELLOW：信息过载 / 键盘绑定文案错
- 综合：Inspector / HUD / toast 三层在 reset/draw 边界没收敛，且 dev-only 内容渗透到 release UI
- 建议归并为 `ui/state-cleanup` plan，触及 InspectorPanel.js / SceneRenderer toast 清理 / Help dialog 文案 / `L` 键绑定

### 共识 P0-3: 无 polish 表层（音频 / 光照 / 动画）
- A4 RED：完全无音频 / 无日夜循环 / 无 worker 动画
- A6 YELLOW：tile seams + 视觉密度均匀（无层级）
- 综合：渲染层未"裹包装"
- ⚠️ 注意 freeze：HW7 hard freeze 禁止新音频 asset / 新 mechanic / 新 mood
  - 音频：现有 audio asset 的混音/音量/触发时机调整允许，但**新 asset 禁止** → 若现状是"完全无 audio asset"，则不能在本轮加音频
  - 日夜循环：可视为既有 weather 系统的 polish（既有 day cycle 90s）；shadow 需 Three.js 配置改动，属性能优化范畴
  - tile seams：纹理 / 材质参数调整在 freeze 内允许
  - worker 动画：若现状是 snap-step，加 walk cycle 算"新 mechanic"还是"polish"？enhancer 需 case-by-case 判断，倾向把"加 walk cycle"defer 到 HW7 之外

### 共识 P0-4: HW7 提交物缺失
- B2 RED：Post-Mortem 不存在 / 无 demo video / 无 pillars
- 这是**纯 docs track**，不与 code 冲突，应优先并行进入 wave-0
- 但需要权衡作者实际可投入的写作时间

## Tier B 状态

- **B1 action items**: 9/10 closed, 1 partial (AI-1)，0 regressed
  - HW6 闭环工作基本完成；AI-1 perf 需要更精细的 stress 复现以彻底关闭
- **B2 deliverables**: 7/22 pass = 31.8%；提交风险高
  - 关键缺失：Post-Mortem.md / README pillars / demo video / submission artifact 格式

## Tier C 架构

- **等级分布**：A=4, B=11, C=8, D=2（共 25 系统）
- **Δ vs 上一轮**：N/A（Round 0 baseline）
- **Top-3 重构机会**：
  1. VisitorAISystem + AnimalAISystem 仍用 v0.9.x StatePlanner / StateGraph / StateFeasibility 三件套 → C1 推荐抽 `WorkerFSM` dispatcher 为通用 `PriorityFSM<StateName>` 类
  2. WorkerAISystem.update() main loop 1500-1680 行 ~250 LOC mood/social/relationship 补丁不在 FSM 内（声称的"FSM 唯一决策管线"被破坏）→ 需要把这部分逻辑要么纳入 FSM 要么明确为独立 sidecar
  3. docs/systems/03-worker-ai.md 完全过期 → 描述 v0.9 的已删除函数 → docs track 修订
- **D 级系统**：ColonyPlanner (1867 LOC) + ColonyPerceiver (1966 LOC)。两者是 v0.8.x 沉积的"补丁堆"。HW7 hard freeze + 单 plan ≤400 LOC delta 限制下，只能 wave-1 of M 拆分；首轮宜先做 docs/systems 同步与 inventory diff，重构留下一轮启动

## 给 enhancer 阶段的提示

### 优先级建议（不强制 — 由 enhancer 仲裁阶段决定）

| Plan | 推荐 priority | 推荐 wave | 推荐 track | 备注 |
|---|---|---|---|---|
| A1-stability | P2 | wave-0 | code | 仅 2 个 P2 ；快速一次性修 saveSnapshot 契约 |
| A2-performance | P1 | wave-0 | code | 改 instancing batching + 解耦 sim tick budget；headless RAF 问题为非项目缺陷 |
| A3-first-impression | P0 | wave-0 | code | 3 P0 onboarding fix（信息收敛 + 目标 surfacing + 键盘修绑） |
| A4-polish-aesthetic | P1 | wave-0/1 | code | freeze 警戒：新音频 asset 禁；可调既有 polish |
| A5-balance-critic | P0 | wave-0 | code | 食物经济 root cause；与 A7 共识 P0-1 合并 |
| A6-ui-design | P1 | wave-0/1 | code | 19 bugs 拆为多 sub-step；P0 二项分别处理 |
| A7-rationality | P0 | wave-0 | code | 4 P0 全部修；与 A5 共识合并食物速率显示项 |
| B1-action-items | P2 | wave-0 | docs/code 混 | 仅 1 partial 待关；可纯 docs 标记 "documented-defer"|
| B2-submission | P0 | wave-0 | docs | Post-Mortem.md 创建 + README pillars 段 + demo plan 占位；纯 docs 与 code 不冲突 |
| C1-arch (refactor) | P1 | wave-1 | code | docs/systems/03 同步 + Visitor/Animal AI inventory 报告；实际重构 defer 至 Round 1+ |

### 已知冲突警示

- **A3 / A5 / A7 共识 P0-1（食物经济）** 必须合并 — 三个 plan 落单会撞 file
- **A6 / A7 P0（UI 状态）** 部分重叠 — z-index/toast/HUD 清理可能撞 SceneRenderer 与 InspectorPanel
- **B2 docs track** 无与任何 code track 的 file 冲突，可独立 wave-0

### Freeze 红线提醒

- ⚠️ A4 的"加日夜循环"是否触发 freeze 需 enhancer 仔细判定：现有 day cycle (BALANCE.dayCycleSeconds=90) 早就存在，把 lighting tied to day phase 算 polish；新建 sun/moon model 算新 mechanic。
- ⚠️ A4 的"加 worker walk animation"如果现状是 mesh teleport，新增 keyframe interpolation 算 polish；新增 character rig + multi-frame skeletal animation 算新 asset。
- ⚠️ C1 推荐的"抽 PriorityFSM<StateName>"重构若启动，必须 wave-1，且单 plan ≤ 400 LOC，必须列回滚锚点。

### 期望的 enhancer 输出

每位 enhancer 写一份 `Round0/Plans/<reviewer-id>.md`，含：
- frontmatter（track / freeze_policy / priority / rollback_anchor）
- 至少 2 Suggestions（含至少 1 不触发 freeze）
- 选定方案 + 3-10 atomic steps
- Risks + 验证方式
- 回滚锚点 commit（当前 HEAD = 3f87bf4）
