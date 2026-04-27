---
round: 1
date: 2026-04-22
reviewers: 10
avg_score: 3.1
verdict: 一个工程骨架完整、但把"游戏"留在了后台的 colony sim——反馈、引导、叙事、声音全缺席，10 位 reviewer 一致判定为 pre-alpha 观感。
---

# Round 1 Feedback Summary — Project Utopia

## 1. 评分汇总

| reviewer_id | score | verdict 一句话 |
|---|---|---|
| 01a-onboarding | 3 | 有按钮有 Help 面板，但没有真正的"教学"——把一份技术文档塞给玩家自己啃 |
| 01b-playability | 3 | 系统密度很高但玩家主导性极弱，观感像后台 benchmark，而不是一款让人想继续玩的游戏 |
| 01c-ui | 3.5 | 视觉与交互反馈仍停留在原型阶段，美术、响应式、反馈感均未达付费产品水准 |
| 01d-mechanics-content | 3 | 系统骨架齐全但机制几乎不可感知，内容量级仅够作为原型 |
| 01e-innovation | 3 | 技术扎实但创新维度几乎无存在感，差异化钩子没能 surface 给玩家 |
| 02a-rimworld-veteran | 3 | 一个形似 colony sim 的自动模拟器，玩家在场但不存在 |
| 02b-casual | 3 | 画风可爱但信息量爆炸，像 Excel 表格没附说明书，休闲玩家 10 分钟就想撤 |
| 02c-speedrunner | 3 | 调试 API 比游戏机制本身更好玩，玩家被 AI 自动化剥夺了优化深度 |
| 02d-roleplayer | 3 | 所有戏剧素材都写进了后台日志，却在玩家屏幕上只留一行静态字幕 |
| 02e-indie-critic | 3.5 | 工程密度惊人但缺少作者语气，像一份把自己错认为游戏的 colony sim 基准测试 |

**平均分：3.1 / 10**
**分布：3 分 × 8，3.5 分 × 2**
**离散度：极低（全部落在 3.0–3.5 的 0.5 区间）——说明问题是结构性的、横跨所有外部视角**

---

## 2. P0 级问题（≥ 3 位 reviewer 独立命中）

### P0-1. Entity Focus 完全点不中——核心 inspect 入口失灵
- **命中：01a, 01b, 01c, 01d, 02a, 02d（6 人）**
- 证据摘要：
  - 01a："我在很明显的 worker sprite 上点了几次，Entity Focus 面板始终是空的"
  - 01b："我尝试了三次…每次都返回 'No entity selected'…核心检查工具在新手第一次尝试就宣告失败"
  - 01c："多次点击 canvas 上的 worker，它始终保持 'No entity selected'——严重（可用性 bug）"
  - 01d："暂停、缩放、重复点击至少 5 个不同像素位置…从未填充过任何内容。核心交互功能缺席"
  - 02a："canvas 上工人是 8×8 像素…多次尝试 select 失败"
  - 02d："不管我点工人聚集的木场…Entity Focus 始终停在 No entity selected…工人们没有可见名字"
- **影响**：UI 上最被 promote 的"click any worker/visitor/animal"功能整体报废，连带掐死角色检查、个体叙事、工人 debug 等 5+ 条玩家价值链。

### P0-2. Heat Lens 切换后地图无可见变化
- **命中：01a, 01b, 01c, 01d, 02a, 02d（6 人）**
- 证据摘要：
  - 01a："整张地图上一个红色或蓝色 heat 区域都没看到…打开了功能但看不到效果比没这个功能更糟"
  - 01b："除了顶栏按钮高亮一下…地图上几乎看不出任何颜色变化"
  - 01c："Heat Lens 切换后地图上无可见热图覆盖——高"
  - 01d："L 键热力透镜基本看不出变化"
  - 02a："画面看不出任何变化。是没生效？还是颜色叠加太淡？"
  - 02d："没有图例、没有标签、圆圈上没有文字…叙事接口有设计直觉，但完成度停留在 placeholder"
- **影响**：独立游戏宣传过的差异化卖点之一被玩家当作 bug 或没生效功能。

