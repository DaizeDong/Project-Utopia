# 渲染与用户界面系统 (Rendering & UI Systems)

**版本**: v0.10.1 (HW7 Final-Polish-Loop R3 + hotfix iter5) | **更新**: 2026-05-01

全面文档覆盖 Project Utopia 的 Three.js 场景架构、瓷砖网格、战争迷雾层、
压力透镜 / Heat Lens、地形覆盖、HUD 系统与侧边栏面板。

## 1. Three.js 场景架构

### 摄像机配置
- 投影: 正交投影
- 位置: Y=120 (俯视图)
- 缩放范围: 0.55 ~ 3.2
- 控制: OrbitControls (中键/右键平移, 滚轮缩放)

### 渲染顺序 (RENDER_ORDER)
- 0: TILE_BASE (瓷砖底层网格)
- 6: TILE_BORDER (网格边界线)
- 12: TILE_ICON (瓷砖类型图标)
- 20: ENTITY_MODEL (3D 模型)
- 24: ENTITY_SPRITE (2D 精灵)
- 30: DEBUG_PATH (路径可视化)
- 34: PRESSURE_LENS (标记)
- 36: TILE_OVERLAY (地形覆盖)
- 38: SELECTION_RING (最高优先级)

### 光照设置
- AmbientLight + HemisphereLight + DirectionalLight (太阳) + 补光
- 阴影贴图: 1536×1536 或 1024×1024 (低内存)
- ACESFilmic 色调映射, exposure=1.28

### 日夜循环 Lighting Tint (HW7 R1+R2 A4)

`src/render/AtmosphereProfile.js — modulateAtmosphereByDayNight()` 按
当前 day-night phase 调制 AmbientLight + DirectionalLight + Hemisphere
颜色和强度，实现可见的黄昏 / 夜晚色温变化（无新光源）：

```javascript
const colorBlend = 0.62;  // R1 amplified 0.35 → 0.62
return {
  ambientColor: mixHex(profile.ambientColor, tint.color, colorBlend),
  sunColor:     mixHex(profile.sunColor,     tint.color, colorBlend),
  hemiSkyColor: mixHex(profile.hemiSkyColor, tint.color, colorBlend * 0.7),
  ambientIntensity: clamp(profile.ambientIntensity * tint.ambientMul, 0.22, 1.6),
  sunIntensity:     clamp(profile.sunIntensity     * tint.sunMul,     0.12, 1.5),
  hemiIntensity:    clamp(profile.hemiIntensity * (0.6 + tint.ambientMul * 0.4), 0.20, 0.78),
};
```

R1 把 colorBlend 从 0.35 振幅放大到 0.62，hemi 从 0.6× 提到 0.7× 主
blend（43% vs 21% 的全 tint），让黄昏 / 夜晚色温在 weather + scenario
overrides 之上仍然可读。

## 2. 瓷砖渲染系统

### InstancedMesh 池
- 每个瓷砖类型一个 InstancedMesh
- 动态矩阵 (THREE.DynamicDrawUsage)
- 总容量 = 网格宽 × 高

### 瓷砖颜色映射表
| 类型 | 十六进制 | 纹理 | 粗糙度 |
|-----|--------|------|-------|
| GRASS | 0xa8d98b | grass | 0.97 |
| ROAD | 0xdfc7a7 | road | 0.94 |
| FARM | 0xe4cb72 | plants | 0.95 |
| WAREHOUSE | 0xd59f74 | structure | 0.90 |
| WALL | 0xb6c1cd | wall | 0.88 |
| WATER | 0x86c8f8 | grass | 0.66 |
| GATE | 0x8b6f47 | structure | 0.85 |

### 实体堆叠抖动 (HW7 R1 A4)

`SceneRenderer` 渲染工人 sprite 时使用 Knuth-hash 抖动 (`entityStackJitter`)
对实体世界位置加 ±0.15 瓦片偏移，避免多个工人在同一瓦片完全重叠看不
清个体。Hash 使用 `entity.id` 输入，所以同一实体每帧偏移稳定。

## 3. 战争迷雾 (FogOverlay)

### DataTexture 实现
- 文件: `src/render/FogOverlay.js`
- 分辨率: 96×72 (网格尺寸)
- 格式: Uint8Array (RED_FORMAT, UnsignedByteType)
- 滤波: THREE.LinearFilter (GPU 双线性插值)
- 配置: flipY=true, ClampToEdgeWrapping

