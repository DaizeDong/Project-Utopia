# Project Utopia 全量优化进度总表

更新时间: 2026-03-02（本轮已完成 `verify:full`）

## 总览
- 总体完成率（当前估计）: 68%
- 当前里程碑: `M1/M2` 基本通过，`M3/M4` 持续迭代
- 阻塞项: 无硬阻塞；`M5` 深拆与 Playwright 行为测试仍待执行
- 本轮验收:
  - `npm test`: pass (27/27)
  - `npm run test:ui`: pass
  - `npm run build`: pass
  - `npm run bench:perf`: pass（产出 `docs/assignment3/metrics/perf-baseline.csv`）
  - `npm run verify:full`: pass
  - 截图基线: `pending`（Playwright MCP 在当前环境超时，待下轮补抓）

## 任务表
| 任务ID | 目标 | 变更文件 | 前后指标 | 当前问题 | 下一步 | 状态 | 时间戳 |
|---|---|---|---|---|---|---|---|
| OPT-D01 | 建立单一进度文档 | `docs/optimization-progress.md` | 文档从无到有 | 需持续维护 | 每次迭代实时更新 | done | 2026-03-02 |
| OPT-S01 | ai-proxy 健康探针与端口错误处理 | `server/ai-proxy.js` | 新增 `GET /health`，`EADDRINUSE` 可解释退出 | 无 | 补健康探针测试 | done | 2026-03-02 |
| OPT-S02 | 验证脚本去 sleep 化，改主动探测 | `scripts/verify-a3.mjs`, `scripts/capture-live-ai-evidence.mjs` | 启动等待从固定 sleep -> 健康探测轮询 | 无 | 在 CI 场景继续观察稳定性 | done | 2026-03-02 |
| OPT-S03 | 统一 warning ring buffer | `src/app/warnings.js`, `src/app/GameApp.js`, `src/render/SceneRenderer.js`, `src/simulation/economy/ResourceSystem.js` | 警告管理统一、支持 source/level；多处直接 push 已收敛 | UI 暂未分级上色 | 下轮给 warning 增加 level 颜色 | done | 2026-03-02 |
| OPT-S04 | 渲染资源释放通道 | `src/render/SceneRenderer.js`, `src/app/GameApp.js`, `src/main.js` | 增加 `dispose()`；解绑事件，释放几何/材质/贴图 | 仍需长期观察显存曲线 | 增加高频切换压力测试 | done | 2026-03-02 |
| OPT-S05 | 人口控制语义统一（base/stress 分层） | `src/app/GameApp.js`, `src/ui/tools/BuildToolbar.js`, `src/ui/panels/PerformancePanel.js`, `index.html` | UI 增加 base/stress/total 显示；apply population 文案明确 base | 深层统计仍有细化空间 | 并入后续性能轮次 | done | 2026-03-02 |
| OPT-R01 | 引入 seeded RNG service | `src/app/rng.js`, `src/app/createServices.js`, `src/app/GameApp.js`, `src/entities/EntityFactory.js` | 主链路替换 `Math.random`，支持 RNG snapshot；新增 determinism 测试 | 自动复播执行器未完成 | 推进 replay apply pipeline | in_progress | 2026-03-02 |
| OPT-R02 | fallback AI 确定性化 | `src/simulation/ai/llm/PromptBuilder.js` | fallback 环境决策去随机 | 仍需多场景验证稳定性 | 增加 deterministic 回归用例 | done | 2026-03-02 |
| OPT-P01 | UI 聚合首轮优化 | `src/app/GameApp.js`, `src/ui/hud/HUDController.js`, `src/ui/panels/PerformancePanel.js` | population 统计从多次 filter -> 缓存读取；新增 ui/render CPU 指标 | 其它统计仍有优化空间 | 扩展到更多面板统计 | done | 2026-03-02 |
| OPT-F01 | Undo/Redo 构建历史 | `src/simulation/construction/BuildSystem.js`, `src/app/GameApp.js`, `src/ui/tools/BuildToolbar.js`, `index.html` | 建造支持撤销/重做并同步资源 | 仅覆盖 build/erase；未覆盖 map regenerate | 后续加跨操作历史策略 | done | 2026-03-02 |
| OPT-F02 | Snapshot Save/Load（slot） | `src/app/snapshotService.js`, `src/app/GameApp.js`, `src/ui/tools/BuildToolbar.js`, `index.html` | 增加快照存储与恢复（slot） | 尚未提供文件导入按钮 | 增加 JSON 导入入口 | in_progress | 2026-03-02 |
| OPT-F03 | Replay 事件导出 | `src/app/replayService.js`, `src/app/GameApp.js`, `src/ui/tools/BuildToolbar.js`, `index.html` | 增加关键事件记录与 JSON 导出 | 未实现“回放执行器” | 增加 replay apply pipeline | in_progress | 2026-03-02 |
| OPT-F04 | 预设对比器 | `src/app/GameApp.js`, `src/ui/panels/DeveloperPanel.js`, `src/ui/tools/BuildToolbar.js` | 同 seed 预设统计对比可生成并展示（文本） | 结果不是图形并排 | 后续升级为可视化对比面板 | in_progress | 2026-03-02 |
| OPT-T01 | 单测扩展（undo/redo, rng, snapshot, proxy health） | `test/build-system.test.js`, `test/rng-determinism.test.js`, `test/snapshot-service.test.js`, `test/proxy-health.test.js` | 覆盖面提升 | 仍缺 UI 行为自动化（Playwright） | 增加 UI 行为 smoke 测试 | in_progress | 2026-03-02 |
| OPT-T02 | 新增性能基线脚本与全量验证脚本 | `scripts/bench-perf.mjs`, `scripts/verify-full.mjs`, `package.json` | 新增 `bench:perf` / `verify:full` / `test:ui`，并完成执行 | 性能门槛阈值尚未硬编码 | 下一轮加入阈值判定 | done | 2026-03-02 |

