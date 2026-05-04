---
round: 2
date: 2026-05-01
build_commit: d242719
total_plans: 10
accepted: 10
deferred: 0
rejected: 0
freeze_violations: 0
wave_count: 2
total_loc_estimate: ~830
---

# Round 2 — Plans Summary

| reviewer_id | track | priority | LOC | wave | 备注 |
|---|---|---|---|---|---|
| A1 | docs (no-op) | P2 | 0 | wave-0 | 3-round 0 P0 streak documented |
| B1 | docs | P2 | ~30 | wave-0 | AI-8 documented-defer (CHANGELOG + PROCESS-LOG) |
| A4 | docs | P2 | ~80 | wave-0 | Post-Mortem §4.5 audio/lighting/motion deferral consolidation (2→4 entries) |
| B2 | docs | P1 | ~50 | wave-0 | PROCESS-LOG R2 + CHANGELOG trajectory R0 7/22 → R1 17/22 → R2 18/22 |
| A5 | code | P0 | ~85 | wave-0 | **找到 self-regen 根因**：TRADE_CARAVAN + emergency relief；改名 → workerHungerDecayWhenFoodLow + threshold 8 + TRADE 0.5→0.22 + emergency需 deaths>0 + raid 假胜需 walls/guards |
| A2 | code | P0 | ~80 | wave-0 | AgentDirector heavy work 0.5s sim-time gate + ProgressionSystem 0.25s gate；保留 fast-path |
| C1 | code | n/a | ~339 | wave-0 | wave-3/4：FEATURE_FLAGS.USE_VISITOR_FSM=OFF staged migration；3 new fsm/Visitor*.js + StatePlanner shim 保留 |
| A3 | code | P0 | ~70 | wave-1 | **R1 LMB 修没奏效真因** = ENTITY_PICK_GUARD_PX 36→14（worker sprite ~12px）+ hover ghost + 9 folded fixes |
| A6 | code | P0 | ~85 | wave-1 | 1366 dedicated media + alertStack 绑 --hud-height + AIPolicyTimelinePanel.render() group fold ×N badge |
| A7 | code | P0 | ~140 | wave-1 | AIAutomationPanel coverage/mode/proxy/model 行 isDevMode gate + `.pressure-label:not(:empty)::after` + pickBootSeed boot 随机化 |

## 仲裁

### 冲突识别 + 决议

| Plan A | Plan B | 冲突 | 决议 |
|---|---|---|---|
| A5 | A2 | ProgressionSystem.js — A5 改 emergency relief gating；A2 加 0.25s cadence gate | wave-0 同：A5 先（根因） → A2 后（perf gate）；不同函数 |
| A2 | C1 | 都是大改但不同模块；A2 改 SystemTime gate，C1 加 fsm/Visitor*.js | 无冲突 |
| A3 | A6 | A3 改 SceneRenderer + index.html；A6 改 index.html CSS @media | wave-1 内 A3 → A6（A3 P0 LMB 修，A6 P0 chip wrap）；不同 CSS 区域 |
| A3 | A7 | 都改 index.html CSS | wave-1 内 A3 → A6 → A7；A7 CSS 是 .pressure-label 单条 |
| A6 | A7 | index.html CSS | A6 主要 .alertStack/.statusBar；A7 主要 .pressure-label；无重叠 |

### Freeze 违规扫描

**0 violations**：
- A5 重命名 BALANCE key 是 既有结构内调整；新增 threshold key 是字段不是 mechanic
- A2 sim cadence gate 是 既有 update 内 dt 累加；非新机制
- C1 FEATURE_FLAGS.USE_VISITOR_FSM 是 config flag（默认 OFF），非新 mechanic / role / panel
- A3 hover ghost preview 复用 state.controls.buildPreview，非新 UI panel
- A6 group fold 是既有 panel 渲染层 enhancement
- A7 dev gate / CSS rule / boot seed helper 全是既有结构调整

## 执行顺序

### wave-0 — 7 plans (docs + isolated code)

1. A1 (docs no-op) ~5 min
2. B1 (docs) ~15 min
3. A4 (docs Post-Mortem) ~25 min
4. B2 (docs PROCESS-LOG + CHANGELOG) ~20 min
5. A5 (code 关键根因) ~35 min
6. A2 (code cadence gate) ~30 min
7. C1 (code +339 LOC staged migration) ~45 min

wave-0 总 ~175 min

### wave-1 — 3 plans (UI cluster)

1. A3 (code SceneRenderer + index.html) ~30 min
2. A6 (code index.html CSS + AIPolicyTimelinePanel) ~25 min
3. A7 (code AIAutomationPanel + CSS + Grid/createServices) ~35 min

wave-1 总 ~90 min

总估时 ~265 min Stage C + ~75 min Stage D = ~340 min Round 2

## Validator 关注

- Gate 1: A5 + A2 + C1 都是大改，可能搅动既有测试；4 pre-existing failures 重新评估
- Gate 2: A2 cadence gate 不应破 prod build；C1 staged behind flag 默认 OFF 应不影响 build
- Gate 3: A2 sim cadence gate 应让 P50 在 4x/8x 上回到 ~60；用 `__fps_observed` + `?perftrace=1`
- Gate 4: A5 BALANCE 重命名 + 新 threshold + raid milestone 是 既有结构内；C1 新 fsm/Visitor*.js + FEATURE_FLAGS 是 既有 npc/ 子目录扩展（非新 sim 系统）；A7 src/world/Grid.js 加 helper 是 既有文件扩展（非新 TILE）→ 0 violation 预期
- Gate 5: C1 +339 LOC 可能让 npc bundle 略大；注意 chunk size
