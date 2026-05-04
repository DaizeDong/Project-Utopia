---
round: 12
date: 2026-05-02
build_commit: fa6cda1
mission: standard A1-C1 reviewer regression check (per user directive after 7 P-mode rounds R5-R11)
total_reviewers: 10
verdict_distribution:
  GREEN: 3
  YELLOW/Conditional: 7
  RED: 0
---

# Round 12 — Standard Reviewer Regression Check Summary

| reviewer | verdict | findings |
|---|---|---|
| A1 | STABLE GREEN | 0 P0 / 0 P1 / 6 P2 carryover；R10 P1 regenerate **持续 FIXED**；**连续 7 轮 0 P0** |
| A2 | **GREEN (FIRST EVER)** | P50 55-56 / P5 47-48 across 4 scenarios；free-run RAF 238fps p50；engine 健康；headless cap 是 harness 限制 |
| A3 | B+friction | 6 friction：(1) Build tab 双击才开 — **regression**；(2) hotkey 1-12 silent (Construction panel 不更新)；(3) Autopilot checkbox 命中 hit-region 不准；(4) "Story AI offline" 绿色错；(5) 默认地图太暗；(6) 资源 amber→red 无中间 warning |
| A4 | Conditional Pass | R11 PGG/PHH polish landed (sphere halo + grid hairlines + trails)；audio=0 仍 freeze；camera framing 30-45% void + center toasts pile |
| A5 | Fail/Conditional Pass | **Temperate 39 min vs 其它 7-8 min — non-starter maps 不可玩**；wood +22× snowball + food -100% (zero-lumber safety net works too well)；food-crisis 无 recovery 暂停后 60-90s wipe；plus stale "Autopilot OFF" banner 即使 checked=true |
| A6 | Conditional Pass | (1) 1024 #statusScoreboard 溢出 + **"Why no WHISPER?: LLM never reached" engineering 字符串泄漏到 header**；(2) Space/T/L pause/overlay/heat-lens 仅底部绿 pill 信号无 ARIA；(3) 1920 islanded canvas 20-35% 黑 void 无 horizon |
| A7 | Conditional Pass | 3 stack：(1) **`STABLE` 绿但食物 -151/min + farms 0/6 = director headline 错**；(2) **glued-token "saboteursstrike workersrebuild" .join('') 模板 bug**；(3) **3 独立 debug 字符串泄漏 HUD** ("Why no WHISPER?" + "proxy=unknown" + "fallback gpt-5-4-nano")；plus 18 secondary |
| B1 | GREEN | 9 closed + 2 documented-defer = 11/11；MET **9 rounds 持续** |
| B2 | YELLOW | 18/22 PASS + 4 PENDING author-fill；plateau 9 rounds |
| C1 | YELLOW | **8A/18B/3C/2D (+1A delta R12)**；PFF 升 A；2 D 级仍 ColonyPlanner/Perceiver |

## R12 暴露的 user-facing regressions (P-mode rounds 没看到)

| # | issue | 来源 | 推测原因 |
|---|---|---|---|
| **R-1** | "STABLE" 绿与食物 -151/min 矛盾（director headline 错） | A7 | HUD/Director status tier 在多轮 polish 中 desync |
| **R-2** | glued-token "saboteursstrike" .join('') | A7 | narrative templater 某 commit 漏空格 |
| **R-3** | 3 debug 字符串泄漏 HUD 顶 (Why no WHISPER + proxy=unknown + fallback gpt-5-4-nano) | A6 + A7 | dev-mode gate 漏 (类 R0 A7 isDevMode pattern 没覆盖这些 fields) |
| **R-4** | Build tab 双击 | A3 | 某 round sidebar restructure 把 click 路由 broke |
| **R-5** | Autopilot checkbox 命中不准 | A3 | hit-region CSS 损坏 |
| **R-6** | wood snowball + food collapse 互动 | A5 | R7 PL terrain floor + R8 PT raid + R9 cascade revert + zero-lumber safety net 多重叠加 |
| **R-7** | non-Temperate 7-8 min wipe | A5 | scenario 真分化但 autopilot fallback 不适应 |

## 共识 root + R12 plans

| Plan | priority | scope | LOC |
|---|---|---|---|
| Plan-R12-debug-leak-gate | **P0** | 3 debug 字符串 ("Why no WHISPER?" / "proxy=unknown" / "fallback gpt-5-4-nano") gate behind isDevMode；遵循 R0 A7 pattern；找出 emit 位置 | ~40 |
| Plan-R12-stable-tier-fix | P0 | HUD `STABLE` 绿不 fire 当 foodRate < -10/min OR foodHeadroomSec < 30s；coupling director headline 真 metrics | ~50 |
| Plan-R12-glued-tokens | P0 | 找 narrative templater .join('') 漏空格；可能在 src/simulation/ai/director 或 storyteller | ~20 |
| Plan-R12-build-tab-1click | P1 | Build tab 单击直入；investigate sidebar tab routing；可能 R5 PA 或 hotfix iter 4 PI Demolish reorder 引入 | ~30 |
| Plan-R12-autopilot-hitregion | P1 | autopilot checkbox CSS hit-region 修；A3 reported click works via JS but visible region wrong | ~20 |
| Plan-R12-wood-food-balance | P1 | wood snowball + food collapse mitigation：zero-lumber 安全网 priority 50 instead of 95 OR 加 max wood cap before next farm | ~40 |
| Plan-R12-non-temperate-fallback | P1 | non-Temperate maps 7-8 min wipe — review fallback director per-template tuning；可能加 per-template difficulty modifier | ~50 |

总估 ~250 LOC，全 freeze-clean。

## Stop conditions (after R12)

| 条件 | 状态 |
|---|---|
| A1 0 P0 streak | **MET 7 rounds ✅** (R6-R12) |
| A2 P50/P5 ≥ target | **R12 first GREEN ever**；R13 GREEN 才 MET 2-consecutive |
| A3-A7 trend | mixed regression-laden; R-1 to R-7 上面 |
| B1 closed/defer | **MET 9 rounds ✅** |
| B2 all green | 18/22 plateau (4 PENDING author-fill) |
| C1 debt + 0 D | +1A R12；2 D 级仍 |
| Validator 2 GREEN | R8+R9 已 MET；R11 GREEN restores；R10 YELLOW |

**MET 累计：A1 streak ✅ + B1 ✅ + Validator 2 GREEN ✅**
