# Round 8 盲测反馈：02d-roleplayer

评测日期：2026-04-26  
评测视角：叙事 / 角色扮演玩家  
Build：仅通过浏览器实际体验 `http://localhost:5173`  
截图目录：`assignments/homework6/Agent-Feedback-Loop/Round8/Feedbacks/screenshots/02d-roleplayer`

## 总评分（10 分制）

**6.0 / 10**

这是一个已经有“故事苗头”的殖民地模拟：工人有名字、有职业、有饥饿和健康状态，有一些 backstory，也会出现出生、饥饿死亡、野生动物压力、交通热点、公共危机文案等事件。但从角色扮演玩家角度看，它还没有真正把这些元素缝成“我会复述给别人听的故事”。我能看到很多事发生，却不太能感到某个具体的人经历了这些事。系统更像在不断生成殖民地运营摘要，而不是在生成角色命运。

我保存的主要截图包括：

- `01-start-workers.png`：开局 12 名工人列表、首个出生事件与基础事件流。
- `02-hova-details.png`：Hova Quinn 的角色详情，显示 backstory、职业、状态、policy notes。
- `03-crisis-starvation.png`：中期资源压力、人口膨胀、地图热点与危机状态。
- `04-late-history-score.png`：后期分数、公共事件残留、地图压力标签。
- `05-colony-crisis-storyteller.png`：Colony 面板里的 AI Storyteller、资源危机和人口统计。

## 叙事第一印象

第一印象比普通物流游戏更有叙事野心。开局不是纯粹的“木头 + 食物 + 建筑”，而是有一个明确的边疆前提：殖民地刚着陆，西边森林被堵住，东边仓库断裂，需要重新接通物流。这个前提对于故事生成很重要，因为它给了玩家一个可讲述的场景：“我们被困在破碎边境，必须把断掉的生命线接上。”

事件文本也不完全机械。例如我看到 “First Meal served: Prepared food is reaching the colony.”、“First Medicine brewed: Injuries are no longer permanent.”，以及 Colony 面板里的 “66 mouths, no margin. Every second without harvest is a debt paid in lives.” 这些句子比单纯的 “+1 food” 更像作者声音。它们能暗示殖民地阶段变化：从刚有饭吃，到有药，再到人口压力压垮粮食线。

问题是，这些叙事大多停留在殖民地总体层面。它告诉我殖民地发生了什么，却很少告诉我某个角色如何被改变。出生提示频繁出现，例如 “Hova Quinn was born to Dova Vesper and Pell Pike”、“Nessa Glade was born to Inza Hale and Hova Quinn”、“Luka Lark was born to Pia Arden and Hova Quinn”。这些提示看起来像家庭故事的开端，但我点开相关人物后，没有看到亲属关系、父母记录、孩子记录、人生事件或情绪痕迹。于是出生从“家庭延续”变成了“人口 +1 的漂亮提示”。

## 我能否关心某个角色

我尝试追踪 Hova Quinn 和 Dova Vesper。Hova Quinn 起初是 COOK，面板显示 “Backstory: cooking specialist, swift temperament”，后来在危机中变成 FARM，并显示 hungry、well-fed、seek food、seek task 等状态。Dova Vesper 则有 “woodcutting specialist, hardy temperament”。这些信息让我有一点点角色抓手：Hova 像是一个灵活、快手的厨师，Dova 像是能吃苦的伐木者。

但是我很难真正关心他们。原因不是没有名字，而是名字之后缺少个人连续性。Hova 作为孩子的父母多次出现在出生 toast 中，但他的个人面板没有“孩子：Luka Lark / Nessa Glade”之类的关系，也没有“最近成为父母”“担心食物不足”“因孩子出生士气提升或压力增加”等记忆。Dova 也类似，她被系统记录为某个孩子的母亲，但点开她时只看到通用政策说明和即时工作状态。

角色会变职业，这在运营层面有用，但叙事上削弱了身份感。Hova 从 COOK 变成 FARM，如果这是危机中的角色转变，它本可以很动人：厨师放下锅去田里抢救粮食。但 UI 没有把它讲出来，只是把 Role 和 Intent 更新掉。玩家只能自己脑补，不知道这是性格驱动、政策驱动、食物危机驱动，还是普通调度。