### P0-3. Storyteller 是调试文本/元描述，不是玩家叙事
- **命中：01a, 01b, 01d, 01e, 02a, 02d, 02e（7 人）**
- 证据摘要：
  - 01a："[Rule-based Storyteller] route repair and depot relief…读起来像一段 LLM 吐的 dev note"
  - 01b："'Workers should sustain frontier buildout…'——这不是叙事，这是一段 dev spec"
  - 01d："Storyteller 字段重复且与玩家无关…这不是故事讲述，这是内部策略描述"
  - 01e："这不是叙事，这是调试文本泄漏到 UI 上…零情感投射、零叙事张力"
  - 02a："Storyteller 那段话也只告诉我'Workers should sustain route repair'——那为什么他们不 sustain？"
  - 02d："这句话从第 10 秒到第 231 秒一个字都没变过…像一个被忘记 wire 的 placeholder"
  - 02e："[Rule-based Storyteller] 这个前缀尤其诚实——开发者调试 AI 调度器的内部 prompt 直接暴露给玩家"
- **影响**：后端其实已有 event trace/visitor/sabotage/weather 原料（02d 在 devEventTrace 里读到 `Mose-26 died (starvation)` / `Warehouse fire at (52,38)` / `visitor_34 sabotaged colony`），但 storytellerStrip 没接入这些数据源——距离"有叙事"只差一根 wire。

### P0-4. 完全没有音效 / 音乐 / 环境音
- **命中：01b, 01c, 01d, 01e, 02b, 02d, 02e（7 人）**
- 证据摘要：
  - 01b："没有工人砍树的 chunk 声、没有建筑放置的 confirm 音、没有人口死亡的 alarm 音。完全静默…对'心流'是致命的"
  - 01c："没有音效 / 音乐（或未自动启用）——高"
  - 01e："没有 BGM、没有音效，彻底静默。2026 年的付费游戏完全静音是不可接受的"
  - 02b："整个游戏是静音的。这对休闲玩家是灾难"
  - 02d："零音效、0 环境音、0 BGM…对一款想要讲故事的游戏是致命的氛围空缺"
  - 02e："独立游戏没 sound 就等于没签名。没 sound 就是没爱"
- **影响**：氛围、反馈、情感投射三条线同时失效；独立游戏最低门槛之一缺失。

### P0-5. 崩溃/死亡/饥饿无任何可感知警报
- **命中：01a, 01b, 01c, 01d, 02b, 02d（6 人）**
- 证据摘要：
  - 01a："死了 10 个 worker 后…只有顶部那行 deaths -10 闷声增长"
  - 01b："没有任何红字警告、没有音效、没有弹窗，只是顶部悄悄出现了新的数字…数字在后台洗牌"
  - 01c："Food=1, -67.4/min…没有任何 'FAMINE' 全屏警告…Workers 死亡 (-40) 也只是数字变化，没 death toast"
  - 01d："20 分钟累计 200 死亡…UI 里没有死亡日志——谁死了？什么原因？在哪里？一无所知"
  - 02b："每次一看这个数字变化我心都咯噔一下。但我完全不知道谁死了、死在哪、为啥死"
  - 02d："30 条生命在我完全不知情的情况下被悄悄划掉了"
- **影响**：玩家既没有挫败感也没有参与感，失败反馈链断裂，AI 自救（Emergency Relief）把压力曲线进一步削平（见 P1-2）。

### P0-6. 顶栏 HUD 直接暴露 dev/debug 数据（"routes 1/1 · wh 7/2 · +1/s · -10/death"）
- **命中：01a, 01b, 01c, 01d, 01e, 02e（6 人）**
- 证据摘要：
  - 01a："`routes 1/1 · depots 1/1 · wh 3/2 · farms 4/4 · lumbers 2/3 · walls 7/4` 完全不知道是好消息还是坏消息…把日志、KPI、任务目标全搅在一起"
  - 01b："这是连我都看不懂的压缩字符串…dev 数据藏到 debug 开关后面"
  - 01c："'+1/s · +5/birth · -10/death (lived X · births Y · deaths Z)' debug 文字暴露在正式 HUD——高"
  - 01d："Storyteller 字样、'Broken Frontier — 重连西边伐木线'…真正关键的问题却找不到答案"
  - 01e："顶栏密密麻麻的 `+1/s · +5/birth · -10/death (lived 633 · births 100 · deaths -20)`…暴露了 UI 完全是给研发调数值"
  - 02e："直接把内部目标计数器原封不动甩在屏幕顶端。开发者彻底没有打算把它翻译成玩家语言"
- **影响**：第一印象就告诉玩家"这是个 dev tool"；"这游戏不在乎你是否理解"。

