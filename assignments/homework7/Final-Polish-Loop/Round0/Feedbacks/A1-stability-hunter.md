---
reviewer_id: A1-stability-hunter
round: 0
date: 2026-05-01
verdict: GREEN
score: 8
p0_count: 0
p1_count: 0
p2_count: 2
sessions_run: 5
total_minutes: 22
---

## 总评

本轮稳定性盲测共跑 5 个会话（S1–S5）外加一个对抗 API fuzz 子会话，每个 session 都通过 `browser_navigate http://127.0.0.1:5173/` 全新加载，并在 `window.error` / `unhandledrejection` 上挂钩持续累计。整个 session 矩阵执行下来：**未出现一次崩溃、白屏、WebGL context lost、永久卡死或显示给玩家的 NaN 数字**。`telemetry.nonFiniteMetrics` 在每个 session 的多次采样中始终为空数组；`telemetry.warnings.errorCount` 始终为 0；`window.__qa_errors` 在五个 session 里只在 S5 里捕到 1 次「ResizeObserver loop completed with undelivered notifications.」——这是 Chromium 标准、仅在剧烈连续 resize/zoom 时触发的良性警告，未影响任何渲染或模拟逻辑（FPS 与 sim tick 在该事件之后都正常推进），不构成游戏稳定性问题。

`__utopiaLongRun` 调试 API 的输入校验非常严格：用错误的 toolName、出界坐标、null/NaN、未知 entityId 喂入 `placeToolAt` / `focusTile` / `focusEntity` / `selectTile` / `selectEntity` / `configure` 共 12 种异常组合，全部以 `{ ok: false, reason: 'invalidArgs', reasonText: ... }` 或 `null` 安全返回，**无一抛出未捕获异常**。连发 90 次合法 place/erase 也无内存或 NaN 退化。`saveSnapshot()` 在没有显式参数时返回 `undefined` 而 `loadSnapshot(undefined / null / 'not-json' / { bogus:true })` 全部静默吞掉而不报错——这不是崩溃，但是**静默降级**（见 P2-1），如果有玩家依赖该 API 导出云存档可能会困惑。

性能方面，headless 环境下 Chromium 在 MCP 工具调用空档会大幅 throttle rAF，sim tick/FPS 经常掉到 1–5 fps（所有 session 都观察到），这是测试环境产物而非游戏 bug——一旦回到主动交互窗口，FPS 立刻恢复 33–60。Heap 在所有 session 中稳定在 57–93 MB 区间，无累积式增长，最高 93 MB 出现在 S1 五分钟之后但 S4 与 S5 又回落到 57–60 MB，说明 GC 工作良好。

综上，0 P0 + 0 P1 + 2 P2 → 评级 **GREEN**，分数 8/10（因为 S4 长程在 headless 下被 throttle 实际游戏时间未能跨入"30 分钟后期"，留下一个不能完全证实的盲点；但在能观察到的所有窗口里没有任何稳定性问题）。

## P0 列表

无。

## P1 列表

无。

## P2 列表

### P2-1: `saveSnapshot()` / `loadSnapshot()` 静默无操作（无返回值、无报错）
- session: S3
- 时间戳: ~01:30
- 复现步骤:
  1. `Start Colony` 进入默认地图。
  2. 在 DevTools / 调试 API 中执行 `window.__utopiaLongRun.saveSnapshot()`。
  3. 观察返回值：`undefined`。
  4. 进一步调用 `window.__utopiaLongRun.loadSnapshot(undefined)`、`loadSnapshot(null)`、`loadSnapshot('not-json')`、`loadSnapshot({ bogus: true })`。
- console.error / stack: 无（既不抛错也不写 console.warn）。
- 影响: API 暴露在 `__utopiaLongRun` 上但既不写盘也不报错。如果有自动化/玩家工具依赖快照 API，会以为成功但其实拿到 undefined。建议：要么真正实现保存（返回 JSON 结构），要么在调用时显式 console.warn 并返回 `{ ok:false, reason:'notImplemented' }`，与 `placeToolAt` 的失败约定保持一致。
- 严重度依据: 不阻塞游戏、不损坏现存数据，所以是 P2 不是 P0/P1，但属于 API 契约不一致问题。

### P2-2: 剧烈 resize/zoom 连发触发 `ResizeObserver loop completed with undelivered notifications.`
- session: S5
- 时间戳: ~00:45
- 复现步骤:
  1. `Start Colony` 后立即 `browser_resize` 4 次（600×400 → 2560×1440 → 320×240 → 1280×800），CSS `zoom` 在 0.5 → 2.0 → 1.0 之间瞬切，再 dispatch 30 次 `resize` 事件。
  2. `window.__qa_errors` 增加 1 条，message 为 `ResizeObserver loop completed with undelivered notifications.`。