### 可见性值
- 0: HIDDEN (alpha=0.75, 深灰, 完全遮挡)
- 1: EXPLORED (alpha=0.35, 浅灰, 已探索)
- 2: VISIBLE (discard, 完全透明)

### Shader Fragment
- 渲染顺序: 42 (高于所有实体)
- depthTest: false, depthWrite: false, transparent: true
- 位置 Y: 0.045 (避免 z-fighting)
- edgeSoftness: 0.15 (1 瓷砖柔和边界)

## 4. 压力透镜 / Heat Lens (PressureLens)

### 标记类型与样式
| 类型 | 圆环 | 填充 | 优先级 | 说明 |
|-----|------|------|--------|------|
| route | 0xffa75a | 0xffe0b8 | 120 | 断开路线 |
| depot | 0x71d9ff | 0xc8f4ff | 108 | 准备仓库 |
| event | 0xff9d80 | 0xffdccb | 96 | 活跃事件 |
| weather | 0x72b9ff | 0xd0e8ff | 84 | 天气灾害 |
| traffic | 0xffcd6c | 0xffefc5 | 70 | 交通拥堵 |
| ecology | 0x8ed66f | 0xd8efb7 | 64 | 野生动物 |
| heat_surplus | 0xff5a48 | 0xff9180 | 118 | 物资过剩(红) |
| heat_starved | 0x4aa8ff | 0x9fd0ff | 116 | 物资缺乏(蓝) |

### 热力透镜 (Heat Lens)
- 红标记: 原始生产者 + 相邻饱和仓库
- 蓝标记: 处理建筑输入为空或仓库利用率 < 20%
- 灰标记: 健康瓷砖 (默认不渲染)

### 上下文敏感的 "supply surplus" 标签 (HW7 R3 A7 P0)

详见 `06-logistics-defense.md#heat-lens-与上下文标签`。当任何 alive
WORKER `hunger < 0.35` 时，红色 "supply surplus" 翻转为
**`"queued (delivery blocked)"`**，悬停 tooltip 加 "Worker Focus" 指针。
解决 "红格 = 过剩" 与殖民地正在饿死的反差。

### Live Popover (HW7 hotfix Batch C)

Heat Lens marker 增加实时 popover，hover 显示 worker-context tooltip
（"N workers waiting" 等聚合）。`summarizeWorkersByTile(state)` 每次
heat-lens build 单次扫描 `state.agents`。

### 标记预算
- 压力透镜: 最多 24 个
- 热力透镜: 最多 48 个 (v0.8.2 Round-6: 160 → 64 → 48 trim)
- 按优先级和权重排序

### Performance — Signature 节流 (HW7 R2 A2)

`SceneRenderer.__pressureLensSignature` 是一个标量 hash 缓存；当签名
不变时跳过 marker 重建。Heat Lens 同样用 `heatLensSignature` 节流。

## 5. 地形覆盖 (TerrainLens)

### 覆盖层模式 (T 键切换)
`null → fertility → elevation → connectivity → nodeDepletion → null`

### 工具自动映射
- farm, herb_garden → fertility
- lumber, clinic → nodeDepletion
- quarry, wall → elevation
- warehouse, road → connectivity
- select → null

### 覆盖层配色
| 模式 | 颜色范围 | 含义 |
|-----|--------|------|
| fertility | 棕→绿 | 肥沃度% |
| elevation | 蓝→棕→白 | 高度值 |
| connectivity | 红→黄→绿 | 连通性% |
| nodeDepletion | 绿→黄→红 | 消耗% |

## 6. 瓦片信息提示 (TileInspector)

### 工具感知上下文
| 工具 | 标题示例 | 属性 |
|-----|--------|------|
| farm | Farm Site - fertility: 78.5% | 肥沃度 |
| warehouse | Warehouse Site - connectivity: 92.1% | 连通性 |
| quarry | Quarry Site - elevation: 45.3m | 高度 |
| select | GRASS / ROAD | 类型 |

提示内容: 位置, 海拔, 湿度%, 建筑信息

### 移除误导性 B/R/T 提示 (HW7 R3 A3)

`SceneRenderer.js` line ~2259 的 footer `"B = build · R = road ·
T = fertility"` 被删除（无 `B` 全局键绑定；`R` 是 reset camera；
`T` 是 terrain overlay）。替换为正确的 `"Press 1-12 to select a build
tool"`，与 Help 对话框 Controls tab 和 BuildToolbar hotkey legend 对
齐。

