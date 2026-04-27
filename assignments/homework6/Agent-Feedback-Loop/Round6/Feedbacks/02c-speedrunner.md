---
reviewer_id: 02c-speedrunner
date: 2026-04-25
build_url: http://127.0.0.1:5183/
score: 3.5/10
verdict: 一款“自动驾驶演示器”——速通玩家几乎找不到属于自己的发挥空间，UI/系统对人类操作明显敌意。
---

# Project Utopia — 速通/最优化向硬核玩法报告

## 身份自述

我是个老实不客气的 min-max 速通玩家。打开一款殖民地模拟，我的本能反应是：先盘 Score / Dev / Threat 三条曲线 → 找到 dominant strategy → 多种子重开拉数据。Project Utopia 这一轮我玩了三个 run，主要在 Temperate Plains 与 Fortified Basin 两套模板里来回切，外加几次 boot 重启。最终我必须说：这游戏让速通玩家发挥的余地非常有限，hotkey 设计还会反复“吃”掉我的输入。下面按 run 写实验日志。

## Run 1 日志（Temperate Plains · Broken Frontier · 手控）

- 开局：Food 220 / Wood 20 / Stone 2 / Herbs 0 / Workers 12，已经预置了 Warehouse 与 Kitchen。
- 计划：Wood-first，按 1-12 hotkey 选 Lumber，先把西面 lumber route 的缺口补回来，再等人口翻番。
- 实测：按数字键 hotkey 选工具是有反应的（顶部 Construction 描述会切到 Road / Farm / Lumber），但 LMB 在 canvas 上点击之后，**几乎得不到任何 build 成功的视觉反馈**（没有飞字、没有 placement 音效、cost 数值有时候动有时候不动）。我用 evaluate 强制派发 click 事件批量放置 farm，过了 4 分钟才看到地图出现明显新瓦片。
- 经济曲线：到 Day 3（约 2:35）食物从 220 跌到 51，扣率 −48.3 / min，Colony 面板显示「until empty 0:31」。这等于 ~5 分钟内就锁死饿死 spiral。
- 致命瞬间：我按了一次 `L` 想看 Heat Lens，结局直接被踢回 boot 屏（URL 还自动追加了 `?template=rugged_highlands`）。手动测试不止一次复现：autopilot ON + 全屏 hotkey 输入时，键盘事件容易在错误的 layer 被消化，跑着跑着就死给你看。
- Run 1 结论：**手控完全跑不动开场**。农业输出根本追不上 12 名工人的吃饭速度，开局两分钟就进入永久亏损。

## Run 2 日志（Temperate Plains · Wood-first 改良 · 手控）

- 计划：吸取教训——开局先暂停（Space），把 Lumber 与 Farm 各排两块，再放一个 Warehouse 缩短搬运路径。
- 实测 1：Space 暂停**会被吃**。第一次我按 Space，焦点在 Build 面板按钮上，结果是按钮被「点击」，进入 farm 工具而非暂停（速通玩家见怪不怪的「焦点窃取」bug）。
- 实测 2：找不到「拖拽多格放置」。每个 Lumber/Farm 都得逐格点击，速通最厌恶的体验。我尝试 Shift+drag、Ctrl+drag、连按 Lumber-key+click，都没有 multi-place 模式。
- 实测 3：建造「rules」非常严格——Road 需要从已有基础设施延伸或修补 scenario gap；非草地/废墟禁建；Farm 要求 soil-rich tile。这意味着前几分钟你在地图上「能放的位置」少得可怜，加速了挫败感。
- 结局：约 4 分钟后又回到 boot 屏。从 console 看不到 game-over 模态，**没有最终分数总结、没有「这是你死掉的原因」、没有 retry 按钮里的 seed 信息**。对速通玩家而言，这等于「跑了一局、什么都没记下来」。

## Run 3 日志（Fortified Basin · Hollow Keep · Autopilot ON + 4× FF）