### P0-7. 玩家 agency 极弱——AI 替你玩，干预无效
- **命中：01b, 01d, 01e, 02a, 02c, 02e（6 人）**
- 证据摘要：
  - 01b："Start Colony 之后，工人立刻开始自动干活、自动分配角色…我不按任何按钮也一切在跑"
  - 01d："玩家真正能做的事压缩成偶尔点两下工具，看着数字浮动…更像一个可交互的数据仪表盘"
  - 01e："18 分钟实机里完全感受不到任何 LLM 在场…LLM 决策被压缩到和规则 AI 无法区分的程度"
  - 02a："玩家的能动性停留在'选择 12 种建筑之一然后希望 AI 去建'"
  - 02c："Start Colony 之后，工人们自己就开始修路、砍树、种田…让玩家观看的游戏，而不是让玩家优化的游戏"
  - 02e："我没有做任何操作——游戏自己在玩自己…Project Utopia 不需要玩家"
- **影响**：colony sim 这一品类最核心的"暂停-规划-执行-观察"循环缺失；中后期动机归零。

### P0-8. 建造/放置反馈链断裂（无 ghost preview、无成功音效、无错误原因）
- **命中：01a, 01b, 01c, 02b（4 人）**
- 证据摘要：
  - 01a："放下建筑后…没有弹出 'Kitchen placed'、没有闪光、没有音效、没有 Kitchen 的建筑图标在地面上出现。我根本不确定我是否成功建造了"
  - 01a："把 Road 放到了湖里。什么都没发生——没有红色 X、没有 'Invalid placement' 弹窗"
  - 01b："没有任何'你建造了一个农场'的确认信息…建造的反馈回路基本是断的"
  - 01c："没有提示 tile 类型、没有预览将要建造的建筑轮廓…付费游戏标准做法是 ghost preview + cost/allowed/blocked 状态红绿染色"
  - 02b："红色警告永远被截断：'Clear the wall bef...', 'No stone node on this tile. Quarri...'"
- **影响**：建造→观察→调整这一核心交互循环在第一级入口断掉。

### P0-9. 没有新手引导链——Help 是 wall-of-text，进场无 onboarding
- **命中：01a, 01b, 01d, 02b（4 人）**
- 证据摘要：
  - 01a："点 'How to Play' 是三个 tab 的 wall-of-text，没有图示/gif/箭头/交互式演示/分阶段的小任务…RimWorld 有 Learning Helper，Project Utopia 把所有内容一次性糊到你脸上"
  - 01b："整个界面没有任何缓进入场…所有控件一次性砸在脸上"
  - 01d："我要点什么才算赢？我怎么知道什么时候该建什么？为什么我的工人会死？"
  - 02b："没有'你现在应该干什么'的引导…任凭你自生自灭"
- **影响**：无先验知识玩家 5 分钟内劝退。

### P0-10. 工人无身份/名字/人格——后端有 ID，UI 拿不到
- **命中：01d, 01e, 02a, 02d, 02e（5 人）**
- 证据摘要：
  - 01d："所有工人长一个样…RimWorld 的 Pawn 拥有 20+ 技能 × 精神状态 × 人际关系 × 背景故事"
  - 01e："没有角色（Pawns 的个性）——RimWorld 的灵魂是每个小人有名字、背景故事、关系、创伤"
  - 02a："工人就是一个会变灰色的方块…没见到个体差异"
  - 02d："游戏内部有名字（Mose-26、Hale-28、Lio-50、Ody-48）…是真的有 ID、有死因、有死亡时间戳的…但作为玩家，我一眼都看不到这些"
  - 02e："Worker 上面就是一个代表小人的 sprite，Colony 面板里只有 FARM 3 / WOOD 9 / STONE 1 这种角色计数——数字，不是人"
- **影响**：情感投射归零；colony sim 品类最核心的"涌现叙事"素材明明有却用不上。

### P0-11. 6 个地图模板只是换皮——共用同一套机制/建筑/scenario 文案
- **命中：01d, 01e, 02a, 02e（4 人）**
- 证据摘要：
  - 01d："6 个 template 在视觉上不同，但核心交互没有地形特异性玩法…这是'6 张皮，1 套机制'"
  - 01e："模板地图的 terrain shape 差异化努力是我在 30+ 次交互里唯一一次感到'作者试图做一点和别人不一样的事'"——但依然算不上原创
  - 02a："Rugged Highlands 和 Temperate Plains 的殖民地布局、河流走向、ruins 位置、工人数量、资源初值一模一样"
  - 02e："Fertile Riverlands 抽到 Broken Frontier scenario，和 Temperate Plains 完全一样…作者有把 scenario 和 template 解耦的系统，但没有为每个组合写 voice"