## 7. HUD 架构 (HUDController)

### 状态栏 (32px 高, 顶部固定)
1. 资源 (食物, 木材, 石头, 草本) + 进度条
2. 工人计数
3. 存活时间和分数
4. 场景目标
5. AI 芯片
6. 故事讲述者条
7. 操作消息

### Priority Chip Resize Observer (HW7 R3 A6 + hotfix Batch C + iter2 #1)

`HUDController` 用 ResizeObserver 监听状态栏宽度，当资源 chip 列宽度
不足时按优先级隐藏低优先级 chip。`scenarioGoalChips()` 现在返回
`name + count` 字段，每个 chip 渲染为：

```html
<span class="hud-goal-chip-name">farms </span>
<span class="hud-goal-chip-count">0/6</span>
```

`title=` 属性始终携带完整 label 用于 hover。@media 断点策略：

- `≤1366px (≥1025px)`：`min-width:0 + font-size:10px` 让 chip flex-wrap
  实际触发
- `≤1280px (≥1025px)`：隐藏 `.hud-goal-chip-name` (icon-only fold)，
  让全部 6 chip 在最窄笔记本上并排
- iter2 #1：在 1280×720 band 用 wrap-detect priority hider 进一步收紧

### 资源速率徽章
- 计算周期: 3 秒
- 单位: /分钟
- 格式: `▲ +42.3/min` 或 `▼ -15.6/min`

### Threat Anchor (HW7 R3 A7 P1 #7)

殖民地健康卡威胁标签从 `"Threat: 50%"` 改为
**`"Threat 50% (raid at 80%)"`** —  让裸百分比相对已发布的 80% raid
inflection 显示为可操作信息。

### Themed Scrollbar (HW7 R3 A6 P1 #6)

`index.html` 加 wildcard `*::-webkit-scrollbar`（8px）+
`*::-webkit-scrollbar-thumb`（rgba(58,160,255,0.28)）+ Firefox
`* { scrollbar-color, scrollbar-width: thin }`，使 Best Runs / Colony
Inspector / Settings 任意 scroll 容器都用上深色 accent 色板。

### 1060px Sidebar Polish (HW7 hotfix iter5 Gap B)

在 1025–1080 px 视口收紧 sidebar overflow，避免 chip / 控件被裁切。

### 1280 Icon-Only Chip (HW7 hotfix iter5 Gap A)

广义化 extractor-saturated highlight trigger，让 1280 px 以下视口的
chip name 折叠更早生效。

### Toast Z-Order (HW7 R3 A6 P1 #4)

`#floatingToastLayer { z-index: 25 }`（注释明确说明必须 > `#entityFocusOverlay`
z:12），让 build / death / milestone toast 在 worker focus 卡之上渲
染而不是被遮挡。

### 殖民地健康卡

`[THRIVING] Day 5 | Food: +12/min | 8 idle | Threat 15% (raid at 80%)`

状态: `threat<20%` (thriving) / `<50%` (stable) / `<70%` (struggling) /
`>=70%` (crisis)

## 8. 侧边栏面板

### 4 个选项卡
| 面板 | 内容 |
|-----|------|
| Build | 工具网格, 成本, 规则 |
| Colony | 健康卡, 故事讲述者, 资源, **Population (含 Recruit 按钮)** |
| Debug | AI 决策, 交换, 性能, **Dev Entity Inject (?dev=1)** |
| Settings | 渲染选项, 摄像机, 地图 |

### Recruit Button on Right Sidebar (HW7 hotfix iter4 Batch E)

`#recruitOneSidebarBtn` + `#autoRecruitSidebarToggle` +
`#recruitStatusSidebarVal` 加在 always-open `data-panel-key="population"`
卡内（`index.html` ~line 2873）。Pre-fix 时 `#recruitOneBtn` 埋在
`Settings > Dev Tools > Population Control` 嵌套折叠的 dev-only 面板
里，玩家无从发现。`BuildToolbar.#setupRecruitControls` 同时解析新的
sidebar 节点和老的 dev-panel 节点，两个按钮共享一个 `handleRecruitClick`
闭包（食物 / 成本 gate + queue clamp）。Disabled tooltip：
`"Need 25 food (have 12)"` / `"Recruit queue full (12/12)"`。