- 计划：既然手控被坑得那么惨，干脆完全交给 rule-based autopilot，看它的 ceiling 在哪儿。
- 实测：开 Autopilot + 4× Fast Forward，Colony 面板成了我唯一的 cockpit。
  - 02:20 / Day 3 — STABLE, Food +1/min, Threat 22%, 26 workers，3 farm / 3 cook / 2 smith / 1 herbalist / 4 haul。
  - 06:59 / Day 7 — STABLE, Food **-171/min**, until empty 1m, Wood -243.8/min, Stone +211.5/min, 48 workers。`AI Storyteller: DIRECTOR picks rebuild the broken supply lane`——AI 在饿死 spiral 里仍然在选「修补供给线」这种描述性 directive，而不是「立刻砍 farm 比例」。
  - 09:54 / Day ~10 — Workers 65, Food 175 反弹。这反弹来自「人口太多导致老人/孤立工人饿死，剩下的反而吃饱」的 dark balance。Worker Inspector 里我能看到 `Recent Memory: Warehouse fire at (43,28)`、`Pia Cray was born at the warehouse`、`Became Friend with Ilia Mend`——内核确实跑着，但**所有这些事件都不算分**。
  - 11:07 / Day ~12 — 72 workers，但 Autopilot 又被「不知什么操作」关掉了，HUD 显示 "Autopilot off. Manual control is active"。我至少 2 次明确点 Autopilot checkbox 它都自己被弹掉。这是非常严重的状态泄漏。
- 结局：12:01 时浏览器 page 切到 about:blank，不知道是 Vite HMR 还是渲染崩，我的 run 数据再次蒸发。

## 综合数据表

| Run# | Template | Scenario | 控制方式 | Survived | Final Workers | Final Food | 备注 |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | Temperate Plains | Broken Frontier | 手控 | ~04:47 | 29 | 0 | 饿死 spiral；按 L 触发 boot |
| 2 | Temperate Plains | Broken Frontier | 手控 (Wood-first) | ~04:00 | n/a | n/a | UI 焦点 bug，无 game-over 总结 |
| 3 | Fortified Basin | Hollow Keep | Autopilot+4× FF | 12:01+ | 77 | 145 | autopilot 偶尔自动关；page 崩到 about:blank |

数据表本身就是一个控诉：**我跑三次、没有任何一次拿到「分数」**。HUD 上根本没有 live Score 字段。boot 屏目标卡显示 `Survive as long as you can — 00:00:00 · 0 pts`，但我整局死掉之后那个 pts 始终是 0，我也找不到换算公式。Dev Index 只在底部偶尔以 toast 形式出现一次（`Dev 40 - foothold: Your colony is surviving; widen the production chain.`）。这对一个「以 Score 为乐趣」的玩家来说，等于把记分牌摘了。

## 找到的策略与 cheese

- **Cheese 1（最强）：开 Autopilot + 4× FF，啥都不动**。Run 3 跑了 12 分钟、77 工人；Run 1/2 我手控全部 5 分钟内崩。也就是说当前游戏的 dominant strategy 是「不要玩」。
- **Cheese 2**：因为 Heat Lens 上有 `surplus / starved` 标签，理论上可以靠 lens 决定「砍 farm 还是加 farm」。可惜手控延迟太大、放置规则太严，等你做出反应仓库已经着火（Run 3 看到 Warehouse fire at 43,28，无任何防火操作可干预）。
- **没有真正的 cheese**：我尝试过 Wall-spam、Warehouse-spam、Farm-spam，全都被「必须连接现有 infra」「必须 soil-rich」「cost 5 wood per farm」这些规则卡死。极限经济跑不出来——你想堆不让你堆。
- **没有数值溢出可玩**：资源数字看起来只是 int，没看到 100k+ 上限或 wraparound。Threat 顶到 100 我也没观察到（最高见到 43%）。
- **没有 hotkey 组合的「APM 优势」**：Ctrl+Z 撤销在我多次测试里没有可见效果，Ctrl+Y 同样。Erase 按钮要单格点。0 复位摄像机倒是真好用。

## 游戏有没有真正的玩法上限？

我作为速通玩家最看重的是「策略上限」与「可控性」，分别评一下：

