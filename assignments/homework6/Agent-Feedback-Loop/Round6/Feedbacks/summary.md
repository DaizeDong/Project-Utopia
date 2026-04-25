---
round: 6
date: 2026-04-25
reviewers: 10
avg_score: 3.35
score_min: 3
score_max: 4
verdict: "一具骨架精致、血肉稀薄的 colony sim — 模拟内核与 AI 透明度有真亮点，但呈现层、可玩性、引导、叙事、音频与稳定性全面欠缺，10 位评审无人推荐付费。"
---

## 1. 评分表

| reviewer | 身份 | 分数 | 一句话摘要 |
|---|---|---|---|
| 01a | Onboarding | 3 | "这不是一款准备好交给玩家的游戏，是一份没人配讲解员的程序员演示"；title 屏背后游戏在偷跑、briefing 不随模板更新、Build tab 会把页面甩到 about:blank。 |
| 01b | 可玩性 | 3 | "野心比执行力大很多的玩具" — 玩家被边缘化、热键冲突 (Space=Erase / L=切回 splash)、12 工人开局就 starving、AI 自动驾驶后玩家无事可做。 |
| 01c | UI 呈现 | 3 | "停留在开发者调试面板而非成品游戏阶段" — 5 档 viewport 800/1366/2560 全崩、原生 HTML 控件、字号 ~11px 不可读、地名标签重叠、Why no WHISPER 直暴露。 |
| 01d | 机制/内容 | 4 (机制5/内容3) | 机制可视层达到商业级（heat lens / decision context / ETA），但内容本质仍停留在 RimWorld α5 之前 — 11 建筑 / 4 实体 / ~8 事件 / 0 床/睡眠/房间。 |
| 01e | 创新性 | 4 | "AI 决策透明面板" 是真亮点，但 LLM 全程 0 调用成功、saboteurs 派系玩家不可见、视觉无识别度、UI 出现简体中文残留 — 独特价值主张目前不成立。 |
| 02a | RimWorld 老兵 | 3 | "很会摆 colony sim 的形状，但还没长出 colony sim 的牙" — 没有 building inspector、worker carry 只有 food+wood、22 分钟 0 raid 0 fire、Day 17 永生 plateau。 |
| 02b | 休闲玩家 | 3 | "把 AI 系统当玩具，而把玩家当工程师" — 全英文+硬核术语、F1 reset 整局、数字键 3 切模板丢档、零声音、AI proxy unreachable 红字劝退。 |
| 02c | 速通/min-max | 3.5 | "一款自动驾驶演示器" — 分数永远 0 pts 不显示、无 game-over 总结、L 键直接弹回 boot、Autopilot 双 toggle 自动失同步、Save Snapshot 无 timestamp。 |
| 02d | 叙事/RP | 3 | "RimWorld 兄长留下的骨架，骨架上还在长东西，但还没有血" — 名字池跨开档复用、死亡作为事件不存在、出生全是 "born at the warehouse" 无亲缘、Storyteller 是 protobuf 不是叙述者。 |
| 02e | 独立评论人 | 4 | "可能成为好独立 colony sim 的设计文档，被错误地构建成了它自己的 dev build" — briefing 散文 + memory stream "Vermin swarm gnawed the stores" 是花苞，但音频空白 / 终局无仪式 / 视觉无作者。 |

---

## 2. P0 — Structural Blockers

### P0-1. Navigation / 路由 bug 系列：单次按键即丢档
- **Reviewers:** 7 / 10 — 01a, 01b, 01c, 02a, 02b, 02c, 02e
- **玩家可观测症状:**
  - 01a: "反复点 Build sidebar tab → 整个 SPA 卡死并跳到 about:blank"，"按一个 UI 标签，整个游戏就消失"
  - 01b: "点 AI Log 后页面 URL 从 / 跳到 ?template=fertile_riverlands 又跳到 ?template=archipelago_isles，整个游戏被踢回 splash 屏。我重开了 4 次"
  - 02a: "splash 启动页凭空又跳了出来…我没看到任何'确认丢弃当前 run'的提示"
  - 02b: "F1 在浏览器里大概是触发了刷新或者帮助快捷键冲突…回到开始界面，所有进度没了"；"按了一下数字键 3…URL 变成 ?template=archipelago_isles"
  - 02c: "按了一次 L 想看 Heat Lens，结局直接被踢回 boot 屏"，"绝不要按 L、绝不要按 Esc"
  - 02e: "F1 在 boot splash 状态下重置回 boot splash"
