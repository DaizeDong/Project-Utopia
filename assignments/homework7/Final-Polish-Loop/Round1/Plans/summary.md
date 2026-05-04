---
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
total_plans: 10
accepted: 10
deferred: 0
rejected: 0
freeze_violations: 0
wave_count: 2
total_loc_estimate: ~870
---

# Round 1 — Plans Summary

## Plan 列表（按 wave + 优先级）

| reviewer_id | track | priority | LOC | files | wave | accept/defer/reject | 备注 |
|---|---|---|---|---|---|---|---|
| A1-stability-hunter | docs | P2 | n/a | 0 (plan only) | wave-0 | accept | no-op；GREEN streak 仅 documented，无 code 改动 |
| B1-action-items-auditor | docs | P2 | ~30 | 2 | wave-0 | accept | AI-6 documented-defer 入 CHANGELOG + PROCESS-LOG → 让 B1 满足"all closed/documented-defer"停止条件 |
| B2-submission-deliverables | docs | P1 | ~50 | 4 | wave-0 | accept | build-submission.sh + `npm run submission:zip` + PROCESS-LOG 标 4 AUTHOR ACTION（pillar names / Post-Mortem 内容 / demo URL / submission format）|
| A5-balance-critic | code | P0 | ~85 | 5 | wave-0 | accept | **核心**：v0.10.1-l food drain 没接到 entity.hunger，加 `workerHungerDecayWhenFoodZero=0.020` + 3 BALANCE keys 修 do-nothing；新 BALANCE 字段（既有结构添字段，非新机制）|
| C1-code-architect | code | n/a | ~159 | 4 | wave-0 | accept | wave-2/4：抽 `src/simulation/npc/PriorityFSM.js` 通用 dispatcher + WorkerFSM.js 124→30 LOC facade + 修 debt-pop-2 把 `__devForceSpawnWorkers` 移到 `src/dev/forceSpawn.js`；system_order_safe=true |
| A2-performance-auditor | code | P1 | ~80 | 2 | wave-1 | accept | SceneRenderer.js #pressureLensSignature short-circuit + scratch reuse + #updatePressureLensLabels Map reuse + entityMesh ≥1/30s throttle |
| A3-first-impression | code | P0 | ~70 | 3 | wave-1 | accept | SceneRenderer.js:524 orthoSize 0.65→0.55 + zoom 1.12→1.0；#onPointerDown 重排让 placement 优先 entity-pick；BuildAdvisor.js:628 toast 改 honest "1 segment placed, 0/N anchors linked" |
| A4-polish-aesthetic | both | P1 | ~150 | 5 | wave-1 | accept | R0 lighting tint 振幅放大（colorBlend 0.35→0.62）+ 4 视觉 bug fix + InstancedMesh id-hash 抖动避 worker stacking + Post-Mortem audio/walk-cycle 正式 defer |
| A6-ui-design | code | P0 | ~140 | 2 | wave-1 | accept | #statusBar 1366 wrap 2 行 + 1024 #sidebar z-index:14 + hover library 6 panel + BuildToolbar.sync() 派生 disabled state from BUILD_COST vs resources |
| A7-rationality-audit | code | P0 | ~95 | 4 | wave-1 | accept | 4/5 P0：legend 颜色名校对 / `buildFoodDiagnosis` 加 predator+visitor early-return / worker list 注 visitor/animal 身份后缀 / "Survived"→"Run" chip rename；P0#2 `STABLE`+empty 让给 A5（食物速率根因在 A5 hunger fix）|

## 仲裁记录

### 冲突识别 + 决议

| Plan A | Plan B | 冲突 | 决议 |
|---|---|---|---|
| A2 | A3 | SceneRenderer.js 不同行段（A2: 2256-2304/2568-2587/3145-3152；A3: 524/530/372/3492/3941）| 同 wave-1，A2 先（perf 改完再做交互）→ A3 后；不同行段无直接冲突 |
| A2 | A4 | SceneRenderer.js（A4 改 InstancedMesh setMatrix；A2 改 entityMesh interval）| A2 先 → A4 后。A4 的 jitter 必须在 A2 throttle 之后做以避免 jitter 也被节流 |
| A3 | A4 | SceneRenderer.js + index.html | A3 早于 A4，但 A3 不动 CSS；A4 动 1024 media。无重叠 |
| A4 | A6 | index.html CSS @media 1024/1366 | A4 改 statusBar 1024 + shortcut wrap 1366 + media；A6 改 statusBar 1366 wrap + 1024 sidebar z-index。两者都动 1024 与 1366 媒查询区。**A6 先（A6 是 P0，A4 是 P1）→ A4 后做余量补全**；implementer 必须 read 当前文件再 edit |
| A4 | A7 | "Survived"→"Run" chip rename：A7 step 8/9 处理顶 chip，A4 不处理 | A7 内做完，A4 不重叠 |
| A5 | A7 | HUD double-clock + STABLE + empty contradiction | A7 显式 defer 到 A5；A5 plan 不直接处理 HUD 时钟（双 clock 让 A7 R2 重新评估） |
| A5 | A3 | 起始 viewport 改动后 A5 score derivation 公式中"productive building seconds"会受影响 | 无文件冲突；A5 BALANCE.* 与 A3 渲染独立 |
| C1 | A5 | C1 移 `__devForceSpawnWorkers` 到 src/dev/，留 re-export shim；A5 改 BALANCE/economy 不动 PopulationGrowthSystem | 无冲突 |
| C1 | A2 | C1 抽 PriorityFSM 不动 SceneRenderer | 无冲突 |

### Freeze 违规扫描

**0 violations**。重点确认：

