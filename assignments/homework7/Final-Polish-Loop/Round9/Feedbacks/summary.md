---
round: 9
date: 2026-05-02
build_commit: e7fb158
specialized_reviewers: 5 + A1 sanity + C1 quick
mission: stability + scale + dev completion sprint
---

# Round 9 — Feedbacks Summary

| reviewer | findings |
|---|---|
| A1 sanity | STABLE GREEN；5 sessions；0 P0 / 0 P1 / 4 minor P2；**连续第 4 轮 0 P0** |
| C1 quick | 7A/14B/4C/2D（PS RoleAssign C→B；PR/PT/PU 入 B；2 D 级仍 ColonyPlanner/Perceiver）；R8 commits 全 clean except 2 underscored hidden state field debt |
| PV sudden-death-cascade | **P0 confirmed**：9/12 workers 同步饥死 25 sim-sec → 8× speed 下 ~3-5 wall-sec = user "前 1s 一片大好然后全饿死"。**Root: shared food pool 致同步 hunger=0 同时**；HUD silent warning window 50 sim-sec；Recovery toast 在 cascade 击发时还说 "breathes again"。R8 PS/PR/PT 全 clean — bug 是结构性 |
| PW scale-stability | Tests A/B/C 大致 GREEN；**top HIGH gap**: 50 workers + 16 farms + 4 kitchens 但 49/50 critical hunger (41 zero) 因 **single-warehouse bottleneck** 锁住 eat pipeline；survival preempt 不 fire 因 carry.food>0 mask emergency |
| PX work-binding | BUILD 1:1 ENFORCED；**FARM/LUMBER/QUARRY NOT 1:1 因 HARVESTING.onEnter 丢弃 JobReservation.tryReserve() return** — 4 workers 同 HARVEST tile (54,42)；plus B3 BUILDER quota 太少 (1 builder for 6-9 sites) |
| PY dev-completion | **核心 root cause**：`state.ai.foodRecoveryMode` latched ON 永不释放 → BuildProposer.js:140-147 短路 ProcessingProposer → **35 sim-min 内 0 quarry/herb/kitchen/smithy/clinic**。Recovery 不释放因 foodHeadroomSec ~40s 永不达 60s gate = 无限 triage purgatory。Plus 79 roads≫30 over-emit + GUARD=0 even strategy=defend |
| PZ holistic | **4.5/10 (Δ +0.5 vs R8 4.0)** — **首次止跌！** Autopilot 读自己 Food Diagnosis ("build warehouse") 然后排 Lumber instead。Engine ×0.6 capped at ×8 target = 30min run 需 90 real min |

## 共识 root cause + R9 plans

8 distinct findings 但收敛到 4 root causes：

| Root cause | 反映 | R9 Plan |
|---|---|---|
| **Recovery latch 永不释放 + Director 不听 Food Diagnostic** | PY + PZ + 部分 PV (Recovery toast still says "breathes" in cascade) | Plan-Recovery-Director |
| **同步 starvation cliff + HUD silent warning** | PV | Plan-Cascade-Mitigation |
| **Single-warehouse bottleneck at scale + survival preempt mask** | PW | Plan-Eat-Pipeline |
| **Reservation tryReserve return discarded** | PX | Plan-Honor-Reservation |

| Plan | priority | scope | LOC est |
|---|---|---|---|
| Plan-Recovery-Director | **P0** | (a) ProgressionSystem release `foodRecoveryMode` 当 farms ≥ target/2 || warehouses ≥ 1 || foodHeadroom > 90 (multiple OR conditions vs single AND); (b) BuildProposer Director 监 Food Diagnostic — ≥30% workers report no-warehouse ≥10s → warehouse top priority; (c) LogisticsProposer cap roads ≤ 30 + threat-aware GUARD draft when strategy=defend | ~120 |
| Plan-Cascade-Mitigation | P0 | (a) HUDController food-runway early-warning chip 显 when foodHeadroomSec < 30s; (b) MortalitySystem.js:530-560 per-worker starvationSec phase offset (id-hash mod ±10s) to stretch death cliff; (c) Recovery toast suppression 当 foodHeadroomSec < 20s; (d) famine chronicle entry in evaluateRunOutcome | ~80 |
| Plan-Eat-Pipeline | P0 | (a) hunger<0.15 fast-eat-from-carry triggers regardless of warehouse reachability; (b) per-warehouse contention cap forcing role-assigner to demand more warehouses; (c) integrate with Plan-Recovery-Director warehouse priority | ~60 |
| Plan-Honor-Reservation | P0 | (a) WorkerStates.js:301-303 + 344-346 honor JobReservation.tryReserve return — `if (!reservation.tryReserve(...)) worker.fsm.target = null;`; (b) RoleAssignmentSystem BUILDER quota = max(2, sitesUnclaimed × 0.4) | ~40 |

总估 ~300 LOC，全 freeze-clean，4 plans。

## 设计哲学

R9 plans 都是 surgical "找到病根" — 不是面 polish。Recovery latch + reservation contract + warehouse bottleneck + cascade cliff 是相互交织的食物经济结构问题。

注意 **R8 PS roleChangeCooldown bypass 修了 BUILDER claim**，但 R9 PX 又发现 **HARVESTING reservation 不 honor return** = 类似的 contract-broken pattern。两件加起来证明 v0.10.0 PriorityFSM 重构时 reservation 契约层面有系统性遗漏。

## Stop conditions

| 条件 | 状态 |
|---|---|
| A1 0 P0 streak | **连续 4 轮 ✅** (R6+R7+R8+R9) |
| C1 debt + 0 D | 持续 +1 sustained；2 D 级仍存 |
| Validator 2 GREEN | R8 GREEN；R9 待 — 这是关键收尾 |
| 其余 | n/a (P-mode) |
