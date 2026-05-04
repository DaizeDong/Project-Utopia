---
reviewer_id: A1-stability-hunter
round: 3
date: 2026-05-01
verdict: RED
score: 4
p0_count: 1
p1_count: 1
p2_count: 0
sessions_run: 5
total_minutes: 47
---

## 总评（一段）

5 个 session（共约 47 分钟挂钟）跑下来，**正常游玩路径（S1/S2/S4/S5）零崩溃、零 console.error、零 unhandled rejection、内存健康（60–94 MB heap，期间还会 GC 回落）**。但只要玩家点一下 Debug 面板里的 **Save Snapshot / Load Snapshot**，就能稳定触发两个独立 bug：(a) Save Snapshot 抛 `DataCloneError`，因为快照序列化时把绑了死亡 toast 监听器的 listener 函数也丢进了 `structuredClone`；(b) Load Snapshot 之后 `SceneRenderer` 在 render 一帧时崩 `tileState.get is not a function`，整个主循环挂掉，HUD 顶端弹出红色 "Main loop error" 提示，UI 退回到标题界面，运行中的 colony 数据丢失。Load Snapshot 必崩，属于"玩家无法继续"+"数据损坏"两条 P0 红线同时命中。鉴于至少 1 个 P0，依硬性规则评 RED。

## P0 列表

### P0-1: Load Snapshot 让主循环崩溃，强制退回标题界面，丢失运行中的 colony

- session: S3
- 时间戳: 启动后约 6:00 处第一次触发；S3 末尾在新一局重新复现成功
- 复现步骤:
  1. 打开 http://127.0.0.1:5173/，点 Start Colony 进入游戏
  2. 让游戏跑几秒（让 SimSystems 至少 tick 一次即可，无需建任何东西）
  3. 打开右侧 **Debug** 面板
  4. 点击 **Load Snapshot** 按钮
  5. 1–2 帧内主循环 throw，HUD 顶端出现红色 toast `Main loop error: SceneRenderer: tileState.get is not a function`，地图渲染停止，几秒后整个 UI 退回 Project Utopia 标题界面（"Survive as long as you can · 00:00:00 · 0 pts"），刚才的 colony 全没
- console.error / stack:
  ```
  [Project Utopia] main loop failed: Error: SceneRenderer: tileState.get is not a function
      at #safeRenderPanel (http://127.0.0.1:5173/src/app/GameApp.js?t=...:1973:29)
      at GameApp.render (http://127.0.0.1:5173/src/app/GameApp.js?t=...:877:26)
      at GameApp.loop.GameLoop.maxFps [as render] (http://127.0.0.1:5173/src/app/GameApp.js?t=...:372:31)
      at GameLoop.frame (http://127.0.0.1:5173/src/app/GameLoop.js:47:12)
  ```
  注意：哪怕从未 Save 过快照，Load 也能触发；说明 Load 默认把某个空/上次残留的快照 deserialise 后塞回 tileState，得到的不是 Map 实例。
- screenshot:
  - `assignments/homework7/Final-Polish-Loop/Round3/Feedbacks/screenshots/A1/s3-load-snapshot-renderfail.jpg`（红色 Main loop error toast + 地图卡死）
  - `assignments/homework7/Final-Polish-Loop/Round3/Feedbacks/screenshots/A1/s3-load-snapshot-titlescreen.jpg`（崩溃后被踢回标题界面）
  - `assignments/homework7/Final-Polish-Loop/Round3/Feedbacks/screenshots/A1/s3-load-snapshot-back-to-title.jpg`（第二次复现，再次回到 title）
- 影响: 玩家无法继续（需重开浏览器/重新开始整局）+ 运行中 colony 数据完全丢失。两条 P0 红线都中。

## P1 列表

### P1-1: Save Snapshot 偶发抛 DataCloneError（structuredClone 把死亡 toast handler 当数据 clone）

- session: S3
- 时间戳: 第一次面板/工具批量点击期间触发一次（具体在 S3 中段）
- 复现步骤:
  1. 进入游戏，触发任意一次实体死亡事件（例：让 wolf-20 被 worker 击杀，或让 trader/saboteur 死亡）—— 让 GameApp 把 `handleDeathToastEvent` 这类 listener 挂到某个被快照序列化器路过的对象图节点上
  2. 打开 Debug 面板，点 **Save Snapshot**
  3. window 'error' 抛 `Uncaught DataCloneError: Failed to execute 'structuredClone' on 'Window': (event) => this.#handleDeathToastEvent(event) could not be cloned.`