- **系统层猜测:** Sidebar/help/template-dropdown 共享同一份 keyboard + URL routing 状态机，多个事件 listener 在 `keydown` / `click` 上串扰；没有 "确认丢弃当前 run" 守卫；Vite SPA 的 history.pushState 与游戏世界状态没有解耦。任何会修改 URL 的操作（template 选择、AI Log 按钮、F1、L、Esc）都可能触发页面级 reload，把活着的殖民地连同存档蒸发。

### P0-2. 热键冲突 / 焦点窃取：玩家输入被错误层吃掉
- **Reviewers:** 6 / 10 — 01a, 01b, 02a, 02b, 02c, 02d
- **玩家可观测症状:**
  - 01a: "数字键 3 想选 Farm…build panel 收起、地图弹出 fertility overlay、Entity panel 跳出"；"按 0 想重置摄像机…显示 Selected tool: kitchen (shortcut)"
  - 01b: "Space 不是暂停，是切到 Erase 工具"；"L 既切 Heat Lens 又切 Fertility Overlay"
  - 02a: "按 L 切热力图、按 2 切 Build 工具，可右侧的 Settings 标签同时被键盘事件吃了一下"
  - 02c: "Space 暂停经常被焦点吃掉，明明按了没暂停"；"焦点在 Build 面板按钮上，结果是按钮被'点击'，进入 farm 工具而非暂停"
  - 02d: "我按 T 切 overlay 时几次直接 navigate 到了别的 template URL，run 被吞了"
- **系统层猜测:** 没有顶层 keyboard context manager；数字键、Space、L、T、Esc、F1 在 splash / build / overlay / dropdown-focused 等不同状态下语义不同但缺乏 disambiguation；HTML focus 机制（dropdown 仍在 focus 时 1-12 被解释为 select option）与游戏自身 hotkey handler 没做互斥。

### P0-3. 暴露给玩家的 dev telemetry：WHISPER / LLM proxy / halo 占位符
- **Reviewers:** 10 / 10 — 全员
- **玩家可观测症状:**
  - 01a: "右上角红色错误条不停弹出 'Why no WHISPER?: LLM never reached'…一个外部玩家看到红色 + LLM + proxy + timeout 的字眼会怀疑游戏挂了"
  - 01b: "汽车仪表盘上写'ECU 出错，正在用备用程序开车'"
  - 01c: "显然是给开发者看的字符串直接出现在右上角玩家视野里"
  - 01d: "整场我都看到 Why no WHISPER?: LLM never reached / LLM quiet — fallback steering"
  - 01e: 第 9 项 "AI 整张大图没有跑通"；中文 "物流图例 (Logistics Legend)" 直接出现在英文 UI
  - 02a: "halo 明显是 placeholder，不是给玩家看的"
  - 02b: "我玩个游戏怎么提示 AI 代理不可达？"
  - 02c: heat lens 触发的 boot 弹回与 LLM 串联
  - 02d: "把内部状态怼到玩家脸上"
  - 02e: "Hide Dev Telemetry 这个按钮本身是这游戏作者表达上最矛盾的一块"
- **系统层猜测:** 当前 LLM 路径在评测环境 100% 失败（OpenAI HTTP 429 / proxy unreachable），fallback 路径正常工作但不静默；"halo" 是 Heat Lens 的某种默认 cell label，未被替换为有意义的 throughput 指标；AI Storyteller 把 directive prompt 直接显示，未做"in-fiction"包装。

### P0-4. 资源/状态显示自相矛盾，"叙事说谎"
- **Reviewers:** 5 / 10 — 01a, 01b, 02a, 02b, 02c
- **玩家可观测症状:**
  - 01a: "STABLE 标签 + 'Food 49 ▼ +19/min cons -40 ≈ 0m' + 红色 '50s until empty'"；"Meals are flowing 但 meals 是 0"
  - 01b: 第 6 项 "顶栏 Workers 数 != Population 面板 Workers 数 != Entity Focus 列表条数"
  - 02a: "STABLE 标签和 58 秒后没饭吃同时显示，没有红字预警"
  - 02b: "STABLE / Food +59/min 和 until empty 1m 12s 同时出现"
  - 02c: Day 7 "STABLE, Food -171/min, until empty 1m" — directive 仍写 "rebuild the broken supply lane"