我能记住 Hova Quinn，是因为我主动追踪了他，而不是因为系统让我在乎他。一个强叙事系统应该反过来：某些角色因为行为、关系、创伤、牺牲或失败自然跳出来，让玩家忍不住记住。

## 角色系统问题

角色系统目前的最大问题是“属性有名，但因果不清”。面板里有 backstory 和 temperament，例如 cooking specialist、swift temperament、hardy temperament，但我没有看到这些 trait 如何明显影响行为。Hova 是 swift，所以他移动更快吗？更容易接烹饪任务吗？危机中更容易转向抢食或运输吗？Dova hardy，所以更能忍饥或更愿意去危险地区吗？界面没有把 trait 到行为的链条讲清楚。

“Why is this worker doing this?” 面板是一个好方向，但它解释的是殖民地政策，而不是角色动机。它会说 Food critical、Broken routes、Depot congestion、Stone low、Herbs low，这些是 AI 调度解释，不是人物心理。作为角色扮演玩家，我想看到 “Hova is farming because the colony has no food and his children are hungry” 或 “Dova keeps working despite hunger because hardy workers tolerate lower stamina”。现在的解释更像调试器和经济顾问。

列表里每个角色都显示状态，例如 Seek Task、Deliver、Eat、Rest、Wander、Harvest、Process。这些状态对观察模拟很有帮助，但缺乏个人历史。没有履历、重要事件、关系、偏好、伤疤、承诺、怨恨，也没有可回看的个人时间线。角色像带名字的任务执行器，不像会留下记忆的人。

还有一个问题是人口增长太快。短时间内从 12 人涨到 60 多人，出生事件不断刷新，导致每个名字的稀缺性下降。名字太多、关系太快、事件太短，玩家很难建立情感投资。RimWorld 里一个新殖民者加入、一个孩子出生、一个亲属死亡通常是重大事件；这里更像快速生成劳动力。

## 事件 / 死亡 / 家庭 / 记忆反馈

事件是可见的，但持久性不足。顶部会显示 “Last: 某某 was born to 某某”，左下或事件区域会保留少量近期事件，例如 First Medicine brewed、Thal-15 starved。地图上也会出现 west lumber route、traffic hotspot、wildlife pressure 等标签。这些让殖民地有公共状态，但公共历史很薄。

死亡方面，我看到了 “Thal-15 starved”。这是很关键的叙事事件，因为它说明食物危机已经开始付出生命代价。但我不清楚 Thal-15 是谁，是动物、访客还是工人；也看不到尸体、墓碑、亲属反应、殖民地情绪变化，或者任何悼念。死亡作为系统事实存在，但没有成为社会事实。它没有改变幸存者，也没有进入某个人的记忆。

家庭方面，出生提示有父母名，这是目前最强的故事种子。但它没有落地到可检查的关系网络。孩子出生后立即成为一个普通 worker，带职业、饥饿状态和任务状态。没有年龄、成长阶段、依赖关系，也没有父母照料行为。更严重的是，父母组合变化频繁且缺乏上下文，会让关系显得随机：我看到 Hova Quinn、Pell Pike、Dova Vesper、Pia Arden、Vian Hearn 等名字不断组成出生事件，但没有恋爱、伴侣、家庭单位或社会规范支撑这些事件。

记忆系统几乎没有被玩家感知。公共事件在短时间内会被后续事件挤掉，个人面板也不记录“曾经经历过什么”。如果某个角色经历出生、饥饿、换岗、危机、亲人死亡，这些都应该进入他的角色档案。现在只有当前状态，因此故事无法沉淀。

## 作者声音评价

作者声音有亮点。Colony 面板的 AI Storyteller 文字明显比资源 UI 更有味道：“66 mouths, no margin. Every second without harvest is a debt paid in lives.” 这句很有效，它把粮食数字翻译成生命压力。我也喜欢阶段性事件的措辞，例如 First Meal、First Medicine，它们像殖民地编年史的章节标题。

