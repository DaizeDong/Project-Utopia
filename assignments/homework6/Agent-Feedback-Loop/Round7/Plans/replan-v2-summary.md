---
round: 7
stage: C-replan
date: 2026-04-26
reason: 原始计划未覆盖全部 reviewer 反馈，且多处为缝补方案而非根因修复
---

# Round 7 Stage C — 重新规划摘要（v2）

## 已完成（Wave 1 commits）

| Plan | Commit | 解决的 P0 |
|------|--------|-----------|
| 01a-onboarding | 6dfd257 | overlayHelpBtn stopPropagation + Help Tab CSS/JS |
| 01b-playability | 31e5323 | type=button + canvas preventDefault + food 400 |
| 02a-rimworld-veteran | 19b196d | starving preempt + carry-eat + objectiveLog 事件 |

## 原始计划未覆盖的问题

| 问题 | reviewer 来源 | 原始遗漏原因 |
|------|--------------|-------------|
| P0-5 完全无音频 | 01b, 02b, 02d | 无任何 plan 处理 |
| COOK=0 根因（fallback 不分配 COOK） | 02c | 原 plan 修 symptom，未改 ColonyPlanner 逻辑 |
| 角色滑块被 fallback 完全忽略 | 02c | 未处理 |
| 工人特质对行为无影响（只是标签） | 01e, 02d | 原 plan 加字段但未接线 |
| WHISPER demo 只改 UI 文字 | 01e | 非根因，LLM 依旧无差异输出 |
| 快进 8×→1× 性能退化 | 02c | 未处理 |
| 手动操作<<Autopilot 根因 | 02b, 01b | 未从 ColonyPlanner 层面暴露给玩家 |
| Run End 无死因诊断摘要 | 01d, 02e | 未处理 |
| 天气效果主地图不可见 | 01d | 未处理 |
| 死亡通知 10s 消失无永久记录 | 02d | 处理不足 |
| Debug/Benchmark 面板非 dev 可见 | 02e | 未处理 |
| HUD 次级指标无标签（Meals/Tools/Prosperity/Threat） | 01c | 原 plan 提了但未够彻底 |
| 1024px 侧边栏消失 | 01c | 原 plan 部分处理 |
| 里程碑 toast 遮挡 40% 画面 | 01c | 未处理 |
| Space 键意外触发菜单返回 | 01c | 未处理 |
| 工人悲伤无行为/情感层 | 02d | 未处理 |
| 死亡决策语言是物流语言而非情感语言 | 02d, 01e | 未处理 |

## 重新规划基本原则（引用 PROCESS.md）

> 1. 覆盖 reviewer 的全部反馈，不能只覆盖一部分  
> 2. 优先从顶层逻辑优化角度切入，而非缝补  
> 3. Step 粒度要可验证（file + function + 具体变更）

## 新波次安排

### Wave 2 — 架构/系统级修复

| Plan | 根因层 | 主要文件 |
|------|--------|---------|
| 02c-revised | ColonyPlanner 分配逻辑 | ColonyPlanner.js, RoleAssignment.js |
| 01c-revised | HUD DOM 结构 + CSS 布局 | index.html |
| audio-new | AudioContext 初始化 | src/audio/AudioSystem.js（新建）|
| 02e-revised | DeveloperPanel 渲染逻辑 | DeveloperPanel.js |

### Wave 3 — 行为智能层

| Plan | 根因层 | 主要文件 |
|------|--------|---------|
| 01e-revised | WorkerAISystem 意图权重 + LLMClient fallback | WorkerAISystem.js, balance.js, LLMClient.js |
| 01d-revised | SceneRenderer + GameStateOverlay | SceneRenderer.js, GameStateOverlay.js |
| 02d-revised | MortalitySystem + EventPanel 叙事层 | MortalitySystem.js, EventPanel.js |
| 02b-revised | HUDController advisory + ColonyPlanner 暴露 | HUDController.js, ColonyPlanner.js |

## 全覆盖矩阵

| Reviewer | 分数 | 主要问题已覆盖？ |
|----------|------|----------------|
| 01a-onboarding | 3.0 | ✅ Wave 1 修复 P0-1/P0-4 + HUD digest chip |
| 01b-playability | 3.5 | ✅ Wave 1 P0-2/balance + Wave 2 audio + 02b advisory |
| 01c-ui | 3.5 | ✅ Wave 2 01c-revised 覆盖全部 UI 问题 |
| 01d-mechanics-content | 4.5avg | ✅ Wave 3 01d 天气/runEnd/事件演出 |
| 01e-innovation | 3.0 | ✅ Wave 3 01e 特质接线 + WHISPER demo |
| 02a-rimworld-veteran | 5.0 | ✅ Wave 1 全修 + Wave 2 audio + COOK fix |
| 02b-casual | 3.5 | ✅ Wave 2 audio + 02b advisory + Wave 2 01c UI |
| 02c-speedrunner | 4.0 | ✅ Wave 2 02c COOK+滑块+性能 |
| 02d-roleplayer | 4.5 | ✅ Wave 3 02d 叙事层 + 01e 特质 |
| 02e-indie-critic | 6.0 | ✅ Wave 2 02e dev gate + Wave 3 WHISPER demo |