- **系统层猜测:** STABLE / DRIFT / STRUGGLING 标签的判定阈值与 ETA 计算用的不是同一份 sample；Storyteller 的 milestone toast 是 one-shot trigger，不会回滚；HUD 顶栏 / Population panel / Entity Focus list 各自维护自己的 worker 计数，没有 single source of truth。

### P0-5. 完全无音频 — 现代游戏死刑判决
- **Reviewers:** 5 / 10 — 01a (P3 提到), 01e, 02b, 02d, 02e
- **玩家可观测症状:**
  - 01e: "我整场 review 没听到任何 SFX/BGM。这个时代做无声 colony sim 是直接放弃了 30% 的差异化空间"
  - 02b: "全场没有任何声音…BGM、点击音效、小人脚步声、'叮'一下提示新事件——一个都没有"，"耳机在工作但游戏里啥都没有"
  - 02d: "我打开 DevTools 检查 <audio> 元素和 AudioContext，audios = 0，AudioContext 类存在但从未被实例化"
  - 02e: "沉默是 colony sim 的杀手…这游戏是默片"
  - 01a P3: "标题菜单加一个简短 30s 引子动画/插画/音乐"
- **系统层猜测:** AudioContext 从未被实例化；项目层面没有 audio asset pipeline；UI click / build / death / milestone / ambient 五类钩子都存在但 silent。

---

## 3. P1 — Major

### P1-1. 缺失 Building Inspector / Worker 控制 — 看得见摸不着
- **Reviewers:** 3 (02a, 01d, 02c)
- **症状:** 02a "点 building tile 无反应…整个游戏没有 building inspector，worker 我能选，building 我不能选"；01d "可见性 ≠ 可干预性…没有 zoning、没有 priority、没有手动指派工人"；02c "没有 build queue、没有 tech tree、没有可视化 throughput 统计"
- **假设:** 选择系统只对 entity (worker/animal) 注册 raycaster，未对 tile-bound building 注册；缺 priority/bill/recipe queue 这一整层经典 colony sim 控制面板。

### P1-2. 完全缺乏主动事件 / 危机 — Survival 但不会死
- **Reviewers:** 4 (01b, 01d, 02a, 02d)
- **症状:** 01b "Threat 长期挂在 42% 但从来没有真正打到家门口的画面"；01d "12 分钟内我没有触发一次袭击…没有疾病、没有自然灾害"；02a "Day 17 + 80 workers，0 raid、0 fire、0 disease、0 wildlife attack"；02d "故意大量 Erase 农田引发饥荒…没有死亡通知"
- **假设:** Threat 数值在涨但没接事件 spawner；scenario brief 写了 "raiders find the breach" 但没真的实现 wave 触发；缺死亡 / 葬礼 / mood penalty 仪式。

### P1-3. Onboarding 完全缺失 / 教学内容是程序员视角
- **Reviewers:** 3 (01a, 01b, 02b) — 01a 此项被打 "P0 game-breaker"
- **症状:** 01a "5 分钟之内我能数出至少 15 个未定义专有名词：WHISPER / DIRECTOR / DRIFT / Heat Lens / DevIndex…"；01b "首 5 分钟做 onboarding tutorial：手把手教玩家点哪个"；02b "光是 Controls Tab 我就看到一长串…哥，我才打开你 4 分钟"
- **假设:** Help 对话框默认 tab 是 Controls 而非 Resource Chain；没有强制脚本化教学步骤、没有"教程时暂停游戏"。

### P1-4. 响应式 / UI Scale 全面崩坏
- **Reviewers:** 2 (01c, 01a) — 01c 主调
- **症状:** 01c "1366 / 1024 / 800 / 2560 四档全部不达标，800×600 整个 UI 变成一张空地图"；01a "Help 默认是不打开的…按 ☰ 折叠后再打开 tab 才显示"
- **假设:** 单一 1920×1080 baseline，无 breakpoint，无 UI scale slider；浏览器原生 select / spinbox 直接暴露。

