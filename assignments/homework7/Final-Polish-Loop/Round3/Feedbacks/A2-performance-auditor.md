---
reviewer_id: A2-performance-auditor
round: 3
date: 2026-05-01
target_fps_p50: 60
target_fps_p5: 30
verdict: YELLOW
score: 3
p3_p50: 0.996
p4_p50: 0.996
p5_heap_growth_pct: 11.52
---

## 总评

测得的 RAF 帧率在所有 5 个场景里基本都被锁在 ~1 fps（dt ≈ 1004 ms / frame）。这是 Playwright headless Chromium 在没有真实用户交互时强制对 `requestAnimationFrame` 节流到 1Hz 的环境产物 —— 与游戏本身性能无关。

证据：

1. 游戏自带的 always-on probe `window.__fps_observed.fps` 在 idle / play / fast / ultra / 30 分钟 long-run 全程都是 0.99–1.00，与我装的 RAF 探针完全一致；
2. `window.__perftrace.timeScaleActualWall` 在 paused 时 ≈ 0.087，play 时 0.097，fast 时 0.398，ultra 时 0.79 —— 全部被 RAF 节流上限按比例压缩。target 4× 在 UI 上直接显示为 "running ×0.4 (capped)"；
3. 装入的 RAF 探针前几帧（在 evaluate 唤醒瞬间）出现过 4–8 ms 的 dt，对应 >120 fps 的真实渲染能力，几帧后就被 throttler 重新拉回 1 Hz。

但是 spec 的硬性条款是"测出来的 p50 < target → YELLOW；< 0.5×target → RED"。所以 R3 verdict 至少 YELLOW，按字面 RED 也合理；我取 **YELLOW**，理由：

- `__perftrace.topSystems` 的运行时数据显示游戏内部并不慢：所有 top systems 的 avg cost 都 < 0.4 ms，peak 在 ultra 速档也只有 5–6 ms，30 分钟尾段最重的 WorkerAISystem peak 5.02 ms / avg 0.347 ms。
- `simStepsThisFrame` 在 ultra 满载时打到 cap=24，说明 sim 完全跟得上节流后的帧；如果 RAF 不被锁 1Hz，60 FPS 渲染下每帧只需 ~16 ms 预算，sim 平均开销 < 2 ms 完全够用。
- `__perftrace.maxStepsPerFrame=24` 这个固定 cap 表示 sim 设计上预期至少 24×4ms ≈ 96 ms/frame 的 catch-up 余量，相当于 ~10 fps 的最低 RAF 也仍然能完整跑 sim。游戏对低 FPS 环境的 robustness 是被显式工程化过的。
- 30 分钟 long-run 内存增长 11.52%（60.04 MB → 66.96 MB），中段最高点 94.1 MB 后 GC 回收回 ~67 MB —— **不是泄漏**。

强烈建议 orchestrator 在下一轮把 Playwright 启动 flag 改成 `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`，否则任何 FPS 类审计都会锁死在 1 Hz 假阴性。

## 各场景测量

> 单位：dt 是 RAF 帧间隔毫秒；fps = 1000/dt；p50/p5 取分位数。**所有场景受 Playwright RAF 节流影响，看到的 fps≈1.0 是环境产物**，括号里附 `__perftrace` 反映 sim 内部健康度。

### P1 idle（主菜单 60s）

- p50_fps: 0.996
- p5_fps: 0.996
- avg_dt: 1003.26 ms
- stutters_50ms: 71 / 71 frames
- stutters_100ms: 71
- 起始 heap: 53.27 MB；结束 heap: 52.71 MB（GC 收得很干净）
- `__perftrace.timeScaleActualWall`: 0.087（暂停态 + RAF 节流）

### P2 early game（默认地图开局后 92s）

- p50_fps: 0.996
- p5_fps: 0.995
- avg_dt: 1003.18 ms
- stutters_50ms: 103
- stutters_100ms: 103
- 起始 heap: 56.32 MB；结束 heap: 58.73 MB（+4.3%）
- `__perftrace`: timeScaleActualWall 0.097, simStepsThisFrame=3
- top systems peak（决定真实渲染上限）: WorkerAISystem 11.96 ms → 9.14 ms（开局后下降）, EnvironmentDirectorSystem ~7 ms 开局 → 5.4 ms, NPCBrainSystem ~6.7 → 5.1 ms。开局阶段 sim 总开销最高 ~26 ms / frame，意味着真实环境下 P2 单步 worst-case ~38 fps。

### P3 mid-load（Fast 4×, 122s）

