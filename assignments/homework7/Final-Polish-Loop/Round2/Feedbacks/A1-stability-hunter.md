---
reviewer_id: A1-stability-hunter
round: 2
date: 2026-05-01
verdict: GREEN
score: 9
p0_count: 0
p1_count: 1
p2_count: 1
sessions_run: 5
total_minutes: 32
---

## 总评

跨 5 个独立 session 的稳定性盲审，没有捕获任何崩溃、白屏、WebGL context lost、未捕获 Promise rejection 或 console.error。`window.__qa_errors` 与 `window.__qa_rejections` 在每个 session 结束前抓取均为空数组；`browser_console_messages(level=error/warning)` 全程返回 0 条；JS heap 在长程运行中保持 60–71 MB 区间，没有泄漏迹象。UI 状态机经受了 168 次 tab/tool 高频切换 + 3 次 Try Again 重启 + 3 次模板切换循环 + viewport 在 600×400 ↔ 2200×1300 之间反复 resize + 模拟 blur/focus/visibilitychange 共 6 轮，全部通过。

唯一稳定性相关的发现是 P1：高速档（target ×8）下，模拟实际 throttle 至 `running ×0.3–0.8 (capped)`，导致 wallclock 2 分钟仅推进约 11 秒 sim，长程实测可玩性受影响（不是崩溃，但是会让玩家感受到"游戏卡住"）。另发现一个 P2 显示一致性 bug：当 colony 进入"breathes again / 路线断开"恢复态时，顶部 HUD 的 `Run HH:MM:SS` 与 `Score / Dev` 似乎冻结，而底部 sim clock 持续推进，玩家会同时看到两个不一致的"游戏时间"。

任何 P0 都未触发，因此 verdict = **GREEN**。

## P0 列表

无。

## P1 列表

### P1-1: 高速档严重 throttle，target ×8 实际 ×0.3–1.1 capped
- session: S2 (Rugged Highlands), S4 (Temperate Plains)
- 时间戳: S2 整段（10:30 wallclock 时只跑到 sim 03:09）、S4 整段（2 分 wallclock 仅推进 sim 11s）
- 复现步骤:
  1. 启动任意 map（Rugged Highlands / Temperate Plains 均复现）
  2. 在底部播放栏点击 ⏭ "Ultra speed 8x"
  3. 观察底部速度状态条 → 显示 `target ×8.0 / running ×0.3 (capped)` 或 `×0.4 (capped)` / `×0.8 (capped)` / `×1.1 (capped)`
- console.error / stack: 无（因此降为 P1 而不是 P0）
- screenshot: `assignments/homework7/Final-Polish-Loop/Round2/Feedbacks/screenshots/A1/S2-04-frozen-header.png`、`screenshots/A1/S5-final.png`（红字 `running ×1.1 (capped)`）
- 影响: 玩家选择 8x 期望获得快速推进，实际获得不到 1x；尤其在野生动物 / 战斗密度上来后下沉到 0.3x，体验上接近"游戏卡住"。这不会让模拟崩溃（无错误日志），但是稳定性观感很差，且会让长程survival测试变得不可用。

## P2 列表

### P2-1: 顶部 HUD `Run HH:MM:SS / Score / Dev` 与底部 sim clock 不同步（疑似 game-end 后冻结）
- session: S2 (Rugged Highlands)
- 时间戳: 03:09 sim 之后
- 复现步骤:
  1. 进入 Rugged Highlands，autopilot OFF，不主动建造任何东西
  2. 等到首次出现 "The colony breathes again. Rebuild your routes before the next wave." toast（sim 约 03:09）
  3. 之后顶部 `Run 00:03:09 Score 179 Dev 26/100` 文字停在 03:09，但底部播放栏的 `0:38 / 1:00 / 9:45 / 10:38 / 11:18` 持续推进，并继续生成 "Last: Bear-XX died" 等运行时事件
- screenshot: `screenshots/A1/S2-04-frozen-header.png`（顶部 03:09 vs 底部 10:38）、`S2-05-frozen-confirmed.png`（顶部 03:09 vs 底部 11:18）
- 影响: 玩家会同时看到两个不一致的"当前游戏时间"，疑似 endless survival 模式在 colony 失败后顶部 HUD 切到了 final-score 显示但没有提供清晰的 "Game Over / Run Ended" 视觉提示。属于 cosmetic 一致性问题，不会卡死或崩溃。

## Sessions 摘要

| Session | 场景 | 持续 | console.error | unhandledrejection | 崩溃次数 |
|---------|------|------|---------------|--------------------|---------|
| S1 | Temperate Plains, Autopilot ON, 8x 长程 | ~6 min wallclock, sim 2:45 | 0 | 0 | 0 |
| S2 | Rugged Highlands, Autopilot OFF, 拒绝建造 | ~7 min wallclock, sim 03:09 | 0 | 0 | 0 |
| S3 | Archipelago Isles, 168 次 tab/tool 高频切换 + 3 次 Try Again + 3 次模板切换 + 25 次随机 canvas 点击 + 30 次实体 inspect | ~6 min wallclock | 0 | 0 | 0 |
| S4 | Temperate Plains, Autopilot ON, 8x 长程, viewport=1024×768 | ~5 min wallclock, sim 0:38 | 0 | 0 | 0 |
| S5 | viewport 反复 resize（600×400 ↔ 2200×1300）+ blur/focus + visibilitychange | ~5 min wallclock, sim 推进至 0:45 | 0 | 0 | 0 |

JS heap 监测：S1 启动 56 MB → S4 末尾 71 MB → S5 末尾 62 MB（无明显泄漏，GC 正常工作）。
Network 5xx：未观察到（仅本地 dev server 静态资源）。

## 结论

**GREEN**（0 P0 + 1 P1 + 1 P2，符合 "0 P0 + ≤2 P1" 标准）。

构建在崩溃 / console-error / unhandled-rejection 维度上完全干净，UI 状态机在高强度 thrashing 下无错位无卡死。唯一需要关注的 P1 是高速档 throttle 问题，影响长程测试体验但不影响核心稳定性。P2 的 HUD 时钟不同步是一个游戏结束态的视觉一致性 bug，建议在 colony-end 状态下显式渲染 "Run Ended / Game Over" overlay。
