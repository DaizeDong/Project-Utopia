# Determinism Report — S0 audit

**Date:** 2026-05-09
**Branch:** `refactor/academic-benchmark`
**Tag baseline:** `pre-academic-refactor-v0.10.0` (commit `16a593d`)

## Test baseline (pre-refactor)

```
tests       2064
pass        2059
fail           1   bare-init: worker stuck >3.0s sim (v0.10.0 FSM regression, slated for S2 cleanup)
skip           4
duration   83.5 s
```

## Q1 — `rng.js` 全覆盖？

`tools/audit/rng-coverage-report.js` 输出 12 处 `Math.random()` 调用：

| 位置 | 处置 |
|---|---|
| `src/app/createServices.js:153` | KEEP — needs fix |
| `src/app/GameApp.js:2602` | CUT (S1) — self-resolves |
| `src/app/leaderboardService.js:38` | CUT (S1) — self-resolves |
| `src/render/SceneRenderer.js:1854/4415/4416/4417/4438` | CUT (S1) — self-resolves |
| `src/simulation/npc/AnimalAISystem.js:629` | CUT (S3 D4) — self-resolves |
| `src/simulation/npc/WorkerAISystem.js:1263` | KEEP — needs fix in S3 cleanup |
| `src/world/grid/Grid.js:94, 3537` | KEEP — needs fix in S3 cleanup |

**Conclusion:** After S1+S3, 3 leaks remain (`createServices.js`, `WorkerAISystem.js`, `Grid.js`). These are addressed in the post-S3 RNG patch sweep.

## Q2 — `PathWorkerPool` 等价性

`createServices.js:107-110` 已确认：当 `options.deterministic === true`，`pathWorkerPool` 设为 `null`，所有 A* 走同步路径。Benchmark 模式默认走 `deterministic: true`（`SimHarness` 启动应当如此 — S0 末尾验证）。

**Action**：S0 不动；在 S5 AgentAdapter 改造时，`SimHarness` boot 默认开 `deterministic: true`。

## Q3 — `MemoryStore.formatForPrompt` 截断策略

`src/simulation/ai/memory/MemoryStore.js`：
- `MAX_EVENTS = 200`（环形缓冲，第 201 条事件挤掉第 1 条）
- `formatForPrompt(limit = 30)`：从最新往前取 `limit` 条
- **结论**：双层截断。MemoryStore 内部 200 上限保护内存，formatForPrompt 30 上限保护 prompt token。**满足 24h harness 复现性前提。**

## Q4 — `groupContracts` 版本化

`src/simulation/ai/llm/Guardrails.js` 与 `ResponseSchema.js`：当前未在响应 envelope 内显式带版本号。

**Action**（S5）：`PromptPayload.envelope` 增加 `schemaVersion: "1.0"` 字段；`AgentAdapter.request()` 拒绝 mismatch。

## Determinism check tool

`tools/audit/determinism-check.js` — runs SimHarness 1800 ticks twice with seed=0xC0FFEE, hashes state, exits 0 on equality. Will be wired into CI in S6.

## Verdict

S0 通过条件：

- [x] 测试基线已记录
- [x] RNG 覆盖审计已跑（12 leak，9 自解决，3 待 S3 后修）
- [x] PathWorkerPool 等价性路径已存在（`deterministic` flag）
- [x] MemoryStore 截断策略明确（200 / 30 双层）
- [ ] groupContracts 版本化（S5 落地）
- [x] 失败测试 `bare-init worker stuck` 已知，规划在 S2 清理

S0 → S1 可以推进。
