# Round 8 盲测反馈：02a-rimworld-veteran

测试身份：RimWorld / Dwarf Fortress / Oxygen Not Included 老玩家  
测试日期：2026-04-26  
测试方式：仅通过浏览器体验当前 build；未读取源码、README、历史反馈、git 信息或仓库文档。  
交互记录：主测试脚本完成 66 次交互，包含帮助页切换、开局、选择单位、热力镜头、暂停、缩放、右键拖拽、多个建造工具尝试、F1 帮助、等待模拟推进到约 50 秒；截图保存在指定目录。

## 总评分（10 分制）

**6.4 / 10**

它已经像一个“殖民地模拟原型”，而不只是资源点击器：有工人列表、职业、饥饿、健康、家庭出生事件、动物死亡、资源加工链、仓库/道路/处理建筑、热力瓶颈视图、AI policy 解释和建造规则提示。对老玩家来说，最值得肯定的是它愿意把“为什么工人这么做”和“供应链哪里断了”直接暴露出来，这比许多早期 colony sim 更可诊断。

但作为 RimWorld / DF / ONI 老玩家标准，它的系统可信度还不够。当前体验更像是“一个有殖民地模拟外观的物流沙盘”：状态很多，但状态之间的因果、风险升级、角色差异和灾难后果还没有足够扎实地压到玩家身上。危机出现得偏温和，死亡/出生/饥饿的戏剧性不够，工人 AI 看起来能跑，但还没有形成可被玩家长期学习、预测和利用的优先级体系。

## 老玩家第一印象

开场 briefing 很明确：西侧森林路线、东侧破仓库、道路、仓库、热力镜头，方向感比很多原型好。帮助页里资源链也写得清楚：Farm 产 Food，Kitchen 做 Meals；Lumber 产 Wood；Quarry + Wood 到 Smithy 产 Tools；Herbs + Clinic 产 Medicine。对老玩家来说，这种开局任务是合理的，因为它没有直接要求我“赢”，而是给我一个物流断点让我修。

UI 的信息密度很高，右侧 Build Tools、Construction 规则说明、底部控制栏、左下 Entity Focus、顶部资源条和事件条都能快速建立“这是一个模拟游戏”的感受。热力镜头的 red/blue 解释也对路：red 是 surplus，blue 是 starved，用颜色定位供应链问题，这是 ONI 玩家会喜欢的诊断层。

第一印象的主要问题是：地图和模拟还没有形成足够强的“可读地貌”。我能看到草地、水、山、道路、建筑和小人，但建筑图标、资源节点、道路连接、仓库覆盖、可探索边界之间的关系需要靠文字面板猜。RimWorld 的工作台/储区/电网，DF 的 z-level 与 stockpile，ONI 的管道/气体/温度，都能在画面上很快形成系统地图；Project Utopia 当前更依赖 sidebar 和 toast。

## 系统深度评价

系统层面已经有几条真实链路：食物链、木材建造链、石头与工具链、草药与药品链、道路/仓库物流链。这些链路在帮助页和建造提示里都能找到，并且运行中确实出现了 First Kitchen raised、First Meal served、First Tool forged、First Lumber camp raised 等里程碑。说明它不是纯 UI 假信息，至少有建筑、输入、处理、输出和工人搬运的循环。

我最认可的是“诊断工具”方向。选中 Vian Hearn 后，面板显示 backstory、temperament、role、state、intent、hunger、health、carry、policy focus、policy summary 和 policy notes。Policy notes 里提到重建供应线、草药低、药品稀缺、无 clinic、水隔离资源、优先桥梁。这种解释对老玩家非常关键，因为 colony sim 的乐趣不是“AI 自动干活”，而是玩家能理解 AI 为什么没干预期的事。

但是深度目前更多是“列出来”，不是“压出来”。例如饥饿从 starving/hungry/a bit hungry 到 well-fed 有显示，但我没有感到饥饿会迅速造成医疗、心情、效率或死亡螺旋。出生事件很频繁，50 秒内出现 Karis Cole、Wren Glade、Eira Vesper、Faye Dane、Una Cole 等新角色，人口增长明显，但这没有马上导致住房、育儿、食物、亲属关系或工作限制的压力。鹿死亡有日志，但对殖民地生态、猎物、威胁或食物链没有明显影响。系统有骨架，但“互相咬住”的力还不够。