## 风险列表
- `M5` 深度结构拆分尚未开始，当前 `SceneRenderer/Grid/GameApp` 仍偏大。
- `Snapshot` 当前主要依赖 localStorage slot，文件导入工作流未闭环。
- `Replay` 目前是事件日志导出，尚无真正“自动复播”执行器。

## 已决策记录
- 采用“渐进重构”，每轮均可运行且可回归。
- 桌面高配优先，移动端仅保持可打开与主要控件可用。
- 验收以体验门禁为主，测试/构建为硬门槛。

## 下一步（按优先级）
1. 完成 `M1` 收口：验证 `SceneRenderer.dispose` 在高频切换下无持续增长。
2. 完成 `M2` 收口：补 deterministic 行为轨迹测试（同 seed + 同操作签名）。
3. 推进 `M3`：拾取与渲染脏更新进一步节流，建立固定负载前后对比表。
4. 推进 `M4`：补快照 JSON 导入与 replay 复播执行器。
5. 启动 `M5`：按模块拆分 `SceneRenderer` 与 `Grid`，每次拆分后全量回归。

## LOGIC-BASELINE-2026-03 (new)

Timestamp: 2026-03-03T05:27:43Z
Command: `npm run bench:logic`
Output: `docs/logic-baseline-2026-03.json`

### Baseline Metrics
- `goalFlipCount`: 163
- `invalidTransitionCount`: 0
- `deathsTotal`: 5
- `deliverWithoutCarryCount`: 0
- `pathRecalcByEntityTopN[0]`: `animal_30=86`

### This Iteration (logic consistency hardening)
- Added strict feasibility gate: `src/simulation/npc/state/StateFeasibility.js`
- Planner now resolves `local -> policy -> ai` with strict feasibility checks
- Worker `deliver` now hard-guards `carry>0` and breaks stale task-lock on invalid deliver
- Worker emergency ration now has cooldown + hard hunger threshold + reachable-food guard
- Visitor trade/saboteur loops now avoid immediate wander fallback jitter
- Animal logic adds flee hysteresis and predator target-switch throttling
- Mortality uses mixed nutrition reachability (carry/warehouse/nearby farm)
- Added metrics: `avgGoalFlipPerEntity`, `deliverWithoutCarryCount`, `feasibilityRejectCountByGroup`, `starvationRiskCount`
- Added script: `scripts/logic-baseline.mjs` + npm script `bench:logic`

### Verification
- `npm test`: pass (57/57)
- `npm run build`: pass
- `npm run bench:logic`: pass