**策略深度 — 3/10**
- 模板差异（Plains / Highlands / Isles / Coastal / Riverlands / Basin）+ 各自的 scenario（Broken Frontier / Silted Hearth / Island Relay / Hollow Keep / …）确实存在，开场 brief 也写得不一样，但实际玩起来差异主要体现在「桥要不要建」「fertility 分布」这些被动地形——并不影响策略 root（仍然是先食物后扩张）。
- 13 种建筑（Road/Farm/Lumber/Warehouse/Wall/Bridge/Erase/Quarry/Herbs/Kitchen/Smithy/Clinic + Select）听起来很多，但 ROI 完全锁死链条：Food → Cook → Meals；Wood → Smith → Tools；Herbs → Clinic → Medicine。没有一条「邪道路线」（比如纯狩猎、纯掠夺、纯交易），所以 min-max 没空间。
- Role Quotas slider（Cook 8 / Smith 8 / Herbalist 8 / Haul 8 / Stone 8 / Herbs 8）、Target Farmer Ratio 50% — 这两个是少数允许玩家「拨数值」的地方，但调它们之后没有立即可量化的反馈面板，调和不调差不多。

**Score 透明度 — 1/10**
- HUD 里只显示 Survived 计时，不显示分数。
- boot 屏的目标卡上写 `0 pts` 永远是 0。
- Dev 等级只通过偶发 toast 透露（`Dev 40 - foothold`），且死亡之后这个数字也不持久化。
- 游戏没有 game-over 总结面板，崩了直接弹回 boot；这是评分类游戏不能接受的硬伤。

**Fast Forward 诚实度 — 4/10**
- 只有 1× / 4× 两档，没看到 8× 或 16× 选项；速通玩家最爱 16×。
- 4× 实际加速比看起来贴近 4×（10 秒走 ~40 秒模拟，估算合理），所以诚实度不算差。
- 但「Fast forward 4x」按钮按下之后会和 Autopilot checkbox 冲突，导致 Autopilot 被静默关掉——这是隐性的 nerf。

**Hotkey & UI 操作流 — 2/10**
- 1–12 选工具：可用，但没有 toolbar 高亮反馈（要看右侧 Construction 描述才能知道选中了啥）。
- Space 暂停：经常被「焦点」吃掉，明明按了没暂停。
- L 热视：会把整个 run 弹回 boot——这是最严重的体验 bug，速通选手第一次按热键就被 reset 等于死刑判决。
- Esc：清选择/打开帮助/取消，行为模糊；我 Esc 一次直接回到 boot 屏。
- 没有「拖拽多格放置」、没有「重复上一次建造」（典型的 RTS 必备）、没有「shift+click 排队建造」。
- 没有 build queue、没有 tech tree、没有可视化 throughput 统计；速通玩家想做 spreadsheet 优化无从下手。

**Replay / 数据回看 — 2/10**
- Settings 里有 Save Snapshot / Load Snapshot——这是为速通极佳的工具。但我手控放完一组建筑、按 Save Snapshot，再 Load 之后没看到明确的「回到原状」反馈，也没有 timestamp。
- 没有死亡 replay 列表、没有 leaderboard、没有 seed 字段可贴——也就是说我即使跑出一个神 run，**也没法分享、对比、复现**。

## 给硬核玩家的最优开局建议（基于 Run 3 唯一活下来的样本）

1. 进游戏立刻 Space → 把 Build panel 的 Lumber、Warehouse 各排两个、Farm 排三个、Kitchen 排一个；然后 Space 解暂停。**前提是 Space 这次没有被焦点吃**。
2. **绝不要按 L、绝不要按 Esc** ——它们大概率把你从战场上拽回 boot 屏。
3. 立刻勾选 Autopilot；接受 rule-based 救火。
4. Fast Forward 只在前 5 分钟开（Day 0–7）；之后切回 1× 让 autopilot 慢慢治理饥荒。
5. 别去碰 Role Quotas，默认值已经够 autopilot 跑 12 分钟+。
6. 把 Inspector 卡在 Warehouse 那个工人身上，看他「Recent Memory」可知会不会着火/事故；如果着火就只能眼看，没有救火工具。

## 评分与一句话总结

**3.5 / 10**

一款机制深度其实埋在底下（worker AI、relationship、memory、events 都跑得到位），但**对玩家的可操作性近乎敌意**：分数不显示、game-over 没总结、热键会把人弹出对局、Autopilot 自动关；速通选手能玩出花的部分，要么没暴露给 UI，要么藏在 console 里。当前版本的「最优策略」尴尬地就是「开 Autopilot 然后泡杯茶」，这对一个想 push limit 的玩家是一种侮辱。

— 02c-speedrunner，2026-04-25