- console.error / stack: 仅 message，没有附带堆栈（浏览器不提供）。
- 影响: 这是 Chromium 内置的良性警告，不影响 FPS（仍然 18 fps 以上）、不影响 sim、不影响渲染。但会污染玩家的 DevTools 控制台，对追新 bug 的开发者干扰也不大。建议：在 `window.addEventListener('error', ...)` 注册时过滤掉 `e.message.startsWith('ResizeObserver loop')`，常见做法。
- 严重度依据: 浏览器自带且众所周知的 false positive，非游戏 bug。

## Sessions 摘要

| Session | 场景 | 持续 (wall) | sim 时间推进 | console.error | unhandledrejection | 崩溃次数 | 备注 |
|---------|------|------------|--------------|---------------|--------------------|----------|------|
| S1 | 默认 Temperate Plains，Autopilot ON，速度切换 1x→2x→3x→1x | ~5 min | 0 → 151 s, tick 0 → 4533 | 0 | 0 | 0 | FPS 33–45（活跃窗口），heap peak 93 MB；deaths total 1（捕食），未饥饿。AI proxy 起来后 LLM 调用 8 次。|
| S2 | 默认地图，无建造、无 autopilot、3x 持续 5 min | ~5 min | 0 → 75 s | 0 | 0 | 0 | 食物 175→152 缓慢下降，Threat 21，无饥饿死亡，无 NaN。|
| S3 | UI 频繁切换：tools 1–9 + L + T + Space + Esc + F1，Build/Colony/Settings/AI Log 标签轮流；通过 `regenerate({templateId:...})` 在 6 张地图模板间瞬切；`saveSnapshot` / `loadSnapshot` 多形态、`setAiEnabled` 6 次连切 | ~1 min | n/a (持续重置) | 0 | 0 | 0 | 6 模板全部成功重生成，FPS 全部 57–60；save/load 静默（P2-1）。|
| S4 | 默认地图，AI Autopilot ON，4x 速度持续 5 min | ~5 min | 0 → 4.9 s（headless rAF throttling） | 0 | 0 | 0 | wall 5 min 但实际只跑了 4.9 sim sec，heap 60 MB 稳定；属测试环境限制。|
| S5 | 异常输入：viewport 4 次 resize（600×400/2560×1440/320×240/1280×800）、zoom 0.5/2.0/1.0、visibilitychange hidden→visible、30 次 resize 事件；接 +90 次 place/erase fuzz、12 次 invalid-arg API fuzz、120 s 等待 | ~6 min | 0 → 11 s | 1 (P2-2，浏览器良性) | 0 | 0 | 1 个 ResizeObserver 警告，无渲染异常，nonFiniteMetrics 始终为 []。|

合计 wall ≈ 22 分钟，sim 累计推进 ≈ 247 秒。

## 监控钩子原始证据片段

S1 终态采样（150 s 时）：
```
{ t: 151.1, tick: 4533, fps: 33.4, heap: 93.22,
  pop: { workers:16, traders:2, saboteurs:1, herbivores:2, predators:0 },
  deaths: { total:1, starvation:0, predation:1, event:0 },
  food: 34.33, wood: 1.27, nonFinite: [], warns: 6, errCount: 0,
  proxy: 'up', fbCount: 20, llmCount: 8,
  errs: 0, rejs: 0 }
```

S5 fuzz API 全集结果（12 个非法输入）：所有 `placeToolAt` 返回 `{ ok:false, reason:'invalidArgs', reasonText:... }`；所有 `focusTile/focusEntity/selectTile` 返回 `null`；`selectEntity(-1)` 返回 `false`；`configure(...)` 静默接受；**没有任何 `try/catch` 命中**，即没有任何方法把异常抛到调用方。

## 结论

**GREEN** — 0 P0 + 0 P1 + 2 P2，远低于 GREEN 阈值（≤2 P1）。当前 build 在被多场景多角度反复戳的 22 分钟 wall 时间里，未发生一次 JS 异常 / unhandled rejection / 渲染崩溃 / NaN 显示 / context lost / 永久卡死。两条 P2 都属于「可以更好」而不是「现在就有问题」级别：其一是 `saveSnapshot/loadSnapshot` API 契约不一致（无返回、无报错），其二是 ResizeObserver 良性 warning。建议下一轮把它们顺手清掉即可。

唯一遗憾是 headless Chromium 对 rAF 的强 throttling 让 S4 长程未能真的跑到 30 分钟模拟时间，留下一个无法在本会话证实的盲点；如有条件，建议下轮在非 headless 下复跑 S4 验证 30+ 分钟内存增长曲线。