但文本风格不稳定。有些地方很文学，有些地方非常机械。例如 “Policy Summary: Focus: rebuild the broken supply lane. Food critical: workers must eat and deliver reserves first.” 这对理解 AI 有帮助，但作为叙事文本显得像系统说明。面板里把 “Policy Focus / Policy Summary / Policy Notes / Intent / Attack CD” 全部堆在一起，会把角色扮演氛围拉回调试界面。

建议区分两种声音：一层是玩家可读的故事声音，讲人物和殖民地；另一层是可展开的模拟解释，讲算法和政策。现在两者混在同一面板，导致“我想关心 Hova”时却读到“Depot congestion is real”。

## 与 RimWorld 故事生成差距

和 RimWorld 的差距主要不在事件数量，而在事件之间的因果、关系和后果。RimWorld 的强项是：一个角色有技能、性格、关系、伤病、心情、社交互动、记忆和身体状态；事件发生后，会在多个系统里留下痕迹。某人被野兽咬伤，不只是 HP 下降，还可能影响工作能力、恋人心情、医疗资源、下一次战斗风险和玩家记忆。

Project Utopia 目前更像“殖民地机器产生了带名字的状态变化”。出生、饥荒、死亡、危机都有了，但它们没有足够互相咬合。Thal-15 饿死后，殖民地没有明显哀悼；Hova 有孩子后，面板没有亲子关系；Dova 的 hardy temperament 没有在危机中变成可见行为；公共事件没有成为编年史；角色没有因为过去而不同。

RimWorld 还很擅长制造“小而荒诞”的个体戏剧，比如某个厨师精神崩溃去吃珍贵食物，某个恋人抢救失败，某个懦弱者在关键时刻救人。这里目前的戏剧规模偏宏观：路线断了、食物没了、人口很多、压力很高。宏观危机可读，但角色故事还没有足够尖锐的具体瞬间。

## 改进建议

1. 给每个角色增加“个人记忆 / 时间线”。至少记录出生、成为父母、受伤、亲人死亡、饥饿濒死、换岗、参与关键建设、杀死或被动物攻击等事件。玩家点开角色时，应能看到过去 5-10 个重要节点。

2. 把家庭关系落地成可见网络。出生提示里的父母和孩子应该进入角色面板。孩子应显示父母，父母应显示子女。家庭成员饥饿、死亡、受伤时，应产生情绪或行为后果。

3. 让 trait 影响行为，并在 UI 中解释。不要只写 “swift temperament”，要显示 “Swift: movement +15%，更倾向抢送紧急物资” 或 “Hardy: 饥饿惩罚较低，危机中更少休息”。最好在行为发生时写成自然语言。

4. 降低或调节出生频率。出生应该是重大事件，而不是几秒一个的劳动力刷新。否则玩家无法记住任何孩子，也无法相信家庭关系。

5. 给死亡更强的持久后果。死亡应进入公共历史，影响亲属，可能产生墓标、哀悼、士气下降、纪念文本。即便只是动物死亡，也应明确它是什么实体，为什么重要或不重要。

6. 分离“故事文本”和“调试解释”。角色面板默认展示人物语言：身份、关系、最近记忆、当前动机。高级展开再展示 Policy Notes、Intent、Attack CD 等模拟细节。

7. 增加殖民地编年史。把 First Meal、First Medicine、出生、死亡、危机、路线修复等按时间保存，让玩家能回看“这座殖民地的历史”。

8. 让危机事件指定主角。例如食物危机时，不只说 66 mouths，而是指出 “Hova Quinn left the kitchen to harvest because his children were hungry” 或 “Dova Vesper worked through exhaustion to bring wood for the clinic”。这样宏观压力会变成可讲述的人物行动。

## 一句话总结

Project Utopia 已经能生成有名字、有危机、有作者语气的殖民地片段，但还没有让出生、死亡、家庭和 trait 在角色身上留下持久记忆，因此目前更像会讲运营摘要的模拟器，而不是能自然长出 RimWorld 式人物故事的叙事机器。