## AI/工人行为问题

工人会 Seek Task、Deliver、Harvest、Process、Rest、Seek Rest、Seek Food，状态变化是可见的。运行到 40 秒左右，多个工人从 Seek Task 进入 Deliver，厨师 Process，铁匠 Process，说明工作分配不是静态装饰。个别角色如 Vian Hearn 从 HAUL 到 COOK，再到 Seek Food，至少能看到职业/任务切换。

问题在于优先级可信度不足。开局几乎所有人都是 hungry 或 starving，但他们仍然按角色去 Seek Task、Deliver、Harvest、Process。Dova Vesper 起初 starving，后续仍做 COOK 或 Seek Task；Vian Hearn hungry 时能 Seek Food，但不是所有饥饿角色都明显停工吃饭。老玩家会问：饥饿阈值是什么？谁有权吃 meal？厨房刚产出的 meal 如何分配？工人是否会为了急救/逃跑/吃饭打断当前任务？当前 UI 给出状态，但没有把“生存优先级压过生产优先级”的规则表现得足够强。

Autopilot 边界也不够清晰。顶部提示 Autopilot off，Manual control is active; fallback is ready。帮助页说 AI director 每 tick 发布 policy，但开局时又是 manual control。实际游玩中我能看到 policy focus 和 notes，但不清楚这是手动模式下的建议、fallback 策略，还是已经在驱动工人行为。对 colony sim 玩家来说，手动命令、蓝图建造、AI 调度、全局政策之间必须边界清楚，否则玩家不知道自己是在“指挥”还是“旁观”。

## 资源链与危机诊断

资源链可理解性中上。帮助页把 Food/Meals、Wood、Stone/Tools、Herbs/Medicine 写清楚，建造面板也逐个说明成本和规则。例如 Kitchen 的文案强调 raw grain 到 meals，Clinic 文案强调 herbs 到 medicine，Road 文案强调每个 road tile 都减少 hauling。建造失败反馈也有用：Need 1 more wood、Need 13 more wood、Cannot build on unexplored terrain、No herb node on this tile、Need 0.161885... more stone/herbs。

但诊断仍有几个明显问题。第一，资源数字顶部只显示图标和数值，缺少 hover/label 时很难确定每个数字是什么。第二，缺料数字出现小数，像 0.1618850438364119 more stone 这种浮点精度直接暴露，严重破坏模拟可信度。第三，热力镜头能显示 input starved、warehouse idle、surplus/starved，但它更像局部 overlay，没有把“哪个建筑缺什么、为什么缺、谁正在送、还差多久”串起来。ONI 的管道流量、RimWorld 的材料欠缺、DF 的 job cancellation 之所以好，是因为玩家能追踪具体链路；这里还缺一个从问题到原因到解决动作的链路视图。

我没有在 50 秒内看到不可逆危机。殖民地有饥饿和 starved input，但资源仍在增长，人口也在增长。当前节奏更像稳定扩张循环，而不是逐渐逼近崩盘。作为 survival colony sim，早期可以不杀人，但应该让玩家感到“如果再不修这个会出事”。现在 threat 的描述在帮助页里很强，但运行中 threat 的可见压力不足。

## 事件/叙事/死亡反馈

事件系统已经存在，并且比纯资源游戏好。顶部 Last 事件条和 AI Log 会记录出生、鹿死亡、首个厨房、首份餐、首个工具、首个木材营地等。家庭关系也有呈现：“Karis Cole was born to Toma Pale and Inza Hale”，“Faye Dane was born to Toma Pale and Pia Arden”，“Una Cole was born to Faye Dane and Garek Orr”。这说明角色不是完全匿名劳动力，游戏已经在尝试家庭/关系叙事。