### Disabled Build Tool Tooltip (HW7 R3 A6 P1 #2)

`BuildToolbar.describeBuildToolCostBlock(toolKey, resources)` 返回
`"Need 5 wood (have 0)"` / `"Need 8 wood (have 3) and 3 stone (have 0)"`。
Cost-blocked sync loop 把按钮 pre-existing title 缓存到
`data-cost-title-original`，把 deficit 字符串写到 `title=`；un-blocking
恢复缓存的 title。Disabled Clinic 上 hover 现在显示
`"Need 6 wood (have 0) and 2 herbs (have 0)"` 而不是沉默。

## 9. AI 调试面板 (?dev=1)

### AIDecisionPanel
- 因果链 (证据)
- 环境指令 (天气, 张力, 焦点)
- 组策略 (workers/traders/herbivores/etc)
- 可折叠详情, 记住打开状态

### AIExchangePanel
- 最新交换 (Policy/Environment)
- 完整提示 (系统 + 用户)
- 原始输出
- 解析前/保护后
- 错误日志 (最后 5 个)

### PerformancePanel — Top Hot Systems (HW7 R1 A2)

Top systems table 显示 `window.__perftrace.topSystems` 的 per-system
avg / peak ms（sliding window），并在 ?dev=1 / Ctrl+Shift+D 下增加
**Dev: Entity Inject 子面板**（hotfix Batch C）用于 stress test 中
按需注入实体。

### AI Debug 按钮
点击时: 打开侧边栏 + 切换到 Debug 选项卡

### #devDock 强制隐藏 (HW7 hotfix iter4 Batch F — Issue #10)

`<section id="devDock">` 在 production AND dev mode 都被 CSS
`display: none !important;` 隐藏。GameApp 的 `#isNodeInUiArea` /
`#shouldIgnoreGlobalShortcut` 移除了对 #devDock 的 closest() walk；
`GameStateOverlay` 的 `getElementById("devDock")` null-guard 仍存但
无可见效果（CSS `!important` 胜过 inline style）。其他 dev surfaces
（Debug sidebar tab / Settings dev sub-panels / AI Decision/Exchange/Policy
floating panels / "Why no WHISPER?" badge）全部保留。

## 10. 键盘快捷键

### 完整列表
| 快捷键 | 操作 | 场景 |
|-------|-----|------|
| 1-0/-/= | 工具选择 | Active |
| Space | 暂停/继续 | Active |
| Esc | 清除选择 | 任何 |
| T | 地形覆盖切换 (5-mode cycle) | Active |
| L | 热力透镜切换 | Active |
| Home | 重置摄像机 | Active |
| Ctrl+Z | 撤销 | Active |
| Ctrl+Y | 重做 | Active |
| Ctrl+Shift+D | 切换 dev mode | 任何 |
| F1 | Help dialog (含 Heat Lens 4-bullet 章节) | 任何 |

### 工具映射
- Digit1: road
- Digit2: farm
- Digit3: lumber
- Digit4: warehouse
- Digit5: wall
- Digit6: bridge
- Digit7: erase
- Digit8: quarry
- Digit9: herb_garden
- Digit0: kitchen
- Minus: smithy
- Equal: clinic

### Click Router (HW7 R3 A3 P0)

`BuildToolbar` 第二次点击已激活的 build 工具会切回 `controls.tool =
"select"`（status: "Tool deselected — left click now inspects tiles."）。
之前唯一退出 placement 模式的方式是按 Select 按钮，first-impression
reviewer 从未发现，导致建造完想检查瓦片时全是 ghost placement。

`ENTITY_PICK_GUARD_PX` 从 36 → **14** (HW7 R2 A3)，匹配 sprite ~12px
大小，避免误把 worker 当作 LMB 目标（修真因，R1 之前以为是另一个原因）。

---

## 11. SceneRenderer 性能改造 (HW7 R1+R2 A2)

- `__pressureLensSignature` scratch reuse (R2)
- entityMesh refresh ≥1/30s throttle (R2)
- texture 分辨率减半 (R1)
- entityStackJitter 单次/帧 (R1)
- AgentDirector 0.5s sim-time cadence gate (R2)
- ProgressionSystem 0.25s dt-accumulator gate (R2)

---

## 完整参考 — Project Utopia v0.10.1 渲染与 UI 系统