- A5 添加 4 个新 BALANCE keys（workerHungerDecayWhenFoodZero / warehouseWoodSpoilageRatePerSec / survivalScorePerProductiveBuildingSec / autopilotQuarryEarlyBoost）— **HW7 freeze 允许"沿用既有 BALANCE 常量结构"**。这些是 BALANCE.js 既有 object 上的新字段，绑定到 EXISTING 系统（hunger, spoilage, score, autopilot）。不是新 mechanic / role / building / panel。✅ PASS
- A4 audio + walk-cycle 在 plan 中明确 defer 到 Post-Mortem；不引入新 asset / 新 mesh / 新 sprite rig
- C1 是 wave-2/4 of refactor roadmap；保持 system_order_safe=true、外部行为不变（既有测试 + 1 invariant 新测试）
- A6 hover library 是 CSS 类，不是新 panel；BuildToolbar.sync() 是既有 method 的 enhancement

### Track 边界

- 4 plan 是 docs：A1 / B1 / B2（部分 + 1 build script bash 文件 OK 在 docs/build-tooling 范畴）
- 5 plan 是 code：A2 / A3 / A5 / A6 / A7 / C1
- 1 plan 是 both：A4（5 code steps + 1 Post-Mortem docs step）

### LOC budget

- 单 plan 最大 = C1 ~159 LOC（4 wave 重构 wave-2，远低于 400 上限）
- 总 ~870 LOC

## 执行顺序（wave）

### wave-0 — docs + 隔离的 critical fixes — 5 plans

| 序号 | reviewer_id | track | 估时 | 备注 |
|---|---|---|---|---|
| 1 | A1-stability-hunter | docs | ~5 min | no-op，最快 |
| 2 | B1-action-items-auditor | docs | ~10 min | CHANGELOG defer + PROCESS-LOG |
| 3 | A5-balance-critic | code | ~30 min | **关键**：entity.hunger 接通 + 4 新 BALANCE keys；先打入让 wave-1 的 UI plans 看到正确 fail-state 行为 |
| 4 | C1-code-architect | code | ~35 min | PriorityFSM 抽取（大改但隔离）+ debt-pop-2 |
| 5 | B2-submission-deliverables | docs | ~25 min | build-submission.sh + npm script + PROCESS-LOG 4 AUTHOR ACTION |

wave-0 总估时 ~105 min（串行）

### wave-1 — SceneRenderer + UI cluster — 5 plans

| 序号 | reviewer_id | track | 估时 | 备注 |
|---|---|---|---|---|
| 1 | A2-performance-auditor | code | ~25 min | SceneRenderer perf；先做让 A3/A4 的渲染改动跑在新 perf baseline 上 |
| 2 | A3-first-impression | code | ~25 min | SceneRenderer 不同行段（camera + onPointerDown） |
| 3 | A6-ui-design | code | ~30 min | index.html CSS + BuildToolbar.js；A6 P0，A4 P1，所以 A6 先 |
| 4 | A7-rationality-audit | code | ~30 min | InspectorPanel + worker list + 4/5 P0 |
| 5 | A4-polish-aesthetic | both | ~30 min | InstancedMesh jitter + lighting amplify + Post-Mortem defer 注；最后做兜底 |

wave-1 总估时 ~140 min（串行）

### 总估时

~105 + ~140 = **~245 min** Stage C wall-clock + Stage D ~60-90 min Validator = **~335 min** total Round 1

## 给 Implementer 阶段的关键指引

1. **wave-0 第 3 个 plan = A5 是 critical**：不接通 entity.hunger 的话，所有下游测试和 reviewer 会继续看到 do-nothing 通关。先打入。
2. **wave-0 第 4 个 plan = C1 是大改**：PriorityFSM 抽取需要 invariant test 锁住外部行为。如失败 5 轮 → rollback `1f6ecc6` 跳过本轮 C1，下轮重做。
3. **wave-1 严格按表内顺序**：A2 → A3 → A6 → A7 → A4。每 commit 后 `node --test`。
4. **A4 是 track=both**：implementer 必须 Post-Mortem docs step 与 code 分清。建议 Post-Mortem step 在最后一步且单独 hunk（commit 内 docs 文件 + code 文件 OK，但要在 commit message 注明）。
5. **A5 加新 BALANCE 字段**：如 implementer 担心 freeze 边界，可在 commit log 中明确"既有 BALANCE 对象上的新字段，绑定 existing systems"。
6. **C1 PriorityFSM extract**：必须保持 1665 测试基线全绿（除已知 4 pre-existing failures）；A5 的 new BALANCE keys 可能让 food-rate-breakdown / role-assignment 这两个 pre-existing failure 变化形态，validator 须 stash-and-rerun 验证。

## Validator 关注点（提前预告）

- Gate 1：A5 + C1 + wave-1 commits 后总测试数应增加 ~10-15；4 pre-existing failures 可能形态变化（A5 的 hunger fix 可能让 food-rate-breakdown 测试通过 / 失败方式不同）
- Gate 2：A4 lighting amplify 用 Three.js 既有 lights，不应有 prod build 风险；A6 disabled state derivation 是 DOM 操作不会破 build
- Gate 3：A2 perf 改动应让 P50 从 54-56 → 接近 60；用 `__fps_observed` 测
- Gate 4：A5 加新 BALANCE 字段在 src/config/balance.js — freeze-diff 应通过（不是 TILE / role / audio / panel / sim 子目录新增）
- Gate 5：A4 lighting amplify 不该让 bundle 变大（仅 number tweaks）；C1 PriorityFSM 抽取可能让单 chunk 内代码重新组织，注意 chunk 大小