但事件后果太弱。出生频率高到接近荒诞，几十秒内多名新生儿立刻成为 WOOD、STONE、HAUL、FARM 工人，这让家庭关系从叙事资产变成了人口生成器。RimWorld 里孩子、亲属、恋人、死亡会影响心情和工作能力；DF 里亲属死亡会进入长期记忆和社会网络；Project Utopia 当前只把“谁和谁生了谁”放进事件条，却没有让我看到亲属关系改变行为。Faye Dane 刚出生后很快又成为 Una Cole 的父母，这在模拟可信度上非常出戏。

死亡反馈方面，Deer-19 died - predation 出现过，但它没有形成可感知威胁。是什么捕食者？是否会攻击殖民者？鹿尸体能否变食物？附近工人是否害怕？需要猎人、墙、武器或医生吗？这些都没有显著反馈。死亡应当是 colony sim 的叙事核心之一，现在更像日志噪声。

## 与 RimWorld / DF / ONI 差距

和 RimWorld 的差距主要在角色动机与优先级。RimWorld 的 pawn 有需求、工作优先级、技能、心情、伤病、关系、区域限制和直接命令；玩家能解释“为什么这个人不搬东西”。Project Utopia 有解释面板，但实际优先级还没有足够细，也缺少可操作的工作 tab、区域、禁用、强制任务、医疗休息等手段。

和 Dwarf Fortress 的差距在历史和后果。DF 的强项是世界持续记忆：亲属、创伤、工艺品、战斗、尸体、职业身份都会积累。Project Utopia 有出生和 backstory，但事件太快、后果太浅，尚未形成“这群人经历了什么”的重量。

和 Oxygen Not Included 的差距在系统可视化和物理压力。ONI 的气体、液体、热量、电力、管道、优先级都能被玩家图层化诊断，失败通常来自明确的物理瓶颈。Project Utopia 的 heat lens 是好的方向，但目前只有 surplus/starved 的抽象颜色，缺少流量、距离、库存容量、路径拥堵和加工吞吐的可量化反馈。

## 改进建议

1. 强化生存优先级：饥饿、受伤、恐惧、疲劳应明确打断生产任务，并在工人详情里显示“为什么继续工作/为什么去吃饭/为什么无法吃饭”。

2. 收紧出生与家庭模拟：出生不要直接生成全职劳工；加入年龄、依赖、亲属关怀、悲伤或保护行为。否则关系系统会显得廉价。

3. 把 threat 变成运行中可见压力：增加 threat 数值、来源分解、趋势箭头和下一阶段警告，例如“2 分钟内若没有 medicine，感染死亡率上升”。

4. 修复资源/建造数值显示：缺料反馈必须取整或保留合理小数，不能暴露长浮点；顶部资源图标需要文字标签或 hover 说明。

5. 增强热力镜头：点击 starved 建筑时显示缺哪种 input、最近库存在哪里、当前谁在搬、路程多久、道路是否断、仓库是否满。

6. 明确手动与 AI 边界：Autopilot off 时，AI policy 是建议还是调度？Autopilot on 时会不会自动建造？玩家的蓝图和 AI policy 谁优先？这些需要在 UI 中直接回答。

7. 让事件产生后果：动物捕食应引出捕食者位置、殖民者风险、尸体资源或恐惧；工具锻造应显示效率变化；首份餐应显示谁吃到了、饥饿是否下降。

8. 增加老玩家需要的控制面板：工作优先级、角色限制、建筑优先级、库存过滤、禁止/允许、暂停建造、拆除队列、诊断历史。

9. 提升地图可读性：建筑、道路、仓库范围、资源节点、未探索边界、危险区要更清楚。当前太多关键理解依赖文字日志。

10. 让早期稳定循环更脆：现在 50 秒内即使乱点也能产 meal/tool 并扩人口。可以让错误道路、仓库距离、无 clinic、无 wood buffer 更快造成可见损失。

## 一句话总结

Project Utopia 已经有殖民地模拟的框架和不错的诊断意识，但距离 RimWorld/DF/ONI 老玩家期待的“优先级可信、后果残酷、关系有重量、瓶颈可追踪”的深度模拟还有明显距离。