- 注意: 在干净的开局（没死过实体）时单点 Save Snapshot 不必现；说明触发条件是 **快照序列化时遭遇了未脱壳的 listener / EventBus 引用**。
- console.error / stack:
  ```
  DataCloneError: Failed to execute 'structuredClone' on 'Window': (event) => this.#handleDeathToastEvent(event) could not be cloned.
      at ensureStructuredClone (http://127.0.0.1:5173/src/app/snapshotService.js?t=...:10:53)
      at makeSerializableSnapshot (http://127.0.0.1:5173/src/app/snapshotService.js?t=...:145:20)
      at Object.saveToStorage (http://127.0.0.1:5173/src/app/snapshotService.js?t=...:272:41)
      at GameApp.saveSnapshot (http://127.0.0.1:5173/src/app/GameApp.js?t=...:1626:50)
      at Object.onSaveSnapshot (http://127.0.0.1:5173/src/app/GameApp.js?t=...:239:40)
      at HTMLButtonElement.<anonymous> (http://127.0.0.1:5173/src/ui/tools/BuildToolbar.js?t=...:557:37)
  ```
- screenshot: 无单独截图，stack 完整保留。
- 影响: Save Snapshot 失败（保存被中断），但游戏主循环继续——所以在 P1 而非 P0；不过这条很可能就是 P0-1 的根因（Save 写入了部分坏数据 → Load 拿到脏 tileState → render 崩）。建议把这两条放一起修。

## P2 列表

无（本轮没看到纯 console.warn / 视觉小 bug 范围内的稳定性瑕疵；性能层面 "running ×0.3 / target ×8.0 capped" 留给 A2，视觉问题留给 A4）。

## Sessions 摘要

| Session | 场景 | 持续 | console.error | unhandledrejection | 崩溃次数 |
|---------|------|------|---------------|--------------------|----------|
| S1 | 默认 Temperate Plains，autopilot ON，⏩→⏭ 跑到中后期 | ~10 min 挂钟 | 0 | 0 | 0 |
| S2 | autopilot OFF，零建造/零干预，让食物消耗 | ~10 min 挂钟 | 0 | 0 | 0 |
| S3 | 频繁切换 8 个面板 tab × 4 轮 + 12 个 build tool 轮播 + 模板下拉切 6 次 + Debug 面板里 Save/Load Snapshot + Regenerate Map + Undo/Redo×30 + Compare/Run Benchmark/Apply 等批量点击 | ~7 min 挂钟 | 1（main loop failed） | 0（但 1 个 window 'error': DataCloneError） | 1（Load Snapshot 把主循环打挂） |
| S4 | 全程 autopilot ON + ⏭ 8x，长程 10+ 分钟挂钟 | ~10 min 挂钟 | 0 | 0 | 0 |
| S5 | resize 4 次（320x240 / 1920x1080 / 2560x1440 / 1280x720）+ canvas 滚轮 zoom-in 50 次 + zoom-out 100 次 | ~5 min 挂钟 | 0 | 0 | 0 |

补充观测：
- 内存 heap 60–94 MB，期间出现回落（70 → 60 MB），无明显泄漏迹象。
- 运行速度被引擎限速 `target ×8.0 / running ×0.3 (capped)`，长程 10 分钟挂钟 game-time 只推进到约 1:36；不属于稳定性问题，但解释了为什么没看到更长 game-time 的迭代崩溃。
- 玩家可见 NaN / Infinity / undefined：未发现。
- network 5xx：未发现（hooks 页面没看到 failed request；LLM proxy 在 fallback 模式 OK）。
- WebGL context lost：未触发。

## 结论

**RED**（命中 1 个 P0：Load Snapshot 让主循环崩溃 + 强制丢失 colony）。

正常游玩路径（开局 → autopilot → ⏭ 8x → 长程）下游戏核心循环这一轮非常稳，5 个 session 里有 4 个 0 错误。问题集中在 Debug 面板的 Save/Load Snapshot 链路：序列化器漏过了死亡 toast handler 之类的不可 clone 引用，反序列化器吐出非 Map 的 tileState 让 SceneRenderer 直接挂掉。建议优先把 snapshotService 的 sanitiser 加固（白名单字段，剥离 handler/Bus/Three 资源），并在 Load 失败时 graceful 回滚而不是把渲染管线打死。