### P1-5. Score / DevIndex / 终局总结缺位
- **Reviewers:** 4 (01a, 01b, 02a, 02c)
- **症状:** 02c "我跑三次、没有任何一次拿到分数…HUD 上根本没有 live Score 字段"；01a "Survive as long as you can 但你的 score 我永远看不见"；02a "崩盘后没有 game-over 模态、没有最终分数总结、没有 retry 按钮里的 seed 信息"
- **假设:** Score 字段仅在 boot splash 占位 0 pts，进入游戏后未挂到 HUD；崩盘判定本身可能也是缺位 (01a "Survival Mode 的承诺是'cannot recover' — 然而它什么时候认定 cannot recover？")；无 game-over 模态、replay seed 持久化。

### P1-6. Worker carry / supply chain 半残：只搬 food+wood
- **Reviewers:** 2 (02a, 01d) — 02a 重点
- **症状:** 02a "8 个不同工人的 Inspector，确认 Carry 永远只是 food + wood…stone / herbs 这两个 raw resource 根本不进 worker 的口袋"；02a Day 12 "80 个工人同时空手"；01d "看不到 5 种资源都被运输"
- **假设:** Worker carry 数据结构只有 4 种但 inspector UI 只列前两个；或 stone/herbs/meals/tools/medicine 通过 deliverWithoutCarry 路径直接 colony-wide 入库（这是 v0.8.0 已知设计），但 UI 没解释。

### P1-7. Autopilot 双 toggle 失同步 + 自动开/关
- **Reviewers:** 2 (02a, 02c)
- **症状:** 02a "autopilot 的 checkbox 有两个 — top bar 一个 (#aiToggleTop)、Settings 内一个 (#aiToggle)，UI 之间不同步"；02c "至少 2 次明确点 Autopilot checkbox 它都自己被弹掉…Fast forward 4x 按钮按下之后会和 Autopilot checkbox 冲突"
- **假设:** 两个 DOM checkbox 各自维护 boolean state，未绑同一 store；splash reset 把 ai 默认开起来。

### P1-8. Toast / Milestone 重复触发 + 易错过
- **Reviewers:** 3 (01a, 01b, 02a)
- **症状:** 02a "First Medicine brewed 这个吐司在 Day 15 又跳了一次…milestone 系统状态机有 bug 或者没存"；01b "First Kitchen raised 等成就 toast OK 但很短，飘过就忘"；01a "Toast 通知应该可点击查看历史，否则错过就再也找不到了"
- **假设:** Milestone state 没持久化到 colony save，每个新 game tick 重新评估；toast 没 history panel。

---

## 4. P2 — Minor / single-reviewer findings

**UI 呈现 (01c 单评):**
- 多套图标体系混搭（pixel-art topbar + emoji-like build panel）
- 4+ 套字体并存，无 type scale
- 无自定义 cursor / scrollbar / focus ring
- "Autopilot ON - rule-based - n" 末尾被截成 "n"
- STABLE 绿色标签廉价，对比度 ~4.0:1 不达 WCAG AA
- Hover Tooltip 是浏览器默认 title attribute

**3D / 视觉 (01c, 01e, 02d):**
- 无昼夜循环 / 季节色调变化
- worker sprite 12×12 像素，无 walk-cycle 无 portrait 无衣服色差
- 地名标签 "north timber gate" / "west lumber route" 多重堆叠 (z-order + dedup 缺失)
- 模板间视觉只有边框颜色差异（Coastal Ocean = Plains + 海蓝边）

**叙事 / Content (02d, 01d, 02e):**
- 名字池跨开档完全复用 (Mose Keane / Pia Orr 永远是这批)
- "born at the warehouse" 无母亲无亲缘
- 关系系统只有正向 (Friend / Close friend)，无 rival / lover / family / grudge
- Backstory + Traits 字段存在但与行为脱钩
- Decision Context 文本风格混乱（半工程语半人话）
- AI Storyteller 是模板填空 ("DIRECTOR picks push the frontier outward" 反复)
- Vermin swarm / Warehouse fire 这种"有作者声音"的事件孤立无后续

**Hotkey / 速通 (02c, 01a):**
- 无拖拽多格放置
- 无重复上一次建造 / shift+click 排队
- Save Snapshot 无 timestamp、无回滚反馈
- Fast Forward 只有 1× / 4× 两档（缺 8× / 16×）
- Ctrl+Z / Ctrl+Y 无可见效果
- 无 leaderboard / seed 字段 / replay 列表