- **影响**：重玩价值塌陷；作者投入的地形生成工程收益只能在"第一眼"兑现。

### P0-12. 事件/死亡日志缺失——数字变但没人讲
- **命中：01b, 01d, 01e, 02b, 02d（5 人）**
- 证据摘要：
  - 01b："deaths -10 这个数字变化，但没有 death toast"
  - 01d："没有死亡日志——谁死了？什么原因？在哪里？一无所知。Dwarf Fortress 最基本的 event log 都没有"
  - 01e："Emergency relief 条永远挂在顶部…既是 tutorial 又是 reward，结果两样都没做好"
  - 02b："deaths -10, -50…每次一看这个数字变化我心都咯噔一下。但我完全不知道谁死了、死在哪、为啥死"
  - 02d："devEventTraceVal / devAiTraceVal——都是 visible:false…后台日志里全是故事，只是从来没到达我的眼睛"
- **影响**：与 P0-3/P0-5/P0-10 联动——叙事素材、警报素材、角色素材都在后台，UI 面板 `visible:false`。

---

## 3. P1 级问题（2 位 reviewer 命中）

### P1-1. Fallback planner 不造 Kitchen / 无 HAUL / 无 COOK 工人——加工链形同虚设
- **命中：02a, 02c（2 人，01d 部分提及）**
- 证据：02a "三盘游戏下来两个角色始终是 0。AI planner 不知道造 Kitchen、不懂得把食物从 farm 搬到 warehouse"；02c "Kitchen/Clinic 链条在常规 run 里几乎不会被 AI 触发"。
- 注：CLAUDE.md 标注的 "Phase 9 punted" 问题外部玩家已可见。

### P1-2. Emergency Relief 救济机制不透明——保命触发但规则不讲
- **命中：02c, 02e（2 人）**
- 证据：02c "Emergency relief 是个防输保险…削弱了作死实验的反馈清晰度…反高潮设计"；02e "隐藏的、无法主动触发的救命机制…很精神分裂"。

### P1-3. 快进/4× 实际速率严重掉速
- **命中：01b, 02c（2 人）**
- 证据：01b "4× 加速在我这次测试里真实表现从未超过 0.5×，后期掉到 ~0.1×"；02c "FastForward 4x 按钮形同虚设，因为 console 能拉到 50x 以上"。

### P1-4. Score 公式扁平（Time + 5·Birth − 10·Death），不奖励策略
- **命中：02a, 02c（2 人，01e 部分提及）**
- 证据：02a "Score 只奖励'活着'…不奖励技术、不奖励探索"；02c "Survival = Time + 5·Births − 10·Deaths…拖时间就行"。

### P1-5. Tools/Meals/Medicine 加工品产量长期为 0，玩家无从诊断
- **命中：01b, 01d（2 人）**
- 证据：01b "13 个采石场、20 个药草园，但石头和药草产量整局都是 0.0/min"；01d "Meals 始终 =0, COOK 角色人数始终 =0，没有任何提示告诉我你没有厨师"。

### P1-6. Storyteller 文本被 "..." 截断
- **命中：01a, 01c, 02b（3 人——可升 P0，但证据偏 UI 细节保留在 P1）**
- 证据：01c "主叙事文本被 '…' 截断——高"；02b "红色警告永远被截断"。

### P1-7. 模板切换 preview 不刷新（必须点 "New Map"）
- **命中：01b (间接), 02a, 02c（2+ 人）**
- 证据：02a "下拉切 Archipelago 后预览不变，必须再点 New Map 才刷新"；02c "regenerate({template}) 不换 template，仅切换 seed"。

### P1-8. 响应式布局 ≤ 1280 宽度下完全崩溃
- **命中：01c（独家详细，但严重到必记）**
- 证据：01c "800×600 下 Build 面板 + Colony 面板 + 顶部文字占据屏幕 80% 面积…仅针对 1440+ 宽屏设计，对 Web 端发布的游戏是硬伤"。
- 保留为 P1 因仅 01c 详测；但 01a/01b 隐约提及 UI 塞满。

### P1-9. 工具选择粘滞——无"指针/默认"模式，误操作频繁
- **命中：01a, 02b（2 人）**
- 证据：01a "点击 worker 永远 No entity selected（可能是 build tool 没取消）"；02b "选了 Quarry 后忘了换工具…连续报错好几次…对休闲玩家太反人类了"。