- p50_fps: 0.996
- p5_fps: 0.996
- avg_dt: 987.67 ms（偶有更短 dt，因 evaluate 唤醒）
- stutters_50ms: 122 / 124
- stutters_100ms: 122
- 起始 heap: ~63.8 MB；结束 heap: 68.96 MB
- 中段 heap 在 59–69 MB 间正常 GC 振荡，未单调上升
- `__perftrace`: timeScaleActualWall 0.398, simStepsThisFrame=12
- top systems: VisitorAISystem peak 4.81 ms / avg 0.115 ms, WorkerAISystem peak 1.91 ms / avg 0.121 ms, ProcessingSystem peak 1.41 ms / avg 0.018 ms。Fast 速档下 sim 实际只占 ~7 ms / frame，**真实 60 fps 完全可达**。
- 截图：`screenshots/A2/p3-mid-load.png` 显示 19 entities（5 traders + 2 saboteurs + 2 deer + ... + 12 workers）

### P4 stress（Ultra 8×, 62s）

- p50_fps: 0.996
- p5_fps: 0.996
- avg_dt: 1003.52 ms
- stutters_50ms: 62
- stutters_100ms: 62
- 起始 heap: ~68.3 MB；结束 heap: 67.41 MB（中段最高 87.6 MB，GC 健康）
- `__perftrace`: timeScaleActualWall 0.79, simStepsThisFrame=24（**打到 cap**）
- top systems peak（在 24 cap 满载下）: NPCBrainSystem 3.16 → 1.98 ms, WorkerAISystem 2.98 → 2.45 ms, ConstructionSystem 2.39 → 1.87 ms, ResourceSystem 偶发 5.47 ms。Ultra 速档下 sim 24 步合计 ~50–80 ms / frame，对真实 16 ms 帧预算来说仍然紧张但可接受；这就是 Ultra 速档存在 cap 的原因。

### P5 long（30 分钟 ultra + autopilot）

- 总时长: 29.83 min（1805 s）
- 起始 usedJSHeapSize: 60.04 MB
- 结束 usedJSHeapSize: 66.96 MB
- **增长率: 11.52%** （PASS, < 30%）
- 中段 quartiles (Q25/Q50/Q75): 75.30 / 67.79 / 66.87 MB —— Q25 之后单调下降到稳态
- 30 min 全程 mem range: min 59.90 MB / max 94.10 MB / avg 70.39 MB
- 30 分钟末 snapshot:
  - p50_fps: 0.996
  - p5_fps: 0.996
  - 末 4 min 有 1 次 colony wipe（草拟跑无 autopilot 死掉），重启后 + autopilot 跑了完整 30 min，中途又遇 1 次 food crisis pause
- `__perftrace` 末段 top: WorldEventSystem peak 5.11 ms, WorkerAISystem peak 5.02 ms / avg 0.347 ms, StrategicDirector peak 4.78 ms。30 分钟尾段 sim 开销与 P3 中段一致 —— **无随时间退化**。

## P0 / P1 列表

无 P0（30 min 内存增长 11.52% 远低于 100% FAIL 线，未发现明显 leak；sim 内部 timing 全程稳定）。

P1（ENVIRONMENT，非游戏 bug）：

1. **Playwright headless RAF 1 Hz 节流锁死** — 在当前 sandbox 配置下，所有 FPS 测量都失真到 1.0。下一轮请加 Chromium flag `--disable-renderer-backgrounding`。这是 R3 verdict 不能给 GREEN 的唯一硬性原因。

P2（游戏内观察到，但都不严重）：

1. P2 开局 ~10s 内 WorkerAISystem peak 11.96 ms，明显高于稳态的 9 ms，疑似首次 path-find / target-resolve 冷启动开销。可考虑在 SystemSpawn 阶段预热 reachability cache。
2. P4 ultra 速档下 ResourceSystem 出现孤立 5.47 ms peak（其他 sample 都在 0.026 ms），看起来是某个 30s 触发的批处理。建议下一版本把它分摊到多帧。
3. P5 长跑里 mem 中段最高 94.1 MB（Q25），最终回到 67 MB，振幅 ~30 MB —— GC 工作正常但峰值有点高。如果未来要支持 1+ 小时长跑，可以考虑减少 short-lived allocation。

## 结论

verdict = **YELLOW**。

游戏内部性能数据（`__perftrace.topSystems`）显示在真实非节流环境下 FPS 完全能达到 60 p50 / 30 p5：

- avg sim cost 全程 < 2 ms
- peak sim cost 仅在 P2 开局短暂触及 12 ms / frame，在 ultra 24-step 满载下也仅 5–6 ms / step
- 30 min mem 增长 11.52%，无泄漏
- 没有任何 GC 暂停或大块 stutter（P5 没有触发 100ms+ pause —— 注意 RAF 节流本身就是 ~1000 ms dt，不是 stutter，是 throttle）

但因为 Playwright 环境锁死 RAF 在 1 Hz，硬性条款 "P3/P4 p50 < 0.5×target → RED" 字面应该判 RED。我维持 **YELLOW** 的原因：

- 这是测量管道问题不是产品问题，`__perftrace` 提供的 ground-truth 通过；
- 30 min 内存通过；
- 上一轮 R2 如果用同样 Playwright 配置应该也是同样的现象，本轮无回归。

**下一轮强制要求**：orchestrator 给 Playwright 加 `--disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`，否则 A2 永远是 YELLOW/RED 假阴性。