**Scenario / 模板 (01d, 02a, 02e):**
- Scenario 文案与 template 解耦，scenario 在不同 template 下重复抽到
- 模板的 mechanical 差异薄弱 (除"要不要建桥")
- Coastal Ocean 没有渔业 / 风暴 / 潮汐专属机制
- briefing 不随 template dropdown 切换更新

**性能 / 稳定性 (01b, 02c, 02e):**
- "Loading Project Utopia" splash 反复出现 (一次 session 5 次)
- page 偶尔崩到 about:blank（疑似 Vite HMR / 渲染崩）
- splash 第一次开和第二次开文案不一样（作者改稿信号）

**i18n (01e, 02e):**
- "物流图例 (Logistics Legend)" 中文混入英文 UI

**信息密度 / Inspector (01a, 02b, 02d):**
- Inspector 暴露 hp=100.0/100.0 / hunger=0.639 / world=(1.10, 2.37) tile=(49, 38) 这种 raw 数据
- Top Intents / Top Targets 应折叠到 Debug expander
- "+11 more…" Entity Focus 折叠不可滚到底，41 个 worker 只见前 20

---

## 5. Cross-cutting Themes for Round 6 Enhancer Planning

### Theme A. "AI/Director 表面诚实，实质不在线" (10 / 10 reviewer)
WHISPER / LLM never reached / proxy unreachable / OpenAI HTTP 429 — LLM 在评测环境 100% 失败，fallback 在跑但所有评审都看到错误信息。这同时是 P0-3 (telemetry 暴露) + 01e/02e 的"独特价值主张不成立"。**Enhancer 候选：** (a) 静默 fallback + 隐藏 dev telemetry 默认开；(b) 把 fallback policy text 角色化（"I'm exhausted, time to head back"）；(c) 真做 in-fiction storyteller 名字（Cassandra/Phoebe-style）。

### Theme B. "信息密度爆炸 + 调试残留 = 玩家分不清产品/工具" (10 / 10)
所有评审都列举了"halo / Mood:0.59 / world=(1.10,2.37) / Top Intents:1.40"这类裸数据。这不只是 UX 问题，是**作者身份未决**（02e 原话：作者还没决定要不要藏）。**Enhancer 候选：** Settings → "Player Mode / Dev Mode" 双视图；自然语言翻译层 (Mood 0.59 → "doing okay")；Inspector 默认折叠 raw 字段。

### Theme C. "Round 5 ui-polish + casual 教训未学到" (引用 01a/01b/02b/02c)
Round 5b 已经做过 boot splash 美化、casual UX 改造、HUD 高度变量、KPI 字体（参见 git log 的 5af4aa3 / e8beb80 / 008bbe6）。但 Round 6 评审仍指出：boot splash 文案不随 template 更新；HUD 字号 ~11px 不可读；toast 一闪即逝；teaching tooltips 是 aria-live only。**Enhancer 候选：** 真正打通 dropdown ↔ briefing 同步；自定义 hover tooltip 卡片；toast history panel。

### Theme D. "Survival 不会死，Storyteller 不会讲故事，Score 看不见"
4 位评审在不同维度都指向"长期反馈空洞"：02a "永生 plateau"，02c "无 game-over 总结"，01b "没有死亡威胁就不是生存游戏"，02d "死亡作为叙事单元不存在"。这是机制 + 叙事 + UX 三层叠加问题。**Enhancer 候选：** 真正接通 raid/fire/disease event spawner（CLAUDE.md 提到 raid escalator 已存在但评审看不到）；death cinematic + obituary；HUD 持续显示 live Score + DevIndex；game-over 模态 with seed/replay。

### Theme E. "音频空白 + 视觉无作者 — 没有可记忆的画面"
5 位评审显式抱怨无音频，3 位抱怨视觉无识别度。这是 HW06 freeze 之外的**新增内容空间**（per 用户 directive: freeze lifted）。**Enhancer 候选：** lo-fi ambient BGM 循环；UI click / build / milestone / death 五类音效；tile 手绘脏笔触；worker portrait + 性别/职业色差。

---

## 6. Note for Stage B Enhancers

- HW06 freeze is **lifted** in Round 6 per orchestrator directive (maximise project completion). Enhancers may propose new mechanics, audio assets, content, deeper economy/AI/director work.
- Each enhancer reads only ONE feedback (their assigned id) and the repo. Do not cross-read.
- 4-seed benchmark + 1293-test suite + browser smoke must remain green / improving as the acceptance bar.