### P1-10. 启动屏无 Logo / 无 key art / 无背景音
- **命中：01c, 01e, 02e（3 人——可升 P0，定位为品质门槛问题）**
- 证据：01c "启动屏无 Logo、无背景美术、版本号缺失——高"；02e "不像一个游戏的 title screen，它像一个 CLI 工具的 GUI 包装"。

---

## 4. P2 级单点问题（1 位 reviewer 命中但值得记录）

- **资源图标无 hover tooltip**（01c）——付费游戏标配缺失
- **美术风格割裂**：UI 科技感 vs 地图童话感（01c）
- **建筑 sprite 识别度低**：Farm = 白菊花、Lumber = 羽毛、Bridge ≈ Wall（01c）
- **天气系统无视觉层**：后端有 `clear -> rain (15s)` 但屏幕无雨滴/云影/发白滤镜（02d）
- **尸体无墓志铭**：sprite 残留设计方向对，但点击无文字（02d）
- **颜色区分资源对色盲不友好**（01c 可访问性）
- **无 save/load**（02a）——长时程测试反直觉
- **Ctrl+Z 无 preview**：撤销不告诉玩家撤销了什么（01a）
- **Colony Population 面板的 -10/-1/+1/+10 按钮挤在滚动区底部，无 tooltip**（01b）——其实提供了工人分配入口但玩家发现不到
- **控制台 console 持续报错，20 分钟累积 29 条**（01d）——未暴露给 UI 但说明稳定性有潜在问题
- **`placeToolAt` API 的 tool 参数被内部覆写**（02c bug 报告）——影响 headless benchmark / AI 训练脚本
- **全局资源池 vs worker carry 双账本**（02c bug 报告）——注 99999 food 仍可死于 starvation（与 CLAUDE.md 里提到的"Phase 9 punted carry/deposit policy"对应）
- **Raid 强度随 DevIndex 指数升级，防御线性**（02c）——中期稳态比冲分更优，反速通设计
- **Dev Index 定义模糊**（01a, 02a, 02e 都提及但零散）——不解释 0–100 含义与计算
- **Worker hitbox 8×8 像素过小**（02a 独家定量）
- **无 undo 历史 UI**（01a）
- **Entity Focus 漂浮在底部正中而非吸附**（01c）
- **右侧 Colony 面板边缘阴影在宽屏下溢出**（01c）
- **Pause 状态无 "PAUSED" 水印**（01c）
- **"Emergency relief stabilized the colony" 条从 0:00 挂到 20:00 不消失**（01d）

---

## 5. 对 Stage B Enhancer 的建议

### Freeze 边界
- **禁止**：新 mechanic、新建筑、新资源、新 role、新 scenario、新模板、新 AI policy、新 balance curve、Phase N 规划
- **允许**：polish、fix、UX、perf、文案、视觉反馈、UI rewire（把已有后端数据接到 UI）、音效接入

### P0 优先处理顺序（按"改动量 × 玩家感知收益"排序）

**Tier A — 纯 wiring，一天级别可见回报：**
1. **P0-3 + P0-12 合并：把 devEventTraceVal / devAiTraceVal 的 `visible:false` 面板接到 storytellerStrip**。后端已有 `Mose-26 died (starvation)` / `visitor_34 sabotaged` / `clear -> rain` / `Warehouse fire at (52,38)`——只需要 rewire，不需要写新系统。此动作一次性解决 3 个 P0（叙事、死亡日志、事件感）。
2. **P0-6：顶栏分层**。把 `routes 1/1 · wh 7/2 · +1/s · -10/death` 整体折叠进 Colony 面板或 Dev Overlay（F3 toggle）；主 HUD 只留资源数字 + 当前 Objective + Storyteller 一行。这是"作者语气"最廉价的回归动作。
3. **P0-1：Entity Focus 点击命中**。hitbox 放大 3–5 倍 + 在 tool=None / Esc 后允许 select。这是最多 reviewer（6 人）命中的功能性 bug，修复边际收益极高。

**Tier B — 需要一点视觉工作：**
4. **P0-2：Heat Lens 可见化**。当前叠加层颜色太淡，需要增强对比度 + 提供图例 + 圆圈上加 label（"sabotage risk"、"supply hot"）。后端 metric 已就绪。
5. **P0-5：饥荒/死亡警报**。屏幕边缘红色 vignette + toast "Mose-26 died of starvation"（直接复用 P0-3 的 event 数据源）。
6. **P0-8：建造反馈**。ghost preview（红/绿可建态）+ 放置成功 tile flash + 错误原因完整展示（不截断）。

**Tier C — 需要 asset 但不涉及 mechanic：**
7. **P0-4：基础音效**。环境底噪 loop + 建造 thunk + 死亡 chime + warning sting 四层最低配。允许用 royalty-free asset。
8. **P0-10：工人命名 surface**。后端已有 `Mose-26` 这种 ID——Entity Focus 打开后就能显示；不改 mechanic，只做展示。

**Tier D — 引导（需要些设计但不涉及 mechanic）：**
9. **P0-9：前 60 秒强制暂停 + railroad tutorial overlay**。3–4 步小任务把核心循环教清楚，不改任何 gameplay 逻辑。
10. **P0-7：暂停态下允许 blueprint 排队**（纯 UI 改造——AI 已有 planner，加一个"玩家蓝图优先级 > AI planner"的列表即可），让玩家能在暂停态规划。**⚠ 需要确认这算 UX 还是算 mechanic——建议 Enhancer 确认 freeze 边界后再动。**

**Tier E — 可选跳过：**
11. **P0-11（模板差异化）**：明显属于 content/mechanic，**不要碰**。记录到 Round2 backlog。

### P1 顺带处理建议
- **P1-6（文案截断）**：随 Tier A-2 顶栏分层一起修，增加 title 属性 + overflow 处理。
- **P1-7（模板 preview 不刷新）**：5 行代码的 bugfix，顺手修。
- **P1-9（工具粘滞）**：加 Esc→tool=None + 工具自动回弹（Stardew 式），休闲玩家大救星。
- **P1-10（启动屏）**：加 Logo + 版本号 + Continue/Settings 菜单——UI polish 范畴。
- **P1-5（Kitchen 0 产出的诊断提示）**：在 Colony 面板给 Kitchen 加 idle/disconnected badge（类似 Factorio 红色感叹号）——不修 planner 本身，只展示状态。
- **P1-8（响应式）**：给 ≤ 1280 加 media query + 面板折叠——UI 改造不涉及 mechanic。

### P1 建议**不要碰**
- **P1-1（fallback planner 不造 Kitchen）**：这是 CLAUDE.md 明确标注的 "Phase 9 punted" 结构性 bug，改这个 = 改 AI policy = 改 mechanic。Enhancer 只能做 P1-5 的"展示 idle 状态"缓解版。
- **P1-2（Emergency Relief 不透明）**：改规则会动 mechanic。只能做 polish——加一个 toast 解释"Emergency relief triggered because collapseRisk > 0.8"。
- **P1-3（4× 掉速）**：这是 perf/sim loop 问题，**属于 perf 可以修**。但注意别改 sim 顺序。
- **P1-4（Score 公式扁平）**：改公式 = 改 mechanic。**不要碰**。

### Freeze 边界把握总则
- **rewire 已有数据 ≠ 新 mechanic**：后端 event trace / AI narrative / visitor IDs / weather state 接到 UI 都算 polish。
- **提示/warning/toast 属于 UX**：但不要因此触发新规则判定。
- **视觉资产（音效、sprite、图例、tooltip、ghost preview）全部允许**。
- **平衡数值、planner 逻辑、score 公式、AI policy、raid escalator** 一律 freeze——写进 Round2 backlog。
- **如果一个 P0 需要动 planner 才能真正修复（P0-11/P1-1），Enhancer 只做 UI 层缓解 + 文档标记，不动后端**。

---

## 6. 已知限制

Round0 Debugger 的 persistent failures 信息在本次 scope 内不可见，skip。

---

## 附录：Top 3 P0 一行摘要（供 Stage B 快速定位）

1. **P0-3/12 Storyteller + event log rewire**（7 人命中叙事，5 人命中死亡日志）—— 后端 `devEventTraceVal` 已有完整事件流，把 `visible:false` 改掉并接到 UI 即可一次性解决 3 个 P0。
2. **P0-4 音效真空**（7 人命中）—— 4 层最低配音效（ambient/build/death/warning）是 reviewer 一致认为"独立游戏不可接受"的缺失。
3. **P0-1 Entity Focus 点击失效**（6 人命中）—— 最多人命中的功能性 bug，修 hitbox + tool-none 模式即可，边际收益最高。
